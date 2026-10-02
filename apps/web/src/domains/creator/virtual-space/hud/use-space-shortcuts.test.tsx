// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioSpaceEmoteId } from "../studio-virtual-space-emote-catalog";
import { spaceShortcutIgnored, useSpaceShortcuts } from "./use-space-shortcuts";

afterEach(cleanup);

function handlers(escapeResult = true) {
  return {
    onEmote: vi.fn<(id: StudioSpaceEmoteId) => void>(),
    onToggleMap: vi.fn<() => void>(),
    onTogglePeople: vi.fn<() => void>(),
    onHelp: vi.fn<() => void>(),
    onEscape: vi.fn<() => boolean>(() => escapeResult),
  };
}

describe("useSpaceShortcuts", () => {
  it("1~9·Z는 카탈로그 이모트, M·P·?는 지도·참가자·도움말을 연다", () => {
    const value = handlers();
    renderHook(() => useSpaceShortcuts(value));
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "9" });
    fireEvent.keyDown(window, { key: "Z" });
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.keyDown(window, { key: "P" });
    fireEvent.keyDown(window, { key: "?" });
    expect(value.onEmote.mock.calls.map(([id]) => id)).toEqual(["wave", "idea", "dance"]);
    expect(value.onToggleMap).toHaveBeenCalledOnce();
    expect(value.onTogglePeople).toHaveBeenCalledOnce();
    expect(value.onHelp).toHaveBeenCalledOnce();
  });

  it("이동·상호작용 키(WASD·방향키·X)는 캔버스 몫이라 가로채지 않는다", () => {
    const value = handlers();
    renderHook(() => useSpaceShortcuts(value));
    for (const key of ["w", "a", "s", "d", "ArrowUp", "x", "Shift", "0"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, key).toBe(false);
    }
    expect(value.onEmote).not.toHaveBeenCalled();
  });

  it("입력 요소·IME 조합·보조키·반복 입력은 무시한다", () => {
    const value = handlers();
    renderHook(() => useSpaceShortcuts(value));
    const input = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(input, editable);
    try {
      fireEvent.keyDown(input, { key: "1" });
      fireEvent.keyDown(editable, { key: "m" });
      fireEvent.keyDown(window, { key: "1", isComposing: true });
      fireEvent.keyDown(window, { key: "1", metaKey: true });
      fireEvent.keyDown(window, { key: "p", altKey: true });
      fireEvent.keyDown(window, { key: "2", repeat: true });
    } finally {
      input.remove(); editable.remove();
    }
    expect(value.onEmote).not.toHaveBeenCalled();
    expect(value.onToggleMap).not.toHaveBeenCalled();
    expect(value.onTogglePeople).not.toHaveBeenCalled();
  });

  it("Esc는 닫은 창이 있을 때만 기본 동작을 막고, 비활성화하면 아무 키도 처리하지 않는다", () => {
    const closed = handlers(true);
    const view = renderHook(({ enabled }) => useSpaceShortcuts(closed, enabled), { initialProps: { enabled: true } });
    const first = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(true);
    view.rerender({ enabled: false });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "1" });
    expect(closed.onEscape).toHaveBeenCalledOnce();
    expect(closed.onEmote).not.toHaveBeenCalled();
    view.unmount();

    const nothing = handlers(false);
    renderHook(() => useSpaceShortcuts(nothing));
    const second = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });

  it("spaceShortcutIgnored는 입력 대상과 보조키를 판정한다", () => {
    const input = document.createElement("input");
    const button = document.createElement("button");
    const base = { isComposing: false, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false };
    expect(spaceShortcutIgnored({ ...base, target: input })).toBe(true);
    expect(spaceShortcutIgnored({ ...base, target: button })).toBe(false);
    expect(spaceShortcutIgnored({ ...base, target: button, ctrlKey: true })).toBe(true);
    expect(spaceShortcutIgnored({ ...base, target: null, defaultPrevented: true })).toBe(true);
  });
});
