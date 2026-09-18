import { describe, expect, it } from "vitest";

import {
  CURATED_CC0_BG_SCENES,
} from "./studio-bg-scenes";
import { GENERATED_GPT25_BG_SCENES } from "./studio-2d-generated-backgrounds";
import {
  getStudioBackgroundTemplateIds,
  getStudioSceneTemplateBackgroundIds,
  listStudioSceneTemplateAssetRecommendations,
} from "./studio-scene-template-asset-recommendations";
import { SCENE_TEMPLATES } from "./studio-scene-templates";

describe("Studio scene-template asset recommendations", () => {
  const recommendations = listStudioSceneTemplateAssetRecommendations();
  const templateIds = SCENE_TEMPLATES.map((template) => template.id);
  const highQualityBackgroundIds = new Set([
    ...CURATED_CC0_BG_SCENES.map((scene) => scene.id),
    ...GENERATED_GPT25_BG_SCENES.map((scene) => scene.id),
  ]);

  it("covers every scene template with reviewed high-quality backgrounds", () => {
    expect(Object.keys(recommendations).toSorted()).toEqual(templateIds.toSorted());
    for (const templateId of templateIds) {
      const backgroundIds = getStudioSceneTemplateBackgroundIds(templateId);
      expect(backgroundIds.length, templateId).toBeGreaterThanOrEqual(2);
      expect(new Set(backgroundIds).size, templateId).toBe(backgroundIds.length);
      for (const backgroundId of backgroundIds) {
        expect(highQualityBackgroundIds.has(backgroundId), `${templateId} -> ${backgroundId}`).toBe(true);
      }
    }
  });

  it("keeps reverse template links symmetric", () => {
    for (const [templateId, backgroundIds] of Object.entries(recommendations)) {
      for (const backgroundId of backgroundIds) {
        expect(getStudioBackgroundTemplateIds(backgroundId)).toContain(templateId);
      }
    }
  });

  it("returns stable empty recommendations for unknown templates", () => {
    expect(getStudioSceneTemplateBackgroundIds("missing-template")).toEqual([]);
  });
});
