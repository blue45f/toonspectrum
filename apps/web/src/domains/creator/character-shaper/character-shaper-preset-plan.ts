import { applyCharacterPartPreset } from "../character-platform/presets/character-part-preset";
import { AVATAR_FORGE_SEMANTIC_FACE_MORPH_IDS, sanitizeAvatarForgeState, createAvatarForgeState } from "../vrm/studio-vrm-avatar-forge";
import { selectableWardrobeSetById } from "../vrm/studio-vrm-wardrobe";

import { planCharacterSlotApply } from "./character-shaper-apply-plan";
import { CHARACTER_SLOT_CATALOG } from "./character-shaper-catalog";
import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";

import type { CharacterSlotPlanContext } from "./character-shaper-apply-plan";
import type { CharacterApplyStep, CharacterCapabilityProfile, CharacterHostSnapshot, CharacterRecipe, CharacterSemanticMorphBundle } from "./character-shaper-contract";
import type { CharacterDocumentV2 } from "../character-platform/document/character-document-v2";
import type { CharacterPartPresetV1 } from "../character-platform/presets/character-part-preset";
import type { WardrobeSlot } from "../vrm/studio-vrm-wardrobe";

export interface CharacterPresetPlan {
  readonly steps: readonly CharacterApplyStep[];
  readonly colors: Partial<CharacterRecipe["colors"]>;
  readonly expression?: CharacterDocumentV2["expression"];
  readonly requiredHostMethods: readonly string[];
}

/** Resolve every field before the binding writes anything. Presets never accept a partial plan. */
export function planCharacterPresetApplication(
  document: CharacterDocumentV2,
  preset: CharacterPartPresetV1,
  profile: CharacterCapabilityProfile,
  context: CharacterSlotPlanContext,
): CharacterPresetPlan {
  const { payload } = preset;
  if (["partial-pose", "full-pose", "hand-grip", "camera-shot"].includes(preset.kind)
    || payload.pose !== undefined || payload.cameraShotId !== undefined) {
    throw new Error("전체 포즈·손 관절·카메라 프리셋은 현재 편집기에서 지원하지 않습니다.");
  }
  const projected = applyCharacterPartPreset(document, preset);
  if (!projected.ok || projected.skipped.length > 0) {
    throw new Error(projected.skipped.map((item) => item.reason).join(" · ") || "적용할 수 있는 값이 없습니다.");
  }
  const next = projected.document;
  const steps: CharacterApplyStep[] = [];
  const slot = payload.slot;
  const rawSelections = payload.selections ?? [];
  const selections = slot === "hand-pose" && rawSelections.length === 2
    && JSON.stringify(rawSelections[0]) === JSON.stringify(rawSelections[1])
    ? rawSelections.slice(0, 1) : rawSelections;
  if ((slot && !CHARACTER_SLOT_KINDS.includes(slot)) || (!slot && selections.length > 0)
    || (slot !== "accessory" && selections.length > 1)
    || new Set(selections.map((selection) => selection.entryId)).size !== selections.length) {
    throw new Error("프리셋의 파츠 슬롯 구성을 지원하지 않습니다.");
  }
  const savedHands = payload.handPose;
  const selectedTargets = savedHands
    ? (["left", "right"] as const).flatMap((side) => {
      const selection = savedHands[side];
      return selection ? [{ selection, handSide: side }] : [];
    })
    : selections.map((selection) => ({ selection, handSide: "both" as const }));
  const targets = selectedTargets.map(({ selection, handSide }) => {
    const entry = CHARACTER_SLOT_CATALOG.entries.find((candidate) => candidate.id === selection.entryId);
    if (!entry || entry.slot !== slot || (selection.overrides && Object.keys(selection.overrides).length > 0)) {
      throw new Error(`프리셋 항목 ${selection.entryId}을 현재 카탈로그에서 적용할 수 없습니다.`);
    }
    const plan = planCharacterSlotApply(entry, profile, slot === "hand-pose" ? { ...context, handSide } : context);
    if (plan.availability.status !== "available") {
      throw new Error(plan.availability.reason ?? "프리셋의 모든 파츠를 지원하는 모델이 필요합니다.");
    }
    return { entry, plan };
  });
  if (slot === "accessory") {
    const targetIds = new Set(targets.flatMap(({ entry }) => entry.apply.kind === "prop" ? [entry.apply.propId] : []));
    const accessoryIds = new Set(CHARACTER_SLOT_CATALOG.entries.flatMap((entry) => entry.slot === "accessory" && entry.apply.kind === "prop" ? [entry.apply.propId] : []));
    for (const propId of context.snapshot.propIds) {
      if (accessoryIds.has(propId) && !targetIds.has(propId)) steps.push({ kind: "prop-remove", propId });
    }
  }
  for (const { plan } of targets) steps.push(...plan.steps);
  const face: Partial<CharacterHostSnapshot["forgeFace"]> = {};
  const morphs: CharacterSemanticMorphBundle = {};
  for (const key of Object.keys(payload.controls ?? {})) {
    const value = next.customControls[key]!;
    const faceKey = key.slice(5) as keyof CharacterHostSnapshot["forgeFace"];
    const morphKey = key.slice(6) as keyof CharacterSemanticMorphBundle;
    if (key.startsWith("face.") && Object.hasOwn(context.snapshot.forgeFace, faceKey)) face[faceKey] = value;
    else if (key.startsWith("morph.") && AVATAR_FORGE_SEMANTIC_FACE_MORPH_IDS.includes(morphKey) && profile.semanticMorphs[morphKey]) morphs[morphKey] = value;
    else throw new Error(`프리셋 세부 조절 ${key}을 현재 모델에서 지원하지 않습니다.`);
  }
  // The host sanitizer clamps numeric controls; rejecting them here avoids partial success.
  const defaults = createAvatarForgeState();
  const normalized = sanitizeAvatarForgeState({ ...defaults, face: { ...defaults.face, ...face }, semanticFaceMorphs: morphs });
  if (Object.entries(face).some(([key, value]) => normalized.face[key as keyof typeof face] !== value)
    || Object.entries(morphs).some(([key, value]) => (normalized.semanticFaceMorphs?.[key as keyof typeof morphs] ?? 0) !== value)) {
    throw new Error("프리셋 세부 조절 값이 지원 범위를 벗어났습니다.");
  }
  if (Object.keys(face).length > 0) steps.push({ kind: "forge-face", face });
  if (Object.keys(morphs).length > 0) steps.push({ kind: "semantic-morph", morphs });
  const worn = characterPresetWornSlots(steps, context.snapshot.wardrobe);
  let proceduralHair = context.snapshot.hairStyle !== "none";
  for (const step of steps) {
    if (step.kind === "forge-hair" && step.hair.style !== undefined) proceduralHair = step.hair.style !== "none";
  }
  const colors: Partial<Record<keyof CharacterRecipe["colors"], string | null>> = {};
  const required = new Set<string>();
  for (const rawKey of Object.keys(payload.colors ?? {})) {
    if (!Object.hasOwn(document.colors, rawKey)) throw new Error(`프리셋 색상 ${rawKey}을 지원하지 않습니다.`);
    const key = rawKey as keyof CharacterRecipe["colors"];
    const color = next.colors[key];
    if (color !== null && (typeof color !== "string" || !/^#[0-9a-f]{6}$/iu.test(color))) throw new Error(`프리셋 색상 ${rawKey} 형식이 올바르지 않습니다.`);
    const changesColor = steps.some((step) =>
      (key === "iris" && step.kind === "iris-color")
      || (["hairBase", "hairTip"].includes(key) && step.kind === "forge-hair")
      || (["top", "bottom", "shoes"].includes(key) && (step.kind === "wardrobe-set" || step.kind === "wardrobe-equip")));
    if (color === document.colors[key] && !changesColor) continue;
    if ((key === "hairTip" && (color === null || !proceduralHair))
      || (key === "hairBase" && color === null && proceduralHair)
      || (key === "top" && color === null && (worn.has("top") || worn.has("outer")))
      || (key === "bottom" && color === null && worn.has("bottom"))
      || (key === "shoes" && (!worn.has("shoes") || color === null)) || (key === "iris" && color !== null && !profile.irisTintable)) {
      throw new Error(`프리셋 색상 ${rawKey}을 현재 모델에서 지원하지 않습니다.`);
    }
    colors[key] = color;
    if (key === "hairBase" || key === "hairTip") required.add("handleAvatarForgeChange");
    if (key !== "iris") required.add("setCustomColors");
    if (["top", "bottom", "shoes"].includes(key)) { required.add("updateWardrobeEquip"); required.add("setWardrobeState"); }
  }
  let expression: CharacterDocumentV2["expression"] | undefined;
  if (payload.expression !== undefined) {
    expression = next.expression;
    if (payload.expression === null || !expression || (expression.activeEntryId !== null && typeof expression.activeEntryId !== "string")
      || !expression.weights || typeof expression.weights !== "object" || Array.isArray(expression.weights)
      || Object.entries(expression.weights).some(([key, value]) => !profile.expressions.includes(key) || !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new Error("프리셋 표정 값을 현재 모델에서 지원하지 않습니다.");
    }
    required.add("setActiveExpressionId");
    required.add("setExpressionWeights");
  }
  for (const step of steps) {
    switch (step.kind) {
      case "forge-face": case "semantic-morph": case "forge-hair": case "proportion": required.add("handleAvatarForgeChange"); break;
      case "expression-floor": required.add("setExpressionWeights"); break;
      case "expression-preset": required.add("handleExpressionPresetSelect"); required.add("setActiveExpressionId"); required.add("setExpressionWeights"); break;
      case "pose-preset": for (const name of ["handlePoseSelect", "setActivePoseId", "setCustomBones", "setCustomYOffset", "setPoseTranslations", "setFingerEdits", "setBodyRotation"]) required.add(name); break;
      case "hand-pose": required.add("applyHandPosePreset"); required.add("setFingerEdits"); break;
      case "wardrobe-equip": required.add("equipWardrobeItem"); required.add("setWardrobeState"); if (step.color) required.add("updateWardrobeEquip"); break;
      case "wardrobe-set": required.add("equipWardrobeSetById"); required.add("setWardrobeState"); break;
      case "costume-visibility": required.add("updateCostume"); break;
      case "prop-add": required.add(step.color ? "setVrmPropItems" : "addVrmProp"); required.add("setVrmPropItems"); required.add("setSelectedVrmPropUid"); break;
      case "prop-remove": required.add("removeVrmProp"); required.add("setVrmPropItems"); required.add("setSelectedVrmPropUid"); break;
      case "iris-color": break;
    }
  }
  return { steps, colors, expression, requiredHostMethods: [...required] };
}

/** Slot membership after queued wardrobe changes, before React has rendered the new host. */
export function characterPresetWornSlots(steps: readonly CharacterApplyStep[], wardrobe: CharacterHostSnapshot["wardrobe"]): Set<WardrobeSlot> {
  const worn = new Set(Object.keys(wardrobe) as WardrobeSlot[]);
  for (const step of steps) {
    if (step.kind === "wardrobe-equip") {
      if (step.itemId) worn.add(step.slot);
      else worn.delete(step.slot);
    } else if (step.kind === "wardrobe-set") {
      worn.clear();
      for (const key of Object.keys(selectableWardrobeSetById(step.setId)?.equips ?? {})) worn.add(key as WardrobeSlot);
    }
  }
  return worn;
}
