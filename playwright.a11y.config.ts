import { defineConfig, devices } from "@playwright/test";

const PORT = 5_216;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "accessibility-smoke.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:" + PORT,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.CI ? {} : { channel: "chrome" as const }),
      },
    },
  ],
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port " + PORT + " --strictPort",
    url: "http://127.0.0.1:" + PORT + "/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
