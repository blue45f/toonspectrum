// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioCanvasStatusRail,
  type StudioCanvasStatusRailProps,
} from "./StudioCanvasStatusRail";

import type { ReactNode } from "react";

vi.mock("./StudioToolHint", () => ({
  StudioToolHintTarget: ({
    hint,
    children,
  }: {
    hint: {
      id: string;
      description: string;
      preview?: string;
      previewVariant?: string;
    };
    children: ReactNode;
  }) => (
    <span
      data-testid={`hint-${hint.id}`}
      data-hint-description={hint.description}
      data-hint-preview={hint.preview}
      data-hint-preview-variant={hint.previewVariant}
    >
      {children}
    </span>
  ),
}));

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
    onUngroupSelection: vi.fn(),
    onToggleSelectionLock: vi.fn(),
    onReorderSelection: vi.fn(),
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

  it("preserves selection thresholds and every semantic layout callback", () => {
    const props = createProps({ selectionCount: 1 });
    const { rerender } = render(<StudioCanvasStatusRail {...props} />);

    expect(screen.queryByRole("button", { name: "선택 요소 그룹화" })).toBeNull();
    expect(screen.getByRole("button", { name: "선택 요소 왼쪽 정렬" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "선택 요소 가로 균등 분배" })).toBeNull();

    rerender(<StudioCanvasStatusRail {...props} selectionCount={2} />);
    expect(screen.getByRole("button", { name: "선택 요소 그룹화" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "선택 요소 가로 균등 분배" })).toBeNull();

    rerender(<StudioCanvasStatusRail {...props} selectionCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 그룹화" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 잠금" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 맨 앞으로" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 맨 뒤로" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 왼쪽 정렬" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 가로 가운데 정렬" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 오른쪽 정렬" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 위쪽 정렬" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 세로 가운데 정렬" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 아래쪽 정렬" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 가로 균등 분배" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 요소 세로 균등 분배" }));
    fireEvent.click(screen.getByRole("button", { name: "복제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "해제" }));

    expect(props.onGroupSelection).toHaveBeenCalledOnce();
    expect(props.onToggleSelectionLock).toHaveBeenCalledOnce();
    expect(props.onReorderSelection).toHaveBeenNthCalledWith(1, "front");
    expect(props.onReorderSelection).toHaveBeenNthCalledWith(2, "back");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(1, "left");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(2, "hcenter");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(3, "right");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(4, "top");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(5, "vcenter");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(6, "bottom");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(7, "distributeH");
    expect(props.onAlignSelection).toHaveBeenNthCalledWith(8, "distributeV");
    expect(props.onDuplicateSelection).toHaveBeenCalledOnce();
    expect(props.onRemoveSelection).toHaveBeenCalledOnce();
    expect(props.onClearSelection).toHaveBeenCalledOnce();
  });

  it("switches a complete group between ungroup and lock recovery actions", () => {
    const props = createProps({
      selectionCount: 2,
      selectionGroupName: "주인공",
      selectionLockState: "locked",
    });

    render(<StudioCanvasStatusRail {...props} />);

    expect(screen.queryByRole("button", { name: "선택 요소 그룹화" })).toBeNull();
    expect(screen.getByText("주인공")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "선택 그룹 해제" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 잠금 해제" }));

    expect(props.onUngroupSelection).toHaveBeenCalledOnce();
    expect(props.onToggleSelectionLock).toHaveBeenCalledOnce();
  });

  it("labels mixed lock state without adding another vertical toolbar row", () => {
    const { container } = render(
      <StudioCanvasStatusRail
        {...createProps({
          selectionCount: 2,
          selectionLockState: "mixed",
        })}
      />
    );

    expect(screen.getByRole("button", { name: "선택 잠금 통일" })).toBeTruthy();
    expect(screen.getByText("혼합")).toBeTruthy();
    const actionStrip = screen.getByRole("button", { name: "선택 잠금 통일" }).parentElement
      ?.parentElement;
    expect(actionStrip?.className).toContain("overflow-x-auto");
    expect(container.querySelector("[data-studio-canvas-status-rail]")).toBeTruthy();
  });

  it("exposes the bubble-merge action only when armed and gates it on the reason", () => {
    const hidden = createProps({ selectionCount: 2 });
    const { rerender } = render(<StudioCanvasStatusRail {...hidden} />);
    expect(screen.queryByRole("button", { name: "선택한 말풍선 병합" })).toBeNull();

    const enabled = createProps({
      selectionCount: 2,
      showBubbleMerge: true,
      bubbleMergeDisabledReason: null,
      onMergeBubbles: vi.fn(),
    });
    rerender(<StudioCanvasStatusRail {...enabled} />);
    const mergeButton = screen.getByRole("button", { name: "선택한 말풍선 병합" });
    expect(mergeButton).toBeTruthy();
    expect(mergeButton.hasAttribute("disabled")).toBe(false);
    fireEvent.click(mergeButton);
    expect(enabled.onMergeBubbles).toHaveBeenCalledOnce();

    const gated = createProps({
      selectionCount: 3,
      showBubbleMerge: true,
      bubbleMergeDisabledReason: "말풍선만 함께 선택해야 병합할 수 있어요.",
      onMergeBubbles: vi.fn(),
    });
    rerender(<StudioCanvasStatusRail {...gated} />);
    const disabledButton = screen.getByRole("button", { name: "선택한 말풍선 병합" });
    expect(disabledButton.hasAttribute("disabled")).toBe(true);
    fireEvent.click(disabledButton);
    expect(gated.onMergeBubbles).not.toHaveBeenCalled();
  });

  it("registers one exact rich preview per layout action without native titles", () => {
    const { container } = render(
      <StudioCanvasStatusRail {...createProps({ selectionCount: 3 })} />
    );

    expect(container.querySelector("[title]")).toBeNull();

    const previewTargets = [
      ...container.querySelectorAll<HTMLElement>('[data-hint-preview="selection-layout"]'),
    ];
    expect(previewTargets).toHaveLength(9);
    expect(previewTargets.map((target) => target.dataset.hintPreviewVariant)).toEqual([
      "group",
      "align-left",
      "align-hcenter",
      "align-right",
      "align-top",
      "align-vcenter",
      "align-bottom",
      "distribute-horizontal",
      "distribute-vertical",
    ]);
    expect(screen.getByTestId("hint-selection-layout-group").dataset.hintDescription).toContain(
      "2개 이상"
    );
    expect(
      screen.getByTestId("hint-selection-layout-distribute-horizontal").dataset.hintDescription
    ).toContain("3개 이상");
    expect(
      screen.getByTestId("hint-selection-layout-distribute-vertical").dataset.hintDescription
    ).toContain("3개 이상");
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
    expect((rail as HTMLElement | null)?.style.paddingTop).toBe("3.75rem");
  });
});
