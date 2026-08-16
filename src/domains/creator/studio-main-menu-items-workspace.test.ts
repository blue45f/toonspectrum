import { describe, expect, it, vi } from "vitest";

import { buildStudioWindowMenuItems } from "./studio-main-menu-items-workspace";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditAvailability,
  StudioMainMenuEditorActions,
  StudioMainMenuItem,
  StudioMainMenuItemContext,
  StudioMainMenuUiActions,
} from "./studio-main-menu-contract";

const AVAILABLE_EDIT: StudioMainMenuEditAvailability = {
  undoDisabled: false,
  redoDisabled: false,
  cutDisabled: false,
  copyDisabled: false,
  pasteDisabled: false,
  selectAllDisabled: false,
  deselectDisabled: false,
  invertSelectionDisabled: false,
  clearSelectionDisabled: false,
  duplicateDisabled: false,
  reorderDisabled: false,
  cropLayerDisabled: false,
};

const BASE_STATE: StudioMainMenuBuilderState = {
  sharedNonOwnerSave: false,
  saving: false,
  collaborationDocumentLocked: false,
  hasWorkId: false,
  projectArchiveBusy: false,
  interchangeImportBusy: false,
  psdImportBusy: false,
  edit: AVAILABLE_EDIT,
  filterDisabled: false,
  filterUnavailableReason: null,
  viewTransformSuppressed: false,
  canvasFlipH: false,
  canvasRotation: 0,
  fullscreen: false,
  canvasRulersVisible: true,
  colorVisionMode: "none",
  referencePanelOpen: false,
  pageSequenceOpen: false,
  hasSavedView: false,
  perspectiveRulerActive: false,
  hasLocallyHiddenLayers: false,
  quickAccessPaletteOpen: false,
  quickAccessPaletteLoading: false,
  leftPanelOpen: true,
  rightPanelOpen: true,
  lastFilterDraft: null,
  clippingMaskActive: false,
  clippingMaskDisabled: false,
  imageLayerSelected: false,
  activeToolCommandId: "tool.pen",
  pixelSelectionTool: null,
  quickMaskActive: false,
  animationTimelineOpen: false,
  onionSkinEnabled: false,
  documentCommentsOpen: false,
  canvasGridVisible: false,
  vectorEraseToIntersection: false,
  masterEditMode: false,
};

type StudioMainMenuActionsOverrides = {
  collapseSidePanels?: ReturnType<typeof vi.fn>;
  expandSidePanels?: ReturnType<typeof vi.fn>;
};

const noopActions: StudioMainMenuEditorActions = new Proxy({} as StudioMainMenuEditorActions, {
  get: () => vi.fn(),
});

function buildWindowItems(
  stateOverrides: Partial<StudioMainMenuBuilderState> = {},
  uiOverrides: StudioMainMenuActionsOverrides = {},
): { items: readonly StudioMainMenuItem[]; ui: Record<string, ReturnType<typeof vi.fn>> } {
  const collapseSidePanels = vi.fn();
  const expandSidePanels = vi.fn();
  const ui = {
    collapseSidePanels,
    expandSidePanels,
    ...uiOverrides,
  } as unknown as StudioMainMenuUiActions;

  const context: StudioMainMenuItemContext = {
    state: {
      ...BASE_STATE,
      ...stateOverrides,
    },
    editor: noopActions,
    ui,
  };

  return {
    items: buildStudioWindowMenuItems(context),
    ui: { collapseSidePanels, expandSidePanels },
  };
}

function getWideItem(items: readonly StudioMainMenuItem[]): StudioMainMenuItem {
  const item = items.find((candidate) => candidate.id === "wide");
  if (!item) throw new Error("missing window wide menu item");
  return item;
}

describe("window 패널 확장/축소 메뉴", () => {
  it("접은 상태일 때는 패널 펼치기로 표시하고 expandSidePanels를 실행한다", () => {
    const { items, ui } = buildWindowItems({
      leftPanelOpen: false,
      rightPanelOpen: false,
      visibleLeftPanelOpen: false,
      visibleRightPanelOpen: false,
    });
    const wide = getWideItem(items);

    expect(wide.label).toBe("패널 펼치기");
    expect(wide.checked).toBe(true);

    wide.onSelect();

    expect(ui.expandSidePanels).toHaveBeenCalledTimes(1);
    expect(ui.collapseSidePanels).toHaveBeenCalledTimes(0);
  });

  it("패널이 보이면 접어 넓게로 표시하고 collapseSidePanels를 실행한다", () => {
    const { items, ui } = buildWindowItems({
      leftPanelOpen: true,
      rightPanelOpen: true,
      visibleLeftPanelOpen: true,
      visibleRightPanelOpen: true,
    });
    const wide = getWideItem(items);

    expect(wide.label).toBe("패널 접어 넓게");
    expect(wide.checked).toBe(false);

    wide.onSelect();

    expect(ui.collapseSidePanels).toHaveBeenCalledTimes(1);
    expect(ui.expandSidePanels).toHaveBeenCalledTimes(0);
  });

  it("presentation 패널 숨김 모드에서는 액션을 비활성화한다", () => {
    const { items, ui } = buildWindowItems({
      presentationPanelsHidden: true,
      leftPanelOpen: true,
      rightPanelOpen: true,
      visibleLeftPanelOpen: true,
      visibleRightPanelOpen: true,
    });
    const wide = getWideItem(items);

    expect(wide.disabled).toBe(true);
    expect(wide.unavailableReason).toBe("전체화면·브라우저 맞춤에서는 작업 패널을 임시로 숨깁니다.");

    wide.onSelect();

    expect(ui.collapseSidePanels).toHaveBeenCalledTimes(0);
    expect(ui.expandSidePanels).toHaveBeenCalledTimes(0);
  });
});
