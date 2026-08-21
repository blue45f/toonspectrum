/* Extracted stage pointer handlers from StudioCuttoonEditor.
 * Closures keep the original editor typing envelope via an `any` host bag. */
// @ts-nocheck
import { flushSync } from "react-dom";

import { resolveStudioCapturedBrushDynamicsPresetId } from "../brush/studio-brush-dynamics";
import {
  advanceStudioBrushVelocityPressure,
  initializeStudioBrushVelocityPressure,
  resolveStudioBrushReleasePressure,
} from "../brush/studio-brush-velocity-pressure";
import { isCompleteStudioDrawOp } from "../brush/studio-draw-completion";
import { studioLiveRetainedMediaOverlaySupportsElement } from "../live/studio-live-retained-media-overlay";
import { planStudioDrawPointerRelease } from "../brush/studio-draw-pointer-release-plan";
import { planStudioDrawPointerStart } from "../brush/studio-draw-pointer-start-plan";
import {
  executeStudioDraftPreviewBackdropBoundary,
  planStudioDraftPreviewBackdropBoundary,
  studioLiveBrushEffectiveDiameter,
  studioLiveBrushPressure,
  studioLiveBrushPressureSamples,
} from "../brush/studio-draw-rendering";
import { requireStudioDrawingPointerTransport } from "../brush/studio-drawing-pointer-transport";
import {
  studioInkFallbackPressure,
} from "../brush/studio-ink-pressure-model";
import { isStudioBrushCursorMode, shouldShowStudioBrushCursor } from "../canvas/studio-canvas-cursor";
import { bubbleShapeCanvasPointToLocal, hasCustomBubbleShape, moveBubbleShapePoint } from "../lettering/studio-bubble-custom-shape";
import { beginStudioAdvancedFillTap, endStudioAdvancedFillTap, moveStudioAdvancedFillTap } from "../studio-advanced-fill-tap";
import { resolveActiveStudioAdvancedRuler, type StudioAdvancedRuler } from "../studio-advanced-ruler-document";
import { snapStudioAdvancedRulerStrokePoint } from "../studio-advanced-ruler-snap";
import { CANVAS_W } from "../studio-assets";
import {
  mapStudioDocumentPointToAutoColorSeed,
  sampleStudioAutoColorStrokeSeeds,
  shouldKeepStudioAutoColorStrokeSample,
  STUDIO_AUTO_COLOR_STROKE_MIN_DISTANCE_DOC_DEFAULT,
} from "../studio-auto-color-hints-canvas-seed";
import { normalizeCalligraphyStylusInput, strokeSampleDistanceForScale } from "../studio-brush";
import {
  hasStudioCanonicalVNextQualityShadowRuntime,
  submitStudioCanonicalVNextQualityShadowFinalParity,
} from "../studio-canonical-vnext-quality-shadow";
import { studioElementIdOf } from "../canvas/studio-canvas-shared-runtime";
import { shouldAppendStudioCausalInkSample } from "../studio-causal-ink";
import { shouldOwnStudioCoalescedBatchDraft } from "../studio-coalesced-batch-mutation";
import { COLOR_WHEEL_LONG_PRESS_MS, shouldCancelLongPress } from "../studio-color-wheel";
import {
  studioDrawElementSampleSlice,
  studioDrawElementToCrdtStroke,
} from "../live/studio-crdt-draw-bridge";
import {
  beginCropDrag,
  cropAspectRatio,
  cropHitTolerance,
  hitTestCropHandle,
  updateCropDrag,
} from "../studio-crop";
import { NODE_SMOOTH_DRAG_RANGE_PX, smoothPointsAroundIndex, updateSmoothStrengthDrag } from "../studio-curve-smoothing";
import { planStudioDeferredStrokePostprocess } from "../studio-deferred-stroke-postprocess";
import { containingPanel, elBounds } from "../studio-element-geometry";
import { attachStudioFilterMaskSurfaceAcrossHistory } from "../filter/studio-filter-mask-surface-admission";
import {
  createFixedRateStrokeFilter,
  quantizeFixedRateStrokeSample,
  transitionFixedRateStrokeFilter,
  type FixedRateStrokeFilteredSample,
} from "../studio-fixed-rate-stroke-filter";
import {
  advanceFixedRateStrokeFrameClock,
  advanceFixedRateStrokeSampleClockFloor,
  normalizeFixedRateStrokeSampleTimeStamps,
} from "../studio-fixed-rate-stroke-frame-pump";
import {
  expandSelectionIdsToGroupUnits,
  planAtomicSelectionTranslation,
  selectionShapeForIds,
} from "../studio-group-selection";
import { computeHealCloneSourceOffset, healCloneSourcePoint } from "../studio-heal-clone";
import type { StudioHokusaiLiveCanonicalResult } from "../render/studio-hokusai-live-brush-runtime";
import {
  createStudioHokusaiLiveCanonicalTransaction,
} from "../render/studio-hokusai-live-brush-transaction";
import {
  studioHokusaiSourceRevision,
} from "../render/studio-hokusai-natural-media-contract";
import { uid } from "../studio-id";
import {
  resolveIsometricAxisRay,
  shouldSnapStrokeToIsometricAxis,
  snapStrokePointToIsometricGrid,
} from "../studio-isometric-grid";
import { studioKonvaRuntime as KonvaRuntime } from "../render/studio-konva-runtime";
import { isEffectivelyHidden, isEffectivelyLocked } from "../studio-layers";
import {
  createStudioPixelEditCanvas,
  loadStudioPixelEditImage,
  studioInkGestureTimeOrigin,
} from "../studio-legacy-editor-runtime-helpers";
import { studioLinked3dPassDestructiveEditReason } from "../studio-linked-3d-raster-edit-policy";
import { createStudioLinked3dCorrectionProvenance } from "../studio-linked-3d-render-document";
import {
  appendStudioLiquifyPointerPoint,
  beginStudioLiquifyPointerSession,
  isStudioLiquifyPointerOwner,
} from "../studio-liquify-pointer";
import { studioLiquifyDragMinDistance } from "../studio-liquify-stroke-sampling";
import { resolveStudioLivePublishedCursorTool } from "../live/studio-live-canvas-overlay-model";
import {
  createStudioLivingInkCanonicalTransaction,
  studioLivingInkReceiptReplayToken,
  type StudioLivingInkCanonicalResult,
} from "../studio-living-ink-document";
import { studioLivingInkCoverageIntersectsStroke } from "../studio-living-ink-overlay";
import { studioLivingInkFailureDisposition } from "../studio-living-ink-product-admission";
import type { StudioLivingInkFinishedWork } from "../studio-living-ink-studio-coordinator";
import {
  beginNodeDrag,
  hitTestNodeHandle,
  NODE_EDIT_WIDTH_DRAG_RANGE_PX,
  updateNodeDragMove,
  updateNodeDragWidth,
  withPointMoved,
  withPressureEdited,
} from "../studio-node-edit";
import { snapStudioObjectDragPosition } from "../studio-object-drag-snap";
import { STUDIO_POINTER_PREDICTION_ENABLED } from "../studio-page-shell-runtime";
import { beginPanelSplitDrag, planPanelSplit, previewPanelSplit, type PanelSplitLine } from "../studio-panel-split";
import { normalizeStudioPersistedPointerChannels } from "../studio-persisted-pointer-channels";
import { resolvePerspectiveRay, snapStrokePointToPerspective } from "../studio-perspective-guide";
import {
  isStudioPixelPencilRenderMode,
  shouldAppendStudioPixelPencilSample,
} from "../studio-pixel-pencil";
import {
  beginStudioStrokePointerSession,
  collectStudioStrokePointerBatch,
  isStudioStrokePointerEvent,
  shouldCommitStudioStrokeOnPointerCancel,
  shouldEndStudioStrokeForReleasedContact,
  shouldCancelStudioFingerStrokeForAdditionalContact,
} from "../canvas/studio-pointer-input";
import { canCollectStudioPointerPredictionsForActiveTail } from "../canvas/studio-pointer-prediction-capability";
import {
  planStudioPointerReleaseEndpoint,
  type StudioPointerReleaseEndpointSample,
} from "../canvas/studio-pointer-release-endpoint-plan";
import { planStudioPredictedInkSuffixDraft } from "../studio-predicted-ink-tail";
import { addPuppetPin } from "../studio-puppet-warp";
import { applyMaskStrokeDabs } from "../studio-quick-mask";
import { canPublishStudioRasterLayer } from "../render/studio-raster-layer-write-guard";
import { STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED } from "../render/studio-raster-publication-feature";
import {
  appendStudioRasterRetouchDragPoint,
  thinStudioRasterRetouchPointsForApply,
} from "../render/studio-raster-retouch-stroke-sampling";
import { QUICKSHAPE_KIND_LABELS } from "../studio-quickshape-labels";
import { replaceStudioRawPenInkPreview, syncStudioRawPenInkPreviewAuthority } from "../studio-raw-pen-ink-preview";
import { appendStudioPendingRasterRetouchGesturePoint } from "../studio-retouch-raster-gesture";
import { normalizeMarqueeRect, selectIdsByMarquee } from "../studio-selection";
import {
  appendBrushPoint,
  appendPolyLassoVertex,
  beginPolyLassoSession,
  beginSelectionDrag,
  canvasPointToNormalized,
  isSelectionUsable,
  normalizedPointToCanvas,
  pointInSelection,
  polyLassoCloseToStart,
  resolveSelectionCombineOverride,
  selectionCombineModeForOperation,
  shouldMoveSelectionMarquee,
  snapLassoPointToEdge,
  translateSelection,
  updateSelectionDrag,
  type SelectionFrame,
  type SelPoint,
} from "../studio-selection-tools";
import {
  EMPTY_FREEHAND_OBJECT_SNAP_LATCH,
  EMPTY_SMART_GUIDE_OVERLAY,
  SMART_GUIDE_EPSILON,
  SMART_SNAP_THRESHOLD,
  buildPointObjectSnapOverlay,
  buildSmartGuideOverlay,
  buildSmartGuideOverlayPreview,
  computeSmartSnap,
  planFreehandObjectSnapPoint,
  shouldApplyStrokeObjectSnap,
  shouldMutateStrokeWithObjectSnap,
  snapPointToObjectGuides,
  type GuideBox,
} from "../studio-smart-guides";
import {
  shouldSynchronizeStudioStagePointerPosition,
  snapshotStudioStagePointerBatchMapper,
  type StudioStagePointerBatchMapper,
} from "../canvas/studio-stage-pointer-coordinate";
import { resolveShiftFreehandTransition } from "../brush/studio-stroke-constrain";
import {
  normalizeStudioStrokeGuideScale,
  shouldShowStudioStrokeGuide,
} from "../brush/studio-stroke-guide";
import { resolveStudioStrokeObjectSnapTargets } from "../brush/studio-stroke-object-snap-cache";
import {
  createStudioPointerVelocityState,
  createStudioStrokeStabilizerBridge,
  createStudioStrokeStabilizerState,
  flushStudioStrokeStabilizerEndpoint,
  sampleStudioPointerVelocity,
  stabilizeStudioStrokeSample,
} from "../brush/studio-stroke-stabilizer";
import { claimStudioStrokeSurfaceLifecycle } from "../brush/studio-stroke-surface-route";
import {
  createStudioThinLineInkInputState,
  filterStudioThinLineInkInput,
  flushStudioThinLineInkInput,
  shouldFilterStudioThinLineInkInput,
} from "../studio-thin-line-ink-input-v1";
import { studioWorkAssetDestructiveEditReason } from "../studio-work-asset-edit-guard";
import type { StudioCrdtSceneGraphRuntime } from "../live/StudioLiveCollaborationProvider";

import type { StudioCrdtDocument } from "../live/studio-crdt-document";
import type { StudioBackground3DMagicFilterMask } from "../scene-3d/studio-3d-insert-contract";
import type { DrawEl, El, FrameEl, ImageEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type Konva from "konva";

import { isStudioInkInputContractV2 } from "@/lib/studio-ink-input-contract";


type PixelSelectionActivationKind = string;
type StudioHokusaiPinnedLiveStroke = any;
type StudioLivingInkPinnedStroke = any;

export type StudioCuttoonStagePointersHost = {
  activeCatalogBrush: any;
  activeGroupId: any;
  activeGroupIdRef: any;
  activeSurfaceReviewLockedRef: any;
  advancedFillAbortRef: any;
  advancedFillActive: any;
  advancedFillTapGestureRef: any;
  advancedFillTapPayloadRef: any;
  advancedFillTouchPanRef: any;
  advancedFillVirtualTarget: any;
  advancedRulerSnapRef: any;
  announceDrawingShortcut: any;
  appSettingsRef: any;
  appendStudioHokusaiAuthoritativeSuffix: any;
  appendStudioLivingInkAuthoritativeSuffix: any;
  applyDodgeBurnStroke: any;
  applyGroupSelectionState: any;
  applySmudgeStroke: any;
  applyStudioDrawingColor: any;
  applyVectorEraseToIntersectionAt: any;
  applyWetMixStroke: any;
  armStudioLivingInkCanonicalHandoffTimeout: any;
  autoColorCanvasSeedNonceRef: any;
  autoColorPlanImageSizeRef: any;
  autoColorScribbleCanvasArmed: any;
  autoColorScribbleStrokeRef: any;
  bakeFilterMaskPaintStroke: any;
  bakeHealCloneDragStroke: any;
  bakeHistoryBrushDragStroke: any;
  bakeLayerMaskPaintStroke: any;
  beginLiveResourceEdit: any;
  beginStudioDrawLiveSurfaces: any;
  brush: any;
  brushCursorDrawRafRef: any;
  brushCursorRef: any;
  brushDynamics: any;
  brushEnginePrograms: any;
  brushOpacity: any;
  bubbleAnchorPickActive: any;
  bubbleShapeDragRef: any;
  bubbleShapeRafRef: any;
  cancelCanvasSelectionResize: any;
  canvasInteractionUnitIds: any;
  causalPostCorrectionStateRef: any;
  clearStudioHokusaiVectorShadow: any;
  clearStudioLivingInkVectorShadow: any;
  collaborationAccessRef: any;
  color: any;
  colorRangePickActive: any;
  colorWheelOpen: any;
  colorWheelPressRef: any;
  colorWheelTimerRef: any;
  commit: any;
  companionRuntimeRef: any;
  cropAspect: any;
  cropDragRef: any;
  cropRect: any;
  currentPageIdRef: any;
  currentRawPenInkPreviewEligibility: any;
  disarmAllPixelTools: any;
  discardDrawingPointerSession: any;
  documentSaveInFlightRef: any;
  dodgeBurnActive: any;
  dodgeBurnDragRef: any;
  dodgeBurnRadius: any;
  draftPreviewStoreRef: any;
  drawMode: any;
  drawShape: any;
  drawingCrdtPublishErrorRef: any;
  drawingCrdtPublisherRef: any;
  drawingCrdtStrokeActiveRef: any;
  drawingFixedRateFilterRef: any;
  drawingFixedRateOwnedPointsRef: any;
  drawingFixedRatePumpClockRef: any;
  drawingFixedRatePumpFrameRef: any;
  drawingFixedRateSampleClockRef: any;
  drawingGesturePreviewPublisherRef: any;
  drawingImmediateBatchMutationRef: any;
  drawingImmediateCausalInputRef: any;
  drawingInkTimeOriginRef: any;
  drawingInputSettingsRef: any;
  drawingLastAuthoritativePointerRef: any;
  drawingPointerTransportRef: any;
  drawingPrecisionStabilizerBridgeRef: any;
  drawingPredictionBatchMutationRef: any;
  drawingPredictionPreviewRef: any;
  drawingRef: any;
  drawingStabilizerRef: any;
  drawingThinLineInkInputRef: any;
  drawingVelocityPressureRef: any;
  drawingVelocityRef: any;
  editing: any;
  editorMountedRef: any;
  endLiveResourceEdit: any;
  eraseToIntersection: any;
  error: any;
  eyedropperActive: any;
  filterMaskCursorRef: any;
  filterMaskDragRef: any;
  filterMaskRadius: any;
  finalizeLiveStrokeBackendAudit: any;
  finishLiquifyPointerSession: any;
  finishPendingRasterRetouchGesture: any;
  finishPixelSelectionPointerSession: any;
  finishPolyLassoSession: any;
  flushPendingStrokeCommitsRef: any;
  freehandObjectSnapLatchRef: any;
  getClientPointFromKonvaEvent: any;
  gpuFinalFallbackOrderIdsRef: any;
  gpuLiveInkPinnedRef: any;
  gpuLiveSourceJournalRef: any;
  gridSize: any;
  groupDragRef: any;
  groupResizeRef: any;
  guides: any;
  handleBubbleShapePointerDown: any;
  handleStudioPointCommentStageDown: any;
  healCloneAligned: any;
  healCloneBusy: any;
  healCloneCursorRef: any;
  healCloneDragRef: any;
  healCloneOffsetRef: any;
  healClonePreviewLineRef: any;
  healCloneRadius: any;
  healCloneSourceAnchor: any;
  healCloneSourceCursorRef: any;
  healCloneTool: any;
  historyBrushBusy: any;
  historyBrushCursorRef: any;
  historyBrushDragRef: any;
  historyBrushRadius: any;
  historyBrushSourceSrc: any;
  hokusaiLiveFinalizingRef: any;
  hokusaiLiveOverlaySurfaceRef: any;
  hokusaiLiveOverlayVisibleRef: any;
  hokusaiLiveStrokeRef: any;
  inkMeshLivePreviewModuleRef: any;
  inkMeshLivePreviewRuntimeRef: any;
  isExporting: any;
  isPanning: any;
  isSpacePressed: any;
  isometricAxisRayRef: any;
  journalPendingPixelSelectionRasterGesture: any;
  journalPendingRasterRetouchGesture: any;
  layerMaskCursorRef: any;
  layerMaskDragRef: any;
  layerMaskRadius: any;
  liquifyCaptureTargetRef: any;
  liquifyDragRef: any;
  liquifyHandledNativeEndEventsRef: any;
  liquifyMode: any;
  liquifyRadius: any;
  liveDraftDirectRef: any;
  liveDraftLayerRef: any;
  liveDraftPendingRef: any;
  liveDraftVisualRef: any;
  liveDynamicBrushDraftDirectRef: any;
  liveDynamicBrushOverlayRendererRef: any;
  liveRetainedMediaDraftDirectRef: any;
  liveRetainedMediaOverlayRendererRef: any;
  liveInkOverlayRendererRef: any;
  liveInkPredictionRendererRef: any;
  liveStampDraftDirectRef: any;
  liveStampOverlayRendererRef: any;
  liveWetInkDraftDirectRef: any;
  liveWetInkOverlayRendererRef: any;
  livingInkAcceptedAuthorityRef: any;
  livingInkCanonicalHandoffRef: any;
  livingInkConfigRef: any;
  livingInkCoordinatorRef: any;
  livingInkFinalizingRef: any;
  livingInkOverlaySurfaceRef: any;
  livingInkOverlayVisibleRef: any;
  livingInkRejectedAuthorityRef: any;
  livingInkStrokeRef: any;
  livingInkWaterNoopStrokeIdsRef: any;
  mainLayerRef: any;
  markStudioDocumentChanged: any;
  marqueeStartRef: any;
  master: any;
  masterEditMode: any;
  masterEditModeRef: any;
  nodeEditDraft: any;
  nodeEditDragRef: any;
  nodeEditRafRef: any;
  nodeEditTool: any;
  nodeRefsRef: any;
  nodeSmoothStrength: any;
  nodeSmoothStrengthAtDragStartRef: any;
  noteQuickShapePointerMoved: any;
  onStudioLivingInkOverlayPresented: any;
  openColorWheelAt: any;
  pagesHiRef: any;
  pagesHistoryRef: any;
  panelGutter: any;
  panelSplitActive: any;
  panelSplitDragRef: any;
  panelSplitLastLineRef: any;
  panelSplitPreview: any;
  patchEl: any;
  pendingBubbleShapeDraftRef: any;
  pendingCommittedGroupDrawResetRef: any;
  pendingGpuStrokesRef: any;
  pendingMarqueeRectRef: any;
  pendingNodeEditDraftRef: any;
  pendingPixelSelectionRasterGestureRef: any;
  pendingRasterRetouchGestureRef: any;
  pendingStrokeCommitsRef: any;
  perspectiveRayRef: any;
  pickCanvasColorAt: any;
  pixelBrushRadius: any;
  pixelCombine: any;
  pixelDragRef: any;
  pixelForceCircle: any;
  pixelMarqueeRasterPreparationAbortRef: any;
  pixelMarqueeRasterPreparationActivationRef: any;
  pixelSelRef: any;
  pixelSelectionAutoTargetRef: any;
  pixelSelectionCaptureTargetRef: any;
  pixelSelectionHandledNativeEndEventsRef: any;
  pixelTool: any;
  polyLassoOperationRef: any;
  polyLassoSessionRef: any;
  postCorrection: any;
  predictedInkTailStateRef: any;
  preserveCorners: any;
  pressureCurve: any;
  pressureMinSize: any;
  publishStudioCrdtSceneTransitionRef: any;
  puppetWarpBusy: any;
  queueCommittedStrokeSurfaceHandoff: any;
  queueDeferredStrokeCommit: any;
  queueDeferredStrokePostprocess: any;
  quickMaskBrushMode: any;
  quickMaskDragRef: any;
  quickMaskHardness: any;
  quickMaskOpacity: any;
  quickMaskRadius: any;
  quickMaskSessionRef: any;
  quickShapeActive: any;
  quickShapeConvertedRef: any;
  quickShapeLivePointerOffsetRef: any;
  rawPenInkPreviewStateRef: any;
  rebaseStudioHistoryJournal: any;
  recentColors: any;
  refreshQuickMaskTint: any;
  refreshStudioHokusaiVectorTailShadow: any;
  releaseBubbleShapePointerCapture: any;
  releaseDrawingPointerSession: any;
  releaseLivingInkInputPointer: any;
  restorePendingStrokeCommits: any;
  runAdvancedFillAt: any;
  runColorRangeSample: any;
  runMagicWandSelect: any;
  scheduleLiquifyLivePreview: any;
  session: any;
  setActiveGroupId: any;
  setAutoColorCanvasSeedHit: any;
  setAutoColorCanvasSeedHits: any;
  setBubbleAnchorPickActive: any;
  setBubbleShapeDraft: any;
  setBubbleShapeSelectedPointIndex: any;
  setError: any;
  setEyedropperActive: any;
  setHealCloneDragPreview: any;
  setHealCloneSourceAnchor: any;
  setLivingInkBusy: any;
  setLivingInkScope: any;
  setMarqueeIds: any;
  setNodeEditDraft: any;
  setNodeSmoothStrength: any;
  setPagesHistoryState: any;
  setPanelSplitHint: any;
  setPanelSplitPreview: any;
  setPixelSel: any;
  setPolyLassoHover: any;
  setPolyLassoSession: any;
  setPuppetWarpPins: any;
  setSelectedId: any;
  settleZoomGestureRef: any;
  shapeFill: any;
  shared: any;
  showAlignmentGuides: any;
  showStudioHokusaiVectorShadow: any;
  showStudioLivingInkVectorShadow: any;
  smudgeActive: any;
  smudgeCursorRef: any;
  smudgeDragRef: any;
  smudgeRadius: any;
  snapEnabled: any;
  snapshotQuickShapeTracking: any;
  stabilizer: any;
  stabilizerMode: any;
  stagePointerFrameMapperCacheRef: any;
  stageRef: any;
  stampTuning: any;
  startFixedRateStrokePump: any;
  startQuickShapeTracking: any;
  stopFixedRateStrokePump: any;
  stopQuickShapeTracking: any;
  strokeGuideMetricsNodeRef: any;
  strokeGuideMetricsScaleRef: any;
  strokeGuideRef: any;
  strokeObjectSnapCacheRef: any;
  strokeWidth: any;
  studioCrdtAuthoritativeSaveBarrierRef: any;
  studioCrdtDocumentRef: any;
  studioCrdtSceneRuntimeRef: any;
  studioFilterMaskPublicationGenerationRef: any;
  studioLiveRoomRef: any;
  studioRasterPublicationControllersRef: any;
  studioRasterPublicationTailRef: any;
  studioRasterRetouchPreparationRef: any;
  studioStrokeSurfaceRouteRef: any;
  symmetryCenterX: any;
  symmetryCenterY: any;
  symmetryRadialCount: any;
  symmetryType: any;
  takePendingStrokeCommits: any;
  tiltEnabled: any;
  tipAngle: any;
  tipRoundness: any;
  tool: any;
  useVelocityPressure: any;
  userGuides: any;
  velocitySensitivity: any;
  wetMixActive: any;
  wetMixDragRef: any;
  wetMixRadius: any;
  wrapRef: any;
  zoomGestureRef: any;
  acquirePixelSelectionAutoTarget: any;
  activePage: any;
  activeSurfaceReviewLocked: any;
  advancedFillArmed: any;
  appendAuthoritativePredictedInkState: any;
  appendCausalPostCorrectionState: any;
  applyGuides: any;
  applySmartGuides: any;
  authorizedWorkAssetScopeId: any;
  canvasH: any;
  canvasInteractionBlocked: any;
  clearDraftPreview: any;
  clearFilterMaskDragPreview: any;
  clearHealCloneDragPreview: any;
  clearHistoryBrushDragPreview: any;
  clearLayerMaskDragPreview: any;
  clearMarqueePreview: any;
  clearPaintRetouchStrokePreview: any;
  clearQuickMaskDragPreview: any;
  commentPinArmed: any;
  currentMagneticLassoField: any;
  DEFERRED_STROKE_COMMIT_IDLE_MS: any;
  dodgeBurnArmed: any;
  drawingAssistDocument: any;
  effScale: any;
  elementById: any;
  elements: any;
  exitDirectLiveDraft: any;
  filterMaskPaintArmed: any;
  flushCropRect: any;
  flushDirectLiveDraftNow: any;
  flushPanelSplitPreview: any;
  groups: any;
  healCloneArmed: any;
  historyBrushArmed: any;
  isRealtimeTeamSession: any;
  isometricAngleDeg: any;
  isometricGridActive: any;
  layerMaskPaintArmed: any;
  liquifyArmed: any;
  liveBrushPressureSamplesFor: any;
  liveInkStyleFor: any;
  nodeEditArmed: any;
  nodeEditHandles: any;
  pages: any;
  panelSplitArmed: any;
  perspectiveRulerActive: any;
  pixelToolArmed: any;
  pixelToolGestureArmed: any;
  pixelToolRasterPreparationArmed: any;
  preparePixelMarqueeRasterTarget: any;
  previewCausalPostCorrectionTail: any;
  puppetWarpArmed: any;
  quickMaskArmed: any;
  replacePredictedInkTail: any;
  scheduleBubbleShapeDraft: any;
  scheduleCropRect: any;
  scheduleDraft: any;
  scheduleFilterMaskDragPreview: any;
  scheduleHealCloneDragPreview: any;
  scheduleHistoryBrushDragPreview: any;
  scheduleLayerMaskDragPreview: any;
  scheduleLiveDrawPressure: any;
  scheduleMarqueeRect: any;
  scheduleNodeEditDraft: any;
  schedulePaintRetouchStrokePreview: any;
  schedulePanelSplitPreview: any;
  schedulePixelDragPreview: any;
  scheduleQuickMaskDragPreview: any;
  sealCausalPostCorrectionState: any;
  selected: any;
  settleGpuLiveStroke: any;
  smudgeArmed: any;
  studioAuthUserId: any;
  studioCrdtOperationSyncReady: any;
  updateScrollPos: any;
  vanishingPoints: any;
  wetMixArmed: any;
};

export function bindStudioCuttoonStagePointers(h: StudioCuttoonStagePointersHost) {
  const {
    activeCatalogBrush,
    activeGroupId,
    activeGroupIdRef,
    activeSurfaceReviewLockedRef,
    advancedFillAbortRef,
    advancedFillActive,
    advancedFillTapGestureRef,
    advancedFillTapPayloadRef,
    advancedFillTouchPanRef,
    advancedFillVirtualTarget,
    advancedRulerSnapRef,
    announceDrawingShortcut,
    appSettingsRef,
    appendStudioHokusaiAuthoritativeSuffix,
    appendStudioLivingInkAuthoritativeSuffix,
    applyDodgeBurnStroke,
    applyGroupSelectionState,
    applySmudgeStroke,
    applyStudioDrawingColor,
    applyVectorEraseToIntersectionAt,
    applyWetMixStroke,
    armStudioLivingInkCanonicalHandoffTimeout,
    autoColorCanvasSeedNonceRef,
    autoColorPlanImageSizeRef,
    autoColorScribbleCanvasArmed,
    autoColorScribbleStrokeRef,
    bakeFilterMaskPaintStroke,
    bakeHealCloneDragStroke,
    bakeHistoryBrushDragStroke,
    bakeLayerMaskPaintStroke,
    beginLiveResourceEdit,
    beginStudioDrawLiveSurfaces,
    brush,
    brushCursorDrawRafRef,
    brushCursorRef,
    brushDynamics,
    brushEnginePrograms,
    brushOpacity,
    bubbleAnchorPickActive,
    bubbleShapeDragRef,
    bubbleShapeRafRef,
    cancelCanvasSelectionResize,
    canvasInteractionUnitIds,
    causalPostCorrectionStateRef,
    clearStudioHokusaiVectorShadow,
    clearStudioLivingInkVectorShadow,
    collaborationAccessRef,
    color,
    colorRangePickActive,
    colorWheelOpen,
    colorWheelPressRef,
    colorWheelTimerRef,
    commit,
    companionRuntimeRef,
    cropAspect,
    cropDragRef,
    cropRect,
    currentPageIdRef,
    currentRawPenInkPreviewEligibility,
    disarmAllPixelTools,
    discardDrawingPointerSession,
    documentSaveInFlightRef,
    dodgeBurnActive,
    dodgeBurnDragRef,
    dodgeBurnRadius,
    draftPreviewStoreRef,
    drawMode,
    drawShape,
    drawingCrdtPublishErrorRef,
    drawingCrdtPublisherRef,
    drawingCrdtStrokeActiveRef,
    drawingFixedRateFilterRef,
    drawingFixedRateOwnedPointsRef,
    drawingFixedRatePumpClockRef,
    drawingFixedRatePumpFrameRef,
    drawingFixedRateSampleClockRef,
    drawingGesturePreviewPublisherRef,
    drawingImmediateBatchMutationRef,
    drawingImmediateCausalInputRef,
    drawingInkTimeOriginRef,
    drawingInputSettingsRef,
    drawingLastAuthoritativePointerRef,
    drawingPointerTransportRef,
    drawingPrecisionStabilizerBridgeRef,
    drawingPredictionBatchMutationRef,
    drawingPredictionPreviewRef,
    drawingRef,
    drawingStabilizerRef,
    drawingThinLineInkInputRef,
    drawingVelocityPressureRef,
    drawingVelocityRef,
    editing,
    editorMountedRef,
    endLiveResourceEdit,
    eraseToIntersection,
    error,
    eyedropperActive,
    filterMaskCursorRef,
    filterMaskDragRef,
    filterMaskRadius,
    finalizeLiveStrokeBackendAudit,
    finishLiquifyPointerSession,
    finishPendingRasterRetouchGesture,
    finishPixelSelectionPointerSession,
    finishPolyLassoSession,
    flushPendingStrokeCommitsRef,
    freehandObjectSnapLatchRef,
    getClientPointFromKonvaEvent,
    gpuFinalFallbackOrderIdsRef,
    gpuLiveInkPinnedRef,
    gpuLiveSourceJournalRef,
    gridSize,
    groupDragRef,
    groupResizeRef,
    guides,
    handleBubbleShapePointerDown,
    handleStudioPointCommentStageDown,
    healCloneAligned,
    healCloneBusy,
    healCloneCursorRef,
    healCloneDragRef,
    healCloneOffsetRef,
    healClonePreviewLineRef,
    healCloneRadius,
    healCloneSourceAnchor,
    healCloneSourceCursorRef,
    healCloneTool,
    historyBrushBusy,
    historyBrushCursorRef,
    historyBrushDragRef,
    historyBrushRadius,
    historyBrushSourceSrc,
    hokusaiLiveFinalizingRef,
    hokusaiLiveOverlaySurfaceRef,
    hokusaiLiveOverlayVisibleRef,
    hokusaiLiveStrokeRef,
    inkMeshLivePreviewModuleRef,
    inkMeshLivePreviewRuntimeRef,
    isExporting,
    isPanning,
    isSpacePressed,
    isometricAxisRayRef,
    journalPendingPixelSelectionRasterGesture,
    journalPendingRasterRetouchGesture,
    layerMaskCursorRef,
    layerMaskDragRef,
    layerMaskRadius,
    liquifyCaptureTargetRef,
    liquifyDragRef,
    liquifyHandledNativeEndEventsRef,
    liquifyMode,
    liquifyRadius,
    liveDraftDirectRef,
    liveDraftLayerRef,
    liveDraftPendingRef,
    liveDraftVisualRef,
    liveDynamicBrushDraftDirectRef,
    liveDynamicBrushOverlayRendererRef,
    liveRetainedMediaDraftDirectRef,
    liveRetainedMediaOverlayRendererRef,
    liveInkOverlayRendererRef,
    liveInkPredictionRendererRef,
    liveStampDraftDirectRef,
    liveStampOverlayRendererRef,
    liveWetInkDraftDirectRef,
    liveWetInkOverlayRendererRef,
    livingInkAcceptedAuthorityRef,
    livingInkCanonicalHandoffRef,
    livingInkConfigRef,
    livingInkCoordinatorRef,
    livingInkFinalizingRef,
    livingInkOverlaySurfaceRef,
    livingInkOverlayVisibleRef,
    livingInkRejectedAuthorityRef,
    livingInkStrokeRef,
    livingInkWaterNoopStrokeIdsRef,
    mainLayerRef,
    markStudioDocumentChanged,
    marqueeStartRef,
    master,
    masterEditMode,
    masterEditModeRef,
    nodeEditDraft,
    nodeEditDragRef,
    nodeEditRafRef,
    nodeEditTool,
    nodeRefsRef,
    nodeSmoothStrength,
    nodeSmoothStrengthAtDragStartRef,
    noteQuickShapePointerMoved,
    onStudioLivingInkOverlayPresented,
    openColorWheelAt,
    pagesHiRef,
    pagesHistoryRef,
    panelGutter,
    panelSplitActive,
    panelSplitDragRef,
    panelSplitLastLineRef,
    panelSplitPreview,
    patchEl,
    pendingBubbleShapeDraftRef,
    pendingCommittedGroupDrawResetRef,
    pendingGpuStrokesRef,
    pendingMarqueeRectRef,
    pendingNodeEditDraftRef,
    pendingPixelSelectionRasterGestureRef,
    pendingRasterRetouchGestureRef,
    pendingStrokeCommitsRef,
    perspectiveRayRef,
    pickCanvasColorAt,
    pixelBrushRadius,
    pixelCombine,
    pixelDragRef,
    pixelForceCircle,
    pixelMarqueeRasterPreparationAbortRef,
    pixelMarqueeRasterPreparationActivationRef,
    pixelSelRef,
    pixelSelectionAutoTargetRef,
    pixelSelectionCaptureTargetRef,
    pixelSelectionHandledNativeEndEventsRef,
    pixelTool,
    polyLassoOperationRef,
    polyLassoSessionRef,
    postCorrection,
    predictedInkTailStateRef,
    preserveCorners,
    pressureCurve,
    pressureMinSize,
    publishStudioCrdtSceneTransitionRef,
    puppetWarpBusy,
    queueCommittedStrokeSurfaceHandoff,
    queueDeferredStrokeCommit,
    queueDeferredStrokePostprocess,
    quickMaskBrushMode,
    quickMaskDragRef,
    quickMaskHardness,
    quickMaskOpacity,
    quickMaskRadius,
    quickMaskSessionRef,
    quickShapeActive,
    quickShapeConvertedRef,
    quickShapeLivePointerOffsetRef,
    rawPenInkPreviewStateRef,
    rebaseStudioHistoryJournal,
    recentColors,
    refreshQuickMaskTint,
    refreshStudioHokusaiVectorTailShadow,
    releaseBubbleShapePointerCapture,
    releaseDrawingPointerSession,
    releaseLivingInkInputPointer,
    restorePendingStrokeCommits,
    runAdvancedFillAt,
    runColorRangeSample,
    runMagicWandSelect,
    scheduleLiquifyLivePreview,
    session,
    setActiveGroupId,
    setAutoColorCanvasSeedHit,
    setAutoColorCanvasSeedHits,
    setBubbleAnchorPickActive,
    setBubbleShapeDraft,
    setBubbleShapeSelectedPointIndex,
    setError,
    setEyedropperActive,
    setHealCloneDragPreview,
    setHealCloneSourceAnchor,
    setLivingInkBusy,
    setLivingInkScope,
    setMarqueeIds,
    setNodeEditDraft,
    setNodeSmoothStrength,
    setPagesHistoryState,
    setPanelSplitHint,
    setPanelSplitPreview,
    setPixelSel,
    setPolyLassoHover,
    setPolyLassoSession,
    setPuppetWarpPins,
    setSelectedId,
    settleZoomGestureRef,
    shapeFill,
    shared,
    showAlignmentGuides,
    showStudioHokusaiVectorShadow,
    showStudioLivingInkVectorShadow,
    smudgeActive,
    smudgeCursorRef,
    smudgeDragRef,
    smudgeRadius,
    snapEnabled,
    snapshotQuickShapeTracking,
    stabilizer,
    stabilizerMode,
    stagePointerFrameMapperCacheRef,
    stageRef,
    stampTuning,
    startFixedRateStrokePump,
    startQuickShapeTracking,
    stopFixedRateStrokePump,
    stopQuickShapeTracking,
    strokeGuideMetricsNodeRef,
    strokeGuideMetricsScaleRef,
    strokeGuideRef,
    strokeObjectSnapCacheRef,
    strokeWidth,
    studioCrdtAuthoritativeSaveBarrierRef,
    studioCrdtDocumentRef,
    studioCrdtSceneRuntimeRef,
    studioFilterMaskPublicationGenerationRef,
    studioLiveRoomRef,
    studioRasterPublicationControllersRef,
    studioRasterPublicationTailRef,
    studioRasterRetouchPreparationRef,
    studioStrokeSurfaceRouteRef,
    symmetryCenterX,
    symmetryCenterY,
    symmetryRadialCount,
    symmetryType,
    takePendingStrokeCommits,
    tiltEnabled,
    tipAngle,
    tipRoundness,
    tool,
    useVelocityPressure,
    userGuides,
    velocitySensitivity,
    wetMixActive,
    wetMixDragRef,
    wetMixRadius,
    wrapRef,
    zoomGestureRef,
    acquirePixelSelectionAutoTarget,
    activePage,
    activeSurfaceReviewLocked,
    advancedFillArmed,
    appendAuthoritativePredictedInkState,
    appendCausalPostCorrectionState,
    applyGuides,
    applySmartGuides,
    authorizedWorkAssetScopeId,
    canvasH,
    canvasInteractionBlocked,
    clearDraftPreview,
    clearFilterMaskDragPreview,
    clearHealCloneDragPreview,
    clearHistoryBrushDragPreview,
    clearLayerMaskDragPreview,
    clearMarqueePreview,
    clearPaintRetouchStrokePreview,
    clearQuickMaskDragPreview,
    commentPinArmed,
    currentMagneticLassoField,
    DEFERRED_STROKE_COMMIT_IDLE_MS,
    dodgeBurnArmed,
    drawingAssistDocument,
    effScale,
    elementById,
    elements,
    exitDirectLiveDraft,
    filterMaskPaintArmed,
    flushCropRect,
    flushDirectLiveDraftNow,
    flushPanelSplitPreview,
    groups,
    healCloneArmed,
    historyBrushArmed,
    isRealtimeTeamSession,
    isometricAngleDeg,
    isometricGridActive,
    layerMaskPaintArmed,
    liquifyArmed,
    liveBrushPressureSamplesFor,
    liveInkStyleFor,
    nodeEditArmed,
    nodeEditHandles,
    pages,
    panelSplitArmed,
    perspectiveRulerActive,
    pixelToolArmed,
    pixelToolGestureArmed,
    pixelToolRasterPreparationArmed,
    preparePixelMarqueeRasterTarget,
    previewCausalPostCorrectionTail,
    puppetWarpArmed,
    quickMaskArmed,
    replacePredictedInkTail,
    scheduleBubbleShapeDraft,
    scheduleCropRect,
    scheduleDraft,
    scheduleFilterMaskDragPreview,
    scheduleHealCloneDragPreview,
    scheduleHistoryBrushDragPreview,
    scheduleLayerMaskDragPreview,
    scheduleLiveDrawPressure,
    scheduleMarqueeRect,
    scheduleNodeEditDraft,
    schedulePaintRetouchStrokePreview,
    schedulePanelSplitPreview,
    schedulePixelDragPreview,
    scheduleQuickMaskDragPreview,
    sealCausalPostCorrectionState,
    selected,
    settleGpuLiveStroke,
    smudgeArmed,
    studioAuthUserId,
    studioCrdtOperationSyncReady,
    updateScrollPos,
    vanishingPoints,
    wetMixArmed,

  } = h;

  function onStageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (
      e.target.name() === "symmetry-handle"
      || e.target.name() === "guide-line-handle"
      || e.target.name() === "vp-handle"
      || e.target.name() === "isometric-origin-handle"
    ) {
      return;
    }
    const stagePointerEvent = e.evt as PointerEvent;
    // One contact owns a liquify gesture. A second finger is ignored and cannot cancel or replace it.
    if (liquifyDragRef.current) return;
    // One contact also owns a pixel-selection drag; a palm/second finger cannot replace it.
    if (pixelDragRef.current) return;
    // Raster preparation journals the first vector-only selection contact with the same ownership
    // rule; a second touch/palm cannot replace its start point or release owner.
    if (pendingPixelSelectionRasterGestureRef.current) return;
    // The same one-contact rule protects the first smudge/dodge/wet-mix/liquify gesture while a
    // vector-only page is being rendered into its non-destructive editable raster copy.
    if (pendingRasterRetouchGestureRef.current) return;
    // The first contact owns a bubble point drag. A palm/second finger cannot replace its owner.
    if (bubbleShapeDragRef.current) return;
    if (handleStudioPointCommentStageDown(e, stagePointerEvent)) return;
    if (canvasInteractionBlocked && !commentPinArmed) return;
    const pendingRetouchPreparation = studioRasterRetouchPreparationRef.current;
    const pendingSelectionPreparation = pixelMarqueeRasterPreparationActivationRef.current;
    if (pendingSelectionPreparation && !isSpacePressed) {
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        journalPendingPixelSelectionRasterGesture({
          captureFallback: e.target.getStage()?.container() ?? null,
          event: stagePointerEvent,
          forceCircle: pendingSelectionPreparation.forceCircle,
          position,
          tool: pendingSelectionPreparation.tool,
        });
      }
      // The requested pixel tool may not have reached this render's closure yet. Preparation owns
      // the contact through its synchronous ref so the first fast drag cannot move a source vector.
      return;
    }
    if (pendingRetouchPreparation && !isSpacePressed) {
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        journalPendingRasterRetouchGesture({
          captureFallback: e.target.getStage()?.container() ?? null,
          event: stagePointerEvent,
          position,
        });
      }
      // During preparation, never let the same contact select/move the source vectors behind the
      // pending editable copy, even when a secondary contact was deliberately rejected.
      return;
    }
    // 색상 휠 롱프레스 무장 — 조건을 전부 만족할 때만 타이머를 건다. 이 블록은 return하지
    // 않는다(관찰만 함) — 아래 기존 분기들(스포이드/크롭/드로잉/마퀴 등)은 오늘과 동일하게
    // 그대로 실행된다. 타이머가 실제로 발화(450ms 정지 유지)했을 때만 openColorWheelAt 이
    // disarmAllPixelTools 로 그 사이 진행된 제스처(마퀴 시작 등)를 되돌린다.
    if (
      tool === "select" &&
      !isSpacePressed &&
      !cropRect &&
      !panelSplitActive &&
      !nodeEditTool &&
      !smudgeActive &&
      !dodgeBurnActive &&
      !wetMixActive &&
      !healCloneTool &&
      !advancedFillActive &&
      !eyedropperActive &&
      !bubbleAnchorPickActive &&
      !pixelTool &&
      !quickShapeActive &&
      !colorWheelOpen &&
      recentColors.length > 0 &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      if (clientPoint) {
        colorWheelPressRef.current = clientPoint;
        colorWheelTimerRef.current = setTimeout(() => {
          colorWheelTimerRef.current = null;
          openColorWheelAt(clientPoint.x, clientPoint.y);
        }, COLOR_WHEEL_LONG_PRESS_MS);
      }
    }
    // 스포이드: 토글 버튼으로 무장했거나(한 번 뽑으면 자동 해제), 펜 도구 중 Alt 를 누른 momentary
    // 방식(CSP/Photoshop 관례) — 다른 어떤 캔버스 제스처보다 항상 최우선으로 가로챈다.
    if (eyedropperActive || (tool === "draw" && e.evt.altKey && !healCloneArmed)) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const hex = pickCanvasColorAt(pos);
        if (hex) applyStudioDrawingColor(hex);
      }
      if (eyedropperActive) setEyedropperActive(false);
      return;
    }
    // CSP 교점까지 지우기 — 지우개 + 토글 시 자유선 클릭 한 번으로 교차 구간을 정리한다.
    if (tool === "draw" && drawMode === "eraser" && eraseToIntersection) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos && applyVectorEraseToIntersectionAt(pos.x, pos.y)) return;
    }
    // Auto-color canvas scribble — armed panel places color seeds on the selected line-art image
    // (click starts a freehand path; move/up sample the stroke).
    if (autoColorScribbleCanvasArmed && selected?.type === "image") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      const planSize = autoColorPlanImageSizeRef.current;
      if (pos && planSize) {
        const imageFrame = {
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
          rotation: selected.rotation,
          flipped: selected.flipped,
          flippedY: selected.flippedY,
        };
        const sample = mapStudioDocumentPointToAutoColorSeed({
          documentX: pos.x,
          documentY: pos.y,
          image: imageFrame,
          pixelWidth: planSize.width,
          pixelHeight: planSize.height,
        });
        if (sample) {
          autoColorScribbleStrokeRef.current = {
            points: [pos.x, pos.y],
            lastDocX: pos.x,
            lastDocY: pos.y,
          };
          autoColorCanvasSeedNonceRef.current += 1;
          setAutoColorCanvasSeedHits(null);
          setAutoColorCanvasSeedHit({
            x: sample.x,
            y: sample.y,
            nonce: autoColorCanvasSeedNonceRef.current,
          });
          return;
        }
        setError("선화 이미지 안을 드래그해 시드를 찍어 주세요.");
        return;
      }
      if (pos && !planSize) {
        setError("먼저 자동 채색 힌트 계획을 한 번 실행해 선화 크기를 맞춰 주세요.");
        return;
      }
    }
    // 색상 범위 샘플 pick — 스포이드와 달리 다중 샘플 도구라 1회성 해제하지 않는다.
    // 무장 중엔 다른 스테이지 제스처를 차단한다(crop/heal-clone 정책과 동일).
    if (colorRangePickActive && selected?.type === "image") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const frame: SelectionFrame = {
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
          rotation: selected.rotation,
        };
        const p = canvasPointToNormalized(pos.x, pos.y, frame);
        if (p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) void runColorRangeSample(p);
      }
      return;
    }
    // 말풍선 꼬리 자동 부착 — 대상 픽커 무장 중: 다음 클릭으로 부착 대상(요소 또는 빈 좌표)을
    // 고른다. 스포이드와 동일하게 항상 1회성으로 해제.
    if (bubbleAnchorPickActive) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      setBubbleAnchorPickActive(false);
      if (pos && selected?.type === "bubble") {
        const clickedId = studioElementIdOf(e.target);
        if (activeSurfaceReviewLocked || isEffectivelyLocked(selected, groups)) {
          setError("말풍선 또는 상위 그룹의 잠금을 해제한 뒤 꼬리 대상을 지정해 주세요.");
        } else if (clickedId && clickedId === selected.id) {
          setError("말풍선 자기 자신은 부착 대상으로 고를 수 없어요.");
        } else if (clickedId) {
          patchEl(selected.id, { tailAnchorId: clickedId, tailAnchorPoint: undefined } as Partial<El>);
        } else {
          patchEl(selected.id, { tailAnchorPoint: { x: pos.x, y: pos.y }, tailAnchorId: undefined } as Partial<El>);
        }
      }
      return;
    }
    // 고급 채우기 — pointerdown에서는 탭 후보만 보관한다. pointerup까지 8px 이내의 단일 주 포인터
    // 탭일 때만 실행해 긴 캔버스 한 손가락 스크롤과 두 손가락 핀치를 채우기로 오인하지 않는다.
    if (advancedFillArmed) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos && !isSpacePressed && !(e.target.getParent() instanceof KonvaRuntime.Transformer)) {
        const clientPoint = getClientPointFromKonvaEvent(e.evt);
        const pointerEvent = e.evt as PointerEvent;
        const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
        const frame: SelectionFrame | null = advancedFillVirtualTarget?.frame ?? (
          selected?.type === "image"
            ? {
                x: selected.x,
                y: selected.y,
                width: selected.width,
                height: selected.height,
                rotation: selected.rotation,
              }
            : null
        );
        if (!frame) return;
        if (clientPoint) {
          const gesture = beginStudioAdvancedFillTap(advancedFillTapGestureRef.current, {
            pointerId,
            point: clientPoint,
            button: pointerEvent.button,
            isPrimary: pointerEvent.isPrimary,
          });
          advancedFillTapGestureRef.current = gesture;
          if (
            pointerEvent.pointerType === "touch" &&
            gesture.primaryPointerId === pointerId &&
            gesture.activePointerIds.length === 1 &&
            !gesture.blocked
          ) {
            advancedFillTouchPanRef.current = { pointerId, last: clientPoint };
          } else if (gesture.activePointerIds.length > 1) {
            advancedFillTouchPanRef.current = null;
          }
          if (
            gesture.primaryPointerId === pointerId &&
            gesture.activePointerIds.length === 1 &&
            !gesture.blocked
          ) {
            advancedFillTapPayloadRef.current = { position: pos, frame };
          }
        }
      }
      return;
    }
    // 크롭 모드 무장 중: 스테이지 드래그를 크롭 rect 조작(핸들 리사이즈/이동)으로 가로챈다.
    // 아래 픽셀 선택보다 먼저 검사한다 — 크롭 진입 시 픽셀 도구를 끄지만, 혹시 겹치면 크롭 우선.
    // 트랜스포머 앵커·Space 팬은 픽셀 선택과 동일하게 예외(크롭 rect 는 정규화라 리사이즈를 따라간다).
    if (
      cropRect &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      const handle = hitTestCropHandle(p, cropRect, cropHitTolerance(frame, 14 / effScale));
      if (handle) {
        cropDragRef.current = { elId: selected.id, frame, session: beginCropDrag(cropRect, handle, p) };
      }
      return; // 핸들 밖이어도 크롭 모드 중엔 마퀴·드로잉 등 다른 스테이지 제스처를 막는다.
    }
    // 패널 손그림 컷 무장 중: 스테이지 드래그를 절단선 그리기로 가로챈다. FrameEl 은 회전이
    // 없으므로(항상 캔버스 절대좌표) crop 처럼 정규화 좌표 변환이 필요 없다.
    if (panelSplitArmed && !isSpacePressed && !(e.target.getParent() instanceof KonvaRuntime.Transformer)) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      panelSplitDragRef.current = beginPanelSplitDrag(selected.id, { x: pos.x, y: pos.y });
      panelSplitLastLineRef.current = null;
      setPanelSplitHint(null);
      return; // 크롭/픽셀 선택과 동일하게 다른 스테이지 제스처(마퀴·드로잉 등)를 막는다.
    }
    // 벡터 노드 편집 무장 중: 핸들 히트테스트 후 드래그 세션을 연다. 무장 중엔 핸들 밖 클릭도
    // 마퀴 등 다른 제스처를 막는다 — crop/pixel 과 동일 정책.
    if (
      nodeEditArmed &&
      selected?.type === "draw" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const tolerance = 14 / effScale; // 화면 14px, crop 의 hitTolerance 관례와 동일
      const hitIdx = hitTestNodeHandle(pos, nodeEditHandles, tolerance);
      if (hitIdx !== null) {
        const session = beginNodeDrag(selected.points, selected.pressures, hitIdx, nodeEditTool!, pos);
        if (session) {
          nodeEditDragRef.current = { elId: selected.id, session };
          // "스무딩" 드래그의 강도 기준선을 스냅샷(다른 도구에선 참조되지 않아 무해).
          nodeSmoothStrengthAtDragStartRef.current = nodeSmoothStrength;
        }
      }
      return;
    }
    // 말풍선 커스텀 모양 점 편집 무장 중: 포인터를 말풍선 로컬좌표로 변환해(회전 포함)
    // 노드 편집과 동일한 히트테스트/드래그 개시 로직을 재사용한다. 무장 중엔 핸들 밖 클릭도
    // 다른 제스처를 막는다 — crop/node-edit과 동일 정책.
    if (handleBubbleShapePointerDown(e, stagePointerEvent)) return;
    // 문지르기 브러시 무장 중: 스테이지 드래그를 문지르기 스트로크 좌표 누적으로 가로챈다.
    if (
      smudgeArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const first = canvasPointToNormalized(pos.x, pos.y, frame);
      const radiusNorm = smudgeRadius / Math.max(1, frame.width);
      smudgeDragRef.current = {
        elId: selected.id,
        frame,
        points: [first],
        radiusNorm,
      };
      schedulePaintRetouchStrokePreview(smudgeDragRef.current);
      return;
    }
    // 닷지/번 무장 중: 스테이지 드래그를 보정 스트로크 좌표 누적으로 가로챈다.
    if (
      dodgeBurnArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const first = canvasPointToNormalized(pos.x, pos.y, frame);
      const radiusNorm = dodgeBurnRadius / Math.max(1, frame.width);
      dodgeBurnDragRef.current = {
        elId: selected.id,
        frame,
        points: [first],
        radiusNorm,
      };
      schedulePaintRetouchStrokePreview(dodgeBurnDragRef.current);
      return;
    }
    // 혼색 브러시 무장 중: 스테이지 드래그를 혼색 스트로크 좌표 누적으로 가로챈다.
    if (
      wetMixArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const first = canvasPointToNormalized(pos.x, pos.y, frame);
      const radiusNorm = wetMixRadius / Math.max(1, frame.width);
      wetMixDragRef.current = {
        elId: selected.id,
        frame,
        points: [first],
        radiusNorm,
      };
      schedulePaintRetouchStrokePreview(wetMixDragRef.current);
      return;
    }
    // 리퀴파이 — 이미지를 드래그하면 픽셀을 밀어 왜곡한다.
    if (
      liquifyArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      tool !== "hand" &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      if (stagePointerEvent.isPrimary === false) return;
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const session = beginStudioLiquifyPointerSession({
        elId: selected.id,
        frame,
        mode: liquifyMode,
        point: canvasPointToNormalized(pos.x, pos.y, frame),
        pointer: stagePointerEvent,
      });
      if (!session) return;
      liquifyDragRef.current = session;
      const radiusNorm = liquifyRadius / Math.max(1, frame.width);
      schedulePaintRetouchStrokePreview({
        frame,
        radiusNorm,
        points: session.points,
      });
      // Twirl/pinch/bloat can be a single dab — kick a preview immediately on down.
      scheduleLiquifyLivePreview();
      const captureTarget = stagePointerEvent.target instanceof Element
        ? stagePointerEvent.target
        : e.target.getStage()?.container() ?? null;
      liquifyCaptureTargetRef.current = captureTarget;
      try {
        captureTarget?.setPointerCapture(session.pointerId);
      } catch {
        // Global capture-phase pointerup remains the safety net on browsers without capture.
      }
      return;
    }
    // 퀵 마스크 무장 중: 스테이지 드래그를 마스크 브러시 좌표 누적으로 가로챈다(레이어 마스크 미러).
    if (
      quickMaskArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      quickMaskDragRef.current = { elId: selected.id, frame, points: [p] };
      scheduleQuickMaskDragPreview({ points: [p] });
      return;
    }
    // 레이어 마스크 브러시 무장 중: 스테이지 드래그를 마스크 스트로크 좌표 누적으로 가로챈다.
    // maskSrc가 아직 없어도 드래그를 시작할 수 있다(bakeLayerMaskStroke가 없으면 "전체 보임"
    // 흰 마스크를 자동으로 베이스 삼는다 — Photoshop이 마스크 없는 레이어에 처음 브러시를 대면
    // 자동으로 흰 마스크를 추가하는 관례와 동일).
    if (
      layerMaskPaintArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      layerMaskDragRef.current = { elId: selected.id, frame, points: [p] };
      scheduleLayerMaskDragPreview({ points: [p] });
      return;
    }
    // 필터 마스크 브러시 무장 중: 레이어 마스크와 동일하게 스테이지 드래그를 마스크 스트로크
    // 좌표 누적으로 가로챈다(filterMaskSrc가 없으면 bakeLayerMaskStroke가 흰 마스크를 자동 베이스로).
    if (
      filterMaskPaintArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      filterMaskDragRef.current = { elId: selected.id, frame, points: [p] };
      scheduleFilterMaskDragPreview({ points: [p] });
      return;
    }
    // 복구 브러시/도장 무장 중: Alt(Option)+클릭은 소스 앵커 지정, 일반 드래그는 페인트 스트로크.
    // crop/픽셀 선택과 동일한 정책 — 무장 중엔 다른 캔버스 제스처를 막는다. healCloneBusy 가드는
    // 직전 스트로크의 비동기 굽기가 끝나기 전에 새 스트로크를 시작해 patchEl 갱신이 서로를 덮어쓰는
    // (lost-update) 경쟁을 막는다.
    if (
      healCloneArmed &&
      !healCloneBusy &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      if (e.evt.altKey) {
        setHealCloneSourceAnchor(p);
        healCloneOffsetRef.current = null; // 새 앵커 지정 시 정렬 오프셋을 다음 스트로크에서 재계산.
        return;
      }
      if (!healCloneSourceAnchor) return; // 패널 상태 문구가 이미 "Alt+클릭으로 지정" 안내 중.
      const offset =
        healCloneAligned && healCloneOffsetRef.current
          ? healCloneOffsetRef.current
          : computeHealCloneSourceOffset(healCloneSourceAnchor, p);
      healCloneOffsetRef.current = offset;
      const radiusNorm = healCloneRadius / Math.max(1, selected.width);
      const session = { elId: selected.id, frame, offset, radiusNorm, points: [p] };
      healCloneDragRef.current = session;
      // 오버레이 마운트는 제스처당 한 번만 React에 알리고, 이후 move는 Line ref만 갱신한다.
      setHealCloneDragPreview({ points: [p], lineRef: healClonePreviewLineRef });
      scheduleHealCloneDragPreview(session);
      return;
    }
    // 히스토리 브러시 무장 중: 소스가 지정돼 있으면 일반 드래그로 스트로크 좌표를 누적한다(오프셋
    // 없음 — heal-clone 과 달리 Alt+클릭 지정 단계가 없다, 소스는 작업 내역 패널에서 이미 골랐다).
    if (
      historyBrushArmed &&
      !historyBrushBusy &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      if (!historyBrushSourceSrc) return; // 패널 상태 문구가 이미 "작업 내역에서 먼저 지정하세요" 안내 중.
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      const radiusNorm = historyBrushRadius / Math.max(1, selected.width);
      historyBrushDragRef.current = { elId: selected.id, frame, radiusNorm, points: [p] };
      scheduleHistoryBrushDragPreview({ points: [p] });
      return;
    }
    // 퍼펫 워프 무장 중: 빈 자리 클릭 = 새 핀 추가(그 자리에서 세션 없이 즉시 커밋). 기존 핀
    // 위 클릭은 오버레이의 Konva 네이티브 draggable(onDragMove)이 처리하므로 여기서는
    // "puppet-pin-handle" 이름으로 걸러 무시한다 — 안 걸러내면 핀을 클릭할 때마다 그 자리에 또
    // 새 핀이 추가돼 버린다(Konva 이벤트가 핀 Circle → Stage 로 버블링되기 때문).
    if (
      puppetWarpArmed &&
      !puppetWarpBusy &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer) &&
      e.target.name() !== "puppet-pin-handle"
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      setPuppetWarpPins((pins: any) => addPuppetPin(pins, { id: uid(), x: p.x, y: p.y }));
      return; // 무장 중엔 다른 스테이지 제스처(마퀴 등)를 막는다 — crop/heal-clone과 동일 정책.
    }
    // 픽셀 선택 도구 무장 중: 스테이지 드래그를 픽셀 선택 그리기로 가로챈다(요소 이동·마퀴·
    // 드로잉보다 우선). 트랜스포머 앵커는 예외(선택이 정규화 좌표라 리사이즈/회전을 따라간다),
    // Space/Hand 팬도 예외. 시작점은 이미지 밖이어도 된다(rect/ellipse 는 0..1 로 클램프).
    if (
      pixelToolGestureArmed &&
      !isSpacePressed &&
      tool !== "hand" &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      if (pixelToolRasterPreparationArmed && pixelTool) {
        // The artist began before the vector-only page copy finished rasterizing. Capture this
        // pointer now instead of dropping the gesture or letting it move a vector element. The
        // async preparation continuation replays the normalized drag once the full-page image is
        // atomically committed; pointermove/up below only update this bounded intent record.
        journalPendingPixelSelectionRasterGesture({
          event: stagePointerEvent,
          position: pos,
          tool: pixelTool,
          forceCircle: pixelForceCircle,
          captureFallback: e.target.getStage()?.container() ?? null,
        });
        return;
      }
      // 대상 이미지 해석 — 이미 편집 가능한 이미지가 선택돼 있으면 그대로, 아니면(arm-anytime)
      // 포인터 아래 최상단 이미지를 자동 획득해 선택하고 이번 제스처를 그 위에서 시작한다.
      // 자동 획득 id 를 ref 에 남겨 선택 변경 이펙트가 진행 중 제스처를 살려 두게 한다.
      let pixelTarget: ImageEl | null =
        pixelToolArmed && selected?.type === "image" ? selected : null;
      // 대상 재획득(2026-07-24) — 이미지 A가 선택된 채로 다른 이미지 B 위에서 드래그를 시작하면,
      // 예전에는 마퀴가 A의 좌표계로 계산돼 면적이 무의미해지고 아무 선택도 생기지 않았다("선택이
      // 됐다 안 됐다"의 원인). 시작점이 선택된 이미지 "밖"이면서 그 자리에 다른 편집 가능한
      // 이미지가 있을 때만 대상을 옮긴다 — 사각/타원은 이미지 밖에서 시작하는 것도 정상이므로
      // (좌표를 0..1 로 클램프한다) 아무것도 없는 빈 곳에서 시작하는 기존 동작은 그대로 둔다.
      if (pixelTarget) {
        const local = canvasPointToNormalized(pos.x, pos.y, {
          x: pixelTarget.x,
          y: pixelTarget.y,
          width: pixelTarget.width,
          height: pixelTarget.height,
          rotation: pixelTarget.rotation,
        });
        if (local.x < 0 || local.x > 1 || local.y < 0 || local.y > 1) {
          const under = acquirePixelSelectionAutoTarget(pos);
          const retarget = under.kind === "target" && under.id !== pixelTarget.id
            ? elementById.get(under.id) ?? null
            : null;
          if (retarget?.type === "image") {
            pixelTarget = retarget;
            pixelSelectionAutoTargetRef.current = retarget.id;
            setMarqueeIds([]);
            setSelectedId(retarget.id);
          }
        }
      }
      if (!pixelTarget) {
        const resolution = acquirePixelSelectionAutoTarget(pos);
        if (resolution.kind === "locked") {
          setError("이 위치의 이미지 레이어는 편집이 잠겨 있어요. 잠금을 먼저 해제하세요.");
          return;
        }
        const acquired =
          resolution.kind === "target" ? elementById.get(resolution.id) ?? null : null;
        if (!acquired || acquired.type !== "image") {
          const editableRasterCount = elements.filter(
            (element: any) =>
              element.type === "image"
              && !isEffectivelyHidden(element, groups)
              && !isEffectivelyLocked(element, groups)
              && !studioWorkAssetDestructiveEditReason(element)
              && !studioLinked3dPassDestructiveEditReason(element)
              && !element.isAnimatedGif
              && (element.frames?.length ?? 0) <= 1,
          ).length;
          if (editableRasterCount === 0 && pixelTool) {
            const activation: PixelSelectionActivationKind =
              pixelTool === "ellipse" && pixelForceCircle
                ? "circle"
                : pixelTool;
            // This call reaches its first dynamic-import await synchronously, so the preparation
            // controller/run id already exist when the pointer journal is attached immediately
            // below. Empty/locked/unsupported pages fail closed inside the same preparation seam.
            void preparePixelMarqueeRasterTarget(activation);
            if (pixelMarqueeRasterPreparationAbortRef.current) {
              journalPendingPixelSelectionRasterGesture({
                event: stagePointerEvent,
                position: pos,
                tool: pixelTool,
                forceCircle: pixelForceCircle,
                captureFallback: e.target.getStage()?.container() ?? null,
              });
              return;
            }
          }
          setError("픽셀을 고를 이미지가 이 위치에 없어요. 이미지 레이어 위에서 다시 시작하세요.");
          return;
        }
        pixelTarget = acquired;
        pixelSelectionAutoTargetRef.current = acquired.id;
        setMarqueeIds([]);
        setSelectedId(acquired.id);
      }
      if (!pixelTarget) return;
      const frame: SelectionFrame = {
        x: pixelTarget.x,
        y: pixelTarget.y,
        width: pixelTarget.width,
        height: pixelTarget.height,
        rotation: pixelTarget.rotation,
      };
      if (pixelTool === "wand") {
        void runMagicWandSelect(pos, frame);
        return;
      }
      // 제스처 시작 결합 모드 — 기존 선택이 있을 때만 Shift=합치기/Alt=빼기/둘 다=교집합으로
      // 덮어쓴다(Photoshop/CSP 관례). 선택이 없으면 base(add) + Shift/Alt 는 정원/중심 제약 의미.
      const effectiveCombine = resolveSelectionCombineOverride(
        pixelCombine,
        { shift: e.evt.shiftKey, alt: e.evt.altKey },
        isSelectionUsable(pixelSelRef.current)
      );
      const startNorm = canvasPointToNormalized(pos.x, pos.y, frame);
      const existingSelection = pixelSelRef.current;
      const frameAspect = frame.height / Math.max(1, frame.width);
      // Magma: drag inside the marching-ants marquee (without Shift/Alt combine) moves the
      // outline only. Content moves via Transform / content-transform actions.
      if (
        (pixelTool as string) !== "wand"
        && pixelTool !== "poly-lasso"
        && shouldMoveSelectionMarquee({
          hasUsableSelection: isSelectionUsable(existingSelection),
          pointInside: pointInSelection(existingSelection, startNorm, { aspect: frameAspect }),
          operationMode: effectiveCombine,
        })
        && existingSelection
      ) {
        const pointerId = Number.isFinite(stagePointerEvent.pointerId)
          ? stagePointerEvent.pointerId
          : 1;
        const stubDrag = beginSelectionDrag(
          pixelTool,
          selectionCombineModeForOperation(effectiveCombine),
          startNorm,
          0,
        );
        pixelDragRef.current = {
          elId: pixelTarget.id,
          frame,
          drag: stubDrag,
          operation: effectiveCombine,
          pointerId,
          magneticField: null,
          marqueeMove: {
            startNorm,
            baseSelection: existingSelection,
          },
        };
        const captureTarget = stagePointerEvent.target instanceof Element
          ? stagePointerEvent.target
          : e.target.getStage()?.container() ?? null;
        pixelSelectionCaptureTargetRef.current = captureTarget;
        try {
          captureTarget?.setPointerCapture(pointerId);
        } catch {
          // Global capture-phase pointerup remains the safety net on browsers without capture.
        }
        return;
      }
      // 다각형 올가미 — 클릭마다 꼭짓점. 시작점 근처 재클릭·더블클릭으로 닫기(드래그 세션 아님).
      if (pixelTool === "poly-lasso") {
        const raw = canvasPointToNormalized(pos.x, pos.y, frame);
        // 자석이 켜지고 휘도장이 로드됐으면 클릭 꼭짓점도 가까운 가장자리로 끌어당긴다.
        const magneticField = currentMagneticLassoField();
        const p = magneticField ? snapLassoPointToEdge(raw, magneticField) : raw;
        const existing = polyLassoSessionRef.current;
        const detail = "detail" in e.evt ? e.evt.detail : 1;
        if (existing && (detail >= 2 || polyLassoCloseToStart(existing, p))) {
          finishPolyLassoSession();
          return;
        }
        if (!existing) {
          polyLassoOperationRef.current = effectiveCombine;
          const next = beginPolyLassoSession(
            selectionCombineModeForOperation(effectiveCombine),
            p,
          );
          polyLassoSessionRef.current = next;
          setPolyLassoSession(next);
          setPolyLassoHover(null);
        } else {
          const next = appendPolyLassoVertex(existing, p);
          polyLassoSessionRef.current = next;
          setPolyLassoSession(next);
          setPolyLassoHover(null);
        }
        return;
      }
      // 브러시는 캔버스 px 반경을 요소 폭 기준 정규화 반경으로 넘긴다(다른 도구는 무시됨).
      const brushRadiusNorm = pixelBrushRadius / Math.max(1, pixelTarget.width);
      const drag = beginSelectionDrag(
        pixelTool,
        selectionCombineModeForOperation(effectiveCombine),
        canvasPointToNormalized(pos.x, pos.y, frame),
        brushRadiusNorm,
        { forceCircle: pixelForceCircle || (pixelTool === "ellipse" && e.evt.shiftKey) }
      );
      const pointerId = Number.isFinite(stagePointerEvent.pointerId)
        ? stagePointerEvent.pointerId
        : 1;
      pixelDragRef.current = {
        elId: pixelTarget.id,
        frame,
        drag,
        operation: effectiveCombine,
        pointerId,
        magneticField: currentMagneticLassoField(),
      };
      const captureTarget = stagePointerEvent.target instanceof Element
        ? stagePointerEvent.target
        : e.target.getStage()?.container() ?? null;
      pixelSelectionCaptureTargetRef.current = captureTarget;
      try {
        captureTarget?.setPointerCapture(pointerId);
      } catch {
        // Global capture-phase pointerup remains the safety net on browsers without capture.
      }
      schedulePixelDragPreview(drag);
      return;
    }
    if (tool === "draw") {
      if (livingInkFinalizingRef.current) {
        announceDrawingShortcut("수채 번짐 프레임을 저장하는 중입니다 · 잠시 후 다음 획을 그려 주세요");
        return;
      }
      if (hokusaiLiveFinalizingRef.current) {
        announceDrawingShortcut("자연매체 획을 저장하는 중입니다 · 잠시 후 다음 획을 그려 주세요");
        return;
      }
      const pointerSample = e.evt as PointerEvent;
      // Capture the frame-clock anchor alongside pointerdown, before CRDT/render setup can add
      // device-dependent latency. The pump later maps this elapsed time back to the event clock.
      const pointerDownFrameTimeStamp = globalThis.performance?.now?.() ?? pointerSample.timeStamp;
      // 터치 정책: one-finger drag = draw | pan | none. Palm rejection ignores touch while pen preferred.
      const touchPrefs = appSettingsRef.current.touch;
      if (pointerSample.pointerType === "touch") {
        if (touchPrefs.oneFingerDrag !== "draw") return;
        if (touchPrefs.palmRejection && requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()?.pointerType === "pen") return;
      }
      const activePointerSession = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
      if (activePointerSession || drawingRef.current) {
        if (drawingRef.current) {
          if (isStudioStrokePointerEvent(activePointerSession, pointerSample)) return;
          if (shouldCancelStudioFingerStrokeForAdditionalContact(activePointerSession, pointerSample)) {
            // Two fingers mean navigation, not two simultaneous brush tips. Cancel the unfinished
            // finger stroke before the existing wrap-level pinch/undo gesture consumes both touches.
            // A pen plus a touch is deliberately different: the touch is treated as palm input.
            discardDrawingPointerSession();
          }
          return;
        }
        // Dangling transport state should never permanently block a new stroke.
        // If drawingRef is already null, drop the stale stroke session and allow this input to proceed.
        discardDrawingPointerSession();
      }
      if (zoomGestureRef.current) {
        // A wheel/pinch preview owns a temporary CSS transform for up to 170ms. Commit that view
        // synchronously before reading the stroke origin so the transform cannot settle halfway
        // through this contact and change the captured document coordinate system.
        flushSync(() => settleZoomGestureRef.current());
        stageRef.current?.setPointersPositions(pointerSample);
      }
      const pendingBatch = pendingStrokeCommitsRef.current;
      if (
        pendingBatch
        && pendingBatch.pageId !== activePage.id
        && !flushPendingStrokeCommitsRef.current()
      ) {
        setError(
          "이전 페이지의 마지막 획을 확정하지 못해 새 획을 시작하지 않았어요. 잠금·동기화 상태를 확인한 뒤 다시 시도해 주세요."
        );
        return;
      }
      const backdropPendingBatch = pendingStrokeCommitsRef.current;
      const backdropBoundary = planStudioDraftPreviewBackdropBoundary({
        incoming: {
          brush: drawMode === "pen" ? brush : undefined,
          fill:
            drawMode === "lasso-fill"
              ? color
              : drawMode === "shape" && shapeFill && drawShape !== "line"
                ? color
                : undefined,
          kind: drawMode === "shape" ? drawShape : "freehand",
          mode: drawMode === "eraser" ? "eraser" : "pen",
        },
        pending: backdropPendingBatch?.pageId === activePage.id
          ? backdropPendingBatch.strokes
          : [],
        hasRetainedDomBackdrop: backdropPendingBatch !== null && (
          liveInkOverlayRendererRef.current.hasSettledStrokes
          || liveStampOverlayRendererRef.current.hasSettledStrokes
          || liveDynamicBrushOverlayRendererRef.current.hasSettledStrokes
          || liveRetainedMediaOverlayRendererRef.current.hasSettledStrokes
          || liveWetInkOverlayRendererRef.current.hasSettledStrokes
          || pendingGpuStrokesRef.current.length > 0
        ),
        overlayOwnsPendingAndIncoming: Boolean(
          backdropPendingBatch
          && backdropPendingBatch.pageId === activePage.id
          && liveRetainedMediaOverlayRendererRef.current.hasSettledStrokes
          && (drawMode === "eraser" || studioLiveRetainedMediaOverlaySupportsElement({
            id: "incoming-retained-probe", type: "draw",
            kind: drawMode === "shape" ? drawShape : "freehand",
            mode: drawMode === "eraser" ? "eraser" : "pen",
            brush: drawMode === "pen" ? brush : undefined,
            points: [0, 0], stroke: color, strokeWidth: 1, opacity: 1,
          }))
          && backdropPendingBatch.strokes.every((stroke) => (
            studioLiveRetainedMediaOverlaySupportsElement(stroke)
          )),
        ),
      });
      const backdropBoundaryExecution = executeStudioDraftPreviewBackdropBoundary({
        plan: backdropBoundary,
        flushSynchronously: flushSync,
        flushPending: () => flushPendingStrokeCommitsRef.current(),
        restorePointerPosition: () => stageRef.current?.setPointersPositions(pointerSample),
      });
      if (!backdropBoundaryExecution.ready) {
        setError(
          "앞선 획의 합성 순서를 확정하지 못해 새 획을 시작하지 않았어요. 잠금·동기화 상태를 확인한 뒤 다시 시도해 주세요."
        );
        return;
      }
      // A CRDT stroke has its own conflict-free operation stream, so it must not claim the old
      // page-wide lease that prevented two artists from drawing at once. Keep the lease fallback
      // only while the durable document is not connected.
      if (!studioCrdtDocumentRef.current && !beginLiveResourceEdit()) return;
      const pointerSession = beginStudioStrokePointerSession(pointerSample);
      // A second contact cannot replace a live pen stroke. Right-click/barrel-button presses also
      // remain available to the context menu instead of leaving a one-point draft behind.
      if (!pointerSession) {
        endLiveResourceEdit();
        return;
      }
      const pos = stageRef.current?.getRelativePointerPosition()
        ?? e.target.getStage()?.getRelativePointerPosition();
      // Every early exit after a successful begin must release — stranded claimLock is collab-unsafe.
      if (!pos) {
        endLiveResourceEdit();
        return;
      }
      updateBrushCursor(e.target.getStage(), pointerSample);
      // One pointer contact owns one immutable input contract. Toolbar shortcuts can re-render
      // while a pen is still down; those new preferences apply to the next stroke, never halfway
      // through the current filter/pressure/post-correction pipeline.
      const strokeAdvancedRuler = resolveActiveStudioAdvancedRuler(
        drawingAssistDocument.advanced,
        selected?.groupId ?? null
      );
      drawingInputSettingsRef.current = {
        version: 1,
        stabilizer,
        stabilizerMode,
        postCorrection,
        preserveCorners,
        pressureCurve,
        pressureMinSize,
        useVelocityPressure,
        velocitySensitivity,
        coordinateScale: effScale,
        perspectiveActive: !strokeAdvancedRuler && perspectiveRulerActive,
        vanishingPoints: vanishingPoints.map((point: any) => ({ ...point })),
        isometricActive: !strokeAdvancedRuler && isometricGridActive,
        isometricAngleDeg,
        advancedRuler: strokeAdvancedRuler ? structuredClone(strokeAdvancedRuler) : null,
      };
      setSelectedId(null);

      const drawStartPlan = planStudioDrawPointerStart({
        id: uid(),
        position: pos,
        pointer: pointerSample,
        drawMode,
        drawShape,
        shapeFill,
        color,
        strokeWidth,
        brushOpacity,
        brush,
        brushCatalogId: activeCatalogBrush.id, brushCatalogName: activeCatalogBrush.name,
        stampTuning, brushDynamics,
        brushEnginePrograms,
        stabilizer,
        stabilizerMode,
        velocitySensitivity,
        pressureCurve,
        pressureMinSize,
        positionScale: effScale,
        brushTip: { tiltEnabled, angleDeg: tipAngle, roundness: tipRoundness },
        symmetry: {
          type: symmetryType,
          centerX: symmetryCenterX,
          centerY: symmetryCenterY,
          radialCount: symmetryRadialCount,
        },
      });
      const {
        causalInitialSample,
        causalInputPlan,
        pressure,
        stylus,
      } = drawStartPlan;
      let { element: next, strokeOrigin } = drawStartPlan;
      const linked3dCorrection = !isRealtimeTeamSession && drawMode === "pen"
        ? createStudioLinked3dCorrectionProvenance(
            activePage.linked3dRender,
            selected?.id,
          )
        : null;
      if (linked3dCorrection) next = { ...next, linked3dCorrection };
      // Snap explicit shape origins to neighboring object edges when no directional ruler is
      // active. Freehand coordinates must remain untouched so acquiring a guide cannot kink ink.
      {
        const directionalRulerActive = Boolean(
          strokeAdvancedRuler
          || (!strokeAdvancedRuler && perspectiveRulerActive && vanishingPoints.length > 0)
          || (
            !strokeAdvancedRuler
            && shouldSnapStrokeToIsometricAxis({
              active: isometricGridActive,
              mode: next.mode,
              kind: next.kind ?? "freehand",
            })
          )
        );
        if (
          shouldApplyStrokeObjectSnap({
            snapEnabled,
            showAlignmentGuides,
            mode: next.mode,
            kind: next.kind ?? "freehand",
            sampleIndex: 0,
            directionalRulerActive,
          })
        ) {
          const snapped = applyStrokeObjectSnapToPoint(strokeOrigin.x, strokeOrigin.y, {
            mode: next.mode,
            kind: next.kind ?? "freehand",
            sampleIndex: 0,
            directionalRulerActive,
            excludeId: next.id,
          });
          if (snapped.x !== strokeOrigin.x || snapped.y !== strokeOrigin.y) {
            strokeOrigin = { x: snapped.x, y: snapped.y };
            const points = next.points.slice();
            if (points.length >= 2) {
              points[0] = snapped.x;
              points[1] = snapped.y;
            }
            // Shape origin is duplicated as the initial endpoint until the drag moves.
            if ((next.kind ?? "freehand") !== "freehand" && points.length >= 4) {
              points[2] = snapped.x;
              points[3] = snapped.y;
            }
            next = { ...next, points };
          }
        }
      }
      if (drawMode === "pen") scheduleLiveDrawPressure(pressure);
      // Pointer-up is a lifecycle signal, not a new freehand coordinate. Retain pointer-down now
      // so a tap and a stroke with no delivered move still have authoritative release metadata.
      drawingLastAuthoritativePointerRef.current = pointerSample;
      const pointerTransportStart = requireStudioDrawingPointerTransport(drawingPointerTransportRef).start({
        pointerEvent: pointerSample,
        session: pointerSession,
        stage: e.target.getStage(),
      });
      if (!pointerTransportStart.started) {
        drawingLastAuthoritativePointerRef.current = null;
        drawingInkTimeOriginRef.current = null;
        drawingInputSettingsRef.current = null;
        scheduleLiveDrawPressure(null);
        endLiveResourceEdit();
        return;
      }
      drawingImmediateCausalInputRef.current = causalInputPlan.quantizeImmediately;
      drawingThinLineInkInputRef.current = shouldFilterStudioThinLineInkInput({
        brushId: next.brush,
        immediateCausalInput: causalInputPlan.quantizeImmediately,
      })
        ? createStudioThinLineInkInputState({
            x: strokeOrigin.x,
            y: strokeOrigin.y,
            timeStamp: pointerSample.timeStamp,
          })
        : null;
      // Pixel pencil bypasses stabilizers; positive standard strength keeps the exact 5ms cascade.
      drawingFixedRateFilterRef.current = causalInputPlan.usesFixedRateClock
        ? createFixedRateStrokeFilter({
            x: strokeOrigin.x, y: strokeOrigin.y, positionScale: effScale, pressure,
            tiltX: causalInitialSample?.tiltX ?? stylus.tiltX,
            tiltY: causalInitialSample?.tiltY ?? stylus.tiltY,
            timeStamp: pointerSample.timeStamp,
          }, stabilizer).state
        : null;
      drawingStabilizerRef.current =
        drawMode === "shape" || drawMode === "pixel" || causalInputPlan.sampleSpacing === 0
          ? null
          : createStudioStrokeStabilizerState({
              x: strokeOrigin.x,
              y: strokeOrigin.y,
              timeStamp: pointerSample.timeStamp,
            });
      drawingPrecisionStabilizerBridgeRef.current?.reset();
      drawingPrecisionStabilizerBridgeRef.current = null;
      if (
        drawingStabilizerRef.current
        && drawingFixedRateFilterRef.current === null
        && stabilizerMode === "precision"
        && stabilizer > 0
      ) {
        const bridge = createStudioStrokeStabilizerBridge();
        const first = bridge.commit(
          {
            x: strokeOrigin.x,
            y: strokeOrigin.y,
            timeStamp: pointerSample.timeStamp,
            pointerType:
              pointerSample.pointerType === "mouse"
              || pointerSample.pointerType === "pen"
              || pointerSample.pointerType === "touch"
                ? pointerSample.pointerType
                : "unknown",
            pointerId: pointerSample.pointerId,
          },
          {
            strength: stabilizer,
            mode: "precision",
            coordinateScale: effScale,
            useLazyPrecision: true,
            lazyPointerPolicy: "all",
          }
        );
        drawingStabilizerRef.current = first.state;
        drawingPrecisionStabilizerBridgeRef.current = bridge;
      }
      drawingVelocityRef.current =
        drawMode === "shape" || drawMode === "pixel"
          ? null
          : createStudioPointerVelocityState(pointerSample);
      drawingVelocityPressureRef.current = initializeStudioBrushVelocityPressure(
        drawMode, pointerSample, next, drawingInputSettingsRef.current
      );
      drawingInkTimeOriginRef.current = studioInkGestureTimeOrigin(next.inkInput, pointerSample.timeStamp);
      drawingRef.current = next;
      drawingGesturePreviewPublisherRef.current.begin({
        pageId: activePage.id,
        documentGeneration: collaborationAccessRef.current.documentGeneration,
        element: next,
      });
      // The active cursor is outline-only, so it can track the contact without darkening stable
      // pixels or becoming part of the live-ink/commit receipt.
      perspectiveRayRef.current = null; // 새 스트로크마다 원근 락을 다시 잡는다(첫 move에서 재계산).
      isometricAxisRayRef.current = null; // 새 스트로크마다 아이소메트릭 축 락도 다시 잡는다.
      advancedRulerSnapRef.current = null;
      beginStudioDrawLiveSurfaces(next, pointerSample, strokeOrigin);
      drawingCrdtPublisherRef.current.cancel();
      drawingCrdtStrokeActiveRef.current = false;
      const crdtDocument = studioCrdtDocumentRef.current;
      if (crdtDocument) {
        try {
          const crdtStroke = studioDrawElementToCrdtStroke(activePage.id, next);
          drawingCrdtStrokeActiveRef.current = true;
          drawingCrdtPublisherRef.current.begin(next.id, () => {
            if (
              !drawingCrdtStrokeActiveRef.current
              || studioCrdtDocumentRef.current !== crdtDocument
            ) {
              throw new Error("실시간 협업 문서가 획 시작 전에 변경되었습니다.");
            }
            crdtDocument.beginStroke(crdtStroke);
          });
        } catch (cause) {
          drawingCrdtPublisherRef.current.cancel(next.id);
          drawingCrdtPublishErrorRef.current(cause);
        }
      }
      startFixedRateStrokePump(pointerSample, pointerDownFrameTimeStamp);
      if (drawMode === "pen" && quickShapeActive) startQuickShapeTracking(strokeOrigin);
      else stopQuickShapeTracking(); // 방어적 — 이전 스트로크 타이머 잔존 방지
      return;
    }
    // 선택 모드: 빈 영역에서 드래그하면 마퀴(PPT식 박스) 다중선택, 그냥 클릭이면 선택 해제.
    if (e.target === e.target.getStage() || e.target.name() === "bg") {
      setSelectedId(null);
      setMarqueeIds([]);
      // 빈 영역 클릭은 그룹 진입 상태도 함께 빠져나온다(PPT/Figma: 그룹 밖 클릭 = 그룹에서 나가기).
      activeGroupIdRef.current = null;
      setActiveGroupId(null);
      if (!isSpacePressed) {
        const pos = e.target.getStage()?.getRelativePointerPosition();
        if (pos) {
          marqueeStartRef.current = { x: pos.x, y: pos.y };
          clearMarqueePreview();
        }
      }
    }
  }
  // 복구 브러시/도장 호버 커서(브러시 원 + 소스 크로스헤어) — brushCursorRef 와 동일하게
  // ref 를 직접 갱신해 리렌더 없이 따라오게 한다. 드래그 중에도 계속 호출된다.
  function updateHealCloneCursorNodes(destNorm: SelPoint, frame: SelectionFrame) {
    const cursor = healCloneCursorRef.current;
    const srcCursor = healCloneSourceCursorRef.current;
    if (!cursor) return;
    const destCanvas = normalizedPointToCanvas(destNorm, frame);
    cursor.position(destCanvas);
    cursor.radius(healCloneRadius / effScale);
    if (!cursor.visible()) cursor.visible(true);
    if (srcCursor) {
      if (healCloneOffsetRef.current) {
        const srcNorm = healCloneSourcePoint(healCloneOffsetRef.current, destNorm);
        srcCursor.position(normalizedPointToCanvas(srcNorm, frame));
        if (!srcCursor.visible()) srcCursor.visible(true);
      } else {
        srcCursor.visible(false);
      }
    }
    cursor.getLayer()?.batchDraw();
  }
  // 히스토리 브러시 호버 커서(브러시 원) — healCloneCursorRef 와 동일하게 ref 를 직접 갱신해
  // 리렌더 없이 따라오게 한다.
  function updateHistoryBrushCursorNode(destNorm: SelPoint, frame: SelectionFrame) {
    const cursor = historyBrushCursorRef.current;
    if (!cursor) return;
    cursor.position(normalizedPointToCanvas(destNorm, frame));
    cursor.radius(historyBrushRadius / effScale);
    if (!cursor.visible()) cursor.visible(true);
    cursor.getLayer()?.batchDraw();
  }

  function snapPointToAdvancedRuler(
    ruler: StudioAdvancedRuler,
    start: { x: number; y: number },
    target: { x: number; y: number }
  ): { x: number; y: number } | null {
    const snapped = snapStudioAdvancedRulerStrokePoint(
      advancedRulerSnapRef.current,
      ruler,
      start,
      target
    );
    if (!snapped) return null;
    advancedRulerSnapRef.current = snapped.state;
    return snapped.point;
  }

  /** Element bboxes used as object-snap targets while placing strokes/shapes (excludes active draft). */
  function collectStrokeObjectSnapTargets(excludeId?: string | null): GuideBox[] {
    const targets: GuideBox[] = [];
    for (const el of elements) {
      if (excludeId && el.id === excludeId) continue;
      if (isEffectivelyHidden(el, groups)) continue;
      const node = nodeRefsRef.current[el.id];
      if (node && mainLayerRef.current) {
        try {
          const rect = node.getClientRect({ relativeTo: mainLayerRef.current });
          if (Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
            targets.push({
              id: el.id,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            });
            continue;
          }
        } catch {
          // Fall through to document bounds when the node is mid-detach.
        }
      }
      const bounds = elBounds(el);
      targets.push({
        id: el.id,
        x: bounds.x,
        y: bounds.y,
        width: bounds.w,
        height: bounds.h,
      });
    }
    return targets;
  }

  /**
   * One getClientRect walk per stroke contact. Other layers are static while the pointer owns
   * the stroke, so reusing the frozen target list keeps shape-endpoint moves O(1) in element count.
   */
  function strokeObjectSnapTargetsFor(strokeId: string, excludeId?: string | null): readonly GuideBox[] {
    const resolved = resolveStudioStrokeObjectSnapTargets({
      cache: strokeObjectSnapCacheRef.current,
      strokeId,
      collect: () => collectStrokeObjectSnapTargets(excludeId ?? strokeId),
    });
    strokeObjectSnapCacheRef.current = resolved.cache;
    return resolved.targets;
  }

  function applyStrokeObjectSnapToPoint(
    x: number,
    y: number,
    options: {
      mode?: string;
      kind?: string;
      sampleIndex: number;
      directionalRulerActive: boolean;
      excludeId?: string | null;
    }
  ): { x: number; y: number } {
    if (
      !shouldApplyStrokeObjectSnap({
        snapEnabled,
        showAlignmentGuides,
        mode: options.mode,
        kind: options.kind,
        sampleIndex: options.sampleIndex,
        directionalRulerActive: options.directionalRulerActive,
      })
    ) {
      return { x, y };
    }
    const strokeId = options.excludeId ?? drawingRef.current?.id;
    if (!strokeId) return { x, y };
    const others = strokeObjectSnapTargetsFor(strokeId, options.excludeId);
    if (others.length === 0) return { x, y };
    const threshold = SMART_SNAP_THRESHOLD / Math.max(effScale, 1e-6);
    const kind = options.kind ?? "freehand";
    // Freehand uses latch-based edge following so continuous samples do not zigzag between
    // nearby object edges. Shapes/lines use nearest-edge capture for explicit placement.
    const snap = kind === "freehand"
      ? (() => {
          const planned = planFreehandObjectSnapPoint({
            x,
            y,
            others,
            latch: freehandObjectSnapLatchRef.current,
            threshold,
          });
          freehandObjectSnapLatchRef.current = planned.latch;
          return planned;
        })()
      : snapPointToObjectGuides(x, y, others, { threshold });
    if (showAlignmentGuides && (snap.snappedX || snap.snappedY)) {
      applySmartGuides(buildPointObjectSnapOverlay(
        snap.x,
        snap.y,
        others,
        snap,
        { epsilon: SMART_GUIDE_EPSILON / Math.max(effScale, 1e-6) }
      ));
    } else {
      applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
    }
    // Guide-only mode (alignment guides on, snap master off): preview guides without bending ink.
    if (!shouldMutateStrokeWithObjectSnap({ snapEnabled })) {
      return { x, y };
    }
    return { x: snap.x, y: snap.y };
  }

  function updateActiveShapeEndpoint(
    stage: Konva.Stage,
    pointerEvent: PointerEvent,
    schedulePreview: boolean
  ): boolean {
    const current = drawingRef.current;
    const kind = current?.kind ?? "freehand";
    if (
      !current
      || kind === "freehand"
      || !isStudioStrokePointerEvent(requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession(), pointerEvent)
    ) return false;

    // Capture-phase pointerup runs before Konva updates its pointer position. Feed the native event
    // through Konva's public coordinate path so a fast drag commits the actual lift point.
    stage.setPointersPositions(pointerEvent);
    const pos = stage.getRelativePointerPosition();
    if (!pos) return false;
    const x0 = current.points[0] ?? pos.x;
    const y0 = current.points[1] ?? pos.y;
    const livePointerOffset = quickShapeConvertedRef.current
      ? quickShapeLivePointerOffsetRef.current
      : null;
    let x1 = pos.x + (livePointerOffset?.x ?? 0);
    let y1 = pos.y + (livePointerOffset?.y ?? 0);
    const inputSettings = drawingInputSettingsRef.current;
    // Shift is the explicit gesture and therefore wins over perspective/isometric ruler locks.
    let directionalRulerActive = false;
    if (inputSettings?.advancedRuler && kind === "line" && !pointerEvent.shiftKey) {
      const snapped = snapPointToAdvancedRuler(
        inputSettings.advancedRuler,
        { x: x0, y: y0 },
        { x: x1, y: y1 }
      );
      if (snapped) {
        x1 = snapped.x;
        y1 = snapped.y;
        directionalRulerActive = true;
      }
    } else if (perspectiveRulerActive && kind === "line" && !pointerEvent.shiftKey && vanishingPoints.length > 0) {
      if (!perspectiveRayRef.current) {
        perspectiveRayRef.current = resolvePerspectiveRay(vanishingPoints, x0, y0, x1, y1);
      }
      [x1, y1] = snapStrokePointToPerspective(x1, y1, perspectiveRayRef.current);
      directionalRulerActive = perspectiveRayRef.current !== null;
    } else if (
      shouldSnapStrokeToIsometricAxis({
        active: isometricGridActive,
        mode: current.mode,
        kind,
      })
      && !pointerEvent.shiftKey
    ) {
      if (!isometricAxisRayRef.current) {
        isometricAxisRayRef.current = resolveIsometricAxisRay(isometricAngleDeg, x0, y0, x1, y1);
      }
      [x1, y1] = snapStrokePointToIsometricGrid(x1, y1, isometricAxisRayRef.current);
      directionalRulerActive = isometricAxisRayRef.current !== null;
    }
    if (!directionalRulerActive && !pointerEvent.shiftKey) {
      const snapped = applyStrokeObjectSnapToPoint(x1, y1, {
        mode: current.mode,
        kind,
        sampleIndex: 1,
        directionalRulerActive: false,
        excludeId: current.id,
      });
      x1 = snapped.x;
      y1 = snapped.y;
    }
    if (pointerEvent.shiftKey) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      if (kind === "line") {
        if (Math.abs(dx) > Math.abs(dy) * 2) y1 = y0;
        else if (Math.abs(dy) > Math.abs(dx) * 2) x1 = x0;
        else {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          x1 = x0 + Math.sign(dx || 1) * size;
          y1 = y0 + Math.sign(dy || 1) * size;
        }
      } else {
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        x1 = x0 + Math.sign(dx || 1) * size;
        y1 = y0 + Math.sign(dy || 1) * size;
      }
    }
    const next = { ...current, points: [x0, y0, x1, y1] };
    drawingRef.current = next;
    drawingGesturePreviewPublisherRef.current.replaceShape(next);
    if (schedulePreview) scheduleDraft(next);
    return true;
  }

  function onStageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stagePointerEvent = e.evt as PointerEvent;
    const stageActiveDrawing = drawingRef.current;
    const nativeFreehandMoveOwnsStage = Boolean(
      stageActiveDrawing
      && (stageActiveDrawing.kind ?? "freehand") === "freehand"
      && isStudioStrokePointerEvent(
        requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession(),
        stagePointerEvent
      )
    );
    // Figma-style multiplayer cursor publication must run before every tool-specific early return.
    // Throttle before reading Stage coordinates or copying the recent stroke tail.
    if (!isExporting && canvasH > 0) {
      studioLiveRoomRef.current?.publishCursorWhenDue(() => {
        const pointer = e.target.getStage()?.getRelativePointerPosition();
        if (!pointer) return null;
        const activeDrawing = stageActiveDrawing;
        const isDrawing = Boolean(activeDrawing && (activeDrawing.kind ?? "freehand") === "freehand");
        const publishedTool = resolveStudioLivePublishedCursorTool({
          tool,
          drawMode,
          drawingMode: activeDrawing?.mode,
        });
        const isEraserPreview = publishedTool === "eraser";
        const strokeColor = activeDrawing?.stroke ?? color;
        const strokeWidthVal = activeDrawing?.strokeWidth ?? strokeWidth;
        const strokeOpacity = activeDrawing?.opacity ?? 1;
        const pts = activeDrawing?.points;

        return {
          x: Math.max(0, Math.min(1, pointer.x / CANVAS_W)),
          y: Math.max(0, Math.min(1, pointer.y / canvasH)),
          pageId: activePage.id,
          tool: publishedTool,
          drawing: isDrawing,
          strokeColor: isEraserPreview ? undefined : strokeColor,
          strokeWidth: strokeWidthVal,
          strokeOpacity,
          points: isDrawing && pts && pts.length >= 2 ? pts.slice(-64) : undefined,
        };
      });
    }
    // Auto-color freehand scribble stroke — append document points while armed.
    const scribbleStroke = autoColorScribbleStrokeRef.current;
    if (scribbleStroke && autoColorScribbleCanvasArmed) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        if (
          shouldKeepStudioAutoColorStrokeSample({
            lastDocX: scribbleStroke.lastDocX,
            lastDocY: scribbleStroke.lastDocY,
            nextDocX: pos.x,
            nextDocY: pos.y,
            minDistanceDoc: STUDIO_AUTO_COLOR_STROKE_MIN_DISTANCE_DOC_DEFAULT,
          })
        ) {
          scribbleStroke.points.push(pos.x, pos.y);
          scribbleStroke.lastDocX = pos.x;
          scribbleStroke.lastDocY = pos.y;
        }
      }
      return;
    }
    // 색상 휠 롱프레스 타이머가 아직 대기 중인데 임계값(6px) 넘게 움직였으면 드래그/클릭으로
    // 보고 취소한다. colorWheelOpen 이 이미 true 인 동안은 오버레이가 캔버스를 덮어 이 핸들러
    // 자체가 더 안 불리므로 별도 가드가 필요 없다.
    if (colorWheelTimerRef.current && colorWheelPressRef.current) {
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      if (clientPoint) {
        const dx = clientPoint.x - colorWheelPressRef.current.x;
        const dy = clientPoint.y - colorWheelPressRef.current.y;
        if (shouldCancelLongPress(dx, dy)) {
          clearTimeout(colorWheelTimerRef.current);
          colorWheelTimerRef.current = null;
        }
      }
    }
    // Window capture already consumed and previewed this active freehand delivery.
    if (nativeFreehandMoveOwnsStage) return;
    const pendingRasterGesture = pendingPixelSelectionRasterGestureRef.current;
    if (pendingRasterGesture) {
      const pointerId = Number.isFinite(stagePointerEvent.pointerId)
        ? stagePointerEvent.pointerId
        : 1;
      if (pendingRasterGesture.pointerId !== pointerId) return;
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        pendingRasterGesture.current = { x: position.x, y: position.y };
        pendingRasterGesture.shift = stagePointerEvent.shiftKey;
        pendingRasterGesture.alt = stagePointerEvent.altKey;
      }
      return;
    }
    const pendingRetouchGesture = pendingRasterRetouchGestureRef.current;
    if (pendingRetouchGesture) {
      const pointerId = Number.isFinite(stagePointerEvent.pointerId)
        ? stagePointerEvent.pointerId
        : 1;
      if (pendingRetouchGesture.pointerId !== pointerId) return;
      const position = e.target.getStage()?.getRelativePointerPosition();
      if (position) {
        pendingRasterRetouchGestureRef.current =
          appendStudioPendingRasterRetouchGesturePoint(
            pendingRetouchGesture,
            stagePointerEvent,
            position,
          );
      }
      return;
    }
    if (advancedFillTapGestureRef.current) {
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      const pointerEvent = e.evt as PointerEvent;
      const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
      if (clientPoint) {
        const gesture = moveStudioAdvancedFillTap(
          advancedFillTapGestureRef.current,
          pointerId,
          clientPoint,
        );
        advancedFillTapGestureRef.current = gesture;
        const pan = advancedFillTouchPanRef.current;
        if (
          pointerEvent.pointerType === "touch" &&
          pan?.pointerId === pointerId &&
          gesture.blocked &&
          gesture.activePointerIds.length === 1
        ) {
          const wrap = wrapRef.current;
          if (wrap) {
            wrap.scrollLeft -= clientPoint.x - pan.last.x;
            wrap.scrollTop -= clientPoint.y - pan.last.y;
            updateScrollPos();
          }
        }
        if (pan?.pointerId === pointerId) pan.last = clientPoint;
      }
      return;
    }
    // A cancelled scroll/pinch may still emit more pointermove events before the final pointerup.
    // While the bucket remains armed, never let those events fall through to selection/drawing.
    if (advancedFillArmed) return;
    // 크롭 드래그 중이면 rect 를 갱신한다(시작 시점 스냅샷 기준 — 증분 오차 없음, RAF 합침).
    if (cropDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = cropDragRef.current;
        const next = updateCropDrag(session.session, canvasPointToNormalized(pos.x, pos.y, session.frame), {
          ratio: cropAspectRatio(cropAspect),
          frameAspect: session.frame.height > 0 ? session.frame.width / session.frame.height : 1,
        });
        scheduleCropRect(next);
      }
      return;
    }
    // 패널 손그림 컷 드래그 중이면 절단선 미리보기를 갱신한다.
    if (panelSplitDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      const session = panelSplitDragRef.current;
      const frame = elements.find((el) => el.id === session.targetFrameId);
      if (pos && frame && frame.type === "frame") {
        const line: PanelSplitLine = { a: session.start, b: { x: pos.x, y: pos.y } };
        panelSplitLastLineRef.current = line;
        const preview = previewPanelSplit({ frame, line, gutterPx: panelGutter });
        schedulePanelSplitPreview(preview);
      }
      return;
    }
    // 벡터 노드 편집 드래그 중이면 점 위치/굵기 초안을 갱신한다. 매 틱마다 커밋된 el.points/
    // pressures 기준으로 재계산한다(직전 draft 가 아니라) — updateNodeDragMove 의 "시작 스냅샷+델타"
    // 설계와 일치, crop 의 updateCropDrag 와 동일한 무누적오차 패턴.
    if (nodeEditDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const { elId, session } = nodeEditDragRef.current;
        const el = elementById.get(elId);
        if (el && el.type === "draw") {
          if (session.tool === "move") {
            const { x, y } = updateNodeDragMove(session, pos);
            scheduleNodeEditDraft({
              elId,
              points: withPointMoved(el.points, session.pointIndex, x, y),
              pressures: el.pressures ?? [],
            });
          } else if (session.tool === "width") {
            const pressure = updateNodeDragWidth(session, pos, NODE_EDIT_WIDTH_DRAG_RANGE_PX / effScale);
            scheduleNodeEditDraft({
              elId,
              points: el.points,
              pressures: withPressureEdited(el.pressures, Math.floor(el.points.length / 2), session.pointIndex, pressure),
            });
          } else {
            // "smooth" — 세로 드래그는 위치가 아니라 강도(0..1)를 조절한다("굵기"와 동일한 부호
            // 규약: 위로 끌수록 값 증가). 드래그 시작 시점 강도(nodeSmoothStrengthAtDragStartRef)를
            // 기준선으로 매 틱 다시 계산한다 — updateNodeDragWidth 가 session.startPressure 를
            // 기준선으로 삼는 것과 동일한 "무누적오차" 패턴(el.points 도 매 틱 커밋된 원본에서
            // 다시 계산하므로 스무딩이 이전 틱의 결과 위에 누적되지 않는다).
            const strength = updateSmoothStrengthDrag(
              nodeSmoothStrengthAtDragStartRef.current,
              session.startPointerY,
              pos.y,
              NODE_SMOOTH_DRAG_RANGE_PX / effScale
            );
            setNodeSmoothStrength(strength); // 패널 슬라이더도 실시간으로 같은 값을 보여준다.
            scheduleNodeEditDraft({
              elId,
              points: smoothPointsAroundIndex(el.points, session.pointIndex, strength),
              pressures: el.pressures ?? [],
            });
          }
        }
      }
      return;
    }
    // 말풍선 커스텀 모양 점 드래그 중이면 위치 초안을 갱신한다. nodeEdit과 동일하게 "커밋된
    // el.customShapePoints 기준 매 틱 재계산"(직전 draft 아님) — updateNodeDragMove의 시작
    // 스냅샷+델타 설계와 일치, 무누적오차.
    if (bubbleShapeDragRef.current) {
      const pointerEvent = e.evt as PointerEvent;
      const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
      if (bubbleShapeDragRef.current.pointerId !== pointerId) return;
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const { elId, session } = bubbleShapeDragRef.current;
        const el = elementById.get(elId);
        if (el && el.type === "bubble" && hasCustomBubbleShape(el.customShapePoints)) {
          const local = bubbleShapeCanvasPointToLocal(pos.x, pos.y, { x: el.x, y: el.y, rotation: el.rotation });
          const { x, y } = updateNodeDragMove(session, local);
          scheduleBubbleShapeDraft({ elId, points: withPointMoved(el.customShapePoints, session.pointIndex, x, y) });
        }
      }
      return;
    }
    // 픽셀 선택 드래그 중이면 궤적/박스를 갱신한다(시작 시점 프레임 스냅샷 기준 좌표 변환).
    // 올가미는 최소 간격 미만이면 같은 상태를 돌려주므로 그때는 RAF 예약도 건너뛴다.
    // Magma 마퀴 이동: 선택 안 드래그는 아웃라인만 평행 이동(픽셀 변형은 Transform/내용 변형).
    if (pixelDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = pixelDragRef.current;
        const norm = canvasPointToNormalized(pos.x, pos.y, session.frame);
        if (session.marqueeMove) {
          const dx = norm.x - session.marqueeMove.startNorm.x;
          const dy = norm.y - session.marqueeMove.startNorm.y;
          const moved =
            translateSelection(session.marqueeMove.baseSelection, dx, dy)
            ?? session.marqueeMove.baseSelection;
          pixelSelRef.current = moved;
          setPixelSel(moved);
        } else {
          const aspect = session.frame.height / Math.max(1, session.frame.width);
          const next = updateSelectionDrag(
            session.drag,
            norm,
            {
              shift: e.evt.shiftKey,
              alt: e.evt.altKey,
              aspect,
              magneticField: session.magneticField,
            }
          );
          if (next !== session.drag) {
            session.drag = next;
            schedulePixelDragPreview(next);
          }
        }
      }
      return;
    }
    // 다각형 올가미 초안 중 — 마지막 꼭짓점→커서 고무줄 미리보기.
    if (polyLassoSessionRef.current && selected?.type === "image" && pixelTool === "poly-lasso") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const frame: SelectionFrame = {
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
          rotation: selected.rotation,
        };
        setPolyLassoHover(canvasPointToNormalized(pos.x, pos.y, frame));
      }
      return;
    }
    // 문지르기 드래그 — 반경 기반 O(1) 샘플링 + rAF 미리보기(heal/clone과 동일 핫패스).
    if (smudgeDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = smudgeDragRef.current;
        const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
        if (appendStudioRasterRetouchDragPoint(session.points, next, session.radiusNorm)) {
          schedulePaintRetouchStrokePreview(session);
        }
      }
      return;
    }
    // 닷지/번 드래그 — 동일 샘플링/미리보기 핫패스.
    if (dodgeBurnDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = dodgeBurnDragRef.current;
        const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
        if (appendStudioRasterRetouchDragPoint(session.points, next, session.radiusNorm)) {
          schedulePaintRetouchStrokePreview(session);
        }
      }
      return;
    }
    // 혼색 브러시 드래그 — 동일 샘플링/미리보기 핫패스.
    if (wetMixDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = wetMixDragRef.current;
        const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
        if (appendStudioRasterRetouchDragPoint(session.points, next, session.radiusNorm)) {
          schedulePaintRetouchStrokePreview(session);
        }
      }
      return;
    }
    if (liquifyDragRef.current) {
      const pointerEvent = e.evt as PointerEvent;
      if (!isStudioLiquifyPointerOwner(liquifyDragRef.current, pointerEvent)) return;
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = liquifyDragRef.current;
        const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
        const radiusNorm = liquifyRadius / Math.max(1, session.frame.width);
        liquifyDragRef.current = appendStudioLiquifyPointerPoint(
          session,
          pointerEvent,
          next,
          studioLiquifyDragMinDistance(radiusNorm),
        );
        schedulePaintRetouchStrokePreview({
          frame: session.frame,
          radiusNorm,
          points: liquifyDragRef.current.points,
        });
        scheduleLiquifyLivePreview();
      }
      return;
    }
    // 퀵 마스크 브러시 드래그 중이면 좌표를 누적한다(레이어 마스크와 동일한 appendBrushPoint).
    if (quickMaskDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = quickMaskDragRef.current;
        const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
        const radiusNorm = quickMaskRadius / Math.max(1, session.frame.width);
        const nextPoints = appendBrushPoint(session.points, p, radiusNorm);
        if (nextPoints !== session.points) {
          session.points = nextPoints;
          scheduleQuickMaskDragPreview({ points: nextPoints });
        }
      }
      return;
    }
    // 레이어 마스크 브러시 드래그 중이면 좌표를 누적한다(브러시 간격 기반 최소 거리 필터 —
    // heal-clone과 동일한 appendBrushPoint 재사용).
    if (layerMaskDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = layerMaskDragRef.current;
        const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
        const radiusNorm = layerMaskRadius / Math.max(1, session.frame.width);
        const nextPoints = appendBrushPoint(session.points, p, radiusNorm);
        if (nextPoints !== session.points) {
          session.points = nextPoints;
          scheduleLayerMaskDragPreview({ points: nextPoints });
        }
      }
      return;
    }
    // 필터 마스크 브러시 드래그 중이면 좌표를 누적한다(레이어 마스크와 동일한 appendBrushPoint 재사용).
    if (filterMaskDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = filterMaskDragRef.current;
        const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
        const radiusNorm = filterMaskRadius / Math.max(1, session.frame.width);
        const nextPoints = appendBrushPoint(session.points, p, radiusNorm);
        if (nextPoints !== session.points) {
          session.points = nextPoints;
          scheduleFilterMaskDragPreview({ points: nextPoints });
        }
      }
      return;
    }
    // 복구 브러시/도장 드래그 중이면 좌표를 누적한다(브러시 간격 기반 최소 거리 필터).
    if (healCloneDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = healCloneDragRef.current;
        const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
        updateHealCloneCursorNodes(p, session.frame);
        // appendBrushPoint에 마지막 점 하나만 넘겨 동일한 sanitize/간격 규약을 O(1)로 재사용한다.
        // 허용된 점만 mutable session에 push하므로 growing-array spread의 누적 O(n²)를 피한다.
        const last = session.points[session.points.length - 1];
        const tail = appendBrushPoint(last ? [last] : [], p, session.radiusNorm);
        const appended = tail[last ? 1 : 0];
        if (appended) {
          session.points.push(appended);
          scheduleHealCloneDragPreview(session);
        }
      }
      return;
    }
    // 히스토리 브러시 드래그 중이면 좌표를 누적한다(브러시 간격 기반 최소 거리 필터 —
    // appendBrushPoint 재사용, heal-clone과 동일 패턴).
    if (historyBrushDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = historyBrushDragRef.current;
        const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
        updateHistoryBrushCursorNode(p, session.frame);
        const nextPoints = appendBrushPoint(session.points, p, session.radiusNorm);
        if (nextPoints !== session.points) {
          session.points = nextPoints;
          scheduleHistoryBrushDragPreview({ points: nextPoints });
        }
      }
      return;
    }
    // 마퀴 드래그 중이면 선택 박스를 갱신한다.
    if (marqueeStartRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const s = marqueeStartRef.current;
        scheduleMarqueeRect(normalizeMarqueeRect(s.x, s.y, pos.x, pos.y));
      }
      return;
    }
    // 커서 프리뷰: 드로잉/문지르기/복구브러시 세 무장 상태는 disarmAllPixelTools로 서로
    // 상호배제되지만 tool("select"|"draw")은 독립된 축이라(이미지 선택 + 스머지 켬 + tool="draw"가
    // 동시에 성립 가능), 셋 다 조건이 참일 수 있는 경우를 else if 로 묶어 한 프레임에 커서 하나만
    // (그리고 batchDraw 한 번만) 갱신되게 한다 — onStageDown 의 armed 우선순위(smudge/healClone이
    // draw 브러시보다 우선)와 동일 순서.
    if (smudgeArmed || liquifyArmed || dodgeBurnArmed || wetMixArmed) {
      const cursorPos = e.target.getStage()?.getRelativePointerPosition();
      const cursorNode = smudgeCursorRef.current;
      if (cursorPos && cursorNode) {
        cursorNode.position(cursorPos);
        if (!cursorNode.visible()) cursorNode.visible(true);
        cursorNode.getLayer()?.batchDraw();
      }
    } else if (layerMaskPaintArmed || quickMaskArmed) {
      const cursorPos = e.target.getStage()?.getRelativePointerPosition();
      const cursorNode = layerMaskCursorRef.current;
      if (cursorPos && cursorNode) {
        cursorNode.position(cursorPos);
        if (!cursorNode.visible()) cursorNode.visible(true);
        cursorNode.getLayer()?.batchDraw();
      }
    } else if (filterMaskPaintArmed) {
      const cursorPos = e.target.getStage()?.getRelativePointerPosition();
      const cursorNode = filterMaskCursorRef.current;
      if (cursorPos && cursorNode) {
        cursorNode.position(cursorPos);
        if (!cursorNode.visible()) cursorNode.visible(true);
        cursorNode.getLayer()?.batchDraw();
      }
    } else if (healCloneArmed && selected?.type === "image") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const frame: SelectionFrame = {
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
          rotation: selected.rotation,
        };
        updateHealCloneCursorNodes(canvasPointToNormalized(pos.x, pos.y, frame), frame);
      }
    } else if (historyBrushArmed && selected?.type === "image") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const frame: SelectionFrame = {
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
          rotation: selected.rotation,
        };
        updateHistoryBrushCursorNode(canvasPointToNormalized(pos.x, pos.y, frame), frame);
      }
    } else if (tool === "draw" && isStudioBrushCursorMode(drawMode)) {
      const brushPointerEvent = e.evt as PointerEvent;
      updateBrushCursor(e.target.getStage(), brushPointerEvent);
    }
    if (tool !== "draw" || !drawingRef.current) return;
    const pointerEvent = e.evt as PointerEvent;
    if (!isStudioStrokePointerEvent(requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession(), pointerEvent)) return;
    // Mouse: buttons can report 0 mid-drag when release is lost (capture fail / leave window).
    // Pen/touch must not end on buttons alone — drivers often omit a reliable mask mid-stroke.
    if (shouldEndStudioStrokeForReleasedContact(requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession(), pointerEvent)) {
      // Do not stop QuickShape before finish — finishDrawingPointer snapshots hold/lock first.
      if (colorWheelTimerRef.current) {
        clearTimeout(colorWheelTimerRef.current);
        colorWheelTimerRef.current = null;
      }
      // This is a non-contact hover event used only to detect a lost mouse release. Consuming its
      // current coordinates would connect the last ink sample to wherever the mouse re-entered.
      finishDrawingPointer(e.target.getStage(), pointerEvent, { consumeReleaseSample: false });
      return;
    }
    const kind = drawingRef.current.kind ?? "freehand";
    if (drawMode === "pen") {
      // QuickShape 정지-감지용 포인터 위치 — freehand 누적 경로와 도형-드래그 경로 둘 다에서
      // 실행돼야 하므로 kind 분기 이전에 넣는다(각 분기가 이후 자체적으로 위치를 다시 얻는 것과
      // 별개 — getRelativePointerPosition 은 가벼운 조회라 중복 호출 비용은 무시할 만하다).
      const qsPos = e.target.getStage()?.getRelativePointerPosition();
      if (qsPos) noteQuickShapePointerMoved(qsPos);
    }
    if (kind === "freehand") {
      // Active freehand ink is consumed once by the native capture listener. This Stage event is
      // the processed duplicate and remains responsible only for cursor/presence/QuickShape UI.
      return;
    }
    const stage = e.target.getStage();
    if (stage) updateActiveShapeEndpoint(stage, pointerEvent, true);
  }
  function appendFixedRateStrokeSamples(
    samples: readonly FixedRateStrokeFilteredSample[],
    pointerSample: PointerEvent,
    speed: number
  ) {
    const current = drawingRef.current;
    if (!current || samples.length === 0) return;
    const capturePointerDynamics = current.mode === "pen"
      && resolveStudioCapturedBrushDynamicsPresetId(current) !== null;
    const captureInkSensorChannels =
      current.mode === "pen" && current.inkInput !== undefined;
    const captureExtendedInkSensorChannels =
      current.mode === "pen" && isStudioInkInputContractV2(current.inkInput);
    const captureStylus = current.mode === "pen"
      && (
        current.brush === "calligraphy"
        || capturePointerDynamics
        || captureInkSensorChannels
      );
    const captureMotionChannels =
      capturePointerDynamics || captureInkSensorChannels;
    const stylus = captureStylus ? normalizeCalligraphyStylusInput(pointerSample) : null;
    const tangentialPressure = Number.isFinite(pointerSample.tangentialPressure)
      ? Math.min(1, Math.max(-1, pointerSample.tangentialPressure))
      : 0;
    const mutateDirectly = (
      (liveDraftDirectRef.current && liveInkOverlayRendererRef.current.isActive)
      || (liveStampDraftDirectRef.current && liveStampOverlayRendererRef.current.isActive)
      || (
        liveDynamicBrushDraftDirectRef.current
        && liveDynamicBrushOverlayRendererRef.current.isActive
      )
      || (
        liveRetainedMediaDraftDirectRef.current
        && liveRetainedMediaOverlayRendererRef.current.isActive
      )
      || (
        liveWetInkDraftDirectRef.current
        && liveWetInkOverlayRendererRef.current.isActive
      )
    )
      && !gpuLiveInkPinnedRef.current
      && (
        !drawingPredictionPreviewRef.current
        || drawingPredictionBatchMutationRef.current
      );
    // current.points가 지난 호출에서 우리가 만든 배열이면 같은 스트로크 동안 그대로 이어붙인다.
    // WebGPU journal은 매 프레임 동결된 새 접미사만 보관하고 이 원본 배열을 노출하지 않으므로,
    // GPU 파인 중에도 전체 prefix 복제 없이 O(새 샘플 수)로 진행할 수 있다. 바깥 DrawEl(next)은
    // 매 호출 새 객체라 scheduleDraft의 참조 기반 변경 감지는 그대로 유지된다.
    const ownsCurrentArrays = !mutateDirectly
      && current.points === drawingFixedRateOwnedPointsRef.current;
    const reuseOrClone = <T,>(shouldTrack: boolean, arr: T[] | undefined): T[] | undefined => {
      if (!shouldTrack || !arr) return arr;
      return ownsCurrentArrays ? arr : [...arr];
    };
    const next: DrawEl = mutateDirectly
      ? current
      : {
          ...current,
          points: ownsCurrentArrays ? current.points : [...current.points],
          pressures: reuseOrClone(true, current.pressures),
          tiltXs: reuseOrClone(captureStylus, current.tiltXs),
          tiltYs: reuseOrClone(captureStylus, current.tiltYs),
          twists: reuseOrClone(captureStylus, current.twists),
          speeds: reuseOrClone(captureMotionChannels, current.speeds),
          tangentialPressures: reuseOrClone(
            captureMotionChannels,
            current.tangentialPressures,
          ),
          altitudeAngles: reuseOrClone(
            captureExtendedInkSensorChannels,
            current.altitudeAngles,
          ),
          azimuthAngles: reuseOrClone(
            captureExtendedInkSensorChannels,
            current.azimuthAngles,
          ),
          contactWidths: reuseOrClone(
            captureExtendedInkSensorChannels,
            current.contactWidths,
          ),
          contactHeights: reuseOrClone(
            captureExtendedInkSensorChannels,
            current.contactHeights,
          ),
          sampleTimeOffsets: reuseOrClone(
            captureExtendedInkSensorChannels,
            current.sampleTimeOffsets,
          ),
        };
    if (!mutateDirectly) {
      drawingFixedRateOwnedPointsRef.current = next.points;
    }
    let appended = false;
    const appendAligned = (
      values: number[] | undefined,
      count: number,
      value: number,
      fallback: number
    ): number[] => {
      const aligned = values ?? [];
      while (aligned.length < count) aligned.push(fallback);
      if (aligned.length > count) aligned.length = count;
      aligned.push(value);
      return aligned;
    };
    for (const sample of samples) {
      const lastX = next.points[next.points.length - 2] ?? sample.x;
      const lastY = next.points[next.points.length - 1] ?? sample.y;
      const pointCount = Math.floor(next.points.length / 2);
      const lastPressure = next.pressures?.[pointCount - 1]
        ?? studioInkFallbackPressure(next.pressureModel);
      const minimumDistance = next.sampleSpacing ?? strokeSampleDistanceForScale(effScale);
      if (!shouldAppendStudioCausalInkSample({
        lastX,
        lastY,
        lastPressure,
        nextX: sample.x,
        nextY: sample.y,
        nextPressure: sample.pressure,
        minDistance: minimumDistance,
        pressureModel: next.pressureModel,
      })) continue;
      next.points.push(sample.x, sample.y);
      next.pressures = appendAligned(
        next.pressures,
        pointCount,
        sample.pressure,
        studioInkFallbackPressure(next.pressureModel)
      );
      if (captureStylus && stylus) {
        next.tiltXs = appendAligned(next.tiltXs, pointCount, sample.tiltX, 0);
        next.tiltYs = appendAligned(next.tiltYs, pointCount, sample.tiltY, 0);
        next.twists = appendAligned(next.twists, pointCount, stylus.twist, 0);
      }
      if (captureMotionChannels) {
        next.speeds = appendAligned(next.speeds, pointCount, speed, 0);
        next.tangentialPressures = appendAligned(
          next.tangentialPressures,
          pointCount,
          tangentialPressure,
          0
        );
      }
      if (captureExtendedInkSensorChannels) {
        const persistedPointerChannels = normalizeStudioPersistedPointerChannels(
          pointerSample,
          {
            timeOriginMilliseconds:
              drawingInkTimeOriginRef.current ?? pointerSample.timeStamp,
            previousTimeOffsetMilliseconds: next.sampleTimeOffsets?.at(-1) ?? 0,
            sourceTimeMilliseconds: sample.sourceTimeStamp,
          },
        );
        next.altitudeAngles = appendAligned(
          next.altitudeAngles,
          pointCount,
          persistedPointerChannels.altitudeAngle,
          Math.PI / 2,
        );
        next.azimuthAngles = appendAligned(
          next.azimuthAngles,
          pointCount,
          persistedPointerChannels.azimuthAngle,
          0,
        );
        next.contactWidths = appendAligned(
          next.contactWidths,
          pointCount,
          persistedPointerChannels.contactWidth,
          1,
        );
        next.contactHeights = appendAligned(
          next.contactHeights,
          pointCount,
          persistedPointerChannels.contactHeight,
          1,
        );
        next.sampleTimeOffsets = appendAligned(
          next.sampleTimeOffsets,
          pointCount,
          persistedPointerChannels.timeOffsetMilliseconds,
          0,
        );
      }
      appended = true;
    }
    if (!appended) return;
    drawingRef.current = next;
    if (!drawingPredictionPreviewRef.current) scheduleDraft(next);
  }
  // 자유선 스트로크에 점 하나를 추가한다(압력 계산 + 원근 스냅 + 손떨림 보정 + 최소간격 필터) —
  // native capture pointermove 배치의 coalesced event마다 이 함수를 반복 호출해 여러 점을
  // 한 번에 누적한다(단일 pointermove 당 한 번 호출해도 기존과 동일하게 동작).
  function appendFreehandStrokePoint(
    pos: { x: number; y: number },
    pointerSample: PointerEvent,
    pressureOverride?: number,
    canonicalTimeStamp?: number
  ) {
    const current = drawingRef.current;
    if (!current) return;
    const inputSettings = drawingInputSettingsRef.current;
    const rawLastX = current.points[current.points.length - 2] ?? pos.x;
    const rawLastY = current.points[current.points.length - 1] ?? pos.y;
    const sampleTimeStamp = typeof canonicalTimeStamp === "number" && Number.isFinite(canonicalTimeStamp)
      ? canonicalTimeStamp
      : pointerSample.timeStamp;
    const timingSample = {
      clientX: pointerSample.clientX,
      clientY: pointerSample.clientY,
      timeStamp: sampleTimeStamp,
    };
    const previousVelocity = drawingVelocityRef.current ?? createStudioPointerVelocityState(timingSample);
    const velocitySample = sampleStudioPointerVelocity(previousVelocity, timingSample);
    drawingVelocityRef.current = velocitySample.state;
    const velocityPressure = advanceStudioBrushVelocityPressure(
      drawingVelocityPressureRef.current,
      {
        x: pointerSample.clientX,
        y: pointerSample.clientY,
        timeMs: sampleTimeStamp,
        pointerType: pointerSample.pointerType,
        pressure: pointerSample.pressure,
      },
      {
        brushId: current.brush,
        pressureCurve: inputSettings?.pressureCurve ?? pressureCurve,
        pressureMinSize: inputSettings?.pressureMinSize ?? pressureMinSize,
        useVelocityPressure: inputSettings?.useVelocityPressure ?? useVelocityPressure,
        velocitySensitivity:
          inputSettings?.velocitySensitivity ?? velocitySensitivity,
        fallbackPressure: studioInkFallbackPressure(current.pressureModel),
      }
    );
    drawingVelocityPressureRef.current = velocityPressure.state;
    let pressure = typeof pressureOverride === "number" && Number.isFinite(pressureOverride)
      ? Math.min(1, Math.max(0, pressureOverride))
      : velocityPressure.pressure;
    let targetX = pos.x;
    let targetY = pos.y;
    if (
      drawingThinLineInkInputRef.current
      && shouldFilterStudioThinLineInkInput({
        brushId: current.brush,
        immediateCausalInput: drawingImmediateCausalInputRef.current,
      })
    ) {
      const filtered = filterStudioThinLineInkInput(
        drawingThinLineInkInputRef.current,
        { x: targetX, y: targetY, timeStamp: sampleTimeStamp },
        inputSettings?.coordinateScale ?? effScale,
      );
      if (!drawingPredictionPreviewRef.current) {
        drawingThinLineInkInputRef.current = filtered.state;
      }
      targetX = filtered.x;
      targetY = filtered.y;
    }
    if (
      drawingImmediateCausalInputRef.current
      || drawingFixedRateFilterRef.current !== null
    ) {
      const stylus = normalizeCalligraphyStylusInput(pointerSample);
      const quantized = quantizeFixedRateStrokeSample({
        x: targetX,
        y: targetY,
        positionScale: inputSettings?.coordinateScale ?? effScale,
        pressure,
        tiltX: stylus.tiltX,
        tiltY: stylus.tiltY,
        timeStamp: sampleTimeStamp,
      });
      targetX = quantized.x;
      targetY = quantized.y;
      pressure = quantized.pressure;
    }
    if (!drawingPredictionPreviewRef.current) scheduleLiveDrawPressure(pressure);

    // Commercial freehand + Shift: force a clean straight line from stroke origin (0/45/90°).
    // Applied before perspective/isometric so the artist's explicit Shift intent wins.
    if (pointerSample.shiftKey && current.mode !== "eraser" && current.points.length >= 2) {
      const transition = resolveShiftFreehandTransition({
        currentPoints: current.points,
        currentPressures: current.pressures,
        endX: targetX,
        endY: targetY,
        pressure,
      });
      const shiftPersistsExtendedChannels = isStudioInkInputContractV2(
        current.inkInput,
      );
      const shiftPointerChannels = normalizeStudioPersistedPointerChannels(
        pointerSample,
        {
          timeOriginMilliseconds:
            drawingInkTimeOriginRef.current ?? pointerSample.timeStamp,
          previousTimeOffsetMilliseconds: current.sampleTimeOffsets?.[0] ?? 0,
          sourceTimeMilliseconds: pointerSample.timeStamp,
        },
      );
      const shiftStylus = shiftPersistsExtendedChannels
        ? normalizeCalligraphyStylusInput(pointerSample)
        : null;
      const shiftTangentialPressure =
        Number.isFinite(pointerSample.tangentialPressure)
          ? Math.min(1, Math.max(-1, pointerSample.tangentialPressure))
          : 0;
      const nextShift: DrawEl = {
        ...current,
        points: transition.points,
        pressures: transition.pressures,
        // A v2 retained-input stroke remains exactly aligned even while Shift replaces its whole
        // path with a two-point segment. Legacy contracts keep their historical omitted arrays.
        tiltXs: shiftStylus
          ? [current.tiltXs?.[0] ?? 0, shiftStylus.tiltX]
          : undefined,
        tiltYs: shiftStylus
          ? [current.tiltYs?.[0] ?? 0, shiftStylus.tiltY]
          : undefined,
        twists: shiftStylus
          ? [current.twists?.[0] ?? 0, shiftStylus.twist]
          : undefined,
        speeds: shiftPersistsExtendedChannels
          ? [current.speeds?.[0] ?? 0, velocitySample.speed]
          : undefined,
        tangentialPressures: shiftPersistsExtendedChannels
          ? [
              current.tangentialPressures?.[0] ?? 0,
              shiftTangentialPressure,
            ]
          : undefined,
        altitudeAngles: shiftPersistsExtendedChannels
          ? [
              current.altitudeAngles?.[0] ?? Math.PI / 2,
              shiftPointerChannels.altitudeAngle,
            ]
          : undefined,
        azimuthAngles: shiftPersistsExtendedChannels
          ? [
              current.azimuthAngles?.[0] ?? 0,
              shiftPointerChannels.azimuthAngle,
            ]
          : undefined,
        contactWidths: shiftPersistsExtendedChannels
          ? [
              current.contactWidths?.[0] ?? 1,
              shiftPointerChannels.contactWidth,
            ]
          : undefined,
        contactHeights: shiftPersistsExtendedChannels
          ? [
              current.contactHeights?.[0] ?? 1,
              shiftPointerChannels.contactHeight,
            ]
          : undefined,
        sampleTimeOffsets: shiftPersistsExtendedChannels
          ? [
              current.sampleTimeOffsets?.[0] ?? 0,
              shiftPointerChannels.timeOffsetMilliseconds,
            ]
          : undefined,
      };
      // Shift replaces the endpoint instead of appending samples. Retained Canvas/WebGPU surfaces
      // cannot erase the previous preview safely, so hand this gesture to the replaceable draft
      // layer before publishing its first constrained line.
      if (
        (liveDraftDirectRef.current || liveStampDraftDirectRef.current)
        && !drawingPredictionPreviewRef.current
      ) exitDirectLiveDraft();
      // The Shift gesture replaces the whole freehand suffix. A pre-constraint stabilizer still
      // points at the old raw sample and would be flushed after the snapped endpoint on pointer-up,
      // making the stroke run backwards. Recreate it lazily only if a later unconstrained move
      // resumes the freehand gesture.
      drawingStabilizerRef.current = transition.stabilizerState;
      drawingThinLineInkInputRef.current = null;
      drawingPrecisionStabilizerBridgeRef.current?.reset();
      drawingPrecisionStabilizerBridgeRef.current = null;
      // A replace-in-place Shift gesture cannot retain the old fixed-clock history. If the artist
      // releases Shift within the same contact, continue on the causal immediate path instead of
      // silently switching to the unrelated legacy stabilizer engine.
      if (drawingFixedRateFilterRef.current) drawingImmediateCausalInputRef.current = true;
      drawingFixedRateFilterRef.current = null;
      stopFixedRateStrokePump();
      drawingRef.current = nextShift;
      if (!drawingPredictionPreviewRef.current) scheduleDraft(nextShift);
      return;
    }
    const strokeVanishingPoints = inputSettings?.vanishingPoints ?? vanishingPoints;
    const strokeAdvancedRuler = inputSettings?.advancedRuler;
    if (strokeAdvancedRuler && current.mode !== "eraser") {
      const snapped = snapPointToAdvancedRuler(
        strokeAdvancedRuler,
        {
          x: current.points[0] ?? pos.x,
          y: current.points[1] ?? pos.y,
        },
        { x: targetX, y: targetY }
      );
      if (snapped) {
        targetX = snapped.x;
        targetY = snapped.y;
      }
    } else if (
      (inputSettings?.perspectiveActive ?? perspectiveRulerActive)
      && current.mode !== "eraser"
      && strokeVanishingPoints.length > 0
    ) {
      // 스트로크 시작점 기준으로 소실점 하나를 골라(가장 가까운 방향) 락을 걸고, 이후 포인트를
      // 그 직선 위로 투영한다. 락은 onStageDown/onStageUp에서 스트로크 경계마다 초기화된다.
      if (!perspectiveRayRef.current) {
        const startX = current.points[0] ?? pos.x;
        const startY = current.points[1] ?? pos.y;
        perspectiveRayRef.current = resolvePerspectiveRay(strokeVanishingPoints, startX, startY, pos.x, pos.y);
      }
      [targetX, targetY] = snapStrokePointToPerspective(targetX, targetY, perspectiveRayRef.current);
    } else if (
      shouldSnapStrokeToIsometricAxis({
        active: inputSettings?.isometricActive ?? isometricGridActive,
        mode: current.mode,
        kind: current.kind ?? "freehand",
      })
    ) {
      if (!isometricAxisRayRef.current) {
        const startX = current.points[0] ?? pos.x;
        const startY = current.points[1] ?? pos.y;
        isometricAxisRayRef.current = resolveIsometricAxisRay(
          inputSettings?.isometricAngleDeg ?? isometricAngleDeg,
          startX,
          startY,
          pos.x,
          pos.y
        );
      }
      [targetX, targetY] = snapStrokePointToIsometricGrid(targetX, targetY, isometricAxisRayRef.current);
    } else if (current.mode !== "eraser" && !pointerSample.shiftKey) {
      // Freehand uses latch-based object-edge following when snap and/or alignment guides are on.
      // Guide-only mode paints overlays without rewriting ink coordinates.
      const sampleIndex = Math.max(0, Math.floor(current.points.length / 2));
      const snapped = applyStrokeObjectSnapToPoint(targetX, targetY, {
        mode: current.mode,
        kind: current.kind ?? "freehand",
        sampleIndex,
        directionalRulerActive: false,
        excludeId: current.id,
      });
      targetX = snapped.x;
      targetY = snapped.y;
    }
    const fixedRateState = drawingFixedRateFilterRef.current;
    if (fixedRateState) {
      const stylus = normalizeCalligraphyStylusInput(pointerSample);
      const transition = transitionFixedRateStrokeFilter(fixedRateState, {
        type: "append",
        samples: [{
          x: targetX,
          y: targetY,
          positionScale: inputSettings?.coordinateScale ?? effScale,
          pressure,
          tiltX: stylus.tiltX,
          tiltY: stylus.tiltY,
          timeStamp: sampleTimeStamp,
        }],
      });
      drawingFixedRateFilterRef.current = transition.state;
      appendFixedRateStrokeSamples(transition.emitted, pointerSample, velocitySample.speed);
      return;
    }
    // Pixel pencil is a raw grid tool: stabilizer strength must never bend or trail its cells.
    // `null` at pointerdown means intentionally disabled for pixel, not "lazy-create on move".
    if (drawMode !== "pixel" && !drawingImmediateCausalInputRef.current) {
      const strokeStabilizerStrength = inputSettings?.stabilizer ?? stabilizer;
      const strokeStabilizerMode = inputSettings?.stabilizerMode ?? stabilizerMode;
      const strokeCoordinateScale = inputSettings?.coordinateScale ?? effScale;
      const liveStabilizerState = drawingStabilizerRef.current
        ?? createStudioStrokeStabilizerState({
          x: rawLastX,
          y: rawLastY,
          timeStamp: sampleTimeStamp,
        });
      let stabilized: ReturnType<typeof stabilizeStudioStrokeSample>;
      if (strokeStabilizerMode === "precision" && strokeStabilizerStrength > 0) {
        const precisionBridgeOptions = {
          strength: strokeStabilizerStrength,
          mode: "precision" as const,
          coordinateScale: strokeCoordinateScale,
          useLazyPrecision: true,
          lazyPointerPolicy: "all" as const,
        };
        const precisionPointerType =
          pointerSample.pointerType === "mouse"
          || pointerSample.pointerType === "pen"
          || pointerSample.pointerType === "touch"
            ? pointerSample.pointerType
            : "unknown";
        let precisionBridge = drawingPrecisionStabilizerBridgeRef.current;
        if (!precisionBridge && !drawingPredictionPreviewRef.current) {
          // Shift replacement deliberately resets the provider. If freehand resumes within the
          // same contact, re-anchor once at the retained endpoint before committing actual input.
          precisionBridge = createStudioStrokeStabilizerBridge();
          const first = precisionBridge.commit(
            {
              x: rawLastX,
              y: rawLastY,
              timeStamp: liveStabilizerState.timeStamp,
              pointerType: precisionPointerType,
              pointerId: pointerSample.pointerId,
            },
            precisionBridgeOptions
          );
          drawingStabilizerRef.current = first.state;
          drawingPrecisionStabilizerBridgeRef.current = precisionBridge;
        }
        stabilized = precisionBridge
          ? drawingPredictionPreviewRef.current
            ? precisionBridge.preview(
                {
                  x: targetX,
                  y: targetY,
                  timeStamp: sampleTimeStamp,
                  pointerType: precisionPointerType,
                  pointerId: pointerSample.pointerId,
                },
                precisionBridgeOptions
              )
            : precisionBridge.commit(
                {
                  x: targetX,
                  y: targetY,
                  timeStamp: sampleTimeStamp,
                  pointerType: precisionPointerType,
                  pointerId: pointerSample.pointerId,
                },
                precisionBridgeOptions
              )
          : stabilizeStudioStrokeSample(
              liveStabilizerState,
              { x: targetX, y: targetY, timeStamp: sampleTimeStamp },
              {
                strength: strokeStabilizerStrength,
                mode: strokeStabilizerMode,
                coordinateScale: strokeCoordinateScale,
              }
            );
      } else {
        stabilized = stabilizeStudioStrokeSample(
          liveStabilizerState,
          { x: targetX, y: targetY, timeStamp: sampleTimeStamp },
          {
            strength: strokeStabilizerStrength,
            mode: strokeStabilizerMode,
            coordinateScale: strokeCoordinateScale,
          }
        );
      }
      if (!drawingPredictionPreviewRef.current) {
        drawingStabilizerRef.current = stabilized.state;
      }
      [targetX, targetY] = stabilized.point;
    }

    const lastX = current.points[current.points.length - 2] ?? targetX;
    const lastY = current.points[current.points.length - 1] ?? targetY;
    const lastPressure = current.pressures?.at(-1)
      ?? studioInkFallbackPressure(current.pressureModel);
    // Repeated browser samples that collapse to the same 1/32 coordinate and 10-bit pressure add
    // no information. A pressure-only change is retained so the incremental dab walker can update
    // interpolation state without repainting the stationary prefix.
    const shouldAppend = isStudioPixelPencilRenderMode(current.brush)
      ? shouldAppendStudioPixelPencilSample({
          lastX,
          lastY,
          nextX: targetX,
          nextY: targetY,
        })
      : shouldAppendStudioCausalInkSample({
          lastX,
          lastY,
          lastPressure,
          nextX: targetX,
          nextY: targetY,
          nextPressure: pressure,
          minDistance: current.sampleSpacing
            ?? strokeSampleDistanceForScale(inputSettings?.coordinateScale ?? effScale),
          pressureModel: current.pressureModel,
        });
    if (!shouldAppend) return;
    const capturePointerDynamics = current.mode === "pen"
      && resolveStudioCapturedBrushDynamicsPresetId(current) !== null;
    const captureInkSensorChannels =
      current.mode === "pen" && current.inkInput !== undefined;
    const captureExtendedInkSensorChannels =
      current.mode === "pen" && isStudioInkInputContractV2(current.inkInput);
    const captureStylus = current.mode === "pen" && (
      current.brush === "calligraphy"
      || capturePointerDynamics
      || captureInkSensorChannels
    );
    const captureMotionChannels =
      capturePointerDynamics || captureInkSensorChannels;
    const previousPointCount = Math.floor(current.points.length / 2);
    const stylus = captureStylus ? normalizeCalligraphyStylusInput(pointerSample) : null;
    const tangentialPressure = Number.isFinite(pointerSample.tangentialPressure)
      ? Math.min(1, Math.max(-1, pointerSample.tangentialPressure))
      : 0;
    const persistedPointerChannels = normalizeStudioPersistedPointerChannels(
      pointerSample,
      {
        timeOriginMilliseconds:
          drawingInkTimeOriginRef.current ?? pointerSample.timeStamp,
        previousTimeOffsetMilliseconds: current.sampleTimeOffsets?.at(-1) ?? 0,
        sourceTimeMilliseconds: pointerSample.timeStamp,
      },
    );
    const appendStylusValue = (values: number[] | undefined, value: number): number[] => {
      const aligned = Array.from(
        { length: previousPointCount },
        (_, index) => values?.[index] ?? 0
      );
      return [...aligned, value];
    };
    const appendMutableStylusValue = (
      values: number[] | undefined,
      value: number
    ): number[] => {
      const aligned = values ?? [];
      if (aligned.length > previousPointCount) aligned.length = previousPointCount;
      while (aligned.length < previousPointCount) aligned.push(0);
      aligned.push(value);
      return aligned;
    };
    // Canvas2D authoritative overlay와 compact GPU journal은 ref 전용 draft를 소비한다. GPU도
    // 동결한 접미사만 큐에 넘기므로 원본 배열 참조는 외부에 게시되지 않는다. 두 경로 모두 새
    // 샘플을 제자리 추가해 긴 획의 매 포인트 전체 points/pressure 복사(O(N²))를 없앤다.
    const canAppendDirectly = (
      (
        (
          (liveDraftDirectRef.current && liveInkOverlayRendererRef.current.isActive)
          || (liveDraftDirectRef.current && isStudioPixelPencilRenderMode(current.brush))
          || (liveStampDraftDirectRef.current && liveStampOverlayRendererRef.current.isActive)
          || (
            liveDynamicBrushDraftDirectRef.current
            && liveDynamicBrushOverlayRendererRef.current.isActive
          )
          || (
            liveRetainedMediaDraftDirectRef.current
            && liveRetainedMediaOverlayRendererRef.current.isActive
          )
          || (
            liveWetInkDraftDirectRef.current
            && liveWetInkOverlayRendererRef.current.isActive
          )
          || (
            liveDraftDirectRef.current
            && gpuLiveInkPinnedRef.current
            && gpuLiveSourceJournalRef.current !== null
          )
        )
      )
      // These batches already cloned one private draft before their loop. Reusing that owned
      // array turns N coalesced hardware samples into one prefix copy for non-journal paths.
      || drawingImmediateBatchMutationRef.current
      || drawingPredictionBatchMutationRef.current
    )
      && (
        !drawingPredictionPreviewRef.current
        || drawingPredictionBatchMutationRef.current
      );
    if (canAppendDirectly) {
      current.points.push(targetX, targetY);
      if (!current.pressures) {
        current.pressures = Array.from(
          { length: previousPointCount },
          () => studioInkFallbackPressure(current.pressureModel)
        );
      }
      current.pressures.push(pressure);
      if (stylus) {
        current.tiltXs = appendMutableStylusValue(current.tiltXs, stylus.tiltX);
        current.tiltYs = appendMutableStylusValue(current.tiltYs, stylus.tiltY);
        current.twists = appendMutableStylusValue(current.twists, stylus.twist);
      }
      if (captureMotionChannels) {
        current.speeds = appendMutableStylusValue(current.speeds, velocitySample.speed);
        current.tangentialPressures = appendMutableStylusValue(
          current.tangentialPressures,
          tangentialPressure
        );
      }
      if (captureExtendedInkSensorChannels) {
        current.altitudeAngles = appendMutableStylusValue(
          current.altitudeAngles,
          persistedPointerChannels.altitudeAngle,
        );
        current.azimuthAngles = appendMutableStylusValue(
          current.azimuthAngles,
          persistedPointerChannels.azimuthAngle,
        );
        current.contactWidths = appendMutableStylusValue(
          current.contactWidths,
          persistedPointerChannels.contactWidth,
        );
        current.contactHeights = appendMutableStylusValue(
          current.contactHeights,
          persistedPointerChannels.contactHeight,
        );
        current.sampleTimeOffsets = appendMutableStylusValue(
          current.sampleTimeOffsets,
          persistedPointerChannels.timeOffsetMilliseconds,
        );
      }
      drawingRef.current = current;
      // A predicted batch owns this private mutable clone only for the replaceable prediction
      // surface below. Publishing it through scheduleDraft would leave liveDraftPendingRef/rAF
      // pointing at future samples and append those estimates to the authoritative live overlay.
      if (
        !drawingImmediateBatchMutationRef.current
        && !drawingPredictionPreviewRef.current
      ) scheduleDraft(current);
      return;
    }
    const next: DrawEl = {
      ...current,
      points: [...current.points, targetX, targetY],
      pressures: current.pressures ? [...current.pressures, pressure] : [pressure],
      tiltXs: stylus ? appendStylusValue(current.tiltXs, stylus.tiltX) : current.tiltXs,
      tiltYs: stylus ? appendStylusValue(current.tiltYs, stylus.tiltY) : current.tiltYs,
      twists: stylus ? appendStylusValue(current.twists, stylus.twist) : current.twists,
      speeds: captureMotionChannels
        ? appendStylusValue(current.speeds, velocitySample.speed)
        : current.speeds,
      tangentialPressures: captureMotionChannels
        ? appendStylusValue(current.tangentialPressures, tangentialPressure)
        : current.tangentialPressures,
      altitudeAngles: captureExtendedInkSensorChannels
        ? appendStylusValue(
            current.altitudeAngles,
            persistedPointerChannels.altitudeAngle,
          )
        : current.altitudeAngles,
      azimuthAngles: captureExtendedInkSensorChannels
        ? appendStylusValue(
            current.azimuthAngles,
            persistedPointerChannels.azimuthAngle,
          )
        : current.azimuthAngles,
      contactWidths: captureExtendedInkSensorChannels
        ? appendStylusValue(
            current.contactWidths,
            persistedPointerChannels.contactWidth,
          )
        : current.contactWidths,
      contactHeights: captureExtendedInkSensorChannels
        ? appendStylusValue(
            current.contactHeights,
            persistedPointerChannels.contactHeight,
          )
        : current.contactHeights,
      sampleTimeOffsets: captureExtendedInkSensorChannels
        ? appendStylusValue(
            current.sampleTimeOffsets,
            persistedPointerChannels.timeOffsetMilliseconds,
          )
        : current.sampleTimeOffsets,
    };
    drawingRef.current = next;
    if (!drawingPredictionPreviewRef.current) scheduleDraft(next);
  }
  function appendDrawingCrdtSampleSuffix(drawing: DrawEl, startSample: number): void {
    const crdtDocument = studioCrdtDocumentRef.current;
    if (!crdtDocument || !drawingCrdtStrokeActiveRef.current) return;
    drawingCrdtPublisherRef.current.append(drawing.id, {
      snapshot: drawing,
      startSample,
      publish: (latestDrawing: any, earliestSample: any) => {
        if (
          !drawingCrdtStrokeActiveRef.current
          || studioCrdtDocumentRef.current !== crdtDocument
        ) {
          throw new Error("실시간 협업 문서가 획 전송 전에 변경되었습니다.");
        }
        const samples = studioDrawElementSampleSlice(latestDrawing, earliestSample);
        if (samples) crdtDocument.appendStrokeSamples(latestDrawing.id, samples);
      },
    });
  }
  function consumeFreehandPointerBatch(
    stage: Konva.Stage,
    pointerEvent: PointerEvent,
    includePredicted: boolean,
    options: {
      dispatchedPressureOverride?: number;
      authoritativeSource?: "coalesced-or-parent" | "parent-only";
      coordinateMapper?: StudioStagePointerBatchMapper;
    } = {}
  ): boolean {
    const session = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    if (!session || !isStudioStrokePointerEvent(session, pointerEvent)) return false;

    // Predictions are always routed to a physically separate replaceable surface. Shift gestures
    // replace the whole path rather than a suffix, so they intentionally stay hardware-only.
    const predictionIsReplaceable = includePredicted && !pointerEvent.shiftKey;
    const batch = collectStudioStrokePointerBatch(session, pointerEvent, {
      includePredicted: predictionIsReplaceable,
      authoritativeSource: options.authoritativeSource,
    });
    requireStudioDrawingPointerTransport(drawingPointerTransportRef).replaceSession(batch.session);
    // Exact duplicate hardware deliveries have no document or preview work.
    if (batch.authoritative.length === 0 && batch.predicted.length === 0) return false;
    const sampleClock = drawingFixedRateSampleClockRef.current;
    const sampleClockTransition = sampleClock && batch.authoritative.length > 0
      ? normalizeFixedRateStrokeSampleTimeStamps(
          sampleClock,
          batch.authoritative.map((sample) => (
            typeof sample.timeStamp === "number" ? sample.timeStamp : pointerEvent.timeStamp
          )),
          globalThis.performance?.now?.() ?? pointerEvent.timeStamp
        )
      : null;
    if (sampleClockTransition) {
      drawingFixedRateSampleClockRef.current = sampleClockTransition.state;
    }
    // One browser delivery shares one layout/Stage transform. Mapping the full coalesced and
    // predicted batch from one snapshot avoids a DOM read plus transform inversion per sample.
    const coordinateMapper = options.coordinateMapper
      ?? stagePointerFrameMapperCacheRef.current?.mapperFor(stage)
      ?? snapshotStudioStagePointerBatchMapper(stage);
    const crdtSampleStart = Math.floor((drawingRef.current?.points.length ?? 0) / 2);
    const activeDrawing = drawingRef.current;
    const mutableDirectSurfaceActive = (
      (
        liveDraftDirectRef.current
        && (
          liveInkOverlayRendererRef.current.isActive
          || (activeDrawing !== null && isStudioPixelPencilRenderMode(activeDrawing.brush))
        )
      )
      || (
        liveStampDraftDirectRef.current
        && liveStampOverlayRendererRef.current.isActive
      )
      || (
        liveDynamicBrushDraftDirectRef.current
        && liveDynamicBrushOverlayRendererRef.current.isActive
      )
      || (
        liveRetainedMediaDraftDirectRef.current
        && liveRetainedMediaOverlayRendererRef.current.isActive
      )
      || (
        liveWetInkDraftDirectRef.current
        && liveWetInkOverlayRendererRef.current.isActive
      )
    );
    const compactGpuSourceJournalActive = gpuLiveInkPinnedRef.current
      && gpuLiveSourceJournalRef.current !== null;
    const immediateBatchMutation = !compactGpuSourceJournalActive
      && shouldOwnStudioCoalescedBatchDraft({
        authoritativeSampleCount: batch.authoritative.length,
        gpuPinned: gpuLiveInkPinnedRef.current,
        fixedRateFilterActive: drawingFixedRateFilterRef.current !== null,
        immediateCausalInput: drawingImmediateCausalInputRef.current,
        mutableDirectSurfaceActive,
    });
    if (immediateBatchMutation && drawingRef.current) {
      const current = drawingRef.current;
      // Clone once per browser delivery, then append every coalesced sample into that private
      // draft. Non-overlay eraser/watercolor and legacy outline/material brushes therefore stay
      // O(events × points), not O(hardwareSamples × points), while the previously published draft
      // remains immutable.
      drawingRef.current = {
        ...current,
        points: [...current.points],
        pressures: current.pressures ? [...current.pressures] : undefined,
        tiltXs: current.tiltXs ? [...current.tiltXs] : undefined,
        tiltYs: current.tiltYs ? [...current.tiltYs] : undefined,
        twists: current.twists ? [...current.twists] : undefined,
        speeds: current.speeds ? [...current.speeds] : undefined,
        tangentialPressures: current.tangentialPressures
          ? [...current.tangentialPressures]
          : undefined,
        altitudeAngles: current.altitudeAngles
          ? [...current.altitudeAngles]
          : undefined,
        azimuthAngles: current.azimuthAngles
          ? [...current.azimuthAngles]
          : undefined,
        contactWidths: current.contactWidths
          ? [...current.contactWidths]
          : undefined,
        contactHeights: current.contactHeights
          ? [...current.contactHeights]
          : undefined,
        sampleTimeOffsets: current.sampleTimeOffsets
          ? [...current.sampleTimeOffsets]
          : undefined,
      };
      drawingImmediateBatchMutationRef.current = true;
    }
    try {
      for (const [sampleIndex, sample] of batch.authoritative.entries()) {
        const point = coordinateMapper.pointFor(sample);
        if (point) {
          drawingLastAuthoritativePointerRef.current = sample;
          appendFreehandStrokePoint(
            point,
            sample,
            sample === pointerEvent ? options.dispatchedPressureOverride : undefined,
            sampleClockTransition?.timeStamps[sampleIndex]
          );
        }
      }
      drawingImmediateBatchMutationRef.current = false;

      const authoritativeDrawing = batch.authoritative.length > 0
        ? publishAuthoritativeFreehandSuffix(crdtSampleStart)
        : drawingRef.current;
      const authoritativePointCount = Math.floor((authoritativeDrawing?.points.length ?? 0) / 2);
      const rawPreviewState = rawPenInkPreviewStateRef.current;
      const canonicalPredictionTail = predictedInkTailStateRef.current;
      if (
        authoritativeDrawing
        && rawPreviewState
        && canonicalPredictionTail
        && session.pointerId === rawPreviewState.pointerId
      ) {
        const rawSync = syncStudioRawPenInkPreviewAuthority(rawPreviewState, {
          pointerId: rawPreviewState.pointerId,
          generation: rawPreviewState.generation,
          authoritativeTail: canonicalPredictionTail,
        });
        rawPenInkPreviewStateRef.current = rawSync.state;
        // The canonical append has already cleared the old transient tail. Applying the same
        // bounded command here keeps the wrapper lifecycle explicit before native predictions win.
        liveInkPredictionRendererRef.current.apply(
          rawSync.predictionSurface,
          liveInkStyleFor(authoritativeDrawing),
        );
      }
      if (
        immediateBatchMutation
        && authoritativePointCount > crdtSampleStart
        && !liveDraftDirectRef.current
        && !liveStampDraftDirectRef.current
      ) {
        scheduleDraft(authoritativeDrawing);
      }
      if (
        authoritativeDrawing
        && batch.predicted.length > 0
        && !liveStampDraftDirectRef.current
      ) {
        // Predictions make the tip feel closer to the pen, but never advance drawingRef/history.
        // Ruler locks are also restored so an estimate cannot choose the permanent perspective ray.
        const authoritativePerspectiveRay = perspectiveRayRef.current;
        const authoritativeIsometricRay = isometricAxisRayRef.current;
        const authoritativeAdvancedRulerSnap = advancedRulerSnapRef.current;
        const authoritativeFixedRateFilter = drawingFixedRateFilterRef.current;
        const authoritativeStabilizer = drawingStabilizerRef.current;
        const authoritativeVelocity = drawingVelocityRef.current;
        const authoritativeVelocityPressure = drawingVelocityPressureRef.current;
        try {
          drawingPredictionPreviewRef.current = true;
          const suffixDraftCandidate = liveDraftDirectRef.current && predictedInkTailStateRef.current
            ? planStudioPredictedInkSuffixDraft({
                points: authoritativeDrawing.points,
                pressures: authoritativeDrawing.pressures,
                tiltXs: authoritativeDrawing.tiltXs,
                tiltYs: authoritativeDrawing.tiltYs,
                twists: authoritativeDrawing.twists,
                speeds: authoritativeDrawing.speeds,
                tangentialPressures: authoritativeDrawing.tangentialPressures,
                fallbackPressure: studioInkFallbackPressure(authoritativeDrawing.pressureModel),
              })
            : null;
          const suffixDraft = suffixDraftCandidate?.authoritativeSampleCount === authoritativePointCount
            ? suffixDraftCandidate
            : null;
          const predictionStartSampleIndex = suffixDraft?.draftPredictionStartSampleIndex
            ?? authoritativePointCount;
          // Direct replaceable-tail rendering needs only origin + current endpoint, so its work is
          // independent of an already-long stroke. Causal correction and Konva fallbacks retain the
          // complete private clone because those paths still render or compare the whole preview.
          drawingRef.current = {
            ...authoritativeDrawing,
            points: suffixDraft?.points ?? [...authoritativeDrawing.points],
            pressures: suffixDraft
              ? suffixDraft.pressures
              : authoritativeDrawing.pressures ? [...authoritativeDrawing.pressures] : undefined,
            tiltXs: suffixDraft
              ? suffixDraft.tiltXs
              : authoritativeDrawing.tiltXs ? [...authoritativeDrawing.tiltXs] : undefined,
            tiltYs: suffixDraft
              ? suffixDraft.tiltYs
              : authoritativeDrawing.tiltYs ? [...authoritativeDrawing.tiltYs] : undefined,
            twists: suffixDraft
              ? suffixDraft.twists
              : authoritativeDrawing.twists ? [...authoritativeDrawing.twists] : undefined,
            speeds: suffixDraft
              ? suffixDraft.speeds
              : authoritativeDrawing.speeds ? [...authoritativeDrawing.speeds] : undefined,
            tangentialPressures: suffixDraft
              ? suffixDraft.tangentialPressures
              : authoritativeDrawing.tangentialPressures
                ? [...authoritativeDrawing.tangentialPressures]
                : undefined,
            altitudeAngles: authoritativeDrawing.altitudeAngles
              ? [...authoritativeDrawing.altitudeAngles]
              : undefined,
            azimuthAngles: authoritativeDrawing.azimuthAngles
              ? [...authoritativeDrawing.azimuthAngles]
              : undefined,
            contactWidths: authoritativeDrawing.contactWidths
              ? [...authoritativeDrawing.contactWidths]
              : undefined,
            contactHeights: authoritativeDrawing.contactHeights
              ? [...authoritativeDrawing.contactHeights]
              : undefined,
            sampleTimeOffsets: authoritativeDrawing.sampleTimeOffsets
              ? [...authoritativeDrawing.sampleTimeOffsets]
              : undefined,
          };
          drawingPredictionBatchMutationRef.current = true;
          for (const sample of batch.predicted) {
            const point = coordinateMapper.pointFor(sample);
            if (point) appendFreehandStrokePoint(point, sample);
          }
          const predictedPreview = drawingRef.current;
          drawingRef.current = authoritativeDrawing;
          if (predictedPreview && predictedPreview !== authoritativeDrawing) {
            if (liveDraftDirectRef.current && causalPostCorrectionStateRef.current) {
              previewCausalPostCorrectionTail(predictedPreview, authoritativePointCount);
            } else if (liveDraftDirectRef.current && predictedInkTailStateRef.current) {
              replacePredictedInkTail(predictedPreview, predictionStartSampleIndex);
            } else {
              scheduleDraft(predictedPreview);
            }
            const inkMeshModule = inkMeshLivePreviewModuleRef.current;
            const inkMeshRuntime = inkMeshLivePreviewRuntimeRef.current;
            if (inkMeshModule && inkMeshRuntime) {
              try {
                const meshPreview = suffixDraft
                  ? inkMeshModule.expandStudioInkMeshPredictedSuffix(
                      authoritativeDrawing,
                      predictedPreview,
                      predictionStartSampleIndex,
                    )
                  : predictedPreview;
                const meshReceipt = inkMeshRuntime.previewPredicted(
                  meshPreview,
                  authoritativePointCount,
                  studioLiveBrushPressureSamples(meshPreview),
                );
                if (inkMeshModule.isStudioInkMeshRenderedReceipt(meshReceipt)) {
                  // Canvas prediction remains the fail-visible CPU path, but exactly one transient
                  // tail is visible in this frame. Its state stays intact so device loss can resume
                  // on the next browser delivery without touching DrawEl/history.
                  liveInkPredictionRendererRef.current.clear();
                }
              } catch {
                // A malformed compact preview is non-authoritative. Drop only the mesh island and
                // leave the already-rendered Canvas2D prediction + Perfect Freehand path untouched.
                inkMeshRuntime.cancel();
              }
            }
          }
        } finally {
          drawingPredictionBatchMutationRef.current = false;
          drawingPredictionPreviewRef.current = false;
          drawingRef.current = authoritativeDrawing;
          perspectiveRayRef.current = authoritativePerspectiveRay;
          isometricAxisRayRef.current = authoritativeIsometricRay;
          advancedRulerSnapRef.current = authoritativeAdvancedRulerSnap;
          // Predicted timestamps are in the future by definition. They may draw only on the
          // replaceable preview surface and must never advance the authoritative 5ms filter clock,
          // otherwise the following real samples are clamped to that future tick and visibly stall.
          drawingFixedRateFilterRef.current = authoritativeFixedRateFilter;
          drawingStabilizerRef.current = authoritativeStabilizer;
          drawingVelocityRef.current = authoritativeVelocity;
          drawingVelocityPressureRef.current = authoritativeVelocityPressure;
        }
      }
    } finally {
      drawingImmediateBatchMutationRef.current = false;
      drawingPredictionBatchMutationRef.current = false;
      // Avoid a second Stage layout read unless the event route is outside Stage.
      if (
        shouldSynchronizeStudioStagePointerPosition(
          stage.getContent(),
          pointerEvent.target
        )
      ) {
        stage.setPointersPositions(pointerEvent);
      }
    }
    return true;
  }

  function publishAuthoritativeFreehandSuffix(startSample: number): DrawEl | null {
    const authoritativeDrawing = drawingRef.current;
    if (!authoritativeDrawing) return null;
    // The same coalesced suffix that becomes DrawEl/CRDT authority advances Google Ink's retained
    // InProgressStroke. Any previously displayed estimate is replaced by this exact prefix before
    // the normal live surface flushes; no predicted sample enters this call.
    inkMeshLivePreviewRuntimeRef.current?.synchronizeAuthoritative(
      authoritativeDrawing,
      liveBrushPressureSamplesFor(authoritativeDrawing),
    );
    appendStudioLivingInkAuthoritativeSuffix(authoritativeDrawing, startSample);
    appendStudioHokusaiAuthoritativeSuffix(authoritativeDrawing, startSample);
    drawingGesturePreviewPublisherRef.current.append(authoritativeDrawing, startSample);
    if (liveDraftDirectRef.current || liveStampDraftDirectRef.current) {
      if (causalPostCorrectionStateRef.current) {
        appendCausalPostCorrectionState(authoritativeDrawing, startSample);
      } else if (predictedInkTailStateRef.current) {
        // Every real browser suffix invalidates the previous estimate first. Only the new durable
        // suffix advances this state; the append-only live surface is never cleared or replaced.
        appendAuthoritativePredictedInkState(authoritativeDrawing, startSample);
      }
      // The pointer task or frame pump already owns the earliest available presentation slot.
      // Publish Canvas/WebGPU suffixes now instead of adding another display frame of latency.
      flushDirectLiveDraftNow(authoritativeDrawing);
    }
    // Local ink is the interaction-critical path. Yjs encoding/broadcast is coalesced behind a
    // paint opportunity; pointer release flushes the same queue before final CRDT reconciliation.
    appendDrawingCrdtSampleSuffix(authoritativeDrawing, startSample);
    return authoritativeDrawing;
  }

  drawingFixedRatePumpFrameRef.current = (frameTimeStamp: any) => {
    const drawing = drawingRef.current;
    const session = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    const filter = drawingFixedRateFilterRef.current;
    const clock = drawingFixedRatePumpClockRef.current;
    const pointerSample = drawingLastAuthoritativePointerRef.current;
    if (
      !drawing
      || !session
      || !filter
      || !clock
      || !pointerSample
      || (drawing.kind ?? "freehand") !== "freehand"
      || !isStudioStrokePointerEvent(session, pointerSample)
    ) return false;

    const frameClock = advanceFixedRateStrokeFrameClock(clock, frameTimeStamp);
    drawingFixedRatePumpClockRef.current = frameClock.state;
    const sampleClock = drawingFixedRateSampleClockRef.current;
    if (sampleClock) {
      drawingFixedRateSampleClockRef.current = advanceFixedRateStrokeSampleClockFloor(
        sampleClock,
        frameClock.watermark
      );
    }
    const crdtSampleStart = Math.floor(drawing.points.length / 2);
    const transition = transitionFixedRateStrokeFilter(filter, {
      type: "advance",
      timeStamp: frameClock.watermark,
    });
    drawingFixedRateFilterRef.current = transition.state;
    appendFixedRateStrokeSamples(transition.emitted, pointerSample, 0);
    const nextSampleCount = Math.floor((drawingRef.current?.points.length ?? 0) / 2);
    if (nextSampleCount > crdtSampleStart) {
      publishAuthoritativeFreehandSuffix(crdtSampleStart);
    }
    const stage = stageRef.current;
    const pointerMapperCache = stagePointerFrameMapperCacheRef.current;
    const strokeGuidePointer = stage && pointerMapperCache
      ? pointerMapperCache.mapperFor(stage).pointFor(pointerSample)
      : null;
    updateStrokeGuide(
      strokeGuidePointer?.x ?? Number.NaN,
      strokeGuidePointer?.y ?? Number.NaN,
      true,
    );
    return true;
  };

  // Native listeners stay mounted for one contact, while these ports always point at this render's
  // drawing settings, document, draft surfaces and finish coordinator.
  requireStudioDrawingPointerTransport(drawingPointerTransportRef).updatePorts({
    getLastAuthoritativePointer: () => drawingLastAuthoritativePointerRef.current,
    onAuthoritativeMove: (pointerEvent) => {
      const session = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
      const drawing = drawingRef.current;
      if (
        tool !== "draw"
        || !session
        || !drawing
        || (drawing.kind ?? "freehand") !== "freehand"
        || !isStudioStrokePointerEvent(session, pointerEvent)
      ) return;
      const stage = stageRef.current;
      if (!stage) return;
      if (!consumeFreehandPointerBatch(
        stage,
        pointerEvent,
        canCollectStudioPointerPredictionsForActiveTail(
          STUDIO_POINTER_PREDICTION_ENABLED,
          session,
          predictedInkTailStateRef.current !== null
        ),
      )) return;
      const pointerMapperCache = stagePointerFrameMapperCacheRef.current;
      if (!pointerMapperCache) return;
      // Reuse the mapper acquired while consuming the batch.
      const contactPoint = pointerMapperCache.mapperFor(stage).pointFor(pointerEvent);
      // Authoritative ink wins the native pointer task. The cursor keeps only the latest position
      // and paints once on the next frame, so a high-Hz pen cannot make a cosmetic layer delay ink.
      updateBrushCursor(stage, pointerEvent, contactPoint, true);
      updateStrokeGuide(
        contactPoint?.x ?? Number.NaN,
        contactPoint?.y ?? Number.NaN,
        true,
      );
      if (drawMode === "pen" && contactPoint) noteQuickShapePointerMoved(contactPoint);
    },
    onRawPreviewMove: (pointerEvent) => {
      const session = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
      const drawing = drawingRef.current;
      if (
        tool !== "draw"
        || !session
        || session.pointerType !== "pen"
        || !drawing
        || (drawing.kind ?? "freehand") !== "freehand"
        || !isStudioStrokePointerEvent(session, pointerEvent)
      ) return;
      const rawState = rawPenInkPreviewStateRef.current;
      const rawCursorWanted = (
        brushCursorRef.current !== null
        && isStudioBrushCursorMode(drawMode)
        && appSettingsRef.current.general.brushCursorStyle !== "none"
      );
      const rawGuideWanted = (
        strokeGuideRef.current !== null
        && appSettingsRef.current.general.showStrokeGuide
        && (drawingInputSettingsRef.current?.stabilizer ?? stabilizer) > 0
      );
      // pointerrawupdate may run at 120–240 Hz. If no prediction surface or visible cosmetic
      // consumer exists, avoid even the stage/layout coordinate snapshot on this native path.
      if (!rawState && !rawCursorWanted && !rawGuideWanted) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pointerMapperCache = stagePointerFrameMapperCacheRef.current;
      if (!pointerMapperCache) return;
      const coordinateMapper = pointerMapperCache.mapperFor(stage);
      const contactPoint = coordinateMapper.pointFor(pointerEvent);
      if (rawState && contactPoint) {
        const settings = drawingInputSettingsRef.current;
        // Raw updates are replace-only previews. Branch from (but never publish) the latest
        // authoritative pressure state so pencil, marker, dry-media and every other family show
        // the same hardware-pressure curve before the processed pointer event commits it.
        const previewPressure = advanceStudioBrushVelocityPressure(
          drawingVelocityPressureRef.current,
          {
            x: pointerEvent.clientX,
            y: pointerEvent.clientY,
            timeMs: pointerEvent.timeStamp,
            pointerType: pointerEvent.pointerType,
            pressure: pointerEvent.pressure,
          },
          {
            brushId: drawing.brush,
            pressureCurve: settings?.pressureCurve ?? pressureCurve,
            pressureMinSize: settings?.pressureMinSize ?? pressureMinSize,
            useVelocityPressure: settings?.useVelocityPressure ?? useVelocityPressure,
            velocitySensitivity: settings?.velocitySensitivity ?? velocitySensitivity,
            fallbackPressure: studioInkFallbackPressure(drawing.pressureModel),
          }
        ).pressure;
        const rawTransition = replaceStudioRawPenInkPreview(rawState, {
          pointerId: pointerEvent.pointerId,
          generation: rawState.generation,
          eligibility: currentRawPenInkPreviewEligibility(pointerEvent, drawing),
          point: {
            x: contactPoint.x,
            y: contactPoint.y,
            pressure: studioLiveBrushPressure(drawing, previewPressure),
          },
        });
        rawPenInkPreviewStateRef.current = rawTransition.state;
        liveInkPredictionRendererRef.current.apply(
          rawTransition.predictionSurface,
          liveInkStyleFor(drawing),
        );
      }
      // Raw ink is transient and replace-only. Durable geometry, history, CRDT, ruler locks,
      // QuickShape recognition, and the pointer-session signature still wait for processed input.
      updateBrushCursor(stage, pointerEvent, contactPoint, true);
      updateStrokeGuide(
        contactPoint?.x ?? Number.NaN,
        contactPoint?.y ?? Number.NaN,
        true,
      );
    },
    onDiscard: () => {
      if (!drawingRef.current && !requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()) return;
      discardDrawingPointerSession();
    },
    onFinish: (pointerEvent, request) => {
      // Snapshot + stop happen inside finishDrawingPointer; clearing QuickShape here would wipe
      // the hold/lock state used by release promotion.
      if (!request.cancelled && colorWheelTimerRef.current) {
        clearTimeout(colorWheelTimerRef.current);
        colorWheelTimerRef.current = null;
      }
      finishDrawingPointer(stageRef.current, pointerEvent, {
        consumeReleaseSample: request.consumeReleaseSample,
      });
    },
  });

  function queueStudioBg3dMagicFilterMaskPublication(input: {
    readonly pageId: string;
    readonly layerId: string;
    readonly targetElementId: string;
    readonly mask: StudioBackground3DMagicFilterMask;
    readonly workId: string;
    readonly actorId: string;
    readonly document: StudioCrdtDocument;
    readonly runtime: StudioCrdtSceneGraphRuntime;
    readonly accessGeneration: number;
    readonly publicationGeneration: number;
  }): void {
    const controller = new AbortController();
    studioRasterPublicationControllersRef.current.add(controller);
    const scopeIsCurrent = () => {
      const access = collaborationAccessRef.current;
      return (
        editorMountedRef.current
        && !documentSaveInFlightRef.current
        && !access.locked
        && access.authScopeKey === input.actorId
        && access.workId === input.workId
        && access.accessGeneration === input.accessGeneration
        && (
          studioFilterMaskPublicationGenerationRef.current.get(input.targetElementId)
          === input.publicationGeneration
        )
        && studioCrdtDocumentRef.current === input.document
        && studioCrdtSceneRuntimeRef.current === input.runtime
      );
    };
    const currentTarget = (): ImageEl | null => {
      const history = pagesHistoryRef.current;
      const currentIndex = Math.max(0, Math.min(pagesHiRef.current, history.length - 1));
      const page = history[currentIndex]?.find(({ id }: { id: string }) => id === input.pageId) ?? null;
      const target = page?.elements.find(({ id }: { id: string }) => id === input.targetElementId) ?? null;
      if (
        !page
        || target?.type !== "image"
        || target.filterMaskSrc !== input.mask.pngDataUrl
        || target.filterMaskSurfaceId !== undefined
        || (target.groupId ?? "page-root") !== input.layerId
        || isEffectivelyLocked(target, page.groups ?? [])
      ) {
        return null;
      }
      return target;
    };
    const abortForStaleScope = (): never => {
      throw new DOMException(
        "3D Magic Layer 또는 공동 편집 권한이 변경되었습니다.",
        "AbortError"
      );
    };

    const run = async () => {
      if (!scopeIsCurrent() || !currentTarget()) abortForStaleScope();
      const [
        publicationModule,
        rasterPublisherModule,
        assetClientModule,
        maskImage,
      ] = await Promise.all([
        import( "../filter/studio-filter-mask-surface-publisher"),
        import("../live/studio-crdt-raster-patch-publisher"),
        import("../render/studio-raster-asset-client"),
        loadStudioPixelEditImage(input.mask.pngDataUrl, controller.signal),
      ]);
      if (!scopeIsCurrent() || !currentTarget()) abortForStaleScope();
      const width = maskImage.naturalWidth || maskImage.width;
      const height = maskImage.naturalHeight || maskImage.height;
      if (width !== input.mask.width || height !== input.mask.height) {
        throw new Error("3D Magic Layer 마스크의 디코드 크기가 캡처 계약과 다릅니다.");
      }
      const made = createStudioPixelEditCanvas(width, height);
      if (!made) throw new Error("3D Magic Layer 게시용 픽셀 표면을 만들 수 없습니다.");
      made.ctx.clearRect(0, 0, width, height);
      made.ctx.drawImage(maskImage, 0, 0);
      const pixels = made.ctx.getImageData(0, 0, width, height).data;
      const sourceIdentity = await input.runtime.sha256RasterSemanticParameters(
        input.mask.pngDataUrl,
        controller.signal
      );
      if (!scopeIsCurrent() || !currentTarget()) abortForStaleScope();
      const encoder = rasterPublisherModule.createStudioRasterBrowserPngEncoder();

      await publicationModule.publishStudioFilterMaskSurface({
        workId: input.workId,
        actorId: input.actorId,
        pageId: input.pageId,
        layerId: input.layerId,
        targetElementId: input.targetElementId,
        sourceIdentity,
        selectedObjectStableId: input.mask.selectedObjectStableId,
        generation: input.publicationGeneration,
        width,
        height,
        pixels,
        signal: controller.signal,
      }, {
        encode: encoder,
        upload: (workId, { reference, bytes, signal }) => {
          if (workId !== input.workId) abortForStaleScope();
          return assetClientModule.uploadStudioRasterAsset(
            workId,
            reference,
            bytes,
            signal
          );
        },
        append: (log) => {
          if (!scopeIsCurrent() || !currentTarget()) abortForStaleScope();
          input.document.mergeRasterOperationLog(log);
        },
        compensate: (workId, { reference, signal }) => {
          if (workId !== input.workId) return Promise.resolve(false);
          return assetClientModule.deleteUnreferencedStudioRasterAssetUpload(
            workId,
            reference,
            signal
          );
        },
        canWriteLayer: (guardInput) => (
          guardInput.actorId === input.actorId
          && guardInput.pageId === input.pageId
          && guardInput.layerId === input.layerId
          && guardInput.intent === "paint"
          && scopeIsCurrent()
          && currentTarget() !== null
        ),
        isCurrent: () => scopeIsCurrent() && currentTarget() !== null,
        nextLogicalClock: () =>
          input.runtime.nextRasterLogicalClock(input.document.getRasterOperationLogs()),
        sha256SemanticParameters: (canonicalParameters, signal) =>
          input.runtime.sha256RasterSemanticParameters(canonicalParameters, signal),
        waitForAuthoritativeAck: async ({ signal }) => {
          const barrier = studioCrdtAuthoritativeSaveBarrierRef.current;
          if (!barrier) {
            throw new DOMException(
              "3D Magic Layer 서버 승인 경계가 준비되지 않았습니다.",
              "AbortError"
            );
          }
          if (!scopeIsCurrent() || signal.aborted) abortForStaleScope();
          return barrier(10_000);
        },
        attachSceneReference: ({ filterMaskSurfaceId }) => {
          if (!scopeIsCurrent() || !currentTarget()) abortForStaleScope();
          const history = pagesHistoryRef.current;
          const currentIndex = Math.max(0, Math.min(pagesHiRef.current, history.length - 1));
          const admitted = attachStudioFilterMaskSurfaceAcrossHistory<El, PageState>({
            history,
            currentIndex,
            targetElementId: input.targetElementId,
            expectedInlineSource: input.mask.pngDataUrl,
            surfaceId: filterMaskSurfaceId,
          });
          if (!admitted.changed || !markStudioDocumentChanged()) abortForStaleScope();
          if (!publishStudioCrdtSceneTransitionRef.current(
            admitted.previousCurrentPages,
            admitted.nextCurrentPages
          )) {
            throw new Error("승인된 3D Magic Layer 참조를 팀 문서에 반영하지 못했습니다.");
          }
          pagesHistoryRef.current = admitted.history;
          rebaseStudioHistoryJournal(
            admitted.nextCurrentPages,
            currentIndex,
            "Magic filter-mask surface admission"
          );
          setPagesHistoryState(admitted.history);
        },
      });
    };

    const task = studioRasterPublicationTailRef.current
      .catch(() => undefined)
      .then(run);
    studioRasterPublicationTailRef.current = task.then(
      () => undefined,
      () => undefined
    );
    void task.catch((cause: unknown) => {
      if (
        controller.signal.aborted
        || (cause instanceof DOMException && cause.name === "AbortError")
        || !scopeIsCurrent()
      ) {
        return;
      }
      setError(
        cause instanceof Error
          ? `3D Magic Layer 공유 표면 게시: ${cause.message} 인라인 마스크는 안전하게 유지됩니다.`
          : "3D Magic Layer 공유 표면을 게시하지 못해 인라인 마스크를 유지했습니다."
      );
    }).finally(() => {
      studioRasterPublicationControllersRef.current.delete(controller);
      if (
        studioFilterMaskPublicationGenerationRef.current.get(input.targetElementId)
        === input.publicationGeneration
      ) {
        studioFilterMaskPublicationGenerationRef.current.delete(input.targetElementId);
      }
    });
  }

  function queueStudioRasterDrawPromotion(input: {
    plan: NonNullable<ReturnType<StudioCrdtSceneGraphRuntime["planRasterDrawPromotion"]>>;
    pageId: string;
    layerId: string;
    workId: string;
    actorId: string;
    document: StudioCrdtDocument;
    runtime: StudioCrdtSceneGraphRuntime;
    accessGeneration: number;
  }): void {
    const controller = new AbortController();
    studioRasterPublicationControllersRef.current.add(controller);
    const scopeIsCurrent = () => {
      const access = collaborationAccessRef.current;
      return editorMountedRef.current &&
        !documentSaveInFlightRef.current &&
        !access.locked &&
        access.authScopeKey === input.actorId &&
        access.workId === input.workId &&
        access.accessGeneration === input.accessGeneration &&
        studioCrdtDocumentRef.current === input.document &&
        studioCrdtSceneRuntimeRef.current === input.runtime;
    };
    const abortForStaleScope = (): never => {
      throw new DOMException("작품 또는 공동 편집 권한이 변경되었습니다.", "AbortError");
    };
    const sourceVectorIsCurrent = () => {
      const history = pagesHistoryRef.current;
      const currentIndex = Math.max(0, Math.min(pagesHiRef.current, history.length - 1));
      const page = history[currentIndex]?.find(({ id }) => id === input.pageId);
      const element = page?.elements.find(({ id }) => id === input.plan.operationId) ?? null;
      return input.runtime.rasterDrawPromotionSourceMatches({
        plan: input.plan,
        element: element?.type === "draw" ? element : null,
        pageId: input.pageId,
        layerId: input.layerId,
        documentWidth: CANVAS_W,
        documentHeight: page?.canvasH ?? input.plan.surface.height,
        panelClipped: Boolean(
          element?.type === "draw" && page && containingPanel(element, page.elements)
        ),
      });
    };

    const run = async () => {
      if (!scopeIsCurrent()) abortForStaleScope();
      if (input.document.getRasterOperationLogs().some((log) =>
        log.operations.some(({ operationId }) => operationId === input.plan.operationId)
      )) return;

      const [captureModule, publisherModule, assetClientModule, semanticParametersSha256] =
        await Promise.all([
          import("../live/studio-crdt-raster-stroke-capture"),
          import("../live/studio-crdt-raster-patch-publisher"),
          import("../render/studio-raster-asset-client"),
          input.runtime.sha256RasterSemanticParameters(
            input.plan.semanticParameters,
            controller.signal
          ),
      ]);
      if (!scopeIsCurrent()) abortForStaleScope();
      if (!sourceVectorIsCurrent()) {
        throw new DOMException("원본 벡터 획이 게시 전에 변경되었습니다.", "AbortError");
      }
      const captured = captureModule.captureStudioRasterStroke({
        stroke: input.plan.stroke,
        documentWidth: input.plan.surface.width,
        documentHeight: input.plan.surface.height,
      });
      const encoder = publisherModule.createStudioRasterBrowserPngEncoder();
      const logicalClock = input.runtime.nextRasterLogicalClock(
        input.document.getRasterOperationLogs()
      );
      await publisherModule.publishStudioRasterPatch({
        surface: input.plan.surface,
        operationId: input.plan.operationId,
        actorId: input.actorId,
        logicalClock,
        pageId: input.pageId,
        layerId: input.layerId,
        intent: input.plan.intent,
        semanticParametersSha256,
        rect: captured.bounds,
        pixels: captured.pixels,
      }, {
        encode: encoder,
        upload: ({ reference, bytes, signal }) =>
          assetClientModule.uploadStudioRasterAsset(
            input.workId,
            reference,
            bytes,
            signal
          ),
        append: (log) => {
          if (!scopeIsCurrent()) abortForStaleScope();
          if (!sourceVectorIsCurrent()) {
            throw new DOMException("원본 벡터 획이 게시 중 변경되었습니다.", "AbortError");
          }
          input.document.mergeRasterOperationLog(log);
        },
        canWriteLayer: (guardInput) => {
          if (
            guardInput.operationId !== input.plan.operationId
            || guardInput.actorId !== input.actorId
            || guardInput.pageId !== input.pageId
            || guardInput.layerId !== input.layerId
            || guardInput.intent !== input.plan.intent
            || !scopeIsCurrent()
          ) return false;
          const history = pagesHistoryRef.current;
          const currentIndex = Math.max(0, Math.min(pagesHiRef.current, history.length - 1));
          const page = history[currentIndex]?.find(({ id }) => id === input.pageId) ?? null;
          return sourceVectorIsCurrent() && canPublishStudioRasterLayer({
            page,
            pageId: input.pageId,
            operationId: input.plan.operationId,
            layerId: input.layerId,
          });
        },
        compensate: ({ reference, signal }) =>
          assetClientModule.deleteUnreferencedStudioRasterAssetUpload(
            input.workId,
            reference,
            signal
          ),
      }, { signal: controller.signal });
    };

    const task = studioRasterPublicationTailRef.current
      .catch(() => undefined)
      .then(run);
    studioRasterPublicationTailRef.current = task.then(
      () => undefined,
      () => undefined
    );
    void task.catch((cause: unknown) => {
      if (
        controller.signal.aborted ||
        (cause instanceof DOMException && cause.name === "AbortError") ||
        !scopeIsCurrent()
      ) return;
      setError(
        cause instanceof Error
          ? `실시간 픽셀 획 게시: ${cause.message} 기존 벡터 획은 안전하게 유지됩니다.`
          : "실시간 픽셀 획을 게시하지 못해 기존 벡터 획을 유지했습니다."
      );
    }).finally(() => {
      studioRasterPublicationControllersRef.current.delete(controller);
    });
  }

  function releaseEndpointPointerSample(
    pointerEvent: PointerEvent,
    current: DrawEl,
  ): StudioPointerReleaseEndpointSample {
    const channels = normalizeStudioPersistedPointerChannels(pointerEvent, {
      timeOriginMilliseconds:
        drawingInkTimeOriginRef.current ?? pointerEvent.timeStamp,
      previousTimeOffsetMilliseconds:
        current.sampleTimeOffsets?.at(-1) ?? 0,
      sourceTimeMilliseconds: pointerEvent.timeStamp,
    });
    return {
      pointerType: pointerEvent.pointerType,
      pressure: pointerEvent.pressure,
      tiltX: pointerEvent.tiltX,
      tiltY: pointerEvent.tiltY,
      twist: pointerEvent.twist,
      tangentialPressure: pointerEvent.tangentialPressure,
      altitudeAngle: pointerEvent.altitudeAngle,
      azimuthAngle: pointerEvent.azimuthAngle,
      width: pointerEvent.width,
      height: pointerEvent.height,
      sampleTimeOffset: channels.timeOffsetMilliseconds,
    };
  }

  function studioPageElementsFromHistory(pageId: string): El[] {
    const history = pagesHistoryRef.current;
    const index = Math.max(0, Math.min(pagesHiRef.current, Math.max(0, history.length - 1)));
    return [...(
      history[index]?.find((page) => page.id === pageId)?.elements
      ?? pages.find((page) => page.id === pageId)?.elements
      ?? []
    )];
  }

  function withStudioHokusaiSource(
    baseElements: readonly El[],
    source: DrawEl,
  ): El[] {
    const next = [...baseElements];
    const index = next.findIndex(({ id }) => id === source.id);
    if (index >= 0) next[index] = source;
    else next.push(source);
    return next;
  }

  function commitStudioHokusaiFallbackVector(
    state: StudioHokusaiPinnedLiveStroke,
    finished: DrawEl,
    reason: string,
  ): void {
    const fallbackElements = withStudioHokusaiSource(
      studioPageElementsFromHistory(state.pageId),
      finished,
    );
    const currentPage = currentPageIdRef.current === state.pageId;
    if (currentPage) {
      // The pointerup finally-block has already cleared the direct DrawEl refs. Install an exact
      // settled copy before removing the material overlay so async Worker failure never flashes a
      // blank frame while the React history commit reaches the main layer.
      flushSync(() => {
        draftPreviewStoreRef.current.settle(finished);
      });
    }
    const committed = commit(fallbackElements, undefined, state.pageId);
    hokusaiLiveOverlaySurfaceRef.current?.renderer.clear();
    hokusaiLiveOverlayVisibleRef.current = false;
    hokusaiLiveStrokeRef.current = null;
    hokusaiLiveFinalizingRef.current = false;
    clearStudioHokusaiVectorShadow(state);
    if (committed) {
      if (currentPage) {
        setSelectedId(finished.id);
        queueCommittedStrokeSurfaceHandoff(state.pageId, [finished.id]);
      }
      announceDrawingShortcut("자연매체 표면 복구 · 원본 벡터 획 저장");
      setError(`자연매체 획을 원본 벡터로 저장했습니다. ${reason}`);
    } else {
      restorePendingStrokeCommits({
        pageId: state.pageId,
        strokes: [finished],
        retryCount: 0,
      });
      // There is no active surface for an inactive page. Its bounded recovery queue remains the
      // sole authority until that page is opened and the commit retry succeeds.
      setError(`자연매체 결과와 벡터 저장을 즉시 확정하지 못했습니다. 복구 큐에 보존했습니다. ${reason}`);
    }
    liveDraftLayerRef.current?.drawScene();
  }

  function completeStudioLivingInkWaterNoop(strokeId: string, reason: string): void {
    livingInkWaterNoopStrokeIdsRef.current.delete(strokeId);
    const state = livingInkStrokeRef.current;
    if (state?.strokeId === strokeId) livingInkStrokeRef.current = null;
    livingInkOverlaySurfaceRef.current?.renderer.clear();
    livingInkOverlayVisibleRef.current = false;
    livingInkFinalizingRef.current = false;
    studioStrokeSurfaceRouteRef.current = null;
    liveDraftVisualRef.current = null;
    liveDraftPendingRef.current = null;
    liveDraftDirectRef.current = false;
    setLivingInkBusy(false);
    void livingInkCoordinatorRef.current.cancelStroke(strokeId);
    liveDraftLayerRef.current?.drawScene();
    announceDrawingShortcut("수채 번짐 물 도구 · 변경 없음");
    setError(`수채 번짐 물 도구를 적용하지 못해 기존 PNG와 문서를 그대로 보존했습니다. ${reason}`);
  }

  function commitStudioLivingInkFallbackVector(
    state: StudioLivingInkPinnedStroke,
    finished: DrawEl,
    reason: string,
  ): void {
    if (studioLivingInkFailureDisposition(state.mode) === "preserve-document-noop") {
      completeStudioLivingInkWaterNoop(state.strokeId, reason);
      return;
    }
    const cancelClaim = claimStudioStrokeSurfaceLifecycle(state.route, {
      phase: "cancel",
      routeKey: state.route.routeKey,
      strokeId: state.strokeId,
      kind: "living-ink",
    });
    if (cancelClaim.status !== "owned") return;
    const fallbackElements = withStudioHokusaiSource(
      studioPageElementsFromHistory(state.pageId),
      finished,
    );
    const currentPage = currentPageIdRef.current === state.pageId;
    if (currentPage) {
      // A failed/blank physical frame must transfer to the newly mounted settled-run layer before
      // the Worker canvas is cleared. Merely mutating the external store is not a paint receipt.
      flushSync(() => {
        draftPreviewStoreRef.current.settle(finished);
      });
      clearStudioLivingInkVectorShadow(state);
    }
    const committed = commit(fallbackElements, undefined, state.pageId);
    livingInkOverlaySurfaceRef.current?.renderer.clear();
    livingInkOverlayVisibleRef.current = false;
    livingInkStrokeRef.current = null;
    releaseLivingInkInputPointer();
    livingInkFinalizingRef.current = false;
    studioStrokeSurfaceRouteRef.current = null;
    setLivingInkBusy(false);
    void livingInkCoordinatorRef.current.cancelStroke(state.strokeId);
    if (committed) {
      if (currentPage) {
        setSelectedId(finished.id);
        queueCommittedStrokeSurfaceHandoff(state.pageId, [finished.id]);
      }
      announceDrawingShortcut("수채 번짐 복구 · 원본 벡터 획 저장");
      setError(`수채 번짐 결과를 원본 벡터로 저장했습니다. ${reason}`);
    } else {
      restorePendingStrokeCommits({
        pageId: state.pageId,
        strokes: [finished],
        retryCount: 0,
      });
      setError(`수채 번짐 결과를 즉시 저장하지 못해 복구 큐에 보존했습니다. ${reason}`);
    }
    liveDraftLayerRef.current?.drawScene();
  }

  async function finishStudioLivingInkStroke(
    state: StudioLivingInkPinnedStroke,
    finished: DrawEl,
  ): Promise<void> {
    let work: StudioLivingInkFinishedWork | null = null;
    try {
      const claim = claimStudioStrokeSurfaceLifecycle(state.route, {
        phase: "finish",
        routeKey: state.route.routeKey,
        strokeId: state.strokeId,
        kind: "living-ink",
      });
      if (claim.status !== "owned") throw new Error("pointer-down 물리 route 소유권이 바뀌었습니다.");
      const surface = livingInkOverlaySurfaceRef.current;
      const config = livingInkConfigRef.current;
      if (
        !surface
        || surface.binding.surfaceKey !== state.surfaceKey
        || !config
        || livingInkStrokeRef.current !== state
      ) throw new Error("Living Ink 최종 표면이 캔버스 좌표계와 일치하지 않습니다.");
      work = await livingInkCoordinatorRef.current.finishStroke(
        state.strokeId,
        state.route.routeKey,
      );
      const presentation = await surface.renderer.presentCanonical(
        work.frame,
        state.route.routeKey,
        surface.binding.projection,
        (receipt) => onStudioLivingInkOverlayPresented(state, receipt),
      );
      if (!studioLivingInkCoverageIntersectsStroke({
        coverage: presentation.alphaCoverage,
        outputWidth: presentation.width,
        outputHeight: presentation.height,
        documentWidth: CANVAS_W,
        documentHeight: canvasH,
        points: finished.points,
        diameter: studioLiveBrushEffectiveDiameter(finished),
      })) {
        throw new Error(
          "Living Ink canonical PNG가 원본 획의 위치에 표시 가능한 안료를 만들지 못해 원본 벡터를 유지합니다.",
        );
      }
      const result: StudioLivingInkCanonicalResult = Object.freeze({
        src: presentation.src,
        pngSha256: presentation.pngSha256,
        routeKey: state.route.routeKey,
        pageId: state.pageId,
        documentWidth: CANVAS_W,
        documentHeight: canvasH,
        config,
        journal: work.journal,
        finalExecutionReceipt: work.frame.receipt,
      });
      const baseElements = withStudioHokusaiSource(
        studioPageElementsFromHistory(state.pageId),
        finished,
      );
      const existingImage = baseElements.find((element) =>
        element.type === "image" && element.livingInkReceipt?.pageId === state.pageId
      );
      const transaction = createStudioLivingInkCanonicalTransaction({
        elements: baseElements,
        sourceElementId: finished.id,
        canonicalImageId: existingImage?.id ?? uid(),
        result,
        mutationLocked:
          collaborationAccessRef.current.locked
          || activeSurfaceReviewLockedRef.current,
      });
      if (!transaction.ok) throw new Error(transaction.message);
      const handoffClaim = claimStudioStrokeSurfaceLifecycle(state.route, {
        phase: "handoff",
        routeKey: state.route.routeKey,
        strokeId: state.strokeId,
        kind: "living-ink",
      });
      if (handoffClaim.status !== "owned") {
        throw new Error("canonical 이미지 인계 route가 pointer-down 영수증과 다릅니다.");
      }
      const committed = commit(
        [...transaction.transaction.nextElements],
        undefined,
        state.pageId,
      );
      if (!committed) throw new Error("문서가 잠겨 Living Ink 단일 트랜잭션을 확정하지 못했습니다.");
      state.canonicalImageId = transaction.transaction.canonicalImageId;
      state.canonicalPngHash = presentation.pngSha256;
      state.transactionCommitted = true;
      livingInkCanonicalHandoffRef.current = Object.freeze({
        token: `${state.route.routeKey}:canonical`,
        kind: "stroke",
        pageId: state.pageId,
        imageId: transaction.transaction.canonicalImageId,
        pngHash: presentation.pngSha256,
        strokeId: state.strokeId,
      });
      armStudioLivingInkCanonicalHandoffTimeout();
      const committedCanonicalImage = transaction.transaction.nextElements.find(
        (element): element is ImageEl =>
          element.type === "image"
          && element.id === transaction.transaction.canonicalImageId,
      );
      const committedAuthority = committedCanonicalImage?.livingInkReceipt
        ? Object.freeze({
            pageId: state.pageId,
            replayToken: studioLivingInkReceiptReplayToken(committedCanonicalImage.livingInkReceipt),
            canonicalSrc: committedCanonicalImage.src,
          })
        : null;
      if (!livingInkCoordinatorRef.current.acceptFinishedStroke(work)) {
        livingInkAcceptedAuthorityRef.current = null;
        livingInkRejectedAuthorityRef.current = committedAuthority;
        const message =
          "수채 번짐 PNG는 저장됐지만 Worker 상태 고정에 실패해, 저장 영수증 재검증 전에는 물리 편집을 비활성화합니다.";
        setError(message);
        void livingInkCoordinatorRef.current.failClosed(message);
      } else {
        livingInkRejectedAuthorityRef.current = null;
        livingInkAcceptedAuthorityRef.current = committedAuthority;
      }
      if (currentPageIdRef.current === state.pageId) {
        // Automatic materialization is still part of the drawing gesture. Selecting the new
        // page-sized image would mount image-editing chrome and move the canvas host between the
        // live/released frame and the canonical handoff. The pixels and document coordinates are
        // already identical; keep the drawing context stable and let the artist explicitly select
        // the materialized layer afterward (same contract as Hokusai below).
        setSelectedId(null);
        setLivingInkScope("all");
      }
      announceDrawingShortcut("수채 번짐 · 입력·놓을 때 물리 계산, 손을 떼면 2초 고정 settle");
      // The exact live pixels stay visible until StudioKonvaImageNode synchronously draws the same
      // PNG hash into the main layer. No guessed requestAnimationFrame handoff is allowed.
    } catch (cause) {
      if (state.transactionCommitted || livingInkStrokeRef.current !== state) return;
      if (work) await livingInkCoordinatorRef.current.rollbackFinishedStroke(work).catch(() => undefined);
      commitStudioLivingInkFallbackVector(
        state,
        finished,
        cause instanceof Error ? cause.message : "최종 물리 프레임을 검증하지 못했습니다.",
      );
    }
  }

  async function finishStudioHokusaiLiveStroke(
    state: StudioHokusaiPinnedLiveStroke,
    finished: DrawEl,
  ): Promise<void> {
    try {
      const session = state.session ?? await state.beginPromise;
      if (!session || state.failed || hokusaiLiveStrokeRef.current !== state) {
        throw new Error("라이브 자연매체 세션이 최종화 전에 해제되었습니다.");
      }
      state.session = session;
      if (state.queuedSamples.length > 0) {
        const queued = state.queuedSamples;
        state.queuedSamples = [];
        state.lastAppendedSequence = session.append(queued);
      }
      const result: StudioHokusaiLiveCanonicalResult = await session.finish();
      if (state.failed || hokusaiLiveStrokeRef.current !== state) {
        throw new Error("최종 질감 결과가 도착하기 전에 문서 표면이 변경되었습니다.");
      }
      const expectedSourceRevision = studioHokusaiSourceRevision(finished);
      const transaction = createStudioHokusaiLiveCanonicalTransaction({
        elements: withStudioHokusaiSource(
          studioPageElementsFromHistory(state.pageId),
          finished,
        ),
        sourceElementId: finished.id,
        expectedSourceRevision,
        canonicalImageId: uid(),
        result,
        mutationLocked:
          collaborationAccessRef.current.locked
          || activeSurfaceReviewLockedRef.current,
      });
      if (!transaction.ok) throw new Error(transaction.message);
      state.canonicalImageId = transaction.transaction.canonicalImageId;
      state.canonicalPngHash = result.receipt.pngHash;
      state.transactionCommitted = true;
      const committed = commit(
        [...transaction.transaction.nextElements],
        undefined,
        state.pageId,
      );
      if (!committed) {
        state.transactionCommitted = false;
        state.canonicalImageId = null;
        state.canonicalPngHash = null;
        throw new Error("문서가 저장 중이거나 잠겨 있어 단일 Hokusai 트랜잭션을 확정하지 못했습니다.");
      }
      if (currentPageIdRef.current === state.pageId) {
        // Automatic brush materialization must not switch the editor into image-selection chrome.
        // That contextual row changes the viewport's DOM offset while the pointer-up frame is
        // being handed to the canonical PNG, making a stationary stroke appear to jump. Keep the
        // drawing context stable; artists can explicitly select the materialized image afterward.
        setSelectedId(null);
      }
      announceDrawingShortcut("Hokusai 자연매체 획 저장 완료");
      // StudioKonvaImageNode will release the material overlay only after the exact PNG is decoded
      // and synchronously painted into the main layer. Until then the receipted live pixels stay
      // visible; there is deliberately no requestAnimationFrame timeout handoff here.
    } catch (cause) {
      // Explicit cancel, route unmount, or an already committed transaction must never be turned
      // into a late second history entry by the async rejection path.
      if (
        (state.abortController.signal.aborted && hokusaiLiveStrokeRef.current !== state)
        || state.transactionCommitted
      ) return;
      commitStudioHokusaiFallbackVector(
        state,
        finished,
        cause instanceof Error ? cause.message : "최종 질감 결과를 검증하지 못했습니다.",
      );
    }
  }

  function sealStudioDrawReleaseInput(
    stage: Konva.Stage | null,
    pointerEvent: PointerEvent,
    consumeReleaseSample: boolean,
  ): DrawEl | null {
    const inputSettings = drawingInputSettingsRef.current;
    let authoritativeLiveStroke: DrawEl | null = null;
    if (
      consumeReleaseSample
      && drawingRef.current
      && (drawingRef.current.kind ?? "freehand") !== "freehand"
      && stage
    ) {
      updateActiveShapeEndpoint(stage, pointerEvent, false);
    }
    const releaseLastContactPressure = drawingRef.current?.pressures?.at(-1)
      ?? studioInkFallbackPressure(drawingRef.current?.pressureModel);
    if (
      consumeReleaseSample
      && drawingRef.current
      && (drawingRef.current.kind ?? "freehand") === "freehand"
      && stage
    ) {
      consumeFreehandPointerBatch(stage, pointerEvent, false, {
        dispatchedPressureOverride: pointerEvent.pointerType === "pen"
          ? resolveStudioBrushReleasePressure({
              brushId: drawingRef.current.brush,
              pointerType: "pen",
              rawPressure: pointerEvent.pressure,
              lastContactPressure: releaseLastContactPressure,
              pressureCurve: inputSettings?.pressureCurve ?? pressureCurve,
              pressureMinSize: inputSettings?.pressureMinSize ?? pressureMinSize,
              fallbackPressure: releaseLastContactPressure,
            })
          : undefined,
        authoritativeSource: "parent-only",
      });
    }
    if (drawingRef.current && (drawingRef.current.kind ?? "freehand") === "freehand") {
      // The release coordinate above has already been published. Stabilizer endpoint/drain
      // samples are locally generated, so publish only that suffix before finalizing the stroke.
      const crdtReleaseSampleStart = Math.floor(drawingRef.current.points.length / 2);
      const fixedRateState = drawingFixedRateFilterRef.current;
      if (fixedRateState) {
        const released = transitionFixedRateStrokeFilter(fixedRateState, { type: "release" });
        drawingFixedRateFilterRef.current = released.state;
        // Geometry and paint complete in the pointerup task. Deferring only the pixels across
        // rAF made a released stroke continue changing while the next stroke had already begun.
        appendFixedRateStrokeSamples(released.emitted, pointerEvent, 0);
      } else {
        const liveState = drawingStabilizerRef.current;
        const flushed =
          drawingPrecisionStabilizerBridgeRef.current?.flush()
          ?? (liveState ? flushStudioStrokeStabilizerEndpoint(liveState) : null);
        if (flushed) {
          drawingStabilizerRef.current = flushed.state;
          const current = drawingRef.current;
          const endpointPlan = planStudioPointerReleaseEndpoint({
            stroke: current,
            endpoint: { x: flushed.point[0], y: flushed.point[1] },
            pointer: releaseEndpointPointerSample(pointerEvent, current),
            pressureCurve: inputSettings?.pressureCurve ?? pressureCurve,
            pressureMinSize: inputSettings?.pressureMinSize ?? pressureMinSize,
          });
          if (endpointPlan.appended) drawingRef.current = endpointPlan.stroke;
        } else if (drawingThinLineInkInputRef.current) {
          const thinLineFlush = flushStudioThinLineInkInput(drawingThinLineInkInputRef.current);
          drawingThinLineInkInputRef.current = thinLineFlush.state;
          const current = drawingRef.current;
          const endpointPlan = planStudioPointerReleaseEndpoint({
            stroke: current,
            endpoint: { x: thinLineFlush.x, y: thinLineFlush.y },
            pointer: releaseEndpointPointerSample(pointerEvent, current),
            pressureCurve: inputSettings?.pressureCurve ?? pressureCurve,
            pressureMinSize: inputSettings?.pressureMinSize ?? pressureMinSize,
          });
          if (endpointPlan.appended) drawingRef.current = endpointPlan.stroke;
        }
      }
      if (drawingRef.current) {
        appendDrawingCrdtSampleSuffix(drawingRef.current, crdtReleaseSampleStart);
        appendStudioLivingInkAuthoritativeSuffix(
          drawingRef.current,
          crdtReleaseSampleStart,
        );
        appendStudioHokusaiAuthoritativeSuffix(
          drawingRef.current,
          crdtReleaseSampleStart,
        );
      }
      const causalPostCorrection = causalPostCorrectionStateRef.current;
      if (drawingRef.current && causalPostCorrection?.phase === "active") {
        const sourceSampleCount = Math.floor(drawingRef.current.points.length / 2);
        if (sourceSampleCount > causalPostCorrection.sourceSampleCount) {
          appendCausalPostCorrectionState(
            drawingRef.current,
            causalPostCorrection.sourceSampleCount
          );
        }
        drawingRef.current = sealCausalPostCorrectionState(drawingRef.current);
      }
      authoritativeLiveStroke = drawingRef.current;
      // release/coalesced sample과 stabilizer endpoint를 live surface에 동기적으로 반영한다.
      // clearDraftPreview가 예약 rAF를 취소하기 전에 이 호출이 반드시 완료되어야 한다.
      flushDirectLiveDraftNow(authoritativeLiveStroke);
      drawingCrdtPublisherRef.current.flush(authoritativeLiveStroke.id);
    }
    // Shapes do not append freehand suffixes, but their deferred begin must still precede the
    // final scene publication (or deletion of an intentionally incomplete gesture).
    if (drawingRef.current) {
      drawingCrdtPublisherRef.current.flush(drawingRef.current.id);
    }
    return authoritativeLiveStroke;
  }
  function finishStudioSpecialistStroke(
    finished: DrawEl,
  ): "ordinary" | "handled" | "handled-preserve-ink" {
    const livingInkStroke = livingInkStrokeRef.current;
    if (livingInkStroke?.strokeId === finished.id) {
      if (!livingInkStroke.failed) {
        appendStudioLivingInkAuthoritativeSuffix(
          finished,
          livingInkStroke.forwardedSampleCount,
        );
        livingInkStroke.finalDrawing = finished;
        livingInkStroke.finishing = true;
        livingInkFinalizingRef.current = true;
        setLivingInkBusy(true);
        void finishStudioLivingInkStroke(livingInkStroke, finished);
        return "handled-preserve-ink";
      }
      if (studioLivingInkFailureDisposition(livingInkStroke.mode) === "preserve-document-noop") {
        completeStudioLivingInkWaterNoop(
          livingInkStroke.strokeId,
          "물리 계산 또는 표시 영수증이 중단되었습니다.",
        );
        return "handled";
      }
      livingInkStrokeRef.current = null;
      livingInkOverlayVisibleRef.current = false;
      studioStrokeSurfaceRouteRef.current = null;
    }
    const hokusaiStroke = hokusaiLiveStrokeRef.current;
    if (hokusaiStroke?.strokeId === finished.id) {
      if (!hokusaiStroke.failed) {
        appendStudioHokusaiAuthoritativeSuffix(
          finished,
          hokusaiStroke.forwardedSampleCount,
        );
        hokusaiStroke.finalDrawing = finished;
        hokusaiStroke.finishing = true;
        hokusaiLiveFinalizingRef.current = true;
        // session.finish() waits for the latest appended sequence to be presented and acknowledged
        // before it posts the canonical finish. The bounded vector tail remains fail-visible during
        // that async handshake, including a stabilizer endpoint appended on pointer-up.
        void finishStudioHokusaiLiveStroke(hokusaiStroke, finished);
        return "handled-preserve-ink";
      }
      // A boundary/Worker/surface failure already restored the exact retained DrawEl. From
      // here the ordinary synchronous commit path owns this whole stroke.
      hokusaiLiveStrokeRef.current = null;
      hokusaiLiveOverlayVisibleRef.current = false;
    }
    return "ordinary";
  }
  function finishDrawingPointer(
    stage: Konva.Stage | null,
    pointerEvent: PointerEvent,
    options: { consumeReleaseSample?: boolean } = {}
  ) {
    if (!drawingRef.current && !requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession()) return;
    const finishingStrokeId = drawingRef.current?.id ?? null;
    let completedLiveStrokeBackendAudit = false;
    let gesturePreviewFinished = false;
    const inputSettings = drawingInputSettingsRef.current;
    stopFixedRateStrokePump();
    if (
      options.consumeReleaseSample !== false
      && quickShapeActive
      && (drawingRef.current?.kind ?? "freehand") === "freehand"
      && stage
    ) {
      stage.setPointersPositions(pointerEvent);
      const releasePoint = stage.getRelativePointerPosition();
      if (releasePoint) noteQuickShapePointerMoved(releasePoint);
    }
    const quickShapeSnapshot = snapshotQuickShapeTracking();
    // 지연 커밋 경로에서만 true — finally 의 초안 정리가 라이브 잉크를 표면에 남기게 한다.
        let deferInkCleanup = false;
        // GPU 지연 표면에는 후보정 이전의, 실제 라이브 표면과 동일한 권위 획을 유지한다.
        let authoritativeLiveStroke: DrawEl | null;
        // Release-planner geometry used to reauthor settled live ink before handoff (anti-flicker).
        let releaseAuthoritativeStroke: DrawEl | null = null;
        let immediateSurfaceHandoff: { pageId: string; strokeIds: string[] } | null = null;
        try {
      authoritativeLiveStroke = sealStudioDrawReleaseInput(
        stage,
        pointerEvent,
        options.consumeReleaseSample !== false,
      );
      if (authoritativeLiveStroke) {
        // Seal the upstream InProgressStroke from hardware-backed DrawEl samples only. The mesh
        // canvas is cleared immediately afterwards; normal release planning still owns document
        // commit, anti-flicker handoff, and every settled pixel.
        inkMeshLivePreviewRuntimeRef.current?.finish(
          authoritativeLiveStroke,
          liveBrushPressureSamplesFor(authoritativeLiveStroke),
        );
      } else {
        inkMeshLivePreviewRuntimeRef.current?.cancel();
      }
      if (drawingRef.current && isCompleteStudioDrawOp(drawingRef.current)) {
        const completedDrawing = drawingRef.current;
        completedLiveStrokeBackendAudit = true;
        const overlayRenderer = liveInkOverlayRendererRef.current;
        const releasePostCorrectionStrength = inputSettings?.postCorrection ?? postCorrection;
        const releasePreserveCorners = inputSettings?.preserveCorners ?? preserveCorners;
        const releaseCausalStateSealed = causalPostCorrectionStateRef.current?.phase === "sealed";
        const deferredPostprocessPlan = planStudioDeferredStrokePostprocess({
          stroke: completedDrawing,
          strength: releasePostCorrectionStrength,
          causalStateSealed: releaseCausalStateSealed,
          quickShapeActive,
          workerAvailable: typeof Worker === "function",
        });
        const planRelease = (postCorrectionStrength: number) => planStudioDrawPointerRelease({
          stroke: completedDrawing,
          quickShape: {
            active: quickShapeActive,
            ...quickShapeSnapshot,
          },
          postCorrection: {
            strength: postCorrectionStrength,
            preserveCorners: releasePreserveCorners,
            causalStateSealed: releaseCausalStateSealed,
          },
          commit: {
            masterEditMode,
            directLiveDraft: liveDraftDirectRef.current,
            directInkSurfaceAvailable:
              overlayRenderer.isActive
              || gpuLiveInkPinnedRef.current
              || liveDynamicBrushOverlayRendererRef.current.isActive
              || liveRetainedMediaOverlayRendererRef.current.isActive
              || liveWetInkOverlayRendererRef.current.isActive,
          },
        });
        // Worker-worthy post-correction can leave pointerup only when the exact live draft already
        // owns the 200ms deferred-commit window. Immediate tools retain synchronous semantics.
        let releasePlan = planRelease(deferredPostprocessPlan ? 0 : releasePostCorrectionStrength);
        if (deferredPostprocessPlan && releasePlan.commitMode !== "deferred") {
          releasePlan = planRelease(releasePostCorrectionStrength);
        }
        const finished = releasePlan.stroke;
        gesturePreviewFinished = drawingGesturePreviewPublisherRef.current.end(finished);
        if (livingInkWaterNoopStrokeIdsRef.current.has(finished.id)) {
          completeStudioLivingInkWaterNoop(
            finished.id,
            "물리 route가 시작 전에 거부되었습니다.",
          );
          return;
        }
        if (hasStudioCanonicalVNextQualityShadowRuntime()) {
          // Explicitly opted-in material providers receive the exact final DrawEl once for a
          // non-authoritative parity audit. Existing retained Studio pixels stay authoritative:
          // this shadow returns no presentation payload and cannot perform a renderer handoff.
          void submitStudioCanonicalVNextQualityShadowFinalParity({
            element: finished,
          }).catch(() => undefined);
        }
        releaseAuthoritativeStroke = finished;
        if (liveWetInkDraftDirectRef.current) {
          // Pointer-up post-correction may replace geometry after the last live append. Seal the
          // physical overlay from the exact DrawEl that will be committed, not the pre-correction
          // pointer snapshot, so handoff digest/endpoint cannot pop.
          liveDraftVisualRef.current = finished;
        }
        if (releasePlan.quickShapeAnnouncementKind) {
          const kind = releasePlan.quickShapeAnnouncementKind;
          announceDrawingShortcut(`스마트 도형 · ${QUICKSHAPE_KIND_LABELS[kind] ?? kind}`);
        }
        const specialistRelease = finishStudioSpecialistStroke(finished);
        if (specialistRelease !== "ordinary") {
          deferInkCleanup = specialistRelease === "handled-preserve-ink";
          return;
        }
        const deferCommit = releasePlan.commitMode === "deferred";
        if (deferCommit) {
          deferInkCleanup = true;
          if (!liveDraftDirectRef.current && finished.mode !== "eraser") {
            // 최종 형태(postCorrection·스마트도형 반영)를 settled 프리뷰로 유지한 채 커밋을 미룬다.
            draftPreviewStoreRef.current.settle(finished);
          }
          if (gpuLiveInkPinnedRef.current) {
            // Publish the sealed endpoint before preserveInk releases the active draft. Without
            // this sync, a short final stabilizer sample would exist only in the later Konva
            // commit and visibly pop in after the deferred interval.
            settleGpuLiveStroke(authoritativeLiveStroke ?? finished, finished);
          }
          queueDeferredStrokeCommit(finished);
          if (deferredPostprocessPlan) {
            queueDeferredStrokePostprocess(
              finished,
              deferredPostprocessPlan.normalizedStrength,
              releasePreserveCorners,
            );
          }
        } else {
          // Plan the bounded raster equivalent before the React commit, but keep the vector as a
          // durable fallback until a verified replay frame is ready. Panel-clipped/complex brushes
          // stay entirely on Konva so the migration never changes compositing semantics.
          const rasterWorkId = authorizedWorkAssetScopeId;
          const rasterDocument = studioCrdtDocumentRef.current;
          const rasterRuntime = studioCrdtSceneRuntimeRef.current;
          const rasterActorId = studioAuthUserId;
          const rasterPlan =
            STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED &&
            !masterEditMode && rasterWorkId && rasterDocument && rasterRuntime && rasterActorId &&
            studioCrdtOperationSyncReady &&
            !containingPanel(finished, elements)
              ? rasterRuntime.planRasterDrawPromotion({
                  element: finished,
                  pageId: activePage.id,
                  documentWidth: CANVAS_W,
                  documentHeight: canvasH,
                })
              : null;
          // 즉시 커밋 앞에 대기 배치가 있으면(같은 페이지) 같은 커밋에 합쳐 유실을 막는다.
          if (
            pendingStrokeCommitsRef.current
            && pendingStrokeCommitsRef.current.pageId !== activePage.id
          ) {
            flushPendingStrokeCommitsRef.current();
          }
          const merged = takePendingStrokeCommits();
          const baseElements = merged ? [...elements, ...merged.strokes] : elements;
          const committed = commit([...baseElements, finished]);
          if (committed && !masterEditMode && finished.mode !== "eraser") {
            if (liveDraftDirectRef.current) {
              deferInkCleanup = overlayRenderer.isActive
                || gpuLiveInkPinnedRef.current
                || liveDynamicBrushOverlayRendererRef.current.isActive
                || liveRetainedMediaOverlayRendererRef.current.isActive
                || liveWetInkOverlayRendererRef.current.isActive;
              if (gpuLiveInkPinnedRef.current) {
                settleGpuLiveStroke(authoritativeLiveStroke ?? finished, finished);
              }
              if (!deferInkCleanup) {
                // The live Canvas/WebGPU surface can be briefly unavailable during initial layout,
                // resize, or device fallback. Keep an exact settled Konva copy until the committed
                // main-layer draw receipt arrives instead of exposing a blank handoff frame.
                // Eraser dest-out remesh of the draft FIFO is a long task on an empty page.
                if (finished.mode !== "eraser") {
                  draftPreviewStoreRef.current.settle(finished);
                }
                deferInkCleanup = true;
              }
            } else {
              // 불투명도·도형 등 즉시 커밋 경로도 최종 초안을 실제 draw 영수증까지 유지한다.
              if (finished.mode !== "eraser") {
                draftPreviewStoreRef.current.settle(finished);
              }
              deferInkCleanup = true;
            }
          }
          if (!committed) {
            // A transient save/lock/CRDT publication race must not destroy the only completed
            // stroke. Requeue the new stroke together with any batch consumed above and retain its
            // exact live pixels until a later flush succeeds.
            restorePendingStrokeCommits({
              pageId: activePage.id,
              strokes: [...(merged?.strokes ?? []), finished],
              retryCount: merged?.retryCount ?? 0,
            });
            if (liveDraftDirectRef.current) {
              deferInkCleanup = true;
              if (gpuLiveInkPinnedRef.current) {
                settleGpuLiveStroke(authoritativeLiveStroke ?? finished, finished);
              } else if (
                !overlayRenderer.isActive
                && !liveDynamicBrushOverlayRendererRef.current.isActive
                && !liveRetainedMediaOverlayRendererRef.current.isActive
                && !liveWetInkOverlayRendererRef.current.isActive
                && finished.mode !== "eraser"
              ) {
                draftPreviewStoreRef.current.settle(finished);
              }
            } else {
              if (finished.mode !== "eraser") {
                draftPreviewStoreRef.current.settle(finished);
              }
              deferInkCleanup = true;
            }
          }
          if (committed && (merged || deferInkCleanup)) {
            immediateSurfaceHandoff = {
              pageId: activePage.id,
              strokeIds: [
                ...(merged?.strokes.map((stroke) => stroke.id) ?? []),
                finished.id,
              ],
            };
          }
          if (
            committed && rasterPlan && rasterWorkId && rasterDocument &&
            rasterRuntime && rasterActorId
          ) {
            queueStudioRasterDrawPromotion({
              plan: rasterPlan,
              pageId: activePage.id,
              layerId: (finished as DrawEl & { groupId?: string }).groupId ?? "page-root",
              workId: rasterWorkId,
              actorId: rasterActorId,
              document: rasterDocument,
              runtime: rasterRuntime,
              accessGeneration: collaborationAccessRef.current.accessGeneration,
            });
          }
          if (
            committed && merged &&
            STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED &&
            !masterEditMode && rasterWorkId && rasterDocument && rasterRuntime && rasterActorId &&
            studioCrdtOperationSyncReady
          ) {
            for (const strokeEl of merged.strokes) {
              if (containingPanel(strokeEl, elements)) continue;
              const plan = rasterRuntime.planRasterDrawPromotion({
                element: strokeEl,
                pageId: activePage.id,
                documentWidth: CANVAS_W,
                documentHeight: canvasH,
              });
              if (!plan) continue;
              queueStudioRasterDrawPromotion({
                plan,
                pageId: activePage.id,
                layerId: (strokeEl as DrawEl & { groupId?: string }).groupId ?? "page-root",
                workId: rasterWorkId,
                actorId: rasterActorId,
                document: rasterDocument,
                runtime: rasterRuntime,
                accessGeneration: collaborationAccessRef.current.accessGeneration,
              });
            }
          }
        }
      } else if (drawingRef.current && drawingCrdtStrokeActiveRef.current) {
        // Tiny geometric gestures below the intentional completion threshold are discarded locally.
        // Remove their streaming CRDT draft as well so a hidden `drawing` record cannot reappear on
        // reconnect or pollute the shared frontier.
        try {
          studioCrdtDocumentRef.current?.deleteStroke(drawingRef.current.id);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? `미완성 획 정리: ${cause.message}`
              : "미완성 실시간 획을 정리하지 못했습니다."
          );
        }
      }
    } finally {
      if (!gesturePreviewFinished) {
        drawingGesturePreviewPublisherRef.current.cancel(finishingStrokeId ?? undefined);
      }
      // Always clear the hold timer after commit/promote so a second pointerup cannot re-use it.
      stopQuickShapeTracking();
      if (finishingStrokeId) livingInkWaterNoopStrokeIdsRef.current.delete(finishingStrokeId);
      // No error or stale tool ref may strand DOM capture or a predicted RAF after the stroke ends.
      releaseDrawingPointerSession();
      drawingRef.current = null;
      companionRuntimeRef.current?.schedulePublish();
      perspectiveRayRef.current = null;
      isometricAxisRayRef.current = null;
      advancedRulerSnapRef.current = null;
      scheduleLiveDrawPressure(null);
      applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
      strokeObjectSnapCacheRef.current = null;
      freehandObjectSnapLatchRef.current = EMPTY_FREEHAND_OBJECT_SNAP_LATCH;
      gpuFinalFallbackOrderIdsRef.current = immediateSurfaceHandoff?.strokeIds ?? null;
      finalizeLiveStrokeBackendAudit(
        finishingStrokeId,
        completedLiveStrokeBackendAudit && deferInkCleanup
      );
      clearDraftPreview({ preserveInkForDeferredCommit: deferInkCleanup });
      const finishingLivingInk = livingInkStrokeRef.current;
      if (
        deferInkCleanup
        && finishingLivingInk?.finishing
        && finishingLivingInk.finalDrawing
        && !finishingLivingInk.overlayPresented
      ) {
        // A short contact can finish before the Worker presents even its first material frame.
        // Restore the exact vector in the same pointer-up task and retire it only on a real frame
        // or canonical-image receipt; otherwise the async finish window contains a blank canvas.
        showStudioLivingInkVectorShadow(
          finishingLivingInk.finalDrawing,
          finishingLivingInk.pageId,
        );
      }
      const finishingHokusai = hokusaiLiveStrokeRef.current;
      if (
        deferInkCleanup
        && finishingHokusai?.finishing
        && finishingHokusai.finalDrawing
      ) {
        if (!finishingHokusai.overlayPresented) {
          // A fast pointer-up can outrun Hokusai's first dirty frame. Restore the exact retained
          // vector synchronously, then relinquish it only when a real material frame owns pixels.
          showStudioHokusaiVectorShadow(
            finishingHokusai.finalDrawing,
            finishingHokusai.pageId,
          );
        } else {
          refreshStudioHokusaiVectorTailShadow(
            finishingHokusai,
            finishingHokusai.finalDrawing,
          );
        }
      }
      // Re-rasterize the newest settled overlay stroke from the release-planner geometry so the
      // live Canvas footprint matches Konva/causal planning before committed-ink handoff. Without
      // this, residual thinning / endpoint promotion can leave a one-frame pop when settled ink is
      // released after mainLayer.draw().
      // Pressures must use the same brush-alias live channel as appendFrom / Konva causal dabs —
      // raw DrawEl.pressures make alias brushes flash a different radius at pointerup.
      if (
        deferInkCleanup
        && releaseAuthoritativeStroke
        && releaseAuthoritativeStroke.mode !== "eraser"
        && liveInkOverlayRendererRef.current.hasSettledStrokes
      ) {
        liveInkOverlayRendererRef.current.reauthorLastSettledFromDocumentPoints({
          style: liveInkStyleFor(releaseAuthoritativeStroke),
          points: releaseAuthoritativeStroke.points,
          pressures: liveBrushPressureSamplesFor(releaseAuthoritativeStroke),
        });
      }
      if (immediateSurfaceHandoff) {
        queueCommittedStrokeSurfaceHandoff(
          immediateSurfaceHandoff.pageId,
          immediateSurfaceHandoff.strokeIds
        );
      }
      endLiveResourceEdit();
      // 획 시작이 보류시킨 배치 타이머를 반드시 복원한다(불완전 획으로 끝나도 배치가
      // 영원히 대기하지 않도록). 큐잉이 방금 타이머를 잡았다면 여기서는 건드리지 않는다.
      const strandedBatch = pendingStrokeCommitsRef.current;
      if (strandedBatch && strandedBatch.timer === null) {
        strandedBatch.timer = globalThis.setTimeout(function flushStrandedDeferredStrokeCommit() {
          const current = pendingStrokeCommitsRef.current;
          if (!current) return;
          if (drawingRef.current) {
            current.timer = globalThis.setTimeout(
              flushStrandedDeferredStrokeCommit,
              DEFERRED_STROKE_COMMIT_IDLE_MS,
            );
            return;
          }
          flushPendingStrokeCommitsRef.current();
        }, DEFERRED_STROKE_COMMIT_IDLE_MS);
      }
    }
  }
  function onStagePointerCancel(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const pointerEvent = e.evt as PointerEvent;
    hideBrushCursor();
    if (groupResizeRef.current) {
      cancelCanvasSelectionResize();
      return;
    }
    if (liquifyHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (pixelSelectionHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (requireStudioDrawingPointerTransport(drawingPointerTransportRef).consumeHandledNativeEnd(pointerEvent)) return;
    if (pendingRasterRetouchGestureRef.current) {
      if (!finishPendingRasterRetouchGesture(pointerEvent, true, e.target.getStage())) return;
      return;
    }
    const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
    // Drawing owns its matching cancel before any stale tool session can early-return. A foreign
    // pointer (typically a palm) cannot cancel the pen that opened the stroke.
    const drawingPointerSession = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    if (drawingRef.current || drawingPointerSession) {
      if (drawingPointerSession && !isStudioStrokePointerEvent(drawingPointerSession, pointerEvent)) {
        return;
      }
      if (
        drawingPointerSession
        && shouldCommitStudioStrokeOnPointerCancel(drawingPointerSession, pointerEvent)
      ) {
        finishDrawingPointer(e.target.getStage(), pointerEvent, { consumeReleaseSample: false });
      } else {
        discardDrawingPointerSession();
      }
      return;
    }
    if (liquifyDragRef.current) {
      if (!isStudioLiquifyPointerOwner(liquifyDragRef.current, pointerEvent)) return;
      finishLiquifyPointerSession(pointerEvent, true, e.target.getStage());
      return;
    }
    if (pixelDragRef.current) {
      if (!finishPixelSelectionPointerSession(pointerEvent, true)) return;
      return;
    }
    if (bubbleShapeDragRef.current) {
      if (bubbleShapeDragRef.current.pointerId !== pointerId) return;
      releaseBubbleShapePointerCapture(bubbleShapeDragRef.current);
      bubbleShapeDragRef.current = null;
      pendingBubbleShapeDraftRef.current = null;
      if (bubbleShapeRafRef.current !== null) {
        globalThis.cancelAnimationFrame(bubbleShapeRafRef.current);
        bubbleShapeRafRef.current = null;
      }
      setBubbleShapeDraft(null);
      return;
    }
    const current = advancedFillTapGestureRef.current;
    if (current) {
      const outcome = endStudioAdvancedFillTap(current, pointerId, true);
      advancedFillTapGestureRef.current = outcome.gesture;
      if (advancedFillTouchPanRef.current?.pointerId === pointerId) {
        advancedFillTouchPanRef.current = null;
      }
      if (!outcome.gesture) advancedFillTapPayloadRef.current = null;
      return;
    }
    if (cancelCanvasGroupDrag()) return;
  }

  function onStageUp(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const pointerEvent = e.evt as PointerEvent;
    // Flush freehand auto-color scribble samples collected during the drag.
    const scribbleStroke = autoColorScribbleStrokeRef.current;
    if (scribbleStroke) {
      autoColorScribbleStrokeRef.current = null;
      const planSize = autoColorPlanImageSizeRef.current;
      const image = selected?.type === "image" ? selected : null;
      if (planSize && image && scribbleStroke.points.length >= 4) {
        const samples = sampleStudioAutoColorStrokeSeeds({
          documentPoints: scribbleStroke.points,
          image: {
            x: image.x,
            y: image.y,
            width: image.width,
            height: image.height,
            rotation: image.rotation,
            flipped: image.flipped,
            flippedY: image.flippedY,
          },
          pixelWidth: planSize.width,
          pixelHeight: planSize.height,
        });
        // Skip the first sample (already emitted on pointerdown as a single hit).
        const rest = samples.slice(1);
        if (rest.length > 0) {
          const hits = rest.map((sample) => {
            autoColorCanvasSeedNonceRef.current += 1;
            return {
              x: sample.x,
              y: sample.y,
              nonce: autoColorCanvasSeedNonceRef.current,
            };
          });
          setAutoColorCanvasSeedHit(null);
          setAutoColorCanvasSeedHits(hits);
        }
      }
      return;
    }
    if (liquifyHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (pixelSelectionHandledNativeEndEventsRef.current.delete(pointerEvent)) return;
    if (requireStudioDrawingPointerTransport(drawingPointerTransportRef).consumeHandledNativeEnd(pointerEvent)) return;
    if (pendingRasterRetouchGestureRef.current) {
      if (!finishPendingRasterRetouchGesture(pointerEvent, false, e.target.getStage())) return;
      return;
    }
    const drawingPointerSession = requireStudioDrawingPointerTransport(drawingPointerTransportRef).getSession();
    if (drawingRef.current || drawingPointerSession) {
      if (!drawingPointerSession) {
        // Defensive HMR/legacy state: ownership is unknown, so discard rather than committing an
        // arbitrary pointer's draft. Normal sessions always have both refs.
        discardDrawingPointerSession();
        return;
      }
      if (!isStudioStrokePointerEvent(drawingPointerSession, pointerEvent)) {
        // A secondary touch ending must not stop QuickShape, commit, or discard the active pen.
        return;
      }
      if (colorWheelTimerRef.current) {
        clearTimeout(colorWheelTimerRef.current);
        colorWheelTimerRef.current = null;
      }
      // Handle drawing before every other tool's early-return branch. Even a stale marquee/crop ref
      // cannot intercept pointerup and leak capture; finishDrawingPointer always cleans up in finally
      // (including QuickShape timer stop after promote snapshot).
      finishDrawingPointer(e.target.getStage(), pointerEvent);
      updateBrushCursor(e.target.getStage(), pointerEvent);
      return;
    }
    if (liquifyDragRef.current) {
      if (!isStudioLiquifyPointerOwner(liquifyDragRef.current, pointerEvent)) return;
      finishLiquifyPointerSession(pointerEvent, false, e.target.getStage());
      return;
    }
    if (pixelDragRef.current) {
      if (!finishPixelSelectionPointerSession(pointerEvent, false)) return;
      return;
    }
    stopQuickShapeTracking(); // 드로잉이 아닌 경로 — 잔여 인터벌만 정리.
    // 색상 휠 롱프레스 타이머가 아직 안 터졌는데 포인터를 뗐다 — 평범한 클릭/드래그였다는 뜻이니
    // 타이머만 정리한다(이미 열려 있었다면 오버레이가 이벤트를 가로채서 애초에 여기까지 안 온다).
    if (colorWheelTimerRef.current) {
      clearTimeout(colorWheelTimerRef.current);
      colorWheelTimerRef.current = null;
    }
    if (advancedFillTapGestureRef.current) {
      const pointerEvent = e.evt as PointerEvent;
      const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      const moved = clientPoint
        ? moveStudioAdvancedFillTap(advancedFillTapGestureRef.current, pointerId, clientPoint)
        : advancedFillTapGestureRef.current;
      const outcome = endStudioAdvancedFillTap(moved, pointerId);
      advancedFillTapGestureRef.current = outcome.gesture;
      if (advancedFillTouchPanRef.current?.pointerId === pointerId) {
        advancedFillTouchPanRef.current = null;
      }
      const payload = advancedFillTapPayloadRef.current;
      if (!outcome.gesture) advancedFillTapPayloadRef.current = null;
      if (outcome.execute && payload && !advancedFillAbortRef.current) {
        void runAdvancedFillAt(payload.position, payload.frame);
      }
      return;
    }
    if (advancedFillArmed) return;
    // 크롭 드래그 종료 — 마지막 RAF 대기분을 반영하고 세션만 닫는다(rect 는 적용 전까지 유지).
    if (cropDragRef.current) {
      cropDragRef.current = null;
      flushCropRect();
      return;
    }
    // 패널 손그림 컷 드래그 종료 — 마지막 절단선으로 실제 분할을 확정한다. 도구는 계속 무장된
    // 채로 둔다(크롭과 달리 의도적 — 연속으로 여러 컷을 이어서 그릴 수 있게).
    if (panelSplitDragRef.current) {
      const session = panelSplitDragRef.current;
      panelSplitDragRef.current = null;
      flushPanelSplitPreview();
      const line = panelSplitLastLineRef.current;
      const frame = elements.find((el) => el.id === session.targetFrameId);
      if (
        line &&
        frame &&
        frame.type === "frame" &&
        !activeSurfaceReviewLocked &&
        !isEffectivelyLocked(frame, groups)
      ) {
        const plan = planPanelSplit({ frame, line, gutterPx: panelGutter });
        if (plan) {
          // frame 을 먼저 펼치고 plan.shape* 로 덮어써야 shapeA/B 의 항상-존재하는 points 키(뒤집힌
          // 사각형일 때도 undefined 로 명시)가 원본 frame 의 남은 points 를 확실히 지운다.
          const shapeA = { ...frame, ...plan.shapeA, id: uid() };
          const shapeB = { ...frame, ...plan.shapeB, id: uid() };
          commit([...elements.filter((e) => e.id !== frame.id), shapeA, shapeB]);
          setSelectedId(shapeA.id);
        } else {
          setPanelSplitHint(
            panelSplitPreview
              ? "여백을 적용하면 한쪽 칸이 너무 작아져요. 여백을 줄이거나 더 넓게 갈라보세요."
              : "선이 패널을 가로지르지 않았어요. 패널 양쪽 변을 관통하도록 다시 그어보세요."
          );
        }
      }
      panelSplitLastLineRef.current = null;
      setPanelSplitPreview(null);
      return;
    }
    // 벡터 노드 편집 드래그 종료 — 커밋은 이 pointerup 틱에서 바로 일어나므로(리렌더를 기다리는
    // crop 의 "적용" 버튼과 다름) nodeEditDraft state 가 아니라 항상-최신인 ref 를 읽는다. state 를
    // 읽으면 React 의 비동기 업데이트 때문에 드래그의 마지막 프레임을 놓칠 수 있다.
    if (nodeEditDragRef.current) {
      const { elId } = nodeEditDragRef.current;
      nodeEditDragRef.current = null;
      if (nodeEditRafRef.current !== null) {
        globalThis.cancelAnimationFrame(nodeEditRafRef.current);
        nodeEditRafRef.current = null;
      }
      const finalDraft = pendingNodeEditDraftRef.current;
      pendingNodeEditDraftRef.current = null;
      setNodeEditDraft(null);
      const current = elementById.get(elId);
      if (
        finalDraft &&
        finalDraft.elId === elId &&
        current?.type === "draw" &&
        !activeSurfaceReviewLocked &&
        !isEffectivelyLocked(current, groups)
      ) {
        patchEl(elId, { points: finalDraft.points, pressures: finalDraft.pressures } as Partial<El>);
      }
      return;
    }
    // 말풍선 커스텀 모양 점 드래그 종료 — nodeEdit과 동일하게 이 pointerup 틱에서 ref로 바로
    // 커밋한다(state는 비동기라 마지막 프레임을 놓칠 수 있다).
    if (bubbleShapeDragRef.current) {
      const pointerId = Number.isFinite(pointerEvent.pointerId) ? pointerEvent.pointerId : 1;
      if (bubbleShapeDragRef.current.pointerId !== pointerId) return;
      const { elId, session } = bubbleShapeDragRef.current;
      releaseBubbleShapePointerCapture(bubbleShapeDragRef.current);
      bubbleShapeDragRef.current = null;
      if (bubbleShapeRafRef.current !== null) {
        globalThis.cancelAnimationFrame(bubbleShapeRafRef.current);
        bubbleShapeRafRef.current = null;
      }
      const finalDraft = pendingBubbleShapeDraftRef.current;
      pendingBubbleShapeDraftRef.current = null;
      setBubbleShapeDraft(null);
      const current = elementById.get(elId);
      if (
        finalDraft &&
        finalDraft.elId === elId &&
        current?.type === "bubble" &&
        !activeSurfaceReviewLocked &&
        !isEffectivelyLocked(current, groups)
      ) {
        const pointOffset = session.pointIndex * 2;
        const moved = moveBubbleShapePoint(
          current.customShapePoints ?? [],
          session.pointIndex,
          finalDraft.points[pointOffset],
          finalDraft.points[pointOffset + 1]
        );
        if (moved.changed) {
          patchEl(elId, { customShapePoints: moved.points } as Partial<El>);
          setBubbleShapeSelectedPointIndex(session.pointIndex);
        }
      }
      return;
    }
    // 문지르기 드래그 종료 — 누적된 좌표로 실제 픽셀 스트로크를 적용한다.
    if (smudgeDragRef.current) {
      const session = smudgeDragRef.current;
      smudgeDragRef.current = null;
      clearPaintRetouchStrokePreview();
      if (session.points.length >= 2) {
        void applySmudgeStroke(
          session.elId,
          thinStudioRasterRetouchPointsForApply(session.points),
        );
      }
      return;
    }
    // 닷지/번 드래그 종료 — 누적된 좌표로 실제 픽셀 보정을 적용한다(탭 1점도 도장 1개로 유효).
    if (dodgeBurnDragRef.current) {
      const session = dodgeBurnDragRef.current;
      dodgeBurnDragRef.current = null;
      clearPaintRetouchStrokePreview();
      if (session.points.length >= 1) {
        void applyDodgeBurnStroke(
          session.elId,
          thinStudioRasterRetouchPointsForApply(session.points),
        );
      }
      return;
    }
    // 혼색 브러시 드래그 종료 — 누적된 좌표로 혼색 스트로크를 적용한다(탭 1점도 도장 1개).
    if (wetMixDragRef.current) {
      const session = wetMixDragRef.current;
      wetMixDragRef.current = null;
      clearPaintRetouchStrokePreview();
      if (session.points.length >= 1) {
        void applyWetMixStroke(
          session.elId,
          thinStudioRasterRetouchPointsForApply(session.points),
        );
      }
      return;
    }
    // 퀵 마스크 드래그 종료 — 스트로크당 1회만 마스크에 굽고 틴트 캔버스를 교체(핫패스 계약).
    if (quickMaskDragRef.current) {
      const session = quickMaskDragRef.current;
      quickMaskDragRef.current = null;
      clearQuickMaskDragPreview();
      const qm = quickMaskSessionRef.current;
      if (qm && session.elId === qm.elId && session.points.length > 0) {
        applyMaskStrokeDabs(
          qm.mask,
          qm.maskW,
          qm.maskH,
          session.points.map((p) => ({ x: p.x * qm.maskW, y: p.y * qm.maskH })),
          {
            radius: Math.max(1, quickMaskRadius * qm.featherScale),
            hardness: quickMaskHardness,
            opacity: quickMaskOpacity,
            mode: quickMaskBrushMode,
          }
        );
        refreshQuickMaskTint();
      }
      return;
    }
    // 레이어 마스크 브러시 드래그 종료 — 누적된 좌표로 실제 마스크 스트로크를 굽는다.
    if (layerMaskDragRef.current) {
      const session = layerMaskDragRef.current;
      layerMaskDragRef.current = null;
      clearLayerMaskDragPreview();
      if (session.points.length > 0) void bakeLayerMaskPaintStroke(session);
      return;
    }
    // 필터 마스크 브러시 드래그 종료 — 누적된 좌표로 실제 마스크 스트로크를 굽는다.
    if (filterMaskDragRef.current) {
      const session = filterMaskDragRef.current;
      filterMaskDragRef.current = null;
      clearFilterMaskDragPreview();
      if (session.points.length > 0) void bakeFilterMaskPaintStroke(session);
      return;
    }
    // 복구 브러시/도장 드래그 종료 — 누적된 좌표로 dab 목록을 계산해 굽는다.
    if (healCloneDragRef.current) {
      const session = healCloneDragRef.current;
      healCloneDragRef.current = null;
      clearHealCloneDragPreview();
      if (session.points.length > 0) void bakeHealCloneDragStroke(session);
      return;
    }
    // 히스토리 브러시 드래그 종료 — 누적된 좌표로 dab 목록을 계산해 굽는다.
    if (historyBrushDragRef.current) {
      const session = historyBrushDragRef.current;
      historyBrushDragRef.current = null;
      clearHistoryBrushDragPreview();
      if (session.points.length > 0) void bakeHistoryBrushDragStroke(session);
      return;
    }
    // 마퀴 드래그 종료: 박스와 겹치는(숨김·아닌) 요소를 한꺼번에 선택.
    if (marqueeStartRef.current) {
      const rect = pendingMarqueeRectRef.current;
      marqueeStartRef.current = null;
      clearMarqueePreview();
      if (rect && rect.w > 3 && rect.h > 3) {
        const hitIds = selectIdsByMarquee(
          elements,
          (el) => elBounds(el),
          rect,
          { include: (el) => !isEffectivelyHidden(el, groups) }
        );
        const ids = expandSelectionIdsToGroupUnits(
          elements,
          groups,
          hitIds,
          activeGroupIdRef.current
        );
        applyGroupSelectionState({
          ...selectionShapeForIds(ids),
          activeGroupId: activeGroupIdRef.current,
        });
      }
      return;
    }
  }
  function drawBrushCursorLayer(deferToFrame: boolean) {
    if (!deferToFrame) {
      if (brushCursorDrawRafRef.current !== null) {
        globalThis.cancelAnimationFrame(brushCursorDrawRafRef.current);
        brushCursorDrawRafRef.current = null;
      }
      (brushCursorRef.current?.getLayer() ?? strokeGuideRef.current?.getLayer())?.drawScene();
      return;
    }
    if (brushCursorDrawRafRef.current !== null) return;
    brushCursorDrawRafRef.current = globalThis.requestAnimationFrame(() => {
      brushCursorDrawRafRef.current = null;
      (brushCursorRef.current?.getLayer() ?? strokeGuideRef.current?.getLayer())?.drawScene();
    });
  }
  function hideStrokeGuide(deferToFrame = false) {
    const guideNode = strokeGuideRef.current;
    if (!guideNode || !guideNode.visible()) return;
    guideNode.visible(false);
    drawBrushCursorLayer(deferToFrame);
  }
  function hideBrushCursorVisual(deferToFrame = false) {
    const cursorNode = brushCursorRef.current;
    if (cursorNode && cursorNode.visible()) {
      cursorNode.visible(false);
      drawBrushCursorLayer(deferToFrame);
    }
  }
  // 포인터가 캔버스를 벗어나면 브러시 커서와 안정화 보조선을 함께 숨긴다.
  function hideBrushCursor(deferToFrame = false) {
    const cursorNode = brushCursorRef.current;
    const guideNode = strokeGuideRef.current;
    let changed = false;
    if (cursorNode?.visible()) {
      cursorNode.visible(false);
      changed = true;
    }
    if (guideNode?.visible()) {
      guideNode.visible(false);
      changed = true;
    }
    if (changed) drawBrushCursorLayer(deferToFrame);
  }
  function updateStrokeGuide(
    pointerX: number,
    pointerY: number,
    deferToFrame = false,
  ) {
    const guideNode = strokeGuideRef.current;
    if (!guideNode) return;
    const drawing = drawingRef.current;
    const points = drawing?.points;
    const inputSettings = drawingInputSettingsRef.current;
    if (
      !drawing
      || !points
      || points.length < 2
      || !Number.isFinite(pointerX)
      || !Number.isFinite(pointerY)
      || pointerX < 0
      || pointerX > CANVAS_W
      || pointerY < 0
      || pointerY > canvasH
      || tool !== "draw"
      || !isStudioBrushCursorMode(drawing.mode ?? drawMode)
      || (drawing.kind ?? "freehand") !== "freehand"
      || isExporting
      || isSpacePressed
      || isPanning
    ) {
      hideStrokeGuide(deferToFrame);
      return;
    }
    const inkX = points[points.length - 2]!;
    const inkY = points[points.length - 1]!;
    const activeStabilizer = inputSettings?.stabilizer ?? stabilizer;
    const activeScale = normalizeStudioStrokeGuideScale(
      inputSettings?.coordinateScale ?? effScale,
    );
    if (!shouldShowStudioStrokeGuide(
      appSettingsRef.current.general.showStrokeGuide,
      true,
      activeStabilizer,
      activeScale,
      inkX,
      inkY,
      pointerX,
      pointerY,
    )) {
      hideStrokeGuide(deferToFrame);
      return;
    }

    let changed = false;
    if (
      strokeGuideMetricsNodeRef.current !== guideNode
      || strokeGuideMetricsScaleRef.current !== activeScale
    ) {
      guideNode.strokeWidth(1.15 / activeScale);
      const dash = guideNode.dash();
      if (dash.length >= 2) {
        dash[0] = 4 / activeScale;
        dash[1] = 3 / activeScale;
        dash.length = 2;
      } else {
        // Defensive one-time repair for a host node created without the component's 2-value dash.
        guideNode.dash([4 / activeScale, 3 / activeScale]);
      }
      strokeGuideMetricsNodeRef.current = guideNode;
      strokeGuideMetricsScaleRef.current = activeScale;
      changed = true;
    }
    const geometry = guideNode.points();
    if (
      geometry.length !== 4
      || geometry[0] !== inkX
      || geometry[1] !== inkY
      || geometry[2] !== pointerX
      || geometry[3] !== pointerY
    ) {
      if (geometry.length === 4) {
        geometry[0] = inkX;
        geometry[1] = inkY;
        geometry[2] = pointerX;
        geometry[3] = pointerY;
      } else {
        // Defensive one-time repair; normal StudioBrushCursor nodes always start with four values.
        guideNode.points([inkX, inkY, pointerX, pointerY]);
      }
      changed = true;
    }
    if (!guideNode.visible()) {
      guideNode.visible(true);
      changed = true;
    }
    if (changed) drawBrushCursorLayer(deferToFrame);
  }
  function updateBrushCursor(
    stage: Konva.Stage | null,
    pointerEvent: PointerEvent,
    mappedPoint?: { x: number; y: number } | null,
    deferToFrame = false
  ) {
    const cursorNode = brushCursorRef.current;
    if (!cursorNode) return;
    if (
      tool !== "draw"
      || !isStudioBrushCursorMode(drawMode)
      || isSpacePressed
      || isPanning
    ) {
      hideBrushCursor(deferToFrame);
      return;
    }
    if (
      appSettingsRef.current.general.brushCursorStyle === "none"
      || !shouldShowStudioBrushCursor(pointerEvent.pointerType)
    ) {
      hideBrushCursorVisual(deferToFrame);
      return;
    }
    if (mappedPoint === undefined) stage?.setPointersPositions(pointerEvent);
    const cursorPos = mappedPoint === undefined
      ? stage?.getRelativePointerPosition()
      : mappedPoint;
    if (
      !cursorPos
      || cursorPos.x < 0
      || cursorPos.x > CANVAS_W
      || cursorPos.y < 0
      || cursorPos.y > canvasH
    ) {
      hideBrushCursor(deferToFrame);
      return;
    }
    cursorNode.position(cursorPos);
    if (!cursorNode.visible()) cursorNode.visible(true);
    drawBrushCursorLayer(deferToFrame);
  }
  function hideSmudgeCursor() {
    const cursorNode = smudgeCursorRef.current;
    if (cursorNode && cursorNode.visible()) {
      cursorNode.visible(false);
      cursorNode.getLayer()?.batchDraw();
    }
  }
  function hideHealCloneCursors() {
    const cursor = healCloneCursorRef.current;
    const srcCursor = healCloneSourceCursorRef.current;
    if (cursor?.visible()) cursor.visible(false);
    if (srcCursor?.visible()) srcCursor.visible(false);
    cursor?.getLayer()?.batchDraw();
  }
  function hideHistoryBrushCursor() {
    const cursor = historyBrushCursorRef.current;
    if (cursor?.visible()) cursor.visible(false);
    cursor?.getLayer()?.batchDraw();
  }
  function hideLayerMaskCursor() {
    const cursorNode = layerMaskCursorRef.current;
    if (cursorNode && cursorNode.visible()) {
      cursorNode.visible(false);
      cursorNode.getLayer()?.batchDraw();
    }
  }
  function hideFilterMaskCursor() {
    const cursorNode = filterMaskCursorRef.current;
    if (cursorNode && cursorNode.visible()) {
      cursorNode.visible(false);
      cursorNode.getLayer()?.batchDraw();
    }
  }

  function restoreGroupDragPreview(
    session: {
      id: string;
      x0: number;
      y0: number;
      selectedIds: string[];
    },
    deltaX: number,
    deltaY: number
  ) {
    const anchor = nodeRefsRef.current[session.id];
    if (!anchor) return;
    anchor.position({ x: session.x0, y: session.y0 });
    for (const id of session.selectedIds) {
      if (id === session.id) continue;
      const peer = nodeRefsRef.current[id];
      if (peer) {
        peer.x(peer.x() - deltaX);
        peer.y(peer.y() - deltaY);
      }
    }
    const layer = anchor.getLayer();
    const selectionOverlay = layer?.findOne(".studio-group-selection-overlay");
    if (selectionOverlay) {
      selectionOverlay.position({ x: 0, y: 0 });
    }
    const resizeProxy = layer?.findOne(".studio-group-uniform-resize-proxy");
    if (resizeProxy) {
      resizeProxy.x(resizeProxy.x() - deltaX);
      resizeProxy.y(resizeProxy.y() - deltaY);
    }
    layer?.batchDraw();
  }

  function cancelCanvasGroupDrag(): boolean {
    const session = groupDragRef.current;
    if (!session) return false;
    const anchor = nodeRefsRef.current[session.id];
    const deltaX = anchor ? anchor.x() - session.x0 : 0;
    const deltaY = anchor ? anchor.y() - session.y0 : 0;
    // Restore before invalidating/stopping the Konva drag. stopDrag() may synchronously emit the
    // child and Stage dragend handlers; at the authoritative origin those handlers can only make
    // a no-op patch, while the cleared session prevents the Stage from publishing a group commit.
    restoreGroupDragPreview(session, deltaX, deltaY);
    groupDragRef.current = null;
    anchor?.stopDrag();
    applyGuides([], []);
    applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
    endLiveResourceEdit();
    return true;
  }

  function liveCanvasElementRect(
    element: El
  ): { x: number; y: number; width: number; height: number } {
    const fallback = elBounds(element);
    const node = nodeRefsRef.current[element.id];
    if (element.type === "draw") {
      // draw wrapper에는 scene-less hit Shape가 있어 getClientRect가 원점(0,0)을 포함할 수 있다.
      // 권위 points bounds에 wrapper의 imperative drag offset만 더해야 group snap union이 정확하다.
      return {
        x: fallback.x + (node?.x() ?? 0),
        y: fallback.y + (node?.y() ?? 0),
        width: fallback.w,
        height: fallback.h,
      };
    }
    if (node) {
      // A single coordinate object may be temporarily lifted to the sibling drag Layer. Measuring
      // every peer relative to the moving node's Layer mixes sibling coordinate systems under a
      // transformed Stage. Each direct Stage Layer shares document coordinates, so normalize each
      // node against its own Layer instead.
      const nodeLayer = node.getLayer();
      const rect = nodeLayer
        ? node.getClientRect({ relativeTo: nodeLayer })
        : node.getClientRect();
      if (
        Number.isFinite(rect.x) &&
        Number.isFinite(rect.y) &&
        Number.isFinite(rect.width) &&
        Number.isFinite(rect.height)
      ) {
        return rect;
      }
    }
    return {
      x: fallback.x,
      y: fallback.y,
      width: fallback.w,
      height: fallback.h,
    };
  }

  // 드래그 중 정렬 스냅: 요소의 좌/중앙/우(상/중앙/하) 가장자리를 캔버스·들어있는 패널의
  // 같은 기준선에 끌어붙이고, 맞은 기준선을 가이드로 그린다. (Stage로 버블된 단일 핸들러)
  function onStageDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const stage = node.getStage();
    if (!node || node === stage) return;
    if (
      node instanceof KonvaRuntime.Transformer
      || node.getParent() instanceof KonvaRuntime.Transformer
    ) return; // 트랜스포머 proxy/앵커는 작성 객체와 별도 drag 이벤트를 내므로 제외.
    const draggedId = studioElementIdOf(node);
    if (!draggedId) return;
    const layer = node.getLayer();
    if (!layer) return;

    let activeGroupDrag = groupDragRef.current;
    const candidateGroupIds = canvasInteractionUnitIds(draggedId);
    const canStartGroupDrag =
      draggedId !== null &&
      candidateGroupIds.length > 1 &&
      candidateGroupIds.includes(draggedId) &&
      candidateGroupIds.every((id) => {
        const element = elementById.get(id);
        return Boolean(element && !isEffectivelyLocked(element, groups));
      });

    const translateGroupPreview = (
      anchorId: string,
      selectedIds: readonly string[],
      deltaX: number,
      deltaY: number
    ) => {
      if (deltaX === 0 && deltaY === 0) return;
      for (const id of selectedIds) {
        if (id === anchorId) continue;
        const other = nodeRefsRef.current[id];
        if (other) {
          other.x(other.x() + deltaX);
          other.y(other.y() + deltaY);
        }
      }
      const selectionOverlay = layer.findOne(".studio-group-selection-overlay");
      if (selectionOverlay) {
        selectionOverlay.x(selectionOverlay.x() + deltaX);
        selectionOverlay.y(selectionOverlay.y() + deltaY);
      }
      const resizeProxy = layer.findOne(".studio-group-uniform-resize-proxy");
      if (resizeProxy) {
        resizeProxy.x(resizeProxy.x() + deltaX);
        resizeProxy.y(resizeProxy.y() + deltaY);
      }
    };

    // 다중선택 그룹 이동: 좌표형과 draw wrapper, 전체 선택 경계를 함께 움직이고 문서에는
    // Stage drag-end에서 한 스냅샷만 커밋한다. 첫 dragmove 전에도 클릭한 그룹 단위를 다시 해석해
    // selection state 렌더 타이밍과 무관하게 전체 lease/preview를 동일한 멤버 집합으로 유지한다.
    if (draggedId && canStartGroupDrag) {
      const draggedEl = elementById.get(draggedId);
      if (draggedEl) {
        if (!activeGroupDrag || activeGroupDrag.id !== draggedId) {
          const x0 = draggedEl.type === "draw" ? 0 : draggedEl.x;
          const y0 = draggedEl.type === "draw" ? 0 : draggedEl.y;
          const currentX = node.x();
          const currentY = node.y();
          activeGroupDrag = {
            id: draggedId,
            x0,
            y0,
            lastX: currentX,
            lastY: currentY,
            selectedIds: [...candidateGroupIds],
          };
          groupDragRef.current = activeGroupDrag;
          const initialDx = currentX - x0;
          const initialDy = currentY - y0;
          translateGroupPreview(
            draggedId,
            activeGroupDrag.selectedIds,
            initialDx,
            initialDy
          );
        } else {
          const ddx = node.x() - activeGroupDrag.lastX;
          const ddy = node.y() - activeGroupDrag.lastY;
          if (ddx !== 0 || ddy !== 0) {
            translateGroupPreview(
              draggedId,
              activeGroupDrag.selectedIds,
              ddx,
              ddy
            );
            activeGroupDrag.lastX = node.x();
            activeGroupDrag.lastY = node.y();
          }
        }
      }
    }

    const liveSelectionRect = () => {
      const selectedIds = activeGroupDrag?.selectedIds;
      if (!selectedIds || selectedIds.length < 2) {
        return node.getClientRect({ relativeTo: layer });
      }
      const rects = selectedIds
        .map((id) => elementById.get(id))
        .filter((candidate): candidate is El => Boolean(candidate))
        .map((candidate) => liveCanvasElementRect(candidate));
      if (rects.length === 0) return node.getClientRect({ relativeTo: layer });
      const left = Math.min(...rects.map((rect) => rect.x));
      const top = Math.min(...rects.map((rect) => rect.y));
      const right = Math.max(...rects.map((rect) => rect.x + rect.width));
      const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
      return { x: left, y: top, width: right - left, height: bottom - top };
    };
    const liveMovingSelectionIds = new Set(
      activeGroupDrag?.selectedIds ?? (draggedId ? [draggedId] : [])
    );

    if (!snapEnabled) {
      applyGuides([], []);
      // "정렬선 표시"와 "위치 스냅"은 서로 다른 설정이다. 스냅을 끈 상태에서도
      // PPT/Figma처럼 가까운 엣지·중앙·균등 간격 후보를 ghost 위치로 계산해 선만 보여 준다.
      // 실제 Konva node 좌표는 이 분기에서 절대 바꾸지 않는다.
      if (showAlignmentGuides && draggedId) {
        const previewBoxRect = liveSelectionRect();
        const previewOthers: GuideBox[] = [];
        for (const element of elements) {
          if (
            liveMovingSelectionIds.has(element.id) ||
            isEffectivelyHidden(element, groups)
          ) {
            continue;
          }
          const rect = liveCanvasElementRect(element);
          previewOthers.push({
            id: element.id,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          });
        }
        const movingBox: GuideBox = {
          id:
            activeGroupDrag?.selectedIds.length
              ? `selection:${activeGroupDrag.selectedIds.join(",")}`
              : draggedId,
          x: previewBoxRect.x,
          y: previewBoxRect.y,
          width: previewBoxRect.width,
          height: previewBoxRect.height,
        };
        const suggestion = computeSmartSnap(movingBox, previewOthers, {
          threshold: SMART_SNAP_THRESHOLD / effScale,
        });
        const preview = buildSmartGuideOverlayPreview(
          movingBox,
          previewOthers,
          suggestion,
          { epsilon: SMART_GUIDE_EPSILON / effScale },
        );
        applySmartGuides(preview?.overlay ?? EMPTY_SMART_GUIDE_OVERLAY);
      } else {
        applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
      }
      return;
    }

    const box = liveSelectionRect();
    const snap = 8 / effScale; // 화면상 ~8px

    // 스냅 기준선: 캔버스 가장자리·중앙 + (있으면)들어있는 패널 가장자리·중앙
    const vLines = [0, CANVAS_W / 2, CANVAS_W];
    const hLines = [0, canvasH / 2, canvasH];

    // 작가 수동 가이드선 추가
    for (const guide of userGuides) {
      if (guide.type === "v") vLines.push(guide.pos);
      else hLines.push(guide.pos);
    }

    let panel: FrameEl | null = null;
    const boxCenterX = box.x + box.width / 2;
    const boxCenterY = box.y + box.height / 2;
    for (const candidate of elements) {
      if (
        candidate.type === "frame" &&
        !candidate.hidden &&
        boxCenterX >= candidate.x &&
        boxCenterX <= candidate.x + candidate.width &&
        boxCenterY >= candidate.y &&
        boxCenterY <= candidate.y + candidate.height
      ) {
        panel = candidate;
        break;
      }
    }
    if (panel) {
      vLines.push(panel.x, panel.x + panel.width / 2, panel.x + panel.width);
      hLines.push(panel.y, panel.y + panel.height / 2, panel.y + panel.height);
    }

    const edgesX = [box.x, box.x + box.width / 2, box.x + box.width];
    const edgesY = [box.y, box.y + box.height / 2, box.y + box.height];
    let dx = 0;
    let gx: number | null = null;
    let bestX = snap;
    for (const line of vLines)
      for (const edge of edgesX) {
        const dist = Math.abs(line - edge);
        if (dist < bestX) {
          bestX = dist;
          dx = line - edge;
          gx = line;
        }
      }
    let dy = 0;
    let gy: number | null = null;
    let bestY = snap;
    for (const line of hLines)
      for (const edge of edgesY) {
        const dist = Math.abs(line - edge);
        if (dist < bestY) {
          bestY = dist;
          dy = line - edge;
          gy = line;
        }
      }
    // Grid visibility is presentation-only: hidden grid lines remain valid placement targets.
    // Snap one visual anchor (the live bounding box's top-left), not all three edges plus the node
    // origin. With a 40px grid, three independent 8px attraction bands covered most positions and
    // made free movement feel like a sequence of tiny jumps.
    const gridAnchor = snapStudioObjectDragPosition({
      position: { x: box.x, y: box.y },
      enabled: snapEnabled,
      gridSize,
      viewportScale: effScale,
    });
    const gridDx = gridAnchor.x - box.x;
    const gridDy = gridAnchor.y - box.y;
    if (gridDx !== 0 && Math.abs(gridDx) < bestX) {
      dx = gridDx;
      gx = gridAnchor.x;
      bestX = Math.abs(gridDx);
    }
    if (gridDy !== 0 && Math.abs(gridDy) < bestY) {
      dy = gridDy;
      gy = gridAnchor.y;
      bestY = Math.abs(gridDy);
    }
    // ── 요소 간 스마트 가이드(PPT급): 엣지/센터 정렬 + 균등 간격 스냅 ──
    // 다른 요소들의 bbox를 O(n)으로 모아(숨김·함께 끌리는 다중선택군 제외) 후보를 구하고,
    // 축별로 캔버스/그리드 라인 스냅과 요소 스냅 중 더 가까운 쪽을 채택한다(동률이면 요소 우선).
    let smartOthers: GuideBox[] | null = null;
    if (draggedId) {
      smartOthers = [];
      for (const el of elements) {
        if (
          liveMovingSelectionIds.has(el.id) ||
          isEffectivelyHidden(el, groups)
        ) {
          continue;
        }
        const r = liveCanvasElementRect(el);
        smartOthers.push({
          id: el.id,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        });
      }
      const movingBox: GuideBox = {
        id:
          activeGroupDrag?.selectedIds.length
            ? `selection:${activeGroupDrag.selectedIds.join(",")}`
            : draggedId,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
      const smart = computeSmartSnap(movingBox, smartOthers, { threshold: SMART_SNAP_THRESHOLD / effScale });
      if (smart.x && smart.x.dist <= bestX) {
        dx = smart.x.delta;
        gx = null;
      }
      if (smart.y && smart.y.dist <= bestY) {
        dy = smart.y.delta;
        gy = null;
      }
    }
    if (dx !== 0) node.x(node.x() + dx);
    if (dy !== 0) node.y(node.y() + dy);
    if (activeGroupDrag && draggedId) {
      translateGroupPreview(
        draggedId,
        activeGroupDrag.selectedIds,
        dx,
        dy
      );
      activeGroupDrag.lastX = node.x();
      activeGroupDrag.lastY = node.y();
    }
    // 스냅 확정 위치 기준으로 요소 정렬 선분·균등 간격 배지를 그린다(그리드/캔버스 스냅
    // 결과가 우연히 요소와 정렬된 경우도 함께 드러난다 — PPT 동작).
    if (smartOthers && draggedId && showAlignmentGuides) {
      const movedBox: GuideBox = {
        id:
          activeGroupDrag?.selectedIds.length
            ? `selection:${activeGroupDrag.selectedIds.join(",")}`
            : draggedId,
        x: box.x + dx,
        y: box.y + dy,
        width: box.width,
        height: box.height,
      };
      applySmartGuides(buildSmartGuideOverlay(movedBox, smartOthers, { epsilon: SMART_GUIDE_EPSILON / effScale }));
    } else {
      applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
    }
    applyGuides(
      showAlignmentGuides && gx != null ? [gx] : [],
      showAlignmentGuides && gy != null ? [gy] : []
    );
  }
  function onStageDragEnd() {
    applyGuides([], []);
    applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
    // 그룹 이동 확정: child onDragEnd의 anchor patch는 patchEl에서 소비했고, 여기서 좌표형 요소와
    // points 기반 draw를 같은 delta로 계산해 히스토리/CRDT에 정확히 한 번만 커밋한다.
    const g = groupDragRef.current;
    groupDragRef.current = null;
    if (!g) return;
    const dnode = nodeRefsRef.current[g.id];
    let dx = 0;
    let dy = 0;
    let committed = false;
    try {
      if (dnode && g.selectedIds.length > 1) {
        dx = dnode.x() - g.x0;
        dy = dnode.y() - g.y0;
        if (dx === 0 && dy === 0) {
          committed = true;
          return;
        }
        const next = planAtomicSelectionTranslation({
          items: elements,
          selectedIds: g.selectedIds,
          deltaX: dx,
          deltaY: dy,
          isLocked: (element) => isEffectivelyLocked(element, groups),
        });
        const changed = next.some((element, index) => element !== elements[index]);
        committed = changed && commit(next);
        if (committed) {
          const drawIds = g.selectedIds.filter(
            (id) => elementById.get(id)?.type === "draw"
          );
          if (drawIds.length > 0) {
            pendingCommittedGroupDrawResetRef.current = {
              drawIds,
              sourceElements: elements,
              pageId: currentPageIdRef.current,
              masterEditMode: masterEditModeRef.current,
            };
          }
        }
        if (!changed) {
          setError("그룹 전체를 이동할 수 없어요. 잠금 또는 지원하지 않는 멤버를 확인하세요.");
        }
      }
    } finally {
      if (!committed && dnode && (dx !== 0 || dy !== 0)) {
        // 실패한 commit의 imperative preview가 화면에 남지 않게 원점으로 복구한다.
        restoreGroupDragPreview(g, dx, dy);
      }
      // 성공 commit 뒤 selection overlay는 새 문서 bounds를 자식으로 다시 그리므로 부모 preview
      // offset만 제거한다. resize proxy는 독립 absolute 노드라 이미 새 bounds 위치에 있다. 여기서
      // 되돌리면 다음 React layout 전까지 이전 위치가 한 프레임 노출되므로 성공 경로에서는 유지한다.
      const overlayLayer = dnode?.getLayer();
      const selectionOverlay = overlayLayer?.findOne(
        ".studio-group-selection-overlay"
      );
      if (selectionOverlay) {
        selectionOverlay.position({ x: 0, y: 0 });
      }
      overlayLayer?.batchDraw();
      endLiveResourceEdit();
    }
  }

  return {
    onStageDown,
    onStageMove,
    onStagePointerCancel,
    onStageUp,
    onStageDragMove,
    onStageDragEnd,
    hideStrokeGuide,
    hideBrushCursor,
    hideFilterMaskCursor,
    hideHealCloneCursors,
    hideHistoryBrushCursor,
    hideLayerMaskCursor,
    hideSmudgeCursor,
    cancelCanvasGroupDrag,
    queueStudioRasterDrawPromotion,
    queueStudioBg3dMagicFilterMaskPublication,
    studioPageElementsFromHistory,
  };
}
