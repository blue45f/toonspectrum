import { describe, expect, it } from "vitest";

import {
  planStudioScene3dResidency,
  StudioScene3dResidencyPolicyError,
} from "./studio-scene3d-residency-policy";

describe("Studio Scene3D residency policy", () => {
  it("never evicts visible, selected, or pinned assets even under pressure", () => {
    const plan = planStudioScene3dResidency({
      budgetBytes: 100,
      candidates: [
        {
          assetId: "visible",
          estimatedGpuBytes: 80,
          visibleRefCount: 1,
          selectedRefCount: 0,
          pinCount: 0,
          lastUsedOrdinal: 1,
        },
        {
          assetId: "selected",
          estimatedGpuBytes: 50,
          visibleRefCount: 0,
          selectedRefCount: 1,
          pinCount: 0,
          lastUsedOrdinal: 2,
        },
        {
          assetId: "warm",
          estimatedGpuBytes: 10,
          visibleRefCount: 0,
          selectedRefCount: 0,
          pinCount: 0,
          lastUsedOrdinal: 3,
        },
      ],
    });

    expect(plan.residentAssetIds).toEqual(["selected", "visible"]);
    expect(plan.evictAssetIds).toEqual(["warm"]);
    expect(plan.requiredBytes).toBe(130);
    expect(plan.overBudgetBytes).toBe(30);
  });

  it("keeps optional assets by priority, recency, then stable id", () => {
    const plan = planStudioScene3dResidency({
      budgetBytes: 50,
      candidates: [
        {
          assetId: "old-high-priority",
          estimatedGpuBytes: 30,
          visibleRefCount: 0,
          selectedRefCount: 0,
          pinCount: 0,
          lastUsedOrdinal: 1,
          prefetchPriority: 2,
        },
        {
          assetId: "new-normal",
          estimatedGpuBytes: 30,
          visibleRefCount: 0,
          selectedRefCount: 0,
          pinCount: 0,
          lastUsedOrdinal: 99,
          prefetchPriority: 1,
        },
        {
          assetId: "small-normal",
          estimatedGpuBytes: 20,
          visibleRefCount: 0,
          selectedRefCount: 0,
          pinCount: 0,
          lastUsedOrdinal: 98,
          prefetchPriority: 1,
        },
      ],
    });

    expect(plan.residentAssetIds).toEqual(["old-high-priority", "small-normal"]);
    expect(plan.evictAssetIds).toEqual(["new-normal"]);
    expect(plan.plannedResidentBytes).toBe(50);
  });

  it("rejects duplicate or unbounded accounting inputs", () => {
    expect(() => planStudioScene3dResidency({
      budgetBytes: -1,
      candidates: [],
    })).toThrowError(expect.objectContaining({ code: "invalid-budget" }));

    expect(() => planStudioScene3dResidency({
      budgetBytes: 100,
      candidates: [
        {
          assetId: "same",
          estimatedGpuBytes: 10,
          visibleRefCount: 0,
          selectedRefCount: 0,
          pinCount: 0,
          lastUsedOrdinal: 0,
        },
        {
          assetId: "same",
          estimatedGpuBytes: 10,
          visibleRefCount: 0,
          selectedRefCount: 0,
          pinCount: 0,
          lastUsedOrdinal: 1,
        },
      ],
    })).toThrowError(expect.objectContaining({ code: "duplicate-asset" }));

    expect(() => planStudioScene3dResidency({
      budgetBytes: 100,
      candidates: [{
        assetId: "bad",
        estimatedGpuBytes: Number.NaN,
        visibleRefCount: 0,
        selectedRefCount: 0,
        pinCount: 0,
        lastUsedOrdinal: 0,
      }],
    })).toThrow(StudioScene3dResidencyPolicyError);
  });
});
