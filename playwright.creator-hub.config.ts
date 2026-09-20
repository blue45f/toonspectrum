import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.CREATOR_HUB_E2E_PORT ?? 4218);

// Isolated UI tests with explicit API fixtures; never target production.
export default defineConfig({
  testDir: "./e2e", testMatch: ["creator-hub.spec.ts", "creator-meeting.spec.ts"], workers: 1,
  fullyParallel: false, forbidOnly: Boolean(process.env.CI), retries: 0,
  timeout: 60000, expect: { timeout: 20000 }, reporter: "list",
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: `./node_modules/.bin/vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120000 },
});
