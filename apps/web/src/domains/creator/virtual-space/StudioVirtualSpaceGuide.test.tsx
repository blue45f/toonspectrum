// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceGuide } from "./StudioVirtualSpaceGuide";
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
});
