/** Pure alpha validation: no renderer, allocation proportional to pixels, or color conversion. */
import { validateNativeBrushSurface } from "./studio-native-brush-probe-contract";

import type { NativeBrushDocumentClipEdges, NativeBrushSurface } from "./studio-native-brush-probe-contract";

export interface NativeBrushPixelRegion extends NativeBrushSurface {
  readonly x: number;
  readonly y: number;
}
export function validateNativeBrushClipEdges(clipEdges: NativeBrushDocumentClipEdges): void {
  if (!Array.isArray(clipEdges) || clipEdges.length !== 4 || clipEdges.some((value) => typeof value !== "boolean")) {
    throw new TypeError("Invalid native document crop boundary");
  }
}

/**
 * Inspect only boundaries that touch the crop edge, then stop at the first visible alpha.
 * A native packed region can be validated directly without expanding or reading a canvas.
 * No alpha threshold is introduced: one nonzero alpha byte is visible, exactly as before.
 */
export function validateNativeBrushOutputPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  region: NativeBrushPixelRegion,
  surface: NativeBrushSurface,
  clipEdges: NativeBrushDocumentClipEdges,
): void {
  validateNativeBrushSurface(surface);
  validateNativeBrushClipEdges(clipEdges);
  if (!region || ![region.x, region.y, region.width, region.height].every(Number.isSafeInteger)
    || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > surface.width || region.y + region.height > surface.height
    || !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray)
    || pixels.byteLength !== region.width * region.height * 4) {
    throw new TypeError("Invalid native brush packed RGBA region");
  }
  const stride = region.width * 4;
  const edge = (start: number, step: number, count: number) => {
    for (let at = start, i = 0; i < count; i += 1, at += step) {
      if (pixels[at] !== 0) {
        throw new Error("브러시 자국이 변환 영역을 벗어나 결과를 적용하지 않았습니다. 더 작은 굵기로 다시 시도하세요.");
      }
    }
  };
  if (region.x === 0 && !clipEdges[0]) edge(3, stride, region.height);
  if (region.y === 0 && !clipEdges[1]) edge(3, 4, region.width);
  if (region.x + region.width === surface.width && !clipEdges[2]) edge(stride - 1, stride, region.height);
  if (region.y + region.height === surface.height && !clipEdges[3]) edge((region.height - 1) * stride + 3, 4, region.width);
  for (let at = 3; at < pixels.byteLength; at += 4) {
    if (pixels[at] !== 0) return;
  }
  throw new Error("선택한 엔진이 빈 획을 반환하여 원본을 유지했습니다.");
}
