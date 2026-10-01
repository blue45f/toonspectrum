/**
 * 12개 외형 슬롯 × `SLOT_PRESET_IDS` 전부의 PresetEntry(64개). 어휘는 contracts/preset-vocabulary에 동결되어 있다.
 *
 * - 모든 프리셋은 자체 제작물(license: "original")이다. 경쟁 제품의 프리셋·에셋을 복제하지 않는다.
 * - 파라미터 프리셋(얼굴형·눈·코·입·귀·체형)은 자신이 다루는 키를 전부 적는다(0 포함). 같은 슬롯의 다른
 *   프리셋으로 바꾸면 reducer가 그 키들을 덮어쓰므로 이전 프리셋의 잔여 값이 남지 않는다.
 * - 파츠 프리셋(눈·눈동자·헤어·상의·하의·신발·액세서리)은 `parts`에 어휘 이름을 넣는다. 의상·신발·액세서리는
 *   기본 색도 함께 넣어 카드만 눌러도 외형이 바로 달라지게 한다(사용자 색 변경은 이후 color/set으로).
 * - `requires`는 patch가 실제로 쓰는 ± morph 이름에서 결정적으로 유도한다(`requiresForPatch`).
 */
import { DEFAULT_FRAMING, FACE_FRAMING, SLOT_PRESET_IDS, makePresetId, paramMorphName } from "../contracts";

import type { CameraFraming, ParamKey, PresetEntry, PresetId, RecipePatch, SlotKind } from "../contracts";

export const APPEARANCE_PRESET_COUNT = 64;

/** patch의 0이 아닌 파라미터에서 `morph:param:<key>:<±>` 요구를 유도한다(키 순서 고정). */
export function requiresForPatch(patch: RecipePatch): readonly string[] {
  const requires: string[] = [];
  const params: Array<[string, number | undefined]> = [...Object.entries(patch.body ?? {}), ...Object.entries(patch.face ?? {})];
  for (const [key, value] of params) {
    if (value === undefined || value === 0) continue;
    requires.push(`morph:${paramMorphName(key as ParamKey, value > 0 ? "+" : "-")}`);
  }
  return requires;
}

const FACE_CLOSE: CameraFraming = Object.freeze({ mode: "face", yawDeg: 0, pitchDeg: 0, distanceScale: 0.8 });
const FACE_EYES: CameraFraming = Object.freeze({ mode: "face", yawDeg: 0, pitchDeg: 0, distanceScale: 0.6 });
const FACE_PROFILE: CameraFraming = Object.freeze({ mode: "face", yawDeg: 35, pitchDeg: 0, distanceScale: 1 });
const FACE_SIDE: CameraFraming = Object.freeze({ mode: "face", yawDeg: 70, pitchDeg: 0, distanceScale: 1 });
const BUST_TURN: CameraFraming = Object.freeze({ mode: "bust", yawDeg: 20, pitchDeg: 0, distanceScale: 1 });
const BUST_WIDE: CameraFraming = Object.freeze({ mode: "bust", yawDeg: 0, pitchDeg: 0, distanceScale: 1.2 });
const BUST_NECK: CameraFraming = Object.freeze({ mode: "bust", yawDeg: 0, pitchDeg: 0, distanceScale: 0.8 });
const BODY_LOWER: CameraFraming = Object.freeze({ mode: "full-body", yawDeg: 0, pitchDeg: -10, distanceScale: 1 });
const BODY_FEET: CameraFraming = Object.freeze({ mode: "full-body", yawDeg: 25, pitchDeg: -35, distanceScale: 0.6 });

type SlotName<S extends SlotKind> = (typeof SLOT_PRESET_IDS)[S][number];

interface Draft {
  readonly labelKo: string;
  readonly patch: RecipePatch;
  readonly framing: CameraFraming;
  readonly conflictsWith?: readonly PresetId[];
}

function build<S extends SlotKind>(slot: S, drafts: Readonly<Record<SlotName<S>, Draft>>): PresetEntry[] {
  const names: readonly SlotName<S>[] = SLOT_PRESET_IDS[slot] as readonly SlotName<S>[];
  return names.map((name) => {
    const draft = drafts[name];
    return {
      id: makePresetId(slot, name),
      slot,
      labelKo: draft.labelKo,
      patch: draft.patch,
      requires: requiresForPatch(draft.patch),
      conflictsWith: draft.conflictsWith ?? [],
      thumbnailFraming: draft.framing,
      license: "original",
    };
  });
}

export const FACE_SHAPE_PRESETS: readonly PresetEntry[] = build("face-shape", {
  oval: { labelKo: "계란형", framing: FACE_FRAMING, patch: { face: { faceShape: 0, jawWidth: 0, chinLength: 0, cheekVolume: 0, forehead: 0 } } },
  round: { labelKo: "둥근형", framing: FACE_FRAMING, patch: { face: { faceShape: -0.5, jawWidth: 0.35, chinLength: -0.45, cheekVolume: 0.55, forehead: -0.1 } } },
  heart: { labelKo: "하트형", framing: FACE_FRAMING, patch: { face: { faceShape: 0.2, jawWidth: -0.45, chinLength: 0.2, cheekVolume: 0.15, forehead: 0.4 } } },
  square: { labelKo: "각진형", framing: FACE_FRAMING, patch: { face: { faceShape: -0.2, jawWidth: 0.6, chinLength: 0.1, cheekVolume: -0.1, forehead: 0.15 } } },
  long: { labelKo: "긴 얼굴형", framing: FACE_FRAMING, patch: { face: { faceShape: 0.5, jawWidth: -0.25, chinLength: 0.55, cheekVolume: -0.35, forehead: 0.35 } } },
  "v-line": { labelKo: "V라인", framing: FACE_FRAMING, patch: { face: { faceShape: 0.6, jawWidth: -0.6, chinLength: 0.35, cheekVolume: -0.3, forehead: 0.1 } } },
});

export const EYES_PRESETS: readonly PresetEntry[] = build("eyes", {
  almond: { labelKo: "아몬드 눈", framing: FACE_CLOSE, patch: { face: { eyeSize: 0, eyeSpacing: 0, eyeTilt: 0.1 }, parts: { eyes: "almond" } } },
  round: { labelKo: "둥근 눈", framing: FACE_CLOSE, patch: { face: { eyeSize: 0.4, eyeSpacing: 0.1, eyeTilt: 0 }, parts: { eyes: "round" } } },
  droopy: { labelKo: "처진 눈", framing: FACE_CLOSE, patch: { face: { eyeSize: 0.1, eyeSpacing: 0.05, eyeTilt: -0.6 }, parts: { eyes: "droopy" } } },
  upturned: { labelKo: "올라간 눈", framing: FACE_CLOSE, patch: { face: { eyeSize: -0.05, eyeSpacing: 0, eyeTilt: 0.6 }, parts: { eyes: "upturned" } } },
  narrow: { labelKo: "가는 눈", framing: FACE_CLOSE, patch: { face: { eyeSize: -0.5, eyeSpacing: -0.1, eyeTilt: 0.15 }, parts: { eyes: "narrow" } } },
  wide: { labelKo: "큰 눈", framing: FACE_CLOSE, patch: { face: { eyeSize: 0.3, eyeSpacing: 0.5, eyeTilt: -0.1 }, parts: { eyes: "wide" } } },
});

export const IRISES_PRESETS: readonly PresetEntry[] = build("irises", {
  "round-large": { labelKo: "큰 원형 눈동자", framing: FACE_EYES, patch: { parts: { irises: "round-large" } } },
  "round-small": { labelKo: "작은 원형 눈동자", framing: FACE_EYES, patch: { parts: { irises: "round-small" } } },
  cat: { labelKo: "고양이 눈동자", framing: FACE_EYES, patch: { parts: { irises: "cat" } } },
  "star-highlight": { labelKo: "별 하이라이트 눈동자", framing: FACE_EYES, patch: { parts: { irises: "star-highlight" } } },
  "soft-gradient": { labelKo: "부드러운 그라데이션 눈동자", framing: FACE_EYES, patch: { parts: { irises: "soft-gradient" } } },
});

export const NOSE_PRESETS: readonly PresetEntry[] = build("nose", {
  small: { labelKo: "작은 코", framing: FACE_PROFILE, patch: { face: { noseHeight: -0.4, noseWidth: -0.3, noseDepth: -0.3 } } },
  button: { labelKo: "단추 코", framing: FACE_PROFILE, patch: { face: { noseHeight: -0.2, noseWidth: 0.3, noseDepth: 0.2 } } },
  straight: { labelKo: "곧은 코", framing: FACE_PROFILE, patch: { face: { noseHeight: 0, noseWidth: 0, noseDepth: 0 } } },
  "high-bridge": { labelKo: "높은 콧대", framing: FACE_PROFILE, patch: { face: { noseHeight: 0.6, noseWidth: -0.2, noseDepth: 0.4 } } },
  wide: { labelKo: "넓은 코", framing: FACE_PROFILE, patch: { face: { noseHeight: 0.1, noseWidth: 0.6, noseDepth: 0.1 } } },
});

export const MOUTH_PRESETS: readonly PresetEntry[] = build("mouth", {
  small: { labelKo: "작은 입", framing: FACE_CLOSE, patch: { face: { mouthWidth: -0.5, lipFullness: -0.1 } } },
  wide: { labelKo: "넓은 입", framing: FACE_CLOSE, patch: { face: { mouthWidth: 0.6, lipFullness: 0 } } },
  full: { labelKo: "도톰한 입술", framing: FACE_CLOSE, patch: { face: { mouthWidth: 0.1, lipFullness: 0.65 } } },
  thin: { labelKo: "얇은 입술", framing: FACE_CLOSE, patch: { face: { mouthWidth: 0, lipFullness: -0.6 } } },
  "smile-corner": { labelKo: "입꼬리 미소", framing: FACE_CLOSE, patch: { face: { mouthWidth: 0.3, lipFullness: 0.15 } } },
});

export const EARS_PRESETS: readonly PresetEntry[] = build("ears", {
  standard: { labelKo: "기본 귀", framing: FACE_SIDE, patch: { face: { earSize: 0, earAngle: 0 } } },
  small: { labelKo: "작은 귀", framing: FACE_SIDE, patch: { face: { earSize: -0.5, earAngle: -0.1 } } },
  pointed: { labelKo: "뾰족한 귀", framing: FACE_SIDE, patch: { face: { earSize: 0.35, earAngle: 0.55 } } },
  large: { labelKo: "큰 귀", framing: FACE_SIDE, patch: { face: { earSize: 0.6, earAngle: 0.15 } } },
});

export const HAIR_PRESETS: readonly PresetEntry[] = build("hair", {
  "short-layered": { labelKo: "숏 레이어드", framing: BUST_TURN, patch: { parts: { hair: "short-layered" } } },
  "soft-bob": { labelKo: "소프트 보브", framing: BUST_TURN, patch: { parts: { hair: "soft-bob" } } },
  "romance-long": { labelKo: "로맨스 롱", framing: BUST_TURN, patch: { parts: { hair: "romance-long" } } },
  "action-pony": { labelKo: "액션 포니테일", framing: BUST_TURN, patch: { parts: { hair: "action-pony" } } },
  "hime-cut": { labelKo: "히메컷", framing: BUST_TURN, patch: { parts: { hair: "hime-cut" } }, conflictsWith: ["accessory/cap", "accessory/earrings"] },
  "wolf-layered": { labelKo: "울프 레이어드", framing: BUST_TURN, patch: { parts: { hair: "wolf-layered" } } },
  "twin-tail": { labelKo: "트윈테일", framing: BUST_TURN, patch: { parts: { hair: "twin-tail" } }, conflictsWith: ["accessory/cap", "accessory/headphones"] },
});

export const BODY_PRESETS: readonly PresetEntry[] = build("body", {
  slim: {
    labelKo: "슬림",
    framing: DEFAULT_FRAMING,
    patch: { body: { height: 0.05, shoulderWidth: -0.3, chestDepth: -0.4, waist: -0.5, hip: -0.3, armLength: 0.05, legLength: 0.1, headSize: 0, neckLength: 0.1 } },
  },
  standard: {
    labelKo: "표준",
    framing: DEFAULT_FRAMING,
    patch: { body: { height: 0, shoulderWidth: 0, chestDepth: 0, waist: 0, hip: 0, armLength: 0, legLength: 0, headSize: 0, neckLength: 0 } },
  },
  athletic: {
    labelKo: "운동형",
    framing: DEFAULT_FRAMING,
    patch: { body: { height: 0.1, shoulderWidth: 0.5, chestDepth: 0.3, waist: -0.2, hip: 0, armLength: 0.1, legLength: 0.05, headSize: -0.05, neckLength: 0 } },
  },
  curvy: {
    labelKo: "글래머",
    framing: DEFAULT_FRAMING,
    patch: { body: { height: 0, shoulderWidth: -0.1, chestDepth: 0.5, waist: -0.35, hip: 0.6, armLength: 0, legLength: 0, headSize: 0, neckLength: 0 } },
  },
  petite: {
    labelKo: "아담",
    framing: DEFAULT_FRAMING,
    patch: { body: { height: -0.6, shoulderWidth: -0.35, chestDepth: -0.2, waist: -0.2, hip: -0.1, armLength: -0.2, legLength: -0.3, headSize: 0.3, neckLength: -0.2 } },
  },
  tall: {
    labelKo: "장신",
    framing: DEFAULT_FRAMING,
    patch: { body: { height: 0.7, shoulderWidth: 0.15, chestDepth: 0, waist: 0, hip: 0, armLength: 0.3, legLength: 0.5, headSize: -0.2, neckLength: 0.3 } },
  },
});

export const TOP_PRESETS: readonly PresetEntry[] = build("top", {
  tee: { labelKo: "티셔츠", framing: BUST_WIDE, patch: { parts: { top: "tee" }, colors: { top: "#f1f1f4" } } },
  hoodie: { labelKo: "후드티", framing: BUST_WIDE, patch: { parts: { top: "hoodie" }, colors: { top: "#5c6b8a" } }, conflictsWith: ["accessory/headphones"] },
  shirt: { labelKo: "셔츠", framing: BUST_WIDE, patch: { parts: { top: "shirt" }, colors: { top: "#f7f7fb" } } },
  blazer: { labelKo: "블레이저", framing: BUST_WIDE, patch: { parts: { top: "blazer" }, colors: { top: "#2d3447" } } },
  sailor: { labelKo: "세일러복 상의", framing: BUST_WIDE, patch: { parts: { top: "sailor" }, colors: { top: "#f4f6fb" } }, conflictsWith: ["accessory/choker"] },
});

export const BOTTOM_PRESETS: readonly PresetEntry[] = build("bottom", {
  jeans: { labelKo: "청바지", framing: BODY_LOWER, patch: { parts: { bottom: "jeans" }, colors: { bottom: "#3b4a6b" } } },
  shorts: { labelKo: "반바지", framing: BODY_LOWER, patch: { parts: { bottom: "shorts" }, colors: { bottom: "#7d8db0" } } },
  "pleated-skirt": { labelKo: "플리츠 스커트", framing: BODY_LOWER, patch: { parts: { bottom: "pleated-skirt" }, colors: { bottom: "#2f3550" } } },
  "long-skirt": { labelKo: "롱 스커트", framing: BODY_LOWER, patch: { parts: { bottom: "long-skirt" }, colors: { bottom: "#6a4c5a" } } },
  slacks: { labelKo: "슬랙스", framing: BODY_LOWER, patch: { parts: { bottom: "slacks" }, colors: { bottom: "#2b2b33" } } },
});

export const SHOES_PRESETS: readonly PresetEntry[] = build("shoes", {
  sneakers: { labelKo: "스니커즈", framing: BODY_FEET, patch: { parts: { shoes: "sneakers" }, colors: { shoes: "#f5f5f5" } } },
  loafers: { labelKo: "로퍼", framing: BODY_FEET, patch: { parts: { shoes: "loafers" }, colors: { shoes: "#3a2a1e" } } },
  boots: { labelKo: "부츠", framing: BODY_FEET, patch: { parts: { shoes: "boots" }, colors: { shoes: "#2a211c" } } },
  sandals: { labelKo: "샌들", framing: BODY_FEET, patch: { parts: { shoes: "sandals" }, colors: { shoes: "#c9a27a" } } },
});

export const ACCESSORY_PRESETS: readonly PresetEntry[] = build("accessory", {
  glasses: { labelKo: "안경", framing: FACE_CLOSE, patch: { parts: { accessory: "glasses" }, colors: { accessory: "#2a2a2e" } } },
  ribbon: { labelKo: "리본", framing: BUST_TURN, patch: { parts: { accessory: "ribbon" }, colors: { accessory: "#c94f6b" } } },
  cap: { labelKo: "캡 모자", framing: BUST_TURN, patch: { parts: { accessory: "cap" }, colors: { accessory: "#2f3b5c" } }, conflictsWith: ["hair/hime-cut", "hair/twin-tail"] },
  earrings: { labelKo: "귀걸이", framing: FACE_SIDE, patch: { parts: { accessory: "earrings" }, colors: { accessory: "#d8b45a" } }, conflictsWith: ["hair/hime-cut"] },
  choker: { labelKo: "초커", framing: BUST_NECK, patch: { parts: { accessory: "choker" }, colors: { accessory: "#1c1c22" } }, conflictsWith: ["top/sailor"] },
  headphones: { labelKo: "헤드폰", framing: BUST_TURN, patch: { parts: { accessory: "headphones" }, colors: { accessory: "#2b2d33" } }, conflictsWith: ["hair/twin-tail", "top/hoodie"] },
});

/** 12개 외형 슬롯 64개(APPEARANCE_SLOT_KINDS 순서) */
export const APPEARANCE_PRESETS: readonly PresetEntry[] = Object.freeze([
  ...FACE_SHAPE_PRESETS,
  ...EYES_PRESETS,
  ...IRISES_PRESETS,
  ...NOSE_PRESETS,
  ...MOUTH_PRESETS,
  ...EARS_PRESETS,
  ...HAIR_PRESETS,
  ...BODY_PRESETS,
  ...TOP_PRESETS,
  ...BOTTOM_PRESETS,
  ...SHOES_PRESETS,
  ...ACCESSORY_PRESETS,
]);

export function appearancePresetsForSlot(slot: SlotKind): readonly PresetEntry[] {
  return APPEARANCE_PRESETS.filter((entry) => entry.slot === slot);
}
