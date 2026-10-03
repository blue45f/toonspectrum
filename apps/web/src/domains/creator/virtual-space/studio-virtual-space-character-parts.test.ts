import { describe, expect, it } from "vitest";

import {
  STUDIO_CHARACTER_ACCESSORY_PARTS,
  STUDIO_CHARACTER_HAIR_PARTS,
  STUDIO_CHARACTER_OUTFIT_PARTS,
  STUDIO_CHARACTER_PART_PRESETS,
  STUDIO_CHARACTER_SKIN_PARTS,
  randomStudioCharacterParts,
  resolveStudioCharacterPartConflicts,
  studioCharacterAccessoryPart,
  studioCharacterHairPart,
  studioCharacterOutfitPart,
  studioCharacterPartPreset,
  studioCharacterPresetPalette,
  studioCharacterPresetParts,
  studioCharacterSkinPart,
} from "./studio-virtual-space-character-parts";
import {
  STUDIO_AVATAR_ACCESSORY_OPTIONS,
  STUDIO_AVATAR_HAIR_COLOR_OPTIONS,
  STUDIO_AVATAR_HAIR_STYLE_OPTIONS,
  STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS,
} from "./studio-virtual-space-avatar-options";
import { parseStudioVirtualAvatarProfile } from "./studio-virtual-space-avatar-store";

/** 결정적 난수 (테스트 재현용). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("파츠 카탈로그", () => {
  it("요구 수량을 만족한다 (헤어 18·의상 18·액세서리 16·스킨 10·프리셋 11)", () => {
    expect(STUDIO_CHARACTER_HAIR_PARTS).toHaveLength(18);
    expect(STUDIO_CHARACTER_OUTFIT_PARTS).toHaveLength(18);
    expect(STUDIO_CHARACTER_ACCESSORY_PARTS).toHaveLength(16);
    expect(STUDIO_CHARACTER_SKIN_PARTS).toHaveLength(10);
    expect(STUDIO_CHARACTER_PART_PRESETS).toHaveLength(11);
  });

  it("모든 파츠·프리셋에 한·영 라벨이 있다", () => {
    for (const part of [
      ...STUDIO_CHARACTER_HAIR_PARTS,
      ...STUDIO_CHARACTER_OUTFIT_PARTS,
      ...STUDIO_CHARACTER_ACCESSORY_PARTS,
      ...STUDIO_CHARACTER_SKIN_PARTS,
      ...STUDIO_CHARACTER_PART_PRESETS,
    ]) {
      expect(part.labelKo.trim().length, part.key).toBeGreaterThan(0);
      expect(part.labelEn.trim().length, part.key).toBeGreaterThan(0);
    }
  });

  it("카탈로그별 키가 중복되지 않는다", () => {
    for (const catalog of [
      STUDIO_CHARACTER_HAIR_PARTS,
      STUDIO_CHARACTER_OUTFIT_PARTS,
      STUDIO_CHARACTER_ACCESSORY_PARTS,
      STUDIO_CHARACTER_PART_PRESETS,
    ]) {
      const keys = catalog.map((item) => item.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    const skinKeys = STUDIO_CHARACTER_SKIN_PARTS.map((item) => item.key);
    expect(new Set(skinKeys).size).toBe(skinKeys.length);
  });

  it("스킨톤 색상이 oklch 형식이다", () => {
    for (const part of STUDIO_CHARACTER_SKIN_PARTS) {
      expect(part.color.startsWith("oklch(")).toBe(true);
    }
  });
});

describe("파츠 조회", () => {
  it("헤어·의상·액세서리·스킨을 키로 찾는다", () => {
    expect(studioCharacterHairPart("twin")?.tied).toBe("twin");
    expect(studioCharacterHairPart("long")?.length).toBe("long");
    expect(studioCharacterOutfitPart("dress")?.bottom).toBe("skirt");
    expect(studioCharacterOutfitPart("hoodie")?.sleeves).toBe("long");
    expect(studioCharacterAccessoryPart("glasses")?.slot).toBe("face");
    expect(studioCharacterAccessoryPart("cap")?.conflictsWithHair).toContain("twin");
    expect(studioCharacterSkinPart("oklch(0.91 0.055 55)")?.labelKo).toBe("밝은 살구");
  });

  it("없는 키는 null이다", () => {
    expect(studioCharacterHairPart("unknown" as never)).toBeNull();
    expect(studioCharacterOutfitPart("unknown" as never)).toBeNull();
    expect(studioCharacterAccessoryPart("unknown" as never)).toBeNull();
    expect(studioCharacterSkinPart("red")).toBeNull();
    expect(studioCharacterPartPreset("unknown")).toBeNull();
  });
});

describe("파츠 충돌 해소", () => {
  it("모자와 트윈테일은 충돌해 액세서리가 제거된다", () => {
    const resolved = resolveStudioCharacterPartConflicts({
      hairStyle: "twin", outfitStyle: "tee", accessory: "cap",
    });
    expect(resolved.accessory).toBe("none");
    expect(resolved.hairStyle).toBe("twin");
  });

  it("충돌하지 않는 조합은 그대로 유지된다", () => {
    const parts = { hairStyle: "bob", outfitStyle: "suit", accessory: "glasses" } as const;
    expect(resolveStudioCharacterPartConflicts(parts)).toEqual(parts);
  });
});

describe("프리셋", () => {
  it("11종 프리셋이 유효한 파츠 키를 참조한다", () => {
    for (const preset of STUDIO_CHARACTER_PART_PRESETS) {
      expect(studioCharacterHairPart(preset.hairStyle), preset.key).not.toBeNull();
      expect(studioCharacterOutfitPart(preset.outfitStyle), preset.key).not.toBeNull();
      expect(studioCharacterAccessoryPart(preset.accessory), preset.key).not.toBeNull();
      expect(studioCharacterSkinPart(preset.skin), preset.key).not.toBeNull();
    }
  });

  it("모든 프리셋이 아바타 저장소 검증을 통과한다 (커스터마이저 저장 보장)", () => {
    for (const preset of STUDIO_CHARACTER_PART_PRESETS) {
      const parsed = parseStudioVirtualAvatarProfile({
        skin: preset.skin, hair: preset.hair, hairHighlight: preset.hairHighlight,
        outfit: preset.outfit, accent: preset.accent, accessory: preset.accessory,
        hairStyle: preset.hairStyle, outfitStyle: preset.outfitStyle, expression: "smile",
      });
      expect(parsed, preset.key).not.toBeNull();
    }
  });

  it("프리셋의 헤어 색과 하이라이트가 카탈로그 쌍과 같다 (커스터마이저 버튼이 조용히 무시되지 않는다)", () => {
    for (const preset of STUDIO_CHARACTER_PART_PRESETS) {
      const hair = STUDIO_AVATAR_HAIR_COLOR_OPTIONS.find((option) => option.value === preset.hair);
      expect(hair?.highlight, preset.key).toBe(preset.hairHighlight);
    }
  });

  it("프리셋에서 팔레트·파츠를 만든다", () => {
    const preset = studioCharacterPartPreset("barista");
    if (!preset) throw new Error("프리셋 누락: barista");
    expect(preset.labelKo).toBe("바리스타 룩");
    const palette = studioCharacterPresetPalette(preset);
    expect(palette.skin).toBe(preset.skin);
    const parts = studioCharacterPresetParts(preset);
    expect(parts).toEqual({ hairStyle: "bun", outfitStyle: "apron", accessory: "headband" });
  });
});

describe("randomStudioCharacterParts", () => {
  it("결정적 시드로 유효한 조합을 만든다", () => {
    const first = randomStudioCharacterParts(seededRandom(42));
    const second = randomStudioCharacterParts(seededRandom(42));
    expect(first).toEqual(second);
    for (const color of Object.values(first.palette)) {
      expect(color.startsWith("oklch(")).toBe(true);
    }
    expect(studioCharacterHairPart(first.parts.hairStyle)).not.toBeNull();
    expect(studioCharacterOutfitPart(first.parts.outfitStyle)).not.toBeNull();
    expect(studioCharacterAccessoryPart(first.parts.accessory)).not.toBeNull();
    // 충돌 조합이 해소되어 있다.
    const accessory = studioCharacterAccessoryPart(first.parts.accessory);
    expect(accessory?.conflictsWithHair.includes(first.parts.hairStyle) ?? false).toBe(false);
  });

  it("여러 시드에서 충돌이 해소된 조합만 나온다", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { parts } = randomStudioCharacterParts(seededRandom(seed));
      const accessory = studioCharacterAccessoryPart(parts.accessory);
      expect(accessory?.conflictsWithHair.includes(parts.hairStyle) ?? false).toBe(false);
    }
  });
});

describe("조합 유효성 (전수 교차)", () => {
  it("커스터마이저 카탈로그의 모든 키에 파츠 메타가 있다", () => {
    for (const option of STUDIO_AVATAR_HAIR_STYLE_OPTIONS) {
      expect(studioCharacterHairPart(option.key), option.key).not.toBeNull();
    }
    for (const option of STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS) {
      expect(studioCharacterOutfitPart(option.key), option.key).not.toBeNull();
    }
    for (const option of STUDIO_AVATAR_ACCESSORY_OPTIONS) {
      expect(studioCharacterAccessoryPart(option.key), option.key).not.toBeNull();
    }
  });

  it("헤어×액세서리 전 조합은 충돌 해소 후 잔여 충돌이 없다", () => {
    for (const hair of STUDIO_CHARACTER_HAIR_PARTS) {
      for (const accessory of STUDIO_CHARACTER_ACCESSORY_PARTS) {
        const resolved = resolveStudioCharacterPartConflicts({
          hairStyle: hair.style, outfitStyle: "tee", accessory: accessory.accessory,
        });
        const resolvedAccessory = studioCharacterAccessoryPart(resolved.accessory);
        expect(
          resolvedAccessory?.conflictsWithHair ?? [],
          `${hair.style} × ${accessory.accessory}`,
        ).not.toContain(resolved.hairStyle);
      }
    }
  });

  it("몸통 슬롯 액세서리(백팩·토트백·목도리)는 어떤 헤어와도 충돌하지 않는다", () => {
    for (const key of ["backpack", "tote", "scarf"] as const) {
      const part = studioCharacterAccessoryPart(key);
      expect(part?.slot, key).toBe("body");
      expect(part?.conflictsWithHair, key).toEqual([]);
    }
  });
});
