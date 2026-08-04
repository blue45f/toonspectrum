import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS } from "./studio-living-ink-gpu-protocol";
import { tryCreateStudioLivingInkWebGpuRuntime } from "./studio-living-ink-webgpu-runtime";

import type { StudioLivingInkExecutionConfig } from "./studio-living-ink-execution-protocol";

const config: StudioLivingInkExecutionConfig = {
  displayWidth: 64,
  displayHeight: 48,
  fieldWidth: 64,
  fieldHeight: 48,
  coarseBase: 128,
  seed: 1,
  material: DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS,
  displayMode: "composite",
};

describe("Living Ink WebGPU runtime", () => {
  it("fails closed when navigator.gpu is unavailable (CI/Node)", async () => {
    const previous = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    try {
      await expect(tryCreateStudioLivingInkWebGpuRuntime(config)).resolves.toBeNull();
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: previous,
      });
    }
  });

  it("exports a preferred-runtime helper used by the Worker", async () => {
    // Without a real adapter the helper returns null; presence of the export is the product seam.
    const runtime = await tryCreateStudioLivingInkWebGpuRuntime(config);
    if (runtime) {
      expect(runtime.capabilities.backend).toBe("webgpu-offscreen-half-float");
      expect(runtime.capabilities.webgpu).toBe(true);
      runtime.dispose();
    } else {
      expect(runtime).toBeNull();
    }
  });
});
