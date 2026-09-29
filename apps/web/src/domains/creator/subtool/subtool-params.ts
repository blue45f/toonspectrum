/**
 * 서브툴(브러시 + 파라미터 세트) 파라미터 모델.
 *
 * CSP 벤치마킹 기반 6개 파라미터 그룹:
 * 1. 팁 모양 (tip) — 모양 + 각도 + 둥글기 + 크기
 * 2. 스트로크 간격 (spacing) — 간격 % + 간격 지터
 * 3. 질감 오버레이 (texture) — 강도 + 스케일 + 모드
 * 4. 듀얼 브러시 (dual brush) — on/off + 크기 비율 + 간격 + 혼합 모드
 * 5. 색상 지터 (color jitter) — H/S/B 지터 + 불투명도 지터
 * 6. 혼합 모드 (blending) — 블렌드 모드 + 불투명도
 *
 * 모든 값은 `normalizeSubToolParams`를 통과하면 범위 안으로 정규화된다.
 * 스토어/어댑터/패널은 원시 값 대신 항상 이 모듈의 정규화 결과를 사용한다.
 */

export const SUBTOOL_TIP_SHAPES = [
  "round",
  "flat",
  "textured",
  "particle",
  "neon",
] as const;
export type SubToolTipShape = (typeof SUBTOOL_TIP_SHAPES)[number];

export const SUBTOOL_TIP_SHAPE_LABELS: Readonly<Record<SubToolTipShape, string>> =
  Object.freeze({
    round: "원형",
    flat: "납작",
    textured: "질감",
    particle: "입자",
    neon: "네온",
  });

export const SUBTOOL_TEXTURE_MODES = ["multiply", "overlay"] as const;
export type SubToolTextureMode = (typeof SUBTOOL_TEXTURE_MODES)[number];

export const SUBTOOL_TEXTURE_MODE_LABELS: Readonly<
  Record<SubToolTextureMode, string>
> = Object.freeze({
  multiply: "곱하기",
  overlay: "오버레이",
});

export const SUBTOOL_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "soft-light",
] as const;
export type SubToolBlendMode = (typeof SUBTOOL_BLEND_MODES)[number];

export const SUBTOOL_BLEND_MODE_LABELS: Readonly<
  Record<SubToolBlendMode, string>
> = Object.freeze({
  normal: "일반",
  multiply: "곱하기",
  screen: "스크린",
  overlay: "오버레이",
  darken: "어둡게",
  lighten: "밝게",
  "color-dodge": "컬러 닷지",
  "soft-light": "소프트 라이트",
});

/** 1. 팁 모양 */
export interface SubToolTipParams {
  readonly shape: SubToolTipShape;
  /** 팁 지름(px). 범위 1–200. */
  readonly size: number;
  /** 팁 회전 각도(°). 범위 0–360. */
  readonly angle: number;
  /** 팁 둥글기. 1=완전 원형, 0에 가까울수록 납작. 범위 0–1. */
  readonly roundness: number;
}

/** 2. 스트로크 간격 */
export interface SubToolSpacingParams {
  /** 연속 도장 사이 거리(팁 크기 대비 %). 범위 1–200. */
  readonly percent: number;
  /** 간격 무작위 변화량. 범위 0–1. */
  readonly jitter: number;
}

/** 3. 질감 오버레이 */
export interface SubToolTextureParams {
  /** 질감 강도. 범위 0–1. */
  readonly strength: number;
  /** 질감 스케일 배율. 범위 0.25–4. */
  readonly scale: number;
  readonly mode: SubToolTextureMode;
}

/** 4. 듀얼 브러시 */
export interface SubToolDualBrushParams {
  readonly enabled: boolean;
  /** 두 번째 팁의 크기 비율. 범위 0.1–1. */
  readonly sizeRatio: number;
  /** 두 번째 팁의 간격(팁 크기 대비 %). 범위 1–200. */
  readonly spacingPercent: number;
  readonly blendMode: SubToolBlendMode;
}

/** 5. 색상 지터 */
export interface SubToolColorJitterParams {
  /** 색조 지터(°). 범위 0–180. */
  readonly hue: number;
  /** 채도 지터. 범위 0–1. */
  readonly saturation: number;
  /** 명도 지터. 범위 0–1. */
  readonly value: number;
  /** 불투명도 지터. 범위 0–1. */
  readonly opacity: number;
}

/** 6. 혼합 모드 */
export interface SubToolBlendingParams {
  readonly mode: SubToolBlendMode;
  /** 스트로크 전체 불투명도. 범위 0–1. */
  readonly opacity: number;
}

export interface SubToolParams {
  readonly tip: SubToolTipParams;
  readonly spacing: SubToolSpacingParams;
  readonly texture: SubToolTextureParams;
  readonly dualBrush: SubToolDualBrushParams;
  readonly colorJitter: SubToolColorJitterParams;
  readonly blending: SubToolBlendingParams;
}

const SUBTOOL_TIP_SIZE_MIN = 1;
const SUBTOOL_TIP_SIZE_MAX = 200;
const SUBTOOL_ANGLE_MIN = 0;
const SUBTOOL_ANGLE_MAX = 360;
const SUBTOOL_SPACING_PERCENT_MIN = 1;
const SUBTOOL_SPACING_PERCENT_MAX = 200;
const SUBTOOL_TEXTURE_SCALE_MIN = 0.25;
const SUBTOOL_TEXTURE_SCALE_MAX = 4;
const SUBTOOL_DUAL_SIZE_RATIO_MIN = 0.1;
const SUBTOOL_HUE_JITTER_MIN = 0;
const SUBTOOL_HUE_JITTER_MAX = 180;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = toFiniteNumber(value, fallback);
  if (numeric < min) return min;
  if (numeric > max) return max;
  return numeric;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

/** 서브툴 파라미터 기본값 (CSP 기본 브러시와 유사한 중립 상태). */
export function createDefaultSubToolParams(): SubToolParams {
  return {
    tip: { shape: "round", size: 24, angle: 0, roundness: 1 },
    spacing: { percent: 25, jitter: 0 },
    texture: { strength: 0, scale: 1, mode: "multiply" },
    dualBrush: {
      enabled: false,
      sizeRatio: 0.5,
      spacingPercent: 50,
      blendMode: "normal",
    },
    colorJitter: { hue: 0, saturation: 0, value: 0, opacity: 0 },
    blending: { mode: "normal", opacity: 1 },
  };
}

function normalizeTipParams(value: unknown): SubToolTipParams {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultSubToolParams().tip;
  return {
    shape: pickEnum(source.shape, SUBTOOL_TIP_SHAPES, defaults.shape),
    size: clampNumber(
      source.size,
      SUBTOOL_TIP_SIZE_MIN,
      SUBTOOL_TIP_SIZE_MAX,
      defaults.size,
    ),
    angle: clampNumber(
      source.angle,
      SUBTOOL_ANGLE_MIN,
      SUBTOOL_ANGLE_MAX,
      defaults.angle,
    ),
    roundness: clampNumber(source.roundness, 0, 1, defaults.roundness),
  };
}

function normalizeSpacingParams(value: unknown): SubToolSpacingParams {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultSubToolParams().spacing;
  return {
    percent: clampNumber(
      source.percent,
      SUBTOOL_SPACING_PERCENT_MIN,
      SUBTOOL_SPACING_PERCENT_MAX,
      defaults.percent,
    ),
    jitter: clampNumber(source.jitter, 0, 1, defaults.jitter),
  };
}

function normalizeTextureParams(value: unknown): SubToolTextureParams {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultSubToolParams().texture;
  return {
    strength: clampNumber(source.strength, 0, 1, defaults.strength),
    scale: clampNumber(
      source.scale,
      SUBTOOL_TEXTURE_SCALE_MIN,
      SUBTOOL_TEXTURE_SCALE_MAX,
      defaults.scale,
    ),
    mode: pickEnum(source.mode, SUBTOOL_TEXTURE_MODES, defaults.mode),
  };
}

function normalizeDualBrushParams(value: unknown): SubToolDualBrushParams {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultSubToolParams().dualBrush;
  return {
    enabled: toBoolean(source.enabled, defaults.enabled),
    sizeRatio: clampNumber(
      source.sizeRatio,
      SUBTOOL_DUAL_SIZE_RATIO_MIN,
      1,
      defaults.sizeRatio,
    ),
    spacingPercent: clampNumber(
      source.spacingPercent,
      SUBTOOL_SPACING_PERCENT_MIN,
      SUBTOOL_SPACING_PERCENT_MAX,
      defaults.spacingPercent,
    ),
    blendMode: pickEnum(source.blendMode, SUBTOOL_BLEND_MODES, defaults.blendMode),
  };
}

function normalizeColorJitterParams(value: unknown): SubToolColorJitterParams {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultSubToolParams().colorJitter;
  return {
    hue: clampNumber(
      source.hue,
      SUBTOOL_HUE_JITTER_MIN,
      SUBTOOL_HUE_JITTER_MAX,
      defaults.hue,
    ),
    saturation: clampNumber(source.saturation, 0, 1, defaults.saturation),
    value: clampNumber(source.value, 0, 1, defaults.value),
    opacity: clampNumber(source.opacity, 0, 1, defaults.opacity),
  };
}

function normalizeBlendingParams(value: unknown): SubToolBlendingParams {
  const source = isRecord(value) ? value : {};
  const defaults = createDefaultSubToolParams().blending;
  return {
    mode: pickEnum(source.mode, SUBTOOL_BLEND_MODES, defaults.mode),
    opacity: clampNumber(source.opacity, 0, 1, defaults.opacity),
  };
}

/**
 * 알 수 없는 입력을 받아 완전하고 범위 안의 SubToolParams로 정규화한다.
 * - 누락/잘못된 숫자는 기본값으로, 범위를 벗어난 숫자는 경계값으로 클램핑
 * - 알 수 없는 enum 문자열은 기본값으로 대체
 * - 부분 패치(partial patch)에도 안전하게 동작
 */
export function normalizeSubToolParams(input: unknown): SubToolParams {
  const source = isRecord(input) ? input : {};
  return {
    tip: normalizeTipParams(source.tip),
    spacing: normalizeSpacingParams(source.spacing),
    texture: normalizeTextureParams(source.texture),
    dualBrush: normalizeDualBrushParams(source.dualBrush),
    colorJitter: normalizeColorJitterParams(source.colorJitter),
    blending: normalizeBlendingParams(source.blending),
  };
}

/** 두 파라미터 세트가 동일한지 비교 (미리보기 캐시 등에 사용). */
export function subToolParamsEqual(a: SubToolParams, b: SubToolParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
