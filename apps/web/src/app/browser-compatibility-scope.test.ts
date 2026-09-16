import { describe, expect, it } from "vitest";

import type { BrowserCompatibilityResult } from "../compat/browser-check";
import {
  isGraphicsCapabilityRoute,
  shouldPromptForBrowserCompatibility,
} from "./browser-compatibility-scope";

function result(overrides: Partial<BrowserCompatibilityResult> = {}): BrowserCompatibilityResult {
  return {
    isSupported: false,
    isLegacy: false,
    missingFeatures: ["WebGL 3D Graphic Engine"],
    recommendUpdate: true,
    browserInfo: { name: "Chrome", version: "152", os: "macOS" },
    inAppBrowser: {
      escapeHref: null,
      escapeHint: null,
      escape: "none",
      id: null,
      inApp: false,
      name: null,
      popupCapable: true,
      platform: "unknown",
    },
    ...overrides,
  };
}

describe("browser compatibility scope", () => {
  it("does not block public, project, or 2D routes for a WebGL-only gap", () => {
    for (const pathname of ["/", "/discover", "/studio", "/studio/new", "/studio/canvas"]) {
      expect(shouldPromptForBrowserCompatibility(pathname, result())).toBe(false);
    }
  });

  it("warns when the user enters a graphics-dependent tool", () => {
    for (const pathname of ["/studio/bg3d", "/studio/character", "/studio/lift3d", "/read/spatial"]) {
      expect(isGraphicsCapabilityRoute(pathname)).toBe(true);
      expect(shouldPromptForBrowserCompatibility(pathname, result())).toBe(true);
    }
  });

  it("still warns globally for core browser gaps or legacy engines", () => {
    expect(shouldPromptForBrowserCompatibility("/", result({ missingFeatures: ["Fetch API"] }))).toBe(true);
    expect(shouldPromptForBrowserCompatibility("/", result({ isLegacy: true }))).toBe(true);
    expect(shouldPromptForBrowserCompatibility("/studio/bg3d", result({ recommendUpdate: false }))).toBe(false);
  });
});
