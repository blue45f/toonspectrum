import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "kmas-references.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "reference-playwright-report", open: "never" }]],
  outputDir: "reference-test-results",
  use: { baseURL: "http://127.0.0.1:4174", locale: "ko-KR", reducedMotion: "reduce", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: "pnpm exec vite preview --host 127.0.0.1 --port 4174", url: "http://127.0.0.1:4174", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
