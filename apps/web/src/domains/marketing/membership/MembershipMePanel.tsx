import { BadgeCheck, Coins, Gauge, Sparkles } from "lucide-react";

import { CREATOR_LEVEL_AUTO_POLICIES } from "@toonstudio/core/membership-wallet";

import type { MembershipOverview } from "@/platform/membership-wallet-client";
import { useT } from "@/shared/lib/i18n";

import { COPY, LEDGER_ACTION_KEYS, creatorLevelLabels } from "./membership-copy";

/** 내 현황 탭: 현재 멤버십·포인트·크레딧·누적 활동, 최근 원장, 창작자 등급. 로그인한 사람에게만 보인다. */
export function MembershipMePanel({ overview, formatter }: {
  readonly overview: MembershipOverview;
  readonly formatter: Intl.NumberFormat;
}) {
  const t = useT();
  const ledger = overview.recentLedger.slice(0, 8);
  return (
    <div className="grid gap-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t(COPY.overviewAria)}>
        <article className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <BadgeCheck className="text-accent" size={20} aria-hidden="true" />
          <p className="mt-3 text-xs font-bold text-fg-3">{t(COPY.overviewPlan)}</p>
          <p className="mt-1 text-2xl font-black text-fg">{overview.membership.plan.label}</p>
        </article>
        <article className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <Coins className="text-accent" size={20} aria-hidden="true" />
          <p className="mt-3 text-xs font-bold text-fg-3">{t(COPY.overviewPoints)}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-fg">{formatter.format(overview.wallet.points.available)} P</p>
        </article>
        <article className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <Sparkles className="text-accent" size={20} aria-hidden="true" />
          <p className="mt-3 text-xs font-bold text-fg-3">Studio Credit</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-fg">{formatter.format(overview.wallet.studioCredits.available)} C</p>
          <p className="mt-1 text-xs text-fg-3">
            {t(COPY.overviewCreditCycle, {
              monthly: formatter.format(overview.creditCycle.monthlyIncluded),
              remaining: formatter.format(overview.creditCycle.remainingToday),
            })}
          </p>
        </article>
        <article className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <Gauge className="text-accent" size={20} aria-hidden="true" />
          <p className="mt-3 text-xs font-bold text-fg-3">{t(COPY.overviewLifetime)}</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-fg">{formatter.format(overview.wallet.points.lifetimeGranted)} P</p>
        </article>
      </section>

      {ledger.length > 0 && (
        <section className="rounded-3xl border border-line bg-panel p-4 sm:p-6" aria-labelledby="wallet-history-title">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.14em] text-accent">WALLET LEDGER</p>
              <h2 id="wallet-history-title" className="mt-1 text-xl font-black text-fg">{t(COPY.ledgerTitle)}</h2>
            </div>
            <span className="text-xs font-semibold text-fg-3">{t(COPY.ledgerRecent, { count: ledger.length })}</span>
          </div>
          <div className="mt-4 divide-y divide-line/70">
            {ledger.map((entry) => {
              const unit = entry.asset === "reward_point" ? "P" : "C";
              const delta = entry.deltaAvailable;
              const amount = delta === 0 ? entry.amount : Math.abs(delta);
              const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
              const actionKey = LEDGER_ACTION_KEYS[entry.entryType];
              return (
                <div key={entry.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[7rem_1fr_auto] sm:items-center">
                  <span className="font-bold text-fg">{entry.asset === "reward_point" ? t(COPY.assetPoint) : t(COPY.assetCredit)}</span>
                  <span className="min-w-0">
                    <span className="font-semibold text-fg-2">{actionKey ? t(actionKey) : entry.entryType}</span>
                    <span className="ml-2 text-xs text-fg-3">{entry.reason}</span>
                  </span>
                  <span className="font-black tabular-nums text-fg">{sign}{formatter.format(amount)} {unit}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-line bg-panel p-4 sm:p-8" aria-labelledby="creator-level-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-accent">CREATOR LEVEL</p>
            <h2 id="creator-level-title" className="mt-2 text-2xl font-black text-fg">{t(COPY.creatorTitle)}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2">{t(COPY.creatorDescription)}</p>
          </div>
          <span className="rounded-full border border-accent/30 bg-accent-soft px-4 py-2 text-sm font-black text-accent">
            {creatorLevelLabels[overview.creatorProgress.effectiveLevel] ?? overview.creatorProgress.effectiveLevel}
          </span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-card/55 p-4">
            <p className="text-xs font-bold text-fg-3">{t(COPY.metricVerified)}</p>
            <p className="mt-1 font-black text-fg">
              {overview.creatorProgress.metrics.verifiedCreator ? t(COPY.metricVerifiedDone) : t(COPY.metricVerifiedNeeded)}
            </p>
          </div>
          <div className="rounded-2xl bg-card/55 p-4">
            <p className="text-xs font-bold text-fg-3">{t(COPY.metricWorks)}</p>
            <p className="mt-1 font-black text-fg">{t(COPY.countUnit, { count: formatter.format(overview.creatorProgress.metrics.publishedWorks) })}</p>
          </div>
          <div className="rounded-2xl bg-card/55 p-4">
            <p className="text-xs font-bold text-fg-3">{t(COPY.metricPoints)}</p>
            <p className="mt-1 font-black text-fg">{formatter.format(overview.creatorProgress.metrics.activityPoints)} P</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {Object.entries(CREATOR_LEVEL_AUTO_POLICIES)
            .filter(([level]) => level !== "new")
            .map(([level, policy]) => (
              <div key={level} className="rounded-2xl border border-line bg-card/35 p-4 text-sm">
                <p className="font-black text-fg">{creatorLevelLabels[level] ?? level}</p>
                <p className="mt-2 text-xs leading-5 text-fg-3">
                  {policy.verifiedCreator ? t(COPY.levelVerifiedRequired) : t(COPY.levelVerifiedOptional)}
                  {policy.publishedWorks > 0 ? t(COPY.levelWorks, { count: formatter.format(policy.publishedWorks) }) : ""}
                  {policy.activityPoints > 0 ? t(COPY.levelPoints, { points: formatter.format(policy.activityPoints) }) : ""}
                </p>
              </div>
            ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-fg-3">{t(COPY.creatorFootnote)}</p>
      </section>
    </div>
  );
}
