import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Inbox,
  MessageSquareMore,
  OctagonAlert,
  PanelTopOpen,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import {
  clarificationStatusLabel,
  episodeStateLabel,
  episodeStateTone,
  productionAssignmentName,
  productionProcessLabel,
  reviewDecisionLabel,
  reviewDecisionTone,
  reviewLaneLabel,
  type ProductionLocalize,
} from "./production-labels";
import {
  deriveProductionDashboard,
  type ProductionDashboardFeedback,
  type ProductionDashboardNextStep,
} from "./production-project-dashboard-model";
import { productionEpisodeRoomPath, productionSurfacePath } from "./production-project-surfaces";
import { formatProductionDday, formatProductionRelative, productionDaysUntil } from "./production-format";
import { ProductionAvatar, ProductionPill } from "./production-ui";
import { BOARD_STATUS_LABELS } from "./production-workboard-model";

import { buttonClass } from "@/shared/components/ui/button-utils";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const LENS_LABELS: Readonly<Record<CreatorRoleLens, { readonly ko: string; readonly en: string }>> = Object.freeze({
  story: { ko: "스토리 작가", en: "Story writer" },
  art: { ko: "그림 작가", en: "Artist" },
  producer: { ko: "PD·편집자", en: "Producer" },
});

function DashboardCard({
  title,
  icon: Icon,
  aside,
  children,
  className,
}: {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5", className)}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black text-fg">
          <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function nextStepCopy(step: ProductionDashboardNextStep, projectId: string, bt: ProductionLocalize) {
  switch (step.kind) {
    case "answer-question":
      return {
        tone: "danger" as const,
        title: bt("막힌 질문에 먼저 답해 주세요", "Answer the blocking question first"),
        detail: step.text,
        action: bt("회차 룸에서 답하기", "Answer in the episode room"),
        href: productionEpisodeRoomPath(projectId, step.episodeId),
      };
    case "overdue":
      return {
        tone: "warning" as const,
        title: bt(`기한이 지난 작업 ${step.count}건`, `${step.count} overdue tasks`),
        detail: bt("공정 보드에서 기한 지난 작업만 모아 담당과 마감을 조정하세요.", "Filter overdue work on the board and adjust owners or dates."),
        action: bt("기한 지난 작업 보기", "See overdue work"),
        href: productionSurfacePath(projectId, "production", "boardFocus=overdue"),
      };
    case "review":
      return {
        tone: "accent" as const,
        title: bt(`검수 대기 ${step.count}건`, `${step.count} waiting for review`),
        detail: bt("원고 위 핀 코멘트와 역할별 승인을 확인하세요.", "Check pinned comments and role approvals."),
        action: bt("검수 열기", "Open review"),
        href: productionSurfacePath(projectId, "review"),
      };
    case "board":
      return {
        tone: "success" as const,
        title: bt("급한 일이 없습니다", "Nothing urgent"),
        detail: bt("공정 보드에서 다음 작업을 시작하세요.", "Start the next task on the board."),
        action: bt("공정 보드 열기", "Open the board"),
        href: productionSurfacePath(projectId, "production"),
      };
  }
}

function FeedbackRow({
  aggregate,
  entry,
  now,
  bt,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly entry: ProductionDashboardFeedback;
  readonly now: number;
  readonly bt: ProductionLocalize;
}) {
  const author = productionAssignmentName(aggregate, entry.authorAssignmentId);
  const href = entry.kind === "question" && entry.episodeId
    ? productionEpisodeRoomPath(aggregate.projectId, entry.episodeId)
    : productionSurfacePath(aggregate.projectId, "review");
  const urgent = entry.kind === "question" && entry.blocking && entry.status === "open";
  return (
    <li>
      <Link
        to={href}
        className={cn(
          "flex gap-3 rounded-xl border p-3 outline-none transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
          urgent ? "border-bad/35 bg-bad/10" : "border-line bg-panel",
        )}
      >
        <ProductionAvatar name={author} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-fg">{author}</span>
            {entry.kind === "question" ? (
              <ProductionPill tone={urgent ? "danger" : entry.status === "open" ? "warning" : "success"}>
                {urgent ? <OctagonAlert className="size-3" aria-hidden="true" /> : null}
                {urgent ? bt("진행 막힘", "Blocking") : clarificationStatusLabel(entry.status, bt)}
              </ProductionPill>
            ) : (
              <ProductionPill tone={reviewDecisionTone(entry.value)}>
                {reviewLaneLabel(entry.lane, bt)} · {reviewDecisionLabel(entry.value, bt)}
              </ProductionPill>
            )}
            <span className="text-[0.6875rem] text-fg-3">{formatProductionRelative(entry.at, now, bt)}</span>
          </span>
          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-fg-2">
            {entry.kind === "question" ? entry.text : entry.conditions[0] ?? bt("조건 없이 기록된 결정입니다.", "Recorded without conditions.")}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * 프로젝트 개요의 첫 화면. 진행률·마감 임박 회차·내 할 일·최근 피드백 네 가지만 보여 주고,
 * 가장 급한 다음 행동 하나를 강조한다.
 */
export function ProductionProjectDashboard({
  aggregate,
  roleLens,
  viewerAssignmentIds,
  now: nowProp,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly roleLens: CreatorRoleLens;
  readonly viewerAssignmentIds: readonly string[];
  readonly now?: Date;
}) {
  const bt = useBilingual("ProductionProjectDashboard");
  const nowTime = nowProp?.getTime();
  const now = useMemo(() => (nowTime === undefined ? new Date() : new Date(nowTime)), [nowTime]);
  // 부모가 매번 새 배열을 넘겨도 같은 참여자면 다시 계산하지 않는다.
  const viewerKey = viewerAssignmentIds.join("\u0000");
  const dashboard = useMemo(
    () => deriveProductionDashboard(aggregate, { now, roleLens, viewerAssignmentIds: viewerKey ? viewerKey.split("\u0000") : [] }),
    [aggregate, now, roleLens, viewerKey],
  );
  const next = nextStepCopy(dashboard.nextStep, aggregate.projectId, bt);
  const { progress } = dashboard;
  const lens = LENS_LABELS[roleLens];
  return (
    <div data-production-dashboard="true" className="grid gap-4 xl:grid-cols-12">
      <section
        aria-labelledby="production-dashboard-progress"
        className="relative overflow-hidden rounded-3xl border border-accent/30 bg-gradient-to-br from-accent-soft via-card to-card p-5 shadow-sm xl:col-span-12"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full border border-accent/15" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-center">
          <div>
            <h2 id="production-dashboard-progress" className="text-xs font-black uppercase tracking-[0.14em] text-accent">
              {bt("전체 진행률", "Overall progress")}
            </h2>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
              <p className="text-5xl font-black tracking-tight text-fg tabular-nums">
                {progress.percent}
                <span className="text-2xl text-fg-3">%</span>
              </p>
              <p className="pb-2 text-sm text-fg-2">
                {bt(`작업 ${progress.total}개 중 ${progress.completed}개 승인·완료`, `${progress.completed} of ${progress.total} tasks approved or done`)}
              </p>
            </div>
            <div
              role="progressbar"
              aria-label={bt("전체 작업 진행률", "Overall task progress")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              className="mt-3 h-2.5 overflow-hidden rounded-full bg-raised"
            >
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-cool" style={{ width: `${progress.percent}%` }} />
            </div>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              <li><ProductionPill tone="accent"><ClipboardCheck className="size-3" aria-hidden="true" />{bt(`검수 중 ${progress.inReview}`, `${progress.inReview} in review`)}</ProductionPill></li>
              <li><ProductionPill tone={progress.blocked ? "danger" : "success"}><AlertTriangle className="size-3" aria-hidden="true" />{bt(`막힘·입력 필요 ${progress.blocked}`, `${progress.blocked} blocked`)}</ProductionPill></li>
              <li><ProductionPill tone="success"><CheckCircle2 className="size-3" aria-hidden="true" />{bt(`완료 ${progress.completed}`, `${progress.completed} done`)}</ProductionPill></li>
            </ul>
          </div>
          <div
            className={cn(
              "rounded-2xl border p-4",
              next.tone === "danger" ? "border-bad/40 bg-bad/10" : next.tone === "warning" ? "border-warn/40 bg-warn/10" : next.tone === "success" ? "border-good/40 bg-good/10" : "border-accent/40 bg-card",
            )}
          >
            <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-fg-3">{bt("지금 할 일", "Do this now")}</p>
            <p className="mt-1 text-base font-black text-fg">{next.title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-fg-2">{next.detail}</p>
            <Link className={buttonClass({ size: "sm", className: "mt-3 min-h-11 w-full gap-1.5" })} to={next.href}>
              {next.action}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <DashboardCard
        title={bt("마감 임박 회차", "Upcoming episodes")}
        icon={PanelTopOpen}
        className="xl:col-span-7"
        aside={<Link className="text-xs font-bold text-accent hover:underline" to={productionSurfacePath(aggregate.projectId, "episodes")}>{bt("전체 회차", "All episodes")}</Link>}
      >
        {dashboard.episodes.length ? (
          <ul className="space-y-2">
            {dashboard.episodes.map((episode) => {
              const days = productionDaysUntil(episode.releaseAt, now.getTime());
              const late = days !== null && days < 0;
              return (
                <li key={episode.episodeId}>
                  <Link
                    to={productionEpisodeRoomPath(aggregate.projectId, episode.episodeId)}
                    className="group grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-line bg-panel p-3 outline-none transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent sm:grid-cols-[3rem_minmax(0,1fr)_7.5rem] motion-reduce:transition-none"
                  >
                    <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-accent to-cool text-sm font-black text-on-accent">
                      {episode.episodeNumber ?? "EP"}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-fg group-hover:text-accent">
                          {episode.episodeNumber ? bt(`${episode.episodeNumber}화 · ${episode.title}`, `Ep. ${episode.episodeNumber} · ${episode.title}`) : episode.title}
                        </span>
                        <ProductionPill tone={episodeStateTone(episode.state)}>{episodeStateLabel(episode.state, bt)}</ProductionPill>
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${episode.progressPercent}%` }} />
                        </span>
                        <span className="text-[0.6875rem] tabular-nums text-fg-3">{episode.progressPercent}%</span>
                      </span>
                      <span className="mt-1 block text-[0.6875rem] text-fg-3">
                        {bt(`열린 작업 ${episode.openTaskCount}`, `${episode.openTaskCount} open`)}
                        {episode.overdueCount ? <span className="text-bad"> · {bt(`기한 지남 ${episode.overdueCount}`, `${episode.overdueCount} overdue`)}</span> : null}
                      </span>
                    </span>
                    <span className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                      <span className={cn("inline-flex items-center gap-1 text-sm font-black tabular-nums", late ? "text-bad" : days !== null && days <= 3 ? "text-warn" : "text-fg")}>
                        <Clock3 className="size-3.5" aria-hidden="true" />
                        {formatProductionDday(days, bt)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                        {bt("회차 룸", "Room")}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">
            {bt("공개 전 회차가 없습니다. 회차 화면에서 다음 회차를 계획하세요.", "No upcoming episodes. Plan the next one in Episodes.")}
          </p>
        )}
      </DashboardCard>

      <DashboardCard title={bt("최근 피드백", "Recent feedback")} icon={MessageSquareMore} className="xl:col-span-5">
        {dashboard.feedback.length ? (
          <ul className="space-y-2">
            {dashboard.feedback.map((entry) => (
              <FeedbackRow key={`${entry.kind}:${entry.id}`} aggregate={aggregate} entry={entry} now={now.getTime()} bt={bt} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">
            {bt("아직 질문이나 검수 결정이 없습니다.", "No questions or review decisions yet.")}
          </p>
        )}
      </DashboardCard>

      <DashboardCard
        title={bt("내 할 일", "My tasks")}
        icon={Inbox}
        className="xl:col-span-12"
        aside={
          <span className="text-[0.6875rem] text-fg-3">
            {dashboard.todoScope === "role"
              ? bt(`${lens.ko} 관점 · 위 "내 역할"에서 바꿀 수 있어요`, `${lens.en} view · change it in "My role" above`)
              : bt("내가 담당하거나 검수할 작업", "Assigned to me or waiting for my review")}
          </span>
        }
      >
        {dashboard.todos.length ? (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.todos.map(({ task, relation, overdue }) => {
              const days = productionDaysUntil(task.dueAt, now.getTime());
              return (
                <li key={task.id}>
                  <Link
                    to={productionSurfacePath(aggregate.projectId, "production", `task=${encodeURIComponent(task.id)}`)}
                    className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-panel p-3 outline-none transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ProductionPill tone="accent">{productionProcessLabel(aggregate, task.processKey, bt)}</ProductionPill>
                      <ProductionPill tone={relation === "reviewer" ? "warning" : "neutral"}>
                        {relation === "reviewer" ? bt("검수할 차례", "To review") : BOARD_STATUS_LABELS[task.status]}
                      </ProductionPill>
                    </span>
                    <span className="line-clamp-2 text-sm font-bold leading-5 text-fg group-hover:text-accent">{task.title}</span>
                    <span className={cn("mt-auto inline-flex items-center gap-1 text-xs tabular-nums", overdue ? "font-bold text-bad" : "text-fg-3")}>
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      {formatProductionDday(days, bt)}
                      {overdue && days === 0 ? ` · ${bt("기한 지남", "Overdue")}` : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">
            {bt("지금 맡은 열린 작업이 없습니다.", "You have no open tasks right now.")}
          </p>
        )}
      </DashboardCard>
    </div>
  );
}
