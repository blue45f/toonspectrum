// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioCanvasStatusRail,
  type StudioCanvasStatusRailProps,
} from "./StudioCanvasStatusRail";

afterEach(cleanup);

function createProps(
  overrides: Partial<StudioCanvasStatusRailProps> = {}
): StudioCanvasStatusRailProps {
  return {
    mobileImmersive: false,
    hasAutosave: false,
    autosaveRestoreBlockedReason: null,
    selectionCount: 0,
    advancedFillBusy: false,
    advancedFillPreviewMessage: null,
    advancedFillActive: false,
    onDownloadAutosaveBackup: vi.fn(),
    onRestoreAutosave: vi.fn(),
    onClearAutosave: vi.fn(),
    onGroupSelection: vi.fn(),
    onAlignSelection: vi.fn(),
    onDuplicateSelection: vi.fn(),
    onRemoveSelection: vi.fn(),
    onClearSelection: vi.fn(),
    onCancelAdvancedFillPreview: vi.fn(),
    onApplyAdvancedFillPreview: vi.fn(),
    onCancelAdvancedFillCalculation: vi.fn(),
    ...overrides,
  };
}

describe("StudioCanvasStatusRail", () => {
  it("offers a backup instead of an unsafe autosave restore", () => {
    const props = createProps({
      hasAutosave: true,
      autosaveRestoreBlockedReason: "revision-mismatch",
    });

    render(<StudioCanvasStatusRail {...props} />);

    expect(screen.getByText(/현재 서버 revision과 달라/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "복구하기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "JSON 백업" }));
    fireEvent.click(screen.getByRole("button", { name: "비우기" }));

    expect(props.onDownloadAutosaveBackup).toHaveBeenCalledOnce();
    expect(props.onClearAutosave).toHaveBeenCalledOnce();
  });

  it("restores a compatible autosave through the semantic callback", () => {
    const props = createProps({ hasAutosave: true });

    render(<StudioCanvasStatusRail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "복구하기" }));

    expect(props.onRestoreAutosave).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "JSON 백업" })).toBeNull();
  });

  it("preserves selection thresholds and alignment meanings", () => {
    const props = createProps({ selectionCount: 2 });
    const { rerender } = render(<StudioCanvasStatusRail {...props} />);

    expect(screen.getByRole("button", { name: "그룹화" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "가로 분배" })).toBeNull();

    rerender(<StudioCanvasStatusRail {...props} selectionCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: "그룹화" }));
    fireEvent.click(screen.getByTitle("왼쪽 정렬"));
    fireEvent.click(screen.getByTitle("세로 가운데 정렬"));
    fireEvent.click(screen.getByRole("button", { name: "가로 분배" }));
    fireEvent.click(screen.getByRole("button", { name: "세로 분배" }));
    fireEvent.click(screen.getByRole("button", { name: "복제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "해제" }));

    expect(props.onGroupSelection).toHaveBeenCalledOnce();
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(1, "left");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(2, "vcenter");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(3, "distributeH");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(4, "distributeV");
    expect(props.onDuplicateSelection).toHaveBeenCalledOnce();
    expect(props.onRemoveSelection).toHaveBeenCalledOnce();
    expect(props.onClearSelection).toHaveBeenCalledOnce();
  });

  it("keeps advanced-fill cancellation and preview application distinct", () => {
    const props = createProps({ advancedFillBusy: true });
    const { rerender } = render(<StudioCanvasStatusRail {...props} />);

    expect(screen.getByRole("status").textContent).toContain("고급 채우기 분석 중");
    fireEvent.click(screen.getByRole("button", { name: "계산 취소" }));
    expect(props.onCancelAdvancedFillCalculation).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /적용/ })).toBeNull();

    rerender(
      <StudioCanvasStatusRail
        {...props}
        advancedFillBusy={false}
        advancedFillPreviewMessage="3개 영역을 찾았어요."
        advancedFillActive
      />
    );
    expect(screen.getByRole("status").textContent).toContain("다른 영역을 탭해");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.click(screen.getByRole("button", { name: "적용 · 실행취소 1회" }));

    expect(props.onCancelAdvancedFillPreview).toHaveBeenCalledOnce();
    expect(props.onApplyAdvancedFillPreview).toHaveBeenCalledOnce();
  });

  it("marks the mobile rail as its own bounded scroll region", () => {
    const { container } = render(
      <StudioCanvasStatusRail {...createProps({ mobileImmersive: true })} />
    );

    const rail = container.querySelector("[data-studio-canvas-status-rail]");
    expect(rail?.className).toContain("overflow-y-auto");
    expect(rail?.className).not.toContain("contents");
  });
});
