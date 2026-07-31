import { describe, expect, it } from "vitest";

import {
  canBufferFrame,
  computeReplayPrefixCutoff,
  evaluatePublishTiming,
  evaluateRateBudget,
  isClientSequenceAccepted,
  planReplay,
  resolveHibernatableBufferedAmount,
  resolveRealtimeRoomLimits,
  selectNextAlarmAt,
} from "./room-core";

describe("realtime room core", () => {
  it("resolves explicit bounded capacity and replay limits", () => {
    expect(
      resolveRealtimeRoomLimits({
        REALTIME_MAX_CONNECTIONS_PER_ROOM: "96",
        REALTIME_MAX_CONNECTIONS_PER_ACTOR: "3",
        REALTIME_MAX_BUFFERED_BYTES: "524288",
        REALTIME_MAX_REPLAY_EVENTS: "4096",
        REALTIME_MAX_RECEIPT_COUNT: "8192",
        REALTIME_MAX_RECEIPT_BYTES: "67108864",
        REALTIME_EVENT_RETENTION_MS: "1800000",
        REALTIME_CLEANUP_INTERVAL_MS: "30000",
        REALTIME_RATE_WINDOW_MS: "5000",
        REALTIME_RESUME_WINDOW_MS: "4000",
        REALTIME_RESUME_MAX_REQUESTS_PER_WINDOW: "12",
        REALTIME_RESUME_MAX_BYTES_PER_WINDOW: "2097152",
        REALTIME_PRESENCE_MAX_EVENTS_PER_WINDOW: "600",
        REALTIME_PRESENCE_MAX_BYTES_PER_WINDOW: "2097152",
        REALTIME_COMMENTS_MAX_EVENTS_PER_WINDOW: "30",
        REALTIME_COMMENTS_MAX_BYTES_PER_WINDOW: "131072",
        REALTIME_SCREEN_MAX_EVENTS_PER_WINDOW: "200",
        REALTIME_SCREEN_MAX_BYTES_PER_WINDOW: "2097152",
      }),
    ).toEqual({
      maxConnectionsPerRoom: 96,
      maxConnectionsPerActor: 3,
      maxBufferedBytes: 524_288,
      maxReplayEvents: 4_096,
      maxReceiptCount: 8_192,
      maxReceiptBytes: 67_108_864,
      eventRetentionMs: 1_800_000,
      cleanupIntervalMs: 30_000,
      rateWindowMs: 5_000,
      resumeWindowMs: 4_000,
      resumeRateLimit: {
        maximumEvents: 12,
        maximumBytes: 2_097_152,
      },
      channelRateLimits: {
        presence: {
          maximumEvents: 600,
          maximumBytes: 2_097_152,
        },
        comments: {
          maximumEvents: 30,
          maximumBytes: 131_072,
        },
        "screen-signaling": {
          maximumEvents: 200,
          maximumBytes: 2_097_152,
        },
      },
    });
  });

  it("fails closed on malformed or unsafe limit configuration", () => {
    expect(() =>
      resolveRealtimeRoomLimits({
        REALTIME_MAX_CONNECTIONS_PER_ROOM: "unlimited",
      }),
    ).toThrow(/positive base-10 integer/u);
    expect(() =>
      resolveRealtimeRoomLimits({
        REALTIME_MAX_CONNECTIONS_PER_ROOM: "1000",
      }),
    ).toThrow(/supported range/u);
  });

  it("distinguishes complete, resumable and replay-gap ranges", () => {
    expect(planReplay(10, 10, 4)).toMatchObject({ kind: "empty" });
    expect(planReplay(11, 10, 4)).toMatchObject({ kind: "future" });
    expect(planReplay(2, 10, 4)).toMatchObject({
      kind: "gap",
      fromSequence: 4,
    });
    expect(planReplay(3, 10, 4)).toMatchObject({
      kind: "page",
      fromSequence: 4,
    });
  });

  it("accepts only strictly increasing per-connection client sequences", () => {
    expect(isClientSequenceAccepted(4, 5)).toBe(true);
    expect(isClientSequenceAccepted(4, 4)).toBe(false);
    expect(isClientSequenceAccepted(4, 3)).toBe(false);
  });

  it("enforces clock and buffered-send bounds", () => {
    expect(evaluatePublishTiming(1_000, 1_000)).toEqual({ ok: true });
    expect(evaluatePublishTiming(0, 1_000, 500, 100)).toEqual({
      ok: false,
      code: "event-too-old",
    });
    expect(evaluatePublishTiming(1_200, 1_000, 500, 100)).toEqual({
      ok: false,
      code: "event-from-future",
    });
    expect(canBufferFrame(90, 10, 100)).toBe(true);
    expect(canBufferFrame(91, 10, 100)).toBe(false);
    expect(resolveHibernatableBufferedAmount(undefined)).toBe(0);
    expect(resolveHibernatableBufferedAmount(1024)).toBe(1024);
    expect(resolveHibernatableBufferedAmount(Number.NaN)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(resolveHibernatableBufferedAmount(-1)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(resolveHibernatableBufferedAmount("0")).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("enforces actor-channel event and byte budgets and resets windows", () => {
    const limit = { maximumEvents: 2, maximumBytes: 100 };
    const first = evaluateRateBudget(null, 1_000, 40, 1_000, limit);
    expect(first).toMatchObject({
      ok: true,
      state: { eventCount: 1, byteCount: 40 },
      expiresAtMs: 2_000,
    });
    if (!first.ok) {
      throw new Error("Expected first rate admission");
    }
    const second = evaluateRateBudget(
      first.state,
      1_500,
      60,
      1_000,
      limit,
    );
    expect(second).toMatchObject({
      ok: true,
      state: { eventCount: 2, byteCount: 100 },
    });
    if (!second.ok) {
      throw new Error("Expected second rate admission");
    }
    expect(
      evaluateRateBudget(second.state, 1_600, 1, 1_000, limit),
    ).toEqual({ ok: false, retryAtMs: 2_000 });
    expect(
      evaluateRateBudget(second.state, 2_000, 80, 1_000, limit),
    ).toMatchObject({
      ok: true,
      state: {
        windowStartedAtMs: 2_000,
        eventCount: 1,
        byteCount: 80,
      },
    });
  });

  it("prunes a complete replay prefix for expiry and count bounds", () => {
    expect(computeReplayPrefixCutoff(3_000, 2_048, 0)).toBe(952);
    expect(computeReplayPrefixCutoff(3_000, 2_048, 1_400)).toBe(1_400);
    expect(computeReplayPrefixCutoff(3_000, 2_048, 9_999)).toBe(3_000);
  });

  it("schedules cleanup or the nearest connection expiry without polling", () => {
    expect(selectNextAlarmAt(1_000, 60_000, false, [])).toBeNull();
    expect(
      selectNextAlarmAt(1_000, 60_000, true, [120_000, 30_000]),
    ).toBe(30_000);
    expect(
      selectNextAlarmAt(1_000, 60_000, true, []),
    ).toBe(61_000);
  });
});
