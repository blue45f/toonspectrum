// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioVirtualSpaceChatMessage } from "../studio-virtual-space-chat";
import { SpaceChatPanel } from "./SpaceChatPanel";

const messages: StudioVirtualSpaceChatMessage[] = [
  { id: "m1", sessionId: "peer-1", displayName: "민준", scope: "nearby", text: "안녕하세요!", at: 1, self: false },
  { id: "m2", sessionId: "self", displayName: "나", scope: "all", text: "모두 반가워요", at: 2, self: true },
];

function renderPanel(overrides: Partial<ComponentProps<typeof SpaceChatPanel>> = {}) {
  const props = {
    messages: [] as readonly StudioVirtualSpaceChatMessage[],
    typingNames: [] as readonly string[],
    open: false,
    onOpenChange: vi.fn(),
    onSend: vi.fn(),
    onTyping: vi.fn(),
    onReturnFocus: vi.fn(),
    ...overrides,
  };
  const view = render(<SpaceChatPanel {...props} />);
  return { props, view };
}

describe("SpaceChatPanel", () => {
  afterEach(() => cleanup());

  it("닫힌 상태에서는 최근 말을 미리 보여 주고 열기 버튼을 제공한다", () => {
    const { props } = renderPanel({ messages });
    expect(screen.getByText("안녕하세요!")).toBeTruthy();
    expect(screen.getByText("모두 반가워요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "말풍선 채팅 열기" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(true);
  });

  it("열린 상태에서는 로그에 보낸 범위 배지와 함께 메시지를 보여 준다", () => {
    renderPanel({ messages, open: true });
    const log = screen.getByRole("log", { name: "채팅 기록" });
    expect(log.textContent).toContain("민준");
    expect(log.textContent).toContain("안녕하세요!");
    expect(log.textContent).toContain("전체");
  });

  it("입력하면 타이핑을 알리고, 전송하면 범위와 함께 보내고 입력을 비운다", () => {
    const { props } = renderPanel({ open: true });
    const input = screen.getByRole("textbox", { name: "채팅 입력" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "가까이 와 보세요" } });
    expect(props.onTyping).toHaveBeenCalledWith("nearby", true);
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(screen.getByRole("button", { name: "전체" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.submit(input.closest("form")!);
    expect(props.onSend).toHaveBeenCalledWith("all", "가까이 와 보세요");
    expect(input.value).toBe("");
    expect(props.onTyping).toHaveBeenCalledWith("all", false);
  });

  it("빈 입력은 전송 버튼이 비활성화되고 전송되지 않는다", () => {
    const { props } = renderPanel({ open: true });
    const send = screen.getByRole("button", { name: "보내기" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const input = screen.getByRole("textbox", { name: "채팅 입력" });
    fireEvent.submit(input.closest("form")!);
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it("Esc로 닫으면 타이핑을 끄고 포커스 반환 콜백을 부른다", () => {
    const { props } = renderPanel({ open: true });
    const input = screen.getByRole("textbox", { name: "채팅 입력" });
    fireEvent.change(input, { target: { value: "쓰는 중" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onTyping).toHaveBeenCalledWith("nearby", false);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onReturnFocus).toHaveBeenCalled();
  });

  it("입력 중 표시 줄은 상대 이름을 보여 준다", () => {
    renderPanel({ open: true, typingNames: ["민준"] });
    expect(screen.getByRole("status").textContent).toContain("민준 님이 입력 중");
  });

  it("입력 길이는 말풍선 상한으로 제한된다", () => {
    renderPanel({ open: true });
    const input = screen.getByRole("textbox", { name: "채팅 입력" }) as HTMLInputElement;
    expect(input.maxLength).toBe(140);
  });
});
