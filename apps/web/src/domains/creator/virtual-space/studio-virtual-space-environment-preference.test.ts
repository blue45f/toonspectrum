// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT,
  STUDIO_VIRTUAL_ENVIRONMENT_STORAGE_KEY,
  parseStudioVirtualEnvironmentPreference,
  patchStudioVirtualEnvironmentPreference,
  readStudioVirtualEnvironmentPreference,
  studioVirtualBackdropUrl,
  writeStudioVirtualEnvironmentPreference,
} from "./studio-virtual-space-environment-preference";

afterEach(() => window.localStorage.clear());

describe("Virtual Studio environment preference", () => {
  it("round-trips a bounded backdrop, day phase and weather selection", () => {
    const value = patchStudioVirtualEnvironmentPreference(DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT, {
      backdrop: "forest", dayPhase: "dusk", weather: "petals",
    });
    expect(writeStudioVirtualEnvironmentPreference(value)).toBe(true);
    expect(readStudioVirtualEnvironmentPreference()).toEqual(value);
    expect(window.localStorage.getItem(STUDIO_VIRTUAL_ENVIRONMENT_STORAGE_KEY)).not.toContain("http");
  });

  it("rejects arbitrary URLs and unsupported values", () => {
    expect(parseStudioVirtualEnvironmentPreference({
      version: 1, backdrop: "https://outside.test/image.png", dayPhase: "day", weather: "clear",
    })).toBeNull();
    expect(parseStudioVirtualEnvironmentPreference({
      version: 1, backdrop: "sky", dayPhase: "midnight", weather: "storm",
    })).toBeNull();
  });

  it("resolves only bundled ImageGen 2.5 backdrop paths", () => {
    expect(studioVirtualBackdropUrl("coast")).toBe("/assets/virtual-studio/imagegen25-v7/backgrounds/coast.webp");
  });
});
