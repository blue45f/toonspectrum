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

  it("calculates the known least-squares slope in bytes per hour", () => {
    expect(heapSlopeBytesPerHour([
      sample(10, 200), sample(40, 204), sample(70, 208),
    ])).toBe(8 * MiB);
  });

  it("retains zero-slope policy behavior before a time window exists", () => {
    expect(heapSlopeBytesPerHour([])).toBe(0);
    expect(heapSlopeBytesPerHour([sample(10, 200)])).toBe(0);
    expect(heapSlopeBytesPerHour([sample(10, 200), sample(10, 220)])).toBe(0);
  });

  it.each([
    { baselineMiB: 200, allowanceMiB: 96 },
    { baselineMiB: 400, allowanceMiB: 140 },
  ])("preserves the absolute allowance boundary for $baselineMiB MiB baseline", ({ baselineMiB, allowanceMiB }) => {
    const baseline = sample(10, baselineMiB);
    const atLimit = sample(20, baselineMiB + allowanceMiB);
    expect(evaluateStudioSoakHeapGrowth([baseline, atLimit])).toMatchObject({
      allowanceBytes: allowanceMiB * MiB,
      absoluteExceeded: false,
      slopeExceeded: false,
    });
    expect(evaluateStudioSoakHeapGrowth([
      baseline, { ...atLimit, usedBytes: atLimit.usedBytes + 1 },
    ])?.absoluteExceeded).toBe(true);
  });

  it.each([
    {
      name: "fewer than four samples",
      samples: [sample(0, 200), sample(180, 230), sample(360, 260)],
      slopeExceeded: false,
    },
    {
      name: "less than thirty minutes",
      samples: [sample(0, 200), sample(9, 220), sample(18, 240), sample(27, 260)],
      slopeExceeded: false,
    },
    {
      name: "less than forty-eight MiB growth",
      samples: [sample(0, 200), sample(10, 215), sample(20, 230), sample(30, 245)],
      slopeExceeded: false,
    },
    {
      name: "exactly eight MiB per hour",
      samples: [sample(0, 200), sample(120, 216), sample(240, 232), sample(360, 248)],
      slopeExceeded: false,
    },
    {
      name: "four samples, thirty minutes, forty-eight MiB growth above slope budget",
      samples: [sample(0, 200), sample(10, 216), sample(20, 232), sample(30, 248)],
      slopeExceeded: true,
    },
  ])("preserves the slope failure boundary: $name", ({ samples, slopeExceeded }) => {
    expect(evaluateStudioSoakHeapGrowth(samples)).toMatchObject({
      absoluteExceeded: false,
      slopeExceeded,
    });
  });
});
