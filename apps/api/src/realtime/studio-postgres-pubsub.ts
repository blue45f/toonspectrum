import { decode, encode } from "@msgpack/msgpack";
import { PostgresAdapter } from "@socket.io/postgres-adapter";

import type { Pool, PoolClient, QueryConfig } from "pg";

export const STUDIO_LIVE_REQUIRED_NAMESPACES = ["/", "/studio-live"] as const;

const POSTGRES_CHANNEL_IDENTIFIER_MAX_BYTES = 63;
const DEFAULT_PAYLOAD_THRESHOLD_BYTES = 8_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 30_000;
const DEFAULT_QUERY_TIMEOUT_MS = 5_000;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;

type ErrorHandler = (error: unknown, source: string) => void;

interface ClusterEnvelope {
  readonly nsp: string;
  readonly type: number;
  readonly uid?: string;
  readonly attachmentId?: string | number;
  readonly [key: string]: unknown;
}

interface SocketIoNamespaceLike {
  readonly name: string;
}

interface OfficialAdapterRuntime {
  readonly uid: string;
  close(): void;
  onMessage(message: ClusterEnvelope): void;
}

interface ActiveListener {
  readonly client: PoolClient;
  readonly fail: (error: Error) => void;
  readonly end: () => void;
  readonly notification: (notification: { channel: string; payload?: string }) => void;
}

type SocketIoAdapterConstructor = ((namespace: unknown) => PostgresAdapter) &
  (new (namespace: unknown) => PostgresAdapter);

export interface StudioLivePostgresClusterTransport {
  readonly adapterConstructor: SocketIoAdapterConstructor;
  close(): Promise<void>;
}

export interface StudioLivePostgresClusterTransportOptions {
  readonly channelPrefix: string;
  readonly tableName: string;
  readonly errorHandler: ErrorHandler;
  readonly payloadThreshold?: number;
  readonly cleanupIntervalMs?: number;
  readonly queryTimeoutMs?: number;
  readonly reconnectDelayMs?: number;
  readonly requiredNamespaces?: readonly string[];
}

type TimedQueryConfig = QueryConfig & { query_timeout: number };

function timedQuery(text: string, timeoutMs: number, values?: unknown[]): TimedQueryConfig {
  return {
    text,
    values: values as QueryConfig["values"],
    query_timeout: timeoutMs,
  };
}

function asError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function channelForNamespace(prefix: string, namespace: string): string {
  const channel = `${prefix}#${namespace}`;
  if (Buffer.byteLength(channel, "utf8") > POSTGRES_CHANNEL_IDENTIFIER_MAX_BYTES) {
    throw new Error("Studio live PostgreSQL channel exceeds the 63-byte identifier limit");
  }
  return channel;
}

function hasBinary(value: unknown, visited = new WeakSet<object>()): boolean {
  if (value == null || typeof value !== "object") return false;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (visited.has(value)) return false;
  visited.add(value);
  if (Array.isArray(value)) return value.some((item) => hasBinary(item, visited));
  return Object.values(value).some((item) => hasBinary(item, visited));
}

function isClusterEnvelope(value: unknown): value is ClusterEnvelope {
  return (
    value != null &&
    typeof value === "object" &&
    typeof Reflect.get(value, "nsp") === "string" &&
    typeof Reflect.get(value, "type") === "number"
  );
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, timeoutMs);
    void operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export class LifecycleSafePostgresPubSub {
  private readonly channels = new Set<string>();
  private readonly operations = new Set<Promise<unknown>>();
  private readonly pendingAcquisitions = new Set<Promise<void>>();
  private activeListener: ActiveListener | null = null;
  private pendingInitialization: Promise<void> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closePromise: Promise<void> | null = null;
  private closed = false;
  private started = false;

  constructor(
    private readonly pool: Pool,
    private readonly options: Required<
      Pick<
        StudioLivePostgresClusterTransportOptions,
        | "channelPrefix"
        | "tableName"
        | "payloadThreshold"
        | "cleanupIntervalMs"
        | "queryTimeoutMs"
        | "reconnectDelayMs"
      >
    > & { readonly errorHandler: ErrorHandler },
    private readonly isFromSelf: (message: ClusterEnvelope) => boolean,
    private readonly onMessage: (message: ClusterEnvelope) => void
  ) {}

  async start(namespaces: readonly string[]): Promise<void> {
    if (this.started) return;
    if (this.closed) throw new Error("Studio live PostgreSQL transport is closed");
    for (const namespace of namespaces) this.channels.add(this.channel(namespace));
    await this.initializeListener();
    if (this.closed) throw new Error("Studio live PostgreSQL transport closed during start");
    this.started = true;
    this.cleanupTimer = setInterval(() => {
      if (this.closed) return;
      const cleanup = this.queryPool(
        `DELETE FROM ${quoteIdentifier(this.options.tableName)} WHERE "created_at" < now() - ($1 * interval '1 millisecond')`,
        [this.options.cleanupIntervalMs]
      ).catch((error: unknown) => {
        this.options.errorHandler(error, "attachment-cleanup");
      });
      this.track(cleanup);
    }, this.options.cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  async addNamespace(namespace: string): Promise<void> {
    const channel = this.channel(namespace);
    if (this.channels.has(channel)) return;
    this.channels.add(channel);
    const active = this.activeListener;
    if (!active || this.closed) return;
    try {
      await this.queryClient(active.client, `LISTEN ${quoteIdentifier(channel)}`);
    } catch (error) {
      active.fail(asError(error, "Dynamic namespace LISTEN failed"));
      throw error;
    }
  }

  async publish(value: unknown): Promise<void> {
    if (this.closed) throw new Error("Studio live PostgreSQL transport is closed");
    if (!isClusterEnvelope(value)) {
      throw new Error("Studio live PostgreSQL adapter received an invalid cluster envelope");
    }
    const operation = this.publishEnvelope(value).catch((error: unknown) => {
      this.options.errorHandler(error, "publish");
      throw error;
    });
    return this.track(operation);
  }

  close(): Promise<void> {
    this.closePromise ??= this.closeInternal();
    return this.closePromise;
  }

  private async closeInternal(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.reconnectTimer = null;
    this.cleanupTimer = null;

    try {
      await this.pendingInitialization;
    } catch {
      // The initialization path already destroyed its checked-out client and reported the error.
    }
    try {
      await withTimeout(
        Promise.all([...this.pendingAcquisitions]).then(() => undefined),
        this.options.queryTimeoutMs,
        `PostgreSQL pending acquisition shutdown timed out after ${this.options.queryTimeoutMs} ms`
      );
    } catch (error) {
      // A node-postgres Pool also enforces connectionTimeoutMillis. This second deadline keeps the
      // injected/fake-pool contract bounded; a client that resolves later is still destroyed by
      // acquireClient's late-resolution handler.
      this.options.errorHandler(error, "pending-acquisition-close");
    }
    await Promise.all(
      [...this.operations].map((operation) => operation.catch(() => undefined))
    );

    const active = this.activeListener;
    this.activeListener = null;
    if (!active) return;
    this.detach(active);
    let failure: Error | undefined;
    try {
      await this.queryClient(active.client, "UNLISTEN *");
    } catch (error) {
      failure = asError(error, "PostgreSQL UNLISTEN failed during shutdown");
      this.options.errorHandler(failure, "listener-close");
    }
    this.release(active.client, failure);
  }

  private initializeListener(): Promise<void> {
    if (this.pendingInitialization) return this.pendingInitialization;
    const initialization = this.initializeListenerOnce();
    this.pendingInitialization = initialization.finally(() => {
      if (this.pendingInitialization === initializationWithCleanup) {
        this.pendingInitialization = null;
      }
    });
    const initializationWithCleanup = this.pendingInitialization;
    return initializationWithCleanup;
  }

  private async initializeListenerOnce(): Promise<void> {
    let client: PoolClient | null = null;
    let listener: ActiveListener | null = null;
    let failed = false;
    let initializationFailureReject: ((error: Error) => void) | null = null;
    const initializationFailure = new Promise<never>((_resolve, reject) => {
      initializationFailureReject = reject;
    });
    try {
      client = await this.acquireClient();
      if (this.closed) {
        this.release(client);
        return;
      }
      const fail = (error: Error): void => {
        if (failed) return;
        failed = true;
        if (listener) this.detach(listener);
        if (this.activeListener === listener) this.activeListener = null;
        this.release(client!, error);
        initializationFailureReject?.(error);
        if (this.started && !this.closed) this.scheduleReconnect(error);
      };
      const notification = (message: { channel: string; payload?: string }): void => {
        const operation = this.handleNotification(message).catch((error: unknown) => {
          this.options.errorHandler(error, "notification");
        });
        this.track(operation);
      };
      const end = (): void => fail(new Error("PostgreSQL LISTEN client ended"));
      listener = { client, fail, end, notification };
      client.on("notification", notification);
      client.on("error", fail);
      client.on("end", end);

      for (const channel of this.channels) {
        await Promise.race([
          this.queryClient(client, `LISTEN ${quoteIdentifier(channel)}`),
          initializationFailure,
        ]);
      }
      if (failed) throw new Error("PostgreSQL LISTEN client failed during initialization");
      if (this.closed) {
        this.detach(listener);
        this.release(client);
        return;
      }
      this.activeListener = listener;
    } catch (error) {
      const failure = asError(error, "PostgreSQL listener initialization failed");
      if (listener) this.detach(listener);
      if (client && !failed && this.activeListener !== listener) this.release(client, failure);
      throw failure;
    }
  }

  private async acquireClient(): Promise<PoolClient> {
    const operation = this.pool.connect();
    const acquisition = new Promise<PoolClient>((resolve, reject) => {
      let settled = false;
      const timeoutFailure = new Error(
        `PostgreSQL listener acquisition timed out after ${this.options.queryTimeoutMs} ms`
      );
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(timeoutFailure);
      }, this.options.queryTimeoutMs);
      void operation.then(
        (client) => {
          if (settled) {
            this.release(client, timeoutFailure);
            return;
          }
          settled = true;
          clearTimeout(timeout);
          resolve(client);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      );
    });
    const settlement = operation.then(
      () => undefined,
      () => undefined
    );
    this.pendingAcquisitions.add(settlement);
    void settlement.finally(() => this.pendingAcquisitions.delete(settlement));
    return acquisition;
  }

  private scheduleReconnect(failure: Error): void {
    if (this.closed || this.reconnectTimer) return;
    this.options.errorHandler(failure, "listener-reconnect");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed) return;
      void this.initializeListener().catch((error: unknown) => {
        this.scheduleReconnect(asError(error, "PostgreSQL listener reconnect failed"));
      });
    }, this.options.reconnectDelayMs);
    this.reconnectTimer.unref?.();
  }

  private async publishEnvelope(message: ClusterEnvelope): Promise<void> {
    const json = JSON.stringify(message);
    if (hasBinary(message) || Buffer.byteLength(json, "utf8") >= this.options.payloadThreshold) {
      const stored = await this.queryPool<{ id: string }>(
        `INSERT INTO ${quoteIdentifier(this.options.tableName)} ("payload") VALUES ($1) RETURNING "id"`,
        [encode(message)]
      );
      const attachmentId = stored.rows[0]?.id;
      if (!attachmentId) throw new Error("Socket.IO attachment INSERT did not return an id");
      await this.notify(message.nsp, JSON.stringify({
        nsp: message.nsp,
        uid: message.uid,
        type: message.type,
        attachmentId,
      }));
      return;
    }
    await this.notify(message.nsp, json);
  }

  private async notify(namespace: string, payload: string): Promise<void> {
    await this.queryPool("SELECT pg_catalog.pg_notify($1, $2)", [
      this.channel(namespace),
      payload,
    ]);
  }

  private async handleNotification(notification: {
    channel: string;
    payload?: string;
  }): Promise<void> {
    if (!notification.payload || !this.channels.has(notification.channel)) return;
    const header: unknown = JSON.parse(notification.payload);
    if (!isClusterEnvelope(header) || this.isFromSelf(header)) return;
    let message = header;
    if (header.attachmentId != null) {
      const result = await this.queryPool<{ payload: Uint8Array }>(
        `SELECT "payload" FROM ${quoteIdentifier(this.options.tableName)} WHERE "id" = $1`,
        [header.attachmentId]
      );
      const payload = result.rows[0]?.payload;
      if (!(payload instanceof Uint8Array)) {
        throw new Error("Socket.IO attachment notification referenced a missing payload");
      }
      const decoded: unknown = decode(payload);
      if (!isClusterEnvelope(decoded)) {
        throw new Error("Socket.IO attachment decoded to an invalid cluster envelope");
      }
      message = decoded;
      if (this.isFromSelf(message)) return;
    }
    this.onMessage(message);
  }

  private channel(namespace: string): string {
    return channelForNamespace(this.options.channelPrefix, namespace);
  }

  private async queryClient<T extends Record<string, unknown> = Record<string, unknown>>(
    client: PoolClient,
    text: string,
    values?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    return withTimeout(
      client.query<T>(timedQuery(text, this.options.queryTimeoutMs, values)),
      this.options.queryTimeoutMs,
      `PostgreSQL listener query timed out after ${this.options.queryTimeoutMs} ms`
    );
  }

  private async queryPool<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    return withTimeout(
      this.pool.query<T>(timedQuery(text, this.options.queryTimeoutMs, values)),
      this.options.queryTimeoutMs,
      `PostgreSQL adapter query timed out after ${this.options.queryTimeoutMs} ms`
    );
  }

  private detach(listener: ActiveListener): void {
    listener.client.off("notification", listener.notification);
    listener.client.off("error", listener.fail);
    listener.client.off("end", listener.end);
  }

  private release(client: PoolClient, failure?: Error): void {
    try {
      client.release(failure);
    } catch (error) {
      this.options.errorHandler(error, "client-release");
    }
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.operations.add(operation);
    void operation.finally(() => this.operations.delete(operation)).catch(() => undefined);
    return operation;
  }
}

/**
 * Reuses Socket.IO's official PostgresAdapter cluster/heartbeat semantics while replacing its
 * fire-and-forget PubSubClient with a readiness-aware, cancellation-safe local transport.
 */
export async function createLifecycleSafeStudioLivePostgresTransport(
  pool: Pool,
  options: StudioLivePostgresClusterTransportOptions
): Promise<StudioLivePostgresClusterTransport> {
  const namespaces = new Map<string, OfficialAdapterRuntime>();
  const errorHandler = options.errorHandler;
  const transport = new LifecycleSafePostgresPubSub(
    pool,
    {
      channelPrefix: options.channelPrefix,
      tableName: options.tableName,
      payloadThreshold: options.payloadThreshold ?? DEFAULT_PAYLOAD_THRESHOLD_BYTES,
      cleanupIntervalMs: options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS,
      queryTimeoutMs: options.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
      reconnectDelayMs: options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
      errorHandler,
    },
    (message) => namespaces.get(message.nsp)?.uid === message.uid,
    (message) => namespaces.get(message.nsp)?.onMessage(message)
  );
  try {
    await transport.start(options.requiredNamespaces ?? STUDIO_LIVE_REQUIRED_NAMESPACES);
  } catch (error) {
    await transport.close();
    throw error;
  }

  // Socket.IO installs adapters with `new (server.adapter())(namespace)`. Keep this as a real class;
  // an arrow-function factory type-checks structurally but fails at runtime because it is not
  // constructible.
  class StudioLiveNamespacePostgresAdapter extends PostgresAdapter {
    constructor(namespace: unknown) {
      const runtimeNamespace = namespace as SocketIoNamespaceLike;
      super(runtimeNamespace, {}, transport as never);
      const runtime = this as unknown as OfficialAdapterRuntime;
      namespaces.set(runtimeNamespace.name, runtime);
      void transport.addNamespace(runtimeNamespace.name).catch((error: unknown) => {
        errorHandler(error, "namespace-listen");
      });
      const defaultClose = runtime.close.bind(runtime);
      runtime.close = () => {
        namespaces.delete(runtimeNamespace.name);
        defaultClose();
      };
    }
  }

  return {
    // Socket.IO's public type also permits a callable factory even though its runtime uses `new`.
    // The local class satisfies the required runtime construct signature; the intersection records
    // both sides of that upstream typing contract for Server#adapter.
    adapterConstructor:
      StudioLiveNamespacePostgresAdapter as unknown as SocketIoAdapterConstructor,
    close: () => transport.close(),
  };
}
