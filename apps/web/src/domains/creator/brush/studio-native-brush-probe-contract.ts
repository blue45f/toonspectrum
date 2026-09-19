/** Shared bounded Worker transport. Trial frames never mutate a document; settled PNGs require an explicit document commit. */
export const NATIVE_BRUSH_PROBE_VERSION = 1 as const;
export const NATIVE_BRUSH_PROBE_WIDTH = 512;
export const NATIVE_BRUSH_PROBE_HEIGHT = 256;
export const NATIVE_BRUSH_PROBE_MAX_SAMPLES = 8_192;
export const NATIVE_BRUSH_PROBE_BATCH = 128;
export const NATIVE_BRUSH_DOCUMENT_MAX_DIMENSION = 2_048;
export const NATIVE_BRUSH_DOCUMENT_MAX_PNG_BYTES = 20 * 1_024 * 1_024;
export interface NativeBrushSurface { readonly width: number; readonly height: number }
export const NATIVE_BRUSH_PROBE_SURFACE: NativeBrushSurface = Object.freeze({ width: NATIVE_BRUSH_PROBE_WIDTH, height: NATIVE_BRUSH_PROBE_HEIGHT });
/** Left/top/right/bottom: true only where the document boundary intentionally clips paint. */
export type NativeBrushDocumentClipEdges = readonly [boolean, boolean, boolean, boolean];
export function validateNativeBrushSurface(surface: NativeBrushSurface): void {
  if (!surface || ![surface.width, surface.height].every((value) => Number.isSafeInteger(value)
    && value > 0 && value <= NATIVE_BRUSH_DOCUMENT_MAX_DIMENSION)) {
    throw new RangeError("Native brush surface must be within 2048×2048 pixels");
  }
}
export type NativeBrushProbeEngine = "libmypaint" | "canvaskit" | "vello";
export type NativeBrushProbeStyle = "ink" | "wash" | "chalk";
export interface NativeBrushProbeConfig { size: number; color: string; style: NativeBrushProbeStyle; seed: number }
export interface NativeBrushProbeSample { x: number; y: number; pressure: number; tiltX: number; tiltY: number; tMs: number }
export type NativeBrushProbeOperation =
  | { type: "init"; engine: NativeBrushProbeEngine; surface?: NativeBrushSurface }
  | { type: "begin"; config: NativeBrushProbeConfig }
  | { type: "append"; samples: readonly NativeBrushProbeSample[] }
  | { type: "finish" }
  | { type: "render-document"; surface?: NativeBrushSurface; config: NativeBrushProbeConfig; samples: readonly NativeBrushProbeSample[]; clipEdges: NativeBrushDocumentClipEdges };
export type NativeBrushProbeRequest = NativeBrushProbeOperation & { version: 1; id: number };
export type NativeBrushProbeFrame =
  | { kind: "pixels"; x: number; y: number; width: number; height: number; pixels: Uint8Array }
  | { kind: "bitmap"; bitmap: ImageBitmap };
export interface NativeBrushDocumentOutput {
  readonly version: 1;
  readonly id: number;
  readonly type: "document";
  readonly engine: NativeBrushProbeEngine;
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly png: ArrayBuffer;
  readonly pngHash: string;
}
export type NativeBrushProbeReply =
  | NativeBrushDocumentOutput
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
export function validateNativeBrushProbeSamples(samples: readonly NativeBrushProbeSample[], previousTime: number, count: number, surface: NativeBrushSurface = NATIVE_BRUSH_PROBE_SURFACE): void {
  if (!Array.isArray(samples) || samples.length > NATIVE_BRUSH_PROBE_BATCH
    || count + samples.length > NATIVE_BRUSH_PROBE_MAX_SAMPLES
  ) throw new RangeError("Native brush test input budget exceeded");
  let time = previousTime;
  for (const sample of samples) {
    if (!sample || ![sample.x, sample.y, sample.pressure, sample.tiltX, sample.tiltY, sample.tMs].every(Number.isFinite)
      || sample.x < 0 || sample.x > surface.width || sample.y < 0 || sample.y > surface.height
      || sample.pressure < 0 || sample.pressure > 1 || Math.abs(sample.tiltX) > 1 || Math.abs(sample.tiltY) > 1 || sample.tMs < time
    ) throw new TypeError("Invalid native brush test sample");
    time = sample.tMs;
  }
}

/** The result must be a bounded PNG with an IHDR matching the requested backing dimensions. */
export function validateNativeBrushDocumentOutput(reply: NativeBrushDocumentOutput, surface: NativeBrushSurface): boolean {
  if (!reply || !(reply.png instanceof ArrayBuffer) || reply.png.byteLength < 33
    || reply.png.byteLength > NATIVE_BRUSH_DOCUMENT_MAX_PNG_BYTES
    || reply.width !== surface.width || reply.height !== surface.height
    || !Number.isSafeInteger(reply.samples) || reply.samples < 1 || reply.samples > NATIVE_BRUSH_PROBE_MAX_SAMPLES
    || typeof reply.pngHash !== "string" || !/^[a-f0-9]{64}$/u.test(reply.pngHash)) return false;
  const bytes = new Uint8Array(reply.png);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const view = new DataView(reply.png);
  return signature.every((value, index) => bytes[index] === value)
    && view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452
    && view.getUint32(16) === surface.width && view.getUint32(20) === surface.height;
}
