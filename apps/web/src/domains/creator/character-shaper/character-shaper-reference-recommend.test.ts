/**
 * character-shaper-reference-recommend — 온디바이스 휴리스틱 추천 테스트.
 *
 * 합성 버퍼(흰 배경 + 단색 실루엣)로 각 차원의 분기(체형 구간, 헤어 길이/볼륨,
 * 원피스/분리형 상의, 바지/치마)를 검증한다. 추천은 결정적이므로 같은 입력에 같은
 * entry id가 나와야 한다.
 */
import { describe, expect, it } from "vitest";

import {
  recommendReferencePresetCombination,
} from "./character-shaper-reference-recommend";

import type { ReferenceRecommendImage } from "./character-shaper-reference-recommend";

type RGBA = readonly [number, number, number, number];

const WHITE: RGBA = [255, 255, 255, 255];
const INK: RGBA = [40, 40, 40, 255];
const TOP_COLOR: RGBA = [200, 120, 120, 255];
const BOTTOM_COLOR: RGBA = [50, 70, 150, 255];

function makeImage(
  width: number,
  height: number,
  paint: (x: number, y: number) => RGBA,
): ReferenceRecommendImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width, height, data };
}

function inRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return x >= x0 && x < x1 && y >= y0 && y < y1;
}

function dimensionEntryId(
  result: Extract<ReturnType<typeof recommendReferencePresetCombination>, { ok: true }>,
  dimension: string,
): string | null {
  return result.dimensions.find((entry) => entry.dimension === dimension)?.entry.id ?? null;
}

describe("recommendReferencePresetCombination", () => {
  it("실루엣이 없으면 실패 사유를 돌려준다 (흰 배경)", () => {
    const image = makeImage(16, 16, () => WHITE);
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("실루엣");
  });

  it("완전 투명 이미지도 실루엣 없음으로 처리한다", () => {
    const image = makeImage(16, 16, () => [0, 0, 0, 0]);
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(false);
  });

  it("키 크고 마른 실루엣은 9두신 체형을 고른다", () => {
    const image = makeImage(20, 44, (x, y) => (inRect(x, y, 8, 4, 12, 40) ? INK : WHITE));
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dimensionEntryId(result, "body")).toBe("body:runway-9");
    // 일자형 한 덩어리 실루엣은 원피스로 읽히고 하의 차원은 생략된다.
    expect(dimensionEntryId(result, "top")).toBe("top:dress");
    expect(dimensionEntryId(result, "bottom")).toBeNull();
    // 머리 볼륨이 없으면 숏이다.
    expect(dimensionEntryId(result, "hair")).toBe("hair:short");
  });

  it("두 줄기 다리는 긴바지로, 상의 색상을 근거에 적는다", () => {
    const image = makeImage(20, 44, (x, y) => {
      if (inRect(x, y, 8, 4, 12, 22)) return TOP_COLOR;
      if (inRect(x, y, 7, 22, 9, 40) || inRect(x, y, 11, 22, 13, 40)) return BOTTOM_COLOR;
      return WHITE;
    });
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dimensionEntryId(result, "bottom")).toBe("bottom:pants");
    expect(dimensionEntryId(result, "top")).toBe("top:tshirt");
    const top = result.dimensions.find((entry) => entry.dimension === "top");
    expect(top?.reason).toContain("#C87878");
    const bottom = result.dimensions.find((entry) => entry.dimension === "bottom");
    expect(bottom?.reason).toContain("#324696");
  });

  it("짧은 두 줄기 다리는 반바지로 본다", () => {
    const image = makeImage(20, 44, (x, y) => {
      if (inRect(x, y, 8, 4, 12, 22)) return TOP_COLOR;
      if (inRect(x, y, 7, 22, 9, 30) || inRect(x, y, 11, 22, 13, 30)) return BOTTOM_COLOR;
      return WHITE;
    });
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dimensionEntryId(result, "bottom")).toBe("bottom:shorts");
  });

  it("크게 벌어지는 한 줄기 치마는 상·하 색이 다르면 플리츠로 본다", () => {
    const image = makeImage(24, 44, (x, y) => {
      if (inRect(x, y, 9, 4, 15, 20)) return TOP_COLOR;
      if (y >= 20 && y < 40) {
        const half = 3 + ((y - 20) * 7) / 20;
        if (x >= 12 - half && x < 12 + half) return BOTTOM_COLOR;
      }
      return WHITE;
    });
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dimensionEntryId(result, "top")).toBe("top:tshirt");
    expect(dimensionEntryId(result, "bottom")).toBe("bottom:pleated");
  });

  it("어깨 아래로 이어지는 옆머리는 긴 머리로 본다", () => {
    const image = makeImage(24, 48, (x, y) => {
      if (inRect(x, y, 9, 4, 15, 12)) return INK; // 머리
      if (inRect(x, y, 6, 8, 9, 26) || inRect(x, y, 15, 8, 18, 26)) return INK; // 옆머리
      if (inRect(x, y, 9, 12, 15, 26)) return TOP_COLOR; // 몸통
      if (inRect(x, y, 9, 26, 12, 42) || inRect(x, y, 12, 26, 15, 42)) return BOTTOM_COLOR;
      return WHITE;
    });
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dimensionEntryId(result, "hair")).toBe("hair:long");
  });

  it("크라운은 넓고 턱선은 좁으면 보브로 본다", () => {
    const image = makeImage(24, 48, (x, y) => {
      if (inRect(x, y, 8, 4, 16, 10)) return INK; // 넓은 크라운
      if (inRect(x, y, 10, 10, 14, 14)) return INK; // 좁은 턱선
      if (inRect(x, y, 9, 14, 15, 26)) return TOP_COLOR;
      if (inRect(x, y, 9, 26, 12, 42) || inRect(x, y, 12, 26, 15, 42)) return BOTTOM_COLOR;
      return WHITE;
    });
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(dimensionEntryId(result, "hair")).toBe("hair:bob");
  });

  it("같은 입력에는 항상 같은 추천을 낸다 (결정성)", () => {
    const paint = (x: number, y: number): RGBA => {
      if (inRect(x, y, 8, 4, 12, 22)) return TOP_COLOR;
      if (inRect(x, y, 7, 22, 9, 40) || inRect(x, y, 11, 22, 13, 40)) return BOTTOM_COLOR;
      return WHITE;
    };
    const first = recommendReferencePresetCombination(makeImage(20, 44, paint));
    const second = recommendReferencePresetCombination(makeImage(20, 44, paint));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.dimensions.map((entry) => `${entry.dimension}:${entry.entry.id}`))
      .toEqual(first.dimensions.map((entry) => `${entry.dimension}:${entry.entry.id}`));
    expect(second.dimensions.map((entry) => entry.reason))
      .toEqual(first.dimensions.map((entry) => entry.reason));
  });

  it("프레임에 꽉 찬 실루엣은 신뢰도가 낮아진다", () => {
    const image = makeImage(20, 20, (x, y) => (inRect(x, y, 1, 1, 19, 19) ? TOP_COLOR : WHITE));
    const result = recommendReferencePresetCombination(image);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const dimension of result.dimensions) {
      expect(dimension.confidence).toBe("low");
    }
  });
});
