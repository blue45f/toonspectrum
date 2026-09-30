/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: 손 포즈 프리셋 라이브러리 (MP1).
 *
 * 웹툰에서 자주 등장하는 손 모양 50종을 데이터로 제공합니다. 데생 인형의 손가락은
 * 관절이 아니라 손목에 붙은 장식 프리미티브이므로(studio-mannequin-hand-tracking 참조),
 * 프리셋은 손목 관절 회전(Euler radians) + 손가락별 컬(curl 0~100) 로 구성됩니다.
 *
 * - 관절 ID는 손 관절 ID 체계(`leftHand`/`rightHand`)만 참조합니다.
 * - 미러는 하우스 미러 계약(YZ 평면 반사 + 관절 측 스왑)을 따릅니다.
 * - Three.js/R3F를 import하지 않는 순수 데이터+로직 모듈입니다.
 */

import { mirrorStudioMannequinHandEuler } from "./studio-mannequin-hand-tracking";
import type {
  StudioMannequinJointId,
  StudioMannequinVec3,
} from "./studio-mannequin-model";

import type {
  StudioMannequinHandJointId,
  StudioMannequinHandSide,
} from "./studio-mannequin-hand-tracking";

export const STUDIO_HAND_PRESET_COUNT = 50 as const;

/** 손가락 5개의 컬(curl) 값. 0 = 완전히 폄, 100 = 완전히 구부림. */
export interface StudioHandFingerCurl {
  readonly thumb: number;
  readonly index: number;
  readonly middle: number;
  readonly ring: number;
  readonly little: number;
}

export const STUDIO_HAND_FINGER_ORDER = [
  "thumb",
  "index",
  "middle",
  "ring",
  "little",
] as const;

export type StudioHandFingerName = (typeof STUDIO_HAND_FINGER_ORDER)[number];

/** 손 프리셋 카테고리: 기본 | 제스처 | 숫자 | 잡기 | 감정. */
export type StudioHandPresetCategory = "basic" | "gesture" | "number" | "grip" | "emotion";

/** 카테고리 필터 칩에 쓰는 메타 정보. */
export const STUDIO_HAND_PRESET_CATEGORIES: ReadonlyArray<{
  readonly id: StudioHandPresetCategory;
  readonly label: string;
}> = [
  { id: "basic", label: "기본" },
  { id: "gesture", label: "제스처" },
  { id: "number", label: "숫자" },
  { id: "grip", label: "잡기" },
  { id: "emotion", label: "감정" },
];

/**
 * 카테고리·검색어로 손 프리셋을 필터링합니다.
 * `category`가 "all"이거나 생략이면 전체를 대상으로 합니다.
 */
export function filterStudioMannequinHandPresets(options: {
  readonly category?: StudioHandPresetCategory | "all";
  readonly query?: string;
}): readonly StudioMannequinHandPreset[] {
  const category = options.category ?? "all";
  const query = options.query?.trim().toLowerCase() ?? "";
  return STUDIO_MANNEQUIN_HAND_PRESETS.filter((preset) => {
    if (category !== "all" && preset.category !== category) return false;
    if (query === "") return true;
    return (
      preset.name.toLowerCase().includes(query) ||
      preset.id.toLowerCase().includes(query) ||
      preset.description.toLowerCase().includes(query)
    );
  });
}

export interface StudioMannequinHandPreset {
  readonly id: string;
  /** UI에 표시하는 한글 이름. */
  readonly name: string;
  /** 손목 관절 회전(Euler radians). */
  readonly wrist: StudioMannequinVec3;
  /** 손가락별 컬(0~100). */
  readonly curl: StudioHandFingerCurl;
  /** 초보자용 설명. 합니다체. */
  readonly description: string;
  /** 카테고리(기본/제스처/숫자/잡기/감정). */
  readonly category: StudioHandPresetCategory;
  /** 양손을 함께 써야 자연스러운 프리셋이면 true. */
  readonly twoHanded?: boolean;
}

function preset(
  id: string,
  name: string,
  wrist: StudioMannequinVec3,
  curl: readonly [number, number, number, number, number],
  description: string,
  category: StudioHandPresetCategory,
  twoHanded = false,
): StudioMannequinHandPreset {
  return Object.freeze({
    id,
    name,
    wrist,
    category,
    curl: Object.freeze({
      thumb: curl[0],
      index: curl[1],
      middle: curl[2],
      ring: curl[3],
      little: curl[4],
    }),
    description,
    ...(twoHanded ? { twoHanded: true as const } : {}),
  });
}

/**
 * 50종 손 프리셋. 웹툰 빈출 순서 우선(주먹/가리키기/브이/잡기/펼침 등).
 * 손목 각도는 중립에서 벗어나는 최소한의 값만 사용합니다.
 */
export const STUDIO_MANNEQUIN_HAND_PRESETS: readonly StudioMannequinHandPreset[] =
  Object.freeze([
    preset("fist", "주먹", [0, 0, 0], [100, 100, 100, 100, 100], "손가락을 모두 구부려 주먹을 쥡니다. 격투·분노·의지 표현에 사용합니다.", "basic"),
    preset("open", "손바닥 펼침", [0, 0, 0], [0, 0, 0, 0, 0], "손가락을 모두 폅니다. 놀람·설명·제시 표현에 사용합니다.", "basic"),
    preset("point", "가리키기", [0, 0.2, 0], [100, 0, 100, 100, 100], "검지로 방향을 가리킵니다. 지시·강조 표현에 사용합니다.", "basic"),
    preset("peace", "브이(피스)", [0, 0, 0], [100, 0, 0, 100, 100], "검지와 중지를 펼쳐 V자를 만듭니다. 일상·밝은 감정 표현에 사용합니다.", "basic"),
    preset("thumbs-up", "엄지척", [0, 0, 0], [0, 100, 100, 100, 100], "엄지를 세웁니다. 칭찬·동의·격려 표현에 사용합니다.", "basic"),
    preset("thumbs-down", "엄지 내림", [0, 0, -1.2], [0, 100, 100, 100, 100], "엄지를 아래로 향하게 합니다. 부정·실망 표현에 사용합니다.", "basic"),
    preset("ok", "오케이", [0, 0, 0], [70, 75, 0, 0, 0], "엄지와 검지로 원을 만듭니다. 동의·완벽 표현에 사용합니다.", "gesture"),
    preset("pinch", "꼬집기", [0, 0, 0], [85, 85, 100, 100, 100], "엄지와 검지로 무언가를 집는 모양입니다. 작은 물건을 다루는 장면에 사용합니다.", "grip"),
    preset("small-pinch", "작은 것 집기", [0.2, 0, 0], [90, 90, 100, 100, 100], "엄지와 검지 끝으로 아주 작은 것을 집습니다. 정교한 작업 장면에 사용합니다.", "grip"),
    preset("grab", "움켜쥐기", [0, 0, 0], [70, 70, 70, 70, 70], "손잡이 등을 움켜쥡니다. 물건을 잡는 장면에 사용합니다.", "grip"),
    preset("claw", "갈고리손", [0, 0, 0], [45, 45, 45, 45, 45], "손가락을 갈고리처럼 구부립니다. 위협·야수·공포 표현에 사용합니다.", "emotion"),
    preset("hook", "후크(걸기)", [-0.3, 0, 0], [65, 65, 65, 65, 65], "손가락을 걸어 무언가를 끌어당기는 모양입니다.", "grip"),
    preset("loose-fist", "느슨한 주먹", [0, 0, 0], [60, 60, 60, 60, 60], "힘을 뺀 주먹입니다. 긴장 완화·자연스러운 대기 자세에 사용합니다.", "basic"),
    preset("relaxed", "편안한 손", [0, 0, 0], [25, 25, 25, 25, 25], "살짝 구부린 자연스러운 손입니다. 기본 대기 자세에 사용합니다.", "basic"),
    preset("ball", "공 잡기", [0, 0, 0], [50, 50, 50, 50, 50], "공을 감싸 쥡니다. 구기·잡기 장면에 사용합니다.", "grip"),
    preset("pen", "펜 잡기", [0.3, 0, 0], [55, 60, 65, 95, 95], "펜을 잡는 모양입니다. 쓰기·그리기 장면에 사용합니다.", "grip"),
    preset("sword", "칼 잡기", [-0.4, 0, 0], [90, 90, 90, 90, 90], "자루를 단단히 쥡니다. 무기 소지 장면에 사용합니다.", "grip"),
    preset("pistol", "손가락 총", [0, 0.1, 0], [30, 0, 100, 100, 100], "검지를 총구처럼 폅니다. 장난·위협 표현에 사용합니다.", "gesture"),
    preset("rock", "락(코른)", [0, 0, 0], [85, 0, 100, 100, 0], "검지와 새끼를 세웁니다. 음악·신남 표현에 사용합니다.", "gesture"),
    preset("devil-horns", "악마 뿔", [0, 0, 0.3], [90, 0, 100, 100, 0], "검지와 새끼를 세우고 손목을 기울입니다. 장난·악동 표현에 사용합니다.", "gesture"),
    preset("phone", "전화 걸기", [0, 0.3, 0], [0, 100, 100, 100, 0], "엄지와 새끼를 펴 귀에 댑니다. 통화 장면에 사용합니다.", "gesture"),
    preset("finger-heart", "손가락 하트", [0, 0, 0.2], [60, 65, 100, 100, 100], "엄지와 검지를 교차해 작은 하트를 만듭니다. 애교 표현에 사용합니다.", "emotion"),
    preset("heart", "하트", [0, 0.4, 0], [40, 45, 90, 90, 90], "양손을 모아 하트를 만듭니다. 양손을 함께 사용하면 자연스럽습니다.", "emotion", true),
    preset("prayer", "합장(기도)", [0, 0.4, 0], [15, 10, 10, 10, 10], "양손을 모아 합장합니다. 기도·간청·감사 표현에 사용합니다.", "emotion", true),
    preset("stop", "멈춰", [-0.5, 0, 0], [0, 0, 0, 0, 0], "손바닥을 앞으로 펴 보입니다. 제지·거부 표현에 사용합니다.", "gesture"),
    preset("wave", "손 흔들기", [0, 0, 0.5], [5, 5, 5, 5, 5], "손을 흔들어 인사합니다. 반가움·작별 표현에 사용합니다.", "gesture"),
    preset("one", "숫자 1", [0, 0, 0], [100, 0, 100, 100, 100], "검지만 펴 숫자 1을 표현합니다.", "number"),
    preset("two", "숫자 2", [0, 0, 0], [100, 0, 0, 100, 100], "검지와 중지를 펴 숫자 2를 표현합니다.", "number"),
    preset("three", "숫자 3", [0, 0, 0], [100, 0, 0, 0, 100], "검지·중지·약지를 펴 숫자 3을 표현합니다.", "number"),
    preset("four", "숫자 4", [0, 0, 0], [100, 0, 0, 0, 0], "엄지만 구부려 숫자 4를 표현합니다.", "number"),
    preset("five", "숫자 5", [0, 0, 0], [0, 0, 0, 0, 0], "다섯 손가락을 모두 펴 숫자 5를 표현합니다.", "number"),
    preset("crossed-fingers", "손가락 꼬기", [0, 0, 0], [100, 65, 70, 100, 100], "검지와 중지를 꼬아 행운을 빕니다. 소망 표현에 사용합니다.", "gesture"),
    preset("beckon", "이리 와", [0.4, 0, 0], [40, 60, 70, 80, 90], "손가락을 구부려 부릅니다. 유인·호출 표현에 사용합니다.", "gesture"),
    preset("salute", "경례", [0, 0, 0], [10, 10, 10, 10, 10], "손가락을 모아 이마에 댑니다. 군인·격식 표현에 사용합니다.", "gesture"),
    preset("palm-up", "손바닥 위로", [0.7, 0, 0], [10, 10, 10, 10, 10], "손바닥을 위로 향하게 합니다. 받기·제안·의문 표현에 사용합니다.", "gesture"),
    preset("palm-down", "손바닥 아래로", [-0.7, 0, 0], [10, 10, 10, 10, 10], "손바닥을 아래로 향하게 합니다. 누르기·진정 표현에 사용합니다.", "gesture"),
    preset("chin-rest", "턱 괴기", [0.9, 0, 0], [90, 90, 90, 90, 90], "주먹을 쥐고 턱을 괴입니다. 생각·지루함 표현에 사용합니다.", "gesture"),
    preset("chop", "손날(수도)", [0, 0, 0], [15, 5, 5, 5, 5], "손날을 세웁니다. 격투·타격 장면에 사용합니다.", "gesture"),
    preset("high-five", "하이파이브", [0, 0, 0], [0, 0, 0, 0, 0], "손바닥을 들어 맞춥니다. 축하·격려 표현에 사용합니다.", "gesture"),
    preset("handshake", "악수", [0, 0.6, 0], [45, 45, 45, 45, 45], "손을 내밀어 잡습니다. 인사·합의 장면에 사용합니다.", "gesture"),
    preset("snap", "손가락 튕기기", [0, 0.2, 0], [70, 70, 55, 100, 100], "중지를 튕깁니다. 마법·신호 표현에 사용합니다.", "gesture"),
    preset("hair-touch", "머리 만지기", [0.5, 0, 0], [30, 25, 25, 30, 35], "머리카락을 쓸어 넘깁니다. 부끄러움·멋 표현에 사용합니다.", "gesture"),
    preset("glasses", "안경 조정", [0.3, 0, 0], [60, 55, 100, 100, 100], "엄지와 검지로 안경을 올립니다. 지적인 인상 표현에 사용합니다.", "gesture"),
    preset("fist-pump", "주먹 불끈", [-0.4, 0, 0], [100, 100, 100, 100, 100], "주먹을 위로 치켜듭니다. 승리·기쁨 표현에 사용합니다.", "emotion"),
    preset("scratch", "귀 긁기", [0, 0.4, 0], [100, 30, 30, 100, 100], "검지와 중지로 귀를 긁적입니다. 당황·머쓱함 표현에 사용합니다.", "emotion"),
    preset("typing", "타이핑", [0.5, 0, 0], [45, 40, 40, 45, 50], "키보드 위에 손을 올린 모양입니다. 작업 장면에 사용합니다.", "grip"),
    preset("carry", "나르기", [-0.5, 0, 0], [5, 5, 5, 5, 5], "손바닥을 아래로 펴 쟁반처럼 받칩니다. 서빙·운반 장면에 사용합니다.", "grip"),
    preset("shrug", "어깨 으쓱", [0, 0.6, 0], [10, 10, 10, 10, 10], "손바닥을 위로 벌립니다. 모름·당황 표현에 사용합니다.", "gesture"),
    preset("forehead", "이마 짚기", [0.8, 0, 0], [5, 5, 5, 5, 5], "손바닥으로 이마를 짚습니다. 피로·난감 표현에 사용합니다.", "emotion"),
    preset("money", "돈 세기", [0, 0, 0], [30, 25, 25, 100, 100], "엄지·검지·중지로 지폐를 셉니다. 계산 장면에 사용합니다.", "grip"),
  ]);

const STUDIO_MANNEQUIN_HAND_PRESET_BY_ID: ReadonlyMap<string, StudioMannequinHandPreset> =
  new Map(STUDIO_MANNEQUIN_HAND_PRESETS.map((preset) => [preset.id, preset]));

/** 프리셋 ID로 프리셋을 찾습니다. 없으면 undefined를 돌립니다. */
export function getStudioMannequinHandPreset(id: string): StudioMannequinHandPreset | undefined {
  return STUDIO_MANNEQUIN_HAND_PRESET_BY_ID.get(id);
}

/** curl 값 하나를 0~100으로 클램프합니다. 비유한 값은 0으로 처리합니다. */
export function clampStudioHandCurlValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** 손가락 5개의 컬을 모두 0~100으로 정규화합니다. */
export function normalizeStudioHandCurl(
  curl: Partial<StudioHandFingerCurl> | undefined,
): StudioHandFingerCurl {
  return {
    thumb: clampStudioHandCurlValue(curl?.thumb),
    index: clampStudioHandCurlValue(curl?.index),
    middle: clampStudioHandCurlValue(curl?.middle),
    ring: clampStudioHandCurlValue(curl?.ring),
    little: clampStudioHandCurlValue(curl?.little),
  };
}

/** 두 curl 사이를 t(0~1)로 선형 보간합니다. 손가락 컬 슬라이더의 기반 연산입니다. */
export function blendStudioHandCurl(
  from: StudioHandFingerCurl,
  to: StudioHandFingerCurl,
  t: number,
): StudioHandFingerCurl {
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const lerp = (a: number, b: number): number => a + (b - a) * clamped;
  return {
    thumb: clampStudioHandCurlValue(lerp(from.thumb, to.thumb)),
    index: clampStudioHandCurlValue(lerp(from.index, to.index)),
    middle: clampStudioHandCurlValue(lerp(from.middle, to.middle)),
    ring: clampStudioHandCurlValue(lerp(from.ring, to.ring)),
    little: clampStudioHandCurlValue(lerp(from.little, to.little)),
  };
}

function handJointIdForSide(side: StudioMannequinHandSide): StudioMannequinHandJointId {
  return side === "left" ? "leftHand" : "rightHand";
}

/** 손 측을 뒤집습니다(미러 원클릭용). */
export function mirrorStudioMannequinHandSide(
  side: StudioMannequinHandSide,
): StudioMannequinHandSide {
  return side === "left" ? "right" : "left";
}

/** 손 관절 ID를 좌우로 뒤집습니다(`leftHand` ↔ `rightHand`). */
export function mirrorStudioMannequinHandJointId(
  jointId: StudioMannequinHandJointId,
): StudioMannequinHandJointId {
  return jointId === "leftHand" ? "rightHand" : "leftHand";
}

/**
 * 프리셋을 지정한 측에 적용한 관절 각도 맵을 돌립니다.
 * 반환값은 `Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>` 형태라
 * 포즈 페이로드에 그대로 합칠 수 있습니다.
 */
export function applyStudioMannequinHandPreset(
  preset: StudioMannequinHandPreset,
  side: StudioMannequinHandSide,
  curlOverride?: Partial<StudioHandFingerCurl>,
): {
  readonly angles: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>;
  readonly curl: StudioHandFingerCurl;
} {
  const jointId = handJointIdForSide(side);
  return {
    angles: { [jointId]: preset.wrist },
    curl: curlOverride ? { ...preset.curl, ...normalizeStudioHandCurl(curlOverride) } : preset.curl,
  };
}

/**
 * 프리셋을 반대쪽 손에 미러 적용합니다(원클릭 좌우 미러 토글).
 * 관절 ID를 스왑하고 손목 오일러는 하우스 미러 계약으로 반사합니다.
 *
 * 토글 계약: `side`가 "left"이면 미러 반사된 오일러를 오른손에 싣고,
 * "right"이면(미러를 두 번 적용하면) 원래 오일러로 왼손에 되돌립니다.
 */
export function applyStudioMannequinHandPresetMirrored(
  preset: StudioMannequinHandPreset,
  side: StudioMannequinHandSide,
  curlOverride?: Partial<StudioHandFingerCurl>,
): {
  readonly angles: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>>;
  readonly curl: StudioHandFingerCurl;
} {
  const mirroredSide = mirrorStudioMannequinHandSide(side);
  const jointId = handJointIdForSide(mirroredSide);
  const applied = applyStudioMannequinHandPreset(preset, side, curlOverride);
  return {
    angles: { [jointId]: side === "left" ? mirrorStudioMannequinHandEuler(preset.wrist) : preset.wrist },
    curl: applied.curl,
  };
}

export interface StudioMannequinHandPosePayload {
  /** 페이로드 스키마 버전. */
  readonly version: 1;
  readonly presetId: string;
  readonly side: StudioMannequinHandSide;
  readonly wrist: StudioMannequinVec3;
  readonly curl: StudioHandFingerCurl;
  /** 포즈 강도(0~100). 생략하면 100(풀프리셋). */
  readonly intensity?: number;
  readonly savedAt: string;
}

/**
 * 포즈와 함께 저장 가능한 손 프리셋 페이로드를 만듭니다.
 * `savedAt`은 테스트 주입용으로 덮어쓸 수 있습니다.
 */
export function createStudioMannequinHandPosePayload(
  preset: StudioMannequinHandPreset,
  side: StudioMannequinHandSide,
  options: {
    readonly intensity?: number;
    readonly curlOverride?: Partial<StudioHandFingerCurl>;
    readonly savedAt?: string;
  } = {},
): StudioMannequinHandPosePayload {
  const applied = applyStudioMannequinHandPreset(preset, side, options.curlOverride);
  const wrist = applied.angles[handJointIdForSide(side)] ?? preset.wrist;
  const payload: StudioMannequinHandPosePayload = {
    version: 1,
    presetId: preset.id,
    side,
    wrist,
    curl: applied.curl,
    savedAt: options.savedAt ?? new Date().toISOString(),
  };
  return options.intensity === undefined
    ? payload
    : { ...payload, intensity: options.intensity };
}
