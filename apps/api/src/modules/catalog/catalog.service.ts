import { Injectable } from "@nestjs/common";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, reviewLikes, reviews, users } from "../../../../../lib/db";
import { TITLES, getTitle, activeTags } from "../../../../../lib/data";
import { buildTasteProfile, recommendForTaste, similarTitles } from "../../../../../lib/recommend";
import { getHomeData } from "../../../../../lib/server/home";
import { getCalendarData } from "../../../../../lib/server/calendar";
import { getInsightsData } from "../../../../../lib/server/insights";
import { getExploreData } from "../../../../../lib/server/explore";
import { startLiveRankingScheduler } from "../../../../../lib/server/live";
import { getRankingData, getRankingHealth } from "../../../../../lib/server/ranking-service";
import { getAuthorData } from "../../../../../lib/server/author";
import { searchTitles, sortTitles, suggest, type SearchFilters, type SortKey } from "../../../../../lib/search";
import { getTitleDetail as getTitleDetailFromLib } from "../../../../../lib/server/title";
import type { AgeRating, PlatformId, ReadState, SerialStatus, WorkType, Title } from "../../../../../lib/types";
import { fromDb } from "../../../../../lib/api-helpers";

type QueryRecord = Record<string, string>;

interface TitleQuery {
  ids?: string;
  q?: string;
  limit?: number | string;
  sort?: string;
}

interface SearchRouteQuery {
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
export class CatalogService {
  constructor() {
    startLiveRankingScheduler();
  }

  async getHomeData() {
    return getHomeData();
  }

  async getCalendarData() {
    return getCalendarData();
  }

  async getInsightsData() {
    return getInsightsData();
  }

  async getRankingData(query: QueryRecord) {
    return getRankingData(createQueryReader(query));
  }

  async getRankingHealth() {
    return getRankingHealth();
  }

  async getExploreData(query: QueryRecord) {
    return getExploreData(query);
  }

  async getSearchData(query: SearchRouteQuery) {
    const sort = validSorts.has(query.sort as SortKey) ? (query.sort as SortKey) : "popular";
    const filters: SearchFilters = {
      q: query.q ?? "",
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
    const items = searchTitles(TITLES, filters, sort);
    const typeCount = {
      webtoon: items.filter((t) => t.type === "webtoon").length,
      webnovel: items.filter((t) => t.type === "webnovel").length,
    };

    return {
      items,
      total: items.length,
      typeCount,
      topTags: activeTags().slice(0, 18).map((tag) => tag.tag),
      generatedAt: new Date().toISOString(),
    };
  }

  async getRecommendData(payload: RecommendPayload) {
    const body = (payload ?? {}) as Record<string, unknown>;
    const picked = stringList(body.picked);
    const seedId = typeof body.seedId === "string" ? body.seedId : null;
    const ratings = recordNumbers(body.ratings);
    const reads = recordReads(body.reads);

    const seen = new Set([...Object.keys(ratings), ...Object.keys(reads)]);
    const profile = buildTasteProfile(TITLES, ratings, reads);
    const genres = picked.length ? picked : profile.topGenres.slice(0, 3).map((g) => g.name);
    const byId = new Map(TITLES.map((t) => [t.id, t]));
    const reading = Object.entries(reads)
      .filter(([, state]) => state === "reading" || state === "want")
      .map(([id]) => byId.get(id))
      .filter((title): title is Title => Boolean(title));

    const pickedRecs = genres.length
      ? TITLES.filter((t) => t.genres.some((g) => genres.includes(g)) && !seen.has(t.id))
          .sort((a, b) => bayes(b) - bayes(a))
          .slice(0, 15)
      : TITLES.filter((t) => t.featured).slice(0, 12);

    const tasteRecs = recommendForTaste(TITLES, profile, seen, 12);
    const popular = [...TITLES].sort((a, b) => b.stats.views - a.stats.views).slice(0, 12);
    const seed = (seedId && getTitle(seedId)) || popular[0] || null;
    const similar = seed ? similarTitles(TITLES, seed, 12) : [];

    return {
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
    };
  }

  async getTitles(query: TitleQuery) {
    const sort = SORTS.includes((query.sort as SortKey) ? (query.sort as SortKey) : "popular")
      ? (query.sort as SortKey)
      : "popular";

    const ids = (query.ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const q = (query.q ?? "").trim();
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

    return {
      items,
      meta: {
        total: items.length,
        query: q || null,
        ids,
        sort,
        generatedAt: new Date().toISOString(),
        source: "server-catalog",
      },
    };
  }

  async getTitleDetail(id: string) {
    return getTitleDetailFromLib(id);
  }

  async getTitleReviews(titleId: string) {
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

    const ids = rows.map((r) => r.id);
    const counts = ids.length
      ? await db
          .select({ reviewId: reviewLikes.reviewId, c: sql<number>`count(*)`.as("c") })
          .from(reviewLikes)
          .where(inArray(reviewLikes.reviewId, ids))
          .groupBy(reviewLikes.reviewId)
      : [];
    const likesById = Object.fromEntries(counts.map((r) => [r.reviewId, Number(r.c)]));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      author: r.author ?? "익명",
      avatar: r.avatar ?? "#7c5cfc",
      rating: fromDb(r.rating),
      text: r.text,
      tags: r.tags ?? [],
      spoiler: r.spoiler,
      likes: likesById[r.id] ?? 0,
      createdAt: new Date(r.createdAt ?? Date.now()).toISOString(),
    }));
  }

  async getAuthorData(name: string) {
    return getAuthorData(name);
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

function bayes(t: Title) {
  return (4 * 800 + t.stats.ratingAvg * t.stats.ratingCount) / (800 + t.stats.ratingCount);
}

function list<T extends string>(raw: string | null | undefined, allowed?: Set<T>): T[] | undefined {
  const values = (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean) as T[];
  const filtered = allowed ? values.filter((v) => allowed.has(v)) : values;
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
  const allowed = new Set<ReadState>(["want", "reading", "done", "dropped"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, ReadState] =>
      allowed.has(entry[1] as ReadState)
  ));
}
