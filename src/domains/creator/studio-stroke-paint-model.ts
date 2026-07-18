import { resolveStudioBrushRenderFamily } from "./studio-brush";
import { isStudioInkPressureModel } from "./studio-ink-pressure-model";

/**
 * Versioned flow/opacity semantics for persisted Studio strokes.
 *
 * An omitted paint model is deliberately the historical contract: stroke opacity, flow, and
 * dab-local opacity are multiplied into every dab before it is painted directly onto the
 * destination. Existing documents must keep that behavior.
 *
 * `layered-flow-v1` is opt-in. Flow and dab-local opacity build coverage on a transparent,
 * stroke-local surface; the element/stroke opacity is then applied exactly once when that surface
 * is composited onto the document. This matches painting applications where flow controls pigment
 * deposition while opacity controls the completed stroke as a whole.
 */

export const STUDIO_STROKE_PAINT_MODEL_LAYERED_FLOW_V1 = "layered-flow-v1" as const;

export type StudioStrokePaintModel =
  typeof STUDIO_STROKE_PAINT_MODEL_LAYERED_FLOW_V1;

function clampAlpha(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Accepts only paint contracts whose persisted pixel meaning this build understands. */
export function isStudioStrokePaintModel(value: unknown): value is StudioStrokePaintModel {
  return value === STUDIO_STROKE_PAINT_MODEL_LAYERED_FLOW_V1;
}

export interface StudioStrokePaintModelCompatibilityInput {
  paintModel?: unknown;
  kind?: unknown;
  mode?: unknown;
  brush?: unknown;
  sampleSpacing?: unknown;
  pressureModel?: unknown;
  fill?: unknown;
  brushDynamics?: unknown;
  stampPipeline?: unknown;
  watercolorPipeline?: unknown;
  symmetry?: unknown;
}

function hasNonIdentitySymmetry(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "object" || Array.isArray(value)) return true;
  const type = (value as { type?: unknown }).type;
  return type !== undefined && type !== "none";
}

/**
 * Cross-field guard for every persistence and renderer boundary.
 *
 * The current compound-coverage implementation is intentionally limited to ordinary freehand
 * pen/marker strokes. Erasers, closed fills, symmetry, stamp/watercolor engines and dynamics have
 * different deposition semantics and must retain the legacy per-dab compositor.
 */
export function isStudioStrokePaintModelCompatible(
  input: StudioStrokePaintModelCompatibilityInput
): input is StudioStrokePaintModelCompatibilityInput & { paintModel: StudioStrokePaintModel } {
  if (!isStudioStrokePaintModel(input.paintModel)) return false;
  if ((input.kind ?? "freehand") !== "freehand" || (input.mode ?? "pen") !== "pen") return false;
  if (input.fill !== undefined && input.fill !== null) return false;
  if (input.brushDynamics !== undefined && input.brushDynamics !== null) return false;
  if (input.stampPipeline !== undefined && input.stampPipeline !== null) return false;
  if (input.watercolorPipeline !== undefined && input.watercolorPipeline !== null) return false;
  if (hasNonIdentitySymmetry(input.symmetry)) return false;
  const hasCausalGeometry = (
    typeof input.sampleSpacing === "number"
    && Number.isFinite(input.sampleSpacing)
    && input.sampleSpacing >= 0
  ) || isStudioInkPressureModel(input.pressureModel);
  if (!hasCausalGeometry) return false;
  const family = resolveStudioBrushRenderFamily(input.brush ?? "pen");
  return family === "pen" || family === "marker";
}

/**
 * Source alpha deposited by one dab into a `layered-flow-v1` stroke-local surface.
 *
 * Stroke opacity is intentionally absent: applying it here would restore the legacy darkening
 * bug when translucent dabs overlap. Each input is bounded independently before multiplication.
 */
export function resolveStudioLayeredFlowDepositionAlpha(
  flow: unknown,
  dabOpacity: unknown = 1,
): number {
  return clampAlpha(flow) * clampAlpha(dabOpacity);
}

/** Applies stroke opacity once to already accumulated stroke-local coverage. */
export function resolveStudioLayeredFlowFinalAlpha(
  strokeOpacity: unknown,
  depositedCoverage: unknown,
): number {
  return clampAlpha(strokeOpacity) * clampAlpha(depositedCoverage);
}

/**
 * Frozen legacy source alpha for one dab painted directly onto the destination.
 *
 * This is an explicit compatibility oracle, not the default for newly authored layered strokes.
 */
export function resolveStudioLegacyPerDabAlpha(
  strokeOpacity: unknown,
  flow: unknown,
  dabOpacity: unknown = 1,
): number {
  return clampAlpha(strokeOpacity) * clampAlpha(flow) * clampAlpha(dabOpacity);
}

/**
 * Alpha produced by repeatedly source-over compositing one constant-alpha dab over transparency.
 * Fractional counts are truncated because a dab count is discrete; invalid/non-positive counts
 * produce no coverage.
 */
export function resolveStudioRepeatedSourceOverAlpha(
  perDabAlpha: unknown,
  dabCount: number,
): number {
  const count = Number.isFinite(dabCount) ? Math.floor(dabCount) : 0;
  if (count <= 0) return 0;

  const alpha = clampAlpha(perDabAlpha);
  if (alpha === 0 || alpha === 1) return alpha;
  return 1 - ((1 - alpha) ** count);
}

/** Final pixel alpha for constant overlapping dabs under the new layered contract. */
export function resolveStudioLayeredFlowOverlapAlpha(
  strokeOpacity: unknown,
  flow: unknown,
  dabCount: number,
  dabOpacity: unknown = 1,
): number {
  const coverage = resolveStudioRepeatedSourceOverAlpha(
    resolveStudioLayeredFlowDepositionAlpha(flow, dabOpacity),
    dabCount,
  );
  return resolveStudioLayeredFlowFinalAlpha(strokeOpacity, coverage);
}

/** Final pixel alpha for constant overlapping dabs under the frozen legacy contract. */
export function resolveStudioLegacyPerDabOverlapAlpha(
  strokeOpacity: unknown,
  flow: unknown,
  dabCount: number,
  dabOpacity: unknown = 1,
): number {
  return resolveStudioRepeatedSourceOverAlpha(
    resolveStudioLegacyPerDabAlpha(strokeOpacity, flow, dabOpacity),
    dabCount,
  );
}
