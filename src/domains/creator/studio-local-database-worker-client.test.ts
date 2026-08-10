import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  SqliteUnavailableError,
  StudioCrdtOutboxSqlCapacityError,
} from "./studio-local-database";
import {
  openStudioLocalDatabaseWorker,
} from "./studio-local-database-worker-client";
import {
  STUDIO_LOCAL_DATABASE_RPC_METHODS,
  STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION,
  isStudioLocalDatabaseWorkerRequest,
  isStudioLocalDatabaseWorkerResponse,
  type StudioLocalDatabaseWorkerRequest,
  type StudioLocalDatabaseWorkerResponse,
} from "./studio-local-database-worker-protocol";

type FakeEventType = "message" | "error" | "messageerror";

class FakeWorker {
  readonly posted: StudioLocalDatabaseWorkerRequest[] = [];
  readonly terminate = vi.fn();
  onPost: ((request: StudioLocalDatabaseWorkerRequest) => void) | null = null;

  private readonly listeners = new Map<FakeEventType, Set<(event: unknown) => void>>();

  addEventListener(type: FakeEventType, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: FakeEventType, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(value: unknown): void {
    if (!isStudioLocalDatabaseWorkerRequest(value)) {
      throw new Error("test received an invalid request");
    }
    this.posted.push(value);
    this.onPost?.(value);
  }

  emitMessage(value: unknown): void {
    this.emit("message", { data: value });
  }

  emitError(message: string): void {
    this.emit("error", { message, preventDefault: vi.fn() });
  }

  private emit(type: FakeEventType, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const version = STUDIO_LOCAL_DATABASE_WORKER_PROTOCOL_VERSION;

function asWorker(worker: FakeWorker): Worker {
  return worker as unknown as Worker;
}

function ready(worker: FakeWorker): void {
  const response: StudioLocalDatabaseWorkerResponse = { version, kind: "ready" };
  worker.emitMessage(response);
}

function respond(
  worker: FakeWorker,
  request: StudioLocalDatabaseWorkerRequest,
  value: unknown,
): void {
  worker.emitMessage({
    version,
    kind: "response",
    requestId: request.requestId,
    ok: true,
    value,
  } satisfies StudioLocalDatabaseWorkerResponse);
}

async function openFake(worker: FakeWorker) {
  const opening = openStudioLocalDatabaseWorker({
    createWorker: () => asWorker(worker),
    readyTimeoutMs: 1_000,
  });
  ready(worker);
  return opening;
}

describe("studio local database Worker protocol", () => {
  it("pins an allowlist for every concrete async SQLite method", () => {
    expect(STUDIO_LOCAL_DATABASE_RPC_METHODS).toHaveLength(37);
    expect(new Set(STUDIO_LOCAL_DATABASE_RPC_METHODS).size).toBe(37);
    expect(STUDIO_LOCAL_DATABASE_RPC_METHODS).toContain("putCrdtRecoveryRecord");
    expect(STUDIO_LOCAL_DATABASE_RPC_METHODS).not.toContain("asAsyncKeyValueStore");
  });

  it("rejects malformed, unknown-method, and zero-id requests", () => {
    expect(isStudioLocalDatabaseWorkerRequest(null)).toBe(false);
    expect(isStudioLocalDatabaseWorkerRequest({
      version,
      kind: "request",
      requestId: 0,
      method: "kvGet",
      args: [],
    })).toBe(false);
    expect(isStudioLocalDatabaseWorkerRequest({
      version,
      kind: "request",
      requestId: 1,
      method: "dropEverything",
      args: [],
    })).toBe(false);
  });

  it("requires a value property even when a successful result is undefined", () => {
    expect(isStudioLocalDatabaseWorkerResponse({
      version,
      kind: "response",
      requestId: 1,
      ok: true,
    })).toBe(false);
    expect(isStudioLocalDatabaseWorkerResponse({
      version,
      kind: "response",
      requestId: 1,
      ok: true,
      value: undefined,
    })).toBe(true);
  });
});

describe("openStudioLocalDatabaseWorker", () => {
  it("waits for Worker SQLite readiness and round-trips a repository call", async () => {
    const worker = new FakeWorker();
    worker.onPost = (request) => respond(worker, request, "stored-value");
    const opening = openStudioLocalDatabaseWorker({
      createWorker: () => asWorker(worker),
      readyTimeoutMs: 1_000,
    });
    let settled = false;
    void opening.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    ready(worker);
    const database = await opening;
    await expect(database.kvGet("brush-slots", "current")).resolves.toBe("stored-value");
    expect(worker.posted[0]).toMatchObject({
      method: "kvGet",
      args: ["brush-slots", "current"],
    });
  });

  it("exposes every extension method required by brush/filter/CRDT repositories", async () => {
    const worker = new FakeWorker();
    const database = await openFake(worker);
    for (const method of STUDIO_LOCAL_DATABASE_RPC_METHODS) {
      expect(typeof (database as unknown as Record<string, unknown>)[method]).toBe("function");
    }
  });

  it("implements the local async KV adapter without crossing a non-cloneable object", async () => {
    const worker = new FakeWorker();
    worker.onPost = (request) => respond(worker, request, request.method === "kvGet" ? "v" : undefined);
    const database = await openFake(worker);
    const store = database.asAsyncKeyValueStore("tournament");
    await expect(store.get("winner")).resolves.toBe("v");
    await store.set("winner", "vello-gpu");
    await store.delete("winner");
    expect(worker.posted.map(({ method, args }) => ({ method, args }))).toEqual([
      { method: "kvGet", args: ["tournament", "winner"] },
      { method: "kvSet", args: ["tournament", "winner", "vello-gpu"] },
      { method: "kvDelete", args: ["tournament", "winner"] },
    ]);
  });

  it("correlates concurrent responses even when the Worker completes them out of order", async () => {
    const worker = new FakeWorker();
    const database = await openFake(worker);
    const first = database.kvGet("n", "first");
    const second = database.kvGet("n", "second");
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    respond(worker, worker.posted[1]!, "second-value");
    respond(worker, worker.posted[0]!, "first-value");
    await expect(Promise.all([first, second])).resolves.toEqual([
      "first-value",
      "second-value",
    ]);
  });

  it("rehydrates SQLite availability errors for existing product fallback policy", async () => {
    const worker = new FakeWorker();
    const opening = openStudioLocalDatabaseWorker({
      createWorker: () => asWorker(worker),
      readyTimeoutMs: 1_000,
    });
    worker.emitMessage({
      version,
      kind: "fatal",
      error: {
        name: "SqliteUnavailableError",
        message: "studio local sqlite unavailable: no OPFS",
        reason: "no OPFS",
      },
    } satisfies StudioLocalDatabaseWorkerResponse);
    await expect(opening).rejects.toBeInstanceOf(SqliteUnavailableError);
    await expect(opening).rejects.toMatchObject({ reason: "no OPFS" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rehydrates CRDT capacity errors so fail-closed handling remains intact", async () => {
    const worker = new FakeWorker();
    worker.onPost = (request) => {
      worker.emitMessage({
        version,
        kind: "response",
        requestId: request.requestId,
        ok: false,
        error: {
          name: "StudioCrdtOutboxSqlCapacityError",
          message: "capacity",
          entryCount: 101,
          totalBytes: 4096,
        },
      } satisfies StudioLocalDatabaseWorkerResponse);
    };
    const database = await openFake(worker);
    const call = (database as unknown as {
      enqueueCrdtOutboxRecord(...args: unknown[]): Promise<unknown>;
    }).enqueueCrdtOutboxRecord({}, {});
    await expect(call).rejects.toBeInstanceOf(StudioCrdtOutboxSqlCapacityError);
    await expect(call).rejects.toMatchObject({ entryCount: 101, totalBytes: 4096 });
  });

  it("fails closed and terminates on invalid inbound protocol data", async () => {
    const worker = new FakeWorker();
    const opening = openStudioLocalDatabaseWorker({
      createWorker: () => asWorker(worker),
      readyTimeoutMs: 1_000,
    });
    worker.emitMessage({ surprise: "not-versioned" });
    await expect(opening).rejects.toThrow(/invalid protocol message/);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("surfaces Worker startup errors as explicit SQLite unavailability", async () => {
    const worker = new FakeWorker();
    const opening = openStudioLocalDatabaseWorker({
      createWorker: () => asWorker(worker),
      readyTimeoutMs: 1_000,
    });
    worker.emitError("module load failed");
    await expect(opening).rejects.toBeInstanceOf(SqliteUnavailableError);
    await expect(opening).rejects.toThrow(/module load failed/);
  });

  it("times out a Worker that never reports SQLite readiness", async () => {
    const worker = new FakeWorker();
    await expect(openStudioLocalDatabaseWorker({
      createWorker: () => asWorker(worker),
      readyTimeoutMs: 5,
    })).rejects.toThrow(/did not become ready/);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("shares one atomic close promise and sends exactly one close RPC", async () => {
    const worker = new FakeWorker();
    const database = await openFake(worker);
    const firstClose = database.close();
    const secondClose = database.close();

    expect(firstClose).toBe(secondClose);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]?.method).toBe("close");
    respond(worker, worker.posted[0]!, undefined);
    await expect(Promise.all([firstClose, secondClose])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    await database.close();
    expect(worker.posted).toHaveLength(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects in-flight and new RPCs once close starts, then settles close", async () => {
    const worker = new FakeWorker();
    const database = await openFake(worker);
    const inFlight = database.kvGet("brush-slots", "active");
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    const staleRequest = worker.posted[0]!;

    const closing = database.close();
    const afterClose = database.kvGet("brush-slots", "late");
    await expect(inFlight).rejects.toThrow(/Worker is closing/);
    await expect(afterClose).rejects.toThrow(/closing or closed/);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    const closeRequest = worker.posted[1]!;
    expect(closeRequest.method).toBe("close");

    // A late result for a request rejected by the admission barrier is ignored safely.
    respond(worker, staleRequest, "stale");
    respond(worker, closeRequest, undefined);
    await expect(closing).resolves.toBeUndefined();
    expect(worker.posted).toHaveLength(2);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects an invalid readiness timeout before constructing a Worker", async () => {
    const createWorker = vi.fn(() => asWorker(new FakeWorker()));
    await expect(openStudioLocalDatabaseWorker({
      createWorker,
      readyTimeoutMs: 0,
    })).rejects.toBeInstanceOf(RangeError);
    expect(createWorker).not.toHaveBeenCalled();
  });
});

describe("product Worker boundary", () => {
  it("owns OPFS SQLite in the Dedicated Worker and never silently selects memory", () => {
    const workerSource = readFileSync(
      new URL("./studio-local-database.worker.ts", import.meta.url),
      "utf8",
    );
    const runtimeSource = readFileSync(
      new URL("./studio-local-database-runtime.ts", import.meta.url),
      "utf8",
    );
    expect(workerSource).toContain('openStudioLocalDatabase({ vfs: "opfs" })');
    expect(workerSource).toContain('"opfs-wl": true');
    expect(workerSource).toContain("opfs: true");
    expect(workerSource).not.toContain('vfs: "memory"');
    expect(runtimeSource).toContain("openStudioLocalDatabaseWorker");
    expect(runtimeSource).not.toContain('@sqlite.org/sqlite-wasm');
    expect(runtimeSource).not.toContain("localStorage");
  });
});
