import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  FileWarning,
  Gauge,
  GitBranch,
  LoaderCircle,
  Radar,
  ShieldAlert,
  UserRoundX,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { ProductionClientCommand } from "./production-api";
import {
  predictiveSignalToProductionRisk,
  type ProductionRiskIntelligence,
  type ProductionRiskSignal,
  type ProductionRiskSignalKind,
  type ProductionRiskSignalSeverity,
} from "./production-risk-intelligence";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface ProductionRiskIntelligencePanelProps {
  readonly intelligence: ProductionRiskIntelligence;
  readonly projectId: string;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
}

type RiskFilter = "all" | "critical" | "schedule" | "capacity" | "integrity";
type RiskTone = "danger" | "warning" | "accent" | "neutral" | "success";

const FILTERS: readonly { readonly id: RiskFilter; readonly label: string }[] = [
  { id: "all", label: "전체" },
  { id: "critical", label: "긴급·높음" },
  { id: "schedule", label: "마감·의존성" },
  { id: "capacity", label: "배정·용량" },
  { id: "integrity", label: "검수·연결" },
];

const KIND_COPY: Readonly<Record<ProductionRiskSignalKind, {
  readonly label: string;
  readonly icon: LucideIcon;
}>> = Object.freeze({
  blocker: { label: "차단", icon: ShieldAlert },
  "deadline-overrun": { label: "마감 예측", icon: CalendarClock },
  "dependency-chain": { label: "의존성", icon: GitBranch },
  capacity: { label: "용량", icon: Gauge },
  uncertainty: { label: "공수 편차", icon: CircleHelp },
  "review-bottleneck": { label: "검수 병목", icon: Workflow },
  "revision-gap": { label: "Revision 연결", icon: FileWarning },
  "release-buffer": { label: "연재 버퍼", icon: Radar },
  registered: { label: "등록 위험", icon: BadgeCheck },
});

const SEVERITY_LABELS: Readonly<Record<ProductionRiskSignalSeverity, string>> = Object.freeze({
  critical: "긴급",
  high: "높음",
  medium: "주의",
  low: "관찰",
});

const CONFIDENCE_LABELS = Object.freeze({
  high: "신뢰도 높음",
  medium: "신뢰도 보통",
  low: "신뢰도 낮음",
});

function toneForSeverity(severity: ProductionRiskSignalSeverity): RiskTone {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  if (severity === "medium") return "accent";
  return "neutral";
}

function toneClass(tone: RiskTone): string {
  return {
    danger: "border-bad/35 bg-bad/10 text-bad",
    warning: "border-warn/35 bg-warn/10 text-warn",
    accent: "border-accent/35 bg-accent-soft text-accent",
    neutral: "border-line bg-raised text-fg-2",
    success: "border-good/35 bg-good/10 text-good",
  }[tone];
}

function Pill({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: RiskTone }) {
  return (
    <span className={cn(
      "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
      toneClass(tone),
    )}>
      {children}
    </span>
  );
}

function filterMatches(signal: ProductionRiskSignal, filter: RiskFilter): boolean {
  if (filter === "all") return true;
  if (filter === "critical") return signal.severity === "critical" || signal.severity === "high";
  if (filter === "schedule") {
    return signal.kind === "deadline-overrun"
      || signal.kind === "dependency-chain"
      || signal.kind === "blocker"
      || signal.kind === "release-buffer";
  }
  if (filter === "capacity") return signal.kind === "capacity" || signal.kind === "uncertainty";
  return signal.kind === "review-bottleneck" || signal.kind === "revision-gap" || signal.kind === "registered";
}

function scoreBarClass(severity: ProductionRiskSignalSeverity): string {
  if (severity === "critical") return "bg-bad";
  if (severity === "high") return "bg-warn";
  if (severity === "medium") return "bg-accent";
  return "bg-fg-3";
}

function RiskMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly tone: RiskTone;
}) {
  return (
    <div className={cn("rounded-xl border p-3", toneClass(tone))}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.625rem] font-black uppercase tracking-[0.1em]">{label}</p>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p className="mt-1 text-xl font-black text-fg">{value}</p>
      <p className="mt-1 text-[0.6875rem] leading-4 text-fg-2">{detail}</p>
    </div>
  );
}

export function ProductionRiskIntelligencePanel({
  intelligence,
  projectId,
  execute,
  canEdit,
}: ProductionRiskIntelligencePanelProps) {
  const [filter, setFilter] = useState<RiskFilter>("all");
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const visibleSignals = useMemo(
    () => intelligence.signals.filter((signal) => filterMatches(signal, filter)).slice(0, 12),
    [filter, intelligence.signals],
  );

  const registerRisk = async (signal: ProductionRiskSignal) => {
    if (!canEdit || signal.source !== "derived" || signal.existingRiskId || registeringId) return;
    setRegisteringId(signal.id);
    try {
      const risk = predictiveSignalToProductionRisk(signal, projectId);
      await execute({
        type: "upsert-planning-record",
        record: { kind: "risk", value: risk },
      }, `${signal.title} 예측 신호를 제작 위험으로 등록했습니다.`);
    } finally {
      setRegisteringId(null);
    }
  };

  return (
    <section
      id="predictive-risk-intelligence"
      aria-labelledby="predictive-risk-heading"
      className="scroll-mt-4 overflow-hidden rounded-2xl border border-line bg-card"
      data-production-risk-intelligence
    >
      <header className="border-b border-line bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-accent">
              <Radar className="size-4" aria-hidden="true" />
              <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "Predictive Risk Intelligence")}</p>
            </div>
            <h2 id="predictive-risk-heading" className="mt-2 text-lg font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "예측 리스크 레이더")}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "이미 늦은 작업뿐 아니라 남은 공수, 담당자 가용량, 선행 작업, 검수, revision 연결과 연재 버퍼를 함께 계산합니다. 결과는 규칙 기반 설명이며, 자동으로 담당자나 일정을 바꾸지 않습니다.")}</p>
          </div>
          <Link className={buttonClass({ variant: "outline", size: "sm" })} to={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "/production/projects/{v0}/planning"), { v0: String(encodeURIComponent(projectId)) })}>
            {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "위험 원장 열기 ")}<ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <RiskMetric
            label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "긴급·높음")}
            value={intelligence.criticalCount + intelligence.highCount}
            detail={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "긴급 {v0} · 높음 {v1}"), { v0: String(intelligence.criticalCount), v1: String(intelligence.highCount) })}
            icon={AlertTriangle}
            tone={intelligence.criticalCount > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "danger") : intelligence.highCount > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "warning") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "success")}
          />
          <RiskMetric
            label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "예측 마감 초과")}
            value={intelligence.predictedOverrunTaskCount}
            detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "현재 조건을 유지할 때 늦어질 작업")}
            icon={CalendarClock}
            tone={intelligence.predictedOverrunTaskCount > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "danger") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "success")}
          />
          <RiskMetric
            label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "의존성 병목")}
            value={intelligence.dependencyBottleneckCount}
            detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "선행 작업이 시작 시점을 제한")}
            icon={GitBranch}
            tone={intelligence.dependencyBottleneckCount > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "warning") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "success")}
          />
          <RiskMetric
            label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "배정·용량")}
            value={intelligence.capacityRiskCount}
            detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "미배정 또는 담당자 과부하")}
            icon={UserRoundX}
            tone={intelligence.capacityRiskCount > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "warning") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "success")}
          />
          <RiskMetric
            label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "Revision 연결")}
            value={intelligence.revisionGapCount}
            detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "입력·산출물 추적 누락")}
            icon={FileWarning}
            tone={intelligence.revisionGapCount > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "warning") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "en", "success")}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1 rounded-xl border border-line bg-card p-1" role="group" aria-label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "예측 위험 필터")}>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              className={cn(
                "min-h-8 rounded-lg px-2.5 text-[0.6875rem] font-bold transition-colors",
                filter === item.id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-3 p-4 lg:grid-cols-2 sm:p-5" aria-live="polite">
        {visibleSignals.map((signal) => {
          const meta = KIND_COPY[signal.kind];
          const Icon = meta.icon;
          const tone = toneForSeverity(signal.severity);
          const registering = registeringId === signal.id;
          const registered = signal.source === "registered" || Boolean(signal.existingRiskId);
          return (
            <article key={signal.id} className="flex min-w-0 flex-col rounded-2xl border border-line bg-panel p-4">
              <header className="flex items-start gap-3">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border", toneClass(tone))}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={tone}>{SEVERITY_LABELS[signal.severity]}</Pill>
                    <Pill>{meta.label}</Pill>
                    <span className="text-[0.625rem] font-semibold text-fg-3">{CONFIDENCE_LABELS[signal.confidence]}</span>
                  </div>
                  <h3 className="mt-2 break-words text-sm font-black leading-5 text-fg">{signal.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-fg-2">{signal.summary}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-black text-fg">{signal.score}</p>
                  <p className="text-[0.625rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "위험 점수")}</p>
                </div>
              </header>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "{v0} 위험 점수 {v1}점"), { v0: String(signal.title), v1: String(signal.score) })}>
                <div className={cn("h-full rounded-full", scoreBarClass(signal.severity))} style={{ width: `${signal.score}%` }} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-card p-3">
                  <p className="text-[0.6875rem] font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "왜 위험한가")}</p>
                  <ul className="mt-2 space-y-1 text-[0.6875rem] leading-5 text-fg-2">
                    {signal.causes.slice(0, 3).map((cause) => <li key={cause}>• {cause}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl border border-line bg-card p-3">
                  <p className="text-[0.6875rem] font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "예상 영향")}</p>
                  <p className="mt-2 text-[0.6875rem] leading-5 text-fg-2">{signal.impact}</p>
                  {signal.projectedDelayDays ? (
                    <Pill tone="danger">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "예상 +")}{signal.projectedDelayDays}{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "일")}</Pill>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-accent/25 bg-accent-soft/40 p-3">
                <p className="text-[0.6875rem] font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "권장 대응")}</p>
                <ol className="mt-2 space-y-1 text-[0.6875rem] leading-5 text-fg-2">
                  {signal.mitigations.slice(0, 3).map((mitigation, index) => (
                    <li key={mitigation} className="flex gap-2">
                      <span className="font-black text-accent">{index + 1}</span>
                      <span>{mitigation}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                <Link className={buttonClass({ variant: "outline", size: "sm" })} to={signal.href}>
                  {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "관련 작업 열기 ")}<ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
                {signal.source === "derived" ? (
                  <button
                    type="button"
                    className={buttonClass({ size: "sm" })}
                    aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "{v0} 예측 신호를 제작 위험으로 등록"), { v0: String(signal.title) })}
                    disabled={!canEdit || registeringId !== null || registered}
                    onClick={() => void registerRisk(signal)}
                  >
                    {registering ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : registered ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <ShieldAlert className="size-4" aria-hidden="true" />}
                    {registering ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "등록 중…") : registered ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "위험 원장 등록됨") : canEdit ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "위험으로 등록") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "편집 권한 필요")}
                  </button>
                ) : (
                  <Pill tone="success"><CheckCircle2 className="mr-1 size-3" aria-hidden="true" />{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "위험 원장")}</Pill>
                )}
              </footer>
            </article>
          );
        })}

        {visibleSignals.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-line p-10 text-center">
            <CheckCircle2 className="mx-auto size-8 text-good" aria-hidden="true" />
            <p className="mt-3 text-sm font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "이 조건에서 감지된 예측 위험이 없습니다")}</p>
            <p className="mt-1 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskIntelligencePanel", "ko", "업무·일정·배정·revision 연결이 바뀌면 다시 계산합니다.")}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
