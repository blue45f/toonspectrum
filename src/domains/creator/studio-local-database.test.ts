import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  STUDIO_LOCAL_DATABASE_MIGRATIONS,
  STUDIO_SQLITE_DATABASE_FILENAME,
  STUDIO_SQLITE_OPFS_DIRECTORY,
  SqliteUnavailableError,
  openStudioLocalDatabase,
  probeSqliteSupport,
  runStudioLocalDatabaseMigrations,
} from "./studio-local-database";

import type {
  StudioCostSampleKind,
  StudioLocalDatabase,
  StudioSqliteApiHandle,
  StudioSqliteDatabaseHandle,
} from "./studio-local-database";

/**
 * 이 스위트는 node 에서 실 sqlite-wasm(:memory: DB)로 실제 SQL 을 실행한다
 * (스텁 DB 로 시맨틱을 흉내내지 않는다). wasm 초기화는 파일당 1회.
 */

let sqlite3: StudioSqliteApiHandle;

beforeAll(async () => {
  const module = await import("@sqlite.org/sqlite-wasm");
  sqlite3 = (await module.default()) as unknown as StudioSqliteApiHandle;
});

function memoryHandle(): StudioSqliteDatabaseHandle {
  return new sqlite3.oo1.DB(":memory:", "c");
}

function selectValue(handle: StudioSqliteDatabaseHandle, sql: string): unknown {
  const statement = handle.prepare(sql);
  try {
    return statement.step() ? statement.get(0) : undefined;
  } finally {
    statement.finalize();
  }
}

function tableNames(handle: StudioSqliteDatabaseHandle): string[] {
  const statement = handle.prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name",
  );
  const names: string[] = [];
  try {
    while (statement.step()) names.push(String(statement.get(0)));
  } finally {
    statement.finalize();
  }
  return names;
}

async function openMemoryDatabase(now?: () => number): Promise<StudioLocalDatabase> {
  return openStudioLocalDatabase({
    vfs: "memory",
    loadSqlite: () => Promise.resolve(sqlite3),
    ...(now ? { now } : {}),
  });
}

const opened: StudioLocalDatabase[] = [];

async function openTracked(now?: () => number): Promise<StudioLocalDatabase> {
  const database = await openMemoryDatabase(now);
  opened.push(database);
  return database;
}

afterAll(async () => {
  for (const database of opened) await database.close();
});

describe("migration runner", () => {
  it("brings a fresh database to user_version 1 with the full v1 schema", () => {
    const handle = memoryHandle();
    try {
      const version = runStudioLocalDatabaseMigrations(handle);
      expect(version).toBe(1);
      expect(selectValue(handle, "PRAGMA user_version")).toBe(1);
      const names = tableNames(handle);
      expect(names).toContain("kv");
      expect(names).toContain("tournament_winners");
      expect(names).toContain("cost_samples");
      expect(names).toContain("cost_samples_provider_bucket");
    } finally {
      handle.close();
    }
  });

  it("is idempotent when run again on an already-migrated database", () => {
    const handle = memoryHandle();
    try {
      runStudioLocalDatabaseMigrations(handle);
      expect(runStudioLocalDatabaseMigrations(handle)).toBe(1);
      expect(selectValue(handle, "PRAGMA user_version")).toBe(1);
    } finally {
      handle.close();
    }
  });

  it("rolls the whole version back when a mid-migration statement fails", () => {
    const handle = memoryHandle();
    try {
      expect(() =>
        runStudioLocalDatabaseMigrations(handle, [
          {
            toVersion: 1,
            statements: [
              "CREATE TABLE half_applied (a TEXT)",
              "THIS IS NOT VALID SQL",
            ],
          },
        ]),
      ).toThrow();
      expect(selectValue(handle, "PRAGMA user_version")).toBe(0);
      expect(tableNames(handle)).not.toContain("half_applied");
    } finally {
      handle.close();
    }
  });

  it("refuses a broken (non-sequential) migration chain before touching the schema", () => {
    const handle = memoryHandle();
    try {
      expect(() =>
        runStudioLocalDatabaseMigrations(handle, [
          { toVersion: 2, statements: ["CREATE TABLE never_created (a TEXT)"] },
        ]),
      ).toThrow(/migration chain is broken/);
      expect(selectValue(handle, "PRAGMA user_version")).toBe(0);
      expect(tableNames(handle)).not.toContain("never_created");
    } finally {
      handle.close();
    }
  });

  it("ships exactly the sequential v1 migration set", () => {
    expect(STUDIO_LOCAL_DATABASE_MIGRATIONS.map((m) => m.toVersion)).toEqual([1]);
    const ddl = STUDIO_LOCAL_DATABASE_MIGRATIONS[0].statements.join("\n");
    expect(ddl).toContain("PRIMARY KEY (namespace, key)");
    expect(ddl).toContain("PRIMARY KEY (bucket, device_hash)");
    expect(ddl).toContain("CHECK (kind IN ('warm', 'cold'))");
  });
});

describe("kv", () => {
  it("round-trips set/get, overwrites on repeated set, and deletes", async () => {
    const database = await openTracked();
    expect(await database.kvGet("ns", "missing")).toBeNull();
    await database.kvSet("ns", "theme", "dark");
    expect(await database.kvGet("ns", "theme")).toBe("dark");
    await database.kvSet("ns", "theme", "light");
    expect(await database.kvGet("ns", "theme")).toBe("light");
    await database.kvDelete("ns", "theme");
    expect(await database.kvGet("ns", "theme")).toBeNull();
  });

  it("isolates identical keys across namespaces", async () => {
    const database = await openTracked();
    await database.kvSet("alpha", "shared-key", "from-alpha");
    await database.kvSet("beta", "shared-key", "from-beta");
    expect(await database.kvGet("alpha", "shared-key")).toBe("from-alpha");
    expect(await database.kvGet("beta", "shared-key")).toBe("from-beta");
    await database.kvDelete("alpha", "shared-key");
    expect(await database.kvGet("alpha", "shared-key")).toBeNull();
    expect(await database.kvGet("beta", "shared-key")).toBe("from-beta");
  });
});

describe("tournament winners", () => {
  const WINNER = {
    bucket: "brush-2048",
    deviceHash: "device-a",
    providerId: "vello-cpu",
    expectedWarmMs: 4.25,
    decidedAtSample: 128,
  };

  it("returns null for an unknown (bucket, device_hash) pair", async () => {
    const database = await openTracked();
    expect(await database.getTournamentWinner("brush-2048", "nope")).toBeNull();
  });

  it("stores a winner and stamps updated_at from the injected clock", async () => {
    const database = await openTracked(() => 777);
    await database.putTournamentWinner(WINNER);
    expect(await database.getTournamentWinner(WINNER.bucket, WINNER.deviceHash)).toEqual({
      ...WINNER,
      updatedAt: 777,
    });
  });

  it("upserts on the (bucket, device_hash) primary key instead of duplicating", async () => {
    const database = await openTracked();
    await database.putTournamentWinner(WINNER);
    await database.putTournamentWinner({
      ...WINNER,
      providerId: "konva",
      expectedWarmMs: 9.5,
      decidedAtSample: 256,
    });
    const winners = await database.listTournamentWinners();
    expect(winners).toHaveLength(1);
    expect(winners[0].providerId).toBe("konva");
    expect(winners[0].expectedWarmMs).toBe(9.5);
    expect(winners[0].decidedAtSample).toBe(256);
  });

  it("evicts only the given provider across buckets and reports the row count", async () => {
    const database = await openTracked();
    await database.putTournamentWinner(WINNER);
    await database.putTournamentWinner({
      ...WINNER,
      bucket: "filter-4096",
      providerId: "vello-cpu",
    });
    await database.putTournamentWinner({
      ...WINNER,
      deviceHash: "device-b",
      providerId: "konva",
    });
    expect(await database.evictTournamentProvider("vello-cpu")).toBe(2);
    const remaining = await database.listTournamentWinners();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].providerId).toBe("konva");
    expect(await database.evictTournamentProvider("vello-cpu")).toBe(0);
  });
});

describe("cost samples", () => {
  it("records samples and lists newest-first for one (provider, bucket) only", async () => {
    let tick = 0;
    const database = await openTracked(() => {
      tick += 1;
      return tick;
    });
    await database.recordCostSample("vello-cpu", "brush-2048", "cold", 40);
    await database.recordCostSample("vello-cpu", "brush-2048", "warm", 4);
    await database.recordCostSample("vello-cpu", "brush-2048", "warm", 3.5);
    await database.recordCostSample("vello-cpu", "filter-4096", "warm", 12);
    await database.recordCostSample("konva", "brush-2048", "warm", 6);
    const samples = await database.listCostSamples("vello-cpu", "brush-2048");
    expect(samples.map((sample) => sample.ms)).toEqual([3.5, 4, 40]);
    expect(samples.map((sample) => sample.kind)).toEqual(["warm", "warm", "cold"]);
    expect(samples.every((sample) => sample.providerId === "vello-cpu")).toBe(true);
  });

  it("honors the limit parameter and rejects a non-positive limit", async () => {
    const database = await openTracked();
    for (let index = 0; index < 5; index += 1) {
      await database.recordCostSample("vello-cpu", "brush-2048", "warm", index);
    }
    expect(await database.listCostSamples("vello-cpu", "brush-2048", 2)).toHaveLength(2);
    await expect(database.listCostSamples("vello-cpu", "brush-2048", 0)).rejects.toThrow(
      /positive integer/,
    );
  });

  it("rejects a kind outside ('warm','cold') via the schema CHECK constraint", async () => {
    const database = await openTracked();
    await expect(
      database.recordCostSample(
        "vello-cpu",
        "brush-2048",
        "lukewarm" as StudioCostSampleKind,
        1,
      ),
    ).rejects.toThrow(/CHECK|constraint/i);
    expect(await database.listCostSamples("vello-cpu", "brush-2048")).toHaveLength(0);
  });
});

describe("asAsyncKeyValueStore", () => {
  it("round-trips through the adapter inside its own namespace", async () => {
    const database = await openTracked();
    const store = database.asAsyncKeyValueStore("tournament");
    expect(await store.get("winner")).toBeNull();
    await store.set("winner", "vello-cpu");
    expect(await store.get("winner")).toBe("vello-cpu");
    expect(await database.kvGet("tournament", "winner")).toBe("vello-cpu");
    expect(await database.kvGet("other", "winner")).toBeNull();
    await store.delete("winner");
    expect(await store.get("winner")).toBeNull();
  });
});

describe("close", () => {
  it("is idempotent and rejects further use after closing", async () => {
    const database = await openMemoryDatabase();
    await database.kvSet("ns", "k", "v");
    await database.close();
    await database.close();
    await expect(database.kvGet("ns", "k")).rejects.toThrow(/closed/);
    await expect(database.kvSet("ns", "k", "v2")).rejects.toThrow(/closed/);
  });
});

describe("SqliteUnavailableError paths", () => {
  it("wraps an injected loader failure instead of downgrading silently", async () => {
    const boom = new Error("forced wasm load failure");
    const attempt = openStudioLocalDatabase({
      vfs: "memory",
      loadSqlite: () => Promise.reject(boom),
    });
    await expect(attempt).rejects.toBeInstanceOf(SqliteUnavailableError);
    await expect(attempt).rejects.toMatchObject({
      reason: expect.stringContaining("forced wasm load failure"),
      cause: boom,
    });
  });

  it("refuses the opfs vfs in an environment without OPFS (no silent memory fallback)", async () => {
    // node 에는 navigator.storage.getDirectory 가 없다 — opfs 개방은 명시 실패해야 한다.
    const attempt = openStudioLocalDatabase({
      vfs: "opfs",
      loadSqlite: () => Promise.resolve(sqlite3),
    });
    await expect(attempt).rejects.toBeInstanceOf(SqliteUnavailableError);
    await expect(attempt).rejects.toMatchObject({
      reason: expect.stringMatching(/OPFS|createSyncAccessHandle/),
    });
  });
});

describe("probeSqliteSupport", () => {
  it("reports measured wasm/opfs support with a reason for whatever is missing", async () => {
    const probe = await probeSqliteSupport({ loadSqlite: () => Promise.resolve(sqlite3) });
    expect(probe.wasm).toBe(true);
    expect(probe.opfs).toBe(false);
    expect(probe.reason).toMatch(/opfs:/);
  });

  it("reports wasm: false with the failure reason when the loader breaks", async () => {
    const probe = await probeSqliteSupport({
      loadSqlite: () => Promise.reject(new Error("no wasm here")),
    });
    expect(probe.wasm).toBe(false);
    expect(probe.reason).toContain("no wasm here");
  });
});

describe("opfs naming contract", () => {
  it("pins the destruction-inventory directory and database filename", () => {
    expect(STUDIO_SQLITE_OPFS_DIRECTORY).toBe("toonspectrum-studio-sqlite");
    expect(STUDIO_SQLITE_DATABASE_FILENAME).toBe("studio-local.db");
  });
});
