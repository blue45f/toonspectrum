import { describe, expect, it, vi } from "vitest";

import {
  buildStudioBrushMenuItems,
  studioBrushLabHref,
} from "./studio-main-menu-items-brush";

import type {
  StudioMainMenuBuilderState,
  StudioMainMenuEditAvailability,
  StudioMainMenuEditorActions,
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
  imageLayerSelected: true,
  activeToolCommandId: "tool.pen",
  pixelSelectionTool: null,
  quickMaskActive: false,
  animationTimelineOpen: false,
  onionSkinEnabled: false,
  documentCommentsOpen: false,
  canvasGridVisible: false,
  vectorEraseToIntersection: false,
  masterEditMode: false,
  pixelArtEnabled: false,
};

describe("buildStudioBrushMenuItems", () => {
  it("exposes pixel-art, silk and both simple/expert brush studio entries", () => {
    const ui = {
      togglePixelArtMode: vi.fn(),
      enableSilkSymmetry: vi.fn(),
      openBrushStudio: vi.fn(),
    } as unknown as StudioMainMenuUiActions;
    const editor = {} as StudioMainMenuEditorActions;
    const items = buildStudioBrushMenuItems({
      state: BASE_STATE,
      editor,
      ui,
    });

    const pixel = items.find((item) => item.id === "pixel-art");
    const silk = items.find((item) => item.id === "silk-flow");
    const studio = items.find((item) => item.id === "brush-studio");
    const lab = items.find((item) => item.id === "brush-lab");
    expect(pixel?.commandId).toBe("brush.pixel-art");
    expect(pixel?.label).toBe("픽셀 아트");
    expect(pixel?.selectionRole).toBe("checkbox");
    expect(silk?.commandId).toBe("brush.silk-flow");
    expect(studio?.commandId).toBe("brush.studio");
    expect(studio?.label).toBe("현재 브러시 세부 설정…");
    expect(lab?.label).toBe("목적별 브러시 제작실…");

    pixel?.onSelect();
    silk?.onSelect();
    studio?.onSelect();
    expect(ui.togglePixelArtMode).toHaveBeenCalledTimes(1);
    expect(ui.enableSilkSymmetry).toHaveBeenCalledTimes(1);
    expect(ui.openBrushStudio).toHaveBeenCalledTimes(1);
  });

  it("keeps work and remix context when opening the dedicated Brush Studio", () => {
    expect(studioBrushLabHref("/studio")).toBe("/studio/brush-lab");
    expect(studioBrushLabHref("/studio/canvas")).toBe("/studio/brush-lab");
    expect(studioBrushLabHref("/studio/work/work-42/canvas")).toBe(
      "/studio/work/work-42/brush-lab",
    );
    expect(studioBrushLabHref("/studio/remix/source-7/canvas")).toBe(
      "/studio/remix/source-7/brush-lab",
    );
  });

  it("checks the pixel-art row when the host has the mode on", () => {
    const items = buildStudioBrushMenuItems({
      state: { ...BASE_STATE, pixelArtEnabled: true },
      editor: {} as StudioMainMenuEditorActions,
      ui: { togglePixelArtMode: vi.fn() } as unknown as StudioMainMenuUiActions,
    });
    const pixel = items.find((item) => item.id === "pixel-art");
    expect(pixel?.checked).toBe(true);
    expect(pixel?.label).toBe("픽셀 아트 끄기");
  });
});
