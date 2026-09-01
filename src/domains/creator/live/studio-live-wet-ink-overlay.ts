/**
 * Low-latency physical wet-ink overlay.
 *
 * Pointer frames consume only the unseen accepted-sample suffix through the same seeded causal
 * walker as committed wet ink. Newly emitted dabs are deposited into a sparse 4x water/pigment
 * field and only its dirty tiles are simulated/uploaded. Pointer-up replaces the disposable live
 * field with the complete `studio-wet-ink-brush-runtime` replay before flattening, so endpoint,
 * seed, runtime version and digest are byte-identical to StudioDrawNode's committed snapshot.
 */

import { mapStudioBrushAliasPressure } from "../brush/studio-brush-alias-profile";
import { depositStudioInkwashFluidStroke } from "../brush/studio-inkwash-fluid";
import { isStudioInkwashFluidBrush } from "../brush/studio-inkwash-fluid-brushes";
import {
  commitStudioInkwashWash,
  ensureStudioInkwashWash,
  getStudioInkwashWash,
  markStudioInkwashWashDeposited,
  resetStudioInkwashWash,
  studioInkwashDocumentToField,
  studioInkwashWashDisplay,
  upsertStudioInkwashWashStroke,
} from "../brush/studio-inkwash-wash";
import { studioWetInkInteractiveBackendSupportsElement } from "../brush/studio-wet-ink-backend-capability";
import {
  planStudioWetInkBrushReplay,
  resolveStudioWetInkBrushPhysicalRecipe,
  stepStudioInkwashFluid,
  studioWetInkBrushRuntimeSupportsElement,
  STUDIO_WET_INK_BRUSH_FIELD_SCALE,
  STUDIO_WET_INK_BRUSH_SIMULATION_STEPS,
  type StudioWetInkBrushPhysicalRecipe,
  type StudioWetInkBrushReplayPlan,
  type StudioWetInkBrushSurface,
  type StudioWetInkBrushSurfaceFactory,
} from "../brush/studio-wet-ink-brush-runtime";
import {
  consumeStudioWetInkDirtyBounds,
  createStudioWetInkField,
  depositStudioWetInkDabs,
  planStudioWetInkTileUploads,
  simulateStudioWetInkField,
  type StudioWetInkBounds,
  type StudioWetInkField,
  type StudioWetInkTileUpload,
} from "../brush/studio-wet-ink-field";
import {
  appendCausalWatercolorBrush,
  beginCausalWatercolorBrush,
  type StudioCausalWatercolorState,
} from "../studio-causal-watercolor-brush";
import {
  acquireStudioLowLatencyCanvas2dContext,
  decideStudioNativeLiveSurfaceResolution,
  STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS,
} from "../studio-low-latency-canvas";

import type { DrawEl } from "../studio-element-model";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";
import type { WatercolorBrushDab } from "../brush/studio-watercolor-brush";

const MAX_LIVE_DABS = 4_096;
const MAX_LIVE_TILES = 4_096;
const MAX_LIVE_CELLS = 4_194_304;
const MAX_LIVE_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_COORDINATE_ABS = 1_000_000;
/**
 * Committed wet-ink settles with STUDIO_WET_INK_BRUSH_SIMULATION_STEPS (16). Live used to run
 * only 1 step per pointer suffix on the dirty region, so the stroke looked dry/beaded mid-drag
 * and then jumped on pointer-up when the exact 16-step plan replaced it.
 *
 * Adaptive local steps keep pointer frames cheap on large dirty regions while making short/medium
 * strokes look much closer to the settled material.
 */
const LIVE_SIMULATION_STEPS_MIN = 3;
const LIVE_SIMULATION_STEPS_MAX = 8;
const LIVE_SIMULATION_CATCH_UP_CAP = 4;
const POINT_EPSILON = 1e-6;

/** Exported for tests — how many diffusion steps a live dirty suffix should take. */
export function resolveStudioLiveWetInkSimulationSteps(
  dirty: Pick<StudioWetInkBounds, "width" | "height"> | null | undefined,
  options?: {
    readonly catchUpDebt?: number;
  },
): number {
  if (!dirty || dirty.width <= 0 || dirty.height <= 0) return 0;
  const area = dirty.width * dirty.height;
  let steps: number;
  if (area <= 64 * 64) steps = LIVE_SIMULATION_STEPS_MAX;
  else if (area <= 128 * 128) steps = 6;
  else if (area <= 256 * 256) steps = 4;
  else steps = LIVE_SIMULATION_STEPS_MIN;
  const debt = Math.max(0, Math.floor(options?.catchUpDebt ?? 0));
  if (debt > 0) {
    steps = Math.min(
      LIVE_SIMULATION_STEPS_MAX + LIVE_SIMULATION_CATCH_UP_CAP,
      steps + Math.min(LIVE_SIMULATION_CATCH_UP_CAP, debt),
    );
  }
  return steps;
}

export interface StudioLiveWetInkOverlayCanvases {
  readonly activeCanvas: HTMLCanvasElement;
  readonly settledCanvas: HTMLCanvasElement;
}

export interface StudioLiveWetInkAuthority {
  readonly pageEpoch: string | number;
  readonly signal?: Pick<AbortSignal, "aborted"> | null;
  readonly hidden?: boolean | (() => boolean);
}

export interface StudioLiveWetInkOverlayOptions {
  readonly surfaceFactory?: StudioWetInkBrushSurfaceFactory;
}

export type StudioLiveWetInkUnavailableReason =
  | "surface-unavailable"
  | "surface-budget"
  | "native-scale-unsupported"
  | "surface-render";

export type StudioLiveWetInkRejectedReason =
  | "unsupported-snapshot"
  | "hidden"
  | "aborted"
  | "stale-page"
  | "stroke-identity"
  | "source-prefix"
  | "invalid-sample"
  | "field-budget"
  | "dab-budget"
  | "simulation-budget"
  | "upload-budget"
  | "exact-replay";

export type StudioLiveWetInkFailureReason =
  | StudioLiveWetInkUnavailableReason
  | StudioLiveWetInkRejectedReason;

export type StudioLiveWetInkOperationFailure =
  | {
      readonly status: "unavailable";
      readonly reason: StudioLiveWetInkUnavailableReason;
    }
  | {
      readonly status: "rejected";
      readonly reason: StudioLiveWetInkRejectedReason;
    };

function wetInkOperationFailure(
  reason: StudioLiveWetInkFailureReason,
): StudioLiveWetInkOperationFailure {
  return reason === "surface-unavailable"
    || reason === "surface-budget"
    || reason === "native-scale-unsupported"
    || reason === "surface-render"
    ? { status: "unavailable", reason }
    : { status: "rejected", reason };
}

export type StudioLiveWetInkBeginResult =
  | {
      readonly status: "started";
      readonly consumedSourcePoints: number;
      readonly appendedDabs: number;
    }
  | StudioLiveWetInkOperationFailure;

export type StudioLiveWetInkAppendResult =
  | {
      readonly status: "appended" | "noop";
      readonly consumedSourcePoints: number;
      readonly appendedDabs: number;
      readonly uploadedTiles: number;
    }
  | StudioLiveWetInkOperationFailure;

export type StudioLiveWetInkEndResult =
  | {
      readonly status: "settled";
      readonly fieldDigest: string;
      readonly revision: number;
      readonly seed: number;
      readonly uploadedTiles: number;
    }
  | StudioLiveWetInkOperationFailure;

interface ActiveWetInkStroke {
  readonly recipe: StudioWetInkBrushPhysicalRecipe;
  readonly styleSignature: string;
  readonly pageEpoch: string | number;
  readonly field: StudioWetInkField;
  readonly fieldOriginCellX: number;
  readonly fieldOriginCellY: number;
  readonly causal: StudioCausalWatercolorState;
  consumedSourcePoints: number;
  previousSourceX: number;
  previousSourceY: number;
  /** Live diffusion steps already applied (toward committed settle quality). */
  simulationApplied: number;
  /** Extra steps owed so long strokes approach committed 16-step settle. */
  simulationDebt: number;
  /** Suffix paint frames since stroke begin (for catch-up pacing). */
  paintFrames: number;
}

interface ActiveInkwashStroke {
  readonly recipe: StudioWetInkBrushPhysicalRecipe;
  readonly styleSignature: string;
  readonly pageEpoch: string | number;
  consumedSourcePoints: number;
  previousSourceX: number;
  previousSourceY: number;
}

interface PreparedUpload {
  readonly upload: StudioWetInkTileUpload;
  readonly surface: StudioWetInkBrushSurface;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number"
    && Number.isFinite(value)
    && Math.abs(value) <= MAX_COORDINATE_ABS
    ? value
    : null;
}

function authorityGuard(
  authority: StudioLiveWetInkAuthority,
): "hidden" | "aborted" | null {
  if (authority.signal?.aborted) return "aborted";
  try {
    const hidden = typeof authority.hidden === "function"
      ? authority.hidden()
      : authority.hidden === true;
    return hidden ? "hidden" : null;
  } catch {
    return "hidden";
  }
}

function styleSignature(
  element: DrawEl,
  recipe: StudioWetInkBrushPhysicalRecipe,
): string {
  return [
    recipe.runtimeVersion,
    element.id,
    element.kind ?? "freehand",
    element.mode ?? "pen",
    recipe.brushId,
    element.watercolorPipeline ?? "",
    element.stroke,
    element.strokeWidth,
    element.opacity ?? 1,
    recipe.compositeOpacity,
    recipe.seed,
  ].join("\u001f");
}

function defaultSurfaceFactory(
  width: number,
  height: number,
): StudioWetInkBrushSurface | null {
  try {
    if (typeof globalThis.OffscreenCanvas === "function") {
      const surface = new globalThis.OffscreenCanvas(width, height);
      if (surface.getContext("2d")) return surface as StudioWetInkBrushSurface;
    }
    if (typeof globalThis.document !== "undefined") {
      const surface = globalThis.document.createElement("canvas");
      surface.width = width;
      surface.height = height;
      return surface as StudioWetInkBrushSurface;
    }
  } catch {
    return null;
  }
  return null;
}

function surfaceChanged(
  left: StudioLiveInkSurface | null,
  right: StudioLiveInkSurface | null,
): boolean {
  return !left || !right
    || left.left !== right.left
    || left.top !== right.top
    || left.width !== right.width
    || left.height !== right.height
    || left.documentScale !== right.documentScale
    || left.documentWidth !== right.documentWidth
    || left.flipX !== right.flipX;
}

function inkwashStrokeFieldGeometry(
  element: DrawEl,
  recipe: StudioWetInkBrushPhysicalRecipe,
): {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
} | null {
  const pointCount = Math.floor(element.points.length / 2);
  if (pointCount < 1) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < pointCount; index += 1) {
    const x = finiteCoordinate(element.points[index * 2]);
    const y = finiteCoordinate(element.points[index * 2 + 1]);
    if (x === null || y === null) return null;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const scale = STUDIO_WET_INK_BRUSH_FIELD_SCALE;
  const margin = Math.max(24, recipe.baseWidth * 4);
  const originX = minX - margin;
  const originY = minY - margin;
  const width = Math.ceil((maxX - minX + margin * 2) * scale);
  const height = Math.ceil((maxY - minY + margin * 2) * scale);
  if (width <= 0 || height <= 0 || !Number.isSafeInteger(width * height)) return null;
  return { originX, originY, width, height };
}

function liveFieldGeometry(
  surface: StudioLiveInkSurface,
  recipe: StudioWetInkBrushPhysicalRecipe,
): {
  readonly originCellX: number;
  readonly originCellY: number;
  readonly width: number;
  readonly height: number;
} | null {
  const scale = surface.documentScale;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const visibleWidth = surface.width / scale;
  const visibleHeight = surface.height / scale;
  const visibleLeft = surface.flipX
    ? surface.documentWidth - (surface.left + surface.width) / scale
    : surface.left / scale;
  const visibleTop = surface.top / scale;
  if (
    !Number.isFinite(visibleLeft)
    || !Number.isFinite(visibleTop)
    || !Number.isFinite(visibleWidth)
    || !Number.isFinite(visibleHeight)
  ) return null;
  const fieldScale = STUDIO_WET_INK_BRUSH_FIELD_SCALE;
  const margin = Math.max(
    fieldScale * 4,
    Math.ceil(recipe.baseWidth * fieldScale * 0.75) + 6,
  );
  const originCellX = Math.floor(visibleLeft * fieldScale) - margin;
  const originCellY = Math.floor(visibleTop * fieldScale) - margin;
  const width = Math.ceil(visibleWidth * fieldScale) + margin * 2 + 1;
  const height = Math.ceil(visibleHeight * fieldScale) + margin * 2 + 1;
  if (
    !Number.isSafeInteger(originCellX)
    || !Number.isSafeInteger(originCellY)
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || width > MAX_COORDINATE_ABS
    || height > MAX_COORDINATE_ABS
    || !Number.isSafeInteger(width * height)
  ) return null;
  return { originCellX, originCellY, width, height };
}

function fullFieldBounds(field: StudioWetInkField): StudioWetInkBounds {
  return { x: 0, y: 0, width: field.config.width, height: field.config.height };
}

/**
 * Exact support gate used by StudioPage before hiding its retained draft.
 */
export function studioLiveWetInkOverlaySupportsElement(element: DrawEl): boolean {
  if (element.hidden === true) return false;
  if (
    isStudioInkwashFluidBrush(element.brush)
    && studioWetInkBrushRuntimeSupportsElement(element)
  ) {
    return true;
  }
  return studioWetInkInteractiveBackendSupportsElement(element);
}

export class StudioLiveWetInkOverlayRenderer {
  private readonly surfaceFactory: StudioWetInkBrushSurfaceFactory;
  private activeCanvas: HTMLCanvasElement | null = null;
  private settledCanvas: HTMLCanvasElement | null = null;
  private activeContext: CanvasRenderingContext2D | null = null;
  private settledContext: CanvasRenderingContext2D | null = null;
  private surface: StudioLiveInkSurface | null = null;
  private dpr = 1;
  private surfaceUsable = false;
  private surfaceFailure: StudioLiveWetInkUnavailableReason = "surface-unavailable";
  private active: ActiveWetInkStroke | null = null;
  private activeInkwash: ActiveInkwashStroke | null = null;
  private inkwashOverlayOwned = false;
  private settled: StudioWetInkBrushReplayPlan[] = [];
  private lastFailureReason: StudioLiveWetInkFailureReason | null = null;
  /** Reused offscreen tile canvases keyed by "w×h" to cut live-frame GC pressure. */
  private readonly tileSurfacePool = new Map<string, StudioWetInkBrushSurface[]>();

  constructor(options: StudioLiveWetInkOverlayOptions = {}) {
    this.surfaceFactory = options.surfaceFactory ?? defaultSurfaceFactory;
  }

  attach(canvases: StudioLiveWetInkOverlayCanvases | null): void {
    this.activeCanvas = canvases?.activeCanvas ?? null;
    this.settledCanvas = canvases?.settledCanvas ?? null;
    this.activeContext = this.activeCanvas
      ? acquireStudioLowLatencyCanvas2dContext(this.activeCanvas)
      : null;
    this.settledContext = this.settledCanvas
      ? acquireStudioLowLatencyCanvas2dContext(this.settledCanvas)
      : null;
    this.applySurface();
    if (this.active || this.activeInkwash || this.settled.length > 0) this.replay();
  }

  setSurface(surface: StudioLiveInkSurface | null): void {
    const previous = this.surface;
    this.surface = surface;
    if (!surfaceChanged(previous, surface)) return;
    this.applySurface();
    if (this.active || this.activeInkwash || this.settled.length > 0) this.replay();
  }

  get isActive(): boolean {
    return this.active !== null || this.activeInkwash !== null;
  }

  get hasSettledStrokes(): boolean {
    return this.settled.length > 0;
  }

  get settledStrokeCount(): number {
    return this.settled.length;
  }

  get lastOperationFailureReason(): StudioLiveWetInkFailureReason | null {
    return this.lastFailureReason;
  }

  get isNativeSurfaceReady(): boolean {
    return this.surfaceReady();
  }

  begin(
    element: DrawEl,
    authority: StudioLiveWetInkAuthority,
  ): StudioLiveWetInkBeginResult {
    const guarded = authorityGuard(authority);
    if (guarded) return wetInkOperationFailure(guarded);
    const recipe = resolveStudioWetInkBrushPhysicalRecipe(element);
    if (!recipe || element.hidden === true) {
      return wetInkOperationFailure("unsupported-snapshot");
    }
    if (!this.surfaceReady()) {
      return wetInkOperationFailure(this.surfaceFailure);
    }
    if (isStudioInkwashFluidBrush(recipe.brushId)) {
      return this.beginInkwash(element, recipe, authority);
    }
    const firstX = finiteCoordinate(element.points[0]);
    const firstY = finiteCoordinate(element.points[1]);
    if (firstX === null || firstY === null) {
      return wetInkOperationFailure("invalid-sample");
    }
    const geometry = liveFieldGeometry(this.surface!, recipe);
    if (!geometry) return wetInkOperationFailure("field-budget");
    const field = createStudioWetInkField({
      width: geometry.width,
      height: geometry.height,
      tileSize: 64,
      seed: recipe.seed,
      maxTiles: MAX_LIVE_TILES,
      maxCells: MAX_LIVE_CELLS,
      maxSimulationSteps: 1_000_000,
      maxUploadBytes: MAX_LIVE_UPLOAD_BYTES,
      absorption: recipe.material.absorption,
      bleed: recipe.material.bleed,
      dryingRate: recipe.material.dryingRate,
      edgeDarkening: recipe.material.edgeDarkening,
      fixationRate: recipe.material.fixationRate,
      granulation: recipe.material.granulation,
      paperRoughness: recipe.material.paperRoughness,
      inkColor: recipe.inkColor,
    });
    if (!field.ok) return wetInkOperationFailure("field-budget");
    const firstPressure = mapStudioBrushAliasPressure(
      recipe.brushId,
      element.pressures?.[0],
      0.55,
    );
    const started = beginCausalWatercolorBrush(
      {
        x: firstX * recipe.fieldScale - geometry.originCellX,
        y: firstY * recipe.fieldScale - geometry.originCellY,
        pressure: firstPressure,
      },
      {
        baseWidth: recipe.baseWidth * recipe.fieldScale,
        spacing: recipe.spacing * recipe.fieldScale,
        seed: recipe.seed,
        maxDabs: MAX_LIVE_DABS,
        diffuse: true,
      },
    );
    if (!started) return wetInkOperationFailure("invalid-sample");

    this.resetActiveState();
    this.clearActiveRect();
    const active: ActiveWetInkStroke = {
      recipe,
      styleSignature: styleSignature(element, recipe),
      pageEpoch: authority.pageEpoch,
      field: field.value,
      fieldOriginCellX: geometry.originCellX,
      fieldOriginCellY: geometry.originCellY,
      causal: started.state,
      consumedSourcePoints: 1,
      previousSourceX: firstX,
      previousSourceY: firstY,
      simulationApplied: 0,
      simulationDebt: 0,
      paintFrames: 0,
    };
    this.active = active;
    this.setActiveCanvasOpacity(recipe.compositeOpacity);
    const painted = this.depositAndPaint(active, started.dabs);
    if (painted.status === "unavailable" || painted.status === "rejected") return painted;
    this.lastFailureReason = null;
    return {
      status: "started",
      consumedSourcePoints: 1,
      appendedDabs: started.dabs.length,
    };
  }

  appendFrom(
    element: DrawEl,
    authority: StudioLiveWetInkAuthority,
  ): StudioLiveWetInkAppendResult {
    if (this.lastFailureReason) {
      return wetInkOperationFailure(this.lastFailureReason);
    }
    if (this.activeInkwash) {
      return this.appendInkwash(element, authority);
    }
    const active = this.active;
    if (!active) {
      return wetInkOperationFailure("surface-unavailable");
    }
    const guarded = authorityGuard(authority);
    if (guarded) return this.failActive(guarded);
    if (!Object.is(active.pageEpoch, authority.pageEpoch)) {
      return this.failActive("stale-page");
    }
    const recipe = resolveStudioWetInkBrushPhysicalRecipe(element);
    if (
      !recipe
      || element.hidden === true
      || styleSignature(element, recipe) !== active.styleSignature
    ) {
      return this.failActive("stroke-identity");
    }
    const total = Math.floor(element.points.length / 2);
    if (total < active.consumedSourcePoints) return this.failActive("source-prefix");
    if (total === active.consumedSourcePoints) {
      return {
        status: "noop",
        consumedSourcePoints: total,
        appendedDabs: 0,
        uploadedTiles: 0,
      };
    }
    const previousIndex = active.consumedSourcePoints - 1;
    if (
      finiteCoordinate(element.points[previousIndex * 2]) !== active.previousSourceX
      || finiteCoordinate(element.points[previousIndex * 2 + 1]) !== active.previousSourceY
    ) {
      return this.failActive("source-prefix");
    }

    const appendedDabs: WatercolorBrushDab[] = [];
    for (
      let sourceIndex = active.consumedSourcePoints;
      sourceIndex < total;
      sourceIndex += 1
    ) {
      const x = finiteCoordinate(element.points[sourceIndex * 2]);
      const y = finiteCoordinate(element.points[sourceIndex * 2 + 1]);
      if (x === null || y === null) return this.failActive("invalid-sample");
      const pressure = mapStudioBrushAliasPressure(
        recipe.brushId,
        element.pressures?.[sourceIndex],
        0.55,
      );
      appendedDabs.push(...appendCausalWatercolorBrush(active.causal, {
        x: x * recipe.fieldScale - active.fieldOriginCellX,
        y: y * recipe.fieldScale - active.fieldOriginCellY,
        pressure,
      }));
      active.consumedSourcePoints = sourceIndex + 1;
      active.previousSourceX = x;
      active.previousSourceY = y;
    }
    if (active.causal.capped) return this.failActive("dab-budget");
    return this.depositAndPaint(active, appendedDabs);
  }

  end(
    element: DrawEl,
    authority: StudioLiveWetInkAuthority,
  ): StudioLiveWetInkEndResult {
    if (this.lastFailureReason) {
      return wetInkOperationFailure(this.lastFailureReason);
    }
    if (this.activeInkwash) {
      return this.endInkwash(element, authority);
    }
    const active = this.active;
    if (!active) return wetInkOperationFailure("surface-unavailable");
    const guardedBeforePlan = authorityGuard(authority);
    if (guardedBeforePlan) return this.failActive(guardedBeforePlan);
    if (!Object.is(active.pageEpoch, authority.pageEpoch)) {
      return this.failActive("stale-page");
    }
    const recipe = resolveStudioWetInkBrushPhysicalRecipe(element);
    if (
      !recipe
      || element.hidden === true
      || styleSignature(element, recipe) !== active.styleSignature
    ) {
      return this.failActive("stroke-identity");
    }
    const total = Math.floor(element.points.length / 2);
    const previousIndex = active.consumedSourcePoints - 1;
    const appendCompatible =
      total >= active.consumedSourcePoints
      && finiteCoordinate(element.points[previousIndex * 2]) === active.previousSourceX
      && finiteCoordinate(element.points[previousIndex * 2 + 1]) === active.previousSourceY;
    if (appendCompatible) {
      const appended = this.appendFrom(element, authority);
      if (appended.status === "unavailable" || appended.status === "rejected") return appended;
    }
    // Release-time stabilization/post-correction may replace an already visible prefix. The live
    // suffix field is disposable; the exact full replay below is the only safe rewrite and avoids
    // treating a legitimate sealed geometry replacement as endpoint loss.
    const exact = planStudioWetInkBrushReplay(element, { phase: "live" });
    if (!exact.ok) return this.failActive("exact-replay");
    const guarded = authorityGuard(authority);
    if (guarded) return this.failActive(guarded);
    if (!Object.is(active.pageEpoch, authority.pageEpoch)) {
      return this.failActive("stale-page");
    }
    if (!this.drawExactPlanToActive(exact.value)) {
      return this.failActive("surface-render");
    }
    if (!this.flattenActiveToSettled(exact.value.compositeOpacity)) {
      return this.failActive("surface-render");
    }
    this.settled.push(exact.value);
    const result: StudioLiveWetInkEndResult = {
      status: "settled",
      fieldDigest: exact.value.fieldDigest,
      revision: exact.value.revision,
      seed: exact.value.seed,
      uploadedTiles: exact.value.uploads.length,
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
    const stillOwnsInkwash = this.activeInkwash !== null
      || this.settled.some((plan) => isStudioInkwashFluidBrush(plan.brushId));
    if (!stillOwnsInkwash && this.inkwashOverlayOwned) {
      commitStudioInkwashWash();
      this.inkwashOverlayOwned = false;
    }
    this.replay();
    return released;
  }

  clearSettled(): number {
    return this.releaseSettledPrefix(this.settled.length);
  }

  resetActive(): boolean {
    const hadOperation = this.active !== null
      || this.activeInkwash !== null
      || this.lastFailureReason !== null;
    if (!hadOperation) return false;
    this.resetActiveState();
    this.lastFailureReason = null;
    this.clearActiveRect();
    return true;
  }

  clear(): void {
    this.resetActiveState();
    this.inkwashOverlayOwned = false;
    resetStudioInkwashWash();
    this.lastFailureReason = null;
    this.settled = [];
    this.clearActiveRect();
    this.clearSettledRect();
  }

  private depositAndPaint(
    active: ActiveWetInkStroke,
    dabs: readonly WatercolorBrushDab[],
  ): StudioLiveWetInkAppendResult {
    if (dabs.length === 0) {
      return {
        status: "noop",
        consumedSourcePoints: active.consumedSourcePoints,
        appendedDabs: 0,
        uploadedTiles: 0,
      };
    }
    const deposited = depositStudioWetInkDabs(active.field, {
      dabs,
      hardness: active.recipe.material.hardness,
      waterLoad: active.recipe.material.waterLoad,
      pigmentLoad: active.recipe.material.pigmentLoad,
      wetnessLoad: active.recipe.material.wetnessLoad,
      maxDabs: MAX_LIVE_DABS,
    });
    if (!deposited.ok) {
      return this.failActive(
        deposited.code === "dab-budget-exceeded" ? "dab-budget" : "field-budget",
      );
    }
    if (!deposited.value.dirtyBounds) {
      return {
        status: "noop",
        consumedSourcePoints: active.consumedSourcePoints,
        appendedDabs: dabs.length,
        uploadedTiles: 0,
      };
    }
    // Live transport is deliberately local to the newest dirty suffix. Older wet tiles retain
    // their material until exact pointer-up replay, keeping pointer-frame cost independent of the
    // already accepted prefix. Simulation depth is adaptive so mid-stroke wash looks closer to
    // the committed 16-step settle without running a full-field 16 steps every sample.
    active.field.activeBounds = deposited.value.dirtyBounds;
    active.paintFrames += 1;
    // Pace catch-up: by stroke end we want ~committed steps applied across the life of the stroke.
    const targetLive = STUDIO_WET_INK_BRUSH_SIMULATION_STEPS;
    const expectedByNow = Math.min(
      targetLive,
      Math.ceil((active.paintFrames / Math.max(8, active.paintFrames + 4)) * targetLive),
    );
    active.simulationDebt = Math.max(
      0,
      expectedByNow - active.simulationApplied,
    );
    const steps = resolveStudioLiveWetInkSimulationSteps(deposited.value.dirtyBounds, {
      catchUpDebt: active.simulationDebt,
    });
    const simulated = simulateStudioWetInkField(active.field, steps);
    if (!simulated.ok) return this.failActive("simulation-budget");
    active.simulationApplied += simulated.value.appliedSteps;
    active.simulationDebt = Math.max(
      0,
      active.simulationDebt - simulated.value.appliedSteps,
    );
    const dirty = active.field.dirtyBounds;
    const uploads = planStudioWetInkTileUploads(active.field, dirty);
    if (!uploads.ok) return this.failActive("upload-budget");
    if (!this.drawUploadsToActive(
      uploads.value,
      active.fieldOriginCellX / active.recipe.fieldScale,
      active.fieldOriginCellY / active.recipe.fieldScale,
      true,
    )) {
      return this.failActive("surface-render");
    }
    consumeStudioWetInkDirtyBounds(active.field);
    return {
      status: "appended",
      consumedSourcePoints: active.consumedSourcePoints,
      appendedDabs: dabs.length,
      uploadedTiles: uploads.value.length,
    };
  }

  private acquireTileSurface(width: number, height: number): StudioWetInkBrushSurface | null {
    const key = `${width}x${height}`;
    const pool = this.tileSurfacePool.get(key);
    const pooled = pool?.pop();
    if (pooled) return pooled;
    return this.surfaceFactory(width, height);
  }

  private releaseTileSurface(surface: StudioWetInkBrushSurface): void {
    const width = surface.width;
    const height = surface.height;
    if (
      !Number.isFinite(width)
      || !Number.isFinite(height)
      || width <= 0
      || height <= 0
    ) {
      return;
    }
    const key = `${width}x${height}`;
    const pool = this.tileSurfacePool.get(key) ?? [];
    // Cap per-size pool so long strokes cannot retain unbounded canvases.
    if (pool.length >= 12) return;
    pool.push(surface);
    this.tileSurfacePool.set(key, pool);
  }

  private prepareUploads(
    uploads: readonly StudioWetInkTileUpload[],
  ): PreparedUpload[] | null {
    const bytes = uploads.reduce(
      (sum, upload) => sum + upload.width * upload.height * 4,
      0,
    );
    if (bytes > MAX_LIVE_UPLOAD_BYTES) return null;
    const prepared: PreparedUpload[] = [];
    try {
      for (const upload of uploads) {
        const surface = this.acquireTileSurface(upload.width, upload.height);
        const context = surface?.getContext("2d", { willReadFrequently: false });
        if (!surface || !context) {
          for (const item of prepared) this.releaseTileSurface(item.surface);
          return null;
        }
        const imageData = context.createImageData(upload.width, upload.height);
        imageData.data.set(upload.rgba);
        context.putImageData(imageData, 0, 0);
        prepared.push({ upload, surface });
      }
      return prepared;
    } catch {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      return null;
    }
  }

  private drawUploadsToActive(
    uploads: readonly StudioWetInkTileUpload[],
    originX: number,
    originY: number,
    replaceTiles: boolean,
  ): boolean {
    const prepared = this.prepareUploads(uploads);
    if (!prepared) return false;
    const context = this.preparedActive();
    if (!context) {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      return false;
    }
    try {
      for (const item of prepared) {
        const destinationX =
          originX + item.upload.x / STUDIO_WET_INK_BRUSH_FIELD_SCALE;
        const destinationY =
          originY + item.upload.y / STUDIO_WET_INK_BRUSH_FIELD_SCALE;
        const destinationWidth =
          item.upload.width / STUDIO_WET_INK_BRUSH_FIELD_SCALE;
        const destinationHeight =
          item.upload.height / STUDIO_WET_INK_BRUSH_FIELD_SCALE;
        if (replaceTiles) {
          context.clearRect(
            destinationX,
            destinationY,
            destinationWidth,
            destinationHeight,
          );
        }
        context.drawImage(
          item.surface,
          0,
          0,
          item.upload.width,
          item.upload.height,
          destinationX,
          destinationY,
          destinationWidth,
          destinationHeight,
        );
      }
      return true;
    } catch {
      return false;
    } finally {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      context.restore();
    }
  }

  private drawExactPlanToActive(plan: StudioWetInkBrushReplayPlan): boolean {
    const prepared = this.prepareUploads(plan.uploads);
    if (!prepared) return false;
    const context = this.preparedActive();
    if (!context) {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      return false;
    }
    try {
      // Preparation happens before this mutation, so allocation/upload failures leave the current
      // accepted prefix intact while the host chooses how to handle the failed operation.
      context.restore();
      this.clearActiveRect();
      this.setActiveCanvasOpacity(plan.compositeOpacity);
      return this.drawPreparedUploads(plan.uploads, prepared, plan.originX, plan.originY);
    } catch {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      try {
        context.restore();
      } catch {
        // Fail closed; caller clears active authority.
      }
      return false;
    }
  }

  private drawPreparedUploads(
    uploads: readonly StudioWetInkTileUpload[],
    prepared: readonly PreparedUpload[],
    originX: number,
    originY: number,
  ): boolean {
    if (uploads.length !== prepared.length) {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      return false;
    }
    const context = this.preparedActive();
    if (!context) {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      return false;
    }
    try {
      for (const item of prepared) {
        context.drawImage(
          item.surface,
          0,
          0,
          item.upload.width,
          item.upload.height,
          originX + item.upload.x / STUDIO_WET_INK_BRUSH_FIELD_SCALE,
          originY + item.upload.y / STUDIO_WET_INK_BRUSH_FIELD_SCALE,
          item.upload.width / STUDIO_WET_INK_BRUSH_FIELD_SCALE,
          item.upload.height / STUDIO_WET_INK_BRUSH_FIELD_SCALE,
        );
      }
      return true;
    } catch {
      return false;
    } finally {
      for (const item of prepared) this.releaseTileSurface(item.surface);
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
        // Fail closed; caller exposes the retained renderer.
      }
      return false;
    }
  }

  private replay(): void {
    this.clearActiveRect();
    this.clearSettledRect();
    if (!this.surfaceReady()) return;
    if (this.inkwashOverlayOwned && getStudioInkwashWash()) {
      if (!this.drawInkwashWash() || !this.flattenActiveToSettled(1)) {
        this.lastFailureReason = "surface-render";
        this.clearActiveRect();
        this.clearSettledRect();
        return;
      }
      this.clearActiveRect();
    }
    for (const plan of this.settled) {
      if (isStudioInkwashFluidBrush(plan.brushId) && this.inkwashOverlayOwned) continue;
      if (
        !this.drawExactPlanToActive(plan)
        || !this.flattenActiveToSettled(plan.compositeOpacity)
      ) {
        this.lastFailureReason = "surface-render";
        this.clearActiveRect();
        this.clearSettledRect();
        return;
      }
      this.clearActiveRect();
    }
    const active = this.active;
    if (this.activeInkwash) {
      if (!this.drawInkwashWash()) {
        this.failActive("surface-render");
        return;
      }
      this.lastFailureReason = null;
      this.setActiveCanvasOpacity(this.activeInkwash.recipe.compositeOpacity);
      return;
    }
    if (!active) return;
    const uploads = planStudioWetInkTileUploads(
      active.field,
      fullFieldBounds(active.field),
    );
    if (
      !uploads.ok
      || !this.drawUploadsToActive(
        uploads.value,
        active.fieldOriginCellX / active.recipe.fieldScale,
        active.fieldOriginCellY / active.recipe.fieldScale,
        false,
      )
    ) {
      this.failActive(uploads.ok ? "surface-render" : "upload-budget");
      return;
    }
    this.lastFailureReason = null;
    this.setActiveCanvasOpacity(active.recipe.compositeOpacity);
  }

  private failActive(
    reason: StudioLiveWetInkFailureReason,
  ): StudioLiveWetInkOperationFailure {
    // Keep the accepted source/visible prefix intact until the host explicitly cancels this
    // operation or selects a later one. A failure result never chooses another renderer.
    this.lastFailureReason = reason;
    return wetInkOperationFailure(reason);
  }

  private beginInkwash(
    element: DrawEl,
    recipe: StudioWetInkBrushPhysicalRecipe,
    authority: StudioLiveWetInkAuthority,
  ): StudioLiveWetInkBeginResult {
    const firstX = finiteCoordinate(element.points[0]);
    const firstY = finiteCoordinate(element.points[1]);
    if (firstX === null || firstY === null) {
      return wetInkOperationFailure("invalid-sample");
    }
    const existing = getStudioInkwashWash();
    if (existing && existing.pageEpoch !== null
      && !Object.is(existing.pageEpoch, authority.pageEpoch)) {
      resetStudioInkwashWash();
    }
    if (!this.growInkwashWash(element, recipe, authority.pageEpoch)) {
      return wetInkOperationFailure("field-budget");
    }
    this.inkwashOverlayOwned = true;
    this.resetActiveState();
    this.clearActiveRect();
    this.activeInkwash = {
      recipe,
      styleSignature: styleSignature(element, recipe),
      pageEpoch: authority.pageEpoch,
      consumedSourcePoints: 0,
      previousSourceX: firstX,
      previousSourceY: firstY,
    };
    this.setActiveCanvasOpacity(recipe.compositeOpacity);
    const painted = this.paintInkwashSuffix(element, 0);
    if (painted.status === "unavailable" || painted.status === "rejected") return painted;
    this.lastFailureReason = null;
    return {
      status: "started",
      consumedSourcePoints: this.activeInkwash.consumedSourcePoints,
      appendedDabs: 1,
    };
  }

  private appendInkwash(
    element: DrawEl,
    authority: StudioLiveWetInkAuthority,
  ): StudioLiveWetInkAppendResult {
    const active = this.activeInkwash;
    if (!active || !getStudioInkwashWash()) {
      return wetInkOperationFailure("surface-unavailable");
    }
    const guarded = authorityGuard(authority);
    if (guarded) return this.failActive(guarded);
    if (!Object.is(active.pageEpoch, authority.pageEpoch)) {
      return this.failActive("stale-page");
    }
    const recipe = resolveStudioWetInkBrushPhysicalRecipe(element);
    if (
      !recipe
      || element.hidden === true
      || styleSignature(element, recipe) !== active.styleSignature
    ) {
      return this.failActive("stroke-identity");
    }
    return this.paintInkwashSuffix(element, active.consumedSourcePoints);
  }

  private growInkwashWash(
    element: DrawEl,
    recipe: StudioWetInkBrushPhysicalRecipe,
    pageEpoch: string | number,
  ): ReturnType<typeof getStudioInkwashWash> {
    const geometry = inkwashStrokeFieldGeometry(element, recipe);
    if (!geometry) return null;
    return ensureStudioInkwashWash({
      pageEpoch,
      originX: geometry.originX,
      originY: geometry.originY,
      width: geometry.width,
      height: geometry.height,
      fieldScale: STUDIO_WET_INK_BRUSH_FIELD_SCALE,
    });
  }

  private endInkwash(
    element: DrawEl,
    authority: StudioLiveWetInkAuthority,
  ): StudioLiveWetInkEndResult {
    const active = this.activeInkwash;
    if (!active || !getStudioInkwashWash()) {
      return wetInkOperationFailure("surface-unavailable");
    }
    const appended = this.appendInkwash(element, authority);
    if (appended.status === "unavailable" || appended.status === "rejected") return appended;
    const recipe = resolveStudioWetInkBrushPhysicalRecipe(element);
    if (!recipe || !this.growInkwashWash(element, recipe, active.pageEpoch)) {
      return this.failActive("field-budget");
    }
    upsertStudioInkwashWashStroke(element);
    markStudioInkwashWashDeposited(element);
    const exact = planStudioWetInkBrushReplay(element, { phase: "live" });
    if (!exact.ok) return this.failActive("exact-replay");
    this.clearSettledRect();
    this.clearActiveRect();
    if (!this.drawInkwashWash()) return this.failActive("surface-render");
    if (!this.flattenActiveToSettled(active.recipe.compositeOpacity)) {
      return this.failActive("surface-render");
    }
    this.settled = this.settled.filter((plan) => !isStudioInkwashFluidBrush(plan.brushId));
    this.settled.push(exact.value);
    const result: StudioLiveWetInkEndResult = {
      status: "settled",
      fieldDigest: exact.value.fieldDigest,
      revision: exact.value.revision,
      seed: exact.value.seed,
      uploadedTiles: 1,
    };
    this.resetActiveState();
    this.clearActiveRect();
    return result;
  }

  private paintInkwashSuffix(
    element: DrawEl,
    fromIndex: number,
  ): StudioLiveWetInkAppendResult {
    const active = this.activeInkwash;
    if (!active) return wetInkOperationFailure("surface-unavailable");
    const wash = this.growInkwashWash(element, active.recipe, active.pageEpoch);
    if (!wash) return this.failActive("field-budget");
    const total = Math.floor(element.points.length / 2);
    if (total < fromIndex) return this.failActive("source-prefix");
    if (total === fromIndex) {
      return {
        status: "noop",
        consumedSourcePoints: total,
        appendedDabs: 0,
        uploadedTiles: 0,
      };
    }
    const samples: Array<{ x: number; y: number; pressure: number; timeMs: number }> = [];
    for (let index = fromIndex; index < total; index += 1) {
      const x = finiteCoordinate(element.points[index * 2]);
      const y = finiteCoordinate(element.points[index * 2 + 1]);
      if (x === null || y === null) return this.failActive("invalid-sample");
      const field = studioInkwashDocumentToField(wash, x, y);
      samples.push({
        x: field.x,
        y: field.y,
        pressure: mapStudioBrushAliasPressure(
          active.recipe.brushId,
          element.pressures?.[index],
          0.55,
        ),
        timeMs: index * (1_000 / 240),
      });
      active.previousSourceX = x;
      active.previousSourceY = y;
    }
    depositStudioInkwashFluidStroke(wash.session, {
      tool: active.recipe.brushId === "inkwash-water-brush" ? "water" : "pen",
      samples,
      radius: active.recipe.baseWidth * STUDIO_WET_INK_BRUSH_FIELD_SCALE * 0.5,
      pigmentLoad: active.recipe.material.pigmentLoad,
      wetnessLoad: active.recipe.material.wetnessLoad,
      spectralAbsorption: active.recipe.material.spectralAbsorption,
      inkColor: active.recipe.inkColor,
    });
    stepStudioInkwashFluid(wash.session, 4);
    active.consumedSourcePoints = total;
    if (!this.drawInkwashWash()) return this.failActive("surface-render");
    return {
      status: "appended",
      consumedSourcePoints: total,
      appendedDabs: samples.length,
      uploadedTiles: 1,
    };
  }

  private drawInkwashWash(): boolean {
    if (!this.inkwashOverlayOwned) return false;
    const wash = getStudioInkwashWash();
    const upload = studioInkwashWashDisplay();
    if (!wash || !upload) return false;
    const prepared = this.prepareUploads([upload]);
    if (!prepared) return false;
    const context = this.preparedActive();
    if (!context) {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      return false;
    }
    try {
      const destinationWidth = upload.width / wash.fieldScale;
      const destinationHeight = upload.height / wash.fieldScale;
      context.clearRect(wash.originX, wash.originY, destinationWidth, destinationHeight);
      context.drawImage(
        prepared[0]!.surface,
        0,
        0,
        upload.width,
        upload.height,
        wash.originX,
        wash.originY,
        destinationWidth,
        destinationHeight,
      );
      return true;
    } catch {
      return false;
    } finally {
      for (const item of prepared) this.releaseTileSurface(item.surface);
      context.restore();
    }
  }

  private resetActiveState(): void {
    this.active = null;
    this.activeInkwash = null;
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
    context.globalAlpha = 1;
    return context;
  }

  private applySurface(): void {
    const activeCanvas = this.activeCanvas;
    const settledCanvas = this.settledCanvas;
    const surface = this.surface;
    this.surfaceUsable = false;
    this.surfaceFailure = "surface-unavailable";
    if (!activeCanvas || !settledCanvas || !surface) return;
    const devicePixelRatio =
      typeof globalThis.devicePixelRatio === "number"
      && Number.isFinite(globalThis.devicePixelRatio)
        ? globalThis.devicePixelRatio
        : 1;
    const decision = decideStudioNativeLiveSurfaceResolution({
      cssWidth: surface.width,
      cssHeight: surface.height,
      devicePixelRatio,
      maximumBackingPixels: STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS / 2,
    });
    if (!decision.ok) {
      this.surfaceFailure = "surface-budget";
      return;
    }
    if (
      !Number.isFinite(surface.documentScale)
      || surface.documentScale <= 0
      || decision.devicePixelRatio * surface.documentScale
        > STUDIO_WET_INK_BRUSH_FIELD_SCALE + POINT_EPSILON
    ) {
      this.surfaceFailure = "native-scale-unsupported";
      return;
    }
    this.dpr = decision.devicePixelRatio;
    if (activeCanvas.width !== decision.backingWidth) {
      activeCanvas.width = decision.backingWidth;
    }
    if (activeCanvas.height !== decision.backingHeight) {
      activeCanvas.height = decision.backingHeight;
    }
    if (settledCanvas.width !== decision.backingWidth) {
      settledCanvas.width = decision.backingWidth;
    }
    if (settledCanvas.height !== decision.backingHeight) {
      settledCanvas.height = decision.backingHeight;
    }
    this.surfaceUsable =
      decision.backingPixels * 2 <= STUDIO_LIVE_SURFACE_MAX_BACKING_PIXELS;
    this.surfaceFailure = this.surfaceUsable ? "surface-unavailable" : "surface-budget";
  }

  private setActiveCanvasOpacity(opacity: number): void {
    if (this.activeCanvas) this.activeCanvas.style.opacity = String(clamp01(opacity));
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
    try {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
    } catch {
      try {
        context.restore();
      } catch {
        // Detached/failed surfaces are already non-authoritative.
      }
    }
  }
}
