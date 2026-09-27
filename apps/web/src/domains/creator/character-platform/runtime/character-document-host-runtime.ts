import { planCharacterPresetApplication } from "../../character-shaper/character-shaper-preset-plan";
import { findCharacterSlotEntry } from "../../character-shaper/character-shaper-catalog";
import { planCharacterSlotClear } from "../../character-shaper/character-shaper-apply-plan";
import { createCharacterPartPreset } from "../presets/character-part-preset";
import { deriveCharacterRecipe } from "../../character-shaper/character-shaper-recipe";
import { characterDocumentSnapshot, characterDocumentHair, characterSelectionWithoutOverrides } from "../application/character-shaper-document-plan";
import type { CharacterShaperRuntimeBinding } from "../../character-shaper/useCharacterShaperBinding";
import { createAvatarForgeState, sanitizeAvatarForgeState } from "../../vrm/studio-vrm-avatar-forge";

import type { CharacterShaperBinding } from "../../character-shaper/character-shaper-ui-contract";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { CharacterDocumentV2, CharacterRecipeSlotKindV2 } from "../document/character-document-v2";
import type { CharacterDocumentV3 } from "../document/character-document-v3";
import type { CharacterSlotKind } from "../../character-shaper/character-shaper-contract";

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function characterHostDocumentKey(document: CharacterDocumentV3): string {
  return JSON.stringify([document.model.assetId, document.recipe, document.deformation, document.look.colors,
    document.expression, document.output.transparent]);
}

/** 호환 파츠 실행기의 검증·rollback 경로를 재사용한다. V3 history는 호출자가 소유한다. */
export function applyCharacterDocumentToHost(input: {
  readonly h: StudioVrmPoserHost;
  readonly binding: CharacterShaperBinding;
  readonly current: CharacterDocumentV2;
  readonly target: CharacterDocumentV3;
}): { readonly ok: boolean; readonly pending: boolean; readonly reason: string | null } {
  const { h, binding, current, target } = input;
  try {
    if (binding.busyReason) throw new Error(binding.busyReason);
    if (target.model.assetId !== current.model.assetId) throw new Error("현재 모델과 저작 문서의 모델이 다릅니다.");
    if (binding.compareActive || binding.previewEntryId) throw new Error("파츠 비교·미리보기를 종료한 뒤 저작 문서를 적용해 주세요.");
    const context = { snapshot: binding.snapshot, handSide: binding.handSide };
    const calls: (() => void)[] = [];
    const controls: Record<string, number> = {};
    for (const layer of target.deformation.layers) {
      if (!layer.enabled) continue;
      if (layer.kind === "semantic-morph") {
        for (const [key, value] of Object.entries(layer.values)) controls[`morph.${key}`] = value;
      } else if (layer.kind === "control-cage" && layer.layerId === "deform:face-controls") {
        for (const [key, point] of Object.entries(layer.controlPoints)) controls[`face.${key}`] = point[0];
      } else {
        throw new Error(`${layer.name} 변형은 현재 호환 모델 실행기에서 지원하지 않습니다. 원본은 보존됩니다.`);
      }
    }
    // 삭제된 제어 값도 기본값으로 되돌려 undo와 import가 이전 값을 남기지 않는다.
    const defaultFace = createAvatarForgeState().face;
    for (const key of Object.keys(current.customControls)) {
      if (key.startsWith("morph.") && !(key in controls)) controls[key] = 0;
      if (key.startsWith("face.") && !(key in controls)) {
        const name = key.slice("face.".length);
        if (Object.hasOwn(defaultFace, name)) controls[key] = defaultFace[name as keyof typeof defaultFace];
      }
    }
    const changedControls = Object.fromEntries(Object.entries(controls).filter(([key, value]) => current.customControls[key] !== value));
    const displayedColors = deriveCharacterRecipe(characterDocumentSnapshot(target, binding.profile, binding.handSide)).colors;
    const colors = Object.fromEntries((Object.keys(displayedColors) as (keyof typeof displayedColors)[])
      .filter((key) => !same(displayedColors[key], current.colors[key]))
      .map((key) => [key, target.look.colors[key] ?? null]));
    const presetBase = createCharacterPartPreset({
      presetId: "authoring:runtime", kind: "character-variant", name: "저작 문서 복원",
      scope: "personal", document: current, includeColors: false, includeControls: false,
    });
    const schedulePreset = (payload: typeof presetBase.payload) => {
      const preset = { ...presetBase, payload };
      const plan = planCharacterPresetApplication(current, preset, binding.profile, context);
      if (plan.requiredHostMethods.some((method) => typeof h[method] !== "function")) {
        throw new Error("현재 편집기에 문서 복원을 위한 런타임 어댑터가 없습니다.");
      }
      calls.push(() => {
        const result = "replay" in binding && typeof binding.replay === "function"
          ? (binding as CharacterShaperRuntimeBinding).replay(plan.steps, plan.colors, plan.expression)
          : binding.commitPreset(preset, current);
        if (!result.ok) throw new Error(result.reason ?? "캐릭터 문서를 적용하지 못했습니다.");
      });
    };
    const slots = new Set([...Object.keys(current.recipe.slots), ...Object.keys(target.recipe.slots)]);
    const controlPrefixes: Partial<Record<CharacterRecipeSlotKindV2, readonly string[]>> = {
      "face-shape": ["face."], eyes: ["morph.eye"], irises: ["morph.iris"],
      nose: ["morph.nose"], mouth: ["morph.mouth", "morph.lip"],
    };
    for (const key of slots) {
      const slot = key as CharacterRecipeSlotKindV2;
      // 정밀 편집은 프리셋 카드에서 벗어날 수 있다. 숫자 레이어와 카드를
      // 번갈아 재적용하면 얼굴이 두 모양 사이에서 계속 되돌아간다.
      const selectionOverrides = target.recipe.slots[slot]?.overrides;
      if (slot !== "hair" && selectionOverrides && Object.keys(selectionOverrides).length > 0) {
        throw new Error(`${slot} 파츠의 외부 override는 현재 호환 실행기에서 지원하지 않습니다. 원본은 보존됩니다.`);
      }
      if (slot === "hair" || slot === "pose") continue;
      if (controlPrefixes[slot]?.some((prefix) => Object.keys(controls).some((control) => control.startsWith(prefix)))) continue;
      const selection = target.recipe.slots[slot];
      if ((current.recipe.slots[slot]?.entryId ?? null) === (selection?.entryId ?? null)) continue;
      const selectedEntry = selection ? findCharacterSlotEntry(selection.entryId) : undefined;
      const restoringOriginal = selectedEntry?.apply.kind === "costume-original" || selectedEntry?.apply.kind === "none";
      if (selection && !restoringOriginal) schedulePreset({ slot, selections: [characterSelectionWithoutOverrides(selection)] });
      else {
        const plan = planCharacterSlotClear(slot, context);
        if (!plan || plan.availability.status !== "available") throw new Error(`${slot} 파츠를 원본으로 되돌릴 수 없습니다.`);
        calls.push(() => {
          const result = "replay" in binding && typeof binding.replay === "function"
            ? (binding as CharacterShaperRuntimeBinding).replay(plan.steps)
            : binding.clear(slot);
          if (!result?.ok) throw new Error(result?.reason ?? `${slot} 파츠 복원에 실패했습니다.`);
        });
      }
    }
    const hairSelection = target.recipe.slots.hair;
    if (hairSelection && !findCharacterSlotEntry(hairSelection.entryId)) throw new Error("외부 헤어 파츠를 현재 실행기에서 찾을 수 없습니다. 원본은 보존됩니다.");
    const expectedHair = characterDocumentHair(target);
    for (const [key, value] of Object.entries(target.recipe.slots.hair?.overrides ?? {})) {
      const field = key.slice(5);
      if (!key.startsWith("hair.") || !Object.hasOwn(expectedHair, field)
        || expectedHair[field as keyof typeof expectedHair] !== value) {
        // 팔레트가 색상 override를 덮는 경우는 문서의 명시적인 색상 명령이다.
        if (key === "hair.baseColor" && target.look.colors.hairBase) continue;
        if (key === "hair.tipColor" && target.look.colors.hairTip) continue;
        throw new Error(`헤어 override ${key}을 현재 실행기에서 재생할 수 없습니다. 원본은 보존됩니다.`);
      }
    }
    const currentHair = sanitizeAvatarForgeState(h.avatarForgeState ?? createAvatarForgeState()).hair;
    if (!same(currentHair, expectedHair)) {
      if (!("replay" in binding) || typeof binding.replay !== "function") throw new Error("헤어 복원을 위한 런타임 어댑터가 없습니다.");
      calls.push(() => {
        const result = (binding as CharacterShaperRuntimeBinding).replay([{ kind: "forge-hair", hair: expectedHair }]);
        if (!result.ok) throw new Error(result.reason ?? "헤어 복원에 실패했습니다.");
      });
    }
    if (!same(current.recipe.accessories.map((item) => item.entryId).sort(), target.recipe.accessories.map((item) => item.entryId).sort())) {
      schedulePreset({ slot: "accessory", selections: target.recipe.accessories });
    }
    const resetHand = { entryId: "hand-pose:relaxed", entryVersion: "1", providerId: "toonstudio", catalogRevision: "character-slot-catalog-v1" };
    const effectiveHands = Object.fromEntries((["left", "right"] as const).flatMap((side) => {
      const selected = target.recipe.handPose[side];
      return selected ? [[side, selected]] : current.recipe.handPose[side] ? [[side, resetHand]] : [];
    }));
    if (!same([current.recipe.handPose.left?.entryId, current.recipe.handPose.right?.entryId], [effectiveHands.left?.entryId, effectiveHands.right?.entryId])) {
      schedulePreset({ slot: "hand-pose" satisfies CharacterSlotKind, handPose: effectiveHands });
    }
    // 팔레트 검증은 파츠 재생이 실제 호스트에 반영된 뒤 수행한다.
    if (calls.length > 0) { calls[0]?.(); return { ok: true, pending: true, reason: null }; }
    if (Object.keys(changedControls).length || !same(current.expression, target.expression)) {
      schedulePreset({
        controls: changedControls,
        ...(!same(current.expression, target.expression) ? { expression: target.expression } : {}),
      });
    }
    if (Object.keys(colors).length > 0) {
      calls.push(() => {
        if (!("replay" in binding) || typeof binding.replay !== "function") throw new Error("팔레트 복원을 위한 런타임 어댑터가 없습니다.");
        const result = (binding as CharacterShaperRuntimeBinding).replay([], colors);
        if (!result.ok) throw new Error(result.reason ?? "팔레트 원본을 복원하지 못했습니다.");
      });
    }
    if (current.render.transparentBackground !== target.output.transparent) {
      if (typeof h.setTransparentBackground !== "function") throw new Error("투명 배경 변경을 지원하는 편집기가 필요합니다.");
      calls.push(() => h.setTransparentBackground(target.output.transparent));
    }
    // 호스트의 React state가 반영된 후 다음 파츠를 계획한다. 한 flush에서
    // 여러 forge 쓰기를 실행하면 마지막 파츠가 앞선 파츠를 덮어쓸 수 있다.
    calls[0]?.();
    return { ok: true, pending: calls.length > 0, reason: null };
  } catch (error) {
    return { ok: false, pending: false, reason: error instanceof Error ? error.message : "캐릭터 런타임 복원에 실패했습니다." };
  }
}
