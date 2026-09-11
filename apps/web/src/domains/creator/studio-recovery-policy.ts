import {
  resolveStudioUserWorkState,
  type StudioInternalWorkSignals,
  type StudioUserWorkState,
} from "./studio-work-state";

export type StudioJournalIntegrity = "healthy" | "repairable" | "corrupt";
export type StudioCloudSaveState = "synced" | "syncing" | "offline" | "conflict" | "error";
export type StudioRecoveryActionId =
  | "continue"
  | "retry-cloud-save"
  | "restore-latest-copy"
  | "compare-conflict"
  | "download-safety-copy"
  | "free-storage";

export interface StudioRecoverySnapshot {
  readonly documentId: string;
  readonly journalIntegrity: StudioJournalIntegrity;
  readonly localRevision: number;
  readonly cloudRevision: number | null;
  readonly pendingOperationCount: number;
  readonly activeJobCount: number;
  readonly queuedJobCount: number;
  readonly cloudState: StudioCloudSaveState;
  readonly online: boolean;
  readonly storageUsageRatio: number;
  readonly recoverableCopyIds: readonly string[];
  readonly lastLocalSaveAt: string | null;
  readonly lastCloudSaveAt: string | null;
  readonly nextRetryAt: string | null;
}

export interface StudioRecoveryAction {
  readonly id: StudioRecoveryActionId;
  readonly priority: "primary" | "secondary";
  readonly automatic: boolean;
  readonly destructive: false;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface StudioRecoveryPlan {
  readonly userState: StudioUserWorkState;
  readonly canCloseSafely: boolean;
  readonly autoRestoreCopyId: string | null;
  readonly preserveBothConflictVersions: boolean;
  readonly actions: readonly StudioRecoveryAction[];
}

function validDate(value: string | null): boolean {
  return value === null || Number.isFinite(Date.parse(value));
}

function action(
  id: StudioRecoveryActionId,
  priority: StudioRecoveryAction["priority"],
  automatic: boolean,
  labelKo: string,
  labelEn: string,
): StudioRecoveryAction {
  return Object.freeze({
    id,
    priority,
    automatic,
    destructive: false,
    labelKo,
    labelEn,
  });
}

export function validateStudioRecoverySnapshot(
  snapshot: StudioRecoverySnapshot,
): readonly string[] {
  const issues: string[] = [];
  if (!snapshot.documentId.trim()) issues.push("document-id");
  for (const [name, value] of [
    ["local-revision", snapshot.localRevision],
    ["pending-operation-count", snapshot.pendingOperationCount],
    ["active-job-count", snapshot.activeJobCount],
    ["queued-job-count", snapshot.queuedJobCount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) issues.push(name);
  }
  if (snapshot.cloudRevision !== null
    && (!Number.isSafeInteger(snapshot.cloudRevision) || snapshot.cloudRevision < 0)) {
    issues.push("cloud-revision");
  }
  if (!Number.isFinite(snapshot.storageUsageRatio)
    || snapshot.storageUsageRatio < 0
    || snapshot.storageUsageRatio > 1) {
    issues.push("storage-usage-ratio");
  }
  if (new Set(snapshot.recoverableCopyIds).size !== snapshot.recoverableCopyIds.length
    || snapshot.recoverableCopyIds.some((id) => !id.trim())) {
    issues.push("recoverable-copy-ids");
  }
  if (!validDate(snapshot.lastLocalSaveAt)) issues.push("last-local-save-at");
  if (!validDate(snapshot.lastCloudSaveAt)) issues.push("last-cloud-save-at");
  if (!validDate(snapshot.nextRetryAt)) issues.push("next-retry-at");
  if (!snapshot.online && snapshot.cloudState === "syncing") issues.push("offline-syncing");
  if (snapshot.cloudState === "synced" && snapshot.pendingOperationCount > 0) {
    issues.push("synced-with-pending-operations");
  }
  return Object.freeze(issues);
}

function toWorkSignals(snapshot: StudioRecoverySnapshot): StudioInternalWorkSignals {
  const localSnapshotSafe = snapshot.journalIntegrity === "healthy"
    || snapshot.recoverableCopyIds.length > 0;
  return {
    localSnapshotSafe,
    cloudSynced: snapshot.cloudState === "synced" && snapshot.pendingOperationCount === 0,
    online: snapshot.online,
    pendingLocalChanges: snapshot.pendingOperationCount,
    activeJobs: snapshot.activeJobCount,
    queuedJobs: snapshot.queuedJobCount,
    retrying: snapshot.online && snapshot.cloudState === "syncing",
    blockingIssues: snapshot.journalIntegrity === "corrupt" && !localSnapshotSafe ? 1 : 0,
    recoverableConflict: snapshot.cloudState === "conflict",
    storagePressure: snapshot.storageUsageRatio >= 0.9,
    saveFailed: snapshot.cloudState === "error" && !localSnapshotSafe,
    ...(snapshot.lastLocalSaveAt ? { lastSavedAt: snapshot.lastLocalSaveAt } : {}),
    ...(snapshot.nextRetryAt ? { nextRetryAt: snapshot.nextRetryAt } : {}),
  };
}

export function planStudioRecovery(
  snapshot: StudioRecoverySnapshot,
): StudioRecoveryPlan {
  const validation = validateStudioRecoverySnapshot(snapshot);
  if (validation.length > 0) {
    throw new Error(`Invalid Studio recovery snapshot: ${validation.join(", ")}`);
  }
  const userState = resolveStudioUserWorkState(toWorkSignals(snapshot));
  const actions: StudioRecoveryAction[] = [];
  const latestCopyId = snapshot.recoverableCopyIds.at(-1) ?? null;
  const autoRestoreCopyId = snapshot.journalIntegrity === "repairable"
    ? latestCopyId
    : null;

  if (snapshot.cloudState === "conflict") {
    actions.push(action(
      "compare-conflict",
      "primary",
      false,
      "두 결과 비교",
      "Compare both versions",
    ));
    actions.push(action(
      "download-safety-copy",
      "secondary",
      false,
      "안전한 사본 받기",
      "Download a safety copy",
    ));
  } else if (snapshot.journalIntegrity === "corrupt" && latestCopyId) {
    actions.push(action(
      "restore-latest-copy",
      "primary",
      false,
      "최근 안전한 작업 복원",
      "Restore the latest safe copy",
    ));
  } else if (snapshot.cloudState === "error" && snapshot.online) {
    actions.push(action(
      "retry-cloud-save",
      "primary",
      true,
      "다시 저장",
      "Retry saving",
    ));
  } else {
    actions.push(action("continue", "primary", true, "계속 작업", "Continue working"));
  }
  if (snapshot.storageUsageRatio >= 0.9) {
    actions.push(action(
      "free-storage",
      "secondary",
      false,
      "저장 공간 정리",
      "Free storage",
    ));
  }

  return Object.freeze({
    userState,
    canCloseSafely: !userState.blocksClose,
    autoRestoreCopyId,
    preserveBothConflictVersions: snapshot.cloudState === "conflict",
    actions: Object.freeze(actions),
  });
}
