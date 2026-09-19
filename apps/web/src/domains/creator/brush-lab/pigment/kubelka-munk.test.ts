import { describe, expect, it } from "vitest";

import {
  kmLayer, kmOver, kmRatioFromReflectance, kmOpaqueSpectrum, kmLayerSpectrum,
  openKmInfiniteReflectance, openKmMixCoefficients,
} from "./kubelka-munk";

describe("versioned two-flux Kubelka–Munk optics", () => {
  it.each([0, 0.1, 1])("passes substrate %s through an empty layer exactly", (paper) => {
    expect(kmOver(kmLayer(3, 7, 0), paper)).toBe(paper);
    expect(kmOver(kmLayer(0, 0, 10), paper)).toBe(paper);
  });
  it("uses analytic pure scattering and Beer–Lambert limits without epsilon pigments", () => {
    expect(kmLayer(0, 2, 0.5)).toEqual({ reflectance: 0.5, transmittance: 0.5 });
    expect(kmOver(kmLayer(0, 2, 100), 1)).toBeCloseTo(1, 13);
    expect(kmLayer(2, 0, 0.5)).toEqual({ reflectance: 0, transmittance: Math.exp(-1) });
    expect(kmOver(kmLayer(2, 0, 0.5), 0.6)).toBeCloseTo(0.6 * Math.exp(-2), 14);
  });
  it.each([0.001, 0.03, 0.2, 0.5, 0.99, 1])("round-trips opaque reflectance %s", (r) => {
    expect(openKmInfiniteReflectance(kmRatioFromReflectance(r), 1)).toBeCloseTo(r, 13);
  });
  it("matches an independent coth finite-thickness formula", () => {
    for (const [k, s, d, paper] of [[0.1, 2, 0.3, 0.8], [3, 0.5, 0.9, 0.1], [1, 4, 2, 1]]) {
      const a = (s! + k!) / s!;
      const b = Math.sqrt(a * a - 1);
      const bcoth = b / Math.tanh(b * s! * d!);
      const expected = (1 - paper! * (a - bcoth)) / (a + bcoth - paper!);
      expect(kmOver(kmLayer(k!, s!, d!), paper!)).toBeCloseTo(expected, 13);
    }
  });
  it("composes two equal-pigment layers like a single layer with their summed thickness", () => {
    for (const k of [0, 1e-9, 0.02, 5]) for (const s of [0, 0.1, 3]) {
      for (const paper of [0, 0.3, 1]) {
        const stacked = kmOver(kmLayer(k, s, 0.7), kmOver(kmLayer(k, s, 0.4), paper));
        expect(stacked).toBeCloseTo(kmOver(kmLayer(k, s, 1.1), paper), 12);
      }
    }
  });
  it("preserves passivity over 1024 logarithmically distributed coefficient cases", () => {
    let state = 731;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let i = 0; i < 1024; i += 1) {
      const k = 10 ** (next() * 18 - 9), s = 10 ** (next() * 18 - 9), d = 10 ** (next() * 18 - 9);
      const layer = kmLayer(k, s, d);
      expect(layer.reflectance).toBeGreaterThanOrEqual(0);
      expect(layer.transmittance).toBeGreaterThanOrEqual(0);
      expect(layer.reflectance + layer.transmittance).toBeLessThanOrEqual(1 + 1e-12);
      const r = kmOver(layer, next());
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
  it("approaches R-infinity for thick paint without overflowing hyperbolic functions", () => {
    const layer = kmLayer(0.13, 2.4, 1e20);
    expect(layer.transmittance).toBe(0);
    expect(layer.reflectance).toBeCloseTo(openKmInfiniteReflectance(0.13, 2.4), 14);
    expect(kmOver({ reflectance: 1, transmittance: 0 }, 1)).toBe(1);
  });
  it("mixes absorption and scattering separately, not weighted K/S ratios", () => {
    const mixture = openKmMixCoefficients([2, 0.2], [1, 4], [3, 1]);
    expect(mixture.k).toBeCloseTo(1.55, 14);
    expect(mixture.s).toBeCloseTo(1.75, 14);
    expect(mixture.k / mixture.s).not.toBeCloseTo(0.75 * 2 + 0.25 * 0.05, 3);
    expect(openKmMixCoefficients([2, 0.2], [1, 4], [30, 10])).toEqual(mixture);
  });
  it.each([NaN, Infinity, -1, 1e25])("refuses invalid optical inputs %s", (n) => {
    expect(() => kmLayer(n, 1, 1)).toThrow(RangeError);
    expect(() => kmLayer(1, n, 1)).toThrow(RangeError);
    expect(() => kmLayer(1, 1, n)).toThrow(RangeError);
  });
  it("refuses invalid grids and undefined opaque limits", () => {
    expect(() => kmRatioFromReflectance(0)).toThrow();
    expect(() => kmOver({ reflectance: 0.8, transmittance: 0.8 }, 0)).toThrow();
    expect(() => openKmInfiniteReflectance(0, 0)).toThrow();
    expect(() => openKmMixCoefficients([1], [1], [0])).toThrow();
    expect(() => openKmMixCoefficients([1], [1, 2], [1])).toThrow();
    expect(() => kmOpaqueSpectrum([1], [])).toThrow();
    expect(() => kmLayerSpectrum([1], [2], 0.2, [])).toThrow();
    expect(kmLayerSpectrum([0, 1], [1, 0], 0, [0.2, 0.7])).toEqual([0.2, 0.7]);
  });
});
