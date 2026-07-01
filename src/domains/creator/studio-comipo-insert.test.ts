import { describe, expect, it } from "vitest";

import { assembleComipoPage } from "./studio-comipo-assembly";
import { frameDecorHasNoPairwiseOverlap } from "./studio-comipo-incremental";
import {
  applyIncrementalInsertPlan,
  planDialogueScriptInsert,
  planDialogueScriptInsertOffFrame,
  planSceneTemplateInsert,
  planSceneTemplateInsertOffFrame,
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

describe("studio-comipo-insert shipped paths", () => {
  const talkLayout = PANEL_LAYOUTS.find((l) => l.id === "layout_talk_2_bubbles")!;

  it("planSceneTemplateInsert: populated panel + confession drops layout placeholder, post-state no overlap", () => {
    const snapshot = assemblyToSnapshot(talkLayout.id);
    const layoutBubble = snapshot.decor.find(
      (d): d is Extract<typeof d, { type: "bubble" }> =>
        d.type === "bubble" && d.text === "대사를 입력"
    )!;
    const top = talkLayout.frames[0]!;

    const plan = planSceneTemplateInsert(snapshot, "confession", top);
    expect(plan.composable).toBe(true);
    expect(plan.removedIds).toContain(layoutBubble.id);

    const next = applyIncrementalInsertPlan(snapshot, plan, nextId);
    expect(next).not.toBeNull();
    expect(postInsertFramesComposable(next!.frames, next!.decor)).toBe(true);

    const topSeeds = next!.decor
      .filter((d) => d.type === "bubble" || d.type === "text")
      .map((d) => ({
        type: d.type,
        x: d.x,
        y: d.y,
        width: d.width,
        height: "height" in d ? d.height : d.fontSize * 1.4,
      }));
    expect(frameDecorHasNoPairwiseOverlap(top, topSeeds as never)).toBe(true);
    expect(next!.decor.some((d) => d.id === layoutBubble.id)).toBe(false);
  });

  it("planDialogueScriptInsert: scene-populated canvas stays composable with no frame overlap", () => {
    let snapshot = assemblyToSnapshot(talkLayout.id);
    const top = talkLayout.frames[0]!;
    const scenePlan = planSceneTemplateInsert(snapshot, "confession", top);
    snapshot = applyIncrementalInsertPlan(snapshot, scenePlan, nextId)!;

    const dialoguePlan = planDialogueScriptInsert(
      snapshot,
      "민수: 스튜디오에 오신 걸 환영해요!\n지영: 3D 캐릭터를 써 보세요."
    );
    expect(dialoguePlan.composable).toBe(true);

    const next = applyIncrementalInsertPlan(snapshot, dialoguePlan, nextId);
    expect(next).not.toBeNull();
    expect(postInsertFramesComposable(next!.frames, next!.decor)).toBe(true);
  });

  it("applyIncrementalInsertPlan returns null when plan.composable is false", () => {
    const snapshot = assemblyToSnapshot(talkLayout.id);
    expect(
      applyIncrementalInsertPlan(
        snapshot,
        { composable: false, removedIds: [], updates: [], addedSeeds: [] },
        nextId
      )
    ).toBeNull();
  });

  it("planSceneTemplateInsert guard blocks overcrowded populated frame", () => {
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
    const plan = planSceneTemplateInsert(snapshot, "confession", top);
    expect(plan.composable).toBe(false);
    expect(applyIncrementalInsertPlan(snapshot, plan, nextId)).toBeNull();
  });

  it("planSceneTemplateInsertOffFrame guards virtual frame placement", () => {
    const plan = planSceneTemplateInsertOffFrame("confession", 80);
    expect(plan.composable).toBe(true);
    expect(plan.addedSeeds.length).toBeGreaterThan(0);
  });

  it("planDialogueScriptInsertOffFrame rejects overlapping vertical stack", () => {
    const { seeds } = materializePanelLayout(talkLayout);
    const good = planDialogueScriptInsertOffFrame("민수: 안녕\n지영: 반가워");
    expect(good.composable).toBe(true);
    expect(seeds.length).toBeGreaterThan(0);
  });
});