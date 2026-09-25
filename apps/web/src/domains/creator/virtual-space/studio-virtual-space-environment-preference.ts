export const STUDIO_VIRTUAL_ENVIRONMENT_STORAGE_KEY = "toonspectrum:virtual-space-environment:v1";

export const STUDIO_VIRTUAL_BACKDROPS = ["sky", "coast", "forest", "city"] as const;
export const STUDIO_VIRTUAL_DAY_PHASES = ["auto", "dawn", "day", "dusk", "night"] as const;
export const STUDIO_VIRTUAL_WEATHERS = ["clear", "rain", "petals", "snow"] as const;

export type StudioVirtualBackdrop = typeof STUDIO_VIRTUAL_BACKDROPS[number];
export type StudioVirtualDayPhasePreference = typeof STUDIO_VIRTUAL_DAY_PHASES[number];
export type StudioVirtualWeather = typeof STUDIO_VIRTUAL_WEATHERS[number];

export interface StudioVirtualEnvironmentPreference {
  readonly version: 1;
  readonly backdrop: StudioVirtualBackdrop;
  readonly dayPhase: StudioVirtualDayPhasePreference;
  readonly weather: StudioVirtualWeather;
}

export const DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT: StudioVirtualEnvironmentPreference = Object.freeze({
  version: 1,
  backdrop: "sky",
  dayPhase: "auto",
  weather: "clear",
});

function oneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function parseStudioVirtualEnvironmentPreference(value: unknown): StudioVirtualEnvironmentPreference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1
    || !oneOf(STUDIO_VIRTUAL_BACKDROPS, candidate.backdrop)
    || !oneOf(STUDIO_VIRTUAL_DAY_PHASES, candidate.dayPhase)
    || !oneOf(STUDIO_VIRTUAL_WEATHERS, candidate.weather)) return null;
  return Object.freeze({
    version: 1,
    backdrop: candidate.backdrop,
    dayPhase: candidate.dayPhase,
    weather: candidate.weather,
  });
}

export function readStudioVirtualEnvironmentPreference(): StudioVirtualEnvironmentPreference {
  if (typeof window === "undefined") return DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT;
  try {
    const raw = window.localStorage.getItem(STUDIO_VIRTUAL_ENVIRONMENT_STORAGE_KEY);
    return raw ? parseStudioVirtualEnvironmentPreference(JSON.parse(raw)) ?? DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT
      : DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT;
  } catch {
    return DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT;
  }
}

export function writeStudioVirtualEnvironmentPreference(value: StudioVirtualEnvironmentPreference): boolean {
  const parsed = parseStudioVirtualEnvironmentPreference(value);
  if (!parsed || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STUDIO_VIRTUAL_ENVIRONMENT_STORAGE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}

export function patchStudioVirtualEnvironmentPreference(
  current: StudioVirtualEnvironmentPreference,
  patch: Partial<Omit<StudioVirtualEnvironmentPreference, "version">>,
): StudioVirtualEnvironmentPreference {
  return parseStudioVirtualEnvironmentPreference({ ...current, ...patch, version: 1 }) ?? current;
}

export function studioVirtualBackdropUrl(backdrop: StudioVirtualBackdrop): string {
  return `/assets/virtual-studio/imagegen25-v7/backgrounds/${backdrop}.webp`;
}
