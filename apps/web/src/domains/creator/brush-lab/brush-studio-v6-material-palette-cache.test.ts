import { describe, expect, it, vi } from "vitest";

import { BrushStudioV6MaterialPaletteCache } from "./brush-studio-v6-material-palette-cache";
import { createBrushStudioV6PigmentPalette } from "./brush-studio-v6-pigment-provider";

describe("bounded material pigment palettes", () => {
  it("builds one immutable provider palette and reuses it without changing values", () => {
    const create = vi.fn(createBrushStudioV6PigmentPalette);
    const cache = new BrushStudioV6MaterialPaletteCache(create);
    const first = cache.get("#aa3300", "#0033aa", "spectral-wgm-v1");
    for (let index = 0; index < 1000; index++) {
      expect(cache.get("#aa3300", "#0033aa", "spectral-wgm-v1")).toBe(first);
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual(createBrushStudioV6PigmentPalette(
      "#aa3300",
      "#0033aa",
      "spectral-wgm-v1",
    ));
    expect(cache.statistics()).toEqual({ entries: 1, hits: 1000, misses: 1 });
    expect(cache.get("#aa3300", "#0033aa", "rgb-linear-v1")).not.toEqual(first);
    expect(cache.get("#aa3300", "#0033aa", "mixbox-js-v2")).not.toEqual(first);
  });

  it("evicts least-recently-used palettes instead of retaining arbitrary colors", () => {
    const cache = new BrushStudioV6MaterialPaletteCache(
      createBrushStudioV6PigmentPalette,
    );
    const oldest = cache.get("#000000", "#ffffff", "mixbox-js-v2");
    for (let index = 1; index < 32; index++) {
      cache.get(
        `#${index.toString(16).padStart(6, "0")}`,
        "#ffffff",
        "mixbox-js-v2",
      );
    }
    expect(cache.get("#000000", "#ffffff", "mixbox-js-v2")).toBe(oldest);
    cache.get("#ff0000", "#ffffff", "mixbox-js-v2");
    expect(cache.statistics().entries).toBe(32);
    const misses = cache.statistics().misses;
    cache.get("#000001", "#ffffff", "mixbox-js-v2");
    expect(cache.statistics().misses).toBe(misses + 1);
  });
});
