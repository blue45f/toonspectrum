// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRecommendationFeedback,
  diversifyRecommendations,
  filterRecommendationFeedback,
  hideRecommendation,
  markRecommendationSeen,
  readRecommendationFeedback,
} from "./recommendation-feedback";

import type { Title } from "./types";

function title(id: string, genre: string): Title {
  return {
    id,
    slug: id,
    type: "webtoon",
    title: id,
    author: "author",
    genres: [genre],
    tags: [],
    synopsis: "",
    cover: ["#000000", "#111111"],
    status: "ongoing",
    ageRating: "all",
    releaseYear: 2026,
    availability: [],
    stats: {
      views: 0,
      likes: 0,
      bookmarks: 0,
      ratingAvg: 0,
      ratingCount: 0,
      ratingDist: [0, 0, 0, 0, 0],
      rankDelta: 0,
      trendingScore: 0,
      completionRate: 0,
      bingeIndex: 0,
    },
  };
}
describe("recommendation feedback", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists hidden and already-seen recommendations without artwork data", () => {
    hideRecommendation("title-a");
    markRecommendationSeen("title-b");

    expect(readRecommendationFeedback()).toMatchObject({
      hiddenIds: ["title-a", "title-b"],
      seenIds: ["title-b"],
    });
    expect(localStorage.getItem("toonspectrum:recommendation-feedback:v1"))
      .not.toContain("artwork");
  });

  it("filters hidden recommendations and can restore them", () => {
    hideRecommendation("title-a");
    const values = [title("title-a", "판타지"), title("title-b", "로맨스")];

    expect(filterRecommendationFeedback(values, readRecommendationFeedback())
      .map((entry) => entry.id)).toEqual(["title-b"]);
    clearRecommendationFeedback();
    expect(filterRecommendationFeedback(values, readRecommendationFeedback()))
      .toHaveLength(2);
  });

  it("round-robins genres when broader discovery is requested", () => {
    const values = [
      title("fantasy-1", "판타지"),
      title("fantasy-2", "판타지"),
      title("fantasy-3", "판타지"),
      title("romance-1", "로맨스"),
      title("action-1", "액션"),
    ];

    expect(diversifyRecommendations(values, "wide").map((entry) => entry.id))
      .toEqual([
        "fantasy-1",
        "romance-1",
        "action-1",
        "fantasy-2",
        "fantasy-3",
      ]);
    expect(diversifyRecommendations(values, "balanced")).toEqual(values);
  });
});
