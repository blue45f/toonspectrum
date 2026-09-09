import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { STUDIO_MENU_GROUP_SPEC } from "./studio-main-menu-group-spec";

const readCreatorFile = (name: string) => readFileSync(
  new URL(`./${name}`, import.meta.url),
  "utf8",
);

describe("studio pixel-selection workbench integration", () => {
  it("mounts the inspector workbench on the verified raster selection path", () => {
    const source = readCreatorFile("StudioInspectorImageToolsSection.tsx");
    expect(source).toContain('from "./StudioSelectionWorkbenchPanel"');
    expect(source).toContain("<StudioSelectionWorkbenchPanel");
    expect(source).toContain('intent === "smooth"');
    expect(source).toContain('intent === "restore-saved"');
    expect(source).toContain("imageSource={selectedReadableImageSource ?? null}");
    expect(source).toContain("operation={pixelCombine}");
  });

  it("mounts a safe-area-aware pixel-selection HUD without overlapping the object bar", () => {
    const canvasSource = readCreatorFile("studio-cuttoon-editor/StudioCuttoonEditorCanvasColumn.tsx");
    const hudSource = readCreatorFile("StudioPixelSelectionHud.tsx");
    expect(canvasSource).toContain('from "../StudioPixelSelectionHud"');
    expect(canvasSource).toContain("<StudioPixelSelectionHud");
    expect(canvasSource).toContain("stableHandlers={studioOnCanvasSurfaceHandlers}");
    expect(canvasSource).toContain("&& !pixelOverlaySel");
    expect(canvasSource).toContain('"hud-feather"');
    expect(hudSource).toContain("planStudioSelectionContextBarPlacement");
    expect(hudSource).toContain("studioOnCanvasSafeArea");
    expect(hudSource).toContain("createPortal(");
    expect(hudSource).toContain("data-studio-pixel-selection-hud=\"true\"");
  });

  it("does not claim menubar coverage for inspector-only and contextual capabilities", () => {
    const selectGroup = STUDIO_MENU_GROUP_SPEC.find((group) => group.id === "select");
    expect(selectGroup).toBeTruthy();

    for (const spec of [
      "Semantic/Object Select",
      "Expand/Shrink/Feather/Smooth",
      "Save Selection",
      "Selection HUD",
    ]) {
      const row = selectGroup?.rows.find((candidate) => candidate.spec === spec);
      expect(row?.coverage).toBe("absent");
      expect(row?.items).toEqual([]);
      expect(row?.note).toBeTruthy();
    }
  });

  it("keeps the benchmark and menu commentary honest about local-only persistence", () => {
    const menuSource = readCreatorFile("studio-main-menu-items-selection.ts");
    const benchmark = readFileSync(
      new URL("../../../../../docs/studio-selection-benchmark.md", import.meta.url),
      "utf8",
    );
    expect(menuSource).toContain("outside the menubar");
    expect(benchmark).toContain("프로젝트/협업 데이터에는 포함하지 않는다");
    expect(benchmark).toContain("safe-area");
  });
});
