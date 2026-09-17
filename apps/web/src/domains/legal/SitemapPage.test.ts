import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SITEMAP_DIRECTORY_ENTRIES,
  SITEMAP_EXTENDED_DESTINATION_GROUPS,
} from "./site-directory-data";

import {
  SITE_NAVIGATION_GROUPS,
  SITE_UTILITY_NAVIGATION,
} from "@/shared/components/site-navigation";
import { canonicalSitePath } from "@/shared/lib/site-route-metadata";

const SITEMAP_SOURCE = "apps/web/src/domains/legal/SitemapPage.tsx";
const PUBLIC_ROUTE_SOURCE_FILES = [
  "apps/web/src/app/routes/groups/account.routes.tsx",
  "apps/web/src/app/routes/groups/catalog.routes.tsx",
  "apps/web/src/app/routes/groups/community.routes.tsx",
  "apps/web/src/app/routes/groups/creator.routes.tsx",
  "apps/web/src/app/routes/groups/creator-resources.routes.tsx",
  "apps/web/src/app/routes/groups/experience.routes.tsx",
  "apps/web/src/app/routes/groups/legal.routes.tsx",
  "apps/web/src/app/routes/groups/market.routes.tsx",
  "apps/web/src/app/routes/groups/marketing.routes.tsx",
  "apps/web/src/app/routes/groups/production.routes.tsx",
  "apps/web/src/app/routes/groups/reference.routes.tsx",
] as const;

const INTENTIONAL_NON_DIRECTORY_ROUTES = new Set([
  "/auth/callback",
  "/auth/reset-password",
  "/auth/verify-email",
  "/collaborate/moderation",
  "/community/promote/moderation",
  "/challenges",
  "/creator-hub",
  "/creator-hub/references",
  "/production/projects",
  "/showcase",
  "/sitemap",
  "/studio/brush-lab",
]);

const LEGACY_SHARED_PAGE_ALIASES = new Map([
  ["/create", "/showcase"],
  ["/create/challenges", "/showcase/challenges"],
  ["/create/promo", "/showcase/promo"],
]);

const LEGACY_REDIRECT_ALIASES = new Map([
  ["/brush-lab", "/studio/assets/brushes/new"],
  ["/music", "/studio/assets/audio"],
  ["/publishing", "/studio/publish"],
]);

const NESTED_USER_FACING_DESTINATIONS = [
  "/learn",
  "/learn/glossary",
  "/learn/records",
  "/learn/studio",
  "/production",
  "/studio",
  "/studio/new",
  "/studio/assets",
  "/studio/3d/dcc/build",
  "/studio/3d/dcc/cad",
  "/studio/3d/dcc/material",
  "/studio/3d/dcc/model",
  "/studio/3d/dcc/sculpt",
  "/studio/3d/dcc/shot",
  "/studio/animation",
  "/studio/assets/characters/new",
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
const directoryPaths = new Set(
  SITEMAP_DIRECTORY_ENTRIES.map((entry) => canonicalSitePath(entry.href)),
);
const extendedDestinationHrefs = SITEMAP_EXTENDED_DESTINATION_GROUPS
  .flatMap((group) => group.items)
  .map((item) => item.href);

const canonicalDirectoryPath = (href: string) => (
  LEGACY_SHARED_PAGE_ALIASES.get(href)
  ?? LEGACY_REDIRECT_ALIASES.get(href)
  ?? canonicalSitePath(href)
);

function staticUserFacingRoutes(): string[] {
  const routes = PUBLIC_ROUTE_SOURCE_FILES.flatMap((sourcePath) => {
    const source = readFileSync(sourcePath, "utf8");
    const fromPathField = [...source.matchAll(/\bpath:\s*"([^"]+)"/gu)].map((match) => match[1]);
    const fromRouteHelper = [...source.matchAll(/\broute\(\s*"[^"]+"\s*,\s*"([^"]+)"/gu)].map((match) => match[1]);
    return [...fromPathField, ...fromRouteHelper];
  });

  return [...new Set(routes)]
    .filter((href) => !href.includes(":") && !href.includes("*"))
    .filter((href) => !INTENTIONAL_NON_DIRECTORY_ROUTES.has(href))
    .sort();
}

describe("site directory experience contracts", () => {
  it("builds actual directory entries from the shared navigation and explicit destinations", () => {
    for (const item of [
      ...SITE_NAVIGATION_GROUPS.flatMap((group) => group.items),
      ...SITE_UTILITY_NAVIGATION,
    ]) {
      expect(directoryPaths, `missing rendered navigation destination: ${item.href}`)
        .toContain(canonicalSitePath(item.href));
    }
  });

  it("keeps every standalone user-facing route reachable from rendered directory data", () => {
    const expectedDestinations = new Set([
      ...staticUserFacingRoutes().map(canonicalDirectoryPath),
      ...NESTED_USER_FACING_DESTINATIONS,
    ]);

    for (const href of expectedDestinations) {
      expect(directoryPaths, `missing public directory destination: ${href}`).toContain(href);
    }
  });

  it("keeps canonical directory links equivalent to compatible legacy pages", () => {
    const routes = readFileSync("apps/web/src/app/routes/groups/creator.routes.tsx", "utf8");
    const pageByPath = new Map([...routes.matchAll(/path: "([^"]+)", element: <(\w+) \/>/gu)]
      .map((match) => [match[1], match[2]]));

    for (const [legacy, canonical] of LEGACY_SHARED_PAGE_ALIASES) {
      expect(pageByPath.get(legacy)).toBeTruthy();
      expect(pageByPath.get(legacy)).toBe(pageByPath.get(canonical));
      expect(directoryPaths).toContain(canonical);
      expect(extendedDestinationHrefs).not.toContain(legacy);
    }
  });

  it("keeps redirect aliases out while preserving canonical targets", () => {
    const routes = PUBLIC_ROUTE_SOURCE_FILES
      .map((sourcePath) => readFileSync(sourcePath, "utf8"))
      .join("\n");

    for (const [legacy, canonical] of LEGACY_REDIRECT_ALIASES) {
      expect(routes).toContain(`path: "${legacy}"`);
      expect(directoryPaths).toContain(canonical);
      expect(extendedDestinationHrefs).not.toContain(legacy);
    }
  });

  it("uses only unique canonical static destinations in the extended directory", () => {
    const canonical = extendedDestinationHrefs.map(canonicalSitePath);
    expect(new Set(canonical).size).toBe(canonical.length);
    expect(canonical.every((href) => !href.includes(":") && !href.includes("*"))).toBe(true);

    for (const href of [
      "/admin",
      "/auth/callback",
      "/auth/reset-password",
      "/auth/verify-email",
      "/collaborate/moderation",
      "/creator-hub",
      "/showcase",
      "/sitemap",
      "/studio/3d",
      "/studio/brush-lab",
      "/studio/companion/workspace",
    ]) {
      expect(canonical).not.toContain(href);
    }
  });

  it("exposes current Studio primary destinations instead of relying on unused source constants", () => {
    expect(directoryPaths).toContain("/production");
    expect(directoryPaths).toContain("/studio/new");
    expect(directoryPaths).toContain("/studio/assets");
    expect(directoryPaths).toContain("/studio/publish");
  });

  it("provides bilingual page copy and keyboard-visible focus treatments", () => {
    expect(sitemapSource).toContain("TOONSTUDIO DIRECTORY");
    expect(sitemapSource).toContain("All features and pages");
    expect(sitemapSource).toContain("전체 기능과 페이지");
    expect(sitemapSource).toContain("focus-visible:ring-2");
  });
});
