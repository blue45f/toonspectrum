/**
 * Append-only live surface for versioned dynamic brushes.
 *
 * Causal-v2 pointer frames consume only the unseen accepted-sample suffix. Older non-causal
 * texture snapshots still consume only the unseen source suffix, but redraw that accepted prefix
 * from the exact canonical planner: their station positions, whole-stroke taper and stamp-grid
 * budget depend on the current endpoint and cannot be reproduced by an independent append walker.
 * Pointer-up reuses the same exact plan before the stroke is flattened into the settled FIFO.
 *
 * Material planning is deliberately shared with the committed bounded-flow renderer. If the
 * current tip/grain/dual/layer/flow combination cannot produce a bounded mark plan, this renderer
 * clears only its active surface and reports a fail-closed retained-renderer fallback.
 */

import {
  isStudioDynamicBrushCausalDepositPipeline,
  normalizeStudioBrushDynamicsSettings,
  planNormalizedStudioDynamicBrushDabs,
  serializeStudioBrushDynamicsSettingsCanonical,
  STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE,
  studioDynamicBrushDepositPipelineUsesContinuation,
  studioBrushDynamicsSeedFromKey,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioDynamicBrushDab,
} from "./studio-brush-dynamics";
import {
  planStudioDynamicBrushRenderBudget,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET,
  STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID,
  STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
  type StudioDynamicBrushAcceptedPrefixReceipt,
  type StudioDynamicBrushRenderStampGrid,
} from "./studio-brush-render-budget";
import {
  studioBrushSymmetryTransforms,
  studioDynamicBrushDabVariationsFromTransforms,
  transformStudioBrushSymmetryPoint,
  type StudioBrushSymmetrySpec,
  type StudioBrushSymmetryTransform,
} from "./studio-brush-symmetry";
import {
  appendStudioCausalDynamicBrushDepositsV2,
  appendStudioCausalDynamicBrushDepositsV3,
  beginStudioCausalDynamicBrushDepositV2,
  beginStudioCausalDynamicBrushDepositV3,
  planStudioCausalDynamicBrushDepositSegmentsV3,
  planStudioCausalDynamicBrushDepositsV2,
  STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
  type StudioCausalDynamicBrushDepositStateV2,
  type StudioCausalDynamicBrushDepositStateV3,
} from "./studio-causal-dynamic-brush-deposit-v2";
import {
  STUDIO_DYNAMIC_COVERAGE_R8_ALPHA_MAP_BYTE_BUDGET,
  planStudioDynamicBrushCoverageMarks,
  renderStudioDynamicBrushCoverageMark,
  type StudioDynamicBrushCoverageMark,
  type StudioDynamicBrushSegmentedDabVariation,
} from "./studio-dynamic-brush-coverage-renderer";
import {
  acquireStudioLowLatencyCanvas2dContext,
  resolveStudioLiveSurfaceDevicePixelRatio,
  STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS,
} from "./studio-low-latency-canvas";
import { isStudioBoundedFlowPaintModelCompatible } from "./studio-stroke-paint-model";

import type { DrawEl } from "./studio-element-model";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";

const POINT_EPSILON = 1e-6;
const MAX_LEGACY_LIVE_DABS = STUDIO_DYNAMIC_BRUSH_DAB_CAP_RANGE.max;
const MAX_COORDINATE_ABS = 1_000_000_000;

export interface StudioLiveDynamicBrushOverlayCanvases {
  readonly activeCanvas: HTMLCanvasElement;
  readonly settledCanvas: HTMLCanvasElement;
}

export type StudioLiveDynamicBrushFallbackReason =
  | "unsupported-style"
  | "surface-unavailable"
  | "surface-budget"
  | "stroke-identity"
  | "source-prefix"
  | "invalid-sample"
  | "dab-budget"
  | "mark-budget"
  | "material-plan"
  | "surface-render";

export type StudioLiveDynamicBrushBeginResult =
  | {
      readonly status: "started";
      readonly dabCount: number;
      readonly markCount: number;
    }
  | {
      readonly status: "fallback";
      readonly reason: StudioLiveDynamicBrushFallbackReason;
    };

export type StudioLiveDynamicBrushAppendResult =
  | {
      readonly status: "appended" | "noop";
      readonly consumedSourcePoints: number;
      readonly appendedDabs: number;
      readonly appendedMarks: number;
      readonly acceptedPrefixReceipt?: StudioDynamicBrushAcceptedPrefixReceipt;
    }
  | {
      readonly status: "fallback";
      readonly reason: StudioLiveDynamicBrushFallbackReason;
    };

export type StudioLiveDynamicBrushEndResult =
  | {
      readonly status: "settled";
      readonly dabCount: number;
      readonly markCount: number;
      readonly acceptedPrefixReceipt?: StudioDynamicBrushAcceptedPrefixReceipt;
    }
  | {
      readonly status: "fallback";
      readonly reason: StudioLiveDynamicBrushFallbackReason;
    };

interface DynamicSourceSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tangentialPressure: number;
  readonly speed: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly twist: number;
}

interface DetachedDynamicStrokeStyle {
  readonly strokeId: string;
  readonly brushId: string;
  readonly color: string;
  readonly width: number;
  readonly opacity: number;
  readonly seed: number;
  readonly dynamics: NormalizedStudioBrushDynamicsSettings;
  readonly sourceDynamics: DrawEl["brushDynamics"];
  readonly dynamicsSignature: string;
  readonly symmetry: StudioBrushSymmetrySpec;
  readonly symmetrySignature: string;
  readonly transforms: readonly StudioBrushSymmetryTransform[];
  readonly strokeOrigins: readonly Readonly<{ x: number; y: number }>[];
}

interface DynamicStrokeSource {
  readonly points: number[];
  readonly pressures: number[];
  readonly tangentialPressures: number[];
  readonly speeds: number[];
  readonly tiltXs: number[];
  readonly tiltYs: number[];
  readonly twists: number[];
}

interface ActiveDynamicStroke {
  readonly style: DetachedDynamicStrokeStyle;
  readonly source: DynamicStrokeSource;
  /** Version matches the persisted causal-v2 or segmented causal-v3 pipeline exactly. */
  causalState?:
    | StudioCausalDynamicBrushDepositStateV2
    | StudioCausalDynamicBrushDepositStateV3;
  consumedSourcePoints: number;
  previousSample: DynamicSourceSample;
  totalDistance: number;
  distanceSinceLastDab: number;
  nextDabIndex: number;
  lastSpacing: number;
  markCount: number;
  /** Stroke-wide sum of immutable R8 alpha-map receipts across incremental suffix plans. */
  r8AlphaMapBytes: number;
  acceptedCausalDabCount: number;
  plannedCausalDabCount: number;
  acceptedPrefixReceipt?: StudioDynamicBrushAcceptedPrefixReceipt;
  stampGrid: StudioDynamicBrushRenderStampGrid;
  transitionedFromTap: boolean;
}

interface SettledDynamicStroke {
  readonly style: DetachedDynamicStrokeStyle;
  readonly source: DynamicStrokeSource;
}

interface ExactDynamicPlan {
  readonly dabCount: number;
  readonly firstDab?: StudioDynamicBrushDab;
  readonly lastSpacing: number;
  readonly marks: readonly StudioDynamicBrushCoverageMark[];
  readonly stampGrid: StudioDynamicBrushRenderStampGrid;
  readonly dabCapped: boolean;
  readonly r8AlphaMapBytes: number;
  readonly acceptedPrefixReceipt?: StudioDynamicBrushAcceptedPrefixReceipt;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, -MAX_COORDINATE_ABS, MAX_COORDINATE_ABS)
    : null;
}

function detachedSymmetry(value: DrawEl["symmetry"]): StudioBrushSymmetrySpec {
  return value
    ? {
        type: value.type,
        centerX: finiteNumber(value.centerX, 0),
        centerY: finiteNumber(value.centerY, 0),
        radialCount: value.radialCount,
      }
    : { type: "none", centerX: 0, centerY: 0 };
}

function sourceSampleAt(
  element: DrawEl,
  index: number,
  fallbackPressure: number
): DynamicSourceSample | null {
  const x = finiteCoordinate(element.points[index * 2]);
  const y = finiteCoordinate(element.points[index * 2 + 1]);
  if (x === null || y === null) return null;
  return {
    x,
    y,
    pressure: clamp01(finiteNumber(element.pressures?.[index], fallbackPressure)),
    tangentialPressure: clamp(
      finiteNumber(element.tangentialPressures?.[index], 0),
      -1,
      1,
    ),
    speed: clamp(finiteNumber(element.speeds?.[index], 0), 0, 64),
    tiltX: clamp(finiteNumber(element.tiltXs?.[index], 0), -90, 90),
    tiltY: clamp(finiteNumber(element.tiltYs?.[index], 0), -90, 90),
    twist: clamp(finiteNumber(element.twists?.[index], 0), 0, 359),
  };
}

function appendSourceSample(source: DynamicStrokeSource, sample: DynamicSourceSample): void {
  source.points.push(sample.x, sample.y);
  source.pressures.push(sample.pressure);
  source.tangentialPressures.push(sample.tangentialPressure);
  source.speeds.push(sample.speed);
  source.tiltXs.push(sample.tiltX);
  source.tiltYs.push(sample.tiltY);
  source.twists.push(sample.twist);
}

function detachedSource(source: DynamicStrokeSource): DynamicStrokeSource {
  return {
    points: [...source.points],
    pressures: [...source.pressures],
    tangentialPressures: [...source.tangentialPressures],
    speeds: [...source.speeds],
    tiltXs: [...source.tiltXs],
    tiltYs: [...source.tiltYs],
    twists: [...source.twists],
  };
}

function segmentedDabCount(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
): number {
  return segments.reduce((count, segment) => count + segment.length, 0);
}

function firstSegmentedDab(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
): StudioDynamicBrushDab | undefined {
  for (const segment of segments) {
    if (segment[0]) return segment[0];
  }
  return undefined;
}

function lastSegmentedDab(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
): StudioDynamicBrushDab | undefined {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const last = segments[index]?.at(-1);
    if (last) return last;
  }
  return undefined;
}

function segmentedDabPrefix(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
  maximumDabs: number,
): readonly (readonly StudioDynamicBrushDab[])[] {
  const accepted: Array<readonly StudioDynamicBrushDab[]> = [];
  let remaining = Math.max(0, Math.floor(maximumDabs));
  for (const segment of segments) {
    if (remaining <= 0) break;
    if (segment.length <= remaining) {
      accepted.push(segment);
      remaining -= segment.length;
      continue;
    }
    accepted.push(segment.slice(0, remaining));
    remaining = 0;
  }
  return accepted;
}

function segmentedDabVariations(
  segments: readonly (readonly StudioDynamicBrushDab[])[],
  transforms: readonly StudioBrushSymmetryTransform[],
): readonly StudioDynamicBrushSegmentedDabVariation[] {
  const variationSegments = transforms.map(
    () => [] as Array<readonly StudioDynamicBrushDab[]>,
  );
  for (const segment of segments) {
    const transformed = studioDynamicBrushDabVariationsFromTransforms(
      segment,
      transforms,
    );
    for (
      let variationIndex = 0;
      variationIndex < transformed.length;
      variationIndex += 1
    ) {
      variationSegments[variationIndex]!.push(transformed[variationIndex]!);
    }
  }
  return variationSegments.map((segmentsForVariation) => ({
    kind: "studio-dynamic-brush-segmented-dab-variation",
    segments: segmentsForVariation,
  }));
}

function styleIdentityMatches(element: DrawEl, style: DetachedDynamicStrokeStyle): boolean {
  const dynamicsMatches = element.brushDynamics === style.sourceDynamics
    || serializeStudioBrushDynamicsSettingsCanonical(element.brushDynamics)
      === style.dynamicsSignature;
  return element.id === style.strokeId
    && element.brush === style.brushId
    && element.stroke === style.color
    && Math.max(1, finiteNumber(element.strokeWidth, 1)) === style.width
    && clamp01(finiteNumber(element.opacity, 1)) === style.opacity
    && dynamicsMatches
    && JSON.stringify(detachedSymmetry(element.symmetry)) === style.symmetrySignature
    && element.paintModel === "bounded-flow-v2";
}

/**
 * Exact live support gate. Unsupported/legacy combinations stay on the retained Konva renderer
 * before this module mutates a pixel.
 */
export function studioLiveDynamicBrushOverlaySupportsElement(
  element: DrawEl
): boolean {
  return isStudioBoundedFlowPaintModelCompatible(element)
    && typeof element.brushDynamics === "object"
    && element.brushDynamics !== null
    && typeof element.stroke === "string"
    && element.stroke.length > 0
    && Number.isFinite(element.strokeWidth)
    && element.strokeWidth > 0
    && Number.isFinite(element.opacity ?? 1)
    && (element.opacity ?? 1) > 0;
}

function styleFromElement(element: DrawEl): DetachedDynamicStrokeStyle | null {
  if (!studioLiveDynamicBrushOverlaySupportsElement(element)) return null;
  const firstX = finiteCoordinate(element.points[0]);
  const firstY = finiteCoordinate(element.points[1]);
  if (firstX === null || firstY === null) return null;
  const sourceDynamics = element.brushDynamics;
  const normalized = normalizeStudioBrushDynamicsSettings(sourceDynamics);
  const width = Math.max(1, finiteNumber(element.strokeWidth, 1));
  const seed = studioBrushDynamicsSeedFromKey(`${element.id}:${normalized.seed}`);
  const dynamics = normalizeStudioBrushDynamicsSettings({
    ...normalized,
    seed,
    width: { ...normalized.width, base: width },
  });
  const symmetry = detachedSymmetry(element.symmetry);
  const symmetrySignature = JSON.stringify(symmetry);
  const transforms = studioBrushSymmetryTransforms(symmetry);
  const strokeOrigins = transforms.map((transform) => {
    const [x, y] = transformStudioBrushSymmetryPoint(firstX, firstY, transform);
    return Object.freeze({ x, y });
  });
  return {
    strokeId: element.id,
    brushId: element.brush!,
    color: element.stroke,
    width,
    opacity: clamp01(finiteNumber(element.opacity, 1)),
    seed,
    dynamics,
    sourceDynamics,
    dynamicsSignature: serializeStudioBrushDynamicsSettingsCanonical(sourceDynamics),
    symmetry,
    symmetrySignature,
    transforms,
    strokeOrigins,
  };
}

function initialStampGrid(style: DetachedDynamicStrokeStyle): StudioDynamicBrushRenderStampGrid {
  if (
    isStudioDynamicBrushCausalDepositPipeline(
      style.dynamics.depositPipeline,
    )
  ) {
    // A causal stroke cannot lower its stamp lattice after marks have already been accepted:
    // doing so would require an O(N) clear/replay and would make the live prefix differ from the
    // retained result. Start authored streaming snapshots on the bounded three-sample lattice.
    // The same fixed grid is reused by append, pointer-up and retained replay, preserving material
    // parity while keeping textured long strokes inside the live mark budget.
    return STUDIO_DYNAMIC_BRUSH_CAUSAL_STAMP_GRID;
  }
  return planStudioDynamicBrushRenderBudget({
    settings: style.dynamics,
    dabCount: 1,
    symmetryCount: style.transforms.length,
    markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
  }).stampGrid;
}

function causalMarkBudget(
  dynamics: NormalizedStudioBrushDynamicsSettings,
): number {
  return studioDynamicBrushDepositPipelineUsesContinuation(
    dynamics.depositPipeline,
  )
    ? STUDIO_DYNAMIC_BRUSH_CAUSAL_CONTINUATION_MARK_BUDGET
    : STUDIO_DYNAMIC_BRUSH_CAUSAL_MARK_BUDGET;
}

function liveDynamicDevicePixelRatio(surface: StudioLiveInkSurface): number {
  const devicePixelRatio =
    typeof globalThis.devicePixelRatio === "number"
    && Number.isFinite(globalThis.devicePixelRatio)
      ? globalThis.devicePixelRatio
      : 1;
  return resolveStudioLiveSurfaceDevicePixelRatio({
    cssWidth: surface.width,
    cssHeight: surface.height,
    devicePixelRatio,
    // Two simultaneously allocated canvases share the ordinary live-surface backing budget.
    maximumBackingPixels: STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS / 2,
  });
}

function nativeStudioDevicePixelRatio(): number {
  const devicePixelRatio =
    typeof globalThis.devicePixelRatio === "number"
    && Number.isFinite(globalThis.devicePixelRatio)
      ? globalThis.devicePixelRatio
      : 1;
  return clamp(devicePixelRatio, 1, 4);
}

export class StudioLiveDynamicBrushOverlayRenderer {
  private activeCanvas: HTMLCanvasElement | null = null;
  private settledCanvas: HTMLCanvasElement | null = null;
  private activeContext: CanvasRenderingContext2D | null = null;
  private settledContext: CanvasRenderingContext2D | null = null;
  private surface: StudioLiveInkSurface | null = null;
  private surfaceUsable = false;
  private dpr = 1;
  private active: ActiveDynamicStroke | null = null;
  private settled: SettledDynamicStroke[] = [];
  private fallbackReason: StudioLiveDynamicBrushFallbackReason | null = null;

  attach(canvases: StudioLiveDynamicBrushOverlayCanvases | null): void {
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

  get lastFallbackReason(): StudioLiveDynamicBrushFallbackReason | null {
    return this.fallbackReason;
  }

  get backingPixelCount(): number {
    return (this.activeCanvas?.width ?? 0) * (this.activeCanvas?.height ?? 0)
      + (this.settledCanvas?.width ?? 0) * (this.settledCanvas?.height ?? 0);
  }

  begin(element: DrawEl): StudioLiveDynamicBrushBeginResult {
    const style = styleFromElement(element);
    if (!style) return { status: "fallback", reason: "unsupported-style" };
    if (!this.surfaceReady()) {
      return {
        status: "fallback",
        reason: this.surfaceUsable ? "surface-unavailable" : "surface-budget",
      };
    }

    if (this.active) {
      this.resetActiveState();
      this.replay();
    }
    const first = sourceSampleAt(element, 0, style.dynamics.fallbackPressure);
    if (!first) return { status: "fallback", reason: "invalid-sample" };

    const source: DynamicStrokeSource = {
      points: [],
      pressures: [],
      tangentialPressures: [],
      speeds: [],
      tiltXs: [],
      tiltYs: [],
      twists: [],
    };
    appendSourceSample(source, first);
    const causalBegin = !isStudioDynamicBrushCausalDepositPipeline(
      style.dynamics.depositPipeline,
    )
      ? null
      : studioDynamicBrushDepositPipelineUsesContinuation(
          style.dynamics.depositPipeline,
        )
        ? beginStudioCausalDynamicBrushDepositV3(first, style.dynamics)
        : beginStudioCausalDynamicBrushDepositV2(
            first,
            style.dynamics,
            STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
          );
    if (causalBegin && !causalBegin.ok) {
      return {
        status: "fallback",
        reason: causalBegin.reason === "dab-budget"
          ? "dab-budget"
          : "material-plan",
      };
    }
    const exactInitial = causalBegin?.ok ? null : this.exactPlan(style, source);
    if (!causalBegin?.ok && (!exactInitial || exactInitial.dabCount !== 1)) {
      return { status: "fallback", reason: "material-plan" };
    }
    const initialDab = causalBegin?.ok
      ? causalBegin.dab
      : exactInitial!.firstDab!;
    const initialSpacing = causalBegin?.ok
      ? causalBegin.state.lastSpacing
      : Math.max(0.25, initialDab.spacing);
    const active: ActiveDynamicStroke = {
      style,
      source,
      ...(causalBegin?.ok ? { causalState: causalBegin.state } : {}),
      consumedSourcePoints: 1,
      previousSample: first,
      totalDistance: 0,
      distanceSinceLastDab: 0,
      nextDabIndex: 1,
      lastSpacing: initialSpacing,
      markCount: 0,
      r8AlphaMapBytes: 0,
      // `appendDabs([initialDab])` below is the single authority that consumes the first causal
      // slot. Pre-counting it here would make the global prefix planner treat every pointer-down
      // dab as already accepted and render an empty tap.
      acceptedCausalDabCount: 0,
      plannedCausalDabCount: causalBegin?.ok ? 1 : 0,
      stampGrid: exactInitial?.stampGrid ?? initialStampGrid(style),
      transitionedFromTap: false,
    };
    this.active = active;
    this.setActiveCanvasOpacity(style.opacity);
    let initialMarkCount: number;
    if (exactInitial) {
      if (!this.drawMarksToActive(exactInitial.marks)) {
        return this.failActive("surface-render");
      }
      active.markCount = exactInitial.marks.length;
      active.r8AlphaMapBytes = exactInitial.r8AlphaMapBytes;
      initialMarkCount = exactInitial.marks.length;
    } else {
      const rendered = this.appendDabs(active, [initialDab]);
      if (rendered.status === "fallback") return rendered;
      initialMarkCount = rendered.appendedMarks;
    }
    this.fallbackReason = null;
    return {
      status: "started",
      dabCount: 1,
      markCount: initialMarkCount,
    };
  }

  /**
   * Consumes only source indices at or after `consumedSourcePoints`. Already accepted prefix slots
   * are never read or planned again on pointermove.
   */
  appendFrom(element: DrawEl): StudioLiveDynamicBrushAppendResult {
    const active = this.active;
    if (!active) {
      return {
        status: "fallback",
        reason: this.fallbackReason ?? "surface-unavailable",
      };
    }
    if (!styleIdentityMatches(element, active.style)) {
      return this.failActive("stroke-identity");
    }
    const total = Math.floor(element.points.length / 2);
    if (total < active.consumedSourcePoints) return this.failActive("source-prefix");
    if (total === active.consumedSourcePoints) {
      return {
        status: "noop",
        consumedSourcePoints: total,
        appendedDabs: 0,
        appendedMarks: 0,
      };
    }
    const previousIndex = active.consumedSourcePoints - 1;
    if (
      finiteCoordinate(element.points[previousIndex * 2]) !== active.previousSample.x
      || finiteCoordinate(element.points[previousIndex * 2 + 1]) !== active.previousSample.y
    ) {
      return this.failActive("source-prefix");
    }
    if (active.causalState) {
      return this.appendCausalFrom(element, active, total);
    }
    return this.appendCanonicalFrom(element, active, total);
  }

  /** Exact full replay seals endpoint/taper once, then flattens the stroke into the settled FIFO. */
  end(element: DrawEl): StudioLiveDynamicBrushEndResult {
    const appended = this.appendFrom(element);
    if (appended.status === "fallback") return appended;
    const active = this.active;
    if (!active) return { status: "fallback", reason: "surface-unavailable" };
    const exact = this.exactPlan(active.style, active.source);
    if (!exact) return this.failActive("material-plan");
    this.clearActiveRect();
    active.markCount = 0;
    active.stampGrid = exact.stampGrid;
    if (!this.drawMarksToActive(exact.marks)) return this.failActive("surface-render");
    active.markCount = exact.marks.length;
    active.r8AlphaMapBytes = exact.r8AlphaMapBytes;
    if (!this.flattenActiveToSettled(active.style.opacity)) {
      return this.failActive("surface-render");
    }
    this.settled.push({
      style: active.style,
      source: detachedSource(active.source),
    });
    const result = {
      status: "settled" as const,
      dabCount: exact.dabCount,
      markCount: exact.marks.length,
      ...(exact.acceptedPrefixReceipt
        ? { acceptedPrefixReceipt: exact.acceptedPrefixReceipt }
        : {}),
    };
    this.resetActiveState();
    this.clearActiveRect();
    return result;
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

  clearSettled(): number {
    return this.releaseSettledPrefix(this.settled.length);
  }

  resetActive(): boolean {
    if (!this.active) return false;
    this.resetActiveState();
    this.clearActiveRect();
    return true;
  }

  clear(): void {
    this.resetActiveState();
    this.settled = [];
    this.clearActiveRect();
    this.clearSettledRect();
  }

  private appendDabs(
    active: ActiveDynamicStroke,
    dabs: readonly StudioDynamicBrushDab[],
  ): StudioLiveDynamicBrushAppendResult {
    if (dabs.length === 0) {
      return {
        status: "noop",
        consumedSourcePoints: active.consumedSourcePoints,
        appendedDabs: 0,
        appendedMarks: 0,
      };
    }
    const markBudget = isStudioDynamicBrushCausalDepositPipeline(
      active.style.dynamics.depositPipeline,
    )
      ? causalMarkBudget(active.style.dynamics)
      : STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET;
    const causal = isStudioDynamicBrushCausalDepositPipeline(
      active.style.dynamics.depositPipeline,
    );
    const causalBudget = causal
      ? planStudioDynamicBrushRenderBudget({
          settings: active.style.dynamics,
          dabCount: active.plannedCausalDabCount,
          symmetryCount: active.style.transforms.length,
          markBudget,
        })
      : null;
    if (causalBudget?.acceptedPrefixReceipt) {
      active.acceptedPrefixReceipt = causalBudget.acceptedPrefixReceipt;
    }
    // Consume causal slots from the global conservative receipt, not from actual visible mark
    // count. Zero-alpha/zero-flow dabs still own an immutable prefix slot; otherwise later visible
    // dabs could appear live and disappear when pointer-up replay applies the global dab ceiling.
    const acceptedDabLimit = causalBudget
      ? Math.max(
          0,
          causalBudget.maxDabsPerVariation - active.acceptedCausalDabCount,
        )
      : dabs.length;
    const acceptedDabPrefix = acceptedDabLimit < dabs.length
      ? dabs.slice(0, acceptedDabLimit)
      : dabs;
    if (acceptedDabPrefix.length === 0) {
      return {
        status: "noop",
        consumedSourcePoints: active.consumedSourcePoints,
        appendedDabs: 0,
        appendedMarks: 0,
        ...(active.acceptedPrefixReceipt
          ? { acceptedPrefixReceipt: active.acceptedPrefixReceipt }
          : {}),
      };
    }
    const remainingMarks = markBudget - active.markCount;
    if (remainingMarks <= 0) {
      if (!causal) return this.failActive("mark-budget");
      return {
        status: "noop",
        consumedSourcePoints: active.consumedSourcePoints,
        appendedDabs: 0,
        appendedMarks: 0,
        ...(active.acceptedPrefixReceipt
          ? { acceptedPrefixReceipt: active.acceptedPrefixReceipt }
          : {}),
      };
    }
    const variations = studioDynamicBrushDabVariationsFromTransforms(
      acceptedDabPrefix,
      active.style.transforms,
    );
    const plan = planStudioDynamicBrushCoverageMarks({
      dabVariations: variations,
      strokeOrigins: active.style.strokeOrigins,
      dynamics: active.style.dynamics,
      dynamicSeed: active.style.seed,
      stroke: active.style.color,
      stampGrid: active.stampGrid,
      markBudget: remainingMarks,
      r8AlphaMapByteBudget: Math.max(
        0,
        STUDIO_DYNAMIC_COVERAGE_R8_ALPHA_MAP_BYTE_BUDGET
          - active.r8AlphaMapBytes,
      ),
    });
    if (!plan.ok) {
      return this.failActive(
        plan.reason === "mark-budget" ? "mark-budget" : "material-plan",
      );
    }
    if (active.markCount + plan.marks.length > markBudget) {
      return this.failActive("mark-budget");
    }
    if (!this.drawMarksToActive(plan.marks)) return this.failActive("surface-render");
    const acceptedDabs = plan.acceptedPrefixReceipt
      ? plan.acceptedPrefixReceipt.acceptedDabsPerVariation
      : acceptedDabPrefix.length;
    if (causal) {
      active.acceptedCausalDabCount += acceptedDabs;
    }
    active.markCount += plan.marks.length;
    active.r8AlphaMapBytes +=
      plan.r8TextureAlphaMapReceipt?.alphaMapBytes ?? 0;
    return {
      status: acceptedDabs > 0 ? "appended" : "noop",
      consumedSourcePoints: active.consumedSourcePoints,
      appendedDabs: acceptedDabs,
      appendedMarks: plan.marks.length,
      ...(active.acceptedPrefixReceipt
        ? { acceptedPrefixReceipt: active.acceptedPrefixReceipt }
        : {}),
    };
  }

  private appendCausalFrom(
    element: DrawEl,
    active: ActiveDynamicStroke,
    total: number,
  ): StudioLiveDynamicBrushAppendResult {
    const causalState = active.causalState;
    if (!causalState) return this.failActive("material-plan");
    const samples: DynamicSourceSample[] = [];
    for (
      let sourceIndex = active.consumedSourcePoints;
      sourceIndex < total;
      sourceIndex += 1
    ) {
      const next = sourceSampleAt(
        element,
        sourceIndex,
        active.style.dynamics.fallbackPressure,
      );
      if (!next) return this.failActive("invalid-sample");
      samples.push(next);
      appendSourceSample(active.source, next);
      active.consumedSourcePoints = sourceIndex + 1;
    }
    const usesContinuation = studioDynamicBrushDepositPipelineUsesContinuation(
      active.style.dynamics.depositPipeline,
    );
    if (
      usesContinuation !== (
        causalState.version === 3
      )
    ) return this.failActive("material-plan");
    const planned = causalState.version === 3
      ? appendStudioCausalDynamicBrushDepositsV3(
          causalState,
          samples,
          active.style.dynamics,
        )
      : appendStudioCausalDynamicBrushDepositsV2(
          causalState,
          samples,
          active.style.dynamics,
        );
    if (!planned.ok) {
      return this.failActive(
        planned.reason === "dab-budget"
          ? "dab-budget"
          : planned.reason === "invalid-input"
            ? "invalid-sample"
            : "material-plan",
      );
    }
    active.causalState = planned.state;
    active.previousSample = planned.state.previousSample;
    active.totalDistance = planned.state.totalDistance;
    active.distanceSinceLastDab = planned.state.distanceSinceLastDab;
    active.nextDabIndex = planned.state.nextDabIndex;
    active.plannedCausalDabCount = planned.state.nextDabIndex;
    active.lastSpacing = planned.state.lastSpacing;
    active.transitionedFromTap = planned.state.transitionedFromTap;

    let appendedDabs = planned.dabs;
    let replacementDabs = 0;
    let replacementMarks = 0;
    if (planned.replaceInitialTap) {
      this.clearActiveRect();
      active.markCount = 0;
      active.r8AlphaMapBytes = 0;
      active.acceptedCausalDabCount = 0;
      active.acceptedPrefixReceipt = undefined;
      const [replacement, ...suffix] = planned.dabs;
      if (!replacement) return this.failActive("material-plan");
      const replacementResult = this.appendDabs(active, [replacement]);
      if (replacementResult.status === "fallback") return replacementResult;
      replacementDabs = replacementResult.appendedDabs;
      replacementMarks = replacementResult.appendedMarks;
      appendedDabs = suffix;
    }
    const rendered = this.appendDabs(active, appendedDabs);
    if (rendered.status === "fallback") return rendered;
    const totalAcceptedDabs = replacementDabs + rendered.appendedDabs;
    return {
      status: totalAcceptedDabs > 0 || replacementMarks > 0
        ? "appended"
        : "noop",
      consumedSourcePoints: active.consumedSourcePoints,
      appendedDabs: totalAcceptedDabs,
      appendedMarks: replacementMarks + rendered.appendedMarks,
      ...(active.acceptedPrefixReceipt
        ? { acceptedPrefixReceipt: active.acceptedPrefixReceipt }
        : {}),
    };
  }

  /**
   * Legacy dynamic snapshots derive taper, station redistribution and stamp-grid density from the
   * current whole path. An incremental replica used a one-dab grid forever, exposing circular
   * alpha-map samples that disappeared when pointer-up rebuilt the canonical plan. Consume only
   * the unseen source suffix, then redraw the accepted prefix through the exact same planner used
   * by pointer-up and retained replay.
   */
  private appendCanonicalFrom(
    element: DrawEl,
    active: ActiveDynamicStroke,
    total: number,
  ): StudioLiveDynamicBrushAppendResult {
    const previousDabCount = active.nextDabIndex;
    for (
      let sourceIndex = active.consumedSourcePoints;
      sourceIndex < total;
      sourceIndex += 1
    ) {
      const next = sourceSampleAt(
        element,
        sourceIndex,
        active.style.dynamics.fallbackPressure,
      );
      if (!next) return this.failActive("invalid-sample");
      const segmentLength = Math.hypot(
        next.x - active.previousSample.x,
        next.y - active.previousSample.y,
      );
      if (!Number.isFinite(segmentLength)) return this.failActive("invalid-sample");
      appendSourceSample(active.source, next);
      active.consumedSourcePoints = sourceIndex + 1;
      active.totalDistance += segmentLength;
      active.previousSample = next;
    }

    const exact = this.exactPlan(active.style, active.source);
    if (!exact) return this.failActive("material-plan");
    this.clearActiveRect();
    active.markCount = 0;
    active.stampGrid = exact.stampGrid;
    if (!this.drawMarksToActive(exact.marks)) {
      return this.failActive("surface-render");
    }
    active.markCount = exact.marks.length;
    active.r8AlphaMapBytes = exact.r8AlphaMapBytes;
    active.nextDabIndex = exact.dabCount;
    active.lastSpacing = Math.max(
      0.25,
      exact.lastSpacing,
    );
    active.distanceSinceLastDab = 0;
    active.transitionedFromTap = active.totalDistance > POINT_EPSILON;
    return {
      status: "appended",
      consumedSourcePoints: active.consumedSourcePoints,
      appendedDabs: Math.max(0, exact.dabCount - previousDabCount),
      appendedMarks: exact.marks.length,
    };
  }

  private exactPlan(
    style: DetachedDynamicStrokeStyle,
    source: DynamicStrokeSource,
  ): ExactDynamicPlan | null {
    if (
      isStudioDynamicBrushCausalDepositPipeline(
        style.dynamics.depositPipeline,
      )
    ) {
      const causalInput = {
        points: source.points,
        pressures: source.pressures,
        tangentialPressures: source.tangentialPressures,
        speeds: source.speeds,
        tiltXs: source.tiltXs,
        tiltYs: source.tiltYs,
        twists: source.twists,
        settings: style.dynamics,
      };
      const causal = studioDynamicBrushDepositPipelineUsesContinuation(
        style.dynamics.depositPipeline,
      )
        ? planStudioCausalDynamicBrushDepositSegmentsV3(causalInput)
        : planStudioCausalDynamicBrushDepositsV2({
            ...causalInput,
            maximumDabs: STUDIO_CAUSAL_DYNAMIC_BRUSH_MAX_DABS,
          });
      if (!causal.ok) return null;
      const causalSegments = "segments" in causal
        ? causal.segments.map((segment) => segment.dabs)
        : null;
      const causalDabs = "dabs" in causal ? causal.dabs : null;
      const causalDabCount = causalSegments
        ? segmentedDabCount(causalSegments)
        : causalDabs!.length;
      const stampGrid = initialStampGrid(style);
      const renderBudget = planStudioDynamicBrushRenderBudget({
        settings: style.dynamics,
        dabCount: causalDabCount,
        symmetryCount: style.transforms.length,
        markBudget: causalMarkBudget(style.dynamics),
      });
      const acceptedDabCount = renderBudget.acceptedPrefixReceipt
        ? renderBudget.acceptedPrefixReceipt.acceptedDabsPerVariation
        : causalDabCount;
      const acceptedSegments = causalSegments
        ? segmentedDabPrefix(causalSegments, acceptedDabCount)
        : null;
      const acceptedDabs = acceptedSegments
        ? null
        : causalDabs!.slice(0, acceptedDabCount);
      const dabVariations = acceptedSegments
        ? segmentedDabVariations(acceptedSegments, style.transforms)
        : studioDynamicBrushDabVariationsFromTransforms(
            acceptedDabs!,
            style.transforms,
          );
      const marks = planStudioDynamicBrushCoverageMarks({
        dabVariations,
        strokeOrigins: style.strokeOrigins,
        dynamics: style.dynamics,
        dynamicSeed: style.seed,
        stroke: style.color,
        stampGrid,
        markBudget: causalMarkBudget(style.dynamics),
      });
      if (!marks.ok) return null;
      const firstDab = acceptedSegments
        ? firstSegmentedDab(acceptedSegments)
        : acceptedDabs?.[0];
      const lastDab = acceptedSegments
        ? lastSegmentedDab(acceptedSegments)
        : acceptedDabs?.at(-1);
      return {
        dabCount: acceptedDabCount,
        ...(firstDab ? { firstDab } : {}),
        lastSpacing: Math.max(0.25, lastDab?.spacing ?? 0.25),
        marks: marks.marks,
        stampGrid,
        r8AlphaMapBytes:
          marks.r8TextureAlphaMapReceipt?.alphaMapBytes ?? 0,
        dabCapped: (
          "continuationCapped" in causal
            ? causal.continuationCapped
            : causal.dabCapped
        ) || renderBudget.dabCapped,
        ...(renderBudget.acceptedPrefixReceipt
          ? { acceptedPrefixReceipt: renderBudget.acceptedPrefixReceipt }
          : {}),
      };
    }
    const planInput = {
      points: source.points,
      pressures: source.pressures,
      tangentialPressures: source.tangentialPressures,
      speeds: source.speeds,
      tiltXs: source.tiltXs,
      tiltYs: source.tiltYs,
      twists: source.twists,
      baseWidth: style.width,
      baseOpacity: style.dynamics.opacity.base,
      seed: style.seed,
    };
    let dabs = planNormalizedStudioDynamicBrushDabs(
      { ...planInput, maxDabs: MAX_LEGACY_LIVE_DABS },
      style.dynamics,
    );
    const renderBudget = planStudioDynamicBrushRenderBudget({
      settings: style.dynamics,
      dabCount: dabs.length,
      symmetryCount: style.transforms.length,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    if (renderBudget.maxDabsPerVariation < dabs.length) {
      dabs = planNormalizedStudioDynamicBrushDabs(
        { ...planInput, maxDabs: renderBudget.maxDabsPerVariation },
        style.dynamics,
      );
    }
    const marks = planStudioDynamicBrushCoverageMarks({
      dabVariations: studioDynamicBrushDabVariationsFromTransforms(
        dabs,
        style.transforms,
      ),
      strokeOrigins: style.strokeOrigins,
      dynamics: style.dynamics,
      dynamicSeed: style.seed,
      stroke: style.color,
      stampGrid: renderBudget.stampGrid,
      markBudget: STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET,
    });
    if (!marks.ok) return null;
    return {
      dabCount: dabs.length,
      ...(dabs[0] ? { firstDab: dabs[0] } : {}),
      lastSpacing: Math.max(0.25, dabs.at(-1)?.spacing ?? 0.25),
      marks: marks.marks,
      stampGrid: renderBudget.stampGrid,
      r8AlphaMapBytes:
        marks.r8TextureAlphaMapReceipt?.alphaMapBytes ?? 0,
      dabCapped: renderBudget.dabCapped || dabs.length >= MAX_LEGACY_LIVE_DABS,
    };
  }

  private drawMarksToActive(
    marks: readonly StudioDynamicBrushCoverageMark[],
  ): boolean {
    const context = this.preparedActive();
    if (!context) return false;
    try {
      for (const mark of marks) {
        renderStudioDynamicBrushCoverageMark(context, mark);
      }
      return true;
    } catch {
      return false;
    } finally {
      context.restore();
    }
  }

  private flattenActiveToSettled(opacity: number): boolean {
    const context = this.settledContext;
    const canvas = this.activeCanvas;
    if (!context || !canvas) return false;
    try {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = clamp01(opacity);
      context.drawImage(canvas, 0, 0);
      context.restore();
      return true;
    } catch {
      try {
        context.restore();
      } catch {
        // The fail-closed caller clears active authority and exposes the retained renderer.
      }
      return false;
    }
  }

  private replay(): void {
    this.clearActiveRect();
    this.clearSettledRect();
    if (!this.surfaceReady()) return;
    for (const stroke of this.settled) {
      const exact = this.exactPlan(stroke.style, stroke.source);
      if (
        !exact
        || !this.drawMarksToActive(exact.marks)
        || !this.flattenActiveToSettled(stroke.style.opacity)
      ) {
        this.fallbackReason = "surface-render";
        this.clearActiveRect();
        this.clearSettledRect();
        return;
      }
      this.clearActiveRect();
    }
    const active = this.active;
    if (!active) {
      this.setActiveCanvasOpacity(1);
      return;
    }
    const exact = this.exactPlan(active.style, active.source);
    if (!exact || !this.drawMarksToActive(exact.marks)) {
      this.failActive("surface-render");
      return;
    }
    active.markCount = exact.marks.length;
    active.r8AlphaMapBytes = exact.r8AlphaMapBytes;
    active.acceptedCausalDabCount = exact.dabCount;
    active.acceptedPrefixReceipt = exact.acceptedPrefixReceipt;
    active.stampGrid = exact.stampGrid;
    this.setActiveCanvasOpacity(active.style.opacity);
  }

  private failActive(
    reason: StudioLiveDynamicBrushFallbackReason,
  ): {
    readonly status: "fallback";
    readonly reason: StudioLiveDynamicBrushFallbackReason;
  } {
    this.fallbackReason = reason;
    this.resetActiveState();
    this.clearActiveRect();
    return { status: "fallback", reason };
  }

  private resetActiveState(): void {
    this.active = null;
    this.setActiveCanvasOpacity(1);
  }

  private surfaceReady(): boolean {
    return this.surfaceUsable
      && this.surface !== null
      && this.activeCanvas !== null
      && this.settledCanvas !== null
      && this.activeContext !== null
      && this.settledContext !== null;
  }

  private preparedActive(): CanvasRenderingContext2D | null {
    const context = this.activeContext;
    const surface = this.surface;
    if (!context || !surface || !this.surfaceUsable) return null;
    const scale = this.dpr * surface.documentScale;
    context.save();
    if (surface.flipX) {
      context.setTransform(
        -scale,
        0,
        0,
        scale,
        (surface.documentWidth * surface.documentScale - surface.left) * this.dpr,
        -surface.top * this.dpr,
      );
    } else {
      context.setTransform(
        scale,
        0,
        0,
        scale,
        -surface.left * this.dpr,
        -surface.top * this.dpr,
      );
    }
    context.globalCompositeOperation = "source-over";
    return context;
  }

  private applySurface(): void {
    const activeCanvas = this.activeCanvas;
    const settledCanvas = this.settledCanvas;
    const surface = this.surface;
    if (!activeCanvas || !settledCanvas || !surface) {
      this.surfaceUsable = false;
      return;
    }
    const cssPixels = Math.max(1, surface.width) * Math.max(1, surface.height);
    this.surfaceUsable = cssPixels * 2 <= STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS;
    if (!this.surfaceUsable) return;
    this.dpr = liveDynamicDevicePixelRatio(surface);
    // Dynamic tip/grain/dual material must not become visibly softer while the pointer is down.
    // If both live canvases cannot retain native density, fail closed before painting a pixel and
    // let the exact retained renderer remain authoritative.
    if (this.dpr + POINT_EPSILON < nativeStudioDevicePixelRatio()) {
      this.surfaceUsable = false;
      return;
    }
    const width = Math.max(1, Math.round(surface.width * this.dpr));
    const height = Math.max(1, Math.round(surface.height * this.dpr));
    if (activeCanvas.width !== width) activeCanvas.width = width;
    if (activeCanvas.height !== height) activeCanvas.height = height;
    if (settledCanvas.width !== width) settledCanvas.width = width;
    if (settledCanvas.height !== height) settledCanvas.height = height;
    this.surfaceUsable =
      width * height * 2 <= STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS;
  }

  private setActiveCanvasOpacity(opacity: number): void {
    if (!this.activeCanvas) return;
    this.activeCanvas.style.opacity = String(clamp01(opacity));
  }

  private clearActiveRect(): void {
    this.clearCanvas(this.activeContext, this.activeCanvas);
  }

  private clearSettledRect(): void {
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
