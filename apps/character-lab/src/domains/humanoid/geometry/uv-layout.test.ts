import { describe, expect, it } from "vitest";

import { DEFAULT_UV_GUTTER, MOUTH_CAP_RECT, MOUTH_TUBE_RECT, UV_ISLANDS, capCellRect, discIslandUvs, fingerBodyRect, fingerStripRect, placeUv, type UvRect } from "./uv-layout";

function overlaps(a: UvRect, b: UvRect, eps = 1e-9): boolean {
  return a.u0 < b.u1 - eps && b.u0 < a.u1 - eps && a.v0 < b.v1 - eps && b.v0 < a.v1 - eps;
}

function inside(rect: UvRect, outer: UvRect): boolean {
  return rect.u0 >= outer.u0 - 1e-9 && rect.u1 <= outer.u1 + 1e-9 && rect.v0 >= outer.v0 - 1e-9 && rect.v1 <= outer.v1 + 1e-9;
}

const UNIT: UvRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

describe("고정 UV 아틀라스", () => {
  const islands = Object.entries(UV_ISLANDS) as Array<[string, UvRect]>;

  it("모든 섬이 [0,1]² 안에 있고 서로 겹치지 않는다", () => {
    for (const [, rect] of islands) expect(inside(rect, UNIT)).toBe(true);
    for (let i = 0; i < islands.length; i += 1) {
      for (let j = i + 1; j < islands.length; j += 1) expect(overlaps(islands[i][1], islands[j][1])).toBe(false);
    }
  });

  it("머리 섬은 u ≤ 0.5, 피부 섬은 u ≥ 0.5다", () => {
    for (const id of ["head", "leftEar", "rightEar"] as const) expect(UV_ISLANDS[id].u1).toBeLessThanOrEqual(0.5);
    for (const id of ["torso", "leftArm", "rightArm", "leftLeg", "rightLeg"] as const) expect(UV_ISLANDS[id].u0).toBeGreaterThanOrEqual(0.5);
  });

  it("손가락 띠 10칸과 캡 띠가 몸 섬·서로와 겹치지 않는다", () => {
    const strips: UvRect[] = [];
    for (const side of ["left", "right"] as const) for (let finger = 0; finger < 5; finger += 1) strips.push(fingerBodyRect(side, finger));
    const caps: UvRect[] = Array.from({ length: 16 }, (_, i) => capCellRect("skin", i));
    for (const rect of [...strips, ...caps]) {
      expect(inside(rect, UNIT)).toBe(true);
      for (const [, island] of islands) expect(overlaps(rect, island)).toBe(false);
    }
    const all = [...strips, ...caps];
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) expect(overlaps(all[i], all[j])).toBe(false);
    for (let finger = 0; finger < 5; finger += 1) {
      expect(inside(fingerBodyRect("left", finger), fingerStripRect("left", finger))).toBe(true);
    }
  });

  it("머리 캡 셀 0~5(폴·귀)와 입 안 섬(캡 셀 6·7 자리)이 서로, 귀·머리 섬과 겹치지 않고 머리 반쪽(u ≤ 0.5)에 있다", () => {
    const cells = Array.from({ length: 6 }, (_, i) => capCellRect("head", i));
    const mouth = [MOUTH_TUBE_RECT, MOUTH_CAP_RECT];
    const head = { u0: 0.2, v0: 0.15, u1: 0.5, v1: 0.3 };
    for (const rect of [...cells, ...mouth]) {
      expect(inside(rect, head)).toBe(true);
      expect(overlaps(rect, UV_ISLANDS.head)).toBe(false);
      expect(overlaps(rect, UV_ISLANDS.leftEar)).toBe(false);
      expect(overlaps(rect, UV_ISLANDS.rightEar)).toBe(false);
      expect(rect.u1).toBeLessThanOrEqual(0.5);
    }
    const all = [...cells, ...mouth];
    for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) expect(overlaps(all[i], all[j])).toBe(false);
    // 입 안 섬 = 머리 캡 셀 6·7을 합친 영역
    const six = capCellRect("head", 6);
    const seven = capCellRect("head", 7);
    expect(MOUTH_TUBE_RECT.u0).toBeCloseTo(six.u0, 9);
    expect(MOUTH_TUBE_RECT.u1).toBeCloseTo(seven.u1, 9);
    expect(MOUTH_CAP_RECT.v1).toBeCloseTo(six.v1, 9);
  });

  it("placeUv는 섬 안쪽으로 거터만큼 들여 배치한다(모서리 포함)", () => {
    const rect = UV_ISLANDS.head;
    const lo = placeUv(rect, 0, 0);
    const hi = placeUv(rect, 1, 1);
    expect(lo[0]).toBeCloseTo(rect.u0 + DEFAULT_UV_GUTTER, 9);
    expect(lo[1]).toBeCloseTo(rect.v0 + DEFAULT_UV_GUTTER, 9);
    expect(hi[0]).toBeCloseTo(rect.u1 - DEFAULT_UV_GUTTER, 9);
    expect(hi[1]).toBeCloseTo(rect.v1 - DEFAULT_UV_GUTTER, 9);
    // 작은 섬은 거터가 변의 1/4을 넘지 않는다
    const tiny: UvRect = { u0: 0, v0: 0, u1: 0.02, v1: 0.02 };
    expect(placeUv(tiny, 0, 0)[0]).toBeCloseTo(0.005, 9);
  });

  it("discIslandUvs는 n+1개(솔기 복제)와 중심을 섬 안에 둔다", () => {
    const { ring, center } = discIslandUvs(UV_ISLANDS.torso, 12);
    expect(ring).toHaveLength(13);
    expect(ring[12]).toEqual(ring[0]);
    for (const uv of [...ring, center]) {
      expect(uv[0]).toBeGreaterThanOrEqual(UV_ISLANDS.torso.u0);
      expect(uv[0]).toBeLessThanOrEqual(UV_ISLANDS.torso.u1);
      expect(uv[1]).toBeGreaterThanOrEqual(UV_ISLANDS.torso.v0);
      expect(uv[1]).toBeLessThanOrEqual(UV_ISLANDS.torso.v1);
    }
  });
});
