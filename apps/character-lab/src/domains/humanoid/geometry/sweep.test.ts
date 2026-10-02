import { describe, expect, it } from "vitest";

import { v3Dot, v3Length, type Vec2, type Vec3 } from "../../../shared/math";

import { mirrorMapX, quadMeshEdgeStats } from "./quad-mesh";
import { ellipseProfile, framesAlongPath, frameToWorld, mirrorRingsX, sweepRings, sweepSection, symmetricRingXZ } from "./sweep";

describe("ellipseProfile", () => {
  it("n점이고 점 0은 +x, n/4는 +y, 반지름은 rx·ry다", () => {
    const profile = ellipseProfile(8, 0.2, 0.1);
    expect(profile).toHaveLength(8);
    expect(profile[0][0]).toBeCloseTo(0.2, 9);
    expect(profile[0][1]).toBeCloseTo(0, 9);
    expect(profile[2][0]).toBeCloseTo(0, 9);
    expect(profile[2][1]).toBeCloseTo(0.1, 9);
  });

  it("고조파가 반지름을 변조한다(2차 cos: +x에서 늘고 +y에서 준다)", () => {
    const base = ellipseProfile(8, 0.1, 0.1);
    const modulated = ellipseProfile(8, 0.1, 0.1, [{ m: 2, amplitude: 0.2 }]);
    expect(modulated[0][0]).toBeCloseTo(base[0][0] * 1.2, 9);
    expect(modulated[2][1]).toBeCloseTo(base[2][1] * 0.8, 9);
  });
});

describe("framesAlongPath", () => {
  const path: Vec3[] = [
    [0, 0, 0],
    [0, 0.5, 0],
    [0, 1, 0],
  ];

  it("접선·u·v가 정규 직교이고 v = 접선 × u 이다", () => {
    const frames = framesAlongPath(path, [1, 0, 0]);
    expect(frames).toHaveLength(3);
    for (const frame of frames) {
      expect(v3Length(frame.tangent)).toBeCloseTo(1, 9);
      expect(v3Length(frame.u)).toBeCloseTo(1, 9);
      expect(v3Length(frame.v)).toBeCloseTo(1, 9);
      expect(v3Dot(frame.tangent, frame.u)).toBeCloseTo(0, 9);
      expect(v3Dot(frame.u, frame.v)).toBeCloseTo(0, 9);
      expect(v3Dot(frame.tangent, frame.v)).toBeCloseTo(0, 9);
    }
    expect(frames[0].u).toEqual([1, 0, 0]);
  });

  it("uHint가 접선과 평행하거나 점이 2개 미만이면 throw한다(무음 뒤틀림 금지)", () => {
    expect(() => framesAlongPath(path, [0, 1, 0])).toThrow(/평행/u);
    expect(() => framesAlongPath([[0, 0, 0]], [1, 0, 0])).toThrow(/2개 이상/u);
  });

  it("frameToWorld와 sweepRings는 프레임 원점 기준으로 단면을 배치하고 스케일을 적용한다", () => {
    const frames = framesAlongPath(path, [1, 0, 0]);
    const world = frameToWorld(frames[1], [0.1, 0.2]);
    expect(world[0]).toBeCloseTo(0.1, 9);
    expect(world[1]).toBeCloseTo(0.5, 9);
    expect(Math.abs(world[2])).toBeCloseTo(0.2, 9);
    const profile: Vec2[] = [
      [1, 0],
      [0, 1],
    ];
    const rings = sweepRings(profile, frames, [[1, 1], [2, 2], [1, 1]]);
    expect(rings).toHaveLength(3);
    expect(Math.hypot(rings[1][0][0], rings[1][0][2])).toBeCloseTo(2, 9);
  });
});

describe("symmetricRingXZ·mirrorRingsX", () => {
  it("링 점 c와 n−c가 x 부호만 다르고 c = 0, n/2는 x = 0이다(정확한 대칭)", () => {
    const ring = symmetricRingXZ(12, [0, 1, 0], 0.2, 0.15, (theta) => 1 + 0.1 * Math.cos(2 * theta), (theta) => 0.01 * Math.cos(theta));
    expect(ring).toHaveLength(12);
    expect(ring[0][0]).toBe(0);
    expect(ring[6][0]).toBe(0);
    for (let c = 1; c < 6; c += 1) {
      expect(ring[12 - c][0]).toBe(-ring[c][0]);
      expect(ring[12 - c][1]).toBe(ring[c][1]);
      expect(ring[12 - c][2]).toBe(ring[c][2]);
    }
    expect(() => symmetricRingXZ(7, [0, 0, 0], 1, 1)).toThrow(/짝수/u);
  });

  it("mirrorRingsX는 x만 뒤집는다", () => {
    const mirrored = mirrorRingsX([[[0.1, 0.2, 0.3]], [[-0.4, 0.5, 0.6]]]);
    expect(mirrored).toEqual([[[-0.1, 0.2, 0.3]], [[0.4, 0.5, 0.6]]]);
  });
});

describe("sweepSection", () => {
  const profile = ellipseProfile(8, 0.1, 0.08);
  const frames = framesAlongPath(
    [
      [0, 0, 0],
      [0, 0.2, 0],
      [0, 0.4, 0],
      [0, 0.6, 0],
    ],
    [1, 0, 0],
  );
  const tube = sweepSection(profile, frames);

  it("링 4 × 8점이고 쿼드 3열 × 8면의 열린 튜브(경계 간선 16 = 양 끝 링, 면 3개 이상 간선 없음, 감김 일관)다", () => {
    expect(tube.positions.length / 3).toBe(32);
    expect(tube.faces.length / 4).toBe(24);
    const stats = quadMeshEdgeStats(tube);
    // nonManifoldEdges는 면이 2개가 아닌 간선(= 경계 포함)이므로 경계 16과 같아야 면 3개 이상 간선이 없다는 뜻이다
    expect(stats.nonManifoldEdges).toBe(16);
    expect(stats.boundaryEdges).toBe(16);
    expect(stats.inconsistentEdges).toBe(0);
    expect(stats.isolatedVertices).toBe(0);
  });

  it("원통 UV(u = 둘레, v = 진행)가 [0,1] 안이고 솔기 복제로 UV 정점이 (n+1) × 링이다", () => {
    expect(tube.uvs.length / 2).toBe(9 * 4);
    for (let i = 0; i < tube.uvs.length; i += 1) {
      expect(tube.uvs[i]).toBeGreaterThanOrEqual(0);
      expect(tube.uvs[i]).toBeLessThanOrEqual(1);
    }
  });

  it("바깥 방향 감김: 모든 면의 법선이 축에서 멀어진다", () => {
    for (let f = 0; f < tube.faces.length; f += 4) {
      const p = (k: number): Vec3 => [tube.positions[tube.faces[f + k] * 3], tube.positions[tube.faces[f + k] * 3 + 1], tube.positions[tube.faces[f + k] * 3 + 2]];
      const [a, b, c, d] = [p(0), p(1), p(2), p(3)];
      const e1: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const e2: Vec3 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
      const normal: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const centroid: Vec3 = [(a[0] + b[0] + c[0] + d[0]) / 4, 0, (a[2] + b[2] + c[2] + d[2]) / 4];
      expect(v3Dot(normal, centroid)).toBeGreaterThan(0);
    }
  });

  it("프로파일이 좌우 대칭이면 위치도 x 거울 대칭이다", () => {
    const mirror = mirrorMapX(tube.positions, 1e-6);
    for (let i = 0; i < mirror.length; i += 1) expect(mirror[i]).toBeGreaterThanOrEqual(0);
  });
});
