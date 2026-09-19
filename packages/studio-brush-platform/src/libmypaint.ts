import { standardZigzagStrokeSamples } from "./raster-compile";

import type { LibMypaintDirtyFrame, LibMypaintRaw } from "./libmypaint/index";
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

export type { LibMypaintDirtyFrame } from "./libmypaint/index";

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

export interface LibMypaintIncrementalStrokeOptions {
  width: number;
  height: number;
  /** Seed for libmypaint's stroke-local random state. */
  seed?: number;
  /** Number of 16 ms idle samples used to resolve slow-tracking tails. */
  finishTailSteps?: number;
}

export interface LibMypaintIncrementalAppendResult {
  /** Number of source samples accepted by this append. */
  readonly sampleCount: number;
  /** Number of samples for which libmypaint reported visible paint. */
  readonly paintedSamples: number;
}

export interface LibMypaintIncrementalStrokeSession {
  readonly width: number;
  readonly height: number;
  readonly settings: ApplyMybSettingsResult;
  /** Append absolute-time samples. Chunk boundaries never alter dtime semantics. */
  append(samples: readonly RasterStrokeSample[]): LibMypaintIncrementalAppendResult;
  /** Fresh straight-alpha RGBA8 snapshot of the current bounded surface. */
  frame(): Uint8Array;
  /** Consume changed pixels since the last successful take; null when no native tiles changed. */
  takeDirtyFrame(): LibMypaintDirtyFrame | null;
  /** Finish the tail once, then consume only its pending dirty pixels (never a full-frame copy). */
  finishDirty(): LibMypaintDirtyFrame | null;
  /**
   * Resolve the configured slow-tracking tail once and return the final frame.
   * Repeated calls are idempotent and never advance the brush a second time.
   */
  finish(): Uint8Array;
  /** Idempotently release the brush and surface allocated in WASM. */
  dispose(): void;
}

export const LIBMYPAINT_MAX_SURFACE_DIMENSION = 4_096;
export const LIBMYPAINT_MAX_SURFACE_PIXELS = 4_194_304;
// The pinned bridge reseeds libc's module-global RNG. Two active high-level strokes must not
// interleave on one WASM instance; separate workers/instances remain independent.
const activeLibMypaintModules = new WeakSet<object>();

function positiveSurfaceDimension(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > LIBMYPAINT_MAX_SURFACE_DIMENSION) {
    throw new RangeError("libmypaint " + name + " must be a positive integer no larger than 4096");
  }
  return value;
}

function finiteSample(sample: RasterStrokeSample): boolean {
  return Number.isFinite(sample.x)
    && Number.isFinite(sample.y)
    && Number.isFinite(sample.pressure)
    && Number.isFinite(sample.tiltX)
    && Number.isFinite(sample.tiltY)
    && Number.isFinite(sample.tMs);
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampSignedUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

/**
 * Persistent libmypaint session for a live/Worker product lane.
 *
 * The old parity renderer recreated a brush+surface for every whole-stroke call. Product input
 * arrives in coalesced pointer batches, so a real provider needs one brush state and one bounded
 * surface for the complete stroke. This session preserves exactly the old timing/tail semantics
 * while making batching explicit; tests lock batch partitioning to byte-identical final pixels.
 *
 * takeDirtyFrame()/finishDirty() copy only the union of native end_atomic dirty bounds.
 * frame()/finish() remain explicit whole-surface reference/export snapshots. Patch consumers
 * replace RGBA bytes at x/y; source-over blending would double-apply translucent paint.
 */
export function createLibMypaintIncrementalStrokeSession(
  lmp: LibMypaintRaw,
  document: LibMypaintBrushDocument,
  options: LibMypaintIncrementalStrokeOptions,
): LibMypaintIncrementalStrokeSession {
  const width = positiveSurfaceDimension(options.width, "width");
  const height = positiveSurfaceDimension(options.height, "height");
  if (width * height > LIBMYPAINT_MAX_SURFACE_PIXELS) {
    throw new RangeError("libmypaint stroke surface exceeds the 16 MiB RGBA8 budget");
  }
  const seed = options.seed ?? 7;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("libmypaint seed must be an unsigned 32-bit integer");
  }
  const finishTailSteps = options.finishTailSteps ?? 8;
  if (!Number.isSafeInteger(finishTailSteps) || finishTailSteps < 0 || finishTailSteps > 64) {
    throw new RangeError("libmypaint finishTailSteps must be an integer in [0, 64]");
  }

  const moduleIdentity = lmp.module;
  if (activeLibMypaintModules.has(moduleIdentity)) {
    throw new Error("libmypaint WASM instance already has an active stroke; finish/dispose it or use a separate instance");
  }
  activeLibMypaintModules.add(moduleIdentity);
  let ownsModule = true;
  let brush = 0;
  let surface = 0;
  function releaseModule(): void {
    if (!ownsModule) return;
    ownsModule = false;
    activeLibMypaintModules.delete(moduleIdentity);
  }
  function freeHandles(): void {
    const previousSurface = surface;
    const previousBrush = brush;
    surface = 0;
    brush = 0;
    try {
      if (previousSurface) lmp.surfaceFree(previousSurface);
    } finally {
      try { if (previousBrush) lmp.brushFree(previousBrush); } finally { releaseModule(); }
    }
  }
  let settings: ApplyMybSettingsResult;
  try {
    brush = lmp.brushNew();
    if (!brush) throw new Error("libmypaint could not allocate a brush");
    surface = lmp.surfaceNew(width, height);
    if (!surface) throw new Error("libmypaint could not allocate " + width + "x" + height + " surface");
    settings = applyMybSettings(lmp, brush, document);
    lmp.brushNewStroke(brush, seed);
  } catch (error) {
    try { freeHandles(); } catch { /* Retain the original allocation/configuration error. */ }
    throw error;
  }

  let previousTMs: number | undefined;
  let lastSample: RasterStrokeSample | null = null;
  let phase: "active" | "finished" | "failed" | "disposed" = "active";
  function assertUsable(operation: string): void {
    if (phase === "disposed" || phase === "failed") {
      throw new Error("libmypaint stroke session is " + phase + "; cannot " + operation);
    }
  }
  function fail(error: unknown): never {
    phase = "failed";
    try { freeHandles(); } catch { /* Teardown cannot replace the original native error. */ }
    throw error;
  }
  function append(samples: readonly RasterStrokeSample[]): LibMypaintIncrementalAppendResult {
    assertUsable("append");
    if (phase === "finished") throw new Error("libmypaint stroke session is finished; cannot append");
    // Validate the entire batch before painting. A bad final sample must not leave an
    // undocumented partially-accepted prefix on the native surface.
    let clock = previousTMs ?? 0;
    for (const sample of samples) {
      if (!finiteSample(sample)) throw new TypeError("libmypaint stroke sample contains a non-finite channel");
      if (sample.tMs < clock) throw new RangeError("libmypaint sample timestamps must be nonnegative and monotonic");
      clock = sample.tMs;
    }
    let paintedSamples = 0;
    try {
      for (const sample of samples) {
        const dtime = previousTMs === undefined ? 0.0001 : (sample.tMs - previousTMs) / 1000;
        const accepted = {
          x: sample.x, y: sample.y, pressure: clampUnit(sample.pressure),
          tiltX: clampSignedUnit(sample.tiltX), tiltY: clampSignedUnit(sample.tiltY), tMs: sample.tMs,
        };
        paintedSamples += lmp.strokeTo(
          brush, surface, accepted.x, accepted.y, accepted.pressure,
          accepted.tiltX, accepted.tiltY, dtime,
        ) ? 1 : 0;
        previousTMs = accepted.tMs;
        lastSample = accepted; // Never retain a caller-owned mutable sample for the finish tail.
      }
    } catch (error) { return fail(error); }
    return Object.freeze({ sampleCount: samples.length, paintedSamples });
  }
  function frame(): Uint8Array {
    assertUsable("read frame");
    try {
      const pixels = lmp.surfaceToRgba8(surface, width, height);
      if (!(pixels instanceof Uint8Array) || pixels.byteLength !== width * height * 4) {
        throw new Error("libmypaint returned an invalid RGBA8 surface");
      }
      return pixels;
    } catch (error) { return fail(error); }
  }
  function resolveTail(): void {
    assertUsable("finish");
    if (phase === "active") {
      try {
        if (lastSample) {
          for (let step = 0; step < finishTailSteps; step += 1) {
            lmp.strokeTo(brush, surface, lastSample.x, lastSample.y, lastSample.pressure, 0, 0, 0.016);
          }
        }
        phase = "finished";
        releaseModule();
      } catch (error) { return fail(error); }
    }
  }
  function takeDirtyFrame(): LibMypaintDirtyFrame | null {
    assertUsable("read dirty frame");
    try { return lmp.surfaceTakeDirtyFrame(surface); } catch (error) { return fail(error); }
  }
  function finish(): Uint8Array { resolveTail(); return frame(); }
  function finishDirty(): LibMypaintDirtyFrame | null { resolveTail(); return takeDirtyFrame(); }
  return {
    width, height, settings, append, frame, finish, takeDirtyFrame, finishDirty,
    dispose() {
      if (phase === "disposed") return;
      phase = "disposed";
      freeHandles();
    },
  };
}

/**
 * Render one deterministic stroke with a `.myb`-programmed libmypaint brush.
 * A fresh brush is created per render and the pinned bridge resets both brush dynamics
 * and the module-global libc RNG. Only one active session can own each WASM module.
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
  const session = createLibMypaintIncrementalStrokeSession(lmp, document, {
    width,
    height,
    seed,
  });
  try {
    session.append(samples);
    return {
      frame: session.finish(),
      width,
      height,
      settings: session.settings,
    };
  } finally {
    session.dispose();
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
