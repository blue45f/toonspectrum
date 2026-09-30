/**
 * Studio Comment Enhance — 댓글 고도화 순수 코어.
 *
 * 기존 댓글 UI(`StudioCommentsPanel`, `threaded-comment-section` 등)는
 * 건드리지 않는다 (브리지 패턴). 이 모듈은 새로 만들 `comments-plus`
 * 컴포넌트들이 쓰는 순수 로직만 담는다.
 *
 * - 한글 @이름 멘션 파싱 (이메일 주소 오탐 방지).
 * - 이모지 리액션 집계 + 내 리액션 + 낙관적 토글.
 * - 3초 만료 타이핑 상태 머신.
 * - 미해결 우선 / 내 멘션 / 내 스레드 / 최근 활동 정렬·필터.
 * - 안 읽음 개수 계산.
 *
 * 전부 순수·결정적. DOM 의존성 없음.
 */

export interface Mention {
  /** "@"를 제외한 이름 (예: "김민준"). */
  name: string;
  /** 원문에서의 시작 인덱스 ("@" 위치). */
  start: number;
  /** 원문에서의 끝 인덱스 (exclusive). */
  end: number;
}

/**
 * 멘션 이름 끝의 한국어 조사를 떼어낸다 ("민수가" → "민수").
 * 사용자 이름 매칭(mentions-me 필터)이 실제로 동작하게 하기 위함.
 * 남은 이름이 비게 되면 떼어내지 않는다.
 */
const KOREAN_PARTICLES = [
  "으로",
  "이랑",
  "에게",
  "한테",
  "부터",
  "까지",
  "보다",
  "처럼",
  "같이",
  "에서",
  "이",
  "가",
  "은",
  "는",
  "을",
  "를",
  "께",
  "도",
  "만",
  "의",
  "와",
  "과",
  "로",
  "에",
  "랑",
];

function stripKoreanParticle(name: string): string {
  if (!/[가-힣]/.test(name)) return name;
  for (const particle of KOREAN_PARTICLES) {
    if (name.length > particle.length && name.endsWith(particle)) {
      return name.slice(0, -particle.length);
    }
  }
  return name;
}

/**
 * 텍스트에서 @멘션을 파싱한다.
 * - 한글/영문/숫자/밑줄 이름 지원. 한글 이름 끝의 조사는 떼어낸다.
 * - 이메일(user@example.com)의 @는 멘션으로 보지 않는다
 *   (@ 앞에 단어 문자가 있으면 스킵).
 */
export function parseMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  const pattern = /@([가-힣a-zA-Z0-9_]{1,20})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const atIndex = match.index;
    const prev = atIndex > 0 ? text[atIndex - 1] : "";
    // 이메일 주소 안의 @는 제외.
    if (/[\w가-힣]/.test(prev)) continue;
    mentions.push({
      name: stripKoreanParticle(match[1]),
      start: atIndex,
      end: atIndex + match[0].length,
    });
  }
  return mentions;
}

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** 내가 이 이모지를 눌렀는지. */
  reactedByMe: boolean;
  /** 누른 사용자 id 목록 (최대 표시용, 순서 무작위 아님: 입력 순서). */
  userIds: string[];
}

/**
 * 리액션을 이모지별로 집계한다. count 내림차순, 동점이면 emoji 오름차순
 * (결정적 순서).
 */
export function aggregateReactions(
  reactions: Reaction[],
  myUserId: string
): ReactionSummary[] {
  const byEmoji = new Map<string, { userIds: string[] }>();
  for (const r of reactions) {
    const entry = byEmoji.get(r.emoji) ?? { userIds: [] };
    if (!entry.userIds.includes(r.userId)) entry.userIds.push(r.userId);
    byEmoji.set(r.emoji, entry);
  }
  return [...byEmoji.entries()]
    .map(([emoji, { userIds }]) => ({
      emoji,
      count: userIds.length,
      reactedByMe: userIds.includes(myUserId),
      userIds,
    }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

/**
 * 리액션 낙관적 토글: 내가 이미 눌렀으면 제거, 아니면 추가.
 * 서버 응답 전 UI를 먼저 바꾸는 용도 (순수 함수).
 */
export function toggleReaction(
  reactions: Reaction[],
  emoji: string,
  myUserId: string
): Reaction[] {
  const existing = reactions.findIndex(
    (r) => r.emoji === emoji && r.userId === myUserId
  );
  if (existing >= 0) {
    return reactions.filter((_, i) => i !== existing);
  }
  return [...reactions, { emoji, userId: myUserId }];
}

// ── 타이핑 상태 머신 ───────────────────────────────────────────────────

/** 타이핑 표시 만료 시간 (ms). */
export const TYPING_EXPIRY_MS = 3000;

export interface TypingTracker {
  /** userId가 now에 타이핑 중이라고 기록. */
  markTyping: (userId: string, userName: string, now: number) => void;
  /** 만료된 기록을 정리. */
  prune: (now: number) => void;
  /** 현재 타이핑 중인 사용자 목록 (만료 제외). */
  typingUsers: (now: number) => Array<{ userId: string; userName: string }>;
}

/** 3초 만료 타이핑 트래커를 만든다. */
export function createTypingTracker(
  expiryMs: number = TYPING_EXPIRY_MS
): TypingTracker {
  const lastTyped = new Map<string, { userName: string; at: number }>();
  const alive = (now: number): Array<{ userId: string; userName: string }> => {
    const out: Array<{ userId: string; userName: string }> = [];
    for (const [userId, { userName, at }] of lastTyped) {
      if (now - at < expiryMs) out.push({ userId, userName });
    }
    return out;
  };
  return {
    markTyping: (userId, userName, now) => {
      lastTyped.set(userId, { userName, at: now });
    },
    prune: (now) => {
      for (const [userId, { at }] of lastTyped) {
        if (now - at >= expiryMs) lastTyped.delete(userId);
      }
    },
    typingUsers: (now) => alive(now),
  };
}

// ── 스레드 정렬·필터·안 읽음 ────────────────────────────────────────────

export interface EnhanceComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
}

export interface EnhanceThread {
  id: string;
  /** true면 해결됨. */
  resolved: boolean;
  comments: EnhanceComment[];
  /** 마지막 활동 시각 (댓글 생성/수정 중 가장 최근). */
  lastActivityAt: number;
}

export type ThreadSortKey =
  | "unresolved-first"
  | "recent-activity"
  | "my-threads-first";

export type ThreadFilter =
  | "all"
  | "unread"
  | "mentions-me"
  | "mine"
  | "unresolved"
  | "resolved";

function threadMentionsUser(thread: EnhanceThread, userName: string): boolean {
  return thread.comments.some((c) =>
    parseMentions(c.body).some((m) => m.name === userName)
  );
}

function threadInvolvesUser(thread: EnhanceThread, userId: string): boolean {
  return thread.comments.some((c) => c.authorId === userId);
}

/**
 * 스레드 정렬. 기본은 "미해결 우선 + 최근 활동순".
 * - unresolved-first: 미해결 먼저, 그 안에서 최근 활동순.
 * - recent-activity: 순수 최근 활동순.
 * - my-threads-first: 내가 참여한 스레드 먼저, 그 안에서 최근 활동순.
 */
export function sortThreads(
  threads: EnhanceThread[],
  sortKey: ThreadSortKey,
  myUserId: string
): EnhanceThread[] {
  const byActivity = (a: EnhanceThread, b: EnhanceThread) =>
    b.lastActivityAt - a.lastActivityAt || a.id.localeCompare(b.id);
  const copy = [...threads];
  switch (sortKey) {
    case "recent-activity":
      return copy.sort(byActivity);
    case "my-threads-first":
      return copy.sort((a, b) => {
        const am = threadInvolvesUser(a, myUserId) ? 0 : 1;
        const bm = threadInvolvesUser(b, myUserId) ? 0 : 1;
        return am - bm || byActivity(a, b);
      });
    case "unresolved-first":
    default:
      return copy.sort((a, b) => {
        const ar = a.resolved ? 1 : 0;
        const br = b.resolved ? 1 : 0;
        return ar - br || byActivity(a, b);
      });
  }
}

/**
 * 스레드 필터. unread 필터는 lastReadAtByThread 맵을 사용한다.
 */
export function filterThreads(
  threads: EnhanceThread[],
  filter: ThreadFilter,
  options: {
    myUserId: string;
    myUserName: string;
    lastReadAtByThread?: ReadonlyMap<string, number> | Record<string, number>;
  }
): EnhanceThread[] {
  const lastReadAt = (threadId: string): number => {
    const map = options.lastReadAtByThread;
    if (!map) return 0;
    return map instanceof Map
      ? (map.get(threadId) ?? 0)
      : (map[threadId] ?? 0);
  };
  switch (filter) {
    case "all":
      return [...threads];
    case "unread":
      return threads.filter(
        (t) => computeUnread(t, lastReadAt(t.id), options.myUserId) > 0
      );
    case "mentions-me":
      return threads.filter((t) => threadMentionsUser(t, options.myUserName));
    case "mine":
      return threads.filter((t) => threadInvolvesUser(t, options.myUserId));
    case "unresolved":
      return threads.filter((t) => !t.resolved);
    case "resolved":
      return threads.filter((t) => t.resolved);
  }
}

/**
 * 안 읽은 댓글 수: lastReadAt 이후에 달린, 내가 쓰지 않은 댓글 수.
 */
export function computeUnread(
  thread: EnhanceThread,
  lastReadAt: number,
  myUserId: string
): number {
  return thread.comments.filter(
    (c) => c.createdAt > lastReadAt && c.authorId !== myUserId
  ).length;
}
