import { describe, expect, it, vi } from "vitest";

import {
  acquireStudioBg3dCaptureAdapterAfterViewTransition,
  captureStudioBg3dRaster,
  getStudioBg3dCaptureSourceSize,
  type StudioBg3dCaptureAdapter,
  type StudioBg3dCapturedRaster,
  type StudioBg3dCaptureRequest,
} from "./studio-bg3d-capture-adapter";
import { STUDIO_BG3D_LT_RENDER_MAX_PIXELS } from "./studio-bg3d-lt-render";

const REQUEST: StudioBg3dCaptureRequest = {
  width: 2,
  height: 2,
  background: { color: "#123abc", alpha: 0 },
  includeDepth: true,
};

function validRaster(): StudioBg3dCapturedRaster {
  return {
    width: 2,
    height: 2,
    rgba: new Uint8ClampedArray(16),
    depth: Float32Array.from([0, 0.25, 0.75, 1]),
  };
}

function adapter(
  capture: StudioBg3dCaptureAdapter["capture"] = async () => validRaster()
): StudioBg3dCaptureAdapter {
  return {
    backend: "three-webgl",
    getSourceSize: () => ({ width: 1280, height: 720 }),
    capture,
  };
}

describe("Studio 3D capture adapter contract", () => {
  it("binds the replacement single-View adapter only after two paint boundaries", async () => {
    const quadAdapter = adapter();
    const singleViewAdapter = adapter();
    let currentAdapter: StudioBg3dCaptureAdapter | null = quadAdapter;
    let paintCount = 0;
    const readAdapter = vi.fn(() => currentAdapter);

    const acquired = await acquireStudioBg3dCaptureAdapterAfterViewTransition({
      isActive: () => true,
      readAdapter,
      waitForPaintFrame: async () => {
        paintCount += 1;
        if (paintCount === 1) currentAdapter = singleViewAdapter;
      },
    });

    expect(paintCount).toBe(2);
    expect(readAdapter).toHaveBeenCalledOnce();
    expect(acquired).toBe(singleViewAdapter);
    expect(acquired).not.toBe(quadAdapter);
  });

  it("does not read a replacement adapter after the editor session closes", async () => {
    const readAdapter = vi.fn(() => adapter());

    await expect(
      acquireStudioBg3dCaptureAdapterAfterViewTransition({
        isActive: () => false,
        readAdapter,
        waitForPaintFrame: async () => undefined,
      })
    ).resolves.toBeNull();
    expect(readAdapter).not.toHaveBeenCalled();
  });

  it("awaits a backend and returns validated Studio-owned raster copies", async () => {
    const backendRaster = validRaster();
    const capture = vi.fn(async (request: StudioBg3dCaptureRequest) => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.background)).toBe(true);
      return backendRaster;
    });
    const result = await captureStudioBg3dRaster(adapter(capture), REQUEST);

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(REQUEST);
    expect(result).toEqual(backendRaster);
    expect(result).not.toBe(backendRaster);
    expect(result.rgba).not.toBe(backendRaster.rgba);
    expect(result.depth).not.toBe(backendRaster.depth);
    expect(Object.isFrozen(result)).toBe(true);

    backendRaster.rgba[0] = 255;
    backendRaster.depth![0] = 1;
    expect(result.rgba[0]).toBe(0);
    expect(result.depth?.[0]).toBe(0);
  });

  it("validates the result against an immutable request snapshot", async () => {
    const mutableRequest: StudioBg3dCaptureRequest = {
      ...REQUEST,
      background: { ...REQUEST.background },
    };
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const capture = vi.fn(async () => {
      await pending;
      return validRaster();
    });

    const resultPromise = captureStudioBg3dRaster(adapter(capture), mutableRequest);
    (mutableRequest as { width: number }).width = 1;
    (mutableRequest.background as { color: string }).color = "#ffffff";
    release();

    await expect(resultPromise).resolves.toEqual(validRaster());
    expect(capture).toHaveBeenCalledWith(REQUEST);
  });

  it("returns an immutable source-size snapshot instead of an engine-owned object", () => {
    const source = { width: 640, height: 360 };
    const captureAdapter = adapter();
    captureAdapter.getSourceSize = () => source;

    const result = getStudioBg3dCaptureSourceSize(captureAdapter);

    expect(result).toEqual(source);
    expect(result).not.toBe(source);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    { ...REQUEST, width: 0 },
    { ...REQUEST, height: 1.5 },
    { ...REQUEST, includeDepth: "yes" },
    { ...REQUEST, background: null },
    { ...REQUEST, background: { color: "red", alpha: 1 } },
    { ...REQUEST, background: { color: "#123abc", alpha: -0.1 } },
    {
      ...REQUEST,
      width: STUDIO_BG3D_LT_RENDER_MAX_PIXELS + 1,
      height: 1,
    },
  ])("rejects an invalid request before invoking the engine: %#", async (request) => {
    const capture = vi.fn(async () => validRaster());

    await expect(
      captureStudioBg3dRaster(adapter(capture), request as StudioBg3dCaptureRequest)
    ).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
  });

  it.each([
    { ...validRaster(), width: 1 },
    { ...validRaster(), rgba: new Uint16Array(16) },
    { ...validRaster(), rgba: new Uint8Array(15) },
    { ...validRaster(), depth: undefined },
    { ...validRaster(), depth: new Float32Array(3) },
    { ...validRaster(), depth: Float32Array.from([0, 0.5, Number.NaN, 1]) },
    { ...validRaster(), depth: Float32Array.from([0, 0.5, 1.1, 1]) },
  ])("rejects a malformed engine result: %#", async (raster) => {
    await expect(
      captureStudioBg3dRaster(
        adapter(async () => raster as unknown as StudioBg3dCapturedRaster),
        REQUEST
      )
    ).rejects.toThrow();
  });

  it("requires the backend to omit depth when it was not requested", async () => {
    await expect(
      captureStudioBg3dRaster(adapter(), { ...REQUEST, includeDepth: false })
    ).rejects.toThrow(/unrequested depth/u);
  });

  it("forwards asynchronous backend failures without replacing their cause", async () => {
    const failure = new Error("device lost");

    await expect(
      captureStudioBg3dRaster(
        adapter(async () => {
          throw failure;
        }),
        REQUEST
      )
    ).rejects.toBe(failure);
  });

  it("rejects unsupported adapters and malformed source dimensions", async () => {
    const unsupported = { ...adapter(), backend: "unknown" } as unknown as StudioBg3dCaptureAdapter;
    const invalidSource = { ...adapter(), getSourceSize: () => ({ width: 0, height: 1 }) };

    await expect(captureStudioBg3dRaster(unsupported, REQUEST)).rejects.toThrow(/backend/u);
    expect(() => getStudioBg3dCaptureSourceSize(invalidSource)).toThrow(/width/u);
  });
});
