/**
 * Wall-clock gates for the impasto relief shader, kept in their own FILE on purpose.
 *
 * `studio-impasto-relief-shading-v1.test.ts` installs `vi.spyOn` on 24 `Math` members to take an
 * exact transcendental census. Restoring those spies does not restore the shader: measured in a
 * single process, the emboss path costs 33.1ms per 30 passes before the census runs and 154.5ms
 * after it — a 4.7x deoptimisation that survives `mockRestore` — while the ggx path is barely
 * touched. A ratio between the two paths in that process measures the spies, not the shader.
 *
 * That file already notes the half of this it knew about ("a spied call is not the call the
 * budget measures") and keeps the census on a small tile in its own test. The other half is that
 * TIMING cannot share a process with it at all. Vitest isolates modules per file, so a separate
 * file is the enforcement — an ordering convention inside one file would be silently breakable by
 * anyone adding a test above these.
 */

import { describe, expect, it } from "vitest";

import { computeStudioImpastoReliefShading } from "./studio-impasto-relief-shading-v1";
import { studioOssUnitHash } from "./studio-oss-brush-kernels";

describe("studio impasto relief shading v1 — wall-clock gates", () => {
  /**
   * A catastrophic-blowup smoke bound, and deliberately nothing tighter.
   *
   * The old assertion was `elapsedMs < (process.env.CI ? 80 : 40)`, and it failed on a 4-vCPU
   * container at 58.6ms under load — with nothing regressed. Two measurements explain it and
   * rule out the obvious fixes:
   *
   *  - The shader costs 34.5ms idle on Node 22 and 18.8ms on Node 24. The `CI ? 80 : 40` split
   *    was not compensating for a busy runner at all; it was compensating for CI running Node 24
   *    (see `engines.node`) while a dev container may run something older. A 40ms bound with 16%
   *    idle headroom cannot survive four competing vitest workers.
   *  - Converting it to a calibrated ratio against `studio-perf-calibration.ts` does NOT work
   *    here, and that is measured, not assumed: against a fixed 2744 reference rounds the ratio
   *    read 0.97-1.04 on Node 22 and 0.505-0.518 on Node 24. A 2x baseline spread admits no gate
   *    at all — avoiding false failures needs one above 1.04, catching a doubling needs one below
   *    1.02. This is the same instruction-mix trap the paper-height sampler hit, and for the same
   *    reason: this loop is transcendental-heavy scalar compute, which the reference kernel does
   *    not track across V8 versions.
   *
   * A frozen copy would close that gap, as it did for the paper sampler, but not here: the
   * per-pixel body recomputes `halfLength`, `halfX/Y/Z`, `lDotH` and `schlickFresnel` on every one
   * of 262,144 pixels and every one of those is loop-invariant. That hoist is an obvious pending
   * optimization, and a frozen copy carrying the un-hoisted version would demand a re-freeze the
   * moment anyone takes it.
   *
   * So the absolute clock keeps only the job it can still do honestly — catching an
   * order-of-magnitude blowup such as an accidental per-pixel allocation or a quadratic tap loop.
   *
   * The census above cannot carry the rest on its own, and it is worth being exact about the gap:
   * it counts transcendentals, and deliberately not the shader's arithmetic shape, so a per-pixel
   * body that got slower WITHOUT a new `Math` call — repeated height taps, extra normal
   * arithmetic, a branch, a helper that stopped inlining — leaves every count green and the
   * output identical. That is what the second gate below is for.
   */
  it("relief-shades a 512×512 tile without catastrophic blowup", () => {
    const width = 512;
    const height = 512;
    const heights = new Float32Array(width * height);
    for (let index = 0; index < heights.length; index += 1) {
      heights[index] = studioOssUnitHash(0x7a11, index);
    }
    const into = new Float32Array(width * height);
    // Warm-up pass lets the JIT settle before the measurement.
    computeStudioImpastoReliefShading(heights, { width, height, into });
    // Noise is additive, so the cheapest of three passes is the honest estimate.
    let elapsedMs = Number.POSITIVE_INFINITY;
    for (let pass = 0; pass < 3; pass += 1) {
      const startedAt = performance.now();
      computeStudioImpastoReliefShading(heights, { width, height, into });
      elapsedMs = Math.min(elapsedMs, performance.now() - startedAt);
    }
    // ~10x the slowest honest reading recorded (34.5ms idle on Node 22, 58.6ms under a
    // 250%-oversubscribed box). One gate everywhere: no process.env.CI branch.
    expect(elapsedMs).toBeLessThan(400);
  });

  /**
   * The ggx body graded against the SAME SHADER in its cheap mode, on the SAME TILE.
   *
   * The census in the sibling file counts transcendentals and the bound above catches a blowup;
   * between them, a per-pixel body that got slower without a new `Math` call slips through —
   * extra normal arithmetic, a branch, a helper that stopped inlining. Output and counts are
   * identical, and 100-300ms clears 400.
   *
   * `emboss-2tap` runs the same shader over the same buffer and never enters `shadeNormal`, so it
   * is the same code on the same machine minus the body under test. A synthetic kernel could not
   * do this — measured at 0.97-1.04 on Node 22 against 0.505-0.518 on Node 24 — but a sibling
   * mode does not have to model the instruction mix, because it IS the instruction mix.
   *
   * It has to be matched in SHAPE as well as duration, and that took three failed attempts.
   *
   *  1. Raw, emboss costs 1.1ms against ggx's 38.9 and the ratio swung 7.0-35.0: a
   *     sub-millisecond denominator is mostly whatever the scheduler did to it.
   *  2. Batching emboss 30x to ~33ms fixed the duration but left ONE 39ms window facing THIRTY
   *     1.1ms ones. A single long window absorbs more preemption than thirty short ones, so
   *     under load that form read 1.5222 where it had recorded 1.1408-1.1774.
   *  3. Shrinking the ggx tile to 88x88 made both sides ~1.1ms per call, thirty each,
   *     interleaved. Idle that reads a tight 1.03-1.05 — and under six spinning hogs on four
   *     cores it reads 0.19-0.22, in three runs out of three. The tiles were the problem: a
   *     512x512 pass walks 2MB and an 88x88 pass walks 31KB, so every time the scheduler
   *     migrates the process the big side refills a working set the small side never lost. A
   *     ratio that drops 5x under load is not a gate; at 0.2 against a 1.35 ceiling it would
   *     acquit a quintupled ggx body.
   *
   * What holds is ONE tile for both modes and one timed window per mode per cycle: 512x512
   * throughout, a cycle being one timed ggx call (~35ms) beside one timed run of thirty emboss
   * calls (~33ms). Equal pixel counts per call, equal window durations, equal window counts, and
   * the two alternate so a contended stretch lands on both. Measured medians: 1.142-1.152 idle
   * and 1.118-1.193 under six spinning hogs on four cores.
   *
   * TWO THINGS THIS STILL DOES NOT COVER, stated so the gate is not mistaken for more.
   *
   * The shared per-pixel walk does not cancel, and equal tiles alone cannot make it. The ggx
   * window runs the walk once and the emboss window runs it thirty times, so a regression in the
   * walk itself lands ~30x harder on the denominator and moves this ratio DOWN — the acquitting
   * direction. That asymmetry is not removable here: the two bodies differ ~30x in cost, so
   * equal pixel counts per WINDOW and equal window DURATIONS are mutually exclusive, and giving
   * up matched durations is failure mode 2 above. The 400ms bound stands behind the walk.
   *
   * The obvious answer — a floor as well as a ceiling, since a walk regression pushes the ratio
   * down — does not survive measurement. The emboss path bimodally lands in a slow tier for a
   * WHOLE process under contention: 634-977ms per window against the usual 99-215ms, ggx
   * untouched, in 3 of 23 loaded runs (and it is the same effect that made form 3 unusable, at 3
   * of 3). More warmup does not fix it — 360 emboss calls before the first measured sample
   * changed nothing — because what is starved is the optimizer, not the call count. Any floor
   * loose enough to survive a 5x denominator collapse is too loose to catch a walk regression,
   * so this gate stays one-sided and the collapse is left where it does no harm: it lowers the
   * ratio, so it can only make this gate permissive, never falsely red.
   */
  it("keeps the ggx body's cost pinned against the same shader's cheap mode", () => {
    const WIDTH = 512;
    const HEIGHT = 512;
    // One cycle: a single ggx call beside a batch of emboss calls sized to match its duration.
    const EMBOSS_CALLS_PER_CYCLE = 30;
    const CYCLES_PER_SAMPLE = 3;
    const WARMUP_SAMPLES = 5;
    const SAMPLES = 5;
    // Recorded MEDIAN-of-5: 1.147 / 1.142 / 1.152 idle, and 1.143 / 1.191 / 1.120 / 1.154 /
    // 1.160 / 1.154 / 1.193 / 1.185 / 1.163 / 1.118 / 1.123 under six spinning hogs on four
    // cores. 1.6 carries 34% headroom over the worst of those, while a doubled ggx body reads
    // 2.24-2.39 and is convicted with at least 40% margin.
    const MAX_RATIO = 1.6;

    const heights = new Float32Array(WIDTH * HEIGHT);
    for (let index = 0; index < heights.length; index += 1) {
      heights[index] = studioOssUnitHash(0x7a11, index);
    }
    // Separate outputs, one shared input: the shader then sees a single buffer shape, which is
    // what kept the tier collapse above down to 3 runs in 23 rather than 3 in 3.
    const ggxInto = new Float32Array(WIDTH * HEIGHT);
    const embossInto = new Float32Array(WIDTH * HEIGHT);

    const takeSample = (): { ggxMs: number; embossMs: number } => {
      let ggxMs = 0;
      let embossMs = 0;
      for (let cycle = 0; cycle < CYCLES_PER_SAMPLE; cycle += 1) {
        const ggxStartedAt = performance.now();
        computeStudioImpastoReliefShading(heights, {
          width: WIDTH,
          height: HEIGHT,
          into: ggxInto,
          quality: "ggx",
        });
        ggxMs += performance.now() - ggxStartedAt;

        const embossStartedAt = performance.now();
        for (let call = 0; call < EMBOSS_CALLS_PER_CYCLE; call += 1) {
          computeStudioImpastoReliefShading(heights, {
            width: WIDTH,
            height: HEIGHT,
            into: embossInto,
            quality: "emboss-2tap",
          });
        }
        embossMs += performance.now() - embossStartedAt;
      }
      return { ggxMs, embossMs };
    };

    for (let warmup = 0; warmup < WARMUP_SAMPLES; warmup += 1) takeSample();
    const taken: { ggxMs: number; embossMs: number; ratio: number }[] = [];
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const pair = takeSample();
      taken.push({ ...pair, ratio: pair.ggxMs / pair.embossMs });
    }

    // The MEDIAN of the five ratios, not the minimum, for the same reason the chunk-cost gate in
    // studio-live-dynamic-brush-overlay.test.ts takes a median: the quantity is already a ratio of
    // two independently timed windows, so its noise is TWO-SIDED. A pause inside the emboss
    // window alone inflates the denominator and lowers that sample's ratio, and a minimum then
    // selects that outlier on purpose — with ~33ms baselines, a doubled 66ms ggx body would be
    // acquitted by a 17ms emboss-only pause (66 / 50 = 1.32). The minimum is the honest reducer
    // for a COST, where noise is one-sided; it is the wrong one for a quotient.
    const sorted = [...taken].sort((left, right) => left.ratio - right.ratio);
    const middle = sorted[Math.floor(sorted.length / 2)]!;

    expect(middle.embossMs).toBeGreaterThan(1);
    expect(
      middle.ratio,
      `ggx ${middle.ggxMs.toFixed(1)}ms against emboss ${middle.embossMs.toFixed(1)}ms `
      + `over ${CYCLES_PER_SAMPLE} cycles = ${middle.ratio.toFixed(4)} `
      + `(all: ${sorted.map((entry) => entry.ratio.toFixed(4)).join(", ")})`,
    ).toBeLessThan(MAX_RATIO);
  });

  /**
   * The gate above, driven with its own recorded readings instead of a live clock.
   *
   * A live self-check cannot state the sensitivity claim: doubling the ggx body for real needs a
   * second shader, and asserting on freshly measured numbers under load re-measures the machine
   * rather than the rule. These are the medians the gate actually recorded.
   */
  it("is not loose enough to acquit a doubled ggx body", () => {
    const MAX_RATIO = 1.6;
    const HONEST_MEDIANS = [
      1.147, 1.142, 1.152,
      1.143, 1.191, 1.120, 1.154, 1.160, 1.154, 1.193, 1.185, 1.163, 1.118, 1.123,
    ] as const;

    // Every honest reading is acquitted, idle and heavily contended alike.
    expect(Math.max(...HONEST_MEDIANS)).toBeLessThan(MAX_RATIO);
    // ...and every one of them is convicted once the ggx body costs twice as much, which is the
    // point of the gate. The emboss denominator does not move: the doubling is in `shadeNormal`,
    // which `emboss-2tap` never enters.
    expect(Math.min(...HONEST_MEDIANS.map((ratio) => ratio * 2))).toBeGreaterThan(MAX_RATIO);
    // The margin is real on both sides rather than the budget sitting on top of one of them.
    expect(MAX_RATIO / Math.max(...HONEST_MEDIANS)).toBeGreaterThan(1.3);
    expect(Math.min(...HONEST_MEDIANS.map((ratio) => ratio * 2)) / MAX_RATIO).toBeGreaterThan(1.35);
    // The smallest regression still convicted, so the gate is not only a doubling detector.
    expect(MAX_RATIO / Math.max(...HONEST_MEDIANS)).toBeLessThan(1.45);
  });
});
