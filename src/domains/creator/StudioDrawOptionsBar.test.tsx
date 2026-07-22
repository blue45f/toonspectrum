// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";
import { StudioBrushLibrarySheet } from "./StudioBrushLibrarySheet";
import { StudioDrawOptionsBar } from "./StudioDrawOptionsBar";

const drawOptionsSource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/StudioDrawOptionsBar.tsx"),
  "utf8"
);
const studioGlobalsSource = readFileSync(resolve(process.cwd(), "src/styles/globals.css"), "utf8");

afterEach(cleanup);

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
        eyedropperActive
        onToggleEyedropper={vi.fn()}
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
    expect(html).toContain('data-studio-eyedropper-trigger="true"');
    expect(html).toContain('aria-label="스포이드 사용 중"');
    expect(html).toContain('data-studio-size-preview="true"');
    expect(html).toContain('data-studio-opacity-glyph="true"');
    // Active brush pill + continuous controls + progressive disclosure
    expect(html).toContain('data-studio-brush-active-pill="true"');
    expect(html).toContain('data-studio-draw-advanced-toggle="true"');
  });

  it("keeps the shared basic-preset catalog reachable from the compact active-brush control", () => {
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
    expect(html).toContain("기본 프리셋");
    expect(html).toContain("네온");
  });

  it("keeps a Pro catalogue identity visible and favoriteable while rendering canonically", () => {
    const onToggleFavoriteBrush = vi.fn();
    const onSelectBrush = vi.fn();
    render(
      <StudioDrawOptionsBar
        drawMode="pen"
        brushId="ink-particle"
        activeCatalogBrushId="heart-stamp"
        activeCatalogBrushName="하트 도장"
        brushCatalogItems={STUDIO_ALL_BRUSH_CATALOG_ITEMS}
        strokeWidth={26}
        brushOpacity={0.94}
        stabilizer={4}
        color="#cc3366"
        quickShapeActive={false}
        favoriteBrushIds={["heart-stamp"]}
        recentBrushIds={["hair-fiber", "ink-particle"]}
        onSelectBrush={onSelectBrush}
        onStrokeWidthChange={vi.fn()}
        onOpacityChange={vi.fn()}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
        onToggleFavoriteBrush={onToggleFavoriteBrush}
      />
    );

    const activePill = screen.getByRole("button", {
      name: "현재 브러시 하트 도장, 기본 프리셋 열기",
    });
    expect(activePill.textContent).toContain("하트");
    // Icon/raster routing stays on the canonical renderer id, never the catalogue id.
    expect(activePill.querySelector('[data-studio-brush-icon-for="ink-particle"]')).toBeTruthy();
    expect(activePill.querySelector('[data-studio-brush-icon-for="heart-stamp"]')).toBeNull();

    const favorite = screen.getByRole("button", { name: "즐겨찾기 해제" });
    expect(favorite.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(favorite);
    expect(onToggleFavoriteBrush).toHaveBeenCalledWith("heart-stamp");

    fireEvent.click(screen.getByRole("button", { name: "세부 옵션 펼치기" }));
    const activeQuickBrush = screen.getByRole("option", {
      name: /즐겨찾기 브러시 하트 도장/,
    });
    expect(activeQuickBrush.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: /최근 사용 브러시 머리카락 결/ }));
    expect(onSelectBrush.mock.calls[0]?.[0]).toMatchObject({ id: "hair-fiber" });
  });

  it("uses the StudioPage-owned catalog session instead of mounting a second sheet", () => {
    expect(drawOptionsSource).toContain("brushCatalogOpen?: boolean");
    expect(drawOptionsSource).toContain("onToggleBrushCatalog?: (trigger: HTMLButtonElement) => void");
    expect(drawOptionsSource).not.toContain('import { StudioBrushLibrarySheet }');
    expect(drawOptionsSource).not.toContain("<StudioBrushLibrarySheet");
    expect(drawOptionsSource).not.toContain("setLibraryOpen");
    expect(drawOptionsSource).toContain("toggleBrushCatalog(event.currentTarget)");
    expect(drawOptionsSource).not.toContain("brushLibraryTriggerRef");
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
      "brush-library",
      "brush-favorite",
      "brush-slot",
      "brush-studio",
      "draw-settings",
      "flip-view",
      "opacity",
      "shape-fill",
      "stabilizer",
      "pressure",
      "symmetry",
      "shape",
      "smart-shape",
      "ink",
      "erase",
    ]) {
      expect(drawOptionsSource).toContain(`"${preview}"`);
    }
    expect(drawOptionsSource).toContain("`symmetry-${item.id}`");
    expect(drawOptionsSource).toContain("`stabilizer-${stabilizerMode}`");
    expect(drawOptionsSource).toContain("`stabilizer-${item.id}`");
    expect(drawOptionsSource).toContain('"post-correction"');
    expect(drawOptionsSource).toContain("`pressure-${item.id}`");

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

  it("describes the next stateful drawing-dock action with an exact preview variant", () => {
    for (const [preview, variantExpression] of [
      ["brush-favorite", 'isFavorite ? "remove" : "add"'],
      ["shape-fill", 'shapeFill ? "disable" : "enable"'],
      ["draw-settings", 'advancedOpen ? "collapse" : "expand"'],
      ["flip-view", 'canvasFlipH ? "restore" : "flip"'],
      ["smart-shape", 'quickShapeActive ? "disable" : "enable"'],
    ]) {
      const previewIndex = drawOptionsSource.indexOf(`"${preview}"`);
      expect(previewIndex, `missing preview family: ${preview}`).toBeGreaterThanOrEqual(0);
      expect(drawOptionsSource.slice(previewIndex, previewIndex + 180)).toContain(variantExpression);
    }
  });

  it("uses exact rich previews for every size and opacity preset without native titles", () => {
    for (const sizeVariant of ["xs", "s", "m", "l", "xl", "xxl"]) {
      expect(drawOptionsSource).toContain(`preset-${sizeVariant}`);
    }
    for (const opacityVariant of [20, 40, 60, 80, 100]) {
      expect(drawOptionsSource).toContain(`preset-${opacityVariant}`);
    }
    expect(drawOptionsSource).toContain("BRUSH_SIZE_HINT_VARIANT[chip.id]");
    expect(drawOptionsSource).toContain("BRUSH_OPACITY_HINT_VARIANT[chip.id]");
    expect(drawOptionsSource).toContain('sizeLocked ? "unlock" : "lock"');
    expect(drawOptionsSource).toContain('opacityLocked ? "unlock" : "lock"');
    expect(drawOptionsSource).not.toContain("title=");
    expect(drawOptionsSource).toContain("이후 새로 그리는 획부터 이 크기가 적용돼요.");
    expect(drawOptionsSource).toContain("브러시 프리셋을 선택할 때 해당 프리셋의 기본 크기");
    expect(drawOptionsSource).toContain("브러시 프리셋을 선택할 때 해당 프리셋의 기본 불투명도");
  });

  it("keeps advanced size and opacity presets keyboard-named, stateful, and actionable", () => {
    const onStrokeWidthChange = vi.fn();
    const onOpacityChange = vi.fn();
    const onToggleSizeLock = vi.fn();
    const onToggleOpacityLock = vi.fn();

    render(
      <StudioDrawOptionsBar
        drawMode="pen"
        brushId="pen"
        strokeWidth={24}
        brushOpacity={0.8}
        stabilizer={4}
        color="#112233"
        quickShapeActive={false}
        sizeLocked
        opacityLocked={false}
        onSelectBrush={vi.fn()}
        onStrokeWidthChange={onStrokeWidthChange}
        onOpacityChange={onOpacityChange}
        onStabilizerChange={vi.fn()}
        onColorChange={vi.fn()}
        onToggleQuickShape={vi.fn()}
        onToggleSizeLock={onToggleSizeLock}
        onToggleOpacityLock={onToggleOpacityLock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "세부 옵션 펼치기" }));

    const sizeGroup = screen.getByRole("group", { name: "브러시 크기 프리셋" });
    const activeSize = within(sizeGroup).getByRole("button", {
      name: "브러시 크기 L 24픽셀",
    });
    expect(activeSize.getAttribute("aria-pressed")).toBe("true");
    expect(activeSize.hasAttribute("title")).toBe(false);
    fireEvent.click(within(sizeGroup).getByRole("button", { name: "브러시 크기 XS 2픽셀" }));
    expect(onStrokeWidthChange).toHaveBeenCalledWith(2);

    const sizeUnlock = within(sizeGroup).getByRole("button", {
      name: "브러시 크기 잠금 해제",
    });
    expect(sizeUnlock.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(sizeUnlock);
    expect(onToggleSizeLock).toHaveBeenCalledOnce();

    const opacityGroup = screen.getByRole("group", { name: "브러시 불투명도 프리셋" });
    const activeOpacity = within(opacityGroup).getByRole("button", {
      name: "브러시 불투명도 80%",
    });
    expect(activeOpacity.getAttribute("aria-pressed")).toBe("true");
    expect(activeOpacity.hasAttribute("title")).toBe(false);
    fireEvent.click(
      within(opacityGroup).getByRole("button", { name: "브러시 불투명도 20%" })
    );
    expect(onOpacityChange).toHaveBeenCalledWith(0.2);

    const opacityLock = within(opacityGroup).getByRole("button", {
      name: "브러시 불투명도 잠금",
    });
    expect(opacityLock.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(opacityLock);
    expect(onToggleOpacityLock).toHaveBeenCalledOnce();
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

    const unavailableCoach = html.slice(
      html.indexOf('data-studio-tool-hint-unavailable="true"'),
      html.indexOf('data-studio-tool-hint-unavailable="true"') + 900,
    );
    expect(unavailableCoach).toContain('role="group"');
    expect(unavailableCoach).not.toContain('role="button"');
    expect(unavailableCoach).toContain('aria-label="도형 채우기"');
    expect(unavailableCoach).toContain('aria-disabled="true"');
    expect(unavailableCoach).toContain('tabindex="0"');
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
