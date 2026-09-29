/**
 * 가상 스튜디오 날씨 UI 문구 (한/영).
 *
 * 작성 원칙: 짧고 명확하게. 기상 용어 대신 일상 언어를 사용한다.
 */

import type { StudioWeatherCondition, StudioWeatherNpcGuidance } from "./studio-virtual-space-weather";

export interface StudioWeatherLabels {
  /** 날씨 위젯 aria-label. */
  widgetLabel(temperatureC: number, condition: StudioWeatherCondition): string;
  /** 날씨 이름. */
  conditionName(condition: StudioWeatherCondition): string;
  /** 날씨 한 줄 설명. */
  conditionDescription(condition: StudioWeatherCondition): string;
  /** 온도 표시 (예: "23°"). */
  temperatureLabel(temperatureC: number): string;
  /** NPC 날씨 대사. */
  npcSpeech(guidance: StudioWeatherNpcGuidance): string;
  /** 로딩 중 문구. */
  loading: string;
  /** 실패 시 문구. */
  unavailable: string;
  /** 수동 새로고침 버튼. */
  refresh: string;
}

const CONDITION_NAMES_KO: Record<StudioWeatherCondition, string> = {
  clear: "맑음",
  cloudy: "흐림",
  fog: "안개",
  rain: "비",
  snow: "눈",
  thunderstorm: "천둥번개",
};

const CONDITION_NAMES_EN: Record<StudioWeatherCondition, string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  fog: "Fog",
  rain: "Rain",
  snow: "Snow",
  thunderstorm: "Thunderstorm",
};

const CONDITION_DESCRIPTIONS_KO: Record<StudioWeatherCondition, string> = {
  clear: "창밖으로 햇살이 들어와요",
  cloudy: "구름이 낀 차분한 날이에요",
  fog: "밖이 안개로 자욱해요",
  rain: "창문에 빗방울이 맺혀요",
  snow: "눈송이가 흩날려요",
  thunderstorm: "가끔 번개가 번쩍여요",
};

const CONDITION_DESCRIPTIONS_EN: Record<StudioWeatherCondition, string> = {
  clear: "Sunlight streams through the windows",
  cloudy: "A calm, overcast day",
  fog: "Thick fog outside",
  rain: "Raindrops on the windows",
  snow: "Snowflakes drifting down",
  thunderstorm: "Lightning flashes now and then",
};

const NPC_SPEECH_KO: Record<StudioWeatherNpcGuidance["speechKey"], string> = {
  "shelter-rain": "비 오니까 안으로 들어갈게요 ☔",
  "shelter-snow": "눈이 오네요, 따뜻한 실내로 가요 ❄️",
  "shelter-storm": "천둥이 치네요! 안전한 실내로 대피해요 ⚡",
  "enjoy-clear": "날씨 좋네요! 잠깐 바람 쐬고 올게요 ☀️",
  "none": "",
};

const NPC_SPEECH_EN: Record<StudioWeatherNpcGuidance["speechKey"], string> = {
  "shelter-rain": "It's raining, heading inside ☔",
  "shelter-snow": "Snowing out there, let's stay warm inside ❄️",
  "shelter-storm": "Thunderstorm! Taking shelter inside ⚡",
  "enjoy-clear": "Beautiful day! Stepping out for some air ☀️",
  "none": "",
};

function makeLabels(ko: boolean): StudioWeatherLabels {
  const names = ko ? CONDITION_NAMES_KO : CONDITION_NAMES_EN;
  const descriptions = ko ? CONDITION_DESCRIPTIONS_KO : CONDITION_DESCRIPTIONS_EN;
  const speech = ko ? NPC_SPEECH_KO : NPC_SPEECH_EN;
  return {
    widgetLabel: (temperatureC, condition) =>
      ko
        ? `현재 날씨: ${names[condition]}, ${Math.round(temperatureC)}도`
        : `Current weather: ${names[condition]}, ${Math.round(temperatureC)}°`,
    conditionName: (condition) => names[condition],
    conditionDescription: (condition) => descriptions[condition],
    temperatureLabel: (temperatureC) => `${Math.round(temperatureC)}°`,
    npcSpeech: (guidance) => speech[guidance.speechKey],
    loading: ko ? "날씨를 불러오는 중…" : "Loading weather…",
    unavailable: ko ? "날씨 정보를 표시할 수 없어요" : "Weather unavailable",
    refresh: ko ? "날씨 새로고침" : "Refresh weather",
  };
}

export const STUDIO_WEATHER_LABELS_KO = makeLabels(true);
export const STUDIO_WEATHER_LABELS_EN = makeLabels(false);

/** 현재 언어에 맞는 라벨을 반환한다. */
export function getStudioWeatherLabels(lang: string): StudioWeatherLabels {
  return lang.startsWith("ko") ? STUDIO_WEATHER_LABELS_KO : STUDIO_WEATHER_LABELS_EN;
}
