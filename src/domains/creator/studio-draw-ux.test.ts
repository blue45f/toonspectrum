import { describe, expect, it } from "vitest";

import { STUDIO_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import {
  adjustStudioBrushOpacity,
  adjustStudioBrushSize,
  filterStudioBrushLibraryItems,
  studioBrushPresetById,
  studioBrushSizeStep,
  STUDIO_BRUSH_SIZE_RANGE,
} from "./studio-draw-ux";

describe("studio-draw-ux", () => {
  it("nudges brush size with coarse-when-large steps and clamps", () => {
    expect(adjustStudioBrushSize(6, studioBrushSizeStep(6, 1))).toBe(7);
    expect(adjustStudioBrushSize(40, studioBrushSizeStep(40, 1))).toBe(44);
    expect(adjustStudioBrushSize(1, -5)).toBe(STUDIO_BRUSH_SIZE_RANGE.min);
    expect(adjustStudioBrushSize(90, 10)).toBe(STUDIO_BRUSH_SIZE_RANGE.max);
  });

  it("adjusts opacity in percent-safe steps", () => {
    expect(adjustStudioBrushOpacity(0.5, 0.1)).toBe(0.6);
    expect(adjustStudioBrushOpacity(0.05, -0.1)).toBe(0.05);
    expect(adjustStudioBrushOpacity(0.98, 0.1)).toBe(1);
  });

  it("filters library by favorites, recent, and search", () => {
    const fav = filterStudioBrushLibraryItems({
      category: "favorites",
      favoriteIds: ["neon", "missing", "pen"],
    });
    expect(fav.map((i) => i.id)).toEqual(["neon", "pen"]);

    const recent = filterStudioBrushLibraryItems({
      category: "recent",
      recentIds: ["glow", "pen"],
    });
    expect(recent.map((i) => i.id)).toEqual(["glow", "pen"]);

    const searched = filterStudioBrushLibraryItems({
      category: "all",
      query: "글리터",
    });
    expect(searched.some((i) => i.id === "glitter")).toBe(true);
  });

  it("filters the injected 155-brush catalog without losing Pro favorites, recents, or search", () => {
    const pro = filterStudioBrushLibraryItems({
      category: "pro",
      catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,
    });
    expect(pro).toHaveLength(120);
    expect(new Set(pro.map((item) => item.id))).toHaveProperty("size", 120);

    const favorites = filterStudioBrushLibraryItems({
      category: "favorites",
      favoriteIds: ["heart-stamp", "neon", "missing", "checker-grid"],
      catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,
    });
    expect(favorites.map((item) => item.id)).toEqual([
      "heart-stamp",
      "neon",
      "checker-grid",
    ]);

    const recent = filterStudioBrushLibraryItems({
      category: "recent",
      recentIds: ["hair-fiber", "pen", "footstep-stamp", "hair-fiber"],
      catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,
    });
    expect(recent.map((item) => item.id)).toEqual([
      "hair-fiber",
      "pen",
      "footstep-stamp",
      "hair-fiber",
    ]);

    const searched = filterStudioBrushLibraryItems({
      category: "all",
      query: "발자국",
      catalogItems: STUDIO_ALL_BRUSH_CATALOG_ITEMS,
    });
    expect(searched.map((item) => item.id)).toEqual(["footstep-stamp"]);
  });

  it("resolves preset by id", () => {
    expect(studioBrushPresetById("watercolor")?.name).toContain("수채");
    expect(studioBrushPresetById("nope")).toBeNull();
  });
});
