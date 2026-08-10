import { describe, expect, it } from "vitest";

import { velloGpuBrowserProviderDescriptor } from "../descriptor";
import { hasWebGpu } from "../gpu-browser";
import { LottieRenderError, renderLottieToPixelsGpu } from "../lottie";

/**
 * Node-side contract of the Velato Lottie lane (ADR-0011 Velato lane):
 * without `navigator.gpu` and with invalid inputs every entry point must fail
 * loudly with a typed error — never resolve a silent blank frame — and the
 * committed pkg-gpu artifact (built with `--features lottie`) must expose the
 * lottie entry point. The real-browser render run lives in
 * lottie-browser-probe.test.ts (opt-in, VELLO_LOTTIE_BROWSER_PROBE=1).
 */

const MINIMAL_LOTTIE = JSON.stringify({
  v: "5.7.4",
  fr: 60,
  ip: 0,
  op: 60,
  w: 16,
  h: 16,
  layers: [],
});

describe("velato lottie lane — input and WebGPU-absent contract (node)", () => {
  it("this test environment has no WebGPU (precondition for the contract below)", () => {
    expect(hasWebGpu()).toBe(false);
  });

  it("rejects a non-finite frame before touching wasm, with the typed error", async () => {
    await expect(
      renderLottieToPixelsGpu(MINIMAL_LOTTIE, Number.NaN, 16, 16),
    ).rejects.toMatchObject({
      name: "LottieRenderError",
      code: "lottie-frame-out-of-range",
    });
  });

  it("rejects degenerate or fractional target sizes before touching wasm", async () => {
    for (const [width, height] of [
      [0, 16],
      [16, 0],
      [-4, 16],
      [16.5, 16],
    ] as const) {
      await expect(
        renderLottieToPixelsGpu(MINIMAL_LOTTIE, 0, width, height),
      ).rejects.toMatchObject({
        name: "LottieRenderError",
        code: "lottie-invalid-size",
      });
    }
  });

  it("rejects with an explicit WebGPU error, not a hang or silent no-op", async () => {
    await expect(renderLottieToPixelsGpu(MINIMAL_LOTTIE, 0, 16, 16)).rejects.toThrow(
      /WebGPU is unavailable/,
    );
  });

  it("LottieRenderError carries code + reason in its message", () => {
    const error = new LottieRenderError("lottie-parse-failed", "boom");
    expect(error.message).toContain("lottie-parse-failed");
    expect(error.message).toContain("boom");
    expect(error.code).toBe("lottie-parse-failed");
    expect(error.reason).toBe("boom");
  });
});

describe("pkg-gpu artifact carries the lottie lane", () => {
  it("the committed wasm-pack glue exposes render_lottie_gpu_json", async () => {
    const module = await import(
      "../../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js"
    );
    expect(typeof module.render_lottie_gpu_json).toBe("function");
    // The lottie feature is a strict superset of the gpu feature — the
    // SceneIR GPU lane must still be present in the same artifact.
    expect(typeof module.render_scene_gpu_json).toBe("function");
    expect(typeof module.render_scene_json).toBe("function");
  });
});

describe("vello-gpu-browser descriptor declares the lottie capability", () => {
  it("adds render.lottie.frame without disturbing the existing GPU claims", () => {
    expect(velloGpuBrowserProviderDescriptor.capabilities).toContain(
      "render.lottie.frame",
    );
    expect(velloGpuBrowserProviderDescriptor.capabilities).toContain(
      "render.gpu.webgpu",
    );
    expect(velloGpuBrowserProviderDescriptor.version).toContain("velato 0.11.0");
  });

  it("spells out the velato subset as a limitation (registry-auditable)", () => {
    expect(
      velloGpuBrowserProviderDescriptor.limitations.some((limitation) =>
        limitation.includes("velato 0.11"),
      ),
    ).toBe(true);
  });
});
