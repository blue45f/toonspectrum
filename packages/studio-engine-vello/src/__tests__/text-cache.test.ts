import { readFile } from "node:fs/promises";

import { solidPaint } from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import { loadVelloNode } from "../node/index";
import { renderSceneToPixels } from "../render";
import { shapeTextToGlyphPaths } from "../text";
import {
  computeTextShapeKey,
  createTextShapeCache,
  estimateShapedTextBytes,
  fnv1a32,
  shapeTextCached,
} from "../text-cache";

import type { ShapeTextOptions, ShapedText } from "../text";
import type { SceneIR } from "@toonspectrum/studio-project-model";

const BASE_OPTIONS: ShapeTextOptions = { fontSizePx: 48, maxWidthPx: 400 };
const MB = 1024 * 1024;

let fontBytes: Uint8Array;

beforeAll(async () => {
  await loadVelloNode();
  fontBytes = new Uint8Array(
    await readFile(
      new URL(
        "../../../../tests/corpus/text/fonts/Roboto-Regular.ttf",
        import.meta.url,
      ),
    ),
  );
});

function glyphScene(shaped: ShapedText): SceneIR {
  return {
    version: 11,
    width: 128,
    height: 72,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: shaped.glyphs
      .filter((glyph) => glyph.path.verbs.length > 0)
      .map((glyph, index) => ({
        id: `g${index}`,
        kind: "fill-path" as const,
        path: glyph.path,
        paint: solidPaint(0, 0, 0),
        opacity: 1,
        blend: "src-over" as const,
        fillRule: "nonzero" as const,
      })),
  };
}

describe("text shape cache (glifo lane)", () => {
  it("identical request is one miss then one hit returning the canonical value", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 8 * MB });
    const first = shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    expect(cache.metrics()).toMatchObject({ hits: 0, misses: 1, entries: 1 });
    const second = shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    expect(cache.metrics()).toMatchObject({ hits: 1, misses: 1, entries: 1 });
    expect(second).toBe(first);
    expect(second).toEqual(shapeTextToGlyphPaths("Ink", fontBytes, BASE_OPTIONS));
  });

  it("cache-hit glyphs render byte-identical pixels vs uncached shaping", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 8 * MB });
    shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    const cached = shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    expect(cache.metrics().hits).toBe(1);
    const uncached = shapeTextToGlyphPaths("Ink", fontBytes, BASE_OPTIONS);
    const cachedPixels = renderSceneToPixels(glyphScene(cached));
    const uncachedPixels = renderSceneToPixels(glyphScene(uncached));
    const ink = (pixels: Uint8Array): number => {
      let count = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if ((pixels[offset] ?? 255) < 200) count += 1;
      }
      return count;
    };
    expect(ink(cachedPixels)).toBeGreaterThan(150);
    expect(Buffer.from(cachedPixels).equals(Buffer.from(uncachedPixels))).toBe(
      true,
    );
  });

  it("different text is a miss", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 8 * MB });
    shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    shapeTextCached(cache, "Ink!", fontBytes, BASE_OPTIONS);
    expect(cache.metrics()).toMatchObject({ hits: 0, misses: 2, entries: 2 });
  });

  it("different fontSizePx is a miss", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 8 * MB });
    shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    shapeTextCached(cache, "Ink", fontBytes, { ...BASE_OPTIONS, fontSizePx: 24 });
    expect(cache.metrics()).toMatchObject({ hits: 0, misses: 2, entries: 2 });
  });

  it("different maxWidthPx is a miss", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 8 * MB });
    shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    shapeTextCached(cache, "Ink", fontBytes, { ...BASE_OPTIONS, maxWidthPx: 64 });
    expect(cache.metrics()).toMatchObject({ hits: 0, misses: 2, entries: 2 });
  });

  it("keys are content-addressed over font bytes (fnv1a determinism)", () => {
    // Known FNV-1a 32-bit vectors: offset basis for empty input, "a" → 0xe40c292c.
    expect(fnv1a32(new Uint8Array(0))).toBe(0x811c9dc5);
    expect(fnv1a32(new Uint8Array([0x61]))).toBe(0xe40c292c);
    const a = new Uint8Array([1, 2, 3]);
    const mutated = new Uint8Array([1, 2, 4]);
    expect(computeTextShapeKey("x", a, BASE_OPTIONS)).not.toBe(
      computeTextShapeKey("x", mutated, BASE_OPTIONS),
    );
    // Same content in a different buffer instance derives the same key.
    expect(computeTextShapeKey("x", fontBytes, BASE_OPTIONS)).toBe(
      computeTextShapeKey("x", fontBytes.slice(), BASE_OPTIONS),
    );
  });

  it("a re-read of the same font content hits end to end", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 8 * MB });
    shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    shapeTextCached(cache, "Ink", fontBytes.slice(), BASE_OPTIONS);
    expect(cache.metrics()).toMatchObject({ hits: 1, misses: 1, entries: 1 });
  });

  it("evicts in LRU order: a refreshed entry survives, the stale one goes", () => {
    const cache = createTextShapeCache({ maxEntries: 2, maxBytes: 8 * MB });
    shapeTextCached(cache, "AA", fontBytes, BASE_OPTIONS);
    shapeTextCached(cache, "BB", fontBytes, BASE_OPTIONS);
    shapeTextCached(cache, "AA", fontBytes, BASE_OPTIONS); // refresh AA → BB is now LRU
    shapeTextCached(cache, "CC", fontBytes, BASE_OPTIONS); // evicts BB
    expect(cache.metrics()).toMatchObject({ evictions: 1, entries: 2 });
    const before = cache.metrics();
    shapeTextCached(cache, "AA", fontBytes, BASE_OPTIONS);
    expect(cache.metrics().hits).toBe(before.hits + 1);
    shapeTextCached(cache, "BB", fontBytes, BASE_OPTIONS);
    expect(cache.metrics().misses).toBe(before.misses + 1);
  });

  it("evicts when the approximate byte budget is exceeded", () => {
    // "AB" and "BA" shape the same glyphs, so their byte estimates are equal;
    // a budget of one entry plus slack admits the second and evicts the first.
    const estimate = estimateShapedTextBytes(
      shapeTextToGlyphPaths("AB", fontBytes, BASE_OPTIONS),
    );
    const cache = createTextShapeCache({
      maxEntries: 10,
      maxBytes: estimate + 16,
    });
    shapeTextCached(cache, "AB", fontBytes, BASE_OPTIONS);
    shapeTextCached(cache, "BA", fontBytes, BASE_OPTIONS);
    const metrics = cache.metrics();
    expect(metrics.evictions).toBe(1);
    expect(metrics.entries).toBe(1);
    expect(metrics.approxBytes).toBeLessThanOrEqual(cache.maxBytes);
    shapeTextCached(cache, "AB", fontBytes, BASE_OPTIONS); // evicted earlier → miss
    expect(cache.metrics().misses).toBe(3);
  });

  it("metrics track byte estimates of exactly the resident entries", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 8 * MB });
    const a = shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    const b = shapeTextCached(cache, "Wash", fontBytes, BASE_OPTIONS);
    expect(cache.metrics().approxBytes).toBe(
      estimateShapedTextBytes(a) + estimateShapedTextBytes(b),
    );
    cache.clear();
    expect(cache.metrics()).toMatchObject({
      entries: 0,
      approxBytes: 0,
      misses: 2,
    });
  });

  it("returned values are deep-frozen; mutation attempts throw and never pollute", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 8 * MB });
    const shaped = shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    expect(Object.isFrozen(shaped)).toBe(true);
    expect(() => {
      (shaped as { width: number }).width = 9999;
    }).toThrow(TypeError);
    expect(() => {
      (shaped.glyphs as unknown[]).push("junk");
    }).toThrow(TypeError);
    const firstVerb = shaped.glyphs[0]?.path.verbs[0];
    expect(firstVerb).toBeDefined();
    expect(() => {
      (firstVerb as unknown as { v: string }).v = "Z";
    }).toThrow(TypeError);
    // The cached payload still equals a fresh uncached shaping bit for bit.
    expect(shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS)).toEqual(
      shapeTextToGlyphPaths("Ink", fontBytes, BASE_OPTIONS),
    );
  });

  it("an entry larger than maxBytes is returned frozen but never admitted", () => {
    const cache = createTextShapeCache({ maxEntries: 8, maxBytes: 1 });
    const first = shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    const second = shapeTextCached(cache, "Ink", fontBytes, BASE_OPTIONS);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual(second);
    expect(cache.metrics()).toMatchObject({
      hits: 0,
      misses: 2,
      entries: 0,
      evictions: 0,
      approxBytes: 0,
    });
  });

  it("rejects invalid cache budgets", () => {
    expect(() => createTextShapeCache({ maxEntries: 0, maxBytes: MB })).toThrow(
      RangeError,
    );
    expect(() =>
      createTextShapeCache({ maxEntries: 1.5, maxBytes: MB }),
    ).toThrow(RangeError);
    expect(() => createTextShapeCache({ maxEntries: 4, maxBytes: 0 })).toThrow(
      RangeError,
    );
  });

  it("measured: 200 repeated shapings, cache off vs on (wall clock)", () => {
    const text = "Speech bubble SFX timeline 0123!";
    const options: ShapeTextOptions = { fontSizePx: 32, maxWidthPx: 512 };
    // Warm both lanes so JIT/wasm warmup is excluded from either side.
    shapeTextToGlyphPaths(text, fontBytes, options);
    const cache = createTextShapeCache({ maxEntries: 16, maxBytes: 8 * MB });
    shapeTextCached(cache, text, fontBytes, options);

    const uncachedStart = performance.now();
    for (let index = 0; index < 200; index += 1) {
      shapeTextToGlyphPaths(text, fontBytes, options);
    }
    const uncachedMs = performance.now() - uncachedStart;

    const cachedStart = performance.now();
    for (let index = 0; index < 200; index += 1) {
      shapeTextCached(cache, text, fontBytes, options);
    }
    const cachedMs = performance.now() - cachedStart;

    const speedup = uncachedMs / cachedMs;
    console.log(
      `[glifo bench] 200× shape "${text}" — uncached=${uncachedMs.toFixed(2)}ms ` +
        `cached=${cachedMs.toFixed(3)}ms speedup=${speedup.toFixed(1)}x`,
    );
    expect(cache.metrics().hits).toBe(200);
    expect(speedup).toBeGreaterThan(1);
  });
});
