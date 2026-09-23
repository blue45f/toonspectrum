import { describe, expect, it } from "vitest";

import {
  planShaperGradeMirror,
  planShaperGradePoseFromImage,
  planShaperGradePosePreset,
  planShaperGradeRecommend,
  roundTripShaperSession,
  shaperCharacterFromRecipe,
  slotEntryIdsFromSuggestion,
} from "./character-shaper-grade-bridge";
import {
  SHAPER_REST_UPPER_ARM,
  createShaperCharacter,
  type ShaperImage,
} from "./character-shaper-grade";
import { createEmptyCharacterRecipe } from "./character-shaper-recipe";

function image(width: number, height: number, fill: readonly [number, number, number, number] = [255, 255, 255, 255]): ShaperImage {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = fill[0];
    rgba[i + 1] = fill[1];
    rgba[i + 2] = fill[2];
    rgba[i + 3] = fill[3];
  }
  return { width, height, rgba };
}

function stamp(target: ShaperImage, x0: number, y0: number, w: number, h: number, color: readonly [number, number, number, number]) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= target.width || y >= target.height) continue;
      const i = (y * target.width + x) * 4;
      target.rgba[i] = color[0];
      target.rgba[i + 1] = color[1];
      target.rgba[i + 2] = color[2];
      target.rgba[i + 3] = color[3];
    }
  }
}

describe("character-shaper-grade-bridge", () => {
  it("plans recommend commits with catalog entry ids and round-trips sessions", () => {
    const reference = image(80, 100);
    stamp(reference, 10, 8, 60, 28, [20, 16, 18, 255]);
    stamp(reference, 18, 40, 44, 48, [18, 18, 22, 255]);
    const start = createShaperCharacter();
    const planned = planShaperGradeRecommend(reference, start);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.entryIds.length).toBeGreaterThan(0);
    expect(slotEntryIdsFromSuggestion(planned.suggestion)).toEqual(planned.entryIds);
    expect(planned.character.face).not.toBe(start.face);
    expect(roundTripShaperSession(planned.character)).toEqual(planned.character);

    const fromRecipe = shaperCharacterFromRecipe(createEmptyCharacterRecipe(), {
      leftUpperArm: 0.5,
      rightUpperArm: 2,
    });
    expect(fromRecipe.pose.leftUpperArm).toBeCloseTo(0.5, 5);
    expect(roundTripShaperSession(fromRecipe).recipe).toEqual(fromRecipe.recipe);
  });

  it("plans photo pose and mirror without inventing pose-preset steps", () => {
    const plate = image(96, 96);
    stamp(plate, 40, 8, 16, 18, [230, 190, 160, 255]);
    stamp(plate, 36, 28, 24, 48, [30, 30, 36, 255]);
    stamp(plate, 4, 30, 32, 8, [230, 190, 160, 255]);
    stamp(plate, 60, 30, 32, 8, [230, 190, 160, 255]);
    const start = createShaperCharacter();
    const posed = planShaperGradePoseFromImage(plate, start, "photo");
    expect(posed.ok).toBe(true);
    if (!posed.ok) return;
    expect(posed.character.pose.leftUpperArm).not.toBeCloseTo(SHAPER_REST_UPPER_ARM, 1);

    const mirrored = planShaperGradeMirror(posed.character);
    expect(mirrored.character.pose.leftUpperArm).toBeCloseTo(posed.character.pose.rightUpperArm, 5);
    expect(mirrored.undo).toEqual(posed.character);

    const preset = planShaperGradePosePreset(start, "pose:xp_wave_greeting");
    expect(preset.steps).toEqual([{ kind: "pose-preset", presetId: "xp_wave_greeting" }]);
    expect(preset.character.pose.rightUpperArm).toBeLessThan(SHAPER_REST_UPPER_ARM);
  });
});
