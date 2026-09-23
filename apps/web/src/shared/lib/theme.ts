import { create } from "zustand";

import { readBrowserPreference, writeBrowserPreference } from "./browser-preferences";
import {
  DEFAULT_APPEARANCE, THEME_STORAGE_KEY, getScopedThemePreference, getThemePreset,
  normalizeAppearance, parseAppearance, resolveDesignTheme,
  type AppearancePreferences, type AppearanceScope, type DesignTheme,
  type StudioThemePreference, type Theme, type ThemePreference,
} from "./theme-presets";

export type { Theme } from "./theme-presets";

const storage = () => typeof window === "undefined" ? undefined : window.localStorage;
const currentScope = (): AppearanceScope => typeof location !== "undefined" && /^\/studio(?:\/|$)/u.test(location.pathname) ? "studio" : "site";
let activeScope = currentScope();

function mediaMatches(query: string, fallback = false): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : fallback;
}

function systemIsDark(): boolean {
  return mediaMatches("(prefers-color-scheme: dark)", true);
}

function systemPrefersContrast(): boolean {
  return mediaMatches("(prefers-contrast: more)") || mediaMatches("(forced-colors: active)");
}

function readPreferences(): AppearancePreferences {
  return parseAppearance(readBrowserPreference(storage, THEME_STORAGE_KEY)
    ?? readBrowserPreference(storage, "webdex-theme"));
}

function resolveAppearance(preferences: AppearancePreferences) {
  const scopedPreference = getScopedThemePreference(preferences, activeScope);
  const systemDark = systemIsDark();
  const systemContrast = systemPrefersContrast();
  const resolvedTheme = resolveDesignTheme(
    preferences,
    activeScope,
    systemDark,
    systemContrast,
  );
  return {
    resolvedTheme,
    scopedPreference,
    systemDark,
    systemContrast,
    theme: getThemePreset(resolvedTheme).mode,
  };
}

function applyAppearance(preferences: AppearancePreferences) {
  const resolved = resolveAppearance(preferences);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    const inherited = activeScope === "studio" && preferences.studioPreference === "inherit";
    // Keep data-theme as dark/light: existing marketing styles depend on that contract.
    root.dataset.theme = resolved.theme;
    root.dataset.designTheme = resolved.resolvedTheme;
    root.dataset.themePreference = resolved.scopedPreference;
    root.dataset.themeScope = activeScope;
    root.dataset.themeSource = inherited
      ? "inherit"
      : resolved.scopedPreference === "system" ? "system" : "manual";
    root.dataset.contrast = resolved.systemContrast || resolved.resolvedTheme === "contrast"
      ? "more"
      : "standard";
    root.style.colorScheme = resolved.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      getThemePreset(resolved.resolvedTheme).chrome,
    );
  }
  return resolved;
}

interface ThemeState extends AppearancePreferences {
  theme: Theme;
  resolvedTheme: DesignTheme;
  scopedPreference: ThemePreference;
  systemDark: boolean;
  systemContrast: boolean;
  storageAvailable: boolean;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  setPreference: (preference: ThemePreference) => void;
  setStudioPreference: (preference: StudioThemePreference) => void;
  resetScope: (scope: AppearanceScope) => void;
}

const initialPreferences = readPreferences();

export const useTheme = create<ThemeState>((set, get) => {
  const update = (patch: Partial<AppearancePreferences>) => {
    const preferences = normalizeAppearance({ ...get(), ...patch });
    const stored = {
      state: {
        ...preferences,
        theme: getThemePreset(resolveDesignTheme(
          preferences,
          "site",
          systemIsDark(),
          systemPrefersContrast(),
        )).mode,
      },
      version: 0,
    };
    const storageAvailable = writeBrowserPreference(storage, THEME_STORAGE_KEY, JSON.stringify(stored));
    set({ ...preferences, ...applyAppearance(preferences), storageAvailable });
  };
  return {
    ...initialPreferences,
    ...resolveAppearance(initialPreferences),
    storageAvailable: true,
    setTheme: (theme) => update({ preference: theme }),
    toggle: () => {
      const next = get().theme === "dark" ? "light" : "dark";
      update(activeScope === "studio" ? { studioPreference: next } : { preference: next });
    },
    setPreference: (preference) => update({ preference }),
    setStudioPreference: (studioPreference) => update({ studioPreference }),
    resetScope: (scope) => update(scope === "studio"
      ? { studioPreference: "inherit" }
      : { preference: DEFAULT_APPEARANCE.preference }),
  };
});

export function setAppearanceScope(scope: AppearanceScope): void {
  activeScope = scope;
  useTheme.setState(applyAppearance(useTheme.getState()));
}

/** Mounted once by the app. Cleanup makes StrictMode and HMR safe; storage events never write back. */
export function installAppearanceSync(): () => void {
  if (typeof window === "undefined") return () => {};
  const refresh = () => useTheme.setState(applyAppearance(useTheme.getState()));
  const mediaQueries = [
    "(prefers-color-scheme: dark)",
    "(prefers-contrast: more)",
    "(forced-colors: active)",
  ].map((query) => typeof window.matchMedia === "function" ? window.matchMedia(query) : null)
    .filter((media): media is MediaQueryList => media !== null);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
    } catch { /* Storage is optional. An accessible event payload is still safe to read. */ }
    const preferences = parseAppearance(event.newValue);
    useTheme.setState({ ...preferences, ...applyAppearance(preferences), storageAvailable: true });
  };
  refresh();
  for (const media of mediaQueries) {
    if (media.addEventListener) media.addEventListener("change", refresh);
    else media.addListener(refresh);
  }
  window.addEventListener("storage", onStorage);
  return () => {
    for (const media of mediaQueries) {
      if (media.removeEventListener) media.removeEventListener("change", refresh);
      else media.removeListener(refresh);
    }
    window.removeEventListener("storage", onStorage);
  };
}
