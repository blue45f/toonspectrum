import { providerDescriptorSchema } from "@toonspectrum/studio-engine-registry";
import { describe, expect, it } from "vitest";

import { velloGpuBrowserProviderDescriptor } from "../descriptor";
import {
  fuzzyMismatchPct,
  hasWebGpu,
  loadVelloGpuBrowser,
  probeWebGpu,
  renderSceneToPixelsGpu,
} from "../gpu-browser";

import type { SceneIR } from "@toonspectrum/studio-project-model";

/**
 * Node-side contract of the browser WebGPU lane (ADR-0011 lane 2): without
 * `navigator.gpu` every entry point must fail loudly (or report gracefully) —
 * never silently downgrade — and the committed pkg-gpu artifact must stay
 * loadable as a module. The real-browser parity run lives in
 * gpu-browser-probe.test.ts (opt-in, VELLO_GPU_BROWSER_PROBE=1).
 */

describe("vello gpu-browser lane — WebGPU-absent contract (node)", () => {
  it("this test environment has no WebGPU (precondition for the contract below)", () => {
    expect(hasWebGpu()).toBe(false);
  });

  it("loadVelloGpuBrowser rejects with an explicit WebGPU error, not a hang or silent no-op", async () => {
    await expect(loadVelloGpuBrowser()).rejects.toThrow(/WebGPU is unavailable/);
    await expect(loadVelloGpuBrowser()).rejects.toThrow(
      /remains unavailable until the caller explicitly selects another provider/,
    );
  });

  it("probeWebGpu resolves supported:false with a concrete reason (graceful skip surface)", async () => {
    const probe = await probeWebGpu();
    expect(probe.supported).toBe(false);
    if (!probe.supported) {
      expect(probe.reason).toMatch(/navigator\.gpu missing/);
    }
  });

  it("renderSceneToPixelsGpu without init fails loudly", async () => {
    const scene: SceneIR = {
      version: 11,
      width: 8,
      height: 8,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes: [],
    };
    await expect(renderSceneToPixelsGpu(scene)).rejects.toThrow(
      /call loadVelloGpuBrowser\(\) first/,
    );
  });
});

describe("pkg-gpu artifact loadability", () => {
  it("the committed wasm-pack glue parses and exposes the GPU entry points", async () => {
    const module = await import(
      "../../../../crates/studio-engine-vello/pkg-gpu/studio_engine_vello.js"
    );
    expect(typeof module.default).toBe("function");
    expect(typeof module.render_scene_gpu_json).toBe("function");
    expect(typeof module.probe_webgpu).toBe("function");
    // The gpu artifact embeds the identical vello_cpu pin as the parity
    // reference (compareGpuVsCpu contract).
    expect(typeof module.render_scene_json).toBe("function");
  });
});

describe("local δ48 fuzzy diff (same metric as cross-renderer-diff)", () => {
  const width = 4;
  const height = 4;

  function solid(r: number, g: number, b: number): Uint8Array {
    const pixels = new Uint8Array(width * height * 4);
    for (let p = 0; p < width * height; p += 1) {
      pixels[p * 4] = r;
      pixels[p * 4 + 1] = g;
      pixels[p * 4 + 2] = b;
      pixels[p * 4 + 3] = 255;
    }
    return pixels;
  }

  it("identical buffers mismatch 0%", () => {
    expect(fuzzyMismatchPct(solid(10, 20, 30), solid(10, 20, 30), width, height)).toBe(0);
  });

  it("within-δ48 tonal drift mismatches 0%", () => {
    expect(fuzzyMismatchPct(solid(10, 20, 30), solid(58, 20, 30), width, height)).toBe(0);
  });

  it("a one-pixel edge shift is forgiven by the 3×3 neighborhood", () => {
    const a = solid(0, 0, 0);
    const b = solid(0, 0, 0);
    // Vertical white edge at x=1 in a, at x=2 in b (sub-pixel AA phase model).
    for (let y = 0; y < height; y += 1) {
      a[(y * width + 1) * 4] = 255;
      b[(y * width + 2) * 4] = 255;
    }
    expect(fuzzyMismatchPct(a, b, width, height)).toBe(0);
  });

  it("structural divergence trips the metric symmetrically (extra ink either side)", () => {
    const base = solid(0, 0, 0);
    const withInk = solid(0, 0, 0);
    // Isolated bright pixel far from any matching neighbor.
    withInk[0] = 255;
    const forward = fuzzyMismatchPct(base, withInk, width, height);
    const backward = fuzzyMismatchPct(withInk, base, width, height);
    expect(forward).toBeGreaterThan(0);
    expect(backward).toBe(forward);
  });

  it("rejects mismatched buffer sizes instead of clamping quietly", () => {
    expect(() =>
      fuzzyMismatchPct(solid(0, 0, 0), new Uint8Array(4), width, height),
    ).toThrow(/size mismatch/);
  });
});

describe("vello-gpu-browser descriptor", () => {
  it("passes schema validation without declaring an automatic fallback", () => {
    const parsed = providerDescriptorSchema.parse(velloGpuBrowserProviderDescriptor);
    expect(parsed.id).toBe("vello-gpu-browser");
    expect(parsed.runtime).toBe("webgpu");
    expect(parsed.maturity).toBe("experimental");
    expect(parsed).not.toHaveProperty("fallbackProviderId");
    expect(parsed.capabilities).toContain("render.gpu.webgpu");
    // The GPU lane must not claim the deterministic-export capability the CPU
    // reference lane owns.
    expect(parsed.capabilities).not.toContain("export.deterministic");
    expect(parsed.determinism).toBe("tolerance");
  });

  it("spells out the WebGPU precondition as a limitation (registry-auditable)", () => {
    expect(
      velloGpuBrowserProviderDescriptor.limitations.some((limitation) =>
        limitation.includes("navigator.gpu"),
      ),
    ).toBe(true);
  });
});
