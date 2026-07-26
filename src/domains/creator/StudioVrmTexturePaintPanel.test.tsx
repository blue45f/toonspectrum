// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioVrmTexturePaintCursor } from "./studio-vrm-texture-paint-cursor";
import {
  StudioVrmTexturePaintPanel,
  type StudioVrmTexturePaintPanelProps,
  type StudioVrmTexturePaintPanelSettings,
} from "./StudioVrmTexturePaintPanel";

const SETTINGS: StudioVrmTexturePaintPanelSettings = {
  brushKind: "ink",
  color: "#3a7bd5",
  sizeTexels: 48,
  opacity: 0.8,
  blend: "normal",
  tuning: {
    flow: 0.7,
    hardness: 0.9,
    minSize: 0.2,
  },
};

function renderPanel(overrides: Partial<StudioVrmTexturePaintPanelProps> = {}) {
  const props: StudioVrmTexturePaintPanelProps = {
    hidden: false,
    disabled: false,
    settings: SETTINGS,
    activeTargetId: "vrm-texture:face",
    activeTextureLabel: "Face · 2048×2048",
    status: "표면을 끌어 칠하세요.",
    strokeActive: false,
    targetCount: 1,
    canUndo: true,
    canRedo: true,
    onSettingsChange: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onResetActiveTexture: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<StudioVrmTexturePaintPanel {...props} />) };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioVrmTexturePaintPanel", () => {
  it("exposes a compact keyboard-accessible surface-paint workflow", () => {
    renderPanel();

    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      "vrm-character-subtab-surface",
    );
    expect(screen.getByText("3D 표면 페인트")).toBeTruthy();
    expect(screen.getByText("Face · 2048×2048")).toBeTruthy();
    expect(
      screen.getByText("표면을 끌어 칠하세요.").closest('[role="status"]')?.getAttribute("aria-live"),
    ).toBe("polite");

    for (const label of ["잉크", "연필", "에어", "수채"]) {
      expect(screen.getByRole("button", { name: label }).className).toContain("min-h-11");
    }
    for (const label of ["일반", "곱하기", "스크린", "오버레이", "지우개"]) {
      expect(screen.getByRole("button", { name: label }).className).toContain("min-h-11");
    }
    for (const label of ["취소", "재실행", "원본"]) {
      expect(screen.getByRole("button", { name: label }).className).toContain("min-h-11");
    }
  });

  it("reports brush, blend, colour, size, and pressure-style changes", () => {
    const { props } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "수채" }));
    fireEvent.click(screen.getByRole("button", { name: "곱하기" }));
    fireEvent.change(screen.getByLabelText("표면 페인트 색상 선택"), {
      target: { value: "#ff8800" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "크기" }), {
      target: { value: "72" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "도포량" }), {
      target: { value: "0.42" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "경도" }), {
      target: { value: "0.55" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "최소 굵기" }), {
      target: { value: "0.16" },
    });

    expect(props.onSettingsChange).toHaveBeenCalledWith({ brushKind: "watercolor" });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ blend: "multiply" });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ color: "#ff8800" });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ sizeTexels: 72 });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ tuning: { flow: 0.42 } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ tuning: { hardness: 0.55 } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ tuning: { minSize: 0.16 } });
  });

  it("keeps an incremental HEX draft editable and commits only a complete color", () => {
    const { props } = renderPanel();
    const input = screen.getByLabelText("표면 페인트 HEX 색상") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "#3A7" } });
    expect(input.value).toBe("#3A7");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(props.onSettingsChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "#FF8800" } });
    expect(input.value).toBe("#FF8800");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(props.onSettingsChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ color: "#ff8800" });

    fireEvent.change(input, { target: { value: "#BAD" } });
    fireEvent.blur(input);
    expect(input.value).toBe(SETTINGS.color.toUpperCase());
  });

  it("keeps destructive and history actions unavailable without a usable target", () => {
    renderPanel({
      activeTargetId: null,
      activeTextureLabel: null,
      canUndo: false,
      canRedo: false,
      strokeActive: true,
    });

    expect((screen.getByRole("button", { name: "취소" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "재실행" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "원본" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("칠할 표면을 선택하세요")).toBeTruthy();
  });

  it("requires a deliberate second activation before destructive source restoration", () => {
    const { props } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "원본" }));
    expect(props.onResetActiveTexture).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "한 번 더" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "한 번 더" }));
    expect(props.onResetActiveTexture).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "원본" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("clears destructive confirmation when the target id changes despite an identical label", () => {
    const firstTargetId = "vrm-texture:first";
    const secondTargetId = "vrm-texture:second";
    const sharedLabel = "Base color · 2048×2048";
    const { props, rerender } = renderPanel({
      activeTargetId: firstTargetId,
      activeTextureLabel: sharedLabel,
    });

    fireEvent.click(screen.getByRole("button", { name: "원본" }));
    expect(screen.getByRole("button", { name: "한 번 더" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    rerender(
      <StudioVrmTexturePaintPanel
        {...props}
        activeTargetId={secondTargetId}
        activeTextureLabel={sharedLabel}
      />,
    );
    expect(screen.getByRole("button", { name: "원본" }).getAttribute("aria-pressed")).toBe(
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "원본" }));
    expect(props.onResetActiveTexture).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "한 번 더" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("builds brush-dependent precision cursors with an explicit eraser mark", () => {
    const inkCursor = createStudioVrmTexturePaintCursor(SETTINGS);
    const eraserCursor = createStudioVrmTexturePaintCursor({
      ...SETTINGS,
      blend: "erase",
      sizeTexels: 192,
    });

    expect(inkCursor).toContain("data:image/svg+xml");
    expect(inkCursor).toContain("crosshair");
    expect(eraserCursor).not.toBe(inkCursor);
    expect(decodeURIComponent(eraserCursor)).toContain("#ff6b6b");
  });

  it("disables colour entry in eraser mode while keeping the eraser selected", () => {
    renderPanel({
      settings: { ...SETTINGS, blend: "erase" },
    });

    expect(screen.getByRole("button", { name: "지우개" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect((screen.getByLabelText("표면 페인트 색상 선택") as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText("표면 페인트 HEX 색상") as HTMLInputElement).disabled).toBe(
      true,
    );
  });
});
