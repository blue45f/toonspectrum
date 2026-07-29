import { describe, expect, it } from "vitest";

import {
  serializeStudioAutosave,
  studioLifecycleAutosaveSidecarKey,
  type StudioAutosavePayload,
  type StudioAutosaveStorage,
} from "./studio-autosave";
import {
  StudioAutosaveOpfsSession,
  persistStudioAutosaveWithOpfsPrimary,
  reconcileStudioAutosaveWithOpfsPrimary,
  type StudioAutosaveOpfsJournalPort,
} from "./studio-autosave-opfs-session";
import {
  type StudioOpfsRecoveryEntry,
  type StudioOpfsRecoveryScan,
  type StudioOpfsRecoveryWriterLease,
} from "./studio-opfs-recovery-journal";

const DOCUMENT_ID = "autosave-test-document";
const ENGINE_VERSION = "studio-autosave-v2";

function payload(savedAt: string, elementId = "stroke-1"): StudioAutosavePayload {
  return {
    version: 2,
    savedAt,
    pagesList: [{
      id: "page-1",
      elements: [{ id: elementId, type: "draw" }],
      canvasH: 2_000,
    }],
    currentPageId: "page-1",
  };
}

function memoryStorage(
  initial: Readonly<Record<string, string>> = {},
): StudioAutosaveStorage & { readonly values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

class FakeAutosaveJournal implements StudioAutosaveOpfsJournalPort {
  readonly payloads = new Map<string, Uint8Array>();
  entries: StudioOpfsRecoveryEntry[] = [];
  epoch = 0;
  acquireCount = 0;
  renewCount = 0;
  releaseCount = 0;
  now = 1_000;

  async scan(): Promise<StudioOpfsRecoveryScan> {
    return Object.freeze({
      generation: this.entries.length,
      writerEpoch: this.epoch,
      lastSequence: this.entries.at(-1)?.sequence ?? 0,
      totalPayloadBytes: this.entries.reduce((total, entry) => total + entry.byteLength, 0),
      entries: Object.freeze([...this.entries]),
      selectedSlot: this.entries.length > 0 ? "a" : null,
      ignoredSlots: Object.freeze([]),
    });
  }

  async *readPayload(entry: StudioOpfsRecoveryEntry): AsyncIterable<Uint8Array> {
    const bytes = this.payloads.get(entry.descriptorPath);
    if (!bytes) throw new Error("missing payload");
    const split = Math.floor(bytes.byteLength / 2);
    if (split > 0) yield bytes.slice(0, split);
    yield bytes.slice(split);
  }

  async acquireWriter(
    input: { readonly ownerId: string },
  ): Promise<StudioOpfsRecoveryWriterLease> {
    this.acquireCount += 1;
    this.epoch += 1;
    return Object.freeze({
      documentId: DOCUMENT_ID,
      ownerId: input.ownerId,
      token: `token-${this.epoch}`,
      epoch: this.epoch,
      acquiredAt: this.now,
      expiresAt: this.now + 30_000,
    });
  }

  async renewWriter(
    writer: StudioOpfsRecoveryWriterLease,
  ): Promise<StudioOpfsRecoveryWriterLease> {
    this.renewCount += 1;
    return Object.freeze({
      ...writer,
      expiresAt: this.now + 30_000,
    });
  }

  async releaseWriter(): Promise<void> {
    this.releaseCount += 1;
  }

  async appendCheckpoint(
    writer: StudioOpfsRecoveryWriterLease,
    input: {
      readonly id: string;
      readonly pageId: string;
      readonly revision: number;
      readonly payload: Uint8Array;
      readonly byteLength: number;
      readonly createdAt: number;
      readonly compactThroughSequence: number;
    },
  ): Promise<StudioOpfsRecoveryEntry> {
    const sequence = (this.entries.at(-1)?.sequence ?? 0) + 1;
    this.entries = this.entries.filter(
      (entry) =>
        entry.pageId !== input.pageId
        || entry.sequence > input.compactThroughSequence,
    );
    const descriptorPath = `entry-${sequence}`;
    const entry: StudioOpfsRecoveryEntry = Object.freeze({
      kind: "checkpoint",
      id: input.id,
      sequence,
      pageId: input.pageId,
      revision: input.revision,
      documentId: writer.documentId,
      documentVersion: 2,
      engineVersion: ENGINE_VERSION,
      writerEpoch: writer.epoch,
      createdAt: input.createdAt,
      byteLength: input.byteLength,
      chunks: Object.freeze([{
        path: `chunk-${sequence}`,
        byteLength: input.byteLength,
        crc32: 0,
      }]),
      compactThroughSequence: input.compactThroughSequence,
      descriptorPath,
      descriptorCrc32: 0,
    });
    this.payloads.set(descriptorPath, Uint8Array.from(input.payload));
    this.entries.push(entry);
    return entry;
  }

  async evictObsolete(): Promise<unknown> {
    return Object.freeze({ removedPaths: Object.freeze([]), freedBytes: 0 });
  }
}

function session(
  journal: FakeAutosaveJournal,
  key = "toonspectrum-studio-autosave:v2:guest:new",
): StudioAutosaveOpfsSession {
  return new StudioAutosaveOpfsSession({
    autosaveKey: key,
    journal,
    ownerId: "autosave-test-owner",
    now: () => journal.now,
  });
}

describe("StudioAutosaveOpfsSession", () => {
  it("writes one compacted checkpoint and restores the newest complete Studio payload", async () => {
    const journal = new FakeAutosaveJournal();
    const target = session(journal);

    const first = await target.write(payload("2026-07-30T01:00:00.000Z", "first"));
    const second = await target.write(payload("2026-07-30T01:01:00.000Z", "second"));
    const restored = await target.readLatest();

    expect(first).toMatchObject({ authority: "opfs-journal", sequence: 1, revision: 1 });
    expect(second).toMatchObject({ authority: "opfs-journal", sequence: 2, revision: 2 });
    expect(journal.entries).toHaveLength(1);
    expect(restored).toMatchObject({
      state: "snapshot",
      sequence: 2,
      revision: 2,
      payload: {
        pagesList: [{ elements: [{ id: "second" }] }],
      },
    });
    await target.dispose();
    expect(journal.releaseCount).toBe(1);
  });

  it("uses a durable tombstone so a cleared recovery cannot reappear on reload", async () => {
    const journal = new FakeAutosaveJournal();
    const target = session(journal);
    await target.write(payload("2026-07-30T01:00:00.000Z"));
    await target.clear("2026-07-30T02:00:00.000Z");

    expect(await target.readLatest()).toEqual({
      state: "cleared",
      savedAt: "2026-07-30T02:00:00.000Z",
      sequence: 2,
      revision: 2,
    });
    expect(journal.entries).toHaveLength(1);
  });

  it("fails closed when checkpoint bytes are modified after commit", async () => {
    const journal = new FakeAutosaveJournal();
    const target = session(journal);
    await target.write(payload("2026-07-30T01:00:00.000Z"));
    const entry = journal.entries[0]!;
    const bytes = journal.payloads.get(entry.descriptorPath)!;
    bytes[Math.floor(bytes.byteLength / 2)] ^= 0x01;

    await expect(target.readLatest()).rejects.toThrow(/무결성|JSON/u);
  });

  it("renews a near-expiry writer and reacquires an expired writer", async () => {
    const journal = new FakeAutosaveJournal();
    const target = session(journal);
    await target.write(payload("2026-07-30T01:00:00.000Z", "first"));
    journal.now = 26_500;
    await target.write(payload("2026-07-30T01:01:00.000Z", "second"));
    expect(journal.renewCount).toBe(1);

    journal.now = 100_000;
    await target.write(payload("2026-07-30T01:02:00.000Z", "third"));
    expect(journal.acquireCount).toBe(2);
  });
});

describe("Studio autosave OPFS authority reconciliation", () => {
  it("commits OPFS first and keeps browser storage as the restore cache", async () => {
    const key = "autosave-primary";
    const storage = memoryStorage({
      [studioLifecycleAutosaveSidecarKey(key)]: serializeStudioAutosave(
        payload("2026-07-30T00:00:00.000Z", "old"),
      ),
    });
    const journal = new FakeAutosaveJournal();
    const target = session(journal, key);
    const next = payload("2026-07-30T03:00:00.000Z", "durable");

    const receipt = await persistStudioAutosaveWithOpfsPrimary({
      session: target,
      storage,
      key,
      payload: next,
    });

    expect(receipt.authority).toBe("opfs-journal");
    expect(storage.getItem(key)).toBe(serializeStudioAutosave(next));
    expect(storage.getItem(studioLifecycleAutosaveSidecarKey(key))).toBeNull();
  });

  it("falls back to browser storage when a durable session is unavailable", async () => {
    const key = "autosave-fallback";
    const storage = memoryStorage();
    const next = payload("2026-07-30T03:00:00.000Z");
    const receipt = await persistStudioAutosaveWithOpfsPrimary({
      session: null,
      storage,
      key,
      payload: next,
    });

    expect(receipt).toMatchObject({
      authority: "browser-storage-fallback",
      sequence: null,
      revision: null,
    });
    expect(storage.getItem(key)).toBe(serializeStudioAutosave(next));
  });

  it("selects a newer OPFS snapshot and migrates a newer lifecycle fallback back to OPFS", async () => {
    const key = "autosave-reconcile";
    const journal = new FakeAutosaveJournal();
    const target = session(journal, key);
    await target.write(payload("2026-07-30T03:00:00.000Z", "opfs"));
    const storage = memoryStorage({
      [key]: serializeStudioAutosave(payload("2026-07-30T02:00:00.000Z", "local-old")),
    });

    const durableWins = await reconcileStudioAutosaveWithOpfsPrimary({
      session: target,
      storage,
      key,
    });
    expect(durableWins).toMatchObject({
      authority: "opfs-journal",
      migratedToOpfs: false,
      candidate: { payload: { pagesList: [{ elements: [{ id: "opfs" }] }] } },
    });

    storage.setItem(
      studioLifecycleAutosaveSidecarKey(key),
      serializeStudioAutosave(payload("2026-07-30T04:00:00.000Z", "lifecycle-new")),
    );
    const localWins = await reconcileStudioAutosaveWithOpfsPrimary({
      session: target,
      storage,
      key,
    });
    expect(localWins).toMatchObject({
      authority: "opfs-journal",
      migratedToOpfs: true,
      candidate: { payload: { pagesList: [{ elements: [{ id: "lifecycle-new" }] }] } },
    });
    expect(await target.readLatest()).toMatchObject({
      state: "snapshot",
      payload: { pagesList: [{ elements: [{ id: "lifecycle-new" }] }] },
    });
  });

  it("honors a newer durable clear checkpoint over stale browser recovery", async () => {
    const key = "autosave-cleared";
    const journal = new FakeAutosaveJournal();
    const target = session(journal, key);
    await target.write(payload("2026-07-30T01:00:00.000Z"));
    await target.clear("2026-07-30T05:00:00.000Z");
    const storage = memoryStorage({
      [key]: serializeStudioAutosave(payload("2026-07-30T02:00:00.000Z")),
      [studioLifecycleAutosaveSidecarKey(key)]: serializeStudioAutosave(
        payload("2026-07-30T03:00:00.000Z"),
      ),
    });

    const result = await reconcileStudioAutosaveWithOpfsPrimary({
      session: target,
      storage,
      key,
    });

    expect(result).toEqual({
      candidate: null,
      authority: "opfs-journal",
      migratedToOpfs: false,
    });
    expect(storage.values.size).toBe(0);
  });
});
