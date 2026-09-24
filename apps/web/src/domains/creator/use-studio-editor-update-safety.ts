import { useEffect, useLayoutEffect, useRef } from "react";

import {
  refreshStudioUpdateSafety,
  registerStudioUpdateSafetySource,
  type StudioUpdateSafetySourceSnapshot,
} from "./studio-update-safety";

type StudioEditorUpdateSafetyState = Readonly<{
  saveInProgress: () => boolean;
  hasUnsavedWork: () => boolean;
  collaborationSyncPending: boolean;
  externalWorkspaceSyncPending: boolean;
}>;

function resolveStudioEditorUpdateSafety({
  saveInProgress,
  hasUnsavedWork,
  collaborationSyncPending,
  externalWorkspaceSyncPending,
}: StudioEditorUpdateSafetyState): StudioUpdateSafetySourceSnapshot {
  if (saveInProgress()) {
    return {
      safe: false,
      reason: "save-in-progress",
      message: "원고 저장 영수증을 기다리는 중입니다. 저장이 끝난 뒤 업데이트해 주세요.",
    };
  }
  if (hasUnsavedWork()) {
    return {
      safe: false,
      reason: "unsaved-work",
      message: "마지막 편집 또는 획이 아직 기기의 내구 저장소에 반영되지 않았습니다.",
    };
  }
  if (collaborationSyncPending || externalWorkspaceSyncPending) {
    return {
      safe: false,
      reason: "sync-pending",
      pendingCount: collaborationSyncPending ? 1 : 0,
      message: collaborationSyncPending
        ? "공동 편집 변경의 서버 승인 경계가 준비되지 않았습니다. 동기화가 끝난 뒤 업데이트해 주세요."
        : "다른 창의 작업공간 변경을 확인하는 중입니다. 반영 또는 유지 결정을 마친 뒤 업데이트해 주세요.",
    };
  }
  return { safe: true };
}

export function useStudioEditorUpdateSafety(
  sourceId: string,
  saveInProgress: () => boolean,
  hasUnsavedWork: () => boolean,
  collaborationSyncPending: boolean,
  externalWorkspaceSyncPending: boolean,
): void {
  const stateRef = useRef<StudioEditorUpdateSafetyState>({
    saveInProgress,
    hasUnsavedWork,
    collaborationSyncPending,
    externalWorkspaceSyncPending,
  });
  stateRef.current = {
    saveInProgress,
    hasUnsavedWork,
    collaborationSyncPending,
    externalWorkspaceSyncPending,
  };

  useLayoutEffect(
    () => registerStudioUpdateSafetySource(
      sourceId,
      () => resolveStudioEditorUpdateSafety(stateRef.current),
    ),
    [sourceId],
  );
  useEffect(() => {
    refreshStudioUpdateSafety();
  });
}
