import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { STUDIO_FILTER_UNION_WAVE_KINDS } from "./studio-filter-pack-registry";
import {
  StudioSmartFilterUnionControls,
  isStudioSmartFilterUnionEngine,
} from "./StudioSmartFilterUnionControls";

describe("StudioSmartFilterUnionControls", () => {
  it("recognizes the complete Filter Gallery union set", () => {
    for (const engine of STUDIO_FILTER_UNION_WAVE_KINDS) {
      expect(isStudioSmartFilterUnionEngine(engine)).toBe(true);
    }
    expect(isStudioSmartFilterUnionEngine("gaussian-blur")).toBe(false);
  });

  it("renders reversible geometry controls with interpolation", () => {
    const html = renderToStaticMarkup(
      <StudioSmartFilterUnionControls
        engine="ripple-warp"
        params={{ amount: -35, scale: 24, centerX: 40, centerY: 60, angle: 12 }}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("방향 / 세기");
    expect(html).toContain("파장");
    expect(html).toContain("중심 X");
    expect(html).toContain("중심 Y");
    expect(html).toContain("부드러운 보간");
    expect(html).toContain("최근접 · 픽셀 보존");
    expect(html.match(/type=\"range\"/g)?.length).toBe(5);
  });

  it("exposes both polar directions and deterministic material controls", () => {
    const polar = renderToStaticMarkup(
      <StudioSmartFilterUnionControls
        engine="polar-coordinates"
        params={{ amount: 75, mode: "polar-to-rectangular", interpolation: "nearest" }}
        onChange={vi.fn()}
      />,
    );
    expect(polar).toContain("직교 → 극좌표");
    expect(polar).toContain("극좌표 → 직교");
    expect(polar).toContain("최근접 · 픽셀 보존");

    const material = renderToStaticMarkup(
      <StudioSmartFilterUnionControls
        engine="stained-glass"
        params={{ amount: 88, scale: 12, detail: 96, seed: 1_440 }}
        onChange={vi.fn()}
      />,
    );
    expect(material).toContain("셀 크기");
    expect(material).toContain("납선 농도");
    expect(material).toContain("시드");
    expect(material.match(/type=\"range\"/g)?.length).toBe(4);
  });

  it("renders nothing for an engine already handled by the base panel", () => {
    expect(renderToStaticMarkup(
      <StudioSmartFilterUnionControls
        engine="levels"
        params={{}}
        onChange={vi.fn()}
      />,
    )).toBe("");
  });
});
