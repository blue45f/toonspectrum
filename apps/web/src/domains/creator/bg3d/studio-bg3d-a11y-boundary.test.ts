import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioBg3dEditorSource } from "./read-studio-bg3d-editor-source";

const editorSource = readStudioBg3dEditorSource();
const viewPanelSource = readFileSync(
  new URL("./StudioBg3dViewPanelContent.tsx", import.meta.url),
  "utf8",
);
const assetLibrarySource = readFileSync(
  new URL("./StudioBg3dAssetLibraryPanel.tsx", import.meta.url),
  "utf8",
);
const userTemplateLibrarySource = readFileSync(
  new URL("./StudioBg3dUserTemplateLibraryPanel.tsx", import.meta.url),
  "utf8",
);
const controlSource = readFileSync(new URL("./studio-bg3d-control-fields.tsx", import.meta.url), "utf8");
const shapesPanelSource = readFileSync(
  new URL("./StudioBg3dShapesPanel.tsx", import.meta.url),
  "utf8",
);
const ltPanelSource = readFileSync(
  new URL("./StudioBg3dLtPanel.tsx", import.meta.url),
  "utf8",
);

describe("Studio BG3D accessibility boundary", () => {
  it("keeps the camera and physics sub-tabs keyboard navigable", () => {
    expect(viewPanelSource).toContain("VIEW_EDITOR_SECTIONS");
    expect(viewPanelSource).toContain('event.key === "ArrowRight" || event.key === "ArrowDown"');
    expect(viewPanelSource).toContain('event.key === "ArrowLeft" || event.key === "ArrowUp"');
    expect(viewPanelSource).toContain('event.key === "Home"');
    expect(viewPanelSource).toContain('event.key === "End"');
    expect(viewPanelSource).toContain('"bg3d-view-tab-{v0}"');
    expect(viewPanelSource).toContain('{ v0: String(section.id) }');
    expect(viewPanelSource).toContain('aria-labelledby="bg3d-view-tab-physics"');
    expect(viewPanelSource).toContain('aria-labelledby="bg3d-view-tab-camera"');
    expect(viewPanelSource).toContain("?.focus();");
  });

  it("exposes Camera vNext values and gesture completion with mobile-size controls", () => {
    expect(viewPanelSource).toMatch(/label=\{translateCurrentStaticSourceText\([^\n]*"근접 절단"\)\}/u);
    expect(viewPanelSource).toMatch(/label=\{translateCurrentStaticSourceText\([^\n]*"더치 앵글"\)\}/u);
    expect(viewPanelSource).toContain("valueText={`${currentDutchRollDegrees}°`}");
    expect(viewPanelSource).toContain("절단 초기화");
    expect(viewPanelSource).toContain("수평 맞춤");
    expect(viewPanelSource.match(/onChangeEnd=\{finishCameraLensGesture\}/gu)).toHaveLength(3);
    expect(controlSource).toContain("aria-valuetext={valueText}");
    expect(controlSource).toContain("h-11 w-full");
    expect(controlSource).toContain("onKeyUp={onChangeEnd}");
    expect(controlSource).toContain("onPointerUp={onChangeEnd}");
  });

  it("names imported model files and template deletion with a touch-size target", () => {
    expect(assetLibrarySource).toMatch(/aria-label=\{translateCurrentStaticSourceText\([^\n]*"3D 모델 및 연결 파일 선택"\)\}/u);
    expect(userTemplateLibrarySource).toContain('"{v0} 템플릿 삭제"');
    expect(userTemplateLibrarySource).toContain('{ v0: String(entry.name) }');
    expect(userTemplateLibrarySource).toMatch(/title=\{translateCurrentStaticSourceText\([^\n]*"템플릿 삭제"\)\}/u);
    expect(userTemplateLibrarySource).toMatch(/템플릿 삭제[\s\S]*?className="[^"]*size-11[^"]*sm:size-7/u);
  });

  it("never removes a keyboard focus outline without a visible replacement", () => {
    for (const source of [
      editorSource,
      assetLibrarySource,
      userTemplateLibrarySource,
      controlSource,
      shapesPanelSource,
      viewPanelSource,
      ltPanelSource,
    ]) {
      expect(source).not.toMatch(/(?:^|\s)(?:focus:)?outline-none(?![^"\n]*focus-visible:outline)/u);
    }
    expect(controlSource).toContain("focus-visible:outline-2");
  });
});
