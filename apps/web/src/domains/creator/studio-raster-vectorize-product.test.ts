// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { vectorizeStudioRasterImage } from "./studio-raster-vectorize-product";
import type { El } from "./studio-element-model";

const selection = vi.hoisted(() => ({
  maskToPathIR: vi.fn(async (
    _mask: Uint8Array | Uint8ClampedArray,
    _width: number,
    _height: number,
    _simplifyEps?: number,
  ) => ({
    path: {
      verbs: [
        { v: "M" as const, x: 0.5, y: 0.5 },
        { v: "L" as const, x: 1.5, y: 0.5 },
        { v: "L" as const, x: 1.5, y: 1.5 },
        { v: "L" as const, x: 0.5, y: 1.5 },
        { v: "Z" as const },
      ],
    },
    fillRule: "evenodd" as const,
    contourCount: 1,
    holeCount: 0,
  })),
}));

vi.mock("./studio-opencv-selection", () => selection);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  selection.maskToPathIR.mockClear();
});

describe("Studio raster vectorize product bridge", () => {
  it("converts image pixels through the OpenCV path kernel and returns non-destructive draw layers", async () => {
    class ImageMock {
      decoding = "";
      crossOrigin: string | null = null;
      naturalWidth = 2;
      naturalHeight = 2;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", ImageMock);

    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 255, 255, 255,
      0, 0, 0, 255, 255, 255, 255, 255,
    ]);
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels })),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((
      ((kind: string) => kind === "2d" ? context : null) as typeof HTMLCanvasElement.prototype.getContext
    ));

    const image = {
      id: "image-1",
      type: "image",
      src: "data:image/png;base64,AA==",
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      rotation: 0,
      opacity: 0.8,
      name: "선화",
    } as Extract<El, { type: "image" }>;

    const result = await vectorizeStudioRasterImage(image.src, image);

    expect(selection.maskToPathIR).toHaveBeenCalledTimes(1);
    const firstCall = selection.maskToPathIR.mock.calls[0];
    expect(firstCall).toBeDefined();
    const mask = firstCall![0];
    expect([...mask]).toEqual([255, 0, 255, 0]);
    expect(result.contourCount).toBe(1);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({
      type: "draw",
      kind: "freehand",
      mode: "pen",
      opacity: 0.8,
      name: "선화 · 벡터 외곽선 1",
    });
    expect(result.elements[0]?.points).toEqual([60, 45, 160, 45, 160, 95, 60, 95]);
    expect(image.src).toBe("data:image/png;base64,AA==");
  });
});
