import { useEffect, useRef, useState } from "react";

import type {
  StudioLiveSyncPhase,
  StudioLiveSyncSnapshot,
} from "./studio-live-sync-safety";

/** Coalesce count/message churn while keeping the underlying durability state untouched. */
export const STUDIO_LIVE_DISPLAY_SYNC_THROTTLE_MS = 250;

const STUDIO_LIVE_DISPLAY_SYNC_TRANSITION_DELAY_MS: Readonly<
  Record<StudioLiveSyncPhase, number>
> = {
  initializing: 200,
  synced: 650,
  syncing: 300,
  "offline-queued": 0,
  retrying: 450,
  repairing: 0,
  "durability-risk": 0,
  "read-only-follower": 0,
  "unsupported-jam": 0,
  "admission-denied": 0,
  revoked: 0,
  "recovery-required": 0,
};

export function studioLiveDisplaySyncTransitionDelayMs(
  phase: StudioLiveSyncPhase
): number {
  return STUDIO_LIVE_DISPLAY_SYNC_TRANSITION_DELAY_MS[phase];
}

export function studioLiveDisplaySyncSnapshotsEqual(
  left: StudioLiveSyncSnapshot | undefined,
  right: StudioLiveSyncSnapshot | undefined
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.phase === right.phase
    && left.pendingCount === right.pendingCount
    && left.persistenceDurability === right.persistenceDurability
    && left.transportReady === right.transportReady
    && left.operationSyncReady === right.operationSyncReady
    && left.lastAckAt === right.lastAckAt
    && left.lastAckServerSequence === right.lastAckServerSequence
    && left.editsDurablyProtected === right.editsDurablyProtected
    && left.message === right.message
    && left.mode === right.mode
  );
}

/**
 * Stabilizes presentation-only sync state.
 *
 * Critical phase transitions are immediate. Short-lived initializing/syncing/retrying/synced
 * transitions are debounced, and updates within one visible phase are trailing-throttled. The
 * caller must continue using the raw snapshot for edit safety, persistence, and recovery gates.
 */
export function useStudioLiveDisplaySync(
  snapshot: StudioLiveSyncSnapshot | undefined
): StudioLiveSyncSnapshot | undefined {
  const [displayed, setDisplayed] = useState(snapshot);
  const displayedRef = useRef(snapshot);
  const latestRef = useRef(snapshot);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const scheduledPhaseRef = useRef<StudioLiveSyncPhase | null>(null);
  const lastCommitAtRef = useRef<number | null>(null);

  useEffect(() => {
    latestRef.current = snapshot;

    const cancelScheduled = () => {
      if (timerRef.current !== null) {
        globalThis.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      scheduledPhaseRef.current = null;
    };
    const commit = (next: StudioLiveSyncSnapshot | undefined) => {
      cancelScheduled();
      const changed = !studioLiveDisplaySyncSnapshotsEqual(displayedRef.current, next);
      displayedRef.current = next;
      lastCommitAtRef.current = Date.now();
      if (changed) setDisplayed(next);
    };
    const scheduleLatest = (phase: StudioLiveSyncPhase, delayMs: number) => {
      scheduledPhaseRef.current = phase;
      timerRef.current = globalThis.setTimeout(() => {
        timerRef.current = null;
        const scheduledPhase = scheduledPhaseRef.current;
        scheduledPhaseRef.current = null;
        const latest = latestRef.current;
        if (!latest || latest.phase !== scheduledPhase) return;
        const changed = !studioLiveDisplaySyncSnapshotsEqual(displayedRef.current, latest);
        displayedRef.current = latest;
        lastCommitAtRef.current = Date.now();
        if (changed) setDisplayed(latest);
      }, delayMs);
    };

    const current = displayedRef.current;
    if (
      scheduledPhaseRef.current !== null
      && scheduledPhaseRef.current !== snapshot?.phase
    ) {
      cancelScheduled();
    }

    if (!snapshot || !current) {
      commit(snapshot);
      return;
    }
    if (studioLiveDisplaySyncSnapshotsEqual(current, snapshot)) {
      if (lastCommitAtRef.current === null) lastCommitAtRef.current = Date.now();
      return;
    }

    if (current.phase !== snapshot.phase) {
      const delayMs = studioLiveDisplaySyncTransitionDelayMs(snapshot.phase);
      if (delayMs <= 0) {
        commit(snapshot);
        return;
      }
      if (timerRef.current === null) scheduleLatest(snapshot.phase, delayMs);
      return;
    }

    const now = Date.now();
    const lastCommitAt = lastCommitAtRef.current ?? now;
    if (lastCommitAtRef.current === null) lastCommitAtRef.current = lastCommitAt;
    const remainingMs = Math.max(
      0,
      STUDIO_LIVE_DISPLAY_SYNC_THROTTLE_MS - (now - lastCommitAt)
    );
    if (remainingMs <= 0) {
      commit(snapshot);
      return;
    }
    if (timerRef.current === null) scheduleLatest(snapshot.phase, remainingMs);
  }, [snapshot]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current);
      timerRef.current = null;
      scheduledPhaseRef.current = null;
    },
    []
  );

  return displayed;
}
