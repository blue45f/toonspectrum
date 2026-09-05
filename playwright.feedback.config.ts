import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "feedback-community*.spec.ts",
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "artifacts/feedback/browser-results.json" }]],
  use: { baseURL: "http://127.0.0.1:5198", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "pnpm exec vite --config vite.feedback-review.config.ts --host 127.0.0.1 --port 5198 --strictPort",
    url: "http://127.0.0.1:5198/e2e/feedback-community.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
