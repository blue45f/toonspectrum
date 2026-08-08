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
import type {
  StudioMainMenuSurfaceActions,
  StudioMainMenuSurfaceState,
} from "./studio-main-menu-surface-contract";
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

export interface StudioMainMenuBuilderState extends StudioMainMenuSurfaceState {
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
  /** Selected layer already clips into the one below it (`clipBelow`). */
  clippingMaskActive: boolean;
  /** No single clippable element is selected, so the clipping toggle has no target. */
  clippingMaskDisabled: boolean;
  /** An image layer is selected, so its mask and adjustment panels have a target. */
  imageLayerSelected: boolean;
  /**
   * §15.3 Help ▸ Current Tool Help — the catalog command id of whatever owns the
   * canvas pointer right now (`studio-current-tool-help.ts` resolves it). `null`
   * when the host cannot tell; the help surface then says so instead of guessing.
   */
  activeToolCommandId: string | null;
  /** 다중 레이어 타임라인이 열려 있는지 — View 메뉴의 토글 체크 상태. */
  animationTimelineOpen: boolean;
  /**
   * 마스터 편집 중인지. 히스토리 스크러빙을 쓰는 표면(타임라인)은 이때 열 수 없다 —
   * 툴벨트가 쓰던 것과 같은 게이트다(`StudioToolBeltContent.tsx`).
   */
  masterEditMode: boolean;
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
  /** Flips `clipBelow` on the selected layer — the inspector checkbox's command path. */
  toggleClippingMask: () => unknown;
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

export interface StudioMainMenuUiActions extends StudioMainMenuSurfaceActions {
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
  /**
   * 검수·미리보기 3종. 원래 툴벨트에만 있었고 벨트 호스트가 전 뷰포트에서
   * `display:none`이라 도달 불가였다 — `studio-project-review-actions.ts` 주석 참조.
   * 벨트와 같은 패널 상태를 열어야 두 진입점이 갈라지지 않는다.
   */
  toggleAnimationTimeline: () => unknown;
  openScrollPreview: () => unknown;
  openStoryboardGrid: () => unknown;
  collapseSidePanels: () => unknown;
  openToolsCompanion: () => unknown;
  toggleQuickAccessPalette: () => unknown;
  toggleLeftPanel: () => unknown;
  toggleRightPanel: () => unknown;
  openShortcuts: () => unknown;
  selectDrawMode: (mode: Extract<DrawMode, "pen" | "eraser">) => unknown;
  enableSmartShape: () => unknown;
  /** Free-transform / pixel-selection transform, whatever the selection turns out to be. */
  activateTransformTool: () => unknown;
  /** Inspector 보정 섹션 — where Levels and the tone curve actually live. */
  openImageAdjustments: () => unknown;
  /** Inspector 마스크 섹션. */
  openLayerMask: () => unknown;
  /** §15.3 Brush ▸ Preset Browser — the searchable built-in brush catalogue. */
  openBrushPresetBrowser: () => unknown;
  /** §15.3 Brush ▸ Brush Studio — the dynamics editor inside the inspector. */
  openBrushStudio: () => unknown;
  /** The saved "내 브러시" library, whose import control accepts ABR/MYB/KPP. */
  openBrushLibrary: () => unknown;
  /** §15.3 Brush ▸ Import — opens the ABR/MYB/KPP/JSON picker with no detour. */
  requestBrushPackImport: () => unknown;
  /** §15.3 Brush ▸ Natural Media — the hokusai natural-media engines section. */
  openNaturalMediaBrushes: () => unknown;
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
