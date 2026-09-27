import { describe, expect, it } from "vitest";
import { parseStudioVirtualEnvironmentPreference } from "./studio-virtual-space-environment-preference";
import { studioDistrictEnvironment, studioIllustratedPropFrame, studioRenderedTileWorld, studioSceneDensity } from "./studio-virtual-space-scene-direction";
import { STUDIO_TOWN_DISTRICT_IDS } from "./studio-virtual-space-town-layout";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

describe("장소 환경 연출", () => {
  it("일곱 장소를 적용 가능한 원경과 날씨로 연결한다", () => {
    for (const district of STUDIO_TOWN_DISTRICT_IDS) {
      const value = studioDistrictEnvironment(district);
      expect(parseStudioVirtualEnvironmentPreference(value)).toEqual(value);
    }
    expect(studioDistrictEnvironment("atelier-gardens")).toMatchObject({ backdrop: "forest", weather: "petals" });
    expect(studioDistrictEnvironment("production-heights")).toMatchObject({ backdrop: "city", dayPhase: "night" });
    expect(studioDistrictEnvironment("story-terrace").backdrop).toBe("coast");
  });
  it("배경 밀도는 장식 입자 수만 조절한다", () => {
    expect(studioSceneDensity("minimal").ambientRatio).toBeLessThan(studioSceneDensity("decorated").ambientRatio);
    expect(studioSceneDensity("decorated").weatherRatio).toBeLessThan(studioSceneDensity("festival").weatherRatio);
    expect(studioSceneDensity("festival").ambientRatio).toBeLessThanOrEqual(1);
  });
  it("새 지형 아트는 논리 타일·사용자 맵을 보존하고 테마마다 다른 원본을 사용한다", () => {
    const tilemap = studioVirtualPlaceWorldManifest("skyport").tilemap;
    if (!tilemap) throw new Error("내장 장소 타일맵이 없습니다.");
    const rendered = studioRenderedTileWorld(tilemap, "sky-island");
    expect(rendered.layers).toBe(tilemap.layers);
    expect(rendered.tileWidth).toBe(64);
    expect(rendered.tilesets[0]).toMatchObject({ imageWidth: 1254, tileWidth: 313.5 });
    expect(studioRenderedTileWorld(tilemap, "retro").tilesets[0]?.imageUrl).toBe("/assets/virtual-studio/experience-v8/terrain-retro.png");
    expect(studioRenderedTileWorld(tilemap, "neon").tilesets[0]?.imageUrl).toBe("/assets/virtual-studio/experience-v8/terrain-neon.png");
    expect(tilemap.tilesets[0]?.imageUrl).toContain("{style}/terrain-tile-atlas.webp");
    const custom = { ...tilemap, tilesets: tilemap.tilesets.map((entry) => ({ ...entry, imageUrl: "/custom.png" })) };
    expect(studioRenderedTileWorld(custom, "sky-island")).toBe(custom);
  });
  it("내장 소품은 모든 테마의 같은 의미 프레임에 연결하고 사용자 자산은 보존한다", () => {
    const bench = "/assets/virtual-studio/style-packs-v5/{style}/objects/bench.webp";
    expect(studioIllustratedPropFrame(bench, "sky-island")).toBe(2);
    expect(studioIllustratedPropFrame(bench.replace("bench", "lantern"), "sky-island")).toBe(3);
    expect(studioIllustratedPropFrame(bench, "retro")).toBe(2);
    expect(studioIllustratedPropFrame("/custom/bench.webp", "sky-island")).toBeUndefined();
  });
});
