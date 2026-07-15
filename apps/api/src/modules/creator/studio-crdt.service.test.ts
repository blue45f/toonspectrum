import { fromUint8Array, toUint8Array } from "js-base64";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { studioCrdtPayloadHash } from "./studio-crdt.repository";
import {
  STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES,
  StudioCrdtDocumentTooLargeError,
  StudioCrdtInvalidPayloadError,
  StudioCrdtService,
  StudioCrdtStorageCorruptionError,
  StudioCrdtUpdateIdConflictError,
  chunkStudioCrdtSyncDiff,
  encodeStudioCrdtServerStateVector,
} from "./studio-crdt.service";

import type {
  AppendStudioCrdtUpdateInput,
  AppendStudioCrdtUpdateResult,
  CompactStudioCrdtInput,
  StudioCrdtHydrationState,
  StudioCrdtRepository,
  StudioCrdtSnapshotRecord,
  StudioCrdtUpdateReceiptRecord,
  StudioCrdtUpdateRecord,
} from "./studio-crdt.repository";

function copyBytes(value: Uint8Array): Uint8Array {
  return Uint8Array.from(value);
}

function copyUpdate(update: StudioCrdtUpdateRecord): StudioCrdtUpdateRecord {
  return { ...update, payload: copyBytes(update.payload), createdAt: new Date(update.createdAt) };
}

class MemoryStudioCrdtRepository implements StudioCrdtRepository {
  readonly snapshots = new Map<string, StudioCrdtSnapshotRecord>();
  readonly updates = new Map<string, StudioCrdtUpdateRecord[]>();
  readonly receipts = new Map<string, StudioCrdtUpdateReceiptRecord>();
  nextSequence = 1n;
  failAppend = false;
  compactCalls = 0;

  async loadDocument(workId: string): Promise<StudioCrdtHydrationState> {
    const snapshot = this.snapshots.get(workId) ?? null;
    const compactedSequence = snapshot?.compactedSequence ?? 0n;
    return {
      snapshot: snapshot
        ? { ...snapshot, snapshot: copyBytes(snapshot.snapshot), updatedAt: new Date(snapshot.updatedAt) }
        : null,
      updates: (this.updates.get(workId) ?? [])
        .filter((update) => update.sequence > compactedSequence)
        .map(copyUpdate),
    };
  }

  async loadCatchUp(workId: string, afterSequence: bigint): Promise<StudioCrdtHydrationState> {
    const storedSnapshot = this.snapshots.get(workId) ?? null;
    const snapshot =
      storedSnapshot && storedSnapshot.compactedSequence > afterSequence
        ? {
            ...storedSnapshot,
            snapshot: copyBytes(storedSnapshot.snapshot),
            updatedAt: new Date(storedSnapshot.updatedAt),
          }
        : null;
    const effectiveSequence = snapshot?.compactedSequence ?? afterSequence;
    return {
      snapshot,
      updates: (this.updates.get(workId) ?? [])
        .filter((update) => update.sequence > effectiveSequence)
        .map(copyUpdate),
    };
  }

  async listUpdatesAfter(workId: string, sequence: bigint): Promise<StudioCrdtUpdateRecord[]> {
    return (this.updates.get(workId) ?? [])
      .filter((update) => update.sequence > sequence)
      .map(copyUpdate);
  }

  async appendUpdate(input: AppendStudioCrdtUpdateInput): Promise<AppendStudioCrdtUpdateResult> {
    if (this.failAppend) throw new Error("write failed");
    const receiptKey = JSON.stringify([input.workId, input.updateId]);
    const existingReceipt = this.receipts.get(receiptKey);
    if (existingReceipt) {
      return {
        inserted: false,
        receipt: {
          ...existingReceipt,
          payloadHash: copyBytes(existingReceipt.payloadHash),
          createdAt: new Date(existingReceipt.createdAt),
        },
      };
    }
    const rows = this.updates.get(input.workId) ?? [];
    const update: StudioCrdtUpdateRecord = {
      workId: input.workId,
      sequence: this.nextSequence,
      updateId: input.updateId,
      actorUserId: input.actorUserId,
      payload: copyBytes(input.payload),
      createdAt: new Date(input.createdAt),
    };
    this.nextSequence += 1n;
    rows.push(update);
    this.updates.set(input.workId, rows);
    const receipt: StudioCrdtUpdateReceiptRecord = {
      workId: input.workId,
      updateId: input.updateId,
      sequence: update.sequence,
      actorUserId: input.actorUserId,
      payloadHash: studioCrdtPayloadHash(input.payload),
      createdAt: new Date(input.createdAt),
    };
    this.receipts.set(receiptKey, receipt);
    return {
      inserted: true,
      receipt: {
        ...receipt,
        payloadHash: copyBytes(receipt.payloadHash),
        createdAt: new Date(receipt.createdAt),
      },
    };
  }

  async compact(input: CompactStudioCrdtInput): Promise<boolean> {
    this.compactCalls += 1;
    const existing = this.snapshots.get(input.workId);
    if (existing && existing.compactedSequence >= input.throughSequence) return false;
    this.snapshots.set(input.workId, {
      workId: input.workId,
      snapshot: copyBytes(input.snapshot),
      compactedSequence: input.throughSequence,
      updatedAt: new Date(input.updatedAt),
    });
    this.updates.set(
      input.workId,
      (this.updates.get(input.workId) ?? []).filter(
        (update) => update.sequence > input.throughSequence
      )
    );
    return true;
  }
}

const services: StudioCrdtService[] = [];

function service(
  repository: MemoryStudioCrdtRepository,
  options: ConstructorParameters<typeof StudioCrdtService>[1] = {}
): StudioCrdtService {
  const created = new StudioCrdtService(repository, options);
  services.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((current) => current.onModuleDestroy()));
});

function yUpdate(key: string, value: string): string {
  const doc = new Y.Doc();
  doc.getMap<string>("root").set(key, value);
  const update = fromUint8Array(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return update;
}

function syncBytes(sync: Awaited<ReturnType<StudioCrdtService["sync"]>>): Uint8Array {
  const result = new Uint8Array(sync.totalBytes);
  let offset = 0;
  for (const chunk of sync.chunks) {
    const decoded = toUint8Array(chunk);
    result.set(decoded, offset);
    offset += decoded.byteLength;
  }
  expect(offset).toBe(sync.totalBytes);
  expect(sync.chunkCount).toBe(sync.chunks.length);
  return result;
}

function applySync(
  target: Y.Doc,
  sync: Awaited<ReturnType<StudioCrdtService["sync"]>>
): void {
  Y.applyUpdate(target, syncBytes(sync));
}

describe("StudioCrdtService", () => {
  it("strictly rejects malformed base64, malformed Yjs updates, and non-UUID ids", async () => {
    const current = service(new MemoryStudioCrdtRepository());
    await expect(current.sync("work-1", "not-base64")).rejects.toBeInstanceOf(
      StudioCrdtInvalidPayloadError
    );
    await expect(
      current.applyUpdate({
        workId: "work-1",
        updateId: "not-a-uuid",
        actorUserId: "editor",
        data: yUpdate("a", "1"),
      })
    ).rejects.toBeInstanceOf(StudioCrdtInvalidPayloadError);
    await expect(
      current.applyUpdate({
        workId: "work-1",
        updateId: "00000000-0000-4000-8000-000000000001",
        actorUserId: "editor",
        data: fromUint8Array(Uint8Array.of(255, 255, 255)),
      })
    ).rejects.toBeInstanceOf(StudioCrdtInvalidPayloadError);
  });

  it("rejects syntactically valid Yjs updates that poison Studio root collection types", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const current = service(repository);
    const poison = new Y.Doc();
    poison.getMap<unknown>("strokes").set("poison", "not-a-map");

    await expect(
      current.applyUpdate({
        workId: "work-1",
        updateId: "00000000-0000-4000-8000-000000000102",
        actorUserId: "editor",
        data: fromUint8Array(Y.encodeStateAsUpdate(poison)),
      })
    ).rejects.toBeInstanceOf(StudioCrdtInvalidPayloadError);
    expect(repository.updates.get("work-1") ?? []).toEqual([]);
    expect(repository.receipts.size).toBe(0);
    poison.destroy();
  });

  it("classifies a poisoned persisted Studio root as stored-state corruption", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const poison = new Y.Doc();
    poison.getArray<unknown>("stroke-order").push(["not-a-map"]);
    repository.snapshots.set("work-1", {
      workId: "work-1",
      snapshot: Y.encodeStateAsUpdate(poison),
      compactedSequence: 1n,
      updatedAt: new Date("2026-07-16T00:00:00.000Z"),
    });
    poison.destroy();

    await expect(service(repository).sync("work-1")).rejects.toBeInstanceOf(
      StudioCrdtStorageCorruptionError
    );
  });

  it("rejects a prospective state-vector overflow before persisting the update", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const current = service(repository, { stateVectorMaxBytes: 1 });

    await expect(
      current.applyUpdate({
        workId: "work-1",
        updateId: "00000000-0000-4000-8000-000000000101",
        actorUserId: "editor",
        data: yUpdate("stroke", "1"),
      })
    ).rejects.toBeInstanceOf(StudioCrdtDocumentTooLargeError);

    expect(repository.updates.get("work-1") ?? []).toEqual([]);
    expect(repository.receipts.size).toBe(0);
  });

  it("classifies an oversized hydrated state vector as stored-state corruption", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const stored = new Y.Doc();
    stored.getMap<string>("root").set("stroke", "1");
    repository.snapshots.set("work-1", {
      workId: "work-1",
      snapshot: Y.encodeStateAsUpdate(stored),
      compactedSequence: 1n,
      updatedAt: new Date("2026-07-16T00:00:00.000Z"),
    });
    stored.destroy();

    const current = service(repository, { stateVectorMaxBytes: 1 });
    await expect(current.sync("work-1")).rejects.toBeInstanceOf(
      StudioCrdtStorageCorruptionError
    );
  });

  it("defensively refuses to construct a response with an oversized server vector", () => {
    const doc = new Y.Doc();
    doc.getMap<string>("root").set("stroke", "1");
    const encodedLength = Y.encodeStateVector(doc).byteLength;

    expect(() => encodeStudioCrdtServerStateVector(doc, encodedLength - 1)).toThrow(
      StudioCrdtStorageCorruptionError
    );
    expect(toUint8Array(encodeStudioCrdtServerStateVector(doc))).toHaveLength(
      encodedLength
    );
    doc.destroy();
  });

  it("persists before mutating the cached document", async () => {
    const repository = new MemoryStudioCrdtRepository();
    repository.failAppend = true;
    const current = service(repository);
    await expect(
      current.applyUpdate({
        workId: "work-1",
        updateId: "00000000-0000-4000-8000-000000000002",
        actorUserId: "editor",
        data: yUpdate("lost", "no"),
      })
    ).rejects.toThrow("write failed");
    repository.failAppend = false;
    const target = new Y.Doc();
    applySync(target, await current.sync("work-1"));
    expect(target.getMap("root").has("lost")).toBe(false);
    target.destroy();
  });

  it("deduplicates exact retries and rejects update-id collisions", async () => {
    const current = service(new MemoryStudioCrdtRepository());
    const input = {
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000003",
      actorUserId: "editor",
      data: yUpdate("a", "1"),
    };
    await expect(current.applyUpdate(input)).resolves.toMatchObject({
      duplicate: false,
      serverSequence: "1",
    });
    await expect(current.applyUpdate(input)).resolves.toMatchObject({
      duplicate: true,
      serverSequence: "1",
    });
    await expect(
      current.applyUpdate({ ...input, data: yUpdate("b", "2") })
    ).rejects.toBeInstanceOf(StudioCrdtUpdateIdConflictError);
  });

  it("catches up from durable updates across API service instances before sync and update", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const first = service(repository);
    const second = service(repository);
    await first.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000004",
      actorUserId: "editor-a",
      data: yUpdate("a", "1"),
    });
    expect((await second.sync("work-1")).serverSequence).toBe("1");
    await second.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000005",
      actorUserId: "editor-b",
      data: yUpdate("b", "2"),
    });
    const sync = await first.sync("work-1");
    expect(sync.serverSequence).toBe("2");
    const target = new Y.Doc();
    applySync(target, sync);
    expect(Object.fromEntries(target.getMap("root"))).toEqual({ a: "1", b: "2" });
    target.destroy();
  });

  it("returns a state-vector diff and the server vector for local-op reupload", async () => {
    const current = service(new MemoryStudioCrdtRepository());
    const updateA = yUpdate("a", "1");
    await current.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000006",
      actorUserId: "editor",
      data: updateA,
    });
    await current.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000007",
      actorUserId: "editor",
      data: yUpdate("b", "2"),
    });

    const client = new Y.Doc();
    Y.applyUpdate(client, toUint8Array(updateA));
    const sync = await current.sync("work-1", fromUint8Array(Y.encodeStateVector(client)));
    applySync(client, sync);
    expect(Object.fromEntries(client.getMap("root"))).toEqual({ a: "1", b: "2" });

    client.getMap<string>("root").set("offline", "local");
    const missingOnServer = Y.encodeStateAsUpdate(client, toUint8Array(sync.serverStateVector));
    expect(missingOnServer.byteLength).toBeGreaterThan(2);
    await current.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000008",
      actorUserId: "editor",
      data: fromUint8Array(missingOnServer),
    });
    const reloaded = new Y.Doc();
    applySync(reloaded, await current.sync("work-1"));
    expect(reloaded.getMap("root").get("offline")).toBe("local");
    client.destroy();
    reloaded.destroy();
  });

  it("compacts by threshold and hydrates a new process from snapshot plus later updates", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const first = service(repository, { compactUpdateCount: 2 });
    await first.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000009",
      actorUserId: "editor",
      data: yUpdate("a", "1"),
    });
    await first.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000010",
      actorUserId: "editor",
      data: yUpdate("b", "2"),
    });
    expect(repository.compactCalls).toBe(1);
    expect(repository.snapshots.get("work-1")?.compactedSequence).toBe(2n);
    expect(repository.updates.get("work-1")).toEqual([]);

    await first.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000011",
      actorUserId: "editor",
      data: yUpdate("c", "3"),
    });
    const second = service(repository);
    const target = new Y.Doc();
    applySync(target, await second.sync("work-1"));
    expect(Object.fromEntries(target.getMap("root"))).toEqual({ a: "1", b: "2", c: "3" });
    target.destroy();
  });

  it("keeps exact-retry dedupe receipts after compaction deletes old update payloads", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const current = service(repository, { compactUpdateCount: 2 });
    const firstInput = {
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000012",
      actorUserId: "editor",
      data: yUpdate("a", "1"),
    };
    await current.applyUpdate(firstInput);
    await current.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000013",
      actorUserId: "editor",
      data: yUpdate("b", "2"),
    });
    expect(repository.updates.get("work-1")).toEqual([]);

    await expect(current.applyUpdate(firstInput)).resolves.toMatchObject({
      duplicate: true,
      serverSequence: "1",
    });
    await expect(
      current.applyUpdate({ ...firstInput, data: yUpdate("collision", "different") })
    ).rejects.toBeInstanceOf(StudioCrdtUpdateIdConflictError);
  });

  it("evicts idle documents and destroys all cached state on shutdown", async () => {
    let now = new Date("2026-07-16T00:00:00.000Z");
    const current = service(new MemoryStudioCrdtRepository(), {
      now: () => now,
      idleEvictionMs: 1_000,
    });
    await current.sync("work-1");
    expect(current.cachedDocumentCount).toBe(1);
    now = new Date(now.getTime() + 1_001);
    expect(current.evictIdleDocuments()).toBe(1);
    expect(current.cachedDocumentCount).toBe(0);
    await current.sync("work-2");
    await current.onModuleDestroy();
    expect(current.cachedDocumentCount).toBe(0);
  });

  it("chunks sync diffs at the exact 40 KiB decoded boundary", () => {
    const source = new Uint8Array(STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES * 2 + 7);
    source.fill(17);
    const chunks = chunkStudioCrdtSyncDiff(source);
    expect(chunks.map((chunk) => toUint8Array(chunk).byteLength)).toEqual([
      STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES,
      STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES,
      7,
    ]);
  });
});
