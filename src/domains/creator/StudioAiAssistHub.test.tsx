// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioAiAssistHub } from "./StudioAiAssistHub";

import type { StudioAiAssistHubProps } from "./StudioAiAssistHub";

const animationFrames: FrameRequestCallback[] = [];

function createProps(
  overrides: Partial<StudioAiAssistHubProps> = {}
): StudioAiAssistHubProps {
  return {
    activeTool: "background",
    connectionLabel: "연결됨",
    connectionOk: true,
    imageConfigured: true,
    onApplyPresetPrompt: vi.fn(),
    onOpenSettings: vi.fn(),
    onToolChange: vi.fn(),
    recentState: { version: 1, entries: [] },
    textConfigured: true,
    toolPanel: <input aria-label="활성 AI 도구 입력" />,
    ...overrides,
  };
}

function installScrollSpy(container: HTMLElement) {
  const panel = container.querySelector<HTMLElement>(
    "[data-studio-ai-assist-tool-panel]"
  );
  expect(panel).not.toBeNull();
  const scrollIntoView = vi.fn();
  Object.defineProperty(panel, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  return scrollIntoView;
}

beforeEach(() => {
  animationFrames.length = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("StudioAiAssistHub prompt reveal", () => {
  it("applies a preset and scrolls its own tool panel after the next frame", () => {
    const props = createProps();
    const view = render(<StudioAiAssistHub {...props} />);
    const scrollIntoView = installScrollSpy(view.container);

    fireEvent.click(screen.getByRole("button", { name: "교실·낮" }));

    expect(props.onApplyPresetPrompt).toHaveBeenCalledWith(
      "background",
      expect.stringContaining("한국 고등학교 교실")
    );
    expect(animationFrames).toHaveLength(1);
    expect(scrollIntoView).not.toHaveBeenCalled();

    animationFrames[0]?.(0);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
  });

  it("uses the same owned-panel reveal path for a recent prompt", () => {
    const prompt = "비 오는 밤의 옥상";
    const props = createProps({
      recentState: {
        version: 1,
        entries: [{ tool: "background", prompt, at: 1 }],
      },
    });
    const view = render(<StudioAiAssistHub {...props} />);
    const scrollIntoView = installScrollSpy(view.container);

    fireEvent.click(screen.getByRole("button", { name: prompt }));

    expect(props.onApplyPresetPrompt).toHaveBeenCalledWith("background", prompt);
    expect(animationFrames).toHaveLength(1);
    animationFrames[0]?.(0);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "smooth",
    });
  });
});
