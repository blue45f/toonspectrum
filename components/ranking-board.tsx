"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "@/src/compat/router-link";
import {
  RANK_AXES,
  PERIODS,
  axisMeta,
  type RankedTitle,
  type RankAxis,
  type RankPeriod,
} from "@/lib/ranking";
import type { WorkType, Title, PlatformId, Pricing, SerialStatus } from "@/lib/types";
import { GENRES } from "@/lib/taxonomy";
import { genreColor, genreTint, spectrumGradient } from "@/lib/genre-color";
import { RankRow, MiniPoster } from "./rank-row";
import { TitleCard } from "./title-card";
import { PlatformTags } from "./availability";
import { RatingInline } from "./ui/stars";
import { Segmented } from "./ui/segmented";
import { statsAreEstimated } from "@/lib/estimate";
import { cn, formatCount } from "@/lib/utils";
import {
  AlertCircle,
  BookOpen,
  Flag,
  Flame,
  FunctionSquare,
  Gem,
  Grid2X2,
  Heart,
  LayoutGrid,
  LayoutList,
  Radio,
  RefreshCw,
  Rows3,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  Star,
  TrendingUp,
  Waves,
} from "lucide-react";

type View = "list" | "poster" | "compact";
type LoadState = "loading" | "ready" | "refreshing" | "error";

interface RankingMeta {
  generatedAt: string;
  refreshSeconds: number;
  total: number;
  source: "live-api" | "formula-api";
  live: {
    enabled: boolean;
    day: string | null;
    fetchedAt: string | null;
    nextRefreshAt: string | null;
    ttlSeconds: number | null;
    timeoutMs: number | null;
    fetched: number;
    matched: number;
    sources: string[];
    sourceStatuses: {
      name: string;
      ok: boolean;
      fetched: number;
      latencyMs: number;
      message: string;
    }[];
  };
  statusSignals: {
    enabled: boolean;
    fetchedAt: string | null;
    ttlSeconds: number | null;
    timeoutMs: number | null;
    fetched: number;
    matched: number;
    overridden: number;
    sources: string[];
    sourceStatuses: {
      name: string;
      ok: boolean;
      fetched: number;
      latencyMs: number;
      message: string;
    }[];
  };
  reliability: {
    confidence: number;
    level: "high" | "medium" | "low";
    label: string;
    fallbackReason: string | null;
    estimatedCount: number;
    estimatedShare: number;
    liveCoverage: number;
    okSources: number;
    sourceCount: number;
    liveTtlSeconds: number | null;
    timeoutMs: number | null;
    basis: string[];
  };
}

interface RankingInsights {
  topGenres: { name: string; count: number; share: number }[];
  platformMix: { id: PlatformId; label: string; color: string; count: number; share: number }[];
  scoreSpread: number;
  leader: { title: string; rank: number; score: number } | null;
  rising: { title: string; delta: number; rank: number } | null;
  liveCoverage: number;
}

interface RankingResponse {
  items: RankedTitle[];
  meta: RankingMeta;
  insights: RankingInsights;
}

const axisIcons: Record<RankAxis, ComponentType<{ size?: number; className?: string }>> = {
  popular: Flame,
  trending: TrendingUp,
  favorites: Heart,
  rating: Star,
  hidden: Gem,
  binge: Waves,
  completed: Flag,
  rookie: Sprout,
};

function metricFor(axis: RankAxis): (t: Title) => { label: string; value: string } {
  switch (axis) {
    case "trending":
      return (t) => ({ label: "트렌드", value: String(Math.round(t.stats.trendingScore)) });
    case "rating":
    case "hidden":
      return (t) => ({ label: "평점", value: t.stats.ratingAvg.toFixed(1) });
    case "favorites":
      return (t) => ({ label: "관심", value: formatCount(t.stats.bookmarks) });
    case "binge":
      return (t) => ({ label: "몰입지수", value: String(Math.round(t.stats.bingeIndex)) });
    case "completed":
      return (t) => ({ label: "완독률", value: `${Math.round(t.stats.completionRate)}%` });
    case "rookie":
      return (t) => ({ label: "데뷔", value: String(t.releaseYear) });
    case "popular":
    default:
      return (t) => ({ label: "조회", value: formatCount(t.stats.views) });
  }
}

function formatUpdatedAt(value?: string) {
  if (!value) return "대기 중";
  return `${new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value))} ${new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))}`;
}

function confidenceTone(level?: RankingMeta["reliability"]["level"]) {
  if (level === "high") return "text-good";
  if (level === "medium") return "text-warn";
  return "text-bad";
}

function RankingSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-panel/30 p-2 sm:p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[2.75rem_2.5rem_1fr_auto] items-center gap-3 rounded-lg border-b border-line/60 px-2 py-2.5 sm:gap-4 sm:px-3"
        >
          <span className="skeleton h-8 w-8" />
          <span className="skeleton h-12 w-10" />
          <span className="min-w-0 space-y-2">
            <span className="skeleton block h-4 w-2/3" />
            <span className="skeleton block h-3 w-4/5" />
          </span>
          <span className="skeleton h-8 w-14" />
        </div>
      ))}
    </div>
  );
}

function SignalWorkbench({
  insights,
  meta,
}: {
  insights: RankingInsights | null;
  meta: RankingMeta | null;
}) {
  const genres = insights?.topGenres.map((g) => g.name) ?? [];
  const gradient = spectrumGradient(genres);
  const reliability = meta?.reliability;
  const TrustIcon = reliability?.level === "low" ? ShieldAlert : ShieldCheck;
  const trustTone = confidenceTone(reliability?.level);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-[linear-gradient(135deg,oklch(0.205_0.01_66),oklch(0.17_0.012_72))] p-4 surface-hl">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: gradient }} />
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-canvas/55 px-2.5 py-1 text-xs font-medium text-fg-2">
        <FunctionSquare size={12} className="text-accent" />
        <span>신호 관측대</span>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="min-w-0 rounded-lg border border-line bg-canvas/35 p-3">
          <p className="eyebrow text-[0.58rem] text-fg-3">CONFIDENCE</p>
          <div className="mt-1 flex items-end gap-2">
            <TrustIcon size={18} className={cn("mb-0.5 shrink-0", trustTone)} />
            <p className={cn("font-display text-2xl font-bold leading-none tnum", trustTone)}>
              {reliability?.confidence ?? 0}
            </p>
            <span className="pb-0.5 text-xs text-fg-3">/100</span>
          </div>
          <p className="mt-1 text-xs text-fg-3">{reliability?.label ?? "신호 대기"}</p>
        </div>
        <div className="min-w-0">
          <p className="eyebrow text-[0.58rem] text-fg-3">SOURCE</p>
          <p className="mt-1 truncate text-sm font-semibold text-fg">
            {meta?.source === "live-api" ? "Live API" : "Formula API"}
          </p>
          <p className="mt-0.5 text-xs text-fg-3">
            {meta?.source === "live-api"
              ? `${meta.live.matched}개 실시간 매칭`
              : reliability?.fallbackReason ?? "산식 기반 폴백"}
          </p>
          {meta?.statusSignals.enabled && (
            <p className="mt-1 text-xs text-fg-3">
              상태 확인 {meta.statusSignals.matched}개 · 보정 {meta.statusSignals.overridden}개
            </p>
          )}
        </div>
        <div className="min-w-0">
          <p className="eyebrow text-[0.58rem] text-fg-3">COVERAGE</p>
          <p className="mt-1 font-display text-xl font-bold text-accent tnum">
            {insights ? `${insights.liveCoverage}%` : "0%"}
          </p>
          <p className="mt-0.5 text-xs text-fg-3">현재 랭킹 내 라이브 소스 비중</p>
        </div>
        <div className="min-w-0">
          <p className="eyebrow text-[0.58rem] text-fg-3">RISING</p>
          <p className="mt-1 truncate text-sm font-semibold text-fg">{insights?.rising?.title ?? "대기 중"}</p>
          <p className="mt-0.5 text-xs text-fg-3">
            {insights?.rising ? `#${insights.rising.rank} · ${insights.rising.delta > 0 ? "+" : ""}${insights.rising.delta}` : "상승 신호 없음"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="eyebrow text-[0.58rem] text-fg-3">SPREAD</p>
          <p className="mt-1 font-display text-xl font-bold text-fg tnum">{insights?.scoreSpread ?? 0}</p>
          <p className="mt-0.5 text-xs text-fg-3">1위와 하위권 점수 간격</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-line pt-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <p className="eyebrow mb-2 text-[0.58rem] text-fg-3">EVIDENCE</p>
          <div className="flex flex-wrap gap-1.5">
            {(reliability?.basis ?? ["랭킹 신호 계산 대기"]).map((item) => (
              <span
                key={item}
                className="rounded-md border border-line/80 bg-canvas/55 px-2 py-1 text-[0.7rem] text-fg-2"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-1.5 lg:justify-end">
          {(meta?.live.sourceStatuses ?? []).map((source) => (
            <span
              key={source.name}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.7rem]",
                source.ok
                  ? "border-good/30 bg-[oklch(0.8_0.15_150/0.1)] text-good"
                  : "border-bad/35 bg-[oklch(0.66_0.2_25/0.12)] text-bad"
              )}
              title={`${source.message} · ${source.latencyMs}ms`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {source.name} {source.fetched}개 · {source.latencyMs}ms
            </span>
          ))}
          {(meta?.statusSignals.sourceStatuses ?? []).map((source) => (
            <span
              key={`status-${source.name}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.7rem]",
                source.ok
                  ? "border-cool/35 bg-[oklch(0.8_0.11_232/0.1)] text-cool"
                  : "border-warn/35 bg-[oklch(0.82_0.15_80/0.12)] text-warn"
              )}
              title={`연재 상태 ${source.message} · ${source.latencyMs}ms`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              상태 {source.name} {source.fetched}개
            </span>
          ))}
          {meta?.live.ttlSeconds && (
            <span className="rounded-md border border-line bg-canvas/45 px-2 py-1 text-[0.7rem] text-fg-3">
              소스 TTL {Math.round(meta.live.ttlSeconds / 60)}분
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-raised">
            {(insights?.topGenres.length ? insights.topGenres : [{ name: "판타지", share: 100, count: 0 }]).map(
              (genre) => (
              <span
                key={genre.name}
                className="h-full"
                style={{
                  width: `${Math.max(genre.share, 6)}%`,
                  backgroundColor: genreColor(genre.name, 0.72),
                }}
              />
              )
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {insights?.topGenres.slice(0, 5).map((genre) => (
              <span
                key={genre.name}
                className="rounded-md border px-2 py-1 text-[0.7rem] text-fg-2"
                style={{
                  borderColor: genreColor(genre.name, 0.42),
                  backgroundColor: genreTint(genre.name, 0.14),
                }}
              >
                {genre.name} {genre.share}%
              </span>
            ))}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-start gap-1.5 lg:justify-end">
          {insights?.platformMix.map((platform) => (
            <span
              key={platform.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas/50 px-2 py-1 text-[0.7rem] text-fg-2"
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: platform.color }} />
              {platform.label} {platform.share}%
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RankingBoard({ initialAxis = "popular" }: { initialAxis?: RankAxis }) {
  const [axis, setAxis] = useState<RankAxis>(initialAxis);
  const [period, setPeriod] = useState<RankPeriod>("weekly");
  const [type, setType] = useState<WorkType | "all">("all");
  const [genre, setGenre] = useState<string>("all");
  const [platform, setPlatform] = useState<PlatformId | "all">("all");
  const [status, setStatus] = useState<SerialStatus | "all">("all");
  const [pricing, setPricing] = useState<Pricing | "all">("all");
  const [minRating, setMinRating] = useState(0);
  const [risingOnly, setRisingOnly] = useState(false);
  const [view, setView] = useState<View>("list");
  const [ranked, setRanked] = useState<RankedTitle[]>([]);
  const [rankingMeta, setRankingMeta] = useState<RankingMeta | null>(null);
  const [insights, setInsights] = useState<RankingInsights | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefresh = useRef(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(60_000);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null);

  const axisDetail = axisMeta(axis);
  const metric = metricFor(axis);
  const query = useMemo(() => {
    const params = new URLSearchParams({
      axis,
      period,
      type,
      genre,
      platform,
      status,
      pricing,
      minRating: String(minRating),
      rising: String(risingOnly),
      limit: "50",
      refresh: "false",
    });
    return params.toString();
  }, [axis, genre, minRating, period, platform, pricing, risingOnly, status, type]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function load(silent = false) {
      const shouldForce = forceRefresh.current;
      setState((prev) => (silent && prev === "ready" ? "refreshing" : "loading"));
      setError(null);
      const url = new URLSearchParams(query);
      if (shouldForce) {
        url.set("refresh", "true");
      } else {
        url.delete("refresh");
      }

      try {
        const res = await fetch(`/api/ranking?${url.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("랭킹 API 응답을 받지 못했습니다.");
        const data = (await res.json()) as RankingResponse;
        if (!alive) return;
        setRanked(data.items);
        setRankingMeta(data.meta);
        setInsights(data.insights);
        const ttlSeconds =
          data.meta.live.ttlSeconds ??
          (data.meta.live.enabled ? Math.max(30, data.meta.refreshSeconds) : data.meta.refreshSeconds);
        setPollIntervalMs(Math.max(30_000, Math.min(300_000, ttlSeconds * 1000)));
        if (data.meta.live.fetchedAt) {
          if (data.meta.live.nextRefreshAt) {
            const scheduled = new Date(data.meta.live.nextRefreshAt).getTime();
            if (Number.isFinite(scheduled)) {
              setNextRefreshAt(scheduled);
            } else {
              setNextRefreshAt(new Date(data.meta.live.fetchedAt).getTime() + ttlSeconds * 1000);
            }
          } else {
            setNextRefreshAt(new Date(data.meta.live.fetchedAt).getTime() + ttlSeconds * 1000);
          }
        } else {
          setNextRefreshAt(Date.now() + Math.max(30_000, Math.min(300_000, ttlSeconds * 1000)));
        }
        setState("ready");
      } catch (err) {
        if (!alive || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "랭킹을 불러오지 못했습니다.");
        setState("error");
      } finally {
        forceRefresh.current = false;
      }
    }

    load();
    const timer = window.setInterval(() => load(true), pollIntervalMs);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [pollIntervalMs, query, refreshKey]);

  useEffect(() => {
    if (!nextRefreshAt) {
      setRefreshCountdown(null);
      return;
    }

    const tick = () => {
      setRefreshCountdown(Math.max(0, Math.floor((nextRefreshAt - Date.now()) / 1000)));
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [nextRefreshAt]);

  const isLoading = state === "loading";
  const isRefreshing = state === "refreshing";
  const refreshLabel = refreshCountdown === null ? "자동 갱신 대기" : `${refreshCountdown}초`;

  return (
    <div className="flex flex-col gap-5">
      {/* 축 선택 */}
      <section className="rounded-2xl border border-line bg-panel/60 p-4 surface-hl sm:p-5">
        <div className="mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-1.5 text-accent">RANKING AXES</p>
            <h2 className="text-lg font-semibold text-fg">랭킹 산식 축</h2>
            <p className="text-sm text-fg-3">축 하나가 바뀌면 전체 정렬 기준이 즉시 교체됩니다.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs text-fg-2">
            <span className="size-1.5 rounded-full bg-accent" />
            현재 {axisDetail.label}
          </span>
        </div>

        <div className="rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
          {RANK_AXES.map((a) => {
            const active = a.key === axis;
            const Icon = axisIcons[a.key];
            return (
              <button
                key={a.key}
                onClick={() => setAxis(a.key)}
                className={cn(
                  "group flex min-w-36 shrink-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm font-medium transition-[background,border-color,color,transform,box-shadow] duration-150 ease-out-expo sm:min-w-0",
                  active
                    ? "border-accent/55 bg-accent-soft text-accent shadow-[0_10px_30px_-18px_oklch(0.72_0.185_42/0.75)]"
                    : "border-line bg-card text-fg-2 hover:-translate-y-0.5 hover:border-line-strong hover:text-fg"
                )}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl border transition-colors duration-150",
                    active ? "border-accent/45 bg-canvas/45" : "border-line bg-raised/60"
                  )}
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0 leading-tight">
                  <span>{a.label}</span>
                  <span className="mt-0.5 hidden truncate text-[0.72rem] font-normal text-fg-3 sm:block">
                    {a.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <SignalWorkbench insights={insights} meta={rankingMeta} />

      {/* 산식 + 기간/유형 */}
      <section className="grid gap-3 rounded-2xl border border-line bg-panel/40 p-4 surface-hl lg:grid-cols-[1fr_auto] lg:items-center sm:p-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <FunctionSquare size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{axisDetail.desc}</p>
            <p className="mt-0.5 font-mono text-xs leading-relaxed text-fg-3">
              <span className="eyebrow mr-1.5 text-[0.6rem] text-accent">산식</span>
              {axisDetail.formula}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <Segmented
            size="sm"
            value={type}
            onChange={setType}
            items={[
              { value: "all", label: "전체" },
              { value: "webtoon", label: "웹툰" },
              { value: "webnovel", label: "웹소설" },
            ]}
          />
          <Segmented
            size="sm"
            value={period}
            onChange={setPeriod}
            items={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
          />
        </div>
      </section>

      {/* 필터(장르·플랫폼) + 보기 방식 */}
      <section className="grid gap-3 rounded-2xl border border-line bg-panel/40 p-4 surface-hl lg:grid-cols-[1fr_auto] lg:items-start xl:p-5">
        <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center rounded-full border border-accent/35 bg-accent-soft px-3 text-[0.7rem] font-semibold text-accent">
              장르·운영 조건
            </span>
          </div>

          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="h-10 min-w-36 rounded-lg border border-line bg-card px-2.5 text-sm text-fg-2 outline-none transition-colors focus:border-accent/50"
            aria-label="장르 필터"
          >
            <option value="all">전체 장르</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <Segmented
            size="sm"
            value={platform}
            onChange={(v) => setPlatform(v as PlatformId | "all")}
            items={[
              { value: "all", label: "전체" },
              { value: "naver-webtoon", label: "네이버웹툰" },
              { value: "kakao-webtoon", label: "카카오웹툰" },
              { value: "naver-series", label: "시리즈" },
            ]}
          />
          <Segmented
            size="sm"
            value={status}
            onChange={(v) => setStatus(v as SerialStatus | "all")}
            items={[
              { value: "all", label: "전체 상태" },
              { value: "ongoing", label: "연재중" },
              { value: "completed", label: "완결" },
              { value: "hiatus", label: "휴재" },
            ]}
          />
          <Segmented
            size="sm"
            value={pricing}
            onChange={(v) => setPricing(v as Pricing | "all")}
            items={[
              { value: "all", label: "전체 가격" },
              { value: "free", label: "무료" },
              { value: "wait-free", label: "기다무" },
              { value: "paid", label: "유료" },
            ]}
          />
          <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-card px-3 text-xs text-fg-2">
            <Star size={14} className="text-accent" />
            <span className="whitespace-nowrap">평점 {minRating.toFixed(1)}+</span>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={minRating}
              onChange={(event) => setMinRating(Number(event.target.value))}
              className="h-1 w-24 accent-[oklch(0.72_0.185_42)]"
              aria-label="최소 평점"
            />
          </label>
          <button
            type="button"
            onClick={() => setRisingOnly((current) => !current)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors",
              risingOnly
                ? "border-good/40 bg-[oklch(0.8_0.15_150/0.12)] text-good"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg"
            )}
          >
            <TrendingUp size={14} />
            상승작
          </button>
        </div>
        <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end xl:justify-end">
          <div
            className={cn(
              "inline-flex h-10 min-w-0 items-center gap-2 rounded-full border border-line bg-card/90 px-3 text-xs text-fg-3",
              state === "error" && "border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] text-bad"
            )}
          >
            {state === "error" ? (
              <AlertCircle size={14} className="shrink-0" />
            ) : rankingMeta?.source === "live-api" ? (
              <Radio size={14} className={cn("shrink-0 text-bad", isRefreshing && "animate-pulse-soft")} />
            ) : (
              <Grid2X2 size={14} className="shrink-0 text-fg-2" />
            )}
            <span className="truncate">
              {state === "error"
                ? error
                : rankingMeta?.source === "live-api"
                  ? `LIVE API · 신뢰 ${rankingMeta.reliability.confidence}/100 · ${rankingMeta.live.matched}/${rankingMeta.live.fetched} 매칭 · 업데이트 ${formatUpdatedAt(
                      rankingMeta.live.fetchedAt ?? rankingMeta.generatedAt
                    )}`
                  : `FORMULA API · 신뢰 ${rankingMeta?.reliability.confidence ?? 0}/100 · 업데이트 ${formatUpdatedAt(rankingMeta?.generatedAt)}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              forceRefresh.current = true;
              setRefreshKey((current) => current + 1);
            }}
            className="inline-flex size-10 items-center justify-center rounded-xl border border-line bg-card text-fg-2 transition-colors hover:border-line-strong hover:text-fg"
            title="랭킹 새로고침"
            aria-label="랭킹 새로고침"
          >
            <RefreshCw size={14} className={cn(isRefreshing && "animate-spin")} />
          </button>
          <span className="inline-flex h-10 items-center rounded-xl border border-line bg-card px-3 text-sm text-fg-3">
            <span className="mr-1 text-fg">다음 갱신:</span>
            <span className="numeral mr-1 text-fg">{refreshLabel}</span>
            <span>·</span>
            <span className="numeral mr-1 text-fg">{ranked.length}</span>편
          </span>
          <Segmented
            size="sm"
            value={view}
            onChange={(v) => setView(v as View)}
            items={[
              { value: "list", label: <LayoutList size={15} />, hint: "리스트 보기" },
              { value: "poster", label: <LayoutGrid size={15} />, hint: "포스터 보기" },
              { value: "compact", label: <Rows3 size={15} />, hint: "컴팩트 보기" },
            ]}
          />
        </div>
      </section>

      {/* 랭킹 — 3가지 표시 방식 */}
      {isLoading ? (
        <RankingSkeleton />
      ) : state === "error" ? (
        <div className="rounded-xl border border-bad/40 bg-[oklch(0.66_0.2_25/0.12)] px-5 py-12 text-center">
          <AlertCircle className="mx-auto mb-3 text-bad" size={24} />
          <p className="text-sm font-medium text-fg">랭킹을 불러오지 못했습니다.</p>
          <p className="mt-1 text-sm text-fg-3">{error}</p>
        </div>
      ) : ranked.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel/30 px-5 py-14 text-center">
          <BookOpen className="mx-auto mb-3 text-fg-3" size={24} />
          <p className="text-sm font-medium text-fg">해당 조건의 작품이 없습니다.</p>
          <p className="mt-1 text-sm text-fg-3">장르나 플랫폼 필터를 넓혀보세요.</p>
        </div>
      ) : view === "list" ? (
        <div className="rounded-xl border border-line bg-panel/30 p-2 sm:p-3">
          {ranked.map((r) => (
            <RankRow key={r.title.id} ranked={r} metric={metric} />
          ))}
        </div>
      ) : view === "poster" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {ranked.map((r) => (
            <TitleCard key={r.title.id} title={r.title} rank={r.rank} />
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {ranked.map((r) => {
            const mm = metric(r.title);
            return (
              <Link
                key={r.title.id}
                href={`/title/${r.title.slug}`}
                className="group flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2 transition-colors hover:border-line-strong"
              >
                <span
                  className={cn(
                    "numeral w-7 shrink-0 text-center text-lg",
                    r.rank <= 3 ? "text-accent" : "text-fg-3"
                  )}
                >
                  {r.rank}
                </span>
                <MiniPoster title={r.title} className="w-7 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg group-hover:text-accent">
                    {r.title.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-fg-3">{r.title.synopsis}</span>
                  <span className="flex items-center gap-1.5">
                    <RatingInline value={r.title.stats.ratingAvg} estimated={statsAreEstimated(r.title)} size="xs" />
                    <PlatformTags availability={r.title.availability} max={1} />
                  </span>
                </span>
                <span className="numeral shrink-0 text-xs text-fg-2">{mm.value}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
