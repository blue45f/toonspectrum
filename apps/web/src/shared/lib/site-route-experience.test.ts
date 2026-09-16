import { describe, expect, it } from "vitest";

import { resolveSiteRouteExperience } from "./site-route-experience";

describe("site route experience", () => {
  it("requires project context and save trust for recoverable project work", () => {
    const experience = resolveSiteRouteExperience("/production/projects/sample-project/review");
    expect(experience.canonicalPath).toBe("/production/projects/sample-project/review");
    expect(experience.requiresProjectContextBar).toBe(true);
    expect(experience.saveTrustRequired).toBe(true);
    expect(experience.emptyStateId).toBe("review");
    expect(experience.nextActionId).toBe("request-review");
    expect(experience.terminologyScope).toBe("production");
  });

  it("keeps public discovery routes lightweight", () => {
    const experience = resolveSiteRouteExperience("/explore");
    expect(experience.requiresProjectContextBar).toBe(false);
    expect(experience.saveTrustRequired).toBe(false);
    expect(experience.nextActionId).toBe("explore");
    expect(experience.terminologyScope).toBe("public");
  });

  it("keeps precision 3D editing explicit on narrow devices", () => {
    const experience = resolveSiteRouteExperience("/studio/bg3d");
    expect(experience.mobilePolicy).toBe("desktop-required");
    expect(experience.saveTrustRequired).toBe(true);
    expect(experience.nextActionId).toBe("create-scene");
  });

  it("resolves historical aliases before deriving experience requirements", () => {
    const experience = resolveSiteRouteExperience("/publishing?source=legacy");
    expect(experience.canonicalPath).toBe("/studio/publish");
    expect(experience.emptyStateId).toBe("publishing");
    expect(experience.nextActionId).toBe("run-publishing-checks");
  });
});
