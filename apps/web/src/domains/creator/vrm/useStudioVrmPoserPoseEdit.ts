/**
 * Studio VRM poser runtime slice extracted from `StudioVrmPoser.tsx` (behavior unchanged).
 * The caller passes one host object; this hook destructures the original local names.
 */
import {
  useEffect,
  useRef,
  type ChangeEvent,
} from "react";
import * as THREE from "three";

import {
  POSER_FINGER_BONES,
  type StudioExpressionPreset,
} from "../studio-pose-presets";

import {
  resolveStudioVrmFingerAuthority,
} from "./studio-vrm-auto-grip-authority";
import {
  parseAvatarForgeState,
} from "./studio-vrm-avatar-forge";
import {
  applyStudioVrmCostumeState,
} from "./studio-vrm-costume-runtime";
import {
  createStudioVrmExpressionApplyPlan,
} from "./studio-vrm-expression-apply";
import {
  applyStudioVrmGroundBalanceTranslation,
  planStudioVrmGroundBalance,
  sampleStudioVrmGroundBalance,
} from "./studio-vrm-ground-balance";
import {
  cloneStudioVrmIkConstraints,
  mirrorStudioVrmIkConstraints,
} from "./studio-vrm-ik-constraints";
import {
  clampStudioVrmJointRotation,
} from "./studio-vrm-joint-limits";
import {
  buildStudioVrmPersistentIkSignature,
} from "./studio-vrm-persistent-ik-signature";
import {
  createStudioVrmPhotoPoseApplyPlan,
} from "./studio-vrm-photo-pose-apply";
import {
  settleVrmPhysics,
  countSpringBoneJoints,
} from "./studio-vrm-physics";
import {
  createStudioVrmPoseApplyPlan,
} from "./studio-vrm-pose-apply";
import {
  STUDIO_VRM_DIRECT_EDIT_BONES,
  bakeStudioVrmRuntimePose,
} from "./studio-vrm-pose-bake";
import {
  clampStudioVrmJointDegrees,
  mirrorStudioVrmFingerRotations,
  mirrorStudioVrmPoseBones,
  straightenStudioVrmUpperBody,
  type StudioVrmPoseMirrorScope,
} from "./studio-vrm-pose-editing";
import {
  naturalizeStudioVrmPose,
} from "./studio-vrm-pose-naturalization";
import {
  EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
  cloneStudioVrmPoseTranslations,
  mirrorStudioVrmPoseTranslations,
} from "./studio-vrm-pose-translations";
import {
  BONE_CATEGORIES,
  BONE_LABELS,
  type ExpressionAction,
} from "./studio-vrm-poser-catalogs";
import {
  extractStudioVrmFingerRotations,
  findPose,
  findPoseById,
} from "./studio-vrm-poser-helpers";
import type {
  StudioVrmFingerName,
} from "./studio-vrm-finger-curl";
import {
  createStudioVrmFingerCurlPose,
  createStudioVrmHandPose,
  type StudioVrmHandPoseType,
} from "./studio-vrm-hand-poses";
import {
  applyExpressionWeightsToVrm,
  d,
  getPoseBoneRotation,
  serializeFullVrmState,
  stripFingerBones,
  applyPoserVisualState,
  type BodyScale,
  type FingerRotationMap,
  type FullVrmState,
  type PoseBoneMap,
} from "./studio-vrm-poser-utils";
import {
  findStudioVrmLightingQuickPreset,
} from "./studio-vrm-poser-ux";
import {
  applyVrmTwoBoneGrip,
  createVrmTwoBoneGripState,
  releaseVrmTwoBoneGripState,
  type VrmTwoBoneGripState,
} from "./studio-vrm-prop-ik";
import {
  createAutoGripFingerOverrides,
} from "./studio-vrm-prop-rig";
import {
  propDefById,
} from "./studio-vrm-props";
import type {
  StudioVrmIkConstraint,
} from "./studio-vrm-scene-document";
import {
  commitStudioVrmFullStateHistoryTransaction,
} from "./studio-vrm-state-history";
import {
  STUDIO_VRM_USER_IK_CHAINS,
} from "./studio-vrm-user-ik";
import {
  mergeWardrobeCostumeVisibility,
} from "./studio-vrm-wardrobe";
import type {
  StudioVrmPhotoPoseApplyPayload,
} from "./StudioVrmPhotoPoseScanner";

import type {
  StudioVrmJointHandleBone,
  StudioVrmJointRotationDelta,
  StudioVrmJointRotationPhase,
} from "./StudioVrmJointHandles";
import type { StudioVrmPoserHost } from "./StudioVrmPoserHost";
import type {
  CustomPose,
  StudioVrmDirectJointRotationTransaction,
} from "./StudioVrmPoserTypes";
import type {
  VRM,
  VRMHumanBoneName,
} from "@pixiv/three-vrm";

export function useStudioVrmPoserPoseEdit(h: StudioVrmPoserHost): void {
  const {
    dialogRef,
    status,
    vrm,
    isCapturing,
    webcamActive,
    idleAnimation,
    activePoseId,
    setActivePoseId,
    customBones,
    setCustomBones,
    customYOffset,
    setCustomYOffset,
    poseTranslations,
    setPoseTranslations,
    ikConstraints,
    setIkConstraints,
    setActiveCategory,
    jointLimitsEnabled,
    rigJointProfile,
    fullBodyIkEnabled,
    footPlantEnabled,
    rigFloorHeight,
    lockedPoseBones,
    setLockedPoseBones,
    setSelectedViewportPoseBone,
    setSelectedJointHandle,
    viewportHandIkEnabled,
    setIsViewportHandIkDragging,
    setActiveExpressionId,
    expressionWeights,
    setExpressionWeights,
    recentPreferencesRuntime,
    bodyRotation,
    setBodyRotation,
    setJointHandleStatus,
    setTurntable,
    fullStateHistoryRef,
    setCanUndo,
    setCanRedo,
    activeModelId,
    bodyScale,
    fingerEdits,
    setFingerEdits,
    setLighting,
    setLightingTone,
    savedPoses,
    preserveExpression,
    vrmPropItems,
    costumeState,
    costumeMeshes,
    wardrobeState,
    effectivePropRigMetrics,
    wardrobeAutoHide,
    physicsPreview,
    vrmRef,
    directJointRotationTransactionRef,
    jointIkTransactionRef,
    persistentIkResolvedSignatureRef,
    pendingPersistentIkCommandRef,
    persistentIkReconciling,
    setPersistentIkReconciling,
    persistentIkCaptureIsReady,
    cancelJointIkTransaction,
    captureFullState,
    poseMaterialRuntimeDisabled,
    handleCustomPoseSelect,
  } = h;
  const directRotationTransactionRef = (directJointRotationTransactionRef ?? { current: null }) as {
    current: StudioVrmDirectJointRotationTransaction | null;
  };
  const viewportHandIkTransactionRef = useRef<{
    vrm: VRM;
    boneName: "leftHand" | "rightHand";
    side: "left" | "right";
    chain: readonly VRMHumanBoneName[];
    before: FullVrmState;
    baseline: NonNullable<ReturnType<typeof bakeStudioVrmRuntimePose>>;
    poseTranslations: FullVrmState["poseTranslations"];
    fingerEdits: FingerRotationMap;
    bodyScale: BodyScale;
    handWorldQuaternion: THREE.Quaternion;
    gripState: VrmTwoBoneGripState;
    applied: boolean;
  } | null>(null);

  function restoreViewportHandIkPreview(transaction: NonNullable<
    typeof viewportHandIkTransactionRef.current
  >): void {
    releaseVrmTwoBoneGripState(transaction.gripState);
    applyPoserVisualState(transaction.vrm, {
      bones: stripFingerBones(transaction.baseline.bones),
      yOffset: transaction.baseline.yOffset,
      poseTranslations: transaction.poseTranslations,
      fingerEdits: transaction.fingerEdits,
      bodyScale: transaction.bodyScale,
    });
  }

  useEffect(() => () => {
    const transaction = viewportHandIkTransactionRef.current;
    viewportHandIkTransactionRef.current = null;
    if (transaction) restoreViewportHandIkPreview(transaction);
  }, []);

  function handlePoseSelect(poseId: string) {
    const pose = findPose(poseId);
    const strippedBones = stripFingerBones(pose.bones);
    const poseFingers = extractStudioVrmFingerRotations(pose.bones);
    const nextYOffset = pose.yOffset ?? 0;
    const nextTranslations = cloneStudioVrmPoseTranslations(EMPTY_STUDIO_VRM_POSE_TRANSLATIONS);
    const before = captureFullState();
    const plan = createStudioVrmPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      incomingBones: strippedBones,
      ...(Object.keys(poseFingers).length > 0 ? { incomingFingerEdits: poseFingers } : {}),
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => {
        const humanoid = vrmRef.current?.humanoid;
        if (!humanoid) return true;
        return Boolean(humanoid.getNormalizedBoneNode(bone));
      },
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radians) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radians),
          ))
        : undefined,
    });
    const after = serializeFullVrmState({
      ...before,
      poseId,
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
      yOffset: nextYOffset,
      poseTranslations: nextTranslations,
      ...(preserveExpression
        ? {}
        : { expressionId: "neutral", expressionWeights: {} }),
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setActivePoseId(poseId);
    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    setCustomYOffset(nextYOffset);
    setPoseTranslations(nextTranslations);
    if (!preserveExpression) {
      setExpressionWeights({});
      setActiveExpressionId("neutral");
    }
    // `saveStudioVrmRecentPoses` remains only as an explicit legacy import/test seam in the pure
    // UX module. The product path records this selection through SQLite/OPFS.
    recentPreferencesRuntime.rememberPose(poseId);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, {
        bones: plan.bones,
        yOffset: nextYOffset,
        poseTranslations: nextTranslations,
        fingerEdits: plan.fingerEdits,
        bodyScale,
      });
      applyExpressionWeightsToVrm(
        vrmRef.current,
        preserveExpression ? expressionWeights : {},
      );
    }
    const appliedCount = plan.appliedBodyBones.length + plan.appliedFingerBones.length;
    if (plan.skippedLocked.length > 0) {
      setJointHandleStatus(
        appliedCount > 0
          ? `잠긴 관절 ${plan.skippedLocked.length}개는 유지하고 포즈를 적용했어요.`
          : `잠긴 관절 ${plan.skippedLocked.length}개는 유지하고, 적용할 관절이 없어 높이만 반영했어요.`,
      );
    } else if (appliedCount === 0 && plan.skippedMissing.length + plan.skippedInvalid.length > 0) {
      setJointHandleStatus("적용할 수 있는 관절이 없어 높이만 반영했어요.");
    }
  }

  function handleResetActivePose(): void {
    if (activePoseId.startsWith("custom-")) {
      const savedPose = savedPoses.find((pose: CustomPose) => pose.id === activePoseId);
      if (savedPose) handleCustomPoseSelect(savedPose);
      return;
    }
    const preset = findPoseById(activePoseId);
    if (preset) handlePoseSelect(preset.id);
  }

  function rememberCharacterSelection(modelId: string) {
    recentPreferencesRuntime.rememberCharacter(modelId);
  }

  function handlePhotoPoseApply(payload: StudioVrmPhotoPoseApplyPayload) {
    const currentVrm = vrmRef.current;
    if (
      !currentVrm
      || poseMaterialRuntimeDisabled
      || pendingPersistentIkCommandRef.current
      || jointIkTransactionRef.current
      || !persistentIkCaptureIsReady()
    ) return false;
    if (payload.yOffset !== undefined && !Number.isFinite(payload.yOffset)) return false;

    const before = captureFullState();
    const plan = createStudioVrmPhotoPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      scannedBones: payload.bones,
      scannedFingerEdits: payload.fingerEdits,
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => Boolean(currentVrm.humanoid?.getNormalizedBoneNode(bone)),
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radians) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radians),
          ))
        : undefined,
    });
    if (plan.appliedBodyBones.length === 0 && plan.appliedFingerBones.length === 0) {
      setJointHandleStatus("사진에서 적용할 수 있는 잠금 해제 관절을 찾지 못했습니다.");
      return false;
    }

    const poseId = "photo-scan";
    const nextYOffset = payload.yOffset ?? before.yOffset;
    const after = serializeFullVrmState({
      ...before,
      poseId,
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
      yOffset: nextYOffset,
    });
    const candidateSignature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: plan.bones,
      fingerEdits: plan.fingerEdits,
      yOffset: after.yOffset,
      translations: after.poseTranslations,
      bodyRotation: after.bodyRotation,
      bodyScale: after.bodyScale ?? bodyScale,
      proportions: parseAvatarForgeState(after.avatarForge).proportions,
      constraints: after.ikConstraints,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    if (
      after.ikConstraints.some((constraint) => constraint.enabled && constraint.locked)
      && persistentIkResolvedSignatureRef.current !== candidateSignature
    ) {
      pendingPersistentIkCommandRef.current = {
        before,
        candidateAfter: after,
        inputSignature: candidateSignature,
        historyGeneration: fullStateHistoryRef.current.generation,
      };
      setPersistentIkReconciling(true);
    } else {
      const nextHistory = commitStudioVrmFullStateHistoryTransaction(
        fullStateHistoryRef.current,
        before,
        after,
        activeModelId,
      );
      fullStateHistoryRef.current = nextHistory;
      setCanUndo(nextHistory.index > 0);
      setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    }

    setActivePoseId(poseId);
    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    setCustomYOffset(nextYOffset);
    const nextEffectiveFingers = resolveStudioVrmFingerAuthority(
      plan.fingerEdits,
      createAutoGripFingerOverrides(
        vrmPropItems,
        propDefById,
        effectivePropRigMetrics,
      ),
    );
    applyPoserVisualState(currentVrm, {
      bones: plan.bones,
      yOffset: nextYOffset,
      poseTranslations,
      fingerEdits: nextEffectiveFingers,
      bodyScale,
    });
    setJointHandleStatus(
      `사진 포즈 관절 ${plan.appliedBodyBones.length}개${
        payload.detectedHandSides.length > 0
          ? ` · 손가락 ${plan.appliedFingerBones.length}개`
          : ""
      }를 적용했습니다.`,
    );
    return true;
  }

  function applyLightingQuickPreset(presetId: string) {
    const preset = findStudioVrmLightingQuickPreset(presetId);
    setLighting({
      intensity: preset.intensity,
      colorTemp: preset.colorTemp,
      directionDeg: preset.directionDeg,
    });
    if (preset.tone) setLightingTone(preset.tone);
  }

  // 포즈 좌우 반전 — 전체뿐 아니라 팔/다리만 교환해 포즈 믹서처럼 사용할 수 있다.
  // 회전은 lock-aware plan으로 잠긴 관절을 유지하고, 이동/IK 제약은 기존처럼 미러한다.
  function handleMirrorPose(scope: StudioVrmPoseMirrorScope = "all") {
    if (!vrm) return;
    const mirroredBones = mirrorStudioVrmPoseBones(customBones, scope);
    const mirroredFingers = mirrorStudioVrmFingerRotations(fingerEdits, scope);
    const mirroredTranslations = mirrorStudioVrmPoseTranslations(poseTranslations, scope);
    const mirroredConstraints = mirrorStudioVrmIkConstraints(ikConstraints, scope);
    const before = captureFullState();
    const plan = createStudioVrmPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      incomingBones: mirroredBones,
      incomingFingerEdits: mirroredFingers,
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => {
        const humanoid = vrmRef.current?.humanoid;
        if (!humanoid) return true;
        return Boolean(humanoid.getNormalizedBoneNode(bone));
      },
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radians) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radians),
          ))
        : undefined,
    });
    const after = serializeFullVrmState({
      ...before,
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
      poseTranslations: mirroredTranslations,
      ikConstraints: mirroredConstraints,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    setPoseTranslations(mirroredTranslations);
    setIkConstraints(mirroredConstraints);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, {
        bones: plan.bones,
        yOffset: customYOffset,
        poseTranslations: mirroredTranslations,
        fingerEdits: plan.fingerEdits,
        bodyScale,
      });
    }
    if (plan.skippedLocked.length > 0) {
      setJointHandleStatus(
        `잠긴 관절 ${plan.skippedLocked.length}개는 유지하고 좌우 반전을 적용했어요.`,
      );
    }
  }

  function commitIkConstraintSettings(
    nextConstraints: readonly StudioVrmIkConstraint[],
    statusMessage: string,
  ) {
    cancelJointIkTransaction({ restoreBaseline: false });
    const before = captureFullState();
    const canonical = cloneStudioVrmIkConstraints(nextConstraints);
    const after = serializeFullVrmState({ ...before, ikConstraints: canonical });
    const candidateSignature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: before.bones,
      fingerEdits: before.fingerOverrides ?? {},
      yOffset: before.yOffset,
      translations: before.poseTranslations,
      bodyRotation: before.bodyRotation,
      bodyScale: before.bodyScale ?? bodyScale,
      proportions: parseAvatarForgeState(before.avatarForge).proportions,
      constraints: canonical,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    if (
      canonical.some((constraint) => constraint.enabled && constraint.locked)
      && persistentIkResolvedSignatureRef.current !== candidateSignature
    ) {
      pendingPersistentIkCommandRef.current = {
        before,
        candidateAfter: after,
        inputSignature: candidateSignature,
        historyGeneration: fullStateHistoryRef.current.generation,
      };
      setPersistentIkReconciling(true);
    } else {
      const nextHistory = commitStudioVrmFullStateHistoryTransaction(
        fullStateHistoryRef.current,
        before,
        after,
        activeModelId,
      );
      fullStateHistoryRef.current = nextHistory;
      setCanUndo(nextHistory.index > 0);
      setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    }
    setIkConstraints(canonical);
    setJointHandleStatus(statusMessage);
  }

  function handleStraightenUpperBody() {
    if (!vrm) return;
    const straightenedBones = straightenStudioVrmUpperBody(customBones);
    const before = captureFullState();
    const plan = createStudioVrmPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      incomingBones: straightenedBones,
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => {
        const humanoid = vrmRef.current?.humanoid;
        if (!humanoid) return true;
        return Boolean(humanoid.getNormalizedBoneNode(bone));
      },
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radians) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radians),
          ))
        : undefined,
    });
    const after = serializeFullVrmState({
      ...before,
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, {
        bones: plan.bones,
        yOffset: customYOffset,
        poseTranslations,
        fingerEdits: plan.fingerEdits,
        bodyScale,
      });
    }
    if (plan.skippedLocked.length > 0) {
      setJointHandleStatus(
        `잠긴 관절 ${plan.skippedLocked.length}개는 유지하고 상체를 곧게 펴 적용했어요.`,
      );
    }
  }

  function handleNaturalizePose() {
    const currentVrm = vrmRef.current ?? vrm;
    if (!currentVrm) return;
    if (isCapturing || webcamActive || idleAnimation) {
      setJointHandleStatus(
        "캡처·웹캠·자동 모션을 멈춘 뒤 현재 자세를 자연스럽게 다듬어 주세요.",
      );
      return;
    }
    const directRotation = directRotationTransactionRef.current;
    if (directRotation) {
      restoreDirectJointRotationTransaction(
        directRotation,
        "진행 중인 관절 회전을 취소하고 현재 자세 자연화를 시작했습니다.",
      );
    }
    if (jointIkTransactionRef.current) {
      cancelJointIkTransaction({
        status: "진행 중인 IK 이동을 정리하고 현재 자세 자연화를 시작했습니다.",
      });
    }

    const baked = bakeStudioVrmRuntimePose(currentVrm, STUDIO_VRM_DIRECT_EDIT_BONES);
    if (!baked) {
      setJointHandleStatus("현재 보이는 자세의 관절 회전을 읽지 못했습니다.");
      return;
    }
    const naturalized = naturalizeStudioVrmPose({
      bones: stripFingerBones(baked.bones),
      lockedBones: lockedPoseBones,
    });
    if (naturalized.changedBones.length === 0) {
      const suffix = naturalized.skippedInvalid.length > 0
        ? ` 읽을 수 없는 관절 ${naturalized.skippedInvalid.length}개는 건너뛰었습니다.`
        : "";
      setJointHandleStatus(`현재 자세는 이미 자연스러운 관절 분포입니다.${suffix}`);
      return;
    }

    const before = captureFullState();
    const plan = createStudioVrmPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      incomingBones: naturalized.bones,
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => {
        const humanoid = currentVrm.humanoid;
        return Boolean(humanoid?.getNormalizedBoneNode(bone));
      },
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radiansValue) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radiansValue),
          ))
        : undefined,
    });
    const after = serializeFullVrmState({
      ...before,
      poseId: "manual-pose",
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
      yOffset: baked.yOffset,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setActivePoseId("manual-pose");
    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    setCustomYOffset(baked.yOffset);
    applyPoserVisualState(currentVrm, {
      bones: plan.bones,
      yOffset: baked.yOffset,
      poseTranslations,
      fingerEdits: plan.fingerEdits,
      bodyScale,
    });

    const lockedSummary = plan.skippedLocked.length > 0
      ? ` 잠긴 관절 ${plan.skippedLocked.length}개는 그대로 유지했습니다.`
      : "";
    const invalidSummary = naturalized.skippedInvalid.length > 0
      ? ` 읽을 수 없는 관절 ${naturalized.skippedInvalid.length}개는 건너뛰었습니다.`
      : "";
    setJointHandleStatus(
      `현재 보이는 자세에서 관절 ${naturalized.changedBones.length}개의 꺾임과 하중 분배를 자연스럽게 다듬었습니다.${lockedSummary}${invalidSummary}`,
    );
  }

  function handleGroundAndBalancePose() {
    const currentVrm = vrmRef.current ?? vrm;
    if (!currentVrm) return;
    if (isCapturing || webcamActive || idleAnimation) {
      setJointHandleStatus(
        "캡처·웹캠·자동 모션을 멈춘 뒤 발 접지와 무게중심을 맞춰 주세요.",
      );
      return;
    }
    const directRotation = directRotationTransactionRef.current;
    if (directRotation) {
      restoreDirectJointRotationTransaction(
        directRotation,
        "진행 중인 관절 회전을 취소하고 발 접지·균형 보정을 시작했습니다.",
      );
    }
    if (jointIkTransactionRef.current) {
      cancelJointIkTransaction({
        status: "진행 중인 IK 이동을 정리하고 발 접지·균형 보정을 시작했습니다.",
      });
    }

    const sample = sampleStudioVrmGroundBalance(currentVrm);
    const balancePlan = sample
      ? planStudioVrmGroundBalance(sample, rigFloorHeight)
      : null;
    if (!balancePlan) {
      setJointHandleStatus(
        "양발·골반·상체 본을 읽지 못해 자동 접지와 무게중심 보정을 적용하지 못했습니다.",
      );
      return;
    }

    const before = captureFullState();
    const balanceTranslation = applyStudioVrmGroundBalanceTranslation(
      currentVrm.scene,
      before.poseTranslations,
      balancePlan.correctionWorld,
    );
    if (!balanceTranslation) {
      setJointHandleStatus("현재 모델 좌표에서 무게중심 보정량을 안전하게 변환하지 못했습니다.");
      return;
    }

    const nextYOffset = THREE.MathUtils.clamp(
      before.yOffset + balancePlan.floorDeltaM,
      -10,
      10,
    );
    const floorAppliedM = nextYOffset - before.yOffset;
    const balanceAppliedM = Math.hypot(
      balanceTranslation.appliedWorld[0],
      balanceTranslation.appliedWorld[2],
    );
    if (Math.abs(floorAppliedM) <= 1e-5 && balanceAppliedM <= 1e-5) {
      setJointHandleStatus("현재 자세는 이미 바닥에 접지되어 있고 무게중심도 양발 지지 영역 안에 있습니다.");
      return;
    }

    const nextTranslations = cloneStudioVrmPoseTranslations(balanceTranslation.translations);
    const nextBones = stripFingerBones(before.bones);
    const nextFingerEdits = { ...(before.fingerOverrides ?? fingerEdits) };
    const nextBodyScale = { ...(before.bodyScale ?? bodyScale) };
    const after = serializeFullVrmState({
      ...before,
      poseId: "grounded-balanced-pose",
      bones: nextBones,
      yOffset: nextYOffset,
      poseTranslations: nextTranslations,
      fingerOverrides: nextFingerEdits,
      bodyScale: nextBodyScale,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setActivePoseId("grounded-balanced-pose");
    setCustomBones(nextBones);
    setCustomYOffset(nextYOffset);
    setPoseTranslations(nextTranslations);
    setFingerEdits(nextFingerEdits);
    applyPoserVisualState(currentVrm, {
      bones: nextBones,
      yOffset: nextYOffset,
      poseTranslations: nextTranslations,
      fingerEdits: nextFingerEdits,
      bodyScale: nextBodyScale,
    });

    const floorSummary = Math.abs(floorAppliedM) > 1e-5
      ? ` 발 높이를 ${Math.round(Math.abs(floorAppliedM) * 1000)}mm 맞췄습니다.`
      : "";
    const balanceSummary = balanceAppliedM > 1e-5
      ? ` 상체 무게중심을 ${Math.round(balanceAppliedM * 1000)}mm 지지 영역 쪽으로 옮겼습니다.`
      : "";
    const limitedSummary = balanceTranslation.limited
      ? " 관절 이동 안전 범위 안에서 가능한 만큼만 적용했습니다."
      : "";
    setJointHandleStatus(
      `발 접지와 무게중심 보정을 적용했습니다.${floorSummary}${balanceSummary}${limitedSummary}`,
    );
  }

  function togglePoseBoneLock(boneName: VRMHumanBoneName) {
    const directRotation = directRotationTransactionRef.current;
    if (directRotation) {
      restoreDirectJointRotationTransaction(
        directRotation,
        "진행 중인 관절 회전을 취소하고 잠금을 변경했습니다.",
      );
    }
    if (jointIkTransactionRef.current) {
      cancelJointIkTransaction({ status: "진행 중인 IK 이동을 취소하고 관절 잠금을 변경했습니다." });
    }
    if (!lockedPoseBones.includes(boneName)) {
      const conflictsWithPin = ikConstraints.some((constraint: StudioVrmIkConstraint) => {
        if (!constraint.enabled || !constraint.locked) return false;
        const chain = STUDIO_VRM_USER_IK_CHAINS[constraint.effector];
        return [chain.upper, chain.lower, chain.end].includes(boneName);
      });
      if (conflictsWithPin) {
        setJointHandleStatus("이 관절은 유지 중인 손·발 고정점이 사용합니다. 먼저 고정점 유지를 해제해 주세요.");
        return;
      }
    }
    setLockedPoseBones((current: string[]) =>
      current.includes(boneName)
        ? current.filter((candidate: string) => candidate !== boneName)
        : [...current, boneName]
    );
  }

  function selectViewportPoseBone(boneName: VRMHumanBoneName) {
    setSelectedViewportPoseBone(boneName);
    const category = BONE_CATEGORIES.find((candidate) => candidate.bones.includes(boneName));
    if (category) setActiveCategory(category.id);
    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector(`[data-vrm-pose-bone="${boneName}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function restoreDirectJointRotationTransaction(
    transaction: StudioVrmDirectJointRotationTransaction,
    statusMessage: string,
  ) {
    directRotationTransactionRef.current = null;
    setActivePoseId(transaction.originalPoseId);
    setCustomBones(transaction.before.bones);
    setCustomYOffset(transaction.before.yOffset);
    setPoseTranslations(cloneStudioVrmPoseTranslations(transaction.before.poseTranslations));
    setFingerEdits(transaction.before.fingerOverrides ?? {});
    if (vrmRef.current === transaction.vrm) {
      applyPoserVisualState(transaction.vrm, {
        bones: transaction.before.bones,
        yOffset: transaction.before.yOffset,
        poseTranslations: transaction.before.poseTranslations,
        fingerEdits: transaction.before.fingerOverrides ?? {},
        bodyScale: transaction.before.bodyScale ?? bodyScale,
      });
    }
    setJointHandleStatus(statusMessage);
  }

  function handleViewportJointRotationGesture(
    boneName: StudioVrmJointHandleBone,
    deltaDegrees: StudioVrmJointRotationDelta,
    phase: StudioVrmJointRotationPhase,
  ) {
    const currentVrm = vrmRef.current;
    if (phase === "cancel") {
      const transaction = directRotationTransactionRef.current;
      if (transaction?.bone === boneName) {
        restoreDirectJointRotationTransaction(
          transaction,
          `${BONE_LABELS[boneName] ?? boneName} 회전을 취소하고 시작 자세로 되돌렸습니다.`,
        );
      }
      return;
    }

    if (phase === "start") {
      const previous = directRotationTransactionRef.current;
      if (previous) {
        restoreDirectJointRotationTransaction(
          previous,
          "이전 관절 회전을 취소하고 새 관절 편집을 시작했습니다.",
        );
      }
      if (
        !currentVrm
        || webcamActive
        || idleAnimation
        || isCapturing
        || persistentIkReconciling
        || jointIkTransactionRef.current
        || (typeof persistentIkCaptureIsReady === "function" && !persistentIkCaptureIsReady())
      ) {
        setJointHandleStatus(
          "실시간 추적·대기 애니메이션·캡처·IK 재계산 중에는 관절을 직접 회전할 수 없습니다.",
        );
        return;
      }
      if (lockedPoseBones.includes(boneName)) {
        setJointHandleStatus(`${BONE_LABELS[boneName] ?? boneName} 관절이 잠겨 있습니다.`);
        return;
      }
      const node = currentVrm.humanoid?.getNormalizedBoneNode(boneName);
      if (!node) {
        setJointHandleStatus("이 캐릭터에는 선택한 휴머노이드 관절이 없습니다.");
        return;
      }
      const conflictingPin = ikConstraints.find((constraint: StudioVrmIkConstraint) => {
        if (!constraint.enabled || !constraint.locked) return false;
        const chain = STUDIO_VRM_USER_IK_CHAINS[constraint.effector];
        return [chain.upper, chain.lower, chain.end].includes(boneName);
      });
      if (conflictingPin) {
        setJointHandleStatus(
          "이 관절은 유지 중인 손·발 고정점이 사용합니다. 먼저 해당 고정점 유지를 해제해 주세요.",
        );
        return;
      }
      const baked = bakeStudioVrmRuntimePose(currentVrm, STUDIO_VRM_DIRECT_EDIT_BONES);
      if (!baked) {
        setJointHandleStatus("현재 보이는 자세를 직접 회전용 관절값으로 변환하지 못했습니다.");
        return;
      }
      const baselineBones: PoseBoneMap = {
        ...customBones,
        ...stripFingerBones(baked.bones),
      };
      const baselineRotation = getPoseBoneRotation(baselineBones[boneName]);
      const before = captureFullState();
      directRotationTransactionRef.current = {
        vrm: currentVrm,
        bone: boneName,
        before,
        originalPoseId: activePoseId,
        baselineBones,
        baselineRotation: [...baselineRotation],
        latestBones: baselineBones,
        latestRotation: [...baselineRotation],
        didPreview: false,
      };
      setSelectedJointHandle?.(boneName);
      setSelectedViewportPoseBone(boneName);
      const category = BONE_CATEGORIES.find((candidate) => candidate.bones.includes(boneName));
      if (category) setActiveCategory(category.id);
      setTurntable(false);
      setJointHandleStatus(
        `${BONE_LABELS[boneName] ?? boneName} 직접 회전 · 놓으면 한 번의 편집으로 저장됩니다.`,
      );
      return;
    }

    const transaction = directRotationTransactionRef.current;
    if (!transaction || transaction.bone !== boneName || transaction.vrm !== currentVrm) return;
    if (!deltaDegrees.every(Number.isFinite)) {
      restoreDirectJointRotationTransaction(transaction, "유효하지 않은 회전 입력을 취소했습니다.");
      return;
    }

    if (phase === "move") {
      const requestedRotation = transaction.baselineRotation.map((value, index) => (
        value + THREE.MathUtils.degToRad(deltaDegrees[index] ?? 0)
      )) as [number, number, number];
      const nextRotation = jointLimitsEnabled
        ? clampStudioVrmJointRotation(boneName, requestedRotation)
        : requestedRotation;
      const nextBones: PoseBoneMap = {
        ...transaction.baselineBones,
        [boneName]: { rotation: [...nextRotation] },
      };
      transaction.latestBones = nextBones;
      transaction.latestRotation = [...nextRotation];
      transaction.didPreview = true;
      setActivePoseId("manual-pose");
      setCustomBones(nextBones);
      applyPoserVisualState(transaction.vrm, {
        bones: nextBones,
        yOffset: transaction.before.yOffset,
        poseTranslations: transaction.before.poseTranslations,
        fingerEdits: transaction.before.fingerOverrides ?? {},
        bodyScale: transaction.before.bodyScale ?? bodyScale,
      });
      const renderedDelta = nextRotation.map((value, index) => Math.round(
        THREE.MathUtils.radToDeg(value - transaction.baselineRotation[index]),
      ));
      const limited = nextRotation.some((value, index) => (
        Math.abs(value - requestedRotation[index]) > 1e-5
      ));
      setJointHandleStatus(
        `${BONE_LABELS[boneName] ?? boneName} 회전 중 · X ${renderedDelta[0]}° · Y ${renderedDelta[1]}° · Z ${renderedDelta[2]}°${limited ? " · 관절 안전 범위 적용" : ""}`,
      );
      return;
    }

    if (phase !== "end") return;
    directRotationTransactionRef.current = null;
    if (!transaction.didPreview) return;
    const after = serializeFullVrmState({
      ...transaction.before,
      poseId: "manual-pose",
      bones: transaction.latestBones,
    });
    const candidateSignature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: transaction.latestBones,
      fingerEdits: after.fingerOverrides ?? {},
      yOffset: after.yOffset,
      translations: after.poseTranslations,
      bodyRotation: after.bodyRotation,
      bodyScale: after.bodyScale ?? bodyScale,
      proportions: parseAvatarForgeState(after.avatarForge).proportions,
      constraints: after.ikConstraints,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    const needsPersistentIkReconcile = after.ikConstraints.some((constraint) => (
      constraint.enabled && constraint.locked
    )) && persistentIkResolvedSignatureRef.current !== candidateSignature;

    if (needsPersistentIkReconcile) {
      pendingPersistentIkCommandRef.current = {
        before: transaction.before,
        candidateAfter: after,
        inputSignature: candidateSignature,
        historyGeneration: fullStateHistoryRef.current.generation,
      };
      setPersistentIkReconciling(true);
    } else {
      const nextHistory = commitStudioVrmFullStateHistoryTransaction(
        fullStateHistoryRef.current,
        transaction.before,
        after,
        activeModelId,
      );
      fullStateHistoryRef.current = nextHistory;
      setCanUndo(nextHistory.index > 0);
      setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    }

    setActivePoseId("manual-pose");
    setCustomBones(transaction.latestBones);
    applyPoserVisualState(transaction.vrm, {
      bones: transaction.latestBones,
      yOffset: after.yOffset,
      poseTranslations: after.poseTranslations,
      fingerEdits: after.fingerOverrides ?? fingerEdits,
      bodyScale: after.bodyScale ?? bodyScale,
    });
    setJointHandleStatus(
      needsPersistentIkReconcile
        ? `${BONE_LABELS[boneName] ?? boneName} 회전 적용 · 유지 중인 손·발 고정점을 다시 맞추는 중입니다.`
        : `${BONE_LABELS[boneName] ?? boneName} 회전 적용 완료 · 실행 취소로 한 번에 되돌릴 수 있습니다.`,
    );
  }

  function handleViewportHandIkDrag(
    boneName: VRMHumanBoneName,
    target: readonly [number, number, number],
    phase: "start" | "move" | "end" | "cancel",
  ) {
    const activeTransaction = viewportHandIkTransactionRef.current;
    const cancelActiveTransaction = (message?: string) => {
      const transaction = viewportHandIkTransactionRef.current;
      viewportHandIkTransactionRef.current = null;
      setIsViewportHandIkDragging(false);
      if (transaction) restoreViewportHandIkPreview(transaction);
      if (message) setJointHandleStatus(message);
    };

    if (phase === "cancel") {
      if (!activeTransaction || activeTransaction.boneName === boneName) {
        cancelActiveTransaction("손 IK 이동을 취소하고 시작 자세로 되돌렸습니다.");
      }
      return;
    }

    const currentVrm = vrmRef.current;
    const validBone = boneName === "leftHand" || boneName === "rightHand";
    const validTarget = target.every((value) => Number.isFinite(value) && Math.abs(value) <= 100);
    if (!currentVrm || !viewportHandIkEnabled || !validBone || !validTarget) {
      if (phase === "end" || activeTransaction) {
        cancelActiveTransaction("손 IK 목표를 안전하게 해석하지 못해 시작 자세로 되돌렸습니다.");
      }
      return;
    }

    const handBone = boneName as "leftHand" | "rightHand";
    const side = handBone === "leftHand" ? "left" : "right";
    const chain = [
      `${side}UpperArm`,
      `${side}LowerArm`,
      `${side}Hand`,
    ] as const satisfies readonly VRMHumanBoneName[];
    if (chain.some((chainBone) => lockedPoseBones.includes(chainBone))) {
      if (phase === "end" || activeTransaction) cancelActiveTransaction();
      setJointHandleStatus("잠긴 어깨·팔꿈치·손목이 포함된 손은 IK로 움직일 수 없습니다.");
      return;
    }

    let transaction = activeTransaction;
    if (phase === "start") {
      if (transaction) {
        restoreViewportHandIkPreview(transaction);
        viewportHandIkTransactionRef.current = null;
      }
      if (jointIkTransactionRef.current) {
        cancelJointIkTransaction({
          status: "진행 중인 정밀 IK를 취소하고 손 직접 이동을 시작했습니다.",
        });
      }
      const baseline = bakeStudioVrmRuntimePose(currentVrm, STUDIO_VRM_DIRECT_EDIT_BONES);
      const handNode = currentVrm.humanoid?.getNormalizedBoneNode(handBone);
      if (!baseline || !handNode) {
        setIsViewportHandIkDragging(false);
        setJointHandleStatus("현재 손과 팔의 시작 자세를 읽지 못했습니다.");
        return;
      }
      currentVrm.scene.updateMatrixWorld(true);
      const handWorldQuaternion = handNode.getWorldQuaternion(new THREE.Quaternion()).normalize();
      if (![
        handWorldQuaternion.x,
        handWorldQuaternion.y,
        handWorldQuaternion.z,
        handWorldQuaternion.w,
      ].every(Number.isFinite)) {
        setIsViewportHandIkDragging(false);
        setJointHandleStatus("현재 손바닥 방향을 읽지 못했습니다.");
        return;
      }
      const before = captureFullState();
      transaction = {
        vrm: currentVrm,
        boneName: handBone,
        side,
        chain,
        before,
        baseline,
        poseTranslations: cloneStudioVrmPoseTranslations(before.poseTranslations),
        fingerEdits: { ...(before.fingerOverrides ?? fingerEdits) },
        bodyScale: { ...(before.bodyScale ?? bodyScale) },
        handWorldQuaternion,
        gripState: createVrmTwoBoneGripState(),
        applied: false,
      };
      viewportHandIkTransactionRef.current = transaction;
      setIsViewportHandIkDragging(true);
      setTurntable(false);
    }

    if (
      !transaction
      || transaction.vrm !== currentVrm
      || transaction.boneName !== handBone
      || transaction.side !== side
    ) {
      if (phase === "end") cancelActiveTransaction();
      return;
    }

    const applied = applyVrmTwoBoneGrip(
      currentVrm,
      side,
      new THREE.Vector3(target[0], target[1], target[2]),
      1,
      undefined,
      {
        state: transaction.gripState,
        targetQuaternion: transaction.handWorldQuaternion,
      },
    );
    transaction.applied = transaction.applied || applied;
    if (phase !== "end") return;

    setIsViewportHandIkDragging(false);
    if (!transaction.applied || !applied) {
      cancelActiveTransaction("손이 도달 가능한 자세를 찾지 못해 시작 자세로 되돌렸습니다.");
      return;
    }

    const baked = bakeStudioVrmRuntimePose(currentVrm, transaction.chain);
    if (!baked) {
      cancelActiveTransaction("완성된 손 IK 자세를 읽지 못해 시작 자세로 되돌렸습니다.");
      return;
    }

    const nextBones: PoseBoneMap = { ...transaction.before.bones };
    for (const chainBone of transaction.chain) {
      const rotation = baked.bones[chainBone]?.rotation;
      if (!rotation) {
        cancelActiveTransaction("팔 관절 결과가 불완전해 시작 자세로 되돌렸습니다.");
        return;
      }
      nextBones[chainBone] = {
        rotation: jointLimitsEnabled
          ? clampStudioVrmJointRotation(chainBone, rotation)
          : [...rotation] as [number, number, number],
      };
    }

    const after = serializeFullVrmState({
      ...transaction.before,
      poseId: "visual-hand-ik",
      bones: nextBones,
      yOffset: transaction.baseline.yOffset,
      poseTranslations: transaction.poseTranslations,
      fingerOverrides: transaction.fingerEdits,
      bodyScale: transaction.bodyScale,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      transaction.before,
      after,
      activeModelId,
    );
    viewportHandIkTransactionRef.current = null;
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    setCustomBones(nextBones);
    setCustomYOffset(transaction.baseline.yOffset);
    setPoseTranslations(cloneStudioVrmPoseTranslations(transaction.poseTranslations));
    setFingerEdits(transaction.fingerEdits);
    setActivePoseId("visual-hand-ik");
    applyPoserVisualState(currentVrm, {
      bones: nextBones,
      yOffset: transaction.baseline.yOffset,
      poseTranslations: transaction.poseTranslations,
      fingerEdits: transaction.fingerEdits,
      bodyScale: transaction.bodyScale,
    });
    setJointHandleStatus(
      "손 위치를 적용했습니다. 시작 손바닥 방향과 팔꿈치 굽힘 기준을 유지해 손목 비틀림과 드래그 누적 오차를 줄였습니다.",
    );
  }

  function handleBoneRotationChange(boneName: string, axisIndex: number, degrees: number) {
    if (!vrm) return;
    const key = boneName as VRMHumanBoneName;
    if (lockedPoseBones.includes(key)) return;
    const safeDegrees = jointLimitsEnabled
      ? clampStudioVrmJointDegrees(key, axisIndex, degrees)
      : degrees;
    const radians = d(safeDegrees);
    const baked = bakeStudioVrmRuntimePose(vrm, STUDIO_VRM_DIRECT_EDIT_BONES);
    const bakedRotation = baked?.bones[key]?.rotation;
    setActivePoseId("manual-pose");
    if (POSER_FINGER_BONES.includes(key)) {
      // Single source of truth: fingers go to fingerEdits only
      setFingerEdits((prev: FingerRotationMap) => {
        const current = prev[key]
          ? [...prev[key]] as [number, number, number]
          : bakedRotation
            ? [...bakedRotation] as [number, number, number]
            : [0, 0, 0];
        current[axisIndex] = radians;
        return {
          ...prev,
          [key]: jointLimitsEnabled ? clampStudioVrmJointRotation(key, current) : current,
        };
      });
      return;
    }
    setCustomBones((prev: PoseBoneMap) => {
      const base = baked ? stripFingerBones(baked.bones) : prev;
      const current = bakedRotation
        ? [...bakedRotation] as [number, number, number]
        : [...getPoseBoneRotation(base[key])] as [number, number, number];
      current[axisIndex] = radians;
      return {
        ...base,
        [key]: {
          rotation: jointLimitsEnabled ? clampStudioVrmJointRotation(key, current) : current,
        },
      };
    });
  }

  function handleYOffsetChange(value: number) {
    setCustomYOffset(value);
  }

  /** Preserve authored state on the other hand, missing bones and locked joints. */
  function applyFingerPosePatch(patch: FingerRotationMap) {
    const humanoid = vrmRef.current?.humanoid;
    const applicable: FingerRotationMap = {};
    for (const [name, rotation] of Object.entries(patch)) {
      const bone = name as VRMHumanBoneName;
      if (!rotation || lockedPoseBones.includes(bone)) continue;
      if (humanoid && !humanoid.getNormalizedBoneNode(bone)) continue;
      applicable[bone] = jointLimitsEnabled
        ? clampStudioVrmJointRotation(bone, rotation)
        : rotation;
    }
    if (Object.keys(applicable).length === 0) return;
    setFingerEdits((prev: FingerRotationMap) => ({ ...prev, ...applicable }));
  }

  /** Coupled joint flexion; a selected finger never overwrites the other fingers. */
  function updateFingerCurl(side: 'left' | 'right', curlDeg: number, finger?: StudioVrmFingerName) {
    applyFingerPosePatch(createStudioVrmFingerCurlPose(side, curlDeg, finger));
  }

  function applyHandPosePreset(side: 'left' | 'right', poseType: StudioVrmHandPoseType) {
    applyFingerPosePatch(createStudioVrmHandPose(side, poseType));
  }

  function handleExpressionSelect(action: ExpressionAction) {
    setActiveExpressionId(action.id);
    const newWeights: Record<string, number> = {};
    if (action.name) {
      newWeights[action.name] = 1.0;
    }
    setExpressionWeights(newWeights);
    if (vrmRef.current) {
      applyExpressionWeightsToVrm(vrmRef.current, newWeights);
    }
  }

  // 표정 프리셋(조합) 원클릭 적용 — VRM 표준 blendshape 가중치 믹스를 한 번에 입힌다.
  // 모델에 없는 표정 이름은 applyExpressionWeightsToVrm이 건너뛴다.
  function handleExpressionPresetSelect(preset: StudioExpressionPreset) {
    const expressionId = `preset:${preset.id}`;
    const before = captureFullState();
    const plan = createStudioVrmExpressionApplyPlan({
      current: expressionWeights,
      incoming: preset.weights,
    });
    const nextWeights = { ...plan.weights };
    const after = serializeFullVrmState({
      ...before,
      expressionId,
      expressionWeights: nextWeights,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setActiveExpressionId(expressionId);
    setExpressionWeights(nextWeights);
    if (vrmRef.current) {
      applyExpressionWeightsToVrm(vrmRef.current, nextWeights);
    }
  }

  function updateExpressionWeight(name: string, value: number) {
    setExpressionWeights((prev: Record<string, number>) => {
      const next = { ...prev, [name]: value };
      if (value <= 0) {
        delete next[name];
      }

      if (vrmRef.current) {
        applyExpressionWeightsToVrm(vrmRef.current, next);
      }

      const activeKeys = Object.entries(next).filter(([_, val]) => val > 0);
      if (activeKeys.length === 0) {
        setActiveExpressionId("neutral");
      } else if (activeKeys.length === 1 && activeKeys[0][1] === 1.0) {
        setActiveExpressionId(activeKeys[0][0]);
      } else {
        setActiveExpressionId("custom");
      }

      return next;
    });
  }

  function handleBodyRotationChange(event: ChangeEvent<HTMLInputElement>) {
    setBodyRotation(d(Number(event.currentTarget.value)));
  }

  // 미리보기를 끄면 흔들림을 즉시 정착시켜 정지 프레임으로 되돌린다.
  useEffect(() => {
    if (physicsPreview) return;
    const current = vrmRef.current;
    if (current && countSpringBoneJoints(current) > 0) {
      settleVrmPhysics(current);
    }
  }, [physicsPreview]);

  /* ── 의상 토글/리컬러 핸들러 ─────────────────────────────────────── */
  useEffect(() => {
    applyStudioVrmCostumeState(
      costumeMeshes,
      mergeWardrobeCostumeVisibility(
        costumeState,
        wardrobeState,
        costumeMeshes,
        wardrobeAutoHide,
      ),
    );
  }, [costumeMeshes, costumeState, wardrobeAutoHide, wardrobeState]);

  const impl = h.__impl;
  if (impl) impl.rememberCharacterSelection = rememberCharacterSelection;
  Object.assign(h, {
    handlePoseSelect,
    handleResetActivePose,
    rememberCharacterSelection,
    handlePhotoPoseApply,
    applyLightingQuickPreset,
    handleMirrorPose,
    commitIkConstraintSettings,
    handleStraightenUpperBody,
    handleNaturalizePose,
    handleGroundAndBalancePose,
    togglePoseBoneLock,
    selectViewportPoseBone,
    handleViewportJointRotationGesture,
    handleViewportHandIkDrag,
    handleBoneRotationChange,
    handleYOffsetChange,
    updateFingerCurl,
    applyHandPosePreset,
    handleExpressionSelect,
    handleExpressionPresetSelect,
    updateExpressionWeight,
    handleBodyRotationChange,
  });
}
