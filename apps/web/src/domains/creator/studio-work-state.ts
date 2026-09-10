export const STUDIO_USER_WORK_STATES = [
  "saved",
  "processing",
  "offline-safe",
  "attention",
] as const;

export type StudioUserWorkStateId = (typeof STUDIO_USER_WORK_STATES)[number];
export type StudioWorkAttentionReason =
  | "conflict"
  | "storage-pressure"
  | "save-failed"
  | "missing-local-copy"
  | "blocking-issue";

export interface StudioInternalWorkSignals {
  readonly localSnapshotSafe: boolean;
  readonly cloudSynced: boolean;
  readonly online: boolean;
  readonly pendingLocalChanges: number;
  readonly activeJobs: number;
  readonly queuedJobs: number;
  readonly retrying: boolean;
  readonly blockingIssues: number;
  readonly recoverableConflict: boolean;
  readonly storagePressure: boolean;
  readonly saveFailed: boolean;
  readonly lastSavedAt?: string;
  readonly nextRetryAt?: string;
}

export interface StudioUserWorkState {
  readonly id: StudioUserWorkStateId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly politeAnnouncementKo: string;
  readonly politeAnnouncementEn: string;
  readonly requiresAttention: boolean;
  readonly blocksClose: boolean;
  readonly attentionReasons: readonly StudioWorkAttentionReason[];
  readonly showSpinner: boolean;
  readonly showSuccessToast: false;
  readonly lastSavedAt?: string;
  readonly nextRetryAt?: string;
}

function finiteCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function validOptionalDate(value: string | undefined): boolean {
  return value === undefined || Number.isFinite(Date.parse(value));
}

export function validateStudioInternalWorkSignals(
  signals: StudioInternalWorkSignals,
): readonly string[] {
  const errors: string[] = [];
  if (!finiteCount(signals.pendingLocalChanges)) errors.push("pending-local-changes");
  if (!finiteCount(signals.activeJobs)) errors.push("active-jobs");
  if (!finiteCount(signals.queuedJobs)) errors.push("queued-jobs");
  if (!finiteCount(signals.blockingIssues)) errors.push("blocking-issues");
  if (!validOptionalDate(signals.lastSavedAt)) errors.push("last-saved-at");
  if (!validOptionalDate(signals.nextRetryAt)) errors.push("next-retry-at");
  if (signals.cloudSynced && signals.pendingLocalChanges > 0) errors.push("cloud-sync-contradiction");
  if (signals.cloudSynced && !signals.localSnapshotSafe) errors.push("cloud-without-local-snapshot");
  if (!signals.online && signals.retrying) errors.push("offline-retrying");
  return Object.freeze(errors);
}

function resolveAttentionReasons(
  signals: StudioInternalWorkSignals,
): readonly StudioWorkAttentionReason[] {
  const reasons: StudioWorkAttentionReason[] = [];
  if (signals.recoverableConflict) reasons.push("conflict");
  if (signals.storagePressure) reasons.push("storage-pressure");
  if (signals.saveFailed) reasons.push("save-failed");
  if (!signals.localSnapshotSafe) reasons.push("missing-local-copy");
  if (signals.blockingIssues > 0) reasons.push("blocking-issue");
  return Object.freeze(reasons);
}

function withDates(
  signals: StudioInternalWorkSignals,
): Pick<StudioUserWorkState, "lastSavedAt" | "nextRetryAt"> {
  return {
    ...(signals.lastSavedAt ? { lastSavedAt: signals.lastSavedAt } : {}),
    ...(signals.nextRetryAt ? { nextRetryAt: signals.nextRetryAt } : {}),
  };
}

export function resolveStudioUserWorkState(
  signals: StudioInternalWorkSignals,
): StudioUserWorkState {
  const validationErrors = validateStudioInternalWorkSignals(signals);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid Studio work signals: ${validationErrors.join(", ")}`);
  }

  const attentionReasons = resolveAttentionReasons(signals);
  if (attentionReasons.length > 0) {
    const conflict = attentionReasons.includes("conflict");
    const storage = attentionReasons.includes("storage-pressure");
    const localMissing = attentionReasons.includes("missing-local-copy");
    const detailKo = conflict
      ? "같은 부분을 다르게 수정한 결과를 모두 보관했습니다. 추천 결과를 확인하세요."
      : storage
        ? "작업은 보관되어 있지만 저장 공간을 정리하면 더 안전하게 계속할 수 있습니다."
        : localMissing
          ? "현재 변경 내용을 이 기기에 안전하게 보관하지 못했습니다."
          : "안전하게 계속하려면 확인해야 할 내용이 있습니다.";
    const detailEn = conflict
      ? "Both versions of a conflicting edit were kept. Review the recommended result."
      : storage
        ? "Your work is retained, but freeing storage will make continued editing safer."
        : localMissing
          ? "The current changes could not be secured on this device."
          : "Something needs your attention before work can continue safely.";
    return Object.freeze({
      id: "attention",
      labelKo: "확인할 내용이 있어요",
      labelEn: "Needs attention",
      detailKo,
      detailEn,
      politeAnnouncementKo: "작업 안전을 위해 확인할 내용이 있습니다.",
      politeAnnouncementEn: "Something needs attention to keep your work safe.",
      requiresAttention: true,
      blocksClose: !signals.localSnapshotSafe || signals.saveFailed,
      attentionReasons,
      showSpinner: false,
      showSuccessToast: false,
      ...withDates(signals),
    });
  }

  const isProcessing =
    signals.activeJobs > 0
    || signals.queuedJobs > 0
    || signals.pendingLocalChanges > 0
    || signals.retrying
    || (signals.online && !signals.cloudSynced);
  if (isProcessing) {
    const detailKo = signals.activeJobs > 0
      ? `작업 ${signals.activeJobs}건을 처리하고 있습니다. 원고 편집은 계속할 수 있습니다.`
      : signals.queuedJobs > 0
        ? `작업 ${signals.queuedJobs}건이 순서대로 처리될 예정입니다.`
        : signals.retrying
          ? "연결이 회복되어 안전하게 다시 저장하고 있습니다."
          : "변경 내용을 안전하게 저장하고 있습니다.";
    const detailEn = signals.activeJobs > 0
      ? `${signals.activeJobs} job(s) are processing. You can keep editing.`
      : signals.queuedJobs > 0
        ? `${signals.queuedJobs} job(s) are queued for processing.`
        : signals.retrying
          ? "The connection recovered and saving is retrying safely."
          : "Saving your changes safely.";
    return Object.freeze({
      id: "processing",
      labelKo: "처리 중",
      labelEn: "Processing",
      detailKo,
      detailEn,
      politeAnnouncementKo: "변경 내용을 처리하고 있습니다.",
      politeAnnouncementEn: "Processing your changes.",
      requiresAttention: false,
      blocksClose: !signals.localSnapshotSafe,
      attentionReasons: Object.freeze([]),
      showSpinner: true,
      showSuccessToast: false,
      ...withDates(signals),
    });
  }

  if (!signals.online && signals.localSnapshotSafe) {
    return Object.freeze({
      id: "offline-safe",
      labelKo: "오프라인에서도 안전",
      labelEn: "Safe offline",
      detailKo: "이 기기에 안전하게 저장했습니다. 연결되면 자동으로 이어서 저장합니다.",
      detailEn: "Saved safely on this device. Cloud saving will resume automatically when connected.",
      politeAnnouncementKo: "오프라인 상태지만 작업은 안전합니다.",
      politeAnnouncementEn: "You are offline, but your work is safe.",
      requiresAttention: false,
      blocksClose: false,
      attentionReasons: Object.freeze([]),
      showSpinner: false,
      showSuccessToast: false,
      ...withDates(signals),
    });
  }

  return Object.freeze({
    id: "saved",
    labelKo: "저장됨",
    labelEn: "Saved",
    detailKo: "이 기기와 클라우드에 안전하게 저장했습니다.",
    detailEn: "Saved safely on this device and in the cloud.",
    politeAnnouncementKo: "저장되었습니다.",
    politeAnnouncementEn: "Saved.",
    requiresAttention: false,
    blocksClose: false,
    attentionReasons: Object.freeze([]),
    showSpinner: false,
    showSuccessToast: false,
    ...withDates(signals),
  });
}

export function shouldAnnounceStudioWorkStateChange(
  previous: StudioUserWorkState | null,
  next: StudioUserWorkState,
): boolean {
  if (previous === null) return next.id === "attention";
  if (previous.id === next.id) {
    return next.id === "attention"
      && previous.attentionReasons.join("|") !== next.attentionReasons.join("|");
  }
  return next.id === "attention"
    || next.id === "offline-safe"
    || (previous.id === "attention" && next.id === "saved");
}
