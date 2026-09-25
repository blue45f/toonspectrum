import { describe, expect, it } from "vitest";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_BRUSH_LISTED_CATALOG_COUNTS,
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_EXTENDED_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS,
} from "./studio-brush-catalog";
import { STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS } from "./studio-brush-quality-portfolio";
import { isStudioBrushQuarantinedPresetId } from "./studio-brush-quarantine";

describe("Studio brush product evidence contract", () => {
  it("keeps the audited 95-brush portfolio first while exposing the complete safe catalogue", () => {
    expect(STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS).toHaveLength(95);
    expect(
      STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS
        .slice(0, STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS.length)
        .map((item) => item.id),
    ).toEqual(STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS);
    expect(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_LISTED_CATALOG_COUNTS.total,
    );
    expect(STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_LISTED_CATALOG_COUNTS.paint,
    );
    expect(STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS.map((item) => item.id)).toEqual([
      "standard-eraser",
      "kneaded-eraser",
    ]);
    expect(STUDIO_LISTED_EXTENDED_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_LISTED_CATALOG_COUNTS.total
        - STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.length,
    );
  });

  it("lists every and only non-quarantined registered identity without duplicates", () => {
    const expectedListedIds = new Set(
      STUDIO_ALL_BRUSH_CATALOG_ITEMS
        .filter((item) => !isStudioBrushQuarantinedPresetId(item.id))
        .map((item) => item.id),
    );
    const listedIds = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id);

    expect(new Set(listedIds)).toEqual(expectedListedIds);
    expect(new Set(listedIds).size).toBe(listedIds.length);
    expect(
      STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.every(
        (item) => !isStudioBrushQuarantinedPresetId(item.id),
      ),
    ).toBe(true);
    expect(
      STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.every((item) =>
        STUDIO_ALL_BRUSH_CATALOG_ITEMS.includes(item),
      ),
    ).toBe(true);
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS.length).toBeGreaterThan(
      STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length,
    );
  });
});
