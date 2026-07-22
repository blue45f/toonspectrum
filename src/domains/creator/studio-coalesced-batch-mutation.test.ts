import { describe, expect, it } from "vitest";

import { shouldOwnStudioCoalescedBatchDraft } from "./studio-coalesced-batch-mutation";

const base = {
  authoritativeSampleCount: 4,
  gpuPinned: false,
  fixedRateFilterActive: false,
  immediateCausalInput: false,
  directInkSurfaceActive: false,
  directStampSurfaceActive: false,
};

describe("studio coalesced batch mutation", () => {
  it("owns one mutable batch for an asynchronous WebGPU suffix feed", () => {
    expect(shouldOwnStudioCoalescedBatchDraft({ ...base, gpuPinned: true })).toBe(true);
  });

  it("does not duplicate the fixed-rate filter's existing owned-array optimization", () => {
    expect(shouldOwnStudioCoalescedBatchDraft({
      ...base,
      gpuPinned: true,
      fixedRateFilterActive: true,
    })).toBe(false);
  });

  it("keeps immediate non-overlay brushes to one clone per browser delivery", () => {
    expect(shouldOwnStudioCoalescedBatchDraft({
      ...base,
      immediateCausalInput: true,
    })).toBe(true);
    expect(shouldOwnStudioCoalescedBatchDraft({
      ...base,
      immediateCausalInput: true,
      directInkSurfaceActive: true,
    })).toBe(false);
  });

  it("does not allocate an owned batch when no authoritative sample arrived", () => {
    expect(shouldOwnStudioCoalescedBatchDraft({
      ...base,
      authoritativeSampleCount: 0,
      gpuPinned: true,
    })).toBe(false);
  });
});
