/**
 * 시간대·계절 감지 순수 로직.
 *
 * 사이트 전체 앰비언트 연출의 시간 축을 담당한다.
 * - 시간대: 새벽/아침/낮/저녁/밤 5단계 (로컬 시간 기준)
 * - 계절: 월 기반 4계절 (북반구)
 * - 각 시간대별 색온도 틴트 프로필 (CSS 변수로 적용)
 *
 * DOM 의존성 없음. 테스트 용이성을 위해 Date 주입 가능.
 */

/** 하루 시간대 5단계. */
export type AmbientTimePhase = "dawn" | "morning" | "day" | "evening" | "night";

/** 계절 4종. */
export type AmbientSeason = "spring" | "summer" | "autumn" | "winter";

/** 계절 파티클 종류. */
export type AmbientSeasonParticle = "petal" | "firefly" | "leaf" | "snowflake" | "none";

export const AMBIENT_TIME_PHASES: readonly AmbientTimePhase[] = [
  "dawn",
  "morning",
  "day",
  "evening",
  "night",
] as const;

export const AMBIENT_SEASONS: readonly AmbientSeason[] = [
  "spring",
  "summer",
  "autumn",
  "winter",
] as const;

/** 시간대별 색온도 틴트 프로필. */
export interface AmbientTintProfile {
  readonly phase: AmbientTimePhase;
  /** 오버레이 틴트 색상. */
  readonly tintColor: string;
  /** 틴트 불투명도 0~1 (subtle 기준). */
  readonly tintOpacity: number;
  /** 그라디언트 오버레이 (위 → 아래), 은은한 분위기용. */
  readonly gradient: readonly [string, string];
  readonly gradientOpacity: number;
  /** 어두운 시간대인지 (텍스트 대비 조정 힌트). */
  readonly isDark: boolean;
}

const TINT_PROFILES: Record<AmbientTimePhase, AmbientTintProfile> = {
  dawn: {
    phase: "dawn",
    tintColor: "#ffb88c",
    tintOpacity: 0.10,
    gradient: ["rgba(255, 183, 140, 0.12)", "rgba(255, 214, 235, 0.06)"],
    gradientOpacity: 1,
    isDark: false,
  },
  morning: {
    phase: "morning",
    tintColor: "#fff3d6",
    tintOpacity: 0.06,
    gradient: ["rgba(255, 243, 214, 0.10)", "rgba(255, 255, 255, 0)"],
    gradientOpacity: 1,
    isDark: false,
  },
  day: {
    phase: "day",
    tintColor: "#ffffff",
    tintOpacity: 0.0,
    gradient: ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0)"],
    gradientOpacity: 0,
    isDark: false,
  },
  evening: {
    phase: "evening",
    tintColor: "#ff9a5c",
    tintOpacity: 0.12,
    gradient: ["rgba(255, 154, 92, 0.14)", "rgba(178, 102, 178, 0.08)"],
    gradientOpacity: 1,
    isDark: false,
  },
  night: {
    phase: "night",
    tintColor: "#2b3a67",
    tintOpacity: 0.16,
    gradient: ["rgba(27, 38, 84, 0.20)", "rgba(12, 16, 38, 0.28)"],
    gradientOpacity: 1,
    isDark: true,
  },
};

/**
 * 시각(0~23시) → 시간대.
 * 경계: 5시 새벽 시작, 7시 아침, 11시 낮, 16시 저녁, 19시 밤.
 */
export function phaseForHour(hour: number): AmbientTimePhase {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}

/** Date → 시간대. */
export function phaseForDate(date: Date): AmbientTimePhase {
  return phaseForHour(date.getHours());
}

/** 월(1~12) → 계절 (북반구). */
export function seasonForMonth(month: number): AmbientSeason {
  const m = ((Math.round(month) - 1) % 12 + 12) % 12 + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

/** Date → 계절. */
export function seasonForDate(date: Date): AmbientSeason {
  return seasonForMonth(date.getMonth() + 1);
}

/** 시간대의 틴트 프로필을 반환한다. */
export function tintProfileForPhase(phase: AmbientTimePhase): AmbientTintProfile {
  return TINT_PROFILES[phase];
}

/** 계절별 파티클 종류. 여름 반딧불이는 밤에만. */
export function seasonParticleFor(season: AmbientSeason, phase: AmbientTimePhase): AmbientSeasonParticle {
  switch (season) {
    case "spring":
      return "petal";
    case "summer":
      return phase === "night" ? "firefly" : "none";
    case "autumn":
      return "leaf";
    case "winter":
      return "snowflake";
  }
}

/** 다음 시간대 전환까지 남은 분 (스케줄링용). */
export function minutesUntilPhaseChange(date: Date): number {
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const boundariesMinutes = [5, 7, 11, 16, 19].map((h) => h * 60);
  for (const target of boundariesMinutes) {
    if (target > nowMinutes) return target - nowMinutes;
  }
  // 19시 이후 → 다음날 5시
  return 24 * 60 - nowMinutes + 5 * 60;
}
