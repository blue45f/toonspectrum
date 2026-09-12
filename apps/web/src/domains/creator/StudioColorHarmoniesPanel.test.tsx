// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorHarmoniesPanel } from "./StudioColorHarmoniesPanel";

function ControlledHarmony({
  initial = "#ff0000",
  onSave = vi.fn(),
}: {
  initial?: string;
  onSave?: (name: string, colors: string[]) => void;
}) {
  const [color, setColor] = useState(initial);
  return (
    <>
      <output aria-label="현재 그리기 색">{color}</output>
      <StudioColorHarmoniesPanel value={color} onSelectColor={setColor} onSaveAsPalette={onSave} />
    </>
  );
}

function swatches() {
  return within(screen.getByRole("radiogroup", { name: "조화 배색 목록" })).getAllByRole("radio");
}

function baseColor() {
  return document.querySelector("[data-studio-harmony-base]")?.textContent;
}

describe("StudioColorHarmoniesPanel", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("follows the current color by default without replacing the focused swatch", () => {
    render(<ControlledHarmony />);
    const complementary = swatches()[1]!;
    act(() => complementary.focus());
    fireEvent.click(complementary);

    expect(screen.getByLabelText("현재 그리기 색").textContent).toBe("#00ffff");
    expect(baseColor()).toBe("#00ffff");
    expect(screen.getByRole("button", { name: "배색 기준색 고정" }).getAttribute("aria-pressed")).toBe("false");
    expect(swatches()[1]).toBe(complementary);
    expect(document.activeElement).toBe(complementary);
  });

  it("keeps a pinned triadic palette stable while picking two derived colors and saving", () => {
    const onSave = vi.fn();
    render(<ControlledHarmony onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "배색 기준색 고정" }));
    fireEvent.click(screen.getByRole("tab", { name: "3색 조화 (Triadic)" }));

    const green = swatches()[1]!;
    const blue = swatches()[2]!;
    act(() => green.focus());
    fireEvent.click(green);
    expect(screen.getByLabelText("현재 그리기 색").textContent).toBe("#00ff00");
    expect(baseColor()).toBe("#ff0000");
    expect(document.activeElement).toBe(green);
    fireEvent.keyDown(green, { key: "ArrowRight" });

    expect(screen.getByLabelText("현재 그리기 색").textContent).toBe("#0000ff");
    expect(baseColor()).toBe("#ff0000");
    expect(swatches()[2]).toBe(blue);
    expect(document.activeElement).toBe(blue);
    expect(blue.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "이 조화 배색을 내 팔레트로 저장" }));
    expect(onSave).toHaveBeenCalledWith("배색: 3색 조화 (#ff0000)", ["#ff0000", "#00ff00", "#0000ff"]);
  });

  it("lets the artist explicitly rebase a locked harmony and return to follow mode", () => {
    render(<ControlledHarmony />);
    const lock = screen.getByRole("button", { name: "배색 기준색 고정" });
    fireEvent.click(lock);
    const rebase = screen.getByRole("button", { name: "현재 색을 기준으로" });
    expect(rebase.hasAttribute("disabled")).toBe(true);
    fireEvent.click(swatches()[1]!);
    expect(baseColor()).toBe("#ff0000");
    expect(rebase.hasAttribute("disabled")).toBe(false);
    fireEvent.click(rebase);
    expect(baseColor()).toBe("#00ffff");
    expect(lock.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(lock);
    fireEvent.click(swatches()[1]!);
    expect(baseColor()).toBe("#ff0000");
    expect(lock.getAttribute("aria-pressed")).toBe("false");
  });

  it("connects the tab panel and supports one tab stop with arrows, Home, and End", () => {
    render(<ControlledHarmony />);
    const tabs = within(screen.getByRole("tablist", { name: "색상 조화 규칙" })).getAllByRole("tab");
    const panel = screen.getByRole("tabpanel");
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[0]]);
    expect(tabs.every((tab) => tab.getAttribute("aria-controls") === panel.id)).toBe(true);

    act(() => tabs[0]!.focus());
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    expect(document.activeElement).toBe(tabs[5]);
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[5]!.id);
    fireEvent.keyDown(tabs[5]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(tabs[5]);
    fireEvent.keyDown(tabs[5]!, { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[0]]);
  });

  it("navigates every pinned swatch with a single tab stop and labels the actual analogous base", () => {
    render(<ControlledHarmony />);
    fireEvent.click(screen.getByRole("button", { name: "배색 기준색 고정" }));
    fireEvent.click(screen.getByRole("tab", { name: "유사색 (Analogous)" }));
    const radios = swatches();
    expect(screen.getByText("기준색").previousElementSibling?.textContent).toBe("#ff0000");
    expect(radios[1]!.getAttribute("aria-checked")).toBe("true");
    expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([radios[1]]);
    act(() => radios[1]!.focus());
    fireEvent.keyDown(radios[1]!, { key: "End" });
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2]!.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(radios[2]!, { key: "Home" });
    expect(document.activeElement).toBe(radios[0]);
    fireEvent.keyDown(radios[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(radios[2]);
    expect(swatches().filter((radio) => radio.tabIndex === 0)).toEqual([radios[2]]);
  });

  it("never checks duplicate grayscale or monochromatic swatches more than once", () => {
    render(<ControlledHarmony initial="#000000" />);
    expect(swatches().filter((radio) => radio.getAttribute("aria-checked") === "true")).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "단색 명도변형 (Mono)" }));
    expect(swatches().filter((radio) => radio.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(swatches().filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
  });

  it("clears palette feedback on mode/base changes and releases the save timer on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ControlledHarmony />);
    const save = screen.getByRole("button", { name: "이 조화 배색을 내 팔레트로 저장" });
    fireEvent.click(save);
    expect(screen.getByRole("status", { name: "팔레트 저장 상태" }).textContent).toBe("내 팔레트에 저장했습니다.");
    fireEvent.click(screen.getByRole("tab", { name: "3색 조화 (Triadic)" }));
    expect(screen.getByRole("status", { name: "팔레트 저장 상태" }).textContent).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.click(save);
    fireEvent.click(swatches()[1]!);
    expect(screen.getByRole("status", { name: "팔레트 저장 상태" }).textContent).toBe("");
    fireEvent.click(save);
    act(() => vi.advanceTimersByTime(1800));
    expect(screen.getByRole("status", { name: "팔레트 저장 상태" }).textContent).toBe("");
    fireEvent.click(save);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
