import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  STUDIO_DRAWING_PALETTE_MAX_PERCENT,
  STUDIO_DRAWING_PALETTE_MIN_PERCENT,
  moveStudioDrawingPalette,
  normalizeStudioDrawingPaletteLayout,
  resizeStudioDrawingPalettes,
  toggleStudioDrawingPalette,
} from "./studio-drawing-palettes";

describe("Studio drawing palette layout", () => {
  it("provides a deeply frozen 36/64 default with both palettes expanded", () => {
    expect(DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT).toEqual({
      order: ["sub-tools", "tool-properties"],
      collapsed: {
        "sub-tools": false,
        "tool-properties": false,
      },
      sizes: {
        "sub-tools": 36,
        "tool-properties": 64,
      },
    });
    expect(Object.isFrozen(DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT)).toBe(true);
    expect(Object.isFrozen(DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.order)).toBe(true);
    expect(Object.isFrozen(DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.collapsed)).toBe(
      true,
    );
    expect(Object.isFrozen(DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.sizes)).toBe(true);
  });

  it("allowlists order and collapse state while appending a missing palette", () => {
    const normalized = normalizeStudioDrawingPaletteLayout({
      order: [
        "tool-properties",
        "unknown",
        "tool-properties",
      ],
      collapsed: {
        "sub-tools": true,
        "tool-properties": "yes",
        unknown: true,
      },
      sizes: {
        "sub-tools": 36,
        "tool-properties": 64,
        unknown: 100,
      },
      documentPayload: { mustNotPersist: true },
    });

    expect(normalized).toEqual({
      order: ["tool-properties", "sub-tools"],
      collapsed: {
        "sub-tools": true,
        "tool-properties": false,
      },
      sizes: {
        "sub-tools": 36,
        "tool-properties": 64,
      },
    });
    expect(JSON.stringify(normalized)).not.toContain("unknown");
    expect(JSON.stringify(normalized)).not.toContain("documentPayload");
  });

  it("normalizes arbitrary finite shares, clamps both ends, and always sums to 100", () => {
    const equal = normalizeStudioDrawingPaletteLayout({
      sizes: { "sub-tools": 70, "tool-properties": 70 },
    });
    const minimum = normalizeStudioDrawingPaletteLayout({
      sizes: { "sub-tools": 0, "tool-properties": 100 },
    });
    const maximum = normalizeStudioDrawingPaletteLayout({
      sizes: { "sub-tools": 100, "tool-properties": 0 },
    });
    const malformed = normalizeStudioDrawingPaletteLayout({
      sizes: {
        "sub-tools": Number.NaN,
        "tool-properties": Number.POSITIVE_INFINITY,
      },
    });

    expect(equal.sizes).toEqual({
      "sub-tools": 50,
      "tool-properties": 50,
    });
    expect(minimum.sizes).toEqual({
      "sub-tools": STUDIO_DRAWING_PALETTE_MIN_PERCENT,
      "tool-properties": STUDIO_DRAWING_PALETTE_MAX_PERCENT,
    });
    expect(maximum.sizes).toEqual({
      "sub-tools": STUDIO_DRAWING_PALETTE_MAX_PERCENT,
      "tool-properties": STUDIO_DRAWING_PALETTE_MIN_PERCENT,
    });
    expect(malformed.sizes).toEqual(
      DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.sizes,
    );

    for (const layout of [equal, minimum, maximum, malformed]) {
      expect(
        layout.sizes["sub-tools"] + layout.sizes["tool-properties"],
      ).toBe(100);
      expect(layout.sizes["sub-tools"]).toBeGreaterThanOrEqual(
        STUDIO_DRAWING_PALETTE_MIN_PERCENT,
      );
      expect(layout.sizes["sub-tools"]).toBeLessThanOrEqual(
        STUDIO_DRAWING_PALETTE_MAX_PERCENT,
      );
      expect(layout.sizes["tool-properties"]).toBeGreaterThanOrEqual(
        STUDIO_DRAWING_PALETTE_MIN_PERCENT,
      );
      expect(layout.sizes["tool-properties"]).toBeLessThanOrEqual(
        STUDIO_DRAWING_PALETTE_MAX_PERCENT,
      );
    }
  });

  it("toggles, moves, and absolutely resizes without mutating the source layout", () => {
    const source = normalizeStudioDrawingPaletteLayout(
      DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
    );
    const toggled = toggleStudioDrawingPalette(source, "tool-properties");
    const moved = moveStudioDrawingPalette(toggled, "tool-properties", "up");
    const resized = resizeStudioDrawingPalettes(moved, moved.order[0]!, 73.6);

    expect(source).toEqual(DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT);
    expect(toggled.collapsed["tool-properties"]).toBe(true);
    expect(moved.order).toEqual(["tool-properties", "sub-tools"]);
    expect(resized.sizes).toEqual({
      "sub-tools": 26,
      "tool-properties": 74,
    });
    expect(resized.order).toEqual(moved.order);
    expect(resized.collapsed).toEqual(moved.collapsed);
  });

  it("keeps boundary moves and invalid resize input safe and canonical", () => {
    const source = normalizeStudioDrawingPaletteLayout({
      order: ["sub-tools", "tool-properties"],
      sizes: { "sub-tools": 45, "tool-properties": 55 },
    });

    expect(moveStudioDrawingPalette(source, "sub-tools", "up")).toEqual(source);
    expect(
      resizeStudioDrawingPalettes(source, "sub-tools", Number.NaN),
    ).toEqual(source);
  });
});
