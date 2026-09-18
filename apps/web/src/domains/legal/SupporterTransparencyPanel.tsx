import {
  Cloud,
  Database,
  Globe2,
  HardDrive,
  HeartHandshake,
  Server,
} from "lucide-react";
import { useEffect, useState } from "react";

import type {
  PublicSupporterWallEntry,
  SupporterFundingSummary,
} from "@toonspectrum/core/supporter-payment";

import {
  getPublicSupporters,
  getSupporterFundingSummary,
} from "./supporter-payment-api";

import { useT } from "@/shared/lib/i18n";

const formatWon = (amount: number) => `₩${amount.toLocaleString("ko-KR")}`;

const COST_ITEMS = [
  { icon: Server, title: "supportUs.funding.costHosting", body: "supportUs.funding.costHostingBody" },
  { icon: Database, title: "supportUs.funding.costDatabase", body: "supportUs.funding.costDatabaseBody" },
  { icon: HardDrive, title: "supportUs.funding.costStorage", body: "supportUs.funding.costStorageBody" },
  { icon: Cloud, title: "supportUs.funding.costApi", body: "supportUs.funding.costApiBody" },
  { icon: Globe2, title: "supportUs.funding.costDomain", body: "supportUs.funding.costDomainBody" },
] as const;

export function SupporterTransparencyPanel() {
  const t = useT();
  const [summary, setSummary] = useState<SupporterFundingSummary | null>(null);
  const [supporters, setSupporters] = useState<PublicSupporterWallEntry[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSupporterFundingSummary(), getPublicSupporters()])
      .then(([nextSummary, nextSupporters]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setSupporters(nextSupporters);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const progress = Math.max(0, Math.min(100, summary?.progressPercent ?? 0));

  return (
    <section
      className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]"
      aria-labelledby="supporter-funding-title"
    >
      <div className="rounded-3xl border border-line bg-card p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">
              OPEN OPERATING COSTS
            </p>
            <h2 id="supporter-funding-title" className="mt-1 text-xl font-bold text-fg">
              {t("supportUs.funding.title")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-fg-2">
              {t("supportUs.funding.description")}
            </p>
          </div>
          {summary?.mode === "test" ? (
            <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-bold text-fg-3">
              {t("supportUs.checkout.testBadge")}
            </span>
          ) : null}
        </div>

        {summary && summary.goalAmount > 0 ? (
          <div className="mt-6 rounded-2xl border border-accent/25 bg-accent-soft/35 p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-fg-3">
                  {summary.month} · {t("supportUs.funding.monthlyGoal")}
                </p>
                <p className="mt-1 text-2xl font-bold text-fg">
                  {formatWon(summary.supportedAmount)}
                  <span className="ml-2 text-sm font-medium text-fg-3">
                    / {formatWon(summary.goalAmount)}
                  </span>
                </p>
              </div>
              <span className="text-sm font-bold text-accent">{summary.progressPercent}%</span>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-panel">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-fg-3">
              {t("supportUs.funding.supporterCount").replace("{count}", String(summary.supporterCount))}
            </p>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {COST_ITEMS.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border border-line bg-panel/55 p-4">
              <Icon size={18} className="text-accent" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-bold text-fg">{t(title)}</h3>
              <p className="mt-1 text-xs leading-5 text-fg-3">{t(body)}</p>
            </article>
          ))}
        </div>

        <p className="mt-5 rounded-xl border border-line bg-panel/50 px-4 py-3 text-xs leading-6 text-fg-3">
          {t("supportUs.funding.freePromise")}
        </p>
        {error ? (
          <p className="mt-3 text-xs text-fg-3">{t("supportUs.funding.loadError")}</p>
        ) : null}
      </div>

      <aside className="rounded-3xl border border-line bg-card p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-accent">
            <HeartHandshake size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-accent">THANK YOU</p>
            <h2 className="text-lg font-bold text-fg">{t("supportUs.wall.title")}</h2>
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-fg-2">{t("supportUs.wall.description")}</p>

        {summary?.publicWallEnabled === false ? (
          <p className="mt-5 rounded-xl border border-line bg-panel/55 p-4 text-sm text-fg-3">
            {t("supportUs.wall.disabled")}
          </p>
        ) : supporters.length > 0 ? (
          <div className="mt-5 space-y-3">
            {supporters.map((supporter, index) => (
              <article
                key={`${supporter.supportedAt}-${index}`}
                className="rounded-2xl border border-line bg-panel/55 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-fg">{supporter.displayName}</p>
                  {supporter.amount != null ? (
                    <span className="text-xs font-bold text-accent">
                      {formatWon(supporter.amount)}
                    </span>
                  ) : null}
                </div>
                {supporter.message ? (
                  <p className="mt-2 text-sm leading-6 text-fg-2">{supporter.message}</p>
                ) : null}
                <p className="mt-2 text-[11px] text-fg-3">
                  {new Date(supporter.supportedAt).toLocaleDateString()}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-line bg-panel/55 p-4 text-sm text-fg-3">
            {t("supportUs.wall.empty")}
          </p>
        )}
      </aside>
    </section>
  );
}
