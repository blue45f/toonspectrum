// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_STORAGE_KEY } from "./theme-presets";

let dark = true;
let contrast = false;
let forced = false;
let cleanup: (() => void) | undefined;
let media: EventTarget & { matches: boolean };
let contrastMedia: EventTarget & { matches: boolean };
let forcedMedia: EventTarget & { matches: boolean };

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  dark = true;
  contrast = false;
  forced = false;
  media = new EventTarget() as typeof media;
  contrastMedia = new EventTarget() as typeof contrastMedia;
  forcedMedia = new EventTarget() as typeof forcedMedia;
  vi.stubGlobal("matchMedia", vi.fn((query: string) => {
    const target = query.includes("color-scheme") ? media
      : query.includes("prefers-contrast") ? contrastMedia : forcedMedia;
    return {
      get matches() {
        return query.includes("color-scheme") ? dark
          : query.includes("prefers-contrast") ? contrast : forced;
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    };
  }));
  window.history.replaceState({}, "", "/settings");
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("theme runtime", () => {
  it.each([false, true])("첫 방문은 OS dark=%s와 무관하게 브랜드 기본값 starlight를 사용한다", async (systemDark) => {
    dark = systemDark;
    document.documentElement.removeAttribute("data-design-theme");
    const { useTheme, installAppearanceSync } = await import("./theme");
    cleanup = installAppearanceSync();
    expect(useTheme.getState()).toMatchObject({ preference: "starlight", studioPreference: "inherit", resolvedTheme: "starlight" });
    expect(document.documentElement.dataset.designTheme).toBe("starlight");
  });
  it("이미 선택한 starlight는 복원하고 Studio에서도 그대로 상속한다", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ state: { preference: "starlight", studioPreference: "inherit" }, version: 0 }));
    const { useTheme, setAppearanceScope } = await import("./theme");
    expect(useTheme.getState().resolvedTheme).toBe("starlight");
    setAppearanceScope("studio");
    expect(document.documentElement.dataset.designTheme).toBe("starlight");
    expect(useTheme.getState().preference).toBe("starlight");
  });
  it("restores legacy theme and persists the compatible envelope", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ state: { theme: "light" }, version: 0 }));
    const { useTheme } = await import("./theme");
    expect(useTheme.getState().preference).toBe("light");
    useTheme.getState().setPreference("midnight");
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!).state).toEqual({ theme: "dark", preference: "midnight", studioPreference: "inherit" });
    expect(document.documentElement.dataset.designTheme).toBe("midnight");
  });
  it("separates Studio from the site and restores route palettes", async () => {
    const { useTheme, setAppearanceScope } = await import("./theme");
    useTheme.getState().setPreference("light");
    useTheme.getState().setStudioPreference("graphite");
    expect(document.documentElement.dataset.designTheme).toBe("light");
    setAppearanceScope("studio");
    expect(document.documentElement.dataset.designTheme).toBe("graphite");
    useTheme.getState().resetScope("studio");
    expect(document.documentElement.dataset.designTheme).toBe("light");
    useTheme.getState().setStudioPreference("sepia");
    setAppearanceScope("site");
    expect(document.documentElement.dataset.designTheme).toBe("light");
  });
  it("reacts to system changes only for system preferences, and cleans up", async () => {
    const { useTheme, installAppearanceSync } = await import("./theme");
    cleanup = installAppearanceSync();
    useTheme.getState().setPreference("system");
    dark = false; media.dispatchEvent(new Event("change"));
    expect(useTheme.getState().theme).toBe("light");
    useTheme.getState().setPreference("graphite");
    dark = true; media.dispatchEvent(new Event("change"));
    expect(useTheme.getState().resolvedTheme).toBe("graphite");
    cleanup(); cleanup = undefined;
    useTheme.getState().setPreference("system");
    dark = false; media.dispatchEvent(new Event("change"));
    expect(useTheme.getState().theme).toBe("dark");
  });
  it("follows OS high contrast only for system appearance", async () => {
    const { useTheme, installAppearanceSync } = await import("./theme");
    cleanup = installAppearanceSync();
    useTheme.getState().setPreference("system");
    contrast = true;
    contrastMedia.dispatchEvent(new Event("change"));
    expect(useTheme.getState().resolvedTheme).toBe("contrast");
    expect(document.documentElement.dataset.contrast).toBe("more");
    expect(document.documentElement.dataset.themeSource).toBe("system");
    contrast = false;
    forced = true;
    forcedMedia.dispatchEvent(new Event("change"));
    expect(useTheme.getState().resolvedTheme).toBe("contrast");
    useTheme.getState().setPreference("sepia");
    expect(useTheme.getState().resolvedTheme).toBe("sepia");
    expect(document.documentElement.dataset.contrast).toBe("more");
  });
  it("identifies an inherited Studio theme without losing the resolved system palette", async () => {
    const { useTheme, setAppearanceScope } = await import("./theme");
    useTheme.getState().setPreference("system");
    setAppearanceScope("studio");
    expect(useTheme.getState().resolvedTheme).toBe("dark");
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.dataset.themeSource).toBe("inherit");
    expect(document.documentElement.dataset.themeScope).toBe("studio");
  });
  it.each([null, THEME_STORAGE_KEY])("다른 탭에서 %s를 지우면 재저장 루프 없이 기본 starlight로 복구한다", async (key) => {
    const { useTheme, installAppearanceSync } = await import("./theme");
    cleanup = installAppearanceSync();
    const spy = vi.spyOn(Storage.prototype, "setItem");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: JSON.stringify({ state: { preference: "sepia" } }) }));
    expect(useTheme.getState().resolvedTheme).toBe("sepia");
    expect(spy).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: null }));
    expect(useTheme.getState().resolvedTheme).toBe("starlight");
    expect(spy).not.toHaveBeenCalled();
  });
  it("ignores unrelated/session-storage events", async () => {
    const { useTheme, installAppearanceSync } = await import("./theme");
    cleanup = installAppearanceSync();
    useTheme.getState().setPreference("midnight");
    window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: null }));
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null, storageArea: sessionStorage }));
    expect(useTheme.getState().resolvedTheme).toBe("midnight");
  });
  it("retains in-memory choice when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const { useTheme } = await import("./theme");
    expect(() => useTheme.getState().setPreference("light")).not.toThrow();
    expect(useTheme.getState().storageAvailable).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("keeps legacy toggle usable for every dark palette and returns to the brand dark theme", async () => {
    const { useTheme } = await import("./theme");
    useTheme.getState().setPreference("contrast");
    useTheme.getState().toggle();
    expect(useTheme.getState().preference).toBe("light");
    useTheme.getState().toggle();
    expect(useTheme.getState().preference).toBe("starlight");
  });
});
