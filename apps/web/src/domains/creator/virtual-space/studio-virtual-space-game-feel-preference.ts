/**
 * 가상 스튜디오 게임필(화면 흔들림·파티클·모션) 설정
 *
 * 이 브라우저에만 저장되는 사용자 설정. OS의 reduced-motion 설정과
 * 연동해 모든 게임필 애니메이션을 자동으로 줄일 수 있다.
 */

/** 파티클 밀도·모션 강도 값 범위. */
export const STUDIO_GAME_FEEL_RANGE = Object.freeze({ min: 0, max: 1 });

export interface StudioVirtualGameFeelPreference {
  readonly version: 1;
  /** 화면 흔들림 on/off. */
  readonly screenShake: boolean;
  /** 파티클 밀도 0~1. */
  readonly particleDensity: number;
  /** 모션 강도 0~1 (스쿼시&스트레치·흔들림·파동 진폭 배율). */
  readonly motionIntensity: number;
  /** OS reduced-motion 설정을 자동으로 따를지. */
  readonly followOsReducedMotion: boolean;
  /** 입력 감도 0.5~1.5 (조이스틱·게임패드·키보드 입력 증폭). */
  readonly inputSensitivity: number;
  /** 가속 배율 0.5~2 (가속도·감속도 스케일). */
  readonly accelerationScale: number;
}

export const STUDIO_VIRTUAL_GAME_FEEL_STORAGE_KEY = "toonspectrum:virtual-space-game-feel:v1";

export const DEFAULT_STUDIO_VIRTUAL_GAME_FEEL: StudioVirtualGameFeelPreference = Object.freeze({
  version: 1,
  screenShake: true,
  particleDensity: 0.8,
  motionIntensity: 1,
  followOsReducedMotion: true,
  inputSensitivity: 1,
  accelerationScale: 1,
});

/** 입력 감도 범위. */
export const STUDIO_GAME_FEEL_SENSITIVITY_RANGE = Object.freeze({ min: 0.5, max: 1.5 });

/** 가속 배율 범위. */
export const STUDIO_GAME_FEEL_ACCELERATION_RANGE = Object.freeze({ min: 0.5, max: 2 });

function clampUnit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function booleanOf(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

export function parseStudioVirtualGameFeelPreference(value: unknown): StudioVirtualGameFeelPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) return null;
  return Object.freeze({
    version: 1,
    screenShake: booleanOf(candidate.screenShake, true),
    particleDensity: clampUnit(candidate.particleDensity, 0.8),
    motionIntensity: clampUnit(candidate.motionIntensity, 1),
    followOsReducedMotion: booleanOf(candidate.followOsReducedMotion, true),
    // 구버전 저장값(필드 없음)과도 호환되도록 기본값으로 채운다.
    inputSensitivity: clampRange(candidate.inputSensitivity, STUDIO_GAME_FEEL_SENSITIVITY_RANGE.min, STUDIO_GAME_FEEL_SENSITIVITY_RANGE.max, 1),
    accelerationScale: clampRange(candidate.accelerationScale, STUDIO_GAME_FEEL_ACCELERATION_RANGE.min, STUDIO_GAME_FEEL_ACCELERATION_RANGE.max, 1),
  });
}

export function readStudioVirtualGameFeelPreference(): StudioVirtualGameFeelPreference {
  if (typeof window === "undefined") return DEFAULT_STUDIO_VIRTUAL_GAME_FEEL;
  try {
    const raw = window.localStorage.getItem(STUDIO_VIRTUAL_GAME_FEEL_STORAGE_KEY);
    return raw
      ? parseStudioVirtualGameFeelPreference(JSON.parse(raw)) ?? DEFAULT_STUDIO_VIRTUAL_GAME_FEEL
      : DEFAULT_STUDIO_VIRTUAL_GAME_FEEL;
  } catch {
    return DEFAULT_STUDIO_VIRTUAL_GAME_FEEL;
  }
}

export function writeStudioVirtualGameFeelPreference(value: StudioVirtualGameFeelPreference): boolean {
  const parsed = parseStudioVirtualGameFeelPreference(value);
  if (!parsed || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_GAME_FEEL_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

/** OS 수준 reduced-motion 설정 여부. */
export function studioOsPrefersReducedMotion(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 실제 적용되는 게임필 값 (설정 + OS reduced-motion 해석 결과). */
export interface StudioEffectiveGameFeel {
  /** 화면 흔들림이 실제로 켜져 있는지. */
  readonly screenShakeEnabled: boolean;
  /** 실제 파티클 밀도 0~1. */
  readonly particleDensity: number;
  /** 실제 모션 강도 0~1. */
  readonly motionIntensity: number;
  /** 애니메이션 로직에 전달할 reducedMotion 플래그. */
  readonly reducedMotion: boolean;
}

/**
 * 설정과 OS reduced-motion을 합쳐 실제 적용 값을 계산한다.
 * followOsReducedMotion이 켜져 있고 OS가 모션 감소를 요구하면
 * 모든 게임필 효과를 끈다.
 */
export function resolveStudioGameFeel(
  preference: StudioVirtualGameFeelPreference,
  osReducedMotion: boolean,
): StudioEffectiveGameFeel {
  const follow = preference.followOsReducedMotion && osReducedMotion;
  return Object.freeze({
    screenShakeEnabled: follow ? false : preference.screenShake,
    particleDensity: follow ? 0 : preference.particleDensity,
    motionIntensity: follow ? 0 : preference.motionIntensity,
    reducedMotion: follow,
  });
}

/** 모션 강도를 애니메이션 진폭 배율로 적용한다. */
export function applyMotionIntensity(value: number, intensity: number): number {
  const safe = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 1;
  return Number.isFinite(value) ? value * safe : 0;
}

export interface StudioVirtualSpaceInputVector {
  readonly x: number;
  readonly y: number;
}

/**
 * 입력 크기 magnitude에 곱할 감도 배율. 방향은 그대로 두고 크기만 바꾸며 결과 크기는 1을 넘지 않는다.
 * 객체를 만들지 않으므로 매 프레임 입력 처리에 쓴다.
 */
export function studioInputSensitivityFactor(magnitude: number, sensitivity: number): number {
  const scale = Number.isFinite(sensitivity)
    ? Math.min(STUDIO_GAME_FEEL_SENSITIVITY_RANGE.max, Math.max(STUDIO_GAME_FEEL_SENSITIVITY_RANGE.min, sensitivity))
    : 1;
  if (!Number.isFinite(magnitude) || magnitude < 0.0001 || scale === 1) return 1;
  return Math.min(1, magnitude * scale) / magnitude;
}

/**
 * 입력 감도를 적용한다.
 * 감도 > 1이면 작은 입력이 증폭되고, 감도 < 1이면 둔해진다.
 * 출력 크기는 1을 넘지 않는다.
 */
export function applyInputSensitivity(
  input: StudioVirtualSpaceInputVector,
  sensitivity: number,
): StudioVirtualSpaceInputVector {
  const x = Number.isFinite(input.x) ? input.x : 0;
  const y = Number.isFinite(input.y) ? input.y : 0;
  // 감도 곡선: 크기만 스케일하고 방향은 유지한다
  const factor = studioInputSensitivityFactor(Math.hypot(x, y), sensitivity);
  return Object.freeze(factor === 1 ? { x, y } : { x: x * factor, y: y * factor });
}

/** 가속 배율(0.5~2로 제한). 물리 설정의 가속도·감속도에 곱한다. */
export function studioAccelerationFactor(accelerationScale: number): number {
  return Number.isFinite(accelerationScale)
    ? Math.min(STUDIO_GAME_FEEL_ACCELERATION_RANGE.max, Math.max(STUDIO_GAME_FEEL_ACCELERATION_RANGE.min, accelerationScale))
    : 1;
}

/** 가속 배율을 물리 설정(가속도·감속도)에 반영한다. */
export function scalePhysicsAcceleration<T extends { readonly acceleration: number; readonly deceleration: number }>(
  config: T,
  accelerationScale: number,
): T {
  const scale = studioAccelerationFactor(accelerationScale);
  if (scale === 1) return config;
  return Object.freeze({
    ...config,
    acceleration: Math.max(0, config.acceleration * scale),
    deceleration: Math.max(0, config.deceleration * scale),
  });
}
