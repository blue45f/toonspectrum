/**
 * Bounded stroke-local coverage renderer for versioned dynamic brushes.
 *
 * Dynamic dabs are first flattened into deterministic RGBA ellipse marks. The coverage pass bins
 * those marks into world-aligned tiles, renders every tile completely off destination, then applies
 * the element opacity once while compositing the tiles. This avoids both the historical per-dab
 * opacity darkening and a canvas-sized offscreen allocation.
 */

import {
  resolveNormalizedStudioBrushDabColor,
  resolveNormalizedStudioBrushGrainAlphaMultiplierAt,
} from "./studio-brush-material-dynamics";
import {
  composeNormalizedStudioBrushTipLayerDab,
  composeStudioBrushDualTipAlphaMap,
  studioBrushDualBrushIsActive,
  studioBrushDualTipUsesSolidEllipse,
  type StudioBrushComposableDab,
} from "./studio-brush-tip-composition";
import {
  buildStudioBrushTipAlphaMap,
  studioBrushTipUsesSolidEllipse,
  visitStudioBrushTipStampSamples,
  type NormalizedStudioBrushTipSettings,
} from "./studio-brush-tip-stamp";

import type {
  NormalizedStudioBrushDynamicsSettings,
  StudioDynamicBrushDab,
} from "./studio-brush-dynamics";
import type { StudioDynamicBrushRenderStampGrid } from "./studio-brush-render-budget";

export const STUDIO_DYNAMIC_COVERAGE_TILE_PIXEL_SIZE = 256;
export const STUDIO_DYNAMIC_COVERAGE_TILE_BLEED_PIXELS = 2;
/**
 * Live and committed passes intentionally share the same surface policy. A lower live resolution
 * produced a visible sharpness/texture pop at pointer-up on Retina and zoomed canvases. Live work
 * remains lower because its upstream dab/mark ceiling is 4k rather than the committed 65k ceiling.
 */
export const STUDIO_DYNAMIC_COVERAGE_ACTIVE_BYTE_BUDGET = 64 * 1024 * 1024;
export const STUDIO_DYNAMIC_COVERAGE_COMMITTED_BYTE_BUDGET =
  STUDIO_DYNAMIC_COVERAGE_ACTIVE_BYTE_BUDGET;
export const STUDIO_DYNAMIC_COVERAGE_ACTIVE_TILE_MARK_REFERENCE_BUDGET = 262_144;
export const STUDIO_DYNAMIC_COVERAGE_COMMITTED_TILE_MARK_REFERENCE_BUDGET =
  STUDIO_DYNAMIC_COVERAGE_ACTIVE_TILE_MARK_REFERENCE_BUDGET;
/**
 * Retained dynamic strokes are redrawn whenever Konva repaints their layer. Rebuilding every
 * unchanged stroke into fresh coverage tiles on each cursor frame is both redundant and extremely
 * expensive: one short G-pen stroke previously expanded into ~23k offscreen ellipse calls during
 * the following stroke. Keep a bounded LRU of immutable committed tile rasters instead.
 *
 * The cache is intentionally separate from the per-stroke 64 MiB admission budget. It holds about
 * 480 ordinary 258×258 RGBA tiles on desktop and 180 on mobile/low-memory devices, and is reclaimed
 * eagerly on eviction or Studio document teardown; active drafts never enter it, so pointer input
 * cannot fill the cache with one-frame previews.
 */
export const STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_BYTE_BUDGET =
  128 * 1024 * 1024;
export const STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_MOBILE_BYTE_BUDGET =
  48 * 1024 * 1024;

export interface StudioDynamicCoverageCommittedCacheDeviceProfile {
  readonly coarsePointer: boolean;
  readonly deviceMemoryGb: number | null;
}

export function resolveStudioDynamicCoverageCommittedCacheByteBudget(
  profile: StudioDynamicCoverageCommittedCacheDeviceProfile,
): number {
  const lowMemory = profile.deviceMemoryGb !== null
    && Number.isFinite(profile.deviceMemoryGb)
    && profile.deviceMemoryGb > 0
    && profile.deviceMemoryGb <= 4;
  return profile.coarsePointer || lowMemory
    ? STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_MOBILE_BYTE_BUDGET
    : STUDIO_DYNAMIC_COVERAGE_COMMITTED_CACHE_BYTE_BUDGET;
}

export interface StudioDynamicBrushCoverageMark {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly angleRadians: number;
  /** Dab opacity × flow × tip alpha × grain. Element/stroke opacity is deliberately absent. */
  readonly alpha: number;
  readonly color: string;
  /**
   * Procedural soft tips remain one analytic mark instead of expanding into a grid of small
   * circles. Absence means the historical solid-ellipse/custom-alpha mark.
   */
  readonly falloff?: Readonly<{
    readonly kind: "analytic-radial";
    /** Alpha at normalized radius r is `(1 - r) ^ exponent`. */
    readonly exponent: number;
  }>;
}

export interface StudioDynamicBrushCoverageMarkPlanInput {
  readonly dabVariations: readonly (readonly StudioDynamicBrushDab[])[];
  /**
   * Optional full-stroke origins for suffix-only planning. Without this, each variation's first
   * supplied dab is the origin, which is correct for full plans but would shift stroke-fixed grain
   * when an incremental caller supplies only newly appended dabs.
   */
  readonly strokeOrigins?: readonly Readonly<{ x: number; y: number }>[];
  readonly dynamics: NormalizedStudioBrushDynamicsSettings;
  readonly dynamicSeed: number;
  readonly stroke: string;
  readonly stampGrid: StudioDynamicBrushRenderStampGrid;
  /** Same live/committed mark ceiling used to plan the dab count and stamp grid. */
  readonly markBudget: number;
}

export type StudioDynamicBrushCoverageMarkPlan =
  | {
      readonly ok: true;
      readonly marks: readonly StudioDynamicBrushCoverageMark[];
    }
  | {
      readonly ok: false;
      readonly reason: "invalid-mark" | "mark-budget";
    };

export interface StudioDynamicBrushCoverageAndLegacyMarkPlan {
  readonly coveragePlan: StudioDynamicBrushCoverageMarkPlan;
  /**
   * Complete legacy replay marks. In particular, a coverage mark-budget rejection must never turn
   * into an empty stroke at the caller's fallback boundary.
   */
  readonly legacyMarks: readonly StudioDynamicBrushCoverageMark[];
}

export type StudioCoverageSurfaceContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type StudioCoverageSurface = CanvasImageSource & {
  width: number;
  height: number;
  getContext(
    contextId: "2d",
    options?: CanvasRenderingContext2DSettings
  ): StudioCoverageSurfaceContext | null;
};

export type StudioCoverageSurfaceFactory = (
  width: number,
  height: number
) => StudioCoverageSurface | null;

export interface StudioDynamicBrushCoverageDestinationContext {
  globalAlpha: number;
  save(): void;
  restore(): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sourceWidth: number,
    sourceHeight: number,
    destinationX: number,
    destinationY: number,
    destinationWidth: number,
    destinationHeight: number
  ): void;
  /** Konva exposes the native scene context here; ordinary Canvas contexts expose getTransform. */
  _context?: Pick<CanvasRenderingContext2D, "getTransform">;
  getTransform?: () => DOMMatrix;
}

export interface StudioDynamicBrushLegacyDestinationContext
  extends StudioDynamicBrushCoverageDestinationContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  beginPath(): void;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): CanvasGradient;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): void;
  ellipse?(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number
  ): void;
  fill(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
}

export interface StudioDynamicBrushCoverageRenderOptions {
  readonly activeDraft: boolean;
  readonly opacity: number;
  readonly surfaceFactory?: StudioCoverageSurfaceFactory;
  /**
   * Stable identity for an immutable committed mark plan. When present on a committed render, the
   * prepared coverage tiles are reused across retained layer redraws at the same physical scale.
   * Reusing a key for a different marks array safely replaces the stale entry.
   */
  readonly committedCacheKey?: object | string;
}

export type StudioDynamicBrushCoverageRenderResult =
  | {
      readonly status: "rendered";
      readonly scale: number;
      readonly tileCount: number;
      readonly allocatedBytes: number;
      readonly tileMarkReferences: number;
    }
  | {
      readonly status: "empty";
    }
  | {
      readonly status: "fallback";
      readonly reason:
        | "surface-unavailable"
        | "surface-budget"
        | "tile-mark-budget"
        | "physical-scale-unsupported"
        | "surface-render-failed";
    }
  | {
      /**
       * Destination composition started before the browser threw. Replaying legacy marks would
       * double-paint the completed prefix, so callers must not fallback for this result.
       */
      readonly status: "partial";
      readonly reason: "destination-composite-failed";
    };

interface MarkBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface TileBin {
  readonly tileX: number;
  readonly tileY: number;
  readonly markIndexes: number[];
}

interface TilePlan {
  readonly bins: readonly TileBin[];
  readonly scale: number;
  readonly allocatedBytes: number;
  readonly tileMarkReferences: number;
}

interface PreparedTile extends TileBin {
  readonly surface: StudioCoverageSurface;
}

type StudioDynamicCoverageCommittedCacheKey = object | string;

interface CommittedCoverageCacheEntry {
  readonly key: StudioDynamicCoverageCommittedCacheKey;
  readonly marks: readonly StudioDynamicBrushCoverageMark[];
  readonly scale: number;
  readonly plan: TilePlan;
  readonly prepared: readonly PreparedTile[];
  lastUsed: number;
}

const TAU = Math.PI * 2;
const ANALYTIC_FALLOFF_RADIAL_STOPS = Object.freeze([
  0,
  0.125,
  0.25,
  0.375,
  0.5,
  0.625,
  0.75,
  0.875,
  1,
] as const);
const ANALYTIC_FALLOFF_EXPONENT_MIN = 0.125;
const ANALYTIC_FALLOFF_EXPONENT_MAX = 8;
const committedCoverageCache = new Map<
  StudioDynamicCoverageCommittedCacheKey,
  Map<number, CommittedCoverageCacheEntry>
>();
let committedCoverageCacheBytes = 0;
let committedCoverageCacheClock = 0;

function runtimeCommittedCoverageCacheByteBudget(): number {
  const browserNavigator = typeof globalThis.navigator === "undefined"
    ? null
    : globalThis.navigator as Navigator & { readonly deviceMemory?: number };
  const deviceMemory = browserNavigator?.deviceMemory;
  return resolveStudioDynamicCoverageCommittedCacheByteBudget({
    coarsePointer:
      globalThis.matchMedia?.("(pointer: coarse)").matches ?? false,
    deviceMemoryGb:
      typeof deviceMemory === "number" && Number.isFinite(deviceMemory)
        ? deviceMemory
        : null,
  });
}

function clampAlpha(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function markIsValid(mark: StudioDynamicBrushCoverageMark): boolean {
  return Number.isFinite(mark.x)
    && Number.isFinite(mark.y)
    && finitePositive(mark.radiusX)
    && finitePositive(mark.radiusY)
    && Number.isFinite(mark.angleRadians)
    && Number.isFinite(mark.alpha)
    && typeof mark.color === "string"
    && mark.color.length > 0
    && (
      mark.falloff === undefined
      || (
        mark.falloff.kind === "analytic-radial"
        && finitePositive(mark.falloff.exponent)
        && mark.falloff.exponent >= ANALYTIC_FALLOFF_EXPONENT_MIN
        && mark.falloff.exponent <= ANALYTIC_FALLOFF_EXPONENT_MAX
      )
    );
}

function proceduralSoftTipFalloffExponent(
  tip: NormalizedStudioBrushTipSettings
): number {
  // Mirrors the renderer-neutral procedural soft-tip contract in studio-brush-tip-stamp.
  return 1.4 + tip.softness * 2.2;
}

function tipUsesAnalyticSoftFalloff(
  tip: NormalizedStudioBrushTipSettings,
  primary: boolean,
  dualBrush: NormalizedStudioBrushDynamicsSettings["dualBrush"]
): boolean {
  const activeDual = primary && studioBrushDualBrushIsActive(dualBrush);
  return tip.shape === "soft"
    && tip.alphaMapBase64 === null
    // A screen dual is alpha union. Rendering the smooth primary first and the secondary texture
    // second with source-over is the same coverage equation, while avoiding a low-resolution
    // sampled grid across the entire soft carrier. Multiply remains on the exact composed mask.
    && (!activeDual || dualBrush?.blendMode === "screen");
}

function parseHexGradientColor(
  color: string
): readonly [red: number, green: number, blue: number, alpha: number] | null {
  const match = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(color.trim());
  if (!match) return null;
  const source = match[1]!;
  const expanded = source.length <= 4
    ? [...source].map((value) => `${value}${value}`).join("")
    : source;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
    expanded.length === 8
      ? Number.parseInt(expanded.slice(6, 8), 16) / 255
      : 1,
  ];
}

function analyticGradientColor(
  color: string,
  alpha: number
): string {
  const resolvedAlpha = clampAlpha(alpha);
  const hex = parseHexGradientColor(color);
  if (hex) {
    const [red, green, blue, sourceAlpha] = hex;
    return `rgba(${red}, ${green}, ${blue}, ${clampAlpha(sourceAlpha * resolvedAlpha)})`;
  }
  if (resolvedAlpha <= 0) return "transparent";
  if (resolvedAlpha >= 1) return color;
  // Dynamic brush colours are canonical hex in normal operation. This modern-CSS fallback keeps
  // named/wide-gamut document colours hue-correct without a DOM parser or a per-mark scratch canvas.
  return `color-mix(in srgb, ${color} ${resolvedAlpha * 100}%, transparent)`;
}

/**
 * Shared mark compositor for live, bounded committed and direct legacy paths. Keeping procedural
 * falloff here prevents pointer-up/replay from changing the airbrush footprint.
 */
export function renderStudioDynamicBrushCoverageMark(
  context: StudioDynamicBrushLegacyDestinationContext,
  mark: StudioDynamicBrushCoverageMark,
  alphaMultiplier = 1
): void {
  context.globalAlpha = clampAlpha(mark.alpha * alphaMultiplier);
  if (!mark.falloff) {
    if (context.fillStyle !== mark.color) context.fillStyle = mark.color;
    if (typeof context.ellipse === "function") {
      context.beginPath();
      context.ellipse(
        mark.x,
        mark.y,
        mark.radiusX,
        mark.radiusY,
        mark.angleRadians,
        0,
        TAU
      );
      context.fill();
      return;
    }
    if (mark.angleRadians === 0 && mark.radiusX === mark.radiusY) {
      context.beginPath();
      context.arc(mark.x, mark.y, mark.radiusX, 0, TAU);
      context.fill();
      return;
    }
    context.save();
    context.translate(mark.x, mark.y);
    context.rotate(mark.angleRadians);
    context.scale(1, mark.radiusY / mark.radiusX);
    context.beginPath();
    context.arc(0, 0, mark.radiusX, 0, TAU);
    context.fill();
    context.restore();
    return;
  }

  context.save();
  context.translate(mark.x, mark.y);
  context.rotate(mark.angleRadians);
  context.scale(1, mark.radiusY / mark.radiusX);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, mark.radiusX);
  for (const offset of ANALYTIC_FALLOFF_RADIAL_STOPS) {
    const coverage = Math.pow(1 - offset, mark.falloff.exponent);
    gradient.addColorStop(offset, analyticGradientColor(mark.color, coverage));
  }
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, mark.radiusX, 0, TAU);
  context.fill();
  context.restore();
}

/**
 * Flattens the existing dynamic-tip pipeline without changing any material channel. The returned
 * alpha intentionally excludes element opacity so both the coverage and frozen legacy compositors
 * can consume the exact same marks.
 */
export function planStudioDynamicBrushCoverageMarks(
  input: StudioDynamicBrushCoverageMarkPlanInput
): StudioDynamicBrushCoverageMarkPlan {
  const {
    dabVariations,
    dynamics,
    dynamicSeed,
    markBudget,
    stampGrid,
    stroke,
  } = input;
  const boundedMarkBudget = Number.isFinite(markBudget)
    ? Math.max(1, Math.floor(markBudget))
    : 1;
  const tipDefinitions = [
    dynamics.tip,
    ...dynamics.tipLayers.map((layer) => layer.tip),
  ];
  const grainActive = dynamics.grain.amount > 0;
  const dualBrush = dynamics.dualBrush;
  const decomposedScreenDual = studioBrushDualBrushIsActive(dualBrush)
    && dualBrush?.blendMode === "screen"
    && dynamics.tip.shape === "soft"
    && dynamics.tip.alphaMapBase64 === null
      ? {
          settings: dualBrush,
          tip: dualBrush.tip,
          alphaMap: buildStudioBrushTipAlphaMap(dualBrush.tip),
        }
      : null;
  const tipUsesAnalyticFalloff = tipDefinitions.map((tip, tipIndex) => (
    tipUsesAnalyticSoftFalloff(tip, tipIndex === 0, dualBrush)
  ));
  const tipUsesEllipse = tipDefinitions.map((tip, tipIndex) => (
    !grainActive && (tipIndex === 0
      ? studioBrushDualTipUsesSolidEllipse(tip, dualBrush)
      : studioBrushTipUsesSolidEllipse(tip))
  ));
  const tipAlphaMaps = tipDefinitions.map((tip, tipIndex) => (
    tipUsesEllipse[tipIndex] || tipUsesAnalyticFalloff[tipIndex]
      ? null
      : tipIndex === 0
        ? composeStudioBrushDualTipAlphaMap(tip, dualBrush)
        : buildStudioBrushTipAlphaMap(tip)
  ));
  const marks: StudioDynamicBrushCoverageMark[] = [];

  const appendMark = (mark: StudioDynamicBrushCoverageMark): boolean => {
    if (!markIsValid(mark)) return false;
    if (mark.alpha <= 0) return true;
    if (marks.length >= boundedMarkBudget) return false;
    marks.push(mark);
    return true;
  };

  for (const [variationIndex, dabs] of dabVariations.entries()) {
    const suppliedOrigin = input.strokeOrigins?.[variationIndex];
    const strokeOriginX = suppliedOrigin?.x ?? dabs[0]?.sourceX ?? dabs[0]?.x ?? 0;
    const strokeOriginY = suppliedOrigin?.y ?? dabs[0]?.sourceY ?? dabs[0]?.y ?? 0;
    const grainAt = dynamics.grain.amount <= 0
      ? () => 1
      : (x: number, y: number) => (
          resolveNormalizedStudioBrushGrainAlphaMultiplierAt(
            x,
            y,
            strokeOriginX,
            strokeOriginY,
            dynamicSeed,
            dynamics.grain
          )
        );
    const appendTipDab = (
      composedDab: StudioBrushComposableDab,
      tip: NormalizedStudioBrushTipSettings,
      tipIndex: number,
      dabColor: string
    ): "ok" | "invalid-mark" | "mark-budget" => {
      const depositionAlpha = clampAlpha(composedDab.opacity * composedDab.flow);
      if (depositionAlpha <= 0) return "ok";
      const tipAlphaMap = tipAlphaMaps[tipIndex] ?? null;
      if (
        tipUsesEllipse[tipIndex]
        || tipUsesAnalyticFalloff[tipIndex]
        || !tipAlphaMap
      ) {
        const radiusX = Math.max(0.25, composedDab.size / 2);
        const mark = {
          x: composedDab.x,
          y: composedDab.y,
          radiusX,
          radiusY: radiusX * composedDab.roundness,
          angleRadians: composedDab.angle * Math.PI / 180,
          alpha: clampAlpha(depositionAlpha * grainAt(composedDab.x, composedDab.y)),
          color: dabColor,
          ...(tipUsesAnalyticFalloff[tipIndex]
            ? {
                falloff: {
                  kind: "analytic-radial" as const,
                  exponent: proceduralSoftTipFalloffExponent(tip),
                },
              }
            : {}),
        };
        if (!markIsValid(mark)) return "invalid-mark";
        if (!appendMark(mark)) return "mark-budget";
        if (tipIndex !== 0 || !decomposedScreenDual) return "ok";

        const secondaryDab: StudioBrushComposableDab = {
          ...composedDab,
          size: Math.max(
            0.05,
            composedDab.size * decomposedScreenDual.settings.sizeRatio,
          ),
        };
        const secondaryRadiusX = Math.max(0.25, secondaryDab.size / 2);
        const secondaryTip = decomposedScreenDual.tip;
        const secondaryAnalytic = secondaryTip.shape === "soft"
          && secondaryTip.alphaMapBase64 === null;
        if (secondaryAnalytic || studioBrushTipUsesSolidEllipse(secondaryTip)) {
          const secondaryMark = {
            x: secondaryDab.x,
            y: secondaryDab.y,
            radiusX: secondaryRadiusX,
            radiusY: secondaryRadiusX * secondaryDab.roundness,
            angleRadians: secondaryDab.angle * Math.PI / 180,
            alpha: clampAlpha(
              depositionAlpha * grainAt(secondaryDab.x, secondaryDab.y),
            ),
            color: dabColor,
            ...(secondaryAnalytic
              ? {
                  falloff: {
                    kind: "analytic-radial" as const,
                    exponent: proceduralSoftTipFalloffExponent(secondaryTip),
                  },
                }
              : {}),
          };
          if (!markIsValid(secondaryMark)) return "invalid-mark";
          return appendMark(secondaryMark) ? "ok" : "mark-budget";
        }

        let secondaryFailure: "invalid-mark" | "mark-budget" | null = null;
        visitStudioBrushTipStampSamples(
          secondaryDab,
          decomposedScreenDual.alphaMap,
          (dx, dy, alpha, radius) => {
            if (secondaryFailure) return;
            const sampleX = secondaryDab.x + dx;
            const sampleY = secondaryDab.y + dy;
            const secondaryMark = {
              x: sampleX,
              y: sampleY,
              radiusX: radius,
              radiusY: radius,
              angleRadians: 0,
              alpha: clampAlpha(
                depositionAlpha * alpha * grainAt(sampleX, sampleY),
              ),
              color: dabColor,
            };
            if (!markIsValid(secondaryMark)) {
              secondaryFailure = "invalid-mark";
            } else if (!appendMark(secondaryMark)) {
              secondaryFailure = "mark-budget";
            }
          },
          { grid: stampGrid },
        );
        return secondaryFailure ?? "ok";
      }

      let failure: "invalid-mark" | "mark-budget" | null = null;
      visitStudioBrushTipStampSamples(
        composedDab,
        tipAlphaMap,
        (dx, dy, alpha, radius) => {
          if (failure) return;
          const sampleX = composedDab.x + dx;
          const sampleY = composedDab.y + dy;
          const mark = {
            x: sampleX,
            y: sampleY,
            radiusX: radius,
            radiusY: radius,
            angleRadians: 0,
            alpha: clampAlpha(
              depositionAlpha * alpha * grainAt(sampleX, sampleY)
            ),
            color: dabColor,
          };
          if (!markIsValid(mark)) {
            failure = "invalid-mark";
          } else if (!appendMark(mark)) {
            failure = "mark-budget";
          }
        },
        { grid: stampGrid }
      );
      return failure ?? "ok";
    };

    for (const dab of dabs) {
      const dabColor = resolveNormalizedStudioBrushDabColor(
        stroke,
        dab.index,
        dynamicSeed,
        dynamics.colorDynamics
      );
      const primaryResult = appendTipDab(dab, dynamics.tip, 0, dabColor);
      if (primaryResult !== "ok") return { ok: false, reason: primaryResult };
      for (const [layerIndex, layer] of dynamics.tipLayers.entries()) {
        const composedDab = composeNormalizedStudioBrushTipLayerDab(dab, layer);
        if (!composedDab) continue;
        const layerResult = appendTipDab(
          composedDab,
          layer.tip,
          layerIndex + 1,
          dabColor
        );
        if (layerResult !== "ok") return { ok: false, reason: layerResult };
      }
    }
  }
  return { ok: true, marks };
}

export function planStudioDynamicBrushCoverageAndLegacyMarks(
  input: StudioDynamicBrushCoverageMarkPlanInput
): StudioDynamicBrushCoverageAndLegacyMarkPlan {
  const coveragePlan = planStudioDynamicBrushCoverageMarks(input);
  if (coveragePlan.ok) {
    return { coveragePlan, legacyMarks: coveragePlan.marks };
  }
  const legacyPlan = planStudioDynamicBrushCoverageMarks({
    ...input,
    markBudget: Number.MAX_SAFE_INTEGER,
  });
  return {
    coveragePlan,
    legacyMarks: legacyPlan.ok ? legacyPlan.marks : [],
  };
}

function markBounds(mark: StudioDynamicBrushCoverageMark): MarkBounds {
  const cosine = Math.cos(mark.angleRadians);
  const sine = Math.sin(mark.angleRadians);
  const halfWidth = Math.hypot(mark.radiusX * cosine, mark.radiusY * sine);
  const halfHeight = Math.hypot(mark.radiusX * sine, mark.radiusY * cosine);
  return {
    minX: mark.x - halfWidth,
    minY: mark.y - halfHeight,
    maxX: mark.x + halfWidth,
    maxY: mark.y + halfHeight,
  };
}

function destinationPhysicalScale(
  context: StudioDynamicBrushCoverageDestinationContext
): number {
  try {
    const transform = context._context?.getTransform()
      ?? context.getTransform?.();
    if (!transform) return 1;
    const scaleX = Math.hypot(transform.a, transform.b);
    const scaleY = Math.hypot(transform.c, transform.d);
    const scale = Math.max(scaleX, scaleY);
    return finitePositive(scale) ? scale : 1;
  } catch {
    return 1;
  }
}

function candidateScales(
  context: StudioDynamicBrushCoverageDestinationContext,
  _activeDraft: boolean
): readonly number[] {
  const maximum = 4;
  const minimum = 0.75;
  const physicalScale = destinationPhysicalScale(context);
  if (physicalScale > maximum) return [];
  // Below 0.75x we oversample and let the destination transform downsample. This spends extra
  // pixels but never lowers output quality or changes document-space geometry.
  const wanted = Math.max(minimum, physicalScale);
  // Surface-budget pressure must fail closed to legacy pixels instead of silently lowering only
  // one side of the live→committed handoff.
  return [wanted];
}

function planTilesAtScale(
  marks: readonly StudioDynamicBrushCoverageMark[],
  scale: number,
  byteBudget: number,
  tileMarkReferenceBudget: number
): TilePlan | "surface-budget" | "tile-mark-budget" {
  const tilePixels = STUDIO_DYNAMIC_COVERAGE_TILE_PIXEL_SIZE;
  const bleedPixels = STUDIO_DYNAMIC_COVERAGE_TILE_BLEED_PIXELS;
  const surfacePixels = tilePixels + bleedPixels * 2;
  const bytesPerTile = surfacePixels * surfacePixels * 4;
  const maximumTiles = Math.max(1, Math.floor(byteBudget / bytesPerTile));
  const bins = new Map<string, TileBin>();
  let tileMarkReferences = 0;
  const antialiasPadding = 1 / scale;

  for (const [markIndex, mark] of marks.entries()) {
    const bounds = markBounds(mark);
    const minTileX = Math.floor((bounds.minX - antialiasPadding) * scale / tilePixels);
    const minTileY = Math.floor((bounds.minY - antialiasPadding) * scale / tilePixels);
    const maxTileX = Math.floor((bounds.maxX + antialiasPadding) * scale / tilePixels);
    const maxTileY = Math.floor((bounds.maxY + antialiasPadding) * scale / tilePixels);
    const columns = maxTileX - minTileX + 1;
    const rows = maxTileY - minTileY + 1;
    if (
      !Number.isSafeInteger(columns)
      || !Number.isSafeInteger(rows)
      || columns <= 0
      || rows <= 0
      || columns * rows > tileMarkReferenceBudget - tileMarkReferences
    ) return "tile-mark-budget";

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const key = `${tileX}:${tileY}`;
        let bin = bins.get(key);
        if (!bin) {
          if (bins.size >= maximumTiles) return "surface-budget";
          bin = { tileX, tileY, markIndexes: [] };
          bins.set(key, bin);
        }
        bin.markIndexes.push(markIndex);
        tileMarkReferences += 1;
      }
    }
  }

  return {
    bins: [...bins.values()].sort((left, right) => (
      left.tileY - right.tileY || left.tileX - right.tileX
    )),
    scale,
    allocatedBytes: bins.size * bytesPerTile,
    tileMarkReferences,
  };
}

function defaultSurfaceFactory(
  width: number,
  height: number
): StudioCoverageSurface | null {
  try {
    if (typeof globalThis.OffscreenCanvas === "function") {
      const surface = new globalThis.OffscreenCanvas(width, height);
      if (surface.getContext("2d")) return surface as StudioCoverageSurface;
    }
    if (typeof globalThis.document !== "undefined") {
      const surface = globalThis.document.createElement("canvas");
      surface.width = width;
      surface.height = height;
      return surface as StudioCoverageSurface;
    }
  } catch {
    return null;
  }
  return null;
}

function releasePreparedTiles(tiles: readonly PreparedTile[]): void {
  for (const tile of tiles) {
    // Resetting dimensions releases browser backing storage immediately on both supported hosts.
    tile.surface.width = 1;
    tile.surface.height = 1;
  }
}

function removeCommittedCoverageCacheEntry(
  entry: CommittedCoverageCacheEntry,
): void {
  const variants = committedCoverageCache.get(entry.key);
  if (variants?.get(entry.scale) === entry) {
    variants.delete(entry.scale);
    if (variants.size === 0) committedCoverageCache.delete(entry.key);
  }
  committedCoverageCacheBytes = Math.max(
    0,
    committedCoverageCacheBytes - entry.plan.allocatedBytes,
  );
  releasePreparedTiles(entry.prepared);
}

function evictCommittedCoverageCacheToBudget(
  byteBudget = runtimeCommittedCoverageCacheByteBudget(),
): void {
  while (
    committedCoverageCacheBytes
      > byteBudget
  ) {
    let oldest: CommittedCoverageCacheEntry | null = null;
    for (const variants of committedCoverageCache.values()) {
      for (const entry of variants.values()) {
        if (!oldest || entry.lastUsed < oldest.lastUsed) oldest = entry;
      }
    }
    if (!oldest) {
      committedCoverageCacheBytes = 0;
      return;
    }
    removeCommittedCoverageCacheEntry(oldest);
  }
}

function committedCoverageMarksEqual(
  left: readonly StudioDynamicBrushCoverageMark[],
  right: readonly StudioDynamicBrushCoverageMark[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftMark = left[index]!;
    const rightMark = right[index]!;
    if (
      leftMark.x !== rightMark.x
      || leftMark.y !== rightMark.y
      || leftMark.radiusX !== rightMark.radiusX
      || leftMark.radiusY !== rightMark.radiusY
      || leftMark.angleRadians !== rightMark.angleRadians
      || leftMark.alpha !== rightMark.alpha
      || leftMark.color !== rightMark.color
      || leftMark.falloff?.kind !== rightMark.falloff?.kind
      || leftMark.falloff?.exponent !== rightMark.falloff?.exponent
    ) {
      return false;
    }
  }
  return true;
}

function readCommittedCoverageCache(
  key: StudioDynamicCoverageCommittedCacheKey,
  marks: readonly StudioDynamicBrushCoverageMark[],
  scale: number,
): CommittedCoverageCacheEntry | null {
  const variants = committedCoverageCache.get(key);
  const entry = variants?.get(scale);
  if (!entry) return null;
  // React/Konva may reconstruct a deterministic mark array while retaining the same immutable
  // document element. Compare values before discarding the raster: identity-only validation made
  // every retained-layer repaint miss even though the planned pixels were byte-for-byte equal.
  if (!committedCoverageMarksEqual(entry.marks, marks)) {
    removeCommittedCoverageCacheEntry(entry);
    return null;
  }
  entry.lastUsed = ++committedCoverageCacheClock;
  return entry;
}

function writeCommittedCoverageCache(
  key: StudioDynamicCoverageCommittedCacheKey,
  marks: readonly StudioDynamicBrushCoverageMark[],
  plan: TilePlan,
  prepared: readonly PreparedTile[],
): CommittedCoverageCacheEntry | null {
  const byteBudget = runtimeCommittedCoverageCacheByteBudget();
  if (
    plan.allocatedBytes <= 0
    || plan.allocatedBytes
      > byteBudget
  ) return null;
  const variants = committedCoverageCache.get(key) ?? new Map();
  const previous = variants.get(plan.scale);
  if (previous) removeCommittedCoverageCacheEntry(previous);
  committedCoverageCache.set(key, variants);
  const entry: CommittedCoverageCacheEntry = {
    key,
    marks,
    scale: plan.scale,
    plan,
    prepared,
    lastUsed: ++committedCoverageCacheClock,
  };
  variants.set(plan.scale, entry);
  committedCoverageCacheBytes += plan.allocatedBytes;
  evictCommittedCoverageCacheToBudget(byteBudget);
  return variants.get(plan.scale) === entry ? entry : null;
}

/**
 * Releases every retained coverage surface owned by the current Studio JavaScript realm.
 * Studio's editor instance is the lifecycle owner and calls this synchronously during work/auth
 * scope teardown, before a replacement document can retain the previous document's backing store.
 */
export function disposeStudioDynamicCoverageCommittedCache(): void {
  const entries = [...committedCoverageCache.values()]
    .flatMap((variants) => [...variants.values()]);
  committedCoverageCache.clear();
  committedCoverageCacheBytes = 0;
  committedCoverageCacheClock = 0;
  for (const entry of entries) releasePreparedTiles(entry.prepared);
}

/** Test/debug alias retained for focused renderer isolation. */
export function clearStudioDynamicCoverageCommittedCache(): void {
  disposeStudioDynamicCoverageCommittedCache();
}

export function studioDynamicCoverageCommittedCacheStats(): Readonly<{
  bytes: number;
  entries: number;
  tiles: number;
}> {
  let entries = 0;
  let tiles = 0;
  for (const variants of committedCoverageCache.values()) {
    entries += variants.size;
    for (const entry of variants.values()) tiles += entry.prepared.length;
  }
  return Object.freeze({
    bytes: committedCoverageCacheBytes,
    entries,
    tiles,
  });
}

function prepareTileSurfaces(
  plan: TilePlan,
  marks: readonly StudioDynamicBrushCoverageMark[],
  factory: StudioCoverageSurfaceFactory
): readonly PreparedTile[] | null {
  const tilePixels = STUDIO_DYNAMIC_COVERAGE_TILE_PIXEL_SIZE;
  const bleedPixels = STUDIO_DYNAMIC_COVERAGE_TILE_BLEED_PIXELS;
  const surfacePixels = tilePixels + bleedPixels * 2;
  const prepared: PreparedTile[] = [];
  try {
    for (const bin of plan.bins) {
      const surface = factory(surfacePixels, surfacePixels);
      const context = surface?.getContext("2d", { alpha: true });
      if (!surface || !context) {
        releasePreparedTiles(prepared);
        return null;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, surfacePixels, surfacePixels);
      context.globalCompositeOperation = "source-over";
      context.setTransform(
        plan.scale,
        0,
        0,
        plan.scale,
        bleedPixels - bin.tileX * tilePixels,
        bleedPixels - bin.tileY * tilePixels
      );
      for (const markIndex of bin.markIndexes) {
        const mark = marks[markIndex]!;
        renderStudioDynamicBrushCoverageMark(context, mark);
      }
      prepared.push({ ...bin, surface });
    }
    return prepared;
  } catch {
    releasePreparedTiles(prepared);
    return null;
  }
}

function compositePreparedTileSurfaces(
  context: StudioDynamicBrushCoverageDestinationContext,
  prepared: readonly PreparedTile[],
  plan: TilePlan,
  opacity: number,
): "rendered" | "partial" | "failed" {
  const tileLogicalSize = STUDIO_DYNAMIC_COVERAGE_TILE_PIXEL_SIZE / plan.scale;
  const inheritedAlpha = clampAlpha(context.globalAlpha);
  let destinationStarted = false;
  try {
    context.save();
    context.globalAlpha = inheritedAlpha * opacity;
    for (const tile of prepared) {
      destinationStarted = true;
      context.drawImage(
        tile.surface,
        STUDIO_DYNAMIC_COVERAGE_TILE_BLEED_PIXELS,
        STUDIO_DYNAMIC_COVERAGE_TILE_BLEED_PIXELS,
        STUDIO_DYNAMIC_COVERAGE_TILE_PIXEL_SIZE,
        STUDIO_DYNAMIC_COVERAGE_TILE_PIXEL_SIZE,
        tile.tileX * tileLogicalSize,
        tile.tileY * tileLogicalSize,
        tileLogicalSize,
        tileLogicalSize,
      );
    }
    context.restore();
    return "rendered";
  } catch {
    try {
      context.restore();
    } catch {
      // Preserve the fail-closed result even if a host context also rejects restore().
    }
    return destinationStarted ? "partial" : "failed";
  }
}

/**
 * Renders v2 coverage. Every fallback result is returned before destination mutation, so callers
 * can safely execute the frozen direct compositor. A partial destination failure is explicitly
 * non-fallback to prevent double-painting.
 */
export function renderStudioDynamicBrushCoverage(
  context: StudioDynamicBrushCoverageDestinationContext,
  marks: readonly StudioDynamicBrushCoverageMark[],
  options: StudioDynamicBrushCoverageRenderOptions
): StudioDynamicBrushCoverageRenderResult {
  const opacity = clampAlpha(options.opacity);
  if (marks.length === 0 || opacity <= 0) return { status: "empty" };
  if (!marks.every(markIsValid)) {
    return { status: "fallback", reason: "surface-render-failed" };
  }

  const byteBudget = options.activeDraft
    ? STUDIO_DYNAMIC_COVERAGE_ACTIVE_BYTE_BUDGET
    : STUDIO_DYNAMIC_COVERAGE_COMMITTED_BYTE_BUDGET;
  const tileMarkReferenceBudget = options.activeDraft
    ? STUDIO_DYNAMIC_COVERAGE_ACTIVE_TILE_MARK_REFERENCE_BUDGET
    : STUDIO_DYNAMIC_COVERAGE_COMMITTED_TILE_MARK_REFERENCE_BUDGET;
  const cacheKey = !options.activeDraft ? options.committedCacheKey : undefined;
  let selectedPlan: TilePlan | null = null;
  let selectedCacheEntry: CommittedCoverageCacheEntry | null = null;
  let lastFailure: "surface-budget" | "tile-mark-budget" = "surface-budget";
  const scales = candidateScales(context, options.activeDraft);
  if (scales.length === 0) {
    return { status: "fallback", reason: "physical-scale-unsupported" };
  }
  for (const scale of scales) {
    const cached = cacheKey
      ? readCommittedCoverageCache(cacheKey, marks, scale)
      : null;
    if (cached) {
      selectedCacheEntry = cached;
      selectedPlan = cached.plan;
      break;
    }
    const candidate = planTilesAtScale(
      marks,
      scale,
      byteBudget,
      tileMarkReferenceBudget
    );
    if (candidate === "surface-budget" || candidate === "tile-mark-budget") {
      lastFailure = candidate;
      continue;
    }
    selectedPlan = candidate;
    break;
  }
  if (!selectedPlan) return { status: "fallback", reason: lastFailure };

  const factory = options.surfaceFactory ?? defaultSurfaceFactory;
  const prepared = selectedCacheEntry?.prepared
    ?? prepareTileSurfaces(selectedPlan, marks, factory);
  if (!prepared) {
    return {
      status: "fallback",
      reason: options.surfaceFactory ? "surface-render-failed" : "surface-unavailable",
    };
  }

  let retainedByCache = selectedCacheEntry !== null;
  if (!retainedByCache && cacheKey) {
    retainedByCache = writeCommittedCoverageCache(
      cacheKey,
      marks,
      selectedPlan,
      prepared,
    ) !== null;
  }
  const composite = compositePreparedTileSurfaces(
    context,
    prepared,
    selectedPlan,
    opacity,
  );
  if (!retainedByCache) releasePreparedTiles(prepared);
  if (composite !== "rendered") {
    return composite === "partial"
      ? { status: "partial", reason: "destination-composite-failed" }
      : { status: "fallback", reason: "surface-render-failed" };
  }
  return {
    status: "rendered",
    scale: selectedPlan.scale,
    tileCount: selectedPlan.bins.length,
    allocatedBytes: selectedPlan.allocatedBytes,
    tileMarkReferences: selectedPlan.tileMarkReferences,
  };
}

/** Frozen direct compositor used for omitted/legacy paint models and every v2 preflight failure. */
export function renderStudioDynamicBrushLegacyMarks(
  context: StudioDynamicBrushLegacyDestinationContext,
  marks: readonly StudioDynamicBrushCoverageMark[],
  opacity: number
): void {
  context.save();
  const inheritedAlpha = clampAlpha(context.globalAlpha);
  const strokeOpacity = clampAlpha(opacity);
  for (const mark of marks) {
    if (mark.alpha <= 0) continue;
    renderStudioDynamicBrushCoverageMark(
      context,
      mark,
      inheritedAlpha * strokeOpacity,
    );
  }
  context.restore();
}
