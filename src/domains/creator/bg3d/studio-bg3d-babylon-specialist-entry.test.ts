import { describe, expect, it, vi } from "vitest";

import {
  attachStudioBg3dBabylonDeviceLossSignal,
  initializeStudioBg3dBabylonWebGpuEngine,
  STUDIO_BG3D_BABYLON_DELEGATES_CONTEXT_LOSS_TO_RUNTIME,
} from "./studio-bg3d-babylon-specialist-entry";
import {
  STUDIO_BG3D_BABYLON_ADAPTER_DIAGNOSTIC,
  STUDIO_BG3D_BABYLON_DEVICE_LOSS_SIGNAL,
  type StudioBg3dBabylonEngineHandle,
} from "./studio-bg3d-babylon-specialist-runtime";

describe("Babylon specialist context-loss ownership", () => {
  it("uses the Toon runtime as the single recovery owner", () => {
    expect(STUDIO_BG3D_BABYLON_DELEGATES_CONTEXT_LOSS_TO_RUNTIME).toBe(true);
  });

  it("binds real device loss plus a private frozen adapter snapshot", () => {
    const deviceLost = new Promise<unknown>(() => undefined);
    const engine: StudioBg3dBabylonEngineHandle = { dispose: vi.fn() };
    const adapterInfo = {
      architecture: "swiftshader",
      description: "Chromium WebGPU",
      device: "0xffff",
      isFallbackAdapter: false,
      vendor: "Google",
    };

    expect(attachStudioBg3dBabylonDeviceLossSignal(
      engine,
      deviceLost,
      adapterInfo,
      true,
    )).toBe(engine);
    expect(engine[STUDIO_BG3D_BABYLON_DEVICE_LOSS_SIGNAL]).toBe(deviceLost);
    expect(engine[STUDIO_BG3D_BABYLON_ADAPTER_DIAGNOSTIC]).toEqual({
      ...adapterInfo,
      isFallbackAdapter: true,
    });
    expect(engine[STUDIO_BG3D_BABYLON_ADAPTER_DIAGNOSTIC]).not.toBe(adapterInfo);
    expect(Object.isFrozen(engine[STUDIO_BG3D_BABYLON_ADAPTER_DIAGNOSTIC])).toBe(true);
    expect(structuredClone(engine[STUDIO_BG3D_BABYLON_ADAPTER_DIAGNOSTIC])).toEqual({
      ...adapterInfo,
      isFallbackAdapter: true,
    });
    expect(Object.keys(engine)).toEqual(["dispose"]);
    expect(() => attachStudioBg3dBabylonDeviceLossSignal(
      { dispose: vi.fn() },
      null as unknown as PromiseLike<unknown>,
    )).toThrow(TypeError);
  });

  it("disposes an engine whose asynchronous WebGPU initialization rejects", async () => {
    const initializationError = new Error("Dawn initialization failed");
    const dispose = vi.fn();
    const engine = {
      dispose,
      initAsync: vi.fn().mockRejectedValue(initializationError),
    } as unknown as Parameters<typeof initializeStudioBg3dBabylonWebGpuEngine>[0];

    await expect(initializeStudioBg3dBabylonWebGpuEngine(engine)).rejects.toBe(
      initializationError,
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the initialization failure authoritative when partial cleanup also throws", async () => {
    const initializationError = new Error("Dawn initialization failed");
    const dispose = vi.fn(() => {
      throw new Error("partial engine cleanup failed");
    });
    const engine = {
      dispose,
      initAsync: vi.fn().mockRejectedValue(initializationError),
    } as unknown as Parameters<typeof initializeStudioBg3dBabylonWebGpuEngine>[0];

    await expect(initializeStudioBg3dBabylonWebGpuEngine(engine)).rejects.toBe(
      initializationError,
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes an initialized engine when its device-loss signal cannot be bound", async () => {
    const dispose = vi.fn();
    const engine = {
      _device: { lost: null },
      dispose,
      getInfo: vi.fn().mockReturnValue({ architecture: "swiftshader" }),
      initAsync: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof initializeStudioBg3dBabylonWebGpuEngine>[0];

    await expect(initializeStudioBg3dBabylonWebGpuEngine(engine)).rejects.toThrow(
      "A valid GPUDevice.lost promise is required.",
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
