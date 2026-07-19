// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BG_PRESETS } from "./studio-assets";
import { GRADIENT_PRESETS, gradientToBgGrad } from "./studio-gradients";
import {
  StudioInspectorCanvasControls,
  type StudioInspectorCanvasControlsProps,
} from "./StudioInspectorCanvasControls";

import type { MagicResizePreset, MagicResizeStrategy } from "./studio-magic-resize";

const MAGIC_PRESET: MagicResizePreset = {
  id: "test-preset",
  label: "테스트 규격",
  hint: "테스트",
  aspectW: 1,
  aspectH: 1,
};

vi.mock("./StudioMagicResizePanel", () => ({
  StudioMagicResizePanel: ({
    currentSize,
    onApplyPreset,
    onStrategyChange,
  }: {
    currentSize: { width: number; height: number };
    onApplyPreset: (preset: MagicResizePreset) => void;
    onStrategyChange: (strategy: MagicResizeStrategy) => void;
  }) => (
    <section aria-label={`매직 리사이즈 ${currentSize.width}×${currentSize.height}`}>
      <button type="button" onClick={() => onApplyPreset(MAGIC_PRESET)}>
        테스트 규격 적용
      </button>
      <button type="button" onClick={() => onStrategyChange("scaleToFit")}>
        맞춤 축소 전략
      </button>
    </section>
  ),
}));

afterEach(cleanup);

function canvasProps(
  overrides: Partial<StudioInspectorCanvasControlsProps> = {}
): StudioInspectorCanvasControlsProps {
  return {
    background: "#ffffff",
    canvasHeight: 12_000,
    controlsDisabled: false,
    gridSize: 40,
    hidden: false,
    magicResizeStrategy: "reposition",
    masterEditMode: false,
    panelGutter: 24,
    showGrid: true,
    showWebtoonGuides: false,
    snapEnabled: true,
    templateGutterAvailable: true,
    userGuides: [
      { id: "guide-v", type: "v", pos: 320 },
      { id: "guide-h", type: "h", pos: 1_800 },
    ],
    webtoonGuides: null,
    webtoonTheme: "classic",
    onAddUserGuide: vi.fn(),
    onApplyBackgroundPreset: vi.fn(),
    onApplyMagicResizePreset: vi.fn(),
    onBackgroundChange: vi.fn(),
    onCanvasHeightDelta: vi.fn(),
    onClearUserGuides: vi.fn(),
    onDeleteUserGuide: vi.fn(),
    onGradientChange: vi.fn(),
    onGridSizeChange: vi.fn(),
    onMagicResizeStrategyChange: vi.fn(),
    onMoveUserGuide: vi.fn(),
    onOpenBackgroundEditor: vi.fn(),
    onPanelGutterChange: vi.fn(),
    onShowGridChange: vi.fn(),
    onShowWebtoonGuidesChange: vi.fn(),
    onSnapEnabledChange: vi.fn(),
    onWarmWebtoonGuides: vi.fn(),
    onWebtoonThemeChange: vi.fn(),
    ...overrides,
  };
}

describe("StudioInspectorCanvasControls", () => {
  it("배경·그라디언트·편집기·캔버스 높이 동작을 부모 callback으로 전달한다", () => {
    const props = canvasProps();
    render(<StudioInspectorCanvasControls {...props} />);

    fireEvent.change(screen.getByLabelText("배경색"), {
      target: { value: "#123456" },
    });
    expect(props.onBackgroundChange).toHaveBeenCalledWith("#123456");

    fireEvent.click(
      screen.getByRole("button", { name: `배경 ${BG_PRESETS[0]?.label}` })
    );
    expect(props.onApplyBackgroundPreset).toHaveBeenCalledWith(BG_PRESETS[0]);

    fireEvent.click(
      screen.getByRole("button", { name: `그라디언트 ${GRADIENT_PRESETS[0]?.label}` })
    );
    expect(props.onGradientChange).toHaveBeenCalledWith(
      gradientToBgGrad(GRADIENT_PRESETS[0]!)
    );

    fireEvent.click(screen.getByRole("button", { name: "배경 편집기 · 리사이저 열기" }));
    expect(props.onOpenBackgroundEditor).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "높이 240px 줄이기" }));
    fireEvent.click(screen.getByRole("button", { name: "높이 240px 늘리기" }));
    expect(props.onCanvasHeightDelta).toHaveBeenNthCalledWith(1, -240);
    expect(props.onCanvasHeightDelta).toHaveBeenNthCalledWith(2, 240);
  });

  it("스냅·그리드·규격과 사용자 가이드 조작을 controlled callback으로 전달한다", () => {
    const props = canvasProps();
    render(<StudioInspectorCanvasControls {...props} />);

    fireEvent.change(screen.getByRole("slider", { name: /패널 여백/u }), {
      target: { value: "32" },
    });
    expect(props.onPanelGutterChange).toHaveBeenCalledWith(32);

    fireEvent.click(screen.getByLabelText("정렬 가이드 (스냅)"));
    expect(props.onSnapEnabledChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByLabelText("그리드 격자 표시"));
    expect(props.onShowGridChange).toHaveBeenCalledWith(false);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "60" } });
    expect(props.onGridSizeChange).toHaveBeenCalledWith(60);

    const webtoonGuideToggle = screen.getByLabelText("웹툰 규격 가이드");
    fireEvent.focus(webtoonGuideToggle);
    fireEvent.click(webtoonGuideToggle);
    expect(props.onWarmWebtoonGuides).toHaveBeenCalledTimes(1);
    expect(props.onShowWebtoonGuidesChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "+ 세로 가이드" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 가로 가이드" }));
    expect(props.onAddUserGuide).toHaveBeenNthCalledWith(1, "v");
    expect(props.onAddUserGuide).toHaveBeenNthCalledWith(2, "h");

    fireEvent.change(screen.getByRole("slider", { name: "세로 가이드 #1 위치" }), {
      target: { value: "400" },
    });
    expect(props.onMoveUserGuide).toHaveBeenCalledWith("guide-v", 400);

    fireEvent.click(screen.getAllByRole("button", { name: "삭제" })[0]!);
    expect(props.onDeleteUserGuide).toHaveBeenCalledWith("guide-v");
    fireEvent.click(screen.getByRole("button", { name: "모든 가이드 삭제" }));
    expect(props.onClearUserGuides).toHaveBeenCalledTimes(1);
  });

  it("매직 리사이즈와 테마 변경을 위임하고 문서 제어 잠금을 UI에 반영한다", () => {
    const props = canvasProps();
    const { rerender } = render(<StudioInspectorCanvasControls {...props} />);

    expect(screen.getByRole("region", { name: "매직 리사이즈 720×12000" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "테스트 규격 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "맞춤 축소 전략" }));
    fireEvent.click(screen.getByRole("button", { name: "소프트" }));
    expect(props.onApplyMagicResizePreset).toHaveBeenCalledWith(MAGIC_PRESET);
    expect(props.onMagicResizeStrategyChange).toHaveBeenCalledWith("scaleToFit");
    expect(props.onWebtoonThemeChange).toHaveBeenCalledWith("soft");

    rerender(
      <StudioInspectorCanvasControls
        {...props}
        controlsDisabled
        templateGutterAvailable={false}
      />
    );
    expect(
      (screen.getByRole("slider", { name: /패널 여백/u }) as HTMLInputElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "소프트" }) as HTMLButtonElement).disabled
    ).toBe(true);

    rerender(<StudioInspectorCanvasControls {...props} masterEditMode />);
    expect(screen.queryByRole("region", { name: /매직 리사이즈/u })).toBeNull();
  });
});
