import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  Clock3,
  Copy,
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
  type ProductionRiskResponse,
  type ProductionRiskSeverity,
  type ProductionRiskSignal,
  type ProductionRiskStatus,
} from "@toonspectrum/core/production";

import type { ProductionClientCommand } from "./production-api";
import { ProductionRiskEditorDialog } from "./ProductionRiskEditorDialog";
import { ProductionRiskMultiFilter } from "./ProductionRiskMultiFilter";
import { ProductionRiskResponseCard } from "./ProductionRiskResponseCard";
import {
  normalizeProductionRiskSearchParams,
  parseProductionRiskUrlState,
  serializeProductionRiskUrlState,
  type ProductionRiskDetailTab,
  type ProductionRiskMatrixCell,
  type ProductionRiskUrlState,
  type ProductionRiskViewMode,
} from "./production-risk-url-state";
import {
  ProductionRiskEpisodeView,
  ProductionRiskMatrixView,
  ProductionRiskViewSwitcher,
} from "./ProductionRiskViews";

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
type NumericRiskPolicyKey =
  | "dueSoonHours"
  | "blockedWarningHours"
  | "blockedCriticalHours"
  | "capacityWarningPercent"
  | "capacityCriticalPercent"
  | "defaultReviewSlaHours"
  | "minimumReadyBufferEpisodes"
  | "notificationCooldownHours"
  | "autoOpenStableHours"
  | "thresholdHysteresisPercent"
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
const RULE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "task.overdue": "실제 마감 초과",
  "task.forecast-slip": "예상 마감 초과",
  "task.blocked-age": "차단 장기화",
  "capacity.due-gap": "마감 전 작업량",
  "assignment.unowned-due-soon": "담당자 미배정",
  "review.sla-breach": "검수 응답 초과",
  "episode.buffer-low": "연재 버퍼 부족",
  "asset.not-ready": "에셋 준비 지연",
  "milestone.overdue": "계약 마일스톤 초과",
  "preflight.blocker": "게시 사전 검사 차단",
  "dependency.cycle": "작업 의존성 순환",
  "data.low-confidence": "예측 정보 부족",
});
const ACTIVE_STATUSES = new Set<ProductionRiskStatus>(["open", "monitoring", "mitigating", "occurred"]);

type ResponseDraft = {
  readonly actionType: ProductionRiskResponse["actionType"];
  readonly title: string;
  readonly description: string;
  readonly ownerAssignmentId: string;
  readonly dueAt: string;
  readonly linkedTaskId: string;
  readonly expectedEffect: string;
};

function dateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoDateTimeValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

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

function productionEpisodeLabel(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
): string {
  const plan = aggregate.episodePlans.find((entry) => entry.episodeId === episodeId);
  if (plan) return `${plan.episodeNumber}화 · ${plan.title}`;
  const index = aggregate.episodes.findIndex((entry) => entry.episodeId === episodeId);
  return index >= 0 ? `${index + 1}화 · ${episodeId}` : episodeId;
}

function assignmentName(aggregate: ProductionProjectAggregate, assignmentId: string | null): string {
  if (!assignmentId) return "담당자 미정";
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : null;
  return party?.publicDisplayName ?? assignment?.publicCreditRole ?? assignmentId;
}

function riskOwnerName(aggregate: ProductionProjectAggregate, risk: ProductionRisk): string {
  return assignmentName(aggregate, risk.ownerAssignmentId);
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
        <Pill>{risk.source === "automatic" ? "자동 감지" : "직접 등록"}</Pill>
      </div>
      <p className="mt-3 text-sm font-black leading-5 text-fg">{risk.title}</p>
      <p className="mt-1 text-xs leading-5 text-fg-2">{risk.description}</p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-fg-3">
        <span>{CATEGORY_LABELS[risk.category]}</span>
        <span>우선순위 {Math.round(risk.priorityScore)}</span>
        <span>{riskOwnerName(aggregate, risk)}</span>
        {risk.varianceHours !== null ? (
          <span>예상 {risk.varianceHours >= 0 ? "+" : ""}{Math.round(risk.varianceHours)}h</span>
        ) : null}
      </div>
      {signal ? <p className="mt-2 text-[0.6875rem] leading-4 text-fg-3">마지막 평가 {formatDate(signal.lastDetectedAt)}</p> : null}
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
  if (policy.autoOpenStableHours < 0) {
    return "자동 생성 안정화 시간은 0 이상이어야 합니다.";
  }
  if (policy.thresholdHysteresisPercent < 0 || policy.thresholdHysteresisPercent > 50) {
    return "임계값 복귀 여유는 0%부터 50% 사이여야 합니다.";
  }
  if (policy.autoResolveStableHours < 1 || policy.notificationCooldownHours < 1) {
    return "자동 해결 안정화와 알림 재전송 간격은 1시간 이상이어야 합니다.";
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
  readonly tab: ProductionRiskDetailTab;
  readonly setTab: (tab: ProductionRiskDetailTab) => void;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly canManage: boolean;
  readonly actorAssignmentId: string | null;
  readonly onEditRisk: () => void;
  readonly onBack: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [responseDraft, setResponseDraft] = useState<ResponseDraft | null>(null);
  const responses = aggregate.riskResponses.filter((response) => response.riskId === risk.id);

  useEffect(() => {
    setReason("");
    setResponseDraft(null);
  }, [risk.id]);
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

  const startResponseDraft = (
    actionType: ResponseDraft["actionType"],
    title: string,
  ) => {
    setResponseDraft({
      actionType,
      title,
      description: `${risk.title}의 영향을 줄이기 위한 운영 대응입니다.`,
      ownerAssignmentId: actorAssignmentId ?? risk.ownerAssignmentId ?? "",
      dueAt: dateTimeLocalValue(risk.responseDueAt),
      linkedTaskId: risk.affectedTaskIds[0] ?? "",
      expectedEffect: risk.varianceHours
        ? `예상 초과 ${Math.round(risk.varianceHours)}시간 축소`
        : "차단 원인 또는 일정 위험 축소",
    });
  };

  const responseDraftValid = Boolean(
    responseDraft?.title.trim()
    && responseDraft.description.trim()
    && responseDraft.expectedEffect.trim(),
  );

  const createResponse = async () => {
    if (!canEdit || busy || !responseDraft || !responseDraftValid) return;
    setBusy(true);
    try {
      const now = new Date();
      await execute({
        type: "upsert-risk-response",
        response: {
          id: `risk-response:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
          projectId: aggregate.projectId,
          riskId: risk.id,
          revision: 1,
          strategy: responseDraft.actionType === "outsource" ? "transfer" : "mitigate",
          actionType: responseDraft.actionType,
          title: responseDraft.title.trim(),
          description: responseDraft.description.trim(),
          ownerAssignmentId: responseDraft.ownerAssignmentId || null,
          dueAt: isoDateTimeValue(responseDraft.dueAt),
          linkedTaskId: responseDraft.linkedTaskId || null,
          linkedChangeRequestId: null,
          linkedChangeOrderId: null,
          expectedEffect: responseDraft.expectedEffect.trim(),
          actualEffect: null,
          cancellationReason: null,
          status: "proposed",
          approvedAt: null,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      }, `${responseDraft.title.trim()} 대응안을 등록했습니다.`);
      setResponseDraft(null);
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

  const tabs: readonly { readonly id: ProductionRiskDetailTab; readonly label: string }[] = [
    { id: "overview", label: "개요" },
    { id: "evidence", label: "근거" },
    { id: "impact", label: "영향 경로" },
    { id: "response", label: "대응" },
    { id: "history", label: "변경 이력" },
  ];

  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-fg-3 hover:text-accent xl:hidden">
        <ChevronLeft className="size-4" aria-hidden="true" /> 위험 목록
      </button>
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
            <p>우선순위 <strong className="text-fg">{Math.round(risk.priorityScore)}</strong></p>
            <p>노출도 P{risk.probability} × I{risk.impact} = {risk.exposureScore}</p>
            <p>{riskOwnerName(aggregate, risk)}</p>
          </div>
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            disabled={!canEdit || busy}
            onClick={onEditRisk}
          >
            <Pencil className="size-4" aria-hidden="true" /> 위험 편집
          </button>
        </div>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="위험 상세 보기">
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
            <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] font-bold text-fg-3">기준 마감</p><p className="mt-1 text-xs font-semibold text-fg">{formatDate(risk.baselineDueAt)}</p></div>
            <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] font-bold text-fg-3">예상 완료</p><p className="mt-1 text-xs font-semibold text-fg">{formatDate(risk.forecastDueAt)}</p></div>
            <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] font-bold text-fg-3">대응 기한</p><p className="mt-1 text-xs font-semibold text-fg">{formatDate(risk.responseDueAt)}</p></div>
            <div className="rounded-xl border border-line bg-panel p-3"><p className="text-[0.6875rem] font-bold text-fg-3">최근 평가</p><p className="mt-1 text-xs font-semibold text-fg">{formatDate(risk.lastEvaluatedAt)}</p></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs font-black text-fg">조기 징후</p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-fg-2">
                {risk.earlySignals.length > 0
                  ? risk.earlySignals.slice(0, 8).map((entry) => <li key={entry} className="flex gap-2"><CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" /><span>{entry}</span></li>)
                  : <li>기록된 조기 징후가 없습니다.</li>}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="text-xs font-black text-fg">대응 계획</p>
              <p className="mt-2 text-xs leading-5 text-fg-2">{risk.mitigation || "대응 계획이 아직 없습니다."}</p>
              <p className="mt-3 text-xs font-black text-fg">비상 계획</p>
              <p className="mt-2 text-xs leading-5 text-fg-2">{risk.contingency || "비상 계획이 아직 없습니다."}</p>
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
              <p className="text-[0.6875rem] text-fg-3">기준 {String(item.threshold ?? "—")}</p>
            </div>
          ))}
          {!signal || signal.evidence.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-xs text-fg-3">직접 등록 위험에는 자동 계산 근거가 없을 수 있습니다.</div> : null}
        </div>
      ) : null}

      {tab === "impact" ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="text-xs font-black text-fg">영향받는 작업</p>
            <div className="mt-3 space-y-2">
              {risk.affectedTaskIds.map((taskId, index) => (
                <div key={taskId} className="flex items-center gap-2 text-xs text-fg-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-[0.625rem] font-black text-fg">{index + 1}</span>
                  <span className="font-semibold text-fg">{taskLabel(aggregate, taskId)}</span>
                  {index < risk.affectedTaskIds.length - 1 ? <ArrowRight className="ml-auto size-3.5 text-fg-3" aria-hidden="true" /> : null}
                </div>
              ))}
              {risk.affectedTaskIds.length === 0 ? <p className="text-xs text-fg-3">직접 연결된 작업이 없습니다.</p> : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-4"><p className="text-xs font-black text-fg">영향 회차</p><p className="mt-2 text-xs leading-5 text-fg-2">{risk.affectedEpisodeIds.join(" · ") || "없음"}</p></div>
            <div className="rounded-xl border border-line bg-panel p-4"><p className="text-xs font-black text-fg">계약 마일스톤</p><p className="mt-2 text-xs leading-5 text-fg-2">{risk.affectedMilestoneIds.join(" · ") || "없음"}</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/schedule`}><CalendarClock className="size-4" aria-hidden="true" /> 일정에서 보기</Link>
            <Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/production`}><Workflow className="size-4" aria-hidden="true" /> 작업 보드에서 보기</Link>
            {risk.affectedEpisodeIds[0] ? <Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/episodes/${encodeURIComponent(risk.affectedEpisodeIds[0])}`}>회차 열기</Link> : null}
          </div>
        </div>
      ) : null}

      {tab === "response" ? (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-fg">위험 상태 판단 사유</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              placeholder="수용·오탐·해결·신호 숨김의 판단 근거를 기록하세요."
              disabled={!canEdit || busy}
            />
          </label>
          <p className="text-[0.6875rem] leading-4 text-fg-3">
            위험 수용·오탐 처리·해결 확인·신호 숨김은 판단 사유를 입력해야 실행할 수 있습니다.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} aria-pressed={responseDraft?.actionType === "split-task"} onClick={() => startResponseDraft("split-task", "작업 분할")}>작업 분할</button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} aria-pressed={responseDraft?.actionType === "reschedule"} onClick={() => startResponseDraft("reschedule", "일정 조정")}>일정 조정</button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} aria-pressed={responseDraft?.actionType === "resolve-dependency"} onClick={() => startResponseDraft("resolve-dependency", "차단 해소")}>차단 해소</button>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} aria-pressed={responseDraft?.actionType === "outsource"} onClick={() => startResponseDraft("outsource", "외주 전환 검토")}>외주 전환</button>
          </div>
          {responseDraft ? (
            <form
              aria-label="위험 대응안 작성"
              className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void createResponse();
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-black text-fg">대응안 작성</h3>
                  <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
                    승인 전에 담당자·기한·예상 효과를 확인합니다.
                  </p>
                </div>
                <button
                  type="button"
                  className={buttonClass({ variant: "ghost", size: "sm" })}
                  onClick={() => setResponseDraft(null)}
                  disabled={busy}
                >
                  작성 취소
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[0.6875rem] font-bold text-fg-3">대응 제목</span>
                  <input
                    value={responseDraft.title}
                    onChange={(event) => setResponseDraft((current) => current ? { ...current, title: event.target.value } : current)}
                    className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    disabled={busy}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-[0.6875rem] font-bold text-fg-3">담당자</span>
                  <select
                    value={responseDraft.ownerAssignmentId}
                    onChange={(event) => setResponseDraft((current) => current ? { ...current, ownerAssignmentId: event.target.value } : current)}
                    className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg"
                    disabled={busy}
                  >
                    <option value="">담당자 미정</option>
                    {aggregate.assignments
                      .filter((assignment) => assignment.status === "active")
                      .map((assignment) => (
                        <option key={assignment.id} value={assignment.id}>
                          {assignmentName(aggregate, assignment.id)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[0.6875rem] font-bold text-fg-3">실행 내용</span>
                  <textarea
                    value={responseDraft.description}
                    onChange={(event) => setResponseDraft((current) => current ? { ...current, description: event.target.value } : current)}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    disabled={busy}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-[0.6875rem] font-bold text-fg-3">완료 목표 시각</span>
                  <input
                    type="datetime-local"
                    value={responseDraft.dueAt}
                    onChange={(event) => setResponseDraft((current) => current ? { ...current, dueAt: event.target.value } : current)}
                    className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    disabled={busy}
                  />
                </label>
                <label className="block">
                  <span className="text-[0.6875rem] font-bold text-fg-3">연결 작업</span>
                  <select
                    value={responseDraft.linkedTaskId}
                    onChange={(event) => setResponseDraft((current) => current ? { ...current, linkedTaskId: event.target.value } : current)}
                    className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg"
                    disabled={busy}
                  >
                    <option value="">연결하지 않음</option>
                    {risk.affectedTaskIds.map((taskId) => (
                      <option key={taskId} value={taskId}>{taskLabel(aggregate, taskId)}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[0.6875rem] font-bold text-fg-3">예상 효과</span>
                  <input
                    value={responseDraft.expectedEffect}
                    onChange={(event) => setResponseDraft((current) => current ? { ...current, expectedEffect: event.target.value } : current)}
                    className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                    disabled={busy}
                    required
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-accent/20 pt-3">
                <p className="text-[0.6875rem] text-fg-3">
                  저장 후 관리자가 승인하고 담당자가 실행을 시작합니다.
                </p>
                <button
                  type="submit"
                  className={buttonClass({ size: "sm" })}
                  disabled={busy || !responseDraftValid}
                >
                  대응안 제안
                </button>
              </div>
            </form>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {risk.status === "open" || risk.status === "monitoring" ? <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit || busy} onClick={() => void transition("mitigating", "대응을 시작합니다.")}>대응 시작</button> : null}
            {risk.status === "mitigating" || risk.status === "occurred" ? <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit || busy || !trimmedReason} onClick={() => void transition("resolved", "")}>해결 확인</button> : null}
            {risk.status === "resolved" || risk.status === "dismissed" || risk.status === "closed" ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit || busy} onClick={() => void transition("open", "조건이 변경되어 위험을 다시 엽니다.")}>다시 열기</button> : null}
            {["open", "monitoring", "mitigating", "occurred"].includes(risk.status) ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canManage || busy || !trimmedReason} onClick={() => void transition("accepted", "")}>위험 수용</button> : null}
            {["open", "monitoring"].includes(risk.status) ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canManage || busy || !trimmedReason} onClick={() => void transition("dismissed", "")}>오탐 처리</button> : null}
            {signal && signal.severity !== "critical" ? <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canManage || !actorAssignmentId || busy || !trimmedReason} onClick={() => void suppressSignal()}>신호 24시간 숨김</button> : null}
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
            {responses.length === 0 ? <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-fg-3">등록된 대응 항목이 없습니다.</div> : null}
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
            <p className="text-xs font-bold text-fg">위험 최초 감지</p>
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
    { key: "autoOpenStableHours", label: "자동 생성 안정화", suffix: "시간" },
    { key: "thresholdHysteresisPercent", label: "임계값 복귀 여유", suffix: "%" },
    { key: "autoResolveStableHours", label: "자동 해결 안정화", suffix: "시간" },
  ];

  return (
    <Section
      title="자동 감지 정책"
      description="자동 오픈 기준, 안정화 시간, 알림 주기와 차단·작업량·검수·연재 버퍼 임계값을 조정합니다."
      action={<button type="button" className={buttonClass({ size: "sm" })} disabled={!canManage || saving || Boolean(validationError)} onClick={() => void save()}><SlidersHorizontal className="size-4" aria-hidden="true" /> 정책 저장</button>}
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="rounded-xl border border-line bg-panel p-3">
          <span className="text-xs font-bold text-fg">프로젝트 시간대</span>
          <input
            value={draft.timezone}
            onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}
            disabled={!canManage}
            className="mt-2 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
            placeholder="Asia/Seoul"
          />
        </label>
        <label className="rounded-xl border border-line bg-panel p-3">
          <span className="text-xs font-bold text-fg">업무 종료 시각</span>
          <input
            type="time"
            value={draft.workdayEndLocal}
            onChange={(event) => setDraft((current) => ({ ...current, workdayEndLocal: event.target.value }))}
            disabled={!canManage}
            className="mt-2 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="rounded-xl border border-line bg-panel p-3">
          <span className="text-xs font-bold text-fg">자동 위험 생성 기준</span>
          <select
            value={draft.autoOpenSeverity}
            onChange={(event) => setDraft((current) => ({ ...current, autoOpenSeverity: event.target.value as ProductionRiskPolicy["autoOpenSeverity"] }))}
            disabled={!canManage}
            className="mt-2 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg"
          >
            <option value="warning">주의 이상</option>
            <option value="high">높음 이상</option>
            <option value="critical">긴급만</option>
          </select>
        </label>
        <label className="rounded-xl border border-line bg-panel p-3">
          <span className="text-xs font-bold text-fg">자동 생성 최소 신뢰도</span>
          <select
            value={draft.autoOpenMinimumConfidence}
            onChange={(event) => setDraft((current) => ({
              ...current,
              autoOpenMinimumConfidence: event.target.value as ProductionRiskPolicy["autoOpenMinimumConfidence"],
            }))}
            disabled={!canManage}
            className="mt-2 w-full rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-fg"
          >
            <option value="low">낮음 이상</option>
            <option value="medium">보통 이상</option>
            <option value="high">높음만</option>
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
                min={["minimumReadyBufferEpisodes", "autoOpenStableHours", "thresholdHysteresisPercent"].includes(field.key) ? 0 : 1}
                max={field.key === "thresholdHysteresisPercent" ? 50 : undefined}
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
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProductionRisk | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const userId = useApp((state) => state.userId);
  const actorPartyId = aggregate.parties.find((party) => party.accountUserId === userId)?.id ?? null;
  const actorAssignment = aggregate.assignments.find((assignment) =>
    assignment.partyId === actorPartyId && assignment.status === "active")
    ?? (aggregate.projectId === "sample-project"
      ? aggregate.assignments.find((assignment) => assignment.roleType === "producer" && assignment.status === "active")
      : null);

  const episodeOptions = useMemo(() => {
    const ordered = aggregate.episodePlans
      .slice()
      .sort((left, right) => left.episodeNumber - right.episodeNumber)
      .map((plan) => plan.episodeId);
    for (const episode of aggregate.episodes) {
      if (!ordered.includes(episode.episodeId)) ordered.push(episode.episodeId);
    }
    return ordered;
  }, [aggregate.episodePlans, aggregate.episodes]);
  const ownerOptions = useMemo(() => aggregate.assignments
    .filter((assignment) => assignment.status === "active")
    .slice()
    .sort((left, right) => assignmentName(aggregate, left.id).localeCompare(assignmentName(aggregate, right.id), "ko-KR")), [aggregate]);
  const episodeFilterOptions = useMemo(() => [
    { value: "project", label: "프로젝트 공통" },
    ...episodeOptions.map((episodeId) => ({ value: episodeId, label: productionEpisodeLabel(aggregate, episodeId) })),
  ], [aggregate, episodeOptions]);
  const ownerFilterOptions = useMemo(() => [
    { value: "unassigned", label: "담당자 미정" },
    ...ownerOptions.map((assignment) => ({ value: assignment.id, label: assignmentName(aggregate, assignment.id) })),
  ], [aggregate, ownerOptions]);
  const ruleOptions = useMemo(() => [...new Set(evaluation.signals.map((signal) => signal.ruleKey))]
    .sort((left, right) => (RULE_LABELS[left] ?? left).localeCompare(RULE_LABELS[right] ?? right, "ko-KR")), [evaluation.signals]);
  const ruleFilterOptions = useMemo(() => ruleOptions.map((ruleKey) => ({
    value: ruleKey,
    label: RULE_LABELS[ruleKey] ?? ruleKey,
  })), [ruleOptions]);
  const urlOptions = useMemo(() => ({
    episodeIds: episodeOptions,
    ownerAssignmentIds: ownerOptions.map((assignment) => assignment.id),
    ruleKeys: ruleOptions,
    riskIds: evaluation.risks.map((risk) => risk.id),
  }), [episodeOptions, evaluation.risks, ownerOptions, ruleOptions]);
  const urlState = useMemo(
    () => parseProductionRiskUrlState(searchParams, urlOptions),
    [searchParams, urlOptions],
  );

  useEffect(() => {
    const normalized = normalizeProductionRiskSearchParams(searchParams, urlOptions);
    if (normalized.toString() !== searchParams.toString()) {
      setSearchParams(normalized, { replace: true });
    }
  }, [searchParams, setSearchParams, urlOptions]);

  useEffect(() => {
    if (urlState.selectedRiskId) setMobileDetailOpen(true);
  }, [urlState.selectedRiskId]);

  const search = urlState.search.toLocaleLowerCase("ko-KR");
  const baseFilteredRisks = evaluation.risks.filter((risk) => {
    const signal = sourceSignal(evaluation.signals, risk);
    const statusMatch = urlState.statuses.length > 0
      ? urlState.statuses.includes(risk.status)
      : ACTIVE_STATUSES.has(risk.status) && signal?.state !== "suppressed";
    const episodeMatch = urlState.episodeIds.length === 0 || urlState.episodeIds.some((episodeId) =>
      episodeId === "project"
        ? risk.affectedEpisodeIds.length === 0
        : risk.affectedEpisodeIds.includes(episodeId));
    const ownerMatch = urlState.ownerAssignmentIds.length === 0 || urlState.ownerAssignmentIds.some((assignmentId) =>
      assignmentId === "unassigned"
        ? !risk.ownerAssignmentId
        : risk.ownerAssignmentId === assignmentId);
    const ruleMatch = urlState.ruleKeys.length === 0
      || risk.causeCodes.some((ruleKey) => urlState.ruleKeys.includes(ruleKey));
    return statusMatch
      && episodeMatch
      && ownerMatch
      && ruleMatch
      && (urlState.severities.length === 0 || urlState.severities.includes(risk.severity))
      && (urlState.categories.length === 0 || urlState.categories.includes(risk.category))
      && (!urlState.source || urlState.source === risk.source)
      && (!search || `${risk.title} ${risk.description} ${risk.causeCodes.join(" ")}`.toLocaleLowerCase("ko-KR").includes(search));
  });
  const filteredRisks = urlState.matrixCell
    ? baseFilteredRisks.filter((risk) =>
      risk.probability === urlState.matrixCell?.probability
      && risk.impact === urlState.matrixCell.impact)
    : baseFilteredRisks;
  const selectedRisk = filteredRisks.find((risk) => risk.id === urlState.selectedRiskId)
    ?? filteredRisks[0]
    ?? null;
  const selectedSignal = selectedRisk ? sourceSignal(evaluation.signals, selectedRisk) : null;
  const viewMode = urlState.view;

  const replaceUrlState = (
    patch: Partial<ProductionRiskUrlState>,
    options: { readonly clearSelection?: boolean } = {},
  ) => {
    const nextState: ProductionRiskUrlState = {
      ...urlState,
      ...patch,
      selectedRiskId: options.clearSelection
        ? null
        : "selectedRiskId" in patch ? patch.selectedRiskId ?? null : urlState.selectedRiskId,
      detailTab: options.clearSelection ? "overview" : patch.detailTab ?? urlState.detailTab,
    };
    setSearchParams(serializeProductionRiskUrlState(nextState, searchParams), { replace: true });
  };

  const selectView = (nextView: ProductionRiskViewMode) => {
    replaceUrlState({
      view: nextView,
      matrixCell: nextView === "matrix" ? urlState.matrixCell : null,
    });
    setMobileDetailOpen(false);
  };

  const selectRisk = (riskId: string) => {
    replaceUrlState({ selectedRiskId: riskId, detailTab: "overview" });
    setMobileDetailOpen(true);
  };

  const selectMatrixCell = (cell: ProductionRiskMatrixCell | null) => {
    const sameCell = cell
      && urlState.matrixCell?.probability === cell.probability
      && urlState.matrixCell.impact === cell.impact;
    replaceUrlState({ matrixCell: sameCell ? null : cell }, { clearSelection: true });
    setMobileDetailOpen(false);
  };

  const resetFilters = () => {
    replaceUrlState({
      search: "",
      severities: [],
      statuses: [],
      categories: [],
      source: null,
      episodeIds: [],
      ownerAssignmentIds: [],
      ruleKeys: [],
      matrixCell: null,
    }, { clearSelection: true });
    setMobileDetailOpen(false);
  };

  const copyShareUrl = async () => {
    try {
      if (!globalThis.navigator?.clipboard) throw new Error("clipboard unavailable");
      await globalThis.navigator.clipboard.writeText(globalThis.location.href);
      setShareStatus("현재 필터와 선택 상태가 포함된 주소를 복사했습니다.");
    } catch {
      setShareStatus("주소 복사를 지원하지 않는 환경입니다. 브라우저 주소창의 URL을 공유해 주세요.");
    }
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
  const viewTitle = viewMode === "episode"
    ? "회차별 위험"
    : viewMode === "matrix" ? "위험 매트릭스" : "위험 목록";
  const viewDetail = viewMode === "episode"
    ? `${filteredRisks.length}건 · 영향을 받는 회차별 그룹`
    : viewMode === "matrix"
      ? `${filteredRisks.length}건 · 발생 가능성 × 영향도`
      : `${filteredRisks.length}건 · 운영 우선순위순`;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-accent/30 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">자동 위험 감지</Pill>
              <Pill tone={evaluation.summary.critical > 0 ? "danger" : evaluation.summary.high > 0 ? "warning" : "success"}>
                마지막 평가 {formatDate(evaluation.evaluatedAt)}
              </Pill>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">위험·병목</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
              마감 초과 전에 예상 지연과 병목을 발견하고, 근거·영향 경로·대응 결과를 한곳에서 관리합니다.
            </p>
            {nextDeadlineRisk ? <p className="mt-2 text-xs leading-5 text-fg-3">가장 먼저 확인할 항목 · {nextDeadlineRisk.title}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} disabled={!canEdit} onClick={() => void refresh()}><RefreshCw className="size-4" aria-hidden="true" /> 다시 평가</button>
            <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit} onClick={openCreateRisk}><Plus className="size-4" aria-hidden="true" /> 위험 직접 등록</button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="긴급" value={String(evaluation.summary.critical)} detail="지금 조치가 필요한 위험" icon={ShieldAlert} tone={evaluation.summary.critical > 0 ? "danger" : "success"} />
        <MetricCard label="높은 위험" value={String(evaluation.summary.high)} detail="게시·후행 작업 영향 가능" icon={AlertTriangle} tone={evaluation.summary.high > 0 ? "warning" : "success"} />
        <MetricCard label="실제 초과" value={String(evaluation.summary.actualOverdue)} detail="마감을 지난 미완료 항목" icon={Clock3} tone={evaluation.summary.actualOverdue > 0 ? "danger" : "success"} />
        <MetricCard label="예상 초과" value={String(evaluation.summary.forecastSlip)} detail="현재 속도 기준 마감 초과" icon={CalendarClock} tone={evaluation.summary.forecastSlip > 0 ? "warning" : "success"} />
        <MetricCard label="차단 장기화" value={String(evaluation.summary.blocked)} detail="정책 기준을 넘긴 차단" icon={Workflow} tone={evaluation.summary.blocked > 0 ? "warning" : "success"} />
        <MetricCard label="영향 회차" value={String(evaluation.summary.affectedEpisodeCount)} detail={`일정 신뢰도 ${evaluation.schedule.confidence}`} icon={ListChecks} tone={evaluation.summary.affectedEpisodeCount > 0 ? "accent" : "success"} />
      </div>

      <Section
        title="위험 필터"
        description="기본값은 현재 대응이 필요한 위험만 보여 줍니다. 종료된 항목은 상태 필터에서 선택합니다."
        action={<Filter className="size-4 text-fg-3" aria-hidden="true" />}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-[0.6875rem] font-bold text-fg-3">검색</span>
            <input
              value={urlState.search}
              onChange={(event) => replaceUrlState({ search: event.target.value }, { clearSelection: true })}
              className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg outline-none focus:border-accent"
              placeholder="제목·원인 검색"
            />
          </label>
          <div>
            <span className="text-[0.6875rem] font-bold text-fg-3">위험도</span>
            <ProductionRiskMultiFilter
              className="mt-1"
              label="위험도"
              options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }))}
              selected={urlState.severities}
              onChange={(values) => replaceUrlState({ severities: values as readonly ProductionRiskSeverity[] }, { clearSelection: true })}
            />
          </div>
          <div>
            <span className="text-[0.6875rem] font-bold text-fg-3">상태</span>
            <ProductionRiskMultiFilter
              className="mt-1"
              label="상태"
              emptyLabel="활성 위험"
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              selected={urlState.statuses}
              onChange={(values) => replaceUrlState({ statuses: values as readonly ProductionRiskStatus[] }, { clearSelection: true })}
            />
          </div>
          <div>
            <span className="text-[0.6875rem] font-bold text-fg-3">유형</span>
            <ProductionRiskMultiFilter
              className="mt-1"
              label="유형"
              options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
              selected={urlState.categories}
              onChange={(values) => replaceUrlState({ categories: values as readonly ProductionRiskCategory[] }, { clearSelection: true })}
            />
          </div>
          <label className="block">
            <span className="text-[0.6875rem] font-bold text-fg-3">등록 방식</span>
            <select
              value={urlState.source ?? "all"}
              onChange={(event) => replaceUrlState({
                source: event.target.value === "all" ? null : event.target.value as "manual" | "automatic",
              }, { clearSelection: true })}
              className="mt-1 min-h-10 w-full rounded-xl border border-line bg-panel px-3 py-2 text-xs text-fg"
            >
              <option value="all">전체</option>
              <option value="automatic">자동 감지</option>
              <option value="manual">직접 등록</option>
            </select>
          </label>
          <div>
            <span className="text-[0.6875rem] font-bold text-fg-3">회차</span>
            <ProductionRiskMultiFilter
              className="mt-1"
              label="회차"
              options={episodeFilterOptions}
              selected={urlState.episodeIds}
              onChange={(values) => replaceUrlState({ episodeIds: values }, { clearSelection: true })}
            />
          </div>
          <div>
            <span className="text-[0.6875rem] font-bold text-fg-3">담당자</span>
            <ProductionRiskMultiFilter
              className="mt-1"
              label="담당자"
              options={ownerFilterOptions}
              selected={urlState.ownerAssignmentIds}
              onChange={(values) => replaceUrlState({ ownerAssignmentIds: values }, { clearSelection: true })}
            />
          </div>
          <div>
            <span className="text-[0.6875rem] font-bold text-fg-3">감지 규칙</span>
            <ProductionRiskMultiFilter
              className="mt-1"
              label="감지 규칙"
              options={ruleFilterOptions}
              selected={urlState.ruleKeys}
              onChange={(values) => replaceUrlState({ ruleKeys: values }, { clearSelection: true })}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <button
            type="button"
            className={buttonClass({ variant: "ghost", size: "sm" })}
            onClick={resetFilters}
          >
            필터 초기화
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.6875rem] text-fg-3" aria-live="polite">{shareStatus}</span>
            <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void copyShareUrl()}>
              <Copy className="size-4" aria-hidden="true" /> 보기 주소 복사
            </button>
          </div>
        </div>
      </Section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3 sm:p-4">
        <div>
          <h2 className="text-sm font-black text-fg">위험 보기</h2>
          <p className="mt-1 text-xs text-fg-3">우선순위, 회차 영향, 확률×영향도를 같은 필터 조건으로 비교합니다.</p>
        </div>
        <ProductionRiskViewSwitcher value={viewMode} onChange={selectView} />
      </section>

      <div className={cn(
        "grid gap-4",
        viewMode === "matrix"
          ? "xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.9fr)]"
          : "xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.4fr)]",
      )}>
        <section className={cn("rounded-2xl border border-line bg-card p-4", mobileDetailOpen && "hidden xl:block")}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-black text-fg">{viewTitle}</h2><p className="mt-1 text-xs text-fg-3">{viewDetail}</p></div>
            <Pill>{evaluation.risks.filter((risk) => ACTIVE_STATUSES.has(risk.status)).length} 활성</Pill>
          </div>
          <div className={cn(viewMode === "priority" && "space-y-2")}>
            {viewMode === "priority" ? filteredRisks.map((risk) => (
              <RiskListRow
                key={risk.id}
                aggregate={aggregate}
                risk={risk}
                signal={sourceSignal(evaluation.signals, risk)}
                selected={selectedRisk?.id === risk.id}
                onSelect={() => selectRisk(risk.id)}
              />
            )) : null}
            {viewMode === "episode" ? (
              <ProductionRiskEpisodeView
                aggregate={aggregate}
                risks={filteredRisks}
                selectedRiskId={selectedRisk?.id ?? null}
                onSelect={selectRisk}
              />
            ) : null}
            {viewMode === "matrix" ? (
              <ProductionRiskMatrixView
                aggregate={aggregate}
                risks={baseFilteredRisks}
                selectedRiskId={selectedRisk?.id ?? null}
                onSelect={selectRisk}
                selectedCell={urlState.matrixCell}
                onSelectCell={selectMatrixCell}
              />
            ) : null}
            {baseFilteredRisks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-8 text-center">
                <CheckCircle2 className="mx-auto size-8 text-good" aria-hidden="true" />
                <p className="mt-3 text-sm font-black text-fg">조건에 맞는 위험이 없습니다</p>
                <p className="mt-1 text-xs text-fg-3">필터를 바꾸거나 제작 데이터를 다시 평가해 보세요.</p>
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
              tab={urlState.detailTab}
              setTab={(tab) => replaceUrlState({
                selectedRiskId: selectedRisk.id,
                detailTab: tab,
              })}
              execute={execute}
              canEdit={canEdit}
              canManage={canManage}
              actorAssignmentId={actorAssignment?.id ?? null}
              onEditRisk={() => openEditRisk(selectedRisk)}
              onBack={() => {
                setMobileDetailOpen(false);
                replaceUrlState({ selectedRiskId: null, detailTab: "overview" });
              }}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
              <BadgeCheck className="mx-auto size-9 text-good" aria-hidden="true" />
              <p className="mt-3 text-sm font-black text-fg">확인할 위험을 선택해 주세요</p>
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
