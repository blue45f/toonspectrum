import { describe, expect, it } from "vitest";

import { createPrng } from "../shared/prng";

import { TRIANGLE_GROUP_SIZE, computeGroupBoxes, faceNormal, interpolateUv, rayIntersectsBox, raycastTriangles, triangleVertices } from "./triangle-pick";

import type { Vec3 } from "../contracts";
import type { LocalRay } from "./triangle-pick";

/** z=0 평면의 단위 직각삼각형 (0,0,0)-(1,0,0)-(0,1,0) */
const TRI_POSITIONS = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const TRI_INDICES = new Uint16Array([0, 1, 2]);

function ray(origin: Vec3, direction: Vec3): LocalRay {
  return { origin, direction };
}

describe("raycastTriangles", () => {
  it("정면 교차: t·무게중심(u,v)이 해석값과 같다", () => {
    const hit = raycastTriangles(TRI_POSITIONS, TRI_INDICES, null, ray([0.25, 0.5, 2], [0, 0, -1]));
    expect(hit?.triangle).toBe(0);
    expect(hit?.t).toBeCloseTo(2, 6);
    expect(hit?.u).toBeCloseTo(0.25, 6);
    expect(hit?.v).toBeCloseTo(0.5, 6);
  });

  it("양면이다: 뒤쪽에서 쏴도 맞는다", () => {
    const hit = raycastTriangles(TRI_POSITIONS, TRI_INDICES, null, ray([0.25, 0.25, -3], [0, 0, 1]));
    expect(hit?.t).toBeCloseTo(3, 6);
  });

  it("삼각형 밖·평행·뒤로 향한 광선은 null이다", () => {
    expect(raycastTriangles(TRI_POSITIONS, TRI_INDICES, null, ray([0.9, 0.9, 2], [0, 0, -1]))).toBeNull();
    expect(raycastTriangles(TRI_POSITIONS, TRI_INDICES, null, ray([0.2, 0.2, 1], [1, 0, 0]))).toBeNull();
    expect(raycastTriangles(TRI_POSITIONS, TRI_INDICES, null, ray([0.2, 0.2, 2], [0, 0, 1]))).toBeNull();
  });

  it("방향을 정규화하지 않아도 t는 그 방향 길이 기준이다(점 = origin + direction × t)", () => {
    const hit = raycastTriangles(TRI_POSITIONS, TRI_INDICES, null, ray([0.25, 0.25, 4], [0, 0, -2]));
    expect(hit?.t).toBeCloseTo(2, 6);
  });

  it("maxT보다 먼 교차는 무시하고 가장 가까운 삼각형을 고른다", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1]);
    const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);
    const near = raycastTriangles(positions, indices, null, ray([0.2, 0.2, 3], [0, 0, -1]));
    expect(near?.triangle).toBe(1);
    expect(near?.t).toBeCloseTo(2, 6);
    expect(raycastTriangles(positions, indices, null, ray([0.2, 0.2, 3], [0, 0, -1]), 1.5)).toBeNull();
  });

  it("묶음 AABB 가속은 전수 검사와 같은 결과를 낸다(결정적 무작위 삼각형 300개, 광선 200개)", () => {
    const prng = createPrng(42);
    const triangleCount = TRIANGLE_GROUP_SIZE * 4 + 17;
    const positions = new Float32Array(triangleCount * 9);
    const indices = new Uint32Array(triangleCount * 3);
    for (let tri = 0; tri < triangleCount; tri += 1) {
      const cx = prng.next() * 2 - 1;
      const cy = prng.next() * 2 - 1;
      const cz = prng.next() * 2 - 1;
      for (let k = 0; k < 3; k += 1) {
        positions[tri * 9 + k * 3] = cx + (prng.next() - 0.5) * 0.3;
        positions[tri * 9 + k * 3 + 1] = cy + (prng.next() - 0.5) * 0.3;
        positions[tri * 9 + k * 3 + 2] = cz + (prng.next() - 0.5) * 0.3;
        indices[tri * 3 + k] = tri * 3 + k;
      }
    }
    const boxes = computeGroupBoxes(positions, indices);
    expect(boxes).toHaveLength(Math.ceil(triangleCount / TRIANGLE_GROUP_SIZE) * 6);
    let hits = 0;
    for (let i = 0; i < 200; i += 1) {
      const origin: Vec3 = [prng.next() * 4 - 2, prng.next() * 4 - 2, 3];
      const target: Vec3 = [prng.next() * 2 - 1, prng.next() * 2 - 1, prng.next() * 2 - 1];
      const direction: Vec3 = [target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]];
      const brute = raycastTriangles(positions, indices, null, ray(origin, direction));
      const fast = raycastTriangles(positions, indices, boxes, ray(origin, direction));
      expect(fast).toEqual(brute);
      if (brute) hits += 1;
    }
    expect(hits).toBeGreaterThan(20);
  });
});

describe("rayIntersectsBox", () => {
  const box = new Float32Array([-1, -1, -1, 1, 1, 1]);

  it("정면·비스듬한 교차와 빗나감", () => {
    expect(rayIntersectsBox(ray([0, 0, 5], [0, 0, -1]), box, 0, Infinity)).toBe(true);
    expect(rayIntersectsBox(ray([3, 0, 5], [-0.5, 0, -1]), box, 0, Infinity)).toBe(true);
    expect(rayIntersectsBox(ray([3, 0, 5], [0.5, 0, -1]), box, 0, Infinity)).toBe(false);
  });

  it("축 평행 광선은 슬랩 안에 있을 때만 교차하고 maxT를 넘는 박스는 기각한다", () => {
    expect(rayIntersectsBox(ray([0.5, 0.5, 5], [0, 0, -1]), box, 0, Infinity)).toBe(true);
    expect(rayIntersectsBox(ray([2, 0, 5], [0, 0, -1]), box, 0, Infinity)).toBe(false);
    expect(rayIntersectsBox(ray([0, 0, 5], [0, 0, -1]), box, 0, 3)).toBe(false);
    expect(rayIntersectsBox(ray([0, 0, 5], [0, 0, -1]), box, 0, 4.5)).toBe(true);
  });
});

describe("보간·법선", () => {
  it("interpolateUv: 정점 UV를 무게중심으로 보간하고 UV가 없으면 [0,0]", () => {
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
    const hit = { triangle: 0, t: 1, u: 0.25, v: 0.5 };
    expect(interpolateUv(uvs, TRI_INDICES, hit)).toEqual([0.25, 0.5]);
    expect(interpolateUv(null, TRI_INDICES, hit)).toEqual([0, 0]);
  });

  it("faceNormal: 오른손 규칙 단위 법선, 퇴화 삼각형은 null", () => {
    const [a, b, c] = triangleVertices(TRI_POSITIONS, TRI_INDICES, 0);
    expect(faceNormal(a, b, c)).toEqual([0, 0, 1]);
    expect(faceNormal(a, c, b)).toEqual([0, 0, -1]);
    expect(faceNormal(a, a, b)).toBeNull();
  });
});
