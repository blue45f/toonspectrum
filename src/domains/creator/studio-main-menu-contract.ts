/**
 * Host contract for the main-menu catalogue.
 *
 * Split out of `studio-main-menu-groups.ts` when the catalogue was regrouped to
 * V5 §15.3 (17 groups): the per-group item modules need these types, and keeping
 * them here is what stops `groups → items → groups` from becoming a cycle.
 *
 * Pure types only — no React, no browser, no page state.
 */

import type { CvdMode } from "./studio-color-vision-model";
import type { DrawMode, StudioMenu } from "./studio-editor-tool-model";
import type { StudioFilterDraft, StudioFilterKind } from "./studio-filter-menu";
import type { StudioUiDensityMode } from "./studio-ui-density";
import type { StudioViewRotation } from "./studio-view-controls";

export type StudioSaveMode = "draft" | "published";
export type StudioPastePlacement = "cascade" | "in-place";
export type StudioLayerReorder = "front" | "forward" | "back" | "backward";
export type StudioCanvasRotationDirection = "left" | "right";
export type StudioAppSettingsTab = "general" | "other";

export interface StudioMainMenuEditAvailability {
  undoDisabled: boolean;
  redoDisabled: boolean;
  cutDisabled: boolean;
  copyDisabled: boolean;
  pasteDisabled: boolean;
  selectAllDisabled: boolean;
  deselectDisabled: boolean;
  invertSelectionDisabled: boolean;
  clearSelectionDisabled: boolean;
  duplicateDisabled: boolean;
  reorderDisabled: boolean;
  cropLayerDisabled: boolean;
}

export interface StudioMainMenuBuilderState {
  sharedNonOwnerSave: boolean;
  saving: boolean;
  collaborationDocumentLocked: boolean;
  hasWorkId: boolean;
  projectArchiveBusy: boolean;
  interchangeImportBusy: boolean;
  psdImportBusy: boolean;
  edit: StudioMainMenuEditAvailability;
  filterDisabled: boolean;
  filterUnavailableReason: string | null;
  viewTransformSuppressed: boolean;
  canvasFlipH: boolean;
  canvasRotation: StudioViewRotation;
  fullscreen: boolean;
  canvasRulersVisible: boolean;
  colorVisionMode: CvdMode;
  referencePanelOpen: boolean;
  pageSequenceOpen: boolean;
  hasSavedView: boolean;
  perspectiveRulerActive: boolean;
  hasLocallyHiddenLayers: boolean;
  quickAccessPaletteOpen: boolean;
  quickAccessPaletteLoading: boolean;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  lastFilterDraft: StudioFilterDraft | null;
}

export interface StudioMainMenuEditorActions {
  copyImageToClipboard: () => unknown;
  save: (mode: StudioSaveMode) => unknown;
  exportProject: () => unknown;
  exportProjectArchive: () => unknown;
  undo: () => unknown;
  redo: () => unknown;
  cutSelectedElements: () => unknown;
  copySelectedElements: () => unknown;
  pasteElements: (placement: StudioPastePlacement) => unknown;
  openImagePastePicker: () => unknown;
  selectAll: () => unknown;
  deselect: () => unknown;
  invertSelection: () => unknown;
  clearSelection: () => unknown;
  duplicateSelected: () => unknown;
  reorder: (placement: StudioLayerReorder) => unknown;
  openSelectedLayerCrop: () => unknown;
  addText: () => unknown;
  addPage: () => unknown;
  toggleHorizontalCanvasView: () => unknown;
  rotateCanvasView: (direction: StudioCanvasRotationDirection) => unknown;
  resetCanvasViewRotation: () => unknown;
  fitCanvasToWidth: () => unknown;
  setActualPixelView: () => unknown;
  toggleFullscreen: () => unknown;
  toggleCanvasRulers: () => unknown;
  setColorVisionMode: (mode: CvdMode) => unknown;
  saveCurrentStudioView: () => unknown;
  restoreSavedStudioView: () => unknown;
  togglePerspectiveGuideView: () => unknown;
  showAllLocallyHiddenLayers: () => unknown;
  setStudioUiDensity: (mode: StudioUiDensityMode) => unknown;
  enterCanvasOnlyMode: () => unknown;
  openFeatureTutorial: () => unknown;
  openStudioFilter: (
    kind: StudioFilterKind,
    draft?: StudioFilterDraft,
  ) => unknown;
  toggleAdvancedFill: () => unknown;
}

export interface StudioMainMenuUiActions {
  openExportDownload: () => unknown;
  requestProjectImport: () => unknown;
  requestInterchangeImport: () => unknown;
  requestPsdImport: () => unknown;
  openProjectTools: () => unknown;
  toggleHistoryPanel: () => unknown;
  openAppSettings: (tab?: StudioAppSettingsTab) => unknown;
  openStudioMenu: (menu: StudioMenu) => unknown;
  openAssetMenu: () => unknown;
  requestImageInsert: () => unknown;
  openMannequinPoser: () => unknown;
  openVrmPoser: () => unknown;
  openBackground3d: () => unknown;
  openReferencePanel: () => unknown;
  stepZoom: (direction: -1 | 1) => unknown;
  toggleReferencePanel: () => unknown;
  togglePageSequence: () => unknown;
  openProductionInsights: () => unknown;
  collapseSidePanels: () => unknown;
  openToolsCompanion: () => unknown;
  toggleQuickAccessPalette: () => unknown;
  toggleLeftPanel: () => unknown;
  toggleRightPanel: () => unknown;
  openShortcuts: () => unknown;
  selectDrawMode: (mode: Extract<DrawMode, "pen" | "eraser">) => unknown;
  enableSmartShape: () => unknown;
}

/** What every per-group item module receives. Read-only projection of the host. */
export interface StudioMainMenuItemContext {
  readonly state: StudioMainMenuBuilderState;
  readonly editor: StudioMainMenuEditorActions;
  readonly ui: StudioMainMenuUiActions;
}

export interface BuildStudioMainMenuGroupsInput {
  state: StudioMainMenuBuilderState;
  editor: StudioMainMenuEditorActions;
  ui: StudioMainMenuUiActions;
  t: (key: string) => string;
}
