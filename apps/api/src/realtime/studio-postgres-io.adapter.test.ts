import { EventEmitter } from "node:events";
import { createServer } from "node:http";

import { Client, type Pool, type PoolClient, type PoolConfig } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE,
  STUDIO_LIVE_POSTGRES_CHANNEL_PREFIX,
  STUDIO_LIVE_POSTGRES_POOL_DEFAULT_MAX,
  StudioLivePostgresIoAdapter,
  type StudioLivePostgresIoAdapterDependencies,
  createStudioLivePostgresIoAdapter,
  preflightStudioLivePostgresPool,
  resolveStudioLiveClusterAdapterConfig,
} from "./studio-postgres-io.adapter";

import type { INestApplicationContext } from "@nestjs/common";

const DIRECT_URL = "postgresql://artist:secret@ep-direct.us-east-1.aws.neon.tech/toonspectrum?sslmode=require";
const VALID_ATTACHMENT_CATALOG = {
  attachmentTable: STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE,
  createdAtDefault: "now()",
  hasCreatedAtIndex: true,
  hasPrimaryKey: true,
};

function applicationContext(): INestApplicationContext {
  return {} as INestApplicationContext;
}

function logger() {
  return { error: vi.fn(), log: vi.fn() };
}

function poolHarness() {
  const events = new EventEmitter();
  const end = vi.fn(async () => undefined);
  const pool = Object.assign(events, { end }) as unknown as Pool;
  const on = vi.spyOn(pool, "on");
  const off = vi.spyOn(pool, "off");
  return {
    pool,
    events,
    end,
    on,
    off,
  };
}

function clientHarness(query: ReturnType<typeof vi.fn>) {
  const events = new EventEmitter();
  const release = vi.fn();
  const client = Object.assign(events, { query, release }) as unknown as PoolClient;
  return { client, events, query, release };
}

function inertClusterTransport(close = vi.fn(async () => undefined)) {
  class FakeAdapter {
    init(): void {}
    close(): void {}
  }
  return {
    adapterConstructor: FakeAdapter as never,
    close,
  };
}

describe("Studio live cluster adapter configuration", () => {
  it("keeps the default and explicit local mode on the process-local memory adapter", () => {
    expect(resolveStudioLiveClusterAdapterConfig({})).toEqual({ mode: "memory" });
    expect(
      resolveStudioLiveClusterAdapterConfig({ STUDIO_LIVE_CLUSTER_ADAPTER: "memory" })
    ).toEqual({ mode: "memory" });
  });

  it("accepts a complete direct PostgreSQL URL and a bounded dedicated pool", () => {
    expect(
      resolveStudioLiveClusterAdapterConfig({
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: `  ${DIRECT_URL}  `,
        STUDIO_LIVE_POSTGRES_POOL_MAX: "6",
      })
    ).toEqual({ mode: "postgres", connectionString: DIRECT_URL, poolMax: 6 });
    expect(
      resolveStudioLiveClusterAdapterConfig({
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: DIRECT_URL,
      })
    ).toMatchObject({ poolMax: STUDIO_LIVE_POSTGRES_POOL_DEFAULT_MAX });
  });

  it("matches node-postgres' parser for the accepted authority and TLS contract", () => {
    const connectionString =
      "postgresql://artist:s3cret@ep-direct.example.net:5433/toonspectrum?sslmode=verify-full&channel_binding=require";
    const resolved = resolveStudioLiveClusterAdapterConfig({
      NODE_ENV: "production",
      STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
      STUDIO_LIVE_POSTGRES_URL: connectionString,
    });
    if (resolved.mode !== "postgres") throw new Error("postgres mode was not selected");

    const parsed = new Client({ connectionString: resolved.connectionString })
      .connectionParameters;
    expect(parsed).toMatchObject({
      database: "toonspectrum",
      host: "ep-direct.example.net",
      password: "s3cret",
      port: 5433,
      ssl: {},
      user: "artist",
    });
  });

  it("rejects query overrides that node-postgres would otherwise apply to authority and credentials", () => {
    const unsafe =
      "postgresql://good:original@direct.example.net:5432/toonspectrum?host=evil.example.net&port=6543&user=attacker&password=stolen&ssl=true";
    const parsed = new Client({ connectionString: unsafe }).connectionParameters;
    expect(parsed).toMatchObject({
      host: "evil.example.net",
      password: "stolen",
      port: 6543,
      ssl: true,
      user: "attacker",
    });

    expect(() =>
      resolveStudioLiveClusterAdapterConfig({
        NODE_ENV: "production",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: unsafe,
      })
    ).toThrow(/query parameters are limited/u);
  });

  it.each([
    [{ STUDIO_LIVE_CLUSTER_ADAPTER: "redis" }, /memory or postgres/u],
    [{ STUDIO_LIVE_CLUSTER_ADAPTER: "postgres" }, /STUDIO_LIVE_POSTGRES_URL is required/u],
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: "https://example.com/database",
      },
      /complete PostgreSQL URL/u,
    ],
    [
      {
        NODE_ENV: "production",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@ep-direct.example.net?sslmode=require",
      },
      /complete PostgreSQL URL/u,
    ],
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@ep-example-pooler.us-east-1.aws.neon.tech/toonspectrum",
      },
      /direct PostgreSQL endpoint/u,
    ],
    [
      {
        NODE_ENV: "production",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@ep-direct.example.net/toonspectrum",
      },
      /sslmode=require/u,
    ],
    [
      {
        NODE_ENV: "production",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@ep-direct.example.net/toonspectrum?sslmode=disable",
      },
      /sslmode=require/u,
    ],
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@pooler.example.net/toonspectrum",
      },
      /direct PostgreSQL endpoint/u,
    ],
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@pgbouncer.example.net/toonspectrum",
      },
      /direct PostgreSQL endpoint/u,
    ],
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: `${DIRECT_URL}&pgbouncer=true`,
      },
      /query parameters are limited/u,
    ],
    ...[
      "host=evil.example.net",
      "port=6543",
      "user=attacker",
      "password=stolen",
      "database=other",
      "dbname=other",
      "ssl=true",
    ].map((query) => [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: `${DIRECT_URL}&${query}`,
      },
      /query parameters are limited/u,
    ]),
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: `${DIRECT_URL}&sslmode=disable`,
      },
      /must not repeat the sslmode/u,
    ],
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: `${DIRECT_URL}&SSLMODE=disable`,
      },
      /must not repeat the sslmode/u,
    ],
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: DIRECT_URL,
        STUDIO_LIVE_POSTGRES_POOL_MAX: "1",
      },
      /between 2 and 10/u,
    ],
    [
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: DIRECT_URL,
        STUDIO_LIVE_POSTGRES_POOL_MAX: "unbounded",
      },
      /must be an integer/u,
    ],
  ])("rejects unsafe cluster configuration %#", (source, expected) => {
    expect(() => resolveStudioLiveClusterAdapterConfig(source)).toThrow(expected);
  });

  it("allows plaintext only for a loopback PostgreSQL endpoint outside production", () => {
    expect(
      resolveStudioLiveClusterAdapterConfig({
        NODE_ENV: "development",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@127.0.0.1:55432/toonspectrum",
      })
    ).toMatchObject({ mode: "postgres" });
    expect(() =>
      resolveStudioLiveClusterAdapterConfig({
        NODE_ENV: "development",
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL:
          "postgresql://artist:secret@remote.example.net/toonspectrum",
      })
    ).toThrow(/plaintext is allowed only for loopback development/u);
  });
});

describe("Studio live PostgreSQL preflight", () => {
  it("receives a nonce from a separate Pool.query session and rolls back an attachment bytea roundtrip", async () => {
    const nonce = "preflight-nonce-1";
    const listenerQuery = vi.fn(async (config: { text: string }) => {
      if (config.text.includes("to_regclass")) {
        return { rows: [VALID_ATTACHMENT_CATALOG] };
      }
      return { rows: [], rowCount: null };
    });
    const listener = clientHarness(listenerQuery);
    let insertedPayload = Buffer.alloc(0);
    const attachmentQuery = vi.fn(
      async (config: { text: string; values?: unknown[] }) => {
        if (config.text === "BEGIN" || config.text === "ROLLBACK") {
          return { rows: [], rowCount: null };
        }
        if (config.text.startsWith("INSERT")) {
          insertedPayload = Buffer.from(config.values?.[0] as Uint8Array);
          return { rows: [{ id: "9007199254740993" }], rowCount: 1 };
        }
        if (config.text.startsWith("SELECT")) {
          return {
            rows: [
              {
                payload: insertedPayload,
                createdAt: new Date("2026-07-16T00:00:00.000Z"),
                idType: "bigint",
                createdAtType: "timestamp with time zone",
                payloadType: "bytea",
              },
            ],
            rowCount: 1,
          };
        }
        if (config.text.startsWith("DELETE")) return { rows: [], rowCount: 1 };
        throw new Error(`unexpected attachment query: ${config.text}`);
      }
    );
    const attachment = clientHarness(attachmentQuery);
    const poolQuery = vi.fn(async (config: { values?: unknown[] }) => {
      listener.events.emit("notification", {
        processId: 2,
        channel: config.values?.[0],
        payload: config.values?.[1],
      });
      return { rows: [], rowCount: 1 };
    });
    const connect = vi
      .fn()
      .mockResolvedValueOnce(listener.client)
      .mockResolvedValueOnce(attachment.client);
    const pool = { connect, query: poolQuery } as unknown as Pool;

    await expect(
      preflightStudioLivePostgresPool(pool, { nonce, timeoutMs: 100 })
    ).resolves.toBeUndefined();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(poolQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "SELECT pg_catalog.pg_notify($1, $2)",
        values: ["toonspectrum_studio_live_preflight_v1", nonce],
      })
    );
    expect(listener.query.mock.calls.map(([config]) => config.text)).toEqual([
      expect.stringContaining('to_regclass($1)::text AS "attachmentTable"'),
      'LISTEN "toonspectrum_studio_live_preflight_v1"',
      'UNLISTEN "toonspectrum_studio_live_preflight_v1"',
    ]);
    expect(attachment.query.mock.calls.map(([config]) => config.text)).toEqual([
      "BEGIN",
      expect.stringMatching(/^INSERT/u),
      expect.stringMatching(/^SELECT/u),
      expect.stringMatching(/^DELETE/u),
      "ROLLBACK",
    ]);
    expect(insertedPayload.toString("utf8")).toContain(nonce);
    expect(listener.release).toHaveBeenCalledWith(undefined);
    expect(attachment.release).toHaveBeenCalledWith(undefined);
    expect(listener.events.listenerCount("notification")).toBe(0);
  });

  it("fails closed and destroys the checked-out session when the migration table is absent", async () => {
    const listener = clientHarness(
      vi.fn(async () => ({ rows: [{ attachmentTable: null }] }))
    );
    const pool = {
      connect: vi.fn(async () => listener.client),
      query: vi.fn(),
    } as unknown as Pool;

    await expect(preflightStudioLivePostgresPool(pool)).rejects.toThrow(
      /apply the database migrations/u
    );
    expect(listener.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("fails closed when the attachment PK, cleanup index, or timestamp default contract is absent", async () => {
    const listener = clientHarness(
      vi.fn(async () => ({
        rows: [
          {
            ...VALID_ATTACHMENT_CATALOG,
            createdAtDefault: "'stale'::text",
            hasCreatedAtIndex: false,
            hasPrimaryKey: false,
          },
        ],
      }))
    );
    const pool = {
      connect: vi.fn(async () => listener.client),
      query: vi.fn(),
    } as unknown as Pool;

    await expect(preflightStudioLivePostgresPool(pool)).rejects.toThrow(
      /id primary key, a valid created_at index, and a current timestamp default/u
    );
    expect(listener.release).toHaveBeenCalledWith(expect.any(Error));
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("times out a swallowed or transaction-pooled notification and always unlistens", async () => {
    const listenerQuery = vi.fn(async (config: { text: string }) => {
      if (config.text.includes("to_regclass")) {
        return { rows: [VALID_ATTACHMENT_CATALOG] };
      }
      return { rows: [], rowCount: null };
    });
    const listener = clientHarness(listenerQuery);
    const connect = vi.fn(async () => listener.client);
    const pool = {
      connect,
      query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
    } as unknown as Pool;

    await expect(
      preflightStudioLivePostgresPool(pool, {
        nonce: "never-delivered",
        timeoutMs: 5,
      })
    ).rejects.toThrow(/notification was not received within 5 ms/u);

    expect(connect).toHaveBeenCalledOnce();
    expect(listener.query.mock.calls.map(([config]) => config.text)).toContain(
      'UNLISTEN "toonspectrum_studio_live_preflight_v1"'
    );
    expect(listener.release).toHaveBeenCalledWith(expect.any(Error));
    expect(listener.events.listenerCount("notification")).toBe(0);
  });

  it("rolls back and destroys both checked-out clients when attachment SELECT fails", async () => {
    const listener = clientHarness(
      vi.fn(async (config: { text: string }) =>
        config.text.includes("to_regclass")
          ? { rows: [VALID_ATTACHMENT_CATALOG] }
          : { rows: [], rowCount: null }
      )
    );
    const attachment = clientHarness(
      vi.fn(async (config: { text: string }) => {
        if (config.text === "BEGIN" || config.text === "ROLLBACK") {
          return { rows: [], rowCount: null };
        }
        if (config.text.startsWith("INSERT")) {
          return { rows: [{ id: "42" }], rowCount: 1 };
        }
        throw new Error("attachment SELECT denied");
      })
    );
    const pool = {
      connect: vi
        .fn()
        .mockResolvedValueOnce(listener.client)
        .mockResolvedValueOnce(attachment.client),
      query: vi.fn(async (config: { values?: unknown[] }) => {
        listener.events.emit("notification", {
          processId: 3,
          channel: config.values?.[0],
          payload: config.values?.[1],
        });
        return { rows: [], rowCount: 1 };
      }),
    } as unknown as Pool;

    await expect(
      preflightStudioLivePostgresPool(pool, {
        nonce: "attachment-failure",
        timeoutMs: 100,
      })
    ).rejects.toThrow(/attachment SELECT denied/u);

    expect(attachment.query.mock.calls.map(([config]) => config.text)).toContain("ROLLBACK");
    expect(attachment.query.mock.calls.map(([config]) => config.text)).not.toContain("COMMIT");
    expect(attachment.release).toHaveBeenCalledWith(expect.any(Error));
    expect(listener.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it("rejects an attachment table with an invalid timestamp/type contract and rolls back", async () => {
    const listener = clientHarness(
      vi.fn(async (config: { text: string }) =>
        config.text.includes("to_regclass")
          ? { rows: [VALID_ATTACHMENT_CATALOG] }
          : { rows: [], rowCount: null }
      )
    );
    let payload = Buffer.alloc(0);
    const attachment = clientHarness(
      vi.fn(async (config: { text: string; values?: unknown[] }) => {
        if (config.text === "BEGIN" || config.text === "ROLLBACK") {
          return { rows: [], rowCount: null };
        }
        if (config.text.startsWith("INSERT")) {
          payload = Buffer.from(config.values?.[0] as Uint8Array);
          return { rows: [{ id: "43" }], rowCount: 1 };
        }
        if (config.text.startsWith("SELECT")) {
          return {
            rows: [
              {
                payload,
                createdAt: null,
                idType: "integer",
                createdAtType: "timestamp without time zone",
                payloadType: "bytea",
              },
            ],
            rowCount: 1,
          };
        }
        throw new Error(`unexpected query after incompatible schema: ${config.text}`);
      })
    );
    const pool = {
      connect: vi
        .fn()
        .mockResolvedValueOnce(listener.client)
        .mockResolvedValueOnce(attachment.client),
      query: vi.fn(async (config: { values?: unknown[] }) => {
        listener.events.emit("notification", {
          processId: 4,
          channel: config.values?.[0],
          payload: config.values?.[1],
        });
        return { rows: [], rowCount: 1 };
      }),
    } as unknown as Pool;

    await expect(
      preflightStudioLivePostgresPool(pool, {
        nonce: "schema-failure",
        timeoutMs: 100,
      })
    ).rejects.toThrow(/expected non-null created_at and int8\/timestamptz\/bytea/u);
    expect(attachment.query.mock.calls.map(([config]) => config.text)).toContain("ROLLBACK");
    expect(attachment.release).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe("Studio live PostgreSQL IoAdapter lifecycle", () => {
  it("does not allocate a PostgreSQL pool for memory mode", async () => {
    const createPool = vi.fn();

    await expect(
      createStudioLivePostgresIoAdapter(applicationContext(), {}, { createPool })
    ).resolves.toBeNull();
    expect(createPool).not.toHaveBeenCalled();
  });

  it("closes the dedicated pool and rejects boot when preflight fails", async () => {
    const harness = poolHarness();
    const testLogger = logger();

    await expect(
      createStudioLivePostgresIoAdapter(
        applicationContext(),
        {
          STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
          STUDIO_LIVE_POSTGRES_URL: DIRECT_URL,
        },
        {
          createPool: () => harness.pool,
          preflight: async () => {
            expect(harness.events.listenerCount("connect")).toBe(1);
            throw new Error("LISTEN denied");
          },
          logger: testLogger,
        }
      )
    ).rejects.toThrow(/initialization failed: LISTEN denied/u);
    expect(harness.end).toHaveBeenCalledOnce();
    expect(harness.on.mock.calls.map(([event]) => event)).toEqual([
      "error",
      "connect",
      "acquire",
      "release",
      "remove",
    ]);
    expect(harness.off.mock.calls.map(([event]) => event)).toEqual([
      "error",
      "connect",
      "acquire",
      "release",
      "remove",
    ]);
  });

  it("bounds the preflight error message and database code exposed by the factory", async () => {
    const harness = poolHarness();
    const tail = "TAIL_MUST_NOT_ESCAPE";
    const databaseCode = "C".repeat(100);
    const failure = await createStudioLivePostgresIoAdapter(
      applicationContext(),
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: DIRECT_URL,
      },
      {
        createPool: () => harness.pool,
        preflight: async () => {
          throw Object.assign(new Error(`${"x".repeat(700)}${tail}`), {
            code: databaseCode,
          });
        },
        logger: logger(),
      }
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(tail);
    expect((failure as Error).message).toContain(`[${databaseCode.slice(0, 64)}]`);
    expect((failure as Error).cause).toBeUndefined();
  });

  it("redacts PostgreSQL URI userinfo and known credentials from factory and logger errors", async () => {
    const harness = poolHarness();
    const testLogger = logger();
    const rawFailure = `${DIRECT_URL} password=secret postgresql://other:other-secret@db.example/test`;

    const failure = await createStudioLivePostgresIoAdapter(
      applicationContext(),
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: DIRECT_URL,
      },
      {
        createPool: () => harness.pool,
        preflight: async () => {
          throw new Error(rawFailure);
        },
        logger: testLogger,
      }
    ).catch((error: unknown) => error);

    const serialized = JSON.stringify({
      failure: failure instanceof Error ? { message: failure.message, cause: failure.cause } : failure,
      logs: testLogger.error.mock.calls,
    });
    expect(serialized).not.toContain("artist:secret");
    expect(serialized).not.toContain("password=secret");
    expect(serialized).not.toContain("other:other-secret");
    expect(serialized).not.toContain(DIRECT_URL);
    expect((failure as Error).cause).toBeUndefined();
  });

  it("does not log ready and closes the pool when required LISTEN startup fails", async () => {
    const harness = poolHarness();
    const testLogger = logger();

    await expect(
      createStudioLivePostgresIoAdapter(
        applicationContext(),
        {
          STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
          STUDIO_LIVE_POSTGRES_URL: DIRECT_URL,
        },
        {
          createPool: () => harness.pool,
          preflight: async () => undefined,
          createTransport: async () => {
            throw new Error("required namespace LISTEN failed");
          },
          logger: testLogger,
        }
      )
    ).rejects.toThrow(/required namespace LISTEN failed/u);
    expect(testLogger.log).not.toHaveBeenCalled();
    expect(harness.end).toHaveBeenCalledOnce();
  });

  it("uses a dedicated bounded pool and disposes it idempotently", async () => {
    const harness = poolHarness();
    const createPool = vi.fn((_config: PoolConfig) => harness.pool);
    const testLogger = logger();
    let receivedTransportOptions:
      | Parameters<NonNullable<StudioLivePostgresIoAdapterDependencies["createTransport"]>>[1]
      | undefined;
    const transport = inertClusterTransport();
    const adapter = await createStudioLivePostgresIoAdapter(
      applicationContext(),
      {
        STUDIO_LIVE_CLUSTER_ADAPTER: "postgres",
        STUDIO_LIVE_POSTGRES_URL: DIRECT_URL,
        STUDIO_LIVE_POSTGRES_POOL_MAX: "4",
      },
      {
        createPool,
        preflight: async () => undefined,
        createTransport: async (_pool, options) => {
          receivedTransportOptions = options;
          return transport;
        },
        logger: testLogger,
      }
    );

    expect(adapter).toBeInstanceOf(StudioLivePostgresIoAdapter);
    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: DIRECT_URL,
        max: 4,
        connectionTimeoutMillis: 5_000,
      })
    );
    expect(receivedTransportOptions).toMatchObject({
      channelPrefix: STUDIO_LIVE_POSTGRES_CHANNEL_PREFIX,
      tableName: STUDIO_LIVE_POSTGRES_ATTACHMENT_TABLE,
    });
    receivedTransportOptions?.errorHandler(
      Object.assign(new Error(`${DIRECT_URL} password=secret`), { code: DIRECT_URL }),
      "test-operation"
    );
    expect(JSON.stringify(testLogger.error.mock.calls)).not.toContain("artist:secret");
    expect(JSON.stringify(testLogger.error.mock.calls)).not.toContain("password=secret");
    await Promise.all([adapter!.disposePool(), adapter!.disposePool()]);
    expect(harness.end).toHaveBeenCalledOnce();
    expect(harness.on.mock.calls.map(([event]) => event)).toEqual([
      "error",
      "connect",
      "acquire",
      "release",
      "remove",
    ]);
    expect(harness.off.mock.calls.map(([event]) => event)).toEqual([
      "error",
      "connect",
      "acquire",
      "release",
      "remove",
    ]);
  });

  it("guards each new checked-out client once, bounds structured errors, and removes listeners on lifecycle exit", async () => {
    const harness = poolHarness();
    const testLogger = logger();
    const transport = inertClusterTransport();
    const adapter = new StudioLivePostgresIoAdapter(
      applicationContext(),
      harness.pool,
      transport,
      testLogger
    );
    const clientEvents = new EventEmitter();
    const clientRelease = vi.fn();
    const client = Object.assign(clientEvents, {
      release: clientRelease,
      query: vi.fn(),
    }) as unknown as PoolClient;

    harness.events.emit("connect", client);
    harness.events.emit("connect", client);
    harness.events.emit("acquire", client);
    expect(clientEvents.listenerCount("error")).toBe(1);

    clientEvents.emit(
      "error",
      Object.assign(new Error("n".repeat(700)), { code: "C".repeat(100) })
    );
    const [fields, message] = testLogger.error.mock.calls.at(-1) ?? [];
    expect(fields).toMatchObject({ source: "checked-out-client" });
    expect(fields.error).toHaveLength(512);
    expect(fields.code).toHaveLength(64);
    expect(message).toBe("studio live PostgreSQL adapter client emitted an error");
    await new Promise((resolve) => setImmediate(resolve));
    expect(clientRelease).toHaveBeenCalledOnce();
    expect(clientRelease).toHaveBeenCalledWith(expect.any(Error));

    harness.events.emit("remove", client);
    expect(clientEvents.listenerCount("error")).toBe(0);

    const activeClientEvents = new EventEmitter();
    const activeClient = Object.assign(activeClientEvents, {
      release: vi.fn(),
      query: vi.fn(),
    }) as unknown as PoolClient;
    harness.events.emit("connect", activeClient);
    harness.events.emit("acquire", activeClient);
    expect(activeClientEvents.listenerCount("error")).toBe(1);

    await adapter.disposePool();
    expect(activeClientEvents.listenerCount("error")).toBe(0);
    expect(harness.events.listenerCount("connect")).toBe(0);
    expect(harness.events.listenerCount("acquire")).toBe(0);
    expect(harness.events.listenerCount("release")).toBe(0);
    expect(harness.events.listenerCount("remove")).toBe(0);
    expect(harness.events.listenerCount("error")).toBe(0);
  });

  it("does not double-release a checked-out client when a query error path releases synchronously", async () => {
    const harness = poolHarness();
    const testLogger = logger();
    const transport = inertClusterTransport();
    const adapter = new StudioLivePostgresIoAdapter(
      applicationContext(),
      harness.pool,
      transport,
      testLogger
    );
    const clientEvents = new EventEmitter();
    const clientRelease = vi.fn();
    const client = Object.assign(clientEvents, {
      release: clientRelease,
      query: vi.fn(),
    }) as unknown as PoolClient;
    harness.events.emit("connect", client);
    harness.events.emit("acquire", client);
    clientEvents.on("error", (error) => {
      harness.events.emit("release", error, client);
    });

    clientEvents.emit("error", new Error("query connection lost"));
    await new Promise((resolve) => setImmediate(resolve));

    expect(clientRelease).not.toHaveBeenCalled();
    expect(testLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ source: "checked-out-client" }),
      "studio live PostgreSQL adapter client emitted an error"
    );
    await adapter.disposePool();
  });

  it("closes the server, lifecycle-safe transport, and pool in strict order", async () => {
    const order: string[] = [];
    const httpServer = createServer();
    const harness = poolHarness();
    harness.end.mockImplementation(async () => {
      order.push("pool");
    });
    const testLogger = logger();
    const adapterClose = vi.fn(async () => {
      order.push("server");
    });
    class FakeAdapter {
      init(): void {}
      close = adapterClose;
    }
    const transportClose = vi.fn(async () => {
      order.push("transport");
    });
    const transport = {
      adapterConstructor: FakeAdapter as never,
      close: transportClose,
    };
    const adapter = new StudioLivePostgresIoAdapter(
      httpServer as unknown as INestApplicationContext,
      harness.pool,
      transport,
      testLogger
    );
    const io = adapter.createIOServer(0, { serveClient: false });

    await Promise.all([adapter.close(io), adapter.close(io)]);
    expect(adapterClose).toHaveBeenCalledOnce();
    expect(transportClose).toHaveBeenCalledOnce();
    expect(harness.end).toHaveBeenCalledOnce();
    expect(order).toEqual(["server", "transport", "pool"]);
  });
});
