/* Extracted render tree from StudioCuttoonEditor.
 * Session props are an `any` bag matching the original editor closure. */
// @ts-nocheck
import { Maximize2, Lock, MessageCircle, UsersRound, SlidersHorizontal, Undo2 } from "lucide-react";
import { Suspense } from "react";

import { resolveStudioPaperGrainVisibleV1 } from "../brush/studio-paper-grain-visibility-v1";
import { STUDIO_BRUSH_PACK_ACCEPT } from "../brush/studio-brush-pack-format";
import { StudioBrushHud } from "../brush/StudioBrushHud";
import { isStudioBrushCursorMode } from "../canvas/studio-canvas-cursor";
import { StudioCanvasContextMenu } from "../canvas/StudioCanvasContextMenu";
import { StudioCanvasViewport } from "../canvas/StudioCanvasViewport";
import { StudioHybridDccRouteGate } from "../hybrid-dcc/StudioHybridDccRouteGate";
import { StudioLiveCollaborationProvider } from "../live/StudioLiveCollaborationProvider";
import { hasActiveImageFilters } from "../render/studio-konva-filter-fields";
import { CANVAS_W } from "../studio-assets";
import {
  preloadStudioBackground3D,
} from "../studio-background-3d-loader";
import { parseStudio3dTool } from "../studio-background-3d-metadata";
import {
  STUDIO_ICON_SIZE,
  STUDIO_ICON_STROKE,
  StudioAppMenubar,
  StudioEdgeRailButton,
  StudioToolBelt,
  studioChromeIconClass,
} from "../studio-chrome-ui";
import { LazyStudioInspectorAside } from "../studio-inspector-aside-loader";
import { isEffectivelyLocked } from "../studio-layers";
import {
  STUDIO_CANVAS_IMAGE_ACCEPT,
  createStudioPixelEditCanvas,
  encodeStudioPixelEditResultPng,
  loadStudioPixelEditImage,
} from "../studio-legacy-editor-runtime-helpers";
import { StudioInspectorAsideFallback } from "../studio-mobile-dock-presets";
import { STUDIO_MOBILE_EDITING_DOCK_UI } from "../studio-mobile-dock-presets-config";
import { StudioMobileEditingDock } from "../studio-mobile-editing-dock-loader";
import {
  STUDIO_INTERCHANGE_IMPORT_PLACEMENT_CHOICES,
  STUDIO_WILL_V1_IMPORT_PLACEMENT_CHOICES,
} from "../studio-page-editor-runtime-contracts";
import {
  StudioBrushCatalogPortal,
  StudioCreativeCompetitorModesPanel,
  StudioFilterDialog,
  StudioLayerLiftDialog,
  StudioPublishContextBanner,
  StudioCommentThreadPopover,
  StudioPointCommentComposer,
  StudioCanvasRulerBars,
} from "../studio-page-lazy-ui";
import {
  LazyStudioAnimaticTimelineDialog,
  LazyStudioAssetRightsAuditDialog,
  LazyStudioHybridDccDialog,
  LazyStudioInterchangeLossPreviewDialog,
  LazyStudioLeftToolRail,
  LazyStudioMenubarContent,
  LazyStudioPageListPane,
  LazyStudioProductionBibleWorkspace,
  LazyStudioQuickAccessSurface,
  LazyStudioQuickComicWizard,
  LazyStudioSceneSnapshotDialog,
} from "../studio-page-modal-lazy-boundaries";
import { STUDIO_TRANSIENT_PEN_INK_SURFACE_ENABLED } from "../studio-page-shell-runtime";
import { studioPathBooleanUnavailableReason } from "../studio-path-boolean";
import { canRedoPixelSelectionHistory, canUndoPixelSelectionHistory } from "../studio-pixel-selection-session-history";
import { STUDIO_PROJECT_MAX_PAGES } from "../studio-project-file";
import {
  commitStudioSelectionFilterMaskTransaction,
} from "../studio-selection-filter-mask-transaction";
import { StudioDestructiveConfirmHost } from "../StudioDestructiveConfirmHost";
import { StudioHelpCenterHost } from "../StudioHelpCenterHost";
import { StudioLazyPanelStack } from "../StudioLazyPanelStack";
import { StudioOptionsBars } from "../StudioOptionsBars";
import { StudioPanelResizeHandle } from "../StudioPanelResizeHandle";
import { StudioScrollViewportSubscriber } from "../StudioScrollViewportSubscriber";
import { StudioSelectionContextBar } from "../StudioSelectionContextBar";
import { StudioSurfaceErrorBoundary } from "../StudioSurfaceErrorBoundary";
import { StudioToolBeltContent } from "../StudioToolBeltContent";
import {
  StudioToolHintPreferencesProvider,
  StudioToolHintTarget,
} from "../StudioToolHint";
import { StudioVrmProjectArchiveAttestationHost } from "../vrm/StudioVrmProjectArchiveAttestationHost";

import type { El, ImageEl } from "../studio-element-model";

import { Container } from "@/components/container";
import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

export type StudioCuttoonEditorViewSession = {
  activatePrimaryCanvasTool: any;
  activeCatalogBrush: any;
  activeCommentAnchor: any;
  activeDialogueLocale: any;
  activeGroupId: any;
  activePage: any;
  activePageIndex: any;
  activeSavedBrushId: any;
  activeServerAiProviderLabel: any;
  activeSurfaceReviewLocked: any;
  activeToolbarGroup: any;
  addBubble: any;
  addPage: any;
  addText: any;
  admittedBg3dOpen: any;
  admittedMannequinPoserOpen: any;
  admittedPoserVrmOpen: any;
  advancedFillActive: any;
  advancedFillArmed: any;
  advancedFillBusy: any;
  advancedFillPreview: any;
  advancedFillReferenceLayerCount: any;
  advancedFillSettings: any;
  advancedFillStatus: any;
  advancedFillUnsupportedReason: any;
  advancedFillVisibleRasterCount: any;
  advancedRulers: any;
  aiAssistTool: any;
  aiBgBusy: any;
  aiBgError: any;
  aiBgPrompt: any;
  aiBgSize: any;
  aiCharacterBusy: any;
  aiCharacterError: any;
  aiCharacterPrompt: any;
  aiColorizeBusy: any;
  aiColorizeError: any;
  aiColorizePrompt: any;
  aiCompositionDraft: any;
  aiDialogueSuggestBusy: any;
  aiDialogueSuggestCandidates: any;
  aiDialogueSuggestError: any;
  aiDialogueSuggestIncludeContext: any;
  aiDialogueSuggestSituation: any;
  aiNoticeOpen: any;
  aiPaletteSuggestBusy: any;
  aiPaletteSuggestError: any;
  aiPaletteSuggestMood: any;
  aiPaletteSuggestSavedMsg: any;
  aiPaletteSuggestion: any;
  aiProvenance: any;
  aiProvenanceOpen: any;
  aiRecentPrompts: any;
  aiSettings: any;
  animTimeline: any;
  animaticTimelineOpen: any;
  announceDrawingShortcut: any;
  appSettings: any;
  appSettingsInitialTab: any;
  appSettingsOpen: any;
  appSettingsPersistenceState: any;
  applyExtendedBlendMergeDown: any;
  applyPaperVectorRefinement: any;
  applyPathBooleanCombine: any;
  applyPendingInterchangeImport: any;
  applyPixelSelectionHistoryCommand: any;
  applyQuickComicInput: any;
  applySceneSnapshot: any;
  applyStudioBrushCatalogSelection: any;
  applyStudioLayerLift: any;
  assetFavoriteOnly: any;
  assetFavoriteState: any;
  assetGenerating: any;
  assetPrompt: any;
  assetPromptName: any;
  assetPromptQuality: any;
  assetPromptSize: any;
  assetRightsAuditOpen: any;
  assetSearchQuery: any;
  assetSortOrder: any;
  assetTab: any;
  assets: any;
  assetsLoaded: any;
  assetsLoading: any;
  authorizedWorkAssetScopeId: any;
  autoActionBusy: any;
  autoActionError: any;
  autoActionPlan: any;
  autoActionProgress: any;
  autoActionScope: any;
  autoActionSelectedPageIds: any;
  autoActionSet: any;
  autoActionStatus: any;
  autoActionsOpen: any;
  autoColorCanvasSeedHit: any;
  autoColorCanvasSeedHits: any;
  autoColorPlanImageSizeRef: any;
  autoColorScribbleCanvasArmed: any;
  autosaveRestoreBlockedReason: any;
  bg3dBatchRecoveryScope: any;
  bg3dDccShotMappingsRef: any;
  bg3dDccSourceRef: any;
  bg3dInitialDataUrl: any;
  bg3dInitialElementId: any;
  bg3dInitialScene: any;
  bg3dOpen: any;
  bg3dSeedPrimitiveKind: any;
  bg3dSeedTemplateId: any;
  bg3dTargetBundleId: any;
  bgGrad: any;
  bgSceneGenreFilter: any;
  bgSceneSearchQuery: any;
  bgSceneSectionsFiltered: any;
  brush: any;
  brushBaselineController: any;
  brushCatalogSession: any;
  brushCursorRef: any;
  brushDynamics: any;
  brushManagerSheetRef: any;
  brushOpacity: any;
  brushPackImportInputRef: any;
  brushPackImporting: any;
  brushUndoButtonRef: any;
  brushUndoToastRef: any;
  bubbleAnchorPickActive: any;
  bubbleShapeActiveHandleIndex: any;
  bubbleShapeArmed: any;
  bubbleShapeDraft: any;
  bubbleShapeEditActive: any;
  bubbleShapeHandles: any;
  bubbleShapeSelectedPointIndex: any;
  builtinRasterBusyId: any;
  canApplyStudioMutation: any;
  cancelPaperVectorRefinement: any;
  cancelStudioPointCommentComposer: any;
  canvasFlipH: any;
  canvasGuides: any;
  canvasH: any;
  canvasInteractionBlocked: any;
  canvasOnlyMode: any;
  canvasRotation: any;
  captureStudioMutationTicket: any;
  changeStudioCommentThreadReplyDraft: any;
  changeStudioCommentThreadResolution: any;
  changeStudioQuickAccessState: any;
  changeStudioSymmetryType: any;
  characterBible: any;
  characterBibleOpen: any;
  checkpointError: any;
  checkpointPanelOpen: any;
  checkpoints: any;
  clearStudioObjectInsertSeeds: any;
  clips: any;
  closeStudioCommentThreadPopover: any;
  closeStudioFilterDialog: any;
  closeStudioLayerLift: any;
  closeViewToolWithFocus: any;
  collaborationDocumentLocked: any;
  collaborationDocumentUnavailable: any;
  collaborationLockMessage: any;
  collaborationOperationSyncPending: any;
  collaborationReadOnly: any;
  collaborationRoleLabel: any;
  color: any;
  colorBlindPreview: any;
  colorRangeFuzziness: any;
  colorRangePickActive: any;
  colorRangePreviewEnabled: any;
  colorRangeSamples: any;
  colorVisionSheetRef: any;
  colorWheelCenter: any;
  colorWheelOpen: any;
  commentPinArmed: any;
  commentPlacementActive: any;
  commentsOpen: any;
  commentsPanelMounted: any;
  commit: any;
  commitPixelSelectionState: any;
  commitQuickMask: any;
  commitSavedBrushProjection: any;
  completeSelectedGroupId: any;
  composeWorkAssetPreviewPage: any;
  configuredServerAiProviders: any;
  contextMenu: any;
  contextMenuBg3dEditSource: any;
  contextMenuEl: any;
  continuityIssues: any;
  continuityOpen: any;
  continuityScenes: any;
  correctStudioLayerLift: any;
  creativeModesCloseLabel: any;
  creativeModesLabel: any;
  creativeModesOpen: any;
  creativeModesPanelRef: any;
  creativeModesTriggerRef: any;
  cropArmed: any;
  cropAspect: any;
  cropBusy: any;
  cropRect: any;
  currentBrushSnapshot: any;
  currentCanvasSelectionCount: any;
  currentPageId: any;
  currentPageIdRef: any;
  currentPublishPackageCreditsText: any;
  currentStudioFilterPageRasterContext: any;
  currentStudioWorkspaceDeviceKind: any;
  currentTemplate: any;
  currentWorkspaceOwnerScope: any;
  description: any;
  dialogueBatchOpen: any;
  dialogueScript: any;
  dialogueTranslateOpen: any;
  dismissActiveMobileSheet: any;
  dismissPendingInterchangeImport: any;
  displayLinkedTitleId: any;
  document: any;
  dodgeBurnActive: any;
  dodgeBurnArmed: any;
  dodgeBurnBusy: any;
  dodgeBurnExposure: any;
  dodgeBurnHardness: any;
  dodgeBurnMode: any;
  dodgeBurnRadius: any;
  dodgeBurnRange: any;
  dodgeBurnSponge: any;
  draftCollaboration: any;
  draftPreviewDynamicLayerRef: any;
  draftPreviewNormalLayerRef: any;
  draftPreviewStore: any;
  drawMode: any;
  drawShape: any;
  drawSheetRef: any;
  drawingPaletteCancelEpoch: any;
  drawingPaletteLayout: any;
  drawingRef: any;
  duplicateSelected: any;
  editMenuImageInputRef: any;
  editing: any;
  effScale: any;
  effectFavoriteState: any;
  effectivePublishPackageSettings: any;
  effectiveWorkId: any;
  elementById: any;
  elements: any;
  emeresCategoryFilter: any;
  emeresFlatCatalog: any;
  emeresSearchQuery: any;
  emeresSectionsFiltered: any;
  emeresSimilarAnchor: any;
  emeresSimilarSiblings: any;
  emeresTab: any;
  emeresUnderlayCount: any;
  enterQuickMask: any;
  eraseToIntersection: any;
  error: any;
  executeStudioQuickAccessCommand: any;
  exitQuickMask: any;
  expectsSharedDocument: any;
  exportFormat: any;
  exportMenuOpen: any;
  exportMenuRef: any;
  exportPresetId: any;
  exportScale: any;
  exportTransparent: any;
  extendedBlendMode: any;
  extendedBlendOpacity: any;
  eyedropperActive: any;
  filterClipboard: any;
  filterMaskBusy: any;
  filterMaskCursorRef: any;
  filterMaskDragPreview: any;
  filterMaskHardness: any;
  filterMaskPaintActive: any;
  filterMaskPaintArmed: any;
  filterMaskPaintMode: any;
  filterMaskRadius: any;
  filterMaskStrength: any;
  followingStudioSessionId: any;
  frameAnimEl: any;
  frameAnimOpen: any;
  frameAnimTargetId: any;
  fxComicFiltered: any;
  fxCreatureFiltered: any;
  fxEmojisFiltered: any;
  fxLinePresetsFiltered: any;
  fxOverlaysFiltered: any;
  fxPanelLoading: any;
  fxPanelOpen: any;
  fxPickerHasResults: any;
  fxPickerSection: any;
  fxPropFiltered: any;
  fxQuery: any;
  fxRasterFiltered: any;
  fxSearchQuery: any;
  fxSectionVisible: any;
  fxSfxFiltered: any;
  gpuCanvasShadowVisibleRef: any;
  gpuLiveInkPinnedRef: any;
  gridSize: any;
  groups: any;
  guides: any;
  handleBrushPackImportFromMenu: any;
  handleImportInterchangeArchive: any;
  handleImportProject: any;
  handleImportProjectArchive: any;
  handleImportPsd: any;
  handleStudioCrdtAuthoritativeSaveBarrierChange: any;
  handleStudioCrdtDocumentChange: any;
  handleStudioLiveEditSafetyChange: any;
  handleStudioLiveRoomChange: any;
  hardCanvasInteractionBlock: any;
  hasAutosave: any;
  healCloneAligned: any;
  healCloneArmed: any;
  healCloneBusy: any;
  healCloneCursorRef: any;
  healCloneDragPreview: any;
  healCloneHardness: any;
  healCloneOpacity: any;
  healCloneRadius: any;
  healCloneSourceAnchor: any;
  healCloneSourceCursorRef: any;
  healCloneTool: any;
  history: any;
  historyBrushActive: any;
  historyBrushArmed: any;
  historyBrushBusy: any;
  historyBrushCursorRef: any;
  historyBrushDragPreview: any;
  historyBrushHardness: any;
  historyBrushOpacity: any;
  historyBrushRadius: any;
  historyBrushSourceIndex: any;
  historyBrushSourceSrc: any;
  historyPanelOpen: any;
  hybridDccOpen: any;
  hybridDccPersistenceStatus: any;
  hybridDccReturnFocusRef: any;
  hybridDccRouteAccess: any;
  hybridDccRouteRequested: any;
  hybridDccWorkspaceDocumentId: any;
  hybridDccWorkspaceScope: any;
  inkMeshLivePreviewRuntime: any;
  insertStudioStickyNote: any;
  inspectorLayout: any;
  interchangeImportBusy: any;
  interchangeImportChoice: any;
  interchangeImportInputRef: any;
  interchangeImportStatus: any;
  invertQuickMask: any;
  isExporting: any;
  isFullscreen: any;
  isLatestLayerContentMutationLocked: any;
  isMobile: any;
  isPanning: any;
  isRailToolVisible: any;
  isSpacePressed: any;
  isStudioCommentAnchorValid: any;
  isometricAngleDeg: any;
  isometricCellSize: any;
  isometricGridActive: any;
  isometricOriginX: any;
  isometricOriginY: any;
  layerMaskBusy: any;
  layerMaskCursorRef: any;
  layerMaskDragPreview: any;
  layerMaskHardness: any;
  layerMaskPaintActive: any;
  layerMaskPaintArmed: any;
  layerMaskPaintMode: any;
  layerMaskRadius: any;
  layerMaskStrength: any;
  layerMergeBusy: any;
  layerNavigatorItems: any;
  layerSoloState: any;
  leftResize: any;
  liquifyActive: any;
  liquifyArmed: any;
  liquifyBusy: any;
  liquifyMode: any;
  liquifyPreviewImageRef: any;
  liquifyRadius: any;
  liquifyStrength: any;
  liveDraftDirectRef: any;
  liveDraftLayerRef: any;
  liveDraftShapeKind: any;
  liveDraftVisualRef: any;
  liveDrawPressureStore: any;
  liveDynamicBrushOverlayRenderer: any;
  liveInkOverlayRenderer: any;
  liveInkOverlayRendererRef: any;
  liveInkPredictionRenderer: any;
  liveRetainedMediaOverlayRenderer: any;
  liveStampOverlayRenderer: any;
  liveWetInkOverlayRenderer: any;
  liveWorkspaceLayout: any;
  livingInkOverlayVisibleRef: any;
  loadedWork: any;
  localHiddenElementIds: any;
  location: any;
  loggedIn: any;
  macroSession: any;
  magicResizeStrategy: any;
  mainLayerRef: any;
  mannequinPoserOpen: any;
  marqueeIds: any;
  marqueeIdsRef: any;
  marqueeRectNodeRef: any;
  master: any;
  masterEditMode: any;
  masterPanelOpen: any;
  masterRenderEls: any;
  maximized: any;
  menu: any;
  menuFilterDisabled: any;
  menuRef: any;
  metaEditPageId: any;
  mobileBrushDockButtonRef: any;
  mobileImmersive: any;
  mobileInspectorSnap: any;
  mobileKeyboardInset: any;
  mobileQuickActionsButton: any;
  mobileSelectionLocked: any;
  mobileSheet: any;
  modalMobileSheet: any;
  name: any;
  navigate: any;
  navigateStudioCommentPinCluster: any;
  nodeEditActiveHandleIndex: any;
  nodeEditArmed: any;
  nodeEditDraft: any;
  nodeEditHandles: any;
  nodeEditTool: any;
  nodeRefsRef: any;
  nodeSmoothStrength: any;
  onPickImage: any;
  onionSkin: any;
  openHybridDccWorkspace: any;
  openStudioCommentCount: any;
  openStudioCommentInbox: any;
  openStudioCommentThreadInReview: any;
  pageDnd: any;
  pageEditLocked: any;
  pageGrade: any;
  pageGradeActive: any;
  pageGradeCss: any;
  pageGradePanelOpen: any;
  pageReviewOpen: any;
  pageSequenceOpen: any;
  pages: any;
  pagesHi: any;
  pagesHiRef: any;
  pagesHistory: any;
  pagesHistoryDurabilityStatus: any;
  pagesSheetRef: any;
  paintRetouchStrokeLineRef: any;
  panelGutter: any;
  panelLayoutPresets: any;
  panelLayoutsError: any;
  panelLayoutsLoading: any;
  panelSplitActive: any;
  panelSplitArmed: any;
  panelSplitHint: any;
  panelSplitPreview: any;
  panelSplitRatio: any;
  paperGrainKind: any;
  paperVectorRefinementBusy: any;
  paperVectorRefinementUnavailableReason: any;
  patchEl: any;
  pathBooleanBusy: any;
  pendingBrushDelete: any;
  pendingBrushDeletes: any;
  pendingInterchangeImport: any;
  perspectiveEyeLevelY: any;
  perspectiveLockHorizon: any;
  perspectiveRulerActive: any;
  pixelArtMode: any;
  pixelBrushRadius: any;
  pixelBusy: any;
  pixelCombine: any;
  pixelDragPreview: any;
  pixelForceCircle: any;
  pixelMagneticLasso: any;
  pixelOverlayFrame: any;
  pixelOverlaySel: any;
  pixelSel: any;
  pixelSelectionHistory: any;
  pixelTool: any;
  pixelToolArmed: any;
  pixelToolTargetAvailable: any;
  pointCommentComposer: any;
  polyLassoHover: any;
  polyLassoSession: any;
  poserInitialDataUrl: any;
  poserInitialElementId: any;
  poserSeedPropId: any;
  poserVrmOpen: any;
  postCorrection: any;
  preserveCorners: any;
  pressureCurve: any;
  pressureMinSize: any;
  productBrushRepository: any;
  productionBibleAssetOptions: any;
  productionBibleOpen: any;
  productionInsightsOpen: any;
  productionInsightsResult: any;
  projectActionsOpen: any;
  projectActionsRef: any;
  projectArchiveBusy: any;
  projectArchiveImportInputRef: any;
  projectArchiveStatus: any;
  projectImportInputRef: any;
  propsSheetRef: any;
  psdImportBusy: any;
  psdImportInputRef: any;
  psdImportStatus: any;
  publicationAnalytics: any;
  publicationOperationsOpen: any;
  publishAiDisclosure: any;
  publishAiUsage: any;
  publishCompliance: any;
  publishComplianceResult: any;
  publishContext: any;
  publishPackageExportBusy: any;
  publishPackageExportProgress: any;
  publishPackageExportStatus: any;
  publishPackageOpen: any;
  publishPackagePlan: any;
  publishPreflightOpen: any;
  publishPreflightResult: any;
  publishProfile: any;
  publishingId: any;
  puppetWarpActive: any;
  puppetWarpArmed: any;
  puppetWarpBusy: any;
  puppetWarpPins: any;
  quickAccessCatalog: any;
  quickAccessIntegration: any;
  quickAccessPaletteOpen: any;
  quickAccessState: any;
  quickActionsAnchor: any;
  quickActionsDisabledActions: any;
  quickActionsOpen: any;
  quickActionsPreferences: any;
  quickComicOpen: any;
  quickMaskActive: any;
  quickMaskArmed: any;
  quickMaskBrushMode: any;
  quickMaskDragPreview: any;
  quickMaskHardness: any;
  quickMaskOpacity: any;
  quickMaskRadius: any;
  quickMaskTintCanvas: any;
  quickMaskTintColor: any;
  quickMaskTintOpacity: any;
  quickShapeActive: any;
  railMoreOpen: any;
  rasterFavoriteOnly: any;
  rasterRetouchTargetAvailable: any;
  recentColors: any;
  redo: any;
  referenceBoard: any;
  referencePanelOpen: any;
  refreshQuickMaskTint: any;
  releaseSchedule: any;
  removeSelected: any;
  renamingAssetId: any;
  renamingAssetName: any;
  reorder: any;
  requiresStudioLiveServer: any;
  resetPixelSelectionHistoryState: any;
  retryStudioHistoryDurability: any;
  retryWatermarkPreferenceRuntime: any;
  rightResize: any;
  runColorRangeApply: any;
  runStudioLayerLiftAnalysis: any;
  saveElementAsEmeresLibraryItem: any;
  savedBrushes: any;
  saving: any;
  scale: any;
  scenarioApplyTarget: any;
  scenarioBusy: any;
  scenarioError: any;
  scenarioImageReferenceAssetOptions: any;
  scenarioImageReferenceDocument: any;
  scenarioImageReferenceResolution: any;
  scenarioOpen: any;
  scenarioProgress: any;
  scenarioRegeneratingIndex: any;
  scenarioResult: any;
  scenarioSceneCountHint: any;
  scenarioStageLabel: any;
  scenarioStoryText: any;
  sceneSimilarAnchor: any;
  sceneSimilarSiblings: any;
  sceneSnapshotOpen: any;
  sceneTemplates: any;
  sceneTemplatesError: any;
  sceneTemplatesLoading: any;
  scheduleHybridDccWorkspacePersistence: any;
  scopedHybridDccWorkspace: any;
  scrollPos: any;
  scrollPreviewOpen: any;
  scrollViewportStore: any;
  selectOptionsLaneReserved: any;
  selectOptionsStripArmed: any;
  selected: any;
  selectedBg3dEditSource: any;
  selectedBubbleTailGeometry: any;
  selectedContentMutationLocked: any;
  selectedForInspector: any;
  selectedId: any;
  selectedIdRef: any;
  selectedImageMutationLocked: any;
  selectedProjectedImageSource: any;
  selectedWorkAssetDestructiveEditReason: any;
  serverAiProvider: any;
  serverAiStatus: any;
  serverCurrentRevision: any;
  serverRevisionError: any;
  serverRevisionLoading: any;
  serverRevisions: any;
  session: any;
  setAdvancedFillPreview: any;
  setAdvancedFillStatus: any;
  setAiAssistTool: any;
  setAiBgPrompt: any;
  setAiBgSize: any;
  setAiCharacterPrompt: any;
  setAiColorizePrompt: any;
  setAiCompositionDraft: any;
  setAiDialogueSuggestIncludeContext: any;
  setAiDialogueSuggestSituation: any;
  setAiPaletteSuggestMood: any;
  setAiProvenanceOpen: any;
  setAiRecentPrompts: any;
  setAlignmentGuidesVisible: any;
  setAnimaticTimelineOpen: any;
  setAppSettingsInitialTab: any;
  setAppSettingsOpen: any;
  setAssetFavoriteOnly: any;
  setAssetPrompt: any;
  setAssetPromptName: any;
  setAssetPromptQuality: any;
  setAssetPromptSize: any;
  setAssetRightsAuditOpen: any;
  setAssetSearchQuery: any;
  setAssetSortOrder: any;
  setAssetTab: any;
  setAutoActionsOpen: any;
  setAutoColorCanvasSeedHit: any;
  setAutoColorCanvasSeedHits: any;
  setAutoColorScribbleCanvasArmed: any;
  setBg3dInitialDataUrl: any;
  setBg3dInitialElementId: any;
  setBg3dInitialScene: any;
  setBg3dOpen: any;
  setBgSceneGenreFilter: any;
  setBgSceneSearchQuery: any;
  setBrushDynamics: any;
  setBrushOpacity: any;
  setBubbleShapeEditActive: any;
  setCanvasGuides: any;
  setCanvasOnlyMode: any;
  setCharacterBibleOpen: any;
  setCheckpointPanelOpen: any;
  setColor: any;
  setColorBlindPreview: any;
  setColorRangeFuzziness: any;
  setColorRangePickActive: any;
  setColorRangePreviewEnabled: any;
  setColorRangeSamples: any;
  setColorWheelOpen: any;
  setCommentsOpen: any;
  setContextMenu: any;
  setContinuityOpen: any;
  setCreativeModesOpen: any;
  setCropAspect: any;
  setCropRect: any;
  setCurrentPageId: any;
  setDialogueBatchOpen: any;
  setDialogueScript: any;
  setDialogueTranslateOpen: any;
  setDodgeBurnExposure: any;
  setDodgeBurnHardness: any;
  setDodgeBurnMode: any;
  setDodgeBurnRadius: any;
  setDodgeBurnRange: any;
  setDodgeBurnSponge: any;
  setDrawMode: any;
  setDrawShape: any;
  setEmeresCategoryFilter: any;
  setEmeresSearchQuery: any;
  setEmeresSimilarAnchorId: any;
  setEmeresTab: any;
  setEraseToIntersection: any;
  setError: any;
  setExportFormat: any;
  setExportMenuOpen: any;
  setExportPresetId: any;
  setExportScale: any;
  setExportTransparent: any;
  setExtendedBlendMode: any;
  setExtendedBlendOpacity: any;
  setEyedropperActive: any;
  setFilterClipboard: any;
  setFilterMaskHardness: any;
  setFilterMaskPaintActive: any;
  setFilterMaskPaintMode: any;
  setFilterMaskRadius: any;
  setFilterMaskStrength: any;
  setFollowingStudioSessionId: any;
  setFrameAnimOpen: any;
  setFrameAnimTargetId: any;
  setFxPanelOpen: any;
  setFxPickerSection: any;
  setFxSearchQuery: any;
  setGridSize: any;
  setHealCloneAligned: any;
  setHealCloneHardness: any;
  setHealCloneOpacity: any;
  setHealCloneRadius: any;
  setHealCloneTool: any;
  setHistoryBrushActive: any;
  setHistoryBrushHardness: any;
  setHistoryBrushOpacity: any;
  setHistoryBrushRadius: any;
  setHistoryBrushSourceIndex: any;
  setHistoryBrushSourceSrc: any;
  setHistoryPanelOpen: any;
  setHybridDccOpen: any;
  setHybridDccWorkbenchMode: any;
  setHybridDccWorkspaceState: any;
  setInterchangeImportChoice: any;
  setLastStudioFilterDraft: any;
  setLayerMaskHardness: any;
  setLayerMaskPaintActive: any;
  setLayerMaskPaintMode: any;
  setLayerMaskRadius: any;
  setLayerMaskStrength: any;
  setLeftPanelOpen: any;
  setLeftPanelOpenWithOverride: any;
  setLiquifyMode: any;
  setLiquifyRadius: any;
  setLiquifyStrength: any;
  setLivingInkMode: any;
  setLivingInkScope: any;
  setLoadedWork: any;
  setMagicResizeStrategy: any;
  setMannequinPoserOpen: any;
  setMarqueeIds: any;
  setMasterEditMode: any;
  setMasterPanelOpen: any;
  setMenu: any;
  setMetaEditPageId: any;
  setMobileInspectorSnap: any;
  setMobileSheet: any;
  setNodeEditTool: any;
  setNodeSmoothStrength: any;
  setOnionSkin: any;
  setPageGradePanelOpen: any;
  setPageReviewOpen: any;
  setPageSequenceOpen: any;
  setPanelSplitActive: any;
  setPanelSplitHint: any;
  setPanelSplitRatio: any;
  setPausedBrushDeleteId: any;
  setPerspectiveRulerActive: any;
  setPixelArtMode: any;
  setPixelBrushRadius: any;
  setPixelCombine: any;
  setPixelForceCircle: any;
  setPixelMagneticLasso: any;
  setPixelTool: any;
  setPointCommentComposer: any;
  setPoserInitialDataUrl: any;
  setPoserInitialElementId: any;
  setPoserVrmOpen: any;
  setPostCorrection: any;
  setPreserveCorners: any;
  setPressureCurve: any;
  setPressureMinSize: any;
  setProductionBibleOpen: any;
  setProductionInsightsOpen: any;
  setProjectActionsOpen: any;
  setPublicationOperationsOpen: any;
  setPublishPackageOpen: any;
  setPublishPreflightOpen: any;
  setPuppetWarpActive: any;
  setPuppetWarpPins: any;
  setQuickAccessPaletteOpen: any;
  setQuickActionsOpen: any;
  setQuickActionsPreferences: any;
  setQuickComicOpen: any;
  setQuickMaskBrushMode: any;
  setQuickMaskHardness: any;
  setQuickMaskOpacity: any;
  setQuickMaskRadius: any;
  setQuickMaskTintColor: any;
  setQuickMaskTintOpacity: any;
  setQuickShapeActive: any;
  setQuickStartOpen: any;
  setRailMoreOpen: any;
  setRasterFavoriteOnly: any;
  setReferencePanelOpen: any;
  setRenamingAssetId: any;
  setRenamingAssetName: any;
  setRightPanelOpen: any;
  setRightPanelOpenWithOverride: any;
  setSavedBrushes: any;
  setScale: any;
  setScenarioImageReferenceDocument: any;
  setScenarioOpen: any;
  setScenarioSceneCountHint: any;
  setScenarioStoryText: any;
  setSceneSimilarAnchorId: any;
  setSceneSnapshotOpen: any;
  setScrollPreviewOpen: any;
  setSelectedId: any;
  setShapeFill: any;
  setSharedDocumentNotice: any;
  setSharedDocumentScope: any;
  setShortcutsOpen: any;
  setShowAlignmentGuides: any;
  setShowGrid: any;
  setShowWebtoonGuides: any;
  setSilkGenerativeSpec: any;
  setSmudgeRadius: any;
  setSmudgeStrength: any;
  setSnapEnabled: any;
  setSnapEnabledVisible: any;
  setStabilizer: any;
  setStabilizerMode: any;
  setStampTuning: any;
  setStoryboardGridOpen: any;
  setStrokeWidth: any;
  setStudioCommentFocusRequest: any;
  setStudioCommentPinsHidden: any;
  setStudioFilterApplying: any;
  setStudioFilterPreview: any;
  setStudioFilterSession: any;
  setStudioLayerLiftOptions: any;
  setStudioRasterHandoffCandidate: any;
  setSymmetryCenterX: any;
  setSymmetryCenterY: any;
  setSymmetryRadialCount: any;
  setSymmetryType: any;
  setTeamPanelOpen: any;
  setTiltEnabled: any;
  setTimelapseOpen: any;
  setTimelineFocusedTrackId: any;
  setTimelineOpen: any;
  setTimelinePlayhead: any;
  setTimelinePlaying: any;
  setTipAngle: any;
  setTipRoundness: any;
  setToneSearchQuery: any;
  setTool: any;
  setTranslateDraft: any;
  setTranslateGlossary: any;
  setTranslateTargetLocale: any;
  setTutorialHubOpen: any;
  setUseVelocityPressure: any;
  setUserGuides: any;
  setVelocitySensitivity: any;
  setViewTool: any;
  setWandTolerance: any;
  setWetMixHardness: any;
  setWetMixPickup: any;
  setWetMixRadius: any;
  setWetMixStrength: any;
  setWetMixWetness: any;
  setWillImportChoice: any;
  setWriterRoomAiDirection: any;
  setWriterRoomAiReview: any;
  setWriterRoomOpen: any;
  setZoom: any;
  setZoomLocked: any;
  sfxError: any;
  sfxLoading: any;
  sfxPacks: any;
  shapeFill: any;
  shared: any;
  sharedDocument: any;
  sharedDocumentNotice: any;
  sharedError: any;
  sharedGutters: any;
  sharedLoading: any;
  sharedLoadingMore: any;
  sharedNextOffset: any;
  shortcutsOpen: any;
  showAlignmentGuides: any;
  showGrid: any;
  showMobileHint: any;
  showQuickStart: any;
  showRulers: any;
  showWebtoonGuides: any;
  silkGenerativeSpec: any;
  smartGuides: any;
  smudgeActive: any;
  smudgeArmed: any;
  smudgeBusy: any;
  smudgeCursorRef: any;
  smudgeRadius: any;
  smudgeStrength: any;
  snapEnabled: any;
  sourceHydrationPending: any;
  stabilizer: any;
  stabilizerMode: any;
  stageRef: any;
  stampTuning: any;
  startStudioCommentPlacementSession: any;
  storyboardGridOpen: any;
  strokeGuideRef: any;
  strokeWidth: any;
  studioAuthUserId: any;
  studioBgSceneAssetsError: any;
  studioBgSceneAssetsLoaded: any;
  studioBgSceneAssetsLoading: any;
  studioBrushCatalogHandlers: any;
  studioBrushR8GrainRenderElements: any;
  studioCanvasCommentPins: any;
  studioCanvasViewportHandlers: any;
  studioCanvasWorkAssetRenderProjection: any;
  studioCommentActor: any;
  studioCommentAnchorOptions: any;
  studioCommentFocusRequest: any;
  studioCommentInteractionNotice: any;
  studioCommentPinReanchorDisabledReason: any;
  studioCommentPinReanchorableThreadIds: any;
  studioCommentPinsHidden: any;
  studioCommentSharedReplyController: any;
  studioCommentSyncError: any;
  studioCommentThreadPopoverScreenProjectionHandlers: any;
  studioCommentThreadPopoverTarget: any;
  studioCommentThreadSession: any;
  studioCommentThreadSessionView: any;
  studioCommentViewDocument: any;
  studioComments: any;
  studioCrdtDocument: any;
  studioCrdtOperationSyncReady: any;
  studioEmeresAssetsError: any;
  studioEmeresAssetsLoaded: any;
  studioEmeresAssetsLoading: any;
  studioFilterApplyBusyRef: any;
  studioFilterApplying: any;
  studioFilterDialogImage: any;
  studioFilterDialogMutationLockReason: any;
  studioFilterDialogMutationLocked: any;
  studioFilterMaskMasterRenderElements: any;
  studioFilterPreparationBusy: any;
  studioFilterPreview: any;
  studioFilterSession: any;
  studioFilterSessionIdRef: any;
  studioFilterTargetLabel: any;
  studioFilterUnavailableReason: any;
  studioHistoryRetention: any;
  studioHistorySidecarRedoAvailable: any;
  studioHistorySidecarUndoAvailable: any;
  studioInspectorAsideHandlers: any;
  studioLayerLiftDisabledReason: any;
  studioLayerLiftOptions: any;
  studioLayerLiftUi: any;
  studioLayerLiftUiRef: any;
  studioLazyPanelStackHandlers: any;
  studioLeftToolRailHandlers: any;
  studioLegacyCommentThreadIdSet: any;
  studioLiveJam: any;
  studioLiveParticipant: any;
  studioLiveRoomRef: any;
  studioLiveTransportFactory: any;
  studioMainMenuGroups: any;
  studioMenubarActivePageLabel: any;
  studioMenubarContentHandlers: any;
  studioMenubarPageLabels: any;
  studioMobileEditingDockHandlers: any;
  studioOnCanvasSurfaceHandlers: any;
  studioOptionalAssets: any;
  studioOptionsBarsDrawModel: any;
  studioOptionsBarsHandlers: any;
  studioOptionsBarsSelectionModel: any;
  studioPageListPaneHandlers: any;
  studioPointCommentScreenProjectionHandlers: any;
  studioRasterAuthorizedAuthorityKey: any;
  studioRasterHandoffBlocked: any;
  studioRasterHandoffGates: any;
  studioRasterHiddenOperationIds: any;
  studioRasterOverlayElements: any;
  studioRevisionProjectGenerationRef: any;
  studioRootRef: any;
  studioSfx: any;
  studioStickerAssetsError: any;
  studioStickerAssetsLoaded: any;
  studioStickerAssetsLoading: any;
  studioTeamCommentCapabilities: any;
  studioTeamCommentsSyncing: any;
  studioTeamCommentsWorkId: any;
  studioTeamUnreadCommentIdSet: any;
  studioToolBeltContentHandlers: any;
  studioWorkAssetRenderPlaceholders: any;
  studioWorkAssetRenderProjection: any;
  submitStudioCommentThreadReply: any;
  submitStudioPointComment: any;
  symmetryCenterX: any;
  symmetryCenterY: any;
  symmetryRadialCount: any;
  symmetryType: any;
  tagsText: any;
  teamPanelOpen: any;
  textAiConfigured: any;
  textAiTransport: any;
  tiltEnabled: any;
  timelapseCapturing: any;
  timelapseOpen: any;
  timelineFocusedTrackId: any;
  timelineOpen: any;
  timelinePlayhead: any;
  timelinePlaying: any;
  timelinePreviewFrame: any;
  tipAngle: any;
  tipRoundness: any;
  title: any;
  titleInputRef: any;
  toggleCanvasWideMode: any;
  toggleSelectedElementsLocked: any;
  toneSearchQuery: any;
  tool: any;
  trRef: any;
  translateBusy: any;
  translateDraft: any;
  translateError: any;
  translateGlossary: any;
  translateProgress: any;
  translateTargetLocale: any;
  tutorialHubOpen: any;
  tutorialInitialId: any;
  uiDensityMode: any;
  undo: any;
  undoBrushDelete: any;
  useVelocityPressure: any;
  userGuides: any;
  validateRecoveryAccess: any;
  vanishingPoints: any;
  velocitySensitivity: any;
  viewTool: any;
  viewTransformSuppressed: any;
  wandTolerance: any;
  watermark: any;
  watermarkPreferenceSnapshot: any;
  webGpuPreviewAuthorized: any;
  webGpuPreviewStrokes: any;
  webGpuViewportSurface: any;
  webtoonGuides: any;
  webtoonTheme: any;
  wetMixActive: any;
  wetMixArmed: any;
  wetMixBusy: any;
  wetMixHardness: any;
  wetMixPickup: any;
  wetMixRadius: any;
  wetMixStrength: any;
  wetMixWetness: any;
  willImportChoice: any;
  workHydrated: any;
  workHydrationFailed: any;
  workHydrationUnsupportedFormat: any;
  workId: any;
  workspaceControlSide: any;
  workspaceMenuEpoch: any;
  workspacePersistence: any;
  workspaceState: any;
  workspaceSyncNotice: any;
  wrapRef: any;
  writerRoom: any;
  writerRoomAiBusy: any;
  writerRoomAiDirection: any;
  writerRoomAiError: any;
  writerRoomAiReview: any;
  writerRoomCanvasPlan: any;
  writerRoomOpen: any;
  zoom: any;
  zoomHostRef: any;
  zoomLocked: any;
  autosaveDocumentLeadership: any;
  bg: any;
  densityShowsStatusRail: any;
  drawingShortcutNoticeStore: any;
  hi: any;
  menuEditRedoDisabled: any;
  menuEditUndoDisabled: any;
  presentationPanelsHidden: any;
  proDrawPrefs: any;
  remixId: any;
  studioLiveGesturePreviewAdapter: any;
  studioRasterHandoffBaseKey: any;
  studioRasterVisibleDocumentRect: any;
  studioRoute: any;
  visibleLeftPanelOpen: any;
  visibleRightPanelOpen: any;
};

export function StudioCuttoonEditorView(s: StudioCuttoonEditorViewSession) {
  const {
    activatePrimaryCanvasTool,
    activeCatalogBrush,
    activeCommentAnchor,
    activeDialogueLocale,
    activeGroupId,
    activePage,
    activePageIndex,
    activeSavedBrushId,
    activeServerAiProviderLabel,
    activeSurfaceReviewLocked,
    activeToolbarGroup,
    addBubble,
    addPage,
    addText,
    admittedBg3dOpen,
    admittedMannequinPoserOpen,
    admittedPoserVrmOpen,
    advancedFillActive,
    advancedFillArmed,
    advancedFillBusy,
    advancedFillPreview,
    advancedFillReferenceLayerCount,
    advancedFillSettings,
    advancedFillStatus,
    advancedFillUnsupportedReason,
    advancedFillVisibleRasterCount,
    advancedRulers,
    aiAssistTool,
    aiBgBusy,
    aiBgError,
    aiBgPrompt,
    aiBgSize,
    aiCharacterBusy,
    aiCharacterError,
    aiCharacterPrompt,
    aiColorizeBusy,
    aiColorizeError,
    aiColorizePrompt,
    aiCompositionDraft,
    aiDialogueSuggestBusy,
    aiDialogueSuggestCandidates,
    aiDialogueSuggestError,
    aiDialogueSuggestIncludeContext,
    aiDialogueSuggestSituation,
    aiNoticeOpen,
    aiPaletteSuggestBusy,
    aiPaletteSuggestError,
    aiPaletteSuggestMood,
    aiPaletteSuggestSavedMsg,
    aiPaletteSuggestion,
    aiProvenance,
    aiProvenanceOpen,
    aiRecentPrompts,
    aiSettings,
    animTimeline,
    animaticTimelineOpen,
    announceDrawingShortcut,
    appSettings,
    appSettingsInitialTab,
    appSettingsOpen,
    appSettingsPersistenceState,
    applyExtendedBlendMergeDown,
    applyPaperVectorRefinement,
    applyPathBooleanCombine,
    applyPendingInterchangeImport,
    applyPixelSelectionHistoryCommand,
    applyQuickComicInput,
    applySceneSnapshot,
    applyStudioBrushCatalogSelection,
    applyStudioLayerLift,
    assetFavoriteOnly,
    assetFavoriteState,
    assetGenerating,
    assetPrompt,
    assetPromptName,
    assetPromptQuality,
    assetPromptSize,
    assetRightsAuditOpen,
    assetSearchQuery,
    assetSortOrder,
    assetTab,
    assets,
    assetsLoaded,
    assetsLoading,
    authorizedWorkAssetScopeId,
    autoActionBusy,
    autoActionError,
    autoActionPlan,
    autoActionProgress,
    autoActionScope,
    autoActionSelectedPageIds,
    autoActionSet,
    autoActionStatus,
    autoActionsOpen,
    autoColorCanvasSeedHit,
    autoColorCanvasSeedHits,
    autoColorPlanImageSizeRef,
    autoColorScribbleCanvasArmed,
    autosaveRestoreBlockedReason,
    bg3dBatchRecoveryScope,
    bg3dDccShotMappingsRef,
    bg3dDccSourceRef,
    bg3dInitialDataUrl,
    bg3dInitialElementId,
    bg3dInitialScene,
    bg3dOpen,
    bg3dSeedPrimitiveKind,
    bg3dSeedTemplateId,
    bg3dTargetBundleId,
    bgGrad,
    bgSceneGenreFilter,
    bgSceneSearchQuery,
    bgSceneSectionsFiltered,
    brush,
    brushBaselineController,
    brushCatalogSession,
    brushCursorRef,
    brushDynamics,
    brushManagerSheetRef,
    brushOpacity,
    brushPackImportInputRef,
    brushPackImporting,
    brushUndoButtonRef,
    brushUndoToastRef,
    bubbleAnchorPickActive,
    bubbleShapeActiveHandleIndex,
    bubbleShapeArmed,
    bubbleShapeDraft,
    bubbleShapeEditActive,
    bubbleShapeHandles,
    bubbleShapeSelectedPointIndex,
    builtinRasterBusyId,
    canApplyStudioMutation,
    cancelPaperVectorRefinement,
    cancelStudioPointCommentComposer,
    canvasFlipH,
    canvasGuides,
    canvasH,
    canvasInteractionBlocked,
    canvasOnlyMode,
    canvasRotation,
    captureStudioMutationTicket,
    changeStudioCommentThreadReplyDraft,
    changeStudioCommentThreadResolution,
    changeStudioQuickAccessState,
    changeStudioSymmetryType,
    characterBible,
    characterBibleOpen,
    checkpointError,
    checkpointPanelOpen,
    checkpoints,
    clearStudioObjectInsertSeeds,
    clips,
    closeStudioCommentThreadPopover,
    closeStudioFilterDialog,
    closeStudioLayerLift,
    closeViewToolWithFocus,
    collaborationDocumentLocked,
    collaborationDocumentUnavailable,
    collaborationLockMessage,
    collaborationOperationSyncPending,
    collaborationReadOnly,
    collaborationRoleLabel,
    color,
    colorBlindPreview,
    colorRangeFuzziness,
    colorRangePickActive,
    colorRangePreviewEnabled,
    colorRangeSamples,
    colorVisionSheetRef,
    colorWheelCenter,
    colorWheelOpen,
    commentPinArmed,
    commentPlacementActive,
    commentsOpen,
    commentsPanelMounted,
    commit,
    commitPixelSelectionState,
    commitQuickMask,
    commitSavedBrushProjection,
    completeSelectedGroupId,
    composeWorkAssetPreviewPage,
    configuredServerAiProviders,
    contextMenu,
    contextMenuBg3dEditSource,
    contextMenuEl,
    continuityIssues,
    continuityOpen,
    continuityScenes,
    correctStudioLayerLift,
    creativeModesCloseLabel,
    creativeModesLabel,
    creativeModesOpen,
    creativeModesPanelRef,
    creativeModesTriggerRef,
    cropArmed,
    cropAspect,
    cropBusy,
    cropRect,
    currentBrushSnapshot,
    currentCanvasSelectionCount,
    currentPageId,
    currentPageIdRef,
    currentPublishPackageCreditsText,
    currentStudioFilterPageRasterContext,
    currentStudioWorkspaceDeviceKind,
    currentTemplate,
    currentWorkspaceOwnerScope,
    description,
    dialogueBatchOpen,
    dialogueScript,
    dialogueTranslateOpen,
    dismissActiveMobileSheet,
    dismissPendingInterchangeImport,
    displayLinkedTitleId,
    document,
    dodgeBurnActive,
    dodgeBurnArmed,
    dodgeBurnBusy,
    dodgeBurnExposure,
    dodgeBurnHardness,
    dodgeBurnMode,
    dodgeBurnRadius,
    dodgeBurnRange,
    dodgeBurnSponge,
    draftCollaboration,
    draftPreviewDynamicLayerRef,
    draftPreviewNormalLayerRef,
    draftPreviewStore,
    drawMode,
    drawShape,
    drawSheetRef,
    drawingPaletteCancelEpoch,
    drawingPaletteLayout,
    drawingRef,
    duplicateSelected,
    editMenuImageInputRef,
    editing,
    effScale,
    effectFavoriteState,
    effectivePublishPackageSettings,
    effectiveWorkId,
    elementById,
    elements,
    emeresCategoryFilter,
    emeresFlatCatalog,
    emeresSearchQuery,
    emeresSectionsFiltered,
    emeresSimilarAnchor,
    emeresSimilarSiblings,
    emeresTab,
    emeresUnderlayCount,
    enterQuickMask,
    eraseToIntersection,
    error,
    executeStudioQuickAccessCommand,
    exitQuickMask,
    expectsSharedDocument,
    exportFormat,
    exportMenuOpen,
    exportMenuRef,
    exportPresetId,
    exportScale,
    exportTransparent,
    extendedBlendMode,
    extendedBlendOpacity,
    eyedropperActive,
    filterClipboard,
    filterMaskBusy,
    filterMaskCursorRef,
    filterMaskDragPreview,
    filterMaskHardness,
    filterMaskPaintActive,
    filterMaskPaintArmed,
    filterMaskPaintMode,
    filterMaskRadius,
    filterMaskStrength,
    followingStudioSessionId,
    frameAnimEl,
    frameAnimOpen,
    frameAnimTargetId,
    fxComicFiltered,
    fxCreatureFiltered,
    fxEmojisFiltered,
    fxLinePresetsFiltered,
    fxOverlaysFiltered,
    fxPanelLoading,
    fxPanelOpen,
    fxPickerHasResults,
    fxPickerSection,
    fxPropFiltered,
    fxQuery,
    fxRasterFiltered,
    fxSearchQuery,
    fxSectionVisible,
    fxSfxFiltered,
    gpuCanvasShadowVisibleRef,
    gpuLiveInkPinnedRef,
    gridSize,
    groups,
    guides,
    handleBrushPackImportFromMenu,
    handleImportInterchangeArchive,
    handleImportProject,
    handleImportProjectArchive,
    handleImportPsd,
    handleStudioCrdtAuthoritativeSaveBarrierChange,
    handleStudioCrdtDocumentChange,
    handleStudioLiveEditSafetyChange,
    handleStudioLiveRoomChange,
    hardCanvasInteractionBlock,
    hasAutosave,
    healCloneAligned,
    healCloneArmed,
    healCloneBusy,
    healCloneCursorRef,
    healCloneDragPreview,
    healCloneHardness,
    healCloneOpacity,
    healCloneRadius,
    healCloneSourceAnchor,
    healCloneSourceCursorRef,
    healCloneTool,
    history,
    historyBrushActive,
    historyBrushArmed,
    historyBrushBusy,
    historyBrushCursorRef,
    historyBrushDragPreview,
    historyBrushHardness,
    historyBrushOpacity,
    historyBrushRadius,
    historyBrushSourceIndex,
    historyBrushSourceSrc,
    historyPanelOpen,
    hybridDccOpen,
    hybridDccPersistenceStatus,
    hybridDccReturnFocusRef,
    hybridDccRouteAccess,
    hybridDccRouteRequested,
    hybridDccWorkspaceDocumentId,
    hybridDccWorkspaceScope,
    inkMeshLivePreviewRuntime,
    insertStudioStickyNote,
    inspectorLayout,
    interchangeImportBusy,
    interchangeImportChoice,
    interchangeImportInputRef,
    interchangeImportStatus,
    invertQuickMask,
    isExporting,
    isFullscreen,
    isLatestLayerContentMutationLocked,
    isMobile,
    isPanning,
    isRailToolVisible,
    isSpacePressed,
    isStudioCommentAnchorValid,
    isometricAngleDeg,
    isometricCellSize,
    isometricGridActive,
    isometricOriginX,
    isometricOriginY,
    layerMaskBusy,
    layerMaskCursorRef,
    layerMaskDragPreview,
    layerMaskHardness,
    layerMaskPaintActive,
    layerMaskPaintArmed,
    layerMaskPaintMode,
    layerMaskRadius,
    layerMaskStrength,
    layerMergeBusy,
    layerNavigatorItems,
    layerSoloState,
    leftResize,
    liquifyActive,
    liquifyArmed,
    liquifyBusy,
    liquifyMode,
    liquifyPreviewImageRef,
    liquifyRadius,
    liquifyStrength,
    liveDraftDirectRef,
    liveDraftLayerRef,
    liveDraftShapeKind,
    liveDraftVisualRef,
    liveDrawPressureStore,
    liveDynamicBrushOverlayRenderer,
    liveInkOverlayRenderer,
    liveInkOverlayRendererRef,
    liveInkPredictionRenderer,
    liveRetainedMediaOverlayRenderer,
    liveStampOverlayRenderer,
    liveWetInkOverlayRenderer,
    liveWorkspaceLayout,
    livingInkOverlayVisibleRef,
    loadedWork,
    localHiddenElementIds,
    location,
    loggedIn,
    macroSession,
    magicResizeStrategy,
    mainLayerRef,
    mannequinPoserOpen,
    marqueeIds,
    marqueeIdsRef,
    marqueeRectNodeRef,
    master,
    masterEditMode,
    masterPanelOpen,
    masterRenderEls,
    maximized,
    menu,
    menuFilterDisabled,
    menuRef,
    metaEditPageId,
    mobileBrushDockButtonRef,
    mobileImmersive,
    mobileInspectorSnap,
    mobileKeyboardInset,
    mobileQuickActionsButton,
    mobileSelectionLocked,
    mobileSheet,
    modalMobileSheet,
    name,
    navigate,
    navigateStudioCommentPinCluster,
    nodeEditActiveHandleIndex,
    nodeEditArmed,
    nodeEditDraft,
    nodeEditHandles,
    nodeEditTool,
    nodeRefsRef,
    nodeSmoothStrength,
    onPickImage,
    onionSkin,
    openHybridDccWorkspace,
    openStudioCommentCount,
    openStudioCommentInbox,
    openStudioCommentThreadInReview,
    pageDnd,
    pageEditLocked,
    pageGrade,
    pageGradeActive,
    pageGradeCss,
    pageGradePanelOpen,
    pageReviewOpen,
    pageSequenceOpen,
    pages,
    pagesHi,
    pagesHiRef,
    pagesHistory,
    pagesHistoryDurabilityStatus,
    pagesSheetRef,
    paintRetouchStrokeLineRef,
    panelGutter,
    panelLayoutPresets,
    panelLayoutsError,
    panelLayoutsLoading,
    panelSplitActive,
    panelSplitArmed,
    panelSplitHint,
    panelSplitPreview,
    panelSplitRatio,
    paperGrainKind,
    paperVectorRefinementBusy,
    paperVectorRefinementUnavailableReason,
    patchEl,
    pathBooleanBusy,
    pendingBrushDelete,
    pendingBrushDeletes,
    pendingInterchangeImport,
    perspectiveEyeLevelY,
    perspectiveLockHorizon,
    perspectiveRulerActive,
    pixelArtMode,
    pixelBrushRadius,
    pixelBusy,
    pixelCombine,
    pixelDragPreview,
    pixelForceCircle,
    pixelMagneticLasso,
    pixelOverlayFrame,
    pixelOverlaySel,
    pixelSel,
    pixelSelectionHistory,
    pixelTool,
    pixelToolArmed,
    pixelToolTargetAvailable,
    pointCommentComposer,
    polyLassoHover,
    polyLassoSession,
    poserInitialDataUrl,
    poserInitialElementId,
    poserSeedPropId,
    poserVrmOpen,
    postCorrection,
    preserveCorners,
    pressureCurve,
    pressureMinSize,
    productBrushRepository,
    productionBibleAssetOptions,
    productionBibleOpen,
    productionInsightsOpen,
    productionInsightsResult,
    projectActionsOpen,
    projectActionsRef,
    projectArchiveBusy,
    projectArchiveImportInputRef,
    projectArchiveStatus,
    projectImportInputRef,
    propsSheetRef,
    psdImportBusy,
    psdImportInputRef,
    psdImportStatus,
    publicationAnalytics,
    publicationOperationsOpen,
    publishAiDisclosure,
    publishAiUsage,
    publishCompliance,
    publishComplianceResult,
    publishContext,
    publishPackageExportBusy,
    publishPackageExportProgress,
    publishPackageExportStatus,
    publishPackageOpen,
    publishPackagePlan,
    publishPreflightOpen,
    publishPreflightResult,
    publishProfile,
    publishingId,
    puppetWarpActive,
    puppetWarpArmed,
    puppetWarpBusy,
    puppetWarpPins,
    quickAccessCatalog,
    quickAccessIntegration,
    quickAccessPaletteOpen,
    quickAccessState,
    quickActionsAnchor,
    quickActionsDisabledActions,
    quickActionsOpen,
    quickActionsPreferences,
    quickComicOpen,
    quickMaskActive,
    quickMaskArmed,
    quickMaskBrushMode,
    quickMaskDragPreview,
    quickMaskHardness,
    quickMaskOpacity,
    quickMaskRadius,
    quickMaskTintCanvas,
    quickMaskTintColor,
    quickMaskTintOpacity,
    quickShapeActive,
    railMoreOpen,
    rasterFavoriteOnly,
    rasterRetouchTargetAvailable,
    recentColors,
    redo,
    referenceBoard,
    referencePanelOpen,
    refreshQuickMaskTint,
    releaseSchedule,
    removeSelected,
    renamingAssetId,
    renamingAssetName,
    reorder,
    requiresStudioLiveServer,
    resetPixelSelectionHistoryState,
    retryStudioHistoryDurability,
    retryWatermarkPreferenceRuntime,
    rightResize,
    runColorRangeApply,
    runStudioLayerLiftAnalysis,
    saveElementAsEmeresLibraryItem,
    savedBrushes,
    saving,
    scale,
    scenarioApplyTarget,
    scenarioBusy,
    scenarioError,
    scenarioImageReferenceAssetOptions,
    scenarioImageReferenceDocument,
    scenarioImageReferenceResolution,
    scenarioOpen,
    scenarioProgress,
    scenarioRegeneratingIndex,
    scenarioResult,
    scenarioSceneCountHint,
    scenarioStageLabel,
    scenarioStoryText,
    sceneSimilarAnchor,
    sceneSimilarSiblings,
    sceneSnapshotOpen,
    sceneTemplates,
    sceneTemplatesError,
    sceneTemplatesLoading,
    scheduleHybridDccWorkspacePersistence,
    scopedHybridDccWorkspace,
    scrollPos,
    scrollPreviewOpen,
    scrollViewportStore,
    selectOptionsLaneReserved,
    selectOptionsStripArmed,
    selected,
    selectedBg3dEditSource,
    selectedBubbleTailGeometry,
    selectedContentMutationLocked,
    selectedForInspector,
    selectedId,
    selectedIdRef,
    selectedImageMutationLocked,
    selectedProjectedImageSource,
    selectedWorkAssetDestructiveEditReason,
    serverAiProvider,
    serverAiStatus,
    serverCurrentRevision,
    serverRevisionError,
    serverRevisionLoading,
    serverRevisions,
    session,
    setAdvancedFillPreview,
    setAdvancedFillStatus,
    setAiAssistTool,
    setAiBgPrompt,
    setAiBgSize,
    setAiCharacterPrompt,
    setAiColorizePrompt,
    setAiCompositionDraft,
    setAiDialogueSuggestIncludeContext,
    setAiDialogueSuggestSituation,
    setAiPaletteSuggestMood,
    setAiProvenanceOpen,
    setAiRecentPrompts,
    setAlignmentGuidesVisible,
    setAnimaticTimelineOpen,
    setAppSettingsInitialTab,
    setAppSettingsOpen,
    setAssetFavoriteOnly,
    setAssetPrompt,
    setAssetPromptName,
    setAssetPromptQuality,
    setAssetPromptSize,
    setAssetRightsAuditOpen,
    setAssetSearchQuery,
    setAssetSortOrder,
    setAssetTab,
    setAutoActionsOpen,
    setAutoColorCanvasSeedHit,
    setAutoColorCanvasSeedHits,
    setAutoColorScribbleCanvasArmed,
    setBg3dInitialDataUrl,
    setBg3dInitialElementId,
    setBg3dInitialScene,
    setBg3dOpen,
    setBgSceneGenreFilter,
    setBgSceneSearchQuery,
    setBrushDynamics,
    setBrushOpacity,
    setBubbleShapeEditActive,
    setCanvasGuides,
    setCanvasOnlyMode,
    setCharacterBibleOpen,
    setCheckpointPanelOpen,
    setColor,
    setColorBlindPreview,
    setColorRangeFuzziness,
    setColorRangePickActive,
    setColorRangePreviewEnabled,
    setColorRangeSamples,
    setColorWheelOpen,
    setCommentsOpen,
    setContextMenu,
    setContinuityOpen,
    setCreativeModesOpen,
    setCropAspect,
    setCropRect,
    setCurrentPageId,
    setDialogueBatchOpen,
    setDialogueScript,
    setDialogueTranslateOpen,
    setDodgeBurnExposure,
    setDodgeBurnHardness,
    setDodgeBurnMode,
    setDodgeBurnRadius,
    setDodgeBurnRange,
    setDodgeBurnSponge,
    setDrawMode,
    setDrawShape,
    setEmeresCategoryFilter,
    setEmeresSearchQuery,
    setEmeresSimilarAnchorId,
    setEmeresTab,
    setEraseToIntersection,
    setError,
    setExportFormat,
    setExportMenuOpen,
    setExportPresetId,
    setExportScale,
    setExportTransparent,
    setExtendedBlendMode,
    setExtendedBlendOpacity,
    setEyedropperActive,
    setFilterClipboard,
    setFilterMaskHardness,
    setFilterMaskPaintActive,
    setFilterMaskPaintMode,
    setFilterMaskRadius,
    setFilterMaskStrength,
    setFollowingStudioSessionId,
    setFrameAnimOpen,
    setFrameAnimTargetId,
    setFxPanelOpen,
    setFxPickerSection,
    setFxSearchQuery,
    setGridSize,
    setHealCloneAligned,
    setHealCloneHardness,
    setHealCloneOpacity,
    setHealCloneRadius,
    setHealCloneTool,
    setHistoryBrushActive,
    setHistoryBrushHardness,
    setHistoryBrushOpacity,
    setHistoryBrushRadius,
    setHistoryBrushSourceIndex,
    setHistoryBrushSourceSrc,
    setHistoryPanelOpen,
    setHybridDccOpen,
    setHybridDccWorkbenchMode,
    setHybridDccWorkspaceState,
    setInterchangeImportChoice,
    setLastStudioFilterDraft,
    setLayerMaskHardness,
    setLayerMaskPaintActive,
    setLayerMaskPaintMode,
    setLayerMaskRadius,
    setLayerMaskStrength,
    setLeftPanelOpen,
    setLeftPanelOpenWithOverride,
    setLiquifyMode,
    setLiquifyRadius,
    setLiquifyStrength,
    setLivingInkMode,
    setLivingInkScope,
    setLoadedWork,
    setMagicResizeStrategy,
    setMannequinPoserOpen,
    setMarqueeIds,
    setMasterEditMode,
    setMasterPanelOpen,
    setMenu,
    setMetaEditPageId,
    setMobileInspectorSnap,
    setMobileSheet,
    setNodeEditTool,
    setNodeSmoothStrength,
    setOnionSkin,
    setPageGradePanelOpen,
    setPageReviewOpen,
    setPageSequenceOpen,
    setPanelSplitActive,
    setPanelSplitHint,
    setPanelSplitRatio,
    setPausedBrushDeleteId,
    setPerspectiveRulerActive,
    setPixelArtMode,
    setPixelBrushRadius,
    setPixelCombine,
    setPixelForceCircle,
    setPixelMagneticLasso,
    setPixelTool,
    setPointCommentComposer,
    setPoserInitialDataUrl,
    setPoserInitialElementId,
    setPoserVrmOpen,
    setPostCorrection,
    setPreserveCorners,
    setPressureCurve,
    setPressureMinSize,
    setProductionBibleOpen,
    setProductionInsightsOpen,
    setProjectActionsOpen,
    setPublicationOperationsOpen,
    setPublishPackageOpen,
    setPublishPreflightOpen,
    setPuppetWarpActive,
    setPuppetWarpPins,
    setQuickAccessPaletteOpen,
    setQuickActionsOpen,
    setQuickActionsPreferences,
    setQuickComicOpen,
    setQuickMaskBrushMode,
    setQuickMaskHardness,
    setQuickMaskOpacity,
    setQuickMaskRadius,
    setQuickMaskTintColor,
    setQuickMaskTintOpacity,
    setQuickShapeActive,
    setQuickStartOpen,
    setRailMoreOpen,
    setRasterFavoriteOnly,
    setReferencePanelOpen,
    setRenamingAssetId,
    setRenamingAssetName,
    setRightPanelOpen,
    setRightPanelOpenWithOverride,
    setSavedBrushes,
    setScale,
    setScenarioImageReferenceDocument,
    setScenarioOpen,
    setScenarioSceneCountHint,
    setScenarioStoryText,
    setSceneSimilarAnchorId,
    setSceneSnapshotOpen,
    setScrollPreviewOpen,
    setSelectedId,
    setShapeFill,
    setSharedDocumentNotice,
    setSharedDocumentScope,
    setShortcutsOpen,
    setShowAlignmentGuides,
    setShowGrid,
    setShowWebtoonGuides,
    setSilkGenerativeSpec,
    setSmudgeRadius,
    setSmudgeStrength,
    setSnapEnabled,
    setSnapEnabledVisible,
    setStabilizer,
    setStabilizerMode,
    setStampTuning,
    setStoryboardGridOpen,
    setStrokeWidth,
    setStudioCommentFocusRequest,
    setStudioCommentPinsHidden,
    setStudioFilterApplying,
    setStudioFilterPreview,
    setStudioFilterSession,
    setStudioLayerLiftOptions,
    setStudioRasterHandoffCandidate,
    setSymmetryCenterX,
    setSymmetryCenterY,
    setSymmetryRadialCount,
    setSymmetryType,
    setTeamPanelOpen,
    setTiltEnabled,
    setTimelapseOpen,
    setTimelineFocusedTrackId,
    setTimelineOpen,
    setTimelinePlayhead,
    setTimelinePlaying,
    setTipAngle,
    setTipRoundness,
    setToneSearchQuery,
    setTool,
    setTranslateDraft,
    setTranslateGlossary,
    setTranslateTargetLocale,
    setTutorialHubOpen,
    setUseVelocityPressure,
    setUserGuides,
    setVelocitySensitivity,
    setViewTool,
    setWandTolerance,
    setWetMixHardness,
    setWetMixPickup,
    setWetMixRadius,
    setWetMixStrength,
    setWetMixWetness,
    setWillImportChoice,
    setWriterRoomAiDirection,
    setWriterRoomAiReview,
    setWriterRoomOpen,
    setZoom,
    setZoomLocked,
    sfxError,
    sfxLoading,
    sfxPacks,
    shapeFill,
    shared,
    sharedDocument,
    sharedDocumentNotice,
    sharedError,
    sharedGutters,
    sharedLoading,
    sharedLoadingMore,
    sharedNextOffset,
    shortcutsOpen,
    showAlignmentGuides,
    showGrid,
    showMobileHint,
    showQuickStart,
    showRulers,
    showWebtoonGuides,
    silkGenerativeSpec,
    smartGuides,
    smudgeActive,
    smudgeArmed,
    smudgeBusy,
    smudgeCursorRef,
    smudgeRadius,
    smudgeStrength,
    snapEnabled,
    sourceHydrationPending,
    stabilizer,
    stabilizerMode,
    stageRef,
    stampTuning,
    startStudioCommentPlacementSession,
    storyboardGridOpen,
    strokeGuideRef,
    strokeWidth,
    studioAuthUserId,
    studioBgSceneAssetsError,
    studioBgSceneAssetsLoaded,
    studioBgSceneAssetsLoading,
    studioBrushCatalogHandlers,
    studioBrushR8GrainRenderElements,
    studioCanvasCommentPins,
    studioCanvasViewportHandlers,
    studioCanvasWorkAssetRenderProjection,
    studioCommentActor,
    studioCommentAnchorOptions,
    studioCommentFocusRequest,
    studioCommentInteractionNotice,
    studioCommentPinReanchorDisabledReason,
    studioCommentPinReanchorableThreadIds,
    studioCommentPinsHidden,
    studioCommentSharedReplyController,
    studioCommentSyncError,
    studioCommentThreadPopoverScreenProjectionHandlers,
    studioCommentThreadPopoverTarget,
    studioCommentThreadSession,
    studioCommentThreadSessionView,
    studioCommentViewDocument,
    studioComments,
    studioCrdtDocument,
    studioCrdtOperationSyncReady,
    studioEmeresAssetsError,
    studioEmeresAssetsLoaded,
    studioEmeresAssetsLoading,
    studioFilterApplyBusyRef,
    studioFilterApplying,
    studioFilterDialogImage,
    studioFilterDialogMutationLockReason,
    studioFilterDialogMutationLocked,
    studioFilterMaskMasterRenderElements,
    studioFilterPreparationBusy,
    studioFilterPreview,
    studioFilterSession,
    studioFilterSessionIdRef,
    studioFilterTargetLabel,
    studioFilterUnavailableReason,
    studioHistoryRetention,
    studioHistorySidecarRedoAvailable,
    studioHistorySidecarUndoAvailable,
    studioInspectorAsideHandlers,
    studioLayerLiftDisabledReason,
    studioLayerLiftOptions,
    studioLayerLiftUi,
    studioLayerLiftUiRef,
    studioLazyPanelStackHandlers,
    studioLeftToolRailHandlers,
    studioLegacyCommentThreadIdSet,
    studioLiveJam,
    studioLiveParticipant,
    studioLiveRoomRef,
    studioLiveTransportFactory,
    studioMainMenuGroups,
    studioMenubarActivePageLabel,
    studioMenubarContentHandlers,
    studioMenubarPageLabels,
    studioMobileEditingDockHandlers,
    studioOnCanvasSurfaceHandlers,
    studioOptionalAssets,
    studioOptionsBarsDrawModel,
    studioOptionsBarsHandlers,
    studioOptionsBarsSelectionModel,
    studioPageListPaneHandlers,
    studioPointCommentScreenProjectionHandlers,
    studioRasterAuthorizedAuthorityKey,
    studioRasterHandoffBlocked,
    studioRasterHandoffGates,
    studioRasterHiddenOperationIds,
    studioRasterOverlayElements,
    studioRevisionProjectGenerationRef,
    studioRootRef,
    studioSfx,
    studioStickerAssetsError,
    studioStickerAssetsLoaded,
    studioStickerAssetsLoading,
    studioTeamCommentCapabilities,
    studioTeamCommentsSyncing,
    studioTeamCommentsWorkId,
    studioTeamUnreadCommentIdSet,
    studioToolBeltContentHandlers,
    studioWorkAssetRenderPlaceholders,
    studioWorkAssetRenderProjection,
    submitStudioCommentThreadReply,
    submitStudioPointComment,
    symmetryCenterX,
    symmetryCenterY,
    symmetryRadialCount,
    symmetryType,
    tagsText,
    teamPanelOpen,
    textAiConfigured,
    textAiTransport,
    tiltEnabled,
    timelapseCapturing,
    timelapseOpen,
    timelineFocusedTrackId,
    timelineOpen,
    timelinePlayhead,
    timelinePlaying,
    timelinePreviewFrame,
    tipAngle,
    tipRoundness,
    title,
    titleInputRef,
    toggleCanvasWideMode,
    toggleSelectedElementsLocked,
    toneSearchQuery,
    tool,
    trRef,
    translateBusy,
    translateDraft,
    translateError,
    translateGlossary,
    translateProgress,
    translateTargetLocale,
    tutorialHubOpen,
    tutorialInitialId,
    uiDensityMode,
    undo,
    undoBrushDelete,
    useVelocityPressure,
    userGuides,
    validateRecoveryAccess,
    vanishingPoints,
    velocitySensitivity,
    viewTool,
    viewTransformSuppressed,
    wandTolerance,
    watermark,
    watermarkPreferenceSnapshot,
    webGpuPreviewAuthorized,
    webGpuPreviewStrokes,
    webGpuViewportSurface,
    webtoonGuides,
    webtoonTheme,
    wetMixActive,
    wetMixArmed,
    wetMixBusy,
    wetMixHardness,
    wetMixPickup,
    wetMixRadius,
    wetMixStrength,
    wetMixWetness,
    willImportChoice,
    workHydrated,
    workHydrationFailed,
    workHydrationUnsupportedFormat,
    workId,
    workspaceControlSide,
    workspaceMenuEpoch,
    workspacePersistence,
    workspaceState,
    workspaceSyncNotice,
    wrapRef,
    writerRoom,
    writerRoomAiBusy,
    writerRoomAiDirection,
    writerRoomAiError,
    writerRoomAiReview,
    writerRoomCanvasPlan,
    writerRoomOpen,
    zoom,
    zoomHostRef,
    zoomLocked,
    autosaveDocumentLeadership,
    bg,
    densityShowsStatusRail,
    drawingShortcutNoticeStore,
    hi,
    menuEditRedoDisabled,
    menuEditUndoDisabled,
    presentationPanelsHidden,
    proDrawPrefs,
    remixId,
    studioLiveGesturePreviewAdapter,
    studioRasterHandoffBaseKey,
    studioRasterVisibleDocumentRect,
    studioRoute,
    visibleLeftPanelOpen,
    visibleRightPanelOpen,

  } = s;
  return (
    <StudioLiveCollaborationProvider
      workId={effectiveWorkId}
      participant={studioLiveParticipant}
      currentPageId={activePage.id}
      currentTool={tool}
      outboxScope={studioAuthUserId}
      transportFactory={studioLiveTransportFactory}
      serverRequired={Boolean(studioLiveParticipant && requiresStudioLiveServer)}
      onRoomChange={handleStudioLiveRoomChange}
      onCrdtDocumentChange={handleStudioCrdtDocumentChange}
      onEditSafetyChange={handleStudioLiveEditSafetyChange}
      onAuthoritativeSaveBarrierChange={handleStudioCrdtAuthoritativeSaveBarrierChange}
    >
    <StudioToolHintPreferencesProvider
      mode={appSettings.general.toolHintMode}
      touchHoldDelayMs={appSettings.touch.toolHintHoldMs}
      reduceMotion={appSettings.other.reduceMotion}
    >
    <div
      ref={studioRootRef}
      data-studio-mobile-immersive={mobileImmersive ? "true" : "false"}
      data-studio-editor="true"
      data-studio-app-shell="true"
      data-studio-watermark-persistence={watermarkPreferenceSnapshot.state}
      data-studio-history-entry-count={pagesHistory.length}
      data-studio-history-undo-depth={pagesHi}
      data-studio-history-last-measured-retained-bytes={
        studioHistoryRetention.lastMeasuredRetainedBytes
      }
      data-studio-history-last-measured-budget-bytes={
        studioHistoryRetention.lastMeasuredBudgetBytes
      }
      data-studio-history-last-measured-entry-bytes={
        studioHistoryRetention.lastMeasuredEntryBytes
      }
      data-studio-history-budget-evicted-steps={
        studioHistoryRetention.totalBudgetEvictedSteps
      }
      className={cn(
        // Default draw-app shell: fill the viewport without site chrome padding.
        "flex min-h-0 flex-col bg-canvas text-fg",
        // 전체화면도 평소와 같은 "뷰포트 높이 고정 + 내부만 스크롤" 셸을 쓴다. 예전에는
        // min-h-screen + overflow-y-auto 였는데, 높이 상한이 없어 콘텐츠가 넘치면 셸 자체가
        // 스크롤되면서 상단 메뉴바가 화면 밖으로 밀려났다(전체화면에서 메뉴 사라짐 버그).
        !maximized && !canvasOnlyMode && !mobileImmersive &&
          "h-[100dvh] max-h-[100dvh] overflow-hidden",
        isFullscreen && "bg-canvas",
        maximized && !isMobile && !mobileImmersive &&
          "fixed inset-0 z-[60] overflow-y-auto bg-canvas",
        canvasOnlyMode && !isMobile &&
          "fixed inset-0 z-[70] h-[100dvh] overflow-hidden overscroll-none bg-canvas",
        mobileImmersive &&
          "fixed inset-0 z-[75] h-[100dvh] overflow-hidden overscroll-none bg-canvas"
      )}
      style={
        mobileImmersive
          ? {
              paddingTop: "env(safe-area-inset-top)",
              paddingLeft: "env(safe-area-inset-left)",
              paddingRight: "env(safe-area-inset-right)",
            }
          : undefined
      }
    >
    {/* 파괴적 명령 승인 표면. body 로 포털되므로 위치는 자유롭지만, 스튜디오 셸 안에 두어
        스튜디오가 살아 있는 동안에만 seam 을 소유하게 한다. */}
    <StudioDestructiveConfirmHost />
    <StudioVrmProjectArchiveAttestationHost />
    {pagesHistoryDurabilityStatus.state === "memory-only" ? (
      <div
        data-studio-pages-history-durability="memory-only"
        role="alert"
        aria-live="assertive"
        className="mx-3 mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft/20 px-3 py-2 text-xs text-danger"
      >
        <span className="min-w-0 flex-1 font-medium leading-relaxed">
          페이지 실행 취소 기록을 영구 저장하지 못하고 있습니다. 편집은 이 탭의 메모리에서
          계속되지만, 탭을 닫기 전에 프로젝트를 저장하거나 JSON 백업을 만들어 주세요.
        </span>
        <button
          type="button"
          onClick={retryStudioHistoryDurability}
          className="min-h-11 shrink-0 rounded-lg bg-danger/15 px-3 py-2 font-bold hover:bg-danger/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          복구 기록 저장소 다시 연결
        </button>
      </div>
    ) : pagesHistoryDurabilityStatus.state === "retrying" ? (
      <div
        data-studio-pages-history-durability="retrying"
        role="status"
        aria-live="polite"
        className="mx-3 mt-2 shrink-0 rounded-xl border border-warning/35 bg-warning-soft/20 px-3 py-2 text-xs font-medium text-warning"
      >
        복구 기록 저장소에 다시 연결하는 중입니다. 편집은 계속할 수 있습니다.
      </div>
    ) : null}
    {watermarkPreferenceSnapshot.state === "memory-only" ? (
      <div
        data-studio-watermark-persistence-warning="memory-only"
        role="alert"
        aria-live="assertive"
        className="mx-3 mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft/20 px-3 py-2 text-xs text-danger"
      >
        <span className="min-w-0 flex-1 font-medium leading-relaxed">
          {watermarkPreferenceSnapshot.message}
        </span>
        <button
          type="button"
          onClick={() => void retryWatermarkPreferenceRuntime()}
          className="min-h-11 shrink-0 rounded-lg bg-danger/15 px-3 py-2 font-bold hover:bg-danger/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          워터마크 저장소 다시 연결
        </button>
      </div>
    ) : null}
    <input
      ref={editMenuImageInputRef}
      type="file"
      accept={STUDIO_CANVAS_IMAGE_ACCEPT}
      className="hidden"
      aria-label="편집 메뉴에서 이미지 파일 붙여넣기"
      onChange={onPickImage}
    />
    {/* File-menu import pickers must live outside LazyStudioMenubarContent so clicks work
        even while the menubar chunk is still loading or canvas-only chrome is remounting.
        Same refs are still used by Menubar buttons. */}
    <div data-studio-document-import-inputs="true" className="hidden" aria-hidden>
      <input
        ref={projectImportInputRef}
        type="file"
        accept=".json"
        className="hidden"
        disabled={collaborationDocumentLocked}
        onChange={(event) => {
          void handleImportProject(event);
        }}
        aria-label="프로젝트 JSON 가져오기"
      />
      <input
        ref={projectArchiveImportInputRef}
        type="file"
        accept=".toonproject.zip,.zip,application/zip,application/vnd.toonspectrum.project+zip"
        className="hidden"
        disabled={projectArchiveBusy || collaborationDocumentLocked}
        onChange={(event) => void handleImportProjectArchive(event)}
        aria-label="프로젝트 아카이브 가져오기"
      />
      <input
        ref={brushPackImportInputRef}
        type="file"
        accept={STUDIO_BRUSH_PACK_ACCEPT}
        className="hidden"
        disabled={brushPackImporting}
        onChange={(event) => void handleBrushPackImportFromMenu(event)}
        aria-label="브러시 가져오기 (ABR · MYB · KPP · SUT · SUTG · Krita 번들 · JSON)"
      />
      <input
        ref={psdImportInputRef}
        type="file"
        accept=".psd,image/vnd.adobe.photoshop"
        className="hidden"
        disabled={psdImportBusy || interchangeImportBusy || collaborationDocumentLocked}
        onChange={(event) => void handleImportPsd(event)}
        aria-label="PSD 가져오기"
      />
      <input
        ref={interchangeImportInputRef}
        type="file"
        accept=".ora,.cbz,.will,image/openraster,application/vnd.comicbook+zip,application/vnd.toonspectrum.will-v1-bounded+zip"
        className="hidden"
        disabled={interchangeImportBusy || psdImportBusy || collaborationDocumentLocked}
        onChange={(event) => void handleImportInterchangeArchive(event)}
        aria-label="OpenRaster, CBZ 또는 WILL v1 가져오기"
      />
    </div>
    {quickAccessPaletteOpen && quickAccessState && quickAccessIntegration ? (
      <Suspense
        fallback={(
          <div
            role="status"
            aria-live="polite"
            className="fixed right-3 top-16 z-[70] rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg shadow-lg"
          >
            빠른 액세스를 여는 중…
          </div>
        )}
      >
        <LazyStudioQuickAccessSurface
          state={quickAccessState}
          catalog={quickAccessCatalog}
          isMobile={isMobile}
          onStateChange={changeStudioQuickAccessState}
          onExecute={executeStudioQuickAccessCommand}
          onClose={() => setQuickAccessPaletteOpen(false)}
        />
      </Suspense>
    ) : null}
    {quickComicOpen ? (
      <Suspense
        fallback={(
          <div
            className="fixed inset-0 z-[110] grid place-items-center bg-canvas/80 p-4 text-sm font-semibold text-fg"
            role="status"
            aria-live="polite"
          >
            빠른 웹툰 조립 화면을 여는 중…
          </div>
        )}
      >
        <LazyStudioQuickComicWizard
          onApply={(input) => void applyQuickComicInput(input)}
          onCancel={() => setQuickComicOpen(false)}
        />
      </Suspense>
    ) : null}
    {sceneSnapshotOpen ? (
      <Suspense
        fallback={(
          <div
            className="fixed inset-0 z-[110] grid place-items-center bg-canvas/80 p-4 text-sm font-semibold text-fg"
            role="status"
            aria-live="polite"
          >
            장면 스냅샷 라이브러리를 여는 중…
          </div>
        )}
      >
        <LazyStudioSceneSnapshotDialog
          sourcePage={activePage}
          sourceWorkId={workId}
          theme={webtoonTheme}
          onApply={applySceneSnapshot}
          onClose={() => setSceneSnapshotOpen(false)}
        />
      </Suspense>
    ) : null}
    {animaticTimelineOpen ? (
      <Suspense
        fallback={(
          <div
            className="fixed inset-0 z-[120] grid place-items-center bg-canvas/80 p-4 text-sm font-semibold text-fg"
            role="status"
            aria-live="polite"
          >
            애니매틱 타임라인을 여는 중…
          </div>
        )}
      >
        <LazyStudioAnimaticTimelineDialog
          open
          workScope={effectiveWorkId}
          pages={pages}
          reducedMotion={appSettings.other.reduceMotion}
          onClose={() => setAnimaticTimelineOpen(false)}
        />
      </Suspense>
    ) : null}
    {productionBibleOpen ? (
      <Suspense
        fallback={(
          <div
            className="fixed inset-0 z-[110] grid place-items-center bg-canvas/80 p-4 text-sm font-semibold text-fg"
            role="status"
            aria-live="polite"
          >
            제작 바이블을 여는 중…
          </div>
        )}
      >
        <LazyStudioProductionBibleWorkspace
          open
          onClose={() => setProductionBibleOpen(false)}
          userId={studioAuthUserId}
          workId={workId}
          characterOptions={characterBible.characters.map((character) => ({
            id: character.id,
            label: character.name.trim() || character.id,
          }))}
          assetOptions={productionBibleAssetOptions}
        />
      </Suspense>
    ) : null}
    {!creativeModesOpen ? (
    <button
      ref={creativeModesTriggerRef}
      type="button"
      data-studio-creative-modes-trigger="true"
      // 모바일에서는 도크(z-55) 위 여백에 앉힌다. bottom-4 로 두면 도크 좌측 도구를 덮어
      // 선택·펜 탭이 이 필로 흘러간다. 데스크톱은 도크가 없으므로 lg 에서 원래 자리로 돌아온다.
      className="fixed left-4 bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+4rem)] z-[52] min-h-11 rounded-full border border-accent/50 bg-accent px-3 text-[0.72rem] font-bold text-on-accent shadow-xl lg:bottom-4 lg:z-[69]"
      onClick={() => setCreativeModesOpen(true)}
    >
      {creativeModesLabel}
    </button>
  ) : null}
  {creativeModesOpen ? (
    <div
      ref={creativeModesPanelRef}
      role="dialog"
      aria-label={creativeModesLabel}
      data-studio-creative-modes-panel="true"
      // 뷰포트보다 큰 내용을 안고 화면 밖으로 밀려나지 않도록 높이를 잘라 시트 자체가 스크롤한다.
      // 모바일에서는 도크 위에서 멈춰 도구막대를 계속 쓸 수 있게 두고, 데스크톱 배치는 그대로다.
      className="fixed inset-x-3 bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+0.5rem)] z-[70] flex max-h-[calc(100dvh-var(--studio-canvas-bottom-inset,7rem)-4rem)] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl lg:inset-x-auto lg:left-1/2 lg:bottom-4 lg:max-h-[calc(100dvh-5rem)] lg:w-[min(22rem,calc(100vw-1.5rem))] lg:-translate-x-1/2"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-2 py-1">
        <p className="min-w-0 truncate px-1 text-[0.72rem] font-bold text-fg">{creativeModesLabel}</p>
        <button
          type="button"
          data-studio-creative-modes-close="true"
          data-autofocus
          aria-label={creativeModesCloseLabel}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-[0.9rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => setCreativeModesOpen(false)}
        >
          <span aria-hidden>✕</span>
        </button>
      </div>
      <div
        data-studio-creative-modes-scroll="true"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
      <Suspense fallback={null}>
        <StudioCreativeCompetitorModesPanel
          pixelArtMode={pixelArtMode}
          onPixelArtModeChange={setPixelArtMode}
          silkSpec={silkGenerativeSpec}
          onSilkSpecChange={(spec) => {
            setSilkGenerativeSpec(spec);
            changeStudioSymmetryType("silk");
            setSymmetryRadialCount(spec.arms);
          }}
          onAddStickyNote={insertStudioStickyNote}
          onOpenSculpt={() => {
            setCreativeModesOpen(false);
            openHybridDccWorkspace("sculpt");
          }}
          onStartEphemeralBoard={(session) => {
            // Ephemeral board: focus canvas and keep share path in session for HUD.
            setCreativeModesOpen(false);
            console.info("[studio-ephemeral-board]", session.roomCode, session.title);
          }}
        />
      </Suspense>
      </div>
    </div>
  ) : null}
  {hybridDccRouteRequested && !hybridDccOpen ? (
    <StudioHybridDccRouteGate
      detail={hybridDccRouteAccess === "pending"
        ? "권한·원고·협업 경계를 확인한 뒤 같은 작품의 3D 작업을 엽니다. 기다리는 동안 캔버스와 로컬 3D 원본은 변경되지 않습니다."
        : "이 작품의 3D 원본을 편집할 수 없어 안전하게 캔버스로 돌아갑니다."}
      label={hybridDccRouteAccess === "pending"
        ? "3D 작업 권한을 확인하는 중입니다."
        : "3D 편집 권한을 확인하지 못했습니다."}
      onClose={() => setHybridDccOpen(false)}
      returnFocus={hybridDccReturnFocusRef.current}
    />
  ) : null}
  {hybridDccOpen ? (
    <StudioSurfaceErrorBoundary
      detail="3D 도구 화면만 안전하게 닫았습니다. 현재 캔버스, 문서 변경, 공동작업 연결과 실행 취소 기록은 그대로 보존되어 있습니다."
      onExit={() => setHybridDccOpen(false)}
      resetKey={JSON.stringify([
        hybridDccWorkspaceScope,
        studioRoute.dccMode ?? "model",
      ])}
      returnFocus={hybridDccReturnFocusRef.current}
      surfaceLabel="전문 3D 제작 도구"
    >
      <Suspense
        fallback={(
          <StudioHybridDccRouteGate
            detail="편집 권한과 로컬 복구 범위는 확인됐습니다. 무거운 3D 편집 모듈만 불러오는 중입니다."
            label="전문 3D 제작 도구를 여는 중입니다."
            onClose={() => setHybridDccOpen(false)}
            returnFocus={hybridDccReturnFocusRef.current}
          />
        )}
      >
        <LazyStudioHybridDccDialog
          key={hybridDccWorkspaceScope}
          loading={hybridDccPersistenceStatus === "checking"}
          open
          onClose={() => setHybridDccOpen(false)}
          initialWorkspace={scopedHybridDccWorkspace}
          onWorkbenchModeChange={setHybridDccWorkbenchMode}
          persistenceStatus={hybridDccPersistenceStatus}
          presentation="workspace"
          returnFocus={hybridDccReturnFocusRef.current}
          workbenchMode={studioRoute.dccMode ?? "model"}
          workspaceDocumentId={hybridDccWorkspaceDocumentId}
          onWorkspaceChange={(workspace) => {
            setHybridDccWorkspaceState((current) => (
              current?.scope === hybridDccWorkspaceScope && current?.workspace === workspace
                ? current
                : {
                    scope: hybridDccWorkspaceScope,
                    workspace,
                  }
            ));
            scheduleHybridDccWorkspacePersistence(workspace);
          }}
          onOpenInBackground3D={(result) => {
            announceDrawingShortcut(
              result.losses.length > 0
                ? `3D 장면을 열었습니다 · 파생 손실 ${result.losses.length}건은 DCC 원본에 보존됨`
                : `3D 장면을 열었습니다 · ${result.assets.length}개 메시, ${result.shots.length}개 Shot`,
            );
            bg3dDccSourceRef.current = {
              sourceDocumentId: result.sourceDocumentId,
              sourceStateHash: result.sourceStateHash,
              sourceWorkspaceHash: result.sourceWorkspaceHash,
              sourceBridgeSetHash: result.sourceBridgeSetHash,
              sourceCommandCount: result.sourceCommandCount,
              sourceBridgeCommandSequence: result.sourceBridgeCommandSequence,
            };
            bg3dDccShotMappingsRef.current = result.shots.map((shot) => ({
              sourceShotId: shot.sourceShotId,
              sceneShotId: shot.sceneShotId,
            }));
            setHybridDccOpen(false);
            setBg3dInitialDataUrl(undefined);
            setBg3dInitialElementId(undefined);
            setBg3dInitialScene(result.scene);
            setBg3dOpen(true);
          }}
        />
      </Suspense>
    </StudioSurfaceErrorBoundary>
    ) : null}
    {assetRightsAuditOpen ? (
      <Suspense
        fallback={(
          <div
            className="fixed inset-0 z-[110] grid place-items-center bg-canvas/80 p-4 text-sm font-semibold text-fg"
            role="status"
            aria-live="polite"
          >
            에셋 권리 대장을 만드는 중…
          </div>
        )}
      >
        <LazyStudioAssetRightsAuditDialog
          open
          onClose={() => setAssetRightsAuditOpen(false)}
          workId={workId}
          pages={pages}
        />
      </Suspense>
    ) : null}
    {pendingInterchangeImport ? (
      <Suspense fallback={null}>
        <LazyStudioInterchangeLossPreviewDialog
          open
          preview={pendingInterchangeImport.preview}
          busy={interchangeImportBusy}
          confirmLabel={
            pendingInterchangeImport.kind === "cbz"
              ? `${pendingInterchangeImport.result.pages.length}페이지 추가`
              : pendingInterchangeImport.kind === "will-v1"
                ? "선택한 위치에 WILL v1 추가"
              : "선택한 위치로 가져오기"
          }
          choices={
            pendingInterchangeImport.kind === "cbz"
              ? undefined
              : pendingInterchangeImport.kind === "will-v1"
                ? STUDIO_WILL_V1_IMPORT_PLACEMENT_CHOICES.map((choice) => {
                    const available = choice.id === "new-page"
                      ? pendingInterchangeImport.newPageAllowed
                        && pages.length < STUDIO_PROJECT_MAX_PAGES
                      : pendingInterchangeImport.currentPageAllowed;
                    return available
                      ? choice
                      : {
                          ...choice,
                          disabled: true,
                          description: choice.id === "new-page"
                            ? `프로젝트 저장 한도 ${STUDIO_PROJECT_MAX_PAGES}페이지 또는 페이지당 요소 한도에 도달했습니다.`
                            : "현재 페이지에 추가하면 페이지당 요소 저장 한도를 넘습니다.",
                        };
                  })
                : STUDIO_INTERCHANGE_IMPORT_PLACEMENT_CHOICES.map((choice) =>
                    choice.id === "new-page" && pages.length >= STUDIO_PROJECT_MAX_PAGES
                      ? {
                          ...choice,
                          disabled: true,
                          description: `프로젝트 저장 한도 ${STUDIO_PROJECT_MAX_PAGES}페이지에 도달해 현재 페이지 배치만 사용할 수 있습니다.`,
                        }
                      : choice
                  )
          }
          selectedChoiceId={
            pendingInterchangeImport.kind === "cbz"
              ? undefined
              : pendingInterchangeImport.kind === "will-v1"
                ? willImportChoice ?? undefined
                : interchangeImportChoice
          }
          onSelectedChoiceChange={(choiceId) => {
            if (pendingInterchangeImport.kind === "will-v1") {
              if (
                (choiceId === "current-page" && pendingInterchangeImport.currentPageAllowed) ||
                (
                  choiceId === "new-page" &&
                  pendingInterchangeImport.newPageAllowed &&
                  pages.length < STUDIO_PROJECT_MAX_PAGES
                )
              ) {
                setWillImportChoice(choiceId);
              }
              return;
            }
            if (
              choiceId === "current-page" ||
              (choiceId === "new-page" && pages.length < STUDIO_PROJECT_MAX_PAGES)
            ) {
              setInterchangeImportChoice(choiceId);
            }
          }}
          onConfirm={(choiceId) => void applyPendingInterchangeImport(choiceId)}
          onCancel={dismissPendingInterchangeImport}
        />
      </Suspense>
    ) : null}
    {pendingBrushDelete ? (
      <div
        ref={brushUndoToastRef}
        className="fixed left-1/2 z-[90] flex w-[min(calc(100vw-1.5rem),28rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-warn/40 bg-panel/95 p-2 pl-3 text-xs text-fg shadow-2xl backdrop-blur"
        style={{
          bottom: isMobile
            ? `calc(7.5rem + env(safe-area-inset-bottom) + ${mobileKeyboardInset}px)`
            : "1.5rem",
        }}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        onPointerEnter={() => setPausedBrushDeleteId(pendingBrushDelete.id)}
        onPointerLeave={() => {
          if (!brushUndoToastRef.current?.contains(document.activeElement)) {
            setPausedBrushDeleteId(null);
          }
        }}
        onFocusCapture={() => setPausedBrushDeleteId(pendingBrushDelete.id)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setPausedBrushDeleteId(null);
          }
        }}
      >
        <span className="min-w-0 flex-1 leading-relaxed">
          <strong className="font-semibold">“{pendingBrushDelete.deleted.brush.name}” 삭제됨</strong>
          {pendingBrushDeletes.length > 1 ? ` · 복구 가능 ${pendingBrushDeletes.length}건` : ""}
        </span>
        <button
          ref={brushUndoButtonRef}
          type="button"
          onClick={() => void undoBrushDelete(pendingBrushDelete)}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-warn/15 px-3 font-bold text-warn hover:bg-warn/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Undo2
            size={STUDIO_ICON_SIZE.context}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioChromeIconClass({ tone: "warn" })}
          />
          삭제 취소
        </button>
      </div>
    ) : null}
    <Container
      size="wide"
      className={cn(
        // Canvas-max draw-app shell: full-bleed, no marketing padding or max-width cap.
        "flex min-h-0 flex-1 flex-col !max-w-none !px-0 py-0",
        (isFullscreen || maximized) && "min-h-0"
      )}
    >
      <StudioAppMenubar
        aria-label="문서 메뉴"
        className={cn(
          canvasOnlyMode && "hidden",
          mobileImmersive &&
            "h-auto min-h-11 border-0 bg-transparent shadow-none"
        )}
      >
        <Suspense
          fallback={(
            <div
              aria-hidden
              data-studio-menubar-loading="true"
              className="h-9 min-w-0 flex-1 animate-pulse rounded-lg bg-raised/45 motion-reduce:animate-none"
            />
          )}
        >
          <LazyStudioMenubarContent
            activePageLabel={studioMenubarActivePageLabel}
          activeToolbarGroup={activeToolbarGroup}
          aiProvenance={aiProvenance}
          canvasH={canvasH}
          characterBible={characterBible}
          collaborationDocumentLocked={collaborationDocumentLocked}
          collaborationLockMessage={collaborationLockMessage}
          currentWorkspaceOwnerScope={currentWorkspaceOwnerScope}
          displayLinkedTitleId={displayLinkedTitleId}
          exportFormat={exportFormat}
          exportMenuOpen={exportMenuOpen}
          exportMenuRef={exportMenuRef}
          exportPresetId={exportPresetId}
          exportScale={exportScale}
          exportTransparent={exportTransparent}
          fxPanelLoading={fxPanelLoading}
          isExporting={isExporting}
          isMobile={isMobile}
          liveWorkspaceLayout={liveWorkspaceLayout}
          resolveWorkspaceDeviceKind={currentStudioWorkspaceDeviceKind}
          loadedWork={loadedWork}
          masterEditMode={masterEditMode}
          menu={menu}
          mobileImmersive={mobileImmersive}
          historyPanelOpen={historyPanelOpen}
          openStudioCommentCount={openStudioCommentCount}
          pageCount={studioMenubarPageLabels.length}
          pageEditLocked={pageEditLocked}
          pageLabels={studioMenubarPageLabels}
          dialoguePages={pages}
          projectActionsOpen={projectActionsOpen}
          projectActionsRef={projectActionsRef}
          projectArchiveBusy={projectArchiveBusy}
          projectArchiveImportInputRef={projectArchiveImportInputRef}
          projectArchiveStatus={projectArchiveStatus}
          projectImportInputRef={projectImportInputRef}
          interchangeImportBusy={interchangeImportBusy}
          interchangeImportInputRef={interchangeImportInputRef}
          interchangeImportStatus={interchangeImportStatus}
          psdImportBusy={psdImportBusy}
          psdImportInputRef={psdImportInputRef}
          psdImportStatus={psdImportStatus}
          redoDisabled={menuEditRedoDisabled}
          saving={saving}
          setAiProvenanceOpen={setAiProvenanceOpen}
          setAnimaticTimelineOpen={setAnimaticTimelineOpen}
          setAssetRightsAuditOpen={setAssetRightsAuditOpen}
          setCharacterBibleOpen={setCharacterBibleOpen}
          setCheckpointPanelOpen={setCheckpointPanelOpen}
          setProductionBibleOpen={setProductionBibleOpen}
          setHybridDccOpen={setHybridDccOpen}
          setSceneSnapshotOpen={setSceneSnapshotOpen}
          setExportFormat={setExportFormat}
          setExportMenuOpen={setExportMenuOpen}
          setExportPresetId={setExportPresetId}
          setExportScale={setExportScale}
          setExportTransparent={setExportTransparent}
          setMenu={setMenu}
          setProductionInsightsOpen={setProductionInsightsOpen}
          setProjectActionsOpen={setProjectActionsOpen}
          setPublicationOperationsOpen={setPublicationOperationsOpen}
          setPublishPackageOpen={setPublishPackageOpen}
          setPublishPreflightOpen={setPublishPreflightOpen}
          setWriterRoomOpen={setWriterRoomOpen}
          sharedDocument={sharedDocument}
          studioMainMenuGroups={studioMainMenuGroups}
          title={title}
          undoDisabled={menuEditUndoDisabled}
          watermark={watermark}
          workId={workId}
          workspaceMenuEpoch={workspaceMenuEpoch}
          workspacePersistence={workspacePersistence}
          workspaceState={workspaceState}
          workspaceSyncNotice={workspaceSyncNotice}
          writerRoom={writerRoom}
            stableHandlers={studioMenubarContentHandlers}
          />
        </Suspense>
        <StudioToolHintTarget
          preferredSide="bottom"
          className="hidden shrink-0 lg:inline-flex"
          disabled={collaborationDocumentLocked && !sharedDocument?.capabilities.view}
          unavailableReason={
            collaborationDocumentLocked && !sharedDocument?.capabilities.view
              ? collaborationLockMessage()
              : undefined
          }
          hint={{
            id: "menubar-comment-inbox",
            title: "댓글 검토함",
            description: "문서 댓글을 검색·필터링하고 읽음·해결 상태를 관리하며 연결된 캔버스 위치로 이동합니다.",
            preview: "comment-inbox",
            tip:
              openStudioCommentCount > 0
                ? `아직 해결되지 않은 댓글이 ${openStudioCommentCount}개 있어요.`
                : "댓글 핀을 남기면 검토자가 정확한 페이지·컷·요소 맥락을 바로 확인할 수 있어요.",
          }}
        >
          <button
            type="button"
            data-studio-comments-inbox="true"
            onClick={() => {
              if (commentsOpen) {
                setCommentsOpen(false);
                return;
              }
              openStudioCommentInbox();
            }}
            disabled={collaborationDocumentLocked && !sharedDocument?.capabilities.view}
            aria-expanded={commentsOpen}
            aria-haspopup="dialog"
            aria-controls="studio-comments-review-dialog"
            aria-label={`댓글 검토함${openStudioCommentCount > 0 ? `, 열린 댓글 ${openStudioCommentCount}개` : ""}`}
            className={cn(
              buttonClass({ size: "sm", variant: commentsOpen ? "solid" : "quiet" }),
              "relative min-h-9 shrink-0 gap-1.5 px-2.5 text-[0.72rem] disabled:cursor-not-allowed disabled:opacity-50"
            )}
            title={
              collaborationDocumentLocked && !sharedDocument?.capabilities.view
                ? collaborationLockMessage()
                : commentsOpen
                  ? "댓글 검토함 닫기"
                  : "댓글 검토함 열기 · 검색, 필터, 읽음 상태 관리"
            }
          >
            <MessageCircle
              size={STUDIO_ICON_SIZE.subtab}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
            <span className="max-xl:sr-only">댓글</span>
            {openStudioCommentCount > 0 ? (
              <span
                aria-hidden
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[0.6rem] font-bold tabular-nums text-on-accent"
              >
                {openStudioCommentCount > 99 ? "99+" : openStudioCommentCount}
              </span>
            ) : null}
          </button>
        </StudioToolHintTarget>
      </StudioAppMenubar>

      <div
        data-studio-global-status-rail
        className={cn(
          "shrink-0 px-2",
          mobileImmersive
            ? "max-h-[min(24dvh,10rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
            : "empty:hidden"
        )}
      >
        {densityShowsStatusRail && error ? (
          <div role="status" className="my-1 rounded-lg border border-bad/40 bg-bad/10 px-2.5 py-1.5 text-xs text-bad">{error}</div>
        ) : null}
        {densityShowsStatusRail && layerMergeBusy ? (
          <div role="status" className="my-1 rounded-lg border border-accent/35 bg-accent-soft/30 px-2.5 py-1.5 text-xs text-fg-2">
            레이어를 병합하는 중…
          </div>
        ) : null}
        {densityShowsStatusRail && macroSession.recording ? (
          <div role="status" className="my-1 rounded-lg border border-bad/30 bg-bad/10 px-2.5 py-1.5 text-xs font-semibold text-bad">
            매크로 녹음 중 · {macroSession.commands.length}단계
          </div>
        ) : null}
        {densityShowsStatusRail && expectsSharedDocument && (!mobileImmersive || collaborationDocumentLocked) ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy={!workHydrated || collaborationOperationSyncPending}
            className={cn(
              "my-1 flex min-h-9 items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
              collaborationDocumentLocked
                ? "border-warn/40 bg-warn/10 text-fg"
                : "border-good/35 bg-good/10 text-fg"
            )}
          >
            {collaborationDocumentLocked ? (
            <Lock
              size={STUDIO_ICON_SIZE.nav}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={cn(
                "mt-0.5 shrink-0",
                studioChromeIconClass({ tone: collaborationDocumentLocked ? "warn" : "good" })
              )}
            />
          ) : (
            <UsersRound
              size={STUDIO_ICON_SIZE.nav}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={cn("mt-0.5 shrink-0", studioChromeIconClass({ tone: "good" }))}
            />
          )}
            <span className="min-w-0 flex-1">
              <strong className="block text-sm font-semibold">
                {!sharedDocument
                  ? workHydrated
                    ? "공동 문서를 열지 못했어요"
                    : "공동 문서 권한을 확인하고 있어요"
                  : collaborationOperationSyncPending
                    ? "동시 편집 연산 동기화 중"
                    : collaborationReadOnly
                    ? `${collaborationRoleLabel()} · 읽기 전용`
                    : `${collaborationRoleLabel()} · 공동 편집 가능`}
              </strong>
              <span className="mt-0.5 block text-xs leading-relaxed text-fg-2">
                {collaborationDocumentLocked
                  ? collaborationLockMessage()
                  : sharedDocumentNotice ??
                    `서버 revision ${sharedDocument?.revision ?? "—"} 기준으로 안전하게 저장합니다.`}
              </span>
            </span>
            {sharedDocument ? (
              <span className="shrink-0 rounded-full border border-line bg-card px-2 py-1 text-[0.6875rem] font-semibold tabular-nums text-fg-2">
                r{sharedDocument.revision}
              </span>
            ) : workHydrated ? (
              <button
                type="button"
                onClick={() => globalThis.location.reload()}
                className="min-h-11 shrink-0 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                다시 시도
              </button>
            ) : null}
          </div>
        ) : null}
        {studioHistoryRetention.notice && !mobileImmersive && !canvasOnlyMode ? (
          <div
            key={studioHistoryRetention.notice.id}
            data-studio-history-budget-notice="true"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="my-1 flex min-h-9 items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-xs text-fg-2"
          >
            <Undo2
              size={STUDIO_ICON_SIZE.context}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={cn(
                "mt-0.5 shrink-0",
                studioChromeIconClass({ tone: "warn" })
              )}
            />
            <span className="min-w-0 flex-1 leading-relaxed">
              {studioHistoryRetention.notice.message}
            </span>
          </div>
        ) : null}
        {/* 게시·로그인 안내는 드로잉 크롬에 띄우지 않음 — 저장/게시 액션 시점에만 노출. */}
        {(publishContext.series || publishContext.challenge) && !mobileImmersive && !canvasOnlyMode ? (
          <Suspense fallback={null}>
            <StudioPublishContextBanner
              context={publishContext}
              className="my-1 mb-1 px-2.5 py-1.5 text-xs"
            />
          </Suspense>
        ) : null}
      </div>

      {/*
        선택 옵션 줄의 자리를 미리 확보한다 — 선택이 생겨도 스트립이 새로 flow 에
        끼어들지 않으므로 캔버스 원점이 0px 이동한다. 빈 줄로 두면 고장처럼 보여서
        같은 높이의 안내 줄을 세워 둔다(오버레이가 아니라 예약이라 캔버스를 가리지도
        않는다).
      */}
      {selectOptionsLaneReserved && !studioOptionsBarsSelectionModel.visible ? (
        <div
          data-studio-select-options-reserve="true"
          data-studio-select-options-armed={selectOptionsStripArmed ? "true" : "false"}
          data-studio-icon-first="true"
          className="relative z-[40] flex h-11 min-h-11 shrink-0 items-center gap-1.5 overflow-hidden border-b border-line bg-panel/70 px-2.5 text-[0.7rem] text-fg-3"
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-line" />
          <span className="truncate">
            {selectOptionsStripArmed
              ? "요소를 클릭하면 선택 옵션이 여기에 표시됩니다 · 드래그로 여러 개 선택"
              : "선택 도구(V)로 요소를 고르면 복제·정렬·잠금 옵션이 여기에 표시됩니다"}
          </span>
        </div>
      ) : null}
      <StudioOptionsBars
        draw={studioOptionsBarsDrawModel}
        selection={studioOptionsBarsSelectionModel}
        stableHandlers={studioOptionsBarsHandlers}
      />

      {brushCatalogSession ? (
        <Suspense fallback={null}>
          <StudioBrushCatalogPortal
            open
            placement={brushCatalogSession.placement}
            triggerElement={brushCatalogSession.trigger}
            activeBrushId={activeCatalogBrush.id}
            operation={drawMode === "eraser" ? "erase" : "paint"}
            favoriteIds={proDrawPrefs.favoriteBrushIds}
            recentIds={proDrawPrefs.recentBrushIds}
            restoredView={
              proDrawPrefs.brushLibraryView[drawMode === "eraser" ? "erase" : "paint"]
            }
            onViewStateChange={studioBrushCatalogHandlers.rememberView}
            mobileKeyboardInset={mobileKeyboardInset}
            onClose={studioBrushCatalogHandlers.close}
            onSelect={applyStudioBrushCatalogSelection}
            onToggleFavorite={studioBrushCatalogHandlers.toggleFavorite}
          />
        </Suspense>
      ) : null}

      {/* Legacy tool belt: primary on mobile. Desktop menubar/rail own discovery. Keep the
          component mounted so its body portals can serve rail-triggered panels, but hide its DOM
          host completely on desktop; a zero-size overflow-visible host still painted children at
          y < 0 and widened the editor scroll geometry. */}
      <StudioToolBelt
        inert={!isMobile}
        aria-hidden={!isMobile}
        className={cn(
          canvasOnlyMode && "hidden",
          // Immersive mobile already exposes the same frequent actions in its 44px thumb dock.
          // Removing the 4.7x-wide belt restores canvas height and eliminates undiscoverable scroll.
          mobileImmersive && "max-lg:hidden",
          // Portalled popovers attach to body, so display:none on this host does not clip them.
          "lg:hidden",
          // 모바일은 정상 클릭.
          "max-lg:pointer-events-auto"
        )}
      >
        <StudioToolBeltContent
          activePage={activePage}
          activeServerAiProviderLabel={activeServerAiProviderLabel}
          activeSurfaceReviewLocked={activeSurfaceReviewLocked}
          activeToolbarGroup={activeToolbarGroup}
          advancedFillActive={advancedFillActive}
          advancedFillUnsupportedReason={advancedFillUnsupportedReason}
          aiAssistTool={aiAssistTool}
          aiBgBusy={aiBgBusy}
          aiBgError={aiBgError}
          aiBgPrompt={aiBgPrompt}
          aiBgSize={aiBgSize}
          aiCharacterBusy={aiCharacterBusy}
          aiCharacterError={aiCharacterError}
          aiCharacterPrompt={aiCharacterPrompt}
          aiCompositionDraft={aiCompositionDraft}
          aiDialogueSuggestBusy={aiDialogueSuggestBusy}
          aiDialogueSuggestCandidates={aiDialogueSuggestCandidates}
          aiDialogueSuggestError={aiDialogueSuggestError}
          aiDialogueSuggestIncludeContext={aiDialogueSuggestIncludeContext}
          aiDialogueSuggestSituation={aiDialogueSuggestSituation}
          aiPaletteSuggestBusy={aiPaletteSuggestBusy}
          aiPaletteSuggestError={aiPaletteSuggestError}
          aiPaletteSuggestion={aiPaletteSuggestion}
          aiPaletteSuggestMood={aiPaletteSuggestMood}
          aiPaletteSuggestSavedMsg={aiPaletteSuggestSavedMsg}
          aiRecentPrompts={aiRecentPrompts}
          aiSettings={aiSettings}
          assetFavoriteOnly={assetFavoriteOnly}
          assetFavoriteState={assetFavoriteState}
          assetGenerating={assetGenerating}
          assetPrompt={assetPrompt}
          assetPromptName={assetPromptName}
          assetPromptQuality={assetPromptQuality}
          assetPromptSize={assetPromptSize}
          assets={assets}
          assetSearchQuery={assetSearchQuery}
          assetsLoading={assetsLoading}
          assetSortOrder={assetSortOrder}
          assetTab={assetTab}
          bg={bg}
          bg3dOpen={admittedBg3dOpen}
          bgGrad={bgGrad}
          bgSceneGenreFilter={bgSceneGenreFilter}
          bgSceneSearchQuery={bgSceneSearchQuery}
          bgSceneSectionsFiltered={bgSceneSectionsFiltered}
          builtinRasterBusyId={builtinRasterBusyId}
          canvasH={canvasH}
          canvasOnlyMode={canvasOnlyMode}
          clips={clips}
          collaborationDocumentLocked={collaborationDocumentLocked}
          collaborationLockMessage={collaborationLockMessage}
          color={color}
          commentsOpen={commentsOpen}
          configuredServerAiProviders={configuredServerAiProviders}
          continuityOpen={continuityOpen}
          dialogueScript={dialogueScript}
          drawMode={drawMode}
          elements={elements}
          emeresCategoryFilter={emeresCategoryFilter}
          emeresFlatCatalog={emeresFlatCatalog}
          emeresSearchQuery={emeresSearchQuery}
          emeresSectionsFiltered={emeresSectionsFiltered}
          emeresSimilarAnchor={emeresSimilarAnchor}
          emeresSimilarSiblings={emeresSimilarSiblings}
          emeresTab={emeresTab}
          emeresUnderlayCount={emeresUnderlayCount}
          frameAnimOpen={frameAnimOpen}
          frameAnimTargetId={frameAnimTargetId}
          fxComicFiltered={fxComicFiltered}
          fxCreatureFiltered={fxCreatureFiltered}
          fxEmojisFiltered={fxEmojisFiltered}
          fxLinePresetsFiltered={fxLinePresetsFiltered}
          fxOverlaysFiltered={fxOverlaysFiltered}
          fxPickerHasResults={fxPickerHasResults}
          fxPickerSection={fxPickerSection}
          fxPropFiltered={fxPropFiltered}
          fxQuery={fxQuery}
          fxRasterFiltered={fxRasterFiltered}
          fxSearchQuery={fxSearchQuery}
          fxSectionVisible={fxSectionVisible}
          fxSfxFiltered={fxSfxFiltered}
          hi={hi}
          history={history}
          historyPanelOpen={historyPanelOpen}
          isFullscreen={isFullscreen}
          toggleWorkspaceWideMode={toggleCanvasWideMode}
          magicResizeStrategy={magicResizeStrategy}
          masterEditMode={masterEditMode}
          maximized={maximized}
          menu={menu}
          menuRef={menuRef}
          openStudioCommentCount={openStudioCommentCount}
          pageEditLocked={pageEditLocked}
          pageReviewOpen={pageReviewOpen}
          panelLayoutPresets={panelLayoutPresets}
          panelLayoutsError={panelLayoutsError}
          panelLayoutsLoading={panelLayoutsLoading}
          mannequinPoserOpen={admittedMannequinPoserOpen}
          setMannequinPoserOpen={setMannequinPoserOpen}
          poserVrmOpen={admittedPoserVrmOpen}
          presentationPanelsHidden={presentationPanelsHidden}
          publishingId={publishingId}
          rasterFavoriteOnly={rasterFavoriteOnly}
          recentColors={recentColors}
          referencePanelOpen={referencePanelOpen}
          renamingAssetId={renamingAssetId}
          renamingAssetName={renamingAssetName}
          sceneSimilarAnchor={sceneSimilarAnchor}
          sceneSimilarSiblings={sceneSimilarSiblings}
          sceneTemplates={sceneTemplates}
          sceneTemplatesError={sceneTemplatesError}
          sceneTemplatesLoading={sceneTemplatesLoading}
          selected={selectedForInspector}
          serverAiProvider={serverAiProvider}
          serverAiStatus={serverAiStatus}
          setAiAssistTool={setAiAssistTool}
          setAiBgPrompt={setAiBgPrompt}
          setAiBgSize={setAiBgSize}
          setAiCharacterPrompt={setAiCharacterPrompt}
          setAiCompositionDraft={setAiCompositionDraft}
          setAiDialogueSuggestIncludeContext={setAiDialogueSuggestIncludeContext}
          setAiDialogueSuggestSituation={setAiDialogueSuggestSituation}
          setAiPaletteSuggestMood={setAiPaletteSuggestMood}
          setAiRecentPrompts={setAiRecentPrompts}
          setAssetFavoriteOnly={setAssetFavoriteOnly}
          setAssetPrompt={setAssetPrompt}
          setAssetPromptName={setAssetPromptName}
          setAssetPromptQuality={setAssetPromptQuality}
          setAssetPromptSize={setAssetPromptSize}
          setAssetSearchQuery={setAssetSearchQuery}
          setAssetSortOrder={setAssetSortOrder}
          setAssetTab={setAssetTab}
          setBg3dInitialDataUrl={setBg3dInitialDataUrl}
          setBg3dInitialElementId={setBg3dInitialElementId}
          setBg3dInitialScene={setBg3dInitialScene}
          setBg3dOpen={setBg3dOpen}
          setBgSceneGenreFilter={setBgSceneGenreFilter}
          setBgSceneSearchQuery={setBgSceneSearchQuery}
          setColor={setColor}
          setCommentsOpen={setCommentsOpen}
          setContinuityOpen={setContinuityOpen}
          setDialogueBatchOpen={setDialogueBatchOpen}
          setDialogueScript={setDialogueScript}
          setDialogueTranslateOpen={setDialogueTranslateOpen}
          setDrawMode={setDrawMode}
          setEmeresCategoryFilter={setEmeresCategoryFilter}
          setEmeresSearchQuery={setEmeresSearchQuery}
          setEmeresSimilarAnchorId={setEmeresSimilarAnchorId}
          setEmeresTab={setEmeresTab}
          setFxPickerSection={setFxPickerSection}
          setFxSearchQuery={setFxSearchQuery}
          setHistoryPanelOpen={setHistoryPanelOpen}
          setLeftPanelOpen={setLeftPanelOpenWithOverride}
          setMagicResizeStrategy={setMagicResizeStrategy}
          setMenu={setMenu}
          setPageReviewOpen={setPageReviewOpen}
          setPoserVrmOpen={setPoserVrmOpen}
          setRasterFavoriteOnly={setRasterFavoriteOnly}
          setReferencePanelOpen={setReferencePanelOpen}
          setRenamingAssetId={setRenamingAssetId}
          setRenamingAssetName={setRenamingAssetName}
          setRightPanelOpen={setRightPanelOpenWithOverride}
          setScale={setScale}
          setScenarioOpen={setScenarioOpen}
          setSceneSimilarAnchorId={setSceneSimilarAnchorId}
          setScrollPreviewOpen={setScrollPreviewOpen}
          setStoryboardGridOpen={setStoryboardGridOpen}
          setTeamPanelOpen={setTeamPanelOpen}
          setTimelapseOpen={setTimelapseOpen}
          setTimelineOpen={setTimelineOpen}
          setToneSearchQuery={setToneSearchQuery}
          setTool={setTool}
          setZoom={setZoom}
          sfxError={sfxError}
          sfxLoading={sfxLoading}
          sfxPacks={sfxPacks}
          shared={shared}
          sharedDocument={sharedDocument}
          sharedError={sharedError}
          sharedHasMore={sharedNextOffset !== null}
          sharedLoading={sharedLoading}
          sharedLoadingMore={sharedLoadingMore}
          studioBgSceneAssetsError={studioBgSceneAssetsError}
          studioBgSceneAssetsLoaded={studioBgSceneAssetsLoaded}
          studioBgSceneAssetsLoading={studioBgSceneAssetsLoading}
          studioEmeresAssetsError={studioEmeresAssetsError}
          studioEmeresAssetsLoaded={studioEmeresAssetsLoaded}
          studioEmeresAssetsLoading={studioEmeresAssetsLoading}
          studioOptionalAssets={studioOptionalAssets}
          studioSfx={studioSfx}
          studioStickerAssetsError={studioStickerAssetsError}
          studioStickerAssetsLoaded={studioStickerAssetsLoaded}
          studioStickerAssetsLoading={studioStickerAssetsLoading}
          teamPanelOpen={teamPanelOpen}
          textAiConfigured={textAiConfigured}
          textAiTransport={textAiTransport}
          timelineOpen={timelineOpen}
          toneSearchQuery={toneSearchQuery}
          tool={tool}
          uiDensityMode={uiDensityMode}
          visibleLeftPanelOpen={visibleLeftPanelOpen}
          visibleRightPanelOpen={visibleRightPanelOpen}
          wrapRef={wrapRef}
          zoom={zoom}
          stableHandlers={studioToolBeltContentHandlers}
        />
      </StudioToolBelt>

      {pageEditLocked && !masterEditMode ? (
        <div
          role="status"
          className={cn(
            "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/35 bg-warning-soft/20 px-3 py-2 text-xs text-warning",
            mobileImmersive &&
              "max-h-[min(20dvh,7rem)] shrink-0 overflow-y-auto overscroll-contain"
          )}
        >
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Lock size={13} aria-hidden /> 현재 페이지는 검토 잠금 상태라 콘텐츠 변경이 차단됩니다.
          </span>
          <button
            type="button"
            onClick={() => setPageReviewOpen(true)}
            className="rounded-lg border border-warning/35 bg-panel/70 px-2.5 py-1 font-bold hover:bg-panel"
          >
            검토 설정 열기
          </button>
        </div>
      ) : null}

      <div
        data-studio-mobile-canvas-workspace={isMobile ? "true" : undefined}
        className={cn(
          // Edge-dock workspace: the mobile dock overlays the scrollport instead of shrinking this
          // flex lane. StudioCanvasViewport owns the matching scroll-safe inset, so the final canvas
          // pixels remain reachable while the full dynamic viewport stays available for drawing.
          "flex min-h-0 flex-1 flex-col gap-0 pb-0 lg:flex-row lg:overflow-hidden",
          canvasOnlyMode && "overflow-hidden",
          mobileImmersive && "overflow-hidden"
        )}
      >
        {/* 모달 시트 전용 스크림. 브러시 설정(draw)은 캔버스를 계속 만질 수 있는 비모달이다. */}
        {isMobile && modalMobileSheet && (
          <div
            aria-hidden
            data-studio-modal-backdrop="true"
            onPointerDown={(event) => {
              // The scrim itself is not a focus target. Prevent the pointer's default focus move
              // from overriding the modal controller's launcher-focus restoration during unmount.
              event.preventDefault();
              dismissActiveMobileSheet();
            }}
            className="fixed inset-0 z-[59] bg-black/45 backdrop-blur-sm lg:hidden"
          />
        )}
        {/* 왼쪽: 페이지 목록 — 접히면 아이콘 엣지 레일 */}
        <Suspense
          fallback={(
            <div
              aria-hidden="true"
              data-studio-page-list-loading="true"
              className="hidden w-12 shrink-0 border-r border-line bg-panel lg:block"
            />
          )}
        >
          <LazyStudioPageListPane
            collaborationDocumentLocked={collaborationDocumentLocked}
            collaborationLockMessage={collaborationLockMessage}
            composeWorkAssetPreviewPage={composeWorkAssetPreviewPage}
            currentPageId={currentPageId}
            isMobile={isMobile}
            leftResize={leftResize}
            master={master}
            masterEditMode={masterEditMode}
            masterPanelOpen={masterPanelOpen}
            metaEditPageId={metaEditPageId}
            mobileKeyboardInset={mobileKeyboardInset}
            mobileSheet={mobileSheet}
            pageDnd={pageDnd}
            pages={pages}
            pagesSheetRef={pagesSheetRef}
            presentationPanelsHidden={presentationPanelsHidden}
            setCurrentPageId={setCurrentPageId}
            setLeftPanelOpen={setLeftPanelOpenWithOverride}
            setMasterPanelOpen={setMasterPanelOpen}
            setMetaEditPageId={setMetaEditPageId}
            setMobileSheet={setMobileSheet}
            visibleLeftPanelOpen={visibleLeftPanelOpen}
            stableHandlers={studioPageListPaneHandlers}
          />
        </Suspense>

        {/* Left vertical toolbar — desktop only; mobile uses bottom dock / horizontal belt */}
        <Suspense
          fallback={(
            <div
              aria-hidden="true"
              data-studio-left-tool-rail-loading="true"
              className="hidden w-12 shrink-0 border-r border-line bg-panel lg:block"
            />
          )}
        >
        <LazyStudioLeftToolRail
          activeSurfaceReviewLocked={activeSurfaceReviewLocked}
          pixelToolTargetAvailable={pixelToolTargetAvailable}
          rasterRetouchTargetAvailable={rasterRetouchTargetAvailable}
          advancedFillActive={advancedFillActive}
          advancedFillUnsupportedReason={advancedFillUnsupportedReason}
          appSettings={appSettings}
          appSettingsOpen={appSettingsOpen}
          canvasOnlyMode={canvasOnlyMode}
          commentPinArmed={commentPlacementActive}
          cropActive={cropRect !== null}
          drawMode={drawMode}
          drawShape={drawShape}
          eyedropperActive={eyedropperActive}
          frameAnimOpen={frameAnimOpen}
          frameAnimTargetId={frameAnimTargetId}
          isRailToolVisible={isRailToolVisible}
          liquifyActive={liquifyActive}
          mobileImmersive={mobileImmersive}
          perspectiveRulerActive={perspectiveRulerActive}
          pixelForceCircle={pixelForceCircle}
          pixelSel={pixelSel}
          pixelTool={pixelTool}
          quickShapeActive={quickShapeActive}
          railMoreOpen={railMoreOpen}
          referencePanelOpen={referencePanelOpen}
          mannequinPoserOpen={admittedMannequinPoserOpen}
          poserVrmOpen={admittedPoserVrmOpen}
          bg3dOpen={admittedBg3dOpen}
          hybridDccOpen={hybridDccOpen}
          selected={selected}
          selectedImageMutationLocked={selectedImageMutationLocked}
          setAppSettingsInitialTab={setAppSettingsInitialTab}
          setAppSettingsOpen={setAppSettingsOpen}
          setDrawShape={setDrawShape}
          setEyedropperActive={setEyedropperActive}
          setMenu={setMenu}
          setPerspectiveRulerActive={setPerspectiveRulerActive}
          setPixelForceCircle={setPixelForceCircle}
          setPixelTool={setPixelTool}
          setQuickShapeActive={setQuickShapeActive}
          setRailMoreOpen={setRailMoreOpen}
          setReferencePanelOpen={setReferencePanelOpen}
          setMannequinPoserOpen={setMannequinPoserOpen}
          setPoserVrmOpen={setPoserVrmOpen}
          setBg3dOpen={setBg3dOpen}
          setHybridDccOpen={setHybridDccOpen}
          setStrokeWidth={setStrokeWidth}
          setTool={setTool}
          setViewTool={setViewTool}
          dodgeBurnActive={dodgeBurnActive}
          wetMixActive={wetMixActive}
          smudgeActive={smudgeActive}
          tool={tool}
          uiDensityMode={uiDensityMode}
          viewTransformSuppressed={viewTransformSuppressed}
          viewTool={viewTool}
          stableHandlers={studioLeftToolRailHandlers}
        />
        </Suspense>

        {/* 중앙: 캔버스 + 우측 인스펙터 — 데스크톱에서는 한 행으로 남은 높이를 공유한다. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div
            className={cn(
              "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              showRulers && !canvasOnlyMode && "lg:pl-[22px] lg:pt-[22px]"
            )}
            data-studio-canvas-ruler-layout={
              showRulers && !canvasOnlyMode ? "inset-top-left" : "off"
            }
          >
          {showRulers && !canvasOnlyMode ? (
            <Suspense fallback={null}>
              {/* 룰러 눈금은 스크롤 오프셋을 프레임 단위로 따라가야 한다. 스토어를 구독해
                  이 서브트리만 다시 그리고, 페이지 커밋은 만들지 않는다. */}
              <StudioScrollViewportSubscriber
                store={scrollViewportStore}
                render={(viewport) => (
                  <StudioCanvasRulerBars
                    visible
                    scale={effScale}
                    scrollLeft={viewport.left}
                    scrollTop={viewport.top}
                    canvasWidth={CANVAS_W}
                    canvasHeight={canvasH}
                    guides={canvasGuides}
                    onAddGuide={(axis, pos) => {
                      setCanvasGuides((g) => ({
                        ...g,
                        [axis === "h" ? "horizontal" : "vertical"]: [
                          ...g[axis === "h" ? "horizontal" : "vertical"],
                          pos,
                        ],
                      }));
                    }}
                  />
                )}
              />
            </Suspense>
          ) : null}
          <StudioCanvasViewport
          liveDynamicBrushOverlayRenderer={liveDynamicBrushOverlayRenderer}
          liveWetInkOverlayRenderer={liveWetInkOverlayRenderer}
          inkMeshLivePreviewRuntime={inkMeshLivePreviewRuntime}
          liveInkPredictionRenderer={liveInkPredictionRenderer}
          liveRetainedMediaOverlayRenderer={liveRetainedMediaOverlayRenderer}
          liveStampOverlayRenderer={liveStampOverlayRenderer}
          bubbleShapeActiveHandleIndex={bubbleShapeActiveHandleIndex}
          draftPreviewStore={draftPreviewStore}
          liveDrawPressureStore={liveDrawPressureStore}
          liveInkOverlayRenderer={liveInkOverlayRenderer}
          nodeEditActiveHandleIndex={nodeEditActiveHandleIndex}
          activeDialogueLocale={activeDialogueLocale}
          activeCatalogBrushName={activeCatalogBrush.name}
          activePage={activePage}
          activePageIndex={activePageIndex}
          activeSurfaceReviewLocked={activeSurfaceReviewLocked}
          activeServerAiProviderLabel={activeServerAiProviderLabel}
          advancedFillActive={advancedFillActive}
          advancedFillArmed={advancedFillArmed}
          advancedFillBusy={advancedFillBusy}
          advancedFillPreview={advancedFillPreview}
          advancedRulers={advancedRulers}
          aiNoticeOpen={aiNoticeOpen}
          animTimeline={animTimeline}
          appSettings={appSettings}
          appSettingsInitialTab={appSettingsInitialTab}
          appSettingsOpen={appSettingsOpen}
          appSettingsPersistenceState={appSettingsPersistenceState}
          authorizedWorkAssetScopeId={authorizedWorkAssetScopeId}
          autosaveRestoreBlockedReason={autosaveRestoreBlockedReason}
          bg={bg}
          bgGrad={bgGrad}
          brush={brush}
          brushCursorRef={brushCursorRef}
          strokeGuideRef={strokeGuideRef}
          brushOpacity={brushOpacity}
          bubbleShapeArmed={bubbleShapeArmed}
          bubbleShapeDraft={bubbleShapeDraft}
          bubbleShapeHandles={bubbleShapeHandles}
          canvasFlipH={canvasFlipH}
          canvasRotation={canvasRotation}
          canvasH={canvasH}
          canvasOnlyMode={canvasOnlyMode}
          canvasInteractionBlocked={canvasInteractionBlocked}
          canvasScrollViewport={scrollPos}
          scrollViewportStore={scrollViewportStore}
          hardCanvasInteractionBlock={hardCanvasInteractionBlock}
          collaborationDocumentLocked={collaborationDocumentLocked}
          collaborationDocumentUnavailable={collaborationDocumentUnavailable}
          collaborationLockMessage={collaborationLockMessage}
          closeViewToolWithFocus={studioCanvasViewportHandlers.closeViewToolWithFocus}
          colorBlindPreview={colorBlindPreview}
          commentPinArmed={commentPinArmed}
          commentQuickReplyActive={
            studioCommentThreadSession.surface === "pin-quick-reply"
            && studioCommentThreadPopoverTarget !== null
          }
          cropArmed={cropArmed}
          cropRect={cropRect}
          dialogueBatchOpen={dialogueBatchOpen}
          dialogueTranslateOpen={dialogueTranslateOpen}
          drawingRef={drawingRef}
          drawingShortcutNoticeStore={drawingShortcutNoticeStore}
          drawMode={drawMode}
          drawShape={drawShape}
          editing={editing}
          eyedropperActive={eyedropperActive}
          effScale={effScale}
          elementById={elementById}
          elements={studioBrushR8GrainRenderElements}
          studioLiveGesturePreviewAuthoritativeElementIds={elements.map((element) => element.id)}
          studioFilterPageComposite={
            studioFilterSession?.target === "page-composite" &&
            studioFilterSession.pageId === activePage.id &&
            studioFilterSession.historyIndex === pagesHi &&
            !masterEditMode
              ? studioFilterSession.image
              : null
          }
          studioFilterPreview={studioFilterPreview}
          followingStudioSessionId={followingStudioSessionId}
          frameAnimEl={frameAnimEl}
          frameAnimOpen={frameAnimOpen}
          frameAnimTargetId={frameAnimTargetId}
          gpuCanvasShadowVisibleRef={gpuCanvasShadowVisibleRef}
          gpuLiveInkPinnedRef={gpuLiveInkPinnedRef}
          livingInkOverlayVisibleRef={livingInkOverlayVisibleRef}
          gridSize={gridSize}
          groups={groups}
          guides={guides}
          hasAutosave={hasAutosave}
          autosaveDocumentLeadership={autosaveDocumentLeadership}
          autosaveLiveJam={studioLiveJam}
          healCloneArmed={healCloneArmed}
          healCloneCursorRef={healCloneCursorRef}
          healCloneDragPreview={healCloneDragPreview}
          healCloneRadius={healCloneRadius}
          healCloneSourceAnchor={healCloneSourceAnchor}
          healCloneSourceCursorRef={healCloneSourceCursorRef}
          healCloneTool={healCloneTool}
          historyBrushArmed={historyBrushArmed}
          historyBrushCursorRef={historyBrushCursorRef}
          historyBrushDragPreview={historyBrushDragPreview}
          historyBrushRadius={historyBrushRadius}
          historyBrushSourceIndex={historyBrushSourceIndex}
          historyPanelOpen={historyPanelOpen}
          isExporting={isExporting}
          isMobile={isMobile}
          isometricAngleDeg={isometricAngleDeg}
          isometricCellSize={isometricCellSize}
          isometricGridActive={isometricGridActive}
          isometricOriginX={isometricOriginX}
          isometricOriginY={isometricOriginY}
          isPanning={isPanning}
          isSpacePressed={isSpacePressed}
          filterMaskCursorRef={filterMaskCursorRef}
          filterMaskDragPreview={filterMaskDragPreview}
          filterMaskPaintArmed={filterMaskPaintArmed}
          filterMaskPaintMode={filterMaskPaintMode}
          filterMaskRadius={filterMaskRadius}
          layerMaskCursorRef={layerMaskCursorRef}
          layerMaskDragPreview={layerMaskDragPreview}
          layerMaskPaintArmed={layerMaskPaintArmed}
          layerMaskPaintMode={layerMaskPaintMode}
          layerMaskRadius={layerMaskRadius}
          quickMaskArmed={quickMaskArmed}
          quickMaskBrushMode={quickMaskBrushMode}
          quickMaskDragPreview={quickMaskDragPreview}
          quickMaskRadius={quickMaskRadius}
          quickMaskTintCanvas={quickMaskTintCanvas}
          quickMaskTintColor={quickMaskTintColor}
          quickMaskTintOpacity={quickMaskTintOpacity}
          localHiddenElementIds={localHiddenElementIds}
          liveDraftDirectRef={liveDraftDirectRef}
          draftPreviewDynamicLayerRef={draftPreviewDynamicLayerRef}
          draftPreviewNormalLayerRef={draftPreviewNormalLayerRef}
          liveDraftLayerRef={liveDraftLayerRef}
          liveDraftVisualRef={liveDraftVisualRef}
          liveInkOverlayRendererRef={liveInkOverlayRendererRef}
          mainLayerRef={mainLayerRef}
          marqueeIds={marqueeIds}
          activeGroupId={activeGroupId}
          marqueeRectNodeRef={marqueeRectNodeRef}
          master={master}
          masterEditMode={masterEditMode}
          masterPanelOpen={masterPanelOpen}
          masterRenderEls={studioFilterMaskMasterRenderElements}
          mobileImmersive={mobileImmersive}
          mobileKeyboardInset={mobileKeyboardInset}
          navigate={navigate}
          nodeEditArmed={nodeEditArmed}
          nodeEditDraft={nodeEditDraft}
          nodeEditHandles={nodeEditHandles}
          nodeEditTool={nodeEditTool}
          nodeRefsRef={nodeRefsRef}
          onionSkin={onionSkin}
          pageGrade={pageGrade}
          pageGradeCss={pageGradeCss}
          pages={pages}
          pageSequenceOpen={pageSequenceOpen}
          pagesHi={pagesHi}
          pagesHistory={pagesHistory}
          panelGutter={panelGutter}
          panelSplitArmed={panelSplitArmed}
          panelSplitPreview={panelSplitPreview}
          perspectiveRulerActive={perspectiveRulerActive}
          pixelDragPreview={pixelDragPreview}
          pixelOverlayFrame={pixelOverlayFrame}
          pixelOverlaySel={pixelOverlaySel}
          pixelToolArmed={pixelToolArmed}
          polyLassoHover={polyLassoHover}
          polyLassoSession={polyLassoSession}
          pressureCurve={pressureCurve}
          puppetWarpArmed={puppetWarpArmed}
          puppetWarpBusy={puppetWarpBusy}
          puppetWarpPins={puppetWarpPins}
          quickShapeActive={quickShapeActive}
          remixId={remixId}
          saving={saving}
          scale={scale}
          selected={selected}
          selectedId={selectedId}
          setAppSettingsInitialTab={setAppSettingsInitialTab}
          setAppSettingsOpen={setAppSettingsOpen}
          setBg3dOpen={setBg3dOpen}
          setCanvasOnlyMode={setCanvasOnlyMode}
          setContextMenu={setContextMenu}
          setCurrentPageId={studioCanvasViewportHandlers.setCurrentPageId}
          setDialogueBatchOpen={setDialogueBatchOpen}
          setDialogueTranslateOpen={setDialogueTranslateOpen}
          setError={setError}
          setEyedropperActive={setEyedropperActive}
          setFollowingStudioSessionId={setFollowingStudioSessionId}
          setFrameAnimOpen={setFrameAnimOpen}
          setFrameAnimTargetId={setFrameAnimTargetId}
          setHistoryPanelOpen={setHistoryPanelOpen}
          setLeftPanelOpen={setLeftPanelOpenWithOverride}
          setMarqueeIds={setMarqueeIds}
          setMasterEditMode={setMasterEditMode}
          setMasterPanelOpen={setMasterPanelOpen}
          setOnionSkin={setOnionSkin}
          setPageSequenceOpen={setPageSequenceOpen}
          setPoserVrmOpen={setPoserVrmOpen}
          setPuppetWarpPins={setPuppetWarpPins}
          setQuickShapeActive={setQuickShapeActive}
          setQuickStartOpen={setQuickStartOpen}
          setRightPanelOpen={studioCanvasViewportHandlers.setRightPanelOpen}
          setSelectedId={setSelectedId}
          setSharedDocumentNotice={setSharedDocumentNotice}
          setShortcutsOpen={setShortcutsOpen}
          setStudioRasterHandoffCandidate={setStudioRasterHandoffCandidate}
          setSymmetryCenterX={setSymmetryCenterX}
          setSymmetryCenterY={setSymmetryCenterY}
          setTeamPanelOpen={setTeamPanelOpen}
          setTimelineFocusedTrackId={setTimelineFocusedTrackId}
          setTimelineOpen={setTimelineOpen}
          setTimelinePlayhead={setTimelinePlayhead}
          setTimelinePlaying={setTimelinePlaying}
          setTool={setTool}
          setTranslateDraft={setTranslateDraft}
          setTranslateGlossary={setTranslateGlossary}
          setTranslateTargetLocale={setTranslateTargetLocale}
          setTutorialHubOpen={setTutorialHubOpen}
          setUserGuides={setUserGuides}
          setZoom={setZoom}
          shapeFill={shapeFill}
          shortcutsOpen={shortcutsOpen}
          showGrid={showGrid}
          showQuickStart={showQuickStart}
          showWebtoonGuides={showWebtoonGuides}
          smartGuides={smartGuides}
          sharedGutters={sharedGutters}
          smudgeArmed={smudgeArmed}
          dodgeBurnArmed={dodgeBurnArmed}
          dodgeBurnRadius={dodgeBurnRadius}
          wetMixArmed={wetMixArmed}
          wetMixRadius={wetMixRadius}
          liquifyArmed={liquifyArmed}
          liquifyRadius={liquifyRadius}
          smudgeCursorRef={smudgeCursorRef}
          paintRetouchStrokeLineRef={paintRetouchStrokeLineRef}
          liquifyPreviewImageRef={liquifyPreviewImageRef}
          smudgeRadius={smudgeRadius}
          sourceHydrationPending={sourceHydrationPending}
          stabilizer={stabilizer}
          stabilizerMode={stabilizerMode}
          stageRef={stageRef}
          strokeWidth={strokeWidth}
          tipAngle={tipAngle}
          tipRoundness={tipRoundness}
          studioCanvasCommentPins={studioCanvasCommentPins}
          studioCommentPinReanchorableThreadIds={studioCommentPinReanchorableThreadIds}
          studioCommentPinReanchorDisabledReason={studioCommentPinReanchorDisabledReason}
          studioCrdtDocument={studioCrdtDocument}
          studioCrdtOperationSyncReady={studioCrdtOperationSyncReady}
          studioLiveGesturePreviewAdapter={studioLiveGesturePreviewAdapter}
          studioLiveRoomRef={studioLiveRoomRef}
          studioRasterAuthorizedAuthorityKey={studioRasterAuthorizedAuthorityKey}
          studioRasterHandoffBaseKey={studioRasterHandoffBaseKey}
          studioRasterHandoffBlocked={studioRasterHandoffBlocked}
          studioRasterHandoffGates={studioRasterHandoffGates}
          studioRasterHiddenOperationIds={studioRasterHiddenOperationIds}
          studioRasterOverlayElements={studioRasterOverlayElements}
          studioRasterVisibleDocumentRect={studioRasterVisibleDocumentRect}
          studioWorkAssetRenderPlaceholders={studioWorkAssetRenderPlaceholders}
          studioWorkAssetRenderProjection={studioCanvasWorkAssetRenderProjection}
          symmetryCenterX={symmetryCenterX}
          symmetryCenterY={symmetryCenterY}
          symmetryRadialCount={symmetryRadialCount}
          symmetryType={symmetryType}
          textAiConfigured={textAiConfigured}
          timelapseCapturing={timelapseCapturing}
          timelineFocusedTrackId={timelineFocusedTrackId}
          timelineOpen={timelineOpen}
          timelinePlayhead={timelinePlayhead}
          timelinePlaying={timelinePlaying}
          timelinePreviewFrame={timelinePreviewFrame}
          title={title}
          tool={tool}
          viewTool={viewTool}
          viewTransformSuppressed={viewTransformSuppressed}
          translateBusy={translateBusy}
          translateDraft={translateDraft}
          translateError={translateError}
          translateGlossary={translateGlossary}
          translateProgress={translateProgress}
          translateTargetLocale={translateTargetLocale}
          trRef={trRef}
          tutorialHubOpen={tutorialHubOpen}
          tutorialInitialId={tutorialInitialId}
          uiDensityMode={uiDensityMode}
          userGuides={userGuides}
          vanishingPoints={vanishingPoints}
          perspectiveEyeLevelY={perspectiveEyeLevelY}
          perspectiveLockHorizon={perspectiveLockHorizon}
          webGpuPreviewAuthorized={webGpuPreviewAuthorized}
          webGpuPreviewStrokes={webGpuPreviewStrokes}
          webGpuViewportSurface={webGpuViewportSurface}
          transientPenInkSurfaceEnabled={STUDIO_TRANSIENT_PEN_INK_SURFACE_ENABLED}
          webtoonGuides={webtoonGuides}
          webtoonTheme={webtoonTheme}
          workHydrationFailed={workHydrationFailed}
          workHydrationUnsupportedFormat={workHydrationUnsupportedFormat}
          workId={workId}
          wrapRef={wrapRef}
          zoom={zoom}
          zoomLocked={zoomLocked}
          setZoomLocked={setZoomLocked}
          zoomHostRef={zoomHostRef}
          stableHandlers={studioCanvasViewportHandlers}
        />

        <StudioBrushHud
          visible={
            tool === "draw"
            && isStudioBrushCursorMode(drawMode)
            && !canvasOnlyMode
            && !canvasInteractionBlocked
            && !isExporting
            && !colorWheelOpen
          }
          strokeWidth={strokeWidth}
          brushOpacity={brushOpacity}
          color={color}
          eraserActive={drawMode === "eraser"}
          handedness={workspaceControlSide === "left" ? "left" : "right"}
          canvasHostRef={wrapRef}
          stableHandlers={studioOnCanvasSurfaceHandlers}
        />
        <StudioSelectionContextBar
          visible={
            tool === "select"
            && currentCanvasSelectionCount > 0
            && !canvasOnlyMode
            && !canvasInteractionBlocked
            && !isExporting
          }
          selectionCount={currentCanvasSelectionCount}
          readOnly={activeSurfaceReviewLocked || pageEditLocked}
          canDelete={!activeSurfaceReviewLocked && !pageEditLocked}
          stableHandlers={studioOnCanvasSurfaceHandlers}
        />

        {pointCommentComposer ? (
          <Suspense fallback={null}>
            <StudioPointCommentComposer
              key={pointCommentComposer.commentId}
              anchor={pointCommentComposer.anchor}
              authorName={studioCommentActor.displayName}
              screenPoint={pointCommentComposer.screenPoint}
              getScreenPoint={studioPointCommentScreenProjectionHandlers.getScreenPoint}
              onCancel={cancelStudioPointCommentComposer}
              onOpenReview={() => {
                setPointCommentComposer(null);
                openStudioCommentInbox();
              }}
              onSubmit={submitStudioPointComment}
            />
          </Suspense>
        ) : null}

        {studioCommentThreadPopoverTarget
        && studioCommentThreadSession.surface === "pin-quick-reply"
        && studioCommentThreadSessionView.selectedThread ? (
          <Suspense fallback={null}>
            <StudioCommentThreadPopover
              key={studioCommentThreadPopoverTarget.pinKey}
              thread={studioCommentThreadSessionView.selectedThread}
              screenPoint={studioCommentThreadPopoverTarget.screenPoint}
              anchorElement={studioCommentThreadPopoverTarget.anchorElement}
              getScreenPoint={
                studioCommentThreadPopoverScreenProjectionHandlers.getScreenPoint
              }
              fallbackFocusTarget={wrapRef.current}
              unread={studioCommentThreadSessionView.selectedUnread}
              replyBody={studioCommentThreadSessionView.selectedDraft?.body ?? ""}
              submitting={studioCommentThreadSession.submittingMutationId !== null}
              syncing={studioTeamCommentsSyncing}
              syncError={studioCommentInteractionNotice ?? studioCommentSyncError}
              capabilities={{
                reply: studioTeamCommentsWorkId
                  ? studioTeamCommentCapabilities?.comment === true
                    && !studioLegacyCommentThreadIdSet.has(
                      studioCommentThreadSessionView.selectedThread.id
                    )
                  : !collaborationDocumentLocked,
                resolve: studioTeamCommentsWorkId
                  ? studioTeamCommentCapabilities?.resolve === true
                    && !studioLegacyCommentThreadIdSet.has(
                      studioCommentThreadSessionView.selectedThread.id
                    )
                  : !collaborationDocumentLocked,
              }}
              mutationDisabledReason={
                studioLegacyCommentThreadIdSet.has(
                  studioCommentThreadSessionView.selectedThread.id
                )
                  ? "이전 문서에 보관된 댓글이라 전체 검토함에서 읽기 전용으로 확인할 수 있어요."
                  : studioCommentThreadSessionView.replyBlockedReason === "draft-target-mismatch"
                    ? "다른 댓글에 작성 중인 답글이 있어요. 해당 핀에서 먼저 마무리해 주세요."
                    : undefined
              }
              clusterIndex={studioCommentThreadSessionView.selectedClusterIndex}
              clusterCount={studioCommentThreadSessionView.clusterThreads.length}
              unreadClusterCount={studioCommentThreadSessionView.unreadClusterCount}
              onNavigateCluster={navigateStudioCommentPinCluster}
              onReplyBodyChange={changeStudioCommentThreadReplyDraft}
              onSubmitReply={submitStudioCommentThreadReply}
              onResolveChange={changeStudioCommentThreadResolution}
              onOpenReview={openStudioCommentThreadInReview}
              onClose={closeStudioCommentThreadPopover}
            />
          </Suspense>
        ) : null}
          </div>

        {/* 캔버스 ↔ 속성 패널 너비 스플리터(데스크톱) */}
        {visibleRightPanelOpen && (
          <StudioPanelResizeHandle handleProps={rightResize.handleProps} dragging={rightResize.dragging} label="속성 패널 너비 조절" />
        )}

        {/* 사이드: 속성 + 게시 — 접히면 아이콘 엣지 레일 */}
        {!visibleRightPanelOpen && !presentationPanelsHidden && (
          <StudioEdgeRailButton
            side="right"
            label="속성"
            icon={SlidersHorizontal}
            onClick={() => setRightPanelOpenWithOverride(true)}
            title="속성 패널 펼치기"
          />
        )}
        {!isMobile || mobileSheet === "props" ? (
          <Suspense
            fallback={(
              <StudioInspectorAsideFallback
                isMobile={isMobile}
                keyboardInset={mobileKeyboardInset}
                propsSheetRef={propsSheetRef}
                snap={mobileInspectorSnap}
                visible={visibleRightPanelOpen}
                width={rightResize.width}
              />
            )}
          >
          <LazyStudioInspectorAside
          activeSavedBrushId={activeSavedBrushId}
          advancedRulers={advancedRulers}
          activeSurfaceReviewLocked={activeSurfaceReviewLocked}
          advancedFillActive={advancedFillActive}
          advancedFillBusy={advancedFillBusy}
          advancedFillPreview={advancedFillPreview}
          advancedFillReferenceLayerCount={advancedFillReferenceLayerCount}
          advancedFillSettings={advancedFillSettings}
          advancedFillStatus={advancedFillStatus}
          advancedFillUnsupportedReason={advancedFillUnsupportedReason}
          advancedFillVisibleRasterCount={advancedFillVisibleRasterCount}
          aiColorizeBusy={aiColorizeBusy}
          aiColorizeError={aiColorizeError}
          aiColorizePrompt={aiColorizePrompt}
          aiSettings={aiSettings}
          bg={bg}
          bgGrad={bgGrad}
          brush={brush}
          brushDynamics={brushDynamics}
          brushOpacity={brushOpacity}
          bubbleAnchorPickActive={bubbleAnchorPickActive}
          bubbleShapeArmed={bubbleShapeArmed}
          bubbleShapeEditActive={bubbleShapeEditActive}
          bubbleShapeHandles={bubbleShapeHandles}
          bubbleShapeSelectedPointIndex={bubbleShapeSelectedPointIndex}
          canvasFlipH={canvasFlipH}
          canvasH={canvasH}
          canvasRotation={canvasRotation}
          collaborationDocumentLocked={collaborationDocumentLocked}
          paperGrainKind={paperGrainKind}
          paperGrainVisible={resolveStudioPaperGrainVisibleV1(activePage)}
          color={color}
          colorRangeFuzziness={colorRangeFuzziness}
          colorRangePickActive={colorRangePickActive}
          colorRangePreviewEnabled={colorRangePreviewEnabled}
          colorRangeSamples={colorRangeSamples}
          quickMaskActive={quickMaskActive}
          quickMaskBrushMode={quickMaskBrushMode}
          quickMaskHardness={quickMaskHardness}
          quickMaskOpacity={quickMaskOpacity}
          quickMaskRadius={quickMaskRadius}
          quickMaskTintColor={quickMaskTintColor}
          quickMaskTintOpacity={quickMaskTintOpacity}
          enterQuickMask={enterQuickMask}
          commitQuickMask={commitQuickMask}
          exitQuickMask={exitQuickMask}
          invertQuickMask={invertQuickMask}
          onQuickMaskTintColorChange={(c) => {
            setQuickMaskTintColor(c);
            refreshQuickMaskTint(c, quickMaskTintOpacity);
          }}
          onQuickMaskTintOpacityChange={(v) => {
            setQuickMaskTintOpacity(v);
            refreshQuickMaskTint(quickMaskTintColor, v);
          }}
          setQuickMaskBrushMode={setQuickMaskBrushMode}
          setQuickMaskRadius={setQuickMaskRadius}
          setQuickMaskHardness={setQuickMaskHardness}
          setQuickMaskOpacity={setQuickMaskOpacity}
          cropAspect={cropAspect}
          cropBusy={cropBusy}
          cropRect={cropRect}
          currentBrushSnapshot={currentBrushSnapshot}
          currentPageId={currentPageId}
          currentTemplate={currentTemplate}
          description={description}
          drawMode={drawMode}
          drawShape={drawShape}
          drawingPaletteCancelEpoch={drawingPaletteCancelEpoch}
          drawingPaletteLayout={drawingPaletteLayout}
          effectFavoriteState={effectFavoriteState}
          effScale={effScale}
          elementById={elementById}
          elements={elements}
          eyedropperActive={eyedropperActive}
          filterClipboard={filterClipboard}
          gridSize={gridSize}
          groups={groups}
          healCloneAligned={healCloneAligned}
          healCloneBusy={healCloneBusy}
          healCloneHardness={healCloneHardness}
          healCloneOpacity={healCloneOpacity}
          healCloneRadius={healCloneRadius}
          healCloneSourceAnchor={healCloneSourceAnchor}
          healCloneTool={healCloneTool}
          historyBrushActive={historyBrushActive}
          historyBrushBusy={historyBrushBusy}
          historyBrushHardness={historyBrushHardness}
          historyBrushOpacity={historyBrushOpacity}
          historyBrushRadius={historyBrushRadius}
          historyBrushSourceSrc={historyBrushSourceSrc}
          historyPanelOpen={historyPanelOpen}
          inspectorLayout={inspectorLayout}
          isMobile={isMobile}
          isometricAngleDeg={isometricAngleDeg}
          isometricCellSize={isometricCellSize}
          isometricGridActive={isometricGridActive}
          isometricOriginX={isometricOriginX}
          isometricOriginY={isometricOriginY}
          filterMaskBusy={filterMaskBusy}
          filterMaskHardness={filterMaskHardness}
          filterMaskPaintActive={filterMaskPaintActive}
          filterMaskPaintMode={filterMaskPaintMode}
          filterMaskRadius={filterMaskRadius}
          filterMaskStrength={filterMaskStrength}
          selectedImageHasActiveFilters={
            selected?.type === "image" ? hasActiveImageFilters(selected) : false
          }
          layerMaskBusy={layerMaskBusy}
          layerMaskHardness={layerMaskHardness}
          layerMaskPaintActive={layerMaskPaintActive}
          layerMaskPaintMode={layerMaskPaintMode}
          layerMaskRadius={layerMaskRadius}
          layerMaskStrength={layerMaskStrength}
          layerNavigatorItems={layerNavigatorItems}
          localHiddenElementIds={localHiddenElementIds}
          soloLayerId={layerSoloState.soloId}
          liquifyActive={liquifyActive}
          liquifyBusy={liquifyBusy}
          liquifyMode={liquifyMode}
          liquifyRadius={liquifyRadius}
          liquifyStrength={liquifyStrength}
          liveDraftShapeKind={liveDraftShapeKind}
          magicResizeStrategy={magicResizeStrategy}
          marqueeIds={marqueeIds}
          masterEditMode={masterEditMode}
          mobileKeyboardInset={mobileKeyboardInset}
          mobileInspectorSnap={mobileInspectorSnap}
          mobileSheet={mobileSheet}
          nodeEditHandles={nodeEditHandles}
          nodeEditTool={nodeEditTool}
          nodeSmoothStrength={nodeSmoothStrength}
          pageGrade={pageGrade}
          pageGradeActive={pageGradeActive}
          pageGradePanelOpen={pageGradePanelOpen}
          panelGutter={panelGutter}
          panelSplitActive={panelSplitActive}
          panelSplitHint={panelSplitHint}
          panelSplitRatio={panelSplitRatio}
          perspectiveRulerActive={perspectiveRulerActive}
          perspectiveEyeLevelY={perspectiveEyeLevelY}
          perspectiveLockHorizon={perspectiveLockHorizon}
          pixelBrushRadius={pixelBrushRadius}
          pixelBusy={pixelBusy}
          pixelCombine={pixelCombine}
          pixelMagneticLasso={pixelMagneticLasso}
          onTogglePixelMagneticLasso={() => setPixelMagneticLasso((v) => !v)}
          pixelForceCircle={pixelForceCircle}
          pixelSel={pixelSel}
          pixelSelectionCanRedo={canRedoPixelSelectionHistory(
            pixelSelectionHistory,
            selected?.type === "image" ? selected.id : null
          )}
          pixelSelectionCanUndo={canUndoPixelSelectionHistory(
            pixelSelectionHistory,
            selected?.type === "image" ? selected.id : null
          )}
          pixelTool={pixelTool}
          polyLassoSession={polyLassoSession}
          postCorrection={postCorrection}
          preserveCorners={preserveCorners}
          pressureCurve={pressureCurve}
          propsSheetRef={propsSheetRef}
          puppetWarpActive={puppetWarpActive}
          puppetWarpBusy={puppetWarpBusy}
          puppetWarpPins={puppetWarpPins}
          quickShapeActive={quickShapeActive}
          recentColors={recentColors}
          rightResize={rightResize}
          savedBrushes={savedBrushes}
          openBrushLibraryRepository={productBrushRepository}
          saving={saving}
          studioFilterPreparationBusy={studioFilterPreparationBusy}
          studioLayerLiftDisabledReason={studioLayerLiftDisabledReason}
          scrollViewportStore={scrollViewportStore}
          selected={selected}
          selectedBg3dEditSource={selectedBg3dEditSource}
          selectedBubbleTailGeometry={selectedBubbleTailGeometry}
          selectedContentMutationLocked={selectedContentMutationLocked}
          selectedId={selectedId}
          selectedRasterSource={selectedProjectedImageSource}
          selectedWorkAssetDestructiveEditReason={selectedWorkAssetDestructiveEditReason}
          setSelectedId={setSelectedId}
          autoColorScribbleCanvasArmed={autoColorScribbleCanvasArmed}
          setAutoColorScribbleCanvasArmed={setAutoColorScribbleCanvasArmed}
          autoColorCanvasSeedHit={autoColorCanvasSeedHit}
          setAutoColorCanvasSeedHit={setAutoColorCanvasSeedHit}
          autoColorCanvasSeedHits={autoColorCanvasSeedHits}
          setAutoColorCanvasSeedHits={setAutoColorCanvasSeedHits}
          onAutoColorPlanImageSize={(size: { width: number; height: number } | null) => {
            autoColorPlanImageSizeRef.current = size;
          }}
          setAdvancedFillPreview={setAdvancedFillPreview}
          setAdvancedFillStatus={setAdvancedFillStatus}
          setAiColorizePrompt={setAiColorizePrompt}
          setBg3dInitialDataUrl={setBg3dInitialDataUrl}
          setBg3dInitialElementId={setBg3dInitialElementId}
          setBg3dInitialScene={setBg3dInitialScene}
          setBg3dOpen={setBg3dOpen}
          setBrushDynamics={setBrushDynamics}
          setBrushOpacity={setBrushOpacity}
          setBubbleShapeEditActive={setBubbleShapeEditActive}
          setColor={setColor}
          setCropAspect={setCropAspect}
          setCropRect={setCropRect}
          setDrawShape={setDrawShape}
          setEyedropperActive={setEyedropperActive}
          setFilterClipboard={setFilterClipboard}
          setGridSize={setGridSize}
          setHealCloneAligned={setHealCloneAligned}
          setHealCloneHardness={setHealCloneHardness}
          setHealCloneOpacity={setHealCloneOpacity}
          setHealCloneRadius={setHealCloneRadius}
          setHealCloneTool={setHealCloneTool}
          setHistoryBrushActive={setHistoryBrushActive}
          setHistoryBrushHardness={setHistoryBrushHardness}
          setHistoryBrushOpacity={setHistoryBrushOpacity}
          setHistoryBrushRadius={setHistoryBrushRadius}
          setHistoryBrushSourceIndex={setHistoryBrushSourceIndex}
          setHistoryBrushSourceSrc={setHistoryBrushSourceSrc}
          setHistoryPanelOpen={setHistoryPanelOpen}
          setFilterMaskHardness={setFilterMaskHardness}
          setFilterMaskPaintActive={setFilterMaskPaintActive}
          setFilterMaskPaintMode={setFilterMaskPaintMode}
          setFilterMaskRadius={setFilterMaskRadius}
          setFilterMaskStrength={setFilterMaskStrength}
          setLayerMaskHardness={setLayerMaskHardness}
          setLayerMaskPaintActive={setLayerMaskPaintActive}
          setLayerMaskPaintMode={setLayerMaskPaintMode}
          setLayerMaskRadius={setLayerMaskRadius}
          setLayerMaskStrength={setLayerMaskStrength}
          setLiquifyRadius={setLiquifyRadius}
          setLiquifyMode={setLiquifyMode}
          setLiquifyStrength={setLiquifyStrength}
          setMagicResizeStrategy={setMagicResizeStrategy}
          setMenu={setMenu}
          setMobileInspectorSnap={setMobileInspectorSnap}
          setMobileSheet={setMobileSheet}
          setNodeEditTool={setNodeEditTool}
          setNodeSmoothStrength={setNodeSmoothStrength}
          setPageGradePanelOpen={setPageGradePanelOpen}
          setPanelSplitActive={setPanelSplitActive}
          setPanelSplitHint={setPanelSplitHint}
          setPanelSplitRatio={setPanelSplitRatio}
          setPerspectiveRulerActive={setPerspectiveRulerActive}
          setPixelBrushRadius={setPixelBrushRadius}
          setPixelCombine={setPixelCombine}
          setPixelForceCircle={setPixelForceCircle}
          commitPixelSelectionState={commitPixelSelectionState}
          resetPixelSelectionState={(selection) => resetPixelSelectionHistoryState(
            selected?.type === "image" ? selected.id : null,
            selection
          )}
          undoPixelSelectionState={() => {
            applyPixelSelectionHistoryCommand("undo");
          }}
          redoPixelSelectionState={() => {
            applyPixelSelectionHistoryCommand("redo");
          }}
          runColorRangeApply={runColorRangeApply}
          setColorRangeFuzziness={setColorRangeFuzziness}
          setColorRangePickActive={setColorRangePickActive}
          setColorRangePreviewEnabled={setColorRangePreviewEnabled}
          setColorRangeSamples={setColorRangeSamples}
          setPixelTool={setPixelTool}
          setPoserInitialDataUrl={setPoserInitialDataUrl}
          setPoserInitialElementId={setPoserInitialElementId}
          setPoserVrmOpen={setPoserVrmOpen}
          setPostCorrection={setPostCorrection}
          setPreserveCorners={setPreserveCorners}
          setPressureCurve={setPressureCurve}
          pressureMinSize={pressureMinSize}
          setPressureMinSize={setPressureMinSize}
          setPuppetWarpActive={setPuppetWarpActive}
          setPuppetWarpPins={setPuppetWarpPins}
          setQuickShapeActive={setQuickShapeActive}
          setRightPanelOpen={setRightPanelOpenWithOverride}
          setSavedBrushes={commitSavedBrushProjection}
          setShapeFill={setShapeFill}
          setSharedDocumentNotice={setSharedDocumentNotice}
          setShowGrid={setShowGrid}
          setShowAlignmentGuides={setAlignmentGuidesVisible}
          setShowWebtoonGuides={setShowWebtoonGuides}
          setSmudgeRadius={setSmudgeRadius}
          setSmudgeStrength={setSmudgeStrength}
          setDodgeBurnExposure={setDodgeBurnExposure}
          setDodgeBurnHardness={setDodgeBurnHardness}
          setDodgeBurnMode={setDodgeBurnMode}
          setDodgeBurnRadius={setDodgeBurnRadius}
          setDodgeBurnRange={setDodgeBurnRange}
          setDodgeBurnSponge={setDodgeBurnSponge}
          setWetMixHardness={setWetMixHardness}
          setWetMixPickup={setWetMixPickup}
          setWetMixRadius={setWetMixRadius}
          setWetMixStrength={setWetMixStrength}
          setWetMixWetness={setWetMixWetness}
          setSnapEnabled={setSnapEnabledVisible}
          setStabilizer={setStabilizer}
          setStabilizerMode={setStabilizerMode}
          setStampTuning={setStampTuning}
          setStrokeWidth={setStrokeWidth}
          setSymmetryCenterX={setSymmetryCenterX}
          setSymmetryCenterY={setSymmetryCenterY}
          setSymmetryRadialCount={setSymmetryRadialCount}
          setSymmetryType={changeStudioSymmetryType}
          setTiltEnabled={setTiltEnabled}
          setTipAngle={setTipAngle}
          setTipRoundness={setTipRoundness}
          setTool={setTool}
          setUserGuides={setUserGuides}
          setUseVelocityPressure={setUseVelocityPressure}
          setVelocitySensitivity={setVelocitySensitivity}
          setWandTolerance={setWandTolerance}
          shapeFill={shapeFill}
          showGrid={showGrid}
          showWebtoonGuides={showWebtoonGuides}
          smudgeActive={smudgeActive}
          smudgeBusy={smudgeBusy}
          smudgeRadius={smudgeRadius}
          smudgeStrength={smudgeStrength}
          extendedBlendBusy={layerMergeBusy}
          extendedBlendMode={extendedBlendMode}
          extendedBlendOpacity={extendedBlendOpacity}
          extendedBlendUnavailableReason={(() => {
            if (selected?.type !== "image") return "이미지 요소를 선택하세요.";
            const index = elements.findIndex((element) => element.id === selected.id);
            const below = index > 0 ? elements[index - 1] : undefined;
            if (below?.type !== "image") return "바로 아래에 이미지 레이어가 있어야 합니다.";
            return null;
          })()}
          applyExtendedBlendMergeDown={applyExtendedBlendMergeDown}
          setExtendedBlendMode={setExtendedBlendMode}
          setExtendedBlendOpacity={setExtendedBlendOpacity}
          pathBooleanBusy={pathBooleanBusy}
          pathBooleanUnavailableReason={studioPathBooleanUnavailableReason(
            marqueeIds.map((id) => elementById.get(id)).filter((el): el is El => Boolean(el))
          )}
          applyPathBooleanCombine={(op) => void applyPathBooleanCombine(op)}
          paperVectorRefinementBusy={paperVectorRefinementBusy}
          paperVectorRefinementUnavailableReason={
            paperVectorRefinementUnavailableReason
          }
          applyPaperVectorRefinement={(operation) => {
            void applyPaperVectorRefinement(operation);
          }}
          cancelPaperVectorRefinement={cancelPaperVectorRefinement}
          dodgeBurnActive={dodgeBurnActive}
          dodgeBurnBusy={dodgeBurnBusy}
          dodgeBurnExposure={dodgeBurnExposure}
          dodgeBurnHardness={dodgeBurnHardness}
          dodgeBurnMode={dodgeBurnMode}
          dodgeBurnRadius={dodgeBurnRadius}
          dodgeBurnRange={dodgeBurnRange}
          dodgeBurnSponge={dodgeBurnSponge}
          wetMixActive={wetMixActive}
          wetMixBusy={wetMixBusy}
          wetMixHardness={wetMixHardness}
          wetMixPickup={wetMixPickup}
          wetMixRadius={wetMixRadius}
          wetMixStrength={wetMixStrength}
          wetMixWetness={wetMixWetness}
          snapEnabled={snapEnabled}
          showAlignmentGuides={showAlignmentGuides}
          stabilizer={stabilizer}
          stabilizerMode={stabilizerMode}
          stampTuning={stampTuning}
          strokeWidth={strokeWidth}
          symmetryCenterX={symmetryCenterX}
          symmetryCenterY={symmetryCenterY}
          symmetryRadialCount={symmetryRadialCount}
          symmetryType={symmetryType}
          tagsText={tagsText}
          timelinePlaying={timelinePlaying}
          tiltEnabled={tiltEnabled}
          tipAngle={tipAngle}
          tipRoundness={tipRoundness}
          title={title}
          titleInputRef={titleInputRef}
          tool={tool}
          userGuides={userGuides}
          useVelocityPressure={useVelocityPressure}
          vanishingPoints={vanishingPoints}
          velocitySensitivity={velocitySensitivity}
          visibleRightPanelOpen={visibleRightPanelOpen}
          wandTolerance={wandTolerance}
          webtoonGuides={webtoonGuides}
          webtoonTheme={webtoonTheme}
            stableHandlers={studioInspectorAsideHandlers}
          />
          </Suspense>
        ) : null}

        {isMobile ? (
          <Suspense fallback={null}>
            <StudioMobileEditingDock
          activeCatalogBrushId={activeCatalogBrush.id}
          activeCatalogBrushName={activeCatalogBrush.name}
          activeSavedBrushId={activeSavedBrushId}
          activeSurfaceReviewLocked={activeSurfaceReviewLocked}
          advancedFillActive={advancedFillActive}
          advancedFillUnsupportedReason={advancedFillUnsupportedReason}
          brush={brush}
          brushCatalogHandlers={studioBrushCatalogHandlers}
          brushCatalogOpen={brushCatalogSession?.placement === "mobile-sheet"}
          brushDefaultRestore={brushBaselineController.restoreState}
          brushDynamics={brushDynamics}
          brushManagerSheetRef={brushManagerSheetRef}
          brushOpacity={brushOpacity}
          collaborationDocumentLocked={collaborationDocumentLocked}
          commentPinArmed={commentPlacementActive}
          color={color}
          colorBlindPreview={colorBlindPreview}
          colorVisionSheetRef={colorVisionSheetRef}
          currentBrushSnapshot={currentBrushSnapshot}
          drawMode={drawMode}
          drawShape={drawShape}
          drawSheetRef={drawSheetRef}
          eraseToIntersection={eraseToIntersection}
          filterMutationLocked={menuFilterDisabled}
          filterPreparationBusy={studioFilterPreparationBusy}
          filterTargetLabel={studioFilterTargetLabel}
          filterUnavailableReason={studioFilterUnavailableReason}
          hi={hi}
          history={history}
          sidecarUndoAvailable={studioHistorySidecarUndoAvailable}
          sidecarRedoAvailable={studioHistorySidecarRedoAvailable}
          isMobile={isMobile}
          livingInk={{
            ...studioOptionsBarsDrawModel.livingInk,
            onPhysicalModeEnabledChange:
              studioOptionsBarsHandlers.setLivingInkPhysicalModeEnabled,
            onModeChange: studioOptionsBarsHandlers.setLivingInkMode,
            onScopeChange: studioOptionsBarsHandlers.setLivingInkScope,
            onFix: studioOptionsBarsHandlers.applyLivingInkFix,
            onClear: studioOptionsBarsHandlers.applyLivingInkClear,
            onMaterialChange: studioOptionsBarsHandlers.patchLivingInkMaterial,
          }}
          marqueeIds={marqueeIds}
          mobileBrushDockButtonRef={mobileBrushDockButtonRef}
          mobileKeyboardInset={mobileKeyboardInset}
          mobileQuickActionsButton={mobileQuickActionsButton}
          mobileSheet={mobileSheet}
          postCorrection={postCorrection}
          preserveCorners={preserveCorners}
          pressureCurve={pressureCurve}
          proDrawPrefs={proDrawPrefs}
          quickActionsOpen={quickActionsOpen}
          savedBrushes={savedBrushes}
          openBrushLibraryRepository={productBrushRepository}
          selected={selected}
          selectionLocked={mobileSelectionLocked}
          selectionTextEditLabel={studioOptionsBarsSelectionModel.textEditLabel}
          setBrushDynamics={setBrushDynamics}
          setBrushOpacity={setBrushOpacity}
          setColor={setColor}
          setColorBlindPreview={setColorBlindPreview}
          setDrawMode={setDrawMode}
          setDrawShape={setDrawShape}
          setEraseToIntersection={setEraseToIntersection}
          setMarqueeIds={setMarqueeIds}
          setMenu={setMenu}
          setMobileSheet={setMobileSheet}
          setPostCorrection={setPostCorrection}
          setPreserveCorners={setPreserveCorners}
          setPressureCurve={setPressureCurve}
          pressureMinSize={pressureMinSize}
          setPressureMinSize={setPressureMinSize}
          setQuickStartOpen={setQuickStartOpen}
          setSavedBrushes={commitSavedBrushProjection}
          setSelectedId={setSelectedId}
          setShapeFill={setShapeFill}
          setStampTuning={setStampTuning}
          setStabilizer={setStabilizer}
          setStabilizerMode={setStabilizerMode}
          setStrokeWidth={setStrokeWidth}
          setTiltEnabled={setTiltEnabled}
          setTipAngle={setTipAngle}
          setTipRoundness={setTipRoundness}
          setTool={setTool}
          setUseVelocityPressure={setUseVelocityPressure}
          setVelocitySensitivity={setVelocitySensitivity}
          setZoom={setZoom}
          shapeFill={shapeFill}
          showMobileHint={showMobileHint}
          stabilizer={stabilizer}
          stabilizerMode={stabilizerMode}
          stampTuning={stampTuning}
          strokeWidth={strokeWidth}
          tiltEnabled={tiltEnabled}
          tipAngle={tipAngle}
          tipRoundness={tipRoundness}
          tool={tool}
          ui={STUDIO_MOBILE_EDITING_DOCK_UI}
          useVelocityPressure={useVelocityPressure}
          velocitySensitivity={velocitySensitivity}
          workspaceState={workspaceState}
          zoom={zoom}
              stableHandlers={studioMobileEditingDockHandlers}
            />
          </Suspense>
        ) : null}
      </div>

        <StudioLazyPanelStack
          activeCommentAnchor={activeCommentAnchor}
          activePage={activePage}
          aiProvenance={aiProvenance}
          aiProvenanceOpen={aiProvenanceOpen}
          aiSettings={aiSettings}
          autoActionBusy={autoActionBusy}
          autoActionError={autoActionError}
          autoActionPlan={autoActionPlan}
          autoActionProgress={autoActionProgress}
          autoActionScope={autoActionScope}
          autoActionSelectedPageIds={autoActionSelectedPageIds}
          autoActionSet={autoActionSet}
          autoActionsOpen={autoActionsOpen}
          autoActionStatus={autoActionStatus}
          bg3dInitialDataUrl={bg3dInitialDataUrl}
          bg3dInitialScene={bg3dInitialScene}
          bg3dOperation={bg3dInitialElementId ? "update" : "insert"}
          bg3dTargetBundleId={bg3dTargetBundleId}
          bg3dBatchRecoveryScope={bg3dBatchRecoveryScope}
          validateRecoveryAccess={validateRecoveryAccess}
          bg3dOpen={admittedBg3dOpen}
          bg3dSeedTemplateId={bg3dSeedTemplateId}
          bg3dSeedPrimitiveKind={bg3dSeedPrimitiveKind}
          onSeedObjectInsertConsumed={clearStudioObjectInsertSeeds}
          characterBible={characterBible}
          characterBibleOpen={characterBibleOpen}
          checkpointError={checkpointError}
          checkpointPanelOpen={checkpointPanelOpen}
          checkpoints={checkpoints}
          collaborationDocumentLocked={collaborationDocumentLocked}
          colorWheelCenter={colorWheelCenter}
          colorWheelOpen={colorWheelOpen}
          commentsOpen={commentsOpen}
          commentsPanelMounted={commentsPanelMounted}
          studioCommentFocusRequest={studioCommentFocusRequest}
          studioCommentSharedReply={studioCommentSharedReplyController}
          studioCommentSyncError={studioCommentInteractionNotice ?? studioCommentSyncError}
          studioCommentPinsHidden={studioCommentPinsHidden}
          studioLegacyCommentThreadIdSet={studioLegacyCommentThreadIdSet}
          studioTeamCommentCapabilities={studioTeamCommentCapabilities}
          studioTeamCommentsSyncing={studioTeamCommentsSyncing}
          studioTeamCommentsWorkId={studioTeamCommentsWorkId}
          studioTeamUnreadCommentIdSet={studioTeamUnreadCommentIdSet}
          composeWorkAssetPreviewPage={composeWorkAssetPreviewPage}
          continuityIssues={continuityIssues}
          continuityOpen={continuityOpen}
          continuityScenes={continuityScenes}
          currentPageId={currentPageId}
          currentPublishPackageCreditsText={currentPublishPackageCreditsText}
          draftCollaboration={draftCollaboration}
          effectivePublishPackageSettings={effectivePublishPackageSettings}
          elementById={elementById}
          fxPanelOpen={fxPanelOpen}
          isMobile={isMobile}
          loadedWork={loadedWork}
          loggedIn={loggedIn}
          macroSession={macroSession}
          masterEditMode={masterEditMode}
          pageDnd={pageDnd}
          pageReviewOpen={pageReviewOpen}
          pages={pages}
          pagesHi={pagesHi}
          pagesHistory={pagesHistory}
          mannequinPoserOpen={admittedMannequinPoserOpen}
          poserInitialDataUrl={poserInitialDataUrl}
          poserInitialElementId={poserInitialElementId}
          poserSeedPropId={poserSeedPropId}
          poserVrmOpen={admittedPoserVrmOpen}
          productionInsightsOpen={productionInsightsOpen}
          productionInsightsResult={productionInsightsResult}
          publicationAnalytics={publicationAnalytics}
          publicationOperationsOpen={publicationOperationsOpen}
          publishAiDisclosure={publishAiDisclosure}
          publishAiUsage={publishAiUsage}
          publishCompliance={publishCompliance}
          publishComplianceResult={publishComplianceResult}
          publishPackageExportBusy={publishPackageExportBusy}
          publishPackageExportProgress={publishPackageExportProgress}
          publishPackageExportStatus={publishPackageExportStatus}
          publishPackageOpen={publishPackageOpen}
          publishPackagePlan={publishPackagePlan}
          publishPreflightOpen={publishPreflightOpen}
          publishPreflightResult={publishPreflightResult}
          publishProfile={publishProfile}
          quickActionsAnchor={quickActionsAnchor}
          quickActionsDisabledActions={quickActionsDisabledActions}
          quickActionsOpen={quickActionsOpen}
          quickActionsPreferences={quickActionsPreferences}
          recentColors={recentColors}
          referencePanelOpen={referencePanelOpen}
          referenceBoard={referenceBoard}
          releaseSchedule={releaseSchedule}
          scenarioApplyTarget={scenarioApplyTarget}
          scenarioBusy={scenarioBusy}
          scenarioError={scenarioError}
          scenarioImageReferenceAssetOptions={scenarioImageReferenceAssetOptions}
          scenarioImageReferenceDocument={scenarioImageReferenceDocument}
          scenarioImageReferenceMissingCount={
            assetsLoaded ? scenarioImageReferenceResolution.missing.length : 0
          }
          scenarioImageReferencesLoading={assetsLoading || (scenarioOpen && !assetsLoaded)}
          scenarioOpen={scenarioOpen}
          scenarioProgress={scenarioProgress}
          scenarioRegeneratingIndex={scenarioRegeneratingIndex}
          scenarioResult={scenarioResult}
          scenarioSceneCountHint={scenarioSceneCountHint}
          scenarioStageLabel={scenarioStageLabel}
          scenarioStoryText={scenarioStoryText}
          scrollPreviewOpen={scrollPreviewOpen}
          serverCurrentRevision={serverCurrentRevision}
          serverRevisionError={serverRevisionError}
          serverRevisionLoading={serverRevisionLoading}
          serverRevisions={serverRevisions}
          setAiProvenanceOpen={setAiProvenanceOpen}
          setAutoActionsOpen={setAutoActionsOpen}
          setBg3dInitialDataUrl={setBg3dInitialDataUrl}
          setBg3dInitialElementId={setBg3dInitialElementId}
          setBg3dInitialScene={setBg3dInitialScene}
          setBg3dOpen={setBg3dOpen}
          setCharacterBibleOpen={setCharacterBibleOpen}
          setCheckpointPanelOpen={setCheckpointPanelOpen}
          setColor={setColor}
          setColorWheelOpen={setColorWheelOpen}
          onArmCommentPinPlacement={startStudioCommentPlacementSession}
          setCommentsOpen={setCommentsOpen}
          isStudioCommentAnchorValid={isStudioCommentAnchorValid}
          setStudioCommentFocusRequest={setStudioCommentFocusRequest}
          setStudioCommentPinsHidden={setStudioCommentPinsHidden}
          setContinuityOpen={setContinuityOpen}
          setFxPanelOpen={setFxPanelOpen}
          setLoadedWork={setLoadedWork}
          setPageReviewOpen={setPageReviewOpen}
          setPoserInitialDataUrl={setPoserInitialDataUrl}
          setMannequinPoserOpen={setMannequinPoserOpen}
          setPoserInitialElementId={setPoserInitialElementId}
          setPoserVrmOpen={setPoserVrmOpen}
          setProductionInsightsOpen={setProductionInsightsOpen}
          setPublicationOperationsOpen={setPublicationOperationsOpen}
          setPublishPackageOpen={setPublishPackageOpen}
          setPublishPreflightOpen={setPublishPreflightOpen}
          setQuickActionsOpen={setQuickActionsOpen}
          setQuickActionsPreferences={setQuickActionsPreferences}
          setReferencePanelOpen={setReferencePanelOpen}
          setScenarioOpen={setScenarioOpen}
          setScenarioImageReferenceDocument={setScenarioImageReferenceDocument}
          setScenarioSceneCountHint={setScenarioSceneCountHint}
          setScenarioStoryText={setScenarioStoryText}
          setScrollPreviewOpen={setScrollPreviewOpen}
          setSelectedId={setSelectedId}
          setSharedDocumentNotice={setSharedDocumentNotice}
          setSharedDocumentScope={setSharedDocumentScope}
          setStoryboardGridOpen={setStoryboardGridOpen}
          setTeamPanelOpen={setTeamPanelOpen}
          setTimelapseOpen={setTimelapseOpen}
          setTool={setTool}
          setWriterRoomAiDirection={setWriterRoomAiDirection}
          setWriterRoomAiReview={setWriterRoomAiReview}
          setWriterRoomOpen={setWriterRoomOpen}
          sharedDocument={sharedDocument}
          storyboardGridOpen={storyboardGridOpen}
          studioAuthUserId={studioAuthUserId}
          studioCommentActor={studioCommentActor}
          studioCommentAnchorOptions={studioCommentAnchorOptions}
          studioComments={studioCommentViewDocument}
          studioRevisionProjectGenerationRef={studioRevisionProjectGenerationRef}
          teamPanelOpen={teamPanelOpen}
          textAiConfigured={textAiConfigured}
          timelapseOpen={timelapseOpen}
          title={title}
          workId={workId}
          writerRoom={writerRoom}
          writerRoomAiBusy={writerRoomAiBusy}
          writerRoomAiDirection={writerRoomAiDirection}
          writerRoomAiError={writerRoomAiError}
          writerRoomAiReview={writerRoomAiReview}
          writerRoomCanvasPlan={writerRoomCanvasPlan}
          writerRoomOpen={writerRoomOpen}
          stableHandlers={studioLazyPanelStackHandlers}
        />

      {studioFilterSession && studioFilterDialogImage?.type === "image" ? (
        <Suspense fallback={null}>
          <StudioFilterDialog
            key={studioFilterSession.id}
            activeKey={`filter:${studioFilterSession.id}`}
            kind={studioFilterSession.kind}
            image={studioFilterDialogImage}
            imageSrc={studioFilterDialogImage.src}
            targetKind={studioFilterSession.target}
            {...(studioFilterSession.initialDraft
              ? { initialDraft: studioFilterSession.initialDraft }
              : {})}
            rootRef={studioRootRef}
            mutationLocked={studioFilterDialogMutationLocked}
            {...(studioFilterDialogMutationLockReason
              ? { mutationLockReason: studioFilterDialogMutationLockReason }
              : {})}
            applying={studioFilterApplying}
            selectionAvailable={
              studioFilterSession.target === "image" && !!studioFilterSession.selection
            }
            selectionFeatherPx={
              studioFilterSession.target === "image"
                ? studioFilterSession.selection?.featherPx
                : undefined
            }
            selectionInverted={
              studioFilterSession.target === "image"
                ? studioFilterSession.selection?.invert
                : undefined
            }
            onPreview={(patch) => {
              setStudioFilterPreview(
                patch
                  ? { elementId: studioFilterSession.elementId, patch }
                  : null,
              );
            }}
            onApply={async (patch, draft, applicationScope) => {
              if (studioFilterApplyBusyRef.current) return;
              if (studioFilterSession.target === "image") {
                if (applicationScope === "whole") {
                  if (!patchEl(studioFilterSession.elementId, patch as Partial<El>)) return;
                  setStudioFilterPreview(null);
                  setLastStudioFilterDraft(draft);
                  setStudioFilterApplying(false);
                  setStudioFilterSession(null);
                  return;
                }
                const selection = studioFilterSession.selection;
                if (!selection) {
                  setError("필터를 적용할 픽셀 영역을 먼저 선택하세요.");
                  return;
                }
                const target = elementById.get(studioFilterSession.elementId);
                if (!target || target.type !== "image") {
                  setError("필터 대상 이미지가 현재 페이지에 없습니다. 다시 선택해 주세요.");
                  return;
                }
                const applySessionId = studioFilterSession.id;
                const mutationTicket = captureStudioMutationTicket();
                studioFilterApplyBusyRef.current = true;
                setStudioFilterApplying(true);
                try {
                  const source = await loadStudioPixelEditImage(target.src);
                  if (
                    applySessionId !== studioFilterSessionIdRef.current
                    || !canApplyStudioMutation(mutationTicket)
                    || isLatestLayerContentMutationLocked(target.id)
                  ) return;
                  const { createStudioSelectionFilterMaskTransactionAsync } = await import("../studio-selection-filter-mask-transaction"
                  );
                  const result = await createStudioSelectionFilterMaskTransactionAsync({
                    target,
                    selection,
                    scope: applicationScope,
                    imageWidth: source.naturalWidth || source.width,
                    imageHeight: source.naturalHeight || source.height,
                    filterPatch: patch,
                    createCanvas: createStudioPixelEditCanvas,
                    serializeMask: async (mask) =>
                      encodeStudioPixelEditResultPng(mask as HTMLCanvasElement),
                    mutationLocked:
                      activeSurfaceReviewLocked || isEffectivelyLocked(target, groups),
                  });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  const committed = commitStudioSelectionFilterMaskTransaction(
                    result.transaction,
                    (transaction) => patchEl(
                      transaction.targetId,
                      transaction.patch as Partial<El>,
                    ),
                  );
                  if (!committed) return;
                  setStudioFilterPreview(null);
                  setLastStudioFilterDraft(draft);
                  setError(null);
                  setStudioFilterSession(null);
                  announceDrawingShortcut(
                    applicationScope === "inside"
                      ? "필터를 선택 안에 적용하고 마스크로 저장했어요"
                      : "필터를 선택 밖에 적용하고 마스크로 저장했어요",
                  );
                } catch (selectionFilterError) {
                  setError(
                    selectionFilterError instanceof Error
                      ? selectionFilterError.message
                      : "선택 영역 필터 마스크를 만들지 못했습니다.",
                  );
                } finally {
                  if (applySessionId === studioFilterSessionIdRef.current) {
                    studioFilterApplyBusyRef.current = false;
                    setStudioFilterApplying(false);
                  }
                }
                return;
              }
              studioFilterApplyBusyRef.current = true;
              setStudioFilterApplying(true);
              const applySessionId = studioFilterSession.id;
              try {
                if (
                  applySessionId !== studioFilterSessionIdRef.current ||
                  studioFilterSession.pageId !== currentPageIdRef.current ||
                  studioFilterSession.historyIndex !== pagesHiRef.current ||
                  !canApplyStudioMutation(studioFilterSession.mutationTicket)
                ) {
                  closeStudioFilterDialog();
                  return;
                }
                const rasterRuntime = await import("../render/studio-raster-edit-preparation");
                if (applySessionId !== studioFilterSessionIdRef.current) return;
                const currentContext = currentStudioFilterPageRasterContext(
                  studioFilterSession.plan.name,
                  rasterRuntime,
                );
                const composite = {
                  ...studioFilterSession.image,
                  ...patch,
                  locked: false,
                  noClip: true,
                } as ImageEl & El;
                const applied = rasterRuntime.applyStudioEditableRasterCopy({
                  plan: studioFilterSession.plan,
                  current: currentContext.input,
                  composite,
                  destinationElements: currentContext.destinationElements,
                });
                if (!applied.ok) {
                  setError(applied.reason);
                  closeStudioFilterDialog();
                  return;
                }
                if (
                  applySessionId !== studioFilterSessionIdRef.current ||
                  studioFilterSession.pageId !== currentPageIdRef.current ||
                  studioFilterSession.historyIndex !== pagesHiRef.current ||
                  !canApplyStudioMutation(studioFilterSession.mutationTicket)
                ) {
                  closeStudioFilterDialog();
                  return;
                }
                if (!commit(applied.elements, undefined, studioFilterSession.pageId)) return;
                setMarqueeIds([]);
                setSelectedId(composite.id);
                setTool("select");
                setStudioFilterPreview(null);
                setLastStudioFilterDraft(draft);
                setStudioFilterSession(null);
                setError(null);
                announceDrawingShortcut("원본을 보존한 페이지 필터 레이어를 추가했어요");
              } catch (filterApplyError) {
                setError(
                  filterApplyError instanceof Error
                    ? filterApplyError.message
                    : "페이지 필터 레이어를 적용하지 못했습니다."
                );
              } finally {
                if (applySessionId === studioFilterSessionIdRef.current) {
                  studioFilterApplyBusyRef.current = false;
                  setStudioFilterApplying(false);
                }
              }
            }}
            onClose={closeStudioFilterDialog}
          />
        </Suspense>
      ) : null}

      {studioLayerLiftUi.open ? (
        <Suspense fallback={null}>
          <StudioLayerLiftDialog
            open
            activeKey={studioLayerLiftUi.activeKey}
            sourceName={studioLayerLiftUi.sourceName}
            sourceSrc={studioLayerLiftUi.sourceSrc}
            phase={studioLayerLiftUi.phase}
            progressLabel={studioLayerLiftUi.progressLabel}
            error={studioLayerLiftUi.error}
            preview={studioLayerLiftUi.preview}
            options={studioLayerLiftOptions}
            mutationLocked={studioLayerLiftDisabledReason !== null}
            mutationLockReason={studioLayerLiftDisabledReason}
            onOptionsChange={setStudioLayerLiftOptions}
            onAnalyze={() => {
              const sourceId = studioLayerLiftUiRef.current.sourceId;
              if (sourceId) {
                void runStudioLayerLiftAnalysis(
                  sourceId,
                  studioLayerLiftOptions,
                );
              }
            }}
            onCorrectionCommit={correctStudioLayerLift}
            onApply={() => void applyStudioLayerLift()}
            onCancel={closeStudioLayerLift}
          />
        </Suspense>
      ) : null}
        </div>

      <StudioCanvasContextMenu
        open={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        hasElement={contextMenu.elId !== null}
        locked={
          contextMenuEl
            ? isEffectivelyLocked(contextMenuEl, groups)
            : false
        }
        onEditVrm={
          contextMenuEl?.type === "image" &&
          (contextMenuEl.vrmScene || parseStudio3dTool(contextMenuEl.src) === "vrm-poser")
            ? () => {
                setPoserInitialDataUrl(contextMenuEl.src);
                setPoserInitialElementId(contextMenuEl.id);
                setPoserVrmOpen(true);
              }
            : undefined
        }
        onEditBackground3d={
          contextMenuEl?.type === "image" && contextMenuBg3dEditSource
            ? () => {
                setBg3dInitialScene(contextMenuBg3dEditSource.scene);
                setBg3dInitialDataUrl(contextMenuBg3dEditSource.legacyDataUrl);
                setBg3dInitialElementId(contextMenuEl.id);
                setBg3dOpen(true);
              }
            : undefined
        }
        onPreloadBackground3d={preloadStudioBackground3D}
        onSaveAsEmeres={() => {
          if (contextMenu.elId) void saveElementAsEmeresLibraryItem(contextMenu.elId);
        }}
        onDuplicate={duplicateSelected}
        onReorder={reorder}
        onToggleLock={() => {
          if (contextMenuEl) {
            const contextTargetSelected =
              selectedIdRef.current === contextMenuEl.id ||
              marqueeIdsRef.current.includes(contextMenuEl.id);
            if (contextTargetSelected && completeSelectedGroupId()) {
              toggleSelectedElementsLocked();
            } else {
              patchEl(contextMenuEl.id, {
                locked: !isEffectivelyLocked(contextMenuEl, groups),
              });
            }
          }
        }}
        onDelete={removeSelected}
        onSelectPen={() => {
          activatePrimaryCanvasTool("draw", "pen");
        }}
        onAddSpeechBubble={() => addBubble("speech")}
        onAddText={() => addText()}
        onAddPage={addPage}
        onEnableQuickShape={() => {
          activatePrimaryCanvasTool("draw", "pen");
          setQuickShapeActive(true);
        }}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
      />
    </Container>
    {canvasOnlyMode ? (
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[45] flex justify-center px-3">
        <button
          type="button"
          onClick={() => setCanvasOnlyMode(false)}
          className="pointer-events-auto inline-flex min-h-10 items-center gap-2 rounded-full border border-line bg-panel/95 px-3 text-xs font-semibold text-fg shadow-lg backdrop-blur transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          title="일반 편집 화면으로 복원 (Esc)"
        >
          <Maximize2
            size={STUDIO_ICON_SIZE.context}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioChromeIconClass({ tone: "accent" })}
          />
          도구막대 복원
          <kbd className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.65rem] font-medium text-fg-3">Esc</kbd>
        </button>
      </div>
    ) : null}
    {/*
      §15.3 Help 그룹의 다섯 표면(현재 도구·용어 사전·진단·복구·라이선스·버그
      리포트) 호스트. 자기 상태만 들고 채널로 요청을 받으므로 prop 이 없고, 열기
      전에는 아무것도 렌더하지 않는다. 캔버스만 모드에서도 살아 있어야 해서
      Container 밖 최상단에 둔다.
    */}
    <StudioHelpCenterHost />
    </div>
    </StudioToolHintPreferencesProvider>
    </StudioLiveCollaborationProvider>
  );

}
