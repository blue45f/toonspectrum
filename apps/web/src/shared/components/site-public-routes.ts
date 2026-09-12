/** Shared discovery classification for the primary navigation and creative journey. */
export const DISCOVER_PURPOSE_PREFIXES = [
  "/discover", "/search", "/explore", "/ranking", "/recommend", "/calendar",
  "/compare", "/random", "/tags", "/authors", "/author", "/title",
] as const;

const PUBLIC_PAGES = new Set([
  "/", "/about", "/about/data", "/contact", "/support", "/help", "/sitemap",
  "/discover", "/discover/works", "/search", "/explore", "/ranking", "/recommend",
  "/calendar", "/compare", "/random", "/tags", "/authors", "/insights", "/insights/resources", "/news", "/guide",
  "/research", "/research/assets", "/research/books", "/now", "/opportunities",
  "/learn", "/learn/recipes", "/learn/glossary", "/learn/studio",
  "/market", "/market/browse", "/market/fit", "/market/compare",
  "/showcase", "/showcase/challenges", "/showcase/promo", "/create", "/create/challenges", "/create/promo",
  "/community", "/community/cafes", "/community/title", "/community/author", "/community/pencafe", "/reviews",
]);

const PUBLIC_DETAIL_ROUTES = [
  /^\/(?:title|author|pencafe)\/[^/]+$/u,
  /^\/market\/resource\/[^/]+$/u,
  /^\/(?:showcase|create)\/(?:series|work)\/[^/]+$/u,
  /^\/community\/(?:cafes|post)\/[^/]+$/u,
  /^\/learn\/(?:lessons|paths)\/[^/]+$/u,
];

/** Promotional navigation belongs to public discovery and learning, never account workflows. */
export function isPublicCreativeRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  return PUBLIC_PAGES.has(normalized) || PUBLIC_DETAIL_ROUTES.some((route) => route.test(normalized));
}

export function isDiscoverPurposeRoute(pathname: string): boolean {
  return DISCOVER_PURPOSE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
