// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDrawingInputDeckPanel } from "./StudioDrawingInputDeckPanel";

afterEach(cleanup);

function renderPanel() {
  const handlers = {
    onStabilizerChange: vi.fn(),
    onStabilizerModeChange: vi.fn(),
    onPostCorrectionChange: vi.fn(),
    onPressureCurveChange: vi.fn(),
    onStampTuningChange: vi.fn(),
    onOpenBrushStudio: vi.fn(),
    onClose: vi.fn(),
  };

  render(
    <StudioDrawingInputDeckPanel
      brushLabel="G펜"
      mobile={false}
      dockInsets={{ left: 244, right: 308 }}
      stabilizer={1}
      stabilizerMode="standard"
      postCorrection={0}
      pressureCurveId="soft"
      stampTuning={{ flow: 0.65, hardness: 0.8, minSize: 0.2 }}
      {...handlers}
    />
  );

  return handlers;
}

describe("StudioDrawingInputDeckPanel", () => {
  it("applies a task profile through the canonical drawing setting callbacks", () => {
    const handlers = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /정밀 곡선/ }));

    expect(handlers.onStabilizerChange).toHaveBeenCalledWith(8);
    expect(handlers.onStabilizerModeChange).toHaveBeenCalledWith("precision");
    expect(handlers.onPostCorrectionChange).toHaveBeenCalledWith(4);
    expect(handlers.onPressureCurveChange).toHaveBeenCalledWith("firm");
    expect(handlers.onStampTuningChange).toHaveBeenCalledWith({
      flow: 0.65,
      hardness: 0.8,
      minSize: 0.12,
    });
    expect(screen.getByText(/입력감 설정 5개/)).toBeTruthy();
  });

  it("routes detailed pressure calibration to Brush Studio after closing", async () => {
    const handlers = renderPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "정밀 필압 보정" })
    );
    await Promise.resolve();

    expect(handlers.onClose).toHaveBeenCalledOnce();
    expect(handlers.onOpenBrushStudio).toHaveBeenCalledOnce();
  });

  it("keeps the live diagnostic non-modal so artists can continue drawing", () => {
    renderPanel();

    const panel = screen.getByRole("complementary", { name: "펜 입력 센터" });
    expect(panel.getAttribute("role")).toBeNull();
    expect(screen.getByText("좌표·획 내용은 저장하지 않습니다")).toBeTruthy();
  });
});
