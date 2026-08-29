import { describe, expect, it } from "vitest";

import { STUDIO_PAINT_BRUSH_CATALOG_ITEMS } from "../src/domains/creator/brush/studio-brush-catalog";
import {
  resolveStudioBrushDynamics,
  resolveStudioBrushDynamicsForNormalizedSettings,
  type StudioBrushDynamicsRecipe,
} from "../src/domains/creator/brush/studio-brush-dynamics";
import { materializeAllStudioBrushPackSelections } from "../src/domains/creator/brush/studio-brush-pack-runtime";
import {
  computeStudioBrushPlanDigest,
  computeStudioBrushQualityReceiptSkeleton,
} from "../src/domains/creator/brush/studio-brush-variant-group-manifest";

import {
  STUDIO_BRUSH_CATALOGUE_SOAK_IDS,
  STUDIO_BRUSH_CATALOGUE_SOAK_MIN_HALF_SAMPLES,
  STUDIO_BRUSH_CATALOGUE_SOAK_RUNS,
  STUDIO_BRUSH_CRAYON_FAMILY_IDS,
  detectStudioBrushSoakMonotonicDegradation,
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

describe("soak monotonic-degradation detector", () => {
  /**
   * Every noise series here is a RECORDED CI measurement from this gate's own hardening history
   * (see the detector docstring), so the decision is pinned against the real shapes that broke
   * it rather than against a live timing run that reproduces at most one of them.
   */
  it.each([
    // main CI: lucky 29.77 baseline vs 38.32 later-min reads x1.29, while the first half's OWN
    // spread already spans x1.71 — unresolvable noise, not degradation.
    ["needle-graphite (main CI)", [29.77, 37.52, 51.01, 34.03, 34.87, 53.45, 60.47, 62.61, 48.54, 38.32]],
    ["needle-graphite (three-run era)", [40.68, 38.13, 46.76, 46.16, 82.60, 63.89]],
    // Series too short to estimate within-half noise abstain rather than guess.
    ["acrylic-stiff-flat (lucky first run)", [6.55, 15.54, 13.59]],
    ["oil-pastel (one preempted run)", [7.22, 7.26, 18.90]],
    // A healthy planner that only warms up must never trip the gate.
    ["JIT warm-up", [52.0, 31.0, 29.5, 28.9, 28.7, 28.6, 28.5, 28.5, 28.4, 28.4]],
  ])("does not call degradation on recorded scheduler noise: %s", (_label, elapsed) => {
    expect(detectStudioBrushSoakMonotonicDegradation(elapsed)).toBe(false);
  });

  it.each([
    // Compounding growth: earlyMax/earlyMin = g^4 while laterMin/earlyMin = g^5, so every g > 1
    // clears its own first-half spread.
    ["20% per run", [10, 12, 14.4, 17.28, 20.74, 24.88, 29.86, 35.83, 43.0, 51.6]],
    ["45% per run", [8, 11.6, 16.8, 24.4, 35.4, 51.3, 74.4, 107.9, 156.4, 226.8]],
    // Step-change leak: a cache that starts thrashing halfway and stays slow.
    ["sustained step change", [10, 10.2, 9.9, 10.1, 10.0, 31.0, 32.2, 30.8, 31.5, 30.9]],
    // Found in review: a step that begins BEFORE the midpoint contaminates the first half, so
    // growth and first-half spread are both 3x and a spread comparison alone would suppress it.
    // The first half still only climbs, which is what a leak does and contention does not.
    ["step starting inside the first half", [10, 10, 10, 30, 30, 30, 30, 30, 30, 30]],
    ["step starting at the second run", [12, 44, 45, 44.5, 46, 45, 47, 44.8, 46.2, 45.5]],
    // Found in review: a rising first half with ONE ordinary jitter dip. The dip (12->11, x1.09)
    // defeats the drawdown shape, and a larger tolerance cannot rescue it -- the recorded noise
    // series [40.68, 38.13, 46.76] dips x1.067, inside what that would have to admit. The half's
    // travel separates them: x2.27 here against x1.03-x1.17 for every recorded noise series.
    ["rising first half with one jitter dip", [10, 12, 11, 20, 30, 40, 50, 60, 70, 80]],
  ])("still catches a genuine compounding leak: %s", (_label, elapsed) => {
    expect(detectStudioBrushSoakMonotonicDegradation(elapsed)).toBe(true);
  });

  it("keeps the absolute floor so sub-millisecond timer jitter cannot manufacture a leak", () => {
    // x2 in ratio terms, but only ~1ms absolute — under the 4ms floor.
    expect(
      detectStudioBrushSoakMonotonicDegradation([1, 1.1, 1.05, 1.2, 1.1, 2, 2.1, 2.2, 2.05, 2.1]),
    ).toBe(false);
  });

  it("abstains instead of throwing on degenerate series", () => {
    expect(detectStudioBrushSoakMonotonicDegradation([])).toBe(false);
    expect(detectStudioBrushSoakMonotonicDegradation([12.5])).toBe(false);
    expect(detectStudioBrushSoakMonotonicDegradation([0, 0])).toBe(false);
    // A half below the sample floor cannot estimate its own spread, so it never calls degradation.
    expect(detectStudioBrushSoakMonotonicDegradation([1, 50, 60])).toBe(false);
  });

  it("the shipped soak runs enough samples for both halves to clear the sample floor", () => {
    expect(Math.floor(STUDIO_BRUSH_CATALOGUE_SOAK_RUNS / 2)).toBeGreaterThanOrEqual(
      STUDIO_BRUSH_CATALOGUE_SOAK_MIN_HALF_SAMPLES,
    );
  });
});

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
