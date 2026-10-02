/**
 * 캐릭터 파츠 시스템 (프로시저럴 스프라이트용)
 *
 * 헤어·의상·액세서리·스킨톤 파츠 카탈로그와 조합 규칙을 정의한다.
 * 라벨은 `studio-virtual-space-avatar-options.ts`의 카탈로그를 재사용해
 * 커스터마이저 UI와 파츠 키가 어긋나지 않게 한다. 실제 캔버스 드로잉은
 * `studio-virtual-space-character-procedural.ts`가 담당한다.
 */

import type {
  StudioVirtualAvatarAccessory,
  StudioVirtualAvatarHairStyle,
  StudioVirtualAvatarOutfitStyle,
} from "./studio-virtual-space-model";
import {
  STUDIO_AVATAR_ACCESSORY_OPTIONS,
  STUDIO_AVATAR_ACCENT_OPTIONS,
  STUDIO_AVATAR_HAIR_COLOR_OPTIONS,
  STUDIO_AVATAR_HAIR_STYLE_OPTIONS,
  STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS,
  STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS,
  STUDIO_AVATAR_SKIN_OPTIONS,
  type StudioAvatarColorOption,
} from "./studio-virtual-space-avatar-options";
import type {
  ProceduralCharacterPalette,
  ProceduralCharacterParts,
} from "./studio-virtual-space-character-procedural";

export type StudioCharacterPartKind = "hair" | "outfit" | "accessory" | "skin";

export interface StudioCharacterPartBase {
  readonly kind: StudioCharacterPartKind;
  readonly key: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 헤어 파츠 12종. */
export interface StudioCharacterHairPart extends StudioCharacterPartBase {
  readonly kind: "hair";
  readonly style: StudioVirtualAvatarHairStyle;
  readonly length: "short" | "medium" | "long";
  readonly tied: "none" | "twin" | "ponytail" | "bun" | "braid" | "pigtails";
}

const HAIR_META: Readonly<Record<StudioVirtualAvatarHairStyle, { readonly length: "short" | "medium" | "long"; readonly tied: "none" | "twin" | "ponytail" | "bun" | "braid" | "pigtails" }>> = {
  bob: { length: "medium", tied: "none" },
  long: { length: "long", tied: "none" },
  short: { length: "short", tied: "none" },
  twin: { length: "long", tied: "twin" },
  wave: { length: "long", tied: "none" },
  crop: { length: "short", tied: "none" },
  ponytail: { length: "long", tied: "ponytail" },
  bun: { length: "medium", tied: "bun" },
  curly: { length: "medium", tied: "none" },
  braid: { length: "long", tied: "braid" },
  pigtails: { length: "medium", tied: "pigtails" },
  mohawk: { length: "short", tied: "none" },
};

export const STUDIO_CHARACTER_HAIR_PARTS: readonly StudioCharacterHairPart[] = Object.freeze(
  STUDIO_AVATAR_HAIR_STYLE_OPTIONS.map((option): StudioCharacterHairPart => {
    const meta = HAIR_META[option.key];
    return Object.freeze({
      kind: "hair",
      key: option.key,
      labelKo: option.labelKo,
      labelEn: option.labelEn,
      style: option.key,
      length: meta.length,
      tied: meta.tied,
    });
  }),
);

/** 의상 파츠 12종. */
export interface StudioCharacterOutfitPart extends StudioCharacterPartBase {
  readonly kind: "outfit";
  readonly style: StudioVirtualAvatarOutfitStyle;
  readonly sleeves: "short" | "long" | "sleeveless";
  readonly bottom: "pants" | "skirt" | "long";
}

const OUTFIT_META: Readonly<Record<StudioVirtualAvatarOutfitStyle, { readonly sleeves: "short" | "long" | "sleeveless"; readonly bottom: "pants" | "skirt" | "long" }>> = {
  hoodie: { sleeves: "long", bottom: "pants" },
  tee: { sleeves: "short", bottom: "pants" },
  jacket: { sleeves: "long", bottom: "pants" },
  dress: { sleeves: "short", bottom: "skirt" },
  suit: { sleeves: "long", bottom: "pants" },
  sweater: { sleeves: "long", bottom: "pants" },
  uniform: { sleeves: "short", bottom: "pants" },
  apron: { sleeves: "short", bottom: "long" },
  coat: { sleeves: "long", bottom: "long" },
  sportswear: { sleeves: "short", bottom: "pants" },
  cardigan: { sleeves: "long", bottom: "pants" },
  overalls: { sleeves: "sleeveless", bottom: "pants" },
};

export const STUDIO_CHARACTER_OUTFIT_PARTS: readonly StudioCharacterOutfitPart[] = Object.freeze(
  STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS.map((option): StudioCharacterOutfitPart => {
    const meta = OUTFIT_META[option.key];
    return Object.freeze({
      kind: "outfit",
      key: option.key,
      labelKo: option.labelKo,
      labelEn: option.labelEn,
      style: option.key,
      sleeves: meta.sleeves,
      bottom: meta.bottom,
    });
  }),
);

/** 액세서리 파츠 10종. */
export interface StudioCharacterAccessoryPart extends StudioCharacterPartBase {
  readonly kind: "accessory";
  readonly accessory: StudioVirtualAvatarAccessory;
  /** 머리 위·얼굴 중 어디에 붙는지. */
  readonly slot: "head" | "face";
  /** 함께 쓰면 가려지거나 어색한 헤어스타일. */
  readonly conflictsWithHair: readonly StudioVirtualAvatarHairStyle[];
}

const ACCESSORY_META: Readonly<Record<StudioVirtualAvatarAccessory, { readonly slot: "head" | "face"; readonly conflictsWithHair: readonly StudioVirtualAvatarHairStyle[] }>> = {
  none: { slot: "head", conflictsWithHair: [] },
  beret: { slot: "head", conflictsWithHair: ["bun", "mohawk"] },
  bow: { slot: "head", conflictsWithHair: [] },
  cat: { slot: "head", conflictsWithHair: ["bun", "mohawk"] },
  headphones: { slot: "head", conflictsWithHair: ["twin", "pigtails"] },
  leaf: { slot: "head", conflictsWithHair: [] },
  star: { slot: "head", conflictsWithHair: [] },
  glasses: { slot: "face", conflictsWithHair: [] },
  cap: { slot: "head", conflictsWithHair: ["twin", "pigtails", "bun", "mohawk"] },
  headband: { slot: "head", conflictsWithHair: [] },
};

export const STUDIO_CHARACTER_ACCESSORY_PARTS: readonly StudioCharacterAccessoryPart[] = Object.freeze(
  STUDIO_AVATAR_ACCESSORY_OPTIONS.map((option): StudioCharacterAccessoryPart => {
    const meta = ACCESSORY_META[option.key];
    return Object.freeze({
      kind: "accessory",
      key: option.key,
      labelKo: option.labelKo,
      labelEn: option.labelEn,
      accessory: option.key,
      slot: meta.slot,
      conflictsWithHair: meta.conflictsWithHair,
    });
  }),
);

/** 스킨톤 파츠 8종 (색상 값 포함). */
export interface StudioCharacterSkinPart extends StudioCharacterPartBase {
  readonly kind: "skin";
  readonly color: string;
}

export const STUDIO_CHARACTER_SKIN_PARTS: readonly StudioCharacterSkinPart[] = Object.freeze(
  STUDIO_AVATAR_SKIN_OPTIONS.map((option: StudioAvatarColorOption): StudioCharacterSkinPart => Object.freeze({
    kind: "skin",
    key: option.value,
    labelKo: option.labelKo,
    labelEn: option.labelEn,
    color: option.value,
  })),
);

export function studioCharacterHairPart(style: StudioVirtualAvatarHairStyle): StudioCharacterHairPart | null {
  return STUDIO_CHARACTER_HAIR_PARTS.find((part) => part.style === style) ?? null;
}

export function studioCharacterOutfitPart(style: StudioVirtualAvatarOutfitStyle): StudioCharacterOutfitPart | null {
  return STUDIO_CHARACTER_OUTFIT_PARTS.find((part) => part.style === style) ?? null;
}

export function studioCharacterAccessoryPart(accessory: StudioVirtualAvatarAccessory): StudioCharacterAccessoryPart | null {
  return STUDIO_CHARACTER_ACCESSORY_PARTS.find((part) => part.accessory === accessory) ?? null;
}

export function studioCharacterSkinPart(color: string): StudioCharacterSkinPart | null {
  return STUDIO_CHARACTER_SKIN_PARTS.find((part) => part.color === color) ?? null;
}

/** 액세서리·헤어 충돌을 해소한다 (충돌 시 액세서리를 제거). */
export function resolveStudioCharacterPartConflicts(parts: ProceduralCharacterParts): ProceduralCharacterParts {
  const accessory = studioCharacterAccessoryPart(parts.accessory);
  if (accessory && accessory.conflictsWithHair.includes(parts.hairStyle)) {
    return Object.freeze({ ...parts, accessory: "none" });
  }
  return parts;
}

/* ---------------- 프리셋 ---------------- */

/** 역할별 완성형 파츠 조합. NPC 변형·커스터마이저 프리셋 버튼이 공유한다. */
export interface StudioCharacterPartPreset {
  readonly key: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hairStyle: StudioVirtualAvatarHairStyle;
  readonly outfitStyle: StudioVirtualAvatarOutfitStyle;
  readonly accessory: StudioVirtualAvatarAccessory;
  readonly skin: string;
  readonly hair: string;
  readonly hairHighlight: string;
  readonly outfit: string;
  readonly accent: string;
}

function preset(def: StudioCharacterPartPreset): StudioCharacterPartPreset {
  return Object.freeze(def);
}

export const STUDIO_CHARACTER_PART_PRESETS: readonly StudioCharacterPartPreset[] = Object.freeze([
  preset({ key: "guide", labelKo: "안내원 룩", labelEn: "Guide look",
    hairStyle: "short", outfitStyle: "cardigan", accessory: "none",
    skin: "oklch(0.91 0.055 55)", hair: "oklch(0.31 0.055 25)", hairHighlight: "oklch(0.56 0.12 25)",
    outfit: "oklch(0.68 0.17 235)", accent: "oklch(0.86 0.16 85)" }),
  preset({ key: "barista", labelKo: "바리스타 룩", labelEn: "Barista look",
    hairStyle: "bun", outfitStyle: "apron", accessory: "headband",
    skin: "oklch(0.86 0.07 48)", hair: "oklch(0.55 0.16 30)", hairHighlight: "oklch(0.75 0.14 40)",
    outfit: "oklch(0.76 0.17 85)", accent: "oklch(0.72 0.18 25)" }),
  preset({ key: "guard", labelKo: "경비원 룩", labelEn: "Guard look",
    hairStyle: "crop", outfitStyle: "uniform", accessory: "cap",
    skin: "oklch(0.68 0.075 50)", hair: "oklch(0.31 0.055 25)", hairHighlight: "oklch(0.56 0.12 25)",
    outfit: "oklch(0.6 0.16 20)", accent: "oklch(0.86 0.16 85)" }),
  preset({ key: "cleaner", labelKo: "정리 도우미 룩", labelEn: "Helper look",
    hairStyle: "pigtails", outfitStyle: "overalls", accessory: "star",
    skin: "oklch(0.78 0.08 52)", hair: "oklch(0.77 0.12 95)", hairHighlight: "oklch(0.9 0.11 95)",
    outfit: "oklch(0.68 0.17 235)", accent: "oklch(0.82 0.17 145)" }),
  preset({ key: "mentor", labelKo: "멘토 룩", labelEn: "Mentor look",
    hairStyle: "bob", outfitStyle: "suit", accessory: "glasses",
    skin: "oklch(0.95 0.04 70)", hair: "oklch(0.8 0.03 250)", hairHighlight: "oklch(0.92 0.02 250)",
    outfit: "oklch(0.63 0.2 300)", accent: "oklch(0.78 0.17 250)" }),
  preset({ key: "visitor", labelKo: "방문객 룩", labelEn: "Visitor look",
    hairStyle: "long", outfitStyle: "coat", accessory: "none",
    skin: "oklch(0.82 0.09 35)", hair: "oklch(0.36 0.07 300)", hairHighlight: "oklch(0.58 0.13 300)",
    outfit: "oklch(0.72 0.16 155)", accent: "oklch(0.72 0.18 295)" }),
  preset({ key: "shopkeeper", labelKo: "상점주인 룩", labelEn: "Shopkeeper look",
    hairStyle: "wave", outfitStyle: "sweater", accessory: "glasses",
    skin: "oklch(0.86 0.07 48)", hair: "oklch(0.31 0.055 25)", hairHighlight: "oklch(0.56 0.12 25)",
    outfit: "oklch(0.68 0.18 355)", accent: "oklch(0.86 0.16 85)" }),
]);

export function studioCharacterPartPreset(key: string): StudioCharacterPartPreset | null {
  return STUDIO_CHARACTER_PART_PRESETS.find((item) => item.key === key) ?? null;
}

export function studioCharacterPresetPalette(preset: StudioCharacterPartPreset): ProceduralCharacterPalette {
  return Object.freeze({
    skin: preset.skin,
    hair: preset.hair,
    hairHighlight: preset.hairHighlight,
    outfit: preset.outfit,
    accent: preset.accent,
  });
}

export function studioCharacterPresetParts(preset: StudioCharacterPartPreset): ProceduralCharacterParts {
  return resolveStudioCharacterPartConflicts(Object.freeze({
    hairStyle: preset.hairStyle,
    outfitStyle: preset.outfitStyle,
    accessory: preset.accessory,
  }));
}

/** 주사위 버튼용 랜덤 조합 (파츠 충돌은 자동 해소). */
export function randomStudioCharacterParts(random: () => number = Math.random): {
  readonly palette: ProceduralCharacterPalette;
  readonly parts: ProceduralCharacterParts;
} {
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error("캐릭터 파츠 카탈로그가 비어 있습니다.");
    return item;
  };
  const hair = pick(STUDIO_AVATAR_HAIR_COLOR_OPTIONS);
  const palette: ProceduralCharacterPalette = Object.freeze({
    skin: pick(STUDIO_CHARACTER_SKIN_PARTS).color,
    hair: hair.value,
    hairHighlight: hair.highlight,
    outfit: pick(STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS).value,
    accent: pick(STUDIO_AVATAR_ACCENT_OPTIONS).value,
  });
  const parts: ProceduralCharacterParts = resolveStudioCharacterPartConflicts(Object.freeze({
    hairStyle: pick(STUDIO_CHARACTER_HAIR_PARTS).style,
    outfitStyle: pick(STUDIO_CHARACTER_OUTFIT_PARTS).style,
    accessory: pick(STUDIO_CHARACTER_ACCESSORY_PARTS).accessory,
  }));
  return { palette, parts };
}
