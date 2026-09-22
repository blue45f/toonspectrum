/** UI palettes only: never apply these tokens to document content or export pixels. */
export const THEME_IDS = [
  "aurora", "blossom", "starlight",
  "dark", "light", "graphite", "midnight", "sepia", "contrast",
] as const;
export type DesignTheme = (typeof THEME_IDS)[number];
export type Theme = "dark" | "light";
export type ThemePreference = DesignTheme | "system";
export type StudioThemePreference = ThemePreference | "inherit";
export type AppearanceScope = "site" | "studio";
export type ThemeGroup = "signature" | "classic" | "accessibility";
export type ThemeMotif = "ribbon" | "petal" | "constellation" | "ink" | "paper" | "graphite" | "moon" | "film" | "focus";

export interface AppearancePreferences {
  preference: ThemePreference;
  studioPreference: StudioThemePreference;
}

export interface ThemePreset {
  id: DesignTheme;
  ko: string;
  en: string;
  descriptionKo: string;
  descriptionEn: string;
  mode: Theme;
  chrome: string;
  group: ThemeGroup;
  motif: ThemeMotif;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = { preference: "dark", studioPreference: "inherit" };
export const THEME_STORAGE_KEY = "toonspectrum-theme";
export const THEME_PRESETS = [
  { id: "aurora", ko: "오로라", en: "Aurora", descriptionKo: "민트·라일락·핑크가 흐르는 밝은 창작 테마", descriptionEn: "A bright creative palette flowing through mint, lilac and pink", mode: "light", chrome: "#f4f2ff", group: "signature", motif: "ribbon" },
  { id: "blossom", ko: "블로섬", en: "Blossom", descriptionKo: "복숭아빛 종이와 꽃잎 모션의 포근한 테마", descriptionEn: "A warm peach-paper theme with gentle petal motion", mode: "light", chrome: "#fff1ed", group: "signature", motif: "petal" },
  { id: "starlight", ko: "스타라이트", en: "Starlight", descriptionKo: "깊은 남보라 위 별빛과 네온이 흐르는 작업실", descriptionEn: "A deep indigo workspace with starlight and quiet neon", mode: "dark", chrome: "#11142d", group: "signature", motif: "constellation" },
  { id: "dark", ko: "잉크", en: "Ink", descriptionKo: "따뜻한 잉크와 주홍빛 포인트", descriptionEn: "Warm ink with a persimmon accent", mode: "dark", chrome: "#100d0b", group: "classic", motif: "ink" },
  { id: "light", ko: "페이퍼", en: "Paper", descriptionKo: "밝은 종이 위의 선명한 도구", descriptionEn: "Clear tools on a bright paper surface", mode: "light", chrome: "#f7f5ef", group: "classic", motif: "paper" },
  { id: "graphite", ko: "그래파이트", en: "Graphite", descriptionKo: "색 판단을 위한 중성 회색 작업실", descriptionEn: "Neutral gray workspace for color work", mode: "dark", chrome: "#202020", group: "classic", motif: "graphite" },
  { id: "midnight", ko: "미드나이트", en: "Midnight", descriptionKo: "짙은 남색과 차분한 푸른 포인트", descriptionEn: "Deep navy with a quiet blue accent", mode: "dark", chrome: "#101724", group: "classic", motif: "moon" },
  { id: "sepia", ko: "세피아", en: "Sepia", descriptionKo: "부드러운 종이색과 따뜻한 브라운", descriptionEn: "Soft paper tones and warm brown", mode: "light", chrome: "#eee5d4", group: "classic", motif: "film" },
  { id: "contrast", ko: "고대비", en: "High contrast", descriptionKo: "명확한 경계와 또렷한 글자", descriptionEn: "Distinct boundaries and clear text", mode: "dark", chrome: "#0d0d0d", group: "accessibility", motif: "focus" },
] as const satisfies ReadonlyArray<ThemePreset>;

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

export function getScopedThemePreference(
  preferences: AppearancePreferences,
  scope: AppearanceScope,
): ThemePreference {
  return scope === "studio" && preferences.studioPreference !== "inherit"
    ? preferences.studioPreference
    : preferences.preference;
}

/** System appearance follows OS contrast first, then its light/dark preference. */
export function resolveDesignTheme(
  preferences: AppearancePreferences,
  scope: AppearanceScope,
  systemDark: boolean,
  systemContrast = false,
): DesignTheme {
  const preference = getScopedThemePreference(preferences, scope);
  if (preference !== "system") return preference;
  if (systemContrast) return "contrast";
  return systemDark ? "dark" : "light";
}

export function getThemePreset(id: DesignTheme) {
  return THEME_PRESETS.find((preset) => preset.id === id)
    ?? THEME_PRESETS.find((preset) => preset.id === DEFAULT_APPEARANCE.preference)
    ?? THEME_PRESETS[0];
}
