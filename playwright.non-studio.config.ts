import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["atelier-public-polish.spec.ts", "non-studio-experience.spec.ts", "non-studio-controls.spec.ts", "non-studio-search-layout.spec.ts", "creator-flagship.spec.ts", "open-creation.spec.ts", "production-risk-intelligence.spec.ts", "learn.spec.ts", "learn-resilience.spec.ts", "learn-guided-lessons.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/non-studio-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5209",
    browserName: "chromium",
    locale: "ko-KR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 5209 --strictPort",
    url: "http://127.0.0.1:5209",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
