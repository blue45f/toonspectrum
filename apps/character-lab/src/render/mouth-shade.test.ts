import { describe, expect, it } from "vitest";

import { MOUTH_CAP_TINT, MOUTH_CAP_UV, MOUTH_DEEP_TINT, MOUTH_RIM_TINT, MOUTH_TUBE_UV, generateMouthMask, isMouthInteriorUv, mouthMaskColor } from "./mouth-shade";

const SIZE = 128;

/** 마스크 한 텍셀(행 0 = v 0)의 RGB */
function texel(mask: Uint8Array, u: number, v: number, size = SIZE): readonly [number, number, number, number] {
  const x = Math.min(size - 1, Math.floor(u * size));
  const y = Math.min(size - 1, Math.floor(v * size));
  const i = (y * size + x) * 4;
  return [mask[i] ?? 0, mask[i + 1] ?? 0, mask[i + 2] ?? 0, mask[i + 3] ?? 0];
}

describe("mouth-shade", () => {
  it("입 안 섬 판정: 관·캡 안은 참, 밖은 거짓", () => {
    expect(isMouthInteriorUv(0.42, 0.25)).toBe(true);
    expect(isMouthInteriorUv(0.42, 0.292)).toBe(true);
    expect(isMouthInteriorUv(0.1, 0.1)).toBe(false);
    expect(isMouthInteriorUv(0.42, 0.5)).toBe(false);
  });

  it("마스크 색: 입 밖은 흰색(곱해도 변하지 않음), 관은 입술→안쪽으로 어두워지고 캡이 가장 어둡다", () => {
    expect(mouthMaskColor(0.9, 0.9)).toEqual([1, 1, 1]);
    const rim = mouthMaskColor(0.42, MOUTH_TUBE_UV.v0);
    const deep = mouthMaskColor(0.42, MOUTH_TUBE_UV.v1 - 1e-9);
    expect(rim).toEqual(MOUTH_RIM_TINT);
    for (let c = 0; c < 3; c += 1) {
      expect(deep[c]).toBeLessThan(rim[c] as number);
      expect(deep[c]).toBeCloseTo(MOUTH_DEEP_TINT[c] as number, 3);
    }
    expect(mouthMaskColor(0.42, 0.29)).toEqual(MOUTH_CAP_TINT);
    expect(MOUTH_CAP_TINT[0]).toBeLessThan(MOUTH_DEEP_TINT[0]);
  });

  it("마스크 텍스처: 섬 안은 어둡고 밖은 흰색, 알파는 모두 255, 결정적이다", () => {
    const mask = generateMouthMask(SIZE);
    expect(mask).toHaveLength(SIZE * SIZE * 4);
    expect(texel(mask, 0.9, 0.9)).toEqual([255, 255, 255, 255]);
    expect(texel(mask, 0.05, 0.5)).toEqual([255, 255, 255, 255]);
    const inside = texel(mask, 0.42, 0.25);
    expect(inside[0]).toBeLessThan(160);
    expect(inside[1]).toBeLessThan(80);
    const cap = texel(mask, 0.425, 0.292);
    expect(cap[0]).toBeLessThan(40);
    for (let i = 3; i < mask.length; i += 4) expect(mask[i]).toBe(255);
    expect(generateMouthMask(SIZE)).toEqual(mask);
  });

  it("행 0 = UV v 0: 위쪽 행(v 작음)은 입 밖이라 흰색이고 입 안 행은 v 0.225 근처에서 시작한다", () => {
    const mask = generateMouthMask(SIZE);
    expect(texel(mask, 0.42, 0.01)).toEqual([255, 255, 255, 255]);
    const firstDark = (() => {
      for (let y = 0; y < SIZE; y += 1) {
        const i = (y * SIZE + Math.floor(0.42 * SIZE)) * 4;
        if ((mask[i] ?? 255) < 255) return y / SIZE;
      }
      return -1;
    })();
    expect(firstDark).toBeGreaterThan(MOUTH_TUBE_UV.v0 - 0.02);
    expect(firstDark).toBeLessThan(MOUTH_TUBE_UV.v0 + 0.01);
  });

  it("섬 가장자리는 1.5텍셀 번져 이중선형 보간이 흰색과 섞이지 않는다", () => {
    const mask = generateMouthMask(SIZE);
    const justOutside = texel(mask, MOUTH_TUBE_UV.u0 - 1 / SIZE, 0.25);
    expect(justOutside[0]).toBeLessThan(255);
    const farOutside = texel(mask, MOUTH_TUBE_UV.u0 - 4 / SIZE, 0.25);
    expect(farOutside).toEqual([255, 255, 255, 255]);
  });

  it("캡은 관의 안쪽 끝에 맞닿는다(관 v1 = 캡 v0)", () => {
    expect(MOUTH_CAP_UV.v0).toBe(MOUTH_TUBE_UV.v1);
    expect(MOUTH_CAP_UV.u0).toBeGreaterThanOrEqual(MOUTH_TUBE_UV.u0);
    expect(MOUTH_CAP_UV.u1).toBeLessThanOrEqual(MOUTH_TUBE_UV.u1);
  });

  it("잘못된 크기는 한글 오류", () => {
    expect(() => generateMouthMask(4)).toThrow("입 마스크 크기");
    expect(() => generateMouthMask(100.5)).toThrow("입 마스크 크기");
  });
});
