import { describe, expect, it } from "vitest";

import {
  STUDIO_FEATURE_CAPABILITY_COUNT,
  STUDIO_FEATURE_MODULE_REGISTRY,
  studioFeatureModule,
} from "./studio-feature-registry";

describe("studio feature registry", () => {
  it("owns every route-reachable advanced capability in one complete registry", () => {
    expect(STUDIO_FEATURE_CAPABILITY_COUNT).toBe(9);
    expect(Object.keys(STUDIO_FEATURE_MODULE_REGISTRY).sort()).toEqual([
      "archiveManifest",
      "assetPassport",
      "assetProvider",
      "fontAudit",
      "marketplaceSubmission",
      "pluginRegistry",
      "publishingConnector",
      "publishingPackage",
      "rightsGraph",
    ]);
    expect(studioFeatureModule("assetPassport")).toBe(
      STUDIO_FEATURE_MODULE_REGISTRY.assetPassport,
    );
  });
});
