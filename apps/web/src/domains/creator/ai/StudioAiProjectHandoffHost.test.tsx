// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioAiProjectHandoff, writeStudioAiProjectHandoff } from "./studio-ai-project-handoff";
import { StudioAiProjectHandoffHost } from "./StudioAiProjectHandoffHost";

afterEach(cleanup);
beforeEach(() => window.sessionStorage.clear());

describe("StudioAiProjectHandoffHost", () => {
  it("projects one project request onto the existing editor AI state", () => {
    writeStudioAiProjectHandoff(window.sessionStorage, createStudioAiProjectHandoff({
      projectId: "work-12",
      tool: "dialogue",
      prompt: "대사의 긴장감을 높여줘",
      source: "story",
      now: new Date(),
    }));

    const setActiveTool = vi.fn();
    const setDialogueSituation = vi.fn();
    const openAssistant = vi.fn();
    render(
      <StudioAiProjectHandoffHost
        projectId="work-12"
        setActiveTool={setActiveTool}
        setBackgroundPrompt={vi.fn()}
        setCharacterPrompt={vi.fn()}
        setCompositionDraft={vi.fn()}
        setDialogueSituation={setDialogueSituation}
        setPaletteMood={vi.fn()}
        openAssistant={openAssistant}
      />,
    );

    expect(setDialogueSituation).toHaveBeenCalledWith("대사의 긴장감을 높여줘");
    expect(setActiveTool).toHaveBeenCalledWith("dialogue");
    expect(openAssistant).toHaveBeenCalledTimes(1);
  });

  it("does nothing for another project and removes the stale intent", () => {
    writeStudioAiProjectHandoff(window.sessionStorage, createStudioAiProjectHandoff({
      projectId: "work-a",
      tool: "palette",
      prompt: "새벽 장면 팔레트",
      source: "project-shell",
      now: new Date(),
    }));

    const setPaletteMood = vi.fn();
    render(
      <StudioAiProjectHandoffHost
        projectId="work-b"
        setActiveTool={vi.fn()}
        setBackgroundPrompt={vi.fn()}
        setCharacterPrompt={vi.fn()}
        setCompositionDraft={vi.fn()}
        setDialogueSituation={vi.fn()}
        setPaletteMood={setPaletteMood}
        openAssistant={vi.fn()}
      />,
    );

    expect(setPaletteMood).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });
});
