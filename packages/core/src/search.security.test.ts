import { describe, expect, it } from "vitest";

import { searchTitles, suggest } from "./search";

import type { Title } from "./types";

describe("search input resource boundaries", () => {
  it("rejects forged query methods before token iteration", () => {
    const forged = { trim: () => ({ length: Number.MAX_SAFE_INTEGER }) } as unknown as string;
    expect(() => searchTitles([], { q: forged })).toThrow(TypeError);
    expect(() => suggest([], forged)).toThrow(TypeError);
  });

  it("rejects oversized queries and catalog-shaped objects", () => {
    expect(() => searchTitles([], { q: "a ".repeat(257) })).toThrow(RangeError);
    expect(() => suggest([], "a ".repeat(257))).toThrow(RangeError);
    const forged = { length: Number.MAX_SAFE_INTEGER } as unknown as Title[];
    expect(() => searchTitles(forged, {})).toThrow(TypeError);
    expect(() => suggest(forged, "a")).toThrow(TypeError);
  });

  it("accepts the full query boundary and empty input", () => {
    expect(searchTitles([], { q: "a".repeat(512) })).toEqual([]);
    expect(suggest([], "a".repeat(512))).toEqual([]);
    expect(searchTitles([], {})).toEqual([]);
    expect(suggest([], " ")).toEqual([]);
  });
});
