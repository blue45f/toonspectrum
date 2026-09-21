// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioColorPopover } from "./StudioColorPopover";
import * as paletteRepository from "./studio-palette-sqlite-repository";

vi.mock("./StudioPaletteLibraryPanel", () => ({ StudioPaletteLibraryPanel: () => <div>내 팔레트 저장소</div> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function open(value = "#ff0000", recentColors: string[] = []) {
  const onChange = vi.fn();
  render(<StudioColorPopover value={value} onChange={onChange} recentColors={recentColors} label="채색" initialOpen />);
  return onChange;
}
const apply = () => fireEvent.click(screen.getByRole("button", { name: "색상 적용" }));
const harmony = (mode: "harmony" | "cel" = "harmony") => {
  fireEvent.click(screen.getByRole("tab", { name: "배색" }));
  fireEvent.change(screen.getByRole("combobox", { name: "배색 방식" }), { target: { value: mode } });
};

describe("shared advanced color workspace", () => {
  it("groups every old picker mode under three labelled, linked top-level tabs", () => {
    open();
    const tabs = within(screen.getByRole("tablist", { name: "색상 작업 방식" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["선택", "팔레트", "배색"]);
    for (const tab of tabs) expect(document.getElementById(tab.getAttribute("aria-controls")!)?.getAttribute("aria-labelledby")).toBe(tab.id);
    expect(screen.getByRole("combobox", { name: "색상 선택 방식" })).toBeTruthy();
    expect(screen.getByText("정밀 수치 · RGB / HSV / HSL")).toBeTruthy();
  });
  it("uses manual tab activation with roving focus", () => {
    open();
    const select = screen.getByRole("tab", { name: "선택" });
    const palettes = screen.getByRole("tab", { name: "팔레트" });
    select.focus(); fireEvent.keyDown(select, { key: "ArrowRight" });
    expect(document.activeElement).toBe(palettes);
    expect(select.getAttribute("aria-selected")).toBe("true");
    expect(palettes.tabIndex).toBe(0); expect(select.tabIndex).toBe(-1);
    fireEvent.click(palettes); expect(palettes.getAttribute("aria-selected")).toBe("true");
  });
  it.each(["#ffffff", "#000000"])("deduplicates shade and recent colors for %s", (color) => {
    open(color, [color.toUpperCase(), color, "#ff0000"]);
    const recent = screen.getByRole("group", { name: "최근 선택 색 목록" });
    expect(within(recent).getAllByRole("button")).toHaveLength(2);
    expect(within(recent).getAllByRole("button", { pressed: true })).toHaveLength(1);
    harmony();
    const shades = within(screen.getByRole("group", { name: "밝기와 음영 단계 목록" })).getAllByRole("button");
    expect(new Set(shades.map((button) => button.getAttribute("aria-label"))).size).toBe(shades.length);
  });
  it.each([["harmony", "이 조화 배색을 내 팔레트로 저장"], ["cel", "이 음영 세트를 내 팔레트로 저장"]] as const)("does not report premature success for %s save failures", async (mode, label) => {
    const save = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    vi.spyOn(paletteRepository, "getProductStudioPaletteSqliteRepository").mockReturnValue({ save } as unknown as paletteRepository.StudioPaletteSqliteRepository);
    open("#336699"); harmony(mode);
    const button = screen.getByRole("button", { name: label }); fireEvent.click(button);
    expect(button.textContent).toBe(label);
    const status = await screen.findByRole("status", { name: "색상 작업 결과" });
    expect(status.textContent).toContain("저장하지 못했습니다");
    expect(status.className).toContain("text-warn");
    expect(save).toHaveBeenCalledOnce();
  });
  it("edits wheel hue locally and applies through the same transaction", () => {
    const changed = open();
    fireEvent.change(screen.getByRole("combobox", { name: "색상 선택 방식" }), { target: { value: "wheel" } });
    fireEvent.keyDown(screen.getByRole("slider", { name: "색상환 색조 각도" }), { key: "ArrowRight" });
    expect(changed).not.toHaveBeenCalled(); apply();
    expect(changed).toHaveBeenCalledOnce(); expect(changed.mock.calls[0]?.[0]).not.toBe("#ff0000");
  });
  it("preserves harmony choices and confirms a complementary color", () => {
    const changed = open(); harmony();
    expect(screen.getByText(/180도 반대편 색으로/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("radio", { name: /조화 색상/ })[1]!);
    expect(changed).not.toHaveBeenCalled(); apply();
    expect(changed).toHaveBeenCalledExactlyOnceWith("#00ffff");
  });
  it("preserves webtoon cel shades and their anti-muddy controls", () => {
    const changed = open("#ffdcc5"); harmony("cel");
    expect(screen.getByText("Anti-Muddy")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /1차 음영/ }));
    expect(changed).not.toHaveBeenCalled(); apply(); expect(changed).toHaveBeenCalledOnce();
  });
  it("offers exact RGB input without sending intermediate values to the document", () => {
    const changed = open("#ff8800");
    const details = screen.getByText("정밀 수치 · RGB / HSV / HSL").closest("details")!; details.open = true;
    fireEvent.change(screen.getByRole("slider", { name: "빨강 채널 R" }), { target: { value: "100" } });
    expect(changed).not.toHaveBeenCalled(); apply(); expect(changed).toHaveBeenCalledExactlyOnceWith("#648800");
  });
  it("restores the session's previous color without mutating an unrelated external revision", () => {
    const changed = open("#112233");
    fireEvent.change(screen.getByRole("textbox", { name: "헥스 색상 코드" }), { target: { value: "#998877" } });
    fireEvent.click(screen.getByRole("button", { name: "이전 색상 #112233로 되돌리기" }));
    expect(screen.getByLabelText("선택 중인 색상").textContent).toBe("#112233");
    apply(); expect(changed).not.toHaveBeenCalled();
  });
  it.each([{ width: 390, height: 320 }, { width: 360, height: 640 }])("keeps core controls inside visual viewport $width x $height", ({ width, height }) => {
    const viewport = { width, height, offsetLeft: 0, offsetTop: 100, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("visualViewport", viewport);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(600);
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-layout")).toBe("sheet");
    expect(parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(108);
    expect(parseFloat(dialog.style.top) + parseFloat(dialog.style.maxHeight)).toBeLessThanOrEqual(100 + height - 8);
    expect(parseFloat(dialog.style.width)).toBe(width - 16);
    expect(viewport.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    cleanup(); expect(viewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
