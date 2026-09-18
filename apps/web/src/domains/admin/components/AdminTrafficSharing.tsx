import {
  CheckCircle2,
  Link2,
  Share2,
  UserRoundCheck,
} from "lucide-react";

import { formatNum } from "./admin-client";
import { TrafficMetricCard } from "./AdminTrafficBreakdowns";

import type {
  AdminTrafficTranslator,
  TrafficOverview,
} from "./admin-traffic-model";

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    native: "OS",
    kakao: "Kakao",
    naver: "Naver",
    line: "LINE",
    x: "X",
    facebook: "Facebook",
    telegram: "Telegram",
    email: "Email",
    copy: "Copy",
    qr: "QR",
  };
  return labels[channel] ?? channel;
}

export function AdminTrafficSharing({
  sharing,
  t,
}: {
  sharing: TrafficOverview["sharing"];
  t: AdminTrafficTranslator;
}) {
  const handoffCount = sharing.opened + sharing.completed;
  const handoffRate = sharing.attempts > 0
    ? (handoffCount / sharing.attempts) * 100
    : 0;

  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-base font-semibold text-fg">
            <Share2 className="size-4 text-accent" />
            {t("admin.traffic.sharing")}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-3">
            {t("admin.traffic.sharingDesc")}
          </p>
        </div>
        <span className="rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-fg-2">
          {handoffRate.toFixed(1)}% {t("admin.traffic.shareHandoffRate")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TrafficMetricCard
          icon={<Share2 className="size-4" />}
          label={t("admin.traffic.shareAttempts")}
          value={formatNum(sharing.attempts)}
          detail={`${formatNum(sharing.failed)} ${t("admin.traffic.shareFailed")} · ${formatNum(sharing.cancelled)} ${t("admin.traffic.shareCancelled")}`}
        />
        <TrafficMetricCard
          icon={<CheckCircle2 className="size-4" />}
          label={t("admin.traffic.shareOpened")}
          value={formatNum(sharing.opened)}
          detail={`${formatNum(sharing.completed)} ${t("admin.traffic.shareCompleted")}`}
        />
        <TrafficMetricCard
          icon={<UserRoundCheck className="size-4" />}
          label={t("admin.traffic.uniqueSharers")}
          value={formatNum(sharing.uniqueSharers)}
        />
        <TrafficMetricCard
          icon={<Link2 className="size-4" />}
          label={t("admin.traffic.shareAttributedViews")}
          value={formatNum(sharing.attributedPageViews)}
          detail={`${formatNum(sharing.attributedVisitors)} ${t("admin.traffic.visitors")}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-line bg-canvas/40 p-3">
          <h4 className="text-sm font-semibold text-fg">
            {t("admin.traffic.shareChannels")}
          </h4>
          <div className="mt-3 space-y-2">
            {sharing.channels.length === 0 ? (
              <p className="text-xs text-fg-3">{t("admin.traffic.shareNoData")}</p>
            ) : sharing.channels.map((item) => (
              <div key={item.channel} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
                <span className="truncate font-medium text-fg-2">
                  {channelLabel(item.channel)}
                </span>
                <span className="text-right tabular-nums text-fg-3">
                  {formatNum(item.opened + item.completed)} / {formatNum(item.attempts)}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-line bg-canvas/40 p-3">
          <h4 className="text-sm font-semibold text-fg">
            {t("admin.traffic.shareTopContent")}
          </h4>
          <div className="mt-3 space-y-2">
            {sharing.topContent.length === 0 ? (
              <p className="text-xs text-fg-3">{t("admin.traffic.shareNoData")}</p>
            ) : sharing.topContent.map((item) => (
              <div key={item.path} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
                <span className="truncate font-medium text-fg-2" title={item.path}>
                  {item.path}
                </span>
                <span className="text-right tabular-nums text-fg-3">
                  {formatNum(item.opened + item.completed)} / {formatNum(item.attempts)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
