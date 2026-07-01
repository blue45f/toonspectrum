import { describe, expect, it } from "vitest";

import { assembleComipoPage } from "./studio-comipo-assembly";
import {
  collectStudioDecorRefs,
  frameDecorHasNoPairwiseOverlap,
} from "./studio-comipo-incremental";
import {
  mutateComipoSnapshot,
  postInsertFramesComposable,
  type StudioCanvasSnapshot,
} from "./studio-comipo-insert";
import { materializePanelLayout, PANEL_LAYOUTS } from "./studio-panel-layouts";

import type { StudioDecorElement } from "./studio-comipo-incremental";

let idSeq = 0;
function nextId() {
  idSeq += 1;
  return `el-${idSeq}`;
}

function assemblyToSnapshot(layoutId: string): StudioCanvasSnapshot {
  const layout = PANEL_LAYOUTS.find((l) => l.id === layoutId)!;
  const assembled = assembleComipoPage({ layoutId })!;
  const frames = layout.frames;
  const decor: StudioDecorElement[] = assembled.seeds
    .filter((s) => s.type !== "frame")
    .map((seed) => {
      const id = nextId();
      if (seed.type === "bubble") {
        return {
          id,
          type: "bubble" as const,
          variant: seed.variant,
          text: seed.text,
          x: seed.x,
          y: seed.y,
          width: seed.width,
          height: seed.height,
          fill: seed.fill,
          textFill: seed.textFill,
          rotation: seed.rotation,
        };
      }
      throw new Error(`unexpected seed ${seed.type}`);
    });
  return { frames, decor };
}

describe("mutateComipoSnapshot shipped path", () => {
  const talkLayout = PANEL_LAYOUTS.find((l) => l.id === "layout_talk_2_bubbles")!;

  it("scene: populated panel + confession drops layout placeholder, post-state no overlap", () => {
    const snapshot = assemblyToSnapshot(talkLayout.id);
    const layoutBubble = snapshot.decor.find(
      (d): d is Extract<typeof d, { type: "bubble" }> =>
        d.type === "bubble" && d.text === "대사를 입력"
    )!;
    const top = talkLayout.frames[0]!;

    const result = mutateComipoSnapshot(
      snapshot,
      { kind: "scene", templateId: "confession", targetFrame: top },
      nextId
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(postInsertFramesComposable(result.snapshot.frames, result.snapshot.decor)).toBe(true);
    expect(result.snapshot.decor.some((d) => d.id === layoutBubble.id)).toBe(false);

    const topSeeds = collectStudioDecorRefs(top, result.snapshot.decor).map((r) => r.seed);
    expect(frameDecorHasNoPairwiseOverlap(top, topSeeds)).toBe(true);
  });

  it("dialogue: scene-populated canvas stays composable with no frame overlap", () => {
    let snapshot = assemblyToSnapshot(talkLayout.id);
    const top = talkLayout.frames[0]!;

    const scene = mutateComipoSnapshot(
      snapshot,
      { kind: "scene", templateId: "confession", targetFrame: top },
      nextId
    );
    expect(scene.ok).toBe(true);
    if (!scene.ok) return;
    snapshot = scene.snapshot;

    const dialogue = mutateComipoSnapshot(
      snapshot,
      {
        kind: "dialogue",
        script: "민수: 스튜디오에 오신 걸 환영해요!\n지영: 3D 캐릭터를 써 보세요.",
      },
      nextId
    );
    expect(dialogue.ok).toBe(true);
    if (!dialogue.ok) return;

    expect(postInsertFramesComposable(dialogue.snapshot.frames, dialogue.snapshot.decor)).toBe(true);
  });

  it("returns ok:false when plan would be non-composable (overcrowded frame)", () => {
    const top = talkLayout.frames[0]!;
    const snapshot: StudioCanvasSnapshot = {
      frames: [top],
      decor: [
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
          tail: "left",
          tailDirection: "bottom",
        },
      ],
    };
    const result = mutateComipoSnapshot(
      snapshot,
      { kind: "scene", templateId: "confession", targetFrame: top },
      nextId
    );
    expect(result.ok).toBe(false);
  });

  it("off-frame scene: guards against pre-existing decor overlap in virtual frame", () => {
    const originY = 80;
    const virtualFrame = {
      x: 24,
      y: originY,
      width: 720 - 48,
      height: 480,
    };
    const snapshot: StudioCanvasSnapshot = {
      frames: [],
      decor: [
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
      ],
    };
    const result = mutateComipoSnapshot(
      snapshot,
      { kind: "scene", templateId: "action-impact", originY },
      nextId
    );
    expect(result.ok).toBe(false);
  });

  it("off-frame scene without panels: confession adds virtual frame seed composably", () => {
    const result = mutateComipoSnapshot(
      { frames: [], decor: [] },
      { kind: "scene", templateId: "confession", originY: 80 },
      nextId
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.frames.length).toBe(1);
    expect(result.snapshot.decor.length).toBeGreaterThan(0);
    expect(postInsertFramesComposable(result.snapshot.frames, result.snapshot.decor)).toBe(true);
  });

  it("off-frame dialogue: empty canvas places bubbles without persisting virtual frame", () => {
    const result = mutateComipoSnapshot(
      { frames: [], decor: [] },
      { kind: "dialogue", script: "민수: 안녕\n지영: 반가워", startY: 80 },
      nextId
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.frames).toHaveLength(0);
    expect(result.snapshot.decor.length).toBeGreaterThan(0);
    const virtual = { x: 24, y: 80, width: 720 - 48, height: 1200 };
    const seeds = collectStudioDecorRefs(virtual, result.snapshot.decor).map((r) => r.seed);
    expect(frameDecorHasNoPairwiseOverlap(virtual, seeds)).toBe(true);
  });

  it("returns ok:false for empty dialogue script", () => {
    const snapshot = assemblyToSnapshot(talkLayout.id);
    expect(
      mutateComipoSnapshot(snapshot, { kind: "dialogue", script: "   " }, nextId).ok
    ).toBe(false);
  });

  it("materializePanelLayout seeds remain valid inputs for assembly guard", () => {
    const { seeds } = materializePanelLayout(talkLayout);
    expect(seeds.length).toBeGreaterThan(0);
  });
});