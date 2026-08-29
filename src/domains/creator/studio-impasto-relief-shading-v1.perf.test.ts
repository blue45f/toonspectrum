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
   * The ggx body graded against the SAME SHADER in its cheap mode, which is the one denominator
   * here that co-scales by construction.
   *
   * The census in the sibling file counts transcendentals and the bound above catches a blowup;
   * between them, a per-pixel body that got slower without a new `Math` call slips through —
   * extra height taps, more normal arithmetic, a branch, a helper that stopped inlining. Output
   * and counts are identical, and 100-300ms clears 400.
   *
   * `emboss-2tap` runs the same shader over the same buffer and never enters `shadeNormal`, so it
   * is the same code on the same machine minus the body under test. A synthetic kernel could not
   * do this — measured at 0.97-1.04 on Node 22 against 0.505-0.518 on Node 24 — but a sibling
   * mode does not have to model the instruction mix, because it IS the instruction mix.
   *
   * It has to be matched in SHAPE as well as duration, and that took two failed attempts to
   * learn. Raw, emboss costs 1.1ms against ggx's 38.9 and the ratio swung 7.0-35.0, because a
   * sub-millisecond denominator is mostly whatever the scheduler did to it. Batching emboss 30x
   * to ~33ms fixed the duration but left one 39ms window facing thirty 1.1ms ones — and a single
   * long window absorbs more preemption than thirty short ones, so under six spinning hogs plus
   * five parallel suites that form read 1.5222 where it had recorded 1.1408-1.1774.
   *
   * Matching both is what holds: ggx on an 88x88 tile costs ~1.1ms, the same as emboss on
   * 512x512, so the two run call-for-call, thirty each, interleaved over one span with identical
   * shape. The ratio is then a comparison of the two bodies and not of two window geometries.
   *
   * What this does NOT cover, stated so it is not mistaken for more: the two tiles differ, so
   * this measures per-call body cost rather than per-pixel cost, and a regression in the pixel
   * walk itself moves both sides. The blowup bound above stands behind that.
   */
  it("keeps the ggx body's cost pinned against the same shader's cheap mode", () => {
    const GGX_WIDTH = 88;
    const GGX_HEIGHT = 88;
    const EMBOSS_WIDTH = 512;
    const EMBOSS_HEIGHT = 512;
    const CALLS_PER_SAMPLE = 30;
    const SAMPLES = 5;
    // Recorded min-of-5 at 1.0247 / 1.0325 / 1.0476 idle and 0.8931 / 0.9025 / 1.0472 under six
    // spinning hogs on four cores with five other suites in parallel workers — the load that broke
    // both earlier forms. 1.35 carries 29% headroom over the worst of those, while a doubled ggx
    // body reads 1.79-2.10 and is convicted with at least 32% margin.
    const MAX_RATIO = 1.35;

    const fill = (length: number): Float32Array => {
      const heights = new Float32Array(length);
      for (let index = 0; index < length; index += 1) {
        heights[index] = studioOssUnitHash(0x7a11, index);
      }
      return heights;
    };
    const ggxHeights = fill(GGX_WIDTH * GGX_HEIGHT);
    const ggxInto = new Float32Array(GGX_WIDTH * GGX_HEIGHT);
    const embossHeights = fill(EMBOSS_WIDTH * EMBOSS_HEIGHT);
    const embossInto = new Float32Array(EMBOSS_WIDTH * EMBOSS_HEIGHT);

    // One interleaved sample: the two modes alternate call for call, so a contended stretch lands
    // on both rather than on whichever window happens to be open.
    const takeSample = (): { ggxMs: number; embossMs: number } => {
      let ggxMs = 0;
      let embossMs = 0;
      for (let call = 0; call < CALLS_PER_SAMPLE; call += 1) {
        const embossStartedAt = performance.now();
        computeStudioImpastoReliefShading(embossHeights, {
          width: EMBOSS_WIDTH,
          height: EMBOSS_HEIGHT,
          into: embossInto,
          quality: "emboss-2tap",
        });
        embossMs += performance.now() - embossStartedAt;
        const ggxStartedAt = performance.now();
        computeStudioImpastoReliefShading(ggxHeights, {
          width: GGX_WIDTH,
          height: GGX_HEIGHT,
          into: ggxInto,
          quality: "ggx",
        });
        ggxMs += performance.now() - ggxStartedAt;
      }
      return { ggxMs, embossMs };
    };

    takeSample();
    takeSample();
    let ratio = Number.POSITIVE_INFINITY;
    let recorded = { ggxMs: 0, embossMs: 0 };
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const taken = takeSample();
      if (taken.ggxMs / taken.embossMs < ratio) {
        ratio = taken.ggxMs / taken.embossMs;
        recorded = taken;
      }
    }

    expect(recorded.embossMs).toBeGreaterThan(1);
    expect(
      ratio,
      `ggx ${recorded.ggxMs.toFixed(1)}ms against emboss ${recorded.embossMs.toFixed(1)}ms `
      + `over ${CALLS_PER_SAMPLE} interleaved calls each = ${ratio.toFixed(4)}`,
    ).toBeLessThan(MAX_RATIO);
  });
});
