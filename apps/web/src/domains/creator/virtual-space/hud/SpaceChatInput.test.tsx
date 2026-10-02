// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpaceChatInput } from "./SpaceChatInput";

afterEach(cleanup);

function renderChat(overrides: Partial<{
  blocked: boolean;
  touch: boolean;
  onTypingChange: (typing: boolean) => void;
  onSend: (text: string) => void;
  onClosed: () => void;
}> = {}) {
  const props = {
    blocked: false,
    touch: false,
    onTypingChange: vi.fn(),
    onSend: vi.fn(),
    onClosed: vi.fn(),
    ...overrides,
  };
  render(<SpaceChatInput {...props} />);
  return props;
}

function openWithEnter() {
  fireEvent.keyDown(window, { key: "Enter" });
  return screen.getByLabelText("근처 사람들에게 보낼 말");
}

describe("SpaceChatInput", () => {
  it("닫힌 상태에서는 힌트 버튼만 보이고, Enter로 입력이 열린다", () => {
    renderChat();
    expect(screen.getByRole("button", { name: "채팅 열기" })).toBeTruthy();
    const input = openWithEnter();
    expect(document.activeElement).toBe(input);
  });

  it("입력하면 타이핑 신호가 오가고, Enter 전송으로 보내고 닫는다", () => {
    const props = renderChat();
    const input = openWithEnter();
    fireEvent.change(input, { target: { value: "  안녕하세요  " } });
    expect(props.onTypingChange).toHaveBeenLastCalledWith(true);
    fireEvent.submit(input.closest("form")!);
    expect(props.onSend).toHaveBeenCalledWith("안녕하세요");
    expect(props.onTypingChange).toHaveBeenLastCalledWith(false);
    expect(props.onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("근처 사람들에게 보낼 말")).toBeNull();
  });

  it("빈 메시지는 보내지 않지만 입력은 닫힌다", () => {
    const props = renderChat();
    const input = openWithEnter();
    fireEvent.change(input, { target: { value: "   " } });
    expect(props.onTypingChange).toHaveBeenLastCalledWith(false);
    fireEvent.submit(input.closest("form")!);
    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("근처 사람들에게 보낼 말")).toBeNull();
  });

  it("Esc는 전송 없이 닫고 타이핑 신호를 내린다", () => {
    const props = renderChat();
    const input = openWithEnter();
    fireEvent.change(input, { target: { value: "작성 중" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(props.onTypingChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByLabelText("근처 사람들에게 보낼 말")).toBeNull();
  });

  it("포커스를 잃으면 전송 없이 닫는다", () => {
    const props = renderChat();
    const input = openWithEnter();
    fireEvent.change(input, { target: { value: "작성 중" } });
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(props.onSend).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("근처 사람들에게 보낼 말")).toBeNull();
  });

  it("blocked면 힌트도 Enter 열기도 동작하지 않는다", () => {
    renderChat({ blocked: true });
    expect(screen.queryByRole("button", { name: "채팅 열기" })).toBeNull();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.queryByLabelText("근처 사람들에게 보낼 말")).toBeNull();
  });

  it("버튼에 포커스가 있을 때의 Enter는 가로채지 않는다", () => {
    renderChat();
    const hint = screen.getByRole("button", { name: "채팅 열기" });
    hint.focus();
    fireEvent.keyDown(hint, { key: "Enter" });
    expect(screen.queryByLabelText("근처 사람들에게 보낼 말")).toBeNull();
  });

  it("다른 입력 요소에서 친 Enter도 가로채지 않는다", () => {
    render(<>
      <input aria-label="다른 입력" />
      <SpaceChatInput blocked={false} touch={false} onTypingChange={vi.fn()} onSend={vi.fn()} onClosed={vi.fn()} />
    </>);
    const other = screen.getByLabelText("다른 입력");
    other.focus();
    fireEvent.keyDown(other, { key: "Enter" });
    expect(screen.queryByLabelText("근처 사람들에게 보낼 말")).toBeNull();
  });

  it("힌트 버튼 클릭으로도 열린다(터치)", () => {
    renderChat({ touch: true });
    fireEvent.click(screen.getByRole("button", { name: "채팅 열기" }));
    expect(screen.getByLabelText("근처 사람들에게 보낼 말")).toBeTruthy();
  });
});
