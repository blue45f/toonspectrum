/**
 * Studio shipped insert paths — addSceneTemplate / addDialogueBubbles 가 호출하는
 * 순수 계획·commit 함수. assembleComipoPage 와 동일한 scene/dialogue 태깅을 쓴다.
 */

import { CANVAS_W } from "./studio-assets";
import { composeDialogueIntoFrames, composeSceneIntoFrame } from "./studio-comipo-compose";
import {
  applyIncrementalDecor,
  collectStudioDecorRefs,
  dialogueIncomingRefs,
  frameDecorHasNoPairwiseOverlap,
  incrementalPlaceInFrame,
  sceneIncomingRefs,
  type DecorRef,
  type StudioDecorElement,
} from "./studio-comipo-incremental";
import { dialogueToBubbles } from "./studio-dialogue";
import { SCENE_TEMPLATES } from "./studio-scene-templates";
import { rectContainsPoint, type Rect } from "./studio-selection";

import type { PanelLayoutFrame } from "./studio-panel-layouts";

export interface StudioCanvasSnapshot {
  frames: readonly PanelLayoutFrame[];
  decor: readonly StudioDecorElement[];
}

export interface IncrementalInsertPlan {
  composable: boolean;
  removedIds: readonly string[];
  updates: ReadonlyArray<{ id: string; seed: DecorRef["seed"] }>;
  addedSeeds: readonly DecorRef["seed"][];
}

const OFF_FRAME_HEIGHT = 480;
const OFF_FRAME_MARGIN = 24;

function findSceneTemplate(id: string) {
  return SCENE_TEMPLATES.find((t) => t.id === id) ?? null;
}

function frameToRect(frame: PanelLayoutFrame): Rect {
  return { x: frame.x, y: frame.y, w: frame.width, h: frame.height };
}

/** 뷰포트 중심이 들어가는 패널 프레임(없으면 첫 프레임). */
export function pickTargetPanelFrame(
  frames: readonly PanelLayoutFrame[],
  viewCenterX: number,
  viewCenterY: number
): PanelLayoutFrame | null {
  if (frames.length === 0) return null;
  const hit = frames.find((f) => rectContainsPoint(frameToRect(f), viewCenterX, viewCenterY));
  if (hit) return hit;
  return [...frames].sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null;
}

function sceneIncomingForFrame(
  templateId: string,
  frame: PanelLayoutFrame,
  hasDialogue: boolean
): DecorRef[] {
  const scene = findSceneTemplate(templateId);
  if (!scene) return [];
  const rawScene = scene.build(0, 0);
  const sceneForCompose = hasDialogue
    ? rawScene.filter((s) => s.type !== "frame" && s.type !== "bubble")
    : rawScene.filter((s) => s.type !== "frame");
  return sceneIncomingRefs(composeSceneIntoFrame(sceneForCompose, frame));
}

function planFromIncremental(
  frame: PanelLayoutFrame,
  existing: readonly DecorRef[],
  incoming: readonly DecorRef[]
): IncrementalInsertPlan {
  const result = incrementalPlaceInFrame(frame, existing, incoming);
  if (!result.composable) {
    return { composable: false, removedIds: [], updates: [], addedSeeds: [] };
  }
  return {
    composable: true,
    removedIds: result.removedIds,
    updates: result.refs
      .filter((r) => r.id)
      .map((r) => ({ id: r.id!, seed: r.seed })),
    addedSeeds: result.addedSeeds,
  };
}

/** addSceneTemplate shipped path — target 프레임에 기존 장식 포함 배치. */
export function planSceneTemplateInsert(
  snapshot: StudioCanvasSnapshot,
  templateId: string,
  targetFrame: PanelLayoutFrame,
  options?: { dialogueScript?: string }
): IncrementalInsertPlan {
  const hasDialogue = Boolean(options?.dialogueScript?.trim());
  const existing = collectStudioDecorRefs(targetFrame, snapshot.decor);
  const incoming = sceneIncomingForFrame(templateId, targetFrame, hasDialogue);
  return planFromIncremental(targetFrame, existing, incoming);
}

/** 프레임 없을 때 가상 컷 안에 배치(addSceneTemplate else branch). */
export function planSceneTemplateInsertOffFrame(
  templateId: string,
  originY: number,
  canvasWidth = CANVAS_W
): IncrementalInsertPlan {
  const virtualFrame: PanelLayoutFrame = {
    x: OFF_FRAME_MARGIN,
    y: Math.max(OFF_FRAME_MARGIN, Math.round(originY)),
    width: canvasWidth - OFF_FRAME_MARGIN * 2,
    height: OFF_FRAME_HEIGHT,
  };
  const incoming = sceneIncomingForFrame(templateId, virtualFrame, false);
  return planFromIncremental(virtualFrame, [], incoming);
}

/** addDialogueBubbles shipped path — 패널 프레임별 기존 장식 + 대사. */
export function planDialogueScriptInsert(
  snapshot: StudioCanvasSnapshot,
  script: string,
  canvasWidth = CANVAS_W
): IncrementalInsertPlan {
  const frames = [...snapshot.frames].sort((a, b) => a.y - b.y || a.x - b.x);
  if (frames.length === 0) {
    return planDialogueScriptInsertOffFrame(script, canvasWidth);
  }

  const raw = composeDialogueIntoFrames(script, frames, canvasWidth);
  const merged: IncrementalInsertPlan = {
    composable: true,
    removedIds: [],
    updates: [],
    addedSeeds: [],
  };

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const forFrame = raw.filter((_, idx) => idx % frames.length === i);
    if (forFrame.length === 0) continue;
    const existing = collectStudioDecorRefs(frame, snapshot.decor);
    const partial = planFromIncremental(frame, existing, dialogueIncomingRefs(forFrame));
    if (!partial.composable) {
      return { composable: false, removedIds: [], updates: [], addedSeeds: [] };
    }
    merged.removedIds = [...merged.removedIds, ...partial.removedIds];
    merged.updates = [...merged.updates, ...partial.updates];
    merged.addedSeeds = [...merged.addedSeeds, ...partial.addedSeeds];
  }

  if (merged.addedSeeds.length === 0) {
    return { composable: false, removedIds: [], updates: [], addedSeeds: [] };
  }
  return merged;
}

/** 패널 없을 때 세로 스택 대사(addDialogueBubbles else branch) — 쌍별 겹침 검사. */
export function planDialogueScriptInsertOffFrame(
  script: string,
  canvasWidth = CANVAS_W,
  startY = 80
): IncrementalInsertPlan {
  const bubbles = dialogueToBubbles(script, { canvasWidth, startY });
  if (bubbles.length === 0) {
    return { composable: false, removedIds: [], updates: [], addedSeeds: [] };
  }
  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i + 1; j < bubbles.length; j++) {
      const a = bubbles[i]!;
      const b = bubbles[j]!;
      const overlap =
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      if (overlap) {
        return { composable: false, removedIds: [], updates: [], addedSeeds: [] };
      }
    }
  }
  return {
    composable: true,
    removedIds: [],
    updates: [],
    addedSeeds: bubbles,
  };
}

/** composable 일 때만 decor 갱신; 거짓이면 null(commit 차단). */
export function applyIncrementalInsertPlan(
  snapshot: StudioCanvasSnapshot,
  plan: IncrementalInsertPlan,
  createId: () => string
): StudioCanvasSnapshot | null {
  if (!plan.composable) return null;
  const nextDecor = applyIncrementalDecor(snapshot.decor, plan, createId);
  if (!postInsertFramesComposable(snapshot.frames, nextDecor)) return null;
  return { frames: snapshot.frames, decor: nextDecor };
}

/** commit 후 모든 패널 프레임 decor 쌍별 겹침 없음. */
export function postInsertFramesComposable(
  frames: readonly PanelLayoutFrame[],
  decor: readonly StudioDecorElement[]
): boolean {
  for (const frame of frames) {
    const seeds = collectStudioDecorRefs(frame, decor).map((r) => r.seed);
    if (!frameDecorHasNoPairwiseOverlap(frame, seeds)) return false;
  }
  return true;
}