import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-workspace-arrangement.spec.ts",
  timeout: 90_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.STUDIO_WORKSPACE_BASE_URL ?? "http://127.0.0.1:5194",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "test-results/workspace-arrangement",
});
