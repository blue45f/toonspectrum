import { describe, expect, it } from "vitest";

import { minimalHumanoidModelFixture } from "../testing/recipe-fixtures";

import { PART_ROLES, allocatePartIds, allocatePartIdsByRole, countTriangles, rolePartId, validateMeshPartData, type MeshPartData } from "./mesh-data";

function mutate(part: MeshPartData, patch: Partial<MeshPartData>): MeshPartData {
  return { ...part, ...patch };
}

describe("contracts/mesh-data", () => {
  const model = minimalHumanoidModelFixture();
  const skin = model.parts[0] as MeshPartData;

  it("fixture 파츠는 모두 검증을 통과한다", () => {
    for (const part of model.parts) expect(validateMeshPartData(part)).toBeNull();
  });

  it("길이 정합 위반을 잡는다", () => {
    expect(validateMeshPartData(mutate(skin, { normals: new Float32Array(3) }))?.code).toBe("mesh-normals-length");
    expect(validateMeshPartData(mutate(skin, { uvs: new Float32Array(1) }))?.code).toBe("mesh-uvs-length");
    expect(validateMeshPartData(mutate(skin, { indices: new Uint32Array([0, 1]) }))?.code).toBe("mesh-indices-length");
  });

  it("인덱스 범위·NaN·가중치 합을 잡는다", () => {
    expect(validateMeshPartData(mutate(skin, { indices: new Uint32Array([0, 1, 9]) }))?.code).toBe("mesh-index-range");
    const nanPositions = new Float32Array(skin.positions);
    nanPositions[0] = Number.NaN;
    expect(validateMeshPartData(mutate(skin, { positions: nanPositions }))?.code).toBe("mesh-nan");
    const badWeights = new Float32Array(skin.jointWeights as Float32Array);
    badWeights[0] = 0.9;
    expect(validateMeshPartData(mutate(skin, { jointWeights: badWeights }))?.code).toBe("mesh-skin-weight-sum");
    expect(validateMeshPartData(mutate(skin, { jointWeights: undefined }))?.code).toBe("mesh-skin-pair");
    expect(validateMeshPartData(mutate(skin, { partId: 0 }))?.code).toBe("mesh-part-id");
    const failure = validateMeshPartData(mutate(skin, { partId: 0 }));
    expect(failure?.reasonKo).toMatch(/[가-힣]/u);
  });

  it("morph 길이 위반을 잡는다", () => {
    const bad = mutate(skin, { morphs: [{ name: "param:eyeSize:+", deltaPositions: new Float32Array(3) }] });
    expect(validateMeshPartData(bad)?.code).toBe("mesh-morph-length");
  });

  it("allocatePartIds는 1..n을 배정하고 0은 배경이다", () => {
    const palette = allocatePartIds(model.parts);
    expect(Object.keys(palette).map(Number)).toEqual([1, 2]);
    expect(palette[1]?.role).toBe("skin");
    expect(palette[2]?.labelKo).toBe("헤어");
    expect(palette[0]).toBeUndefined();
    expect(countTriangles(model.parts)).toBe(4);
  });

  it("역할 고정 partId는 PART_ROLES 인덱스 + 1이고 결손 역할이 있어도 나머지가 밀리지 않는다", () => {
    expect(PART_ROLES.map((role) => rolePartId(role))).toEqual(PART_ROLES.map((_, index) => index + 1));
    // 모든 역할이 순서대로 하나씩 있으면 순서 기반 팔레트와 같다
    const full = PART_ROLES.map((role) => ({ role }));
    expect(allocatePartIdsByRole(full)).toEqual(allocatePartIds(full));
    // 첫 역할이 비면 순서 기반은 밀리고 역할 고정은 밀리지 않는다(희소 팔레트)
    const [, ...rest] = full;
    const sparse = allocatePartIdsByRole(rest);
    expect(Object.keys(sparse).map(Number)).toEqual(rest.map((part) => rolePartId(part.role)));
    expect(sparse[1]).toBeUndefined();
    expect(allocatePartIds(rest)[1]?.role).toBe(rest[0]?.role);
  });
});
