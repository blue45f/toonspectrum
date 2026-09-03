import { defineConfig, devices } from "@playwright/test";

const PORT = 5_221;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SOFTWARE_GPU_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-environment-matrix.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 8 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report/qa-matrix" }],
  ],
  outputDir: "test-results/qa-matrix",
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { args: SOFTWARE_GPU_ARGS },
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${BASE_URL}/studio`,
  },
});
