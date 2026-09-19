import { afterEach, describe, expect, it, vi } from "vitest";

import { createSkiaGpuIslandBackend } from "../gpu-island";

import type { SceneIR } from "@toonspectrum/studio-project-model";
import type { CanvasKit } from "canvaskit-wasm";

const scene: SceneIR = {
  version: 11,
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
    class FakeOffscreenCanvas extends EventTarget {
      constructor(
        readonly width: number,
        readonly height: number,
      ) { super(); }
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
    const setCurrentContext = vi.fn(() => true);
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
    expect(setCurrentContext).not.toHaveBeenCalled();

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
    class FakeOffscreenCanvas extends EventTarget {
      constructor(
        readonly width: number,
        readonly height: number,
      ) { super(); }
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

function gpuFixture() {
  const canvases: EventTarget[] = [];
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  class Canvas extends EventTarget {
    constructor(readonly width: number, readonly height: number) { super(); canvases.push(this); }
    transferToImageBitmap() { return bitmap; }
  }
  vi.stubGlobal("OffscreenCanvas", Canvas);
  const surface = { getCanvas: () => ({ clear: vi.fn() }), flush: vi.fn(), delete: vi.fn() };
  const context = { delete: vi.fn() };
  // Deliberately no setCurrentContext: it is not a public npm runtime export.
  const api = {
    ColorSpace: { SRGB: {} }, GetWebGLContext: vi.fn(() => 7),
    MakeWebGLContext: vi.fn(() => context), MakeOnScreenGLSurface: vi.fn(() => surface),
    deleteContext: vi.fn(),
  };
  const ck = api as unknown as CanvasKit;
  return { ck, api, surface, context, canvases };
}
const request = { islandId: "revision-test", width: 64, height: 64, revision: 1, scene };

describe("Skia GPU island failure and concurrency regressions", () => {
  it("invalidates cached output on a backing-size change even at the same revision", async () => {
    const f = gpuFixture();
    const backend = createSkiaGpuIslandBackend({ loadCanvasKit: async () => f.ck });
    try {
      expect((await backend.render(request)).status).toBe("transferred");
      expect((await backend.render({ ...request, width: 96, scene: { ...scene, width: 96 } })).status).toBe("transferred");
      expect(f.api.MakeOnScreenGLSurface).toHaveBeenCalledTimes(2);
      expect(f.surface.delete).toHaveBeenCalledTimes(1);
    } finally { backend.dispose(); }
  });
  it("never reports failed renders as cached and releases partially created resources", async () => {
    const f = gpuFixture();
    f.api.MakeOnScreenGLSurface.mockImplementationOnce(() => { throw new Error("surface failed"); });
    const backend = createSkiaGpuIslandBackend({ loadCanvasKit: async () => f.ck });
    try {
      expect((await backend.render(request)).status).toBe("unavailable");
      expect((await backend.render(request)).status).toBe("unavailable");
      expect(f.api.GetWebGLContext).toHaveBeenCalledTimes(1);
      expect(f.context.delete).toHaveBeenCalledTimes(1);
      expect(f.api.deleteContext).toHaveBeenCalledWith(7);
    } finally { backend.dispose(); }
  });
  it("serializes concurrent lazy renders on one surface", async () => {
    const f = gpuFixture();
    const backend = createSkiaGpuIslandBackend({ loadCanvasKit: async () => f.ck });
    try {
      const results = await Promise.all([
        backend.render(request), backend.render({ ...request, revision: 2 }),
      ]);
      expect(results.map((value) => value.status)).toEqual(["transferred", "transferred"]);
      expect(f.api.GetWebGLContext).toHaveBeenCalledTimes(1);
      expect(f.surface.flush).toHaveBeenCalledTimes(2);
    } finally { backend.dispose(); }
  });
  it("does not allocate GPU state when disposed during pending WASM initialization", async () => {
    const f = gpuFixture();
    let release!: (value: CanvasKit) => void;
    const loaded = new Promise<CanvasKit>((resolve) => { release = resolve; });
    const backend = createSkiaGpuIslandBackend({ loadCanvasKit: () => loaded });
    const rendering = backend.render(request);
    await Promise.resolve();
    backend.dispose(); release(f.ck);
    expect((await rendering).status).toBe("unavailable");
    expect(f.api.GetWebGLContext).not.toHaveBeenCalled();
  });
  it("invalidates even a cache hit after context loss and never silently creates a replacement", async () => {
    const f = gpuFixture();
    const backend = createSkiaGpuIslandBackend({ loadCanvasKit: async () => f.ck });
    try {
      await backend.render(request);
      f.canvases[0]!.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      expect((await backend.render(request)).status).toBe("unavailable");
      expect(f.api.GetWebGLContext).toHaveBeenCalledTimes(1);
    } finally { backend.dispose(); }
  });
  it("rejects invalid identities and over-budget surfaces before loading WASM", async () => {
    gpuFixture(); const load = vi.fn();
    const backend = createSkiaGpuIslandBackend({ loadCanvasKit: load });
    for (const patch of [{ revision: -1 }, { islandId: "" }, { width: 99999 }, { width: 8192, height: 8192, scene: { ...scene, width: 8192, height: 8192 } }]) {
      expect((await backend.render({ ...request, ...patch })).status).toBe("unavailable");
    }
    expect(load).not.toHaveBeenCalled(); backend.dispose();
  });
});
