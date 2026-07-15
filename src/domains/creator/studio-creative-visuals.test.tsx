import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StudioShapeKindGlyph,
  StudioSmartShapeKindRow,
  StudioStarterCardArt,
  StudioSymmetryGlyph,
} from "./studio-creative-visuals";

describe("studio creative visuals", () => {
  it("renders shape glyphs for smart-shape affordances", () => {
    const html = renderToStaticMarkup(
      <>
        <StudioShapeKindGlyph kind="circle" />
        <StudioShapeKindGlyph kind="triangle" active />
        <StudioSmartShapeKindRow />
      </>
    );
    expect(html).toContain('data-studio-shape-glyph="circle"');
    expect(html).toContain('data-studio-shape-glyph="triangle"');
    expect(html).toContain('data-studio-smart-shape-kinds="true"');
    expect(html).toContain('data-studio-shape-glyph="line"');
    expect(html).toContain('data-studio-shape-glyph="poly"');
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
