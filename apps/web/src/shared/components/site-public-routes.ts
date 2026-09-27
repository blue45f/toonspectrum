/** Shared discovery classification for the primary navigation and creative journey. */
export const DISCOVER_PURPOSE_PREFIXES = [
  "/discover", "/search", "/explore", "/ranking", "/recommend", "/calendar",
  "/compare", "/random", "/tags", "/authors", "/author", "/title", "/references",
] as const;

const PUBLIC_PAGES = new Set([
  "/", "/brand-film", "/product-tour", "/events", "/membership", "/references", "/collaborate", "/collaborate/positions", "/collaborate/gallery", "/creators", "/about", "/about/studio", "/about/workflow", "/about/technology", "/about/technology/story", "/about/technology/playbook", "/about/technology/guides", "/about/technology/references", "/about/technology/field-notes", "/about/technology/deck", "/about/technology/videos", "/about/technology/licenses", "/about/principles", "/about/data", "/about/crawler", "/contact", "/business", "/support-us", "/support-creators", "/support", "/help", "/status", "/sitemap",
  "/discover", "/discover/works", "/search", "/explore", "/ranking", "/recommend",
  "/calendar", "/compare", "/random", "/tags", "/authors", "/insights", "/insights/resources", "/news", "/guide",
  "/research", "/research/catalog", "/research/assets", "/research/open-creation", "/research/packs", "/research/books", "/research/3d-assets", "/research/material-assets", "/research/space-assets", "/research/vam", "/research/rijksmuseum", "/research/fonts", "/research/creatures", "/research/music-metadata", "/research/archive", "/research/weather-light", "/research/open-data", "/references", "/now", "/opportunities", "/story-lab",
  "/learn", "/learn/recipes", "/learn/glossary", "/learn/studio", "/learn/process", "/learn/careers", "/learn/education", "/learn/resources", "/learn/classroom", "/learn/trace",
  "/ecosystem/education", "/ecosystem/collaboration", "/ecosystem/fandom", "/ecosystem/library",
  "/market", "/market/browse", "/market/fit", "/market/compare",
  "/showcase", "/showcase/reviews", "/showcase/challenges", "/showcase/promo", "/create", "/create/challenges", "/create/promo",
  "/community", "/community/events", "/community/promote", "/community/cafes", "/community/title", "/community/author", "/community/pencafe", "/reviews",
  "/accessibility", "/design", "/terms", "/privacy", "/copyright", "/feedback", "/developers",
]);

// 공개 목록과 같은 URL 깊이의 작성·운영 화면은 상세 경로로 분류하지 않는다.
const PRIVATE_WORKFLOW_PAGES = new Set([
  "/collaborate/new", "/collaborate/workspace", "/collaborate/moderation",
  "/community/promote/new", "/community/promote/moderation",
]);

const PUBLIC_DETAIL_ROUTES = [
  /^\/events\/[^/]+$/u,
  /^\/(?:title|author|pencafe)\/[^/]+$/u,
  /^\/market\/resource\/[^/]+$/u,
  /^\/(?:showcase|create)\/(?:series|work)\/[^/]+$/u,
  /^\/showcase\/reviews\/[^/]+$/u,
  /^\/community\/(?:cafes|post)\/[^/]+$/u,
  /^\/community\/promote\/[^/]+$/u,
  /^\/collaborate\/[^/]+$/u,
  /^\/u\/[^/]+$/u,
  /^\/create\/[^/]+$/u,
  /^\/learn\/(?:lessons|paths)\/[^/]+$/u,
  /^\/research\/open-data\/(?:ambientcg|vam|nasa|gbif|musicbrainz|internetarchive|kheritage|neis|tourapi|korean|smithsonian|wikimedia|europeana|dpla)$/u,
];

/** Promotional navigation belongs to public discovery and learning, never account workflows. */
export function isPublicCreativeRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/u, "") || "/";
  if (PRIVATE_WORKFLOW_PAGES.has(normalized)) return false;
  return PUBLIC_PAGES.has(normalized)
    || PUBLIC_DETAIL_ROUTES.some((route) => route.test(normalized));
}

export function isDiscoverPurposeRoute(pathname: string): boolean {
  return DISCOVER_PURPOSE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
