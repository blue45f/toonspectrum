// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioBrushLibraryPanel,
  StudioBrushStudio,
  StudioShapePickerGrid,
  StudioUnifiedBrushPicker,
  loadStudioBrushStudio,
} from "./studio-page-lazy-ui";
import {
  StudioMobileEditingDock,
  type StudioMobileEditingDockHandlers,
  type StudioMobileEditingDockProps,
} from "./StudioMobileEditingDock";
import { StudioMobileSheetHandle } from "./StudioMobileSheetHandle";

import type { NormalizedStudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import type { StudioBrushSnapshot } from "./studio-brush-library";
import type { StudioProDrawPrefs } from "./studio-pro-draw-prefs";
import type { StudioWorkspaceState } from "./studio-workspaces";

interface MockDockButtonProps {
  readonly "aria-controls"?: string;
  readonly "aria-expanded"?: boolean;
  readonly "aria-label"?: string;
  readonly disabled?: boolean;
  readonly hintDescription?: string;
  readonly hintPreview?: string;
  readonly hintPreviewVariant?: string;
  readonly label: string;
  readonly onClick?: () => void;
}

vi.mock("./studio-chrome-ui", () => ({
  StudioContextActionButton: ({ label, disabled, onClick }: MockDockButtonProps) => (
    <button type="button" disabled={disabled} onClick={onClick}>{label}</button>
  ),
  StudioDockButton: ({
    "aria-controls": ariaControls,
    "aria-expanded": ariaExpanded,
    "aria-label": ariaLabel,
    label,
    disabled,
    hintDescription,
    hintPreview,
    hintPreviewVariant,
    onClick,
  }: MockDockButtonProps) => (
    <button
      type="button"
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel ?? label}
      data-hint-description={hintDescription}
      data-hint-preview={hintPreview}
      data-hint-preview-variant={hintPreviewVariant}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  ),
  StudioDockNavButton: ({
    "aria-label": ariaLabel,
    label,
    disabled,
    onClick,
  }: MockDockButtonProps) => (
    <button type="button" aria-label={ariaLabel ?? label} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

vi.mock("./studio-page-lazy-ui", () => ({
  StudioBrushLibraryPanel: () => null,
  StudioBrushStudio: () => null,
  StudioShapePickerGrid: () => null,
  StudioUnifiedBrushPicker: () => null,
  loadStudioBrushStudio: vi.fn(async () => undefined),
}));

vi.mock("./StudioLineCorrectionControls", () => ({
  StudioLineCorrectionControls: () => null,
}));

vi.mock("./StudioSavedBrushShelf", () => ({
  StudioSavedBrushShelf: () => null,
}));

function createHandlers(): StudioMobileEditingDockHandlers {
  return {
    applyBuiltInBrushPreset: vi.fn(),
    applyDynamicsPreset: vi.fn(),
    applySavedBrush: vi.fn(),
    dismissBrushManager: vi.fn(),
    dismissMobileHint: vi.fn(),
    duplicateSelected: vi.fn(),
    fitCanvasToWidth: vi.fn(),
    openBrushManager: vi.fn(),
    openInspectorRoute: vi.fn(),
    openStudioFilter: vi.fn(),
    queueBrushDelete: vi.fn(),
    redo: vi.fn(),
    removeSelected: vi.fn(),
    reorder: vi.fn(),
    toggleAdvancedFill: vi.fn(),
    undo: vi.fn(),
  };
}

function createProps(
  overrides: Partial<StudioMobileEditingDockProps> = {},
): StudioMobileEditingDockProps {
  return {
    activeCatalogBrushId: "gpen",
    activeCatalogBrushName: "G펜",
    activeSavedBrushId: null,
    activeSurfaceReviewLocked: false,
    advancedFillActive: false,
    advancedFillUnsupportedReason: null,
    brush: "gpen",
    brushCatalogHandlers: {
      close: vi.fn(),
      selectBrushId: vi.fn(),
      toggle: vi.fn(),
      toggleFavorite: vi.fn(),
    },
    brushCatalogItems: [],
    brushCatalogOpen: false,
    brushDynamics: {} as NormalizedStudioBrushDynamicsSettings,
    brushManagerSheetRef: { current: null },
    brushOpacity: 1,
    collaborationDocumentLocked: false,
    color: "#111111",
    colorBlindPreview: "none",
    colorVisionSheetRef: { current: null },
    currentBrushSnapshot: {} as StudioBrushSnapshot,
    drawMode: "pen",
    drawShape: "rect",
    drawSheetRef: { current: null },
    filterMutationLocked: false,
    hi: 0,
    history: [[], []],
    isMobile: false,
    marqueeIds: [],
    mobileBrushDockButtonRef: { current: null },
    mobileKeyboardInset: 0,
    mobileQuickActionsButton: <button type="button">빠른 작업</button>,
    mobileSheet: null,
    postCorrection: 0,
    preserveCorners: true,
    pressureCurve: 1,
    proDrawPrefs: {} as StudioProDrawPrefs,
    quickActionsOpen: false,
    savedBrushes: [],
    selected: null,
    setBrushDynamics: vi.fn(),
    setBrushOpacity: vi.fn(),
    setColor: vi.fn(),
    setColorBlindPreview: vi.fn(),
    setDrawMode: vi.fn(),
    setDrawShape: vi.fn(),
    setMarqueeIds: vi.fn(),
    setMenu: vi.fn(),
    setMobileSheet: vi.fn(),
    setPostCorrection: vi.fn(),
    setPreserveCorners: vi.fn(),
    setPressureCurve: vi.fn(),
    setQuickStartOpen: vi.fn(),
    setSavedBrushes: vi.fn(),
    setSelectedId: vi.fn(),
    setShapeFill: vi.fn(),
    setStabilizer: vi.fn(),
    setStabilizerMode: vi.fn(),
    setStampTuning: vi.fn(),
    setStrokeWidth: vi.fn(),
    setTiltEnabled: vi.fn(),
    setTipAngle: vi.fn(),
    setTipRoundness: vi.fn(),
    setTool: vi.fn(),
    setUseVelocityPressure: vi.fn(),
    setVelocitySensitivity: vi.fn(),
    setZoom: vi.fn(),
    shapeFill: false,
    showMobileHint: false,
    stabilizer: 0,
    stabilizerMode: "standard",
    stableHandlers: createHandlers(),
    stampTuning: null,
    strokeWidth: 4,
    tiltEnabled: false,
    tipAngle: 0,
    tipRoundness: 1,
    tool: "draw",
    ui: {
      StudioBrushLibraryPanel,
      StudioBrushStudio,
      StudioMobileSheetHandle,
      StudioShapePickerGrid,
      StudioUnifiedBrushPicker,
      loadStudioBrushStudio,
    },
    useVelocityPressure: false,
    velocitySensitivity: 1,
    workspaceState: { mobileControlSide: "right" } as StudioWorkspaceState,
    zoom: 1,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioMobileEditingDock", () => {
  it("does not mount mobile dock chrome on a desktop surface", () => {
    const view = render(<StudioMobileEditingDock {...createProps()} />);

    expect(view.container.innerHTML).toBe("");
    expect(screen.queryByRole("navigation", { name: "스튜디오 모바일 도구막대" })).toBeNull();
  });

  it("preserves dock rows, safe-area placement, and history disabled semantics", () => {
    const props = createProps({ isMobile: true, mobileKeyboardInset: 18 });
    const view = render(<StudioMobileEditingDock {...props} />);
    let dock = screen.getByRole("navigation", { name: "스튜디오 모바일 도구막대" });

    expect(dock.getAttribute("data-studio-mobile-editing-dock")).toBe("true");
    expect(dock.className).toContain("env(safe-area-inset-bottom)");
    expect(dock.style.bottom).toBe("18px");
    expect(within(dock).getByRole("toolbar", { name: "드로잉 도구" })).toBeTruthy();
    expect(within(dock).getByRole("toolbar", { name: "작업 공간" })).toBeTruthy();
    expect(within(dock).getByRole<HTMLButtonElement>("button", { name: "실행취소" }).disabled).toBe(true);
    expect(within(dock).getByRole<HTMLButtonElement>("button", { name: "다시실행" }).disabled).toBe(false);

    view.rerender(<StudioMobileEditingDock {...createProps({ isMobile: true, hi: 1 })} />);
    dock = screen.getByRole("navigation", { name: "스튜디오 모바일 도구막대" });
    expect(within(dock).getByRole<HTMLButtonElement>("button", { name: "실행취소" }).disabled).toBe(false);
    expect(within(dock).getByRole<HTMLButtonElement>("button", { name: "다시실행" }).disabled).toBe(true);

    view.rerender(
      <StudioMobileEditingDock
        {...createProps({ isMobile: true, collaborationDocumentLocked: true })}
      />,
    );
    dock = screen.getByRole("navigation", { name: "스튜디오 모바일 도구막대" });
    expect(within(dock).getByRole<HTMLButtonElement>("button", { name: "실행취소" }).disabled).toBe(true);
    expect(within(dock).getByRole<HTMLButtonElement>("button", { name: "다시실행" }).disabled).toBe(true);
  });

  it("preserves the draw and brush-manager dialog contracts through stable handlers", () => {
    const stableHandlers = createHandlers();
    const view = render(
      <StudioMobileEditingDock
        {...createProps({ isMobile: true, mobileSheet: "draw", stableHandlers })}
      />,
    );

    const drawSheet = screen.getByRole("dialog", { name: "브러시 설정" });
    expect(drawSheet.getAttribute("data-studio-sheet-id")).toBe("draw");
    expect(drawSheet.getAttribute("aria-modal")).toBe("false");
    expect(drawSheet.getAttribute("data-studio-sheet-snap")).toBe("medium");

    view.rerender(
      <StudioMobileEditingDock
        {...createProps({
          isMobile: true,
          mobileKeyboardInset: 22,
          mobileSheet: "brushes",
          stableHandlers,
        })}
      />,
    );

    const brushManager = screen.getByRole("dialog", { name: "내 브러시 관리" });
    expect(brushManager.getAttribute("data-studio-sheet-id")).toBe("brushes");
    expect(brushManager.getAttribute("aria-modal")).toBe("true");
    expect(brushManager.getAttribute("data-studio-sheet-snap")).toBe("medium");
    expect(brushManager.style.bottom).toBe("22px");
    within(brushManager).getByRole("button", { name: "브러시 관리 닫기" }).click();
    expect(stableHandlers.dismissBrushManager).toHaveBeenCalledOnce();
  });

  it("announces each mobile draw control's next settings-sheet action", () => {
    const view = render(
      <StudioMobileEditingDock
        {...createProps({ isMobile: true, tool: "select", drawMode: "pen" })}
      />,
    );
    const drawingTools = () => within(
      screen.getByRole("toolbar", { name: "드로잉 도구" }),
    );

    const inactivePen = drawingTools().getByRole("button", { name: "펜" });
    expect(inactivePen.getAttribute("data-hint-preview")).toBe("ink");
    expect(inactivePen.getAttribute("aria-expanded")).toBeNull();
    expect(inactivePen.getAttribute("aria-controls")).toBeNull();

    const inactiveShape = drawingTools().getByRole("button", { name: "도형" });
    expect(inactiveShape.getAttribute("data-hint-preview")).toBe("shape");
    expect(inactiveShape.getAttribute("data-hint-preview-variant")).toBe("rect");

    view.rerender(
      <StudioMobileEditingDock
        {...createProps({ isMobile: true, tool: "draw", drawMode: "pen", mobileSheet: null })}
      />,
    );
    const closedPen = drawingTools().getByRole("button", { name: "펜" });
    expect(closedPen.getAttribute("aria-expanded")).toBe("false");
    expect(closedPen.getAttribute("aria-controls")).toBe("studio-mobile-draw-settings");
    expect(closedPen.getAttribute("data-hint-preview")).toBe("draw-settings");
    expect(closedPen.getAttribute("data-hint-preview-variant")).toBe("expand");
    expect(closedPen.getAttribute("data-hint-description")).toContain("설정을 열어");

    view.rerender(
      <StudioMobileEditingDock
        {...createProps({ isMobile: true, tool: "draw", drawMode: "pen", mobileSheet: "draw" })}
      />,
    );
    const openPen = drawingTools().getByRole("button", { name: "펜" });
    expect(openPen.getAttribute("aria-expanded")).toBe("true");
    expect(openPen.getAttribute("data-hint-preview-variant")).toBe("collapse");
    expect(openPen.getAttribute("data-hint-description")).toContain("설정을 닫고");

    const openBrush = drawingTools().getByRole("button", { name: "브러시 설정 (굵기·색·프리셋)" });
    expect(openBrush.getAttribute("aria-expanded")).toBe("true");
    expect(openBrush.getAttribute("aria-controls")).toBe("studio-mobile-draw-settings");
    expect(openBrush.getAttribute("data-hint-preview-variant")).toBe("collapse");

    view.rerender(
      <StudioMobileEditingDock
        {...createProps({ isMobile: true, tool: "draw", drawMode: "shape", mobileSheet: null })}
      />,
    );
    const closedShape = drawingTools().getByRole("button", { name: "도형" });
    expect(closedShape.getAttribute("aria-expanded")).toBe("false");
    expect(closedShape.getAttribute("aria-controls")).toBe("studio-mobile-draw-settings");
    expect(closedShape.getAttribute("data-hint-preview")).toBe("draw-settings");
    expect(closedShape.getAttribute("data-hint-preview-variant")).toBe("expand");

    const closedBrush = drawingTools().getByRole("button", { name: "브러시 설정 (굵기·색·프리셋)" });
    expect(closedBrush.getAttribute("aria-expanded")).toBe("false");
    expect(closedBrush.getAttribute("data-hint-preview-variant")).toBe("expand");

    expect(document.getElementById("studio-mobile-draw-settings")).not.toBeNull();
  });

  it("exposes all color-vision coaches from the actual mobile dock", () => {
    const setColorBlindPreview = vi.fn();
    const setMobileSheet = vi.fn();
    const view = render(
      <StudioMobileEditingDock
        {...createProps({ isMobile: true, setColorBlindPreview, setMobileSheet })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "색각·명암 검수" }));
    expect(setMobileSheet).toHaveBeenCalledOnce();

    view.rerender(
      <StudioMobileEditingDock
        {...createProps({
          isMobile: true,
          mobileSheet: "color-vision",
          setColorBlindPreview,
          setMobileSheet,
        })}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "색각 검수" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-studio-mobile-sheet")).toBe("true");
    expect(dialog.getAttribute("data-studio-shortcut-boundary")).toBe("true");
    expect(dialog.tabIndex).toBe(-1);
    expect(within(dialog).getAllByRole("radio")).toHaveLength(5);

    fireEvent.click(within(dialog).getByRole("radio", { name: "흑백 명암 미리보기" }));
    expect(setColorBlindPreview).toHaveBeenCalledWith("grayscale");

    fireEvent.click(within(dialog).getByRole("button", { name: "색각 검수 닫기" }));
    expect(setMobileSheet).toHaveBeenLastCalledWith(null);
    view.rerender(
      <StudioMobileEditingDock
        {...createProps({ isMobile: true, setColorBlindPreview, setMobileSheet })}
      />,
    );
    expect(screen.queryByRole("dialog", { name: "색각 검수" })).toBeNull();
  });

  it("cycles draw sheet sizes, clamps keyboard resize at compact, and closes explicitly", () => {
    const setMobileSheet = vi.fn();
    render(
      <StudioMobileEditingDock
        {...createProps({
          isMobile: true,
          mobileKeyboardInset: 19.6,
          mobileSheet: "draw",
          setMobileSheet,
        })}
      />,
    );

    const drawSheet = screen.getByRole("dialog", { name: "브러시 설정" });
    const handle = screen.getByRole("slider", { name: /브러시 설정 크기 조절/ });
    expect(
      drawSheet.style.getPropertyValue("--studio-draw-sheet-reserved-bottom"),
    ).toContain("20px");
    expect(handle.getAttribute("aria-valuenow")).toBe("1");

    fireEvent.click(handle);
    expect(drawSheet.getAttribute("data-studio-sheet-snap")).toBe("full");
    expect(
      drawSheet.style.getPropertyValue("--studio-draw-sheet-height"),
    ).toContain("min(88dvh");
    expect(
      drawSheet.style.getPropertyValue("--studio-draw-sheet-height"),
    ).toContain("--studio-canvas-bottom-inset");

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(drawSheet.getAttribute("data-studio-sheet-snap")).toBe("compact");
    expect(setMobileSheet).not.toHaveBeenCalled();

    expect(fireEvent.keyDown(handle, { key: "ArrowDown" })).toBe(false);
    expect(setMobileSheet).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "브러시 설정 닫기" }));
    expect(setMobileSheet).toHaveBeenCalledWith(null);
  });

  it("uses the same three snap levels for the mobile brush manager", () => {
    const stableHandlers = createHandlers();
    render(
      <StudioMobileEditingDock
        {...createProps({
          isMobile: true,
          mobileKeyboardInset: Number.NaN,
          mobileSheet: "brushes",
          stableHandlers,
        })}
      />,
    );

    const brushManager = screen.getByRole("dialog", { name: "내 브러시 관리" });
    const handle = screen.getByRole("slider", { name: /내 브러시 관리 크기 조절/ });
    expect(brushManager.style.bottom).toBe("0px");
    expect(brushManager.getAttribute("data-studio-sheet-snap")).toBe("medium");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(brushManager.getAttribute("data-studio-sheet-snap")).toBe("full");

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(brushManager.getAttribute("data-studio-sheet-snap")).toBe("compact");

    expect(fireEvent.keyDown(handle, { key: "ArrowDown" })).toBe(false);
    expect(stableHandlers.dismissBrushManager).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "브러시 관리 닫기" }));
    expect(stableHandlers.dismissBrushManager).toHaveBeenCalledOnce();
  });

  it("delegates selection toolbar actions without moving controller state into the dock", () => {
    const stableHandlers = createHandlers();
    const setMarqueeIds = vi.fn();
    const setMobileSheet = vi.fn();
    const setSelectedId = vi.fn();
    render(
      <StudioMobileEditingDock
        {...createProps({
          isMobile: true,
          selected: { id: "image-1", type: "image" } as StudioMobileEditingDockProps["selected"],
          setMarqueeIds,
          setMobileSheet,
          setSelectedId,
          stableHandlers,
        })}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "선택 항목 빠른 작업" });
    within(toolbar).getByRole("button", { name: "속성" }).click();
    within(toolbar).getByRole("button", { name: "복제" }).click();
    within(toolbar).getByRole("button", { name: "앞으로" }).click();
    within(toolbar).getByRole("button", { name: "뒤로" }).click();
    within(toolbar).getByRole("button", { name: "삭제" }).click();
    within(toolbar).getByRole("button", { name: "해제" }).click();

    expect(stableHandlers.openInspectorRoute).toHaveBeenCalledWith({ primary: "properties" });
    expect(setMobileSheet).toHaveBeenCalledWith("props");
    expect(stableHandlers.duplicateSelected).toHaveBeenCalledOnce();
    expect(stableHandlers.reorder).toHaveBeenNthCalledWith(1, "front");
    expect(stableHandlers.reorder).toHaveBeenNthCalledWith(2, "back");
    expect(stableHandlers.removeSelected).toHaveBeenCalledOnce();
    expect(setSelectedId).toHaveBeenCalledWith(null);
    expect(setMarqueeIds).toHaveBeenCalledWith([]);
  });
});
