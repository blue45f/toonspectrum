import { useCallback, useEffect, useRef, useState } from "react";
import { Euler, Quaternion, Vector3 } from "three";

import { STUDIO_VRM_BASE_ROTATION_Y_KEY } from "../../vrm/studio-vrm-asset-runtime";
import { EMPTY_STUDIO_VRM_POSE_TRANSLATIONS, normalizeStudioVrmPoseTranslations } from "../../vrm/studio-vrm-pose-translations";
import { readStudioVrmPoserShaperSurface, type StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";
import type { CharacterAuthoringAuthorityHookResult } from "../ui/use-character-authoring-authority";
import type { CharacterPoseRegion, CharacterVector3 } from "../pose/character-pose-v2";
import {
  applyCharacterPoseRuntimeV3, captureCharacterPoseRuntimeV3, characterPoseEulerBones,
  inspectCharacterPoseRuntime, isCharacterPoseBodyBone, readCharacterPoseRuntimeSource, resolveCharacterPoseRuntimeV3, solveCharacterPoseRuntimeV3,
  type CharacterPoseEffectorBone,
} from "./character-pose-runtime-adapter";

interface PendingPoseEcho {
  readonly request: PoseRuntimeRequest;
  readonly bones: Readonly<Record<string, CharacterVector3>>;
  readonly yOffset: number;
  readonly root: readonly number[];
  readonly bodyRotation: number;
}

interface PoseRuntimeRequest {
  readonly owner: CharacterAuthoringAuthorityHookResult["authority"];
  readonly vrm: unknown;
  readonly key: string;
  readonly retry: number;
}

interface PoseRuntimeReceipt extends PoseRuntimeRequest {
  readonly status: "pending" | "ready" | "error";
  readonly error: string | null;
}

function sameRequest(left: PoseRuntimeRequest | null, right: PoseRuntimeRequest): boolean {
  return left?.owner === right.owner && left.vrm === right.vrm && left.key === right.key && left.retry === right.retry;
}

function close(value: unknown, expected: number): boolean {
  return typeof value === "number" && Math.abs(value - expected) < 1e-8;
}

function matchesEcho(host: StudioVrmPoserHost, expected: PendingPoseEcho): boolean {
  const bones: unknown = host.customBones;
  if (!bones || typeof bones !== "object") return false;
  const entries = new Map(Object.entries(bones));
  if ([...entries.keys()].some((name) => isCharacterPoseBodyBone(name) && !(name in expected.bones))) return false;
  if (!Object.entries(expected.bones).every(([name, value]) => {
    const entry: unknown = entries.get(name);
    const rotation: unknown = entry && typeof entry === "object" && "rotation" in entry ? entry.rotation : entry;
    return Array.isArray(rotation) && value.every((item, index) => close(rotation[index], item));
  })) return false;
  const translations = normalizeStudioVrmPoseTranslations(host.poseTranslations);
  return close(host.customYOffset, expected.yOffset) && close(host.bodyRotation, expected.bodyRotation)
    && Boolean(translations && expected.root.every((item, index) => close(translations.root[index], item)));
}

export function useCharacterPoseRuntime({ h, authoring, selectedRegions }: {
  readonly h: StudioVrmPoserHost;
  readonly authoring: CharacterAuthoringAuthorityHookResult;
  readonly selectedRegions: readonly CharacterPoseRegion[];
}) {
  const [preserveFootPlant, setPreserveFootPlant] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PoseRuntimeReceipt | null>(null);
  const [retry, setRetry] = useState(0);
  const { setRuntimeSyncPending } = authoring;
  const sequence = useRef(0);
  const hostRef = useRef(h); hostRef.current = h;
  const source = readCharacterPoseRuntimeSource(h.vrm);
  const capability = inspectCharacterPoseRuntime(source);
  const previewing = authoring.snapshot.previewCommandId?.startsWith("pose-v3:") ?? false;
  const pose = (authoring.snapshot.previewDocument ?? authoring.snapshot.document).pose;
  const poseKey = JSON.stringify({ root: pose.root, bones: Object.entries(pose.bones).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) });
  const poseRef = useRef(pose); poseRef.current = pose;
  const request: PoseRuntimeRequest = { owner: authoring.authority, vrm: h.vrm, key: poseKey, retry };
  const requestRef = useRef(request); requestRef.current = request;
  const currentReceipt = sameRequest(receipt, request);
  const runtimeError = currentReceipt ? receipt?.error ?? null : null;
  const pending = authoring.hydrated && h.status === "ready" && Boolean(source || Object.keys(pose.bones).length)
    && (!currentReceipt || receipt?.status === "pending");
  const pendingEcho = useRef<PendingPoseEcho | null>(null);
  const echoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pending = pendingEcho.current;
    if (!pending || !sameRequest(pending.request, requestRef.current)) return;
    if (!matchesEcho(hostRef.current, pending)) return;
    if (echoTimeout.current) clearTimeout(echoTimeout.current);
    echoTimeout.current = null;
    pendingEcho.current = null;
    setReceipt({ ...pending.request, status: "ready", error: null });
    setRuntimeSyncPending("pose", false);
  }, [authoring.authority, poseKey, retry, h.vrm, h.customBones, h.customYOffset, h.poseTranslations, h.bodyRotation, setRuntimeSyncPending]);

  useEffect(() => {
    if (!authoring.hydrated || h.status !== "ready") return;
    const activeRequest = requestRef.current;
    const targetPose = poseRef.current;
    const current = hostRef.current;
    const runtime = readCharacterPoseRuntimeSource(current.vrm);
    const fail = (message: string | null) => setReceipt({ ...activeRequest, status: "error", error: message });
    if (!runtime) {
      if (Object.keys(targetPose.bones).length === 0) setReceipt({ ...activeRequest, status: "ready", error: null });
      else fail(inspectCharacterPoseRuntime(null).reason);
      return;
    }
    const surface = readStudioVrmPoserShaperSurface(current);
    if (!surface.setCustomBones || !surface.setCustomYOffset || !surface.setPoseTranslations || !surface.setBodyRotation) {
      fail("이 캐릭터 화면에는 포즈 저장·복원 연결이 없습니다."); return;
    }
    try {
      const resolvedPose = resolveCharacterPoseRuntimeV3(runtime, targetPose);
      const rotation = new Euler().setFromQuaternion(new Quaternion(...resolvedPose.root.rotation), "YXZ");
      if (Math.abs(rotation.x) > 1e-5 || Math.abs(rotation.z) > 1e-5) throw new Error("이 화면은 캐릭터 전체의 Y축 회전만 지원합니다. 기울어진 루트 회전은 복원할 수 없습니다.");
      // 같은 문서의 preview/cancel/undo는 동일한 시각 상태를 다시 적용한다.
      const eulerBones = characterPoseEulerBones(resolvedPose);
      // recipe가 소유하는 손가락은 보존하되, 이전 V3 몸통 관절 override는 남기지 않는다.
      const preserved = Object.fromEntries(Object.entries(current.customBones ?? {}).filter(([name]) => !isCharacterPoseBodyBone(name)));
      const bones = { ...preserved, ...Object.fromEntries(Object.entries(eulerBones).map(([name, value]) => [name, { rotation: value }])) };
      const translations = normalizeStudioVrmPoseTranslations(current.poseTranslations) ?? EMPTY_STUDIO_VRM_POSE_TRANSLATIONS;
      const nextTranslations = { ...translations, root: [resolvedPose.root.position[0], 0, resolvedPose.root.position[2]] };
      const base: unknown = runtime.scene.userData[STUDIO_VRM_BASE_ROTATION_Y_KEY];
      const bodyRotation = rotation.y - (typeof base === "number" && Number.isFinite(base) ? base : 0);
      setRuntimeSyncPending("pose", true);
      setReceipt({ ...activeRequest, status: "pending", error: null });
      applyCharacterPoseRuntimeV3(runtime, resolvedPose);
      pendingEcho.current = { request: activeRequest, bones: eulerBones, yOffset: resolvedPose.root.position[1], root: nextTranslations.root, bodyRotation };
      if (echoTimeout.current) clearTimeout(echoTimeout.current);
      echoTimeout.current = setTimeout(() => {
        if (!sameRequest(pendingEcho.current?.request ?? null, activeRequest) || !sameRequest(activeRequest, requestRef.current)) return;
        pendingEcho.current = null;
        echoTimeout.current = null;
        setRuntimeSyncPending("pose", false);
        fail("포즈 변경을 화면 상태에서 확인하지 못했습니다. 포즈 연결을 다시 시도해 주세요.");
      }, 5000);
      surface.setCustomBones(bones);
      surface.setCustomYOffset(resolvedPose.root.position[1]);
      surface.setPoseTranslations(nextTranslations);
      surface.setBodyRotation(bodyRotation);
    } catch (error) {
      setRuntimeSyncPending("pose", false);
      pendingEcho.current = null;
      if (echoTimeout.current) clearTimeout(echoTimeout.current);
      echoTimeout.current = null;
      fail(error instanceof Error ? error.message : "저장된 포즈를 모델에 반영하지 못했습니다.");
    }
    return () => {
      setReceipt((latest) => sameRequest(latest, activeRequest) ? null : latest);
      if (!sameRequest(pendingEcho.current?.request ?? null, activeRequest)) return;
      if (echoTimeout.current) clearTimeout(echoTimeout.current);
      echoTimeout.current = null;
      pendingEcho.current = null;
      setRuntimeSyncPending("pose", false);
    };
  }, [authoring.authority, authoring.hydrated, setRuntimeSyncPending, h.status, h.vrm, poseKey, retry]);

  const preview = useCallback((target?: { readonly bone: CharacterPoseEffectorBone; readonly offset: CharacterVector3 }): boolean => {
    const current = hostRef.current;
    const runtime = readCharacterPoseRuntimeSource(current.vrm);
    const surface = readStudioVrmPoserShaperSurface(current);
    if (!runtime || !inspectCharacterPoseRuntime(runtime).supported || !authoring.hydrated || selectedRegions.length === 0
      || current.status !== "ready" || runtimeError || pending || !surface.setCustomBones || !surface.setCustomYOffset || !surface.setPoseTranslations || !surface.setBodyRotation) {
      setMessage("지원하는 캐릭터와 수정할 부위를 선택한 뒤 다시 시도해 주세요."); return false;
    }
    const snapshot = authoring.authority.getSnapshot();
    if (snapshot.previewDocument) { setMessage("현재 미리보기를 적용하거나 취소한 뒤 다음 포즈를 편집해 주세요."); return false; }
    try {
      const id = ++sequence.current;
      const captured = captureCharacterPoseRuntimeV3({ source: runtime, poseId: `pose-v3:${id}`, generationId: id });
      const effectors = target ? (() => {
        const end = runtime.humanoid.getNormalizedBoneNode(target.bone);
        if (!end) throw new Error("선택한 손·발 관절이 현재 모델에 없습니다.");
        const point = end.getWorldPosition(new Vector3()).add(new Vector3(...target.offset));
        return [{ id: `manual:${target.bone}`, bone: target.bone, target: [point.x, point.y, point.z] as const, pinned: true, weight: 1 }];
      })() : [];
      const solved = solveCharacterPoseRuntimeV3({ source: runtime,
        pose: { ...captured, contacts: snapshot.document.pose.contacts, fixedControllers: snapshot.document.pose.fixedControllers, effectors },
        selectedRegions, preserveFootPlant,
      });
      const receipt = authoring.beginPreview({ commandId: `pose-v3:${id}`, label: target ? "선택한 손·발 위치 수정" : "선택 부위 자연스러운 포즈 보정", source: "user",
        expectedDocumentId: snapshot.document.documentId, expectedRevision: snapshot.document.revision,
        operations: [{ kind: "set-pose", pose: solved.pose }],
      });
      if (receipt.status === "invalid" || receipt.status === "stale") throw new Error(receipt.reason ?? "포즈 미리보기를 시작하지 못했습니다.");
      setMessage(solved.warnings.length ? solved.warnings.join(" ") : "선택 부위의 관절과 접점을 실제 뼈대에 미리 적용했습니다.");
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "포즈 계산에 실패했습니다. 다시 시도해 주세요."); return false; }
  }, [authoring, selectedRegions, preserveFootPlant, runtimeError, pending]);

  return {
    supported: capability.supported, effectors: capability.effectors, reason: capability.reason,
    pending,
    ready: authoring.hydrated && h.status === "ready" && capability.supported && currentReceipt && receipt?.status === "ready",
    previewing, blockedByPreview: Boolean(authoring.snapshot.previewDocument), preserveFootPlant, setPreserveFootPlant,
    message, runtimeError, retryRuntime: () => setRetry((value) => value + 1),
    previewStabilization: () => preview(),
    previewTarget: (bone: CharacterPoseEffectorBone, offset: CharacterVector3) => preview({ bone, offset }),
    apply: () => {
      if (!authoring.authority.getSnapshot().previewCommandId?.startsWith("pose-v3:")) {
        setMessage("적용할 포즈 미리보기가 없습니다. 먼저 포즈를 미리보기 해 주세요."); return;
      }
      if (runtimeError || pending) { setMessage("화면에 포즈 반영이 확인된 뒤 적용해 주세요. 오류가 있으면 연결을 다시 시도해 주세요."); return; }
      const result = authoring.commitPreview();
      if (!result) setMessage("적용할 포즈 미리보기가 없습니다.");
      else if (result.status === "invalid" || result.status === "stale") setMessage(result.reason);
      else setMessage("포즈 편집을 적용했습니다. 실행 취소로 이전 포즈를 복원할 수 있습니다.");
    },
    cancel: () => {
      if (!authoring.authority.getSnapshot().previewCommandId?.startsWith("pose-v3:")) { setMessage("취소할 포즈 미리보기가 없습니다."); return; }
      if (authoring.cancelPreview()) setMessage("미리보기를 취소하고 이전 포즈를 복원했습니다.");
    },
    undo: authoring.undo, canUndo: authoring.snapshot.canUndo,
  };
}

export type CharacterPoseRuntime = ReturnType<typeof useCharacterPoseRuntime>;
