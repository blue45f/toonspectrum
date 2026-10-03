import { useCallback, useEffect, useRef, useState } from "react";

import {
  EMPTY_BOARD_ORDER,
  readStoredBoardOrder,
  writeStoredBoardOrder,
  type ProductionBoardOrder,
} from "./board-order";
import {
  boardOrderEquals,
  needsBoardOrderMigration,
  resolveInitialBoardOrder,
} from "./board-order-sync";

/** 서버에 저장하지 않는 프로젝트(샘플)는 탭 안에서만 순서를 기억하고, 새로고침하면 처음으로 돌아간다. */
const sessionOrders = new Map<string, ProductionBoardOrder>();

/** 서버 동기화 디바운스. 끌기 한 번에 여러 번 바뀌어도 마지막 순서만 한 번 보낸다. */
export const BOARD_ORDER_SYNC_DELAY_MS = 500;

export interface ProductionBoardOrderSyncOptions {
  /**
   * 서버 정본 순서 (aggregate.boardOrder의 열 맵). null이면 서버에 아직 순서가
   * 없는 프로젝트라 로컬 저장값이 1회 이전 대상이 된다. 샘플이면 항상 null.
   */
  readonly serverOrder: ProductionBoardOrder | null;
  /** 서버로 올릴 수 있는 상태인가 (서버 프로젝트 + 편집 권한). 아니면 로컬 전용으로 동작한다. */
  readonly canSync: boolean;
  /**
   * 순서 문서를 서버 정본으로 보내는 콜백. 세션의 명령 큐처럼 실패를 내부에서
   * 처리하는 fire-and-forget이어야 한다 (여기서는 실패해도 로컬 순서를 유지한다).
   */
  readonly sync: ((order: ProductionBoardOrder) => void) | null;
}

/**
 * 열별 직접 정렬 순서.
 *
 * 정본은 서버다 (PM-UX-3). 읽기는 서버 순서 우선, 로컬 저장값은 캐시·폴백이다.
 * 서버에 순서가 없고 로컬에만 있으면 마운트 직후 1회 이전(업로드)한다.
 * 로컬 변경은 즉시 화면과 캐시에 반영하고, 서버로는 디바운스해서 보낸다.
 * 동기화가 실패하면 로컬 순서가 그대로 남고, 다음 변경·서버 갱신 때 다시 보낸다.
 * `persist`가 아니면(샘플) 기존처럼 이 탭 안에서만 유지하고 서버와 통신하지 않는다.
 */
export function useProductionBoardOrder(
  projectId: string,
  persist: boolean,
  syncOptions?: ProductionBoardOrderSyncOptions,
) {
  const serverOrder = syncOptions?.serverOrder ?? null;
  const [order, setOrderState] = useState<ProductionBoardOrder>(() => {
    if (!persist) return sessionOrders.get(projectId) ?? EMPTY_BOARD_ORDER;
    return resolveInitialBoardOrder(serverOrder, readStoredBoardOrder(projectId)).order;
  });

  const orderRef = useRef(order);
  orderRef.current = order;
  const serverSnapshotRef = useRef<ProductionBoardOrder | null>(serverOrder);
  serverSnapshotRef.current = serverOrder;
  const syncRef = useRef(syncOptions?.sync ?? null);
  syncRef.current = syncOptions?.sync ?? null;
  const canSyncRef = useRef(false);
  canSyncRef.current = Boolean(persist && syncOptions?.canSync && syncOptions?.sync);
  // 서버와 아직 일치하지 않은 최신 로컬 순서. null이면 서버와 동기화된 상태다.
  const unsyncedRef = useRef<ProductionBoardOrder | null>(
    persist && needsBoardOrderMigration(serverOrder, order) ? order : null,
  );
  const timerRef = useRef<number | null>(null);

  const flushSync = useCallback(() => {
    timerRef.current = null;
    const pending = unsyncedRef.current;
    if (pending !== null && canSyncRef.current) syncRef.current?.(pending);
  }, []);

  const scheduleSync = useCallback(() => {
    if (!canSyncRef.current || unsyncedRef.current === null) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flushSync, BOARD_ORDER_SYNC_DELAY_MS);
  }, [flushSync]);

  // 마운트 시 로컬 전용 순서가 있으면 1회 이전을 시작한다.
  useEffect(() => {
    scheduleSync();
  }, [projectId, scheduleSync]);

  // 서버 순서가 갱신될 때: 내 업로드가 닿았으면 미동기 상태를 풀고,
  // 미동기 변경이 없으면 팀원·다른 기기의 변경을 채택한다 (서버가 정본).
  useEffect(() => {
    if (!persist || serverOrder === null) return;
    const pending = unsyncedRef.current;
    if (pending !== null) {
      if (boardOrderEquals(pending, serverOrder)) {
        unsyncedRef.current = null;
        writeStoredBoardOrder(projectId, serverOrder);
      } else {
        // 아직 서버에 닿지 않은 로컬 변경이 있으면 최신값으로 다시 보낸다.
        scheduleSync();
      }
      return;
    }
    if (!boardOrderEquals(orderRef.current, serverOrder)) {
      setOrderState(serverOrder);
      orderRef.current = serverOrder;
    }
    writeStoredBoardOrder(projectId, serverOrder);
  }, [persist, projectId, serverOrder, scheduleSync]);

  // 언마운트(프로젝트 전환) 직전 대기 중인 동기화를 마저 보낸다 — 세션 큐는
  // 보드보다 위에 살아 있어 언마운트 후에도 명령이 실행된다.
  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      const pending = unsyncedRef.current;
      if (pending !== null && canSyncRef.current) syncRef.current?.(pending);
    }
  }, []);

  const setOrder = useCallback(
    (next: ProductionBoardOrder) => {
      setOrderState(next);
      orderRef.current = next;
      if (!persist) {
        sessionOrders.set(projectId, next);
        return;
      }
      writeStoredBoardOrder(projectId, next);
      const snapshot = serverSnapshotRef.current;
      // 서버와 이미 같은 순서면(되돌리기 등) 올릴 것이 없다. 서버가 비어 있고
      // 로컬도 비었으면 이전할 것도 없다.
      unsyncedRef.current = snapshot !== null
        ? (boardOrderEquals(next, snapshot) ? null : next)
        : (boardOrderEquals(next, EMPTY_BOARD_ORDER) ? null : next);
      scheduleSync();
    },
    [persist, projectId, scheduleSync],
  );
  return [order, setOrder] as const;
}
