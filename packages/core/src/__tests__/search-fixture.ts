import type { Title } from "../types";

export function searchFixture(count = 160): Title[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `work-${index}`, slug: `slug-${index}`, title: `Story ${index}`,
    type: index % 2 ? "webnovel" : "webtoon", author: "Author", artist: "Artist",
    genres: ["fantasy"], tags: ["adventure"], synopsis: "A story with an adventure",
    cover: ["#000000", "#ffffff"], status: "ongoing", ageRating: "all", releaseYear: 2025,
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    stats: { views: count - index, likes: 0, bookmarks: 0, ratingAvg: 4, ratingCount: 5,
      ratingDist: [0, 0, 0, 5, 0], rankDelta: 0, trendingScore: 1, completionRate: 50, bingeIndex: 50 },
  }));
}
