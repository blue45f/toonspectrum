import { describe, expect, it } from "vitest";

import {
  auditStudioUnifiedAssetPreviews,
  resolveStudioUnifiedAssetRichPreview,
} from "./studio-unified-asset-preview";
import { buildStudioUnifiedAssetCatalog } from "./studio-unified-asset-catalog";

import type { SceneTemplate } from "./studio-scene-templates";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const sceneTemplate: SceneTemplate = {
  id: "preview-contract",
  label: "미리보기 계약 장면",
  category: "daily",
  description: "프레임과 대사를 포함합니다.",
  build: () => [
    {
      type: "frame",
      x: 0,
      y: 0,
      width: 720,
      height: 480,
      bgColor: "#ffffff",
    },
    {
      type: "text",
      text: "장면",
      x: 40,
      y: 40,
      width: 160,
      fontSize: 32,
      fill: "#111111",
      rotation: 0,
    },
  ],
};

function templateItem(): StudioUnifiedAssetItem {
  return {
    id: "scene-template:preview-contract",
    category: "scene",
    scope: "studio",
    title: sceneTemplate.label,
    description: sceneTemplate.description,
    categoryLabel: "장면 템플릿",
    keywords: ["장면"],
    badges: ["장면 레시피"],
    preview: { kind: "none" },
    useMode: "apply",
    useLabel: "장면 배치",
    discoverability: "featured",
    sortPriority: 1,
    source: { kind: "scene-template", value: sceneTemplate },
  };
}

describe("studio unified asset rich preview contract", () => {
  it("turns a scene template into a real schematic summary", () => {
    const preview = resolveStudioUnifiedAssetRichPreview(templateItem());
    expect(preview.kind).toBe("scene-template");
    if (preview.kind !== "scene-template") throw new Error("unexpected preview kind");
    expect(preview.summary.frames).toBe(1);
    expect(preview.summary.texts).toBe(1);
    expect(preview.facts).toContain("프레임 1");
  });

  it("resolves every shipped 3D catalog item to an interactive source", () => {
    const items = buildStudioUnifiedAssetCatalog({
      elements: [],
      nativeTools: [],
      backgrounds: [],
      sceneTemplates: [],
      localAssets: [],
    }).filter((item) => item.category === "3d");

    expect(items.length).toBeGreaterThan(40);
    for (const item of items) {
      expect(resolveStudioUnifiedAssetRichPreview(item).kind, item.id).toBe("three");
    }
  });

  it("keeps 2D image and vector originals as visual previews", () => {
    const [background, element] = buildStudioUnifiedAssetCatalog({
      backgrounds: [{
        id: "preview-bg",
        label: "미리보기 배경",
        genre: "일상",
        width: 720,
        height: 480,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480"><rect width="720" height="480"/></svg>',
      }],
      sceneTemplates: [],
      localAssets: [],
      nativeTools: [],
      elements: [{
        id: "preview-element",
        label: "미리보기 요소",
        category: "decor",
        keywords: ["preview"],
        width: 64,
        height: 64,
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/></svg>',
      }],
      objects: [],
    });

    expect(resolveStudioUnifiedAssetRichPreview(background).kind).toBe("svg");
    expect(resolveStudioUnifiedAssetRichPreview(element).kind).toBe("svg");
  });

  it("reports visual coverage without treating generated tool posters as asset originals", () => {
    const items = buildStudioUnifiedAssetCatalog({
      backgrounds: [],
      sceneTemplates: [sceneTemplate],
      localAssets: [],
      elements: [],
      objects: [],
    });
    const audit = auditStudioUnifiedAssetPreviews(items);
    expect(audit.total).toBe(2);
    expect(audit.templates).toBe(1);
    expect(audit.generatedFallbacks).toBe(0);
    expect(audit.coveragePercent).toBe(100);
  });
});
