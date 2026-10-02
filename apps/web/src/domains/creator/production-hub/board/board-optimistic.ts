/**
 * 낙관적 업데이트: 저장 응답을 기다리지 않고 화면을 먼저 바꾸기 위한 "임시 덧씌움".
 *
 * 각 조작은 작업별 부분 변경(patch)과 새 카드를 덧씌움으로 등록하고, 저장이 끝나면(성공이든 실패든)
 * 덧씌움을 지운다. 성공하면 서버가 돌려준 실제 데이터가, 실패하면 원래 데이터가 그대로 보인다.
 */
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

export type ProductionTaskPatch = Partial<Omit<ProductionTask, "id" | "projectId">>;

export interface OptimisticBoardOp {
  readonly id: number;
  readonly patches: ReadonlyMap<string, ProductionTaskPatch>;
  readonly added: readonly ProductionTask[];
}

/** 덧씌움을 등록 순서대로 쌓아 보여 줄 데이터를 만든다. 덧씌움이 없으면 같은 객체를 돌려준다. */
export function applyOptimisticOps(
  aggregate: ProductionProjectAggregate,
  ops: readonly OptimisticBoardOp[],
): ProductionProjectAggregate {
  if (ops.length === 0) return aggregate;
  const patches = new Map<string, ProductionTaskPatch>();
  for (const op of ops) {
    for (const [id, patch] of op.patches) patches.set(id, { ...patches.get(id), ...patch });
  }
  const patched = (task: ProductionTask): ProductionTask => {
    const patch = patches.get(task.id);
    return patch ? { ...task, ...patch } : task;
  };
  const existing = new Set(aggregate.tasks.map((task) => task.id));
  const added = ops.flatMap((op) => op.added).filter((task) => !existing.has(task.id)).map(patched);
  return { ...aggregate, tasks: [...aggregate.tasks.map(patched), ...added] };
}

/** 상태 전환이 바꾸는 필드만 덧씌움으로 옮긴다. */
export function statusPatch(task: ProductionTask): ProductionTaskPatch {
  return {
    status: task.status,
    statusChangedAt: task.statusChangedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}
