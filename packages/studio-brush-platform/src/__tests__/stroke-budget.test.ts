import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_STROKE_BUDGET,
  isWithinStrokeFrameBudget,
  planStrokeAcceptedPrefixChunks,
  resolveStrokeDabCapacity,
  STUDIO_CAUSAL_WATERCOLOR_DAB_RESIDENT_BYTES,
  STUDIO_DYNAMIC_BRUSH_DAB_RESIDENT_BYTES,
  STUDIO_STROKE_BUDGET_PROFILES,
} from "../index";

describe("resolveStrokeDabCapacity", () => {
  it("reproduces the shipped dab caps exactly (behavior-neutral pin)", () => {
    expect(
      resolveStrokeDabCapacity({
        budget: DEFAULT_STUDIO_STROKE_BUDGET,
        bytesPerDab: STUDIO_DYNAMIC_BRUSH_DAB_RESIDENT_BYTES,
      }),
    ).toBe(32_768);
    expect(
      resolveStrokeDabCapacity({
        budget: DEFAULT_STUDIO_STROKE_BUDGET,
        bytesPerDab: STUDIO_CAUSAL_WATERCOLOR_DAB_RESIDENT_BYTES,
      }),
    ).toBe(32_768);
  });

  it("defaults to the lite profile and scales with the profile", () => {
    expect(DEFAULT_STUDIO_STROKE_BUDGET).toBe(
      STUDIO_STROKE_BUDGET_PROFILES["webgpu-worker-lite"],
    );
    expect(
      resolveStrokeDabCapacity({
        budget: STUDIO_STROKE_BUDGET_PROFILES["pro-webgpu-worker"],
        bytesPerDab: STUDIO_DYNAMIC_BRUSH_DAB_RESIDENT_BYTES,
      }),
    ).toBe(131_072);
    expect(
      resolveStrokeDabCapacity({
        budget: STUDIO_STROKE_BUDGET_PROFILES["cpu-reference"],
        bytesPerDab: STUDIO_DYNAMIC_BRUSH_DAB_RESIDENT_BYTES,
      }),
    ).toBe(8_192);
  });

  it("floors and never returns less than one dab", () => {
    const tiny = { ...DEFAULT_STUDIO_STROKE_BUDGET, maxResidentBytes: 300 };
    expect(resolveStrokeDabCapacity({ budget: tiny, bytesPerDab: 128 })).toBe(2);
    expect(resolveStrokeDabCapacity({ budget: tiny, bytesPerDab: 4_096 })).toBe(1);
    expect(resolveStrokeDabCapacity({ budget: tiny, bytesPerDab: 0 })).toBe(300);
    expect(
      resolveStrokeDabCapacity({ budget: tiny, bytesPerDab: Number.NaN }),
    ).toBe(300);
    expect(
      resolveStrokeDabCapacity({
        budget: { ...tiny, maxResidentBytes: Number.NaN },
        bytesPerDab: 128,
      }),
    ).toBe(1);
  });
});

describe("planStrokeAcceptedPrefixChunks", () => {
  it("splits a long accepted prefix without dropping samples", () => {
    const plan = planStrokeAcceptedPrefixChunks({
      totalSamples: 100_000,
      capacity: 32_768,
      policy: "chunk",
    });
    expect(plan.chunkCount).toBe(4);
    expect(plan.chunkSizes).toEqual([32_768, 32_768, 32_768, 1_696]);
    expect(plan.chunkSizes.reduce((sum, size) => sum + size, 0)).toBe(100_000);
    expect(plan.degraded).toBe(false);
    expect(plan.checkpointEvery).toBeUndefined();
  });

  it("checkpoint splits identically and reports the checkpoint interval", () => {
    const chunked = planStrokeAcceptedPrefixChunks({
      totalSamples: 100_000,
      capacity: 32_768,
      policy: "chunk",
    });
    const checkpointed = planStrokeAcceptedPrefixChunks({
      totalSamples: 100_000,
      capacity: 32_768,
      policy: "checkpoint",
    });
    expect(checkpointed.chunkSizes).toEqual(chunked.chunkSizes);
    expect(checkpointed.degraded).toBe(false);
    expect(checkpointed.checkpointEvery).toBe(32_768);
  });

  it("degrade truncates to one chunk and flags the loss", () => {
    expect(
      planStrokeAcceptedPrefixChunks({
        totalSamples: 100_000,
        capacity: 32_768,
        policy: "degrade",
      }),
    ).toEqual({ chunkCount: 1, chunkSizes: [32_768], degraded: true });
    expect(
      planStrokeAcceptedPrefixChunks({
        totalSamples: 1_000,
        capacity: 32_768,
        policy: "degrade",
      }),
    ).toEqual({ chunkCount: 1, chunkSizes: [1_000], degraded: false });
  });

  it("handles empty prefixes, exact multiples and malformed input", () => {
    expect(
      planStrokeAcceptedPrefixChunks({
        totalSamples: 0,
        capacity: 32_768,
        policy: "chunk",
      }),
    ).toEqual({ chunkCount: 0, chunkSizes: [], degraded: false });
    expect(
      planStrokeAcceptedPrefixChunks({
        totalSamples: 65_536,
        capacity: 32_768,
        policy: "chunk",
      }).chunkSizes,
    ).toEqual([32_768, 32_768]);
    expect(
      planStrokeAcceptedPrefixChunks({
        totalSamples: 5,
        capacity: 0,
        policy: "chunk",
      }).chunkSizes,
    ).toEqual([1, 1, 1, 1, 1]);
    expect(
      planStrokeAcceptedPrefixChunks({
        totalSamples: Number.NaN,
        capacity: 4,
        policy: "chunk",
      }),
    ).toEqual({ chunkCount: 0, chunkSizes: [], degraded: false });
  });
});

describe("isWithinStrokeFrameBudget", () => {
  const budget = DEFAULT_STUDIO_STROKE_BUDGET;

  it("accepts work at the limit and rejects anything past it", () => {
    expect(
      isWithinStrokeFrameBudget({
        budget,
        samplesThisFrame: budget.maxSamplesPerFrame,
        dirtyTiles: budget.maxDirtyTiles,
        elapsedMs: budget.maxCommitWorkMs,
      }),
    ).toBe(true);
    expect(
      isWithinStrokeFrameBudget({
        budget,
        samplesThisFrame: budget.maxSamplesPerFrame + 1,
        dirtyTiles: 0,
        elapsedMs: 0,
      }),
    ).toBe(false);
    expect(
      isWithinStrokeFrameBudget({
        budget,
        samplesThisFrame: 0,
        dirtyTiles: budget.maxDirtyTiles + 1,
        elapsedMs: 0,
      }),
    ).toBe(false);
    expect(
      isWithinStrokeFrameBudget({
        budget,
        samplesThisFrame: 0,
        dirtyTiles: 0,
        elapsedMs: budget.maxCommitWorkMs + 0.5,
      }),
    ).toBe(false);
  });

  it("fails closed on non-finite measurements", () => {
    expect(
      isWithinStrokeFrameBudget({
        budget,
        samplesThisFrame: Number.NaN,
        dirtyTiles: 0,
        elapsedMs: 0,
      }),
    ).toBe(false);
    expect(
      isWithinStrokeFrameBudget({
        budget,
        samplesThisFrame: 0,
        dirtyTiles: 0,
        elapsedMs: Number.POSITIVE_INFINITY,
      }),
    ).toBe(false);
  });
});
