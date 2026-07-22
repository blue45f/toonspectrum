export const STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS = 16_777_216;
const STUDIO_LIVE_SURFACE_DPR_STEP = 0.25;

export interface StudioLiveSurfaceResolutionInput {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly maximumBackingPixels?: number;
}

/**
 * Keeps the interaction surface at native density until a very large/high-DPI viewport would
 * allocate more than 16M pixels. Only the transient live Canvas/WebGPU surface is capped; the
 * document and export resolution remain untouched.
 */
export function resolveStudioLiveSurfaceDevicePixelRatio(
  input: StudioLiveSurfaceResolutionInput
): number {
  const width = Number.isFinite(input.cssWidth) ? Math.max(1, input.cssWidth) : 1;
  const height = Number.isFinite(input.cssHeight) ? Math.max(1, input.cssHeight) : 1;
  const device = Number.isFinite(input.devicePixelRatio)
    ? Math.min(4, Math.max(1, input.devicePixelRatio))
    : 1;
  const maximumBackingPixels = Number.isFinite(input.maximumBackingPixels)
    ? Math.max(1, input.maximumBackingPixels!)
    : STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS;
  const budgetDpr = Math.sqrt(maximumBackingPixels / (width * height));
  const resolved = Math.max(1, Math.min(device, budgetDpr));
  if (resolved >= device) return device;
  return Math.max(
    1,
    Math.floor(resolved / STUDIO_LIVE_SURFACE_DPR_STEP) * STUDIO_LIVE_SURFACE_DPR_STEP
  );
}

/**
 * Requests the browser's low-latency 2D presentation path where supported. Older WebViews have
 * thrown on unknown context attributes, so the ordinary 2D context remains a guarded fallback.
 */
export function acquireStudioLowLatencyCanvas2dContext(
  canvas: Pick<HTMLCanvasElement, "getContext">
): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext("2d", {
      alpha: true,
      desynchronized: true,
    }) as CanvasRenderingContext2D | null;
  } catch {
    return canvas.getContext("2d") as CanvasRenderingContext2D | null;
  }
}
