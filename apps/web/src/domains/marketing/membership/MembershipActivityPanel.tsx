import { ChevronDown, Coins, ShieldCheck, UsersRound } from "lucide-react";

import type { ActivityRewardView } from "@/platform/membership-wallet-client";
import { useT } from "@/shared/lib/i18n";
import { useShowMore } from "@/domains/legal/public/site-show-more";
import { SiteShowMoreButton } from "@/domains/legal/public/site-rail";

import { COPY, TAB_COPY } from "./membership-copy";

/** 처음에 보여 주는 활동 개수. 나머지는 '더 보기'로 펼친다. */
const INITIAL_ACTIVITIES = 5;

/** 활동 포인트 탭: 활동별 적립 규칙 + 크레딧·구매 정책(접힘). */
export function MembershipActivityPanel({ activities, formatter }: {
  readonly activities: readonly ActivityRewardView[];
  readonly formatter: Intl.NumberFormat;
}) {
  const t = useT();
  const { visible, remaining, showMore } = useShowMore(activities.length, INITIAL_ACTIVITIES);
  const shown = activities.slice(0, visible);
  return (
    <div className="grid gap-4">
      <article className="rounded-3xl border border-line bg-panel p-4 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Coins size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black tracking-[0.12em] text-accent">ACTIVITY POINTS</p>
            <h2 className="mt-1 text-xl font-black text-fg sm:text-2xl">{t(COPY.activityTitle)}</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-fg-2">{t(COPY.activityDescription)}</p>
        <div className="mt-5 divide-y divide-line/70 rounded-2xl border border-line bg-card/45 px-4">
          {shown.map((activity) => (
            <div key={activity.key} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5">
              <div>
                <p className="font-bold text-fg">{activity.label}</p>
                <p className="mt-1 text-xs text-fg-3">
                  {t(COPY.activityDaily, { limit: formatter.format(activity.dailyGrantLimit) })} ·
                  {activity.cooldownSeconds > 0
                    ? ` ${t(COPY.activityCooldown, { seconds: formatter.format(activity.cooldownSeconds) })}`
                    : ` ${t(COPY.activityNoCooldown)}`}
                </p>
              </div>
              <span className="text-sm font-black text-accent">+{formatter.format(activity.points)} P</span>
              <span className="text-xs font-semibold text-fg-3">{activity.claimMode === "server" ? t(COPY.activityServer) : t(COPY.activityUsage)}</span>
            </div>
          ))}
        </div>
        <SiteShowMoreButton remaining={remaining} onClick={() => showMore()} label={t(TAB_COPY.showMore, { count: remaining })} />
      </article>

      <details className="group rounded-3xl border border-line bg-panel">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-3xl px-4 py-3 text-sm font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span>{t(TAB_COPY.policyNotes)}</span>
          <ChevronDown size={18} className="shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="grid gap-4 px-4 pb-4 sm:px-6 sm:pb-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-line bg-card/45 p-4">
            <ShieldCheck className="text-accent" size={22} aria-hidden="true" />
            <h3 className="mt-3 text-lg font-black text-fg">{t(COPY.creditTitle)}</h3>
            <p className="mt-2 text-sm leading-6 text-fg-2">{t(COPY.creditDescription)}</p>
          </article>
          <article className="rounded-2xl border border-line bg-card/45 p-4">
            <UsersRound className="text-accent" size={22} aria-hidden="true" />
            <h3 className="mt-3 text-lg font-black text-fg">{t(COPY.notProductTitle)}</h3>
            <p className="mt-2 text-sm leading-6 text-fg-2">{t(COPY.notProductDescription)}</p>
          </article>
        </div>
      </details>
    </div>
  );
}
