import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bindStudioRemoteReferenceImageDeliveryLease,
  StudioRemoteReferenceImageDeliveryAbortedError,
  StudioRemoteReferenceImageDeliveryBusyError,
  StudioRemoteReferenceImageDeliveryLimiter,
  StudioRemoteReferenceImageDeliveryWaitTimeoutError,
} from "./studio-remote-reference-image-delivery";

import type {
  StudioRemoteReferenceImageDeliveryLease,
  StudioRemoteReferenceImageResponseLifecycle,
} from "./studio-remote-reference-image-delivery";

class TestResponseLifecycle extends EventEmitter implements StudioRemoteReferenceImageResponseLifecycle {
  writableEnded = false;
  destroyed = false;
  readonly destroyErrors: Array<Error | undefined> = [];

  finish(): void {
    this.writableEnded = true;
    this.emit("finish");
  }

  close(): void {
    this.destroyed = true;
    this.emit("close");
  }

  destroy(error?: Error): void {
    this.destroyErrors.push(error);
    this.close();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StudioRemoteReferenceImageDeliveryLimiter", () => {
  it("waits in FIFO order without retaining more active delivery leases", async () => {
    const limiter = new StudioRemoteReferenceImageDeliveryLimiter(1, 2);
    const first = await limiter.acquire(new AbortController().signal);
    const secondPromise = limiter.acquire(new AbortController().signal);
    const thirdPromise = limiter.acquire(new AbortController().signal);
    expect(limiter.activeCount).toBe(1);
    expect(limiter.pendingCount).toBe(2);

    first.release();
    const second = await secondPromise;
    expect(limiter.activeCount).toBe(1);
    expect(limiter.pendingCount).toBe(1);

    second.release();
    const third = await thirdPromise;
    expect(limiter.activeCount).toBe(1);
    expect(limiter.pendingCount).toBe(0);
    third.release();
    expect(limiter.activeCount).toBe(0);
  });

  it("removes an aborted waiter and never grants it a later lease", async () => {
    const limiter = new StudioRemoteReferenceImageDeliveryLimiter(1, 1);
    const first = await limiter.acquire(new AbortController().signal);
    const waitingController = new AbortController();
    const waiting = limiter.acquire(waitingController.signal);
    expect(limiter.pendingCount).toBe(1);

    waitingController.abort();
    await expect(waiting).rejects.toBeInstanceOf(
      StudioRemoteReferenceImageDeliveryAbortedError
    );
    expect(limiter.pendingCount).toBe(0);
    first.release();
    expect(limiter.activeCount).toBe(0);
  });

  it("fails closed when the bounded waiting queue is full", async () => {
    const limiter = new StudioRemoteReferenceImageDeliveryLimiter(1, 0);
    const first = await limiter.acquire(new AbortController().signal);
    await expect(limiter.acquire(new AbortController().signal))
      .rejects.toBeInstanceOf(StudioRemoteReferenceImageDeliveryBusyError);
    first.release();
  });

  it("releases once when response finish and close are both observed", async () => {
    const limiter = new StudioRemoteReferenceImageDeliveryLimiter(1, 0);
    const originalLease = await limiter.acquire(new AbortController().signal);
    const release = vi.fn(() => originalLease.release());
    const lease: StudioRemoteReferenceImageDeliveryLease = { release };
    const response = new TestResponseLifecycle();

    expect(bindStudioRemoteReferenceImageDeliveryLease(response, lease)).toBe(true);
    response.finish();
    response.close();

    expect(release).toHaveBeenCalledOnce();
    expect(limiter.activeCount).toBe(0);
  });

  it("does not retain a lease for an already closed response", async () => {
    const limiter = new StudioRemoteReferenceImageDeliveryLimiter(1, 0);
    const lease = await limiter.acquire(new AbortController().signal);
    const response = new TestResponseLifecycle();
    response.close();

    expect(bindStudioRemoteReferenceImageDeliveryLease(response, lease)).toBe(false);
    expect(limiter.activeCount).toBe(0);
  });

  it("destroys a slow response at its deadline before granting the next FIFO lease", async () => {
    vi.useFakeTimers();
    const limiter = new StudioRemoteReferenceImageDeliveryLimiter(1, 1, 1_000);
    const first = await limiter.acquire(new AbortController().signal);
    const response = new TestResponseLifecycle();
    expect(bindStudioRemoteReferenceImageDeliveryLease(response, first, 100)).toBe(true);
    const secondPromise = limiter.acquire(new AbortController().signal);
    expect(limiter.pendingCount).toBe(1);

    await vi.advanceTimersByTimeAsync(100);
    const second = await secondPromise;
    expect(response.destroyErrors).toHaveLength(1);
    expect(response.destroyErrors[0]?.message).toContain("deadline exceeded");
    expect(limiter.activeCount).toBe(1);
    expect(limiter.pendingCount).toBe(0);
    second.release();
    expect(limiter.activeCount).toBe(0);
  });

  it("clears a delivery deadline after finish so it cannot later destroy the response", async () => {
    vi.useFakeTimers();
    const limiter = new StudioRemoteReferenceImageDeliveryLimiter(1, 0);
    const originalLease = await limiter.acquire(new AbortController().signal);
    const release = vi.fn(() => originalLease.release());
    const response = new TestResponseLifecycle();
    bindStudioRemoteReferenceImageDeliveryLease(response, { release }, 100);

    response.finish();
    await vi.advanceTimersByTimeAsync(200);
    response.close();
    expect(response.destroyErrors).toHaveLength(0);
    expect(release).toHaveBeenCalledOnce();
    expect(limiter.activeCount).toBe(0);
  });

  it("times out a pending acquisition and clears a granted waiter's timer", async () => {
    vi.useFakeTimers();
    const limiter = new StudioRemoteReferenceImageDeliveryLimiter(1, 1, 50);
    const first = await limiter.acquire(new AbortController().signal);
    const timedOut = limiter.acquire(new AbortController().signal);
    const timedOutAssertion = expect(timedOut).rejects.toBeInstanceOf(
      StudioRemoteReferenceImageDeliveryWaitTimeoutError
    );
    await vi.advanceTimersByTimeAsync(50);
    await timedOutAssertion;
    expect(limiter.pendingCount).toBe(0);

    const granted = limiter.acquire(new AbortController().signal);
    first.release();
    const second = await granted;
    await vi.advanceTimersByTimeAsync(100);
    expect(limiter.activeCount).toBe(1);
    expect(limiter.pendingCount).toBe(0);
    second.release();
  });
});
