/**
 * 배경 효과용 실시간 날씨.
 *
 * Open-Meteo(무료·키 불필요)에서 현재 날씨를 읽어 배경 효과(비·눈·햇살 등)를 고른다.
 * virtual-space의 studio-virtual-space-weather.ts와 같은 WMO 기준을 쓰되,
 * shared → domains 역참조를 피하려고 사이트 전체용으로 가볍게 분리한 모듈이다.
 *
 * 위치 정책 (위치 권한 팝업을 스스로 띄우지 않는다):
 * - 기본은 서울 날씨.
 * - 사용자가 설정에서 '내 위치 날씨 사용'을 켰거나, 설정을 고른 적이 없고 위치 권한이
 *   이미 허용(granted)된 경우에만 기기 위치를 쓴다. 명시적으로 끈 경우에는 쓰지 않는다.
 * - 좌표는 소수 둘째 자리(약 1km)로 반올림해 날씨 조회에만 쓰고 저장하지 않는다.
 * - 요청 실패·CSP 차단·오프라인이면 조용히 실패 상태로 두고, 엔진이 계절 효과로 대체한다.
 */

import {
  readAmbientPreferences,
  subscribeAmbientPreferences,
  type AmbientLocationPreference,
} from "./ambient-preferences";

/** 사이트 날씨 6종 (가상 오피스와 같은 체계). */
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
];

/** 날씨를 조회한 위치의 출처. */
export type AmbientLocationSource = "default" | "device";

export interface AmbientWeatherReading {
  readonly temperatureC: number;
  readonly condition: AmbientWeatherCondition;
  readonly weatherCode: number;
  readonly fetchedAt: number;
  readonly source: AmbientLocationSource;
}

/**
 * idle: 아직 요청 전, loading: 요청 중,
 * ready: 값 있음(마지막 갱신이 실패해도 이전 값을 유지), error: 값 없이 실패.
 */
export type AmbientWeatherPhase = "idle" | "loading" | "ready" | "error";

export interface AmbientWeatherSnapshot {
  readonly phase: AmbientWeatherPhase;
  readonly reading: AmbientWeatherReading | null;
  /** 내 위치를 쓰려 했지만 권한 거부·시간 초과로 기본 위치를 쓴 경우 true. */
  readonly locationFallback: boolean;
}

/** 날씨 갱신 주기: 30분. */
export const AMBIENT_WEATHER_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
/** 날씨 요청 제한 시간. */
export const AMBIENT_WEATHER_REQUEST_TIMEOUT_MS = 10_000;
/** 위치 확인 제한 시간(권한 팝업 응답 대기 포함). 넘기면 기본 위치로 진행한다. */
export const AMBIENT_LOCATION_TIMEOUT_MS = 12_000;

/** 좌표를 소수 둘째 자리로 반올림한다(약 1km 정밀도). */
export function roundAmbientCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 기본 위치: 서울. */
export const AMBIENT_WEATHER_DEFAULT_LOCATION = {
  latitude: roundAmbientCoordinate(37.5665),
  longitude: roundAmbientCoordinate(126.978),
} as const;

/** WMO 날씨 코드 → 사이트 날씨 (virtual-space 매핑과 같은 기준). */
export function mapAmbientWmoCode(code: number): AmbientWeatherCondition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code === 95 || code === 96 || code === 99) return "thunderstorm";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return "rain";
  }
  return "cloudy";
}

/** Open-Meteo 요청 URL. 좌표는 항상 반올림해서 보낸다. */
export function buildAmbientWeatherUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: roundAmbientCoordinate(latitude).toFixed(2),
    longitude: roundAmbientCoordinate(longitude).toFixed(2),
    current: "temperature_2m,weather_code",
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/** Open-Meteo 응답 파싱. 형식이 맞지 않으면 null. */
export function parseAmbientWeatherResponse(
  payload: unknown,
  meta: { readonly fetchedAtMs: number; readonly source: AmbientLocationSource },
): AmbientWeatherReading | null {
  if (!payload || typeof payload !== "object") return null;
  const current: unknown = (payload as { current?: unknown }).current;
  if (!current || typeof current !== "object") return null;
  const { temperature_2m: temperature, weather_code: code } = current as {
    temperature_2m?: unknown;
    weather_code?: unknown;
  };
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return null;
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  return {
    temperatureC: Math.round(temperature * 10) / 10,
    condition: mapAmbientWmoCode(Math.trunc(code)),
    weatherCode: Math.trunc(code),
    fetchedAt: meta.fetchedAtMs,
    source: meta.source,
  };
}

/* ------------------------------------------------------------------ */
/* 브라우저 위치 권한                                                   */
/* ------------------------------------------------------------------ */

export type AmbientGeolocationPermission = "granted" | "prompt" | "denied" | "unsupported";

interface PolicyDocument {
  readonly permissionsPolicy?: { allowsFeature(feature: string): boolean };
  readonly featurePolicy?: { allowsFeature(feature: string): boolean };
}

/**
 * 이 문서에서 위치 기능을 쓸 수 있는지.
 * 운영 헤더의 Permissions-Policy가 geolocation을 막으면 false (지원 브라우저 한정).
 */
export function isAmbientGeolocationAvailable(): boolean {
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;
  if (typeof document === "undefined") return false;
  const policyDocument = document as Document & PolicyDocument;
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy;
  if (!policy) return true;
  try {
    return policy.allowsFeature("geolocation");
  } catch {
    return true;
  }
}

async function queryBrowserGeolocationPermission(): Promise<AmbientGeolocationPermission> {
  if (!isAmbientGeolocationAvailable()) return "denied";
  const permissions = typeof navigator === "undefined" ? undefined : navigator.permissions;
  if (!permissions?.query) return "unsupported";
  try {
    const status = await permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unsupported";
  }
}

function getBrowserPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!isAmbientGeolocationAvailable()) {
      reject(new Error("geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => reject(new Error(error.message || "geolocation failed")),
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: AMBIENT_WEATHER_REFRESH_INTERVAL_MS },
    );
  });
}

/* ------------------------------------------------------------------ */
/* 프로바이더                                                          */
/* ------------------------------------------------------------------ */

export interface AmbientWeatherDependencies {
  fetchJson(url: string, signal: AbortSignal): Promise<unknown>;
  queryGeolocationPermission(): Promise<AmbientGeolocationPermission>;
  getPosition(): Promise<{ latitude: number; longitude: number }>;
  readLocationPreference(): AmbientLocationPreference;
  subscribePreferences(listener: () => void): () => void;
  isOnline(): boolean;
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

const browserDependencies: AmbientWeatherDependencies = {
  async fetchJson(url, signal) {
    const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(`weather request failed: ${response.status}`);
    return response.json() as Promise<unknown>;
  },
  queryGeolocationPermission: queryBrowserGeolocationPermission,
  getPosition: getBrowserPosition,
  readLocationPreference: () => readAmbientPreferences().location,
  subscribePreferences: subscribeAmbientPreferences,
  isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
  setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

interface ResolvedLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly source: AmbientLocationSource;
  readonly fallback: boolean;
}

const DEFAULT_RESOLVED_LOCATION: ResolvedLocation = {
  ...AMBIENT_WEATHER_DEFAULT_LOCATION,
  source: "default",
  fallback: false,
};

/**
 * 사이트 날씨 프로바이더 (앱 전역 싱글톤).
 *
 * - retain(): 날씨가 필요한 동안 붙잡는다. 처음 붙잡을 때 불러오고 30분마다 갱신한다.
 *   마지막 사용자가 놓으면 타이머를 멈춘다(마지막 값은 유지).
 * - 위치 설정이 바뀌면 위치를 다시 정하고 새로 불러온다.
 * - 실패해도 마지막 값을 유지한다.
 */
export class AmbientWeatherProvider {
  private state: AmbientWeatherSnapshot = { phase: "idle", reading: null, locationFallback: false };
  private readonly listeners = new Set<() => void>();
  private readonly deps: AmbientWeatherDependencies;
  private retainCount = 0;
  private refreshTimer: unknown = null;
  private unsubscribePreferences: (() => void) | null = null;
  private generation = 0;
  private location: ResolvedLocation = DEFAULT_RESOLVED_LOCATION;
  /** 마지막으로 위치를 정할 때 쓴 설정. undefined면 아직 정하지 않았다. */
  private locatedWith: AmbientLocationPreference | undefined;

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

  /** 날씨가 필요한 동안 호출하고, 반환된 함수로 놓는다. */
  retain(): () => void {
    this.retainCount += 1;
    if (this.retainCount === 1) this.start();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.retainCount -= 1;
      if (this.retainCount === 0) this.stop();
    };
  }

  /** 위치를 다시 정하고 날씨를 새로 불러온다. */
  refresh(): Promise<void> {
    return this.load(true);
  }

  private update(patch: Partial<AmbientWeatherSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private start(): void {
    this.unsubscribePreferences = this.deps.subscribePreferences(() => {
      if (this.deps.readLocationPreference() !== this.locatedWith) void this.load(true);
    });
    this.refreshTimer = this.deps.setInterval(() => {
      void this.load(false);
    }, AMBIENT_WEATHER_REFRESH_INTERVAL_MS);

    const reading = this.state.reading;
    const fresh =
      reading !== null
      && this.deps.now() - reading.fetchedAt < AMBIENT_WEATHER_REFRESH_INTERVAL_MS
      && this.deps.readLocationPreference() === this.locatedWith;
    if (!fresh) void this.load(true);
  }

  private stop(): void {
    if (this.refreshTimer !== null) {
      this.deps.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.unsubscribePreferences?.();
    this.unsubscribePreferences = null;
  }

  private async load(relocate: boolean): Promise<void> {
    const generation = ++this.generation;
    if (relocate || this.locatedWith === undefined) {
      const preference = this.deps.readLocationPreference();
      this.locatedWith = preference;
      if (this.state.phase === "idle") this.update({ phase: "loading" });
      const location = await this.resolveLocation(preference);
      if (generation !== this.generation) return;
      this.location = location;
      if (location.fallback !== this.state.locationFallback) {
        this.update({ locationFallback: location.fallback });
      }
    }
    if (!this.deps.isOnline()) {
      this.update({ phase: this.state.reading ? "ready" : "error" });
      return;
    }
    this.update({ phase: this.state.reading ? "ready" : "loading" });
    await this.fetchReading(this.location, generation);
  }

  private async resolveLocation(preference: AmbientLocationPreference): Promise<ResolvedLocation> {
    if (preference === "off") return DEFAULT_RESOLVED_LOCATION;
    if (preference === null) {
      // 고른 적이 없으면 이미 허용된 경우에만 기기 위치를 쓴다(권한 팝업을 띄우지 않는다).
      const permission = await this.deps.queryGeolocationPermission().catch(() => "unsupported");
      if (permission !== "granted") return DEFAULT_RESOLVED_LOCATION;
    }
    try {
      const position = await this.withTimeout(this.deps.getPosition(), AMBIENT_LOCATION_TIMEOUT_MS);
      return {
        latitude: roundAmbientCoordinate(position.latitude),
        longitude: roundAmbientCoordinate(position.longitude),
        source: "device",
        fallback: false,
      };
    } catch {
      return { ...DEFAULT_RESOLVED_LOCATION, fallback: preference === "on" };
    }
  }

  private async fetchReading(location: ResolvedLocation, generation: number): Promise<void> {
    const controller = new AbortController();
    const timeout = this.deps.setTimeout(() => controller.abort(), AMBIENT_WEATHER_REQUEST_TIMEOUT_MS);
    try {
      const payload = await this.deps.fetchJson(
        buildAmbientWeatherUrl(location.latitude, location.longitude),
        controller.signal,
      );
      if (generation !== this.generation) return;
      const reading = parseAmbientWeatherResponse(payload, {
        fetchedAtMs: this.deps.now(),
        source: location.source,
      });
      if (!reading) throw new Error("unexpected weather payload");
      this.update({ phase: "ready", reading });
    } catch {
      // 네트워크 실패·CSP 차단·형식 오류: 마지막 값을 유지하고, 값이 없으면 계절 효과로 대체된다.
      if (generation !== this.generation) return;
      this.update({ phase: this.state.reading ? "ready" : "error" });
    } finally {
      this.deps.clearTimeout(timeout);
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = this.deps.setTimeout(() => reject(new Error("timeout")), ms);
      promise.then(
        (value) => {
          this.deps.clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          this.deps.clearTimeout(timer);
          reject(error instanceof Error ? error : new Error("location failed"));
        },
      );
    });
  }
}

/** 앱 전역에서 공유하는 싱글톤. */
export const ambientWeatherProvider = new AmbientWeatherProvider();
