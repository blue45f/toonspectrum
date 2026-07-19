import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const editorSource = readFileSync(new URL("./StudioBackground3D.tsx", import.meta.url), "utf8");
const assetLibrarySource = readFileSync(
  new URL("./StudioBg3dAssetLibraryPanel.tsx", import.meta.url),
  "utf8",
);
const controlSource = readFileSync(new URL("./studio-bg3d-control-fields.tsx", import.meta.url), "utf8");

describe("Studio BG3D accessibility boundary", () => {
  it("keeps the camera and physics sub-tabs keyboard navigable", () => {
    expect(editorSource).toContain("const VIEW_EDITOR_SECTIONS");
    expect(editorSource).toContain('event.key === "ArrowRight" || event.key === "ArrowDown"');
    expect(editorSource).toContain('event.key === "ArrowLeft" || event.key === "ArrowUp"');
    expect(editorSource).toContain('event.key === "Home"');
    expect(editorSource).toContain('event.key === "End"');
    expect(editorSource).toContain('id={`bg3d-view-tab-${section.id}`}');
    expect(editorSource).toContain('aria-labelledby="bg3d-view-tab-physics"');
    expect(editorSource).toContain('aria-labelledby="bg3d-view-tab-camera"');
    expect(editorSource).toContain("?.focus();");
  });

  it("names imported model files and template deletion with a touch-size target", () => {
    expect(assetLibrarySource).toContain('aria-label="3D 모델 및 연결 파일 선택"');
    expect(editorSource).toContain('aria-label={`${entry.name} 템플릿 삭제`}');
    expect(editorSource).toContain('title="템플릿 삭제"');
    expect(editorSource).toMatch(/템플릿 삭제[\s\S]*?className="[^"]*size-11[^"]*sm:size-7/u);
  });

  it("never removes a keyboard focus outline without a visible replacement", () => {
    for (const source of [editorSource, assetLibrarySource, controlSource]) {
      expect(source).not.toMatch(/(?:^|\s)(?:focus:)?outline-none(?![^"\n]*focus-visible:outline)/u);
    }
    expect(controlSource).toContain("focus-visible:outline-2");
  });
});
