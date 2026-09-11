import { describe, expect, it } from "vitest";

import {
  buildStudioMotionSchedule,
  planStudioVoiceRegeneration,
  studioVoiceTextHash,
  validateStudioVoiceProfile,
  type StudioCharacterVoiceProfile,
  type StudioVoiceSegment,
} from "./studio-voice-motion";

const PROFILE: StudioCharacterVoiceProfile = Object.freeze({
  characterId: "hero",
  providerId: "voice-provider",
  voiceId: "hero-ko-1",
  locale: "ko",
  speed: 1,
  pitch: 0,
  pronunciation: { ToonStudio: "툰 스튜디오" },
  rights: {
    commercialUseAllowed: true,
    attributionRequired: true,
    attributionText: "Voice by Example",
    expiresAt: "2027-09-11T00:00:00.000Z",
  },
});

const REUSABLE: StudioVoiceSegment = Object.freeze({
  lineId: "line-1",
  characterId: "hero",
  voiceId: "hero-ko-1",
  locale: "ko",
  sourceRevision: 1,
  sourceTextHash: studioVoiceTextHash("안녕하세요."),
  assetId: "voice-line-1",
  durationMs: 1200,
});

describe("Studio voice and motion", () => {
  it("reuses unchanged dialogue and regenerates only changed or missing lines", () => {
    const plan = planStudioVoiceRegeneration({
      profiles: [PROFILE],
      lines: [
        { id: "line-1", characterId: "hero", locale: "ko", text: "안녕하세요.", revision: 1 },
        { id: "line-2", characterId: "hero", locale: "ko", text: "다시 만났네요.", revision: 2 },
      ],
      existingSegments: [REUSABLE, { ...REUSABLE, lineId: "deleted-line" }],
      commercialUse: true,
      now: "2026-09-11T00:00:00.000Z",
    });
    expect(plan).toMatchObject({
      status: "ready",
      reuseLineIds: ["line-1"],
      regenerateLineIds: ["line-2"],
      removeSegmentLineIds: ["deleted-line"],
      attributionTexts: ["Voice by Example"],
    });
  });

  it("blocks missing, expired or commercially restricted voices", () => {
    const plan = planStudioVoiceRegeneration({
      profiles: [{
        ...PROFILE,
        rights: {
          ...PROFILE.rights,
          commercialUseAllowed: false,
          expiresAt: "2025-01-01T00:00:00.000Z",
        },
      }],
      lines: [
        { id: "line-1", characterId: "hero", locale: "ko", text: "대사", revision: 1 },
        { id: "line-2", characterId: "friend", locale: "ko", text: "대사", revision: 1 },
      ],
      existingSegments: [],
      commercialUse: true,
      now: "2026-09-11T00:00:00.000Z",
    });
    expect(plan.status).toBe("blocked");
    expect(plan.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "commercial-rights", lineId: "line-1" }),
      expect.objectContaining({ code: "voice-profile-missing", lineId: "line-2" }),
    ]));
  });

  it("validates voice ranges and attribution requirements", () => {
    expect(validateStudioVoiceProfile(PROFILE)).toEqual([]);
    expect(validateStudioVoiceProfile({
      ...PROFILE,
      speed: 3,
      rights: { ...PROFILE.rights, attributionText: null },
    })).toEqual(expect.arrayContaining(["speed-range", "attribution-text"]));
  });

  it("builds a deterministic scene schedule with transition overlap", () => {
    expect(buildStudioMotionSchedule([
      { id: "cue-1", lineId: "line-1", durationMs: 1000, transitionMs: 0 },
      { id: "cue-2", lineId: "line-2", durationMs: 800, transitionMs: 200 },
    ])).toEqual([
      { id: "cue-1", lineId: "line-1", durationMs: 1000, transitionMs: 0, startMs: 0, endMs: 1000 },
      { id: "cue-2", lineId: "line-2", durationMs: 800, transitionMs: 200, startMs: 800, endMs: 1600 },
    ]);
  });
});
