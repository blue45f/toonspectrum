/**
 * Attention-only projection for local recovery, CRDT operation delivery and server-draft handoff.
 *
 * These are three independent protection stages. The model never collapses them into a single
 * optimistic "saved" state and never invents another network or persistence authority.
 */

import type {
  StudioLivePersistenceDurability,
  StudioLiveSyncPhase,
} from "./live/studio-live-sync-safety";
import type { StudioLiveTransportMode } from "./live/studio-live-collaboration-transport";

export type StudioDraftOperationSyncTone =
  | "success"
  | "progress"
  | "warning"
  | "danger"
  | "neutral";

export type StudioDraftOperationSyncAction =
  | "retry"
  | "export-recovery"
  | "versions"
  | null;

export interface StudioDraftOperationSyncAssistantInput {
  readonly liveContextAvailable: boolean;
  readonly syncPhase: StudioLiveSyncPhase;
  readonly pendingCount: number;
  readonly persistenceDurability: StudioLivePersistenceDurability;
  readonly editsDurablyProtected: boolean;
  readonly mode: StudioLiveTransportMode | null;
  readonly collaborationSyncPending: boolean;
  readonly recoveryUpdateCount: number;
  readonly recoveryExportAvailable: boolean;
  readonly recoveryExported: boolean;
  readonly localCheckpointCount: number;
  readonly localRole: "leader" | "follower" | null;
  readonly serverRevision: number | null;
  readonly hasServerDocument: boolean;
  readonly hydrated: boolean;
  readonly hydrationFailed: boolean;
  readonly saving: boolean;
}

export interface StudioDraftOperationSyncAssistantModel {
  readonly visible: boolean;
  readonly tone: StudioDraftOperationSyncTone;
  readonly compactLabel: string;
  readonly headline: string;
  readonly detail: string;
  readonly primaryAction: StudioDraftOperationSyncAction;
  readonly primaryActionLabel: string | null;
  readonly canExportBackup: boolean;
  readonly deviceSummary: string;
  readonly operationSummary: string;
  readonly serverSummary: string;
  readonly ariaLiveMessage: string;
}

const MAX_SAFE_COUNT = 2_147_483_647;

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, MAX_SAFE_COUNT)
    : 0;
}

function validRevision(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? Math.min(value, MAX_SAFE_COUNT)
    : null;
}

function deviceSummary(input: StudioDraftOperationSyncAssistantInput): string {
  if (input.hydrationFailed) return "원고를 열지 못해 기존 복구 기록을 유지하고 있습니다.";
  if (!input.hydrated) return "원고를 모두 불러온 뒤 기기 복구 저장을 시작합니다.";
  if (input.localRole === "leader") {
    const count = safeCount(input.localCheckpointCount);
    return count > 0
      ? `이 탭이 복구 저장을 담당하며 기기 복구 지점 ${count.toLocaleString("ko-KR")}개가 있습니다.`
      : "이 탭이 새 변경을 이 기기에 자동으로 보호합니다.";
  }
  if (input.localRole === "follower") {
    return "먼저 연 다른 탭이 이 기기의 복구 저장을 담당합니다.";
  }
  return "이 기기의 복구 저장 담당을 확인하고 있습니다.";
}

function operationSummary(input: StudioDraftOperationSyncAssistantInput): string {
  const pending = safeCount(input.pendingCount);
  const recoveryCount = Math.max(pending, safeCount(input.recoveryUpdateCount));
  switch (input.syncPhase) {
    case "recovery-required":
      return recoveryCount > 0
        ? `서버 원고와 분리된 로컬 변경 ${recoveryCount.toLocaleString("ko-KR")}개를 덮어쓰지 않고 보관했습니다.`
        : "서버 원고와 분리된 로컬 변경을 덮어쓰지 않고 보관했습니다.";
    case "revoked":
      return "작품 편집 권한이 회수되어 새 변경 전송을 중단했습니다.";
    case "admission-denied":
      return "현재 계정은 이 작업실의 변경을 서버에 보낼 권한이 없습니다.";
    case "durability-risk":
      return input.editsDurablyProtected
        ? "변경 보호 상태를 다시 확인하고 있습니다."
        : "서버와 기기 복구 저장소가 모두 준비되지 않아 새 변경 보호를 확인해야 합니다.";
    case "read-only-follower":
      return "먼저 연 다른 탭이 변경 전송을 담당하며, 이 탭은 안전하게 이어받기를 기다립니다.";
    case "unsupported-jam":
      return "이 브라우저에서는 저장 전 실시간 공동 작업을 사용할 수 없습니다.";
    case "offline-queued":
      return pending > 0
        ? `변경 ${pending.toLocaleString("ko-KR")}개를 서버가 다시 연결될 때까지 이 기기에 보관합니다.`
        : "서버가 다시 연결될 때까지 변경을 이 기기에 보관합니다.";
    case "retrying":
      return pending > 0
        ? `변경 ${pending.toLocaleString("ko-KR")}개를 보관한 채 팀 서버 재연결을 시도합니다.`
        : "팀 서버 재연결을 시도하고 있습니다.";
    case "repairing":
      return "서버 상태와 이 기기의 변경 기록을 비교해 안전한 상태로 복구하고 있습니다.";
    case "syncing":
      return pending > 0
        ? `변경 ${pending.toLocaleString("ko-KR")}개를 순서대로 서버에 반영하고 있습니다.`
        : "새 변경을 서버에 반영하고 있습니다.";
    case "synced":
      return input.mode === "local"
        ? "이 기기 안의 열린 탭끼리 변경을 맞췄습니다. 다른 기기에서 이어가려면 서버 원고 저장도 완료해 주세요."
        : "새 변경이 팀 서버에 모두 반영되었습니다.";
    default:
      return input.collaborationSyncPending
        ? "공동 작업 변경을 안전하게 정리하고 있습니다."
        : "변경 보호와 서버 연결을 준비하고 있습니다.";
  }
}

function serverSummary(input: StudioDraftOperationSyncAssistantInput): string {
  const revision = validRevision(input.serverRevision);
  if (input.hydrationFailed) return "현재 화면으로 서버 원고를 덮어쓰지 않습니다.";
  if (input.saving) return "현재 원고를 서버 초안으로 저장하고 있습니다.";
  if (!input.hasServerDocument) return "아직 서버 원고가 없습니다. 첫 초안 저장 후 다른 기기에서 이어갈 수 있습니다.";
  if (revision === null) return "서버 원고 연결은 확인됐으며 버전 정보를 불러오고 있습니다.";
  if (
    input.mode === "server"
    && input.syncPhase === "synced"
    && safeCount(input.pendingCount) === 0
    && !input.collaborationSyncPending
  ) {
    return `서버 원고 r${revision}까지 확인되어 다른 기기에서 이어서 작업할 수 있습니다.`;
  }
  if (input.mode === "local" && input.syncPhase === "synced") {
    return `같은 기기 탭끼리의 변경만 맞췄습니다. 다른 기기에서 이어가려면 서버 원고 저장도 완료해야 합니다. 현재 서버 원고는 r${revision}입니다.`;
  }
  return `서버 원고 r${revision}은 유지되며, 대기 변경이 끝난 뒤 최신 초안으로 갱신할 수 있습니다.`;
}

function actionLabel(action: StudioDraftOperationSyncAction): string | null {
  if (action === "retry") return "서버 연결 다시 확인";
  if (action === "export-recovery") return "로컬 변경 복구 파일";
  if (action === "versions") return "버전·복구 확인";
  return null;
}

export function resolveStudioDraftOperationSyncAssistant(
  input: StudioDraftOperationSyncAssistantInput,
): StudioDraftOperationSyncAssistantModel {
  const pending = safeCount(input.pendingCount);
  const recoveryCount = safeCount(input.recoveryUpdateCount);
  const visible = input.collaborationSyncPending
    || pending > 0
    || recoveryCount > 0
    || (
      input.liveContextAvailable
      && input.syncPhase !== "synced"
      && input.syncPhase !== "initializing"
    );

  let tone: StudioDraftOperationSyncTone = "neutral";
  let compactLabel = "변경 동기화 확인";
  let headline = "기기와 서버의 변경 상태를 확인하고 있어요";
  const detail = operationSummary(input);
  let primaryAction: StudioDraftOperationSyncAction = null;

  if (input.syncPhase === "recovery-required" || recoveryCount > 0) {
    tone = "danger";
    compactLabel = "로컬 변경 복구 필요";
    headline = "서버 원고와 분리된 변경을 먼저 보존해 주세요";
    primaryAction = input.recoveryExportAvailable && !input.recoveryExported
      ? "export-recovery"
      : "versions";
  } else if (input.syncPhase === "revoked" || input.syncPhase === "admission-denied") {
    tone = "danger";
    compactLabel = input.syncPhase === "revoked" ? "편집 권한 회수됨" : "작업실 권한 없음";
    headline = "서버 원고를 바꾸지 않고 권한과 복구 기록을 유지합니다";
    primaryAction = "versions";
  } else if (input.syncPhase === "durability-risk") {
    tone = "danger";
    compactLabel = "변경 보호 확인 필요";
    headline = "새 변경을 안전하게 보호할 경로를 다시 확인해 주세요";
    primaryAction = "retry";
  } else if (input.syncPhase === "read-only-follower") {
    tone = "warning";
    compactLabel = "다른 탭이 동기화 담당";
    headline = "먼저 연 탭이 저장과 서버 반영을 담당하고 있어요";
  } else if (input.syncPhase === "unsupported-jam") {
    tone = "warning";
    compactLabel = "공동 작업 제한됨";
    headline = "현재 브라우저에서는 저장 전 공동 작업이 제한돼요";
  } else if (input.syncPhase === "offline-queued") {
    tone = "warning";
    compactLabel = pending > 0
      ? `오프라인 · ${pending.toLocaleString("ko-KR")}개 기기 보관`
      : "오프라인 · 기기 보관";
    headline = "서버 연결 없이도 변경을 이 기기에 보관하고 있어요";
    primaryAction = "retry";
  } else if (input.syncPhase === "retrying") {
    tone = "warning";
    compactLabel = pending > 0
      ? `재연결 중 · ${pending.toLocaleString("ko-KR")}개 대기`
      : "서버 재연결 중";
    headline = "보관한 변경을 유지한 채 서버를 다시 연결하고 있어요";
    primaryAction = "retry";
  } else if (input.syncPhase === "repairing") {
    tone = "progress";
    compactLabel = "원고 동기화 복구 중";
    headline = "기기와 서버의 변경 기록을 안전하게 맞추고 있어요";
  } else if (input.syncPhase === "syncing" || pending > 0 || input.collaborationSyncPending) {
    tone = "progress";
    compactLabel = pending > 0
      ? `${pending.toLocaleString("ko-KR")}개 변경 동기화 중`
      : "변경 동기화 중";
    headline = "기기에 보호한 변경을 서버에 순서대로 반영하고 있어요";
  } else if (input.syncPhase === "synced") {
    tone = "success";
    compactLabel = "변경 동기화 완료";
    headline = "기기와 서버의 변경 흐름이 최신 상태예요";
  }

  const model = {
    visible,
    tone,
    compactLabel,
    headline,
    detail,
    primaryAction,
    primaryActionLabel: actionLabel(primaryAction),
    canExportBackup: input.hydrated && !input.hydrationFailed,
    deviceSummary: deviceSummary(input),
    operationSummary: detail,
    serverSummary: serverSummary(input),
    ariaLiveMessage: `${compactLabel}. ${headline}`,
  } satisfies StudioDraftOperationSyncAssistantModel;

  return model;
}
