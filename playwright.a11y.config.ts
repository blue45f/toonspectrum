import { defineConfig, devices } from "@playwright/test";

const A11Y_PORT = Number(process.env.TOONSPECTRUM_A11Y_PORT ?? "5228");
const baseURL = `http://127.0.0.1:${A11Y_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "a11y-smoke.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "ko-KR",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port ${A11Y_PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
