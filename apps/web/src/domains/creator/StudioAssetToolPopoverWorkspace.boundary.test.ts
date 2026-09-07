import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioAssetToolPopoverWorkspace.tsx", import.meta.url),
  "utf8",
);

describe("StudioAssetToolPopoverWorkspace review boundaries", () => {
  it("ships cold-entry scene catalogs without requiring legacy tab visits", () => {
    expect(source).toContain('import { BG_SCENES } from "./studio-bg-scenes"');
    expect(source).toContain('import { BG_SCENES_EXTRA } from "./studio-bg-scenes-extra"');
    expect(source).toContain('import { SCENE_TEMPLATES } from "./studio-scene-templates"');
    expect(source).toContain("...BG_SCENES");
    expect(source).toContain("...BG_SCENES_EXTRA");
    expect(source).toContain("...SCENE_TEMPLATES");
  });

  it("hands zero-result context to the prompt actually consumed by AI Assist", () => {
    expect(source).toContain('applyAiAssistPresetPrompt("background", prompt)');
    expect(source).not.toContain("setAssetPrompt(prompt)");
  });

  it("keeps community deep links visible without a second discovery click", () => {
    expect(source).toContain('toolBelt.assetTab === "community"');
    expect(source).toContain("<StudioAssetLegacyPanel toolBelt={toolBelt} />");
  });

  it("routes scene templates through their owned preview surface", () => {
    expect(source).toContain('case "scene-template":');
    expect(source).toContain('toolBelt.setMenu("scene")');
    expect(source).toContain('useLabel: "장면 도구 열기"');
    expect(source).not.toContain("handlers.addSceneTemplate(item.source.value)");
  });

  it("routes native semantic assets to their owned editor", () => {
    expect(source).toContain('case "native-tool":');
    expect(source).toContain("toolBelt.setMenu(item.source.value.menu)");
  });
});
