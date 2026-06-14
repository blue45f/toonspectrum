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

// 모든 키가 선택(optional) — 폴백을 가진 값이 많고, 검증 실패가 부팅을 막아선 안 된다.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  // 포트 류: 숫자 문자열만 경고 대상(빈 값/미설정은 폴백 허용).
  PORT: z.string().regex(/^\d+$/, "PORT must be numeric").optional(),
  NEST_API_PORT: z.string().regex(/^\d+$/, "NEST_API_PORT must be numeric").optional(),
  // PostgreSQL(Neon) 연결 문자열. 미설정 시 로컬 docker 폴백(lib/db).
  DATABASE_URL: z.string().min(1).optional(),
  // 세션 서명 비밀. 운영에선 AUTH_SESSION_SECRET(없으면 AUTH_STATE_SECRET) 권장.
  AUTH_SESSION_SECRET: z.string().min(1).optional(),
  AUTH_STATE_SECRET: z.string().min(1).optional(),
  // 카탈로그 ingest 트리거 토큰(설정 시 reload/ingest 인증).
  CATALOG_INGEST_TRIGGER_TOKEN: z.string().min(1).optional(),
  // 관리자 화이트리스트(콤마 구분 이메일).
  ADMIN_EMAILS: z.string().optional(),
  // 창작 스튜디오 LLM 키(선택 — 미설정 시 해당 기능만 비활성).
  OPENAI_API_KEY: z.string().min(1).optional(),
  // OAuth(선택 — 둘 다 있으면 실제 OAuth, 없으면 데모 폴백).
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

// 코드베이스 곳곳의 개발용 폴백/플레이스홀더 시크릿 — production 에서 쓰이면 안 된다.
const UNSAFE_DEFAULTS: ReadonlyArray<string> = [
  "toonspectrum-insecure-dev-session-secret",
  "dev-only-change-me-please",
  "dev-secret-change-me",
  "change-me-in-production",
  "mypassword",
  "postgres://webdex:webdex@127.0.0.1:55432/webdex",
];

const SECRET_KEYS: ReadonlyArray<keyof ValidatedEnv> = [
  "AUTH_SESSION_SECRET",
  "AUTH_STATE_SECRET",
  "CATALOG_INGEST_TRIGGER_TOKEN",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "GOOGLE_OAUTH_CLIENT_SECRET",
];

type Logger = Pick<Console, "warn" | "error">;

/**
 * env 를 검증하고 경고를 출력한다. 절대 throw 하지 않는다.
 * @returns safeParse 성공 시 파싱된 env, 실패 시 null(검증만, 동작 변경 없음).
 */
export function validateEnv(
  source: NodeJS.ProcessEnv = process.env,
  logger: Logger = console,
): ValidatedEnv | null {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    logger.warn(`[env] 검증 경고(부팅은 계속 진행):\n${issues}`);
  }

  const isProduction = source.NODE_ENV === "production";
  if (isProduction) {
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
