// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceGuide, StudioVirtualSpaceMiniTour } from "./StudioVirtualSpaceGuide";
import { DEFAULT_STUDIO_WORLD_MANIFEST as manifest } from "./studio-virtual-space-world-manifest";
import { studioNpcRole } from "./studio-virtual-space-npc-director";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
function setup() {
  const actions = { onMove: vi.fn(), onOpen: vi.fn(), onStop: vi.fn(), onFocus: vi.fn() };
  render(<StudioVirtualSpaceGuide manifest={manifest} {...actions} />);
  return actions;
}
describe("User-operated studio guide", () => {
  it("starts a guided tour only on request, reports waiting, and cancels from the guide without opening a tool", () => {
    const guide = manifest.npcs.find((npc) => studioNpcRole(npc) === "guide")!;
    const actions = { onMove: vi.fn(), onOpen: vi.fn(), onStop: vi.fn(), onFocus: vi.fn(), onStartTour: vi.fn(), onCancelTour: vi.fn() };
    const mounted = render(<StudioVirtualSpaceGuide manifest={manifest} {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    expect(actions.onStartTour).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "가이드와 함께 둘러보기" }));
    expect(actions.onStartTour).toHaveBeenCalledExactlyOnceWith(guide.id);
    mounted.rerender(<StudioVirtualSpaceGuide manifest={manifest} {...actions} tourRequested guideTour={{
      requestId: "tour-1", guideId: guide.id, status: "waiting-for-user", stopIndex: 0, stopCount: 4,
    }} />);
    expect(screen.getByText("가이드가 가까이 오기를 기다리고 있어요.")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("region", { name: "스튜디오 시작 안내" }), { key: "Escape" });
    expect(actions.onCancelTour).toHaveBeenCalledOnce();
    expect(actions.onMove).not.toHaveBeenCalled(); expect(actions.onOpen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "시작 안내 다시 보기" }));
  });

  it("does not advertise a guided tour without a guide or an enabled start action", () => {
    const actions = { onMove: vi.fn(), onOpen: vi.fn(), onStop: vi.fn(), onFocus: vi.fn(), onStartTour: vi.fn() };
    render(<StudioVirtualSpaceGuide manifest={{ ...manifest, npcs: [] }} {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    expect(screen.queryByRole("button", { name: "가이드와 함께 둘러보기" })).toBeNull();
    expect(actions.onStartTour).not.toHaveBeenCalled();
  });

  it("never moves or opens tools on entry, step changes or reopening, and cancels a requested walk on Escape", () => {
    const f = setup();
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(f.onMove).not.toHaveBeenCalled(); expect(f.onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이곳으로 걸어가기" }));
    expect(f.onMove).toHaveBeenCalledExactlyOnceWith(manifest.interactions.find((place) => place.action === "story")?.point);
    fireEvent.keyDown(screen.getByRole("region", { name: "스튜디오 시작 안내" }), { key: "Escape" });
    expect(f.onStop).toHaveBeenCalledOnce();
    const trigger = screen.getByRole("button", { name: "시작 안내 다시 보기" });
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("status").textContent).toBe("1 / 6 단계");
    expect(f.onMove).toHaveBeenCalledOnce();
  });
  it("works when storage is unavailable and opens the canonical tool only when asked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
    const f = setup();
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "도구 바로 열기" }));
    expect(f.onOpen).toHaveBeenCalledExactlyOnceWith("story");
    expect(f.onMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "나중에 보기" }));
    expect(screen.getByRole("button", { name: "시작 안내 다시 보기" })).toBeTruthy();
  });

  it("안내 본문에서 접힌 키보드 단축키 목록을 제공한다", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    const shortcuts = screen.getByText("키보드 단축키").closest("details")!;
    expect(shortcuts.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByText("키보드 단축키"));
    expect(shortcuts.hasAttribute("open")).toBe(true);
    const list = shortcuts.querySelector("ul")!;
    expect(list.textContent).toContain("이동");
    expect(list.textContent).toContain("상호작용");
    expect(list.textContent).toContain("리액션 보내기");
    expect(list.textContent).toContain("방·팀원 찾기");
    expect(list.textContent).toContain("열린 패널 닫기");
  });

  it("미니 투어 다시 보기 버튼은 안내를 닫고 다시 보기 요청을 전달한다", () => {
    const onReplayMiniTour = vi.fn();
    const actions = { onMove: vi.fn(), onOpen: vi.fn(), onStop: vi.fn(), onFocus: vi.fn(), onReplayMiniTour };
    render(<StudioVirtualSpaceGuide manifest={manifest} {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    fireEvent.click(screen.getByRole("button", { name: "미니 투어 다시 보기" }));
    expect(onReplayMiniTour).toHaveBeenCalledOnce();
    expect(actions.onMove).not.toHaveBeenCalled();
    expect(actions.onOpen).not.toHaveBeenCalled();
    // prop이 없으면 버튼도 없다.
    cleanup();
    localStorage.clear();
    render(<StudioVirtualSpaceGuide manifest={manifest}
      onMove={vi.fn()} onOpen={vi.fn()} onStop={vi.fn()} onFocus={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    expect(screen.queryByRole("button", { name: "미니 투어 다시 보기" })).toBeNull();
  });
});

describe("첫 방문 미니 투어", () => {
  it("3단계를 순서대로 안내하고 마지막에 완료로 저장한다", () => {
    const onDone = vi.fn();
    render(<StudioVirtualSpaceMiniTour onDone={onDone} />);
    expect(screen.getByRole("dialog", { name: "3단계로 시작하기" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("1 / 3 단계");
    expect(screen.getByRole("heading", { name: "이동하기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("heading", { name: "상호작용하기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("heading", { name: "리액션 보내기" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("3 / 3 단계");
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(onDone).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("이전 단계로 돌아갈 수 있고 아무 것도 움직이거나 열지 않는다", () => {
    const onDone = vi.fn();
    render(<StudioVirtualSpaceMiniTour onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getByRole("heading", { name: "이동하기" })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("건너뛰면 '다음부터 보지 않기' 체크 상태대로 저장한다", () => {
    const onDone = vi.fn();
    const view = render(<StudioVirtualSpaceMiniTour onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(onDone).toHaveBeenCalledExactlyOnceWith(true);
    view.rerender(<StudioVirtualSpaceMiniTour onDone={onDone} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "다음부터 보지 않기" }));
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
    expect(onDone).toHaveBeenLastCalledWith(false);
  });

  it("Escape으로 닫으면 체크 상태대로 저장한다", () => {
    const onDone = vi.fn();
    render(<StudioVirtualSpaceMiniTour onDone={onDone} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDone).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("단계가 바뀌면 다음 버튼에 포커스가 이동한다", () => {
    const onDone = vi.fn();
    render(<StudioVirtualSpaceMiniTour onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "다음" }));
  });

  it("Tab 포커스가 투어 안에서 순환하고 배경으로 새지 않는다", () => {
    const onDone = vi.fn();
    render(<StudioVirtualSpaceMiniTour onDone={onDone} />);
    // DOM 순서상 마지막 포커스 대상은 '다음부터 보지 않기' 체크박스다.
    const first = screen.getByRole("button", { name: "미니 투어 닫기" });
    const last = screen.getByRole("checkbox", { name: "다음부터 보지 않기" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("코치형 미니 투어(가상 스튜디오 HUD)", () => {
  const idle = { moved: false, interacted: false, emoted: false };
  it("화면을 막지 않고 실제로 걷고·상호작용하고·리액션하면 넘어가며 끝나면 한 번만 완료로 저장한다", () => {
    const onDone = vi.fn();
    const view = render(<StudioVirtualSpaceMiniTour progress={idle} onDone={onDone} />);
    const tour = screen.getByRole("region", { name: "3단계 미니 투어" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(tour.getAttribute("data-coach-step")).toBe("1");
    expect(within(tour).getByRole("status").textContent).toContain("WASD");
    view.rerender(<StudioVirtualSpaceMiniTour progress={{ ...idle, moved: true }} onDone={onDone} />);
    expect(screen.getByRole("status").textContent).toContain("X(또는 E)");
    view.rerender(<StudioVirtualSpaceMiniTour progress={{ moved: true, interacted: true, emoted: false }} touch onDone={onDone} />);
    expect(screen.getByRole("status").textContent).toContain("리액션 버튼");
    view.rerender(<StudioVirtualSpaceMiniTour progress={{ moved: true, interacted: true, emoted: true }} touch onDone={onDone} />);
    view.rerender(<StudioVirtualSpaceMiniTour progress={{ moved: true, interacted: true, emoted: true }} touch onDone={onDone} />);
    expect(screen.queryByRole("region", { name: "3단계 미니 투어" })).toBeNull();
    expect(onDone).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("다음으로 단계를 직접 넘길 수 있고 건너뛰기는 '다음부터 보지 않기' 상태대로 끝낸다", () => {
    const onDone = vi.fn();
    render(<StudioVirtualSpaceMiniTour progress={idle} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("region", { name: "3단계 미니 투어" }).getAttribute("data-coach-step")).toBe("2");
    fireEvent.click(screen.getByRole("checkbox", { name: "다음부터 보지 않기" }));
    fireEvent.click(screen.getByRole("button", { name: "미니 투어 건너뛰기" }));
    expect(onDone).toHaveBeenCalledExactlyOnceWith(false);
  });
});
