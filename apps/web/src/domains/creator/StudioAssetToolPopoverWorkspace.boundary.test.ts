import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const wrapperSource = read("./StudioAssetToolPopoverWorkspace.tsx");
const contentSource = read("./StudioUnifiedAssetToolPopoverContent.tsx");
const lazySource = read("./studio-unified-asset-lazy-ui.ts");

describe("StudioAssetToolPopoverWorkspace review boundaries", () => {
  it("loads unified catalogs only after the asset subtab is active", () => {
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
      "./StudioUnifiedAssetWorkspace",
    ]) {
      expect(wrapperSource).not.toContain(heavyModule);
      expect(contentSource).toContain(heavyModule);
    }
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

  it("opens community deep links without unmounting unified discovery", () => {
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
});
