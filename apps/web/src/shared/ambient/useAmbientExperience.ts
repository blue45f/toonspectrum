import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/shared/lib/theme";

import {
  isLowPowerEnvironment,
  prefersReducedMotion,
  resolveAmbientScene,
  type AmbientScene,
} from "./ambient-engine";
import { getAmbientLabels, type AmbientLabels } from "./ambient-labels";
import { buildAmbientLayers, type AmbientTone } from "./ambient-layers";
import {
  AMBIENT_EFFECT_CHOICES,
  AMBIENT_INTENSITIES,
  readAmbientPreferences,
  subscribeAmbientPreferences,
  writeAmbientEffect,
  writeAmbientIntensity,
  writeAmbientLocation,
  type AmbientEffectChoice,
  type AmbientIntensity,
  type AmbientPreferences,
} from "./ambient-preferences";
import { AmbientRenderer, type AmbientSurfaceSize } from "./ambient-renderer";
import {
  phaseForDate,
  seasonForDate,
  type AmbientSeason,
  type AmbientTimePhase,
} from "./ambient-time";
import { ambientWeatherProvider, type AmbientWeatherSnapshot } from "./ambient-weather";

/* ------------------------------------------------------------------ */
/* 설정 구독                                                           */
/* ------------------------------------------------------------------ */

let cachedPreferences: AmbientPreferences | null = null;

/** useSyncExternalStore용: 값이 같으면 같은 객체를 돌려준다. */
function preferencesSnapshot(): AmbientPreferences {
  const next = readAmbientPreferences();
  const previous = cachedPreferences;
  if (
    previous
    && previous.intensity === next.intensity
    && previous.effect === next.effect
    && previous.location === next.location
  ) {
    return previous;
  }
  cachedPreferences = next;
  return next;
}

/** 저장된 앰비언트 설정(강도·효과·위치)을 구독한다. */
export function useAmbientPreferences(): AmbientPreferences {
  return useSyncExternalStore(subscribeAmbientPreferences, preferencesSnapshot, preferencesSnapshot);
}

/* ------------------------------------------------------------------ */
/* 환경                                                                */
/* ------------------------------------------------------------------ */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/** prefers-reduced-motion을 구독한다(설정을 바꾸면 바로 반영). */
export function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

export interface AmbientAppearance {
  /** 바탕 밝기(테마의 dark/light). */
  readonly tone: AmbientTone;
  /** 고대비 테마·시스템 고대비·강제 색상 모드. 배경 효과를 그리지 않는다. */
  readonly highContrast: boolean;
}

export function useAmbientAppearance(): AmbientAppearance {
  const tone = useTheme((state) => state.theme);
  const highContrast = useTheme((state) => state.resolvedTheme === "contrast" || state.systemContrast);
  return { tone, highContrast };
}

/* ------------------------------------------------------------------ */
/* 날씨·시각·장면                                                       */
/* ------------------------------------------------------------------ */

/** 날씨 스냅숏을 구독하고, active인 동안만 프로바이더를 붙잡는다(요청·갱신 타이머). */
export function useAmbientWeather(active: boolean): AmbientWeatherSnapshot {
  const snapshot = useSyncExternalStore(
    ambientWeatherProvider.subscribe,
    ambientWeatherProvider.snapshot,
    ambientWeatherProvider.snapshot,
  );
  useEffect(() => {
    if (!active) return undefined;
    return ambientWeatherProvider.retain();
  }, [active]);
  return snapshot;
}

/** 1분마다 시각을 확인하되, 시간대나 계절이 바뀔 때만 새 Date를 돌려준다. */
export function useAmbientClock(): Date {
  const [date, setDate] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date();
      setDate((previous) =>
        phaseForDate(previous) === phaseForDate(now) && seasonForDate(previous) === seasonForDate(now)
          ? previous
          : now,
      );
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return date;
}

export interface AmbientSceneState {
  /** 그릴 장면. 강도 끔이거나 자동 모드에서 첫 날씨를 기다리는 중이면 null. */
  readonly scene: AmbientScene | null;
  readonly weather: AmbientWeatherSnapshot;
  /** 자동 모드에서 첫 날씨 응답을 기다리는 중(잘못된 효과가 잠깐 보였다 바뀌지 않게 비워 둔다). */
  readonly weatherPending: boolean;
  readonly timePhase: AmbientTimePhase;
  readonly season: AmbientSeason;
}

/** 설정·날씨·시각을 모아 장면을 정한다. */
export function useAmbientScene(
  preferences: Pick<AmbientPreferences, "intensity" | "effect">,
  weatherActive: boolean,
): AmbientSceneState {
  const { intensity, effect } = preferences;
  const usesWeather = effect === "auto" && intensity !== "off";
  const weather = useAmbientWeather(weatherActive && usesWeather);
  const date = useAmbientClock();
  const condition = weather.reading?.condition ?? null;
  const weatherPending =
    usesWeather && condition === null && (weather.phase === "idle" || weather.phase === "loading");
  const scene = useMemo(
    () => (weatherPending ? null : resolveAmbientScene({ intensity, effect, weather: condition, date })),
    [weatherPending, intensity, effect, condition, date],
  );
  return { scene, weather, weatherPending, timePhase: phaseForDate(date), season: seasonForDate(date) };
}

/* ------------------------------------------------------------------ */
/* 캔버스 연결                                                         */
/* ------------------------------------------------------------------ */

export interface AmbientCanvasOptions {
  readonly scene: AmbientScene | null;
  readonly tone: AmbientTone;
  /** false면 움직이지 않는 한 장면만 그린다(움직임 줄이기 미리보기). */
  readonly animate: boolean;
  readonly measure: (canvas: HTMLCanvasElement) => AmbientSurfaceSize;
  /** 크기 변경 구독. 없으면 window resize. */
  readonly observeResize?: (canvas: HTMLCanvasElement, onResize: () => void) => () => void;
}

/** 캔버스에 렌더러를 붙이고 장면이 바뀌면 레이어를 교체한다. */
export function useAmbientCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { scene, tone, animate, measure, observeResize }: AmbientCanvasOptions,
): void {
  const [lowPower] = useState(isLowPowerEnvironment);
  const [renderer, setRenderer] = useState<AmbientRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const created = AmbientRenderer.create(canvas, {
      measure: () => measure(canvas),
      observeResize: observeResize ? (onResize) => observeResize(canvas, onResize) : undefined,
      maxDpr: lowPower ? 1.5 : 2,
    });
    setRenderer(created);
    return () => {
      created?.dispose();
      setRenderer(null);
    };
  }, [canvasRef, lowPower, measure, observeResize]);

  useEffect(() => {
    if (!renderer) return;
    if (!scene) {
      renderer.clear();
      return;
    }
    const source = (size: AmbientSurfaceSize) =>
      buildAmbientLayers(scene, { tone, lowPower, area: size.width * size.height });
    if (animate) {
      renderer.setLayerSource(source);
      renderer.start();
    } else {
      renderer.stop();
      renderer.setLayerSource(source, { immediate: true });
      renderer.renderStill();
    }
  }, [renderer, scene, tone, lowPower, animate]);
}

/* ------------------------------------------------------------------ */
/* 설정 화면용                                                          */
/* ------------------------------------------------------------------ */

export interface AmbientExperience extends AmbientPreferences {
  setIntensity(intensity: AmbientIntensity): void;
  setEffect(effect: AmbientEffectChoice): void;
  setLocation(location: "on" | "off"): void;
  /** prefers-reduced-motion 사용자인지. */
  readonly reducedMotion: boolean;
  readonly labels: AmbientLabels;
  readonly intensities: readonly AmbientIntensity[];
  readonly effects: readonly AmbientEffectChoice[];
}

/** 앰비언트 설정 훅(설정 화면). 저장과 동시에 배경·다른 탭에 알린다. */
export function useAmbientExperience(): AmbientExperience {
  const lang = useI18n((state) => state.lang);
  const labels = getAmbientLabels(lang);
  const preferences = useAmbientPreferences();
  const reducedMotion = useReducedMotionPreference();
  const setIntensity = useCallback((next: AmbientIntensity) => writeAmbientIntensity(next), []);
  const setEffect = useCallback((next: AmbientEffectChoice) => writeAmbientEffect(next), []);
  const setLocation = useCallback((next: "on" | "off") => writeAmbientLocation(next), []);
  return {
    ...preferences,
    setIntensity,
    setEffect,
    setLocation,
    reducedMotion,
    labels,
    intensities: AMBIENT_INTENSITIES,
    effects: AMBIENT_EFFECT_CHOICES,
  };
}
