import { describe, expect, it } from "vitest";

import { STUDIO_BEGINNER_BRUSH_IDS } from "../studio-creative-ux";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  studioBrushCatalogItemById,
} from "./studio-brush-catalog";
import {
  brushLifecycleStageOf,
  brushVariantGroupOf,
  STUDIO_BRUSH_CORE_SHELF_PRESET_IDS,
  STUDIO_BRUSH_VARIANT_GROUPS,
  type BrushLifecycleStage,
} from "./studio-brush-catalog-lifecycle";
import { STUDIO_BRUSH_QUARANTINED_PRESET_IDS } from "./studio-brush-quarantine";
import { STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS } from "./studio-brush-variant-group-manifest";
import { STUDIO_SUB_TOOL_PALETTE_CATEGORIES } from "./studio-sub-tool-palette-data";

describe("studio brush catalog lifecycle", () => {
  it("resolves a stage for every shipped catalogue id (resolver totality)", () => {
    const countsByStage = new Map<BrushLifecycleStage, number>();
    for (const item of STUDIO_ALL_BRUSH_CATALOG_ITEMS) {
      const stage = brushLifecycleStageOf(item.id);
      expect(stage, item.id).not.toBeNull();
      if (stage) countsByStage.set(stage, (countsByStage.get(stage) ?? 0) + 1);
    }
    // The distribution is derived from the live sources, never hardcoded: quarantine ledger and
    // experimental pins are catalogue subsets, core mirrors the default shelves, extended is the
    // remainder, and `lab` never fires for a shipped id.
    expect(countsByStage.get("quarantined")).toBe(STUDIO_BRUSH_QUARANTINED_PRESET_IDS.length);
    expect(countsByStage.get("experimental")).toBe(
      STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS.length,
    );
    expect(countsByStage.get("core")).toBe(STUDIO_BRUSH_CORE_SHELF_PRESET_IDS.length);
    expect(countsByStage.get("lab")).toBeUndefined();
    expect(countsByStage.get("extended")).toBe(
      STUDIO_ALL_BRUSH_CATALOG_ITEMS.length
        - STUDIO_BRUSH_QUARANTINED_PRESET_IDS.length
        - STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS.length
        - STUDIO_BRUSH_CORE_SHELF_PRESET_IDS.length,
    );
    // Every stage in that derivation must actually be occupied for the counts to mean anything.
    expect(countsByStage.get("quarantined") ?? 0).toBeGreaterThan(0);
    expect(countsByStage.get("experimental") ?? 0).toBeGreaterThan(0);
    expect(countsByStage.get("core") ?? 0).toBeGreaterThan(0);
    expect(countsByStage.get("extended") ?? 0).toBeGreaterThan(0);
  });

  it("keeps the explicit core table byte-true to the live default shelves", () => {
    const derived = new Set<string>(STUDIO_BEGINNER_BRUSH_IDS);
    for (const category of STUDIO_SUB_TOOL_PALETTE_CATEGORIES) {
      for (const tool of category.tools) derived.add(tool.id);
    }
    expect(new Set(STUDIO_BRUSH_CORE_SHELF_PRESET_IDS)).toEqual(derived);
    // No duplicates: the table length IS the tier size.
    expect(new Set(STUDIO_BRUSH_CORE_SHELF_PRESET_IDS).size).toBe(
      STUDIO_BRUSH_CORE_SHELF_PRESET_IDS.length,
    );
  });

  it("keeps the stage sources disjoint so precedence never masks a table conflict", () => {
    const quarantined = new Set(STUDIO_BRUSH_QUARANTINED_PRESET_IDS);
    const experimental = new Set(STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS);
    for (const id of STUDIO_BRUSH_CORE_SHELF_PRESET_IDS) {
      expect(quarantined.has(id), id).toBe(false);
      expect(experimental.has(id), id).toBe(false);
    }
    for (const id of experimental) {
      expect(quarantined.has(id), id).toBe(false);
      // Experimental pins must stay shipped catalogue ids for resolver totality to hold.
      expect(studioBrushCatalogItemById(id), id).not.toBeNull();
    }
  });

  it("resolves representative stages and fails closed on unknown input", () => {
    expect(brushLifecycleStageOf("gpen")).toBe("core");
    expect(brushLifecycleStageOf("standard-eraser")).toBe("core");
    expect(brushLifecycleStageOf("glass-pen")).toBe("extended");
    expect(brushLifecycleStageOf("watercolor-salt-bloom")).toBe("extended");
    expect(brushLifecycleStageOf("gpen--croquis-capsule")).toBe("experimental");
    expect(brushLifecycleStageOf("gpen--causal-round")).toBe("quarantined");
    expect(brushLifecycleStageOf("no-such-brush")).toBeNull();
    expect(brushLifecycleStageOf("")).toBeNull();
    expect(brushLifecycleStageOf(undefined)).toBeNull();
    expect(brushLifecycleStageOf(42)).toBeNull();
  });

  it("keeps every curated group member a shipped catalogue preset (no dangling ids)", () => {
    for (const group of STUDIO_BRUSH_VARIANT_GROUPS) {
      expect(group.memberPresetIds.length, group.id).toBeGreaterThanOrEqual(2);
      expect(group.intent.trim().length, group.id).toBeGreaterThan(0);
      for (const memberId of group.memberPresetIds) {
        expect(studioBrushCatalogItemById(memberId), `${group.id}:${memberId}`).not.toBeNull();
      }
    }
  });

  it("assigns each preset to at most one curated group and derives non-empty axes", () => {
    const seen = new Set<string>();
    const groupIds = new Set<string>();
    for (const group of STUDIO_BRUSH_VARIANT_GROUPS) {
      expect(groupIds.has(group.id), group.id).toBe(false);
      groupIds.add(group.id);
      // Curated members verifiably differ on at least one renderer-contract axis; an empty axis
      // list would mean the family is a de-facto duplicate set and must fail loudly.
      expect(group.comparisonAxes.length, group.id).toBeGreaterThan(0);
      for (const memberId of group.memberPresetIds) {
        expect(seen.has(memberId), memberId).toBe(false);
        seen.add(memberId);
      }
    }
  });

  it("resolves membership through brushVariantGroupOf and stays partial by design", () => {
    expect(brushVariantGroupOf("maru-pen")?.id).toBe("professional-inking");
    expect(brushVariantGroupOf("watercolor-backrun-ring")?.id).toBe("watercolor");
    expect(brushVariantGroupOf("mypaint-cc0--charcoal-tanda")?.id).toBe("charcoal");
    // Presets without an obvious family stay ungrouped here — the mechanical manifest partition
    // covers them; curated coverage is deliberately conservative.
    expect(brushVariantGroupOf("neon")).toBeNull();
    expect(brushVariantGroupOf("no-such-brush")).toBeNull();
    expect(brushVariantGroupOf(undefined)).toBeNull();
  });

  it("keeps quarantined members partitioned in their family while staged quarantined", () => {
    // 격리는 노출 제거일 뿐 — 비교군 분할과 저장 문서 메타데이터 해석은 유지된다.
    const marker = brushVariantGroupOf("marker--chisel-ribbon");
    expect(marker?.id).toBe("marker");
    expect(brushLifecycleStageOf("marker--chisel-ribbon")).toBe("quarantined");
    const airbrush = brushVariantGroupOf("airbrush--stamp-soft");
    expect(airbrush?.id).toBe("airbrush");
    expect(brushLifecycleStageOf("airbrush--stamp-soft")).toBe("quarantined");
  });

  it("freezes every exported artifact", () => {
    expect(Object.isFrozen(STUDIO_BRUSH_CORE_SHELF_PRESET_IDS)).toBe(true);
    expect(Object.isFrozen(STUDIO_BRUSH_VARIANT_GROUPS)).toBe(true);
    for (const group of STUDIO_BRUSH_VARIANT_GROUPS) {
      expect(Object.isFrozen(group), group.id).toBe(true);
      expect(Object.isFrozen(group.memberPresetIds), group.id).toBe(true);
      expect(Object.isFrozen(group.comparisonAxes), group.id).toBe(true);
    }
  });
});
