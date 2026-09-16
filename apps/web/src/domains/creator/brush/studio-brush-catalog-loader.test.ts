import { describe, expect, it } from "vitest";

import {
  loadStudioBrushCatalogItemById,
  loadStudioFullBrushCatalogItems,
  loadStudioListedBrushCatalogItems,
  loadStudioLibraryBrushCatalogItems,
} from "./studio-brush-catalog-loader";
import { STUDIO_BRUSH_QUALITY_PORTFOLIO } from "./studio-brush-quality-portfolio";
import { STUDIO_BRUSH_QUARANTINED_PRESET_IDS } from "./studio-brush-quarantine";
import { STUDIO_V6_BRUSH_CATALOG_COUNT } from "./studio-brush-v6-catalog";

describe("studio brush catalog loader lanes", () => {
  it("keeps quarantined ids out of the deferred LISTING lane", async () => {
    // The ledger must be non-empty for these lane tests to prove anything.
    expect(STUDIO_BRUSH_QUARANTINED_PRESET_IDS.length).toBeGreaterThan(0);

    const listed = await loadStudioListedBrushCatalogItems();
    const quarantined = new Set(STUDIO_BRUSH_QUARANTINED_PRESET_IDS);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.some((item) => quarantined.has(item.id))).toBe(false);
  });

  it("adds V6 recipes only to the artist-facing library lane", async () => {
    const [classic, library] = await Promise.all([
      loadStudioListedBrushCatalogItems(),
      loadStudioLibraryBrushCatalogItems(),
    ]);
    expect(classic.some(({ id }) => id.startsWith("v6:"))).toBe(false);
    expect(library.filter(({ id }) => id.startsWith("v6:"))).toHaveLength(
      STUDIO_V6_BRUSH_CATALOG_COUNT,
    );
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

  it("keeps the audited quality portfolio first and reuses original registry objects", async () => {
    const [full, listed] = await Promise.all([
      loadStudioFullBrushCatalogItems(),
      loadStudioListedBrushCatalogItems(),
    ]);
    const qualityIds = STUDIO_BRUSH_QUALITY_PORTFOLIO.map(({ id }) => id);
    const quarantined = new Set(STUDIO_BRUSH_QUARANTINED_PRESET_IDS);
    const expectedListedIds = full
      .filter((item) => !quarantined.has(item.id))
      .map((item) => item.id);

    expect(listed.slice(0, qualityIds.length).map((item) => item.id)).toEqual(qualityIds);
    expect(new Set(listed.map((item) => item.id))).toEqual(new Set(expectedListedIds));
    expect(listed).toHaveLength(expectedListedIds.length);
    for (const item of listed) {
      expect(full.find((candidate) => candidate.id === item.id), item.id).toBe(item);
    }
  });

  it("lists and resolves every safe engine or procedural identity while quarantine stays replay-only", async () => {
    const [full, listed] = await Promise.all([
      loadStudioFullBrushCatalogItems(),
      loadStudioListedBrushCatalogItems(),
    ]);
    const quarantined = new Set(STUDIO_BRUSH_QUARANTINED_PRESET_IDS);
    const qualityIds = new Set<string>(STUDIO_BRUSH_QUALITY_PORTFOLIO.map(({ id }) => id));
    const extended = full.filter((item) => !quarantined.has(item.id) && !qualityIds.has(item.id));

    expect(extended.length).toBeGreaterThan(0);
    for (const item of extended) {
      expect(listed.some((candidate) => candidate.id === item.id), item.id).toBe(true);
      expect(await loadStudioBrushCatalogItemById(item.id), `${item.id}: saved identity lost`).toBe(item);
    }
  });

});
