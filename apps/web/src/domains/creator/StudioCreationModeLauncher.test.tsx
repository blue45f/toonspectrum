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

  it("names the 3D entry points in the character and background modes", () => {
    render(<StudioCreationModeLauncher onSelectMode={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /만들기/ }));

    const modeButton = (mode: string): HTMLElement => {
      const found = document.querySelector<HTMLElement>(`[data-studio-creation-mode="${mode}"]`);
      if (!found) throw new Error(`creation mode ${mode} missing`);
      return found;
    };
    // 툴바에 3D 도구가 고정돼 있지 않아도 "3D"라는 말로 진입점을 찾을 수 있어야 한다.
    expect(modeButton("character").textContent).toContain("3D 캐릭터");
    expect(modeButton("background").textContent).toContain("3D 배경");
  });

  it("gives the rail trigger its own name and tooltip because CSS folds its text row away", () => {
    render(<StudioCreationModeLauncher onSelectMode={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: /만들기/ });
    // 좁은 레일에서는 글자 줄이 display:none 이라 이름 없는 버튼이 되지 않도록 속성으로 직접 단다.
    expect(trigger.getAttribute("aria-label")).toContain("만들기");
    // 풍선 도움말이 3D 캐릭터·배경 진입점을 미리 알려 준다.
    expect(trigger.getAttribute("title")).toContain("3D 캐릭터");
    expect(trigger.getAttribute("title")).toContain("3D 배경");
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
