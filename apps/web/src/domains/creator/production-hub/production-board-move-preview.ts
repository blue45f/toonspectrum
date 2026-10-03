import { transitionProductionTaskBatch } from "@toonstudio/contracts/production-workflow";
import type {
  ProductionProjectAggregate,
  ProductionTask,
  ProductionTaskStatus,
  ProductionTaskTransition,
} from "@toonstudio/core/production";

export interface ProductionBoardMovePreview {
  readonly allowed: boolean;
  readonly reason: string;
  readonly transitions: readonly ProductionTaskTransition[];
  /** 이동이 허용될 때 도메인 규칙이 계산한 새 작업(상태·변경 시각). 낙관적 화면 갱신에 쓴다. */
  readonly changed: readonly ProductionTask[];
}

const DENIED = (reason: string): ProductionBoardMovePreview => ({ allowed: false, reason, transitions: [], changed: [] });

function evaluate(
  aggregate: ProductionProjectAggregate,
  transitions: readonly ProductionTaskTransition[],
  at: string,
): ProductionBoardMovePreview {
  try {
    const changed = transitionProductionTaskBatch(aggregate, transitions, at);
    return { allowed: true, reason: "이동 가능", transitions, changed };
  } catch (cause) {
    return DENIED(cause instanceof Error ? cause.message : "이동 조건을 확인하지 못했습니다.");
  }
}

/** 모든 입력 방식이 실제 명령과 같은 도메인 규칙으로 이동을 검증한다. */
export function previewProductionBoardMove(
  aggregate: ProductionProjectAggregate,
  ids: readonly string[],
  target: ProductionTaskStatus,
  at: string,
): ProductionBoardMovePreview {
  if (!ids.length || ids.length > 200 || new Set(ids).size !== ids.length) {
    return DENIED("이동할 작업을 중복 없이 1~200개 선택하세요.");
  }
  const byId = new Map(aggregate.tasks.map((task) => [task.id, task]));
  const transitions: ProductionTaskTransition[] = [];
  for (const id of ids) {
    const task = byId.get(id);
    if (!task) return DENIED("작업이 변경되었습니다. 최신 보드에서 다시 선택하세요.");
    if (task.status !== target) transitions.push({ taskId: id, fromStatus: task.status, toStatus: target });
  }
  if (!transitions.length) return DENIED("이미 같은 상태입니다.");
  return evaluate(aggregate, transitions, at);
}

/**
 * 방금 옮긴 카드를 원래 상태로 되돌릴 수 있는지 같은 규칙으로 검사한다.
 * 작업 상태는 앞으로만 흐르는 경우가 많아(예: 작업 중 → 준비는 없음) 되돌릴 수 없을 수 있다.
 * `aggregate`는 이동이 반영된 뒤의 데이터여야 한다.
 */
export function previewProductionBoardRevert(
  aggregate: ProductionProjectAggregate,
  moved: readonly ProductionTaskTransition[],
  at: string,
): ProductionBoardMovePreview {
  if (!moved.length) return DENIED("되돌릴 이동이 없습니다.");
  const byId = new Map(aggregate.tasks.map((task) => [task.id, task]));
  const reversed: ProductionTaskTransition[] = [];
  for (const move of moved) {
    const task = byId.get(move.taskId);
    if (!task || task.status !== move.toStatus) return DENIED("그 사이 작업이 바뀌어 되돌릴 수 없습니다.");
    reversed.push({ taskId: move.taskId, fromStatus: move.toStatus, toStatus: move.fromStatus });
  }
  return evaluate(aggregate, reversed, at);
}
