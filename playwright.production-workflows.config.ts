import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "production-workflows.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: ".qa/production-workflows/results",
  reporter: [["list"], ["json", { outputFile: ".qa/production-workflows/results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5347",
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5347 --strictPort",
    url: "http://127.0.0.1:5347",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
