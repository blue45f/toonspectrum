import { describe, expect, it } from "vitest";

import { filterTagDirectory, tagDirectorySort } from "./tag-directory";

const tags = [
  { tag: "힐링", count: 8 },
  { tag: "회귀", count: 20 },
  { tag: "학원물", count: 20 },
  { tag: "Healing", count: 4 },
] as const;

describe("tag directory", () => {
  it("normalizes hash-prefixed and case-insensitive queries", () => {
    expect(filterTagDirectory(tags, "#heAL", "popular")).toEqual([{ tag: "Healing", count: 4 }]);
    expect(filterTagDirectory(tags, "힐", "popular")).toEqual([{ tag: "힐링", count: 8 }]);
  });

  it("keeps popular and alphabetical sorting deterministic", () => {
    expect(filterTagDirectory(tags, "", "popular").map((entry) => entry.tag)).toEqual([
      "학원물", "회귀", "힐링", "Healing",
    ]);
    expect(filterTagDirectory(tags, "", "name").map((entry) => entry.tag)).toEqual([
      "학원물", "회귀", "힐링", "Healing",
    ]);
  });

  it("accepts only known URL sort values", () => {
    expect(tagDirectorySort("name")).toBe("name");
    expect(tagDirectorySort("recent")).toBe("popular");
  });
});
