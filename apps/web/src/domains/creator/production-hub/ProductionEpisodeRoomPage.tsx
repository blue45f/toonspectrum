import "../studio-shell/creator-workflow-surfaces.css";
import {
  analyzeProductionChangeImpact,
  evaluateHandoffReadiness,
  type ClarificationThread,
  type ReviewDecision,
  type ReviewLane,
} from "@toonstudio/core/production";
import { ArrowLeft, Check, Layers3, PenLine, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { ProductionClarificationAnswer } from "./ProductionClarificationAnswer";
import { ProductionEpisodeQcChecklist } from "./ProductionEpisodeQcChecklist";
import { ProductionEpisodeReviewRoom } from "./ProductionEpisodeReviewRoom";
import { ProductionProjectHeader } from "./ProductionProjectHeader";
import { ProductionSampleJourneyGuide } from "./ProductionSampleJourneyGuide";
import { ProductionVisualPlanningWorkspace } from "./ProductionVisualPlanningWorkspace";
import { productionDemoAdapter } from "./production-demo-adapter";
import {
  clarificationCategoryLabel,
  clarificationStatusLabel,
  episodeStateLabel,
  episodeStateTone,
  instructionPriorityLabel,
  instructionPriorityTone,
  latitudeLabel,
  productionAssignmentName,
  productionProcessLabel,
} from "./production-labels";
import { productionSurfacePath } from "./production-project-surfaces";
import { ProductionAvatar, ProductionEmptyState, ProductionPill, ProductionSectionCard } from "./production-ui";
import { usePreferredRoleLens } from "./use-preferred-role-lens";
import { useProductionProjectSession } from "./use-production-project-session";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

function TimelineStep({ label, active, done }: { readonly label: string; readonly active: boolean; readonly done: boolean }) {
  return (
    <li className="min-w-28 flex-1" aria-current={active ? "step" : undefined}>
      <div className={cn("h-1.5 rounded-full", done ? "bg-good" : active ? "bg-accent" : "bg-line")} />
      <p className={cn("mt-2 flex items-center gap-1 text-[0.6875rem] font-semibold", active ? "text-accent" : done ? "text-good" : "text-fg-3")}>
        {done ? <Check className="size-3" aria-hidden="true" /> : null}
        {label}
      </p>
    </li>
  );
}

function RoomState({ children, kind }: { readonly children: ReactNode; readonly kind: "pending" | "error" | "blocked" }) {
  return (
    <div
      data-route-pending={kind === "pending" ? "production-episode" : undefined}
      data-route-error={kind === "error" ? "production-episode" : undefined}
      data-route-blocked={kind === "blocked" ? "production-episode" : undefined}
      className="min-h-dvh bg-canvas p-6 text-fg"
    >
      <div className={cn("mx-auto max-w-3xl rounded-2xl border p-6", kind === "error" ? "border-bad/30 bg-bad/10" : "border-line bg-card", kind === "pending" && "animate-pulse motion-reduce:animate-none")}>
        {children}
      </div>
    </div>
  );
}

/**
 * 회차 룸: 한 회차의 원고 검수(핀 코멘트·버전 비교·승인), 스토리 의도, 막힌 질문,
 * 변경 영향을 한 화면에 모은다. 샘플 프로젝트는 서버 없이 이 브라우저에서만 동작한다.
 */
export function ProductionEpisodeRoomPage() {
  const params = useParams<{ projectId: string; episodeId: string }>();
  const actorId = useApp((state) => state.userId);
  const project = useProductionProjectSession(params.projectId, actorId, productionDemoAdapter);
  const [roleLens, setRoleLens] = usePreferredRoleLens("art");
  const [planningOpen, setPlanningOpen] = useState(false);
  const bt = useBilingual("ProductionEpisodeRoomPage");

  if (!params.projectId || !params.episodeId) return <Navigate to="/production" replace />;
  if (project.loading) return <RoomState kind="pending">{bt("회차 룸을 불러오는 중…", "Loading the episode room…")}</RoomState>;
  if (!project.aggregate || project.error) {
    return (
      <RoomState kind="error">
        <h1 className="font-bold">{bt("회차 룸을 열 수 없습니다", "Can't open the episode room")}</h1>
        <p className="mt-2 text-sm text-fg-2">{project.error ?? bt("회차 데이터가 없습니다.", "No episode data.")}</p>
        <Link className={buttonClass({ variant: "outline", className: "mt-4 min-h-11" })} to="/production">{bt("제작 관리 홈", "Production home")}</Link>
      </RoomState>
    );
  }

  const aggregate = project.aggregate;
  const episode = aggregate.episodes.find((entry) => entry.episodeId === params.episodeId);
  if (!episode) {
    return (
      <RoomState kind="blocked">
        <h1 className="font-bold">{bt("회차를 찾을 수 없습니다", "Episode not found")}</h1>
        <p className="mt-2 text-sm text-fg-2">{bt("삭제되었거나 주소가 바뀌었을 수 있습니다.", "It may have been removed or the link changed.")}</p>
        <Link className={buttonClass({ variant: "outline", className: "mt-4 min-h-11" })} to={productionSurfacePath(aggregate.projectId, "episodes")}>{bt("회차 목록", "Episode list")}</Link>
      </RoomState>
    );
  }

  const plan = [...aggregate.episodePlans]
    .filter((entry) => entry.episodeId === episode.episodeId)
    .sort((left, right) => right.revision - left.revision)[0] ?? null;
  const episodeTitle = plan
    ? bt(`${plan.episodeNumber}화 · ${plan.title}`, `Ep. ${plan.episodeNumber} · ${plan.title}`)
    : episode.episodeId;
  const handoff = aggregate.handoffs.find((entry) => entry.episodeId === episode.episodeId && !["superseded", "cancelled"].includes(entry.status));
  const clarifications = handoff ? aggregate.clarifications.filter((entry) => entry.handoffId === handoff.id) : [];
  const readiness = handoff ? evaluateHandoffReadiness({ package: handoff, clarifications }) : null;
  const viewerAssignment = aggregate.assignments.find((assignment) =>
    aggregate.parties.find((party) => party.id === assignment.partyId)?.accountUserId === actorId);
  const openChanges = aggregate.changeRequests.filter((request) =>
    request.episodeId === episode.episodeId && !["completed", "cancelled", "rejected"].includes(request.status));

  const pipeline = [
    { label: bt("스토리 확정", "Story locked"), done: episode.storyLockApproved, active: episode.state.startsWith("story") },
    { label: bt("작업 넘기기", "Handoff"), done: Boolean(episode.activeHandoffId), active: episode.state === "art-clarification" },
    { label: bt("콘티", "Storyboard"), done: episode.thumbnailLockApproved, active: episode.state.includes("thumbnail") },
    { label: bt("최종 원고", "Final art"), done: Boolean(episode.visualRevisionRef) && episode.thumbnailLockApproved, active: episode.state === "final-art-production" },
    { label: bt("최종 검수", "Final proof"), done: episode.jointProofApproved, active: episode.state === "joint-proof" },
    { label: bt("공개 준비", "Ready"), done: episode.state === "published", active: episode.state === "publish-ready" },
  ];

  const canAnswer = (thread: ClarificationThread) => project.access.edit && (project.isDemo
    ? roleLens === "story"
    : viewerAssignment?.id === thread.answerOwnerAssignmentId);

  const approveLane = async (lane: ReviewLane, assignmentId: string) => {
    const policy = aggregate.reviewPolicies.find((entry) => entry.scope.id === episode.episodeId);
    if (!policy) return;
    const decision: ReviewDecision = {
      id: `decision-${globalThis.crypto.randomUUID()}`,
      reviewRoundId: aggregate.reviewDecisions.find((entry) => policy.lanes.some((candidate) => candidate.lane === entry.lane))?.reviewRoundId ?? `${episode.episodeId}-round-1`,
      lane,
      assignmentId,
      value: "approve",
      reasonCode: null,
      evidenceScopeRefs: [policy.scope],
      conditions: [],
      createdAt: new Date().toISOString(),
    };
    await project.execute({ type: "record-review-decision", policyId: policy.id, decision }, bt("승인을 기록했습니다.", "Approval recorded."));
  };

  return (
    <div data-creator-workflow="production-episode" data-route-ready="production-episode" className="min-h-dvh bg-canvas text-fg">
      <ProductionProjectHeader aggregate={aggregate} access={project.access} roleLens={roleLens} onRoleLensChange={setRoleLens} saveState={project.saveState} isDemo={project.isDemo} />
      <div className="border-b border-line bg-card px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-[100rem]">
          {project.isDemo ? <ProductionSampleJourneyGuide location="episode-room" /> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Link className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-fg-3 hover:text-accent" to={productionSurfacePath(aggregate.projectId, "episodes")}>
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {bt("회차 목록", "Episodes")}
              </Link>
              <p className="text-[0.6875rem] font-black uppercase tracking-[0.14em] text-accent">{bt("회차 룸", "Episode room")}</p>
              <h1 className="mt-0.5 truncate text-2xl font-black tracking-tight text-fg">{episodeTitle}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ProductionPill tone={episodeStateTone(episode.state)}>{episodeStateLabel(episode.state, bt)}</ProductionPill>
              {readiness ? (
                <ProductionPill tone={readiness.ready ? "success" : "danger"}>
                  {bt(`넘기기 준비도 ${readiness.score}`, `Handoff readiness ${readiness.score}`)}
                </ProductionPill>
              ) : null}
              <Link className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })} to={productionSurfacePath(aggregate.projectId, "manuscripts", `episode=${encodeURIComponent(episode.episodeId)}`)}>
                <Layers3 className="size-4" aria-hidden="true" />
                {bt("원고·버전", "Manuscripts")}
              </Link>
            </div>
          </div>
          <ol className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label={bt("회차 진행 단계", "Episode stages")}>
            {pipeline.map((step) => <TimelineStep key={step.label} {...step} />)}
          </ol>
        </div>
      </div>

      <div className="mx-auto max-w-[100rem] space-y-4 p-4 sm:p-6">
        {project.notice ? (
          <div className={cn("rounded-xl border px-3 py-2 text-xs", project.saveState === "error" ? "border-bad/30 bg-bad/10 text-fg" : "border-good/30 bg-good/10 text-fg")} role="status">
            {project.notice}
          </div>
        ) : null}

        <ProductionEpisodeReviewRoom
          aggregate={aggregate}
          episodeId={episode.episodeId}
          isDemo={project.isDemo}
          canEdit={project.access.edit}
          roleLens={roleLens}
          viewerAssignmentId={viewerAssignment?.id ?? null}
          onApproveLane={approveLane}
        />

        <ProductionEpisodeQcChecklist aggregate={aggregate} episodeId={episode.episodeId} />

        <div className="grid gap-4 xl:grid-cols-3">
          <ProductionSectionCard
            title={bt("질문·결정", "Questions & decisions")}
            description={bt("장면과 컷에 붙은 협업 질문입니다. 막힌 질문은 답이 기록될 때까지 다음 공정을 잠급니다.", "Questions pinned to scenes and cuts. Blocking questions lock the next step until answered.")}
          >
            {clarifications.length ? (
              <ul className="space-y-2">
                {clarifications.map((thread) => {
                  const blockingOpen = thread.blocking && thread.status === "open";
                  const asker = productionAssignmentName(aggregate, thread.askedByAssignmentId);
                  const owner = productionAssignmentName(aggregate, thread.answerOwnerAssignmentId);
                  return (
                    <li key={thread.id} className={cn("rounded-xl border p-3", blockingOpen ? "border-bad/35 bg-bad/10" : "border-line bg-panel")}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ProductionPill tone={blockingOpen ? "danger" : "neutral"}>
                          {blockingOpen ? bt("진행 막힘", "Blocking") : clarificationCategoryLabel(thread.category, bt)}
                        </ProductionPill>
                        <ProductionPill tone={thread.status === "decision-recorded" ? "success" : "warning"}>{clarificationStatusLabel(thread.status, bt)}</ProductionPill>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-5 text-fg">{thread.question}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[0.6875rem] text-fg-3">
                        <ProductionAvatar name={asker} size="sm" />
                        {asker} → {owner}
                      </p>
                      {thread.answer ? <p className="mt-2 rounded-lg bg-raised p-2 text-xs leading-5 text-fg-2">{thread.answer}</p> : null}
                      {blockingOpen ? (
                        <ProductionClarificationAnswer
                          thread={thread}
                          canAnswer={canAnswer(thread)}
                          isDemo={project.isDemo}
                          execute={project.execute}
                          lockedHint={project.isDemo
                            ? bt(`${owner}님(답변 담당)만 기록할 수 있어요. 위 "내 역할"을 스토리 작가로 바꿔 보세요.`, `Only ${owner} (answer owner) can record it. Switch "My role" above to Story writer.`)
                            : bt(`${owner}님(답변 담당)만 기록할 수 있어요.`, `Only ${owner} (answer owner) can record it.`)}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ProductionEmptyState title={bt("열린 질문이 없습니다", "No open questions")} description={bt("작업 넘기기 화면에서 질문을 남기면 여기에 모입니다.", "Questions from the handoff show up here.")} />
            )}
          </ProductionSectionCard>

          <ProductionSectionCard
            title={bt("스토리 의도", "Story intent")}
            description={plan ? bt(`회차 기획 ${plan.revision}번째 버전 기준`, `From episode plan version ${plan.revision}`) : bt("회차 기획이 아직 없습니다", "No episode plan yet")}
          >
            {plan ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-accent/30 bg-accent-soft p-3">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-accent">{bt("한 줄 요약", "Logline")}</p>
                  <p className="mt-1.5 text-sm font-semibold leading-6 text-fg">{plan.logline}</p>
                </div>
                <dl className="space-y-2 text-xs">
                  {[
                    [bt("오프닝", "Opening"), plan.openingHook],
                    [bt("핵심 갈등", "Core conflict"), plan.coreConflict],
                    [bt("전환점", "Turning points"), plan.turningPoints.join(" → ")],
                    [bt("클리프행어", "Cliffhanger"), plan.cliffhanger],
                  ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 rounded-lg bg-panel p-2.5">
                      <dt className="text-fg-3">{label}</dt>
                      <dd className="text-fg">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <ProductionEmptyState title={bt("회차 기획이 없습니다", "No episode plan")} description={bt("기획 화면에서 한 줄 요약과 클리프행어를 정하면 여기에 표시됩니다.", "Set a logline and cliffhanger in Planning.")} />
            )}
          </ProductionSectionCard>

          <div className="space-y-4">
            <ProductionSectionCard
              title={bt("변경 영향", "Change impact")}
              description={bt("확정 이후 생긴 변경이 이후 공정·일정·계약에 주는 영향입니다.", "How changes after a lock affect later steps, schedule and contracts.")}
            >
              {openChanges.length ? (
                <ul className="space-y-2">
                  {openChanges.map((request) => {
                    const impact = analyzeProductionChangeImpact({ request });
                    return (
                      <li key={request.id} className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs">
                        <p className="font-semibold leading-5 text-fg">{request.reason}</p>
                        {impact.explanation[0] ? <p className="mt-1 leading-5 text-fg-2">{impact.explanation[0]}</p> : null}
                        {impact.affectedProcessKeys.length ? (
                          <p className="mt-1 text-fg-2">
                            {bt("영향 공정", "Affected")}: {impact.affectedProcessKeys.map((key) => productionProcessLabel(aggregate, key, bt)).join(" · ")}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {impact.requiresScheduleRebaseline ? <ProductionPill tone="warning">{bt("일정 재산정", "Reschedule")}</ProductionPill> : null}
                          {impact.requiresCompensationReview ? <ProductionPill tone="warning">{bt("보상 검토", "Pay review")}</ProductionPill> : null}
                          {impact.requiresAgreementChange ? <ProductionPill tone="danger">{bt("계약 변경", "Contract change")}</ProductionPill> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">{bt("열린 변경 요청이 없습니다.", "No open change requests.")}</p>
              )}
            </ProductionSectionCard>

            <ProductionSectionCard
              title={bt("꼭 지킬 것·자유로운 것", "Keep vs. free to change")}
              description={bt("스토리 의도와 그림 작가의 선택 범위를 함께 봅니다.", "Story intent alongside the artist's creative room.")}
            >
              {handoff?.instructions.length ? (
                <ul className="space-y-2">
                  {handoff.instructions.map((instruction) => (
                    <li key={instruction.id} className="rounded-xl border border-line bg-panel p-3">
                      <div className="flex flex-wrap gap-1.5">
                        <ProductionPill tone={instructionPriorityTone(instruction.priority)}>{instructionPriorityLabel(instruction.priority, bt)}</ProductionPill>
                        <ProductionPill>{latitudeLabel(instruction.latitude, bt)}</ProductionPill>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-fg">{instruction.text}</p>
                      <p className="mt-1 text-[0.6875rem] text-fg-3">{instruction.rationale}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-fg-3">{bt("넘길 작업 지시가 없습니다.", "No handoff instructions.")}</p>
              )}
            </ProductionSectionCard>
          </div>
        </div>

        <details
          className="group rounded-2xl border border-line bg-card"
          onToggle={(event) => setPlanningOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              {bt("컷 설계 작업대 — 장면·컷·세로 독자뷰", "Cut planning — scenes, cuts and scroll view")}
            </span>
            <span className="flex items-center gap-2 text-xs font-normal text-fg-3">
              {productionAssignmentName(aggregate, aggregate.assignments.find((entry) => entry.roleType === "art-lead")?.id ?? "")}
              <PenLine className="size-4" aria-hidden="true" />
            </span>
          </summary>
          {planningOpen ? (
            <div className="border-t border-line p-4">
              <ProductionVisualPlanningWorkspace
                aggregate={aggregate}
                execute={project.execute}
                canEdit={project.access.edit}
                initialEpisodeId={episode.episodeId}
                showEpisodeRail={false}
                compact
                defaultView="scroll"
              />
            </div>
          ) : null}
        </details>
      </div>
    </div>
  );
}
