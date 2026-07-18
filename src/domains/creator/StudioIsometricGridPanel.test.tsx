// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioIsometricGridPanel,
  type StudioIsometricGridPanelProps,
} from "./StudioIsometricGridPanel";

function baseProps(
  overrides: Partial<StudioIsometricGridPanelProps> = {}
): StudioIsometricGridPanelProps {
  return {
    active: true,
    config: { angleDeg: 30, cellSize: 40, originX: 400, originY: 600 },
    onToggleActive: vi.fn(),
    onChangeAngle: vi.fn(),
    onChangeCellSize: vi.fn(),
    onResetOrigin: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("StudioIsometricGridPanel", () => {
  it("previews a pointer drag locally and commits its final angle once", () => {
    const onPreviewAngle = vi.fn();
    const onCommitAngle = vi.fn();
    render(
      <StudioIsometricGridPanel
        {...baseProps({ onPreviewAngle, onCommitAngle, onChangeAngle: undefined })}
      />
    );
    const angleSlider = screen.getAllByRole("slider")[0]!;

    fireEvent.pointerDown(angleSlider);
    fireEvent.change(angleSlider, { target: { value: "44" } });

    expect(onPreviewAngle).toHaveBeenLastCalledWith(44);
    expect(onCommitAngle).not.toHaveBeenCalled();
    expect(screen.getByText("44°")).toBeTruthy();

    fireEvent.pointerUp(angleSlider);
    expect(onCommitAngle).toHaveBeenCalledOnce();
    expect(onCommitAngle).toHaveBeenLastCalledWith(44);

    fireEvent.blur(angleSlider);
    expect(onCommitAngle).toHaveBeenCalledOnce();
  });

  it("coalesces keyboard changes into one legacy commit on key release", () => {
    const onChangeAngle = vi.fn();
    render(<StudioIsometricGridPanel {...baseProps({ onChangeAngle })} />);
    const angleSlider = screen.getAllByRole("slider")[0]!;

    fireEvent.change(angleSlider, { target: { value: "31" } });
    fireEvent.change(angleSlider, { target: { value: "32" } });

    expect(onChangeAngle).not.toHaveBeenCalled();
    expect(screen.getByText("32°")).toBeTruthy();

    fireEvent.keyUp(angleSlider, { key: "ArrowRight" });
    expect(onChangeAngle).toHaveBeenCalledOnce();
    expect(onChangeAngle).toHaveBeenLastCalledWith(32);
  });

  it("commits cell size on blur when no pointer/key end event was delivered", () => {
    const onCommitCellSize = vi.fn();
    render(
      <StudioIsometricGridPanel
        {...baseProps({ onCommitCellSize, onChangeCellSize: undefined })}
      />
    );
    const cellSizeSlider = screen.getAllByRole("slider")[1]!;

    fireEvent.change(cellSizeSlider, { target: { value: "72" } });
    expect(onCommitCellSize).not.toHaveBeenCalled();

    fireEvent.blur(cellSizeSlider);
    expect(onCommitCellSize).toHaveBeenCalledOnce();
    expect(onCommitCellSize).toHaveBeenLastCalledWith(72);
  });

  it("commits angle presets directly without emitting a slider preview", () => {
    const onPreviewAngle = vi.fn();
    const onCommitAngle = vi.fn();
    render(
      <StudioIsometricGridPanel
        {...baseProps({ onPreviewAngle, onCommitAngle, onChangeAngle: undefined })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "45°" }));

    expect(onCommitAngle).toHaveBeenCalledOnce();
    expect(onCommitAngle).toHaveBeenLastCalledWith(45);
    expect(onPreviewAngle).not.toHaveBeenCalled();
  });

  it("rolls a pointer-cancelled angle preview back without committing", () => {
    const onPreviewAngle = vi.fn();
    const onCommitAngle = vi.fn();
    render(
      <StudioIsometricGridPanel
        {...baseProps({ onPreviewAngle, onCommitAngle, onChangeAngle: undefined })}
      />
    );
    const angleSlider = screen.getAllByRole("slider")[0]!;

    fireEvent.change(angleSlider, { target: { value: "44" } });
    fireEvent.pointerCancel(angleSlider);
    fireEvent.blur(angleSlider);

    expect(onPreviewAngle).toHaveBeenNthCalledWith(1, 44);
    expect(onPreviewAngle).toHaveBeenLastCalledWith(30);
    expect(onCommitAngle).not.toHaveBeenCalled();
    expect((angleSlider as HTMLInputElement).value).toBe("30");
  });

  it("provides decimal-preserving keyboard inputs for the isometric origin", () => {
    const onPreviewOrigin = vi.fn();
    const onCommitOrigin = vi.fn();
    render(
      <StudioIsometricGridPanel
        {...baseProps({
          config: { angleDeg: 30, cellSize: 40, originX: 400.5, originY: -25.25 },
          onPreviewOrigin,
          onCommitOrigin,
        })}
      />
    );
    const xInput = screen.getByRole("textbox", { name: "아이소메트릭 기준점 X" }) as HTMLInputElement;

    expect(xInput.value).toBe("400.5");
    expect(xInput.inputMode).toBe("decimal");
    fireEvent.focus(xInput);
    fireEvent.change(xInput, { target: { value: "412.75" } });
    fireEvent.keyDown(xInput, { key: "Enter" });
    fireEvent.blur(xInput);

    expect(onPreviewOrigin).toHaveBeenLastCalledWith(412.75, -25.25);
    expect(onCommitOrigin).toHaveBeenCalledOnce();
    expect(onCommitOrigin).toHaveBeenLastCalledWith(412.75, -25.25);
    expect(xInput.value).toBe("412.75");
  });

  it("uses an unambiguous toggle name, 44px coarse targets, and a full disabled boundary", () => {
    const onToggleActive = vi.fn();
    const onCommitAngle = vi.fn();
    const onCommitCellSize = vi.fn();
    const onCommitOrigin = vi.fn();
    const onResetOrigin = vi.fn();
    render(
      <StudioIsometricGridPanel
        {...baseProps({
          disabled: true,
          disabledReason: "검토 잠금",
          onToggleActive,
          onCommitAngle,
          onChangeAngle: undefined,
          onCommitCellSize,
          onChangeCellSize: undefined,
          onCommitOrigin,
          onResetOrigin,
        })}
      />
    );

    const toggle = screen.getByRole("button", { name: "아이소메트릭 그리드 끄기" }) as HTMLButtonElement;
    const sliders = screen.getAllByRole("slider") as HTMLInputElement[];
    const preset = screen.getByRole("button", { name: "45°" }) as HTMLButtonElement;
    const originX = screen.getByRole("textbox", { name: "아이소메트릭 기준점 X" }) as HTMLInputElement;
    const reset = screen.getByRole("button", { name: "기준점 초기화" }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(sliders.every((slider) => slider.disabled)).toBe(true);
    expect(preset.disabled).toBe(true);
    expect(originX.disabled).toBe(true);
    expect(reset.disabled).toBe(true);
    expect(toggle.className).toContain("pointer-coarse:min-h-11");
    expect(sliders[0]?.className).toContain("pointer-coarse:h-11");
    expect(reset.className).toContain("pointer-coarse:min-h-11");

    fireEvent.click(toggle);
    fireEvent.click(preset);
    fireEvent.change(sliders[0]!, { target: { value: "44" } });
    fireEvent.change(originX, { target: { value: "410" } });
    fireEvent.click(reset);
    expect(onToggleActive).not.toHaveBeenCalled();
    expect(onCommitAngle).not.toHaveBeenCalled();
    expect(onCommitCellSize).not.toHaveBeenCalled();
    expect(onCommitOrigin).not.toHaveBeenCalled();
    expect(onResetOrigin).not.toHaveBeenCalled();
  });
});
