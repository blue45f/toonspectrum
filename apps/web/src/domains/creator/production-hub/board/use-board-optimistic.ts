import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";
import { useCallback, useMemo, useRef, useState } from "react";

import { applyOptimisticOps, type OptimisticBoardOp, type ProductionTaskPatch } from "./board-optimistic";

/**
 * 낙관적 업데이트 덧씌움. `begin`으로 화면을 먼저 바꾸고, 저장이 끝나면 `settle`로 덧씌움을 지운다.
 * 반환하는 `view`는 덧씌움이 적용된 데이터이며, 덧씌움이 없으면 서버 데이터와 같은 객체다.
 */
export function useBoardOptimistic(aggregate: ProductionProjectAggregate) {
  const [ops, setOps] = useState<readonly OptimisticBoardOp[]>([]);
  const counter = useRef(0);
  const view = useMemo(() => applyOptimisticOps(aggregate, ops), [aggregate, ops]);
  const begin = useCallback((patches: ReadonlyMap<string, ProductionTaskPatch>, added: readonly ProductionTask[] = []) => {
    counter.current += 1;
    const id = counter.current;
    setOps((current) => [...current, { id, patches, added }]);
    return id;
  }, []);
  const settle = useCallback((id: number) => setOps((current) => current.filter((op) => op.id !== id)), []);
  /** 저장 중인 카드. 저장이 끝날 때까지 같은 카드를 다시 고치지 못하게 막아 오래된 스냅숏 충돌을 피한다. */
  const pendingIds = useMemo<ReadonlySet<string>>(
    () => new Set(ops.flatMap((op) => [...op.patches.keys(), ...op.added.map((task) => task.id)])),
    [ops],
  );
  return { view, begin, settle, pending: ops.length, pendingIds };
}
