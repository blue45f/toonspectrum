import { z } from "zod";

/**
 * 백엔드 env 검증(NON-FATAL).
 *
 * boot 시 process.env 를 Zod 스키마로 safeParse 한다. 실패해도 절대 throw/exit 하지 않고
 * 경고만 남긴다 — 라이브 부팅을 깨지 않기 위함이다. 기존 process.env 읽기(lib/db, session 등)는
 * 각자 폴백을 가지므로 그대로 두고, 여기서는 검증과 경고만 ADD 한다.
 *
 * production 에서 알려진 안전하지 않은 기본값(개발용 폴백 시크릿)을 발견하면 큰 경고를 출력한다.
 */

const boundedPositiveInteger = (
  key: string,
  minimum: number,
  maximum: number
) =>
  z
    .string()
    .regex(/^[1-9]\d*$/u, `${key} must be a positive integer`)
    .refine((value) => {
      const parsed = Number(value);
      return (
        Number.isSafeInteger(parsed) &&
        parsed >= minimum &&
        parsed <= maximum
      );
    }, `${key} must be between ${minimum} and ${maximum}`);

const boundedNonNegativeInteger = (
  key: string,
  minimum: number,
  maximum: number
) =>
  z
    .string()
    .regex(/^(?:0|[1-9]\d*)$/u, `${key} must be a non-negative integer`)
    .refine((value) => {
      const parsed = Number(value);
      return (
        Number.isSafeInteger(parsed) &&
        parsed >= minimum &&
        parsed <= maximum
      );
    }, `${key} must be between ${minimum} and ${maximum}`);

const boundedPath = (key: string) =>
  z
    .string()
    .min(1)
    .max(4_096)
    .refine((value) => value === value.trim(), `${key} cannot have surrounding whitespace`)
    .refine((value) => !value.includes("\0"), `${key} cannot contain NUL`);

const privateBucketName = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9_-]{1,61}[a-z0-9])$/u);

// 모든 키가 선택(optional) — 폴백을 가진 값이 많고, 검증 실패가 부팅을 막아선 안 된다.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  API_RUNTIME_ROLE: z.enum(["full", "studio-live"]).optional(),
  CI: z.enum(["true", "false", "1", "0"]).optional(),
  TZ: z
    .string()
    .min(1)
    .max(128)
    .regex(/^(?:UTC|[A-Za-z_+-]+\/[A-Za-z0-9_+:-]+)$/u)
    .optional(),
  // 포트 류: 숫자 문자열만 경고 대상(빈 값/미설정은 폴백 허용).
  PORT: z.string().regex(/^\d+$/, "PORT must be numeric").optional(),
  NEST_API_PORT: z.string().regex(/^\d+$/, "NEST_API_PORT must be numeric").optional(),
  // 허용할 브라우저 Origin(쉼표 구분, 선택).
  API_CORS_ALLOWED_ORIGINS: z.string().optional(),
  // 인증/요청 경계 토글: 분산 레이트리밋 및 신뢰 프록시(IP source-of-truth) 경계를
  // 명시적으로 켜야 하며, 미설정은 보수적 로컬 동작으로 fallback 됩니다.
  AUTH_DISTRIBUTED_RATE_LIMIT_ENABLED: z.enum(["true", "false"]).optional(),
  AUTH_TRUSTED_PROXY_ENABLED: z.enum(["true", "false"]).optional(),
  AUTH_TRUSTED_PROXY_IPS: z.string().min(1).optional(),
  AUTH_TRUSTED_CLIENT_IP_HEADER: z
    .enum([
      "x-forwarded-for",
      "x-real-ip",
      "x-vercel-forwarded-for",
      "cf-connecting-ip",
    ])
    .optional(),
  AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS: z
    .string()
    .regex(/^[1-9][0-9]*$/u, "AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS must be an integer")
    .optional(),
  // 정본 웹/OG/OAuth 도메인. CANONICAL_HOST는 scheme 없는 hostname만 사용한다.
  CANONICAL_HOST: z
    .string()
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/iu)
    .optional(),
  OAUTH_REDIRECT_BASE_URL: z.url().optional(),
  WEB_APP_BASE_URL: z.url().optional(),
  // PostgreSQL(Neon) 연결 문자열. 미설정 시 로컬 docker 폴백(lib/db).
  DATABASE_URL: z.string().min(1).optional(),
  WEBDEX_PG_POOL_MAX: boundedPositiveInteger(
    "WEBDEX_PG_POOL_MAX",
    1,
    50
  ).optional(),
  WEBDEX_PG_IDLE_MS: boundedPositiveInteger(
    "WEBDEX_PG_IDLE_MS",
    1_000,
    600_000
  ).optional(),
  // 통합 테스트 전용 direct PostgreSQL URL. 운영 경로에서 소비되지는 않지만,
  // 진단 메시지와 production unsafe-default 감사에서는 비밀값으로 취급한다.
  STUDIO_LIVE_POSTGRES_INTEGRATION_URL: z.string().min(1).optional(),
  STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL: z.string().min(1).optional(),
  // 카탈로그 파일·수집 경계. 활성 ingest는 별도 정규화 함수에서 동일 범위를 다시 적용한다.
  WEBDEX_CATALOG_FILE: boundedPath("WEBDEX_CATALOG_FILE").optional(),
  WEBDEX_CATALOG_GZ: boundedPath("WEBDEX_CATALOG_GZ").optional(),
  WEBDEX_CATALOG_FORCE_DB: z.enum(["0", "1"]).optional(),
  WEBDEX_SOURCE_IDS: z.string().min(1).max(4_096).optional(),
  CATALOG_INGEST_MODE: z.enum(["off", "fixed"]).optional(),
  CATALOG_INGEST_INTERVAL_SECONDS: boundedPositiveInteger(
    "CATALOG_INGEST_INTERVAL_SECONDS",
    60,
    86_400
  ).optional(),
  CATALOG_INGEST_TIMEOUT_MS: boundedPositiveInteger(
    "CATALOG_INGEST_TIMEOUT_MS",
    30_000,
    1_800_000
  ).optional(),
  CATALOG_INGEST_SCRIPT_MAX_OUTPUT_MB: boundedPositiveInteger(
    "CATALOG_INGEST_SCRIPT_MAX_OUTPUT_MB",
    1,
    200
  ).optional(),
  CATALOG_CRAWL_SCRIPT: boundedPath("CATALOG_CRAWL_SCRIPT").optional(),
  CATALOG_INGEST_MIN_RETAIN_RATIO: z
    .string()
    .regex(/^(?:0?\.\d+|1(?:\.0+)?)$/u)
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 && parsed <= 1;
    })
    .optional(),
  CATALOG_REFRESH_POLL_SECONDS: boundedNonNegativeInteger(
    "CATALOG_REFRESH_POLL_SECONDS",
    0,
    3_600
  ).optional(),
  CATALOG_SNAPSHOT_RETENTION: boundedPositiveInteger(
    "CATALOG_SNAPSHOT_RETENTION",
    1,
    100
  ).optional(),
  COVER_IMAGE_POLICY: z.enum(["proxy", "off"]).optional(),
  // 장기 실행 Nest API의 Socket.IO 다중 인스턴스 adapter. postgres 모드는 LISTEN 가능한
  // direct PostgreSQL URL과 listener + publisher를 위한 최소 2개 연결을 사용한다.
  STUDIO_LIVE_CLUSTER_ADAPTER: z.enum(["memory", "postgres"]).optional(),
  STUDIO_LIVE_POSTGRES_URL: z.string().min(1).optional(),
  STUDIO_LIVE_POSTGRES_POOL_MAX: z
    .string()
    .regex(/^(?:[2-9]|10)$/u, "STUDIO_LIVE_POSTGRES_POOL_MAX must be between 2 and 10")
    .optional(),
  STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED: z.enum(["true", "false"]).optional(),
  // 기능별 실시간 data plane 입장권. 활성화는 명시적이며, 실제 bootstrap factory가
  // 전체 필수값과 TTL 상호 관계를 다시 fail-closed로 검증한다.
  STUDIO_REALTIME_TICKET_ENABLED: z.enum(["true", "false"]).optional(),
  STUDIO_REALTIME_CLOUDFLARE_PROVIDER_ID: z
    .string()
    .min(1)
    .max(160)
    .refine((value) => value === value.trim())
    .optional(),
  STUDIO_REALTIME_CLOUDFLARE_TICKET_ISSUER: z
    .string()
    .min(1)
    .max(160)
    .refine((value) => value === value.trim())
    .optional(),
  STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE: z
    .string()
    .min(1)
    .max(160)
    .refine((value) => value === value.trim())
    .optional(),
  STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: z
    .string()
    .min(32)
    .max(4_096)
    .refine((value) => value === value.trim())
    .optional(),
  STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS: z
    .string()
    .regex(/^[1-9]\d*$/u)
    .refine((value) => Number(value) <= 120)
    .optional(),
  STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS: z
    .string()
    .regex(/^[1-9]\d*$/u)
    .refine((value) => Number(value) <= 14_400)
    .optional(),
  // 원본·파생물·내보내기를 목적별 private bucket으로 분리한 정본 저장소.
  // 실제 모듈 factory는 활성화 시 필수값·서로 다른 bucket 조건을 fail-closed로 재검증한다.
  SUPABASE_OBJECT_STORAGE_ENABLED: z.enum(["true", "false"]).optional(),
  SUPABASE_OBJECT_STORAGE_URL: z
    .url({ protocol: /^https$/u })
    .optional(),
  SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY: z
    .string()
    .min(32)
    .max(16_384)
    .optional(),
  SUPABASE_OBJECT_STORAGE_SOURCE_BUCKET: privateBucketName.optional(),
  SUPABASE_OBJECT_STORAGE_DERIVED_BUCKET: privateBucketName.optional(),
  SUPABASE_OBJECT_STORAGE_EXPORT_BUCKET: privateBucketName.optional(),
  SUPABASE_OBJECT_STORAGE_TIMEOUT_MS: boundedPositiveInteger(
    "SUPABASE_OBJECT_STORAGE_TIMEOUT_MS",
    100,
    120_000
  ).optional(),
  SUPABASE_OBJECT_STORAGE_MAXIMUM_ASSET_BYTES: boundedPositiveInteger(
    "SUPABASE_OBJECT_STORAGE_MAXIMUM_ASSET_BYTES",
    1,
    5 * 1_024 * 1_024 * 1_024
  ).optional(),
  SUPABASE_OBJECT_STORAGE_MAXIMUM_CONTROL_METADATA_BYTES:
    boundedPositiveInteger(
      "SUPABASE_OBJECT_STORAGE_MAXIMUM_CONTROL_METADATA_BYTES",
      512,
      16 * 1_024
    ).optional(),
  SUPABASE_OBJECT_STORAGE_MAXIMUM_RESPONSE_BYTES:
    boundedPositiveInteger(
      "SUPABASE_OBJECT_STORAGE_MAXIMUM_RESPONSE_BYTES",
      1_024,
      256 * 1_024
    ).optional(),
  // Upstash는 공급자 lease·중복 방지 영수증·회로 차단기·비용 예약만 담당한다.
  // 비활성 상태에서는 단일 프로세스 조정 경계를 유지하고, 잘못된 명시 설정은 factory에서 거부한다.
  UPSTASH_COORDINATION_ENABLED: z.enum(["true", "false"]).optional(),
  UPSTASH_COORDINATION_REST_URL: z
    .url({ protocol: /^https$/u })
    .optional(),
  UPSTASH_COORDINATION_REST_TOKEN: z
    .string()
    .min(16)
    .max(4_096)
    .optional(),
  UPSTASH_COORDINATION_KEY_HASH_SECRET: z
    .string()
    .min(32)
    .max(4_096)
    .optional(),
  UPSTASH_COORDINATION_NAMESPACE: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u)
    .optional(),
  UPSTASH_COORDINATION_TIMEOUT_MS: boundedPositiveInteger(
    "UPSTASH_COORDINATION_TIMEOUT_MS",
    100,
    30_000
  ).optional(),
  UPSTASH_COORDINATION_MAX_REQUEST_BYTES: boundedPositiveInteger(
    "UPSTASH_COORDINATION_MAX_REQUEST_BYTES",
    1_024,
    128 * 1_024
  ).optional(),
  UPSTASH_COORDINATION_MAX_RESPONSE_BYTES: boundedPositiveInteger(
    "UPSTASH_COORDINATION_MAX_RESPONSE_BYTES",
    1_024,
    256 * 1_024
  ).optional(),
  STUDIO_LIVE_VOICE_ENABLED: z.enum(["true", "false"]).optional(),
  STUDIO_VOICE_STUN_URLS: z.string().optional(),
  STUDIO_VOICE_TURN_URLS: z.string().optional(),
  STUDIO_VOICE_TURN_SHARED_SECRET: z.string().min(32).optional(),
  STUDIO_VOICE_TURN_REQUIRED: z.enum(["true", "false"]).optional(),
  STUDIO_VOICE_TURN_TTL_SECONDS: z
    .string()
    .regex(/^\d+$/u, "STUDIO_VOICE_TURN_TTL_SECONDS must be numeric")
    .optional(),
  // 세션/OAuth state HMAC 비밀. 운영에서는 실제 소비 경계와 validateEnv가
  // 공백 없는 32 UTF-8 바이트 이상을 fail-closed로 강제한다.
  AUTH_SESSION_SECRET: z.string().min(1).optional(),
  AUTH_STATE_SECRET: z.string().min(1).optional(),
  STUDIO_RASTER_ASSET_ADMISSION: z
    .literal("verified-renderer-handoff-v1")
    .optional(),
  STUDIO_WORK_ASSET_ADMISSION: z
    .literal("enable-immutable-readonly-work-assets-v1")
    .optional(),
  // 카탈로그 ingest 트리거 토큰(설정 시 reload/ingest 인증).
  CATALOG_INGEST_TRIGGER_TOKEN: z.string().min(1).optional(),
  // 관리자 화이트리스트(콤마 구분 이메일).
  ADMIN_EMAILS: z.string().optional(),
  // 창작 스튜디오 LLM 키(선택 — 미설정 시 해당 기능만 비활성).
  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  CREATOR_IMAGE_AI_ENABLED: z.enum(["true", "false"]).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_MODEL: z.string().min(1).max(200).optional(),
  DEEPSEEK_TIMEOUT_MS: z.string().regex(/^\d+$/, "DEEPSEEK_TIMEOUT_MS must be numeric").optional(),
  DEEPSEEK_USER_ID_SALT: z.string().min(32).optional(),
  ZAI_API_KEY: z.string().min(1).optional(),
  ZAI_MODEL: z.string().min(1).max(200).optional(),
  ZAI_TIMEOUT_MS: z.string().regex(/^\d+$/, "ZAI_TIMEOUT_MS must be numeric").optional(),
  STUDIO_AI_TIMEOUT_MS: z.string().regex(/^\d+$/, "STUDIO_AI_TIMEOUT_MS must be numeric").optional(),
  STUDIO_AI_PROVIDER_ORDER: z
    .string()
    .regex(/^(zai|deepseek)(,(zai|deepseek))*$/, "STUDIO_AI_PROVIDER_ORDER must be a provider CSV")
    .optional(),
  STUDIO_AI_DAILY_REQUEST_LIMIT: z
    .string()
    .regex(/^[1-9]\d*$/, "STUDIO_AI_DAILY_REQUEST_LIMIT must be a positive integer")
    .optional(),
  STUDIO_AI_DAILY_TOKEN_LIMIT: z
    .string()
    .regex(/^[1-9]\d*$/, "STUDIO_AI_DAILY_TOKEN_LIMIT must be a positive integer")
    .optional(),
  STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT: z
    .string()
    .regex(/^[1-9]\d*$/, "STUDIO_AI_GLOBAL_DAILY_REQUEST_LIMIT must be a positive integer")
    .optional(),
  STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT: z
    .string()
    .regex(/^[1-9]\d*$/, "STUDIO_AI_GLOBAL_DAILY_TOKEN_LIMIT must be a positive integer")
    .optional(),
  // Google GIS(ID 토큰)는 client ID만 필요하다. client secret은 레거시
  // authorization-code 폴백에서만 사용하며, 그 경우 AUTH_STATE_SECRET도 필수다.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  KAKAO_REST_API_KEY: z.string().min(1).max(4_096).optional(),
  KAKAO_CLIENT_SECRET: z.string().min(1).max(4_096).optional(),
  NAVER_OAUTH_CLIENT_ID: z.string().min(1).max(4_096).optional(),
  NAVER_OAUTH_CLIENT_SECRET: z.string().min(1).max(4_096).optional(),
  // 만화규장각 서버 보강. 인증키는 URL query에 들어가므로 반드시 서버 secret으로만 보관한다.
  KMAS_PRV_KEY: z.string().min(1).max(4_096).optional(),
  KMAS_BASE_URL: z.url({ protocol: /^https$/u }).optional(),
  KMAS_MERGE_ON_ACCESS: z.enum(["0", "1"]).optional(),
  KMAS_MERGE_ON_ACCESS_LIMIT: boundedPositiveInteger(
    "KMAS_MERGE_ON_ACCESS_LIMIT",
    1,
    1_000
  ).optional(),
  KMAS_MERGE_ON_ACCESS_TTL_MS: boundedNonNegativeInteger(
    "KMAS_MERGE_ON_ACCESS_TTL_MS",
    0,
    24 * 60 * 60 * 1_000
  ).optional(),
  KMAS_LOOKUP_CONCURRENCY: boundedPositiveInteger(
    "KMAS_LOOKUP_CONCURRENCY",
    1,
    8
  ).optional(),
  KMAS_LOOKUP_CACHE_TTL_MS: boundedNonNegativeInteger(
    "KMAS_LOOKUP_CACHE_TTL_MS",
    0,
    24 * 60 * 60 * 1_000
  ).optional(),
  KMAS_LIVE_SEARCH: z.enum(["0", "1"]).optional(),
  KMAS_CATALOG_SOURCE: z.enum(["snapshot", "live"]).optional(),
  KMAS_RESPONSE_ENRICH_LIMIT: boundedPositiveInteger(
    "KMAS_RESPONSE_ENRICH_LIMIT",
    1,
    80
  ).optional(),
  KMAS_RESPONSE_IMAGE_LIMIT: boundedPositiveInteger(
    "KMAS_RESPONSE_IMAGE_LIMIT",
    1,
    80
  ).optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

// 코드베이스 곳곳의 개발용 폴백/플레이스홀더 시크릿 — production 에서 쓰이면 안 된다.
const UNSAFE_DEFAULTS: ReadonlyArray<string> = [
  "toonspectrum-insecure-dev-session-secret",
  "dev-only-change-me-please",
  "dev-secret-change-me",
  "change-me-in-production",
  "mypassword",
];

const SECRET_KEYS: ReadonlyArray<keyof ValidatedEnv> = [
  "AUTH_SESSION_SECRET",
  "AUTH_STATE_SECRET",
  "CATALOG_INGEST_TRIGGER_TOKEN",
  "DATABASE_URL",
  "STUDIO_LIVE_POSTGRES_URL",
  "STUDIO_LIVE_POSTGRES_INTEGRATION_URL",
  "STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL",
  "STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET", // gitleaks:allow -- environment variable identifier only
  "SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY",
  "UPSTASH_COORDINATION_REST_TOKEN",
  "UPSTASH_COORDINATION_KEY_HASH_SECRET",
  "STUDIO_VOICE_TURN_SHARED_SECRET",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_USER_ID_SALT",
  "ZAI_API_KEY",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "KAKAO_REST_API_KEY",
  "KAKAO_CLIENT_SECRET",
  "NAVER_OAUTH_CLIENT_ID",
  "NAVER_OAUTH_CLIENT_SECRET",
  "KMAS_PRV_KEY",
];

type Logger = Pick<Console, "warn" | "error">;

const PRODUCTION_HMAC_SECRET_MIN_BYTES = 32;

function normalizedConfiguredSecret(
  value: string | undefined,
): { readonly raw: string; readonly normalized: string } | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  return normalized
    ? { raw: value, normalized }
    : null;
}

function assertStrongProductionHmacSecret(
  key: string,
  configured: { readonly raw: string; readonly normalized: string } | null,
): void {
  if (
    configured === null ||
    configured.raw !== configured.normalized ||
    new TextEncoder().encode(configured.normalized).byteLength <
      PRODUCTION_HMAC_SECRET_MIN_BYTES
  ) {
    throw new Error(
      `${key} must be an unpadded secret of at least ${PRODUCTION_HMAC_SECRET_MIN_BYTES} UTF-8 bytes in production`,
    );
  }
}

function assertProductionAuthSecrets(source: NodeJS.ProcessEnv): void {
  if (source.NODE_ENV !== "production") return;

  const sessionSecret =
    normalizedConfiguredSecret(source.AUTH_SESSION_SECRET) ??
    normalizedConfiguredSecret(source.AUTH_STATE_SECRET);
  assertStrongProductionHmacSecret(
    "AUTH_SESSION_SECRET (or AUTH_STATE_SECRET)",
    sessionSecret,
  );

  const stateSecret = normalizedConfiguredSecret(
    source.AUTH_STATE_SECRET,
  );
  const authorizationCodeFlowConfigured = [
    source.GOOGLE_OAUTH_CLIENT_SECRET,
    source.KAKAO_REST_API_KEY,
    source.KAKAO_CLIENT_SECRET,
    source.NAVER_OAUTH_CLIENT_ID,
    source.NAVER_OAUTH_CLIENT_SECRET,
  ].some((value) => Boolean(value?.trim()));
  if (stateSecret !== null || authorizationCodeFlowConfigured) {
    assertStrongProductionHmacSecret(
      "AUTH_STATE_SECRET",
      stateSecret,
    );
  }
}

/**
 * env 를 검증하고 경고를 출력한다. 절대 throw 하지 않는다.
 * @returns safeParse 성공 시 파싱된 env, 실패 시 null(검증만, 동작 변경 없음).
 */
export function validateEnv(
  source: NodeJS.ProcessEnv = process.env,
  logger: Logger = console,
): ValidatedEnv | null {
  assertProductionAuthSecrets(source);
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    logger.warn(`[env] 검증 경고(부팅은 계속 진행):\n${issues}`);
  }

  const isProduction = source.NODE_ENV === "production";
  if (isProduction) {
    const dbUrl = source.DATABASE_URL?.trim();
    if (dbUrl && (dbUrl.includes("webdex:webdex") || dbUrl.includes("127.0.0.1:55432") || dbUrl.includes("localhost:55432"))) {
      logger.error(
        `\n${"!".repeat(72)}\n` +
          `[env] 보안 경고: production 인데 DATABASE_URL 이 안전하지 않은 개발용 기본값입니다.\n` +
          `      실제 비밀 값으로 교체하세요(현재 값은 공개/추측 가능).\n` +
          `${"!".repeat(72)}\n`,
      );
    }
    for (const key of SECRET_KEYS) {
      const value = source[key]?.trim();
      if (value && UNSAFE_DEFAULTS.includes(value)) {
        logger.error(
          `\n${"!".repeat(72)}\n` +
            `[env] 보안 경고: production 인데 ${key} 가 안전하지 않은 개발용 기본값입니다.\n` +
            `      실제 비밀 값으로 교체하세요(현재 값은 공개/추측 가능).\n` +
            `${"!".repeat(72)}\n`,
        );
      }
    }
    // 세션 비밀이 둘 다 비어 있으면 폴백(insecure) 사용 — production 에서 위험.
    if (!source.AUTH_SESSION_SECRET?.trim() && !source.AUTH_STATE_SECRET?.trim()) {
      logger.error(
        `\n${"!".repeat(72)}\n` +
          `[env] 보안 경고: production 인데 AUTH_SESSION_SECRET/AUTH_STATE_SECRET 미설정 —\n` +
          `      세션 서명이 공개된 개발용 폴백 비밀로 동작합니다(토큰 위조 가능).\n` +
          `${"!".repeat(72)}\n`,
      );
    }
  }

  return result.success ? result.data : null;
}
