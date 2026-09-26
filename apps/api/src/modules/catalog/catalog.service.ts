import { parseSearchPageQuery, searchPageItems, searchPagination, type SearchPageQuery } from "../../../../../packages/core/src/search-pagination";
import "reflect-metadata";
import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { desc, eq, inArray, sql } from "drizzle-orm";

import { fromDb } from "../../../../web/src/shared/lib/api-helpers";
import { buildTasteProfile, recommendForTaste, similarTitles } from "../../../../web/src/shared/lib/recommend";
import { MAX_SEARCH_QUERY_LENGTH, sortTitles, suggest, type SearchFilters, type SortKey } from "../../../../web/src/shared/lib/search";
import {
  activeTags,
  getAuthorData,
  getAuthorDirectory,
  getCalendarData,
  getCatalogState,
  getExploreData,
  getHomeData,
  getInsightsData,
  getRankingData,
  getRandomData,
  getTitle,
  TITLES,
} from "../../../../../packages/core/src/catalog";
import { isDatabaseAvailabilityError } from "../../platform/http/database-availability";
import { withDatabaseCapability } from "../../platform/http/service-availability";
import { db, reviewLikes, reviews, users } from "../../platform/database";
import { loadBundledCatalog } from "../../server/catalog-loader";
import {
  enrichTitleWithKmas,
  enrichTitlesWithKmas,
  getKmasBookAndWebtoonProxyResponse,
  getKmasSearchData,
  mergeKmasForSiteAccessOnce,
  shouldMergeKmasOnAccess,
  withKmasImageUrlsForResponse,
  type KmasSiteAccessMergeResult,
} from "../../server/kmas";
import { getReviewGlobalStats } from "../../server/reviews";
import { getTitleDetail as getTitleDetailFromLib } from "../../server/title";
// 브라우저-세이프 카탈로그 read-model 7종은 @toonspectrum/core 패키지(packages/core/src/catalog)로 이전됨
// (웹 앱·API가 공유). API 는 lib/* 와 동일한 deep-climb(rootDir=레포루트) 로 참조한다 — tsc 가 dist 로 함께
// 컴파일해 상대 require 로 런타임 해석되도록(bare 패키지 지정자는 plain-node 가 .ts exports 를 못 풀어 부적합).

import { CatalogSearchCache } from "./catalog-search-cache";

import type { AgeRating, PlatformId, ReadState, SerialStatus, Title, WorkType } from "../../../../web/src/shared/lib/types";
import type { OnModuleInit } from "@nestjs/common";

type QueryRecord = Record<string, string>;

interface TitleQuery {
  ids?: string;
  q?: string;
  limit?: number | string;
  sort?: string;
}

interface SearchRouteQuery extends SearchPageQuery {
  sort?: string;
  q?: string;
  types?: string;
  genres?: string;
  tags?: string;
  status?: string;
  platforms?: string;
  ages?: string;
  minRating?: string;
  yearMin?: string;
  yearMax?: string;
  freeOnly?: string;
  adaptedOnly?: string;
}

interface RecommendPayload {
  picked?: unknown;
  seedId?: unknown;
  ratings?: unknown;
  reads?: unknown;
}

interface KmasBookAndWebtoonQuery {
  title?: string;
  isbn?: string;
  listSeCd?: string;
  pictrWritrNm?: string;
  sntncWritrNm?: string;
  pltfomCdNm?: string;
  plscmpnIdNm?: string;
  startDate?: string;
  endDate?: string;
  pageNo?: string;
  viewItemCnt?: string;
}

interface KmasMergeOptions {
  force?: boolean;
}

const validSorts = new Set<SortKey>([
  "relevance",
  "rating",
  "popular",
  "trending",
  "bookmarks",
  "completion",
  "newest",
  "title",
]);

const validTypes = new Set<WorkType>(["webtoon", "webnovel"]);
const validStatus = new Set<SerialStatus>(["ongoing", "completed", "hiatus"]);
const validAge = new Set<AgeRating>(["all", "12", "15", "19"]);
const SORTS: SortKey[] = ["popular", "rating", "trending", "newest", "relevance"];

type ReadStateMap = Record<string, ReadState>;
type RatingMap = Record<string, number>;

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly searchCache = new CatalogSearchCache();
  private kmasSiteAccessLogged = false;

  async onModuleInit() {
    try {
      const result = loadBundledCatalog();
      if (result.loaded) {
        console.log(`catalog loaded from bundled file (${result.titleCount} titles)`);
      } else {
        console.warn(
          "catalog file missing; starting empty (run pnpm catalog:update:manual, review, commit, and redeploy)"
        );
      }
    } catch (error) {
      console.error("catalog load failed; runtime catalog is empty", error);
    }
  }

  async mergeKmasOnSiteAccess(options: KmasMergeOptions = {}): Promise<KmasSiteAccessMergeResult & { generatedAt: string }> {
    if (!shouldMergeKmasOnAccess()) {
      return {
        enabled: false,
        attempted: 0,
        updated: 0,
        cached: false,
        cacheTtlMs: 0,
        generatedAt: new Date().toISOString(),
      };
    }
    try {
      const result = await mergeKmasForSiteAccessOnce(process.env, options);
      if (!this.kmasSiteAccessLogged && result.enabled && !result.cached) {
        this.kmasSiteAccessLogged = true;
        console.log(
          `KMAS live merge on access: attempted=${result.attempted} updated=${result.updated} cacheTtlMs=${result.cacheTtlMs}`
        );
      }
      return { ...result, generatedAt: new Date().toISOString() };
    } catch (error) {
      console.error("KMAS live merge on access failed; using existing catalog data", error);
      return {
        enabled: true,
        attempted: 0,
        updated: 0,
        cached: false,
        cacheTtlMs: 0,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  private async enrichResponseTitles(items: readonly Title[]) {
    if (!shouldMergeKmasOnAccess() || items.length === 0) return;
    const limit = clampLimit(process.env.KMAS_RESPONSE_ENRICH_LIMIT ?? 12);
    await enrichTitlesWithKmas(items.slice(0, limit)).catch((error) => {
      console.error("KMAS response enrichment failed; returning existing title data", error);
    });
  }

  private async withKmasImages<T>(data: T | Promise<T>): Promise<T> {
    const resolved = await data;
    if (!shouldMergeKmasOnAccess()) return resolved;
    const limit = clampLimit(process.env.KMAS_RESPONSE_IMAGE_LIMIT ?? 96);
    return withKmasImageUrlsForResponse(resolved, process.env, limit, { cachedOnly: true }).catch((error) => {
      console.error("KMAS response image URL overlay failed; returning existing title data", error);
      return resolved;
    });
  }

  getRandomData(query: QueryRecord) {
    return getRandomData(query);
  }

  async getHomeData() {
    void this.mergeKmasOnSiteAccess().catch(() => {});
    // Keep the static catalog available when review storage is down, but name the partial state.
    let reviewsStatus: "available" | "unavailable" = "available";
    const data = await getHomeData({
      loadReviewStats: async () => {
        try {
          return await getReviewGlobalStats();
        } catch (error) {
          if (!isDatabaseAvailabilityError(error)) throw error;
          reviewsStatus = "unavailable";
          return { total: 0 };
        }
      },
    });
    return this.withKmasImages({ ...data, reviewsStatus });
  }

  async getCalendarData() {
    void this.mergeKmasOnSiteAccess().catch(() => {});
    return this.withKmasImages(await getCalendarData());
  }

  async getInsightsData() {
    void this.mergeKmasOnSiteAccess().catch(() => {});
    return this.withKmasImages(await getInsightsData());
  }

  async getRankingData(query: QueryRecord) {
    void this.mergeKmasOnSiteAccess().catch(() => {});
    return this.withKmasImages(await getRankingData(createQueryReader(query)));
  }

  async getExploreData(query: QueryRecord) {
    void this.mergeKmasOnSiteAccess().catch(() => {});
    return this.withKmasImages(await getExploreData(query));
  }

  async getSearchData(query: SearchRouteQuery) {
    let page: ReturnType<typeof parseSearchPageQuery>;
    try {
      page = parseSearchPageQuery(query);
    } catch (error) {
      throw new BadRequestException({ error: error instanceof Error ? error.message : "Invalid search page" });
    }
    const q = validatedSearchQuery(query.q);
    void this.mergeKmasOnSiteAccess().catch(() => {});
    const kmasLive = page.ids !== undefined ? null : await getKmasSearchData({ q, limit: page.pageSize, page: page.page }).catch((error) => {
      if (error instanceof RangeError) throw new BadRequestException("KMAS page exceeds provider limit");
      console.error("KMAS live search failed; falling back to existing catalog search", error);
      return null;
    });
    if (kmasLive) {
      const pagination = searchPagination(kmasLive.total, page);
      if (page.page >= 10_000) { pagination.hasMore = false; pagination.nextPage = null; }
      return { ...kmasLive, pagination, typeCountScope: "page" as const };
    }

    const sort = validSorts.has(query.sort as SortKey) ? (query.sort as SortKey) : "popular";
    const filters: SearchFilters = {
      q,
      types: list(query.types, validTypes),
      genres: list(query.genres),
      tags: list(query.tags),
      status: list(query.status, validStatus),
      platforms: list(query.platforms) as PlatformId[] | undefined,
      ageRatings: list(query.ages, validAge),
      minRating: numberParam(query.minRating),
      yearMin: numberParam(query.yearMin),
      yearMax: numberParam(query.yearMax),
      freeOnly: boolParam(query.freeOnly),
      adaptedOnly: boolParam(query.adaptedOnly),
    };
    // Saved-title filtering happens BEFORE scoring, not after cutting the first page.
    const catalogState = getCatalogState();
    const result = this.searchCache.get(TITLES, { ...filters, ids: page.ids }, sort, catalogState.revision, !shouldMergeKmasOnAccess());
    const { items, typeCount } = result;
    const pageItems = searchPageItems(items, page);
    await this.enrichResponseTitles(pageItems);

    return this.withKmasImages({
      items: pageItems,
      total: items.length,
      pagination: searchPagination(items.length, page),
      typeCountScope: "all" as const,
      typeCount,
      catalog: {
        ...catalogState,
        platformCoverage: result.platformCoverage,
        filteredPlatformCoverage: result.filteredPlatformCoverage,
      },
      topTags: activeTags().slice(0, 18).map((tag) => tag.tag),
      generatedAt: new Date().toISOString(),
    });
  }

  async getRecommendData(payload: RecommendPayload) {
    void this.mergeKmasOnSiteAccess().catch(() => {});
    const body = (payload ?? {}) as Record<string, unknown>;
    const picked = stringList(body.picked);
    const seedId = typeof body.seedId === "string" ? body.seedId : null;
    const ratings = recordNumbers(body.ratings);
    const reads = recordReads(body.reads);

    const seen = new Set([...Object.keys(ratings), ...Object.keys(reads)]);
    const profile = buildTasteProfile(TITLES, ratings, reads);
    const genres = picked.length ? picked : profile.topGenres.slice(0, 3).map((genre) => genre.name);
    const byId = new Map(TITLES.map((title) => [title.id, title]));
    const reading = Object.entries(reads)
      .filter(([, state]) => state === "reading" || state === "want")
      .map(([id]) => byId.get(id))
      .filter((title): title is Title => Boolean(title));

    const pickedRecs = genres.length
      ? TITLES.filter((title) => title.genres.some((genre) => genres.includes(genre)) && !seen.has(title.id))
          .sort((a, b) => bayes(b) - bayes(a))
          .slice(0, 15)
      : TITLES.filter((title) => title.featured).slice(0, 12);

    const tasteRecs = recommendForTaste(TITLES, profile, seen, 12);
    const popular = [...TITLES].sort((a, b) => b.stats.views - a.stats.views).slice(0, 12);
    const seed = (seedId && getTitle(seedId)) || popular[0] || null;
    const similar = seed ? similarTitles(TITLES, seed, 12) : [];

    return this.withKmasImages({
      pickedRecs,
      pickedLabelGenres: genres,
      tasteRecs,
      reading,
      popular,
      seed,
      similar,
      profile: {
        ratedCount: profile.ratedCount,
        readCount: Object.keys(reads).length,
        topGenres: profile.topGenres,
      },
      generatedAt: new Date().toISOString(),
    });
  }

  async getTagCloud() {
    await this.mergeKmasOnSiteAccess();
    return { tags: activeTags() };
  }

  async getAuthorDirectory() {
    await this.mergeKmasOnSiteAccess();
    return this.withKmasImages(getAuthorDirectory());
  }

  async getTitles(query: TitleQuery) {
    const q = validatedSearchQuery(query.q);
    await this.mergeKmasOnSiteAccess();
    const sort = SORTS.includes((query.sort as SortKey) ? (query.sort as SortKey) : "popular")
      ? (query.sort as SortKey)
      : "popular";

    const ids = (query.ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const limit = clampLimit(query.limit);
    const seen = new Set<string>();
    let items: Title[];

    if (ids.length > 0) {
      items = ids
        .map((id) => findTitle(id))
        .filter((title): title is Title => Boolean(title))
        .filter((title) => {
          if (seen.has(title.id)) return false;
          seen.add(title.id);
          return true;
        });
    } else if (q) {
      items = suggest(TITLES, q, limit);
    } else {
      items = sortTitles(TITLES, sort).slice(0, limit);
    }
    await this.enrichResponseTitles(items);

    return this.withKmasImages({
      items,
      meta: {
        total: items.length,
        query: q || null,
        ids,
        sort,
        generatedAt: new Date().toISOString(),
        source: "server-catalog",
      },
    });
  }

  async getTitleDetail(id: string) {
    await this.mergeKmasOnSiteAccess();
    const data = await getTitleDetailFromLib(id);
    if (data?.title) await enrichTitleWithKmas(data.title).catch(() => data.title);
    return this.withKmasImages(data);
  }

  async getTitleReviews(titleId: string) {
    return withDatabaseCapability("catalog.reviews.read", async () => {
      const rows = await db
        .select({
          id: reviews.id,
          userId: reviews.userId,
          rating: reviews.rating,
          text: reviews.text,
          tags: reviews.tags,
          spoiler: reviews.spoiler,
          createdAt: reviews.createdAt,
          author: users.name,
          avatar: users.avatar,
        })
        .from(reviews)
        .innerJoin(users, eq(reviews.userId, users.id))
        .where(eq(reviews.titleId, titleId))
        .orderBy(desc(reviews.createdAt));

      const ids = rows.map((row) => row.id);
      const counts = ids.length
        ? await db
            .select({
              reviewId: reviewLikes.reviewId,
              c: sql<number>`count(*)`.as("c"),
            })
            .from(reviewLikes)
            .where(inArray(reviewLikes.reviewId, ids))
            .groupBy(reviewLikes.reviewId)
        : [];
      const likesById = Object.fromEntries(
        counts.map((row) => [row.reviewId, Number(row.c)]),
      );

      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        author: row.author ?? "익명",
        avatar: row.avatar ?? "#7c5cfc",
        rating: fromDb(row.rating),
        text: row.text,
        tags: row.tags ?? [],
        spoiler: row.spoiler,
        likes: likesById[row.id] ?? 0,
        createdAt: new Date(row.createdAt ?? Date.now()).toISOString(),
      }));
    });
  }

  async getAuthorData(name: string) {
    await this.mergeKmasOnSiteAccess();
    return this.withKmasImages(getAuthorData(name));
  }

  async getKmasBookAndWebtoonData(query: KmasBookAndWebtoonQuery) {
    return getKmasBookAndWebtoonProxyResponse({
      title: query.title,
      isbn: query.isbn,
      listSeCd: query.listSeCd,
      pictrWritrNm: query.pictrWritrNm,
      sntncWritrNm: query.sntncWritrNm,
      pltfomCdNm: query.pltfomCdNm,
      plscmpnIdNm: query.plscmpnIdNm,
      startDate: query.startDate,
      endDate: query.endDate,
      pageNo: numberParam(query.pageNo),
      viewItemCnt: numberParam(query.viewItemCnt),
    });
  }


}

function createQueryReader(query: QueryRecord) {
  return {
    get(name: string) {
      return query[name] ?? null;
    },
  };
}

function findTitle(identifier: string): Title | null {
  return getTitle(identifier) ?? null;
}

function bayes(title: Title) {
  const ratingAvg = Math.max(0, Math.min(5, title.stats.ratingAvg));
  const ratingCount = Math.max(0, title.stats.ratingCount);
  return (4 * 800 + ratingAvg * ratingCount) / (800 + ratingCount);
}


function validatedSearchQuery(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new BadRequestException({
      error: `검색어는 ${MAX_SEARCH_QUERY_LENGTH}자 이하의 문자열이어야 합니다.`,
    });
  }
  return value.trim();
}

function list<T extends string>(raw: string | null | undefined, allowed?: Set<T>): T[] | undefined {
  const values = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as T[];
  const filtered = allowed ? values.filter((value) => allowed.has(value)) : values;
  return filtered.length ? filtered : undefined;
}

function numberParam(raw: string | null | undefined): number | undefined {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolParam(raw: string | null | undefined): boolean {
  return raw === "true";
}


function clampLimit(raw: number | string | undefined) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 24;
  return Math.min(Math.max(Math.floor(parsed), 1), 80);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function recordNumbers(value: unknown): RatingMap {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => [key, Number(raw)] as const)
      .filter(([, raw]) => Number.isFinite(raw))
  );
}

function recordReads(value: unknown): ReadStateMap {
  if (!value || typeof value !== "object") return {};
  const allowed = new Set<ReadState>(["want", "reading", "paused", "done", "dropped"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, ReadState] =>
      allowed.has(entry[1] as ReadState)
    )
  );
}
