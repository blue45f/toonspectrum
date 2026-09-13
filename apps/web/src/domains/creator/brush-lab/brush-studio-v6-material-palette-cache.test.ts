import { describe, expect, it, vi } from "vitest";
import { BrushStudioV6MaterialPaletteCache } from "./brush-studio-v6-material-palette-cache";
import { mixBrushStudioV6MaterialColors } from "./brush-studio-v6-material-engine";

describe("bounded material pigment palettes", () => {
  it("computes 33 colors once and reuses the immutable result without changing values", () => {
    const mix = vi.fn(mixBrushStudioV6MaterialColors), cache = new BrushStudioV6MaterialPaletteCache(mix);
    const first = cache.get("#aa3300", "#0033aa", true);
    for (let i = 0; i < 1000; i++) expect(cache.get("#aa3300", "#0033aa", true)).toBe(first);
    expect(mix).toHaveBeenCalledTimes(33);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual(Array.from({ length: 33 }, (_, i) => mixBrushStudioV6MaterialColors("#aa3300", "#0033aa", i / 32, true)));
    expect(cache.statistics()).toEqual({ entries: 1, hits: 1000, misses: 1 });
    expect(cache.get("#aa3300", "#0033aa", false)).not.toEqual(first);
  });
  it("evicts least-recently-used entries instead of retaining arbitrary custom colors", () => {
    const cache = new BrushStudioV6MaterialPaletteCache(mixBrushStudioV6MaterialColors);
    const oldest = cache.get("#000000", "#ffffff", true);
    for (let i = 1; i < 32; i++) cache.get(`#${i.toString(16).padStart(6, "0")}`, "#ffffff", true);
    expect(cache.get("#000000", "#ffffff", true)).toBe(oldest);
    cache.get("#ff0000", "#ffffff", true);
    expect(cache.statistics().entries).toBe(32);
    const misses = cache.statistics().misses;
    cache.get("#000001", "#ffffff", true);
    expect(cache.statistics().misses).toBe(misses + 1);
  });
});
