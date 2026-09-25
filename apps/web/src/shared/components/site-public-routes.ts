/** Shared discovery classification for the primary navigation and creative journey. */
export const DISCOVER_PURPOSE_PREFIXES = [
  "/discover", "/search", "/explore", "/ranking", "/recommend", "/calendar",
  "/compare", "/random", "/tags", "/authors", "/author", "/title", "/references",
] as const;

const PUBLIC_PAGES = new Set([
  "/", "/brand-film", "/product-tour", "/events", "/membership", "/references", "/about", "/about/studio", "/about/workflow", "/about/technology", "/about/technology/story", "/about/technology/guides", "/about/technology/references", "/about/technology/field-notes", "/about/technology/deck", "/about/technology/videos", "/about/technology/licenses", "/about/principles", "/about/data", "/about/crawler", "/contact", "/business", "/support-us", "/support-creators", "/support", "/help", "/sitemap",
  "/discover", "/discover/works", "/search", "/explore", "/ranking", "/recommend",
  "/calendar", "/compare", "/random", "/tags", "/authors", "/insights", "/insights/resources", "/news", "/guide",
  "/research", "/research/assets", "/research/books", "/research/3d-assets", "/research/material-assets", "/research/space-assets", "/research/vam", "/research/rijksmuseum", "/research/fonts", "/research/creatures", "/research/music-metadata", "/research/archive", "/research/weather-light", "/research/open-data", "/references", "/now", "/opportunities", "/story-lab",
  "/learn", "/learn/recipes", "/learn/glossary", "/learn/studio", "/learn/process", "/learn/careers", "/learn/education", "/learn/resources", "/learn/classroom",
  "/market", "/market/browse", "/market/fit", "/market/compare",
  "/showcase", "/showcase/reviews", "/showcase/challenges", "/showcase/promo", "/create", "/create/challenges", "/create/promo",
  "/community", "/community/cafes", "/community/title", "/community/author", "/community/pencafe", "/reviews",
]);

const PUBLIC_DETAIL_ROUTES = [
  /^\/events\/[^/]+$/u,
  /^\/(?:title|author|pencafe)\/[^/]+$/u,
  /^\/market\/resource\/[^/]+$/u,
  /^\/(?:showcase|create)\/(?:series|work)\/[^/]+$/u,
  /^\/showcase\/reviews\/[^/]+$/u,
  /^\/community\/(?:cafes|post)\/[^/]+$/u,
  /^\/learn\/(?:lessons|paths)\/[^/]+$/u,
  /^\/research\/open-data\/(?:ambientcg|vam|nasa|gbif|musicbrainz|internetarchive|kheritage|neis|tourapi|korean|smithsonian|wikimedia|europeana|dpla)$/u,
];

/** Promotional navigation belongs to public discovery and learning, never account workflows. */
export function isPublicCreativeRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  return PUBLIC_PAGES.has(normalized) || PUBLIC_DETAIL_ROUTES.some((route) => route.test(normalized));
}

export function isDiscoverPurposeRoute(pathname: string): boolean {
  return DISCOVER_PURPOSE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
