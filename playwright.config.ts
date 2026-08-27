import { defineConfig, devices } from "@playwright/test";

/**
 * Hybrid DCC industrial E2E — lightweight harness page, not full Studio shell.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5199",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Sandboxed CI/agent images ship one pinned Chromium build whose revision may not match
        // this Playwright version — point PLAYWRIGHT_EXECUTABLE_PATH at it to skip channel lookup.
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
          : {
              // Prefer system Chrome when Playwright's bundled Chromium fails to spawn (errno -88).
              channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
            }),
      },
    },
  ],
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 5199 --strictPort",
    url: "http://127.0.0.1:5199/hybrid-dcc-e2e.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
