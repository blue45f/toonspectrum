import { EventEmitter } from "node:events";

import { Server } from "socket.io";
import { describe, expect, it, vi } from "vitest";

import {
  LifecycleSafePostgresPubSub,
  STUDIO_LIVE_REQUIRED_NAMESPACES,
  createLifecycleSafeStudioLivePostgresTransport,
} from "./studio-postgres-pubsub";

import type { Pool, PoolClient } from "pg";

const CHANNEL_PREFIX = "toonspectrum:studio-live:v1";
const TABLE_NAME = "socket_io_attachments";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function clientHarness(queryImplementation?: (text: string) => Promise<unknown>) {
  const events = new EventEmitter();
  const release = vi.fn();
  const query = vi.fn(async (config: { text: string }) => {
    await queryImplementation?.(config.text);
    return { rows: [], rowCount: null };
  });
  const client = Object.assign(events, { query, release }) as unknown as PoolClient;
  return { client, events, query, release };
}

function pubSub(
  pool: Pool,
  overrides: {
    payloadThreshold?: number;
    queryTimeoutMs?: number;
    reconnectDelayMs?: number;
  } = {}
) {
  return new LifecycleSafePostgresPubSub(
    pool,
    {
      channelPrefix: CHANNEL_PREFIX,
      tableName: TABLE_NAME,
      payloadThreshold: overrides.payloadThreshold ?? 8_000,
      cleanupIntervalMs: 60_000,
      queryTimeoutMs: overrides.queryTimeoutMs ?? 100,
      reconnectDelayMs: overrides.reconnectDelayMs ?? 1,
      errorHandler: vi.fn(),
    },
    () => false,
    () => undefined
  );
}

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition was not reached before timeout");
}

describe("Lifecycle-safe Studio PostgreSQL PubSub", () => {
  it("provides a constructible adapter that a real Socket.IO Server can install", async () => {
    const client = clientHarness();
    const pool = {
      connect: vi.fn(async () => client.client),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as Pool;
    const transport = await createLifecycleSafeStudioLivePostgresTransport(pool, {
      channelPrefix: CHANNEL_PREFIX,
      tableName: TABLE_NAME,
      queryTimeoutMs: 100,
      errorHandler: vi.fn(),
    });
    const io = new Server({ serveClient: false });

    expect(() => io.adapter(transport.adapterConstructor)).not.toThrow();
    const rootAdapter = io.of("/").adapter;
    const studioAdapter = io.of("/studio-live").adapter;
    expect(rootAdapter).toBeInstanceOf(transport.adapterConstructor);
    expect(studioAdapter).toBeInstanceOf(transport.adapterConstructor);

    rootAdapter.close();
    studioAdapter.close();
    await transport.close();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("resolves start only after both required namespace LISTEN queries and closes cleanly", async () => {
    const client = clientHarness();
    const pool = {
      connect: vi.fn(async () => client.client),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as Pool;
    const transport = pubSub(pool);

    await transport.start(STUDIO_LIVE_REQUIRED_NAMESPACES);

    expect(client.query.mock.calls.map(([config]) => config.text)).toEqual([
      'LISTEN "toonspectrum:studio-live:v1#/"',
      'LISTEN "toonspectrum:studio-live:v1#/studio-live"',
    ]);
    await transport.close();
    expect(client.query.mock.calls.at(-1)?.[0].text).toBe("UNLISTEN *");
    expect(client.release).toHaveBeenCalledOnce();
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it("destroys a client after LISTEN rejection so a max-two pool slot can be reused", async () => {
    let checkedOut = 0;
    const failed = clientHarness(async (text) => {
      if (text.includes("/studio-live")) throw new Error("LISTEN denied");
    });
    const recovered = clientHarness();
    failed.release.mockImplementation(() => {
      checkedOut -= 1;
    });
    recovered.release.mockImplementation(() => {
      checkedOut -= 1;
    });
    const clients = [failed.client, recovered.client];
    const pool = {
      connect: vi.fn(async () => {
        if (checkedOut >= 2) throw new Error("pool max=2 exhausted");
        const client = clients.shift();
        if (!client) throw new Error("no fake client available");
        checkedOut += 1;
        return client;
      }),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as Pool;
    const transport = pubSub(pool);

    await expect(transport.start(STUDIO_LIVE_REQUIRED_NAMESPACES)).rejects.toThrow(
      /LISTEN denied/u
    );
    expect(failed.release).toHaveBeenCalledWith(expect.any(Error));
    expect(checkedOut).toBe(0);

    await transport.start(STUDIO_LIVE_REQUIRED_NAMESPACES);
    expect(checkedOut).toBe(1);
    await transport.close();
    expect(checkedOut).toBe(0);
  });

  it("waits for a pending connect during close and reclaims the late client", async () => {
    const pendingConnect = deferred<PoolClient>();
    const client = clientHarness();
    const pool = {
      connect: vi.fn(() => pendingConnect.promise),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as Pool;
    const transport = pubSub(pool, { queryTimeoutMs: 100 });

    const starting = transport.start(STUDIO_LIVE_REQUIRED_NAMESPACES);
    const closing = transport.close();
    pendingConnect.resolve(client.client);

    await expect(starting).rejects.toThrow(/closed during start/u);
    await expect(closing).resolves.toBeUndefined();
    expect(client.release).toHaveBeenCalledOnce();
    expect(client.events.listenerCount("notification")).toBe(0);
    expect(client.events.listenerCount("error")).toBe(0);
  });

  it("keeps close bounded when an injected pool never settles connect", async () => {
    const pool = {
      connect: vi.fn(() => new Promise<PoolClient>(() => undefined)),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as Pool;
    const transport = pubSub(pool, { queryTimeoutMs: 5 });

    const starting = transport.start(STUDIO_LIVE_REQUIRED_NAMESPACES);
    const closing = transport.close();

    await expect(starting).rejects.toThrow(/acquisition timed out/u);
    await expect(closing).resolves.toBeUndefined();
  });

  it("destroys a failed active listener, reconnects, and resubscribes every namespace", async () => {
    let rejectDynamicListen = true;
    const first = clientHarness(async (text) => {
      if (rejectDynamicListen && text.includes("#/review")) {
        throw new Error("dynamic LISTEN failed");
      }
    });
    const second = clientHarness();
    const clients = [first.client, second.client];
    const pool = {
      connect: vi.fn(async () => {
        const client = clients.shift();
        if (!client) throw new Error("no reconnect client available");
        return client;
      }),
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as unknown as Pool;
    const transport = pubSub(pool, { reconnectDelayMs: 1 });
    await transport.start(STUDIO_LIVE_REQUIRED_NAMESPACES);

    await expect(transport.addNamespace("/review")).rejects.toThrow(
      /dynamic LISTEN failed/u
    );
    rejectDynamicListen = false;
    expect(first.release).toHaveBeenCalledWith(expect.any(Error));
    await waitFor(() => pool.connect.mock.calls.length === 2);
    await waitFor(() =>
      second.query.mock.calls.some(([config]) => config.text.includes("#/review"))
    );

    expect(second.query.mock.calls.map(([config]) => config.text)).toEqual([
      'LISTEN "toonspectrum:studio-live:v1#/"',
      'LISTEN "toonspectrum:studio-live:v1#/studio-live"',
      'LISTEN "toonspectrum:studio-live:v1#/review"',
    ]);
    await transport.close();
    expect(second.release).toHaveBeenCalledWith(undefined);
  });

  it("publishes attachment headers with a namespace so receiving nodes can hydrate them", async () => {
    const client = clientHarness();
    const poolQuery = vi.fn(async (config: { text: string; values?: unknown[] }) => {
      if (config.text.startsWith("INSERT")) return { rows: [{ id: "42" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const pool = {
      connect: vi.fn(async () => client.client),
      query: poolQuery,
    } as unknown as Pool;
    const transport = pubSub(pool);
    await transport.start(STUDIO_LIVE_REQUIRED_NAMESPACES);

    await transport.publish({
      nsp: "/studio-live",
      type: 3,
      uid: "node-a",
      update: "A".repeat(9_000),
    });

    const notify = poolQuery.mock.calls.find(([config]) =>
      config.text.includes("pg_notify")
    )?.[0];
    expect(notify?.values?.[0]).toBe("toonspectrum:studio-live:v1#/studio-live");
    expect(JSON.parse(String(notify?.values?.[1]))).toEqual({
      attachmentId: "42",
      nsp: "/studio-live",
      type: 3,
      uid: "node-a",
    });
    await transport.close();
  });

  it("stores a payload whose encoded JSON is exactly at the NOTIFY safety threshold", async () => {
    const client = clientHarness();
    const poolQuery = vi.fn(async (config: { text: string; values?: unknown[] }) => {
      if (config.text.startsWith("INSERT")) return { rows: [{ id: "43" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const pool = {
      connect: vi.fn(async () => client.client),
      query: poolQuery,
    } as unknown as Pool;
    const message = {
      nsp: "/studio-live",
      type: 3,
      uid: "node-a",
      update: "boundary",
    };
    const threshold = Buffer.byteLength(JSON.stringify(message), "utf8");
    const transport = pubSub(pool, { payloadThreshold: threshold });
    await transport.start(STUDIO_LIVE_REQUIRED_NAMESPACES);

    await transport.publish(message);

    expect(poolQuery).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringMatching(/^INSERT/u) })
    );
    await transport.close();
  });
});
