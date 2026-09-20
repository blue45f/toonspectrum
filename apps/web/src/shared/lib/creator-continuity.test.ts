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
  creatorRecentDestinationDescription,
  formatCreatorRelativeTime,
  getCreatorLaunchRecommendation,
  parseCreatorContinuity,
  serializeCreatorContinuity,
  setCreatorLaunchPlanInState,
} from "./creator-continuity";

describe("creator continuity", () => {
  it("preserves canonical Studio document context while stripping room, token and arbitrary data", () => {
    const now = 1_800_000_000_000;
    let state = addCreatorDestinationInState(
      EMPTY_CREATOR_CONTINUITY,
      "/studio/p/project one/d/episode%202",
      "?workspace=comic&focus=cut%3A18&language=ko-KR&version=approved-4&room=private&token=secret",
      now,
    );
    expect(state.recent).toEqual([{
      id: "studio",
      href: "/studio/p/project%20one/d/episode%202?focus=cut%3A18&language=ko-KR&resume=latest&version=approved-4&workspace=comic",
      visitedAt: now,
    }]);

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
    expect(state.recent[1]?.href).toContain("/studio/p/project%20one/d/episode%202");

    const unchanged = addCreatorDestinationInState(
      state,
      "/account/private",
      "?token=secret",
      now + 2,
    );
    expect(unchanged).toBe(state);
  });

  it("keeps multiple Studio documents but deduplicates the same canonical document", () => {
    const now = 1_800_000_000_000;
    let state = addCreatorDestinationInState(
      EMPTY_CREATOR_CONTINUITY,
      "/studio/p/project-1/d/document-1",
      "?workspace=draw",
      now,
    );
    state = addCreatorDestinationInState(
      state,
      "/studio/p/project-1/d/document-2",
      "?workspace=storyboard",
      now + 1,
    );
    state = addCreatorDestinationInState(
      state,
      "/studio/p/project-1/d/document-1",
      "?workspace=draw&room=discarded",
      now + 2,
    );
    expect(state.recent.map((item) => item.href)).toEqual([
      "/studio/p/project-1/d/document-1?resume=latest&workspace=draw",
      "/studio/p/project-1/d/document-2?resume=latest&workspace=storyboard",
    ]);
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
        { id: "studio", href: "/studio/p/project-1/d/document-1?workspace=3d&room=secret&token=secret", visitedAt: now },
        { id: "studio", href: "https://evil.example/studio/p/project-2/d/document-2", visitedAt: now },
        { id: "unknown", href: "https://evil.example", visitedAt: now },
        { id: "market", href: "/market", visitedAt: now - CREATOR_CONTINUITY_MAX_AGE_MS - 1 },
      ],
      plan: { goal: "unknown", pace: "quick", updatedAt: now },
    }), now);
    expect(parsed.recent).toEqual([{
      id: "studio",
      href: "/studio/p/project-1/d/document-1?resume=latest&workspace=3d",
      visitedAt: now,
    }]);
    expect(parsed.plan).toBeNull();
    expect(parseCreatorContinuity("not-json", now)).toBe(EMPTY_CREATOR_CONTINUITY);
  });

  it("resumes only canonical manuscripts with one fixed token and never propagates untrusted resume values", () => {
    const now = 1_800_000_000_000;
    const document = addCreatorDestinationInState(EMPTY_CREATOR_CONTINUITY,
      "/studio/p/project-1/d/document-1", "?resume=attacker&resume=latest&token=secret", now);
    expect(document.recent[0]?.href).toBe("/studio/p/project-1/d/document-1?resume=latest");
    for (const path of ["/studio", "/studio/new", "/studio/draft/local-1", "/studio/work/remote-1/comic"]) {
      const state = addCreatorDestinationInState(EMPTY_CREATOR_CONTINUITY, path, "?resume=latest", now);
      expect(state.recent[0]?.href).not.toContain("resume=");
    }
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
    expect(creatorRecentDestinationDescription({
      id: "studio",
      href: "/studio/p/project-1/d/document-1?workspace=storyboard",
      visitedAt: now,
    }, "ko")).toContain("콘티 문서의 마지막 페이지·선택·화면 위치");
    expect(formatCreatorRelativeTime(now - 5 * 60_000, "ko", now)).toBe("5분 전");
    expect(formatCreatorRelativeTime(now - 24 * 60 * 60_000, "en", now)).toBe("Yesterday");
  });
});
