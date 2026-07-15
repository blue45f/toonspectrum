import { fromUint8Array, toUint8Array } from "js-base64";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  STUDIO_CRDT_UPDATE_MAX_BYTES,
  studioCrdtPayloadHash,
} from "./studio-crdt.repository";
import {
  STUDIO_CRDT_SYNC_CHUNK_MAX_BYTES,
  StudioCrdtDocumentTooLargeError,
  StudioCrdtInvalidPayloadError,
  StudioCrdtService,
  StudioCrdtStorageCorruptionError,
  StudioCrdtUpdateIdConflictError,
  chunkStudioCrdtSyncDiff,
  encodeStudioCrdtServerStateVector,
  hasValidStudioCrdtRootSchema,
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
  ValidateStudioCrdtAppend,
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
  beforeAppend: (() => Promise<void>) | null = null;
  private readonly mutationTails = new Map<string, Promise<void>>();

  private async withWorkMutation<T>(workId: string, operation: () => Promise<T>): Promise<T> {
    const predecessor = this.mutationTails.get(workId) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = predecessor.then(() => gate);
    this.mutationTails.set(workId, tail);
    await predecessor;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.mutationTails.get(workId) === tail) this.mutationTails.delete(workId);
    }
  }

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

  async appendUpdate(
    input: AppendStudioCrdtUpdateInput,
    validate: ValidateStudioCrdtAppend
  ): Promise<AppendStudioCrdtUpdateResult> {
    await this.beforeAppend?.();
    return this.withWorkMutation(input.workId, async () => {
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
      await validate(await this.loadDocument(input.workId));
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
    });
  }

  async compact(input: CompactStudioCrdtInput): Promise<boolean> {
    return this.withWorkMutation(input.workId, async () => {
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
    });
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

function createScenePageDocument(): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap<boolean>("scene-elements").set("scene-1", true);
  const scene = doc.getMap<unknown>("scene-element:scene-1");
  scene.set("id", "scene-1");
  scene.set("pageId", "page-1");
  scene.set("layerId", "layer-1");
  scene.set("payloadVersion", 1);
  scene.set("type", "text");
  scene.set("deleted", false);
  scene.set("prop:text", "동시에 편집하는 대사");
  scene.set("prop:x", 120);
  scene.set("prop:y", 240);
  scene.set("prop:width", 360);
  scene.set("prop:fontSize", 28);
  scene.set("prop:fill", "#111111");
  scene.set("prop:rotation", 0);
  scene.set("unset:font", false);

  const sceneOrder = new Y.Map<unknown>();
  sceneOrder.set("elementId", "scene-1");
  sceneOrder.set("pageId", "page-1");
  sceneOrder.set("layerId", "layer-1");
  sceneOrder.set("kind", "scene");
  sceneOrder.set("active", true);
  doc.getArray<Y.Map<unknown>>("stroke-order").push([sceneOrder]);

  doc.getMap<boolean>("studio-pages").set("page-1", true);
  const page = doc.getMap<unknown>("studio-page:page-1");
  page.set("id", "page-1");
  page.set("payloadVersion", 1);
  page.set("deleted", false);
  page.set("prop:bg", "#ffffff");
  page.set("prop:bgGrad", null);
  page.set("prop:canvasH", 1080);
  const pageOrder = new Y.Map<unknown>();
  pageOrder.set("pageId", "page-1");
  pageOrder.set("active", true);
  doc.getArray<Y.Map<unknown>>("page-order").push([pageOrder]);
  return doc;
}

const DELETION_OPERATION_ID = "00000000-0000-4000-8000-000000000301";
const DELETION_TARGET = JSON.stringify(["scene", "scene-1"]);

function addSceneDeletionProtocol(doc: Y.Doc, acknowledged = false): void {
  doc.getMap<string>("studio-deletion-ops").set(DELETION_OPERATION_ID, DELETION_TARGET);
  if (acknowledged) {
    doc.getMap<string>("studio-deletion-acks").set(DELETION_OPERATION_ID, DELETION_TARGET);
  }
}

function createSceneOrderFloodDocument(activeEntryCount: number): Y.Doc {
  const doc = createScenePageDocument();
  const order = doc.getArray<Y.Map<unknown>>("stroke-order");
  for (let index = 1; index < activeEntryCount; index += 1) {
    const entry = new Y.Map<unknown>();
    entry.set("elementId", "scene-1");
    entry.set("pageId", "page-1");
    entry.set("layerId", "layer-1");
    entry.set("kind", "scene");
    entry.set("active", true);
    order.push([entry]);
  }
  return doc;
}

function twoPartyBarrier(): () => Promise<void> {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrivals += 1;
    if (arrivals === 2) release?.();
    await ready;
  };
}

function createReferenceTopologyDocument(elementType = "image"): Y.Doc {
  const doc = createScenePageDocument();
  const scene = doc.getMap<unknown>("scene-element:scene-1");
  scene.set("type", "reference");
  for (const key of [...scene.keys()]) {
    if (key.startsWith("base:") || key.startsWith("prop:") || key.startsWith("unset:")) {
      scene.delete(key);
    }
  }
  scene.set("prop:elementType", elementType);
  return doc;
}

function addLayerGroup(
  doc: Y.Doc,
  options: {
    id?: string;
    pageId?: string;
    name?: string;
  } = {}
): Y.Map<unknown> {
  const id = options.id ?? "group-1";
  const pageId = options.pageId ?? "page-1";
  const key = `${pageId.length}:${pageId}${id.length}:${id}`;
  doc.getMap<boolean>("layer-groups").set(key, true);
  const group = doc.getMap<unknown>(`layer-group:${encodeURIComponent(key)}`);
  group.set("id", id);
  group.set("pageId", pageId);
  group.set("payloadVersion", 1);
  group.set("deleted", false);
  group.set("prop:name", options.name ?? "선화");
  group.set("unset:name", false);
  return group;
}

function createStrokeDocument(): Y.Doc {
  const doc = new Y.Doc();
  const stroke = new Y.Map<unknown>();
  stroke.set("id", "stroke-1");
  stroke.set("pageId", "page-1");
  stroke.set("layerId", "page-root");
  stroke.set("status", "finalized");
  stroke.set("deleted", false);
  stroke.set("payloadVersion", 1);
  stroke.set("type", "draw");
  stroke.set("mode", "pen");
  stroke.set("kind", "freehand");
  stroke.set("stroke", "#111111");
  stroke.set("strokeWidth", 8);
  for (const key of [
    "points", "pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures",
  ]) stroke.set(key, new Y.Array<number>());
  doc.getMap<Y.Map<unknown>>("strokes").set("stroke-1", stroke);
  const order = new Y.Map<unknown>();
  order.set("strokeId", "stroke-1");
  order.set("pageId", "page-1");
  order.set("layerId", "page-root");
  order.set("active", true);
  doc.getArray<Y.Map<unknown>>("stroke-order").push([order]);
  return doc;
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

  it("accepts bounded scene/page/group field CRDT roots and their mixed z-order entries", () => {
    const doc = createScenePageDocument();
    const group = addLayerGroup(doc);
    group.set("prop:hidden", true);
    group.set("unset:locked", true);
    doc.getMap<string>("future-compatible-root").set("key", "unreserved roots stay compatible");

    expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
    doc.destroy();
  });

  it("accepts canonical flat deletion operations and rejects malformed or orphan acknowledgements", () => {
    const valid = createScenePageDocument();
    const validGroup = addLayerGroup(valid);
    addSceneDeletionProtocol(valid, true);
    valid.getMap("scene-element:scene-1").delete("deleted");
    valid.getMap("studio-page:page-1").delete("deleted");
    validGroup.delete("deleted");
    expect(hasValidStudioCrdtRootSchema(valid)).toBe(true);
    valid.destroy();

    const validStroke = createStrokeDocument();
    (validStroke.getMap("strokes").get("stroke-1") as Y.Map<unknown>).delete("deleted");
    expect(hasValidStudioCrdtRootSchema(validStroke)).toBe(true);
    validStroke.destroy();

    const invalidCases: Array<(doc: Y.Doc) => void> = [
      (doc) => doc.getMap<string>("studio-deletion-ops").set("not-a-uuid", DELETION_TARGET),
      (doc) => doc.getMap<string>("studio-deletion-ops").set(
        DELETION_OPERATION_ID,
        '[ "scene", "scene-1" ]'
      ),
      (doc) => doc.getMap<string>("studio-deletion-ops").set(
        DELETION_OPERATION_ID,
        JSON.stringify(["scene", "missing-scene"])
      ),
      (doc) => doc.getMap<string>("studio-deletion-acks").set(
        DELETION_OPERATION_ID,
        DELETION_TARGET
      ),
      (doc) => {
        addSceneDeletionProtocol(doc);
        doc.getMap<string>("studio-deletion-acks").set(
          DELETION_OPERATION_ID,
          JSON.stringify(["page", "page-1"])
        );
      },
      (doc) => doc.getMap<unknown>("studio-deletion-ops").set(
        DELETION_OPERATION_ID,
        new Y.Map<unknown>()
      ),
    ];
    for (const mutate of invalidCases) {
      const invalid = createScenePageDocument();
      mutate(invalid);
      expect(hasValidStudioCrdtRootSchema(invalid)).toBe(false);
      invalid.destroy();
    }
  });

  it.each(["operation", "acknowledgement"] as const)(
    "rejects removal of an existing grow-only deletion %s before durable storage",
    async (kind) => {
      const repository = new MemoryStudioCrdtRepository();
      const current = service(repository);
      const base = createScenePageDocument();
      addSceneDeletionProtocol(base, kind === "acknowledgement");
      const baseUpdate = Y.encodeStateAsUpdate(base);
      await current.applyUpdate({
        workId: `work-grow-only-${kind}`,
        updateId: kind === "operation"
          ? "00000000-0000-4000-8000-000000000302"
          : "00000000-0000-4000-8000-000000000303",
        actorUserId: "editor",
        data: fromUint8Array(baseUpdate),
      });

      const attacker = new Y.Doc();
      Y.applyUpdate(attacker, baseUpdate);
      const stateVector = Y.encodeStateVector(attacker);
      attacker.getMap(
        kind === "operation" ? "studio-deletion-ops" : "studio-deletion-acks"
      ).delete(DELETION_OPERATION_ID);
      const rewrite = Y.encodeStateAsUpdate(attacker, stateVector);
      expect(hasValidStudioCrdtRootSchema(attacker)).toBe(true);

      await expect(current.applyUpdate({
        workId: `work-grow-only-${kind}`,
        updateId: kind === "operation"
          ? "00000000-0000-4000-8000-000000000304"
          : "00000000-0000-4000-8000-000000000305",
        actorUserId: "editor",
        data: fromUint8Array(rewrite),
      })).rejects.toBeInstanceOf(StudioCrdtInvalidPayloadError);
      expect(repository.updates.get(`work-grow-only-${kind}`)).toHaveLength(1);
      expect(repository.receipts.size).toBe(1);
      base.destroy();
      attacker.destroy();
    }
  );

  it("classifies a persisted deletion-history rewrite as storage corruption during hydration", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const base = createScenePageDocument();
    addSceneDeletionProtocol(base);
    const baseUpdate = Y.encodeStateAsUpdate(base);
    const attacker = new Y.Doc();
    Y.applyUpdate(attacker, baseUpdate);
    const stateVector = Y.encodeStateVector(attacker);
    attacker.getMap("studio-deletion-ops").delete(DELETION_OPERATION_ID);
    const rewrite = Y.encodeStateAsUpdate(attacker, stateVector);
    repository.updates.set("work-corrupt-delete-history", [
      {
        workId: "work-corrupt-delete-history",
        sequence: 1n,
        updateId: "00000000-0000-4000-8000-000000000306",
        actorUserId: "editor",
        payload: baseUpdate,
        createdAt: new Date("2026-07-16T00:00:00.000Z"),
      },
      {
        workId: "work-corrupt-delete-history",
        sequence: 2n,
        updateId: "00000000-0000-4000-8000-000000000307",
        actorUserId: "editor",
        payload: rewrite,
        createdAt: new Date("2026-07-16T00:00:01.000Z"),
      },
    ]);

    await expect(service(repository).sync("work-corrupt-delete-history")).rejects.toBeInstanceOf(
      StudioCrdtStorageCorruptionError
    );
    base.destroy();
    attacker.destroy();
  });

  it("keeps the cached document unchanged when catch-up contains a deletion-history rewrite", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const current = service(repository);
    const base = createScenePageDocument();
    addSceneDeletionProtocol(base);
    const baseUpdate = Y.encodeStateAsUpdate(base);
    await current.applyUpdate({
      workId: "work-atomic-hydration",
      updateId: "00000000-0000-4000-8000-000000000308",
      actorUserId: "editor",
      data: fromUint8Array(baseUpdate),
    });

    const attacker = new Y.Doc();
    Y.applyUpdate(attacker, baseUpdate);
    const stateVector = Y.encodeStateVector(attacker);
    attacker.getMap("studio-deletion-ops").delete(DELETION_OPERATION_ID);
    const rows = repository.updates.get("work-atomic-hydration")!;
    rows.push({
      workId: "work-atomic-hydration",
      sequence: 2n,
      updateId: "00000000-0000-4000-8000-000000000309",
      actorUserId: "attacker",
      payload: Y.encodeStateAsUpdate(attacker, stateVector),
      createdAt: new Date("2026-07-16T00:00:01.000Z"),
    });

    await expect(current.sync("work-atomic-hydration")).rejects.toBeInstanceOf(
      StudioCrdtStorageCorruptionError
    );
    rows.pop();
    const hydrated = new Y.Doc();
    applySync(hydrated, await current.sync("work-atomic-hydration"));
    expect(hydrated.getMap("studio-deletion-ops").get(DELETION_OPERATION_ID)).toBe(
      DELETION_TARGET
    );
    base.destroy();
    attacker.destroy();
    hydrated.destroy();
  });

  it("validates reserved layer-group roots without synchronizing local collapse state", () => {
    const valid = createScenePageDocument();
    const validGroup = addLayerGroup(valid, { id: "group/slash", name: "배경 후보" });
    validGroup.set("base:hidden", false);
    validGroup.set("prop:hidden", true);
    validGroup.set("prop:locked", false);
    addLayerGroup(valid, { id: "group/slash", pageId: "page-copy", name: "복제 페이지" });
    expect(hasValidStudioCrdtRootSchema(valid)).toBe(true);
    valid.destroy();

    const orphan = createScenePageDocument();
    orphan.getMap<unknown>("layer-group:6%3Aorphan").set("id", "orphan");
    expect(hasValidStudioCrdtRootSchema(orphan)).toBe(false);
    orphan.destroy();

    const nonCanonical = createScenePageDocument();
    nonCanonical.getMap<boolean>("layer-groups").set("06:page-111:group/slash", true);
    const wrongName = nonCanonical.getMap<unknown>("layer-group:06%3Apage-111%3Agroup%2Fslash");
    wrongName.set("id", "group/slash");
    expect(hasValidStudioCrdtRootSchema(nonCanonical)).toBe(false);
    nonCanonical.destroy();

    const invalidCases: Array<(group: Y.Map<unknown>) => void> = [
      (group) => group.set("pageId", ""),
      (group) => group.set("payloadVersion", 2),
      (group) => group.set("deleted", "no"),
      (group) => group.set("prop:name", ""),
      (group) => group.set("prop:name", "선화\n폴더"),
      (group) => group.set("prop:name", "가".repeat(513)),
      (group) => group.set("prop:hidden", "yes"),
      (group) => group.set("prop:locked", 1),
      (group) => {
        group.set("base:hidden", { garbage: "x".repeat(3_000) });
        group.set("prop:hidden", false);
      },
      (group) => group.set("unset:name", true),
      (group) => group.set("name", "raw keys are not part of the wire contract"),
      (group) => group.set("prop:collapsed", true),
      (group) => group.set("prop:payload", "x".repeat(2_048)),
    ];
    for (const mutate of invalidCases) {
      const invalid = createScenePageDocument();
      mutate(addLayerGroup(invalid));
      expect(hasValidStudioCrdtRootSchema(invalid)).toBe(false);
      invalid.destroy();
    }

    const reserved = createScenePageDocument();
    addLayerGroup(reserved, { id: "page-root" });
    expect(hasValidStudioCrdtRootSchema(reserved)).toBe(false);
    reserved.destroy();

    const mismatchedIdentity = createScenePageDocument();
    addLayerGroup(mismatchedIdentity).set("pageId", "other-page");
    expect(hasValidStudioCrdtRootSchema(mismatchedIdentity)).toBe(false);
    mismatchedIdentity.destroy();
  });

  it("materializes valid remote top-level scene/page Yjs types before durable validation", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const current = service(repository);
    const source = createScenePageDocument();

    await expect(current.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000104",
      actorUserId: "editor",
      data: fromUint8Array(Y.encodeStateAsUpdate(source)),
    })).resolves.toMatchObject({ duplicate: false });

    const hydrated = new Y.Doc();
    applySync(hydrated, await current.sync("work-1"));
    expect(hasValidStudioCrdtRootSchema(hydrated)).toBe(true);
    expect(hydrated.getMap<unknown>("scene-element:scene-1").get("prop:text"))
      .toBe("동시에 편집하는 대사");
    hydrated.destroy();
    source.destroy();
  });

  it("materializes valid remote stroke roots instead of misclassifying them as abstract types", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const current = service(repository);
    const source = createStrokeDocument();

    await expect(current.applyUpdate({
      workId: "work-1",
      updateId: "00000000-0000-4000-8000-000000000105",
      actorUserId: "editor",
      data: fromUint8Array(Y.encodeStateAsUpdate(source)),
    })).resolves.toMatchObject({ duplicate: false });

    const hydrated = new Y.Doc();
    applySync(hydrated, await current.sync("work-1"));
    expect(hasValidStudioCrdtRootSchema(hydrated)).toBe(true);
    expect(hydrated.getMap<Y.Map<unknown>>("strokes").get("stroke-1")?.get("status"))
      .toBe("finalized");
    hydrated.destroy();
    source.destroy();
  });

  it("rejects stroke metadata and pointer samples the browser cannot decode", () => {
    const invalidPressure = createStrokeDocument();
    const pressureStroke = invalidPressure.getMap<Y.Map<unknown>>("strokes").get("stroke-1")!;
    (pressureStroke.get("points") as Y.Array<number>).push([10, 20]);
    (pressureStroke.get("pressures") as Y.Array<number>).push([2]);
    for (const key of ["tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures"]) {
      (pressureStroke.get(key) as Y.Array<number>).push([0]);
    }
    expect(hasValidStudioCrdtRootSchema(invalidPressure)).toBe(false);
    invalidPressure.destroy();

    const unknownMetadata = createStrokeDocument();
    unknownMetadata.getMap<Y.Map<unknown>>("strokes").get("stroke-1")!
      .set("unboundedPluginPayload", new Y.Map());
    expect(hasValidStudioCrdtRootSchema(unknownMetadata)).toBe(false);
    unknownMetadata.destroy();

    const invalidStyle = createStrokeDocument();
    invalidStyle.getMap<Y.Map<unknown>>("strokes").get("stroke-1")!
      .set("opacity", 1.5);
    expect(hasValidStudioCrdtRootSchema(invalidStyle)).toBe(false);
    invalidStyle.destroy();
  });

  it("rejects orphaned, non-canonical, or incorrectly typed reserved dynamic roots", () => {
    const orphan = createScenePageDocument();
    orphan.getMap<unknown>("scene-element:orphan").set("id", "orphan");
    expect(hasValidStudioCrdtRootSchema(orphan)).toBe(false);
    orphan.destroy();

    const nonCanonical = createScenePageDocument();
    nonCanonical.getMap<boolean>("scene-elements").set("scene/slash", true);
    const wrongName = nonCanonical.getMap<unknown>("scene-element:scene/slash");
    wrongName.set("id", "scene/slash");
    expect(hasValidStudioCrdtRootSchema(nonCanonical)).toBe(false);
    nonCanonical.destroy();

    const wrongTrackerValue = createScenePageDocument();
    wrongTrackerValue.getMap<unknown>("studio-pages").set("page-1", false);
    expect(hasValidStudioCrdtRootSchema(wrongTrackerValue)).toBe(false);
    wrongTrackerValue.destroy();

    const wrongDynamicType = new Y.Doc();
    wrongDynamicType.getMap<boolean>("scene-elements").set("scene-1", true);
    wrongDynamicType.getArray("scene-element:scene-1");
    expect(hasValidStudioCrdtRootSchema(wrongDynamicType)).toBe(false);
    wrongDynamicType.destroy();
  });

  it("rejects illegal scene fields, nested Yjs values, oversize payloads, and ambiguous order ids", () => {
    const illegalProperty = createScenePageDocument();
    illegalProperty.getMap<unknown>("scene-element:scene-1").set("prop:src", "data:image/png;base64,AA");
    expect(hasValidStudioCrdtRootSchema(illegalProperty)).toBe(false);
    illegalProperty.destroy();

    const nestedYjs = createScenePageDocument();
    nestedYjs.getMap<unknown>("scene-element:scene-1").set("prop:gradient", new Y.Map());
    expect(hasValidStudioCrdtRootSchema(nestedYjs)).toBe(false);
    nestedYjs.destroy();

    const oversized = createScenePageDocument();
    oversized.getMap<unknown>("scene-element:scene-1").set("prop:text", "가".repeat(20_000));
    expect(hasValidStudioCrdtRootSchema(oversized)).toBe(false);
    oversized.destroy();

    const ambiguousOrder = createScenePageDocument();
    const entry = ambiguousOrder.getArray<Y.Map<unknown>>("stroke-order").get(0);
    entry.set("strokeId", "stroke-1");
    expect(hasValidStudioCrdtRootSchema(ambiguousOrder)).toBe(false);
    ambiguousOrder.destroy();
  });

  it("enforces the same typed scene-property contract as the browser", () => {
    const invalidCases: Array<[property: string, value: unknown]> = [
      ["hidden", "yes"],
      ["align", "diagonal"],
      ["lineHeight", "wide"],
    ];
    for (const [property, value] of invalidCases) {
      const invalid = createScenePageDocument();
      invalid.getMap<unknown>("scene-element:scene-1").set(`prop:${property}`, value);
      expect(hasValidStudioCrdtRootSchema(invalid)).toBe(false);
      invalid.destroy();
    }

    const invalidFramePoints = createScenePageDocument();
    const frame = invalidFramePoints.getMap<unknown>("scene-element:scene-1");
    frame.set("type", "frame");
    for (const key of ["text", "fontSize", "fill", "rotation"]) frame.delete(`prop:${key}`);
    frame.set("prop:height", 300);
    frame.set("prop:points", [0, 0, 100, 0, 100, 100]);
    expect(hasValidStudioCrdtRootSchema(invalidFramePoints)).toBe(false);
    invalidFramePoints.destroy();

    const invalidLineCount = createScenePageDocument();
    const focus = invalidLineCount.getMap<unknown>("scene-element:scene-1");
    focus.set("type", "focusLines");
    for (const key of ["text", "fontSize", "fill"]) focus.delete(`prop:${key}`);
    focus.set("prop:height", 300);
    focus.set("prop:lineCount", 1.5);
    focus.set("prop:innerRadius", 10);
    focus.set("prop:outerRadius", 100);
    focus.set("prop:stroke", "#111111");
    focus.set("prop:strokeWidth", 2);
    focus.set("prop:noise", 0);
    expect(hasValidStudioCrdtRootSchema(invalidLineCount)).toBe(false);
    invalidLineCount.destroy();

    const aggregateEntryOverflow = createScenePageDocument();
    const text = aggregateEntryOverflow.getMap<unknown>("scene-element:scene-1");
    text.set("prop:gradient", Array<number>(2_100).fill(0));
    text.set("prop:textPath", Array<number>(2_100).fill(0));
    expect(hasValidStudioCrdtRootSchema(aggregateEntryOverflow)).toBe(false);
    aggregateEntryOverflow.destroy();
  });

  it("accepts topology-only asset references and rejects payload smuggling or reserved types", () => {
    for (const elementType of ["image", "vrm", "background3d", "toString"]) {
      const valid = createReferenceTopologyDocument(elementType);
      expect(hasValidStudioCrdtRootSchema(valid)).toBe(true);
      valid.destroy();
    }

    for (const elementType of ["draw", "text", "reference", "bad\u0007type", "x".repeat(161)]) {
      const invalid = createReferenceTopologyDocument(elementType);
      expect(hasValidStudioCrdtRootSchema(invalid)).toBe(false);
      invalid.destroy();
    }

    const smuggledRaster = createReferenceTopologyDocument();
    smuggledRaster.getMap<unknown>("scene-element:scene-1")
      .set("prop:src", "data:image/png;base64,AA==");
    expect(hasValidStudioCrdtRootSchema(smuggledRaster)).toBe(false);
    smuggledRaster.destroy();

    const wrongValue = createReferenceTopologyDocument();
    wrongValue.getMap<unknown>("scene-element:scene-1").set("prop:elementType", 3);
    expect(hasValidStudioCrdtRootSchema(wrongValue)).toBe(false);
    wrongValue.destroy();

    const hiddenBaseline = createReferenceTopologyDocument();
    hiddenBaseline.getMap<unknown>("scene-element:scene-1")
      .set("base:elementType", "x".repeat(1_000));
    expect(hasValidStudioCrdtRootSchema(hiddenBaseline)).toBe(false);
    hiddenBaseline.destroy();

    const prototypeType = createReferenceTopologyDocument();
    prototypeType.getMap<unknown>("scene-element:scene-1").set("type", "toString");
    expect(() => hasValidStudioCrdtRootSchema(prototypeType)).not.toThrow();
    expect(hasValidStudioCrdtRootSchema(prototypeType)).toBe(false);
    prototypeType.destroy();
  });

  it("rejects order entries whose target or page/layer coordinates do not match the record", () => {
    const mismatchedLayer = createScenePageDocument();
    mismatchedLayer.getArray<Y.Map<unknown>>("stroke-order").get(0).set("layerId", "other-layer");
    expect(hasValidStudioCrdtRootSchema(mismatchedLayer)).toBe(false);
    mismatchedLayer.destroy();

    const missingPage = createScenePageDocument();
    missingPage.getArray<Y.Map<unknown>>("page-order").get(0).set("pageId", "missing-page");
    expect(hasValidStudioCrdtRootSchema(missingPage)).toBe(false);
    missingPage.destroy();

    const activeFlood = createScenePageDocument();
    const order = activeFlood.getArray<Y.Map<unknown>>("stroke-order");
    for (let index = 1; index <= 256; index += 1) {
      const entry = new Y.Map<unknown>();
      entry.set("elementId", "scene-1");
      entry.set("pageId", "page-1");
      entry.set("layerId", "layer-1");
      entry.set("kind", "scene");
      entry.set("active", true);
      order.push([entry]);
    }
    expect(hasValidStudioCrdtRootSchema(activeFlood)).toBe(false);
    activeFlood.destroy();
  });

  it("accepts reparent history while requiring the active order entry to match", async () => {
    const strokeDoc = createStrokeDocument();
    const stroke = strokeDoc.getMap<Y.Map<unknown>>("strokes").get("stroke-1")!;
    stroke.set("pageId", "page-2");
    stroke.set("layerId", "layer-2");
    strokeDoc.getArray<Y.Map<unknown>>("stroke-order").get(0).set("active", false);
    const movedStrokeOrder = new Y.Map<unknown>();
    movedStrokeOrder.set("strokeId", "stroke-1");
    movedStrokeOrder.set("pageId", "page-2");
    movedStrokeOrder.set("layerId", "layer-2");
    movedStrokeOrder.set("active", true);
    strokeDoc.getArray<Y.Map<unknown>>("stroke-order").push([movedStrokeOrder]);
    expect(hasValidStudioCrdtRootSchema(strokeDoc)).toBe(true);

    const sceneDoc = createScenePageDocument();
    const scene = sceneDoc.getMap<unknown>("scene-element:scene-1");
    scene.set("pageId", "page-2");
    scene.set("layerId", "layer-2");
    sceneDoc.getArray<Y.Map<unknown>>("stroke-order").get(0).set("active", false);
    const movedSceneOrder = new Y.Map<unknown>();
    movedSceneOrder.set("elementId", "scene-1");
    movedSceneOrder.set("pageId", "page-2");
    movedSceneOrder.set("layerId", "layer-2");
    movedSceneOrder.set("kind", "scene");
    movedSceneOrder.set("active", true);
    sceneDoc.getArray<Y.Map<unknown>>("stroke-order").push([movedSceneOrder]);
    expect(hasValidStudioCrdtRootSchema(sceneDoc)).toBe(true);

    const current = service(new MemoryStudioCrdtRepository());
    await expect(current.applyUpdate({
      workId: "work-reparent-stroke",
      updateId: "00000000-0000-4000-8000-000000000106",
      actorUserId: "editor",
      data: fromUint8Array(Y.encodeStateAsUpdate(strokeDoc)),
    })).resolves.toMatchObject({ duplicate: false });
    await expect(current.applyUpdate({
      workId: "work-reparent-scene",
      updateId: "00000000-0000-4000-8000-000000000107",
      actorUserId: "editor",
      data: fromUint8Array(Y.encodeStateAsUpdate(sceneDoc)),
    })).resolves.toMatchObject({ duplicate: false });

    strokeDoc.destroy();
    sceneDoc.destroy();
  });

  it("accepts converged concurrent draw and scene reparents with losing active entries", async () => {
    const fork = (source: Y.Doc): Y.Doc => {
      const target = new Y.Doc();
      Y.applyUpdate(target, Y.encodeStateAsUpdate(source));
      return target;
    };
    const reparentStroke = (doc: Y.Doc, pageId: string, layerId: string) => {
      const record = doc.getMap<Y.Map<unknown>>("strokes").get("stroke-1")!;
      record.set("pageId", pageId);
      record.set("layerId", layerId);
      doc.getArray<Y.Map<unknown>>("stroke-order").get(0).set("active", false);
      const entry = new Y.Map<unknown>();
      entry.set("strokeId", "stroke-1");
      entry.set("pageId", pageId);
      entry.set("layerId", layerId);
      entry.set("active", true);
      doc.getArray<Y.Map<unknown>>("stroke-order").push([entry]);
    };
    const reparentScene = (doc: Y.Doc, pageId: string, layerId: string) => {
      const record = doc.getMap<unknown>("scene-element:scene-1");
      record.set("pageId", pageId);
      record.set("layerId", layerId);
      doc.getArray<Y.Map<unknown>>("stroke-order").get(0).set("active", false);
      const entry = new Y.Map<unknown>();
      entry.set("elementId", "scene-1");
      entry.set("pageId", pageId);
      entry.set("layerId", layerId);
      entry.set("kind", "scene");
      entry.set("active", true);
      doc.getArray<Y.Map<unknown>>("stroke-order").push([entry]);
    };
    const converge = (
      base: Y.Doc,
      mutate: (doc: Y.Doc, pageId: string, layerId: string) => void
    ) => {
      const left = fork(base);
      const right = fork(base);
      mutate(left, "page-left", "layer-left");
      mutate(right, "page-right", "layer-right");
      const baseVector = Y.encodeStateVector(base);
      const leftUpdate = Y.encodeStateAsUpdate(left, baseVector);
      const rightUpdate = Y.encodeStateAsUpdate(right, baseVector);
      const merged = fork(base);
      Y.applyUpdate(merged, leftUpdate);
      Y.applyUpdate(merged, rightUpdate);
      return { left, right, merged, leftUpdate, rightUpdate };
    };

    const strokeBase = createStrokeDocument();
    const strokeForks = converge(strokeBase, reparentStroke);
    expect(hasValidStudioCrdtRootSchema(strokeForks.merged)).toBe(true);
    expect(strokeForks.merged.getArray<Y.Map<unknown>>("stroke-order").toArray()
      .filter((entry) => entry.get("active") === true)).toHaveLength(2);

    const sceneBase = createScenePageDocument();
    const sceneForks = converge(sceneBase, reparentScene);
    expect(hasValidStudioCrdtRootSchema(sceneForks.merged)).toBe(true);
    expect(sceneForks.merged.getArray<Y.Map<unknown>>("stroke-order").toArray()
      .filter((entry) => entry.get("active") === true)).toHaveLength(2);

    const current = service(new MemoryStudioCrdtRepository());
    const applySequence = async (
      workId: string,
      base: Y.Doc,
      first: Uint8Array,
      second: Uint8Array,
      idOffset: number
    ) => {
      for (const [index, update] of [Y.encodeStateAsUpdate(base), first, second].entries()) {
        await current.applyUpdate({
          workId,
          updateId: `00000000-0000-4000-8000-${String(idOffset + index).padStart(12, "0")}`,
          actorUserId: index === 2 ? "editor-right" : "editor-left",
          data: fromUint8Array(update),
        });
      }
    };
    await expect(applySequence(
      "work-concurrent-stroke-reparent",
      strokeBase,
      strokeForks.leftUpdate,
      strokeForks.rightUpdate,
      108
    )).resolves.toBeUndefined();
    await expect(applySequence(
      "work-concurrent-scene-reparent",
      sceneBase,
      sceneForks.leftUpdate,
      sceneForks.rightUpdate,
      111
    )).resolves.toBeUndefined();

    for (const doc of [
      strokeBase,
      strokeForks.left,
      strokeForks.right,
      strokeForks.merged,
      sceneBase,
      sceneForks.left,
      sceneForks.right,
      sceneForks.merged,
    ]) doc.destroy();
  });

  it("rejects malformed scene/page updates before they reach durable storage", async () => {
    const repository = new MemoryStudioCrdtRepository();
    const current = service(repository);
    const malformed = createScenePageDocument();
    malformed.getMap<unknown>("studio-page:page-1").set("prop:canvasH", Number.NaN);

    await expect(
      current.applyUpdate({
        workId: "work-1",
        updateId: "00000000-0000-4000-8000-000000000103",
        actorUserId: "editor",
        data: fromUint8Array(Y.encodeStateAsUpdate(malformed)),
      })
    ).rejects.toBeInstanceOf(StudioCrdtInvalidPayloadError);
    expect(repository.updates.get("work-1") ?? []).toEqual([]);
    expect(repository.receipts.size).toBe(0);
    malformed.destroy();
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

  it("atomically rejects a concurrently-valid append whose durable merge violates schema", async () => {
    const repository = new MemoryStudioCrdtRepository();
    repository.beforeAppend = twoPartyBarrier();
    const first = service(repository);
    const second = service(repository);
    const left = createSceneOrderFloodDocument(130);
    const right = createSceneOrderFloodDocument(130);
    const leftUpdate = Y.encodeStateAsUpdate(left);
    const rightUpdate = Y.encodeStateAsUpdate(right);
    const merged = new Y.Doc();
    Y.applyUpdate(merged, leftUpdate);
    Y.applyUpdate(merged, rightUpdate);

    expect(hasValidStudioCrdtRootSchema(left)).toBe(true);
    expect(hasValidStudioCrdtRootSchema(right)).toBe(true);
    expect(leftUpdate.byteLength).toBeLessThanOrEqual(STUDIO_CRDT_UPDATE_MAX_BYTES);
    expect(rightUpdate.byteLength).toBeLessThanOrEqual(STUDIO_CRDT_UPDATE_MAX_BYTES);
    expect(hasValidStudioCrdtRootSchema(merged)).toBe(false);

    const results = await Promise.allSettled([
      first.applyUpdate({
        workId: "work-atomic-merge",
        updateId: "00000000-0000-4000-8000-000000000201",
        actorUserId: "editor-left",
        data: fromUint8Array(leftUpdate),
      }),
      second.applyUpdate({
        workId: "work-atomic-merge",
        updateId: "00000000-0000-4000-8000-000000000202",
        actorUserId: "editor-right",
        data: fromUint8Array(rightUpdate),
      }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(StudioCrdtInvalidPayloadError);
    }
    expect(repository.updates.get("work-atomic-merge")).toHaveLength(1);
    expect(repository.receipts.size).toBe(1);

    const durable = new Y.Doc();
    applySync(durable, await first.sync("work-atomic-merge"));
    expect(hasValidStudioCrdtRootSchema(durable)).toBe(true);
    expect(durable.getArray("stroke-order")).toHaveLength(130);

    left.destroy();
    right.destroy();
    merged.destroy();
    durable.destroy();
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
