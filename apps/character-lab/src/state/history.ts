/**
 * undo/redo history. 1 명령 = 1 단계, `param/set`·`expression/set` 같은 연속 드래그는 coalesceKey로 1단계에 병합한다.
 *
 * 규칙:
 * - `push`는 redo 스택을 비운다.
 * - 같은 coalesceKey의 레시피 항목이 스택 꼭대기에 있고 `coalesceWindowMs` 안이면 `after`만 갱신한다
 *   (`before`는 첫 항목의 것을 유지하므로 undo 한 번에 드래그 전체가 되돌아간다).
 * - undo 스택이 `limit`를 넘으면 가장 오래된 항목을 버린다.
 */
import type { CharacterRecipe, PaintUndoToken, SlotCapabilityMap } from "../contracts";

export const HISTORY_DEFAULT_LIMIT = 200;
export const HISTORY_COALESCE_WINDOW_MS = 250;

export interface RecipeHistoryEntry {
  readonly kind: "recipe";
  readonly before: CharacterRecipe;
  readonly after: CharacterRecipe;
  readonly labelKo: string;
  /** epoch ms(coalesce 윈도우 판정) */
  readonly at: number;
  readonly coalesceKey?: string;
  /** source/set처럼 능력 맵도 함께 바뀌는 명령 */
  readonly capabilities?: { readonly before: SlotCapabilityMap; readonly after: SlotCapabilityMap };
}

export interface PaintHistoryEntry {
  readonly kind: "paint";
  readonly token: PaintUndoToken;
  readonly labelKo: string;
  readonly at: number;
}

export type HistoryEntry = RecipeHistoryEntry | PaintHistoryEntry;

export interface HistoryOptions {
  /** undo 스택 최대 깊이(기본 200) */
  readonly limit?: number;
  /** coalesce 윈도우(ms, 기본 250) */
  readonly coalesceWindowMs?: number;
}

export type HistoryPushResult = "pushed" | "coalesced";

export interface History {
  readonly limit: number;
  readonly coalesceWindowMs: number;
  push(entry: HistoryEntry): HistoryPushResult;
  /** 꼭대기 항목을 redo 스택으로 옮기고 돌려준다. 없으면 undefined. */
  undo(): HistoryEntry | undefined;
  redo(): HistoryEntry | undefined;
  canUndo(): boolean;
  canRedo(): boolean;
  /** undo 스택 깊이 */
  depth(): number;
  redoDepth(): number;
  peekUndo(): HistoryEntry | undefined;
  peekRedo(): HistoryEntry | undefined;
  /** 다음 push가 `key`로 병합될 수 있는지(꼭대기 항목·윈도우 판정) */
  canCoalesce(key: string, at: number, windowMs?: number): boolean;
  /** undo 스택 사본(오래된 것부터) */
  entries(): readonly HistoryEntry[];
  clear(): void;
}

export function createHistory(limitOrOptions: number | HistoryOptions = HISTORY_DEFAULT_LIMIT): History {
  const options: HistoryOptions = typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions;
  const limit = Math.max(1, Math.floor(options.limit ?? HISTORY_DEFAULT_LIMIT));
  const coalesceWindowMs = Math.max(0, options.coalesceWindowMs ?? HISTORY_COALESCE_WINDOW_MS);
  const undoStack: HistoryEntry[] = [];
  const redoStack: HistoryEntry[] = [];

  const canCoalesce = (key: string, at: number, windowMs: number = coalesceWindowMs): boolean => {
    const top = undoStack[undoStack.length - 1];
    if (!top || top.kind !== "recipe" || top.coalesceKey === undefined) return false;
    if (top.coalesceKey !== key) return false;
    const elapsed = at - top.at;
    return elapsed >= 0 && elapsed <= windowMs;
  };

  return {
    limit,
    coalesceWindowMs,
    push(entry) {
      redoStack.length = 0;
      if (entry.kind === "recipe" && entry.coalesceKey !== undefined && canCoalesce(entry.coalesceKey, entry.at)) {
        const top = undoStack[undoStack.length - 1] as RecipeHistoryEntry;
        // param/set·expression/set만 병합 대상이므로 capabilities는 첫 항목의 것을 유지한다.
        const merged: RecipeHistoryEntry = { ...top, after: entry.after, at: entry.at, labelKo: entry.labelKo };
        undoStack[undoStack.length - 1] = merged;
        return "coalesced";
      }
      undoStack.push(entry);
      while (undoStack.length > limit) undoStack.shift();
      return "pushed";
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) return undefined;
      redoStack.push(entry);
      return entry;
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) return undefined;
      undoStack.push(entry);
      return entry;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    depth: () => undoStack.length,
    redoDepth: () => redoStack.length,
    peekUndo: () => undoStack[undoStack.length - 1],
    peekRedo: () => redoStack[redoStack.length - 1],
    canCoalesce,
    entries: () => [...undoStack],
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
