import { describe, expect, it } from "vitest";

import { CHARACTER_SLOT_KINDS } from "../../contracts";
import { BLENDER_FACE_SHAPE_KEYS, characterPackageManifestFixture } from "../../testing/manifest-fixtures";

import { EXPRESSION_AVAILABLE_MIN_UNITS, IDENTITY_SLOT_AXES, capabilitiesFromManifest, compareCapabilities, hairPresetCapability, judgeCapabilities, mappingsFromManifest } from "./package-capability";

import type { SlotKind } from "../../contracts";

const ORION_LIKE_BONES = {
  "mixamorig:Hips": "hips", "mixamorig:Spine": "spine", "mixamorig:Spine1": "chest", "mixamorig:Spine2": "upperChest", "mixamorig:Neck": "neck", "mixamorig:Head": "head",
  "mixamorig:LeftUpLeg": "leftUpperLeg", "mixamorig:LeftLeg": "leftLowerLeg", "mixamorig:LeftFoot": "leftFoot", "mixamorig:RightUpLeg": "rightUpperLeg", "mixamorig:RightLeg": "rightLowerLeg", "mixamorig:RightFoot": "rightFoot",
  "mixamorig:LeftArm": "leftUpperArm", "mixamorig:LeftForeArm": "leftLowerArm", "mixamorig:LeftHand": "leftHand", "mixamorig:RightArm": "rightUpperArm", "mixamorig:RightForeArm": "rightLowerArm", "mixamorig:RightHand": "rightHand",
} as const;

function statuses(map: ReturnType<typeof capabilitiesFromManifest>): Record<SlotKind, string> {
  return Object.fromEntries(CHARACTER_SLOT_KINDS.map((slot) => [slot, map[slot].status])) as Record<SlotKind, string>;
}

describe("authored/package-capability", () => {
  it("24 shape key 전부 → 얼굴 5슬롯 available, 본·의상 없음 → pose/hand-pose/body/의상 unavailable", () => {
    const map = capabilitiesFromManifest(characterPackageManifestFixture());
    expect(statuses(map)).toEqual({
      "face-shape": "available",
      eyes: "available",
      irises: "unavailable",
      nose: "available",
      mouth: "available",
      ears: "available",
      hair: "partial",
      body: "unavailable",
      top: "unavailable",
      bottom: "unavailable",
      shoes: "unavailable",
      accessory: "unavailable",
      expression: "partial",
      pose: "unavailable",
      "hand-pose": "unavailable",
    });
    expect(map.hair.reasonKo).toMatch(/교체형 헤어를 제공하지 않습니다/u);
    expect(map.top.reasonKo).toMatch(/상의 메시가 없습니다/u);
    expect(map.pose.reasonKo).toMatch(/휴머노이드 본이 없습니다/u);
    expect(map.expression.reasonKo).toMatch(/FACS 16유닛 중 \d+개만/u);
  });

  it("한쪽 방향만 있으면 partial('음수 방향 shape key 없음'), 전혀 없으면 unavailable('shape key가 없습니다')", () => {
    const plusOnly = BLENDER_FACE_SHAPE_KEYS.filter((key) => !key.endsWith("Small") && !key.endsWith("Narrow") && !key.endsWith("Low") && !key.endsWith("Down") && !key.endsWith("Short"));
    const partial = capabilitiesFromManifest(characterPackageManifestFixture({ shapeKeys: plusOnly }));
    expect(partial.eyes.status).toBe("partial");
    expect(partial.eyes.reasonKo).toMatch(/음수 방향 shape key 없음/u);
    expect(partial.eyes.reasonKo).toMatch(/눈 크기\(eyeSize\)/u);
    const none = capabilitiesFromManifest(characterPackageManifestFixture({ shapeKeys: [] }));
    expect(none.nose.status).toBe("unavailable");
    expect(none.nose.reasonKo).toBe("패키지에 코 높이(noseHeight), 코 너비(noseWidth), 코 깊이(noseDepth) shape key가 없습니다.");
    const mixed = capabilitiesFromManifest(characterPackageManifestFixture({ shapeKeys: ["faceJawWidthWide", "faceJawWidthNarrow", "faceChinLengthShort"] }));
    expect(mixed["face-shape"].status).toBe("partial");
    expect(mixed["face-shape"].reasonKo).toMatch(/양수 방향 shape key 없음: 턱 길이\(chinLength\)/u);
    expect(mixed["face-shape"].reasonKo).toMatch(/볼 볼륨\(cheekVolume\) shape key가 없습니다/u);
    expect(IDENTITY_SLOT_AXES.ears).toEqual(["earSize"]);
  });

  it("헤어는 구운 스타일 1종만 available이고 다른 프리셋은 unavailable 사유를 받는다", () => {
    const manifest = characterPackageManifestFixture({ hairStyle: "soft-bob" });
    expect(hairPresetCapability(manifest, "hair/soft-bob").status).toBe("available");
    const other = hairPresetCapability(manifest, "hair/twin-tail");
    expect(other.status).toBe("unavailable");
    expect(other.reasonKo).toMatch(/구운 스타일: 'soft-bob'/u);
    expect(hairPresetCapability(characterPackageManifestFixture({ hairStyle: null }), "hair/soft-bob").status).toBe("unavailable");
    expect(hairPresetCapability(manifest, "eyes/almond").reasonKo).toMatch(/헤어 프리셋 id가 아닙니다/u);
    expect(capabilitiesFromManifest(characterPackageManifestFixture({ hairStyle: null })).hair.status).toBe("unavailable");
  });

  it("본 매핑이 필수 15본·손가락 30본을 덮으면 pose/hand-pose available, 일부면 partial", () => {
    const full = judgeCapabilities(characterPackageManifestFixture({ characterLab: { boneMap: { ...ORION_LIKE_BONES, "mixamorig:LeftHandIndex1": "leftIndexProximal" } } }));
    expect(full.capabilities.pose.status).toBe("available");
    expect(full.capabilities.body.status).toBe("partial");
    expect(full.capabilities["hand-pose"].status).toBe("partial");
    expect(full.capabilities["hand-pose"].reasonKo).toMatch(/손가락 본 1\/30만 매핑됨/u);
    const { "mixamorig:LeftHand": _hand, ...missingHand } = ORION_LIKE_BONES;
    const partial = judgeCapabilities(characterPackageManifestFixture({ characterLab: { boneMap: missingHand } }));
    expect(partial.capabilities.pose.status).toBe("partial");
    expect(partial.capabilities.pose.reasonKo).toMatch(/VRM 필수 본 14\/15만 매핑됨\(없음: leftHand\)/u);
  });

  it("표정은 FACS 유닛 수로 판정하고 메시 역할·선언이 irises·의상 슬롯을 바꾼다", () => {
    const names = ["jawOpen", "mouthSmileLeft", "mouthFrownLeft", "browDownLeft", "browInnerUp", "eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "cheekPuff"];
    const manifest = characterPackageManifestFixture({ shapeKeys: [...BLENDER_FACE_SHAPE_KEYS, ...names], characterLab: { meshRoles: { Pupil_L: "pupil", Shirt: "top" } } });
    const judgement = judgeCapabilities(manifest);
    expect(judgement.facsUnits.length).toBeGreaterThanOrEqual(EXPRESSION_AVAILABLE_MIN_UNITS);
    expect(judgement.capabilities.expression.status).toBe("available");
    expect(judgement.capabilities.irises.status).toBe("partial");
    expect(judgement.capabilities.top.status).toBe("partial");
    expect(judgement.capabilities.top.reasonKo).toMatch(/교체 세트 선언/u);
    expect(mappingsFromManifest(manifest).meshes.roles.Shirt).toBe("top");
  });

  it("characterLab.slotCapabilities 선언은 규칙을 덮어쓰고 basis·divergence로 구분된다", () => {
    const manifest = characterPackageManifestFixture({
      characterLab: { slotCapabilities: { top: { status: "available" }, ears: { status: "partial", reasonKo: "소품 없음" } } },
    });
    const judgement = judgeCapabilities(manifest);
    expect(judgement.capabilities.top).toEqual({ status: "available" });
    expect(judgement.capabilities.ears).toEqual({ status: "partial", reasonKo: "소품 없음" });
    expect(judgement.basis.top).toBe("declared");
    expect(judgement.basis.eyes).toBe("rule");
    expect(judgement.ruleOnly.top.status).toBe("unavailable");
    const comparison = compareCapabilities(judgement.ruleOnly, judgement.capabilities);
    expect(comparison.divergent).toEqual([
      { slot: "ears", rule: "available", declared: "partial" },
      { slot: "top", rule: "unavailable", declared: "available" },
    ]);
    expect(comparison.agreeing.length).toBe(13);
  });
});
