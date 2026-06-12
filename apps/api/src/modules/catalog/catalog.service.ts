import "reflect-metadata";
import {
  BadGatewayException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { activeTags, getAuthorDirectory, getCatalogState, getTitle, TITLES } from "../../../../../lib/server/catalog-store";
import { db, reviewLikes, reviews, users } from "../../../../../lib/db";
import { fromDb } from "../../../../../lib/api-helpers";
import { buildTasteProfile, recommendForTaste, similarTitles } from "../../../../../lib/recommend";
import { searchTitles, sortTitles, suggest, type SearchFilters, type SortKey } from "../../../../../lib/search";
import { isAdminUser } from "../../../../../lib/server/app-config";
import { getAuthorData } from "../../../../../lib/server/author";
import { getCalendarData } from "../../../../../lib/server/calendar";
import { getCatalogIngestStatus, isCatalogForceDb, loadLatestCatalogSnapshotFromDb, loadLatestCatalogSnapshotFromFile, normalizeCatalogIngestConfig, refreshCatalogIfChanged, runCatalogIngest, verifyCatalogIngestToken, type CatalogIngestRunResult } from "../../../../../lib/server/catalog-ingest";
import { rateLimit } from "../../../../../lib/rate-limit";
import { getExploreData } from "../../../../../lib/server/explore";
import { getHomeData } from "../../../../../lib/server/home";
import { getInsightsData } from "../../../../../lib/server/insights";
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
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  async onModuleInit() {
    try {
      // 카탈로그는 파일 전용: 번들/지정 gz(apps/api/data/catalog.json.gz 또는 WEBDEX_CATALOG_FILE) →
      // 없으면 빈 카탈로그. DB catalog_snapshot 읽기는 WEBDEX_CATALOG_FORCE_DB=1 레거시 모드에서만.
      if (isCatalogForceDb()) {
        await loadLatestCatalogSnapshotFromDb();
      } else {
        const result = loadLatestCatalogSnapshotFromFile();
        if (result.loaded) {
          console.log(`catalog loaded from file (${result.titleCount} titles) — DB 전송 0`);
        } else {
          console.warn("catalog file missing; starting empty (pnpm ingest 또는 WEBDEX_CATALOG_FILE 확인)");
        }
      }
    } catch (error) {
      console.error("catalog load failed; runtime catalog is empty until a successful load", error);
    }
    // 실시간(live) 랭킹 제거 — 스냅샷 기반 운영. 스케줄러 미가동(naver 실시간 페치 없음).
    this.scheduleNextCatalogIngest();
    // 갱신 감지 폴링: 파일 모드는 mtime/size 스탯 비교(무비용)라 항상 켠다.
    // 레거시 FORCE_DB 모드에서만 기존 DB 해시 폴링이 동작한다(refreshCatalogIfChanged 내부 분기).
    this.startCatalogRefreshPoll();
  }

  // 무중단 핫 리로드 폴링: 외부 프로세스(CLI/cron/다른 인스턴스)가 새 카탈로그를 적재하면
  // 재시작 없이 메모리 카탈로그를 갱신한다. 파일 모드는 스탯 폴링, 레거시 DB 모드는 id 폴링.
  private startCatalogRefreshPoll() {
    const seconds = this.ingestConfig.refreshPollSeconds;
    if (!seconds) return; // 0 = 비활성
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      if (this.ingestInProgress) return; // ingest 중엔 건너뜀(곧 in-process 갱신됨)
      void refreshCatalogIfChanged()
        .then((r) => {
          if (r.reloaded) {
            console.log(`catalog hot-reloaded: snapshot=${r.snapshotId} titles=${r.titleCount}`);
          }
        })
        .catch((error) => console.error("catalog refresh poll failed", error));
    }, seconds * 1000);
    if (typeof this.refreshTimer.unref === "function") this.refreshTimer.unref();
  }

  // 강제 리로드(엔드포인트용) — 변경 없으면 reloaded:false. 토큰 설정 시 일치 필요(reload는 read-only).
  async refreshCatalog(headerToken?: string, clientKey = "unknown") {
    this.assertIngestRateLimit("refresh", clientKey, 10);
    if (this.ingestConfig.triggerToken) {
      if (verifyCatalogIngestToken(this.ingestConfig.triggerToken, headerToken) !== "ok") {
        throw new UnauthorizedException("invalid catalog ingest token");
      }
    }
    return refreshCatalogIfChanged();
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
    return getRankingData(createQueryReader(query), { disableLive: true });
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

  async getTagCloud() {
    return { tags: activeTags() };
  }

  async getAuthorDirectory() {
    return getAuthorDirectory();
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
    try {
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
    } catch {
      // 리뷰 DB(Neon) 불가(쿼터/장애) 시 빈 목록 폴백 — 상세 페이지/리뷰 탭이 깨지지 않게.
      return [];
    }
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

  async runCatalogIngest(payload: IngestRunPayload, headerToken?: string, userId?: string, clientKey = "unknown") {
    // 연타·토큰 무차별 대입 방지 — 인증 검사보다 먼저 적용해 실패 시도도 카운트한다.
    this.assertIngestRateLimit("run", clientKey, 5);
    await this.assertIngestAuthorized(payload, headerToken, userId);
    return this.runCatalogIngestOnce({
      requestedBy: typeof payload.requestedBy === "string" ? payload.requestedBy : "manual",
      triggeredBy: "manual",
      force: boolValue(payload.force),
    });
  }

  // 인메모리 슬라이딩 윈도(1분) — lib/rate-limit 재사용. 한도 초과 시 429.
  private assertIngestRateLimit(scope: string, clientKey: string, limit: number) {
    if (!rateLimit(`catalog-ingest:${scope}:${clientKey}`, limit, 60_000)) {
      throw new HttpException("too many catalog ingest requests; retry later", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async assertIngestAuthorized(payload: IngestRunPayload, headerToken?: string, userId?: string) {
    // 관리자(서명 세션이 검증된 x-user-id)는 ingest 토큰 없이도 수동 크롤을 트리거할 수 있다.
    if (userId && (await isAdminUser(userId))) return;

    // 토큰 인증 경로(cron·비관리자 호출). 비교는 타이밍 세이프, 토큰 미설정 시 토큰 인증은 사용할 수 없다.
    const verdict = verifyCatalogIngestToken(
      this.ingestConfig.triggerToken,
      typeof payload.token === "string" ? payload.token : "",
      headerToken
    );
    if (verdict === "not-configured") {
      throw new UnauthorizedException("catalog ingest token is not configured");
    }
    if (verdict !== "ok") {
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
        // 크롤/적재 실패는 클라이언트 요청 문제(4xx)가 아니라 업스트림 수집 실패 → 502.
        throw new BadGatewayException(error instanceof Error ? error.message : "catalog ingest failed");
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
  const ratingAvg = Math.max(0, Math.min(5, title.stats.ratingAvg));
  const ratingCount = Math.max(0, title.stats.ratingCount);
  return (4 * 800 + ratingAvg * ratingCount) / (800 + ratingCount);
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
