import type { MembershipPlanView } from "@/platform/membership-wallet-client";
import { useT } from "@/shared/lib/i18n";

import { COPY, TAB_COPY, formatBytes, formatLimit } from "./membership-copy";

type Translate = ReturnType<typeof useT>;

interface LimitRow {
  readonly id: string;
  readonly label: string;
  readonly value: (plan: MembershipPlanView) => string;
}

/**
 * 등급별 자원 한도 비교표 — 한 등급이 한 열, 한도 한 가지가 한 행이라 등급끼리 바로 견줄 수 있다.
 * 좁은 화면에서는 한도 이름 열을 고정하고 표만 가로로 넘긴다(카드 네 장을 세로로 쌓던 때보다 훨씬 짧다).
 * 수치는 정책 소스(packages/core)·서버 카탈로그에서만 가져오고 여기서 새로 만들지 않는다.
 */
export function MembershipPlanTable({ plans, formatter }: {
  readonly plans: readonly MembershipPlanView[];
  readonly formatter: Intl.NumberFormat;
}) {
  const t: Translate = useT();
  const count = (value: number) => formatter.format(value);
  const rows: readonly LimitRow[] = [
    { id: "storage", label: t(COPY.statStorage), value: (plan) => formatBytes(Number(plan.entitlements["storage.bytes"]), formatter) },
    { id: "credit-monthly", label: t(COPY.statCreditMonthly), value: (plan) => `${count(Number(plan.entitlements["credit.monthlyIncluded"]))} C` },
    { id: "credit-daily", label: t(COPY.statCreditDaily), value: (plan) => `${count(Number(plan.entitlements["credit.dailyLimit"]))} C` },
    { id: "file-max", label: t(COPY.statFileMax), value: (plan) => formatBytes(Number(plan.entitlements["upload.file.maxBytes"]), formatter) },
    { id: "upload-daily", label: t(COPY.statUploadDaily), value: (plan) => formatBytes(Number(plan.entitlements["upload.daily.maxBytes"]), formatter) },
    {
      id: "collaborators",
      label: t(COPY.statCollaborators),
      value: (plan) => formatLimit(plan.entitlements["collaboration.members"] ?? 0, t, formatter, (n) => t(COPY.statCollaboratorsUnit, { count: count(n) })),
    },
    {
      id: "retention",
      label: t(COPY.statRetention),
      value: (plan) => formatLimit(plan.entitlements["retention.versionsDays"] ?? 0, t, formatter, (days) => t(COPY.statRetentionUnit, { days: count(days) })),
    },
    { id: "hi-res", label: t(COPY.statHighRes), value: (plan) => formatLimit(plan.entitlements["export.highResolution"] ?? false, t, formatter) },
  ];

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="region" aria-label={t(TAB_COPY.tableCaption)}>
      <table className="w-full min-w-[34rem] border-separate border-spacing-0 overflow-hidden rounded-2xl border border-line bg-panel text-sm">
        <caption className="sr-only">{t(TAB_COPY.tableCaption)}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-[7.5rem] border-b border-line bg-panel px-3 py-3 text-left text-xs font-bold text-fg-3">
              <span className="sr-only">{t(COPY.resourceTitle)}</span>
            </th>
            {plans.map((plan) => (
              <th key={plan.id} scope="col" className="min-w-[7.5rem] border-b border-line px-3 py-3 text-left align-top">
                <span className="block text-xs font-black uppercase tracking-[0.12em] text-accent">{plan.label}</span>
                <span className="mt-1 block text-xs font-normal leading-5 text-fg-3">{plan.description}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="[&:last-child>*]:border-b-0">
              <th scope="row" className="sticky left-0 z-10 border-b border-line/70 bg-panel px-3 py-3 text-left text-sm font-semibold text-fg-2">{row.label}</th>
              {plans.map((plan) => (
                <td key={plan.id} className="border-b border-line/70 px-3 py-3 font-bold tabular-nums text-fg">{row.value(plan)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
