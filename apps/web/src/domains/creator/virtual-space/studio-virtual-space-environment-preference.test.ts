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

  it("새 원경은 검토한 내장 아트만 사용한다", () => {
    expect(studioVirtualBackdropUrl("coast")).toBe("/assets/virtual-studio/experience-v8/coast.png");
    expect(studioVirtualBackdropUrl("forest", "sky-island")).toBe("/assets/virtual-studio/experience-v8/forest.png");
    expect(studioVirtualBackdropUrl("forest", "ink")).toBe("/assets/virtual-studio/experience-v8/backdrop-ink-forest.png");
    expect(studioVirtualBackdropUrl("city", "neon")).toBe("/assets/virtual-studio/experience-v8/backdrop-neon-city.png");
  });
});
