// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { STUDIO_CREATION_MODE_EVENT } from "../studio-creation-mode";
import { StudioCinematicCanvasWelcome } from "./StudioCinematicCanvasWelcome";
import { shouldShowStudioCinematicCanvasWelcome } from "./studio-cinematic-canvas-welcome-visibility";

describe("StudioCinematicCanvasWelcome", () => {
  it("keeps the empty-canvas launcher out of a joined live room", () => {
    const base = {
      elementCount: 0,
      sourceHydrationPending: false,
      workHydrationFailed: false,
      collaborationDocumentUnavailable: false,
      joinedStudioLiveJam: false,
    };
    expect(shouldShowStudioCinematicCanvasWelcome(base)).toBe(true);
    expect(shouldShowStudioCinematicCanvasWelcome({
      ...base,
      joinedStudioLiveJam: true,
    })).toBe(false);
    expect(shouldShowStudioCinematicCanvasWelcome({
      ...base,
      elementCount: 1,
    })).toBe(false);
  });

  it("shows image-led starting paths and genre scenes for an empty page", () => {
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);

    expect(screen.getByRole("heading", {
      name: "첫 장면을 어떻게 시작할까요?",
    })).toBeTruthy();
    expect(screen.getAllByRole("button").filter((button) => (
      button.hasAttribute("data-canvas-start-mode")
    ))).toHaveLength(6);
    expect(screen.getAllByRole("button").filter((button) => (
      button.hasAttribute("data-canvas-scene-preset")
    ))).toHaveLength(6);
  });

  it("requests a creation mode and dismisses after selection", () => {
    const listener = vi.fn();
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);

    fireEvent.click(screen.getByRole("button", { name: /캐릭터 배치/ }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", {
      name: "첫 장면을 어떻게 시작할까요?",
    })).toBeNull();
    window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener);
  });

  it("opens the background workspace from an image scene preset", () => {
    const listener = vi.fn();
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);

    fireEvent.click(screen.getByRole("button", {
      name: "로맨스 장면으로 배경 시작",
    }));

    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      mode: "background",
    });
    window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener);
  });

  it("can be dismissed while keeping the canvas blank", () => {
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);
    fireEvent.click(screen.getByRole("button", { name: "시작 안내 닫기" }));
    expect(screen.queryByRole("heading", {
      name: "첫 장면을 어떻게 시작할까요?",
    })).toBeNull();
  });
});
