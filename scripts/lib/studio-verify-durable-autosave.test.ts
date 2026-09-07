import { afterEach, describe, expect, it, vi } from "vitest";

import {
  reconcileStudioAutosaveWithOpfsPrimary,
  StudioAutosaveOpfsSession,
} from "../../apps/web/src/domains/creator/studio-autosave-opfs-session";
import { createStudioAutosaveSqliteStore } from "../../apps/web/src/domains/creator/studio-autosave-sqlite-store";
import { createStudioOpfsMemoryFileSystem } from "../../apps/web/src/domains/creator/studio-opfs-filesystem";
import { createStudioOpfsRecoveryJournal } from "../../apps/web/src/domains/creator/studio-opfs-recovery-journal";

import {
  readDurableStudioAutosaveDocument,
  readDurableStudioAutosaveError,
} from "./studio-verify-durable-autosave.mjs";

import type { StudioAutosavePayload } from "../../apps/web/src/domains/creator/studio-autosave";
import type { Page } from "playwright";

const key = "toonspectrum-studio-autosave:v2:verifier-regression";
const oldTime = "2026-09-07T00:00:01.000Z";
const newTime = "2026-09-07T00:00:02.000Z";
const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function snapshot(savedAt: string, ids: string[]): StudioAutosavePayload {
  return {
    version: 2, savedAt, currentPageId: "page",
    pagesList: [{ id: "page", elements: ids.map((id) => ({
      id, type: "draw", mode: "pen", brush: "pen", points: [10, 20, 30, 40],
      stroke: "#000000", strokeWidth: 4,
    })), canvasH: 1080 }],
    pendingStrokeDurability: {
      kind: "pending-strokes", reason: "pointerup", pageId: "page", strokeIds: ids, savedAt,
    },
  };
}

function fixture() {
  const fs = createStudioOpfsMemoryFileSystem();
  const journal = createStudioOpfsRecoveryJournal({
    identity: { documentId: "verifier", documentVersion: 2, engineVersion: "studio-autosave-v2" },
    adapter: {
      kind: "fake-opfs", read: fs.read, writeAtomic: fs.write,
      remove: async (path) => { await fs.remove(path); },
      list: fs.list, size: fs.size, estimateQuota: async () => null,
      withExclusiveLock: async (_name, _signal, operation) => operation(),
    },
  });
  const session = new StudioAutosaveOpfsSession({ autosaveKey: key, ownerId: "writer", journal });
  disposals.push(() => session.dispose());
  const rows = new Map<string, string>();
  const database = {
    kvGet: vi.fn(async (_namespace: string, rowKey: string) => rows.get(rowKey) ?? null),
    kvSet: vi.fn(async (_namespace: string, rowKey: string, value: string) => { rows.set(rowKey, value); }),
  };
  const sqlite = createStudioAutosaveSqliteStore(database);
  const bridge = {
    moduleUrl: "fixture-opfs", sqliteModuleUrl: "fixture-sqlite", lastError: null,
    open: vi.fn(async () => session),
    openSqlite: vi.fn(async () => sqlite),
  };
  vi.stubGlobal("window", { __studioVerifyDurableAutosaveBridge: bridge });
  // Execute the actual serialized page callback. The bridge supplies real shipped stores,
  // so reads decode the journal and SQLite envelopes rather than a hand-built reader result.
  const page = {
    evaluate: async <Arg, Result>(callback: (arg: Arg) => Result, arg: Arg) => callback(arg),
  } as unknown as Page;
  return { fs, session, sqlite, database, bridge, page };
}

describe("durable Studio verifier reads the same recovery document as the product", () => {
  it.each([
    { name: "newer worker SQLite receipt keeps both just-released strokes", opfs: "snapshot", opfsTime: oldTime, sqlite: "snapshot", sqliteTime: newTime, expected: ["first", "released"] },
    { name: "newer OPFS snapshot wins over stale SQLite", opfs: "snapshot", opfsTime: newTime, sqlite: "snapshot", sqliteTime: oldTime, expected: ["first"] },
    { name: "newer SQLite tombstone prevents resurrection", opfs: "snapshot", opfsTime: oldTime, sqlite: "cleared", sqliteTime: newTime, expected: null },
    { name: "same-time SQLite tombstone outranks an OPFS snapshot", opfs: "snapshot", opfsTime: newTime, sqlite: "cleared", sqliteTime: newTime, expected: null },
    { name: "same-time OPFS tombstone outranks a SQLite snapshot", opfs: "cleared", opfsTime: newTime, sqlite: "snapshot", sqliteTime: newTime, expected: null },
    { name: "same-time snapshots prefer OPFS", opfs: "snapshot", opfsTime: newTime, sqlite: "snapshot", sqliteTime: newTime, expected: ["first"] },
    { name: "stale tombstone does not erase newer OPFS ink", opfs: "snapshot", opfsTime: newTime, sqlite: "cleared", sqliteTime: oldTime, expected: ["first"] },
  ] as const)("$name without writing or migrating during observation", async (scenario) => {
    const f = fixture();
    if (scenario.opfs === "snapshot") await f.session.write(snapshot(scenario.opfsTime, ["first"]));
    else await f.session.clear(scenario.opfsTime);
    if (scenario.sqlite === "snapshot") await f.sqlite.write(key, snapshot(scenario.sqliteTime, ["first", "released"]));
    else await f.sqlite.clear(key, scenario.sqliteTime);
    const beforeFiles = f.fs.snapshot();
    const beforeWrites = f.fs.counts.write;
    f.database.kvSet.mockClear();

    const observed = await readDurableStudioAutosaveDocument(f.page, key);
    const actual = observed ? JSON.parse(observed.raw) as StudioAutosavePayload : null;
    const ids = actual?.pagesList[0]?.elements?.map((element) => (element as { id: string }).id) ?? null;
    expect(ids).toEqual(scenario.expected);
    expect(f.bridge.open).toHaveBeenCalledWith(key, true);
    expect(f.fs.counts.write).toBe(beforeWrites);
    expect(f.fs.snapshot()).toEqual(beforeFiles);
    expect(f.database.kvSet).not.toHaveBeenCalled();
    expect(await readDurableStudioAutosaveError(f.page)).toBeNull();

    // Compare with the real product's reconciliation after the read-only assertions. Product
    // recovery may now migrate/mirror, which is deliberately outside verifier observation.
    const product = await reconcileStudioAutosaveWithOpfsPrimary({
      session: f.session, sqlite: f.sqlite, key, storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
    expect(actual).toEqual(product.candidate?.payload ?? null);
  });

  it("re-reads a later SQLite receipt rather than caching the old snapshot", async () => {
    const f = fixture();
    await f.session.write(snapshot(oldTime, ["first"]));
    const first = await readDurableStudioAutosaveDocument(f.page, key);
    await f.sqlite.write(key, snapshot(newTime, ["first", "released"]));
    const second = await readDurableStudioAutosaveDocument(f.page, key);
    expect(first?.savedAt).toBe(oldTime);
    expect(second?.savedAt).toBe(newTime);
    expect(JSON.parse(second!.raw).pendingStrokeDurability.strokeIds).toEqual(["first", "released"]);
  });

  it("uses SQLite when the journal read is interrupted and clears the stale error", async () => {
    const f = fixture();
    await f.sqlite.write(key, snapshot(newTime, ["first", "released"]));
    vi.spyOn(f.session, "readLatest").mockRejectedValue(new Error("journal publication interrupted"));
    expect((await readDurableStudioAutosaveDocument(f.page, key))?.savedAt).toBe(newTime);
    expect(await readDurableStudioAutosaveError(f.page)).toBeNull();
  });

  it("keeps OPFS recovery available when SQLite cannot open", async () => {
    const f = fixture();
    await f.session.write(snapshot(newTime, ["first"]));
    f.bridge.openSqlite.mockRejectedValue(new Error("worker unavailable"));
    expect((await readDurableStudioAutosaveDocument(f.page, key))?.savedAt).toBe(newTime);
    expect(await readDurableStudioAutosaveError(f.page)).toBeNull();
  });

  it("reports both failed authorities for a polling caller instead of inventing a document", async () => {
    const f = fixture();
    vi.spyOn(f.session, "readLatest").mockRejectedValue(new Error("journal unavailable"));
    f.bridge.openSqlite.mockRejectedValue(new Error("worker unavailable"));
    expect(await readDurableStudioAutosaveDocument(f.page, key)).toBeNull();
    expect(await readDurableStudioAutosaveError(f.page)).toContain("journal unavailable");
    expect(await readDurableStudioAutosaveError(f.page)).toContain("worker unavailable");
  });
});
