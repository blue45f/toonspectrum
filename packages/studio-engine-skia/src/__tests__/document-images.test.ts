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
      skewX: 0, skewY: 0, cornerRadius: 0, blendMode: "source-over",
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

    const paint = {
      setAntiAlias: vi.fn(), setAlphaf: vi.fn(), setBlendMode: vi.fn(),
      setImageFilter: vi.fn(), delete: vi.fn(),
    };
    const canvas = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      skew: vi.fn(), scale: vi.fn(), clipRRect: vi.fn(), saveLayer: vi.fn(),
      drawImageRectOptions: vi.fn(),
    };
    const ck = {
      Paint: class { constructor() { return paint; } },
      FilterMode: { Linear: 1 },
      MipmapMode: { None: 0 },
      BlendMode: { SrcOver: 1 },
      ClipOp: { Intersect: 1 },
      RRectXY: vi.fn((rect: unknown) => rect),
      ImageFilter: { MakeDropShadow: vi.fn() },
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

  it("fails closed when an image loader ignores cancellation and exceeds its deadline", async () => {
    vi.useFakeTimers();
    try {
      const cache = createSkiaDocumentImageCache(
        () => new Promise<ImageBitmap>(() => undefined),
        10,
      );
      const surface = {
        makeImageFromTextureSource: vi.fn(),
      } as unknown as Surface;
      const preparing = cache.prepare(
        [imageItem("data:image/png;base64,timeout")],
        surface,
        new AbortController().signal,
      );
      const rejection = expect(preparing).rejects.toThrow(
        "GPU image preparation timed out",
      );
      await vi.advanceTimersByTimeAsync(11);
      await rejection;
      expect(cache.size).toBe(0);
      expect(surface.makeImageFromTextureSource).not.toHaveBeenCalled();
      cache.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates rounded, skewed, blended shadow images exactly once", async () => {
    const texture = { width: () => 4, height: () => 3, delete: vi.fn() } as unknown as Image;
    const cache = createSkiaDocumentImageCache(async () => bitmap());
    const surface = { makeImageFromTextureSource: () => texture } as unknown as Surface;
    const base = imageItem("data:image/png;base64,effect");
    const effect = {
      ...base.image!,
      skewX: 0.25,
      skewY: -0.1,
      cornerRadius: 8,
      blendMode: "multiply" as const,
      shadow: {
        color: { r: 0.1, g: 0.2, b: 0.3, a: 0.5 },
        blur: 8,
        offsetX: 4,
        offsetY: -3,
        opacity: 0.6,
      },
    };
    await cache.prepare([{ ...base, image: effect }], surface, new AbortController().signal);

    const paints = Array.from({ length: 2 }, () => ({
      setAntiAlias: vi.fn(), setAlphaf: vi.fn(), setBlendMode: vi.fn(),
      setImageFilter: vi.fn(), delete: vi.fn(),
    }));
    let paintIndex = 0;
    const filter = { delete: vi.fn() };
    const makeDropShadow = vi.fn((..._args: unknown[]) => filter);
    const canvas = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      skew: vi.fn(), scale: vi.fn(), clipRRect: vi.fn(), saveLayer: vi.fn(),
      drawImageRectOptions: vi.fn(),
    };
    const ck = {
      Paint: class { constructor() { return paints[paintIndex++]!; } },
      FilterMode: { Linear: 1 }, MipmapMode: { None: 0 },
      BlendMode: { SrcOver: 1, Multiply: 2 }, ClipOp: { Intersect: 1 },
      RRectXY: vi.fn((rect: unknown, rx: number, ry: number) => ({ rect, rx, ry })),
      ImageFilter: { MakeDropShadow: makeDropShadow },
    } as unknown as CanvasKit;

    cache.draw(ck, canvas as never, effect);
    expect(canvas.skew).toHaveBeenCalledWith(0.25, -0.1);
    expect(canvas.clipRRect).toHaveBeenCalledOnce();
    expect(canvas.saveLayer).toHaveBeenCalledOnce();
    expect(paints[1]!.setAlphaf).toHaveBeenCalledWith(0.5);
    expect(paints[1]!.setBlendMode).toHaveBeenCalledWith(2);
    expect(makeDropShadow).toHaveBeenCalledOnce();
    const shadowCall = makeDropShadow.mock.calls[0]!;
    expect(shadowCall.slice(0, 4)).toEqual([4, -3, 4, 4]);
    expect(shadowCall[4]).toBeInstanceOf(Float32Array);
    const shadowColor = shadowCall[4] as Float32Array;
    expect(shadowColor[0]).toBeCloseTo(0.1);
    expect(shadowColor[1]).toBeCloseTo(0.2);
    expect(shadowColor[2]).toBeCloseTo(0.3);
    expect(shadowColor[3]).toBeCloseTo(0.3);
    expect(shadowCall[5]).toBeNull();
    expect(canvas.drawImageRectOptions).toHaveBeenCalledOnce();
    expect(filter.delete).toHaveBeenCalledOnce();
    expect(paints.every((paint) => paint.delete.mock.calls.length === 1)).toBe(true);
    cache.dispose();
  });
});
