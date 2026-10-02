import { describe, expect, it } from "vitest";

import { BLENDER_HAIR_STYLE_IDS, MIN_PRESETS_PER_SLOT, SLOT_PRESET_IDS, allVocabularyPresetIds, isVocabularyPresetId } from "./preset-vocabulary";
import { CHARACTER_SLOT_KINDS } from "./slots";

describe("contracts/preset-vocabulary", () => {
  it("슬롯당 최소 개수를 만족한다(외형 ≥4, 표정 ≥12, 포즈 ≥10, 손 ≥8)", () => {
    for (const slot of CHARACTER_SLOT_KINDS) {
      expect(SLOT_PRESET_IDS[slot].length, slot).toBeGreaterThanOrEqual(MIN_PRESETS_PER_SLOT[slot]);
    }
    expect(SLOT_PRESET_IDS.expression).toHaveLength(12);
    expect(SLOT_PRESET_IDS.pose).toHaveLength(10);
    expect(SLOT_PRESET_IDS["hand-pose"]).toHaveLength(8);
  });

  it("슬롯 안에서 id가 중복되지 않고 kebab-case다", () => {
    for (const slot of CHARACTER_SLOT_KINDS) {
      const ids = SLOT_PRESET_IDS[slot];
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/u);
    }
  });

  it("Blender HairStyle 6종이 헤어 어휘 앞 6개와 같다", () => {
    expect(BLENDER_HAIR_STYLE_IDS).toEqual(["short-layered", "soft-bob", "romance-long", "action-pony", "hime-cut", "wolf-layered"]);
    expect(SLOT_PRESET_IDS.hair.slice(0, 6)).toEqual(BLENDER_HAIR_STYLE_IDS);
  });

  it("외형 12슬롯 어휘 합이 64개다", () => {
    const appearance = ["face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair", "body", "top", "bottom", "shoes", "accessory"] as const;
    const total = appearance.reduce((sum, slot) => sum + SLOT_PRESET_IDS[slot].length, 0);
    expect(total).toBe(64);
  });

  it("allVocabularyPresetIds·isVocabularyPresetId", () => {
    const all = allVocabularyPresetIds();
    expect(all).toHaveLength(64 + 30);
    expect(all[0]).toBe("face-shape/oval");
    expect(isVocabularyPresetId("hair/twin-tail")).toBe(true);
    expect(isVocabularyPresetId("hair/mohawk")).toBe(false);
  });
});
