// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AMBIENT_SCENE_KINDS,
  isLowPowerEnvironment,
  prefersReducedMotion,
  readAmbientPreferences,
  resolveAmbientScene,
  type AmbientSceneInput,
} from "./ambient-engine";

const AUTUMN_NOON = new Date(2026, 9, 15, 13, 0);
const AUTUMN_NIGHT = new Date(2026, 9, 15, 22, 0);
const SPRING_NOON = new Date(2026, 3, 10, 13, 0);
const SUMMER_NOON = new Date(2026, 6, 10, 13, 0);
const SUMMER_NIGHT = new Date(2026, 6, 10, 22, 0);
const WINTER_NOON = new Date(2026, 0, 10, 13, 0);

function input(overrides: Partial<AmbientSceneInput>): AmbientSceneInput {
  return { intensity: "subtle", effect: "auto", weather: null, date: AUTUMN_NOON, ...overrides };
}

describe("prefersReducedMotion", () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  it("reduce면 true, 아니면 false", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("isLowPowerEnvironment", () => {
  it("boolean을 돌려준다", () => {
    expect(typeof isLowPowerEnvironment()).toBe("boolean");
  });
});

describe("스펙터클 호환 내보내기", () => {
  it("엔진 경로에서 설정 읽기를 계속 제공한다", () => {
    localStorage.clear();
    expect(readAmbientPreferences().intensity).toBe("subtle");
  });
});

describe("resolveAmbientScene", () => {
  it("강도 끔이면 장면이 없다", () => {
    expect(resolveAmbientScene(input({ intensity: "off", weather: "rain" }))).toBeNull();
  });

  it("화면 전체 색 틴트 필드를 만들지 않는다(파티클 장면만)", () => {
    const scene = resolveAmbientScene(input({ intensity: "vivid", weather: "rain", date: AUTUMN_NIGHT }));
    expect(scene).not.toBeNull();
    expect(Object.keys(scene ?? {})).toEqual(
      expect.not.arrayContaining(["tint", "tintEnabled", "weatherTintColor", "weatherTintOpacity"]),
    );
  });

  it.each([
    ["rain", AUTUMN_NOON, "rain"],
    ["thunderstorm", AUTUMN_NOON, "thunderstorm"],
    ["snow", WINTER_NOON, "snow"],
    ["cloudy", AUTUMN_NOON, "cloudy"],
    ["fog", AUTUMN_NOON, "cloudy"],
    ["clear", AUTUMN_NOON, "sunny"],
    ["clear", AUTUMN_NIGHT, "clear-night"],
  ] as const)("자동: 실제 날씨 %s(%s) → %s", (weather, date, kind) => {
    const scene = resolveAmbientScene(input({ weather, date }));
    expect(scene?.kind).toBe(kind);
    expect(scene?.source).toBe("weather");
  });

  it("자동: 안개는 뿌연 막이 아니라 구름으로 표현한다", () => {
    expect(resolveAmbientScene(input({ weather: "fog" }))?.kind).toBe("cloudy");
  });

  it.each([
    [SPRING_NOON, "petals"],
    [SUMMER_NOON, "sunny"],
    [SUMMER_NIGHT, "fireflies"],
    [AUTUMN_NOON, "leaves"],
    [WINTER_NOON, "snow"],
  ] as const)("자동: 날씨를 모르면 계절 효과로 대체한다 (%s → %s)", (date, kind) => {
    const scene = resolveAmbientScene(input({ weather: null, date }));
    expect(scene?.kind).toBe(kind);
    expect(scene?.source).toBe("season");
  });

  it.each([
    ["clear", AUTUMN_NOON, "sunny"],
    ["clear", AUTUMN_NIGHT, "clear-night"],
    ["rain", AUTUMN_NOON, "rain"],
    ["snow", SUMMER_NOON, "snow"],
    ["petals", AUTUMN_NOON, "petals"],
    ["leaves", SPRING_NOON, "leaves"],
    ["fireflies", WINTER_NOON, "fireflies"],
  ] as const)("직접 고른 효과 %s는 날씨와 무관하게 그대로 쓴다", (effect, date, kind) => {
    const scene = resolveAmbientScene(input({ effect, weather: "thunderstorm", date }));
    expect(scene?.kind).toBe(kind);
    expect(scene?.source).toBe("manual");
    expect(scene?.accent).toBeNull();
  });

  it("화려하게 + 맑은 가을 낮: 햇살에 낙엽을 곁들인다", () => {
    const scene = resolveAmbientScene(input({ intensity: "vivid", weather: "clear", date: AUTUMN_NOON }));
    expect(scene?.kind).toBe("sunny");
    expect(scene?.accent).toBe("leaves");
  });

  it("은은하게는 계절 효과를 곁들이지 않는다", () => {
    const scene = resolveAmbientScene(input({ intensity: "subtle", weather: "clear", date: AUTUMN_NOON }));
    expect(scene?.accent).toBeNull();
  });

  it("비·눈에는 계절 효과를 섞지 않고, 맑은 날 눈송이 같은 어색한 조합도 뺀다", () => {
    expect(resolveAmbientScene(input({ intensity: "vivid", weather: "rain", date: SPRING_NOON }))?.accent).toBeNull();
    expect(resolveAmbientScene(input({ intensity: "vivid", weather: "clear", date: WINTER_NOON }))?.accent).toBeNull();
    // 맑은 밤 장면에는 이미 반딧불이 들어 있다.
    expect(resolveAmbientScene(input({ intensity: "vivid", weather: "clear", date: SUMMER_NIGHT }))?.accent).toBeNull();
  });

  it("장면 종류 목록이 규칙과 일치한다", () => {
    expect(AMBIENT_SCENE_KINDS).toHaveLength(9);
  });
});
