import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MEMORY_THRESHOLDS,
  analyzeMemoryConvergence,
  parseGitStatusReceipt,
  parseSoakMinutes,
  theilSenSlopeMiBPerHour,
  type RssSample,
} from "./soak";

function samplesFor(
  hours: number,
  count: number,
  rssAt: (hoursElapsed: number, renders: number) => number,
  rendersPerHour = 181_935,
): RssSample[] {
  return Array.from({ length: count }, (_, index) => {
    const hoursElapsed = (index / (count - 1)) * hours;
    const renders = Math.round(hoursElapsed * rendersPerHour);
    return {
      elapsedMs: hoursElapsed * 60 * 60 * 1_000,
      rssMiB: rssAt(hoursElapsed, renders),
      renders,
    };
  });
}

describe("soak memory convergence", () => {
  it("accepts a curve matching the passing 8-hour allocator plateau", () => {
    const samples = samplesFor(8, 193, (hours) => {
      if (hours < 0.75) return 225 + 167 * Math.sin((hours / 0.75) * Math.PI);
      return 299 + Math.max(0, hours - 0.75) * 5.4 + Math.sin(hours * 3) * 0.8;
    });

    const result = analyzeMemoryConvergence(samples);

    expect(result.pass).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.slopeEstimator).toBe("theil-sen-median-pairwise");
    expect(result.slopeEstimatorMaximumPoints).toBe(256);
    expect(result.lateWindowDeltaEstimator).toBe(
      "median-second-half-minus-median-first-half",
    );
    expect(result.postWarmupSlopeMiBPerHour).toBeGreaterThan(5);
    expect(result.postWarmupSlopeMiBPerHour).toBeLessThan(6);
    expect(result.lateWindowSlopeMiBPerHour).toBeLessThan(
      DEFAULT_MEMORY_THRESHOLDS.maximumLateWindowSlopeMiBPerHour,
    );
    expect(result.maximumGrowthFromFirstMiB).toBeGreaterThan(160);
    expect(result.maximumGrowthFromFirstMiB).toBeLessThan(192);
  });

  it("reliably rejects a 64 KiB/render linear leak", () => {
    const samples = samplesFor(
      8,
      193,
      (_hours, renders) => 225 + (renders * 64) / 1024,
    );

    const result = analyzeMemoryConvergence(samples);

    expect(result.pass).toBe(false);
    expect(result.slopeKiBPerRender).toBeCloseTo(64, 6);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("post-warmup RSS slope"),
        expect.stringContaining("late-window RSS slope"),
        expect.stringContaining("maximum RSS growth"),
        expect.stringContaining("KiB/render"),
      ]),
    );
  });

  it("uses a robust median slope instead of fitting a transient outlier", () => {
    const samples = samplesFor(4, 97, (hours) => 240 + hours * 2);
    samples[62] = { ...samples[62]!, rssMiB: samples[62]!.rssMiB + 120 };

    expect(theilSenSlopeMiBPerHour(samples)).toBeCloseTo(2, 8);
    expect(analyzeMemoryConvergence(samples).pass).toBe(true);
  });

  it("rejects insufficient and non-monotonic evidence", () => {
    const insufficient = analyzeMemoryConvergence([
      { elapsedMs: 0, rssMiB: 200, renders: 0 },
      { elapsedMs: 1_000, rssMiB: 201, renders: 2 },
    ]);
    expect(insufficient.pass).toBe(false);
    expect(insufficient.reasons).toContain("memory sample count 2 is below 12");

    const malformed = samplesFor(2, 24, (hours) => 200 + hours);
    malformed[12] = { ...malformed[12]!, elapsedMs: malformed[11]!.elapsedMs };
    const result = analyzeMemoryConvergence(malformed);
    expect(result.pass).toBe(false);
    expect(result.reasons[0]).toContain("monotonic");
  });

  it("validates threshold configuration", () => {
    expect(() =>
      analyzeMemoryConvergence([], {
        ...DEFAULT_MEMORY_THRESHOLDS,
        warmupFraction: 1,
      }),
    ).toThrow(/warmupFraction/u);
  });
});

describe("soak evidence inputs", () => {
  it("loads only Node-compatible runtime modules instead of browser WESL barrels", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./soak.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toContain('import("@toonspectrum/studio-engine-skia")');
    expect(source).not.toContain('import("@toonspectrum/studio-engine-vello")');
    expect(source).toContain(
      'import("../../../packages/studio-engine-skia/src/render.ts")',
    );
    expect(source).toContain(
      'import("../../../packages/studio-engine-vello/src/render.ts")',
    );
  });

  it.each(["1440", "480", "0.25"])("accepts finite positive SOAK_MINUTES=%s", (raw) => {
    expect(parseSoakMinutes(raw)).toBe(Number(raw));
  });

  it.each(["0", "-1", "NaN", "Infinity", ""])("rejects SOAK_MINUTES=%j", (raw) => {
    expect(() => parseSoakMinutes(raw)).toThrow(
      "SOAK_MINUTES must be a finite number greater than zero",
    );
  });

  it("distinguishes tracked and untracked scoped git status records", () => {
    const receipt = parseGitStatusReceipt(
      "1 .M N... 100644 100644 100644 abc abc tests/benchmarks/harness/soak.ts\0" +
        "? crates/studio-engine-vello/pkg/untracked.wasm\0",
    );

    expect(receipt).toEqual({
      format: "porcelain-v2-z",
      untrackedFiles: "all",
      clean: false,
      records: [
        "1 .M N... 100644 100644 100644 abc abc tests/benchmarks/harness/soak.ts",
        "? crates/studio-engine-vello/pkg/untracked.wasm",
      ],
      trackedRecordCount: 1,
      untrackedRecordCount: 1,
    });
    expect(parseGitStatusReceipt("").clean).toBe(true);
  });
});
