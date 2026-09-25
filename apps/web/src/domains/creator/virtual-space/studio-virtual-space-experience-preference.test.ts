// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_VIRTUAL_EXPERIENCE,
  STUDIO_VIRTUAL_EXPERIENCE_STORAGE_KEY,
  parseStudioVirtualExperiencePreference,
  patchStudioVirtualExperiencePreference,
  readStudioVirtualExperiencePreference,
  writeStudioVirtualExperiencePreference,
} from "./studio-virtual-space-experience-preference";

describe("Virtual Studio experience preference", () => {
  beforeEach(() => localStorage.clear());

  it("uses safe defaults and persists only bounded presentation settings", () => {
    expect(readStudioVirtualExperiencePreference()).toEqual(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE);
    const next = patchStudioVirtualExperiencePreference(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE, {
      controlMode: "tap",
      handedness: "left",
      qualityPreset: "battery",
      cameraMode: "steady",
      dialogueScale: "xlarge",
      startLocation: "desk",
      ttsEnabled: true,
    });
    expect(writeStudioVirtualExperiencePreference(next)).toBe(true);
    expect(readStudioVirtualExperiencePreference()).toEqual(next);
    expect(JSON.parse(localStorage.getItem(STUDIO_VIRTUAL_EXPERIENCE_STORAGE_KEY)!)).not.toHaveProperty("permission");
  });

  it("rejects unknown tokens and preserves the current value on an invalid patch", () => {
    expect(parseStudioVirtualExperiencePreference({ ...DEFAULT_STUDIO_VIRTUAL_EXPERIENCE, controlMode: "teleport" })).toBeNull();
    expect(patchStudioVirtualExperiencePreference(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE, {
      controlMode: "teleport" as never,
    })).toBe(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE);
  });
});
