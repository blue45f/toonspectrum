import { describe, expect, it } from "vitest";

import { BRUSH_STUDIO_V6_RECIPE_SEEDS } from "../brush-lab/brush-studio-v6-recipe-catalog";
import { isStudioBrushEngineProgramWireValue } from "../../../shared/lib/studio-brush-material-program-contract";
import {
  STUDIO_BRUSH_LIBRARY_COUNTS,
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_LIBRARY_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS,
  filterStudioBrushCatalogItems,
} from "./studio-brush-catalog";
import { createStudioBuiltInBrushDefaultRestoreProfile } from "./studio-brush-default-restore";
import { DEFAULT_STUDIO_BRUSH_SNAPSHOT } from "./studio-brush-library";
import {
  materializeStudioBrushCatalogSelection,
} from "./studio-brush-selection";
import { studioBrushCatalogSelectionSnapshot } from "./studio-brush-selection-snapshot";
import {
  STUDIO_V6_BRUSH_CATALOG_COUNT,
  STUDIO_V6_BRUSH_CATALOG_ITEMS,
} from "./studio-brush-v6-catalog";

const expectedV6RecipeCount = BRUSH_STUDIO_V6_RECIPE_SEEDS.length;

describe("Studio V6 complete brush library integration", () => {
  it("places every V6 recipe in the artist-facing complete library", () => {
    expect(STUDIO_V6_BRUSH_CATALOG_COUNT).toBe(expectedV6RecipeCount);
    expect(STUDIO_V6_BRUSH_CATALOG_COUNT).toBeGreaterThanOrEqual(50);
    expect(STUDIO_BRUSH_LIBRARY_COUNTS.v6).toBe(expectedV6RecipeCount);
    expect(STUDIO_BRUSH_LIBRARY_COUNTS.total).toBe(
      STUDIO_BRUSH_LIBRARY_COUNTS.classic + expectedV6RecipeCount,
    );
    expect(STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_LIBRARY_COUNTS.paint,
    );
    expect(STUDIO_LIBRARY_ERASER_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_LIBRARY_COUNTS.erase,
    );
    expect(new Set(STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.map(({ id }) => id))).toHaveProperty(
      "size",
      STUDIO_BRUSH_LIBRARY_COUNTS.total,
    );
    const v6Start = STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.length;
    expect(STUDIO_LIBRARY_ALL_BRUSH_CATALOG_ITEMS.slice(
      v6Start,
      v6Start + expectedV6RecipeCount,
    )).toEqual(STUDIO_V6_BRUSH_CATALOG_ITEMS);
  });

  it("exposes a dedicated next-generation lane and global search aliases", () => {
    expect(filterStudioBrushCatalogItems({
      operation: "paint",
      category: "nextgen",
      includeV6: true,
    })).toEqual(STUDIO_V6_BRUSH_CATALOG_ITEMS);
    const searched = filterStudioBrushCatalogItems({
      operation: "paint",
      query: "차세대",
      includeV6: true,
    });
    expect(searched).toHaveLength(expectedV6RecipeCount);
    expect(searched.every(({ id }) => id.startsWith("v6:"))).toBe(true);
    for (const provider of ["Krita", "Hokusai", "Mixbox", "WebGPU", "libmypaint"]) {
      expect(filterStudioBrushCatalogItems({
        operation: "paint",
        query: provider,
        includeV6: true,
      }).some(({ id }) => id.startsWith("v6:")), provider).toBe(true);
    }
  });

  it("materializes all V6 rows with exact no-fallback provider receipts", async () => {
    for (const item of STUDIO_V6_BRUSH_CATALOG_ITEMS) {
      const selection = await materializeStudioBrushCatalogSelection(item.id);
      expect(selection, item.id).not.toBeNull();
      expect(selection?.catalogId).toBe(item.id);
      expect(selection?.runtimeBrushId).toBe("brush");
      expect(selection?.enginePrograms?.material?.version).toBe(2);
      expect(selection?.enginePrograms?.material?.runtime?.fallbackPolicy).toBe("none");
      expect(selection?.enginePrograms?.material?.runtime?.bindings.length).toBeGreaterThan(0);
      expect(isStudioBrushEngineProgramWireValue(selection?.enginePrograms)).toBe(true);
      expect(await materializeStudioBrushCatalogSelection(item.id)).toBe(selection);
    }
  });

  it("preserves the physical program through apply and default restore", async () => {
    const item = STUDIO_V6_BRUSH_CATALOG_ITEMS[0];
    expect(item).toBeDefined();
    const selection = await materializeStudioBrushCatalogSelection(item?.id);
    expect(selection).not.toBeNull();
    if (!selection) return;
    const applied = {
      brushId: selection.runtimeBrushId,
      strokeWidth: selection.defaultWidth,
      brushOpacity: selection.defaultOpacity,
      color: selection.defaultColor ?? DEFAULT_STUDIO_BRUSH_SNAPSHOT.color,
    };
    const snapshot = studioBrushCatalogSelectionSnapshot(
      DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      selection,
      applied,
    );
    expect(snapshot.sourcePresetId).toBe(selection.catalogId);
    expect(snapshot.enginePrograms).toEqual(selection.enginePrograms);
    expect(createStudioBuiltInBrushDefaultRestoreProfile(selection).values.enginePrograms)
      .toEqual(selection.enginePrograms);
  });
});
