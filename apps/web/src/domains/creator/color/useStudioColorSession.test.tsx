// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStudioColorSession } from "./useStudioColorSession";
import { beginStudioColorSession, editStudioColorSession, resolveStudioColorCommit } from "./studio-color-session";

afterEach(cleanup);

describe("shared color edit transactions", () => {
  it("preserves raw HEX input without document callbacks and confirms once", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useStudioColorSession({ targetKey: "doc:primary", value: "#ffffff", onCommit: commit }));
    for (const raw of ["#1", "#12", "#123", "#1234", "#12345", "#123456"]) {
      act(() => result.current.change(raw));
      expect(result.current.session.raw).toBe(raw);
      expect(commit).not.toHaveBeenCalled();
    }
    act(() => { result.current.commit(); result.current.commit(); });
    expect(commit).toHaveBeenCalledExactlyOnceWith("#123456");
  });
  it("cancels local preview without creating a color or document history entry", () => {
    const commit = vi.fn();
    const cancel = vi.fn();
    const { result } = renderHook(() => useStudioColorSession({ targetKey: "doc:primary", value: "#abcdef", onCommit: commit, onCancel: cancel }));
    act(() => result.current.change("#123456"));
    act(() => result.current.cancel());
    expect(result.current.session.color).toBe("#abcdef");
    expect(commit).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledExactlyOnceWith("#abcdef");
  });
  it.each(["document", "value", "disabled"])("rejects stale draft after %s changes", (kind) => {
    const commit = vi.fn();
    const invalidated = vi.fn();
    const { result, rerender } = renderHook((props) => useStudioColorSession({ ...props, onCommit: commit, onInvalidated: invalidated }), {
      initialProps: { targetKey: "doc-a:fill-1", value: "#ffffff", disabled: false },
    });
    act(() => result.current.change("#123456"));
    rerender({ targetKey: kind === "document" ? "doc-b:fill-2" : "doc-a:fill-1", value: kind === "value" ? "#abcdef" : "#ffffff", disabled: kind === "disabled" });
    act(() => result.current.commit());
    expect(commit).not.toHaveBeenCalled();
    expect(invalidated).toHaveBeenCalledOnce();
  });
  it("keeps invalid input visible and blocks confirmation", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useStudioColorSession({ targetKey: "p", value: "#ffffff", onCommit: commit }));
    act(() => result.current.change("#12gg"));
    act(() => expect(result.current.commit()).toBe(false));
    expect(result.current.session.raw).toBe("#12gg");
    expect(result.current.message).toContain("#RGB");
    expect(commit).not.toHaveBeenCalled();
  });
  it("has deterministic normalization and no-op contracts", () => {
    const initial = beginStudioColorSession("p", "#ABC");
    expect(resolveStudioColorCommit(initial, "p", "#aabbcc")).toEqual({ status: "unchanged" });
    const next = editStudioColorSession(initial, " #DEF ");
    expect(next.raw).toBe(" #DEF ");
    expect(resolveStudioColorCommit(next, "p", "#ABC")).toEqual({ status: "commit", color: "#ddeeff" });
    expect(resolveStudioColorCommit(next, "other", "#ABC")).toEqual({ status: "stale" });
  });
});


it("ignores a stale editor's callbacks after unmount", () => {
  const commit = vi.fn();
  const { result, unmount } = renderHook(() => useStudioColorSession({ targetKey: "old", value: "#ffffff", onCommit: commit }));
  const stale = result.current;
  act(() => stale.change("#123456"));
  unmount();
  act(() => { stale.change("#abcdef"); expect(stale.commit()).toBe(false); });
  expect(commit).not.toHaveBeenCalled();
});
