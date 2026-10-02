/**
 * 에셋 포인트 스토어·트리거 테스트 — 적립/사용/환불의 상태 전이와
 * 트리거 중복 호출 안전성을 검증한다.
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { computeBalance } from "./asset-points-ledger";
import { useAssetPointsStore } from "./asset-points-store";
import {
  awardCutsClipPublished,
  awardDailyLoginBonus,
} from "./asset-points-triggers";

function day(year: number, month: number, date: number): Date {
  return new Date(year, month - 1, date, 12, 0, 0, 0);
}

beforeEach(() => {
  localStorage.clear();
  useAssetPointsStore.getState().resetForTests();
});

describe("earn", () => {
  it("알 수 없는 규칙은 적립하지 않는다", () => {
    const result = useAssetPointsStore.getState().earn("nope", "ref", day(2026, 10, 2));
    expect(result).toEqual({ granted: false, reason: "unknown-rule" });
    expect(useAssetPointsStore.getState().events).toHaveLength(0);
  });
});

describe("로그인 보너스 트리거", () => {
  it("같은 날 두 번 불러도 한 번만 적립된다", () => {
    const now = day(2026, 10, 2);
    expect(awardDailyLoginBonus(now)).toEqual({ granted: true, points: 10 });
    expect(awardDailyLoginBonus(now).granted).toBe(false);
    expect(computeBalance(useAssetPointsStore.getState().events, now)).toBe(10);
  });

  it("다음 날에는 다시 적립된다", () => {
    expect(awardDailyLoginBonus(day(2026, 10, 2)).granted).toBe(true);
    expect(awardDailyLoginBonus(day(2026, 10, 3)).granted).toBe(true);
    expect(computeBalance(useAssetPointsStore.getState().events, day(2026, 10, 3))).toBe(20);
  });
});

describe("컷츠 게시 트리거", () => {
  it("같은 클립은 한 번만, 하루 최대 2개까지 적립된다", () => {
    const now = day(2026, 10, 2);
    expect(awardCutsClipPublished("clip-1", now)).toEqual({ granted: true, points: 30 });
    expect(awardCutsClipPublished("clip-1", now)).toEqual({
      granted: false,
      reason: "duplicate",
    });
    expect(awardCutsClipPublished("clip-2", now).granted).toBe(true);
    expect(awardCutsClipPublished("clip-3", now)).toEqual({
      granted: false,
      reason: "daily-cap",
    });
  });
});

describe("spend·refund", () => {
  it("구매하면 차감되고, 환불은 한 번만 되며 잔액이 복원된다", () => {
    const now = day(2026, 10, 2);
    awardCutsClipPublished("clip-1", now);
    const store = useAssetPointsStore.getState();

    const spent = store.spendForResource({
      resourceId: "res-1",
      resourceName: "브러시 팩",
      pointPrice: 30,
      now,
    });
    expect(spent.ok).toBe(true);
    if (!spent.ok) throw new Error("구매 실패");
    expect(computeBalance(useAssetPointsStore.getState().events, now)).toBe(0);

    expect(useAssetPointsStore.getState().refundSpend(spent.eventId, now)).toBe(true);
    expect(useAssetPointsStore.getState().refundSpend(spent.eventId, now)).toBe(false);
    expect(computeBalance(useAssetPointsStore.getState().events, now)).toBe(30);
  });

  it("잔액이 부족하면 차감되지 않는다", () => {
    const now = day(2026, 10, 2);
    const result = useAssetPointsStore.getState().spendForResource({
      resourceId: "res-1",
      resourceName: "브러시 팩",
      pointPrice: 10,
      now,
    });
    expect(result).toEqual({ ok: false, reason: "insufficient" });
    expect(useAssetPointsStore.getState().events).toHaveLength(0);
  });
});
