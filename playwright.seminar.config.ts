import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: ["engineering-seminar.spec.ts"],
  fullyParallel: false, forbidOnly: Boolean(process.env.CI), retries: 0, workers: 1,
  timeout: 90_000, expect: { timeout: 20_000 }, reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:5319", browserName: "chromium", channel: process.env.CI ? undefined : "chrome", locale: "ko-KR", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5319 --strictPort",
    env: { TOONSPECTRUM_VITE_CACHE_DIR: "node_modules/.cache/seminar-e2e" },
    url: "http://127.0.0.1:5319", reuseExistingServer: false, timeout: 120_000,
  },
});
