import {
  STUDIO_BRUSH_RENDER_FAMILY,
  resolveStudioBrushRenderFamily,
  type StudioBrushRenderFamily,
} from "./studio-brush";
import {
  resolveStudioCapturedBrushDynamicsPresetId,
} from "./studio-brush-dynamics";
import { resolveStudioStampBrushKind } from "./studio-brush-stamp-engine";
import { isStudioPixelPencilRenderMode } from "./studio-pixel-pencil";
import { isStudioStrokePaintModelCompatible } from "./studio-stroke-paint-model";
import {
  DEFAULT_SHAPE_PARAMS,
  normalizeShapeParams,
  polygonPathPointsInBounds,
} from "./studio-stroke-shapes";

import type { DrawEl } from "./studio-element-model";
import type { QuickShapeKind } from "./studio-quickshape";

export type StudioSmartShapeBrushEffectFallbackReason =
  | "missing-source"
  | "eraser"
  | "pixel"
  | "causal-stamp"
  | "causal-watercolor"
  | "unknown-brush"
  | "invalid-geometry";

export type StudioSmartShapeBrushEffectResult =
  | {
      readonly status: "applied";
      readonly renderFamily: StudioBrushRenderFamily;
      readonly stroke: DrawEl;
    }
  | {
      readonly status: "fallback";
      readonly reason: StudioSmartShapeBrushEffectFallbackReason;
      readonly stroke: DrawEl;
    };

const MAX_ELLIPSE_OUTLINE_SAMPLES = 512;
const MIN_ELLIPSE_OUTLINE_SAMPLES = 32;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function bounds(points: readonly number[]) {
  const x0 = points[0]!;
  const y0 = points[1]!;
  const x1 = points[2]!;
  const y1 = points[3]!;
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

function closed(points: readonly number[]): number[] {
  return points.length >= 2 ? [...points, points[0]!, points[1]!] : [];
}

function ellipseOutline(
  left: number,
  top: number,
  width: number,
  height: number,
  strokeWidth: number,
): number[] {
  const rx = width / 2;
  const ry = height / 2;
  const cx = left + rx;
  const cy = top + ry;
  const circumference = Math.PI * (
    3 * (rx + ry) - Math.sqrt(Math.max(0, (3 * rx + ry) * (rx + 3 * ry)))
  );
  const targetSegmentLength = Math.min(8, Math.max(2, strokeWidth * 0.5));
  const count = Math.min(
    MAX_ELLIPSE_OUTLINE_SAMPLES,
    Math.max(MIN_ELLIPSE_OUTLINE_SAMPLES, Math.ceil(circumference / targetSegmentLength)),
  );
  const points: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    points.push(round2(cx + Math.cos(angle) * rx), round2(cy + Math.sin(angle) * ry));
  }
  return closed(points);
}

/**
 * Converts the retained geometric primitive into the same point contract consumed by every
 * freehand Canvas/SVG brush renderer. The closing sample is explicit so causal round-dab ink and
 * vector export seal the same final edge instead of relying on a renderer-specific `closed` flag.
 */
export function studioSmartShapeBrushOutline(
  kind: QuickShapeKind,
  points: readonly number[],
  strokeWidth: number,
  shapeParams: DrawEl["shapeParams"],
): number[] | null {
  if (
    points.length < 4
    || points.slice(0, 4).some((value) => !Number.isFinite(value))
  ) return null;
  if (kind === "line") return points.slice(0, 4);

  const box = bounds(points);
  if (box.width <= 0 || box.height <= 0) return null;
  if (kind === "rect") {
    return closed([
      box.left,
      box.top,
      box.left + box.width,
      box.top,
      box.left + box.width,
      box.top + box.height,
      box.left,
      box.top + box.height,
    ]);
  }
  if (kind === "ellipse") {
    return ellipseOutline(box.left, box.top, box.width, box.height, Math.max(1, strokeWidth));
  }

  const params = normalizeShapeParams(shapeParams ?? DEFAULT_SHAPE_PARAMS);
  const sides = kind === "triangle" ? 3 : params.polygonSides;
  return closed(polygonPathPointsInBounds(
    box.left,
    box.top,
    box.width,
    box.height,
    sides,
  ));
}

function resampleChannel(
  source: readonly number[] | undefined,
  count: number,
  fallback: number,
): number[] | undefined {
  if (!source || source.length === 0) return undefined;
  if (source.length === 1) {
    const value = Number.isFinite(source[0]) ? source[0]! : fallback;
    return Array.from({ length: count }, () => value);
  }
  return Array.from({ length: count }, (_, index) => {
    const position = count <= 1 ? 0 : (index / (count - 1)) * (source.length - 1);
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(source.length - 1, leftIndex + 1);
    const left = Number.isFinite(source[leftIndex]) ? source[leftIndex]! : fallback;
    const right = Number.isFinite(source[rightIndex]) ? source[rightIndex]! : left;
    return left + (right - left) * (position - leftIndex);
  });
}

/** Removes brush-only replay fields when a requested effect cannot safely be reconstructed. */
export function stripStudioSmartShapeBrushEffect(stroke: DrawEl): DrawEl {
  return {
    ...stroke,
    brush: undefined,
    brushCatalogId: undefined,
    brushCatalogName: undefined,
    pressures: undefined,
    pressureModel: undefined,
    materialPressureModel: undefined,
    materialMinimumDiameterRatio: undefined,
    sampleSpacing: undefined,
    tiltXs: undefined,
    tiltYs: undefined,
    twists: undefined,
    speeds: undefined,
    tangentialPressures: undefined,
    brushDynamics: undefined,
    brushTip: undefined,
    stamp: undefined,
    stampPipeline: undefined,
    watercolorPipeline: undefined,
    paintModel: undefined,
  };
}

function fallback(
  stroke: DrawEl,
  reason: StudioSmartShapeBrushEffectFallbackReason,
): StudioSmartShapeBrushEffectResult {
  return { status: "fallback", reason, stroke: stripStudioSmartShapeBrushEffect(stroke) };
}

/**
 * Applies a selected brush only when Canvas/Konva and SVG already share a real freehand renderer.
 * Prefix-causal stamp/watercolor strokes cannot be re-routed: their persisted samples describe the
 * original hand gesture, not the snapped outline. They deliberately fall back to a plain shape.
 */
export function applyStudioSmartShapeBrushEffect(
  geometricStroke: DrawEl,
  sourceStroke: DrawEl | null | undefined,
): StudioSmartShapeBrushEffectResult {
  if (!sourceStroke) return fallback(geometricStroke, "missing-source");
  if (sourceStroke.mode === "eraser") return fallback(geometricStroke, "eraser");
  if (isStudioPixelPencilRenderMode(sourceStroke.brush)) {
    return fallback(geometricStroke, "pixel");
  }
  if (sourceStroke.stampPipeline === "causal-walker-v2") {
    return fallback(geometricStroke, "causal-stamp");
  }
  if (sourceStroke.watercolorPipeline === "causal-walker-v2") {
    return fallback(geometricStroke, "causal-watercolor");
  }

  const brush = sourceStroke.brush ?? "pen";
  const knownBrush = Object.prototype.hasOwnProperty.call(STUDIO_BRUSH_RENDER_FAMILY, brush)
    || resolveStudioCapturedBrushDynamicsPresetId(sourceStroke) !== null
    || resolveStudioStampBrushKind(brush) !== null;
  if (!knownBrush) return fallback(geometricStroke, "unknown-brush");

  const kind = geometricStroke.kind;
  if (
    kind !== "line"
    && kind !== "rect"
    && kind !== "ellipse"
    && kind !== "triangle"
    && kind !== "polygon"
  ) return fallback(geometricStroke, "invalid-geometry");
  const outline = studioSmartShapeBrushOutline(
    kind,
    geometricStroke.points,
    geometricStroke.strokeWidth,
    geometricStroke.shapeParams,
  );
  if (!outline) return fallback(geometricStroke, "invalid-geometry");

  const sampleCount = outline.length / 2;
  const family = resolveStudioBrushRenderFamily(brush);
  const dynamic = resolveStudioCapturedBrushDynamicsPresetId(sourceStroke) !== null;
  const calligraphy = family === "calligraphy";
  const stamp = resolveStudioStampBrushKind(brush) !== null;
  let applied: DrawEl = {
    ...geometricStroke,
    kind: "freehand",
    points: outline,
    fill: undefined,
    gradient: undefined,
    pattern: undefined,
    strokeStyle: undefined,
    shapeParams: undefined,
    brush,
    brushCatalogId: sourceStroke.brushCatalogId,
    brushCatalogName: sourceStroke.brushCatalogName,
    pressures: resampleChannel(sourceStroke.pressures, sampleCount, 0.5),
    pressureModel: sourceStroke.pressureModel,
    materialPressureModel: sourceStroke.materialPressureModel,
    materialMinimumDiameterRatio: sourceStroke.materialMinimumDiameterRatio,
    sampleSpacing: sourceStroke.sampleSpacing,
    tiltXs: calligraphy || dynamic
      ? resampleChannel(sourceStroke.tiltXs, sampleCount, 0)
      : undefined,
    tiltYs: calligraphy || dynamic
      ? resampleChannel(sourceStroke.tiltYs, sampleCount, 0)
      : undefined,
    twists: calligraphy || dynamic
      ? resampleChannel(sourceStroke.twists, sampleCount, 0)
      : undefined,
    speeds: dynamic ? resampleChannel(sourceStroke.speeds, sampleCount, 0) : undefined,
    tangentialPressures: dynamic
      ? resampleChannel(sourceStroke.tangentialPressures, sampleCount, 0)
      : undefined,
    brushDynamics: dynamic ? sourceStroke.brushDynamics : undefined,
    brushTip: calligraphy ? sourceStroke.brushTip : undefined,
    stamp: stamp ? sourceStroke.stamp : undefined,
    stampPipeline: undefined,
    watercolorPipeline: undefined,
    paintModel: sourceStroke.paintModel,
  };
  if (!isStudioStrokePaintModelCompatible(applied)) {
    applied = { ...applied, paintModel: undefined };
  }
  return { status: "applied", renderFamily: family, stroke: applied };
}
