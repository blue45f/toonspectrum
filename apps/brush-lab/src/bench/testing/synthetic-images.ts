import { Pcg32 } from "../../engine/core/rng";

import type { LabImage } from "../../engine/core/types";
import type { LaneEnvironment, StrokeReceipt } from "../../lanes/lane";

/**
 * 벤치 테스트 전용 합성 이미지·환경 생성기. 지표의 방향성을 검증하기 위한 결정적 입력만 만든다.
 * 모든 이미지는 sRGB straight RGBA8(LabImage)이다.
 */

export type Rgba8 = readonly [number, number, number, number];

export const BLACK: Rgba8 = [0, 0, 0, 255];
export const WHITE: Rgba8 = [255, 255, 255, 255];
export const CLEAR: Rgba8 = [0, 0, 0, 0];

export function solidImage(width: number, height: number, rgba: Rgba8 = CLEAR): LabImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width, height, data };
}

export function setPixel(img: LabImage, x: number, y: number, rgba: Rgba8): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4;
  img.data[o] = rgba[0];
  img.data[o + 1] = rgba[1];
  img.data[o + 2] = rgba[2];
  img.data[o + 3] = rgba[3];
}

export function alphaAt(img: LabImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3] ?? 0;
}

/** 픽셀마다 (x, y) → 알파(0..1)를 주는 검정 잉크 이미지. */
export function alphaFieldImage(width: number, height: number, alpha: (x: number, y: number) => number): LabImage {
  const img = solidImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = alpha(x, y);
      const a8 = Math.round(Math.max(0, Math.min(1, a)) * 255);
      setPixel(img, x, y, [0, 0, 0, a8]);
    }
  }
  return img;
}

/** 픽셀마다 (x, y) → 회색(0..255)인 불투명 이미지. */
export function grayFieldImage(width: number, height: number, gray: (x: number, y: number) => number): LabImage {
  const img = solidImage(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const g = Math.round(Math.max(0, Math.min(255, gray(x, y))));
      setPixel(img, x, y, [g, g, g, 255]);
    }
  }
  return img;
}

/** 원판(알파 1, AA 없음). */
export function diskImage(width: number, height: number, cx: number, cy: number, r: number): LabImage {
  return alphaFieldImage(width, height, (x, y) => (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r ? 1 : 0));
}

/** 수평 띠 [y0, y1)(알파 1). `rampPx` > 0이면 위·아래 경계를 선형 램프로 부드럽게 한다. */
export function bandImage(width: number, height: number, y0: number, y1: number, rampPx = 0): LabImage {
  return alphaFieldImage(width, height, (_x, y) => {
    const yc = y + 0.5;
    if (rampPx <= 0) return yc >= y0 && yc < y1 ? 1 : 0;
    const dTop = (yc - y0) / rampPx;
    const dBot = (y1 - yc) / rampPx;
    return Math.max(0, Math.min(1, dTop, dBot));
  });
}

/** 수직 띠 [x0, x1). */
export function columnImage(width: number, height: number, x0: number, x1: number): LabImage {
  return alphaFieldImage(width, height, (x) => (x + 0.5 >= x0 && x + 0.5 < x1 ? 1 : 0));
}

/** 대각선 띠(|y − x| < half), AA 없음 → 계단 에지. */
export function diagonalBandImage(size: number, half: number): LabImage {
  return alphaFieldImage(size, size, (x, y) => (Math.abs(y - x) < half ? 1 : 0));
}

/** 대각선 띠 + 선형 AA(거리 기반 부분 커버리지). */
export function diagonalBandImageAa(size: number, half: number): LabImage {
  return alphaFieldImage(size, size, (x, y) => {
    const d = Math.abs(y + 0.5 - (x + 0.5)) / Math.SQRT2;
    return Math.max(0, Math.min(1, half - d + 0.5));
  });
}

/** x 방향 사인 격자(주기 periodPx) 회색 이미지. */
export function sineImage(size: number, periodPx: number, amplitude = 100): LabImage {
  return grayFieldImage(size, size, (x) => 128 + amplitude * Math.sin((2 * Math.PI * x) / periodPx));
}

/** 시드 고정 잡음 회색 이미지. */
export function noiseImage(size: number, seed = 1, amplitude = 100): LabImage {
  const rng = new Pcg32(seed, 0x51);
  const values = new Float32Array(size * size);
  for (let i = 0; i < values.length; i += 1) values[i] = 128 + (rng.nextF32() * 2 - 1) * amplitude;
  return grayFieldImage(size, size, (x, y) => values[y * size + x] ?? 128);
}

/** 이미지를 (dx, dy)만큼 옮긴다(밖은 투명). */
export function shiftImage(img: LabImage, dx: number, dy: number): LabImage {
  const out = solidImage(img.width, img.height);
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      const o = (sy * img.width + sx) * 4;
      setPixel(out, x, y, [img.data[o] ?? 0, img.data[o + 1] ?? 0, img.data[o + 2] ?? 0, img.data[o + 3] ?? 0]);
    }
  }
  return out;
}

/** 알파 반전(잉크 ↔ 빈). */
export function invertAlpha(img: LabImage): LabImage {
  const out = solidImage(img.width, img.height);
  for (let i = 0; i < img.width * img.height; i += 1) {
    out.data[i * 4 + 3] = 255 - (img.data[i * 4 + 3] ?? 0);
  }
  return out;
}

export function alphaSum(img: LabImage): number {
  let s = 0;
  for (let i = 3; i < img.data.length; i += 4) s += img.data[i] ?? 0;
  return s;
}

/** 가짜 레인 환경(단조 증가 시계, 1 ms씩). */
export function fakeEnv(step = 1): LaneEnvironment {
  let t = 0;
  return {
    gpu: null,
    clock: {
      now: () => {
        t += step;
        return t;
      },
    },
    userAgent: "vitest/node",
  };
}

export function fakeReceipt(partial: Partial<StrokeReceipt> = {}): StrokeReceipt {
  return {
    dabCount: 100,
    submitCount: 4,
    gpuTimeMs: null,
    timingSource: "unavailable",
    frameTimesMs: [1, 2, 3, 4],
    overflowDabs: 0,
    poolTilesUsed: 3,
    ...partial,
  };
}
