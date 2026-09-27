// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CHARACTER_SHAPER_HISTORY_LIMIT, CHARACTER_SHAPER_HISTORY_MAX_ESTIMATED_BYTES, characterShaperHistoryState, estimateCharacterShaperHistoryEntryBytes, createCharacterShaperHistory, pushCharacterShaperHistory, redoCharacterShaperHistory, undoCharacterShaperHistory, useCharacterShaperHistory } from "./useCharacterShaperHistory";

import type { CharacterShaperHistoryStack } from "./useCharacterShaperHistory";

type Snapshot = { readonly value: string };

afterEach(cleanup);

function stackOf(...labels: readonly string[]): CharacterShaperHistoryStack<Snapshot> {
  let stack = createCharacterShaperHistory<Snapshot>();
  for (const label of labels) {
    stack = pushCharacterShaperHistory(stack, { label, snapshot: { value: label } });
  }
  return stack;
}

describe("character shaper history", () => {
  it("외부 authority 모드에서는 snapshot을 읽거나 이력 변경으로 렌더하지 않는다", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useCharacterShaperHistory<Snapshot>({ enabled: false });
    });
    const initialRenders = renders;
    const snapshot: Snapshot = {
      get value(): string { throw new Error("외부 authority의 snapshot을 로컬 이력에서 읽으면 안 됩니다."); },
    };
    act(() => {
      result.current.push("문서 재생", snapshot);
      expect(result.current.undo(snapshot)).toBeNull();
      expect(result.current.redo(snapshot)).toBeNull();
      result.current.reset();
    });
    expect(renders).toBe(initialRenders);
    expect(result.current.state).toEqual({ canUndo: false, canRedo: false, length: 0, recentLabels: [] });
  });

  it("authority 전환 후 독립 모드로 돌아와도 이전 snapshot을 복원하지 않는다", () => {
    const { result, rerender } = renderHook(({ enabled }) => useCharacterShaperHistory<Snapshot>({ enabled }), {
      initialProps: { enabled: true },
    });
    act(() => result.current.push("이전 호스트", { value: "이전 모델" }));
    expect(result.current.state.length).toBe(1);
    rerender({ enabled: false });
    rerender({ enabled: true });
    act(() => expect(result.current.undo({ value: "복원한 문서" })).toBeNull());
    expect(result.current.state.length).toBe(0);
  });

  it("starts empty and reports nothing to undo or redo", () => {
    expect(characterShaperHistoryState(createCharacterShaperHistory<Snapshot>())).toEqual({
      canUndo: false,
      canRedo: false,
      recentLabels: [],
      length: 0,
    });
  });

  it("records one step per push and lists the newest labels first", () => {
    const state = characterShaperHistoryState(stackOf("눈: 순정 반짝눈", "헤어: 보브", "상의: 셔츠"));
    expect(state.length).toBe(3);
    expect(state.canUndo).toBe(true);
    expect(state.recentLabels).toEqual(["상의: 셔츠", "헤어: 보브", "눈: 순정 반짝눈"]);
  });

  it("undo restores the snapshot recorded before the step and offers it back to redo", () => {
    const stack = stackOf("눈: 순정 반짝눈", "헤어: 보브");
    const undone = undoCharacterShaperHistory(stack, { value: "현재" });
    expect(undone.restore).toEqual({ value: "헤어: 보브" });
    expect(undone.label).toBe("헤어: 보브");
    expect(characterShaperHistoryState(undone.stack)).toMatchObject({ canUndo: true, canRedo: true, length: 1 });

    const redone = redoCharacterShaperHistory(undone.stack, { value: "되돌린 상태" });
    expect(redone.restore).toEqual({ value: "현재" });
    expect(characterShaperHistoryState(redone.stack)).toMatchObject({ canUndo: true, canRedo: false, length: 2 });
  });

  it("returns null and keeps the stack when there is nothing to travel to", () => {
    const empty = createCharacterShaperHistory<Snapshot>();
    const undone = undoCharacterShaperHistory(empty, { value: "현재" });
    expect(undone.restore).toBeNull();
    expect(undone.stack).toBe(empty);

    const redone = redoCharacterShaperHistory(empty, { value: "현재" });
    expect(redone.restore).toBeNull();
    expect(redone.stack).toBe(empty);
  });

  it("a new step after an undo drops the redo branch", () => {
    const undone = undoCharacterShaperHistory(stackOf("a", "b"), { value: "현재" });
    expect(characterShaperHistoryState(undone.stack).canRedo).toBe(true);
    const pushed = pushCharacterShaperHistory(undone.stack, { label: "c", snapshot: { value: "c" } });
    expect(characterShaperHistoryState(pushed)).toMatchObject({ canRedo: false, canUndo: true, length: 2 });
  });

  it("keeps at most 60 steps and drops the oldest", () => {
    const labels = Array.from({ length: CHARACTER_SHAPER_HISTORY_LIMIT + 5 }, (_, index) => `단계 ${index}`);
    const stack = stackOf(...labels);
    expect(stack.past).toHaveLength(CHARACTER_SHAPER_HISTORY_LIMIT);
    expect(stack.past[0]?.label).toBe("단계 5");
    expect(stack.past[stack.past.length - 1]?.label).toBe(`단계 ${CHARACTER_SHAPER_HISTORY_LIMIT + 4}`);
  });

  it("also evicts old whole-state snapshots when the byte budget is reached", () => {
    const payload = "x".repeat(1_100_000);
    let stack = createCharacterShaperHistory<Snapshot>();
    for (let index = 0; index < 5; index += 1) {
      stack = pushCharacterShaperHistory(stack, {
        label: `large ${index}`,
        snapshot: { value: `${index}${payload}` },
      });
    }
    expect(stack.past.length).toBeLessThan(5);
    expect(stack.past.at(-1)?.label).toBe("large 4");
    const retained = stack.past.reduce(
      (total, entry) => total + estimateCharacterShaperHistoryEntryBytes(entry),
      0,
    );
    expect(retained).toBeLessThanOrEqual(CHARACTER_SHAPER_HISTORY_MAX_ESTIMATED_BYTES);
  });

  it("never mutates the stack it is given", () => {
    const stack = stackOf("a");
    const frozen = { past: [...stack.past], future: [...stack.future] };
    pushCharacterShaperHistory(stack, { label: "b", snapshot: { value: "b" } });
    undoCharacterShaperHistory(stack, { value: "현재" });
    expect(stack.past).toEqual(frozen.past);
    expect(stack.future).toEqual(frozen.future);
  });
});
