import { describe, expect, it } from "vitest";

import { STUDIO_PAINT_BRUSH_CATALOG_ITEMS } from "../src/domains/creator/studio-brush-catalog";
import { materializeAllStudioBrushPackSelections } from "../src/domains/creator/studio-brush-pack-runtime";
import { computeStudioBrushQualityReceiptSkeleton } from "../src/domains/creator/studio-brush-variant-group-manifest";

import {
  STUDIO_BRUSH_CRAYON_FAMILY_IDS,
  evaluateStudioBrushCataloguePaintDeterminismProbe,
  evaluateStudioBrushCataloguePaintPerfMatrix,
  evaluateStudioBrushCrayonFamilyIncrementalChunks,
  listStudioBrushCatalogueDeterminismSampleIds,
} from "./studio-brush-catalogue-perf-matrix";

describe("studio brush catalogue paint performance matrix", () => {
  it("exercises every shipped paint catalogue id on product planner paths", () => {
    const report = evaluateStudioBrushCataloguePaintPerfMatrix();

    expect(report.paintCatalogCount).toBe(STUDIO_PAINT_BRUSH_CATALOG_ITEMS.length);
    expect(report.rowCount).toBe(STUDIO_PAINT_BRUSH_CATALOG_ITEMS.length);
    expect(report.missingCatalogIds).toEqual([]);
    expect(new Set(report.rows.map((row) => row.catalogId)).size).toBe(
      STUDIO_PAINT_BRUSH_CATALOG_ITEMS.length,
    );

    const failures = report.rows.filter((row) => !row.ok);
    const freezes = report.rows.filter((row) => row.freeze);
    expect(failures, JSON.stringify(failures.slice(0, 8))).toEqual([]);
    expect(freezes, JSON.stringify(freezes.slice(0, 8))).toEqual([]);

    for (const family of report.crayonFamily) {
      expect(family.ok, `${family.catalogId}: ${family.failure}`).toBe(true);
      expect(family.freeze, `${family.catalogId}: ${family.elapsedMs}ms`).toBe(false);
      expect(family.dabCount).toBeGreaterThan(200);
      expect(family.markCount).toBeGreaterThan(0);
    }

    expect(report.determinism.probeCount).toBe(
      listStudioBrushCatalogueDeterminismSampleIds().length,
    );
    expect(report.determinism.probeCount).toBeGreaterThanOrEqual(
      STUDIO_BRUSH_CRAYON_FAMILY_IDS.length,
    );
    expect(report.determinism.nonDeterministicIds).toEqual([]);
    expect(report.determinism.deterministicCount).toBeGreaterThan(0);
    expect(
      report.determinism.deterministicCount + report.determinism.unmeasuredCount,
    ).toBe(report.determinism.probeCount);

    expect(report.ok).toBe(true);
  });

  it("replays identical same-seed digests and feeds honest bench receipts", () => {
    const packById = new Map(
      materializeAllStudioBrushPackSelections().map((selection) => [
        selection.catalogId,
        selection,
      ]),
    );

    // Mixed planner paths: causal coverage (crayon), dynamic dabs (airbrush), pro pack (core-round).
    for (const catalogId of ["crayon", "airbrush", "core-round"]) {
      const probe = evaluateStudioBrushCataloguePaintDeterminismProbe(catalogId, { packById });
      expect(probe.planOk, catalogId).toBe(true);
      expect(probe.digestFirst, catalogId).not.toBeNull();
      expect(probe.deterministic, catalogId).toBe(true);

      const receipt = computeStudioBrushQualityReceiptSkeleton(catalogId, probe.benchMeasurement);
      expect(receipt.status).toBe("bench");
      expect(receipt.determinismScore, catalogId).toBe(1);
      expect(receipt.performanceScore, catalogId).toBeGreaterThan(0);
      expect(receipt.performanceScore, catalogId).toBeLessThanOrEqual(1);
      expect(receipt.textureScore).toBeNull();
      expect(receipt.totalScore).toBeNull();
    }

    // Contract-only path plans no geometry: determinism stays unmeasured instead of failing.
    const contractOnly = evaluateStudioBrushCataloguePaintDeterminismProbe("pen", { packById });
    expect(contractOnly.planOk).toBe(true);
    expect(contractOnly.digestFirst).toBeNull();
    expect(contractOnly.deterministic).toBeNull();
    const contractOnlyReceipt = computeStudioBrushQualityReceiptSkeleton(
      "pen",
      contractOnly.benchMeasurement,
    );
    expect(contractOnlyReceipt.determinismScore).toBeNull();
    expect(contractOnlyReceipt.pendingAxes).toContain("determinism");
    expect(contractOnlyReceipt.performanceScore).not.toBeNull();
  });

  it.each(STUDIO_BRUSH_CRAYON_FAMILY_IDS)(
    "keeps %s long-stroke incremental coverage under freeze budgets",
    (catalogId) => {
      const result = evaluateStudioBrushCrayonFamilyIncrementalChunks(catalogId);
      expect(result.ok, catalogId).toBe(true);
      expect(result.freeze, `${catalogId} maxChunk=${result.maxChunkMs}`).toBe(false);
      expect(result.maxChunkMs).toBeLessThan(33);
      expect(result.totalMs).toBeLessThan(1_500);
      expect(result.chunkCount).toBeGreaterThan(10);
      expect(result.dabCount).toBeGreaterThan(500);
    },
  );
});
