/**
 * 사이트 전체 실시간 날씨 동기화.
 *
 * Open-Meteo API(무료, API 키 불필요)에서 실제 날씨를 가져와
 * 사이트 전체 앰비언트 파티클(비/눈)과 분위기에 반영한다.
 *
 * virtual-space의 studio-virtual-space-weather.ts와 같은 WMO 매핑을 사용하되,
 * 사이트 전체용으로 가볍게 만든 독립 모듈이다 (shared → domains 역참조 방지).
 *
 * 순수 로직 + 의존성 주입 프로바이더. fetch/위치 바인딩은 주입으로 분리.
 */

/** 사이트 날씨 6종 (가상 오피스와 동일 체계). */
export type AmbientWeatherCondition =
  | "clear"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "thunderstorm";

export const AMBIENT_WEATHER_CONDITIONS: readonly AmbientWeatherCondition[] = [
  "clear",
  "cloudy",
  "fog",
  "rain",
  "snow",
  "thunderstorm",
] as const;

export type AmbientWeatherPhase = "idle" | "locating" | "loading" | "ready" | "error";

export interface AmbientWeatherReading {
  readonly temperatureC: number;
  readonly condition: AmbientWeatherCondition;
  readonly weatherCode: number;
  readonly fetchedAt: number;
}

export interface AmbientWeatherSnapshot {
  readonly phase: AmbientWeatherPhase;
  readonly reading: AmbientWeatherReading | null;
  readonly error: string | null;
}

/** 날씨 갱신 주기 (30분 — 사이트 전체용이므로 가상 오피스보다 길게). */
export const AMBIENT_WEATHER_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/** 위치 실패 시 기본값: 서울. */
export const AMBIENT_WEATHER_FALLBACK_LOCATION = { latitude: 37.5665, longitude: 126.978 } as const;

/**
 * WMO 날씨 코드를 사이트 날씨로 매핑한다.
 * virtual-space 매핑과 동일한 기준.
 */
export function mapAmbientWmoCode(code: number): AmbientWeatherCondition {
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

/** Open-Meteo 요청 URL. */
export function buildAmbientWeatherUrl(latitude: number, longitude: number): string {
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

/** Open-Meteo 응답 파싱. 형식이 맞지 않으면 null. */
export function parseAmbientWeatherResponse(
  payload: unknown,
  meta: { fetchedAtMs: number },
): AmbientWeatherReading | null {
  if (!payload || typeof payload !== "object") return null;
  const current = (payload as { current?: unknown }).current as OpenMeteoCurrent | undefined;
  if (!current || typeof current !== "object") return null;
  const temperature = current.temperature_2m;
  const code = current.weather_code;
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return null;
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  return {
    temperatureC: Math.round(temperature * 10) / 10,
    condition: mapAmbientWmoCode(Math.trunc(code)),
    weatherCode: Math.trunc(code),
    fetchedAt: meta.fetchedAtMs,
  };
}

/** 날씨 → 사이트 파티클 힌트. 비/눈/천둥번개만 파티클을 만든다. */
export type AmbientWeatherParticle = "rain" | "snow" | "none";

export function weatherParticleFor(condition: AmbientWeatherCondition): AmbientWeatherParticle {
  switch (condition) {
    case "rain":
    case "thunderstorm":
      return "rain";
    case "snow":
      return "snow";
    default:
      return "none";
  }
}

/** 날씨 → 추가 틴트 조정 (시간 틴트 위에 겹친다). */
export interface AmbientWeatherTint {
  /** 틴트 색상 (null이면 조정 없음). */
  readonly color: string | null;
  /** 불투명도 0~1. */
  readonly opacity: number;
}

export function weatherTintFor(condition: AmbientWeatherCondition): AmbientWeatherTint {
  switch (condition) {
    case "rain":
      return { color: "#5d7186", opacity: 0.08 };
    case "thunderstorm":
      return { color: "#3d4a5e", opacity: 0.14 };
    case "snow":
      return { color: "#dfe9f5", opacity: 0.06 };
    case "fog":
      return { color: "#c8d2dd", opacity: 0.08 };
    case "cloudy":
      return { color: "#aebfd4", opacity: 0.05 };
    case "clear":
      return { color: null, opacity: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* 프로바이더                                                          */
/* ------------------------------------------------------------------ */

export interface AmbientWeatherDependencies {
  fetchJson(url: string, signal: AbortSignal): Promise<unknown>;
  getPosition(): Promise<{ latitude: number; longitude: number }>;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  now(): number;
}

const browserDependencies: AmbientWeatherDependencies = {
  async fetchJson(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`날씨 요청 실패: ${response.status}`);
    return response.json() as Promise<unknown>;
  },
  getPosition() {
    return new Promise<{ latitude: number; longitude: number }>((resolve) => {
      const geo = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
      if (!geo) {
        resolve({ ...AMBIENT_WEATHER_FALLBACK_LOCATION });
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ ...AMBIENT_WEATHER_FALLBACK_LOCATION });
        }
      }, 8000);
      geo.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ...AMBIENT_WEATHER_FALLBACK_LOCATION });
        },
        { timeout: 8000, maximumAge: 30 * 60 * 1000 },
      );
    });
  },
  setInterval: (handler, ms) => setInterval(handler, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  now: () => Date.now(),
};

/**
 * 사이트 날씨 프로바이더 (싱글톤으로 사용).
 * - start(): 위치 → 로드 → 30분마다 갱신
 * - 실패해도 마지막 reading 유지
 */
export class AmbientWeatherProvider {
  private state: AmbientWeatherSnapshot = { phase: "idle", reading: null, error: null };
  private listeners = new Set<() => void>();
  private timer: unknown = null;
  private generation = 0;
  private disposed = false;
  private position: { latitude: number; longitude: number } | null = null;
  private readonly deps: AmbientWeatherDependencies;

  constructor(deps: Partial<AmbientWeatherDependencies> = {}) {
    this.deps = { ...browserDependencies, ...deps };
  }

  snapshot = (): AmbientWeatherSnapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(patch: Partial<AmbientWeatherSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  start(): void {
    if (this.disposed || this.timer !== null) return;
    void this.locateAndLoad();
    this.timer = this.deps.setInterval(() => {
      void this.load();
    }, AMBIENT_WEATHER_REFRESH_INTERVAL_MS);
  }

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
      this.position = await this.deps.getPosition();
    } catch {
      this.position = { ...AMBIENT_WEATHER_FALLBACK_LOCATION };
    }
    if (this.disposed || generation !== this.generation || !this.position) return;
    await this.fetchReading(this.position.latitude, this.position.longitude, generation);
  }

  private async load(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    const latitude = this.position?.latitude ?? AMBIENT_WEATHER_FALLBACK_LOCATION.latitude;
    const longitude = this.position?.longitude ?? AMBIENT_WEATHER_FALLBACK_LOCATION.longitude;
    await this.fetchReading(latitude, longitude, generation);
  }

  private async fetchReading(latitude: number, longitude: number, generation: number): Promise<void> {
    this.update({ phase: "loading", error: null });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const payload = await this.deps.fetchJson(
        buildAmbientWeatherUrl(latitude, longitude),
        controller.signal,
      );
      if (this.disposed || generation !== this.generation) return;
      const reading = parseAmbientWeatherResponse(payload, { fetchedAtMs: this.deps.now() });
      if (!reading) throw new Error("날씨 응답 형식이 올바르지 않습니다");
      this.update({ phase: "ready", reading, error: null });
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      const message = error instanceof Error ? error.message : "날씨를 불러오지 못했습니다";
      this.update({ phase: this.state.reading ? "ready" : "error", error: message });
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** 앱 전역에서 공유하는 싱글톤. */
export const ambientWeatherProvider = new AmbientWeatherProvider();
