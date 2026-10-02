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

  it("예전 첫 방문 안내 완료 필드(coachCompleted)는 무시하고 나머지 설정을 그대로 읽는다", () => {
    // 첫 방문 안내는 3단계 미니 투어(입장 설정의 tourSeen)로 하나로 합쳤다.
    const legacy = { ...DEFAULT_STUDIO_VIRTUAL_EXPERIENCE, coachCompleted: true };
    expect(parseStudioVirtualExperiencePreference(legacy)).toEqual(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE);
    expect(parseStudioVirtualExperiencePreference(legacy)).not.toHaveProperty("coachCompleted");
    expect(writeStudioVirtualExperiencePreference(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE)).toBe(true);
    expect(readStudioVirtualExperiencePreference()).not.toHaveProperty("coachCompleted");
  });
});
