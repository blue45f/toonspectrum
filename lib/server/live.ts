import { getTitle } from "./catalog-store";
import type { PlatformId, SerialStatus } from "../types";
import { PLATFORMS } from "../platforms";
import { kstDayOfWeek } from "../utils";

type CacheEntry<T> = { signature: string; fetchedAt: number; expiresAt: number; result: T };

interface LiveFetchOptions {
  forceRefresh?: boolean;
  allowStale?: boolean;
}

type LiveRefreshMode = "off" | "fixed" | "adaptive";

// 서버 전용 — 외부 플랫폼에서 실시간 랭킹/완결 신호를 가져온다.
// 현재는 네이버/카카오가 실사용 상태이며, 리디·레진·봄툰·탑툰·포스타입은 어댑터 슬롯을 선등록합니다.
// 플랫폼별 어댑터만 구현하면 라이브 보정 파이프라인은 동일하게 동작합니다.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const REVALIDATE = parseConfigNumber(process.env.WEBTOON_LIVE_TTL_SECONDS, 120, 30, 1800);
const TIMEOUT_MS = 3500;
const STATUS_FINISHED_PAGE_CAP = 12;
const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const LIVE_CACHE_TTL_MS = REVALIDATE * 1000;
const LIVE_REFRESH_INTERVAL_SECONDS = parseConfigNumber(
  process.env.WEBTOON_LIVE_REFRESH_INTERVAL_SECONDS,
  Math.min(300, Math.max(60, REVALIDATE)),
  30,
  1800
);
const LIVE_REFRESH_MODE = parseRefreshMode(process.env.WEBTOON_LIVE_REFRESH_MODE, "fixed");
const LIVE_REFRESH_BURST_SECONDS = parseConfigNumber(
  process.env.WEBTOON_LIVE_REFRESH_BURST_SECONDS,
  Math.max(30, Math.floor(LIVE_REFRESH_INTERVAL_SECONDS * 0.5)),
  30,
  1800
);
const LIVE_REFRESH_IDLE_SECONDS = parseConfigNumber(
  process.env.WEBTOON_LIVE_REFRESH_IDLE_SECONDS,
  Math.min(900, Math.max(120, LIVE_REFRESH_INTERVAL_SECONDS * 4)),
  30,
  1800
);
const LIVE_REFRESH_DEMAND_WINDOW_SECONDS = parseConfigNumber(
  process.env.WEBTOON_LIVE_REFRESH_DEMAND_WINDOW_SECONDS,
  120,
  30,
  900
);
const LIVE_REFRESH_DEMAND_THRESHOLD = parseConfigNumber(
  process.env.WEBTOON_LIVE_REFRESH_DEMAND_THRESHOLD,
  4,
  1,
  40
);
const SCHEDULE_LIMIT = 30;
const CLAMP_MIN_REFRESH_SECONDS = 30;
const CLAMP_MAX_REFRESH_SECONDS = 1800;

interface LiveSchedulerState {
  mode: LiveRefreshMode;
  running: boolean;
  baseIntervalSeconds: number;
  nextRefreshAt: number | null;
  lastRefreshAt: number | null;
  consecutiveFailures: number;
  demandSignals: number;
}

let _liveRankingScheduler: ReturnType<typeof setTimeout> | null = null;
let liveSchedulerState: LiveSchedulerState = {
  mode: LIVE_REFRESH_MODE,
  running: false,
  baseIntervalSeconds: LIVE_REFRESH_INTERVAL_SECONDS,
  nextRefreshAt: null,
  lastRefreshAt: null,
  consecutiveFailures: 0,
  demandSignals: 0,
};

const liveDemandSignals: number[] = [];
type LiveSourceName = "네이버웹툰" | "카카오웹툰" | "리디" | "레진" | "봄툰" | "탑툰" | "포스타입";

function parseConfigNumber(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseRefreshMode(raw: string | undefined, fallback: LiveRefreshMode): LiveRefreshMode {
  return raw === "off" || raw === "fixed" || raw === "adaptive" ? raw : fallback;
}

function clampRefreshIntervalSeconds(value: number): number {
  return Math.max(CLAMP_MIN_REFRESH_SECONDS, Math.min(CLAMP_MAX_REFRESH_SECONDS, Math.floor(value)));
}

export interface LiveItem {
  key: string;
  rank: number;
  title: string;
  author: string;
  thumbnail?: string;
  rating: number;
  platform: LiveSourceName;
  platformColor: string;
  href: string;
  external: boolean;
}

export interface LiveSourceStatus {
  name: LiveSourceName;
  ok: boolean;
  fetched: number;
  latencyMs: number;
  message: string;
}

interface LiveFetchResult {
  items: LiveItem[];
  status: LiveSourceStatus;
}

export interface LiveRankingResult {
  items: LiveItem[];
  day: string;
  fetchedAt: string;
  ttlSeconds: number;
  timeoutMs: number;
  sources: LiveSourceStatus[];
}

export interface LiveStatusSignal {
  key: string;
  title: string;
  status: SerialStatus;
  platform: LiveSourceName;
  reason: "finish" | "rest" | "weekday";
}

export interface LiveStatusResult {
  items: LiveStatusSignal[];
  fetchedAt: string;
  ttlSeconds: number;
  timeoutMs: number;
  sources: LiveSourceStatus[];
}

let statusCache: CacheEntry<LiveStatusResult> | null = null;
const statusInflight = new Map<string, Promise<LiveStatusResult>>();

let liveRankingCache: CacheEntry<LiveRankingResult> | null = null;
const liveRankingInflight = new Map<string, Promise<LiveRankingResult>>();

interface LiveRankingSource {
  platformId: PlatformId;
  name: LiveSourceName;
  keyPrefix: string;
  color: string;
  enabled: boolean;
  fetchRanking: (day: string, limit: number) => Promise<LiveFetchResult>;
  fetchStatusSignals?: (knownKeys?: Set<string>) => Promise<LiveFetchResult & { statusItems: LiveStatusSignal[] }>;
}

const proxy = (u?: string): string | undefined =>
  u ? `/api/cover?u=${encodeURIComponent(u)}` : undefined;
const names = (arr: unknown): string =>
  Array.isArray(arr)
    ? arr.map((x) => (typeof x === "string" ? x : (x as { name?: string })?.name || "")).filter(Boolean).join(", ")
    : "";

function hrefFor(id: string, ext: string): { href: string; external: boolean } {
  return getTitle(id) ? { href: `/title/${id}`, external: false } : { href: ext, external: true };
}

function sourceStatus(
  name: LiveSourceName,
  startedAt: number,
  ok: boolean,
  fetched: number,
  message: string
): LiveSourceStatus {
  return {
    name,
    ok,
    fetched,
    latencyMs: Math.round(performance.now() - startedAt),
    message,
  };
}

async function fetchNaver(day: string, limit = 10): Promise<LiveFetchResult> {
  const startedAt = performance.now();
  try {
    const r = await fetch(
      `https://comic.naver.com/api/webtoon/titlelist/weekday?week=${day}&order=user`,
      {
        headers: { "User-Agent": UA, Referer: "https://comic.naver.com/" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!r.ok) {
      return {
        items: [],
        status: sourceStatus("네이버웹툰", startedAt, false, 0, `HTTP ${r.status}`),
      };
    }
    const j = (await r.json()) as { titleList?: Array<Record<string, unknown>> };
    const items = (j.titleList ?? []).slice(0, limit).map((t, i) => {
      const id = `nw-${t.titleId}`;
      const { href, external } = hrefFor(id, `https://comic.naver.com/webtoon/list?titleId=${t.titleId}`);
      return {
        key: id,
        rank: i + 1,
        title: String(t.titleName ?? ""),
        author: names(t.writers) || String(t.author ?? ""),
        thumbnail: proxy(t.thumbnailUrl as string),
        rating: Math.round(((Number(t.starScore) || 0) / 2) * 10) / 10,
        platform: "네이버웹툰" as const,
        platformColor: "#00DC64",
        href,
        external,
      };
    });
    return {
      items,
      status: sourceStatus("네이버웹툰", startedAt, items.length > 0, items.length, items.length > 0 ? "ok" : "empty"),
    };
  } catch (error) {
    return {
      items: [],
      status: sourceStatus(
        "네이버웹툰",
        startedAt,
        false,
        0,
        error instanceof Error && error.name === "TimeoutError" ? "timeout" : "fetch failed"
      ),
    };
  }
}

function fetchUnavailableRankingSource(
  name: LiveSourceName,
  message = "수집기 연결 전"
): (day: string, limit: number) => Promise<LiveFetchResult> {
  return async (_day: string, _limit: number) => {
    const startedAt = performance.now();
    return {
      items: [],
      status: sourceStatus(name, startedAt, false, 0, message),
    };
  };
}

async function fetchKakao(day: string, limit = 8): Promise<LiveFetchResult> {
  const startedAt = performance.now();
  try {
    const r = await fetch(
      `https://gateway-kw.kakao.com/section/v2/timetables/days?placement=timetable_${day}`,
      {
        headers: { "User-Agent": UA, Referer: "https://webtoon.kakao.com/", Origin: "https://webtoon.kakao.com" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!r.ok) {
      return {
        items: [],
        status: sourceStatus("카카오웹툰", startedAt, false, 0, `HTTP ${r.status}`),
      };
    }
    const j = (await r.json()) as { data?: Array<{ cardGroups?: Array<{ cards?: Array<{ content?: Record<string, unknown> }> }> }> };
    const cards: Record<string, unknown>[] = [];
    for (const sec of j.data ?? [])
      for (const grp of sec.cardGroups ?? [])
        for (const card of grp.cards ?? []) if (card.content) cards.push(card.content);
    const items = cards.slice(0, limit).map((c, i) => {
      const id = `kw-${c.id}`;
      const img = (c.backgroundImage as string) || (c.featuredCharacterImageA as string);
      const { href, external } = hrefFor(id, `https://webtoon.kakao.com/content/${c.seoId || c.id}/${c.id}`);
      return {
        key: id,
        rank: i + 1,
        title: String(c.title ?? ""),
        author: names(c.authors),
        thumbnail: img ? proxy(img + ".webp") : undefined,
        rating: 0,
        platform: "카카오웹툰" as const,
        platformColor: "#FF3D54",
        href,
        external,
      };
    });
    return {
      items,
      status: sourceStatus("카카오웹툰", startedAt, items.length > 0, items.length, items.length > 0 ? "ok" : "empty"),
    };
  } catch (error) {
    return {
      items: [],
      status: sourceStatus(
        "카카오웹툰",
        startedAt,
        false,
        0,
        error instanceof Error && error.name === "TimeoutError" ? "timeout" : "fetch failed"
      ),
    };
  }
}

function statusSignature(knownKeys?: Set<string>): string {
  if (!knownKeys?.size) return "*";
  return [...knownKeys].sort().join(",");
}

function isCacheFresh<T>(cache: CacheEntry<T> | null, signature: string, now: number): cache is CacheEntry<T> {
  return Boolean(cache && cache.signature === signature && cache.expiresAt > now);
}

function makeCacheEntry<T>(
  signature: string,
  result: T,
  now: number
): { signature: string; fetchedAt: number; expiresAt: number; result: T } {
  return { signature, fetchedAt: now, expiresAt: now + LIVE_CACHE_TTL_MS, result };
}

function resolveLiveRankingSources(platformFilter?: Set<PlatformId> | null): LiveRankingSource[] {
  if (!platformFilter || platformFilter.size === 0) {
    return LIVE_RANKING_SOURCES.filter((source) => source.enabled);
  }

  return LIVE_RANKING_SOURCES.filter((source) => source.enabled && platformFilter.has(source.platformId));
}

function liveRankingSignature(day: string, limit: number, sources: LiveRankingSource[]): string {
  const ids = [...sources].map((source) => source.platformId).sort().join(",");
  return `${day}|${limit}|${ids || "none"}`;
}

function naverStatusFrom(raw: Record<string, unknown>): LiveStatusSignal["status"] {
  if (raw.finish === true) return "completed";
  if (raw.rest === true) return "hiatus";
  return "ongoing";
}

function naverStatusReason(raw: Record<string, unknown>): LiveStatusSignal["reason"] {
  if (raw.finish === true) return "finish";
  if (raw.rest === true) return "rest";
  return "weekday";
}

function addNaverStatusSignals(
  signals: Map<string, LiveStatusSignal>,
  rows: Array<Record<string, unknown>>,
  targetKeys: Set<string> | null
) {
  for (const row of rows) {
    const titleId = row.titleId;
    if (titleId === null || titleId === undefined) continue;
    const key = `nw-${titleId}`;
    if (targetKeys && !targetKeys.has(key)) continue;
    signals.set(key, {
      key,
      title: String(row.titleName ?? ""),
      status: naverStatusFrom(row),
      platform: "네이버웹툰",
      reason: naverStatusReason(row),
    });
  }
}

function targetComplete(signals: Map<string, LiveStatusSignal>, targetKeys: Set<string> | null): boolean {
  return !!targetKeys?.size && [...targetKeys].every((key) => signals.has(key));
}

async function fetchNaverStatusSignals(knownKeys?: Set<string>): Promise<LiveFetchResult & { statusItems: LiveStatusSignal[] }> {
  const startedAt = performance.now();
  const targetKeys = knownKeys?.size ? new Set([...knownKeys].filter((key) => key.startsWith("nw-"))) : null;
  const signals = new Map<string, LiveStatusSignal>();
  let failed = 0;
  let totalRequests = 0;

  if (targetKeys?.size === 0) {
    return {
      items: [],
      statusItems: [],
      status: sourceStatus("네이버웹툰", startedAt, true, 0, "no naver targets"),
    };
  }

  await Promise.all(
    WEEK.map(async (day) => {
      totalRequests += 1;
      try {
        const response = await fetch(
          `https://comic.naver.com/api/webtoon/titlelist/weekday?week=${day}&order=user`,
          {
            headers: { "User-Agent": UA, Referer: "https://comic.naver.com/" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          }
        );
        if (!response.ok) {
          failed += 1;
          return;
        }
        const json = (await response.json()) as { titleList?: Array<Record<string, unknown>> };
        addNaverStatusSignals(signals, json.titleList ?? [], targetKeys);
      } catch {
        failed += 1;
      }
    })
  );

  for (let page = 1; page <= STATUS_FINISHED_PAGE_CAP && !targetComplete(signals, targetKeys); page += 1) {
    totalRequests += 1;
    try {
      const response = await fetch(
        `https://comic.naver.com/api/webtoon/titlelist/finished?order=USER&page=${page}`,
        {
          headers: { "User-Agent": UA, Referer: "https://comic.naver.com/webtoon/finish" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }
      );
      if (!response.ok) {
        failed += 1;
        continue;
      }
      const json = (await response.json()) as {
        titleList?: Array<Record<string, unknown>>;
        pageInfo?: { totalPages?: number };
      };
      addNaverStatusSignals(signals, json.titleList ?? [], targetKeys);
      if (json.pageInfo?.totalPages && page >= json.pageInfo.totalPages) break;
    } catch {
      failed += 1;
    }
  }

  const statusItems = [...signals.values()];
  const ok = failed === 0 || statusItems.length > 0;
  return {
    items: [],
    statusItems,
    status: sourceStatus(
      "네이버웹툰",
      startedAt,
      ok,
      statusItems.length,
      failed > 0 ? `partial (${totalRequests - failed}/${totalRequests})` : "ok"
    ),
  };
}

const LIVE_RANKING_SOURCES: LiveRankingSource[] = [
  {
    platformId: "naver-webtoon",
    name: "네이버웹툰",
    keyPrefix: "nw",
    color: PLATFORMS["naver-webtoon"].color,
    enabled: true,
    fetchRanking: fetchNaver,
    fetchStatusSignals: fetchNaverStatusSignals,
  },
  {
    platformId: "kakao-webtoon",
    name: "카카오웹툰",
    keyPrefix: "kw",
    color: PLATFORMS["kakao-webtoon"].color,
    enabled: true,
    fetchRanking: fetchKakao,
  },
  {
    platformId: "ridi",
    name: "리디",
    keyPrefix: "rd",
    color: PLATFORMS["ridi"].color,
    enabled: false,
    fetchRanking: fetchUnavailableRankingSource("리디"),
  },
  {
    platformId: "lezhin",
    name: "레진",
    keyPrefix: "lz",
    color: PLATFORMS["lezhin"].color,
    enabled: false,
    fetchRanking: fetchUnavailableRankingSource("레진"),
  },
  {
    platformId: "bomtoon",
    name: "봄툰",
    keyPrefix: "bm",
    color: PLATFORMS["bomtoon"].color,
    enabled: false,
    fetchRanking: fetchUnavailableRankingSource("봄툰"),
  },
  {
    platformId: "toptoon",
    name: "탑툰",
    keyPrefix: "tt",
    color: PLATFORMS["toptoon"].color,
    enabled: false,
    fetchRanking: fetchUnavailableRankingSource("탑툰"),
  },
  {
    platformId: "postype",
    name: "포스타입",
    keyPrefix: "pt",
    color: PLATFORMS["postype"].color,
    enabled: false,
    fetchRanking: fetchUnavailableRankingSource("포스타입"),
  },
];

export function getLiveRankingPlatforms(): Set<PlatformId> {
  return new Set(
    LIVE_RANKING_SOURCES.filter((source) => source.enabled).map((source) => source.platformId)
  );
}

export function getLiveStatusPlatforms(): Set<PlatformId> {
  return new Set(
    LIVE_RANKING_SOURCES.filter((source) => source.enabled && source.fetchStatusSignals).map(
      (source) => source.platformId
    )
  );
}

function pruneDemandSignals(now: number): void {
  const cutoff = now - LIVE_REFRESH_DEMAND_WINDOW_SECONDS * 1000;
  while (liveDemandSignals.length && liveDemandSignals[0] < cutoff) {
    liveDemandSignals.shift();
  }
  liveSchedulerState.demandSignals = liveDemandSignals.length;
}

function shouldUseAggressiveRefresh(now: number): boolean {
  pruneDemandSignals(now);
  return liveDemandSignals.length >= LIVE_REFRESH_DEMAND_THRESHOLD;
}

function hasRecentDemand(now: number): boolean {
  pruneDemandSignals(now);
  return liveDemandSignals.length > 0;
}

function calculateRefreshDelaySeconds(now: number): number {
  if (liveSchedulerState.mode === "off") return LIVE_REFRESH_IDLE_SECONDS;
  if (liveSchedulerState.mode === "adaptive") {
    if (shouldUseAggressiveRefresh(now)) {
      return clampRefreshIntervalSeconds(LIVE_REFRESH_BURST_SECONDS);
    }
    if (!hasRecentDemand(now)) {
      return clampRefreshIntervalSeconds(LIVE_REFRESH_IDLE_SECONDS);
    }
  }

  if (liveSchedulerState.consecutiveFailures > 0) {
    const base = clampRefreshIntervalSeconds(liveSchedulerState.baseIntervalSeconds);
    const factor = Math.min(5, liveSchedulerState.consecutiveFailures);
    return clampRefreshIntervalSeconds(base * (1 << factor));
  }

  return clampRefreshIntervalSeconds(liveSchedulerState.baseIntervalSeconds);
}

function scheduleNextLiveRefresh(limit: number): void {
  if (!liveSchedulerState.running) return;

  const delayMs = calculateRefreshDelaySeconds(Date.now()) * 1000;
  liveSchedulerState.nextRefreshAt = Date.now() + delayMs;
  _liveRankingScheduler = globalThis.setTimeout(async () => {
    _liveRankingScheduler = null;
    try {
      await getLiveRanking(limit, null, { forceRefresh: true });
      liveSchedulerState.consecutiveFailures = 0;
    } catch {
      liveSchedulerState.consecutiveFailures += 1;
    } finally {
      liveSchedulerState.lastRefreshAt = Date.now();
      scheduleNextLiveRefresh(limit);
    }
  }, delayMs);
}

export function markLiveRankingDemand(): void {
  const now = Date.now();
  liveDemandSignals.push(now);
  pruneDemandSignals(now);
}

export function getLiveRefreshState() {
  return {
    mode: liveSchedulerState.mode,
    running: liveSchedulerState.running,
    baseIntervalSeconds: liveSchedulerState.baseIntervalSeconds,
    nextRefreshAt: liveSchedulerState.nextRefreshAt ? new Date(liveSchedulerState.nextRefreshAt).toISOString() : null,
    lastRefreshAt: liveSchedulerState.lastRefreshAt ? new Date(liveSchedulerState.lastRefreshAt).toISOString() : null,
    nextRefreshInSeconds: liveSchedulerState.nextRefreshAt ? Math.max(0, Math.round((liveSchedulerState.nextRefreshAt - Date.now()) / 1000)) : null,
    consecutiveFailures: liveSchedulerState.consecutiveFailures,
    demandSignals: liveSchedulerState.demandSignals,
  };
}

export function startLiveRankingScheduler(
  limit = SCHEDULE_LIMIT,
  intervalSeconds = LIVE_REFRESH_INTERVAL_SECONDS
): void {
  if (liveSchedulerState.running) return;
  liveSchedulerState = {
    ...liveSchedulerState,
    mode: LIVE_REFRESH_MODE,
    baseIntervalSeconds: clampRefreshIntervalSeconds(intervalSeconds),
    running: true,
  };

  if (liveSchedulerState.mode === "off") {
    liveSchedulerState.running = false;
    return;
  }

  void getLiveRanking(limit, null, { forceRefresh: true }).catch(() => {});
  scheduleNextLiveRefresh(limit);
}

// 실시간 인기 — 등록된 활성 소스의 오늘자 인기 순서를 병합
export async function getLiveRanking(
  limit = 12,
  platformFilter?: Set<PlatformId> | null,
  options: LiveFetchOptions = {}
): Promise<LiveRankingResult> {
  const day = WEEK[kstDayOfWeek()]; // KST 기준 요일 (소스가 KST로 요일별 랭킹 제공)
  const activeSources = resolveLiveRankingSources(platformFilter);
  const signature = liveRankingSignature(day, limit, activeSources);
  const now = Date.now();
  const { allowStale = false, forceRefresh = false } = options;

  if (!forceRefresh && isCacheFresh(liveRankingCache, signature, now)) {
    return liveRankingCache.result;
  }

  if (!forceRefresh && allowStale && liveRankingCache && liveRankingCache.signature === signature) {
    if (!liveRankingInflight.has(signature)) {
      void getLiveRanking(limit, platformFilter, { ...options, forceRefresh: true });
    }
    return liveRankingCache.result;
  }

  const inFlight = liveRankingInflight.get(signature);
  if (inFlight) return inFlight;

  const request = (async () => {
    const sourceResults = await (async () => {
      if (!activeSources.length) {
        return [
          {
            items: [],
            status: {
              name: "네이버웹툰" as const,
              ok: true,
              fetched: 0,
              latencyMs: 0,
              message: "no active sources",
            },
          },
        ];
      }
      return Promise.all(activeSources.map((source) => source.fetchRanking(day, limit)));
    })();

    const merged: LiveItem[] = [];
    const max = Math.max(...sourceResults.map((result) => result.items.length), 0);
    for (let i = 0; i < max && merged.length < limit; i += 1) {
      for (const result of sourceResults) {
        if (!result.items[i]) continue;
        merged.push(result.items[i]);
        if (merged.length >= limit) break;
      }
    }

    const result: LiveRankingResult = {
      items: merged.map((it, i) => ({ ...it, rank: i + 1 })),
      day,
      fetchedAt: new Date().toISOString(),
      ttlSeconds: REVALIDATE,
      timeoutMs: TIMEOUT_MS,
      sources: sourceResults.map((result) => result.status),
    };
    liveRankingCache = makeCacheEntry(signature, result, now);
    return result;
  })();

  liveRankingInflight.set(signature, request);
  try {
    return await request;
  } finally {
    liveRankingInflight.delete(signature);
  }
}

export async function getLiveStatusSignals(knownKeys?: Set<string>): Promise<LiveStatusResult> {
  const signature = statusSignature(knownKeys);
  const now = Date.now();
  if (isCacheFresh(statusCache, signature, now)) return statusCache.result;

  const inFlight = statusInflight.get(signature);
  if (inFlight) return inFlight;

  const request = (async () => {
    const statusSources = LIVE_RANKING_SOURCES.filter((source) => source.enabled && source.fetchStatusSignals);
    if (!statusSources.length) {
      const result = {
        items: [],
        fetchedAt: new Date().toISOString(),
        ttlSeconds: REVALIDATE,
        timeoutMs: TIMEOUT_MS,
        sources: [],
      };
      statusCache = makeCacheEntry(signature, result, now);
      return result;
    }

    const fetchedStatuses = await Promise.all(
      statusSources.map((source) => source.fetchStatusSignals!(knownKeys).then((result) => result))
    );
    const deduped = new Map<string, LiveStatusSignal>();
    for (const fetched of fetchedStatuses) {
      for (const signal of fetched.statusItems) {
        if (!deduped.has(signal.key)) {
          deduped.set(signal.key, signal);
        }
      }
    }

    const result: LiveStatusResult = {
      items: [...deduped.values()],
      fetchedAt: new Date().toISOString(),
      ttlSeconds: REVALIDATE,
      timeoutMs: TIMEOUT_MS,
      sources: fetchedStatuses.map((fetched) => fetched.status),
    };
    statusCache = makeCacheEntry(signature, result, now);
    return result;
  })();

  statusInflight.set(signature, request);
  try {
    return await request;
  } finally {
    statusInflight.delete(signature);
  }
}
