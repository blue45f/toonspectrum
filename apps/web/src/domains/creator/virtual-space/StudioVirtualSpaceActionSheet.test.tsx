// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceActionSheet, StudioVirtualSpaceMenuSheet } from "./StudioVirtualSpaceActionSheet";
import type { StudioSpatialAction } from "./studio-virtual-space-spatial-actions";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

const original = Object.fromEntries(["showModal", "close"].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]));
const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
beforeEach(() => {
  showModal.mockClear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => {
  cleanup();
  for (const [name, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

const interaction: StudioWorldInteractionDefinition = {
  id: "team-console",
  zoneId: "lobby",
  point: { x: 100, y: 100 },
  radius: 64,
  labelKo: "팀 콘솔",
  labelEn: "Team console",
  action: "community",
};

const actions: readonly StudioSpatialAction[] = [
  {
    id: "team-hub",
    labelKo: "팀·그룹·초대",
    labelEn: "Teams, groups & invites",
    descriptionKo: "팀원을 초대합니다.",
    descriptionEn: "Invite teammates.",
    risk: "authority",
  },
];
describe("StudioVirtualSpaceActionSheet", () => {
  it("네이티브 모달로 열고 확인 단계에서 취소 버튼으로 이동한 뒤 원래 버튼에 포커스를 돌린다", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "상호작용";
    document.body.append(trigger);
    trigger.focus();
    const value = { interaction, actions, onChoose: vi.fn(), onConfirm: vi.fn(), onClose: vi.fn() };
    const view = render(<StudioVirtualSpaceActionSheet {...value} />);
    expect(showModal).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog").tagName).toBe("DIALOG");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /팀·그룹·초대/u }));
    view.rerender(<StudioVirtualSpaceActionSheet {...value} phase="confirming" selectedActionId="team-hub" onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "취소" }));
    expect(showModal).toHaveBeenCalledOnce();
    view.rerender(<StudioVirtualSpaceActionSheet {...value} phase="running" selectedActionId="team-hub" />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "닫기" }));
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("한글 조합 중 Escape는 유지하고 명시적 Escape와 네이티브 취소를 처리한다", () => {
    const onClose = vi.fn();
    render(<StudioVirtualSpaceActionSheet interaction={interaction} actions={actions} onChoose={vi.fn()} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape", isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
    expect(fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }))).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("selects a guarded action without executing confirmation implicitly", () => {
    const onChoose = vi.fn();
    const onConfirm = vi.fn();
    render(<StudioVirtualSpaceActionSheet
      interaction={interaction}
      actions={actions}
      phase="choosing"
      onChoose={onChoose}
      onConfirm={onConfirm}
      onClose={vi.fn()}
    />);

    fireEvent.click(screen.getByRole("button", { name: /팀·그룹·초대/u }));
    expect(onChoose).toHaveBeenCalledWith("team-hub");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires a second explicit confirmation for authority actions", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<StudioVirtualSpaceActionSheet
      interaction={interaction}
      actions={actions}
      phase="confirming"
      selectedActionId="team-hub"
      onChoose={vi.fn()}
      onConfirm={onConfirm}
      onClose={onClose}
    />);

    expect(screen.getByText(/실제 변경·게시·초대/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "확인하고 계속" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("StudioVirtualSpaceMenuSheet", () => {
  const items = [
    { id: "today", labelKo: "오늘", labelEn: "Today", descriptionKo: "오늘의 제작 동선", descriptionEn: "Today's flow" },
    { id: "space", labelKo: "장소·꾸미기", labelEn: "Places & settings", active: true },
  ];
  it("항목을 메뉴로 나열하고 선택하면 onSelect 뒤 자동으로 닫힌다", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<StudioVirtualSpaceMenuSheet titleKo="더보기" titleEn="More"
      descriptionKo="나머지 공간 메뉴" descriptionEn="More space menus"
      items={items} onSelect={onSelect} onClose={onClose} />);
    expect(showModal).toHaveBeenCalledOnce();
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /오늘/u })).toBeTruthy();
    const activeItem = screen.getByRole("menuitem", { name: /장소·꾸미기/u });
    expect(activeItem.getAttribute("aria-current")).toBeTruthy();
    // 첫 항목에 초기 포커스가 들어간다.
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /오늘/u }));
    fireEvent.click(activeItem);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("space");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Escape으로 닫고 닫을 때 포커스를 원래 버튼으로 돌린다", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "더보기";
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(<StudioVirtualSpaceMenuSheet titleKo="더보기" titleEn="More" items={items} onSelect={vi.fn()} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(fireEvent.keyDown(dialog, { key: "Escape" })).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("한글 조합 중 Escape는 무시한다", () => {
    const onClose = vi.fn();
    render(<StudioVirtualSpaceMenuSheet titleKo="더보기" titleEn="More" items={items} onSelect={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
  });
});
