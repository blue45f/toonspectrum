import { describe, expect, it } from "vitest";

import { CommandBus } from "../command/bus";
import { MemoryJournalStore } from "../command/journal-store";
import { CommandApplyError } from "../command/reducer";
import { solidPaint } from "../ir/color";
import { sceneDigest } from "../ir/digest";
import { polylineToPath } from "../ir/path";
import { createEmptyScene } from "../ir/scene";

import type { CommandIR } from "../ir/journal";
import type { SceneNodeIR } from "../ir/scene";

function strokeNode(id: string): SceneNodeIR {
  return {
    id,
    kind: "stroke-path",
    path: polylineToPath([
      [0, 0],
      [10, 10],
      [20, 5],
    ]),
    paint: solidPaint(0, 0, 0),
    strokeWidth: 4,
    cap: "round",
    join: "round",
    miterLimit: 4,
    opacity: 1,
    blend: "src-over",
  };
}

const fixedClock = (() => {
  let t = 0;
  return () => {
    t += 16;
    return t;
  };
});

async function scriptedBus(): Promise<{ bus: CommandBus; store: MemoryJournalStore }> {
  const store = new MemoryJournalStore();
  const { bus } = await CommandBus.open(store, { snapshotEvery: 3, now: fixedClock() });
  await bus.dispatch({ type: "scene/init", scene: createEmptyScene(128, 128) });
  await bus.dispatch({ type: "scene/add-node", node: strokeNode("s1") });
  await bus.dispatch({ type: "scene/add-node", node: strokeNode("s2") });
  await bus.dispatch({
    type: "scene/update-node",
    id: "s1",
    patch: { strokeWidth: 9 },
  });
  await bus.dispatch({ type: "scene/remove-node", id: "s2" });
  await bus.dispatch({
    type: "scene/set-background",
    color: { r: 0.9, g: 0.9, b: 0.9, a: 1 },
  });
  return { bus, store };
}

describe("CommandBus", () => {
  it("replays to an identical scene digest after reopen (determinism)", async () => {
    const { bus, store } = await scriptedBus();
    const liveDigest = sceneDigest(bus.getScene());

    const { bus: reopened, recovery } = await CommandBus.open(store);
    expect(recovery.issues).toEqual([]);
    expect(sceneDigest(reopened.getScene())).toBe(liveDigest);
    expect(reopened.getSeq()).toBe(bus.getSeq());
  });

  it("rejects invalid commands before anything reaches the journal", async () => {
    const store = new MemoryJournalStore();
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(8, 8) });
    await expect(
      bus.dispatch({ type: "scene/remove-node", id: "missing" }),
    ).rejects.toBeInstanceOf(CommandApplyError);
    // The failed command must not occupy a journal seq.
    expect((await store.readEntries()).length).toBe(1);
    expect(bus.getSeq()).toBe(1);
  });

  it("writes alternating A/B snapshots every snapshotEvery commands", async () => {
    const { store } = await scriptedBus();
    const snapshots = await store.readSnapshots();
    const slots = snapshots.map((snapshot) => snapshot.slot).sort();
    expect(slots).toEqual(["A", "B"]);
  });

  it("update-node patches nested group children", async () => {
    const store = new MemoryJournalStore();
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(8, 8) });
    const group: SceneNodeIR = {
      id: "g1",
      kind: "group",
      opacity: 1,
      blend: "src-over",
      clip: null,
      children: [strokeNode("inner")],
    };
    await bus.dispatch({ type: "scene/add-node", node: group });
    const scene = await bus.dispatch({
      type: "scene/update-node",
      id: "inner",
      patch: { opacity: 0.5 },
    });
    const parent = scene.nodes[0];
    if (parent?.kind !== "group") throw new Error("expected group node");
    expect(parent.children[0]?.opacity).toBe(0.5);
  });
});

describe("CommandIR ordering", () => {
  it("same command list yields same digest across independent stores", async () => {
    const commands: CommandIR[] = [
      { type: "scene/init", scene: createEmptyScene(32, 32) },
      { type: "scene/add-node", node: strokeNode("a") },
      { type: "scene/set-background", color: { r: 0.5, g: 0.5, b: 0.5, a: 1 } },
    ];
    const digests: string[] = [];
    for (let run = 0; run < 2; run += 1) {
      const { bus } = await CommandBus.open(new MemoryJournalStore());
      for (const command of commands) await bus.dispatch(command);
      digests.push(sceneDigest(bus.getScene()));
    }
    expect(digests[0]).toBe(digests[1]);
  });
});
