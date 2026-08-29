/**
 * Machine-speed calibration for the brush suite's wall-clock budgets.
 *
 * The perf budgets in this directory were recorded as absolute milliseconds on one machine, which
 * makes them assertions about the *runner* as much as about the code. Measured on a cloud dev
 * container at the merge-base commit, three of them failed while GitHub Actions stayed green:
 * the impasto scribble plan at 78.5ms against a 60ms budget, the 1e6-sample paper sampler at
 * 241.7ms against 200ms, and the 2000-station impasto plan at 32.5ms against 30ms. Nothing had
 * regressed; the machine was slower. The cost is not a red test — it is that `pnpm test` cannot be
 * run to completion off CI, so real failures hide behind the noise.
 *
 * Taking the minimum of several samples, which all three already did, does not fix this. Minima
 * cancel *preemption* (noise is additive, so the cheapest run is the honest one) but they cannot
 * cancel a machine that is simply slower at every sample: the floor itself moves.
 *
 * So the budget stops being a millisecond count and becomes a RATIO. A fixed calibration workload
 * runs in the same process, at the same moment, under the same load, and the recorded budget is
 * scaled by how much slower this machine is than the machine the budget was recorded on:
 *
 *     slowdown         = calibrationMs / REFERENCE_CALIBRATION_MS
 *     effectiveBudget  = recordedBudgetMs * slowdown
 *
 * This is the same move `detectStudioBrushSoakMonotonicDegradation` made in the perf matrix, for
 * the same reason: stop comparing raw numbers, and make the measurement earn its baseline. There
 * the baseline was the series' own first half; here it is a workload whose cost is known.
 *
 * Detection power is preserved because the calibration workload is INDEPENDENT of the code under
 * test. A regression in ribbon planning or paper sampling does not make `Math.sqrt` slower, so the
 * numerator doubles while the denominator does not and the ratio doubles with it. That is pinned
 * by synthetic-regression tests, not asserted here.
 *
 * Two deliberate asymmetries:
 *
 *   - There is NO lower clamp. A machine faster than the reference gets a proportionally *tighter*
 *     budget, which is what makes this stronger than the `process.env.CI ? loose : strict` branches
 *     it replaces — those handed the busiest machines the loosest gate, exactly backwards.
 *   - There IS an upper clamp. Past `MAX_SLOWDOWN` the calibration is no longer measuring machine
 *     speed but something pathological, and an unbounded scale factor would quietly turn every
 *     budget in this directory into a no-op. Beyond the clamp the gate stays where the clamp puts
 *     it and fails rather than dissolving.
 */

/**
 * Cost of one `studioPerfCalibrationWorkload()` pass, in milliseconds, on the machine the budgets
 * in this directory are recorded against.
 *
 * Recorded on the cloud dev container described above: min-of-7, three independent rounds, 2.3116
 * / 2.3108 / 2.2994ms — a spread of 0.5%, which is what makes it usable as a denominator at all.
 * Re-record this together with every budget that references it; a reference drifting alone
 * silently rescales all of them.
 */
export const STUDIO_PERF_CALIBRATION_REFERENCE_MS = 2.3;

/**
 * Largest slowdown the calibration is allowed to certify. A machine reading slower than this is
 * not "slow", it is starved or mismeasured, and scaling a budget by an unbounded factor is how a
 * perf gate becomes decoration.
 */
export const STUDIO_PERF_CALIBRATION_MAX_SLOWDOWN = 4;

/** Samples per calibration measurement. Minimum-of-N, for the additive-noise reason above. */
const STUDIO_PERF_CALIBRATION_SAMPLES = 5;

/**
 * The calibration workload: dense float math over a small resident buffer.
 *
 * Chosen to share a profile with what the budgets guard — transcendental and square-root math over
 * packed coordinate runs — so that a machine slow at one is slow at the other, while sharing no
 * code with any of it. It must stay cheap (~2ms) because it runs at every budget check, and it
 * must not be eliminable, which is why the accumulator is returned.
 */
export function studioPerfCalibrationWorkload(): number {
  const scratch = new Float64Array(1024);
  let accumulator = 0;
  for (let pass = 0; pass < 64; pass += 1) {
    for (let index = 0; index < 1024; index += 1) {
      const t = (index + pass) * 0.013;
      scratch[index] = Math.sqrt(t * t + 1) + Math.sin(t) * Math.cos(t * 0.5);
    }
    for (let index = 1; index < 1024; index += 1) {
      const delta = scratch[index] - scratch[index - 1];
      accumulator += Math.abs(delta) + Math.atan2(delta, 0.5);
    }
  }
  return accumulator;
}

/**
 * Measures this machine's calibration cost, now.
 *
 * Deliberately NOT memoized across calls. The dominant source of error is not the machine's
 * nominal speed but the load on it, and under `pnpm test` that load is other worker processes: the
 * 2000-station plan measures 20.7ms alone on the reference container and 32.5ms inside the full
 * suite. A calibration cached from an idle moment would certify the wrong denominator for a budget
 * checked in a busy one. At ~2.3ms x 5 samples this is affordable per assertion.
 */
export function measureStudioPerfCalibrationMs(): number {
  studioPerfCalibrationWorkload();
  let best = Number.POSITIVE_INFINITY;
  for (let sample = 0; sample < STUDIO_PERF_CALIBRATION_SAMPLES; sample += 1) {
    const startedAt = performance.now();
    studioPerfCalibrationWorkload();
    best = Math.min(best, performance.now() - startedAt);
  }
  return best;
}

/**
 * Scales a recorded budget to this machine — pure, so the scaling rule is unit-testable against
 * recorded calibration costs and synthetic regressions instead of only through a live measurement.
 *
 * A calibration that did not measure (zero, negative, non-finite) yields the recorded budget
 * unscaled rather than an infinite one: an unmeasurable machine gets the strict gate, not none.
 */
export function studioCalibratedBudgetMs(
  recordedBudgetMs: number,
  calibrationMs: number,
  referenceMs: number = STUDIO_PERF_CALIBRATION_REFERENCE_MS,
): number {
  if (!Number.isFinite(calibrationMs) || calibrationMs <= 0) return recordedBudgetMs;
  if (!Number.isFinite(referenceMs) || referenceMs <= 0) return recordedBudgetMs;
  const slowdown = Math.min(
    calibrationMs / referenceMs,
    STUDIO_PERF_CALIBRATION_MAX_SLOWDOWN,
  );
  return recordedBudgetMs * slowdown;
}

/** Convenience for the assertion site: measures this machine and scales `recordedBudgetMs`. */
export function studioPerfBudgetMs(recordedBudgetMs: number): number {
  return studioCalibratedBudgetMs(recordedBudgetMs, measureStudioPerfCalibrationMs());
}
