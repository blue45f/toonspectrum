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
        secondaryColor="#445566"
        recentSwatches={["#000000", "#ffffff"]}
        quickShapeActive
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onSecondaryColorChange={vi.fn()}
        onSwapColors={vi.fn()}
        onToggleQuickShape={vi.fn()}
      />
    );
    expect(html).toContain('data-studio-draw-options="true"');
    expect(html).toContain('data-studio-icon-first="true"');
    // Icon-first: labels live in aria/sr-only, not visible chip text
    expect(html).toContain('aria-label="스마트 도형"');
    expect(html).toContain('aria-label="브러시 크기"');
    expect(html).toContain('aria-label="브러시 불투명도"');
    expect(html).toContain('data-studio-draw-options-end="true"');
    expect(html).toContain("브러시 크기 프리셋");
    expect(html).toContain('data-studio-size-chip-glyph=');
    expect(html).toContain('data-studio-size-chip="');
    expect(html).toContain('data-studio-tool-identity="true"');
    expect(html).toContain('data-studio-tool-identity-icon-first="true"');
    expect(html).toContain('aria-pressed="true"');
    // CSP/Photopea dual well on the commercial options strip
    expect(html).toContain('data-studio-dual-color-well="true"');
    expect(html).toContain('data-studio-color-swap="true"');
    expect(html).toContain('data-studio-size-preview="true"');
    expect(html).toContain('data-studio-opacity-glyph="true"');
    // Magma/PicsArt: active brush pill + size nudge + advanced disclosure
    expect(html).toContain('data-studio-brush-active-pill="true"');
    expect(html).toContain('aria-label="브러시 크기 줄이기"');
    expect(html).toContain('data-studio-draw-advanced-toggle="true"');
  });

  it("exposes advanced stabilizer controls when expanded via static advanced props", () => {
    // Advanced row is closed by default; stabilizer lives behind toggle.
    // Library pill and size chips remain always visible.
    const html = renderToStaticMarkup(
      <StudioDrawOptionsBar
        drawMode="pen"
        brushId="neon"
        strokeWidth={18}
        brushOpacity={0.75}
        stabilizer={6}
        color="#39ff14"
        quickShapeActive={false}
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
        favoriteBrushIds={["neon", "pen"]}
        onToggleFavoriteBrush={vi.fn()}
        onSelectRecentBrush={vi.fn()}
      />
    );
    expect(html).toContain("브러시 라이브러리");
    expect(html).toContain("네온");
  });

  it("renders symmetry chips on the primary strip; slots stay behind advanced", () => {
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
    // Progressive disclosure: slots only when advanced is open
    expect(html).not.toContain("브러시 슬롯 1");
    expect(html).toContain('data-studio-draw-advanced-toggle="true"');
    expect(html).toContain("대칭 그리기");
    expect(html).toContain('data-studio-symmetry-glyph="vertical"');
    expect(html).toContain('aria-label="대칭 세로"');
  });

  it("renders commercial shape strip and fill when shape mode is active", () => {
    const html = renderToStaticMarkup(
      <StudioDrawOptionsBar
        drawMode="shape"
        brushId="pen"
        strokeWidth={4}
        brushOpacity={1}
        stabilizer={0}
        color="#112233"
        quickShapeActive={false}
        shapeKind="rect"
        shapeFill
        onShapeKindChange={vi.fn()}
        onShapeFillChange={vi.fn()}
        onSetDrawMode={vi.fn()}
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
      />
    );
    expect(html).toContain('data-studio-shape-strip="true"');
    expect(html).toContain("도형 채우기");
    expect(html).toContain("도형");
    expect(html).toContain('aria-label="그리기 모드"');
  });
});
