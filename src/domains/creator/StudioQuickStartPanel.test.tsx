// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioQuickStartPanel } from "./StudioQuickStartPanel";

import { useI18n } from "@/lib/i18n";

vi.mock("./studio-creative-visuals", () => ({
  StudioStarterCardArt: ({ id }: { id: string }) => (
    <span data-testid={`starter-art-${id}`} />
  ),
}));

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
  };
}

describe("StudioQuickStartPanel", () => {
  it("offers the guided four-step route without hiding the direct tool routes", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    expect(screen.getByText(/4단계로 한 페이지를 조립/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "빠른 웹툰 만들기" }).className).toContain(
      "min-h-11"
    );
    expect(screen.getByRole("button", { name: "예시 캔버스" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "빈 캔버스에서 그리기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "기능 튜토리얼" })).toBeTruthy();
    expect(document.querySelectorAll("[data-studio-starter-card]")).toHaveLength(8);

    fireEvent.click(screen.getByRole("button", { name: "빠른 웹툰 만들기" }));
    fireEvent.click(screen.getByRole("button", { name: "예시 캔버스" }));
    fireEvent.click(screen.getByRole("button", { name: "빈 캔버스에서 그리기" }));
    fireEvent.click(screen.getByRole("button", { name: "기능 튜토리얼" }));

    expect(handlers.onQuickComic).toHaveBeenCalledOnce();
    expect(handlers.onExample).toHaveBeenCalledOnce();
    expect(handlers.onStartDraw).toHaveBeenCalledOnce();
    expect(handlers.onOpenTutorials).toHaveBeenCalledOnce();
  });

  it("maps each visual starter card to one distinct action", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    const actions = [
      ["펜으로 그리기", handlers.onStartDraw],
      ["스마트 도형", handlers.onSmartShape],
      ["브러시", handlers.onBrushKit],
      ["컷 템플릿", handlers.onOpenTemplate],
      ["캔버스 넓히기", handlers.onCollabFocus],
      ["캐릭터", handlers.onOpenCharacter],
      ["3D 배경", handlers.onOpenBackground3d],
      ["말풍선", handlers.onOpenBubble],
    ] as const;

    for (const [name, handler] of actions) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(name, "u") }));
      expect(handler).toHaveBeenCalledOnce();
    }
  });

  it("keeps the close control touch-sized and dismisses through the explicit route", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    const close = screen.getByRole("button", { name: "닫기" });
    expect(close.className).toContain("size-11");
    fireEvent.click(close);
    expect(handlers.onDismiss).toHaveBeenCalledOnce();
  });
});
