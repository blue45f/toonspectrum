import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

  it("records the delivered surfaces as partial rather than inventing menubar commands", () => {
    const source = readCreatorFile("studio-main-menu-group-spec.ts");
    expect(source).toContain('part(\n        "Semantic/Object Select"');
    expect(source).toContain('part(\n        "Expand/Shrink/Feather/Smooth"');
    expect(source).toContain('part(\n        "Save Selection"');
    expect(source).toContain('part(\n        "Selection HUD"');
  });

  it("keeps the benchmark and menu commentary honest about local-only persistence", () => {
    const menuSource = readCreatorFile("studio-main-menu-items-selection.ts");
    const benchmark = readFileSync(
      new URL("../../../../../docs/studio-selection-benchmark.md", import.meta.url),
      "utf8",
    );
    expect(menuSource).toContain("now partially deliver");
    expect(benchmark).toContain("프로젝트/협업 데이터에는 포함하지 않는다");
    expect(benchmark).toContain("safe-area");
  });
});
