import { defineConfig } from "@playwright/test";

const external = process.env.STUDIO_3D_REFERENCE_URL;
const port = 5_249;
export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-3d-reference-workspace.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  outputDir: "test-results/studio-3d-reference",
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 960 },
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: external ? undefined : {
    command: `pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/studio/character`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
