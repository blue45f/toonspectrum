import { defineConfig } from "@playwright/test";
/** Local administrator UI fixtures. Actual SQL behavior has a separate Postgres suite. */
export default defineConfig({
  testDir: "e2e", testMatch: "operation-policy.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:4184", browserName: "chromium", headless: true, trace: "retain-on-failure" },
  outputDir: "artifacts/operation-policy-browser",
  webServer: {
    command: "node node_modules/vite/bin/vite.js --config vite.admin.config.ts --host 127.0.0.1 --port 4184 --strictPort",
    url: "http://127.0.0.1:4184", reuseExistingServer: false, timeout: 30_000,
  },
});
