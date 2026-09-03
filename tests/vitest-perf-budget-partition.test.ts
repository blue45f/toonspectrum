import { existsSync, readFileSync } from "node:fs";
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
    const notTimed = PERF_BUDGET_TEST_FILES.filter(
      (file) => !readFileSync(path.join(root, file), "utf8").includes("performance.now("),
    );
    expect(notTimed, "no performance.now() — this belongs in the main run").toEqual([]);
  });

  it("keeps the list sorted so additions diff cleanly", () => {
    expect([...PERF_BUDGET_TEST_FILES]).toEqual([...PERF_BUDGET_TEST_FILES].sort());
  });

  it("does not list itself or any other partition bookkeeping", () => {
    expect(PERF_BUDGET_TEST_FILES.some((file) => file.startsWith("tests/"))).toBe(false);
  });
});
