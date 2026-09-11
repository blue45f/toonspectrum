import { describe, expect, it } from "vitest";

import {
  auditStudioFeatureSurfaceRegistry,
  studioFeatureSurfacesForView,
} from "./studio-feature-surface-registry";

describe("ToonStudio feature surface registry", () => {
  it("gives every advanced module a route-reachable product surface", () => {
    expect(auditStudioFeatureSurfaceRegistry()).toEqual([]);
  });

  it("keeps rights and publishing operations in their canonical project views", () => {
    expect(studioFeatureSurfacesForView("assets", "rights").map((entry) => entry.moduleId))
      .toEqual(expect.arrayContaining(["assetPassport", "rightsGraph", "fontAudit"]));
    expect(studioFeatureSurfacesForView("export", "preflight").map((entry) => entry.moduleId))
      .toEqual(expect.arrayContaining(["publishingConnector", "publishingPackage"]));
  });
});
