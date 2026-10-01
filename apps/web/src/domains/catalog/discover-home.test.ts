import { describe, expect, it } from "vitest";

import type { Title } from "@/shared/lib/types";

import {
  DISCOVER_SHELF_LIMIT,
  buildDiscoverShelves,
  currentKstYear,
  englishWeekDay,
  orderTitlesByIds,
  pickDiscoverSpotlight,
  snapshotDateLabel,
  type DiscoverHomeSnapshot,
} from "./discover-home";

function title(id: string, releaseYear = 2024): Title {
  return {
    id,
    slug: id,
    type: "webtoon",
    title: `작품 ${id}`,
    author: "작가",
    genres: ["판타지"],
    tags: [],
    synopsis: "",
    cover: ["#000000", "#111111"],
    status: "ongoing",
    ageRating: "all",
    releaseYear,
    availability: [],
    stats: {
      views: 0,
      likes: 0,
      bookmarks: 0,
      ratingAvg: 4.5,
      ratingCount: 10,
      ratingDist: [0, 0, 0, 0, 10],
      rankDelta: 0,
      trendingScore: 0,
      completionRate: 0,
      bingeIndex: 0,
    },
  };
}

function snapshot(overrides: Partial<DiscoverHomeSnapshot> = {}): DiscoverHomeSnapshot {
  return {
    topRated: [title("rated")],
    waitFree: [title("free")],
    newest: [title("new")],
    todayDay: "목",
    todayReleases: [title("today")],
    genres: ["판타지"],
    stats: { titles: 1, platforms: 1, genres: 1 },
    generatedAt: "2026-09-30T16:49:46.858Z",
    ...overrides,
  };
}

describe("discover home snapshot helpers", () => {
  it("orders shelves from weekly serials to newest and links each to its full view", () => {
    const shelves = buildDiscoverShelves(snapshot());
    expect(shelves.map((shelf) => [shelf.id, shelf.href])).toEqual([
      ["weekday", "/calendar"],
      ["top-rated", "/ranking?axis=rating"],
      ["free", "/search?pricing=free,wait-free"],
      ["newest", "/explore?sort=newest"],
    ]);
  });

  it("drops empty shelves and caps each rail", () => {
    const many = Array.from({ length: DISCOVER_SHELF_LIMIT + 3 }, (_, index) => title(`t${index}`));
    const shelves = buildDiscoverShelves(snapshot({ todayReleases: [], topRated: many }));
    expect(shelves.map((shelf) => shelf.id)).toEqual(["top-rated", "free", "newest"]);
    expect(shelves[0]?.titles).toHaveLength(DISCOVER_SHELF_LIMIT);
  });

  it("keeps parse-error years out of the recently released rail before capping it", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    const newest = [
      title("future", 2081),
      title("zero", 0),
      title("next-year", 2027),
      ...Array.from({ length: DISCOVER_SHELF_LIMIT + 2 }, (_, index) => title(`ok${index}`, 2026)),
    ];
    const shelves = buildDiscoverShelves(snapshot({ newest }), now);
    const rail = shelves.find((shelf) => shelf.id === "newest");
    expect(rail?.titles).toHaveLength(DISCOVER_SHELF_LIMIT);
    expect(rail?.titles[0]?.id).toBe("ok0");
    expect(rail?.titles.some((item) => ["future", "zero", "next-year"].includes(item.id))).toBe(false);
  });

  it("uses the Korean calendar year so a KST new year's title is not dropped", () => {
    // UTC로는 12월 31일이지만 KST로는 이미 새해다.
    const now = new Date("2026-12-31T15:30:00.000Z");
    expect(currentKstYear(now)).toBe(2027);
    const shelves = buildDiscoverShelves(snapshot({ newest: [title("new-year", 2027)] }), now);
    expect(shelves.find((shelf) => shelf.id === "newest")?.titles.map((item) => item.id)).toEqual(["new-year"]);
  });

  it("drops the newest rail entirely when every entry has an impossible year", () => {
    const shelves = buildDiscoverShelves(snapshot({ newest: [title("future", 2081)] }), new Date("2026-09-30T00:00:00.000Z"));
    expect(shelves.map((shelf) => shelf.id)).not.toContain("newest");
  });

  it("uses the editor spotlight first and fills two more picks without repeating it", () => {
    const pick = pickDiscoverSpotlight(snapshot({
      spotlight: title("lead"),
      featured: [title("lead"), title("f1")],
      topRated: [title("r1"), title("r2")],
    }));
    expect(pick?.lead.id).toBe("lead");
    expect(pick?.more.map((item) => item.id)).toEqual(["f1", "r1"]);
  });

  it("falls back to the top-rated story when an older snapshot has no spotlight", () => {
    const pick = pickDiscoverSpotlight(snapshot({ topRated: [title("r1"), title("r2"), title("r3")] }));
    expect(pick?.lead.id).toBe("r1");
    expect(pick?.more.map((item) => item.id)).toEqual(["r2", "r3"]);
    expect(pickDiscoverSpotlight(snapshot({ topRated: [], featured: [], spotlight: null }))).toBeNull();
  });

  it("orders fetched titles by the visit order and skips unknown ids", () => {
    const ordered = orderTitlesByIds(["b", "missing", "a"], [title("a"), title("b")]);
    expect(ordered.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("labels the snapshot date in Korea time and rejects broken timestamps", () => {
    expect(snapshotDateLabel("2026-09-30T16:49:46.858Z")).toBe("2026-10-01");
    expect(snapshotDateLabel("not-a-date")).toBeNull();
  });

  it("translates Korean weekday letters for English copy", () => {
    expect(englishWeekDay("목")).toBe("Thursday");
    expect(englishWeekDay("?")).toBe("?");
  });
});
