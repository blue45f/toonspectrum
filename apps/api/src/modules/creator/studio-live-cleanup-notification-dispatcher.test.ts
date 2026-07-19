import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioLiveCleanupNotificationDispatcher } from "./studio-live-cleanup-notification-dispatcher";

function createDispatcher() {
  const dispatcher = new StudioLiveCleanupNotificationDispatcher();
  const logger = (
    dispatcher as unknown as { logger: { warn: (...arguments_: unknown[]) => void } }
  ).logger;
  vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  return dispatcher;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StudioLiveCleanupNotificationDispatcher", () => {
  it("keeps same-target tombstones FIFO while an adapter retry is pending", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const dispatcher = createDispatcher();
    const deliveries: string[] = [];
    let voiceFailures = 1;

    dispatcher.dispatch({
      target: "studio-live:work-1",
      event: "studio:voice:leave",
      retry: "bounded",
      isStillRelevant: () => true,
      deliver() {
        deliveries.push("voice");
        if (voiceFailures > 0) {
          voiceFailures -= 1;
          throw new Error("adapter unavailable");
        }
      },
    });
    dispatcher.dispatch({
      target: "studio-live:work-1",
      event: "studio:presence:leave",
      retry: "bounded",
      isStillRelevant: () => true,
      deliver: () => deliveries.push("presence"),
    });

    expect(deliveries).toEqual(["voice"]);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(50);
    expect(deliveries).toEqual(["voice", "voice", "presence"]);
    expect(vi.getTimerCount()).toBe(0);
    dispatcher.onModuleDestroy();
  });

  it("does not let one failed room block another target", () => {
    vi.useFakeTimers();
    const dispatcher = createDispatcher();
    const delivered = vi.fn();

    dispatcher.dispatch({
      target: "studio-live:work-failed",
      event: "studio:presence:leave",
      retry: "bounded",
      isStillRelevant: () => true,
      deliver() {
        throw new Error("adapter unavailable");
      },
    });
    dispatcher.dispatch({
      target: "studio-live:work-healthy",
      event: "studio:presence:leave",
      retry: "bounded",
      isStillRelevant: () => true,
      deliver: delivered,
    });

    expect(delivered).toHaveBeenCalledOnce();
    dispatcher.onModuleDestroy();
  });

  it("drops a delayed tombstone after a newer local incarnation supersedes it", () => {
    vi.useFakeTimers();
    const dispatcher = createDispatcher();
    const deliver = vi.fn(() => {
      throw new Error("adapter unavailable");
    });
    let relevant = true;
    dispatcher.dispatch({
      target: "studio-live:work-1",
      event: "studio:presence:leave",
      retry: "bounded",
      isStillRelevant: () => relevant,
      deliver,
    });

    relevant = false;
    vi.runAllTimers();

    expect(deliver).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    dispatcher.onModuleDestroy();
  });

  it("makes only two delayed attempts before dropping a failed tombstone", () => {
    vi.useFakeTimers();
    const dispatcher = createDispatcher();
    const deliver = vi.fn(() => {
      throw new Error("adapter unavailable");
    });

    dispatcher.dispatch({
      target: "studio-live:work-1",
      event: "studio:presence:leave",
      retry: "bounded",
      isStillRelevant: () => true,
      deliver,
    });
    expect(deliver).toHaveBeenCalledTimes(1);

    vi.runAllTimers();

    expect(deliver).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    dispatcher.onModuleDestroy();
  });

  it("never retries a terminal access notification", () => {
    vi.useFakeTimers();
    const dispatcher = createDispatcher();
    const deliver = vi.fn(() => {
      throw new Error("socket is closing");
    });

    expect(() =>
      dispatcher.dispatch({
        target: "socket-1",
        event: "studio:access:revoked",
        retry: "none",
        deliver,
      })
    ).not.toThrow();
    vi.runAllTimers();

    expect(deliver).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    dispatcher.onModuleDestroy();
  });

  it("cancels its sole retry timer and drops callbacks on module destroy", () => {
    vi.useFakeTimers();
    const dispatcher = createDispatcher();
    const deliver = vi.fn(() => {
      throw new Error("adapter unavailable");
    });
    dispatcher.dispatch({
      target: "studio-live:work-1",
      event: "studio:presence:leave",
      retry: "bounded",
      isStillRelevant: () => true,
      deliver,
    });

    expect(vi.getTimerCount()).toBe(1);
    dispatcher.onModuleDestroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(deliver).toHaveBeenCalledOnce();
  });

  it("bounds queued adapter work even when every target is unavailable", () => {
    vi.useFakeTimers();
    const dispatcher = createDispatcher();
    for (let index = 0; index < 600; index += 1) {
      dispatcher.dispatch({
        target: `studio-live:work-${index}`,
        event: "studio:presence:leave",
        retry: "bounded",
        isStillRelevant: () => true,
        deliver() {
          throw new Error("adapter unavailable");
        },
      });
    }
    const internals = dispatcher as unknown as {
      pendingCount: number;
      pendingByTarget: Map<string, unknown[]>;
      retryTimer: unknown;
    };

    expect(internals.pendingCount).toBe(512);
    expect(internals.pendingByTarget.size).toBe(512);
    expect(internals.retryTimer).not.toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    dispatcher.onModuleDestroy();
  });
});
