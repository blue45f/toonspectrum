import { transitionProductionTaskBatch } from "@toonstudio/contracts/production-workflow";
import type { ProductionProjectAggregate, ProductionTaskStatus, ProductionTaskTransition } from "@toonstudio/core/production";

export interface ProductionBoardMovePreview {
  readonly allowed: boolean;
  readonly reason: string;
  readonly transitions: readonly ProductionTaskTransition[];
}

/** 모든 입력 방식이 실제 명령과 같은 도메인 규칙으로 이동을 검증한다. */
export function previewProductionBoardMove(
  aggregate: ProductionProjectAggregate,
  ids: readonly string[],
  target: ProductionTaskStatus,
  at: string,
): ProductionBoardMovePreview {
  if (!ids.length || ids.length > 200 || new Set(ids).size !== ids.length) {
    return { allowed: false, reason: "이동할 작업을 중복 없이 1~200개 선택하세요.", transitions: [] };
  }
  const byId = new Map(aggregate.tasks.map((task) => [task.id, task]));
  const transitions: ProductionTaskTransition[] = [];
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) return { allowed: false, reason: "작업이 변경되었습니다. 최신 보드에서 다시 선택하세요.", transitions: [] };
    if (task.status !== target) transitions.push({ taskId: id, fromStatus: task.status, toStatus: target });
  }
  if (!transitions.length) return { allowed: false, reason: "이미 같은 상태입니다.", transitions: [] };
  try {
    transitionProductionTaskBatch(aggregate, transitions, at);
    return { allowed: true, reason: "이동 가능", transitions };
  } catch (cause) {
    return { allowed: false, reason: cause instanceof Error ? cause.message : "이동 조건을 확인하지 못했습니다.", transitions: [] };
  }
}
