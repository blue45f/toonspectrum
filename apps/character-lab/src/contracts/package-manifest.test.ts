import { describe, expect, it } from "vitest";

import { characterPackageManifestFixture } from "../testing/manifest-fixtures";

import { characterPackageIndexSchema, parseAuthoredHairMeshName, parseCharacterPackageManifest } from "./package-manifest";

describe("contracts/package-manifest", () => {
  it("pipeline.py 형식 fixture를 수용하고 알 수 없는 상위 키를 보존한다", () => {
    const json = { ...characterPackageManifestFixture(), extraTopLevel: { any: true } };
    const result = parseCharacterPackageManifest(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.capabilities.authoredHair.style).toBe("soft-bob");
      expect(result.manifest.capabilities.semanticFaceShapes.shapeKeys).toHaveLength(24);
      expect((result.manifest as Record<string, unknown>).extraTopLevel).toEqual({ any: true });
      expect(result.manifest.files.glb?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("kind·schemaVersion·sha256 형식을 거부한다", () => {
    const base = characterPackageManifestFixture();
    expect(parseCharacterPackageManifest({ ...base, kind: "other" }).ok).toBe(false);
    expect(parseCharacterPackageManifest({ ...base, schemaVersion: 2 }).ok).toBe(false);
    expect(parseCharacterPackageManifest({ ...base, files: { glb: { path: "a.glb", bytes: 1, sha256: "xyz" } } }).ok).toBe(false);
    expect(parseCharacterPackageManifest({ ...base, characterId: "Bad Id" }).ok).toBe(false);
    const failure = parseCharacterPackageManifest({ ...base, kind: "other" });
    if (!failure.ok) expect(failure.failure.reasonKo).toMatch(/manifest 형식/u);
  });

  it("characterLab 확장은 선택이며 부분 지정을 허용한다", () => {
    const withExt = characterPackageManifestFixture({
      characterLab: { slotCapabilities: { body: { status: "partial", reasonKo: "체형 morph 없음" } }, boneMap: { "mixamorig:Hips": "hips" } },
    });
    const result = parseCharacterPackageManifest(withExt);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.characterLab?.boneMap?.["mixamorig:Hips"]).toBe("hips");
    const bad = characterPackageManifestFixture({ characterLab: { boneMap: { X: "notABone" as never } } });
    expect(parseCharacterPackageManifest(bad).ok).toBe(false);
  });

  it("헤어 메시 규약 파서", () => {
    expect(parseAuthoredHairMeshName("TS_AuthoredHair_soft-bob_LOD1")).toEqual({ style: "soft-bob", lod: 1 });
    expect(parseAuthoredHairMeshName("Body")).toBeNull();
  });

  it("index.json 스키마", () => {
    expect(characterPackageIndexSchema.safeParse({ packages: [{ characterId: "mina", displayName: "미나", baseUrl: "/assets/characters/mina" }] }).success).toBe(true);
    expect(characterPackageIndexSchema.safeParse({ packages: [{ characterId: "mina" }] }).success).toBe(false);
  });
});
