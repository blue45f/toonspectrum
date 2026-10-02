import { describe, expect, it } from "vitest";

import { bodyRegionIndex, paramMorphName } from "../../contracts";

import { bodySurfaceFixture } from "./fixtures";
import { buildNearestMapping, extractOffsetShell, identityMapping, inheritSkinWeights, nearestVertices, buildVertexGrid, penetrationRatio, propagateBodyMorphs, regionBounds, selectBodyVertices } from "./follow-body";

describe("outfit/follow-body", () => {
  const { body, morphs } = bodySurfaceFixture();

  it("격자 k-NN은 전수 탐색과 같은 최근접 정점을 낸다", () => {
    const grid = buildVertexGrid(body.positions, 0.05);
    const count = body.positions.length / 3;
    const queries: Array<[number, number, number]> = [
      [0.05, 1.2, 0.17],
      [-0.3, 0.6, 0.0],
      [0.0, 1.7, 0.0],
      [0.1, 0.02, 0.1],
    ];
    for (const [x, y, z] of queries) {
      const near = nearestVertices(grid, x, y, z, 4);
      expect(near.length).toBe(4);
      let best = Number.POSITIVE_INFINITY;
      for (let v = 0; v < count; v += 1) {
        const d = (body.positions[v * 3] - x) ** 2 + (body.positions[v * 3 + 1] - y) ** 2 + (body.positions[v * 3 + 2] - z) ** 2;
        if (d < best) best = d;
      }
      expect(near[0].distSq).toBeCloseTo(best, 12);
      for (let i = 1; i < near.length; i += 1) expect(near[i].distSq).toBeGreaterThanOrEqual(near[i - 1].distSq);
    }
  });

  it("오프셋 셸은 모든 정점이 법선 방향으로 양의 오프셋을 가지며 스킨 웨이트를 항등 상속한다", () => {
    const mask = selectBodyVertices(body, ["torso"]);
    const shell = extractOffsetShell(body, mask, { offset: 0.01, rim: true });
    expect(shell).not.toBeNull();
    if (!shell) return;
    const count = shell.mesh.positions.length / 3;
    expect(count).toBeGreaterThan(0);
    expect(shell.triangleCount).toBe(shell.mesh.indices.length / 3);
    for (let v = 0; v < count; v += 1) {
      const b = shell.source[v];
      const d =
        (shell.mesh.positions[v * 3] - body.positions[b * 3]) * body.normals[b * 3] +
        (shell.mesh.positions[v * 3 + 1] - body.positions[b * 3 + 1]) * body.normals[b * 3 + 1] +
        (shell.mesh.positions[v * 3 + 2] - body.positions[b * 3 + 2]) * body.normals[b * 3 + 2];
      expect(d).toBeGreaterThan(0.001);
      for (let j = 0; j < 4; j += 1) {
        expect(shell.mesh.jointIndices[v * 4 + j]).toBe(body.jointIndices[b * 4 + j]);
        expect(shell.mesh.jointWeights[v * 4 + j]).toBe(body.jointWeights[b * 4 + j]);
      }
      expect(shell.mapping.bodyVertex[v * 4]).toBe(b);
      expect(shell.mapping.weight[v * 4]).toBe(1);
    }
    // 선택 영역 밖 정점은 포함되지 않는다
    for (let v = 0; v < count; v += 1) expect(body.regionOfVertex[shell.source[v]]).toBe(bodyRegionIndex("torso"));
  });

  it("최근접 매핑으로 상속한 스킨 웨이트는 합이 1이고 가장 가까운 정점의 본을 포함한다", () => {
    const probe = new Float32Array([0.21, 1.1, 0.05, -0.1, 0.5, 0.09, 0.0, 1.75, 0.0]);
    const mapping = buildNearestMapping(probe, body);
    const skin = inheritSkinWeights(mapping, body);
    for (let v = 0; v < 3; v += 1) {
      let sum = 0;
      for (let j = 0; j < 4; j += 1) sum += skin.jointWeights[v * 4 + j];
      expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
      const nearest = mapping.bodyVertex[v * 4];
      const nearestBone = body.jointIndices[nearest * 4];
      const joints = Array.from(skin.jointIndices.subarray(v * 4, v * 4 + 4));
      expect(joints).toContain(nearestBone);
    }
  });

  it("체형 morph 델타가 같은 매핑으로 전파되고 셸은 morph 후에도 관통하지 않는다(≤1%)", () => {
    const mask = selectBodyVertices(body, ["torso", "leftArm", "rightArm"]);
    const shell = extractOffsetShell(body, mask, { offset: 0.008 });
    if (!shell) throw new Error("셸 없음");
    const count = shell.mesh.positions.length / 3;
    const propagated = propagateBodyMorphs(count, morphs, shell.mapping);
    expect(propagated.map((m) => m.name)).toEqual(morphs.map((m) => m.name));
    const shoulder = propagated.find((m) => m.name === paramMorphName("shoulderWidth", "+"));
    const bodyShoulder = morphs.find((m) => m.name === paramMorphName("shoulderWidth", "+"));
    if (!shoulder || !bodyShoulder) throw new Error("morph 없음");
    let moved = 0;
    for (let v = 0; v < count; v += 1) {
      expect(shoulder.deltaPositions[v * 3]).toBeCloseTo(bodyShoulder.deltaPositions[shell.source[v] * 3], 6);
      if (Math.abs(shoulder.deltaPositions[v * 3]) > 1e-6) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
    const ratio = penetrationRatio(shell.mesh.positions, shoulder.deltaPositions, body, bodyShoulder.deltaPositions, shell.mapping);
    expect(ratio).toBeLessThanOrEqual(0.01);
    const bounds = regionBounds(body, ["torso"]);
    expect(bounds?.max[1]).toBeGreaterThan(bounds?.min[1] ?? 0);
    expect(identityMapping(new Uint32Array([3, 5])).bodyVertex[4]).toBe(5);
  });
});
