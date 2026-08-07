import { hasWebGpu, loadVelloGpuBrowser } from "./gpu-browser";

/**
 * Velato Lottie lane of the Vello provider (ADR-0011 Velato lane).
 *
 * Wraps `render_lottie_gpu_json` from the `pkg-gpu/` wasm-pack artifact
 * (built with `--features lottie`): velato 0.11 lowers a Lottie (bodymovin)
 * JSON document to a vello 0.9 `Scene` at the requested frame, which renders
 * through the exact WebGPU texture path the SceneIR lane validated
 * (native gate: crates/studio-engine-vello/tests/lottie_parity.rs).
 *
 * Contract mirrors the gpu-browser lane: WebGPU absence, parse failures,
 * unsupported Lottie constructs and out-of-range frames are all explicit
 * errors — never a silent blank frame. The wasm side rejects with a JSON
 * message `{"code":"lottie-*","reason":"..."}` which is surfaced here as a
 * typed [`LottieRenderError`].
 */

export type LottieErrorCode =
  | "lottie-parse-failed"
  | "lottie-unsupported"
  | "lottie-frame-out-of-range"
  | "lottie-invalid-size";

const LOTTIE_ERROR_CODES: readonly LottieErrorCode[] = [
  "lottie-parse-failed",
  "lottie-unsupported",
  "lottie-frame-out-of-range",
  "lottie-invalid-size",
];

/** Typed surface of the wasm lane's `{"code","reason"}` rejection payload. */
export class LottieRenderError extends Error {
  readonly code: LottieErrorCode;
  readonly reason: string;

  constructor(code: LottieErrorCode, reason: string) {
    super(`${code}: ${reason}`);
    this.name = "LottieRenderError";
    this.code = code;
    this.reason = reason;
  }
}

const WEBGPU_MISSING_MESSAGE =
  "WebGPU is unavailable in this environment (navigator.gpu missing) — " +
  "the velato lottie lane renders on the browser WebGPU device only; " +
  "keep the animation on its existing (non-Vello) Lottie player instead";

function mapLottieError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const payload: unknown = JSON.parse(message);
    if (
      typeof payload === "object" &&
      payload !== null &&
      "code" in payload &&
      "reason" in payload
    ) {
      const record = payload as Record<string, unknown>;
      const code = LOTTIE_ERROR_CODES.find((known) => known === record.code);
      if (code !== undefined && typeof record.reason === "string") {
        return new LottieRenderError(code, record.reason);
      }
    }
  } catch {
    // Not a structured lottie payload (e.g. a WebGPU device error) — fall
    // through to the raw error below.
  }
  return error instanceof Error ? error : new Error(message);
}

/**
 * Renders one frame of a Lottie JSON document on the browser's WebGPU device
 * to straight RGBA8 bytes (width * height * 4) over a transparent base.
 * The composition is scaled from its intrinsic size to `width`x`height`.
 *
 * Requires `loadVelloGpuBrowser()`-style init (performed here, idempotent).
 * Rejects with [`LottieRenderError`] for lottie-side failures and an explicit
 * error when WebGPU is absent — callers must not treat a rejection as an
 * empty frame.
 */
export async function renderLottieToPixelsGpu(
  lottieJson: string,
  frame: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (!Number.isFinite(frame)) {
    throw new LottieRenderError(
      "lottie-frame-out-of-range",
      `frame ${frame} is not a finite number`,
    );
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new LottieRenderError(
      "lottie-invalid-size",
      `target size must be positive integers, got ${width}x${height}`,
    );
  }
  if (!hasWebGpu()) {
    throw new Error(WEBGPU_MISSING_MESSAGE);
  }
  const module = await loadVelloGpuBrowser();
  try {
    return await module.render_lottie_gpu_json(lottieJson, frame, width, height);
  } catch (error) {
    throw mapLottieError(error);
  }
}
