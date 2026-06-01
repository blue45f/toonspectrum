import { describe, expect, it } from "vitest";
import {
  getRankingData,
  normalizeRankingParams,
  shouldFetchLiveSignals,
  type LiveRankingFetcher,
} from "../server/ranking-service";
import type { LiveRankingResult } from "../server/live";
import { makeTitle } from "./fixtures";

function query(values: Record<string, string | undefined>) {
  return {
    get(name: string) {
      return values[name] ?? null;
    },
  };
}

const now = () => new Date("2026-06-01T00:00:00.000Z");
const emptyLive = async (): Promise<LiveRankingResult> => ({
  items: [],
  day: "mon",
  fetchedAt: "2026-06-01T00:00:00.000Z",
  ttlSeconds: 600,
  timeoutMs: 3500,
  sources: [],
});

const naverStatusSource = { name: "네이버웹툰" as const, ok: true, fetched: 1, latencyMs: 3, message: "ok" };

function statusFetch(status: "ongoing" | "completed" | "hiatus") {
  return async () => ({
    items: [
      {
        key: "nw-rest",
        title: "휴재 확인 작품",
        status,
        platform: "네이버웹툰" as const,
        reason: "rest",
      },
    ],
    fetchedAt: "2026-06-01T00:00:00.000Z",
    ttlSeconds: 600,
    timeoutMs: 3500,
    sources: [naverStatusSource],
  });
}

describe("ranking service", () => {
  it("쿼리 파라미터를 안전하게 정규화한다", () => {
    const params = normalizeRankingParams(
      query({ axis: "bad", period: "bad", limit: "999", minRating: "9", rising: "true" })
    );

    expect(params.axis).toBe("popular");
    expect(params.period).toBe("weekly");
    expect(params.limit).toBe(100);
    expect(params.minRating).toBe(5);
    expect(params.onlyRising).toBe(true);
  });

  it("실시간 보정 대상 축만 라이브 소스를 사용한다", () => {
    expect(shouldFetchLiveSignals({ axis: "popular", period: "daily", type: "all", platform: "all" })).toBe(true);
    expect(shouldFetchLiveSignals({ axis: "rating", period: "daily", type: "all", platform: "all" })).toBe(false);
    expect(shouldFetchLiveSignals({ axis: "popular", period: "monthly", type: "all", platform: "all" })).toBe(false);
  });

  it("라이브 매칭된 작품에 evidence와 신뢰도 메타를 붙인다", async () => {
    const liveTitle = makeTitle({
      id: "nw-live",
      title: "라이브 작품",
      stats: { views: 10_000 },
      availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    });
    const highViews = makeTitle({
      id: "nw-static",
      title: "정적 강자",
      stats: { views: 500_000_000 },
      availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    });
    const fakeLive = async (): Promise<LiveRankingResult> => ({
      items: [
        {
          key: "nw-live",
          rank: 1,
          title: "라이브 작품",
          author: "작가",
          rating: 4.8,
          platform: "네이버웹툰",
          platformColor: "#00DC64",
          href: "/title/nw-live",
          external: false,
        },
      ],
      day: "mon",
      fetchedAt: "2026-06-01T00:00:00.000Z",
      ttlSeconds: 600,
      timeoutMs: 3500,
      sources: [{ name: "네이버웹툰", ok: true, fetched: 1, latencyMs: 3, message: "ok" }],
    });

    const data = await getRankingData(
      query({ axis: "popular", period: "daily", limit: "2" }),
      { catalog: [highViews, liveTitle], fetchLive: fakeLive, now }
    );

    expect(data.meta.source).toBe("live-api");
    expect(data.meta.live.matched).toBe(1);
    expect(data.meta.reliability.fallbackReason).toBeNull();
    expect(data.items.some((item) => item.evidence?.source === "live")).toBe(true);
  });

  it("라이브 비대상 축은 formula-api와 폴백 이유를 반환한다", async () => {
    const data = await getRankingData(
      query({ axis: "rating", period: "monthly", limit: "1" }),
      { catalog: [makeTitle({ id: "a" })], now }
    );

    expect(data.meta.source).toBe("formula-api");
    expect(data.meta.live.enabled).toBe(false);
    expect(data.meta.reliability.fallbackReason).toContain("실시간 소스 보정 대상이 아니어서");
  });

  it("완결축에서 외부 휴재 신호가 확인된 작품을 제외한다", async () => {
    const staleCompleted = makeTitle({
      id: "nw-rest",
      title: "휴재 확인 작품",
      status: "completed",
      stats: { completionRate: 98, ratingAvg: 4.9, ratingCount: 100_000 },
    });

    const data = await getRankingData(
      query({ axis: "completed", period: "weekly", limit: "5" }),
      {
        catalog: [staleCompleted],
        fetchLive: emptyLive,
        fetchStatus: statusFetch("hiatus"),
        now,
      } as Parameters<typeof getRankingData>[1] & { fetchStatus: ReturnType<typeof statusFetch> }
    );

    expect(data.items).toHaveLength(0);
    expect(data.meta.statusSignals.enabled).toBe(true);
    expect(data.meta.statusSignals.overridden).toBe(1);
  });

  it("상태 필터를 외부 휴재 신호 기준으로 적용한다", async () => {
    const staleCompleted = makeTitle({
      id: "nw-rest",
      title: "휴재 확인 작품",
      status: "completed",
      stats: { views: 50_000_000 },
    });

    const data = await getRankingData(
      query({ axis: "popular", period: "weekly", status: "hiatus", limit: "5" }),
      {
        catalog: [staleCompleted],
        fetchLive: emptyLive,
        fetchStatus: statusFetch("hiatus"),
        now,
      } as Parameters<typeof getRankingData>[1] & { fetchStatus: ReturnType<typeof statusFetch> }
    );

    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.title.id).toBe("nw-rest");
    expect(data.items[0]?.title.status).toBe("hiatus");
  });

  it("refresh=true는 라이브 수집을 강제 동기 갱신 모드로 요청한다", async () => {
    const calls: Array<{
      limit: number;
      options: {
        forceRefresh?: boolean;
        allowStale?: boolean;
      } | undefined;
    }> = [];
    const fixedTime = "2026-06-01T00:00:00.000Z";
    const ttlSeconds = 90;
    const live: LiveRankingFetcher = async (limit, _platformFilter, options) => {
      calls.push({ limit: limit ?? 0, options });
      return {
        items: [],
        day: "sat",
        fetchedAt: fixedTime,
        ttlSeconds,
        timeoutMs: 3500,
        sources: [{ name: "네이버웹툰" as const, ok: true, fetched: 0, latencyMs: 12, message: "test" }],
      };
    };

    const data = await getRankingData(
      query({ axis: "popular", period: "daily", refresh: "true", limit: "5" }),
      {
        catalog: [makeTitle({ id: "nw-live", type: "webtoon", availability: [{ platformId: "naver-webtoon", pricing: "free" }] })],
        fetchLive: live,
        now: () => new Date("2026-06-01T00:00:10.000Z"),
      }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.options?.forceRefresh).toBe(true);
    expect(calls[0]?.options?.allowStale).toBe(false);
    expect(data.meta.live.nextRefreshAt).toBe(new Date(Date.parse(fixedTime) + ttlSeconds * 1000).toISOString());
  });

  it("refresh가 없으면 라이브 수집은 stale 폴백용 옵션을 사용한다", async () => {
    const calls: Array<{
      options: {
        forceRefresh?: boolean;
        allowStale?: boolean;
      } | undefined;
    }> = [];
    const live: LiveRankingFetcher = async (_limit, _platformFilter, options) => {
      calls.push({ options });
      return emptyLive();
    };

    await getRankingData(
      query({ axis: "popular", period: "daily", limit: "5" }),
      {
        catalog: [makeTitle({ id: "nw-live", type: "webtoon", availability: [{ platformId: "naver-webtoon", pricing: "free" }] })],
        fetchLive: live,
      }
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.options?.forceRefresh).toBe(false);
    expect(calls[0]?.options?.allowStale).toBe(true);
  });
});
