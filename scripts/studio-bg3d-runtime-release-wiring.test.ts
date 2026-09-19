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
    expect(read("../.github/workflows/main-full-qa-studio.yml"))
      .toContain("pnpm run verify:studio-bg3d-webgpu-rotation");
  });

  it("preserves the original optional developer command separately", () => {
    expect(scripts["verify:studio-bg3d-webgpu-rotation:dev"]).toBe(
      "STUDIO_BG3D_WEBGPU_GIZMO=1 playwright test e2e/studio-3d-visual-verification.spec.ts --grep 'WebGPU 기즈모 연속 회전'",
    );
  });

  it("keeps the exhaustive gate read-only and requires a real browser result", () => {
    const workflow = read("../.github/workflows/main-full-qa-studio.yml");
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("continue-on-error: true");
    expect(workflow).toContain("pnpm run verify:studio-bg3d-webgpu-rotation");
    expect(workflow).toContain("set -euo pipefail");
    expect(workflow).toContain("local status=${PIPESTATUS[0]}");
    expect(workflow).toContain('if [[ -s "$output_dir/failures.txt" ]]');
    expect(workflow).toContain("exit 1");
  });
});
