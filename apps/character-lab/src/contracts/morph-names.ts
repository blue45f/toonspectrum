/**
 * morph target 이름 규약.
 *
 * - 파라미터: `param:<key>:<+|->` (예: "param:eyeSize:+")
 * - 표정:     `facs:<unit>`        (예: "facs:jawOpen")
 *
 * 절차적 모델(humanoid)과 제작 패키지(authored, Blender shape key 별칭)가 같은 이름으로
 * 엔진에 바인딩되므로 플래너는 소스 종류를 몰라도 된다.
 */
import { FACS_UNITS, isFacsUnit, type FacsUnit } from "./expression";
import { isParamKey, type BodyParamKey, type FaceParamKey, type ParamKey, type ParamValues } from "./params";

export type MorphSign = "+" | "-";

export type ParamMorphTargetName = `param:${BodyParamKey | FaceParamKey}:${MorphSign}`;
export type FacsMorphTargetName = `facs:${FacsUnit}`;
export type MorphTargetName = ParamMorphTargetName | FacsMorphTargetName;

export type ParsedMorphTargetName =
  | { readonly kind: "param"; readonly key: ParamKey; readonly sign: MorphSign }
  | { readonly kind: "facs"; readonly unit: FacsUnit };

export function paramMorphName(key: ParamKey, sign: MorphSign): ParamMorphTargetName {
  return `param:${key}:${sign}`;
}

export function facsMorphName(unit: FacsUnit): FacsMorphTargetName {
  return `facs:${unit}`;
}

/** 규약에 맞지 않으면 null(예외 대신 호출자가 skipped 목록에 기록한다). */
export function parseMorphTargetName(name: string): ParsedMorphTargetName | null {
  const parts = name.split(":");
  if (parts[0] === "param" && parts.length === 3) {
    const key = parts[1] ?? "";
    const sign = parts[2];
    if (!isParamKey(key)) return null;
    if (sign !== "+" && sign !== "-") return null;
    return { kind: "param", key, sign };
  }
  if (parts[0] === "facs" && parts.length === 2) {
    const unit = parts[1] ?? "";
    if (!isFacsUnit(unit)) return null;
    return { kind: "facs", unit };
  }
  return null;
}

export function isMorphTargetName(name: string): name is MorphTargetName {
  return parseMorphTargetName(name) !== null;
}

/**
 * 파라미터 값(−1..1)을 ± morph 가중치로 분리한다. v>0 → "+":v, v<0 → "-":−v, 0은 생략.
 */
export function paramToMorphWeights(values: ParamValues<ParamKey>): Record<MorphTargetName, number> {
  const result: Partial<Record<MorphTargetName, number>> = {};
  for (const key of Object.keys(values) as ParamKey[]) {
    if (!isParamKey(key)) continue;
    const value = values[key];
    if (value === undefined || Number.isNaN(value) || value === 0) continue;
    const clamped = Math.min(1, Math.max(-1, value));
    if (clamped > 0) result[paramMorphName(key, "+")] = clamped;
    else result[paramMorphName(key, "-")] = -clamped;
  }
  return result as Record<MorphTargetName, number>;
}

/** 표정 가중치(0..1)를 FACS morph 가중치로 바꾼다. */
export function expressionToMorphWeights(weights: Partial<Record<FacsUnit, number>>): Record<MorphTargetName, number> {
  const result: Partial<Record<MorphTargetName, number>> = {};
  for (const unit of FACS_UNITS) {
    const value = weights[unit];
    if (value === undefined || Number.isNaN(value) || value <= 0) continue;
    result[facsMorphName(unit)] = Math.min(1, value);
  }
  return result as Record<MorphTargetName, number>;
}

/** 모든 파라미터 morph 이름(키 × ±)과 FACS 이름을 결정적 순서로 나열 */
export function allParamMorphNames(keys: readonly ParamKey[]): readonly ParamMorphTargetName[] {
  const names: ParamMorphTargetName[] = [];
  for (const key of keys) {
    names.push(paramMorphName(key, "+"), paramMorphName(key, "-"));
  }
  return names;
}

export const ALL_FACS_MORPH_NAMES: readonly FacsMorphTargetName[] = FACS_UNITS.map((unit) => facsMorphName(unit));

/**
 * Blender kit `face.py` `_shape_specs`가 만드는 shape key 24종(실측)의 별칭.
 * 키 이름은 Blender 산출물 그대로이며, 값은 우리 파라미터 morph 규약이다.
 */
export const BLENDER_SHAPE_KEY_ALIASES: Readonly<Record<string, { readonly key: FaceParamKey; readonly sign: MorphSign }>> = {
  faceEyeSizeBig: { key: "eyeSize", sign: "+" },
  faceEyeSizeSmall: { key: "eyeSize", sign: "-" },
  faceEyeSpacingWide: { key: "eyeSpacing", sign: "+" },
  faceEyeSpacingNarrow: { key: "eyeSpacing", sign: "-" },
  faceEyeTiltUp: { key: "eyeTilt", sign: "+" },
  faceEyeTiltDown: { key: "eyeTilt", sign: "-" },
  faceNoseHeightHigh: { key: "noseHeight", sign: "+" },
  faceNoseHeightLow: { key: "noseHeight", sign: "-" },
  faceNoseWidthWide: { key: "noseWidth", sign: "+" },
  faceNoseWidthNarrow: { key: "noseWidth", sign: "-" },
  faceNoseDepthHigh: { key: "noseDepth", sign: "+" },
  faceNoseDepthLow: { key: "noseDepth", sign: "-" },
  faceMouthWidthWide: { key: "mouthWidth", sign: "+" },
  faceMouthWidthNarrow: { key: "mouthWidth", sign: "-" },
  faceLipFullnessHigh: { key: "lipFullness", sign: "+" },
  faceLipFullnessLow: { key: "lipFullness", sign: "-" },
  faceJawWidthWide: { key: "jawWidth", sign: "+" },
  faceJawWidthNarrow: { key: "jawWidth", sign: "-" },
  faceChinLengthLong: { key: "chinLength", sign: "+" },
  faceChinLengthShort: { key: "chinLength", sign: "-" },
  faceCheekVolumeHigh: { key: "cheekVolume", sign: "+" },
  faceCheekVolumeLow: { key: "cheekVolume", sign: "-" },
  faceEarSizeBig: { key: "earSize", sign: "+" },
  faceEarSizeSmall: { key: "earSize", sign: "-" },
};

/**
 * VRM 1.0 프리셋 표정·ARKit 블렌드셰이프에서 흔한 이름 → FACS 유닛 별칭.
 * 제작 패키지의 `vrmCustomExpressions.names`·shape key 매핑에 쓴다.
 */
export const FACS_SHAPE_KEY_ALIASES: Readonly<Record<string, FacsUnit>> = {
  // ARKit 52 중 우리 16 유닛과 대응하는 것
  browInnerUp: "browInnerUp",
  browOuterUpLeft: "browOuterUp",
  browOuterUpRight: "browOuterUp",
  browDownLeft: "browDown",
  browDownRight: "browDown",
  eyeBlinkLeft: "eyeBlinkLeft",
  eyeBlinkRight: "eyeBlinkRight",
  eyeWideLeft: "eyeWide",
  eyeWideRight: "eyeWide",
  eyeSquintLeft: "eyeSquint",
  eyeSquintRight: "eyeSquint",
  cheekPuff: "cheekPuff",
  noseSneerLeft: "noseSneer",
  noseSneerRight: "noseSneer",
  jawOpen: "jawOpen",
  mouthSmileLeft: "mouthSmile",
  mouthSmileRight: "mouthSmile",
  mouthFrownLeft: "mouthFrown",
  mouthFrownRight: "mouthFrown",
  mouthPucker: "mouthPucker",
  mouthFunnel: "mouthFunnel",
  mouthPressLeft: "mouthPress",
  mouthPressRight: "mouthPress",
  tongueOut: "tongueOut",
  // VRM 1.0 프리셋 표정 이름
  aa: "jawOpen",
  blink: "eyeBlinkLeft",
  blinkLeft: "eyeBlinkLeft",
  blinkRight: "eyeBlinkRight",
  happy: "mouthSmile",
  sad: "mouthFrown",
  angry: "browDown",
  surprised: "eyeWide",
};
