import { describe, expect, it, vi } from "vitest";

import {
  AMBIENT_WEATHER_CONDITIONS,
  AmbientWeatherProvider,
  buildAmbientWeatherUrl,
  mapAmbientWmoCode,
  parseAmbientWeatherResponse,
  weatherParticleFor,
  weatherTintFor,
} from "./ambient-weather";

describe("mapAmbientWmoCode", () => {
  it.each([
    [0, "clear"], [1, "clear"],
    [2, "cloudy"], [3, "cloudy"],
    [45, "fog"], [48, "fog"],
    [51, "rain"], [61, "rain"], [80, "rain"],
    [71, "snow"], [85, "snow"],
    [95, "thunderstorm"], [99, "thunderstorm"],
    [999, "cloudy"],
  ])("WMO %i → %s", (code, expected) => {
    expect(mapAmbientWmoCode(code)).toBe(expected);
  });
});

describe("buildAmbientWeatherUrl", () => {
  it("Open-Meteo URL을 만든다", () => {
    const url = buildAmbientWeatherUrl(37.5, 127.0);
    expect(url).toContain("https://api.open-meteo.com/v1/forecast");
    expect(url).toContain("latitude=37.5");
    expect(url).toContain("weather_code");
  });
});

describe("parseAmbientWeatherResponse", () => {
  it("정상 응답을 파싱한다", () => {
    const reading = parseAmbientWeatherResponse(
      { current: { temperature_2m: 21.34, weather_code: 61 } },
      { fetchedAtMs: 1000 },
    );
    expect(reading).toMatchObject({
      temperatureC: 21.3,
      condition: "rain",
      weatherCode: 61,
      fetchedAt: 1000,
    });
  });

  it("형식이 맞지 않으면 null", () => {
    expect(parseAmbientWeatherResponse(null, { fetchedAtMs: 0 })).toBeNull();
    expect(parseAmbientWeatherResponse({}, { fetchedAtMs: 0 })).toBeNull();
    expect(
      parseAmbientWeatherResponse({ current: { temperature_2m: "x" } }, { fetchedAtMs: 0 }),
    ).toBeNull();
  });
});

describe("weatherParticleFor", () => {
  it("비/눈만 파티클", () => {
    expect(weatherParticleFor("rain")).toBe("rain");
    expect(weatherParticleFor("thunderstorm")).toBe("rain");
    expect(weatherParticleFor("snow")).toBe("snow");
    expect(weatherParticleFor("clear")).toBe("none");
    expect(weatherParticleFor("cloudy")).toBe("none");
    expect(weatherParticleFor("fog")).toBe("none");
  });
});

describe("weatherTintFor", () => {
  it("모든 조건에 틴트가 정의되어 있다", () => {
    for (const condition of AMBIENT_WEATHER_CONDITIONS) {
      const tint = weatherTintFor(condition);
      expect(tint.opacity).toBeGreaterThanOrEqual(0);
    }
    expect(weatherTintFor("clear").color).toBeNull();
  });
});

describe("AmbientWeatherProvider", () => {
  function makeDeps(overrides: Record<string, unknown> = {}) {
    return {
      fetchJson: vi.fn().mockResolvedValue({
        current: { temperature_2m: 18, weather_code: 0 },
      }),
      getPosition: vi.fn().mockResolvedValue({ latitude: 37.5, longitude: 127 }),
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
      now: () => 1234,
      ...overrides,
    };
  }

  it("start → ready 상태가 된다", async () => {
    const deps = makeDeps();
    const provider = new AmbientWeatherProvider(deps);
    const states: string[] = [];
    provider.subscribe(() => states.push(provider.snapshot().phase));
    provider.start();
    await vi.waitFor(() => {
      expect(provider.snapshot().phase).toBe("ready");
    });
    expect(provider.snapshot().reading?.condition).toBe("clear");
    expect(states).toContain("locating");
    provider.dispose();
  });

  it("실패해도 이전 reading을 유지한다", async () => {
    const deps = makeDeps();
    const provider = new AmbientWeatherProvider(deps);
    provider.start();
    await vi.waitFor(() => {
      expect(provider.snapshot().phase).toBe("ready");
    });
    // 두 번째 로드는 실패
    deps.fetchJson.mockRejectedValueOnce(new Error("network"));
    await provider.refresh();
    expect(provider.snapshot().phase).toBe("ready");
    expect(provider.snapshot().reading?.condition).toBe("clear");
    provider.dispose();
  });

  it("dispose 후 타이머가 정리된다", () => {
    const deps = makeDeps();
    const provider = new AmbientWeatherProvider(deps);
    provider.start();
    provider.dispose();
    expect(deps.clearInterval).toHaveBeenCalled();
  });
});
