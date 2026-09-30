import { evaluateHandoffReadiness, type CreativeInstructionPriority, type HandoffStatus, type ProductionProjectAggregate } from "@toonstudio/core/production";
import { AlertTriangle } from "lucide-react";

import { ProductionClarificationAnswer } from "./ProductionClarificationAnswer";
import type { ProductionClientCommand } from "./production-api";
import {
  clarificationCategoryLabel,
  clarificationStatusLabel,
  latitudeLabel,
  productionAssignmentName,
  type BilingualLabel,
} from "./production-labels";
import { ProductionEmptyState, ProductionPill, ProductionSectionCard } from "./production-ui";

import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

const HANDOFF_STATUS_LABELS: Readonly<Record<HandoffStatus, BilingualLabel>> = Object.freeze({
  draft: { ko: "초안", en: "Draft" },
  "internal-story-review": { ko: "스토리 내부 검토", en: "Story review" },
  "ready-to-offer": { ko: "넘길 준비 완료", en: "Ready to hand off" },
  "offered-to-art": { ko: "그림 작가 확인 중", en: "With the artist" },
  "clarification-open": { ko: "질문 답변 대기", en: "Questions open" },
  "accepted-by-art": { ko: "그림 작가 수락", en: "Accepted" },
  "production-started": { ko: "작화 시작", en: "In production" },
  superseded: { ko: "새 버전으로 대체", en: "Superseded" },
  cancelled: { ko: "취소", en: "Cancelled" },
});

const READINESS_METRIC_LABELS: Readonly<Record<string, BilingualLabel>> = Object.freeze({
  narrativeIntent: { ko: "서사 의도", en: "Narrative intent" },
  sceneStructure: { ko: "장면 구성", en: "Scene structure" },
  references: { ko: "참고 자료", en: "References" },
  dialogue: { ko: "확정 대사", en: "Locked dialogue" },
  continuity: { ko: "연속성", en: "Continuity" },
  technical: { ko: "규격", en: "Technical" },
  reviewOwnership: { ko: "검수 담당", en: "Review owners" },
  rightsAiCredit: { ko: "권리·AI·크레딧", en: "Rights, AI & credit" },
});

const INSTRUCTION_GROUPS: readonly { readonly priority: CreativeInstructionPriority; readonly label: BilingualLabel; readonly hint: BilingualLabel }[] = [
  { priority: "MUST_PRESERVE", label: { ko: "반드시 보존", en: "Must preserve" }, hint: { ko: "바꾸면 이야기가 달라지는 부분", en: "Changing it changes the story" } },
  { priority: "INTENT", label: { ko: "의도", en: "Intent" }, hint: { ko: "지켜야 할 감정과 목적", en: "Feeling and purpose to keep" } },
  { priority: "ARTIST_CHOICE", label: { ko: "작가 선택", en: "Artist's choice" }, hint: { ko: "그림 작가가 자유롭게 결정", en: "The artist decides freely" } },
  { priority: "DO_NOT_USE", label: { ko: "사용 금지", en: "Do not use" }, hint: { ko: "쓰면 안 되는 표현·요소", en: "Expressions to avoid" } },
];

export function ProductionHandoffSurface({
  aggregate,
  execute,
  roleLens,
  canEdit,
  isDemo,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: (command: ProductionClientCommand, message: string) => Promise<void>;
  readonly roleLens: CreatorRoleLens;
  readonly canEdit: boolean;
  readonly isDemo: boolean;
}) {
  const bt = useBilingual("ProductionHandoffSurface");
  const userId = useApp((state) => state.userId);
  const handoff = aggregate.handoffs.find((entry) => !["superseded", "cancelled"].includes(entry.status));
  if (!handoff) {
    return (
      <ProductionEmptyState
        title={bt("넘길 작업이 없습니다", "Nothing to hand off")}
        description={bt("스토리 확정 후 회차 의도와 참고 파일을 묶어 다음 작업자에게 전달하세요.", "After locking the story, bundle the episode intent and references for the next artist.")}
      />
    );
  }
  const clarifications = aggregate.clarifications.filter((entry) => entry.handoffId === handoff.id);
  const readiness = evaluateHandoffReadiness({ package: handoff, clarifications });
  const viewerAssignmentId = aggregate.assignments.find((assignment) =>
    aggregate.parties.find((party) => party.id === assignment.partyId)?.accountUserId === userId)?.id ?? null;
  const plan = aggregate.episodePlans.filter((entry) => entry.episodeId === handoff.episodeId).sort((left, right) => right.revision - left.revision)[0];
  const episodeName = plan ? bt(`${plan.episodeNumber}화 · ${plan.title}`, `Ep. ${plan.episodeNumber} · ${plan.title}`) : handoff.episodeId;
  const statusLabel = HANDOFF_STATUS_LABELS[handoff.status];

  return (
    <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <ProductionSectionCard
        title={bt("작업 넘기기 준비도", "Handoff readiness")}
        description={bt("필수 확인 항목이 하나라도 남으면 다음 작업을 시작할 수 없습니다.", "The next step can't start while a required item is missing.")}
      >
        <div className="flex items-end justify-between gap-4 rounded-xl border border-line bg-panel p-4">
          <div>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-fg-3">{bt("준비도", "Readiness")}</p>
            <p className="mt-1 text-4xl font-black text-fg">{readiness.score}<span className="text-base text-fg-3">/100</span></p>
          </div>
          <ProductionPill tone={readiness.ready ? "success" : "danger"}>
            {readiness.ready ? bt("작화 시작 가능", "Ready for art") : bt(`막힌 항목 ${readiness.hardBlocks.length}개`, `${readiness.hardBlocks.length} blockers`)}
          </ProductionPill>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(readiness.metrics).map(([key, value]) => {
            const label = READINESS_METRIC_LABELS[key];
            return (
              <div key={key} className="rounded-xl border border-line bg-panel p-2.5">
                <dt className="truncate text-[0.6875rem] text-fg-3">{label ? bt(label.ko, label.en) : key}</dt>
                <dd className="mt-1 font-bold text-fg">{value}</dd>
              </div>
            );
          })}
        </dl>
        <div className="mt-3 space-y-2">
          {readiness.hardBlocks.map((block) => (
            <p key={block.code} className="flex gap-2 rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs text-fg">
              <AlertTriangle className="size-4 shrink-0 text-bad" aria-hidden="true" />
              {block.message}
            </p>
          ))}
          {readiness.advisories.map((entry) => <p key={entry.code} className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg">{entry.message}</p>)}
        </div>
      </ProductionSectionCard>

      <div className="space-y-4">
        <ProductionSectionCard
          title={bt(`스토리 → 작화 · ${episodeName}`, `Story → art · ${episodeName}`)}
          description={bt(
            `스토리 ${handoff.storyLockRef ? `버전 ${handoff.storyLockRef.revision}` : "미확정"} · 넘기기 버전 ${handoff.handoffRevision}`,
            `Story ${handoff.storyLockRef ? `version ${handoff.storyLockRef.revision}` : "not locked"} · handoff version ${handoff.handoffRevision}`,
          )}
          action={<ProductionPill tone="accent">{bt(statusLabel.ko, statusLabel.en)}</ProductionPill>}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {INSTRUCTION_GROUPS.map((group) => {
              const entries = handoff.instructions.filter((entry) => entry.priority === group.priority);
              return (
                <div key={group.priority} className="rounded-xl border border-line bg-panel p-3">
                  <p className="text-xs font-bold text-fg">{bt(group.label.ko, group.label.en)}</p>
                  <p className="text-[0.6875rem] text-fg-3">{bt(group.hint.ko, group.hint.en)}</p>
                  <div className="mt-2 space-y-2">
                    {entries.map((entry) => (
                      <div key={entry.id} className="rounded-lg bg-raised p-2.5">
                        <p className="text-xs leading-5 text-fg">{entry.text}</p>
                        <p className="mt-1 text-[0.6875rem] text-fg-3">{bt("자율도", "Latitude")}: {latitudeLabel(entry.latitude, bt)}</p>
                      </div>
                    ))}
                    {entries.length === 0 ? <p className="text-xs text-fg-3">{bt("항목 없음", "None")}</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </ProductionSectionCard>

        <ProductionSectionCard
          title={bt("질문·결정", "Questions & decisions")}
          description={bt("막힌 질문은 답변이나 명시적인 위험 감수 전까지 다음 공정을 열지 않습니다.", "Blocking questions keep the next step closed until answered or the risk is accepted.")}
        >
          <div className="space-y-2">
            {clarifications.map((thread) => {
              const blockingOpen = thread.blocking && thread.status === "open";
              const owner = productionAssignmentName(aggregate, thread.answerOwnerAssignmentId);
              const canAnswer = canEdit && (isDemo ? roleLens === "story" : viewerAssignmentId === thread.answerOwnerAssignmentId);
              return (
                <article key={thread.id} className={cn("rounded-xl border p-3", blockingOpen ? "border-bad/30 bg-bad/10" : "border-line bg-panel")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <ProductionPill tone={thread.blocking ? "danger" : "neutral"}>{thread.blocking ? bt("진행 막힘", "Blocking") : clarificationCategoryLabel(thread.category, bt)}</ProductionPill>
                    <ProductionPill tone={thread.status === "decision-recorded" ? "success" : "warning"}>{clarificationStatusLabel(thread.status, bt)}</ProductionPill>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-fg">{thread.question}</p>
                  {thread.answer ? <p className="mt-2 rounded-lg bg-raised p-2.5 text-xs leading-5 text-fg-2">{bt("결정", "Decision")}: {thread.answer}</p> : null}
                  <p className="mt-2 text-[0.6875rem] text-fg-3">
                    {bt("질문", "Asked by")} {productionAssignmentName(aggregate, thread.askedByAssignmentId)} → {bt("답변", "Answer")} {owner}
                  </p>
                  {blockingOpen ? (
                    <ProductionClarificationAnswer
                      thread={thread}
                      canAnswer={canAnswer}
                      isDemo={isDemo}
                      execute={execute}
                      lockedHint={isDemo
                        ? bt(`${owner}님(답변 담당)만 기록할 수 있어요. 위 "내 역할"을 스토리 작가로 바꿔 보세요.`, `Only ${owner} (answer owner) can record it. Switch "My role" above to Story writer.`)
                        : bt(`${owner}님(답변 담당)만 기록할 수 있어요.`, `Only ${owner} (answer owner) can record it.`)}
                    />
                  ) : null}
                </article>
              );
            })}
            {clarifications.length === 0 ? <p className="text-xs text-fg-3">{bt("질문이 없습니다.", "No questions.")}</p> : null}
          </div>
        </ProductionSectionCard>
      </div>
    </div>
  );
}
