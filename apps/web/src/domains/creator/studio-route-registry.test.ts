import { describe, expect, it } from "vitest";

import {
  STUDIO_ROUTE_REGISTRY,
  auditStudioRouteRegistry,
  canonicalStudioRoutePath,
  resolveStudioRouteRegistration,
  studioProjectSectionPath,
  studioRoutePath,
} from "./studio-route-registry";

describe("Studio route registry", () => {
  it("keeps one valid canonical owner for every Studio route", () => {
    expect(auditStudioRouteRegistry()).toEqual([]);
    expect(new Set(STUDIO_ROUTE_REGISTRY.map((route) => route.id)).size)
      .toBe(STUDIO_ROUTE_REGISTRY.length);
    expect(new Set(STUDIO_ROUTE_REGISTRY.map((route) => route.pattern)).size)
      .toBe(STUDIO_ROUTE_REGISTRY.length);
  });

  it("builds canonical product and project destinations", () => {
    expect(studioRoutePath("home")).toBe("/studio");
    expect(studioRoutePath("project-document")).toBe("/studio/p/:projectId/d/:documentId");
    expect(studioProjectSectionPath("series/한글", "story"))
      .toBe("/studio/p/series%2F%ED%95%9C%EA%B8%80/story");
  });

  it("resolves canonical and legacy entry points to the same route owner", () => {
    expect(resolveStudioRouteRegistration("/studio/new")?.id).toBe("new");
    expect(resolveStudioRouteRegistration("/make?from=home")?.id).toBe("new");
    expect(resolveStudioRouteRegistration("/brush-lab")?.id).toBe("asset-brush-new");
    expect(resolveStudioRouteRegistration("/studio/p/project-1/review")?.id)
      .toBe("project-review");
    expect(resolveStudioRouteRegistration("/studio/p/project-1/d/document-4")?.preserveRuntimeBy)
      .toBe("documentId");
  });

  it("returns static canonical replacements without leaking implementation routes", () => {
    expect(canonicalStudioRoutePath("/make")).toBe("/studio/new");
    expect(canonicalStudioRoutePath("/creator-hub/")).toBe("/studio");
    expect(canonicalStudioRoutePath("/studio/assets")).toBe("/studio/assets");
    expect(canonicalStudioRoutePath("/unrelated")).toBeNull();
  });

  it("rejects unsafe project identities", () => {
    expect(() => studioProjectSectionPath("..", "overview"))
      .toThrow("valid Studio project id");
    expect(() => studioProjectSectionPath("", "overview"))
      .toThrow("valid Studio project id");
  });
});
