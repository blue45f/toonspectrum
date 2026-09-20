import { STUDIO_BG3D_NORMAL_CAPTURE_MAX_PIXELS } from "./studio-bg3d-capture-budget";
import { STUDIO_BG3D_LT_RENDER_MAX_PIXELS } from "./studio-bg3d-lt-render";
import { STUDIO_BG3D_TILED_OUTPUT_MAX_PIXELS } from "./studio-bg3d-tile-plan";
import type { StudioBg3dCaptureAdapter } from "./studio-bg3d-capture-adapter";

export function studioBg3dBatchOutputPixelBudget(
  adapter: StudioBg3dCaptureAdapter,
  devicePixels: number,
): number {
  if (!Number.isSafeInteger(devicePixels) || devicePixels < 1)
    throw new RangeError("Invalid device raster budget.");
  if (typeof adapter.createTiledCapture === "function")
    resolveStudioBg3dBatchTileShape(devicePixels);
  return typeof adapter.createTiledCapture === "function"
    ? STUDIO_BG3D_TILED_OUTPUT_MAX_PIXELS
    : Math.min(
        devicePixels,
        adapter.normalProfile
          ? STUDIO_BG3D_NORMAL_CAPTURE_MAX_PIXELS
          : STUDIO_BG3D_LT_RENDER_MAX_PIXELS,
      );
}
export function studioBg3dBatchNeedsTiles(
  adapter: StudioBg3dCaptureAdapter,
  pixels: number,
  devicePixels: number,
  includeNormals: boolean,
): boolean {
  return (
    typeof adapter.createTiledCapture === "function" &&
    pixels >
      Math.min(
        devicePixels,
        includeNormals
          ? STUDIO_BG3D_NORMAL_CAPTURE_MAX_PIXELS
          : STUDIO_BG3D_LT_RENDER_MAX_PIXELS,
      )
  );
}

export const STUDIO_BG3D_TILED_LT_PIPELINE =
  "studio-lt-adaptive-guarded-tiles-v1";
export const STUDIO_BG3D_TILED_PNG_PROFILE =
  "png-adaptive-canvas-or-stream-rgba8-srgb-v1";
export function resolveStudioBg3dBatchTileShape(devicePixels: number): {
  readonly tileWidth: number;
  readonly bandHeight: number;
} {
  if (!Number.isSafeInteger(devicePixels) || devicePixels < 1600)
    throw new RangeError(
      "Device capture budget is too small for guarded tiled output.",
    );
  let tileWidth = 1024,
    bandHeight = 512;
  while ((tileWidth + 24) * (bandHeight + 24) > devicePixels) {
    if (tileWidth >= bandHeight && tileWidth > 16)
      tileWidth = Math.max(16, Math.floor(tileWidth / 2));
    else if (bandHeight > 16)
      bandHeight = Math.max(16, Math.floor(bandHeight / 2));
    else
      throw new RangeError("Device capture budget cannot fit a guarded tile.");
  }
  return Object.freeze({ tileWidth, bandHeight });
}
export function studioBg3dTilePipelineId(devicePixels: number): string {
  const shape = resolveStudioBg3dBatchTileShape(devicePixels);
  return `${STUDIO_BG3D_TILED_LT_PIPELINE}-${shape.tileWidth}x${shape.bandHeight}`;
}
export function isStudioBg3dTilePipelineId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^studio-lt-adaptive-guarded-tiles-v1-(16|32|64|128|256|512|1024)x(16|32|64|128|256|512)$/.test(
      value,
    )
  );
}
