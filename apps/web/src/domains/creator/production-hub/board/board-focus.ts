/**
 * 칸반 카드 사이 키보드 초점 이동(j/k·h/l·화살표).
 * 레이아웃 계산 없이 DOM 순서만 쓰므로 어느 화면 크기에서도 같은 결과가 나온다.
 */

const CARD = "[data-production-task]";
const COLUMN = "[data-production-drop-column]";

/** 보드 안의 카드(접힌 열처럼 숨겨진 것은 제외), 화면 읽는 순서대로. */
export function boardCardElements(root: ParentNode): readonly HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CARD)).filter((card) => !card.closest("[hidden]"));
}

export function boardCardId(card: Element | null): string | null {
  return card instanceof HTMLElement ? (card.dataset.productionTask ?? null) : null;
}

/** 지금 초점이 있는 카드. 카드 밖이면 null. */
export function focusedBoardCard(root: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  return active.closest<HTMLElement>(CARD);
}

/** 카드의 대표 버튼(제목)에 초점을 준다. 스크린 리더가 카드 이름을 읽는 곳이다. */
export function focusBoardCard(card: HTMLElement | null | undefined): boolean {
  const target = card?.querySelector<HTMLElement>("[data-board-open]") ?? card;
  if (!target) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
}

export function focusBoardCardById(root: ParentNode, id: string): boolean {
  return focusBoardCard(boardCardElements(root).find((card) => card.dataset.productionTask === id));
}

export type BoardFocusDirection = "next" | "prev" | "left" | "right";

function columnCards(cell: Element): readonly HTMLElement[] {
  return Array.from(cell.querySelectorAll<HTMLElement>(CARD));
}

/**
 * 현재 카드에서 방향키가 가리키는 카드. 현재 카드가 없으면(next) 첫 카드, (prev) 마지막 카드다.
 * 좌우는 이웃 열에서 같은 순서의 카드(없으면 마지막 카드)로 가고, 같은 줄(스윔레인) 안에서만 움직인다.
 */
export function adjacentBoardCard(
  root: HTMLElement,
  current: HTMLElement | null,
  direction: BoardFocusDirection,
): HTMLElement | null {
  const cards = boardCardElements(root);
  if (cards.length === 0) return null;
  if (!current) return direction === "prev" ? (cards[cards.length - 1] ?? null) : (cards[0] ?? null);
  if (direction === "next" || direction === "prev") {
    const cell = current.closest<HTMLElement>(COLUMN);
    const pool = cell ? columnCards(cell) : cards;
    const index = pool.indexOf(current);
    return pool[index + (direction === "next" ? 1 : -1)] ?? null;
  }
  const cell = current.closest<HTMLElement>(COLUMN);
  if (!cell) return null;
  const lane = cell.dataset.productionLane;
  const cells = Array.from(root.querySelectorAll<HTMLElement>(COLUMN)).filter(
    (candidate) => candidate.dataset.productionLane === lane && !candidate.closest("[hidden]"),
  );
  const own = columnCards(cell);
  const index = Math.max(0, own.indexOf(current));
  const step = direction === "right" ? 1 : -1;
  for (let at = cells.indexOf(cell) + step; at >= 0 && at < cells.length; at += step) {
    const neighbor = cells[at];
    const pool = neighbor ? columnCards(neighbor).filter((card) => !card.closest("[hidden]")) : [];
    if (pool.length) return pool[Math.min(index, pool.length - 1)] ?? null;
  }
  return null;
}
