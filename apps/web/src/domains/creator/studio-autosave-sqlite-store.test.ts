import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
  createStudioAutosaveSqliteStore,
  studioAutosaveSqliteLastKnownGoodKey,
} from "./studio-autosave-sqlite-store";
import {
  openStudioLocalDatabase,
  type StudioLocalDatabase,
} from "./studio-local-database";

import type { StudioAutosavePayload } from "./studio-autosave";

function payload(savedAt: string, id = "stroke-1"): StudioAutosavePayload {
  return {
    version: 2,
    savedAt,
    pagesList: [{
      id: "page-1",
      canvasH: 2_000,
      elements: [{ id, type: "draw" }],
    }],
    currentPageId: "page-1",
  };
}

describe("Studio SQLite autosave store", () => {
  let database: StudioLocalDatabase;

  beforeAll(async () => {
    database = await openStudioLocalDatabase({ vfs: "memory" });
  });

  afterAll(async () => {
    await database.close();
  });

  it.each([2, 3] as const)(
    "round-trips a normalized V%s Studio snapshot through real sqlite-wasm",
    async (version) => {
      const store = createStudioAutosaveSqliteStore(database);
      const next = {
        ...payload("2026-08-09T01:00:00.000Z", "sqlite-stroke"),
        version,
      };
      const key = `project-v${version}`;

      await store.write(key, next);

      expect(await store.read(key)).toMatchObject({
        state: "snapshot",
        savedAt: next.savedAt,
        payload: next,
      });
    },
  );

  it("rotates the previous valid generation and recovers it when the primary is corrupt", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    const key = "project-last-known-good";
    const first = payload("2026-08-09T01:00:00.000Z", "first");
    const second = payload("2026-08-09T02:00:00.000Z", "second");

    await store.write(key, first);
    await store.write(key, second);
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-primary");

    expect(await store.read(key)).toMatchObject({
      state: "snapshot",
      savedAt: first.savedAt,
      payload: first,
      recoveredFrom: "last-known-good",
    });
    expect(
      await database.kvGet(
        STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
        studioAutosaveSqliteLastKnownGoodKey(key),
      ),
    ).not.toBeNull();
  });

  it("preserves a last-known-good generation when a corrupt primary is replaced", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    const key = "project-preserve-recovery";
    const first = payload("2026-08-09T01:00:00.000Z", "first");
    const second = payload("2026-08-09T02:00:00.000Z", "second");
    const third = payload("2026-08-09T03:00:00.000Z", "third");

    await store.write(key, first);
    await store.write(key, second);
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-before-write");
    await store.write(key, third);
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-after-write");

    expect(await store.read(key)).toMatchObject({
      state: "snapshot",
      savedAt: first.savedAt,
      payload: first,
      recoveredFrom: "last-known-good",
    });
  });

  it("keeps a durable clear tombstone instead of deleting the authority row", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    await store.write("project-clear", payload("2026-08-09T01:00:00.000Z"));
    await store.clear("project-clear", "2026-08-09T02:00:00.000Z");

    expect(await store.read("project-clear")).toEqual({
      state: "cleared",
      savedAt: "2026-08-09T02:00:00.000Z",
    });
    expect(
      await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, "project-clear"),
    ).not.toBeNull();
  });

  it("does not acknowledge clear until the recovery tombstone is durable", async () => {
    const key = "project-clear-fail-closed";
    const writes: string[] = [];
    const failingDatabase: Pick<StudioLocalDatabase, "kvGet" | "kvSet"> = {
      async kvGet() {
        return null;
      },
      async kvSet(_namespace, candidateKey) {
        writes.push(candidateKey);
        throw new Error("recovery tombstone write failed");
      },
    };
    const store = createStudioAutosaveSqliteStore(failingDatabase);

    await expect(
      store.clear(key, "2026-08-09T02:30:00.000Z"),
    ).rejects.toThrow(/recovery tombstone write failed/u);
    expect(writes).toEqual([studioAutosaveSqliteLastKnownGoodKey(key)]);
  });

  it("tombstones the recovery generation so an explicitly discarded draft cannot return", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    const key = "project-clear-recovery";
    await store.write(key, payload("2026-08-09T01:00:00.000Z", "first"));
    await store.write(key, payload("2026-08-09T02:00:00.000Z", "second"));
    await store.clear(key, "2026-08-09T03:00:00.000Z");
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-tombstone");

    expect(await store.read(key)).toEqual({
      state: "cleared",
      savedAt: "2026-08-09T03:00:00.000Z",
      recoveredFrom: "last-known-good",
    });
  });

  it("keeps projects isolated in both primary and recovery composite keys", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    await store.write("project-one", payload("2026-08-09T03:00:00.000Z", "one-old"));
    await store.write("project-one", payload("2026-08-09T04:00:00.000Z", "one"));
    await store.write("project-two", payload("2026-08-09T03:00:00.000Z", "two-old"));
    await store.write("project-two", payload("2026-08-09T04:00:00.000Z", "two"));

    expect(await store.read("project-one")).toMatchObject({
      payload: { pagesList: [{ elements: [{ id: "one" }] }] },
    });
    expect(await store.read("project-two")).toMatchObject({
      payload: { pagesList: [{ elements: [{ id: "two" }] }] },
    });

    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, "project-one", "{broken");
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, "project-two", "{broken");
    expect(await store.read("project-one")).toMatchObject({
      payload: { pagesList: [{ elements: [{ id: "one-old" }] }] },
    });
    expect(await store.read("project-two")).toMatchObject({
      payload: { pagesList: [{ elements: [{ id: "two-old" }] }] },
    });
  });

  it("fails closed on corrupt rows instead of overwriting them as empty", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, "corrupt", "{broken");

    await expect(store.read("corrupt")).rejects.toThrow(/손상/u);
    expect(await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, "corrupt")).toBe(
      "{broken",
    );
  });

  it("reports both corrupt generations without mutating either authority row", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    const key = "corrupt-both";
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-primary");
    await database.kvSet(
      STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
      studioAutosaveSqliteLastKnownGoodKey(key),
      "{broken-recovery",
    );

    await expect(store.read(key)).rejects.toThrow(/모두 손상/u);
    expect(await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key)).toBe(
      "{broken-primary",
    );
  });

  it("rejects empty payloads and mismatched envelope timestamps", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    const empty = {
      ...payload("2026-08-09T04:00:00.000Z"),
      pagesList: [{ id: "page-1", canvasH: 2_000, elements: [] }],
    } satisfies StudioAutosavePayload;
    await expect(store.write("empty", empty)).rejects.toThrow(/내용이 없는/u);

    await database.kvSet(
      STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
      "timestamp-mismatch",
      JSON.stringify({
        kind: "toonspectrum:studio-autosave-sqlite",
        version: 1,
        state: "snapshot",
        savedAt: "2026-08-09T05:00:00.000Z",
        payload: JSON.stringify(payload("2026-08-09T04:00:00.000Z")),
      }),
    );
    await expect(store.read("timestamp-mismatch")).rejects.toThrow(/시각/u);
  });
});
