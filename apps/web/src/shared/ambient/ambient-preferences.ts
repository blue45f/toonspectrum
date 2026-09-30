/**
 * 앰비언트(날씨·계절 배경) 사용자 설정.
 *
 * - 강도: 끔 / 은은하게(기본) / 화려하게. 기존 키를 그대로 써서 이미 '끔'을 고른 사용자는 유지된다.
 * - 효과: 자동(실제 날씨·계절) 또는 직접 고른 효과.
 * - 위치: '내 위치 날씨 사용' 여부. 한 번도 고르지 않았으면 null.
 *
 * 저장소 접근은 모두 try/catch로 감싼다. 저장소 자체가 막힌 환경(보안 설정·일부 임베드)에서는
 * 이번 세션 동안만 고른 값이 유지되도록 메모리 사본을 읽는다. 저장소가 읽히면 항상 저장소 값이 우선이다.
 * 변경은 같은 탭에는 커스텀 이벤트로, 다른 탭에는 storage 이벤트로 전파된다.
 */

export type AmbientIntensity = "off" | "subtle" | "vivid";

export const AMBIENT_INTENSITIES: readonly AmbientIntensity[] = ["off", "subtle", "vivid"];

/** 기본 강도: 은은하게(켜짐). */
export const AMBIENT_DEFAULT_INTENSITY: AmbientIntensity = "subtle";

/** 사용자가 고를 수 있는 배경 효과. auto는 실제 날씨(없으면 계절)를 따른다. */
export type AmbientEffectChoice =
  | "auto"
  | "clear"
  | "rain"
  | "snow"
  | "petals"
  | "leaves"
  | "fireflies";

export const AMBIENT_EFFECT_CHOICES: readonly AmbientEffectChoice[] = [
  "auto",
  "clear",
  "rain",
  "snow",
  "petals",
  "leaves",
  "fireflies",
];

export const AMBIENT_DEFAULT_EFFECT: AmbientEffectChoice = "auto";

/** 내 위치 날씨 사용 설정. null은 아직 고르지 않은 상태다. */
export type AmbientLocationPreference = "on" | "off" | null;

export const AMBIENT_STORAGE_KEYS = {
  intensity: "toonstudio.ambient.intensity.v1",
  effect: "toonstudio.ambient.effect.v1",
  location: "toonstudio.ambient.location.v1",
} as const;

/**
 * 설정 변경 알림 이벤트.
 * 스펙터클 연출(shared/spectacle)도 같은 이름을 구독하므로 기존 이름을 유지한다.
 */
export const AMBIENT_PREFERENCES_EVENT = "toonstudio:ambient-intensity";

export interface AmbientPreferences {
  readonly intensity: AmbientIntensity;
  readonly effect: AmbientEffectChoice;
  readonly location: AmbientLocationPreference;
}

const STORAGE_KEY_SET: ReadonlySet<string> = new Set(Object.values(AMBIENT_STORAGE_KEYS));

/** 저장소를 읽을 수 없을 때만 쓰는 이번 세션 사본. */
const memory: { -readonly [K in keyof AmbientPreferences]?: AmbientPreferences[K] } = {};

/** 저장소 읽기 결과. unavailable이면 메모리 사본으로 대체한다. */
type StoredValue = { readonly available: true; readonly raw: string | null } | { readonly available: false };

function parseIntensity(raw: string | null): AmbientIntensity | null {
  return raw === "off" || raw === "subtle" || raw === "vivid" ? raw : null;
}

function parseEffect(raw: string | null): AmbientEffectChoice | null {
  return AMBIENT_EFFECT_CHOICES.find((choice) => choice === raw) ?? null;
}

function parseLocation(raw: string | null): "on" | "off" | null {
  return raw === "on" || raw === "off" ? raw : null;
}

function readStoredValue(key: string): StoredValue {
  try {
    if (typeof localStorage === "undefined") return { available: false };
    return { available: true, raw: localStorage.getItem(key) };
  } catch {
    return { available: false };
  }
}

function resolveStored<T>(
  key: string,
  parse: (raw: string | null) => T | null,
  fallback: T | undefined,
  defaultValue: T,
): T {
  const stored = readStoredValue(key);
  if (!stored.available) return fallback ?? defaultValue;
  return parse(stored.raw) ?? defaultValue;
}

function storeValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장이 막혀 있으면 메모리 사본만 쓴다.
  }
}

function notifyAmbientPreferencesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AMBIENT_PREFERENCES_EVENT));
}

/** 저장된 설정을 읽는다. 잘못된 값은 기본값으로, 읽기 실패는 이번 세션 사본으로 대체한다. */
export function readAmbientPreferences(): AmbientPreferences {
  return {
    intensity: resolveStored(
      AMBIENT_STORAGE_KEYS.intensity,
      parseIntensity,
      memory.intensity,
      AMBIENT_DEFAULT_INTENSITY,
    ),
    effect: resolveStored(AMBIENT_STORAGE_KEYS.effect, parseEffect, memory.effect, AMBIENT_DEFAULT_EFFECT),
    location: resolveStored<AmbientLocationPreference>(
      AMBIENT_STORAGE_KEYS.location,
      parseLocation,
      memory.location,
      null,
    ),
  };
}

export function writeAmbientIntensity(intensity: AmbientIntensity): void {
  memory.intensity = intensity;
  storeValue(AMBIENT_STORAGE_KEYS.intensity, intensity);
  notifyAmbientPreferencesChanged();
}

export function writeAmbientEffect(effect: AmbientEffectChoice): void {
  memory.effect = effect;
  storeValue(AMBIENT_STORAGE_KEYS.effect, effect);
  notifyAmbientPreferencesChanged();
}

export function writeAmbientLocation(location: "on" | "off"): void {
  memory.location = location;
  storeValue(AMBIENT_STORAGE_KEYS.location, location);
  notifyAmbientPreferencesChanged();
}

/** 같은 탭(커스텀 이벤트)과 다른 탭(storage 이벤트)의 설정 변경을 구독한다. */
export function subscribeAmbientPreferences(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || STORAGE_KEY_SET.has(event.key)) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(AMBIENT_PREFERENCES_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AMBIENT_PREFERENCES_EVENT, listener);
  };
}
