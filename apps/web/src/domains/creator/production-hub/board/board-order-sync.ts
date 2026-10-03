/**
 * 카드 순서 서버 동기화의 순수 판정 함수들 (PM-UX-3).
 *
 * 정본 경계:
 * - 서버에 순서가 있으면(boardOrder 문서 존재) 그 값이 정본이고 로컬은 캐시다.
 * - 서버에 순서가 없으면 로컬 저장값이 1회 이전(업로드) 대상이다.
 * - 로컬 저장값은 어떤 경우에도 삭제하지 않는다 — 동기화 실패 시 폴백으로 남는다.
 */
import { EMPTY_BOARD_ORDER, type ProductionBoardOrder } from "./board-order";

/** 열 구성과 각 열의 id 순서까지 같은지 값으로 비교한다 (객체 동일성 아님). */
export function boardOrderEquals(
  left: ProductionBoardOrder,
  right: ProductionBoardOrder,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    const leftIds = left[key];
    const rightIds = right[key];
    if (!leftIds || !rightIds || leftIds.length !== rightIds.length) return false;
    for (let index = 0; index < leftIds.length; index += 1) {
      if (leftIds[index] !== rightIds[index]) return false;
    }
  }
  return true;
}

export interface InitialBoardOrder {
  readonly order: ProductionBoardOrder;
  /** server면 서버 정본을 채택한 것, local이면 서버가 비어 로컬이 이전 대상인 상태다. */
  readonly source: "server" | "local";
}

/**
 * 첫 렌더에 쓸 순서를 정한다. 서버 순서가 있으면(null이 아니면) 항상 서버가 이기고,
 * 서버가 비어 있을 때만 로컬 저장값을 쓴다.
 */
export function resolveInitialBoardOrder(
  serverOrder: ProductionBoardOrder | null,
  storedOrder: ProductionBoardOrder,
): InitialBoardOrder {
  if (serverOrder !== null) return { order: serverOrder, source: "server" };
  return { order: storedOrder, source: "local" };
}

/** 서버로 올려야 할 로컬 전용 순서인지: 서버가 비었고 로컬에 실제 순서가 있을 때만. */
export function needsBoardOrderMigration(
  serverOrder: ProductionBoardOrder | null,
  localOrder: ProductionBoardOrder,
): boolean {
  return serverOrder === null && !boardOrderEquals(localOrder, EMPTY_BOARD_ORDER);
}
