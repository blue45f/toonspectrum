import { describe, expect, it, vi } from "vitest";

import { loadStudioBg3dBabylonRuntimeBindings } from "./studio-bg3d-babylon-specialist-entry";

import type { StudioBg3dBabylonEngineSettings } from "./studio-bg3d-babylon-specialist-runtime";

const constructors = vi.hoisted(() => ({ webgl: vi.fn(), webgpu: vi.fn() }));

vi.mock("@babylonjs/core/Engines/engine", () => ({
  Engine: class {
    dispose = vi.fn();
    constructor(...args: unknown[]) { constructors.webgl(...args); }
  },
}));
vi.mock("@babylonjs/core/Engines/webgpuEngine", () => ({
  WebGPUEngine: class {
    _device = { lost: new Promise<unknown>(() => undefined) };
    dispose = vi.fn();
    initAsync = vi.fn().mockResolvedValue(undefined);
    constructor(...args: unknown[]) { constructors.webgpu(...args); }
  },
}));

const settings: StudioBg3dBabylonEngineSettings = {
  antialias: true, adaptToDeviceRatio: true, deterministicLockstep: true,
  failIfMajorPerformanceCaveat: false, lockstepMaxSteps: 4, timeStepSeconds: 1 / 60,
  powerPreference: "high-performance", preserveDrawingBuffer: false, premultipliedAlpha: false, stencil: true,
};

describe("Babylon production texture color conversion", () => {
  it("passes exact sRGB conversion to both real engine construction boundaries", async () => {
    const bindings = await loadStudioBg3dBabylonRuntimeBindings();
    const canvas = {} as HTMLCanvasElement;
    const webgl = bindings.createWebGlEngine(canvas, settings);
    const registerPartialEngine = vi.fn();
    const webgpu = await bindings.createWebGpuEngine(canvas, settings, {
      signal: new AbortController().signal, registerPartialEngine,
    });
    try {
      expect(constructors.webgl).toHaveBeenCalledWith(canvas, true,
        expect.objectContaining({ useExactSrgbConversions: true, premultipliedAlpha: false }));
      expect(constructors.webgpu).toHaveBeenCalledWith(canvas,
        expect.objectContaining({ useExactSrgbConversions: true, premultipliedAlpha: false }));
      expect(registerPartialEngine).toHaveBeenCalledWith(webgpu, expect.any(Function));
    } finally {
      webgl.dispose();
      webgpu.dispose();
    }
  });
});
