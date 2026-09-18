import { describe, expect, it } from "vitest";

import { parsePublicSharePath } from "./public-share-path";

describe("public share path parser", () => {
  it.each([
    ["/ranking", "ranking", "/ranking"],
    ["/play", "play", "/play"],
    ["/author/%EA%B9%80%EC%9E%91%EA%B0%80", "author", "/author/%EA%B9%80%EC%9E%91%EA%B0%80"],
    ["/u/user-1", "profile", "/u/user-1"],
    ["/create/work-1", "creator-work", "/create/work-1"],
    ["/create/series/series-1", "creator-series", "/create/series/series-1"],
    ["/showcase/work/work-1", "creator-work", "/create/work-1"],
    ["/showcase/series/series-1", "creator-series", "/create/series/series-1"],
    ["/community/post/post-1", "community-post", "/community/post/post-1"],
    ["/community/cafes/cafe-1", "community-cafe", "/community/cafes/cafe-1"],
    ["/community/promote/promo-1", "promotion", "/community/promote/promo-1"],
    ["/pencafe/%EC%9E%91%EA%B0%80", "pencafe", "/pencafe/%EC%9E%91%EA%B0%80"],
    ["/collaborate/job-1", "collaboration", "/collaborate/job-1"],
  ])("parses %s", (pathname, kind, canonicalPath) => {
    expect(parsePublicSharePath(pathname)).toMatchObject({ kind, canonicalPath });
  });

  it.each([
    "",
    "ranking",
    "/create/challenges",
    "/create/promo",
    "/create/series",
    "/create/nested/path",
    "/community/post",
    "/community/post/nested/path",
    "/community/promote/new",
    "/community/promote/moderation",
    "/collaborate/new",
    "/collaborate/moderation",
    "/author/%2Fadmin",
    "/u/%5Cadmin",
    "/ranking?preview=1",
    "/ranking#preview",
    "//ranking",
    "/unknown/value",
  ])("rejects non-shareable or malformed route %s", (pathname) => {
    expect(parsePublicSharePath(pathname)).toBeNull();
  });
});
