import { describe, expect, it } from "vitest";

import { planStudioWebGpuResidentAssetBudget } from "./studio-webgpu-resident-asset-budget";

describe("Studio WebGPU resident asset budget planner", () => {
  it("keeps resident requirements pinned and reports cache hits without eviction", () => {
    expect(planStudioWebGpuResidentAssetBudget({
      maximumResidentBytes: 12,
      entries: [
        { key: "tip:a", byteLength: 4, lastUsed: 1 },
        { key: "grain:a", byteLength: 4, lastUsed: 2 },
      ],
      requirements: [
        { key: "tip:a", byteLength: 4 },
        { key: "grain:a", byteLength: 4 },
      ],
    })).toEqual({
      status: "ready",
      evictKeys: [],
      residentBytesBefore: 8,
      residentBytesAfterEviction: 8,
      residentBytesAfterPlan: 8,
      cacheHitBytes: 8,
      uploadBytes: 0,
    });
  });

  it("evicts the least-recently-used unpinned entry with a deterministic key tie-break", () => {
    expect(planStudioWebGpuResidentAssetBudget({
      maximumResidentBytes: 8,
      entries: [
        { key: "tip:b", byteLength: 4, lastUsed: 3 },
        { key: "tip:a", byteLength: 4, lastUsed: 3 },
      ],
      requirements: [{ key: "tip:c", byteLength: 4 }],
    })).toEqual({
      status: "ready",
      evictKeys: ["tip:a"],
      residentBytesBefore: 8,
      residentBytesAfterEviction: 4,
      residentBytesAfterPlan: 8,
      cacheHitBytes: 0,
      uploadBytes: 4,
    });
  });

  it("never evicts a required resident entry even when an older tick would choose it", () => {
    expect(planStudioWebGpuResidentAssetBudget({
      maximumResidentBytes: 8,
      entries: [
        { key: "tip:required", byteLength: 4, lastUsed: 1 },
        { key: "tip:cold", byteLength: 4, lastUsed: 2 },
      ],
      requirements: [
        { key: "tip:required", byteLength: 4 },
        { key: "tip:new", byteLength: 4 },
      ],
    })).toEqual({
      status: "ready",
      evictKeys: ["tip:cold"],
      residentBytesBefore: 8,
      residentBytesAfterEviction: 4,
      residentBytesAfterPlan: 8,
      cacheHitBytes: 4,
      uploadBytes: 4,
    });
  });

  it("deduplicates identical requirements before reserving upload bytes", () => {
    expect(planStudioWebGpuResidentAssetBudget({
      maximumResidentBytes: 4,
      entries: [],
      requirements: [
        { key: "tip:a", byteLength: 4 },
        { key: "tip:a", byteLength: 4 },
      ],
    })).toEqual({
      status: "ready",
      evictKeys: [],
      residentBytesBefore: 0,
      residentBytesAfterEviction: 0,
      residentBytesAfterPlan: 4,
      cacheHitBytes: 0,
      uploadBytes: 4,
    });
  });

  it("fails closed on conflicting identities, sizes, and impossible requirements", () => {
    expect(planStudioWebGpuResidentAssetBudget({
      maximumResidentBytes: 8,
      entries: [
        { key: "tip:a", byteLength: 4, lastUsed: 1 },
        { key: "tip:a", byteLength: 4, lastUsed: 2 },
      ],
      requirements: [],
    })).toEqual({ status: "rejected", reason: "duplicate-entry" });

    expect(planStudioWebGpuResidentAssetBudget({
      maximumResidentBytes: 8,
      entries: [],
      requirements: [
        { key: "tip:a", byteLength: 4 },
        { key: "tip:a", byteLength: 5 },
      ],
    })).toEqual({ status: "rejected", reason: "requirement-size-conflict" });

    expect(planStudioWebGpuResidentAssetBudget({
      maximumResidentBytes: 8,
      entries: [{ key: "tip:a", byteLength: 4, lastUsed: 1 }],
      requirements: [{ key: "tip:a", byteLength: 5 }],
    })).toEqual({
      status: "rejected",
      reason: "entry-requirement-size-mismatch",
    });

    expect(planStudioWebGpuResidentAssetBudget({
      maximumResidentBytes: 3,
      entries: [],
      requirements: [{ key: "tip:a", byteLength: 4 }],
    })).toEqual({ status: "rejected", reason: "requirement-too-large" });
  });
});
