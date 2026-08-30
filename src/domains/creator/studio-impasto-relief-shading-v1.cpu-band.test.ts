/**
 * The ggx body and the shared pixel walk, in their own FILE and in that order.
 *
 * This gate measures `emboss-2tap` to completion BEFORE `ggx` is called anywhere, because calling
 * both in one process deoptimises the emboss path — 3.4x its honest cost in 1 of 5 loaded runs
 * when the two are interleaved, and 2.8x when the sibling `.perf.test.ts` merely runs its 512x512
 * ggx blow-up bound first, which drops this ratio from ~20.5 to 6.58 and fails it on unregressed
 * code. Run alone, emboss never collapsed in four loaded runs, so the trigger is the shared entry
 * point going polymorphic rather than contention.
 *
 * That ordering has to hold for the whole PROCESS, not just within a test, so it cannot be a
 * convention inside a file someone may add a ggx-using test to. Vitest isolates modules per file;
 * this file is the enforcement, and nothing here may call `ggx` before the emboss phase below.
 */
import { describe, expect, it } from "vitest";

import { computeStudioImpastoReliefShading } from "./studio-impasto-relief-shading-v1";
import { studioOssUnitHash } from "./studio-oss-brush-kernels";

describe("studio impasto relief shading v1 — body vs shared walk", () => {
  /**
   * The ggx body and the SHARED PIXEL WALK, both graded against the same shader's cheap mode, in
   * CPU milliseconds, on the same tile, in separate phases.
   *
   * Three things had to change together to make this work, and each was forced by a measurement.
   *
   * CPU, NOT WALL. Wall time here is a reading of the scheduler: the previous form of this gate
   * read 1.118-1.193 under six spinning hogs on four cores and 0.19-0.22 when the two modes ran
   * on different tile sizes, because a 512x512 pass walks 2MB and an 88x88 pass walks 31KB, so
   * every migration made the big side refill a working set the small side never lost.
   * `process.cpuUsage()` removes the scheduler outright, the same fix the crayon-family budget
   * needed. Measured, it collapses the whole spread to 2.6%.
   *
   * EQUAL PIXEL COUNTS, per call and normalised per call in the quotient. That is what lets this
   * see the shared walk at all. The old form ran thirty emboss calls against one ggx call to
   * match window durations, so the walk ran thirty times in the denominator and once in the
   * numerator and a walk regression moved the ratio in the ACQUITTING direction. Matching
   * durations is no longer needed, precisely because CPU time does not care how long a window is
   * open — which is what buys the freedom to match pixels instead.
   *
   * PHASED, NOT INTERLEAVED, and this is the subtle one. Calling both modes in one process
   * deoptimises `emboss-2tap`: measured at 3.4x its honest cost in 1 of 5 loaded runs
   * interleaved, and in 3 of 23 with the wall-clock form. Run alone it never collapsed in four
   * loaded runs, so the trigger is the shared entry point going polymorphic, not contention.
   * Measuring the emboss phase to completion BEFORE ggx is ever called removes it: 20.285-20.824
   * across two idle and five loaded runs, no collapse. Interleaving was only ever there to share
   * scheduler noise between the windows, and CPU time makes that unnecessary too.
   *
   * WHAT THE BAND MEANS. The ceiling catches a regression in the ggx body, which is the
   * transcendental-heavy half the census in the sibling file counts but does not cost. The FLOOR
   * catches a regression in the per-pixel walk shared by both modes — extra arithmetic or a
   * branch, which moves neither the transcendental census nor the height-tap census, and which
   * costs the cheap mode proportionally far more than the expensive one. Between the two censuses
   * and this band, what is left uncovered is work that adds no `Math` call, no height read, and
   * no measurable CPU.
   */
  it("keeps the ggx body and the shared pixel walk pinned against the shader's cheap mode", () => {
    const WIDTH = 512;
    const HEIGHT = 512;
    const EMBOSS_WARMUP_CALLS = 16;
    const EMBOSS_CALLS_PER_SAMPLE = 8;
    const GGX_WARMUP_CALLS = 4;
    const GGX_CALLS_PER_SAMPLE = 4;
    const SAMPLES = 5;
    // Recorded cheapest-of-5 per-call quotients across twelve runs, idle and under six spinning
    // hogs on four cores, alone and beside sibling suites: 20.225 / 20.368 / 20.485 / 20.488 /
    // 20.495 / 20.520 / 20.525 / 20.577 / 20.617 / 20.666 / 20.817 / 22.644. The emboss floor
    // itself is 2.84-3.10ms per call and the ggx floor 57.75-64.56ms.
    //
    // The reducer matters here and was measured, not assumed: taking the MEDIAN of each phase
    // instead read 15.604 once in roughly fifteen runs, because emboss occasionally spends a
    // whole phase ~1.3x slow. A minimum survives that — one clean sample in five is enough — and
    // that is what a cost's one-sided noise entitles it to.
    //
    // The ceiling sits 33% above the worst of those; a doubled ggx body reads ~41.5 and is
    // convicted with 38% margin. The floor sits 26% below the cheapest; the emboss body costs
    // 2.86ms per call against ggx's 59.4ms, so `(59.4 + s) / (2.86 + s) < 16` needs only
    // s = 0.91ms of shared per-pixel work — a 32% increase in the walk — and a doubling of the
    // walk reads 10.8. The band is deliberately wider than this machine's population on both
    // sides: a ratio between two DIFFERENT instruction mixes is the one quantity in this file
    // that can genuinely differ across CPUs, and gates in this repository have already been reset
    // twice for trusting a single machine's spread.
    const MIN_RATIO = 16;
    const MAX_RATIO = 30;

    const heights = new Float32Array(WIDTH * HEIGHT);
    for (let index = 0; index < heights.length; index += 1) {
      heights[index] = studioOssUnitHash(0x7a11, index);
    }
    const embossInto = new Float32Array(WIDTH * HEIGHT);
    const ggxInto = new Float32Array(WIDTH * HEIGHT);

    const cpuMs = (run: () => void): number => {
      const before = process.cpuUsage();
      run();
      const after = process.cpuUsage(before);
      return (after.user + after.system) / 1_000;
    };
    const emboss = () => {
      computeStudioImpastoReliefShading(heights, {
        width: WIDTH,
        height: HEIGHT,
        into: embossInto,
        quality: "emboss-2tap",
      });
    };
    const ggx = () => {
      computeStudioImpastoReliefShading(heights, {
        width: WIDTH,
        height: HEIGHT,
        into: ggxInto,
        quality: "ggx",
      });
    };
    // The CHEAPEST sample of each phase, not the median. Each side is a COST in CPU
    // milliseconds, and the noise on a cost is one-sided — contention, cache pressure and a
    // half-warm tier only ever ADD — so the cheapest reading is the honest estimate of each. The
    // quotient of two honest floors is the honest quotient; a median would carry each side's
    // noise into it. (This is the same reason the crayon-family CPU budget and the tick-slice
    // floor take minima, and the opposite of what a ratio of two INDEPENDENTLY timed windows
    // needs, which is why the chunk gates next door take medians.)
    const cheapestOf = (values: readonly number[]): number => Math.min(...values);

    // Phase one: emboss, to completion, before `ggx` has ever been called in this process.
    for (let warmup = 0; warmup < EMBOSS_WARMUP_CALLS; warmup += 1) emboss();
    const embossPerCall: number[] = [];
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      embossPerCall.push(
        cpuMs(() => {
          for (let call = 0; call < EMBOSS_CALLS_PER_SAMPLE; call += 1) emboss();
        }) / EMBOSS_CALLS_PER_SAMPLE,
      );
    }

    // Phase two: ggx. Whatever this does to the emboss path is now behind the measurement.
    for (let warmup = 0; warmup < GGX_WARMUP_CALLS; warmup += 1) ggx();
    const ggxPerCall: number[] = [];
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      ggxPerCall.push(
        cpuMs(() => {
          for (let call = 0; call < GGX_CALLS_PER_SAMPLE; call += 1) ggx();
        }) / GGX_CALLS_PER_SAMPLE,
      );
    }

    const embossMs = cheapestOf(embossPerCall);
    const ggxMs = cheapestOf(ggxPerCall);
    expect(embossMs).toBeGreaterThan(0);
    const ratio = ggxMs / embossMs;
    const detail = `ggx ${ggxMs.toFixed(2)}ms/call against emboss ${embossMs.toFixed(2)}ms/call `
      + `over ${WIDTH}x${HEIGHT} = ${ratio.toFixed(3)}`;

    // Above the ceiling: the ggx body got more expensive.
    expect(ratio, detail).toBeLessThan(MAX_RATIO);
    // Below the floor: the walk both modes share got more expensive, which costs the cheap mode
    // proportionally far more. This is the direction the previous form could not see at all.
    expect(ratio, detail).toBeGreaterThan(MIN_RATIO);
  });

  /**
   * The band above, driven with its own recorded readings instead of a live clock.
   *
   * Neither regression can be injected without a second shader, and asserting on freshly measured
   * numbers would re-measure the machine rather than the rule.
   */
  it("is not loose enough to acquit either a doubled ggx body or a grown pixel walk", () => {
    const MIN_RATIO = 16;
    const MAX_RATIO = 30;
    const HONEST = [
      20.225, 20.368, 20.485, 20.488, 20.495, 20.520,
      20.525, 20.577, 20.617, 20.666, 20.817, 22.644,
    ] as const;
    // Per-call CPU costs the band was recorded from.
    const GGX_MS = 59.4;
    const EMBOSS_MS = 2.86;

    // Every honest reading is acquitted, idle and heavily contended alike.
    expect(Math.max(...HONEST)).toBeLessThan(MAX_RATIO);
    expect(Math.min(...HONEST)).toBeGreaterThan(MIN_RATIO);
    // ...with real margin on both sides rather than the band resting on one of them.
    expect(MAX_RATIO / Math.max(...HONEST)).toBeGreaterThan(1.3);
    expect(Math.min(...HONEST) / MIN_RATIO).toBeGreaterThan(1.2);

    // A doubled ggx body: emboss never enters `shadeNormal`, so the denominator does not move.
    expect((GGX_MS * 2) / EMBOSS_MS).toBeGreaterThan(MAX_RATIO);
    expect((GGX_MS * 2) / EMBOSS_MS / MAX_RATIO).toBeGreaterThan(1.35);

    // Shared per-pixel work, which lands on BOTH modes and so moves the ratio down. A doubling of
    // the walk is convicted overwhelmingly; the smallest increase still caught is ~32%.
    const withSharedWork = (addedMs: number) => (GGX_MS + addedMs) / (EMBOSS_MS + addedMs);
    expect(withSharedWork(EMBOSS_MS)).toBeLessThan(MIN_RATIO);
    expect(withSharedWork(EMBOSS_MS)).toBeLessThan(11);
    expect(withSharedWork(0.91)).toBeLessThan(MIN_RATIO);
    expect(withSharedWork(0.8)).toBeGreaterThan(MIN_RATIO);
    // ...and the direction is the point: shared work moves this DOWN, which is why the old
    // thirty-emboss-calls-to-one-ggx-call form acquitted it. Under that form the same regression
    // moved the ratio the other way entirely.
    expect(withSharedWork(EMBOSS_MS)).toBeLessThan(Math.min(...HONEST));

    // A machine that runs everything 3.4x slower changes nothing.
    expect((GGX_MS * 3.4) / (EMBOSS_MS * 3.4)).toBeCloseTo(GGX_MS / EMBOSS_MS, 6);
  });
});
