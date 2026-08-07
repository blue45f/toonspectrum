import {
  CommandBus,
  FaultInjectingJournalStore,
  InjectedStorageFault,
  MemoryJournalStore,
  createEmptyScene,
  listNodeIds,
  polylineToPath,
  recoverProject,
  sceneDigest,
  solidPaint,
} from "@toonspectrum/project-model-v11";
import { describe, expect, it } from "vitest";

import type { CommandIR, SceneNodeIR } from "@toonspectrum/project-model-v11";

/**
 * Phase 7 fault-injection slice (V11 §10.5): storage failures during append
 * and snapshot must never corrupt in-memory state, and recovery must salvage
 * exactly the durable prefix — no silent data invention, no total loss.
 */

function fillNode(id: string): SceneNodeIR {
  return {
    id,
    kind: "fill-path",
    path: polylineToPath(
      [
        [0, 0],
        [8, 0],
        [8, 8],
      ],
      true,
    ),
    paint: solidPaint(0, 0.4, 0.8),
    fillRule: "nonzero",
    opacity: 1,
    blend: "src-over",
  };
}

const addNode = (id: string): CommandIR => ({ type: "scene/add-node", node: fillNode(id) });

describe("journal fault injection — append", () => {
  it("append rejection leaves bus state and journal at the previous seq", async () => {
    const inner = new MemoryJournalStore();
    const store = new FaultInjectingJournalStore(inner, { rejectAppendAtSeq: 3 });
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(16, 16) });
    await bus.dispatch(addNode("a"));

    await expect(bus.dispatch(addNode("lost"))).rejects.toBeInstanceOf(
      InjectedStorageFault,
    );
    // In-memory state did not advance past the durable prefix.
    expect(bus.getSeq()).toBe(2);
    expect(listNodeIds(bus.getScene() ?? createEmptyScene(1, 1))).toEqual(["a"]);
    // A retry with the same command succeeds and takes the failed seq.
    const scene = await bus.dispatch(addNode("retried"));
    expect(listNodeIds(scene)).toEqual(["a", "retried"]);
    expect((await inner.readEntries()).map((entry) => entry.seq)).toEqual([1, 2, 3]);
    expect(store.faultsFired).toEqual(["append-reject@3"]);
  });

  it("torn append (corrupt bytes persisted) is truncated on recovery", async () => {
    const inner = new MemoryJournalStore();
    const store = new FaultInjectingJournalStore(inner, { tearAppendAtSeq: 3 });
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(16, 16) });
    await bus.dispatch(addNode("safe"));
    await expect(bus.dispatch(addNode("torn"))).rejects.toBeInstanceOf(
      InjectedStorageFault,
    );

    const recovered = await recoverProject(inner);
    expect(recovered.seq).toBe(2);
    expect(recovered.report.truncatedFromSeq).toBe(3);
    expect(recovered.report.droppedEntries).toBe(1);
    expect(listNodeIds(recovered.scene ?? createEmptyScene(1, 1))).toEqual(["safe"]);
  });
});

describe("journal fault injection — snapshots", () => {
  it("automatic snapshot failure does not fail the dispatch (journal is durable)", async () => {
    const inner = new MemoryJournalStore();
    const store = new FaultInjectingJournalStore(inner, { rejectSnapshotSlot: "A" });
    const { bus } = await CommandBus.open(store, { snapshotEvery: 2 });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(16, 16) });
    // seq 2 triggers the automatic slot-A snapshot, which is injected to fail.
    const scene = await bus.dispatch(addNode("kept"));
    expect(listNodeIds(scene)).toEqual(["kept"]);
    expect(bus.getLastSnapshotError()).toBeInstanceOf(InjectedStorageFault);
    expect(store.faultsFired).toEqual(["snapshot-reject@A"]);

    // Everything is recoverable from the journal alone.
    const { bus: reopened, recovery } = await CommandBus.open(inner);
    expect(recovery.snapshotSlotUsed).toBeNull();
    expect(sceneDigest(reopened.getScene())).toBe(sceneDigest(scene));
  });

  it("explicit snapshot calls still surface storage failures", async () => {
    const store = new FaultInjectingJournalStore(new MemoryJournalStore(), {
      rejectSnapshotSlot: "A",
    });
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(16, 16) });
    await expect(bus.writeSnapshot()).rejects.toBeInstanceOf(InjectedStorageFault);
  });

  it("a silently corrupted snapshot slot is rejected and the sibling slot wins", async () => {
    const inner = new MemoryJournalStore();
    const store = new FaultInjectingJournalStore(inner, { corruptSnapshotSlot: "B" });
    const { bus } = await CommandBus.open(store, { snapshotEvery: 2 });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(16, 16) });
    await bus.dispatch(addNode("n1")); // snapshot A @2 (clean)
    await bus.dispatch(addNode("n2"));
    await bus.dispatch(addNode("n3")); // snapshot B @4 (corrupted by injection)

    const recovered = await recoverProject(inner);
    expect(recovered.report.snapshotSlotUsed).toBe("A");
    expect(recovered.seq).toBe(4);
    expect(listNodeIds(recovered.scene ?? createEmptyScene(1, 1))).toEqual([
      "n1",
      "n2",
      "n3",
    ]);
    expect(
      recovered.report.issues.some((issue) => issue.includes("slot B")),
    ).toBe(true);
  });
});
