// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorPopover } from "./StudioColorPopover";
import * as paletteRepository from "./studio-palette-sqlite-repository";

describe("StudioColorPopover Advanced Benchmarked Features", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders all 5 competitor-benchmarked mode tabs (팔레트, 휠, 조화, 웹툰, 슬라이더)", async () => {
    render(
      <StudioColorPopover
        value="#ff5500"
        onChange={vi.fn()}
        recentColors={["#ff5500", "#0088ff"]}
        label="채색 팔레트"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "채색 팔레트" }));
    await screen.findByRole("dialog", { name: "채색 팔레트 선택" });

    // Mode tabs
    expect(screen.getByRole("tab", { name: "팔레트 모드" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "휠 모드" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "조화 모드" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "웹툰 모드" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "슬라이더 모드" })).toBeDefined();

    // Tints & Shades strip is present
    expect(screen.getByRole("radiogroup", { name: "명도 및 음영 단계" })).toBeDefined();
  });

  it.each(["#ffffff", "#000000"])("checks only one duplicate shade/recent swatch and preserves a rebased slot's focus: %s", async (initial) => {
    const onChange = vi.fn();
    function ControlledPopover() {
      const [value, setValue] = useState(initial);
      return (
        <StudioColorPopover
          value={value}
          onChange={(color) => { onChange(color); setValue(color); }}
          recentColors={[initial.toUpperCase(), initial, "#ff0000"]}
          label="중복 색상"
        />
      );
    }
    render(<ControlledPopover />);
    fireEvent.click(screen.getByRole("button", { name: "중복 색상" }));
    const shades = await screen.findByRole("radiogroup", { name: "명도 및 음영 단계" });
    expect(within(shades).getAllByRole("radio", { checked: true })).toHaveLength(1);
    const recent = screen.getByRole("radiogroup", { name: "최근 색상" });
    expect(within(recent).getAllByRole("radio", { checked: true })).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "헥스 색상 코드" })));
    const swatches = within(shades).getAllByRole("radio");
    const choice = swatches[initial === "#ffffff" ? 8 : 0]!;
    const requestedColor = choice.getAttribute("aria-label")!.match(/#[\da-f]{6}/iu)![0];
    choice.focus();
    fireEvent.click(choice);
    expect(onChange).toHaveBeenLastCalledWith(requestedColor);
    expect(document.activeElement).toBe(choice);
    expect(within(shades).getAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it.each([
    ["조화 모드", "이 조화 배색을 내 팔레트로 저장"],
    ["웹툰 모드", "이 음영 세트를 내 팔레트로 저장"],
  ])("reports asynchronous persistence failure without a premature success badge in %s", async (tabName, saveLabel) => {
    const save = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    vi.spyOn(paletteRepository, "getProductStudioPaletteSqliteRepository").mockReturnValue({ save } as unknown as paletteRepository.StudioPaletteSqliteRepository);
    render(<StudioColorPopover value="#336699" onChange={vi.fn()} recentColors={[]} label="저장 실패" />);
    fireEvent.click(screen.getByRole("button", { name: "저장 실패" }));
    fireEvent.click(await screen.findByRole("tab", { name: tabName }));
    const saveButton = screen.getByRole("button", { name: saveLabel });
    fireEvent.click(saveButton);
    expect(saveButton.textContent).toBe(saveLabel);
    const result = await screen.findByRole("status", { name: "팔레트 저장 결과" });
    expect(result.textContent).toContain("팔레트를 저장하지 못했어요");
    expect(result.className).toContain("text-warn");
    expect(save).toHaveBeenCalledOnce();
    expect(screen.queryByText(/저장했어요|저장되었습니다|저장 완료|라이브러리에 저장됨/u)).toBeNull();
  });

  it("switches to Wheel mode and adjusts hue via arrow keys", async () => {
    const onChange = vi.fn();
    render(
      <StudioColorPopover
        value="#ff0000"
        onChange={onChange}
        recentColors={[]}
        label="색상환 테스트"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "색상환 테스트" }));
    await screen.findByRole("dialog", { name: "색상환 테스트 선택" });

    // Switch to Wheel mode
    fireEvent.click(screen.getByRole("tab", { name: "휠 모드" }));

    const hueSlider = screen.getByRole("slider", { name: "색상환 색조 각도" });
    expect(hueSlider).toBeDefined();

    fireEvent.keyDown(hueSlider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalled();
  });

  it("switches to Harmonies mode and applies complementary color", async () => {
    const onChange = vi.fn();
    render(
      <StudioColorPopover
        value="#ff0000"
        onChange={onChange}
        recentColors={[]}
        label="조화 배색 테스트"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "조화 배색 테스트" }));
    await screen.findByRole("dialog", { name: "조화 배색 테스트 선택" });

    fireEvent.click(screen.getByRole("tab", { name: "조화 모드" }));
    expect(screen.getByText(/180도 반대편 색으로/)).toBeDefined();

    const compSwatches = screen.getAllByRole("radio", { name: /조화 색상/ });
    expect(compSwatches.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(compSwatches[1]!);
    expect(onChange).toHaveBeenCalled();
  });

  it("switches to Webtoon mode and shows anti-muddy cel shadow stages", async () => {
    const onChange = vi.fn();
    render(
      <StudioColorPopover
        value="#ffdcc5"
        onChange={onChange}
        recentColors={[]}
        label="웹툰 음영 테스트"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "웹툰 음영 테스트" }));
    await screen.findByRole("dialog", { name: "웹툰 음영 테스트 선택" });

    fireEvent.click(screen.getByRole("tab", { name: "웹툰 모드" }));

    expect(screen.getByText("Anti-Muddy")).toBeDefined();
    const cel1Button = screen.getByRole("radio", { name: /1차 음영/ });
    expect(cel1Button).toBeDefined();

    fireEvent.click(cel1Button);
    expect(onChange).toHaveBeenCalled();
  });

  it("switches to Sliders mode and changes RGB channel", async () => {
    const onChange = vi.fn();
    render(
      <StudioColorPopover
        value="#ff8800"
        onChange={onChange}
        recentColors={[]}
        label="슬라이더 테스트"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "슬라이더 테스트" }));
    await screen.findByRole("dialog", { name: "슬라이더 테스트 선택" });

    fireEvent.click(screen.getByRole("tab", { name: "슬라이더 모드" }));

    const redSlider = screen.getByRole("slider", { name: "빨강 채널 R" });
    fireEvent.change(redSlider, { target: { value: "100" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("reverts to original color when clicking comparison chip", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StudioColorPopover
        value="#112233"
        onChange={onChange}
        recentColors={[]}
        label="비교 테스트"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "비교 테스트" }));
    await screen.findByRole("dialog", { name: "비교 테스트 선택" });

    rerender(
      <StudioColorPopover
        value="#998877"
        onChange={onChange}
        recentColors={[]}
        label="비교 테스트"
      />
    );

    const revertButton = screen.getByRole("button", { name: "이전 색상 #112233로 되돌리기" });
    fireEvent.click(revertButton);
    expect(onChange).toHaveBeenCalledWith("#112233");
  });
});
