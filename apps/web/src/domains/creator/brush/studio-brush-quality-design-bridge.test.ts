import { describe, expect, it } from "vitest";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_BRUSH_CATALOG_COUNTS,
  filterStudioBrushCatalogItems,
} from "./studio-brush-catalog";
import {
  STUDIO_BRUSH_QUALITY_DESIGN_COUNT,
  auditStudioBrushQualityDesignBridge,
  projectStudioBrushQualityDesigns,
  studioBrushQualityDesignProductId,
} from "./studio-brush-quality-design-bridge";
import {
  STUDIO_BRUSH_QUALITY_DESIGNS,
  studioBrushQualityDesignGroups,
} from "./studio-brush-quality-design-catalog";

describe("Studio brush quality-design product bridge", () => {
  it("keeps one canonical 72-design taxonomy with complete product targets", () => {
    expect(STUDIO_BRUSH_QUALITY_DESIGNS).toHaveLength(
      STUDIO_BRUSH_QUALITY_DESIGN_COUNT,
    );
    expect(new Set(STUDIO_BRUSH_QUALITY_DESIGNS.map((design) => design.id)).size)
      .toBe(STUDIO_BRUSH_QUALITY_DESIGN_COUNT);
    expect(studioBrushQualityDesignGroups()).toHaveLength(6);
    expect(auditStudioBrushQualityDesignBridge(STUDIO_ALL_BRUSH_CATALOG_ITEMS))
      .toEqual([]);
    expect(projectStudioBrushQualityDesigns(STUDIO_ALL_BRUSH_CATALOG_ITEMS))
      .toHaveLength(STUDIO_BRUSH_QUALITY_DESIGN_COUNT);
  });

  it("adds discovery vocabulary without inventing new persisted catalogue ids", () => {
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_CATALOG_COUNTS.total,
    );
    expect(new Set(STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id)).size)
      .toBe(STUDIO_ALL_BRUSH_CATALOG_ITEMS.length);

    for (const design of STUDIO_BRUSH_QUALITY_DESIGNS) {
      const productCatalogId = studioBrushQualityDesignProductId(design.id);
      expect(productCatalogId, design.id).not.toBeNull();
      const product = STUDIO_ALL_BRUSH_CATALOG_ITEMS.find(
        (item) => item.id === productCatalogId,
      );
      expect(product, `${design.id} product target`).toBeDefined();
      expect(product?.searchAliases, `${design.id} aliases`).toEqual(
        expect.arrayContaining([
          design.id,
          design.name,
          design.group,
          design.signature,
          design.engine,
        ]),
      );

      for (const query of [design.id, design.name]) {
        const results = filterStudioBrushCatalogItems({
          operation: "paint",
          query,
        });
        expect(
          results.some((item) => item.id === productCatalogId),
          `${design.id} should resolve from query ${query}`,
        ).toBe(true);
      }
    }
  });
});
