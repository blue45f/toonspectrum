import { defineConfig } from "@playwright/test";

// Video capture is not a WebGL/3D test. Do not inherit the DCC suite's forced
// SwiftShader rasterizer: it turns canvas readback into a software-GPU bottleneck.
const port = Number(process.env.STUDIO_PROMO_E2E_PORT ?? 5353);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid promo E2E port");
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /studio-promo(?:-render-quality)?\.spec\.ts/u,
  outputDir: process.env.STUDIO_PROMO_E2E_OUTPUT ?? "test-results/promo",
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: Boolean(process.env.CI),
  timeout: 180_000, expect: { timeout: 30_000 }, reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${port}`, headless: true, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: {
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
      : channel ? { channel } : {}),
  } }],
  webServer: {
    command: "node tools/serve-studio-promo-e2e.mjs",
    url: `http://127.0.0.1:${port}/tools/browser-harnesses/promo-e2e.html`,
    reuseExistingServer: false, timeout: 120_000,
  },
});
