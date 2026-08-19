import { beforeEach, describe, expect, it } from "vitest";

import {
  clearStudioBrushSoftFalloffStampCache,
  prepareStudioBrushSoftFalloffTintedStampSurface,
  rasterizeStudioBrushSoftFalloffMaskRgba,
  studioBrushSoftFalloffStampCacheStats,
  STUDIO_BRUSH_SOFT_FALLOFF_STAMP_CACHE_ENTRY_LIMIT,
  STUDIO_BRUSH_SOFT_FALLOFF_STAMP_GUTTER_PIXELS,
  STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION,
  type StudioBrushSoftFalloffStampSurface,
  type StudioBrushSoftFalloffStampSurfaceContext,
} from "./studio-brush-soft-falloff-stamp";

function parseHexRgba(
  color: string,
): readonly [red: number, green: number, blue: number, alpha: number] {
  const source = color.slice(1);
  const expanded = source.length <= 4
    ? [...source].map((channel) => `${channel}${channel}`).join("")
    : source;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
    expanded.length === 8
      ? Number.parseInt(expanded.slice(6, 8), 16)
      : 255,
  ];
}

class PixelSurfaceContext implements StudioBrushSoftFalloffStampSurfaceContext {
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  pixels = new Uint8ClampedArray();
  sourcePixels: Uint8ClampedArray | null = null;
  tintColor: readonly [number, number, number, number] | null = null;
  imageDataAllocations = 0;
  drawCalls = 0;
  fillCalls = 0;

  createImageData(width: number, height: number): ImageData {
    this.imageDataAllocations += 1;
    return {
      width,
      height,
      colorSpace: "srgb",
      data: new Uint8ClampedArray(width * height * 4),
    } as ImageData;
  }

  putImageData(imageData: ImageData): void {
    this.pixels = new Uint8ClampedArray(imageData.data);
    this.sourcePixels = null;
    this.tintColor = null;
  }

  drawImage(image: CanvasImageSource): void {
    this.drawCalls += 1;
    const source = image as unknown as PixelSurface;
    if (this.globalCompositeOperation !== "copy") {
      throw new Error("test surface only supports deterministic copy");
    }
    this.sourcePixels = source.context.pixels;
  }

  fillRect(): void {
    this.fillCalls += 1;
    if (
      this.globalCompositeOperation !== "source-in"
      || typeof this.fillStyle !== "string"
    ) {
      throw new Error("test surface only supports exact source-in tint");
    }
    this.tintColor = parseHexRgba(this.fillStyle);
  }
}

class PixelSurface {
  readonly context = new PixelSurfaceContext();

  constructor(
    public width: number,
    public height: number,
  ) {}

  getContext(): StudioBrushSoftFalloffStampSurfaceContext {
    return this.context;
  }
}

function pixelSurfaceFactory(surfaces: PixelSurface[]) {
  return (
    width: number,
    height: number,
  ): StudioBrushSoftFalloffStampSurface => {
    const surface = new PixelSurface(width, height);
    surfaces.push(surface);
    return surface as unknown as StudioBrushSoftFalloffStampSurface;
  };
}

function centreRgba(surface: PixelSurface): readonly number[] {
  const centre = Math.floor(surface.width / 2);
  const offset = (centre * surface.width + centre) * 4;
  const sourcePixels = surface.context.sourcePixels;
  const tintColor = surface.context.tintColor;
  if (sourcePixels && tintColor) {
    return [
      tintColor[0],
      tintColor[1],
      tintColor[2],
      Math.round(sourcePixels[offset + 3]! * tintColor[3] / 255),
    ];
  }
  return [...surface.context.pixels.slice(offset, offset + 4)];
}

describe("studio analytic soft-falloff stamp", () => {
  beforeEach(() => {
    clearStudioBrushSoftFalloffStampCache();
  });

  it("samples the exact radial equation with a transparent bilinear gutter", () => {
    const exponent = 3.2;
    const raster = rasterizeStudioBrushSoftFalloffMaskRgba(exponent);
    expect(raster).not.toBeNull();
    if (!raster) throw new Error("expected analytic falloff pixels");

    expect(raster.resolution).toBe(
      STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION,
    );
    expect(raster.gutterPixels).toBe(
      STUDIO_BRUSH_SOFT_FALLOFF_STAMP_GUTTER_PIXELS,
    );
    expect(raster.surfaceSize).toBe(
      STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION
        + STUDIO_BRUSH_SOFT_FALLOFF_STAMP_GUTTER_PIXELS * 2,
    );
    const centre = raster.surfaceSize / 2;
    const unitRadius = raster.resolution / 2;
    const alphaAt = (x: number, y: number) =>
      raster.pixels[(y * raster.surfaceSize + x) * 4 + 3]! / 255;
    const oracleAt = (x: number, y: number) => {
      const radius = Math.hypot(
        (x + 0.5 - centre) / unitRadius,
        (y + 0.5 - centre) / unitRadius,
      );
      return radius < 1 ? Math.pow(1 - radius, exponent) : 0;
    };
    const centrePixel = Math.floor(centre);
    const samples = [
      [centrePixel, centrePixel],
      [centrePixel - 1, centrePixel - 1],
      [centrePixel - 64, centrePixel],
      [1, centrePixel],
      [0, centrePixel],
      [centrePixel, 0],
      [raster.surfaceSize - 1, raster.surfaceSize - 1],
    ] as const;
    for (const [x, y] of samples) {
      expect(alphaAt(x, y)).toBeCloseTo(oracleAt(x, y), 2);
    }
    expect(alphaAt(centrePixel, centrePixel)).toBe(1);

    let alphaSum = 0;
    for (let index = 3; index < raster.pixels.length; index += 4) {
      alphaSum += raster.pixels[index]! / 255;
    }
    // Integral over the unit disk divided by the enclosing 2×2 square:
    // π/2 ∫₀¹ r(1-r)^e dr = π / (2(e+1)(e+2)).
    const analyticSquareMean = Math.PI
      / (2 * (exponent + 1) * (exponent + 2));
    const rasterSquareMean = alphaSum / (raster.resolution ** 2);
    expect(rasterSquareMean).toBeCloseTo(analyticSquareMean, 3);
    expect([...raster.pixels.slice(0, 4)]).toEqual([255, 255, 255, 0]);
  });

  it("caches masks by profile while tinting every dab to its exact colour", () => {
    const surfaces: PixelSurface[] = [];
    const factory = pixelSurfaceFactory(surfaces);

    const first = prepareStudioBrushSoftFalloffTintedStampSurface(
      3.2,
      "#369",
      factory,
    ) as unknown as PixelSurface;
    expect(centreRgba(first)).toEqual([0x33, 0x66, 0x99, 0xff]);

    const recolored = prepareStudioBrushSoftFalloffTintedStampSurface(
      3.2,
      "#cc440080",
      factory,
    ) as unknown as PixelSurface;
    expect(recolored).not.toBe(first);
    expect(centreRgba(recolored)).toEqual([0xcc, 0x44, 0x00, 0x80]);

    const exponentVariant = prepareStudioBrushSoftFalloffTintedStampSurface(
      2.4,
      "#336699",
      factory,
    );
    const resolutionVariant = prepareStudioBrushSoftFalloffTintedStampSurface(
      3.2,
      "#336699",
      factory,
      128,
    );

    expect(exponentVariant).not.toBeNull();
    expect(resolutionVariant).not.toBeNull();
    // Three immutable masks plus four exact-colour promoted surfaces.
    expect(surfaces).toHaveLength(7);
    expect(studioBrushSoftFalloffStampCacheStats()).toMatchObject({
      entries: 3,
      tintedEntries: 4,
      scratchSurfaces: 0,
      surfaceAllocations: 7,
      hits: 1,
      misses: 3,
      tintedHits: 0,
      tintPasses: 4,
    });
  });

  it("promotes a repeated exact colour so 10k dabs require one tint pass", () => {
    const surfaces: PixelSurface[] = [];
    const factory = pixelSurfaceFactory(surfaces);
    let rendered: StudioBrushSoftFalloffStampSurface | null = null;
    for (let index = 0; index < 10_000; index += 1) {
      rendered = prepareStudioBrushSoftFalloffTintedStampSurface(
        3.2,
        "#336699",
        factory,
      );
      expect(rendered).not.toBeNull();
    }

    expect(centreRgba(rendered as unknown as PixelSurface))
      .toEqual([0x33, 0x66, 0x99, 0xff]);
    expect(surfaces).toHaveLength(2);
    expect(studioBrushSoftFalloffStampCacheStats()).toMatchObject({
      entries: 1,
      tintedEntries: 1,
      scratchSurfaces: 0,
      surfaceAllocations: 2,
      hits: 0,
      misses: 1,
      tintedHits: 9_999,
      tintPasses: 1,
    });
  });

  it("keeps 10k distinct jitter colours at one mask and one reusable scratch allocation", () => {
    const surfaces: PixelSurface[] = [];
    const factory = pixelSurfaceFactory(surfaces);
    let expectedLastColor = "";
    let rendered: StudioBrushSoftFalloffStampSurface | null = null;
    for (let index = 0; index < 10_000; index += 1) {
      const red = Math.imul(index + 1, 0x45d9f3b) & 0xff;
      const green = Math.imul(index + 7, 0x119de1f3) >>> 8 & 0xff;
      const blue = Math.imul(index + 13, 0x3449d) >>> 16 & 0xff;
      expectedLastColor = `#${[red, green, blue].map((channel) =>
        channel.toString(16).padStart(2, "0")
      ).join("")}`;
      rendered = prepareStudioBrushSoftFalloffTintedStampSurface(
        3.2,
        expectedLastColor,
        factory,
      );
      expect(rendered).not.toBeNull();
    }

    expect(surfaces).toHaveLength(10);
    expect(centreRgba(rendered as unknown as PixelSurface)).toEqual([
      ...parseHexRgba(expectedLastColor).slice(0, 3),
      255,
    ]);
    expect(studioBrushSoftFalloffStampCacheStats()).toMatchObject({
      entries: 1,
      tintedEntries: 8,
      scratchSurfaces: 1,
      surfaceAllocations: 10,
      hits: 9_999,
      misses: 1,
      tintedHits: 0,
      tintPasses: 10_000,
    });
    // Only the immutable mask creates ImageData; tinting stays on the reusable Canvas surface.
    expect(surfaces.reduce(
      (sum, surface) => sum + surface.context.imageDataAllocations,
      0,
    )).toBe(1);
  });

  it("produces the same exact colours regardless of cache population order", () => {
    const colors = ["#1274e8", "#e83912", "#43a047"] as const;
    const renderOrder = (
      order: readonly string[],
    ): Readonly<Record<string, readonly number[]>> => {
      clearStudioBrushSoftFalloffStampCache();
      const surfaces: PixelSurface[] = [];
      const factory = pixelSurfaceFactory(surfaces);
      const resolved: Record<string, readonly number[]> = {};
      for (const color of order) {
        const surface = prepareStudioBrushSoftFalloffTintedStampSurface(
          3.2,
          color,
          factory,
        ) as unknown as PixelSurface;
        resolved[color] = centreRgba(surface);
      }
      return resolved;
    };

    const forward = renderOrder(colors);
    const reverse = renderOrder([...colors].reverse());
    expect(reverse).toEqual(forward);
  });

  it("bounds unique profile masks with LRU eviction and releases backing stores", () => {
    const surfaces: PixelSurface[] = [];
    const factory = pixelSurfaceFactory(surfaces);
    for (
      let index = 0;
      index <= STUDIO_BRUSH_SOFT_FALLOFF_STAMP_CACHE_ENTRY_LIMIT;
      index += 1
    ) {
      expect(prepareStudioBrushSoftFalloffTintedStampSurface(
        1 + index / 64,
        "#336699",
        factory,
      )).not.toBeNull();
    }

    expect(studioBrushSoftFalloffStampCacheStats()).toMatchObject({
      entries: STUDIO_BRUSH_SOFT_FALLOFF_STAMP_CACHE_ENTRY_LIMIT,
      tintedEntries: STUDIO_BRUSH_SOFT_FALLOFF_STAMP_CACHE_ENTRY_LIMIT,
      scratchSurfaces: 0,
    });
    expect(surfaces).toHaveLength(
      (STUDIO_BRUSH_SOFT_FALLOFF_STAMP_CACHE_ENTRY_LIMIT + 1) * 2,
    );
    expect(surfaces[0]).toMatchObject({ width: 1, height: 1 });
    expect(surfaces[1]).toMatchObject({ width: 1, height: 1 });
  });

  it("fails closed without retaining a malformed profile, colour or factory", () => {
    const validFactory = pixelSurfaceFactory([]);
    expect(prepareStudioBrushSoftFalloffTintedStampSurface(
      Number.NaN,
      "#336699",
      validFactory,
    )).toBeNull();
    expect(prepareStudioBrushSoftFalloffTintedStampSurface(
      3.2,
      "rebeccapurple",
      validFactory,
    )).toBeNull();
    expect(prepareStudioBrushSoftFalloffTintedStampSurface(
      3.2,
      "#336699",
      validFactory,
      8,
    )).toBeNull();
    expect(prepareStudioBrushSoftFalloffTintedStampSurface(
      3.2,
      "#336699",
      () => null,
    )).toBeNull();
    expect(studioBrushSoftFalloffStampCacheStats()).toMatchObject({
      entries: 0,
      tintedEntries: 0,
      scratchSurfaces: 0,
      surfaceAllocations: 0,
    });
  });

  it("clears both indexes and reallocates full-size mask/scratch surfaces", () => {
    const surfaces: PixelSurface[] = [];
    const factory = pixelSurfaceFactory(surfaces);
    const first = prepareStudioBrushSoftFalloffTintedStampSurface(
      3.2,
      "#336699",
      factory,
    );
    expect(first).not.toBeNull();
    expect(surfaces).toHaveLength(2);

    clearStudioBrushSoftFalloffStampCache();

    expect(studioBrushSoftFalloffStampCacheStats()).toEqual({
      entries: 0,
      tintedEntries: 0,
      scratchSurfaces: 0,
      bytes: 0,
      surfaceAllocations: 0,
      hits: 0,
      misses: 0,
      tintedHits: 0,
      tintPasses: 0,
    });
    expect(surfaces.every((surface) =>
      surface.width === 1 && surface.height === 1
    )).toBe(true);

    const replay = prepareStudioBrushSoftFalloffTintedStampSurface(
      3.2,
      "#336699",
      factory,
    );
    expect(replay).not.toBeNull();
    expect(replay).not.toBe(first);
    expect(surfaces).toHaveLength(4);
    expect(surfaces.slice(2).every((surface) =>
      surface.width === STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION + 2
      && surface.height === STUDIO_BRUSH_SOFT_FALLOFF_STAMP_RESOLUTION + 2
    )).toBe(true);
  });
});
