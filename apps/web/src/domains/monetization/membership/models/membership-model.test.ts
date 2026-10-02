/**
 * membership-model.test.ts
 *
 * 티어 입력 검증·구독 유효 판정·멤버십 게시글 가시성 검증.
 */
import { describe, expect, it } from "vitest";

import {
  canViewMembershipPost,
  isMemberOfCreator,
  isSubscriptionActive,
  nextBillingDate,
  sumMonthlyRecurring,
  validateTierInput,
  type MembershipSubscription,
  type MembershipTier,
} from "./membership-model";

function makeTier(overrides: Partial<MembershipTier> = {}): MembershipTier {
  return {
    id: "tier-1",
    creatorId: "creator-1",
    name: "응원 멤버",
    monthlyPriceKrw: 5_000,
    description: "",
    perks: ["early-access"],
    memberCount: 3,
    isActive: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSubscription(overrides: Partial<MembershipSubscription> = {}): MembershipSubscription {
  return {
    id: "sub-1",
    tierId: "tier-1",
    creatorId: "creator-1",
    memberId: "user-1",
    status: "active",
    monthlyPriceKrw: 5_000,
    startedAt: "2026-09-15T00:00:00.000Z",
    currentPeriodEnd: "2026-11-15T00:00:00.000Z",
    cancelledAt: null,
    ...overrides,
  };
}

describe("validateTierInput", () => {
  const valid = {
    name: "응원 멤버",
    monthlyPriceKrw: 5_000,
    description: "감사합니다",
    perks: ["early-access"] as const,
  };

  it("올바른 입력을 통과시킨다", () => {
    expect(validateTierInput({ ...valid, perks: ["early-access"] })).toBe(null);
  });

  it("이름이 비어 있거나 너무 길면 오류를 반환한다", () => {
    expect(validateTierInput({ ...valid, name: "  ", perks: ["early-access"] })).toBe("nameRequired");
    expect(validateTierInput({ ...valid, name: "a".repeat(31), perks: ["early-access"] })).toBe("nameTooLong");
  });

  it("가격 범위를 벗어나면 오류를 반환한다", () => {
    expect(validateTierInput({ ...valid, monthlyPriceKrw: 100, perks: ["early-access"] })).toBe("priceOutOfRange");
    expect(validateTierInput({ ...valid, monthlyPriceKrw: 600_000, perks: ["early-access"] })).toBe("priceOutOfRange");
    expect(validateTierInput({ ...valid, monthlyPriceKrw: 1_000.5, perks: ["early-access"] })).toBe("priceOutOfRange");
  });

  it("혜택이 하나도 없으면 오류를 반환한다", () => {
    expect(validateTierInput({ ...valid, perks: [] })).toBe("perkRequired");
  });
});

describe("isSubscriptionActive", () => {
  const now = new Date("2026-10-01T00:00:00.000Z");

  it("active 상태이고 기간 내면 유효하다", () => {
    expect(isSubscriptionActive(makeSubscription(), now)).toBe(true);
  });

  it("해지했거나 기간이 지났으면 무효하다", () => {
    expect(isSubscriptionActive(makeSubscription({ status: "cancelled" }), now)).toBe(false);
    expect(
      isSubscriptionActive(makeSubscription({ currentPeriodEnd: "2026-09-01T00:00:00.000Z" }), now),
    ).toBe(false);
  });
});

describe("isMemberOfCreator", () => {
  const now = new Date("2026-10-01T00:00:00.000Z");

  it("유효한 구독이 하나라도 있으면 멤버다", () => {
    const subs = [
      makeSubscription({ status: "expired" }),
      makeSubscription({ id: "sub-2", memberId: "user-2" }),
    ];
    expect(isMemberOfCreator("creator-1", "user-2", subs, now)).toBe(true);
    expect(isMemberOfCreator("creator-1", "user-9", subs, now)).toBe(false);
  });
});

describe("canViewMembershipPost", () => {
  const post = {
    id: "post-1",
    creatorId: "creator-1",
    visibleTierIds: ["tier-1"] as readonly string[],
    title: "비하인드",
    body: "내용",
    createdAt: "2026-10-01T00:00:00.000Z",
  };

  it("허용된 티어를 가진 멤버만 볼 수 있다", () => {
    expect(canViewMembershipPost(post, ["tier-1"])).toBe(true);
    expect(canViewMembershipPost(post, ["tier-2"])).toBe(false);
    expect(canViewMembershipPost(post, [])).toBe(false);
  });

  it("visibleTierIds가 비어 있으면 멤버 전체가 볼 수 있다", () => {
    expect(canViewMembershipPost({ ...post, visibleTierIds: [] }, ["tier-9"])).toBe(true);
    expect(canViewMembershipPost({ ...post, visibleTierIds: [] }, [])).toBe(false);
  });
});

describe("nextBillingDate", () => {
  it("1개월 후 같은 날짜를 반환한다", () => {
    const next = nextBillingDate(new Date("2026-10-01T00:00:00.000Z"));
    expect(next.startsWith("2026-11-01")).toBe(true);
  });
});

describe("sumMonthlyRecurring", () => {
  it("티어별 월 구독료 합계를 구한다", () => {
    const tiers = [
      makeTier({ monthlyPriceKrw: 5_000, memberCount: 3 }),
      makeTier({ id: "tier-2", monthlyPriceKrw: 10_000, memberCount: 2 }),
    ];
    expect(sumMonthlyRecurring(tiers)).toBe(35_000);
  });
});
