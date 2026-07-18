import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioBrushLibrarySheet } from "./StudioBrushLibrarySheet";
import { StudioDrawOptionsBar } from "./StudioDrawOptionsBar";

const drawOptionsSource = readFileSync(new URL("./StudioDrawOptionsBar.tsx", import.meta.url), "utf8");
const studioGlobalsSource = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");

describe("StudioDrawOptionsBar", () => {
  it("renders a compact primary dock with continuous size, opacity, and smart-shape controls", () => {
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
    expect(html).not.toContain("브러시 크기 프리셋");
    expect(html).not.toContain('data-studio-size-chip="');
    expect(html).toContain('aria-pressed="true"');
    // CSP/Photopea dual well on the commercial options strip
    expect(html).toContain('data-studio-dual-color-well="true"');
    expect(html).toContain('data-studio-color-swap="true"');
    expect(html).toContain('data-studio-size-preview="true"');
    expect(html).toContain('data-studio-opacity-glyph="true"');
    // Active brush pill + continuous controls + progressive disclosure
    expect(html).toContain('data-studio-brush-active-pill="true"');
    expect(html).toContain('data-studio-draw-advanced-toggle="true"');
  });

  it("keeps the full brush library reachable from the compact active-brush control", () => {
    // Advanced row is closed by default; stabilizer lives behind toggle.
    // The library pill and two continuous controls remain visible; preset chips are progressive.
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
      />
    );
    expect(html).toContain("브러시 라이브러리");
    expect(html).toContain("네온");
  });

  it("keeps every core control reachable in a visible, keyboard-navigable narrow-dock scroller", () => {
    const primaryIndex = drawOptionsSource.indexOf('data-studio-draw-options-primary="true"');
    const utilityIndex = drawOptionsSource.indexOf('data-studio-draw-options-end="true"');
    const advancedIndex = drawOptionsSource.indexOf('data-studio-draw-advanced-toggle="true"');

    expect(primaryIndex).toBeGreaterThan(0);
    expect(utilityIndex).toBeGreaterThan(primaryIndex);
    expect(advancedIndex).toBeGreaterThan(utilityIndex);
    expect(drawOptionsSource).toContain('data-studio-draw-options-scroll="visible"');
    expect(drawOptionsSource).toContain('role="group"');
    expect(drawOptionsSource).toContain("좌우로 스크롤할 수 있습니다");
    expect(drawOptionsSource).toContain("overflow-x-auto overflow-y-hidden");
    expect(drawOptionsSource).not.toContain(
      'data-studio-draw-options-primary="true"\n          className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden"'
    );
    for (const control of ["mode", "brush", "shape", "size", "opacity"]) {
      expect(drawOptionsSource).toContain(`data-studio-core-draw-control="${control}"`);
    }
    expect(studioGlobalsSource).toContain("container-name: studio-draw-options");
    expect(studioGlobalsSource).toContain("@container studio-draw-options (max-width: 60rem)");
    expect(studioGlobalsSource).toContain('[data-studio-draw-secondary-action="favorite"]');
    expect(studioGlobalsSource).toContain('[data-studio-draw-options-primary="true"]::-webkit-scrollbar');
    expect(studioGlobalsSource).toContain("scrollbar-width: auto");
  });

  it("gives high-frequency primary controls one rich coach target without native-title duplication", () => {
    const html = renderToStaticMarkup(
      <StudioDrawOptionsBar
        drawMode="pen"
        brushId="pen"
        strokeWidth={8}
        brushOpacity={0.85}
        stabilizer={6}
        color="#112233"
        quickShapeActive={false}
        onSetDrawMode={vi.fn()}
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
        onToggleFavoriteBrush={vi.fn()}
        onToggleCanvasFlipH={vi.fn()}
        onOpenBrushStudio={vi.fn()}
      />
    );

    expect(html.match(/data-studio-tool-hint-target="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(11);
    expect(html).not.toContain('title="캔버스 좌우 반전"');
    expect(html).not.toContain('title="브러시 스튜디오');
    expect(html).not.toContain('title="스마트 도형');
    expect(html).toContain('aria-label="브러시 크기"');
    expect(html).toContain('aria-label="브러시 불투명도"');
  });

  it("assigns semantic animated previews across advanced drawing workflows", () => {
    for (const preview of [
      "brush-size",
      "opacity",
      "stabilizer",
      "pressure",
      "symmetry",
      "shape",
      "zoom-view",
      "ink",
      "erase",
    ]) {
      expect(drawOptionsSource).toContain(`"${preview}"`);
    }

    expect(drawOptionsSource.match(/<StudioToolHintTarget/g)?.length ?? 0).toBeGreaterThanOrEqual(16);
    expect(drawOptionsSource).not.toContain('title="캔버스 좌우 반전"');
    expect(drawOptionsSource).not.toContain('title="브러시 스튜디오');
    expect(drawOptionsSource).not.toContain('title="스마트 도형');
    expect(drawOptionsSource).not.toContain("title={`손떨림 보정");
    expect(drawOptionsSource).not.toContain("title={`후처리");
    expect(drawOptionsSource).not.toContain("title={`보정 방식:");
    expect(drawOptionsSource).not.toContain("title={`필압:");
    expect(drawOptionsSource).not.toContain("title={`대칭:");
  });

  it("keeps symmetry and slots behind the advanced disclosure", () => {
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
    expect(html).not.toContain("대칭 그리기");
    expect(html).not.toContain('aria-label="대칭 세로"');
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

  it("keeps unavailable shape fill discoverable from a named disabled coach", () => {
    const html = renderToStaticMarkup(
      <StudioDrawOptionsBar
        drawMode="shape"
        brushId="pen"
        strokeWidth={4}
        brushOpacity={1}
        stabilizer={0}
        color="#112233"
        quickShapeActive={false}
        shapeKind="line"
        shapeFill={false}
        onShapeKindChange={vi.fn()}
        onShapeFillChange={vi.fn()}
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
      />
    );

    expect(html).toContain('data-studio-tool-hint-unavailable="true"');
    expect(html).toContain('role="button"');
    expect(html).toContain('aria-label="도형 채우기"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="0"');
  });

  it("keeps the fixed dock inside the canvas column when desktop panels are open", () => {
    const html = renderToStaticMarkup(
      <StudioDrawOptionsBar
        docked
        dockInsets={{ left: 308, right: 420 }}
        drawMode="pen"
        brushId="pen"
        strokeWidth={6}
        brushOpacity={1}
        stabilizer={4}
        color="#112233"
        quickShapeActive={false}
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
      />
    );
    expect(html).toContain('data-studio-draw-options-dock-left="308"');
    expect(html).toContain('data-studio-draw-options-dock-right="420"');
    expect(html).toContain("100vw - 752px");
    expect(html).toContain("max(calc(100vw - 752px), 20rem)");
    expect(html).toContain("clamp(10.75rem");
  });

  it("keeps the brush library a keyboard-friendly non-modal popover", () => {
    const html = renderToStaticMarkup(
      <StudioBrushLibrarySheet
        open
        activeBrushId="pen"
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-describedby="');
    expect(html).not.toContain('aria-modal="true"');
  });
});
