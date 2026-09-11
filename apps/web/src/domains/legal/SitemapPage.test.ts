import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SITEMAP_SOURCE = "apps/web/src/domains/legal/SitemapPage.tsx";
const NAVIGATION_SOURCE = "apps/web/src/shared/components/site-navigation.ts";
const PUBLIC_ROUTE_SOURCE_FILES = [
  "apps/web/src/app/routes/groups/account.routes.tsx",
  "apps/web/src/app/routes/groups/catalog.routes.tsx",
  "apps/web/src/app/routes/groups/community.routes.tsx",
  "apps/web/src/app/routes/groups/creator.routes.tsx",
  "apps/web/src/app/routes/groups/creator-resources.routes.tsx",
  "apps/web/src/app/routes/groups/experience.routes.tsx",
  "apps/web/src/app/routes/groups/legal.routes.tsx",
  "apps/web/src/app/routes/groups/market.routes.tsx",
  "apps/web/src/app/routes/groups/reference.routes.tsx",
] as const;

const INTENTIONAL_NON_DIRECTORY_ROUTES = new Set([
  "/auth/callback",
  "/challenges",
  "/creator-hub",
  "/creator-hub/references",
  "/showcase",
  "/sitemap",
  "/studio/brush-lab",
]);

const NESTED_USER_FACING_DESTINATIONS = [
  "/learn",
  "/learn/glossary",
  "/learn/records",
  "/learn/studio",
  "/studio",
  "/studio/3d/dcc/build",
  "/studio/3d/dcc/cad",
  "/studio/3d/dcc/material",
  "/studio/3d/dcc/model",
  "/studio/3d/dcc/sculpt",
  "/studio/3d/dcc/shot",
  "/studio/animation",
  "/studio/bg3d",
  "/studio/brushes",
  "/studio/character",
  "/studio/comic",
  "/studio/join",
  "/studio/lift3d",
  "/studio/manual",
  "/studio/poser",
  "/studio/present",
  "/studio/projects",
  "/studio/publish",
  "/studio/review",
  "/studio/share",
  "/studio/storyworld",
  "/studio/versions",
] as const;

const sitemapSource = readFileSync(SITEMAP_SOURCE, "utf8");
const navigationSource = readFileSync(NAVIGATION_SOURCE, "utf8");
const directorySource = `${sitemapSource}\n${navigationSource}`;

function staticUserFacingRoutes(): string[] {
  const routes = PUBLIC_ROUTE_SOURCE_FILES.flatMap((sourcePath) => {
    const source = readFileSync(sourcePath, "utf8");
    return [...source.matchAll(/\bpath:\s*"([^"]+)"/gu)].map((match) => match[1]);
  });

  return [...new Set(routes)]
    .filter((href) => !href.includes(":") && !href.includes("*"))
    .filter((href) => !INTENTIONAL_NON_DIRECTORY_ROUTES.has(href))
    .sort();
}

function extendedDestinationHrefs(): string[] {
  return [...sitemapSource.matchAll(/destination\(\s*"([^"]+)"/gu)].map((match) => match[1]);
}

describe("site directory experience contracts", () => {
  it("uses the same purpose-based navigation model as the global site chrome", () => {
    expect(sitemapSource).toContain("SITE_NAVIGATION_GROUPS");
    expect(sitemapSource).toContain("SITE_UTILITY_NAVIGATION");
    expect(sitemapSource).toContain("SITE_NAVIGATION_ITEMS.me");
    expect(sitemapSource).toContain("siteNavigationText");
  });

  it("keeps every standalone user-facing route reachable from the directory", () => {
    const expectedDestinations = new Set([
      ...staticUserFacingRoutes(),
      ...NESTED_USER_FACING_DESTINATIONS,
    ]);

    for (const href of expectedDestinations) {
      expect(directorySource, `missing public directory destination: ${href}`).toContain(`"${href}"`);
    }
  });

  it("uses only unique canonical static destinations in the extended directory", () => {
    const destinations = extendedDestinationHrefs();

    expect(new Set(destinations).size).toBe(destinations.length);
    expect(destinations.every((href) => !href.includes(":") && !href.includes("*"))).toBe(true);

    for (const href of [
      "/admin",
      "/auth/callback",
      "/creator-hub",
      "/showcase",
      "/sitemap",
      "/studio/3d",
      "/studio/assets",
      "/studio/brush-lab",
      "/studio/companion/workspace",
    ]) {
      expect(destinations).not.toContain(href);
    }
  });

  it("provides bilingual page copy and keyboard-visible focus treatments", () => {
    expect(sitemapSource).toContain("TOONSTUDIO DIRECTORY");
    expect(sitemapSource).toContain("All features and pages");
    expect(sitemapSource).toContain("전체 기능과 페이지");
    expect(sitemapSource).toContain("focus-visible:ring-2");
  });
});
