import { describe, expect, it, vi } from "vitest";

import {
  SqliteUnavailableError,
  openStudioLocalDatabase,
} from "./studio-local-database";
import {
  STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
  STUDIO_TOURNAMENT_WINNER_STORAGE_KEY,
  type PersistedTournamentStateV1,
  type TournamentPersistencePort,
} from "./studio-renderer-tournament-runtime";
import { createSqliteTournamentPersistence } from "./studio-tournament-sqlite-persistence";

const STATE: PersistedTournamentStateV1 = {
  version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
  entries: [
    {
      bucket: "a4-n16-s2-g1-b0-t0-d0",
      deviceHash: "device-1",
      providerId: "vello-gpu-browser",
      expectedWarmMs: 2.7,
      decidedAtSample: 8,
    },
  ],
};

describe("studio-tournament-sqlite-persistence", () => {
  it("round-trips tournament state through a real sqlite kv store", async () => {
    const port = createSqliteTournamentPersistence({
      openDatabase: () => openStudioLocalDatabase({ vfs: "memory" }),
      fallback: null,
    });
    expect(await port.load()).toBeNull();
    await port.save(STATE);
    expect(await port.load()).toEqual(STATE);
  });

  it("opens the database once across repeated load/save calls", async () => {
    const openDatabase = vi.fn(() => openStudioLocalDatabase({ vfs: "memory" }));
    const port = createSqliteTournamentPersistence({ openDatabase, fallback: null });
    await port.save(STATE);
    await port.load();
    await port.load();
    expect(openDatabase).toHaveBeenCalledTimes(1);
  });

  it("resolves corrupt or foreign payloads to null instead of throwing", async () => {
    const database = await openStudioLocalDatabase({ vfs: "memory" });
    const kv = database.asAsyncKeyValueStore("tournament");
    const port = createSqliteTournamentPersistence({
      openDatabase: () => Promise.resolve(database),
      fallback: null,
    });
    await kv.set(STUDIO_TOURNAMENT_WINNER_STORAGE_KEY, "not-json{");
    expect(await port.load()).toBeNull();
    await kv.set(
      STUDIO_TOURNAMENT_WINNER_STORAGE_KEY,
      JSON.stringify({ version: 999, entries: [] }),
    );
    expect(await port.load()).toBeNull();
  });

  it("degrades to the fallback port when sqlite is unavailable", async () => {
    const saved: PersistedTournamentStateV1[] = [];
    const fallback: TournamentPersistencePort = {
      load: () => Promise.resolve(STATE),
      save: (state) => {
        saved.push(state);
        return Promise.resolve();
      },
    };
    const openDatabase = vi.fn(() =>
      Promise.reject(new SqliteUnavailableError("opfs unavailable in test")),
    );
    const port = createSqliteTournamentPersistence({ openDatabase, fallback });
    expect(await port.load()).toEqual(STATE);
    await port.save(STATE);
    expect(saved).toEqual([STATE]);
    expect(openDatabase).toHaveBeenCalledTimes(1);
  });

  it("persists silently without a fallback when sqlite is unavailable", async () => {
    const port = createSqliteTournamentPersistence({
      openDatabase: () =>
        Promise.reject(new SqliteUnavailableError("opfs unavailable in test")),
      fallback: null,
    });
    expect(await port.load()).toBeNull();
    await expect(port.save(STATE)).resolves.toBeUndefined();
  });
});
