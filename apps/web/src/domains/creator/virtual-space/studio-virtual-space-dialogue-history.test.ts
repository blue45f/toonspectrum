// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendStudioVirtualDialogueHistory,
  clearStudioVirtualDialogueHistory,
  readStudioVirtualDialogueHistory,
  speakStudioVirtualDialogue,
} from "./studio-virtual-space-dialogue-history";

describe("Virtual Studio NPC dialogue history", () => {
  beforeEach(() => clearStudioVirtualDialogueHistory("npc-editor"));

  it("keeps a bounded in-memory history without writing project dialogue to storage", () => {
    for (let index = 0; index < 24; index += 1) {
      appendStudioVirtualDialogueHistory("npc-editor", `질문 ${index}`, `답변 ${index}`, index + 1);
    }
    const history = readStudioVirtualDialogueHistory("npc-editor");
    expect(history).toHaveLength(20);
    expect(history[0]?.question).toBe("질문 4");
    expect(localStorage.length).toBe(0);
  });

  it("reads aloud only after an explicit call", () => {
    const cancel = vi.fn(), speak = vi.fn();
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { cancel, speak } });
    vi.stubGlobal("SpeechSynthesisUtterance", class { lang = ""; rate = 1; pitch = 1; constructor(readonly text: string) {} });
    expect(speakStudioVirtualDialogue("안녕하세요")).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
