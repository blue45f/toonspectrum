import {
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";

import {
  STUDIO_COMPETITOR_CAPABILITY_EVALUATION,
  STUDIO_COMPETITOR_CAPABILITY_RECORDS,
} from "../studio-platform/studio-competitor-capability-evidence";

export type StudioCompetitorCapabilityLocale = "ko" | "en";

export function StudioCompetitorCapabilityPanel({
  locale,
  compact = false,
}: {
  readonly locale: StudioCompetitorCapabilityLocale;
  readonly compact?: boolean;
}) {
  const evaluation = STUDIO_COMPETITOR_CAPABILITY_EVALUATION;
  const pending = STUDIO_COMPETITOR_CAPABILITY_RECORDS.filter(
    (record) => record.externalValidationRequired,
  );

  return (
    <section
      className={cn(
        "mt-5 rounded-2xl border p-4 sm:p-5",
        evaluation.incompleteCount === 0
          ? "border-success/30 bg-success/5"
          : "border-danger/35 bg-danger/5",
      )}
      aria-labelledby="studio-competitor-capability-title"
      data-replacement-claim-allowed={String(evaluation.replacementClaimAllowed)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-success" aria-hidden="true" />
            <h2 id="studio-competitor-capability-title" className="text-sm font-black text-fg">
              {locale === "ko"
                ? "전문 제작 기능 구현·검증 원장"
                : "Professional production capability ledger"}
            </h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-fg-3">
            {locale === "ko"
              ? "계획한 57개 기능을 실제 제품 경로·저장·복구·호환·테스트 근거에 연결했습니다. 외부 실기기와 전문 작가 검증이 끝나기 전에는 ‘완전 대체’ 문구를 표시하지 않습니다."
              : "All 57 planned capabilities are connected to product, durability, compatibility and test evidence. A complete replacement claim stays disabled until independent device and creator validation is attached."}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-2" aria-label={locale === "ko" ? "검증 요약" : "Validation summary"}>
          <Metric
            value={evaluation.verifiedCount}
            label={locale === "ko" ? "검증됨" : "Verified"}
            tone="success"
          />
          <Metric
            value={evaluation.externalValidationPendingCount}
            label={locale === "ko" ? "외부 검증" : "External"}
            tone="warning"
          />
          <Metric
            value={evaluation.incompleteCount}
            label={locale === "ko" ? "구현 누락" : "Gaps"}
            tone={evaluation.incompleteCount === 0 ? "success" : "danger"}
          />
        </div>
      </div>

      {!compact && pending.length > 0 ? (
        <details className="group mt-4 rounded-xl border border-line bg-card/75">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
            <span className="inline-flex items-center gap-2">
              <FlaskConical size={15} className="text-warning" aria-hidden="true" />
              {locale === "ko"
                ? `외부 검증 대기 ${pending.length}건 보기`
                : `Show ${pending.length} pending external validations`}
            </span>
            <ChevronDown
              size={15}
              className="text-fg-3 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
            {pending.map((record) => {
              const note = record.evidence.find(
                (item) => item.dimension === "external-validation",
              )?.note;
              return (
                <li key={record.id} className="rounded-lg border border-line bg-panel/60 px-3 py-2">
                  <strong className="block text-xs text-fg">
                    {String(record.sequence).padStart(2, "0")} · {record.title}
                  </strong>
                  {note ? <span className="mt-1 block text-[0.68rem] leading-4 text-fg-3">{note}</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Metric({
  value,
  label,
  tone,
}: {
  readonly value: number;
  readonly label: string;
  readonly tone: "success" | "warning" | "danger";
}) {
  return (
    <span className={cn(
      "flex min-w-20 flex-col items-center rounded-xl border px-2 py-2",
      tone === "success" && "border-success/25 bg-success/10 text-success",
      tone === "warning" && "border-warning/25 bg-warning/10 text-warning",
      tone === "danger" && "border-danger/25 bg-danger/10 text-danger",
    )}>
      <span className="inline-flex items-center gap-1 text-lg font-black">
        {tone === "success" ? <CheckCircle2 size={14} aria-hidden="true" /> : null}
        {value}
      </span>
      <span className="mt-0.5 text-[0.62rem] font-bold">{label}</span>
    </span>
  );
}
