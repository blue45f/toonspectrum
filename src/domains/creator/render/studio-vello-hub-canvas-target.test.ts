// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_VELLO_CLASSIC_BACKEND_ID,
  STUDIO_VELLO_CPU_BACKEND_ID,
  type StudioVelloSceneIsland,
} from "./studio-vello-hub";
import { createStudioVelloHubCanvasTarget } from "./studio-vello-hub-canvas-target";

const island: StudioVelloSceneIsland = {
  id: "selection:a",
  placement: { left: 12, top: 18, width: 8, height: 8, dpr: 1 },
  documentIds: ["a"],
  scene: {
    version: 11,
    width: 8,
    height: 8,
    background: { r: 0, g: 0, b: 0, a: 0 },
    nodes: [],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VelloHub canvas target", () => {
  it("atomically exposes one CPU primary and holdLastGood never clears it", async () => {
    const putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((kind: string) => kind === "2d" ? { putImageData } : null) as never,
    );
    vi.stubGlobal(
      "ImageData",
      class FakeImageData {
        constructor(
          readonly data: Uint8ClampedArray,
          readonly width: number,
          readonly height: number,
        ) {}
      },
    );
    const mount = document.createElement("div");
    const target = createStudioVelloHubCanvasTarget(document, mount);
    target.setIsland(island);

    await target.present({
      backendId: STUDIO_VELLO_CPU_BACKEND_ID,
      kind: "pixels",
      width: 8,
      height: 8,
      pixels: new Uint8Array(8 * 8 * 4),
    });
    expect(putImageData).toHaveBeenCalledOnce();
    expect(target.activeBackendId).toBe(STUDIO_VELLO_CPU_BACKEND_ID);
    expect(target.cpuCanvas.style.display).toBe("block");
    expect(target.cpuCanvas.dataset.studioVelloHubPrimary).toBe("true");
    expect(target.gpuCanvas.style.display).toBe("none");

    target.holdLastGood("device-lost");
    expect(target.cpuCanvas.style.display).toBe("block");
    expect(target.cpuCanvas.dataset.studioVelloHubHoldReason).toBe("device-lost");
    target.destroy();
    expect(mount.childElementCount).toBe(0);
  });

  it("presents an adopted-device texture by GPU copy without pixel readback", async () => {
    const destination = {} as GPUTexture;
    const configure = vi.fn();
    const getCurrentTexture = vi.fn(() => destination);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((kind: string) => kind === "webgpu"
        ? { configure, getCurrentTexture }
        : null) as never,
    );
    vi.stubGlobal("GPUTextureUsage", { COPY_DST: 2, RENDER_ATTACHMENT: 16 });
    const copyTextureToTexture = vi.fn();
    const finish = vi.fn(() => ({}) as GPUCommandBuffer);
    const submit = vi.fn();
    const release = vi.fn();
    const device = {
      createCommandEncoder: vi.fn(() => ({ copyTextureToTexture, finish })),
      queue: {
        submit,
        onSubmittedWorkDone: vi.fn(async () => undefined),
      },
    } as unknown as GPUDevice;
    const source = {} as GPUTexture;
    const mount = document.createElement("div");
    const target = createStudioVelloHubCanvasTarget(document, mount);
    target.setIsland(island);

    await target.present({
      backendId: STUDIO_VELLO_CLASSIC_BACKEND_ID,
      kind: "texture",
      width: 8,
      height: 8,
      device,
      texture: source,
      release,
    });
    expect(configure).toHaveBeenCalledWith(expect.objectContaining({
      device,
      format: "rgba8unorm",
      usage: 18,
    }));
    expect(copyTextureToTexture).toHaveBeenCalledWith(
      { texture: source },
      { texture: destination },
      { width: 8, height: 8, depthOrArrayLayers: 1 },
    );
    expect(submit).toHaveBeenCalledOnce();
    expect(target.activeBackendId).toBe(STUDIO_VELLO_CLASSIC_BACKEND_ID);
    expect(target.gpuCanvas.style.display).toBe("block");
    expect(target.cpuCanvas.style.display).toBe("none");
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  });
});
