import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_ROUTE_REGISTRY,
  auditStudioRouteRegistry,
  studioRoutePath,
} from "../../../domains/creator/studio-route-registry";

const SOURCE = readFileSync(new URL("./creator.routes.tsx", import.meta.url), "utf8");
const PAGE_SOURCE = readFileSync(
  new URL("../../../domains/creator/brush-lab/StudioBrushLabPage.tsx", import.meta.url),
  "utf8",
);

const CANONICAL_BRUSH_EDITOR_ROUTE = "/studio/assets/brushes/new";
const CANONICAL_BRUSH_EDIT_ROUTE = "/studio/assets/brushes/:brushId/edit";
const LEGACY_BRUSH_LAB_ROUTES = [
  "/brush-lab",
  "/studio/brush-lab",
  "/studio/work/:workId/brush-lab",
  "/studio/remix/:sourceWorkId/brush-lab",
] as const;

function sourceIndex(routeId: string): number {
  return SOURCE.indexOf(`id: "${routeId}"`);
}

describe("unified Brush Editor route contract", () => {
  it("owns canonical create/edit routes in the registry and retains route aliases", () => {
    expect(auditStudioRouteRegistry()).toEqual([]);
    expect(studioRoutePath("asset-brush-new")).toBe(CANONICAL_BRUSH_EDITOR_ROUTE);
    expect(studioRoutePath("asset-brush-edit")).toBe(CANONICAL_BRUSH_EDIT_ROUTE);

    const createRoute = STUDIO_ROUTE_REGISTRY.find((route) => route.id === "asset-brush-new");
    expect(createRoute?.aliases).toEqual(expect.arrayContaining(LEGACY_BRUSH_LAB_ROUTES.slice(0, 2)));

    expect(SOURCE).toContain('id: "creator-studio-assets-brush-new"');
    expect(SOURCE).toContain('id: "creator-studio-assets-brush-edit"');
    expect(SOURCE).toContain('id: "creator-studio-work-brush-lab"');
    expect(SOURCE).toContain('id: "creator-studio-remix-brush-lab"');
  });

  it("declares canonical and contextual brush route owners before the /studio catch-all", () => {
    const catchAll = SOURCE.indexOf('path: "/studio/*"');
    expect(catchAll).toBeGreaterThan(0);

    const routeIds = [
      "creator-studio-assets-brush-new",
      "creator-studio-assets-brush-edit",
      "creator-studio-brush-lab",
      "creator-studio-work-brush-lab",
      "creator-studio-remix-brush-lab",
    ];
    for (const routeId of routeIds) {
      expect(sourceIndex(routeId), routeId).toBeGreaterThan(0);
      expect(sourceIndex(routeId), routeId).toBeLessThan(catchAll);
    }
  });

  it("redirects unscoped aliases through the registry while retaining scoped continuity", () => {
    const publicLegacyStart = sourceIndex("creator-brush-lab");
    const studioLegacyStart = sourceIndex("creator-studio-brush-lab");
    const scopedWorkStart = sourceIndex("creator-studio-work-brush-lab");
    const scopedRemixStart = sourceIndex("creator-studio-remix-brush-lab");

    const publicLegacy = SOURCE.slice(publicLegacyStart, studioLegacyStart);
    const studioLegacy = SOURCE.slice(studioLegacyStart, scopedWorkStart);
    expect(publicLegacy).toContain('studioRoutePath("asset-brush-new")');
    expect(publicLegacy).toContain("<Navigate");
    expect(studioLegacy).toContain('studioRoutePath("asset-brush-new")');
    expect(studioLegacy).toContain("<Navigate");
    expect(SOURCE.slice(scopedWorkStart, scopedRemixStart)).toContain("<StudioBrushLabPage />");
    expect(SOURCE.slice(scopedRemixStart)).toContain("<StudioBrushLabPage />");
  });

  it("renders the V6 bridge and the consolidated product catalogue", () => {
    expect(PAGE_SOURCE).toContain("<StudioBrushIntegratedWorkbench");
    expect(PAGE_SOURCE).toContain("<StudioBrushProductCataloguePanel");
    expect(PAGE_SOURCE).toContain("brushId?: string");
    expect(PAGE_SOURCE).not.toContain("StudioBrushLegacyCataloguePanel");
    expect(PAGE_SOURCE).not.toContain("StudioBrushV5RuntimeWorkbench");
  });
});
