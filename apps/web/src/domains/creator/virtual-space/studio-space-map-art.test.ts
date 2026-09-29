import { describe, expect, it } from "vitest";

import { STUDIO_VIRTUAL_SPACE_ZONES } from "./studio-virtual-space-model";
import {
  STUDIO_SPACE_MAP_ART,
  STUDIO_SPACE_MAP_FALLBACK_ART,
  STUDIO_SPACE_MAP_WEATHER_NAMES,
  countPeersPerZone,
  studioSpaceMapArtForZone,
  studioSpaceMapWeatherOverlay,
} from "./studio-space-map-art";

describe("studio-space-map-art", () => {
  it("내장 14개 공간 모두에 카드 아트가 있다", () => {
    for (const zone of STUDIO_VIRTUAL_SPACE_ZONES) {
      const art = STUDIO_SPACE_MAP_ART[zone.id];
      expect(art, `art for zone ${zone.id}`).toBeDefined();
      expect(art!.gradient).toHaveLength(3);
      expect(art!.accent).toMatch(/^#/);
    }
  });

  it("등록되지 않은 공간 id는 폴백 아트를 반환한다", () => {
    expect(studioSpaceMapArtForZone("unknown-zone")).toBe(STUDIO_SPACE_MAP_FALLBACK_ART);
    expect(studioSpaceMapArtForZone("drawing").scene).toBe("easel");
  });

  it("날씨 6종 모두 오버레이가 매핑된다", () => {
    const conditions = ["clear", "cloudy", "fog", "rain", "snow", "thunderstorm"] as const;
    const effects = {
      clear: "sun",
      cloudy: "clouds",
      fog: "fog",
      rain: "rain",
      snow: "snow",
      thunderstorm: "storm",
    } as const;
    for (const condition of conditions) {
      const overlay = studioSpaceMapWeatherOverlay(condition);
      expect(overlay.effect).toBe(effects[condition]);
      expect(overlay.tintOpacity).toBeGreaterThan(0);
      expect(overlay.tintOpacity).toBeLessThanOrEqual(1);
      expect(STUDIO_SPACE_MAP_WEATHER_NAMES[condition].ko).toBeTruthy();
      expect(STUDIO_SPACE_MAP_WEATHER_NAMES[condition].en).toBeTruthy();
    }
  });

  it("피어 위치로 공간별 인원을 집계한다", () => {
    // drawing: x 340~630, y 300~530 / lobby: x 640~920, y 840~940
    const counts = countPeersPerZone(STUDIO_VIRTUAL_SPACE_ZONES, [
      { x: 400, y: 400 },
      { x: 500, y: 450 },
      { x: 700, y: 870 },
      { x: 5000, y: 5000 }, // 어떤 공간에도 속하지 않음
    ]);
    expect(counts.get("drawing")).toBe(2);
    expect(counts.get("lobby")).toBe(1);
    expect(counts.get("review")).toBeUndefined();
    expect(counts.size).toBe(2);
  });

  it("빈 피어 목록이면 빈 집계가 나온다", () => {
    expect(countPeersPerZone(STUDIO_VIRTUAL_SPACE_ZONES, []).size).toBe(0);
  });
});
