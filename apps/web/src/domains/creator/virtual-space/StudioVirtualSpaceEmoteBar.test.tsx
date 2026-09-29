// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEmoteBar } from "./StudioVirtualSpaceEmoteBar";
import { IDLE_EMOTE_STATE } from "./studio-virtual-space-emotes";

afterEach(() => {
  cleanup();
});

describe("이모트 바", () => {
  it("10개의 이모트 버튼을 렌더링한다", () => {
    render(<StudioVirtualSpaceEmoteBar emoteState={IDLE_EMOTE_STATE} onEmote={() => {}} />);
    expect(screen.getByRole("toolbar", { name: "이모트" })).not.toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(10);
  });

  it("버튼 클릭 시 onEmote가 호출된다", () => {
    const onEmote = vi.fn();
    render(<StudioVirtualSpaceEmoteBar emoteState={IDLE_EMOTE_STATE} onEmote={onEmote} />);
    fireEvent.click(screen.getByRole("button", { name: "춤추기" }));
    expect(onEmote).toHaveBeenCalledWith("dance");
  });

  it("실행 중인 이모트는 aria-pressed가 true다", () => {
    render(
      <StudioVirtualSpaceEmoteBar
        emoteState={{ active: "wave", startedAt: 0, lastTime: 0 }}
        onEmote={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "손 흔들기" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "춤추기" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("단축키 Z를 누르면 춤추기가 실행된다", () => {
    const onEmote = vi.fn();
    render(<StudioVirtualSpaceEmoteBar emoteState={IDLE_EMOTE_STATE} onEmote={onEmote} />);
    fireEvent.keyDown(window, { key: "z" });
    expect(onEmote).toHaveBeenCalledWith("dance");
  });

  it("입력 필드에서는 단축키가 동작하지 않는다", () => {
    const onEmote = vi.fn();
    render(
      <div>
        <input aria-label="채팅 입력" />
        <StudioVirtualSpaceEmoteBar emoteState={IDLE_EMOTE_STATE} onEmote={onEmote} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "채팅 입력" }), { key: "z" });
    expect(onEmote).not.toHaveBeenCalled();
  });

  it("disabled면 버튼이 비활성화된다", () => {
    render(<StudioVirtualSpaceEmoteBar emoteState={IDLE_EMOTE_STATE} onEmote={() => {}} disabled />);
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
