import { describe, expect, it } from "vitest";

import { isDiscoverPurposeRoute, isPublicCreativeRoute } from "./site-public-routes";

describe("public creative chrome route boundaries", () => {
  it.each([
    "/", "/about", "/about/", "/help", "/support", "/contact", "/business", "/collaborate", "/creators", "/research/assets",
    "/learn", "/learn/process", "/learn/careers", "/learn/education", "/learn/resources", "/learn/classroom",
    "/learn/lessons/panel-pacing", "/learn/paths/webtoon", "/market/browse",
    "/market/resource/brush-1", "/showcase/work/work-1", "/showcase/reviews",
    "/showcase/reviews/11111111-1111-4111-8111-111111111111", "/community/cafes/comics",
  ])("keeps the creative journey on public destination %s", (pathname) => {
    expect(isPublicCreativeRoute(pathname)).toBe(true);
  });

  it.each([
    "/my", "/settings", "/library", "/auth/callback", "/market/library", "/market/manage",
    "/market/publish", "/market/wishlist", "/learn/records", "/studio", "/studio/new",
    "/production/pinned-review",
    "/does-not-exist", "/about/does-not-exist", "/market/does-not-exist", "/learn/does-not-exist",
    "/community/does-not-exist", "/community/all", "/research/does-not-exist", "/title/a/edit",
  ])("keeps promotion out of account, editing and unknown route %s", (pathname) => {
    expect(isPublicCreativeRoute(pathname)).toBe(false);
  });

  it.each(["/references", "/calendar", "/compare", "/random", "/tags", "/authors", "/author/artist", "/title/a-story"])(
    "classifies %s consistently as public discovery", (pathname) => {
      expect(isPublicCreativeRoute(pathname)).toBe(true);
      expect(isDiscoverPurposeRoute(pathname)).toBe(true);
    },
  );

  it("does not confuse a partial prefix or an account library with discovery", () => {
    expect(isDiscoverPurposeRoute("/titles-in-progress")).toBe(false);
    expect(isDiscoverPurposeRoute("/library")).toBe(false);
  });
});
