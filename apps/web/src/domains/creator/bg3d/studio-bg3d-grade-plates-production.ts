/**
 * Optional production plate capture path for BG3D grade plates.
 *
 * Prefer a GPU/multipass RGBA raster when a capture adapter (or pre-captured
 * buffers) is available; always keep the pure CPU synthetic `captureStudio3dPlates`
 * as the unit-testable fallback.
 */

import {
  captureStudioBg3dRaster,
  type StudioBg3dCaptureAdapter,
} from "./studio-bg3d-capture-adapter";
import {
  captureStudio3dPlates,
  type Studio3dPlates,
  type Studio3dScene,
} from "./studio-bg3d-grade-plates";

export type Studio3dPlateCaptureSource =
  | { readonly kind: "cpu-synthetic" }
  | {
      readonly kind: "rgba-raster";
      readonly fill: Uint8ClampedArray;
      readonly line?: Uint8ClampedArray;
      readonly width: number;
      readonly height: number;
    };

function deriveLineFromFill(fill: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const line = new Uint8ClampedArray(width * height * 4);
  const edge = new Uint8ClampedArray(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const right = (y * width + x + 1) * 4;
      const below = ((y + 1) * width + x) * 4;
      const delta =
        Math.abs(fill[i] - fill[right]) +
        Math.abs(fill[i] - fill[below]) +
        Math.abs(fill[i + 1] - fill[right + 1]) +
        Math.abs(fill[i + 1] - fill[below + 1]);
      if (delta > 12) edge[y * width + x] = 1;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!edge[y * width + x]) continue;
      const i = (y * width + x) * 4;
      line[i] = 20;
      line[i + 1] = 16;
      line[i + 2] = 16;
      line[i + 3] = 220;
    }
  }
  return line;
}

/**
 * Build grade plates from an explicit raster source, or fall back to CPU synthetic.
 * When `line` is omitted for rgba-raster, a lightweight edge pass derives it.
 */
export function captureStudio3dPlatesFromSource(
  scene: Studio3dScene,
  width: number,
  height: number,
  source: Studio3dPlateCaptureSource = { kind: "cpu-synthetic" },
): Studio3dPlates {
  if (source.kind === "cpu-synthetic") {
    return captureStudio3dPlates(scene, width, height);
  }
  const expected = width * height * 4;
  if (
    source.width !== width ||
    source.height !== height ||
    source.fill.length !== expected
  ) {
    return captureStudio3dPlates(scene, width, height);
  }
  const fill = source.fill;
  const line =
    source.line && source.line.length === expected
      ? source.line
      : deriveLineFromFill(fill, width, height);
  return { width, height, fill, line };
}

/**
 * Production hook: read RGBA from a BG3D capture adapter (WebGL/WebGPU multipass),
 * then pack into grade plates. Any adapter failure falls back to CPU synthetic.
 */
export async function captureStudio3dPlatesFromAdapter(
  scene: Studio3dScene,
  width: number,
  height: number,
  adapter: StudioBg3dCaptureAdapter | null | undefined,
  background: { readonly color: string; readonly alpha: number } = {
    color: scene.background.color || "#a8bcd6",
    alpha: scene.background.mode === "transparent" ? 0 : 1,
  },
): Promise<Studio3dPlates> {
  if (!adapter) {
    return captureStudio3dPlates(scene, width, height);
  }
  try {
    const raster = await captureStudioBg3dRaster(adapter, {
      width,
      height,
      background,
      includeDepth: false,
    });
    const fill =
      raster.rgba instanceof Uint8ClampedArray
        ? raster.rgba
        : new Uint8ClampedArray(raster.rgba);
    return captureStudio3dPlatesFromSource(scene, width, height, {
      kind: "rgba-raster",
      fill,
      width: raster.width,
      height: raster.height,
    });
  } catch {
    return captureStudio3dPlates(scene, width, height);
  }
}
