import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FlaskConical,
  GitBranch,
  LoaderCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  Undo2,
  UserPlus,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type {
  ProductionProjectAggregate,
  ProductionTask,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";
import type { ProductionRiskIntelligence } from "./production-risk-intelligence";
import {
  deriveProductionRecoveryScenarios,
  type ProductionRecoveryScenario,
  type ProductionRecoveryScenarioKind,
} from "./production-risk-scenarios";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface AppliedRecoveryScenario {
  readonly scenarioId: string;
  readonly title: string;
  readonly originalTasks: readonly ProductionTask[];
}

interface ProductionRecoveryScenarioPanelProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly intelligence: ProductionRiskIntelligence;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly now?: Date;
}

type ScenarioTone = "accent" | "success" | "warning" | "neutral";

const KIND_COPY: Readonly<Record<ProductionRecoveryScenarioKind, {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly tone: ScenarioTone;
}>> = Object.freeze({
  "extend-deadline": { label: "일정 재조정", icon: CalendarClock, tone: "accent" },
  "add-support": { label: "지원 배정", icon: UserPlus, tone: "success" },
  "resolve-blocker": { label: "차단 해소", icon: ShieldCheck, tone: "warning" },
  "fast-track-dependency": { label: "선행 우선", icon: GitBranch, tone: "warning" },
  "split-scope": { label: "범위 분할", icon: Scale, tone: "accent" },
});

function toneClass(tone: ScenarioTone): string {
  return {
    accent: "border-accent/35 bg-accent-soft text-accent",
    success: "border-good/35 bg-good/10 text-good",
    warning: "border-warn/35 bg-warn/10 text-warn",
    neutral: "border-line bg-raised text-fg-2",
  }[tone];
}

function taskById(
  aggregate: ProductionProjectAggregate,
  taskId: string,
): ProductionTask | null {
  return aggregate.tasks.find((task) => task.id === taskId) ?? null;
}

function metricTone(before: number, after: number): string {
  if (after < before) return "text-good";
  if (after > before) return "text-bad";
  return "text-fg";
}

function MetricComparison({
  label,
  before,
  after,
  suffix = "",
}: {
  readonly label: string;
  readonly before: number;
  readonly after: number;
  readonly suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <p className="text-[0.625rem] font-bold text-fg-3">{label}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-black">
        <span className="text-fg-3">{before}{suffix}</span>
        <ArrowRight className="size-3.5 text-fg-3" aria-hidden="true" />
        <span className={metricTone(before, after)}>{after}{suffix}</span>
      </p>
    </div>
  );
}

function scenarioBenefit(scenario: ProductionRecoveryScenario): string {
  const benefits: string[] = [];
  const delayDelta = scenario.baseline.projectedDelayDays - scenario.projected.projectedDelayDays;
  const scoreDelta = scenario.baseline.riskScore - scenario.projected.riskScore;
  const highDelta = scenario.baseline.criticalHighCount - scenario.projected.criticalHighCount;
  if (delayDelta > 0) benefits.push(`예상 지연 ${delayDelta}일 감소`);
  if (scoreDelta > 0) benefits.push(`위험 점수 ${scoreDelta}점 감소`);
  if (highDelta > 0) benefits.push(`프로젝트 고위험 ${highDelta}건 감소`);
  return benefits.length > 0 ? benefits.join(" · ") : "직접 수치보다 작업 시작 조건과 추적 가능성을 개선합니다.";
}

export function ProductionRecoveryScenarioPanel({
  aggregate,
  intelligence,
  execute,
  canEdit,
  now,
}: ProductionRecoveryScenarioPanelProps) {
  const selectableSignals = useMemo(() => intelligence.signals.filter((signal) =>
    signal.source === "derived"
    && signal.taskId
    && (signal.severity === "critical" || signal.severity === "high" || signal.severity === "medium"))
    .slice(0, 20), [intelligence.signals]);
  const [selectedSignalId, setSelectedSignalId] = useState(selectableSignals[0]?.id ?? "");
  const [applyingScenarioId, setApplyingScenarioId] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [lastApplied, setLastApplied] = useState<AppliedRecoveryScenario | null>(null);
  const selectedSignal = selectableSignals.find((signal) => signal.id === selectedSignalId)
    ?? selectableSignals[0]
    ?? null;

  useEffect(() => {
    if (!selectedSignal && selectableSignals[0]) {
      setSelectedSignalId(selectableSignals[0].id);
      return;
    }
    if (selectedSignal && selectedSignal.id !== selectedSignalId) {
      setSelectedSignalId(selectedSignal.id);
    }
  }, [selectableSignals, selectedSignal, selectedSignalId]);

  const scenarios = useMemo(() => selectedSignal
    ? deriveProductionRecoveryScenarios(aggregate, {
        signal: selectedSignal,
        intelligence,
        now: now ?? new Date(),
      })
    : [], [aggregate, intelligence, now, selectedSignal]);

  const applyScenario = async (scenario: ProductionRecoveryScenario) => {
    if (!canEdit || !scenario.canApplyDirectly || applyingScenarioId || undoing) return;
    const changes = scenario.taskUpdates.map((update) => {
      const task = taskById(aggregate, update.taskId);
      return task ? { original: task, next: { ...task, ...update.patch } } : null;
    }).filter((entry): entry is { original: ProductionTask; next: ProductionTask } => entry !== null);
    if (changes.length !== scenario.taskUpdates.length || changes.length === 0) return;
    setApplyingScenarioId(scenario.id);
    try {
      for (const [index, change] of changes.entries()) {
        await execute({
          type: "upsert-task",
          task: change.next,
        }, index === changes.length - 1
          ? `${scenario.title} 복구 시나리오를 적용했습니다.`
          : `${scenario.title} 변경 ${index + 1}/${changes.length}을 적용했습니다.`);
      }
      setLastApplied({
        scenarioId: scenario.id,
        title: scenario.title,
        originalTasks: changes.map((change) => change.original),
      });
    } finally {
      setApplyingScenarioId(null);
    }
  };

  const undoLastScenario = async () => {
    if (!canEdit || !lastApplied || applyingScenarioId || undoing) return;
    setUndoing(true);
    try {
      for (const [index, task] of lastApplied.originalTasks.entries()) {
        await execute({ type: "upsert-task", task }, index === lastApplied.originalTasks.length - 1
          ? `${lastApplied.title} 복구 시나리오를 되돌렸습니다.`
          : `${lastApplied.title} 복원 ${index + 1}/${lastApplied.originalTasks.length}을 적용했습니다.`);
      }
      setLastApplied(null);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <section
      id="production-recovery-scenarios"
      aria-labelledby="production-recovery-scenarios-heading"
      className="scroll-mt-4 overflow-hidden rounded-2xl border border-line bg-card"
      data-production-recovery-scenarios
    >
      <header className="border-b border-line bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-accent">
              <FlaskConical className="size-4" aria-hidden="true" />
              <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "en", "Recovery Scenario Lab")}</p>
            </div>
            <h2 id="production-recovery-scenarios-heading" className="mt-2 text-lg font-black text-fg">
              {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "복구 시나리오 비교")}</h2>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "일정·지원 인력·차단 해소·선행 작업·범위 분할을 원본 데이터에 적용하지 않고 먼저 계산합니다. 안전하게 되돌릴 수 있는 변경만 사용자 확인 후 적용할 수 있습니다.")}</p>
          </div>
          {selectableSignals.length > 0 ? (
            <label className="flex min-h-10 min-w-0 max-w-full items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2 sm:min-w-72">
              <Workflow className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
              <span className="sr-only">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "시나리오를 비교할 위험")}</span>
              <select
                aria-label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "시나리오를 비교할 위험")}
                value={selectedSignal?.id ?? ""}
                onChange={(event) => setSelectedSignalId(event.target.value)}
                className="min-w-0 flex-1 truncate bg-transparent font-semibold text-fg outline-none"
              >
                {selectableSignals.map((signal) => (
                  <option key={signal.id} value={signal.id}>{signal.title}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>

      {lastApplied ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-good/25 bg-good/10 px-4 py-3 sm:px-5" role="status">
          <div className="min-w-0">
            <p className="text-xs font-black text-fg">{lastApplied.title} {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "적용됨")}</p>
            <p className="mt-1 text-[0.6875rem] leading-5 text-fg-2">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "원래 업무 상태를 보관했습니다. 결과를 확인한 뒤 같은 자리에서 되돌릴 수 있습니다.")}</p>
          </div>
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "{v0} 복구 시나리오 되돌리기"), { v0: String(lastApplied.title) })}
            disabled={!canEdit || applyingScenarioId !== null || undoing}
            onClick={() => void undoLastScenario()}
          >
            {undoing ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Undo2 className="size-4" aria-hidden="true" />}
            {undoing ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "되돌리는 중…") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "적용 취소")}
          </button>
        </div>
      ) : null}

      {selectedSignal && scenarios.length > 0 ? (
        <div className="grid gap-3 p-4 lg:grid-cols-2 sm:p-5" aria-live="polite">
          {scenarios.map((scenario) => {
            const copy = KIND_COPY[scenario.kind];
            const Icon = copy.icon;
            const applying = applyingScenarioId === scenario.id;
            return (
              <article key={scenario.id} className="flex min-w-0 flex-col rounded-2xl border border-line bg-panel p-4">
                <header className="flex min-w-0 items-start gap-3">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl border", toneClass(copy.tone))}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold", toneClass(copy.tone))}>{copy.label}</span>
                      <span className="text-[0.625rem] font-semibold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "효과 점수 ")}{scenario.improvementScore}</span>
                    </div>
                    <h3 className="mt-2 break-words text-sm font-black leading-5 text-fg">{scenario.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-fg-2">{scenario.description}</p>
                  </div>
                </header>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MetricComparison label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "위험 점수")} before={scenario.baseline.riskScore} after={scenario.projected.riskScore} />
                  <MetricComparison label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "예상 지연")} before={scenario.baseline.projectedDelayDays} after={scenario.projected.projectedDelayDays} suffix={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "일")} />
                  <MetricComparison label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "긴급·높음")} before={scenario.baseline.criticalHighCount} after={scenario.projected.criticalHighCount} suffix={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "건")} />
                  <MetricComparison label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "예측 초과")} before={scenario.baseline.predictedOverrunTaskCount} after={scenario.projected.predictedOverrunTaskCount} suffix={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "건")} />
                </div>

                <div className="mt-3 rounded-xl border border-good/25 bg-good/10 p-3">
                  <p className="flex items-center gap-2 text-[0.6875rem] font-black text-fg">
                    <Sparkles className="size-3.5 text-good" aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "예상 개선")}</p>
                  <p className="mt-1 text-[0.6875rem] leading-5 text-fg-2">{scenarioBenefit(scenario)}</p>
                </div>

                <ul className="mt-3 space-y-1 text-[0.6875rem] leading-5 text-fg-2">
                  {scenario.rationale.map((reason) => (
                    <li key={reason} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 rounded-xl border border-warn/25 bg-warn/10 p-3 text-[0.6875rem] leading-5 text-fg-2">
                  <strong className="text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "적용 전 확인:")}</strong> {scenario.caution}
                </p>

                <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                  <Link className={buttonClass({ variant: "outline", size: "sm" })} to={scenario.relatedHref}>
                    {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "관련 작업 열기 ")}<ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                  {scenario.canApplyDirectly ? (
                    <button
                      type="button"
                      className={buttonClass({ size: "sm" })}
                      aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "{v0} 복구 시나리오 적용"), { v0: String(scenario.title) })}
                      disabled={!canEdit || applyingScenarioId !== null || undoing}
                      onClick={() => void applyScenario(scenario)}
                    >
                      {applying ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                      {applying ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "적용 중…") : canEdit ? scenario.applyLabel : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "편집 권한 필요")}
                    </button>
                  ) : (
                    <span className="rounded-full border border-line bg-raised px-2 py-1 text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "미리보기 전용")}</span>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-10 text-center">
          <CheckCircle2 className="mx-auto size-8 text-good" aria-hidden="true" />
          <p className="mt-3 text-sm font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "비교할 복구 시나리오가 없습니다")}</p>
          <p className="mt-1 text-xs leading-5 text-fg-2">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRecoveryScenarioPanel", "ko", "작업에 마감·공수·담당자·선행 관계가 연결되면 자동으로 후보를 계산합니다.")}</p>
        </div>
      )}
    </section>
  );
}
