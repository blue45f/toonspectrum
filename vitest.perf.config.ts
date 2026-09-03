import { configDefaults, defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";
import { PERF_BUDGET_TEST_FILES } from "./vitest.perf-budget-files.mjs";

// The wall-clock budget pass. `pnpm test` runs it after the main suite has finished, so the
// only thing on the machine is this one worker walking these files in order. The main config
// excludes the same list (it imports PERF_BUDGET_TEST_FILES), which is what keeps a file from
// being timed twice — once under load and once quietly — and reporting two different answers.
//
// This is deliberately not mergeConfig(): that concatenates `include` and `exclude`, and the
// whole point here is to replace both.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [...PERF_BUDGET_TEST_FILES],
    exclude: [...configDefaults.exclude],
    // One file at a time, one worker. The budgets in these files are single-digit to
    // low-hundreds of milliseconds; a sibling worker's transform or GC pause is bigger than
    // most of them.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
