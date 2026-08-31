import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
  STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT,
  STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX,
  STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT,
  admitsStudioCrdtShared3dStageEvents,
  encodeStudioCrdtShared3dCompositeKey,
  hasValidStudioCrdtRootSchema,
  preservesStudioCrdtShared3dStageRoots,
  snapshotStudioCrdtShared3dStageRoots,
} from "./studio-crdt-root-schema";

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function pageDocument(pageId = "page-shared-3d"): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap<boolean>("studio-pages").set(pageId, true);
  const page = doc.getMap<unknown>(`studio-page:${encodeURIComponent(pageId)}`);
  page.set("id", pageId);
  page.set("payloadVersion", 1);
  page.set("deleted", false);
  page.set("prop:bg", "#ffffff");
  page.set("prop:bgGrad", null);
  page.set("prop:canvasH", 1_600);
  return doc;
}

function dynamicRootName(prefix: string, pageId: string, id: string): string {
  return `${prefix}${encodeURIComponent(encodeStudioCrdtShared3dCompositeKey(pageId, id))}`;
}

function stageEntry(input: {
  readonly stageId?: string;
  readonly bundleId?: string;
  readonly characterId?: string;
  readonly characterCount?: number;
} = {}) {
  const stageId = input.stageId ?? "stage-a";
  const bundleId = input.bundleId ?? "bundle-a";
  const characterId = input.characterId ?? "character-a";
  const characterCount = input.characterCount ?? 1;
  return {
    id: stageId,
    capturePolicy: "require-all-linked" as const,
    background: { bundleId, sourceHash: HASH_A },
    characters: Array.from({ length: characterCount }, (_, index) => {
      const elementId = characterCount === 1 ? characterId : `${characterId}-${index}`;
      return {
        elementId,
        modelRuntimeKey: `${elementId}:${HASH_B}`,
        sourceHash: HASH_B,
        placement: { position: [index % 10, 0, 0], rotationY: 0 },
      };
    }),
  };
}

function addStage(doc: Y.Doc, input: {
  readonly pageId?: string;
  readonly stageId?: string;
  readonly bundleId?: string;
  readonly order?: number;
  readonly payload?: string;
  readonly characterId?: string;
  readonly characterCount?: number;
  readonly events?: readonly string[];
} = {}): Y.Map<unknown> {
  const pageId = input.pageId ?? "page-shared-3d";
  const stageId = input.stageId ?? "stage-a";
  const key = encodeStudioCrdtShared3dCompositeKey(pageId, stageId);
  doc.getMap<boolean>(STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT).set(key, true);
  const record = doc.getMap<unknown>(dynamicRootName(
    STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
    pageId,
    stageId
  ));
  record.set("pageId", pageId);
  record.set("stageId", stageId);
  record.set("payloadVersion", 1);
  record.set("order", input.order ?? 0);
  record.set("payload", input.payload ?? JSON.stringify(stageEntry({
    stageId,
    bundleId: input.bundleId,
    characterId: input.characterId,
    characterCount: input.characterCount,
  })));
  for (const event of input.events ?? ["activate:0"]) record.set(event, true);
  return record;
}

function addReceipt(doc: Y.Doc, input: {
  readonly pageId?: string;
  readonly elementId?: string;
  readonly modelRuntimeKey?: string;
  readonly events?: readonly string[];
} = {}): Y.Map<unknown> {
  const pageId = input.pageId ?? "page-shared-3d";
  const elementId = input.elementId ?? "character-a";
  const key = encodeStudioCrdtShared3dCompositeKey(pageId, elementId);
  doc.getMap<boolean>(STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT).set(key, true);
  const record = doc.getMap<unknown>(dynamicRootName(
    STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX,
    pageId,
    elementId
  ));
  record.set("pageId", pageId);
  record.set("elementId", elementId);
  record.set("payloadVersion", 1);
  record.set("modelRuntimeKey", input.modelRuntimeKey ?? `${elementId}:${HASH_B}`);
  for (const event of input.events ?? ["activate:0"]) record.set(event, true);
  return record;
}

function cloneDocument(source: Y.Doc): Y.Doc {
  const clone = new Y.Doc();
  Y.applyUpdate(clone, Y.encodeStateAsUpdate(source));
  return clone;
}

describe("Studio CRDT shared 3D stage sidecar root boundary", () => {
  it("accepts canonical records, receipts and UTF-16 length-prefixed identities", () => {
    const pageId = "page-가🙂";
    const doc = pageDocument(pageId);
    addStage(doc, { pageId });
    addReceipt(doc, { pageId });
    expect(encodeStudioCrdtShared3dCompositeKey(pageId, "stage-a")).toBe(
      `${pageId.length}:${pageId}7:stage-a`
    );
    expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
  });

  it("keeps deactivate:0 as an authoritative initial unlink tombstone", () => {
    const doc = pageDocument();
    addStage(doc, { events: ["deactivate:0"] });
    addReceipt(doc, { events: ["deactivate:0"] });
    expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
  });

  it("rejects malformed payloads and fields even on inactive tombstones", () => {
    const cases: Array<[label: string, mutate: (record: Y.Map<unknown>) => void]> = [
      ["invalid JSON", (record) => record.set("payload", "{")],
      ["non-canonical JSON", (record) => record.set("payload", JSON.stringify(stageEntry(), null, 2))],
      ["stage identity mismatch", (record) => record.set(
        "payload",
        JSON.stringify(stageEntry({ stageId: "stage-b" }))
      )],
      ["unknown field", (record) => record.set("privateState", true)],
      ["invalid order", (record) => record.set("order", -1)],
    ];
    for (const [label, mutate] of cases) {
      const doc = pageDocument();
      const record = addStage(doc, { events: ["deactivate:0"] });
      mutate(record);
      expect(hasValidStudioCrdtRootSchema(doc), label).toBe(false);
    }
  });

  it("enforces canonical causal event shape, suffix and per-record count caps", () => {
    const invalidEventSets: Array<[string, readonly string[]]> = [
      ["missing predecessor unlink", ["activate:1"]],
      ["missing matching activation", ["deactivate:0", "deactivate:1"]],
      ["suffix above cap", ["activate:256"]],
      ["non-canonical suffix", ["activate:00"]],
      ["stage restore event", ["deactivate:0", "restore:0"]],
    ];
    for (const [label, events] of invalidEventSets) {
      const doc = pageDocument();
      addStage(doc, { events });
      expect(hasValidStudioCrdtRootSchema(doc), label).toBe(false);
    }
    const overCount = pageDocument();
    const events = Array.from({ length: 129 }, (_, generation) => [
      `activate:${generation}`,
      `deactivate:${generation}`,
    ]).flat();
    addStage(overCount, { events });
    expect(hasValidStudioCrdtRootSchema(overCount)).toBe(false);

    const cappedInactive = pageDocument();
    const cappedInactiveEvents = Array.from({ length: 128 }, (_, generation) => [
      `activate:${generation}`,
      `deactivate:${generation}`,
    ]).flat();
    addStage(cappedInactive, { events: cappedInactiveEvents });
    expect(hasValidStudioCrdtRootSchema(cappedInactive)).toBe(true);

    const cappedActive = pageDocument();
    const cappedActiveEvents = [
      "deactivate:0",
      ...Array.from({ length: 127 }, (_, offset) => {
        const generation = offset + 1;
        return [`activate:${generation}`, `deactivate:${generation}`];
      }).flat(),
      "activate:128",
    ];
    addStage(cappedActive, { events: cappedActiveEvents });
    expect(hasValidStudioCrdtRootSchema(cappedActive)).toBe(false);

    const falseEvent = pageDocument();
    addStage(falseEvent).set("activate:0", false);
    expect(hasValidStudioCrdtRootSchema(falseEvent)).toBe(false);
  });

  it("rejects receipt-only and malformed roots but keeps unmatched active receipts dormant", () => {
    const unmanaged = pageDocument();
    addReceipt(unmanaged, { events: ["deactivate:0"] });
    expect(hasValidStudioCrdtRootSchema(unmanaged)).toBe(false);

    const malformed = pageDocument();
    addStage(malformed, { events: ["deactivate:0"] });
    addReceipt(malformed, { events: ["deactivate:0"], modelRuntimeKey: "character-a:stale" });
    expect(hasValidStudioCrdtRootSchema(malformed)).toBe(false);

    const orphan = pageDocument();
    addStage(orphan);
    addReceipt(orphan, { modelRuntimeKey: `character-a:sha256:${"c".repeat(64)}` });
    expect(hasValidStudioCrdtRootSchema(orphan)).toBe(true);
  });

  it("rejects duplicate active background authorities but permits inactive history", () => {
    const duplicate = pageDocument();
    addStage(duplicate, { stageId: "stage-a", bundleId: "bundle-a", order: 0 });
    addStage(duplicate, { stageId: "stage-b", bundleId: "bundle-a", order: 1 });
    expect(hasValidStudioCrdtRootSchema(duplicate)).toBe(false);

    const historical = pageDocument();
    addStage(historical, { stageId: "stage-a", bundleId: "bundle-a", order: 0 });
    addStage(historical, {
      stageId: "stage-b",
      bundleId: "bundle-a",
      order: 1,
      events: ["deactivate:0"],
    });
    expect(hasValidStudioCrdtRootSchema(historical)).toBe(true);
  });

  it("rejects orphan pages, false indexes, orphan dynamic roots and wrong root types", () => {
    const orphanPage = pageDocument();
    addStage(orphanPage, { pageId: "missing-page" });
    expect(hasValidStudioCrdtRootSchema(orphanPage)).toBe(false);

    const falseIndex = pageDocument();
    addStage(falseIndex);
    falseIndex.getMap(STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT).set(
      encodeStudioCrdtShared3dCompositeKey("page-shared-3d", "stage-a"),
      false
    );
    expect(hasValidStudioCrdtRootSchema(falseIndex)).toBe(false);

    const orphanDynamic = pageDocument();
    orphanDynamic.getMap(dynamicRootName(
      STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
      "page-shared-3d",
      "stage-a"
    )).set("poison", true);
    expect(hasValidStudioCrdtRootSchema(orphanDynamic)).toBe(false);

    const wrongIndexType = pageDocument();
    wrongIndexType.getArray(STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT).push(["poison"]);
    expect(hasValidStudioCrdtRootSchema(wrongIndexType)).toBe(false);

    const wrongDynamicType = pageDocument();
    const key = encodeStudioCrdtShared3dCompositeKey("page-shared-3d", "stage-a");
    wrongDynamicType.getMap(STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT).set(key, true);
    wrongDynamicType.getArray(`${STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX}${
      encodeURIComponent(key)
    }`).push(["poison"]);
    expect(hasValidStudioCrdtRootSchema(wrongDynamicType)).toBe(false);
  });

  it("rejects a page aggregate above the canonical 1 MiB collection budget", () => {
    const doc = pageDocument();
    for (let index = 0; index < 360; index += 1) {
      addStage(doc, {
        stageId: `stage-${index}`,
        bundleId: `bundle-${index}`,
        characterId: `character-${index}`,
        characterCount: 12,
        order: index,
      });
    }
    expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
  });

  it("preserves grow-only indexes, dynamic identities and existing event keys", () => {
    const source = pageDocument();
    addStage(source);
    addReceipt(source);
    const snapshot = snapshotStudioCrdtShared3dStageRoots(source);

    const unlinked = cloneDocument(source);
    addStage(unlinked, { events: ["deactivate:0"] });
    addReceipt(unlinked, { events: ["deactivate:0"] });
    expect(hasValidStudioCrdtRootSchema(unlinked)).toBe(true);
    expect(preservesStudioCrdtShared3dStageRoots(snapshot, unlinked)).toBe(true);
    expect(admitsStudioCrdtShared3dStageEvents(snapshot, unlinked)).toBe(true);

    const deletedIndex = cloneDocument(source);
    deletedIndex.getMap(STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT).clear();
    expect(hasValidStudioCrdtRootSchema(deletedIndex)).toBe(false);
    expect(preservesStudioCrdtShared3dStageRoots(snapshot, deletedIndex)).toBe(false);

    const deletedEvent = cloneDocument(source);
    deletedEvent.getMap(dynamicRootName(
      STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
      "page-shared-3d",
      "stage-a"
    )).delete("activate:0");
    expect(preservesStudioCrdtShared3dStageRoots(snapshot, deletedEvent)).toBe(false);

    const rewrittenIdentity = cloneDocument(source);
    rewrittenIdentity.getMap(dynamicRootName(
      STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
      "page-shared-3d",
      "stage-a"
    )).set("stageId", "stage-b");
    expect(preservesStudioCrdtShared3dStageRoots(snapshot, rewrittenIdentity)).toBe(false);
  });

  it("admits complete fresh and existing causal suffixes but rejects structural gaps", () => {
    const initial = pageDocument();
    const initialSnapshot = snapshotStudioCrdtShared3dStageRoots(initial);
    const initialConnect = cloneDocument(initial);
    addStage(initialConnect, { events: ["activate:0"] });
    expect(admitsStudioCrdtShared3dStageEvents(initialSnapshot, initialConnect)).toBe(true);

    const freshAggregate = cloneDocument(initial);
    addStage(freshAggregate, { events: ["activate:0", "deactivate:0", "activate:1"] });
    expect(hasValidStudioCrdtRootSchema(freshAggregate)).toBe(true);
    expect(admitsStudioCrdtShared3dStageEvents(initialSnapshot, freshAggregate)).toBe(true);

    const gap = cloneDocument(initial);
    addStage(gap, { events: ["activate:9"] });
    expect(hasValidStudioCrdtRootSchema(gap)).toBe(false);
    expect(admitsStudioCrdtShared3dStageEvents(initialSnapshot, gap)).toBe(false);

    const tombstone = pageDocument();
    addStage(tombstone, { events: ["deactivate:0"] });
    const tombstoneSnapshot = snapshotStudioCrdtShared3dStageRoots(tombstone);
    const relink = cloneDocument(tombstone);
    addStage(relink, { events: ["activate:1"] });
    expect(hasValidStudioCrdtRootSchema(relink)).toBe(true);
    expect(admitsStudioCrdtShared3dStageEvents(tombstoneSnapshot, relink)).toBe(true);

    const relinkSnapshot = snapshotStudioCrdtShared3dStageRoots(relink);
    const unlink = cloneDocument(relink);
    addStage(unlink, { events: ["deactivate:1"] });
    expect(hasValidStudioCrdtRootSchema(unlink)).toBe(true);
    expect(admitsStudioCrdtShared3dStageEvents(relinkSnapshot, unlink)).toBe(true);

    const existingPrefixAggregate = cloneDocument(initialConnect);
    addStage(existingPrefixAggregate, {
      events: ["deactivate:0", "activate:1", "deactivate:1", "activate:2"],
    });
    const initialConnectSnapshot = snapshotStudioCrdtShared3dStageRoots(initialConnect);
    expect(hasValidStudioCrdtRootSchema(existingPrefixAggregate)).toBe(true);
    expect(
      admitsStudioCrdtShared3dStageEvents(initialConnectSnapshot, existingPrefixAggregate)
    ).toBe(true);
  });

  it("merges concurrent initial connect/unlink as deterministic unlink-wins history", () => {
    const base = pageDocument();
    const connect = cloneDocument(base);
    const unlink = cloneDocument(base);
    addStage(connect, { events: ["activate:0"] });
    addStage(unlink, { events: ["deactivate:0"] });
    const stateVector = Y.encodeStateVector(base);
    const connectUpdate = Y.encodeStateAsUpdate(connect, stateVector);
    const unlinkUpdate = Y.encodeStateAsUpdate(unlink, stateVector);

    const left = cloneDocument(base);
    Y.applyUpdate(left, connectUpdate);
    Y.applyUpdate(left, unlinkUpdate);
    const right = cloneDocument(base);
    Y.applyUpdate(right, unlinkUpdate);
    Y.applyUpdate(right, connectUpdate);

    const rootName = dynamicRootName(
      STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX,
      "page-shared-3d",
      "stage-a"
    );
    for (const merged of [left, right]) {
      expect(hasValidStudioCrdtRootSchema(merged)).toBe(true);
      expect(merged.getMap(rootName).get("activate:0")).toBe(true);
      expect(merged.getMap(rootName).get("deactivate:0")).toBe(true);
    }
  });

  it("keeps a concurrently added receipt dormant after Stage unlink in either merge order", () => {
    const base = pageDocument();
    addStage(base, { events: ["activate:0"] });
    const baseSnapshot = snapshotStudioCrdtShared3dStageRoots(base);
    const receiptAdder = cloneDocument(base);
    addReceipt(receiptAdder, { events: ["activate:0"] });
    const unlinker = cloneDocument(base);
    addStage(unlinker, { events: ["deactivate:0"] });
    const stateVector = Y.encodeStateVector(base);
    const receiptUpdate = Y.encodeStateAsUpdate(receiptAdder, stateVector);
    const unlinkUpdate = Y.encodeStateAsUpdate(unlinker, stateVector);

    const left = cloneDocument(base);
    Y.applyUpdate(left, receiptUpdate);
    Y.applyUpdate(left, unlinkUpdate);
    const right = cloneDocument(base);
    Y.applyUpdate(right, unlinkUpdate);
    Y.applyUpdate(right, receiptUpdate);
    for (const merged of [left, right]) {
      expect(hasValidStudioCrdtRootSchema(merged)).toBe(true);
      expect(admitsStudioCrdtShared3dStageEvents(baseSnapshot, merged)).toBe(true);
    }

    const relink = cloneDocument(left);
    addStage(relink, { events: ["activate:1"] });
    expect(hasValidStudioCrdtRootSchema(relink)).toBe(true);
  });
});
