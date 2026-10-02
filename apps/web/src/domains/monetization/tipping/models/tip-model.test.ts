/**
 * tip-model.test.ts
 *
 * 후원 금액 검증·메시지 다듬기·회차 집계·랭킹 로직 검증.
 */
import { describe, expect, it } from "vitest";

import {
  isValidTipAmount,
  rankEpisodesByTips,
  sanitizeTipMessage,
  summarizeEpisodeTips,
  TIP_AMOUNT_MAX_KRW,
  TIP_AMOUNT_MIN_KRW,
  type TipRecord,
} from "./tip-model";

function makeTip(overrides: Partial<TipRecord> = {}): TipRecord {
  return {
    id: "tip-1",
    episodeId: "title-a:ep-1",
    titleId: "title-a",
    creatorId: "creator-1",
    tipperId: "user-1",
    tipperName: "독자1",
    amountKrw: 5_000,
    message: null,
    status: "completed",
    orderId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isValidTipAmount", () => {
  it("허용 범위 안의 정수 금액을 통과시킨다", () => {
    expect(isValidTipAmount(1_000)).toBe(true);
    expect(isValidTipAmount(TIP_AMOUNT_MIN_KRW)).toBe(true);
    expect(isValidTipAmount(TIP_AMOUNT_MAX_KRW)).toBe(true);
  });

  it("범위를 벗어나거나 정수가 아닌 금액을 거부한다", () => {
    expect(isValidTipAmount(0)).toBe(false);
    expect(isValidTipAmount(-1_000)).toBe(false);
    expect(isValidTipAmount(TIP_AMOUNT_MAX_KRW + 1)).toBe(false);
    expect(isValidTipAmount(1_000.5)).toBe(false);
    expect(isValidTipAmount(Number.NaN)).toBe(false);
  });
});

describe("sanitizeTipMessage", () => {
  it("앞뒤 공백을 제거하고 빈 메시지는 null로 만든다", () => {
    expect(sanitizeTipMessage("  재밌어요!  ")).toBe("재밌어요!");
    expect(sanitizeTipMessage("   ")).toBe(null);
    expect(sanitizeTipMessage(undefined)).toBe(null);
  });

  it("140자를 초과하면 자른다", () => {
    expect(sanitizeTipMessage("a".repeat(200))).toHaveLength(140);
  });
});

describe("summarizeEpisodeTips", () => {
  it("완료된 후원만 집계하고 후원자 수를 중복 제거한다", () => {
    const tips = [
      makeTip({ tipperId: "user-1", amountKrw: 5_000 }),
      makeTip({ id: "tip-2", tipperId: "user-1", amountKrw: 1_000 }),
      makeTip({ id: "tip-3", tipperId: "user-2", amountKrw: 10_000, status: "failed" }),
      makeTip({ id: "tip-4", tipperId: "user-3", amountKrw: 3_000, episodeId: "title-a:ep-2" }),
    ];
    const summary = summarizeEpisodeTips("title-a:ep-1", tips);
    expect(summary.totalKrw).toBe(6_000);
    expect(summary.tipCount).toBe(2);
    expect(summary.supporterCount).toBe(1);
    expect(summary.topAmountKrw).toBe(5_000);
  });

  it("후원이 없으면 0으로 집계한다", () => {
    const summary = summarizeEpisodeTips("title-a:ep-9", []);
    expect(summary).toMatchObject({ totalKrw: 0, tipCount: 0, supporterCount: 0 });
  });
});

describe("rankEpisodesByTips", () => {
  it("후원 총액 내림차순으로 순위를 매긴다", () => {
    const tips = [
      makeTip({ episodeId: "title-a:ep-1", amountKrw: 1_000 }),
      makeTip({ id: "tip-2", episodeId: "title-a:ep-2", amountKrw: 10_000 }),
      makeTip({ id: "tip-3", episodeId: "title-a:ep-2", amountKrw: 5_000 }),
      makeTip({ id: "tip-4", episodeId: "title-a:ep-1", amountKrw: 2_000, creatorId: "creator-9" }),
    ];
    const ranking = rankEpisodesByTips("creator-1", tips);
    expect(ranking).toHaveLength(2);
    expect(ranking[0]).toMatchObject({ episodeId: "title-a:ep-2", totalKrw: 15_000, rank: 1 });
    expect(ranking[1]).toMatchObject({ episodeId: "title-a:ep-1", totalKrw: 1_000, rank: 2 });
  });
});
