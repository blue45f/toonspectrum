import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { ArrowRight, ClipboardCheck, MessageSquareMore } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ProductionReviewWorkspace } from "./ProductionReviewWorkspace";
import type { ProductionClientCommand } from "./production-api";
import { deriveEpisodeApprovalGate } from "./production-episode-room-model";
import {
  productionAssignmentName,
  reviewDecisionLabel,
  reviewDecisionTone,
  reviewLaneLabel,
} from "./production-labels";
import { productionEpisodeRoomPath } from "./production-project-surfaces";
import { formatProductionRelative } from "./production-format";
import { ProductionAvatar, ProductionEmptyState, ProductionPill, ProductionSectionCard } from "./production-ui";

import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 검수 화면: 검수할 회차(승인 게이트 요약) → 원고 비교·주석 작업대 → 결정 기록 순서로 보여 준다.
 * 원고 위 핀 코멘트는 회차 룸에서 남기고, 여기서는 무엇이 게시를 막는지 한눈에 본다.
 */
export function ProductionReviewSurface({
  aggregate,
  execute,
  canEdit,
  roleLens,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly canEdit: boolean;
  readonly roleLens: CreatorRoleLens;
}) {
  const bt = useBilingual("ProductionReviewSurface");
  const [now] = useState(() => Date.now());
  const queue = aggregate.episodes
    .map((episode) => {
      const gate = deriveEpisodeApprovalGate(aggregate, episode.episodeId);
      const plan = aggregate.episodePlans
        .filter((entry) => entry.episodeId === episode.episodeId)
        .sort((left, right) => right.revision - left.revision)[0];
      const handoffIds = new Set(aggregate.handoffs.filter((handoff) => handoff.episodeId === episode.episodeId).map((handoff) => handoff.id));
      const openQuestions = aggregate.clarifications.filter((thread) => handoffIds.has(thread.handoffId) && thread.status === "open").length;
      return { episode, gate, plan, openQuestions };
    })
    .filter((entry) => entry.gate.policyId !== null && entry.episode.state !== "published");
  const decisions = [...aggregate.reviewDecisions].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return (
    <div className="space-y-4">
      <ProductionSectionCard
        title={bt("검수할 회차", "Episodes to review")}
        description={bt("역할별 승인이 모두 모여야 게시할 수 있습니다. 원고 위 핀 코멘트는 회차 룸에서 남깁니다.", "Every role must approve before publishing. Leave pinned comments in the episode room.")}
      >
        {queue.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {queue.map(({ episode, gate, plan, openQuestions }) => {
              const approvedCount = gate.lanes.filter((lane) => lane.approved).length;
              return (
                <li key={episode.episodeId}>
                  <Link
                    to={productionEpisodeRoomPath(aggregate.projectId, episode.episodeId)}
                    className="group block rounded-2xl border border-line bg-panel p-4 outline-none transition-colors hover:border-accent/45 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-black text-fg group-hover:text-accent">
                        {plan ? bt(`${plan.episodeNumber}화 · ${plan.title}`, `Ep. ${plan.episodeNumber} · ${plan.title}`) : episode.episodeId}
                      </p>
                      <ProductionPill tone={gate.approved ? "success" : "warning"}>
                        <ClipboardCheck className="size-3" aria-hidden="true" />
                        {bt(`승인 ${approvedCount}/${gate.lanes.length}`, `${approvedCount}/${gate.lanes.length} approved`)}
                      </ProductionPill>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {gate.lanes.map((lane) => (
                        <li key={lane.lane}>
                          <ProductionPill tone={lane.approved ? "success" : lane.changeRequested ? "danger" : "neutral"}>
                            {reviewLaneLabel(lane.lane, bt)} · {lane.approved ? bt("승인", "OK") : lane.changeRequested ? bt("수정 요청", "Changes") : bt("대기", "Waiting")}
                          </ProductionPill>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 flex items-center justify-between gap-2 text-xs text-fg-2">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquareMore className="size-3.5" aria-hidden="true" />
                        {openQuestions ? bt(`답을 기다리는 질문 ${openQuestions}개`, `${openQuestions} open questions`) : bt("열린 질문 없음", "No open questions")}
                      </span>
                      <span className="inline-flex items-center gap-1 font-bold text-accent">
                        {bt("회차 룸에서 검수", "Review in room")}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                      </span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <ProductionEmptyState
            title={bt("검수 기준이 있는 회차가 없습니다", "No episodes with review rules")}
            description={bt("스토리·그림·제작·권리별 검수 항목과 필수 승인 수를 정하면 여기에 모입니다.", "Set review lanes and required approvals to see episodes here.")}
          />
        )}
      </ProductionSectionCard>

      <ProductionReviewWorkspace aggregate={aggregate} execute={execute} canEdit={canEdit} roleLens={roleLens} />

      <ProductionSectionCard
        title={bt("결정 기록", "Decision log")}
        description={bt("수정 요청과 거부는 확정된 의도·설정·규격·권리 조건을 근거로 남깁니다.", "Change requests and vetoes cite agreed intent, canon, specs or rights.")}
      >
        {decisions.length ? (
          <ul className="space-y-2">
            {decisions.map((decision) => {
              const name = productionAssignmentName(aggregate, decision.assignmentId);
              return (
                <li key={decision.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-panel p-3 text-xs">
                  <ProductionAvatar name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-fg">{name}</span>
                      <ProductionPill tone={reviewDecisionTone(decision.value)}>{reviewLaneLabel(decision.lane, bt)} · {reviewDecisionLabel(decision.value, bt)}</ProductionPill>
                      <span className="text-fg-3">{formatProductionRelative(decision.createdAt, now, bt)}</span>
                    </p>
                    {decision.conditions.length ? (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-fg-2">
                        {decision.conditions.map((condition) => <li key={condition}>{condition}</li>)}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-3">{bt("아직 기록된 결정이 없습니다.", "No decisions yet.")}</p>
        )}
      </ProductionSectionCard>
    </div>
  );
}
