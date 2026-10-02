/**
 * 패키지 노드(본) 이름 → VRM 1.0 휴머노이드 본 이름 매핑.
 *
 * 규칙(우선순위 순):
 * 1. override(패키지 manifest `humanoidBones[]`·`characterLab.boneMap`) — 패키지가 선언한 대응이 항상 이긴다.
 * 2. VRM 정식명(`leftUpperArm`), Mixamo(`mixamorig:LeftArm`), Blender Rigify/VRM add-on(`DEF-upper_arm.L`, `upper_arm.L`),
 *    VRoid(`J_Bip_L_UpperArm`) 명명 규칙을 접두·접미·구분자·대소문자 정규화로 흡수한다.
 * 3. 결과는 역방향 유일(본 하나에 노드 하나)이다. 이미 배정된 본은 두 번째 후보가 가져가지 않는다
 *    (예: 패키지가 Spine2→chest를 선언하면 Spine1→chest 추정은 버린다).
 *
 * 명명 규칙 사실 출처: VRM 1.0 humanoid 본 이름(사양 사실만), Mixamo 리그 관례, Rigify 메타리그 관례.
 */
import { FINGER_BONE_NAMES, HUMANOID_BONE_NAMES, REQUIRED_HUMANOID_BONES, isHumanoidBoneName } from "../../contracts";

import type { HumanoidBoneName } from "../../contracts";

type Side = "left" | "right";

/** 중앙 본 토큰(정규화 후) → 본 이름 */
const CENTER_TOKENS: Readonly<Record<string, HumanoidBoneName>> = {
  hips: "hips",
  hip: "hips",
  pelvis: "hips",
  root: "hips",
  spine: "spine",
  spine1: "chest",
  spine01: "chest",
  spine001: "chest",
  chest: "chest",
  spine2: "upperChest",
  spine02: "upperChest",
  spine002: "upperChest",
  spine3: "upperChest",
  spine003: "upperChest",
  upperchest: "upperChest",
  neck: "neck",
  neck1: "neck",
  spine004: "neck",
  head: "head",
  spine006: "head",
  jaw: "jaw",
};

/** 좌우 본 토큰(정규화 후, 측면 제거) → 본 이름 접미(`left`/`right` + 접미) */
type SidedSuffix =
  | "Shoulder"
  | "UpperArm"
  | "LowerArm"
  | "Hand"
  | "UpperLeg"
  | "LowerLeg"
  | "Foot"
  | "Toes"
  | "Eye"
  | "ThumbMetacarpal"
  | "ThumbProximal"
  | "ThumbDistal"
  | "IndexProximal"
  | "IndexIntermediate"
  | "IndexDistal"
  | "MiddleProximal"
  | "MiddleIntermediate"
  | "MiddleDistal"
  | "RingProximal"
  | "RingIntermediate"
  | "RingDistal"
  | "LittleProximal"
  | "LittleIntermediate"
  | "LittleDistal";

const SIDED_TOKENS: Readonly<Record<string, SidedSuffix>> = {
  shoulder: "Shoulder",
  clavicle: "Shoulder",
  upperarm: "UpperArm",
  arm: "UpperArm",
  uparm: "UpperArm",
  lowerarm: "LowerArm",
  forearm: "LowerArm",
  hand: "Hand",
  wrist: "Hand",
  upperleg: "UpperLeg",
  upleg: "UpperLeg",
  thigh: "UpperLeg",
  lowerleg: "LowerLeg",
  leg: "LowerLeg",
  shin: "LowerLeg",
  calf: "LowerLeg",
  foot: "Foot",
  ankle: "Foot",
  toes: "Toes",
  toe: "Toes",
  toebase: "Toes",
  eye: "Eye",
  thumbmetacarpal: "ThumbMetacarpal",
  thumb1: "ThumbMetacarpal",
  thumb01: "ThumbMetacarpal",
  handthumb1: "ThumbMetacarpal",
  thumbproximal: "ThumbProximal",
  thumb2: "ThumbProximal",
  thumb02: "ThumbProximal",
  handthumb2: "ThumbProximal",
  thumbdistal: "ThumbDistal",
  thumb3: "ThumbDistal",
  thumb03: "ThumbDistal",
  handthumb3: "ThumbDistal",
  indexproximal: "IndexProximal",
  index1: "IndexProximal",
  findex01: "IndexProximal",
  handindex1: "IndexProximal",
  indexintermediate: "IndexIntermediate",
  index2: "IndexIntermediate",
  findex02: "IndexIntermediate",
  handindex2: "IndexIntermediate",
  indexdistal: "IndexDistal",
  index3: "IndexDistal",
  findex03: "IndexDistal",
  handindex3: "IndexDistal",
  middleproximal: "MiddleProximal",
  middle1: "MiddleProximal",
  fmiddle01: "MiddleProximal",
  handmiddle1: "MiddleProximal",
  middleintermediate: "MiddleIntermediate",
  middle2: "MiddleIntermediate",
  fmiddle02: "MiddleIntermediate",
  handmiddle2: "MiddleIntermediate",
  middledistal: "MiddleDistal",
  middle3: "MiddleDistal",
  fmiddle03: "MiddleDistal",
  handmiddle3: "MiddleDistal",
  ringproximal: "RingProximal",
  ring1: "RingProximal",
  fring01: "RingProximal",
  handring1: "RingProximal",
  ringintermediate: "RingIntermediate",
  ring2: "RingIntermediate",
  fring02: "RingIntermediate",
  handring2: "RingIntermediate",
  ringdistal: "RingDistal",
  ring3: "RingDistal",
  fring03: "RingDistal",
  handring3: "RingDistal",
  littleproximal: "LittleProximal",
  little1: "LittleProximal",
  pinky1: "LittleProximal",
  fpinky01: "LittleProximal",
  handpinky1: "LittleProximal",
  littleintermediate: "LittleIntermediate",
  little2: "LittleIntermediate",
  pinky2: "LittleIntermediate",
  fpinky02: "LittleIntermediate",
  handpinky2: "LittleIntermediate",
  littledistal: "LittleDistal",
  little3: "LittleDistal",
  pinky3: "LittleDistal",
  fpinky03: "LittleDistal",
  handpinky3: "LittleDistal",
};

/** 리그 접두(측면 정보 없음) */
const RIG_PREFIXES: readonly RegExp[] = [
  /^mixamorig\d*:/iu,
  /^armature\|/iu,
  /^(?:def|org|mch)-/iu,
  /^bip\d*[_\s]*/iu,
  /^character\d*_/iu,
];

const VROID_PATTERN = /^j_(?:bip|adj|sec)_([clr])_(.+)$/iu;
const SIDE_SUFFIX = /^(.*?)[._\-\s](l|r|left|right)(?:[._]\d{3})?$/iu;
/** `LeftArm`·`leftArm`·`Left_Arm`처럼 대문자 또는 소문자 측면 접두 뒤에 대문자·구분자가 오는 형태(Mixamo·VRM 정식명) */
const SIDE_PREFIX = /^(Left|Right|left|right)(?=[A-Z_.\-\s])(.*)$/u;
const SIDE_PREFIX_LOWER = /^(left|right)[._\-\s](.*)$/iu;
const SIDE_LETTER_PREFIX = /^([lr])[._\-\s](.+)$/iu;

function sideFromLetter(letter: string): Side | null {
  const lower = letter.toLowerCase();
  if (lower === "l" || lower === "left") return "left";
  if (lower === "r" || lower === "right") return "right";
  return null;
}

interface NormalizedBoneName {
  readonly side: Side | null;
  readonly token: string;
}

/** 접두·측면·구분자를 벗겨 소문자 영숫자 토큰으로 만든다. */
export function normalizeBoneName(name: string): NormalizedBoneName {
  let working = name.trim();
  let side: Side | null = null;
  const vroid = VROID_PATTERN.exec(working);
  if (vroid) {
    side = sideFromLetter(vroid[1] ?? "");
    working = vroid[2] ?? "";
  }
  for (const prefix of RIG_PREFIXES) working = working.replace(prefix, "");
  if (side === null) {
    const suffix = SIDE_SUFFIX.exec(working);
    if (suffix) {
      side = sideFromLetter(suffix[2] ?? "");
      working = suffix[1] ?? "";
    }
  }
  if (side === null) {
    const prefix = SIDE_PREFIX.exec(working) ?? SIDE_PREFIX_LOWER.exec(working) ?? SIDE_LETTER_PREFIX.exec(working);
    if (prefix) {
      side = sideFromLetter(prefix[1] ?? "");
      working = prefix[2] ?? "";
    }
  }
  const token = working.toLowerCase().replace(/[^a-z0-9]/gu, "");
  return { side, token };
}

/** 이름 하나를 휴머노이드 본으로 추정한다(override 없이). 모르면 null. */
export function guessHumanoidBone(name: string): HumanoidBoneName | null {
  if (isHumanoidBoneName(name)) return name;
  const { side, token } = normalizeBoneName(name);
  if (token.length === 0) return null;
  if (side === null) {
    const center = CENTER_TOKENS[token];
    if (center) return center;
    // VRM 정식명이 측면 접두 없이 들어온 경우(예: "LeftUpperArm" → prefix 처리됨)는 위에서 끝난다.
    return null;
  }
  const suffix = SIDED_TOKENS[token] ?? (token.endsWith("eye") ? "Eye" : null);
  if (!suffix) return null;
  const candidate = `${side}${suffix}`;
  return isHumanoidBoneName(candidate) ? candidate : null;
}

export interface UnmappedBoneName {
  readonly name: string;
  readonly reasonKo: string;
}

export interface BoneCoverage {
  readonly covered: readonly HumanoidBoneName[];
  readonly missing: readonly HumanoidBoneName[];
}

export interface BoneClassification {
  readonly mapped: Readonly<Record<string, HumanoidBoneName>>;
  readonly unmapped: readonly UnmappedBoneName[];
  readonly overridden: readonly string[];
  /** VRMC_vrm 필수 15본 */
  readonly required: BoneCoverage;
  /** 손가락 30본 */
  readonly fingers: BoneCoverage;
  /** 55본 전체 */
  readonly all: BoneCoverage;
}

function coverage(assigned: ReadonlySet<HumanoidBoneName>, universe: readonly HumanoidBoneName[]): BoneCoverage {
  const covered: HumanoidBoneName[] = [];
  const missing: HumanoidBoneName[] = [];
  for (const bone of universe) (assigned.has(bone) ? covered : missing).push(bone);
  return { covered, missing };
}

/**
 * 노드 이름 목록(+override)을 분류한다. 결과 `mapped`는 역방향 유일하다.
 * override 값이 본 어휘 밖이면 unmapped에 사유를 남긴다.
 */
export function classifyBoneNames(names: readonly string[], override?: Readonly<Record<string, string>>): BoneClassification {
  const mapped: Record<string, HumanoidBoneName> = {};
  const unmapped: UnmappedBoneName[] = [];
  const overridden: string[] = [];
  const taken = new Set<HumanoidBoneName>();

  for (const [name, bone] of Object.entries(override ?? {})) {
    if (!isHumanoidBoneName(bone)) {
      unmapped.push({ name, reasonKo: `override 값 '${bone}'이(가) 휴머노이드 본 어휘(55본) 밖입니다.` });
      continue;
    }
    if (taken.has(bone)) {
      unmapped.push({ name, reasonKo: `본 '${bone}'은(는) 이미 다른 노드에 배정되어 있습니다(역방향 유일 위반).` });
      continue;
    }
    mapped[name] = bone;
    taken.add(bone);
    overridden.push(name);
  }

  for (const name of names) {
    if (name in mapped || unmapped.some((entry) => entry.name === name)) continue;
    const guess = guessHumanoidBone(name);
    if (!guess) {
      unmapped.push({ name, reasonKo: `노드 '${name}'은(는) VRM·Mixamo·Blender(Rigify/VRoid) 본 명명 규칙에 맞지 않거나 끝 본(End)입니다.` });
      continue;
    }
    if (taken.has(guess)) {
      unmapped.push({ name, reasonKo: `노드 '${name}'의 추정 본 '${guess}'은(는) 이미 배정되어 건너뜁니다.` });
      continue;
    }
    mapped[name] = guess;
    taken.add(guess);
  }

  return {
    mapped,
    unmapped,
    overridden,
    required: coverage(taken, REQUIRED_HUMANOID_BONES),
    fingers: coverage(taken, FINGER_BONE_NAMES),
    all: coverage(taken, HUMANOID_BONE_NAMES),
  };
}

/** 스펙 공개 API: 노드 이름 → 휴머노이드 본 이름(역방향 유일) */
export function mapBoneNames(names: readonly string[], override?: Readonly<Record<string, string>>): Record<string, HumanoidBoneName> {
  return { ...classifyBoneNames(names, override).mapped };
}

/** 본 이름 → 노드 이름(역방향) */
export function invertBoneMap(map: Readonly<Record<string, HumanoidBoneName>>): Partial<Record<HumanoidBoneName, string>> {
  const inverted: Partial<Record<HumanoidBoneName, string>> = {};
  for (const [node, bone] of Object.entries(map)) {
    if (inverted[bone] === undefined) inverted[bone] = node;
  }
  return inverted;
}
