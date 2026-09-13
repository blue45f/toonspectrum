// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readJournal, recordResult, recordVisit, usePlayDraft, usePlayJournal } from "./play-storage";

const key = "toonstudio.play.journal.v1";
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe("local creative journal", () => {
  it("recovers safely from broken JSON and malformed records", () => {
    localStorage.setItem(key, "bad json"); expect(readJournal()).toEqual({ favorites: [], recent: [], results: [] });
    localStorage.setItem(key, JSON.stringify({ favorites: ["sketch-sprint", "sketch-sprint", {}, "../bad"], recent: null, results: [null, { id: "x", game: "test", day: "bad" }] }));
    expect(readJournal()).toEqual({ favorites: ["sketch-sprint"], recent: [], results: [] });
  });
  it("keeps six unique recent experiences", () => {
    for (let i = 0; i < 9; i++) recordVisit(`game-${i}`); recordVisit("game-5");
    const recent = readJournal().recent; expect(recent).toHaveLength(6); expect(recent[0]).toBe("game-5"); expect(new Set(recent).size).toBe(6);
  });
  it("deduplicates completion and validates scores", () => {
    const result = { id: "run-1", game: "color-sense", label: "연습", score: 75 }; expect(recordResult(result)).toBe(true); expect(recordResult(result)).toBe(true); expect(readJournal().results).toHaveLength(1);
    expect(recordResult({ ...result, id: "invalid", score: NaN })).toBe(false);
  });
  it("bounds the journal to the latest 100 results", () => { for (let i = 0; i < 105; i++) recordResult({ id: `run-${i}`, game: "test", label: "연습" }); expect(readJournal().results).toHaveLength(100); expect(readJournal().results[0].id).toBe("run-104"); });
  it("reports blocked storage without crashing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded"); });
    expect(() => recordVisit("sketch-sprint")).not.toThrow(); expect(recordResult({ id: "run", game: "test", label: "연습" })).toBe(false);
  });
  it("synchronizes favorites and completion in the active tab", () => {
    const { result } = renderHook(usePlayJournal);
    act(() => result.current.toggleFavorite("sketch-sprint")); expect(result.current.journal.favorites).toEqual(["sketch-sprint"]);
    act(() => recordResult({ id: "run", game: "sketch-sprint", label: "연습" })); expect(result.current.journal.results).toHaveLength(1);
    act(() => result.current.toggleFavorite("sketch-sprint")); expect(result.current.journal.favorites).toEqual([]);
  });
});
describe("local drafts", () => {
  const validate = (value: unknown): value is { note: string } => !!value && typeof value === "object" && typeof (value as { note: unknown }).note === "string";
  it("restores a valid draft and persists edits", async () => {
    localStorage.setItem("toonstudio.play.test.v1", JSON.stringify({ note: "보관한 초안" }));
    const { result } = renderHook(() => usePlayDraft("test", () => ({ note: "새 초안" }), validate)); expect(result.current.value.note).toBe("보관한 초안");
    act(() => result.current.setValue({ note: "수정한 초안" })); await waitFor(() => expect(JSON.parse(localStorage.getItem("toonstudio.play.test.v1")!)).toEqual({ note: "수정한 초안" }));
  });
  it("keeps editing available with corrupted or blocked storage", async () => {
    localStorage.setItem("toonstudio.play.test.v1", "null"); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked"); });
    const { result } = renderHook(() => usePlayDraft("test", () => ({ note: "새 초안" }), validate));
    act(() => result.current.setValue({ note: "저장 실패해도 편집됨" })); expect(result.current.value.note).toBe("저장 실패해도 편집됨"); await waitFor(() => expect(result.current.saved).toBe(false));
  });
});
