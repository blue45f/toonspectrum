// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { BOARD_SHORTCUTS, isBoardShortcutBlocked, resolveBoardShortcut } from "./board-shortcuts";

const key = (value: string, modifiers: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {}) => ({
  key: value,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers,
});

describe("보드 단축키 해석", () => {
  it("한 글자 키를 보드 동작으로 바꾼다", () => {
    expect(resolveBoardShortcut(key("c"), false)).toBe("new-card");
    expect(resolveBoardShortcut(key("/"), false)).toBe("search");
    expect(resolveBoardShortcut(key("j"), false)).toBe("next-card");
    expect(resolveBoardShortcut(key("k"), false)).toBe("prev-card");
    expect(resolveBoardShortcut(key("?", { shiftKey: true }), false)).toBe("help");
    expect(resolveBoardShortcut(key("Escape"), false)).toBe("escape");
  });

  it("Ctrl·Cmd 조합과 Shift 대문자는 다른 단축키와 겹치지 않게 무시한다", () => {
    expect(resolveBoardShortcut(key("c", { ctrlKey: true }), true)).toBeNull();
    expect(resolveBoardShortcut(key("k", { metaKey: true }), true)).toBeNull();
    expect(resolveBoardShortcut(key("J", { shiftKey: true }), true)).toBeNull();
  });

  it("화살표는 카드에 초점이 있을 때만 보드 이동으로 쓰고 Alt+화살표는 옮기기다", () => {
    expect(resolveBoardShortcut(key("ArrowDown"), false)).toBeNull();
    expect(resolveBoardShortcut(key("ArrowDown"), true)).toBe("next-card");
    expect(resolveBoardShortcut(key("ArrowLeft"), true)).toBe("prev-column");
    expect(resolveBoardShortcut(key("ArrowRight", { altKey: true }), true)).toBe("move-right");
    expect(resolveBoardShortcut(key("ArrowUp", { altKey: true }), true)).toBe("move-up");
    expect(resolveBoardShortcut(key("ArrowRight", { altKey: true }), false)).toBeNull();
  });

  it("도움말에 나오는 모든 동작이 실제로 해석 가능한 키를 가진다", () => {
    expect(new Set(BOARD_SHORTCUTS.map((shortcut) => shortcut.action)).size).toBe(BOARD_SHORTCUTS.length);
    const reachable = new Set(
      ["c", "/", "j", "k", "l", "h", "e", "x", "m", "Escape"]
        .map((value) => resolveBoardShortcut(key(value), true))
        .concat(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map((value) => resolveBoardShortcut(key(value, { altKey: true }), true)))
        .concat(resolveBoardShortcut(key("?", { shiftKey: true }), true)),
    );
    for (const shortcut of BOARD_SHORTCUTS) expect(reachable.has(shortcut.action), shortcut.action).toBe(true);
  });
});

describe("단축키를 막는 곳", () => {
  it("입력 칸·선택 상자·대화상자 안에서는 처리하지 않는다", () => {
    document.body.innerHTML = '<input id="a"><select id="b"></select><div role="dialog"><button id="c"></button></div><button id="d"></button>';
    expect(isBoardShortcutBlocked(document.getElementById("a"))).toBe(true);
    expect(isBoardShortcutBlocked(document.getElementById("b"))).toBe(true);
    expect(isBoardShortcutBlocked(document.getElementById("c"))).toBe(true);
    expect(isBoardShortcutBlocked(document.getElementById("d"))).toBe(false);
    expect(isBoardShortcutBlocked(null)).toBe(false);
  });
});
