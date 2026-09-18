import { describe, expect, it } from "vitest";

import {
  INDEX_ROBOTS,
  NOINDEX_FOLLOW_ROBOTS,
  NOINDEX_PRIVATE_ROBOTS,
  resolveSeoRoutePolicy,
} from "./seo-route-policy";

describe("resolveSeoRoutePolicy", () => {
  it("indexes explicit public content and detail routes", () => {
    expect(resolveSeoRoutePolicy("/title/sample-work")).toEqual({
      canonicalPath: "/title/sample-work",
      robots: INDEX_ROBOTS,
      indexable: true,
    });
    expect(resolveSeoRoutePolicy("/author/sample-author").indexable).toBe(true);
    expect(resolveSeoRoutePolicy("/u/user-1").indexable).toBe(true);
    expect(resolveSeoRoutePolicy("/community/post/post-1").indexable).toBe(true);
    expect(resolveSeoRoutePolicy("/showcase/work/work-1")).toEqual({
      canonicalPath: "/create/work-1",
      robots: INDEX_ROBOTS,
      indexable: true,
    });
  });

  it("canonicalizes historical aliases before deciding indexability", () => {
    expect(resolveSeoRoutePolicy("/create")).toEqual({
      canonicalPath: "/showcase",
      robots: INDEX_ROBOTS,
      indexable: true,
    });
    expect(resolveSeoRoutePolicy("/shaper")).toEqual({
      canonicalPath: "/studio/assets/characters/new",
      robots: NOINDEX_PRIVATE_ROBOTS,
      indexable: false,
    });
  });

  it("keeps search and comparison utilities crawlable but out of the index", () => {
    for (const pathname of ["/search", "/compare", "/random", "/market/compare"]) {
      expect(resolveSeoRoutePolicy(pathname)).toMatchObject({
        robots: NOINDEX_FOLLOW_ROBOTS,
        indexable: false,
      });
    }
  });

  it("blocks account, admin and editing workspaces from indexing", () => {
    for (const pathname of [
      "/admin/users",
      "/auth/verify",
      "/studio/p/project-1",
      "/production/projects/project-1",
      "/library",
      "/market/checkout/resource-1",
    ]) {
      expect(resolveSeoRoutePolicy(pathname)).toMatchObject({
        robots: NOINDEX_PRIVATE_ROBOTS,
        indexable: false,
      });
    }
  });

  it("fails closed for routes that have not been classified", () => {
    expect(resolveSeoRoutePolicy("/future-unclassified-page")).toEqual({
      canonicalPath: "/future-unclassified-page",
      robots: NOINDEX_FOLLOW_ROBOTS,
      indexable: false,
    });
  });
});
