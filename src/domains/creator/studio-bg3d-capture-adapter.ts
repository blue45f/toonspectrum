/**
 * Renderer-neutral asynchronous capture boundary for Studio's 3D line-and-tone pipeline.
 *
 * Engine adapters own rendering and GPU/DOM readback. This module owns the bounded request/result
 * contract so WebGL and a future WebGPU adapter must produce the same top-down RGBA/depth raster.
 */

import { STUDIO_BG3D_LT_RENDER_MAX_PIXELS } from "./studio-bg3d-lt-render";

export type StudioBg3dCaptureBackend = "three-webgl" | "three-webgpu";

export interface StudioBg3dCaptureSize {
  readonly width: number;
  readonly height: number;
}

export interface StudioBg3dCaptureRequest extends StudioBg3dCaptureSize {
  readonly background: {
    readonly color: string;
    readonly alpha: number;
  };
  readonly includeDepth: boolean;
}

export interface StudioBg3dCapturedRaster extends StudioBg3dCaptureSize {
  /** Fresh, tightly packed, top-down, non-premultiplied RGBA bytes. */
  readonly rgba: Uint8Array | Uint8ClampedArray;
  /** Fresh top-down normalized depth samples. Required when includeDepth is true. */
  readonly depth?: Float32Array;
}

export interface StudioBg3dCaptureAdapter {
  readonly backend: StudioBg3dCaptureBackend;
  getSourceSize(): StudioBg3dCaptureSize;
  capture(request: StudioBg3dCaptureRequest): Promise<StudioBg3dCapturedRaster>;
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const BACKEND_SET = new Set<StudioBg3dCaptureBackend>(["three-webgl", "three-webgpu"]);

function assertSize(size: unknown, label: string, enforcePixelBudget: boolean): asserts size is StudioBg3dCaptureSize {
  if (!size || typeof size !== "object") throw new TypeError(`${label} must be an object.`);
  const { width, height } = size as Partial<StudioBg3dCaptureSize>;
  if (!Number.isSafeInteger(width) || (width ?? 0) < 1) {
    throw new RangeError(`${label} width must be a positive safe integer.`);
  }
  if (!Number.isSafeInteger(height) || (height ?? 0) < 1) {
    throw new RangeError(`${label} height must be a positive safe integer.`);
  }
  const pixels = width! * height!;
  if (!Number.isSafeInteger(pixels)) throw new RangeError(`${label} pixel count is unsafe.`);
  if (enforcePixelBudget && pixels > STUDIO_BG3D_LT_RENDER_MAX_PIXELS) {
    throw new RangeError(`${label} exceeds the raster pixel budget.`);
  }
}

function assertAdapter(adapter: unknown): asserts adapter is StudioBg3dCaptureAdapter {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("3D capture adapter must be an object.");
  }
  const candidate = adapter as Partial<StudioBg3dCaptureAdapter>;
  if (!BACKEND_SET.has(candidate.backend as StudioBg3dCaptureBackend)) {
    throw new TypeError("3D capture adapter backend is unsupported.");
  }
  if (typeof candidate.getSourceSize !== "function" || typeof candidate.capture !== "function") {
    throw new TypeError("3D capture adapter methods are unavailable.");
  }
}

function assertRequest(request: unknown): asserts request is StudioBg3dCaptureRequest {
  assertSize(request, "3D capture request", true);
  const candidate = request as Partial<StudioBg3dCaptureRequest>;
  if (typeof candidate.includeDepth !== "boolean") {
    throw new TypeError("3D capture includeDepth must be a boolean.");
  }
  if (!candidate.background || typeof candidate.background !== "object") {
    throw new TypeError("3D capture background must be an object.");
  }
  if (typeof candidate.background.color !== "string" || !HEX_COLOR_PATTERN.test(candidate.background.color)) {
    throw new TypeError("3D capture background color must be a six-digit hex color.");
  }
  if (
    typeof candidate.background.alpha !== "number" ||
    !Number.isFinite(candidate.background.alpha) ||
    candidate.background.alpha < 0 ||
    candidate.background.alpha > 1
  ) {
    throw new RangeError("3D capture background alpha must be in [0, 1].");
  }
}

function assertCapturedRaster(
  raster: unknown,
  request: StudioBg3dCaptureRequest
): asserts raster is StudioBg3dCapturedRaster {
  assertSize(raster, "3D captured raster", true);
  const candidate = raster as Partial<StudioBg3dCapturedRaster>;
  if (candidate.width !== request.width || candidate.height !== request.height) {
    throw new RangeError("3D captured raster dimensions must match the request.");
  }
  if (!(candidate.rgba instanceof Uint8Array || candidate.rgba instanceof Uint8ClampedArray)) {
    throw new TypeError("3D captured raster RGBA must be an 8-bit typed array.");
  }
  const pixels = request.width * request.height;
  if (candidate.rgba.length !== pixels * 4) {
    throw new RangeError("3D captured raster RGBA length must equal width * height * 4.");
  }
  if (request.includeDepth && !(candidate.depth instanceof Float32Array)) {
    throw new TypeError("3D captured raster depth is required when requested.");
  }
  if (!request.includeDepth && candidate.depth !== undefined) {
    throw new TypeError("3D captured raster returned unrequested depth.");
  }
  if (candidate.depth) {
    if (candidate.depth.length !== pixels) {
      throw new RangeError("3D captured raster depth length must equal width * height.");
    }
    for (const value of candidate.depth) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError("3D captured raster depth values must be finite and normalized.");
      }
    }
  }
}

export function getStudioBg3dCaptureSourceSize(adapter: StudioBg3dCaptureAdapter): StudioBg3dCaptureSize {
  assertAdapter(adapter);
  const size = adapter.getSourceSize();
  assertSize(size, "3D capture source", false);
  return Object.freeze({ width: size.width, height: size.height });
}

export async function captureStudioBg3dRaster(
  adapter: StudioBg3dCaptureAdapter,
  request: StudioBg3dCaptureRequest
): Promise<StudioBg3dCapturedRaster> {
  assertAdapter(adapter);
  assertRequest(request);
  const requestSnapshot = Object.freeze({
    width: request.width,
    height: request.height,
    includeDepth: request.includeDepth,
    background: Object.freeze({ ...request.background }),
  });
  const captured = await adapter.capture(requestSnapshot);
  assertCapturedRaster(captured, requestSnapshot);

  // WebGPU mapped buffers and renderer pools may be recycled after the adapter Promise settles.
  // Own both arrays at this boundary so later engine work cannot mutate LT input behind Studio.
  return Object.freeze({
    width: captured.width,
    height: captured.height,
    rgba: new Uint8ClampedArray(captured.rgba),
    ...(captured.depth ? { depth: new Float32Array(captured.depth) } : {}),
  });
}
