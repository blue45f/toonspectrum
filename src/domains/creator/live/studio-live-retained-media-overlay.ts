/**
 * Append-only live canvas for oil and pencil.
 *
 * Konva `sceneFunc` replans and repaints the whole growing stroke every pointer frame. That is
 * the 90–140ms long task on those families. This surface keeps accepted pixels and paints only
 * the unseen suffix with the same planners the committed renderer uses.
 */

import {
  mapStudioBrushAliasPressureSamples,
  studioBrushAliasEffectiveDiameter,
} from "../brush/studio-brush-alias-profile";
import { resolveStudioCalligraphyRenderTip } from "../brush/studio-calligraphy-nib-profile";
import { planStudioCalligraphyRibbon } from "../brush/studio-calligraphy-ribbon";
import { studioFluidPaintStationSpacingRatio } from "../brush/studio-fluid-paint-reference";
import { studioLiveVisibleTapDocumentRadius } from "../brush/studio-live-visible-tap";
import {
  paintStudioOilRibbonCarrier,
  planStudioOilRibbonCarrier,
  studioOilRibbonProgramsForBrush,
  type StudioOilRibbonPaintContext,
} from "../brush/studio-oil-ribbon-carrier";
import { applyStudioOilWetIntoWetStroke } from "../brush/studio-oil-wet-into-wet";
import { parseStudioGpuColor } from "../render/studio-webgpu-color";
import {
  buildCalligraphySegments,
  resolveStudioBrushRenderFamily,
  resolveStudioFreehandRenderPath,
  strokeRenderDistance,
} from "../studio-brush";
import {
  FX_OIL_DAB_CAP,
  fxBrushSeedFromKey,
  isStudioFxPressureBrushId,
  planOilBrushDabs,
  planStudioFxBrushPressurePath,
  studioOilPaintBodyForBrush,
  studioOilTipProfileForBrush,
} from "../studio-fx-brush";
import {
  planStudioHighlighterWashRibbon,
  planStudioHighlighterWashTap,
  resolveStudioHighlighterWashBrushId,
  traceStudioHighlighterWashDetail,
  traceStudioHighlighterWashPlan,
} from "../studio-highlighter-wash-ribbon";
import {
  acquireStudioLowLatencyCanvas2dContext,
  decideStudioNativeLiveSurfaceResolution,
  type StudioNativeLiveSurfaceResolutionDecision,
} from "../studio-low-latency-canvas";
import { STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1 } from "../studio-material-pressure-model";
import {
  planStudioRetainedMediaPressureCurve,
  planStudioRetainedMediaTapDab,
  resolveStudioRetainedMediaPressureProfileId,
} from "../studio-retained-media-pressure";
import { planStudioRetainedMediaRibbon } from "../studio-retained-media-ribbon";

import { paintStudioLiveRetainedRoundStroke } from "./studio-live-retained-stroke-paint";

import type { DrawEl } from "../studio-element-model";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";

export type StudioLiveRetainedMediaKind =
  | "oil"
  | "pencil"
  | "calligraphy"
  | "highlighter"
  | "eraser";

export type StudioLiveRetainedMediaBeginResult =
  | { readonly status: "started"; readonly kind: StudioLiveRetainedMediaKind }
  | { readonly status: "fallback"; readonly reason: "unsupported" | "surface-unavailable" };

export type StudioLiveRetainedMediaAppendResult =
  | { readonly status: "appended" | "noop" }
  | { readonly status: "fallback"; readonly reason: "surface-unavailable" | "stroke-identity" };

export function studioLiveRetainedMediaOverlaySupportsElement(
  element: DrawEl,
): boolean {
  if ((element.kind ?? "freehand") !== "freehand") return false;
  if (element.mode === "eraser") return true;
  if ((element.mode ?? "pen") !== "pen") return false;
  if (element.fill !== undefined && element.fill !== null) return false;
  const family = resolveStudioBrushRenderFamily(element.brush ?? "pen");
  return family === "oil"
    || family === "pencil"
    || family === "calligraphy"
    || family === "highlighter";
}

function retainedKind(element: DrawEl): StudioLiveRetainedMediaKind | null {
  if (element.mode === "eraser") return "eraser";
  const family = resolveStudioBrushRenderFamily(element.brush ?? "pen");
  return family === "oil"
    || family === "pencil"
    || family === "calligraphy"
    || family === "highlighter"
    ? family
    : null;
}

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pairsFromElement(element: DrawEl): { x: number; y: number }[] {
  const pairs: { x: number; y: number }[] = [];
  const count = Math.floor(element.points.length / 2);
  for (let index = 0; index < count; index += 1) {
    const x = finiteCoordinate(element.points[index * 2]);
    const y = finiteCoordinate(element.points[index * 2 + 1]);
    if (x === null || y === null) break;
    pairs.push({ x, y });
  }
  return pairs;
}

function flatPairs(pairs: readonly { x: number; y: number }[]): number[] {
  const points: number[] = [];
  for (const pair of pairs) points.push(pair.x, pair.y);
  return points;
}

function strokePaintColor(stroke: string): { r: number; g: number; b: number } {
  const parsed = parseStudioGpuColor(stroke);
  if (!parsed) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(parsed[0] * 255),
    g: Math.round(parsed[1] * 255),
    b: Math.round(parsed[2] * 255),
  };
}

interface ActiveRetainedStroke {
  readonly id: string;
  readonly kind: StudioLiveRetainedMediaKind;
  element: DrawEl;
  paintedDabs: number;
  paintedPencilMarks: number;
  paintedSourceSegments: number;
}

export class StudioLiveRetainedMediaOverlayRenderer {
  private activeCanvas: HTMLCanvasElement | null = null;
  private settledCanvas: HTMLCanvasElement | null = null;
  private activeContext: CanvasRenderingContext2D | null = null;
  private settledContext: CanvasRenderingContext2D | null = null;
  private surface: StudioLiveInkSurface | null = null;
  private dpr = 1;
  private resolutionDecision: StudioNativeLiveSurfaceResolutionDecision | null = null;
  private active: ActiveRetainedStroke | null = null;
  private settled: DrawEl[] = [];
  private settledHasPixels = false;
  private activePaintedOntoSettled = false;

  attach(canvases: {
    readonly activeCanvas: HTMLCanvasElement;
    readonly settledCanvas: HTMLCanvasElement;
  } | null): void {
    this.activeCanvas = canvases?.activeCanvas ?? null;
    this.settledCanvas = canvases?.settledCanvas ?? null;
    this.activeContext = this.activeCanvas
      ? acquireStudioLowLatencyCanvas2dContext(this.activeCanvas)
      : null;
    this.settledContext = this.settledCanvas
      ? acquireStudioLowLatencyCanvas2dContext(this.settledCanvas)
      : null;
    this.applySurface();
    if (this.active || this.settled.length > 0) this.replay();
  }

  setSurface(surface: StudioLiveInkSurface | null): void {
    const previous = this.surface;
    this.surface = surface;
    const changed =
      !previous || !surface
      || previous.left !== surface.left
      || previous.top !== surface.top
      || previous.width !== surface.width
      || previous.height !== surface.height
      || previous.documentScale !== surface.documentScale
      || previous.documentWidth !== surface.documentWidth
      || previous.flipX !== surface.flipX;
    if (!changed) return;
    this.applySurface();
    if (this.active || this.settled.length > 0) this.replay();
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  get hasSettledStrokes(): boolean {
    return this.settled.length > 0;
  }

  get settledStrokeCount(): number {
    return this.settled.length;
  }

  get isNativeSurfaceReady(): boolean {
    return this.activeContext !== null
      && this.surface !== null
      && this.resolutionDecision?.ok === true;
  }

  begin(element: DrawEl): StudioLiveRetainedMediaBeginResult {
    if (!studioLiveRetainedMediaOverlaySupportsElement(element)) {
      return { status: "fallback", reason: "unsupported" };
    }
    if (!this.isNativeSurfaceReady) {
      return { status: "fallback", reason: "surface-unavailable" };
    }
    const kind = retainedKind(element);
    if (!kind) return { status: "fallback", reason: "unsupported" };
    if (this.active) {
      this.resetActiveState();
      this.replay();
    }
    this.active = {
      id: element.id,
      kind,
      element,
      paintedDabs: 0,
      paintedPencilMarks: 0,
      paintedSourceSegments: 0,
    };
    this.activePaintedOntoSettled = false;
    const painted = this.paintSuffix(this.active, element, this.activeContext);
    if (!painted) {
      this.resetActiveState();
      return { status: "fallback", reason: "surface-unavailable" };
    }
    return { status: "started", kind };
  }

  appendFrom(element: DrawEl): StudioLiveRetainedMediaAppendResult {
    const active = this.active;
    if (!active) return { status: "fallback", reason: "surface-unavailable" };
    if (element.id !== active.id || retainedKind(element) !== active.kind) {
      return { status: "fallback", reason: "stroke-identity" };
    }
    if (!this.isNativeSurfaceReady) {
      return { status: "fallback", reason: "surface-unavailable" };
    }
    active.element = element;
    const before = active.paintedDabs + active.paintedPencilMarks + active.paintedSourceSegments;
    if (!this.paintSuffix(active, element, this.activeContext)) {
      return { status: "fallback", reason: "surface-unavailable" };
    }
    const after = active.paintedDabs + active.paintedPencilMarks + active.paintedSourceSegments;
    return { status: after > before ? "appended" : "noop" };
  }

  end(element: DrawEl): { readonly status: "settled" | "fallback" } {
    if (!this.active || !this.isNativeSurfaceReady) return { status: "fallback" };
    this.active.element = element;
    if (this.active.kind === "highlighter") {
      this.clearCanvas(this.activeContext, this.activeCanvas);
      const fullActive: ActiveRetainedStroke = {
        id: element.id,
        kind: this.active.kind,
        element,
        paintedDabs: 0,
        paintedPencilMarks: 0,
        paintedSourceSegments: 0,
      };
      if (!this.paintSuffix(fullActive, element, this.activeContext)) {
        return { status: "fallback" };
      }
    } else {
      const appended = this.appendFrom(element);
      if (appended.status === "fallback") return { status: "fallback" };
    }
    if (!this.activePaintedOntoSettled && !this.flattenActiveToSettled()) {
      return { status: "fallback" };
    }
    this.settled.push(this.active.element);
    this.resetActiveState();
    this.clearActiveRect();
    return { status: "settled" };
  }

  releaseSettledPrefix(count: number): number {
    const requested = count === Number.POSITIVE_INFINITY
      ? this.settled.length
      : Number.isFinite(count)
        ? Math.max(0, Math.floor(count))
        : 0;
    const released = Math.min(requested, this.settled.length);
    if (released === 0) return 0;
    this.settled = this.settled.slice(released);
    this.replay();
    return released;
  }

  resetActive(): boolean {
    if (!this.active) return false;
    this.resetActiveState();
    this.replay();
    return true;
  }

  hideSettledPixels(): boolean {
    if (this.settled.length === 0 && !this.settledHasPixels) return false;
    this.clearCanvas(this.settledContext, this.settledCanvas);
    return true;
  }

  showSettledPixels(): boolean {
    if (this.settled.length === 0) return false;
    this.replaySettledOnly();
    return true;
  }

  clear(): void {
    this.resetActiveState();
    this.settled = [];
    this.clearActiveRect();
    this.clearSettledRect();
  }

  private paintSuffix(
    active: ActiveRetainedStroke,
    element: DrawEl,
    target: CanvasRenderingContext2D | null,
  ): boolean {
    if (active.kind === "oil") return this.paintOilSuffix(active, element, target);
    if (active.kind === "pencil") return this.paintPencilSuffix(active, element, target);
    if (active.kind === "calligraphy") {
      return this.paintCalligraphySuffix(active, element, target);
    }
    if (active.kind === "eraser") return this.paintEraserSuffix(active, element, target);
    return this.paintHighlighterSuffix(active, element, target);
  }

  private paintOilSuffix(
    active: ActiveRetainedStroke,
    element: DrawEl,
    target: CanvasRenderingContext2D | null,
  ): boolean {
    const context = this.prepared(target);
    if (!context) return false;
    try {
      const pairs = pairsFromElement(element);
      if (pairs.length === 0) return true;
      const brush = element.brush ?? "oil";
      const dabs = planOilBrushDabs({
        points: flatPairs(pairs),
        pressures: element.pressures,
        baseWidth: Math.max(1, element.strokeWidth),
        seed: fxBrushSeedFromKey(element.id),
        maxDabs: FX_OIL_DAB_CAP,
        paintBody: studioOilPaintBodyForBrush(brush),
        tipProfile: studioOilTipProfileForBrush(brush),
        stationSpacingRatio: studioFluidPaintStationSpacingRatio(brush),
      });
      if (dabs.length === 0) return true;
      const newDabs = dabs.slice(active.paintedDabs);
      const radiusPx = Math.max(
        1,
        dabs.reduce((sum, dab) => sum + dab.radiusY, 0) / Math.max(1, dabs.length),
      );
      if (newDabs.length > 0 && target === this.activeContext) {
        this.wetMixPoints(
          context,
          newDabs.map((dab) => ({ x: dab.x, y: dab.y })),
          radiusPx,
          element.stroke,
        );
      }
      if (target === this.activeContext) {
        this.clearCanvas(this.activeContext, this.activeCanvas);
      }
      const carrier = planStudioOilRibbonCarrier(
        dabs,
        studioOilRibbonProgramsForBrush(
          brush,
          fxBrushSeedFromKey(element.id),
          element.brushEnginePrograms?.oil,
        ),
      );
      paintStudioOilRibbonCarrier(
        context as unknown as StudioOilRibbonPaintContext,
        {
          carrier,
          stroke: element.stroke,
          opacity: element.opacity ?? 1,
          points: dabs.map((dab) => ({ x: dab.x, y: dab.y })),
          radiusPx,
          skipDestinationReadback: true,
        },
      );
      active.paintedDabs = dabs.length;
      if (target === this.settledContext) this.settledHasPixels = true;
      return true;
    } finally {
      context.restore();
    }
  }

  private paintPencilSuffix(
    active: ActiveRetainedStroke,
    element: DrawEl,
    target: CanvasRenderingContext2D | null,
  ): boolean {
    const context = this.prepared(target);
    if (!context) return false;
    try {
      const pairs = pairsFromElement(element);
      if (pairs.length === 0) return true;
      const brush = element.brush ?? "pencil";
      const width = studioBrushAliasEffectiveDiameter(brush, Math.max(1, element.strokeWidth));
      const profile = resolveStudioRetainedMediaPressureProfileId(brush) ?? "pencil";
      const tap = planStudioRetainedMediaTapDab(
        flatPairs(pairs),
        element.pressures,
        profile,
        { minimumDiameterRatio: element.materialMinimumDiameterRatio },
      );
      if (tap && active.paintedSourceSegments === 0 && active.paintedPencilMarks === 0) {
        const scale = this.surface?.documentScale ?? 1;
        const radius = studioLiveVisibleTapDocumentRadius(
          Math.max(0.35, width * tap.sizeScale / 2),
          scale,
        );
        context.globalCompositeOperation = "source-over";
        context.fillStyle = element.stroke;
        context.globalAlpha = Math.min(
          1,
          (element.opacity ?? 1)
          * Math.sqrt(tap.opacityScale * tap.flowScale),
        );
        context.beginPath();
        context.arc(tap.x, tap.y, radius, 0, Math.PI * 2);
        context.fill();
        active.paintedPencilMarks = 1;
        return true;
      }
      if (tap) return true;
      const curve = planStudioRetainedMediaPressureCurve(
        flatPairs(pairs),
        element.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
          ? element.pressures
          : undefined,
        profile,
        { minimumDiameterRatio: element.materialMinimumDiameterRatio },
      );
      const ribbon = planStudioRetainedMediaRibbon(curve, Math.max(0.5, width));
      const startSegment = active.paintedSourceSegments === 0
        ? 0
        : Math.max(0, active.paintedSourceSegments - 1);
      const paintMark = (
        points: readonly number[],
        opacityScale: number,
        flowScale: number,
        inherited: number,
      ) => {
        const [firstX, firstY, ...rest] = points;
        if (firstX === undefined || firstY === undefined) return;
        context.globalAlpha = inherited * Math.min(
          1,
          (element.opacity ?? 1) * Math.sqrt(opacityScale * flowScale),
        );
        context.beginPath();
        context.moveTo(firstX, firstY);
        for (let offset = 0; offset < rest.length; offset += 2) {
          const x = rest[offset];
          const y = rest[offset + 1];
          if (x === undefined || y === undefined) break;
          context.lineTo(x, y);
        }
        context.closePath();
        context.fill();
      };
      context.fillStyle = element.stroke;
      context.strokeStyle = element.stroke;
      const inherited = context.globalAlpha;
      let paintedCells = 0;
      for (const run of ribbon.runs) {
        for (const cell of run.cells) {
          if (cell.sourceSegmentIndex < startSegment) continue;
          paintMark(cell.points, cell.opacityScale, cell.flowScale, inherited);
          paintedCells += 1;
        }
        for (const cap of run.caps) {
          if (cap.role === "start" && active.paintedSourceSegments > 0) continue;
          if (cap.role === "end" && paintedCells === 0) continue;
          paintMark(cap.points, cap.opacityScale, cap.flowScale, inherited);
        }
      }
      if (pairs.length >= 2) {
        const from = active.paintedSourceSegments === 0
          ? 0
          : Math.min(active.paintedSourceSegments, pairs.length - 1);
        if (from < pairs.length - 1 || from === 0) {
          const liveWidth = 2 * studioLiveVisibleTapDocumentRadius(
            Math.max(0.35, width / 2),
            this.surface?.documentScale ?? 1,
          );
          context.globalAlpha = inherited * Math.min(1, element.opacity ?? 1);
          context.lineWidth = liveWidth;
          context.beginPath();
          context.moveTo(pairs[from]!.x, pairs[from]!.y);
          for (let index = from + 1; index < pairs.length; index += 1) {
            context.lineTo(pairs[index]!.x, pairs[index]!.y);
          }
          context.stroke();
        }
      }
      active.paintedSourceSegments = curve.segments.length;
      active.paintedPencilMarks = Math.max(active.paintedPencilMarks, paintedCells + 1);
      return true;
    } finally {
      context.restore();
    }
  }

  private paintCalligraphySuffix(
    active: ActiveRetainedStroke,
    element: DrawEl,
    target: CanvasRenderingContext2D | null,
  ): boolean {
    const context = this.prepared(target);
    if (!context) return false;
    try {
      const pairs = pairsFromElement(element);
      if (pairs.length === 0) return true;
      const brush = element.brush ?? "calligraphy";
      const width = studioBrushAliasEffectiveDiameter(brush, Math.max(1, element.strokeWidth));
      if (pairs.length === 1) {
        if (active.paintedSourceSegments > 0 || active.paintedPencilMarks > 0) return true;
        const radius = studioLiveVisibleTapDocumentRadius(
          Math.max(0.5, width * 0.18),
          this.surface?.documentScale ?? 1,
        );
        context.fillStyle = element.stroke;
        context.globalAlpha = Math.min(1, element.opacity ?? 1);
        context.beginPath();
        context.arc(pairs[0]!.x, pairs[0]!.y, radius, 0, Math.PI * 2);
        context.fill();
        active.paintedPencilMarks = 1;
        active.paintedSourceSegments = 1;
        return true;
      }
      const stylus = pairs.map((_, index) => ({
        pointerType: "pen" as const,
        tiltX: element.tiltXs?.[index],
        tiltY: element.tiltYs?.[index],
        twist: element.twists?.[index],
      }));
      const segments = buildCalligraphySegments(
        flatPairs(pairs),
        mapStudioBrushAliasPressureSamples(
          brush,
          element.pressures,
          pairs.length,
          0.5,
        ),
        stylus,
        width,
        resolveStudioCalligraphyRenderTip(brush, element.brushTip),
      );
      const start = active.paintedSourceSegments === 0
        ? 0
        : Math.max(0, active.paintedSourceSegments - 1);
      const ribbon = planStudioCalligraphyRibbon(segments.slice(start));
      context.fillStyle = element.stroke;
      context.globalAlpha = Math.min(1, element.opacity ?? 1);
      for (const run of ribbon.runs) this.fillOutline(context, run.outlinePoints);
      active.paintedSourceSegments = segments.length;
      active.paintedPencilMarks = Math.max(active.paintedPencilMarks, 1);
      return true;
    } finally {
      context.restore();
    }
  }

  private paintHighlighterSuffix(
    active: ActiveRetainedStroke,
    element: DrawEl,
    target: CanvasRenderingContext2D | null,
  ): boolean {
    const ontoSettled = this.settledHasPixels && target === this.settledContext;
    const context = this.prepared(ontoSettled ? this.settledContext : target);
    if (!context) return false;
    try {
      const pairs = pairsFromElement(element);
      if (pairs.length === 0) return true;
      const brush = element.brush ?? "highlighter";
      const width = studioBrushAliasEffectiveDiameter(brush, Math.max(1, element.strokeWidth));
      const brushId = resolveStudioHighlighterWashBrushId(brush);
      if (target === this.activeContext) {
        this.clearCanvas(this.activeContext, this.activeCanvas);
      }
      const composite = ontoSettled ? "multiply" : "source-over";
      context.globalCompositeOperation = composite;
      context.fillStyle = element.stroke;
      if (pairs.length === 1) {
        const tap = planStudioHighlighterWashTap({
          brushId,
          x: pairs[0]!.x,
          y: pairs[0]!.y,
          width,
          opacityScale: element.opacity ?? 1,
        });
        context.globalAlpha = Math.min(1, (element.opacity ?? 1) * tap.opacityScale);
        context.beginPath();
        traceStudioHighlighterWashPlan(context, tap);
        context.fill();
        active.paintedPencilMarks = 1;
        active.paintedSourceSegments = 1;
        this.markSettledPaint(ontoSettled, context);
        return true;
      }
      const renderPath = resolveStudioFreehandRenderPath(flatPairs(pairs), {
        sampleSpacing: element.sampleSpacing,
        acceptedTension: 0.35,
        legacyMinDistance: strokeRenderDistance(element.sampleSpacing),
        legacyTension: 0.35,
      });
      const pressurePath = planStudioFxBrushPressurePath({
        brushId: isStudioFxPressureBrushId(brush) ? brush : "highlighter",
        points: renderPath.points,
        pressures: element.pressures,
        pressureModel: element.materialPressureModel,
        minimumDiameterRatio: element.materialMinimumDiameterRatio,
        tension: renderPath.tension,
      });
      const wash = planStudioHighlighterWashRibbon({
        brushId,
        pressurePath,
        baseWidth: width,
      });
      const washAlpha = Math.min(1, (element.opacity ?? 1) * wash.opacityScale);
      context.globalAlpha = washAlpha;
      context.beginPath();
      traceStudioHighlighterWashPlan(context, wash);
      context.fill();
      if (wash.detailRuns.length > 0) {
        context.globalAlpha = washAlpha * wash.detailOpacityScale;
        context.beginPath();
        traceStudioHighlighterWashDetail(context, wash);
        context.fill();
      }
      active.paintedSourceSegments = pairs.length;
      active.paintedPencilMarks = Math.max(active.paintedPencilMarks, 1);
      this.markSettledPaint(ontoSettled, context);
      return true;
    } finally {
      context.restore();
    }
  }

  private paintEraserSuffix(
    active: ActiveRetainedStroke,
    element: DrawEl,
    target: CanvasRenderingContext2D | null,
  ): boolean {
    const context = this.prepared(target);
    if (!context) return false;
    try {
      const pairs = pairsFromElement(element);
      if (pairs.length === 0) return true;
      const width = Math.max(1, element.strokeWidth);
      const start = active.paintedSourceSegments === 0
        ? 0
        : Math.max(0, active.paintedSourceSegments - 1);
      paintStudioLiveRetainedRoundStroke(
        context,
        pairs,
        start,
        {
          stroke: "rgba(0,0,0,1)",
          width: Math.max(
            width,
            2 * studioLiveVisibleTapDocumentRadius(width / 2, this.surface?.documentScale ?? 1),
          ),
          opacity: 1,
          composite: "destination-out",
        },
      );
      active.paintedSourceSegments = pairs.length;
      active.paintedPencilMarks = Math.max(active.paintedPencilMarks, 1);
      return true;
    } finally {
      context.restore();
    }
  }

  private markSettledPaint(
    ontoSettled: boolean,
    context: CanvasRenderingContext2D,
  ): void {
    if (ontoSettled || context === this.settledContext) {
      this.settledHasPixels = true;
      this.activePaintedOntoSettled = true;
    }
  }

  private fillOutline(
    context: CanvasRenderingContext2D,
    points: readonly number[],
  ): void {
    const [firstX, firstY, ...rest] = points;
    if (firstX === undefined || firstY === undefined) return;
    context.beginPath();
    context.moveTo(firstX, firstY);
    for (let offset = 0; offset < rest.length; offset += 2) {
      const x = rest[offset];
      const y = rest[offset + 1];
      if (x === undefined || y === undefined) break;
      context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  }

  private wetMixPoints(
    context: CanvasRenderingContext2D,
    points: readonly { x: number; y: number }[],
    radiusPx: number,
    stroke: string,
  ): boolean {
    if (points.length === 0) return false;
    const native = context;
    const canvas = native.canvas;
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return false;
    const transform = native.getTransform();
    const pad = Math.ceil(radiusPx + 2);
    let minX = points[0]!.x;
    let minY = points[0]!.y;
    let maxX = minX;
    let maxY = minY;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const map = (x: number, y: number) => ({
      x: transform.a * x + transform.c * y + transform.e,
      y: transform.b * x + transform.d * y + transform.f,
    });
    const corners = [
      map(minX - pad, minY - pad),
      map(maxX + pad, minY - pad),
      map(minX - pad, maxY + pad),
      map(maxX + pad, maxY + pad),
    ];
    const devMinX = Math.max(0, Math.floor(Math.min(...corners.map((corner) => corner.x))));
    const devMinY = Math.max(0, Math.floor(Math.min(...corners.map((corner) => corner.y))));
    const devMaxX = Math.min(
      canvas.width,
      Math.ceil(Math.max(...corners.map((corner) => corner.x))),
    );
    const devMaxY = Math.min(
      canvas.height,
      Math.ceil(Math.max(...corners.map((corner) => corner.y))),
    );
    const width = devMaxX - devMinX;
    const height = devMaxY - devMinY;
    if (width <= 0 || height <= 0) return false;
    try {
      const image = native.getImageData(devMinX, devMinY, width, height);
      applyStudioOilWetIntoWetStroke(
        image.data,
        width,
        height,
        points.map((point) => {
          const mapped = map(point.x, point.y);
          return { x: mapped.x - devMinX, y: mapped.y - devMinY };
        }),
        {
          radiusPx,
          hardness: 0.68,
          strength: 0.82,
          wetness: 0.62,
          pickup: 0.48,
          loadDepletion: 0,
          paintColor: strokePaintColor(stroke),
        },
      );
      native.putImageData(image, devMinX, devMinY);
      return true;
    } catch {
      return false;
    }
  }

  private flattenActiveToSettled(): boolean {
    const context = this.settledContext;
    const canvas = this.activeCanvas;
    if (!context || !canvas) return false;
    try {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = this.active?.kind === "highlighter" && this.settledHasPixels
        ? "multiply"
        : "source-over";
      context.globalAlpha = 1;
      context.drawImage(canvas, 0, 0);
      context.restore();
      this.settledHasPixels = true;
      return true;
    } catch {
      return false;
    }
  }

  private replaySettledOnly(): void {
    this.clearCanvas(this.settledContext, this.settledCanvas);
    this.settledHasPixels = false;
    if (!this.isNativeSurfaceReady) return;
    for (const stroke of this.settled) {
      const kind = retainedKind(stroke);
      if (!kind) continue;
      this.paintSuffix({
        id: stroke.id,
        kind,
        element: stroke,
        paintedDabs: 0,
        paintedPencilMarks: 0,
        paintedSourceSegments: 0,
      }, stroke, this.settledContext);
    }
  }

  private replay(): void {
    this.clearActiveRect();
    this.clearSettledRect();
    if (!this.isNativeSurfaceReady) return;
    for (const stroke of this.settled) {
      const kind = retainedKind(stroke);
      if (!kind) continue;
      this.paintSuffix({
        id: stroke.id,
        kind,
        element: stroke,
        paintedDabs: 0,
        paintedPencilMarks: 0,
        paintedSourceSegments: 0,
      }, stroke, this.settledContext);
    }
    if (!this.active) return;
    const replayActive: ActiveRetainedStroke = {
      ...this.active,
      paintedDabs: 0,
      paintedPencilMarks: 0,
      paintedSourceSegments: 0,
    };
    this.paintSuffix(replayActive, this.active.element, this.activeContext);
    this.active.paintedDabs = replayActive.paintedDabs;
    this.active.paintedPencilMarks = replayActive.paintedPencilMarks;
    this.active.paintedSourceSegments = replayActive.paintedSourceSegments;
  }

  private prepared(
    context: CanvasRenderingContext2D | null,
  ): CanvasRenderingContext2D | null {
    const surface = this.surface;
    if (!context || !surface || !this.isNativeSurfaceReady) return null;
    const k = this.dpr * surface.documentScale;
    context.save();
    if (surface.flipX) {
      context.setTransform(
        -k,
        0,
        0,
        k,
        (surface.documentWidth * surface.documentScale - surface.left) * this.dpr,
        -surface.top * this.dpr,
      );
    } else {
      context.setTransform(k, 0, 0, k, -surface.left * this.dpr, -surface.top * this.dpr);
    }
    context.lineCap = "round";
    context.lineJoin = "round";
    context.globalCompositeOperation = "source-over";
    return context;
  }

  private applySurface(): void {
    const surface = this.surface;
    const decision = surface
      ? decideStudioNativeLiveSurfaceResolution({
          cssWidth: surface.width,
          cssHeight: surface.height,
          devicePixelRatio: typeof globalThis.devicePixelRatio === "number"
            ? globalThis.devicePixelRatio
            : 1,
        })
      : null;
    this.resolutionDecision = decision;
    for (const canvas of [this.activeCanvas, this.settledCanvas]) {
      if (!canvas) continue;
      if (!decision || !decision.ok) {
        canvas.width = 1;
        canvas.height = 1;
        continue;
      }
      if (canvas.width !== decision.backingWidth) canvas.width = decision.backingWidth;
      if (canvas.height !== decision.backingHeight) canvas.height = decision.backingHeight;
    }
    this.dpr = decision?.ok ? decision.devicePixelRatio : 1;
    if (!decision?.ok) this.resetActiveState();
  }

  private resetActiveState(): void {
    this.active = null;
    this.activePaintedOntoSettled = false;
  }

  private clearActiveRect(): void {
    this.clearCanvas(this.activeContext, this.activeCanvas);
  }

  private clearSettledRect(): void {
    this.settledHasPixels = false;
    this.clearCanvas(this.settledContext, this.settledCanvas);
  }

  private clearCanvas(
    context: CanvasRenderingContext2D | null,
    canvas: HTMLCanvasElement | null,
  ): void {
    if (!context || !canvas) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
}
