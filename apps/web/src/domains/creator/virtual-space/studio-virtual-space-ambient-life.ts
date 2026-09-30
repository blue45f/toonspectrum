/**
 * 가상 스튜디오 환경 생동감 게임필 로직
 *
 * - 바람 세기에 따른 장식 흔들림 (사인파 합성)
 * - 카펫 물결 (위치·시간 기반 파동)
 * - 시간대 연동 그림자 방향/길이
 * - 반딧불이/먼지 떠다니기 (결정적 의사난수 궤적)
 *
 * 순수 로직 모듈. 렌더링은 호출 측에서 담당하며, reducedMotion이면
 * 모든 주기적 움직임을 정지(0 오프셋)시킨다.
 */

/** 바람 흔들림 결과 (px 오프셋). */
export interface WindSwayOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * 바람 세기(0~1)에 따른 장식 흔들림.
 * 세 개의 사인파를 합성해 자연스러운 불규칙함을 만든다.
 * phase는 장식마다 다르게 주어 동기화를 피한다.
 */
export function windSwayOffset(
  timeSeconds: number,
  windStrength: number,
  phase: number,
  reducedMotion: boolean,
): WindSwayOffset {
  if (reducedMotion) return Object.freeze({ x: 0, y: 0 });
  const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const strength = Number.isFinite(windStrength) ? Math.min(1, Math.max(0, windStrength)) : 0;
  const p = Number.isFinite(phase) ? phase : 0;
  if (strength === 0) return Object.freeze({ x: 0, y: 0 });
  const wave =
    Math.sin(t * 1.3 + p) * 0.55
    + Math.sin(t * 2.7 + p * 1.7) * 0.3
    + Math.sin(t * 0.5 + p * 0.3) * 0.15;
  const amplitude = strength * 6;
  return Object.freeze({
    x: wave * amplitude,
    y: Math.abs(wave) * amplitude * -0.25,
  });
}

/** 매달린 장식(모빌·조명)의 흔들림 각도(도). */
export function hangingSwayAngleDegrees(
  timeSeconds: number,
  windStrength: number,
  phase: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const strength = Number.isFinite(windStrength) ? Math.min(1, Math.max(0, windStrength)) : 0;
  const p = Number.isFinite(phase) ? phase : 0;
  return (Math.sin(t * 1.1 + p) * 0.7 + Math.sin(t * 2.3 + p * 2.1) * 0.3) * strength * 9;
}

/**
 * 카펫 물결 값 0~1 (셰이딩 강도용).
 * 위치 기반 파동 + 시간 흐름으로 바람이 카펫을 스치는 느낌을 낸다.
 */
export function carpetRippleValue(
  x: number,
  y: number,
  timeSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const wave = Math.sin(x * 0.045 + t * 1.6) * Math.cos(y * 0.06 - t * 1.1);
  return (wave + 1) / 2;
}

/** 시간대. */
export const STUDIO_DAY_PHASES = ["dawn", "day", "dusk", "night"] as const;

export type StudioDayPhase = typeof STUDIO_DAY_PHASES[number];

/** 시각(0~24)에서 시간대를 구한다. */
export function dayPhaseForHour(hour24: number): StudioDayPhase {
  const hour = Number.isFinite(hour24) ? ((hour24 % 24) + 24) % 24 : 12;
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

/** 그림자 정보. */
export interface StudioShadowInfo {
  /** 그림자가 뻗는 방향(도, 0=동쪽). */
  readonly angleDegrees: number;
  /** 그림자 길이 계수 (캐릭터 키 대비). */
  readonly lengthFactor: number;
  /** 그림자 불투명도 0~1 (밤에는 희미). */
  readonly opacity: number;
}

/**
 * 시간대 연동 그림자.
 * - 해가 낮을수록(아침/저녁) 그림자가 길고, 정오에 가장 짧다.
 * - 그림자는 태양 반대 방향으로 뻗는다.
 * - 밤에는 달빛 그림자(짧고 희미).
 */
export function shadowForHour(hour24: number): StudioShadowInfo {
  const hour = Number.isFinite(hour24) ? ((hour24 % 24) + 24) % 24 : 12;
  const phase = dayPhaseForHour(hour);
  if (phase === "night") {
    return Object.freeze({ angleDegrees: 200, lengthFactor: 0.7, opacity: 0.25 });
  }
  // 태양 고도: 6시 0 → 12시 1 → 18시 0 (사인 곡선)
  const elevation = Math.sin(((hour - 6) / 12) * Math.PI);
  // 태양 방위각: 동(90°) → 남(180°) → 서(270°)
  const sunAzimuth = 90 + ((hour - 6) / 12) * 180;
  const shadowAngle = (sunAzimuth + 180) % 360;
  const lengthFactor = 2.6 - elevation * 2.1;
  return Object.freeze({
    angleDegrees: shadowAngle,
    lengthFactor: Math.min(2.6, Math.max(0.5, lengthFactor)),
    opacity: 0.35,
  });
}

/** 떠다니는 입자 종류. */
export const STUDIO_FLOATER_KINDS = ["firefly", "dust"] as const;

export type StudioFloaterKind = typeof STUDIO_FLOATER_KINDS[number];

/** 떠다니는 입자 하나. */
export interface StudioFloater {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** 크기(px). */
  readonly size: number;
  /** 밝기 맥동 0~1. */
  readonly glow: number;
}

/** 결정적 의사난수 (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 입자 밀도 설정(0~1)에 따른 입자 개수. */
export function floaterCount(kind: StudioFloaterKind, density: number): number {
  const safe = Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0;
  const max = kind === "firefly" ? 24 : 60;
  return Math.round(max * safe);
}

/**
 * 반딧불이/먼지 떠다니기.
 * 시드 기반 결정적 궤적(리사주 + 표류)으로 매 프레임 같은 입자가
 * 부드럽게 움직인다. 반딧불이는 밤에만 보인다(glow>0).
 */
export function ambientFloaters(input: {
  readonly kind: StudioFloaterKind;
  readonly count: number;
  readonly timeSeconds: number;
  readonly bounds: { readonly width: number; readonly height: number };
  readonly night: boolean;
  readonly seed?: number;
  readonly reducedMotion: boolean;
}): readonly StudioFloater[] {
  const count = Number.isInteger(input.count) ? Math.max(0, Math.min(200, input.count)) : 0;
  if (count === 0) return Object.freeze([]);
  const t = Number.isFinite(input.timeSeconds) ? input.timeSeconds : 0;
  const width = Math.max(1, input.bounds.width);
  const height = Math.max(1, input.bounds.height);
  const random = seededRandom(input.seed ?? 7);
  const floaters: StudioFloater[] = [];
  for (let id = 0; id < count; id += 1) {
    const baseX = random() * width;
    const baseY = random() * height;
    const speed = 0.15 + random() * 0.35;
    const ampX = 24 + random() * 48;
    const ampY = 16 + random() * 32;
    const phase = random() * Math.PI * 2;
    const drift = input.reducedMotion ? 0 : t * speed;
    const x = (baseX + Math.sin(drift + phase) * ampX + width) % width;
    const y = (baseY + Math.cos(drift * 0.8 + phase * 1.3) * ampY + height) % height;
    const size = input.kind === "firefly" ? 2 + random() * 2 : 1 + random() * 1.5;
    const glow = input.kind === "firefly"
      ? (input.night && !input.reducedMotion ? 0.4 + 0.6 * Math.abs(Math.sin(drift * 2 + phase)) : 0)
      : 0.25;
    floaters.push(Object.freeze({ id, x, y, size, glow }));
  }
  return Object.freeze(floaters);
}
