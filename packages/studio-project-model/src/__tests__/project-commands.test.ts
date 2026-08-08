import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CommandBus } from "../command/bus";
import { MemoryJournalStore } from "../command/journal-store";
import { entryCrc, recoverProject, snapshotCrc } from "../command/recovery";
import { CommandApplyError, applyCommand, applyProjectCommand } from "../command/reducer";
import { animationGraphIRSchema } from "../ir/animation";
import { solidPaint } from "../ir/color";
import { comicPageIRSchema } from "../ir/comic";
import { sceneDigest } from "../ir/digest";
import { commandIRSchema, snapshotIRSchema } from "../ir/journal";
import { polylineToPath } from "../ir/path";
import { createProjectState, projectDigest } from "../ir/project-state";
import { createEmptyScene } from "../ir/scene";
import { FileJournalStore } from "../node/file-journal-store";
import { FaultInjectingJournalStore } from "../testing/fault-injection";

import type { AnimationGraphIR } from "../ir/animation";
import type { ComicPageIR } from "../ir/comic";
import type { EffectGraphIR } from "../ir/effect";
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

function rect(x: number, y: number, w: number, h: number) {
  return polylineToPath(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    true,
  );
}

function comicPage(id: string, panelPrefix = id): ComicPageIR {
  return comicPageIRSchema.parse({
    id,
    widthPx: 1600,
    heightPx: 2400,
    panels: [
      {
        id: `${panelPrefix}-cut-1`,
        shape: rect(50, 50, 700, 900),
        folderId: "folder-1",
        readingOrder: 0,
      },
      {
        id: `${panelPrefix}-cut-2`,
        shape: rect(850, 50, 700, 900),
        folderId: "folder-2",
        readingOrder: 1,
      },
    ],
    balloons: [
      {
        id: `${panelPrefix}-b-1`,
        panelId: `${panelPrefix}-cut-1`,
        shape: rect(100, 100, 200, 120),
        readingOrder: 0,
      },
    ],
  });
}

function animationGraph(): AnimationGraphIR {
  return animationGraphIRSchema.parse({
    version: 1,
    fps: 24,
    durationFrames: 48,
    levels: [
      {
        id: "level-a",
        name: "A",
        cels: [{ id: "cel-1", sceneNodeId: "s1", label: "key" }],
      },
    ],
    exposures: [{ frame: 0, levelId: "level-a", celId: "cel-1" }],
  });
}

function effectGraph(): EffectGraphIR {
  return {
    nodes: [
      {
        id: "blur",
        op: "core.gaussian-blur",
        params: { radius: 4 },
        inputs: ["source"],
        colorSpace: "linear",
      },
      { id: "grade", op: "core.levels", params: {}, inputs: ["blur"], colorSpace: "linear" },
    ],
    output: "grade",
  };
}

async function openWithScene(): Promise<{ bus: CommandBus; store: MemoryJournalStore }> {
  const store = new MemoryJournalStore();
  const { bus } = await CommandBus.open(store);
  await bus.dispatch({ type: "scene/init", scene: createEmptyScene(128, 128) });
  await bus.dispatch({ type: "scene/add-node", node: strokeNode("s1") });
  return { bus, store };
}

describe("project graph commands — round trip", () => {
  it("replays comic/animation/effects commands to an identical project digest", async () => {
    const { bus, store } = await openWithScene();
    await bus.dispatch({ type: "comic/set-page", page: comicPage("page-1") });
    await bus.dispatch({ type: "animation/set-graph", graph: animationGraph() });
    await bus.dispatch({ type: "effects/set-graph", graph: effectGraph() });
    const live = bus.getProject();
    expect(live).not.toBeNull();
    const liveDigest = projectDigest(live ?? createProjectState(createEmptyScene(1, 1)));

    const { bus: reopened, recovery } = await CommandBus.open(store);
    expect(recovery.issues).toEqual([]);
    const project = reopened.getProject();
    expect(project).not.toBeNull();
    if (project === null) throw new Error("expected recovered project");
    expect(projectDigest(project)).toBe(liveDigest);
    expect(project.comic?.pages.map((page) => page.id)).toEqual(["page-1"]);
    expect(project.animation?.levels[0]?.id).toBe("level-a");
    expect(project.effects?.output).toBe("grade");
    // Scene layer is untouched by graph commands.
    expect(sceneDigest(reopened.getScene())).toBe(sceneDigest(bus.getScene()));
  });

  it("yields the same project digest across independent stores (determinism)", async () => {
    const commands: CommandIR[] = [
      { type: "scene/init", scene: createEmptyScene(32, 32) },
      { type: "comic/set-page", page: comicPage("p") },
      { type: "animation/set-graph", graph: animationGraph() },
      { type: "effects/set-graph", graph: effectGraph() },
      { type: "animation/clear" },
    ];
    const digests: string[] = [];
    for (let run = 0; run < 2; run += 1) {
      const { bus } = await CommandBus.open(new MemoryJournalStore());
      for (const command of commands) await bus.dispatch(command);
      const project = bus.getProject();
      if (project === null) throw new Error("expected project");
      digests.push(projectDigest(project));
    }
    expect(digests[0]).toBe(digests[1]);
  });

  it("comic/set-page upserts: same page id replaces in place, new id appends", async () => {
    const { bus } = await openWithScene();
    await bus.dispatch({ type: "comic/set-page", page: comicPage("page-1") });
    await bus.dispatch({ type: "comic/set-page", page: comicPage("page-2") });
    const replacement = { ...comicPage("page-1"), widthPx: 800 };
    await bus.dispatch({ type: "comic/set-page", page: replacement });
    const comic = bus.getProject()?.comic;
    expect(comic?.pages.map((page) => page.id)).toEqual(["page-1", "page-2"]);
    expect(comic?.pages[0]?.widthPx).toBe(800);
  });

  it("clear commands empty their layer and are idempotent no-ops when empty", async () => {
    const { bus } = await openWithScene();
    await bus.dispatch({ type: "effects/set-graph", graph: effectGraph() });
    expect(bus.getProject()?.effects).not.toBeNull();
    await bus.dispatch({ type: "effects/clear" });
    expect(bus.getProject()?.effects).toBeNull();
    // Clearing an already-empty layer is journaled but harmless.
    await bus.dispatch({ type: "comic/clear" });
    expect(bus.getProject()?.comic).toBeNull();
    expect(bus.getSeq()).toBe(5);
  });

  it("scene/init preserves existing graph layers (no silent loss)", async () => {
    const { bus } = await openWithScene();
    await bus.dispatch({ type: "comic/set-page", page: comicPage("kept") });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(64, 64) });
    expect(bus.getProject()?.comic?.pages[0]?.id).toBe("kept");
    expect(bus.getScene()?.width).toBe(64);
  });
});

describe("project graph commands — validation gates", () => {
  it("rejects a comic page whose panel reading order is not contiguous", async () => {
    const { bus, store } = await openWithScene();
    const broken = comicPage("bad");
    const panel = broken.panels[1];
    if (!panel) throw new Error("expected panel");
    panel.readingOrder = 5;
    await expect(
      bus.dispatch({ type: "comic/set-page", page: broken }),
    ).rejects.toBeInstanceOf(CommandApplyError);
    // The failed command must not occupy a journal seq.
    expect((await store.readEntries()).length).toBe(2);
    expect(bus.getProject()?.comic).toBeNull();
  });

  it("rejects a comic balloon that references an unknown character", async () => {
    const { bus } = await openWithScene();
    const page = comicPage("chars");
    const balloon = page.balloons[0];
    if (!balloon) throw new Error("expected balloon");
    balloon.characterId = "ghost-character";
    await expect(
      bus.dispatch({ type: "comic/set-page", page }),
    ).rejects.toThrow(/unknown character/);
  });

  it("rejects an animation graph whose exposure references an unknown level", async () => {
    const { bus } = await openWithScene();
    const graph = animationGraph();
    graph.exposures.push({ frame: 1, levelId: "no-such-level", celId: null });
    await expect(
      bus.dispatch({ type: "animation/set-graph", graph }),
    ).rejects.toThrow(/unknown level/);
    expect(bus.getProject()?.animation).toBeNull();
  });

  it("rejects a cyclic effect graph", async () => {
    const { bus } = await openWithScene();
    const graph: EffectGraphIR = {
      nodes: [
        { id: "a", op: "x", params: {}, inputs: ["b"], colorSpace: "linear" },
        { id: "b", op: "x", params: {}, inputs: ["a"], colorSpace: "linear" },
      ],
      output: "a",
    };
    await expect(bus.dispatch({ type: "effects/set-graph", graph })).rejects.toThrow(
      /cycle/,
    );
  });

  it("rejects graph commands before scene/init", async () => {
    const { bus } = await CommandBus.open(new MemoryJournalStore());
    await expect(
      bus.dispatch({ type: "comic/set-page", page: comicPage("early") }),
    ).rejects.toThrow(/requires an initialized scene/);
    expect(bus.getSeq()).toBe(0);
  });

  it("legacy applyCommand refuses graph commands loudly", () => {
    const scene = createEmptyScene(8, 8);
    expect(() => applyCommand(scene, { type: "comic/clear" })).toThrow(
      /applyProjectCommand/,
    );
    // The project reducer accepts the same command.
    const state = applyProjectCommand(createProjectState(scene), {
      type: "comic/clear",
    });
    expect(state.comic).toBeNull();
  });
});

describe("journal + snapshot schema compatibility", () => {
  it("commandIRSchema parses graph commands and fills nested defaults", () => {
    const parsed = commandIRSchema.parse({
      type: "comic/set-page",
      page: {
        id: "p",
        widthPx: 100,
        heightPx: 100,
        panels: [],
        balloons: [],
      },
    });
    if (parsed.type !== "comic/set-page") throw new Error("wrong discriminant");
    expect(parsed.page.tones).toEqual([]);
    expect(parsed.page.effectLines).toEqual([]);
  });

  it("snapshotIRSchema accepts both v1 (scene-only) and v2 payloads", () => {
    const scene = createEmptyScene(8, 8);
    const v1 = snapshotIRSchema.parse({
      slot: "A",
      seq: 1,
      digest: sceneDigest(scene),
      scene,
      crc: 0,
    });
    expect(v1.version).toBeUndefined();
    expect(v1.comic).toBeUndefined();
    const state = createProjectState(scene);
    const v2 = snapshotIRSchema.parse({
      slot: "B",
      seq: 2,
      digest: sceneDigest(scene),
      scene,
      version: 2,
      projectDigest: projectDigest(state),
      comic: null,
      animation: null,
      effects: null,
      crc: 0,
    });
    expect(v2.version).toBe(2);
    expect(v2.comic).toBeNull();
  });

  it("snapshotCrc of a v1-shaped body is unchanged by the v2 fields' existence", () => {
    const scene = createEmptyScene(8, 8);
    const body = { slot: "A" as const, seq: 1, digest: sceneDigest(scene), scene };
    // Explicit undefined v2 fields must hash identically to their absence.
    expect(
      snapshotCrc({
        ...body,
        version: undefined,
        projectDigest: undefined,
        comic: undefined,
        animation: undefined,
        effects: undefined,
      }),
    ).toBe(snapshotCrc(body));
  });
});

describe("backward compatibility — files written by the scene-only build", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  async function newTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "v11-legacy-"));
    tempDirs.push(dir);
    return dir;
  }

  // Byte-exact artifacts produced by the pre-graph build (scene commands only,
  // v1 snapshot format). Regenerating them with current code would defeat the
  // point — these literals freeze the on-disk contract.
  const LEGACY_JOURNAL_JSONL =
    '{"seq":1,"tMs":16,"command":{"type":"scene/init","scene":{"version":11,"width":64,"height":64,"background":{"r":1,"g":1,"b":1,"a":1},"nodes":[]}},"crc":561749486}\n' +
    '{"seq":2,"tMs":32,"command":{"type":"scene/add-node","node":{"id":"legacy-1","kind":"fill-path","path":{"verbs":[{"v":"M","x":0,"y":0},{"v":"L","x":16,"y":0},{"v":"L","x":16,"y":16},{"v":"Z"}]},"paint":{"kind":"solid","color":{"r":1,"g":0,"b":0,"a":1}},"fillRule":"nonzero","opacity":1,"blend":"src-over"}},"crc":793308550}\n' +
    '{"seq":3,"tMs":48,"command":{"type":"scene/add-node","node":{"id":"legacy-2","kind":"fill-path","path":{"verbs":[{"v":"M","x":0,"y":0},{"v":"L","x":16,"y":0},{"v":"L","x":16,"y":16},{"v":"Z"}]},"paint":{"kind":"solid","color":{"r":1,"g":0,"b":0,"a":1}},"fillRule":"nonzero","opacity":1,"blend":"src-over"}},"crc":464885134}\n';
  const LEGACY_SNAPSHOT_A_JSON =
    '{"slot":"A","seq":2,"digest":"61bee71b817b74d8","scene":{"version":11,"width":64,"height":64,"background":{"r":1,"g":1,"b":1,"a":1},"nodes":[{"id":"legacy-1","kind":"fill-path","path":{"verbs":[{"v":"M","x":0,"y":0},{"v":"L","x":16,"y":0},{"v":"L","x":16,"y":16},{"v":"Z"}]},"paint":{"kind":"solid","color":{"r":1,"g":0,"b":0,"a":1}},"fillRule":"nonzero","opacity":1,"blend":"src-over"}]},"crc":2311641600}';
  const LEGACY_FINAL_SCENE_DIGEST = "3dd9a1ae96fe911e";

  async function writeLegacyProject(dir: string): Promise<void> {
    await writeFile(join(dir, "journal.jsonl"), LEGACY_JOURNAL_JSONL, "utf8");
    await writeFile(join(dir, "snapshot-a.json"), LEGACY_SNAPSHOT_A_JSON, "utf8");
  }

  it("opens a legacy journal-only project: null graphs, identical scene digest", async () => {
    const dir = await newTempDir();
    await writeFile(join(dir, "journal.jsonl"), LEGACY_JOURNAL_JSONL, "utf8");
    const { bus, recovery } = await CommandBus.open(await FileJournalStore.open(dir));
    expect(recovery.issues).toEqual([]);
    expect(bus.getSeq()).toBe(3);
    expect(sceneDigest(bus.getScene())).toBe(LEGACY_FINAL_SCENE_DIGEST);
    const project = bus.getProject();
    expect(project?.comic).toBeNull();
    expect(project?.animation).toBeNull();
    expect(project?.effects).toBeNull();
  });

  it("migrates a legacy v1 snapshot anchor (CRC + digest verify byte-for-byte)", async () => {
    const dir = await newTempDir();
    await writeLegacyProject(dir);
    const recovered = await recoverProject(await FileJournalStore.open(dir));
    expect(recovered.report.issues).toEqual([]);
    expect(recovered.report.snapshotSlotUsed).toBe("A");
    expect(recovered.report.snapshotSeq).toBe(2);
    expect(recovered.report.replayedEntries).toBe(1);
    expect(recovered.seq).toBe(3);
    expect(sceneDigest(recovered.scene)).toBe(LEGACY_FINAL_SCENE_DIGEST);
    expect(recovered.project?.comic).toBeNull();
    expect(recovered.project?.animation).toBeNull();
    expect(recovered.project?.effects).toBeNull();
  });

  it("freezes the legacy CRC contracts (entryCrc / snapshotCrc recompute)", () => {
    const firstLine = LEGACY_JOURNAL_JSONL.split("\n")[0] ?? "";
    const entry = JSON.parse(firstLine) as { seq: number; tMs: number; command: CommandIR; crc: number };
    expect(entryCrc({ seq: entry.seq, tMs: entry.tMs, command: entry.command })).toBe(
      561749486,
    );
    const snapshot = JSON.parse(LEGACY_SNAPSHOT_A_JSON) as Record<string, unknown> & {
      crc: number;
    };
    const { crc, ...body } = snapshot;
    expect(snapshotCrc(body as Parameters<typeof snapshotCrc>[0])).toBe(2311641600);
    expect(crc).toBe(2311641600);
  });

  it("upgrades in place: graph commands appended to a legacy project survive reopen", async () => {
    const dir = await newTempDir();
    await writeLegacyProject(dir);
    const { bus } = await CommandBus.open(await FileJournalStore.open(dir));
    await bus.dispatch({ type: "comic/set-page", page: comicPage("upgraded") });
    await bus.writeSnapshot(); // v2 snapshot next to the legacy v1 one

    const { bus: reopened, recovery } = await CommandBus.open(
      await FileJournalStore.open(dir),
    );
    expect(recovery.issues).toEqual([]);
    expect(recovery.snapshotSeq).toBe(4);
    expect(reopened.getProject()?.comic?.pages[0]?.id).toBe("upgraded");
    expect(sceneDigest(reopened.getScene())).toBe(LEGACY_FINAL_SCENE_DIGEST);
  });
});

describe("fault injection — graph commands in the failure paths", () => {
  it("torn append of a graph command truncates cleanly and a retry succeeds", async () => {
    const inner = new MemoryJournalStore();
    const faulty = new FaultInjectingJournalStore(inner, { tearAppendAtSeq: 3 });
    const { bus } = await CommandBus.open(faulty);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(64, 64) });
    await bus.dispatch({ type: "animation/set-graph", graph: animationGraph() });
    await expect(
      bus.dispatch({ type: "comic/set-page", page: comicPage("torn") }),
    ).rejects.toThrow(/torn append/);

    const recovered = await recoverProject(inner);
    expect(recovered.report.truncatedFromSeq).toBe(3);
    expect(recovered.seq).toBe(2);
    // The graph layer rolls back to the pre-fault state — kept animation, no comic.
    expect(recovered.project?.animation).not.toBeNull();
    expect(recovered.project?.comic).toBeNull();

    // Transient fault: the same command retried on a fresh bus succeeds.
    const { bus: reopened } = await CommandBus.open(faulty);
    await reopened.dispatch({ type: "comic/set-page", page: comicPage("torn") });
    expect(reopened.getProject()?.comic?.pages[0]?.id).toBe("torn");
  });

  it("falls back to the sibling snapshot slot and re-derives graphs from replay", async () => {
    const inner = new MemoryJournalStore();
    const faulty = new FaultInjectingJournalStore(inner, { corruptSnapshotSlot: "B" });
    const { bus } = await CommandBus.open(faulty, { snapshotEvery: 2 });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(64, 64) });
    await bus.dispatch({ type: "comic/set-page", page: comicPage("p1") }); // snapshot A @2
    await bus.dispatch({ type: "animation/set-graph", graph: animationGraph() });
    await bus.dispatch({ type: "effects/set-graph", graph: effectGraph() }); // snapshot B @4 (corrupt)
    const live = bus.getProject();
    if (live === null) throw new Error("expected live project");

    const recovered = await recoverProject(inner);
    expect(recovered.report.snapshotSlotUsed).toBe("A");
    expect(recovered.report.issues.some((issue) => issue.includes("slot B"))).toBe(true);
    expect(recovered.seq).toBe(4);
    expect(recovered.project).not.toBeNull();
    if (recovered.project === null) throw new Error("expected recovered project");
    expect(projectDigest(recovered.project)).toBe(projectDigest(live));
  });

  it("recovers graphs from a v2 snapshot anchor alone after compaction", async () => {
    const store = new MemoryJournalStore();
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(32, 32) });
    await bus.dispatch({ type: "comic/set-page", page: comicPage("anchored") });
    await bus.dispatch({ type: "effects/set-graph", graph: effectGraph() });
    await bus.writeSnapshot();
    await store.compactBefore(4); // journal now empty below the snapshot seq
    const live = bus.getProject();
    if (live === null) throw new Error("expected live project");

    const recovered = await recoverProject(store);
    expect(recovered.report.snapshotSeq).toBe(3);
    expect(recovered.report.replayedEntries).toBe(0);
    expect(recovered.project).not.toBeNull();
    if (recovered.project === null) throw new Error("expected recovered project");
    expect(projectDigest(recovered.project)).toBe(projectDigest(live));
    expect(recovered.project.comic?.pages[0]?.id).toBe("anchored");
  });

  it("invalidates a snapshot whose stored projectDigest was tampered with", async () => {
    const store = new MemoryJournalStore();
    const { bus } = await CommandBus.open(store, { snapshotEvery: 2 });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(16, 16) });
    await bus.dispatch({ type: "comic/set-page", page: comicPage("guarded") }); // snapshot A @2
    store.corruptSnapshot("A", (snapshot) => {
      snapshot.projectDigest = "0000000000000000";
    });

    const recovered = await recoverProject(store);
    // CRC covers projectDigest, so tampering trips the crc check first; either
    // way the slot must be rejected and replay must rebuild the same state.
    expect(recovered.report.snapshotSlotUsed).toBeNull();
    expect(recovered.report.issues.some((issue) => issue.includes("slot A"))).toBe(true);
    expect(recovered.seq).toBe(2);
    expect(recovered.project?.comic?.pages[0]?.id).toBe("guarded");
  });
});
