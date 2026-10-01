import { describe, expect, it } from "vitest";

import { pickFeaturedChallenge, trendingTagCounts } from "./showcase-featured-model";

import type { ChallengeSummary } from "@/platform/creator-client";

function challenge(id: string, state: ChallengeSummary["state"]): ChallengeSummary {
  return {
    id,
    slug: id,
    title: id,
    theme: "",
    startsAt: null,
    endsAt: null,
    state,
    entries: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("trendingTagCounts", () => {
  it("많이 쓰인 태그 순으로 정렬하고 동률은 먼저 등장한 태그를 앞에 둔다", () => {
    const counts = trendingTagCounts([
      { tags: ["로맨스", "일상"] },
      { tags: ["판타지", "일상"] },
      { tags: ["로맨스", "일상"] },
      { tags: ["판타지"] },
    ]);
    expect(counts).toEqual([["일상", 3], ["로맨스", 2], ["판타지", 2]]);
  });

  it("상한 개수만큼만 돌려준다", () => {
    const works = Array.from({ length: 12 }, (_, index) => ({ tags: [`tag-${index}`] }));
    expect(trendingTagCounts(works, 5)).toHaveLength(5);
    expect(trendingTagCounts([])).toEqual([]);
  });
});

describe("pickFeaturedChallenge", () => {
  it("진행 중인 챌린지를 우선한다", () => {
    expect(pickFeaturedChallenge([challenge("a", "ended"), challenge("b", "ongoing")])?.id).toBe("b");
  });

  it("모두 종료됐으면 첫 챌린지를, 비어 있으면 null을 돌려준다", () => {
    expect(pickFeaturedChallenge([challenge("a", "ended"), challenge("b", "ended")])?.id).toBe("a");
    expect(pickFeaturedChallenge([])).toBeNull();
  });
});
