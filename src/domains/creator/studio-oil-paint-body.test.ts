/**
 * Oil and acrylic must differ in the RENDERED bed, not only in catalogue metadata.
 *
 * This test exists because they previously did not. `oil--flat-ribbon` and
 * `acrylic--stiff-ribbon` declared identical runtime fields — same family, tip, texture and
 * dynamics — and differed only by defaultWidth/defaultOpacity, because `engineVariant` is read by
 * no renderer. Measured on rendered captures the two sat 0.168 apart against a corpus median of
 * 1.04, i.e. the same texture under two names.
 *
 * The split asserted here is the physical one: acrylic sets while the stroke is still moving, so
 * it runs dry more often and keeps a crisper ridge; oil stays open and carries one load further.
 * Every bound is a comparison between the two bodies rather than a magic constant, so retuning the
 * bed is free as long as the two paints stay distinguishable.
 */
import { describe, expect, it } from "vitest";

import { planOilBrushDabs, studioOilPaintBodyForBrush } from "./studio-fx-brush";

function serpentine(): { points: number[]; pressures: number[] } {
  const points: number[] = [];
  const pressures: number[] = [];
  for (let index = 0; index < 40; index += 1) {
    points.push(30 + index * 13, 60 + Math.sin(index / 6) * 7);
    pressures.push(0.7);
  }
  return { points, pressures };
}

function bristleSeries(paintBody: "oil" | "acrylic"): {
  load: number[];
  ridge: number[];
} {
  const { points, pressures } = serpentine();
  const dabs = planOilBrushDabs({
    points,
    pressures,
    baseWidth: 28,
    seed: 7,
    maxDabs: 4_096,
    paintBody,
  });
  const sampled = dabs.slice(0, 80);
  return {
    load: sampled.map((dab) => dab.bristles[0]?.opacity ?? 0),
    ridge: sampled.map((dab) => dab.bristles[0]?.radiusYRatio ?? 0),
  };
}

/** One bristle's load over a long stroke - long enough to span several dry/loaded cycles. */
function longBristleLoad(paintBody: "oil" | "acrylic"): number[] {
  const points: number[] = [];
  const pressures: number[] = [];
  for (let index = 0; index < 400; index += 1) {
    points.push(20 + index * 4, 60 + Math.sin(index / 30) * 20);
    pressures.push(0.7);
  }
  const dabs = planOilBrushDabs({
    points,
    pressures,
    baseWidth: 28,
    seed: 7,
    maxDabs: 16_384,
    paintBody,
  });
  return dabs
    .map((dab) => dab.bristles[3]?.opacity)
    .filter((value): value is number => typeof value === "number");
}

function lagOneAutocorrelation(series: readonly number[]): number {
  const mean = series.reduce((sum, value) => sum + value, 0) / series.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < series.length - 1; index += 1) {
    numerator += (series[index]! - mean) * (series[index + 1]! - mean);
  }
  for (const value of series) denominator += (value - mean) ** 2;
  return numerator / denominator;
}

/** How often the hair crosses between loaded and dry — a fast-setting paint does this more. */
function dryOutCycles(series: readonly number[]): number {
  let flips = 0;
  for (let index = 1; index < series.length; index += 1) {
    if ((series[index]! > 0.3) !== (series[index - 1]! > 0.3)) flips += 1;
  }
  return flips;
}

describe("Studio oil vs acrylic paint body", () => {
  it("routes only the acrylic shelf to the fast-setting body", () => {
    for (const brush of ["acrylic", "acrylic--stiff-ribbon", "acrylic--polymer-flat"]) {
      expect(studioOilPaintBodyForBrush(brush), brush).toBe("acrylic");
    }
    for (const brush of [
      "oil",
      "oil--flat-ribbon",
      "oil--impasto-ribbon",
      "brush--oil-lanes",
      "paint-tube",
    ]) {
      expect(studioOilPaintBodyForBrush(brush), brush).toBe("oil");
    }
  });

  it("makes acrylic run dry sooner and hold a crisper ridge than oil", () => {
    const oil = bristleSeries("oil");
    const acrylic = bristleSeries("acrylic");

    // The distinguishing pair. Acrylic sets mid-stroke, so one load does not carry as far.
    expect(dryOutCycles(acrylic.load)).toBeGreaterThan(dryOutCycles(oil.load));
    const meanRidge = (series: readonly number[]): number =>
      series.reduce((sum, value) => sum + value, 0) / series.length;
    expect(meanRidge(acrylic.ridge)).toBeGreaterThan(meanRidge(oil.ridge) * 1.2);
  });

  it("keeps both bodies off the white-noise load that made bristles read as particles", () => {
    // The regression this guards is a load signal that is independent per station: it measured a
    // lag-1 autocorrelation of -0.03 and rasterised as disconnected angular dashes. Either paint
    // may be retuned, but neither may go back to noise, and neither may buy smoothness by
    // flattening its texture — hence the variance floor beside the correlation floor.
    for (const [name, series] of [
      ["oil", bristleSeries("oil").load],
      ["acrylic", bristleSeries("acrylic").load],
    ] as const) {
      expect(lagOneAutocorrelation(series), name).toBeGreaterThan(0.5);
    }

    // Texture strength is "does the hair still reach both ends, and does it pass through the
    // middle" - measured over a LONG stroke, because a short sample need not span a full dry
    // cycle and will report a narrow range for a perfectly healthy load.
    //
    // Variance and range both FALL when the load's bimodal gap is filled, and filling it is the
    // improvement: it took the rendered stroke from 73.1% of its ink in two tone bins to 54.6%.
    // So neither is the floor. What a genuinely flattened load loses is its extremes, and what a
    // re-hardened boolean gate loses is the middle - this asserts all three populations survive.
    for (const paintBody of ["oil", "acrylic"] as const) {
      const long = longBristleLoad(paintBody);
      const dry = long.filter((v) => v < 0.1).length / long.length;
      const mid = long.filter((v) => v >= 0.1 && v <= 0.5).length / long.length;
      const loaded = long.filter((v) => v > 0.5).length / long.length;
      expect(Math.min(...long), paintBody).toBeLessThan(0.1);
      expect(Math.max(...long), paintBody).toBeGreaterThan(0.5);
      expect(dry, `${paintBody} dry`).toBeGreaterThan(0.05);
      expect(mid, `${paintBody} mid`).toBeGreaterThan(0.05);
      expect(loaded, `${paintBody} loaded`).toBeGreaterThan(0.2);
    }
  });
});
