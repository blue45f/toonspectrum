import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { LocalAuthRateLimiter } from "../auth/auth-rate-limit";

import type { UpstashCoordinationPort } from "../../infrastructure/upstash-coordination/upstash-coordination.port";

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

interface MeshJobTokenPayload {
  readonly version: 1;
  readonly providerJobId: string;
  readonly userFingerprint: string;
  readonly issuedAtMs: number;
}

type CreatorIntelligenceCoordination = Pick<
  UpstashCoordinationPort,
  "consumeRateLimit"
>;

const TEN_MINUTES_MS = 10 * 60_000;
const THIRTY_MINUTES_MS = 30 * 60_000;
const ONE_DAY_MS = 24 * 60 * 60_000;
const MESH_JOB_TOKEN_TTL_MS = 7 * ONE_DAY_MS;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

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
  readonly coordination?: CreatorIntelligenceCoordination | null;
}

interface AdmissionCounterResult {
  readonly accepted: boolean;
  readonly remainingTtlMs: number;
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(
    value?.trim().toLowerCase() ?? "",
  );
}

function fingerprint(parts: readonly string[]): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(parts), "utf8")
    .digest("hex")}`;
}

function meshOwnerFingerprint(userId: string): string {
  return createHash("sha256")
    .update(JSON.stringify(["creator-intelligence-mesh-owner-v1", userId]), "utf8")
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

function validProviderJobId(value: string): boolean {
  return /^[A-Za-z0-9_-]{6,120}$/u.test(value);
}

function invalidMeshJobToken(): never {
  throw new BadRequestException({
    code: "creator_intelligence_mesh_job_token_invalid",
    message: "3D 작업 조회 토큰이 올바르지 않습니다.",
  });
}

export class CreatorIntelligenceAdmissionGuard {
  private readonly env: () => NodeJS.ProcessEnv;
  private readonly now: () => number;
  private readonly limiter: LocalAuthRateLimiter;
  private readonly coordination: CreatorIntelligenceCoordination | null;
  private readonly developmentJobTokenSecret = randomBytes(32);

  constructor(options: CreatorIntelligenceAdmissionOptions = {}) {
    this.env = options.env ?? (() => process.env);
    this.now = options.now ?? Date.now;
    this.coordination = options.coordination ?? null;
    this.limiter = new LocalAuthRateLimiter({
      maximumIdentities: options.maximumIdentities ?? 50_000,
      now: this.now,
    });
  }

  describe() {
    const production = this.env().NODE_ENV === "production";
    const enforcement = this.coordination
      ? "distributed-upstash"
      : production
        ? "unavailable"
        : "single-instance-local";
    return {
      paidRoutesEnabled: this.operatorPaidRoutesEnabled()
        && (!production || this.coordination !== null),
      enforcement,
      meshJobOwnership: "signed-user-bound-token",
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

  async admit(
    operation: CreatorIntelligenceProtectedOperation,
    rawUserId: string | undefined,
    rawIdempotencyKey?: string,
  ): Promise<string> {
    const userId = rawUserId?.trim() ?? "";
    if (!userId || userId.length > 256) {
      throw new UnauthorizedException({
        code: "creator_intelligence_auth_required",
        message: "외부 AI 창작 도구를 사용하려면 로그인하세요.",
      });
    }
    if (!this.operatorPaidRoutesEnabled()) {
      throw new ServiceUnavailableException({
        code: "creator_intelligence_paid_routes_disabled",
        message: "외부 비용이 발생하는 AI 창작 도구는 현재 운영 비활성 상태입니다.",
      });
    }
    if (this.env().NODE_ENV === "production" && !this.coordination) {
      throw new ServiceUnavailableException({
        code: "creator_intelligence_coordination_required",
        message: "분산 사용량 보호가 준비되지 않아 외부 AI 창작 도구를 실행할 수 없습니다.",
      });
    }

    const policy = POLICIES[operation];
    const idempotencyKey = policy.requiresIdempotency
      ? normalizedIdempotencyKey(rawIdempotencyKey)
      : null;

    if (idempotencyKey) {
      const idempotency = await this.consumeCounter(
        fingerprint([
          "creator-intelligence-idempotency-v1",
          operation,
          userId,
          idempotencyKey,
        ]),
        1,
        ONE_DAY_MS,
      );
      if (!idempotency.accepted) {
        throw new ConflictException({
          code: "creator_intelligence_duplicate_request",
          message: "같은 외부 AI 요청이 이미 접수되었습니다. 결과를 확인한 뒤 새 요청 ID로 다시 시도하세요.",
          retryAfterMs: idempotency.remainingTtlMs,
        });
      }
    }

    const shortWindow = await this.consumeCounter(
      fingerprint([
        "creator-intelligence-rate-short-v1",
        operation,
        userId,
      ]),
      policy.shortLimit,
      policy.shortWindowMs,
    );
    const dailyWindow = await this.consumeCounter(
      fingerprint([
        "creator-intelligence-rate-daily-v1",
        operation,
        userId,
      ]),
      policy.dailyLimit,
      ONE_DAY_MS,
    );
    if (!shortWindow.accepted || !dailyWindow.accepted) {
      throw new HttpException({
        code: "creator_intelligence_rate_limited",
        message: "외부 AI 창작 도구 사용 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
        retryAfterMs: Math.max(
          shortWindow.remainingTtlMs,
          dailyWindow.remainingTtlMs,
        ),
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return userId;
  }

  wrapMeshJob(userId: string, providerJobId: string): string {
    if (!validProviderJobId(providerJobId)) {
      throw new BadRequestException({
        code: "creator_intelligence_mesh_provider_job_invalid",
        message: "3D 제공처 작업 ID가 올바르지 않습니다.",
      });
    }
    const payload: MeshJobTokenPayload = {
      version: 1,
      providerJobId,
      userFingerprint: meshOwnerFingerprint(userId),
      issuedAtMs: this.now(),
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url",
    );
    const signature = createHmac("sha256", this.meshJobTokenSecret())
      .update(encoded, "utf8")
      .digest("base64url");
    return `${encoded}.${signature}`;
  }

  unwrapMeshJob(userId: string, token: string): string {
    const normalized = token.trim();
    if (!normalized || normalized.length > 1_024) invalidMeshJobToken();
    const [encoded, signature, extra] = normalized.split(".");
    if (!encoded || !signature || extra !== undefined) invalidMeshJobToken();

    const expected = createHmac("sha256", this.meshJobTokenSecret())
      .update(encoded, "utf8")
      .digest();
    let received: Buffer;
    try {
      received = Buffer.from(signature, "base64url");
    } catch {
      invalidMeshJobToken();
    }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      invalidMeshJobToken();
    }

    let payload: MeshJobTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as MeshJobTokenPayload;
    } catch {
      invalidMeshJobToken();
    }
    if (
      !payload
      || typeof payload !== "object"
      || payload.version !== 1
      || !validProviderJobId(payload.providerJobId)
      || !/^[a-f\d]{64}$/u.test(payload.userFingerprint)
      || !Number.isSafeInteger(payload.issuedAtMs)
    ) {
      invalidMeshJobToken();
    }
    const ageMs = this.now() - payload.issuedAtMs;
    if (ageMs < -MAX_CLOCK_SKEW_MS || ageMs > MESH_JOB_TOKEN_TTL_MS) {
      throw new BadRequestException({
        code: "creator_intelligence_mesh_job_token_expired",
        message: "3D 작업 조회 토큰이 만료되었습니다.",
      });
    }
    if (payload.userFingerprint !== meshOwnerFingerprint(userId)) {
      throw new ForbiddenException({
        code: "creator_intelligence_mesh_job_forbidden",
        message: "이 계정이 만든 3D 작업만 조회할 수 있습니다.",
      });
    }
    return payload.providerJobId;
  }

  private operatorPaidRoutesEnabled(): boolean {
    const env = this.env();
    const explicit = env.CREATOR_INTELLIGENCE_PAID_ROUTES_ENABLED;
    if (explicit !== undefined) return enabled(explicit);
    return env.NODE_ENV !== "production";
  }

  private async consumeCounter(
    subjectFingerprint: string,
    maximumRequests: number,
    windowMs: number,
  ): Promise<AdmissionCounterResult> {
    if (!this.coordination) {
      const local = this.limiter.consume(
        subjectFingerprint,
        maximumRequests,
        windowMs,
      );
      return {
        accepted: local.status === "accepted",
        remainingTtlMs: local.remainingTtlMs,
      };
    }
    try {
      const distributed = await this.coordination.consumeRateLimit({
        scope: "auth",
        subjectFingerprint,
        maximumRequests,
        windowMs,
      });
      return {
        accepted: distributed.accepted,
        remainingTtlMs: distributed.remainingTtlMs,
      };
    } catch {
      throw new ServiceUnavailableException({
        code: "creator_intelligence_coordination_unavailable",
        message: "분산 사용량 보호를 확인하지 못해 외부 AI 요청을 실행하지 않았습니다.",
      });
    }
  }

  private meshJobTokenSecret(): Buffer {
    const env = this.env();
    const configured = env.CREATOR_INTELLIGENCE_JOB_TOKEN_SECRET?.trim();
    if (configured && configured.length >= 32) {
      return Buffer.from(configured, "utf8");
    }
    if (env.NODE_ENV === "production") {
      throw new ServiceUnavailableException({
        code: "creator_intelligence_mesh_job_token_unconfigured",
        message: "3D 작업 소유권 토큰 설정이 없어 Meshy 경로를 사용할 수 없습니다.",
      });
    }
    return this.developmentJobTokenSecret;
  }
}
