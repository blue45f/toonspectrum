import { createHash } from "node:crypto";

export const AUTH_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

export const AUTH_RATE_LIMIT_POLICIES = {
  "oauth-google-idtoken": { limit: 30 },
  "oauth-demo": { limit: 20 },
  signup: { limit: 5 },
  login: { limit: 10 },
} as const;

export type AuthRateLimitAction = keyof typeof AUTH_RATE_LIMIT_POLICIES;

export type LocalAuthRateLimitDecision =
  | {
      readonly status: "accepted" | "rate-limited";
      readonly remainingTtlMs: number;
    }
  | {
      readonly status: "saturated";
      readonly remainingTtlMs: 0;
    };

interface LocalAuthRateLimitEntry {
  readonly requestCount: number;
  readonly expiresAt: number;
}

interface LocalAuthRateLimiterOptions {
  readonly maximumIdentities?: number;
  readonly sweepIntervalMs?: number;
  readonly now?: () => number;
}

const DEFAULT_LOCAL_MAXIMUM_IDENTITIES = 10_000;
const DEFAULT_LOCAL_SWEEP_INTERVAL_MS = 60_000;

/**
 * Process-local fallback for development and controlled single-instance deployments.
 *
 * The store is deliberately bounded to one fixed-window counter per identity. When every slot is
 * still active it fails closed for a new identity instead of evicting an active bucket and letting
 * a rotating source bypass enforcement. Its window semantics match the Upstash Lua counter.
 */
export class LocalAuthRateLimiter {
  private readonly entries = new Map<string, LocalAuthRateLimitEntry>();
  private readonly maximumIdentities: number;
  private readonly sweepIntervalMs: number;
  private readonly now: () => number;
  private nextSweepAt = 0;

  constructor(options: LocalAuthRateLimiterOptions = {}) {
    this.maximumIdentities = positiveInteger(
      options.maximumIdentities ?? DEFAULT_LOCAL_MAXIMUM_IDENTITIES,
      "maximumIdentities",
    );
    this.sweepIntervalMs = positiveInteger(
      options.sweepIntervalMs ?? DEFAULT_LOCAL_SWEEP_INTERVAL_MS,
      "sweepIntervalMs",
    );
    this.now = options.now ?? Date.now;
  }

  get identityCount(): number {
    return this.entries.size;
  }

  consume(
    identity: string,
    maximumRequests: number,
    windowMs: number,
  ): LocalAuthRateLimitDecision {
    const requestLimit = positiveInteger(maximumRequests, "maximumRequests");
    const requestWindowMs = positiveInteger(windowMs, "windowMs");
    const now = this.now();
    const existing = this.entries.get(identity);

    if (
      now >= this.nextSweepAt ||
      (existing === undefined && this.entries.size >= this.maximumIdentities)
    ) {
      this.sweep(now);
    }

    let entry = this.entries.get(identity);
    if (entry && entry.expiresAt <= now) {
      this.entries.delete(identity);
      entry = undefined;
    }

    if (entry && entry.requestCount >= requestLimit) {
      return {
        status: "rate-limited",
        remainingTtlMs: Math.max(0, entry.expiresAt - now),
      };
    }

    if (!entry && this.entries.size >= this.maximumIdentities) {
      return { status: "saturated", remainingTtlMs: 0 };
    }

    const expiresAt = entry?.expiresAt ?? now + requestWindowMs;
    this.entries.set(identity, {
      requestCount: (entry?.requestCount ?? 0) + 1,
      expiresAt,
    });
    return {
      status: "accepted",
      remainingTtlMs: Math.max(0, expiresAt - now),
    };
  }

  private sweep(now: number): void {
    for (const [identity, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(identity);
    }
    this.nextSweepAt = now + this.sweepIntervalMs;
  }
}

/**
 * Stable, privacy-preserving identity for the distributed limiter. The action is part of the
 * digest so one endpoint cannot consume another endpoint's policy bucket. The complete 256-bit
 * digest is retained; the Upstash client HMACs it again before creating the Redis key.
 */
export function createAuthRateLimitSubjectFingerprint(
  action: AuthRateLimitAction,
  sourceIp: string,
): `sha256:${string}` {
  const digest = createHash("sha256")
    .update(
      JSON.stringify(["toonspectrum-auth-rate-limit-v1", action, sourceIp]),
      "utf8",
    )
    .digest("hex");
  return `sha256:${digest}`;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}
