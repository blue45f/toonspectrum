import { describe, expect, it } from "vitest";

import {
  creatorProfileHref,
  creatorSeriesHref,
  creatorWorkHref,
  showcaseChallengeHref,
  showcaseGalleryHref,
} from "./showcase-links";

describe("showcase-links", () => {
  it("갤러리 기본값은 URL에 남기지 않는다", () => {
    expect(showcaseGalleryHref()).toBe("/showcase");
    expect(showcaseGalleryHref({ tab: "works", sort: "recent", content: "all", tag: "  " })).toBe("/showcase");
  });

  it("필터를 정식 /showcase 경로의 쿼리로 만든다", () => {
    expect(showcaseGalleryHref({ sort: "likes" })).toBe("/showcase?sort=likes");
    expect(showcaseGalleryHref({ tab: "series", tag: "로맨스", portfolio: true })).toBe(
      "/showcase?tab=series&tag=%EB%A1%9C%EB%A7%A8%EC%8A%A4&portfolio=1",
    );
    expect(showcaseGalleryHref({ content: "webtoon", provenance: "ai_assisted" })).toBe(
      "/showcase?content=webtoon&provenance=ai_assisted",
    );
  });

  it("상세·챌린지 링크의 식별자를 인코딩한다", () => {
    expect(showcaseChallengeHref("autumn night")).toBe("/showcase/challenges?c=autumn%20night");
    expect(creatorWorkHref("work/1")).toBe("/create/work%2F1");
    expect(creatorSeriesHref("s 1")).toBe("/create/series/s%201");
    expect(creatorProfileHref("user#1")).toBe("/u/user%231");
  });
});
