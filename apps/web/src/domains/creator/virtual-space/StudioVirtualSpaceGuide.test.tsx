// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioVirtualSpaceGuide } from "./StudioVirtualSpaceGuide";
import { DEFAULT_STUDIO_WORLD_MANIFEST as manifest } from "./studio-virtual-space-world-manifest";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
function setup() {
  const actions = { onMove: vi.fn(), onOpen: vi.fn(), onStop: vi.fn(), onFocus: vi.fn() };
  render(<StudioVirtualSpaceGuide manifest={manifest} {...actions} />);
  return actions;
}
describe("User-operated studio guide", () => {
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
