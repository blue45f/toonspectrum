import { describe, expect, it } from "vitest";

import {
  evaluateStudioSoakHeapGrowth,
  heapSlopeBytesPerHour,
} from "./studio-memory-growth-policy.mjs";

const MiB = 1024 * 1024;
const minute = 60_000;

function sample(atMinutes, usedMiB) {
  return { atMs: atMinutes * minute, usedBytes: usedMiB * MiB };
}

describe("Studio soak heap growth policy", () => {
  it("keeps a plateauing post-GC heap below both gates", () => {
    const samples = [
      sample(10, 200), sample(20, 220), sample(30, 225),
      sample(40, 223), sample(50, 224),
    ];
    const result = evaluateStudioSoakHeapGrowth(samples, samples[0]);
    expect(result).toMatchObject({ absoluteExceeded: false, slopeExceeded: false });
  });

  it("detects sustained slow growth before the absolute allowance is exhausted", () => {
    const samples = [
      sample(10, 200), sample(20, 212), sample(30, 225),
      sample(40, 238), sample(50, 251),
    ];
    const result = evaluateStudioSoakHeapGrowth(samples, samples[0]);
    expect(result?.absoluteExceeded).toBe(false);
    expect(result?.slopeExceeded).toBe(true);
    expect(heapSlopeBytesPerHour(samples)).toBeGreaterThan(8 * MiB);
  });

  it("fails the absolute post-GC growth gate for a large retained heap jump", () => {
    const samples = [sample(10, 200), sample(20, 310)];
    const result = evaluateStudioSoakHeapGrowth(samples, samples[0]);
    expect(result?.absoluteExceeded).toBe(true);
  });
});
