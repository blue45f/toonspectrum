/**
 * 제작 프로젝트 활동 피드 모델 (React 비의존).
 *
 * 원천은 서버가 강제 기록하는 aggregate.auditEvents다 — 모든 프로젝트 변경(명령)은
 * 서버 저장소가 audit event 없이는 거부하므로, 이 배열이 프로젝트 활동의 정본이다.
 * 여기서는 표시를 위해 행위자(party)와 대상(작업·회차·위험 등)의 이름을 aggregate
 * 안에서 해석하고, "내 관련" 판정을 인박스와 같은 기준(내 party·내 배정)으로 맞춘다.
 *
 * 표시 한계: 이벤트의 전/후 상태는 digest(해시)만 남아 있어 "무엇에서 무엇으로"는
 * 복원할 수 없다. 그래서 항목은 행위자·행동·대상·사유·시각까지만 구성한다.
 */
import type {
  ProductionAuditEvent,
  ProductionProjectAggregate,
} from "@toonstudio/core/production";

import type { BilingualLabel } from "./production-labels";

export type ProductionActivityFilter = "all" | "mine";

export interface ProductionActivityViewer {
  readonly userId: string | null;
  readonly assignmentIds: readonly string[];
}

export interface ProductionActivityEntry {
  readonly event: ProductionAuditEvent;
  /** 행위자 표시 이름. party로 해석되지 않으면 null (시스템·외부 기록). */
  readonly actorName: string | null;
  readonly actorIsViewer: boolean;
  readonly targetKindLabel: BilingualLabel;
  /** 대상 이름. 해석되지 않으면 null — 화면은 종류 라벨과 단축 id로 대체한다. */
  readonly targetTitle: string | null;
  readonly relatedToViewer: boolean;
}

const TARGET_KIND_LABELS: Readonly<Record<string, BilingualLabel>> = Object.freeze({
  project: { ko: "프로젝트", en: "Project" },
  task: { ko: "작업", en: "Task" },
  "task-batch": { ko: "작업 묶음", en: "Task batch" },
  "task-transition-batch": { ko: "작업 상태", en: "Task status" },
  "task-baseline": { ko: "작업 기준선", en: "Task baseline" },
  episode: { ko: "회차", en: "Episode" },
  "episode-operations": { ko: "회차 운영", en: "Episode operations" },
  risk: { ko: "위험", en: "Risk" },
  "risk-response": { ko: "위험 대응", en: "Risk response" },
  "risk-signal": { ko: "위험 신호", en: "Risk signal" },
  "risk-policy": { ko: "위험 기준", en: "Risk policy" },
  "risk-evaluation": { ko: "위험 평가", en: "Risk evaluation" },
  deliverable: { ko: "납품물", en: "Deliverable" },
  submission: { ko: "제출본", en: "Submission" },
  handoff: { ko: "인계", en: "Handoff" },
  clarification: { ko: "질문·답변", en: "Question" },
  "creative-branch": { ko: "작업 갈래", en: "Branch" },
  "merge-request": { ko: "합치기 요청", en: "Merge request" },
  "change-request": { ko: "변경 요청", en: "Change request" },
  "review-policy": { ko: "검수 기준", en: "Review rules" },
  "review-decision": { ko: "검수 결정", en: "Review decision" },
  "studio-revision-link": { ko: "원고 버전 연결", en: "Manuscript version link" },
  "scope-package": { ko: "작업 범위", en: "Scope package" },
  "scope-package-addendum": { ko: "범위 부록", en: "Scope addendum" },
  contribution: { ko: "기여 기록", en: "Contribution" },
  "credit-manifest": { ko: "크레딧", en: "Credits" },
  "rights-interest": { ko: "권리 지분", en: "Rights interest" },
  "compensation-plan": { ko: "보상 계획", en: "Compensation plan" },
  workflow: { ko: "공정 설정", en: "Workflow" },
  "workflow-instance": { ko: "공정 실행", en: "Workflow run" },
  collaboration: { ko: "협업 구성", en: "Collaboration" },
  "external-review-access": { ko: "외부 검수", en: "External review" },
  "planning-snapshot": { ko: "기획 스냅샷", en: "Planning snapshot" },
  "schedule-scenario": { ko: "일정 시나리오", en: "Schedule scenario" },
  "automation-execution": { ko: "자동화 실행", en: "Automation run" },
});

const TARGET_KIND_PREFIX_LABELS: readonly (readonly [string, BilingualLabel])[] = Object.freeze([
  ["planning-", { ko: "기획 기록", en: "Planning record" }],
  ["commercial-", { ko: "계약·거래 기록", en: "Commercial record" }],
  ["operations-", { ko: "운영 기록", en: "Operations record" }],
]);

export function productionActivityTargetKindLabel(targetType: string): BilingualLabel {
  const exact = TARGET_KIND_LABELS[targetType];
  if (exact) return exact;
  for (const [prefix, label] of TARGET_KIND_PREFIX_LABELS) {
    if (targetType.startsWith(prefix)) return label;
  }
  return { ko: targetType, en: targetType };
}

export function shortenProductionActivityId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function episodeTitleById(aggregate: ProductionProjectAggregate): ReadonlyMap<string, string> {
  const titles = new Map<string, string>();
  for (const plan of aggregate.episodePlans) {
    titles.set(plan.id, plan.title);
    titles.set(plan.episodeId, plan.title);
  }
  for (const episode of aggregate.episodes) {
    const title = titles.get(episode.episodeId) ?? titles.get(episode.id);
    if (title) {
      titles.set(episode.id, title);
      titles.set(episode.episodeId, title);
    }
  }
  return titles;
}

function resolveTargetTitle(
  aggregate: ProductionProjectAggregate,
  event: ProductionAuditEvent,
  episodeTitles: ReadonlyMap<string, string>,
): string | null {
  const { targetType, targetId } = event;
  if (targetType === "project") return aggregate.title;
  if (
    targetType === "task"
    || targetType === "task-batch"
    || targetType === "task-transition-batch"
    || targetType === "task-baseline"
  ) {
    return aggregate.tasks.find((task) => task.id === targetId)?.title ?? null;
  }
  if (targetType === "episode" || targetType === "episode-operations") {
    return episodeTitles.get(targetId) ?? null;
  }
  if (targetType === "risk") {
    return aggregate.risks.find((risk) => risk.id === targetId)?.title ?? null;
  }
  if (targetType === "risk-response") {
    const response = aggregate.riskResponses.find((entry) => entry.id === targetId);
    return response
      ? aggregate.risks.find((risk) => risk.id === response.riskId)?.title ?? null
      : null;
  }
  if (targetType === "clarification") {
    return aggregate.clarifications.find((thread) => thread.id === targetId)?.question ?? null;
  }
  if (targetType === "handoff") {
    const handoff = aggregate.handoffs.find((entry) => entry.id === targetId);
    return handoff ? episodeTitles.get(handoff.episodeId) ?? null : null;
  }
  const party = aggregate.parties.find((entry) => entry.id === targetId);
  if (party) return party.internalDisplayName || party.publicDisplayName;
  const assignment = aggregate.assignments.find((entry) => entry.id === targetId);
  if (assignment) {
    const owner = aggregate.parties.find((entry) => entry.id === assignment.partyId);
    return owner ? owner.internalDisplayName || owner.publicDisplayName : null;
  }
  return null;
}

export function buildProductionActivityEntries(
  aggregate: ProductionProjectAggregate,
  viewer: ProductionActivityViewer,
): readonly ProductionActivityEntry[] {
  const partyById = new Map(aggregate.parties.map((party) => [party.id, party]));
  const viewerPartyIds = new Set(
    aggregate.parties
      .filter((party) => viewer.userId !== null && party.accountUserId === viewer.userId)
      .map((party) => party.id),
  );
  const viewerAssignmentIds = new Set(viewer.assignmentIds);
  const myTasks = aggregate.tasks.filter(
    (task) =>
      task.assignmentIds.some((id) => viewerAssignmentIds.has(id))
      || task.reviewerAssignmentIds.some((id) => viewerAssignmentIds.has(id)),
  );
  const myTaskIds = new Set(myTasks.map((task) => task.id));
  const myEpisodeIds = new Set<string>();
  for (const task of myTasks) {
    if (task.scope.kind === "episode") myEpisodeIds.add(task.scope.id);
    for (const ancestor of task.scope.ancestors) {
      if (ancestor.kind === "episode") myEpisodeIds.add(ancestor.id);
    }
  }
  for (const episode of aggregate.episodes) {
    if (myEpisodeIds.has(episode.id) || myEpisodeIds.has(episode.episodeId)) {
      myEpisodeIds.add(episode.id);
      myEpisodeIds.add(episode.episodeId);
    }
  }
  const myClarificationIds = new Set(
    aggregate.clarifications
      .filter(
        (thread) =>
          viewerAssignmentIds.has(thread.askedByAssignmentId)
          || viewerAssignmentIds.has(thread.answerOwnerAssignmentId),
      )
      .map((thread) => thread.id),
  );
  const mySubmissionIds = new Set(
    aggregate.submissions
      .filter((submission) => viewerAssignmentIds.has(submission.submittedByAssignmentId))
      .map((submission) => submission.id),
  );
  const episodeTitles = episodeTitleById(aggregate);

  return [...aggregate.auditEvents]
    .sort((left, right) => right.aggregateRevision - left.aggregateRevision)
    .map((event) => {
      const actor = event.actorPartyId ? partyById.get(event.actorPartyId) : undefined;
      const actorIsViewer = event.actorPartyId !== null && viewerPartyIds.has(event.actorPartyId);
      const relatedToViewer =
        actorIsViewer
        || viewerPartyIds.has(event.targetId)
        || viewerAssignmentIds.has(event.targetId)
        || myTaskIds.has(event.targetId)
        || myEpisodeIds.has(event.targetId)
        || myClarificationIds.has(event.targetId)
        || mySubmissionIds.has(event.targetId);
      return Object.freeze({
        event,
        actorName: actor ? actor.internalDisplayName || actor.publicDisplayName : null,
        actorIsViewer,
        targetKindLabel: productionActivityTargetKindLabel(event.targetType),
        targetTitle: resolveTargetTitle(aggregate, event, episodeTitles),
        relatedToViewer,
      });
    });
}

export function filterProductionActivityEntries(
  entries: readonly ProductionActivityEntry[],
  filter: ProductionActivityFilter,
): readonly ProductionActivityEntry[] {
  return filter === "mine" ? entries.filter((entry) => entry.relatedToViewer) : entries;
}
