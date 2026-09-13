// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStudioFloatingSurfaceStackForTest } from "./studio-floating-surface-stack";
import { arrangeStudioWorkspaceRegions, setStudioWorkspaceArranging } from "./studio-workspace-arrangement";
import { StudioDetachablePanelSlot } from "./StudioDetachablePanelSlot";
import { StudioWorkspaceArrangementToolbar } from "./StudioWorkspaceArrangementToolbar";
import { StudioWorkspaceRegion } from "./StudioWorkspaceRegion";

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number; readonly pointerType: string; readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? "mouse"; this.isPrimary = init.isPrimary ?? true;
  }
}
const pointerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "PointerEvent");
beforeEach(() => {
  Object.defineProperty(globalThis, "PointerEvent", { configurable: true, value: TestPointerEvent });
  Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 1440 });
  Object.defineProperty(globalThis, "innerHeight", { configurable: true, value: 1000 });
  sessionStorage.clear(); setStudioWorkspaceArranging(false);
});
afterEach(() => {
  cleanup(); resetStudioFloatingSurfaceStackForTest(); setStudioWorkspaceArranging(false);
  if (pointerDescriptor) Object.defineProperty(globalThis, "PointerEvent", pointerDescriptor);
  else Reflect.deleteProperty(globalThis, "PointerEvent");
  document.body.style.cursor = ""; document.body.style.userSelect = "";
});
function regionNode() { return document.querySelector<HTMLDivElement>('[data-studio-workspace-region="test"]')!; }
function Harness({ disabled = false }: { disabled?: boolean }) {
  return <><StudioWorkspaceArrangementToolbar disabled={disabled} /><StudioWorkspaceRegion surfaceId="test" label="테스트 도구" disabled={disabled}><button type="button">도구 실행</button></StudioWorkspaceRegion></>;
}
function edit() { fireEvent.click(screen.getByRole("button", { name: "배치 편집" })); }

describe("StudioWorkspaceRegion", () => {
  it("suspends a hidden authored sidebar without forgetting its arrangement", () => {
    const defaultLayout = { version: 2, xRatio: 0.1, yRatio: 0.1, width: 360, height: 600, dock: "free", positionLocked: false, sizeLocked: false } as const;
    const content = (hidden: boolean) => <StudioDetachablePanelSlot detached={false} surfaceId="page-list" label="페이지" defaultLayout={defaultLayout} onClose={() => undefined}><div data-studio-sheet-id="pages" className={hidden ? "lg:hidden" : ""}>페이지 내용</div></StudioDetachablePanelSlot>;
    const view = render(content(false));
    act(() => { setStudioWorkspaceArranging(true); arrangeStudioWorkspaceRegions("detach"); });
    const node = document.querySelector<HTMLDivElement>('[data-studio-workspace-region="panel-page-list"]')!;
    expect(node.dataset.studioRegionFloating).toBe("true");
    view.rerender(content(true)); expect(node.dataset.studioRegionFloating).toBe("false");
    view.rerender(content(false)); expect(node.dataset.studioRegionFloating).toBe("true");
  });

  it("keeps editing controls out of the default workspace until explicitly requested", () => {
    render(<Harness />); expect(screen.queryByRole("button", { name: "테스트 도구 이동" })).toBeNull();
    edit(); expect(screen.getByRole("button", { name: "테스트 도구 이동" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" }); expect(screen.queryByRole("button", { name: "테스트 도구 이동" })).toBeNull();
  });
  it("keeps local input and mounted child state while moving, attaching, and disabling", () => {
    const mounted = vi.fn(); const unmounted = vi.fn();
    function Child() { const [value, setValue] = useState(""); useEffect(() => { mounted(); return unmounted; }, []); return <input aria-label="이름" value={value} onChange={(event) => setValue(event.target.value)} />; }
    const view = render(<StudioWorkspaceRegion surfaceId="test" label="테스트 도구"><Child /></StudioWorkspaceRegion>);
    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), { target: { value: "작업 중인 값" } });
    act(() => setStudioWorkspaceArranging(true));
    fireEvent.keyDown(screen.getByRole("button", { name: "테스트 도구 이동" }), { key: "ArrowRight", altKey: true });
    expect(regionNode().dataset.studioRegionFloating).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "테스트 도구 원래 자리로 붙이기" }));
    expect(regionNode().dataset.studioRegionFloating).toBe("false");
    view.rerender(<StudioWorkspaceRegion surfaceId="test" label="테스트 도구" disabled><Child /></StudioWorkspaceRegion>);
    expect((screen.getByRole("textbox", { name: "이름" }) as HTMLInputElement).value).toBe("작업 중인 값");
    expect(mounted).toHaveBeenCalledTimes(1); expect(unmounted).not.toHaveBeenCalled();
  });
  it("offers click-only placement, position locks, and a restore action", () => {
    render(<Harness />); edit(); fireEvent.click(screen.getByRole("button", { name: "테스트 도구 배치 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "오른쪽" })); expect(regionNode().dataset.studioRegionFloating).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "테스트 도구 배치 설정" }));
    fireEvent.click(screen.getByRole("button", { name: "위치 잠금 끔" })); expect((screen.getByRole("button", { name: "테스트 도구 이동" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "위치·크기·잠금 초기화" })); expect(regionNode().dataset.studioRegionFloating).toBe("false");
  });
  it("does not float on a click or canceled drag and cleans its preview", () => {
    render(<Harness />); edit(); const handle = screen.getByRole("button", { name: "테스트 도구 이동" });
    fireEvent.pointerDown(handle, { pointerId: 7, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 100, clientY: 100 });
    expect(regionNode().dataset.studioRegionFloating).toBe("false");
    fireEvent.pointerDown(handle, { pointerId: 8, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 200, clientY: 200 });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(regionNode().dataset.studioRegionFloating).toBe("false"); expect(document.querySelector("[data-studio-arrangement-preview]")).toBeNull();
    expect(document.body.style.cursor).toBe("");
  });
  it("commits drag placement, preserves child identity, and ignores secondary pointers", () => {
    render(<Harness />); edit(); const child = screen.getByRole("button", { name: "도구 실행" }); const handle = screen.getByRole("button", { name: "테스트 도구 이동" });
    fireEvent.pointerDown(handle, { pointerId: 9, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 9, clientX: 220, clientY: 200 });
    fireEvent.pointerUp(window, { pointerId: 9, clientX: 220, clientY: 200 });
    expect(regionNode().dataset.studioRegionFloating).toBe("true"); expect(screen.getByRole("button", { name: "도구 실행" })).toBe(child);
    const left = regionNode().style.left;
    fireEvent.pointerDown(handle, { pointerId: 10, button: 0, isPrimary: false, clientX: 220, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 10, clientX: 400, clientY: 400 }); fireEvent.pointerUp(window, { pointerId: 10 });
    expect(regionNode().style.left).toBe(left);
  });
  it("suspends desktop placement on a phone without erasing its desktop preference", () => {
    render(<Harness />); act(() => arrangeStudioWorkspaceRegions("detach")); expect(regionNode().dataset.studioRegionFloating).toBe("true");
    Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 390 }); fireEvent.resize(window);
    expect(regionNode().dataset.studioRegionFloating).toBe("false"); expect(regionNode().style.display).toBe("contents");
    Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 1440 }); fireEvent.resize(window);
    expect(regionNode().dataset.studioRegionFloating).toBe("true");
  });
  it("collapses without unmounting content and restores its size", () => {
    render(<Harness />); edit(); fireEvent.click(screen.getByRole("button", { name: "영역 분리" }));
    const child = screen.getByRole("button", { name: "도구 실행" });
    const height = regionNode().style.height;
    fireEvent.click(screen.getByRole("button", { name: "테스트 도구 접기" }));
    expect(regionNode().dataset.studioRegionCollapsed).toBe("true");
    expect(child.isConnected).toBe(true);
    expect(screen.queryByRole("button", { name: "도구 실행" })).toBeNull();
    expect(screen.queryByRole("button", { name: "테스트 도구 오른쪽 아래 크기 조절" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "테스트 도구 펼치기" }));
    expect(regionNode().style.height).toBe(height);
    expect(screen.getByRole("button", { name: "도구 실행" })).toBe(child);
  });
  it("resizes by numeric entry and clamps oversized dimensions", () => {
    render(<Harness />); edit(); fireEvent.click(screen.getByRole("button", { name: "테스트 도구 배치 설정" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "테스트 도구 너비" }), { target: { value: "520" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "테스트 도구 높이" }), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: "크기 적용" }));
    expect(regionNode().style.width).toBe("520px");
    expect(parseFloat(regionNode().style.height)).toBeLessThanOrEqual(912);
    expect(regionNode().dataset.studioRegionFloating).toBe("true");
  });
  it("cancels all arrangement edits without touching the child", () => {
    render(<Harness />); const child = screen.getByRole("button", { name: "도구 실행" });
    edit(); fireEvent.click(screen.getByRole("button", { name: "영역 분리" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 도구 접기" }));
    fireEvent.click(screen.getByRole("button", { name: "배치 취소" }));
    expect(regionNode().dataset.studioRegionFloating).toBe("false");
    expect(screen.getByRole("button", { name: "도구 실행" })).toBe(child);
    expect(screen.getByRole("button", { name: "배치 편집" })).toBeTruthy();
  });
  it("restores a saved region arrangement using the toolbar", () => {
    render(<Harness />); edit(); fireEvent.click(screen.getByRole("button", { name: "영역 분리" }));
    fireEvent.click(screen.getByRole("button", { name: "탭에 저장" })); fireEvent.click(screen.getByRole("button", { name: "원래 자리" }));
    expect(regionNode().dataset.studioRegionFloating).toBe("false"); fireEvent.click(screen.getByRole("button", { name: "탭 배치 불러오기" }));
    expect(regionNode().dataset.studioRegionFloating).toBe("true");
  });
});
