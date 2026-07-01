/**
 * StudioPage addSceneTemplate / addDialogueBubbles 와 동일한 shipped 경로.
 * snapshot 추출 → action 구성 → mutateComipoSnapshot → commit 병합을 한 모듈에서 제공해
 * UI·단위 테스트가 같은 코드를 호출한다.
 */

import { CANVAS_W } from "./studio-assets";
import {
  mutateComipoSnapshot,
  pickTargetPanelFrame,
  type ComipoInsertAction,
  type MutateComipoResult,
  type StudioCanvasSnapshot,
} from "./studio-comipo-insert";

import type { StudioDecorElement } from "./studio-comipo-incremental";
import type { PanelLayoutFrame } from "./studio-panel-layouts";

export type StudioElementLike = {
  id: string;
  type: string;
  hidden?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

const DECOR_TYPES = new Set(["bubble", "text", "focusLines", "speedLines"]);

export function isStudioDecorElement(el: StudioElementLike): el is StudioDecorElement {
  return DECOR_TYPES.has(el.type);
}

/** StudioPage.studioCanvasSnapshot 과 동일 계약. */
export function studioCanvasSnapshotFromElements(
  elements: readonly StudioElementLike[]
): StudioCanvasSnapshot {
  const frames = elements
    .filter(
      (e): e is StudioElementLike & { type: "frame"; x: number; y: number; width: number; height: number } =>
        e.type === "frame" && !e.hidden && e.x != null && e.y != null && e.width != null && e.height != null
    )
    .map((f) => ({ x: f.x, y: f.y, width: f.width, height: f.height }));
  return {
    frames,
    decor: elements.filter(isStudioDecorElement) as StudioDecorElement[],
  };
}

export type SceneInsertUiContext = {
  templateId: string;
  viewCenterX: number;
  viewCenterY: number;
  /** 선택된 frame 요소가 있으면 그 bbox. */
  selectedFrame?: PanelLayoutFrame | null;
};

/** StudioPage addSceneTemplate 의 action 분기(pickTarget / off-frame originY). */
export function buildSceneInsertAction(
  snapshot: StudioCanvasSnapshot,
  ctx: SceneInsertUiContext
): ComipoInsertAction {
  const target =
    ctx.selectedFrame ?? pickTargetPanelFrame(snapshot.frames, ctx.viewCenterX, ctx.viewCenterY);

  if (target && snapshot.frames.length > 0) {
    return { kind: "scene", templateId: ctx.templateId, targetFrame: target };
  }
  return {
    kind: "scene",
    templateId: ctx.templateId,
    originY: Math.max(20, Math.round(ctx.viewCenterY - 240)),
  };
}

export type CommitMutationPatch = {
  kept: StudioElementLike[];
  addedFrames: PanelLayoutFrame[];
  decor: StudioDecorElement[];
};

/** StudioPage commitMutatedSnapshot 과 동일 병합(프레임 dedupe + decor 교체). */
export function planCommitFromMutation(
  elements: readonly StudioElementLike[],
  result: MutateComipoResult
): CommitMutationPatch | null {
  if (!result.ok) return null;

  const decorIds = new Set(elements.filter(isStudioDecorElement).map((e) => e.id));
  const kept = elements.filter((e) => !decorIds.has(e.id));
  const existingFrameKeys = new Set(
    elements
      .filter(
        (e): e is StudioElementLike & { type: "frame"; x: number; y: number; width: number; height: number } =>
          e.type === "frame" && e.x != null && e.y != null && e.width != null && e.height != null
      )
      .map((f) => `${f.x},${f.y},${f.width},${f.height}`)
  );
  const addedFrames = result.snapshot.frames.filter(
    (f) => !existingFrameKeys.has(`${f.x},${f.y},${f.width},${f.height}`)
  );

  return { kept: [...kept], addedFrames, decor: [...result.snapshot.decor] };
}

export function frameElFromPanel(
  frame: PanelLayoutFrame,
  id: string
): StudioElementLike & { type: "frame"; x: number; y: number; width: number; height: number } {
  return {
    id,
    type: "frame",
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

export function applyCommitPatch(
  patch: CommitMutationPatch,
  createId: () => string
): StudioElementLike[] {
  const newFrames = patch.addedFrames.map((f) => frameElFromPanel(f, createId()));
  return [...patch.kept, ...newFrames, ...patch.decor];
}

export type ShippedInsertResult =
  | { ok: false }
  | { ok: true; elements: StudioElementLike[]; snapshot: StudioCanvasSnapshot };

/** StudioPage addSceneTemplate shipped path. */
export function addSceneTemplate(
  elements: readonly StudioElementLike[],
  ctx: SceneInsertUiContext,
  createId: () => string,
  canvasWidth = CANVAS_W
): ShippedInsertResult {
  const snapshot = studioCanvasSnapshotFromElements(elements);
  const action = buildSceneInsertAction(snapshot, ctx);
  const result = mutateComipoSnapshot(snapshot, action, createId, canvasWidth);
  const patch = planCommitFromMutation(elements, result);
  if (!patch) return { ok: false };
  return {
    ok: true,
    elements: applyCommitPatch(patch, createId),
    snapshot: result.ok ? result.snapshot : snapshot,
  };
}

/** StudioPage addDialogueBubbles shipped path. */
export function addDialogueBubbles(
  elements: readonly StudioElementLike[],
  script: string,
  createId: () => string,
  canvasWidth = CANVAS_W
): ShippedInsertResult {
  if (!script.trim()) return { ok: false };
  const snapshot = studioCanvasSnapshotFromElements(elements);
  const result = mutateComipoSnapshot(
    snapshot,
    { kind: "dialogue", script },
    createId,
    canvasWidth
  );
  const patch = planCommitFromMutation(elements, result);
  if (!patch) return { ok: false };
  return {
    ok: true,
    elements: applyCommitPatch(patch, createId),
    snapshot: result.ok ? result.snapshot : snapshot,
  };
}