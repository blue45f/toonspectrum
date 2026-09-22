// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { createSkiaDocumentImageCache } from "../document-images";

import type { SkiaDocumentItem } from "../document-contract";
import type { CanvasKit, Image, Surface } from "canvaskit-wasm";

function imageItem(src: string): SkiaDocumentItem {
  return {
    id: src,
    revision: {},
    image: {
      src, x: 10, y: 20, width: 40, height: 30, rotation: 15,
      opacity: 0.5, flipX: true, flipY: false,
    },
  };
}

function bitmap(width = 4, height = 3): ImageBitmap {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

describe("retained GPU document image cache", () => {
  it("loads one texture per source and releases removed sources", async () => {
    const source = bitmap();
    const loader = vi.fn(async () => source);
    const texture = { width: () => 4, height: () => 3, delete: vi.fn() } as unknown as Image;
    const surface = {
      makeImageFromTextureSource: vi.fn(() => texture),
    } as unknown as Surface;
    const cache = createSkiaDocumentImageCache(loader);
    const controller = new AbortController();
    await cache.prepare([imageItem("data:image/png;base64,a")], surface, controller.signal);
    await cache.prepare([imageItem("data:image/png;base64,a")], surface, controller.signal);
    expect(loader).toHaveBeenCalledOnce();
    expect(source.close).toHaveBeenCalledOnce();
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(48);
    cache.retain([]);
    expect(texture.delete).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    cache.dispose();
  });

  it("draws transform and opacity through one GPU texture", async () => {
    const texture = { width: () => 4, height: () => 3, delete: vi.fn() } as unknown as Image;
    const source = bitmap();
    const cache = createSkiaDocumentImageCache(async () => source);
    const surface = { makeImageFromTextureSource: () => texture } as unknown as Surface;
    await cache.prepare([imageItem("data:image/png;base64,b")], surface, new AbortController().signal);

    const paint = { setAntiAlias: vi.fn(), setAlphaf: vi.fn(), delete: vi.fn() };
    const canvas = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
      drawImageRectOptions: vi.fn(),
    };
    const ck = {
      Paint: class { constructor() { return paint; } },
      FilterMode: { Linear: 1 },
      MipmapMode: { None: 0 },
    } as unknown as CanvasKit;

    cache.draw(ck, canvas as never, imageItem("data:image/png;base64,b").image!);
    expect(paint.setAlphaf).toHaveBeenCalledWith(0.5);
    expect(canvas.translate).toHaveBeenNthCalledWith(1, 10, 20);
    expect(canvas.rotate).toHaveBeenCalledWith(15, 0, 0);
    expect(canvas.scale).toHaveBeenCalledWith(-1, 1);
    expect(canvas.drawImageRectOptions).toHaveBeenCalledOnce();
    cache.dispose();
    expect(texture.delete).toHaveBeenCalledOnce();
  });
});
