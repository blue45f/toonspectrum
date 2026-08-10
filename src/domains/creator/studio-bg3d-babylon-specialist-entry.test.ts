import { describe, expect, it, vi } from "vitest";

import {
  attachStudioBg3dBabylonDeviceLossSignal,
  STUDIO_BG3D_BABYLON_DELEGATES_CONTEXT_LOSS_TO_RUNTIME,
} from
  "./studio-bg3d-babylon-specialist-entry";
import {
  STUDIO_BG3D_BABYLON_DEVICE_LOSS_SIGNAL,
  type StudioBg3dBabylonEngineHandle,
} from "./studio-bg3d-babylon-specialist-runtime";

describe("Babylon specialist context-loss ownership", () => {
  it("uses the Toon runtime as the single recovery owner", () => {
    expect(STUDIO_BG3D_BABYLON_DELEGATES_CONTEXT_LOSS_TO_RUNTIME).toBe(true);
  });

  it("binds the real GPUDevice.lost promise without enabling Babylon recovery", () => {
    const deviceLost = new Promise<unknown>(() => undefined);
    const engine: StudioBg3dBabylonEngineHandle = { dispose: vi.fn() };

    expect(attachStudioBg3dBabylonDeviceLossSignal(engine, deviceLost)).toBe(engine);
    expect(engine[STUDIO_BG3D_BABYLON_DEVICE_LOSS_SIGNAL]).toBe(deviceLost);
    expect(Object.keys(engine)).toEqual(["dispose"]);
    expect(() => attachStudioBg3dBabylonDeviceLossSignal(
      { dispose: vi.fn() },
      null as unknown as PromiseLike<unknown>,
    )).toThrow(TypeError);
  });
});
