/**
 * Stamp-based brush engine (canvas2d).
 *
 * 에어브러시·연필·잉크·수채 마커를 dab(도장) 시퀀스로 그린다. 프로급 드로잉 앱들의 공통
 * 구조로, 증분 렌더링(새 dab 만 추가)과 자연스럽게 맞는다 — 라이브 오버레이와 커밋 렌더가
 * 이 모듈의 같은 함수를 사용해 픽셀 규약이 완전히 일치한다.
 *
 * 결정성 계약: 모든 무작위 요소(연필 그레인 지터 등)는 스탬프 인덱스에서 유도한 해시로만
 * 만든다. 같은 입력(points/pressures/style)이면 증분이든 전체 재생이든 동일한 픽셀이 나온다.
 * 이 계약 덕에 뷰포트 리플레이·커밋 핸드오프에서 획의 모양이 변하지 않는다.
 */

export type StudioStampBrushKind = "airbrush" | "pencil" | "ink" | "watercolor";

/** 스탬프 엔진을 쓰는 브러시 프리셋 id → 종류. 그 외 id 는 null(기존 패밀리 파이프라인). */
export function resolveStudioStampBrushKind(
  brushId: string | undefined
): StudioStampBrushKind | null {
  switch (brushId) {
    case "ink-brush":
      return "ink";
    case "airbrush-fine":
      return "airbrush";
    case "pencil-grain":
      return "pencil";
    case "wash-brush":
      return "watercolor";
    default:
      return null;
  }
}

export interface StudioStampBrushStyle {
  readonly kind: StudioStampBrushKind;
  readonly color: string;
  /** 문서 px 기준 기본 지름(스트로크 굵기 슬라이더와 동일 단위). */
  readonly size: number;
  /** 전체 획 불투명도(0..1) — dab flow 와 곱해진다. */
  readonly opacity: number;
  /** dab 하나의 도포량(0..1). 낮을수록 겹칠수록 진해지는 빌드업 브러시가 된다. */
  readonly flow: number;
  /** 팁 경도(0..1): 1=가장자리 선명, 0=가장 부드러운 페더. */
  readonly hardness: number;
  /** 필압 0에서의 크기 비율(0..1) — Min size. */
  readonly minSizeRatio: number;
}

/** dab 지름 대비 스탬프 간격 비율 — 종류별 질감을 만드는 1차 변수. */
const STAMP_SPACING_RATIO: Record<StudioStampBrushKind, number> = {
  airbrush: 0.16,
  pencil: 0.24,
  ink: 0.32,
  // 수채는 dab 이 겹치며 링이 연속된 젖은 경계로 읽히도록 촘촘하게 찍는다.
  watercolor: 0.11,
};

/** 종류별 기본 파라미터 — UI 슬라이더의 초기값이자 스타일 미지정 필드의 폴백. */
export const STUDIO_STAMP_BRUSH_DEFAULTS: Record<
  StudioStampBrushKind,
  Pick<StudioStampBrushStyle, "flow" | "hardness" | "minSizeRatio">
> = {
  airbrush: { flow: 0.22, hardness: 0.12, minSizeRatio: 0.75 },
  pencil: { flow: 0.62, hardness: 0.85, minSizeRatio: 0.35 },
  ink: { flow: 1, hardness: 1, minSizeRatio: 0.08 },
  watercolor: { flow: 0.3, hardness: 0.35, minSizeRatio: 0.6 },
};

/** 스탬프 인덱스 → [0,1) 결정적 지터. 증분/재생 동일성을 위해 Math.random 금지. */
export function stampJitter(seed: number, salt: number): number {
  let h = (Math.imul(seed + 1, 374761393) + Math.imul(salt + 1, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function pressureRadius(style: StudioStampBrushStyle, pressure: number): number {
  const ratio = clamp01(style.minSizeRatio) + (1 - clamp01(style.minSizeRatio)) * clamp01(pressure);
  return Math.max(0.35, (style.size / 2) * ratio);
}

/**
 * 잉크 브러시의 속도 감쇠: 빠르게 그을수록 가늘어진다(리얼 딥펜 규약).
 * speed 는 "샘플 간 이동 거리 / 기본 크기" 무차원 값.
 */
function inkVelocityFactor(normalizedSpeed: number): number {
  return Math.min(1, Math.max(0.35, 1.12 - normalizedSpeed * 0.22));
}

export interface StudioStampWalkerState {
  lastX: number;
  lastY: number;
  lastPressure: number;
  /** 다음 스탬프까지 남은 거리(이월). */
  residual: number;
  /** 지금까지 찍은 스탬프 수 — 결정적 지터의 시드. */
  stampIndex: number;
}

export function beginStampWalker(x: number, y: number, pressure: number): StudioStampWalkerState {
  return { lastX: x, lastY: y, lastPressure: pressure, residual: 0, stampIndex: 0 };
}

function drawDab(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  index: number
): void {
  const kind = style.kind;
  if (kind === "airbrush" || kind === "watercolor") {
    const hardness = clamp01(style.hardness);
    const gradient = context.createRadialGradient(x, y, radius * hardness * 0.85, x, y, radius);
    gradient.addColorStop(0, style.color);
    gradient.addColorStop(1, "transparent");
    context.globalAlpha = alpha;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    if (kind === "watercolor") {
      // 웻엣지: 가장자리에 살짝 진한 링을 얹어 수채 특유의 경계 침전을 흉내낸다.
      // 링은 은은해야 한다 — 강하면 dab 이 구슬처럼 분리돼 보인다(촘촘한 간격과 세트).
      context.globalAlpha = alpha * 0.22;
      context.strokeStyle = style.color;
      context.lineWidth = Math.max(0.35, radius * 0.1);
      context.beginPath();
      context.arc(x, y, radius * 0.94, 0, Math.PI * 2);
      context.stroke();
    }
    return;
  }
  if (kind === "pencil") {
    // 종이 그레인: 결정적 지터로 위치·도포량을 흔들고, 미세 점 2개를 곁들여 톱니를 만든다.
    const jx = (stampJitter(index, 11) - 0.5) * radius * 0.5;
    const jy = (stampJitter(index, 23) - 0.5) * radius * 0.5;
    context.globalAlpha = alpha * (0.7 + 0.3 * stampJitter(index, 37));
    context.fillStyle = style.color;
    context.beginPath();
    context.arc(x + jx, y + jy, radius * (0.82 + 0.18 * stampJitter(index, 41)), 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = alpha * 0.45;
    for (let grain = 0; grain < 2; grain += 1) {
      const gx = x + (stampJitter(index, 53 + grain) - 0.5) * radius * 2.4;
      const gy = y + (stampJitter(index, 67 + grain) - 0.5) * radius * 2.4;
      context.beginPath();
      context.arc(gx, gy, radius * 0.2, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }
  // ink: 경계가 선명한 원 dab — 속도·필압 반응 폭이 질감의 전부라 형태는 단순하게 유지한다.
  context.globalAlpha = alpha;
  context.fillStyle = style.color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

/**
 * 이전 점 → 새 점 구간을 스탬프 간격으로 걸으며 dab 을 찍는다(증분의 핵심 단위).
 * 호출 측이 context 의 save/restore 와 좌표 변환을 소유한다.
 */
export function walkStampSegment(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  state: StudioStampWalkerState,
  x: number,
  y: number,
  pressure: number
): void {
  const dx = x - state.lastX;
  const dy = y - state.lastY;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) return;
  const speedFactor = style.kind === "ink"
    ? inkVelocityFactor(distance / Math.max(1, style.size))
    : 1;
  const baseAlpha = clamp01(style.flow) * clamp01(style.opacity);
  let travelled = state.residual;
  const spacingOf = (p: number): number =>
    Math.max(0.5, pressureRadius(style, p) * 2 * STAMP_SPACING_RATIO[style.kind]);
  while (travelled <= distance) {
    const t = distance === 0 ? 0 : travelled / distance;
    const px = state.lastX + dx * t;
    const py = state.lastY + dy * t;
    const p = state.lastPressure + (pressure - state.lastPressure) * t;
    const radius = pressureRadius(style, p) * speedFactor;
    drawDab(context, style, px, py, radius, baseAlpha, state.stampIndex);
    state.stampIndex += 1;
    travelled += spacingOf(p);
  }
  state.residual = travelled - distance;
  state.lastX = x;
  state.lastY = y;
  state.lastPressure = pressure;
}

/** 시작점의 단일 dab(탭 도트). */
export function stampStrokeDot(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  x: number,
  y: number,
  pressure: number
): void {
  drawDab(
    context,
    style,
    x,
    y,
    pressureRadius(style, pressure),
    clamp01(style.flow) * clamp01(style.opacity),
    0
  );
}

/**
 * 전체 획 렌더(커밋 경로/재생용) — 증분 워커와 같은 수학·같은 지터 시드를 쓰므로
 * 라이브 오버레이가 그린 픽셀과 동일하다.
 */
export function drawStampStroke(
  context: CanvasRenderingContext2D,
  style: StudioStampBrushStyle,
  points: readonly number[],
  pressures: readonly number[] | undefined
): void {
  const total = Math.floor(points.length / 2);
  if (total === 0) return;
  const pressureAt = (index: number): number => pressures?.[index] ?? 0.5;
  stampStrokeDot(context, style, points[0]!, points[1]!, pressureAt(0));
  if (total === 1) return;
  const state = beginStampWalker(points[0]!, points[1]!, pressureAt(0));
  state.stampIndex = 1; // 시작 dot 이 인덱스 0 을 소비했다 — 증분 경로와 시드를 맞춘다.
  for (let index = 1; index < total; index += 1) {
    walkStampSegment(
      context,
      style,
      state,
      points[index * 2]!,
      points[index * 2 + 1]!,
      pressureAt(index)
    );
  }
}
