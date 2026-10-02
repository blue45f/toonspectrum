import { useCallback, useState } from "react";

import { EMPTY_BOARD_ORDER, readStoredBoardOrder, writeStoredBoardOrder, type ProductionBoardOrder } from "./board-order";

/** 서버에 저장하지 않는 프로젝트(샘플)는 탭 안에서만 순서를 기억하고, 새로고침하면 처음으로 돌아간다. */
const sessionOrders = new Map<string, ProductionBoardOrder>();

/**
 * 열별 직접 정렬 순서. `persist`면 이 기기의 브라우저 저장소에 남기고, 아니면 이 탭 안에서만 유지한다.
 * 서버 작업에는 카드 순서가 없으므로 다른 사람·다른 기기에는 보이지 않는다.
 */
export function useProductionBoardOrder(projectId: string, persist: boolean) {
  const [order, setOrderState] = useState<ProductionBoardOrder>(() =>
    persist ? readStoredBoardOrder(projectId) : (sessionOrders.get(projectId) ?? EMPTY_BOARD_ORDER),
  );
  const setOrder = useCallback(
    (next: ProductionBoardOrder) => {
      setOrderState(next);
      if (persist) writeStoredBoardOrder(projectId, next);
      else sessionOrders.set(projectId, next);
    },
    [persist, projectId],
  );
  return [order, setOrder] as const;
}
