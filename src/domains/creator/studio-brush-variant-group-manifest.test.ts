import { describe, expect, it } from "vitest";

import {
  filterStudioBrushCatalogItems,
  STUDIO_PAINT_BRUSH_CATALOG_ITEMS,
  studioBrushCatalogItemById,
} from "./studio-brush-catalog";
import {
  resolveStudioBrushRuntime,
  resolveStudioBrushRuntimeContract,
  STUDIO_BRUSH_SAFE_FALLBACK_ID,
} from "./studio-brush-runtime-contract";
import {
  isStudioBrushQuarantinedPresetId,
  STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS,
  STUDIO_BRUSH_QUALITY_WEIGHTS,
  STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID,
  STUDIO_BRUSH_QUARANTINED_PRESET_IDS,
  buildStudioBrushVariantGroups,
  certifyStudioBrushQualityReceipt,
  computeStudioBrushPlanDigest,
  computeStudioBrushQualityReceiptSkeleton,
  resolveStudioBrushLifecycleStage,
  type StudioBrushQualityAxis,
} from "./studio-brush-variant-group-manifest";

describe("studio brush variant group manifest", () => {
  it("partitions every SSOT paint id into exactly one variant group", () => {
    const groups = buildStudioBrushVariantGroups();
    const paintIds = STUDIO_PAINT_BRUSH_CATALOG_ITEMS.map((item) => item.id);

    const memberIds = groups.flatMap((group) => [...group.memberPresetIds]);
    expect(memberIds.length).toBe(paintIds.length);
    expect(new Set(memberIds).size).toBe(memberIds.length);
    expect(new Set(memberIds)).toEqual(new Set(paintIds));
  });

  it("never emits an empty group and derives axes for every comparable group", () => {
    const groups = buildStudioBrushVariantGroups();
    for (const group of groups) {
      expect(group.memberPresetIds.length, group.groupId).toBeGreaterThan(0);
      if (group.memberPresetIds.length >= 2) {
        expect(group.comparisonAxes.length, group.groupId).toBeGreaterThan(0);
      }
      if (group.kind === "pro-pack-category") {
        expect(group.packCategory, group.groupId).not.toBeNull();
        expect(group.anchorPresetId, group.groupId).toBeNull();
      } else {
        expect(group.anchorPresetId, group.groupId).not.toBeNull();
        expect(group.packCategory, group.groupId).toBeNull();
      }
      expect(group.intent.length, group.groupId).toBeGreaterThan(0);
    }
  });

  it("merges lanes hanging off a self-canonical base with that base's core family", () => {
    const groups = buildStudioBrushVariantGroups();
    const oil = groups.find((group) => group.groupId === "medium:oil");
    expect(oil).toBeDefined();
    // Core canonical fold (acrylic → oil) and engine lanes compared side by side — the exact
    // cross-engine comparison the variant groups exist for.
    expect(oil?.memberPresetIds).toContain("oil");
    expect(oil?.memberPresetIds).toContain("acrylic");
    expect(oil?.memberPresetIds).toContain("oil--filbert-ribbon");
    expect(oil?.comparisonAxes).toContain("engine");
  });

  it("keeps the derived group count stable against accidental catalogue drift", () => {
    // Snapshot of the derived group COUNT only (never the content): 65 medium families + 14 pro
    // pack categories over the 312-preset paint SSOT. This number moves ONLY with a deliberate
    // catalogue change (new preset family, new engine-lane base, or a new pro-pack category);
    // update it in the same change that lands the catalogue rows, citing that change.
    // 2026-08-13 wave 3: +1 medium family (medium:mypaint-cc0 — the CC0 MyPaint import pool's
    // engine-lane base) alongside 17 new engine-lane presets.
    const groups = buildStudioBrushVariantGroups();
    expect(groups.length).toBe(79);
  });

  it("builds deterministically and freezes every artifact", () => {
    const first = buildStudioBrushVariantGroups();
    const second = buildStudioBrushVariantGroups();
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    for (const group of first) {
      expect(Object.isFrozen(group)).toBe(true);
      expect(Object.isFrozen(group.memberPresetIds)).toBe(true);
      expect(Object.isFrozen(group.comparisonAxes)).toBe(true);
    }
    expect(Object.isFrozen(STUDIO_BRUSH_QUALITY_WEIGHTS)).toBe(true);
    expect(Object.isFrozen(STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS)).toBe(true);
  });

  it("resolves a lifecycle stage for every shipped paint id", () => {
    for (const item of STUDIO_PAINT_BRUSH_CATALOG_ITEMS) {
      expect(resolveStudioBrushLifecycleStage(item.id), item.id).not.toBeNull();
    }
    expect(resolveStudioBrushLifecycleStage("pen")).toBe("core");
    expect(resolveStudioBrushLifecycleStage("oil--filbert-ribbon")).toBe("extended");
    expect(resolveStudioBrushLifecycleStage("core-round")).toBe("extended");
    expect(resolveStudioBrushLifecycleStage("no-such-brush")).toBeNull();
    expect(resolveStudioBrushLifecycleStage(42)).toBeNull();
    // The wave's new engine lanes are pinned experimental by the catalogue integrator here
    // (2026-08-13 brush quality wave: dry-stamp x4, wet-texture x4, oil x3;
    // 2026-08-13 wave 3: CC0 MyPaint x12, croquis capsule x2, living-ink bake x2, physics oil x1).
    expect(STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS).toEqual([
      "crayon--klecks-stamp",
      "chalk--klecks-stamp",
      "charcoal--mypaint-stamp",
      "pastel--soft-stamp",
      "watercolor--edge-bloom",
      "watercolor--granulating",
      "ink-wash--fiber-feather",
      "ink-wash--chroma-halo",
      "brush--impasto-relief",
      "brush--bristle-depletion",
      "oil-pastel--wgm-mix",
      "mypaint-cc0--charcoal",
      "mypaint-cc0--charcoal-tanda",
      "mypaint-cc0--2b-pencil",
      "mypaint-cc0--dry-brush",
      "mypaint-cc0--splatter",
      "mypaint-cc0--ink-blot",
      "mypaint-cc0--kabura",
      "mypaint-cc0--watercolor-fringe",
      "mypaint-cc0--watercolor-expressive",
      "mypaint-cc0--oil-paint",
      "mypaint-cc0--pastel",
      "mypaint-cc0--spray",
      "gpen--croquis-capsule",
      "pen--croquis-stabilized",
      "ink-wash--living-bake",
      "watercolor--fluid-feather",
      "brush--bristle-physics",
    ]);
    for (const experimentalId of STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS) {
      expect(resolveStudioBrushLifecycleStage(experimentalId), experimentalId)
        .toBe("experimental");
    }
  });

  it("stages quarantined ids as quarantined with an owner-auditable reason each", () => {
    // 2026-08-13 wave 3 pruning (workstream M §2): glitter--star-field paints as plain glitter
    // because the durable dispatch never honours its declared engineVariant (지침 6).
    // 2026-08-14 browser gate: erodible-pencil and hard-airbrush render zero pixels on release for
    // both short and long strokes — a pre-wave defect (reproduced on the 65e9bf64 build) whose
    // family siblings, including the same-engine pencil--erodible-wear lane, are verified working.
    // 2026-08-14 long-route quality gate: airbrush--stamp-soft declares preview "soft" (a
    // continuous carrier) but measures edgePeriodicityScore 0.85 at a 7px period — a visible
    // ridge. Its stamp-family and airbrush-family siblings all clear the same bar (지침 6).
    expect(STUDIO_BRUSH_QUARANTINED_PRESET_IDS)
      .toEqual(["airbrush--stamp-soft", "glitter--star-field"]);
    expect(Object.isFrozen(STUDIO_BRUSH_QUARANTINED_PRESET_IDS)).toBe(true);
    expect(Object.isFrozen(STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID)).toBe(true);
    for (const quarantinedId of STUDIO_BRUSH_QUARANTINED_PRESET_IDS) {
      expect(isStudioBrushQuarantinedPresetId(quarantinedId), quarantinedId).toBe(true);
      expect(resolveStudioBrushLifecycleStage(quarantinedId), quarantinedId).toBe("quarantined");
      expect(
        (STUDIO_BRUSH_QUARANTINE_REASON_BY_PRESET_ID[quarantinedId] ?? "").trim().length,
        quarantinedId,
      ).toBeGreaterThan(0);
    }
    // The retained in-group alternatives stay exposed on their own stages.
    expect(isStudioBrushQuarantinedPresetId("glitter")).toBe(false);
    expect(resolveStudioBrushLifecycleStage("glitter")).toBe("core");
    expect(resolveStudioBrushLifecycleStage("star-dust")).toBe("core");
    expect(isStudioBrushQuarantinedPresetId(42)).toBe(false);
  });

  it("keeps every quarantined id on its own runtime contract — never the pen safe-fallback", () => {
    // Pen-convergence regression (지침 3): quarantine removes exposure, not registration. A
    // quarantined id must resolve `exact` with its own contract so persisted strokes keep their
    // texture; only genuinely unknown ids may converge to the documented pen fallback.
    for (const quarantinedId of STUDIO_BRUSH_QUARANTINED_PRESET_IDS) {
      const resolution = resolveStudioBrushRuntime(quarantinedId);
      expect(resolution.status, quarantinedId).toBe("exact");
      expect(resolution.reason, quarantinedId).toBe("supported");
      expect(resolution.resolvedId, quarantinedId).toBe(quarantinedId);
      expect(resolution.resolvedId, quarantinedId).not.toBe(STUDIO_BRUSH_SAFE_FALLBACK_ID);
      expect(resolution.contract, quarantinedId).toBe(
        resolveStudioBrushRuntimeContract(quarantinedId),
      );
    }
    const unknown = resolveStudioBrushRuntime("quarantine-never-shipped-id");
    expect(unknown.status).toBe("safe-fallback");
    expect(unknown.resolvedId).toBe(STUDIO_BRUSH_SAFE_FALLBACK_ID);
  });

  it("keeps quarantined ids inside the SSOT partition while the picker stops listing them", () => {
    const groups = buildStudioBrushVariantGroups();
    for (const quarantinedId of STUDIO_BRUSH_QUARANTINED_PRESET_IDS) {
      // Still governed: exactly one variant group owns the id (exposure ≠ governance removal).
      const owners = groups.filter((group) => group.memberPresetIds.includes(quarantinedId));
      expect(owners.length, quarantinedId).toBe(1);
      // Still resolvable for persisted documents…
      expect(studioBrushCatalogItemById(quarantinedId), quarantinedId).not.toBeNull();
      // …but absent from the default catalogue listing derived from the lifecycle stage.
      expect(
        filterStudioBrushCatalogItems({}).some((item) => item.id === quarantinedId),
        quarantinedId,
      ).toBe(false);
    }
  });

  it("locks the texture-first quality weights to the V17.1 split summing to 1", () => {
    expect(STUDIO_BRUSH_QUALITY_WEIGHTS).toEqual({
      texture: 0.4,
      dynamics: 0.15,
      edge: 0.1,
      determinism: 0.1,
      uniqueness: 0.1,
      performance: 0.1,
      editability: 0.05,
    });
    const sum = Object.values(STUDIO_BRUSH_QUALITY_WEIGHTS).reduce(
      (total, weight) => total + weight,
      0,
    );
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });
});

describe("studio brush quality receipts", () => {
  it("hashes plan streams stably and order-sensitively", () => {
    expect(computeStudioBrushPlanDigest([])).toBe("811c9dc5");
    const digest = computeStudioBrushPlanDigest([1.5, -2.25, 1e-9]);
    expect(computeStudioBrushPlanDigest([1.5, -2.25, 1e-9])).toBe(digest);
    expect(computeStudioBrushPlanDigest([-2.25, 1.5, 1e-9])).not.toBe(digest);
    expect(digest).toMatch(/^[0-9a-f]{8}$/u);
  });

  it("keeps an unmeasured skeleton fully pending instead of fabricating scores", () => {
    const receipt = computeStudioBrushQualityReceiptSkeleton("pen");
    expect(receipt.status).toBe("bench");
    expect(receipt.textureScore).toBeNull();
    expect(receipt.dynamicsScore).toBeNull();
    expect(receipt.edgeScore).toBeNull();
    expect(receipt.determinismScore).toBeNull();
    expect(receipt.uniquenessScore).toBeNull();
    expect(receipt.performanceScore).toBeNull();
    expect(receipt.editabilityScore).toBeNull();
    expect(receipt.totalScore).toBeNull();
    expect(receipt.measuredAxes).toEqual([]);
    expect(receipt.pendingAxes).toEqual([
      "texture",
      "dynamics",
      "edge",
      "determinism",
      "uniqueness",
      "performance",
      "editability",
    ]);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("fills only determinism/performance from a mechanical bench measurement", () => {
    const receipt = computeStudioBrushQualityReceiptSkeleton("crayon", {
      planOk: true,
      planElapsedMs: 90,
      planBudgetMs: 450,
      planDigestFirst: "0a0a0a0a",
      planDigestSecond: "0a0a0a0a",
    });
    expect(receipt.determinismScore).toBe(1);
    expect(receipt.performanceScore).toBeCloseTo(0.8, 10);
    expect(receipt.textureScore).toBeNull();
    expect(receipt.totalScore).toBeNull();
    expect(receipt.measuredAxes).toEqual(["determinism", "performance"]);
    expect(receipt.pendingAxes).toEqual([
      "texture",
      "dynamics",
      "edge",
      "uniqueness",
      "editability",
    ]);
  });

  it("scores diverging digests 0 and missing digests as unmeasured", () => {
    const diverged = computeStudioBrushQualityReceiptSkeleton("crayon", {
      planOk: true,
      planElapsedMs: 10,
      planBudgetMs: 450,
      planDigestFirst: "0a0a0a0a",
      planDigestSecond: "0b0b0b0b",
    });
    expect(diverged.determinismScore).toBe(0);

    const unmeasured = computeStudioBrushQualityReceiptSkeleton("highlighter", {
      planOk: true,
      planElapsedMs: 10,
      planBudgetMs: 450,
      planDigestFirst: null,
      planDigestSecond: null,
    });
    expect(unmeasured.determinismScore).toBeNull();
    expect(unmeasured.performanceScore).not.toBeNull();
    expect(unmeasured.pendingAxes).toContain("determinism");
  });

  it("measures nothing from a failed plan or an invalid budget", () => {
    const failedPlan = computeStudioBrushQualityReceiptSkeleton("crayon", {
      planOk: false,
      planElapsedMs: 10,
      planBudgetMs: 450,
      planDigestFirst: "0a0a0a0a",
      planDigestSecond: "0a0a0a0a",
    });
    expect(failedPlan.determinismScore).toBeNull();
    expect(failedPlan.performanceScore).toBeNull();
    expect(failedPlan.measuredAxes).toEqual([]);

    const invalidBudget = computeStudioBrushQualityReceiptSkeleton("crayon", {
      planOk: true,
      planElapsedMs: 10,
      planBudgetMs: 0,
      planDigestFirst: null,
      planDigestSecond: null,
    });
    expect(invalidBudget.performanceScore).toBeNull();
  });

  it("clamps over-budget plans to 0 instead of going negative", () => {
    const receipt = computeStudioBrushQualityReceiptSkeleton("crayon", {
      planOk: true,
      planElapsedMs: 900,
      planBudgetMs: 450,
      planDigestFirst: null,
      planDigestSecond: null,
    });
    expect(receipt.performanceScore).toBe(0);
  });

  it("certifies fully measured receipts with the weighted total and rejects fabricated inputs", () => {
    const scores: Record<StudioBrushQualityAxis, number> = {
      texture: 0.9,
      dynamics: 0.8,
      edge: 0.7,
      determinism: 1,
      uniqueness: 0.6,
      performance: 0.5,
      editability: 0.4,
    };
    const receipt = certifyStudioBrushQualityReceipt("crayon", scores);
    expect(receipt.status).toBe("certified");
    expect(receipt.pendingAxes).toEqual([]);
    expect(receipt.measuredAxes.length).toBe(7);
    expect(receipt.totalScore).toBeCloseTo(
      0.9 * 0.4 + 0.8 * 0.15 + 0.7 * 0.1 + 1 * 0.1 + 0.6 * 0.1 + 0.5 * 0.1 + 0.4 * 0.05,
      10,
    );
    expect(Object.isFrozen(receipt)).toBe(true);

    expect(() =>
      certifyStudioBrushQualityReceipt("crayon", { ...scores, texture: 1.2 }),
    ).toThrowError(/texture/u);
    expect(() =>
      certifyStudioBrushQualityReceipt("crayon", {
        ...scores,
        determinism: Number.NaN,
      }),
    ).toThrowError(/determinism/u);
  });
});
