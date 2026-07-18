// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioMobileEditingDock,
  type StudioMobileEditingDockHandlers,
  type StudioMobileEditingDockProps,
} from "./StudioMobileEditingDock";

import type { NormalizedStudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import type { StudioBrushSnapshot } from "./studio-brush-library";
import type { StudioProDrawPrefs } from "./studio-pro-draw-prefs";
import type { StudioWorkspaceState } from "./studio-workspaces";

interface MockDockButtonProps {
  readonly "aria-label"?: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick?: () => void;
}

vi.mock("./studio-chrome-ui", () => ({
  StudioContextActionButton: ({ label, disabled, onClick }: MockDockButtonProps) => (
    <button type="button" disabled={disabled} onClick={onClick}>{label}</button>
  ),
  StudioDockButton: ({
    "aria-label": ariaLabel,
    label,
    disabled,
    onClick,
  }: MockDockButtonProps) => (
    <button type="button" aria-label={ariaLabel ?? label} disabled={disabled} onClick={onClick}>
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

vi.mock("./StudioMobileSheetHandle", () => ({
  StudioMobileSheetHandle: () => null,
}));

vi.mock("./StudioSavedBrushShelf", () => ({
  StudioSavedBrushShelf: () => null,
}));

function createHandlers(): StudioMobileEditingDockHandlers {
  return {
    applyBuiltInBrushPreset: vi.fn(),
    applyDynamicsPreset: vi.fn(),
    applySavedBrush: vi.fn(),
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
    brushCatalogOpen: false,
    brushDynamics: {} as NormalizedStudioBrushDynamicsSettings,
    brushManagerSheetRef: { current: null },
    brushOpacity: 1,
    collaborationDocumentLocked: false,
    color: "#111111",
    currentBrushSnapshot: {} as StudioBrushSnapshot,
    dismissBrushManager: vi.fn(),
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
});
