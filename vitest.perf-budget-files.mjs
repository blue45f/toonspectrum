// Test files whose assertions bound a wall-clock measurement (performance.now() deltas).
//
// These run in their own Vitest pass, after the main suite and one file at a time
// (vitest.perf.config.ts). Inside the main run they compete with four workers spread over
// ~2,900 files, and then they measure the machine rather than the code: the bristle-physics
// budget passed 20/20 on a quiet machine and failed 12% of the time under load on the very same
// commit, and the live-overlay 30ms budget went red twice in one day with no change to the
// code it times. Sequencing them behind the main run removes the competition without touching
// a single threshold — every budget in these files stays exactly as tight as it was.
//
// Add a file here when a test times a code path with performance.now() and asserts on the
// elapsed value. Do not add tests that assert on counts, geometry or output bytes — those are
// deterministic and belong in the main run. vitest.perf-budget-partition.test.ts pins that
// every entry exists and really times something.
export const PERF_BUDGET_TEST_FILES = Object.freeze([
  "src/domains/creator/brush/studio-brush-stamp-engine.test.ts",
  "src/domains/creator/brush/studio-dry-media-long-stroke-regression.test.ts",
  "src/domains/creator/brush/studio-oil-ribbon-carrier.bristle-physics.test.ts",
  "src/domains/creator/brush/studio-perf-budget-calibration.test.ts",
  "src/domains/creator/brush/studio-wet-edge-bloom-v1.test.ts",
  "src/domains/creator/brush/studio-wet-ribbon-carrier.test.ts",
  "src/domains/creator/live/studio-live-dynamic-brush-overlay.test.ts",
  "src/domains/creator/studio-impasto-relief-shading-v1.perf.test.ts",
  "src/domains/creator/studio-living-ink-provider.test.ts",
  "src/domains/creator/studio-living-ink-settled-bake-v1.test.ts",
]);
