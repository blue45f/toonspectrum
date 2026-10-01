import { AlertTriangle, Bug, ChevronDown, FileCode2, FileText, TestTube2, Workflow, type LucideIcon } from "lucide-react";

import { EngineeringStatusBadge } from "./EngineeringStoryUi";
import type { IncidentView, RowTone } from "./engineering-incidents";
import type { EngineeringEvidenceKind } from "./engineering-story-content";

import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringIncidents", ko, en);

/** 장애 기록 카드(접힘). 변환은 engineering-incidents.ts가 담당한다. */

const TONE_STYLES: Record<RowTone, string> = {
  bad: "border-bad/30 bg-bad/8 [&_dt]:text-bad",
  warn: "border-warn/30 bg-warn/8 [&_dt]:text-warn",
  neutral: "border-line bg-card/65 [&_dt]:text-fg-2",
  accent: "border-accent/30 bg-accent-soft/20 [&_dt]:text-accent",
  good: "border-good/30 bg-good/8 [&_dt]:text-good",
  cool: "border-cool/30 bg-cool/8 [&_dt]:text-cool",
};

const EVIDENCE_ICONS: Record<EngineeringEvidenceKind, LucideIcon> = {
  code: FileCode2,
  test: TestTube2,
  workflow: Workflow,
  document: FileText,
};

export function EngineeringIncidentCard({ incident, index }: { readonly incident: IncidentView; readonly index: number }) {
  useBilingualI18nRevision();
  return (
    <details id={incident.id} data-eng-disclosure="" className="group scroll-mt-32 rounded-3xl border border-line/70 bg-panel/55 shadow-sm open:bg-panel/75">
      <summary className="grid min-h-16 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-3xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-5 [&::-webkit-details-marker]:hidden">
        <span className="grid size-10 place-items-center rounded-2xl border border-bad/30 bg-bad/10 text-bad">
          <Bug size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-[0.64rem] font-black uppercase tracking-[0.14em] text-fg-3">
            {String(index + 1).padStart(2, "0")}{incident.area ? ` · ${bi(incident.area.ko, incident.area.en)}` : ""}
          </span>
          <span className="mt-1 block text-base font-black leading-6 text-fg sm:text-lg">{bi(incident.title.ko, incident.title.en)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="max-sm:hidden"><EngineeringStatusBadge status={incident.status} /></span>
          <ChevronDown size={17} className="text-accent transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </span>
      </summary>
      <div className="border-t border-line/70 p-4 sm:p-5">
        <dl className="grid gap-3 lg:grid-cols-2">
          {incident.rows.map((row) => (
            <div key={row.key} className={cx("rounded-2xl border p-4", TONE_STYLES[row.tone])}>
              <dt className="flex items-center gap-2 text-[0.66rem] font-black uppercase tracking-[0.13em]">
                {row.key === "symptom" ? <AlertTriangle size={13} aria-hidden="true" /> : null}
                {bi(row.label.ko, row.label.en)}
              </dt>
              <dd className="mt-2 text-xs leading-6 text-fg-2">{bi(row.text.ko, row.text.en)}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 grid gap-2 lg:grid-cols-2">
          {incident.evidence.map((entry) => {
            const Icon = EVIDENCE_ICONS[entry.kind];
            return (
              <li key={`${entry.kind}-${entry.path}`} className="flex min-w-0 items-start gap-3 rounded-2xl border border-line/70 bg-card/65 p-3">
                <Icon size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-fg">{bi(entry.label.ko, entry.label.en)}</span>
                  <code className="eng-code mt-1 block overflow-x-auto whitespace-nowrap rounded-lg px-2 py-1 font-mono text-[0.66rem]">{entry.path}</code>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
