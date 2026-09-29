/**
 * 앰비언트 연출 UI 문구 (한/영).
 */

import type {
  AmbientIntensity,
  AmbientSeason,
  AmbientTimePhase,
} from "./ambient-engine";
import type { AmbientWeatherCondition } from "./ambient-weather";

export interface AmbientLabels {
  readonly settingsTitle: string;
  readonly settingsDescription: string;
  readonly intensityLabel: string;
  readonly intensityHint: string;
  intensityName(intensity: AmbientIntensity): string;
  intensityDescription(intensity: AmbientIntensity): string;
  timePhaseName(phase: AmbientTimePhase): string;
  seasonName(season: AmbientSeason): string;
  weatherName(condition: AmbientWeatherCondition): string;
  readonly nowPlaying: string;
  readonly reducedMotionNote: string;
  readonly previewNote: string;
}

const INTENSITY_NAMES_KO: Record<AmbientIntensity, string> = {
  off: "끔",
  subtle: "은은하게",
  vivid: "화려하게",
};

const INTENSITY_NAMES_EN: Record<AmbientIntensity, string> = {
  off: "Off",
  subtle: "Subtle",
  vivid: "Vivid",
};

const INTENSITY_DESCRIPTIONS_KO: Record<AmbientIntensity, string> = {
  off: "모든 연출 효과를 끕니다",
  subtle: "시간대 분위기와 가벼운 날씨 효과만 표시합니다",
  vivid: "날씨·계절 파티클과 화려한 연출을 모두 표시합니다",
};

const INTENSITY_DESCRIPTIONS_EN: Record<AmbientIntensity, string> = {
  off: "Turn off all ambient effects",
  subtle: "Show time-of-day mood and light weather effects",
  vivid: "Show full weather and seasonal particles",
};

const PHASE_NAMES_KO: Record<AmbientTimePhase, string> = {
  dawn: "새벽",
  morning: "아침",
  day: "낮",
  evening: "저녁",
  night: "밤",
};

const PHASE_NAMES_EN: Record<AmbientTimePhase, string> = {
  dawn: "Dawn",
  morning: "Morning",
  day: "Day",
  evening: "Evening",
  night: "Night",
};

const SEASON_NAMES_KO: Record<AmbientSeason, string> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};

const SEASON_NAMES_EN: Record<AmbientSeason, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

const WEATHER_NAMES_KO: Record<AmbientWeatherCondition, string> = {
  clear: "맑음",
  cloudy: "흐림",
  fog: "안개",
  rain: "비",
  snow: "눈",
  thunderstorm: "천둥번개",
};

const WEATHER_NAMES_EN: Record<AmbientWeatherCondition, string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  fog: "Fog",
  rain: "Rain",
  snow: "Snow",
  thunderstorm: "Thunderstorm",
};

function makeLabels(ko: boolean): AmbientLabels {
  return {
    settingsTitle: ko ? "화면 연출" : "Ambient effects",
    settingsDescription: ko
      ? "날씨·시간·계절에 따라 화면 분위기가 바뀝니다."
      : "The screen mood follows the weather, time, and season.",
    intensityLabel: ko ? "연출 강도" : "Effect intensity",
    intensityHint: ko
      ? "연출이 부담스러우면 은은하게나 끔으로 조절하세요."
      : "Turn it down if the effects feel distracting.",
    intensityName: (intensity) => (ko ? INTENSITY_NAMES_KO[intensity] : INTENSITY_NAMES_EN[intensity]),
    intensityDescription: (intensity) =>
      ko ? INTENSITY_DESCRIPTIONS_KO[intensity] : INTENSITY_DESCRIPTIONS_EN[intensity],
    timePhaseName: (phase) => (ko ? PHASE_NAMES_KO[phase] : PHASE_NAMES_EN[phase]),
    seasonName: (season) => (ko ? SEASON_NAMES_KO[season] : SEASON_NAMES_EN[season]),
    weatherName: (condition) => (ko ? WEATHER_NAMES_KO[condition] : WEATHER_NAMES_EN[condition]),
    nowPlaying: ko ? "지금 분위기" : "Current mood",
    reducedMotionNote: ko
      ? "움직임 줄이기 설정이 켜져 있어 파티클은 표시되지 않습니다."
      : "Particles are hidden while reduced motion is on.",
    previewNote: ko
      ? "실제 날씨를 불러오는 중에는 기본 분위기가 표시됩니다."
      : "A default mood shows while the live weather loads.",
  };
}

export const AMBIENT_LABELS_KO = makeLabels(true);
export const AMBIENT_LABELS_EN = makeLabels(false);

/** 현재 언어에 맞는 라벨을 반환한다. */
export function getAmbientLabels(lang: string): AmbientLabels {
  return lang.startsWith("ko") ? AMBIENT_LABELS_KO : AMBIENT_LABELS_EN;
}
