import { defineConfig, devices } from "@playwright/test";

// Isolated UI tests with explicit API fixtures; never target production.
export default defineConfig({
  testDir: "./e2e", testMatch: "creator-hub.spec.ts", workers: 1,
  fullyParallel: false, forbidOnly: Boolean(process.env.CI), retries: 0,
  timeout: 60000, expect: { timeout: 20000 }, reporter: "list",
  use: { baseURL: "http://127.0.0.1:4218", headless: true, screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "pnpm exec vite --host 127.0.0.1 --port 4218 --strictPort",
    url: "http://127.0.0.1:4218", reuseExistingServer: false, timeout: 120000 },
});
