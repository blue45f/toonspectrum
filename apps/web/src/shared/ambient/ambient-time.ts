/**
 * 시간대·계절 판정 순수 로직.
 *
 * 배경 효과 선택(맑은 낮의 햇살·맑은 밤의 별, 날씨를 모를 때의 계절 효과)과
 * 설정 화면의 상태 문구에 쓴다. 화면 색을 바꾸는 틴트는 두지 않는다.
 *
 * DOM 의존성 없음. 테스트를 위해 Date를 주입받는다.
 */

/** 하루 시간대 5단계 (로컬 시간 기준). */
export type AmbientTimePhase = "dawn" | "morning" | "day" | "evening" | "night";

/** 계절 4종 (북반구 월 기준). */
export type AmbientSeason = "spring" | "summer" | "autumn" | "winter";

export const AMBIENT_TIME_PHASES: readonly AmbientTimePhase[] = [
  "dawn",
  "morning",
  "day",
  "evening",
  "night",
];

export const AMBIENT_SEASONS: readonly AmbientSeason[] = ["spring", "summer", "autumn", "winter"];

/**
 * 시각(0~23시) → 시간대.
 * 경계: 5시 새벽, 7시 아침, 11시 낮, 16시 저녁, 19시 밤.
 */
export function phaseForHour(hour: number): AmbientTimePhase {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "day";
  if (h >= 16 && h < 19) return "evening";
  return "night";
}

export function phaseForDate(date: Date): AmbientTimePhase {
  return phaseForHour(date.getHours());
}

/** 월(1~12) → 계절. */
export function seasonForMonth(month: number): AmbientSeason {
  const m = ((((Math.round(month) - 1) % 12) + 12) % 12) + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

export function seasonForDate(date: Date): AmbientSeason {
  return seasonForMonth(date.getMonth() + 1);
}

/** 해가 떠 있는 시간대인지. 맑은 날씨를 햇살(낮)로 그릴지 별(밤)로 그릴지 정한다. */
export function isDaylightPhase(phase: AmbientTimePhase): boolean {
  return phase !== "night";
}
