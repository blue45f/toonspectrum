import {
  Activity,
  Clock3,
  Compass,
  Download,
  Eye,
  Globe2,
  Laptop,
  MousePointerClick,
  Radio,
  RefreshCw,
  Timer,
  TrendingUp,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  downloadTrafficOverviewCsv,
  formatTrafficDateTime,
  formatTrafficDuration,
  formatTrafficMilliseconds,
  TRAFFIC_AUTO_REFRESH_MS,
  TRAFFIC_RANGE_DAYS,
  type TrafficOverview,
  type TrafficRangeDays,
} from "./admin-traffic-model";
import { adminFetch, formatNum } from "./admin-client";
import { AdminNotice, AdminSpinner } from "./admin-ui";
import {
  TrafficBreakdownList,
  TrafficMetricCard,
  TrafficRecentStream,
  TrafficSourceList,
  TrafficTopPages,
} from "./AdminTrafficBreakdowns";
import {
  TrafficRealtimeBars,
  TrafficTrendChart,
} from "./AdminTrafficCharts";

import { useI18n, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function AdminTraffic({ uid }: { uid: string }) {
  const t = useT();
  const locale = useI18n((state) => state.lang);
  const [days, setDays] = useState<TrafficRangeDays>(7);
  const [data, setData] = useState<TrafficOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const requestSequence = useRef(0);

  const load = useCallback(
    async (background = false) => {
      const sequence = ++requestSequence.current;
      if (!background) setRefreshing(true);
      try {
        const next = await adminFetch<TrafficOverview>(
          `/traffic?days=${days}`,
          uid,
        );
        if (sequence !== requestSequence.current) return;
        setData(next);
        setError(null);
      } catch (caught) {
        if (sequence !== requestSequence.current) return;
        setError(
          caught instanceof Error
            ? caught.message
            : t("admin.traffic.loadError"),
        );
      } finally {
        if (sequence === requestSequence.current && !background) {
          setRefreshing(false);
        }
      }
    },
    [days, t, uid],
  );

  useEffect(() => {
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = globalThis.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load(true);
    }, TRAFFIC_AUTO_REFRESH_MS);
    return () => globalThis.clearInterval(interval);
  }, [autoRefresh, load]);

  if (!data && !error) return <AdminSpinner />;
  if (!data && error) {
    return (
      <div className="space-y-3">
        <AdminNotice title={t("admin.traffic.loadError")} body={error} />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
        >
          {t("admin.traffic.retry")}
        </button>
      </div>
    );
  }
  if (!data) return null;

  const statusStale = Boolean(error);
  const coverage = data.totals.coverageStartAt
    ? `${t("admin.traffic.coverage")} ${formatTrafficDateTime(
        data.totals.coverageStartAt,
        locale,
      )}`
    : null;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-line bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-fg">
                {t("admin.traffic.title")}
              </h2>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold",
                  statusStale
                    ? "border-warn/40 text-warn"
                    : "border-good/30 text-good",
                )}
              >
                {statusStale ? (
                  <WifiOff className="size-3" />
                ) : (
                  <Wifi className="size-3" />
                )}
                {statusStale
                  ? t("admin.traffic.stale")
                  : t("admin.traffic.live")}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-fg-3">
              {t("admin.traffic.desc")}
            </p>
            <p className="mt-2 text-[0.7rem] text-fg-3">
              {t("admin.traffic.lastUpdated")} {" "}
              {formatTrafficDateTime(data.generatedAt, locale)}
              {coverage ? ` · ${coverage}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-xl border border-line bg-canvas p-1"
              aria-label="Traffic range"
            >
              {TRAFFIC_RANGE_DAYS.map((range) => (
                <button
                  type="button"
                  key={range}
                  onClick={() => setDays(range)}
                  aria-pressed={days === range}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    days === range
                      ? "bg-accent text-on-accent"
                      : "text-fg-3 hover:text-fg",
                  )}
                >
                  {t(`admin.traffic.range${range}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAutoRefresh((value) => !value)}
              aria-pressed={autoRefresh}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium",
                autoRefresh
                  ? "border-good/30 text-good"
                  : "border-line text-fg-3",
              )}
            >
              <Radio className={cn("size-3.5", autoRefresh && "animate-pulse")} />
              {t("admin.traffic.autoRefresh")}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg-2 hover:border-accent/50 hover:text-fg disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
              />
              {t("admin.traffic.refresh")}
            </button>
            <button
              type="button"
              onClick={() => downloadTrafficOverviewCsv(data)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-medium text-fg-2 hover:border-accent/50 hover:text-fg"
            >
              <Download className="size-3.5" />
              {t("admin.traffic.export")}
            </button>
          </div>
        </div>
        {statusStale ? (
          <p
            role="status"
            className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn"
          >
            {error}
          </p>
        ) : null}
      </header>

      {data.status === "empty" ? (
        <section className="rounded-2xl border border-dashed border-line bg-card px-6 py-14 text-center">
          <Radio className="mx-auto size-8 text-fg-3" />
          <h3 className="mt-4 text-base font-semibold text-fg">
            {t("admin.traffic.noData")}
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-fg-3">
            {t("admin.traffic.noDataDesc")}
          </p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
            <TrafficMetricCard
              icon={<Radio className="size-4" />}
              label={t("admin.traffic.activeNow")}
              value={formatNum(data.realtime.activeVisitors)}
              detail={`${formatNum(data.realtime.activeSessions)} ${t(
                "admin.traffic.sessions",
              )}`}
              live
            />
            <TrafficMetricCard
              icon={<Eye className="size-4" />}
              label={t("admin.traffic.views5m")}
              value={formatNum(data.realtime.pageViews5m)}
              detail={`${formatNum(data.realtime.pageViews30m)} / 30m`}
              live
            />
            <TrafficMetricCard
              icon={<MousePointerClick className="size-4" />}
              label={t("admin.traffic.pageViews")}
              value={formatNum(data.totals.pageViews)}
              detail={formatTrafficMilliseconds(
                data.totals.averageLoadTimeMs,
              )}
            />
            <TrafficMetricCard
              icon={<Users className="size-4" />}
              label={t("admin.traffic.uniqueVisitors")}
              value={formatNum(data.totals.uniqueVisitors)}
              detail={`${formatNum(
                data.totals.returningVisitors,
              )} ${t("admin.traffic.returningVisitors")}`}
            />
            <TrafficMetricCard
              icon={<Activity className="size-4" />}
              label={t("admin.traffic.sessions")}
              value={formatNum(data.totals.sessions)}
              detail={`${formatNum(
                data.engagement.engagedSessions,
              )} ${t("admin.traffic.engagedSessions")}`}
            />
            <TrafficMetricCard
              icon={<TrendingUp className="size-4" />}
              label={t("admin.traffic.viewsPerSession")}
              value={Number(
                data.engagement.pageViewsPerSession || 0,
              ).toFixed(2)}
            />
            <TrafficMetricCard
              icon={<Timer className="size-4" />}
              label={t("admin.traffic.avgEngagement")}
              value={formatTrafficDuration(
                data.engagement.averageEngagedSeconds,
              )}
            />
            <TrafficMetricCard
              icon={<Clock3 className="size-4" />}
              label={t("admin.traffic.bounceRate")}
              value={`${Number(
                data.engagement.bounceRate || 0,
              ).toFixed(1)}%`}
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.75fr)]">
            <TrafficTrendChart
              points={data.series}
              locale={locale}
              t={t}
            />
            <TrafficRealtimeBars
              points={data.realtimeSeries}
              locale={locale}
              t={t}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
            <TrafficTopPages pages={data.topPages} t={t} />
            <TrafficSourceList sources={data.sources} t={t} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TrafficBreakdownList
              title={t("admin.traffic.devices")}
              icon={<Laptop className="size-4" />}
              items={data.devices}
            />
            <TrafficBreakdownList
              title={t("admin.traffic.browsers")}
              icon={<Compass className="size-4" />}
              items={data.browsers}
            />
            <TrafficBreakdownList
              title={t("admin.traffic.countries")}
              icon={<Globe2 className="size-4" />}
              items={data.countries}
            />
            <TrafficRecentStream
              items={data.recent}
              locale={locale}
              t={t}
            />
          </div>
        </>
      )}

      <aside className="flex items-start gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-xs leading-relaxed text-fg-3">
        <Wifi className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>
          {t("admin.traffic.privacy")} · {data.retentionDays}d retention ·{" "}
          {data.storageMode}
        </p>
      </aside>
    </div>
  );
}
