/**
 * 래스터 축소·변환(순수). 팔레트 추출과 썸네일 임베딩 전처리에 쓴다.
 * - `downsampleRgba`: 박스 필터 평균으로 긴 변을 `maxSide` 이하로 줄인다(결정적, 알파 가중 없음·straight alpha 유지).
 * - `rasterToRgbaImage`: CapturedRaster(top-down, straight alpha)를 그대로 RgbaImage로 본다.
 */
import type { CapturedRaster } from "../../contracts";

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  /** width*height*4, straight alpha, top-down */
  readonly rgba: Uint8ClampedArray;
}

export function rasterToRgbaImage(raster: CapturedRaster): RgbaImage {
  return { width: raster.width, height: raster.height, rgba: raster.rgba };
}

/** 길이·크기 정합 검사. 틀리면 한글 사유 문자열, 맞으면 null. */
export function validateRgbaImage(image: RgbaImage): string | null {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) {
    return `이미지 크기가 올바르지 않습니다(${image.width}×${image.height}).`;
  }
  if (image.rgba.length !== image.width * image.height * 4) {
    return `RGBA 길이(${image.rgba.length})가 ${image.width}×${image.height}×4(${image.width * image.height * 4})와 다릅니다.`;
  }
  return null;
}

/**
 * 긴 변이 maxSide 이하가 되도록 정수 배율 박스 필터로 줄인다. 이미 작으면 같은 참조를 돌려준다.
 * 배율은 ceil(max(w,h)/maxSide)이며 가장자리 블록은 남는 픽셀만 평균한다.
 */
export function downsampleRgba(image: RgbaImage, maxSide: number): RgbaImage {
  const problem = validateRgbaImage(image);
  if (problem) throw new Error(problem);
  const longest = Math.max(image.width, image.height);
  if (longest <= maxSide) return image;
  const factor = Math.ceil(longest / Math.max(1, maxSide));
  const width = Math.ceil(image.width / factor);
  const height = Math.ceil(image.height / factor);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const y0 = y * factor;
      const x0 = x * factor;
      for (let sy = y0; sy < Math.min(image.height, y0 + factor); sy += 1) {
        for (let sx = x0; sx < Math.min(image.width, x0 + factor); sx += 1) {
          const base = (sy * image.width + sx) * 4;
          r += image.rgba[base] ?? 0;
          g += image.rgba[base + 1] ?? 0;
          b += image.rgba[base + 2] ?? 0;
          a += image.rgba[base + 3] ?? 0;
          n += 1;
        }
      }
      const target = (y * width + x) * 4;
      out[target] = Math.round(r / n);
      out[target + 1] = Math.round(g / n);
      out[target + 2] = Math.round(b / n);
      out[target + 3] = Math.round(a / n);
    }
  }
  return { width, height, rgba: out };
}

/** 불투명 픽셀 비율(0..1). 투명 썸네일을 추천에서 제외할 때 쓴다. */
export function opaqueRatio(image: RgbaImage, alphaMin = 128): number {
  const pixels = image.width * image.height;
  if (pixels === 0) return 0;
  let count = 0;
  for (let p = 0; p < pixels; p += 1) if ((image.rgba[p * 4 + 3] ?? 0) >= alphaMin) count += 1;
  return count / pixels;
}
