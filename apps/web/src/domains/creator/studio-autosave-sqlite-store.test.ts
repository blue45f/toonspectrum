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

function gateAutosaveResponse(
  database: Pick<StudioLocalDatabase, "kvGet" | "kvSet">,
  key: string,
  stage: "primary-read" | "recovery-write",
) {
  const entered = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  let armed = true;
  return {
    entered: entered.promise,
    release: () => { released.resolve(); },
    database: {
      async kvGet(namespace: string, candidateKey: string) {
        const raw = await database.kvGet(namespace, candidateKey);
        if (armed && stage === "primary-read" && candidateKey === key) {
          armed = false;
          entered.resolve();
          await released.promise;
        }
        return raw;
      },
      async kvSet(namespace: string, candidateKey: string, value: string) {
        // The Worker serializes database mutations, but delivery of its response can be delayed.
        // Hold the response after applying the mutation so the harness preserves that FIFO contract.
        await database.kvSet(namespace, candidateKey, value);
        if (armed && stage === "recovery-write"
          && candidateKey === studioAutosaveSqliteLastKnownGoodKey(key)) {
          armed = false;
          entered.resolve();
          await released.promise;
        }
      },
    },
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

  it("dispatches an emergency primary write in the calling turn without awaiting a recovery read", async () => {
    const recoveryRead = Promise.withResolvers<string | null>();
    const primaryWrite = Promise.withResolvers<void>();
    const reads: string[] = [];
    const writes: { namespace: string; key: string; value: string }[] = [];
    const store = createStudioAutosaveSqliteStore({
      kvGet(_namespace, key) {
        reads.push(key);
        return recoveryRead.promise;
      },
      kvSet(namespace, key, value) {
        writes.push({ namespace, key, value });
        return primaryWrite.promise;
      },
    });
    const next = payload("2026-08-09T03:00:00.000Z", "emergency");
    let acknowledged = false;
    const pending = store.write("project-emergency-dispatch", next, { mode: "emergency" })
      .then(() => { acknowledged = true; });

    try {
      // A Worker recovery-read response may never reach the old document after beforeunload.
      // The primary must be submitted before that response, with no earlier store-level await.
      expect(reads).toEqual([]);
      expect(writes).toEqual([{
        namespace: STUDIO_AUTOSAVE_SQLITE_NAMESPACE,
        key: "project-emergency-dispatch",
        value: expect.any(String),
      }]);
      expect(JSON.parse(writes[0]!.value)).toMatchObject({
        state: "snapshot",
        savedAt: next.savedAt,
        payload: JSON.stringify(next),
      });
      await Promise.resolve();
      expect(acknowledged).toBe(false);
    } finally {
      recoveryRead.resolve(null);
      primaryWrite.resolve();
      await pending;
    }
    expect(acknowledged).toBe(true);
  });

  it.each(["valid", "corrupt"] as const)(
    "preserves the existing recovery generation during an emergency write over a %s primary",
    async (primaryState) => {
      const store = createStudioAutosaveSqliteStore(database);
      const key = `project-emergency-recovery-${primaryState}`;
      const first = payload("2026-08-09T01:00:00.000Z", "first");
      const second = payload("2026-08-09T02:00:00.000Z", "second");
      const emergency = payload("2026-08-09T03:00:00.000Z", "emergency");
      await store.write(key, first);
      await store.write(key, second);
      const recoveryKey = studioAutosaveSqliteLastKnownGoodKey(key);
      const recoveryBefore = await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, recoveryKey);
      if (primaryState === "corrupt") {
        await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-before-emergency");
      }

      await store.write(key, emergency, { mode: "emergency" });

      expect(await store.read(key)).toMatchObject({ state: "snapshot", payload: emergency });
      expect(await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, recoveryKey))
        .toBe(recoveryBefore);
      await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-after-emergency");
      expect(await store.read(key)).toMatchObject({
        state: "snapshot",
        payload: first,
        recoveredFrom: "last-known-good",
      });
    },
  );

  it("resumes normal recovery rotation after an emergency write", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    const key = "project-emergency-then-normal";
    const emergency = payload("2026-08-09T02:00:00.000Z", "emergency");
    await store.write(key, payload("2026-08-09T01:00:00.000Z", "first"));
    await store.write(key, emergency, { mode: "emergency" });
    await store.write(key, payload("2026-08-09T03:00:00.000Z", "normal"));
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-after-normal");

    expect(await store.read(key)).toMatchObject({
      state: "snapshot",
      payload: emergency,
      recoveredFrom: "last-known-good",
    });
  });

  it("rejects an emergency primary failure without changing the recovery generation", async () => {
    const key = "project-emergency-primary-failure";
    const store = createStudioAutosaveSqliteStore(database);
    await store.write(key, payload("2026-08-09T01:00:00.000Z", "first"));
    await store.write(key, payload("2026-08-09T02:00:00.000Z", "second"));
    const recoveryKey = studioAutosaveSqliteLastKnownGoodKey(key);
    const recoveryBefore = await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, recoveryKey);
    const primaryFailure = new Error("emergency primary commit failed");
    const failingStore = createStudioAutosaveSqliteStore({
      kvGet() {
        return Promise.reject(new Error("recovery read must not run"));
      },
      kvSet(_namespace, candidateKey) {
        expect(candidateKey).toBe(key);
        return Promise.reject(primaryFailure);
      },
    });

    await expect(failingStore.write(
      key,
      payload("2026-08-09T03:00:00.000Z", "emergency"),
      { mode: "emergency" },
    )).rejects.toBe(primaryFailure);
    expect(await database.kvGet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, recoveryKey))
      .toBe(recoveryBefore);
  });

  it("does not resurrect an emergency snapshot after an explicit clear and primary corruption", async () => {
    const store = createStudioAutosaveSqliteStore(database);
    const key = "project-emergency-clear";
    await store.write(key, payload("2026-08-09T01:00:00.000Z", "first"));
    await store.write(key, payload("2026-08-09T02:00:00.000Z", "second"));
    await store.write(key, payload("2026-08-09T03:00:00.000Z", "emergency"), { mode: "emergency" });
    await store.clear(key, "2026-08-09T04:00:00.000Z");
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-tombstone");

    expect(await store.read(key)).toEqual({
      state: "cleared",
      savedAt: "2026-08-09T04:00:00.000Z",
      recoveredFrom: "last-known-good",
    });
  });

  it("validates emergency payload content and timestamps before dispatching database work", async () => {
    const calls: string[] = [];
    const store = createStudioAutosaveSqliteStore({
      kvGet() {
        calls.push("read");
        return Promise.resolve(null);
      },
      kvSet() {
        calls.push("write");
        return Promise.resolve();
      },
    });
    await expect(store.write("empty-emergency", {
      ...payload("2026-08-09T04:00:00.000Z"),
      pagesList: [{ id: "page-1", canvasH: 2_000, elements: [] }],
    }, { mode: "emergency" })).rejects.toThrow(/내용이 없는/u);
    await expect(store.write(
      "invalid-time-emergency",
      payload("invalid-date"),
      { mode: "emergency" },
    )).rejects.toThrow(/시각/u);
    expect(calls).toEqual([]);
  });

  it.each(["primary-read", "recovery-write"] as const)(
    "does not overwrite a newer emergency snapshot when an older normal %s response arrives late",
    async (stage) => {
      const key = `project-emergency-overtakes-${stage}`;
      await createStudioAutosaveSqliteStore(database)
        .write(key, payload("2026-08-09T01:00:00.000Z", "first"));
      const gate = gateAutosaveResponse(database, key, stage);
      const store = createStudioAutosaveSqliteStore(gate.database);
      const older = store.write(key, payload("2026-08-09T02:00:00.000Z", "normal"));
      await gate.entered;
      const emergency = payload("2026-08-09T03:00:00.000Z", "emergency");

      try {
        await store.write(key, emergency, { mode: "emergency" });
      } finally {
        gate.release();
      }
      await older;

      expect(await store.read(key)).toMatchObject({ state: "snapshot", payload: emergency });
    },
  );

  it("does not overwrite a newer emergency snapshot when an older clear recovery response arrives late", async () => {
    const key = "project-emergency-overtakes-clear";
    await createStudioAutosaveSqliteStore(database)
      .write(key, payload("2026-08-09T01:00:00.000Z", "first"));
    const gate = gateAutosaveResponse(database, key, "recovery-write");
    const store = createStudioAutosaveSqliteStore(gate.database);
    const olderClear = store.clear(key, "2026-08-09T02:00:00.000Z");
    await gate.entered;
    const emergency = payload("2026-08-09T03:00:00.000Z", "emergency");

    try {
      await store.write(key, emergency, { mode: "emergency" });
    } finally {
      gate.release();
    }
    await olderClear;

    expect(await store.read(key)).toMatchObject({ state: "snapshot", payload: emergency });
  });

  it("does not resurrect a cleared draft when an older normal recovery read arrives late", async () => {
    const key = "project-clear-overtakes-normal-read";
    await createStudioAutosaveSqliteStore(database)
      .write(key, payload("2026-08-09T01:00:00.000Z", "first"));
    const gate = gateAutosaveResponse(database, key, "primary-read");
    const store = createStudioAutosaveSqliteStore(gate.database);
    const older = store.write(key, payload("2026-08-09T02:00:00.000Z", "normal"));
    await gate.entered;

    try {
      await store.clear(key, "2026-08-09T03:00:00.000Z");
    } finally {
      gate.release();
    }
    await older;
    expect(await store.read(key)).toEqual({ state: "cleared", savedAt: "2026-08-09T03:00:00.000Z" });
    await database.kvSet(STUDIO_AUTOSAVE_SQLITE_NAMESPACE, key, "{broken-after-concurrent-clear");
    expect(await store.read(key)).toEqual({
      state: "cleared",
      savedAt: "2026-08-09T03:00:00.000Z",
      recoveredFrom: "last-known-good",
    });
  });

  it("rejects an older normal write with the newer emergency failure instead of acknowledging a stale save", async () => {
    const key = "project-newer-emergency-failure";
    const first = payload("2026-08-09T01:00:00.000Z", "first");
    await createStudioAutosaveSqliteStore(database).write(key, first);
    const failure = new Error("newest emergency primary failed");
    const gate = gateAutosaveResponse({
      kvGet: (namespace, candidateKey) => database.kvGet(namespace, candidateKey),
      kvSet(namespace, candidateKey, value) {
        if (candidateKey === key && value.includes("2026-08-09T03:00:00.000Z")) {
          return Promise.reject(failure);
        }
        return database.kvSet(namespace, candidateKey, value);
      },
    }, key, "primary-read");
    const store = createStudioAutosaveSqliteStore(gate.database);
    const older = store.write(key, payload("2026-08-09T02:00:00.000Z", "normal"));
    await gate.entered;

    try {
      await expect(store.write(
        key,
        payload("2026-08-09T03:00:00.000Z", "emergency"),
        { mode: "emergency" },
      )).rejects.toBe(failure);
    } finally {
      gate.release();
    }
    await expect(older).rejects.toBe(failure);
    expect(await store.read(key)).toMatchObject({ state: "snapshot", payload: first });
  });

  it("follows the latest receipt when another emergency supersedes the receipt an older call is awaiting", async () => {
    const key = "project-emergency-receipt-chain";
    await createStudioAutosaveSqliteStore(database)
      .write(key, payload("2026-08-09T01:00:00.000Z", "first"));
    const middleEntered = Promise.withResolvers<void>();
    const middleReleased = Promise.withResolvers<void>();
    const latestFailure = new Error("latest emergency receipt failed");
    const gate = gateAutosaveResponse({
      kvGet: (namespace, candidateKey) => database.kvGet(namespace, candidateKey),
      async kvSet(namespace, candidateKey, value) {
        if (candidateKey === key && value.includes("2026-08-09T04:00:00.000Z")) {
          throw latestFailure;
        }
        await database.kvSet(namespace, candidateKey, value);
        if (candidateKey === key && value.includes("2026-08-09T03:00:00.000Z")) {
          middleEntered.resolve();
          await middleReleased.promise;
        }
      },
    }, key, "primary-read");
    const store = createStudioAutosaveSqliteStore(gate.database);
    let olderSettled = false;
    const older = store.write(key, payload("2026-08-09T02:00:00.000Z", "normal"));
    void older.then(() => { olderSettled = true; }, () => { olderSettled = true; });
    await gate.entered;
    const middle = store.write(
      key,
      payload("2026-08-09T03:00:00.000Z", "middle-emergency"),
      { mode: "emergency" },
    );
    await middleEntered.promise;
    gate.release();

    try {
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect(olderSettled).toBe(false);
      await expect(store.write(
        key,
        payload("2026-08-09T04:00:00.000Z", "latest-emergency"),
        { mode: "emergency" },
      )).rejects.toBe(latestFailure);
    } finally {
      middleReleased.resolve();
    }
    await expect(middle).rejects.toBe(latestFailure);
    await expect(older).rejects.toBe(latestFailure);
  });

  it("does not supersede a pending valid save with an invalid emergency payload", async () => {
    const key = "project-invalid-emergency-keeps-normal";
    const gate = gateAutosaveResponse(database, key, "primary-read");
    const store = createStudioAutosaveSqliteStore(gate.database);
    const normal = payload("2026-08-09T02:00:00.000Z", "normal");
    const pending = store.write(key, normal);
    await gate.entered;
    try {
      await expect(store.write(key, payload("invalid-date"), { mode: "emergency" }))
        .rejects.toThrow(/시각/u);
    } finally {
      gate.release();
    }
    await pending;
    expect(await store.read(key)).toMatchObject({ state: "snapshot", payload: normal });
  });

  it("keeps concurrent mutations for different project keys independent", async () => {
    const key = "project-concurrent-isolation-one";
    const otherKey = "project-concurrent-isolation-two";
    const gate = gateAutosaveResponse(database, key, "primary-read");
    const store = createStudioAutosaveSqliteStore(gate.database);
    const first = payload("2026-08-09T02:00:00.000Z", "first-project");
    const second = payload("2026-08-09T03:00:00.000Z", "second-project");
    const pending = store.write(key, first);
    await gate.entered;
    try {
      await store.write(otherKey, second, { mode: "emergency" });
    } finally {
      gate.release();
    }
    await pending;
    expect(await store.read(key)).toMatchObject({ state: "snapshot", payload: first });
    expect(await store.read(otherKey)).toMatchObject({ state: "snapshot", payload: second });
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
