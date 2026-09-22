// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  createSkiaDocumentFontCache,
  SkiaDocumentFontAdmissionError,
} from "../document-fonts";

import type {
  SkiaDocumentItem,
  SkiaDocumentText,
} from "../document-contract";
import type { Canvas, CanvasKit } from "canvaskit-wasm";

function text(): SkiaDocumentText {
  return {
    text: "안녕하세요 GPU",
    x: 20,
    y: 30,
    width: 240,
    fontSize: 24,
    rotation: 15,
    opacity: 0.75,
    color: { r: 1, g: 0.5, b: 0.25, a: 1 },
    align: "center",
    letterSpacing: 1.5,
    lineHeight: 1.2,
    weight: 700,
    italic: true,
    font: { key: "font:test", family: "Test Family" },
  };
}

function item(value = text()): SkiaDocumentItem {
  return { id: "text", revision: {}, text: value };
}

function harness(unresolved: number[] = []) {
  const provider = { registerFont: vi.fn(), delete: vi.fn() };
  const paragraph = {
    layout: vi.fn(),
    getLineMetrics: vi.fn(() => [{ baseline: 22, ascent: -18 }]),
    unresolvedCodepoints: vi.fn(() => unresolved),
    delete: vi.fn(),
  };
  const builder = {
    addText: vi.fn(),
    build: vi.fn(() => paragraph),
    delete: vi.fn(),
  };
  const make = vi.fn(() => builder);
  const ck = {
    TypefaceFontProvider: { Make: vi.fn(() => provider) },
    ParagraphBuilder: { MakeFromFontProvider: make },
    ParagraphStyle: class {
      constructor(value: object) { Object.assign(this, value); }
    },
    TextStyle: class {
      constructor(value: object) { Object.assign(this, value); }
    },
    TextAlign: { Left: 1, Center: 2, Right: 3 },
    TextDirection: { LTR: 1 },
    FontWeight: { Normal: 400, Bold: 700 },
    FontWidth: { Normal: 5 },
    FontSlant: { Upright: 0, Italic: 1 },
  } as unknown as CanvasKit;
  const canvas = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawParagraph: vi.fn(),
  } as unknown as Canvas;
  return { ck, provider, paragraph, builder, make, canvas };
}

describe("retained GPU document font cache", () => {
  it("registers one family, reuses it and draws exact paragraph metadata", async () => {
    const h = harness();
    const loader = vi.fn(async () => [new Uint8Array([1, 2, 3, 4])]);
    const cache = createSkiaDocumentFontCache(h.ck, loader);
    const controller = new AbortController();
    await cache.prepare([item()], controller.signal);
    await cache.prepare([item()], controller.signal);
    expect(loader).toHaveBeenCalledOnce();
    expect(h.provider.registerFont).toHaveBeenCalledOnce();
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(4);

    cache.draw(h.canvas, text());
    expect(h.make).toHaveBeenCalledWith(expect.objectContaining({
      textAlign: 2,
      textStyle: expect.objectContaining({
        fontFamilies: ["Test Family"],
        fontSize: 24,
        fontStyle: { weight: 700, width: 5, slant: 1 },
        heightMultiplier: 1.2,
        letterSpacing: 1.5,
      }),
    }), h.provider);
    expect(h.builder.addText).toHaveBeenCalledWith("안녕하세요 GPU");
    expect(h.paragraph.layout).toHaveBeenCalledWith(240);
    expect(h.canvas.translate).toHaveBeenCalledWith(20, 30);
    expect(h.canvas.rotate).toHaveBeenCalledWith(15, 0, 0);
    expect(h.canvas.drawParagraph).toHaveBeenCalledWith(h.paragraph, 0, -4);

    cache.retain([]);
    expect(h.provider.delete).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    cache.dispose();
  });

  it("fails closed when the registered family misses a glyph", async () => {
    const h = harness([0x1f642]);
    const cache = createSkiaDocumentFontCache(
      h.ck,
      async () => [new Uint8Array([1])],
    );
    await cache.prepare([item()], new AbortController().signal);
    expect(() => cache.draw(h.canvas, text())).toThrow(
      SkiaDocumentFontAdmissionError,
    );
    expect(h.paragraph.delete).toHaveBeenCalledOnce();
    expect(h.builder.delete).toHaveBeenCalledOnce();
    cache.dispose();
  });

  it("releases partially registered providers when registration fails", async () => {
    const h = harness();
    h.provider.registerFont.mockImplementationOnce(() => {
      throw new Error("bad font");
    });
    const cache = createSkiaDocumentFontCache(
      h.ck,
      async () => [new Uint8Array([1])],
    );
    await expect(cache.prepare(
      [item()],
      new AbortController().signal,
    )).rejects.toBeInstanceOf(SkiaDocumentFontAdmissionError);
    expect(h.provider.delete).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    cache.dispose();
  });

  it("fails closed when a font loader ignores cancellation and exceeds its deadline", async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const cache = createSkiaDocumentFontCache(
        h.ck,
        () => new Promise<readonly Uint8Array[]>(() => undefined),
        10,
      );
      const preparing = cache.prepare(
        [item()],
        new AbortController().signal,
      );
      const rejection = expect(preparing).rejects.toThrow(
        "GPU font preparation timed out",
      );
      await vi.advanceTimersByTimeAsync(11);
      await rejection;
      expect(cache.size).toBe(0);
      cache.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
