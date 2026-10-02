import { describe, expect, it } from "vitest";

import { createDefaultRecipe } from "../contracts";

import { HISTORY_COALESCE_WINDOW_MS, HISTORY_DEFAULT_LIMIT, createHistory } from "./history";

import type { CharacterRecipe } from "../contracts";
import type { HistoryEntry, PaintHistoryEntry, RecipeHistoryEntry } from "./history";

function withHeight(recipe: CharacterRecipe, height: number): CharacterRecipe {
  return { ...recipe, body: { ...recipe.body, height } };
}

function entry(before: CharacterRecipe, after: CharacterRecipe, at: number, coalesceKey?: string): RecipeHistoryEntry {
  return { kind: "recipe", before, after, labelKo: "테스트", at, ...(coalesceKey === undefined ? {} : { coalesceKey }) };
}

describe("state/history", () => {
  it("기본값: 한도 200·coalesce 윈도우 250ms", () => {
    const history = createHistory();
    expect(history.limit).toBe(HISTORY_DEFAULT_LIMIT);
    expect(history.coalesceWindowMs).toBe(HISTORY_COALESCE_WINDOW_MS);
    expect(createHistory(5).limit).toBe(5);
    expect(createHistory({ limit: 3, coalesceWindowMs: 10 }).coalesceWindowMs).toBe(10);
  });

  it("N회 적용 후 undo N회면 초기 레시피와 deep-equal이고 redo N회면 마지막 상태로 돌아간다", () => {
    const history = createHistory();
    const initial = createDefaultRecipe();
    let current = initial;
    for (let i = 1; i <= 10; i += 1) {
      const next = withHeight(current, i / 10);
      history.push(entry(current, next, i * 1000));
      current = next;
    }
    expect(history.depth()).toBe(10);
    let restored: CharacterRecipe | undefined;
    for (let i = 0; i < 10; i += 1) {
      const popped = history.undo();
      expect(popped?.kind).toBe("recipe");
      if (popped?.kind === "recipe") restored = popped.before;
    }
    expect(restored).toEqual(initial);
    expect(history.canUndo()).toBe(false);
    expect(history.redoDepth()).toBe(10);
    expect(history.undo()).toBeUndefined();
    let redone: CharacterRecipe | undefined;
    for (let i = 0; i < 10; i += 1) {
      const popped = history.redo();
      if (popped?.kind === "recipe") redone = popped.after;
    }
    expect(redone).toEqual(current);
    expect(history.canRedo()).toBe(false);
    expect(history.redo()).toBeUndefined();
  });

  it("push는 redo 스택을 비운다", () => {
    const history = createHistory();
    const a = createDefaultRecipe();
    const b = withHeight(a, 0.1);
    const c = withHeight(a, 0.2);
    history.push(entry(a, b, 1));
    history.undo();
    expect(history.canRedo()).toBe(true);
    history.push(entry(a, c, 2));
    expect(history.canRedo()).toBe(false);
    expect(history.depth()).toBe(1);
    expect(history.peekUndo()).toMatchObject({ after: c });
  });

  it("같은 coalesceKey가 윈도우 안이면 1단계로 병합하고 before는 첫 항목 것을 유지한다", () => {
    const history = createHistory({ coalesceWindowMs: 250 });
    const a = createDefaultRecipe();
    const b = withHeight(a, 0.1);
    const c = withHeight(a, 0.2);
    const d = withHeight(a, 0.3);
    expect(history.push(entry(a, b, 0, "body:height"))).toBe("pushed");
    expect(history.push(entry(b, c, 200, "body:height"))).toBe("coalesced");
    expect(history.push(entry(c, d, 400, "body:height"))).toBe("coalesced");
    expect(history.depth()).toBe(1);
    const top = history.peekUndo();
    expect(top?.kind === "recipe" && top.before).toEqual(a);
    expect(top?.kind === "recipe" && top.after).toEqual(d);
    expect(top?.at).toBe(400);
  });

  it("윈도우 밖·다른 키·키 없음·paint 항목 뒤에는 병합하지 않는다", () => {
    const history = createHistory({ coalesceWindowMs: 250 });
    const a = createDefaultRecipe();
    const b = withHeight(a, 0.1);
    history.push(entry(a, b, 0, "k"));
    expect(history.push(entry(b, a, 251, "k"))).toBe("pushed");
    expect(history.push(entry(a, b, 300, "other"))).toBe("pushed");
    expect(history.push(entry(b, a, 310))).toBe("pushed");
    expect(history.push(entry(a, b, 320, "k"))).toBe("pushed");
    history.push({ kind: "paint", token: { part: "skin", tiles: [], tileSize: 64 }, labelKo: "페인트", at: 330 });
    expect(history.push(entry(b, a, 340, "k"))).toBe("pushed");
    expect(history.depth()).toBe(7);
    expect(history.canCoalesce("k", 350)).toBe(true);
    expect(history.canCoalesce("k", 1000)).toBe(false);
    expect(history.canCoalesce("k", 100)).toBe(false);
    expect(history.canCoalesce("zzz", 350)).toBe(false);
  });

  it("한도를 넘으면 가장 오래된 항목을 버린다", () => {
    const history = createHistory({ limit: 200 });
    const initial = createDefaultRecipe();
    let current = initial;
    for (let i = 1; i <= 205; i += 1) {
      const next = withHeight(current, (i % 10) / 10);
      history.push(entry(current, next, i));
      current = next;
    }
    expect(history.depth()).toBe(200);
    const entries = history.entries();
    expect(entries[0]?.at).toBe(6);
    expect(entries[199]?.at).toBe(205);
    let oldest: RecipeHistoryEntry | undefined;
    while (history.canUndo()) {
      const popped = history.undo();
      if (popped?.kind === "recipe") oldest = popped;
    }
    expect(oldest?.at).toBe(6);
    expect(oldest?.before).toEqual(withHeight(initial, 0.5));
  });

  it("discard는 조건에 맞는 항목을 undo·redo 스택에서 순서를 지키며 모두 빼고 개수를 돌려준다", () => {
    const history = createHistory();
    const a = createDefaultRecipe();
    const paint = (at: number): PaintHistoryEntry => ({ kind: "paint", token: { part: "skin", tiles: [], tileSize: 64 }, labelKo: "페인트", at });
    const isPaint = (candidate: HistoryEntry): boolean => candidate.kind === "paint";
    history.push(entry(a, withHeight(a, 0.1), 1));
    history.push(paint(2));
    history.push(entry(withHeight(a, 0.1), withHeight(a, 0.2), 3));
    history.push(paint(4));
    history.push(paint(5));
    history.undo();
    history.undo();
    expect(history.depth()).toBe(3);
    expect(history.redoDepth()).toBe(2);
    expect(history.discard(isPaint)).toBe(3);
    expect(history.entries().map((candidate) => candidate.at)).toEqual([1, 3]);
    expect(history.redoDepth()).toBe(0);
    expect(history.canRedo()).toBe(false);
    expect(history.discard(isPaint)).toBe(0);
    expect(history.undo()?.at).toBe(3);
  });

  it("clear는 양쪽 스택을 비운다", () => {
    const history = createHistory();
    const a = createDefaultRecipe();
    history.push(entry(a, withHeight(a, 0.1), 1));
    history.push(entry(a, withHeight(a, 0.2), 2));
    history.undo();
    history.clear();
    expect(history.depth()).toBe(0);
    expect(history.redoDepth()).toBe(0);
    expect(history.peekRedo()).toBeUndefined();
  });
});
