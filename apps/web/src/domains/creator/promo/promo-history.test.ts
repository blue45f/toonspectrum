import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_PROMO_HISTORY_META,
  createPromoHistoryTracker,
  nextPromoHistoryMeta,
  pushPromoSnapshot,
  shouldPushPromoUndo,
} from "./promo-history";

describe("promo-history 병합 판정", () => {
  it("병합 키가 없는 이산 편집은 항상 스냅샷을 쌓는다", () => {
    const meta = nextPromoHistoryMeta("field:title", 1_000);
    expect(shouldPushPromoUndo(meta, undefined, 1_100)).toBe(true);
  });

  it("같은 키의 연속 편집은 시간 창 안에서는 스냅샷을 쌓지 않는다", () => {
    const meta = nextPromoHistoryMeta("field:title", 1_000);
    expect(shouldPushPromoUndo(meta, "field:title", 1_500)).toBe(false);
    expect(shouldPushPromoUndo(meta, "field:title", 2_199)).toBe(false);
  });

  it("시간 창이 지나면 같은 키라도 새 스냅샷을 쌓는다", () => {
    const meta = nextPromoHistoryMeta("field:title", 1_000);
    expect(shouldPushPromoUndo(meta, "field:title", 2_200)).toBe(true);
  });

  it("다른 키의 편집은 시간 창 안이라도 새 스냅샷을 쌓는다", () => {
    const meta = nextPromoHistoryMeta("field:title", 1_000);
    expect(shouldPushPromoUndo(meta, "field:synopsis", 1_100)).toBe(true);
  });

  it("초기 메타에서는 어떤 편집도 스냅샷을 쌓는다", () => {
    expect(shouldPushPromoUndo(EMPTY_PROMO_HISTORY_META, "field:title", 500)).toBe(true);
  });

  it("스냅샷 스택은 상한을 유지한다", () => {
    let history: number[] = [];
    for (let i = 0; i < 40; i += 1) history = pushPromoSnapshot(history, i);
    expect(history).toHaveLength(30);
    expect(history[0]).toBe(10);
    expect(history.at(-1)).toBe(39);
  });

  it("트래커는 연속 입력을 병합하고 reset 뒤에는 다시 쌓는다", () => {
    const nowSpy = vi.spyOn(Date, "now");
    try {
      const tracker = createPromoHistoryTracker();
      nowSpy.mockReturnValue(1_000);
      expect(tracker.shouldPush("field:title")).toBe(true);
      nowSpy.mockReturnValue(1_400);
      expect(tracker.shouldPush("field:title")).toBe(false);
      tracker.reset();
      nowSpy.mockReturnValue(1_500);
      expect(tracker.shouldPush("field:title")).toBe(true);
      nowSpy.mockReturnValue(3_000);
      expect(tracker.shouldPush("field:title")).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
