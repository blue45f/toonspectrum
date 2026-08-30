/**
 * Append-only live canvas for oil and pencil.
 *
 * Konva `sceneFunc` replans and repaints the whole growing stroke every pointer frame. That is
 * the 90–140ms long task on those families. This surface keeps accepted pixels and paints only
 * the unseen suffix with the same planners the committed renderer uses.
 */

import {
  mapStudioBrushAliasPressure,
  studioBrushAliasEffectiveDiameter,
} from "../brush/studio-brush-alias-profile";
import { resolveStudioCalligraphyRenderTip } from "../brush/studio-calligraphy-nib-profile";
import { planStudioCalligraphyRibbon } from "../brush/studio-calligraphy-ribbon";
import { studioFluidPaintStationSpacingRatio } from "../brush/studio-fluid-paint-reference";
import { studioLiveVisibleTapDocumentRadius } from "../brush/studio-live-visible-tap";
import {
  StudioOilRibbonCarrierPlanner,
  paintStudioOilRibbonCarrier,
  planStudioOilRibbonCarrier,
  studioOilRibbonProgramsForBrush,
  type StudioOilRibbonPaintContext,
} from "../brush/studio-oil-ribbon-carrier";
import { isStudioBoundedFlowPaintModelCompatible } from "../brush/studio-stroke-paint-model";
import {
  createStudioIncrementalCalligraphySegmentBuilder,
  resolveStudioBrushRenderFamily,
  resolveStudioFreehandRenderPath,
  strokeRenderDistance,
  type StudioIncrementalCalligraphySegmentBuilder,
} from "../studio-brush";
import {
  FX_OIL_DAB_CAP,
  FxOilDabPlanner,
  createStudioIncrementalFxPressurePathBuilder,
  fxBrushSeedFromKey,
  isStudioFxPressureBrushId,
  planOilBrushDabs,
  studioOilPaintBodyForBrush,
  studioOilTipProfileForBrush,
  type StudioIncrementalFxPressurePathBuilder,
} from "../studio-fx-brush";
import {
  createStudioIncrementalHighlighterWashRibbonBuilder,
  planStudioHighlighterWashTap,
  resolveStudioHighlighterWashBrushId,
  traceStudioHighlighterWashDetail,
  traceStudioHighlighterWashPlan,
  type StudioIncrementalHighlighterWashRibbonBuilder,
} from "../studio-highlighter-wash-ribbon";
import {
  acquireStudioLowLatencyCanvas2dContext,
  decideStudioNativeLiveSurfaceResolution,
  type StudioNativeLiveSurfaceResolutionDecision,
} from "../studio-low-latency-canvas";
import { STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1 } from "../studio-material-pressure-model";
import {
  createStudioIncrementalRetainedMediaCurveBuilder,
  planStudioRetainedMediaTapDab,
  resolveStudioRetainedMediaPressureProfileId,
  type StudioIncrementalRetainedMediaCurveBuilder,
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
  // bounded-flow-v2 다이내믹 획은 다이내믹 오버레이가 커밋과 동일한 dab 플랜으로 그린다.
  // 이 오버레이가 패밀리만 보고 가로채면 라이브가 일반 캐리어(균일 실선)로 그려져 커밋과
  // 갈라진다 — 장경로 실측: erodible-pencil energy 0.35 붕괴 + 79px 라이브 전용 시작원,
  // oil--knife-edge 1307px 라이브 전용 시작원. 입장 체인에서 이 판정이 다이내믹보다 먼저
  // 평가되므로 여기서 명시적으로 양보해야 한다.
  if (isStudioBoundedFlowPaintModelCompatible(element)) return false;
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

/**
 * `pairsFromElement` + `flatPairs` without the intermediate object array: the oil hot path ran
 * both on every pointer frame, allocating O(N) `{x,y}` objects per frame over one drag. Same
 * finite-validation semantics — stop at the first non-finite coordinate.
 */
function flatFinitePoints(element: DrawEl): number[] {
  const points: number[] = [];
  const count = Math.floor(element.points.length / 2);
  for (let index = 0; index < count; index += 1) {
    const x = element.points[index * 2];
    const y = element.points[index * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) break;
    points.push(x, y);
  }
  return points;
}

/**
 * Extends the running dab-radius mean to cover `dabs` and returns it. Addition stays strictly
 * left-to-right across frames, so the value is bit-identical to reducing the whole array every
 * call while costing O(new dabs) instead of O(all dabs) per pointer frame.
 */
function extendOilRadiusMean(
  active: ActiveRetainedStroke,
  dabs: readonly { radiusY: number }[],
): number {
  if (
    active.oilRadiusSum === undefined
    || active.oilRadiusSumDabCount === undefined
    || active.oilRadiusSumDabCount > dabs.length
  ) {
    let sum = 0;
    for (let index = 0; index < active.paintedDabs; index += 1) {
      sum += dabs[index]!.radiusY;
    }
    active.oilRadiusSum = sum;
    active.oilRadiusSumDabCount = active.paintedDabs;
  }
  for (
    let index = active.oilRadiusSumDabCount;
    index < dabs.length;
    index += 1
  ) {
    active.oilRadiusSum += dabs[index]!.radiusY;
  }
  active.oilRadiusSumDabCount = dabs.length;
  return Math.max(1, active.oilRadiusSum / Math.max(1, dabs.length));
}

/** Reuses the per-frame dab point objects across carrier paints instead of re-mapping. */
function oilDabPoints(
  active: ActiveRetainedStroke,
  dabs: readonly { x: number; y: number }[],
): readonly { x: number; y: number }[] {
  const cached = active.oilDabPoints;
  if (
    cached
    && cached.length === dabs.length
    && active.oilDabPointsElementPointsLength === active.element.points.length
    && active.oilDabPointsPressuresLength === (active.element.pressures?.length ?? -1)
  ) {
    return cached;
  }
  const mapped = dabs.map((dab) => ({ x: dab.x, y: dab.y }));
  active.oilDabPoints = mapped;
  active.oilDabPointsElementPointsLength = active.element.points.length;
  active.oilDabPointsPressuresLength = active.element.pressures?.length ?? -1;
  return mapped;
}

/**
 * Source samples a capped oil bed must gain before the live preview rebuilds it.
 *
 * At `FX_OIL_DAB_CAP` the bed stops growing and starts redistributing: `sampleStations` refits a
 * fixed 4096-station lattice across the whole arc, so every station shifts slightly on every new
 * sample and a faithful preview would replan the entire bed per pointer move (~35-55 ms measured,
 * carrier-dominated). That is why the overlay used to stop repainting a capped stroke entirely —
 * but a frozen preview is worse than a coalesced one: the stroke simply stopped following the
 * cursor. Rebuilding once per this many samples keeps it live at roughly a millisecond per move
 * amortised, and the shift being coalesced is sub-pixel per sample at this bed size.
 */
const OIL_CAP_REPAINT_SAMPLE_STRIDE = 32;

interface ActiveRetainedStroke {
  readonly id: string;
  readonly kind: StudioLiveRetainedMediaKind;
  element: DrawEl;
  paintedDabs: number;
  /**
   * Oil paints actually issued for this stroke.
   *
   * `paintedDabs` cannot answer "did this append change the canvas?" once the bed saturates
   * `FX_OIL_DAB_CAP` — the count is pinned at 4096 while every station keeps moving — so the
   * append result was reporting `noop` for repaints that really happened. This advances on every
   * oil paint and is what the append result reads. Non-oil kinds leave it at 0.
   */
  paintedOilPasses: number;
  /**
   * Source samples the painted oil bed was built from, or -1 before the first paint.
   *
   * This is the honest "has anything arrived?" test at any bed size, and it is checked before the
   * bed is planned rather than after.
   */
  paintedOilSourcePoints: number;
  paintedPencilMarks: number;
  paintedSourceSegments: number;
  /**
   * Per-stroke oil dab cache. Present only for the live in-progress stroke: settled replays build
   * a throwaway `ActiveRetainedStroke` and pass `null`, which routes them through the plain
   * `planOilBrushDabs` exactly as before.
   */
  oilPlanner: FxOilDabPlanner | null;
  /**
   * Per-stroke carrier planner, paired with `oilPlanner`. Present only for the live in-progress
   * stroke; settled replays pass `null` and route through the batch `planStudioOilRibbonCarrier`
   * exactly as before. The plan is byte-identical either way — see
   * `StudioOilRibbonCarrierPlanner`.
   */
  oilCarrierPlanner: StudioOilRibbonCarrierPlanner | null;
  /**
   * Per-stroke incremental highlighter planners (fx pressure path + wash ribbon), created lazily
   * on first paint. A live append then pays only for new samples; settled replays build throwaway
   * actives whose fresh builder pair reproduces the batch plan in one cold append, so replay
   * output stays batch-identical.
   */
  fxPressurePathBuilder?: StudioIncrementalFxPressurePathBuilder;
  highlighterWashBuilder?: StudioIncrementalHighlighterWashRibbonBuilder;
  /**
   * Running left-to-right `radiusY` sum over the accepted dab prefix plus the dab count it was
   * accumulated for. Rebuilding the mean from the whole dab array every pointer frame made oil
   * live cost O(N²) over one drag; extending the running sum keeps the float addition order —
   * and therefore the produced `radiusPx` — bit-identical to the full reduce it replaces.
   */
  oilRadiusSum?: number;
  oilRadiusSumDabCount?: number;
  /** Cached carrier input points plus the element lengths they were mapped from. */
  oilDabPoints?: readonly { x: number; y: number }[];
  oilDabPointsElementPointsLength?: number;
  oilDabPointsPressuresLength?: number;
  /**
   * Per-stroke incremental calligraphy segment state. Created lazily on the first multi-point
   * paint; settled replays build a throwaway `ActiveRetainedStroke`, so each replay starts its
   * own builder and pays one full O(n) build instead of per-move ones.
   */
  calligraphySegments?: StudioIncrementalCalligraphySegmentBuilder;
  /** Per-stroke incremental pencil pressure-curve state — same lifecycle as `calligraphySegments`. */
  pencilCurve?: StudioIncrementalRetainedMediaCurveBuilder;
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
    paintedOilPasses: 0,
    paintedOilSourcePoints: -1,
      paintedPencilMarks: 0,
      paintedSourceSegments: 0,
      oilPlanner: kind === "oil" ? new FxOilDabPlanner() : null,
      oilCarrierPlanner: kind === "oil" ? new StudioOilRibbonCarrierPlanner() : null,
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
    const before = active.paintedDabs + active.paintedOilPasses
      + active.paintedPencilMarks + active.paintedSourceSegments;
    if (!this.paintSuffix(active, element, this.activeContext)) {
      return { status: "fallback", reason: "surface-unavailable" };
    }
    const after = active.paintedDabs + active.paintedOilPasses
      + active.paintedPencilMarks + active.paintedSourceSegments;
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
    paintedOilPasses: 0,
    paintedOilSourcePoints: -1,
        paintedPencilMarks: 0,
        paintedSourceSegments: 0,
        oilPlanner: null,
        oilCarrierPlanner: null,
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
      const flatPoints = flatFinitePoints(element);
      if (flatPoints.length === 0) return true;
      // Nothing new arrived, so there is nothing to plan. Checked on the source rather than on
      // the dab count because the count saturates at the cap (see below), and checked here rather
      // than after planning because a plan whose result is discarded is pure cost.
      //
      // Past the cap the same check also coalesces: a capped bed is a fixed-size resampling of
      // the WHOLE arc, so a new sample nudges every station a little instead of extending the
      // stroke, and rebuilding all 4096 dabs for one nudge blocks the pointer for tens of
      // milliseconds. Redrawing once per `OIL_CAP_REPAINT_SAMPLE_STRIDE` samples keeps the preview
      // following the cursor at a bounded amortised cost — the alternative this replaces was to
      // stop repainting altogether, which left a long oil stroke frozen on screen for the rest of
      // the drag.
      const grownSamples = flatPoints.length - active.paintedOilSourcePoints;
      const capReached = active.paintedDabs >= FX_OIL_DAB_CAP;
      if (
        target === this.activeContext
        && grownSamples < (capReached ? OIL_CAP_REPAINT_SAMPLE_STRIDE : 1)
      ) {
        return true;
      }
      const brush = element.brush ?? "oil";
      const planInput = {
        points: flatPoints,
        pressures: element.pressures,
        baseWidth: Math.max(1, element.strokeWidth),
        seed: fxBrushSeedFromKey(element.id),
        maxDabs: FX_OIL_DAB_CAP,
        paintBody: studioOilPaintBodyForBrush(brush),
        tipProfile: studioOilTipProfileForBrush(brush),
        stationSpacingRatio: studioFluidPaintStationSpacingRatio(brush),
      };
      // Same values either way: the planner re-derives the station lattice and reuses only the
      // prefix it has verified byte-equal, so a growing stroke stops rebuilding 4096 stations x
      // 7-44 bristles per pointer move.
      const dabs = active.oilPlanner
        ? active.oilPlanner.plan(planInput)
        : planOilBrushDabs(planInput);
      if (dabs.length === 0) return true;
      // The dab count is evidence that the bed is unchanged only while it is still free to grow.
      // At `FX_OIL_DAB_CAP` it saturates, and that is precisely where it stops being evidence:
      // past the cap `sampleStations` refits the lattice across the WHOLE arc, so every station
      // moves on every append while the count stays pinned at 4096. Reading the pinned count as
      // "nothing changed" froze the live preview — a long oil stroke stopped following the cursor
      // for the rest of the drag, and the already-drawn part stopped re-distributing with it.
      //
      // A capped bed therefore always repaints. That costs a full replan per move, which is what
      // it honestly is; the refit itself is no longer the ~70 ms this guard was written against.
      if (
        active.paintedDabs === dabs.length
        && dabs.length < FX_OIL_DAB_CAP
        && target === this.activeContext
      ) {
        return true;
      }
      const radiusPx = extendOilRadiusMean(active, dabs);
      if (target === this.activeContext) {
        // The wet-mix readback that used to run here sampled and rewrote active-canvas pixels
        // immediately before this clear discarded them — pure per-frame getImageData stall with
        // zero surviving pixels. Wet-into-wet feel stays owned by the committed renderer.
        this.clearCanvas(this.activeContext, this.activeCanvas);
      }
      const programs = studioOilRibbonProgramsForBrush(
        brush,
        fxBrushSeedFromKey(element.id),
        element.brushEnginePrograms?.oil,
      );
      // The dab bed is already prefix-stable across a pointer move (`FxOilDabPlanner`); the
      // carrier was rebuilding its smoothed geometry, its stations and every bristle run on top
      // of it regardless — measured 14.6 ms per move at a 2906-dab bed, against 9.2 ms once the
      // settled prefix is kept. Same plan, so the painted pixels do not move.
      const carrier = active.oilCarrierPlanner
        ? active.oilCarrierPlanner.plan(dabs, programs)
        : planStudioOilRibbonCarrier(dabs, programs);
      paintStudioOilRibbonCarrier(
        context as unknown as StudioOilRibbonPaintContext,
        {
          carrier,
          stroke: element.stroke,
          opacity: element.opacity ?? 1,
          points: oilDabPoints(active, dabs),
          radiusPx,
          skipDestinationReadback: true,
        },
      );
      active.paintedDabs = dabs.length;
      if (target === this.activeContext) {
        active.paintedOilPasses += 1;
        active.paintedOilSourcePoints = flatPoints.length;
      }
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
      const rawPointCount = Math.floor(element.points.length / 2);
      if (rawPointCount === 0) return true;
      if (finiteCoordinate(element.points[0]) === null || finiteCoordinate(element.points[1]) === null) {
        return true;
      }
      const brush = element.brush ?? "pencil";
      const width = studioBrushAliasEffectiveDiameter(brush, Math.max(1, element.strokeWidth));
      const profile = resolveStudioRetainedMediaPressureProfileId(brush) ?? "pencil";
      // 이동한 획은 다시 탭이 될 수 없으므로(점은 append 전용), 선분을 이미 칠했다면 탭
      // 판정의 전점 스캔 O(n)을 건너뛴다 — 판정 결과는 그 경우 항상 null이다.
      const tap = active.paintedSourceSegments === 0
        ? planStudioRetainedMediaTapDab(
            flatFinitePoints(element),
            element.pressures,
            profile,
            { minimumDiameterRatio: element.materialMinimumDiameterRatio },
          )
        : null;
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
      // 증분 곡선 빌더 + suffix 리본: 매 이동 전체 곡선·리본을 다시 세우던 O(n)/이동을 새 점
      // 수에만 비례하게 만든다. 리본은 이미 칠한 선분 경계부터의 suffix만 계획한다 — 아래
      // 셀 필터·start 캡 스킵과 같은 경계 규약이라 칠해지는 픽셀은 종전과 같다.
      const pencilCurve = active.pencilCurve
        ??= createStudioIncrementalRetainedMediaCurveBuilder(
          profile,
          { minimumDiameterRatio: element.materialMinimumDiameterRatio },
        );
      const curve = pencilCurve.append(
        element.points,
        element.materialPressureModel === STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1
          ? element.pressures
          : undefined,
      );
      const startSegment = active.paintedSourceSegments === 0
        ? 0
        : Math.max(0, active.paintedSourceSegments - 1);
      const ribbon = planStudioRetainedMediaRibbon(
        startSegment === 0
          ? curve
          : { ...curve, segments: curve.segments.slice(startSegment) },
        Math.max(0.5, width),
      );
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
      // 원시 꼬리 폴리라인: 검증된 점 개수는 곡선 빌더가 이미 알고 있으므로(sourcePointCount)
      // 점 배열을 다시 스캔하지 않고 suffix 인덱스만 직접 읽는다.
      const validPointCount = curve.sourcePointCount;
      if (validPointCount >= 2) {
        const from = active.paintedSourceSegments === 0
          ? 0
          : Math.min(active.paintedSourceSegments, validPointCount - 1);
        if (from < validPointCount - 1 || from === 0) {
          const liveWidth = 2 * studioLiveVisibleTapDocumentRadius(
            Math.max(0.35, width / 2),
            this.surface?.documentScale ?? 1,
          );
          context.globalAlpha = inherited * Math.min(1, element.opacity ?? 1);
          context.lineWidth = liveWidth;
          context.beginPath();
          context.moveTo(element.points[from * 2]!, element.points[from * 2 + 1]!);
          for (let index = from + 1; index < validPointCount; index += 1) {
            context.lineTo(element.points[index * 2]!, element.points[index * 2 + 1]!);
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
      const rawPointCount = Math.floor(element.points.length / 2);
      if (rawPointCount === 0) return true;
      const firstX = finiteCoordinate(element.points[0]);
      const firstY = finiteCoordinate(element.points[1]);
      if (firstX === null || firstY === null) return true;
      const brush = element.brush ?? "calligraphy";
      const width = studioBrushAliasEffectiveDiameter(brush, Math.max(1, element.strokeWidth));
      if (rawPointCount === 1) {
        if (active.paintedSourceSegments > 0 || active.paintedPencilMarks > 0) return true;
        const radius = studioLiveVisibleTapDocumentRadius(
          Math.max(0.5, width * 0.18),
          this.surface?.documentScale ?? 1,
        );
        context.fillStyle = element.stroke;
        context.globalAlpha = Math.min(1, element.opacity ?? 1);
        context.beginPath();
        context.arc(firstX, firstY, radius, 0, Math.PI * 2);
        context.fill();
        active.paintedPencilMarks = 1;
        active.paintedSourceSegments = 1;
        return true;
      }
      // 증분 빌더: 이동마다 전체 스트로크의 선분을 다시 세우던 O(n)/이동을 새 점 수에만
      // 비례하게 만든다. 필압·스타일러스는 나란한 인덱스별 접근자로 넘겨 배열 재구성
      // O(n)도 제거한다(빌더는 새 인덱스에서만 호출한다). 아래 suffix 리본과 짝을 이뤄
      // 이동당 비용이 스트로크 길이와 무관해진다.
      const builder = active.calligraphySegments
        ??= createStudioIncrementalCalligraphySegmentBuilder(
          width,
          resolveStudioCalligraphyRenderTip(brush, element.brushTip),
        );
      const { pressures, tiltXs, tiltYs, twists } = element;
      const segments = builder.append(
        element.points,
        (index) => mapStudioBrushAliasPressure(brush, pressures?.[index], 0.5),
        (index) => ({
          pointerType: "pen" as const,
          tiltX: tiltXs?.[index],
          tiltY: tiltYs?.[index],
          twist: twists?.[index],
        }),
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
      // 획별 증분 빌더 쌍: 압력 경로와 워시 리본이 안정 prefix 를 유지해 append 가 새 표본
      // 수에만 비례한다(장획 게이트 family:highlighter). 콜드 1회 append 는 배치 플랜과 바이트
      // 동일하므로 settled 리플레이의 일회용 active 도 같은 경로를 그대로 쓴다.
      const fxBuilder = active.fxPressurePathBuilder
        ??= createStudioIncrementalFxPressurePathBuilder();
      const washBuilder = active.highlighterWashBuilder
        ??= createStudioIncrementalHighlighterWashRibbonBuilder();
      const pressurePath = fxBuilder.append({
        brushId: isStudioFxPressureBrushId(brush) ? brush : "highlighter",
        points: renderPath.points,
        pressures: element.pressures,
        pressureModel: element.materialPressureModel,
        minimumDiameterRatio: element.materialMinimumDiameterRatio,
        tension: renderPath.tension,
      });
      const wash = washBuilder.plan(
        { brushId, pressurePath, baseWidth: width },
        fxBuilder.stableSegmentCount(),
        fxBuilder.generation(),
      );
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
    paintedOilPasses: 0,
    paintedOilSourcePoints: -1,
        paintedPencilMarks: 0,
        paintedSourceSegments: 0,
        oilPlanner: null,
        oilCarrierPlanner: null,
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
    paintedOilPasses: 0,
    paintedOilSourcePoints: -1,
        paintedPencilMarks: 0,
        paintedSourceSegments: 0,
        oilPlanner: null,
        oilCarrierPlanner: null,
      }, stroke, this.settledContext);
    }
    if (!this.active) return;
    const replayActive: ActiveRetainedStroke = {
      ...this.active,
      paintedDabs: 0,
    paintedOilPasses: 0,
    paintedOilSourcePoints: -1,
      paintedPencilMarks: 0,
      paintedSourceSegments: 0,
    };
    // A replay repaints from zero onto a cleared surface; it keeps the live planner so the next
    // append still reuses a verified prefix rather than paying a full replan for the resize.

    this.paintSuffix(replayActive, this.active.element, this.activeContext);
    this.active.paintedDabs = replayActive.paintedDabs;
    this.active.paintedOilPasses = replayActive.paintedOilPasses;
    this.active.paintedOilSourcePoints = replayActive.paintedOilSourcePoints;
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
