import { describe, expect, it } from "vitest";

import {
  loadStudioBrushCatalogItemById,
  loadStudioFullBrushCatalogItems,
  loadStudioListedBrushCatalogItems,
} from "./studio-brush-catalog-loader";
import { STUDIO_BRUSH_QUALITY_PORTFOLIO } from "./studio-brush-quality-portfolio";
import { STUDIO_BRUSH_QUARANTINED_PRESET_IDS } from "./studio-brush-quarantine";

describe("studio brush catalog loader lanes", () => {
  it("keeps quarantined ids out of the deferred LISTING lane", async () => {
    // The ledger must be non-empty for these lane tests to prove anything.
    expect(STUDIO_BRUSH_QUARANTINED_PRESET_IDS.length).toBeGreaterThan(0);

    const listed = await loadStudioListedBrushCatalogItems();
    const quarantined = new Set(STUDIO_BRUSH_QUARANTINED_PRESET_IDS);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.some((item) => quarantined.has(item.id))).toBe(false);
  });

  it("keeps saved-document metadata RESOLUTION unfiltered", async () => {
    const full = await loadStudioFullBrushCatalogItems();
    for (const quarantinedId of STUDIO_BRUSH_QUARANTINED_PRESET_IDS) {
      expect(
        full.some((item) => item.id === quarantinedId),
        `${quarantinedId}: left the unfiltered SSOT lane`
      ).toBe(true);
      const resolved = await loadStudioBrushCatalogItemById(quarantinedId);
      expect(resolved?.id, `${quarantinedId}: saved-document resolution lost`).toBe(
        quarantinedId
      );
    }
  });

  it("lists the curated quality portfolio in its explicit order using original registry objects", async () => {
    const [full, listed] = await Promise.all([
      loadStudioFullBrushCatalogItems(),
      loadStudioListedBrushCatalogItems(),
    ]);
    const expected = STUDIO_BRUSH_QUALITY_PORTFOLIO.map(({ id }) => {
      const item = full.find((candidate) => candidate.id === id);
      expect(item, `${id}: portfolio entry missing from the full registry`).toBeDefined();
      return item;
    });
    expect(listed.map((item) => item.id)).toEqual(STUDIO_BRUSH_QUALITY_PORTFOLIO.map(({ id }) => id));
    expect(listed).toHaveLength(expected.length);
    // Product curation changes exposure and order, never a saved brush's registry identity.
    listed.forEach((item, index) => {
      expect(item).toBe(expected[index]);
    });
  });

  it("resolves saved non-quarantined brushes excluded by product curation without relisting them", async () => {
    const [full, listed] = await Promise.all([
      loadStudioFullBrushCatalogItems(),
      loadStudioListedBrushCatalogItems(),
    ]);
    const quarantined = new Set(STUDIO_BRUSH_QUARANTINED_PRESET_IDS);
    const portfolioIds = new Set<string>(STUDIO_BRUSH_QUALITY_PORTFOLIO.map(({ id }) => id));
    const hidden = full.filter((item) => !quarantined.has(item.id) && !portfolioIds.has(item.id));
    expect(hidden.length).toBeGreaterThan(0);
    for (const item of hidden) {
      expect(listed.some((candidate) => candidate.id === item.id), item.id).toBe(false);
      expect(await loadStudioBrushCatalogItemById(item.id), `${item.id}: saved identity lost`).toBe(item);
    }
  });

});
