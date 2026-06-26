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

/** import.meta.env 가 없는 타입 컨텍스트와 무관하게 Title 의 최소 형태만 본다(엔진/스토어 공유 타입과 호환). */
type FilterableTitle = { ageRating?: string | null };

/** installStaticCatalog 옵션 — 채널 정책 주입(토스만). 미지정 시 웹 동작 불변. */
export interface StaticCatalogOptions {
  /**
   * 정적 데이터/패스스루 API 의 절대 오리진. 교차 출처 WebView(토스)에서 상대 /data·/api 를 절대화한다.
   * 웹(동일 출처)은 미지정 → 상대 경로 그대로.
   */
  dataBase?: string;
  /**
   * 콘텐츠 정책 필터(토스 19+ 제외 등). 카탈로그 로드 시점에 적용돼 검색·랭킹·탐색·추천·상세·랜덤 등
   * 엔진을 거치는 모든 응답에서 제외된다(단일 시드 필터 → 전 표면 일관). 미지정 시 무필터.
   */
  filterTitle?: (title: FilterableTitle) => boolean;
}

/**
 * 정적 카탈로그를 설치한다.
 *
 * @param options
 *   - dataBase: 정적 데이터/패스스루 API 의 절대 오리진(토스 교차 출처 WebView). 미지정=동일 출처(웹).
 *   - filterTitle: 콘텐츠 정책 필터(토스 19+ 제외). 미지정=무필터(웹).
 *   웹은 인자 없이 호출 → 상대 경로·무필터로 기존 동작 보존. 토스는 옵션을 주입해 같은 데이터/엔진을
 *   배포 오리진에서 가져오고 19+ 만 정책 제외한다(데이터/페이지 포크 0).
 */
export function installStaticCatalog(options: StaticCatalogOptions = {}): void {
  if (!STATIC_MODE || typeof window === "undefined" || (globalThis.fetch as { __toonspectrumStatic?: boolean }).__toonspectrumStatic) return;
  const { dataBase, filterTitle } = options;
  const base = dataBase ? dataBase.replace(/\/+$/, "") : "";

  // 콘텐츠 정책 필터(토스 19+ 제외)는 엔진이 카탈로그 로드 시 읽어 시드 자체에서 제외한다.
  // 엔진은 lazy 로드라 전역 핸드오프(globalThis)로 전달한다(설치 시점=엔진 로드 전).
  if (filterTitle) {
    (globalThis as { __toonspectrumCatalogFilter?: (t: FilterableTitle) => boolean }).__toonspectrumCatalogFilter =
      filterTitle;
  }

  // base 가 있으면 상대 /data·/api 경로를 배포 오리진으로 절대화한다(교차 출처 WebView 대응).
  // base 가 없으면(웹) 입력을 그대로 통과시켜 기존 동일 출처 동작을 보존한다.
  const rawFetch = globalThis.fetch.bind(window);
  const origFetch: typeof fetch = base
    ? (input, init) => {
        const url = toUrl(input);
        if (typeof input === "string" && (url.startsWith("/data/") || url.startsWith("/api/"))) {
          return rawFetch(`${base}${url}`, init);
        }
        return rawFetch(input, init);
      }
    : rawFetch;

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
    // fall through to the lazy engine. 콘텐츠 정책 필터(토스 19+)가 있으면 사전계산 랭킹은
    // 필터를 못 거치므로 건너뛰고 엔진 경로(필터 적용)로 보낸다.
    if (!filterTitle) {
      const rankingPath = precomputedRankingPath(pathname, sp);
      if (rankingPath) {
        const res = await origFetch(rankingPath, { ...init, cache: "default" });
        if (res.ok) return res;
      }
    }

    if (!usesStaticCatalogEngine(pathname)) return origFetch(input, init);

    const engine = await loadEngine();
    return engine.handleStaticCatalogRequest(pathname, sp, init, origFetch);
  };

  (patched as { __toonspectrumStatic?: boolean }).__toonspectrumStatic = true;
  globalThis.fetch = patched;
}
