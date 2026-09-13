import { describe, expect, it, vi } from "vitest";

import {
  alphaOnlyCooperatively,
  deriveCharacterShadingLayersCooperatively,
  sobelEdgeAlphaCooperatively,
  yieldCharacterRasterWork,
} from "./character-shaper-cooperative-raster";
import { alphaOnly, deriveCharacterShadingLayers, sobelEdgeAlpha } from "./character-shaper-image-math";

import type { CharacterRasterWorkOptions } from "./character-shaper-cooperative-raster";

function raster(pixels: number, seed = 1729): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(pixels * 4);
  let state = seed;
  for (let index = 0; index < bytes.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes;
}

// Compare bytes as typed arrays, never rounded image metrics that could hide a stripe seam.
describe("cooperative character raster", () => {
  it.each([[1, 1], [1, 2048], [2048, 1], [257, 131], [1025, 35], [2048, 17]])(
    "preserves every Sobel byte at %i × %i including halo and partial stripes", async (width, height) => {
      const source = raster(width * height);
      const before = source.slice();
      const options = { threshold: 511, inkColor: "#1267ab" };
      expect(await sobelEdgeAlphaCooperatively(source, width, height, options)).toEqual(sobelEdgeAlpha(source, width, height, options));
      expect(source).toEqual(before);
    },
  );

  it.each([1, 16384, 16385, 32769])("matches shading and matte math for %i pixels", async (pixels) => {
    const flat = raster(pixels);
    const beauty = raster(pixels, 99);
    const beforeFlat = flat.slice();
    const beforeBeauty = beauty.slice();
    const result = await deriveCharacterShadingLayersCooperatively(flat, beauty);
    expect(result).toEqual(deriveCharacterShadingLayers(flat, beauty));
    expect(await alphaOnlyCooperatively(flat)).toEqual(alphaOnly(flat));
    expect(result.shadow.buffer).not.toBe(result.highlight.buffer);
    expect(flat).toEqual(beforeFlat);
    expect(beauty).toEqual(beforeBeauty);
  });

  it("handles offset views without reading or detaching surrounding bytes", async () => {
    const backing = raster(16390);
    const view = backing.subarray(12, backing.length - 8);
    const before = backing.slice();
    expect(await alphaOnlyCooperatively(view)).toEqual(alphaOnly(view));
    expect(backing).toEqual(before);
  });

  it("yields actual tasks and reports monotonic bounded work", async () => {
    let heartbeats = 0;
    const tick = setInterval(() => { heartbeats += 1; }, 0);
    const progress: [number, number][] = [];
    try {
      await alphaOnlyCooperatively(raster(65537), { onProgress: (done, total) => progress.push([done, total]) });
    } finally { clearInterval(tick); }
    expect(heartbeats).toBeGreaterThan(0);
    expect(progress.map(([done]) => done)).toEqual([16384, 32768, 49152, 65536, 65537]);
    expect(progress.every(([done, total]) => done <= total && total === 65537)).toBe(true);
  });

  const operations: readonly [string, (options: CharacterRasterWorkOptions) => Promise<unknown>][] = [
    ["matte", (options) => alphaOnlyCooperatively(raster(65536), options)],
    ["shading", (options) => deriveCharacterShadingLayersCooperatively(raster(65536), raster(65536, 55), options)],
    ["line", (options) => sobelEdgeAlphaCooperatively(raster(65536), 256, 256, {}, options)],
  ];
  it.each(operations)("cancels %s after its first chunk without publishing a result", async (_name, operation) => {
    const controller = new AbortController();
    const onProgress = vi.fn(() => controller.abort());
    await expect(operation({ signal: controller.signal, onProgress })).rejects.toMatchObject({ name: "AbortError" });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
  it.each(operations)("rejects stale authority during %s", async (_name, operation) => {
    let current = true;
    const onProgress = vi.fn(() => { current = false; });
    await expect(operation({ assertCurrent: () => { if (!current) throw new Error("stale"); }, onProgress })).rejects.toThrow("stale");
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
  it("does not publish a success after cancellation in the final progress callback", async () => {
    const controller = new AbortController();
    await expect(alphaOnlyCooperatively(raster(1), {
      signal: controller.signal, onProgress: () => controller.abort(),
    })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("removes the abort listener on success and cancellation of a scheduled task", async () => {
    for (const cancel of [false, true]) {
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const pending = yieldCharacterRasterWork({ signal: controller.signal });
      if (cancel) controller.abort();
      if (cancel) await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      else await pending;
      expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    }
  });
  it("rejects before work for an already aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const onProgress = vi.fn();
    await expect(alphaOnlyCooperatively(raster(1), { signal: controller.signal, onProgress })).rejects.toMatchObject({ name: "AbortError" });
    expect(onProgress).not.toHaveBeenCalled();
  });
  it.each([new Uint8ClampedArray(), new Uint8ClampedArray(3), new Uint8ClampedArray(2048 * 2048 * 4 + 4)])(
    "rejects malformed or over-budget storage", async (bytes) => {
      await expect(alphaOnlyCooperatively(bytes)).rejects.toThrow(TypeError);
    },
  );
  it.each([[0, 1], [1.5, 1], [NaN, 1], [2049, 1], [1, 2049], [2, 2]])(
    "rejects invalid dimensions %s × %s", async (width, height) => {
      await expect(sobelEdgeAlphaCooperatively(raster(1), width, height)).rejects.toThrow(TypeError);
    },
  );
  it("rejects mismatched shading passes", async () => {
    await expect(deriveCharacterShadingLayersCooperatively(raster(1), raster(2))).rejects.toThrow(TypeError);
  });
});
