import { describe, expect, it } from "vitest";

import { CommandBus } from "../command/bus";
import { MemoryJournalStore } from "../command/journal-store";
import { entryCrc, recoverProject } from "../command/recovery";
import { CommandApplyError, applyProjectCommand } from "../command/reducer";
import { comicPageIRSchema, panelsInReadingOrder } from "../ir/comic";
import { commandIRSchema, isComicPartialCommand } from "../ir/journal";
import { polylineToPath } from "../ir/path";
import { transformPathIR, translateMat2d } from "../ir/path-transform";
import { projectDigest } from "../ir/project-state";
import { createEmptyScene, findNode } from "../ir/scene";
import { FaultInjectingJournalStore } from "../testing/fault-injection";

import type { ComicBalloonIR, ComicPageIR } from "../ir/comic";
import type { CommandIR } from "../ir/journal";
import type { SceneNodeIR } from "../ir/scene";

/**
 * V12 §14.1 만화 제작 Transaction — comic partial-edit commands (v2).
 *
 * The v1 surface replaces whole pages (`comic/set-page`); v2 adds partial
 * edits as new discriminants only. These tests pin: per-command round trips
 * through the journal, validation refusal without seq consumption, the
 * refuse-with-reason orphan policy for panel removal, digest-pinned replay
 * equivalence, byte-frozen v1/v2 fixtures and fault-injection behaviour.
 */

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

function textNode(id: string): SceneNodeIR {
  return {
    id,
    kind: "text",
    x: 120,
    y: 140,
    text: "대사",
    fontSizePx: 16,
    color: { r: 0, g: 0, b: 0, a: 1 },
    fontFamily: "sans-serif",
    opacity: 1,
    blend: "src-over",
  };
}

function balloon(
  id: string,
  panelId: string,
  readingOrder: number,
  overrides: Partial<ComicBalloonIR> = {},
): ComicBalloonIR {
  return {
    id,
    panelId,
    shape: rect(100, 100, 200, 120),
    tail: null,
    textNodeId: null,
    characterId: null,
    readingOrder,
    ...overrides,
  };
}

/**
 * Three panels; cut-1 carries two balloons (b-1 with a tail), cut-2 carries a
 * balloon, a tone and an effect line, cut-3 is dependency-free (removable).
 */
function richPage(id = "page-1"): ComicPageIR {
  return comicPageIRSchema.parse({
    id,
    widthPx: 1600,
    heightPx: 2400,
    panels: [
      { id: "cut-1", shape: rect(50, 50, 700, 900), folderId: "folder-1", readingOrder: 0 },
      { id: "cut-2", shape: rect(850, 50, 700, 900), folderId: "folder-2", readingOrder: 1 },
      { id: "cut-3", shape: rect(50, 1000, 1500, 900), folderId: "folder-3", readingOrder: 2 },
    ],
    balloons: [
      balloon("b-1", "cut-1", 0, { tail: rect(180, 220, 30, 60) }),
      balloon("b-2", "cut-1", 1, { shape: rect(400, 100, 200, 120) }),
      balloon("b-3", "cut-2", 0, { shape: rect(900, 100, 200, 120) }),
    ],
    tones: [
      { id: "tone-1", panelId: "cut-2", region: rect(860, 60, 300, 300), lpi: 60, angleDeg: 45, density: 0.4 },
    ],
    effectLines: [
      { id: "fx-1", panelId: "cut-2", kind: "speed", center: [1200, 500], strokeCount: 48, seed: 7 },
    ],
  });
}

async function openWithComic(): Promise<{ bus: CommandBus; store: MemoryJournalStore }> {
  const store = new MemoryJournalStore();
  const { bus } = await CommandBus.open(store);
  await bus.dispatch({ type: "scene/init", scene: createEmptyScene(1600, 2400) });
  await bus.dispatch({ type: "scene/add-node", node: textNode("dialog-1") });
  await bus.dispatch({ type: "comic/set-page", page: richPage() });
  return { bus, store };
}

function digestOf(bus: CommandBus): string {
  const project = bus.getProject();
  if (project === null) throw new Error("expected project state");
  return projectDigest(project);
}

function pageOf(bus: CommandBus, pageId = "page-1"): ComicPageIR {
  const page = bus.getProject()?.comic?.pages.find((entry) => entry.id === pageId);
  if (page === undefined) throw new Error(`expected page ${pageId}`);
  return page;
}

/** Replays the journal on a fresh bus and returns the recovered digest. */
async function replayDigest(store: MemoryJournalStore): Promise<string> {
  const { bus, recovery } = await CommandBus.open(store);
  expect(recovery.issues).toEqual([]);
  return digestOf(bus);
}

describe("comic partial edits — round trips", () => {
  it("move-balloon translates shape and tail by (x, y) and replays identically", async () => {
    const { bus, store } = await openWithComic();
    const before = pageOf(bus).balloons[0];
    if (before === undefined || before.tail === null) throw new Error("expected b-1 with tail");
    await bus.dispatch({ type: "comic/move-balloon", pageId: "page-1", balloonId: "b-1", x: 12, y: -8 });
    const after = pageOf(bus).balloons[0];
    if (after === undefined) throw new Error("expected moved balloon");
    const move = translateMat2d(12, -8);
    expect(after.shape).toEqual(transformPathIR(before.shape, move));
    expect(after.tail).toEqual(transformPathIR(before.tail, move));
    // Non-geometry fields and siblings stay untouched.
    expect(after.readingOrder).toBe(before.readingOrder);
    expect(pageOf(bus).balloons[1]).toEqual(richPage().balloons[1]);
    expect(await replayDigest(store)).toBe(digestOf(bus));
  });

  it("set-balloon-text-node links and unlinks a scene text node", async () => {
    const { bus, store } = await openWithComic();
    await bus.dispatch({
      type: "comic/set-balloon-text-node",
      pageId: "page-1",
      balloonId: "b-1",
      textNodeId: "dialog-1",
    });
    expect(pageOf(bus).balloons[0]?.textNodeId).toBe("dialog-1");
    await bus.dispatch({
      type: "comic/set-balloon-text-node",
      pageId: "page-1",
      balloonId: "b-1",
      textNodeId: null,
    });
    expect(pageOf(bus).balloons[0]?.textNodeId).toBeNull();
    expect(await replayDigest(store)).toBe(digestOf(bus));
  });

  it("move-panel replaces only the panel shape", async () => {
    const { bus, store } = await openWithComic();
    const shape = rect(60, 60, 650, 850);
    await bus.dispatch({ type: "comic/move-panel", pageId: "page-1", panelId: "cut-1", shape });
    const panel = pageOf(bus).panels[0];
    expect(panel?.shape).toEqual(shape);
    expect(panel?.folderId).toBe("folder-1");
    expect(panel?.masksContent).toBe(true);
    expect(panel?.readingOrder).toBe(0);
    expect(await replayDigest(store)).toBe(digestOf(bus));
  });

  it("reorder-panels permutes reading order while keeping storage order stable", async () => {
    const { bus, store } = await openWithComic();
    await bus.dispatch({
      type: "comic/reorder-panels",
      pageId: "page-1",
      readingOrder: ["cut-3", "cut-1", "cut-2"],
    });
    const page = pageOf(bus);
    expect(page.panels.map((panel) => panel.id)).toEqual(["cut-1", "cut-2", "cut-3"]);
    expect(panelsInReadingOrder(page).map((panel) => panel.id)).toEqual([
      "cut-3",
      "cut-1",
      "cut-2",
    ]);
    expect(await replayDigest(store)).toBe(digestOf(bus));
  });

  it("add-panel appends at the end of the reading order", async () => {
    const { bus, store } = await openWithComic();
    await bus.dispatch({
      type: "comic/add-panel",
      pageId: "page-1",
      panel: {
        id: "cut-4",
        shape: rect(50, 2000, 1500, 350),
        folderId: "folder-4",
        masksContent: true,
        readingOrder: 3,
      },
    });
    const page = pageOf(bus);
    expect(page.panels.map((panel) => panel.id)).toEqual(["cut-1", "cut-2", "cut-3", "cut-4"]);
    expect(panelsInReadingOrder(page).at(-1)?.id).toBe("cut-4");
    expect(await replayDigest(store)).toBe(digestOf(bus));
  });

  it("remove-panel drops a dependency-free panel and compacts reading order", async () => {
    const { bus, store } = await openWithComic();
    // cut-3 (readingOrder 2) has no balloons/tones/effect lines.
    await bus.dispatch({ type: "comic/remove-panel", pageId: "page-1", panelId: "cut-3" });
    const page = pageOf(bus);
    expect(page.panels.map((panel) => panel.id)).toEqual(["cut-1", "cut-2"]);
    expect(page.panels.map((panel) => panel.readingOrder)).toEqual([0, 1]);
    expect(await replayDigest(store)).toBe(digestOf(bus));

    // Removing a middle panel compacts the orders above it.
    await bus.dispatch({ type: "comic/remove-balloon", pageId: "page-1", balloonId: "b-1" });
    await bus.dispatch({ type: "comic/remove-balloon", pageId: "page-1", balloonId: "b-2" });
    await bus.dispatch({ type: "comic/remove-panel", pageId: "page-1", panelId: "cut-1" });
    expect(pageOf(bus).panels.map((panel) => [panel.id, panel.readingOrder])).toEqual([
      ["cut-2", 0],
    ]);
  });

  it("add-balloon appends into a panel's balloon reading order", async () => {
    const { bus, store } = await openWithComic();
    await bus.dispatch({
      type: "comic/add-balloon",
      pageId: "page-1",
      balloon: balloon("b-4", "cut-2", 1, { textNodeId: "dialog-1" }),
    });
    const page = pageOf(bus);
    expect(page.balloons.map((entry) => entry.id)).toEqual(["b-1", "b-2", "b-3", "b-4"]);
    expect(page.balloons[3]?.textNodeId).toBe("dialog-1");
    expect(await replayDigest(store)).toBe(digestOf(bus));
  });

  it("remove-balloon compacts sibling order and never touches the scene text node", async () => {
    const { bus, store } = await openWithComic();
    await bus.dispatch({
      type: "comic/set-balloon-text-node",
      pageId: "page-1",
      balloonId: "b-1",
      textNodeId: "dialog-1",
    });
    await bus.dispatch({ type: "comic/remove-balloon", pageId: "page-1", balloonId: "b-1" });
    const page = pageOf(bus);
    expect(page.balloons.map((entry) => [entry.id, entry.readingOrder])).toEqual([
      ["b-2", 0], // compacted from 1 within cut-1
      ["b-3", 0], // other panel untouched
    ]);
    // No silent loss: dropping scene content must be an explicit scene command.
    const scene = bus.getScene();
    if (scene === null) throw new Error("expected scene");
    expect(findNode(scene, "dialog-1")).not.toBeNull();
    expect(await replayDigest(store)).toBe(digestOf(bus));
  });
});

describe("comic partial edits — validation refusal (no seq consumed)", () => {
  it("rejects unknown page, panel and balloon targets without consuming a seq", async () => {
    const { bus, store } = await openWithComic();
    await expect(
      bus.dispatch({ type: "comic/move-balloon", pageId: "ghost-page", balloonId: "b-1", x: 1, y: 1 }),
    ).rejects.toThrow(/unknown page ghost-page/);
    await expect(
      bus.dispatch({ type: "comic/move-panel", pageId: "page-1", panelId: "ghost-cut", shape: rect(0, 0, 1, 1) }),
    ).rejects.toThrow(/unknown panel ghost-cut/);
    await expect(
      bus.dispatch({ type: "comic/remove-balloon", pageId: "page-1", balloonId: "ghost-b" }),
    ).rejects.toThrow(/unknown balloon ghost-b/);
    expect(bus.getSeq()).toBe(3);
    expect((await store.readEntries()).length).toBe(3);
  });

  it("rejects a non-finite move-balloon translation", async () => {
    const withComic = applyProjectCommand(
      applyProjectCommand(null, { type: "scene/init", scene: createEmptyScene(64, 64) }),
      { type: "comic/set-page", page: richPage() },
    );
    expect(() =>
      applyProjectCommand(withComic, {
        type: "comic/move-balloon",
        pageId: "page-1",
        balloonId: "b-1",
        x: Number.POSITIVE_INFINITY,
        y: 0,
      }),
    ).toThrow(/finite/);
  });

  it("rejects text-node links to unknown or non-text scene nodes", async () => {
    const { bus } = await openWithComic();
    await expect(
      bus.dispatch({
        type: "comic/set-balloon-text-node",
        pageId: "page-1",
        balloonId: "b-1",
        textNodeId: "ghost-node",
      }),
    ).rejects.toThrow(/unknown scene node ghost-node/);
    // A balloon may only link to a text node, not to arbitrary scene content.
    await bus.dispatch({
      type: "scene/add-node",
      node: {
        id: "fill-1",
        kind: "fill-path",
        path: rect(0, 0, 8, 8),
        paint: { kind: "solid", color: { r: 1, g: 0, b: 0, a: 1 } },
        fillRule: "nonzero",
        opacity: 1,
        blend: "src-over",
      },
    });
    await expect(
      bus.dispatch({
        type: "comic/set-balloon-text-node",
        pageId: "page-1",
        balloonId: "b-1",
        textNodeId: "fill-1",
      }),
    ).rejects.toThrow(/kind fill-path, expected text/);
    await expect(
      bus.dispatch({
        type: "comic/add-balloon",
        pageId: "page-1",
        balloon: balloon("b-9", "cut-2", 1, { textNodeId: "ghost-node" }),
      }),
    ).rejects.toThrow(/unknown scene node ghost-node/);
  });

  it("rejects reorder-panels lists that are not exact permutations", async () => {
    const { bus } = await openWithComic();
    await expect(
      bus.dispatch({ type: "comic/reorder-panels", pageId: "page-1", readingOrder: ["cut-1", "cut-2"] }),
    ).rejects.toThrow(/permutation/);
    await expect(
      bus.dispatch({
        type: "comic/reorder-panels",
        pageId: "page-1",
        readingOrder: ["cut-1", "cut-2", "ghost-cut"],
      }),
    ).rejects.toThrow(/permutation/);
    await expect(
      bus.dispatch({
        type: "comic/reorder-panels",
        pageId: "page-1",
        readingOrder: ["cut-1", "cut-1", "cut-2"],
      }),
    ).rejects.toThrow(/permutation/);
  });

  it("rejects add-panel with a duplicate id or a reading-order gap", async () => {
    const { bus } = await openWithComic();
    await expect(
      bus.dispatch({
        type: "comic/add-panel",
        pageId: "page-1",
        panel: { id: "cut-1", shape: rect(0, 0, 10, 10), folderId: "f", masksContent: true, readingOrder: 3 },
      }),
    ).rejects.toThrow(/duplicate panel id/);
    await expect(
      bus.dispatch({
        type: "comic/add-panel",
        pageId: "page-1",
        panel: { id: "cut-9", shape: rect(0, 0, 10, 10), folderId: "f", masksContent: true, readingOrder: 5 },
      }),
    ).rejects.toThrow(/contiguous/);
  });

  it("rejects add-balloon with an unknown panel or duplicate balloon id", async () => {
    const { bus } = await openWithComic();
    await expect(
      bus.dispatch({
        type: "comic/add-balloon",
        pageId: "page-1",
        balloon: balloon("b-9", "ghost-cut", 0),
      }),
    ).rejects.toThrow(/unknown panel ghost-cut/);
    await expect(
      bus.dispatch({
        type: "comic/add-balloon",
        pageId: "page-1",
        balloon: balloon("b-1", "cut-2", 1),
      }),
    ).rejects.toThrow(/duplicate balloon id b-1/);
  });

  it("rejects partial edits while the comic layer is empty", async () => {
    const store = new MemoryJournalStore();
    const { bus } = await CommandBus.open(store);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(64, 64) });
    await expect(
      bus.dispatch({ type: "comic/move-balloon", pageId: "page-1", balloonId: "b-1", x: 1, y: 1 }),
    ).rejects.toThrow(/comic layer is empty/);
    expect(bus.getSeq()).toBe(1);
  });

  it("leaves the project state byte-identical after a rejected command", async () => {
    const { bus } = await openWithComic();
    const before = digestOf(bus);
    await expect(
      bus.dispatch({ type: "comic/remove-panel", pageId: "page-1", panelId: "cut-1" }),
    ).rejects.toBeInstanceOf(CommandApplyError);
    expect(digestOf(bus)).toBe(before);
  });
});

describe("orphan policy — comic/remove-panel refuses with reasons (V12 §14.1)", () => {
  // §14.1 specifies the transaction chain (Panel → Balloon Scope → Tone/Effect
  // Scope) but no cascade for panel removal, so the reducer refuses removal
  // while dependents reference the panel and names every orphan-to-be.
  it("refuses removal while balloons reference the panel, listing them", async () => {
    const { bus, store } = await openWithComic();
    await expect(
      bus.dispatch({ type: "comic/remove-panel", pageId: "page-1", panelId: "cut-1" }),
    ).rejects.toThrow(/refused: panel cut-1 is still referenced by balloon b-1, balloon b-2/);
    expect(bus.getSeq()).toBe(3);
    expect((await store.readEntries()).length).toBe(3);
    expect(pageOf(bus).panels.map((panel) => panel.id)).toEqual(["cut-1", "cut-2", "cut-3"]);
  });

  it("refuses removal while tones or effect lines reference the panel", async () => {
    const { bus } = await openWithComic();
    await bus.dispatch({ type: "comic/remove-balloon", pageId: "page-1", balloonId: "b-3" });
    await expect(
      bus.dispatch({ type: "comic/remove-panel", pageId: "page-1", panelId: "cut-2" }),
    ).rejects.toThrow(/still referenced by tone tone-1, effect line fx-1/);
  });
});

describe("journal replay equivalence — digest pinning", () => {
  it("a partial-edit sequence and set-page of its final page value converge", async () => {
    // Edit path: partial commands mutate page-1 step by step.
    const { bus: edited } = await openWithComic();
    await edited.dispatch({ type: "comic/move-balloon", pageId: "page-1", balloonId: "b-1", x: 30, y: 40 });
    await edited.dispatch({
      type: "comic/set-balloon-text-node",
      pageId: "page-1",
      balloonId: "b-1",
      textNodeId: "dialog-1",
    });
    await edited.dispatch({
      type: "comic/reorder-panels",
      pageId: "page-1",
      readingOrder: ["cut-2", "cut-1", "cut-3"],
    });

    // Wholesale path: one set-page carrying the edited page's final value.
    // Equivalence holds because partial edits preserve storage order
    // deterministically; the digests pin both journals' semantics.
    const { bus: wholesale } = await openWithComic();
    await wholesale.dispatch({ type: "comic/set-page", page: pageOf(edited) });
    expect(digestOf(wholesale)).toBe(digestOf(edited));
  });
});

describe("backward compatibility — frozen fixtures still parse and verify", () => {
  // Byte-exact v1 journal lines from the scene-only build (same literals the
  // recovery suite freezes). The extended command union must parse them with
  // unchanged CRCs — a v1 journal never re-encodes differently.
  const LEGACY_V1_LINES: Array<{ line: string; crc: number }> = [
    {
      line: '{"seq":1,"tMs":16,"command":{"type":"scene/init","scene":{"version":11,"width":64,"height":64,"background":{"r":1,"g":1,"b":1,"a":1},"nodes":[]}},"crc":561749486}',
      crc: 561749486,
    },
    {
      line: '{"seq":2,"tMs":32,"command":{"type":"scene/add-node","node":{"id":"legacy-1","kind":"fill-path","path":{"verbs":[{"v":"M","x":0,"y":0},{"v":"L","x":16,"y":0},{"v":"L","x":16,"y":16},{"v":"Z"}]},"paint":{"kind":"solid","color":{"r":1,"g":0,"b":0,"a":1}},"fillRule":"nonzero","opacity":1,"blend":"src-over"}},"crc":793308550}',
      crc: 793308550,
    },
    {
      line: '{"seq":3,"tMs":48,"command":{"type":"scene/add-node","node":{"id":"legacy-2","kind":"fill-path","path":{"verbs":[{"v":"M","x":0,"y":0},{"v":"L","x":16,"y":0},{"v":"L","x":16,"y":16},{"v":"Z"}]},"paint":{"kind":"solid","color":{"r":1,"g":0,"b":0,"a":1}},"fillRule":"nonzero","opacity":1,"blend":"src-over"}},"crc":464885134}',
      crc: 464885134,
    },
  ];

  // Byte-exact v2 (graph-era) journal line: comic/set-page written before the
  // partial-edit commands existed. CRC precomputed by the frozen pipeline.
  const FROZEN_V2_SET_PAGE_LINE =
    '{"seq":4,"tMs":64,"command":{"type":"comic/set-page","page":{"id":"frozen-p1","widthPx":800,"heightPx":1200,"panels":[{"id":"cut-1","shape":{"verbs":[{"v":"M","x":0,"y":0},{"v":"L","x":100,"y":0},{"v":"L","x":100,"y":100},{"v":"Z"}]},"folderId":"folder-1","masksContent":true,"readingOrder":0}],"balloons":[],"tones":[],"effectLines":[]}},"crc":961265384}';
  const FROZEN_V2_SET_PAGE_CRC = 961265384;

  it("v1 scene-command lines parse under the extended union with frozen CRCs", () => {
    for (const { line, crc } of LEGACY_V1_LINES) {
      const raw = JSON.parse(line) as { seq: number; tMs: number; command: unknown; crc: number };
      const command = commandIRSchema.parse(raw.command);
      expect(isComicPartialCommand(command)).toBe(false);
      expect(entryCrc({ seq: raw.seq, tMs: raw.tMs, command })).toBe(crc);
      expect(raw.crc).toBe(crc);
    }
  });

  it("a frozen v2 comic/set-page line parses and re-verifies byte-for-byte", () => {
    const raw = JSON.parse(FROZEN_V2_SET_PAGE_LINE) as {
      seq: number;
      tMs: number;
      command: unknown;
      crc: number;
    };
    const command = commandIRSchema.parse(raw.command);
    if (command.type !== "comic/set-page") throw new Error("wrong discriminant");
    expect(command.page.panels[0]?.masksContent).toBe(true);
    expect(isComicPartialCommand(command)).toBe(false);
    expect(entryCrc({ seq: raw.seq, tMs: raw.tMs, command })).toBe(FROZEN_V2_SET_PAGE_CRC);
    expect(raw.crc).toBe(FROZEN_V2_SET_PAGE_CRC);
  });

  it("new discriminants parse through commandIRSchema (schema round trip)", () => {
    const commands: CommandIR[] = [
      { type: "comic/move-balloon", pageId: "p", balloonId: "b", x: 1.5, y: -2 },
      { type: "comic/set-balloon-text-node", pageId: "p", balloonId: "b", textNodeId: null },
      { type: "comic/move-panel", pageId: "p", panelId: "c", shape: rect(0, 0, 4, 4) },
      { type: "comic/reorder-panels", pageId: "p", readingOrder: ["c"] },
      {
        type: "comic/add-panel",
        pageId: "p",
        panel: { id: "c2", shape: rect(0, 0, 4, 4), folderId: "f", masksContent: true, readingOrder: 1 },
      },
      { type: "comic/remove-panel", pageId: "p", panelId: "c2" },
      { type: "comic/add-balloon", pageId: "p", balloon: balloon("b2", "c", 0) },
      { type: "comic/remove-balloon", pageId: "p", balloonId: "b2" },
    ];
    for (const command of commands) {
      expect(commandIRSchema.parse(command)).toEqual(command);
      expect(isComicPartialCommand(command)).toBe(true);
    }
  });
});

describe("fault injection — partial edits in the failure paths", () => {
  it("torn append of a partial edit truncates cleanly and a retry succeeds", async () => {
    const inner = new MemoryJournalStore();
    const faulty = new FaultInjectingJournalStore(inner, { tearAppendAtSeq: 3 });
    const { bus } = await CommandBus.open(faulty);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(64, 64) });
    await bus.dispatch({ type: "comic/set-page", page: richPage() });
    const preFault = digestOf(bus);
    await expect(
      bus.dispatch({ type: "comic/move-balloon", pageId: "page-1", balloonId: "b-1", x: 5, y: 5 }),
    ).rejects.toThrow(/torn append/);

    const recovered = await recoverProject(inner);
    expect(recovered.report.truncatedFromSeq).toBe(3);
    expect(recovered.seq).toBe(2);
    if (recovered.project === null) throw new Error("expected recovered project");
    expect(projectDigest(recovered.project)).toBe(preFault);

    // Transient fault: the same edit retried on a fresh bus succeeds.
    const { bus: reopened } = await CommandBus.open(faulty);
    await reopened.dispatch({ type: "comic/move-balloon", pageId: "page-1", balloonId: "b-1", x: 5, y: 5 });
    const moved = pageOf(reopened).balloons[0];
    const original = richPage().balloons[0];
    if (moved === undefined || original === undefined) throw new Error("expected balloons");
    expect(moved.shape).toEqual(transformPathIR(original.shape, translateMat2d(5, 5)));
  });
});
