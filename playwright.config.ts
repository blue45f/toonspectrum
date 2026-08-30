import { defineConfig, devices } from "@playwright/test";

/**
 * Studio E2E. Two shapes share this config: the Hybrid DCC industrial harness page, and the 3D
 * surface suites that drive the full Studio shell and judge real rendered frames.
 */
const SOFTWARE_GPU_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

/**
 * Which Chromium to drive, in precedence order:
 *
 *   1. `PLAYWRIGHT_EXECUTABLE_PATH` — a pinned build supplied by the image.
 *   2. `PLAYWRIGHT_CHANNEL`, including the empty string, which selects Playwright's own bundled
 *      Chromium. That is what CI wants: the workflow runs `playwright install chromium`, which
 *      installs the bundled build and not Google Chrome, so a `chrome` channel would not resolve.
 *   3. `chrome` — the historical default, kept because Playwright's bundled Chromium fails to
 *      spawn (errno -88) on some local and agent images.
 */
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";

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
        // Headless CI machines have no GPU, and the 3D suites assert on real rendered frames.
        // ANGLE over SwiftShader gives a conformant software WebGL2, which is what the BG3D and
        // VRM surfaces fall back to in browsers without WebGPU anyway.
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? {
              // Sandboxed CI/agent images ship one pinned Chromium build whose revision may not
              // match this Playwright version — point PLAYWRIGHT_EXECUTABLE_PATH at it to skip
              // channel lookup.
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
    command: "pnpm exec vite --host 127.0.0.1 --port 5199 --strictPort",
    url: "http://127.0.0.1:5199/hybrid-dcc-e2e.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
