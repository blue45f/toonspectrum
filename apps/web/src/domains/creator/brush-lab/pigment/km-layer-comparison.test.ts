import { describe, expect, it } from "vitest";
import { kmLayer, kmOver, openKmInfiniteReflectance } from "./kubelka-munk";
import { prepareKmLayerComparison } from "./km-layer-comparison";
import { prepareSyntheticPigmentLayers, simulatePigmentLayer } from "./external-pigments";

const a = { absorption: [0.04, 2, 0.2], scattering: [3, 0.3, 1] };
const b = { absorption: [2, 0.01, 0.4], scattering: [0.2, 4, 0.1] };
const paper = [0.92, 0.8, 0.7];
const close = (x: readonly number[], y: readonly number[]) => x.forEach((n, i) => expect(n).toBeCloseTo(y[i]!, 12));

describe("spectral mixture versus ordered finite layers", () => {
  it("preserves the substrate exactly when neither layer exists", () => {
    const result = prepareKmLayerComparison(a, b, paper)(0, 0);
    expect(result).toEqual({ premixed: paper, firstOnSecond: paper, secondOnFirst: paper });
  });
  it.each([[0, 0.6], [0.6, 0]])("reduces to one layer for thicknesses %s / %s", (da, db) => {
    const result = prepareKmLayerComparison(a, b, paper)(da, db);
    const pigment = da ? a : b;
    const expected = paper.map((p, i) => kmOver(kmLayer(pigment.absorption[i]!, pigment.scattering[i]!, da + db), p));
    close(result.premixed, expected); close(result.firstOnSecond, expected); close(result.secondOnFirst, expected);
  });
  it("keeps identical pigments equivalent to one layer of summed thickness", () => {
    const result = prepareKmLayerComparison(a, a, paper)(0.7, 0.3);
    close(result.firstOnSecond, result.premixed); close(result.secondOnFirst, result.premixed);
  });
  it("distinguishes premixing from the two noncommutative layer orders", () => {
    const result = prepareKmLayerComparison(a, b, paper)(0.4, 0.9);
    expect(Math.max(...result.firstOnSecond.map((r, i) => Math.abs(r - result.secondOnFirst[i]!)))).toBeGreaterThan(0.05);
    expect(Math.max(...result.premixed.map((r, i) => Math.abs(r - result.firstOnSecond[i]!)))).toBeGreaterThan(0.01);
  });
  it("is symmetric under exchanging pigment names and reversing the named layer order", () => {
    const left = prepareKmLayerComparison(a, b, paper)(0.4, 0.9);
    const right = prepareKmLayerComparison(b, a, paper)(0.9, 0.4);
    close(left.premixed, right.premixed); close(left.firstOnSecond, right.secondOnFirst); close(left.secondOnFirst, right.firstOnSecond);
  });
  it("uses each top pigment's opaque limit for optically thick layers", () => {
    const result = prepareKmLayerComparison(a, b, paper)(1e8, 1e8);
    close(result.firstOnSecond, a.absorption.map((k, i) => openKmInfiniteReflectance(k, a.scattering[i]!)));
    close(result.secondOnFirst, b.absorption.map((k, i) => openKmInfiniteReflectance(k, b.scattering[i]!)));
  });
  it("copies prepared inputs and freezes results so later edits cannot alter a recipe", () => {
    const k = [...a.absorption], s = [...a.scattering], base = [...paper];
    const evaluate = prepareKmLayerComparison({ absorption: k, scattering: s }, b, base);
    const expected = evaluate(0.4, 0.7);
    k.fill(0); s.fill(0); base.fill(0);
    expect(evaluate(0.4, 0.7)).toEqual(expected);
    expect(Object.isFrozen(expected)).toBe(true);
    for (const value of Object.values(expected)) expect(Object.isFrozen(value)).toBe(true);
  });
  it("retains passive bounds over 128 prepared multi-band recipes", () => {
    for (let n = 0; n < 128; n += 1) {
      const result = prepareKmLayerComparison(a, b, paper)(10 ** (n / 16 - 4), 10 ** (3 - n / 20));
      for (const bands of Object.values(result)) for (const r of bands) {
        expect(Number.isFinite(r)).toBe(true); expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(1);
      }
    }
  });
  it.each([NaN, Infinity, -1, 1e25])("rejects invalid layer thickness %s", (d) => {
    const evaluate = prepareKmLayerComparison(a, b, paper);
    expect(() => evaluate(d, 1)).toThrow(RangeError); expect(() => evaluate(1, d)).toThrow(RangeError);
  });
  it("rejects sparse, oversized, mismatched and non-passive spectra before rendering", () => {
    expect(() => prepareKmLayerComparison({ absorption: new Array<number>(3), scattering: [1, 1, 1] }, b, paper)).toThrow();
    expect(() => prepareKmLayerComparison({ ...a, scattering: [1] }, b, paper)).toThrow();
    expect(() => prepareKmLayerComparison(a, b, [0.5, 1.01, 1])).toThrow();
    expect(() => prepareKmLayerComparison({ absorption: [], scattering: [] }, b, paper)).toThrow();
    expect(() => prepareKmLayerComparison({ absorption: Array<number>(257).fill(1), scattering: Array<number>(257).fill(1) }, b, paper)).toThrow();
    expect(() => prepareKmLayerComparison(a, b, paper)(1e24, 1e24)).toThrow();
  });
});

describe("synthetic optical authoring comparison", () => {
  it("retains exact RGB substrate identity for empty layers", () => {
    expect(prepareSyntheticPigmentLayers("#002185", "#fcd200", "#ABCDEF")(0, 0)).toEqual({ premixed: "#abcdef", firstOnSecond: "#abcdef", secondOnFirst: "#abcdef" });
  });
  it("matches the existing one-pigment optical probe for the same pigment", () => {
    const result = prepareSyntheticPigmentLayers("#002185", "#002185", "#ffffff")(0.5, 0.5);
    const expected = simulatePigmentLayer("#002185", "#ffffff", 1);
    expect(result).toEqual({ premixed: expected, firstOnSecond: expected, secondOnFirst: expected });
  });
  it("produces distinct reproducible mixtures and layered swatches for the reference color pair", () => {
    const evaluate = prepareSyntheticPigmentLayers("#002185", "#fcd200", "#ffffff");
    const result = evaluate(0.5, 0.5);
    expect(new Set(Object.values(result)).size).toBe(3);
    for (const color of Object.values(result)) expect(color).toMatch(/^#[0-9a-f]{6}$/u);
    expect(evaluate(0.5, 0.5)).toEqual(result);
  });
});
