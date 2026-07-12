import { describe, expect, it } from "vitest";

import {
  buildStudioHref,
  parseStudioSearchParams,
  studioCreationLinkParams,
} from "./creator-studio-links";

describe("creator-studio-links", () => {
  it("builds studio href with optional query params", () => {
    expect(buildStudioHref()).toBe("/studio");
    expect(buildStudioHref({ seriesId: "s1" })).toBe("/studio?seriesId=s1");
    expect(buildStudioHref({ challengeId: "c1", mode: "upload" })).toBe(
      "/studio?challengeId=c1&mode=upload"
    );
    expect(buildStudioHref({ remixId: "w1", titleId: "t1" })).toBe("/studio?remix=w1&titleId=t1");
  });

  it("parses studio search params", () => {
    const params = parseStudioSearchParams(
      new URLSearchParams("id=w1&seriesId=s1&challengeId=c1&mode=upload&remix=r1&titleId=t1")
    );
    expect(params).toEqual({
      workId: "w1",
      remixId: "r1",
      titleId: "t1",
      seriesId: "s1",
      challengeId: "c1",
      mode: "upload",
    });
  });

  it("uses query relationships only for creation and never replays them onto an existing work", () => {
    expect(studioCreationLinkParams({
      workId: null,
      titleId: "new-title",
      seriesId: "new-series",
      challengeId: "new-challenge",
    })).toEqual({
      titleId: "new-title",
      seriesId: "new-series",
      challengeId: "new-challenge",
    });
    expect(studioCreationLinkParams({
      workId: "existing-work",
      titleId: "stale-title-from-url",
      seriesId: "stale-series-from-url",
      challengeId: "stale-challenge-from-url",
    })).toEqual({ titleId: null, seriesId: null, challengeId: null });
  });
});
