/**
 * Studio Curved / Path Text Engine
 * 웹툰 말풍선·효과음 텍스트를 아치·물결·원호를 따라 휘게 — Konva TextPath의 `data`로 쓸
 * SVG path 문자열을 로컬 좌표(baseline 기준)로 생성한다. 곡률 강도(curve 0..100)만 받아
 * 2차 베지어(Q/T) 또는 원호(A) 커맨드를 조립한다.
 * Konva/DOM 의존 없음 — StudioPage 텍스트 인스펙터와 단위 테스트가 공유한다.
 * 전부 순수·결정적(랜덤 없음)이며, width/fontSize가 0이어도 NaN/Infinity 없이 유한 좌표만 낸다.
 */

// ---------------------------------------------------------------------------
// 모양 타입·라벨·기본값·범위
// ---------------------------------------------------------------------------

/** 텍스트가 따라갈 경로 모양 — none은 수평 직선, 나머지는 휘어짐. */
export type TextPathShape = "none" | "arcUp" | "arcDown" | "wave" | "circleUp" | "circleDown";

/** 인스펙터 셀렉터용 모양 목록 — id와 한글 라벨. */
export const TEXT_PATH_SHAPES: { id: TextPathShape; label: string }[] = [
  { id: "none", label: "직선" },
  { id: "arcUp", label: "아치 ▲" },
  { id: "arcDown", label: "아치 ▼" },
  { id: "wave", label: "물결" },
  { id: "circleUp", label: "원 위" },
  { id: "circleDown", label: "원 아래" },
];

/** 경로 설정 — 모양 + 휘어짐 강도(curve 0..100). */
export type TextPathConfig = { shape: TextPathShape; curve: number };

/** 기본 설정 — 직선(휨 없음), 곡률 중간값. */
export const DEFAULT_TEXT_PATH: TextPathConfig = { shape: "none", curve: 50 };

/** curve 슬라이더 범위 — 0(평탄)..100(최대 휨), 1 단위. */
export const TEXT_PATH_CURVE_RANGE: { min: number; max: number; step: number } = {
  min: 0,
  max: 100,
  step: 1,
};

// 유효 모양 집합(정규화에서 빠른 검증용).
const SHAPE_IDS = new Set<TextPathShape>(TEXT_PATH_SHAPES.map((s) => s.id));

// ---------------------------------------------------------------------------
// 정규화·평탄 판정·라벨
// ---------------------------------------------------------------------------

/** curve를 0..100으로 클램프(유한 숫자 아님은 기본값). */
function clampCurve(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TEXT_PATH.curve;
  if (value < TEXT_PATH_CURVE_RANGE.min) return TEXT_PATH_CURVE_RANGE.min;
  if (value > TEXT_PATH_CURVE_RANGE.max) return TEXT_PATH_CURVE_RANGE.max;
  return value;
}

/**
 * 외부 입력/저장본 안전장치 — 모양이 알려진 값이 아니면 "none", curve는 0..100 클램프.
 * 누락/무효 입력은 DEFAULT_TEXT_PATH로 메운다.
 */
export function normalizeTextPath(c?: Partial<TextPathConfig> | null): TextPathConfig {
  if (!c || typeof c !== "object") return { ...DEFAULT_TEXT_PATH };
  const shape = SHAPE_IDS.has(c.shape as TextPathShape) ? (c.shape as TextPathShape) : "none";
  return { shape, curve: clampCurve(c.curve) };
}

/** 직선(휨 없음) 설정인지 — shape가 "none"이면 경로 효과를 끈다. */
export function isFlatTextPath(c: TextPathConfig): boolean {
  return c.shape === "none";
}

/** 모양 id → 한글 라벨(미상은 "직선"). */
export function textPathShapeLabel(shape: TextPathShape): string {
  return TEXT_PATH_SHAPES.find((s) => s.id === shape)?.label ?? "직선";
}

// ---------------------------------------------------------------------------
// SVG path data 빌드
// ---------------------------------------------------------------------------

// 좌표 소수 둘째 자리까지(불필요한 0 제거) — path 문자열을 짧고 결정적으로.
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // -0을 0으로 정규화하고 소수 2자리에서 끊은 뒤 꼬리 0/소수점 제거.
  const rounded = Math.round(n * 100) / 100 + 0;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/** 음수·0·무한대를 1 이상의 유한 폭으로 — 나눗셈/호 계산 0 가드. */
function safeWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  return width;
}

/** 음수·0·무한대를 1 이상의 유한 글자 크기로 — baseY/진폭 0 가드. */
function safeFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return 1;
  return fontSize;
}

/** curve(0..100)를 0..1 비율로 — 휨 강도 계수. */
function curveRatio(curve: number): number {
  const c = clampCurve(curve);
  return c / 100;
}

/**
 * 모양별 SVG path data 문자열(로컬 좌표, baseline 기준)을 만든다.
 * width=텍스트 영역 폭, fontSize=글자 크기. curve(0..100)로 휨 정도를 키운다.
 *
 *   none:       "M 0 <fontSize> L <width> <fontSize>" — 수평 직선.
 *   arcUp:      위로 볼록 2차 베지어 — 중간 제어점 y를 baseY 위로(작게) 당긴다.
 *   arcDown:    아래로 볼록 — 중간 제어점 y를 baseY 아래로(크게) 민다.
 *   wave:       물결 — Q…T로 한 골 한 마루(진폭 amp).
 *   circleUp:   원 위쪽 호 — A 커맨드, curve가 클수록 반지름이 작아 더 둥글게.
 *   circleDown: 원 아래쪽 호 — sweep을 뒤집어 아래로 굽힌다.
 *
 * width/fontSize가 0/음수/비유한이어도 1 이상으로 가드해 NaN/Infinity 없는 좌표만 낸다.
 */
export function buildTextPathData(config: TextPathConfig, width: number, fontSize: number): string {
  const { shape } = normalizeTextPath(config);
  const w = safeWidth(width);
  const fs = safeFontSize(fontSize);
  const ratio = curveRatio(config.curve);

  // none은 글자 크기 높이의 수평 직선(baseline 한 줄).
  if (shape === "none") {
    return `M 0 ${fmt(fs)} L ${fmt(w)} ${fmt(fs)}`;
  }

  // 휜 모양들의 baseline y — 위로 휠 여유를 두려 글자 크기보다 약간 아래.
  const baseY = fs * 1.4;

  if (shape === "arcUp" || shape === "arcDown") {
    // 활(bow) 깊이 — 폭에 비례, curve로 강도. arcUp은 위(−), arcDown은 아래(+).
    const bow = ratio * w * 0.45;
    const ctrlY = shape === "arcUp" ? baseY - bow : baseY + bow;
    return `M 0 ${fmt(baseY)} Q ${fmt(w / 2)} ${fmt(ctrlY)} ${fmt(w)} ${fmt(baseY)}`;
  }

  if (shape === "wave") {
    // 진폭 amp — 글자 크기에 비례. Q로 첫 반파, T로 매끈하게 이어 반대 반파.
    const amp = ratio * fs * 1.2;
    return `M 0 ${fmt(baseY)} Q ${fmt(w / 4)} ${fmt(baseY - amp)} ${fmt(w / 2)} ${fmt(baseY)} T ${fmt(w)} ${fmt(baseY)}`;
  }

  // circleUp / circleDown — 같은 두 끝점을 잇는 원호(A). 활 깊이로 반지름을 역산한다.
  // 현(chord)=w, 새그(sag)=bow일 때 반지름 r = (chord^2/4 + sag^2) / (2*sag).
  // curve가 작으면 bow가 작아 r이 매우 커지고(거의 직선), 크면 r이 작아 더 둥글다.
  const bow = ratio * w * 0.45;
  if (bow <= 0) {
    // 곡률 0 — 호를 그릴 새그가 없으니 직선으로 안전 폴백(반지름 발산 방지).
    return `M 0 ${fmt(baseY)} L ${fmt(w)} ${fmt(baseY)}`;
  }
  const half = w / 2;
  const radius = (half * half + bow * bow) / (2 * bow);
  // large-arc-flag=0(짧은 호), sweep-flag로 위/아래 곡률 방향을 가른다.
  // SVG y축은 아래로 증가 — sweep=1은 시계방향(위로 볼록), sweep=0은 아래로 볼록.
  const sweep = shape === "circleUp" ? 1 : 0;
  return `M 0 ${fmt(baseY)} A ${fmt(radius)} ${fmt(radius)} 0 0 ${sweep} ${fmt(w)} ${fmt(baseY)}`;
}

// ---------------------------------------------------------------------------
// 곡선 텍스트 프리셋 — 첫 항목은 직선(none), 나머지는 자주 쓰는 휨 모양·강도.
// 모든 value는 normalizeTextPath를 통과(알려진 shape, curve 0..100).
// ---------------------------------------------------------------------------

export type TextPathPreset = { id: string; label: string; tip: string; value: TextPathConfig };

export const TEXT_PATH_PRESETS: TextPathPreset[] = [
  {
    id: "straight",
    label: "직선",
    tip: "휘지 않는 기본 수평선 — 경로 효과를 끕니다.",
    value: { shape: "none", curve: 50 },
  },
  {
    id: "arch",
    label: "아치",
    tip: "글자를 위로 볼록한 아치 모양으로 둥글게 띄웁니다.",
    value: { shape: "arcUp", curve: 70 },
  },
  {
    id: "arch-deep",
    label: "깊은 아치",
    tip: "곡률을 최대로 키워 가파른 무지개형 아치를 만듭니다.",
    value: { shape: "arcUp", curve: 100 },
  },
  {
    id: "valley",
    label: "골짜기",
    tip: "글자를 아래로 볼록한 골짜기 모양으로 처지게 합니다.",
    value: { shape: "arcDown", curve: 70 },
  },
  {
    id: "wave",
    label: "물결",
    tip: "한 골 한 마루로 출렁이는 물결을 따라 글자를 흐르게 합니다.",
    value: { shape: "wave", curve: 60 },
  },
  {
    id: "circle-up",
    label: "원형 위",
    tip: "큰 원의 위쪽 호를 따라 글자를 둥글게 감습니다.",
    value: { shape: "circleUp", curve: 60 },
  },
];
