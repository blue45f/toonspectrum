// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
