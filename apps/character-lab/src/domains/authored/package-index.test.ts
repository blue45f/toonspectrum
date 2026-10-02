import { describe, expect, it } from "vitest";

import { characterPackageIndexFixture } from "../../testing/manifest-fixtures";

import { AUTHORED_INDEX_SCHEMA_ID, parseCharacterPackageIndex } from "./package-index";

describe("authored/package-index", () => {
  it("계약 형식 index.json(packages[])을 파싱한다", () => {
    const result = parseCharacterPackageIndex(characterPackageIndexFixture(["mina", "orion"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.index.packages.map((entry) => entry.characterId)).toEqual(["mina", "orion"]);
    expect(result.entries[0]).toMatchObject({ manifestUrl: "/assets/characters/mina/character-package.json", manifestFormat: "character-package", primary: false, glbSha256: null });
    expect(result.entries[0]?.licenseNote).toMatch(/자체 제작/u);
  });

  it("Blender 레인 실제 형식(authored-character-index/1)을 계약 항목으로 정규화한다", () => {
    const json = {
      schema: AUTHORED_INDEX_SCHEMA_ID,
      baseUrl: "/assets/characters/",
      primary: "orion",
      characters: [
        { id: "orion", displayName: "Orion", role: "primary", license: "CC0-1.0", qualityScore: 100, skeleton: true, semanticShapeKeys: 24, hairLodTriangles: [3752, 1788, 960], glbTriangles: 14604, files: { glb: { path: "orion/orion.glb", bytes: 10, sha256: "a".repeat(64) }, manifest: { path: "orion/manifest.json" }, contactSheet: { path: "orion/contact-sheet.png" } } },
        { id: "ref", displayName: "Ref" },
      ],
    };
    const result = parseCharacterPackageIndex(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.index.packages).toEqual([
      { characterId: "orion", displayName: "Orion", baseUrl: "/assets/characters/orion", licenseNote: "CC0-1.0" },
      { characterId: "ref", displayName: "Ref", baseUrl: "/assets/characters/ref" },
    ]);
    expect(result.entries[0]).toMatchObject({
      manifestUrl: "/assets/characters/orion/manifest.json",
      manifestFormat: "authored-character",
      primary: true,
      role: "primary",
      glbSha256: "a".repeat(64),
      glbBytes: 10,
      contactSheetUrl: "/assets/characters/orion/contact-sheet.png",
      summary: { qualityScore: 100, skeleton: true, semanticShapeKeys: 24, hairLodTriangles: [3752, 1788, 960], glbTriangles: 14604 },
    });
    expect(result.entries[1]).toMatchObject({ manifestUrl: "/assets/characters/ref/manifest.json", primary: false, role: null, glbSha256: null, contactSheetUrl: null });
  });

  it("형식이 틀리면 LabFailure(한글 사유)", () => {
    const result = parseCharacterPackageIndex({ nope: true }, 3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("package-index-invalid");
    expect(result.failure.reasonKo).toMatch(/index\.json 형식이 올바르지 않습니다/u);
    expect(result.failure.at).toBe(3);
    expect(parseCharacterPackageIndex({ packages: [{ characterId: "BAD ID", displayName: "x", baseUrl: "/x" }] }).ok).toBe(false);
  });
});
