/** UI palettes only: never apply these tokens to document content or export pixels. */
export const THEME_IDS = ["dark", "light", "graphite", "midnight", "sepia", "contrast"] as const;
export type DesignTheme = (typeof THEME_IDS)[number];
export type Theme = "dark" | "light";
export type ThemePreference = DesignTheme | "system";
export type StudioThemePreference = ThemePreference | "inherit";
export type AppearanceScope = "site" | "studio";
export interface AppearancePreferences {
  preference: ThemePreference;
  studioPreference: StudioThemePreference;
}
export const DEFAULT_APPEARANCE: AppearancePreferences = { preference: "dark", studioPreference: "inherit" };
export const THEME_STORAGE_KEY = "toonspectrum-theme";
export const THEME_PRESETS = [
  { id: "dark", ko: "잉크", en: "Ink", descriptionKo: "따뜻한 잉크와 주홍빛 포인트", descriptionEn: "Warm ink with a persimmon accent", mode: "dark", chrome: "#100d0b" },
  { id: "light", ko: "페이퍼", en: "Paper", descriptionKo: "밝은 종이 위의 선명한 도구", descriptionEn: "Clear tools on a bright paper surface", mode: "light", chrome: "#f7f5ef" },
  { id: "graphite", ko: "그래파이트", en: "Graphite", descriptionKo: "색 판단을 위한 중성 회색 작업실", descriptionEn: "Neutral gray workspace for color work", mode: "dark", chrome: "#202020" },
  { id: "midnight", ko: "미드나이트", en: "Midnight", descriptionKo: "짙은 남색과 차분한 푸른 포인트", descriptionEn: "Deep navy with a quiet blue accent", mode: "dark", chrome: "#101724" },
  { id: "sepia", ko: "세피아", en: "Sepia", descriptionKo: "부드러운 종이색과 따뜻한 브라운", descriptionEn: "Soft paper tones and warm brown", mode: "light", chrome: "#eee5d4" },
  { id: "contrast", ko: "고대비", en: "High contrast", descriptionKo: "명확한 경계와 또렷한 글자", descriptionEn: "Distinct boundaries and clear text", mode: "dark", chrome: "#0d0d0d" },
] as const satisfies ReadonlyArray<{ id: DesignTheme; ko: string; en: string; descriptionKo: string; descriptionEn: string; mode: Theme; chrome: string }>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || THEME_IDS.some((id) => id === value);
}

/** Accept only known preference fields; retain the old dark/light storage envelope. */
export function normalizeAppearance(value: unknown): AppearancePreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_APPEARANCE };
  const record = value as Record<string, unknown>;
  return {
    preference: isThemePreference(record.preference) ? record.preference
      : record.theme === "light" ? "light" : "dark",
    studioPreference: record.studioPreference === "inherit" || isThemePreference(record.studioPreference)
      ? record.studioPreference : "inherit",
  };
}

export function parseAppearance(serialized: string | null): AppearancePreferences {
  try {
    const envelope: unknown = serialized ? JSON.parse(serialized) : null;
    return normalizeAppearance(envelope && typeof envelope === "object" && "state" in envelope ? envelope.state : null);
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function resolveDesignTheme(preferences: AppearancePreferences, scope: AppearanceScope, systemDark: boolean): DesignTheme {
  const preference = scope === "studio" && preferences.studioPreference !== "inherit"
    ? preferences.studioPreference : preferences.preference;
  return preference === "system" ? systemDark ? "dark" : "light" : preference;
}

export function getThemePreset(id: DesignTheme) {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0];
}
