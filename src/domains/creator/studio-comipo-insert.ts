/**
 * Studio shipped insert — addSceneTemplate / addDialogueBubbles 가 호출하는
 * 단일 원자 API mutateComipoSnapshot. assembleComipoPage 와 동일한 per-frame
 * 태깅 + placeDecorInFrame 을 on/off-frame 모두에 적용한다.
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
import { SCENE_TEMPLATES } from "./studio-scene-templates";
import { rectContainsPoint, type Rect } from "./studio-selection";

import type { PanelLayoutFrame } from "./studio-panel-layouts";

export interface StudioCanvasSnapshot {
  frames: readonly PanelLayoutFrame[];
  decor: readonly StudioDecorElement[];
}

export type ComipoInsertAction =
  | {
      kind: "scene";
      templateId: string;
      /** 지정 없으면 snapshot.frames 또는 가상 컷. */
      targetFrame?: PanelLayoutFrame;
      originY?: number;
    }
  | {
      kind: "dialogue";
      script: string;
      startY?: number;
    };

export type MutateComipoResult = { ok: false } | { ok: true; snapshot: StudioCanvasSnapshot };

const OFF_FRAME_HEIGHT = 480;
const OFF_FRAME_MARGIN = 24;
const OFF_DIALOGUE_FRAME_HEIGHT = 1200;

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

function virtualInsertFrame(originY: number, canvasWidth = CANVAS_W): PanelLayoutFrame {
  return {
    x: OFF_FRAME_MARGIN,
    y: Math.max(OFF_FRAME_MARGIN, Math.round(originY)),
    width: canvasWidth - OFF_FRAME_MARGIN * 2,
    height: OFF_FRAME_HEIGHT,
  };
}

function virtualDialogueFrame(startY: number, canvasWidth = CANVAS_W): PanelLayoutFrame {
  return {
    x: OFF_FRAME_MARGIN,
    y: Math.max(OFF_FRAME_MARGIN, Math.round(startY)),
    width: canvasWidth - OFF_FRAME_MARGIN * 2,
    height: OFF_DIALOGUE_FRAME_HEIGHT,
  };
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

function incrementalPatchFromPlace(
  frame: PanelLayoutFrame,
  existing: readonly DecorRef[],
  incoming: readonly DecorRef[]
): ReturnType<typeof incrementalPlaceInFrame> | null {
  const result = incrementalPlaceInFrame(frame, existing, incoming);
  return result.composable ? result : null;
}

function decorPatchFromResult(result: NonNullable<ReturnType<typeof incrementalPatchFromPlace>>) {
  return {
    removedIds: result.removedIds,
    updates: result.refs.filter((r) => r.id).map((r) => ({ id: r.id!, seed: r.seed })),
    addedSeeds: result.addedSeeds,
  };
}

/** 모든 등록 프레임 + 가상 검사 프레임에서 decor 쌍별 겹침 없음. */
function assertSnapshotComposable(
  frames: readonly PanelLayoutFrame[],
  decor: readonly StudioDecorElement[],
  virtualChecks: readonly PanelLayoutFrame[] = []
): boolean {
  if (decor.length > 0 && frames.length === 0 && virtualChecks.length === 0) {
    return false;
  }
  for (const frame of frames) {
    const seeds = collectStudioDecorRefs(frame, decor).map((r) => r.seed);
    if (!frameDecorHasNoPairwiseOverlap(frame, seeds)) return false;
  }
  for (const frame of virtualChecks) {
    const seeds = collectStudioDecorRefs(frame, decor).map((r) => r.seed);
    if (!frameDecorHasNoPairwiseOverlap(frame, seeds)) return false;
  }
  return true;
}

function mutateScene(
  snapshot: StudioCanvasSnapshot,
  templateId: string,
  createId: () => string,
  canvasWidth: number,
  targetFrame?: PanelLayoutFrame,
  originY = 80
): MutateComipoResult {
  const scene = findSceneTemplate(templateId);
  if (!scene) return { ok: false };

  let frames = snapshot.frames;
  let decor = snapshot.decor;
  let checkVirtual: PanelLayoutFrame | null = null;

  let frame = targetFrame ?? null;
  if (!frame && frames.length > 0) {
    frame = [...frames].sort((a, b) => a.y - b.y || a.x - b.x)[0]!;
  }

  if (!frame) {
    const raw = scene.build(0, Math.max(OFF_FRAME_MARGIN, Math.round(originY)));
    const frameSeed = raw.find((s) => s.type === "frame");
    frame = frameSeed
      ? {
          x: frameSeed.x,
          y: frameSeed.y,
          width: frameSeed.width,
          height: frameSeed.height,
        }
      : virtualInsertFrame(originY, canvasWidth);
    checkVirtual = frame;
    if (frameSeed && frames.length === 0) {
      frames = [frame];
    }
  }

  const existing = collectStudioDecorRefs(frame, decor);
  const incoming = sceneIncomingForFrame(templateId, frame, false);
  const placed = incrementalPatchFromPlace(frame, existing, incoming);
  if (!placed) return { ok: false };

  decor = applyIncrementalDecor(decor, decorPatchFromResult(placed), createId);
  if (snapshot.frames.length === 0 && checkVirtual) {
    frames = [checkVirtual];
  }
  if (!assertSnapshotComposable(frames, decor)) return { ok: false };

  return { ok: true, snapshot: { frames, decor } };
}

function mutateDialogue(
  snapshot: StudioCanvasSnapshot,
  script: string,
  createId: () => string,
  canvasWidth: number,
  startY = 80
): MutateComipoResult {
  const trimmed = script.trim();
  if (!trimmed) return { ok: false };

  let frames = [...snapshot.frames].sort((a, b) => a.y - b.y || a.x - b.x);
  let decor = snapshot.decor;
  let checkVirtual: PanelLayoutFrame | null = null;

  if (frames.length === 0) {
    const virtual = virtualDialogueFrame(startY, canvasWidth);
    checkVirtual = virtual;
    frames = [virtual];
  }

  const raw = composeDialogueIntoFrames(trimmed, frames, canvasWidth);
  if (raw.length === 0) return { ok: false };

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const forFrame = raw.filter((_, idx) => idx % frames.length === i);
    if (forFrame.length === 0) continue;
    const existing = collectStudioDecorRefs(frame, decor);
    const placed = incrementalPatchFromPlace(frame, existing, dialogueIncomingRefs(forFrame));
    if (!placed) return { ok: false };
    decor = applyIncrementalDecor(decor, decorPatchFromResult(placed), createId);
  }

  const outFrames =
    snapshot.frames.length === 0 && checkVirtual ? [checkVirtual] : [...snapshot.frames];
  if (!assertSnapshotComposable(outFrames, decor)) return { ok: false };

  return { ok: true, snapshot: { frames: outFrames, decor } };
}

/**
 * addSceneTemplate / addDialogueBubbles 의 단일 shipped 진입점.
 * ok: false 이면 StudioPage 는 commit 하지 않는다.
 */
export function mutateComipoSnapshot(
  snapshot: StudioCanvasSnapshot,
  action: ComipoInsertAction,
  createId: () => string,
  canvasWidth = CANVAS_W
): MutateComipoResult {
  if (action.kind === "scene") {
    return mutateScene(
      snapshot,
      action.templateId,
      createId,
      canvasWidth,
      action.targetFrame,
      action.originY
    );
  }
  return mutateDialogue(snapshot, action.script, createId, canvasWidth, action.startY);
}

/** 삽입 후 스냅샷이 프레임·가상 프레임 모두에서 쌍별 겹침 없는지(테스트·디버그). */
export function postInsertFramesComposable(
  frames: readonly PanelLayoutFrame[],
  decor: readonly StudioDecorElement[],
  virtualChecks: readonly PanelLayoutFrame[] = []
): boolean {
  return assertSnapshotComposable(frames, decor, virtualChecks);
}