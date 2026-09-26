import { createHmac } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import {
  AcquireCoordinationLeaseResultSchema,
  AcquireCoordinationLeaseSchema,
  CompleteIdempotencyReceiptResultSchema,
  CompleteIdempotencyReceiptSchema,
  ConsumeRateLimitResultSchema,
  ConsumeRateLimitSchema,
  ConsumeProviderBudgetResultSchema,
  ConsumeProviderBudgetSchema,
  MutateCoordinationLeaseResultSchema,
  MutateCoordinationLeaseSchema,
  ProviderCircuitFailureSchema,
  ProviderCircuitIdentitySchema,
  ProviderCircuitStateSchema,
  ReserveIdempotencyReceiptResultSchema,
  ReserveIdempotencyReceiptSchema,
  UPSTASH_COORDINATION_CONTRACT_VERSION,
  type AcquireCoordinationLease,
  type AcquireCoordinationLeaseResult,
  type CompleteIdempotencyReceipt,
  type CompleteIdempotencyReceiptResult,
  type ConsumeRateLimit,
  type ConsumeRateLimitResult,
  type ConsumeProviderBudget,
  type ConsumeProviderBudgetResult,
  type MutateCoordinationLease,
  type MutateCoordinationLeaseResult,
  type ProviderCircuitFailure,
  type ProviderCircuitIdentity,
  type ProviderCircuitState,
  type ReserveIdempotencyReceipt,
  type ReserveIdempotencyReceiptResult,
} from "./upstash-coordination.contract";

import type { UpstashCoordinationConfig } from "./upstash-coordination.config";
import type {
  UpstashCoordinationCallOptions,
  UpstashCoordinationPort,
} from "./upstash-coordination.port";

export const UPSTASH_COORDINATION_CONFIG = Symbol(
  "UPSTASH_COORDINATION_CONFIG"
);
export const UPSTASH_COORDINATION_RUNTIME = Symbol(
  "UPSTASH_COORDINATION_RUNTIME"
);

export interface UpstashCoordinationRuntime {
  readonly fetch: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
}

export type UpstashCoordinationFailureCode =
  | "ABORTED"
  | "INVALID_INPUT"
  | "REQUEST_TOO_LARGE"
  | "TIMEOUT"
  | "REMOTE_UNAVAILABLE"
  | "REMOTE_REJECTED"
  | "INVALID_RESPONSE";

export class UpstashCoordinationError extends Error {
  constructor(readonly code: UpstashCoordinationFailureCode) {
    super(`Upstash coordination failed: ${code}.`);
    this.name = "UpstashCoordinationError";
  }
}

const AcquireLeaseResultTupleSchema = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.number().int().min(0),
]);
const MutateLeaseResultTupleSchema = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.number().int().min(-1),
]);
const ReceiptRemainingTtlSchema = z.number().int().min(0);
const ReserveReceiptResultTupleSchema = z.union([
  z.tuple([z.literal(1), z.literal(1), ReceiptRemainingTtlSchema]),
  z.tuple([
    z.literal(0),
    z.union([z.literal(1), z.literal(2), z.literal(3)]),
    ReceiptRemainingTtlSchema,
  ]),
]);
const CompleteReceiptResultSchema = z.union([
  z.literal(-2),
  z.literal(-1),
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);
const CircuitResultTupleSchema = z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
]);
const BudgetResultTupleSchema = z.tuple([
  z.union([z.literal(1), z.literal(2)]),
  z.union([z.literal(0), z.literal(1)]),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
]);
const RateLimitResultTupleSchema = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  z.number().int().min(0),
  z.number().int().min(0),
]);
const PingResultSchema = z.literal("PONG");

type RedisArgument = string | number;
type RedisCommand = readonly RedisArgument[];

const ACQUIRE_LEASE_SCRIPT = `
local acquired = redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[2])
if acquired then
  return {1, tonumber(ARGV[2])}
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  return redis.error_reply("COORDINATION_LEASE_TTL_INVALID")
end
return {0, ttl}
`.trim();

const RENEW_LEASE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return {0, -1}
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  return redis.error_reply("COORDINATION_LEASE_TTL_INVALID")
end
if current ~= ARGV[1] then
  return {0, ttl}
end
redis.call("PEXPIRE", KEYS[1], ARGV[2])
return {1, tonumber(ARGV[2])}
`.trim();

const RELEASE_LEASE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return {0, -1}
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  return redis.error_reply("COORDINATION_LEASE_TTL_INVALID")
end
if current ~= ARGV[1] then
  return {0, ttl}
end
redis.call("DEL", KEYS[1])
return {1, -1}
`.trim();

const RESERVE_RECEIPT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  redis.call("SET", KEYS[1], "p:" .. ARGV[1] .. ":" .. ARGV[2], "PX", ARGV[3])
  return {1, 1, tonumber(ARGV[3])}
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  return redis.error_reply("COORDINATION_RECEIPT_TTL_INVALID")
end
if string.len(current) ~= 131 then
  return redis.error_reply("COORDINATION_RECEIPT_VALUE_INVALID")
end
local requestFingerprint = string.sub(current, -64)
if requestFingerprint ~= ARGV[2] then
  return {0, 3, ttl}
end
local prefix = string.sub(current, 1, 2)
if prefix == "p:" then
  return {0, 1, ttl}
end
if prefix == "c:" then
  return {0, 2, ttl}
end
return redis.error_reply("COORDINATION_RECEIPT_VALUE_INVALID")
`.trim();

const COMPLETE_RECEIPT_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  return 0
end
if string.len(current) ~= 131 then
  return redis.error_reply("COORDINATION_RECEIPT_VALUE_INVALID")
end
local requestFingerprint = string.sub(current, -64)
if requestFingerprint ~= ARGV[3] then
  return -2
end
local pending = "p:" .. ARGV[1] .. ":" .. ARGV[3]
local completed = "c:" .. ARGV[2] .. ":" .. ARGV[3]
if current == pending then
  redis.call("SET", KEYS[1], completed, "XX", "PX", ARGV[4])
  return 1
end
if current == completed then
  return 2
end
return -1
`.trim();

const RECORD_CIRCUIT_FAILURE_SCRIPT = `
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local failures = redis.call("HINCRBY", KEYS[1], "failures", 1)
local openedUntil = tonumber(redis.call("HGET", KEYS[1], "openedUntil") or "0")
if failures >= tonumber(ARGV[1]) then
  local candidate = now + tonumber(ARGV[2])
  if candidate > openedUntil then
    openedUntil = candidate
    redis.call("HSET", KEYS[1], "openedUntil", tostring(openedUntil))
  end
end
redis.call("PEXPIRE", KEYS[1], ARGV[3])
return {failures, openedUntil, now}
`.trim();

const CLOSE_CIRCUIT_SCRIPT = `
redis.call("DEL", KEYS[1])
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
return {0, 0, now}
`.trim();

const READ_CIRCUIT_SCRIPT = `
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local failures = tonumber(redis.call("HGET", KEYS[1], "failures") or "0")
local openedUntil = tonumber(redis.call("HGET", KEYS[1], "openedUntil") or "0")
if openedUntil > 0 and openedUntil <= now then
  redis.call("DEL", KEYS[1])
  return {0, 0, now}
end
return {failures, openedUntil, now}
`.trim();

/*
 * Redis Cluster requires every script key to be declared before EVAL, while the UTC window is not
 * known until Redis TIME executes. One stable HMAC provider key therefore contains exactly one
 * logical UTC-day window; the script resets that hash atomically when the server day changes.
 * This is the cluster-safe equivalent of selecting a Redis-time-derived daily key.
 */
const CONSUME_BUDGET_SCRIPT = `
local clock = redis.call("TIME")
local nowSeconds = tonumber(clock[1])
local nowMilliseconds = nowSeconds * 1000 + math.floor(tonumber(clock[2]) / 1000)
local utcDay = math.floor(nowSeconds / 86400)
local windowId = tostring(utcDay)
local nextUtcDayMilliseconds = (utcDay + 1) * 86400000
local remainingTtlMs = nextUtcDayMilliseconds - nowMilliseconds + tonumber(ARGV[6])
if remainingTtlMs < 1000 then
  return redis.error_reply("COORDINATION_BUDGET_TTL_INVALID")
end

local currentWindow = redis.call("HGET", KEYS[1], "window")
if currentWindow and not string.match(currentWindow, "^%d+$") then
  return redis.error_reply("COORDINATION_BUDGET_WINDOW_INVALID")
end
if currentWindow and tonumber(currentWindow) > utcDay then
  return redis.error_reply("COORDINATION_BUDGET_WINDOW_INVALID")
end
if currentWindow and currentWindow ~= windowId then
  redis.call("DEL", KEYS[1])
  currentWindow = false
end
if not currentWindow then
  if redis.call("EXISTS", KEYS[1]) == 1 then
    return redis.error_reply("COORDINATION_BUDGET_STATE_INVALID")
  end
  redis.call("HSET", KEYS[1], "window", windowId, "requests", "0", "costs", "0")
end

local requestsValue = redis.call("HGET", KEYS[1], "requests")
local costsValue = redis.call("HGET", KEYS[1], "costs")
if not requestsValue or not costsValue or not string.match(requestsValue, "^%d+$") or not string.match(costsValue, "^%d+$") then
  return redis.error_reply("COORDINATION_BUDGET_STATE_INVALID")
end

local operationField = "operation:" .. ARGV[1]
local prior = redis.call("HGET", KEYS[1], operationField)
if prior then
  local accepted, requests, costs = string.match(prior, "^(%d):(%d+):(%d+)$")
  if not accepted or (accepted ~= "0" and accepted ~= "1") then
    return redis.error_reply("COORDINATION_BUDGET_RECEIPT_INVALID")
  end
  redis.call("PEXPIRE", KEYS[1], remainingTtlMs)
  return {2, tonumber(accepted), tonumber(requests), tonumber(costs), utcDay, remainingTtlMs}
end

local requests = tonumber(requestsValue)
local costs = tonumber(costsValue)
local nextRequests = requests + tonumber(ARGV[2])
local nextCosts = costs + tonumber(ARGV[3])
local accepted = 0
if nextRequests <= tonumber(ARGV[4]) and nextCosts <= tonumber(ARGV[5]) then
  accepted = 1
  requests = nextRequests
  costs = nextCosts
  redis.call("HSET", KEYS[1], "requests", tostring(requests), "costs", tostring(costs))
end
redis.call("HSET", KEYS[1], operationField, tostring(accepted) .. ":" .. tostring(requests) .. ":" .. tostring(costs))
redis.call("PEXPIRE", KEYS[1], remainingTtlMs)
return {1, accepted, requests, costs, utcDay, remainingTtlMs}
`.trim();

/*
 * Fixed-window auth limiter. Rejected attempts do not increment the counter, so a hostile caller
 * cannot turn one bounded key into an unbounded receipt/hash. The key itself is HMAC-derived by
 * `singleKey`, and the input contract permits only a SHA-256 subject fingerprint.
 */
const CONSUME_RATE_LIMIT_SCRIPT = `
local currentRaw = redis.call("GET", KEYS[1])
if not currentRaw then
  redis.call("SET", KEYS[1], "1", "PX", ARGV[2])
  return {1, 1, tonumber(ARGV[2])}
end
if not string.match(currentRaw, "^%d+$") then
  return redis.error_reply("COORDINATION_RATE_LIMIT_VALUE_INVALID")
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl <= 0 then
  return redis.error_reply("COORDINATION_RATE_LIMIT_TTL_INVALID")
end
local current = tonumber(currentRaw)
if current >= tonumber(ARGV[1]) then
  return {0, current, ttl}
end
current = redis.call("INCR", KEYS[1])
return {1, current, ttl}
`.trim();

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

async function cancelResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Discarding an untrusted remote body is best-effort.
  }
}

function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    return Promise.reject(new UpstashCoordinationError("ABORTED"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (
      action: () => void
    ) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => {
      void reader.cancel().catch(() => undefined);
      finish(() => reject(new UpstashCoordinationError("ABORTED")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => finish(() => resolve(result)),
      () =>
        finish(() =>
          reject(new UpstashCoordinationError("INVALID_RESPONSE"))
        )
    );
  });
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal
): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/u.test(declared)) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > maximumBytes) {
      await cancelResponse(response);
      throw new UpstashCoordinationError("INVALID_RESPONSE");
    }
  }
  if (!response.body) {
    throw new UpstashCoordinationError("INVALID_RESPONSE");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw new UpstashCoordinationError("ABORTED");
      const chunk = await readStreamChunk(reader, signal);
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new UpstashCoordinationError("INVALID_RESPONSE");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new UpstashCoordinationError("INVALID_RESPONSE");
  }
}

interface AbortScope {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly externallyAborted: () => boolean;
  readonly dispose: () => void;
}

function createAbortScope(
  timeoutMs: number,
  externalSignal: AbortSignal | undefined
): AbortScope {
  if (externalSignal?.aborted) {
    throw new UpstashCoordinationError("ABORTED");
  }

  const controller = new AbortController();
  let timeoutReached = false;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => {
    timeoutReached = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();

  return {
    signal: controller.signal,
    timedOut: () => timeoutReached,
    externallyAborted: () => externalSignal?.aborted ?? false,
    dispose: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function exactResultEnvelope(value: unknown): unknown {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new UpstashCoordinationError("INVALID_RESPONSE");
  }
  const keys = Object.keys(value);
  if (
    keys.length !== 1 ||
    keys[0] !== "result" ||
    !Object.hasOwn(value, "result")
  ) {
    throw new UpstashCoordinationError("INVALID_RESPONSE");
  }
  return (value as { result: unknown }).result;
}

function exactCircuitState(
  result: z.infer<typeof CircuitResultTupleSchema>
): ProviderCircuitState {
  const [consecutiveFailures, openedUntilEpochMs, observedAtEpochMs] = result;
  return ProviderCircuitStateSchema.parse({
    state:
      openedUntilEpochMs > observedAtEpochMs ? "open" as const : "closed" as const,
    consecutiveFailures,
    openedUntilEpochMs,
    observedAtEpochMs,
  });
}

@Injectable()
export class UpstashRestCoordinationPort implements UpstashCoordinationPort {
  private readonly namespaceDigest: string;

  constructor(
    @Inject(UPSTASH_COORDINATION_CONFIG)
    private readonly config: UpstashCoordinationConfig,
    @Inject(UPSTASH_COORDINATION_RUNTIME)
    private readonly runtime: UpstashCoordinationRuntime
  ) {
    this.namespaceDigest = this.digest([
      UPSTASH_COORDINATION_CONTRACT_VERSION,
      "namespace",
      config.namespace,
    ]).slice(0, 24);
  }

  async ping(
    options: UpstashCoordinationCallOptions = {}
  ): Promise<boolean> {
    return (
      await this.execute(["PING"], PingResultSchema, options)
    ) === "PONG";
  }

  async acquireLease(
    input: AcquireCoordinationLease,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<AcquireCoordinationLeaseResult> {
    const value = this.parseInput(AcquireCoordinationLeaseSchema, input);
    const key = this.singleKey("lease", [value.scope, value.resourceId]);
    const proof = this.digest(["lease-proof", value.leaseToken]);
    const result = await this.eval(
      ACQUIRE_LEASE_SCRIPT,
      [key],
      [proof, value.ttlMs],
      AcquireLeaseResultTupleSchema,
      options
    );
    return AcquireCoordinationLeaseResultSchema.parse({
      acquired: result[0] === 1,
      remainingTtlMs: result[1],
    });
  }

  async renewLease(
    input: MutateCoordinationLease,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<MutateCoordinationLeaseResult> {
    const value = this.parseInput(MutateCoordinationLeaseSchema, input);
    const result = await this.eval(
      RENEW_LEASE_SCRIPT,
      [this.singleKey("lease", [value.scope, value.resourceId])],
      [this.digest(["lease-proof", value.leaseToken]), value.ttlMs],
      MutateLeaseResultTupleSchema,
      options
    );
    return MutateCoordinationLeaseResultSchema.parse({
      matched: result[0] === 1,
      remainingTtlMs: result[1] < 0 ? null : result[1],
    });
  }

  async releaseLease(
    input: MutateCoordinationLease,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<MutateCoordinationLeaseResult> {
    const value = this.parseInput(MutateCoordinationLeaseSchema, input);
    const result = await this.eval(
      RELEASE_LEASE_SCRIPT,
      [this.singleKey("lease", [value.scope, value.resourceId])],
      [this.digest(["lease-proof", value.leaseToken])],
      MutateLeaseResultTupleSchema,
      options
    );
    return MutateCoordinationLeaseResultSchema.parse({
      matched: result[0] === 1,
      remainingTtlMs: result[1] < 0 ? null : result[1],
    });
  }

  async reserveIdempotencyReceipt(
    input: ReserveIdempotencyReceipt,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<ReserveIdempotencyReceiptResult> {
    const value = this.parseInput(ReserveIdempotencyReceiptSchema, input);
    const result = await this.eval(
      RESERVE_RECEIPT_SCRIPT,
      [
        this.singleKey("receipt", [
          value.scope,
          value.operation,
          value.idempotencyKey,
        ]),
      ],
      [
        this.digest(["receipt-claim", value.claimToken]),
        this.digest(["receipt-request", value.requestFingerprint]),
        value.ttlMs,
      ],
      ReserveReceiptResultTupleSchema,
      options
    );
    return ReserveIdempotencyReceiptResultSchema.parse({
      reserved: result[0] === 1,
      state:
        result[1] === 1
          ? "pending"
          : result[1] === 2
            ? "completed"
            : "request-conflict",
      remainingTtlMs: result[2],
    });
  }

  async completeIdempotencyReceipt(
    input: CompleteIdempotencyReceipt,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<CompleteIdempotencyReceiptResult> {
    const value = this.parseInput(CompleteIdempotencyReceiptSchema, input);
    const result = await this.eval(
      COMPLETE_RECEIPT_SCRIPT,
      [
        this.singleKey("receipt", [
          value.scope,
          value.operation,
          value.idempotencyKey,
        ]),
      ],
      [
        this.digest(["receipt-claim", value.claimToken]),
        this.digest(["receipt-outcome", value.outcomeFingerprint]),
        this.digest(["receipt-request", value.requestFingerprint]),
        value.ttlMs,
      ],
      CompleteReceiptResultSchema,
      options
    );
    const outcome = result === 1
      ? "completed"
      : result === 2
        ? "duplicate"
        : result === 0
          ? "not-found"
          : result === -2
            ? "request-conflict"
            : "conflict";
    return CompleteIdempotencyReceiptResultSchema.parse({ outcome });
  }

  async recordProviderFailure(
    input: ProviderCircuitFailure,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<ProviderCircuitState> {
    const value = this.parseInput(ProviderCircuitFailureSchema, input);
    return exactCircuitState(
      await this.eval(
        RECORD_CIRCUIT_FAILURE_SCRIPT,
        [this.singleKey("circuit", [value.providerId])],
        [value.failureThreshold, value.cooldownMs, value.stateTtlMs],
        CircuitResultTupleSchema,
        options
      )
    );
  }

  async closeProviderCircuit(
    input: ProviderCircuitIdentity,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<ProviderCircuitState> {
    const value = this.parseInput(ProviderCircuitIdentitySchema, input);
    return exactCircuitState(
      await this.eval(
        CLOSE_CIRCUIT_SCRIPT,
        [this.singleKey("circuit", [value.providerId])],
        [],
        CircuitResultTupleSchema,
        options
      )
    );
  }

  async readProviderCircuit(
    input: ProviderCircuitIdentity,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<ProviderCircuitState> {
    const value = this.parseInput(ProviderCircuitIdentitySchema, input);
    return exactCircuitState(
      await this.eval(
        READ_CIRCUIT_SCRIPT,
        [this.singleKey("circuit", [value.providerId])],
        [],
        CircuitResultTupleSchema,
        options
      )
    );
  }

  async consumeProviderBudget(
    input: ConsumeProviderBudget,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<ConsumeProviderBudgetResult> {
    const value = this.parseInput(ConsumeProviderBudgetSchema, input);
    const operationDigest = this.digest([
      "budget-operation",
      value.operationId,
    ]);
    const result = await this.eval(
      CONSUME_BUDGET_SCRIPT,
      [this.singleKey("budget", [value.providerId])],
      [
        operationDigest,
        value.requestUnits,
        value.costUnits,
        value.maximumRequestUnits,
        value.maximumCostUnits,
        value.expiryGraceMs,
      ],
      BudgetResultTupleSchema,
      options
    );
    return ConsumeProviderBudgetResultSchema.parse({
      accepted: result[1] === 1,
      duplicate: result[0] === 2,
      requestUnits: result[2],
      costUnits: result[3],
      windowId: `utc-day:${result[4]}`,
      remainingTtlMs: result[5],
    });
  }

  async consumeRateLimit(
    input: ConsumeRateLimit,
    options: UpstashCoordinationCallOptions = {}
  ): Promise<ConsumeRateLimitResult> {
    const value = this.parseInput(ConsumeRateLimitSchema, input);
    const result = await this.eval(
      CONSUME_RATE_LIMIT_SCRIPT,
      [this.singleKey("rate-limit", [value.scope, value.subjectFingerprint])],
      [value.maximumRequests, value.windowMs],
      RateLimitResultTupleSchema,
      options
    );
    return ConsumeRateLimitResultSchema.parse({
      accepted: result[0] === 1,
      requestCount: result[1],
      remainingTtlMs: result[2],
    });
  }

  private parseInput<TSchema extends z.ZodType>(
    schema: TSchema,
    input: unknown
  ): z.output<TSchema> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      throw new UpstashCoordinationError("INVALID_INPUT");
    }
    return parsed.data;
  }

  private singleKey(domain: string, identity: readonly string[]): string {
    const digest = this.digest(["key", domain, ...identity]);
    return `tsc:v1:${this.namespaceDigest}:${domain}:${digest}`;
  }

  private digest(parts: readonly string[]): string {
    return createHmac("sha256", this.config.keyHashSecret)
      .update(JSON.stringify(parts), "utf8")
      .digest("hex");
  }

  private eval<TResult>(
    script: string,
    keys: readonly string[],
    arguments_: readonly RedisArgument[],
    resultSchema: z.ZodType<TResult>,
    options: UpstashCoordinationCallOptions
  ): Promise<TResult> {
    return this.execute(
      ["EVAL", script, keys.length, ...keys, ...arguments_],
      resultSchema,
      options
    );
  }

  private async execute<TResult>(
    command: RedisCommand,
    resultSchema: z.ZodType<TResult>,
    options: UpstashCoordinationCallOptions
  ): Promise<TResult> {
    const body = JSON.stringify(command);
    if (byteLength(body) > this.config.maximumRequestBytes) {
      throw new UpstashCoordinationError("REQUEST_TOO_LARGE");
    }

    const abortScope = createAbortScope(
      this.config.timeoutMs,
      options.signal
    );
    try {
      const response = await this.runtime.fetch(this.config.restUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.restToken}`,
          "content-type": "application/json",
        },
        body,
        signal: abortScope.signal,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });

      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (!response.ok || contentType !== "application/json") {
        await cancelResponse(response);
        throw new UpstashCoordinationError(
          response.ok ? "INVALID_RESPONSE" : "REMOTE_REJECTED"
        );
      }

      const text = await readBoundedBody(
        response,
        this.config.maximumResponseBytes,
        abortScope.signal
      );
      let decoded: unknown;
      try {
        decoded = JSON.parse(text);
      } catch {
        throw new UpstashCoordinationError("INVALID_RESPONSE");
      }
      const parsed = resultSchema.safeParse(exactResultEnvelope(decoded));
      if (!parsed.success) {
        throw new UpstashCoordinationError("INVALID_RESPONSE");
      }
      return parsed.data;
    } catch (error) {
      if (abortScope.externallyAborted()) {
        throw new UpstashCoordinationError("ABORTED");
      }
      if (abortScope.timedOut()) {
        throw new UpstashCoordinationError("TIMEOUT");
      }
      if (error instanceof UpstashCoordinationError) throw error;
      throw new UpstashCoordinationError("REMOTE_UNAVAILABLE");
    } finally {
      abortScope.dispose();
    }
  }
}
