import { describe, expect, it } from "vitest";

import { CHARACTER_SLOT_KINDS } from "../../contracts";
import { characterPackageManifestFixture } from "../../testing/manifest-fixtures";

import { AUTHORED_CHARACTER_MANIFEST_SCHEMA_ID, AUTHORED_SLOT_MAPPING_SCHEMA_ID, convertAuthoredCharacterManifest, detectManifestFormat, parseAnyCharacterManifest, parseAuthoredSlotMapping } from "./authored-character-manifest";

function authoredFixture() {
  return {
    schema: AUTHORED_CHARACTER_MANIFEST_SCHEMA_ID,
    id: "mini",
    displayName: "미니",
    role: "primary",
    license: "CC0-1.0",
    generator: { pipeline: "kit (pipelineVersion 3)" },
    pipelineRun: { pipelineManifestConfigDigest: "digest" },
    files: { glb: { path: "mini.glb", bytes: 4, sha256: "a".repeat(64) }, slotMapping: { path: "slot-mapping.json" }, contactSheet: { path: "sheet.png", bytes: 1, sha256: "b".repeat(64) } },
    skeleton: { present: true, skins: [{ name: "Armature", joints: ["mixamorig:Hips", "mixamorig:Spine"] }] },
    humanoidBones: [
      { vrm: "hips", node: "mixamorig:Hips", presentInGlb: true },
      { vrm: "spine", node: "mixamorig:Spine", presentInGlb: true },
      { vrm: "head", node: "mixamorig:Head", presentInGlb: false },
      { vrm: "notBone", node: "X" },
    ],
    shapeKeys: [
      { name: "faceEyeSizeBig", mesh: "Body", kind: "semantic-identity", contractMorphName: "param:eyeSize:+" },
      { name: "faceEyeSizeSmall", mesh: "Body", kind: "semantic-identity" },
      { name: "vrc_v_aa", mesh: "Body", kind: "expression-source", facsHint: { units: ["jawOpen"], approximate: true } },
      { name: "Blink", mesh: "EyeL", kind: "expression-source" },
      { name: "Blink", mesh: "EyeR", kind: "expression-source" },
      { name: "weird", mesh: "Body" },
    ],
    expressions: { vrmPresets: [{ name: "happy", contractFacsUnit: "mouthSmile" }], vrmCustom: [{ name: "tsFaceEyeSizeBig" }] },
    partMeshes: [
      { node: "TS_AuthoredHair_soft-bob_LOD0", part: "hair", lod: 0, triangles: 100 },
      { node: "TS_AuthoredHair_soft-bob_LOD1", part: "hair", lod: 1, triangles: 50 },
      { node: "Body", part: "body", babylonLoad: { splitInto: ["Body_primitive0", "Body_primitive1"] } },
      { node: "Mystery" },
    ],
    quality: { score: 95, passed: true, minimumScore: 90, issues: [{ code: "info.x", message: "ok", severity: "info" }] },
    gaps: [{ id: "g1", severity: "low", summary: "격차" }],
  };
}

/** slot-mapping.json의 capabilities는 15슬롯 전부를 담는다(계약 slotCapabilityMapSchema = 완전 레코드). */
const slotMappingFixture = {
  schema: AUTHORED_SLOT_MAPPING_SCHEMA_ID,
  characterId: "mini",
  capabilities: {
    ...Object.fromEntries(CHARACTER_SLOT_KINDS.map((slot) => [slot, { status: "available" }])),
    top: { status: "unavailable", reasonKo: "상의 없음" },
    hair: { status: "partial", reasonKo: "1종" },
  },
  slots: [{ slot: "top", status: "unavailable", missing: ["상의 메시"] }],
};

describe("authored/authored-character-manifest", () => {
  it("실제 형식 manifest를 계약 형식으로 변환하고 매핑 확장을 채운다", () => {
    const result = convertAuthoredCharacterManifest(authoredFixture() as never, null, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { manifest, conversion } = { manifest: result.conversion.manifest, conversion: result.conversion };
    expect(manifest.kind).toBe("toonstudio.character-package");
    expect(manifest.characterId).toBe("mini");
    expect(manifest.pipelineVersion).toBe(3);
    expect(manifest.configDigest).toBe("digest");
    expect(manifest.capabilities.authoredHair).toEqual({ enabled: true, style: "soft-bob", lodTriangles: [100, 50], replacedSourceMeshes: [] });
    expect(manifest.capabilities.semanticFaceShapes.shapeKeys).toEqual(["Body:faceEyeSizeBig", "Body:faceEyeSizeSmall"]);
    expect(manifest.capabilities.vrmCustomExpressions).toEqual({ status: "ok", names: ["tsFaceEyeSizeBig"] });
    expect(manifest.capabilities.lods).toBe(true);
    expect(manifest.files.glb).toEqual({ path: "mini.glb", bytes: 4, sha256: "a".repeat(64) });
    expect(manifest.files.thumbnail?.path).toBe("sheet.png");
    expect(manifest.files.slotMapping).toBeUndefined();
    expect(manifest.quality).toEqual({ score: 95, passed: true, minimumScore: 90, report: "manifest.json#quality" });
    expect(manifest.provenance.license).toBe("CC0-1.0");
    expect(manifest.characterLab?.boneMap).toEqual({ "mixamorig:Hips": "hips", "mixamorig:Spine": "spine" });
    expect(manifest.characterLab?.meshRoles).toEqual({
      "TS_AuthoredHair_soft-bob_LOD0": "hair",
      "TS_AuthoredHair_soft-bob_LOD1": "hair",
      Body: "skin",
      Body_primitive0: "skin",
      Body_primitive1: "skin",
    });
    expect(manifest.characterLab?.shapeKeyMap).toEqual({
      "Body:faceEyeSizeBig": "param:eyeSize:+",
      faceEyeSizeBig: "param:eyeSize:+",
      "Body:faceEyeSizeSmall": "param:eyeSize:-",
      faceEyeSizeSmall: "param:eyeSize:-",
      "Body:vrc_v_aa": "facs:jawOpen",
      vrc_v_aa: "facs:jawOpen",
      "EyeL:Blink": "facs:eyeBlinkLeft",
      "EyeR:Blink": "facs:eyeBlinkLeft",
    });
    expect(conversion.jointNodes).toEqual(["mixamorig:Hips", "mixamorig:Spine"]);
    expect(conversion.meshNodes).toContain("Mystery");
    expect(conversion.morphTargetNames).toContain("Body:weird");
    expect(conversion.gaps).toEqual([{ id: "g1", severity: "low", summary: "격차" }]);
    expect(conversion.qualityIssues).toEqual([{ code: "info.x", message: "ok", severity: "info" }]);
    expect(conversion.slotMappingPath).toBe("slot-mapping.json");
  });

  it("slot-mapping.json이 있으면 characterLab.slotCapabilities로 반영된다", () => {
    const parsed = parseAnyCharacterManifest(authoredFixture(), slotMappingFixture, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.format).toBe("authored-character");
    expect(parsed.manifest.characterLab?.slotCapabilities?.top).toEqual({ status: "unavailable", reasonKo: "상의 없음" });
    expect(parsed.manifest.characterLab?.slotCapabilities?.hair).toEqual({ status: "partial", reasonKo: "1종" });
    expect(parsed.manifest.characterLab?.slotCapabilities?.eyes).toEqual({ status: "available" });
    expect(Object.keys(parsed.manifest.characterLab?.slotCapabilities ?? {}).length).toBe(15);
    const partialMapping = parseAuthoredSlotMapping({ ...slotMappingFixture, capabilities: { top: { status: "unavailable" } } });
    expect(partialMapping.ok).toBe(false);
    expect(parsed.conversion?.slotMapping?.slots[0]?.missing).toEqual(["상의 메시"]);
    const mapping = parseAuthoredSlotMapping({ schema: "wrong" });
    expect(mapping.ok).toBe(false);
    if (!mapping.ok) expect(mapping.reasonKo).toMatch(/slot-mapping\.json 형식/u);
  });

  it("계약 형식은 그대로 통과하고 알 수 없는 형식·깨진 manifest는 LabFailure", () => {
    const contract = parseAnyCharacterManifest(characterPackageManifestFixture(), undefined, 1);
    expect(contract.ok && contract.format).toBe("character-package");
    expect(contract.ok && contract.conversion).toBeNull();
    expect(detectManifestFormat({ kind: "toonstudio.character-package" })).toBe("character-package");
    expect(detectManifestFormat({ schema: AUTHORED_CHARACTER_MANIFEST_SCHEMA_ID })).toBe("authored-character");
    expect(detectManifestFormat("x")).toBeNull();
    const unknown = parseAnyCharacterManifest({ hello: 1 }, undefined, 1);
    expect(unknown.ok === false && unknown.failure.code).toBe("package-manifest-unknown-format");
    const broken = parseAnyCharacterManifest({ ...authoredFixture(), id: "BAD ID" }, undefined, 1);
    expect(broken.ok === false && broken.failure.code).toBe("authored-manifest-invalid");
    expect(broken.ok === false && broken.failure.reasonKo).toMatch(/id 형식/u);
    const badMapping = parseAnyCharacterManifest(authoredFixture(), { schema: "nope" }, 1);
    expect(badMapping.ok === false && badMapping.failure.code).toBe("authored-slot-mapping-invalid");
  });
});
