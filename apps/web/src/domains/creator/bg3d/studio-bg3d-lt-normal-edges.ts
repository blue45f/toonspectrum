/** Worker-safe geometric crease extraction. Lighting and texture edges are handled separately. */
import { STUDIO_BG3D_LT_DEPTH_EDGE_MAX_PIXELS } from "./studio-bg3d-lt-depth-edges";

export interface StudioBg3dLtNormalEdgeInput {
  readonly width: number;
  readonly height: number;
  readonly normalRgba: Uint8Array | Uint8ClampedArray;
  readonly depth: Float32Array;
  readonly creaseAngleDegrees: number;
}

export function extractStudioBg3dLtNormalEdges(input: StudioBg3dLtNormalEdgeInput): Uint8ClampedArray {
  const { width, height, normalRgba, depth, creaseAngleDegrees } = input;
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
    || !Number.isSafeInteger(pixels) || pixels > STUDIO_BG3D_LT_DEPTH_EDGE_MAX_PIXELS) {
    throw new RangeError("Normal edge dimensions exceed the LT budget.");
  }
  if (!(normalRgba instanceof Uint8Array || normalRgba instanceof Uint8ClampedArray)
    || normalRgba.length !== pixels * 4 || !(depth instanceof Float32Array) || depth.length !== pixels) {
    throw new TypeError("Normal edges require matching packed normals and depth.");
  }
  if (!Number.isFinite(creaseAngleDegrees) || creaseAngleDegrees < 0 || creaseAngleDegrees > 180) {
    throw new RangeError("Normal crease angle must be in [0, 180].");
  }
  for (const sample of depth) {
    if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new RangeError("Invalid normal-edge depth.");
  }
  const response = new Uint8ClampedArray(pixels);
  const thresholdCosine = Math.cos(creaseAngleDegrees * Math.PI / 180);
  const compare = (a: number, b: number) => {
    const offsetA = a * 4;
    const offsetB = b * 4;
    if (!normalRgba[offsetA + 3] || !normalRgba[offsetB + 3]) return;
    const za = depth[a]!;
    const zb = depth[b]!;
    // Occlusion contours belong to the depth pass, never to the hidden/far surface's normals.
    if (za >= 1 || zb >= 1 || Math.abs(za - zb) > 0.125 * Math.max(1 / 1024, 1 - Math.min(za, zb))) return;
    const ax = normalRgba[offsetA]! * 2 - 255;
    const ay = normalRgba[offsetA + 1]! * 2 - 255;
    const az = normalRgba[offsetA + 2]! * 2 - 255;
    const bx = normalRgba[offsetB]! * 2 - 255;
    const by = normalRgba[offsetB + 1]! * 2 - 255;
    const bz = normalRgba[offsetB + 2]! * 2 - 255;
    const lengthProduct = Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz));
    if (lengthProduct === 0) return;
    const cosine = Math.min(1, Math.max(-1, (ax * bx + ay * by + az * bz) / lengthProduct));
    // A small dot-product tolerance suppresses RGB8 quantization noise at a zero-degree threshold.
    if (cosine < thresholdCosine - 0.0001) response[za <= zb ? a : b] = 255;
  };
  // One directed comparison per edge prevents double-width lines at equal-depth creases.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (x + 1 < width) compare(pixel, pixel + 1);
      if (y + 1 < height) compare(pixel, pixel + width);
    }
  }
  return response;
}
