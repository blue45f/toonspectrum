import { PERF_BUDGET_TEST_FILES } from "./vitest.perf-budget-files.mjs";

// These exhaustive CPU reference simulations compare geometry and replay bytes, not time.
// V8 instrumentation made the unchanged cases exceed the 30s test timeout in CI; a single
// cap-crossing replay took 372s. Without instrumentation all 47 tests pass in 28s locally.
// Keep every sample, digest and tolerance in the mandatory serial lane, separate from the
// elapsed-time budget catalogue. All other deterministic tests stay in the covered root suite.
export const CPU_REFERENCE_TEST_FILES = Object.freeze([
  "apps/web/src/domains/creator/brush/studio-oil-ribbon-carrier.incremental.test.ts",
  "apps/web/src/domains/creator/live/studio-live-wet-ink-overlay.test.ts",
  "tests/visual/living-ink-fluid-quality.test.ts",
]);

export const SERIAL_TEST_FILES = Object.freeze([
  ...PERF_BUDGET_TEST_FILES,
  ...CPU_REFERENCE_TEST_FILES,
].sort());
