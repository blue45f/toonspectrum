/**
 * 에셋 포인트 원장·정책 테스트 — 적립 중복 방지·일일 상한·만료·FIFO 차감·환불 검증.
 */

import { describe, expect, it } from "vitest";

import {
  pointPriceForKrw,
  assetPointEarnRule,
} from "./asset-points-policy";
import {
  computeBalance,
  countEarnsToday,
  createEarnEvent,
  createSpendEvent,
  createSpendRefundEvent,
  evaluateEarn,
  evaluateSpend,
  localDateKey,
  ownedResourceIds,
  summarizeAssetPoints,
  type AssetPointEvent,
} from "./asset-points-ledger";

/** 로컬 정오로 고정해 시간대 경계 흔들림을 없앤다. */
function day(year: number, month: number, date: number, hour = 12): Date {
  return new Date(year, month - 1, date, hour, 0, 0, 0);
}

let seq = 0;
function earn(key: string, sourceRef: string, now: Date): AssetPointEvent {
  const rule = assetPointEarnRule(key);
  if (!rule) throw new Error(`규칙 없음: ${key}`);
  seq += 1;
  return createEarnEvent({ id: `e${seq}`, rule, sourceRef, now });
}

function spend(resourceId: string, price: number, now: Date): AssetPointEvent {
  seq += 1;
  return createSpendEvent({
    id: `s${seq}`,
    resourceId,
    resourceName: resourceId,
    pointPrice: price,
    now,
  });
}

describe("pointPriceForKrw", () => {
  it("무료·이상 가격은 0P", () => {
    expect(pointPriceForKrw(0)).toBe(0);
    expect(pointPriceForKrw(-100)).toBe(0);
    expect(pointPriceForKrw(Number.NaN)).toBe(0);
  });

  it("100원당 1P로 올림하고 최소 가격을 보장한다", () => {
    expect(pointPriceForKrw(100)).toBe(10);
    expect(pointPriceForKrw(999)).toBe(10);
    expect(pointPriceForKrw(1000)).toBe(10);
    expect(pointPriceForKrw(1050)).toBe(11);
    expect(pointPriceForKrw(30000)).toBe(300);
  });
});

describe("evaluateEarn — 중복 방지와 일일 상한", () => {
  it("같은 활동·같은 sourceRef는 한 번만 인정한다", () => {
    const now = day(2026, 10, 2);
    const rule = assetPointEarnRule("cuts.clip.published")!;
    const events = [earn("cuts.clip.published", "cuts-clip:c1", now)];
    expect(evaluateEarn(events, rule, "cuts-clip:c1", now)).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(evaluateEarn(events, rule, "cuts-clip:c2", now)).toEqual({ ok: true });
  });

  it("일일 상한에 닿으면 거부하고, 다음 날에는 다시 허용한다", () => {
    const today = day(2026, 10, 2);
    const rule = assetPointEarnRule("cuts.clip.published")!; // 하루 2회
    const events = [
      earn("cuts.clip.published", "cuts-clip:c1", today),
      earn("cuts.clip.published", "cuts-clip:c2", today),
    ];
    expect(evaluateEarn(events, rule, "cuts-clip:c3", today)).toEqual({
      ok: false,
      reason: "daily-cap",
    });
    expect(evaluateEarn(events, rule, "cuts-clip:c3", day(2026, 10, 3))).toEqual({ ok: true });
    expect(countEarnsToday(events, "cuts.clip.published", today)).toBe(2);
    expect(countEarnsToday(events, "cuts.clip.published", day(2026, 10, 3))).toBe(0);
  });

  it("로그인 보너스는 날짜가 sourceRef라 같은 날 중복이 먼저 걸린다", () => {
    const now = day(2026, 10, 2);
    const rule = assetPointEarnRule("auth.login.daily")!;
    const ref = `login:${localDateKey(now)}`;
    const events = [earn("auth.login.daily", ref, now)];
    expect(evaluateEarn(events, rule, ref, now)).toEqual({ ok: false, reason: "duplicate" });
  });
});

describe("computeBalance — 만료와 FIFO 차감", () => {
  it("적립 합계에서 사용분을 뺀다", () => {
    const now = day(2026, 10, 2);
    const events = [
      earn("cuts.clip.published", "cuts-clip:c1", now),
      earn("cuts.clip.published", "cuts-clip:c2", now),
      spend("res-1", 25, now),
    ];
    expect(computeBalance(events, now)).toBe(35);
  });

  it("365일이 지난 적립은 잔액에서 사라진다", () => {
    const granted = day(2025, 10, 2);
    const events = [earn("auth.login.daily", "login:2025-10-02", granted)];
    expect(computeBalance(events, day(2026, 10, 1))).toBe(10);
    expect(computeBalance(events, day(2026, 10, 4))).toBe(0);
  });

  it("사용할 때는 만료가 가까운 lot부터 소진한다", () => {
    const first = earn("cuts.clip.published", "cuts-clip:old", day(2026, 1, 1));
    const second = earn("cuts.clip.published", "cuts-clip:new", day(2026, 6, 1));
    const events = [first, second, spend("res-1", 30, day(2026, 6, 2))];
    // 오래된 lot(2027-01-01 만료)이 먼저 소진돼, 2027년 2월에는 새 lot만 남는다.
    expect(computeBalance(events, day(2027, 2, 1))).toBe(30);
  });
});

describe("evaluateSpend·환불", () => {
  it("잔액이 부족하면 거부한다", () => {
    const now = day(2026, 10, 2);
    const events = [earn("auth.login.daily", "login:2026-10-02", now)];
    expect(evaluateSpend(events, "res-1", 50, now)).toEqual({
      ok: false,
      reason: "insufficient",
    });
  });

  it("이미 산 리소스는 이중 차감을 막고, 환불하면 다시 살 수 있다", () => {
    const now = day(2026, 10, 2);
    const purchase = spend("res-1", 10, now);
    const events = [earn("cuts.clip.published", "cuts-clip:c1", now), purchase];
    expect(evaluateSpend(events, "res-1", 10, now)).toEqual({
      ok: false,
      reason: "already-owned",
    });
    expect(ownedResourceIds(events).has("res-1")).toBe(true);

    const refund = createSpendRefundEvent({ id: "r1", spend: purchase, now });
    const afterRefund = [...events, refund];
    expect(ownedResourceIds(afterRefund).has("res-1")).toBe(false);
    expect(computeBalance(afterRefund, now)).toBe(30);
    expect(evaluateSpend(afterRefund, "res-1", 10, now)).toEqual({ ok: true });
  });
});

describe("summarizeAssetPoints", () => {
  it("누적 적립·사용(환불 차감)과 만료 임박분을 집계한다", () => {
    const now = day(2026, 10, 2);
    const purchase = spend("res-1", 10, now);
    const events = [
      earn("cuts.clip.published", "cuts-clip:c1", day(2025, 10, 20)),
      earn("cuts.clip.published", "cuts-clip:c2", now),
      purchase,
      createSpendRefundEvent({ id: "r1", spend: purchase, now }),
    ];
    const summary = summarizeAssetPoints(events, now);
    expect(summary.lifetimeEarned).toBe(60);
    expect(summary.lifetimeSpent).toBe(0);
    expect(summary.balance).toBe(60);
    // 사용 10P는 만료가 가까운 2025-10-20 적립분부터 빠지고, 환불분은 새 lot으로
    // 돌아오므로 만료 임박 잔여는 30 - 10 = 20P다.
    expect(summary.expiringSoonPoints).toBe(20);
    expect(summary.nextExpiryAt).not.toBeNull();
  });
});
