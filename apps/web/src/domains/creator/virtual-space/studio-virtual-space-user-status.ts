/**
 * O-4. 상태 가시성 (User Status)
 *
 * oVice식 아바타 상태 표시의 toonstudio 적용:
 * - 아바타 옆 상태 표시: 회의 중 / 자리 비움 / 휴식 중 / 작업 중
 * - 원클릭 상태 변경. 팀원 찾기 용이.
 * - 회의실/프라이빗 스페이스 진입 시 "회의 중" 자동 설정 (연동 훅용)
 *
 * studio-virtual-space-presence.ts(네트워크 하트비트)와 구분되는
 * 사용자 상태(user status) 도메인. 순수 로직 모듈.
 */

/** 참가자 상태. */
export type StudioUserStatus =
  | "available"  // 작업 중 (기본)
  | "in-meeting" // 회의 중
  | "away"       // 자리 비움
  | "break";     // 휴식 중

export interface StudioUserStatusEntry {
  readonly sessionId: string;
  readonly status: StudioUserStatus;
  /** 상태 변경 시각 (ms epoch). */
  readonly updatedAt: number;
  /** away/break 시 자동 복귀 예정 시각 (없으면 null). */
  readonly returnAt: number | null;
}

const STATUS_LABEL_KO: Record<StudioUserStatus, string> = {
  available: "작업 중",
  "in-meeting": "회의 중",
  away: "자리 비움",
  break: "휴식 중",
};

const STATUS_LABEL_EN: Record<StudioUserStatus, string> = {
  available: "Working",
  "in-meeting": "In a meeting",
  away: "Away",
  break: "On a break",
};

const STATUS_EMOJI: Record<StudioUserStatus, string> = {
  available: "🟢",
  "in-meeting": "🔴",
  away: "🟡",
  break: "☕",
};

/** 상태 표시용 뱃지 정보. */
export function userStatusBadge(
  status: StudioUserStatus,
): { readonly emoji: string; readonly ko: string; readonly en: string } {
  return {
    emoji: STATUS_EMOJI[status],
    ko: STATUS_LABEL_KO[status],
    en: STATUS_LABEL_EN[status],
  };
}

/**
 * 상태 맵에 항목을 설정한다. 불변 업데이트.
 */
export function setUserStatus(
  statuses: ReadonlyMap<string, StudioUserStatusEntry>,
  sessionId: string,
  status: StudioUserStatus,
  at: number,
  returnAt: number | null = null,
): ReadonlyMap<string, StudioUserStatusEntry> {
  const next = new Map(statuses);
  next.set(sessionId, Object.freeze({ sessionId, status, updatedAt: at, returnAt }));
  return next;
}

export function removeUserStatus(
  statuses: ReadonlyMap<string, StudioUserStatusEntry>,
  sessionId: string,
): ReadonlyMap<string, StudioUserStatusEntry> {
  if (!statuses.has(sessionId)) return statuses;
  const next = new Map(statuses);
  next.delete(sessionId);
  return next;
}

/**
 * 회의실/프라이빗 스페이스 진입 시 자동으로 "회의 중"으로 전환.
 * 이미 회의 중이면 그대로 둔다.
 */
export function autoSetInMeeting(
  statuses: ReadonlyMap<string, StudioUserStatusEntry>,
  sessionId: string,
  at: number,
): ReadonlyMap<string, StudioUserStatusEntry> {
  const current = statuses.get(sessionId);
  if (current?.status === "in-meeting") return statuses;
  return setUserStatus(statuses, sessionId, "in-meeting", at);
}

/**
 * 회의 종료(방 이탈) 시 "작업 중"으로 복귀.
 * 단, 사용자가 수동으로 away/break를 설정한 경우 덮어쓰지 않는다.
 */
export function autoClearInMeeting(
  statuses: ReadonlyMap<string, StudioUserStatusEntry>,
  sessionId: string,
  at: number,
): ReadonlyMap<string, StudioUserStatusEntry> {
  const current = statuses.get(sessionId);
  if (current?.status !== "in-meeting") return statuses;
  return setUserStatus(statuses, sessionId, "available", at);
}

/**
 * 상태별 참가자 목록. UI "팀원 찾기" 패널용.
 * 회의 중 → 휴식 중 → 자리 비움 → 작업 중 순으로 정렬.
 */
const STATUS_ORDER: Record<StudioUserStatus, number> = {
  "in-meeting": 0,
  break: 1,
  away: 2,
  available: 3,
};

export function sortUserStatuses(
  statuses: ReadonlyMap<string, StudioUserStatusEntry>,
): readonly StudioUserStatusEntry[] {
  return Object.freeze(
    [...statuses.values()].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
        || a.updatedAt - b.updatedAt,
    ),
  );
}
