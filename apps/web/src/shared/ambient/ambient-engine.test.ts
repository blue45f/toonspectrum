// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  AMBIENT_DEFAULT_INTENSITY,
  isAmbientSceneEmpty,
  isLowPowerEnvironment,
  prefersReducedMotion,
  readAmbientPreferences,
  resolveAmbientScene,
  writeAmbientIntensity,
} from "./ambient-engine";

describe("readAmbientPreferences / writeAmbientIntensity", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("기본값은 subtle", () => {
    expect(readAmbientPreferences()).toEqual({ intensity: "subtle" });
    expect(AMBIENT_DEFAULT_INTENSITY).toBe("subtle");
  });

  it("저장·조회 라운드트립", () => {
    writeAmbientIntensity("vivid");
    expect(readAmbientPreferences().intensity).toBe("vivid");
    writeAmbientIntensity("off");
    expect(readAmbientPreferences().intensity).toBe("off");
  });

  it("잘못된 값이면 기본값", () => {
    localStorage.setItem("toonstudio.ambient.intensity.v1", "ultra");
    expect(readAmbientPreferences().intensity).toBe("subtle");
  });
});

describe("prefersReducedMotion", () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  it("reduce면 true", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
  });

  it("no-preference면 false", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("resolveAmbientScene", () => {
  const base = {
    reducedMotion: false,
    lowPower: false,
    weather: null as null,
    date: new Date(2026, 9, 30, 12, 0), // 10월 낮
  };

  it("off면 전부 끔", () => {
    const scene = resolveAmbientScene({ ...base, intensity: "off", weather: "rain" });
    expect(scene.particlesEnabled).toBe(false);
    expect(scene.tintEnabled).toBe(false);
    expect(scene.particles).toHaveLength(0);
    expect(isAmbientSceneEmpty(scene)).toBe(true);
  });

  it("reducedMotion이면 파티클만 끔 (틴트는 유지)", () => {
    const scene = resolveAmbientScene({
      ...base, intensity: "vivid", reducedMotion: true, weather: "snow",
    });
    expect(scene.particlesEnabled).toBe(false);
    expect(scene.particles).toHaveLength(0);
    expect(scene.tintEnabled).toBe(true);
    expect(scene.timePhase).toBe("day");
  });

  it("subtle(기본)은 전면 색 틴트 없이 브랜드 색을 유지한다", () => {
    const scene = resolveAmbientScene({ ...base, intensity: "subtle", date: new Date(2026, 9, 30, 17, 30) });
    expect(scene.tintEnabled).toBe(false);
  });

  it("subtle + 비 → 저밀도 비 파티클", () => {
    const scene = resolveAmbientScene({ ...base, intensity: "subtle", weather: "rain" });
    expect(scene.particlesEnabled).toBe(true);
    expect(scene.particles).toHaveLength(1);
    expect(scene.particles[0].kind).toBe("rain");
    expect(scene.particles[0].count).toBeLessThan(140); // 저밀도
  });

  it("vivid + 가을 → 비 없이 단풍잎", () => {
    const scene = resolveAmbientScene({
      ...base, intensity: "vivid", weather: "clear",
      date: new Date(2026, 9, 15, 15, 0), // 10월
    });
    expect(scene.season).toBe("autumn");
    const kinds = scene.particles.map((p) => p.kind);
    expect(kinds).toContain("leaf");
  });

  it("vivid + 겨울 밤 + 눈 → 눈 파티클 (계절 눈송이와 중복 방지)", () => {
    const scene = resolveAmbientScene({
      ...base, intensity: "vivid", weather: "snow",
      date: new Date(2026, 0, 15, 21, 0), // 1월 밤
    });
    const kinds = scene.particles.map((p) => p.kind);
    expect(kinds).toContain("snow");
    // 날씨 눈과 계절 눈송이가 중복되지 않음
    expect(kinds.filter((k) => k === "snow" || k === "snowflake")).toHaveLength(1);
  });

  it("여름 밤 vivid → 반딧불이", () => {
    const scene = resolveAmbientScene({
      ...base, intensity: "vivid", weather: "clear",
      date: new Date(2026, 6, 15, 22, 0), // 7월 밤
    });
    expect(scene.particles.map((p) => p.kind)).toContain("firefly");
  });

  it("lowPower면 파티클 수 절반", () => {
    const normal = resolveAmbientScene({ ...base, intensity: "vivid", weather: "rain", lowPower: false });
    const low = resolveAmbientScene({ ...base, intensity: "vivid", weather: "rain", lowPower: true });
    expect(low.particles[0].count).toBeLessThan(normal.particles[0].count);
  });

  it("날씨 틴트가 반영된다", () => {
    const scene = resolveAmbientScene({ ...base, intensity: "subtle", weather: "thunderstorm" });
    expect(scene.weatherTintColor).toBe("#3d4a5e");
    expect(scene.weatherTintOpacity).toBeGreaterThan(0);
  });
});

describe("isLowPowerEnvironment", () => {
  it("함수가 존재하고 boolean 반환", () => {
    expect(typeof isLowPowerEnvironment()).toBe("boolean");
  });
});
