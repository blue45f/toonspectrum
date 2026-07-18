import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioBg3dThreeWebGpuLabRuntime,
  probeStudioBg3dThreeWebGpu,
} from "./studio-bg3d-three-webgpu-lab";

const rendererMock = vi.hoisted(() => ({
  backendIsWebGpu: true,
  initError: null as Error | null,
  dispose: vi.fn(),
  backendDispose: vi.fn(),
  fallbackAtInit: undefined as unknown,
  rendererParameters: null as Record<string, unknown> | null,
}));

vi.mock("three/webgpu", () => ({
  WebGPURenderer: class WebGPURendererMock {
    _getFallback: null | (() => void) = vi.fn();
    readonly backend = rendererMock.backendIsWebGpu
      ? { isWebGPUBackend: true, dispose: rendererMock.backendDispose }
      : { dispose: rendererMock.backendDispose };

    constructor(parameters: Record<string, unknown>) {
      rendererMock.rendererParameters = parameters;
    }

    async init() {
      rendererMock.fallbackAtInit = this._getFallback;
      if (rendererMock.initError) throw rendererMock.initError;
    }

    dispose() {
      rendererMock.dispose();
    }
  },
}));

const GOOD_LIMITS = {
  maxBufferSize: 256 * 1024 * 1024,
  maxStorageBufferBindingSize: 64 * 1024 * 1024,
  maxComputeWorkgroupSizeX: 256,
};

describe("Three WebGPU lab capability probe", () => {
  afterEach(() => {
    rendererMock.backendIsWebGpu = true;
    rendererMock.initError = null;
    rendererMock.dispose.mockReset();
    rendererMock.backendDispose.mockReset();
    rendererMock.fallbackAtInit = undefined;
    rendererMock.rendererParameters = null;
    vi.unstubAllGlobals();
  });
  it("fails closed before adapter allocation for insecure or unavailable APIs", async () => {
    await expect(probeStudioBg3dThreeWebGpu({ secureContext: false }))
      .resolves.toMatchObject({ supported: false, reason: "insecure-context" });
    await expect(probeStudioBg3dThreeWebGpu({ secureContext: true }))
      .resolves.toMatchObject({ supported: false, reason: "api-unavailable" });
  });

  it("admits a sufficiently capable adapter and reports optional instrumentation", async () => {
    const result = await probeStudioBg3dThreeWebGpu({
      secureContext: true,
      gpu: {
        requestAdapter: async () => ({
          features: new Set(["timestamp-query"]),
          limits: GOOD_LIMITS,
        }),
      },
    });

    expect(result).toEqual({
      supported: true,
      reason: "available",
      computeSupported: true,
      timestampQuerySupported: true,
      limits: GOOD_LIMITS,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.limits)).toBe(true);
  });

  it("reads WebIDL-style non-enumerable limit getters explicitly", async () => {
    const limits = Object.create(null) as Record<string, number>;
    for (const [name, value] of Object.entries(GOOD_LIMITS)) {
      Object.defineProperty(limits, name, { get: () => value, enumerable: false });
    }
    expect(Object.keys(limits)).toEqual([]);

    await expect(probeStudioBg3dThreeWebGpu({
      secureContext: true,
      gpu: { requestAdapter: async () => ({ limits }) },
    })).resolves.toMatchObject({ supported: true, reason: "available", limits: GOOD_LIMITS });
  });

  it("rejects low allocation limits and observes abort while adapter selection is pending", async () => {
    await expect(probeStudioBg3dThreeWebGpu({
      secureContext: true,
      gpu: {
        requestAdapter: async () => ({
          limits: { ...GOOD_LIMITS, maxBufferSize: 64 * 1024 * 1024 },
        }),
      },
    })).resolves.toMatchObject({ supported: false, reason: "insufficient-limits" });

    const controller = new AbortController();
    const pending = probeStudioBg3dThreeWebGpu({
      secureContext: true,
      signal: controller.signal,
      gpu: { requestAdapter: () => new Promise(() => undefined) },
    });
    controller.abort();
    await expect(pending).resolves.toMatchObject({ supported: false, reason: "aborted" });
  });

  it("admits only a real WebGPU backend and disposes a Three WebGL fallback", async () => {
    class CanvasMock {}
    vi.stubGlobal("HTMLCanvasElement", CanvasMock);
    const canvas = new CanvasMock() as HTMLCanvasElement;

    const runtime = await createStudioBg3dThreeWebGpuLabRuntime(canvas);
    expect(rendererMock.fallbackAtInit).toBeNull();
    expect(rendererMock.rendererParameters).toMatchObject({
      powerPreference: "high-performance",
      requiredLimits: {
        maxBufferSize: 128 * 1024 * 1024,
        maxStorageBufferBindingSize: 32 * 1024 * 1024,
      },
    });
    await runtime.dispose();
    await runtime.dispose();
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
    expect(rendererMock.backendDispose).not.toHaveBeenCalled();

    rendererMock.dispose.mockReset();
    rendererMock.backendIsWebGpu = false;
    await expect(createStudioBg3dThreeWebGpuLabRuntime(canvas))
      .rejects.toThrow("webgpu-lab-backend-unavailable");
    expect(rendererMock.dispose).toHaveBeenCalledOnce();
    expect(rendererMock.backendDispose).not.toHaveBeenCalled();
  });

  it("disposes a partially initialized renderer and keeps the initialization cause", async () => {
    class CanvasMock {}
    vi.stubGlobal("HTMLCanvasElement", CanvasMock);
    const canvas = new CanvasMock() as HTMLCanvasElement;
    const cause = new Error("device-lost-during-init");
    rendererMock.initError = cause;

    await expect(createStudioBg3dThreeWebGpuLabRuntime(canvas)).rejects.toMatchObject({
      message: "webgpu-lab-initialization-failed",
      cause,
    });
    expect(rendererMock.dispose).not.toHaveBeenCalled();
    expect(rendererMock.backendDispose).toHaveBeenCalledOnce();
  });
});
