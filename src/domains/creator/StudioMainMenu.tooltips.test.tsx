// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioMainMenu } from "./StudioMainMenu";
import { StudioToolHintPreferencesProvider } from "./StudioToolHint";

import type { StudioMainMenuGroup } from "./studio-main-menu-model";

const GROUPS: readonly StudioMainMenuGroup[] = [
  {
    id: "file",
    label: "파일",
    items: [{ id: "save", label: "임시저장", onSelect: vi.fn() }],
  },
  {
    id: "edit",
    label: "편집",
    items: [{ id: "undo", label: "실행취소", onSelect: vi.fn() }],
  },
  {
    id: "filter",
    label: "필터",
    items: [{ id: "blur", label: "가우시안 블러", onSelect: vi.fn() }],
  },
];

function renderMenu() {
  return render(
    <StudioToolHintPreferencesProvider
      mode="compact"
      touchHoldDelayMs={640}
      reduceMotion
    >
      <StudioMainMenu groups={GROUPS} />
    </StudioToolHintPreferencesProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("StudioMainMenu tooltips", () => {
  it("describes keyboard-focused top menus and keeps only the latest hint visible", () => {
    renderMenu();
    const file = screen.getByRole("button", { name: "파일" });
    const edit = screen.getByRole("button", { name: "편집" });

    fireEvent.focus(file);
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByRole("tooltip").textContent).toContain("원고를 저장·가져오기");
    expect(file.getAttribute("aria-describedby")).toBeTruthy();

    fireEvent.blur(file, { relatedTarget: edit });
    fireEvent.focus(edit, { relatedTarget: file });
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByRole("tooltip").textContent).toContain("실행취소, 클립보드");
    expect(document.body.textContent).not.toContain("원고를 저장·가져오기");
  });

  it("honors the hover-intent delay and Escape dismissal contract", () => {
    vi.useFakeTimers();
    renderMenu();
    const filter = screen.getByRole("button", { name: "필터" });

    fireEvent.mouseEnter(filter);
    act(() => vi.advanceTimersByTime(279));
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip").textContent).toContain("블러, 색조·채도·밝기");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not interrupt a normal touch tap with a transient tooltip", () => {
    vi.useFakeTimers();
    renderMenu();
    const file = screen.getByRole("button", { name: "파일" });

    fireEvent.pointerDown(file, { button: 0, pointerType: "touch", clientX: 12, clientY: 8 });
    act(() => vi.advanceTimersByTime(320));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerUp(file, { pointerType: "touch", clientX: 12, clientY: 8 });
    fireEvent.click(file);

    expect(screen.getByRole("menu", { name: "파일" })).not.toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "편집" }));
    act(() => vi.advanceTimersByTime(280));
    expect(screen.getByRole("menu", { name: "편집" })).not.toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
