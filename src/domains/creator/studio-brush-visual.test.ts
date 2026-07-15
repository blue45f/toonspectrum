import { describe, expect, it } from "vitest";

import {
  studioBrushChipSurface,
  studioBrushPreviewDashArray,
  studioBrushPreviewDotCenters,
  studioBrushPreviewPathD,
  studioBrushPreviewStrokeWidth,
} from "./studio-brush-visual";

describe("studio brush commercial visuals", () => {
  it("returns warm-ink chip surfaces per media family", () => {
    for (const media of ["line", "marker", "paint", "texture"] as const) {
      const surface = studioBrushChipSurface(media);
      expect(surface.tile).toMatch(/^oklch\(/);
      expect(surface.ink).toMatch(/^oklch\(/);
      expect(surface.paper).toMatch(/^oklch\(/);
    }
    // Marker family leans toward accent hue (persimmon-ish)
    expect(studioBrushChipSurface("marker").ink).toContain("42");
  });

  it("builds deterministic stroke paths and widths for SVG chips", () => {
    const solid = studioBrushPreviewPathD("solid");
    const wavy = studioBrushPreviewPathD("wavy");
    expect(solid.startsWith("M2")).toBe(true);
    expect(wavy).not.toBe(solid);
    expect(studioBrushPreviewStrokeWidth(0.5, "solid")).toBeGreaterThan(1);
    expect(studioBrushPreviewStrokeWidth(0.5, "calligraphy")).toBeGreaterThan(
      studioBrushPreviewStrokeWidth(0.5, "solid")
    );
    expect(studioBrushPreviewDashArray("dashed")).toBeTruthy();
    expect(studioBrushPreviewDashArray("solid")).toBeUndefined();
  });

  it("emits tone/spray dots for texture previews", () => {
    const spray = studioBrushPreviewDotCenters("dots");
    const tone = studioBrushPreviewDotCenters("tone");
    expect(spray.length).toBeGreaterThan(3);
    expect(tone.length).toBeGreaterThan(spray.length);
    expect(studioBrushPreviewDotCenters("solid")).toHaveLength(0);
  });
});
