// 정적 카탈로그 모드 — 전역 fetch 를 가로채 카탈로그 /api/* 호출을 정적 파일(/data/*.json) 또는
// 클라이언트 계산(기존 순수 lib 함수)으로 라우팅한다. 리뷰·인증·피드백·커뮤니티·관리자 등 동적
// 엔드포인트는 그대로 /api 로 통과(서버리스+Neon). 카탈로그 DB/API 코드는 보존 — 토글로 되돌릴 수 있다.
//
//   VITE_CATALOG_SOURCE=api   → 가로채지 않음(기존 DB/API 경로). 되돌리기용.
//   (미설정/그 외)            → 정적 모드(기본).
import type { PlatformId, ReadState, Title } from "@/lib/types";
import {
  activeTags,
  adaptationsOf,
  getCatalogState,
  getTitle,
  originalOf,
  replaceCatalogData,
  TITLES,
} from "@/lib/server/catalog-store";
import { searchTitles, sortTitles, suggest, type SearchFilters, type SortKey } from "@/lib/search";
import { buildTasteProfile, recommendForTaste, similarTitles } from "@/lib/recommend";
import { getExploreData } from "@/lib/server/explore";
import { getRankingData } from "@/lib/server/ranking-service";
import { getAuthorData } from "@/lib/server/author";

const STATIC_MODE = (import.meta.env.VITE_CATALOG_SOURCE ?? "static") !== "api";
const JSON_HEADERS = { "content-type": "application/json" };
const NOT_FOUND = Symbol("not-found");

// 파라미터 없는 카탈로그 페이지 → 사전 계산된 정적 파일.
const STATIC_FILES: Record<string, string> = {
  "/api/home": "/data/home.json",
  "/api/calendar": "/data/calendar.json",
  "/api/insights": "/data/insights.json",
  "/api/tags": "/data/tags.json",
  "/api/authors": "/data/authors.json",
};

let catalogPromise: Promise<void> | null = null;
function ensureCatalog(origFetch: typeof fetch): Promise<void> {
  if (!catalogPromise) {
    // 표준 HTTP 캐시(max-age=600, ETag 재검증) 사용 — force-cache 는 스냅샷 갱신(신규 작품·
    // 영상화 등)을 재방문자에게 무기한 숨기므로 쓰지 않는다. 세션 내 1회만 로드(catalogPromise 메모).
    catalogPromise = origFetch("/data/catalog.json", { cache: "default" })
      .then((r) => {
        if (!r.ok) throw new Error(`catalog.json ${r.status}`);
        return r.json() as Promise<Title[]>;
      })
      .then((titles) => {
        replaceCatalogData(titles, { source: "database-snapshot", sourceVersion: "static-catalog" });
      })
      .catch((error) => {
        catalogPromise = null; // 다음 호출에서 재시도
        throw error;
      });
  }
  return catalogPromise;
}

// ── catalog.service 의 응답 조립 로직 복제(동일 shape 유지) ──────────────
const validSorts = new Set<SortKey>(["relevance", "rating", "popular", "trending", "bookmarks", "completion", "newest", "title"]);
const validTypes = new Set(["webtoon", "webnovel"]);
const validStatus = new Set(["ongoing", "completed", "hiatus"]);
const validAge = new Set(["all", "12", "15", "19"]);
const SORTS: SortKey[] = ["popular", "rating", "trending", "newest", "relevance"];

function list<T extends string>(raw: string | null | undefined, allowed?: Set<string>): T[] | undefined {
  const values = (raw ?? "").split(",").map((v) => v.trim()).filter(Boolean) as T[];
  const filtered = allowed ? values.filter((v) => allowed.has(v)) : values;
  return filtered.length ? filtered : undefined;
}
const numberParam = (raw: string | null | undefined) => (Number.isFinite(Number(raw)) ? Number(raw) : undefined);
const boolParam = (raw: string | null | undefined) => raw === "true";
function clampLimit(raw: string | null | undefined) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 24;
  return Math.min(Math.max(Math.floor(n), 1), 80);
}
function platformCoverage(titles: Title[]) {
  const counts = new Map<PlatformId, number>();
  for (const t of titles) {
    new Set(t.availability.map((a) => a.platformId)).forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count, share: titles.length ? Math.round((count / titles.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}
const bayes = (t: Title) => (4 * 800 + t.stats.ratingAvg * t.stats.ratingCount) / (800 + t.stats.ratingCount);

function searchData(sp: URLSearchParams) {
  const sort = validSorts.has(sp.get("sort") as SortKey) ? (sp.get("sort") as SortKey) : "popular";
  const filters: SearchFilters = {
    q: sp.get("q") ?? "",
    types: list(sp.get("types"), validTypes),
    genres: list(sp.get("genres")),
    tags: list(sp.get("tags")),
    status: list(sp.get("status"), validStatus),
    platforms: list(sp.get("platforms")) as PlatformId[] | undefined,
    ageRatings: list(sp.get("ages"), validAge),
    minRating: numberParam(sp.get("minRating")),
    yearMin: numberParam(sp.get("yearMin")),
    yearMax: numberParam(sp.get("yearMax")),
    freeOnly: boolParam(sp.get("freeOnly")),
    adaptedOnly: boolParam(sp.get("adaptedOnly")),
  };
  const items = searchTitles(TITLES, filters, sort);
  return {
    items,
    total: items.length,
    typeCount: {
      webtoon: items.filter((t) => t.type === "webtoon").length,
      webnovel: items.filter((t) => t.type === "webnovel").length,
    },
    catalog: {
      ...getCatalogState(),
      platformCoverage: platformCoverage(TITLES),
      filteredPlatformCoverage: platformCoverage(items),
    },
    topTags: activeTags().slice(0, 18).map((t) => t.tag),
    generatedAt: new Date().toISOString(),
  };
}

function titlesData(sp: URLSearchParams) {
  const sort = (SORTS.includes(sp.get("sort") as SortKey) ? sp.get("sort") : "popular") as SortKey;
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const q = (sp.get("q") ?? "").trim();
  const limit = clampLimit(sp.get("limit"));
  const seen = new Set<string>();
  let items: Title[];
  if (ids.length > 0) {
    items = ids.map((id) => getTitle(id)).filter((t): t is Title => Boolean(t)).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  } else if (q) {
    items = suggest(TITLES, q, limit);
  } else {
    items = sortTitles(TITLES, sort).slice(0, limit);
  }
  return { items, meta: { total: items.length, query: q || null, ids, sort, generatedAt: new Date().toISOString(), source: "static-catalog" } };
}

async function titleDetail(slug: string, origFetch: typeof fetch) {
  const title = getTitle(slug);
  if (!title) return NOT_FOUND;
  const similar = similarTitles(TITLES, title, 8);
  const original = originalOf(title) ?? title;
  const adaptations = adaptationsOf(original);
  // 리뷰는 하이브리드 — 런타임 /api(Neon)에서 가져와 병합. 실패(쿼터 등) 시 빈 배열로 폴백.
  let reviews: unknown[] = [];
  try {
    const res = await origFetch(`/api/titles/${encodeURIComponent(title.id)}/reviews`, { cache: "no-store" });
    if (res.ok) reviews = await res.json();
  } catch {
    reviews = [];
  }
  const reviewCount = reviews.length;
  const reviewAvg = reviewCount > 0 ? (reviews as { rating: number }[]).reduce((s, r) => s + (r.rating ?? 0), 0) / reviewCount : 0;
  return { title, reviews, similar, original, adaptations, hasFamily: adaptations.length > 0, reviewAvg, reviewCount, generatedAt: new Date().toISOString(), source: "static-catalog" };
}

function recordNumbers(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, Number(v)] as const).filter(([, v]) => Number.isFinite(v)));
}
function recordReads(value: unknown): Record<string, ReadState> {
  if (!value || typeof value !== "object") return {};
  const allowed = new Set<ReadState>(["want", "reading", "done", "dropped"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((e): e is [string, ReadState] => allowed.has(e[1] as ReadState)));
}
function recommendData(body: Record<string, unknown>) {
  const picked = Array.isArray(body.picked) ? (body.picked as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const seedId = typeof body.seedId === "string" ? body.seedId : null;
  const ratings = recordNumbers(body.ratings);
  const reads = recordReads(body.reads);
  const seen = new Set([...Object.keys(ratings), ...Object.keys(reads)]);
  const profile = buildTasteProfile(TITLES, ratings, reads);
  const genres = picked.length ? picked : profile.topGenres.slice(0, 3).map((g) => g.name);
  const byId = new Map(TITLES.map((t) => [t.id, t]));
  const reading = Object.entries(reads).filter(([, s]) => s === "reading" || s === "want").map(([id]) => byId.get(id)).filter((t): t is Title => Boolean(t));
  const pickedRecs = genres.length
    ? TITLES.filter((t) => t.genres.some((g) => genres.includes(g)) && !seen.has(t.id)).sort((a, b) => bayes(b) - bayes(a)).slice(0, 15)
    : TITLES.filter((t) => t.featured).slice(0, 12);
  const tasteRecs = recommendForTaste(TITLES, profile, seen, 12);
  const popular = [...TITLES].sort((a, b) => b.stats.views - a.stats.views).slice(0, 12);
  const seed = (seedId && getTitle(seedId)) || popular[0] || null;
  const similar = seed ? similarTitles(TITLES, seed, 12) : [];
  return { pickedRecs, pickedLabelGenres: genres, tasteRecs, reading, popular, seed, similar, profile: { ratedCount: profile.ratedCount, readCount: Object.keys(reads).length, topGenres: profile.topGenres }, generatedAt: new Date().toISOString() };
}

// URL → 카탈로그 핸들러(엔진). 카탈로그가 아니면 null(통과).
function matchEngine(pathname: string, sp: URLSearchParams): null | ((init: RequestInit | undefined, origFetch: typeof fetch) => Promise<unknown> | unknown) {
  if (pathname === "/api/search") return () => searchData(sp);
  if (pathname === "/api/ranking")
    // 실시간(live) 제거 — 스냅샷 기반 산식 랭킹(naver 호출·CORS·서버리스 없음).
    return async () => getRankingData({ get: (n: string) => sp.get(n) }, { disableLive: true });
  if (pathname === "/api/explore") return async () => getExploreData(Object.fromEntries(sp.entries()));
  if (pathname === "/api/recommend") return (init) => recommendData(parseBody(init));
  if (pathname === "/api/titles") return () => titlesData(sp);
  if (pathname.startsWith("/api/titles/") && !pathname.endsWith("/reviews")) {
    const slug = decodeURIComponent(pathname.slice("/api/titles/".length));
    return (_init, origFetch) => titleDetail(slug, origFetch);
  }
  if (pathname.startsWith("/api/authors/")) {
    const name = decodeURIComponent(pathname.slice("/api/authors/".length));
    return async () => (await getAuthorData(name)) ?? NOT_FOUND;
  }
  return null;
}

// 랭킹 기본 뷰(필터 없음·주간) → 사전계산 정적 파일 경로. 그 외(필터·다른 기간)는 null → 클라 엔진.
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

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (!init?.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function installStaticCatalog(): void {
  if (!STATIC_MODE || typeof window === "undefined" || (window.fetch as { __webdexStatic?: boolean }).__webdexStatic) return;
  const origFetch = window.fetch.bind(window);

  const patched: typeof fetch = async (input, init) => {
    let pathname: string;
    let sp: URLSearchParams;
    try {
      const u = new URL(toUrl(input), window.location.origin);
      pathname = u.pathname;
      sp = u.searchParams;
    } catch {
      return origFetch(input, init);
    }
    if (!pathname.startsWith("/api/")) return origFetch(input, init);

    // 파라미터 없는 카탈로그 페이지 → 정적 파일.
    // 정적 스냅샷은 CDN 캐시(ETag·max-age=600·SWR)를 그대로 활용한다. 호출부(use-api-resource)는
    // 동적 API용으로 cache:"no-store" 를 보내는데, 그대로 통과시키면 브라우저가 매번 전체를 다시
    // 받는다(304/디스크 캐시 무력화). 정적 파일에 한해 cache:"default" 로 덮어써 재검증을 살린다.
    if (STATIC_FILES[pathname] && [...sp.keys()].length === 0) {
      return origFetch(STATIC_FILES[pathname], { ...init, cache: "default" });
    }
    // 랭킹 기본 뷰 → 사전계산 정적 파일(전체 카탈로그 로드 없이 즉시). 필터/다른 기간은 아래 엔진.
    const rankingPath = precomputedRankingPath(pathname, sp);
    if (rankingPath) {
      const res = await origFetch(rankingPath, { ...init, cache: "default" });
      if (res.ok) return res;
    }
    // 동적 카탈로그 → 클라이언트 엔진
    const handler = matchEngine(pathname, sp);
    if (!handler) return origFetch(input, init); // 카탈로그 외(리뷰·인증 등) 통과

    try {
      await ensureCatalog(origFetch);
      const data = await handler(init, origFetch);
      if (data === NOT_FOUND) return new Response("null", { status: 404, headers: JSON_HEADERS });
      return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "static catalog error" }), { status: 500, headers: JSON_HEADERS });
    }
  };

  (patched as { __webdexStatic?: boolean }).__webdexStatic = true;
  window.fetch = patched;
}
