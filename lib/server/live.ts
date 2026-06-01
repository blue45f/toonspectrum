// 서버 전용 — 네이버/카카오에서 런타임에 실시간 인기 랭킹을 가져온다.
// 외부 소스 보호를 위해 fetch 레벨에서 짧은 revalidate를 두고, 상위 API는 no-store로 현재 상태를 매 요청 공개한다.
import { getTitle } from "../data";
import type { SerialStatus } from "../types";
import { kstDayOfWeek } from "../utils";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const REVALIDATE = 600; // 10분 (최대한 실시간성 유지 + 캐시로 소스 보호)
const TIMEOUT_MS = 3500;
const STATUS_FINISHED_PAGE_CAP = 12;
const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
type LiveSourceName = "네이버웹툰" | "카카오웹툰";

export interface LiveItem {
  key: string;
  rank: number;
  title: string;
  author: string;
  thumbnail?: string;
  rating: number;
  platform: "네이버웹툰" | "카카오웹툰";
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
  platform: "네이버웹툰";
  reason: "finish" | "rest" | "weekday";
}

export interface LiveStatusResult {
  items: LiveStatusSignal[];
  fetchedAt: string;
  ttlSeconds: number;
  timeoutMs: number;
  sources: LiveSourceStatus[];
}

let statusCache:
  | {
      signature: string;
      expiresAt: number;
      result: LiveStatusResult;
    }
  | null = null;

const proxy = (u?: string) => (u ? `/api/cover?u=${encodeURIComponent(u)}` : undefined);
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

async function fetchNaver(day: string): Promise<LiveFetchResult> {
  const startedAt = performance.now();
  try {
    const r = await fetch(
      `https://comic.naver.com/api/webtoon/titlelist/weekday?week=${day}&order=user`,
      {
        headers: { "User-Agent": UA, Referer: "https://comic.naver.com/" },
        next: { revalidate: REVALIDATE },
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
    const items = (j.titleList ?? []).slice(0, 10).map((t, i) => {
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

async function fetchKakao(day: string): Promise<LiveFetchResult> {
  const startedAt = performance.now();
  try {
    const r = await fetch(
      `https://gateway-kw.kakao.com/section/v2/timetables/days?placement=timetable_${day}`,
      {
        headers: { "User-Agent": UA, Referer: "https://webtoon.kakao.com/", Origin: "https://webtoon.kakao.com" },
        next: { revalidate: REVALIDATE },
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
    const items = cards.slice(0, 8).map((c, i) => {
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
  return [...knownKeys].filter((key) => key.startsWith("nw-")).sort().join(",");
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
            next: { revalidate: REVALIDATE },
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
          next: { revalidate: REVALIDATE },
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

// 실시간 인기 — 네이버 + 카카오 오늘자 인기 순서를 교차 병합
export async function getLiveRanking(limit = 12): Promise<LiveRankingResult> {
  const day = WEEK[kstDayOfWeek()]; // KST 기준 요일 (소스가 KST로 요일별 랭킹 제공)
  const [naver, kakao] = await Promise.all([fetchNaver(day), fetchKakao(day)]);
  const merged: LiveItem[] = [];
  const max = Math.max(naver.items.length, kakao.items.length);
  for (let i = 0; i < max && merged.length < limit; i++) {
    if (naver.items[i]) merged.push(naver.items[i]);
    if (kakao.items[i] && merged.length < limit) merged.push(kakao.items[i]);
  }
  return {
    items: merged.map((it, i) => ({ ...it, rank: i + 1 })),
    day,
    fetchedAt: new Date().toISOString(),
    ttlSeconds: REVALIDATE,
    timeoutMs: TIMEOUT_MS,
    sources: [naver.status, kakao.status],
  };
}

export async function getLiveStatusSignals(knownKeys?: Set<string>): Promise<LiveStatusResult> {
  const signature = statusSignature(knownKeys);
  const now = Date.now();
  if (statusCache && statusCache.signature === signature && statusCache.expiresAt > now) {
    return statusCache.result;
  }

  const naver = await fetchNaverStatusSignals(knownKeys);
  const result = {
    items: naver.statusItems,
    fetchedAt: new Date().toISOString(),
    ttlSeconds: REVALIDATE,
    timeoutMs: TIMEOUT_MS,
    sources: [naver.status],
  };
  statusCache = {
    signature,
    expiresAt: now + REVALIDATE * 1000,
    result,
  };
  return result;
}
