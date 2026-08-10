import {
  SqliteUnavailableError,
  StudioCrdtOutboxSqlCapacityError,
  StudioCrdtRecoverySqlCapacityError,
} from "./studio-local-database";
import {
  STUDIO_LOCAL_DATABASE_RPC_METHODS,
  STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
  isStudioLocalDatabaseWorkerResponse,
  type StudioLocalDatabaseRpcMethod,
  type StudioLocalDatabaseWorkerRequest,
  type StudioLocalDatabaseWorkerSerializedError,
} from "./studio-local-database-worker-protocol";

import type {
  StudioAsyncKeyValueStore,
  StudioBrushLibraryDatabase,
  StudioCrdtOutboxDatabase,
  StudioCrdtRecoveryDatabase,
  StudioFilterLibraryDatabase,
  StudioLocalDatabase,
} from "./studio-local-database";

const DEFAULT_READY_TIMEOUT_MS = 15_000;

type StudioLocalDatabaseWorkerProxy = StudioBrushLibraryDatabase
  & StudioFilterLibraryDatabase
  & StudioCrdtOutboxDatabase
  & StudioCrdtRecoveryDatabase;

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

export interface OpenStudioLocalDatabaseWorkerOptions {
  /** Test seam. Product code always creates the Vite-emitted same-origin module Worker. */
  readonly createWorker?: () => Worker;
  readonly readyTimeoutMs?: number;
}

function deserializeError(remote: StudioLocalDatabaseWorkerSerializedError): Error {
  let error: Error;
  if (remote.name === "SqliteUnavailableError") {
    error = new SqliteUnavailableError(remote.reason ?? remote.message);
  } else if (
    remote.name === "StudioCrdtOutboxSqlCapacityError"
    && remote.entryCount !== undefined
    && remote.totalBytes !== undefined
  ) {
    error = new StudioCrdtOutboxSqlCapacityError(remote.entryCount, remote.totalBytes);
  } else if (
    remote.name === "StudioCrdtRecoverySqlCapacityError"
    && remote.rowCount !== undefined
    && remote.totalBytes !== undefined
  ) {
    error = new StudioCrdtRecoverySqlCapacityError(remote.rowCount, remote.totalBytes);
  } else {
    error = new Error(remote.message);
    error.name = remote.name;
  }
  if (remote.stack !== undefined) {
    error.stack = `${error.stack ?? `${error.name}: ${error.message}`}\nWorker stack:\n${remote.stack}`;
  }
  return error;
}

function workerEventError(event: ErrorEvent): SqliteUnavailableError {
  const detail = event.message.length > 0 ? event.message : "unknown Worker startup error";
  return new SqliteUnavailableError(`SQLite Dedicated Worker failed: ${detail}`);
}

class StudioLocalDatabaseWorkerRpcClient {
  readonly database: StudioLocalDatabaseWorkerProxy;

  private readonly pending = new Map<number, PendingRequest>();
  private readonly readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (reason: unknown) => void;
  private readySettled = false;
  private closing = false;
  private closed = false;
  private closePromise: Promise<void> | null = null;
  private terminated = false;
  private nextRequestId = 1;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly worker: Worker,
    readyTimeoutMs: number,
  ) {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleError);
    this.worker.addEventListener("messageerror", this.handleMessageError);
    this.readyTimer = setTimeout(() => {
      this.fail(
        new SqliteUnavailableError(
          `SQLite Dedicated Worker did not become ready within ${readyTimeoutMs}ms`,
        ),
      );
    }, readyTimeoutMs);

    const methods = Object.fromEntries(
      STUDIO_LOCAL_DATABASE_RPC_METHODS.map((method) => [
        method,
        (...args: readonly unknown[]) => this.call(method, args),
      ]),
    );
    this.database = Object.assign(methods, {
      asAsyncKeyValueStore: (namespace: string): StudioAsyncKeyValueStore => ({
        get: (key) => this.call("kvGet", [namespace, key]) as Promise<string | null>,
        set: (key, value) => this.call("kvSet", [namespace, key, value]) as Promise<void>,
        delete: (key) => this.call("kvDelete", [namespace, key]) as Promise<void>,
      }),
      close: () => this.close(),
    }) as unknown as StudioLocalDatabaseWorkerProxy;
  }

  async ready(): Promise<void> {
    return this.readyPromise;
  }

  private settleReady(resolve: boolean, reason?: unknown): void {
    if (this.readySettled) return;
    this.readySettled = true;
    if (this.readyTimer !== null) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    if (resolve) this.readyResolve();
    else this.readyReject(reason);
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (!isStudioLocalDatabaseWorkerResponse(event.data)) {
      this.fail(new Error("SQLite Dedicated Worker sent an invalid protocol message"));
      return;
    }
    const response = event.data;
    if (response.kind === "ready") {
      this.settleReady(true);
      return;
    }
    if (response.kind === "fatal") {
      this.fail(deserializeError(response.error));
      return;
    }
    const pending = this.pending.get(response.requestId);
    if (pending === undefined) return;
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(response.value);
    else pending.reject(deserializeError(response.error));
  };

  private readonly handleError = (event: ErrorEvent): void => {
    event.preventDefault();
    this.fail(workerEventError(event));
  };

  private readonly handleMessageError = (): void => {
    this.fail(new Error("SQLite Dedicated Worker message could not be deserialized"));
  };

  private detach(): void {
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleError);
    this.worker.removeEventListener("messageerror", this.handleMessageError);
  }

  private terminateOnce(): void {
    if (this.terminated) return;
    this.terminated = true;
    this.detach();
    this.worker.terminate();
  }

  private rejectPending(reason: unknown): void {
    for (const request of this.pending.values()) request.reject(reason);
    this.pending.clear();
  }

  private fail(reason: unknown): void {
    if (this.closed) return;
    this.closing = true;
    this.closed = true;
    this.settleReady(false, reason);
    this.rejectPending(reason);
    this.terminateOnce();
  }

  private async call(method: StudioLocalDatabaseRpcMethod, args: readonly unknown[]) {
    if (this.closing || this.closed) {
      throw new Error("studio local database Worker is closing or closed");
    }
    await this.readyPromise;
    if (this.closing || this.closed) {
      throw new Error("studio local database Worker is closing or closed");
    }
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    const request: StudioLocalDatabaseWorkerRequest = {
      version: STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
      kind: "request",
      requestId,
      method,
      args,
    };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try {
        this.worker.postMessage(request);
      } catch (cause) {
        this.pending.delete(requestId);
        reject(cause);
      }
    });
  }

  private close(): Promise<void> {
    if (this.closePromise !== null) return this.closePromise;
    if (this.closed) {
      this.closePromise = Promise.resolve();
      return this.closePromise;
    }

    // Close is an admission barrier, not merely another RPC. Flip it synchronously so calls made
    // in the same tick cannot slip behind the close request, and settle already-posted requests
    // explicitly rather than leaving their callers waiting for responses we will ignore.
    this.closing = true;
    this.rejectPending(new Error("studio local database Worker is closing"));
    this.closePromise = this.performClose();
    return this.closePromise;
  }

  private async performClose(): Promise<void> {
    await this.readyPromise;
    if (this.closed) return;
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    const request: StudioLocalDatabaseWorkerRequest = {
      version: STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
      kind: "request",
      requestId,
      method: "close",
      args: [],
    };
    try {
      await new Promise<void>((resolve, reject) => {
        this.pending.set(requestId, { resolve: () => resolve(), reject });
        try {
          this.worker.postMessage(request);
        } catch (cause) {
          this.pending.delete(requestId);
          reject(cause);
        }
      });
    } finally {
      this.closed = true;
      this.rejectPending(new Error("studio local database Worker is closed"));
      this.terminateOnce();
    }
  }
}

function createProductWorker(): Worker {
  if (typeof Worker !== "function") {
    throw new SqliteUnavailableError("Dedicated Worker is unavailable in this environment");
  }
  return new Worker(new URL("./studio-local-database.worker.ts", import.meta.url), {
    type: "module",
    name: "toonspectrum-studio-sqlite",
  });
}

/**
 * Opens the product SQLite authority in a Dedicated Worker. The returned proxy
 * preserves every async repository method while keeping sqlite-wasm, SQL work,
 * and OPFS SyncAccessHandles off the UI thread.
 */
export async function openStudioLocalDatabaseWorker(
  options: OpenStudioLocalDatabaseWorkerOptions = {},
): Promise<StudioLocalDatabase> {
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs <= 0) {
    throw new RangeError(`readyTimeoutMs must be positive, got ${readyTimeoutMs}`);
  }
  let worker: Worker;
  try {
    worker = (options.createWorker ?? createProductWorker)();
  } catch (cause) {
    if (cause instanceof SqliteUnavailableError) throw cause;
    throw new SqliteUnavailableError(
      `SQLite Dedicated Worker could not be created: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  }
  const client = new StudioLocalDatabaseWorkerRpcClient(worker, readyTimeoutMs);
  await client.ready();
  return client.database;
}
