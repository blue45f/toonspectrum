import { describe, expect, it } from "vitest";

import { StudioLivingInkWebGpuPureRuntime } from "./studio-living-ink-webgpu-pure-runtime";
import { listStudioLivingInkWgslPassSources } from "./studio-living-ink-wgsl-shaders";

describe("studio-living-ink-webgpu-pure-runtime", () => {
  it("exposes tryCreate and depends on the pure WGSL pass library", () => {
    expect(typeof StudioLivingInkWebGpuPureRuntime.tryCreate).toBe("function");
    expect(listStudioLivingInkWgslPassSources().map((p) => p.id)).toContain("display");
  });

  it("returns null without WebGPU in node test environment", async () => {
    const result = await StudioLivingInkWebGpuPureRuntime.tryCreate({
      displayWidth: 32,
      displayHeight: 32,
      fieldWidth: 32,
      fieldHeight: 32,
      coarseBase: 128,
      seed: 1,
      material: {
        brushSizeCells: 8,
        flow: 0.5,
        bleed: 0.5,
        dryRate: 0.2,
        chromaticSeparation: 0.1,
        brushPigmentLoad: 0.5,
        capillaryCreep: 0.3,
        vorticity: 0.1,
        dryingEdgeDeposition: 0.4,
        wetOnWetMixing: 0.5,
        glazeOverFixed: 0.1,
        paperFiber: 0.4,
        paperTooth: 0.4,
        granulation: 0.3,
        edgeDarkening: 0.4,
        wetSheen: 0.2,
        vignette: 0.1,
        beerLambertDensity: 0.8,
      },
      displayMode: "composite",
    } as never);
    // Node vitest has no navigator.gpu → pure runtime unavailable
    expect(result).toBeNull();
  });
});
