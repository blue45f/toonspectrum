import { describe, expect, it } from "vitest";

import {
  STUDIO_MARKETPLACE_COMPATIBILITY_VERSION,
  probeStudioMarketplaceRuntimeCompatibility,
} from "./studio-marketplace-runtime-compatibility";

describe("Studio marketplace runtime compatibility", () => {
  it("publishes a compatibility authority independent from the application package version", () => {
    expect(STUDIO_MARKETPLACE_COMPATIBILITY_VERSION).toBe("1.0.0");
  });

  it("admits only engines proven by actual contexts and a WebGPU adapter", async () => {
    const context = await probeStudioMarketplaceRuntimeCompatibility({
      probeCanvasContext: (contextId) => contextId === "2d" || contextId === "webgl2",
      probeWebGpuAdapter: async () => true,
    });

    expect(context).toEqual({
      currentStudioVersion: "1.0.0",
      supportedEngines: ["canvas2d", "webgl2", "webgpu", "three"],
    });
  });

  it("keeps a thrown adapter probe unverified instead of guessing unsupported", async () => {
    const context = await probeStudioMarketplaceRuntimeCompatibility({
      probeCanvasContext: (contextId) => contextId === "2d",
      probeWebGpuAdapter: async () => {
        throw new Error("adapter denied");
      },
    });

    expect(context).toEqual({
      currentStudioVersion: "1.0.0",
      supportedEngines: null,
    });
  });

  it("preserves an explicit unmeasured engine state outside a browser runtime", async () => {
    const context = await probeStudioMarketplaceRuntimeCompatibility({
      probeCanvasContext: () => null,
      probeWebGpuAdapter: async () => null,
    });

    expect(context).toEqual({
      currentStudioVersion: "1.0.0",
      supportedEngines: null,
    });
  });

  it("does not mislabel a partial engine probe as a complete unsupported decision", async () => {
    const context = await probeStudioMarketplaceRuntimeCompatibility({
      probeCanvasContext: () => true,
      probeWebGpuAdapter: async () => null,
    });

    expect(context).toEqual({
      currentStudioVersion: "1.0.0",
      supportedEngines: null,
    });
  });
});
