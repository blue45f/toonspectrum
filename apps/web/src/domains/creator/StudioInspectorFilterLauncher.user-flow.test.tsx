// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStudioRasterToolAvailability } from "./render/studio-raster-tool-availability";
import { StudioInspectorFilterLauncher } from "./StudioRasterToolRecoveryPanel";

const preloadRasterRetouchRuntime = vi.hoisted(() =>
  vi.fn(() => Promise.resolve()),
);
vi.mock("./render/studio-raster-retouch-preload", () => ({
  preloadStudioRasterRetouchRuntime: preloadRasterRetouchRuntime,
}));

const preloadStudioFilterDialog = vi.hoisted(() => vi.fn());
vi.mock("./studio-filter-dialog-intent", () => ({
  useStudioFilterDialogIntent: () => preloadStudioFilterDialog,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioInspectorFilterLauncher user flow", () => {
  it("shows automatic and explicit non-destructive image-copy paths for drawn content", () => {
    const onRecover = vi.fn();
    const onSelect = vi.fn();
    const availability = resolveStudioRasterToolAvailability("filter", {
      selectedType: "draw",
      visibleVectorDrawCount: 1,
      exactRenderableVisibleCount: 1,
    });

    render(
      <StudioInspectorFilterLauncher
        availability={availability}
        onRecover={onRecover}
        onSelect={onSelect}
      />,
    );

    const region = screen.getByRole("region", { name: "필터 갤러리" });
    expect(region.getAttribute("data-studio-raster-entry-state")).toBe(
      "prepare-page-composite",
    );
    expect(screen.getByText("자동 준비")).toBeTruthy();
    expect(screen.getByRole("note", { name: "효과 적용 안내" })).toBeTruthy();
    expect(screen.getByText("선·도형 원본은 그대로 유지됩니다")).toBeTruthy();
    expect(screen.getByRole("list", { name: "효과 적용 단계" }).textContent).toContain(
      "효과 선택",
    );

    const select = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "현재 페이지 합성본 필터 선택",
    });
    expect(select.disabled).toBe(false);
    expect(select.options[0]?.textContent).toContain("복사본은 자동으로 준비");

    const prepare = screen.getByRole("button", {
      name: "효과용 이미지 복사본 먼저 만들기",
    });
    fireEvent.click(prepare);
    expect(onRecover).toHaveBeenCalledWith({
      toolId: "filter",
      action: availability.entry.action,
    });

    fireEvent.change(select, { target: { value: "gaussian-blur" } });
    expect(onSelect).toHaveBeenCalledWith("gaussian-blur");
  });

  it("explains cancellable preparation and disables both entry paths while busy", () => {
    const onRecover = vi.fn();
    const availability = resolveStudioRasterToolAvailability("filter", {
      selectedType: "draw",
      exactRenderableVisibleCount: 1,
    });

    render(
      <StudioInspectorFilterLauncher
        availability={availability}
        busy
        onRecover={onRecover}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/Esc를 누르면 취소/u)).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>("combobox").disabled).toBe(true);
    const prepare = screen.getByRole<HTMLButtonElement>("button", {
      name: "효과용 이미지 복사본 준비 중…",
    });
    expect(prepare.disabled).toBe(true);
    fireEvent.click(prepare);
    expect(onRecover).not.toHaveBeenCalled();
  });

  it("does not add a conversion step when an editable image is already selected", () => {
    const availability = resolveStudioRasterToolAvailability("filter", {
      selectedType: "image",
    });

    render(
      <StudioInspectorFilterLauncher
        availability={availability}
        onRecover={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("즉시 실행")).toBeTruthy();
    expect(screen.queryByRole("note", { name: "효과 적용 안내" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /효과용 이미지 복사본/u }),
    ).toBeNull();
    expect(screen.getByRole<HTMLSelectElement>("combobox").disabled).toBe(false);
  });
});
