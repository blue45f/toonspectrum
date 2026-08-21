/**
 * Per-move planning cost gate for every live brush lane.
 *
 * ## The bug class this exists to stop
 *
 * A pointer move appends a handful of samples to the stroke being drawn. A lane whose planner
 * re-derives the WHOLE stroke on that move costs O(n) per move and therefore O(n^2) per stroke:
 * imperceptible for a flick, a visible freeze for a long sweep. Measured on this tree before the
 * incremental work landed, one 3200-sample oil stroke spent 24.2 SECONDS inside its planner
 * (replanning once per rAF), against 0.6 s for the same lane at 400 samples — x39 for x8 the input.
 *
 * `studio-dry-media-long-stroke-regression.test.ts` has held exactly this shape of gate for the dry
 * media lane since its own incremental rewrite, and dry media is the one lane that never regressed.
 * This file generalises that gate to the rest of the shelf so no lane is unguarded.
 *
 * ## What is asserted, per lane
 *
 *  1. GROWTH — per-move cost at n=3200 must not exceed `GROWTH_MULTIPLE` x per-move cost at n=400.
 *     A planner that is linear in the stroke length would show x8 (3200/400). The dry-media gate's
 *     precedent constant is x6 plus slack; see `GROWTH_MULTIPLE` for why this one is tighter and
 *     why its exact value comes from the measured gap between the two populations of lanes.
 *  2. CEILING — per-move cost at n=3200 must stay under `PER_MOVE_CEILING_MS`, so a lane cannot buy
 *     a passing ratio by being uniformly slow at both lengths.
 *
 * ## Designing against timer noise on shared CI
 *
 *  - Every number is the MINIMUM of `REPS` timed moves, never a single sample. Interference is
 *    additive, so the minimum is the least-contaminated estimate and by far the most reproducible;
 *    the median and p90 are reported alongside it but not asserted on.
 *  - The primary assertion is a RATIO between two measurements taken back-to-back in the same
 *    process, which cancels machine speed. Only the ceiling is absolute, and it is set at one
 *    quarter of a 30 fps frame rather than at the observed value.
 *  - The n=400 baseline is floored at `GROWTH_BASE_FLOOR_MS` before the ratio is applied. Under
 *    ~0.1 ms a `performance.now()` delta is mostly quantisation, and a ratio taken against noise
 *    fails at random. KNOWN CONSEQUENCE: a lane that is linear in n but whose absolute cost is deep
 *    under the floor (say 0.02 ms -> 0.16 ms) passes the ratio. That is deliberate — the ceiling is
 *    the backstop for anything that could actually be felt, and a flaky gate gets deleted.
 *  - Failure messages carry the lane id, the representative brush, the planner chain and the whole
 *    measured curve, so a red build names the offender instead of printing "expected 12 < 8".
 *
 * ## Measuring one MOVE rather than one PLAN
 *
 * Several lanes are stateful across a stroke — `FxOilDabPlanner` retains a verified station prefix,
 * and the causal deposit walker behind the dynamic-dab lanes cannot run backwards at all — so
 * timing a cold `plan(prefix_n)` would report a full replan and slander a correct lane. Every probe
 * therefore exposes a `StrokeStepper`: `seek(n - MOVE_STEP)` brings the stroke to the state it
 * would really be in one rAF earlier and is NEVER timed, and `move(n)` plans the pointer move that
 * lands on `n` and IS timed. Lanes with no incremental planner are unaffected — they pay a full
 * plan either way, which is the honest number for them.
 *
 * Each probe also declares which path it times (`ProbePath`). Timing the retained
 * `StudioDrawNode` replan for a lane whose live overlay is genuinely incremental would report a
 * cost no pointer move pays; timing a suffix for a lane that has no incremental live path would
 * report a cost that does not exist. Both mistakes were made and corrected while building this.
 *
 * ## Scope and honesty
 *
 * `LANE_PROBES` covers all 15 `StudioBrushEngineLaneId` values plus the family-level retained
 * branches that have no lane id (highlighter, calligraphy, neon, glow, pastel). The first test
 * asserts the catalog side of that, so a newly added lane id fails here until it is either probed
 * or explicitly skipped with a reason. `SKIPPED_LANES` is part of the deliverable: an unmeasurable
 * lane is listed with why, never silently dropped.
 *
 * ## State of the shelf when this gate was written (2026-08-21, node 24)
 *
 * The gate is intentionally RED on arrival: it reports the shelf as it is rather than being tuned
 * until it is green. Growth ratios were stable to within ~0.5 across repeated runs.
 *
 *   FLAT   spray-stamp x0.1 · wet-stamp x0.1 · dry-stamp x0.2 · dry-dynamic x0.6
 *          spray-dynamic x0.7 · oil-extrude x1.1
 *   GROWS  oil-ribbon x18.5 (34.1ms) · calligraphy x8.8 (35.9ms) · capsule-outline x8.6 (18.2ms)
 *          highlighter x7.8 (11.0ms) · pencil-path x7.6 · perfect-outline x7.2 · pastel x4.7
 *          angled-ribbon x4.6 · neon x4.0 · glow x3.9 · stamp-tone x3.8 · causal-ink x3.5
 *          wet-dabs x3.0 · particle-fx x2.5
 *
 * Four of those also breach the absolute ceiling: oil-ribbon, calligraphy, capsule-outline and
 * highlighter. `oil-ribbon` is the instructive one — its dab bed IS incremental
 * (`FxOilDabPlanner`), but at n=3200 the lane saturates `FX_OIL_DAB_CAP`, where `sampleStations`
 * refits the whole arc and the planner correctly refuses to reuse anything; the unfixed
 * `planStudioOilRibbonCarrier` then replans on top. A lane is only as incremental as its slowest
 * stage.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildCalligraphySegments,
  processFreehandPoints,
  resolveStudioBrushRenderFamily,
  resolveStudioFreehandRenderPath,
  screentoneDotsForStroke,
} from "../studio-brush";
import {
  appendStudioCausalDynamicBrushDepositsV2,
  appendStudioCausalDynamicBrushDepositsV3,
  beginStudioCausalDynamicBrushDepositV2,
  beginStudioCausalDynamicBrushDepositV3,
  type StudioCausalDynamicBrushDepositStateV2,
  type StudioCausalDynamicBrushDepositStateV3,
  type StudioCausalDynamicBrushSampleV2,
} from "../studio-causal-dynamic-brush-deposit-v2";
import { planStudioCausalInk } from "../studio-causal-ink";
import { planStudioDynamicBrushCoverageMarks } from "../studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "../studio-dynamic-brush-render-plan";
import {
  FX_OIL_DAB_CAP,
  FX_PASTEL_DAB_CAP,
  FxOilDabPlanner,
  fxBrushSeedFromKey,
  planGlitterBrushParticles,
  planPastelBrushDabs,
  planStudioFxBrushPressurePath,
  studioOilPaintBodyForBrush,
  studioOilTipProfileForBrush,
} from "../studio-fx-brush";
import {
  planStudioHighlighterWashRibbon,
  resolveStudioHighlighterWashBrushId,
} from "../studio-highlighter-wash-ribbon";
import {
  captureStudioOutlineStrokeContractV1,
  planStudioPerfectFreehandRender,
  type StudioOutlineStrokeContractV1,
} from "../studio-outline-stroke-contract";
import {
  loadStudioPerfectFreehandStroker,
  type StudioPerfectFreehandStroker,
} from "../studio-perfect-freehand";
import { planStudioRetainedMediaPressureCurve } from "../studio-retained-media-pressure";
import { planStudioRetainedMediaRibbon } from "../studio-retained-media-ribbon";

import {
  resolveStudioCapturedBrushDynamicsPresetId,
  studioDynamicBrushDepositPipelineUsesContinuation,
  type StudioDynamicBrushDab,
} from "./studio-brush-dynamics";
import {
  STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS,
  type StudioBrushEngineLaneId,
} from "./studio-brush-engine-lane-catalog";
import {
  planStudioStampBrushDabs,
  resolveStudioStampBrushKind,
  resolveStudioStampBrushStyle,
} from "./studio-brush-stamp-engine";
import { planStudioCalligraphyRibbon } from "./studio-calligraphy-ribbon";
import { studioFluidPaintStationSpacingRatio } from "./studio-fluid-paint-reference";
import {
  planStudioOilRibbonCarrier,
  studioOilRibbonProgramsForBrush,
} from "./studio-oil-ribbon-carrier";
import { planStudioAngledNibStrokeLocalCoverage } from "./studio-stroke-local-coverage";
import { planWatercolorBrushDabs } from "./studio-watercolor-brush";
import { planStudioWetRibbonCarrier } from "./studio-wet-ribbon-carrier";

import type { DrawEl } from "../studio-element-model";

// ── Gate constants ────────────────────────────────────────────────────────────────────────────

/** Long sweep. 3200 samples at ~3 px is roughly a 9.6 m pen path — a full-page ink sweep. */
const LONG_N = 3_200;
/** Short reference stroke. The 8x input ratio to LONG_N is what makes the growth bound readable. */
const SHORT_N = 400;
/** Pointer samples appended between replans: ~240 Hz input against a 60 Hz rAF. */
const MOVE_STEP = 4;
/**
 * Timed moves per (lane, length).
 *
 * The gate statistic is the MINIMUM of these, not the median. Interference on a shared runner is
 * strictly additive — a scheduler preemption or a GC pause can only make a sample slower, never
 * faster — so the minimum is the least-contaminated estimate of what the planner actually costs,
 * and it is dramatically more reproducible run to run. A median over a handful of reps on a cheap
 * lane swings by 3-5x here, which is exactly how a ratio gate becomes a flaky gate. The median and
 * the p90 are still reported, because a wide min-to-p90 spread is itself worth seeing.
 */
const REPS = 21;
/** Minimum timed moves kept when a slow lane trips the time budget below. */
const MIN_REPS = 5;
/** Wall-clock ceiling per (lane, length) measurement, so one pathological lane cannot hang CI. */
const MEASURE_BUDGET_MS = 4_000;
/**
 * Growth allowance.
 *
 * Linear-in-n would be x8 at these lengths, and dry-media's precedent gate uses x6 plus slack. The
 * value here is x2, chosen from the measured distribution rather than from taste: every lane with
 * an incremental planner sits at x0.1-x1.1, every lane that replans sits at x2.5 or above, and x2
 * falls in the empty gap between the two populations. Picking a constant that lands ON a lane (x3
 * did, on `wet-dabs`) buys a coin-flip test; picking one in the gap buys a deterministic one, at
 * 100% slack over what a correct lane actually measures.
 */
const GROWTH_MULTIPLE = 2;
/** Ratio denominator floor — see the timer-noise note in the file header. */
const GROWTH_BASE_FLOOR_MS = 0.1;
/** Absolute per-move ceiling: a quarter of a 30 fps frame, leaving the rest for paint and layout. */
const PER_MOVE_CEILING_MS = 8;

// ── Stroke fixture ────────────────────────────────────────────────────────────────────────────

/**
 * A lazy spiral sampled a FIXED ~3 px apart, so a longer stroke means more ARC LENGTH rather than a
 * denser sampling of the same path. Holding total arc length constant instead makes every
 * arc-length-resampling planner look flat, because its station count never grows — a measurement
 * artifact that hid this whole bug class once already.
 */
const SAMPLE_STEP_PX = 3;

interface StrokePrefix {
  readonly pointCount: number;
  readonly points: number[];
  readonly pressures: number[];
  readonly tiltXs: number[];
  readonly tiltYs: number[];
  readonly twists: number[];
  readonly speeds: number[];
  readonly tangentialPressures: number[];
}

function buildStroke(pointCount: number): StrokePrefix {
  const points: number[] = [];
  const pressures: number[] = [];
  const tiltXs: number[] = [];
  const tiltYs: number[] = [];
  const twists: number[] = [];
  const speeds: number[] = [];
  const tangentialPressures: number[] = [];
  let x = 40;
  let y = 300;
  let heading = 0;
  for (let index = 0; index < pointCount; index += 1) {
    heading += 0.012 + Math.sin(index * 0.03) * 0.004;
    x += Math.cos(heading) * SAMPLE_STEP_PX + Math.sin(index * 0.37) * 0.12;
    y += Math.sin(heading) * SAMPLE_STEP_PX + Math.cos(index * 0.51) * 0.12;
    points.push(x, y);
    pressures.push(0.25 + 0.7 * Math.abs(Math.sin(index * 0.004)));
    tiltXs.push(8 + (index % 15));
    tiltYs.push(-12 + (index % 9));
    twists.push(index % 360);
    speeds.push(0.35 + (index % 11) * 0.06);
    tangentialPressures.push(0);
  }
  return {
    pointCount,
    points,
    pressures,
    tiltXs,
    tiltYs,
    twists,
    speeds,
    tangentialPressures,
  };
}

/**
 * Prefixes are materialised up front so array slicing never lands inside a timed region. Production
 * grows one array in place; the copy here is a fixture detail, not part of the measured planner.
 */
const PREFIXES: ReadonlyMap<number, StrokePrefix> = new Map(
  [SHORT_N - MOVE_STEP, SHORT_N, LONG_N - MOVE_STEP, LONG_N].map((n) => [n, buildStroke(n)]),
);

function prefix(pointCount: number): StrokePrefix {
  const found = PREFIXES.get(pointCount);
  if (!found) throw new Error(`no prefix fixture for n=${pointCount}`);
  return found;
}

// ── Probe plumbing ────────────────────────────────────────────────────────────────────────────

/**
 * One in-flight stroke.
 *
 * `seek` brings the stroke's state to a given prefix and is never timed; `move` plans the pointer
 * move that lands on the next prefix and IS timed. Splitting them is what lets an append-only lane
 * (a causal deposit walker that cannot run backwards) be measured on the same rig as a lane that
 * re-derives from the raw point array every call.
 */
interface StrokeStepper {
  seek(stroke: StrokePrefix): void;
  move(stroke: StrokePrefix): number;
}

/**
 * Which code path the probe times.
 *
 *  - `live-incremental`: the lane has a canvas-free incremental planner that the live overlay
 *    drives per pointer move. This is the path a stutter would actually be felt on.
 *  - `whole-prefix-replan`: the lane has no incremental planner; every move re-derives the stroke.
 *    Timing the whole-prefix chain IS the per-move cost for these lanes.
 */
type ProbePath = "live-incremental" | "whole-prefix-replan";

interface LaneProbe {
  /** `StudioBrushEngineLaneId`, or `family:<brushFamily>` for a retained branch with no lane id. */
  readonly id: string;
  /** Representative brush the live shelf actually ships on this lane. */
  readonly brushId: string;
  readonly path: ProbePath;
  /** The planner chain a pointer move runs, for the failure message. */
  readonly entry: string;
  /** Fresh per-stroke state, exactly as `begin()` would create it on pointer down. */
  readonly makeStroke: () => StrokeStepper;
}

/**
 * Lanes that re-derive from the raw point array: `seek` is just a plan at the shorter prefix, which
 * both warms the JIT and — for a verified-prefix planner such as `FxOilDabPlanner` — leaves exactly
 * the retained state a real stroke would hold one move earlier.
 */
function wholePrefixStepper(plan: (stroke: StrokePrefix) => number): StrokeStepper {
  return {
    seek(stroke) {
      plan(stroke);
    },
    move: plan,
  };
}

const STROKE_COLOR = "#1d1b1a";
const ELEMENT_ID = "long-stroke-gate";
const SEED = fxBrushSeedFromKey(ELEMENT_ID);

function drawElement(brushId: string, stroke: StrokePrefix, extra?: Partial<DrawEl>): DrawEl {
  return {
    id: ELEMENT_ID,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: stroke.points,
    pressures: stroke.pressures,
    tiltXs: stroke.tiltXs,
    tiltYs: stroke.tiltYs,
    twists: stroke.twists,
    stroke: STROKE_COLOR,
    strokeWidth: 24,
    brush: brushId,
    sampleSpacing: 1,
    ...extra,
  } as DrawEl;
}

function freehandPath(stroke: StrokePrefix): readonly number[] {
  return resolveStudioFreehandRenderPath(stroke.points, {
    sampleSpacing: 1,
    legacyMinDistance: 1.2,
    legacyTension: 0,
  }).points;
}

// ── Lane probes ───────────────────────────────────────────────────────────────────────────────

/**
 * The perfect-freehand stroker is a lazy dynamic import in production. Loading it is a one-time
 * page cost, not a per-move cost, so it is resolved once here and reused by both outline probes.
 */
let perfectStroker: StudioPerfectFreehandStroker | null = null;

function outlineProbe(id: string, brushId: string): LaneProbe {
  return {
    id,
    brushId,
    path: "whole-prefix-replan",
    entry: "captureOutlineContract -> planStudioPerfectFreehandRender",
    makeStroke: () => {
      // The contract is snapshotted at pointer DOWN and replayed unchanged for the whole stroke.
      const contract: StudioOutlineStrokeContractV1 | null =
        captureStudioOutlineStrokeContractV1({ brushId, pressureSource: "recorded" });
      if (!contract) throw new Error(`${brushId}: no outline stroke contract`);
      return wholePrefixStepper((stroke) => {
        const plan = planStudioPerfectFreehandRender({
          contract,
          stroker: perfectStroker,
          points: stroke.points,
          pressures: stroke.pressures,
          strokeWidth: 8,
          sampleSpacing: 1,
          legacyMinDistance: 1.2,
        });
        return plan.kind === "outline" ? plan.outline.length : 1;
      });
    },
  };
}

/**
 * Dynamic-dab lanes on their LIVE path.
 *
 * `StudioLiveDynamicBrushOverlayRenderer.appendFrom` consumes only the unseen source suffix:
 * `append…DepositsV3` advances a causal walker by those samples and returns just the new dabs, and
 * `planStudioDynamicBrushCoverageMarks` then plans marks for that suffix alone. Both calls here are
 * the renderer's exact calls with the canvas removed — the overlay's own tests own byte identity;
 * this one owns the cost curve. The retained `StudioDrawNode` path for these same lanes replans the
 * whole element, but that is a commit/repaint cost, not what a pointer move pays.
 */
function dynamicDabProbe(id: string, brushId: string): LaneProbe {
  return {
    id,
    brushId,
    path: "live-incremental",
    entry: "append…CausalDynamicBrushDeposits(suffix) -> planStudioDynamicBrushCoverageMarks(suffix)",
    makeStroke: () => {
      const presetId = resolveStudioCapturedBrushDynamicsPresetId({ brush: brushId });
      if (!presetId) throw new Error(`${brushId}: no dynamics preset`);
      // Pointer-down work: resolved once per stroke, exactly as `begin()` does.
      const seed = buildStroke(2);
      const planResult = planStudioDynamicBrushRender(drawElement(brushId, seed), presetId, true);
      if (planResult.status !== "ready") throw new Error(`${brushId}: dynamics plan not ready`);
      const style = planResult.plan;
      const continuation = studioDynamicBrushDepositPipelineUsesContinuation(
        style.dynamics.depositPipeline,
      );
      const sampleAt = (stroke: StrokePrefix, index: number): StudioCausalDynamicBrushSampleV2 => ({
        x: stroke.points[index * 2]!,
        y: stroke.points[index * 2 + 1]!,
        pressure: stroke.pressures[index]!,
        tangentialPressure: stroke.tangentialPressures[index]!,
        speed: stroke.speeds[index]!,
        tiltX: stroke.tiltXs[index]!,
        tiltY: stroke.tiltYs[index]!,
        twist: stroke.twists[index]!,
      });

      let stateV3: StudioCausalDynamicBrushDepositStateV3 | null = null;
      let stateV2: StudioCausalDynamicBrushDepositStateV2 | null = null;
      let consumed = 0;
      let origin = { x: 0, y: 0 };

      const restart = (stroke: StrokePrefix): void => {
        const first = sampleAt(stroke, 0);
        origin = { x: first.x, y: first.y };
        if (continuation) {
          const begun = beginStudioCausalDynamicBrushDepositV3(first, style.dynamics);
          if (!begun.ok) throw new Error(`${brushId}: causal begin failed (${begun.reason})`);
          stateV3 = begun.state;
          stateV2 = null;
        } else {
          const begun = beginStudioCausalDynamicBrushDepositV2(first, style.dynamics);
          if (!begun.ok) throw new Error(`${brushId}: causal begin failed (${begun.reason})`);
          stateV2 = begun.state;
          stateV3 = null;
        }
        consumed = 1;
      };

      const appendThrough = (stroke: StrokePrefix, target: number): readonly StudioDynamicBrushDab[] => {
        const samples: StudioCausalDynamicBrushSampleV2[] = [];
        for (let index = consumed; index < target; index += 1) samples.push(sampleAt(stroke, index));
        consumed = target;
        if (samples.length === 0) return [];
        if (stateV3) {
          const appended = appendStudioCausalDynamicBrushDepositsV3(
            stateV3,
            samples,
            style.dynamics,
          );
          if (!appended.ok) throw new Error(`${brushId}: causal append (${appended.reason})`);
          stateV3 = appended.state;
          return appended.dabs;
        }
        const appended = appendStudioCausalDynamicBrushDepositsV2(
          stateV2!,
          samples,
          style.dynamics,
        );
        if (!appended.ok) throw new Error(`${brushId}: causal append (${appended.reason})`);
        stateV2 = appended.state;
        return appended.dabs;
      };

      return {
        seek(stroke) {
          // Replay the stroke from pointer-down, in real rAF-sized chunks. Incremental by
          // construction, so this is O(n) for the whole seek rather than O(n) per chunk.
          restart(stroke);
          for (let target = 1 + MOVE_STEP; target <= stroke.pointCount; target += MOVE_STEP) {
            appendThrough(stroke, Math.min(target, stroke.pointCount));
          }
          appendThrough(stroke, stroke.pointCount);
        },
        move(stroke) {
          const newDabs = appendThrough(stroke, stroke.pointCount);
          if (newDabs.length === 0) return 0;
          const plan = planStudioDynamicBrushCoverageMarks({
            dabVariations: [newDabs],
            strokeOrigins: [origin],
            dynamics: style.dynamics,
            materialIdentity: style.materialIdentity,
            dynamicSeed: style.seed,
            stroke: STROKE_COLOR,
            stampGrid: style.renderBudget.stampGrid,
            markBudget: style.markBudget,
            ...(style.paper ? { paper: style.paper } : {}),
          });
          return plan.ok ? plan.marks.length : 0;
        },
      };
    },
  };
}

/**
 * Stamp lanes on their LIVE path.
 *
 * `StudioLiveStampOverlayRenderer.appendFrom` walks only the unseen source suffix — "once a dab has
 * been painted, a later source point cannot change it". Its `walkStampSegment` writes straight to a
 * Canvas2D context, so the canvas-free stand-in here is `planStudioStampBrushDabs` over the same
 * source suffix: the identical `walkStampSegmentPlan` core, one segment per appended sample. Dab
 * COORDINATES differ from the live walker (a fresh walker restarts the jitter index); this probe
 * measures cost only, and the overlay's own tests own the identity contract.
 */
function stampProbe(id: string, brushId: string): LaneProbe {
  return {
    id,
    brushId,
    path: "live-incremental",
    entry: "resolveStudioStampBrushStyle -> planStudioStampBrushDabs(suffix)",
    makeStroke: () => {
      const kind = resolveStudioStampBrushKind(brushId);
      if (!kind) throw new Error(`${brushId}: no stamp kind`);
      const style = resolveStudioStampBrushStyle(
        kind,
        { color: STROKE_COLOR, size: 24, opacity: 1 },
        null,
        brushId,
      );
      let consumed = 1;
      return {
        seek(stroke) {
          consumed = stroke.pointCount;
        },
        move(stroke) {
          // The walker needs the last already-consumed point to continue the segment from.
          const from = Math.max(0, consumed - 1);
          const dabs = planStudioStampBrushDabs(
            style,
            stroke.points.slice(from * 2),
            stroke.pressures.slice(from),
          );
          consumed = stroke.pointCount;
          return dabs.length;
        },
      };
    },
  };
}

function fxPressurePathProbe(id: string, brushId: string, fxBrushId: string): LaneProbe {
  return {
    id,
    brushId,
    path: "whole-prefix-replan",
    entry: "resolveStudioFreehandRenderPath -> planStudioFxBrushPressurePath",
    makeStroke: () =>
      wholePrefixStepper((stroke) =>
        planStudioFxBrushPressurePath({
          brushId: fxBrushId as Parameters<typeof planStudioFxBrushPressurePath>[0]["brushId"],
          points: freehandPath(stroke),
          pressures: stroke.pressures,
          tension: 0,
        }).segments.length,
      ),
  };
}

const LANE_PROBES: readonly LaneProbe[] = Object.freeze([
  // ── causal ink ──────────────────────────────────────────────────────────────────────────────
  {
    id: "causal-ink",
    brushId: "gpen--causal-round",
    path: "whole-prefix-replan",
    entry: "planStudioCausalInk",
    makeStroke: () =>
      wholePrefixStepper((stroke) =>
        planStudioCausalInk({
          points: stroke.points,
          pressures: stroke.pressures,
          minDistance: 1,
          size: 8,
        }).dabs.length,
      ),
  },

  // ── outline engines ─────────────────────────────────────────────────────────────────────────
  outlineProbe("perfect-outline", "pen--perfect-taper"),
  outlineProbe("capsule-outline", "gpen--croquis-capsule"),

  // ── oil ribbon: incremental dab bed + ribbon carrier ────────────────────────────────────────
  {
    id: "oil-ribbon",
    brushId: "oil--flat-ribbon",
    path: "live-incremental",
    entry: "FxOilDabPlanner.plan -> planStudioOilRibbonCarrier",
    makeStroke: () => {
      const brushId = "oil--flat-ribbon";
      // One planner per stroke, held across moves — the live overlay creates it in `begin()`.
      const planner = new FxOilDabPlanner();
      const programs = studioOilRibbonProgramsForBrush(brushId, SEED);
      const spacing = studioFluidPaintStationSpacingRatio(brushId);
      return wholePrefixStepper((stroke) => {
        const dabs = planner.plan({
          points: freehandPath(stroke),
          pressures: stroke.pressures,
          baseWidth: 26,
          seed: SEED,
          maxDabs: FX_OIL_DAB_CAP,
          paintBody: studioOilPaintBodyForBrush(brushId),
          tipProfile: studioOilTipProfileForBrush(brushId),
          ...(spacing === undefined ? {} : { stationSpacingRatio: spacing }),
        });
        return planStudioOilRibbonCarrier(dabs, programs).sourceStationCount;
      });
    },
  },

  // ── dynamic-dab engines ─────────────────────────────────────────────────────────────────────
  dynamicDabProbe("oil-extrude", "oil--tube-extrude"),
  dynamicDabProbe("dry-dynamic", "charcoal--vine-soft"),
  dynamicDabProbe("spray-dynamic", "airbrush--klecks-grit"),

  // ── wet dabs ────────────────────────────────────────────────────────────────────────────────
  {
    id: "wet-dabs",
    brushId: "watercolor--granular",
    path: "whole-prefix-replan",
    entry: "planWatercolorBrushDabs -> planStudioWetRibbonCarrier",
    makeStroke: () =>
      wholePrefixStepper((stroke) => {
        const dabs = planWatercolorBrushDabs({
          points: freehandPath(stroke),
          pressures: stroke.pressures,
          baseWidth: 30,
          seed: SEED,
        });
        return planStudioWetRibbonCarrier(dabs, { seed: SEED }).footprintCount;
      }),
  },

  // ── stamp engines ───────────────────────────────────────────────────────────────────────────
  stampProbe("wet-stamp", "watercolor--edge-stamp"),
  stampProbe("dry-stamp", "charcoal--mypaint-stamp"),
  stampProbe("spray-stamp", "airbrush--stamp-soft"),

  // ── particles ───────────────────────────────────────────────────────────────────────────────
  {
    id: "particle-fx",
    brushId: "glitter--star-field",
    path: "whole-prefix-replan",
    entry: "resolveStudioFreehandRenderPath -> planGlitterBrushParticles",
    makeStroke: () =>
      wholePrefixStepper((stroke) =>
        planGlitterBrushParticles({
          points: freehandPath(stroke),
          pressures: stroke.pressures,
          baseWidth: 28,
          seed: SEED,
          mode: "star-dust",
          maxParticles: 512,
        }).length,
      ),
  },

  // ── angled nib ribbon ───────────────────────────────────────────────────────────────────────
  {
    id: "angled-ribbon",
    brushId: "marker--chisel-ribbon",
    path: "whole-prefix-replan",
    entry: "planStudioAngledNibStrokeLocalCoverage",
    makeStroke: () =>
      wholePrefixStepper((stroke) =>
        planStudioAngledNibStrokeLocalCoverage(
          freehandPath(stroke),
          18,
          -Math.PI / 6,
          null,
        ).polygons.length,
      ),
  },

  // ── pencil retained media ───────────────────────────────────────────────────────────────────
  {
    id: "pencil-path",
    brushId: "pencil--side-shade",
    path: "whole-prefix-replan",
    entry: "planStudioRetainedMediaPressureCurve -> planStudioRetainedMediaRibbon",
    makeStroke: () =>
      wholePrefixStepper((stroke) => {
        const curve = planStudioRetainedMediaPressureCurve(
          freehandPath(stroke),
          stroke.pressures,
          "pencil",
        );
        return planStudioRetainedMediaRibbon(curve, 10).cellCount;
      }),
  },

  // ── screentone ──────────────────────────────────────────────────────────────────────────────
  {
    id: "stamp-tone",
    brushId: "screentone--sparse-grid",
    path: "whole-prefix-replan",
    entry: "screentoneDotsForStroke",
    makeStroke: () =>
      wholePrefixStepper((stroke) =>
        screentoneDotsForStroke(stroke.points.slice(), 12, Math.max(3, 24 * 0.42)).length,
      ),
  },

  // ── family-level retained branches (no lane id in the catalog) ──────────────────────────────
  {
    id: "family:highlighter",
    brushId: "highlighter",
    path: "whole-prefix-replan",
    entry: "planStudioFxBrushPressurePath -> planStudioHighlighterWashRibbon",
    makeStroke: () =>
      wholePrefixStepper((stroke) => {
        const pressurePath = planStudioFxBrushPressurePath({
          brushId: "highlighter",
          points: freehandPath(stroke),
          pressures: stroke.pressures,
          tension: 0,
        });
        return planStudioHighlighterWashRibbon({
          brushId: resolveStudioHighlighterWashBrushId("highlighter"),
          pressurePath,
          baseWidth: 24,
        }).detailRuns.length;
      }),
  },
  {
    id: "family:calligraphy",
    brushId: "calligraphy",
    path: "whole-prefix-replan",
    entry: "processFreehandPoints -> buildCalligraphySegments -> planStudioCalligraphyRibbon",
    makeStroke: () =>
      wholePrefixStepper((stroke) => {
        const smoothed = processFreehandPoints(stroke.points, 1.2);
        const segments = buildCalligraphySegments(smoothed, stroke.pressures, null, 14, null);
        return planStudioCalligraphyRibbon(segments).runs.length;
      }),
  },
  fxPressurePathProbe("family:neon", "neon", "neon"),
  fxPressurePathProbe("family:glow", "glow", "glow"),
  {
    id: "family:pastel",
    brushId: "pastel",
    path: "whole-prefix-replan",
    entry: "resolveStudioFreehandRenderPath -> planPastelBrushDabs",
    makeStroke: () =>
      wholePrefixStepper((stroke) =>
        planPastelBrushDabs({
          points: freehandPath(stroke),
          pressures: stroke.pressures,
          baseWidth: 22,
          seed: SEED,
          maxDabs: FX_PASTEL_DAB_CAP,
        }).length,
      ),
  },
]);

/**
 * Lanes deliberately NOT measured here, each with the reason. An honest skip list is part of the
 * deliverable: a silently omitted lane is indistinguishable from a lane nobody thought about.
 *
 * (Currently empty — every `StudioBrushEngineLaneId` and every retained family branch above has a
 * probe. Add an entry here rather than dropping a lane from `LANE_PROBES`.)
 */
const SKIPPED_LANES: readonly { readonly id: string; readonly reason: string }[] = Object.freeze([]);

// ── Measurement ───────────────────────────────────────────────────────────────────────────────

interface Measurement {
  readonly pointCount: number;
  /** Gate statistic: the cheapest observed move, i.e. the one least disturbed by the machine. */
  readonly min: number;
  readonly p50: number;
  readonly p90: number;
  readonly reps: number;
  readonly outputSize: number;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

function measurePerMove(probe: LaneProbe, pointCount: number): Measurement {
  const before = prefix(pointCount - MOVE_STEP);
  const at = prefix(pointCount);
  const stepper = probe.makeStroke();
  // Prime: JIT warm-up plus, for incremental lanes, the state a real stroke would already hold by
  // the time it reaches this length.
  stepper.seek(before);
  let outputSize = stepper.move(at);
  const samples: number[] = [];
  const startedAt = performance.now();
  for (let rep = 0; rep < REPS; rep += 1) {
    stepper.seek(before); // untimed: restore the pre-move state
    const t0 = performance.now();
    outputSize = stepper.move(at); // timed: ONE pointer move
    samples.push(performance.now() - t0);
    if (samples.length >= MIN_REPS && performance.now() - startedAt > MEASURE_BUDGET_MS) break;
  }
  samples.sort((left, right) => left - right);
  return {
    pointCount,
    min: samples[0]!,
    p50: quantile(samples, 0.5),
    p90: quantile(samples, 0.9),
    reps: samples.length,
    outputSize,
  };
}

function growthRatio(short: Measurement, long: Measurement): number {
  return long.min / Math.max(short.min, GROWTH_BASE_FLOOR_MS);
}

function describeCurve(probe: LaneProbe, short: Measurement, long: Measurement): string {
  return [
    `lane ${probe.id} (brush ${probe.brushId})`,
    `  path:  ${probe.path}`,
    `  entry: ${probe.entry}`,
    `  n=${SHORT_N}: min ${short.min.toFixed(3)}ms  p50 ${short.p50.toFixed(3)}ms`
      + `  p90 ${short.p90.toFixed(3)}ms  out ${short.outputSize}  (${short.reps} reps)`,
    `  n=${LONG_N}: min ${long.min.toFixed(3)}ms  p50 ${long.p50.toFixed(3)}ms`
      + `  p90 ${long.p90.toFixed(3)}ms  out ${long.outputSize}  (${long.reps} reps)`,
    `  measured growth x${growthRatio(short, long).toFixed(1)}`
      + ` (linear-in-n would be x${LONG_N / SHORT_N};`
      + ` gate allows x${GROWTH_MULTIPLE} over a ${GROWTH_BASE_FLOOR_MS}ms baseline floor)`,
  ].join("\n");
}

/**
 * Every lane's curve, printed once at the end of the run.
 *
 * A CI log that shows only the lanes that tripped hides the lane that is one commit away from
 * tripping. `process.stdout.write` rather than `console.log` because the runner intercepts the
 * latter and buries it under the failing test that produced it.
 */
const MEASURED: { probe: LaneProbe; short: Measurement; long: Measurement }[] = [];

function summaryTable(): string {
  const header = [
    "lane".padEnd(20),
    "path".padEnd(21),
    "n=400 min".padStart(11),
    "n=3200 min".padStart(12),
    "growth".padStart(8),
    "  verdict",
  ].join("");
  const rows = MEASURED.map(({ probe, short, long }) => {
    const ratio = growthRatio(short, long);
    const flat = ratio < GROWTH_MULTIPLE;
    const underCeiling = long.min < PER_MOVE_CEILING_MS;
    return [
      probe.id.padEnd(20),
      probe.path.padEnd(21),
      `${short.min.toFixed(3)}ms`.padStart(11),
      `${long.min.toFixed(3)}ms`.padStart(12),
      `x${ratio.toFixed(1)}`.padStart(8),
      `  ${flat && underCeiling ? "flat" : !flat ? "GROWS" : "OVER CEILING"}`,
    ].join("");
  });
  return [
    "",
    "long-stroke per-move planning cost — full curve",
    header,
    ...rows,
    "",
  ].join("\n");
}

// ── Gate ──────────────────────────────────────────────────────────────────────────────────────

describe("long-stroke per-move planning cost", () => {
  afterAll(() => {
    process.stdout.write(summaryTable());
  });

  beforeAll(async () => {
    // Lazy dynamic import in production too: a page-load cost, not a per-move cost.
    perfectStroker = await loadStudioPerfectFreehandStroker();
  });

  it("probes or explicitly skips every engine lane in the catalog", () => {
    expect(perfectStroker).not.toBeNull();
    const probed = new Set(LANE_PROBES.map((probe) => probe.id));
    const skipped = new Set(SKIPPED_LANES.map((entry) => entry.id));
    const catalogLanes = new Set<StudioBrushEngineLaneId>(
      STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS.map((row) => row.lane),
    );
    const unguarded = [...catalogLanes].filter(
      (lane) => !probed.has(lane) && !skipped.has(lane),
    );
    expect(
      unguarded,
      `engine lanes with no per-move cost probe and no documented skip: ${unguarded.join(", ")}`
        + " — add a LANE_PROBES entry or a SKIPPED_LANES entry with a reason",
    ).toEqual([]);
    // Every probed lane id must be real: a typo would otherwise leave the lane unguarded while the
    // coverage check above still passed.
    for (const probe of LANE_PROBES) {
      if (probe.id.startsWith("family:")) {
        const family = probe.id.slice("family:".length);
        expect(resolveStudioBrushRenderFamily(probe.brushId), probe.id).toBe(family);
        continue;
      }
      expect(catalogLanes.has(probe.id as StudioBrushEngineLaneId), probe.id).toBe(true);
      expect(
        STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS.some(
          (row) => row.id === probe.brushId && row.lane === probe.id,
        ),
        `${probe.brushId} is not a catalog row on lane ${probe.id}`,
      ).toBe(true);
    }
  });

  it.each(LANE_PROBES.map((probe) => [probe.id, probe] as const))(
    "keeps %s per-move planning flat as the stroke grows",
    (_id, probe) => {
      const short = measurePerMove(probe, SHORT_N);
      const long = measurePerMove(probe, LONG_N);
      MEASURED.push({ probe, short, long });
      const curve = describeCurve(probe, short, long);

      // The stroke really did get longer — a planner that saturated its own cap at n=400 would
      // otherwise pass both assertions without ever having been stressed.
      expect(long.outputSize, `${curve}\n  (output did not grow with the stroke)`)
        .toBeGreaterThanOrEqual(short.outputSize);

      // 1. GROWTH — the load-bearing assertion. Ratio, so machine speed cancels out.
      const growthLimit = Math.max(short.min, GROWTH_BASE_FLOOR_MS) * GROWTH_MULTIPLE;
      expect(
        long.min,
        `PER-MOVE COST GROWS WITH STROKE LENGTH — this lane replans work it already planned.\n${curve}`
          + `\n  allowed at n=${LONG_N}: ${growthLimit.toFixed(3)}ms`,
      ).toBeLessThan(growthLimit);

      // 2. CEILING — stops a lane from passing the ratio by being uniformly slow.
      expect(
        long.min,
        `PER-MOVE COST EXCEEDS THE INTERACTIVE BUDGET at n=${LONG_N}.\n${curve}`
          + `\n  ceiling: ${PER_MOVE_CEILING_MS}ms per move`,
      ).toBeLessThan(PER_MOVE_CEILING_MS);
    },
    120_000,
  );
});
