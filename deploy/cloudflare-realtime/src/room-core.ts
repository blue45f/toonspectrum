import {
  REALTIME_MAX_OUTBOUND_FRAME_BYTES,
  REALTIME_MAX_REPLAY_EVENTS_PER_FRAME,
  type RealtimeChannel,
  type RealtimeProtocolErrorCode,
} from "./protocol";

export interface RealtimeChannelRateLimit {
  readonly maximumEvents: number;
  readonly maximumBytes: number;
}

export type RealtimeChannelRateLimits = Readonly<
  Record<RealtimeChannel, RealtimeChannelRateLimit>
>;

export interface RealtimeRoomLimits {
  readonly maxConnectionsPerRoom: number;
  readonly maxConnectionsPerActor: number;
  readonly maxBufferedBytes: number;
  readonly maxReplayEvents: number;
  readonly maxReceiptCount: number;
  readonly maxReceiptBytes: number;
  readonly eventRetentionMs: number;
  readonly cleanupIntervalMs: number;
  readonly rateWindowMs: number;
  readonly resumeWindowMs: number;
  readonly resumeRateLimit: RealtimeChannelRateLimit;
  readonly channelRateLimits: RealtimeChannelRateLimits;
}

export const DEFAULT_REALTIME_ROOM_LIMITS: RealtimeRoomLimits = {
  maxConnectionsPerRoom: 64,
  maxConnectionsPerActor: 4,
  maxBufferedBytes: 256 * 1024,
  maxReplayEvents: 2_048,
  maxReceiptCount: 4_096,
  maxReceiptBytes: 32 * 1024 * 1024,
  eventRetentionMs: 15 * 60 * 1000,
  cleanupIntervalMs: 60 * 1000,
  rateWindowMs: 10 * 1000,
  resumeWindowMs: 10 * 1000,
  resumeRateLimit: {
    maximumEvents: 64,
    maximumBytes: 8 * 1024 * 1024,
  },
  channelRateLimits: {
    presence: {
      maximumEvents: 1_200,
      maximumBytes: 4 * 1024 * 1024,
    },
    comments: {
      maximumEvents: 60,
      maximumBytes: 256 * 1024,
    },
    "screen-signaling": {
      maximumEvents: 400,
      maximumBytes: 4 * 1024 * 1024,
    },
  },
};

interface RealtimeLimitEnvironment {
  readonly REALTIME_MAX_CONNECTIONS_PER_ROOM?: string;
  readonly REALTIME_MAX_CONNECTIONS_PER_ACTOR?: string;
  readonly REALTIME_MAX_BUFFERED_BYTES?: string;
  readonly REALTIME_MAX_REPLAY_EVENTS?: string;
  readonly REALTIME_MAX_RECEIPT_COUNT?: string;
  readonly REALTIME_MAX_RECEIPT_BYTES?: string;
  readonly REALTIME_EVENT_RETENTION_MS?: string;
  readonly REALTIME_CLEANUP_INTERVAL_MS?: string;
  readonly REALTIME_RATE_WINDOW_MS?: string;
  readonly REALTIME_RESUME_WINDOW_MS?: string;
  readonly REALTIME_RESUME_MAX_REQUESTS_PER_WINDOW?: string;
  readonly REALTIME_RESUME_MAX_BYTES_PER_WINDOW?: string;
  readonly REALTIME_PRESENCE_MAX_EVENTS_PER_WINDOW?: string;
  readonly REALTIME_PRESENCE_MAX_BYTES_PER_WINDOW?: string;
  readonly REALTIME_COMMENTS_MAX_EVENTS_PER_WINDOW?: string;
  readonly REALTIME_COMMENTS_MAX_BYTES_PER_WINDOW?: string;
  readonly REALTIME_SCREEN_MAX_EVENTS_PER_WINDOW?: string;
  readonly REALTIME_SCREEN_MAX_BYTES_PER_WINDOW?: string;
}

function parseBoundedInteger(
  source: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (source === undefined || source.trim() === "") {
    return fallback;
  }
  if (!/^[1-9][0-9]*$/u.test(source)) {
    throw new Error(`${name} must be a positive base-10 integer`);
  }
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} is outside the supported range`);
  }
  return parsed;
}

export function resolveRealtimeRoomLimits(
  environment: RealtimeLimitEnvironment,
): RealtimeRoomLimits {
  const channelRateLimits: RealtimeChannelRateLimits = {
    presence: {
      maximumEvents: parseBoundedInteger(
        environment.REALTIME_PRESENCE_MAX_EVENTS_PER_WINDOW,
        DEFAULT_REALTIME_ROOM_LIMITS.channelRateLimits.presence.maximumEvents,
        1,
        100_000,
        "REALTIME_PRESENCE_MAX_EVENTS_PER_WINDOW",
      ),
      maximumBytes: parseBoundedInteger(
        environment.REALTIME_PRESENCE_MAX_BYTES_PER_WINDOW,
        DEFAULT_REALTIME_ROOM_LIMITS.channelRateLimits.presence.maximumBytes,
        REALTIME_MAX_OUTBOUND_FRAME_BYTES,
        64 * 1024 * 1024,
        "REALTIME_PRESENCE_MAX_BYTES_PER_WINDOW",
      ),
    },
    comments: {
      maximumEvents: parseBoundedInteger(
        environment.REALTIME_COMMENTS_MAX_EVENTS_PER_WINDOW,
        DEFAULT_REALTIME_ROOM_LIMITS.channelRateLimits.comments.maximumEvents,
        1,
        10_000,
        "REALTIME_COMMENTS_MAX_EVENTS_PER_WINDOW",
      ),
      maximumBytes: parseBoundedInteger(
        environment.REALTIME_COMMENTS_MAX_BYTES_PER_WINDOW,
        DEFAULT_REALTIME_ROOM_LIMITS.channelRateLimits.comments.maximumBytes,
        REALTIME_MAX_OUTBOUND_FRAME_BYTES,
        16 * 1024 * 1024,
        "REALTIME_COMMENTS_MAX_BYTES_PER_WINDOW",
      ),
    },
    "screen-signaling": {
      maximumEvents: parseBoundedInteger(
        environment.REALTIME_SCREEN_MAX_EVENTS_PER_WINDOW,
        DEFAULT_REALTIME_ROOM_LIMITS.channelRateLimits["screen-signaling"]
          .maximumEvents,
        1,
        100_000,
        "REALTIME_SCREEN_MAX_EVENTS_PER_WINDOW",
      ),
      maximumBytes: parseBoundedInteger(
        environment.REALTIME_SCREEN_MAX_BYTES_PER_WINDOW,
        DEFAULT_REALTIME_ROOM_LIMITS.channelRateLimits["screen-signaling"]
          .maximumBytes,
        REALTIME_MAX_OUTBOUND_FRAME_BYTES,
        64 * 1024 * 1024,
        "REALTIME_SCREEN_MAX_BYTES_PER_WINDOW",
      ),
    },
  };
  return {
    maxConnectionsPerRoom: parseBoundedInteger(
      environment.REALTIME_MAX_CONNECTIONS_PER_ROOM,
      DEFAULT_REALTIME_ROOM_LIMITS.maxConnectionsPerRoom,
      1,
      256,
      "REALTIME_MAX_CONNECTIONS_PER_ROOM",
    ),
    maxConnectionsPerActor: parseBoundedInteger(
      environment.REALTIME_MAX_CONNECTIONS_PER_ACTOR,
      DEFAULT_REALTIME_ROOM_LIMITS.maxConnectionsPerActor,
      1,
      16,
      "REALTIME_MAX_CONNECTIONS_PER_ACTOR",
    ),
    maxBufferedBytes: parseBoundedInteger(
      environment.REALTIME_MAX_BUFFERED_BYTES,
      DEFAULT_REALTIME_ROOM_LIMITS.maxBufferedBytes,
      REALTIME_MAX_OUTBOUND_FRAME_BYTES,
      4 * 1024 * 1024,
      "REALTIME_MAX_BUFFERED_BYTES",
    ),
    maxReplayEvents: parseBoundedInteger(
      environment.REALTIME_MAX_REPLAY_EVENTS,
      DEFAULT_REALTIME_ROOM_LIMITS.maxReplayEvents,
      REALTIME_MAX_REPLAY_EVENTS_PER_FRAME,
      16_384,
      "REALTIME_MAX_REPLAY_EVENTS",
    ),
    maxReceiptCount: parseBoundedInteger(
      environment.REALTIME_MAX_RECEIPT_COUNT,
      DEFAULT_REALTIME_ROOM_LIMITS.maxReceiptCount,
      REALTIME_MAX_REPLAY_EVENTS_PER_FRAME,
      100_000,
      "REALTIME_MAX_RECEIPT_COUNT",
    ),
    maxReceiptBytes: parseBoundedInteger(
      environment.REALTIME_MAX_RECEIPT_BYTES,
      DEFAULT_REALTIME_ROOM_LIMITS.maxReceiptBytes,
      2 * REALTIME_MAX_OUTBOUND_FRAME_BYTES,
      512 * 1024 * 1024,
      "REALTIME_MAX_RECEIPT_BYTES",
    ),
    eventRetentionMs: parseBoundedInteger(
      environment.REALTIME_EVENT_RETENTION_MS,
      DEFAULT_REALTIME_ROOM_LIMITS.eventRetentionMs,
      60 * 1000,
      24 * 60 * 60 * 1000,
      "REALTIME_EVENT_RETENTION_MS",
    ),
    cleanupIntervalMs: parseBoundedInteger(
      environment.REALTIME_CLEANUP_INTERVAL_MS,
      DEFAULT_REALTIME_ROOM_LIMITS.cleanupIntervalMs,
      10 * 1000,
      10 * 60 * 1000,
      "REALTIME_CLEANUP_INTERVAL_MS",
    ),
    rateWindowMs: parseBoundedInteger(
      environment.REALTIME_RATE_WINDOW_MS,
      DEFAULT_REALTIME_ROOM_LIMITS.rateWindowMs,
      1_000,
      60_000,
      "REALTIME_RATE_WINDOW_MS",
    ),
    resumeWindowMs: parseBoundedInteger(
      environment.REALTIME_RESUME_WINDOW_MS,
      DEFAULT_REALTIME_ROOM_LIMITS.resumeWindowMs,
      1_000,
      60_000,
      "REALTIME_RESUME_WINDOW_MS",
    ),
    resumeRateLimit: {
      maximumEvents: parseBoundedInteger(
        environment.REALTIME_RESUME_MAX_REQUESTS_PER_WINDOW,
        DEFAULT_REALTIME_ROOM_LIMITS.resumeRateLimit.maximumEvents,
        3,
        1_024,
        "REALTIME_RESUME_MAX_REQUESTS_PER_WINDOW",
      ),
      maximumBytes: parseBoundedInteger(
        environment.REALTIME_RESUME_MAX_BYTES_PER_WINDOW,
        DEFAULT_REALTIME_ROOM_LIMITS.resumeRateLimit.maximumBytes,
        REALTIME_MAX_OUTBOUND_FRAME_BYTES,
        64 * 1024 * 1024,
        "REALTIME_RESUME_MAX_BYTES_PER_WINDOW",
      ),
    },
    channelRateLimits,
  };
}

export interface RealtimeRateBudgetState {
  readonly windowStartedAtMs: number;
  readonly eventCount: number;
  readonly byteCount: number;
}

export type RealtimeRateBudgetResult =
  | {
      readonly ok: true;
      readonly state: RealtimeRateBudgetState;
      readonly expiresAtMs: number;
    }
  | {
      readonly ok: false;
      readonly retryAtMs: number;
    };

export function evaluateRateBudget(
  previous: RealtimeRateBudgetState | null,
  nowMs: number,
  frameBytes: number,
  windowMs: number,
  limit: RealtimeChannelRateLimit,
): RealtimeRateBudgetResult {
  const state =
    previous === null ||
    previous.windowStartedAtMs > nowMs ||
    nowMs - previous.windowStartedAtMs >= windowMs
      ? {
          windowStartedAtMs: nowMs,
          eventCount: 0,
          byteCount: 0,
        }
      : previous;
  const retryAtMs = state.windowStartedAtMs + windowMs;
  if (
    !Number.isSafeInteger(frameBytes) ||
    frameBytes < 0 ||
    state.eventCount + 1 > limit.maximumEvents ||
    state.byteCount + frameBytes > limit.maximumBytes
  ) {
    return { ok: false, retryAtMs };
  }
  return {
    ok: true,
    state: {
      windowStartedAtMs: state.windowStartedAtMs,
      eventCount: state.eventCount + 1,
      byteCount: state.byteCount + frameBytes,
    },
    expiresAtMs: retryAtMs,
  };
}

export type PublishTimingResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: Extract<
        RealtimeProtocolErrorCode,
        "event-too-old" | "event-from-future"
      >;
    };

export function evaluatePublishTiming(
  sentAtMs: number,
  nowMs: number,
  maximumPastSkewMs = 5 * 60 * 1000,
  maximumFutureSkewMs = 30 * 1000,
): PublishTimingResult {
  if (sentAtMs < nowMs - maximumPastSkewMs) {
    return { ok: false, code: "event-too-old" };
  }
  if (sentAtMs > nowMs + maximumFutureSkewMs) {
    return { ok: false, code: "event-from-future" };
  }
  return { ok: true };
}

export function isClientSequenceAccepted(
  lastAcceptedSequence: number,
  nextSequence: number,
): boolean {
  return (
    Number.isSafeInteger(nextSequence) &&
    nextSequence > lastAcceptedSequence
  );
}

export interface ReplayPlan {
  readonly kind: "empty" | "future" | "gap" | "page";
  readonly fromSequence: number;
  readonly currentSequence: number;
  readonly replayFloorSequence: number;
  readonly limit: number;
}

export function planReplay(
  afterSequence: number,
  currentSequence: number,
  replayFloorSequence: number,
  requestedLimit = REALTIME_MAX_REPLAY_EVENTS_PER_FRAME,
): ReplayPlan {
  const limit = Math.min(
    Math.max(1, requestedLimit),
    REALTIME_MAX_REPLAY_EVENTS_PER_FRAME,
  );
  if (afterSequence > currentSequence) {
    return {
      kind: "future",
      fromSequence: currentSequence + 1,
      currentSequence,
      replayFloorSequence,
      limit,
    };
  }
  if (afterSequence === currentSequence) {
    return {
      kind: "empty",
      fromSequence: afterSequence + 1,
      currentSequence,
      replayFloorSequence,
      limit,
    };
  }
  if (afterSequence < replayFloorSequence - 1) {
    return {
      kind: "gap",
      fromSequence: replayFloorSequence,
      currentSequence,
      replayFloorSequence,
      limit,
    };
  }
  return {
    kind: "page",
    fromSequence: afterSequence + 1,
    currentSequence,
    replayFloorSequence,
    limit,
  };
}

export function canBufferFrame(
  bufferedAmount: number,
  frameBytes: number,
  maximumBufferedBytes: number,
): boolean {
  return (
    Number.isFinite(bufferedAmount) &&
    bufferedAmount >= 0 &&
    Number.isSafeInteger(frameBytes) &&
    frameBytes >= 0 &&
    bufferedAmount + frameBytes <= maximumBufferedBytes
  );
}

/**
 * Cloudflare's server-side hibernatable WebSocket intentionally omits the
 * browser-only `bufferedAmount` property. Treat that runtime shape as an empty
 * userspace queue; `send()` and Cloudflare's queue limits remain the fail-closed
 * boundary. Invalid values from test doubles or future runtime regressions are
 * rejected by returning an infinite backlog.
 */
export function resolveHibernatableBufferedAmount(
  bufferedAmount: unknown,
): number {
  if (bufferedAmount === undefined) {
    return 0;
  }
  return (
    typeof bufferedAmount === "number" &&
      Number.isFinite(bufferedAmount) &&
      bufferedAmount >= 0
  )
    ? bufferedAmount
    : Number.POSITIVE_INFINITY;
}

export function computeReplayPrefixCutoff(
  currentSequence: number,
  maximumReplayEvents: number,
  highestExpiredSequence: number,
): number {
  const boundedCutoff = Math.max(
    0,
    currentSequence - maximumReplayEvents,
  );
  return Math.min(
    currentSequence,
    Math.max(0, boundedCutoff, highestExpiredSequence),
  );
}

export function selectNextAlarmAt(
  nowMs: number,
  cleanupIntervalMs: number,
  eventOrNonceRowsExist: boolean,
  connectionExpirations: readonly number[],
): number | null {
  const validExpirations = connectionExpirations.filter(
    (expiresAtMs) =>
      Number.isSafeInteger(expiresAtMs) && expiresAtMs > nowMs,
  );
  const candidates = [
    ...(eventOrNonceRowsExist ? [nowMs + cleanupIntervalMs] : []),
    ...validExpirations,
  ];
  return candidates.length > 0 ? Math.min(...candidates) : null;
}
