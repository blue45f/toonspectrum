/// <reference lib="webworker" />

import { openStudioLocalDatabase } from "./studio-local-database";
import {
  STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
  isStudioLocalDatabaseWorkerRequest,
  type StudioLocalDatabaseWorkerRequest,
  type StudioLocalDatabaseWorkerResponse,
  type StudioLocalDatabaseWorkerSerializedError,
} from "./studio-local-database-worker-protocol";

import type { StudioLocalDatabase } from "./studio-local-database";

const workerScope = self as DedicatedWorkerGlobalScope;

function finiteNumberProperty(
  source: Record<string, unknown>,
  key: "entryCount" | "rowCount" | "totalBytes",
): number | undefined {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function serializeError(cause: unknown): StudioLocalDatabaseWorkerSerializedError {
  if (!(cause instanceof Error)) {
    return { name: "Error", message: String(cause) };
  }
  const details = cause as Error & Record<string, unknown>;
  const reason = typeof details.reason === "string" ? details.reason : undefined;
  const entryCount = finiteNumberProperty(details, "entryCount");
  const rowCount = finiteNumberProperty(details, "rowCount");
  const totalBytes = finiteNumberProperty(details, "totalBytes");
  return {
    name: cause.name || "Error",
    message: cause.message,
    ...(cause.stack === undefined ? {} : { stack: cause.stack }),
    ...(reason === undefined ? {} : { reason }),
    ...(entryCount === undefined ? {} : { entryCount }),
    ...(rowCount === undefined ? {} : { rowCount }),
    ...(totalBytes === undefined ? {} : { totalBytes }),
  };
}

function post(response: StudioLocalDatabaseWorkerResponse): void {
  workerScope.postMessage(response);
}

// sqlite-wasm otherwise auto-installs its SharedArrayBuffer proxy VFSes (`opfs`
// and `opfs-wl`) during module init. Studio deliberately owns one SAH-pool VFS,
// which needs neither proxy and remains available without COOP/COEP. Disable
// only those automatic alternatives before the dynamic sqlite-wasm import.
const sqliteApiConfigScope = globalThis as typeof globalThis & {
  sqlite3ApiConfig?: {
    disable?: { vfs?: Record<string, boolean> };
  };
};
const existingSqliteApiConfig = sqliteApiConfigScope.sqlite3ApiConfig ?? {};
const existingDisable = existingSqliteApiConfig.disable ?? {};
sqliteApiConfigScope.sqlite3ApiConfig = {
  ...existingSqliteApiConfig,
  disable: {
    ...existingDisable,
    vfs: {
      ...existingDisable.vfs,
      opfs: true,
      "opfs-wl": true,
    },
  },
};

const databasePromise = openStudioLocalDatabase({ vfs: "opfs" });

void databasePromise.then(
  () => {
    post({
      version: STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
      kind: "ready",
    });
  },
  (cause: unknown) => {
    post({
      version: STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
      kind: "fatal",
      error: serializeError(cause),
    });
  },
);

type CallableDatabase = StudioLocalDatabase & Record<
  string,
  (...args: readonly unknown[]) => Promise<unknown>
>;

async function executeRequest(request: StudioLocalDatabaseWorkerRequest): Promise<void> {
  try {
    const database = await databasePromise;
    let value: unknown;
    if (request.method === "close") {
      await database.close();
      value = undefined;
    } else {
      const method = (database as CallableDatabase)[request.method];
      value = await Reflect.apply(method, database, request.args);
    }
    post({
      version: STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
      kind: "response",
      requestId: request.requestId,
      ok: true,
      value,
    });
  } catch (cause) {
    post({
      version: STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
      kind: "response",
      requestId: request.requestId,
      ok: false,
      error: serializeError(cause),
    });
  }
}

// Preserve request order even if a future database method gains an await point.
let operationQueue: Promise<void> = Promise.resolve();

workerScope.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isStudioLocalDatabaseWorkerRequest(event.data)) return;
  const request = event.data;
  operationQueue = operationQueue.then(
    () => executeRequest(request),
    () => executeRequest(request),
  );
});

export {};
