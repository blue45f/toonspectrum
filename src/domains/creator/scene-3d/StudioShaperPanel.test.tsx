// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioShaperPanel } from "./StudioShaperPanel";

describe("StudioShaperPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with header, SHAPER badge, and 4 primary tabs", () => {
    render(<StudioShaperPanel />);

    expect(screen.getByText("3D 셰이퍼 (Webtoon Shaper)")).toBeDefined();
    expect(screen.getByText("SHAPER")).toBeDefined();
    expect(screen.getByText("프리셋")).toBeDefined();
    expect(screen.getByText("모델에 직접 그리기")).toBeDefined();
    expect(screen.getByText("AI 편의 기능")).toBeDefined();
    expect(screen.getByText("창작자 편의 기능")).toBeDefined();
  });

  it("switches tabs and selects preset items", () => {
    const onSelectionChange = vi.fn();
    render(<StudioShaperPanel onSelectionChange={onSelectionChange} />);

    // Click on a preset category chip
    const hairChip = screen.getByRole("button", { name: "헤어" });
    fireEvent.click(hairChip);

    // Click on hair preset item
    const bobPreset = screen.getByRole("button", { name: /시스루 뱅 단발/i });
    fireEvent.click(bobPreset);

    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        hair: "hair-bob",
      }),
    );
  });

  it("switches to drawing tab and toggles surface drawing", () => {
    render(<StudioShaperPanel />);

    const drawTab = screen.getByRole("button", { name: "모델에 직접 그리기" });
    fireEvent.click(drawTab);

    const toggleBtn = screen.getByRole("button", { name: "꺼짐" });
    fireEvent.click(toggleBtn);

    expect(screen.getByRole("button", { name: "켜짐 (Active)" })).toBeDefined();
  });

  it("switches to AI tab and applies archetype recommendation", () => {
    const onSelectionChange = vi.fn();
    render(<StudioShaperPanel onSelectionChange={onSelectionChange} />);

    const aiTab = screen.getByRole("button", { name: "AI 편의 기능" });
    fireEvent.click(aiTab);

    const romanceCard = screen.getByRole("button", { name: /학원 로맨스 주인공/i });
    fireEvent.click(romanceCard);

    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        face: "face-oval",
        eye: "eye-romance",
        hair: "hair-bob",
        top: "top-school",
      }),
    );
  });

  it("switches to creator tab and triggers layered PSD export", () => {
    const onExportPsd = vi.fn();
    render(<StudioShaperPanel onExportPsd={onExportPsd} />);

    const creatorTab = screen.getByRole("button", { name: "창작자 편의 기능" });
    fireEvent.click(creatorTab);

    const exportBtn = screen.getByRole("button", { name: "다중 레이어 PSD 파일 내려받기" });
    fireEvent.click(exportBtn);

    expect(onExportPsd).toHaveBeenCalledTimes(1);
  });
});
