/**
 * "+ 카드 추가"로 만드는 새 카드. 새 카드는 도메인 규칙상 항상 "초안"에서 시작한다.
 * 지금 보고 있는 줄·필터(회차·담당·공정·우선순위)를 미리 채워 두어 따로 고르지 않아도 되게 한다.
 */
import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import {
  episodeScope,
  scopeContains,
  type ProductionProjectAggregate,
  type ProductionTask,
} from "@toonstudio/core/production";

import { PRODUCTION_DEFAULT_PROCESS_ORDER, productionProcessLabel, type ProductionLocalize } from "../production-labels";
import { createProductionTaskDraft, type ProductionBoardFilters } from "../production-workboard-model";

export interface BoardProcessOption {
  readonly key: string;
  readonly label: string;
}

/** 새 카드의 공정 선택지: 팀 공정 설정이 있으면 그 순서, 없으면 웹툰 기본 공정. */
export function boardProcessOptions(
  aggregate: Pick<ProductionProjectAggregate, "workflowProfile">,
  localize: ProductionLocalize,
): readonly BoardProcessOption[] {
  const keys = aggregate.workflowProfile
    ? aggregate.workflowProfile.steps.map((step) => step.key)
    : PRODUCTION_DEFAULT_PROCESS_ORDER;
  return keys.map((key) => ({ key, label: productionProcessLabel(aggregate, key, localize) }));
}

export interface QuickAddContext {
  readonly processKey: string;
  readonly episodeId: string | null;
  readonly assignmentId: string | null;
  readonly priority: ProductionBoardFilters["priority"];
}

export function buildQuickAddTasks(
  aggregate: ProductionProjectAggregate,
  titles: readonly string[],
  context: QuickAddContext,
  newId: () => string,
): readonly ProductionTask[] {
  const known = aggregate.workflowProfile?.steps.map((step) => step.key) ?? null;
  const processKey =
    known && !known.some((key) => canonicalProductionProcessKey(key) === canonicalProductionProcessKey(context.processKey))
      ? (known[0] ?? context.processKey)
      : context.processKey;
  const scoped = context.episodeId && aggregate.episodes.some((episode) => episode.episodeId === context.episodeId);
  return titles.map((title) => {
    const draft = createProductionTaskDraft(aggregate, newId());
    const scope = scoped && context.episodeId ? episodeScope(aggregate.projectId, context.episodeId) : draft.scope;
    const assignment = context.assignmentId
      ? aggregate.assignments.find((entry) => entry.id === context.assignmentId && entry.status === "active")
      : undefined;
    return {
      ...draft,
      title,
      processKey,
      scope,
      priority: context.priority || "normal",
      assignmentIds: assignment && scopeContains(assignment.scope, scope) ? [assignment.id] : [],
    };
  });
}
