import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { loadLibMypaint } from "../../packages/studio-brush-platform/src/libmypaint/index";
import {
  GRAIN_BANDS,
  TEXTURE_LAB_BRUSHES,
  TEXTURE_LAB_ENGINES,
  loadHokusaiModule,
  measureBrushTexture,
  roundBrushRecord,
} from "../benchmarks/harness/brush-texture-lab";
import { ciede2000MaxVectorError } from "../benchmarks/harness/color-lab";

import type {
  BrushTextureRecord,
  TextureLabBrushId,
  TextureLabEngines,
} from "../benchmarks/harness/brush-texture-lab";

/**
 * Brush texture quality gate.
 *
 * The lab (tests/benchmarks/harness/brush-texture-lab.ts) measures five
 * texture axes — grain spectral density, edge quality, dab-overlap ripple,
 * pressure response linearity and colour mixing — for the libmypaint reference
 * and the hokusai challenger over the `.myb` corpus. Every formula lives in
 * that file's header and is echoed into `definitions` in the results JSON.
 *
 * This gate does three things:
 *  1. re-renders both engines through the PACKAGE loader (`loadLibMypaint`)
 *     and re-derives every number, so the harness's own tsx-only wasm binding
 *     cannot drift from the shipped one without failing here;
 *  2. pins pixel identity (per-lane frame sha256) and every metric against the
 *     committed measurement;
 *  3. holds each texture axis inside a regression band derived from that
 *     measurement — [min/2, max·2] across the two engines, i.e. 2× headroom,
 *     clamped to 1 for [0,1] metrics. No band value is invented; each is
 *     quoted from tests/benchmarks/results/brush-texture-lab.json below.
 *
 * Regenerate with: pnpm exec tsx tests/benchmarks/harness/brush-texture-lab.ts
 */

const REPO_ROOT = join(__dirname, "..", "..");
const RESULTS_PATH = join(
  REPO_ROOT,
  "tests",
  "benchmarks",
  "results",
  "brush-texture-lab.json",
);

interface GateBand {
  lo: number;
  hi: number;
}

interface TextureLabResults {
  measurements: Record<string, BrushTextureRecord>;
  gate: { bounds: Record<string, Record<string, GateBand>> };
}

/**
 * Regression bands, quoted from tests/benchmarks/results/brush-texture-lab.json
 * (`gate.bounds`). Each is [min/2, max·2] over the two engines' measurements;
 * the measured values that produced them are named in the comments so a future
 * reader can see exactly how much headroom each band carries.
 */
const GATE_BANDS: Record<TextureLabBrushId, Record<string, GateBand>> = {
  // wash-soft — hardness 0.34, dabs_per_actual_radius 3.4, smudge 0.22.
  "wash-soft": {
    // measured midBandRatio 0.036476 (libmypaint) / 0.036659 (hokusai)
    grainMidBandRatio: { lo: 0.018238, hi: 0.073318 },
    // measured lowBandRatio 0.962394 / 0.96224 — the wash's energy is envelope
    grainLowBandRatio: { lo: 0.48112, hi: 1 },
    // measured totalPowerExDc 1.30573701e-4 / 1.30388973e-4
    grainTotalPowerExDc: { lo: 0.000065, hi: 0.000261 },
    // measured transitionWidthPx 44.04 / 44.045 (radius 66.5 px)
    edgeTransitionWidthPx: { lo: 22.02, hi: 88.09 },
    // measured transitionWidthPerRadius 0.662256 / 0.662331
    edgeTransitionWidthPerRadius: { lo: 0.331128, hi: 1 },
    // measured aliasingIndex 0.054662 / 0.053943
    edgeAliasingIndex: { lo: 0.026972, hi: 0.109324 },
    // measured gradationDensity 0.995745 / 0.996277
    edgeGradationDensity: { lo: 0.497873, hi: 1 },
    // measured rippleCv 0.004571 / 0.004674
    rippleCv: { lo: 0.002286, hi: 0.009348 },
    // measured r2LogLinear 0.974484 / 0.970657
    pressureR2LogLinear: { lo: 0.485329, hi: 1 },
    // measured taperAsymmetry 0.404113 / 0.402687 (slow_tracking 1.8)
    pressureTaperAsymmetry: { lo: 0.201344, hi: 0.808226 },
    // measured deltaE00VsLinearMean 7.376384 / 4.454886
    mixingDeltaE00VsLinearMean: { lo: 2.227443, hi: 14.752768 },
  },
  // ink-crisp — hardness 0.92, dabs_per_actual_radius 5.5, smudge 0.
  "ink-crisp": {
    // measured midBandRatio 0.485569 on both engines
    grainMidBandRatio: { lo: 0.242785, hi: 0.971138 },
    // measured lowBandRatio 0.403405 on both engines
    grainLowBandRatio: { lo: 0.201703, hi: 0.80681 },
    // measured totalPowerExDc 2.6082497e-5 on both engines
    grainTotalPowerExDc: { lo: 0.000013, hi: 0.000052 },
    // measured transitionWidthPx 30.235 (radius 73.325 px)
    edgeTransitionWidthPx: { lo: 15.1175, hi: 60.47 },
    // measured transitionWidthPerRadius 0.412342
    edgeTransitionWidthPerRadius: { lo: 0.206171, hi: 0.824684 },
    // measured aliasingIndex 0.173572
    edgeAliasingIndex: { lo: 0.086786, hi: 0.347144 },
    // measured gradationDensity 0.782115
    edgeGradationDensity: { lo: 0.391058, hi: 1 },
    // measured rippleCv 0.0118
    rippleCv: { lo: 0.0059, hi: 0.0236 },
    // measured r2LogLinear 0.980607
    pressureR2LogLinear: { lo: 0.490304, hi: 1 },
    // measured taperAsymmetry 0.037298 (no slow_tracking on this brush)
    pressureTaperAsymmetry: { lo: 0.018649, hi: 0.074596 },
    // measured deltaE00VsLinearMean 0 — smudge 0, so the brush has no mixing model
    mixingDeltaE00VsLinearMean: { lo: 0, hi: 0 },
  },
};

function gatedValues(record: BrushTextureRecord, engine: "libmypaint" | "hokusai") {
  const value = record[engine];
  return {
    grainMidBandRatio: value.grain.midBandRatio,
    grainLowBandRatio: value.grain.lowBandRatio,
    grainTotalPowerExDc: value.grain.totalPowerExDc,
    edgeTransitionWidthPx: value.edge.transitionWidthPx,
    edgeTransitionWidthPerRadius: value.edge.transitionWidthPerRadius,
    edgeAliasingIndex: value.edge.aliasingIndex,
    edgeGradationDensity: value.edge.gradationDensity,
    rippleCv: value.ripple.rippleCv,
    pressureR2LogLinear: value.pressure.r2LogLinear,
    pressureTaperAsymmetry: value.pressure.taperAsymmetry,
    mixingDeltaE00VsLinearMean: value.mixing.deltaE00VsLinearMean,
  } satisfies Record<string, number>;
}

/**
 * Committed numbers are rounded for readability, so a re-measurement is
 * compared after the SAME rounding with a 1e-4 relative tolerance (1e-9 floor)
 * — enough to absorb a last-digit flip, far too tight to hide a pixel change.
 * Exact pixel identity is carried separately by the frame sha assertions.
 */
function expectNumbersClose(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === "number") {
    expect(typeof actual, `${path} should be a number`).toBe("number");
    const tolerance = Math.max(Math.abs(expected) * 1e-4, 1e-9);
    expect(
      Math.abs((actual as number) - expected),
      `${path}: ${String(actual)} vs committed ${expected}`,
    ).toBeLessThanOrEqual(tolerance);
    return;
  }
  if (typeof expected === "string" || typeof expected === "boolean") {
    expect(actual, path).toBe(expected);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path} should be an array`).toBe(true);
    const actualArray = actual as unknown[];
    expect(actualArray.length, `${path}.length`).toBe(expected.length);
    expected.forEach((item, index) => {
      expectNumbersClose(actualArray[index], item, `${path}[${index}]`);
    });
    return;
  }
  if (expected !== null && typeof expected === "object") {
    const actualRecord = actual as Record<string, unknown>;
    for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
      expectNumbersClose(actualRecord[key], value, `${path}.${key}`);
    }
  }
}

let committed: TextureLabResults;
const measured = new Map<TextureLabBrushId, BrushTextureRecord>();

beforeAll(async () => {
  committed = JSON.parse(await readFile(RESULTS_PATH, "utf8")) as TextureLabResults;
  const engines: TextureLabEngines = {
    libmypaint: await loadLibMypaint(),
    hokusai: await loadHokusaiModule(),
  };
  for (const id of TEXTURE_LAB_BRUSHES) {
    measured.set(id, roundBrushRecord(await measureBrushTexture(engines, id)));
  }
}, 120_000);

describe("texture lab instrumentation", () => {
  it("uses a CIEDE2000 implementation that matches the published test vectors", () => {
    // The mixing axis is only meaningful if ΔE00 itself is right; color-lab.ts
    // validates against all 34 Sharma/Wu/Dalal 2005 pairs (published to 4 dp).
    expect(ciede2000MaxVectorError()).toBeLessThan(1e-4);
  });

  it("keeps the hardcoded gate bands identical to the ones the lab derived", () => {
    for (const id of TEXTURE_LAB_BRUSHES) {
      const derived = committed.gate.bounds[id];
      expect(derived, `${id} gate bounds`).toBeDefined();
      for (const [metric, band] of Object.entries(GATE_BANDS[id])) {
        expect(derived?.[metric], `${id}.${metric}`).toEqual(band);
      }
    }
  });

  it("pins the grain band edges the ratios are defined against", () => {
    // Band edges are part of the metric definition: moving them silently would
    // change every ratio in the results file without changing a single pixel.
    expect(GRAIN_BANDS.lowMax).toBe(1 / 32);
    expect(GRAIN_BANDS.midMax).toBe(1 / 8);
  });
});

describe.each(TEXTURE_LAB_BRUSHES)("%s texture measurement", (id) => {
  it("re-renders to the committed frames on both engines", () => {
    const actual = measured.get(id);
    const expected = committed.measurements[id];
    expect(actual).toBeDefined();
    expect(expected).toBeDefined();
    if (!actual || !expected) return;
    for (const engine of TEXTURE_LAB_ENGINES) {
      expect(actual[engine].frameSha256, `${id}/${engine} frame sha`).toEqual(
        expected[engine].frameSha256,
      );
    }
  });

  it("re-derives every committed texture metric", () => {
    const actual = measured.get(id);
    const expected = committed.measurements[id];
    expect(actual).toBeDefined();
    expect(expected).toBeDefined();
    if (!actual || !expected) return;
    expectNumbersClose(actual, expected, id);
  });

  it.each(TEXTURE_LAB_ENGINES)("stays inside the %s regression bands", (engine) => {
    const actual = measured.get(id);
    expect(actual).toBeDefined();
    if (!actual) return;
    const values = gatedValues(actual, engine);
    for (const [metric, value] of Object.entries(values)) {
      const band = GATE_BANDS[id][metric];
      expect(band, `${id}.${metric} band`).toBeDefined();
      if (!band) continue;
      expect(value, `${id}/${engine}.${metric} below band`).toBeGreaterThanOrEqual(band.lo);
      expect(value, `${id}/${engine}.${metric} above band`).toBeLessThanOrEqual(band.hi);
    }
  });

  it("measures the texture lane without clipping the alpha channel", () => {
    // Every grain/edge/ripple number is read out of the interior alpha; a
    // saturated core would flatten it to a constant and quietly zero the
    // measurement instead of failing.
    const actual = measured.get(id);
    expect(actual).toBeDefined();
    if (!actual) return;
    for (const engine of TEXTURE_LAB_ENGINES) {
      expect(
        actual[engine].ripple.saturatedCentrelineFraction,
        `${id}/${engine} centreline saturation`,
      ).toBe(0);
      expect(actual[engine].edge.peakAlpha).toBeLessThan(255);
      expect(actual[engine].edge.peakAlpha).toBeGreaterThan(32);
    }
  });
});

describe("texture separation between the corpus brushes", () => {
  it("splits the two brushes by grain band profile", () => {
    // wash-soft 0.036476 vs ink-crisp 0.485569 mid-band ratio: the natural
    // media brush puts its spectral energy in the shading envelope, the crisp
    // ink brush puts nearly half of it in the dab-scale grain band.
    const wash = measured.get("wash-soft");
    const ink = measured.get("ink-crisp");
    expect(wash).toBeDefined();
    expect(ink).toBeDefined();
    if (!wash || !ink) return;
    for (const engine of TEXTURE_LAB_ENGINES) {
      expect(ink[engine].grain.midBandRatio).toBeGreaterThan(
        5 * wash[engine].grain.midBandRatio,
      );
      expect(wash[engine].grain.lowBandRatio).toBeGreaterThan(
        2 * ink[engine].grain.lowBandRatio,
      );
    }
  });

  it("splits the two brushes by relative edge transition width", () => {
    // wash-soft 0.662256 vs ink-crisp 0.412342 transition width per radius:
    // the hard brush resolves its stroke edge in a shorter fraction of the dab.
    const wash = measured.get("wash-soft");
    const ink = measured.get("ink-crisp");
    if (!wash || !ink) return;
    for (const engine of TEXTURE_LAB_ENGINES) {
      expect(ink[engine].edge.transitionWidthPerRadius).toBeLessThan(
        wash[engine].edge.transitionWidthPerRadius,
      );
      // …and pays for it with a coarser gradation (0.782115 vs 0.995745).
      expect(ink[engine].edge.gradationDensity).toBeLessThan(
        wash[engine].edge.gradationDensity,
      );
    }
  });

  it("identifies the centre-line ripple as the dab cadence on both brushes", () => {
    // ripplePeriodOverDabSpacing 1.022556 (wash-soft) / 1.000114 (ink-crisp):
    // the periodic centre-line variation IS the dab spacing, not noise.
    for (const id of TEXTURE_LAB_BRUSHES) {
      const record = measured.get(id);
      if (!record) continue;
      for (const engine of TEXTURE_LAB_ENGINES) {
        expect(
          record[engine].ripple.ripplePeriodOverDabSpacing,
          `${id}/${engine} ripple period / dab spacing`,
        ).toBeGreaterThan(0.8);
        expect(record[engine].ripple.ripplePeriodOverDabSpacing).toBeLessThan(1.25);
      }
    }
  });

  it("locates ink-crisp's grain band peak at its dab spacing", () => {
    // midBandPeakPeriodPx 12.8 vs expectedDabSpacingPx 13.3318 — the 2-D grain
    // band and the 1-D ripple agree on the same physical structure. wash-soft
    // is deliberately NOT asserted here: its grain band is weak (3.6 %) and its
    // strongest bin (28.6 px) is envelope shoulder, which is itself the finding.
    const ink = measured.get("ink-crisp");
    if (!ink) return;
    for (const engine of TEXTURE_LAB_ENGINES) {
      const grainPeak = ink[engine].grain.midBandPeakPeriodPx;
      const dabSpacing = ink[engine].ripple.expectedDabSpacingPx;
      expect(Math.abs(grainPeak / dabSpacing - 1)).toBeLessThan(0.2);
    }
  });

  it("engages a colour mixing model only on the smudge brush", () => {
    // wash-soft smudge 0.22 → ΔE00 vs the linear source-over reference is
    // 7.376384 (libmypaint) / 4.454886 (hokusai); ink-crisp smudge 0 → the
    // smudge and no-smudge frames are byte-identical.
    const wash = measured.get("wash-soft");
    const ink = measured.get("ink-crisp");
    if (!wash || !ink) return;
    for (const engine of TEXTURE_LAB_ENGINES) {
      expect(wash[engine].mixing.identicalToLinear).toBe(false);
      expect(wash[engine].mixing.deltaE00VsLinearMean).toBeGreaterThan(1);
      expect(ink[engine].mixing.identicalToLinear).toBe(true);
      expect(ink[engine].mixing.deltaE00VsLinearMean).toBe(0);
    }
  });
});

describe("libmypaint reference ↔ hokusai challenger texture agreement", () => {
  it("keeps every alpha-domain texture axis inside the committed cross-engine deltas", () => {
    // Committed crossEngine deltas — wash-soft: mid-band ratio +0.000183,
    // transition width +0.005 px, aliasing index −0.000719, ripple cv +0.000103,
    // r2LogLinear −0.003827; ink-crisp: all exactly 0 (alpha is bit-identical,
    // only the RGB readback differs). The bands below are 2× those magnitudes
    // with a floor that keeps the ink-crisp zeros meaningful.
    const tolerances = {
      grainMidBandRatioDelta: 0.001,
      grainLowBandRatioDelta: 0.001,
      transitionWidthDeltaPx: 0.02,
      aliasingIndexDelta: 0.005,
      rippleCvDelta: 0.001,
      r2LogLinearDelta: 0.01,
    } satisfies Record<string, number>;
    for (const id of TEXTURE_LAB_BRUSHES) {
      const record = measured.get(id);
      if (!record) continue;
      for (const [metric, tolerance] of Object.entries(tolerances)) {
        const delta = record.crossEngine[metric as keyof typeof tolerances];
        expect(Math.abs(delta), `${id}.${metric}`).toBeLessThanOrEqual(tolerance);
      }
    }
  });

  it("records the RGB-domain cross-engine delta as evidence only", () => {
    // The engines read back RGB in different channel spaces (libmypaint v1
    // non-linear fix15 vs hokusai linear→sRGB), so this ΔE00 is confounded by
    // construction — 18.174328 (wash-soft) / 21.384322 (ink-crisp), including
    // on ink-crisp whose ALPHA is bit-identical. It is asserted to be present
    // and non-zero, never to be small.
    for (const id of TEXTURE_LAB_BRUSHES) {
      const record = measured.get(id);
      if (!record) continue;
      expect(record.crossEngine.mixingCrossEngineDeltaE00Mean).toBeGreaterThan(0);
      expect(record.crossEngine.mixingCrossEngineDeltaE00Max).toBeGreaterThanOrEqual(
        record.crossEngine.mixingCrossEngineDeltaE00Mean,
      );
    }
  });
});
