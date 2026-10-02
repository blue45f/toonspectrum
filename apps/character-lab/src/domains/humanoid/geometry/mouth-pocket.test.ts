import { describe, expect, it } from "vitest";

import { v3Normalize, type Vec3 } from "../../../shared/math";
import { countRayCrossings } from "../fixtures";
import { HEAD_LANDMARKS, worldToHeadLocal } from "../proportions";

import { HEAD_LATITUDES, HEAD_LONGITUDES, MOUTH_COLUMNS, MOUTH_POCKET_RINGS, buildHeadCage, headSurfacePoint, mouthWarp } from "./head-cage";
import { buildTeeth, buildTongue } from "./mouth-builder";
import { mirrorMapX, quadMeshEdgeStats } from "./quad-mesh";
import { catmullClark, subdividedToTriMesh } from "./subdivision";
import { triMeshIsWatertight } from "./tri-mesh";

describe("입 구멍·입 안 주머니(머리 케이지)", () => {
  const cage = buildHeadCage({});
  const local = (index: number): Vec3 => {
    const p: Vec3 = [cage.mesh.positions[index * 3], cage.mesh.positions[index * 3 + 1], cage.mesh.positions[index * 3 + 2]];
    return worldToHeadLocal(cage.frame, p);
  };

  it("쿼드 4개를 걷어 구멍을 내고 링 6 + 폴 캡 주머니를 붙인다(쿼드 528 − 4 + 65 = 589, 닫힌 다양체, 오일러 6)", () => {
    expect(cage.mesh.faces.length / 4).toBe(528 - MOUTH_COLUMNS + (MOUTH_POCKET_RINGS * 10 + 5));
    const stats = quadMeshEdgeStats(cage.mesh);
    expect([stats.nonManifoldEdges, stats.inconsistentEdges, stats.boundaryEdges, stats.isolatedVertices]).toEqual([0, 0, 0, 0]);
    expect(cage.mesh.positions.length / 3 - stats.edgeCount + cage.mesh.faces.length / 4).toBe(6);
  });

  it("가장자리 루프 10정점: 위 입술 5(높은 y)·아래 입술 5(낮은 y), 입 폭은 입꼬리 랜드마크와 같고 좌우 대칭이다", () => {
    expect(cage.mouthRim).toHaveLength(10);
    const upper = cage.mouthRim.slice(0, 5).map(local);
    const lower = cage.mouthRim.slice(5).map(local);
    const line = HEAD_LANDMARKS.mouth[1];
    for (const p of upper) expect(p[1]).toBeGreaterThan(line);
    for (const p of lower) expect(p[1]).toBeLessThan(line);
    expect(Math.abs(upper[0][0])).toBeCloseTo(HEAD_LANDMARKS.mouthHalfWidth, 1);
    expect(upper[0][0]).toBeCloseTo(-upper[4][0], 6);
    expect(lower[0][0]).toBeCloseTo(-lower[4][0], 6);
    const mirror = mirrorMapX(cage.mesh.positions, 1e-5);
    const rimSet = new Set(cage.mouthRim);
    for (const index of cage.mouthRim) expect(rimSet.has(mirror[index])).toBe(true);
  });

  it("중립 입은 얇은 틈이다: 가운데 위·아래 입술 간격이 0.06(로컬) 미만이고 입꼬리로 갈수록 좁아진다", () => {
    const upper = cage.mouthRim.slice(0, 5).map(local);
    const lower = cage.mouthRim.slice(5).reverse().map(local); // 열 14→18로 맞춘다
    const gap = (i: number): number => upper[i][1] - lower[i][1];
    expect(gap(2)).toBeGreaterThan(0.01);
    expect(gap(2)).toBeLessThan(0.06);
    expect(gap(0)).toBeLessThan(gap(2));
    expect(gap(4)).toBeLessThan(gap(2));
  });

  it("mouthWarp는 앞면 입선 주변만 세로로 누르고 좌우 대칭이며 뒤쪽은 그대로다", () => {
    const line = HEAD_LANDMARKS.mouth[1];
    const front: Vec3 = [0.1, line + 0.08, 0.85];
    const warped = mouthWarp(front);
    expect(Math.abs(warped[1] - line)).toBeLessThan(Math.abs(front[1] - line));
    expect(warped[2]).toBeGreaterThan(front[2]);
    const mirrored = mouthWarp([-0.1, line + 0.08, 0.85]);
    expect(mirrored[0]).toBe(-0.1);
    expect(warped[0]).toBe(0.1);
    expect(mirrored[1]).toBeCloseTo(warped[1], 12);
    expect(mirrored[2]).toBeCloseTo(warped[2], 12);
    const back: Vec3 = [0.1, line + 0.08, -0.5];
    expect(mouthWarp(back)).toEqual(back);
    const far: Vec3 = [0.8, line, 0.5];
    expect(mouthWarp(far)[1]).toBeCloseTo(far[1], 6);
    // 헤드 표면 함수와 합성해도 모든 위도 링이 단조(뒤집힘 없음)다
    let previous = Infinity;
    for (let l = 1; l < HEAD_LATITUDES; l += 1) {
      const phi = (Math.PI * l) / HEAD_LATITUDES;
      const y = mouthWarp(headSurfacePoint(v3Normalize([0, Math.cos(phi), Math.sin(phi)])))[1];
      expect(y).toBeLessThan(previous);
      previous = y;
    }
    expect(HEAD_LONGITUDES / 2).toBe(16);
  });

  it("세분 0·1·2회 후에도 머리 메시가 수밀이다(입 안 공동 포함)", () => {
    for (const levels of [0, 1, 2] as const) {
      const tri = subdividedToTriMesh(catmullClark(cage.mesh, levels));
      expect(triMeshIsWatertight(tri.positions, tri.indices)).toBe(true);
    }
  });

  it("치아·혀가 입 안 공동(공기, 피부 고체 밖)에 있고 공동 가운데는 비어 있다", () => {
    for (const levels of [0, 1] as const) {
      const sub = catmullClark(cage.mesh, levels);
      const tri = subdividedToTriMesh(sub);
      for (const mesh of [buildTeeth(cage.frame), buildTongue(cage.frame)]) {
        let inSolid = 0;
        for (let v = 0; v < mesh.positions.length / 3; v += 1) {
          const point: Vec3 = [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
          if (countRayCrossings(point, sub.positions, tri.weldedTriangles) % 2 === 1) inSolid += 1;
        }
        expect(inSolid).toBe(0);
      }
      const toWorld = (p: Vec3): Vec3 => [cage.frame.center[0] + p[0] * cage.frame.scale, cage.frame.center[1] + p[1] * cage.frame.scale, cage.frame.center[2] + p[2] * cage.frame.scale];
      expect(countRayCrossings(toWorld([0, HEAD_LANDMARKS.mouth[1], 0.5]), sub.positions, tri.weldedTriangles) % 2).toBe(0);
      expect(countRayCrossings(toWorld([0.5, HEAD_LANDMARKS.mouth[1], 0.3]), sub.positions, tri.weldedTriangles) % 2).toBe(1);
    }
  });
});
