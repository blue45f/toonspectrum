
import { selectFilterLane } from "../studio-renderer-tournament-runtime";

import {
  STUDIO_STROKE_SURFACE_ROUTE_PRIORITY,
  type StudioStrokeSurfaceRouteKind,
} from "./studio-stroke-surface-route";

import type { RemoteKillSwitch, WinnerCache } from "@toonspectrum/studio-engine-registry";

/**
 * V12 §5 tournament consumption, stroke-surface seam — pure selector only.
 *
 * The filter island (studio-filter-island-plan.ts) already executes tournament
 * conclusions on a real call path. This module ships the identical projection
 * for the stroke-surface route ladder without wiring any component: the shadow
 * planner (studio-surface-plan-shadow.ts) consumes it observation-only, and a
 * later cutover slice may move it onto the pointer-down path once the shadow
 * evidence holds.
 *
 * Same contract as the filter island pattern:
 * - killed lanes leave the ladder, with the anti-extinction guard (a kill list
 *   that would empty the chain is ignored and the reason is surfaced);
 * - a cached winner for this bucket/device is promoted to the head;
 * - pristine tournament state (empty cache, nothing killed) returns the input
 *   ladder byte-identically — the pre-tournament route contract is preserved.
 *
 * Buckets are derived deterministically from stroke workload traits (point
 * count, brush family, canvas scale) so wins generalize across strokes of the
 * same shape of work instead of leaking across unlike workloads.
 *
 * Hot-path contract: pure functions only. No I/O, no awaits, no module state.
 */

/* ------------------------------------------------------------------ */
/* Provider identity — shared with the shadow planner registry          */
/* ------------------------------------------------------------------ */

const ROUTE_PROVIDER_PREFIX = "stroke-route-";

/**
 * Provider id under which a stroke-surface lane races in the tournament and
 * kill switch. Matches the shadow planner's registry ids (`stroke-route-*`)
 * so winner/kill state written against the shadow's provider space projects
 * onto this ladder without translation.
 */
export function studioStrokeRouteProviderId(
  kind: StudioStrokeSurfaceRouteKind,
): string {
  return `${ROUTE_PROVIDER_PREFIX}${kind}`;
}

/* ------------------------------------------------------------------ */
/* Workload traits → deterministic tournament bucket                    */
/* ------------------------------------------------------------------ */

/** Observable stroke workload characteristics a bucket is derived from. */
export interface StudioStrokeRouteWorkloadTraits {
  /** Sampled pointer points in the stroke (estimate at selection time). */
  readonly pointCount: number;
  /** Brush family/category identity (free-form; normalized for the bucket). */
  readonly brushFamily: string;
  /** Canvas (stage) scale the stroke renders at. */
  readonly canvasScale: number;
}

export type StudioStrokeRoutePointBand = "micro" | "short" | "long" | "marathon";

export type StudioStrokeRouteScaleBand = "sub" | "base" | "zoomed";

/**
 * Point-count band. Total and deterministic: non-finite or negative counts
 * clamp to zero (micro) instead of producing an unstable bucket.
 */
export function studioStrokeRoutePointBand(
  pointCount: number,
): StudioStrokeRoutePointBand {
  const count = Number.isFinite(pointCount) && pointCount > 0 ? pointCount : 0;
  if (count <= 16) return "micro";
  if (count <= 128) return "short";
  if (count <= 1024) return "long";
  return "marathon";
}

/**
 * Canvas-scale band. Degenerate scales (non-finite, zero, negative) map to
 * the base band — a broken viewport read must not mint a fresh bucket.
 */
export function studioStrokeRouteScaleBand(
  canvasScale: number,
): StudioStrokeRouteScaleBand {
  if (!Number.isFinite(canvasScale) || canvasScale <= 0) return "base";
  if (canvasScale < 0.5) return "sub";
  if (canvasScale < 2) return "base";
  return "zoomed";
}

/**
 * Normalizes a brush family for bucket use: lowercased, trimmed, and every
 * run of characters outside [a-z0-9-] collapsed to a single dash so the
 * bucket separator (`|`) can never be injected. Empty input reads "unknown".
 */
export function studioStrokeRouteBrushFamilyKey(brushFamily: string): string {
  const normalized = brushFamily
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized.length > 0 ? normalized : "unknown";
}

export const STUDIO_STROKE_ROUTE_TOURNAMENT_BUCKET_PREFIX = "studio-stroke-route";

/**
 * Deterministic winner-cache bucket for a stroke workload. Same traits ⇒ same
 * bucket, always; unlike workloads (different brush family, point band, or
 * scale band) never share tournament conclusions.
 */
export function studioStrokeRouteBucket(
  traits: StudioStrokeRouteWorkloadTraits,
): string {
  return [
    STUDIO_STROKE_ROUTE_TOURNAMENT_BUCKET_PREFIX,
    studioStrokeRouteBrushFamilyKey(traits.brushFamily),
    `pts:${studioStrokeRoutePointBand(traits.pointCount)}`,
    `scale:${studioStrokeRouteScaleBand(traits.canvasScale)}`,
  ].join("|");
}

/* ------------------------------------------------------------------ */
/* Pure route selection — filter-island pattern on the stroke ladder    */
/* ------------------------------------------------------------------ */

/**
 * Already-hydrated in-memory tournament state. Structurally satisfied by
 * StudioRendererTournamentRuntime, so callers may pass the shared runtime
 * directly as the state.
 */
export interface StudioStrokeRouteTournamentState {
  readonly deviceHash: string;
  readonly winnerCache: WinnerCache;
  readonly killSwitch: RemoteKillSwitch;
}

export interface SelectStudioStrokeRouteInput {
  /** Candidate stroke-surface ladder, head lane first (admitted priority order). */
  readonly lanes: readonly StudioStrokeSurfaceRouteKind[];
  readonly traits: StudioStrokeRouteWorkloadTraits;
  readonly state: StudioStrokeRouteTournamentState;
}

export interface SelectStudioStrokeRouteResult {
  /** Bucket the selection was resolved against (derived from the traits). */
  bucket: string;
  /** Reordered ladder; pristine tournament state returns the input order. */
  lanes: StudioStrokeSurfaceRouteKind[];
  /** Lanes whose providers are currently killed (even when the kill was ignored). */
  killedLanes: StudioStrokeSurfaceRouteKind[];
  /** Lane the winner cache moved (or confirmed) at the head, if any. */
  promotedLane: StudioStrokeSurfaceRouteKind | null;
  /** Non-null when the kill switch was ignored to avoid an empty chain. */
  killIgnoredReason: string | null;
}

/**
 * Pure projection of tournament state onto a stroke-surface route ladder —
 * the exact selectFilterLane semantics on the stroke lane space:
 * 1. killed lanes leave the ladder unless that would empty it (then the kill
 *    is ignored, the original order survives, and the reason is returned);
 * 2. a cached winner for this workload bucket/device moves its lane to the
 *    head; a killed or absent winner promotes nothing;
 * 3. pristine state (empty cache, no kills) returns the input order unchanged.
 * No I/O and no awaits — safe on synchronous pointer-down decision paths.
 */
export function selectStudioStrokeRoute(
  input: SelectStudioStrokeRouteInput,
): SelectStudioStrokeRouteResult {
  const bucket = studioStrokeRouteBucket(input.traits);
  const selection = selectFilterLane<StudioStrokeSurfaceRouteKind>({
    lanes: input.lanes,
    bucket,
    deviceHash: input.state.deviceHash,
    winnerCache: input.state.winnerCache,
    killSwitch: input.state.killSwitch,
    laneProviderId: studioStrokeRouteProviderId,
  });
  return { bucket, ...selection };
}

/**
 * The full stroke ladder in contract priority order — the widest candidate
 * set a caller may hand to selectStudioStrokeRoute. Exported so consumers and
 * tests never re-declare the lane space.
 */
export const STUDIO_STROKE_ROUTE_TOURNAMENT_LANES: readonly StudioStrokeSurfaceRouteKind[] =
  STUDIO_STROKE_SURFACE_ROUTE_PRIORITY;

/* ------------------------------------------------------------------ */
/* Pointer-down admission gate — the cutover onto the real stroke path  */
/* ------------------------------------------------------------------ */

/**
 * Per-stroke admission gate derived from one tournament projection at
 * pointer-down. StudioPage's admission ladder is a sequence of side-effecting
 * `begin*` calls in strict priority order; the gate decides, before any
 * provider is invoked, which lanes may attempt admission this stroke.
 */
export interface StudioStrokeRoutePointerDownGate {
  /** Projection this gate was derived from (bucket, ladder, kill audit). */
  readonly selection: SelectStudioStrokeRouteResult;
  /** Candidate ladder the projection ran against (contract priority order). */
  readonly lanes: readonly StudioStrokeSurfaceRouteKind[];
  /** True when `kind` may attempt its side-effecting admission (begin call). */
  readonly admits: (kind: StudioStrokeSurfaceRouteKind) => boolean;
}

/**
 * Resolves the pointer-down admission gate — the sequential realization of
 * selectStudioStrokeRoute over a ladder whose admissions are side-effecting
 * and attempted in fixed textual priority order:
 *
 * - pristine tournament state (no winner, nothing killed) admits every lane,
 *   so every gated admission expression evaluates byte-identically to the
 *   ungated ladder — the pre-tournament routing contract is preserved exactly;
 * - a lane the kill switch pruned from the projection is denied: its begin is
 *   never invoked and the resolver routes past it as if it declined (the
 *   anti-extinction guard restores every lane and surfaces the reason);
 * - a promoted winner denies the lanes ranked above it in the candidate
 *   ladder, so the winner — when it admits — owns the actual route head. If
 *   the winner then declines, admission falls through to the lanes below it
 *   in original order; the demoted higher lanes are not retried this stroke
 *   (retrying would require a second admission pass mid-pointer-down);
 * - "konva" is the terminal fail-visible fallback and is never denied — a
 *   kill against it is unenforceable by design.
 *
 * Pure and synchronous: one projection per stroke start, no per-point work.
 */
export function resolveStudioStrokeRoutePointerDownGate(
  input: SelectStudioStrokeRouteInput,
): StudioStrokeRoutePointerDownGate {
  const selection = selectStudioStrokeRoute(input);
  const admissible = new Set(selection.lanes);
  const ranks = new Map(input.lanes.map((lane, index) => [lane, index]));
  const head = selection.lanes[0];
  const headRank = head === undefined ? 0 : (ranks.get(head) ?? 0);
  const admits = (kind: StudioStrokeSurfaceRouteKind): boolean => {
    if (kind === "konva") return true;
    if (!admissible.has(kind)) return false;
    const rank = ranks.get(kind);
    return rank !== undefined && rank >= headRank;
  };
  return { selection, lanes: input.lanes, admits };
}
