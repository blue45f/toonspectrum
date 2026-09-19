import { STUDIO_BG3D_LT_DEPTH_EDGE_MAX_PIXELS } from "./studio-bg3d-lt-depth-edges";
import { STUDIO_BG3D_LT_CAPTURE_MAX_EDGE, STUDIO_BG3D_LT_CAPTURE_MAX_PIXELS } from "./studio-bg3d-lt-capture-size";

/** Beauty-only 4K square capture does not allocate LT depth/edge/line intermediate arrays. */
export const STUDIO_BG3D_COLOR_CAPTURE_MAX_PIXELS = STUDIO_BG3D_LT_CAPTURE_MAX_PIXELS;
export const STUDIO_BG3D_DEPTH_CAPTURE_MAX_PIXELS = STUDIO_BG3D_LT_DEPTH_EDGE_MAX_PIXELS;

export function assertStudioBg3dCaptureBudget(input: {
  readonly width: number;
  readonly height: number;
  readonly includeDepth: boolean;
}): void {
  if (!Number.isSafeInteger(input.width) || input.width < 1
    || !Number.isSafeInteger(input.height) || input.height < 1
    || input.width > STUDIO_BG3D_LT_CAPTURE_MAX_EDGE || input.height > STUDIO_BG3D_LT_CAPTURE_MAX_EDGE
    || typeof input.includeDepth !== "boolean") {
    throw new RangeError("3D capture dimensions must fit the bounded raster budget.");
  }
  const pixels = input.width * input.height;
  const maximum = input.includeDepth ? STUDIO_BG3D_DEPTH_CAPTURE_MAX_PIXELS : STUDIO_BG3D_COLOR_CAPTURE_MAX_PIXELS;
  if (!Number.isSafeInteger(pixels) || pixels > maximum) {
    throw new RangeError("3D capture exceeds the raster pixel budget.");
  }
}
