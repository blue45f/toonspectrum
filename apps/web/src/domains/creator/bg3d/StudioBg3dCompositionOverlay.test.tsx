import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_COMPOSITION_GUIDE_MODES } from "./studio-bg3d-composition-guide";
import { StudioBg3dCompositionOverlay } from "./StudioBg3dCompositionOverlay";

describe("StudioBg3dCompositionOverlay", () => {
  it("renders null when mode is none", () => {
    const html = renderToStaticMarkup(<StudioBg3dCompositionOverlay mode="none" />);
    expect(html).toBe("");
  });

  it("renders 3x3 grid when mode is ruleOfThirds", () => {
    const html = renderToStaticMarkup(<StudioBg3dCompositionOverlay mode="ruleOfThirds" />);
    expect(html).toContain('data-testid="bg3d-composition-overlay"');
    expect(html).toContain('data-guide-mode="ruleOfThirds"');
    expect(html).toContain('circle');
  });

  it("renders vertical webtoon mobile cut box when mode is verticalWebtoon", () => {
    const html = renderToStaticMarkup(<StudioBg3dCompositionOverlay mode="verticalWebtoon" viewportSize={{ width: 800, height: 800 }} />);
    expect(html).toContain('data-testid="bg3d-composition-overlay"');
    expect(html).toContain('data-guide-mode="verticalWebtoon"');
    expect(html).toContain('rect');
  });

  it.each([
    { width: 1440, height: 800 }, { width: 390, height: 844 }, { width: 800, height: 800 },
  ])("keeps the mobile guide at physical 9:16 in a %o viewport", (viewportSize) => {
    const html = renderToStaticMarkup(<StudioBg3dCompositionOverlay mode="verticalWebtoon" viewportSize={viewportSize} />);
    const rect = html.match(/<rect data-testid="bg3d-vertical-webtoon-frame"[^>]+>/)?.[0];
    expect(rect).toBeDefined();
    const attribute = (name: string) => Number(rect!.match(new RegExp(` ${name}="([^"]+)"`))?.[1]);
    const width = attribute("width") * viewportSize.width / 1_000;
    const height = attribute("height") * viewportSize.height / 1_000;
    expect(width / height).toBeCloseTo(9 / 16);
    expect(attribute("x") * 2 + attribute("width")).toBeCloseTo(1_000);
    expect(attribute("y") * 2 + attribute("height")).toBeCloseTo(1_000);
    expect(width).toBeLessThanOrEqual(viewportSize.width);
    expect(height).toBeLessThanOrEqual(viewportSize.height);
  });

  it("waits for measured viewport dimensions before showing an aspect guide", () => {
    expect(renderToStaticMarkup(<StudioBg3dCompositionOverlay mode="verticalWebtoon" />)).toBe("");
  });

  it("renders golden spiral when mode is goldenSpiral", () => {
    const html = renderToStaticMarkup(<StudioBg3dCompositionOverlay mode="goldenSpiral" />);
    expect(html).toContain('data-testid="bg3d-composition-overlay"');
    expect(html).toContain('data-guide-mode="goldenSpiral"');
    expect(html).toContain('path');
  });

  it("renders crosshair when mode is crosshair", () => {
    const html = renderToStaticMarkup(<StudioBg3dCompositionOverlay mode="crosshair" />);
    expect(html).toContain('data-testid="bg3d-composition-overlay"');
    expect(html).toContain('data-guide-mode="crosshair"');
    expect(html).toContain('line');
  });

  it("contains all 5 predefined composition guide modes", () => {
    expect(STUDIO_BG3D_COMPOSITION_GUIDE_MODES).toHaveLength(5);
    expect(STUDIO_BG3D_COMPOSITION_GUIDE_MODES.map((m) => m.id)).toEqual([
      "none",
      "ruleOfThirds",
      "verticalWebtoon",
      "goldenSpiral",
      "crosshair",
    ]);
  });
});
