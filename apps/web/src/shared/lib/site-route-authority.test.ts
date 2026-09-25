import { describe, expect, it } from "vitest";

import {
  canonicalSitePath,
  primarySiteRouteAuthority,
  resolveSiteRouteAuthority,
  SITE_PRIMARY_ROUTE_IDS,
  SITE_ROUTE_AUTHORITIES,
  SITE_ROUTE_ALIASES,
} from "./site-route-authority";

describe("site route authority", () => {
  it("keeps ids and patterns unique", () => {
    const ids = SITE_ROUTE_AUTHORITIES.map((route) => route.id);
    const patterns = SITE_ROUTE_AUTHORITIES.map((route) => route.pattern);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it.each(Object.entries(SITE_ROUTE_ALIASES))("normalizes %s to %s", (alias, canonical) => {
    expect(canonicalSitePath(`${alias}?source=legacy#top`)).toBe(canonical);
  });

  it("resolves exact routes before family routes", () => {
    expect(resolveSiteRouteAuthority("/studio")?.id).toBe("studio-home");
    expect(resolveSiteRouteAuthority("/studio/new")?.id).toBe("studio-new");
    expect(resolveSiteRouteAuthority("/studio/p/project-1/review")?.id).toBe("studio-project");
    expect(resolveSiteRouteAuthority("/production/projects/project-1/episodes/ep-1")?.id)
      .toBe("production-project");
  });

  it("provides every current primary navigation destination", () => {
    expect(SITE_PRIMARY_ROUTE_IDS.map((id) => primarySiteRouteAuthority(id).canonicalPath))
      .toEqual([
        "/",
        "/team",
        "/hub",
        "/production",
        "/studio",
        "/studio/new",
        "/studio/assets",
        "/studio/publish",
      ]);
  });
});
