/**
 * 패키지 shape key 이름 → 규약 morph 이름(MorphTargetName) 매핑.
 *
 * - Blender kit face.py 24종(`faceEyeSizeBig` …)은 `BLENDER_SHAPE_KEY_ALIASES`로 `param:<key>:<±>`에 대응한다.
 * - ARKit 52·VRM 1.0 프리셋 이름은 `FACS_SHAPE_KEY_ALIASES`로 `facs:<unit>`에 대응한다.
 * - VRM 0.x 프리셋(Blink/Joy/A …)·Blender VRM custom expression 접두 `ts`(`tsFaceEyeSizeBig`)·대소문자 차이는
 *   보조 규칙으로 흡수한다. `<mesh>:<key>` 형식(파이프라인 quality.capabilities 표기)은 mesh 접두를 떼고 판정한다.
 * - 규약 밖 이름은 조용히 넘기지 않고 `unmapped[]`에 한글 사유로 남긴다.
 */
import { BLENDER_SHAPE_KEY_ALIASES, FACE_PARAM_KEYS, FACS_SHAPE_KEY_ALIASES, facsMorphName, isMorphTargetName, paramMorphName, parseMorphTargetName } from "../../contracts";

import type { FaceParamKey, FacsUnit, MorphTargetName } from "../../contracts";

/** VRM 0.x 프리셋·흔한 Blender 표정 키(소문자 비교) → FACS 유닛 보조 별칭 */
const EXTRA_FACS_ALIASES_LOWER: Readonly<Record<string, FacsUnit>> = {
  blink: "eyeBlinkLeft",
  blink_l: "eyeBlinkLeft",
  blink_r: "eyeBlinkRight",
  blinkleft: "eyeBlinkLeft",
  blinkright: "eyeBlinkRight",
  wide: "eyeWide",
  squint: "eyeSquint",
  joy: "mouthSmile",
  fun: "mouthSmile",
  happy: "mouthSmile",
  angry: "browDown",
  sorrow: "mouthFrown",
  sad: "mouthFrown",
  surprised: "eyeWide",
  a: "jawOpen",
  aa: "jawOpen",
  o: "mouthFunnel",
  oh: "mouthFunnel",
  u: "mouthPucker",
  ou: "mouthPucker",
  tongueout: "tongueOut",
  cheekpuff: "cheekPuff",
};

function buildLowerIndex<T>(table: Readonly<Record<string, T>>): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const [key, value] of Object.entries(table)) {
    const lower = key.toLowerCase();
    if (!map.has(lower)) map.set(lower, value);
  }
  return map;
}

const BLENDER_LOWER = buildLowerIndex(BLENDER_SHAPE_KEY_ALIASES);
const FACS_LOWER = buildLowerIndex(FACS_SHAPE_KEY_ALIASES);
const EXTRA_LOWER = buildLowerIndex(EXTRA_FACS_ALIASES_LOWER);

export interface ShapeKeyRef {
  /** `<mesh>:<key>` 형식일 때의 mesh 이름, 아니면 null */
  readonly mesh: string | null;
  readonly key: string;
}

/** `<mesh>:<key>` 표기를 분리한다. 이미 규약 morph 이름(`param:…`, `facs:…`)이면 그대로 key로 본다. */
export function splitShapeKeyName(name: string): ShapeKeyRef {
  if (isMorphTargetName(name)) return { mesh: null, key: name };
  const index = name.indexOf(":");
  if (index <= 0 || index === name.length - 1) return { mesh: null, key: name };
  return { mesh: name.slice(0, index), key: name.slice(index + 1) };
}

/** Blender VRM add-on custom expression 접두 `ts`(`tsFaceEyeSizeBig` → `faceEyeSizeBig`) 제거 */
export function stripTsPrefix(key: string): string {
  const match = /^ts([A-Z])(.*)$/u.exec(key);
  if (!match) return key;
  return `${(match[1] ?? "").toLowerCase()}${match[2] ?? ""}`;
}

/** shape key 이름 하나를 규약 morph 이름으로 해석한다. 규약 밖이면 null. */
export function resolveShapeKeyAlias(rawKey: string): MorphTargetName | null {
  const key = splitShapeKeyName(rawKey).key;
  if (isMorphTargetName(key)) return key;
  const blender = BLENDER_SHAPE_KEY_ALIASES[key];
  if (blender) return paramMorphName(blender.key, blender.sign);
  const facs = FACS_SHAPE_KEY_ALIASES[key];
  if (facs) return facsMorphName(facs);
  const stripped = stripTsPrefix(key);
  if (stripped !== key) {
    const viaStripped = resolveShapeKeyAlias(stripped);
    if (viaStripped) return viaStripped;
  }
  const lower = key.toLowerCase();
  const blenderLower = BLENDER_LOWER.get(lower);
  if (blenderLower) return paramMorphName(blenderLower.key, blenderLower.sign);
  const facsLower = FACS_LOWER.get(lower) ?? EXTRA_LOWER.get(lower);
  if (facsLower) return facsMorphName(facsLower);
  return null;
}

export interface UnmappedShapeKey {
  readonly name: string;
  readonly reasonKo: string;
}

export interface ShapeKeyClassification {
  /** 입력 이름 그대로 → 규약 morph 이름 */
  readonly mapped: Readonly<Record<string, MorphTargetName>>;
  readonly unmapped: readonly UnmappedShapeKey[];
  /** override로 결정된 이름 */
  readonly overridden: readonly string[];
}

/**
 * 이름 목록(+선택 override)을 분류한다. override 값은 규약 morph 이름이어야 하며 아니면 unmapped에 사유를 남긴다.
 * override에만 있는 이름도 결과에 포함한다(패키지 manifest의 `characterLab.shapeKeyMap`).
 */
export function classifyShapeKeys(names: readonly string[], override?: Readonly<Record<string, string>>): ShapeKeyClassification {
  const mapped: Record<string, MorphTargetName> = {};
  const unmapped: UnmappedShapeKey[] = [];
  const overridden: string[] = [];
  for (const [name, target] of Object.entries(override ?? {})) {
    if (isMorphTargetName(target)) {
      mapped[name] = target;
      overridden.push(name);
    } else {
      const resolved = resolveShapeKeyAlias(target);
      if (resolved) {
        mapped[name] = resolved;
        overridden.push(name);
      } else {
        unmapped.push({ name, reasonKo: `override 값 '${target}'이(가) 규약 morph 이름(param:<키>:<±> | facs:<유닛>)이 아닙니다.` });
      }
    }
  }
  for (const name of names) {
    if (name in mapped) continue;
    if (unmapped.some((entry) => entry.name === name)) continue;
    const resolved = resolveShapeKeyAlias(name);
    if (resolved) mapped[name] = resolved;
    else unmapped.push({ name, reasonKo: `shape key '${name}'은(는) Blender face.py 24종·ARKit/VRM 표정 별칭에 없습니다.` });
  }
  return { mapped, unmapped, overridden };
}

/** 스펙 공개 API: 이름 목록 → 규약 morph 이름(매핑된 것만) */
export function mapShapeKeys(names: readonly string[], override?: Readonly<Record<string, string>>): Record<string, MorphTargetName> {
  return { ...classifyShapeKeys(names, override).mapped };
}

/** 규약 morph 이름 → 패키지 shape key 이름(역방향; 같은 morph에 여러 키가 대응하면 첫 번째). */
export function invertShapeKeyMap(map: Readonly<Record<string, MorphTargetName>>): Partial<Record<MorphTargetName, string>> {
  const inverted: Partial<Record<MorphTargetName, string>> = {};
  for (const [name, target] of Object.entries(map)) {
    if (inverted[target] === undefined) inverted[target] = name;
  }
  return inverted;
}

export interface ParamPairCoverage {
  readonly plus: boolean;
  readonly minus: boolean;
}

/** 얼굴 파라미터 키별 ± morph 존재 여부(능력 판정용) */
export function faceParamPairCoverage(map: Readonly<Record<string, MorphTargetName>>): Readonly<Record<FaceParamKey, ParamPairCoverage>> {
  const coverage: Record<FaceParamKey, { plus: boolean; minus: boolean }> = Object.fromEntries(
    FACE_PARAM_KEYS.map((key) => [key, { plus: false, minus: false }]),
  ) as Record<FaceParamKey, { plus: boolean; minus: boolean }>;
  const faceKeys: ReadonlySet<string> = new Set(FACE_PARAM_KEYS);
  for (const target of Object.values(map)) {
    const parsed = parseMorphTargetName(target);
    if (!parsed || parsed.kind !== "param" || !faceKeys.has(parsed.key)) continue;
    const entry = coverage[parsed.key as FaceParamKey];
    if (parsed.sign === "+") entry.plus = true;
    else entry.minus = true;
  }
  return coverage;
}

/** 매핑 결과에 들어 있는 FACS 유닛 집합 */
export function facsUnitsInMap(map: Readonly<Record<string, MorphTargetName>>): readonly FacsUnit[] {
  const units = new Set<FacsUnit>();
  for (const target of Object.values(map)) {
    const parsed = parseMorphTargetName(target);
    if (parsed?.kind === "facs") units.add(parsed.unit);
  }
  return [...units];
}
