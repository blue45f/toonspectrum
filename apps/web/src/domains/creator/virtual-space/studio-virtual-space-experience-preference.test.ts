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

  it("저장값 없던 설정도 파싱하고 첫 방문 안내 완료 여부는 선택 필드로 저장한다", () => {
    const legacy = { ...DEFAULT_STUDIO_VIRTUAL_EXPERIENCE };
    expect(parseStudioVirtualExperiencePreference(legacy)).toEqual(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE);
    expect(parseStudioVirtualExperiencePreference(legacy)).not.toHaveProperty("coachCompleted");
    const completed = patchStudioVirtualExperiencePreference(DEFAULT_STUDIO_VIRTUAL_EXPERIENCE, { coachCompleted: true });
    expect(completed.coachCompleted).toBe(true);
    expect(writeStudioVirtualExperiencePreference(completed)).toBe(true);
    expect(readStudioVirtualExperiencePreference().coachCompleted).toBe(true);
    expect(parseStudioVirtualExperiencePreference({ ...legacy, coachCompleted: "yes" })).toBeNull();
  });
});
