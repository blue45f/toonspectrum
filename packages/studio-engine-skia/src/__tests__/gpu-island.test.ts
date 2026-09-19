import { afterEach, describe, expect, it, vi } from "vitest";

import { createSkiaGpuIslandBackend } from "../gpu-island";

import type { SceneIR } from "@toonspectrum/studio-project-model";
import type { CanvasKit } from "canvaskit-wasm";

const scene: SceneIR = {
  width: 64,
  height: 64,
  background: { r: 0, g: 0, b: 0, a: 0 },
  nodes: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Skia GPU island", () => {
  it("refuses interactive CPU readback when OffscreenCanvas is unavailable", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    const backend = createSkiaGpuIslandBackend();
    const result = await backend.render({
      islandId: "mask-1",
      width: 64,
      height: 64,
      revision: 1,
      scene,
    });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).not.toContain("readPixels");
    }
    backend.dispose();
  });

  it("renders through the explicit WebGL surface, transfers one bitmap and caches the revision", async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    class FakeOffscreenCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      transferToImageBitmap() {
        return bitmap;
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

    const clear = vi.fn();
    const surface = {
      getCanvas: () => ({ clear }),
      flush: vi.fn(),
      delete: vi.fn(),
    };
    const context = { delete: vi.fn() };
    const setCurrentContext = vi.fn();
    const deleteContext = vi.fn();
    const ck = {
      ColorSpace: { SRGB: {} },
      GetWebGLContext: vi.fn(() => 7),
      MakeWebGLContext: vi.fn(() => context),
      MakeOnScreenGLSurface: vi.fn(() => surface),
      setCurrentContext,
      deleteContext,
    } as unknown as CanvasKit;

    const backend = createSkiaGpuIslandBackend({
      loadCanvasKit: async () => ck,
    });
    const first = await backend.render({
      islandId: "brush-vector-1",
      width: 64,
      height: 64,
      revision: 3,
      scene,
    });
    expect(first).toEqual({
      status: "transferred",
      islandId: "brush-vector-1",
      revision: 3,
      bitmap,
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(surface.flush).toHaveBeenCalledTimes(1);
    expect(setCurrentContext).toHaveBeenCalledWith(7);

    const cached = await backend.render({
      islandId: "brush-vector-1",
      width: 64,
      height: 64,
      revision: 3,
      scene,
    });
    expect(cached).toEqual({
      status: "cached",
      islandId: "brush-vector-1",
      revision: 3,
    });
    expect(surface.flush).toHaveBeenCalledTimes(1);

    backend.dispose();
    expect(surface.delete).toHaveBeenCalledTimes(1);
    expect(context.delete).toHaveBeenCalledTimes(1);
    expect(deleteContext).toHaveBeenCalledWith(7);
  });

  it("fails closed instead of creating a software surface when WebGL adoption fails", async () => {
    class FakeOffscreenCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {}
      transferToImageBitmap(): ImageBitmap {
        throw new Error("must not transfer without a GPU surface");
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const ck = {
      GetWebGLContext: vi.fn(() => 0),
    } as unknown as CanvasKit;
    const backend = createSkiaGpuIslandBackend({
      loadCanvasKit: async () => ck,
    });
    const result = await backend.render({
      islandId: "brush-raster-1",
      width: 64,
      height: 64,
      revision: 1,
      scene,
    });
    expect(result).toMatchObject({
      status: "unavailable",
    });
    expect(ck.GetWebGLContext).toHaveBeenCalledTimes(1);
    backend.dispose();
  });
});
