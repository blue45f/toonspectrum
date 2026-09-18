import { describe, expect, it } from "vitest";

import {
  BANNED_USER_FACING_ROUTE_TERMS,
  SITE_ROUTE_UX_OVERRIDES,
  resolveSiteRouteUxContract,
} from "./site-route-ux";

describe("site route UX contracts", () => {
  it("provides clear purpose, action, recovery and device policy for key journeys", () => {
    for (const path of [
      "/",
      "/story-lab",
      "/studio",
      "/studio/new",
      "/studio/bg3d",
      "/studio/assets",
      "/production",
      "/production/projects/sample-project/review",
      "/studio/publish",
      "/market",
      "/collaborate",
      "/learn",
    ]) {
      const contract = resolveSiteRouteUxContract(path);
      expect(contract.canonicalPath).toMatch(/^\//u);
      expect(contract.pagePurpose).toMatch(/^legacyUi\./u);
      expect(contract.helpPath).toMatch(/^\/help/u);
      expect(contract.audiences.length).toBeGreaterThan(0);
    }
  });

  it("resolves historical aliases to the same user-facing destination", () => {
    expect(resolveSiteRouteUxContract("/make?from=legacy").canonicalPath).toBe("/studio/new");
    expect(resolveSiteRouteUxContract("/publishing#check").canonicalPath).toBe("/studio/publish");
    expect(resolveSiteRouteUxContract("/creator-hub").canonicalPath).toBe("/studio");
  });

  it("keeps expert implementation vocabulary out of visible route copy", () => {
    const visibleCopy = JSON.stringify(
      SITE_ROUTE_UX_OVERRIDES.map((contract) => ({
        pagePurpose: contract.pagePurpose,
        primaryAction: contract.primaryAction,
        helpPath: contract.helpPath,
      })),
    );
    for (const term of BANNED_USER_FACING_ROUTE_TERMS) {
      expect(visibleCopy).not.toContain(term);
    }
  });

  it("marks precision 3D work as desktop-required without hiding review workflows on mobile", () => {
    expect(resolveSiteRouteUxContract("/studio/bg3d").mobilePolicy).toBe("desktop-required");
    expect(resolveSiteRouteUxContract("/studio/publish").mobilePolicy).toBe("review");
    expect(resolveSiteRouteUxContract("/production/projects/sample/review").mobilePolicy).toBe("review");
  });
});
