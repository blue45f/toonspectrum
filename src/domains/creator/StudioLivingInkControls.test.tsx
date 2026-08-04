// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS } from "./studio-living-ink-gpu-protocol";
import { StudioLivingInkControls } from "./StudioLivingInkControls";

afterEach(cleanup);

function renderControls(overrides: Partial<Parameters<typeof StudioLivingInkControls>[0]> = {}) {
  const props: Parameters<typeof StudioLivingInkControls>[0] = {
    supported: true,
    state: "ready",
    mode: "ink",
    onModeChange: vi.fn(),
    scope: "all",
    onScopeChange: vi.fn(),
    selectionAvailable: false,
    busy: false,
    fixAvailable: false,
    fixUnavailableReason: "GPU 정착층 저장 영수증이 준비되지 않았습니다.",
    onFix: vi.fn(),
    onClear: vi.fn(),
    material: DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS,
    materialLocked: true,
    onMaterialChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<StudioLivingInkControls {...props} />) };
}

describe("StudioLivingInkControls", () => {
  it("keeps Fix and persisted material controls truthfully disabled", () => {
    renderControls();
    expect(screen.getByRole("button", { name: "수채 번짐 정착" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("slider", { name: "수채 번짐 번짐" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "재질 기본값 복원" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/이미 그려 둔 번짐 레이어의 재질을 바꾸면/)).toBeTruthy();
  });

  it("offers water and selection only when the exact product state permits them", () => {
    const { props } = renderControls({ selectionAvailable: true, materialLocked: false });
    fireEvent.click(screen.getByRole("button", { name: "수채 번짐 물" }));
    expect(props.onModeChange).toHaveBeenCalledWith("water");
    fireEvent.change(screen.getByRole("combobox", { name: "수채 번짐 처리 범위" }), {
      target: { value: "selection" },
    });
    expect(props.onScopeChange).toHaveBeenCalledWith("selection");
  });

  it("exposes Fix only after product admission proves a persisted physical layer", () => {
    const { props } = renderControls({ fixAvailable: true, materialLocked: true });
    const fix = screen.getByRole("button", { name: "수채 번짐 정착" });
    expect(fix.hasAttribute("disabled")).toBe(false);
    fireEvent.click(fix);
    expect(props.onFix).toHaveBeenCalledOnce();
  });

  it("uses product chrome tokens (not a separate cyan system shell)", () => {
    renderControls();
    const root = document.querySelector("[data-studio-living-ink-controls=\"true\"]");
    expect(root).not.toBeNull();
    expect(root!.className).toContain("border-line");
    expect(root!.className).not.toMatch(/cyan/u);
    expect(root!.getAttribute("data-studio-brush-behavior")).toBe("wash");
  });
});
