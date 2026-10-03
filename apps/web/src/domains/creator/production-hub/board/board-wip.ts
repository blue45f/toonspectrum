/**
 * 동시 작업 한도(WIP). 한도는 공정마다 정하고, "작업 중" 상태의 카드 수로 센다.
 * 서버 규칙과 같은 기준(`productionProcessWip`)을 쓰며, 끌어 옮기기 전에 미리 알려 주는 용도다.
 */
import { canonicalProductionProcessKey, productionProcessWip } from "@toonstudio/contracts/production-workflow";
import type { ProductionProjectAggregate, ProductionTaskStatus } from "@toonstudio/core/production";

import type { ProductionLocalize } from "../production-labels";
import { productionProcessLabel } from "../production-labels";

export interface BoardWipInfo {
  readonly key: string;
  readonly name: string;
  /** 지금 작업 중인 카드 수. */
  readonly count: number;
  /** 이번 이동으로 새로 작업 중이 되는 카드 수. */
  readonly incoming: number;
  /** 한도. 정하지 않았으면 null. */
  readonly limit: number | null;
}

/** 이동하면 "작업 중"이 되는 카드들의 공정별 한도 현황. 작업 중 열이 아니면 빈 배열이다. */
export function boardWipForMove(
  aggregate: Pick<ProductionProjectAggregate, "tasks" | "workflowProfile">,
  ids: readonly string[],
  toStatus: ProductionTaskStatus,
  localize: ProductionLocalize,
): readonly BoardWipInfo[] {
  if (toStatus !== "in-progress") return [];
  const incoming = new Map<string, number>();
  for (const id of ids) {
    const task = aggregate.tasks.find((entry) => entry.id === id);
    if (!task || task.status === "in-progress") continue;
    const key = canonicalProductionProcessKey(task.processKey);
    incoming.set(key, (incoming.get(key) ?? 0) + 1);
  }
  return [...incoming.entries()].map(([key, count]) => {
    const step = aggregate.workflowProfile?.steps.find((entry) => canonicalProductionProcessKey(entry.key) === key);
    return {
      key,
      name: productionProcessLabel(aggregate, key, localize),
      count: productionProcessWip(aggregate.tasks, key),
      incoming: count,
      limit: step?.wipLimit ?? null,
    };
  });
}

/** 한도를 넘는 공정만 골라낸다. */
export function boardWipOverflow(info: readonly BoardWipInfo[]): readonly BoardWipInfo[] {
  return info.filter((entry) => entry.limit !== null && entry.count + entry.incoming > entry.limit);
}
