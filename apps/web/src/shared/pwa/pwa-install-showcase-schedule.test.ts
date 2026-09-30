// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  createPwaShowcaseScheduler,
  type PwaShowcaseScheduleState,
} from "./pwa-install-showcase-schedule";

const DAY = 24 * 60 * 60 * 1_000;

function createHarness(startAt = 0) {
  let now = startAt;
  let stored: PwaShowcaseScheduleState | null = null;
  const scheduler = createPwaShowcaseScheduler({
    now: () => now,
    read: () => stored,
    write: (state) => {
      stored = state;
    },
  });
  return {
    scheduler,
    advance: (ms: number) => {
      now += ms;
    },
    setNow: (value: number) => {
      now = value;
    },
    peek: () => stored,
  };
}

describe("pwa-install-showcase-schedule", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness(1_000);
  });

  it("첫 두 방문에서는 제안하지 않는다", () => {
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(false);
    harness.advance(DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(false);
  });

  it("세 번째 방문에서 제안한다", () => {
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    const result = harness.scheduler.recordVisit();
    expect(result.shouldPrompt).toBe(true);
    expect(result.trigger).toBe("visit-count");
    expect(result.visits).toBe(3);
  });

  it("같은 날 여러 방문은 방문 횟수를 올리지 않는다", () => {
    harness.scheduler.recordVisit();
    const second = harness.scheduler.recordVisit();
    expect(second.visits).toBe(1);
    expect(second.shouldPrompt).toBe(false);
  });

  it("제안 후 7일이 지나기 전에는 다시 제안하지 않는다", () => {
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(true);
    harness.advance(DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(false);
    harness.advance(7 * DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(true);
  });

  it("닫은 뒤 14일간은 다시 제안하지 않는다", () => {
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(true);
    harness.scheduler.recordDismissed();
    harness.advance(8 * DAY);
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(false);
    harness.advance(7 * DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(true);
  });

  it("설치 완료 후에는 다시 제안하지 않는다", () => {
    harness.scheduler.recordVisit();
    harness.scheduler.recordInstalled();
    harness.advance(30 * DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(false);
    expect(harness.scheduler.recordOfflineDetected()).toBe(false);
  });

  it("오프라인 감지 시 별도 쿨다운으로 제안한다", () => {
    expect(harness.scheduler.recordOfflineDetected()).toBe(true);
    // 같은 오프라인 세션(쿨다운 내)에서는 다시 제안하지 않는다
    expect(harness.scheduler.recordOfflineDetected()).toBe(false);
    harness.advance(8 * DAY);
    expect(harness.scheduler.recordOfflineDetected()).toBe(true);
  });

  it("오프라인 제안 후 닫으면 방문 제안도 쿨다운을 공유한다", () => {
    expect(harness.scheduler.recordOfflineDetected()).toBe(true);
    harness.scheduler.recordDismissed();
    harness.advance(DAY);
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    harness.scheduler.recordVisit();
    harness.advance(DAY);
    expect(harness.scheduler.recordVisit().shouldPrompt).toBe(false);
  });
});
