import type {
  StudioVirtualSpacePoint,
  StudioVirtualSpaceZone,
} from "./studio-virtual-space-model";
import type { StudioWeatherCondition } from "./studio-virtual-space-weather";

/**
 * 공간 지도 메뉴 카드 아트 데이터
 *
 * 각 가상 스튜디오 공간을 이미지처럼 보이게 만드는 카드 비주얼 테마.
 * 사진 에셋 대신 CSS 그라데이션 + 인라인 SVG 장면 일러스트로 표현한다
 * (에셋 의존 없이 가볍고, 다크/라이트·날씨 오버레이와 자연스럽게 섞인다).
 *
 * 순수 데이터 모듈. 실제 SVG 렌더링은 StudioSpaceMapMenu.tsx가 담당한다.
 */

/** 카드 일러스트 장면 종류 (공간 분위기별 1:1 매핑). */
export type StudioSpaceMapScene =
  | "archive"
  | "gallery"
  | "control"
  | "release"
  | "lab"
  | "easel"
  | "theater"
  | "quality"
  | "commons"
  | "cafe"
  | "plaza"
  | "meeting"
  | "desk"
  | "lobby";

export interface StudioSpaceMapArt {
  readonly scene: StudioSpaceMapScene;
  /** 카드 배경 그라데이션 (위 → 중간 → 아래). */
  readonly gradient: readonly [string, string, string];
  /** 포인트 컬러 (뱃지·글로우·SVG 강조). */
  readonly accent: string;
}

/**
 * 내장 14개 공간의 카드 아트.
 * 그라데이션은 "시간대 있는 풍경"처럼 보이도록 위(하늘)→아래(바닥) 흐름으로 잡았다.
 */
export const STUDIO_SPACE_MAP_ART: Readonly<Record<string, StudioSpaceMapArt>> =
  Object.freeze({
    assets: {
      scene: "archive",
      gradient: ["#3b2f4a", "#5a3f5c", "#2a2135"],
      accent: "#f4c56e",
    },
    storyboard: {
      scene: "gallery",
      gradient: ["#1f3a5f", "#2e5a8c", "#16263f"],
      accent: "#78b9ff",
    },
    production: {
      scene: "control",
      gradient: ["#1d3a3a", "#2a5a5c", "#142a2c"],
      accent: "#6edee8",
    },
    release: {
      scene: "release",
      gradient: ["#3d2a5e", "#6a3fa0", "#2a1d42"],
      accent: "#c4a5ff",
    },
    writers: {
      scene: "lab",
      gradient: ["#3a2a5e", "#5e3f8c", "#281d42"],
      accent: "#a98cff",
    },
    drawing: {
      scene: "easel",
      gradient: ["#5e2a3f", "#a04a5e", "#3a1d2a"],
      accent: "#ff8eaa",
    },
    review: {
      scene: "theater",
      gradient: ["#1d3a2f", "#2a5c48", "#142a22"],
      accent: "#72dfad",
    },
    quality: {
      scene: "quality",
      gradient: ["#1f3a4a", "#2e6a7c", "#16262f"],
      accent: "#7fd4c1",
    },
    teams: {
      scene: "commons",
      gradient: ["#4a2f1d", "#8c5a2e", "#352315"],
      accent: "#ffb36f",
    },
    lounge: {
      scene: "cafe",
      gradient: ["#4a2c1d", "#7c4a2a", "#332016"],
      accent: "#ffb36f",
    },
    live: {
      scene: "plaza",
      gradient: ["#1d3a4a", "#2a7a8c", "#142a35"],
      accent: "#6edee8",
    },
    meeting: {
      scene: "meeting",
      gradient: ["#2a2a4a", "#4a4a7c", "#1d1d35"],
      accent: "#9aa5ff",
    },
    assistant: {
      scene: "desk",
      gradient: ["#3a2a4a", "#6a4a8c", "#2a1d35"],
      accent: "#d48cff",
    },
    lobby: {
      scene: "lobby",
      gradient: ["#3f3a2a", "#6e5f3a", "#2c2820"],
      accent: "#ffd98a",
    },
  });

/** 등록되지 않은(커스텀) 공간의 폴백 아트. */
export const STUDIO_SPACE_MAP_FALLBACK_ART: StudioSpaceMapArt = Object.freeze({
  scene: "plaza",
  gradient: ["#2a2f3a", "#4a5262", "#1d2129"] as [string, string, string],
  accent: "#aeb9cc",
});

/** 공간 id로 카드 아트를 찾는다. 없으면 폴백. */
export function studioSpaceMapArtForZone(zoneId: string): StudioSpaceMapArt {
  return STUDIO_SPACE_MAP_ART[zoneId] ?? STUDIO_SPACE_MAP_FALLBACK_ART;
}

/**
 * 부모가 피어 전체 객체를 들고 있을 때 위치만 뽑아 쓰는 헬퍼.
 * `countPeersPerZone` 입력 형태로 변환한다.
 */
export function studioSpaceMapPeerPoints(
  peers: readonly { readonly state: StudioVirtualSpacePoint }[],
): StudioVirtualSpacePoint[] {
  return peers.map((peer) => ({ x: peer.state.x, y: peer.state.y }));
}

/* ------------------------------------------------------------------ */
/* 날씨 오버레이                                                        */
/* ------------------------------------------------------------------ */

/** 카드에 얹는 날씨 연출 종류. */
export type StudioSpaceMapWeatherEffect =
  | "sun"
  | "clouds"
  | "fog"
  | "rain"
  | "snow"
  | "storm";

export interface StudioSpaceMapWeatherOverlay {
  readonly effect: StudioSpaceMapWeatherEffect;
  /** 전체 카드에 깔리는 틴트 색. */
  readonly tint: string;
  /** 틴트 불투명도 0~1. */
  readonly tintOpacity: number;
}

const WEATHER_OVERLAYS: Record<StudioWeatherCondition, StudioSpaceMapWeatherOverlay> =
  Object.freeze({
    clear: { effect: "sun", tint: "#ffd9a0", tintOpacity: 0.14 },
    cloudy: { effect: "clouds", tint: "#8fa3b8", tintOpacity: 0.22 },
    fog: { effect: "fog", tint: "#c8d2dd", tintOpacity: 0.3 },
    rain: { effect: "rain", tint: "#5d7186", tintOpacity: 0.28 },
    snow: { effect: "snow", tint: "#dfe9f5", tintOpacity: 0.2 },
    thunderstorm: { effect: "storm", tint: "#3d4a5e", tintOpacity: 0.38 },
  });

/** 날씨에 맞는 카드 오버레이를 만든다. */
export function studioSpaceMapWeatherOverlay(
  condition: StudioWeatherCondition,
): StudioSpaceMapWeatherOverlay {
  return WEATHER_OVERLAYS[condition];
}

/** 날씨 이름 (한/영). */
export const STUDIO_SPACE_MAP_WEATHER_NAMES: Record<
  StudioWeatherCondition,
  { readonly ko: string; readonly en: string }
> = Object.freeze({
  clear: { ko: "맑음", en: "Clear" },
  cloudy: { ko: "흐림", en: "Cloudy" },
  fog: { ko: "안개", en: "Fog" },
  rain: { ko: "비", en: "Rain" },
  snow: { ko: "눈", en: "Snow" },
  thunderstorm: { ko: "천둥번개", en: "Thunderstorm" },
});

/* ------------------------------------------------------------------ */
/* 공간별 인원 집계                                                     */
/* ------------------------------------------------------------------ */

/**
 * 피어 위치를 공간 rect에 대입해 공간별 인원을 센다.
 * 미니맵 카드에 "지금 N명" 표시용.
 */
export function countPeersPerZone(
  zones: readonly StudioVirtualSpaceZone[],
  peers: readonly StudioVirtualSpacePoint[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const peer of peers) {
    const zone = zones.find(
      (candidate) =>
        peer.x >= candidate.x &&
        peer.x <= candidate.x + candidate.width &&
        peer.y >= candidate.y &&
        peer.y <= candidate.y + candidate.height,
    );
    if (zone) counts.set(zone.id, (counts.get(zone.id) ?? 0) + 1);
  }
  return counts;
}
