import { BrushCompileError } from "./compile";

import type {
  BrushProgramIR,
  DynamicMappingIR,
} from "@toonspectrum/studio-project-model";

/**
 * BrushProgramIR compiler for the raster-tiles natural-media lane (V12 §6.1).
 *
 * `compileVectorBrush` deliberately rejects `output.target === "raster-tiles"`;
 * this module owns that lane. It lowers a BrushProgramIR — usually one built
 * by the `.myb` importer (studio-format-gateway/myb.ts), whose `sourcePayload`
 * carries the full original document — into the exact libmypaint v3 settings
 * document the Hokusai wasm engine (`new HokusaiBrush(json)`) consumes.
 *
 * Honesty contract (zero silent loss, 품질·손맛 우선 정책):
 * - The accepted setting/input names below are transcribed 1:1 from
 *   hokusai-core 0.3.0 `setting.rs` / `input.rs` (the crate pinned by
 *   packages/studio-hokusai-wasm). Anything outside those sets cannot affect
 *   rendering, so it is surfaced in `unmapped` — never dropped quietly.
 * - Dimensions Hokusai parses but does not evaluate (`restore_color`), and
 *   input axes the wasm sample feed pins to a constant (`viewzoom`,
 *   `barrel_rotation` — see hokusai-core stroke.rs), are surfaced in
 *   `warnings` because the setting survives but its dynamic has no effect.
 * - The compiler never writes to the console; the caller owns presentation.
 */

/** Every `.myb` setting hokusai-core 0.3.0 parses AND evaluates. */
export const HOKUSAI_EVALUATED_SETTINGS: ReadonlySet<string> = new Set([
  "opaque",
  "opaque_multiply",
  "opaque_linearize",
  "radius_logarithmic",
  "hardness",
  "anti_aliasing",
  "dabs_per_basic_radius",
  "dabs_per_actual_radius",
  "dabs_per_second",
  "radius_by_random",
  "speed1_slowness",
  "speed2_slowness",
  "speed1_gamma",
  "speed2_gamma",
  "offset_by_random",
  "offset_by_speed",
  "offset_by_speed_slowness",
  "slow_tracking",
  "slow_tracking_per_dab",
  "tracking_noise",
  "color_h",
  "color_s",
  "color_v",
  "change_color_h",
  "change_color_l",
  "change_color_hsl_s",
  "change_color_v",
  "change_color_hsv_s",
  "smudge",
  "smudge_length",
  "smudge_length_log",
  "smudge_radius_log",
  "eraser",
  "stroke_threshold",
  "stroke_duration_logarithmic",
  "stroke_holdtime",
  "custom_input",
  "custom_input_slowness",
  "elliptical_dab_ratio",
  "elliptical_dab_angle",
  "direction_filter",
  "lock_alpha",
  "colorize",
  "snap_to_pixel",
  "pressure_gain_log",
  "posterize",
  "posterize_num",
  "paint_mode",
  "smudge_transparency",
  "offset_y",
  "offset_x",
  "offset_angle",
  "offset_angle_asc",
  "offset_angle_view",
  "offset_angle_2",
  "offset_angle_2_asc",
  "offset_angle_2_view",
  "offset_angle_adj",
  "offset_multiplier",
  "gridmap_scale",
  "gridmap_scale_x",
  "gridmap_scale_y",
]);

/** Settings hokusai-brush 0.3.0 parses but the stroke engine never reads. */
export const HOKUSAI_PARSED_INERT_SETTINGS: ReadonlySet<string> = new Set([
  "restore_color",
]);

/** Every dynamic-input name hokusai-core 0.3.0 recognises inside `inputs`. */
export const HOKUSAI_INPUT_NAMES: ReadonlySet<string> = new Set([
  "pressure",
  "speed1",
  "speed2",
  "random",
  "stroke",
  "direction",
  "tilt",
  "tilt_declination",
  "tilt_ascension",
  "direction_angle",
  "attack_angle",
  "gridmap_x",
  "gridmap_y",
  "custom",
  "tilt_declinationx",
  "tilt_declinationy",
  "viewzoom",
  "barrel_rotation",
  "brush_radius",
]);

/**
 * Inputs the wasm `addSample(x, y, pressure, tiltX, tiltY, timeMs)` feed pins
 * to a constant (hokusai-core stroke.rs sets viewzoom/barrel_rotation to 0):
 * a curve on these parses fine but can never move.
 */
export const HOKUSAI_UNDRIVEN_INPUTS: ReadonlySet<string> = new Set([
  "viewzoom",
  "barrel_rotation",
]);

const HOKUSAI_PROVIDER_ID = "hokusai-natural-media";

export type MybCurvePoint = [number, number];

export interface HokusaiSettingValue {
  base_value: number;
  inputs: Record<string, MybCurvePoint[]>;
}

/** A `.myb` v3 document restricted to what Hokusai actually evaluates. */
export interface HokusaiBrushSettings {
  version: 3;
  group?: string;
  comment?: string;
  parent_brush_name?: string;
  settings: Record<string, HokusaiSettingValue>;
}

export interface CompiledRasterBrush {
  program: BrushProgramIR;
  hokusaiSettings: HokusaiBrushSettings;
  /** Deterministic serialization consumed verbatim by `new HokusaiBrush(json)`. */
  mybJson: string;
  /** MYB dimensions that cannot reach Hokusai rendering. Sorted, exhaustive. */
  unmapped: string[];
  /** Dimensions that reach Hokusai but are inert or approximated. Sorted. */
  warnings: string[];
}

function base64ToBytes(base64: string): Uint8Array {
  let binary: string;
  try {
    binary = globalThis.atob(base64);
  } catch (error) {
    throw new BrushCompileError(
      `sourcePayload.base64 is not valid base64: ${(error as Error).message}`,
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

interface RawMybSetting {
  base_value: number;
  inputs: Record<string, MybCurvePoint[]>;
}

interface RawMybDocument {
  version: number;
  group?: string;
  comment?: string;
  parent_brush_name?: string;
  settings: Record<string, RawMybSetting>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCurve(value: unknown, context: string): MybCurvePoint[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new BrushCompileError(
      `${context} must be an array of at least 2 [x, y] points`,
    );
  }
  return value.map((point, index) => {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number" ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) {
      throw new BrushCompileError(
        `${context}[${index}] must be a finite [x, y] pair`,
      );
    }
    return [point[0], point[1]];
  });
}

/** Structural `.myb` v3 validation without a schema dependency; loud on error. */
function parseMybDocument(bytes: Uint8Array, programId: string): RawMybDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch (error) {
    throw new BrushCompileError(
      `program ${programId} sourcePayload is not UTF-8 JSON: ${(error as Error).message}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new BrushCompileError(`program ${programId} .myb payload is not an object`);
  }
  if (parsed["version"] !== 3) {
    throw new BrushCompileError(
      `program ${programId} .myb version ${String(parsed["version"])} unsupported (v3 only); refusing a lossy compile`,
    );
  }
  const rawSettings = parsed["settings"];
  if (!isRecord(rawSettings)) {
    throw new BrushCompileError(`program ${programId} .myb has no settings object`);
  }
  const settings: Record<string, RawMybSetting> = {};
  for (const [name, rawSetting] of Object.entries(rawSettings)) {
    if (!isRecord(rawSetting) || typeof rawSetting["base_value"] !== "number") {
      throw new BrushCompileError(
        `program ${programId} setting ${name} lacks a numeric base_value`,
      );
    }
    const inputs: Record<string, MybCurvePoint[]> = {};
    const rawInputs = rawSetting["inputs"] ?? {};
    if (!isRecord(rawInputs)) {
      throw new BrushCompileError(
        `program ${programId} setting ${name} inputs must be an object`,
      );
    }
    for (const [inputName, curve] of Object.entries(rawInputs)) {
      inputs[inputName] = parseCurve(curve, `setting ${name} input ${inputName}`);
    }
    settings[name] = { base_value: rawSetting["base_value"], inputs };
  }
  return {
    version: 3,
    ...(typeof parsed["group"] === "string" ? { group: parsed["group"] } : {}),
    ...(typeof parsed["comment"] === "string" ? { comment: parsed["comment"] } : {}),
    ...(typeof parsed["parent_brush_name"] === "string"
      ? { parent_brush_name: parsed["parent_brush_name"] }
      : {}),
    settings,
  };
}

function sortedRecord<T>(entries: Array<[string, T]>): Record<string, T> {
  const record: Record<string, T> = {};
  for (const [key, value] of [...entries].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )) {
    record[key] = value;
  }
  return record;
}

interface LoweringAccumulator {
  settings: Array<[string, HokusaiSettingValue]>;
  unmapped: string[];
  warnings: string[];
}

/** Cross-check one MYB setting against the Hokusai-evaluated sets. */
function lowerMybSetting(
  name: string,
  setting: RawMybSetting,
  accumulator: LoweringAccumulator,
): void {
  const known =
    HOKUSAI_EVALUATED_SETTINGS.has(name) || HOKUSAI_PARSED_INERT_SETTINGS.has(name);
  if (!known) {
    // Hokusai's parser would stash this losslessly but never evaluate it, so
    // it cannot reach pixels. Surface the whole dimension (curves included).
    accumulator.unmapped.push(name);
    for (const inputName of Object.keys(setting.inputs)) {
      accumulator.unmapped.push(`${name}.inputs.${inputName}`);
    }
    return;
  }
  if (HOKUSAI_PARSED_INERT_SETTINGS.has(name)) {
    accumulator.warnings.push(
      `setting ${name}: parsed by hokusai 0.3.0 but never evaluated by its stroke engine`,
    );
  }
  const inputs: Array<[string, MybCurvePoint[]]> = [];
  for (const [inputName, curve] of Object.entries(setting.inputs)) {
    if (!HOKUSAI_INPUT_NAMES.has(inputName)) {
      accumulator.unmapped.push(`${name}.inputs.${inputName}`);
      continue;
    }
    if (HOKUSAI_UNDRIVEN_INPUTS.has(inputName)) {
      accumulator.warnings.push(
        `setting ${name}: input ${inputName} is pinned to a constant by the wasm sample feed; its curve cannot move`,
      );
    }
    inputs.push([inputName, curve]);
  }
  accumulator.settings.push([
    name,
    { base_value: setting.base_value, inputs: sortedRecord(inputs) },
  ]);
}

/** Multiplier a DynamicMappingIR produces at LUT tap `index`. */
function mappingValueAt(mapping: DynamicMappingIR, index: number): number {
  const tap = mapping.curve[index] ?? 0;
  return mapping.min + (mapping.max - mapping.min) * tap;
}

/**
 * Lower a pressure DynamicMappingIR back into a libmypaint delta curve.
 * `toDelta` converts the mapping's absolute multiplier into the delta the
 * `.myb` setting adds onto its base value.
 */
function mappingToMybCurve(
  mapping: DynamicMappingIR,
  toDelta: (value: number) => number,
): MybCurvePoint[] {
  const points: MybCurvePoint[] = [];
  const taps = mapping.curve.length;
  for (let index = 0; index < taps; index += 1) {
    const x = taps === 1 ? 0 : index / (taps - 1);
    points.push([x, toDelta(mappingValueAt(mapping, index))]);
  }
  return points;
}

/**
 * Synthesize `.myb` settings from IR graphs when no `.myb` payload exists.
 * Only faithful dimensions are emitted; the rest is surfaced, never guessed.
 */
function lowerProgramGraphs(
  program: BrushProgramIR,
  accumulator: LoweringAccumulator,
): void {
  // libmypaint default natural-log radius; per-stroke baseSizePx scaling is a
  // render-time concern (setRadiusLog), so compile pins a deterministic base.
  const baseRadiusLog = 2.0;
  const radiusInputs: Array<[string, MybCurvePoint[]]> = [];
  const opaqueInputs: Array<[string, MybCurvePoint[]]> = [];

  program.sizeDynamics.forEach((mapping, index) => {
    if (mapping.input !== "pressure") {
      accumulator.unmapped.push(`sizeDynamics[${index}].input=${mapping.input}`);
      return;
    }
    if (radiusInputs.length > 0) {
      accumulator.unmapped.push(
        `sizeDynamics[${index}]: additional pressure mapping (hokusai takes one pressure curve per setting)`,
      );
      return;
    }
    // Size multiplier k lowers to a natural-log radius delta ln(k).
    radiusInputs.push([
      "pressure",
      mappingToMybCurve(mapping, (value) => Math.log(Math.max(value, 0.05))),
    ]);
  });
  program.flowDynamics.forEach((mapping, index) => {
    if (mapping.input !== "pressure") {
      accumulator.unmapped.push(`flowDynamics[${index}].input=${mapping.input}`);
      return;
    }
    if (opaqueInputs.length > 0) {
      accumulator.unmapped.push(
        `flowDynamics[${index}]: additional pressure mapping (hokusai takes one pressure curve per setting)`,
      );
      return;
    }
    // Flow value v (already 0..1) lowers to a delta against base opacity 1.
    opaqueInputs.push([
      "pressure",
      mappingToMybCurve(mapping, (value) => Math.min(1, Math.max(0, value)) - 1),
    ]);
  });

  accumulator.settings.push([
    "radius_logarithmic",
    { base_value: baseRadiusLog, inputs: sortedRecord(radiusInputs) },
  ]);
  accumulator.settings.push([
    "opaque",
    { base_value: 1, inputs: sortedRecord(opaqueInputs) },
  ]);
  accumulator.settings.push([
    "hardness",
    { base_value: program.tip.hardness, inputs: {} },
  ]);
  // Photoshop-style spacing (% of diameter between stamps) → dabs per radius.
  const dabsPerRadius = Math.min(64, Math.max(0.5, 100 / (2 * program.tip.spacingPct)));
  accumulator.settings.push([
    "dabs_per_actual_radius",
    { base_value: dabsPerRadius, inputs: {} },
  ]);
  if (program.tip.kind !== "round") {
    accumulator.unmapped.push(
      `tip.kind=${program.tip.kind} (hokusai has no stamp/image tip textures)`,
    );
  }
  if (program.tip.angleJitterDeg > 0) {
    accumulator.unmapped.push("tip.angleJitterDeg (no faithful hokusai analog)");
  }

  if (program.stabilizer.kind !== "none" && program.stabilizer.strength > 0) {
    // Inverse of the importer's slow_tracking/10 → strength mapping.
    accumulator.settings.push([
      "slow_tracking",
      { base_value: program.stabilizer.strength * 10, inputs: {} },
    ]);
    accumulator.warnings.push(
      "stabilizer lowered to in-engine slow_tracking; do not re-apply the JS stabilizer on this lane",
    );
  }
  if (program.stabilizer.predictionMs > 0) {
    accumulator.unmapped.push(
      "stabilizer.predictionMs (hokusai has no prediction dimension)",
    );
  }

  if (program.mixing.kind === "smudge" && program.mixing.strength > 0) {
    accumulator.settings.push([
      "smudge",
      { base_value: program.mixing.strength, inputs: {} },
    ]);
  } else if (program.mixing.kind === "wet") {
    accumulator.unmapped.push(
      "mixing.kind=wet (hokusai smudge is not a wet-wash model; refusing an approximation)",
    );
  }
}

/**
 * Compile a raster-lane BrushProgramIR into Hokusai brush settings.
 *
 * When `sourcePayload` carries a `.myb` v3 document (the importer's output),
 * that document is authoritative and is cross-checked dimension-by-dimension
 * against the setting/input sets Hokusai actually evaluates. Without a
 * payload, the IR graphs are lowered instead. Both paths are deterministic:
 * same program → byte-identical `mybJson`.
 */
export function compileRasterBrush(program: BrushProgramIR): CompiledRasterBrush {
  const rasterLane =
    program.output.target === "raster-tiles" ||
    program.providerPreference.includes(HOKUSAI_PROVIDER_ID);
  if (!rasterLane) {
    throw new BrushCompileError(
      `program ${program.id} targets ${program.output.target} without a ${HOKUSAI_PROVIDER_ID} preference; use compileVectorBrush for the vector lane`,
    );
  }

  const accumulator: LoweringAccumulator = {
    settings: [],
    unmapped: [],
    warnings: [],
  };
  let group: string | undefined;
  let comment: string | undefined;
  let parentBrushName: string | undefined;

  if (program.sourcePayload && program.sourcePayload.format === "myb-v3") {
    const document = parseMybDocument(
      base64ToBytes(program.sourcePayload.base64),
      program.id,
    );
    group = document.group;
    comment = document.comment;
    parentBrushName = document.parent_brush_name;
    for (const name of Object.keys(document.settings).sort()) {
      const setting = document.settings[name];
      if (setting) lowerMybSetting(name, setting, accumulator);
    }
  } else {
    if (program.sourcePayload) {
      accumulator.warnings.push(
        `sourcePayload.format=${program.sourcePayload.format} is not myb-v3; compiled from IR graphs instead`,
      );
    }
    lowerProgramGraphs(program, accumulator);
  }

  const hokusaiSettings: HokusaiBrushSettings = {
    version: 3,
    ...(group !== undefined ? { group } : {}),
    ...(comment !== undefined ? { comment } : {}),
    ...(parentBrushName !== undefined ? { parent_brush_name: parentBrushName } : {}),
    settings: sortedRecord(accumulator.settings),
  };

  return {
    program,
    hokusaiSettings,
    mybJson: JSON.stringify(hokusaiSettings),
    unmapped: [...accumulator.unmapped].sort(),
    warnings: [...accumulator.warnings].sort(),
  };
}

/* -------------------------------------------------------------------------- *
 * Stroke rendering through the Hokusai wasm engine.
 *
 * The wasm module is injected (structural interfaces below) so this package
 * stays dependency-free: tests and the studio runtime load
 * packages/studio-hokusai-wasm and pass it in.
 * -------------------------------------------------------------------------- */

export interface HokusaiBrushLike {
  free(): void;
  setColorHsv(h: number, s: number, v: number): void;
  setRadiusLog(log2Radius: number): void;
}

export interface HokusaiCanvasLike {
  beginStroke(brush: HokusaiBrushLike, seed?: number | null): void;
  addSample(
    brush: HokusaiBrushLike,
    x: number,
    y: number,
    pressure: number,
    tiltX: number,
    tiltY: number,
    timeMs: number,
  ): boolean;
  finishStroke(brush: HokusaiBrushLike): boolean;
  fullFrame(): Uint8Array;
  dispose(): void;
  free(): void;
}

export interface HokusaiModuleLike {
  HokusaiBrush: new (mybJson: string) => HokusaiBrushLike;
  HokusaiCanvas: new (
    width: number,
    height: number,
    seed: number,
  ) => HokusaiCanvasLike;
}

export interface RasterStrokeSample {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  tMs: number;
}

/**
 * The standard fidelity path: x sweeps left→right while y zigzags through
 * three triangle cycles, carrying a linear 0→1 pressure ramp. Deterministic,
 * shared by the compile-bridge gates so goldens stay comparable.
 */
export function standardZigzagStrokeSamples(
  width: number,
  height: number,
  sampleCount: number,
): RasterStrokeSample[] {
  const margin = 16;
  // Leave real headroom for wide, high-pressure dabs: clipping ink at the
  // zigzag peaks would corrupt the pressure→mass profile the gates measure.
  const amplitude = Math.max(4, height / 2 - 24);
  const cycles = 3;
  const samples: RasterStrokeSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const phase = (t * cycles) % 1;
    const zig = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    samples.push({
      x: margin + t * (width - 2 * margin),
      y: height / 2 + zig * amplitude,
      pressure: t,
      tiltX: 0,
      tiltY: 0,
      tMs: index * 6,
    });
  }
  return samples;
}

export interface RenderCompiledBrushStrokeOptions {
  width?: number;
  height?: number;
  seed?: number;
  sampleCount?: number;
  /** Optional stroke-colour override (StrokeIR colour lives outside `.myb`). */
  colorHsv?: [number, number, number];
  /** Optional base-2 log radius override (per-stroke baseSizePx concern). */
  radiusLog2?: number;
  /** Custom sample path; defaults to `standardZigzagStrokeSamples`. */
  samples?: readonly RasterStrokeSample[];
}

export interface RenderCompiledBrushStrokeResult {
  frame: Uint8Array;
  width: number;
  height: number;
}

/**
 * Render one deterministic stroke with a compiled raster brush.
 *
 * Samples are fed raw — the compiled `.myb` carries slow_tracking, so the
 * engine owns smoothing exactly as the fidelity harness does.
 */
export function renderCompiledBrushStroke(
  hokusai: HokusaiModuleLike,
  compiled: CompiledRasterBrush,
  options: RenderCompiledBrushStrokeOptions = {},
): RenderCompiledBrushStrokeResult {
  const width = options.width ?? 192;
  const height = options.height ?? 96;
  const seed = options.seed ?? 7;
  const sampleCount = options.sampleCount ?? 96;
  const samples =
    options.samples ?? standardZigzagStrokeSamples(width, height, sampleCount);

  const brush = new hokusai.HokusaiBrush(compiled.mybJson);
  const canvas = new hokusai.HokusaiCanvas(width, height, seed);
  try {
    if (options.colorHsv) brush.setColorHsv(...options.colorHsv);
    if (options.radiusLog2 !== undefined) brush.setRadiusLog(options.radiusLog2);
    canvas.beginStroke(brush, seed);
    for (const sample of samples) {
      canvas.addSample(
        brush,
        sample.x,
        sample.y,
        sample.pressure,
        sample.tiltX,
        sample.tiltY,
        sample.tMs,
      );
    }
    canvas.finishStroke(brush);
    return { frame: canvas.fullFrame(), width, height };
  } finally {
    canvas.dispose();
    canvas.free();
    brush.free();
  }
}
