import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

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
  // The ordinary visual suite may skip unavailable hosts. The strict counterpart waits for a
  // positive runtime state and never mistakes a transient UI deadline for unavailable hardware.
  testMatch: "studio-bg3d-production-rotation.spec.ts",
  grep: /WebGPU 기즈모 연속 회전은 이전 실루엣을 누적하지 않는다/u,
  retries: 0,
  workers: 1,
  globalSetup: "./scripts/studio-bg3d-runtime-setup.mts",
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
    trace: { mode: "on", screenshots: false, snapshots: true, sources: true },
  },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
