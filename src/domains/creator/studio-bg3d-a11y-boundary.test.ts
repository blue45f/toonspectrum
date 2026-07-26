import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const editorSource = readFileSync(new URL("./StudioBackground3D.tsx", import.meta.url), "utf8");
const viewPanelSource = readFileSync(
  new URL("./StudioBg3dViewPanel.tsx", import.meta.url),
  "utf8",
);
const assetLibrarySource = readFileSync(
  new URL("./StudioBg3dAssetLibraryPanel.tsx", import.meta.url),
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
    expect(editorSource).toContain("const VIEW_EDITOR_SECTIONS");
    expect(viewPanelSource).toContain('event.key === "ArrowRight" || event.key === "ArrowDown"');
    expect(viewPanelSource).toContain('event.key === "ArrowLeft" || event.key === "ArrowUp"');
    expect(viewPanelSource).toContain('event.key === "Home"');
    expect(viewPanelSource).toContain('event.key === "End"');
    expect(viewPanelSource).toContain('id={`bg3d-view-tab-${section.id}`}');
    expect(viewPanelSource).toContain('aria-labelledby="bg3d-view-tab-physics"');
    expect(viewPanelSource).toContain('aria-labelledby="bg3d-view-tab-camera"');
    expect(viewPanelSource).toContain("?.focus();");
  });

  it("names imported model files and template deletion with a touch-size target", () => {
    expect(assetLibrarySource).toContain('aria-label="3D 모델 및 연결 파일 선택"');
    expect(editorSource).toContain('aria-label={`${entry.name} 템플릿 삭제`}');
    expect(editorSource).toContain('title="템플릿 삭제"');
    expect(editorSource).toMatch(/템플릿 삭제[\s\S]*?className="[^"]*size-11[^"]*sm:size-7/u);
  });

  it("never removes a keyboard focus outline without a visible replacement", () => {
    for (const source of [
      editorSource,
      assetLibrarySource,
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
