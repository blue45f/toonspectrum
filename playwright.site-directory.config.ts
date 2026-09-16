import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "site-directory-health.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 12 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/site-directory-health.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5216",
    locale: "ko-KR",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "./node_modules/.bin/vite --host 127.0.0.1 --port 5216 --strictPort",
    url: "http://127.0.0.1:5216/sitemap",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "ignore",
  },
});
