import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StudioOpacityGlyph,
  StudioPressureCurveGlyph,
  StudioPressureHudMeter,
  StudioShapeKindGlyph,
  StudioShapePickerGrid,
  StudioShapePickerStrip,
  StudioSizeChipGlyph,
  StudioSmartShapeKindRow,
  StudioStabilizerGlyph,
  StudioStabilizerModeGlyph,
  StudioStarterCardArt,
  StudioSymmetryGlyph,
  STUDIO_DRAW_SHAPE_PICKER_KINDS,
} from "./studio-creative-visuals";

describe("studio creative visuals", () => {
  it("renders shape glyphs for smart-shape affordances", () => {
    const html = renderToStaticMarkup(
      <>
        <StudioShapeKindGlyph kind="circle" />
        <StudioShapeKindGlyph kind="triangle" active />
        <StudioShapeKindGlyph kind="star" />
        <StudioShapeKindGlyph kind="arrow" />
        <StudioSmartShapeKindRow highlightKind="rect" />
      </>
    );
    expect(html).toContain('data-studio-shape-glyph="circle"');
    expect(html).toContain('data-studio-shape-glyph="triangle"');
    expect(html).toContain('data-studio-shape-glyph="star"');
    expect(html).toContain('data-studio-shape-glyph="arrow"');
    expect(html).toContain('data-studio-smart-shape-kinds="true"');
    expect(html).toContain('data-studio-smart-shape-match="rect"');
    expect(html).toContain('data-studio-smart-shape-kind="rect"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain('data-studio-shape-glyph="line"');
    expect(html).toContain('data-studio-shape-glyph="poly"');
  });

  it("renders a commercial shape picker grid (glyph-first by default)", () => {
    const html = renderToStaticMarkup(
      <StudioShapePickerGrid
        activeKind="rect"
        onSelect={() => {}}
        kinds={[
          { kind: "line", label: "선" },
          { kind: "rect", label: "사각형" },
          { kind: "ellipse", label: "타원" },
        ]}
      />
    );
    expect(html).toContain('data-studio-shape-picker="true"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-label="사각형"');
    // Default is icon-first — no visible text label node for kinds
    expect(html).not.toMatch(/>사각형</);
  });

  it("renders compact shape strip, pressure meter, and draw glyphs", () => {
    const strip = renderToStaticMarkup(
      <StudioShapePickerStrip
        activeKind="ellipse"
        onSelect={() => {}}
        filled
        kinds={STUDIO_DRAW_SHAPE_PICKER_KINDS}
      />
    );
    expect(strip).toContain('data-studio-shape-strip="true"');
    expect(strip).toContain('data-studio-shape-glyph="ellipse"');
    expect(STUDIO_DRAW_SHAPE_PICKER_KINDS.length).toBeGreaterThanOrEqual(7);

    const meter = renderToStaticMarkup(<StudioPressureHudMeter ratio={0.42} />);
    expect(meter).toContain('data-studio-pressure-meter="true"');
    expect(meter).toContain("42%");
    expect(renderToStaticMarkup(<StudioPressureHudMeter ratio={null} />)).toBe("");

    const glyphs = renderToStaticMarkup(
      <>
        <StudioSizeChipGlyph widthPx={12} />
        <StudioOpacityGlyph opacity01={0.5} />
        <StudioStabilizerGlyph />
        <StudioStabilizerModeGlyph mode="adaptive" />
        <StudioPressureCurveGlyph curve="soft" />
      </>
    );
    expect(glyphs).toContain('data-studio-size-chip-glyph="12"');
    expect(glyphs).toContain('data-studio-opacity-glyph="true"');
    expect(glyphs).toContain('data-studio-stabilizer-glyph="true"');
    expect(glyphs).toContain('data-studio-stabilizer-mode="adaptive"');
    expect(glyphs).toContain('data-studio-pressure-curve="soft"');
  });

  it("renders symmetry glyphs for options strip", () => {
    const html = renderToStaticMarkup(
      <>
        <StudioSymmetryGlyph mode="vertical" />
        <StudioSymmetryGlyph mode="radial" />
      </>
    );
    expect(html).toContain('data-studio-symmetry-glyph="vertical"');
    expect(html).toContain('data-studio-symmetry-glyph="radial"');
  });

  it("renders starter card art headers for each creative entry", () => {
    const ids = [
      "draw",
      "smart-shape",
      "brush-kit",
      "template",
      "collab-focus",
      "character",
      "bubble",
      "example",
    ] as const;
    for (const id of ids) {
      const html = renderToStaticMarkup(<StudioStarterCardArt id={id} />);
      expect(html).toContain(`data-studio-starter-art="${id}"`);
      expect(html).toContain("<svg");
    }
  });
});
