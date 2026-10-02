/**
 * 체형·얼굴 파라미터 키. 값 범위는 [-1, 1], 기본 0(morph 가중치로 ± 분리된다).
 */
export const BODY_PARAM_KEYS = [
  "height",
  "shoulderWidth",
  "chestDepth",
  "waist",
  "hip",
  "armLength",
  "legLength",
  "headSize",
  "neckLength",
] as const;

export const FACE_PARAM_KEYS = [
  "faceShape",
  "jawWidth",
  "chinLength",
  "cheekVolume",
  "forehead",
  "eyeSize",
  "eyeSpacing",
  "eyeTilt",
  "noseHeight",
  "noseWidth",
  "noseDepth",
  "mouthWidth",
  "lipFullness",
  "earSize",
  "earAngle",
] as const;

export type BodyParamKey = (typeof BODY_PARAM_KEYS)[number];
export type FaceParamKey = (typeof FACE_PARAM_KEYS)[number];
export type ParamKey = BodyParamKey | FaceParamKey;

/** 파라미터 값 맵. 없는 키는 0으로 해석한다. */
export type ParamValues<K extends string> = Partial<Record<K, number>>;

export const PARAM_MIN = -1;
export const PARAM_MAX = 1;

export const BODY_PARAM_LABELS_KO: Readonly<Record<BodyParamKey, string>> = {
  height: "키",
  shoulderWidth: "어깨 너비",
  chestDepth: "가슴 두께",
  waist: "허리",
  hip: "엉덩이",
  armLength: "팔 길이",
  legLength: "다리 길이",
  headSize: "머리 크기",
  neckLength: "목 길이",
};

export const FACE_PARAM_LABELS_KO: Readonly<Record<FaceParamKey, string>> = {
  faceShape: "얼굴 윤곽",
  jawWidth: "턱 너비",
  chinLength: "턱 길이",
  cheekVolume: "볼 볼륨",
  forehead: "이마",
  eyeSize: "눈 크기",
  eyeSpacing: "눈 간격",
  eyeTilt: "눈 기울기",
  noseHeight: "코 높이",
  noseWidth: "코 너비",
  noseDepth: "코 깊이",
  mouthWidth: "입 너비",
  lipFullness: "입술 두께",
  earSize: "귀 크기",
  earAngle: "귀 각도",
};

/** [-1, 1]로 클램프. NaN은 0으로 바꾼다(무음 전파 금지). */
export function clampParam(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(PARAM_MAX, Math.max(PARAM_MIN, value));
}

const BODY_KEY_SET: ReadonlySet<string> = new Set(BODY_PARAM_KEYS);
const FACE_KEY_SET: ReadonlySet<string> = new Set(FACE_PARAM_KEYS);

export function isBodyParamKey(value: string): value is BodyParamKey {
  return BODY_KEY_SET.has(value);
}

export function isFaceParamKey(value: string): value is FaceParamKey {
  return FACE_KEY_SET.has(value);
}

export function isParamKey(value: string): value is ParamKey {
  return BODY_KEY_SET.has(value) || FACE_KEY_SET.has(value);
}

/** 파라미터 값 맵을 클램프하고 0인 항목을 제거해 정규형으로 만든다. */
export function normalizeParamValues<K extends string>(values: ParamValues<K>): ParamValues<K> {
  const result: Partial<Record<K, number>> = {};
  for (const key of Object.keys(values) as K[]) {
    const raw = values[key];
    if (raw === undefined) continue;
    const clamped = clampParam(raw);
    if (clamped !== 0) result[key] = clamped;
  }
  return result;
}
