import { describe, expect, it } from "vitest";

import { STUDIO_PAINT_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import {
  STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS,
  STUDIO_BRUSH_QUALITY_WEIGHTS,
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
    // Snapshot of the derived group COUNT only (never the content): 64 medium families + 14 pro
    // pack categories over the 295-preset paint SSOT. This number moves ONLY with a deliberate
    // catalogue change (new preset family, new engine-lane base, or a new pro-pack category);
    // update it in the same change that lands the catalogue rows, citing that change.
    const groups = buildStudioBrushVariantGroups();
    expect(groups.length).toBe(78);
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
    // (2026-08-13 brush quality wave: dry-stamp x4, wet-texture x4, oil x3).
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
    ]);
    for (const experimentalId of STUDIO_BRUSH_EXPERIMENTAL_LANE_PRESET_IDS) {
      expect(resolveStudioBrushLifecycleStage(experimentalId), experimentalId)
        .toBe("experimental");
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
