/** This bounded, explicitly selected test canvas does not change document or saved-brush authority. */
export const NATIVE_BRUSH_PROBE_VERSION = 1 as const;
export const NATIVE_BRUSH_PROBE_WIDTH = 512;
export const NATIVE_BRUSH_PROBE_HEIGHT = 256;
export const NATIVE_BRUSH_PROBE_MAX_SAMPLES = 8_192;
export const NATIVE_BRUSH_PROBE_BATCH = 128;
export type NativeBrushProbeEngine = "libmypaint" | "canvaskit" | "vello";
export type NativeBrushProbeStyle = "ink" | "wash" | "chalk";
export interface NativeBrushProbeConfig { size: number; color: string; style: NativeBrushProbeStyle; seed: number }
export interface NativeBrushProbeSample { x: number; y: number; pressure: number; tiltX: number; tiltY: number; tMs: number }
export type NativeBrushProbeOperation =
  | { type: "init"; engine: NativeBrushProbeEngine }
  | { type: "begin"; config: NativeBrushProbeConfig }
  | { type: "append"; samples: readonly NativeBrushProbeSample[] }
  | { type: "finish" };
export type NativeBrushProbeRequest = NativeBrushProbeOperation & { version: 1; id: number };
export type NativeBrushProbeFrame =
  | { kind: "pixels"; x: number; y: number; width: number; height: number; pixels: Uint8Array }
  | { kind: "bitmap"; bitmap: ImageBitmap };
export type NativeBrushProbeReply =
  | { version: 1; id: number; type: "ready" | "begun"; engine: NativeBrushProbeEngine }
  | { version: 1; id: number; type: "frame"; engine: NativeBrushProbeEngine; frame: NativeBrushProbeFrame | null; finished: boolean; samples: number }
  | { version: 1; id: number; type: "error"; message: string };
export function nativeBrushProbeEngine(value: unknown): value is NativeBrushProbeEngine {
  return value === "libmypaint" || value === "canvaskit" || value === "vello";
}
export function validateNativeBrushProbeConfig(config: NativeBrushProbeConfig): void {
  if (!config || !Number.isFinite(config.size) || config.size < 1 || config.size > 128
    || typeof config.color !== "string" || !/^#[0-9a-f]{6}$/iu.test(config.color)
    || !["ink", "wash", "chalk"].includes(config.style)
    || !Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 0xffff_ffff
  ) throw new TypeError("Invalid native brush test configuration");
}
export function validateNativeBrushProbeSamples(samples: readonly NativeBrushProbeSample[], previousTime: number, count: number): void {
  if (!Array.isArray(samples) || samples.length > NATIVE_BRUSH_PROBE_BATCH
    || count + samples.length > NATIVE_BRUSH_PROBE_MAX_SAMPLES
  ) throw new RangeError("Native brush test input budget exceeded");
  let time = previousTime;
  for (const sample of samples) {
    if (!sample || ![sample.x, sample.y, sample.pressure, sample.tiltX, sample.tiltY, sample.tMs].every(Number.isFinite)
      || sample.x < 0 || sample.x > NATIVE_BRUSH_PROBE_WIDTH || sample.y < 0 || sample.y > NATIVE_BRUSH_PROBE_HEIGHT
      || sample.pressure < 0 || sample.pressure > 1 || Math.abs(sample.tiltX) > 1 || Math.abs(sample.tiltY) > 1 || sample.tMs < time
    ) throw new TypeError("Invalid native brush test sample");
    time = sample.tMs;
  }
}
