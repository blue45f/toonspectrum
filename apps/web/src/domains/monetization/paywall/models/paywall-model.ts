/**
 * paywall-model.ts
 *
 * 롤링 페이월 / 얼리 액세스 도메인 모델.
 * 서포터에게 먼저 공개하고 N일 후 전체 무료로 전환한다.
 * "서포터" 판정은 인터페이스(SupporterEvidence)로 추상화해
 * 후원·멤버십 트랙의 구체 구현에 의존하지 않는다.
 */

/** 얼리 액세스 기간 제한 (일). */
export const EARLY_ACCESS_DAYS_MIN = 1;
export const EARLY_ACCESS_DAYS_MAX = 90;

/** 작품별 얼리 액세스 정책 (창작자가 설정). */
export interface EarlyAccessPolicy {
  readonly id: string;
  readonly creatorId: string;
  readonly titleId: string;
  readonly titleName: string;
  readonly enabled: boolean;
  /** 서포터 선공개 기간 (일). 이 기간이 지나면 전체 무료. */
  readonly earlyAccessDays: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * 서포터 증거. 호출 측(앱 레이어)에서 조합한다.
 * - hasTipped: 해당 회차에 후원한 적 있는지
 * - isMember: 창작자의 멤버십 멤버인지
 */
export interface SupporterEvidence {
  readonly hasTipped: boolean;
  readonly isMember: boolean;
}

export const NO_SUPPORTER_EVIDENCE: SupporterEvidence = {
  hasTipped: false,
  isMember: false,
};

export type EpisodeAccessReason = "open" | "supporter-early-access" | "locked";

export interface EpisodeAccessState {
  readonly accessible: boolean;
  readonly reason: EpisodeAccessReason;
  /** 전체 무료 전환 시점 (ISO). 이미 전체 공개면 null. */
  readonly freeAt: string | null;
  /** 전체 무료까지 남은 일수 (올림). null이면 해당 없음. */
  readonly daysUntilFree: number | null;
}

export interface ResolveEpisodeAccessInput {
  readonly policy: EarlyAccessPolicy | null;
  /** 회차 공개 시점 (ISO). 서포터 선공개 시작 기준. */
  readonly publishedAt: string;
  readonly evidence: SupporterEvidence;
  readonly now?: Date;
}

/**
 * 회차 접근 상태를 판정한다.
 * - 정책이 없거나 꺼져 있으면 전체 공개
 * - 얼리 액세스 기간이 지났으면 전체 공개
 * - 기간 내에는 서포터(후원자·멤버)만 열람 가능
 */
export function resolveEpisodeAccess(input: ResolveEpisodeAccessInput): EpisodeAccessState {
  const now = input.now ?? new Date();
  const { policy } = input;

  if (!policy || !policy.enabled) {
    return { accessible: true, reason: "open", freeAt: null, daysUntilFree: null };
  }

  const publishedAt = new Date(input.publishedAt).getTime();
  if (!Number.isFinite(publishedAt)) {
    return { accessible: true, reason: "open", freeAt: null, daysUntilFree: null };
  }

  const freeAtMs = publishedAt + policy.earlyAccessDays * 86_400_000;
  const freeAt = new Date(freeAtMs).toISOString();

  if (now.getTime() >= freeAtMs) {
    return { accessible: true, reason: "open", freeAt: null, daysUntilFree: null };
  }

  const isSupporter = input.evidence.hasTipped || input.evidence.isMember;
  if (isSupporter) {
    return {
      accessible: true,
      reason: "supporter-early-access",
      freeAt,
      daysUntilFree: Math.max(1, Math.ceil((freeAtMs - now.getTime()) / 86_400_000)),
    };
  }

  return {
    accessible: false,
    reason: "locked",
    freeAt,
    daysUntilFree: Math.max(1, Math.ceil((freeAtMs - now.getTime()) / 86_400_000)),
  };
}

/** 얼리 액세스 기간(일)이 유효한지. */
export function isValidEarlyAccessDays(days: number): boolean {
  return (
    Number.isInteger(days) &&
    days >= EARLY_ACCESS_DAYS_MIN &&
    days <= EARLY_ACCESS_DAYS_MAX
  );
}

/** 정책 입력값 검사. 오류 키 또는 null. */
export function validateEarlyAccessPolicy(input: {
  readonly titleId: string;
  readonly titleName: string;
  readonly earlyAccessDays: number;
}): string | null {
  if (input.titleId.trim().length === 0) return "titleRequired";
  if (input.titleName.trim().length === 0) return "titleRequired";
  if (!isValidEarlyAccessDays(input.earlyAccessDays)) return "daysOutOfRange";
  return null;
}
