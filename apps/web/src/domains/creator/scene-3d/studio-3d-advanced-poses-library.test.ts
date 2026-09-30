import { describe, expect, it } from "vitest";

import {
  ADVANCED_WEBTOON_POSES,
  EXPRESSIVE_HAND_PRESETS,
  PROP_SOCKET_DEFAULTS,
  WEBTOON_POSE_CATEGORY_META,
  filterWebtoonPosePresets,
  getWebtoonPosePresetById,
} from "./studio-3d-advanced-poses-library";

describe("Studio 3D Advanced Pose & Hand Expression Library", () => {
  it("provides comprehensive webtoon action, daily, and dramatic pose presets", () => {
    expect(ADVANCED_WEBTOON_POSES.length).toBeGreaterThanOrEqual(12);

    const landing = ADVANCED_WEBTOON_POSES.find((p) => p.id === "action-hero-landing");
    expect(landing).toBeDefined();
    expect(landing?.jointRotations.length).toBeGreaterThan(4);

    const kabeDon = ADVANCED_WEBTOON_POSES.find((p) => p.id === "dramatic-wall-slam-kabe-don");
    expect(kabeDon).toBeDefined();
  });

  it("provides 16 expressive hand presets with normalized finger curl ranges", () => {
    expect(EXPRESSIVE_HAND_PRESETS.length).toBe(16);

    for (const hand of EXPRESSIVE_HAND_PRESETS) {
      expect(hand.id).toBeTruthy();
      expect(hand.fingerCurls.thumb).toBeGreaterThanOrEqual(0);
      expect(hand.fingerCurls.thumb).toBeLessThanOrEqual(1);
      expect(hand.fingerCurls.index).toBeGreaterThanOrEqual(0);
      expect(hand.fingerCurls.pinky).toBeLessThanOrEqual(1);
    }
  });

  it("provides socket transform defaults for all 6 character attachment points", () => {
    expect(PROP_SOCKET_DEFAULTS["hand-right"]).toBeDefined();
    expect(PROP_SOCKET_DEFAULTS["hand-left"]).toBeDefined();
    expect(PROP_SOCKET_DEFAULTS["head"]).toBeDefined();
    expect(PROP_SOCKET_DEFAULTS["back"]).toBeDefined();
    expect(PROP_SOCKET_DEFAULTS["hip-right"]).toBeDefined();
    expect(PROP_SOCKET_DEFAULTS["hip-left"]).toBeDefined();
  });

  it("attaches discovery metadata (category, gender, figures, tags) to every pose", () => {
    const categoryIds = new Set(WEBTOON_POSE_CATEGORY_META.map((meta) => meta.id));
    expect(categoryIds.size).toBe(4);

    const ids = new Set<string>();
    for (const pose of ADVANCED_WEBTOON_POSES) {
      expect(pose.id).toBeTruthy();
      expect(ids.has(pose.id)).toBe(false);
      ids.add(pose.id);

      expect(categoryIds.has(pose.category)).toBe(true);
      expect(["any", "male", "female"]).toContain(pose.gender);
      expect([1, 2]).toContain(pose.figures);
      expect(pose.tags.length).toBeGreaterThan(0);
    }
  });

  it("finds a preset by id", () => {
    expect(getWebtoonPosePresetById("action-hero-landing")?.name).toContain("히어로");
    expect(getWebtoonPosePresetById("does-not-exist")).toBeUndefined();
  });

  it("filters presets by category, gender, figures, and query (AND)", () => {
    const actions = filterWebtoonPosePresets({ category: "action" });
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((pose) => pose.category === "action")).toBe(true);

    // "any"(공용) 포즈는 남/여 필터에 항상 포함된다.
    const malePoses = filterWebtoonPosePresets({ gender: "male" });
    expect(malePoses.length).toBe(ADVANCED_WEBTOON_POSES.length);

    const onlyMale = filterWebtoonPosePresets({ gender: "male", figures: 2 });
    expect(onlyMale.every((pose) => pose.figures === 2)).toBe(true);

    const twoFigures = filterWebtoonPosePresets({ figures: 2 });
    expect(twoFigures.length).toBeGreaterThan(0);
    expect(twoFigures.some((pose) => pose.id === "dramatic-romantic-hug")).toBe(true);

    const byQuery = filterWebtoonPosePresets({ query: "검" });
    expect(byQuery.some((pose) => pose.id === "action-sword-slash")).toBe(true);

    const combined = filterWebtoonPosePresets({ category: "daily", query: "커피" });
    expect(combined.map((pose) => pose.id)).toEqual(["daily-coffee-sip"]);

    expect(filterWebtoonPosePresets({ query: "존재하지않는검색어" })).toEqual([]);
  });
});
