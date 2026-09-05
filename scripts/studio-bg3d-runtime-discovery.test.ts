import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const filename = "studio-bg3d-production-rotation.runtime.ts";
const config = readFileSync(new URL("../playwright.bg3d-runtime.config.ts", import.meta.url), "utf8");
const runtimeUrl = new URL(`../e2e/${filename}`, import.meta.url);

/** The strict hardware gate is explicit, not an unconditional extra case in headless WebGL runs. */
describe("BG3D hardware gate discovery", () => {
  it("is collected explicitly by the production config, outside normal spec/test suffixes", () => {
    expect(config).toContain(`testMatch: "${filename}"`);
    expect(existsSync(runtimeUrl)).toBe(true);
    expect(filename).not.toMatch(/\.(?:spec|test)\.[cm]?[jt]sx?$/u);
    expect(existsSync(new URL("../e2e/studio-bg3d-production-rotation.spec.ts", import.meta.url)))
      .toBe(false);
  });

  it("keeps real rotation and fatal-error assertions and contains no skip path", () => {
    const source = readFileSync(runtimeUrl, "utf8");
    expect(source).toContain('test("WebGPU 기즈모 연속 회전은 이전 실루엣을 누적하지 않는다"');
    expect(source).not.toMatch(/\btest\.(?:skip|fixme|fail)\s*\(/u);
    expect(source).toContain("expect(finalPeakTileDelta).toBeLessThan(8)");
    expect(source).toContain("internalDelta < 2");
    expect(source).toContain("expect(fatal).toEqual([])");
    expect(source).toContain("const SETTLE_TIMEOUT_MS = 15_000");
  });
});
