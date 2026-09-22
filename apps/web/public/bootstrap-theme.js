(function () {
  "use strict";
  // Keep in parity with shared/lib/theme-presets.ts (covered by bootstrap contract tests).
  var themes = ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast", "system"];
  var lightThemes = ["aurora", "blossom", "light", "sepia"];
  var chrome = {
    aurora: "#f4f2ff", blossom: "#fff1ed", starlight: "#11142d",
    dark: "#100d0b", light: "#f7f5ef", graphite: "#202020",
    midnight: "#101724", sepia: "#eee5d4", contrast: "#0d0d0d",
  };
  var state = {};
  try {
    var serialized = localStorage.getItem("toonspectrum-theme") || localStorage.getItem("webdex-theme");
    var envelope = serialized ? JSON.parse(serialized) : null;
    if (envelope && envelope.state && typeof envelope.state === "object") state = envelope.state;
  } catch { /* Blocked or damaged storage must not prevent the first paint. */ }

  var studio = /^\/studio(?:\/|$)/.test(location.pathname);
  var preference = themes.indexOf(state.preference) >= 0
    ? state.preference
    : state.theme === "light" ? "light" : "dark";
  var source = "manual";
  var inherited = false;
  if (studio) {
    if (themes.indexOf(state.studioPreference) >= 0) preference = state.studioPreference;
    else {
      source = "inherit";
      inherited = true;
    }
  }

  var media = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null;
  var systemContrast = Boolean(media && (
    media("(prefers-contrast: more)").matches || media("(forced-colors: active)").matches
  ));
  var rawPreference = preference;
  if (preference === "system") {
    if (!inherited) source = "system";
    preference = systemContrast
      ? "contrast"
      : !media || media("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  var mode = lightThemes.indexOf(preference) >= 0 ? "light" : "dark";
  var root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.setAttribute("data-design-theme", preference);
  root.setAttribute("data-theme-preference", rawPreference);
  root.setAttribute("data-theme-scope", studio ? "studio" : "site");
  root.setAttribute("data-theme-source", source);
  root.setAttribute("data-contrast", systemContrast || preference === "contrast" ? "more" : "standard");
  root.style.colorScheme = mode;

  if (typeof document.querySelector === "function") {
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor && chrome[preference]) themeColor.setAttribute("content", chrome[preference]);
  }
})();
