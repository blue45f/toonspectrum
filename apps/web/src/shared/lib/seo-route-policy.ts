import { parsePublicSharePath } from "@toonspectrum/core";

import { canonicalSitePath } from "./site-route-authority";

export const INDEX_ROBOTS =
  "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
export const NOINDEX_FOLLOW_ROBOTS = "noindex,follow";
export const NOINDEX_PRIVATE_ROBOTS = "noindex,nofollow,noarchive";

export interface SeoRoutePolicy {
  readonly canonicalPath: string;
  readonly robots: string;
  readonly indexable: boolean;
}

const PRIVATE_PREFIXES = [
  "/admin",
  "/auth",
  "/studio",
  "/production",
  "/library",
  "/messages",
  "/me",
  "/my",
  "/settings",
  "/market/checkout",
  "/market/library",
  "/market/manage",
  "/market/publish",
  "/market/wishlist",
] as const;

const PRIVATE_SUFFIXES = ["/edit", "/manage", "/moderation", "/new"] as const;

const CRAWLABLE_UTILITY_ROUTES = new Set([
  "/search",
  "/compare",
  "/random",
  "/market/compare",
]);

const INDEXABLE_EXACT_ROUTES = new Set([
  "/",
  "/about",
  "/about/crawler",
  "/about/data",
  "/about/principles",
  "/about/workflow",
  "/accessibility",
  "/authors",
  "/brand-film",
  "/business",
  "/calendar",
  "/collaborate",
  "/community",
  "/community/author",
  "/community/cafes",
  "/community/pencafe",
  "/community/promote",
  "/community/title",
  "/contact",
  "/copyright",
  "/design",
  "/discover",
  "/discover/works",
  "/explore",
  "/feedback",
  "/guide",
  "/help",
  "/insights",
  "/insights/resources",
  "/market",
  "/market/browse",
  "/market/fit",
  "/news",
  "/now",
  "/opportunities",
  "/play",
  "/privacy",
  "/product-tour",
  "/ranking",
  "/recommend",
  "/references",
  "/reviews",
  "/showcase",
  "/showcase/challenges",
  "/showcase/promo",
  "/sitemap",
  "/story-lab",
  "/support",
  "/support-creators",
  "/support-us",
  "/tags",
  "/terms",
]);

const INDEXABLE_PREFIXES = [
  "/about/technology",
  "/learn",
  "/research",
] as const;

const INDEXABLE_DETAIL_ROUTES = [
  /^\/market\/resource\/[^/]+$/u,
  /^\/title\/[^/]+$/u,
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPrivateRoute(pathname: string): boolean {
  if (PRIVATE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return true;
  return PRIVATE_SUFFIXES.some(
    (suffix) => pathname.endsWith(suffix) || pathname.includes(`${suffix}/`),
  );
}

function isIndexableRoute(pathname: string): boolean {
  if (INDEXABLE_EXACT_ROUTES.has(pathname)) return true;
  if (INDEXABLE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return true;
  return INDEXABLE_DETAIL_ROUTES.some((pattern) => pattern.test(pathname));
}

/**
 * SEO is intentionally fail-closed: unknown/application routes are noindex until they are
 * explicitly classified as public content. This prevents new account or editor surfaces from
 * accidentally entering search indexes while keeping their links crawlable when appropriate.
 */
export function resolveSeoRoutePolicy(pathname: string): SeoRoutePolicy {
  const authorityPath = canonicalSitePath(pathname);
  const publicShareRoute = parsePublicSharePath(authorityPath);
  const canonicalPath = publicShareRoute?.canonicalPath ?? authorityPath;
  if (isPrivateRoute(canonicalPath)) {
    return { canonicalPath, robots: NOINDEX_PRIVATE_ROBOTS, indexable: false };
  }
  if (CRAWLABLE_UTILITY_ROUTES.has(canonicalPath)) {
    return { canonicalPath, robots: NOINDEX_FOLLOW_ROBOTS, indexable: false };
  }
  if (publicShareRoute || isIndexableRoute(canonicalPath)) {
    return { canonicalPath, robots: INDEX_ROBOTS, indexable: true };
  }
  return { canonicalPath, robots: NOINDEX_FOLLOW_ROBOTS, indexable: false };
}
