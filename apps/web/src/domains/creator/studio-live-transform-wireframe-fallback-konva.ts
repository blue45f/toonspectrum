/**
 * Bounded renderer fallback for draw transforms that cannot afford an exact model draft.
 *
 * Exact previews intentionally have conservative main-thread budgets. Falling straight back to the
 * authored pose when one frame crosses that budget makes a resize feel intermittent: the handles
 * continue moving while the ink disappears, then it may reappear after crossing the threshold in
 * the other direction. This adapter keeps a lightweight centre-line proxy alive for the remainder
 * of the gesture instead. Geometry is sampled once, all pointer frames are one root-matrix write,
 * and document/history state is never touched.
 *
 * The authored sources remain in their original parents and stacking context, dimmed rather than
 * moved. The proxy is therefore explicitly a transform guide, not a claim that an unsupported
 * blend/eraser/cache can be composited exactly in the isolated gesture layer. Pointer-up remains
 * the sole authoritative commit and restores the original source styling synchronously.
 */
import { studioDrawObjectTransformScale } from "./brush/studio-draw-object-transform";
import { studioKonvaRuntime } from "./render/studio-konva-runtime";

import type { DrawEl } from "./studio-element-model";
import type { StudioGroupUniformResizeBounds } from "./studio-group-uniform-resize";
import type { StudioLiveSelectionTransformFrame } from "./studio-live-canvas-gesture";
import type Konva from "konva";

export const STUDIO_LIVE_TRANSFORM_WIREFRAME_FALLBACK_NAME =
  "studio-live-transform-wireframe-fallback";

/** Prevent one fallback from becoming a second unbounded renderer. */
export const STUDIO_LIVE_TRANSFORM_WIREFRAME_MAX_MEMBERS = 512;
export const STUDIO_LIVE_TRANSFORM_WIREFRAME_MAX_POINTS = 8_192;
const STUDIO_LIVE_TRANSFORM_WIREFRAME_MAX_POINTS_PER_MEMBER = 256;
const STUDIO_LIVE_TRANSFORM_WIREFRAME_SOURCE_OPACITY = 0.18;
const STUDIO_LIVE_TRANSFORM_WIREFRAME_OPACITY = 0.82;
const STUDIO_LIVE_TRANSFORM_WIREFRAME_MIN_SCALE = 1e-4;

export interface StudioLiveTransformWireframeMember {
  readonly element: DrawEl;
  readonly node: Konva.Node;
}

export interface CreateStudioLiveTransformWireframeFallbackOptions {
  readonly members: readonly StudioLiveTransformWireframeMember[];
  readonly sourceBounds: StudioGroupUniformResizeBounds;
  readonly dragLayer: Konva.Layer;
  /** Group resize preserves authored line weight; single-object resize scales it. */
  readonly strokeWidthPolicy: "preserve" | "scale";
}

export interface StudioLiveTransformWireframeFallback {
  readonly present: (frame: StudioLiveSelectionTransformFrame) => boolean;
  readonly clear: () => void;
  readonly dispose: () => void;
  readonly isPresenting: () => boolean;
}

interface StudioWireframeTrace {
  readonly line: Konva.Line;
  readonly authoredStrokeWidth: number;
}

interface StudioWireframeSourceStyle {
  readonly node: Konva.Node;
  readonly visible: boolean;
  readonly opacity: number;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function fallbackStroke(element: DrawEl): string {
  if (element.mode === "eraser") return "#0ea5e9";
  return typeof element.stroke === "string" && element.stroke.trim().length > 0
    ? element.stroke
    : "#64748b";
}

function fallbackStrokeWidth(element: DrawEl): number {
  return Number.isFinite(element.strokeWidth)
    ? Math.min(128, Math.max(1, element.strokeWidth))
    : 1;
}

/**
 * Samples by stable source index rather than scanning every segment. Transform-start therefore
 * stays bounded even for imported 100k-sample strokes that the exact compiler correctly refuses.
 */
function sampledPoints(points: readonly number[], maximumSamples: number): number[] {
  const sampleCount = Math.floor(points.length / 2);
  if (sampleCount <= 0 || maximumSamples <= 0) return [];
  if (sampleCount === 1) {
    const x = points[0]!;
    const y = points[1]!;
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y, x + 0.001, y + 0.001] : [];
  }
  const outputCount = Math.min(sampleCount, Math.max(2, maximumSamples));
  const sampled: number[] = [];
  let previousIndex = -1;
  for (let outputIndex = 0; outputIndex < outputCount; outputIndex += 1) {
    const sourceIndex = Math.round(outputIndex * (sampleCount - 1) / (outputCount - 1));
    if (sourceIndex === previousIndex) continue;
    previousIndex = sourceIndex;
    let x: number;
    let y: number;
    try {
      x = points[sourceIndex * 2]!;
      y = points[sourceIndex * 2 + 1]!;
    } catch {
      return [];
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sampled.push(x, y);
  }
  return sampled.length >= 4 ? sampled : [];
}

function drawLayers(layers: ReadonlySet<Konva.Layer>): void {
  for (const layer of layers) layer.drawScene();
}

/** Creates one bounded proxy generation, or null when there is no finite geometry to present. */
export function createStudioLiveTransformWireframeFallback(
  options: CreateStudioLiveTransformWireframeFallbackOptions,
): StudioLiveTransformWireframeFallback | null {
  if (
    options.members.length === 0
    || options.members.length > STUDIO_LIVE_TRANSFORM_WIREFRAME_MAX_MEMBERS
    || !finitePositive(options.sourceBounds.width)
    || !finitePositive(options.sourceBounds.height)
  ) {
    return null;
  }

  const pointsPerMember = Math.max(
    2,
    Math.min(
      STUDIO_LIVE_TRANSFORM_WIREFRAME_MAX_POINTS_PER_MEMBER,
      Math.floor(STUDIO_LIVE_TRANSFORM_WIREFRAME_MAX_POINTS / options.members.length),
    ),
  );
  const root = new studioKonvaRuntime.Group({
    listening: false,
    visible: false,
    opacity: STUDIO_LIVE_TRANSFORM_WIREFRAME_OPACITY,
  });
  root.name(STUDIO_LIVE_TRANSFORM_WIREFRAME_FALLBACK_NAME);

  const traces: StudioWireframeTrace[] = [];
  for (const member of options.members) {
    const points = sampledPoints(member.element.points, pointsPerMember);
    if (points.length < 4) continue;
    const authoredStrokeWidth = fallbackStrokeWidth(member.element);
    const line = new studioKonvaRuntime.Line({
      points,
      stroke: fallbackStroke(member.element),
      strokeWidth: authoredStrokeWidth,
      lineCap: "round",
      lineJoin: "round",
      listening: false,
      perfectDrawEnabled: false,
      shadowForStrokeEnabled: false,
      hitStrokeWidth: 0,
      ...(member.element.mode === "eraser" ? { dash: [6, 4] } : {}),
    });
    // A subtractive or blend-sensitive authored node would disappear or lie on an empty isolated
    // canvas. The guide is always ordinary source-over paint by design.
    line.globalCompositeOperation("source-over");
    root.add(line);
    traces.push({ line, authoredStrokeWidth });
  }
  if (traces.length === 0) {
    root.destroy();
    return null;
  }

  options.dragLayer.add(root);
  const exactDraftRoot = options.dragLayer.findOne(".studio-live-transform-draft-root");
  if (exactDraftRoot?.getParent() === options.dragLayer) {
    root.zIndex(exactDraftRoot.zIndex() + 1);
  } else {
    root.moveToBottom();
  }

  const sourceStyles: StudioWireframeSourceStyle[] = options.members.map(({ node }) => ({
    node,
    visible: node.visible(),
    opacity: node.opacity(),
  }));
  const sourceLayers = new Set<Konva.Layer>();
  for (const source of sourceStyles) {
    const layer = source.node.getLayer();
    if (layer) sourceLayers.add(layer);
  }

  let presenting = false;
  let disposed = false;

  const setSourcesDimmed = (dimmed: boolean): boolean => {
    let mutated = false;
    for (const source of sourceStyles) {
      const targetOpacity = dimmed && source.visible
        ? source.opacity * STUDIO_LIVE_TRANSFORM_WIREFRAME_SOURCE_OPACITY
        : source.opacity;
      if (source.node.opacity() === targetOpacity) continue;
      source.node.opacity(targetOpacity);
      mutated = true;
    }
    return mutated;
  };

  const clear = (): void => {
    if (disposed || (!presenting && !root.visible())) return;
    const autoDrawEnabled = studioKonvaRuntime.autoDrawEnabled;
    let sourceChanged: boolean;
    try {
      studioKonvaRuntime.autoDrawEnabled = false;
      sourceChanged = setSourcesDimmed(false);
      root.visible(false);
      root.position({ x: 0, y: 0 });
      root.rotation(0);
      root.scale({ x: 1, y: 1 });
      root.offset({ x: 0, y: 0 });
      presenting = false;
    } finally {
      studioKonvaRuntime.autoDrawEnabled = autoDrawEnabled;
    }
    if (sourceChanged) drawLayers(sourceLayers);
    options.dragLayer.drawScene();
  };

  return {
    present: (frame) => {
      if (disposed || !Number.isFinite(frame.rotationDeg)) return false;
      const scale = studioDrawObjectTransformScale(options.sourceBounds, frame.targetBounds);
      if (!scale) return false;
      const widthScale = Math.max(
        STUDIO_LIVE_TRANSFORM_WIREFRAME_MIN_SCALE,
        scale.uniformEquivalent,
      );
      const autoDrawEnabled = studioKonvaRuntime.autoDrawEnabled;
      let sourceChanged = false;
      try {
        studioKonvaRuntime.autoDrawEnabled = false;
        if (!presenting) sourceChanged = setSourcesDimmed(true);
        root.position({ x: frame.targetBounds.x, y: frame.targetBounds.y });
        root.rotation(frame.rotationDeg);
        root.scale({ x: scale.scaleX, y: scale.scaleY });
        root.offset({ x: options.sourceBounds.x, y: options.sourceBounds.y });
        if (options.strokeWidthPolicy === "preserve") {
          for (const trace of traces) {
            trace.line.strokeWidth(trace.authoredStrokeWidth / widthScale);
          }
        }
        root.visible(true);
        presenting = true;
      } finally {
        studioKonvaRuntime.autoDrawEnabled = autoDrawEnabled;
      }
      if (sourceChanged) drawLayers(sourceLayers);
      options.dragLayer.drawScene();
      return true;
    },
    clear,
    dispose: () => {
      if (disposed) return;
      clear();
      disposed = true;
      root.destroy();
      options.dragLayer.drawScene();
    },
    isPresenting: () => presenting,
  };
}
