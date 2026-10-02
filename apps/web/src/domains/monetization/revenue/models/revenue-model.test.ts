/**
 * revenue-model.test.ts
 *
 * 수익 집계·월별 묶음·레지스트리·정산 계산 테스트.
 */
import { describe, expect, it } from "vitest";

import {
  aggregateRevenue,
  groupEntriesByMonth,
  lastNMonths,
  monthRange,
  type RevenueEntry,
} from "./revenue-model";
import {
  aggregateCreatorRevenue,
  computeSettlementBreakdown,
  isPayoutEligible,
} from "../revenue-aggregator";
import {
  registerRevenueSourceProvider,
  resetRevenueSourceProviders,
} from "../revenue-registry";

function makeEntry(overrides: Partial<RevenueEntry> = {}): RevenueEntry {
  return {
    id: "entry-1",
    sourceId: "tips",
    sourceLabel: "후원",
    amount: 1000,
    occurredAt: "2026-10-05T00:00:00.000Z",
    ...overrides,
  };
}

const OCTOBER = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" };

describe("aggregateRevenue", () => {
  it("기간 내 항목만 모아 총액과 수익원별 합계를 낸다", () => {
    const summary = aggregateRevenue(
      [
        makeEntry({ id: "a", amount: 1000, occurredAt: "2026-10-05T00:00:00.000Z" }),
        makeEntry({ id: "b", sourceId: "membership", sourceLabel: "멤버십", amount: 9900, occurredAt: "2026-10-10T00:00:00.000Z" }),
        makeEntry({ id: "c", amount: 500, occurredAt: "2026-09-15T00:00:00.000Z" }),
        makeEntry({ id: "d", amount: 0, occurredAt: "2026-10-12T00:00:00.000Z" }),
      ],
      OCTOBER,
    );
    expect(summary.totalAmount).toBe(10900);
    expect(summary.entryCount).toBe(2);
    expect(summary.bySource.map((bucket) => bucket.sourceId)).toEqual(["membership", "tips"]);
    expect(summary.bySource[0]?.amount).toBe(9900);
  });

  it("최신 항목이 먼저 오도록 정렬한다", () => {
    const summary = aggregateRevenue(
      [
        makeEntry({ id: "a", occurredAt: "2026-10-01T00:00:00.000Z" }),
        makeEntry({ id: "b", occurredAt: "2026-10-20T00:00:00.000Z" }),
      ],
      OCTOBER,
    );
    expect(summary.entries.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("groupEntriesByMonth", () => {
  it("지정된 월 키에만 금액을 묶는다", () => {
    const grouped = groupEntriesByMonth(
      [
        makeEntry({ id: "a", amount: 1000, occurredAt: "2026-10-05T00:00:00.000Z" }),
        makeEntry({ id: "b", amount: 2000, occurredAt: "2026-09-15T00:00:00.000Z" }),
      ],
      ["2026-09", "2026-10"],
    );
    expect(grouped).toEqual([
      { month: "2026-09", amount: 2000 },
      { month: "2026-10", amount: 1000 },
    ]);
  });
});

describe("lastNMonths / monthRange", () => {
  it("최근 N개월 키를 오름차순으로 만든다", () => {
    expect(lastNMonths(3, new Date("2026-10-15T00:00:00.000Z"))).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("월 경계를 UTC 기준으로 만든다", () => {
    expect(monthRange("2026-10")).toEqual({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-01T00:00:00.000Z",
    });
  });
});

describe("aggregateCreatorRevenue", () => {
  it("등록된 제공자들의 항목을 모아 집계한다", () => {
    resetRevenueSourceProviders();
    registerRevenueSourceProvider({
      sourceId: "tips",
      listEntries: () => [makeEntry({ id: "t1", amount: 3000 })],
    });
    registerRevenueSourceProvider({
      sourceId: "custom",
      listEntries: () => [makeEntry({ id: "c1", sourceId: "custom", sourceLabel: "기타", amount: 7000 })],
    });
    const summary = aggregateCreatorRevenue({ creatorId: "creator-1", period: OCTOBER });
    expect(summary.totalAmount).toBe(10000);
    expect(summary.entryCount).toBe(2);
    resetRevenueSourceProviders();
  });

  it("실패하는 제공자를 건너뛰고 나머지로 계속한다", () => {
    resetRevenueSourceProviders();
    registerRevenueSourceProvider({
      sourceId: "tips",
      listEntries: () => {
        throw new Error("boom");
      },
    });
    registerRevenueSourceProvider({
      sourceId: "custom",
      listEntries: () => [makeEntry({ id: "c1", sourceId: "custom", sourceLabel: "기타", amount: 7000 })],
    });
    const summary = aggregateCreatorRevenue({ creatorId: "creator-1", period: OCTOBER });
    expect(summary.totalAmount).toBe(7000);
    resetRevenueSourceProviders();
  });
});

describe("computeSettlementBreakdown", () => {
  it("마켓 정산기 정책을 적용한다 (10만원, 표준 창작자)", () => {
    const breakdown = computeSettlementBreakdown(100_000, "standard-creator");
    // 플랫폼 20% = 20000, PG 3.3% = 3300, 세전 76700, 원천세 3.3% = 2531, 실수령 74169
    expect(breakdown).toMatchObject({
      grossPriceKrw: 100000,
      platformFeeKrw: 20000,
      pgFeeKrw: 3300,
      withholdingTaxKrw: 2531,
      netCreatorPayoutKrw: 74169,
    });
  });

  it("프로 파트너는 플랫폼 수수료가 10%다", () => {
    const breakdown = computeSettlementBreakdown(100_000, "pro-partner");
    expect(breakdown.platformFeeKrw).toBe(10000);
    expect(breakdown.netCreatorPayoutKrw).toBeGreaterThan(74169);
  });
});

describe("isPayoutEligible", () => {
  it("최소 기준액(1만원)을 충족해야 한다", () => {
    expect(isPayoutEligible(9999)).toBe(false);
    expect(isPayoutEligible(10000)).toBe(true);
  });
});
