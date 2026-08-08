import { readFile } from "node:fs/promises";

import { solidPaint } from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import { velloCpuProviderDescriptor } from "../descriptor";
import { loadVelloNode } from "../node";
import { renderSceneToPixels } from "../render";
import {
  shapeTextVerticalToGlyphPaths,
  verticalShapedTextSchema,
} from "../text-vertical";

import type { VerticalShapedText } from "../text-vertical";
import type { PathIR, SceneIR } from "@toonspectrum/studio-project-model";

/**
 * Vertical writing lane (세로쓰기, V12 Text row) TS-boundary contracts:
 * zod schema, column geometry, warnings (no silent loss) and cross-renderer
 * ink parity for the rotated/stacked glyph PathIR.
 */

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

function pathBounds(path: PathIR): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const verb of path.verbs) {
    for (const [key, value] of Object.entries(verb)) {
      if (typeof value !== "number") continue;
      if (key.endsWith("x")) {
        minX = Math.min(minX, value);
        maxX = Math.max(maxX, value);
      } else if (key.endsWith("y")) {
        minY = Math.min(minY, value);
        maxY = Math.max(maxY, value);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function glyphScene(shaped: VerticalShapedText, width: number, height: number): SceneIR {
  return {
    version: 11,
    width,
    height,
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

function inkCount(pixels: Uint8Array): number {
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if ((pixels[offset] ?? 255) < 200) count += 1;
  }
  return count;
}

describe("vertical text lane (wasm)", () => {
  it("shapes into schema-valid vertical glyph paths with fallback metrics", () => {
    const shaped = shapeTextVerticalToGlyphPaths("Vertical", fontBytes, {
      fontSizePx: 32,
      maxHeightPx: 4000,
    });
    expect(verticalShapedTextSchema.parse(shaped)).toEqual(shaped);
    expect(shaped.columnCount).toBe(1);
    // Roboto ships no vhea/vmtx: the 1em fallback is an explicit contract,
    // never a silent guess.
    expect(shaped.verticalMetricsSource).toBe("fallback-1em");
    expect(shaped.columnAdvance).toBe(32);
    expect(
      shaped.warnings.some((warning) => warning.includes("vhea/vmtx")),
    ).toBe(true);
    expect(shaped.glyphs.length).toBe(8);
    expect(shaped.glyphs.every((glyph) => glyph.rotated)).toBe(true);
  });

  it("stacks a rotated latin run vertically inside one column band", () => {
    const shaped = shapeTextVerticalToGlyphPaths("Ink", fontBytes, {
      fontSizePx: 48,
      maxHeightPx: 400,
    });
    const bounds = shaped.glyphs
      .filter((glyph) => glyph.path.verbs.length > 0)
      .map((glyph) => pathBounds(glyph.path));
    expect(bounds.length).toBeGreaterThanOrEqual(3);
    // Successive glyph boxes progress downward (vertical stacking)…
    for (let index = 1; index < bounds.length; index += 1) {
      const prev = bounds[index - 1];
      const next = bounds[index];
      if (prev === undefined || next === undefined) throw new Error("bounds");
      expect(next.minY).toBeGreaterThan(prev.minY);
    }
    // …while every outline stays inside the single column band (1em column
    // plus the rotated line-box overhang of ~(lineHeight - 1em) / 2).
    const overhang = shaped.columnAdvance * 0.25;
    for (const box of bounds) {
      expect(box.minX).toBeGreaterThanOrEqual(-overhang);
      expect(box.maxX).toBeLessThanOrEqual(shaped.columnAdvance + overhang);
    }
  });

  it("wraps columns right-to-left when maxHeightPx is exceeded", () => {
    const shaped = shapeTextVerticalToGlyphPaths("aaa bbb ccc", fontBytes, {
      fontSizePx: 32,
      maxHeightPx: 60,
    });
    expect(shaped.columnCount).toBe(3);
    expect(shaped.columns.map((column) => column.x)).toEqual([
      2 * shaped.columnAdvance,
      shaped.columnAdvance,
      0,
    ]);
    // First-written column (index 0) is the rightmost one.
    const columnsUsed = new Set(shaped.glyphs.map((glyph) => glyph.column));
    expect([...columnsUsed].sort()).toEqual([0, 1, 2]);
    expect(shaped.width).toBe(3 * shaped.columnAdvance);
  });

  it("keeps hangul without CJK coverage loud: notdef lane plus warnings", () => {
    // tests/corpus/text ships Roboto only (CJK fonts wait on the license
    // gate), so the Korean contract here is structural: no crash, no silent
    // drop, per-character coverage warnings.
    const shaped = shapeTextVerticalToGlyphPaths("말풍선", fontBytes, {
      fontSizePx: 24,
      maxHeightPx: 4000,
    });
    expect(shaped.glyphs.length).toBeGreaterThan(0);
    for (const code of ["U+B9D0", "U+D48D", "U+C120"]) {
      expect(
        shaped.warnings.some(
          (warning) => warning.includes(code) && warning.includes("not covered"),
        ),
      ).toBe(true);
    }
    // Upright cells advance exactly 1em each under the fallback metrics.
    expect(shaped.height).toBeCloseTo(3 * 24, 3);
    expect(shaped.glyphs.every((glyph) => !glyph.rotated)).toBe(true);
  });

  it("is deterministic at the TS boundary", () => {
    const options = { fontSizePx: 24, maxHeightPx: 90 };
    const first = shapeTextVerticalToGlyphPaths("세로 vertical 123", fontBytes, options);
    const second = shapeTextVerticalToGlyphPaths("세로 vertical 123", fontBytes, options);
    expect(second).toEqual(first);
  });

  it("declares the vertical text capability on the vello-cpu descriptor", () => {
    expect(velloCpuProviderDescriptor.capabilities).toContain(
      "render.text.vertical",
    );
  });

  it("renders vertical glyph paths equivalently through vello and canvaskit", async () => {
    const shaped = shapeTextVerticalToGlyphPaths("Ink", fontBytes, {
      fontSizePx: 48,
      maxHeightPx: 400,
    });
    const scene = glyphScene(shaped, 96, 144);
    const velloPixels = renderSceneToPixels(scene);
    const { loadCanvasKitNode } = await import(
      "@toonspectrum/studio-engine-skia/node"
    );
    const { renderSceneToPixels: renderWithSkia } = await import(
      "@toonspectrum/studio-engine-skia"
    );
    const ck = await loadCanvasKitNode();
    const skiaPixels = renderWithSkia(ck, scene);
    const velloInk = inkCount(velloPixels);
    const skiaInk = inkCount(skiaPixels);
    expect(velloInk).toBeGreaterThan(150);
    // Same rotated/stacked PathIR must land within 10% ink coverage on both
    // engines — the cross-renderer guarantee of the text island.
    expect(Math.abs(velloInk - skiaInk) / Math.max(velloInk, skiaInk)).toBeLessThan(0.1);
  });
});
