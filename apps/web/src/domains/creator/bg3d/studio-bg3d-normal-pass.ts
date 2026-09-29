/** Wraps the renderer-neutral packed view-space normal raster into a PNG-ready pass layer. */

import {
  STUDIO_BG3D_LT_RENDER_MAX_PIXELS,
  type StudioBg3dLtRasterLayer,
} from "./studio-bg3d-lt-render";

export function createStudioBg3dNormalRasterLayer(
  width: number,
  height: number,
  normalRgba: Uint8Array | Uint8ClampedArray,
): StudioBg3dLtRasterLayer {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError("3D normal pass dimensions must be positive safe integers.");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > STUDIO_BG3D_LT_RENDER_MAX_PIXELS) {
    throw new RangeError("3D normal pass exceeds the raster pixel budget.");
  }
  if (
    !(normalRgba instanceof Uint8Array || normalRgba instanceof Uint8ClampedArray) ||
    normalRgba.length !== pixels * 4
  ) {
    throw new RangeError("3D normal pass length must equal width * height * 4.");
  }
  return { role: "color", width, height, data: new Uint8ClampedArray(normalRgba) };
}
