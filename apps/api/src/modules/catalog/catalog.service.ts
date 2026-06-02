import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { activeTags, getCatalogState, getTitle, TITLES } from "../../../../../lib/data";
import { db, reviewLikes, reviews, users } from "../../../../../lib/db";
import { fromDb } from "../../../../../lib/api-helpers";
import { buildTasteProfile, recommendForTaste, similarTitles } from "../../../../../lib/recommend";
import { searchTitles, sortTitles, suggest, type SearchFilters, type SortKey } from "../../../../../lib/search";
import { getAuthorData } from "../../../../../lib/server/author";
import { getCalendarData } from "../../../../../lib/server/calendar";
import { getCatalogIngestStatus, loadLatestCatalogSnapshotFromDb, normalizeCatalogIngestConfig, runCatalogIngest, type CatalogIngestRunResult } from "../../../../../lib/server/catalog-ingest";
import { getExploreData } from "../../../../../lib/server/explore";
import { getHomeData } from "../../../../../lib/server/home";
import { getInsightsData } from "../../../../../lib/server/insights";
import { startLiveRankingScheduler } from "../../../../../lib/server/live";
import { getRankingData, getRankingHealth } from "../../../../../lib/server/ranking-service";
import { getTitleDetail as getTitleDetailFromLib } from "../../../../../lib/server/title";
import type { AgeRating, PlatformId, ReadState, SerialStatus, Title, WorkType } from "../../../../../lib/types";

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

interface IngestRunPayload {
  token?: unknown;
  requestedBy?: unknown;
  force?: unknown;
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
  private readonly ingestConfig = normalizeCatalogIngestConfig();
  private ingestInProgress: Promise<CatalogIngestRunResult> | null = null;
  private ingestTimer: ReturnType<typeof setTimeout> | null = null;
  private nextCatalogIngestAt: number | null = null;
  private consecutiveIngestFailures = 0;

  async onModuleInit() {
    try {
      await loadLatestCatalogSnapshotFromDb();
    } catch (error) {
      console.error("catalog snapshot load failed; runtime catalog is empty until the next successful DB snapshot", error);
    }
    startLiveRankingScheduler();
    this.scheduleNextCatalogIngest();
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
      webtoon: items.filter((title) => title.type === "webtoon").length,
      webnovel: items.filter((title) => title.type === "webnovel").length,
    };

    return {
      items,
      total: items.length,
      typeCount,
      catalog: {
        ...getCatalogState(),
        platformCoverage: platformCoverage(TITLES),
        filteredPlatformCoverage: platformCoverage(items),
      },
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

    const ids = rows.map((row) => row.id);
    const counts = ids.length
      ? await db
          .select({ reviewId: reviewLikes.reviewId, c: sql<number>`count(*)`.as("c") })
          .from(reviewLikes)
          .where(inArray(reviewLikes.reviewId, ids))
          .groupBy(reviewLikes.reviewId)
      : [];
    const likesById = Object.fromEntries(counts.map((row) => [row.reviewId, Number(row.c)]));

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
  }

  async getAuthorData(name: string) {
    return getAuthorData(name);
  }

  async getCatalogIngestStatus() {
    const status = await getCatalogIngestStatus(this.ingestConfig);
    return {
      ...status,
      scheduler: {
        running: this.ingestConfig.mode === "fixed",
        inProgress: Boolean(this.ingestInProgress),
        nextRunAt: this.nextCatalogIngestAt ? new Date(this.nextCatalogIngestAt).toISOString() : null,
        nextRunInSeconds: this.nextCatalogIngestAt
          ? Math.max(0, Math.round((this.nextCatalogIngestAt - Date.now()) / 1000))
          : null,
        consecutiveFailures: this.consecutiveIngestFailures,
      },
    };
  }

  async runCatalogIngest(payload: IngestRunPayload, headerToken?: string) {
    this.assertIngestAuthorized(payload, headerToken);
    return this.runCatalogIngestOnce({
      requestedBy: typeof payload.requestedBy === "string" ? payload.requestedBy : "manual",
      triggeredBy: "manual",
      force: boolValue(payload.force),
    });
  }

  private assertIngestAuthorized(payload: IngestRunPayload, headerToken?: string) {
    if (!this.ingestConfig.triggerToken) {
      throw new UnauthorizedException("catalog ingest token is not configured");
    }
    const bodyToken = typeof payload.token === "string" ? payload.token : "";
    if (bodyToken !== this.ingestConfig.triggerToken && headerToken !== this.ingestConfig.triggerToken) {
      throw new UnauthorizedException("invalid catalog ingest token");
    }
  }

  private async runCatalogIngestOnce(options: { requestedBy: string; triggeredBy: string; force?: boolean }) {
    if (this.ingestInProgress) throw new ConflictException("catalog ingest is already running");

    const job = runCatalogIngest({ ...options, config: this.ingestConfig })
      .then((result) => {
        this.consecutiveIngestFailures = 0;
        return result;
      })
      .catch((error) => {
        this.consecutiveIngestFailures += 1;
        throw new BadRequestException(error instanceof Error ? error.message : "catalog ingest failed");
      })
      .finally(() => {
        this.ingestInProgress = null;
      });

    this.ingestInProgress = job;
    return job;
  }

  private scheduleNextCatalogIngest() {
    if (this.ingestConfig.mode !== "fixed") return;
    if (this.ingestTimer) clearTimeout(this.ingestTimer);

    const backoff = this.consecutiveIngestFailures ? Math.min(6, 2 ** this.consecutiveIngestFailures) : 1;
    const delayMs = this.ingestConfig.intervalSeconds * 1000 * backoff;
    this.nextCatalogIngestAt = Date.now() + delayMs;
    this.ingestTimer = setTimeout(() => {
      this.ingestTimer = null;
      this.nextCatalogIngestAt = null;
      if (this.ingestInProgress) {
        this.scheduleNextCatalogIngest();
        return;
      }
      void this.runCatalogIngestOnce({ requestedBy: "scheduler", triggeredBy: "scheduler" })
        .catch(() => undefined)
        .finally(() => this.scheduleNextCatalogIngest());
    }, delayMs);
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
  return (4 * 800 + title.stats.ratingAvg * title.stats.ratingCount) / (800 + title.stats.ratingCount);
}

function platformCoverage(titles: Title[]) {
  const counts = new Map<PlatformId, number>();
  for (const title of titles) {
    const ids = new Set(title.availability.map((entry) => entry.platformId));
    ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      count,
      share: titles.length ? Math.round((count / titles.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
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

function boolValue(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw === 1;
  if (typeof raw === "string") return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
  return false;
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
    )
  );
}
