import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const selected = process.env.TOONSPECTRUM_RECOVERED_EXPERIMENT;
const cpuExperiments = ["inkwash-parity", "ink-field", "painttube-ab"] as const;
if (process.env.TOONSPECTRUM_RECOVERED_OPT_IN !== "1"
  || !cpuExperiments.some((name) => name === selected)) {
  throw new Error("Use run.mts --run <CPU experiment>; this suite never runs implicitly.");
}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../../apps/web/src", import.meta.url)) } },
  test: {
    root,
    include: [`scripts/experiments/recovered-20260908/${selected}.experiment.ts`],
    environment: "node",
    setupFiles: [fileURLToPath(new URL("../../../vitest.setup.ts", import.meta.url))],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: { enabled: false },
  },
});
