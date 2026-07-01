import { describe, expect, it } from "vitest";

import {
  boundsOverlap,
  composeDialogueIntoFrames,
  composeSceneIntoFrame,
  framesOverlap,
  isComposableAssembly,
  seedBounds,
  seedsFitInsideFrame,
} from "./studio-comipo-compose";
import { PANEL_LAYOUTS } from "./studio-panel-layouts";
import { SCENE_TEMPLATES } from "./studio-scene-templates";

describe("studio-comipo-compose", () => {
  const talkLayout = PANEL_LAYOUTS.find((l) => l.id === "layout_talk_2_bubbles")!;
  const confession = SCENE_TEMPLATES.find((t) => t.id === "confession")!;

  it("panel layout frames do not overlap each other", () => {
    expect(framesOverlap(talkLayout.frames)).toBe(false);
  });

  it("composeSceneIntoFrame drops scene frame and fits decor inside target panel", () => {
    const target = talkLayout.frames[0]!;
    const composed = composeSceneIntoFrame(confession.build(0, 0), target);
    expect(composed.some((s) => s.type === "frame")).toBe(false);
    expect(composed.length).toBeGreaterThan(0);
    expect(seedsFitInsideFrame(composed, target)).toBe(true);
  });

  it("composeDialogueIntoFrames places each line inside a distinct panel frame", () => {
    const bubbles = composeDialogueIntoFrames("민수: 안녕\n지영: 반가워", talkLayout.frames);
    expect(bubbles).toHaveLength(2);
    expect(seedsFitInsideFrame([bubbles[0]!], talkLayout.frames[0]!)).toBe(true);
    expect(seedsFitInsideFrame([bubbles[1]!], talkLayout.frames[1]!)).toBe(true);
    expect(boundsOverlap(seedBounds(bubbles[0]!), seedBounds(bubbles[1]!))).toBe(false);
  });

  it("isComposableAssembly rejects overlapping panel frames", () => {
    const badFrames = [
      { x: 0, y: 0, width: 200, height: 200 },
      { x: 100, y: 100, width: 200, height: 200 },
    ];
    expect(isComposableAssembly(badFrames, [], 800)).toBe(false);
  });

  it("isComposableAssembly accepts scene+dialogue fitted into talk layout", () => {
    const sceneDecor = composeSceneIntoFrame(confession.build(0, 0), talkLayout.frames[0]!);
    const dialogue = composeDialogueIntoFrames(
      "민수: 스튜디오에 오신 걸 환영해요!\n지영: 3D 캐릭터를 써 보세요.",
      talkLayout.frames
    );
    expect(
      isComposableAssembly(talkLayout.frames, [...sceneDecor, ...dialogue], talkLayout.canvasH)
    ).toBe(true);
  });
});