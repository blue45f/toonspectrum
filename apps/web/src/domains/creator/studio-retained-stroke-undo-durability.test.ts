import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCrdtDocument } from "./live/studio-crdt-document";
import { publishStudioCrdtDrawGraphDiff } from "./live/studio-crdt-scene-publisher";
import { StudioAutosaveOpfsSession } from "./studio-autosave-opfs-session";
import { createStudioOpfsMemoryFileSystem } from "./studio-opfs-filesystem";
import { createStudioOpfsRecoveryJournal } from "./studio-opfs-recovery-journal";
import { createStudioLifecycleEmergencyAutosave } from "./studio-pending-stroke-durability";
import {
  undoStudioRetainedStrokeHistory,
  type StudioRetainedStrokeQueuedBatch,
  type StudioRetainedStrokeUndoneBatch,
} from "./studio-retained-stroke-history";

import type { StudioAutosavePersistenceReceipt } from "./studio-autosave-opfs-session";
import type { DrawEl } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

const stroke: DrawEl = {
  id: "pending", type: "draw", mode: "pen", kind: "freehand", brush: "pen",
  points: [10, 10, 50, 50], pressures: [0.5, 0.5], stroke: "#000000", strokeWidth: 10,
};
const earlierStroke = { ...stroke, id: "earlier" };
const disposals: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
  vi.useRealTimers();
});

function fixture(options: { empty?: boolean; holdFirstWrite?: boolean } = {}) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fileSystem = createStudioOpfsMemoryFileSystem();
  const identity = { documentId: "retained-undo", documentVersion: 2, engineVersion: "studio-autosave-v2" };
  const makeJournal = () => createStudioOpfsRecoveryJournal({
    identity,
    adapter: {
      kind: "fake-opfs",
      read: fileSystem.read,
      writeAtomic: fileSystem.write,
      remove: async (path) => { await fileSystem.remove(path); },
      list: fileSystem.list,
      size: fileSystem.size,
      estimateQuota: async () => null,
      withExclusiveLock: async (_name, _signal, operation) => operation(),
    },
    now: () => 1000,
    randomToken: () => "retained-undo-writer",
  });
  const journal = makeJournal();
  let releaseFirstWrite = () => {};
  const firstWriteGate = options.holdFirstWrite
    ? new Promise<void>((resolve) => { releaseFirstWrite = resolve; })
    : Promise.resolve();
  const appendCheckpoint = journal.appendCheckpoint.bind(journal);
  let firstWrite = true;
  journal.appendCheckpoint = async (...args) => {
    if (firstWrite) { firstWrite = false; await firstWriteGate; }
    return appendCheckpoint(...args);
  };
  const sessionOptions = { autosaveKey: "retained-undo", ownerId: "writer", now: () => 1000 };
  const writer = new StudioAutosaveOpfsSession({ ...sessionOptions, journal });
  const document = new StudioCrdtDocument();
  disposals.push(() => { releaseFirstWrite(); document.destroy(); return writer.dispose(); });
  const pages: PageState[] = [{
    id: "page", elements: options.empty ? [] : [earlierStroke],
    bg: "#ffffff", bgGrad: null, canvasH: 1080,
  }];
  const pending = { current: {
    pageId: "page", strokes: [stroke], retryCount: 0,
    timer: setTimeout(() => { throw new Error("undone batch must not flush"); }, 500),
  } as StudioRetainedStrokeQueuedBatch | null };
  const undone = { current: null as StudioRetainedStrokeUndoneBatch | null };
  publishStudioCrdtDrawGraphDiff(document, [{ ...pages[0]!, elements: [] }], [
    { ...pages[0]!, elements: [...pages[0]!.elements, stroke] },
  ]);
  const writes: Array<Promise<StudioAutosavePersistenceReceipt>> = [];
  const state = { generation: 1, retryRequests: 0, saveInFlight: false };
  const persist = vi.fn(() => {
    const result = createStudioLifecycleEmergencyAutosave({
      payload: { version: 2, savedAt: "2026-09-07T00:00:00.000Z", pagesList: pages, currentPageId: "page" },
      pending: pending.current,
      reason: "pointerup",
      savedAt: new Date(Date.UTC(2026, 8, 7, 0, 0, state.generation)).toISOString(),
      documentScope: { kind: "local" },
    });
    if (!result.ok) throw new Error(result.reason);
    writes.push(writer.write(result.payload));
  });
  const context = {
    pending, undone,
    getPages: () => pages,
    getHistoryIndex: () => 3,
    isBlocked: () => state.saveInFlight,
    publish: vi.fn((before: readonly PageState[], after: readonly PageState[]) => {
      publishStudioCrdtDrawGraphDiff(document, before, after, { registerNewDraws: false });
      return true;
    }),
    onUndone: vi.fn(() => { state.generation += 1; state.retryRequests += 1; }),
    persist,
  };
  async function readAfterCrash() {
    // Reopen only the durable bytes: no writer disposal, pagehide handler, flush, or memory history.
    const writesBeforeRead = fileSystem.counts.write;
    const reader = new StudioAutosaveOpfsSession({ ...sessionOptions, ownerId: "reader", journal: makeJournal() });
    const result = await reader.readLatest();
    expect(fileSystem.counts.write).toBe(writesBeforeRead);
    await reader.dispose();
    return result;
  }
  return { context, document, pending, undone, state, pages, writes, persist, readAfterCrash, releaseFirstWrite };
}

describe("retained Undo durable recovery", () => {
  it.each([false, true])("replaces the pending snapshot before recovery, including an empty page (%s)", async (empty) => {
    const f = fixture({ empty });
    f.persist();
    await f.writes[0];
    expect(undoStudioRetainedStrokeHistory(f.context)).toBe(true);
    expect(f.writes).toHaveLength(2);
    expect(f.state).toMatchObject({ generation: 2, retryRequests: 1 });
    expect(f.undone.current?.strokes).toEqual([stroke]);
    expect(f.pending.current).toBeNull();
    vi.advanceTimersByTime(500);
    await f.writes[1];
    const recovered = await f.readAfterCrash();
    expect(recovered?.state).toBe("snapshot");
    if (recovered?.state !== "snapshot") throw new Error("Undo checkpoint missing");
    expect(recovered.payload.pagesList[0]?.elements)
      .toEqual(empty ? [] : [earlierStroke]);
    expect(recovered.payload.pendingStrokeDurability).toBeUndefined();
    expect(recovered.payload.lifecycleDurability?.pendingStrokeIds).toBeUndefined();
    expect(recovered.savedAt).toBe("2026-09-07T00:00:02.000Z");
    expect(f.document.getStroke("pending", true)?.deleted).toBe(true);
    if (!empty) expect(f.document.getStroke("earlier")).toMatchObject({ id: "earlier", deleted: false });
    expect(f.pages[0]!.elements).toEqual(empty ? [] : [earlierStroke]);
  });

  it("queues the newer Undo generation while the pointerup checkpoint is still in flight", async () => {
    const f = fixture({ holdFirstWrite: true });
    f.persist();
    expect(undoStudioRetainedStrokeHistory(f.context)).toBe(true);
    expect(f.writes).toHaveLength(2);
    expect(f.context.onUndone.mock.invocationCallOrder[0]).toBeLessThan(f.persist.mock.invocationCallOrder[1]!);
    f.releaseFirstWrite();
    await Promise.all(f.writes);
    const recovered = await f.readAfterCrash();
    expect(recovered).toMatchObject({
      state: "snapshot", revision: 2,
      payload: { pagesList: [{ elements: [{ id: "earlier" }] }] },
    });
    if (recovered?.state === "snapshot") expect(recovered.payload.pagesList[0]!.elements).toHaveLength(1);
  });

  it.each(["saving", "publication-rejected", "page-missing"] as const)(
    "preserves the queued stroke and previous recovery when Undo is %s", async (reason) => {
      const f = fixture();
      f.persist();
      await f.writes[0];
      const before = await f.readAfterCrash();
      const pending = f.pending.current;
      if (reason === "saving") f.state.saveInFlight = true;
      if (reason === "publication-rejected") f.context.publish.mockReturnValue(false);
      if (reason === "page-missing") f.context.getPages = () => [];
      expect(undoStudioRetainedStrokeHistory(f.context)).toBe(false);
      expect(f.pending.current).toBe(pending);
      expect(f.undone.current).toBeNull();
      expect(f.context.onUndone).not.toHaveBeenCalled();
      expect(f.persist).toHaveBeenCalledOnce();
      expect(f.state).toMatchObject({ generation: 1, retryRequests: 0 });
      expect(await f.readAfterCrash()).toEqual(before);
      expect(f.document.getStroke("pending")?.deleted).toBe(false);
      if (reason !== "publication-rejected") expect(f.context.publish).not.toHaveBeenCalled();
      if (pending?.timer) clearTimeout(pending.timer);
    },
  );
});
