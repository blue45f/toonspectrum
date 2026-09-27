const LEGACY_FULL_VERIFICATION_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);
const PG_POOL_ERROR_MESSAGE_MAX_LENGTH = 512;
const PG_POOL_ERROR_CODE_MAX_LENGTH = 64;

interface PgPoolErrorEmitter {
  on(event: "error", listener: (error: unknown) => void): unknown;
}

export interface PgPoolErrorLogger {
  error(message: string): void;
}

export interface PgPoolErrorObserverOptions {
  connectionString: string;
  logger: PgPoolErrorLogger;
}

function isPostgresProtocol(protocol: string): boolean {
  return protocol === "postgres:" || protocol === "postgresql:";
}

function isNeonHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "neon.tech" || normalized.endsWith(".neon.tech");
}

function decodeCredential(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function postgresCredentialValues(connectionString: string): string[] {
  const values = [connectionString];
  try {
    const url = new URL(connectionString);
    const encodedPassword = url.password;
    const encodedUserInfo = `${url.username}:${url.password}`;
    values.push(
      encodedUserInfo,
      decodeCredential(encodedUserInfo),
      encodedPassword,
      decodeCredential(encodedPassword)
    );
  } catch {
    // The connection string is validated before the application pool is created. Retain the full
    // input as a redaction value if this helper is reused with an invalid URL in isolation.
  }
  return values
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);
}

function redactedPgErrorValue(value: string, sensitiveValues: readonly string[]): string {
  let redacted = value;
  for (const sensitiveValue of sensitiveValues) {
    redacted = redacted.replaceAll(sensitiveValue, "[REDACTED]");
  }
  // Match through the final `@` before the path rather than stopping at the first one. Error
  // messages sometimes decode `%40` inside a password, and stopping early would leave the
  // password suffix looking like part of the hostname (for example `p@ss@host`). Exact known
  // credentials are removed first; this generic pass safely covers other PostgreSQL DSNs.
  redacted = redacted.replace(/(postgres(?:ql)?:\/\/)[^\s/]+@/giu, "$1[REDACTED]@");
  return redacted.replace(/[\r\n\u2028\u2029]+/gu, " ");
}

function pgErrorMessage(error: unknown): string {
  try {
    return error instanceof Error && typeof error.message === "string"
      ? error.message
      : "unknown PostgreSQL pool error";
  } catch {
    return "unknown PostgreSQL pool error";
  }
}

function pgErrorCode(error: unknown): string | undefined {
  try {
    if (!error || typeof error !== "object" || !("code" in error)) return undefined;
    const code = Reflect.get(error, "code");
    return typeof code === "string" && code.length > 0 ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Observe node-postgres errors from clients that fail while idle in the pool.
 *
 * `pg.Pool` emits these as EventEmitter `error` events instead of rejecting a query promise, so an
 * absent listener terminates the process. This observer deliberately does not wrap `pool.query()`;
 * active query failures therefore keep their normal rejection semantics for their callers.
 */
export function observePgPoolIdleErrors(
  pool: PgPoolErrorEmitter,
  options: PgPoolErrorObserverOptions
): void {
  const sensitiveValues = postgresCredentialValues(options.connectionString);
  pool.on("error", (error) => {
    const message = redactedPgErrorValue(pgErrorMessage(error), sensitiveValues).slice(
      0,
      PG_POOL_ERROR_MESSAGE_MAX_LENGTH
    );
    const rawCode = pgErrorCode(error);
    const code = rawCode
      ? redactedPgErrorValue(rawCode, sensitiveValues).slice(0, PG_POOL_ERROR_CODE_MAX_LENGTH)
      : undefined;
    options.logger.error(
      `PostgreSQL pool emitted an idle-client error${code ? ` (code=${code})` : ""}: ${message}`
    );
  });
}

/**
 * Preserve node-postgres' current certificate + hostname verification semantics
 * without relying on sslmode aliases whose meaning changes in pg v9.
 *
 * The returned URL is safe to pass as the only TLS source to `new Pool()`.
 * Supplying a separate `ssl` object together with `sslmode` is intentionally
 * avoided because node-postgres lets connection-string SSL fields replace it.
 */
export function normalizePgConnectionStringForTls(connectionString: string): string {
  const parsed = new URL(connectionString);
  if (!isPostgresProtocol(parsed.protocol)) {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }

  const sslModes = parsed.searchParams.getAll("sslmode");
  if (sslModes.length > 1) {
    throw new Error("DATABASE_URL must not repeat sslmode");
  }

  const sslMode = sslModes[0]?.trim().toLowerCase();
  const neon = isNeonHost(parsed.hostname);

  if (neon && sslMode === "disable") {
    throw new Error("Neon DATABASE_URL must not disable TLS");
  }

  if (sslMode && LEGACY_FULL_VERIFICATION_SSL_MODES.has(sslMode)) {
    parsed.searchParams.set("sslmode", "verify-full");
  } else if (neon && !sslMode) {
    parsed.searchParams.set("sslmode", "verify-full");
  }

  return parsed.toString();
}


export type PgPoolEnvironment = Partial<Record<string, string | undefined>>;

export interface PgRuntimePoolOptions {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  allowExitOnIdle: boolean;
  query_timeout: number;
  keepAlive: boolean;
  keepAliveInitialDelayMillis: number;
  maxLifetimeSeconds: number;
  application_name: string;
  statement_timeout?: number;
  lock_timeout?: number;
  idle_in_transaction_session_timeout?: number;
}

function boundedPoolInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

/** 런타임 풀만 제한한다. 마이그레이션과 운영 DB의 전역 설정은 변경하지 않는다. */
export function resolvePgPoolOptions(
  env: PgPoolEnvironment = process.env,
  connectionString: string | undefined = env.DATABASE_URL,
): PgRuntimePoolOptions {
  const mode = env.WEBDEX_PG_CONNECTION_MODE?.trim().toLowerCase() || "auto";
  if (!["auto", "direct", "transaction"].includes(mode)) {
    throw new Error("WEBDEX_PG_CONNECTION_MODE는 auto, direct, transaction 중 하나여야 합니다.");
  }
  const hostname = connectionString ? new URL(connectionString).hostname.toLowerCase() : "";
  const transactionPooling = mode === "transaction"
    || (mode === "auto" && isNeonHost(hostname) && hostname.split(".")[0].endsWith("-pooler"));
  const statementTimeout = boundedPoolInt(env.WEBDEX_PG_STATEMENT_MS, 30_000, 1_000, 300_000);
  const queryTimeout = boundedPoolInt(env.WEBDEX_PG_QUERY_MS, 35_000, 1_000, 360_000);
  return {
    max: boundedPoolInt(env.WEBDEX_PG_POOL_MAX, 3, 1, 50),
    idleTimeoutMillis: boundedPoolInt(env.WEBDEX_PG_IDLE_MS, 10_000, 1_000, 600_000),
    connectionTimeoutMillis: boundedPoolInt(env.WEBDEX_PG_CONNECT_MS, 10_000, 1_000, 30_000),
    allowExitOnIdle: true,
    query_timeout: transactionPooling ? queryTimeout : Math.max(queryTimeout, statementTimeout + 1_000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    maxLifetimeSeconds: boundedPoolInt(env.WEBDEX_PG_MAX_LIFETIME_SECONDS, 300, 30, 3_600),
    application_name: "toonstudio-core-api",
    // Transaction pooler의 세션 상태를 가정하지 않는다. 서버 제한은 별도 승인된 역할 정책으로 설정한다.
    ...(!transactionPooling ? {
      statement_timeout: statementTimeout,
      lock_timeout: Math.min(statementTimeout, boundedPoolInt(env.WEBDEX_PG_LOCK_MS, 5_000, 100, 300_000)),
      idle_in_transaction_session_timeout: boundedPoolInt(env.WEBDEX_PG_IDLE_TRANSACTION_MS, 15_000, 1_000, 300_000),
    } : {}),
  };
}

export function resolvePgShutdownTimeout(env: PgPoolEnvironment = process.env): number {
  return boundedPoolInt(env.WEBDEX_PG_SHUTDOWN_MS, 15_000, 1_000, 60_000);
}
