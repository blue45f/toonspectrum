import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StudioPressureHudMeter,
  StudioShapeKindGlyph,
  StudioShapePickerGrid,
  StudioShapePickerStrip,
  StudioSmartShapeKindRow,
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
        <StudioSmartShapeKindRow />
      </>
    );
    expect(html).toContain('data-studio-shape-glyph="circle"');
    expect(html).toContain('data-studio-shape-glyph="triangle"');
    expect(html).toContain('data-studio-shape-glyph="star"');
    expect(html).toContain('data-studio-shape-glyph="arrow"');
    expect(html).toContain('data-studio-smart-shape-kinds="true"');
    expect(html).toContain('data-studio-shape-glyph="line"');
    expect(html).toContain('data-studio-shape-glyph="poly"');
  });

  it("renders a commercial shape picker grid", () => {
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
    expect(html).toContain("사각형");
  });

  it("renders compact shape strip and pressure meter for HUD/options", () => {
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
