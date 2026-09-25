/**
 * Editor-side glue for rejected-stroke recovery, kept out of StudioCuttoonEditorHost so the host
 * ratchet keeps shrinking. The host only calls `salvageRejectedStroke` at its three cancellation
 * sites and passes `queueDeferredStrokeCommit`; everything else (restorer registration, fresh-id
 * restore through the ordinary deferred commit, user-facing copy) lives here and is unit-testable
 * without the 30k-line component.
 */

import { useLayoutEffect, useRef } from "react";

import { uid } from "./studio-id";
import {
  recordStudioRejectedStroke,
  checkpointStudioPendingStroke,
  releaseStudioPendingStrokeCheckpoint,
  activateStudioRejectedStrokeRecovery,
  hydrateStudioRejectedStrokeRecords,
  setStudioRejectedStrokeStorageError,
  setStudioRejectedStrokeRestorer,
  type StudioRejectedStrokeRecord,
  type StudioRejectedStrokeRestorer,
  type StudioRejectedStrokeSalvagePlan,
} from "./studio-rejected-stroke-recovery";
import {
  acquireStudioRejectedStrokeRecoveryRepository,
  studioRejectedStrokeRecoveryScopeKey,
} from "./live/studio-rejected-stroke-recovery-persistence";

import type { DrawEl } from "./studio-element-model";
import type {
  StudioRejectedStrokeRecoveryRepository,
  StudioRejectedStrokeRecoveryScope,
} from "./live/studio-rejected-stroke-recovery-persistence";

export const STUDIO_GPU_LIVE_INK_PROVIDER_LABEL = "WebGPU 라이브 잉크";

/** Banner copy for a provider rejection; tells the user whether the finished mark survived. */
export function studioRejectedLiveSurfaceMessage(
  providerLabel: string,
  detail: string,
  salvaged: boolean,
): string {
  return salvaged
    ? `${providerLabel} 엔진을 더 이상 사용할 수 없어 현재 획의 미리보기를 중단했습니다. `
      + `완성된 획은 상태 레일의 '획 복구'로 되살릴 수 있습니다. ${detail}`
    : `${providerLabel} 엔진을 더 이상 사용할 수 없어 현재 획을 취소했습니다. ${detail}`;
}

/**
 * The explicit restore. The rejected id was tombstoned in the CRDT draft and its GPU receipt
 * bookkeeping was cleared, so the geometry re-enters under a fresh id through the ordinary deferred
 * commit (Konva document layer). The record holds a frozen snapshot; clone before the document takes
 * ownership. Pages must match — a record from another page is refused and kept.
 */
export function restoreStudioRejectedStrokeIntoDocument(
  record: StudioRejectedStrokeRecord,
  activePageId: string,
  queueDeferredStrokeCommit: (finished: DrawEl) => boolean,
  nextId: () => string = uid,
  context?: Readonly<{
    scopeKey: string;
    hasRestoredStroke?: (pageId: string, strokeId: string) => boolean;
  }>,
): ReturnType<StudioRejectedStrokeRestorer> {
  if (record.scopeKey !== context?.scopeKey) {
    return { status: "refused", recordId: record.id, reason: "다른 프로젝트에서 그린 획입니다. 원래 문서에서 복구하세요." };
  }
  if (record.pageId !== activePageId) {
    return {
      status: "refused",
      recordId: record.id,
      reason: "다른 페이지에서 그린 획입니다. 그 페이지로 이동한 뒤 복구하세요.",
    };
  }
  const restoredId = record.restoredStrokeId ?? nextId();
  if (context?.hasRestoredStroke?.(record.pageId, restoredId)
    || (record.admissionCheckpoint && context?.hasRestoredStroke?.(record.pageId, record.id))) {
    return { status: "restored", recordId: record.id, restoredStrokeId: restoredId };
  }
  const restored: DrawEl = { ...structuredClone(record.stroke), id: restoredId };
  if (!queueDeferredStrokeCommit(restored)) {
    return {
      status: "refused",
      recordId: record.id,
      reason: "이전 페이지의 획이 아직 저장 대기 중입니다. 동기화가 끝난 뒤 다시 복구하세요.",
    };
  }
  return { status: "restored", recordId: record.id, restoredStrokeId: restored.id };
}

export type StudioSalvageRejectedStroke = (
  stroke: DrawEl | null | undefined,
  providerLabel: string,
  reason: string,
  pageId?: string,
  sourceGeneration?: number,
) => StudioRejectedStrokeSalvagePlan;

export interface StudioRejectedStrokeRecoveryHostInput {
  readonly activePageId: string;
  readonly queueDeferredStrokeCommit: (finished: DrawEl) => boolean;
  readonly recoveryScope?: StudioRejectedStrokeRecoveryScope;
  readonly getDocumentGeneration?: () => number;
  readonly hasRestoredStroke?: (pageId: string, strokeId: string) => boolean;
  readonly acquireRepository?: (scope: StudioRejectedStrokeRecoveryScope) => Promise<StudioRejectedStrokeRecoveryRepository>;
}

/**
 * Registers this editor instance as the restorer for the lifetime of the mount and returns the
 * salvage entry point the cancellation sites call. Inputs are read through a ref inside callbacks
 * only, so the latest page and commit queue are used without re-registering on every render.
 */
export function useStudioRejectedStrokeRecoveryHost(
  input: StudioRejectedStrokeRecoveryHostInput,
): {
  readonly salvageRejectedStroke: StudioSalvageRejectedStroke;
  readonly checkpointPendingStroke: (stroke: DrawEl, pageId: string, sourceGeneration: number) => void;
  readonly releasePendingStrokeCheckpoint: (strokeId: string, accepted: boolean) => void;
} {
  const latest = useRef(input);
  const scopeKey = input.recoveryScope ? studioRejectedStrokeRecoveryScopeKey(input.recoveryScope) : undefined;
  useLayoutEffect(() => {
    latest.current = input;
  });
  useLayoutEffect(() => {
    const scope = latest.current.recoveryScope;
    if (!scope || !scopeKey) return;
    let current = true;
    const acquire = latest.current.acquireRepository ?? acquireStudioRejectedStrokeRecoveryRepository;
    let repository: Promise<StudioRejectedStrokeRecoveryRepository> | null = null;
    const getRepository = () => {
      repository ??= acquire(scope).catch((cause: unknown) => {
        repository = null;
        throw cause;
      });
      return repository;
    };
    const deactivate = activateStudioRejectedStrokeRecovery(scopeKey, {
      load: async () => (await getRepository()).load(scopeKey),
      save: async (record) => (await getRepository()).save(record),
      delete: async (record) => (await getRepository()).delete(record),
      confirmRestored: async (record) => (await getRepository()).confirmRestored(record),
    });
    void getRepository().then((store) => store.load(scopeKey)).then((records) => {
      // 프로젝트 변경 또는 StrictMode 재마운트 뒤 도착한 이전 세대의 읽기를 적용하지 않는다.
      if (current) hydrateStudioRejectedStrokeRecords(scopeKey, records);
    }).catch(() => {
      if (current) setStudioRejectedStrokeStorageError(scopeKey, "이 문서의 획 복구 원본을 읽지 못했습니다. 저장소가 준비된 뒤 문서를 다시 열어 주세요.");
    });
    return () => {
      current = false;
      deactivate();
    };
  }, [scopeKey]);
  useLayoutEffect(() => {
    const unregister = setStudioRejectedStrokeRestorer((record) =>
      restoreStudioRejectedStrokeIntoDocument(
        record,
        latest.current.activePageId,
        latest.current.queueDeferredStrokeCommit,
        uid,
        latest.current.recoveryScope ? {
          scopeKey: studioRejectedStrokeRecoveryScopeKey(latest.current.recoveryScope),
          hasRestoredStroke: latest.current.hasRestoredStroke,
        } : undefined,
      ));
    return () => {
      unregister();
    };
  }, []);
  return {
    checkpointPendingStroke: (stroke, pageId, sourceGeneration) => checkpointStudioPendingStroke({
      stroke, pageId, sourceGeneration, scopeKey, restoredStrokeId: uid(),
      provider: "선택한 렌더러 입력 준비", reason: "준비 중 보관한 원본 입력입니다.",
    }),
    releasePendingStrokeCheckpoint: (strokeId, accepted) => releaseStudioPendingStrokeCheckpoint(scopeKey, strokeId, accepted),
    salvageRejectedStroke: (stroke, providerLabel, reason, pageId, sourceGeneration) =>
      recordStudioRejectedStroke({
        stroke,
        pageId: pageId ?? input.activePageId,
        provider: providerLabel,
        reason,
        ...(scopeKey === undefined ? {} : {
          scopeKey,
          sourceGeneration: sourceGeneration ?? latest.current.getDocumentGeneration?.() ?? 0,
          restoredStrokeId: uid(),
        }),
      }),
  };
}
