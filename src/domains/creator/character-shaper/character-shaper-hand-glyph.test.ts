import { describe, expect, it } from "vitest";

import {
  CHARACTER_HAND_GLYPH_POSE_TYPES,
  characterHandGlyphCurls,
  characterHandGlyphLayout,
  characterHandGlyphSpread,
} from "./character-shaper-hand-glyph";

import type { CharacterHandPoseType } from "./character-shaper-contract";

describe("characterHandGlyphCurls", () => {
  it("covers all thirteen hand pose types with five finite curls in 0..1", () => {
    expect(CHARACTER_HAND_GLYPH_POSE_TYPES).toHaveLength(13);
    for (const poseType of CHARACTER_HAND_GLYPH_POSE_TYPES) {
      const curls = characterHandGlyphCurls(poseType);
      expect(curls).toHaveLength(5);
      for (const curl of curls) {
        expect(Number.isFinite(curl)).toBe(true);
        expect(curl).toBeGreaterThanOrEqual(0);
        expect(curl).toBeLessThanOrEqual(1);
      }
      const spread = characterHandGlyphSpread(poseType);
      expect(spread).toBeGreaterThanOrEqual(0);
      expect(spread).toBeLessThanOrEqual(1);
    }
  });

  it("separates a fist from an open hand", () => {
    const fist = characterHandGlyphCurls("fist");
    const open = characterHandGlyphCurls("open");
    expect(fist).not.toEqual(open);
    expect(open).toEqual([0, 0, 0, 0, 0]);
    for (const curl of fist.slice(1)) expect(curl).toBe(1);
    expect(fist[0]).toBeGreaterThan(0.8);
    expect(characterHandGlyphSpread("open")).toBe(1);
    expect(characterHandGlyphSpread("fist")).toBe(0);
  });

  it("mirrors the runtime finger tables for the signature gestures", () => {
    const [, pointIndex, pointMiddle] = characterHandGlyphCurls("point");
    expect(pointIndex).toBe(0);
    expect(pointMiddle).toBe(1);

    const [, peaceIndex, peaceMiddle, peaceRing] = characterHandGlyphCurls("peace");
    expect(peaceIndex).toBe(0);
    expect(peaceMiddle).toBe(0);
    expect(peaceRing).toBe(1);

    const [thumbsThumb, thumbsIndex] = characterHandGlyphCurls("thumbsUp");
    expect(thumbsThumb).toBe(0);
    expect(thumbsIndex).toBe(1);

    const [, rockIndex, rockMiddle, rockRing, rockLittle] = characterHandGlyphCurls("rockRoll");
    expect([rockIndex, rockMiddle, rockRing, rockLittle]).toEqual([0, 1, 1, 0]);

    const [, okIndex, okMiddle] = characterHandGlyphCurls("okSign");
    expect(okIndex).toBeGreaterThan(0.5);
    expect(okMiddle).toBe(0);

    const relaxed = characterHandGlyphCurls("relaxed");
    for (const curl of relaxed) {
      expect(curl).toBeGreaterThan(0);
      expect(curl).toBeLessThan(0.4);
    }
  });

  it("names the object a grip holds and falls back to the relaxed hand for unknown ids", () => {
    expect(characterHandGlyphLayout("phoneGrip").prop).toBe("phone");
    expect(characterHandGlyphLayout("penGrip").prop).toBe("pen");
    expect(characterHandGlyphLayout("cupGrip").prop).toBe("cup");
    expect(characterHandGlyphLayout("holding").prop).toBe("rod");
    expect(characterHandGlyphLayout("fingerHeart").prop).toBe("heart");
    expect(characterHandGlyphLayout("okSign").prop).toBe("ring");
    expect(characterHandGlyphLayout("relaxed").prop).toBeNull();
    expect(characterHandGlyphLayout("unknown" as CharacterHandPoseType)).toBe(characterHandGlyphLayout("relaxed"));
  });

  it("returns frozen, referentially stable rows", () => {
    expect(characterHandGlyphCurls("fist")).toBe(characterHandGlyphCurls("fist"));
    expect(Object.isFrozen(characterHandGlyphLayout("fist"))).toBe(true);
    expect(Object.isFrozen(characterHandGlyphCurls("fist"))).toBe(true);
  });
});
