// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_CREATION_MODE_EVENT,
  requestStudioCreationMode,
} from "./studio-creation-mode";
import { StudioCreationModeLauncher } from "./StudioCreationModeLauncher";

describe("StudioCreationModeLauncher", () => {
  it("opens the visual workspace palette and dispatches the selected mode", () => {
    const onSelectMode = vi.fn();
    render(<StudioCreationModeLauncher onSelectMode={onSelectMode} />);

    fireEvent.click(screen.getByRole("button", { name: /만들기/ }));

    expect(screen.getByRole("dialog", { name: "무엇을 만들까요?" })).toBeTruthy();
    expect(screen.getAllByRole("button").filter((button) => (
      button.hasAttribute("data-studio-creation-mode")
    ))).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: /AI 디렉터/ }));
    expect(onSelectMode).toHaveBeenCalledWith("ai");
  });

  it("reacts to a canvas-level creation mode request even while the palette is closed", () => {
    const onSelectMode = vi.fn();
    render(<StudioCreationModeLauncher onSelectMode={onSelectMode} />);

    requestStudioCreationMode("character");

    expect(onSelectMode).toHaveBeenCalledWith("character");
  });

  it("emits a stable browser event contract", () => {
    const listener = vi.fn();
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);

    requestStudioCreationMode("background");

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      mode: "background",
    });
    window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener);
  });
});
