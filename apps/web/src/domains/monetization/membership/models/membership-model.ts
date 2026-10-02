/**
 * membership-model.ts
 *
 * 팬 멤버십(월 구독 티어) 도메인 모델.
 * Patreon / pixiv FANBOX형: 창작자가 티어를 만들고
 * 팬이 월 구독으로 후원한다.
 */

/** 멤버십 혜택 종류. */
export type MembershipPerk =
  | "early-access"
  | "behind-scenes"
  | "exclusive-download"
  | "members-posts";

/** 화면에 보여줄 혜택 메타. */
export const MEMBERSHIP_PERKS: Readonly<Record<MembershipPerk, { order: number }>> = {
  "early-access": { order: 0 },
  "behind-scenes": { order: 1 },
  "exclusive-download": { order: 2 },
  "members-posts": { order: 3 },
};

export const MEMBERSHIP_PERK_IDS: readonly MembershipPerk[] = (
  Object.keys(MEMBERSHIP_PERKS) as MembershipPerk[]
).sort((a, b) => MEMBERSHIP_PERKS[a].order - MEMBERSHIP_PERKS[b].order);

/** 티어 이름/가격 제한. */
export const TIER_NAME_MAX_LENGTH = 30;
export const TIER_DESCRIPTION_MAX_LENGTH = 200;
export const TIER_PRICE_MIN_KRW = 500;
export const TIER_PRICE_MAX_KRW = 500_000;
export const MAX_TIERS_PER_CREATOR = 5;

/** 창작자가 만든 구독 티어. */
export interface MembershipTier {
  readonly id: string;
  readonly creatorId: string;
  readonly name: string;
  readonly monthlyPriceKrw: number;
  readonly description: string;
  readonly perks: readonly MembershipPerk[];
  readonly memberCount: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type SubscriptionStatus = "active" | "cancelled" | "expired";

/** 팬의 구독. */
export interface MembershipSubscription {
  readonly id: string;
  readonly tierId: string;
  readonly creatorId: string;
  readonly memberId: string;
  readonly status: SubscriptionStatus;
  readonly monthlyPriceKrw: number;
  readonly startedAt: string;
  /** 다음 결제일 (월 구독 갱신 기준). */
  readonly currentPeriodEnd: string;
  readonly cancelledAt: string | null;
}

/** 멤버 전용 게시글. */
export interface MembershipPost {
  readonly id: string;
  readonly creatorId: string;
  /** 볼 수 있는 티어 id 목록. 비어 있으면 전체 멤버 공개. */
  readonly visibleTierIds: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface NewTierInput {
  readonly creatorId: string;
  readonly name: string;
  readonly monthlyPriceKrw: number;
  readonly description?: string;
  readonly perks: readonly MembershipPerk[];
}

/** 티어 입력값을 검사하고 오류 키를 반환한다. 없으면 null. */
export function validateTierInput(input: {
  readonly name: string;
  readonly monthlyPriceKrw: number;
  readonly description: string;
  readonly perks: readonly MembershipPerk[];
}): string | null {
  const name = input.name.trim();
  if (name.length === 0) return "nameRequired";
  if (name.length > TIER_NAME_MAX_LENGTH) return "nameTooLong";
  if (
    !Number.isInteger(input.monthlyPriceKrw) ||
    input.monthlyPriceKrw < TIER_PRICE_MIN_KRW ||
    input.monthlyPriceKrw > TIER_PRICE_MAX_KRW
  ) {
    return "priceOutOfRange";
  }
  if (input.description.trim().length > TIER_DESCRIPTION_MAX_LENGTH) return "descriptionTooLong";
  if (input.perks.length === 0) return "perkRequired";
  return null;
}

/** 구독이 현재 유효한지 (active이며 기간 내). */
export function isSubscriptionActive(
  subscription: MembershipSubscription,
  now: Date = new Date(),
): boolean {
  return (
    subscription.status === "active" &&
    new Date(subscription.currentPeriodEnd).getTime() > now.getTime()
  );
}

/** 사용자가 특정 창작자의 멤버인지 (어떤 티어든 유효 구독 보유). */
export function isMemberOfCreator(
  creatorId: string,
  memberId: string,
  subscriptions: readonly MembershipSubscription[],
  now: Date = new Date(),
): boolean {
  return subscriptions.some(
    (sub) =>
      sub.creatorId === creatorId &&
      sub.memberId === memberId &&
      isSubscriptionActive(sub, now),
  );
}

/** 멤버 전용 게시글을 볼 수 있는 티어인지. */
export function canViewMembershipPost(
  post: MembershipPost,
  viewerTierIds: readonly string[],
): boolean {
  if (post.visibleTierIds.length === 0) return viewerTierIds.length > 0;
  return post.visibleTierIds.some((tierId) => viewerTierIds.includes(tierId));
}

/** 다음 결제일 계산 (1개월 후 같은 날짜). */
export function nextBillingDate(from: Date = new Date()): string {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

/** 월 구독료 합계 (창작자의 월 recurring 수익 추정치). */
export function sumMonthlyRecurring(
  tiers: readonly MembershipTier[],
): number {
  return tiers.reduce(
    (sum, tier) => sum + tier.monthlyPriceKrw * tier.memberCount,
    0,
  );
}

export function formatMembershipKrw(amountKrw: number): string {
  return `${amountKrw.toLocaleString("ko-KR")}원`;
}
