import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:5388";
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-assets-layout.spec.ts",
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    ...(channel ? { channel } : {}),
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // Exercise this checkout's CSS chunks, never a reused development server.
  webServer: {
    command: "pnpm exec vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 5388 --strictPort",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
