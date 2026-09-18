import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CirclePlus,
  Clock3,
  Disc3,
  Gauge,
  Layers3,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import type {
  EpisodeCollaboration,
  EpisodePlan,
  ProductionProjectAggregate,
} from "@toonspectrum/core/production";

import {
  buildEpisodePipelinePlan,
  deriveProductionOperationsOverview,
  nextEpisodeNumber,
  suggestedReleaseAt,
  WEBTOON_EPISODE_PIPELINE,
  type EpisodeDeadlineHealth,
  type EpisodeOperationsRow,
} from "./production-episode-operations";
import type { ProductionClientCommand } from "./production-api";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface ProductionEpisodeOperationsWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
}

type Filter = "active" | "attention" | "all";

const EPISODE_STATE_LABELS: Readonly<Record<EpisodeCollaboration["state"], string>> = {
  "episode-planning": "회차 기획",
  "story-drafting": "스토리 초안",
  "story-review": "스토리 검수",
  "story-ready-for-art": "작화 준비",
  "art-clarification": "작화 질문",
  thumbnailing: "콘티 제작",
  "thumbnail-joint-review": "공동 콘티 검수",
  "thumbnail-locked": "콘티 확정",
  "final-art-production": "최종 작화",
  "lettering-and-integration": "식자·통합",
  "joint-proof": "공동 교정",
  "publish-ready": "공개 준비",
  published: "공개됨",
  blocked: "차단",
  "paused-health": "건강 사유 휴식",
  "paused-contract": "계약 보류",
  "change-request-open": "변경 검토",
  "creator-replacement": "창작자 교체",
  cancelled: "취소",
};

const HEALTH_LABELS: Readonly<Record<EpisodeDeadlineHealth, string>> = {
  published: "게시 완료",
  critical: "즉시 조치",
  risk: "일정 주의",
  healthy: "일정 정상",
  unplanned: "마감 미정",
};

const HEALTH_STYLES: Readonly<Record<EpisodeDeadlineHealth, string>> = {
  published: "border-good/35 bg-good/10 text-good",
  critical: "border-bad/40 bg-bad/10 text-bad",
  risk: "border-warn/40 bg-warn/10 text-warn",
  healthy: "border-cool/35 bg-cool/10 text-cool",
  unplanned: "border-line bg-raised text-fg-2",
};

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null): string {
  if (!value) return "게시 마감 미정";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : "게시 마감 미정";
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateTimeLocalToIso(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function relativeDeadline(days: number | null): string {
  if (days === null) return "일정 미정";
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘 게시";
  return `D-${days}`;
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
  readonly icon: typeof CalendarClock;
  readonly tone?: "neutral" | "accent" | "warning" | "danger" | "success";
}) {
  const toneClass = {
    neutral: "border-line bg-card",
    accent: "border-accent/35 bg-accent-soft",
    warning: "border-warn/35 bg-warn/10",
    danger: "border-bad/35 bg-bad/10",
    success: "border-good/35 bg-good/10",
  }[tone];
  return (
    <div className={cn("rounded-2xl border p-4", toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{label}</p>
        <Icon className="size-4 text-fg-3" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-fg">{value}</p>
      <p className="mt-1 text-xs leading-5 text-fg-2">{detail}</p>
    </div>
  );
}

function HealthBadge({ health }: { readonly health: EpisodeDeadlineHealth }) {
  return (
    <span className={cn(
      "inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold",
      HEALTH_STYLES[health],
    )}>
      {HEALTH_LABELS[health]}
    </span>
  );
}

function ProgressBar({ value }: { readonly value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-raised" aria-label={`공정 진행률 ${value}%`}>
      <div
        className={cn("h-full rounded-full", value >= 100 ? "bg-good" : value >= 70 ? "bg-accent" : "bg-warn")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function EpisodeOperationsCard({
  aggregate,
  row,
  execute,
  canEdit,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly row: EpisodeOperationsRow;
  readonly execute: ProductionEpisodeOperationsWorkspaceProps["execute"];
  readonly canEdit: boolean;
}) {
  const [releaseDraft, setReleaseDraft] = useState(toDateTimeLocal(row.releaseAt));
  const [saving, setSaving] = useState(false);
  const releaseChanged = releaseDraft !== toDateTimeLocal(row.releaseAt);
  const attention = row.health === "critical" || row.health === "risk";
  const episodeLabel = row.episodeNumber ? `${row.episodeNumber}화` : row.episode.episodeId;

  const saveSchedule = async () => {
    const releaseAt = dateTimeLocalToIso(releaseDraft);
    if (!releaseAt || saving || !canEdit) return;
    const plan = buildEpisodePipelinePlan({
      aggregate,
      episode: row.episode,
      episodePlan: row.plan,
      releaseAt,
      rebaselineExisting: true,
    });
    setSaving(true);
    try {
      await execute({
        type: "upsert-episode-operations",
        episodeId: row.episode.episodeId,
        tasks: plan.tasks,
      }, `${episodeLabel} 게시 마감과 미완료 공정을 다시 배치했습니다.`);
    } finally {
      setSaving(false);
    }
  };

  const musicHref = `/studio/assets/audio?workId=${encodeURIComponent(aggregate.workId)}&episodeId=${encodeURIComponent(row.episode.episodeId)}`;
  const episodeHref = `/production/projects/${encodeURIComponent(aggregate.projectId)}/episodes/${encodeURIComponent(row.episode.episodeId)}`;

  return (
    <article aria-label={`${episodeLabel} 연재 운영`} className={cn(
      "rounded-2xl border bg-card p-4 sm:p-5",
      row.health === "critical" ? "border-bad/45" : row.health === "risk" ? "border-warn/45" : "border-line",
    )}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-raised px-2 py-1 text-xs font-black text-accent">{episodeLabel}</span>
            <HealthBadge health={row.health} />
            <span className="text-xs text-fg-3">{EPISODE_STATE_LABELS[row.episode.state]}</span>
          </div>
          <h3 className="mt-2 truncate text-lg font-black text-fg">{row.title}</h3>
          <p className="mt-1 text-xs text-fg-2">
            {formatDateTime(row.releaseAt)} · <span className={attention ? "font-bold text-warn" : "font-semibold text-fg"}>{relativeDeadline(row.daysUntilRelease)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={buttonClass({ variant: "outline", size: "sm" })} to={musicHref}>
            <Disc3 className="size-3.5" aria-hidden="true" /> 회차 음악
          </Link>
          <Link className={buttonClass({ variant: "outline", size: "sm" })} to={episodeHref}>
            공동 작업실 <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-bold text-fg">공정 진행률</span>
            <span className="font-black text-fg">{row.progressPercent}%</span>
          </div>
          <div className="mt-2"><ProgressBar value={row.progressPercent} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[0.6875rem] sm:grid-cols-4">
            <div><p className="text-fg-3">완료 작업</p><p className="mt-1 font-bold text-fg">{row.completedTasks}/{row.totalTasks}</p></div>
            <div><p className="text-fg-3">잔여 공수</p><p className="mt-1 font-bold text-fg">{row.remainingHours}h</p></div>
            <div><p className="text-fg-3">지연 작업</p><p className={cn("mt-1 font-bold", row.overdueTasks.length ? "text-bad" : "text-fg")}>{row.overdueTasks.length}건</p></div>
            <div><p className="text-fg-3">가용량 대비</p><p className={cn("mt-1 font-bold", (row.loadRatio ?? 0) > 1 ? "text-bad" : "text-fg")}>{row.loadRatio === null ? "—" : `${Math.round(row.loadRatio * 100)}%`}</p></div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">PM 확인 사유</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-5 text-fg-2">
            {row.healthReasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                {attention ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-good" aria-hidden="true" />}
                <span>{reason}</span>
              </li>
            ))}
            {row.missingProcessKeys.length > 0 ? (
              <li className="flex gap-2">
                <Layers3 className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span>표준 공정 {row.missingProcessKeys.length}개 미등록</span>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {row.riskyTasks.length > 0 || row.overdueTasks.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...new Map([...row.overdueTasks, ...row.riskyTasks].map((task) => [task.id, task])).values()].slice(0, 6).map((task) => (
            <span key={task.id} className="rounded-full border border-warn/30 bg-warn/10 px-2 py-1 text-[0.6875rem] font-semibold text-warn">
              {task.title} · {task.status}
            </span>
          ))}
        </div>
      ) : null}

      {row.episode.state !== "published" ? (
        <div className="mt-4 rounded-xl border border-line bg-panel p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="min-w-0 flex-1 text-xs font-semibold text-fg-2">
              게시 마감
              <input
                aria-label={`${episodeLabel} 게시 마감`}
                className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                type="datetime-local"
                value={releaseDraft}
                onChange={(event) => setReleaseDraft(event.target.value)}
                disabled={!canEdit || saving}
              />
            </label>
            <button
              type="button"
              className={buttonClass({ size: "sm" })}
              onClick={() => void saveSchedule()}
              disabled={!canEdit || saving || !releaseDraft || (!releaseChanged && row.missingProcessKeys.length === 0)}
            >
              <RefreshCw className={cn("size-3.5", saving && "animate-spin")} aria-hidden="true" />
              {saving ? "일정 재배치 중…" : row.missingProcessKeys.length > 0 ? "표준 공정 구성" : "미완료 공정 재배치"}
            </button>
          </div>
          <p className="mt-2 text-[0.6875rem] leading-5 text-fg-3">
            게시일을 기준으로 대본·콘티·선화·배경·채색·식자·권리 검수·공동 교정·게시 준비를 역산합니다. 완료된 작업의 마감은 바꾸지 않습니다.
          </p>
        </div>
      ) : null}
    </article>
  );
}

function NewEpisodeForm({
  aggregate,
  execute,
  canEdit,
  suggestedDate,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: ProductionEpisodeOperationsWorkspaceProps["execute"];
  readonly canEdit: boolean;
  readonly suggestedDate: Date;
}) {
  const episodeNumber = nextEpisodeNumber(aggregate);
  const [title, setTitle] = useState(`${episodeNumber}화 제목 미정`);
  const [releaseDraft, setReleaseDraft] = useState(toDateTimeLocal(suggestedDate.toISOString()));
  const [submitting, setSubmitting] = useState(false);
  const latestSeason = [...aggregate.seasonPlans].sort((left, right) => right.revision - left.revision)[0] ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || submitting) return;
    const releaseAt = dateTimeLocalToIso(releaseDraft);
    const normalizedTitle = title.trim();
    if (!releaseAt || !normalizedTitle) return;
    const episodeId = `episode-${episodeNumber}`;
    const now = new Date().toISOString();
    const episode: EpisodeCollaboration = {
      id: `episode-collaboration-${episodeNumber}`,
      projectId: aggregate.projectId,
      episodeId,
      revision: 0,
      state: "episode-planning",
      narrativeRevisionRef: null,
      visualRevisionRef: null,
      integratedRevisionRef: null,
      activeHandoffId: null,
      openBlockerCount: 0,
      storyLockApproved: false,
      thumbnailLockApproved: false,
      jointProofApproved: false,
      creditPreflightPassed: false,
      publicationPreflightPassed: false,
      updatedAt: now,
    };
    const episodePlan: EpisodePlan = {
      id: `episode-plan-${episodeId}`,
      projectId: aggregate.projectId,
      seasonId: latestSeason?.seasonId ?? null,
      episodeId,
      episodeNumber,
      revision: 1,
      status: "draft",
      title: normalizedTitle,
      logline: "새 회차의 핵심 사건과 독자 경험을 정리해 주세요.",
      openingHook: "",
      coreConflict: "",
      turningPoints: [],
      cliffhanger: "",
      characterRefs: [],
      locationRefs: [],
      targetCutCount: 60,
      targetScrollHeightPx: 80_000,
      dialogueDensity: "medium",
      difficulty: 3,
      riskIds: [],
      narrativeRevisionRef: null,
      approvedByAssignmentIds: [],
      createdAt: now,
    };
    const pipeline = buildEpisodePipelinePlan({
      aggregate,
      episode,
      episodePlan,
      releaseAt,
      rebaselineExisting: true,
    });
    setSubmitting(true);
    try {
      await execute({
        type: "upsert-episode-operations",
        episodeId,
        episode,
        episodePlan,
        tasks: pipeline.tasks,
      }, `${episodeNumber}화와 표준 제작 일정을 만들었습니다.`);
      setTitle(`${episodeNumber + 1}화 제목 미정`);
      const nextSuggested = new Date(releaseAt);
      nextSuggested.setDate(nextSuggested.getDate() + (latestSeason?.releaseCadenceDays ?? 7));
      setReleaseDraft(toDateTimeLocal(nextSuggested.toISOString()));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="rounded-2xl border border-dashed border-accent/40 bg-accent-soft p-4 sm:p-5" onSubmit={(event) => void submit(event)} aria-label="다음 회차 추가">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent"><CirclePlus className="size-5" aria-hidden="true" /></span>
        <div>
          <h2 className="font-black text-fg">다음 회차와 전체 공정을 한 번에 만들기</h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">회차 기획 문서와 9단계 표준 작업, 담당 역할, 의존성, 게시 마감을 하나의 저장으로 생성합니다.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.55fr)_auto] lg:items-end">
        <label className="text-xs font-semibold text-fg-2">
          회차 제목
          <input
            aria-label="새 회차 제목"
            className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            disabled={!canEdit || submitting}
          />
        </label>
        <label className="text-xs font-semibold text-fg-2">
          첫 게시 마감
          <input
            aria-label="새 회차 게시 마감"
            className="mt-1.5 min-h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            type="datetime-local"
            value={releaseDraft}
            onChange={(event) => setReleaseDraft(event.target.value)}
            disabled={!canEdit || submitting}
          />
        </label>
        <button type="submit" className={buttonClass({ size: "sm" })} disabled={!canEdit || submitting || !title.trim() || !releaseDraft}>
          <Sparkles className="size-3.5" aria-hidden="true" />{submitting ? "회차 생성 중…" : `${episodeNumber}화 생성`}
        </button>
      </div>
    </form>
  );
}

export function ProductionEpisodeOperationsWorkspace({
  aggregate,
  execute,
  canEdit,
}: ProductionEpisodeOperationsWorkspaceProps) {
  const [filter, setFilter] = useState<Filter>("active");
  const overview = useMemo(() => deriveProductionOperationsOverview(aggregate), [aggregate]);
  const rows = overview.rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "attention") return row.health === "critical" || row.health === "risk" || row.health === "unplanned";
    return row.episode.state !== "published" && row.episode.state !== "cancelled";
  });
  const nextRelease = overview.nextRelease;
  const operationsWarning = overview.criticalCount > 0
    ? `${overview.criticalCount}개 회차가 즉시 조치가 필요합니다.`
    : overview.readyBufferCount === 0
      ? "게시 준비 버퍼가 없습니다. 다음 회차를 병행하거나 연재 주기를 조정하세요."
      : `${overview.readyBufferCount}개 회차가 게시 버퍼로 준비되어 있습니다.`;
  const warningTone = overview.criticalCount > 0 ? "danger" : overview.readyBufferCount === 0 ? "warning" : "success";

  return (
    <div className="space-y-4">
      <header className="rounded-3xl border border-line bg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-accent"><ListChecks className="size-4" aria-hidden="true" /> Serialization operations</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-fg">연재·회차 운영실</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">작가와 PD가 회차별 제작 상태, 게시 마감, 공수와 버퍼를 같은 기준으로 보고 위험을 조기에 조정합니다.</p>
          </div>
          <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="회차 표시 범위">
            {(["active", "attention", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={cn("min-h-8 rounded-lg px-3 text-xs font-semibold", filter === value ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {value === "active" ? "진행 회차" : value === "attention" ? "주의 필요" : "전체"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="다음 게시"
          value={nextRelease ? relativeDeadline(nextRelease.daysUntilRelease) : "미정"}
          detail={nextRelease ? `${nextRelease.episodeNumber ? `${nextRelease.episodeNumber}화` : nextRelease.episode.episodeId} · ${formatDateTime(nextRelease.releaseAt)}` : "게시 마감이 있는 회차가 없습니다."}
          icon={CalendarClock}
          tone={nextRelease?.health === "critical" ? "danger" : "accent"}
        />
        <MetricCard label="연재 주기" value={overview.cadenceDays ? `${overview.cadenceDays}일` : "미정"} detail="시즌 계획 또는 게시 간격 기준" icon={TimerReset} />
        <MetricCard label="준비 버퍼" value={`${overview.readyBufferCount}화`} detail="다음 게시 외 공개 준비 완료 회차" icon={Layers3} tone={overview.readyBufferCount > 0 ? "success" : "warning"} />
        <MetricCard label="주의 회차" value={`${overview.criticalCount + overview.riskCount}화`} detail={`즉시 조치 ${overview.criticalCount} · 주의 ${overview.riskCount}`} icon={ShieldAlert} tone={overview.criticalCount > 0 ? "danger" : overview.riskCount > 0 ? "warning" : "success"} />
        <MetricCard label="잔여 공수" value={`${overview.remainingHours}h`} detail={`지연 ${overview.overdueTaskCount}건 · 차단 질문 ${overview.openBlockerCount}건`} icon={Clock3} tone={overview.overdueTaskCount > 0 ? "warning" : "neutral"} />
      </div>

      <div className={cn(
        "flex items-start gap-3 rounded-2xl border p-4",
        warningTone === "danger" ? "border-bad/35 bg-bad/10" : warningTone === "warning" ? "border-warn/35 bg-warn/10" : "border-good/35 bg-good/10",
      )} role="status">
        {warningTone === "success" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" aria-hidden="true" /> : <AlertTriangle className={cn("mt-0.5 size-5 shrink-0", warningTone === "danger" ? "text-bad" : "text-warn")} aria-hidden="true" />}
        <div><p className="text-sm font-black text-fg">오늘의 운영 판단</p><p className="mt-1 text-xs leading-5 text-fg-2">{operationsWarning}</p></div>
      </div>

      <NewEpisodeForm aggregate={aggregate} execute={execute} canEdit={canEdit} suggestedDate={suggestedReleaseAt(overview)} />

      <section className="space-y-3" aria-label="회차 운영 목록">
        {rows.map((row) => <EpisodeOperationsCard key={row.episode.id} aggregate={aggregate} row={row} execute={execute} canEdit={canEdit} />)}
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center"><Gauge className="mx-auto size-6 text-fg-3" aria-hidden="true" /><p className="mt-3 font-bold text-fg">표시할 회차가 없습니다</p><p className="mt-1 text-xs text-fg-2">필터를 바꾸거나 다음 회차를 생성하세요.</p></div>
        ) : null}
      </section>

      <details className="rounded-2xl border border-line bg-card p-4">
        <summary className="cursor-pointer text-sm font-black text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">표준 웹툰 제작 공정 보기</summary>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {WEBTOON_EPISODE_PIPELINE.map((step, index) => (
            <div key={step.processKey} className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-[0.6875rem] font-black text-accent">{String(index + 1).padStart(2, "0")}</span><span className="text-[0.6875rem] text-fg-3">게시 {step.daysBeforeRelease ? `${step.daysBeforeRelease}일 전` : "당일"}</span></div>
              <p className="mt-1 text-sm font-bold text-fg">{step.label}</p>
              <p className="mt-1 text-[0.6875rem] leading-5 text-fg-2">기준 공수 {step.likelyHours}h · 선행 {step.dependencyProcessKeys.length ? step.dependencyProcessKeys.join(", ") : "없음"}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
