// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings } from "./studio-app-settings";
import { StudioQuickStartPanel } from "./StudioQuickStartPanel";

import { useI18n } from "@/lib/i18n";

afterEach(cleanup);

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

function createHandlers() {
  return {
    onDismiss: vi.fn(),
    onQuickComic: vi.fn(),
    onExample: vi.fn(),
    onOpenTemplate: vi.fn(),
    onOpenCharacter: vi.fn(),
    onOpenBackground3d: vi.fn(),
    onOpenBubble: vi.fn(),
    onSmartShape: vi.fn(),
    onStartDraw: vi.fn(),
    onBrushKit: vi.fn(),
    onCollabFocus: vi.fn(),
    onOpenTutorials: vi.fn(),
    shortcuts: defaultStudioAppSettings().shortcuts,
  };
}

describe("StudioQuickStartPanel", () => {
  it("dismisses on Escape and backdrop click for low-friction first paint", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handlers.onDismiss).toHaveBeenCalledOnce();

    handlers.onDismiss.mockClear();
    fireEvent.click(document.querySelector('[data-studio-quickstart-backdrop="true"]')!);
    expect(handlers.onDismiss).toHaveBeenCalledOnce();
  });

  it("presents the familiar four-step workflow in order and opens immediate actions", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    const dialog = screen.getByRole("dialog", {
      name: "처음이라면 이 순서로 시작하세요",
    });

    expect(within(dialog).getByText("기능을 열면 바로 작업")).toBeTruthy();
    expect(
      within(dialog).getByText(/도구를 열면 바로 캔버스에서 작업해요|Esc 또는 바깥 클릭/u),
    ).toBeTruthy();
    expect(
      Array.from(dialog.querySelectorAll<HTMLElement>("[data-studio-quickstart-step]"), (step) =>
        step.getAttribute("data-studio-quickstart-step"),
      ),
    ).toEqual(["select", "draw", "dialogue", "save-undo"]);
    expect(within(dialog).getByText(/V · 클릭하거나 드래그해 고르기/u)).toBeTruthy();
    expect(within(dialog).getByText("Ctrl/⌘S 저장 · ⌘·Z 되돌리기")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /2\. 그리기/u }));
    fireEvent.click(within(dialog).getByRole("button", { name: /3\. 말풍선·텍스트/u }));

    expect(handlers.onStartDraw).toHaveBeenCalledOnce();
    expect(handlers.onOpenBubble).toHaveBeenCalledOnce();
  });

  it("keeps every primary route on its existing callback contract", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    fireEvent.click(screen.getByRole("button", { name: "웹툰 흐름으로 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "예시로 익히기" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 기능 안내" }));

    expect(handlers.onQuickComic).toHaveBeenCalledOnce();
    expect(handlers.onExample).toHaveBeenCalledOnce();
    expect(handlers.onOpenTutorials).toHaveBeenCalledOnce();
  });

  it("keeps secondary tools collapsed by default while preserving every direct route", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    const details = document.querySelector<HTMLDetailsElement>("[data-studio-quickstart-more]");
    expect(details).not.toBeNull();
    if (!details) return;

    expect(details.open).toBe(false);
    details.open = true;

    const actions = [
      ["선·도형 다듬기", handlers.onSmartShape],
      ["브러시 골라 그리기", handlers.onBrushKit],
      ["컷 나누기", handlers.onOpenTemplate],
      ["캐릭터·포즈", handlers.onOpenCharacter],
      ["3D 배경 열기", handlers.onOpenBackground3d],
      ["캔버스 넓게 보기", handlers.onCollabFocus],
    ] as const;

    for (const [name, handler] of actions) {
      const button = within(details).getByRole("button", { name: new RegExp(name, "u") });
      fireEvent.click(button);
      expect(handler).toHaveBeenCalledOnce();
      if (name === "브러시 골라 그리기") {
        expect(handler).toHaveBeenCalledWith(button);
      }
    }
    expect(details.querySelectorAll("[data-studio-quick-tool]")).toHaveLength(6);
  });

  it("limits canvas obstruction and keeps every interactive target touch-sized", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    const dialog = screen.getByRole("dialog", {
      name: "처음이라면 이 순서로 시작하세요",
    });
    const scrollArea = dialog.querySelector<HTMLElement>("[data-studio-quickstart-scroll]");

    expect(dialog.className).toContain("max-h-[min(60dvh,calc(100svh-5rem))]");
    expect(dialog.className).toContain("rounded-lg");
    expect(dialog.className).not.toContain("rounded-2xl");
    expect(scrollArea?.className).toContain("overflow-y-auto");

    for (const target of dialog.querySelectorAll<HTMLElement>("button, summary")) {
      expect(
        ["size-11", "min-h-11", "min-h-12", "min-h-[4.5rem]"].some((token) =>
          target.className.includes(token),
        ),
      ).toBe(true);
    }

    const close = within(dialog).getByRole("button", { name: /빠른 시작 닫기/u });
    expect(close.getAttribute("data-studio-quickstart-dismiss")).toBe("true");
    fireEvent.click(close);
    expect(handlers.onDismiss).toHaveBeenCalledOnce();
  });

  it("shows the current shortcut remap and uses 미지정 for an empty binding", () => {
    const handlers = createHandlers();
    render(
      <StudioQuickStartPanel
        {...handlers}
        shortcuts={{
          ...handlers.shortcuts,
          "tool-select": "Q",
          "tool-pen": "",
          "tool-lettering": "L",
          undo: "Mod+Y",
        }}
      />,
    );

    expect(screen.getByText("Q · 클릭하거나 드래그해 고르기")).toBeTruthy();
    expect(screen.getByText("미지정 · 펜을 열고 바로 그리기")).toBeTruthy();
    expect(screen.getByText("L · 도구를 열어 대사 넣기")).toBeTruthy();
    expect(screen.getByText("Ctrl/⌘S 저장 · ⌘·Y 되돌리기")).toBeTruthy();
  });

  it("uses an English typed fallback for new workflow copy outside Korean locales", () => {
    useI18n.getState().setLang("fr");
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    expect(screen.getByText("Start with these 4 steps")).toBeTruthy();
    expect(screen.getByText("Open a tool and start")).toBeTruthy();
    expect(screen.getByText("Open another tool")).toBeTruthy();
    expect(screen.queryByText("처음 시작하는 4단계")).toBeNull();
  });
});
