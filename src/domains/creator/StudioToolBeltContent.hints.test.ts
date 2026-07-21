import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceUrl = new URL("./StudioToolBeltContent.tsx", import.meta.url);
const source = readFileSync(sourceUrl, "utf8");
const file = ts.createSourceFile(
  sourceUrl.pathname,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function jsxTagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText(file);
}

function nativeControls(tagName: "button" | "label"): ts.JsxOpeningLikeElement[] {
  const controls: ts.JsxOpeningLikeElement[] = [];
  function visit(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && jsxTagName(node) === tagName
    ) {
      controls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return controls;
}

function jsxAttribute(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(file) === name
  );
}

function nearestHintTarget(node: ts.Node): ts.JsxOpeningLikeElement | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isJsxElement(current)) {
      const opening = current.openingElement;
      if (["StudioToolBeltHintTarget", "StudioToolHintTarget"].includes(jsxTagName(opening))) {
        return opening;
      }
    }
    current = current.parent;
  }
  return null;
}

describe("Studio ToolBelt rich hint coverage", () => {
  it("routes every native ToolBelt button through the shared single-open hint target", () => {
    const buttons = nativeControls("button");

    expect(buttons).toHaveLength(36);
    expect(buttons.filter((button) => nearestHintTarget(button) === null)).toEqual([]);
    expect(source).toContain(
      '<StudioToolHintTarget preferredSide="bottom" {...props} />'
    );
    expect(source).not.toContain('role="tooltip"');
  });

  it("removes competing native titles while keeping icon controls named", () => {
    const buttons = nativeControls("button");
    const uploadLabels = nativeControls("label").filter((label) =>
      label.parent.getText(file).includes('type="file"')
    );

    expect(buttons.filter((button) => jsxAttribute(button, "title"))).toEqual([]);
    expect(uploadLabels).toHaveLength(1);
    expect(uploadLabels.filter((label) => nearestHintTarget(label) === null)).toEqual([]);
    expect(uploadLabels.filter((label) => jsxAttribute(label, "title"))).toEqual([]);
    expect(source).toContain('<input type="file" accept="image/*" className="sr-only"');
    expect(source).toContain("focus-within:outline-accent");

    for (const accessibleName of [
      "실행취소",
      "다시실행",
      "작업 내역",
      "타임랩스 녹화",
      "스토리보드 그리드 보기",
      "팀 작업 공간",
      "이야기 연속성 검사",
      "세로 스크롤 미리보기",
      "다중 레이어 타임라인",
      "축소",
      "확대",
    ]) {
      expect(source).toContain(`aria-label="${accessibleName}`);
    }
    expect(source).toContain(
      'aria-label={pageEditLocked ? "페이지 검토, 현재 편집 잠금" : "페이지 검토와 편집 잠금"}'
    );
    expect(source).toContain("aria-label={`문서 댓글${openStudioCommentCount");
  });

  it("makes every disabled native control keyboard-discoverable with an exact reason", () => {
    const disabledButtons = nativeControls("button").filter((button) =>
      Boolean(jsxAttribute(button, "disabled"))
    );

    expect(disabledButtons.length).toBeGreaterThanOrEqual(10);
    for (const button of disabledButtons) {
      const target = nearestHintTarget(button);
      expect(target, button.getText(file)).not.toBeNull();
      expect(jsxAttribute(target!, "disabled"), button.getText(file)).toBeDefined();
      expect(jsxAttribute(target!, "unavailableReason"), button.getText(file)).toBeDefined();
    }
  });

  it("keeps stateful actions on purpose-built previews instead of generic fallbacks", () => {
    for (const [key, preview, variant] of [
      ["panelAdd", "panel-layout", "add"],
      ["panelSplit", "panel-layout", "split-diagonal"],
      ["panelDiagonalize", "panel-layout", "diagonalize"],
      ["panelStraighten", "panel-layout", "straighten"],
      ["character3d", "character-3d", null],
      ["background", "background-library", null],
      ["style", "style-library", null],
      ["storyboard", "storyboard-grid", null],
      ["review", "review-workflow", null],
      ["team", "team-collaboration", null],
      ["continuity", "continuity-check", null],
      ["scrollPreview", "vertical-preview", null],
      ["zoomOut", "zoom-view", "zoom-out"],
      ["zoomIn", "zoom-view", "zoom-in"],
      ["actualSize", "zoom-view", "actual-size"],
      ["fitWidth", "zoom-view", "fit-width"],
      ["resetView", "zoom-view", "reset"],
      ["workspaceFocus", "workspace-focus", null],
      ["maximizeWindow", "fullscreen", "maximize-window"],
      ["restoreWindow", "fullscreen", "restore-window"],
      ["fullscreen", "fullscreen", "fullscreen"],
      ["exitFullscreen", "fullscreen", "exit-fullscreen"],
      ["canvasOnly", "fullscreen", "canvas-only"],
    ] as const) {
      const entryStart = source.indexOf(`  ${key}: studioToolHintFromLabel(`);
      expect(entryStart, `missing hint ${key}`).toBeGreaterThanOrEqual(0);
      const entry = source.slice(entryStart, source.indexOf("\n  ),", entryStart) + 5);
      expect(entry).toContain(`"${preview}"`);
      if (variant) expect(entry).toContain(`"${variant}"`);
    }
  });
});
