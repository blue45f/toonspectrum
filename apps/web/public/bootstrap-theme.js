(function () {
  "use strict";
  // Keep in parity with shared/lib/theme-presets.ts (covered by bootstrap contract tests).
  var themes = ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast", "system"];
  var state = {};
  try {
    var serialized = localStorage.getItem("toonspectrum-theme") || localStorage.getItem("webdex-theme");
    var envelope = serialized ? JSON.parse(serialized) : null;
    if (envelope && envelope.state && typeof envelope.state === "object") state = envelope.state;
  } catch { /* Blocked or damaged storage must not prevent the first paint. */ }
  var preference = themes.indexOf(state.preference) >= 0 ? state.preference : state.theme === "light" ? "light" : "dark";
  if (/^\/studio(?:\/|$)/.test(location.pathname) && themes.indexOf(state.studioPreference) >= 0) preference = state.studioPreference;
  if (preference === "system") preference = typeof window.matchMedia !== "function" || window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  var mode = preference === "light" || preference === "sepia" || preference === "aurora" || preference === "blossom" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.setAttribute("data-design-theme", preference);
  document.documentElement.style.colorScheme = mode;
})();
