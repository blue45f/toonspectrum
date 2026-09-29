import type {
  StudioVirtualAvatarAccessory,
  StudioVirtualAvatarHairStyle,
  StudioVirtualAvatarOutfitStyle,
} from "./studio-virtual-space-model";

/**
 * 아바타 꾸미기 옵션 카탈로그
 *
 * `studioVirtualAvatarProfile()`의 해시 기반 기본값과 호환되도록 기존 색상 값을
 * 그대로 유지하고, 뒤에 새 옵션을 추가한다. 기존 사용자의 기본 아바타가 바뀌지 않는다.
 */

/** 색상 옵션 (미리보기 스와치용). */
export interface StudioAvatarColorOption {
  readonly value: string;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 피부색 8종. 앞의 4개는 기존 해시 풀과 동일하다. */
export const STUDIO_AVATAR_SKIN_OPTIONS: readonly StudioAvatarColorOption[] = [
  { value: "oklch(0.91 0.055 55)", labelKo: "밝은 살구", labelEn: "Light peach" },
  { value: "oklch(0.86 0.07 48)", labelKo: "살구", labelEn: "Peach" },
  { value: "oklch(0.78 0.08 52)", labelKo: "따뜻한 베이지", labelEn: "Warm beige" },
  { value: "oklch(0.68 0.075 50)", labelKo: "브론즈", labelEn: "Bronze" },
  { value: "oklch(0.95 0.04 70)", labelKo: "포슬린", labelEn: "Porcelain" },
  { value: "oklch(0.82 0.09 35)", labelKo: "허니", labelEn: "Honey" },
  { value: "oklch(0.6 0.07 45)", labelKo: "딥 브론즈", labelEn: "Deep bronze" },
  { value: "oklch(0.52 0.065 40)", labelKo: "에스프레소", labelEn: "Espresso" },
];

/** 헤어 색상 옵션 (하이라이트 포함). 앞의 6개는 기존 해시 풀과 동일하다. */
export interface StudioAvatarHairColorOption extends StudioAvatarColorOption {
  readonly highlight: string;
}

export const STUDIO_AVATAR_HAIR_COLOR_OPTIONS: readonly StudioAvatarHairColorOption[] = [
  { value: "oklch(0.31 0.055 25)", highlight: "oklch(0.56 0.12 25)", labelKo: "다크 브라운", labelEn: "Dark brown" },
  { value: "oklch(0.36 0.07 300)", highlight: "oklch(0.58 0.13 300)", labelKo: "미드나잇 퍼플", labelEn: "Midnight purple" },
  { value: "oklch(0.72 0.1 335)", highlight: "oklch(0.86 0.1 340)", labelKo: "핑크", labelEn: "Pink" },
  { value: "oklch(0.72 0.11 235)", highlight: "oklch(0.86 0.1 235)", labelKo: "스카이 블루", labelEn: "Sky blue" },
  { value: "oklch(0.77 0.12 95)", highlight: "oklch(0.9 0.11 95)", labelKo: "블론드", labelEn: "Blond" },
  { value: "oklch(0.58 0.12 155)", highlight: "oklch(0.77 0.12 155)", labelKo: "민트", labelEn: "Mint" },
  { value: "oklch(0.55 0.16 30)", highlight: "oklch(0.75 0.14 40)", labelKo: "레드", labelEn: "Red" },
  { value: "oklch(0.8 0.03 250)", highlight: "oklch(0.92 0.02 250)", labelKo: "실버", labelEn: "Silver" },
];

/** 의상 색상 6종 (기존 해시 풀과 동일). */
export const STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS: readonly StudioAvatarColorOption[] = [
  { value: "oklch(0.63 0.2 300)", labelKo: "바이올렛", labelEn: "Violet" },
  { value: "oklch(0.68 0.18 355)", labelKo: "로즈", labelEn: "Rose" },
  { value: "oklch(0.68 0.17 235)", labelKo: "코발트", labelEn: "Cobalt" },
  { value: "oklch(0.72 0.16 155)", labelKo: "포레스트", labelEn: "Forest" },
  { value: "oklch(0.76 0.17 85)", labelKo: "머스타드", labelEn: "Mustard" },
  { value: "oklch(0.6 0.16 20)", labelKo: "브릭", labelEn: "Brick" },
];

/** 포인트 색상 6종 (기존 해시 풀과 동일). */
export const STUDIO_AVATAR_ACCENT_OPTIONS: readonly StudioAvatarColorOption[] = [
  { value: "oklch(0.78 0.19 335)", labelKo: "핫핑크", labelEn: "Hot pink" },
  { value: "oklch(0.78 0.17 250)", labelKo: "페리윙클", labelEn: "Periwinkle" },
  { value: "oklch(0.82 0.17 145)", labelKo: "라임", labelEn: "Lime" },
  { value: "oklch(0.86 0.16 85)", labelKo: "레몬", labelEn: "Lemon" },
  { value: "oklch(0.72 0.18 25)", labelKo: "코럴", labelEn: "Coral" },
  { value: "oklch(0.72 0.18 295)", labelKo: "그레이프", labelEn: "Grape" },
];

/** 키 + 라벨 옵션. */
export interface StudioAvatarKeyOption<TKey extends string> {
  readonly key: TKey;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 헤어스타일 12종. */
export const STUDIO_AVATAR_HAIR_STYLE_OPTIONS: readonly StudioAvatarKeyOption<StudioVirtualAvatarHairStyle>[] = [
  { key: "bob", labelKo: "단발", labelEn: "Bob" },
  { key: "long", labelKo: "긴 머리", labelEn: "Long" },
  { key: "short", labelKo: "짧은 머리", labelEn: "Short" },
  { key: "twin", labelKo: "트윈테일", labelEn: "Twin tails" },
  { key: "wave", labelKo: "웨이브", labelEn: "Wavy" },
  { key: "crop", labelKo: "크롭", labelEn: "Crop" },
  { key: "ponytail", labelKo: "포니테일", labelEn: "Ponytail" },
  { key: "bun", labelKo: "번", labelEn: "Bun" },
  { key: "curly", labelKo: "곱슬", labelEn: "Curly" },
  { key: "braid", labelKo: "브레이드", labelEn: "Braid" },
  { key: "pigtails", labelKo: "양갈래", labelEn: "Pigtails" },
  { key: "mohawk", labelKo: "모히칸", labelEn: "Mohawk" },
];

/** 의상 스타일 12종. */
export const STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS: readonly StudioAvatarKeyOption<StudioVirtualAvatarOutfitStyle>[] = [
  { key: "hoodie", labelKo: "후드티", labelEn: "Hoodie" },
  { key: "tee", labelKo: "티셔츠", labelEn: "T-shirt" },
  { key: "jacket", labelKo: "재킷", labelEn: "Jacket" },
  { key: "dress", labelKo: "드레스", labelEn: "Dress" },
  { key: "suit", labelKo: "수트", labelEn: "Suit" },
  { key: "sweater", labelKo: "스웨터", labelEn: "Sweater" },
  { key: "uniform", labelKo: "유니폼", labelEn: "Uniform" },
  { key: "apron", labelKo: "앞치마", labelEn: "Apron" },
  { key: "coat", labelKo: "코트", labelEn: "Coat" },
  { key: "sportswear", labelKo: "스포츠웨어", labelEn: "Sportswear" },
  { key: "cardigan", labelKo: "가디건", labelEn: "Cardigan" },
  { key: "overalls", labelKo: "멜빵바지", labelEn: "Overalls" },
];

/** 액세서리 10종. */
export const STUDIO_AVATAR_ACCESSORY_OPTIONS: readonly StudioAvatarKeyOption<StudioVirtualAvatarAccessory>[] = [
  { key: "none", labelKo: "없음", labelEn: "None" },
  { key: "beret", labelKo: "베레모", labelEn: "Beret" },
  { key: "bow", labelKo: "리본", labelEn: "Bow" },
  { key: "cat", labelKo: "고양이 귀", labelEn: "Cat ears" },
  { key: "headphones", labelKo: "헤드폰", labelEn: "Headphones" },
  { key: "leaf", labelKo: "잎사귀", labelEn: "Leaf" },
  { key: "star", labelKo: "별 핀", labelEn: "Star pin" },
  { key: "glasses", labelKo: "안경", labelEn: "Glasses" },
  { key: "cap", labelKo: "캡모자", labelEn: "Cap" },
  { key: "headband", labelKo: "헤어밴드", labelEn: "Headband" },
];

/** 표정 4종. */
export type StudioAvatarExpression = "bright" | "calm" | "sparkle" | "smile";

export const STUDIO_AVATAR_EXPRESSION_OPTIONS: readonly StudioAvatarKeyOption<StudioAvatarExpression>[] = [
  { key: "bright", labelKo: "밝음", labelEn: "Bright" },
  { key: "calm", labelKo: "차분", labelEn: "Calm" },
  { key: "sparkle", labelKo: "반짝", labelEn: "Sparkle" },
  { key: "smile", labelKo: "미소", labelEn: "Smile" },
];
