import { useEffect, useRef, type RefObject } from "react";

import { adjacentBoardCard, boardCardId, focusBoardCard, focusedBoardCard, type BoardFocusDirection } from "./board-focus";
import { isBoardShortcutBlocked, resolveBoardShortcut } from "./board-shortcuts";

export type BoardMoveDirection = "left" | "right" | "up" | "down";

export interface BoardShortcutHandlers {
  readonly newCard: () => void;
  readonly search: () => void;
  readonly help: () => void;
  readonly escape: () => void;
  readonly editTitle: (taskId: string) => void;
  readonly toggleSelect: (taskId: string) => void;
  readonly openMoveMenu: (taskId: string) => void;
  readonly moveCard: (taskId: string, direction: BoardMoveDirection) => void;
}

const FOCUS_DIRECTION: Readonly<Record<string, BoardFocusDirection>> = {
  "next-card": "next",
  "prev-card": "prev",
  "next-column": "right",
  "prev-column": "left",
};
const MOVE_DIRECTION: Readonly<Record<string, BoardMoveDirection>> = {
  "move-left": "left",
  "move-right": "right",
  "move-up": "up",
  "move-down": "down",
};

/**
 * 보드 단축키(c 새 카드 · / 검색 · j/k·h/l 카드 이동 · e 제목 · x 선택 · m 이동 메뉴 · Alt+방향키 옮기기 · ? 도움말).
 * 전역 "/" 빠른 검색보다 먼저 받도록 캡처 단계에서 듣고, 처리한 키만 다른 곳으로 퍼지지 않게 막는다.
 */
export function useBoardShortcuts(root: RefObject<HTMLElement | null>, handlers: BoardShortcutHandlers, enabled = true) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const board = root.current;
      if (!board || isBoardShortcutBlocked(event.target) || document.querySelector('[role="dialog"]')) return;
      const card = focusedBoardCard(board);
      const action = resolveBoardShortcut(event, card !== null);
      if (!action) return;
      const taskId = boardCardId(card);
      const handle = latest.current;
      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (action === "escape") {
        handle.escape();
        return;
      }
      if (action === "search") {
        consume();
        handle.search();
      } else if (action === "new-card") {
        consume();
        handle.newCard();
      } else if (action === "help") {
        consume();
        handle.help();
      } else if (FOCUS_DIRECTION[action]) {
        const direction = FOCUS_DIRECTION[action];
        const next = direction ? adjacentBoardCard(board, card, direction) : null;
        consume();
        if (next) focusBoardCard(next);
      } else if (taskId) {
        consume();
        if (action === "edit-title") handle.editTitle(taskId);
        else if (action === "select-card") handle.toggleSelect(taskId);
        else if (action === "move-menu") handle.openMoveMenu(taskId);
        else {
          const direction = MOVE_DIRECTION[action];
          if (direction) handle.moveCard(taskId, direction);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, root]);
}
