import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHAPER_SELECTION,
  DEFAULT_SHAPER_SURFACE_DRAW_STATE,
  SHAPER_AI_ARCHETYPES,
  SHAPER_CATEGORIES,
  SHAPER_PRESETS,
  applyShaperSelectionToBodyParams,
  buildShaperLayeredPsd,
  countShaperLiveCategories,
  createShaperLineArtFromComposite,
  isShaperCategoryInteractive,
  recommendShaperPreset,
} from "./studio-shaper-model";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
} from "./studio-mannequin-model";

describe("studio-shaper-model", () => {
  it("keeps all 14 benchmark slots visible but only real runtime slots interactive", () => {
    expect(SHAPER_CATEGORIES).toHaveLength(14);
    expect(countShaperLiveCategories()).toBe(6);
    expect(isShaperCategoryInteractive("face")).toBe(true);
    expect(isShaperCategoryInteractive("bodypose")).toBe(true);
    expect(isShaperCategoryInteractive("hair")).toBe(false);
    expect(isShaperCategoryInteractive("top")).toBe(false);
    expect(SHAPER_CATEGORIES.find((category) => category.id === "hair")).toMatchObject({
      capability: "routed",
      unavailableReason: expect.stringContaining("3D 캐릭터 편집기"),
    });
  });

  it("publishes selectable presets only for capability-backed categories", () => {
    const presetCategories = new Set(SHAPER_PRESETS.map((preset) => preset.category));
    expect([...presetCategories].sort()).toEqual(
      ["body", "bodypose", "eye", "face", "handpose", "nose"].sort(),
    );
    for (const category of presetCategories) {
      expect(isShaperCategoryInteractive(category)).toBe(true);
    }
  });

  it("uses one planner for preview and committed mannequin parameters", () => {
    const base = {
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      ...STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
    };
    const selection = {
      ...DEFAULT_SHAPER_SELECTION,
      face: "face-sharp",
      eye: "eye-large",
      nose: "nose-high",
      body: "body-muscular",
    };

    const planned = applyShaperSelectionToBodyParams(base, selection);
    expect(planned.shoulderWidth).toBeGreaterThan(1.1);
    expect(planned.build).toBeGreaterThan(2);
    expect(planned.faceWidth).toBeLessThan(1);
    expect(planned.eyeScale).toBe(1.15);
    expect(planned.noseHeight).toBe(1.18);
  });

  it("keeps deterministic style recipes under the historical compatibility export", () => {
    for (const recipe of SHAPER_AI_ARCHETYPES) {
      const recommended = recommendShaperPreset(recipe.id);
      expect(Object.keys(recommended)).toHaveLength(14);
      expect(recommended.face).toBeDefined();
      expect(recommended.body).toBeDefined();
      expect(recommended.bodypose).toBeDefined();
    }
  });

  it("retains old saved surface-state parsing without exposing it as a product tool", () => {
    expect(DEFAULT_SHAPER_SURFACE_DRAW_STATE.active).toBe(false);
    expect(DEFAULT_SHAPER_SURFACE_DRAW_STATE.brushMode).toBe("pen");
    expect(DEFAULT_SHAPER_SURFACE_DRAW_STATE.strokes).toEqual([]);
  });

  it("creates internal luminance edges instead of only alpha silhouette pixels", () => {
    const width = 3;
    const height = 3;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      const bright = pixel % width === 2;
      rgba[offset] = bright ? 240 : 20;
      rgba[offset + 1] = bright ? 240 : 20;
      rgba[offset + 2] = bright ? 240 : 20;
      rgba[offset + 3] = 255;
    }
    const lineArt = createShaperLineArtFromComposite(rgba, width, height);
    expect(lineArt.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
  });

  it("writes semantic body layers into a transparent PSD", () => {
    const width = 4;
    const height = 4;
    const composite = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < composite.length; offset += 4) {
      composite[offset] = 120;
      composite[offset + 1] = 90;
      composite[offset + 2] = 70;
      composite[offset + 3] = 255;
    }
    const head = new Uint8ClampedArray(composite.length);
    head.set(composite.subarray(0, 8), 0);
    const torso = new Uint8ClampedArray(composite.length);
    torso.set(composite.subarray(8), 8);

    const blob = buildShaperLayeredPsd({
      width,
      height,
      flatColor: composite,
      semanticLayers: [
        { id: "head", name: "머리·목", data: head },
        { id: "torso", name: "몸통", data: torso },
      ],
      lineArt: createShaperLineArtFromComposite(composite, width, height),
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/vnd.adobe.photoshop");
    expect(blob.size).toBeGreaterThan(50);
  });
});
