import { describe, expect, it } from "vitest";

import { productionRoutes } from "./production.routes";

describe("production route ownership", () => {
  it("owns the complete planning, production, handoff, review, procurement and rights surfaces", () => {
    const paths = productionRoutes.map((route) => route.path);
    expect(paths).toEqual(expect.arrayContaining([
      "/production",
      "/production/projects/:projectId/overview",
      "/production/projects/:projectId/planning",
      "/production/projects/:projectId/episodes",
      "/production/projects/:projectId/production",
      "/production/projects/:projectId/handoff",
      "/production/projects/:projectId/review",
      "/production/projects/:projectId/procurement",
      "/production/projects/:projectId/rights",
      "/production/projects/:projectId/settings",
      "/production/projects/:projectId/episodes/:episodeId",
    ]));
    expect(new Set(productionRoutes.map((route) => route.id)).size).toBe(productionRoutes.length);
  });
});
