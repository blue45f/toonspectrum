/**
 * 슬롯별 프리셋 id 어휘(동결).
 *
 * state-presets(데이터)·humanoid/outfit(지오메트리)·animation(포즈)이 같은 키를 쓰도록
 * 여기서 한 번만 정의한다. 헤어 앞 6개는 Blender kit `HairStyle`과 동일하다
 * (tools/blender/toonstudio_blender_kit/contracts.py 실측).
 */
import { CHARACTER_SLOT_KINDS, type PresetId, type SlotKind } from "./slots";

export const SLOT_PRESET_IDS = {
  "face-shape": ["oval", "round", "heart", "square", "long", "v-line"],
  eyes: ["almond", "round", "droopy", "upturned", "narrow", "wide"],
  irises: ["round-large", "round-small", "cat", "star-highlight", "soft-gradient"],
  nose: ["small", "button", "straight", "high-bridge", "wide"],
  mouth: ["small", "wide", "full", "thin", "smile-corner"],
  ears: ["standard", "small", "pointed", "large"],
  hair: ["short-layered", "soft-bob", "romance-long", "action-pony", "hime-cut", "wolf-layered", "twin-tail"],
  body: ["slim", "standard", "athletic", "curvy", "petite", "tall"],
  top: ["tee", "hoodie", "shirt", "blazer", "sailor"],
  bottom: ["jeans", "shorts", "pleated-skirt", "long-skirt", "slacks"],
  shoes: ["sneakers", "loafers", "boots", "sandals"],
  accessory: ["glasses", "ribbon", "cap", "earrings", "choker", "headphones"],
  expression: ["neutral", "joy", "smile", "sad", "angry", "surprised", "wink", "pout", "laugh", "fear", "disgust", "sleepy"],
  pose: ["a-pose", "t-pose", "idle", "wave", "point", "arms-crossed", "hands-on-hips", "peace", "sit", "run"],
  "hand-pose": ["relaxed", "fist", "open", "point", "peace", "thumbs-up", "ok", "rock"],
} as const satisfies Record<SlotKind, readonly string[]>;

export type SlotPresetIds = typeof SLOT_PRESET_IDS;

export type FaceShapeId = SlotPresetIds["face-shape"][number];
export type EyesStyleId = SlotPresetIds["eyes"][number];
export type IrisStyleId = SlotPresetIds["irises"][number];
export type NoseStyleId = SlotPresetIds["nose"][number];
export type MouthStyleId = SlotPresetIds["mouth"][number];
export type EarStyleId = SlotPresetIds["ears"][number];
export type HairStyleId = SlotPresetIds["hair"][number];
export type BodyTypeId = SlotPresetIds["body"][number];
export type TopStyleId = SlotPresetIds["top"][number];
export type BottomStyleId = SlotPresetIds["bottom"][number];
export type ShoesStyleId = SlotPresetIds["shoes"][number];
export type AccessoryStyleId = SlotPresetIds["accessory"][number];
export type ExpressionPresetName = SlotPresetIds["expression"][number];
export type PosePresetName = SlotPresetIds["pose"][number];
export type HandPosePresetName = SlotPresetIds["hand-pose"][number];

/** Blender kit가 제작하는 헤어 스타일(앞 6개). `twin-tail`은 절차 소스 전용. */
export const BLENDER_HAIR_STYLE_IDS: readonly HairStyleId[] = [
  "short-layered",
  "soft-bob",
  "romance-long",
  "action-pony",
  "hime-cut",
  "wolf-layered",
];

/** 슬롯별 최소 프리셋 개수(카탈로그 불변식) */
export const MIN_PRESETS_PER_SLOT: Readonly<Record<SlotKind, number>> = {
  "face-shape": 4,
  eyes: 4,
  irises: 4,
  nose: 4,
  mouth: 4,
  ears: 4,
  hair: 4,
  body: 4,
  top: 4,
  bottom: 4,
  shoes: 4,
  accessory: 4,
  expression: 12,
  pose: 10,
  "hand-pose": 8,
};

/** 어휘에 있는 모든 프리셋 id(`<slot>/<name>`)를 슬롯 순서대로 나열 */
export function allVocabularyPresetIds(): readonly PresetId[] {
  const ids: PresetId[] = [];
  for (const slot of CHARACTER_SLOT_KINDS) {
    for (const name of SLOT_PRESET_IDS[slot]) {
      ids.push(`${slot}/${name}`);
    }
  }
  return ids;
}

/** 프리셋 id가 어휘 안인지 판별 */
export function isVocabularyPresetId(id: PresetId): boolean {
  const slash = id.indexOf("/");
  const slot = id.slice(0, slash) as SlotKind;
  const name = id.slice(slash + 1);
  const names: readonly string[] = SLOT_PRESET_IDS[slot] ?? [];
  return names.includes(name);
}
