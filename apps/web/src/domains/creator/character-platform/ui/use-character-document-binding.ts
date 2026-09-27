import { VRM } from "@pixiv/three-vrm";
import { Euler, Quaternion } from "three";
import { useCallback, useEffect, useRef } from "react";

import { planCharacterSlotApply, planCharacterSlotClear, planCharacterSlotRemove } from "../../character-shaper/character-shaper-apply-plan";
import { findCharacterSlotEntry } from "../../character-shaper/character-shaper-catalog";
import { planShaperGradeRecommend, restoreShaperSession, serializeShaperSession, shaperCharacterFromRecipe } from "../../character-shaper/character-shaper-grade-bridge";
import { characterPoseEulerBones } from "../pose-v3/character-pose-runtime-adapter";
import { mirrorStudioVrmPoseBones } from "../../vrm/studio-vrm-pose-editing";
import { createStudioVrmHandPose, STUDIO_VRM_HAND_POSE_TYPES } from "../../vrm/studio-vrm-hand-poses";
import { planCharacterPoseAuthoringInput } from "../runtime/character-pose-authoring-input";
import { resolveCharacterPosePresetDocument } from "../runtime/character-pose-preset-document";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import { planCharacterPresetApplication } from "../../character-shaper/character-shaper-preset-plan";
import { characterDocumentCompatibilityView, characterDocumentRecipe, characterDocumentSnapshot, planCharacterDocumentSteps } from "../application/character-shaper-document-plan";

import type { CharacterShaperBinding, CharacterShaperCommitResult } from "../../character-shaper/character-shaper-ui-contract";
import type { CharacterApplyPlan, CharacterApplyStep, CharacterRecipe, CharacterSlotEntry } from "../../character-shaper/character-shaper-contract";
import type { CharacterAuthoringAuthorityHookResult } from "./use-character-authoring-authority";
import type { CharacterDocumentV3 } from "../document/character-document-v3";

/** UI는 V3에서만 읽고 명령을 만든다. 호스트 변경은 별도 no-history 재생기가 수행한다. */
export function useCharacterDocumentBinding(runtime: CharacterShaperBinding, authoring: CharacterAuthoringAuthorityHookResult, h: StudioVrmPoserHost): CharacterShaperBinding {
  const baseline = useRef<{ owner: typeof authoring.authority; document: CharacterDocumentV3 } | null>(null);
  const sequence = useRef(0);
  const preview = authoring.snapshot.previewCommandId;
  const compareActive = preview?.startsWith("shaper.compare/") ?? false;
  const previewEntryId = preview?.startsWith("shaper.preview/") ? preview.slice("shaper.preview/".length) : null;
  const document = authoring.snapshot.document;
  const recipe = characterDocumentRecipe(document, runtime.handSide);
  const snapshot = characterDocumentSnapshot(document, runtime.profile, runtime.handSide);
  const busyReason = runtime.busyReason ?? (!authoring.hydrated ? authoring.persistenceError ?? "캐릭터 원본을 복원하는 중입니다." : null);
  useEffect(() => {
    if (authoring.hydrated && baseline.current?.owner !== authoring.authority) baseline.current = { owner: authoring.authority, document: authoring.authority.getSnapshot().document };
  }, [authoring.authority, authoring.hydrated]);

  const dispatchTarget = useCallback((target: CharacterDocumentV3, label: string, previewId?: string) => {
    const current = authoring.authority.getSnapshot().document;
    const command = { commandId: previewId ?? `shaper.edit/${++sequence.current}`, label, source: "user" as const,
      expectedDocumentId: current.documentId, expectedRevision: current.revision, operations: [{ kind: "restore-document" as const, document: target }] };
    return previewId ? authoring.beginPreview(command) : authoring.dispatch(command);
  }, [authoring]);
  const planSteps = (current: CharacterDocumentV3, steps: readonly CharacterApplyStep[], colors: Partial<CharacterRecipe["colors"]> = {}, expression?: CharacterDocumentV3["expression"]) => {
    const poseStep = steps.findLast((step) => step.kind === "pose-preset");
    let pose = poseStep ? resolveCharacterPosePresetDocument(h.vrm, poseStep.presetId, current.pose) : undefined;
    if (h.vrm instanceof VRM) for (const step of steps) {
      if (step.kind !== "hand-pose") continue;
      const kind = STUDIO_VRM_HAND_POSE_TYPES.find((value) => value === step.poseType);
      if (!kind) throw new Error("손 모양 프리셋을 찾을 수 없습니다.");
      const previous = pose ?? current.pose;
      const fingers = {
        ...(step.side !== "right" ? createStudioVrmHandPose("left", kind) : {}),
        ...(step.side !== "left" ? createStudioVrmHandPose("right", kind) : {}),
      };
      const prepared = planCharacterPoseAuthoringInput({ source: h.vrm, previous, kind: "manual", bones: {}, fingers,
        lockedBones: h.lockedPoseBones });
      pose = { ...prepared, poseId: previous.poseId, source: previous.source };
    }
    return planCharacterDocumentSteps(current, runtime.profile, runtime.handSide, steps, colors, expression, { pose });
  };
  const context = () => ({ snapshot: characterDocumentSnapshot(authoring.authority.getSnapshot().document, runtime.profile, runtime.handSide), handSide: runtime.handSide });
  const planEntry = (entry: CharacterSlotEntry) => {
    const current = context();
    if (entry.slot === "accessory" && entry.apply.kind === "prop" && current.snapshot.propIds.includes(entry.apply.propId)) {
      const removal = planCharacterSlotRemove(entry.slot, entry.id, current);
      if (removal) return removal;
    }
    return planCharacterSlotApply(entry, runtime.profile, current);
  };
  const execute = (plan: CharacterApplyPlan, previewId?: string): CharacterShaperCommitResult => {
    if (busyReason) return { ok: false, plan, reason: busyReason };
    if (plan.availability.status === "unavailable") return { ok: false, plan, reason: plan.availability.reason };
    if (authoring.authority.getSnapshot().previewDocument) return { ok: false, plan, reason: "미리보기를 적용하거나 취소해 주세요." };
    try {
      const current = authoring.authority.getSnapshot().document;
      const target = planSteps(current, plan.steps);
      const receipt = dispatchTarget(target, plan.label, previewId);
      return { ok: receipt.status === "applied" || receipt.status === "noop", plan, reason: receipt.status === "applied" || receipt.status === "noop" ? null : receipt.reason };
    } catch (error) { return { ok: false, plan, reason: error instanceof Error ? error.message : "캐릭터 명령을 계산하지 못했습니다." }; }
  };
  const precision = (steps: readonly CharacterApplyStep[], label: string, colors: Partial<CharacterRecipe["colors"]> = {}) => {
    if (busyReason || authoring.authority.getSnapshot().previewDocument) return;
    const current = authoring.authority.getSnapshot().document;
    dispatchTarget(planSteps(current, steps, colors), label);
  };
  const cancelPreview = useCallback(() => { authoring.authority.cancelPreview(); }, [authoring.authority]);
  return {
    ...runtime, recipe, snapshot, busyReason, compareActive, previewEntryId,
    baselineRecipe: characterDocumentRecipe(baseline.current?.owner === authoring.authority ? baseline.current.document : document, runtime.handSide),
    history: { canUndo: authoring.snapshot.canUndo, canRedo: authoring.snapshot.canRedo, length: authoring.snapshot.historyLength, recentLabels: authoring.snapshot.recentLabels },
    plan: planEntry, commit: (entry) => execute(planEntry(entry)),
    preview: (entry) => execute(planEntry(entry), `shaper.preview/${entry.id}`), cancelPreview,
    commitPreview: (entry) => {
      const current = authoring.authority.getSnapshot();
      const plan = planEntry(entry);
      if (!current.previewDocument) return execute(plan);
      if (busyReason || current.previewCommandId !== `shaper.preview/${entry.id}`) return { ok: false, plan, reason: busyReason ?? "다른 미리보기가 열려 있습니다." };
      const receipt = authoring.commitPreview();
      return { ok: receipt?.status === "applied" || receipt?.status === "noop", plan, reason: receipt?.reason ?? null };
    },
    clear: (slot) => { const plan = planCharacterSlotClear(slot, context()); return plan ? execute(plan) : null; },
    remove: (slot, entryId) => { const plan = planCharacterSlotRemove(slot, entryId, context()); return plan ? execute(plan) : null; },
    undo: () => { if (!busyReason) { if (authoring.authority.getSnapshot().previewDocument) cancelPreview(); else authoring.undo(); } },
    redo: () => { if (!busyReason) { if (authoring.authority.getSnapshot().previewDocument) cancelPreview(); else authoring.redo(); } },
    setCompareActive: (active) => {
      const current = authoring.authority.getSnapshot();
      if (!active) { if (current.previewCommandId?.startsWith("shaper.compare/")) cancelPreview(); return; }
      if (busyReason || current.previewDocument || baseline.current?.owner !== authoring.authority) return;
      dispatchTarget(baseline.current.document, "처음 상태 비교", `shaper.compare/${++sequence.current}`);
    },
    resetToBaseline: () => {
      if (busyReason || baseline.current?.owner !== authoring.authority) return;
      authoring.cancelPreview();
      dispatchTarget(baseline.current.document, "처음 상태로 되돌리기");
    },
    commitFaceParams: (face, label) => precision([{ kind: "forge-face", face }], label),
    commitSemanticMorphs: (morphs, label) => precision([{ kind: "semantic-morph", morphs }], label),
    commitHairParams: (hair, label) => precision([{ kind: "forge-hair", hair }], label),
    commitColor: (target, color) => precision([], `색상: ${target}`, { [target]: color }),
    applyGradeRecommend: (image) => {
      if (busyReason || authoring.authority.getSnapshot().previewDocument) return { ok: false, reason: busyReason ?? "미리보기를 적용하거나 취소해 주세요." };
      const current = authoring.authority.getSnapshot().document;
      const suggestion = planShaperGradeRecommend(image, shaperCharacterFromRecipe(characterDocumentRecipe(current, runtime.handSide)));
      if (!suggestion.ok) return suggestion;
      let target = current;
      for (const id of suggestion.entryIds) {
        const entry = findCharacterSlotEntry(id);
        if (!entry) continue;
        const prepared = planCharacterSlotApply(entry, runtime.profile, { snapshot: characterDocumentSnapshot(target, runtime.profile, runtime.handSide), handSide: runtime.handSide });
        if (prepared.availability.status === "unavailable") return { ok: false, reason: prepared.availability.reason };
        target = planSteps(target, prepared.steps);
      }
      const receipt = dispatchTarget(target, suggestion.label);
      return { ok: receipt.status === "applied" || receipt.status === "noop", reason: receipt.reason };
    },
    mirrorGradePose: () => {
      if (busyReason || authoring.authority.getSnapshot().previewDocument) return;
      const current = authoring.authority.getSnapshot().document;
      const bones = Object.fromEntries(Object.entries(characterPoseEulerBones(current.pose)).map(([name, rotation]) => [name, { rotation: [...rotation] as [number, number, number] }]));
      const mirrored = mirrorStudioVrmPoseBones(bones, "all");
      dispatchTarget({ ...current, pose: { ...current.pose, bones: Object.fromEntries(Object.entries(mirrored).map(([name, bone]) => {
        const rotation = bone.rotation ?? [0, 0, 0];
        const q = new Quaternion().setFromEuler(new Euler(...rotation, /Hand|Arm|Finger/u.test(name) ? "YXZ" : "XYZ"));
        return [name, [q.x, q.y, q.z, q.w] as const];
      })) } }, "포즈 좌우 반전");
    },
    exportGradeSession: () => serializeShaperSession(shaperCharacterFromRecipe(characterDocumentRecipe(authoring.authority.getSnapshot().document, runtime.handSide))),
    importGradeSession: (raw) => {
      if (busyReason || authoring.authority.getSnapshot().previewDocument) return false;
      try {
        const saved = restoreShaperSession(raw);
        let target = authoring.authority.getSnapshot().document;
        for (const id of [saved.face, saved.hair, saved.clothes]) {
          const entry = findCharacterSlotEntry(id);
          if (!entry) throw new Error("세션의 파츠를 찾을 수 없습니다.");
          const prepared = planCharacterSlotApply(entry, runtime.profile, { snapshot: characterDocumentSnapshot(target, runtime.profile, runtime.handSide), handSide: runtime.handSide });
          if (prepared.availability.status === "unavailable") return false;
          target = planSteps(target, prepared.steps);
        }
        const receipt = dispatchTarget(target, "캐릭터 세션 복원");
        return receipt.status === "applied" || receipt.status === "noop";
      } catch { return false; }
    },
    commitPreset: (preset) => {
      if (busyReason || authoring.authority.getSnapshot().previewDocument) return { ok: false, reason: busyReason ?? "미리보기를 적용하거나 취소해 주세요." };
      try {
        const current = authoring.authority.getSnapshot().document;
        const prepared = planCharacterPresetApplication(characterDocumentCompatibilityView(current), preset, runtime.profile, context());
        const target = planSteps(current, prepared.steps, prepared.colors, prepared.expression);
        const receipt = dispatchTarget(target, `프리셋: ${preset.name}`);
        return { ok: receipt.status === "applied" || receipt.status === "noop", reason: receipt.status === "applied" || receipt.status === "noop" ? null : receipt.reason };
      } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : "프리셋을 계산하지 못했습니다." }; }
    },
  };
}
