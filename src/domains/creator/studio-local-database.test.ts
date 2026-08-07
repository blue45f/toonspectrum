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
  it("brings a fresh database to user_version 2 with the full schema", () => {
    const handle = memoryHandle();
    try {
      const version = runStudioLocalDatabaseMigrations(handle);
      expect(version).toBe(2);
      expect(selectValue(handle, "PRAGMA user_version")).toBe(2);
      const names = tableNames(handle);
      expect(names).toContain("kv");
      expect(names).toContain("tournament_winners");
      expect(names).toContain("cost_samples");
      expect(names).toContain("cost_samples_provider_bucket");
      expect(names).toContain("journal_entries");
      expect(names).toContain("snapshots");
    } finally {
      handle.close();
    }
  });

  it("is idempotent when run again on an already-migrated database", () => {
    const handle = memoryHandle();
    try {
      runStudioLocalDatabaseMigrations(handle);
      expect(runStudioLocalDatabaseMigrations(handle)).toBe(2);
      expect(selectValue(handle, "PRAGMA user_version")).toBe(2);
    } finally {
      handle.close();
    }
  });

  it("advances an existing v1 database to v2 on reopen, preserving v1 data", () => {
    const handle = memoryHandle();
    try {
      // 구버전 세션: v1 마이그레이션까지만 적용된 DB 를 흉내낸다.
      const v1Only = STUDIO_LOCAL_DATABASE_MIGRATIONS.filter((m) => m.toVersion === 1);
      expect(runStudioLocalDatabaseMigrations(handle, v1Only)).toBe(1);
      handle.exec(
        "INSERT INTO kv (namespace, key, value, updated_at) VALUES ('ns', 'k', 'v', 1)",
      );
      expect(tableNames(handle)).not.toContain("journal_entries");

      // 재개방(전체 체인) — v2 로 자동 전진하고 v1 데이터는 그대로 남는다.
      expect(runStudioLocalDatabaseMigrations(handle)).toBe(2);
      expect(selectValue(handle, "PRAGMA user_version")).toBe(2);
      const names = tableNames(handle);
      expect(names).toContain("journal_entries");
      expect(names).toContain("snapshots");
      expect(
        selectValue(handle, "SELECT value FROM kv WHERE namespace = 'ns' AND key = 'k'"),
      ).toBe("v");
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

  it("ships exactly the sequential v1..v2 migration set", () => {
    expect(STUDIO_LOCAL_DATABASE_MIGRATIONS.map((m) => m.toVersion)).toEqual([1, 2]);
    const v1Ddl = STUDIO_LOCAL_DATABASE_MIGRATIONS[0].statements.join("\n");
    expect(v1Ddl).toContain("PRIMARY KEY (namespace, key)");
    expect(v1Ddl).toContain("PRIMARY KEY (bucket, device_hash)");
    expect(v1Ddl).toContain("CHECK (kind IN ('warm', 'cold'))");
    const v2Ddl = STUDIO_LOCAL_DATABASE_MIGRATIONS[1].statements.join("\n");
    expect(v2Ddl).toContain("PRIMARY KEY (project_id, seq)");
    expect(v2Ddl).toContain("CHECK (slot IN (0, 1))");
    expect(v2Ddl).toContain("PRIMARY KEY (project_id, slot)");
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

describe("tournament winner replacement (structured save path)", () => {
  const WINNER_A = {
    bucket: "brush-2048",
    deviceHash: "device-a",
    providerId: "vello-cpu",
    expectedWarmMs: 4.25,
    decidedAtSample: 128,
  };
  const WINNER_B = {
    bucket: "filter-4096",
    deviceHash: "device-a",
    providerId: "konva",
    expectedWarmMs: 9,
    decidedAtSample: 32,
  };

  it("replaces the whole table atomically, deleting orphans", async () => {
    const database = await openTracked(() => 42);
    await database.replaceTournamentWinners([WINNER_A, WINNER_B]);
    expect(await database.listTournamentWinners()).toHaveLength(2);

    await database.replaceTournamentWinners([{ ...WINNER_A, providerId: "skia" }]);
    const winners = await database.listTournamentWinners();
    expect(winners).toHaveLength(1);
    expect(winners[0]).toEqual({ ...WINNER_A, providerId: "skia", updatedAt: 42 });
  });

  it("rolls the previous state back intact when a mid-replace insert fails", async () => {
    const database = await openTracked();
    await database.replaceTournamentWinners([WINNER_A, WINNER_B]);
    // NaN 은 SQLite 바인딩에서 NULL 이 되어 NOT NULL 제약에 걸린다 —
    // 두 번째 행에서 실패해도 전체 교체가 원자적으로 롤백되어야 한다.
    await expect(
      database.replaceTournamentWinners([
        { ...WINNER_A, providerId: "skia" },
        { ...WINNER_B, expectedWarmMs: Number.NaN },
      ]),
    ).rejects.toThrow();
    const winners = await database.listTournamentWinners();
    expect(winners.map((winner) => winner.providerId).sort()).toEqual([
      "konva",
      "vello-cpu",
    ]);
  });

  it("lists raw candidates without asserting column types", async () => {
    const database = await openTracked();
    await database.putTournamentWinner(WINNER_A);
    // 부분 필드 오염 행 — REAL 컬럼에 TEXT 가 앉은 상황(비트로트/외부 오염).
    await database.putTournamentWinner({
      ...WINNER_B,
      expectedWarmMs: "fast" as unknown as number,
    });
    await expect(database.listTournamentWinners()).rejects.toThrow(/not numeric/);
    const candidates = await database.listTournamentWinnerCandidates();
    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.expectedWarmMs).sort()).toEqual([
      4.25,
      "fast",
    ]);
  });
});

describe("journal entries", () => {
  it("appends, lists in seq order, and scopes by project", async () => {
    const database = await openTracked();
    await database.appendJournalEntry("p1", { seq: 1, payload: "one", crc32: 11 });
    await database.appendJournalEntry("p1", { seq: 2, payload: "two", crc32: 22 });
    await database.appendJournalEntry("p2", { seq: 1, payload: "other", crc32: 33 });
    expect(await database.listJournalEntries("p1")).toEqual([
      { seq: 1, payload: "one", crc32: 11 },
      { seq: 2, payload: "two", crc32: 22 },
    ]);
    expect(await database.listJournalEntries("p2")).toEqual([
      { seq: 1, payload: "other", crc32: 33 },
    ]);
    expect(await database.listJournalEntries("missing")).toEqual([]);
  });

  it("re-appending a seq physically replaces the stale tail in one transaction", async () => {
    const database = await openTracked();
    await database.appendJournalEntry("p1", { seq: 1, payload: "keep", crc32: 1 });
    await database.appendJournalEntry("p1", { seq: 2, payload: "torn", crc32: 2 });
    await database.appendJournalEntry("p1", { seq: 3, payload: "stale", crc32: 3 });
    // 복구가 seq 2 부터 잘라낸 뒤 세션이 이어서 기록하는 상황.
    await database.appendJournalEntry("p1", { seq: 2, payload: "rewritten", crc32: 4 });
    expect(await database.listJournalEntries("p1")).toEqual([
      { seq: 1, payload: "keep", crc32: 1 },
      { seq: 2, payload: "rewritten", crc32: 4 },
    ]);
  });

  it("compacts strictly below the given seq for one project only", async () => {
    const database = await openTracked();
    for (const seq of [1, 2, 3]) {
      await database.appendJournalEntry("p1", { seq, payload: `e${seq}`, crc32: seq });
    }
    await database.appendJournalEntry("p2", { seq: 1, payload: "other", crc32: 9 });
    expect(await database.deleteJournalEntriesBefore("p1", 3)).toBe(2);
    expect((await database.listJournalEntries("p1")).map((entry) => entry.seq)).toEqual([
      3,
    ]);
    expect(await database.listJournalEntries("p2")).toHaveLength(1);
    expect(await database.deleteJournalEntriesBefore("p1", 3)).toBe(0);
  });
});

describe("journal snapshots", () => {
  it("upserts per (project, slot) and stamps updated_at from the clock", async () => {
    let tick = 0;
    const database = await openTracked(() => {
      tick += 1;
      return tick;
    });
    await database.putJournalSnapshot("p1", { slot: 0, seq: 2, payload: "a", crc32: 1 });
    await database.putJournalSnapshot("p1", { slot: 1, seq: 4, payload: "b", crc32: 2 });
    await database.putJournalSnapshot("p1", { slot: 0, seq: 6, payload: "a2", crc32: 3 });
    await database.putJournalSnapshot("p2", { slot: 0, seq: 1, payload: "x", crc32: 4 });
    expect(await database.listJournalSnapshots("p1")).toEqual([
      { slot: 0, seq: 6, payload: "a2", crc32: 3, updatedAt: 3 },
      { slot: 1, seq: 4, payload: "b", crc32: 2, updatedAt: 2 },
    ]);
    expect(await database.listJournalSnapshots("p2")).toHaveLength(1);
  });

  it("rejects a slot outside (0, 1) via the schema CHECK constraint", async () => {
    const database = await openTracked();
    await expect(
      database.putJournalSnapshot("p1", {
        slot: 2 as unknown as 0,
        seq: 1,
        payload: "bad",
        crc32: 0,
      }),
    ).rejects.toThrow(/CHECK|constraint/i);
    expect(await database.listJournalSnapshots("p1")).toEqual([]);
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
