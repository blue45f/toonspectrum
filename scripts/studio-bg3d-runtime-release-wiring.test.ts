import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(require.resolve(path), "utf8");
const scripts = (JSON.parse(read("../package.json")) as {
  scripts: Record<string, string>;
}).scripts;

describe("BG3D release runtime gate wiring", () => {
  it("routes the release alias to the strict production gate, not the skippable dev suite", () => {
    expect(scripts["verify:studio-bg3d-webgpu-rotation"]).toBe(
      "STUDIO_BG3D_WEBGPU_GIZMO=1 playwright test --config=playwright.bg3d-runtime.config.ts",
    );
    expect(read("../.github/workflows/ci.yml"))
      .toContain("pnpm run verify:studio-bg3d-webgpu-rotation");
  });

  it("preserves the original optional developer command separately", () => {
    expect(scripts["verify:studio-bg3d-webgpu-rotation:dev"]).toBe(
      "STUDIO_BG3D_WEBGPU_GIZMO=1 playwright test e2e/studio-3d-visual-verification.spec.ts --grep 'WebGPU 기즈모 연속 회전'",
    );
  });

  it("keeps the independent gate read-only and requires a real browser result", () => {
    const workflow = read("../.github/workflows/bg3d-runtime-regression.yml");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("continue-on-error: true");
    expect(workflow).toContain("pnpm exec playwright test --config=playwright.bg3d-runtime.config.ts");
    expect(workflow).toContain("set -euo pipefail");
  });
});
