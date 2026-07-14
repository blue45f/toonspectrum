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

  it("renders brush slots and symmetry chips when provided", () => {
    const html = renderToStaticMarkup(
      <StudioDrawOptionsBar
        drawMode="pen"
        brushId="pen"
        strokeWidth={6}
        brushOpacity={1}
        stabilizer={4}
        color="#112233"
        brushSlots={[
          { brushId: "pen", strokeWidth: 6, brushOpacity: 1 },
          null,
          null,
          null,
          null,
          null,
        ]}
        symmetryType="vertical"
        quickShapeActive={false}
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
        onRecallBrushSlot={vi.fn()}
        onAssignBrushSlot={vi.fn()}
        onSymmetryTypeChange={vi.fn()}
      />
    );
    expect(html).toContain("브러시 슬롯 1");
    expect(html).toContain("대칭 그리기");
    expect(html).toContain("세로");
  });
});
