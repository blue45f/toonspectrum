// @vitest-environment jsdom
/**
 * membership-store.test.ts
 *
 * 브라우저 저장소에 남는 데이터 형태를 고정한다. 구독에는 구독자의 이름·이메일을
 * 평문으로 남기지 않는다(알림 129 `js/clear-text-storage-of-sensitive-data`).
 * 필드를 새로 추가하려면 이 테스트의 키 목록을 함께 고쳐야 하므로,
 * 개인정보가 조용히 추가·유출되는 경로가 사라진다.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { nextBillingDate } from "./membership-model";
import { MEMBERSHIP_STORE_EVENT, createTier, listSubscriptions, subscribeToTier } from "./membership-store";

const SUBSCRIPTION_STORAGE_KEY = "toonspectrum:monetization:membership-subscriptions";
const TIER_STORAGE_KEY = "toonspectrum:monetization:membership-tiers";

function readPersistedSubscriptions(): Record<string, unknown>[] {
  const raw = window.localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
}

function createSampleTier() {
  return createTier({ creatorId: "creator-1", name: "스탠다드", monthlyPriceKrw: 5_000, perks: [] });
}

describe("멤버십 브라우저 저장소", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("구독을 저장해도 구독자 이름이나 이메일이 남지 않는다", () => {
    const tier = createSampleTier();
    subscribeToTier({ tier, memberId: "member-1" });

    const serialized = window.localStorage.getItem(SUBSCRIPTION_STORAGE_KEY) ?? "";
    expect(serialized).not.toContain("memberName");
    expect(serialized).not.toContain("member-1@");
    for (const persisted of readPersistedSubscriptions()) {
      expect(Object.keys(persisted)).not.toContain("memberName");
      expect(Object.values(persisted)).not.toContain("anonymous@");
    }
  });

  it("구독 영속화 키 집합은 명시적으로 고정한 것과 같다", () => {
    const tier = createSampleTier();
    subscribeToTier({ tier, memberId: "member-1" });

    expect(Object.keys(readPersistedSubscriptions()[0] ?? {}).sort()).toEqual(
      [
        "cancelledAt",
        "creatorId",
        "id",
        "memberId",
        "monthlyPriceKrw",
        "startedAt",
        "status",
        "tierId",
      ].sort(),
    );
  });

  it("결제일은 저장하지 않고 읽을 때 startedAt에서 다시 계산한다", () => {
    const tier = createSampleTier();
    subscribeToTier({ tier, memberId: "member-1" });

    const [persisted] = readPersistedSubscriptions();
    expect(persisted).not.toHaveProperty("currentPeriodEnd");

    const [restored] = listSubscriptions();
    expect(restored?.currentPeriodEnd).toBe(nextBillingDate(new Date(restored!.startedAt)));
  });

  it("티어와 구독 저장은 서로 다른 키를 쓰고 이벤트를 발행한다", () => {
    const tier = createSampleTier();
    let events = 0;
    window.addEventListener(MEMBERSHIP_STORE_EVENT, () => {
      events += 1;
    });
    subscribeToTier({ tier, memberId: "member-1" });

    expect(window.localStorage.getItem(TIER_STORAGE_KEY)).not.toBeNull();
    expect(readPersistedSubscriptions()).toHaveLength(1);
    expect(listSubscriptions()).toHaveLength(1);
    expect(events).toBeGreaterThan(0);
  });

  it("구버전에 이름이 남아 있어도 읽기 계약은 유지된다(가드는 필수 키만 본다)", () => {
    const tier = createSampleTier();
    window.localStorage.setItem(
      SUBSCRIPTION_STORAGE_KEY,
      JSON.stringify([
        {
          id: "sub-legacy",
          tierId: tier.id,
          creatorId: "creator-1",
          memberId: "member-legacy",
          memberName: "遗留 이름",
          status: "active",
          monthlyPriceKrw: 5_000,
          startedAt: new Date().toISOString(),
          currentPeriodEnd: new Date().toISOString(),
          cancelledAt: null,
        },
      ]),
    );

    const loaded = listSubscriptions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.memberId).toBe("member-legacy");
    expect(loaded[0]?.status).toBe("active");
  });
});