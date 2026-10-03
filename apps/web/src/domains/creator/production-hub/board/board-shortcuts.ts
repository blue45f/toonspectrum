/**
 * 작업 보드 키보드 단축키. 도움말 화면과 실제 키 처리가 같은 목록을 쓰므로 안내와 동작이 어긋나지 않는다.
 * 입력 칸에 글자를 쓰는 중이거나 대화상자가 열려 있을 때는 단축키를 처리하지 않는다.
 */
import type { BilingualLabel } from "../production-labels";

export type BoardShortcutAction =
  | "new-card"
  | "search"
  | "next-card"
  | "prev-card"
  | "next-column"
  | "prev-column"
  | "edit-title"
  | "edit-assignees"
  | "edit-due"
  | "select-card"
  | "move-menu"
  | "move-left"
  | "move-right"
  | "move-up"
  | "move-down"
  | "help"
  | "escape";

export type BoardShortcutGroup = "navigate" | "edit" | "move" | "general";

export interface BoardShortcutDefinition {
  readonly action: BoardShortcutAction;
  /** 화면에 보여 줄 키 조합. 여러 개면 "또는"이다. */
  readonly keys: readonly (readonly string[])[];
  readonly label: BilingualLabel;
  readonly group: BoardShortcutGroup;
}

export const BOARD_SHORTCUT_GROUPS: Readonly<Record<BoardShortcutGroup, BilingualLabel>> = {
  navigate: { ko: "이동·찾기", en: "Navigate & find" },
  edit: { ko: "카드 편집", en: "Edit cards" },
  move: { ko: "카드 옮기기", en: "Move cards" },
  general: { ko: "그 밖에", en: "General" },
};

export const BOARD_SHORTCUTS: readonly BoardShortcutDefinition[] = [
  { action: "search", keys: [["/"]], label: { ko: "카드 검색", en: "Search cards" }, group: "navigate" },
  { action: "next-card", keys: [["J"], ["↓"]], label: { ko: "다음 카드로", en: "Next card" }, group: "navigate" },
  { action: "prev-card", keys: [["K"], ["↑"]], label: { ko: "이전 카드로", en: "Previous card" }, group: "navigate" },
  { action: "next-column", keys: [["L"], ["→"]], label: { ko: "오른쪽 열로", en: "Column to the right" }, group: "navigate" },
  { action: "prev-column", keys: [["H"], ["←"]], label: { ko: "왼쪽 열로", en: "Column to the left" }, group: "navigate" },
  { action: "new-card", keys: [["C"]], label: { ko: "새 카드 추가", en: "Add a card" }, group: "edit" },
  { action: "edit-title", keys: [["E"]], label: { ko: "제목 바로 고치기", en: "Rename card" }, group: "edit" },
  { action: "edit-assignees", keys: [["A"]], label: { ko: "담당자 고치기", en: "Edit assignees" }, group: "edit" },
  { action: "edit-due", keys: [["D"]], label: { ko: "기한 고치기", en: "Edit due date" }, group: "edit" },
  { action: "select-card", keys: [["X"]], label: { ko: "카드 선택·해제", en: "Select card" }, group: "edit" },
  { action: "move-menu", keys: [["M"]], label: { ko: "이동 메뉴 열기", en: "Open move menu" }, group: "move" },
  { action: "move-left", keys: [["Alt", "←"]], label: { ko: "앞 열로 옮기기", en: "Move to previous column" }, group: "move" },
  { action: "move-right", keys: [["Alt", "→"]], label: { ko: "다음 열로 옮기기", en: "Move to next column" }, group: "move" },
  { action: "move-up", keys: [["Alt", "↑"]], label: { ko: "열에서 위로", en: "Move up in column" }, group: "move" },
  { action: "move-down", keys: [["Alt", "↓"]], label: { ko: "열에서 아래로", en: "Move down in column" }, group: "move" },
  { action: "help", keys: [["?"]], label: { ko: "단축키 도움말", en: "Keyboard shortcuts" }, group: "general" },
  { action: "escape", keys: [["Esc"]], label: { ko: "선택·입력 취소", en: "Cancel / clear selection" }, group: "general" },
];

type KeyInput = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

const PLAIN_KEYS: Readonly<Record<string, BoardShortcutAction>> = {
  c: "new-card",
  "/": "search",
  j: "next-card",
  k: "prev-card",
  l: "next-column",
  h: "prev-column",
  e: "edit-title",
  a: "edit-assignees",
  d: "edit-due",
  x: "select-card",
  m: "move-menu",
  "?": "help",
  Escape: "escape",
};
const ARROW_NAVIGATION: Readonly<Record<string, BoardShortcutAction>> = {
  ArrowDown: "next-card",
  ArrowUp: "prev-card",
  ArrowRight: "next-column",
  ArrowLeft: "prev-column",
};
const ALT_ARROWS: Readonly<Record<string, BoardShortcutAction>> = {
  ArrowLeft: "move-left",
  ArrowRight: "move-right",
  ArrowUp: "move-up",
  ArrowDown: "move-down",
};

/**
 * 키 입력을 보드 동작으로 바꾼다. 화살표는 카드에 초점이 있을 때만(`onCard`) 보드 이동으로 쓰고,
 * 그렇지 않으면 페이지 스크롤을 가로채지 않는다.
 */
export function resolveBoardShortcut(event: KeyInput, onCard: boolean): BoardShortcutAction | null {
  if (event.ctrlKey || event.metaKey) return null;
  if (event.altKey) return onCard && !event.shiftKey ? (ALT_ARROWS[event.key] ?? null) : null;
  if (onCard && ARROW_NAVIGATION[event.key]) return ARROW_NAVIGATION[event.key] ?? null;
  // Shift는 "?" 입력에만 허용한다(대문자 J·K 등은 다른 앱 단축키와 겹치지 않게 무시한다).
  if (event.shiftKey && event.key !== "?") return null;
  return PLAIN_KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key] ?? null;
}

/** 글자를 입력하는 요소(또는 대화상자·메뉴) 안인지. 그 안에서는 단축키를 처리하지 않는다. */
export function isBoardShortcutBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]'));
}
