import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioPressureCurveGraph } from "./StudioPressureCurveGraph";

describe("StudioPressureCurveGraph", () => {
  it("renders commercial transfer curve chart and preset chips", () => {
    const html = renderToStaticMarkup(
      <StudioPressureCurveGraph pressureCurve={1} onPressureCurveChange={vi.fn()} />
    );
    expect(html).toContain('data-studio-pressure-curve-graph="true"');
    expect(html).toContain('data-studio-pressure-curve-chart="true"');
    expect(html).toContain("필압 반응 곡선");
    expect(html).toContain('aria-label="필압 반응 강도"');
    expect(html).toContain('data-studio-pressure-curve="soft"');
    expect(html).toContain('data-studio-pressure-curve="linear"');
    expect(html).toContain('data-studio-pressure-curve="firm"');
  });
});
