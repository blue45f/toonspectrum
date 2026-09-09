import { describe, expect, it } from "vitest";

import {
  CREATOR_CONTINUITY_MAX_AGE_MS,
  CREATOR_CONTINUITY_MAX_RECENT,
  CREATOR_CONTINUITY_VERSION,
  EMPTY_CREATOR_CONTINUITY,
  addCreatorDestinationInState,
  clearCreatorPlanInState,
  clearCreatorRecentInState,
  creatorDestinationLabel,
  formatCreatorRelativeTime,
  getCreatorLaunchRecommendation,
  parseCreatorContinuity,
  serializeCreatorContinuity,
  setCreatorLaunchPlanInState,
} from "./creator-continuity";

describe("creator continuity", () => {
  it("keeps only allow-listed route identities and strips document-shaped query data", () => {
    const now = 1_800_000_000_000;
    let state = addCreatorDestinationInState(
      EMPTY_CREATOR_CONTINUITY,
      "/studio/comic/work-secret",
      "?workId=private&token=secret",
      now,
    );
    expect(state.recent).toEqual([
      { id: "comic", href: "/studio/comic", visitedAt: now },
    ]);

    state = addCreatorDestinationInState(
      state,
      "/studio",
      "?preset=illustration&workId=private&token=secret",
      now + 1,
    );
    expect(state.recent[0]).toEqual({
      id: "studio",
      href: "/studio?preset=illustration",
      visitedAt: now + 1,
    });

    const unchanged = addCreatorDestinationInState(
      state,
      "/account/private",
      "?token=secret",
      now + 2,
    );
    expect(unchanged).toBe(state);
  });

  it("deduplicates by destination and bounds the recent list", () => {
    const now = 1_800_000_000_000;
    let state = EMPTY_CREATOR_CONTINUITY;
    for (const [index, pathname] of [
      "/studio",
      "/market",
      "/research",
      "/explore",
      "/ranking",
      "/studio",
    ].entries()) {
      state = addCreatorDestinationInState(state, pathname, "", now + index);
    }
    expect(state.recent).toHaveLength(CREATOR_CONTINUITY_MAX_RECENT);
    expect(state.recent.map((item) => item.id)).toEqual([
      "studio",
      "ranking",
      "explore",
      "research",
    ]);
  });

  it("round-trips valid state while rejecting stale, malformed and untrusted entries", () => {
    const now = 1_800_000_000_000;
    const valid = setCreatorLaunchPlanInState(
      addCreatorDestinationInState(EMPTY_CREATOR_CONTINUITY, "/research/assets", "", now),
      "materials",
      "project",
      now,
    );
    expect(parseCreatorContinuity(serializeCreatorContinuity(valid), now)).toEqual(valid);

    const parsed = parseCreatorContinuity(JSON.stringify({
      version: CREATOR_CONTINUITY_VERSION,
      recent: [
        { id: "studio", href: "/studio?workId=secret", visitedAt: now },
        { id: "unknown", href: "https://evil.example", visitedAt: now },
        { id: "market", href: "/market", visitedAt: now - CREATOR_CONTINUITY_MAX_AGE_MS - 1 },
      ],
      plan: { goal: "unknown", pace: "quick", updatedAt: now },
    }), now);
    expect(parsed.recent).toEqual([{ id: "studio", href: "/studio", visitedAt: now }]);
    expect(parsed.plan).toBeNull();
    expect(parseCreatorContinuity("not-json", now)).toBe(EMPTY_CREATOR_CONTINUITY);
  });

  it("maps every launch goal and pace to a real product destination", () => {
    expect(getCreatorLaunchRecommendation("draw", "quick")).toEqual({
      id: "draw-quick",
      href: "/studio?preset=illustration",
    });
    expect(getCreatorLaunchRecommendation("draw", "project").href).toBe("/studio?preset=webtoon");
    expect(getCreatorLaunchRecommendation("comic", "quick").href).toBe("/studio?preset=4cut");
    expect(getCreatorLaunchRecommendation("comic", "project").href).toBe("/studio/comic");
    expect(getCreatorLaunchRecommendation("character", "project").href).toBe("/shaper");
    expect(getCreatorLaunchRecommendation("materials", "project").href).toBe("/research/assets");
  });

  it("clears recent destinations and launch plans independently", () => {
    const state = setCreatorLaunchPlanInState(
      addCreatorDestinationInState(EMPTY_CREATOR_CONTINUITY, "/market"),
      "materials",
      "quick",
    );
    expect(clearCreatorRecentInState(state)).toMatchObject({ recent: [], plan: state.plan });
    expect(clearCreatorPlanInState(state)).toMatchObject({ recent: state.recent, plan: null });
  });

  it("formats accessible labels and relative time in both supported languages", () => {
    const now = 1_800_000_000_000;
    expect(creatorDestinationLabel("studio", "ko")).toBe("창작 스튜디오");
    expect(creatorDestinationLabel("studio", "en")).toBe("Creative studio");
    expect(formatCreatorRelativeTime(now - 5 * 60_000, "ko", now)).toBe("5분 전");
    expect(formatCreatorRelativeTime(now - 24 * 60 * 60_000, "en", now)).toBe("Yesterday");
  });
});
