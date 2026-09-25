import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.STUDIO_WEB_AUTHORING_E2E_PORT ?? 5_231);
const SOFTWARE_GPU_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-3d-web-authoring-v3.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? {
              launchOptions: {
                executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
                args: SOFTWARE_GPU_ARGS,
              },
            }
          : {
              ...(CHANNEL ? { channel: CHANNEL } : {}),
              launchOptions: { args: SOFTWARE_GPU_ARGS },
            }),
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/studio/character`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
