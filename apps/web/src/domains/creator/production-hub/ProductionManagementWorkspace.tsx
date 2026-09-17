import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Gauge,
  GitBranch,
  ListChecks,
  LoaderCircle,
  PanelTopOpen,
  ShieldAlert,
  Sparkles,
  UserPlus,
  UserRoundCheck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonspectrum/core/production";

import {
  deriveProductionManagementOverview,
  episodeHealthLabel,
  type AssignmentRecommendation,
  type ManagementAction,
  type ManagementHealth,
  type ManagementPhaseStatus,
  type ManagementSeverity,
  type ProductionManagementLens,
} from "./production-management-overview";
import { ProductionStudioRevisionWorkspace } from "./ProductionStudioRevisionWorkspace";
import type { ProductionClientCommand } from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface ProductionManagementWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly roleLens: ProductionManagementLens;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly now?: Date;
}

type ActionFilter = "all" | "critical" | "review" | "capacity";
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const DATE_ONLY = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
});
const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const ACTION_FILTERS: readonly {
  readonly id: ActionFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "전체" },
  { id: "critical", label: "즉시 조치" },
  { id: "review", label: "검수·변경" },
  { id: "capacity", label: "배정·작업량" },
];

const ROLE_COPY: Readonly<Record<ProductionManagementLens, {
  readonly label: string;
  readonly description: string;
}>> = Object.freeze({
  story: {
    label: "스토리 작가 관점",
    description: "차단 질문, 대본·콘티 검수, 정보 공개 순서와 다음 인계를 먼저 정리합니다.",
  },
  art: {
    label: "작화팀 관점",
    description: "입력 준비 상태, 병렬 작화 공정, 수정 요청과 담당자 작업량을 먼저 정리합니다.",
  },
  producer: {
    label: "PD·편집자 관점",
    description: "연재 마감, 회차 비축, 검수 병목, 과부하와 외부 의존성을 먼저 정리합니다.",
  },
});

const PHASE_STATUS_LABELS: Readonly<Record<ManagementPhaseStatus, string>> = Object.freeze({
  complete: "완료",
  working: "작업 중",
  review: "검수",
  blocked: "차단",
  waiting: "대기",
  missing: "미구성",
});

function formatDate(value: string | null): string {
  if (!value) return "미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_ONLY.format(date) : "미정";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
}

function relativeDeadline(days: number | null): string {
  if (days === null) return "마감 미정";
  if (days < 0) return `D+${Math.abs(days)}`;
  if (days === 0) return "오늘";
  return `D-${days}`;
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

function healthTone(health: ManagementHealth): Tone {
  if (health === "stable") return "success";
  if (health === "attention") return "warning";
  if (health === "risk" || health === "critical") return "danger";
  return "neutral";
}

function severityTone(severity: ManagementSeverity): Tone {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  return "accent";
}

function phaseTone(status: ManagementPhaseStatus): Tone {
  if (status === "complete") return "success";
  if (status === "working" || status === "review") return "accent";
  if (status === "blocked") return "danger";
  if (status === "waiting") return "warning";
  return "neutral";
}

function Pill({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: Tone;
}) {
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
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly tone?: Tone;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", toneClass(tone))}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">{label}</p>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-fg">{value}</p>
      <p className="mt-1 text-xs leading-5 text-fg-2">{detail}</p>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-4 rounded-2xl border border-line bg-card p-4 sm:p-5", className)}>
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

function actionMatchesFilter(action: ManagementAction, filter: ActionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "critical") return action.severity === "critical";
  if (filter === "review") return action.kind === "review" || action.kind === "change";
  return action.kind === "capacity" || action.kind === "assignment";
}

function ActionKindIcon({ action }: { readonly action: ManagementAction }) {
  const className = "size-4";
  if (action.kind === "review") return <UserRoundCheck className={className} aria-hidden="true" />;
  if (action.kind === "capacity" || action.kind === "assignment") return <Users className={className} aria-hidden="true" />;
  if (action.kind === "release") return <CalendarClock className={className} aria-hidden="true" />;
  if (action.kind === "risk" || action.kind === "change") return <ShieldAlert className={className} aria-hidden="true" />;
  if (action.kind === "deadline") return <Clock3 className={className} aria-hidden="true" />;
  return <AlertTriangle className={className} aria-hidden="true" />;
}

function ActionRow({ action }: { readonly action: ManagementAction }) {
  return (
    <Link
      to={action.href}
      className="group flex min-w-0 items-start gap-3 rounded-xl border border-line bg-panel p-3 transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className={cn(
        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border",
        toneClass(severityTone(action.severity)),
      )}>
        <ActionKindIcon action={action} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-fg">{action.title}</span>
          <Pill tone={severityTone(action.severity)}>
            {action.severity === "critical" ? "즉시 조치" : action.severity === "warning" ? "주의" : "확인"}
          </Pill>
        </span>
        <span className="mt-1 block text-xs leading-5 text-fg-2">{action.detail}</span>
        {action.dueAt ? <span className="mt-1 block text-[0.6875rem] text-fg-3">기한 {formatDate(action.dueAt)}</span> : null}
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-xs font-bold text-accent sm:flex">
        {action.actionLabel}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function PhaseCell({
  status,
  progressPercent,
  taskCount,
}: {
  readonly status: ManagementPhaseStatus;
  readonly progressPercent: number;
  readonly taskCount: number;
}) {
  return (
    <div className="flex min-w-20 flex-col items-center gap-1.5">
      <Pill tone={phaseTone(status)}>{PHASE_STATUS_LABELS[status]}</Pill>
      <span className="text-[0.625rem] text-fg-3">
        {taskCount > 0 ? `${progressPercent}% · ${taskCount}개` : progressPercent === 100 ? "승인 기준" : "—"}
      </span>
    </div>
  );
}

export function ProductionManagementWorkspace({
  aggregate,
  roleLens,
  execute,
  canEdit,
  now,
}: ProductionManagementWorkspaceProps) {
  const overview = useMemo(
    () => deriveProductionManagementOverview(aggregate, { now: now ?? new Date(), roleLens }),
    [aggregate, now, roleLens],
  );
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const visibleActions = overview.actions.filter((action) => actionMatchesFilter(action, actionFilter));
  const roleCopy = ROLE_COPY[roleLens];
  const nextRelease = overview.operations.nextRelease;
  const projectBase = `/production/projects/${encodeURIComponent(aggregate.projectId)}`;
  const reviewOrChangeCount = overview.actions.filter((action) => action.kind === "review" || action.kind === "change").length;

  const applyRecommendedAssignment = async (recommendation: AssignmentRecommendation) => {
    if (!canEdit || assigningTaskId) return;
    setAssigningTaskId(recommendation.task.id);
    try {
      await execute({
        type: "upsert-task",
        task: {
          ...recommendation.task,
          assignmentIds: [recommendation.candidate.id],
        },
      }, `${recommendation.task.title} 담당자를 ${recommendation.candidateName}에게 배정했습니다.`);
    } finally {
      setAssigningTaskId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="production-management-heading"
        className="overflow-hidden rounded-3xl border border-accent/30 bg-card"
      >
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="accent">{roleCopy.label}</Pill>
              <Pill tone={healthTone(overview.health)}>운영 안정도 {overview.healthScore} · {overview.healthLabel}</Pill>
            </div>
            <h2 id="production-management-heading" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
              프로젝트 운영 조종석
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">{roleCopy.description}</p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-fg-3">
              실제 회차·업무·검수·배정 데이터에서 우선순위를 계산합니다. 숫자를 누르면 원인이 되는 작업으로 이동합니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className={buttonClass({ size: "sm" })} to={`${projectBase}/schedule`}>
                <CalendarClock className="size-4" aria-hidden="true" /> 일정·작업량
              </Link>
              <Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/episodes`}>
                <PanelTopOpen className="size-4" aria-hidden="true" /> 회차 운영
              </Link>
              <Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/review`}>
                <UserRoundCheck className="size-4" aria-hidden="true" /> 검수함
              </Link>
            </div>
          </div>

          <div className={cn("rounded-2xl border p-4", toneClass(healthTone(overview.health)))}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em]">운영 안정도 근거</p>
                <p className="mt-1 text-3xl font-black text-fg">{overview.healthScore}</p>
              </div>
              <Gauge className="size-8" aria-hidden="true" />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas/70" aria-label={`운영 안정도 ${overview.healthScore}점`}>
              <div className="h-full rounded-full bg-current" style={{ width: `${overview.healthScore}%` }} />
            </div>
            <ul className="mt-3 space-y-1.5 text-xs leading-5 text-fg-2">
              {overview.healthReasons.slice(0, 4).map((reason) => (
                <li key={reason} className="flex gap-2">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="다음 연재"
          value={nextRelease ? relativeDeadline(nextRelease.daysUntilRelease) : "미정"}
          detail={nextRelease ? `${nextRelease.title} · ${formatDate(nextRelease.releaseAt)}` : "게시 마감 설정 필요"}
          icon={CalendarClock}
          tone={nextRelease?.health === "critical" ? "danger" : nextRelease?.health === "risk" ? "warning" : "accent"}
        />
        <MetricCard
          label="준비 버퍼"
          value={`${overview.operations.readyBufferCount}회`}
          detail={overview.operations.cadenceDays ? `${overview.operations.cadenceDays}일 연재 주기 기준` : "연재 주기 확인 필요"}
          icon={BadgeCheck}
          tone={overview.operations.readyBufferCount >= 2 ? "success" : "warning"}
        />
        <MetricCard
          label="마감 위험"
          value={String(overview.operations.criticalCount + overview.operations.riskCount)}
          detail={`즉시 ${overview.operations.criticalCount} · 주의 ${overview.operations.riskCount}`}
          icon={AlertTriangle}
          tone={overview.operations.criticalCount > 0 ? "danger" : overview.operations.riskCount > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="막힌 질문"
          value={String(overview.blockingQuestionCount)}
          detail={overview.blockingQuestionCount > 0 ? "답변 전 다음 작업 진행 불가" : "차단 질문 없음"}
          icon={ShieldAlert}
          tone={overview.blockingQuestionCount > 0 ? "danger" : "success"}
        />
        <MetricCard
          label="검수·수정"
          value={String(overview.reviewTaskCount)}
          detail={`검수·변경 조치 ${reviewOrChangeCount}건`}
          icon={ListChecks}
          tone={overview.reviewTaskCount > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="미배정·과부하"
          value={`${overview.unassignedTaskCount} · ${overview.overloadedAssignmentCount}`}
          detail={overview.uncoveredUnassignedTaskCount > 0
            ? `후보 없음 ${overview.uncoveredUnassignedTaskCount} · 과부하 ${overview.overloadedAssignmentCount}`
            : "책임자 미배정 · 기본 가용량 초과"}
          icon={Users}
          tone={overview.unassignedTaskCount + overview.overloadedAssignmentCount > 0 ? "warning" : "success"}
        />
      </div>

      <ProductionStudioRevisionWorkspace
        aggregate={aggregate}
        execute={execute}
        canEdit={canEdit}
        roleLens={roleLens}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Section
          title="오늘의 운영 판단"
          description="차단·마감·검수·배정 순으로 정렬하고, 현재 역할과 관련된 항목을 같은 위험도 안에서 먼저 표시합니다."
          action={(
            <div className="flex flex-wrap rounded-xl border border-line bg-panel p-1" role="group" aria-label="운영 판단 필터">
              {ACTION_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={actionFilter === filter.id}
                  className={cn(
                    "min-h-8 rounded-lg px-2.5 text-[0.6875rem] font-bold transition-colors",
                    actionFilter === filter.id ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                  onClick={() => setActionFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          )}
        >
          <div className="space-y-2" aria-live="polite">
            {visibleActions.slice(0, 10).map((action) => <ActionRow key={action.id} action={action} />)}
            {visibleActions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-8 text-center">
                <CheckCircle2 className="mx-auto size-8 text-good" aria-hidden="true" />
                <p className="mt-3 text-sm font-black text-fg">이 조건에서 처리할 항목이 없습니다</p>
                <p className="mt-1 text-xs text-fg-2">새로운 차단·검수·배정 이슈가 생기면 자동으로 표시됩니다.</p>
              </div>
            ) : null}
          </div>
        </Section>

        <Section
          title="운영 복구 지점"
          description="점수 자체보다 일정에 직접 영향을 주는 원인을 먼저 해결합니다."
        >
          <div className="space-y-2">
            {[
              {
                label: "차단·입력 대기",
                value: overview.blockedTaskCount,
                detail: "선행 입력 또는 결정이 필요한 업무",
                href: `${projectBase}/production`,
                icon: Workflow,
                tone: overview.blockedTaskCount > 0 ? "danger" : "success" as Tone,
              },
              {
                label: "기한 초과",
                value: overview.overdueTaskCount,
                detail: "계획일을 넘긴 미완료 업무",
                href: `${projectBase}/schedule`,
                icon: Clock3,
                tone: overview.overdueTaskCount > 0 ? "danger" : "success" as Tone,
              },
              {
                label: "열린 제작 위험",
                value: overview.activeRiskCount,
                detail: "대응 중이거나 아직 닫히지 않은 위험",
                href: `${projectBase}/planning`,
                icon: ShieldAlert,
                tone: overview.activeRiskCount > 0 ? "warning" : "success" as Tone,
              },
              {
                label: "변경 영향 분석",
                value: overview.activeChangeRequestCount,
                detail: "승인본·일정·계약에 영향을 줄 수 있는 변경",
                href: `${projectBase}/review`,
                icon: GitBranch,
                tone: overview.activeChangeRequestCount > 0 ? "warning" : "success" as Tone,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.label} to={item.href} className="group flex items-center gap-3 rounded-xl border border-line bg-panel p-3 hover:border-accent/40 hover:bg-raised">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border", toneClass(item.tone))}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-fg">{item.label}</span>
                      <span className="text-sm font-black text-fg">{item.value}</span>
                    </span>
                    <span className="mt-1 block text-[0.6875rem] leading-4 text-fg-3">{item.detail}</span>
                  </span>
                  <ArrowRight className="size-4 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </Section>
      </div>

      <Section
        id="assignment-recommendations"
        title="추천 업무 배정"
        description="개인 생산성 순위가 아니라 역할·범위·활성 기간·향후 14일 예상 부하만 사용합니다. 사용자 확인 전에는 담당자를 변경하지 않습니다."
        action={(
          <Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/settings`}>
            팀 역할 확인 <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      >
        {overview.assignmentRecommendations.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {overview.assignmentRecommendations.slice(0, 6).map((recommendation) => {
              const projectedTone: Tone = recommendation.projectedLoadPercent > 100
                ? "danger"
                : recommendation.projectedLoadPercent >= 80 ? "warning" : "success";
              const assigning = assigningTaskId === recommendation.task.id;
              return (
                <article key={recommendation.task.id} className="rounded-2xl border border-line bg-panel p-4">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="accent">{recommendation.departmentLabel}</Pill>
                        <Pill tone={projectedTone}>
                          {recommendation.currentLoadPercent}% → {recommendation.projectedLoadPercent}%
                        </Pill>
                      </div>
                      <h3 className="mt-2 text-sm font-black leading-5 text-fg">{recommendation.task.title}</h3>
                      <p className="mt-1 text-xs text-fg-2">
                        추천 {recommendation.candidateName} · {recommendation.roleLabel}
                      </p>
                    </div>
                    <span className="text-right text-[0.6875rem] text-fg-3">
                      {formatDate(recommendation.task.dueAt)} 마감<br />예상 +{recommendation.addedHours}h
                    </span>
                  </header>

                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-2 text-[0.6875rem]">
                      <span className="text-fg-3">배정 후 예상 작업량</span>
                      <span className="font-black text-fg">{recommendation.projectedLoadPercent}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised" aria-label={`${recommendation.candidateName} 배정 후 예상 작업량 ${recommendation.projectedLoadPercent}%`}>
                      <div
                        className={cn("h-full rounded-full", recommendation.projectedLoadPercent > 100 ? "bg-bad" : recommendation.projectedLoadPercent >= 80 ? "bg-warn" : "bg-good")}
                        style={{ width: `${Math.min(100, recommendation.projectedLoadPercent)}%` }}
                      />
                    </div>
                  </div>

                  <ul className="mt-3 space-y-1 text-[0.6875rem] leading-5 text-fg-2">
                    {recommendation.reasons.slice(0, 4).map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className={cn(buttonClass({ size: "sm" }), "mt-4 w-full")}
                    aria-label={`업무 ${recommendation.task.title} 담당자를 ${recommendation.candidateName}에게 배정`}
                    disabled={!canEdit || assigningTaskId !== null}
                    onClick={() => void applyRecommendedAssignment(recommendation)}
                  >
                    {assigning ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
                    {assigning ? "배정 중…" : canEdit ? "추천 담당자 배정" : "편집 권한 필요"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line p-8 text-center">
            {overview.unassignedTaskCount === 0
              ? <CheckCircle2 className="mx-auto size-8 text-good" aria-hidden="true" />
              : <Users className="mx-auto size-8 text-warn" aria-hidden="true" />}
            <p className="mt-3 text-sm font-black text-fg">
              {overview.unassignedTaskCount === 0 ? "모든 열린 업무에 책임자가 있습니다" : "현재 규칙으로 추천할 담당자가 없습니다"}
            </p>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {overview.unassignedTaskCount === 0
                ? "새 업무가 생성되면 역할과 작업량을 다시 계산합니다."
                : "해당 공정의 역할 범위, 활성 기간 또는 프로젝트 참여자를 확인해 주세요."}
            </p>
          </div>
        )}
        {overview.assignmentRecommendations.length > 0 && overview.uncoveredUnassignedTaskCount > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/35 bg-warn/10 p-3">
            <div>
              <p className="text-xs font-black text-fg">적합 후보가 없는 업무 {overview.uncoveredUnassignedTaskCount}개</p>
              <p className="mt-1 text-[0.6875rem] leading-5 text-fg-2">역할 범위 또는 참여 기간을 보강해야 배정 추천을 만들 수 있습니다.</p>
            </div>
            <Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/settings`}>
              팀 설정 열기
            </Link>
          </div>
        ) : null}
      </Section>

      <Section
        title="회차 공정 매트릭스"
        description="회차, 공정, 게시 마감과 차단 상태를 한 행에서 비교합니다. 셀의 색상과 텍스트를 함께 제공해 고대비 환경에서도 상태를 구분합니다."
        action={<Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/episodes`}>회차 운영실 <ArrowRight className="size-3.5" aria-hidden="true" /></Link>}
      >
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[62rem] border-collapse text-left">
            <thead className="bg-panel">
              <tr className="border-b border-line text-[0.6875rem] font-black uppercase tracking-[0.08em] text-fg-3">
                <th className="sticky left-0 z-10 min-w-64 bg-panel px-3 py-3">회차·마감</th>
                {overview.episodeRows[0]?.phases.map((phase) => <th key={phase.key} className="px-3 py-3 text-center">{phase.label}</th>)}
                <th className="min-w-32 px-3 py-3 text-center">전체 진행</th>
              </tr>
            </thead>
            <tbody>
              {overview.episodeRows.map((row) => {
                const operations = row.operations;
                const episodeHref = `${projectBase}/episodes/${encodeURIComponent(operations.episode.episodeId)}`;
                return (
                  <tr key={operations.episode.id} className="border-b border-line last:border-b-0 hover:bg-raised/50">
                    <th className="sticky left-0 z-10 bg-card px-3 py-3 font-normal">
                      <Link to={episodeHref} className="group block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-fg">{operations.episodeNumber ? `${operations.episodeNumber}화` : operations.episode.episodeId}</span>
                          <Pill tone={operations.health === "critical" ? "danger" : operations.health === "risk" || operations.health === "unplanned" ? "warning" : operations.health === "published" ? "success" : "accent"}>
                            {episodeHealthLabel(operations.health)}
                          </Pill>
                        </span>
                        <span className="mt-1 block max-w-56 truncate text-xs font-semibold text-fg-2">{operations.title}</span>
                        <span className="mt-1 block text-[0.6875rem] text-fg-3">
                          {relativeDeadline(operations.daysUntilRelease)} · {formatDate(operations.releaseAt)}
                        </span>
                      </Link>
                    </th>
                    {row.phases.map((phase) => (
                      <td key={phase.key} className="px-3 py-3 text-center">
                        <PhaseCell status={phase.status} progressPercent={phase.progressPercent} taskCount={phase.taskCount} />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="mx-auto max-w-28">
                        <div className="flex items-center justify-between gap-2 text-[0.6875rem]">
                          <span className="text-fg-3">진행률</span>
                          <span className="font-black text-fg">{operations.progressPercent}%</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised" aria-label={`${operations.title} 진행률 ${operations.progressPercent}%`}>
                          <div className={cn("h-full rounded-full", operations.progressPercent >= 100 ? "bg-good" : operations.health === "critical" ? "bg-bad" : "bg-accent")} style={{ width: `${operations.progressPercent}%` }} />
                        </div>
                        <p className="mt-1 text-center text-[0.625rem] text-fg-3">잔여 {operations.remainingHours}h</p>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.55fr)]">
        <Section
          title="팀 작업량"
          description="향후 14일의 미완료 업무를 기본 주 40시간 가용량과 비교합니다. 실제 근무 캘린더가 연결되면 해당 값으로 대체할 수 있습니다."
          action={<Link className={buttonClass({ variant: "outline", size: "sm" })} to={`${projectBase}/schedule`}>작업량 조정 <ArrowRight className="size-3.5" aria-hidden="true" /></Link>}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {overview.workload.slice(0, 8).map((entry) => {
              const tone: Tone = entry.health === "overloaded" ? "danger" : entry.health === "busy" ? "warning" : "success";
              return (
                <article key={entry.assignment.id} className="rounded-xl border border-line bg-panel p-3">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-fg">{entry.name}</p>
                      <p className="mt-1 truncate text-[0.6875rem] text-fg-3">{entry.roleLabel}</p>
                    </div>
                    <Pill tone={tone}>{entry.loadPercent}%</Pill>
                  </header>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised" aria-label={`${entry.name} 작업량 ${entry.loadPercent}%`}>
                    <div className={cn("h-full rounded-full", entry.health === "overloaded" ? "bg-bad" : entry.health === "busy" ? "bg-warn" : "bg-good")} style={{ width: `${Math.min(100, entry.loadPercent)}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[0.625rem]">
                    <div><p className="text-fg-3">공수</p><p className="mt-1 font-black text-fg">{entry.remainingHours}h</p></div>
                    <div><p className="text-fg-3">업무</p><p className="mt-1 font-black text-fg">{entry.taskCount}</p></div>
                    <div><p className="text-fg-3">차단</p><p className={cn("mt-1 font-black", entry.blockedCount > 0 ? "text-bad" : "text-fg")}>{entry.blockedCount}</p></div>
                    <div><p className="text-fg-3">검수</p><p className="mt-1 font-black text-fg">{entry.reviewCount}</p></div>
                  </div>
                </article>
              );
            })}
          </div>
        </Section>

        <Section
          title="최근 프로젝트 활동"
          description="승인·권리·보상과 일정 변경은 수정할 수 없는 기록으로 남깁니다."
        >
          <div className="space-y-2">
            {[...aggregate.auditEvents].reverse().slice(0, 6).map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised text-fg-3">
                  <Activity className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-fg">{event.action}</p>
                  <p className="mt-1 truncate text-[0.6875rem] text-fg-3">{event.targetType} · {event.targetId}</p>
                  <p className="mt-1 text-[0.625rem] text-fg-3">r{event.aggregateRevision} · {formatDateTime(event.occurredAt)}</p>
                </div>
              </div>
            ))}
            {aggregate.auditEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-6 text-center">
                <Sparkles className="mx-auto size-6 text-fg-3" aria-hidden="true" />
                <p className="mt-2 text-xs font-bold text-fg">기록된 활동이 없습니다</p>
              </div>
            ) : null}
          </div>
        </Section>
      </div>
    </div>
  );
}
