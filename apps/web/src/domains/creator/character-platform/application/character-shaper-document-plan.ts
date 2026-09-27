import { Euler, Quaternion } from "three";

import { planCharacterSlotApply } from "../../character-shaper/character-shaper-apply-plan";
import { CHARACTER_SLOT_CATALOG } from "../../character-shaper/character-shaper-catalog";
import { deriveCharacterRecipe } from "../../character-shaper/character-shaper-recipe";
import { projectCharacterShaperDocument } from "../../character-shaper/character-shaper-document-projection";
import { createAvatarForgeState, sanitizeAvatarForgeState, setAvatarForgeSemanticFaceMorph } from "../../vrm/studio-vrm-avatar-forge";
import { applyWardrobeItemSelection, applyWardrobeSet, createWardrobeEquip, selectableWardrobeSetById } from "../../vrm/studio-vrm-wardrobe";
import { EXPRESSION_PRESETS } from "../../studio-pose-presets";
import { findPoseById } from "../../vrm/studio-vrm-poser-helpers";
import { createCharacterDocumentV2 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3, validateCharacterDocumentV3 } from "../document/character-document-v3";

import type { CharacterApplyStep, CharacterCapabilityProfile, CharacterHandSide, CharacterHostSnapshot, CharacterRecipe } from "../../character-shaper/character-shaper-contract";
import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type { CharacterDocumentV2, CharacterSlotSelectionV2 } from "../document/character-document-v2";
import type { AvatarForgeHairParams, AvatarForgeSemanticFaceMorphId } from "../../vrm/studio-vrm-avatar-forge";
import type { WardrobeState } from "../../vrm/studio-vrm-wardrobe";
import type { CharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";

function emptySnapshot(handSide: CharacterHandSide): CharacterHostSnapshot {
  const forge = createAvatarForgeState();
  return { forgeFace: forge.face, semanticMorphs: {}, hairStyle: forge.hair.style,
    hairBangStyle: forge.hair.bangStyle, hairReplaceOriginal: forge.hair.replaceOriginal,
    hairBaseColor: forge.hair.baseColor, hairTipColor: forge.hair.tipColor,
    proportionPresetId: null, bodyPresetId: forge.bodyPresetId ?? "balanced", wardrobe: {}, propIds: [],
    activePoseId: null, activeExpressionId: null, expressionWeights: {}, customColors: {},
    irisColor: null, handSide, lastHandPoseType: null, handPoseTypes: {} };
}

/** 호스트를 쓰지 않고 기존 apply-plan을 계산한다. 한 명령의 여러 파츠가 같은 원본을 공유한다. */
export function applyCharacterSnapshotSteps(snapshot: CharacterHostSnapshot, steps: readonly CharacterApplyStep[]): CharacterHostSnapshot {
  let next = snapshot;
  for (const step of steps) {
    switch (step.kind) {
      case "forge-face": next = { ...next, forgeFace: sanitizeAvatarForgeState({ ...createAvatarForgeState(), face: { ...next.forgeFace, ...step.face } }).face }; break;
      case "semantic-morph": {
        let forge = sanitizeAvatarForgeState({ ...createAvatarForgeState(), semanticFaceMorphs: next.semanticMorphs });
        for (const [key, value] of Object.entries(step.morphs)) {
          if (typeof value === "number") forge = setAvatarForgeSemanticFaceMorph(forge, key as AvatarForgeSemanticFaceMorphId, value);
        }
        next = { ...next, semanticMorphs: forge.semanticFaceMorphs ?? {} }; break;
      }
      case "iris-color": next = { ...next, irisColor: step.color }; break;
      case "forge-hair": next = { ...next,
        hairStyle: step.hair.style ?? next.hairStyle, hairBangStyle: step.hair.bangStyle ?? next.hairBangStyle,
        hairReplaceOriginal: step.hair.replaceOriginal ?? next.hairReplaceOriginal,
        hairBaseColor: step.hair.baseColor ?? next.hairBaseColor, hairTipColor: step.hair.tipColor ?? next.hairTipColor }; break;
      case "proportion": next = { ...next, proportionPresetId: step.presetId, bodyPresetId: step.bodyPresetId ?? next.bodyPresetId }; break;
      case "wardrobe-equip": {
        const current: WardrobeState = {};
        for (const [slot, worn] of Object.entries(next.wardrobe)) {
          const equip = worn ? createWardrobeEquip(worn.itemId) : null;
          if (equip && worn) current[slot as keyof WardrobeState] = { ...equip, color: worn.color };
        }
        const wardrobe = applyWardrobeItemSelection(current, step.slot, step.itemId);
        const equipped = wardrobe[step.slot];
        if (equipped && step.color) wardrobe[step.slot] = { ...equipped, color: step.color };
        next = { ...next, wardrobe }; break;
      }
      case "wardrobe-set": {
        const set = selectableWardrobeSetById(step.setId);
        if (!set) throw new Error("옷 세트를 찾을 수 없습니다.");
        next = { ...next, wardrobe: applyWardrobeSet(set) }; break;
      }
      case "costume-visibility": break; // 원본 의상 선택은 절차형 의상 제거와 함께 계획된다.
      case "prop-add": next = { ...next, propIds: [...new Set([...next.propIds, step.propId])] }; break;
      case "prop-remove": next = { ...next, propIds: next.propIds.filter((id) => id !== step.propId) }; break;
      case "expression-floor": next = { ...next, expressionWeights: { ...next.expressionWeights,
        ...Object.fromEntries(Object.entries(step.weights).map(([key, value]) => [key, Math.max(value, next.expressionWeights[key] ?? 0)])) } }; break;
      case "expression-preset": {
        const preset = EXPRESSION_PRESETS.find((item) => item.id === step.presetId);
        if (!preset) throw new Error("표정 프리셋을 찾을 수 없습니다.");
        next = { ...next, activeExpressionId: `preset:${preset.id}`, expressionWeights: { ...preset.weights } }; break;
      }
      case "pose-preset": next = { ...next, activePoseId: step.presetId }; break;
      case "hand-pose": {
        const hands = { ...next.handPoseTypes };
        if (step.side !== "right") hands.left = step.poseType;
        if (step.side !== "left") hands.right = step.poseType;
        next = { ...next, handPoseTypes: hands, lastHandPoseType: step.poseType }; break;
      }
    }
  }
  return next;
}

export function characterDocumentHair(document: CharacterDocumentV3): AvatarForgeHairParams {
  const defaults = createAvatarForgeState();
  const selection = document.recipe.slots.hair;
  const entry = CHARACTER_SLOT_CATALOG.entries.find((item) => item.id === selection?.entryId);
  const base = entry?.apply.kind === "forge-hair" ? entry.apply.hair : { style: "none" as const, replaceOriginal: false };
  const overrides = Object.fromEntries(Object.entries(selection?.overrides ?? {}).filter(([key]) => key.startsWith("hair.")).map(([key, value]) => [key.slice(5), value]));
  return sanitizeAvatarForgeState({ ...defaults, hair: { ...defaults.hair, ...base, ...overrides,
    ...(document.look.colors.hairBase ? { baseColor: document.look.colors.hairBase } : {}),
    ...(document.look.colors.hairTip ? { tipColor: document.look.colors.hairTip } : {}) } }).hair;
}

export function characterDocumentSnapshot(document: CharacterDocumentV3, profile: CharacterCapabilityProfile, handSide: CharacterHandSide): CharacterHostSnapshot {
  let snapshot = emptySnapshot(handSide);
  for (const selection of [...Object.values(document.recipe.slots), ...document.recipe.accessories]) {
    const entry = CHARACTER_SLOT_CATALOG.entries.find((item) => item.id === selection?.entryId);
    if (entry) snapshot = applyCharacterSnapshotSteps(snapshot, planCharacterSlotApply(entry, profile, { snapshot, handSide }).steps);
  }
  for (const side of ["left", "right"] as const) {
    const entry = CHARACTER_SLOT_CATALOG.entries.find((item) => item.id === document.recipe.handPose[side]?.entryId);
    if (entry) snapshot = applyCharacterSnapshotSteps(snapshot, planCharacterSlotApply(entry, profile, { snapshot, handSide: side }).steps);
  }
  for (const layer of document.deformation.layers) {
    if (!layer.enabled) continue;
    if (layer.kind === "semantic-morph") snapshot = { ...snapshot, semanticMorphs: { ...snapshot.semanticMorphs, ...layer.values } };
    if (layer.kind === "control-cage" && layer.layerId === "deform:face-controls") snapshot = { ...snapshot,
      forgeFace: { ...snapshot.forgeFace, ...Object.fromEntries(Object.entries(layer.controlPoints).map(([key, value]) => [key, value[0]])) } };
  }
  const hair = characterDocumentHair(document);
  const colors = document.look.colors;
  const wardrobe = { ...snapshot.wardrobe };
  for (const [target, slots] of [["top", ["outer", "top"]], ["bottom", ["bottom"]], ["shoes", ["shoes"]]] as const) {
    const slot = slots.find((key) => wardrobe[key]);
    const item = slot ? wardrobe[slot] : undefined;
    const color = colors[target];
    if (slot && item && color) wardrobe[slot] = { ...item, color };
  }
  return { ...snapshot, wardrobe, hairStyle: hair.style, hairBangStyle: hair.bangStyle, hairReplaceOriginal: hair.replaceOriginal,
    hairBaseColor: hair.baseColor, hairTipColor: hair.tipColor, irisColor: colors.iris ?? null,
    activePoseId: document.pose.source === "preset" ? document.pose.poseId : null,
    expressionWeights: document.expression.weights, activeExpressionId: document.expression.activeEntryId,
    customColors: Object.fromEntries([["body", colors.skin], ["hair", colors.hairBase], ["tops", colors.top], ["bottoms", colors.bottom]].filter((pair): pair is [string, string] => typeof pair[1] === "string")) };
}

export function characterDocumentRecipe(document: CharacterDocumentV3, handSide: CharacterHandSide): CharacterRecipe {
  const slots = deriveCharacterRecipe(emptySnapshot(handSide)).slots;
  const single = Object.fromEntries(Object.entries(document.recipe.slots).map(([key, selection]) => [key, selection.entryId]));
  const selectedHand = document.recipe.handPose[handSide === "both" ? "left" : handSide];
  const poseEntry = document.pose.source === "preset"
    ? CHARACTER_SLOT_CATALOG.entries.find((entry) => entry.apply.kind === "pose" && entry.apply.presetId === document.pose.poseId)
    : undefined;
  return { version: 1, slots: { ...slots, ...single, pose: poseEntry?.id ?? null, accessory: document.recipe.accessories.map((selection) => selection.entryId), "hand-pose": selectedHand?.entryId ?? null },
    colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null, ...document.look.colors }, handSide,
    handPoses: Object.fromEntries(Object.entries(document.recipe.handPose).map(([side, selection]) => [side, selection.entryId])) };
}

export function characterDocumentCompatibilityView(document: CharacterDocumentV3): CharacterDocumentV2 {
  const controls: Record<string, number> = {};
  for (const layer of document.deformation.layers) {
    if (!layer.enabled) continue;
    if (layer.kind === "semantic-morph") for (const [key, value] of Object.entries(layer.values)) controls[`morph.${key}`] = value;
    if (layer.kind === "control-cage" && layer.layerId === "deform:face-controls") for (const [key, point] of Object.entries(layer.controlPoints)) controls[`face.${key}`] = point[0];
  }
  return createCharacterDocumentV2({ documentId: document.documentId, model: document.model, compatibility: document.compatibility,
    recipe: document.recipe, colors: characterDocumentRecipe(document, "both").colors, customControls: controls,
    expression: document.expression, pose: { activeEntryId: document.pose.poseId,
      root: document.pose.root, bones: document.pose.bones,
      source: document.pose.source === "video" || document.pose.source === "ai" ? null : document.pose.source },
    transparentBackground: document.output.transparent, revision: document.revision, now: document.createdAt });
}

export function planCharacterDocumentSteps(document: CharacterDocumentV3, profile: CharacterCapabilityProfile, handSide: CharacterHandSide,
  steps: readonly CharacterApplyStep[], colors: Partial<CharacterRecipe["colors"]> = {}, expression?: CharacterDocumentV2["expression"],
  options: { readonly pose?: CharacterPoseDocumentV3 } = {}): CharacterDocumentV3 {
  const before = characterDocumentSnapshot(document, profile, handSide);
  const applied = applyCharacterSnapshotSteps(before, steps);
  const snapshot = expression
    ? { ...applied, activeExpressionId: expression.activeEntryId, expressionWeights: expression.weights }
    : applied;
  const beforeRecipe = deriveCharacterRecipe(before);
  const recipe = deriveCharacterRecipe(snapshot);
  const projected = migrateCharacterDocumentV2ToV3(projectCharacterShaperDocument({ documentId: document.documentId, assetId: document.model.assetId,
    recipe: { ...recipe, colors: { ...recipe.colors, ...colors } }, snapshot,
    profile, now: document.createdAt }));
  // 호환 snapshot에서 알 수 없는 외부 파츠도 원본이다. 실제 변경한 슬롯만 갱신한다.
  const slots = { ...document.recipe.slots };
  for (const key of Object.keys(recipe.slots) as (keyof typeof recipe.slots)[]) {
    if (key === "accessory" || key === "hand-pose" || beforeRecipe.slots[key] === recipe.slots[key]) continue;
    const selection = projected.recipe.slots[key];
    if (selection) slots[key] = selection;
    else delete slots[key];
  }
  // 카탈로그 식별자와 정밀 수치를 기존 selection.overrides에 보존한다.
  const hairSteps = steps.filter((step) => step.kind === "forge-hair");
  const hairSelection = slots.hair ?? document.recipe.slots.hair;
  if (hairSelection && hairSteps.length) {
    const hair = sanitizeAvatarForgeState({ ...createAvatarForgeState(), hair: Object.assign({}, characterDocumentHair(document), ...hairSteps.map((step) => step.hair)) }).hair;
    slots.hair = { ...hairSelection, overrides: Object.fromEntries(Object.entries(hair)
      .filter(([key]) => (key !== "baseColor" && key !== "tipColor")
        || hairSteps.some((step) => Object.hasOwn(step.hair, key))
        || Object.hasOwn(document.recipe.slots.hair?.overrides ?? {}, `hair.${key}`))
      .map(([key, value]) => [`hair.${key}`, value])) };
  } else if (slots.hair && document.recipe.slots.hair?.overrides) slots.hair = { ...slots.hair, overrides: document.recipe.slots.hair.overrides };
  // 변경하지 않은 파츠의 provider/version/사용자 override를 보존한다.
  for (const key of Object.keys(slots) as (keyof typeof slots)[]) {
    if (key === "hair" && hairSteps.length) continue;
    const old = document.recipe.slots[key];
    if (old?.entryId === slots[key]?.entryId) slots[key] = old;
  }
  let pose = options.pose ?? document.pose;
  for (const step of steps) if (step.kind === "pose-preset") {
    const preset = findPoseById(step.presetId);
    if (!preset) throw new Error("포즈 프리셋을 찾을 수 없습니다.");
    if (options.pose) {
      if (options.pose.poseId !== step.presetId) throw new Error("계산한 포즈와 선택한 프리셋이 다릅니다.");
      continue;
    }
    if (Object.values(preset.bones).some((bone) => bone?.direction)) {
      throw new Error("방향을 사용하는 포즈는 현재 VRM 뼈대에서 계산한 결과가 필요합니다.");
    }
    pose = { ...pose, poseId: step.presetId, source: "preset", root: { ...pose.root, position: [0, preset.yOffset ?? 0, 0] },
      bones: Object.fromEntries(Object.entries(preset.bones).map(([name, bone]) => {
        const rotation = bone?.rotation ?? [0, 0, 0];
        const q = new Quaternion().setFromEuler(new Euler(...rotation, /Hand|Arm|Finger/u.test(name) ? "YXZ" : "XYZ"));
        return [name, [q.x, q.y, q.z, q.w] as const];
      })) };
  }
  const accessories = document.recipe.accessories.filter((selection) =>
    !beforeRecipe.slots.accessory.includes(selection.entryId) || recipe.slots.accessory.includes(selection.entryId));
  for (const selection of projected.recipe.accessories) {
    if (!accessories.some((item) => item.entryId === selection.entryId)) accessories.push(selection);
  }
  const handPose = { ...document.recipe.handPose };
  for (const side of ["left", "right"] as const) {
    if (beforeRecipe.handPoses?.[side] === recipe.handPoses?.[side]) continue;
    const selection = projected.recipe.handPose[side];
    if (selection) handPose[side] = selection;
    else delete handPose[side];
  }
  const replacedLayers = new Set<string>();
  if (steps.some((step) => step.kind === "forge-face")) replacedLayers.add("deform:face-controls");
  if (steps.some((step) => step.kind === "semantic-morph")) replacedLayers.add("deform:semantic-morphs");
  const nextColors = { ...document.look.colors };
  for (const key of Object.keys(recipe.colors) as (keyof typeof recipe.colors)[]) {
    if (recipe.colors[key] !== beforeRecipe.colors[key]) nextColors[key] = recipe.colors[key];
  }
  Object.assign(nextColors, colors);
  return validateCharacterDocumentV3({ ...document, recipe: { ...document.recipe, slots, accessories, handPose },
    expression: expression ?? (steps.some((step) => step.kind === "expression-floor" || step.kind === "expression-preset") ? projected.expression : document.expression), pose,
    deformation: { layers: [...document.deformation.layers.filter((layer) => !replacedLayers.has(layer.layerId)),
      ...projected.deformation.layers.filter((layer) => replacedLayers.has(layer.layerId))] }, look: { ...document.look, colors: nextColors } });
}

export function characterSelectionWithoutOverrides(selection: CharacterSlotSelectionV2): CharacterSlotSelectionV2 {
  const { overrides: _overrides, ...rest } = selection;
  return rest;
}
