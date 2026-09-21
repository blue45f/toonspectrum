// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioDualColorWell, STUDIO_DUAL_COLOR_WELL_HINTS } from "./StudioDualColorWell";
import { createStudioRecentColorsOwnerToken, registerStudioRecentColorsOwner, resetStudioRecentColorsBridgeForTests } from "./studio-recent-colors-bridge";

afterEach(() => { cleanup(); resetStudioRecentColorsBridgeForTests(); vi.restoreAllMocks(); });

function setup() {
  const remember = vi.fn();
  registerStudioRecentColorsOwner(createStudioRecentColorsOwnerToken(), {
    ensureRecentColorsLoaded: vi.fn(), rememberColor: remember, clearRecentColors: vi.fn(),
  });
  const primary = vi.fn(); const secondary = vi.fn(); const swap = vi.fn();
  render(<StudioDualColorWell primary="#334455" secondary="#ffffff" recent={["#123456", "#654321"]}
    onPrimaryChange={primary} onSecondaryChange={secondary} onSwap={swap} />);
  return { primary, secondary, swap, remember };
}

describe("StudioDualColorWell unified editing", () => {
  it("opens the same editor for primary and secondary without applying intermediate values", async () => {
    const { primary, secondary, remember } = setup();
    fireEvent.click(screen.getByRole("button", { name: "주 색" }));
    const input = await screen.findByRole("textbox", { name: "헥스 색상 코드" });
    fireEvent.change(input, { target: { value: "#ABC" } });
    expect(primary).not.toHaveBeenCalled(); expect(remember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "색상 적용" }));
    expect(primary).toHaveBeenCalledExactlyOnceWith("#aabbcc");
    expect(secondary).not.toHaveBeenCalled(); expect(remember).toHaveBeenCalledExactlyOnceWith("#aabbcc");
    fireEvent.click(screen.getByRole("button", { name: "보조 색" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "헥스 색상 코드" }), { target: { value: "#112233" } });
    fireEvent.click(screen.getByRole("button", { name: "색상 적용" }));
    expect(secondary).toHaveBeenCalledExactlyOnceWith("#112233"); expect(primary).toHaveBeenCalledOnce();
  });
  it("retains the native system picker as a draft rather than duplicating native input/change commits", async () => {
    const { primary, remember } = setup();
    fireEvent.click(screen.getByRole("button", { name: "주 색" }));
    const native = await screen.findByLabelText("시스템 색상 선택");
    fireEvent.input(native, { target: { value: "#112233" } });
    fireEvent.change(native, { target: { value: "#112233" } });
    expect(primary).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "색상 적용" }));
    expect(primary).toHaveBeenCalledExactlyOnceWith("#112233"); expect(remember).toHaveBeenCalledOnce();
  });
  it("cancel records neither a color change nor recent history; swap remains one action", async () => {
    const { primary, secondary, remember, swap } = setup();
    fireEvent.click(screen.getByRole("button", { name: "보조 색" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "헥스 색상 코드" }), { target: { value: "#aabbcc" } });
    fireEvent.click(screen.getByRole("button", { name: "색상 선택 취소" }));
    expect(primary).not.toHaveBeenCalled(); expect(secondary).not.toHaveBeenCalled(); expect(remember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "주 색과 보조 색 교체" }));
    expect(swap).toHaveBeenCalledOnce();
  });
  it("labels the actual eraser transition without promising transparent-brush rendering", () => {
    const erase = vi.fn();
    render(<StudioDualColorWell primary="#334455" onPrimaryChange={vi.fn()} onTransparentToggle={erase} />);
    fireEvent.click(screen.getByRole("button", { name: "지우개로 전환" }));
    expect(erase).toHaveBeenCalledOnce();
    expect(STUDIO_DUAL_COLOR_WELL_HINTS.transparent).toMatchObject({ shortcut: "E" });
  });
});
