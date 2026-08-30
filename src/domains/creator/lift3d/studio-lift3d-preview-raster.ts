/**
 * Studio Lift 3D — 마스크·깊이장을 사람이 볼 수 있는 RGBA 로 굽는다.
 *
 * "왜 이렇게 나왔지"를 3D 뷰포트만 보고 답하기는 어렵다. 실루엣이 어디서 새는지, 깊이가 어디서
 * 뭉개지는지는 2D 로 보면 즉시 보인다. 순수 함수라 캔버스 없이도 테스트할 수 있다.
 */

import type { StudioLift3dDepthField } from "./studio-lift3d-depth";
import type { StudioLift3dMask } from "./studio-lift3d-mask";

/** 깊이 0 → 1 램프. 어두운 남색에서 청록을 지나 따뜻한 호박색으로. */
const DEPTH_RAMP: readonly (readonly [number, number, number])[] = [
  [26, 30, 58],
  [32, 86, 122],
  [64, 158, 143],
  [226, 178, 92],
  [247, 233, 213],
];

const BACKGROUND: readonly [number, number, number] = [18, 17, 16];

function rampColor(t: number): readonly [number, number, number] {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const scaled = clamped * (DEPTH_RAMP.length - 1);
  const low = Math.min(DEPTH_RAMP.length - 1, Math.floor(scaled));
  const high = Math.min(DEPTH_RAMP.length - 1, low + 1);
  const mix = scaled - low;
  const a = DEPTH_RAMP[low]!;
  const b = DEPTH_RAMP[high]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * mix),
    Math.round(a[1] + (b[1] - a[1]) * mix),
    Math.round(a[2] + (b[2] - a[2]) * mix),
  ];
}

function paint(
  width: number,
  height: number,
  colorAt: (index: number) => readonly [number, number, number],
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const [r, g, b] = colorAt(index);
    pixels[index * 4] = r;
    pixels[index * 4 + 1] = g;
    pixels[index * 4 + 2] = b;
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

/** 피사체는 밝게, 배경은 어둡게. 실루엣이 어디서 새는지 한눈에 보인다. */
export function paintStudioLift3dMaskPreview(
  mask: StudioLift3dMask,
): Uint8ClampedArray<ArrayBuffer> {
  return paint(mask.width, mask.height, (index) => (
    mask.cells[index] === 1 ? [236, 232, 226] : BACKGROUND
  ));
}

/** 두께 0(봉합선) → 최대 두께를 램프 색으로 보여준다. */
export function paintStudioLift3dDepthPreview(
  mask: StudioLift3dMask,
  depth: StudioLift3dDepthField,
): Uint8ClampedArray<ArrayBuffer> {
  return paint(mask.width, mask.height, (index) => (
    mask.cells[index] === 1 ? rampColor(depth.heights[index] ?? 0) : BACKGROUND
  ));
}
