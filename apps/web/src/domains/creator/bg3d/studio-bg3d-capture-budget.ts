import { STUDIO_BG3D_LT_DEPTH_EDGE_MAX_PIXELS } from "./studio-bg3d-lt-depth-edges";
import { STUDIO_BG3D_LT_CAPTURE_MAX_EDGE, STUDIO_BG3D_LT_CAPTURE_MAX_PIXELS } from "./studio-bg3d-lt-capture-size";

/** Beauty-only 4K square capture does not allocate LT depth/edge/line intermediate arrays. */
export const STUDIO_BG3D_COLOR_CAPTURE_MAX_PIXELS = STUDIO_BG3D_LT_CAPTURE_MAX_PIXELS;
export const STUDIO_BG3D_DEPTH_CAPTURE_MAX_PIXELS = STUDIO_BG3D_LT_DEPTH_EDGE_MAX_PIXELS;

/**
 * Conservative portable peak for concurrent color/depth/normal capture and owned CPU copies:
 * HDR+depth+display targets, staging buffers, normalized rasters and capture-boundary copies.
 * This is not a device memory measurement. A 2K-square request stays at/below 320 MiB;
 * requesting normals must never inherit the larger legacy depth-only limit.
 */
export const STUDIO_BG3D_NORMAL_CAPTURE_MAX_WORKING_BYTES = 320 * 1024 * 1024;
export const STUDIO_BG3D_NORMAL_CAPTURE_BYTES_PER_PIXEL = 80;
export const STUDIO_BG3D_NORMAL_CAPTURE_MAX_PIXELS = Math.floor(
  STUDIO_BG3D_NORMAL_CAPTURE_MAX_WORKING_BYTES / STUDIO_BG3D_NORMAL_CAPTURE_BYTES_PER_PIXEL,
);

export function assertStudioBg3dCaptureBudget(input: {
  readonly width: number;
  readonly height: number;
  readonly includeDepth: boolean;
  readonly includeNormals?: boolean;
}): void {
  if (!Number.isSafeInteger(input.width) || input.width < 1
    || !Number.isSafeInteger(input.height) || input.height < 1
    || input.width > STUDIO_BG3D_LT_CAPTURE_MAX_EDGE || input.height > STUDIO_BG3D_LT_CAPTURE_MAX_EDGE
    || typeof input.includeDepth !== "boolean"
    || (input.includeNormals !== undefined && typeof input.includeNormals !== "boolean")
    || (input.includeNormals === true && !input.includeDepth)) {
    throw new RangeError("3D capture dimensions must fit the bounded raster budget.");
  }
  const pixels = input.width * input.height;
  const maximum = input.includeNormals ? STUDIO_BG3D_NORMAL_CAPTURE_MAX_PIXELS : input.includeDepth ? STUDIO_BG3D_DEPTH_CAPTURE_MAX_PIXELS : STUDIO_BG3D_COLOR_CAPTURE_MAX_PIXELS;
  if (!Number.isSafeInteger(pixels) || pixels > maximum) {
    throw new RangeError("3D capture exceeds the raster pixel budget.");
  }
}
