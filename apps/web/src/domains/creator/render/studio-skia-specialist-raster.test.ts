import { describe, expect, it, vi } from "vitest";

import {
  applyStudioLayerMaskCoverageToPixels,
  computeStudioLayerMaskCoverage,
  planStudioSkiaSpecialistRaster,
  prepareStudioSkiaSpecialistRaster,
  StudioSkiaSpecialistRasterError,
  type StudioSkiaSpecialistRasterDependencies,
} from "./studio-skia-specialist-raster";

import type { El } from "../studio-element-model";
import type { StudioImageDataLike } from "../studio-filters";

type TestImageEl = Extract<El, { type: "image" }>;

function image(overrides: Partial<TestImageEl> = {}): TestImageEl {
  return {
    id: "image-1",
    type: "image",
    src: "data:image/png;base64,source",
    x: 10,
    y: 20,
    width: 2,
    height: 1,
    rotation: 0,
    ...overrides,
  };
}

function pixels(width: number, height: number, values: number[]): StudioImageDataLike {
  return { width, height, data: new Uint8ClampedArray(values) };
}

describe("planStudioSkiaSpecialistRaster", () => {
  it("builds a stable padded plan for filters and both mask axes", () => {
    const element = image({
      brightness: 0.2,
      filterMaskSrc: "data:image/png;base64,filter-mask",
      filterMaskEnabled: true,
      maskSrc: "data:image/png;base64,layer-mask",
      maskEnabled: true,
    });
    const first = planStudioSkiaSpecialistRaster(element, { density: 2, padding: 3 });
    const second = planStudioSkiaSpecialistRaster({ ...element }, { density: 2, padding: 3 });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      pixelWidth: 16,
      pixelHeight: 14,
      contentOffsetX: 6,
      contentOffsetY: 6,
      contentPixelWidth: 4,
      contentPixelHeight: 2,
      hasFilters: true,
      filterMaskSource: "data:image/png;base64,filter-mask",
      layerMaskSource: "data:image/png;base64,layer-mask",
    });
  });

  it("tracks the active cell frame and browser-owned GIF frame separately", () => {
    const cell = planStudioSkiaSpecialistRaster(image({
      src: "frame-b.png",
      activeFrameId: "b",
      frames: [
        { id: "a", src: "frame-a.png" },
        { id: "b", src: "frame-b.png" },
      ],
    }));
    const gif = planStudioSkiaSpecialistRaster(image({
      src: "data:image/gif;base64,gif",
      isAnimatedGif: true,
    }));
    expect(cell.frameIdentity).toBe("b:frame-b.png");
    expect(cell.capturesLiveFrame).toBe(false);
    expect(gif.frameIdentity).toContain("gif:");
    expect(gif.capturesLiveFrame).toBe(true);
    expect(gif.liveFrameRevision).toBe(0);
    const nextGifFrame = planStudioSkiaSpecialistRaster(image({
      src: "data:image/gif;base64,gif",
      isAnimatedGif: true,
    }), { liveFrameRevision: 1 });
    expect(nextGifFrame.key).not.toBe(gif.key);
    expect(nextGifFrame.liveFrameRevision).toBe(1);
  });

  it("fails closed before allocating unsafe dimensions", () => {
    expect(() => planStudioSkiaSpecialistRaster(image({ width: 100_000, height: 100_000 })))
      .toThrowError(StudioSkiaSpecialistRasterError);
  });

  it("fails closed while a shared filter mask has no render projection", () => {
    expect(() => planStudioSkiaSpecialistRaster(image({
      brightness: 0.2,
      filterMaskSurfaceId: "filter-mask:v1:10000000-0000-4000-8000-000000000001",
      filterMaskEnabled: true,
    }))).toThrowError(expect.objectContaining({ code: "mask-failed" }));
  });
});

describe("layer mask pixel authority", () => {
  it("extracts alpha only and preserves hidden RGB while scaling alpha", () => {
    const coverage = computeStudioLayerMaskCoverage(
      new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 128,
      ]),
      2,
      1,
    );
    expect(coverage?.data).toEqual(new Uint8ClampedArray([255, 128]));
    const target = new Uint8ClampedArray([
      10, 20, 30, 200,
      40, 50, 60, 200,
    ]);
    expect(applyStudioLayerMaskCoverageToPixels({
      target,
      width: 2,
      height: 1,
      coverage: coverage!,
    })).toBe(true);
    expect(Array.from(target)).toEqual([
      10, 20, 30, 200,
      40, 50, 60, 100,
    ]);
  });

  it("maps element-local mask coverage across transparent filter padding", () => {
    const target = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    const coverage = { width: 2, height: 2, data: new Uint8ClampedArray([0, 255, 0, 255]) };
    applyStudioLayerMaskCoverageToPixels({
      target,
      width: 4,
      height: 4,
      coverage,
      contentOffsetX: 1,
      contentOffsetY: 1,
      contentWidth: 2,
      contentHeight: 2,
    });
    expect(target[3]).toBe(0);
    expect(target[(1 * 4 + 2) * 4 + 3]).toBe(255);
  });
});

describe("prepareStudioSkiaSpecialistRaster", () => {
  it("runs filters once, blends the filter mask, applies the layer mask, and owns one URL", async () => {
    const element = image({
      brightness: 0.25,
      filterMaskSrc: "filter-mask",
      filterMaskEnabled: true,
      maskSrc: "layer-mask",
      maskEnabled: true,
    });
    const plan = planStudioSkiaSpecialistRaster(element);
    const releases: string[] = [];
    const revoke = vi.fn();
    const runFilters = vi.fn(async ({ imageData }: { imageData: StudioImageDataLike }) => ({
      ...imageData,
      data: new Uint8ClampedArray([
        110, 120, 130, 200,
        210, 220, 230, 200,
      ]),
    }));
    const dependencies: StudioSkiaSpecialistRasterDependencies = {
      async acquireSource(source) {
        return { kind: "passthrough", src: source, blob: null, receipt: null, release: () => releases.push(source) };
      },
      async decodePixels(input) {
        if (input.source === element.src) {
          return {
            imageData: pixels(2, 1, [10, 20, 30, 200, 20, 30, 40, 200]),
            release: () => releases.push("source-pixels"),
          };
        }
        if (input.source === "filter-mask") {
          return {
            imageData: pixels(2, 1, [255, 255, 255, 0, 255, 255, 255, 255]),
            release: () => releases.push("filter-mask-pixels"),
          };
        }
        return {
          imageData: pixels(2, 1, [255, 255, 255, 255, 255, 255, 255, 128]),
          release: () => releases.push("layer-mask-pixels"),
        };
      },
      runFilters,
      async encodePng(imageData) {
        expect(Array.from(imageData.data)).toEqual([
          10, 20, 30, 200,
          210, 220, 230, 100,
        ]);
        return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
      },
      createObjectUrl: () => "blob:prepared",
      revokeObjectUrl: revoke,
    };
    const lease = await prepareStudioSkiaSpecialistRaster(element, plan, { dependencies });
    expect(runFilters).toHaveBeenCalledTimes(1);
    expect(lease).toMatchObject({
      src: "blob:prepared",
      bytes: 3,
      displayWidth: 2,
      displayHeight: 1,
      localX: 0,
      localY: 0,
    });
    expect(releases).toEqual([
      "filter-mask-pixels",
      "layer-mask-pixels",
      element.src,
      "source-pixels",
    ]);
    lease.release();
    lease.release();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("releases every acquired resource when filtering fails", async () => {
    const element = image({ contrast: 1 });
    const plan = planStudioSkiaSpecialistRaster(element);
    const releaseSource = vi.fn();
    const releasePixels = vi.fn();
    const dependencies: StudioSkiaSpecialistRasterDependencies = {
      async acquireSource(source) {
        return { kind: "passthrough", src: source, blob: null, receipt: null, release: releaseSource };
      },
      async decodePixels() {
        return { imageData: pixels(2, 1, [0, 0, 0, 255, 0, 0, 0, 255]), release: releasePixels };
      },
      async runFilters() {
        throw new Error("worker failed");
      },
      async encodePng() {
        throw new Error("must not encode");
      },
      createObjectUrl: () => "blob:unused",
      revokeObjectUrl: vi.fn(),
    };
    await expect(prepareStudioSkiaSpecialistRaster(element, plan, { dependencies }))
      .rejects.toMatchObject({ code: "filter-failed" });
    expect(releaseSource).toHaveBeenCalledTimes(1);
    expect(releasePixels).toHaveBeenCalledTimes(1);
  });
});
