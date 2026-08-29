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
 *  1. GROWTH — the lane's CALIBRATED cost, per-move at n=3200 divided by per-move at n=400, must
 *     stay within `GROWTH_BUDGET_MULTIPLE` of the ratio pinned for it in `LANE_GROWTH_PINS`.
 *     A planner that is linear in the stroke length would show x8 (3200/400); an incremental one
 *     sits near x1. The budget is per lane rather than one global constant because a single
 *     constant is loose exactly where a lane is cheap — see `LANE_GROWTH_PINS`.
 *  2. DETECTION — asserted live, on the machine at hand, from the passes the gate just judged: a
 *     lane that doubled its long-stroke per-move cost WOULD have been convicted. A calibrated
 *     budget that cannot say this has decayed into a friendlier no-op, and this is the assertion
 *     that stops that (`studio-perf-calibration.ts`, property 4).
 *  3. CEILING — per-move cost at n=3200 must stay under `PER_MOVE_CEILING_MS`, so a lane cannot buy
 *     a passing ratio by being uniformly slow at both lengths.
 *
 * ## Designing against timer noise on shared CI
 *
 *  - The two windows are INTERLEAVED: every sample times the n=400 move immediately before the
 *    n=3200 move it divides, so a contended stretch has to inflate both or the ratio stops meaning
 *    anything. Measuring them separately is what made this gate intermittent — a runner read
 *    n=400 at 0.092 ms (FASTER than a throttled local container's 0.127) and n=3200 at 0.209 ms
 *    (SLOWER than its 0.157) in the same run, which no uniformly slower machine can produce.
 *  - Every number is the MINIMUM of the samples in a pass, never a single one. Interference is
 *    additive, so the minimum is the least-contaminated estimate and by far the most reproducible;
 *    the median and p90 are reported alongside it but not asserted on.
 *  - A violation must be EARNED by every confirmation pass, and the verdict takes the minimum
 *    ratio across them, so one unlucky measurement can no longer fail the gate permanently while
 *    a real regression still trips every pass.
 *  - `seek` — the state restore a real pointer move never pays — stays outside both timed windows,
 *    which is why this file hands `studio-perf-calibration.ts` a caller-timed sample rather than a
 *    workload closure.
 *  - There is no denominator floor. The floor this gate used to apply (0.1 ms, on the grounds that
 *    a smaller `performance.now()` delta is "mostly quantisation") turned the ratio into a raw
 *    0.2 ms ABSOLUTE budget for every lane under it — which was most of them, and which is the
 *    machine-dependence this gate exists to avoid. It is also not true on this runtime: measured
 *    `performance.now()` resolution here is 41 ns, so even a 1 us window is ~4% quantisation, and
 *    the earned-violation passes above cover the rest.
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
 *
 * ## 2026-08-28 — incremental planner campaign
 *
 * Eight of the eleven arrival-red probes now measure flat behind value-identical incremental
 * planners and are enforced strictly (see each probe's entry): the fx pressure-path builder for
 * neon/glow, the dynamic overlay for pastel, the wet-wash pipeline for wet-dabs, the wash-ribbon
 * builder for highlighter, the croquis capsule planner for capsule-outline, the screentone stamp
 * walk for stamp-tone and the angled-nib coverage builder for angled-ribbon. The three still
 * growing are each caused by a deliberate global design, not replanning waste; they are pinned in
 * `DOCUMENTED_GLOBAL_REPLAN_LANES` with the reason and the redesign that re-arms the strict gate,
 * and assert regression ratchets so they cannot silently get worse in the meantime.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createStudioIncrementalCalligraphySegmentBuilder,
  createStudioIncrementalScreentoneDotsBuilder,
  resolveStudioBrushRenderFamily,
  resolveStudioFreehandRenderPath,
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
import {
  planStudioCausalInkDabs,
  shouldAppendStudioCausalInkSample,
} from "../studio-causal-ink";
import { DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS } from "../studio-causal-watercolor-brush";
import { planStudioDynamicBrushCoverageMarks } from "../studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "../studio-dynamic-brush-render-plan";
import {
  FX_OIL_DAB_CAP,
  FxOilDabPlanner,
  createStudioIncrementalFxPressurePathBuilder,
  fxBrushSeedFromKey,
  planGlitterBrushParticles,
  planStudioFxBrushPressurePath,
  studioOilPaintBodyForBrush,
  studioOilTipProfileForBrush,
} from "../studio-fx-brush";
import {
  createStudioIncrementalHighlighterWashRibbonBuilder,
  resolveStudioHighlighterWashBrushId,
} from "../studio-highlighter-wash-ribbon";
import { STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1 } from "../studio-material-pressure-model";
import {
  captureStudioOutlineStrokeContractV1,
  createStudioIncrementalPerfectFreehandRenderPlanner,
  planStudioPerfectFreehandRender,
  type StudioOutlineStrokeContractV1,
} from "../studio-outline-stroke-contract";
import {
  loadStudioPerfectFreehandStroker,
  type StudioPerfectFreehandStroker,
} from "../studio-perfect-freehand";
import { createStudioIncrementalRetainedMediaCurveBuilder } from "../studio-retained-media-pressure";
import { planStudioRetainedMediaRibbon } from "../studio-retained-media-ribbon";

import { mapStudioBrushAliasPressure } from "./studio-brush-alias-profile";
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
import { resolveStudioCalligraphyRenderTip } from "./studio-calligraphy-nib-profile";
import { planStudioCalligraphyRibbon } from "./studio-calligraphy-ribbon";
import { studioFluidPaintStationSpacingRatio } from "./studio-fluid-paint-reference";
import {
  planStudioOilRibbonCarrier,
  studioOilRibbonProgramsForBrush,
} from "./studio-oil-ribbon-carrier";
import {
  evaluateStudioCalibratedSampledBudget,
  evaluateStudioCalibratedSampledDetection,
  STUDIO_PERF_CALIBRATION_MAX_GROWTH,
  type StudioCalibratedBudgetVerdict,
  type StudioPerfCalibrationSample,
} from "./studio-perf-calibration";
import { createStudioIncrementalAngledNibCoverageBuilder } from "./studio-stroke-local-coverage";
import { planStudioWetWashLivePipeline } from "./studio-wet-wash-live-pipeline";

import type { DrawEl } from "../studio-element-model";

// ── Gate constants ────────────────────────────────────────────────────────────────────────────

/** Long sweep. 3200 samples at ~3 px is roughly a 9.6 m pen path — a full-page ink sweep. */
const LONG_N = 3_200;
/** Short reference stroke. The 8x input ratio to LONG_N is what makes the growth bound readable. */
const SHORT_N = 400;
/** Pointer samples appended between replans: ~240 Hz input against a 60 Hz rAF. */
const MOVE_STEP = 4;
/**
 * Interleaved reference/workload pairs per lane, per pass.
 *
 * The gate statistic is the MINIMUM of these, not the median. Interference on a shared runner is
 * strictly additive — a scheduler preemption or a GC pause can only make a sample slower, never
 * faster — so the minimum is the least-contaminated estimate of what the planner actually costs,
 * and it is dramatically more reproducible run to run. A median over a handful of reps on a cheap
 * lane swings by 3-5x here, which is exactly how a ratio gate becomes a flaky gate. The median and
 * the p90 are still reported, because a wide min-to-p90 spread is itself worth seeing.
 */
const MAX_SAMPLES = 21;
/**
 * Minimum pairs kept when a slow lane trips the time budget below.
 *
 * Deliberately not lower: the budget below is wall-clock, so contention SHRINKS the sample count
 * exactly when the minimum needs more chances at a clean slot. Nine is the floor that stopped
 * that feedback loop from showing up in the oversubscribed readings.
 */
const MIN_SAMPLES = 9;
/**
 * Wall-clock ceiling per lane per pass, so one pathological lane cannot hang CI.
 *
 * Sized against the WHOLE pair, `seek` included: an untimed restore still costs real seconds
 * (`capsule-outline` pays ~10 ms per seek at n=3200), and budgeting only the timed windows is how
 * a 4 s file became a 28 s one.
 */
const PASS_BUDGET_MS = 900;
/** Untimed warm-up pairs before the first recorded sample (JIT, and the lane's retained state). */
const WARMUP_PAIRS = 2;
/**
 * Confirmation passes a violation has to survive, above the module's default of three.
 *
 * Interleaving equalises the two windows' exposure to preemption only while they are comparable
 * in length, and for one lane they are not: `oil-ribbon` times a ~28ms long move against a ~1.5ms
 * short one, and a window 20x longer catches 20x more preemption. Measured under 150%
 * oversubscription its honest x18 read x40/x37/x26 across three runs of the pre-interleaving
 * gate. Taking the minimum across more passes is what pulls that back under the lane's pin, and a
 * clean pass still ends the measurement, so a healthy lane never pays for the extra two.
 */
const GROWTH_PASSES = 5;
/**
 * Growth over a lane's PINNED calibrated baseline that counts as a regression.
 *
 * This used to be one global x2 for every lane, chosen from the gap between the two populations
 * (incremental planners at x0.1-x1.1, replanning ones at x2.5+). A single constant cannot do the
 * job once the ratio is honest: with the 0.1 ms denominator floor gone, correct lanes measure
 * x0.83-x1.63 and a x2 gate is 5x of slack for the cheapest of them — a budget loose enough to
 * stop catching regressions, which is exactly what PR #39 set out to end. So the budget is stated
 * per lane instead, as `LANE_GROWTH_PINS` x this multiple, which fixes the SAME convicted-
 * regression factor (x1.5) on every lane in the file. Against the old gate that is a strict
 * tightening everywhere: dry-dynamic used to need x5.3 before it tripped, pastel x3.1,
 * particle-fx x3.4, perfect-outline x1.63.
 *
 * It is also what makes the detection assertion provable rather than aspirational: a lane sitting
 * at its baseline convicts a doubling with 33% to spare (x2 against a x1.5 budget), whichever end
 * of the measured spread the lane lives at.
 */
const GROWTH_BUDGET_MULTIPLE = STUDIO_PERF_CALIBRATION_MAX_GROWTH;
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
/** 획 키 분리 — 프로브 스트로크마다 파이프라인 항목이 새로 시작해야 seek 이 정직하다. */
let wetDabsProbeSequence = 0;

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
 *
 * Pressure is held CONSTANT for these probes. Deposit spacing follows pressure, and the fixture's
 * pressure drifts with a ~785-sample period, so the tail pressure differs between the two lengths
 * (~0.95 at n=400 vs ~0.41 at n=3200). The same 4-sample timed move then deposits 2 dabs at the
 * short length but 5 at the long one (measured on CI, charcoal--vine-soft), and the gate reads
 * that OUTPUT growth as replan growth — x2.1 against the x2 allowance, a 7µs coin flip. Constant
 * pressure makes the timed move the same physical segment at both lengths; the state-size effect
 * this gate exists to catch is untouched (a whole-prefix replan still measures ~x8 here).
 */
const DYNAMIC_PROBE_PRESSURE = 0.6;

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
        pressure: DYNAMIC_PROBE_PRESSURE,
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
    path: "live-incremental",
    entry: "sceneFunc -> StudioIncrementalFxPressurePathBuilder.append",
    makeStroke: () => {
      // `StudioDrawNode` holds one builder per (element, symmetry variation)
      // (`fxPressurePathBuilderForVariation`) for ACTIVE DRAFTS and its pass sceneFuncs consume
      // the growing snapshot with `append` — this is the exact per-move call shape, including
      // the canonical pressure model and the accepted-input tension the render path reports for
      // new-pipeline strokes. Committed elements replay the whole-prefix
      // `planStudioFxBrushPressurePath` (also the SVG-export and legacy-document chain), a cost
      // no pointer move pays.
      const builder = createStudioIncrementalFxPressurePathBuilder();
      return wholePrefixStepper((stroke) =>
        builder.append({
          brushId: fxBrushId as Parameters<typeof planStudioFxBrushPressurePath>[0]["brushId"],
          points: freehandPath(stroke),
          pressures: stroke.pressures,
          pressureModel: STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1,
          tension: 0.3,
        }).segments.length,
      );
    },
  };
}

const LANE_PROBES: readonly LaneProbe[] = Object.freeze([
  // ── causal ink ──────────────────────────────────────────────────────────────────────────────
  {
    id: "causal-ink",
    brushId: "gpen--causal-round",
    path: "live-incremental",
    entry: "StudioLiveInkOverlay.appendPoint -> planStudioCausalInkDabs(two-sample suffix)",
    makeStroke: () => {
      // `StudioLiveInkOverlay`'s exact per-move calls with the canvas removed: `appendPoint`
      // passes each raw point through the same min-distance admission gate, and
      // `drawLatestPiece` then plans only the TWO-sample suffix and paints `dabs.slice(1)` —
      // the previous endpoint is already on the canvas. The whole-prefix `planStudioCausalInk`
      // this probe used to time is the commit/SVG-export chain, a cost no pointer move pays
      // (the header's own "both mistakes were made" note, caught late for this lane).
      let keptX: number[] = [];
      let keptY: number[] = [];
      let keptP: number[] = [];
      let consumed = 0;
      let totalDabs = 0;
      const appendThrough = (stroke: StrokePrefix, target: number): void => {
        for (; consumed < target; consumed += 1) {
          const x = stroke.points[consumed * 2]!;
          const y = stroke.points[consumed * 2 + 1]!;
          const pressure = stroke.pressures[consumed]!;
          if (keptX.length === 0) {
            keptX.push(x);
            keptY.push(y);
            keptP.push(pressure);
            continue;
          }
          const n = keptX.length;
          if (
            !shouldAppendStudioCausalInkSample({
              lastX: keptX[n - 1]!,
              lastY: keptY[n - 1]!,
              lastPressure: keptP[n - 1]!,
              nextX: x,
              nextY: y,
              nextPressure: pressure,
              minDistance: 1,
            })
          ) continue;
          keptX.push(x);
          keptY.push(y);
          keptP.push(pressure);
          totalDabs += planStudioCausalInkDabs({
            samples: [
              { x: keptX[n - 1]!, y: keptY[n - 1]!, pressure: keptP[n - 1]!, sourceIndex: n - 1 },
              { x, y, pressure, sourceIndex: n },
            ],
            size: 8,
          }).dabs.length - 1;
        }
      };
      return {
        seek(stroke) {
          if (stroke.pointCount < consumed) {
            keptX = [];
            keptY = [];
            keptP = [];
            consumed = 0;
            totalDabs = 0;
          }
          appendThrough(stroke, stroke.pointCount);
        },
        move(stroke) {
          appendThrough(stroke, stroke.pointCount);
          return totalDabs;
        },
      };
    },
  },

  // ── outline engines ─────────────────────────────────────────────────────────────────────────
  outlineProbe("perfect-outline", "pen--perfect-taper"),
  {
    id: "capsule-outline",
    brushId: "gpen--croquis-capsule",
    path: "live-incremental",
    entry: "StudioDrawNode draft -> incremental croquis capsule planner",
    makeStroke: () => {
      // `StudioDrawNode`'s active-draft outline branch keeps one element-id-keyed planner that
      // retains the pulled-string follower, normalized stations, capsule rings and the pathData
      // string across moves; only the raw-overridden last capsule point is rebuilt per move. The
      // batch `planStudioPerfectFreehandRender` remains the commit/SVG chain, a cost no pointer
      // move pays. (perfect-freehand engine lanes stay batch — global taper — hence the separate
      // `perfect-outline` probe above.)
      const contract: StudioOutlineStrokeContractV1 | null =
        captureStudioOutlineStrokeContractV1({
          brushId: "gpen--croquis-capsule",
          pressureSource: "recorded",
        });
      if (!contract) throw new Error("gpen--croquis-capsule: no outline stroke contract");
      const planner = createStudioIncrementalPerfectFreehandRenderPlanner();
      return wholePrefixStepper((stroke) => {
        const plan = planner.plan({
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
  },

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
    path: "live-incremental",
    entry: "StudioDrawNode draft -> planStudioWetWashLivePipeline (planner+material+carrier)",
    makeStroke: () => {
      // `StudioDrawNode`'s active-draft branch drives one element-id-keyed pipeline per move:
      // the causal planner, the material per-dab scale and the wet ribbon carrier all retain
      // their stable prefix, so a move pays only for new samples plus the preview tail. The
      // batch chain (`planCausalWatercolorBrushDabs` -> `applyStudioBrushAliasWatercolorMaterial`
      // -> `planStudioWetRibbonCarrier`) remains the commit/SVG-export path, a cost no pointer
      // move pays. The input mirrors the draft branch: raw points (causal strokes skip
      // `processFreehandPoints`), the shared causal dab cap and `previewEndpoint: true`.
      const strokeKey = `${ELEMENT_ID}:wet-dabs:${wetDabsProbeSequence += 1}`;
      return wholePrefixStepper((stroke) => {
        const plan = planStudioWetWashLivePipeline(strokeKey, {
          brushId: "watercolor--granular",
          input: {
            points: stroke.points,
            pressures: stroke.pressures,
            baseWidth: 30,
            seed: SEED,
            maxDabs: DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
            previewEndpoint: true,
          },
          carrierSeed: SEED,
        });
        return plan ? plan.carrierPlan.footprintCount : 0;
      });
    },
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
    path: "live-incremental",
    entry: "StudioDrawNode draft -> incremental angled-nib coverage builder",
    makeStroke: () => {
      // `StudioDrawNode`'s brush-family branch keeps one element-id-keyed builder per active
      // draft: segment polygons/densities are strictly local to their two endpoints, so the
      // retained prefix has no retroactive point at all. Tonal banding stays a per-call fold by
      // design (it is normalized to the mark's own observed peak/floor); the no-pressure shape
      // probed here collapses to the flat single layer, an O(1) assembly. The batch planner
      // remains the commit/SVG chain.
      const builder = createStudioIncrementalAngledNibCoverageBuilder();
      return wholePrefixStepper((stroke) =>
        builder.plan(
          freehandPath(stroke),
          18,
          -Math.PI / 6,
          null,
        ).polygons.length,
      );
    },
  },

  // ── pencil retained media ───────────────────────────────────────────────────────────────────
  {
    id: "pencil-path",
    brushId: "pencil--side-shade",
    path: "live-incremental",
    entry: "createStudioIncrementalRetainedMediaCurveBuilder.append(suffix)"
      + " -> planStudioRetainedMediaRibbon(suffix)",
    makeStroke: () => {
      // `paintPencilSuffix`'s exact per-move calls with the canvas removed: the incremental
      // curve builder consumes only the unseen point suffix (the previous final segment is
      // demoted in place), and the ribbon is planned for the painted-boundary suffix alone.
      // The whole-prefix curve+ribbon this probe used to time is the commit/repaint chain.
      // The builder rebuilds when the arrays shrink, which lets `seek` restore pre-move state.
      const builder = createStudioIncrementalRetainedMediaCurveBuilder("pencil", null);
      let paintedSourceSegments = 0;
      let paintedCells = 0;
      const paint = (stroke: StrokePrefix): number => {
        if (Math.floor(stroke.points.length / 2) < paintedSourceSegments) paintedCells = 0;
        const curve = builder.append(stroke.points, stroke.pressures);
        const startSegment = paintedSourceSegments === 0
          ? 0
          : Math.max(0, paintedSourceSegments - 1);
        const ribbon = planStudioRetainedMediaRibbon(
          startSegment === 0
            ? curve
            : { ...curve, segments: curve.segments.slice(startSegment) },
          10,
        );
        paintedSourceSegments = curve.segments.length;
        // Cumulative: the growth check needs an output that scales with the whole stroke, not
        // with the constant-size suffix.
        paintedCells += ribbon.cellCount;
        return paintedCells;
      };
      return { seek: paint, move: paint };
    },
  },

  // ── screentone ──────────────────────────────────────────────────────────────────────────────
  {
    id: "stamp-tone",
    brushId: "screentone--sparse-grid",
    path: "live-incremental",
    entry: "StudioDrawNode draft -> incremental screentone dot builder",
    makeStroke: () => {
      // `StudioDrawNode`'s screentone family branch keeps one element-id-keyed builder per
      // active draft: the stamp/dedupe walk retains its stable prefix and only the endpoint
      // stamp (the batch's one retroactive emission) is undone and re-stamped per move. The
      // batch `screentoneDotsForStroke` remains the commit/SVG chain.
      const builder = createStudioIncrementalScreentoneDotsBuilder();
      return wholePrefixStepper((stroke) =>
        builder.plan(stroke.points, 12, Math.max(3, 24 * 0.42)).length,
      );
    },
  },

  // ── family-level retained branches (no lane id in the catalog) ──────────────────────────────
  {
    id: "family:highlighter",
    brushId: "highlighter",
    path: "live-incremental",
    entry: "paintHighlighterSuffix -> fx builder.append -> wash builder.plan(suffix)",
    makeStroke: () => {
      // `paintHighlighterSuffix`'s exact per-move planning with the canvas removed: the retained
      // overlay keeps one fx-pressure-path builder and one wash-ribbon builder per stroke, so a
      // move pays geometry only for new samples plus the constant volatile tail. The batch chain
      // (`planStudioFxBrushPressurePath` -> `planStudioHighlighterWashRibbon`) remains the
      // commit/SVG-export path, a cost no pointer move pays. The one-fill REPAINT stays a clear
      // and retrace by design (translucent one-wash semantics); this gate times planning.
      const fxBuilder = createStudioIncrementalFxPressurePathBuilder();
      const washBuilder = createStudioIncrementalHighlighterWashRibbonBuilder();
      return wholePrefixStepper((stroke) => {
        const pressurePath = fxBuilder.append({
          brushId: "highlighter",
          points: freehandPath(stroke),
          pressures: stroke.pressures,
          pressureModel: STUDIO_MATERIAL_PRESSURE_MODEL_CANONICAL_V1,
          tension: 0.35,
        });
        return washBuilder.plan(
          {
            brushId: resolveStudioHighlighterWashBrushId("highlighter"),
            pressurePath,
            baseWidth: 24,
          },
          fxBuilder.stableSegmentCount(),
          fxBuilder.generation(),
        ).detailRuns.length;
      });
    },
  },
  {
    id: "family:calligraphy",
    brushId: "calligraphy",
    path: "live-incremental",
    entry: "createStudioIncrementalCalligraphySegmentBuilder.append(suffix)"
      + " -> planStudioCalligraphyRibbon(suffix)",
    makeStroke: () => {
      // `paintCalligraphySuffix`'s exact per-move calls with the canvas removed: the incremental
      // builder consumes only the unseen point suffix, with pressure/stylus arriving as parallel
      // per-index accessors that are only called for new indices — exactly the overlay's own
      // call shape. The builder rebuilds from scratch when the arrays shrink, which is what lets
      // `seek` restore the pre-move state on the same stepper.
      const tip = resolveStudioCalligraphyRenderTip("calligraphy", undefined);
      const builder = createStudioIncrementalCalligraphySegmentBuilder(14, tip ?? null);
      let paintedSourceSegments = 0;
      const paint = (stroke: StrokePrefix): number => {
        const segments = builder.append(
          stroke.points,
          (index) => mapStudioBrushAliasPressure("calligraphy", stroke.pressures[index], 0.5),
          (index) => ({
            pointerType: "pen" as const,
            tiltX: stroke.tiltXs[index],
            tiltY: stroke.tiltYs[index],
            twist: stroke.twists[index],
          }),
        );
        const start = paintedSourceSegments === 0
          ? 0
          : Math.max(0, paintedSourceSegments - 1);
        const ribbon = planStudioCalligraphyRibbon(segments.slice(start));
        paintedSourceSegments = segments.length;
        return ribbon.runs.length;
      };
      return { seek: paint, move: paint };
    },
  },
  fxPressurePathProbe("family:neon", "neon", "neon"),
  fxPressurePathProbe("family:glow", "glow", "glow"),
  // The pastel family draws live on the dynamic-dabs overlay (production canvas dump: the live
  // stroke accumulates on the dynamic overlay's hidden coverage + presentation canvases, planned
  // per move as an appendFrom suffix). The whole-prefix `planPastelBrushDabs` chain this probe
  // used to time is the retained `StudioDrawNode` commit/repaint and SVG-export cost, which no
  // pointer move pays.
  dynamicDabProbe("family:pastel", "pastel"),
]);

/**
 * Lanes deliberately NOT measured here, each with the reason. An honest skip list is part of the
 * deliverable: a silently omitted lane is indistinguishable from a lane nobody thought about.
 *
 * (Currently empty — every `StudioBrushEngineLaneId` and every retained family branch above has a
 * probe. Add an entry here rather than dropping a lane from `LANE_PROBES`.)
 */
const SKIPPED_LANES: readonly { readonly id: string; readonly reason: string }[] = Object.freeze([]);

/**
 * Lanes whose per-move growth is caused by a DELIBERATE global design rather than replanning
 * waste, pinned to their measured state while the linked redesign is pending.
 *
 * The strict flat assertions stay armed for every other lane. A lane in this map instead asserts
 * a regression RATCHET — bounds set with headroom above the worst growth/cost measured across CI
 * and local runs (2026-08-28) — so the lane cannot silently get worse while it waits, and landing
 * its redesign re-arms the strict gate by deleting the entry. Same discipline as `SKIPPED_LANES`:
 * documented, with a reason, never silently dropped.
 *
 * - `oil-ribbon`: the carrier's alpha aggregation is normalized to the stroke's own observed
 *   span (global `bodyOpacity` mean, load bands over the observed min/max, band-mean shell
 *   deltas), so one append can retroactively re-band every run — value-identical incremental
 *   assembly is impossible by construction. The flat path is the landed but deliberately
 *   unlinked `bristleBanding: "fixed-anchor-v2"` carrier, an intentional tone change that must
 *   pass the knot/quality browser gates first
 *   (`docs/perf/brush-advancement-roadmap-2026-08-22.md` §3-1·2, completion plan §3-3). At the
 *   dab cap the live overlay no longer pays this planner at all (capped-refit skip in
 *   `studio-live-retained-media-overlay`), so the pinned cost is the pre-cap regime's.
 * - `perfect-outline`: perfect-freehand's start/end taper reads the stroke's TOTAL running
 *   length, so the outline is a global function of the point array, and the stroker is an
 *   external kernel consumed whole-array (roadmap §4 stages this gate separately behind
 *   pathData/Path2D caching).
 * - `particle-fx`: `sampleStations` LOD-refits the whole arc once the station budget saturates
 *   (n=3200 is past it at this probe's spacing), moving every station per move by design — the
 *   same redistribution semantics as the oil cap, with per-station hashes keyed to the moving
 *   station index on top.
 */
const DOCUMENTED_GLOBAL_REPLAN_LANES: ReadonlyMap<
  string,
  { readonly reason: string; readonly maxMoveMs: number }
> = new Map([
  // The growth ratchet each of these carries now lives in `LANE_GROWTH_PINS` with every other
  // lane's, because the gate below no longer has a "strict" and a "documented" branch to choose
  // between: every lane is judged against its own recorded ratio. What stays here is why the
  // growth is designed rather than accidental, and the absolute per-move ceiling that goes with it.
  ["oil-ribbon", {
    reason: "observed-span alpha aggregation — flat path is the quality-gated fixed-anchor v2"
      + " carrier (roadmap 2026-08-22 §3-3)",
    // 절대 이동 비용은 머신 편차가 크다(CI 39.8ms, 스로틀된 로컬 컨테이너 88.8ms) — 기계
    // 정규화된 성장비가 하중을 지고, 절대 상한은 자릿수 회귀만 잡는다.
    maxMoveMs: 140,
  }],
  ["perfect-outline", {
    reason: "perfect-freehand global taper — whole-array external stroker (roadmap §4)",
    maxMoveMs: 9,
  }],
  ["particle-fx", {
    reason: "station lattice LOD-refits the whole arc at the particle budget (oil-cap"
      + " redistribution semantics)",
    maxMoveMs: 2,
  }],
]);

/**
 * Each lane's pinned calibrated growth: n=3200 per-move cost over n=400 per-move cost, measured
 * the way the gate measures it — interleaved, minimum of the samples in a pass, minimum across
 * confirmation passes. The gate allows `GROWTH_BUDGET_MULTIPLE` x these.
 *
 * Why per lane rather than one constant: the ratio is honest now (no denominator floor), and the
 * honest values are NOT interchangeable — correct incremental lanes span x0.83 (`family:pastel`,
 * whose long move is genuinely cheaper than its short one) to x1.63 (`oil-extrude`). One global
 * gate that accepts x1.63 with margin cannot also convict a doubling of the x0.83 lane, because
 * x0.83 doubled is x1.66 — still under it. Pinning each lane makes both true at once, and it is
 * the same idiom `DOCUMENTED_GLOBAL_REPLAN_LANES` above already uses for its three ratchets.
 *
 * These are recorded values, not targets: an unlisted lane fails the coverage test rather than
 * silently defaulting to something generous. A lane that legitimately changes shape re-pins here,
 * in a commit that has to say why. The tolerance band a pinned value buys is [x0.75, x1.5] of
 * itself — above it the budget trips, below it the detection assertion does, so a lane that
 * drifts in either direction is a red build and not a quiet decay. That band is exactly 2x wide
 * and cannot be widened: making the budget more generous raises the ratio a doubling has to clear
 * by the same factor. Both edges are retried before they convict, though — a violation has to be
 * earned by every confirmation pass and a failure to detect by every attempt — so a lone outlier
 * on either side is re-measured rather than believed.
 *
 * Recorded as the geometric centre of that band over twelve runs on an Apple-silicon dev machine
 * under Node 24 — six idle and six with the box deliberately oversubscribed (8 spinning hogs
 * against 12 cores), because a runner is a shared machine and a pin taken only on a quiet one
 * would hand the whole band to contention. The combined per-lane spread came to x1.02-x1.61,
 * leaving roughly x1.1-x1.4 of the band for machine-to-machine drift on top of that. The two
 * windows are the same code at two lengths, which is the tightest instruction-mix match a
 * denominator can have, so these travel far better than a ratio taken against a synthetic kernel
 * does — the impasto budgets in studio-oil-ribbon-carrier.impasto-relief.test.ts, which do use
 * the synthetic kernel, read ~1.0 where they were pinned and ~0.5 on this machine.
 *
 * The three `DOCUMENTED_GLOBAL_REPLAN_LANES` are pinned here too, replacing the raw growth
 * ratchets they used to carry (x12.0, x26.3, x7.4 against x11, x26, x8). Two land under the old
 * number and `perfect-outline` lands above it, because all three MEASURE higher than the old gate
 * did — interleaving stops a lane from warming its long window over 21 back-to-back reps, and
 * that lane read x6.76 there against x8.2-x8.8 here. Per unit of regression every one of them is
 * tighter than before: `perfect-outline` used to need x1.63 to trip and now needs x1.42,
 * `particle-fx` x3.4 and now x1.5.
 */
interface LaneGrowthPin {
  /** Recorded calibrated growth: n=3200 per-move cost over n=400 per-move cost. */
  readonly growth: number;
  /**
   * Moves planned into one timed window. Each is timed on its own and the deltas summed, so no
   * `seek` is ever inside the window — this repeats one move, it does not advance the stroke.
   *
   * Sized so the window reaches ~50 us (>1200 ticks of this runtime's 41 ns clock) on the
   * recording machine, and 1 for every lane already past that on its own. The cheapest lanes
   * plan a move in ~1 us, and a 1 us window is not measurable enough to gate on: `stamp-tone`
   * read x1.15, x4.62, x1.00, x1.16, x1.04 across five consecutive runs at one move per window,
   * and the x4.62 was a red build. Averaging inside the window took its eight-run idle spread to
   * x1.02-x1.29 — a lane that stays inside its own band instead of leaving it at random.
   *
   * The count is PINNED rather than derived from the machine at run time, so no cross-machine
   * drift can enter through it: repeating a move warms caches, and how much depends on how many
   * repeats there are (measured: `dry-dynamic` reads x1.23 at one move per window, x1.46 at
   * eight, x1.85 at sixty-four). A pinned count measures the same shape on every box, and a
   * slower one simply gets a longer window than it needed.
   */
  readonly movesPerWindow: number;
}

const LANE_GROWTH_PINS: ReadonlyMap<string, LaneGrowthPin> = new Map([
  ["causal-ink", { growth: 1.1, movesPerWindow: 50 }],
  ["perfect-outline", { growth: 8.0, movesPerWindow: 1 }],
  ["capsule-outline", { growth: 0.85, movesPerWindow: 1 }],
  ["oil-ribbon", { growth: 17.5, movesPerWindow: 1 }],
  ["oil-extrude", { growth: 1.26, movesPerWindow: 1 }],
  ["dry-dynamic", { growth: 1.13, movesPerWindow: 1 }],
  ["spray-dynamic", { growth: 1.24, movesPerWindow: 1 }],
  ["wet-dabs", { growth: 1.07, movesPerWindow: 1 }],
  ["wet-stamp", { growth: 1.1, movesPerWindow: 6 }],
  ["dry-stamp", { growth: 1.38, movesPerWindow: 6 }],
  ["spray-stamp", { growth: 1.07, movesPerWindow: 8 }],
  ["particle-fx", { growth: 4.95, movesPerWindow: 1 }],
  ["angled-ribbon", { growth: 1.06, movesPerWindow: 50 }],
  ["pencil-path", { growth: 1.05, movesPerWindow: 6 }],
  ["stamp-tone", { growth: 1.25, movesPerWindow: 50 }],
  ["family:highlighter", { growth: 1.64, movesPerWindow: 1 }],
  ["family:calligraphy", { growth: 0.96, movesPerWindow: 1 }],
  ["family:neon", { growth: 1.25, movesPerWindow: 25 }],
  ["family:glow", { growth: 1.19, movesPerWindow: 25 }],
  ["family:pastel", { growth: 0.83, movesPerWindow: 1 }],
]);

// ── Measurement ───────────────────────────────────────────────────────────────────────────────

/** One length's sample spread. The min is the gate statistic; the rest is evidence for the log. */
interface Measurement {
  readonly pointCount: number;
  /** Gate statistic: the cheapest observed move, i.e. the one least disturbed by the machine. */
  readonly min: number;
  readonly p50: number;
  readonly p90: number;
  readonly reps: number;
  readonly outputSize: number;
}

interface LaneCurve {
  readonly short: Measurement;
  readonly long: Measurement;
}

function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

/**
 * One lane's interleaved sampler.
 *
 * Each sample plans the n=400 move and then, immediately after it, the n=3200 move — the
 * reference/workload pair `studio-perf-calibration.ts` reduces. Both `seek` calls stay OUTSIDE
 * the timed windows: a real pointer move never pays the state restore, and for a whole-prefix
 * lane `seek` is a full replan that would swamp the very cost being measured.
 *
 * The two lengths get their own steppers so neither one's retained state is disturbed by the
 * other, exactly as when the two lengths were measured in separate loops.
 */
function createLaneRun(probe: LaneProbe, movesPerWindow: number) {
  const shortBefore = prefix(SHORT_N - MOVE_STEP);
  const shortAt = prefix(SHORT_N);
  const longBefore = prefix(LONG_N - MOVE_STEP);
  const longAt = prefix(LONG_N);
  const shortStroke = probe.makeStroke();
  const longStroke = probe.makeStroke();
  const shortWindows: number[] = [];
  const longWindows: number[] = [];
  let shortOutput = 0;
  let longOutput = 0;
  let recording = false;

  /** One window: `movesPerWindow` pointer moves, each timed, with every `seek` left outside. */
  const shortWindowMs = (): number => {
    let total = 0;
    for (let move = 0; move < movesPerWindow; move += 1) {
      shortStroke.seek(shortBefore); // untimed: restore the pre-move state
      const startedAt = performance.now();
      shortOutput = shortStroke.move(shortAt); // timed: ONE pointer move
      total += performance.now() - startedAt;
    }
    return total;
  };
  const longWindowMs = (): number => {
    let total = 0;
    for (let move = 0; move < movesPerWindow; move += 1) {
      longStroke.seek(longBefore); // untimed
      const startedAt = performance.now();
      longOutput = longStroke.move(longAt); // timed
      total += performance.now() - startedAt;
    }
    return total;
  };

  let sampleIndex = 0;
  const takeSample = (): StudioPerfCalibrationSample => {
    // The two windows alternate which one goes first. They are adjacent either way — what the
    // interleaving is for — but a fixed order makes the SECOND window carry every mid-pair
    // deschedule, and the second window was always the long one. Measured on an oversubscribed
    // box that biased whole lanes upward (`family:glow` x1.05-x1.28 idle against x1.14-x1.68
    // there, sustained across all three confirmation passes rather than as an outlier).
    //
    // This is NOT the hoisting that #44 measured and rejected. There, both seeks moved ahead of
    // both moves so the timed windows became adjacent, which put the SHORT move immediately after
    // the long seek — and that seek allocates heavily replaying its prefix, so the collection it
    // provokes was charged to the short window: the baseline rose from ~0.09ms to 0.130-0.156ms
    // and an injected regression that read x2.42-x2.72 read x1.5-x1.7 and passed. Here every seek
    // still sits immediately before the move it restores, in both orders; only which PAIR runs
    // first alternates. The reduction is a minimum per side, so each side's honest reading comes
    // from the samples where it ran first, and neither can be inflated by the other's allocation.
    const longFirst = (sampleIndex += 1) % 2 === 0;
    const workMs = longFirst ? longWindowMs() : undefined;
    const referenceMs = shortWindowMs();
    const sample = {
      referenceMs,
      workMs: workMs ?? longWindowMs(),
    };
    if (recording) {
      shortWindows.push(sample.referenceMs);
      longWindows.push(sample.workMs);
    }
    return sample;
  };

  return {
    takeSample,
    /**
     * Untimed warm-up: JIT, plus the state an incremental lane would really hold one move earlier.
     * Returns the samples this pass can afford, so no single lane can hang CI.
     */
    warm(pairs: number): number {
      let cheapestPairMs = Infinity;
      for (let pair = 0; pair < pairs; pair += 1) {
        const startedAt = performance.now();
        takeSample();
        cheapestPairMs = Math.min(cheapestPairMs, performance.now() - startedAt);
      }
      recording = true;
      const affordable = Math.floor(PASS_BUDGET_MS / Math.max(cheapestPairMs, 0.001));
      return Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, affordable));
    },
    /** Per-MOVE spread, so the ceiling assertion and the log stay in the units the lane is felt in. */
    curve(): LaneCurve {
      const short = shortWindows.map((window) => window / movesPerWindow)
        .sort((left, right) => left - right);
      const long = longWindows.map((window) => window / movesPerWindow)
        .sort((left, right) => left - right);
      return {
        short: {
          pointCount: SHORT_N,
          min: short[0]!,
          p50: quantile(short, 0.5),
          p90: quantile(short, 0.9),
          reps: short.length,
          outputSize: shortOutput,
        },
        long: {
          pointCount: LONG_N,
          min: long[0]!,
          p50: quantile(long, 0.5),
          p90: quantile(long, 0.9),
          reps: long.length,
          outputSize: longOutput,
        },
      };
    },
  };
}

function describeCurve(
  probe: LaneProbe,
  curve: LaneCurve,
  verdict: StudioCalibratedBudgetVerdict,
  baseline: number,
  movesPerWindow: number,
): string {
  const { short, long } = curve;
  return [
    `lane ${probe.id} (brush ${probe.brushId})`,
    `  path:  ${probe.path}`,
    `  entry: ${probe.entry}`,
    `  n=${SHORT_N}: min ${short.min.toFixed(3)}ms  p50 ${short.p50.toFixed(3)}ms`
      + `  p90 ${short.p90.toFixed(3)}ms  out ${short.outputSize}  (${short.reps} samples)`,
    `  n=${LONG_N}: min ${long.min.toFixed(3)}ms  p50 ${long.p50.toFixed(3)}ms`
      + `  p90 ${long.p90.toFixed(3)}ms  out ${long.outputSize}  (${long.reps} samples)`,
    `  calibrated growth x${verdict.ratio.toFixed(2)} against a pinned x${baseline.toFixed(2)}`
      + ` (linear-in-n would be x${LONG_N / SHORT_N};`
      + ` gate allows x${verdict.maxRatio.toFixed(2)}; ${movesPerWindow} moves per window)`,
    // What this reading could still convict, printed rather than left to the header. The
    // assertion below holds it at or under x2 on every lane; printing it says by how much, and
    // makes a lane drifting toward its pin visible before it gets there.
    `  smallest slowdown this reading would convict: x${
      (verdict.maxRatio / verdict.ratio).toFixed(2)
    }`,
    `  ${verdict.detail}`,
  ].join("\n");
}

/**
 * Every lane's curve, printed once at the end of the run.
 *
 * A CI log that shows only the lanes that tripped hides the lane that is one commit away from
 * tripping. `process.stdout.write` rather than `console.log` because the runner intercepts the
 * latter and buries it under the failing test that produced it.
 */
const MEASURED: {
  probe: LaneProbe;
  curve: LaneCurve;
  verdict: StudioCalibratedBudgetVerdict;
  baseline: number;
}[] = [];

function summaryTable(): string {
  const header = [
    "lane".padEnd(20),
    "path".padEnd(21),
    "n=400 min".padStart(11),
    "n=3200 min".padStart(12),
    "growth".padStart(8),
    "pinned".padStart(8),
    "budget".padStart(8),
    "  verdict",
  ].join("");
  const rows = MEASURED.map(({ probe, curve, verdict, baseline }) => {
    const ceilingMs = DOCUMENTED_GLOBAL_REPLAN_LANES.get(probe.id)?.maxMoveMs
      ?? PER_MOVE_CEILING_MS;
    const underCeiling = curve.long.min < ceilingMs;
    const documented = DOCUMENTED_GLOBAL_REPLAN_LANES.has(probe.id);
    return [
      probe.id.padEnd(20),
      probe.path.padEnd(21),
      `${curve.short.min.toFixed(3)}ms`.padStart(11),
      `${curve.long.min.toFixed(3)}ms`.padStart(12),
      `x${verdict.ratio.toFixed(2)}`.padStart(8),
      `x${baseline.toFixed(2)}`.padStart(8),
      `x${verdict.maxRatio.toFixed(2)}`.padStart(8),
      `  ${!verdict.ok ? "GROWS" : !underCeiling ? "OVER CEILING" : documented
        ? "documented" : "flat"}`,
    ].join("");
  });
  return [
    "",
    "long-stroke per-move planning cost — full calibrated curve",
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
    // A probe with no pinned baseline would run against a budget nobody chose, so the pinning
    // table is part of lane coverage rather than a detail of the gate body.
    const unpinned = LANE_PROBES
      .filter((probe) => !LANE_GROWTH_PINS.has(probe.id))
      .map((probe) => probe.id);
    expect(
      unpinned,
      `probed lanes with no LANE_GROWTH_PINS entry: ${unpinned.join(", ")}`,
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
      const pin = LANE_GROWTH_PINS.get(probe.id);
      expect(
        pin,
        `${probe.id} has no pinned calibrated growth — add one to`
          + " LANE_GROWTH_PINS with the measured value, rather than letting the lane run"
          + " against a default nobody chose",
      ).toBeDefined();
      const baseline = pin!.growth;
      const maxRatio = baseline * GROWTH_BUDGET_MULTIPLE;
      const documented = DOCUMENTED_GLOBAL_REPLAN_LANES.get(probe.id);
      const label = `${probe.id} (brush ${probe.brushId})`;

      const run = createLaneRun(probe, pin!.movesPerWindow);
      const samples = run.warm(WARMUP_PAIRS);

      // GROWTH — the load-bearing assertion. Interleaved ratio, so the machine cancels out, and
      // a violation has to be earned by every confirmation pass.
      const verdict = evaluateStudioCalibratedSampledBudget({
        label,
        takeSample: run.takeSample,
        maxRatio,
        samples,
        warmups: 0, // already warmed above, and the warm-up pairs must not pollute the curve
        passes: GROWTH_PASSES,
      });
      const curve = run.curve();
      MEASURED.push({ probe, curve, verdict, baseline });
      const rendered = describeCurve(probe, curve, verdict, baseline, pin!.movesPerWindow);
      const context = documented
        ? `${rendered}\n  reason: ${documented.reason}`
        : rendered;

      // The stroke really did get longer — a planner that saturated its own cap at n=400 would
      // otherwise pass every assertion without ever having been stressed.
      expect(curve.long.outputSize, `${context}\n  (output did not grow with the stroke)`)
        .toBeGreaterThanOrEqual(curve.short.outputSize);

      expect(
        verdict.ok,
        documented
          // Regression ratchet only — the growth is a deliberate global design (see the map's doc
          // for why, and for the redesign that re-arms the strict gate by deleting the entry).
          ? `DOCUMENTED GLOBAL-REPLAN LANE REGRESSED past its pinned growth ratchet.\n${context}`
          : "PER-MOVE COST GROWS WITH STROKE LENGTH — this lane replans work it already"
            + ` planned.\n${context}`,
      ).toBe(true);

      // DETECTION — the gate's mirror image, from the passes it just judged, so the healthy case
      // measures nothing extra. Without this a calibrated budget can decay into a no-op the day a
      // lane gets cheap enough that its own pinned baseline stops meaning anything.
      const detection = evaluateStudioCalibratedSampledDetection({
        label,
        takeSample: run.takeSample,
        maxRatio,
        seed: verdict.passes,
        factor: 2,
        samples,
        warmups: 0,
      });
      expect(
        detection.detected,
        `THIS LANE'S GROWTH GATE WOULD NO LONGER CATCH A DOUBLING — re-pin its`
          + ` LANE_GROWTH_PINS entry to what it now measures.\n${context}`
          + `\n  ${detection.detail}`,
      ).toBe(true);

      // CEILING — stops a lane from passing the ratio by being uniformly slow. Deliberately still
      // an absolute budget: it is a product requirement (a share of one interactive frame), not a
      // measurement of this machine. It is also nowhere near load-bearing — every flat lane clears
      // it by two to four orders of magnitude, and the three documented ones by 4-5x — so a
      // machine-sized reading of it would buy nothing that the growth gate above is not already
      // buying with a ratio.
      const ceilingMs = documented?.maxMoveMs ?? PER_MOVE_CEILING_MS;
      expect(
        curve.long.min,
        documented
          ? `DOCUMENTED GLOBAL-REPLAN LANE REGRESSED past its pinned per-move ceiling.\n${context}`
            + `\n  ceiling: ${ceilingMs}ms per move`
          : `PER-MOVE COST EXCEEDS THE INTERACTIVE BUDGET at n=${LONG_N}.\n${context}`
            + `\n  ceiling: ${ceilingMs}ms per move`,
      ).toBeLessThan(ceilingMs);
    },
    120_000,
  );
});
