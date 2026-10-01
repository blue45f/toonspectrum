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
  | "presenting" // 발표 중 (Track 6: 스테이지)
  | "focusing"   // 집중 중 (Track 6: 책상/좌석)
  | "away"       // 자리 비움
  | "break";     // 휴식 중

/**
 * 유효한 상태 값 집합 (정본).
 * presence 패킷의 userStatus allowlist(`parseStudioPresenceUserStatus`)와
 * 같은 값을 유지해야 한다 — 동기화 검증 테스트가 둘을 대조한다.
 */
export const STUDIO_USER_STATUSES: ReadonlySet<StudioUserStatus> = new Set([
  "available",
  "in-meeting",
  "presenting",
  "focusing",
  "away",
  "break",
]);

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
  presenting: "발표 중",
  focusing: "집중 중",
  away: "자리 비움",
  break: "휴식 중",
};

const STATUS_LABEL_EN: Record<StudioUserStatus, string> = {
  available: "Working",
  "in-meeting": "In a meeting",
  presenting: "Presenting",
  focusing: "Focusing",
  away: "Away",
  break: "On a break",
};

const STATUS_EMOJI: Record<StudioUserStatus, string> = {
  available: "🟢",
  "in-meeting": "🔴",
  presenting: "🎤",
  focusing: "🎯",
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
 * 회의 중 → 발표 중 → 집중 중 → 휴식 중 → 자리 비움 → 작업 중 순으로 정렬.
 */
const STATUS_ORDER: Record<StudioUserStatus, number> = {
  "in-meeting": 0,
  presenting: 1,
  focusing: 2,
  break: 3,
  away: 4,
  available: 5,
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

export interface StudioUserStatusChange {
  readonly sessionId: string;
  /** null이면 신규 참가자. */
  readonly previous: StudioUserStatus | null;
  readonly next: StudioUserStatus;
  readonly at: number;
}

/**
 * 이전/현재 상태 맵을 비교해 바뀐 항목만 뽑는다.
 * presence userStatus 필드 수신 측에서 "누가 상태를 바꿨다" 알림용.
 */
export function diffUserStatuses(
  previous: ReadonlyMap<string, StudioUserStatusEntry>,
  current: ReadonlyMap<string, StudioUserStatusEntry>,
): readonly StudioUserStatusChange[] {
  const changes: StudioUserStatusChange[] = [];
  for (const [sessionId, entry] of current) {
    const before = previous.get(sessionId)?.status ?? null;
    if (before !== entry.status) {
      changes.push({ sessionId, previous: before, next: entry.status, at: entry.updatedAt });
    }
  }
  return Object.freeze(changes);
}

/** 상태 변경 알림 문구. */
export function userStatusChangeCopy(
  bt: (ko: string, en: string) => string,
  change: StudioUserStatusChange,
  displayName: string,
): string {
  const nextKo = STATUS_LABEL_KO[change.next];
  const nextEn = STATUS_LABEL_EN[change.next];
  return change.previous === null
    ? bt(
      `${displayName}님이 입장했어요. (상태: ${nextKo})`,
      `${displayName} joined. (Status: ${nextEn})`,
    )
    : bt(
      `${displayName}님이 ${nextKo}(으)로 상태를 바꿨어요.`,
      `${displayName} changed status to ${nextEn}.`,
    );
}

/**
 * presence 스냅샷의 userStatus 필드를 상태 맵으로 동기화한다.
 * wire(커밋 1의 presence userStatus 필드) → 도메인 맵 브리지.
 */
export function userStatusesFromPresence(
  peers: readonly {
    readonly sessionId: string;
    readonly userStatus?: StudioUserStatus | null | undefined;
  }[],
  at: number,
): ReadonlyMap<string, StudioUserStatusEntry> {
  const next = new Map<string, StudioUserStatusEntry>();
  for (const peer of peers) {
    if (peer.userStatus && STUDIO_USER_STATUSES.has(peer.userStatus)) {
      next.set(
        peer.sessionId,
        Object.freeze({ sessionId: peer.sessionId, status: peer.userStatus, updatedAt: at, returnAt: null }),
      );
    }
  }
  return next;
}
