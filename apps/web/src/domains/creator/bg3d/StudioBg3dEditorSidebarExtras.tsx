/* Extracted from StudioBackground3D. Closures keep original identifiers via an `any` host bag. */
// @ts-nocheck
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).
import { Studio3dAssetQualityPanel } from "../Studio3dAssetQualityPanel";

import { useEffect as useReactEffect, useMemo, useState as useReactState } from "react";

import * as R from "./studio-bg3d-editor-runtime-bindings";
import { StudioBg3dSceneOutliner } from "./StudioBg3dSceneOutliner";

export function StudioBg3dEditorSidebarExtras({ h }) {
  const {
    THREE, OrbitControls, OrthographicCamera, PerspectiveCamera, TransformControls, View,
    Canvas, useThree, Aperture, Boxes, Camera, ChevronDown, CircleDashed, Copy, Crosshair, Eye,
    EyeOff, Globe, Hexagon, Home, Layers, LayoutTemplate, Loader2, LocateFixed, Lock, Magnet,
    Maximize2, Move, MoveDown, PencilLine, Redo2, RotateCcw, RotateCw, Ruler, Save, ScanLine,
    Scissors, Trash2, SunMoon, Undo2, Unlock, Upload, WandSparkles, X, ZoomIn, ZoomOut,
    Suspense, useEffect, useEffectEvent, useCallback, useLayoutEffect, useRef, useState,
    Fragment, lazy, createPortal, flushSync, createStudioBg3dAiMethodReferenceCapture,
    COMPOSITE_CATEGORIES, COMPOSITE_CATEGORY_LABELS, COMPOSITE_PRESETS,
    instantiateCompositePreset, cloneBgCustomModelInstances, createBgCustomModelInstance,
    duplicateBgCustomModelInstance, isStudioBg3dThreeTwoBoneIkChainSupported,
    measureBg3dObjectSize, parseBg3dSceneWithModelsFromDataUrl, StudioBg3dThreeOperationError,
    clonePrimitives, createPrimitive, duplicatePrimitive, PRIMITIVE_DEFS, BG_SCENE_TEMPLATES,
    instantiateSceneTemplate, BG_SKY_PRESETS, getSkyPreset, normalizePanoramaRotationDegrees,
    createStudioGeneric3dRightsFromAttachment, createStudioGeneric3dVerifiedManifest,
    createStudioGeneric3dPoseProxies, mergeStudioGeneric3dWorkflowMaps,
    normalizeStudioGeneric3dClassification, normalizeStudioGeneric3dSourceFormat,
    parseStudioGeneric3dWorkflowMetadata, createTwoBoneDefaultPoleTarget,
    createStudioShared3dCharacterShadowEntity, StudioGeneric3dModelModePanel,
    StudioToolHintTarget, useStudioBg3dSharedCharacterStatus, useStudioModalSheet,
    snapshotStudioBg3dLiveAnimationPlayback, STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
    STUDIO_BG3D_BEAUTY_RGBA8_PROFILE, STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
    STUDIO_BG3D_NORMAL_PROFILE, STUDIO_BG3D_STABLE_ID_PROFILE,
    normalizeStudioBg3dArtifactCaptureResultV2, copyStudioBg3dBundledEnvironmentLibraryEntries,
    isStudioBg3dViewportControlTarget, readStudioBg3dObjectWorldBounds,
    readStudioBg3dWorldSurfaceHit, fitStudioBg3dCameraToBounds,
    applyOrDeferStudioBg3dHistoryCamera, resolveStudioBg3dCameraGestureCommitView,
    createStudioBg3dCameraUpForDutchRoll, readStudioBg3dCameraDutchRollDegrees,
    resolveStudioBg3dCameraDistanceLimits, resolveStudioBg3dCameraNearClip,
    resolveStudioBg3dCameraUpVector, createStudioBg3dCaptureBackgroundSnapshot,
    studioBg3dCaptureBackgroundRequestFromSnapshot, registerStudioBg3dCaptureExcludedObject,
    STUDIO_BG3D_CAPTURE_ASPECT_PRESETS, createStudioBg3dDocumentCaptureAspectPreset,
    matchStudioBg3dCaptureAspectPreset, normalizeStudioBg3dCaptureAspectRatio,
    resolveStudioBg3dCaptureFrame, resolveStudioBg3dCaptureFrameCameraSettings,
    applyStudioBg3dCaptureFrameViewOffset, BgAnimationPlayhead, LtRangeControl, LtToggleRow,
    PanoramaRotationNumberField, Vec3Field, StudioBg3dDestructiveMutationGuard,
    deriveStudioBg3dGlbValidationPolicy, resolveStudioBg3dDeviceQuality,
    acquireStudioBg3dCaptureAdapterAfterViewTransition, CAMERA_PRESETS, canonicalSceneDocument,
    captureStudioBg3dRaster, collectDeviceSignals, createStudioBg3dHistorySnapshot,
    createStudioBg3dShotId, degToRad, describeStudioBg3dPhysicsStatus, eulerDegreesToQuaternion,
    formatBg3dSunTime, generateLtUserPresetId, getStudioBg3dCaptureSourceSize,
    loadStudioBg3dThreeWebglCaptureRuntime, ltTonePreviewStyle, ltUserPresetFailureMessage,
    matchingLtPreset, quaternionToEulerDegrees, radToDeg, resolveDeviceQuality,
    SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE, studioBg3dHistoryDocumentAtView,
    studioBg3dMagicCaptureCompatibilityMessage, waitForStudioBg3dPaintFrame,
    createStudioBg3dModelImportActions, CONTROL_BUTTON, ICON_BUTTON, cx, canSetStudioBg3dParent,
    collectStudioBg3dEffectivelyVisibleEntityIds, resolveStudioBg3dHierarchy,
    planStudioBg3dImmersiveStage, studioBg3dImmersiveStageFailureMessage,
    resolveStudioBg3dInsertBackgroundFromDocument, resolveStudioBg3dInsertBackgroundMode,
    STUDIO_BG3D_LENS_MAX_FOCAL_MM, STUDIO_BG3D_LENS_MIN_FOCAL_MM, STUDIO_BG3D_LENS_PRESETS,
    computeStudioBg3dTwoPointPerspective, isStudioBg3dTwoPointPerspectiveActive,
    studioBg3dFocalLengthToFovDegrees, studioBg3dFovDegreesToFocalLength,
    resolveStudioBg3dLtCaptureSize, encodeStudioBg3dLtLayers,
    EMPTY_STUDIO_BG3D_LT_USER_PRESET_PAYLOAD, createStudioBg3dLtUserPreset,
    deleteStudioBg3dLtUserPreset, renameStudioBg3dLtUserPreset, upsertStudioBg3dLtUserPreset,
    getProductStudioBg3dLtPresetSqliteRepository, STUDIO_BG3D_LT_BUILT_IN_PRESETS,
    STUDIO_BG3D_LT_PRESET_MAX_COUNT, STUDIO_BG3D_LT_PRESET_MAX_DESCRIPTION_LENGTH,
    STUDIO_BG3D_LT_PRESET_MAX_NAME_LENGTH, applyStudioBg3dLtPreset, renderStudioBg3dLtLayers,
    STUDIO_BG3D_LT_RENDER_MAX_PIXELS, renderStudioBg3dLtLayersInWorker,
    StudioBg3dLtRenderWorkerError, buildStudioBg3dMagicFilterMask,
    encodeStudioBg3dMagicMaskPngDataUrl, captureStudioBg3dMagicObjectIds,
    STUDIO_BG3D_MAGIC_OBJECT_ID_RUNTIME_CAPABILITIES, resolveStudioBg3dMagicSelection,
    STUDIO_BG3D_MEASUREMENT_MAX_REFERENCES, classifyStudioBg3dMeasurementInference,
    createStudioBg3dMeasurementDocument, formatStudioBg3dMeasurementLength,
    lockStudioBg3dMeasurementLength, measureStudioBg3dWorldPoints,
    resolveStudioBg3dMeasurementGuide, readStudioBg3dMeasurementPointFromThreeEvent,
    StudioBg3dStaleModalOperationError, studioBg3dModalOperationCoordinator,
    createStudioBg3dModelAttachment, getStoredBg3dModel, getStoredBg3dModelByHash,
    listBg3dModelLibraryEntries, resolveBg3dModelHash, assertStudioBg3dModelAttachmentAdmission,
    calculateStudioBg3dPlacedModelBytes, StudioBg3dModelPlacementAdmissionError,
    totalStudioBg3dModelAttachmentBytes, admitAndCacheModel, attachmentMatchesRecord,
    bindModelAttachment, disposeModelCache, readGenericWorkflowMapsFromAttachments,
    withStudioGeneric3dWorkflowMetadata, encodeStudioBg3dModelThumbnailPng,
    applyStudioBg3dMoodRig, resolveStudioBg3dAppliedMoodRig, STUDIO_BG3D_MOOD_RIGS,
    applyStudioBg3dSnapToTransform, DEFAULT_STUDIO_BG3D_SNAP_SETTINGS,
    filterStudioBg3dLayerItems, groundModelTransform, groundPrimitiveTransform,
    isBgObjectLocked, isBgObjectTransformBlocked, isBgObjectVisible,
    normalizeStudioBg3dSnapSettings, STUDIO_BG3D_ROTATE_STEP_OPTIONS_DEG,
    STUDIO_BG3D_TRANSLATE_STEP_OPTIONS, studioBg3dSnapSettingsSummary,
    deriveStudioBg3dVanishingPoints, applyStudioBg3dPhysicsTransforms,
    createStudioBg3dPhysicsWorld, STUDIO_BG3D_PHYSICS_MAX_DYNAMIC_BODIES,
    createStudioBg3dPhysicsSessionSourceToken, isStudioBg3dPhysicsSessionSourceCurrent,
    createStudioBg3dPhysicsThreeJob, measureStudioBg3dPhysicsModelLocalBounds,
    projectStudioBg3dPhysicsSamples, STUDIO_BG3D_PHYSICS_PROJECTION_ROOT_USER_DATA_KEY,
    sampleStudioBg3dPhysicsTimeline, isStudioBg3dPhysicsTransientPhase,
    STUDIO_BG3D_PHYSICS_GRAVITY, planStudioBg3dModelPlacementRecipe,
    createStudioBg3dPlacementSession, transitionStudioBg3dPlacementSession,
    calculateStudioBg3dProceduralSceneUsage, getStudioBg3dProceduralStarterAsset,
    planStudioBg3dProceduralStarterInsertion, StudioBg3dPrimitiveGeometryPool,
    resolveStudioBg3dFrameLoop, resolveStudioBg3dReturnFocus,
    createStudioBg3dRigPoseBakeHistoryTransition, mutateStudioBg3dAimConstraint,
    mutateStudioBg3dPoseOverride, mutateStudioBg3dTwoBoneIkConstraint,
    resolveStudioBg3dRigSelection, clampStudioBg3dRoomSpec, getStudioBg3dRoomPreset,
    instantiateStudioBg3dRoomBuild, createStudioBg3dRuntimeSnapshot,
    DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK, DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER,
    DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, DEFAULT_STUDIO_BG3D_POSE_LAYER,
    DEFAULT_STUDIO_BG3D_MORPH_LAYER, DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS, STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS, STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS,
    applyStudioBg3dShot, captureStudioBg3dShot, duplicateStudioBg3dShot, moveStudioBg3dShot,
    normalizeStudioBg3dSceneDocument, removeStudioBg3dShot, STUDIO_BG3D_FOG_MIN_GAP,
    STUDIO_BG3D_FOG_PRESETS, planStudioBg3dDeletedAttachmentReconciliation,
    planStudioBg3dSceneEntityRemoval, hydrateStudioBg3dDocumentToRuntime,
    tryAdaptStudioBg3dRuntimeToDocument, DEFAULT_STUDIO_BG3D_SECTION_PLANE_STATE,
    STUDIO_BG3D_SECTION_AXES, STUDIO_BG3D_SECTION_AXIS_LABELS, STUDIO_BG3D_SECTION_OFFSET_LIMIT,
    createStudioBg3dSemanticRenderPassPlan, collectStudioBg3dShadowSceneBounds,
    fitStudioBg3dDirectionalShadowFrustum, readStudioBg3dShadowGeometryLocalBounds,
    readStudioBg3dShadowModelLocalBounds, acquireStudioBg3dSharedCharacterCaptureAuthorityLease,
    verifyStudioBg3dSharedCharacterCaptureAuthorityLease,
    createStudioBg3dLinkedCharacterCapture,
    createStudioBg3dSharedCharacterGroundSurfaceRevision,
    resolveStudioBg3dSharedStageMutationBlockedReason, createStudioBg3dShotBatchExportRunner,
    STUDIO_BG3D_SHOT_BATCH_PASSES, STUDIO_BG3D_SHOT_BATCH_PASS_LABELS,
    projectStudioBg3dShotVisibilityToRuntime, createStudioBg3dBabylonDiagnosticDocument,
    hasStudioBg3dBabylonDiagnosticBeautyVariation, hasStudioBg3dBabylonDiagnosticDepthVariation,
    hasStudioBg3dBabylonDiagnosticNormalVariation, hasStudioBg3dBabylonDiagnosticStableIds,
    studioBg3dBabylonDiagnosticErrorMessage, DEFAULT_STUDIO_BG3D_SUN_RIG_CONFIG,
    STUDIO_BG3D_SUN_TIME_PRESETS, applyStudioBg3dSunRig, resolveStudioBg3dSunLightState,
    buildStudioBg3dSurfacePresetOverride, STUDIO_BG3D_SURFACE_PRESETS,
    collectStudioBg3dSurfaceSelectionSubtreeIds, collectStudioBg3dSurfaceTargetPathIds,
    planStudioBg3dMultiSurfaceSnap, STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS,
    deleteBg3dTemplate, instantiateBg3dTemplateDocument, listBg3dTemplates, saveBg3dTemplate,
    calculateStudioBg3dThreeReparentTransform, calculateStudioBg3dThreeWorldMatrix,
    calculateStudioBg3dThreeWorldDeltaTransform,
    resolveStudioBg3dThreeCenterGroundLocalPosition, applyStudioBg3dThreeWebglRenderSettings,
    ADD_BUTTONS, BG_PANEL_TABS, BG3D_VIEWPORT_HINTS, DEFAULT_LT_USER_PRESET_DESCRIPTION,
    EMPTY_THREE_ANIMATION_CLIPS, EMPTY_THREE_JOINTS, EMPTY_THREE_MORPH_TARGETS,
    loadStudioBg3dBabylonSpecialistEntry, loadStudioBg3dModelThumbnailRuntime,
    LT_EXPORT_HEIGHTS, LT_TONE_MODE_LABELS, LT_TONE_PATTERN_LABELS, LT_TONE_TYPE_LABELS,
    SEMANTIC_MATERIAL_CONFIDENCE_LABELS, SEMANTIC_MATERIAL_SLOT_LABELS,
    STUDIO_BG3D_LT_INSERT_WORKER_TIMEOUT_MS,
    TRANSFORM_MODES, VIEW_EDITOR_SECTIONS, VIEWPORT_BTN, StudioBg3dActionFooter,
    StudioBg3dDirectionalShadowLight, StudioBg3dImmersivePanel, StudioBg3dLtPanel,
    StudioBg3dMeasurementPanel, StudioBg3dMeasurementViewport, StudioBg3dPhysicsPanel,
    StudioBg3dPhysicsTransport, StudioBg3dPlacementPointerController,
    StudioBg3dRoomBuilderPanel, StudioBg3dSceneFog, BgAdaptiveDprController,
    BgCustomModelInstanceBatch, BgCustomModelMesh, BgGroundHelper, BgPlacementPreview,
    BgPrimitiveMesh, BgScaleGuide, BgSectionPlaneController, BgViewportController,
    SkyClearColorController, StudioBg3dThreeRenderSettingsController, StudioBg3dScenePanorama,
    StudioBg3dSceneTemplatePanel, StudioBg3dShapesPanel, StudioBg3dSharedCharacterSceneContent,
    StudioBg3dSharedCharacterStatusOverlay, StudioBg3dSharedStagePanel, StudioBg3dViewPanel,
    StudioBg3dImmersiveRenderBridge, StudioBg3dWebXrSessionBridge, StudioBg3dCaptureAdapter,
    StudioBg3dCaptureRequest, StudioBg3dImmersiveStagePlan, StudioBg3dImportProgress,
    StudioBg3dModelThumbnailCaptureController, StudioBg3dModelThumbnailThreeCaptureHandle,
    StudioBg3dPhysicsTimelineWorkerSession, StudioBg3dShotBatchPass,
    StudioBg3dShotBatchRecoveryScope, StudioBg3dShotBatchRecoverySession,
    StudioBg3dShotBatchRecoveryStore, StudioBackground3DInsertResult, StudioToolHintSpec,
    StudioWebXrMode, StudioWebXrSessionController, StudioWebXrSessionState,
    StudioWebXrSupportSnapshot, open, initialDataUrl, initialScene, seedSceneTemplateId,
    seedPrimitiveKind, onSeedObjectInsertConsumed, sharedSceneSession, sharedStageResolution,
    sharedStageSessionScopeKey, sharedCharactersLinkedToOtherBackgroundCount, operation,
    recoveryScope, validateRecoveryAccess, onWebXrCleanupPendingChange, onClose, onInsert,
    onUseAsAiMethodReference, handleOpenPrecisionModeler, documentCanvasSize, primitiveGeometryPool, adaptiveDprScale,
    setAdaptiveDprScale, sharedCharacterCaptureAuthorityDraft,
    sharedCharacterCaptureAuthorityPayloadKey, readSharedCharacterCaptureAuthorityDraft,
    sharedCharacterCaptureAuthorityPayloadKeyRef, sharedCharacterCaptureAuthorityRevisionRef,
    sharedCharacterCaptureStatusFenceRef, updateSharedCharacterStatusWithCaptureFence,
    acquireSharedCharacterCaptureAuthority, verifySharedCharacterCaptureAuthority, primitives,
    setPrimitives, selectedIds, setSelectedIds, transformMode, setTransformMode, lineArtPreview,
    setLineArtPreview, magicLayerEnabled, setMagicLayerEnabled, isTransforming,
    setIsTransforming, isQuadView, setIsQuadView, webXrBridgeGeneration,
    setWebXrBridgeGeneration, webXrCanvasGeneration, setWebXrCanvasGeneration,
    webXrSessionStateRef, webXrControllerRef, webXrRestoreCameraRef, webXrCleanupPromiseRef,
    webXrRendererRecreationPendingRef, webXrCloseRequestedRef, webXrOpenRef, webXrMountedRef,
    viewTopRef, viewFrontRef, viewRightRef, viewPerspRef, isCapturing, setIsCapturing, error,
    setError, activePanelTab, setActivePanelTab, modelsPanelActivated, setModelsPanelActivated,
    viewEditorSection, setViewEditorSection, babylonDiagnosticAbortRef,
    babylonDiagnosticGenerationRef, physicsPhase, setPhysicsPhase, physicsDurationSeconds,
    setPhysicsDurationSeconds, physicsGroundEnabled, setPhysicsGroundEnabled, physicsProgress,
    setPhysicsProgress, physicsCurrentSeconds, setPhysicsCurrentSeconds, physicsError,
    setPhysicsError, physicsPreviewRevision, setPhysicsPreviewRevision, ltEditorSection,
    setLtEditorSection, ltPresetPanelActivated, setLtPresetPanelActivated,
    ltUserPresetRepository, ltUserPresetHydrationGenerationRef,
    ltUserPresetMutationGenerationRef, ltUserPresetPayload, setLtUserPresetPayload,
    ltUserPresetNotice, setLtUserPresetNotice, ltPreferredPresetId, setLtPreferredPresetId,
    ltManagedUserPresetId, setLtManagedUserPresetId, ltDeleteConfirmId, setLtDeleteConfirmId,
    ltUserPresetName, setLtUserPresetName, ltUserPresetDescription, setLtUserPresetDescription,
    viewportHinted, setViewportHinted, canUndo, setCanUndo, canRedo, setCanRedo, shotNameDraft,
    setShotNameDraft, shotBatchExcludedIds, setShotBatchExcludedIds, shotBatchPasses,
    setShotBatchPasses, shotBatchIncludeLayeredPsd, setShotBatchIncludeLayeredPsd,
    shotBatchIncludeContactSheet, setShotBatchIncludeContactSheet, shotBatchExportHeight,
    setShotBatchExportHeight, shotBatchProgress, setShotBatchProgress, shotBatchRecoverySummary,
    setShotBatchRecoverySummary, isBatchRenderingShots, compositeCategory, setCompositeCategory,
    sceneTemplateCategory, setSceneTemplateCategory, roomBuilderSpec, setRoomBuilderSpec,
    sunRigConfig, setSunRigConfig, sectionPlane, setSectionPlane, scaleGuideVisible,
    setScaleGuideVisible, measurementActive, setMeasurementActive, measurementStatus,
    setMeasurementStatus, measurementActiveRef, snapSettings, setSnapSettings, surfaceSnapArmed,
    setSurfaceSnapArmed, surfaceSnapAlignNormal, setSurfaceSnapAlignNormal, surfaceSnapStatus,
    setSurfaceSnapStatus, layerQuery, setLayerQuery, customModels, setCustomModels,
    modelLibrary, setModelLibrary, placementSession, setPlacementSession, placementSessionRef,
    placementTokenSequenceRef, modelRenderer, setModelRenderer, modelRendererRef,
    isUploadingModel, setIsUploadingModel, modelImportProgress, setModelImportProgress,
    modelImportAbortRef, modelThumbnailCaptureAbortRef, modelThumbnailCaptureEpochRef,
    modelThumbnailGpuLeaseRef, modelAnimationTimeReadersRef, modelRigBakeReadersRef,
    ikEndJointSelection, setIkEndJointSelection, morphTargetSelection, setMorphTargetSelection,
    deletingModelId, setDeletingModelId, isRestoringScene, setIsRestoringScene,
    sceneRestoreAbortRef, templateLibrary, setTemplateLibrary, templateLibraryStatus,
    setTemplateLibraryStatus, isSavingTemplate, setIsSavingTemplate, applyingTemplateId,
    setApplyingTemplateId, generateId, handleSaveSceneAsTemplate, handleDeleteTemplate,
    failedCloneIds, setFailedCloneIds, readyCloneIds, setReadyCloneIds, unbatchableModelIds,
    setUnbatchableModelIds, sceneBaseDocument, setSceneBaseDocument, savedShots,
    shotBatchSelectedIds, selectedShotBatchPasses, deviceSignals, setDeviceSignals, skyPresetId,
    insertBackgroundIntent, transparentInsert, captureRef, modalDialogRef, modalRootRef,
    viewportApiRef, pendingInitialCameraRef, cameraLensGestureBeforeViewRef,
    cameraLensGestureLatestViewRef, cameraLensGestureTimerRef, viewportHostRef, viewportBoxSize,
    setViewportBoxSize, primitiveObjectsRef, surfaceSnapArmedRef,
    dragInitialSelectedTransformsRef, dragInitialFirstTransformRef, panelScrollRef,
    modelRootCacheRef, modelLoadPendingRef, attachmentByStorageModelIdRef,
    storageModelIdByAttachmentIdRef, componentActiveRef, modalAssetSessionRef,
    captureInFlightRef, invalidateModelThumbnailCaptures, ltInsertAbortRef,
    aiMethodReferenceAbortRef, ltInsertSceneEpochRef, ltMagicSelectionEpochRef,
    ltMagicCaptureGenerationRef, ltInsertRestoreLineArtPreviewRef, destructiveMutationGuardRef,
    shotBatchAbortRef, shotBatchRecoveryRef, shotBatchRecoveryScopeRef,
    shotBatchRecoveryStoreRef, shotBatchAuthorizationEpochRef, physicsPhaseRef, physicsAbortRef,
    physicsAnimationFrameRef, physicsGenerationRef, physicsPlaybackStartedAtRef,
    physicsPlaybackOffsetRef, physicsLastUiUpdateRef, physicsLastFrameTimestampRef,
    latestPhysicsSamplesRef, physicsSessionRef, physicsWorkerSessionRef,
    physicsRuntimeSourceRef, physicsStartButtonRef, physicsTransportActionRef,
    shouldTransferPhysicsFocusRef, isModalAssetSessionCurrent,
    getModelThumbnailCaptureController, acquireModelThumbnailGpuLease,
    startModelThumbnailCaptureBatch, invalidateModalAssetSession, cancelSurfaceSnap,
    handleViewportReady, resetWebXrPresentationUi, finishWebXrControllerCleanup,
    disposeCurrentWebXrControllerGeneration, disposeWebXrControllerForOpenChange,
    handleWebXrControllerReady, handleWebXrSessionStateChange, historyRef, historyIndexRef,
    deviceQuality, hasCloneFailure, hasPendingClone, hasPendingSharedCharacter,
    hasUnavailableSharedCharacter, physicsInteractionLocked, insertBlocked,
    magicLayerSelectedPrimitive, magicLayerLensShift, magicLayerUnavailableReason,
    shotBatchBlockedReason, transitionPhysicsPhase, commitImmediateHistoryTransition, doUndo,
    doRedo, canAdmitSceneNodes, addPrimitive, addComposite, proceduralStarterDisabledReason,
    addProceduralStarterAsset, addSceneTemplate, addPrimitiveRef, addSceneTemplateRef,
    objectInsertSeedKeyRef, addRoomBuild, applyRoomBuilderPreset, handleRoomBuilderSpecChange,
    commitSceneEntityRemoval, removeSceneEntities, deleteSelected, deleteSelectedCustomModel,
    deleteSelectedEntity, duplicateSelected, duplicateSelectedCustomModel,
    applyMultiSelectDelta, updateTransform, updateCustomModelTransform,
    updateCustomModelMaterial, updateCustomModelAnimation, updateCustomModelPose,
    updateCustomModelMorph, updateCustomModelConstraints, reparentSceneEntity,
    registerModelAnimationTime, registerModelRigBake, bakeCustomModelRigConstraints,
    finishModelAnimation, updateColor, applySurfacePreset, togglePrimitiveFlag,
    toggleCustomModelFlag, renameBgObject, groundSelectedEntity, placeSelectedModelRecipe,
    centerAndGroundSelectedEntity, commitCameraViewCommand, zoomCameraBy, applyCameraPreset,
    focusSelectedEntity, registerPrimitiveRef, ensureModelRootCached, publishPlacementSession,
    cancelCustomModelPlacement, moveCustomModelPlacement, rotateCustomModelPlacement,
    commitCustomModelPlacement, addCustomModelToScene, applyUserTemplate, handlePanelTabChange,
    reportLtUserPresetMutationFailure, persistLtUserPresetMutation, currentLtUserPresetDraft,
    saveCurrentLtAsUserPreset, updateManagedLtUserPreset, renameManagedLtUserPreset,
    deleteManagedLtUserPreset, applyLtPreset, updateLtLineSettings, updateLtToneSettings,
    updateLtExportHeight, updateLtExportAspectRatio, updateBackgroundSettings,
    updateLightingSettings, updateRenderExposure, applyMoodRig, applySunRigConfig,
    cameraLensInteractionLocked, commitCameraLensView, finishCameraLensGesture,
    previewCameraLens, updateCameraLens, applyTwoPointPerspective, resetTwoPointPerspective,
    readCurrentCanonicalSceneForShot, commitAppliedShot, captureCurrentShot, applySavedShot,
    duplicateActiveShot, moveSavedShot, removeSavedShot, exportSavedShotsAsZip,
    updateBackgroundTransparency, selectedIdsRef, undoRef, redoRef, deleteSelectedRef,
    onCaptureUpdate, requestModalDismiss, requestUserClose, handleSaveToLibrary,
    handleUseAsAiMethodReference, handleInsert, firstSelectedId, selectedPrimitive,
    selectedCustomModel, selectedEntity, selectedModelCacheEntry, selectedSemanticMaterials,
    selectedSemanticAssignments, selectedCharacterPassPlan, selectedBackgroundPassPlan,
    selectedModelAnimations, selectedModelJoints, selectedGenericModelManifest,
    selectedGenericModelProxies, effectiveGenericModelProxyId,
    changeSelectedGenericModelClassification, changeGenericModelControlMode,
    selectGenericModelProxy, selectedJointByKey, selectedPoseRigSelection, selectedPoseJointKey,
    selectedPoseCanonicalKey, selectedPoseJoint, selectedHasEffectiveRigConstraint,
    selectedRigBakeDisabledReason, selectedAimConstraint, selectedIkProtectedJointKeys,
    selectedAimSuppressedByIk, selectedIkEndCandidates, savedIkEndJointKey,
    requestedIkEndJointKey, selectedIkEndJointKey, selectedIkRigSelection, selectedIkEndJoint,
    selectedIkMiddleJoint, selectedIkUpperJoint, selectedTwoBoneIkConstraint,
    selectedIkChainKeys, selectedIkHasOverlap, selectedIkLimitReached, selectedIkWorldMatrix,
    selectedIkSourceRoot, selectedIkTransformSupported, selectedPoseEulerDegrees,
    selectedModelMorphTargets, selectedMorphTargetCandidateKey, selectedMorphTargetKey,
    selectedMorphOverride, selectedAnimationClip, selectedAnimationDuration,
    commitSelectedPoseOverride, commitSelectedAimConstraint, commitSelectedTwoBoneIkConstraint,
    selectedIsLocked, selectedEntities, canGroundSelection, selectedPlaceableModels,
    snapSettingsSummary, sceneHierarchy, effectivelyVisibleLayerIds, surfaceSnapDisabledReason,
    measurementDisabledReason, focusSelectionDisabledReason, cancelMeasurement,
    measurementInferenceReferences, resolveMeasurementCandidate, updateMeasurementPreview,
    pickMeasurementPoint, handleMeasurementSurfacePreview, handleMeasurementLengthLockChange,
    toggleMeasurement, toggleSurfaceSnap, handleSurfaceSnapPick,
    physicsSelectionUnavailableReason, filteredLayerItems, ltLineSettings, ltToneSettings,
    hasFilledOutput, appliedLtPreset, appliedLtPresetId, appliedMoodRig, managedLtUserPreset,
    ltExportAspectRatio, ltCaptureSafeFrame, ltCaptureSizePreview, ltDocumentAspectPreset,
    ltCaptureAspectPresets, ltCaptureAspectPresetId, ltCaptureAspectLabel, hideOnTab,
    cancelPhysicsAnimationFrame, updatePhysicsProgress, restorePhysicsInitialPose,
    resetPhysicsPreview, failPhysicsPreview, physicsPlaybackFrame, startPhysicsPlayback,
    pausePhysicsPreview, resumePhysicsPreview, startPhysicsPreview, handleStartPhysicsPreview,
    bakePhysicsPreview, runBabylonDiagnostic, pausePhysicsWhenHidden, immersiveSceneActive,
    immersiveTransitionActive, effectiveIsQuadView, mainViewTrackRef, bg3dFrameLoop,
    isMainOrtho, currentFocalLengthMm, sunLightState, selectedSky, panoramaRotation,
    renderedSkyPresetId, fogNear, fogFar, fogSliderMax, selectSceneEntity,
    updateModelCloneStatuses, primitiveById, customModelById, batchCandidatesByModelId,
    batchedNodeIds, renderSceneEntity, sharedCharacterSceneContent, shadowSceneBounds,
    shadowMapSize, keyShadowFit, fillShadowFit, webXrDisabledReason, startStudioBg3dWebXr,
    endStudioBg3dWebXr, sceneContent, mainCameraNearClip, mainCameraUp, applyLensShift,
    mainCameraNode, immersiveCameraNode, mainScenePresentationNode, commonOrbitControls,
    commitSharedCharacterTransform, effectiveSelectedSharedCharacter,
    effectiveSelectedSharedCharacterElementId, includeSharedCharactersInCapture,
    mayApplyEmptySharedStageMutation, selectSharedStageMutation,
    setSelectedSharedCharacterElementId, setSharedStageMaterializationKind,
    setSharedStageMutationKind, sharedCharacterCaptureElementIds,
    sharedCharacterCaptureReadiness, sharedCharacterGroundings,
    sharedCharacterPreviewOmissionCount, sharedCharacterReadyCount,
    sharedCharacterRelationshipLabel, sharedCharacterStatuses, sharedCharacterUnavailableCount,
    sharedCharacters, sharedStageMaterializationKind, sharedStageMutationKind,
    shouldStartOnSharedStageLayerTab, targetHasLinkedCharacters, targetHasSavedSharedScene,
    updateSharedCharacterGrounding, updateSharedCharacterStatus, handleUploadModelFiles,
    handleDeleteModelFromLibrary, placementActive, twoPointPerspectiveActive,
    renderedPanoramaRotation, renderedBackgroundSettings, sharedCharacterGroundSurfaceRevision,
    staticModelBatches, mainCameraFarClip, mainCameraMaxOrbitDistance, quadViewHint,
    snapToggleHint, lineArtPreviewHint, surfaceSnapHint,
    // 파일 분할 때 목록에서 빠져 ReferenceError 를 던지던 식별자들(런타임 값 위치) — 복구.
    ltUserPresetLibraryStatus, physicsGravityPreset, setPhysicsGravityPreset,
    LazyStudioBg3dAssetLibraryPanel, babylonDiagnosticState, engineRuntime, engineFrameTimeMs, genericModelClassifications, genericModelControlMode, layerListItems, measurementDocument, measurementDraft, measurementInference, measurementLockedLengthMeters, modelLibraryStatus, setMeasurementDocument, webXrController, webXrSessionState, webXrSupport,
  } = { ...R, ...h };
  const professionalReadinessInput = useMemo(() => {
    const viewportWidth = viewportBoxSize?.width ?? documentCanvasSize?.width ?? 0;
    const viewportHeight = viewportBoxSize?.height ?? documentCanvasSize?.height ?? 0;
    const viewportAspectRatio = viewportWidth > 0 && viewportHeight > 0
      ? viewportWidth / viewportHeight
      : sceneBaseDocument.output.exportAspectRatio;
    const groundingReceipts = new Map(sharedCharacters.flatMap((character) => {
      const receipt = sharedCharacterGroundings[character.runtimeKey]
        ?? sharedCharacterGroundings[character.modelRuntimeKey];
      return receipt ? [[character.elementId, receipt]] : [];
    }));
    const runtimeFailure = engineRuntime.deviceLostMessage
      ? {
          kind: "webgpu-device-lost" as const,
          attempt: 1,
          recoverable: false,
        }
      : engineRuntime.plan.status === "failed"
        ? {
            kind: engineRuntime.plan.backend === "webgpu"
              ? "webgpu-initialization" as const
              : "webgl-context-lost" as const,
            attempt: 1,
            recoverable: false,
          }
        : undefined;
    return {
      authorityId: `bg3d:${sharedStageSessionScopeKey ?? "editor-session"}`,
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: sceneBaseDocument,
      sharedSceneSession,
      viewportAspectRatio,
      revision: canonicalRevision,
      enginePlan: engineRuntime.plan,
      webGpuProbe: engineRuntime.probe,
      deviceSignals,
      maxTextureDimension2d: deviceSignals.deviceMemoryGb && deviceSignals.deviceMemoryGb >= 8
        ? 8192
        : 4096,
      float16Shaders: engineRuntime.probe.supported,
      groundingReceipts,
      babylonSpecialistAvailable: babylonDiagnosticState.status === "success",
      runtimeFailure,
    };
  }, [
    attachmentByStorageModelIdRef,
    babylonDiagnosticState.status,
    canonicalRevision,
    customModels,
    deviceSignals,
    documentCanvasSize?.height,
    documentCanvasSize?.width,
    engineRuntime.deviceLostMessage,
    engineRuntime.plan,
    engineRuntime.probe,
    primitives,
    sceneBaseDocument,
    sharedCharacterGroundings,
    sharedCharacters,
    sharedSceneSession,
    sharedStageSessionScopeKey,
    viewportBoxSize?.height,
    viewportBoxSize?.width,
  ]);
  const [professionalRuntimeReadiness, setProfessionalRuntimeReadiness] = useReactState();
  useReactEffect(() => {
    if (!open || viewEditorSection !== "prosuite") {
      setProfessionalRuntimeReadiness(undefined);
      return undefined;
    }
    let cancelled = false;
    setProfessionalRuntimeReadiness(undefined);
    void import("./studio-bg3d-professional-runtime-readiness").then((module) => {
      if (cancelled) return;
      const capabilities = module.deriveStudioBg3dProfessionalDeviceCapabilities({
        enginePlan: professionalReadinessInput.enginePlan,
        webGpuProbe: professionalReadinessInput.webGpuProbe,
        deviceSignals: professionalReadinessInput.deviceSignals,
        maxTextureDimension2d: professionalReadinessInput.maxTextureDimension2d,
        float16Shaders: professionalReadinessInput.float16Shaders,
      });
      const {
        enginePlan: _enginePlan,
        webGpuProbe: _webGpuProbe,
        deviceSignals: _deviceSignals,
        maxTextureDimension2d: _maxTextureDimension2d,
        float16Shaders: _float16Shaders,
        ...readinessInput
      } = professionalReadinessInput;
      const next = module.resolveStudioBg3dProfessionalRuntimeReadiness({
        ...readinessInput,
        capabilities,
      });
      if (!cancelled) setProfessionalRuntimeReadiness(next);
    }).catch(() => {
      if (!cancelled) setProfessionalRuntimeReadiness(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [open, professionalReadinessInput, viewEditorSection]);
  return (
    <>
              <Studio3dAssetQualityPanel
                active={open}
                disabled={isCapturing || isRestoringScene || isUploadingModel || isSavingTemplate || Boolean(applyingTemplateId) || physicsInteractionLocked || hasPendingClone || hasCloneFailure}
                emptyScene={primitives.length === 0 && customModels.length === 0}
                deviceLostMessage={engineRuntime.deviceLostMessage}
                onBeforeEnable={handleSaveSceneAsTemplate}
              />
              <section hidden={hideOnTab("layers")}>
                {sharedStageResolution ? (
                  <Suspense fallback={(
                    <p className="mb-4 rounded-xl border border-line bg-raised/60 px-3 py-2.5 text-[0.68rem] text-fg-3">
                      공유 3D 장면 상태를 불러오는 중이에요…
                    </p>
                  )}>
                    <StudioBg3dSharedStagePanel
                      resolution={sharedStageResolution}
                      characters={sharedCharacters}
                      statuses={sharedCharacterStatuses}
                      selectedElementId={effectiveSelectedSharedCharacterElementId}
                      selectedGrounding={effectiveSelectedSharedCharacter
                        ? sharedCharacterGroundings[effectiveSelectedSharedCharacter.runtimeKey]
                        : undefined}
                      captureElementCount={sharedCharacterCaptureElementIds.length}
                      charactersLinkedToOtherBackgroundCount={
                        sharedCharactersLinkedToOtherBackgroundCount
                      }
                      targetHasLinkedCharacters={targetHasLinkedCharacters}
                      targetHasSavedSharedScene={targetHasSavedSharedScene}
                      includeCharactersInCapture={includeSharedCharactersInCapture}
                      mutationKind={sharedStageMutationKind}
                      materializationKind={sharedStageMaterializationKind}
                      captureDisabled={isCapturing || isRestoringScene}
                      placementDisabled={
                        isCapturing || isRestoringScene || physicsInteractionLocked
                      }
                      onSelectMutation={selectSharedStageMutation}
                      onSetMutation={setSharedStageMutationKind}
                      onSetMaterialization={setSharedStageMaterializationKind}
                      onSelectCharacter={(elementId) => {
                        setSelectedSharedCharacterElementId(elementId);
                        setSelectedIds(new Set());
                      }}
                      onCommitCharacterTransform={commitSharedCharacterTransform}
                    />
                  </Suspense>
                ) : null}
                <div className={cx(
                  includeSharedCharactersInCapture && sharedCharacters.length > 0 && "mt-4",
                  "xl:hidden",
                )}>
                  <StudioBg3dSceneOutliner controller={h.outlinerController} variant="panel" />
                </div>
                <p className="hidden rounded-lg border border-line bg-raised/60 px-3 py-2.5 text-xs leading-relaxed text-fg-3 xl:block">
                  장면 계층은 왼쪽 패널에서 관리할 수 있습니다. 선택한 객체의 상세 설정은 이 패널에서 이어서 편집하세요.
                </p>
              </section>

              <div inert={immersiveSceneActive || undefined}>
              <StudioBg3dViewPanel
                hidden={hideOnTab("view")}
                babylonDiagnosticState={babylonDiagnosticState}
                onRunBabylonDiagnostic={(backend) => void runBabylonDiagnostic(backend)}
                enginePlan={engineRuntime.plan}
                enginePreference={engineRuntime.preference}
                engineInAppBrowser={engineRuntime.inApp}
                engineProbing={engineRuntime.phase === "probing"}
                engineDeviceLostMessage={engineRuntime.deviceLostMessage}
                engineFrameTimeMs={engineFrameTimeMs}
                professionalReadiness={professionalRuntimeReadiness}
                onEnginePreferenceChange={engineRuntime.setPreference}
                onOpenPrecisionModeler={handleOpenPrecisionModeler}
                aiReferenceBusy={isCapturing}
                aiReferenceDisabled={
                  insertBlocked || (primitives.length === 0 && customModels.length === 0)
                }
                {...(onUseAsAiMethodReference
                  ? { onUseCurrentFrameAsAiReference: () => void handleUseAsAiMethodReference() }
                  : {})}
                context={{
                  VIEW_EDITOR_SECTIONS,
                  viewEditorSection,
                  setViewEditorSection,
                  StudioBg3dPhysicsPanel,
                  physicsStartButtonRef,
                  selectedIds,
                  physicsDurationSeconds,
                  physicsGravityPreset,
                  physicsGroundEnabled,
                  physicsPhase,
                  physicsProgress,
                  physicsSelectionUnavailableReason,
                  physicsError,
                  setPhysicsDurationSeconds,
                  setPhysicsGravityPreset,
                  setPhysicsGroundEnabled,
                  handleStartPhysicsPreview,
                  Camera,
                  sceneBaseDocument,
                  STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS,
                  shotNameDraft,
                  isCapturing,
                  isRestoringScene,
                  physicsInteractionLocked,
                  setShotNameDraft,
                  captureCurrentShot,
                  duplicateActiveShot,
                  Copy,
                  shotBatchSelectedIds,
                  savedShots,
                  setShotBatchExcludedIds,
                  shotBatchExportHeight,
                  setShotBatchExportHeight,
                  LT_EXPORT_HEIGHTS,
                  selectedShotBatchPasses,
                  STUDIO_BG3D_SHOT_BATCH_PASSES,
                  shotBatchPasses,
                  setShotBatchPasses,
                  STUDIO_BG3D_SHOT_BATCH_PASS_LABELS,
                  shotBatchIncludeLayeredPsd,
                  setShotBatchIncludeLayeredPsd,
                  shotBatchIncludeContactSheet,
                  setShotBatchIncludeContactSheet,
                  recoveryScope,
                  shotBatchBlockedReason,
                  exportSavedShotsAsZip,
                  isBatchRenderingShots,
                  Loader2,
                  Save,
                  shotBatchRecoverySummary,
                  shotBatchProgress,
                  shotBatchExcludedIds,
                  applySavedShot,
                  moveSavedShot,
                  removeSavedShot,
                  Trash2,
                  CAMERA_PRESETS,
                  applyCameraPreset,
                  zoomCameraBy,
                  ZoomIn,
                  ZoomOut,
                  Aperture,
                  isMainOrtho,
                  LtRangeControl,
                  STUDIO_BG3D_LENS_MIN_FOCAL_MM,
                  STUDIO_BG3D_LENS_MAX_FOCAL_MM,
                  currentFocalLengthMm,
                  updateCameraLens,
                  previewCameraLens,
                  finishCameraLensGesture,
                  studioBg3dFocalLengthToFovDegrees,
                  STUDIO_BG3D_LENS_PRESETS,
                  LtToggleRow,
                  twoPointPerspectiveActive,
                  applyTwoPointPerspective,
                  resetTwoPointPerspective,
                  RotateCcw,
                  lineArtPreview,
                  setLineArtPreview,
                  transparentInsert,
                  updateBackgroundTransparency,
                  SunMoon,
                  STUDIO_BG3D_MOOD_RIGS,
                  appliedMoodRig,
                  applyMoodRig,
                  updateLightingSettings,
                  updateRenderExposure,
                  sunLightState,
                  STUDIO_BG3D_SUN_TIME_PRESETS,
                  sunRigConfig,
                  applySunRigConfig,
                  formatBg3dSunTime,
                  Globe,
                  BG_SKY_PRESETS,
                  skyPresetId,
                  updateBackgroundSettings,
                  selectedSky,
                  panoramaRotation,
                  normalizePanoramaRotationDegrees,
                  PanoramaRotationNumberField,
                  CircleDashed,
                  STUDIO_BG3D_FOG_PRESETS,
                  getSkyPreset,
                  fogNear,
                  fogSliderMax,
                  STUDIO_BG3D_FOG_MIN_GAP,
                  fogFar,
                  Scissors,
                  sectionPlane,
                  setSectionPlane,
                  STUDIO_BG3D_SECTION_AXES,
                  STUDIO_BG3D_SECTION_AXIS_LABELS,
                  STUDIO_BG3D_SECTION_OFFSET_LIMIT,
                  scaleGuideVisible,
                  setScaleGuideVisible,
                  Ruler,
                }}
              />

              <section
                hidden={hideOnTab("view")}
                className="border-t border-line pt-4"
              >
                <StudioBg3dMeasurementPanel
                  document={measurementDocument}
                  draftMeasurement={measurementDraft}
                  inference={measurementInference}
                  lockedLengthMeters={measurementLockedLengthMeters}
                  disabled={Boolean(measurementDisabledReason) && !measurementActive}
                  onDocumentChange={setMeasurementDocument}
                  onLengthLockChange={handleMeasurementLengthLockChange}
                />
              </section>
              </div>

              <section
                hidden={hideOnTab("view")}
                className="border-t border-line pt-4"
              >
                <StudioBg3dImmersivePanel
                  support={webXrSupport}
                  sessionState={webXrSessionState}
                  onStart={startStudioBg3dWebXr}
                  onEnd={endStudioBg3dWebXr}
                  supportPending={webXrController === null && webXrSupport === null}
                  disabledReason={webXrDisabledReason}
                  savedShotCount={savedShots.length}
                />
              </section>

              <StudioBg3dLtPanel
                hidden={hideOnTab("lt")}
                context={{
                  ScanLine,
                  WandSparkles,
                  magicLayerEnabled,
                  setMagicLayerEnabled,
                  magicLayerUnavailableReason,
                  magicLayerSelectionName: magicLayerSelectedPrimitive?.name
                    ?? (magicLayerSelectedPrimitive
                      ? PRIMITIVE_DEFS[magicLayerSelectedPrimitive.kind].label
                      : null),
                  magicLayerBusy: isCapturing,
                  appliedLtPresetId,
                  applyLtPreset,
                  STUDIO_BG3D_LT_BUILT_IN_PRESETS,
                  ltUserPresetPayload,
                  appliedLtPreset,
                  Save,
                  STUDIO_BG3D_LT_PRESET_MAX_COUNT,
                  ltUserPresetLibraryStatus,
                  ChevronDown,
                  managedLtUserPreset,
                  STUDIO_BG3D_LT_PRESET_MAX_NAME_LENGTH,
                  ltUserPresetName,
                  setLtUserPresetName,
                  setLtDeleteConfirmId,
                  STUDIO_BG3D_LT_PRESET_MAX_DESCRIPTION_LENGTH,
                  ltUserPresetDescription,
                  setLtUserPresetDescription,
                  updateManagedLtUserPreset,
                  renameManagedLtUserPreset,
                  PencilLine,
                  ltDeleteConfirmId,
                  deleteManagedLtUserPreset,
                  Trash2,
                  saveCurrentLtAsUserPreset,
                  ltUserPresetNotice,
                  ltCaptureSizePreview,
                  sceneBaseDocument,
                  updateLtExportHeight,
                  LT_EXPORT_HEIGHTS,
                  ltExportAspectRatio,
                  ltCaptureAspectPresetId,
                  ltCaptureAspectPresets,
                  updateLtExportAspectRatio,
                  ltLineSettings,
                  LT_TONE_MODE_LABELS,
                  ltToneSettings,
                  LT_TONE_TYPE_LABELS,
                  lineArtPreview,
                  setLineArtPreview,
                  ltTonePreviewStyle,
                  ltEditorSection,
                  setLtEditorSection,
                  LtToggleRow,
                  updateLtLineSettings,
                  LtRangeControl,
                  updateLtToneSettings,
                  LT_TONE_PATTERN_LABELS,
                }}
              />

              <section hidden={hideOnTab("models")}>
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                        <Hexagon size={15} className="text-accent" aria-hidden />
                        범용 3D 모델
                      </h3>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                        GLB·glTF·OBJ/MTL 모델을 가져와 전체 변환, 리그 포즈, 애니메이션과 재질 상태를 확인합니다.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md border border-line bg-card px-2 py-1 text-[0.62rem] font-bold text-fg-3">
                      VRM 별도
                    </span>
                  </div>
                  <p className="mt-2 border-l-2 border-accent/55 pl-2.5 text-[0.65rem] leading-relaxed text-fg-3">
                    VRM 아바타의 humanoid·표정·이용 조건과 섞지 않고, 일반 모델의 실제 본·스킨·모프 구조만 사용합니다.
                  </p>
                </div>

                {selectedGenericModelManifest ? (
                  <div className="mb-5 space-y-2">
                    <StudioGeneric3dModelModePanel
                      manifest={selectedGenericModelManifest}
                      proxies={selectedGenericModelProxies}
                      controlMode={genericModelControlMode}
                      selectedProxyId={effectiveGenericModelProxyId}
                      onClassificationChange={changeSelectedGenericModelClassification}
                      onControlModeChange={changeGenericModelControlMode}
                      onProxySelect={selectGenericModelProxy}
                    />
                    <button
                      type="button"
                      className={cx(
                        CONTROL_BUTTON,
                        "w-full border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                      )}
                      onClick={() => handlePanelTabChange("shapes")}
                    >
                      <Move size={14} aria-hidden />
                      선택 모델 세부 변환·리그 편집 열기
                    </button>
                  </div>
                ) : selectedCustomModel ? (
                  <div
                    role="status"
                    className="mb-5 flex items-center gap-2 rounded-xl border border-line bg-card/55 px-3 py-3 text-xs text-fg-2"
                  >
                    <Loader2 size={14} className="shrink-0 animate-spin text-accent" aria-hidden />
                    선택 모델의 검증된 구조를 준비하는 중입니다.
                  </div>
                ) : (
                  <div className="mb-5 rounded-xl border border-dashed border-line bg-card/35 px-3 py-4 text-center">
                    <p className="text-xs font-bold text-fg-2">
                      {customModels.length > 0
                        ? "장면이나 레이어 탭에서 범용 3D 모델 하나를 선택하세요."
                        : "아래 라이브러리에서 범용 3D 파일을 가져오세요."}
                    </p>
                    <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
                      모델을 선택하면 리그·스킨·애니메이션·모프·기기 예산과 라이선스 상태를 한곳에서 확인할 수 있습니다.
                    </p>
                  </div>
                )}

                {modelsPanelActivated ? (
                  <Suspense
                    fallback={(
                      <div
                        aria-live="polite"
                        className="rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3"
                      >
                        3D 에셋 라이브러리를 불러오는 중입니다.
                      </div>
                    )}
                  >
                    <LazyStudioBg3dAssetLibraryPanel
                      entries={modelLibrary}
                      classificationByModelId={genericModelClassifications}
                      libraryStatus={modelLibraryStatus}
                      deletingModelId={deletingModelId}
                      isUploading={isUploadingModel}
                      importProgress={modelImportProgress}
                      isRestoringScene={isRestoringScene}
                      deviceProfileLabel={deviceQuality.profile === "mobile" ? "모바일" : "데스크톱"}
                      onFileChange={handleUploadModelFiles}
                      onCancelImport={() => modelImportAbortRef.current?.abort()}
                      onAdd={addCustomModelToScene}
                      onDelete={handleDeleteModelFromLibrary}
                    />
                  </Suspense>
                ) : null}
              </section>
    </>
  );
}
