/**
 * 앰비언트 배경 효과 엔진: 어떤 장면을 그릴지 정하는 규칙을 한곳에 모은다.
 *
 * - 강도: off면 아무것도 그리지 않는다. subtle(기본)은 희박하게, vivid는 풍성하게.
 * - 효과 선택: 자동이면 실제 날씨 → (날씨를 모르면) 계절 순서로 고르고, 직접 고르면 그대로 쓴다.
 * - 화면 전체 색을 바꾸는 틴트는 없다. 모든 효과는 콘텐츠 뒤 배경 캔버스에만 그린다.
 *
 * reduced-motion·고대비·경로별 끄기는 호스트가 판단한다(이 모듈은 순수 함수).
 */

import {
  type AmbientEffectChoice,
  type AmbientIntensity,
} from "./ambient-preferences";
import {
  isDaylightPhase,
  phaseForDate,
  seasonForDate,
  type AmbientSeason,
  type AmbientTimePhase,
} from "./ambient-time";
import type { AmbientWeatherCondition } from "./ambient-weather";

// 스펙터클 연출(shared/spectacle)이 이 경로에서 가져다 쓰므로 설정 API를 함께 내보낸다.
export {
  AMBIENT_DEFAULT_INTENSITY,
  AMBIENT_INTENSITIES,
  readAmbientPreferences,
  writeAmbientIntensity,
  type AmbientIntensity,
  type AmbientPreferences,
} from "./ambient-preferences";

/** prefers-reduced-motion 감지. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 저사양 환경 감지(모바일·데이터 절약·코어 4개 이하). 효과 밀도를 절반으로 줄인다. */
export function isLowPowerEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const saveData = connection?.saveData === true;
  const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 8;
  return isMobile || saveData || cores <= 4;
}

/* ------------------------------------------------------------------ */
/* 장면 결정 (순수 함수)                                                */
/* ------------------------------------------------------------------ */

/**
 * 배경에 그릴 장면 종류.
 * - sunny: 맑은 낮(상단 모서리 햇살 줄기 + 떠다니는 빛 알갱이)
 * - clear-night: 맑은 밤(반짝이는 별 + 반딧불 소량)
 * - cloudy: 흐림·안개(상단에 천천히 흐르는 구름 실루엣, 화면 전체를 덮는 막은 없다)
 * - rain / thunderstorm(비 + 드문 약한 번쩍임) / snow
 * - petals(봄 벚꽃) / leaves(가을 낙엽) / fireflies(여름 밤 반딧불)
 */
export type AmbientSceneKind =
  | "sunny"
  | "clear-night"
  | "cloudy"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "petals"
  | "leaves"
  | "fireflies";

export const AMBIENT_SCENE_KINDS: readonly AmbientSceneKind[] = [
  "sunny",
  "clear-night",
  "cloudy",
  "rain",
  "thunderstorm",
  "snow",
  "petals",
  "leaves",
  "fireflies",
];

/** 장면을 고른 근거. 설정 화면 상태 문구에 쓴다. */
export type AmbientSceneSource = "weather" | "season" | "manual";

export interface AmbientSceneInput {
  readonly intensity: AmbientIntensity;
  readonly effect: AmbientEffectChoice;
  /** 실제 날씨. 모르면(불러오는 중·실패) null → 계절 효과로 대체한다. */
  readonly weather: AmbientWeatherCondition | null;
  readonly date: Date;
}

export interface AmbientScene {
  readonly kind: AmbientSceneKind;
  /** vivid 자동 모드에서 맑음·흐림에 곁들이는 계절 효과. */
  readonly accent: AmbientSceneKind | null;
  readonly intensity: Exclude<AmbientIntensity, "off">;
  readonly source: AmbientSceneSource;
  readonly timePhase: AmbientTimePhase;
  readonly season: AmbientSeason;
}

/** 맑은 하늘: 해가 있으면 햇살, 밤이면 별. */
function clearSkyScene(phase: AmbientTimePhase): AmbientSceneKind {
  return isDaylightPhase(phase) ? "sunny" : "clear-night";
}

function manualSceneKind(
  effect: Exclude<AmbientEffectChoice, "auto">,
  phase: AmbientTimePhase,
): AmbientSceneKind {
  switch (effect) {
    case "clear":
      return clearSkyScene(phase);
    case "rain":
      return "rain";
    case "snow":
      return "snow";
    case "petals":
      return "petals";
    case "leaves":
      return "leaves";
    case "fireflies":
      return "fireflies";
  }
}

function weatherSceneKind(weather: AmbientWeatherCondition, phase: AmbientTimePhase): AmbientSceneKind {
  switch (weather) {
    case "clear":
      return clearSkyScene(phase);
    case "cloudy":
    case "fog":
      // 안개도 화면을 뿌옇게 덮지 않고 구름 실루엣으로 표현한다.
      return "cloudy";
    case "rain":
      return "rain";
    case "thunderstorm":
      return "thunderstorm";
    case "snow":
      return "snow";
  }
}

/** 날씨를 모를 때 쓰는 계절 효과. */
function seasonalSceneKind(season: AmbientSeason, phase: AmbientTimePhase): AmbientSceneKind {
  switch (season) {
    case "spring":
      return "petals";
    case "summer":
      return phase === "night" ? "fireflies" : "sunny";
    case "autumn":
      return "leaves";
    case "winter":
      return "snow";
  }
}

/**
 * vivid 자동 모드의 계절 보조 효과.
 * 맑음·흐림에만 곁들이고(비·눈과 섞지 않는다), 주 효과와 겹치거나 어색한 조합(맑은 날 눈)은 뺀다.
 */
function seasonalAccent(
  kind: AmbientSceneKind,
  season: AmbientSeason,
  phase: AmbientTimePhase,
): AmbientSceneKind | null {
  if (kind !== "sunny" && kind !== "clear-night" && kind !== "cloudy") return null;
  const accent = seasonalSceneKind(season, phase);
  if (accent === "sunny" || accent === "snow") return null;
  // 맑은 밤 장면에는 이미 반딧불이 조금 있다.
  if (accent === "fireflies" && kind === "clear-night") return null;
  return accent;
}

/**
 * 현재 설정과 날씨·시각으로 장면을 정한다. 강도가 off면 null.
 *
 * 우선순위: 직접 고른 효과 > 실제 날씨 > 계절.
 */
export function resolveAmbientScene(input: AmbientSceneInput): AmbientScene | null {
  if (input.intensity === "off") return null;
  const timePhase = phaseForDate(input.date);
  const season = seasonForDate(input.date);
  const base = { intensity: input.intensity, timePhase, season };

  if (input.effect !== "auto") {
    return { ...base, kind: manualSceneKind(input.effect, timePhase), accent: null, source: "manual" };
  }
  if (input.weather) {
    const kind = weatherSceneKind(input.weather, timePhase);
    const accent = input.intensity === "vivid" ? seasonalAccent(kind, season, timePhase) : null;
    return { ...base, kind, accent, source: "weather" };
  }
  return { ...base, kind: seasonalSceneKind(season, timePhase), accent: null, source: "season" };
}
