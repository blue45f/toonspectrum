import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioAutosaveBusyRetry } from "./studio-autosave-busy-retry";

afterEach(() => vi.useRealTimers());

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

  it("cancels both pending and late failures when a document effect is replaced", () => {
    vi.useFakeTimers();
    const requestRetry = vi.fn();
    const retry = createStudioAutosaveBusyRetry({ isCurrent: () => true, requestRetry });
    retry.schedule();
    retry.dispose();
    retry.schedule();
    vi.runAllTimers();
    expect(requestRetry).not.toHaveBeenCalled();
  });

  it("does not retry writes after losing document leadership or unmounting", () => {
    vi.useFakeTimers();
    let current = true;
    const requestRetry = vi.fn();
    const retry = createStudioAutosaveBusyRetry({ isCurrent: () => current, requestRetry });
    retry.schedule();
    current = false;
    vi.advanceTimersByTime(1000);
    retry.schedule();
    expect(requestRetry).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("coalesces conflicts into one retry per current effect", () => {
    vi.useFakeTimers();
    const requestRetry = vi.fn();
    const retry = createStudioAutosaveBusyRetry({ isCurrent: () => true, requestRetry });
    retry.schedule();
    retry.schedule();
    vi.advanceTimersByTime(1000);
    expect(requestRetry).toHaveBeenCalledOnce();
    retry.dispose();
  });
});
