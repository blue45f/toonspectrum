import { randomUUID } from "node:crypto";

import { Logger, type INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import {
  Pool,
  type Notification,
  type PoolClient,
  type PoolConfig,
  type QueryConfig,
} from "pg";

import { normalizePgConnectionStringForTls } from "../../../../lib/db/pg-connection";

import {
  createLifecycleSafeStudioLivePostgresTransport,
  type StudioLivePostgresClusterTransport,
} from "./studio-postgres-pubsub";

import type { Server, ServerOptions } from "socket.io";

export const STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE = "socket_io_attachments";
export const STUDIO_LIVE_POSTGRES_CHANNEL_PREFIX = "toonspectrum:studio-live:v1";
export const STUDIO_LIVE_POSTGRES_PREFLIGHT_CHANNEL =
  "toonspectrum_studio_live_preflight_v1";
export const STUDIO_LIVE_POSTGRES_POOL_DEFAULT_MAX = 2;
export const STUDIO_LIVE_POSTGRES_POOL_MIN_MAX = 2;
export const STUDIO_LIVE_POSTGRES_POOL_MAX_MAX = 10;
export const STUDIO_LIVE_POSTGRES_PREFLIGHT_TIMEOUT_MS = 5_000;

const STUDIO_LIVE_POSTGRES_ERROR_MESSAGE_MAX_LENGTH = 512;
const STUDIO_LIVE_POSTGRES_ERROR_CODE_MAX_LENGTH = 64;

type EnvironmentSource = Partial<Record<string, string | undefined>>;
type StudioLiveAdapterLogger = Pick<Logger, "error" | "log">;
type StudioLiveClusterTransportFactory =
  typeof createLifecycleSafeStudioLivePostgresTransport;

export type StudioLiveClusterAdapterConfig =
  | { mode: "memory" }
  | {
      mode: "postgres";
      connectionString: string;
      poolMax: number;
      inlineBinaryPayloads: boolean;
    };

export interface StudioLivePostgresIoAdapterDependencies {
  createPool?: (config: PoolConfig) => Pool;
  preflight?: (pool: Pool) => Promise<void>;
  createTransport?: StudioLiveClusterTransportFactory;
  logger?: StudioLiveAdapterLogger;
}

export interface StudioLivePostgresPreflightOptions {
  nonce?: string;
  timeoutMs?: number;
}

function parsePoolMaximum(value: string | undefined): number {
  if (value == null || value.trim() === "") return STUDIO_LIVE_POSTGRES_POOL_DEFAULT_MAX;
  if (!/^\d+$/u.test(value.trim())) {
    throw new Error("STUDIO_LIVE_POSTGRES_POOL_MAX must be an integer");
  }
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < STUDIO_LIVE_POSTGRES_POOL_MIN_MAX ||
    parsed > STUDIO_LIVE_POSTGRES_POOL_MAX_MAX
  ) {
    throw new Error(
      `STUDIO_LIVE_POSTGRES_POOL_MAX must be between ${STUDIO_LIVE_POSTGRES_POOL_MIN_MAX} and ${STUDIO_LIVE_POSTGRES_POOL_MAX_MAX}`
    );
  }
  return parsed;
}

function parseInlineBinaryPayloadOptIn(value: string | undefined): boolean {
  const normalized = value?.trim();
  if (normalized == null || normalized === "" || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new Error(
    "STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED must be true or false"
  );
}

function isLoopbackPostgresHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(host)
  );
}

function parseDirectPostgresUrl(
  value: string | undefined,
  nodeEnvironment: string | undefined
): string {
  const connectionString = value?.trim();
  if (!connectionString) {
    throw new Error(
      "STUDIO_LIVE_POSTGRES_URL is required when STUDIO_LIVE_CLUSTER_ADAPTER=postgres"
    );
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("STUDIO_LIVE_POSTGRES_URL must be a valid PostgreSQL URL");
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !url.hostname ||
    !url.username ||
    !url.pathname ||
    url.pathname === "/" ||
    url.hash
  ) {
    throw new Error("STUDIO_LIVE_POSTGRES_URL must be a complete PostgreSQL URL");
  }
  const allowedQueryKeys = new Set(["sslmode", "channel_binding"]);
  const seenQueryKeys = new Set<string>();
  for (const [rawKey, rawValue] of url.searchParams) {
    const key = rawKey.toLowerCase();
    if (seenQueryKeys.has(key)) {
      throw new Error(
        `STUDIO_LIVE_POSTGRES_URL must not repeat the ${key} query parameter`
      );
    }
    seenQueryKeys.add(key);
    if (rawKey !== key || !allowedQueryKeys.has(key)) {
      throw new Error(
        "STUDIO_LIVE_POSTGRES_URL query parameters are limited to lowercase sslmode and channel_binding"
      );
    }
    if (key === "channel_binding") {
      const channelBinding = rawValue.trim().toLowerCase();
      if (!["disable", "prefer", "require"].includes(channelBinding)) {
        throw new Error(
          "STUDIO_LIVE_POSTGRES_URL channel_binding must be disable, prefer, or require"
        );
      }
    }
  }
  const host = url.hostname.toLowerCase();
  if (host.includes("pooler") || host.includes("pgbouncer")) {
    throw new Error(
      "STUDIO_LIVE_POSTGRES_URL must use a direct PostgreSQL endpoint because LISTEN is unavailable through a transaction pooler"
    );
  }
  const sslMode = url.searchParams.get("sslmode")?.trim().toLowerCase();
  const secureSslModes = new Set(["require", "verify-ca", "verify-full"]);
  const allowsLocalPlaintext =
    nodeEnvironment !== "production" && isLoopbackPostgresHost(host);
  if (!allowsLocalPlaintext && (!sslMode || !secureSslModes.has(sslMode))) {
    throw new Error(
      "STUDIO_LIVE_POSTGRES_URL must use sslmode=require, verify-ca, or verify-full; plaintext is allowed only for loopback development"
    );
  }
  return normalizePgConnectionStringForTls(connectionString);
}

export function resolveStudioLiveClusterAdapterConfig(
  source: EnvironmentSource = process.env
): StudioLiveClusterAdapterConfig {
  const mode = source.STUDIO_LIVE_CLUSTER_ADAPTER?.trim() || "memory";
  if (mode === "memory") return { mode };
  if (mode !== "postgres") {
    throw new Error("STUDIO_LIVE_CLUSTER_ADAPTER must be memory or postgres");
  }
  return {
    mode,
    connectionString: parseDirectPostgresUrl(
      source.STUDIO_LIVE_POSTGRES_URL,
      source.NODE_ENV
    ),
    poolMax: parsePoolMaximum(source.STUDIO_LIVE_POSTGRES_POOL_MAX),
    inlineBinaryPayloads: parseInlineBinaryPayloadOptIn(
      source.STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED
    ),
  };
}

function releasePreflightClient(client: PoolClient, failure: unknown): unknown {
  const destroyReason =
    failure == null
      ? undefined
      : failure instanceof Error
        ? failure
        : new Error("Studio live PostgreSQL preflight failed with a non-Error value", {
            cause: failure,
          });
  try {
    client.release(destroyReason);
    return failure;
  } catch (error) {
    return mergePreflightCleanupFailure(
      failure,
      error,
      "Studio live PostgreSQL preflight and client release both failed"
    );
  }
}

function mergePreflightCleanupFailure(
  failure: unknown,
  cleanupFailure: unknown,
  message: string
): unknown {
  if (!failure) return cleanupFailure;
  return new AggregateError([failure, cleanupFailure], message, {
    cause: cleanupFailure,
  });
}

function preflightQueryTimeout(timeoutMs: number): number {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error("Studio live PostgreSQL preflight timeout must be between 1 and 30000 ms");
  }
  return timeoutMs;
}

type TimedQueryConfig = QueryConfig & { query_timeout: number };

// node-postgres supports per-query query_timeout at runtime, but @types/pg does not expose that
// field on QueryConfig yet (it exposes only the pool/client-level setting).
function timedPreflightQuery(
  text: string,
  timeoutMs: number,
  values?: unknown[]
): TimedQueryConfig {
  return {
    text,
    values: values as QueryConfig["values"],
    query_timeout: timeoutMs,
  };
}

async function verifyStudioLiveAttachmentRoundTrip(
  pool: Pool,
  nonce: string,
  timeoutMs: number
): Promise<void> {
  const client = await pool.connect();
  const expectedPayload = Buffer.from(`toonspectrum-studio-live-preflight:${nonce}`, "utf8");
  let failure: unknown;
  let transactionOpen = false;
  try {
    await client.query(timedPreflightQuery("BEGIN", timeoutMs));
    transactionOpen = true;
    const inserted = await client.query<{ id: string }>(
      timedPreflightQuery(
        `INSERT INTO "${STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE}" ("payload") VALUES ($1) RETURNING "id"`,
        timeoutMs,
        [expectedPayload]
      )
    );
    const attachmentId = inserted.rows[0]?.id;
    if (!attachmentId) {
      throw new Error("Socket.IO attachment preflight INSERT did not return an id");
    }
    const selected = await client.query<{
      payload: Uint8Array;
      createdAt: Date | string | null;
      idType: string;
      createdAtType: string;
      payloadType: string;
    }>(
      timedPreflightQuery(
        `SELECT "payload", "created_at" AS "createdAt", pg_catalog.pg_typeof("id")::text AS "idType", pg_catalog.pg_typeof("created_at")::text AS "createdAtType", pg_catalog.pg_typeof("payload")::text AS "payloadType" FROM "${STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE}" WHERE "id" = $1`,
        timeoutMs,
        [attachmentId]
      )
    );
    const selectedAttachment = selected.rows[0];
    const actualPayload = selectedAttachment?.payload;
    if (
      !(actualPayload instanceof Uint8Array) ||
      !Buffer.from(actualPayload).equals(expectedPayload)
    ) {
      throw new Error("Socket.IO attachment preflight bytea roundtrip did not match");
    }
    if (
      selectedAttachment.createdAt == null ||
      !["bigint", "int8"].includes(selectedAttachment.idType) ||
      selectedAttachment.createdAtType !== "timestamp with time zone" ||
      selectedAttachment.payloadType !== "bytea"
    ) {
      throw new Error(
        "Socket.IO attachment preflight expected non-null created_at and int8/timestamptz/bytea columns"
      );
    }
    const deleted = await client.query(
      timedPreflightQuery(
        `DELETE FROM "${STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE}" WHERE "id" = $1`,
        timeoutMs,
        [attachmentId]
      )
    );
    if (deleted.rowCount !== 1) {
      throw new Error("Socket.IO attachment preflight DELETE did not remove its temporary row");
    }
  } catch (error) {
    failure = error;
  }
  if (transactionOpen) {
    try {
      // The temporary row is never committed, even though DELETE is executed to prove permission.
      await client.query(timedPreflightQuery("ROLLBACK", timeoutMs));
    } catch (error) {
      failure = mergePreflightCleanupFailure(
        failure,
        error,
        "Socket.IO attachment preflight and transaction cleanup both failed"
      );
    }
  }
  failure = releasePreflightClient(client, failure);
  if (failure) throw failure;
}

function waitForStudioLiveCrossSessionNotification(
  pool: Pool,
  listener: PoolClient,
  nonce: string,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      listener.off("notification", receive);
      listener.off("error", failOnListenerError);
      listener.off("end", failOnListenerEnd);
      if (error) reject(error);
      else resolve();
    };
    const receive = (notification: Notification): void => {
      if (
        notification.channel === STUDIO_LIVE_POSTGRES_PREFLIGHT_CHANNEL &&
        notification.payload === nonce
      ) {
        finish();
      }
    };
    const failOnListenerError = (error: Error): void => {
      finish(error);
    };
    const failOnListenerEnd = (): void => {
      finish(new Error("PostgreSQL preflight listener ended before notification delivery"));
    };
    const timeout = setTimeout(() => {
      finish(
        new Error(
          `PostgreSQL cross-session notification was not received within ${timeoutMs} ms`
        )
      );
    }, timeoutMs);
    listener.on("notification", receive);
    listener.on("error", failOnListenerError);
    listener.on("end", failOnListenerEnd);

    // `listener` remains checked out, so Pool.query must publish through a different session.
    try {
      void pool
        .query(
          timedPreflightQuery("SELECT pg_catalog.pg_notify($1, $2)", timeoutMs, [
            STUDIO_LIVE_POSTGRES_PREFLIGHT_CHANNEL,
            nonce,
          ])
        )
        .catch(finish);
    } catch (error) {
      finish(error);
    }
  });
}

/**
 * Proves the real cross-session LISTEN/NOTIFY contract and the adapter role's attachment
 * INSERT/SELECT/DELETE + bytea contract. The attachment probe is rolled back, and LISTEN is always
 * removed before the checked-out listener is returned or destroyed.
 */
export async function preflightStudioLivePostgresPool(
  pool: Pool,
  options: StudioLivePostgresPreflightOptions = {}
): Promise<void> {
  const timeoutMs = preflightQueryTimeout(
    options.timeoutMs ?? STUDIO_LIVE_POSTGRES_PREFLIGHT_TIMEOUT_MS
  );
  const nonce = options.nonce ?? randomUUID();
  const listener = await pool.connect();
  let failure: unknown;
  let listening = false;
  try {
    const result = await listener.query<{
      attachmentTable: string | null;
      createdAtDefault: string | null;
      hasCreatedAtIndex: boolean;
      hasPrimaryKey: boolean;
    }>(
      timedPreflightQuery(
        `SELECT
          to_regclass($1)::text AS "attachmentTable",
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint AS constraint_record
            WHERE constraint_record.conrelid = to_regclass($1)
              AND constraint_record.contype = 'p'
              AND cardinality(constraint_record.conkey) = 1
              AND (
                SELECT attribute.attname
                FROM pg_catalog.pg_attribute AS attribute
                WHERE attribute.attrelid = constraint_record.conrelid
                  AND attribute.attnum = constraint_record.conkey[1]
              ) = 'id'
          ) AS "hasPrimaryKey",
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_index AS index_record
            JOIN pg_catalog.pg_attribute AS attribute
              ON attribute.attrelid = index_record.indrelid
             AND attribute.attnum = ANY(index_record.indkey::smallint[])
            WHERE index_record.indrelid = to_regclass($1)
              AND index_record.indisvalid
              AND attribute.attname = 'created_at'
          ) AS "hasCreatedAtIndex",
          (
            SELECT pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid)
            FROM pg_catalog.pg_attribute AS attribute
            JOIN pg_catalog.pg_attrdef AS default_record
              ON default_record.adrelid = attribute.attrelid
             AND default_record.adnum = attribute.attnum
            WHERE attribute.attrelid = to_regclass($1)
              AND attribute.attname = 'created_at'
          ) AS "createdAtDefault"`,
        timeoutMs,
        [STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE]
      )
    );
    const catalog = result.rows[0];
    if (!catalog?.attachmentTable) {
      throw new Error(
        `${STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE} is missing; apply the database migrations first`
      );
    }
    const normalizedCreatedAtDefault = catalog.createdAtDefault
      ?.replaceAll(/\s+/gu, "")
      .toLowerCase();
    if (
      !catalog.hasPrimaryKey ||
      !catalog.hasCreatedAtIndex ||
      !["now()", "current_timestamp"].includes(normalizedCreatedAtDefault ?? "")
    ) {
      throw new Error(
        "Socket.IO attachment table must have an id primary key, a valid created_at index, and a current timestamp default"
      );
    }
    await listener.query(
      timedPreflightQuery(
        `LISTEN "${STUDIO_LIVE_POSTGRES_PREFLIGHT_CHANNEL}"`,
        timeoutMs
      )
    );
    listening = true;
    await waitForStudioLiveCrossSessionNotification(pool, listener, nonce, timeoutMs);
    await verifyStudioLiveAttachmentRoundTrip(pool, nonce, timeoutMs);
  } catch (error) {
    failure = error;
  }
  if (listening) {
    try {
      await listener.query(
        timedPreflightQuery(
          `UNLISTEN "${STUDIO_LIVE_POSTGRES_PREFLIGHT_CHANNEL}"`,
          timeoutMs
        )
      );
    } catch (error) {
      failure = mergePreflightCleanupFailure(
        failure,
        error,
        "Studio live PostgreSQL preflight and listener cleanup both failed"
      );
    }
  }
  failure = releasePreflightClient(listener, failure);
  if (failure) throw failure;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function decodeCredential(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function postgresCredentialValues(connectionString: string): string[] {
  const url = new URL(connectionString);
  const encodedPassword = url.password;
  const encodedUserInfo = `${url.username}:${url.password}`;
  return [
    connectionString,
    encodedUserInfo,
    decodeCredential(encodedUserInfo),
    encodedPassword,
    decodeCredential(encodedPassword),
  ]
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);
}

function redactPostgresErrorMessage(
  error: unknown,
  sensitiveValues: readonly string[] = []
): string {
  let message = errorMessage(error).replace(
    /(postgres(?:ql)?:\/\/)[^@\s/]+@/giu,
    "$1[REDACTED]@"
  );
  for (const sensitiveValue of sensitiveValues) {
    message = message.replaceAll(sensitiveValue, "[REDACTED]");
  }
  return message;
}

function boundedPostgresErrorMessage(
  error: unknown,
  sensitiveValues: readonly string[] = []
): string {
  return redactPostgresErrorMessage(error, sensitiveValues).slice(
    0,
    STUDIO_LIVE_POSTGRES_ERROR_MESSAGE_MAX_LENGTH
  );
}

function boundedPostgresErrorCode(
  error: unknown,
  sensitiveValues: readonly string[] = []
): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = Reflect.get(error, "code");
  return typeof code === "string"
    ? redactPostgresErrorMessage(new Error(code), sensitiveValues).slice(
        0,
        STUDIO_LIVE_POSTGRES_ERROR_CODE_MAX_LENGTH
      )
    : undefined;
}

export interface StudioLivePostgresPoolErrorGuardLease {
  dispose(): void;
}

const postgresPoolErrorGuardStates = new WeakMap<Pool, StudioLivePostgresPoolErrorGuardState>();

interface GuardedPostgresClient {
  checkedOut: boolean;
  releaseScheduled: boolean;
  readonly errorListener: (error: Error) => void;
}

class StudioLivePostgresPoolErrorGuardState {
  private referenceCount = 0;
  private readonly clients = new Map<PoolClient, GuardedPostgresClient>();

  private readonly poolErrorListener = (error: Error): void => {
    this.logError(
      error,
      "idle-pool-client",
      "studio live PostgreSQL adapter pool emitted an idle-client error"
    );
  };

  private readonly poolConnectListener = (client: PoolClient): void => {
    this.ensureClientGuard(client);
  };

  private readonly poolAcquireListener = (client: PoolClient): void => {
    const guarded = this.ensureClientGuard(client);
    guarded.checkedOut = true;
    guarded.releaseScheduled = false;
  };

  private readonly poolReleaseListener = (_error: Error, client: PoolClient): void => {
    const guarded = this.clients.get(client);
    if (!guarded) return;
    guarded.checkedOut = false;
    guarded.releaseScheduled = false;
  };

  private readonly poolRemoveListener = (client: PoolClient): void => {
    const guarded = this.clients.get(client);
    if (!guarded) return;
    client.off("error", guarded.errorListener);
    this.clients.delete(client);
  };

  constructor(
    private readonly pool: Pool,
    private readonly logger: StudioLiveAdapterLogger,
    private readonly sensitiveValues: readonly string[]
  ) {
    pool.on("error", this.poolErrorListener);
    pool.on("connect", this.poolConnectListener);
    pool.on("acquire", this.poolAcquireListener);
    pool.on("release", this.poolReleaseListener);
    pool.on("remove", this.poolRemoveListener);
  }

  acquire(): StudioLivePostgresPoolErrorGuardLease {
    this.referenceCount += 1;
    let released = false;
    return {
      dispose: () => {
        if (released) return;
        released = true;
        this.referenceCount -= 1;
        if (this.referenceCount === 0) this.dispose();
      },
    };
  }

  private dispose(): void {
    this.pool.off("error", this.poolErrorListener);
    this.pool.off("connect", this.poolConnectListener);
    this.pool.off("acquire", this.poolAcquireListener);
    this.pool.off("release", this.poolReleaseListener);
    this.pool.off("remove", this.poolRemoveListener);
    for (const [client, guarded] of this.clients) {
      client.off("error", guarded.errorListener);
    }
    this.clients.clear();
    postgresPoolErrorGuardStates.delete(this.pool);
  }

  private ensureClientGuard(client: PoolClient): GuardedPostgresClient {
    const existing = this.clients.get(client);
    if (existing) return existing;
    const guarded: GuardedPostgresClient = {
      checkedOut: false,
      releaseScheduled: false,
      errorListener: (error) => this.handleClientError(client, error),
    };
    this.clients.set(client, guarded);
    client.on("error", guarded.errorListener);
    return guarded;
  }

  private handleClientError(client: PoolClient, error: Error): void {
    const guarded = this.clients.get(client);
    // pg-pool forwards idle errors through pool.error; logging here too would duplicate them.
    if (!guarded?.checkedOut) return;
    this.logError(
      error,
      "checked-out-client",
      "studio live PostgreSQL adapter client emitted an error"
    );
    if (guarded.releaseScheduled) return;
    guarded.releaseScheduled = true;
    // pool.query installs its own synchronous error listener that releases first. Deferring lets
    // that path win and avoids pg-pool's double-release exception; the long-held adapter LISTEN
    // client has no such handler, so this fallback destroys and returns its leaked pool slot.
    setImmediate(() => {
      const current = this.clients.get(client);
      if (current !== guarded || !guarded.checkedOut || !guarded.releaseScheduled) return;
      guarded.checkedOut = false;
      guarded.releaseScheduled = false;
      try {
        client.release(error);
      } catch (releaseError) {
        this.logError(
          releaseError instanceof Error ? releaseError : new Error("unknown release failure"),
          "checked-out-client-release",
          "studio live PostgreSQL adapter client failed to release after an error"
        );
      }
    });
  }

  private logError(error: Error, source: string, message: string): void {
    this.logger.error(
      {
        source,
        error: boundedPostgresErrorMessage(error, this.sensitiveValues),
        code: boundedPostgresErrorCode(error, this.sensitiveValues),
      },
      message
    );
  }
}

function acquireStudioLivePostgresPoolErrorGuard(
  pool: Pool,
  logger: StudioLiveAdapterLogger,
  sensitiveValues: readonly string[] = []
): StudioLivePostgresPoolErrorGuardLease {
  let state = postgresPoolErrorGuardStates.get(pool);
  if (!state) {
    state = new StudioLivePostgresPoolErrorGuardState(pool, logger, sensitiveValues);
    postgresPoolErrorGuardStates.set(pool, state);
  }
  return state.acquire();
}

export class StudioLivePostgresIoAdapter extends IoAdapter {
  private readonly serverClosePromises = new WeakMap<Server, Promise<void>>();
  private poolClosePromise: Promise<void> | null = null;
  private readonly poolErrorGuardLease: StudioLivePostgresPoolErrorGuardLease;

  constructor(
    application: INestApplicationContext,
    private readonly pool: Pool,
    private readonly clusterTransport: StudioLivePostgresClusterTransport,
    logger: StudioLiveAdapterLogger = new Logger(
      StudioLivePostgresIoAdapter.name
    ),
    poolErrorGuardLease?: StudioLivePostgresPoolErrorGuardLease,
    private readonly sensitiveValues: readonly string[] = []
  ) {
    super(application);
    this.poolErrorGuardLease =
      poolErrorGuardLease ??
      acquireStudioLivePostgresPoolErrorGuard(pool, logger, sensitiveValues);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.clusterTransport.adapterConstructor);
    return server;
  }

  async disposePool(): Promise<void> {
    this.poolClosePromise ??= (async () => {
      let transportFailure: unknown;
      try {
        await this.clusterTransport.close();
      } catch (error) {
        transportFailure = error;
      }
      let poolFailure: unknown;
      try {
        await this.pool.end();
      } catch (error) {
        poolFailure = error;
      } finally {
        // Keep checked-out client guards alive for the full pool shutdown, then detach exactly once.
        this.poolErrorGuardLease.dispose();
      }
      if (transportFailure || poolFailure) {
        const failures = [transportFailure, poolFailure].filter(Boolean);
        throw new Error(
          `Studio live PostgreSQL transport shutdown failed: ${failures
            .map((failure) =>
              boundedPostgresErrorMessage(failure, this.sensitiveValues)
            )
            .join("; ")}`
        );
      }
    })();
    return this.poolClosePromise;
  }

  override close(server: Server): Promise<void> {
    const pending = this.serverClosePromises.get(server);
    if (pending) return pending;
    const closing = this.closeServerAndPool(server);
    this.serverClosePromises.set(server, closing);
    return closing;
  }

  private async closeServerAndPool(server: Server): Promise<void> {
    let serverFailure: unknown;
    try {
      await super.close(server);
    } catch (error) {
      serverFailure = error;
    }
    try {
      await this.disposePool();
    } catch (error) {
      if (serverFailure) {
        throw new AggregateError(
          [serverFailure, error],
          "Socket.IO server and PostgreSQL adapter pool both failed to close",
          { cause: error }
        );
      }
      throw error;
    }
    if (serverFailure) throw serverFailure;
  }
}

function createPoolConfig(config: Extract<StudioLiveClusterAdapterConfig, { mode: "postgres" }>): PoolConfig {
  return {
    connectionString: config.connectionString,
    max: config.poolMax,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: STUDIO_LIVE_POSTGRES_PREFLIGHT_TIMEOUT_MS,
    allowExitOnIdle: false,
  };
}

export async function createStudioLivePostgresIoAdapter(
  application: INestApplicationContext,
  source: EnvironmentSource = process.env,
  dependencies: StudioLivePostgresIoAdapterDependencies = {}
): Promise<StudioLivePostgresIoAdapter | null> {
  const config = resolveStudioLiveClusterAdapterConfig(source);
  if (config.mode === "memory") return null;

  const logger = dependencies.logger ?? new Logger(StudioLivePostgresIoAdapter.name);
  const pool = (dependencies.createPool ?? ((poolConfig) => new Pool(poolConfig)))(
    createPoolConfig(config)
  );
  const sensitiveValues = postgresCredentialValues(config.connectionString);
  // Register before preflight creates any clients and before the lifecycle-safe transport checks
  // out its long-lived LISTEN client. pg removes its idle error handler while a client is checked out.
  const poolErrorGuardLease = acquireStudioLivePostgresPoolErrorGuard(
    pool,
    logger,
    sensitiveValues
  );
  let clusterTransport: StudioLivePostgresClusterTransport | null = null;
  try {
    await (dependencies.preflight ?? preflightStudioLivePostgresPool)(pool);
    clusterTransport = await (
      dependencies.createTransport ?? createLifecycleSafeStudioLivePostgresTransport
    )(pool, {
      channelPrefix: STUDIO_LIVE_POSTGRES_CHANNEL_PREFIX,
      tableName: STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE,
      inlineBinaryPayloads: config.inlineBinaryPayloads,
      errorHandler: (error, source) => {
        logger.error(
          {
            source,
            error: boundedPostgresErrorMessage(error, sensitiveValues),
            code: boundedPostgresErrorCode(error, sensitiveValues),
          },
          "studio live PostgreSQL Socket.IO transport operation failed"
        );
      },
      queryTimeoutMs: STUDIO_LIVE_POSTGRES_PREFLIGHT_TIMEOUT_MS,
    });
  } catch (error) {
    try {
      await clusterTransport?.close();
    } catch (closeError) {
      logger.error(
        {
          source: "transport-close",
          error: boundedPostgresErrorMessage(closeError, sensitiveValues),
          code: boundedPostgresErrorCode(closeError, sensitiveValues),
        },
        "studio live PostgreSQL transport failed to close after initialization rejection"
      );
    }
    try {
      await pool.end();
    } catch (closeError) {
      logger.error(
        {
          source: "preflight-pool-close",
          error: boundedPostgresErrorMessage(closeError, sensitiveValues),
          code: boundedPostgresErrorCode(closeError, sensitiveValues),
        },
        "studio live PostgreSQL adapter pool failed to close after preflight rejection"
      );
    } finally {
      poolErrorGuardLease.dispose();
    }
    const boundedCode = boundedPostgresErrorCode(error, sensitiveValues);
    // The raw database error can contain connection-string credentials. Deliberately do not attach
    // it as `cause`; callers receive only the bounded, redacted operational summary.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(
      `Studio live PostgreSQL adapter initialization failed: ${boundedPostgresErrorMessage(error, sensitiveValues)}${boundedCode ? ` [${boundedCode}]` : ""}`
    );
  }
  logger.log(
    {
      poolMax: config.poolMax,
      channelPrefix: STUDIO_LIVE_POSTGRES_CHANNEL_PREFIX,
      inlineBinaryPayloads: config.inlineBinaryPayloads,
    },
    "studio live PostgreSQL Socket.IO adapter LISTEN channels are ready"
  );
  return new StudioLivePostgresIoAdapter(
    application,
    pool,
    clusterTransport,
    logger,
    poolErrorGuardLease,
    sensitiveValues
  );
}
