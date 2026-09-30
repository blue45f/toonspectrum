import type { KeyboardEvent } from "react";

export interface ShortcutCommandBinding {
  commandId: string;
  label: string;
  /** "Ctrl+Z" 형태. 빈 문자열이면 미지정. */
  keys: string;
}

export const DEFAULT_SHORTCUT_BINDINGS: ReadonlyArray<ShortcutCommandBinding> = [
  { commandId: "undo", label: "되돌리기", keys: "Ctrl+Z" },
  { commandId: "redo", label: "다시 실행", keys: "Ctrl+Shift+Z" },
  { commandId: "brush", label: "브러시", keys: "B" },
  { commandId: "eraser", label: "지우개", keys: "E" },
  { commandId: "fill", label: "채우기", keys: "G" },
  { commandId: "zoom-in", label: "확대", keys: "Ctrl++" },
  { commandId: "zoom-out", label: "축소", keys: "Ctrl+-" },
  { commandId: "save-layout", label: "현재 레이아웃 저장", keys: "Ctrl+Shift+L" },
];

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;

/**
 * 키 바인딩 정규화 — 수식어 순서를 Ctrl, Alt, Shift, Meta 로 고정하고
 * 단일 문자는 대문자로 통일한다. 비교·저장용 표준형.
 */
export function normalizeShortcutKeys(raw: string): string {
  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const modifiers = new Set<string>();
  const keys: string[] = [];
  for (const part of parts) {
    const lowered = part.toLowerCase();
    if (lowered === "ctrl" || lowered === "control") modifiers.add("Ctrl");
    else if (lowered === "alt") modifiers.add("Alt");
    else if (lowered === "shift") modifiers.add("Shift");
    else if (lowered === "meta" || lowered === "cmd" || lowered === "command") modifiers.add("Meta");
    else keys.push(part.length === 1 ? part.toUpperCase() : part);
  }
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), ...keys].join("+");
}

/**
 * 중복 배정된 키 목록을 반환한다 (정규화 기준, 대소문자 무시).
 * 빈 문자열(미지정)은 검사에서 제외한다.
 */
export function findDuplicateShortcutKeys(
  bindings: ReadonlyArray<ShortcutCommandBinding>,
): string[] {
  const counts = new Map<string, number>();
  for (const binding of bindings) {
    const normalized = normalizeShortcutKeys(binding.keys);
    if (normalized.length === 0) continue;
    const key = normalized.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const binding of bindings) {
    const normalized = normalizeShortcutKeys(binding.keys);
    if (normalized.length === 0) continue;
    if ((counts.get(normalized.toLowerCase()) ?? 0) > 1) duplicates.add(normalized);
  }
  return [...duplicates];
}

/** 키보드 이벤트에서 바인딩 문자열을 만든다. 수식어만 누른 경우 null. */
export function captureShortcutFromKeyboardEvent(event: KeyboardEvent<HTMLElement>): string | null {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  const key = event.key;
  if (key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") return null;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return normalizeShortcutKeys(parts.join("+"));
}
