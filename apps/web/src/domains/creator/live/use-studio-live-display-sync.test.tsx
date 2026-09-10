// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioLiveSyncPhase, StudioLiveSyncSnapshot } from "./studio-live-sync-safety";

import {
  STUDIO_LIVE_DISPLAY_SYNC_THROTTLE_MS,
  useStudioLiveDisplaySync,
} from "./use-studio-live-display-sync";

function syncSnapshot(
  phase: StudioLiveSyncPhase,
  overrides: Partial<StudioLiveSyncSnapshot> = {}
): StudioLiveSyncSnapshot {
  return {
    phase,
    pendingCount: 0,
    persistenceDurability: "durable",
    transportReady: true,
    operationSyncReady: true,
    lastAckAt: 1_000,
    lastAckServerSequence: "1",
    editsDurablyProtected: true,
    message: phase,
    mode: "server",
    ...overrides,
  };
}

describe("useStudioLiveDisplaySync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("suppresses brief transient phase changes and settles on the latest phase", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: StudioLiveSyncSnapshot }) =>
        useStudioLiveDisplaySync(snapshot),
      { initialProps: { snapshot: syncSnapshot("synced") } }
    );

    rerender({ snapshot: syncSnapshot("retrying", { pendingCount: 3 }) });
    expect(result.current?.phase).toBe("synced");

    act(() => vi.advanceTimersByTime(449));
    expect(result.current?.phase).toBe("synced");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current?.phase).toBe("retrying");
    expect(result.current?.pendingCount).toBe(3);

    rerender({ snapshot: syncSnapshot("syncing", { pendingCount: 2 }) });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current?.phase).toBe("retrying");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current?.phase).toBe("syncing");

    rerender({ snapshot: syncSnapshot("synced", { lastAckAt: 2_000 }) });
    act(() => vi.advanceTimersByTime(649));
    expect(result.current?.phase).toBe("syncing");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current?.phase).toBe("synced");
    expect(result.current?.lastAckAt).toBe(2_000);
  });

  it("applies critical phase transitions immediately", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: StudioLiveSyncSnapshot }) =>
        useStudioLiveDisplaySync(snapshot),
      { initialProps: { snapshot: syncSnapshot("synced") } }
    );

    rerender({
      snapshot: syncSnapshot("durability-risk", {
        editsDurablyProtected: false,
        persistenceDurability: "degraded",
      }),
    });

    expect(result.current?.phase).toBe("durability-risk");
    expect(result.current?.editsDurablyProtected).toBe(false);
  });

  it("trailing-throttles count churn within the same visible phase", () => {
    const { result, rerender } = renderHook(
      ({ snapshot }: { snapshot: StudioLiveSyncSnapshot }) =>
        useStudioLiveDisplaySync(snapshot),
      { initialProps: { snapshot: syncSnapshot("syncing") } }
    );

    act(() => vi.advanceTimersByTime(40));
    rerender({ snapshot: syncSnapshot("syncing", { pendingCount: 1 }) });
    expect(result.current?.pendingCount).toBe(0);

    act(() => vi.advanceTimersByTime(60));
    rerender({ snapshot: syncSnapshot("syncing", { pendingCount: 2 }) });
    expect(result.current?.pendingCount).toBe(0);

    act(() => vi.advanceTimersByTime(STUDIO_LIVE_DISPLAY_SYNC_THROTTLE_MS - 101));
    expect(result.current?.pendingCount).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current?.pendingCount).toBe(2);
  });
});
