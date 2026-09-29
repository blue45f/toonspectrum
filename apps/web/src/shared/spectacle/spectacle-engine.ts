/**
 * 스펙터클 연출 엔진: 눈요기 효과의 실행 수준 결정.
 *
 * 앰비언트 강도 설정을 재사용한다:
 * - intensity "off" → 스펙터클 전부 끔
 * - reduced-motion → 움직임 효과 끔 (정적 그라데이션만 허용)
 * - "vivid" + 고성능 → "full" (모든 연출)
 * - "vivid" + 저전력(모바일 등) → "light" (가벼운 연출만)
 * - "subtle" → "light"
 *
 * 순수 함수 모듈. 컴포넌트는 useSpectacle 훅으로 수준을 구독한다.
 */

import {
  isLowPowerEnvironment,
  prefersReducedMotion,
  readAmbientPreferences,
  type AmbientIntensity,
} from "../ambient/ambient-engine";

/** 스펙터클 실행 수준. */
export type SpectacleLevel = "none" | "light" | "full";

export interface SpectacleLevelInput {
  readonly intensity: AmbientIntensity;
  readonly reducedMotion: boolean;
  readonly lowPower: boolean;
}

/**
 * 현재 환경 → 스펙터클 수준 결정 (순수 함수).
 */
export function resolveSpectacleLevel(input: SpectacleLevelInput): SpectacleLevel {
  if (input.intensity === "off") return "none";
  if (input.reducedMotion) return "none";
  if (input.intensity === "vivid") {
    return input.lowPower ? "light" : "full";
  }
  // subtle
  return "light";
}

/** 현재 브라우저 환경에서 스펙터클 수준을 읽는다. */
export function readSpectacleLevel(): SpectacleLevel {
  return resolveSpectacleLevel({
    intensity: readAmbientPreferences().intensity,
    reducedMotion: prefersReducedMotion(),
    lowPower: isLowPowerEnvironment(),
  });
}

/**
 * 특정 연출이 실행 가능한지.
 * - "motion": 움직임이 있는 연출 (light 이상)
 * - "heavy": 무거운 연출 — 캔버스 파티클·3D 틸트 등 (full 전용)
 */
export function canRunSpectacle(
  level: SpectacleLevel,
  requirement: "motion" | "heavy",
): boolean {
  if (level === "none") return false;
  if (requirement === "heavy") return level === "full";
  return true;
}

/** 스펙터클 강도 변경 이벤트명 (앰비언트와 공유). */
export const SPECTACLE_INTENSITY_EVENT = "toonstudio:ambient-intensity";
