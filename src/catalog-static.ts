// 정적 카탈로그 fetch installer. Keep this module light: it is imported by main.tsx
// before the app renders. Heavy catalog search/ranking logic lives in catalog-static-engine
// and is loaded only for dynamic catalog routes.

const STATIC_MODE = (import.meta.env.VITE_CATALOG_SOURCE ?? "static") !== "api";

const STATIC_FILES: Record<string, string> = {
  "/api/home": "/data/home.json",
  "/api/calendar": "/data/calendar.json",
  "/api/insights": "/data/insights.json",
  "/api/tags": "/data/tags.json",
  "/api/authors": "/data/authors.json",
};

type StaticCatalogEngine = typeof import("./catalog-static-engine");

let enginePromise: Promise<StaticCatalogEngine> | null = null;

function loadEngine(): Promise<StaticCatalogEngine> {
  enginePromise ??= import("./catalog-static-engine");
  return enginePromise;
}

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function precomputedRankingPath(pathname: string, sp: URLSearchParams): string | null {
  if (pathname !== "/api/ranking") return null;
  const isDefault =
    (sp.get("period") ?? "weekly") === "weekly" &&
    (sp.get("platform") ?? "all") === "all" &&
    (sp.get("genre") ?? "all") === "all" &&
    (sp.get("status") ?? "all") === "all" &&
    (sp.get("pricing") ?? "all") === "all" &&
    !sp.get("minRating") &&
    sp.get("rising") !== "true" &&
    sp.get("refresh") !== "true";
  if (!isDefault) return null;
  const axis = sp.get("axis") ?? "popular";
  const type = sp.get("type") ?? "all";
  return `/data/ranking/${encodeURIComponent(axis)}-${encodeURIComponent(type)}.json`;
}

function usesStaticCatalogEngine(pathname: string): boolean {
  return (
    pathname === "/api/search" ||
    pathname === "/api/random" ||
    pathname === "/api/ranking" ||
    pathname === "/api/explore" ||
    pathname === "/api/recommend" ||
    pathname === "/api/titles" ||
    (pathname.startsWith("/api/titles/") && !pathname.endsWith("/reviews")) ||
    pathname.startsWith("/api/authors/")
  );
}

export function installStaticCatalog(): void {
  if (!STATIC_MODE || typeof window === "undefined" || (globalThis.fetch as { __toonspectrumStatic?: boolean }).__toonspectrumStatic) return;
  const origFetch = globalThis.fetch.bind(window);

  const patched: typeof fetch = async (input, init) => {
    let pathname: string;
    let sp: URLSearchParams;
    try {
      const u = new URL(toUrl(input), globalThis.location.origin);
      pathname = u.pathname;
      sp = u.searchParams;
    } catch {
      return origFetch(input, init);
    }
    if (!pathname.startsWith("/api/")) return origFetch(input, init);

    // Parameter-free catalog pages use precomputed CDN files and do not need the
    // in-browser catalog engine.
    if (STATIC_FILES[pathname] && [...sp.keys()].length === 0) {
      return origFetch(STATIC_FILES[pathname], { ...init, cache: "default" });
    }

    // Default ranking views are precomputed. Filtered/custom ranking requests
    // fall through to the lazy engine.
    const rankingPath = precomputedRankingPath(pathname, sp);
    if (rankingPath) {
      const res = await origFetch(rankingPath, { ...init, cache: "default" });
      if (res.ok) return res;
    }

    if (!usesStaticCatalogEngine(pathname)) return origFetch(input, init);

    const engine = await loadEngine();
    return engine.handleStaticCatalogRequest(pathname, sp, init, origFetch);
  };

  (patched as { __toonspectrumStatic?: boolean }).__toonspectrumStatic = true;
  globalThis.fetch = patched;
}
