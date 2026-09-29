import { describe, expect, it, vi } from "vitest";
import {
  buildOpenMeteoUrl,
  mapWmoWeatherCode,
  parseOpenMeteoResponse,
  STUDIO_WEATHER_FALLBACK_LOCATION,
  STUDIO_WEATHER_MAX_PARTICLES,
  STUDIO_WEATHER_REFRESH_INTERVAL_MS,
  studioWeatherEffectProfile,
  studioWeatherNpcGuidance,
  StudioVirtualWeatherProvider,
  type StudioWeatherCondition,
} from "./studio-virtual-space-weather";
import { getStudioWeatherLabels } from "./studio-virtual-space-weather-labels";

describe("mapWmoWeatherCode", () => {
  it("맑음 코드를 매핑한다", () => {
    expect(mapWmoWeatherCode(0)).toBe("clear");
    expect(mapWmoWeatherCode(1)).toBe("clear");
  });

  it("구름 코드를 매핑한다", () => {
    expect(mapWmoWeatherCode(2)).toBe("cloudy");
    expect(mapWmoWeatherCode(3)).toBe("cloudy");
  });

  it("안개 코드를 매핑한다", () => {
    expect(mapWmoWeatherCode(45)).toBe("fog");
    expect(mapWmoWeatherCode(48)).toBe("fog");
  });

  it("비 코드를 매핑한다 (이슬비·비·소나기)", () => {
    for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]) {
      expect(mapWmoWeatherCode(code)).toBe("rain");
    }
  });

  it("눈 코드를 매핑한다", () => {
    for (const code of [71, 73, 75, 77, 85, 86]) {
      expect(mapWmoWeatherCode(code)).toBe("snow");
    }
  });

  it("천둥 코드를 매핑한다", () => {
    for (const code of [95, 96, 99]) {
      expect(mapWmoWeatherCode(code)).toBe("thunderstorm");
    }
  });

  it("알 수 없는 코드는 cloudy로 안전 처리한다", () => {
    expect(mapWmoWeatherCode(999)).toBe("cloudy");
    expect(mapWmoWeatherCode(-1)).toBe("cloudy");
  });
});

describe("buildOpenMeteoUrl", () => {
  it("올바른 Open-Meteo URL을 만든다", () => {
    const url = buildOpenMeteoUrl(37.5665, 126.978);
    expect(url).toContain("https://api.open-meteo.com/v1/forecast?");
    expect(url).toContain("latitude=37.5665");
    expect(url).toContain("longitude=126.978");
    expect(url).toContain("current=temperature_2m%2Cweather_code");
  });
});

describe("parseOpenMeteoResponse", () => {
  const meta = { fetchedAtMs: 1700000000000, latitude: 37.5, longitude: 127 };

  it("정상 응답을 파싱한다", () => {
    const reading = parseOpenMeteoResponse(
      { current: { temperature_2m: 23.45, weather_code: 61 } },
      meta,
    );
    expect(reading).not.toBeNull();
    expect(reading?.temperatureC).toBe(23.5);
    expect(reading?.condition).toBe("rain");
    expect(reading?.weatherCode).toBe(61);
    expect(reading?.fetchedAt).toBe(meta.fetchedAtMs);
  });

  it("잘못된 응답은 null을 반환한다", () => {
    expect(parseOpenMeteoResponse(null, meta)).toBeNull();
    expect(parseOpenMeteoResponse({}, meta)).toBeNull();
    expect(parseOpenMeteoResponse({ current: {} }, meta)).toBeNull();
    expect(parseOpenMeteoResponse({ current: { temperature_2m: "23", weather_code: 0 } }, meta)).toBeNull();
    expect(parseOpenMeteoResponse({ current: { temperature_2m: 23, weather_code: NaN } }, meta)).toBeNull();
  });
});

describe("studioWeatherEffectProfile", () => {
  const conditions: readonly StudioWeatherCondition[] = ["clear", "cloudy", "fog", "rain", "snow", "thunderstorm"];

  it("모든 날씨에 프로필이 있다", () => {
    for (const condition of conditions) {
      const profile = studioWeatherEffectProfile(condition, { reducedMotion: false });
      expect(profile.condition).toBe(condition);
      expect(profile.lighting.tint).toMatch(/^#/);
      expect(profile.window.skyGradient).toHaveLength(2);
    }
  });

  it("비는 빗방울 파티클을 가진다", () => {
    const profile = studioWeatherEffectProfile("rain", { reducedMotion: false });
    expect(profile.particles).toHaveLength(1);
    expect(profile.particles[0]?.kind).toBe("rain");
    expect(profile.particles[0]?.fallSpeed.min).toBeGreaterThan(400);
    expect(profile.window.showPrecipitation).toBe(true);
    expect(profile.ambientTrackId).toBe("gentle-rain");
  });

  it("눈은 천천히 흩날리는 파티클을 가진다", () => {
    const profile = studioWeatherEffectProfile("snow", { reducedMotion: false });
    expect(profile.particles[0]?.kind).toBe("snow");
    expect(profile.particles[0]?.fallSpeed.max).toBeLessThan(200);
    expect(profile.particles[0]?.drift.max).toBeGreaterThan(0);
  });

  it("맑음은 햇살 광선과 따뜻한 틴트를 가진다", () => {
    const profile = studioWeatherEffectProfile("clear", { reducedMotion: false });
    expect(profile.lighting.sunRays).toBe(true);
    expect(profile.window.showSun).toBe(true);
    expect(profile.particles).toHaveLength(0);
  });

  it("천둥은 번개 스케줄을 가진다", () => {
    const profile = studioWeatherEffectProfile("thunderstorm", { reducedMotion: false });
    expect(profile.lightning.enabled).toBe(true);
    expect(profile.lightning.minIntervalMs).toBeGreaterThan(0);
    expect(profile.lightning.maxIntervalMs).toBeGreaterThan(profile.lightning.minIntervalMs);
  });

  it("파티클 수는 성능 상한을 넘지 않는다", () => {
    for (const condition of conditions) {
      const profile = studioWeatherEffectProfile(condition, { reducedMotion: false });
      const total = profile.particles.reduce((sum, spec) => sum + spec.count, 0);
      expect(total).toBeLessThanOrEqual(STUDIO_WEATHER_MAX_PARTICLES);
    }
  });

  it("reduced-motion이면 파티클·번개가 꺼진다", () => {
    const rain = studioWeatherEffectProfile("rain", { reducedMotion: true });
    expect(rain.particles).toHaveLength(0);
    expect(rain.reducedMotion).toBe(true);
    // 조명/창문은 정적으로 유지된다
    expect(rain.window.showPrecipitation).toBe(true);

    const storm = studioWeatherEffectProfile("thunderstorm", { reducedMotion: true });
    expect(storm.lightning.enabled).toBe(false);
    expect(storm.particles).toHaveLength(0);
  });
});

describe("studioWeatherNpcGuidance", () => {
  it("비·눈·천둥이면 실내 대피한다", () => {
    for (const condition of ["rain", "snow", "thunderstorm"] as const) {
      const guidance = studioWeatherNpcGuidance(condition);
      expect(guidance.seekShelter).toBe(true);
      expect(guidance.pauseOutdoor).toBe(true);
      expect(guidance.speechKey).not.toBe("none");
    }
  });

  it("맑으면 야외 활동을 즐긴다", () => {
    const guidance = studioWeatherNpcGuidance("clear");
    expect(guidance.seekShelter).toBe(false);
    expect(guidance.speechKey).toBe("enjoy-clear");
  });

  it("구름·안개는 평상시 행동이다", () => {
    for (const condition of ["cloudy", "fog"] as const) {
      const guidance = studioWeatherNpcGuidance(condition);
      expect(guidance.seekShelter).toBe(false);
      expect(guidance.speechKey).toBe("none");
    }
  });
});

describe("getStudioWeatherLabels", () => {
  it("한/영 모든 날씨 이름이 비어 있지 않다", () => {
    const conditions: readonly StudioWeatherCondition[] = ["clear", "cloudy", "fog", "rain", "snow", "thunderstorm"];
    for (const lang of ["ko", "en"]) {
      const labels = getStudioWeatherLabels(lang);
      for (const condition of conditions) {
        expect(labels.conditionName(condition).length).toBeGreaterThan(0);
        expect(labels.conditionDescription(condition).length).toBeGreaterThan(0);
      }
      expect(labels.temperatureLabel(23.4)).toContain("23");
      expect(labels.widgetLabel(23.4, "rain").length).toBeGreaterThan(0);
    }
  });

  it("NPC 대사가 비어 있지 않다 (none 제외)", () => {
    const ko = getStudioWeatherLabels("ko");
    for (const condition of ["rain", "snow", "thunderstorm", "clear"] as const) {
      const speech = ko.npcSpeech(studioWeatherNpcGuidance(condition));
      expect(speech.length).toBeGreaterThan(0);
    }
  });

  it("비 오는 날 NPC 대사가 한글이다", () => {
    const ko = getStudioWeatherLabels("ko");
    const speech = ko.npcSpeech(studioWeatherNpcGuidance("rain"));
    expect(speech).toContain("비");
  });
});

describe("StudioVirtualWeatherProvider", () => {
  const reading = (condition: StudioWeatherCondition = "clear") => ({
    current: { temperature_2m: 20, weather_code: condition === "rain" ? 61 : 0 },
  });

  function fakeDeps(overrides: Record<string, unknown> = {}) {
    const handlers: Array<() => void> = [];
    return {
      deps: {
        fetchJson: vi.fn(async () => reading()),
        getPosition: vi.fn(async () => ({ latitude: 37.5, longitude: 127 })),
        setInterval: vi.fn((handler: () => void) => { handlers.push(handler); return handlers.length; }),
        clearInterval: vi.fn(),
        now: () => 1700000000000,
        ...overrides,
      },
      handlers,
    };
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("start하면 위치 획득 후 날씨를 로드한다", async () => {
    const { deps } = fakeDeps();
    const provider = new StudioVirtualWeatherProvider(deps);
    const snapshots: string[] = [];
    provider.subscribe(() => snapshots.push(provider.snapshot().phase));

    provider.start();
    await flush();
    await flush();

    const snapshot = provider.snapshot();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.reading?.condition).toBe("clear");
    expect(snapshot.reading?.temperatureC).toBe(20);
    expect(deps.getPosition).toHaveBeenCalled();
    expect(snapshots).toContain("locating");
    expect(snapshots).toContain("ready");
    provider.dispose();
  });

  it("위치 권한 거부 시 서울 기본값으로 로드한다", async () => {
    const { deps } = fakeDeps({
      getPosition: vi.fn(async () => ({ ...STUDIO_WEATHER_FALLBACK_LOCATION })),
    });
    const provider = new StudioVirtualWeatherProvider(deps);
    provider.start();
    await flush();
    await flush();

    const snapshot = provider.snapshot();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.reading?.latitude).toBe(STUDIO_WEATHER_FALLBACK_LOCATION.latitude);
    provider.dispose();
  });

  it("10분마다 자동 갱신 타이머를 등록한다", async () => {
    const { deps, handlers } = fakeDeps();
    const provider = new StudioVirtualWeatherProvider(deps);
    provider.start();
    await flush();
    await flush();

    expect(deps.setInterval).toHaveBeenCalledWith(expect.any(Function), STUDIO_WEATHER_REFRESH_INTERVAL_MS);
    const callsBefore = (deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls.length;
    handlers[0]?.();
    await flush();
    await flush();
    expect((deps.fetchJson as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
    provider.dispose();
  });

  it("fetch 실패 시 이전 reading을 유지하고 error를 기록한다", async () => {
    const { deps } = fakeDeps();
    const provider = new StudioVirtualWeatherProvider(deps);
    provider.start();
    await flush();
    await flush();
    expect(provider.snapshot().phase).toBe("ready");

    (deps.fetchJson as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    await provider.refresh();
    await flush();

    const snapshot = provider.snapshot();
    expect(snapshot.reading?.condition).toBe("clear"); // 유지
    expect(snapshot.error).toContain("network down");
    provider.dispose();
  });

  it("첫 로드 실패 시 phase가 error가 된다", async () => {
    const { deps } = fakeDeps({
      fetchJson: vi.fn(async () => { throw new Error("boom"); }),
    });
    const provider = new StudioVirtualWeatherProvider(deps);
    provider.start();
    await flush();
    await flush();

    expect(provider.snapshot().phase).toBe("error");
    expect(provider.snapshot().reading).toBeNull();
    provider.dispose();
  });

  it("dispose하면 타이머가 정리된다", async () => {
    const { deps } = fakeDeps();
    const provider = new StudioVirtualWeatherProvider(deps);
    provider.start();
    await flush();
    provider.dispose();
    expect(deps.clearInterval).toHaveBeenCalled();
  });

  it("start 중복 호출은 타이머를 하나만 만든다", async () => {
    const { deps } = fakeDeps();
    const provider = new StudioVirtualWeatherProvider(deps);
    provider.start();
    provider.start();
    await flush();
    expect(deps.setInterval).toHaveBeenCalledTimes(1);
    provider.dispose();
  });
});
