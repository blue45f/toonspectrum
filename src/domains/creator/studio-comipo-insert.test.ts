import { describe, expect, it } from "vitest";

import { assembleComipoPage } from "./studio-comipo-assembly";
import {
  collectStudioDecorRefs,
  frameDecorHasNoPairwiseOverlap,
} from "./studio-comipo-incremental";
import { postInsertFramesComposable, type StudioCanvasSnapshot } from "./studio-comipo-insert";
import {
  addDialogueBubbles,
  addSceneTemplate,
  studioCanvasSnapshotFromElements,
  type StudioElementLike,
} from "./studio-comipo-shipped";
import { materializePanelLayout, PANEL_LAYOUTS } from "./studio-panel-layouts";

import type { StudioDecorElement } from "./studio-comipo-incremental";

type TestElement = StudioElementLike & Record<string, unknown>;

let idSeq = 0;
function nextId() {
  idSeq += 1;
  return `el-${idSeq}`;
}

function assemblyToElements(layoutId: string): TestElement[] {
  const assembled = assembleComipoPage({ layoutId })!;
  const elements: TestElement[] = [];
  for (const seed of assembled.seeds) {
    const id = nextId();
    if (seed.type === "frame") {
      elements.push({
        id,
        type: "frame",
        x: seed.x,
        y: seed.y,
        width: seed.width,
        height: seed.height,
      });
    } else if (seed.type === "bubble") {
      elements.push({
        id,
        type: "bubble",
        variant: seed.variant,
        text: seed.text,
        x: seed.x,
        y: seed.y,
        width: seed.width,
        height: seed.height,
        fill: seed.fill,
        textFill: seed.textFill,
        rotation: seed.rotation,
      });
    }
  }
  return elements;
}

function assemblyToSnapshot(layoutId: string): StudioCanvasSnapshot {
  return studioCanvasSnapshotFromElements(assemblyToElements(layoutId));
}

describe("addSceneTemplate / addDialogueBubbles shipped UI path", () => {
  const talkLayout = PANEL_LAYOUTS.find((l) => l.id === "layout_talk_2_bubbles")!;
  const top = talkLayout.frames[0]!;

  it("addSceneTemplate: snapshot extraction + pickTarget + commit removes layout placeholder", () => {
    const elements = assemblyToElements(talkLayout.id);
    const layoutBubble = elements.find(
      (e) => e.type === "bubble" && e.text === "대사를 입력"
    )!;

    const result = addSceneTemplate(
      elements,
      {
        templateId: "confession",
        viewCenterX: top.x + top.width / 2,
        viewCenterY: top.y + top.height / 2,
      },
      nextId
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const snapshot = studioCanvasSnapshotFromElements(result.elements);
    expect(snapshot.decor.some((d) => d.id === layoutBubble.id)).toBe(false);
    expect(postInsertFramesComposable(snapshot.frames, snapshot.decor)).toBe(true);

    const topSeeds = collectStudioDecorRefs(top, snapshot.decor).map((r) => r.seed);
    expect(frameDecorHasNoPairwiseOverlap(top, topSeeds)).toBe(true);
  });

  it("addDialogueBubbles: after scene insert stays composable across frames", () => {
    let elements = assemblyToElements(talkLayout.id);
    const scene = addSceneTemplate(
      elements,
      {
        templateId: "confession",
        viewCenterX: top.x + top.width / 2,
        viewCenterY: top.y + top.height / 2,
      },
      nextId
    );
    expect(scene.ok).toBe(true);
    if (!scene.ok) return;
    elements = scene.elements;

    const dialogue = addDialogueBubbles(
      elements,
      "민수: 스튜디오에 오신 걸 환영해요!\n지영: 3D 캐릭터를 써 보세요.",
      nextId
    );
    expect(dialogue.ok).toBe(true);
    if (!dialogue.ok) return;

    const snapshot = studioCanvasSnapshotFromElements(dialogue.elements);
    expect(postInsertFramesComposable(snapshot.frames, snapshot.decor)).toBe(true);
  });

  it("addSceneTemplate: overcrowded frame returns ok:false (no commit)", () => {
    const elements: TestElement[] = [
      { id: "f1", type: "frame", x: top.x, y: top.y, width: top.width, height: top.height },
      {
        id: "big-1",
        type: "bubble",
        variant: "speech",
        text: "긴 대사 A",
        x: top.x + 40,
        y: top.y + 40,
        width: 280,
        height: 480,
        fill: "#fff",
        textFill: "#000",
        rotation: 0,
      },
    ];
    const beforeLen = elements.length;
    const result = addSceneTemplate(
      elements,
      {
        templateId: "confession",
        viewCenterX: top.x + top.width / 2,
        viewCenterY: top.y + top.height / 2,
        selectedFrame: top,
      },
      nextId
    );
    expect(result.ok).toBe(false);
    expect(elements).toHaveLength(beforeLen);
  });

  it("addSceneTemplate off-frame: pre-existing decor overlap blocks insert", () => {
    const originY = 80;
    const virtualFrame = { x: 24, y: originY, width: 720 - 48, height: 480 };
    const elements: TestElement[] = [
      {
        id: "blocker",
        type: "bubble",
        variant: "speech",
        text: "이미 차지",
        x: virtualFrame.x + 40,
        y: virtualFrame.y + 40,
        width: 400,
        height: 400,
        fill: "#fff",
        textFill: "#000",
        rotation: 0,
      },
    ];
    const result = addSceneTemplate(
      elements,
      { templateId: "action-impact", viewCenterX: 360, viewCenterY: originY + 200 },
      nextId
    );
    expect(result.ok).toBe(false);
  });

  it("addSceneTemplate off-frame confession: commits frame element + decor", () => {
    const result = addSceneTemplate(
      [],
      { templateId: "confession", viewCenterX: 360, viewCenterY: 320 },
      nextId
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.elements.some((e) => e.type === "frame")).toBe(true);
    const snapshot = studioCanvasSnapshotFromElements(result.elements);
    expect(postInsertFramesComposable(snapshot.frames, snapshot.decor)).toBe(true);
  });

  it("addDialogueBubbles off-frame: empty canvas commits virtual dialogue frame", () => {
    const result = addDialogueBubbles([], "민수: 안녕\n지영: 반가워", nextId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = studioCanvasSnapshotFromElements(result.elements);
    expect(snapshot.frames).toHaveLength(1);
    expect(snapshot.decor.length).toBeGreaterThan(0);
    expect(postInsertFramesComposable(snapshot.frames, snapshot.decor)).toBe(true);
  });

  it("addDialogueBubbles: empty script returns ok:false", () => {
    const elements = assemblyToElements(talkLayout.id);
    expect(addDialogueBubbles(elements, "   ", nextId).ok).toBe(false);
  });
});

describe("mutateComipoSnapshot low-level contract", () => {
  const talkLayout = PANEL_LAYOUTS.find((l) => l.id === "layout_talk_2_bubbles")!;

  it("mutateComipoSnapshot rejects vacuous postInsert when decor exists without frames", () => {
    const decor: StudioDecorElement[] = [
      {
        id: "solo",
        type: "bubble",
        variant: "speech",
        text: "고아 decor",
        x: 100,
        y: 100,
        width: 120,
        height: 80,
        fill: "#fff",
        textFill: "#000",
        rotation: 0,
      },
    ];
    expect(postInsertFramesComposable([], decor)).toBe(false);
  });

  it("materializePanelLayout seeds remain valid assembly inputs", () => {
    const snapshot = assemblyToSnapshot(talkLayout.id);
    const { seeds } = materializePanelLayout(talkLayout);
    expect(seeds.length).toBeGreaterThan(0);
    expect(snapshot.frames.length).toBeGreaterThan(0);
  });
});