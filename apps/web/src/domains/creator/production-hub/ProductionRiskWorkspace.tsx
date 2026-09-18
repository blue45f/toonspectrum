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
  ChevronLeft,
  CircleAlert,
  Clock3,
  Filter,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  evaluateProductionRisks,
  type ProductionProjectAggregate,
  type ProductionRisk,
  type ProductionRiskCategory,
  type ProductionRiskPolicy,
  type ProductionRiskSeverity,
  type ProductionRiskSignal,
  type ProductionRiskStatus,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";
import { ProductionRiskEditorDialog } from "./ProductionRiskEditorDialog";
import { ProductionRiskResponseCard } from "./ProductionRiskResponseCard";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

interface ProductionRiskWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly canManage: boolean;
  readonly now?: Date;
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
type DetailTab = "overview" | "evidence" | "impact" | "response" | "history";
type NumericRiskPolicyKey =
  | "dueSoonHours"
  | "blockedWarningHours"
  | "blockedCriticalHours"
  | "capacityWarningPercent"
  | "capacityCriticalPercent"
  | "defaultReviewSlaHours"
  | "minimumReadyBufferEpisodes"
  | "notificationCooldownHours"
  | "autoResolveStableHours";

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const CATEGORY_LABELS: Readonly<Record<ProductionRiskCategory, string>> = Object.freeze({
  story: "스토리",
  visual: "시각·작화",
  schedule: "일정",
  capacity: "인력·작업량",
  review: "검수",
  asset: "에셋",
  budget: "예산",
  rights: "권리·라이선스",
  contract: "계약·외주",
  platform: "게시·플랫폼",
  health: "휴식·연속성",
  security: "보안",
  communication: "소통·차단",
  technical: "기술",
});
const STATUS_LABELS: Readonly<Record<ProductionRiskStatus, string>> = Object.freeze({
  open: "새 위험",
  monitoring: "관찰 중",
  mitigating: "대응 중",
  occurred: "실제 발생",
  accepted: "위험 수용",
  resolved: "해결됨",
  dismissed: "오탐 처리",
  closed: "종료",
});
const SEVERITY_LABELS: Readonly<Record<ProductionRiskSeverity, string>> = Object.freeze({
  watch: "관찰",
  warning: "주의",
  high: "높음",
  critical: "긴급",
});
const ACTIVE_STATUSES = new Set<ProductionRiskStatus>(["open", "monitoring", "mitigating", "occurred"]);

function formatDate(value: string | null): string {
  if (!value) return "미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : "미정";
}

function toneClass(tone: Tone): string {
  return {
    neutral: "border-line bg-raised text-fg-2",
    accent: "border-accent/35 bg-accent-soft text-accent",
    success: "border-good/35 bg-good/10 text-good",
    warning: "border-warn/35 bg-warn/10 text-warn",
    danger: "border-bad/35 bg-bad/10 text-bad",
  }[tone];
}

function severityTone(severity: ProductionRiskSeverity): Tone {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "warning") return "warning";
  return "neutral";
}

function statusTone(status: ProductionRiskStatus): Tone {
  if (status === "occurred") return "danger";
  if (status === "mitigating" || status === "monitoring") return "warning";
  if (status === "resolved" || status === "closed") return "success";
  if (status === "accepted" || status === "dismissed") return "neutral";
  return "accent";
}

function Pill({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: Tone }) {
  return (
    <span className={cn(
      "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
      toneClass(tone),
    )}>
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly tone: Tone;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", toneClass(tone))}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">{label}</p>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-black text-fg">{value}</p>
      <p className="mt-1 text-xs leading-5 text-fg-2">{detail}</p>
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-fg">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-2">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function splitFilter(value: string | null): readonly string[] {
  return value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function riskOwnerName(aggregate: ProductionProjectAggregate, risk: ProductionRisk): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === risk.ownerAssignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : null;
  return party?.publicDisplayName ?? "담당자 미정";
}

function sourceSignal(
  signals: readonly ProductionRiskSignal[],
  risk: ProductionRisk,
): ProductionRiskSignal | null {
  return signals.find((signal) => risk.signalIds.includes(signal.id)) ?? null;
}

function RiskListRow({
  aggregate,
  risk,
  signal,
  selected,
  onSelect,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly risk: ProductionRisk;
  readonly signal: ProductionRiskSignal | null;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition-colors",
        selected ? "border-accent/50 bg-accent-soft" : "border-line bg-panel hover:border-accent/35 hover:bg-raised",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={severityTone(risk.severity)}>{SEVERITY_LABELS[risk.severity]}</Pill>
        <Pill tone={statusTone(risk.status)}>{STATUS_LABELS[risk.status]}</Pill>
        <Pill>{risk.source === "automatic" ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "자동 감지") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "직접 등록")}</Pill>
      </div>
      <p className="mt-3 text-sm font-black leading-5 text-fg">{risk.title}</p>
      <p className="mt-1 text-xs leading-5 text-fg-2">{risk.description}</p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-fg-3">
        <span>{CATEGORY_LABELS[risk.category]}</span>
        <span>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "우선순위 ")}{Math.round(risk.priorityScore)}</span>
        <span>{riskOwnerName(aggregate, risk)}</span>
        {risk.varianceHours !== null ? (
          <span>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "예상 ")}{risk.varianceHours >= 0 ? "+" : ""}{Math.round(risk.varianceHours)}h</span>
        ) : null}
      </div>
      {signal ? <p className="mt-2 text-[0.6875rem] leading-4 text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "마지막 평가 ")}{formatDate(signal.lastDetectedAt)}</p> : null}
    </button>
  );
}

function taskLabel(aggregate: ProductionProjectAggregate, taskId: string): string {
  return aggregate.tasks.find((task) => task.id === taskId)?.title ?? taskId;
}

function validateRiskPolicy(policy: ProductionRiskPolicy): string | null {
  if (policy.blockedWarningHours > policy.blockedCriticalHours) {
    return "차단 주의 기준은 차단 긴급 기준보다 클 수 없습니다.";
  }
  if (policy.capacityWarningPercent > policy.capacityCriticalPercent) {
    return "작업량 주의 기준은 작업량 긴급 기준보다 클 수 없습니다.";
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(policy.workdayEndLocal)) {
    return "업무 종료 시각은 00:00부터 23:59 사이여야 합니다.";
  }
  try {
    new Intl.DateTimeFormat("ko-KR", { timeZone: policy.timezone }).format(new Date());
  } catch {
    return "유효한 IANA 시간대 이름을 입력해 주세요. 예: Asia/Seoul";
  }
  return null;
}

function RiskDetail({
  aggregate,
  risk,
  signal,
  tab,
  setTab,
  execute,
  canEdit,
  canManage,
  actorAssignmentId,
  onEditRisk,
  onBack,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly risk: ProductionRisk;
  readonly signal: ProductionRiskSignal | null;
  readonly tab: DetailTab;
  readonly setTab: (tab: DetailTab) => void;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly canManage: boolean;
  readonly actorAssignmentId: string | null;
  readonly onEditRisk: () => void;
  readonly onBack: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const responses = aggregate.riskResponses.filter((response) => response.riskId === risk.id);
  const projectBase = `/production/projects/${encodeURIComponent(aggregate.projectId)}`;

  const trimmedReason = reason.trim();
  const requiresRecordedReason = (status: ProductionRiskStatus): boolean =>
    ["accepted", "dismissed", "resolved", "closed"].includes(status);

  const transition = async (toStatus: ProductionRiskStatus, fallbackReason: string) => {
    const transitionReason = trimmedReason || (requiresRecordedReason(toStatus) ? "" : fallbackReason);
    if (!canEdit || busy || !transitionReason) return;
    setBusy(true);
    try {
      await execute({
        type: "transition-risk",
        riskId: risk.id,
        toStatus,
        reason: transitionReason,
        expectedRiskRevision: risk.revision,
      }, `${risk.title} 상태를 ${STATUS_LABELS[toStatus]}으로 변경했습니다.`);
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  const createResponse = async (
    actionType: "split-task" | "reschedule" | "outsource" | "resolve-dependency" | "manual",
    title: string,
  ) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const now = new Date();
      await execute({
        type: "upsert-risk-response",
        response: {
          id: `risk-response:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          projectId: aggregate.projectId,
          riskId: risk.id,
          strategy: actionType === "outsource" ? "transfer" : "mitigate",
          actionType,
          title,
          description: reason.trim() || `${risk.title}의 영향을 줄이기 위한 운영 대응입니다.`,
          ownerAssignmentId: actorAssignmentId ?? risk.ownerAssignmentId,
          dueAt: risk.responseDueAt,
          linkedTaskId: risk.affectedTaskIds[0] ?? null,
          linkedChangeRequestId: null,
          linkedChangeOrderId: null,
          expectedEffect: risk.varianceHours
            ? `예상 초과 ${Math.round(risk.varianceHours)}시간 축소`
            : "차단 원인 또는 일정 위험 축소",
          actualEffect: null,
          status: "proposed",
          createdAt: now.toISOString(),
          completedAt: null,
        },
      }, `${title} 대응안을 등록했습니다.`);
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  const suppressSignal = async () => {
    if (!signal || !canManage || !actorAssignmentId || busy || !trimmedReason) return;
    setBusy(true);
    try {
      await execute({
        type: "suppress-risk-signal",
        signalId: signal.id,
        reason: trimmedReason,
        suppressedByAssignmentId: actorAssignmentId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      }, "위험 신호를 24시간 숨겼습니다.");
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  const tabs: readonly { readonly id: DetailTab; readonly label: string }[] = [
    { id: "overview", label: "개요" },
    { id: "evidence", label: "근거" },
    { id: "impact", label: "영향 경로" },
    { id: "response", label: "대응" },
    { id: "history", label: "변경 이력" },
  ];

  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-fg-3 hover:text-accent xl:hidden">
        <ChevronLeft className="size-4" aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 목록")}</button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Pill tone={severityTone(risk.severity)}>{SEVERITY_LABELS[risk.severity]}</Pill>
            <Pill tone={statusTone(risk.status)}>{STATUS_LABELS[risk.status]}</Pill>
            <Pill>{CATEGORY_LABELS[risk.category]}</Pill>
          </div>
          <h2 className="mt-3 text-xl font-black tracking-tight text-fg">{risk.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">{risk.description}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="text-right text-xs leading-5 text-fg-3">
            <p>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "우선순위 ")}<strong className="text-fg">{Math.round(risk.priorityScore)}</strong></p>
            <p>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "노출도 P")}{risk.probability} × I{risk.impact} = {risk.exposureScore}</p>
            <p>{riskOwnerName(aggregate, risk)}</p>
          </div>
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            disabled={!canEdit || busy}
            onClick={onEditRisk}
          >
            <Pencil className="size-4" aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 편집")}</button>
        </div>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1" role="tablist" aria-label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 상세 보기")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "min-h-9 shrink-0 rounded-lg px-3 text-xs font-bold",
              tab === item.id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "기준 마감")}</p><p className="mt-1 text-xs font-semibold text-fg">{formatDate(risk.baselineDueAt)}</p></div>
            <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "예상 완료")}</p><p className="mt-1 text-xs font-semibold text-fg">{formatDate(risk.forecastDueAt)}</p></div>
            <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "대응 기한")}</p><p className="mt-1 text-xs font-semibold text-fg">{formatDate(risk.responseDueAt)}</p></div>
            <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "최근 평가")}</p><p className="mt-1 text-xs font-semibold text-fg">{formatDate(risk.lastEvaluatedAt)}</p></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "조기 징후")}</p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-fg-2">
                {risk.earlySignals.length > 0
                  ? risk.earlySignals.slice(0, 8).map((entry) => <li key={entry} className="flex gap-2"><CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" /><span>{entry}</span></li>)
                  : <li>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "기록된 조기 징후가 없습니다.")}</li>}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "대응 계획")}</p>
              <p className="mt-2 text-xs leading-5 text-fg-2">{risk.mitigation || translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "대응 계획이 아직 없습니다.")}</p>
              <p className="mt-3 text-xs font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "비상 계획")}</p>
              <p className="mt-2 text-xs leading-5 text-fg-2">{risk.contingency || translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "비상 계획이 아직 없습니다.")}</p>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "evidence" ? (
        <div className="mt-4 space-y-2">
          {(signal?.evidence ?? []).map((item) => (
            <div key={item.key} className="grid gap-2 rounded-xl border border-line bg-panel p-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)] sm:items-center">
              <div><p className="text-xs font-bold text-fg">{item.label}</p><p className="mt-1 text-[0.6875rem] text-fg-3">{item.sourceType} · {item.sourceId}</p></div>
              <p className="text-xs font-black text-fg">{String(item.value ?? "미정")}{item.unit ? ` ${item.unit}` : ""}</p>
              <p className="text-[0.6875rem] text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "기준 ")}{String(item.threshold ?? "—")}</p>
            </div>
          ))}
          {!signal || signal.evidence.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "직접 등록 위험에는 자동 계산 근거가 없을 수 있습니다.")}</div> : null}
        </div>
      ) : null}

      {tab === "impact" ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="text-xs font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "영향받는 작업")}</p>
            <div className="mt-3 space-y-2">
              {risk.affectedTaskIds.map((taskId, index) => (
                <div key={taskId} className="flex items-center gap-2 text-xs text-fg-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-[0.625rem] font-black text-fg">{index + 1}</span>
                  <span className="font-semibold text-fg">{taskLabel(aggregate, taskId)}</span>
                  {index < risk.affectedTaskIds.length - 1 ? <ArrowRight className="ml-auto size-3.5 text-fg-3" aria-hidden="true" /> : null}
                </div>
              ))}
              {risk.affectedTaskIds.length === 0 ? <p className="text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "직접 연결된 작업이 없습니다.")}</p> : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-4"><p className="text-xs font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "영향 회차")}</p><p className="mt-2 text-xs leading-5 text-fg-2">{risk.affectedEpisodeIds.join(" · ") || translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "없음")}</p></div>
            <div className="rounded-xl border border-line bg-panel p-4"><p className="text-xs font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "계약 마일스톤")}</p><p className="mt-2 text-xs leading-5 text-fg-2">{risk.affectedMilestoneIds.join(" · ") || translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "없음")}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClass({ variant: "outline", size: "sm" })} to={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "{v0}/schedule"), { v0: String(projectBase) })}><CalendarClock className="size-4" aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "일정에서 보기")}</Link>
            <Link className={buttonClass({ variant: "outline", size: "sm" })} to={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "{v0}/production"), { v0: String(projectBase) })}><Workflow className="size-4" aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "작업 보드에서 보기")}</Link>
            {risk.affectedEpisodeIds[0] ? <Link className={buttonClass({ variant: "outline", size: "sm" })} to={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "{v0}/episodes/{v1}"), { v0: String(projectBase), v1: String(encodeURIComponent(risk.affectedEpisodeIds[0])) })}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "회차 열기")}</Link> : null}
          </div>
        </div>
      ) : null}

      {tab === "response" ? (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "판단·대응 사유")}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "왜 이 대응을 선택했는지 기록하세요.")}
              disabled={!canEdit || busy}
            />
          </label>
          <p className="text-[0.6875rem] leading-4 text-fg-3">
            {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 수용·오탐 처리·해결 확인·신호 숨김은 판단 사유를 입력해야 실행할 수 있습니다.")}</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} onClick={() => void createResponse("split-task", "작업 분할")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "작업 분할")}</button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} onClick={() => void createResponse("reschedule", "일정 조정")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "일정 조정")}</button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} onClick={() => void createResponse("resolve-dependency", "차단 해소")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "차단 해소")}</button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} onClick={() => void createResponse("outsource", "외주 전환 검토")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "외주 전환")}</button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {risk.status === "open" || risk.status === "monitoring" ? <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit || busy} onClick={() => void transition("mitigating", "대응을 시작합니다.")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "대응 시작")}</button> : null}
            {risk.status === "mitigating" || risk.status === "occurred" ? <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit || busy || !trimmedReason} onClick={() => void transition("resolved", "")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "해결 확인")}</button> : null}
            {risk.status === "resolved" || risk.status === "dismissed" || risk.status === "closed" ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} onClick={() => void transition("open", "조건이 변경되어 위험을 다시 엽니다.")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "다시 열기")}</button> : null}
            {["open", "monitoring", "mitigating", "occurred"].includes(risk.status) ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canManage || busy || !trimmedReason} onClick={() => void transition("accepted", "")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 수용")}</button> : null}
            {["open", "monitoring"].includes(risk.status) ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canManage || busy || !trimmedReason} onClick={() => void transition("dismissed", "")}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "오탐 처리")}</button> : null}
            {signal && signal.severity !== "critical" ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canManage || !actorAssignmentId || busy || !trimmedReason} onClick={() => void suppressSignal()}>{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "신호 24시간 숨김")}</button> : null}
          </div>
          <div className="space-y-2">
            {responses.map((response) => (
              <ProductionRiskResponseCard
                key={response.id}
                aggregate={aggregate}
                response={response}
                execute={execute}
                canEdit={canEdit}
                canManage={canManage}
              />
            ))}
            {responses.length === 0 ? <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "등록된 대응 항목이 없습니다.")}</div> : null}
          </div>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="mt-4 space-y-2">
          {aggregate.auditEvents
            .filter((event) => event.targetId === risk.id || risk.signalIds.includes(event.targetId))
            .slice()
            .reverse()
            .map((event) => (
              <div key={event.id} className="rounded-xl border border-line bg-panel p-3">
                <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-fg">{event.action}</p><span className="text-[0.6875rem] text-fg-3">r{event.aggregateRevision}</span></div>
                <p className="mt-1 text-[0.6875rem] text-fg-3">{formatDate(event.occurredAt)}{event.reason ? ` · ${event.reason}` : ""}</p>
              </div>
            ))}
          <div className="rounded-xl border border-line bg-panel p-3">
            <p className="text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 최초 감지")}</p>
            <p className="mt-1 text-[0.6875rem] text-fg-3">{formatDate(risk.detectedAt)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RiskPolicyPanel({
  policy,
  execute,
  canManage,
}: {
  readonly policy: ProductionRiskPolicy;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canManage: boolean;
}) {
  const [draft, setDraft] = useState(policy);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const validationError = validateRiskPolicy(draft);
  useEffect(() => {
    setDraft(policy);
    setSaveError(null);
  }, [policy]);

  const setNumber = (key: NumericRiskPolicyKey, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setDraft((current) => ({ ...current, [key]: parsed }));
  };

  const save = async () => {
    if (!canManage || saving) return;
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await execute({
        type: "update-risk-policy",
        policy: {
          ...draft,
          revision: policy.revision + 1,
          updatedAt: new Date().toISOString(),
        },
      }, "위험 감지 정책을 저장했습니다.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "위험 감지 정책을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const fields: readonly { readonly key: NumericRiskPolicyKey; readonly label: string; readonly suffix: string }[] = [
    { key: "dueSoonHours", label: "마감 임박", suffix: "시간" },
    { key: "blockedWarningHours", label: "차단 주의", suffix: "시간" },
    { key: "blockedCriticalHours", label: "차단 긴급", suffix: "시간" },
    { key: "capacityWarningPercent", label: "작업량 주의", suffix: "%" },
    { key: "capacityCriticalPercent", label: "작업량 긴급", suffix: "%" },
    { key: "defaultReviewSlaHours", label: "기본 검수 응답", suffix: "시간" },
    { key: "minimumReadyBufferEpisodes", label: "최소 준비 버퍼", suffix: "회" },
    { key: "notificationCooldownHours", label: "알림 재전송 간격", suffix: "시간" },
    { key: "autoResolveStableHours", label: "자동 해결 안정화", suffix: "시간" },
  ];

  return (
    <Section
      title={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "자동 감지 정책")}
      description={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "자동 오픈 기준, 안정화 시간, 알림 주기와 차단·작업량·검수·연재 버퍼 임계값을 조정합니다.")}
      action={<button type="button" className={buttonClass({ size: "sm" })} disabled={!canManage || saving || Boolean(validationError)} onClick={() => void save()}><SlidersHorizontal className="size-4" aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "정책 저장")}</button>}
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <label className="rounded-xl border border-line bg-panel p-3">
          <span className="text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "프로젝트 시간대")}</span>
          <input
            value={draft.timezone}
            onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
            disabled={!canManage}
            className="mt-2 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
            placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "Asia/Seoul")}
          />
        </label>
        <label className="rounded-xl border border-line bg-panel p-3">
          <span className="text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "업무 종료 시각")}</span>
          <input
            type="time"
            value={draft.workdayEndLocal}
            onChange={(event) => setDraft((current) => ({ ...current, workdayEndLocal: event.target.value }))}
            disabled={!canManage}
            className="mt-2 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="rounded-xl border border-line bg-panel p-3">
          <span className="text-xs font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "자동 위험 생성 기준")}</span>
          <select
            value={draft.autoOpenSeverity}
            onChange={(event) => setDraft((current) => ({ ...current, autoOpenSeverity: event.target.value as ProductionRiskPolicy["autoOpenSeverity"] }))}
            disabled={!canManage}
            className="mt-2 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg"
          >
            <option value="warning">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "주의 이상")}</option>
            <option value="high">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "높음 이상")}</option>
            <option value="critical">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "긴급만")}</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => (
          <label key={field.key} className="rounded-xl border border-line bg-panel p-3">
            <span className="text-xs font-bold text-fg">{field.label}</span>
            <span className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={field.key === "minimumReadyBufferEpisodes" ? 0 : 1}
                value={String(draft[field.key])}
                onChange={(event) => setNumber(field.key, event.target.value)}
                disabled={!canManage}
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1.5 text-sm font-bold text-fg outline-none focus:border-accent"
              />
              <span className="text-[0.6875rem] text-fg-3">{field.suffix}</span>
            </span>
          </label>
        ))}
      </div>
      {validationError || saveError ? (
        <div role="alert" className="mt-3 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs font-semibold text-bad">
          {saveError ?? validationError}
        </div>
      ) : null}
    </Section>
  );
}

export function ProductionRiskWorkspace({
  aggregate,
  execute,
  canEdit,
  canManage,
  now,
}: ProductionRiskWorkspaceProps) {
  const currentNow = useMemo(() => now ?? new Date(), [now]);
  const evaluation = useMemo(
    () => evaluateProductionRisks(aggregate, currentNow),
    [aggregate, currentNow],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProductionRisk | null>(null);
  const userId = useApp((state) => state.userId);
  const actorPartyId = aggregate.parties.find((party) => party.accountUserId === userId)?.id ?? null;
  const actorAssignment = aggregate.assignments.find((assignment) =>
    assignment.partyId === actorPartyId && assignment.status === "active")
    ?? (aggregate.projectId === "sample-project"
      ? aggregate.assignments.find((assignment) => assignment.roleType === "producer" && assignment.status === "active")
      : null);

  const severityFilters = splitFilter(searchParams.get("severity")) as readonly ProductionRiskSeverity[];
  const statusFilters = splitFilter(searchParams.get("status")) as readonly ProductionRiskStatus[];
  const categoryFilters = splitFilter(searchParams.get("category")) as readonly ProductionRiskCategory[];
  const sourceFilter = searchParams.get("source");
  const search = searchParams.get("q")?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const selectedRiskId = searchParams.get("risk");

  const filteredRisks = evaluation.risks.filter((risk) => {
    const signal = sourceSignal(evaluation.signals, risk);
    const statusMatch = statusFilters.length > 0
      ? statusFilters.includes(risk.status)
      : ACTIVE_STATUSES.has(risk.status) && signal?.state !== "suppressed";
    return statusMatch
      && (severityFilters.length === 0 || severityFilters.includes(risk.severity))
      && (categoryFilters.length === 0 || categoryFilters.includes(risk.category))
      && (!sourceFilter || sourceFilter === "all" || sourceFilter === risk.source)
      && (!search || `${risk.title} ${risk.description} ${risk.causeCodes.join(" ")}`.toLocaleLowerCase("ko-KR").includes(search));
  });
  const selectedRisk = evaluation.risks.find((risk) => risk.id === selectedRiskId)
    ?? filteredRisks[0]
    ?? null;
  const selectedSignal = selectedRisk ? sourceSignal(evaluation.signals, selectedRisk) : null;

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    if (key !== "risk") next.delete("risk");
    setSearchParams(next, { replace: true });
  };

  const selectRisk = (riskId: string) => {
    updateParam("risk", riskId);
    setMobileDetailOpen(true);
    setDetailTab("overview");
  };

  const refresh = async () => {
    if (!canEdit) return;
    await execute({ type: "evaluate-risks" }, "제작 데이터를 다시 평가했습니다.");
  };

  const openCreateRisk = () => {
    if (!canEdit) return;
    setEditingRisk(null);
    setEditorOpen(true);
  };

  const openEditRisk = (risk: ProductionRisk) => {
    if (!canEdit) return;
    setEditingRisk(risk);
    setEditorOpen(true);
  };

  const saveRisk = async (risk: ProductionRisk) => {
    const editing = Boolean(editingRisk);
    await execute(
      { type: "upsert-risk", risk },
      editing ? "위험 항목 변경을 저장했습니다." : "새 위험 항목을 등록했습니다.",
    );
    selectRisk(risk.id);
  };

  const nextDeadlineRisk = evaluation.risks.find((risk) =>
    ACTIVE_STATUSES.has(risk.status) && risk.category === "schedule");

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-accent/30 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "자동 위험 감지")}</Pill>
              <Pill tone={evaluation.summary.critical > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "danger") : evaluation.summary.high > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "warning") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "success")}>
                {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "마지막 평가 ")}{formatDate(evaluation.evaluatedAt)}
              </Pill>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험·병목")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
              {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "마감 초과 전에 예상 지연과 병목을 발견하고, 근거·영향 경로·대응 결과를 한곳에서 관리합니다.")}</p>
            {nextDeadlineRisk ? <p className="mt-2 text-xs leading-5 text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "가장 먼저 확인할 항목 · ")}{nextDeadlineRisk.title}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit} onClick={() => void refresh()}><RefreshCw className="size-4" aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "다시 평가")}</button>
            <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit} onClick={openCreateRisk}><Plus className="size-4" aria-hidden="true" /> {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 직접 등록")}</button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "긴급")} value={String(evaluation.summary.critical)} detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "지금 조치가 필요한 위험")} icon={ShieldAlert} tone={evaluation.summary.critical > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "danger") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "success")} />
        <MetricCard label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "높은 위험")} value={String(evaluation.summary.high)} detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "게시·후행 작업 영향 가능")} icon={AlertTriangle} tone={evaluation.summary.high > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "warning") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "success")} />
        <MetricCard label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "실제 초과")} value={String(evaluation.summary.actualOverdue)} detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "마감을 지난 미완료 항목")} icon={Clock3} tone={evaluation.summary.actualOverdue > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "danger") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "success")} />
        <MetricCard label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "예상 초과")} value={String(evaluation.summary.forecastSlip)} detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "현재 속도 기준 마감 초과")} icon={CalendarClock} tone={evaluation.summary.forecastSlip > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "warning") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "success")} />
        <MetricCard label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "차단 장기화")} value={String(evaluation.summary.blocked)} detail={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "정책 기준을 넘긴 차단")} icon={Workflow} tone={evaluation.summary.blocked > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "warning") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "success")} />
        <MetricCard label={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "영향 회차")} value={String(evaluation.summary.affectedEpisodeCount)} detail={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "일정 신뢰도 {v0}"), { v0: String(evaluation.schedule.confidence) })} icon={ListChecks} tone={evaluation.summary.affectedEpisodeCount > 0 ? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "accent") : translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "success")} />
      </div>

      <Section
        title={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 필터")}
        description={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "기본값은 현재 대응이 필요한 위험만 보여 줍니다. 종료된 항목은 상태 필터에서 선택합니다.")}
        action={<Filter className="size-4 text-fg-3" aria-hidden="true" />}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block"><span className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "검색")}</span><input value={searchParams.get("q") ?? ""} onChange={(event) => updateParam("q", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg outline-none focus:border-accent" placeholder={translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "제목·원인 검색")} /></label>
          <label className="block"><span className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험도")}</span><select value={searchParams.get("severity") ?? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "all")} onChange={(event) => updateParam("severity", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg"><option value="all">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "전체")}</option><option value="critical">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "긴급")}</option><option value="high">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "높음")}</option><option value="warning">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "주의")}</option><option value="watch">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "관찰")}</option></select></label>
          <label className="block"><span className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "상태")}</span><select value={searchParams.get("status") ?? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "all")} onChange={(event) => updateParam("status", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg"><option value="all">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "활성 위험")}</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block"><span className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "유형")}</span><select value={searchParams.get("category") ?? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "all")} onChange={(event) => updateParam("category", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg"><option value="all">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "전체")}</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block"><span className="text-[0.6875rem] font-bold text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "등록 방식")}</span><select value={searchParams.get("source") ?? translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "en", "all")} onChange={(event) => updateParam("source", event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg"><option value="all">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "전체")}</option><option value="automatic">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "자동 감지")}</option><option value="manual">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "직접 등록")}</option></select></label>
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.4fr)]">
        <section className={cn("rounded-2xl border border-line bg-card p-4", mobileDetailOpen && "hidden xl:block")}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "위험 목록")}</h2><p className="mt-1 text-xs text-fg-3">{filteredRisks.length}{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "건 · 운영 우선순위순")}</p></div>
            <Pill>{evaluation.risks.filter((risk) => ACTIVE_STATUSES.has(risk.status)).length} {translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "활성")}</Pill>
          </div>
          <div className="space-y-2">
            {filteredRisks.map((risk) => (
              <RiskListRow
                key={risk.id}
                aggregate={aggregate}
                risk={risk}
                signal={sourceSignal(evaluation.signals, risk)}
                selected={selectedRisk?.id === risk.id}
                onSelect={() => selectRisk(risk.id)}
              />
            ))}
            {filteredRisks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-8 text-center">
                <CheckCircle2 className="mx-auto size-8 text-good" aria-hidden="true" />
                <p className="mt-3 text-sm font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "조건에 맞는 위험이 없습니다")}</p>
                <p className="mt-1 text-xs text-fg-3">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "필터를 바꾸거나 제작 데이터를 다시 평가해 보세요.")}</p>
              </div>
            ) : null}
          </div>
        </section>

        <div className={cn(!mobileDetailOpen && "hidden xl:block")}>
          {selectedRisk ? (
            <RiskDetail
              aggregate={aggregate}
              risk={selectedRisk}
              signal={selectedSignal}
              tab={detailTab}
              setTab={setDetailTab}
              execute={execute}
              canEdit={canEdit}
              canManage={canManage}
              actorAssignmentId={actorAssignment?.id ?? null}
              onEditRisk={() => openEditRisk(selectedRisk)}
              onBack={() => setMobileDetailOpen(false)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
              <BadgeCheck className="mx-auto size-9 text-good" aria-hidden="true" />
              <p className="mt-3 text-sm font-black text-fg">{translateCurrentStaticSourceText("domains.creator.production.hub.ProductionRiskWorkspace", "ko", "확인할 위험을 선택해 주세요")}</p>
            </div>
          )}
        </div>
      </div>

      <RiskPolicyPanel policy={aggregate.riskPolicy} execute={execute} canManage={canManage} />
      <ProductionRiskEditorDialog
        open={editorOpen}
        aggregate={aggregate}
        risk={editingRisk}
        defaultOwnerAssignmentId={actorAssignment?.id ?? null}
        onClose={() => setEditorOpen(false)}
        onSave={saveRisk}
      />
    </div>
  );
}
