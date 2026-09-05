import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  assertBg3dSampleSurface,
  createBg3dCompositorSampler,
  type Bg3dSampleSurface,
} from "../e2e/studio-bg3d-compositor-sampler";

import type { Page } from "@playwright/test";

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
    expect(source).toContain("stableIntervals < 2 || settleMs > SETTLE_TIMEOUT_MS");
    expect(source).toContain("page.locator(CANVAS).screenshot()");
    expect(source).toContain("expect(referenceDelta,");
  });
});

const SURFACE: Bg3dSampleSurface = {
  x: 50, y: 50, width: 876, height: 766, cssWidth: 876, cssHeight: 766,
  bufferWidth: 876, bufferHeight: 766, viewportWidth: 1440, viewportHeight: 1000, dpr: 1,
};
function samplerHost() {
  const evaluate = vi.fn(async () => ({ ...SURFACE }));
  const send = vi.fn(async () => ({ data: Buffer.from("unaltered-native-png").toString("base64") }));
  const detach = vi.fn(async () => undefined);
  const page = {
    locator: () => ({ evaluate }),
    context: () => ({ newCDPSession: async () => ({ send, detach }) }),
  } as unknown as Page;
  return { page, evaluate, send, detach };
}

describe("BG3D compositor sampler", () => {
  it("captures original surface bytes and releases its CDP session exactly once", async () => {
    const host = samplerHost();
    const sampler = await createBg3dCompositorSampler(host.page, "canvas");
    const sample = await sampler.capture();
    expect(sample.png.toString()).toBe("unaltered-native-png");
    expect(host.send).toHaveBeenCalledExactlyOnceWith("Page.captureScreenshot", {
      format: "png", fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
      clip: { x: 50, y: 50, width: 876, height: 766, scale: 1 },
    });
    await sampler.dispose();
    await sampler.dispose();
    expect(host.detach).toHaveBeenCalledOnce();
    await expect(sampler.capture()).rejects.toThrow("disposed");
  });

  it.each([
    { x: -1 }, { width: 0 }, { width: 1400 }, { bufferWidth: 0 }, { dpr: 2 }, { x: NaN },
  ])("refuses an invalid or clipped surface %j", (patch) => {
    expect(() => assertBg3dSampleSurface({ ...SURFACE, ...patch })).toThrow();
  });

  it("refuses drift between observations", () => {
    expect(() => assertBg3dSampleSurface(SURFACE, SURFACE)).not.toThrow();
    expect(() => assertBg3dSampleSurface({ ...SURFACE, x: 51 }, SURFACE)).toThrow("changed");
  });

  it("rejects a resize during the native screenshot", async () => {
    const host = samplerHost();
    host.evaluate.mockResolvedValueOnce(SURFACE).mockResolvedValueOnce(SURFACE)
      .mockResolvedValueOnce({ ...SURFACE, bufferWidth: 900 });
    const sampler = await createBg3dCompositorSampler(host.page, "canvas");
    try {
      await expect(sampler.capture()).rejects.toThrow("changed");
    } finally {
      await sampler.dispose();
    }
    expect(host.detach).toHaveBeenCalledOnce();
  });

  it("does not turn a native screenshot failure into reusable success", async () => {
    const host = samplerHost();
    host.send.mockRejectedValueOnce(new Error("compositor unavailable"));
    const sampler = await createBg3dCompositorSampler(host.page, "canvas");
    try {
      await expect(sampler.capture()).rejects.toThrow("compositor unavailable");
    } finally {
      await sampler.dispose();
    }
    expect(host.detach).toHaveBeenCalledOnce();
  });
});
