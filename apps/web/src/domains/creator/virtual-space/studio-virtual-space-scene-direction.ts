import type { StudioVirtualBackgroundPresentationMode } from "./studio-virtual-space-customization";
import type { StudioVirtualEnvironmentPreference } from "./studio-virtual-space-environment-preference";
import type { StudioTownDistrictId } from "./studio-virtual-space-town-layout";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioTileWorld } from "./studio-virtual-space-tile-chunks";

const DISTRICT_ENVIRONMENTS: Readonly<Record<StudioTownDistrictId, Omit<StudioVirtualEnvironmentPreference, "version">>> = {
  "archive-grove": { backdrop: "forest", dayPhase: "day", weather: "clear" },
  "story-terrace": { backdrop: "coast", dayPhase: "dusk", weather: "clear" },
  "production-heights": { backdrop: "city", dayPhase: "night", weather: "rain" },
  "atelier-gardens": { backdrop: "forest", dayPhase: "day", weather: "petals" },
  "review-falls": { backdrop: "sky", dayPhase: "dawn", weather: "clear" },
  "commons-market": { backdrop: "city", dayPhase: "dusk", weather: "clear" },
  "sky-port": { backdrop: "sky", dayPhase: "day", weather: "clear" },
};

/** 장소 선택은 원경·시간·날씨를 함께 적용하며 이후 각각 다시 조절할 수 있다. */
export function studioDistrictEnvironment(district: StudioTownDistrictId): StudioVirtualEnvironmentPreference {
  return { version: 1, ...DISTRICT_ENVIRONMENTS[district] };
}

export function studioSceneDensity(mode: StudioVirtualBackgroundPresentationMode) {
  return mode === "minimal" ? { ambientRatio: .25, weatherRatio: .4, lightAlpha: .45 }
    : mode === "festival" ? { ambientRatio: 1, weatherRatio: 1, lightAlpha: 1.2 }
      : { ambientRatio: .6, weatherRatio: .7, lightAlpha: .8 };
}

/** 내장 벤치·조명도 배치 가구와 같은 작화로 표시한다. 사용자 자산은 우선한다. */
export function studioIllustratedPropFrame(assetUrl: string, style: StudioVirtualArtStyleKey): number | undefined {
  if (style !== "sky-island") return undefined;
  const root = "/assets/virtual-studio/style-packs-v5/{style}/objects/";
  return assetUrl === `${root}bench.webp` ? 2 : assetUrl === `${root}lantern.webp` ? 3 : undefined;
}

/** 내장 공중섬의 표시 자산만 교체한다. 사용자 타일맵과 저장된 논리 좌표는 그대로 보존한다. */
export function studioRenderedTileWorld(world: StudioTileWorld, style: StudioVirtualArtStyleKey): StudioTileWorld {
  if (style !== "sky-island") return world;
  const source = "/assets/virtual-studio/living-town-v6/{style}/terrain-tile-atlas.webp";
  if (!world.tilesets.some((entry) => entry.imageUrl === source)) return world;
  return { ...world, tilesets: world.tilesets.map((entry) => entry.imageUrl === source ? {
    ...entry, imageUrl: "/assets/virtual-studio/experience-v8/terrain.png", imageWidth: 1254, imageHeight: 1254,
    // 생성 원본은 1254px다. 표시 전용 반 픽셀 경계를 유지해 이웃 재질이 섞이지 않게 한다.
    tileWidth: 313.5, tileHeight: 313.5,
  } : entry) };
}
