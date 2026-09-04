import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PERF_BUDGET_TEST_FILES } from "../vitest.perf-budget-files.mjs";

const root = path.resolve(import.meta.dirname, "..");

/**
 * The perf-budget partition is a list of file paths, and a list of paths drifts the moment a
 * file is renamed or a budget assertion is dropped. This pins the two facts the partition
 * depends on: every entry is a real test file, and every entry actually times something —
 * otherwise a deterministic test would be quietly moved out of the parallel run for no reason,
 * or a renamed budget test would fall back into the main run and start flaking again.
 */
describe("wall-clock budget partition", () => {
  it("lists only files that exist", () => {
    const missing = PERF_BUDGET_TEST_FILES.filter((file) => !existsSync(path.join(root, file)));
    expect(missing, "renamed or deleted — update vitest.perf-budget-files.mjs").toEqual([]);
  });

  it("lists only files that measure wall-clock time", () => {
    // Two ways to time: call the clock, or reach it through studio-perf-calibration, which owns
    // performance.now() for every calibrated budget. Looking only for the literal call is what
    // left four calibrated-budget files in the parallel run until one of them reddened main.
    const notTimed = PERF_BUDGET_TEST_FILES.filter((file) => {
      const source = readFileSync(path.join(root, file), "utf8");
      return !source.includes("performance.now(")
        && !source.includes("evaluateStudioCalibrated");
    });
    expect(
      notTimed,
      "neither performance.now() nor a calibrated budget — this belongs in the main run",
    ).toEqual([]);
  });

  it("does not leave a calibrated-budget file behind in the parallel run", () => {
    // The partition is a hand-maintained list, and the failure mode is silent: a new calibrated
    // budget lands in the main run, passes on a quiet machine, and reddens main weeks later.
    const brushDir = path.join(root, "src/domains/creator/brush");
    const stragglers = readdirSync(brushDir)
      .filter((name) => name.endsWith(".test.ts"))
      .filter((name) =>
        readFileSync(path.join(brushDir, name), "utf8").includes("evaluateStudioCalibrated"))
      .map((name) => `src/domains/creator/brush/${name}`)
      .filter((file) => !PERF_BUDGET_TEST_FILES.includes(file));

    expect(stragglers, "add these to vitest.perf-budget-files.mjs").toEqual([]);
  });

  it("keeps the list sorted so additions diff cleanly", () => {
    expect([...PERF_BUDGET_TEST_FILES]).toEqual([...PERF_BUDGET_TEST_FILES].sort());
  });

  it("does not list itself or any other partition bookkeeping", () => {
    expect(PERF_BUDGET_TEST_FILES.some((file) => file.startsWith("tests/"))).toBe(false);
  });
});
