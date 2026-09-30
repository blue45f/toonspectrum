// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import { SpaceSidePanel } from "./SpaceSidePanel";

// jsdom에는 native dialog가 없다. 모바일 시트의 초점 가두기는 브라우저 검증에서 확인한다.
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
afterEach(cleanup);

function Harness({ initial = "people", personal = false, desktop = true, onClose = vi.fn() }: {
  readonly initial?: StudioVirtualWorkspacePanel | null;
  readonly personal?: boolean;
  readonly desktop?: boolean;
  readonly onClose?: () => void;
}) {
  const [panel, setPanel] = useState<StudioVirtualWorkspacePanel | null>(initial);
  return <>
    <button type="button" onClick={() => setPanel("people")}>열기</button>
    <SpaceSidePanel id="side" panel={panel} personal={personal} desktop={desktop} onSelect={setPanel}
      onClose={() => { onClose(); setPanel(null); }}
      keepAlive={[{ id: "draft", visible: panel === "build", node: <input aria-label="초안" defaultValue="" /> }]}>
      <p>{panel} 내용</p>
    </SpaceSidePanel>
  </>;
}

describe("SpaceSidePanel", () => {
  it("데스크톱에서는 월드를 막지 않는 complementary 패널과 탭 목록을 그린다", () => {
    render(<Harness />);
    const panel = screen.getByRole("complementary", { name: "참가자" });
    expect(panel.tagName).toBe("ASIDE");
    expect(panel.getAttribute("aria-modal")).toBeNull();
    const tabs = within(panel).getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["참가자", "대화", "오늘", "장소", "꾸미기", "설정"]);
    expect(within(panel).getByRole("tab", { name: "참가자" }).getAttribute("aria-selected")).toBe("true");
    expect(within(panel).getByRole("tabpanel").textContent).toContain("people 내용");
  });

  it("개인 공간은 프로젝트 전용 탭을 숨긴다", () => {
    render(<Harness personal />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["참가자", "대화", "장소", "꾸미기", "설정"]);
  });

  it("좌우 화살표·Home·End로 탭을 옮기고 초점을 따라간다", () => {
    render(<Harness />);
    const people = screen.getByRole("tab", { name: "참가자" });
    people.focus();
    fireEvent.keyDown(people, { key: "ArrowLeft" });
    expect(screen.getByRole("complementary", { name: "설정" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "설정" }));
    fireEvent.keyDown(document.activeElement ?? people, { key: "Home" });
    expect(screen.getByRole("tab", { name: "참가자" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "참가자" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "설정" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "참가자" }).tabIndex).toBe(-1);
  });

  it("상세 화면은 소속 탭을 선택 상태로 두고 뒤로 가기 버튼을 제공한다", () => {
    render(<Harness initial="work" />);
    const panel = screen.getByRole("complementary", { name: "검수·작업함" });
    expect(within(panel).getByRole("tab", { name: "오늘" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(within(panel).getByRole("button", { name: "오늘의 제작 동선으로 돌아가기" }));
    expect(screen.getByRole("complementary", { name: "오늘의 제작 동선" })).toBeTruthy();
  });

  it("Esc와 닫기 버튼으로 닫히고, keepAlive 내용은 닫혀도 입력값을 유지한다", () => {
    const onClose = vi.fn();
    render(<Harness initial="build" onClose={onClose} />);
    fireEvent.change(screen.getByRole("textbox", { name: "초안" }), { target: { value: "저장 전" } });
    fireEvent.keyDown(screen.getByRole("complementary", { name: "꾸미기" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "초안" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    fireEvent.click(screen.getByRole("tab", { name: "꾸미기" }));
    expect(screen.getByRole("textbox", { name: "초안" })).toHaveProperty("value", "저장 전");
    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("좁은 화면에서는 모달 바텀시트로 열고 닫힌 뒤에는 시트를 닫는다", () => {
    const view = render(<Harness desktop={false} />);
    const sheet = view.container.querySelector("dialog");
    expect(sheet?.hasAttribute("open")).toBe(true);
    expect(sheet?.classList.contains("space-side-panel--sheet")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    expect(sheet?.hasAttribute("open")).toBe(false);
  });
});
