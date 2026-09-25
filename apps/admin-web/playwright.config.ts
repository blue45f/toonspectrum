import { defineConfig } from "@playwright/test";

/** Local administrator UI fixtures. Actual SQL behavior has a separate Postgres suite. */
export default defineConfig({
  testDir: "tests",
  testMatch: "operation-policy.e2e.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4184",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  outputDir: "../../artifacts/operation-policy-browser",
  webServer: {
    command: "pnpm exec vite --config vite.config.ts --host 127.0.0.1 --port 4184 --strictPort",
    url: "http://127.0.0.1:4184",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
