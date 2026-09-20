import { describe, expect, it } from "vitest";

import {
  supportsRoutePurposeScene,
  supportsSiteExperience,
} from "./site-experience-policy";

describe("site experience policy", () => {
  it("keeps promotional visual chrome off operational creator routes", () => {
    for (const pathname of [
      "/production",
      "/production/projects/demo/overview",
      "/studio",
      "/studio/new",
      "/admin/overview",
    ]) {
      expect(supportsSiteExperience(pathname), pathname).toBe(false);
    }
  });

  it("keeps the public discovery experience available on editorial routes", () => {
    for (const pathname of ["/discover", "/ranking", "/research", "/learn"]) {
      expect(supportsSiteExperience(pathname), pathname).toBe(true);
    }
  });

  it("does not inject a generic route-purpose scene into production operations", () => {
    expect(supportsRoutePurposeScene("/production")).toBe(false);
    expect(supportsRoutePurposeScene("/production/projects/demo/review")).toBe(false);
  });
});

describe("studio-first destination ownership", () => {
  it.each(["/", "/home", "/studio", "/studio/", "/team", "/hub"])("does not prepend another promotional header to %s", (pathname) => {
    expect(supportsRoutePurposeScene(pathname)).toBe(false);
  });
  it("retains document guidance and keeps the actual live space immersive", () => {
    expect(supportsRoutePurposeScene("/studio/new")).toBe(true);
    expect(supportsRoutePurposeScene("/studio/p/work/overview")).toBe(true);
    expect(supportsRoutePurposeScene("/studio/p/work/space")).toBe(false);
  });
});
