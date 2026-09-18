import { describe, expect, it } from "vitest";

import {
  STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS,
  studioBrushCatalogItemById,
} from "./studio-brush-catalog";
import {
  listStudioBrushEngineFamilyOptions,
  studioBrushProductProfile,
  studioBrushProductProfileSearchTerms,
} from "./studio-brush-product-profile";

function profile(catalogId: string) {
  const item = studioBrushCatalogItemById(catalogId);
  if (!item) throw new Error(`Missing brush fixture: ${catalogId}`);
  return studioBrushProductProfile(item);
}

describe("studio brush product profiles", () => {
  it("describes the real V6 engine chain instead of a generic generation badge", () => {
    const result = profile("v6:salt-crystal-watercolor");

    expect(result.engineFamilyLabel).toContain("Hokusai");
    expect(result.engineStages.map((stage) => stage.id)).toEqual(
      expect.arrayContaining([
        "carrier-hokusai-dabs",
        "tip-grain-exemplar",
        "physics-inkwash",
        "physics-reaction",
      ]),
    );
    expect(result.traits).toEqual(
      expect.arrayContaining(["습식 번짐", "고과립", "반응·결정"]),
    );
    expect(result.size).toMatchObject({
      sourceWidth: 34,
      defaultWidth: 30,
      normalized: true,
    });
  });

  it("keeps classic brushes grounded in their runtime contract", () => {
    const result = profile("pen");

    expect(result.engineStages.map((stage) => stage.role)).toEqual(
      expect.arrayContaining(["carrier", "tip", "surface", "motion"]),
    );
    expect(result.engineSummary).toContain("원형");
    expect(result.traits).toContain("필압 추종");
  });

  it("searches by engine provider, stage and material behavior", () => {
    const item = studioBrushCatalogItemById("v6:linen-dry-bristle");
    if (!item) throw new Error("Missing showcase brush");
    const terms = studioBrushProductProfileSearchTerms(item).join(" ");

    expect(terms).toContain("Krita");
    expect(terms).toContain("Bristle Dynamics");
    expect(terms).toContain("개별 강모");
    expect(terms).toContain("리넨 결");
  });

  it("builds non-empty engine-family filters from the selectable shelf", () => {
    const options = listStudioBrushEngineFamilyOptions(
      STUDIO_LIBRARY_PAINT_BRUSH_CATALOG_ITEMS,
    );

    expect(options.length).toBeGreaterThan(8);
    expect(options.some((option) => option.label.includes("Perfect Freehand"))).toBe(true);
    expect(options.some((option) => option.label.includes("Hokusai"))).toBe(true);
    expect(options.every((option) => option.count > 0)).toBe(true);
  });
});
