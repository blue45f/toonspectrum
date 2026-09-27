import { defineConfig } from "@playwright/test";

const externalBase = process.env.STUDIO_3D_JOURNEY_BASE_URL;
const port = Number(process.env.STUDIO_3D_JOURNEY_PORT ?? 5315);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-3d-mobile-authoring.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  outputDir: "test-results/studio-mobile-authoring",
  reporter: [["list"], ["json", { outputFile: "test-results/studio-mobile-authoring/results.json" }]],
  use: {
    baseURL: externalBase ?? `http://127.0.0.1:${port}`,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    headless: true,
    locale: "ko-KR",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [
    { name: "small-phone", use: { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true } },
    { name: "phone", use: { viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true } },
    { name: "landscape", use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false } },
  ],
  webServer: externalBase ? undefined : {
    command: `pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/studio/character`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
