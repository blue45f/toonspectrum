// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPageSequenceStrip, type StudioPageSequenceStripProps } from "../StudioPageSequenceStrip";

// jsdom에는 DragEvent가 없어 testing-library가 일반 Event로 대체하면 clientX가 사라진다.
if (typeof window.DragEvent === "undefined") {
  Object.defineProperty(window, "DragEvent", { value: class DragEventStub extends MouseEvent {}, configurable: true });
}

const PAGES = [
  { id: "p1", label: "도입" },
  { id: "p2", label: "" },
  { id: "p3", label: "클라이맥스" },
] as const;

function renderStrip(overrides: Partial<StudioPageSequenceStripProps> = {}) {
  const props: StudioPageSequenceStripProps = {
    open: true,
    pages: PAGES,
    currentPageId: "p2",
    onSelectPage: vi.fn(),
    onAddPage: vi.fn(),
    onReorderPage: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<StudioPageSequenceStrip {...props} />);
  return props;
}

function pageButton(index: number): HTMLButtonElement {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-studio-page-sequence-item="true"]');
  const button = buttons[index];
  if (!button) throw new Error(`page button ${index} missing`);
  return button;
}

function dropTarget(index: number): HTMLElement {
  const target = pageButton(index).closest("li");
  if (!target) throw new Error(`page item ${index} missing`);
  return target;
}

function stubRect(element: HTMLElement): void {
  element.getBoundingClientRect = () => ({ left: 100, width: 100, top: 0, height: 76 }) as DOMRect;
}

function dataTransfer() {
  return { effectAllowed: "none", dropEffect: "none", setData: vi.fn() };
}

afterEach(() => {
  cleanup();
});

describe("페이지 스트립 순서 바꾸기", () => {
  it("끌어서 다른 카드 오른쪽 절반에 놓으면 onReorderPage(from, to)를 부른다", () => {
    const props = renderStrip();
    const source = dropTarget(0);
    const target = dropTarget(2);
    stubRect(target);

    fireEvent.dragStart(source, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(target, { clientX: 190, dataTransfer: dataTransfer() });
    expect(target.getAttribute("data-studio-page-sequence-drop")).toBe("after");
    expect(target.querySelector('[data-studio-page-sequence-drop-mark="after"]')).not.toBeNull();

    fireEvent.drop(target, { clientX: 190, dataTransfer: dataTransfer() });
    expect(props.onReorderPage).toHaveBeenCalledWith(0, 2);
    expect(target.querySelector("[data-studio-page-sequence-drop-mark]")).toBeNull();
  });

  it("제자리에 놓으면 아무 것도 바꾸지 않는다", () => {
    const props = renderStrip();
    const source = dropTarget(1);
    stubRect(source);
    fireEvent.dragStart(source, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(source, { clientX: 190, dataTransfer: dataTransfer() });
    fireEvent.drop(source, { clientX: 190, dataTransfer: dataTransfer() });
    expect(props.onReorderPage).not.toHaveBeenCalled();
  });

  it("Alt+→ 는 선택한 페이지를 한 칸 뒤로 옮기고 결과를 읽어 준다", () => {
    const props = renderStrip();
    const button = pageButton(0);
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowRight", altKey: true });
    expect(props.onReorderPage).toHaveBeenCalledWith(0, 1);
    expect(screen.getByRole("status").textContent).toContain("1번 페이지(도입)를 2번째로 옮겼어요");
  });

  it("Shift+Alt+← 는 맨 앞으로, 이미 맨 앞이면 옮기지 않고 안내만 한다", () => {
    const props = renderStrip();
    const last = pageButton(2);
    fireEvent.keyDown(last, { key: "ArrowLeft", altKey: true, shiftKey: true });
    expect(props.onReorderPage).toHaveBeenCalledWith(2, 0);

    const first = pageButton(0);
    fireEvent.keyDown(first, { key: "ArrowLeft", altKey: true });
    expect(props.onReorderPage).toHaveBeenCalledTimes(1);
    expect(screen.getByText("이미 맨 앞 페이지예요.")).toBeTruthy();
  });

  it("방향키는 초점만 옮기고 편집기 전역 단축키로 새지 않는다", () => {
    const props = renderStrip();
    const leaked = vi.fn();
    document.addEventListener("keydown", leaked);
    const button = pageButton(1);
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowRight" });
    expect(document.activeElement).toBe(pageButton(2));
    expect(props.onSelectPage).not.toHaveBeenCalled();
    expect(props.onReorderPage).not.toHaveBeenCalled();
    expect(leaked).not.toHaveBeenCalled();
    document.removeEventListener("keydown", leaked);
  });

  it("Tab 진입점은 하나다: 현재 페이지, 이후에는 마지막으로 초점을 둔 페이지", () => {
    renderStrip();
    expect([0, 1, 2].map((index) => pageButton(index).tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.focus(pageButton(2));
    expect([0, 1, 2].map((index) => pageButton(index).tabIndex)).toEqual([-1, -1, 0]);
  });

  it("onReorderPage가 없거나 페이지가 1장이면 이동 전용이다(끌 수 없고 Alt 조합도 가로채지 않는다)", () => {
    const props = renderStrip({ onReorderPage: undefined });
    expect(dropTarget(0).getAttribute("draggable")).not.toBe("true");
    expect(document.querySelector('[data-studio-page-sequence-reorderable="true"]')).toBeNull();
    const notPrevented = fireEvent.keyDown(pageButton(0), { key: "ArrowRight", altKey: true });
    expect(notPrevented).toBe(true);
    expect(props.onSelectPage).not.toHaveBeenCalled();
    cleanup();

    renderStrip({ pages: [PAGES[0]], currentPageId: "p1" });
    expect(dropTarget(0).getAttribute("draggable")).not.toBe("true");
  });

  it("순서 바꾸기 가능 상태를 보이는 문구·단축키 선언·읽기 전용 설명으로 알린다", () => {
    renderStrip();
    const nav = screen.getByRole("navigation", { name: "페이지 시퀀스" });
    expect(nav.getAttribute("data-studio-page-sequence-reorderable")).toBe("true");
    expect(within(nav).getByText("끌어서 순서 변경")).toBeTruthy();
    expect(pageButton(0).getAttribute("aria-keyshortcuts")).toContain("Alt+ArrowRight");
    expect(pageButton(0).getAttribute("title")).toContain("Alt+←/→");
    expect(nav.textContent).toContain("Alt와 좌우 방향키로 선택한 페이지의 순서를 바꿉니다");
  });
});
