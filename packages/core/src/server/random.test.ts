import { describe, expect, it } from "vitest";

import { getRandomData } from "./random";

import type { Title } from "../types";

const title = (id: string, overrides: Partial<Title> = {}): Title => ({
  id, slug: id, title: id, type: "webtoon", genres: ["판타지"], ageRating: "all",
  coverImage: "/cover.png", stats: { ratingCount: 10 }, ...overrides,
} as Title);

describe("random catalog discovery", () => {
  it("respects type and genre when a rated, illustrated candidate exists", () => {
    const candidates = [title("comic"), title("novel", { type: "webnovel" })];
    expect(getRandomData({ type: "webnovel", genre: "판타지" }, candidates))
      .toMatchObject({ id: "novel", slug: "novel", poolSize: 1 });
  });
  it("relaxes an empty preference pool without admitting adult works", () => {
    const candidates = [title("general"), title("adult", { ageRating: "19" })];
    expect(getRandomData({ genre: "no-match" }, candidates))
      .toMatchObject({ id: "general", poolSize: 1 });
    expect(getRandomData({}, [candidates[1]]))
      .toMatchObject({ id: null, slug: null, poolSize: 0 });
  });
  it("supports explicit adult inclusion and an empty catalog", () => {
    expect(getRandomData({ adult: "true" }, [title("adult", { ageRating: "19" })])).toHaveProperty("id", "adult");
    expect(getRandomData({}, [])).toMatchObject({ id: null, slug: null, poolSize: 0 });
  });
});
