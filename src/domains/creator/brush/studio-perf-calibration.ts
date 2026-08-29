/**
 * Machine-independent wall-clock budgets for brush hot paths.
 *
 * A raw millisecond budget measures the planner AND the machine underneath it. The same commit
 * that finishes a 2000-station impasto plan in 16ms on a CI runner needs 32ms on a throttled
 * 4-vCPU dev container, so an absolute budget either fails honest work on the slower box or is
 * loosened until it stops catching real regressions. Min-of-N sampling only removes the noise
 * that a *transient* stall adds; it cannot remove the machine.
 *
 * This module removes the machine instead, the same way
 * `evaluateStudioBrushCataloguePaintSoak` in scripts/studio-brush-catalogue-perf-matrix.ts
 * stopped comparing raw numbers: the budget is stated as a RATIO against a fixed reference
 * kernel measured in the same process, milliseconds away from the workload itself. Both
 * numerator and denominator scale with the machine, so the verdict does not — while a regression
 * in the measured code path moves only the numerator and still trips the gate.
 *
 * Four properties do the work:
 *
 * 1. **A pinned reference kernel.** `runStudioPerfCalibrationRounds` is deterministic scalar
 *    float/integer traffic over a 4KB `Float64Array`. It is small enough to stay resident in
 *    L1 (so alternating it with the workload does not evict the workload's own working set)
 *    and its per-round cost is linear, so a call site sizes it to match its own measured
 *    window: `referenceRounds` is chosen so an unregressed workload scores ≈1.0.
 * 2. **Interleaved sampling.** Each sample times the reference and then the workload back to
 *    back, so a contended stretch inflates both and the pair stays honest. Each pass reduces
 *    its samples to `min(workMs) / min(referenceMs)`; scheduler noise only ever ADDS time, so
 *    both minima are the honest estimate of the underlying cost.
 * 3. **Earned violations.** A pass that clears the gate ends the measurement. A pass that
 *    trips it is re-measured, and the verdict takes the MINIMUM ratio across passes — so a
 *    single unlucky pass can never fail the gate, while a real regression trips every pass.
 *    Recorded on a deliberately oversubscribed container (6 spinning hogs against 4 cores),
 *    an honest scribble plan produced a 1.83 pass next to a 0.92 pass in the very next run;
 *    a genuinely doubled plan never scored below 1.94 in the same conditions.
 * 4. **An earned detection claim.** `evaluateStudioCalibratedDetection` is the mirror image:
 *    it asserts, live and on the machine at hand, that a 2x regression of the same workload
 *    WOULD have been convicted. That is what stops a calibrated budget from decaying into a
 *    friendlier no-op, and it re-measures rather than believing one distorted reading — a
 *    failure to detect has to be earned exactly like a violation does.
 *
 * Detection power is unchanged by construction, and the recorded spread says so: across idle
 * and heavily contended runs of the three call sites, honest passes stayed at or under 1.39
 * while every 2x-regressed pass landed at or above 1.94. `STUDIO_PERF_CALIBRATION_MAX_GROWTH`
 * sits at 1.5, between the two populations — see studio-perf-calibration.test.ts, which pins
 * both populations as recorded series.
 */

/**
 * 512 doubles = 4KB. Deliberately L1-resident: an earlier 32KB buffer evicted the ribbon
 * planner's own working set between samples and inflated the *workload* window by ~60%,
 * which is exactly the machine-dependence this module exists to remove.
 */
const STUDIO_PERF_CALIBRATION_SCRATCH = new Float64Array(512);

/** Kept live across calls so V8 cannot fold the reference kernel away as dead code. */
let studioPerfCalibrationSink = 0;

/**
 * One deterministic reference round: an integer hash mixed into transcendental float work and
 * a dependent read/write over the scratch buffer. Deliberately boring, and deliberately NOT
 * shared with any brush code — the reference must be a measure of the machine only, so no
 * change to a brush hot path can ever move the denominator with the numerator.
 */
export function runStudioPerfCalibrationRounds(rounds: number): number {
  const scratch = STUDIO_PERF_CALIBRATION_SCRATCH;
  const length = scratch.length;
  let sink = 0;
  for (let round = 0; round < rounds; round += 1) {
    let state = Math.imul(round + 1, 2654435761) >>> 0;
    for (let index = 0; index < length; index += 1) {
      state = (Math.imul(state ^ (state >>> 15), 2246822519) + index) >>> 0;
      const unit = state / 4294967296;
      const previous = scratch[(index + length - 1) % length]!;
      const value =
        Math.sqrt(unit * unit + 0.5)
        + Math.sin(unit * Math.PI * 2) * 0.25
        + previous * 0.001;
      scratch[index] = value;
      sink += value;
    }
  }
  studioPerfCalibrationSink += sink;
  return sink;
}

/** Total reference work retired in this process. Assert it is finite to keep the sink alive. */
export function readStudioPerfCalibrationSink(): number {
  return studioPerfCalibrationSink;
}

/** One interleaved reference/workload pair. */
export interface StudioPerfCalibrationSample {
  readonly referenceMs: number;
  readonly workMs: number;
}

/** One measurement pass, already reduced to its honest (minimum) reference and workload cost. */
export interface StudioPerfCalibrationPass extends StudioPerfCalibrationSample {
  readonly ratio: number;
  readonly sampleCount: number;
}

export interface StudioCalibratedBudgetVerdict {
  readonly label: string;
  readonly ok: boolean;
  /** Minimum pass ratio — the cost the workload has to *earn* before the gate trips. */
  readonly ratio: number;
  readonly maxRatio: number;
  readonly passes: readonly StudioPerfCalibrationPass[];
  /** Human-readable evidence, suitable as the assertion message. */
  readonly detail: string;
}

/**
 * Growth over the calibrated baseline that counts as a regression. Recorded honest passes top
 * out at 1.39 under heavy contention and recorded 2x-regressed passes bottom out at 1.94, so
 * 1.5 separates the populations with ~8% headroom below and ~29% margin above. Lowering it
 * buys detection power the recorded noise cannot support; raising it past 1.94 would start
 * hiding a doubling, which studio-perf-calibration.test.ts fails on.
 */
export const STUDIO_PERF_CALIBRATION_MAX_GROWTH = 1.5;

/** Passes a violation must survive before it counts. */
export const STUDIO_PERF_CALIBRATION_CONFIRMATION_PASSES = 3;

/**
 * Reduces interleaved samples to one pass. Both sides take their MINIMUM: contention only ever
 * adds time, so the cheapest reference and the cheapest workload window are the honest
 * estimates of what each actually costs on this machine.
 */
export function reduceStudioPerfCalibrationSamples(
  samples: readonly StudioPerfCalibrationSample[],
): StudioPerfCalibrationPass {
  if (samples.length === 0) {
    throw new Error("A calibration pass needs at least one sample.");
  }
  const referenceMs = Math.min(...samples.map((sample) => sample.referenceMs));
  const workMs = Math.min(...samples.map((sample) => sample.workMs));
  if (!(referenceMs > 0) || !Number.isFinite(workMs)) {
    throw new Error(
      `Unusable calibration pass: referenceMs=${referenceMs}, workMs=${workMs}. `
      + "A zero-length reference window means the reference was sized too small for this clock.",
    );
  }
  return { referenceMs, workMs, ratio: workMs / referenceMs, sampleCount: samples.length };
}

/**
 * Pure verdict over one or more passes. A violation must be earned by EVERY pass: the reported
 * ratio is the minimum, mirroring the soak gate's refusal to convict on a single sample.
 */
export function judgeStudioCalibratedBudget(
  label: string,
  passes: readonly StudioPerfCalibrationPass[],
  maxRatio: number = STUDIO_PERF_CALIBRATION_MAX_GROWTH,
): StudioCalibratedBudgetVerdict {
  if (passes.length === 0) {
    throw new Error(`No calibration passes recorded for ${label}.`);
  }
  const ratio = Math.min(...passes.map((pass) => pass.ratio));
  const rendered = passes
    .map((pass) => `${pass.ratio.toFixed(3)} (${pass.workMs.toFixed(1)}ms work / `
      + `${pass.referenceMs.toFixed(1)}ms reference, ${pass.sampleCount} samples)`)
    .join("; ");
  return {
    label,
    ok: ratio <= maxRatio,
    ratio,
    maxRatio,
    passes,
    detail:
      `${label}: calibrated cost ${ratio.toFixed(3)}x the reference kernel, budget `
      + `${maxRatio.toFixed(2)}x. Passes: ${rendered}.`,
  };
}

/**
 * Restates a measured pass as if the workload had become `factor`x more expensive, keeping the
 * machine underneath it exactly as measured. This is how a call site proves, on whatever box it
 * is running on right now, that its own honest measurement would have been convicted had the hot
 * path regressed — the same shape as feeding a synthetic regression to a pure detector, but
 * anchored to a live reading rather than a recorded one.
 */
export function scaleStudioPerfCalibrationPass(
  pass: StudioPerfCalibrationPass,
  factor: number,
): StudioPerfCalibrationPass {
  if (!(factor > 0) || !Number.isFinite(factor)) {
    throw new Error(`A regression factor must be a positive finite number, got ${factor}.`);
  }
  const workMs = pass.workMs * factor;
  return { ...pass, workMs, ratio: workMs / pass.referenceMs };
}

export interface StudioCalibratedBudgetOptions {
  /** Named in the assertion message. */
  readonly label: string;
  /** The measured hot path. Must consume its own result so it cannot be optimized away. */
  readonly workload: () => void;
  /**
   * Reference rounds per sample. Size this so an unregressed workload scores ≈1.0: matched
   * window lengths keep the two sides equally exposed to preemption, which is what makes the
   * ratio hold under contention.
   */
  readonly referenceRounds: number;
  readonly maxRatio?: number;
  readonly samples?: number;
  /** Full reference+workload iterations run before the first timed sample. */
  readonly warmups?: number;
  readonly passes?: number;
}

/**
 * Measures `workload` against the reference kernel and returns the verdict. Passes stop as soon
 * as one clears the gate, so the happy path costs exactly one pass.
 */
export function evaluateStudioCalibratedBudget(
  options: StudioCalibratedBudgetOptions,
): StudioCalibratedBudgetVerdict {
  const {
    label,
    workload,
    referenceRounds,
    maxRatio = STUDIO_PERF_CALIBRATION_MAX_GROWTH,
    samples = 5,
    warmups = 2,
    passes = STUDIO_PERF_CALIBRATION_CONFIRMATION_PASSES,
  } = options;

  warmStudioPerfCalibration(workload, referenceRounds, warmups);

  const recorded: StudioPerfCalibrationPass[] = [];
  for (let pass = 0; pass < passes; pass += 1) {
    recorded.push(measureStudioPerfCalibrationPass(workload, referenceRounds, samples));
    const verdict = judgeStudioCalibratedBudget(label, recorded, maxRatio);
    if (verdict.ok) return verdict;
  }
  return judgeStudioCalibratedBudget(label, recorded, maxRatio);
}

/**
 * Runs every requested pass with no early exit and hands back the raw passes. For callers that
 * need the whole spread rather than a verdict — notably this module's own end-to-end tests,
 * which assert that a workload doing k times the reference's work really does READ as k. That
 * claim lives on the best-calibrated pass: a pass whose two windows were scheduled wildly
 * differently (measured on a 250%-oversubscribed box: the very same doubled kernel read 2.133
 * and then 0.538 in consecutive passes) says nothing about the harness, only about the box.
 */
export function measureStudioCalibratedPasses(
  options: StudioCalibratedBudgetOptions,
): readonly StudioPerfCalibrationPass[] {
  const {
    workload,
    referenceRounds,
    samples = 5,
    warmups = 2,
    passes = STUDIO_PERF_CALIBRATION_CONFIRMATION_PASSES,
  } = options;
  warmStudioPerfCalibration(workload, referenceRounds, warmups);
  const recorded: StudioPerfCalibrationPass[] = [];
  for (let pass = 0; pass < passes; pass += 1) {
    recorded.push(measureStudioPerfCalibrationPass(workload, referenceRounds, samples));
  }
  return recorded;
}

function warmStudioPerfCalibration(
  workload: () => void,
  referenceRounds: number,
  warmups: number,
): void {
  for (let warmup = 0; warmup < warmups; warmup += 1) {
    runStudioPerfCalibrationRounds(referenceRounds);
    workload();
  }
}

/**
 * One interleaved pass. The reference is timed immediately before the workload every sample, on
 * purpose: a contended stretch has to inflate BOTH windows, or the ratio stops meaning anything.
 * Warm-up timings are deliberately NOT folded in — a reference measured in a quieter moment than
 * the workload it divides is exactly how a false conviction is manufactured.
 */
function measureStudioPerfCalibrationPass(
  workload: () => void,
  referenceRounds: number,
  samples: number,
): StudioPerfCalibrationPass {
  const taken: StudioPerfCalibrationSample[] = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const referenceStarted = performance.now();
    runStudioPerfCalibrationRounds(referenceRounds);
    const referenceMs = performance.now() - referenceStarted;
    const workStarted = performance.now();
    workload();
    const workMs = performance.now() - workStarted;
    taken.push({ referenceMs, workMs });
  }
  return reduceStudioPerfCalibrationSamples(taken);
}

export interface StudioCalibratedDetectionVerdict {
  readonly label: string;
  /** True when a `factor`x slowdown of this workload would have tripped the gate. */
  readonly detected: boolean;
  readonly factor: number;
  /** Smallest slowdown the best-calibrated pass would have convicted. */
  readonly detectableFactor: number;
  readonly passes: readonly StudioPerfCalibrationPass[];
  readonly detail: string;
}

export interface StudioCalibratedDetectionOptions extends StudioCalibratedBudgetOptions {
  /** Regression multiple that must remain detectable. */
  readonly factor: number;
  /** Passes already measured for this workload — reused before any new measuring happens. */
  readonly seed?: readonly StudioPerfCalibrationPass[];
}

/**
 * The gate's mirror image, and the reason the calibrated form cannot decay into a friendlier
 * no-op: it asserts that a `factor`x regression of this very workload, on this very machine,
 * would still be convicted.
 *
 * Where a violation must be earned by EVERY pass (so the gate takes the minimum ratio), a
 * *failure to detect* must be earned the same way — so this takes the MAXIMUM. A pass whose
 * reference window happened to be starved harder than its workload window understates the
 * machine and therefore understates detection power; another pass is measured rather than
 * letting that one reading condemn the calibration. Passes already measured by
 * `evaluateStudioCalibratedBudget` are reused via `seed`, so the ordinary case — a healthy
 * reading that already proves detection — measures nothing at all.
 */
export function evaluateStudioCalibratedDetection(
  options: StudioCalibratedDetectionOptions,
): StudioCalibratedDetectionVerdict {
  const {
    label,
    workload,
    referenceRounds,
    factor,
    seed = [],
    maxRatio = STUDIO_PERF_CALIBRATION_MAX_GROWTH,
    samples = 5,
    warmups = 2,
    passes = STUDIO_PERF_CALIBRATION_CONFIRMATION_PASSES,
  } = options;
  if (!(factor > 1) || !Number.isFinite(factor)) {
    throw new Error(`A detection factor must be greater than 1, got ${factor}.`);
  }

  const recorded: StudioPerfCalibrationPass[] = [...seed];
  const best = (): number => Math.max(...recorded.map((pass) => pass.ratio));
  const detected = (): boolean => best() * factor > maxRatio;

  let warmed = false;
  for (let pass = recorded.length; pass < passes && !detected(); pass += 1) {
    if (!warmed) {
      warmStudioPerfCalibration(workload, referenceRounds, warmups);
      warmed = true;
    }
    recorded.push(measureStudioPerfCalibrationPass(workload, referenceRounds, samples));
  }
  if (recorded.length === 0) {
    throw new Error(`No calibration passes recorded for ${label}.`);
  }

  const detectableFactor = maxRatio / best();
  return {
    label,
    detected: detected(),
    factor,
    detectableFactor,
    passes: recorded,
    detail:
      `${label}: a ${factor.toFixed(2)}x regression ${detected() ? "is" : "is NOT"} detectable `
      + `here — the gate (${maxRatio.toFixed(2)}x) starts convicting at `
      + `${detectableFactor.toFixed(2)}x. Passes: `
      + recorded
        .map((pass) => `${pass.ratio.toFixed(3)} (${pass.workMs.toFixed(1)}ms work / `
          + `${pass.referenceMs.toFixed(1)}ms reference, ${pass.sampleCount} samples)`)
        .join("; ")
      + ".",
  };
}
