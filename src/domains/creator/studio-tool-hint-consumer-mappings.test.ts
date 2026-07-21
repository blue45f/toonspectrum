import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readStudioSource(fileName: string): string {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");
}

function expectNearby(source: string, anchor: string, expected: string, span = 800): void {
  const anchorIndex = source.indexOf(anchor);
  expect(anchorIndex, `missing source anchor: ${anchor}`).toBeGreaterThanOrEqual(0);
  expect(source.slice(anchorIndex, anchorIndex + span)).toContain(expected);
}

describe("Studio rich-hint consumer mappings", () => {
  it("keeps every pixel selection gesture and boolean operation visually distinct", () => {
    const source = readStudioSource("StudioSelectionToolsPanel.tsx");

    for (const [tool, preview] of [
      ["rect", "marquee-rect"],
      ["ellipse", "marquee-ellipse"],
      ["lasso", "lasso"],
      ["\"poly-lasso\"", "polygon-lasso"],
      ["brush", "selection-brush"],
    ]) {
      expect(source).toContain(`${tool}: "${preview}"`);
    }
    for (const [operation, preview] of [
      ["add", "selection-add"],
      ["subtract", "selection-subtract"],
      ["intersect", "selection-intersect"],
    ]) {
      expect(source).toContain(`${operation}: "${preview}"`);
    }
  });

  it("keeps the dynamic left-rail polygon lasso on its polygon preview", () => {
    const source = readStudioSource("StudioLeftToolRail.tsx");
    expectNearby(source, 'pixelTool === "poly-lasso"', 'hintPreview={pixelTool === "poly-lasso" ? "polygon-lasso" : "lasso"}', 1_200);
    expectNearby(source, 'hintPreview={pixelTool === "poly-lasso"', 'hintPreviewVariant={pixelTool === "poly-lasso" ? "rail-polygon-lasso" : "rail-free-lasso"}');
  });

  it("maps selection actions to their actual edit result", () => {
    const source = readStudioSource("StudioSelectOptionsBar.tsx");
    for (const [action, preview] of [
      ["edit-text", "text"],
      ["fit-bubble", "bubble"],
      ["duplicate", "layer-duplicate"],
      ["bring-front", "layer-reorder-front"],
      ["send-back", "layer-reorder-back"],
      ["locked ? \"unlock\" : \"lock\"", "layer-lock"],
      ["delete", "layer-delete"],
    ]) {
      expectNearby(source, `id=${action.startsWith("locked") ? `{${action}}` : `"${action}"`}`, `preview="${preview}"`);
    }
  });

  it("uses purpose-built previews for the drawing dock instead of generic ink and rotation", () => {
    const source = readStudioSource("StudioDrawOptionsBar.tsx");
    for (const [anchor, preview] of [
      ["현재 브러시 ·", "brush-library"],
      ["브러시 즐겨찾기 해제", "brush-favorite"],
      ["도형 채우기 끄기", "shape-fill"],
      ["세부 그리기 옵션 접기", "draw-settings"],
      ["캔버스 좌우 반전", "flip-view"],
      ["브러시 스튜디오", "brush-studio"],
      ["스마트 도형 끄기", "smart-shape"],
      ["브러시 슬롯 ${index + 1}", "brush-slot"],
    ]) {
      expectNearby(source, anchor, `"${preview}"`, 1_200);
    }
  });

  it("maps drawing-dock toggle previews to the next action instead of only the current state", () => {
    const source = readStudioSource("StudioDrawOptionsBar.tsx");
    for (const [anchor, variantExpression] of [
      ["브러시 즐겨찾기 해제", 'isFavorite ? "remove" : "add"'],
      ["도형 채우기 끄기", 'shapeFill ? "disable" : "enable"'],
      ["세부 그리기 옵션 접기", 'advancedOpen ? "collapse" : "expand"'],
      ["캔버스 좌우 반전", 'canvasFlipH ? "restore" : "flip"'],
      ["스마트 도형 끄기", 'quickShapeActive ? "disable" : "enable"'],
    ]) {
      expectNearby(source, anchor, variantExpression, 1_200);
    }
  });

  it("distinguishes mobile direct shapes, export settings, file workflows, insertion, and comments", () => {
    const mobile = readStudioSource("StudioMobileEditingDock.tsx");
    const menubar = readStudioSource("StudioMenubarContent.tsx");
    const studioPage = readStudioSource("StudioPage.tsx");
    const toolBelt = readStudioSource("StudioToolBeltContent.tsx");

    expectNearby(mobile, 'label="도형"', 'hintPreview="shape"');
    expectNearby(mobile, 'label="도형"', 'hintPreviewVariant="mobile-direct-shape"');
    expectNearby(mobile, 'label="브러시"', 'hintPreview="draw-settings"');
    expectNearby(mobile, 'label="브러시"', 'hintPreviewVariant="mobile-brush-settings"');
    expectNearby(menubar, "assets: {", 'preview: "assets"');
    expectNearby(menubar, "exportOptions: {", 'preview: "export-options"');
    expectNearby(menubar, "project: {", 'preview: "project"');
    expectNearby(studioPage, 'id: "menubar-comment-inbox"', 'preview: "comment-inbox"');
    expectNearby(toolBelt, 'id: "toolbelt-comment-inbox"', 'preview: "comment-inbox"');
  });

  it("preserves unique smart-filter identities for engine-specific renderer variants", () => {
    const source = readStudioSource("StudioSmartFiltersPanel.tsx");
    expect(source).toContain("id: `smart-filter-${entry.engine}`");
    expect(source).toContain('preview: "filter"');
    expect(source).toContain("아직 캔버스 실시간 미리보기가");
  });
});
