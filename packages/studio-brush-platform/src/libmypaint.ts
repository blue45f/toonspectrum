import { standardZigzagStrokeSamples } from "./raster-compile";

import type { LibMypaintRaw } from "./libmypaint/index";
import type { RasterStrokeSample } from "./raster-compile";

/**
 * High-level libmypaint lane (ADR-0011 lane 11): programs a pinned
 * libmypaint v1.6.1 wasm brush from a parsed `.myb` v3 document through the
 * injection API and renders deterministic strokes for the MyPaint-reference
 * parity lab (tests/benchmarks/results/libmypaint-parity.json).
 *
 * The json-c parser inside libmypaint is bypassed at build time, so the ONLY
 * settings path is injection — every dimension the document carries is either
 * applied or surfaced in the result (zero silent loss, mirroring
 * raster-compile.ts's honesty contract).
 *
 * Sample-feed contract (mirrors HokusaiCanvas so cross-engine renders are
 * apples-to-apples):
 * - first sample lands with dtime 0.0001 s,
 * - subsequent samples use (tMs delta) / 1000,
 * - finish pumps up to 8 idle events of 16 ms at the last position/pressure
 *   so slow-tracking tails resolve (the Hokusai finishStroke behavior).
 */

export type LibMypaintCurvePoint = [number, number];

export interface LibMypaintSettingDocument {
  base_value: number;
  inputs: Record<string, LibMypaintCurvePoint[]>;
}

/** Structural subset of a `.myb` v3 document (format-gateway myb.ts output). */
export interface LibMypaintBrushDocument {
  settings: Record<string, LibMypaintSettingDocument>;
}

export interface ApplyMybSettingsResult {
  /** Settings whose base value (and curves, if any) reached the brush. */
  applied: string[];
  /** `.myb` settings libmypaint 1.6.1 does not know — never silently lost. */
  unknownSettings: string[];
  /** `setting.inputs.input` pairs whose input axis is unknown. */
  unknownInputs: string[];
}

/**
 * Program a brush from a parsed `.myb` document via the injection API.
 * The brush keeps its MyPaint stock defaults for untouched dimensions.
 */
export function applyMybSettings(
  lmp: LibMypaintRaw,
  brush: number,
  document: LibMypaintBrushDocument,
): ApplyMybSettingsResult {
  const settingCount = lmp.settingCount();
  const inputCount = lmp.inputCount();
  const applied: string[] = [];
  const unknownSettings: string[] = [];
  const unknownInputs: string[] = [];

  for (const name of Object.keys(document.settings).sort()) {
    const setting = document.settings[name];
    if (!setting) continue;
    const settingId = lmp.settingId(name);
    if (settingId < 0 || settingId >= settingCount) {
      unknownSettings.push(name);
      continue;
    }
    lmp.brushSetBaseValue(brush, settingId, setting.base_value);
    for (const inputName of Object.keys(setting.inputs).sort()) {
      const curve = setting.inputs[inputName];
      if (!curve) continue;
      const inputId = lmp.inputId(inputName);
      if (inputId < 0 || inputId >= inputCount) {
        unknownInputs.push(`${name}.inputs.${inputName}`);
        continue;
      }
      lmp.brushSetMappingN(brush, settingId, inputId, curve.length);
      curve.forEach(([x, y], index) => {
        lmp.brushSetMappingPoint(brush, settingId, inputId, index, x, y);
      });
    }
    applied.push(name);
  }

  return { applied, unknownSettings, unknownInputs };
}

export interface RenderLibMypaintStrokeOptions {
  width?: number;
  height?: number;
  /** Seed for libc rand() (smudge sampling); pairs with HokusaiCanvas seed. */
  seed?: number;
  sampleCount?: number;
  /** Custom sample path; defaults to `standardZigzagStrokeSamples`. */
  samples?: readonly RasterStrokeSample[];
}

export interface RenderLibMypaintStrokeResult {
  /** Straight-alpha RGBA8, width*height*4. */
  frame: Uint8Array;
  width: number;
  height: number;
  settings: ApplyMybSettingsResult;
}

/**
 * Render one deterministic stroke with a `.myb`-programmed libmypaint brush.
 * A fresh brush is created per render: libmypaint's per-brush RngDouble is
 * seeded only at construction (constant 1000), so reusing one brush across
 * renders would drift its RNG stream and break same-input-same-sha.
 */
export function renderLibMypaintStroke(
  lmp: LibMypaintRaw,
  document: LibMypaintBrushDocument,
  options: RenderLibMypaintStrokeOptions = {},
): RenderLibMypaintStrokeResult {
  const width = options.width ?? 192;
  const height = options.height ?? 96;
  const seed = options.seed ?? 7;
  const sampleCount = options.sampleCount ?? 96;
  const samples =
    options.samples ?? standardZigzagStrokeSamples(width, height, sampleCount);

  const brush = lmp.brushNew();
  const surface = lmp.surfaceNew(width, height);
  try {
    const settings = applyMybSettings(lmp, brush, document);
    lmp.brushNewStroke(brush, seed);

    let previousTMs: number | undefined;
    let lastX = 0;
    let lastY = 0;
    let lastPressure = 0;
    for (const sample of samples) {
      const dtime =
        previousTMs === undefined
          ? 0.0001
          : Math.max(0, sample.tMs - previousTMs) / 1000;
      lmp.strokeTo(
        brush,
        surface,
        sample.x,
        sample.y,
        Math.min(1, Math.max(0, sample.pressure)),
        Math.min(1, Math.max(-1, sample.tiltX)),
        Math.min(1, Math.max(-1, sample.tiltY)),
        dtime,
      );
      previousTMs = sample.tMs;
      lastX = sample.x;
      lastY = sample.y;
      lastPressure = sample.pressure;
    }
    // Pointer-up tail: resolve slow-tracking lag with idle 16 ms events.
    if (samples.length > 0) {
      for (let step = 0; step < 8; step += 1) {
        lmp.strokeTo(brush, surface, lastX, lastY, lastPressure, 0, 0, 0.016);
      }
    }

    return {
      frame: lmp.surfaceToRgba8(surface, width, height),
      width,
      height,
      settings,
    };
  } finally {
    lmp.surfaceFree(surface);
    lmp.brushFree(brush);
  }
}

/* -------------------------------------------------------------------------- *
 * Parity metrics (alpha channel = the cross-engine axis; RGB stays in each
 * engine's native channel space, see mypaint-bridge.c lmp_surface_to_rgba8).
 * -------------------------------------------------------------------------- */

/** Per-column ink mass (sum of alpha down each x column) for an RGBA8 frame. */
export function columnInkProfile(
  frame: Uint8Array,
  width: number,
  height: number,
): number[] {
  const profile = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      profile[x] = (profile[x] ?? 0) + (frame[rowOffset + x * 4 + 3] ?? 0);
    }
  }
  return profile;
}

/** Pearson correlation of two equal-length profiles; NaN-free (0 fallback). */
export function pearsonCorrelation(
  a: readonly number[],
  b: readonly number[],
): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let index = 0; index < n; index += 1) {
    sumA += a[index] ?? 0;
    sumB += b[index] ?? 0;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < n; index += 1) {
    const da = (a[index] ?? 0) - meanA;
    const db = (b[index] ?? 0) - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  if (varianceA === 0 || varianceB === 0) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
}

export interface FrameInkStats {
  /** Sum of alpha over every pixel (0..255 per pixel). */
  totalAlpha: number;
  /** Pixels with alpha > 0. */
  inkedPixels: number;
  /** totalAlpha / (inkedPixels * 255); 0 when nothing is inked. */
  meanInkedAlpha: number;
}

export function frameInkStats(frame: Uint8Array): FrameInkStats {
  let totalAlpha = 0;
  let inkedPixels = 0;
  for (let offset = 3; offset < frame.length; offset += 4) {
    const alpha = frame[offset] ?? 0;
    if (alpha > 0) {
      totalAlpha += alpha;
      inkedPixels += 1;
    }
  }
  return {
    totalAlpha,
    inkedPixels,
    meanInkedAlpha: inkedPixels === 0 ? 0 : totalAlpha / (inkedPixels * 255),
  };
}
