// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { clearStudioVirtualDialogueHistory } from "./studio-virtual-space-dialogue-history";
import { StudioVirtualSpaceNpcDialoguePanel } from "./StudioVirtualSpaceNpcDialoguePanel";

const npc = DEFAULT_STUDIO_WORLD_MANIFEST.npcs[0]!;
const room = DEFAULT_STUDIO_WORLD_MANIFEST.rooms.find((candidate) => candidate.id === npc.roomId);
const operations = { phase: "ready" as const, project: null, inbox: [], calendar: [], error: null };

describe("StudioVirtualSpaceNpcDialoguePanel", () => {
  beforeEach(() => clearStudioVirtualDialogueHistory(npc.id));

  it("answers questions, exposes visit history, and changes readable text scale", () => {
    const onDialogueScale = vi.fn();
    render(<StudioVirtualSpaceNpcDialoguePanel npc={npc} room={room} operations={operations}
      peers={[]} artStyle="sky-island" dialogueScale="large" ttsEnabled={false}
      onDialogueScale={onDialogueScale} onAction={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "NPC에게 질문" }), { target: { value: "오늘 일정 알려줘" } });
    fireEvent.click(screen.getByRole("button", { name: "질문" }));
    expect(screen.getByText(/등록된 일정이 아직 없어요/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "대화 기록" }));
    expect(screen.getByText("오늘 일정 알려줘")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "글자 크기 변경" }));
    expect(onDialogueScale).toHaveBeenCalledWith("xlarge");
  });
});

describe("NPC 대화 선택지·초상화·표정", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const props = { npc, room, operations, peers: [], artStyle: "sky-island" as const, dialogueScale: "normal" as const, ttsEnabled: false,
    onDialogueScale: vi.fn() };

  it("이름·역할을 초상화 대체 텍스트로 쓰고, 인사는 기쁜 표정, 선택지를 기다리면 생각하는 표정으로 바뀐다", () => {
    vi.useFakeTimers();
    render(<StudioVirtualSpaceNpcDialoguePanel {...props} onAction={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    expect(dialog.getAttribute("data-expression")).toBe("happy");
    const portrait = screen.getByRole("img", { name: /·/u });
    const portraitText = portrait.getAttribute("aria-label") ?? portrait.getAttribute("alt") ?? "";
    expect(portraitText).toMatch(/·/u);
    expect(portraitText).not.toMatch(/NPC 초상화/u);
    act(() => { vi.advanceTimersByTime(2_700); });
    expect(dialog.getAttribute("data-expression")).toBe("thinking");
  });

  it("구역 안내는 이 구역의 실제 상호작용으로, 오늘의 팁은 생각하는 표정으로 답하고 같이 작업하기는 요청 흐름을 연다", () => {
    const onAction = vi.fn();
    render(<StudioVirtualSpaceNpcDialoguePanel {...props} roomInteractions={[{ labelKo: "원고 책상", labelEn: "Manuscript desk" }]}
      onAction={onAction} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "구역 안내" }));
    expect(screen.getByText(/원고 책상/u)).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("data-expression")).toBe("default");
    fireEvent.click(screen.getByRole("button", { name: "오늘의 팁" }));
    expect(screen.getByRole("dialog").getAttribute("data-expression")).toBe("thinking");
    expect(screen.getByRole("button", { name: "다른 팁" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "같이 작업하기" }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith("cowork");
  });

  it("개인 공간에서는 같이 작업하기 대신 팀 공간 안내를 답한다", () => {
    const onAction = vi.fn();
    render(<StudioVirtualSpaceNpcDialoguePanel {...props} personal onAction={onAction} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "같이 작업하기" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText(/개인 스튜디오에는 나만 있어요/u)).toBeTruthy();
  });

  it("Esc는 카드를 닫고 바깥으로 번지지 않는다", () => {
    const onClose = vi.fn();
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    try {
      render(<StudioVirtualSpaceNpcDialoguePanel {...props} onAction={vi.fn()} onClose={onClose} />);
      fireEvent.keyDown(screen.getByRole("button", { name: "구역 안내" }), { key: "Escape" });
      expect(onClose).toHaveBeenCalledOnce();
      expect(outer).not.toHaveBeenCalled();
    } finally { window.removeEventListener("keydown", outer); }
  });
});
