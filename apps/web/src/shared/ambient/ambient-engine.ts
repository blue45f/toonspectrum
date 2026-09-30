/**
 * 앰비언트 연출 엔진: 전역 설정과 오케스트레이션.
 *
 * - 연출 강도: off / subtle / vivid (localStorage 저장)
 * - prefers-reduced-motion 완벽 준수 (켜져 있으면 파티클·트랜지션 중단)
 * - 저사양 감지: 모바일·저전력 모드에서 파티클 밀도 자동 하향
 * - 시간/날씨/계절 상태를 모아 파티클 스펙을 결정하는 순수 함수
 */

import {
  phaseForDate,
  seasonForDate,
  seasonParticleFor,
  tintProfileForPhase,
  type AmbientSeason,
  type AmbientSeasonParticle,
  type AmbientTimePhase,
  type AmbientTintProfile,
} from "./ambient-time";
import {
  weatherParticleFor,
  weatherTintFor,
  type AmbientWeatherCondition,
  type AmbientWeatherParticle,
} from "./ambient-weather";

/** 연출 강도. */
export type AmbientIntensity = "off" | "subtle" | "vivid";
export type { AmbientSeason, AmbientTimePhase } from "./ambient-time";

export const AMBIENT_INTENSITIES: readonly AmbientIntensity[] = ["off", "subtle", "vivid"] as const;

/** 기본 강도: 은은하게. */
export const AMBIENT_DEFAULT_INTENSITY: AmbientIntensity = "subtle";

const AMBIENT_STORAGE_KEY = "toonstudio.ambient.intensity.v1";

export interface AmbientPreferences {
  readonly intensity: AmbientIntensity;
}

/** 저장된 강도를 읽는다. 잘못된 값이면 기본값. */
export function readAmbientPreferences(): AmbientPreferences {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(AMBIENT_STORAGE_KEY) : null;
    if (raw === "off" || raw === "subtle" || raw === "vivid") {
      return { intensity: raw };
    }
  } catch {
    // 저장소 접근 실패 → 기본값
  }
  return { intensity: AMBIENT_DEFAULT_INTENSITY };
}

/** 강도를 저장한다. */
export function writeAmbientIntensity(intensity: AmbientIntensity): void {
  try {
    localStorage.setItem(AMBIENT_STORAGE_KEY, intensity);
  } catch {
    // 무시 (프라이빗 모드 등)
  }
}

/** prefers-reduced-motion 감지. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 저사양 환경 감지 (모바일·저전력). 파티클 밀도 하향용. */
export function isLowPowerEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  // 모바일 UA 또는 save-data
  const ua = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  const saveData = connection?.saveData === true;
  // 코어 수가 적으면 저사양으로 간주
  const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : 8;
  return isMobile || saveData || cores <= 4;
}

/* ------------------------------------------------------------------ */
/* 파티클 스펙 결정 (순수 함수)                                          */
/* ------------------------------------------------------------------ */

/** 캔버스 파티클 종류 (날씨 + 계절 통합). */
export type AmbientParticleKind =
  | "rain"
  | "snow"
  | "petal"
  | "leaf"
  | "firefly"
  | "snowflake";

export interface AmbientParticleSpec {
  readonly kind: AmbientParticleKind;
  /** 동시 파티클 수 (밀도 기준값, 디바이스·강도로 스케일). */
  readonly count: number;
  readonly fallSpeed: { readonly min: number; readonly max: number };
  readonly drift: { readonly min: number; readonly max: number };
  readonly size: { readonly min: number; readonly max: number };
  readonly opacity: { readonly min: number; readonly max: number };
  readonly color: string;
  /** 그리기 방식. */
  readonly shape: "line" | "circle" | "petal" | "leaf" | "glow";
  /** 기울기 (비). */
  readonly slant: number;
}

const PARTICLE_SPECS: Record<AmbientParticleKind, AmbientParticleSpec> = {
  rain: {
    kind: "rain", count: 140,
    fallSpeed: { min: 480, max: 720 }, drift: { min: -30, max: 30 },
    size: { min: 1, max: 2 }, opacity: { min: 0.25, max: 0.5 },
    color: "#9db8d6", shape: "line", slant: 0.15,
  },
  snow: {
    kind: "snow", count: 90,
    fallSpeed: { min: 35, max: 95 }, drift: { min: -50, max: 50 },
    size: { min: 2, max: 4 }, opacity: { min: 0.4, max: 0.8 },
    color: "#ffffff", shape: "circle", slant: 0,
  },
  petal: {
    kind: "petal", count: 36,
    fallSpeed: { min: 25, max: 60 }, drift: { min: -70, max: 70 },
    size: { min: 6, max: 12 }, opacity: { min: 0.5, max: 0.9 },
    color: "#ffc7dd", shape: "petal", slant: 0,
  },
  leaf: {
    kind: "leaf", count: 32,
    fallSpeed: { min: 30, max: 70 }, drift: { min: -60, max: 60 },
    size: { min: 7, max: 13 }, opacity: { min: 0.5, max: 0.85 },
    color: "#e8963c", shape: "leaf", slant: 0,
  },
  firefly: {
    kind: "firefly", count: 24,
    fallSpeed: { min: -15, max: 15 }, drift: { min: -40, max: 40 },
    size: { min: 2, max: 4 }, opacity: { min: 0.3, max: 0.9 },
    color: "#fff3a0", shape: "glow", slant: 0,
  },
  snowflake: {
    kind: "snowflake", count: 50,
    fallSpeed: { min: 20, max: 55 }, drift: { min: -40, max: 40 },
    size: { min: 3, max: 6 }, opacity: { min: 0.35, max: 0.7 },
    color: "#ffffff", shape: "circle", slant: 0,
  },
};

export interface AmbientSceneInput {
  readonly intensity: AmbientIntensity;
  readonly reducedMotion: boolean;
  readonly lowPower: boolean;
  readonly weather: AmbientWeatherCondition | null;
  readonly date: Date;
}

export interface AmbientScene {
  readonly timePhase: AmbientTimePhase;
  readonly season: AmbientSeason;
  readonly tint: AmbientTintProfile;
  /** 날씨 틴트 (시간 틴트 위에 겹침). */
  readonly weatherTintColor: string | null;
  readonly weatherTintOpacity: number;
  /** 렌더링할 파티클 스펙 (밀도 조정済み). */
  readonly particles: readonly AmbientParticleSpec[];
  /** 파티클을 그릴지. */
  readonly particlesEnabled: boolean;
  /** 시간 틴트를 적용할지. */
  readonly tintEnabled: boolean;
}

function weatherToKind(weather: AmbientWeatherParticle): AmbientParticleKind | null {
  if (weather === "rain") return "rain";
  if (weather === "snow") return "snow";
  return null;
}

function seasonToKind(season: AmbientSeasonParticle): AmbientParticleKind | null {
  if (season === "none") return null;
  return season;
}

/**
 * 현재 상태 → 렌더 장면 결정 (순수 함수).
 *
 * 규칙:
 * - intensity off → 전부 끔
 * - reducedMotion → 파티클 끔, 틴트만 (은은하게)
 * - subtle → 시간 틴트 + 날씨 파티클(저밀도)
 * - vivid → 시간 틴트 + 날씨 파티클 + 계절 파티클
 * - lowPower → 파티클 수 절반
 */
export function resolveAmbientScene(input: AmbientSceneInput): AmbientScene {
  const timePhase = phaseForDate(input.date);
  const season = seasonForDate(input.date);
  const tint = tintProfileForPhase(timePhase);

  if (input.intensity === "off") {
    return {
      timePhase, season, tint,
      weatherTintColor: null, weatherTintOpacity: 0,
      particles: [], particlesEnabled: false, tintEnabled: false,
    };
  }

  const weatherTint = input.weather ? weatherTintFor(input.weather) : { color: null, opacity: 0 };
  const particlesEnabled = !input.reducedMotion;

  const specs: AmbientParticleSpec[] = [];
  if (particlesEnabled) {
    // 날씨 파티클 (subtle/vivid 공통, subtle은 저밀도)
    const weatherKind = input.weather ? weatherToKind(weatherParticleFor(input.weather)) : null;
    if (weatherKind) {
      const base = PARTICLE_SPECS[weatherKind];
      const density = input.intensity === "vivid" ? 1 : 0.45;
      specs.push(scaleParticleCount(base, density, input.lowPower));
    }
    // 계절 파티클 (vivid 전용)
    if (input.intensity === "vivid") {
      const seasonKind = seasonToKind(seasonParticleFor(season, timePhase));
      // 눈 계열 중복 방지: 날씨 눈이 있으면 계절 눈송이는 생략
      const isSnowFamily = (kind: AmbientParticleKind | null) =>
        kind === "snow" || kind === "snowflake";
      if (
        seasonKind &&
        seasonKind !== weatherKind &&
        !(isSnowFamily(seasonKind) && isSnowFamily(weatherKind))
      ) {
        specs.push(scaleParticleCount(PARTICLE_SPECS[seasonKind], 1, input.lowPower));
      }
    }
  }

  return {
    timePhase,
    season,
    tint,
    weatherTintColor: weatherTint.color,
    weatherTintOpacity: input.reducedMotion ? weatherTint.opacity * 0.5 : weatherTint.opacity,
    particles: specs,
    particlesEnabled,
    // reducedMotion이어도 틴트는 정적으로 적용 (움직임 없음)
    tintEnabled: true,
  };
}

function scaleParticleCount(
  spec: AmbientParticleSpec,
  density: number,
  lowPower: boolean,
): AmbientParticleSpec {
  const scaled = Math.round(spec.count * density * (lowPower ? 0.5 : 1));
  return { ...spec, count: Math.max(scaled, 0) };
}

/** 장면이 비어있는지 (아무것도 그리지 않아도 되는지). */
export function isAmbientSceneEmpty(scene: AmbientScene): boolean {
  return !scene.tintEnabled && !scene.particlesEnabled;
}
