import { describe, expect, it } from "vitest";

import { bodyRegionIndex } from "../../../contracts";

import { ARM_COLUMNS, LEG_COLUMNS, TORSO_COLUMNS, buildBodyCage, countUntaggedVertices } from "./cage";
import { mirrorMapX, quadMeshEdgeStats } from "./quad-mesh";
import { catmullClark, subdividedToTriMesh } from "./subdivision";
import { triMeshIsWatertight } from "./tri-mesh";

describe("buildBodyCage", () => {
  const cage = buildBodyCage({});

  it("닫힌 쿼드 다양체다(모든 간선 2면, 감김 일관, 고립 정점 없음)", () => {
    const stats = quadMeshEdgeStats(cage.mesh);
    expect(stats.nonManifoldEdges).toBe(0);
    expect(stats.inconsistentEdges).toBe(0);
    expect(stats.boundaryEdges).toBe(0);
    expect(stats.isolatedVertices).toBe(0);
    expect(cage.mesh.faces.length / 4).toBeGreaterThan(900);
  });

  it("오일러 특성 2(구 위상)이다", () => {
    const stats = quadMeshEdgeStats(cage.mesh);
    const v = cage.mesh.positions.length / 3;
    const f = cage.mesh.faces.length / 4;
    expect(v - stats.edgeCount + f).toBe(2);
  });

  it("모든 정점에 영역 태그가 있고 좌우 영역이 거울 대응한다", () => {
    expect(countUntaggedVertices(cage.mesh)).toBe(0);
    const mirror = mirrorMapX(cage.mesh.positions, 1e-6);
    let missing = 0;
    for (let i = 0; i < mirror.length; i += 1) if (mirror[i] < 0) missing += 1;
    expect(missing).toBe(0);
    const leftArm = bodyRegionIndex("leftArm");
    const rightArm = bodyRegionIndex("rightArm");
    for (let i = 0; i < mirror.length; i += 1) {
      if (cage.mesh.regions[i] === leftArm) expect(cage.mesh.regions[mirror[i]]).toBe(rightArm);
    }
  });

  it("랜드마크 링 길이가 열 수와 같고 상완 링은 어깨 바깥, 허벅지 링은 가랑이 아래다", () => {
    expect(cage.landmarks.leftUpperArmRing).toHaveLength(ARM_COLUMNS);
    expect(cage.landmarks.leftThighRing).toHaveLength(LEG_COLUMNS);
    const x = cage.mesh.positions[cage.landmarks.leftUpperArmRing[0] * 3];
    expect(x).toBeGreaterThan(cage.proportions.shoulderJointX);
    const y = cage.mesh.positions[cage.landmarks.leftThighRing[0] * 3 + 1];
    expect(y).toBeLessThan(cage.proportions.crotchY);
    expect(TORSO_COLUMNS).toBe(20);
  });

  it("같은 파라미터에서 바이트 동일(결정성)이고 다른 파라미터에서도 토폴로지가 같다", () => {
    const again = buildBodyCage({});
    expect(Buffer.from(again.mesh.positions.buffer).equals(Buffer.from(cage.mesh.positions.buffer))).toBe(true);
    const tall = buildBodyCage({ height: 1, shoulderWidth: -1, hip: 1, armLength: 1 });
    expect(tall.mesh.faces).toEqual(cage.mesh.faces);
    expect(tall.mesh.uvFaces).toEqual(cage.mesh.uvFaces);
    expect(tall.mesh.positions.length).toBe(cage.mesh.positions.length);
    expect(tall.proportions.height).toBeGreaterThan(cage.proportions.height);
  });

  it("UV가 [0,1] 안이고 피부 섬(u ≥ 0.5)에만 있다", () => {
    for (let i = 0; i < cage.mesh.uvs.length; i += 2) {
      expect(cage.mesh.uvs[i]).toBeGreaterThanOrEqual(0.5);
      expect(cage.mesh.uvs[i]).toBeLessThanOrEqual(1);
      expect(cage.mesh.uvs[i + 1]).toBeGreaterThanOrEqual(0);
      expect(cage.mesh.uvs[i + 1]).toBeLessThanOrEqual(1);
    }
  });

  it("Catmull-Clark 1회 후 삼각 메시가 수밀이고 법선이 단위 길이다", () => {
    const sub = catmullClark(cage.mesh, 1);
    const tri = subdividedToTriMesh(sub);
    expect(triMeshIsWatertight(tri.positions, tri.indices)).toBe(true);
    for (let i = 0; i < tri.normals.length; i += 3) {
      const len = Math.hypot(tri.normals[i], tri.normals[i + 1], tri.normals[i + 2]);
      expect(Math.abs(len - 1)).toBeLessThan(1e-4);
    }
  });
});
