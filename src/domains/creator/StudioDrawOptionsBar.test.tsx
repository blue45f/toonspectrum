import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioDrawOptionsBar } from "./StudioDrawOptionsBar";

describe("StudioDrawOptionsBar", () => {
  it("renders size, opacity, stabilizer, and smart-shape controls", () => {
    const html = renderToStaticMarkup(
      <StudioDrawOptionsBar
        drawMode="pen"
        brushId="pen"
        strokeWidth={8}
        brushOpacity={0.85}
        stabilizer={6}
        color="#112233"
        recentSwatches={["#000000", "#ffffff"]}
        quickShapeActive
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
      />
    );
    expect(html).toContain('data-studio-draw-options="true"');
    expect(html).toContain("크기");
    expect(html).toContain("불투명");
    expect(html).toContain("보정");
    expect(html).toContain("스마트 도형");
    expect(html).toContain('aria-pressed="true"');
  });
});
