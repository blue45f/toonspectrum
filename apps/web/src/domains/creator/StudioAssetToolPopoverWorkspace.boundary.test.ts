import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const wrapperSource = read("./StudioAssetToolPopoverWorkspace.tsx");
const contentSource = read("./StudioUnifiedAssetToolPopoverContent.tsx");
const insertWorkspaceSource = read("./StudioInsertHubWorkspace.tsx");
const insertModelSource = read("./studio-insert-hub-model.ts");
const lazySource = read("./studio-unified-asset-lazy-ui.ts");

describe("Studio insertion hub review boundaries", () => {
  it("loads unified catalogs and the insertion hub only after the asset subtab is active", () => {
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
      "./StudioInsertHubWorkspace",
    ]) {
      expect(wrapperSource).not.toContain(heavyModule);
      expect(contentSource).toContain(heavyModule);
    }
    expect(contentSource).not.toContain("./StudioUnifiedAssetWorkspace");
  });

  it("keeps browser storage and discovery state inside the lazy insertion workspace", () => {
    expect(contentSource).not.toContain("window.localStorage");
    expect(insertWorkspaceSource).toContain("window.localStorage");
    expect(insertWorkspaceSource).toContain("loadStudioInsertHubPreferences");
    expect(insertWorkspaceSource).toContain("saveStudioInsertHubPreferences");
    expect(insertModelSource).toContain("STUDIO_INSERT_HUB_MAX_RECENTS");
    expect(insertModelSource).toContain("STUDIO_INSERT_HUB_MAX_FAVORITES");
  });

  it("ships cold-entry scene catalogs without requiring legacy tab visits", () => {
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
  });

  it("hands zero-result context to the prompt actually consumed by AI Assist", () => {
    expect(contentSource).toContain("applyAiAssistPresetPrompt(");
    expect(contentSource).toContain('"background"');
    expect(contentSource).not.toContain("setAssetPrompt(prompt)");
  });

  it("opens community deep links without unmounting the unified insertion surface", () => {
    expect(contentSource).toContain(
      'toolBelt.assetTab === "community" ? "library" : "insert"',
    );
    expect(contentSource).toContain(
      "<StudioAssetLegacyPanel toolBelt={toolBelt} />",
    );
    expect(contentSource).not.toContain(
      '{toolBelt.assetTab === "community" ? (',
    );
  });

  it("routes scene templates through their owned preview surface", () => {
    expect(contentSource).toContain('case "scene-template":');
    expect(contentSource).toContain('toolBelt.setMenu("scene")');
    expect(contentSource).toContain('useLabel: "장면 도구 열기"');
    expect(contentSource).not.toContain(
      "handlers.addSceneTemplate(item.source.value)",
    );
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
  });
});
