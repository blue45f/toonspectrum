import { describe, expect, it } from "vitest";

import { EMPTY_CHARACTER_CAPABILITY_PROFILE } from "../../character-shaper/character-shaper-capability";
import { findCharacterSlotEntry, listCharacterSlotEntries } from "../../character-shaper/character-shaper-catalog";
import { planCharacterSlotApply } from "../../character-shaper/character-shaper-apply-plan";
import { createEmptyCharacterRecipe } from "../../character-shaper/character-shaper-recipe";
import { createAvatarForgeState, sanitizeAvatarForgeState } from "../../vrm/studio-vrm-avatar-forge";
import { createWardrobeEquip } from "../../vrm/studio-vrm-wardrobe";
import { createCharacterDocumentV2, projectCharacterRecipeV1 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3, validateCharacterDocumentV3 } from "../document/character-document-v3";
import { applyCharacterSnapshotSteps, characterDocumentHair, characterDocumentRecipe, characterDocumentSnapshot, planCharacterDocumentSteps } from "./character-shaper-document-plan";

import type { CharacterCapabilityProfile } from "../../character-shaper/character-shaper-contract";

const profile: CharacterCapabilityProfile = { ...EMPTY_CHARACTER_CAPABILITY_PROFILE,
  status: "ready", modelId: "test-model", humanoid: true, wardrobeMetricsReady: true, propsReady: true,
  irisTintable: true, semanticMorphs: { ...EMPTY_CHARACTER_CAPABILITY_PROFILE.semanticMorphs, eyeSize: "native-morph", noseHeight: "native-morph" },
  expressions: ["happy", "sad", "angry", "aa", "ou", "blink"],
};

function document() {
  const recipe = createEmptyCharacterRecipe();
  return migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:plan", model: { assetId: "test-model", assetVersion: "1", contentSha256: null, mode: "compatible" },
    compatibility: { grade: "A", supported: [], partial: [], unsupported: [], sourceRevision: "test:v1" },
    recipe: projectCharacterRecipeV1(recipe), colors: recipe.colors, now: "2026-09-27T00:00:00.000Z",
  }));
}

describe("문서 기반 Shaper apply-plan", () => {
  it("색만 바꾸어도 외부 파츠·정밀 레이어·추가 팔레트·손 원본을 유지한다", () => {
    const initial = document();
    const external = { entryId: "vendor:custom", entryVersion: "4", providerId: "vendor", catalogRevision: "catalog:4", overrides: { fit: 1.2 } };
    const original = validateCharacterDocumentV3({ ...initial,
      recipe: { ...initial.recipe, slots: { hair: external }, accessories: [external], handPose: { left: external } },
      deformation: { layers: [{ kind: "semantic-morph", layerId: "deform:semantic-morphs", name: "보관한 얼굴", enabled: false, values: { eyeSize: 0.7 } }] },
      look: { ...initial.look, colors: { ...initial.look.colors, "custom:robe": "#abcdef" } },
    });
    const next = planCharacterDocumentSteps(original, profile, "both", [], { skin: "#112233" });
    expect(next.recipe).toEqual(original.recipe);
    expect(next.deformation).toEqual(original.deformation);
    expect(next.look.colors["custom:robe"]).toBe("#abcdef");
    expect(next.look.colors.skin).toBe("#112233");
    expect(next.pose).toEqual(original.pose);
  });

  it("기존 wardrobe 점유 규칙과 카탈로그 기본색을 원본 계산에도 적용한다", () => {
    const snapshot = characterDocumentSnapshot(document(), profile, "both");
    const dressed = applyCharacterSnapshotSteps(snapshot, [
      { kind: "wardrobe-equip", slot: "bottom", itemId: "pants" },
      { kind: "wardrobe-equip", slot: "top", itemId: "dress" },
    ]);
    expect(dressed.wardrobe.bottom).toBeUndefined();
    expect(dressed.wardrobe.top?.color).toBe(createWardrobeEquip("dress")?.color);
    const trousers = applyCharacterSnapshotSteps(dressed, [{ kind: "wardrobe-equip", slot: "bottom", itemId: "pants" }]);
    expect(trousers.wardrobe.top).toBeUndefined();
    expect(trousers.wardrobe.bottom?.color).toBe(createWardrobeEquip("pants")?.color);
  });

  it("얼굴 정밀 입력은 실행기와 같은 범위로 정규화하고 다른 레이어를 보존한다", () => {
    const initial = document();
    const next = planCharacterDocumentSteps(initial, profile, "both", [
      { kind: "forge-face", face: { headWidth: 20 } },
      { kind: "semantic-morph", morphs: { eyeSize: 9, noseHeight: -9 } },
    ]);
    const snapshot = characterDocumentSnapshot(next, profile, "both");
    expect(snapshot.forgeFace.headWidth).toBe(sanitizeAvatarForgeState({ ...createAvatarForgeState(), face: { headWidth: 20 } }).face.headWidth);
    expect(snapshot.semanticMorphs).toMatchObject({ eyeSize: 1, noseHeight: -1 });
    expect(initial.deformation.layers).toEqual([]);
  });

  it("헤어 정밀 편집이 기존 팔레트를 overrides에 복사하지 않아 색 해제가 가능하다", () => {
    const hair = listCharacterSlotEntries("hair").find((entry) => entry.apply.kind === "forge-hair" && entry.apply.hair.style !== "none");
    if (!hair) throw new Error("헤어 fixture 없음");
    const initial = document();
    const plan = planCharacterSlotApply(hair, profile, { snapshot: characterDocumentSnapshot(initial, profile, "both"), handSide: "both" });
    const withHair = planCharacterDocumentSteps(initial, profile, "both", plan.steps);
    const tinted = planCharacterDocumentSteps(withHair, profile, "both", [], { hairBase: "#abcdef" });
    const edited = planCharacterDocumentSteps(tinted, profile, "both", [{ kind: "forge-hair", hair: { length: 1.2 } }]);
    const cleared = planCharacterDocumentSteps(edited, profile, "both", [], { hairBase: null });
    expect(edited.recipe.slots.hair?.overrides?.["hair.baseColor"]).not.toBe("#abcdef");
    expect(characterDocumentHair(cleared).baseColor).toBe(characterDocumentHair(withHair).baseColor);
    expect(characterDocumentHair(cleared).length).toBe(1.2);
  });

  it("표정 식별자는 기존 호스트와 같으며 방향 포즈를 단위 회전으로 저장하지 않는다", () => {
    const initial = document();
    const entry = findCharacterSlotEntry("expression:xf_joy");
    if (!entry) throw new Error("표정 fixture 없음");
    const plan = planCharacterSlotApply(entry, profile, { snapshot: characterDocumentSnapshot(initial, profile, "both"), handSide: "both" });
    const changed = planCharacterDocumentSteps(initial, profile, "both", plan.steps);
    expect(changed.expression.activeEntryId).toBe("preset:xf_joy");
    const presetExpression = planCharacterDocumentSteps(initial, profile, "both", [], {}, changed.expression);
    expect(presetExpression.recipe.slots.expression?.entryId).toBe("expression:xf_joy");
    expect(() => planCharacterDocumentSteps(initial, profile, "both", [{ kind: "pose-preset", presetId: "xp_punch" }])).toThrow("VRM 뼈대");
  });

  it("수동 Pose V3는 이전 preset 카드 식별자를 현재 포즈로 표시하지 않는다", () => {
    const initial = document();
    const recipe = createEmptyCharacterRecipe();
    const original = { ...initial, recipe: projectCharacterRecipeV1({ ...recipe, slots: { ...recipe.slots, pose: "pose:xp_punch" } }) };
    expect(characterDocumentSnapshot(original, profile, "both").activePoseId).toBeNull();
    expect(characterDocumentRecipe(original, "both").slots.pose).toBeNull();
  });
});
