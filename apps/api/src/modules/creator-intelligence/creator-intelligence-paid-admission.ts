import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { LocalAuthRateLimiter } from "../auth/auth-rate-limit";
import {
  UPSTASH_COORDINATION_PORT,
  type UpstashCoordinationPort,
} from "../../infrastructure/upstash-coordination/upstash-coordination.port";

export const CREATOR_INTELLIGENCE_PAID_OPERATIONS = [
  "voice",
  "sound-effect",
  "translation",
  "mesh-create",
  "safe-search",
] as const;

export type CreatorIntelligencePaidOperation =
  (typeof CREATOR_INTELLIGENCE_PAID_OPERATIONS)[number];

interface PaidPolicy {
  readonly userDailyRequests: number;
  readonly globalDailyRequests: number;
  readonly costUnits: number;
}

const POLICIES: Readonly<Record<CreatorIntelligencePaidOperation, PaidPolicy>> =
  Object.freeze({
    voice: Object.freeze({
      userDailyRequests: 120,
      globalDailyRequests: 20_000,
      costUnits: 1,
    }),
    "sound-effect": Object.freeze({
      userDailyRequests: 24,
      globalDailyRequests: 2_000,
      costUnits: 8,
    }),
    translation: Object.freeze({
      userDailyRequests: 200,
      globalDailyRequests: 50_000,
      costUnits: 1,
    }),
    "mesh-create": Object.freeze({
      userDailyRequests: 8,
      globalDailyRequests: 1_000,
      costUnits: 25,
    }),
    "safe-search": Object.freeze({
      userDailyRequests: 100,
      globalDailyRequests: 25_000,
      costUnits: 1,
    }),
  });

const DAY_MS = 24 * 60 * 60_000;
const RECEIPT_TTL_MS = 15 * 60_000;
const RECEIPT_CAPACITY = 40_000;
const localLimiter = new LocalAuthRateLimiter({ maximumIdentities: RECEIPT_CAPACITY });

interface LocalReceipt {
  readonly requestFingerprint: string;
  readonly expiresAt: number;
  state: "pending" | "completed";
}

const localReceipts = new Map<string, LocalReceipt>();

export type CreatorIntelligenceAdmissionErrorCode =
  | "creator_intelligence_paid_execution_disabled"
  | "creator_intelligence_coordination_unavailable"
  | "creator_intelligence_idempotency_key_required"
  | "creator_intelligence_idempotency_conflict"
  | "creator_intelligence_duplicate_request"
  | "creator_intelligence_rate_limited"
  | "creator_intelligence_global_budget_exhausted";

export class CreatorIntelligenceAdmissionError extends Error {
  constructor(
    readonly code: CreatorIntelligenceAdmissionErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "CreatorIntelligenceAdmissionError";
  }
}

export interface CreatorIntelligencePaidExecutionStatus {
  readonly enabled: boolean;
  readonly distributed: boolean;
  readonly requiresAuthentication: true;
  readonly requiresIdempotencyKey: true;
  readonly failClosedInProduction: true;
  readonly reason: "ready" | "disabled" | "coordination-required";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requestFingerprint(value: unknown): string {
  return `sha256:${sha256(JSON.stringify(value))}`;
}

function normalizedIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(key)) {
    throw new CreatorIntelligenceAdmissionError(
      "creator_intelligence_idempotency_key_required",
      HttpStatus.BAD_REQUEST,
      "중복 과금 방지를 위한 요청 식별자가 필요해요. 페이지를 새로고침한 뒤 다시 시도하세요.",
    );
  }
  return key;
}

function paidExecutionEnabled(environment: NodeJS.ProcessEnv): boolean {
  const configured = environment.CREATOR_INTELLIGENCE_PAID_EXECUTION_ENABLED?.trim();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return environment.NODE_ENV !== "production";
}

function cleanupLocalReceipts(now: number): void {
  for (const [key, receipt] of localReceipts) {
    if (receipt.expiresAt <= now) localReceipts.delete(key);
  }
  while (localReceipts.size > RECEIPT_CAPACITY) {
    const oldest = localReceipts.keys().next().value;
    if (oldest === undefined) break;
    localReceipts.delete(oldest);
  }
}

@Injectable()
export class CreatorIntelligencePaidAdmission {
  constructor(
    @Inject(UPSTASH_COORDINATION_PORT)
    private readonly coordination: UpstashCoordinationPort | null,
  ) {}

  status(environment: NodeJS.ProcessEnv = process.env): CreatorIntelligencePaidExecutionStatus {
    const operatorEnabled = paidExecutionEnabled(environment);
    const coordinationRequired =
      environment.NODE_ENV === "production" && !this.coordination;
    return Object.freeze({
      enabled: operatorEnabled && !coordinationRequired,
      distributed: Boolean(this.coordination),
      requiresAuthentication: true,
      requiresIdempotencyKey: true,
      failClosedInProduction: true,
      reason: !operatorEnabled
        ? "disabled"
        : coordinationRequired
          ? "coordination-required"
          : "ready",
    });
  }

  async execute<T>(input: {
    readonly operation: CreatorIntelligencePaidOperation;
    readonly userId: string;
    readonly idempotencyKey: string | undefined;
    readonly request: unknown;
    readonly signal?: AbortSignal;
    readonly environment?: NodeJS.ProcessEnv;
    readonly run: () => Promise<T>;
  }): Promise<T> {
    const environment = input.environment ?? process.env;
    if (!paidExecutionEnabled(environment)) {
      throw new CreatorIntelligenceAdmissionError(
        "creator_intelligence_paid_execution_disabled",
        HttpStatus.SERVICE_UNAVAILABLE,
        "운영자가 이 유료 AI 기능을 아직 활성화하지 않았어요.",
      );
    }
    if (environment.NODE_ENV === "production" && !this.coordination) {
      throw new CreatorIntelligenceAdmissionError(
        "creator_intelligence_coordination_unavailable",
        HttpStatus.SERVICE_UNAVAILABLE,
        "비용 보호 서비스에 연결할 수 없어 유료 AI 요청을 중지했어요.",
      );
    }

    const idempotencyKey = normalizedIdempotencyKey(input.idempotencyKey);
    const policy = POLICIES[input.operation];
    const userFingerprint = sha256(input.userId);
    const keyFingerprint = sha256(idempotencyKey);
    const fingerprint = requestFingerprint({
      operation: input.operation,
      user: userFingerprint,
      request: input.request,
    });
    const receiptIdentity = `ci:${input.operation}:${userFingerprint}:${keyFingerprint}`;
    const claimToken = randomBytes(32).toString("base64url");

    if (this.coordination) {
      const receipt = await this.coordination.reserveIdempotencyReceipt({
        scope: "provider-dispatch",
        operation: `creator-intelligence/${input.operation}`,
        idempotencyKey: receiptIdentity,
        requestFingerprint: fingerprint,
        claimToken,
        ttlMs: RECEIPT_TTL_MS,
      }, { signal: input.signal });
      if (!receipt.reserved) {
        if (receipt.state === "request-conflict") {
          throw new CreatorIntelligenceAdmissionError(
            "creator_intelligence_idempotency_conflict",
            HttpStatus.CONFLICT,
            "같은 요청 식별자가 다른 입력에 재사용됐어요. 새 요청으로 다시 실행하세요.",
          );
        }
        throw new CreatorIntelligenceAdmissionError(
          "creator_intelligence_duplicate_request",
          HttpStatus.CONFLICT,
          "동일한 유료 AI 요청이 이미 처리 중이거나 완료됐어요. 자동으로 다시 보내지 않았습니다.",
          receipt.remainingTtlMs,
        );
      }

      const userLimit = await this.coordination.consumeRateLimit({
        scope: "auth",
        subjectFingerprint: `sha256:${sha256(`creator-intelligence:${input.operation}:${input.userId}`)}`,
        maximumRequests: policy.userDailyRequests,
        windowMs: DAY_MS,
      }, { signal: input.signal });
      if (!userLimit.accepted) {
        throw new CreatorIntelligenceAdmissionError(
          "creator_intelligence_rate_limited",
          HttpStatus.TOO_MANY_REQUESTS,
          "이 AI 기능의 오늘 사용 한도에 도달했어요.",
          userLimit.remainingTtlMs,
        );
      }

      const budget = await this.coordination.consumeProviderBudget({
        providerId: `creator-intelligence-${input.operation}`,
        operationId: receiptIdentity,
        requestUnits: 1,
        costUnits: policy.costUnits,
        maximumRequestUnits: policy.globalDailyRequests,
        maximumCostUnits: policy.globalDailyRequests * policy.costUnits,
        expiryGraceMs: 60 * 60_000,
      }, { signal: input.signal });
      if (!budget.accepted) {
        throw new CreatorIntelligenceAdmissionError(
          "creator_intelligence_global_budget_exhausted",
          HttpStatus.SERVICE_UNAVAILABLE,
          "서비스의 오늘 AI 비용 보호 한도에 도달했어요.",
          budget.remainingTtlMs,
        );
      }

      const result = await input.run();
      await this.coordination.completeIdempotencyReceipt({
        scope: "provider-dispatch",
        operation: `creator-intelligence/${input.operation}`,
        idempotencyKey: receiptIdentity,
        requestFingerprint: fingerprint,
        claimToken,
        ttlMs: RECEIPT_TTL_MS,
        outcomeFingerprint: requestFingerprint(result),
      }, { signal: input.signal }).catch(() => undefined);
      return result;
    }

    const now = Date.now();
    cleanupLocalReceipts(now);
    const existing = localReceipts.get(receiptIdentity);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new CreatorIntelligenceAdmissionError(
          "creator_intelligence_idempotency_conflict",
          HttpStatus.CONFLICT,
          "같은 요청 식별자가 다른 입력에 재사용됐어요. 새 요청으로 다시 실행하세요.",
        );
      }
      throw new CreatorIntelligenceAdmissionError(
        "creator_intelligence_duplicate_request",
        HttpStatus.CONFLICT,
        "동일한 유료 AI 요청이 이미 처리 중이거나 완료됐어요. 자동으로 다시 보내지 않았습니다.",
        Math.max(0, existing.expiresAt - now),
      );
    }
    localReceipts.set(receiptIdentity, {
      requestFingerprint: fingerprint,
      expiresAt: now + RECEIPT_TTL_MS,
      state: "pending",
    });

    const userLimit = localLimiter.consume(
      `creator-intelligence:${input.operation}:user:${userFingerprint}`,
      policy.userDailyRequests,
      DAY_MS,
    );
    const globalLimit = localLimiter.consume(
      `creator-intelligence:${input.operation}:global`,
      policy.globalDailyRequests,
      DAY_MS,
    );
    if (userLimit.status !== "accepted") {
      throw new CreatorIntelligenceAdmissionError(
        "creator_intelligence_rate_limited",
        HttpStatus.TOO_MANY_REQUESTS,
        "이 AI 기능의 오늘 사용 한도에 도달했어요.",
        userLimit.remainingTtlMs,
      );
    }
    if (globalLimit.status !== "accepted") {
      throw new CreatorIntelligenceAdmissionError(
        "creator_intelligence_global_budget_exhausted",
        HttpStatus.SERVICE_UNAVAILABLE,
        "서비스의 오늘 AI 비용 보호 한도에 도달했어요.",
        globalLimit.remainingTtlMs,
      );
    }

    const result = await input.run();
    const receipt = localReceipts.get(receiptIdentity);
    if (receipt) receipt.state = "completed";
    return result;
  }
}
