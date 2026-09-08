/**
 * Draft-save status projection for the Studio chrome.
 *
 * The editor has two different safety authorities: a device-local durable recovery writer and a
 * server revision. This module never collapses those into one ambiguous "saved" boolean. It is a
 * pure projection so browser events, React state and persistence I/O stay at the product boundary.
 */

export type StudioDraftSaveTone =
  | "success"
  | "progress"
  | "warning"
  | "danger"
  | "neutral";

export type StudioDraftSavePhase =
  | "load-risk"
  | "loading"
  | "blocked"
  | "metadata-required"
  | "saving"
  | "local-risk"
  | "server-risk"
  | "queued"
  | "offline"
  | "syncing"
  | "saved"
  | "local-only"
  | "preparing";

export type StudioDraftSavePrimaryAction = "save" | "versions" | "metadata";
export type StudioDraftSaveLocalRole = "leader" | "follower" | null;
export type StudioDraftSaveReliabilityLevel = "ok" | "degraded" | "failed";

export interface StudioDraftSaveReliabilitySignal {
  readonly level: StudioDraftSaveReliabilityLevel;
  readonly title: string;
  readonly detail?: string;
  readonly at: number;
}

export interface StudioDraftSaveStatusSection {
  readonly tone: StudioDraftSaveTone;
  readonly title: string;
  readonly detail: string;
}

export interface StudioDraftSaveCenterInput {
  readonly isOnline: boolean;
  readonly hydrated: boolean;
  readonly hydrationFailed: boolean;
  readonly metadataRequired: boolean;
  readonly saving: boolean;
  readonly deferredSave: boolean;
  readonly collaborationLocked: boolean;
  readonly collaborationSyncPending: boolean;
  readonly localRole: StudioDraftSaveLocalRole;
  readonly localBasis: string | null;
  readonly localSaveSignal: StudioDraftSaveReliabilitySignal | null;
  readonly storageSignal: StudioDraftSaveReliabilitySignal | null;
  readonly hasServerDocument: boolean;
  readonly serverRevision: number | null;
  readonly checkpointCount: number;
  readonly versionCount: number;
  readonly lastServerSaveAt: number | null;
  readonly serverSaveError: string | null;
  readonly serverRevisionLoading: boolean;
  readonly serverRevisionError: string | null;
}

export interface StudioDraftSaveCenterViewModel {
  readonly phase: StudioDraftSavePhase;
  readonly tone: StudioDraftSaveTone;
  readonly compactLabel: string;
  readonly headline: string;
  readonly detail: string;
  readonly device: StudioDraftSaveStatusSection;
  readonly server: StudioDraftSaveStatusSection;
  readonly primaryAction: StudioDraftSavePrimaryAction;
  readonly saveActionLabel: string;
  readonly saveActionDisabled: boolean;
  readonly canOpenVersions: boolean;
  readonly shouldPromoteBackup: boolean;
  readonly ariaLiveMessage: string;
}

const MAX_SAFE_REVISION = 2_147_483_647;
const SAVE_ERROR_PATTERN =
  /(?:초안\s*저장|서버.{0,12}저장|저장하지\s*못|저장에\s*실패|먼저\s*저장|revision|동기화\s*확인\s*후)/iu;
const CONFLICT_PATTERN = /(?:먼저\s*저장|revision|최신.{0,12}(?:불러|문서)|동기화\s*확인\s*후)/iu;

function normalizedRevision(value: unknown): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= MAX_SAFE_REVISION
    ? value
    : null;
}

function normalizedCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_SAFE_REVISION)
    : 0;
}

function failed(signal: StudioDraftSaveReliabilitySignal | null): boolean {
  return signal?.level === "failed";
}

function degraded(signal: StudioDraftSaveReliabilitySignal | null): boolean {
  return signal?.level === "degraded";
}

function hasLocalDurabilityRisk(input: StudioDraftSaveCenterInput): boolean {
  return failed(input.storageSignal)
    || failed(input.localSaveSignal)
    || degraded(input.storageSignal)
    || degraded(input.localSaveSignal);
}

function signalDetail(signal: StudioDraftSaveReliabilitySignal): string {
  return signal.detail?.trim() || signal.title.trim() || "저장 상태를 확인해 주세요.";
}

function deviceSection(input: StudioDraftSaveCenterInput): StudioDraftSaveStatusSection {
  const failingSignal = failed(input.storageSignal)
    ? input.storageSignal
    : failed(input.localSaveSignal)
      ? input.localSaveSignal
      : null;
  if (failingSignal) {
    return {
      tone: "danger",
      title: "이 기기 복구 저장 확인 필요",
      detail: `${signalDetail(failingSignal)} 탭을 닫기 전에 프로젝트 백업을 내려받아 주세요.`,
    };
  }

  const degradedSignal = degraded(input.storageSignal)
    ? input.storageSignal
    : degraded(input.localSaveSignal)
      ? input.localSaveSignal
      : null;
  if (degradedSignal) {
    return {
      tone: "warning",
      title: "이 기기 복구 저장이 제한됨",
      detail: signalDetail(degradedSignal),
    };
  }

  if (input.hydrationFailed) {
    return {
      tone: "warning",
      title: "기존 복구 지점을 확인할 수 있음",
      detail: "원고를 불러오지 못했으므로 새 체크포인트를 만들기 전에 버전·체크포인트에서 정상 상태를 복원해 주세요.",
    };
  }

  if (!input.hydrated) {
    return {
      tone: "progress",
      title: "복구 저장 시작 대기 중",
      detail: "기존 원고를 모두 불러온 뒤 이 기기의 내구 저장 권위를 활성화합니다.",
    };
  }

  if (input.localRole === "leader") {
    return {
      tone: "success",
      title: "이 탭이 복구 저장 담당",
      detail: "변경 내용을 브라우저의 내구 저장소에 체크포인트로 남기도록 이 탭이 조정합니다.",
    };
  }

  if (input.localRole === "follower") {
    return {
      tone: "warning",
      title: "다른 탭이 복구 저장 담당",
      detail: "같은 문서를 먼저 연 탭이 로컬 체크포인트를 맡고 있습니다. 그 탭을 닫으면 이 탭이 이어받습니다.",
    };
  }

  return {
    tone: "neutral",
    title: "복구 저장 준비 중",
    detail: "문서별 저장 담당 탭과 내구 저장소를 확인하고 있습니다.",
  };
}

function serverSection(input: StudioDraftSaveCenterInput): StudioDraftSaveStatusSection {
  if (input.hydrationFailed) {
    return {
      tone: "danger",
      title: "원고를 불러오지 못함",
      detail: "빈 상태를 새 revision으로 저장하지 않습니다. 기존 버전 또는 체크포인트를 먼저 확인해 주세요.",
    };
  }

  if (!input.hydrated) {
    return {
      tone: "progress",
      title: "원고 불러오는 중",
      detail: "서버·기기 원고의 호환성과 revision 좌표를 확인한 뒤 저장을 활성화합니다.",
    };
  }

  if (input.collaborationLocked) {
    return {
      tone: "warning",
      title: "서버 저장 권한 확인 필요",
      detail: "현재 문서가 잠겨 있어 새 서버 revision을 만들 수 없습니다.",
    };
  }

  if (input.metadataRequired) {
    return {
      tone: "warning",
      title: "저장 전 작품 정보 필요",
      detail: "제목 등 필수 작품 정보를 입력하면 중단된 초안 저장을 같은 의도로 이어갑니다.",
    };
  }

  if (input.saving) {
    return {
      tone: "progress",
      title: "서버 초안 저장 중",
      detail: "페이지 캡처, 공동편집 동기화 확인, revision 커밋을 순서대로 처리하고 있습니다.",
    };
  }

  if (input.serverSaveError) {
    return {
      tone: "danger",
      title: isStudioDraftSaveConflictMessage(input.serverSaveError)
        ? "저장 충돌을 검토해 주세요"
        : "서버 초안 저장 실패",
      detail: input.serverSaveError,
    };
  }

  if (input.deferredSave) {
    return {
      tone: "warning",
      title: "연결 후 서버 저장 예약됨",
      detail: "네트워크가 돌아오면 한 번만 자동으로 초안 저장을 다시 시도합니다.",
    };
  }

  if (!input.isOnline) {
    return {
      tone: "warning",
      title: "서버는 오프라인",
      detail: "이 기기의 복구 저장은 계속되지만 새 서버 revision은 연결 후 만들 수 있습니다.",
    };
  }

  if (input.collaborationSyncPending) {
    return {
      tone: "progress",
      title: "공동 변경 동기화 중",
      detail: "팀 변경이 서버 순서에 반영된 뒤 같은 revision 좌표로 안전하게 저장합니다.",
    };
  }

  const revision = normalizedRevision(input.serverRevision);
  if (input.hasServerDocument && revision !== null) {
    return {
      tone: "success",
      title: `서버 초안 revision #${revision}`,
      detail: input.lastServerSaveAt === null
        ? "서버에 복원 가능한 revision이 있습니다."
        : `마지막으로 확인한 서버 저장: ${formatStudioDraftSaveTime(input.lastServerSaveAt)}`,
    };
  }

  if (input.hasServerDocument) {
    return {
      tone: "neutral",
      title: "서버 초안 연결됨",
      detail: "revision 번호를 확인하는 중입니다.",
    };
  }

  return {
    tone: "neutral",
    title: "아직 서버 초안 없음",
    detail: "지금 저장하면 계정에 첫 revision을 만들고 이후 버전 기록의 기준점이 됩니다.",
  };
}

export function resolveStudioDraftSaveCenter(
  input: StudioDraftSaveCenterInput,
): StudioDraftSaveCenterViewModel {
  const device = deviceSection(input);
  const server = serverSection(input);
  const localRisk = hasLocalDurabilityRisk(input);
  const hasServerRisk = server.tone === "danger";
  const serverRevision = normalizedRevision(input.serverRevision);
  const checkpointCount = normalizedCount(input.checkpointCount);
  const versionCount = normalizedCount(input.versionCount);
  const canOpenVersions = true;
  const serverConflict = Boolean(
    input.serverSaveError && isStudioDraftSaveConflictMessage(input.serverSaveError),
  );

  let phase: StudioDraftSavePhase;
  let tone: StudioDraftSaveTone;
  let compactLabel: string;
  let headline: string;
  let detail: string;

  if (input.hydrationFailed) {
    phase = "load-risk";
    tone = "danger";
    compactLabel = "원고 복구 확인";
    headline = "원고를 불러오지 못해 저장을 막았어요";
    detail = "빈 문서로 덮어쓰지 않고 기존 서버 revision과 이 기기 체크포인트를 보존했습니다.";
  } else if (localRisk) {
    phase = "local-risk";
    tone = "danger";
    compactLabel = "복구 저장 확인";
    headline = "이 기기 복구 경로를 확인해 주세요";
    detail = device.detail;
  } else if (!input.hydrated) {
    phase = "loading";
    tone = "progress";
    compactLabel = "원고 불러오는 중";
    headline = "기존 원고와 저장 좌표를 확인하고 있어요";
    detail = "하이드레이션이 끝나기 전에는 빈 상태를 저장하지 않습니다.";
  } else if (input.collaborationLocked) {
    phase = "blocked";
    tone = "warning";
    compactLabel = "저장 권한 확인";
    headline = "문서 잠금으로 서버 저장이 멈췄어요";
    detail = "이 기기 복구 상태를 확인하고, 편집 권한 또는 문서 잠금을 해제한 뒤 다시 저장하세요.";
  } else if (input.metadataRequired) {
    phase = "metadata-required";
    tone = "warning";
    compactLabel = "저장 정보 입력 필요";
    headline = "작품 정보를 입력하면 초안 저장을 이어가요";
    detail = server.detail;
  } else if (hasServerRisk) {
    phase = "server-risk";
    tone = "danger";
    compactLabel = serverConflict ? "저장 충돌 확인" : "서버 저장 실패";
    headline = server.title;
    detail = server.detail;
  } else if (input.saving) {
    phase = "saving";
    tone = "progress";
    compactLabel = "초안 저장 중";
    headline = "서버에 새 revision을 만드는 중이에요";
    detail = server.detail;
  } else if (input.deferredSave) {
    phase = "queued";
    tone = "warning";
    compactLabel = "연결 후 저장 예약";
    headline = "온라인이 되면 초안을 저장할게요";
    detail = server.detail;
  } else if (!input.isOnline) {
    phase = "offline";
    tone = "warning";
    compactLabel = input.localRole === "leader" ? "오프라인 · 기기 저장" : "오프라인";
    headline = "서버 연결 없이 작업 중이에요";
    detail = `${device.title}. ${server.detail}`;
  } else if (input.collaborationSyncPending) {
    phase = "syncing";
    tone = "progress";
    compactLabel = "공동 변경 동기화 중";
    headline = "팀 변경을 저장 좌표에 맞추고 있어요";
    detail = server.detail;
  } else if (input.hasServerDocument && serverRevision !== null) {
    phase = "saved";
    tone = "success";
    compactLabel = `서버 r${serverRevision} 확인`;
    headline = "이 기기 복구와 서버 revision을 각각 확인할 수 있어요";
    detail = input.lastServerSaveAt === null
      ? `서버 revision #${serverRevision}이 확인됐습니다.`
      : `서버 revision #${serverRevision} · ${formatStudioDraftSaveTime(input.lastServerSaveAt)}`;
  } else if (input.localRole !== null) {
    phase = "local-only";
    tone = "neutral";
    compactLabel = "기기에 자동 보호 중";
    headline = "현재 작업은 이 기기 복구 경로가 먼저 보호해요";
    detail = "첫 서버 저장을 만들면 revision 기록과 다른 기기 복원이 시작됩니다.";
  } else {
    phase = "preparing";
    tone = "neutral";
    compactLabel = "저장 준비 중";
    headline = "저장 권위를 확인하고 있어요";
    detail = "문서별 로컬 저장 담당과 서버 revision을 확인하는 동안 작업을 계속할 수 있습니다.";
  }

  const primaryAction: StudioDraftSavePrimaryAction = phase === "load-risk" || serverConflict
    ? "versions"
    : phase === "metadata-required"
      ? "metadata"
      : "save";
  const saveActionLabel = phase === "load-risk"
    ? "버전·복구 열기"
    : phase === "loading"
      ? "원고 불러오는 중"
      : phase === "metadata-required"
        ? "초안 저장 계속"
        : serverConflict
          ? "버전 비교·복원"
          : input.saving
            ? "저장 중"
            : input.collaborationLocked
              ? "저장 권한 확인"
              : !input.isOnline
                ? input.deferredSave
                  ? "연결 후 저장 예약됨"
                  : "연결 후 저장 예약"
                : input.serverSaveError
                  ? "서버 저장 다시 시도"
                  : "지금 서버에 저장";

  return {
    phase,
    tone,
    compactLabel,
    headline,
    detail,
    device,
    server,
    primaryAction,
    saveActionLabel,
    saveActionDisabled: phase === "saving" || phase === "loading" || phase === "blocked",
    canOpenVersions,
    shouldPromoteBackup: localRisk
      || phase === "load-risk"
      || !input.isOnline
      || !input.hasServerDocument,
    ariaLiveMessage: `${compactLabel}. ${headline}`,
  };
}

export function resolveStudioDraftServerRevision(values: readonly unknown[]): number | null {
  let highest: number | null = null;
  for (const value of values) {
    const revision = normalizedRevision(value);
    if (revision !== null && (highest === null || revision > highest)) highest = revision;
  }
  return highest;
}

export function resolveStudioDraftServerSavedAt(input: {
  readonly sharedUpdatedAt?: unknown;
  readonly revisions?: readonly { readonly createdAt?: unknown }[] | null;
  readonly observedAt?: unknown;
}): number | null {
  const candidates: number[] = [];
  const append = (value: unknown): void => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      candidates.push(value);
      return;
    }
    if (typeof value !== "string" || value.trim() === "") return;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) candidates.push(parsed);
  };
  append(input.sharedUpdatedAt);
  append(input.observedAt);
  for (const revision of input.revisions ?? []) append(revision.createdAt);
  return candidates.length === 0 ? null : Math.max(...candidates);
}

export function extractStudioDraftSaveError(value: unknown): string | null {
  const message = typeof value === "string"
    ? value.trim()
    : value instanceof Error
      ? value.message.trim()
      : "";
  if (!message || !SAVE_ERROR_PATTERN.test(message)) return null;
  return message.slice(0, 500);
}

export function isStudioDraftSaveConflictMessage(message: string): boolean {
  return CONFLICT_PATTERN.test(message);
}

export function formatStudioDraftSaveTime(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "시각 미확인";
  const diff = Math.max(0, now - timestamp);
  if (diff < 45_000) return "방금";
  if (diff < 60 * 60_000) return `${Math.max(1, Math.floor(diff / 60_000))}분 전`;
  if (diff < 24 * 60 * 60_000) return `${Math.max(1, Math.floor(diff / (60 * 60_000)))}시간 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatStudioDraftSaveInterval(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "자동";
  if (milliseconds < 60_000) return `${Math.max(1, Math.round(milliseconds / 1_000))}초`;
  return `${Math.max(1, Math.round(milliseconds / 60_000))}분`;
}

export function buildStudioDraftSaveDiagnostics(
  input: StudioDraftSaveCenterInput,
  model: StudioDraftSaveCenterViewModel,
  generatedAt = Date.now(),
): string {
  const value = (entry: unknown): string => entry === null || entry === undefined ? "none" : String(entry);
  return [
    "ToonStudio draft save diagnostics",
    `generatedAt=${new Date(generatedAt).toISOString()}`,
    `phase=${model.phase}`,
    `online=${input.isOnline}`,
    `hydrated=${input.hydrated}`,
    `hydrationFailed=${input.hydrationFailed}`,
    `metadataRequired=${input.metadataRequired}`,
    `saving=${input.saving}`,
    `deferredSave=${input.deferredSave}`,
    `collaborationLocked=${input.collaborationLocked}`,
    `collaborationSyncPending=${input.collaborationSyncPending}`,
    `localRole=${value(input.localRole)}`,
    `localBasis=${value(input.localBasis)}`,
    `localSaveSignal=${value(input.localSaveSignal?.level)}`,
    `storageSignal=${value(input.storageSignal?.level)}`,
    `hasServerDocument=${input.hasServerDocument}`,
    `serverRevision=${value(normalizedRevision(input.serverRevision))}`,
    `checkpointCount=${normalizedCount(input.checkpointCount)}`,
    `versionCount=${versionCount}`,
    `lastServerSaveAt=${input.lastServerSaveAt === null ? "none" : new Date(input.lastServerSaveAt).toISOString()}`,
    `serverRevisionLoading=${input.serverRevisionLoading}`,
    `serverRevisionError=${input.serverRevisionError ? "present" : "none"}`,
    `serverSaveError=${input.serverSaveError ? "present" : "none"}`,
  ].join("\n");
}
