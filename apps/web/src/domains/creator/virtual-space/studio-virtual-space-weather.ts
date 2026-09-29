/**
 * 가상 스튜디오 실시간 날씨 동기화
 *
 * Open-Meteo API(무료, API 키 불필요)에서 실제 날씨를 가져와
 * 가상 오피스의 창문/외부 영역, NPC 행동, 앰비언트에 반영한다.
 *
 * - 위치: 브라우저 Geolocation → 권한 거부/실패 시 서울 기본값
 * - 갱신: 10분마다 자동
 * - WMO 날씨 코드(Open-Meteo 표준)를 6가지 가상 날씨로 매핑
 *
 * 순수 로직 모듈. 실제 파티클 렌더링(캔버스/Phaser)과
 * Geolocation/fetch 브라우저 바인딩은 의존성 주입으로 분리한다.
 */

/** 가상 날씨 6종. */
export type StudioWeatherCondition =
  | "clear"        // 맑음
  | "cloudy"       // 구름/흐림
  | "fog"          // 안개
  | "rain"         // 비 (이슬비 포함)
  | "snow"         // 눈
  | "thunderstorm";// 천둥번개

/** 날씨 조회 단계. */
export type StudioWeatherPhase = "idle" | "locating" | "loading" | "ready" | "error";

/** 한 번의 날씨 조회 결과. */
export interface StudioWeatherReading {
  readonly temperatureC: number;
  readonly condition: StudioWeatherCondition;
  readonly weatherCode: number;
  readonly fetchedAt: number;
  readonly latitude: number;
  readonly longitude: number;
}

/** 프로바이더 스냅샷. */
export interface StudioWeatherSnapshot {
  readonly phase: StudioWeatherPhase;
  readonly reading: StudioWeatherReading | null;
  /** 마지막 실패 사유 (있으면). 이전 reading은 유지된다. */
  readonly error: string | null;
}

/** 날씨 갱신 주기 (10분). */
export const STUDIO_WEATHER_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** Geolocation 실패 시 기본 위치: 서울. */
export const STUDIO_WEATHER_FALLBACK_LOCATION = { latitude: 37.5665, longitude: 126.978 } as const;

/** 위치 요청 타임아웃 (ms). */
export const STUDIO_WEATHER_GEO_TIMEOUT_MS = 8000;

/**
 * WMO 날씨 코드(Open-Meteo `weather_code`)를 가상 날씨로 매핑한다.
 * 알 수 없는 코드는 안전하게 "cloudy"로 처리한다.
 */
export function mapWmoWeatherCode(code: number): StudioWeatherCondition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code === 95 || code === 96 || code === 99) return "thunderstorm";
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return "snow";
  if (
    (code >= 51 && code <= 57) ||
    (code >= 61 && code <= 67) ||
    (code >= 80 && code <= 82)
  ) return "rain";
  return "cloudy";
}

/** Open-Meteo 요청 URL을 만든다. */
export function buildOpenMeteoUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,weather_code",
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

interface OpenMeteoCurrent {
  readonly temperature_2m?: unknown;
  readonly weather_code?: unknown;
}

/**
 * Open-Meteo 응답을 파싱한다. 형식이 맞지 않으면 null.
 * `fetchedAtMs`, `latitude`, `longitude`는 호출 측에서 주입한다 (테스트 용이성).
 */
export function parseOpenMeteoResponse(
  payload: unknown,
  meta: { fetchedAtMs: number; latitude: number; longitude: number },
): StudioWeatherReading | null {
  if (!payload || typeof payload !== "object") return null;
  const current = (payload as { current?: unknown }).current as OpenMeteoCurrent | undefined;
  if (!current || typeof current !== "object") return null;
  const temperature = current.temperature_2m;
  const code = current.weather_code;
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return null;
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  return {
    temperatureC: Math.round(temperature * 10) / 10,
    condition: mapWmoWeatherCode(Math.trunc(code)),
    weatherCode: Math.trunc(code),
    fetchedAt: meta.fetchedAtMs,
    latitude: meta.latitude,
    longitude: meta.longitude,
  };
}

/* ------------------------------------------------------------------ */
/* 이펙트 프로필 (렌더러가 소비하는 순수 데이터)                          */
/* ------------------------------------------------------------------ */

/** 파티클 스펙 (비/눈). 실제 스폰·업데이트는 렌더러 담당. */
export interface StudioWeatherParticleSpec {
  readonly kind: "rain" | "snow";
  /** 동시 파티클 수 상한 (성능). */
  readonly count: number;
  /** 초당 낙하 속도 범위 (px/s). */
  readonly fallSpeed: { readonly min: number; readonly max: number };
  /** 좌우 흔들림 속도 범위 (px/s). */
  readonly drift: { readonly min: number; readonly max: number };
  /** 파티클 크기 범위 (px). */
  readonly size: { readonly min: number; readonly max: number };
  /** 불투명도 범위. */
  readonly opacity: { readonly min: number; readonly max: number };
  readonly color: string;
  /** 비 기울기 (바람, 라디안). 눈은 0에 가깝다. */
  readonly slant: number;
}

/** 조명/색온도. */
export interface StudioWeatherLighting {
  /** 조명 틴트. */
  readonly tint: string;
  /** 틴트 강도 0~1. */
  readonly tintStrength: number;
  /** 전체 어둡기 0~1. */
  readonly dim: number;
  /** 햇살 광선 표시. */
  readonly sunRays: boolean;
  /** 안개 밀도 0~1. */
  readonly fogDensity: number;
}

/** 창문/외부 영역 뷰. */
export interface StudioWeatherWindowView {
  /** 창문 밖 하늘 그라디언트 (위 → 아래). */
  readonly skyGradient: readonly [string, string];
  readonly showSun: boolean;
  readonly showClouds: boolean;
  readonly showPrecipitation: boolean;
}

/** 번개 스케줄. */
export interface StudioWeatherLightning {
  readonly enabled: boolean;
  readonly minIntervalMs: number;
  readonly maxIntervalMs: number;
  readonly flashDurationMs: number;
}

/** 날씨별 이펙트 프로필. */
export interface StudioWeatherEffectProfile {
  readonly condition: StudioWeatherCondition;
  readonly reducedMotion: boolean;
  readonly particles: readonly StudioWeatherParticleSpec[];
  readonly lighting: StudioWeatherLighting;
  readonly window: StudioWeatherWindowView;
  readonly lightning: StudioWeatherLightning;
  /** 매칭되는 앰비언트 트랙 힌트 (없으면 null). */
  readonly ambientTrackId: "gentle-rain" | "window-rain" | null;
}

/** 파티클 수 상한 (성능 가드). */
export const STUDIO_WEATHER_MAX_PARTICLES = 400;

const RAIN_SPEC: StudioWeatherParticleSpec = {
  kind: "rain",
  count: 320,
  fallSpeed: { min: 520, max: 780 },
  drift: { min: -40, max: 40 },
  size: { min: 1, max: 2 },
  opacity: { min: 0.35, max: 0.7 },
  color: "#9db8d6",
  slant: 0.18,
};

const SNOW_SPEC: StudioWeatherParticleSpec = {
  kind: "snow",
  count: 220,
  fallSpeed: { min: 40, max: 110 },
  drift: { min: -60, max: 60 },
  size: { min: 2, max: 5 },
  opacity: { min: 0.5, max: 0.9 },
  color: "#ffffff",
  slant: 0.02,
};

interface WeatherStaticProfile {
  readonly lighting: StudioWeatherLighting;
  readonly window: StudioWeatherWindowView;
  readonly lightning: StudioWeatherLightning;
  readonly ambientTrackId: "gentle-rain" | "window-rain" | null;
  readonly particles: readonly StudioWeatherParticleSpec[];
}

const STATIC_PROFILES: Record<StudioWeatherCondition, WeatherStaticProfile> = {
  clear: {
    lighting: { tint: "#ffd9a0", tintStrength: 0.25, dim: 0, sunRays: true, fogDensity: 0 },
    window: { skyGradient: ["#7db8f0", "#cfe8ff"], showSun: true, showClouds: false, showPrecipitation: false },
    lightning: { enabled: false, minIntervalMs: 0, maxIntervalMs: 0, flashDurationMs: 0 },
    ambientTrackId: null,
    particles: [],
  },
  cloudy: {
    lighting: { tint: "#aebfd4", tintStrength: 0.3, dim: 0.25, sunRays: false, fogDensity: 0 },
    window: { skyGradient: ["#8fa3b8", "#c3cfdd"], showSun: false, showClouds: true, showPrecipitation: false },
    lightning: { enabled: false, minIntervalMs: 0, maxIntervalMs: 0, flashDurationMs: 0 },
    ambientTrackId: null,
    particles: [],
  },
  fog: {
    lighting: { tint: "#c8d2dd", tintStrength: 0.35, dim: 0.2, sunRays: false, fogDensity: 0.75 },
    window: { skyGradient: ["#b9c4d0", "#dbe2ea"], showSun: false, showClouds: false, showPrecipitation: false },
    lightning: { enabled: false, minIntervalMs: 0, maxIntervalMs: 0, flashDurationMs: 0 },
    ambientTrackId: null,
    particles: [],
  },
  rain: {
    lighting: { tint: "#8ea6c4", tintStrength: 0.35, dim: 0.4, sunRays: false, fogDensity: 0.15 },
    window: { skyGradient: ["#5d7186", "#93a5b8"], showSun: false, showClouds: true, showPrecipitation: true },
    lightning: { enabled: false, minIntervalMs: 0, maxIntervalMs: 0, flashDurationMs: 0 },
    ambientTrackId: "gentle-rain",
    particles: [RAIN_SPEC],
  },
  snow: {
    lighting: { tint: "#dfe9f5", tintStrength: 0.3, dim: 0.15, sunRays: false, fogDensity: 0.25 },
    window: { skyGradient: ["#a9bdd4", "#e4ecf5"], showSun: false, showClouds: true, showPrecipitation: true },
    lightning: { enabled: false, minIntervalMs: 0, maxIntervalMs: 0, flashDurationMs: 0 },
    ambientTrackId: null,
    particles: [SNOW_SPEC],
  },
  thunderstorm: {
    lighting: { tint: "#7d8ba3", tintStrength: 0.4, dim: 0.55, sunRays: false, fogDensity: 0.2 },
    window: { skyGradient: ["#3d4a5e", "#6d7d94"], showSun: false, showClouds: true, showPrecipitation: true },
    lightning: { enabled: true, minIntervalMs: 4000, maxIntervalMs: 14000, flashDurationMs: 220 },
    ambientTrackId: "window-rain",
    particles: [{ ...RAIN_SPEC, count: 400, fallSpeed: { min: 620, max: 900 } }],
  },
};

/**
 * 날씨별 이펙트 프로필을 만든다.
 * `reducedMotion`이면 파티클·번개를 끄고 정적 표시만 남긴다.
 */
export function studioWeatherEffectProfile(
  condition: StudioWeatherCondition,
  options: { reducedMotion: boolean },
): StudioWeatherEffectProfile {
  const base = STATIC_PROFILES[condition];
  if (!options.reducedMotion) {
    return { condition, reducedMotion: false, particles: base.particles, lighting: base.lighting, window: base.window, lightning: base.lightning, ambientTrackId: base.ambientTrackId };
  }
  return {
    condition,
    reducedMotion: true,
    particles: [],
    lighting: base.lighting,
    window: base.window,
    lightning: { ...base.lightning, enabled: false },
    ambientTrackId: base.ambientTrackId,
  };
}

/* ------------------------------------------------------------------ */
/* NPC 날씨 반응                                                        */
/* ------------------------------------------------------------------ */

/** NPC 날씨 반응 가이드. */
export interface StudioWeatherNpcGuidance {
  /** 야외 NPC가 실내로 대피해야 하는지. */
  readonly seekShelter: boolean;
  /** 야외 활동(순찰 등)을 중단하는지. */
  readonly pauseOutdoor: boolean;
  /** 실내 이동 시 NPC 대사 키 (라벨 파일에서 조회). */
  readonly speechKey: "shelter-rain" | "shelter-snow" | "shelter-storm" | "enjoy-clear" | "none";
}

/**
 * 날씨에 따른 NPC 행동 가이드를 만든다.
 * 실제 이동·대사는 NPC 디렉터(schedule/activity)가 소비한다.
 */
export function studioWeatherNpcGuidance(condition: StudioWeatherCondition): StudioWeatherNpcGuidance {
  switch (condition) {
    case "rain":
      return { seekShelter: true, pauseOutdoor: true, speechKey: "shelter-rain" };
    case "snow":
      return { seekShelter: true, pauseOutdoor: true, speechKey: "shelter-snow" };
    case "thunderstorm":
      return { seekShelter: true, pauseOutdoor: true, speechKey: "shelter-storm" };
    case "clear":
      return { seekShelter: false, pauseOutdoor: false, speechKey: "enjoy-clear" };
    default:
      return { seekShelter: false, pauseOutdoor: false, speechKey: "none" };
  }
}

/* ------------------------------------------------------------------ */
/* 날씨 프로바이더 (fetch/위치 주입)                                    */
/* ------------------------------------------------------------------ */

/** 브라우저 바인딩 (테스트에서 가짜로 교체). */
export interface StudioWeatherDependencies {
  fetchJson(url: string, signal: AbortSignal): Promise<unknown>;
  getPosition(): Promise<{ latitude: number; longitude: number }>;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
}

const browserDependencies: StudioWeatherDependencies = {
  async fetchJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`날씨 요청 실패: ${response.status}`);
    return response.json() as Promise<unknown>;
  },
  getPosition() {
    return new Promise<{ latitude: number; longitude: number }>((resolve) => {
      const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
      if (!geo) {
        resolve({ ...STUDIO_WEATHER_FALLBACK_LOCATION });
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve({ ...STUDIO_WEATHER_FALLBACK_LOCATION }); }
      }, STUDIO_WEATHER_GEO_TIMEOUT_MS);
      geo.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        },
        () => {
          // 권한 거부 등: 서울 기본값
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ...STUDIO_WEATHER_FALLBACK_LOCATION });
        },
        { timeout: STUDIO_WEATHER_GEO_TIMEOUT_MS, maximumAge: 30 * 60 * 1000 },
      );
    });
  },
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

/**
 * 실시간 날씨 프로바이더.
 *
 * - start(): 위치 획득 → 날씨 로드 → 10분마다 갱신
 * - 실패해도 마지막 reading을 유지하고 phase만 "error"로 둔다
 * - dispose()로 타이머 정리
 */
export class StudioVirtualWeatherProvider {
  private state: StudioWeatherSnapshot = { phase: "idle", reading: null, error: null };
  private listeners = new Set<() => void>();
  private timer: unknown = null;
  private generation = 0;
  private disposed = false;
  private readonly deps: StudioWeatherDependencies;

  constructor(deps: Partial<StudioWeatherDependencies> = {}) {
    this.deps = { ...browserDependencies, ...deps };
  }

  snapshot = (): StudioWeatherSnapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<StudioWeatherSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** 날씨 동기화를 시작한다. */
  start(): void {
    if (this.disposed || this.timer !== null) return;
    void this.locateAndLoad();
    this.timer = this.deps.setInterval(() => { void this.load(); }, STUDIO_WEATHER_REFRESH_INTERVAL_MS);
  }

  /** 수동 갱신. */
  refresh(): Promise<void> {
    return this.load();
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    if (this.timer !== null) {
      this.deps.clearInterval(this.timer);
      this.timer = null;
    }
    this.listeners.clear();
  }

  private async locateAndLoad(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.update({ phase: "locating", error: null });
    try {
      const position = await this.deps.getPosition();
      if (this.disposed || generation !== this.generation) return;
      await this.fetchReading(position.latitude, position.longitude, generation);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      // 위치 실패 시도 서울 기본값으로 한 번 더 시도
      await this.fetchReading(
        STUDIO_WEATHER_FALLBACK_LOCATION.latitude,
        STUDIO_WEATHER_FALLBACK_LOCATION.longitude,
        generation,
        error,
      );
    }
  }

  private async load(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    const previous = this.state.reading;
    const latitude = previous?.latitude ?? STUDIO_WEATHER_FALLBACK_LOCATION.latitude;
    const longitude = previous?.longitude ?? STUDIO_WEATHER_FALLBACK_LOCATION.longitude;
    await this.fetchReading(latitude, longitude, generation);
  }

  private async fetchReading(
    latitude: number,
    longitude: number,
    generation: number,
    cause?: unknown,
  ): Promise<void> {
    this.update({ phase: "loading", error: null });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const payload = await this.deps.fetchJson(buildOpenMeteoUrl(latitude, longitude), controller.signal);
      if (this.disposed || generation !== this.generation) return;
      const reading = parseOpenMeteoResponse(payload, {
        fetchedAtMs: this.deps.now(),
        latitude,
        longitude,
      });
      if (!reading) throw new Error("날씨 응답 형식이 올바르지 않습니다");
      this.update({ phase: "ready", reading, error: null });
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      const message = cause instanceof Error ? cause.message
        : error instanceof Error ? error.message
        : "날씨를 불러오지 못했습니다";
      // 이전 reading 유지, phase만 error
      this.update({ phase: this.state.reading ? "ready" : "error", error: message });
    } finally {
      clearTimeout(timeout);
    }
  }
}
