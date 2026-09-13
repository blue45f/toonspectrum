import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  StudioDraftSaveCenter as StudioDraftSaveCenterImpl,
  type StudioDraftSaveCenterProps,
} from "./StudioDraftSaveCenterImpl";
import {
  clearStudioDraftSaveOutbox,
  consumeRecentlyClearedStudioDraftSaveOutbox,
  readStudioDraftSaveOutbox,
  subscribeStudioDraftSaveOutbox,
  writeStudioDraftSaveOutbox,
  type StudioDraftSaveOutboxStorage,
} from "./studio-draft-save-outbox";

import { studioSaveAcknowledgementVersion, studioSaveIntentScopeKey } from "./studio-durable-save-intent";

export type { StudioDraftSaveCenterProps } from "./StudioDraftSaveCenterImpl";

function outboxStorage(): StudioDraftSaveOutboxStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function resolveOutboxWorkId(props: StudioDraftSaveCenterProps): string | null {
  if (props.saveIntentScope) return studioSaveIntentScopeKey(props.saveIntentScope);
  for (const value of [props.workId, props.loadedWork?.id, props.sharedDocument?.workId]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Reliability adapter around the existing save-center UI.
 *
 * The implementation remains the sole UX/state machine. This adapter only:
 * - keeps a just-cleared offline receipt until the real save Promise succeeds,
 * - coalesces repeated save requests while one is in flight, and
 * - holds automatic replay behind the existing sync barrier while a queued receipt
 *   is waiting for the current server revision query to finish.
 */
export function StudioDraftSaveCenter(props: StudioDraftSaveCenterProps) {
  const { onSaveDraft: saveDraft } = props;
  const workId = resolveOutboxWorkId(props);
  const [hasQueuedReceipt, setHasQueuedReceipt] = useState(() => workId !== null
    && readStudioDraftSaveOutbox({ storage: outboxStorage(), workId }) !== null);
  const saveInFlightRef = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    if (workId === null) {
      setHasQueuedReceipt(false);
      return;
    }
    setHasQueuedReceipt(readStudioDraftSaveOutbox({
      storage: outboxStorage(),
      workId,
    }) !== null);
    return subscribeStudioDraftSaveOutbox(({ workId: changedWorkId, entry }) => {
      if (changedWorkId === workId) setHasQueuedReceipt(entry !== null);
    });
  }, [workId]);

  const onSaveDraft = useCallback((): Promise<unknown> => {
    if (saveInFlightRef.current !== null) return saveInFlightRef.current;

    const retainedReceipt = workId === null
      ? null
      : consumeRecentlyClearedStudioDraftSaveOutbox(workId);
    if (retainedReceipt !== null) {
      writeStudioDraftSaveOutbox({
        storage: outboxStorage(),
        entry: retainedReceipt,
      });
    }

    const acknowledgementBefore = props.saveIntentScope ? studioSaveAcknowledgementVersion(props.saveIntentScope) : null;
    const save = Promise.resolve()
      .then(() => saveDraft())
      .then((result) => {
        if (props.saveIntentScope && studioSaveAcknowledgementVersion(props.saveIntentScope) === acknowledgementBefore) {
          throw new Error("서버 저장 완료를 확인하지 못해 대기 기록을 유지합니다. 작품 정보·연결·권한을 확인해 주세요.");
        }
        if (retainedReceipt !== null && workId !== null) {
          clearStudioDraftSaveOutbox({ storage: outboxStorage(), workId });
        }
        return result;
      })
      .catch((cause: unknown) => {
        if (retainedReceipt !== null) {
          writeStudioDraftSaveOutbox({
            storage: outboxStorage(),
            entry: retainedReceipt,
          });
        }
        throw cause;
      })
      .finally(() => {
        if (saveInFlightRef.current === save) saveInFlightRef.current = null;
      });
    saveInFlightRef.current = save;
    return save;
  }, [props.saveIntentScope, saveDraft, workId]);

  const effectiveCollaborationSyncPending = useMemo(() => (
    props.collaborationOperationSyncPending === true
    || (
      hasQueuedReceipt
      && (props.serverRevisionLoading === true || Boolean(props.serverRevisionError))
    )
  ), [
    hasQueuedReceipt,
    props.collaborationOperationSyncPending,
    props.serverRevisionError,
    props.serverRevisionLoading,
  ]);

  return (
    <StudioDraftSaveCenterImpl
      {...props}
      collaborationOperationSyncPending={effectiveCollaborationSyncPending}
      onSaveDraft={onSaveDraft}
    />
  );
}
