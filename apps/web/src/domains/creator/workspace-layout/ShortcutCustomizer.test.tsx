// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SHORTCUT_BINDINGS,
  findDuplicateShortcutKeys,
  normalizeShortcutKeys,
  type ShortcutCommandBinding,
} from "./shortcut-bindings";
import { ShortcutCustomizer } from "./ShortcutCustomizer";

afterEach(cleanup);

describe("shortcut helpers", () => {
  it("normalizeShortcutKeys가 수식어 순서를 고정한다", () => {
    expect(normalizeShortcutKeys("Shift+Ctrl+Z")).toBe("Ctrl+Shift+Z");
    expect(normalizeShortcutKeys("ctrl+z")).toBe("Ctrl+Z");
    expect(normalizeShortcutKeys("b")).toBe("B");
    expect(normalizeShortcutKeys("")).toBe("");
  });

  it("findDuplicateShortcutKeys가 중복을 검출한다", () => {
    const bindings: ShortcutCommandBinding[] = [
      { commandId: "a", label: "A", keys: "Ctrl+Z" },
      { commandId: "b", label: "B", keys: "ctrl+z" },
      { commandId: "c", label: "C", keys: "B" },
      { commandId: "d", label: "D", keys: "" },
    ];
    expect(findDuplicateShortcutKeys(bindings)).toEqual(["Ctrl+Z"]);
  });

  it("중복이 없으면 빈 배열이다", () => {
    expect(findDuplicateShortcutKeys(DEFAULT_SHORTCUT_BINDINGS)).toEqual([]);
  });
});

describe("ShortcutCustomizer", () => {
  it("기본 바인딩을 테이블로 렌더링한다", () => {
    render(<ShortcutCustomizer />);
    expect(screen.getByText("단축키 설정")).toBeTruthy();
    for (const binding of DEFAULT_SHORTCUT_BINDINGS) {
      expect(screen.getByLabelText(`${binding.label} 단축키`)).toBeTruthy();
    }
    const undoInput = screen.getByLabelText("되돌리기 단축키") as HTMLInputElement;
    expect(undoInput.value).toBe("Ctrl+Z");
  });

  it("키 입력으로 바인딩을 변경하고 onBindingsChange가 호출된다", () => {
    const onBindingsChange = vi.fn();
    render(<ShortcutCustomizer onBindingsChange={onBindingsChange} />);
    const input = screen.getByLabelText("브러시 단축키");
    fireEvent.keyDown(input, { key: "x", ctrlKey: true });
    expect(screen.getByText("단축키를 변경했어요.")).toBeTruthy();
    const last = onBindingsChange.mock.calls[onBindingsChange.mock.calls.length - 1][0];
    expect(last.find((b: ShortcutCommandBinding) => b.commandId === "brush")!.keys).toBe("Ctrl+X");
  });

  it("중복 키를 배정하면 오류를 표시한다", () => {
    render(<ShortcutCustomizer />);
    const brushInput = screen.getByLabelText("브러시 단축키");
    fireEvent.keyDown(brushInput, { key: "z", ctrlKey: true }); // 되돌리기와 충돌
    expect(screen.getByText("중복된 단축키가 있어요. 다른 키로 바꿔 주세요. (Ctrl+Z)")).toBeTruthy();
    expect(brushInput.getAttribute("aria-invalid")).toBe("true");
  });

  it("지우기 버튼으로 바인딩을 비운다", () => {
    const onBindingsChange = vi.fn();
    render(<ShortcutCustomizer onBindingsChange={onBindingsChange} />);
    fireEvent.click(screen.getByRole("button", { name: "브러시 지우기" }));
    const last = onBindingsChange.mock.calls[onBindingsChange.mock.calls.length - 1][0];
    expect(last.find((b: ShortcutCommandBinding) => b.commandId === "brush")!.keys).toBe("");
    expect(screen.getByText("단축키를 지웠어요.")).toBeTruthy();
  });

  it("기본값 복원 버튼이 초기 바인딩으로 되돌린다", () => {
    const onBindingsChange = vi.fn();
    render(<ShortcutCustomizer onBindingsChange={onBindingsChange} />);
    const brushInput = screen.getByLabelText("브러시 단축키") as HTMLInputElement;
    fireEvent.keyDown(brushInput, { key: "q" });
    expect(brushInput.value).toBe("Q");

    fireEvent.click(screen.getByRole("button", { name: "기본값 복원" }));
    expect((screen.getByLabelText("브러시 단축키") as HTMLInputElement).value).toBe("B");
    expect(screen.getByText("단축키를 기본값으로 되돌렸어요.")).toBeTruthy();
    const last = onBindingsChange.mock.calls[onBindingsChange.mock.calls.length - 1][0];
    expect(last).toEqual(DEFAULT_SHORTCUT_BINDINGS.map((b) => ({ ...b })));
  });

  it("수식어만 누르면 바인딩이 바뀌지 않는다", () => {
    const onBindingsChange = vi.fn();
    render(<ShortcutCustomizer onBindingsChange={onBindingsChange} />);
    const input = screen.getByLabelText("브러시 단축키") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Control", ctrlKey: true });
    expect(onBindingsChange).not.toHaveBeenCalled();
    expect(input.value).toBe("B");
  });
});
