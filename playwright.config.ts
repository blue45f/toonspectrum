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

const BG3D_WEBGPU_GIZMO_GATE = process.env.STUDIO_BG3D_WEBGPU_GIZMO === "1";
const STUDIO_E2E_PORT = BG3D_WEBGPU_GIZMO_GATE ? 5_207 : 5_199;
const BG3D_WEBGPU_GIZMO_ARGS = process.platform === "darwin"
  ? ["--no-sandbox", "--enable-unsafe-webgpu", "--use-gpu-in-tests"]
  : [
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--enable-features=CDPScreenshotNewSurface,Vulkan",
      "--use-vulkan=swiftshader",
      "--use-webgpu-adapter=swiftshader",
      "--use-gpu-in-tests",
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
    baseURL: `http://127.0.0.1:${STUDIO_E2E_PORT}`,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Headless CI machines have no GPU, and the 3D suites assert on real rendered frames.
        // ANGLE over SwiftShader gives a conformant software WebGL2. Since ADR-0018 nothing falls
        // back to it on its own: the specs select WebGL2 explicitly, as an artist without WebGPU
        // would, and WebGPU-only cases run in the separate STUDIO_BG3D_WEBGPU_GIZMO lane.
        ...(BG3D_WEBGPU_GIZMO_GATE
          ? {
              // The rotation accumulation exists only while TransformControls keeps the WebGPU
              // compositor live. Darwin uses its native Metal adapter; GPU-less Linux CI uses the
              // same headed Dawn/ANGLE SwiftShader policy as verify:studio-3d-console.
              channel: "chromium" as const,
              headless: false,
              launchOptions: { args: BG3D_WEBGPU_GIZMO_ARGS },
            }
          : process.env.PLAYWRIGHT_EXECUTABLE_PATH
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
    command: `pnpm exec vite --host 127.0.0.1 --port ${STUDIO_E2E_PORT} --strictPort`,
    url: `http://127.0.0.1:${STUDIO_E2E_PORT}/hybrid-dcc-e2e.html`,
    // The dedicated red/green oracle must serve this checkout, never a long-lived local Vite
    // process whose module graph may predate the framebuffer fix. Its separate port also lets the
    // ordinary visual suite keep the convenient local reuse policy.
    reuseExistingServer: !BG3D_WEBGPU_GIZMO_GATE && !process.env.CI,
    timeout: 120_000,
  },
});
