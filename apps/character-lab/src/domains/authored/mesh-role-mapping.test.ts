import { describe, expect, it } from "vitest";

import { chooseLodForTriangleBudget, classifyMeshName, classifyMeshRoles, mapMeshRoles, selectHairLod } from "./mesh-role-mapping";

describe("authored/mesh-role-mapping", () => {
  it("TS_AuthoredHair_<style>_LOD<n> 규약과 _Outline·_primitive 접미를 해석한다", () => {
    expect(classifyMeshName("TS_AuthoredHair_short-layered_LOD1")).toMatchObject({ role: "hair", lod: 1, hairStyle: "short-layered", outline: false });
    expect(classifyMeshName("TS_AuthoredHair_soft-bob_LOD0_Outline")).toMatchObject({ role: "hair", lod: 0, outline: true, baseName: "TS_AuthoredHair_soft-bob_LOD0" });
    expect(classifyMeshName("Avatar_Orion_Body_primitive1")).toMatchObject({ role: "skin", baseName: "Avatar_Orion_Body" });
    expect(classifyMeshName("TS_Orion_Brow_L")).toMatchObject({ role: "brow" });
    expect(classifyMeshName("TS_Orion_EyePanel_L")).toMatchObject({ role: "eyeball" });
    expect(classifyMeshName("TS_Orion_Pupil_R")).toMatchObject({ role: "pupil" });
    expect(classifyMeshName("TS_ReferenceHead")).toMatchObject({ role: "head" });
    expect(classifyMeshName("TS_ReferenceNeck")).toMatchObject({ role: "skin" });
  });

  it("규약 밖 이름은 unknown과 한글 사유, override는 역할을 강제한다", () => {
    const unknown = classifyMeshName("Cube.001");
    expect(unknown.role).toBeNull();
    expect(unknown.reasonKo).toMatch(/이름 규약/u);
    expect(classifyMeshName("Cube.001", { "Cube.001": "accessory" }).role).toBe("accessory");
    const bad = classifyMeshName("Cube.001", { "Cube.001": "nope" });
    expect(bad.role).toBeNull();
    expect(bad.reasonKo).toMatch(/어휘 밖/u);
    const result = classifyMeshRoles(["TS_AuthoredHair_soft-bob_LOD0", "TS_AuthoredHair_soft-bob_LOD0_Outline", "Thing"], { Extra: "top" });
    expect(result.roles).toEqual({ Extra: "top", "TS_AuthoredHair_soft-bob_LOD0": "hair", "TS_AuthoredHair_soft-bob_LOD0_Outline": "hair" });
    expect(result.outlines).toEqual(["TS_AuthoredHair_soft-bob_LOD0_Outline"]);
    expect(result.unknown.map((entry) => entry.name)).toEqual(["Thing"]);
    expect(mapMeshRoles(["Body"])).toEqual({ Body: "skin" });
  });

  it("헤어 LOD 선택: 선호 LOD 이하 중 가장 가까운 것, 없으면 가장 상세한 것, 외곽선은 본체를 따른다", () => {
    const names = ["TS_AuthoredHair_hime-cut_LOD0", "TS_AuthoredHair_hime-cut_LOD1", "TS_AuthoredHair_hime-cut_LOD2", "TS_AuthoredHair_hime-cut_LOD1_Outline", "Body"];
    const lod1 = selectHairLod(names, 1);
    expect(lod1.chosen).toBe(1);
    expect(lod1.visible).toEqual(["TS_AuthoredHair_hime-cut_LOD1", "TS_AuthoredHair_hime-cut_LOD1_Outline"]);
    expect(lod1.hidden).toEqual(["TS_AuthoredHair_hime-cut_LOD0", "TS_AuthoredHair_hime-cut_LOD2"]);
    expect(lod1.style).toBe("hime-cut");
    expect(selectHairLod(names, 5).chosen).toBe(2);
    expect(selectHairLod(["TS_AuthoredHair_hime-cut_LOD2"], 0).chosen).toBe(2);
    expect(selectHairLod(["Body"]).chosen).toBeNull();
    expect(selectHairLod(names).lods).toEqual([0, 1, 2]);
  });

  it("삼각형 예산으로 LOD를 고른다", () => {
    expect(chooseLodForTriangleBudget([3752, 1788, 960], 2000)).toBe(1);
    expect(chooseLodForTriangleBudget([3752, 1788, 960], 10000)).toBe(0);
    expect(chooseLodForTriangleBudget([3752, 1788, 960], 100)).toBe(2);
    expect(chooseLodForTriangleBudget([], 100)).toBe(0);
  });
});
