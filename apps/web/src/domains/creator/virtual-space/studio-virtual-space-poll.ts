/**
 * 가상 스튜디오 투표(폴) 순수 로직.
 *
 * 질문 + 선택지(2~6개), 익명/기명, 마감 시간, 실시간 집계, 중복 투표 방지를 제공한다.
 * 모든 함수는 불변(immutable) 객체를 반환하며 네트워크·DOM에 의존하지 않는다.
 */

export const STUDIO_POLL_MIN_OPTIONS = 2;
export const STUDIO_POLL_MAX_OPTIONS = 6;
export const STUDIO_POLL_MAX_QUESTION_LENGTH = 200;
export const STUDIO_POLL_MAX_OPTION_LENGTH = 60;

export interface StudioPollOption {
  readonly id: string;
  readonly text: string;
}

export interface StudioPollVote {
  /** 선택지 id. */
  readonly optionId: string;
  /** 기명 투표일 때만 표시되는 이름. 익명은 빈 문자열. */
  readonly voterName: string;
  /** 기명 투표일 때만 표시되는 세션 id. 익명은 빈 문자열. */
  readonly voterSessionId: string;
  /** 중복 투표 방지를 위한 단방향 수령증. 익명 투표에서도 역추적 불가. */
  readonly receipt: string;
}

export interface StudioPoll {
  readonly id: string;
  readonly question: string;
  readonly options: readonly StudioPollOption[];
  readonly anonymous: boolean;
  /** 마감 시각(epoch ms). null이면 수동 마감 전까지 유지. */
  readonly deadlineMs: number | null;
  readonly createdAt: number;
  readonly createdBySessionId: string;
  readonly createdByName: string;
  /** 수동 마감 여부. */
  readonly closed: boolean;
  readonly votes: readonly StudioPollVote[];
}

export interface StudioPollCreateInput {
  readonly question: string;
  readonly options: readonly string[];
  readonly anonymous: boolean;
  /** 현재 시각 기준 상대 마감(ms). null/undefined이면 마감 없음. */
  readonly closesInMs?: number | null;
  readonly createdBySessionId: string;
  readonly createdByName: string;
  /** 테스트 주입용. */
  readonly nowMs?: number;
  readonly id?: string;
}

export type StudioPollCreateError =
  | "question-empty"
  | "question-too-long"
  | "too-few-options"
  | "too-many-options"
  | "option-empty"
  | "option-too-long"
  | "duplicate-options"
  | "deadline-in-past"
  | "creator-invalid";

export type StudioPollVoteError =
  | "poll-closed"
  | "poll-expired"
  | "invalid-option"
  | "duplicate-vote"
  | "voter-invalid";

export type StudioPollStatus = "open" | "closed" | "expired";

export interface StudioPollTallyResult {
  readonly optionId: string;
  readonly text: string;
  readonly count: number;
  /** 0..100. */
  readonly percent: number;
  /** 기명 투표일 때만 채워진다. */
  readonly voters: readonly { readonly sessionId: string; readonly name: string }[];
}

export interface StudioPollTally {
  readonly totalVotes: number;
  readonly uniqueVoters: number;
  readonly results: readonly StudioPollTallyResult[];
}

function fnv1a32(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function receiptFor(pollId: string, anonymous: boolean, voterSessionId: string): string {
  return anonymous
    ? `anon:${fnv1a32(`${pollId}\u0000${voterSessionId}`)}`
    : `named:${voterSessionId}`;
}

function makeId(explicit?: string, prefix = "poll"): string {
  if (explicit && explicit.trim().length > 0 && explicit.length <= 80) return explicit.trim();
  const random = globalThis.crypto?.randomUUID?.();
  return typeof random === "string" && random.length > 0
    ? random
    : `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function freezePoll(poll: StudioPoll): StudioPoll {
  return Object.freeze({
    ...poll,
    options: Object.freeze(poll.options.map((option) => Object.freeze({ ...option }))),
    votes: Object.freeze(poll.votes.map((vote) => Object.freeze({ ...vote }))),
  });
}

const isNonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * 투표를 생성한다. 입력이 유효하지 않으면 실패 사유를 반환한다.
 */
export function createStudioPoll(
  input: StudioPollCreateInput,
): { readonly ok: true; readonly poll: StudioPoll } | { readonly ok: false; readonly reason: StudioPollCreateError } {
  const question = input.question.trim();
  if (!question) return { ok: false, reason: "question-empty" };
  if (question.length > STUDIO_POLL_MAX_QUESTION_LENGTH) return { ok: false, reason: "question-too-long" };
  const texts = input.options.map((option) => option.trim());
  if (texts.length < STUDIO_POLL_MIN_OPTIONS) return { ok: false, reason: "too-few-options" };
  if (texts.length > STUDIO_POLL_MAX_OPTIONS) return { ok: false, reason: "too-many-options" };
  if (texts.some((text) => !text)) return { ok: false, reason: "option-empty" };
  if (texts.some((text) => text.length > STUDIO_POLL_MAX_OPTION_LENGTH)) return { ok: false, reason: "option-too-long" };
  if (new Set(texts).size !== texts.length) return { ok: false, reason: "duplicate-options" };
  if (!isNonEmptyText(input.createdBySessionId) || !isNonEmptyText(input.createdByName)) {
    return { ok: false, reason: "creator-invalid" };
  }
  const now = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  let deadlineMs: number | null = null;
  if (input.closesInMs != null) {
    if (!Number.isFinite(input.closesInMs) || input.closesInMs <= 0) return { ok: false, reason: "deadline-in-past" };
    deadlineMs = now + Math.floor(input.closesInMs);
  }
  const id = makeId(input.id);
  return {
    ok: true,
    poll: freezePoll({
      id,
      question,
      options: texts.map((text, index) => ({ id: `${id}:o${index}`, text })),
      anonymous: input.anonymous,
      deadlineMs,
      createdAt: now,
      createdBySessionId: input.createdBySessionId.trim(),
      createdByName: input.createdByName.trim(),
      closed: false,
      votes: [],
    }),
  };
}

/**
 * 투표의 현재 상태를 반환한다.
 */
export function studioPollStatus(poll: StudioPoll, nowMs?: number): StudioPollStatus {
  if (poll.closed) return "closed";
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  if (poll.deadlineMs != null && now >= poll.deadlineMs) return "expired";
  return "open";
}

/**
 * 마감까지 남은 시간(ms). 마감 없음·종료 상태에서는 null.
 */
export function studioPollTimeLeftMs(poll: StudioPoll, nowMs?: number): number | null {
  const now = Number.isFinite(nowMs) ? Number(nowMs) : Date.now();
  if (poll.closed || poll.deadlineMs == null) return null;
  return Math.max(0, poll.deadlineMs - now);
}

export interface StudioPollVoteInput {
  readonly voterSessionId: string;
  readonly voterName: string;
  readonly optionId: string;
  /** 테스트 주입용. */
  readonly nowMs?: number;
}

/**
 * 한 표를 행사한다. 투표자당 1표만 허용하며 중복 투표를 거부한다.
 */
export function castStudioPollVote(
  poll: StudioPoll,
  input: StudioPollVoteInput,
): { readonly ok: true; readonly poll: StudioPoll } | { readonly ok: false; readonly reason: StudioPollVoteError } {
  const now = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  if (poll.closed) return { ok: false, reason: "poll-closed" };
  if (poll.deadlineMs != null && now >= poll.deadlineMs) return { ok: false, reason: "poll-expired" };
  if (!isNonEmptyText(input.voterSessionId)) return { ok: false, reason: "voter-invalid" };
  if (!poll.options.some((option) => option.id === input.optionId)) return { ok: false, reason: "invalid-option" };
  const receipt = receiptFor(poll.id, poll.anonymous, input.voterSessionId.trim());
  if (poll.votes.some((vote) => vote.receipt === receipt)) return { ok: false, reason: "duplicate-vote" };
  const vote: StudioPollVote = poll.anonymous
    ? { optionId: input.optionId, voterName: "", voterSessionId: "", receipt }
    : {
        optionId: input.optionId,
        voterName: input.voterName.trim(),
        voterSessionId: input.voterSessionId.trim(),
        receipt,
      };
  return { ok: true, poll: freezePoll({ ...poll, votes: [...poll.votes, vote] }) };
}

/**
 * 투표를 수동 마감한다.
 */
export function closeStudioPoll(poll: StudioPoll): StudioPoll {
  return freezePoll({ ...poll, closed: true });
}

/**
 * 실시간 집계 결과를 계산한다. 득표수 내림차순 정렬.
 */
export function tallyStudioPoll(poll: StudioPoll): StudioPollTally {
  const counts = new Map<string, number>();
  for (const option of poll.options) counts.set(option.id, 0);
  for (const vote of poll.votes) counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
  const totalVotes = poll.votes.length;
  const uniqueVoters = new Set(poll.votes.map((vote) => vote.receipt)).size;
  const results = poll.options.map((option) => {
    const count = counts.get(option.id) ?? 0;
    const voters = poll.anonymous
      ? []
      : poll.votes
          .filter((vote) => vote.optionId === option.id)
          .map((vote) => ({ sessionId: vote.voterSessionId, name: vote.voterName }));
    return {
      optionId: option.id,
      text: option.text,
      count,
      percent: totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 1000) / 10,
      voters: Object.freeze(voters),
    };
  }).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "ko"));
  return Object.freeze({ totalVotes, uniqueVoters, results: Object.freeze(results) });
}

/**
 * 해당 투표자가 이미 투표했는지 여부. 익명 투표의 수령증은 단방향이라 역추적되지 않는다.
 */
export function studioPollDidVote(poll: StudioPoll, voterSessionId: string): boolean {
  if (!voterSessionId.trim()) return false;
  const receipt = receiptFor(poll.id, poll.anonymous, voterSessionId.trim());
  return poll.votes.some((vote) => vote.receipt === receipt);
}

const POLL_TOP_KEYS = ["id", "question", "options", "anonymous", "deadlineMs", "createdAt",
  "createdBySessionId", "createdByName", "closed", "votes"] as const;
const OPTION_KEYS = new Set(["id", "text"]);
const VOTE_KEYS = new Set(["optionId", "voterName", "voterSessionId", "receipt"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;

/**
 * 투표를 P2P 전송 가능한 JSON 문자열로 직렬화한다.
 */
export function serializeStudioPoll(poll: StudioPoll): string {
  return JSON.stringify({
    id: poll.id,
    question: poll.question,
    options: poll.options,
    anonymous: poll.anonymous,
    deadlineMs: poll.deadlineMs,
    createdAt: poll.createdAt,
    createdBySessionId: poll.createdBySessionId,
    createdByName: poll.createdByName,
    closed: poll.closed,
    votes: poll.votes,
  });
}

/**
 * 직렬화된 투표를 엄격 검증 후 복원한다. 유효하지 않으면 null.
 */
export function parseStudioPoll(raw: string): StudioPoll | null {
  if (typeof raw !== "string" || raw.length > 64 * 1024) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== POLL_TOP_KEYS.length || !POLL_TOP_KEYS.every((key) => key in item)) return null;
  if (
    typeof item.id !== "string" || !SAFE_ID.test(item.id)
    || typeof item.question !== "string" || !item.question.trim()
    || item.question.length > STUDIO_POLL_MAX_QUESTION_LENGTH
    || !Array.isArray(item.options)
    || item.options.length < STUDIO_POLL_MIN_OPTIONS
    || item.options.length > STUDIO_POLL_MAX_OPTIONS
    || typeof item.anonymous !== "boolean"
    || (item.deadlineMs !== null && (typeof item.deadlineMs !== "number" || !Number.isSafeInteger(item.deadlineMs) || item.deadlineMs <= 0))
    || !Number.isSafeInteger(item.createdAt)
    || typeof item.createdBySessionId !== "string" || !item.createdBySessionId.trim()
    || typeof item.createdByName !== "string" || !item.createdByName.trim()
    || typeof item.closed !== "boolean"
    || !Array.isArray(item.votes)
  ) return null;
  const options: StudioPollOption[] = [];
  for (const entry of item.options) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const candidate = entry as Record<string, unknown>;
    const optionKeys = Object.keys(candidate);
    if (
      optionKeys.length !== OPTION_KEYS.size || !optionKeys.every((key) => OPTION_KEYS.has(key))
      || typeof candidate.id !== "string" || !SAFE_ID.test(candidate.id)
      || typeof candidate.text !== "string" || !candidate.text.trim()
      || candidate.text.length > STUDIO_POLL_MAX_OPTION_LENGTH
    ) return null;
    options.push({ id: candidate.id, text: candidate.text.trim() });
  }
  const optionIds = new Set(options.map((option) => option.id));
  if (optionIds.size !== options.length) return null;
  const votes: StudioPollVote[] = [];
  const receipts = new Set<string>();
  for (const entry of item.votes) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const candidate = entry as Record<string, unknown>;
    const keys = Object.keys(candidate);
    if (keys.length !== VOTE_KEYS.size || !keys.every((key) => VOTE_KEYS.has(key))) return null;
    if (
      typeof candidate.optionId !== "string" || !optionIds.has(candidate.optionId)
      || typeof candidate.voterName !== "string" || candidate.voterName.length > 80
      || typeof candidate.voterSessionId !== "string" || candidate.voterSessionId.length > 160
      || typeof candidate.receipt !== "string" || !candidate.receipt
      || candidate.receipt.length > 100
    ) return null;
    if (receipts.has(candidate.receipt)) return null;
    receipts.add(candidate.receipt);
    votes.push({
      optionId: candidate.optionId,
      voterName: candidate.voterName,
      voterSessionId: candidate.voterSessionId,
      receipt: candidate.receipt,
    });
  }
  return freezePoll({
    id: item.id,
    question: item.question.trim(),
    options,
    anonymous: item.anonymous,
    deadlineMs: item.deadlineMs === null ? null : Number(item.deadlineMs),
    createdAt: Number(item.createdAt),
    createdBySessionId: item.createdBySessionId.trim(),
    createdByName: item.createdByName.trim(),
    closed: item.closed,
    votes,
  });
}
