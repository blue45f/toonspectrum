// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorSlidersPanel } from "./StudioColorSlidersPanel";

function Picker({ initial = "#ff0000" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <>
    <StudioColorSlidersPanel value={value} onChange={setValue} />
    <output aria-label="선택색">{value}</output>
    <button onClick={() => setValue("#00ff00")}>다른 색 선택</button>
  </>;
}

function input(label: string): HTMLInputElement {
  return screen.getByRole("spinbutton", { name: label });
}

function edit(label: string, value: string) {
  fireEvent.change(input(label), { target: { value } });
}

afterEach(cleanup);

describe("StudioColorSlidersPanel product color spaces", () => {
  it("selects HSL and edits the active brush color using exact numeric channels", () => {
    render(<Picker />);
    fireEvent.click(screen.getByRole("tab", { name: "HSL 슬라이더" }));
    expect(input("HSL 밝기 L 수치 입력").value).toBe("50");
    edit("HSL 색상 H 수치 입력", "120");
    expect(screen.getByLabelText("선택색").textContent).toBe("#00ff00");
    edit("HSL 밝기 L 수치 입력", "25");
    expect(screen.getByLabelText("선택색").textContent).toBe("#008000");
  });

  it("keeps the chosen hue across achromatic edits before restoring saturation", () => {
    render(<Picker />);
    fireEvent.click(screen.getByRole("tab", { name: "HSL 슬라이더" }));
    edit("HSL 채도 S 수치 입력", "0");
    edit("HSL 색상 H 수치 입력", "240");
    expect(input("HSL 색상 H 수치 입력").value).toBe("240");
    edit("HSL 채도 S 수치 입력", "100");
    expect(screen.getByLabelText("선택색").textContent).toBe("#0000ff");
  });

  it("keeps all four user CMYK channels instead of re-separating the RGB echo", () => {
    render(<Picker initial="#ffffff" />);
    fireEvent.click(screen.getByRole("tab", { name: "CMYK 슬라이더" }));
    expect(screen.getByText(/인쇄용 ICC 프로필은 적용되지 않습니다/)).toBeDefined();
    edit("CMYK 시안 C 수치 입력", "40");
    edit("CMYK 마젠타 M 수치 입력", "30");
    edit("CMYK 노랑 Y 수치 입력", "20");
    edit("CMYK 검정 K 수치 입력", "50");
    expect(screen.getByLabelText("선택색").textContent).toBe("#4d5966");
    expect(input("CMYK 시안 C 수치 입력").value).toBe("40");
    expect(input("CMYK 마젠타 M 수치 입력").value).toBe("30");
    expect(input("CMYK 노랑 Y 수치 입력").value).toBe("20");
    expect(input("CMYK 검정 K 수치 입력").value).toBe("50");
  });

  it("accepts a later external color instead of reviving the previous CMYK draft", () => {
    render(<Picker initial="#ffffff" />);
    fireEvent.click(screen.getByRole("tab", { name: "CMYK 슬라이더" }));
    edit("CMYK 검정 K 수치 입력", "50");
    fireEvent.click(screen.getByRole("button", { name: "다른 색 선택" }));
    expect(input("CMYK 시안 C 수치 입력").value).toBe("100");
    expect(input("CMYK 마젠타 M 수치 입력").value).toBe("0");
    expect(input("CMYK 노랑 Y 수치 입력").value).toBe("100");
    expect(input("CMYK 검정 K 수치 입력").value).toBe("0");
  });

  it("ignores empty numeric edits and clamps the entered ink coverage", () => {
    const onChange = vi.fn();
    render(<StudioColorSlidersPanel value="#ffffff" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "CMYK 슬라이더" }));
    edit("CMYK 시안 C 수치 입력", "");
    expect(onChange).not.toHaveBeenCalled();
    edit("CMYK 검정 K 수치 입력", "120");
    expect(onChange).toHaveBeenLastCalledWith("#000000");
  });

  it("uses arrow, Home and End keys without changing the selected color", () => {
    const onChange = vi.fn();
    render(<StudioColorSlidersPanel value="#123456" onChange={onChange} />);
    const rgb = screen.getByRole("tab", { name: "RGB 슬라이더" });
    rgb.focus();
    fireEvent.keyDown(rgb, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "CIELAB 슬라이더" }));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(rgb);
    fireEvent.keyDown(rgb, { key: "End" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "CMYK 슬라이더" }));
    expect(screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(document.activeElement!.id);
    expect(onChange).not.toHaveBeenCalled();
  });
});
