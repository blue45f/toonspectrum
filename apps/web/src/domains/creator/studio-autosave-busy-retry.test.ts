import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioAutosaveBusyRetry,
  resetStudioAutosaveBusyRetryBackoff,
  STUDIO_AUTOSAVE_BUSY_RETRY_MAX_MS,
  studioAutosaveBusyRetryDelay,
} from "./studio-autosave-busy-retry";
import {
  getStudioReliabilityStatusSnapshot,
  reportStudioReliabilitySignal,
  resetStudioReliabilityStatus,
} from "./studio-reliability-status-store";

afterEach(() => {
  resetStudioAutosaveBusyRetryBackoff();
  resetStudioReliabilityStatus();
  vi.useRealTimers();
});

describe("autosave retry after a temporary writer conflict", () => {
  it("requests a fresh snapshot after the old writer expires without another edit", () => {
    vi.useFakeTimers();
    let latestPage = { hidden: true, strokeIds: ["first"] };
    const persisted: typeof latestPage[] = [];
    const writerExpiresAt = Date.now() + 30_000;
    let current: ReturnType<typeof createStudioAutosaveBusyRetry> | undefined;

    function saveCurrentPage() {
      current?.dispose();
      current = createStudioAutosaveBusyRetry({
        isCurrent: () => true,
        requestRetry: saveCurrentPage,
      });
      if (Date.now() < writerExpiresAt) current.schedule();
      else persisted.push(latestPage);
    }

    saveCurrentPage();
    vi.advanceTimersByTime(15_000);
    expect(persisted).toEqual([]);

    latestPage = { hidden: false, strokeIds: ["first", "after-recovery"] };
    saveCurrentPage();
    vi.advanceTimersByTime(15_000);

    expect(persisted).toEqual([latestPage]);
    expect(vi.getTimerCount()).toBe(0);
    current!.dispose();
  });

  it("uses bounded exponential backoff for autonomous lock contention", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T00:00:00.000Z"));
    const startedAt = Date.now();
    const retryTimes: number[] = [];
    let current: ReturnType<typeof createStudioAutosaveBusyRetry> | undefined;

    function run() {
      current?.dispose();
      current = createStudioAutosaveBusyRetry({
        isCurrent: () => true,
        requestRetry: () => {
          retryTimes.push(Date.now() - startedAt);
          run();
        },
      });
      current.schedule();
    }

    run();
    vi.advanceTimersByTime(23_000);

    expect(retryTimes).toEqual([1_000, 3_000, 7_000, 15_000, 23_000]);
    expect(studioAutosaveBusyRetryDelay(99)).toBe(STUDIO_AUTOSAVE_BUSY_RETRY_MAX_MS);
    current!.dispose();
  });

  it("resets to the fast path when a fresh edit replaces a pending retry", () => {
    vi.useFakeTimers();
    const firstRequest = vi.fn();
    const first = createStudioAutosaveBusyRetry({
      isCurrent: () => true,
      requestRetry: firstRequest,
    });
    first.schedule();
    vi.advanceTimersByTime(1_000);
    expect(firstRequest).toHaveBeenCalledOnce();
    first.dispose();

    const backedOffRequest = vi.fn();
    const backedOff = createStudioAutosaveBusyRetry({
      isCurrent: () => true,
      requestRetry: backedOffRequest,
    });
    backedOff.schedule();
    vi.advanceTimersByTime(500);
    backedOff.dispose();

    const freshRequest = vi.fn();
    const fresh = createStudioAutosaveBusyRetry({
      isCurrent: () => true,
      requestRetry: freshRequest,
    });
    fresh.schedule();
    vi.advanceTimersByTime(999);
    expect(freshRequest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(freshRequest).toHaveBeenCalledOnce();
    fresh.dispose();
  });

  it("returns to the fast path after a quiet contention window", () => {
    vi.useFakeTimers();
    const first = createStudioAutosaveBusyRetry({
      isCurrent: () => true,
      requestRetry: vi.fn(),
    });
    first.schedule();
    vi.advanceTimersByTime(1_000);
    first.dispose();

    vi.advanceTimersByTime(30_000);
    const requestRetry = vi.fn();
    const next = createStudioAutosaveBusyRetry({
      isCurrent: () => true,
      requestRetry,
    });
    next.schedule();
    vi.advanceTimersByTime(999);
    expect(requestRetry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(requestRetry).toHaveBeenCalledOnce();
    next.dispose();
  });

  it("surfaces contention in the reliability rail and preserves newer failures", () => {
    vi.useFakeTimers();
    const retry = createStudioAutosaveBusyRetry({
      isCurrent: () => true,
      requestRetry: vi.fn(),
      now: () => 10,
    });
    retry.schedule();

    expect(getStudioReliabilityStatusSnapshot().save).toMatchObject({
      level: "degraded",
      title: "임시저장 잠금을 기다리고 있습니다",
      detail: expect.stringContaining("1초 후"),
    });

    reportStudioReliabilitySignal({
      channel: "save",
      level: "failed",
      title: "임시저장에 실패했습니다",
      at: 11,
    });
    retry.dispose();

    expect(getStudioReliabilityStatusSnapshot().save).toMatchObject({
      level: "failed",
      title: "임시저장에 실패했습니다",
    });
  });

  it("cancels both pending and late failures when a document effect is replaced", () => {
    vi.useFakeTimers();
    const requestRetry = vi.fn();
    const retry = createStudioAutosaveBusyRetry({
      isCurrent: () => true,
      requestRetry,
    });
    retry.schedule();
    retry.dispose();
    retry.schedule();
    vi.runAllTimers();

    expect(requestRetry).not.toHaveBeenCalled();
    expect(getStudioReliabilityStatusSnapshot().save).toBeNull();
  });

  it("does not retry writes after losing document leadership or unmounting", () => {
    vi.useFakeTimers();
    let current = true;
    const requestRetry = vi.fn();
    const retry = createStudioAutosaveBusyRetry({
      isCurrent: () => current,
      requestRetry,
    });
    retry.schedule();
    current = false;
    vi.advanceTimersByTime(1_000);
    retry.schedule();

    expect(requestRetry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(getStudioReliabilityStatusSnapshot().save).toBeNull();
  });

  it("coalesces conflicts into one retry per current effect", () => {
    vi.useFakeTimers();
    const requestRetry = vi.fn();
    const retry = createStudioAutosaveBusyRetry({
      isCurrent: () => true,
      requestRetry,
    });
    retry.schedule();
    retry.schedule();
    vi.advanceTimersByTime(1_000);

    expect(requestRetry).toHaveBeenCalledOnce();
    retry.dispose();
  });
});
