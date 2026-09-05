import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

/**
 * Dedicated production runtime verification. The base suite remains a convenient dev-server
 * suite; this gate must not compile thousands of Vite modules while SwiftShader is being sampled.
 * Run after build:bundle with STUDIO_BG3D_WEBGPU_GIZMO=1 so the base config selects headed WebGPU.
 */
if (process.env.STUDIO_BG3D_WEBGPU_GIZMO !== "1") {
  throw new Error("BG3D runtime verification requires STUDIO_BG3D_WEBGPU_GIZMO=1.");
}
if (!existsSync("dist/index.html")) {
  throw new Error("Missing production build. Run pnpm run build:bundle before the BG3D runtime gate.");
}

const port = 5_207;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...baseConfig,
  testMatch: "studio-3d-visual-verification.spec.ts",
  grep: /WebGPU 기즈모 연속 회전은 이전 실루엣을 누적하지 않는다/u,
  retries: 0,
  workers: 1,
  outputDir: "test-results/bg3d-runtime",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/bg3d-runtime", open: "never" }],
    ["json", { outputFile: "test-results/bg3d-runtime-results.json" }],
    ["./scripts/studio-bg3d-runtime-reporter.ts"],
  ],
  use: {
    ...baseConfig.use,
    baseURL,
    screenshot: "only-on-failure",
    // retries is deliberately zero; on-first-retry would never record anything. Avoid automatic
    // trace screenshots during the sampling loop, but keep DOM/network/timing evidence on failure.
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true, sources: true },
  },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/`,
    // The dev-only harness HTML is not an appropriate readiness URL for a production preview.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
