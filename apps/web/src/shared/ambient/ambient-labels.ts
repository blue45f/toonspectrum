/**
 * 날씨·계절 배경 UI 문구 (한/영).
 */

import type { AmbientSceneKind, AmbientSceneSource } from "./ambient-engine";
import type { AmbientEffectChoice, AmbientIntensity } from "./ambient-preferences";
import type { AmbientSeason, AmbientTimePhase } from "./ambient-time";
import type { AmbientLocationSource, AmbientWeatherCondition } from "./ambient-weather";

/** 상태 한 줄에 필요한 값. weather가 null이면 loading 여부로 문구를 고른다. */
export interface AmbientStatusParts {
  readonly location: AmbientLocationSource;
  readonly weather: AmbientWeatherCondition | null;
  readonly weatherLoading: boolean;
  readonly season: AmbientSeason;
  readonly timePhase: AmbientTimePhase;
}

/** 지금 보이는 배경 효과 한 줄에 필요한 값. */
export interface AmbientBackdropParts {
  readonly kind: AmbientSceneKind;
  readonly accent: AmbientSceneKind | null;
  readonly source: AmbientSceneSource;
}

export interface AmbientLabels {
  readonly settingsTitle: string;
  readonly settingsDescription: string;
  readonly previewLabel: string;
  readonly previewOff: string;
  readonly previewLoading: string;
  readonly previewStill: string;
  readonly intensityLabel: string;
  readonly intensityHint: string;
  intensityName(intensity: AmbientIntensity): string;
  intensityDescription(intensity: AmbientIntensity): string;
  readonly effectLabel: string;
  readonly effectHint: string;
  readonly effectOffHint: string;
  effectName(effect: AmbientEffectChoice): string;
  effectDescription(effect: AmbientEffectChoice): string;
  sceneName(kind: AmbientSceneKind): string;
  readonly locationLabel: string;
  readonly locationDescription: string;
  readonly locationUnavailable: string;
  readonly locationFallback: string;
  readonly statusLabel: string;
  statusLine(parts: AmbientStatusParts): string;
  /** 지금 보이는 배경 효과. parts가 null이면 꺼짐, pending이면 날씨를 기다리는 중. */
  backdropLine(parts: AmbientBackdropParts | null, pending?: boolean): string;
  timePhaseName(phase: AmbientTimePhase): string;
  seasonName(season: AmbientSeason): string;
  weatherName(condition: AmbientWeatherCondition): string;
  readonly reducedMotionNote: string;
  readonly highContrastNote: string;
  readonly routeNote: string;
}

interface Bilingual {
  readonly ko: string;
  readonly en: string;
}

const INTENSITY_NAMES: Record<AmbientIntensity, Bilingual> = {
  off: { ko: "끔", en: "Off" },
  subtle: { ko: "은은하게", en: "Subtle" },
  vivid: { ko: "화려하게", en: "Vivid" },
};

const INTENSITY_DESCRIPTIONS: Record<AmbientIntensity, Bilingual> = {
  off: { ko: "배경 효과를 모두 꺼요", en: "Turn every background effect off" },
  subtle: { ko: "효과를 드문드문 보여 줘요 (기본)", en: "Sparse effects (default)" },
  vivid: { ko: "더 풍성하게, 계절 효과도 곁들여요", en: "Richer, with a seasonal accent" },
};

const EFFECT_NAMES: Record<AmbientEffectChoice, Bilingual> = {
  auto: { ko: "자동", en: "Auto" },
  clear: { ko: "맑음", en: "Clear" },
  rain: { ko: "비", en: "Rain" },
  snow: { ko: "눈", en: "Snow" },
  petals: { ko: "벚꽃", en: "Petals" },
  leaves: { ko: "낙엽", en: "Leaves" },
  fireflies: { ko: "반딧불", en: "Fireflies" },
};

const EFFECT_DESCRIPTIONS: Record<AmbientEffectChoice, Bilingual> = {
  auto: { ko: "실제 날씨·계절", en: "Live weather & season" },
  clear: { ko: "낮엔 햇살, 밤엔 별", en: "Sunbeams by day, stars by night" },
  rain: { ko: "사선 빗줄기", en: "Slanted rain" },
  snow: { ko: "흔들리며 내리는 눈", en: "Drifting snow" },
  petals: { ko: "흩날리는 벚꽃잎", en: "Falling blossoms" },
  leaves: { ko: "팔랑이는 낙엽", en: "Tumbling leaves" },
  fireflies: { ko: "떠다니는 반딧불", en: "Floating fireflies" },
};

const SCENE_NAMES: Record<AmbientSceneKind, Bilingual> = {
  sunny: { ko: "햇살", en: "Sunbeams" },
  "clear-night": { ko: "별빛", en: "Starlight" },
  cloudy: { ko: "구름", en: "Clouds" },
  rain: { ko: "비", en: "Rain" },
  thunderstorm: { ko: "뇌우", en: "Thunderstorm" },
  snow: { ko: "눈", en: "Snow" },
  petals: { ko: "벚꽃", en: "Petals" },
  leaves: { ko: "낙엽", en: "Leaves" },
  fireflies: { ko: "반딧불", en: "Fireflies" },
};

const SOURCE_NAMES: Record<AmbientSceneSource, Bilingual> = {
  weather: { ko: "실제 날씨", en: "live weather" },
  season: { ko: "계절", en: "season" },
  manual: { ko: "직접 선택", en: "your pick" },
};

const PHASE_NAMES: Record<AmbientTimePhase, Bilingual> = {
  dawn: { ko: "새벽", en: "dawn" },
  morning: { ko: "아침", en: "morning" },
  day: { ko: "낮", en: "day" },
  evening: { ko: "저녁", en: "evening" },
  night: { ko: "밤", en: "night" },
};

const SEASON_NAMES: Record<AmbientSeason, Bilingual> = {
  spring: { ko: "봄", en: "Spring" },
  summer: { ko: "여름", en: "Summer" },
  autumn: { ko: "가을", en: "Autumn" },
  winter: { ko: "겨울", en: "Winter" },
};

const WEATHER_NAMES: Record<AmbientWeatherCondition, Bilingual> = {
  clear: { ko: "맑음", en: "Clear" },
  cloudy: { ko: "흐림", en: "Cloudy" },
  fog: { ko: "안개", en: "Fog" },
  rain: { ko: "비", en: "Rain" },
  snow: { ko: "눈", en: "Snow" },
  thunderstorm: { ko: "뇌우", en: "Thunderstorm" },
};

const LOCATION_NAMES: Record<AmbientLocationSource, Bilingual> = {
  default: { ko: "서울", en: "Seoul" },
  device: { ko: "내 위치", en: "My location" },
};

function makeLabels(ko: boolean): AmbientLabels {
  const text = (value: Bilingual) => (ko ? value.ko : value.en);
  return {
    settingsTitle: ko ? "날씨·계절 배경" : "Weather backdrop",
    settingsDescription: ko
      ? "비·눈·햇살·벚꽃 같은 효과가 글자와 카드 뒤 배경에만 은은하게 흘러요."
      : "Rain, snow, sunbeams or petals drift quietly behind text and cards.",
    previewLabel: ko ? "미리보기" : "Preview",
    previewOff: ko ? "배경 효과가 꺼져 있어요" : "Background effects are off",
    previewLoading: ko ? "날씨를 불러오는 중…" : "Loading the weather…",
    previewStill: ko ? "멈춘 장면" : "Still frame",
    intensityLabel: ko ? "연출 강도" : "Intensity",
    intensityHint: ko
      ? "은은하게는 드문드문, 화려하게는 풍성하게 보여 줘요."
      : "Subtle keeps effects sparse; vivid makes them richer.",
    intensityName: (intensity) => text(INTENSITY_NAMES[intensity]),
    intensityDescription: (intensity) => text(INTENSITY_DESCRIPTIONS[intensity]),
    effectLabel: ko ? "효과" : "Effect",
    effectHint: ko ? "고르면 배경과 미리보기에 바로 적용돼요." : "Your pick applies to the backdrop and preview right away.",
    effectOffHint: ko ? "연출 강도를 켜면 효과를 고를 수 있어요." : "Turn the intensity on to pick an effect.",
    effectName: (effect) => text(EFFECT_NAMES[effect]),
    effectDescription: (effect) => text(EFFECT_DESCRIPTIONS[effect]),
    sceneName: (kind) => text(SCENE_NAMES[kind]),
    locationLabel: ko ? "내 위치 날씨 사용" : "Use my location's weather",
    locationDescription: ko
      ? "켜면 브라우저가 위치 권한을 물어요. 좌표는 약 1km 단위로 줄여 날씨 조회에만 쓰고 저장하지 않아요. 끄면 서울 날씨를 써요."
      : "Your browser will ask for location access. Coordinates are rounded to about 1 km, used only for the weather lookup and never stored. When off, Seoul's weather is used.",
    locationUnavailable: ko
      ? "이 브라우저나 사이트 설정에서는 위치를 쓸 수 없어 서울 날씨를 사용해요."
      : "Location isn't available here, so Seoul's weather is used.",
    locationFallback: ko
      ? "위치를 확인하지 못해 서울 날씨를 사용해요. 브라우저에서 위치 권한을 허용한 뒤 다시 켜 주세요."
      : "Couldn't get your location, so Seoul's weather is used. Allow location access in your browser, then turn this on again.",
    statusLabel: ko ? "지금 상태" : "Right now",
    statusLine: (parts) => {
      const weather = parts.weather
        ? text(WEATHER_NAMES[parts.weather])
        : parts.weatherLoading
          ? (ko ? "날씨 확인 중" : "Checking weather")
          : (ko ? "날씨 정보 없음" : "Weather unavailable");
      const moment = `${text(SEASON_NAMES[parts.season])} ${text(PHASE_NAMES[parts.timePhase])}`;
      return `${text(LOCATION_NAMES[parts.location])} · ${weather} · ${moment}`;
    },
    backdropLine: (parts, pending = false) => {
      if (pending) return ko ? "배경: 날씨를 확인한 뒤 표시해요" : "Backdrop: shown once the weather loads";
      if (!parts) return ko ? "배경 효과 꺼짐" : "Backdrop off";
      const names = [parts.kind, parts.accent]
        .filter((kind): kind is AmbientSceneKind => kind !== null)
        .map((kind) => text(SCENE_NAMES[kind]))
        .join(" + ");
      return ko
        ? `배경: ${names} (${text(SOURCE_NAMES[parts.source])})`
        : `Backdrop: ${names} (${text(SOURCE_NAMES[parts.source])})`;
    },
    timePhaseName: (phase) => text(PHASE_NAMES[phase]),
    seasonName: (season) => text(SEASON_NAMES[season]),
    weatherName: (condition) => text(WEATHER_NAMES[condition]),
    reducedMotionNote: ko
      ? "움직임 줄이기 설정이 켜져 있어 사이트 배경에는 효과를 표시하지 않아요. 미리보기는 멈춘 장면으로 보여 드려요."
      : "Reduced motion is on, so the site background stays effect-free. The preview shows a still frame.",
    highContrastNote: ko
      ? "고대비 화면에서는 배경 효과를 표시하지 않아요."
      : "Background effects are hidden in high-contrast mode.",
    routeNote: ko
      ? "스튜디오 편집기·3D 도구·제작 보드·발표·영상·관리자 화면에서는 자동으로 꺼져요."
      : "Automatically off in the Studio editor, 3D tools, production boards, presentations, videos and admin.",
  };
}

export const AMBIENT_LABELS_KO = makeLabels(true);
export const AMBIENT_LABELS_EN = makeLabels(false);

/** 현재 언어에 맞는 라벨을 반환한다. */
export function getAmbientLabels(lang: string): AmbientLabels {
  return lang.startsWith("ko") ? AMBIENT_LABELS_KO : AMBIENT_LABELS_EN;
}
