import { describe, expect, it, vi } from "vitest";

import type { AmbientLocationPreference } from "./ambient-preferences";
import {
  AMBIENT_WEATHER_DEFAULT_LOCATION,
  AMBIENT_WEATHER_REFRESH_INTERVAL_MS,
  AmbientWeatherProvider,
  buildAmbientWeatherUrl,
  mapAmbientWmoCode,
  parseAmbientWeatherResponse,
  roundAmbientCoordinate,
  type AmbientGeolocationPermission,
  type AmbientWeatherDependencies,
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

describe("좌표 반올림", () => {
  it("소수 둘째 자리로 줄인다", () => {
    expect(roundAmbientCoordinate(37.566535)).toBe(37.57);
    expect(roundAmbientCoordinate(126.977969)).toBe(126.98);
    expect(AMBIENT_WEATHER_DEFAULT_LOCATION).toEqual({ latitude: 37.57, longitude: 126.98 });
  });

  it("요청 URL에는 반올림한 좌표만 들어간다", () => {
    const url = buildAmbientWeatherUrl(35.179554, 129.075642);
    expect(url).toContain("https://api.open-meteo.com/v1/forecast?");
    expect(url).toContain("latitude=35.18");
    expect(url).toContain("longitude=129.08");
    expect(url).not.toContain("35.179");
    expect(url).toContain("weather_code");
  });
});

describe("parseAmbientWeatherResponse", () => {
  it("정상 응답을 파싱한다", () => {
    const reading = parseAmbientWeatherResponse(
      { current: { temperature_2m: 21.34, weather_code: 61 } },
      { fetchedAtMs: 1000, source: "default" },
    );
    expect(reading).toEqual({
      temperatureC: 21.3,
      condition: "rain",
      weatherCode: 61,
      fetchedAt: 1000,
      source: "default",
    });
  });

  it("형식이 맞지 않으면 null", () => {
    const meta = { fetchedAtMs: 0, source: "default" } as const;
    expect(parseAmbientWeatherResponse(null, meta)).toBeNull();
    expect(parseAmbientWeatherResponse({}, meta)).toBeNull();
    expect(parseAmbientWeatherResponse({ current: { temperature_2m: "x", weather_code: 1 } }, meta)).toBeNull();
  });
});

interface DepsOptions {
  readonly preference?: AmbientLocationPreference;
  readonly permission?: AmbientGeolocationPermission;
  readonly online?: boolean;
}

function makeDeps(options: DepsOptions = {}) {
  let preference = options.preference ?? null;
  const preferenceListeners = new Set<() => void>();
  const deps = {
    fetchJson: vi.fn<AmbientWeatherDependencies["fetchJson"]>().mockResolvedValue({
      current: { temperature_2m: 18, weather_code: 0 },
    }),
    queryGeolocationPermission: vi
      .fn<AmbientWeatherDependencies["queryGeolocationPermission"]>()
      .mockResolvedValue(options.permission ?? "prompt"),
    getPosition: vi
      .fn<AmbientWeatherDependencies["getPosition"]>()
      .mockResolvedValue({ latitude: 35.179554, longitude: 129.075642 }),
    readLocationPreference: () => preference,
    subscribePreferences: (listener: () => void) => {
      preferenceListeners.add(listener);
      return () => preferenceListeners.delete(listener);
    },
    isOnline: () => options.online ?? true,
    setInterval: vi.fn<AmbientWeatherDependencies["setInterval"]>().mockReturnValue(1),
    clearInterval: vi.fn<AmbientWeatherDependencies["clearInterval"]>(),
    now: () => 1234,
  };
  const setPreference = (next: AmbientLocationPreference) => {
    preference = next;
    for (const listener of preferenceListeners) listener();
  };
  return { deps, setPreference, preferenceListeners };
}

function requestedUrl(fetchJson: ReturnType<typeof makeDeps>["deps"]["fetchJson"], call = 0): string {
  return String(fetchJson.mock.calls[call]?.[0] ?? "");
}

describe("AmbientWeatherProvider 위치 정책", () => {
  it("기본은 서울 날씨이며 위치 권한을 묻지 않는다", async () => {
    const { deps } = makeDeps({ preference: null, permission: "prompt" });
    const provider = new AmbientWeatherProvider(deps);
    const release = provider.retain();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("ready"));
    expect(deps.getPosition).not.toHaveBeenCalled();
    expect(requestedUrl(deps.fetchJson)).toContain("latitude=37.57");
    expect(provider.snapshot().reading?.source).toBe("default");
    release();
  });

  it("설정을 고른 적이 없고 권한이 이미 허용되어 있으면 내 위치를 쓴다(좌표 반올림)", async () => {
    const { deps } = makeDeps({ preference: null, permission: "granted" });
    const provider = new AmbientWeatherProvider(deps);
    const release = provider.retain();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("ready"));
    expect(deps.getPosition).toHaveBeenCalledTimes(1);
    expect(requestedUrl(deps.fetchJson)).toContain("latitude=35.18");
    expect(requestedUrl(deps.fetchJson)).toContain("longitude=129.08");
    expect(provider.snapshot().reading?.source).toBe("device");
    release();
  });

  it("명시적으로 끈 사용자는 권한이 허용되어 있어도 위치를 쓰지 않는다", async () => {
    const { deps } = makeDeps({ preference: "off", permission: "granted" });
    const provider = new AmbientWeatherProvider(deps);
    const release = provider.retain();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("ready"));
    expect(deps.getPosition).not.toHaveBeenCalled();
    expect(deps.queryGeolocationPermission).not.toHaveBeenCalled();
    release();
  });

  it("켰는데 위치를 얻지 못하면 서울로 대체하고 알린다", async () => {
    const { deps } = makeDeps({ preference: "on" });
    deps.getPosition.mockRejectedValue(new Error("denied"));
    const provider = new AmbientWeatherProvider(deps);
    const release = provider.retain();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("ready"));
    expect(provider.snapshot().locationFallback).toBe(true);
    expect(requestedUrl(deps.fetchJson)).toContain("latitude=37.57");
    release();
  });

  it("설정을 켜면 위치를 다시 정해 새로 불러온다", async () => {
    const { deps, setPreference } = makeDeps({ preference: null });
    const provider = new AmbientWeatherProvider(deps);
    const release = provider.retain();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("ready"));
    setPreference("on");
    await vi.waitFor(() => expect(deps.fetchJson).toHaveBeenCalledTimes(2));
    expect(deps.getPosition).toHaveBeenCalledTimes(1);
    expect(requestedUrl(deps.fetchJson, 1)).toContain("latitude=35.18");
    await vi.waitFor(() => expect(provider.snapshot().reading?.source).toBe("device"));
    release();
  });
});

describe("AmbientWeatherProvider 실패 처리", () => {
  it("요청이 실패(CSP 차단 등)하면 값 없이 error가 되어 계절 효과로 대체된다", async () => {
    const { deps } = makeDeps();
    deps.fetchJson.mockRejectedValue(new TypeError("Failed to fetch"));
    const provider = new AmbientWeatherProvider(deps);
    const release = provider.retain();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("error"));
    expect(provider.snapshot().reading).toBeNull();
    release();
  });

  it("실패해도 이전 값을 유지한다", async () => {
    const { deps } = makeDeps();
    const provider = new AmbientWeatherProvider(deps);
    const release = provider.retain();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("ready"));
    deps.fetchJson.mockRejectedValueOnce(new Error("network"));
    await provider.refresh();
    expect(provider.snapshot().phase).toBe("ready");
    expect(provider.snapshot().reading?.condition).toBe("clear");
    release();
  });

  it("오프라인이면 요청하지 않는다", async () => {
    const { deps } = makeDeps({ online: false });
    const provider = new AmbientWeatherProvider(deps);
    const release = provider.retain();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("error"));
    expect(deps.fetchJson).not.toHaveBeenCalled();
    release();
  });
});

describe("AmbientWeatherProvider 생명주기", () => {
  it("처음 붙잡을 때 30분 갱신 타이머를 걸고, 마지막으로 놓으면 멈춘다", async () => {
    const { deps, preferenceListeners } = makeDeps();
    const provider = new AmbientWeatherProvider(deps);
    const releaseA = provider.retain();
    const releaseB = provider.retain();
    expect(deps.setInterval).toHaveBeenCalledTimes(1);
    expect(deps.setInterval.mock.calls[0]?.[1]).toBe(AMBIENT_WEATHER_REFRESH_INTERVAL_MS);
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("ready"));
    releaseA();
    releaseA();
    expect(deps.clearInterval).not.toHaveBeenCalled();
    releaseB();
    expect(deps.clearInterval).toHaveBeenCalledTimes(1);
    expect(preferenceListeners.size).toBe(0);
  });

  it("값이 신선하면 다시 붙잡아도 새로 요청하지 않는다", async () => {
    const { deps } = makeDeps();
    const provider = new AmbientWeatherProvider(deps);
    provider.retain()();
    await vi.waitFor(() => expect(provider.snapshot().phase).toBe("ready"));
    const release = provider.retain();
    expect(deps.fetchJson).toHaveBeenCalledTimes(1);
    release();
  });
});
