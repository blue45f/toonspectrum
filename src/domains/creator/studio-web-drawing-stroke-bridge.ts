/**
 * Bridges clean-room web-drawing kits into the dynamic-dab planner path.
 *
 * Product call sites may pass a freehand point stream + brush id; when the brush
 * belongs to a web kit the path is rewritten into kit sample stations and mapped
 * to `StudioDynamicBrushDab` so live/commit coverage reuses the existing stamp
 * pipeline (no parallel renderer).
 */

import {
  isStudioWebAssistBrushId,
  planStudioWebAssistSamplesForBrush,
  type StudioWebAssistSample,
  STUDIO_WEB_ASSIST_BRUSH_IDS,
} from "./studio-web-drawing-assist-kit";
import {
  isStudioWebColoringBrushId,
  planStudioWebColoringSamplesForBrush,
  type StudioWebColorSample,
  STUDIO_WEB_COLORING_BRUSH_IDS,
} from "./studio-web-drawing-coloring-kit";
import {
  isStudioWebCompetitiveBrushId,
  planStudioWebCompetitiveSamplesForBrush,
  type StudioWebCompetitiveSample,
  STUDIO_WEB_COMPETITIVE_BRUSH_IDS,
} from "./studio-web-drawing-competitive-kit";

import type {
  NormalizedStudioBrushDynamicsSettings,
  StudioDynamicBrushDab,
} from "./studio-brush-dynamics";

export const STUDIO_WEB_DRAWING_STROKE_BRIDGE_VERSION =
  "web-drawing-stroke-bridge-v1" as const;

export const STUDIO_WEB_DRAWING_ALL_BRUSH_IDS = Object.freeze([
  ...STUDIO_WEB_COMPETITIVE_BRUSH_IDS,
  ...STUDIO_WEB_COLORING_BRUSH_IDS,
  ...STUDIO_WEB_ASSIST_BRUSH_IDS,
] as const);

export type StudioWebDrawingBrushId =
  (typeof STUDIO_WEB_DRAWING_ALL_BRUSH_IDS)[number];

export function isStudioWebDrawingBrushId(
  value: unknown,
): value is StudioWebDrawingBrushId {
  return typeof value === "string"
    && (STUDIO_WEB_DRAWING_ALL_BRUSH_IDS as readonly string[]).includes(value);
}

export type StudioWebDrawingBrushFamily =
  | "competitive"
  | "coloring"
  | "assist"
  | "none";

/** Classify a brush id into the clean-room kit family that owns its samples. */
export function classifyStudioWebDrawingBrushFamily(
  brushId: unknown,
): StudioWebDrawingBrushFamily {
  if (typeof brushId !== "string") return "none";
  if (isStudioWebCompetitiveBrushId(brushId)) return "competitive";
  if (isStudioWebColoringBrushId(brushId)) return "coloring";
  if (isStudioWebAssistBrushId(brushId)) return "assist";
  return "none";
}

export interface StudioWebDrawingBridgePlanAudit {
  readonly family: StudioWebDrawingBrushFamily;
  readonly pathPointCount: number;
  readonly sampleCount: number;
  readonly dabCount: number;
  readonly maxDabs: number;
  readonly stride: number;
  /** True when sample stations were decimated to fit maxDabs. */
  readonly budgetLimited: boolean;
  /** True when kit path was empty or brush is not a web kit. */
  readonly empty: boolean;
}

/**
 * Inspect the kit → dab conversion without allocating full dab objects when empty.
 * Live and commit planners share the same sample/stride arithmetic so audits match paint.
 */
export function auditStudioWebDrawingBridgePlan(
  input: StudioWebDrawingBridgeInput,
): StudioWebDrawingBridgePlanAudit {
  const family = classifyStudioWebDrawingBrushFamily(input.brushId);
  const path = pathFromFlat(input.points, input.pressures);
  const maxDabs = Math.max(
    1,
    Math.min(65_536, Math.round(finite(input.maxDabs, 8_192))),
  );
  if (family === "none" || path.length === 0) {
    return Object.freeze({
      family,
      pathPointCount: path.length,
      sampleCount: 0,
      dabCount: 0,
      maxDabs,
      stride: 1,
      budgetLimited: false,
      empty: true,
    });
  }
  const samples = planSamples(input.brushId as string, path, {
    baseSize: clamp(finite(input.baseWidth, 8), 0.5, 256),
    seed: input.seed,
    centerX: input.centerX,
    centerY: input.centerY,
  });
  const sampleCount = samples.length;
  if (sampleCount === 0) {
    return Object.freeze({
      family,
      pathPointCount: path.length,
      sampleCount: 0,
      dabCount: 0,
      maxDabs,
      stride: 1,
      budgetLimited: false,
      empty: true,
    });
  }
  const stride = sampleCount > maxDabs ? Math.ceil(sampleCount / maxDabs) : 1;
  const dabCount = Math.min(maxDabs, Math.ceil(sampleCount / stride));
  return Object.freeze({
    family,
    pathPointCount: path.length,
    sampleCount,
    dabCount,
    maxDabs,
    stride,
    budgetLimited: stride > 1 || dabCount < sampleCount,
    empty: false,
  });
}

export interface StudioWebDrawingBridgeInput {
  readonly brushId: unknown;
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
  readonly baseWidth?: number;
  readonly baseOpacity?: number;
  readonly seed?: number;
  readonly maxDabs?: number;
  /** Optional kaleidoscope/mirror centre (document space). */
  readonly centerX?: number;
  readonly centerY?: number;
}

type AnySample =
  | StudioWebCompetitiveSample
  | StudioWebColorSample
  | StudioWebAssistSample;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function finite(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function pathFromFlat(
  points: readonly number[],
  pressures: readonly number[] | undefined,
): { x: number; y: number; pressure: number }[] {
  const out: { x: number; y: number; pressure: number }[] = [];
  const n = Math.floor(points.length / 2);
  for (let i = 0; i < n; i++) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({
      x,
      y,
      pressure: clamp(finite(pressures?.[i], 0.55), 0.02, 1),
    });
  }
  return out;
}

function planSamples(
  brushId: string,
  path: readonly { x: number; y: number; pressure: number }[],
  options: {
    baseSize?: number;
    seed?: number;
    centerX?: number;
    centerY?: number;
  },
): readonly AnySample[] {
  if (isStudioWebCompetitiveBrushId(brushId)) {
    return planStudioWebCompetitiveSamplesForBrush(brushId, path, {
      baseSize: options.baseSize,
      seed: options.seed,
    });
  }
  if (isStudioWebColoringBrushId(brushId)) {
    return planStudioWebColoringSamplesForBrush(brushId, path, {
      baseSize: options.baseSize,
      seed: options.seed,
    });
  }
  if (isStudioWebAssistBrushId(brushId)) {
    return planStudioWebAssistSamplesForBrush(brushId, path, {
      baseSize: options.baseSize,
      seed: options.seed,
      centerX: options.centerX,
      centerY: options.centerY,
    });
  }
  return Object.freeze([]);
}

function sampleAngle(sample: AnySample): number {
  if ("angleRadians" in sample && typeof sample.angleRadians === "number") {
    return (sample.angleRadians * 180) / Math.PI;
  }
  return 0;
}

function sampleAgent(sample: AnySample): number {
  if ("agent" in sample && typeof sample.agent === "number") return sample.agent;
  return 0;
}

/**
 * When `brushId` is a web-drawing kit identity, return kit-authored dabs.
 * Otherwise return `null` so callers keep the ordinary dynamics planner.
 */
export function planStudioWebDrawingDynamicDabs(
  input: StudioWebDrawingBridgeInput,
  settings: NormalizedStudioBrushDynamicsSettings,
): StudioDynamicBrushDab[] | null {
  if (!isStudioWebDrawingBrushId(input.brushId)) return null;
  const path = pathFromFlat(input.points, input.pressures);
  if (path.length === 0) return [];

  const baseWidth = clamp(finite(input.baseWidth, settings.width.base), 0.5, 256);
  const baseOpacity = clamp(finite(input.baseOpacity, settings.opacity.base), 0.02, 1);
  const maxDabs = Math.max(
    1,
    Math.min(
      65_536,
      Math.round(finite(input.maxDabs, 8_192)),
    ),
  );

  const samples = planSamples(input.brushId, path, {
    baseSize: baseWidth,
    seed: input.seed ?? settings.seed,
    centerX: input.centerX,
    centerY: input.centerY,
  });
  if (samples.length === 0) return [];

  const stride = samples.length > maxDabs
    ? Math.ceil(samples.length / maxDabs)
    : 1;
  const dabs: StudioDynamicBrushDab[] = [];
  let prevX = samples[0]!.x;
  let prevY = samples[0]!.y;
  let traveled = 0;
  let outIndex = 0;
  for (let i = 0; i < samples.length; i += stride) {
    const s = samples[i]!;
    const dist = Math.hypot(s.x - prevX, s.y - prevY);
    if (outIndex > 0) traveled += dist;
    const size = clamp(s.size, 0.25, 256);
    const opacity = clamp(s.opacity * baseOpacity, 0.02, 1);
    const flow = clamp(settings.flow.base, 0.05, 1);
    dabs.push({
      index: outIndex,
      progress: samples.length <= 1 ? 0 : i / (samples.length - 1),
      sourceX: s.x,
      sourceY: s.y,
      x: s.x,
      y: s.y,
      size,
      opacity,
      flow,
      spacing: Math.max(0.25, dist),
      scatter: 0,
      angle: sampleAngle(s),
      roundness: clamp(settings.roundness.base, 0.05, 1),
      direction: sampleAngle(s),
      distanceFromPrevious: outIndex === 0 ? 0 : dist,
      distanceFromStrokeStart: traveled,
      contactFactor: size * opacity * flow,
      // Preserve multi-agent / fold identity for diagnostics without changing mark shape.
      contactLoadFromStrokeStart: sampleAgent(s),
    });
    prevX = s.x;
    prevY = s.y;
    outIndex += 1;
    if (dabs.length >= maxDabs) break;
  }
  return dabs;
}

/**
 * Prefer web-kit dabs when available; otherwise fall through to `fallback`.
 */
export function planStudioWebAwareDynamicBrushDabs(
  input: StudioWebDrawingBridgeInput & {
    readonly settings: NormalizedStudioBrushDynamicsSettings;
  },
  fallback: (
    planInput: {
      points: readonly number[];
      pressures?: readonly number[];
      baseWidth?: number;
      baseOpacity?: number;
      seed?: number;
      maxDabs?: number;
    },
    settings: NormalizedStudioBrushDynamicsSettings,
  ) => StudioDynamicBrushDab[],
): StudioDynamicBrushDab[] {
  const web = planStudioWebDrawingDynamicDabs(input, input.settings);
  if (web) return web;
  return fallback(
    {
      points: input.points,
      pressures: input.pressures,
      baseWidth: input.baseWidth,
      baseOpacity: input.baseOpacity,
      seed: input.seed,
      maxDabs: input.maxDabs,
    },
    input.settings,
  );
}

/** Live pointer frames target ~4k Canvas marks (see STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET). */
export const STUDIO_WEB_DRAWING_LIVE_MARK_BUDGET_DEFAULT = 4_096;

export interface StudioWebDrawingLiveMaxDabsRecommendation {
  readonly family: StudioWebDrawingBrushFamily;
  readonly maxDabs: number;
  readonly sampleCount: number;
  readonly uncappedDabCount: number;
  readonly markBudget: number;
  readonly marksPerDab: number;
  readonly capped: boolean;
  readonly empty: boolean;
}

/**
 * Recommend a live maxDabs ceiling from kit sample volume and the live mark budget.
 * Competitive swarms (multi-agent) often explode samples; this keeps pointer frames under budget
 * without changing committed document fidelity (callers still pass higher max for commit).
 */
export function recommendStudioWebDrawingLiveMaxDabs(
  input: StudioWebDrawingBridgeInput & {
    readonly markBudget?: number;
    readonly marksPerDab?: number;
  },
): StudioWebDrawingLiveMaxDabsRecommendation {
  const markBudget = Math.max(
    1,
    Math.round(finite(input.markBudget, STUDIO_WEB_DRAWING_LIVE_MARK_BUDGET_DEFAULT)),
  );
  const marksPerDab = Math.max(1, Math.round(finite(input.marksPerDab, 1)));
  const audit = auditStudioWebDrawingBridgePlan({
    ...input,
    // Uncapped sample count for capacity planning.
    maxDabs: 65_536,
  });
  if (audit.empty || audit.family === "none") {
    return Object.freeze({
      family: audit.family,
      maxDabs: 1,
      sampleCount: 0,
      uncappedDabCount: 0,
      markBudget,
      marksPerDab,
      capped: false,
      empty: true,
    });
  }
  const byMarks = Math.max(1, Math.floor(markBudget / marksPerDab));
  const callerCap = Math.max(
    1,
    Math.min(65_536, Math.round(finite(input.maxDabs, byMarks))),
  );
  const maxDabs = Math.min(byMarks, callerCap, audit.sampleCount);
  return Object.freeze({
    family: audit.family,
    maxDabs,
    sampleCount: audit.sampleCount,
    uncappedDabCount: audit.sampleCount,
    markBudget,
    marksPerDab,
    capped: maxDabs < audit.sampleCount,
    empty: false,
  });
}

/**
 * Progressive live-frame slice under a hard ceiling.
 *
 * When decimating, keeps the stroke **endpoint** (last dab) so live preview does not
 * leave the tip frozen mid-path. Same array reference when no slice is needed.
 */
export function sliceStudioDynamicDabsForLiveFrame<
  T extends { readonly index: number },
>(
  dabs: readonly T[],
  maxDabs: number,
): {
  readonly dabs: readonly T[];
  readonly sliced: boolean;
  readonly dropped: number;
  readonly preservedEndpoint: boolean;
} {
  const limit = Math.max(0, Math.floor(maxDabs));
  if (limit <= 0) {
    return Object.freeze({
      dabs: Object.freeze([] as T[]),
      sliced: true,
      dropped: dabs.length,
      preservedEndpoint: false,
    });
  }
  if (dabs.length <= limit) {
    return Object.freeze({
      dabs,
      sliced: false,
      dropped: 0,
      preservedEndpoint: false,
    });
  }
  if (limit === 1) {
    // Prefer the newest tip so the cursor feels attached to the stroke end.
    const tip = dabs[dabs.length - 1]!;
    return Object.freeze({
      dabs: Object.freeze([tip]),
      sliced: true,
      dropped: dabs.length - 1,
      preservedEndpoint: true,
    });
  }
  const head = dabs.slice(0, limit - 1);
  const last = dabs[dabs.length - 1]!;
  const alreadyHasLast = head[head.length - 1] === last;
  const out = alreadyHasLast ? dabs.slice(0, limit) : [...head, last];
  return Object.freeze({
    dabs: Object.freeze(out),
    sliced: true,
    dropped: dabs.length - out.length,
    preservedEndpoint: true,
  });
}
