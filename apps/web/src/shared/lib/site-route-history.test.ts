// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isFavoriteSiteRoute,
  readFavoriteSiteRoutes,
  readRecentSiteRoutes,
  recordSiteRouteVisit,
  setFavoriteSiteRoute,
  SITE_ROUTE_PREFERENCES_EVENT,
} from "./site-route-history";

describe("site route history", () => {
  beforeEach(() => window.localStorage.clear());

  it("records canonical, deduplicated recent destinations", () => {
    recordSiteRouteVisit("/brush-lab", 10);
    recordSiteRouteVisit("/studio/assets/brushes/new", 20);
    recordSiteRouteVisit("/ranking", 30);
    expect(readRecentSiteRoutes()).toEqual([
      { path: "/ranking", visitedAt: 30 },
      { path: "/studio/assets/brushes/new", visitedAt: 20 },
    ]);
  });

  it("does not expose administrator or authentication routes", () => {
    recordSiteRouteVisit("/admin/members", 10);
    recordSiteRouteVisit("/auth/callback", 20);
    expect(readRecentSiteRoutes()).toEqual([]);
  });

  it("persists favorites and announces preference changes", () => {
    const listener = vi.fn();
    window.addEventListener(SITE_ROUTE_PREFERENCES_EVENT, listener);
    setFavoriteSiteRoute("/publishing", true);
    expect(readFavoriteSiteRoutes()).toEqual(["/studio/publish"]);
    expect(isFavoriteSiteRoute("/publishing")).toBe(true);
    setFavoriteSiteRoute("/studio/publish", false);
    expect(readFavoriteSiteRoutes()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
