import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioGpuPinReceiptWatchdog } from "./studio-webgpu-pin-receipt-watchdog";

afterEach(() => {
  vi.useRealTimers();
});

describe("StudioGpuPinReceiptWatchdog", () => {
  it("keeps an absolute first-visible deadline during a 60 Hz append burst", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    for (let frame = 2; frame <= 19; frame += 1) {
      vi.advanceTimersByTime(16);
      watchdog.request(`frame:${frame}`);
    }
    vi.advanceTimersByTime(12);

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith("first-visible", "frame:19");
  });

  it("does not let later requests extend the first post-visible progress deadline", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    expect(watchdog.receipt("frame:1")).toBe(true);
    watchdog.request("frame:2");
    vi.advanceTimersByTime(200);
    watchdog.request("frame:3");
    vi.advanceTimersByTime(100);

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith("progress", "frame:3");
  });

  it("clears a deadline only for the exact current receipt", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    watchdog.request("frame:2");
    expect(watchdog.hasExactReceipt("frame:2")).toBe(false);
    expect(watchdog.receipt("frame:1")).toBe(false);
    vi.advanceTimersByTime(299);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(watchdog.receipt("frame:2")).toBe(true);
    expect(watchdog.hasExactReceipt("frame:2")).toBe(true);
    vi.advanceTimersByTime(1);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("accepts a synchronous receipt recorded just before the request is armed", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    expect(watchdog.receipt("frame:1")).toBe(false);
    watchdog.begin("frame:1");
    vi.advanceTimersByTime(300);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
