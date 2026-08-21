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

  it("yields instead of stealing focus when another modal is already open", () => {
    // 자동 코치가 이미 열린 다이얼로그 위로 뒤늦게 마운트되는 실측 경로(2026-08-21).
    const foreign = document.createElement("section");
    foreign.setAttribute("role", "dialog");
    foreign.setAttribute("aria-modal", "true");
    const foreignControl = document.createElement("button");
    foreignControl.type = "button";
    foreign.append(foreignControl);
    document.body.append(foreign);
    foreignControl.focus();

    const handlers = createHandlers();
    try {
      render(<StudioQuickStartPanel {...handlers} />);

      expect(handlers.onDismiss).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(foreignControl);
    } finally {
      foreign.remove();
    }
  });

  it("keeps its modal contract armed when it is the only modal on screen", () => {
    // jsdom 은 레이아웃이 없어 실제 초기 포커스 착지를 재현하지 못한다. 대신 계약이
    // 살아 있다는 관측 가능한 신호(자동 양보 없음 + Esc 처리)를 확인한다.
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    expect(handlers.onDismiss).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
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

  it("honours its aria-modal contract by trapping Tab inside the dialog", () => {
    // 감사 근거(docs/rewrite/ux-audit-v5.md §2.9): aria-modal="true" 인데 Tab 한 번에 포커스가
    // 다이얼로그 밖 `크리에이티브 모드` 버튼으로 새어 나갔다(WCAG 2.1 2.4.3 위반).
    // jsdom은 레이아웃을 계산하지 않아 getClientRects()가 항상 비어 있다. 포커스 가능 판정이
    // 실제 브라우저와 같아지도록 이 테스트 동안만 가시 사각형을 흉내 낸다.
    const originalGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function getClientRects() {
      return [
        { bottom: 24, height: 24, left: 0, right: 24, top: 0, width: 24, x: 0, y: 0 },
      ] as unknown as DOMRectList;
    };

    const outside = document.createElement("button");
    outside.textContent = "배경 버튼";
    document.body.append(outside);
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    const dialog = screen.getByRole("dialog", {
      name: "처음이라면 이 순서로 시작하세요",
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    outside.focus();
    // focusin 되돌리기: 다이얼로그 밖으로 옮겨간 포커스는 다시 안으로 끌려온다.
    fireEvent.focusIn(outside);
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab/⇧Tab은 다이얼로그 안에서 순환하고 배경으로 넘어가지 않는다.
    const focusables = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled])")];
    const first = focusables[0];
    const last = focusables.at(-1);
    expect(focusables.length).toBeGreaterThan(1);

    last?.focus();
    // fireEvent 반환 false = preventDefault 됨 = 네이티브 탭 이동이 일어나지 않음
    expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(first);

    expect(fireEvent.keyDown(document, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(last);

    outside.remove();
    Element.prototype.getClientRects = originalGetClientRects;
  });

  it("treats the first interaction outside the coach as a real dismissal", async () => {
    // 회귀 근거(브라우저 실측 2026-08-08): 코치가 떠 있는 채로 메뉴바에서 `텍스트 ▸ 말풍선`을
    // 열면 코치가 가려지기만 하고 dismiss 상태가 남지 않아, 그 패널을 Esc 로 닫는 순간 코치가
    // **다시 나타났다**. 바깥 조작을 진짜 dismiss 로 기록해야 재등장 경로가 닫힌다.
    const outside = document.createElement("button");
    outside.setAttribute("data-studio-main-menu-trigger", "text");
    document.body.append(outside);
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    // pointerdown 이 아니라 click 이어야 한다: pointerdown 에서 닫으면 코치 언마운트가
    // mousedown~mouseup 사이에 끼어들어 메뉴바가 재배치되고, 브라우저가 click 을 트리거가
    // 아닌 공통 조상으로 올려 첫 클릭이 통째로 사라졌다(실측 2026-08-08).
    fireEvent.pointerDown(outside);
    await Promise.resolve();
    expect(handlers.onDismiss).not.toHaveBeenCalled();

    // 그리고 클릭 dispatch 안에서가 아니라 그 뒤(마이크로태스크)에 닫아야 한다 — 클릭을
    // 처리하는 도중에 닫으면 재배치된 메뉴바가 사용자가 겨눈 트리거를 바꿔치기한다.
    fireEvent.click(outside);
    expect(handlers.onDismiss).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(handlers.onDismiss).toHaveBeenCalledOnce();

    outside.remove();
  });

  it("does not treat a click inside the coach as an outside dismissal", async () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    const dialog = screen.getByRole("dialog", {
      name: "처음이라면 이 순서로 시작하세요",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /2\. 그리기/u }));
    await Promise.resolve();
    expect(handlers.onDismiss).not.toHaveBeenCalled();

    // 배경(scrim)은 자기 onClick 으로 한 번만 닫는다 — 바깥 감시자가 겹쳐 두 번 부르면 안 된다.
    fireEvent.click(document.querySelector('[data-studio-quickstart-backdrop="true"]')!);
    await Promise.resolve();
    expect(handlers.onDismiss).toHaveBeenCalledOnce();
  });

  it("lands keyboard focus on the menubar instead of the document body when it closes", () => {
    // 스스로 뜬 코치에는 "열어 준 컨트롤"이 없어서 실측상 Esc 뒤 포커스가 BODY 로 떨어졌다.
    // 키보드 사용자가 문서 맨 앞부터 다시 Tab 하지 않도록 메뉴바 첫 트리거로 착지시킨다.
    const originalGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function getClientRects() {
      return [
        { bottom: 24, height: 24, left: 0, right: 24, top: 0, width: 24, x: 0, y: 0 },
      ] as unknown as DOMRectList;
    };

    const anchor = document.createElement("button");
    anchor.setAttribute("data-studio-main-menu-trigger", "file");
    document.body.append(anchor);
    const handlers = createHandlers();
    const view = render(<StudioQuickStartPanel {...handlers} />);

    expect(document.activeElement?.getAttribute("data-studio-quickstart-dismiss")).toBe(
      "true",
    );

    view.unmount();
    expect(document.activeElement).toBe(anchor);

    anchor.remove();
    Element.prototype.getClientRects = originalGetClientRects;
  });

  it("keeps the scrim clickable while the modal isolator runs", () => {
    const handlers = createHandlers();
    render(<StudioQuickStartPanel {...handlers} />);

    const backdrop = document.querySelector<HTMLElement>(
      '[data-studio-quickstart-backdrop="true"]',
    );
    expect(backdrop?.getAttribute("data-studio-modal-backdrop")).toBe("true");
    expect(backdrop?.hasAttribute("inert")).toBe(false);
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
