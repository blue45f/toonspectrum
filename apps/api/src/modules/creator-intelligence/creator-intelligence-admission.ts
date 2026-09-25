import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "node:crypto";

import { LocalAuthRateLimiter } from "../auth/auth-rate-limit";

export type CreatorIntelligenceProtectedOperation =
  | "voice-synthesize"
  | "sound-generate"
  | "translate"
  | "mesh-create"
  | "mesh-status"
  | "safe-search";

interface CreatorIntelligenceAdmissionPolicy {
  readonly shortLimit: number;
  readonly shortWindowMs: number;
  readonly dailyLimit: number;
  readonly requiresIdempotency: boolean;
}

const TEN_MINUTES_MS = 10 * 60_000;
const THIRTY_MINUTES_MS = 30 * 60_000;
const ONE_DAY_MS = 24 * 60 * 60_000;

const POLICIES: Readonly<
  Record<CreatorIntelligenceProtectedOperation, CreatorIntelligenceAdmissionPolicy>
> = Object.freeze({
  "voice-synthesize": {
    shortLimit: 60,
    shortWindowMs: TEN_MINUTES_MS,
    dailyLimit: 120,
    requiresIdempotency: true,
  },
  "sound-generate": {
    shortLimit: 10,
    shortWindowMs: TEN_MINUTES_MS,
    dailyLimit: 30,
    requiresIdempotency: true,
  },
  translate: {
    shortLimit: 60,
    shortWindowMs: TEN_MINUTES_MS,
    dailyLimit: 300,
    requiresIdempotency: true,
  },
  "mesh-create": {
    shortLimit: 3,
    shortWindowMs: THIRTY_MINUTES_MS,
    dailyLimit: 10,
    requiresIdempotency: true,
  },
  "mesh-status": {
    shortLimit: 120,
    shortWindowMs: TEN_MINUTES_MS,
    dailyLimit: 1_000,
    requiresIdempotency: false,
  },
  "safe-search": {
    shortLimit: 30,
    shortWindowMs: TEN_MINUTES_MS,
    dailyLimit: 200,
    requiresIdempotency: true,
  },
});

export interface CreatorIntelligenceAdmissionOptions {
  readonly env?: () => NodeJS.ProcessEnv;
  readonly now?: () => number;
  readonly maximumIdentities?: number;
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function subjectFingerprint(
  operation: CreatorIntelligenceProtectedOperation,
  userId: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify(["creator-intelligence-admission-v1", operation, userId]), "utf8")
    .digest("hex");
}

function normalizedIdempotencyKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(key)) {
    throw new BadRequestException({
      code: "creator_intelligence_idempotency_key_required",
      message: "중복 과금 방지를 위한 유효한 Idempotency-Key가 필요합니다.",
    });
  }
  return key;
}

@Injectable()
export class CreatorIntelligenceAdmissionGuard {
  private readonly env: () => NodeJS.ProcessEnv;
  private readonly limiter: LocalAuthRateLimiter;

  constructor(options: CreatorIntelligenceAdmissionOptions = {}) {
    this.env = options.env ?? (() => process.env);
    this.limiter = new LocalAuthRateLimiter({
      maximumIdentities: options.maximumIdentities ?? 50_000,
      now: options.now,
    });
  }

  describe() {
    return {
      paidRoutesEnabled: this.paidRoutesEnabled(),
      enforcement: "authenticated-bounded-process-local",
      operations: Object.fromEntries(
        Object.entries(POLICIES).map(([operation, policy]) => [
          operation,
          {
            shortLimit: policy.shortLimit,
            shortWindowMs: policy.shortWindowMs,
            dailyLimit: policy.dailyLimit,
            requiresIdempotency: policy.requiresIdempotency,
          },
        ]),
      ),
    } as const;
  }

  admit(
    operation: CreatorIntelligenceProtectedOperation,
    rawUserId: string | undefined,
    rawIdempotencyKey?: string,
  ): string {
    const userId = rawUserId?.trim() ?? "";
    if (!userId || userId.length > 256) {
      throw new UnauthorizedException({
        code: "creator_intelligence_auth_required",
        message: "외부 AI 창작 도구를 사용하려면 로그인하세요.",
      });
    }
    if (!this.paidRoutesEnabled()) {
      throw new ServiceUnavailableException({
        code: "creator_intelligence_paid_routes_disabled",
        message: "외부 비용이 발생하는 AI 창작 도구는 현재 운영 비활성 상태입니다.",
      });
    }

    const policy = POLICIES[operation];
    const subject = subjectFingerprint(operation, userId);
    const shortWindow = this.limiter.consume(
      `short:${subject}`,
      policy.shortLimit,
      policy.shortWindowMs,
    );
    const dailyWindow = this.limiter.consume(
      `daily:${subject}`,
      policy.dailyLimit,
      ONE_DAY_MS,
    );
    if (shortWindow.status !== "accepted" || dailyWindow.status !== "accepted") {
      throw new HttpException({
        code: "creator_intelligence_rate_limited",
        message: "외부 AI 창작 도구 사용 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
        retryAfterMs: Math.max(shortWindow.remainingTtlMs, dailyWindow.remainingTtlMs),
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    if (policy.requiresIdempotency) {
      const idempotencyKey = normalizedIdempotencyKey(rawIdempotencyKey);
      const idempotency = this.limiter.consume(
        `idempotency:${subject}:${idempotencyKey}`,
        1,
        ONE_DAY_MS,
      );
      if (idempotency.status !== "accepted") {
        throw new ConflictException({
          code: "creator_intelligence_duplicate_request",
          message: "같은 외부 AI 요청이 이미 접수되었습니다. 결과를 확인한 뒤 새 요청 ID로 다시 시도하세요.",
          retryAfterMs: idempotency.remainingTtlMs,
        });
      }
    }
    return userId;
  }

  private paidRoutesEnabled(): boolean {
    const env = this.env();
    const explicit = env.CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED;
    if (explicit !== undefined) return enabled(explicit);
    return env.NODE_ENV !== "production";
  }
}
