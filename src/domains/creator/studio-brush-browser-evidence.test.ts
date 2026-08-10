import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_ERASER_BRUSH_CATALOG_ITEMS,
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

    expect(evidence.schemaVersion).toBe(1);
    expect(evidence.status).toBe("pass");
    expect(evidence.catalog).toEqual({
      total: STUDIO_ALL_BRUSH_CATALOG_ITEMS.length,
      core: coreCount,
      pro: proCount,
      paint: STUDIO_PAINT_BRUSH_CATALOG_ITEMS.length,
      erase: STUDIO_ERASER_BRUSH_CATALOG_ITEMS.length,
    });
    expect(evidence.desktop).toMatchObject({
      selectedAndRendered: evidence.catalog.total,
      undoPassed: evidence.catalog.total,
      redoPassed: evidence.catalog.total,
      errorCount: 0,
    });
    expect(evidence.longRouteCore).toMatchObject({
      passed: coreCount,
      total: coreCount,
      visibleSegmentsPerTool: 6,
      totalSegmentsPerTool: 6,
      continuousPolicyFailures: 0,
      errorCount: 0,
    });
    expect(
      Object.values(evidence.longRouteCore.qualityPolicyCounts)
        .reduce((sum, count) => sum + count, 0),
    ).toBe(coreCount);
    expect(evidence.smartShapes).toMatchObject({ passed: 6, total: 6, errorCount: 0 });
    expect(evidence.mobile).toMatchObject({
      paintSelections: evidence.catalog.paint,
      eraserSelections: evidence.catalog.erase,
      minimumTargetWidthPx: 44,
      minimumTargetHeightPx: 44,
      undersizedTargets: 0,
      errorCount: 0,
    });
    expect(evidence.mobile.interactiveTargets).toBeGreaterThanOrEqual(evidence.catalog.total * 2);
    expect(evidence.pointerUpDurability).toMatchObject({
      payloadContainsEveryStroke: true,
      recoveryBannerShown: true,
      recoveredPixelsChanged: true,
      errorCount: 0,
    });
  });
});
