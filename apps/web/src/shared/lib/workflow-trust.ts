import { defineBilingualText } from "./i18n-bilingual-copy";

/** @deprecated Display copy now follows the global i18n locale. Kept for caller compatibility. */
export type WorkflowTrustLocale = string;

export type WorkflowTrustState =
  | "resume-ready"
  | "device-saved"
  | "syncing"
  | "synced"
  | "offline-pending"
  | "retry-needed"
  | "conflict"
  | "review-submitted"
  | "approved"
  | "published";

export type WorkflowTrustTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface WorkflowTrustPresentation {
  /** Global i18n key. */
  readonly label: string;
  /** Global i18n key. */
  readonly description: string;
  readonly tone: WorkflowTrustTone;
  readonly live: "polite" | "assertive";
}

function copy(id: string, ko: string, en: string): string {
  return defineBilingualText("workflowTrust", id, ko, en);
}

const PRESENTATIONS: Readonly<Record<WorkflowTrustState, WorkflowTrustPresentation>> = {
  "resume-ready": {
    label: copy("resumeReady.label", "최근 위치 기억됨", "Recent location remembered"),
    description: copy("resumeReady.description", "이 기기에서 마지막으로 열었던 작업 위치로 다시 이동할 수 있습니다.", "Return to the last workspace opened on this device."),
    tone: "neutral",
    live: "polite",
  },
  "device-saved": {
    label: copy("deviceSaved.label", "이 기기에 저장됨", "Saved on this device"),
    description: copy("deviceSaved.description", "현재 변경 내용이 이 기기의 복구 저장소에 반영되었습니다.", "The current changes are available to the device recovery store."),
    tone: "neutral",
    live: "polite",
  },
  syncing: {
    label: copy("syncing.label", "클라우드에 저장 중…", "Saving to cloud…"),
    description: copy("syncing.description", "이 기기의 변경 내용을 클라우드에 반영하고 있습니다.", "Uploading changes from this device to the cloud."),
    tone: "accent",
    live: "polite",
  },
  synced: {
    label: copy("synced.label", "클라우드와 동기화됨", "Synced with cloud"),
    description: copy("synced.description", "현재 변경 내용이 이 기기와 클라우드에 모두 반영되었습니다.", "The current changes are available on this device and in the cloud."),
    tone: "success",
    live: "polite",
  },
  "offline-pending": {
    label: copy("offlinePending.label", "오프라인 변경 있음", "Offline changes pending"),
    description: copy("offlinePending.description", "연결이 복구되면 지원되는 변경 내용을 다시 동기화합니다. 화면의 저장 상태를 확인하세요.", "Supported changes can sync after reconnection. Check the workspace save status."),
    tone: "warning",
    live: "polite",
  },
  "retry-needed": {
    label: copy("retryNeeded.label", "클라우드 저장 재시도 필요", "Cloud save needs retry"),
    description: copy("retryNeeded.description", "이 기기의 변경 내용은 유지하고 있습니다. 연결을 확인한 뒤 다시 시도하세요.", "Changes on this device are retained. Check the connection and retry."),
    tone: "danger",
    live: "assertive",
  },
  conflict: {
    label: copy("conflict.label", "겹친 변경 확인 필요", "Overlapping changes need review"),
    description: copy("conflict.description", "내 변경과 팀 변경이 같은 대상에 적용되어 선택이 필요합니다.", "Your changes and a teammate's changes affect the same target."),
    tone: "warning",
    live: "assertive",
  },
  "review-submitted": {
    label: copy("reviewSubmitted.label", "검수본으로 제출됨", "Submitted for review"),
    description: copy("reviewSubmitted.description", "검토 위치가 움직이지 않도록 현재 버전이 검수본으로 고정되었습니다.", "This version is fixed so review locations do not move."),
    tone: "accent",
    live: "polite",
  },
  approved: {
    label: copy("approved.label", "승인본으로 고정됨", "Approved version locked"),
    description: copy("approved.description", "이 버전이 공식 출력과 게시의 기준입니다.", "This version is the official source for output and publishing."),
    tone: "success",
    live: "polite",
  },
  published: {
    label: copy("published.label", "게시본 생성 완료", "Release created"),
    description: copy("published.description", "승인본에서 대상 플랫폼용 게시본이 생성되었습니다.", "A platform release was created from the approved version."),
    tone: "success",
    live: "polite",
  },
};

export function resolveWorkflowTrustPresentation(
  state: WorkflowTrustState,
): WorkflowTrustPresentation {
  return PRESENTATIONS[state];
}
