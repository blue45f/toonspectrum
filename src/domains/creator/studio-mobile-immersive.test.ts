import { describe, expect, it } from "vitest";

import {
  saveStudioMobileImmersivePreference,
  shouldStartStudioMobileImmersive,
  STUDIO_MOBILE_IMMERSIVE_SESSION_KEY,
} from "./studio-mobile-immersive";

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
});
