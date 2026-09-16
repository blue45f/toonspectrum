import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "../studio-brush";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_DEFAULT_QUALITY_PAINT_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS,
  studioBrushCatalogItemById,
} from "./studio-brush-catalog";
import {
  listStudioListedPaintUniquenessCollisions,
  STUDIO_BRUSH_FEEL_CULL_PRESET_IDS,
  STUDIO_LISTED_PAINT_PRE_CHANGE_COUNT,
  studioBrushListedUniquenessKey,
} from "./studio-brush-listed-uniqueness";
import {
  studioBrushPackDescriptorById,
  STUDIO_BRUSH_PACK_DESCRIPTORS,
} from "./studio-brush-pack-index";
import {
  materializeAllStudioBrushPackSelections,
  materializeStudioBrushPackSelection,
} from "./studio-brush-pack-runtime";
import { auditStudioBrushPlannerQualityCatalogue } from "./studio-brush-planner-quality-audit";
import { STUDIO_BRUSH_QUALITY_PORTFOLIO_COUNTS } from "./studio-brush-quality-portfolio";
import {
  isStudioBrushQuarantinedPresetId,
  STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID,
} from "./studio-brush-quarantine";
import {
  resolveStudioBrushRuntime,
  resolveStudioBrushRuntimeContract,
  STUDIO_BRUSH_SAFE_FALLBACK_ID,
} from "./studio-brush-runtime-contract";
import { studioCoreBrushCatalogSelection } from "./studio-brush-selection";

describe("listed paint uniqueness and consolidated product portfolio", () => {
  it("exposes every safe paint identity with the 86 audited representatives first", () => {
    const qualityCount = STUDIO_BRUSH_QUALITY_PORTFOLIO_COUNTS.paint;
    const qualityFirst = STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.slice(0, qualityCount);
    const expectedSafeIds = STUDIO_ALL_BRUSH_CATALOG_ITEMS
      .filter(
        (item) =>
          item.operation === "paint" &&
          !isStudioBrushQuarantinedPresetId(item.id),
      )
      .map((item) => item.id);

    expect(STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.length).toBeLessThan(
      STUDIO_LISTED_PAINT_PRE_CHANGE_COUNT,
    );
    expect(STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.length).toBeGreaterThan(
      qualityCount,
    );
    expect(qualityFirst).toEqual(STUDIO_DEFAULT_QUALITY_PAINT_BRUSH_CATALOG_ITEMS);
    qualityFirst.forEach((item, index) => {
      expect(item).toBe(STUDIO_DEFAULT_QUALITY_PAINT_BRUSH_CATALOG_ITEMS[index]);
    });
    expect(qualityFirst).toHaveLength(86);
    expect(
      new Set(STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.map((item) => item.id)),
    ).toEqual(new Set(expectedSafeIds));
  });

  it("keeps no two product paint ids on the same uniqueness key", () => {
    expect(listStudioListedPaintUniquenessCollisions()).toEqual([]);
    const keys = STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.map((item) => {
      const key = studioBrushListedUniquenessKey(item.id);
      expect(key, item.id).not.toBeNull();
      return key;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps product planner exact and perceptual fingerprints unique", () => {
    const listedIds = new Set(
      STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.map((item) => item.id),
    );
    const core = BRUSH_PRESETS.filter(
      (preset) => listedIds.has(preset.id) && preset.operation !== "erase",
    ).map(studioCoreBrushCatalogSelection);
    const professional = materializeAllStudioBrushPackSelections()
      .filter((selection) => listedIds.has(selection.catalogId))
      .map((selection) => {
        const descriptor = STUDIO_BRUSH_PACK_DESCRIPTORS.find(
          (row) => row.catalogId === selection.catalogId,
        );
        return {
          ...selection,
          category: descriptor?.category,
          previewStyle: descriptor?.previewStyle,
        };
      });
    const report = auditStudioBrushPlannerQualityCatalogue([
      ...core,
      ...professional,
    ]);
    expect(report.exactFingerprintGroups).toEqual([]);
    expect(report.perceptualFingerprintGroups).toEqual([]);
    expect(report.errorCount).toBe(0);
  });

  it("keeps internal quarantined implementations registered without exposing them", () => {
    for (const quarantinedId of STUDIO_BRUSH_FEEL_CULL_PRESET_IDS) {
      expect(
        isStudioBrushQuarantinedPresetId(quarantinedId),
        quarantinedId,
      ).toBe(true);
      expect(
        (
          STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID[quarantinedId] ?? ""
        ).trim().length,
        quarantinedId,
      ).toBeGreaterThan(0);
      expect(
        studioBrushCatalogItemById(quarantinedId),
        quarantinedId,
      ).not.toBeNull();
      expect(
        STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.some(
          (item) => item.id === quarantinedId,
        ),
        quarantinedId,
      ).toBe(false);

      const packDescriptor = studioBrushPackDescriptorById(quarantinedId);
      if (packDescriptor) {
        const selection =
          materializeStudioBrushPackSelection(quarantinedId);
        expect(selection?.catalogId, quarantinedId).toBe(quarantinedId);
        const packRuntime = resolveStudioBrushRuntime(
          packDescriptor.runtimeBrushId,
        );
        expect(packRuntime.status, quarantinedId).toBe("exact");
        expect(packRuntime.resolvedId, quarantinedId).not.toBe(
          STUDIO_BRUSH_SAFE_FALLBACK_ID,
        );
        continue;
      }

      const resolution = resolveStudioBrushRuntime(quarantinedId);
      expect(resolution.status, quarantinedId).toBe("exact");
      expect(resolution.resolvedId, quarantinedId).toBe(quarantinedId);
      expect(resolution.resolvedId, quarantinedId).not.toBe(
        STUDIO_BRUSH_SAFE_FALLBACK_ID,
      );
      expect(
        resolveStudioBrushRuntimeContract(quarantinedId)?.id,
        quarantinedId,
      ).toBe(quarantinedId);
    }
  });
});
