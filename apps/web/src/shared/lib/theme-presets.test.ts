import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import Color from "colorjs.io";
import { describe, expect, it } from "vitest";

import { DEFAULT_APPEARANCE, THEME_IDS, THEME_PRESETS, getThemePreset, normalizeAppearance, parseAppearance, resolveDesignTheme } from "./theme-presets";

const bootstrap = readFileSync(new URL("../../../public/bootstrap-theme.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles/design-themes.css", import.meta.url), "utf8");

function bootstrapResult(state: unknown, pathname: string, dark: boolean, blocked = false) {
  const attributes: Record<string, string> = {};
  runInNewContext(bootstrap, {
    localStorage: { getItem: () => { if (blocked) throw new Error("blocked"); return JSON.stringify({ state }); } },
    location: { pathname }, window: { matchMedia: () => ({ matches: dark }) },
    document: { documentElement: { setAttribute: (key: string, value: string) => { attributes[key] = value; }, style: {} } },
  });
  return attributes;
}

describe("appearance preferences and first paint", () => {
  it("ships three signature themes alongside the classic and accessibility palettes", () => {
    expect(THEME_IDS).toHaveLength(9);
    expect(THEME_PRESETS.filter((preset) => preset.group === "signature").map((preset) => preset.id)).toEqual(["aurora", "blossom", "starlight"]);
    expect(THEME_PRESETS.filter((preset) => preset.group === "accessibility").map((preset) => preset.id)).toEqual(["contrast"]);
  });
  it.each([null, undefined, false, 7, "sepia", [], {}])("normalizes untrusted values %s", (value) => {
    expect(normalizeAppearance(value)).toEqual(DEFAULT_APPEARANCE);
  });
  it("migrates dark/light without accepting arbitrary CSS or actions", () => {
    expect(normalizeAppearance({ theme: "light", studioPreference: "url(evil)", setTheme: "bad" })).toEqual({ preference: "light", studioPreference: "inherit" });
    expect(parseAppearance("not-json")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('{"state":null}')).toEqual(DEFAULT_APPEARANCE);
  });
  it.each([...THEME_IDS, "system"] as const)("keeps bootstrap and runtime in parity for %s", (preference) => {
    for (const studioPreference of ["inherit", ...THEME_IDS, "system"] as const) {
      for (const dark of [false, true]) {
        for (const scope of ["site", "studio"] as const) {
          const state = { preference, studioPreference };
          const resolved = resolveDesignTheme(state, scope, dark);
          const boot = bootstrapResult(state, scope === "studio" ? "/studio/project/123" : "/settings", dark);
          expect(boot["data-design-theme"]).toBe(resolved);
          expect(boot["data-theme"]).toBe(getThemePreset(resolved).mode);
        }
      }
    }
  });
  it("does not mistake look-alike routes for Studio", () => {
    expect(bootstrapResult({ preference: "light", studioPreference: "midnight" }, "/studio-guide", true)["data-design-theme"]).toBe("light");
  });
  it("boots safely with unavailable storage", () => {
    expect(bootstrapResult(null, "/studio", true, true)["data-design-theme"]).toBe("dark");
  });
});

describe("palette text contrast", () => {
  it.each(THEME_PRESETS)("$id text and primary buttons meet 4.5:1", ({ id }) => {
    const block = css.split(`[data-appearance-preview="${id}"] {`)[1]?.split("}")[0] ?? "";
    const tokens = Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*([^;]+);/gu)].map((match) => [match[1], match[2]]));
    for (const surface of ["canvas", "panel", "card", "raised"]) {
      for (const foreground of ["fg", "fg-2", "fg-3", "accent"]) {
        expect(new Color(tokens[foreground]).contrast(new Color(tokens[surface]), "WCAG21"), `${id}: ${foreground}/${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const accent of ["accent", "accent-2"]) {
      expect(new Color(tokens["on-accent"]).contrast(new Color(tokens[accent]), "WCAG21"), `${id}: button ${accent}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
