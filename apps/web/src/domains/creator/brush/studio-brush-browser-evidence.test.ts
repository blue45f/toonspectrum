import { describe, expect, it } from "vitest";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS,
} from "./studio-brush-catalog";
import { isStudioBrushQuarantinedPresetId } from "./studio-brush-quarantine";

describe("Studio brush product evidence contract", () => {
  it("treats the live browser matrix as evidence for the 48-product catalogue", () => {
    expect(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS).toBe(
      STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
    );
    expect(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(48);
    expect(STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS).toHaveLength(46);
    expect(
      STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS.map((item) => item.id),
    ).toEqual(["standard-eraser", "kneaded-eraser"]);
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
  });

  it("does not use the historical pre-launch browser receipt as catalogue authority", () => {
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS.length).toBeGreaterThan(
      STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length,
    );
    expect(
      new Set(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id)).size,
    ).toBe(STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length);
  });
});
