import { canonicalSitePath } from "./site-route-metadata";

const RECENT_ROUTES_KEY = "toonspectrum:recent-site-routes:v1";
const FAVORITE_ROUTES_KEY = "toonspectrum:favorite-site-routes:v1";
export const SITE_ROUTE_PREFERENCES_EVENT = "toonspectrum:site-route-preferences" as const;
const MAX_RECENT_ROUTES = 12;

export interface RecentSiteRoute {
  readonly path: string;
  readonly visitedAt: number;
}

function availableStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function parseRecentRoutes(raw: string | null): RecentSiteRoute[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const candidate = value as Partial<RecentSiteRoute>;
      if (typeof candidate.path !== "string" || typeof candidate.visitedAt !== "number") return [];
      return [{ path: canonicalSitePath(candidate.path), visitedAt: candidate.visitedAt }];
    });
  } catch {
    return [];
  }
}

function emitPreferenceChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SITE_ROUTE_PREFERENCES_EVENT));
}

export function readRecentSiteRoutes(): RecentSiteRoute[] {
  return parseRecentRoutes(availableStorage()?.getItem(RECENT_ROUTES_KEY) ?? null)
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, MAX_RECENT_ROUTES);
}

export function recordSiteRouteVisit(input: string, visitedAt = Date.now()): void {
  const storage = availableStorage();
  if (!storage) return;
  const path = canonicalSitePath(input);
  if (path.startsWith("/admin") || path.startsWith("/auth/")) return;
  const next = [
    { path, visitedAt },
    ...readRecentSiteRoutes().filter((entry) => entry.path !== path),
  ].slice(0, MAX_RECENT_ROUTES);
  try {
    storage.setItem(RECENT_ROUTES_KEY, JSON.stringify(next));
    emitPreferenceChange();
  } catch {
    // Private browsing and quota failures must never block navigation.
  }
}

export function readFavoriteSiteRoutes(): string[] {
  return [...new Set(parseStringArray(availableStorage()?.getItem(FAVORITE_ROUTES_KEY) ?? null)
    .map(canonicalSitePath))];
}

export function isFavoriteSiteRoute(input: string): boolean {
  return readFavoriteSiteRoutes().includes(canonicalSitePath(input));
}

export function setFavoriteSiteRoute(input: string, favorite: boolean): string[] {
  const storage = availableStorage();
  if (!storage) return [];
  const path = canonicalSitePath(input);
  const previous = readFavoriteSiteRoutes();
  const next = favorite
    ? [...new Set([...previous, path])]
    : previous.filter((entry) => entry !== path);
  try {
    storage.setItem(FAVORITE_ROUTES_KEY, JSON.stringify(next));
    emitPreferenceChange();
  } catch {
    return previous;
  }
  return next;
}

export function toggleFavoriteSiteRoute(input: string): string[] {
  const path = canonicalSitePath(input);
  return setFavoriteSiteRoute(path, !isFavoriteSiteRoute(path));
}
