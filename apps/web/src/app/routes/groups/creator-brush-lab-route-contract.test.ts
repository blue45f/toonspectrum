import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

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

describe("unified Brush Editor route contract", () => {
  it("owns canonical create/edit asset routes and keeps legacy entry routes compatible", () => {
    expect(SOURCE).toContain(`path: "${CANONICAL_BRUSH_EDITOR_ROUTE}"`);
    expect(SOURCE).toContain(`path: "${CANONICAL_BRUSH_EDIT_ROUTE}"`);
    for (const path of LEGACY_BRUSH_LAB_ROUTES) {
      expect(SOURCE, path).toContain(`path: "${path}"`);
    }
  });

  it("declares canonical and contextual brush routes before the /studio catch-all", () => {
    const catchAll = SOURCE.indexOf('path: "/studio/*"');
    expect(catchAll).toBeGreaterThan(0);

    const studioRoutes = [
      CANONICAL_BRUSH_EDITOR_ROUTE,
      CANONICAL_BRUSH_EDIT_ROUTE,
      ...LEGACY_BRUSH_LAB_ROUTES.slice(1),
    ];
    for (const path of studioRoutes) {
      expect(SOURCE.indexOf(`path: "${path}"`), path).toBeGreaterThan(0);
      expect(SOURCE.indexOf(`path: "${path}"`), path).toBeLessThan(catchAll);
    }
  });

  it("redirects unscoped legacy routes while retaining scoped work/remix editing continuity", () => {
    const publicLegacyStart = SOURCE.indexOf('id: "creator-brush-lab"');
    const studioLegacyStart = SOURCE.indexOf('id: "creator-studio-brush-lab"');
    const scopedWorkStart = SOURCE.indexOf('id: "creator-studio-work-brush-lab"');
    const scopedRemixStart = SOURCE.indexOf('id: "creator-studio-remix-brush-lab"');

    expect(SOURCE.slice(publicLegacyStart, studioLegacyStart)).toContain(
      'to="/studio/assets/brushes/new" replace',
    );
    expect(SOURCE.slice(studioLegacyStart, scopedWorkStart)).toContain(
      'to="/studio/assets/brushes/new" replace',
    );
    expect(SOURCE.slice(scopedWorkStart, scopedRemixStart)).toContain("<StudioBrushLabPage />");
    expect(SOURCE.slice(scopedRemixStart)).toContain("<StudioBrushLabPage />");
  });

  it("renders the V6 integration bridge and keeps all V5 quality designs discoverable", () => {
    expect(PAGE_SOURCE).toContain("<StudioBrushIntegratedWorkbench");
    expect(PAGE_SOURCE).toContain("<StudioBrushLegacyCataloguePanel");
    expect(PAGE_SOURCE).toContain("brushId?: string");
  });
});
