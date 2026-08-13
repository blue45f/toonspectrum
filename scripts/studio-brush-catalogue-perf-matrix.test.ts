import { describe, expect, it } from "vitest";

import { STUDIO_PAINT_BRUSH_CATALOG_ITEMS } from "../src/domains/creator/studio-brush-catalog";
import {
  resolveStudioBrushDynamics,
  resolveStudioBrushDynamicsForNormalizedSettings,
  type StudioBrushDynamicsRecipe,
} from "../src/domains/creator/studio-brush-dynamics";
import { materializeAllStudioBrushPackSelections } from "../src/domains/creator/studio-brush-pack-runtime";
import {
  computeStudioBrushPlanDigest,
  computeStudioBrushQualityReceiptSkeleton,
} from "../src/domains/creator/studio-brush-variant-group-manifest";

import {
  STUDIO_BRUSH_CATALOGUE_SOAK_IDS,
  STUDIO_BRUSH_CATALOGUE_SOAK_RUNS,
  STUDIO_BRUSH_CRAYON_FAMILY_IDS,
  evaluateStudioBrushCataloguePaintDeterminismProbe,
  evaluateStudioBrushCataloguePaintPerfMatrix,
  evaluateStudioBrushCataloguePaintPerfRow,
  evaluateStudioBrushCataloguePaintSoak,
  evaluateStudioBrushCrayonFamilyIncrementalChunks,
  listStudioBrushCatalogueDeterminismSampleIds,
  planStudioBrushCataloguePaintDynamics,
} from "./studio-brush-catalogue-perf-matrix";

/**
 * Deterministic pointer-sample grid spanning the full domain `dabAt` feeds the per-dab resolver:
 * rest/extreme pressures, clamped speed, full tilt corners, twist wrap, signed direction bounds
 * and small-through-large stamp indices (the seeded-jitter/scatter salt input).
 */
const RESOLVER_EQUIVALENCE_SAMPLES = [
  { pressure: 0, tangentialPressure: 0, speed: 0, tiltX: 0, tiltY: 0, twist: 0, direction: 0, stampIndex: 0 },
  { pressure: 0.42, tangentialPressure: 0, speed: 0.35, tiltX: 8, tiltY: -12, twist: 15, direction: 30, stampIndex: 1 },
  { pressure: 1, tangentialPressure: 1, speed: 64, tiltX: 90, tiltY: -90, twist: 359, direction: -180, stampIndex: 2 },
  { pressure: 0.85, tangentialPressure: -1, speed: 2.4, tiltX: -45, tiltY: 60, twist: 180, direction: 137.5, stampIndex: 7 },
  { pressure: 0.05, tangentialPressure: 0.25, speed: 0.9, tiltX: 22, tiltY: -8, twist: 45, direction: -90, stampIndex: 63 },
  { pressure: 0.62, tangentialPressure: 0, speed: 1.3, tiltX: 0, tiltY: 0, twist: 300, direction: 179.9, stampIndex: 1_160 },
  { pressure: 0.5, tangentialPressure: -0.5, speed: 6.5, tiltX: 65, tiltY: 65, twist: 90, direction: -0.5, stampIndex: 8_191 },
  { pressure: 0.73, tangentialPressure: 0.9, speed: 0.05, tiltX: -90, tiltY: 90, twist: 271, direction: 12.25, stampIndex: 65_535 },
] as const;

function* recipeDigestStream(
  recipes: readonly StudioBrushDynamicsRecipe[],
): Generator<number> {
  for (const recipe of recipes) {
    yield recipe.size;
    yield recipe.width;
    yield recipe.opacity;
    yield recipe.flow;
    yield recipe.spacing;
    yield recipe.scatter;
    yield recipe.scatterOffsetX;
    yield recipe.scatterOffsetY;
    yield recipe.scatterAngle;
    yield recipe.angle;
    yield recipe.roundness;
  }
}

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

  it("resolves byte-identical recipes through the normalized-settings fast path for every plannable paint id", () => {
    // Byte-identity contract for the causal-walker hotspot optimization: `dabAt` swapped the
    // renormalizing reference resolver for the normalized-settings fast path, so any recipe
    // divergence here would change committed stroke geometry. Reference and optimized recipes are
    // hashed with the same plan-digest idiom the perf rows use (same seed ⇒ same plan hash).
    const packById = new Map(
      materializeAllStudioBrushPackSelections().map((selection) => [
        selection.catalogId,
        selection,
      ]),
    );
    let comparedIds = 0;
    for (const item of STUDIO_PAINT_BRUSH_CATALOG_ITEMS) {
      const dynamics = planStudioBrushCataloguePaintDynamics(item.id, packById);
      if (!dynamics) continue;
      comparedIds += 1;
      const referenceRecipes: StudioBrushDynamicsRecipe[] = [];
      const optimizedRecipes: StudioBrushDynamicsRecipe[] = [];
      for (const sample of RESOLVER_EQUIVALENCE_SAMPLES) {
        const reference = resolveStudioBrushDynamics(sample, dynamics);
        const optimized = resolveStudioBrushDynamicsForNormalizedSettings(sample, dynamics);
        expect(optimized, `${item.id} stampIndex=${sample.stampIndex}`).toStrictEqual(reference);
        referenceRecipes.push(reference);
        optimizedRecipes.push(optimized);
      }
      expect(
        computeStudioBrushPlanDigest(recipeDigestStream(optimizedRecipes)),
        item.id,
      ).toBe(computeStudioBrushPlanDigest(recipeDigestStream(referenceRecipes)));
    }
    expect(comparedIds).toBeGreaterThan(100);
  });

  it("soaks the five slowest catalogue ids without digest drift or monotonic degradation", () => {
    const packById = new Map(
      materializeAllStudioBrushPackSelections().map((selection) => [
        selection.catalogId,
        selection,
      ]),
    );
    for (const catalogId of STUDIO_BRUSH_CATALOGUE_SOAK_IDS) {
      // All five sentinels plan real geometry through the causal-coverage path.
      const row = evaluateStudioBrushCataloguePaintPerfRow(catalogId, { packById });
      expect(row.path, catalogId).toBe("causal-coverage");
      expect(row.digest, catalogId).not.toBeNull();

      const soak = evaluateStudioBrushCataloguePaintSoak(catalogId, { packById });
      expect(soak.runCount).toBe(STUDIO_BRUSH_CATALOGUE_SOAK_RUNS);
      expect(soak.elapsedMs).toHaveLength(STUDIO_BRUSH_CATALOGUE_SOAK_RUNS);
      expect(soak.planOk, catalogId).toBe(true);
      expect(soak.digests.every((digest) => digest !== null), catalogId).toBe(true);
      expect(soak.digestsStable, catalogId).toBe(true);
      expect(
        soak.monotonicDegradation,
        `${catalogId} elapsed=[${soak.elapsedMs.map((ms) => ms.toFixed(2)).join(", ")}]ms`,
      ).toBe(false);
      expect(soak.freezeCount, catalogId).toBe(0);
      expect(soak.ok, catalogId).toBe(true);
    }
  });
});
