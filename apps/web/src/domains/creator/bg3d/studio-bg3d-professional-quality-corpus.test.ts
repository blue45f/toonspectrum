import { describe, expect, it } from "vitest";

import { BG_SCENE_TEMPLATES } from "../studio-background-3d-scene-templates";
import {
  STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS,
  createStudioBg3dProfessionalBenchmarkManifest,
} from "./studio-bg3d-professional-quality-corpus";

describe("Studio BG3D professional quality corpus", () => {
  it("covers the representative production risks with stable unique identifiers", () => {
    expect(STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS).toHaveLength(8);
    const ids = STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS.map((entry) => entry.role))).toEqual(
      new Set(["lifecycle", "environment", "character", "material", "scale"]),
    );
    expect(new Set(STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS.map((entry) => entry.sceneClass))).toEqual(
      new Set(["small", "medium", "large"]),
    );
  });

  it("references real scene templates and requires canonical production passes", () => {
    const templateIds = new Set(BG_SCENE_TEMPLATES.map((template) => template.id));
    for (const entry of STUDIO_BG3D_PROFESSIONAL_QUALITY_CORPUS) {
      if (entry.templateId) expect(templateIds.has(entry.templateId)).toBe(true);
      expect(entry.requiredPasses).toContain("beauty");
      expect(entry.requiredPasses).toContain("depth");
      expect(entry.requiredPasses).toContain("object-id");
      expect(entry.captureWidth * entry.captureHeight).toBeLessThanOrEqual(16_777_216);
      expect(entry.budget).toEqual({
        desktopFrameP95Ms: 16.7,
        mobileFrameP95Ms: 33.3,
        inputLatencyP95Ms: 100,
      });
    }
  });

  it("projects one approved small, medium, and large engine benchmark scene", () => {
    const manifest = createStudioBg3dProfessionalBenchmarkManifest();
    expect(manifest.map((entry) => entry.corpusItemId)).toEqual([
      "small-classroom",
      "medium-street",
      "large-fantasy-hall",
    ]);
    expect(manifest.map((entry) => entry.sceneClass)).toEqual(["small", "medium", "large"]);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(manifest.every((entry) => Object.isFrozen(entry))).toBe(true);
  });
});
