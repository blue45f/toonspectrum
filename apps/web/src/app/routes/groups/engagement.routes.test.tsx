import { describe, expect, it } from "vitest";

import { engagementRoutes } from "./engagement.routes";
import { appRoutes } from "./app-routes";

const EXPECTED_ENGAGEMENT_ROUTES = [
  { id: "engagement-notifications", path: "/notifications" },
  { id: "engagement-taste-onboarding", path: "/onboarding/taste" },
  { id: "engagement-public-list", path: "/lists/:slug" },
] as const;

describe("engagement route family", () => {
  it("registers reader retention surfaces explicitly", () => {
    for (const expected of EXPECTED_ENGAGEMENT_ROUTES) {
      expect(engagementRoutes).toContainEqual(expect.objectContaining(expected));
      expect(appRoutes).toContainEqual(expect.objectContaining(expected));
    }
  });

  it("keeps the growth lab ahead of the Studio wildcard", () => {
    const growthIndex = appRoutes.findIndex((route) => route.id === "creator-growth-lab");
    const wildcardIndex = appRoutes.findIndex((route) => route.id === "creator-studio");
    expect(growthIndex).toBeGreaterThanOrEqual(0);
    expect(wildcardIndex).toBeGreaterThan(growthIndex);
    expect(appRoutes[growthIndex]?.path).toBe("/studio/growth");
  });
});
