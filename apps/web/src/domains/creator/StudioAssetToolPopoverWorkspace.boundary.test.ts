import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const wrapperSource = read("./StudioAssetToolPopoverWorkspace.tsx");
const contentSource = read("./StudioUnifiedAssetToolPopoverContent.tsx");
const workspaceSource = read("./StudioUnifiedAssetWorkspace.tsx");
const previewSource = read("./StudioUnifiedAssetPreviewSurface.tsx");
const previewModelSource = read("./studio-unified-asset-preview.ts");
const insertModelSource = read("./studio-insert-hub-model.ts");
const lazySource = read("./studio-unified-asset-lazy-ui.ts");

describe("Studio asset workspace boundaries", () => {
  it("loads unified catalogs and the visual workspace only after the asset menu is active", () => {
    expect(wrapperSource).toContain('if (toolBelt.menu !== "asset")');
    expect(wrapperSource).toContain(
      "<LazyStudioUnifiedAssetToolPopoverContent toolBelt={toolBelt} />",
    );
    expect(wrapperSource).toContain("<Suspense");
    expect(lazySource).toContain(
      'import("./StudioUnifiedAssetToolPopoverContent")',
    );

    for (const heavyModule of [
      "./studio-bg-scenes",
      "./studio-bg-scenes-extra",
      "./studio-scene-templates",
      "./studio-unified-asset-catalog",
      "./studio-insert-hub-model",
      "./StudioUnifiedAssetWorkspace",
    ]) {
      expect(wrapperSource).not.toContain(heavyModule);
      expect(contentSource).toContain(heavyModule);
    }
    expect(contentSource).not.toContain("./StudioInsertHubWorkspace");
  });

  it("keeps browser storage and discovery state inside the lazy visual workspace", () => {
    expect(contentSource).not.toContain("window.localStorage");
    expect(workspaceSource).toContain("window.localStorage");
    expect(workspaceSource).toContain("loadStudioInsertHubPreferences");
    expect(workspaceSource).toContain("saveStudioInsertHubPreferences");
    expect(insertModelSource).toContain("STUDIO_INSERT_HUB_MAX_RECENTS");
    expect(insertModelSource).toContain("STUDIO_INSERT_HUB_MAX_FAVORITES");
  });

  it("ships cold-entry 2D, template, and 3D catalogs without legacy tab visits", () => {
    expect(contentSource).toContain(
      'import { BG_SCENES } from "./studio-bg-scenes"',
    );
    expect(contentSource).toContain(
      'import { BG_SCENES_EXTRA } from "./studio-bg-scenes-extra"',
    );
    expect(contentSource).toContain(
      'import { SCENE_TEMPLATES } from "./studio-scene-templates"',
    );
    expect(contentSource).toContain("...BG_SCENES");
    expect(contentSource).toContain("...BG_SCENES_EXTRA");
    expect(contentSource).toContain("...SCENE_TEMPLATES");
    expect(previewModelSource).toContain('kind: "three"');
    expect(previewModelSource).toContain('kind: "scene-template"');
  });

  it("uses actual template maps and lazy Three.js previews instead of generic icons", () => {
    expect(previewSource).toContain("<StudioSceneTemplateMap");
    expect(previewSource).toContain('import("three")');
    expect(previewSource).toContain('import("three/examples/jsm/loaders/GLTFLoader.js")');
    expect(previewSource).toContain("toDataURL(\"image/webp\"");
    expect(previewSource).toContain("disposeObject");
    expect(workspaceSource).toContain("<StudioUnifiedAssetPreviewSurface");
  });

  it("hands zero-result context to the prompt actually consumed by AI Assist", () => {
    expect(contentSource).toContain("applyAiAssistPresetPrompt(");
    expect(contentSource).toContain('"background"');
    expect(contentSource).not.toContain("setAssetPrompt(prompt)");
  });

  it("opens community deep links without unmounting the visual workspace", () => {
    expect(contentSource).toContain(
      'toolBelt.assetTab === "community" ? "library" : "discover"',
    );
    expect(contentSource).toContain(
      "<StudioAssetLegacyPanel toolBelt={toolBelt} />",
    );
    expect(contentSource).not.toContain(
      '{toolBelt.assetTab === "community" ? (',
    );
  });

  it("applies scene recipes directly after their visual preview", () => {
    expect(contentSource).toContain('case "scene-template":');
    expect(contentSource).toContain(
      "handlers.addSceneTemplate(item.source.value)",
    );
    expect(contentSource).not.toContain('useLabel: "장면 도구 열기"');
  });

  it("removes the duplicate pre-result tab and review stack", () => {
    expect(contentSource).not.toContain("StudioMenuSubtabs");
    expect(contentSource).not.toContain("StudioInsertBatchPreflight");
    expect(contentSource).not.toContain("StudioUnifiedAssetSmartLibrary");
    expect(contentSource).not.toContain("StudioAssetLibraryCollections");
    expect(workspaceSource).toContain("responsive-three-pane");
  });

  it("routes native semantic assets to their owned editor", () => {
    expect(contentSource).toContain('case "native-tool":');
    expect(contentSource).toContain(
      "toolBelt.setMenu(item.source.value.menu)",
    );
  });

  it("keeps immediate mutations behind the existing review lock", () => {
    expect(contentSource).toContain("assertInsertMutationAllowed(toolBelt)");
    expect(contentSource).toContain("toolBelt.activeSurfaceReviewLocked");
    expect(contentSource).toContain(
      "await toolBelt.stableHandlers.onPickImage(event)",
    );
    expect(workspaceSource).toContain("reviewLocked");
  });
});
