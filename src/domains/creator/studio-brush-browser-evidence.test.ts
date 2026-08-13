import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS,
  STUDIO_PAINT_BRUSH_CATALOG_ITEMS,
} from "./studio-brush-catalog";

interface StudioBrushBrowserEvidence {
  readonly schemaVersion: number;
  readonly status: string;
  readonly catalog: {
    readonly total: number;
    readonly core: number;
    readonly pro: number;
    readonly paint: number;
    readonly erase: number;
    /** Registered but delisted ids (V17.1 quarantine); UI matrices cover total - quarantined. */
    readonly quarantined: number;
  };
  readonly desktop: {
    readonly selectedAndRendered: number;
    readonly undoPassed: number;
    readonly redoPassed: number;
    readonly errorCount: number;
  };
  readonly longRouteCore: {
    readonly passed: number;
    readonly total: number;
    readonly visibleSegmentsPerTool: number;
    readonly totalSegmentsPerTool: number;
    readonly continuousPolicyFailures: number;
    readonly qualityPolicyCounts: Readonly<Record<string, number>>;
    readonly errorCount: number;
  };
  readonly smartShapes: {
    readonly passed: number;
    readonly total: number;
    readonly errorCount: number;
  };
  readonly mobile: {
    readonly paintSelections: number;
    readonly eraserSelections: number;
    readonly interactiveTargets: number;
    readonly minimumTargetWidthPx: number;
    readonly minimumTargetHeightPx: number;
    readonly undersizedTargets: number;
    readonly errorCount: number;
  };
  readonly pointerUpDurability: {
    readonly payloadContainsEveryStroke: boolean;
    readonly recoveryBannerShown: boolean;
    readonly recoveredPixelsChanged: boolean;
    readonly errorCount: number;
  };
}

describe("Studio brush browser evidence", () => {
  it("pins a passing production-browser receipt for the exact shipped catalogue", () => {
    const evidence = JSON.parse(readFileSync(new URL(
      "../../../tests/benchmarks/results/studio-brush-browser.json",
      import.meta.url,
    ), "utf8")) as StudioBrushBrowserEvidence;
    const coreCount = STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter(
      (item) => item.source === "core",
    ).length;
    const proCount = STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter(
      (item) => item.source === "pro",
    ).length;

    // Schema v2: the receipt distinguishes the durable registry (total/core/pro/paint/erase,
    // preserved for persisted documents) from the LISTED matrix the shipped UI can actually
    // select — quarantined ids are registered but never selectable, so every UI-driven counter
    // pins the listed set.
    const listedTotal = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length;
    expect(evidence.schemaVersion).toBe(2);
    expect(evidence.status).toBe("pass");
    expect(evidence.catalog).toEqual({
      total: STUDIO_ALL_BRUSH_CATALOG_ITEMS.length,
      core: coreCount,
      pro: proCount,
      paint: STUDIO_PAINT_BRUSH_CATALOG_ITEMS.length,
      erase: STUDIO_ERASER_BRUSH_CATALOG_ITEMS.length,
      quarantined: STUDIO_ALL_BRUSH_CATALOG_ITEMS.length - listedTotal,
    });
    expect(evidence.desktop).toMatchObject({
      selectedAndRendered: listedTotal,
      undoPassed: listedTotal,
      redoPassed: listedTotal,
      errorCount: 0,
    });
    const listedCoreCount = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.filter(
      (item) => item.source === "core",
    ).length;
    expect(evidence.longRouteCore).toMatchObject({
      passed: listedCoreCount,
      total: listedCoreCount,
      visibleSegmentsPerTool: 6,
      totalSegmentsPerTool: 6,
      continuousPolicyFailures: 0,
      errorCount: 0,
    });
    expect(
      Object.values(evidence.longRouteCore.qualityPolicyCounts)
        .reduce((sum, count) => sum + count, 0),
    ).toBe(listedCoreCount);
    expect(evidence.smartShapes).toMatchObject({ passed: 6, total: 6, errorCount: 0 });
    expect(evidence.mobile).toMatchObject({
      paintSelections: STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS.length,
      eraserSelections: STUDIO_LISTED_ERASER_BRUSH_CATALOG_ITEMS.length,
      minimumTargetWidthPx: 44,
      minimumTargetHeightPx: 44,
      undersizedTargets: 0,
      errorCount: 0,
    });
    expect(evidence.mobile.interactiveTargets).toBeGreaterThanOrEqual(listedTotal * 2);
    expect(evidence.pointerUpDurability).toMatchObject({
      payloadContainsEveryStroke: true,
      recoveryBannerShown: true,
      recoveredPixelsChanged: true,
      errorCount: 0,
    });
  });
});
