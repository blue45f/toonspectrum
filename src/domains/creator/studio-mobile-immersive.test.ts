import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  saveStudioMobileImmersivePreference,
  shouldStartStudioMobileImmersive,
  STUDIO_MOBILE_IMMERSIVE_SESSION_KEY,
} from "./studio-mobile-immersive";

const studioPageSource = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const studioMobileEditingDockSource = readFileSync(
  new URL("./StudioMobileEditingDock.tsx", import.meta.url),
  "utf8",
);
const studioChromeSource = readFileSync(new URL("./studio-chrome-ui.tsx", import.meta.url), "utf8");
const studioGlobalsSource = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(STUDIO_MOBILE_IMMERSIVE_SESSION_KEY, initial);
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("Studio mobile immersive preference", () => {
  it("starts in the dedicated drawing shell by default", () => {
    expect(shouldStartStudioMobileImmersive(memoryStorage())).toBe(true);
    expect(shouldStartStudioMobileImmersive(null)).toBe(true);
  });

  it("remembers an explicit exit for the current browser session", () => {
    const storage = memoryStorage();
    saveStudioMobileImmersivePreference(storage, false);
    expect(shouldStartStudioMobileImmersive(storage)).toBe(false);

    saveStudioMobileImmersivePreference(storage, true);
    expect(shouldStartStudioMobileImmersive(storage)).toBe(true);
  });

  it("fails open when session storage is unavailable", () => {
    const blocked = {
      getItem(): string | null {
        throw new Error("blocked");
      },
      setItem(): void {
        throw new Error("blocked");
      },
    };

    expect(shouldStartStudioMobileImmersive(blocked)).toBe(true);
    expect(() => saveStudioMobileImmersivePreference(blocked, false)).not.toThrow();
  });

  it("uses one adaptive canvas lane instead of stacking duplicate mobile chrome", () => {
    expect(studioPageSource).toContain('mobileImmersive && "max-lg:hidden"');
    expect(studioPageSource).toContain('"lg:hidden"');
    expect(studioPageSource).not.toContain("lg:h-0 lg:w-0 lg:overflow-visible");
    expect(studioPageSource).toContain("!canvasOnlyMode && !isMobile");
    expect(studioPageSource).toContain("<StudioMobileEditingDock");
    expect(studioMobileEditingDockSource).toContain('data-studio-mobile-editing-dock="true"');
    expect(studioMobileEditingDockSource).toContain('data-studio-canvas-transient="coach"');
    expect(studioPageSource).toContain("!hasAutosave &&");
    expect(studioPageSource).toContain("drawingShortcutNotice === null");
    expect(studioGlobalsSource).toContain("--studio-canvas-bottom-inset");
  });

  it("keeps every 320px dock target at 44px and scrolls only the two tool rows", () => {
    expect(studioChromeSource).toContain(
      '"flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center',
    );
    expect(studioMobileEditingDockSource).toContain('data-studio-mobile-dock-scroll="primary"');
    expect(studioMobileEditingDockSource).toContain('data-studio-mobile-dock-scroll="secondary"');
    expect(studioMobileEditingDockSource.match(/touch-pan-x/g)).toHaveLength(2);
    expect(studioMobileEditingDockSource).toContain("gap-0.5 overflow-x-auto");
    expect(studioMobileEditingDockSource).toContain("gap-0 overflow-x-auto");
    expect(studioGlobalsSource).toContain("[data-studio-mobile-dock-scroll] :focus-visible");
    expect(studioGlobalsSource).toContain("outline-offset: -2px");
  });
});
