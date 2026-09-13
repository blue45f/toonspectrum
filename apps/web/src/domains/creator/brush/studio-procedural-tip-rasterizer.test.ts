import { describe, expect, it } from "vitest";

import {
  rasterizeStudioProceduralTip,
  StudioProceduralTipCache,
  studioMaterialIdentitySeed,
} from "./studio-procedural-tip-rasterizer";

describe("area-integrated procedural R8 compiler", () => {
  it.each([0, -1, 1.5, 65, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid size %s", (size) => {
    expect(() => rasterizeStudioProceduralTip(size, () => 1)).toThrow(RangeError);
  });

  it("bounds invalid coverage and integrates constant fields exactly", () => {
    expect([...rasterizeStudioProceduralTip(2, () => 0.5, 4)]).toEqual([128, 128, 128, 128]);
    expect([...rasterizeStudioProceduralTip(2, () => Number.NaN)]).toEqual([0, 0, 0, 0]);
    expect([...rasterizeStudioProceduralTip(1, () => 20)]).toEqual([255]);
    expect([...rasterizeStudioProceduralTip(1, () => -20)]).toEqual([0]);
  });

  it("retains a subpixel filament that centre sampling misses", () => {
    const field = (x: number): number => Math.abs(x - 0.078125) < 0.016 ? 1 : 0;
    const point = rasterizeStudioProceduralTip(8, field, 1);
    const area = rasterizeStudioProceduralTip(8, field, 4);
    expect(point.reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(area.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
    expect(area.some((value) => value > 0 && value < 255)).toBe(true);
    expect(rasterizeStudioProceduralTip(8, field, 4)).toEqual(area);
  });

  it("rejects invalid budgets, caches by resolution and evicts by least recent use", () => {
    expect(() => new StudioProceduralTipCache(-1)).toThrow(RangeError);
    expect(() => new StudioProceduralTipCache(16 * 1024 * 1024 + 1)).toThrow(RangeError);
    const cache = new StudioProceduralTipCache(8);
    const a = cache.get("a", 2, () => 1);
    cache.get("b", 2, () => 0.5);
    a.fill(0);
    expect([...cache.get("a", 2, () => 0)]).toEqual([255, 255, 255, 255]);
    cache.get("c", 2, () => 0.25);
    expect(cache.stats()).toEqual({ entries: 2, bytes: 8, hits: 1, misses: 3 });
    cache.get("b", 2, () => 0.5);
    expect(cache.stats().misses).toBe(4);
    cache.get("a", 1, () => 1, 4);
    expect(cache.stats().bytes).toBeLessThanOrEqual(8);
    expect(() => cache.get("", 1, () => 1)).toThrow(RangeError);
    cache.clear();
    expect(cache.stats()).toEqual({ entries: 0, bytes: 0, hits: 0, misses: 0 });
  });

  it("supports zero retention and never retains an oversized allocation", () => {
    const disabled = new StudioProceduralTipCache(0);
    disabled.get("a", 64, () => 1);
    disabled.get("a", 64, () => 1);
    expect(disabled.stats()).toEqual({ entries: 0, bytes: 0, hits: 0, misses: 2 });
    const small = new StudioProceduralTipCache(8);
    small.get("large", 64, () => 1);
    expect(small.stats().bytes).toBe(0);
  });

  it("separates sample grids and derives seeds from identity, not catalogue position", () => {
    const cache = new StudioProceduralTipCache(64);
    cache.get("shared", 2, () => 1, 1);
    cache.get("shared", 2, () => 0, 4);
    expect(cache.stats().entries).toBe(2);
    const ids = ["material-fern-frond", "material-chalk-fracture", "material-mica-flakes"];
    const seeds = new Map(ids.map((id) => [id, studioMaterialIdentitySeed(id)]));
    for (const id of [...ids].reverse()) expect(studioMaterialIdentitySeed(id)).toBe(seeds.get(id));
    expect(new Set(seeds.values()).size).toBe(ids.length);
  });
});
