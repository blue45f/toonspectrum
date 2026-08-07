import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CommandBus } from "../command/bus";
import { MemoryJournalStore } from "../command/journal-store";
import { recoverProject } from "../command/recovery";
import { solidPaint } from "../ir/color";
import { sceneDigest } from "../ir/digest";
import { polylineToPath } from "../ir/path";
import { createEmptyScene, listNodeIds } from "../ir/scene";
import { FileJournalStore } from "../node/file-journal-store";

import type { SceneNodeIR } from "../ir/scene";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function newTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "v11-journal-"));
  tempDirs.push(dir);
  return dir;
}

function fillNode(id: string): SceneNodeIR {
  return {
    id,
    kind: "fill-path",
    path: polylineToPath(
      [
        [0, 0],
        [16, 0],
        [16, 16],
      ],
      true,
    ),
    paint: solidPaint(1, 0, 0),
    fillRule: "nonzero",
    opacity: 1,
    blend: "src-over",
  };
}

describe("crash recovery — corrupt journal tail", () => {
  it("truncates from the first CRC-invalid entry and keeps the prefix", async () => {
    const store = new MemoryJournalStore();
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(64, 64) });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("keep-1") });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("keep-2") });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("lost-3") });

    // Simulate bit rot / torn write inside entry seq=4.
    store.corruptEntryAt(3, (entry) => {
      entry.command = { type: "scene/remove-node", id: "keep-1" };
    });

    const recovered = await recoverProject(store);
    expect(recovered.seq).toBe(3);
    expect(recovered.report.truncatedFromSeq).toBe(4);
    expect(recovered.report.droppedEntries).toBe(1);
    expect(recovered.scene).not.toBeNull();
    expect(listNodeIds(recovered.scene ?? createEmptyScene(1, 1))).toEqual([
      "keep-1",
      "keep-2",
    ]);
  });

  it("stops at a seq gap instead of replaying out-of-order history", async () => {
    const store = new MemoryJournalStore();
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(64, 64) });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("a") });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("b") });
    store.corruptEntryAt(1, (entry) => {
      entry.seq = 99; // now journal is 1, 99, 3 → only seq 1 is replayable
    });

    const recovered = await recoverProject(store);
    expect(recovered.seq).toBe(1);
    expect(recovered.report.truncatedFromSeq).not.toBeNull();
  });
});

describe("crash recovery — two-slot snapshots", () => {
  it("falls back to slot A when slot B is corrupt", async () => {
    const store = new MemoryJournalStore();
    const { bus } = await CommandBus.open(store, { snapshotEvery: 2 });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(64, 64) });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("n1") }); // snapshot A @2
    await bus.dispatch({ type: "scene/add-node", node: fillNode("n2") });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("n3") }); // snapshot B @4

    store.corruptSnapshot("B", (snapshot) => {
      snapshot.digest = "0000000000000000";
    });

    const recovered = await recoverProject(store);
    expect(recovered.report.snapshotSlotUsed).toBe("A");
    expect(recovered.report.snapshotSeq).toBe(2);
    // Replay continues past the snapshot to the full journal.
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

describe("FileJournalStore (Node)", () => {
  it("round-trips a session and recovers identically", async () => {
    const dir = await newTempDir();
    const store = await FileJournalStore.open(dir);
    const { bus } = await CommandBus.open(store, { snapshotEvery: 2 });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(32, 32) });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("disk-1") });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("disk-2") });
    const digest = sceneDigest(bus.getScene());

    const reopenedStore = await FileJournalStore.open(dir);
    const { bus: reopened, recovery } = await CommandBus.open(reopenedStore);
    expect(recovery.issues).toEqual([]);
    expect(sceneDigest(reopened.getScene())).toBe(digest);
  });

  it("drops a torn trailing JSONL line (crash mid-append)", async () => {
    const dir = await newTempDir();
    const store = await FileJournalStore.open(dir);
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(32, 32) });
    await bus.dispatch({ type: "scene/add-node", node: fillNode("safe") });

    const journalPath = join(dir, "journal.jsonl");
    const intact = await readFile(journalPath, "utf8");
    await writeFile(journalPath, `${intact}{"seq":3,"tMs":123,"comman`, "utf8");

    const { bus: reopened, recovery } = await CommandBus.open(
      await FileJournalStore.open(dir),
    );
    expect(reopened.getSeq()).toBe(2);
    expect(recovery.issues).toEqual([]);
    expect(listNodeIds(reopened.getScene() ?? createEmptyScene(1, 1))).toEqual(["safe"]);
  });
});
