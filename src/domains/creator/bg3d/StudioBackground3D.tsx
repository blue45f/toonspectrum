import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { OrthographicCamera } from "@react-three/drei/core/OrthographicCamera.js";
import { PerspectiveCamera } from "@react-three/drei/core/PerspectiveCamera.js";
import { TransformControls } from "@react-three/drei/core/TransformControls.js";
import { View } from "@react-three/drei/web/View.js";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Aperture,
  Boxes,
  Camera,
  ChevronDown,
  CircleDashed,
  Cone,
  Copy,
  Crosshair,
  Cylinder,
  Eye,
  EyeOff,
  Globe,
  Hexagon,
  Home,
  Layers,
  LayoutTemplate,
  Loader2,
  LocateFixed,
  Lock,
  Magnet,
  Maximize2,
  Move,
  MoveDown,
  PencilLine,
  Pill,
  Pyramid,
  Redo2,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  ScanLine,
  Scaling,
  Scissors,
  Trash2,
  Triangle,
  Torus as TorusIcon,
  SunMoon,
  Umbrella,
  Undo2,
  Unlock,
  Upload,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  Suspense,
  useEffect,
  useEffectEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  Fragment,
  lazy,
} from "react";
import { createPortal, flushSync } from "react-dom";
import * as THREE from "three";

import {
  createStudioBg3dAiMethodReferenceCapture,
  type StudioBg3dAiMethodReferenceCapture,
} from "../scene-3d/studio-3d-ai-reference-handoff";
import {
  COMPOSITE_CATEGORIES,
  COMPOSITE_CATEGORY_LABELS,
  COMPOSITE_PRESETS,
  instantiateCompositePreset,
  type BgCompositeCategory,
} from "../studio-background-3d-composites";
import {
  cloneBgCustomModelInstances,
  createBgCustomModelInstance,
  duplicateBgCustomModelInstance,
  isStudioBg3dThreeTwoBoneIkChainSupported,
  measureBg3dObjectSize,
  parseBg3dSceneWithModelsFromDataUrl,
  StudioBg3dThreeOperationError,
  type BgCustomModelInstance,
  type StudioBg3dThreeJointDescriptor,
  type StudioBg3dThreeMorphDescriptor,
} from "../studio-background-3d-model";
import {
  clonePrimitives,
  createPrimitive,
  duplicatePrimitive,
  PRIMITIVE_DEFS,
  type BgPrimitive,
  type BgPrimitiveKind,
} from "../studio-background-3d-primitives";
import {
  BG_SCENE_TEMPLATES,
  instantiateSceneTemplate,
  type BgSceneTemplateCategory,
} from "../studio-background-3d-scene-templates";
import {
  BG_SKY_PRESETS,
  getSkyPreset,
  normalizePanoramaRotationDegrees,
} from "../studio-background-3d-sky";
import {
  createStudioGeneric3dRightsFromAttachment,
  createStudioGeneric3dVerifiedManifest,
  type StudioGeneric3dClassification,
  type StudioGeneric3dSourceFormat,
} from "../studio-generic-3d-model-mode";
import { createStudioGeneric3dPoseProxies } from "../studio-generic-3d-pose-proxy";
import {
  mergeStudioGeneric3dWorkflowMaps,
  normalizeStudioGeneric3dClassification,
  normalizeStudioGeneric3dSourceFormat,
  parseStudioGeneric3dWorkflowMetadata,
} from "../studio-generic-3d-workflow-metadata";
import { createTwoBoneDefaultPoleTarget } from "../studio-rig-two-bone-ik";
import {
  createStudioShared3dCharacterShadowEntity,
} from "../studio-shared-3d-scene-runtime";
import {
  StudioGeneric3dModelModePanel,
  type StudioGeneric3dControlMode,
} from "../StudioGeneric3dModelModePanel";
import { StudioToolHintTarget } from "../StudioToolHint";
import { useStudioBg3dSharedCharacterStatus } from "../useStudioBg3dSharedCharacterStatus";
import { useStudioModalSheet } from "../useStudioModalSheet";

import { snapshotStudioBg3dLiveAnimationPlayback } from "./studio-bg3d-animation-time";
import {
  STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
  STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
  STUDIO_BG3D_NORMAL_PROFILE,
  STUDIO_BG3D_STABLE_ID_PROFILE,
  normalizeStudioBg3dArtifactCaptureResultV2,
} from "./studio-bg3d-artifact-capture-v2";
import { copyStudioBg3dBundledEnvironmentLibraryEntries } from "./studio-bg3d-bundled-environment-library";
import {
  isStudioBg3dViewportControlTarget,
  readStudioBg3dObjectWorldBounds,
  readStudioBg3dWorldSurfaceHit,
  type BgViewportApi,
} from "./studio-bg3d-camera-application";
import {
  fitStudioBg3dCameraToBounds,
} from "./studio-bg3d-camera-framing";
import {
  applyOrDeferStudioBg3dHistoryCamera,
  resolveStudioBg3dCameraGestureCommitView,
} from "./studio-bg3d-camera-history-transition";
import {
  createStudioBg3dCameraUpForDutchRoll,
  readStudioBg3dCameraDutchRollDegrees,
  resolveStudioBg3dCameraDistanceLimits,
  resolveStudioBg3dCameraNearClip,
  resolveStudioBg3dCameraUpVector,
} from "./studio-bg3d-camera-orientation";
import {
  createStudioBg3dCaptureBackgroundSnapshot,
  studioBg3dCaptureBackgroundRequestFromSnapshot,
  type StudioBg3dCaptureBackgroundSnapshot,
} from "./studio-bg3d-capture-background";
import { registerStudioBg3dCaptureExcludedObject } from "./studio-bg3d-capture-exclusion";
import {
  STUDIO_BG3D_CAPTURE_ASPECT_PRESETS,
  createStudioBg3dDocumentCaptureAspectPreset,
  matchStudioBg3dCaptureAspectPreset,
  normalizeStudioBg3dCaptureAspectRatio,
  resolveStudioBg3dCaptureFrame,
  resolveStudioBg3dCaptureFrameCameraSettings,
} from "./studio-bg3d-capture-frame-geometry";
import { applyStudioBg3dCaptureFrameViewOffset } from "./studio-bg3d-capture-frame-view-offset";
import {
  BgAnimationPlayhead,
  LtRangeControl,
  LtToggleRow,
  PanoramaRotationNumberField,
  Vec3Field,
} from "./studio-bg3d-control-fields";
import { StudioBg3dDestructiveMutationGuard } from "./studio-bg3d-destructive-mutation-guard";
import {
  deriveStudioBg3dGlbValidationPolicy,
  resolveStudioBg3dDeviceQuality,
  type StudioBg3dDeviceSignals,
} from "./studio-bg3d-device-quality";
import {
  acquireStudioBg3dCaptureAdapterAfterViewTransition,
  CAMERA_PRESETS,
  canonicalSceneDocument,
  captureStudioBg3dRaster,
  collectDeviceSignals,
  createStudioBg3dHistorySnapshot,
  createStudioBg3dShotId,
  degToRad,
  describeStudioBg3dPhysicsStatus,
  eulerDegreesToQuaternion,
  formatBg3dSunTime,
  generateLtUserPresetId,
  getStudioBg3dCaptureSourceSize,
  loadStudioBg3dThreeWebglCaptureRuntime,
  ltTonePreviewStyle,
  ltUserPresetFailureMessage,
  matchingLtPreset,
  quaternionToEulerDegrees,
  radToDeg,
  resolveDeviceQuality,
  SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE,
  studioBg3dHistoryDocumentAtView,
  studioBg3dMagicCaptureCompatibilityMessage,
  waitForStudioBg3dPaintFrame,
  type BrowserNavigatorCapabilities,
  type StudioBg3dHistorySnapshot,
} from "./studio-bg3d-editor-derivations";
import { createStudioBg3dModelImportActions } from "./studio-bg3d-editor-model-import-actions";
import {
  STUDIO_BG3D_CONTROL_BUTTON as CONTROL_BUTTON,
  STUDIO_BG3D_ICON_BUTTON as ICON_BUTTON,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";
import {
  canSetStudioBg3dParent,
  collectStudioBg3dEffectivelyVisibleEntityIds,
  resolveStudioBg3dHierarchy,
} from "./studio-bg3d-hierarchy";
import {
  planStudioBg3dImmersiveStage,
  studioBg3dImmersiveStageFailureMessage,
} from "./studio-bg3d-immersive-stage";
import {
  resolveStudioBg3dInsertBackgroundFromDocument,
  resolveStudioBg3dInsertBackgroundMode,
} from "./studio-bg3d-insert-background-mode";
import {
  STUDIO_BG3D_LENS_MAX_FOCAL_MM,
  STUDIO_BG3D_LENS_MIN_FOCAL_MM,
  STUDIO_BG3D_LENS_PRESETS,
  computeStudioBg3dTwoPointPerspective,
  isStudioBg3dTwoPointPerspectiveActive,
  studioBg3dFocalLengthToFovDegrees,
  studioBg3dFovDegreesToFocalLength,
} from "./studio-bg3d-lens";
import { resolveStudioBg3dLtCaptureSize } from "./studio-bg3d-lt-capture-size";
import { encodeStudioBg3dLtLayers } from "./studio-bg3d-lt-layer-encoder";
import {
  EMPTY_STUDIO_BG3D_LT_USER_PRESET_PAYLOAD,
  createStudioBg3dLtUserPreset,
  deleteStudioBg3dLtUserPreset,
  renameStudioBg3dLtUserPreset,
  upsertStudioBg3dLtUserPreset,
  type StudioBg3dLtUserPresetMutationResult,
  type StudioBg3dLtUserPresetMutationSuccess,
} from "./studio-bg3d-lt-preset-library";
import { getProductStudioBg3dLtPresetSqliteRepository } from "./studio-bg3d-lt-preset-repository-loader";
import {
  STUDIO_BG3D_LT_BUILT_IN_PRESETS,
  STUDIO_BG3D_LT_PRESET_MAX_COUNT,
  STUDIO_BG3D_LT_PRESET_MAX_DESCRIPTION_LENGTH,
  STUDIO_BG3D_LT_PRESET_MAX_NAME_LENGTH,
  applyStudioBg3dLtPreset,
  type StudioBg3dLtPresetPayload,
} from "./studio-bg3d-lt-presets";
import {
  renderStudioBg3dLtLayers,
  STUDIO_BG3D_LT_RENDER_MAX_PIXELS,
  type StudioBg3dLtRenderSettings,
} from "./studio-bg3d-lt-render";
import {
  renderStudioBg3dLtLayersInWorker,
  StudioBg3dLtRenderWorkerError,
} from "./studio-bg3d-lt-render-worker-client";
import {
  buildStudioBg3dMagicFilterMask,
} from "./studio-bg3d-magic-filter-mask";
import {
  encodeStudioBg3dMagicMaskPngDataUrl,
} from "./studio-bg3d-magic-mask-png";
import {
  captureStudioBg3dMagicObjectIds,
  STUDIO_BG3D_MAGIC_OBJECT_ID_RUNTIME_CAPABILITIES,
  type StudioBg3dMagicBabylonBackend,
} from "./studio-bg3d-magic-object-id-capture";
import {
  resolveStudioBg3dMagicSelection,
  type StudioBg3dMagicSelectionSnapshot,
} from "./studio-bg3d-magic-selection";
import {
  STUDIO_BG3D_MEASUREMENT_MAX_REFERENCES,
  classifyStudioBg3dMeasurementInference,
  createStudioBg3dMeasurementDocument,
  formatStudioBg3dMeasurementLength,
  lockStudioBg3dMeasurementLength,
  measureStudioBg3dWorldPoints,
  resolveStudioBg3dMeasurementGuide,
  type StudioBg3dMeasurementDocument,
  type StudioBg3dMeasurementInferenceReference,
  type StudioBg3dMeasurementInferenceSuccess,
  type StudioBg3dMeasurementVec3,
  type StudioBg3dWorldMeasurement,
} from "./studio-bg3d-measurement";
import { readStudioBg3dMeasurementPointFromThreeEvent } from "./studio-bg3d-measurement-three-adapter";
import {
  StudioBg3dStaleModalOperationError,
  studioBg3dModalOperationCoordinator,
  type StudioBg3dModalSession,
} from "./studio-bg3d-modal-operation-coordinator";
import {
  createStudioBg3dModelAttachment,
  getStoredBg3dModelV12 as getStoredBg3dModel,
  getStoredBg3dModelByHashV12 as getStoredBg3dModelByHash,
  listBg3dModelLibraryEntriesV12 as listBg3dModelLibraryEntries,
  resolveBg3dModelHashV12 as resolveBg3dModelHash,
  type Bg3dModelLibraryEntry,
  type Bg3dVerifiedStoredRecord,
} from "./studio-bg3d-model-library-loader";
import {
  assertStudioBg3dModelAttachmentAdmission,
  calculateStudioBg3dPlacedModelBytes,
  StudioBg3dModelPlacementAdmissionError,
  totalStudioBg3dModelAttachmentBytes,
} from "./studio-bg3d-model-placement-admission";
import {
  admitAndCacheStudioBg3dModel as admitAndCacheModel,
  attachmentMatchesRecord,
  bindModelAttachment,
  disposeStudioBg3dModelCache as disposeModelCache,
  readGenericWorkflowMapsFromAttachments,
  withStudioGeneric3dWorkflowMetadata,
  type StudioBg3dModelRootCacheEntry as ModelRootCacheEntry,
} from "./studio-bg3d-model-runtime-admission";
import { encodeStudioBg3dModelThumbnailPng } from "./studio-bg3d-model-thumbnail-encode";
import {
  applyStudioBg3dMoodRig,
  resolveStudioBg3dAppliedMoodRig,
  STUDIO_BG3D_MOOD_RIGS,
} from "./studio-bg3d-mood-rigs";
import {
  applyStudioBg3dSnapToTransform,
  DEFAULT_STUDIO_BG3D_SNAP_SETTINGS,
  filterStudioBg3dLayerItems,
  groundModelTransform,
  groundPrimitiveTransform,
  isBgObjectLocked,
  isBgObjectTransformBlocked,
  isBgObjectVisible,
  normalizeStudioBg3dSnapSettings,
  STUDIO_BG3D_ROTATE_STEP_OPTIONS_DEG,
  STUDIO_BG3D_TRANSLATE_STEP_OPTIONS,
  studioBg3dSnapSettingsSummary,
  type StudioBg3dLayerListItem,
  type StudioBg3dSnapSettings,
} from "./studio-bg3d-object-ops";
import { deriveStudioBg3dVanishingPoints } from "./studio-bg3d-perspective-bridge";
import {
  applyStudioBg3dPhysicsTransforms,
  createStudioBg3dPhysicsWorld,
  STUDIO_BG3D_PHYSICS_MAX_DYNAMIC_BODIES,
  type StudioBg3dPhysicsTransformSample,
  type StudioBg3dPhysicsWorld,
} from "./studio-bg3d-physics";
import {
  createStudioBg3dPhysicsSessionSourceToken,
  isStudioBg3dPhysicsSessionSourceCurrent,
} from "./studio-bg3d-physics-session";
import {
  createStudioBg3dPhysicsThreeJob,
  measureStudioBg3dPhysicsModelLocalBounds,
  projectStudioBg3dPhysicsSamples,
  STUDIO_BG3D_PHYSICS_PROJECTION_ROOT_USER_DATA_KEY,
} from "./studio-bg3d-physics-three";
import {
  sampleStudioBg3dPhysicsTimeline,
  type StudioBg3dPhysicsTimelineResult,
} from "./studio-bg3d-physics-timeline";
import {
  isStudioBg3dPhysicsTransientPhase,
  STUDIO_BG3D_PHYSICS_GRAVITY,
  type StudioBg3dPhysicsGravityPreset,
  type StudioBg3dPhysicsPhase,
} from "./studio-bg3d-physics-ui";
import { planStudioBg3dModelPlacementRecipe } from "./studio-bg3d-placement-recipe";
import {
  createStudioBg3dPlacementSession,
  transitionStudioBg3dPlacementSession,
  type StudioBg3dPlacementPointerTarget,
  type StudioBg3dPlacementSessionState,
} from "./studio-bg3d-placement-session";
import { calculateStudioBg3dProceduralSceneUsage } from "./studio-bg3d-procedural-scene-usage";
import {
  getStudioBg3dProceduralStarterAsset,
  planStudioBg3dProceduralStarterInsertion,
  type StudioBg3dProceduralInsertionPlan,
} from "./studio-bg3d-procedural-starter-pack";
import {
StudioBg3dPrimitiveGeometryPool,
} from "./studio-bg3d-render-optimization";
import { resolveStudioBg3dFrameLoop } from "./studio-bg3d-render-policy";
import { resolveStudioBg3dReturnFocus } from "./studio-bg3d-return-focus";
import { createStudioBg3dRigPoseBakeHistoryTransition } from "./studio-bg3d-rig-pose-bake";
import {
  mutateStudioBg3dAimConstraint,
  mutateStudioBg3dPoseOverride,
  mutateStudioBg3dTwoBoneIkConstraint,
  resolveStudioBg3dRigSelection,
  type StudioBg3dRigSelectionState,
} from "./studio-bg3d-rig-selection";
import {
  clampStudioBg3dRoomSpec,
  getStudioBg3dRoomPreset,
  instantiateStudioBg3dRoomBuild,
  type StudioBg3dRoomSpec,
} from "./studio-bg3d-room-builder";
import {
  createStudioBg3dRuntimeSnapshot,
  type StudioBg3dRuntimeAdapter,
} from "./studio-bg3d-runtime-adapter";
import {
  DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK,
  DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER,
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
  DEFAULT_STUDIO_BG3D_POSE_LAYER,
  DEFAULT_STUDIO_BG3D_MORPH_LAYER,
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS,
  STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS,
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  duplicateStudioBg3dShot,
  moveStudioBg3dShot,
  normalizeStudioBg3dSceneDocument,
  removeStudioBg3dShot,
  type StudioBg3dCameraSettings,
  type StudioBg3dBackgroundSettings,
  type StudioBg3dLineOutputSettings,
  type StudioBg3dAnimationPlayback,
  type StudioBg3dConstraintLayer,
  type StudioBg3dLightingSettings,
  type StudioBg3dMaterialOverride,
  type StudioBg3dPoseLayer,
  type StudioBg3dMorphLayer,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneDocument,
  type StudioBg3dToneOutputSettings,
} from "./studio-bg3d-scene-document";
import {
  STUDIO_BG3D_FOG_MIN_GAP,
  STUDIO_BG3D_FOG_PRESETS,
} from "./studio-bg3d-scene-fog";
import {
  planStudioBg3dDeletedAttachmentReconciliation,
  planStudioBg3dSceneEntityRemoval,
  type StudioBg3dSceneRemovalSuccess,
} from "./studio-bg3d-scene-removal";
import {
  hydrateStudioBg3dDocumentToRuntime,
  tryAdaptStudioBg3dRuntimeToDocument,
} from "./studio-bg3d-scene-runtime";
import {
  DEFAULT_STUDIO_BG3D_SECTION_PLANE_STATE,
  STUDIO_BG3D_SECTION_AXES,
  STUDIO_BG3D_SECTION_AXIS_LABELS,
  STUDIO_BG3D_SECTION_OFFSET_LIMIT,
  type StudioBg3dSectionPlaneState,
} from "./studio-bg3d-section-plane";
import {
  createStudioBg3dSemanticRenderPassPlan,
  type StudioBg3dSemanticMaterialConfidence,
  type StudioBg3dSemanticMaterialSlot,
} from "./studio-bg3d-semantic-materials";
import {
  collectStudioBg3dShadowSceneBounds,
  fitStudioBg3dDirectionalShadowFrustum,
  readStudioBg3dShadowGeometryLocalBounds,
  readStudioBg3dShadowModelLocalBounds,
} from "./studio-bg3d-shadow-frustum";
import {
  acquireStudioBg3dSharedCharacterCaptureAuthorityLease,
  verifyStudioBg3dSharedCharacterCaptureAuthorityLease,
  type StudioBg3dSharedCharacterCaptureAuthorityInput,
  type StudioBg3dSharedCharacterCaptureAuthorityLease,
} from "./studio-bg3d-shared-character-capture-authority";
import {
  createStudioBg3dLinkedCharacterCapture,
  createStudioBg3dSharedCharacterGroundSurfaceRevision,
  resolveStudioBg3dSharedStageMutationBlockedReason,
} from "./studio-bg3d-shared-stage-projection";
import { createStudioBg3dShotBatchExportRunner } from "./studio-bg3d-shot-batch-export-run";
import {
  STUDIO_BG3D_SHOT_BATCH_PASSES,
  STUDIO_BG3D_SHOT_BATCH_PASS_LABELS,
} from "./studio-bg3d-shot-batch-pass-catalog";
import { projectStudioBg3dShotVisibilityToRuntime } from "./studio-bg3d-shot-runtime";
import {
  createStudioBg3dBabylonDiagnosticDocument,
  hasStudioBg3dBabylonDiagnosticBeautyVariation,
  hasStudioBg3dBabylonDiagnosticDepthVariation,
  hasStudioBg3dBabylonDiagnosticNormalVariation,
  hasStudioBg3dBabylonDiagnosticStableIds,
  studioBg3dBabylonDiagnosticErrorMessage,
} from "./studio-bg3d-specialist-diagnostic-support";
import {
  DEFAULT_STUDIO_BG3D_SUN_RIG_CONFIG,
  STUDIO_BG3D_SUN_TIME_PRESETS,
  applyStudioBg3dSunRig,
  resolveStudioBg3dSunLightState,
  type StudioBg3dSunRigConfig,
} from "./studio-bg3d-sun-rig";
import {
  collectStudioBg3dSurfaceSelectionSubtreeIds,
  collectStudioBg3dSurfaceTargetPathIds,
  planStudioBg3dMultiSurfaceSnap,
  STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS,
  type ResolveStudioBg3dSurfaceSnapInput,
} from "./studio-bg3d-surface-snap";
import {
  deleteBg3dTemplateV12 as deleteBg3dTemplate,
  instantiateBg3dTemplateDocument,
  listBg3dTemplatesV12 as listBg3dTemplates,
  saveBg3dTemplateV12 as saveBg3dTemplate,
  type Bg3dTemplateLibraryEntry,
} from "./studio-bg3d-template-library-loader";
import {
  calculateStudioBg3dThreeReparentTransform,
  calculateStudioBg3dThreeWorldMatrix,
  calculateStudioBg3dThreeWorldDeltaTransform,
} from "./studio-bg3d-three-hierarchy";
import { resolveStudioBg3dThreeCenterGroundLocalPosition } from "./studio-bg3d-three-model-alignment";
import { applyStudioBg3dThreeWebglRenderSettings } from "./studio-bg3d-three-render-settings";
import { StudioBg3dActionFooter } from "./StudioBg3dActionFooter";
import { StudioBg3dDirectionalShadowLight } from "./StudioBg3dDirectionalShadowLight";
import { StudioBg3dImmersivePanel } from "./StudioBg3dImmersivePanel";
import { StudioBg3dLtPanel } from "./StudioBg3dLtPanel";
import { StudioBg3dMeasurementPanel } from "./StudioBg3dMeasurementPanel";
import { StudioBg3dMeasurementViewport } from "./StudioBg3dMeasurementViewport";
import {
  StudioBg3dPhysicsPanel,
  StudioBg3dPhysicsTransport,
} from "./StudioBg3dPhysicsControls";
import { StudioBg3dPlacementPointerController } from "./StudioBg3dPlacementPointerController";
import { StudioBg3dRoomBuilderPanel } from "./StudioBg3dRoomBuilderPanel";
import { StudioBg3dSceneFog } from "./StudioBg3dSceneFog";
import {
  BgAdaptiveDprController,
  BgCustomModelInstanceBatch,
  BgCustomModelMesh,
  BgGroundHelper,
  BgPlacementPreview,
  BgPrimitiveMesh,
  BgScaleGuide,
  BgSectionPlaneController,
  BgViewportController,
  SkyClearColorController,
  StudioBg3dWebglRenderSettingsController,
  type StudioBg3dPlacementPreviewAsset,
  type StudioBg3dRigBakeReader,
} from "./StudioBg3dSceneNodes";
import { StudioBg3dScenePanorama } from "./StudioBg3dScenePanorama";
import { StudioBg3dSceneTemplatePanel } from "./StudioBg3dSceneTemplatePanel";
import { StudioBg3dShapesPanel } from "./StudioBg3dShapesPanel";
import { StudioBg3dSharedCharacterSceneContent } from "./StudioBg3dSharedCharacterSceneContent";
import { StudioBg3dSharedCharacterStatusOverlay } from "./StudioBg3dSharedCharacterStatusOverlay";
import { StudioBg3dSharedStagePanel } from "./StudioBg3dSharedStagePanel";
import {
  StudioBg3dViewPanel,
  type StudioBg3dBabylonDiagnosticBackend,
  type StudioBg3dBabylonDiagnosticState,
} from "./StudioBg3dViewPanel";
import {
  StudioBg3dImmersiveRenderBridge,
  StudioBg3dWebXrSessionBridge,
} from "./StudioBg3dWebXrSessionBridge";


import type {
  StudioBg3dCaptureAdapter,
  StudioBg3dCaptureRequest,
} from "./studio-bg3d-capture-adapter";
import type { StudioBg3dImmersiveStagePlan } from "./studio-bg3d-immersive-stage";
import type { StudioBg3dImportProgress } from "./studio-bg3d-model-import";
import type { StudioBg3dModelThumbnailCaptureController } from "./studio-bg3d-model-thumbnail-capture";
import type { StudioBg3dModelThumbnailThreeCaptureHandle } from "./studio-bg3d-model-thumbnail-three-capture";
import type {
  StudioBg3dPhysicsTimelineWorkerSession,
} from "./studio-bg3d-physics-worker-client";
import type { StudioBg3dRuntimeCapability } from "./studio-bg3d-runtime-topology";
import type { StudioBg3dShotBatchPass } from "./studio-bg3d-shot-batch-pass-catalog";
import type { StudioBg3dShotBatchRecoveryScope } from "./studio-bg3d-shot-batch-plan";
import type {
  StudioBg3dShotBatchRecoverySession,
  StudioBg3dShotBatchRecoveryStore,
} from "./studio-bg3d-shot-batch-recovery-store";
import type {
  StudioBackground3DInsertResult,
} from "../scene-3d/studio-3d-insert-contract";
import type { StudioShared3dSceneSession } from "../studio-shared-3d-scene-bridge";
import type { StudioShared3dStageResolution } from "../studio-shared-3d-stage-document";
import type { StudioToolHintSpec } from "../studio-tool-hints";
import type {
  StudioWebXrMode,
  StudioWebXrSessionController,
  StudioWebXrSessionState,
  StudioWebXrSupportSnapshot,
} from "../studio-webxr-session";

export type {
  StudioBackground3DInsertResult,
  StudioBackground3DLtLayer,
} from "../scene-3d/studio-3d-insert-contract";

const LazyStudioBg3dAssetLibraryPanel = lazy(() =>
  import( "./StudioBg3dAssetLibraryPanel").then(({ StudioBg3dAssetLibraryPanel }) => ({
    default: StudioBg3dAssetLibraryPanel,
  }))
);

export interface StudioBackground3DProps {
  open: boolean;
  initialDataUrl?: string;
  initialScene?: StudioBg3dSceneDocument;
  /**
   * One-shot seed from Elements 3D rail: apply a scene template after open, then call
   * `onSeedObjectInsertConsumed`.
   */
  seedSceneTemplateId?: string | null;
  /** One-shot seed: spawn a primitive kind after open. */
  seedPrimitiveKind?: BgPrimitiveKind | null;
  onSeedObjectInsertConsumed?: () => void;
  /** Runtime-only page composition. Character documents remain owned by their source layers. */
  sharedSceneSession?: StudioShared3dSceneSession;
  /** Page-persistent association state for the exact LT bundle being edited. */
  sharedStageResolution?: StudioShared3dStageResolution;
  /** Page + target-bundle ownership boundary for runtime-only Shared Stage editor state. */
  sharedStageSessionScopeKey: string;
  /** Exact shared VRM sources already used by another background and reusable here. */
  sharedCharactersLinkedToOtherBackgroundCount?: number;
  /** Whether the result creates a new canvas element or replaces an existing one. */
  operation?: "insert" | "update";
  recoveryScope: StudioBg3dShotBatchRecoveryScope | null;
  validateRecoveryAccess: (
    scope: StudioBg3dShotBatchRecoveryScope,
    signal: AbortSignal,
  ) => Promise<boolean>;
  /** Keeps the owning R3F Canvas mounted, but hidden, while a non-cancellable XR attach settles. */
  onWebXrCleanupPendingChange?: (pending: boolean) => void;
  onClose: () => void;
  onInsert: (
    result: StudioBackground3DInsertResult,
  ) => boolean | void | Promise<boolean | void>;
  onUseAsAiMethodReference?: (
    capture: StudioBg3dAiMethodReferenceCapture,
  ) => boolean | void | Promise<boolean | void>;
  /** 편집 중인 문서 캔버스 크기. 주어지면 "문서 캔버스 비율" 캡처 프리셋이 목록에 추가된다. */
  documentCanvasSize?: { readonly width: number; readonly height: number };
}

type TransformModeId = "translate" | "rotate" | "scale";
type TransformSpace = "local" | "world";
type BgPanelTab = "shapes" | "templates" | "layers" | "view" | "lt" | "models";
type ViewEditorSection = "camera" | "physics";
type LtEditorSection = "line" | "tone";
const VIEW_EDITOR_SECTIONS = [
  { id: "camera", label: "카메라 · 환경" },
  { id: "physics", label: "물리 배치" },
] as const satisfies readonly { id: ViewEditorSection; label: string }[];
type LtUserPresetLibraryStatus =
  | "idle"
  | "ready"
  | "saving"
  | "memory-only";
type LtUserPresetNoticeTone = "info" | "success" | "error";
type LtUserPresetNotice = {
  readonly tone: LtUserPresetNoticeTone;
  readonly message: string;
};
/** Couples a capture adapter with the exact live camera whose view window it renders. */
type CaptureState = {
  adapter: StudioBg3dCaptureAdapter | null;
  camera: THREE.Camera | null;
};

interface StudioBg3dPhysicsSession {
  readonly document: StudioBg3dSceneDocument;
  readonly world: StudioBg3dPhysicsWorld;
  readonly timeline: StudioBg3dPhysicsTimelineResult;
  readonly initialDynamicSamples: readonly StudioBg3dPhysicsTransformSample[];
  readonly sourceToken: string;
}

interface ModelThumbnailGpuLease {
  readonly released: Promise<void>;
  release(): void;
}

type StudioBg3dModelThumbnailCaptureControllerConstructor =
  typeof import( "./studio-bg3d-model-thumbnail-capture").StudioBg3dModelThumbnailCaptureController;

interface StudioBg3dModelThumbnailRuntime {
  readonly CaptureController: StudioBg3dModelThumbnailCaptureControllerConstructor;
  readonly createThreeCapture:
    typeof import("./studio-bg3d-model-thumbnail-three-capture").createStudioBg3dModelThumbnailThreeCapture;
}

let studioBg3dModelThumbnailRuntimePromise: Promise<StudioBg3dModelThumbnailRuntime> | null = null;

function loadStudioBg3dModelThumbnailRuntime(): Promise<StudioBg3dModelThumbnailRuntime> {
  const existing = studioBg3dModelThumbnailRuntimePromise;
  if (existing) return existing;
  const pending = Promise.all([
    import("./studio-bg3d-model-thumbnail-capture"),
    import("./studio-bg3d-model-thumbnail-three-capture"),
  ]).then(([captureModule, threeCaptureModule]) => Object.freeze({
    CaptureController: captureModule.StudioBg3dModelThumbnailCaptureController,
    createThreeCapture: threeCaptureModule.createStudioBg3dModelThumbnailThreeCapture,
  }));
  studioBg3dModelThumbnailRuntimePromise = pending;
  void pending.catch(() => {
    if (studioBg3dModelThumbnailRuntimePromise === pending) {
      studioBg3dModelThumbnailRuntimePromise = null;
    }
  });
  return pending;
}

const VIEWPORT_BTN =
  "grid size-11 place-items-center rounded-lg border border-line/70 bg-panel/80 text-fg-2 shadow-sm backdrop-blur transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-9";
const DEFAULT_LT_USER_PRESET_DESCRIPTION = "현재 장면에서 저장한 LT 선화·톤 설정입니다.";
const EMPTY_THREE_ANIMATION_CLIPS: readonly THREE.AnimationClip[] = Object.freeze([]);
const EMPTY_THREE_JOINTS: readonly StudioBg3dThreeJointDescriptor[] = Object.freeze([]);
const EMPTY_THREE_MORPH_TARGETS: readonly StudioBg3dThreeMorphDescriptor[] = Object.freeze([]);

const STUDIO_BG3D_LT_INSERT_SYNC_FALLBACK_MAX_PIXELS = 1_048_576;
const STUDIO_BG3D_LT_INSERT_WORKER_TIMEOUT_MS = 120_000;

const BG_PANEL_TABS: Array<{ id: BgPanelTab; label: string; icon: typeof Boxes; hint: string }> = [
  { id: "shapes", label: "도형", icon: Boxes, hint: "추가 · 선택한 도형 수치 편집" },
  { id: "templates", label: "템플릿", icon: LayoutTemplate, hint: "교실·거리·카페처럼 완성된 공간을 한 번에 추가" },
  { id: "layers", label: "레이어", icon: Layers, hint: "목록 · 선택 · 복제 · 삭제" },
  { id: "view", label: "보기", icon: Camera, hint: "카메라 프리셋 · 선화 미리보기" },
  { id: "lt", label: "LT", icon: ScanLine, hint: "컬러 · 선화 · 톤 출력 설정" },
  { id: "models", label: "에셋", icon: Hexagon, hint: "캐릭터 · 크리처 · 소품과 범용 3D 모델" },
];

const TRANSFORM_MODES: Array<{
  id: TransformModeId;
  label: string;
  icon: typeof Move;
  hint: StudioToolHintSpec;
}> = [
  {
    id: "translate",
    label: "이동",
    icon: Move,
    hint: {
      id: "bg3d:transform:translate",
      title: "3D 객체 이동",
      description: "선택한 배경 객체의 축 기즈모를 끌어 장면 안에서 위치를 조정합니다.",
      shortcut: "T",
      preview: "object-translate",
      tip: "스냅을 켜면 현재 이동 간격에 맞춰 정확하게 배치할 수 있어요.",
    },
  },
  {
    id: "rotate",
    label: "회전",
    icon: RotateCw,
    hint: {
      id: "bg3d:transform:rotate",
      title: "3D 객체 회전",
      description: "선택한 배경 객체의 회전 링을 끌어 X·Y·Z축 방향을 조정합니다.",
      shortcut: "R",
      preview: "object-rotate",
      tip: "회전 스냅을 켜면 일정한 각도로 건물과 소품의 방향을 맞출 수 있어요.",
    },
  },
  {
    id: "scale",
    label: "크기",
    icon: Scaling,
    hint: {
      id: "bg3d:transform:scale",
      title: "3D 객체 크기",
      description: "선택한 배경 객체의 스케일 핸들을 끌어 축별 크기를 조정합니다.",
      shortcut: "S",
      preview: "object-scale",
      tip: "형태가 뒤틀리지 않게 하려면 축 중앙의 균일 크기 핸들을 사용하세요.",
    },
  },
];

const BG3D_VIEWPORT_HINTS = {
  quad: {
    id: "bg3d:view:quad",
    title: "4분할 뷰 열기",
    description: "다음 클릭으로 원근·위·앞·오른쪽 시점을 함께 열어 객체의 깊이와 정렬을 확인합니다.",
    preview: "quad-view",
    previewVariant: "open",
    tip: "정면과 측면을 함께 보면서 배치하면 원근 화면에서 생기는 겹침을 줄일 수 있어요.",
  },
  undo: {
    id: "bg3d:history:undo",
    title: "3D 작업 실행 취소",
    description: "직전에 적용한 3D 장면 편집을 한 단계 되돌립니다.",
    shortcut: "⌘Z",
    preview: "undo",
  },
  redo: {
    id: "bg3d:history:redo",
    title: "3D 작업 다시 실행",
    description: "실행 취소한 3D 장면 편집을 다시 적용합니다.",
    shortcut: "⌘⇧Z",
    preview: "redo",
  },
  snap: {
    id: "bg3d:transform:snap",
    title: "변형 스냅 켜기",
    description: "다음 클릭으로 이동과 회전을 설정한 간격에 맞춰 붙여 배경 구조를 반듯하게 정렬합니다.",
    preview: "object-snap",
    previewVariant: "enable",
    tip: "세부 간격과 적용 축은 도형 패널의 변형 스냅에서 바꿀 수 있어요.",
  },
  ground: {
    id: "bg3d:object:ground",
    title: "바닥에 접지",
    description: "선택한 도형이나 모델의 가장 낮은 지점을 계산해 바닥 높이에 정확히 맞춥니다.",
    preview: "object-ground",
  },
  originGround: {
    id: "bg3d:object:origin-ground",
    title: "원점 · 바닥 정렬",
    description: "선택한 객체의 실제 지오메트리 경계를 XZ 원점 중앙에 놓고 가장 낮은 지점을 Y=0에 맞춥니다.",
    preview: "object-ground",
    tip: "피벗이 모델 밖에 있는 OBJ·GLB도 보이는 지오메트리를 기준으로 정렬합니다.",
  },
  surfaceSnap: {
    id: "bg3d:object:surface-snap",
    title: "표면에 붙이기",
    description: "선택한 객체를 다른 3D 객체의 클릭한 면에 한 번에 배치합니다. 선택과 회전은 그대로 유지됩니다.",
    preview: "object-snap",
    previewVariant: "enable",
    tip: "버튼을 누른 뒤 대상 표면을 클릭하세요. 선택 객체와 그 자식은 대상으로 사용하지 않습니다.",
  },
  focus: {
    id: "bg3d:camera:focus-selection",
    title: "선택 객체 화면 맞춤",
    description: "선택한 객체의 실제 지오메트리 경계를 계산해 현재 원근 또는 직교 화면에 여백과 함께 맞춥니다.",
    preview: "camera-zoom",
  },
  zoomIn: {
    id: "bg3d:camera:zoom-in",
    title: "3D 화면 확대",
    description: "카메라를 장면 안쪽으로 이동해 선택한 배경의 세부를 크게 봅니다.",
    preview: "camera-zoom",
  },
  zoomOut: {
    id: "bg3d:camera:zoom-out",
    title: "3D 화면 축소",
    description: "카메라를 장면 바깥쪽으로 이동해 배경 전체의 구도와 여백을 확인합니다.",
    preview: "camera-zoom",
  },
  resetView: {
    id: "bg3d:camera:reset",
    title: "3D 시점 초기화",
    description: "카메라 위치와 바라보는 지점을 기본 원근 구도로 되돌립니다.",
    preview: "camera-reset",
  },
  linePreview: {
    id: "bg3d:view:line-preview",
    title: "선화 미리보기 켜기",
    description: "다음 클릭으로 재질색 대신 외곽선 중심의 장면을 표시해 웹툰 배경 선화 밀도를 확인합니다.",
    preview: "line-art",
    previewVariant: "enable",
    tip: "최종 레이어 분리는 LT 탭의 선화·컬러·톤 설정을 사용합니다.",
  },
} satisfies Record<string, StudioToolHintSpec>;

const ADD_BUTTONS: Array<{ kind: BgPrimitiveKind; label: string; icon: typeof Boxes }> = [
  { kind: "box", label: "상자 추가", icon: Boxes },
  { kind: "cylinder", label: "원기둥 추가", icon: Cylinder },
  { kind: "plane", label: "평면 추가", icon: RectangleHorizontal },
  { kind: "sphere", label: "구 추가", icon: Globe },
  { kind: "hemisphere", label: "반구(돔) 추가", icon: Umbrella },
  { kind: "cone", label: "원뿔 추가", icon: Cone },
  { kind: "pyramid", label: "각뿔 추가", icon: Pyramid },
  { kind: "triangularPrism", label: "삼각기둥(지붕) 추가", icon: Triangle },
  { kind: "hexPrism", label: "육각기둥 추가", icon: Hexagon },
  { kind: "torus", label: "고리 추가", icon: TorusIcon },
  { kind: "tube", label: "파이프 추가", icon: CircleDashed },
  { kind: "ring", label: "평면 고리 추가", icon: CircleDashed },
  { kind: "capsule", label: "캡슐 추가", icon: Pill },
];

const LT_TONE_MODE_LABELS: Record<StudioBg3dToneOutputSettings["mode"], string> = {
  none: "베이스 없음 (선만)",
  flat: "원본 렌더",
  cel: "셀 명암",
  screentone: "스크린톤",
};

const LT_TONE_TYPE_LABELS: Record<StudioBg3dToneOutputSettings["type"], string> = {
  color: "재질색 보존",
  grayscale: "그레이스케일",
  pattern: "패턴",
};

const LT_TONE_PATTERN_LABELS: Record<StudioBg3dToneOutputSettings["pattern"], string> = {
  dot: "도트",
  line: "평행선",
  crosshatch: "교차선",
  noise: "노이즈",
};

const LT_EXPORT_HEIGHTS = [640, 1_080, 1_440, 2_160, 4_096] as const;

const SEMANTIC_MATERIAL_SLOT_LABELS: Record<StudioBg3dSemanticMaterialSlot, string> = {
  skin: "피부",
  hair: "머리카락",
  eyes: "눈",
  clothes: "의상",
  accessory: "액세서리",
  background: "배경",
  unknown: "검토 필요",
};

const SEMANTIC_MATERIAL_CONFIDENCE_LABELS: Record<StudioBg3dSemanticMaterialConfidence, string> = {
  none: "근거 없음",
  low: "낮음",
  medium: "보통",
  high: "높음",
  confirmed: "사용자 확인",
};

interface StudioBg3dBabylonSpecialistEntry {
  readonly createStudioBg3dBabylonSpecialist: (options: {
    readonly canvas: HTMLCanvasElement;
    readonly backend: StudioBg3dBabylonDiagnosticBackend;
    readonly capabilities?: readonly StudioBg3dRuntimeCapability[];
    readonly settings?: {
      readonly failIfMajorPerformanceCaveat?: boolean;
    };
  }) => StudioBg3dRuntimeAdapter;
}

let studioBg3dBabylonSpecialistEntryPromise:
  Promise<StudioBg3dBabylonSpecialistEntry> | null = null;

/** Explicit-action-only Babylon import boundary; rejected chunk loads remain retryable. */
function loadStudioBg3dBabylonSpecialistEntry():
  Promise<StudioBg3dBabylonSpecialistEntry> {
  const existing = studioBg3dBabylonSpecialistEntryPromise;
  if (existing) return existing;
  const pending = import("./studio-bg3d-babylon-specialist-entry").then((module) =>
    Object.freeze({
      createStudioBg3dBabylonSpecialist:
        module.createStudioBg3dBabylonSpecialist,
    }),
  );
  studioBg3dBabylonSpecialistEntryPromise = pending;
  void pending.catch(() => {
    if (studioBg3dBabylonSpecialistEntryPromise === pending) {
      studioBg3dBabylonSpecialistEntryPromise = null;
    }
  });
  return pending;
}

/* ── R3F Canvas 내부에서 렌더러/씬/카메라를 꺼내 캡처용 ref에 흘려보내는 다리.
   VRM 포저의 CaptureBridge와 동일한 패턴 — ref-not-state라 마운트마다 리렌더를 유발하지 않는다. */
function CaptureBridge({
  onCaptureUpdate,
}: {
  onCaptureUpdate: (state: CaptureState, cleanupAdapter?: StudioBg3dCaptureAdapter | null) => void;
}) {
  const { camera, gl, scene } = useThree();
  const updateCapture = useEffectEvent(onCaptureUpdate);

  useEffect(() => {
    let disposed = false;
    let adapter: StudioBg3dCaptureAdapter | null = null;
    void loadStudioBg3dThreeWebglCaptureRuntime().then((runtime) => {
      if (disposed) return;
      adapter = runtime.createStudioBg3dThreeWebglCaptureAdapter({
        camera,
        renderer: gl,
        scene,
      });
      updateCapture({ adapter, camera });
    }).catch(() => {
      if (!disposed) updateCapture({ adapter: null, camera: null });
    });
    return () => {
      disposed = true;
      if (adapter) updateCapture({ adapter: null, camera: null }, adapter);
    };
  }, [camera, gl, scene]);

  return null;
}

type StudioBg3dImmersiveStageSuccess = Extract<
  StudioBg3dImmersiveStagePlan,
  { readonly ok: true }
>;

export function StudioBackground3D({
  open,
  initialDataUrl,
  initialScene,
  seedSceneTemplateId = null,
  seedPrimitiveKind = null,
  onSeedObjectInsertConsumed,
  sharedSceneSession,
  sharedStageResolution,
  sharedStageSessionScopeKey,
  sharedCharactersLinkedToOtherBackgroundCount = 0,
  operation = "insert",
  recoveryScope,
  validateRecoveryAccess,
  onWebXrCleanupPendingChange,
  onClose,
  onInsert,
  onUseAsAiMethodReference,
  documentCanvasSize,
}: StudioBackground3DProps) {
  const [primitiveGeometryPool] = useState(() => new StudioBg3dPrimitiveGeometryPool());
  const [adaptiveDprScale, setAdaptiveDprScale] = useState(1);
  const {
    commitSharedCharacterTransform,
    effectiveSelectedSharedCharacter,
    effectiveSelectedSharedCharacterElementId,
    includeSharedCharactersInCapture,
    mayApplyEmptySharedStageMutation,
    selectSharedStageMutation,
    setSelectedSharedCharacterElementId,
    setSharedStageMaterializationKind,
    setSharedStageMutationKind,
    sharedCharacterCaptureElementIds,
    sharedCharacterCaptureReadiness,
    sharedCharacterGroundings,
    sharedCharacterPreviewOmissionCount,
    sharedCharacterReadyCount,
    sharedCharacterRelationshipLabel,
    sharedCharacterStatuses,
    sharedCharacterUnavailableCount,
    sharedCharacters,
    sharedStageMaterializationKind,
    sharedStageMutationKind,
    shouldStartOnSharedStageLayerTab,
    targetHasLinkedCharacters,
    targetHasSavedSharedScene,
    updateSharedCharacterGrounding,
    updateSharedCharacterStatus,
  } = useStudioBg3dSharedCharacterStatus({
    open,
    scopeKey: sharedStageSessionScopeKey,
    initialDataUrl,
    initialScene,
    operation,
    sceneSession: sharedSceneSession,
    stageResolution: sharedStageResolution,
  });
  const sharedCharacterCaptureAuthorityDraft = {
    includeCharactersInCapture: includeSharedCharactersInCapture,
    readinessPhase: sharedCharacterCaptureReadiness.phase,
    expectedCharacters: sharedCharacters.map((character) => ({
      elementId: character.elementId,
      runtimeKey: character.runtimeKey,
      modelRuntimeKey: character.modelRuntimeKey,
      placementHash: character.placementHash,
      sourceHash: character.sourceHash,
    })),
    capturableElementIds: sharedCharacterCaptureReadiness.capturableElementIds,
    previewOnlyElementIds: sharedCharacterCaptureReadiness.previewOnlyElementIds,
    pendingElementIds: sharedCharacters.flatMap((character) =>
      sharedCharacterStatuses[character.runtimeKey] === "ready"
        ? []
        : sharedCharacterStatuses[character.runtimeKey] === "unavailable"
          ? []
          : [character.elementId],
    ),
    unavailableElementIds: sharedCharacters.flatMap((character) =>
      sharedCharacterStatuses[character.runtimeKey] === "unavailable"
        ? [character.elementId]
        : [],
    ),
  } as const;
  const sharedCharacterCaptureAuthorityPayloadKey = JSON.stringify(
    sharedCharacterCaptureAuthorityDraft,
  );
  const readSharedCharacterCaptureAuthorityDraft = useEffectEvent(
    () => sharedCharacterCaptureAuthorityDraft,
  );
  const sharedCharacterCaptureAuthorityRef =
    useRef<StudioBg3dSharedCharacterCaptureAuthorityInput | null>(null);
  const sharedCharacterCaptureAuthorityPayloadKeyRef = useRef<string | null>(null);
  const sharedCharacterCaptureAuthorityRevisionRef = useRef(0);
  const sharedCharacterCaptureStatusFenceRef = useRef(sharedCharacterStatuses);

  useLayoutEffect(() => {
    sharedCharacterCaptureStatusFenceRef.current = sharedCharacterStatuses;
    if (
      sharedCharacterCaptureAuthorityRef.current
      && sharedCharacterCaptureAuthorityPayloadKeyRef.current
        === sharedCharacterCaptureAuthorityPayloadKey
    ) return;
    if (sharedCharacterCaptureAuthorityRevisionRef.current < 1) {
      sharedCharacterCaptureAuthorityRevisionRef.current = 1;
    } else if (sharedCharacterCaptureAuthorityRef.current) {
      sharedCharacterCaptureAuthorityRevisionRef.current += 1;
    }
    sharedCharacterCaptureAuthorityPayloadKeyRef.current =
      sharedCharacterCaptureAuthorityPayloadKey;
    sharedCharacterCaptureAuthorityRef.current = {
      revision: sharedCharacterCaptureAuthorityRevisionRef.current,
      ...readSharedCharacterCaptureAuthorityDraft(),
    };
  }, [
    sharedCharacterCaptureAuthorityPayloadKey,
    sharedCharacterStatuses,
  ]);

  const updateSharedCharacterStatusWithCaptureFence = (
    ...args: Parameters<typeof updateSharedCharacterStatus>
  ) => {
    const [runtimeKey, status] = args;
    if (sharedCharacterCaptureStatusFenceRef.current[runtimeKey] !== status) {
      sharedCharacterCaptureStatusFenceRef.current = {
        ...sharedCharacterCaptureStatusFenceRef.current,
        [runtimeKey]: status,
      };
      sharedCharacterCaptureAuthorityRevisionRef.current = Math.max(
        1,
        sharedCharacterCaptureAuthorityRevisionRef.current + 1,
      );
      sharedCharacterCaptureAuthorityPayloadKeyRef.current = null;
      sharedCharacterCaptureAuthorityRef.current = null;
    }
    updateSharedCharacterStatus(...args);
  };

  const acquireSharedCharacterCaptureAuthority = () => {
    const current = sharedCharacterCaptureAuthorityRef.current;
    return current
      ? acquireStudioBg3dSharedCharacterCaptureAuthorityLease(current)
      : null;
  };
  const verifySharedCharacterCaptureAuthority = (
    lease: StudioBg3dSharedCharacterCaptureAuthorityLease,
    checkpoint: "raster" | "receipt",
  ) => {
    const current = sharedCharacterCaptureAuthorityRef.current;
    return current
      ? verifyStudioBg3dSharedCharacterCaptureAuthorityLease(lease, current, checkpoint)
      : null;
  };
  const [primitives, setPrimitives] = useState<BgPrimitive[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [transformMode, setTransformMode] = useState<TransformModeId>("translate");
  /** Null keeps mode defaults; an explicit transform space is view-only and tool-stable. */
  const [transformSpaceOverride, setTransformSpaceOverride] =
    useState<TransformSpace | null>(null);
  const [lineArtPreview, setLineArtPreview] = useState(false);
  const [magicLayerEnabled, setMagicLayerEnabled] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isQuadView, setIsQuadView] = useState(false);
  const [webXrSupport, setWebXrSupport] =
    useState<StudioWebXrSupportSnapshot | null>(null);
  const [webXrSessionState, setWebXrSessionState] =
    useState<StudioWebXrSessionState>({ status: "idle" });
  const [webXrController, setWebXrController] =
    useState<StudioWebXrSessionController | null>(null);
  const [webXrRendererLifetimeRetained, setWebXrRendererLifetimeRetained] =
    useState(open);
  const [webXrBridgeGeneration, setWebXrBridgeGeneration] = useState(0);
  const [webXrCanvasGeneration, setWebXrCanvasGeneration] = useState(0);
  const [immersiveStagePlan, setImmersiveStagePlan] =
    useState<StudioBg3dImmersiveStageSuccess | null>(null);
  const webXrSessionStateRef = useRef<StudioWebXrSessionState>({ status: "idle" });
  const webXrControllerRef = useRef<StudioWebXrSessionController | null>(null);
  const webXrRestoreCameraRef = useRef<StudioBg3dCameraSettings | null>(null);
  const webXrCleanupPromiseRef = useRef<Promise<void> | null>(null);
  const webXrRendererRecreationPendingRef = useRef(false);
  const webXrCloseRequestedRef = useRef(false);
  const webXrOpenRef = useRef(open);
  const webXrMountedRef = useRef(true);
  webXrOpenRef.current = open;
  const viewTopRef = useRef<HTMLDivElement>(null);
  const viewFrontRef = useRef<HTMLDivElement>(null);
  const viewRightRef = useRef<HTMLDivElement>(null);
  const viewPerspRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanelTab, setActivePanelTab] = useState<BgPanelTab>(
    shouldStartOnSharedStageLayerTab ? "layers" : "shapes",
  );
  const [modelsPanelActivated, setModelsPanelActivated] = useState(false);
  const [viewEditorSection, setViewEditorSection] = useState<ViewEditorSection>("camera");
  const [babylonDiagnosticState, setBabylonDiagnosticState] =
    useState<StudioBg3dBabylonDiagnosticState>({
      status: "idle",
      backend: null,
    });
  const babylonDiagnosticAbortRef = useRef<AbortController | null>(null);
  const babylonDiagnosticGenerationRef = useRef(0);
  const [physicsPhase, setPhysicsPhase] = useState<StudioBg3dPhysicsPhase>("idle");
  const [physicsDurationSeconds, setPhysicsDurationSeconds] = useState<2 | 4 | 8>(4);
  const [physicsGravityPreset, setPhysicsGravityPreset] =
    useState<StudioBg3dPhysicsGravityPreset>("earth");
  const [physicsGroundEnabled, setPhysicsGroundEnabled] = useState(true);
  const [physicsProgress, setPhysicsProgress] = useState(0);
  const [physicsCurrentSeconds, setPhysicsCurrentSeconds] = useState(0);
  const [physicsError, setPhysicsError] = useState<string | null>(null);
  const [physicsPreviewRevision, setPhysicsPreviewRevision] = useState(0);
  const [ltEditorSection, setLtEditorSection] = useState<LtEditorSection>("line");
  const [ltPresetPanelActivated, setLtPresetPanelActivated] = useState(false);
  const [ltUserPresetRepository] = useState(
    getProductStudioBg3dLtPresetSqliteRepository,
  );
  const ltUserPresetHydrationGenerationRef = useRef(0);
  const ltUserPresetMutationGenerationRef = useRef(0);
  const [ltUserPresetPayload, setLtUserPresetPayload] = useState<StudioBg3dLtPresetPayload>(
    EMPTY_STUDIO_BG3D_LT_USER_PRESET_PAYLOAD
  );
  const [ltUserPresetLibraryStatus, setLtUserPresetLibraryStatus] =
    useState<LtUserPresetLibraryStatus>("idle");
  const [ltUserPresetNotice, setLtUserPresetNotice] = useState<LtUserPresetNotice | null>(null);
  const [ltPreferredPresetId, setLtPreferredPresetId] = useState<string | null>(null);
  const [ltManagedUserPresetId, setLtManagedUserPresetId] = useState<string | null>(null);
  const [ltDeleteConfirmId, setLtDeleteConfirmId] = useState<string | null>(null);
  const [ltUserPresetName, setLtUserPresetName] = useState("");
  const [ltUserPresetDescription, setLtUserPresetDescription] = useState(
    DEFAULT_LT_USER_PRESET_DESCRIPTION
  );
  const [viewportHinted, setViewportHinted] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [shotNameDraft, setShotNameDraft] = useState("");
  /** Exclusions make newly recorded shots selected by default without effect-driven state repair. */
  const [shotBatchExcludedIds, setShotBatchExcludedIds] = useState<Set<string>>(() => new Set());
  const [shotBatchPasses, setShotBatchPasses] = useState<Set<StudioBg3dShotBatchPass>>(
    () => new Set(["lt-composite"]),
  );
  const [shotBatchIncludeLayeredPsd, setShotBatchIncludeLayeredPsd] = useState(false);
  const [shotBatchIncludeContactSheet, setShotBatchIncludeContactSheet] = useState(true);
  const [shotBatchExportHeight, setShotBatchExportHeight] = useState<"per-shot" | number>("per-shot");
  const [shotBatchProgress, setShotBatchProgress] = useState<{
    readonly stage: "render" | "contact" | "archive";
    readonly completed: number;
    readonly total: number;
    readonly label: string;
  } | null>(null);
  const [shotBatchRecoverySummary, setShotBatchRecoverySummary] = useState<{
    readonly completedShots: number;
    readonly totalShots: number;
    readonly mode: "durable" | "memory";
    readonly downloadRequested?: boolean;
    readonly degradedReason?: string | null;
  } | null>(null);
  const isBatchRenderingShots = shotBatchProgress !== null;
  // 복합 오브젝트 프리셋 그리드 카테고리 필터. null=전체.
  const [compositeCategory, setCompositeCategory] = useState<BgCompositeCategory | null>(null);
  // 씬 템플릿 그리드 카테고리 필터. null=전체. compositeCategory와 동형이지만 별개 상태 —
  // BgSceneTemplateCategory와 BgCompositeCategory는 서로 다른 타입이라 공유할 수 없다("공간 종류" vs
  // "물체 종류"라는 다른 축, studio-background-3d-scene-templates.ts 상단 주석 참고).
  const [sceneTemplateCategory, setSceneTemplateCategory] = useState<BgSceneTemplateCategory | null>(null);
  // 방 만들기(파라메트릭 블로킹) 스펙 — clampStudioBg3dRoomSpec을 통해서만 갱신되는 항상-유효 상태.
  const [roomBuilderSpec, setRoomBuilderSpec] = useState<StudioBg3dRoomSpec>(
    () => getStudioBg3dRoomPreset("studio-flat")!.spec,
  );
  // 태양·시간대 릭 컨트롤 상태 — 문서에는 applyStudioBg3dSunRig의 결과(lighting 등)만 저장된다.
  const [sunRigConfig, setSunRigConfig] = useState<StudioBg3dSunRigConfig>(
    DEFAULT_STUDIO_BG3D_SUN_RIG_CONFIG,
  );
  // 단면 컷·스케일 가이드 — 뷰포트 보조물이라 장면 문서에 저장하지 않는다(그리드와 같은 계약).
  const [sectionPlane, setSectionPlane] = useState<StudioBg3dSectionPlaneState>(
    DEFAULT_STUDIO_BG3D_SECTION_PLANE_STATE,
  );
  const [scaleGuideVisible, setScaleGuideVisible] = useState(false);
  // Persistent guides and transient two-point capture intentionally remain outside scene geometry.
  const [measurementDocument, setMeasurementDocument] =
    useState<StudioBg3dMeasurementDocument>(() => createStudioBg3dMeasurementDocument("cm"));
  const [measurementActive, setMeasurementActive] = useState(false);
  const [measurementStartWorld, setMeasurementStartWorld] =
    useState<StudioBg3dMeasurementVec3 | null>(null);
  const [measurementDraft, setMeasurementDraft] =
    useState<StudioBg3dWorldMeasurement | null>(null);
  const [measurementInference, setMeasurementInference] =
    useState<StudioBg3dMeasurementInferenceSuccess | null>(null);
  const [measurementLockedLengthMeters, setMeasurementLockedLengthMeters] =
    useState<number | null>(null);
  const [measurementStatus, setMeasurementStatus] = useState(
    "줄자를 켠 뒤 첫 번째 점을 선택하세요.",
  );
  const measurementActiveRef = useRef(false);
  // CSP-style move/rotate step snap + 레이어 목록 검색.
  const [snapSettings, setSnapSettings] = useState<StudioBg3dSnapSettings>(() => ({
    ...DEFAULT_STUDIO_BG3D_SNAP_SETTINGS,
  }));
  const [surfaceSnapArmed, setSurfaceSnapArmed] = useState(false);
  const [surfaceSnapAlignNormal, setSurfaceSnapAlignNormal] = useState(false);
  const [surfaceSnapStatus, setSurfaceSnapStatus] = useState<{
    readonly tone: "info" | "error" | "success";
    readonly message: string;
  } | null>(null);
  const [layerQuery, setLayerQuery] = useState("");

  // 업로드된 커스텀 3D 모델(§bg3d-model-library.ts)의 씬 배치 인스턴스 + 라이브러리 목록/상태.
  const [customModels, setCustomModels] = useState<BgCustomModelInstance[]>([]);
  const [modelLibrary, setModelLibrary] = useState<Bg3dModelLibraryEntry[]>(
    copyStudioBg3dBundledEnvironmentLibraryEntries,
  );
  const [modelLibraryStatus, setModelLibraryStatus] =
    useState<"idle" | "loading" | "ready" | "degraded" | "error">("idle");
  const [genericModelSourceFormats, setGenericModelSourceFormats] =
    useState<ReadonlyMap<string, StudioGeneric3dSourceFormat>>(() => new Map());
  const [genericModelClassifications, setGenericModelClassifications] =
    useState<ReadonlyMap<string, StudioGeneric3dClassification>>(() => new Map());
  const [genericModelControlMode, setGenericModelControlMode] =
    useState<StudioGeneric3dControlMode>("root");
  const [genericModelSelectedProxyId, setGenericModelSelectedProxyId] =
    useState<string | null>(null);
  const [placementSession, setPlacementSession] = useState<StudioBg3dPlacementSessionState>(
    () => createStudioBg3dPlacementSession(),
  );
  const [placementPreviewAsset, setPlacementPreviewAsset] =
    useState<StudioBg3dPlacementPreviewAsset | null>(null);
  const placementSessionRef = useRef<StudioBg3dPlacementSessionState>(placementSession);
  const placementTokenSequenceRef = useRef(0);
  const [modelRenderer, setModelRenderer] = useState<THREE.WebGLRenderer | null>(null);
  const modelRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelImportProgress, setModelImportProgress] = useState<StudioBg3dImportProgress | null>(null);
  const modelImportAbortRef = useRef<AbortController | null>(null);
  const modelThumbnailCaptureControllerRef =
    useRef<StudioBg3dModelThumbnailCaptureController | null>(null);
  const modelThumbnailCaptureAbortRef = useRef<AbortController | null>(null);
  const modelThumbnailCaptureEpochRef = useRef(0);
  const modelThumbnailGpuLeaseRef = useRef<ModelThumbnailGpuLease | null>(null);
  const modelAnimationTimeReadersRef = useRef(new Map<string, () => number>());
  const modelRigBakeReadersRef = useRef(new Map<string, StudioBg3dRigBakeReader>());
  const [poseJointSelection, setPoseJointSelection] =
    useState<StudioBg3dRigSelectionState | null>(null);
  const [ikEndJointSelection, setIkEndJointSelection] = useState<{
    readonly modelId: string;
    readonly jointKey: string;
  } | null>(null);
  const [morphTargetSelection, setMorphTargetSelection] = useState<{
    readonly modelId: string;
    readonly key: string;
  } | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [isRestoringScene, setIsRestoringScene] = useState(false);
  const sceneRestoreAbortRef = useRef<AbortController | null>(null);
  const [templateLibrary, setTemplateLibrary] = useState<Bg3dTemplateLibraryEntry[]>([]);
  const [templateLibraryStatus, setTemplateLibraryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  useEffect(() => () => modelImportAbortRef.current?.abort(), []);
  useEffect(() => () => {
    modelThumbnailCaptureEpochRef.current += 1;
    modelThumbnailCaptureAbortRef.current?.abort();
    modelThumbnailCaptureAbortRef.current = null;
    modelThumbnailCaptureControllerRef.current?.dispose();
    modelThumbnailCaptureControllerRef.current = null;
  }, []);
  useEffect(() => () => shotBatchAbortRef.current?.abort(), []);
  useEffect(() => {
    if (!open && !webXrRendererLifetimeRetained) {
      primitiveGeometryPool.dispose();
      setAdaptiveDprScale(1);
      webXrControllerRef.current = null;
      webXrSessionStateRef.current = { status: "idle" };
      webXrRestoreCameraRef.current = null;
      setWebXrController(null);
      setWebXrSupport(null);
      setWebXrSessionState({ status: "idle" });
      setImmersiveStagePlan(null);
      measurementActiveRef.current = false;
      setMeasurementActive(false);
      setMeasurementStartWorld(null);
      setMeasurementDraft(null);
      setMeasurementInference(null);
      const idlePlacement = createStudioBg3dPlacementSession();
      placementSessionRef.current = idlePlacement;
      setPlacementSession(idlePlacement);
      setPlacementPreviewAsset(null);
      modelRendererRef.current = null;
      setModelRenderer(null);
    }
  }, [open, primitiveGeometryPool, webXrRendererLifetimeRetained]);
  useEffect(() => {
    if (!open) return;
    return () => {
      physicsGenerationRef.current += 1;
      physicsAbortRef.current?.abort();
      physicsAbortRef.current = null;
      if (physicsAnimationFrameRef.current !== null) {
        cancelAnimationFrame(physicsAnimationFrameRef.current);
        physicsAnimationFrameRef.current = null;
      }
      physicsSessionRef.current = null;
      physicsWorkerSessionRef.current?.dispose();
      physicsWorkerSessionRef.current = null;
      latestPhysicsSamplesRef.current = [];
      physicsPhaseRef.current = "idle";
    };
  }, [open]);
  useEffect(() => {
    primitiveGeometryPool.retain();
    return () => primitiveGeometryPool.releaseSoon();
  }, [primitiveGeometryPool]);
  
  const generateId = () => "template-" + Math.random().toString(36).substring(2, 15);

  const handleSaveSceneAsTemplate = async () => {
    if (
      primitives.length === 0 && customModels.length === 0 ||
      applyingTemplateId !== null ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
    const session = modalAssetSessionRef.current;
    if (!session || !isModalAssetSessionCurrent(session)) return;
    const currentView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const adaptation = tryAdaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: { ...sceneBaseDocument, camera: currentView },
    });
    if (!adaptation.ok) {
      setError("현재 장면이 안전 예산을 초과해 템플릿 저장을 시작하지 않았습니다. 장면을 나누거나 일부 오브젝트를 정리해 주세요.");
      return;
    }
    const adapted = adaptation.value;
    if (
      adapted.diagnostics.length > 0 ||
      adapted.omittedDiagnosticCount > 0 ||
      adapted.counts.droppedPrimitives > 0 ||
      adapted.counts.droppedCustomModels > 0 ||
      adapted.counts.emittedPrimitives !== primitives.length ||
      adapted.counts.emittedCustomModels !== customModels.length
    ) {
      setError("현재 장면을 손실 없는 템플릿 원본으로 만들 수 없습니다. 문제가 있는 도형이나 모델을 확인해 주세요.");
      return;
    }
    setIsSavingTemplate(true);
    try {
      const templateName = `내 소재 ${new Date().toLocaleDateString()}`;
      const entries = await saveBg3dTemplate({
        id: generateId(),
        name: templateName,
        createdAt: Date.now(),
        document: adapted.document,
      });
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setTemplateLibrary(entries);
        setTemplateLibraryStatus("ready");
        setError(null);
      });
    } catch (err) {
      console.error(err);
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setError("현재 장면 템플릿을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.");
      });
    } finally {
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setIsSavingTemplate(false);
      });
    }
  };
  
  const handleDeleteTemplate = async (id: string) => {
    const session = modalAssetSessionRef.current;
    if (!session || !isModalAssetSessionCurrent(session)) return;
    try {
      const entries = await deleteBg3dTemplate(id);
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setTemplateLibrary(entries);
        setTemplateLibraryStatus("ready");
      });
    } catch (err) {
      console.error(err);
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setError("템플릿을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      });
    }
  };

    const [sceneRecoveryError, setSceneRecoveryError] = useState<string | null>(null);
  const [failedCloneIds, setFailedCloneIds] = useState<Set<string>>(() => new Set());
  const [readyCloneIds, setReadyCloneIds] = useState<Set<string>>(() => new Set());
  const [unbatchableModelIds, setUnbatchableModelIds] = useState<Set<string>>(() => new Set());
  const [sceneBaseDocument, setSceneBaseDocument] = useState<StudioBg3dSceneDocument>(
    () => canonicalSceneDocument(initialScene) ?? DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT
  );
  const savedShots = sceneBaseDocument.shots ?? [];
  const shotBatchSelectedIds = savedShots
    .filter(({ id }) => !shotBatchExcludedIds.has(id))
    .map(({ id }) => id);
  const selectedShotBatchPasses = STUDIO_BG3D_SHOT_BATCH_PASSES.filter((pass) =>
    shotBatchPasses.has(pass),
  );
  const [captureBackgroundSnapshot, setCaptureBackgroundSnapshot] =
    useState<StudioBg3dCaptureBackgroundSnapshot | null>(null);
  const [deviceSignals, setDeviceSignals] = useState<StudioBg3dDeviceSignals>(() => collectDeviceSignals());
  const skyPresetId = sceneBaseDocument.background.skyPresetId;
  const insertBackgroundIntent = resolveStudioBg3dInsertBackgroundFromDocument({
    transparentBackground: sceneBaseDocument.output.transparentBackground,
    backgroundMode: sceneBaseDocument.background.mode,
  });
  const transparentInsert = insertBackgroundIntent.ok
    ? insertBackgroundIntent.plan.transparent
    : false;

  const captureRef = useRef<CaptureState>({ adapter: null, camera: null });
  const modalDialogRef = useRef<HTMLDivElement | null>(null);
  const modalRootRef = useRef<HTMLElement | null>(null);
  const viewportApiRef = useRef<BgViewportApi | null>(null);
  const pendingInitialCameraRef = useRef<StudioBg3dCameraSettings | null>(null);
  const cameraLensGestureBeforeViewRef = useRef<StudioBg3dCameraSettings | null>(null);
  const cameraLensGestureLatestViewRef = useRef<StudioBg3dCameraSettings | null>(null);
  const cameraLensGestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportHostRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => {
    if (cameraLensGestureTimerRef.current !== null) {
      clearTimeout(cameraLensGestureTimerRef.current);
      cameraLensGestureTimerRef.current = null;
    }
    cameraLensGestureBeforeViewRef.current = null;
    cameraLensGestureLatestViewRef.current = null;
  }, []);
  // 세이프 프레임 오버레이는 캡처와 같은 식을 쓰려면 살아 있는 뷰포트 CSS 박스를 알아야 한다.
  const [viewportBoxSize, setViewportBoxSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const primitiveObjectsRef = useRef<Map<string, THREE.Group>>(new Map());
  const surfaceSnapArmedRef = useRef(false);
  const dragInitialSelectedTransformsRef = useRef<Map<string, {
    worldMatrix: THREE.Matrix4;
  }>>(new Map());
  const dragInitialFirstTransformRef = useRef<{
    worldMatrix: THREE.Matrix4;
  } | null>(null);
  const [, setRefTick] = useState(0);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  // storage id는 이 두 Map과 검증 캐시 안에서만 쓰며 Studio 장면 문서에는 절대 직렬화하지 않는다.
  const modelRootCacheRef = useRef<Map<string, ModelRootCacheEntry>>(new Map());
  const modelLoadPendingRef = useRef<Map<string, Promise<ModelRootCacheEntry>>>(new Map());
  const attachmentByStorageModelIdRef = useRef<Map<string, StudioBg3dModelAttachment>>(new Map());
  const storageModelIdByAttachmentIdRef = useRef<Map<string, string>>(new Map());
  const componentActiveRef = useRef(false);
  const modalAssetSessionRef = useRef<StudioBg3dModalSession | null>(null);
  const captureInFlightRef = useRef(false);
  const invalidateModelThumbnailCaptures = useCallback((): Promise<void> | null => {
    const thumbnailLease = modelThumbnailGpuLeaseRef.current;
    modelThumbnailCaptureEpochRef.current += 1;
    modelThumbnailCaptureAbortRef.current?.abort();
    modelThumbnailCaptureAbortRef.current = null;
    modelThumbnailCaptureControllerRef.current?.invalidate();
    // The isolated adapter restores every live renderer property synchronously after submitting
    // readback. An abort may therefore release this UI lease even when the GPU fence settles late;
    // the disposed handle keeps its private graph alive until that fence actually finishes.
    thumbnailLease?.release();
    return thumbnailLease?.released ?? null;
  }, []);
  const ltInsertAbortRef = useRef<AbortController | null>(null);
  const aiMethodReferenceAbortRef = useRef<AbortController | null>(null);
  const ltInsertSceneEpochRef = useRef(0);
  const ltMagicSelectionEpochRef = useRef(0);
  const ltMagicCaptureGenerationRef = useRef(0);
  const ltInsertRestoreLineArtPreviewRef = useRef<boolean | null>(null);
  const destructiveMutationGuardRef = useRef(new StudioBg3dDestructiveMutationGuard());
  const shotBatchAbortRef = useRef<AbortController | null>(null);
  const shotBatchRecoveryRef = useRef<StudioBg3dShotBatchRecoverySession | null>(null);
  const shotBatchRecoveryScopeRef = useRef<{
    readonly controller: AbortController;
    readonly scope: StudioBg3dShotBatchRecoveryScope;
  } | null>(null);
  const shotBatchRecoveryStoreRef = useRef<StudioBg3dShotBatchRecoveryStore | null>(null);
  const shotBatchAuthorizationEpochRef = useRef(0);
  useLayoutEffect(() => {
    if (!open) return;
    const session = studioBg3dModalOperationCoordinator.beginSession();
    modalAssetSessionRef.current = session;
    return () => {
      invalidateModelThumbnailCaptures();
      ltInsertAbortRef.current?.abort();
      ltInsertAbortRef.current = null;
      aiMethodReferenceAbortRef.current?.abort();
      aiMethodReferenceAbortRef.current = null;
      if (modalAssetSessionRef.current === session) modalAssetSessionRef.current = null;
      studioBg3dModalOperationCoordinator.endSession(session);
    };
  }, [invalidateModelThumbnailCaptures, open]);
  useLayoutEffect(() => {
    ltInsertSceneEpochRef.current += 1;
    const controller = ltInsertAbortRef.current;
    controller?.abort();
    aiMethodReferenceAbortRef.current?.abort();
  }, [customModels, primitives, sceneBaseDocument]);
  useLayoutEffect(() => {
    ltMagicSelectionEpochRef.current += 1;
    if (magicLayerEnabled && captureInFlightRef.current) {
      ltInsertAbortRef.current?.abort();
    }
  }, [magicLayerEnabled, selectedIds]);
  useLayoutEffect(() => {
    if (!surfaceSnapArmedRef.current) return;
    cancelSurfaceSnap("장면이 변경되어 표면 붙이기 대상을 다시 선택해야 합니다.");
  }, [customModels, primitives, sceneBaseDocument]);
  useLayoutEffect(() => {
    if (!surfaceSnapArmedRef.current) return;
    cancelSurfaceSnap("선택이 변경되어 표면 붙이기를 취소했습니다.");
  }, [selectedIds]);
  useLayoutEffect(() => {
    if (!surfaceSnapArmedRef.current) return;
    if (
      !open || isQuadView || isCapturing || isBatchRenderingShots || isRestoringScene ||
      isTransforming || isUploadingModel || applyingTemplateId !== null || deletingModelId !== null ||
      isStudioBg3dPhysicsTransientPhase(physicsPhase)
    ) {
      cancelSurfaceSnap("다른 3D 작업이 시작되어 표면 붙이기를 취소했습니다.");
    }
  }, [
    applyingTemplateId,
    deletingModelId,
    isBatchRenderingShots,
    isCapturing,
    isQuadView,
    isRestoringScene,
    isTransforming,
    isUploadingModel,
    open,
    physicsPhase,
  ]);
  useLayoutEffect(() => {
    if (open) return;
    invalidateModelThumbnailCaptures();
    ltInsertAbortRef.current?.abort();
    ltInsertAbortRef.current = null;
    aiMethodReferenceAbortRef.current?.abort();
    aiMethodReferenceAbortRef.current = null;
    if (!modelThumbnailGpuLeaseRef.current) captureInFlightRef.current = false;
    const restoreLineArtPreview = ltInsertRestoreLineArtPreviewRef.current;
    ltInsertRestoreLineArtPreviewRef.current = null;
    setCaptureBackgroundSnapshot(null);
    setIsCapturing(false);
    if (restoreLineArtPreview !== null) setLineArtPreview(restoreLineArtPreview);
  }, [invalidateModelThumbnailCaptures, open]);
  useLayoutEffect(() => {
    const previous = shotBatchRecoveryScopeRef.current?.scope ??
      shotBatchRecoveryRef.current?.plan.scope;
    if (!previous) return;
    if (!recoveryScope || previous.durability !== recoveryScope.durability ||
      previous.authUserId !== recoveryScope.authUserId || previous.workId !== recoveryScope.workId ||
      previous.pageId !== recoveryScope.pageId || previous.elementId !== recoveryScope.elementId) {
      shotBatchAuthorizationEpochRef.current += 1;
      shotBatchAbortRef.current?.abort();
    }
  }, [recoveryScope]);
  useEffect(() => () => {
    const store = shotBatchRecoveryStoreRef.current;
    const session = shotBatchRecoveryRef.current;
    if (store && session) void store.release(session);
  }, []);
  const physicsPhaseRef = useRef<StudioBg3dPhysicsPhase>("idle");
  const physicsAbortRef = useRef<AbortController | null>(null);
  const physicsAnimationFrameRef = useRef<number | null>(null);
  const physicsGenerationRef = useRef(0);
  const physicsPlaybackStartedAtRef = useRef(0);
  const physicsPlaybackOffsetRef = useRef(0);
  const physicsLastUiUpdateRef = useRef(0);
  const physicsLastFrameTimestampRef = useRef(0);
  const latestPhysicsSamplesRef = useRef<readonly StudioBg3dPhysicsTransformSample[]>([]);
  const physicsSessionRef = useRef<StudioBg3dPhysicsSession | null>(null);
  const physicsWorkerSessionRef = useRef<StudioBg3dPhysicsTimelineWorkerSession | null>(null);
  const physicsRuntimeSourceRef = useRef({
    primitives,
    customModels,
    document: sceneBaseDocument,
  });
  physicsRuntimeSourceRef.current = { primitives, customModels, document: sceneBaseDocument };
  const physicsStartButtonRef = useRef<HTMLButtonElement | null>(null);
  const physicsTransportActionRef = useRef<HTMLButtonElement | null>(null);
  const shouldTransferPhysicsFocusRef = useRef(false);

  function isModalAssetSessionCurrent(session: StudioBg3dModalSession): boolean {
    return componentActiveRef.current && studioBg3dModalOperationCoordinator.isCurrent(session);
  }

  function getModelThumbnailCaptureController(
    CaptureController: StudioBg3dModelThumbnailCaptureControllerConstructor,
  ): StudioBg3dModelThumbnailCaptureController {
    const existing = modelThumbnailCaptureControllerRef.current;
    if (existing) return existing;
    const created = new CaptureController({
      dependencies: { encode: encodeStudioBg3dModelThumbnailPng },
    });
    modelThumbnailCaptureControllerRef.current = created;
    return created;
  }

  function acquireModelThumbnailGpuLease(): ModelThumbnailGpuLease | null {
    if (captureInFlightRef.current) return null;
    let resolveReleased: () => void = () => undefined;
    let didRelease = false;
    const released = new Promise<void>((resolve) => {
      resolveReleased = resolve;
    });
    const lease: ModelThumbnailGpuLease = {
      released,
      release() {
        if (didRelease) return;
        didRelease = true;
        if (modelThumbnailGpuLeaseRef.current === lease) {
          modelThumbnailGpuLeaseRef.current = null;
          captureInFlightRef.current = false;
        }
        resolveReleased();
      },
    };
    modelThumbnailGpuLeaseRef.current = lease;
    captureInFlightRef.current = true;
    return lease;
  }

  function startModelThumbnailCaptureBatch(
    records: readonly Bg3dVerifiedStoredRecord[],
    session: StudioBg3dModalSession,
  ): void {
    invalidateModelThumbnailCaptures();
    if (records.length === 0 || !isModalAssetSessionCurrent(session)) return;
    const renderer = modelRendererRef.current;
    if (!renderer) return;

    const batchController = new AbortController();
    modelThumbnailCaptureAbortRef.current = batchController;
    const batchEpoch = modelThumbnailCaptureEpochRef.current;
    const isCurrent = () => (
      !batchController.signal.aborted &&
      modelThumbnailCaptureAbortRef.current === batchController &&
      modelThumbnailCaptureEpochRef.current === batchEpoch &&
      modelRendererRef.current === renderer &&
      isModalAssetSessionCurrent(session)
    );

    void (async () => {
      let thumbnailRuntime: StudioBg3dModelThumbnailRuntime;
      try {
        thumbnailRuntime = await loadStudioBg3dModelThumbnailRuntime();
      } catch {
        // Runtime loading is best-effort just like capture. The imported model remains committed
        // and a later import may retry after a transient chunk/network failure.
        return;
      }
      if (!isCurrent()) return;
      const thumbnailCaptureController = getModelThumbnailCaptureController(
        thumbnailRuntime.CaptureController,
      );
      let capturedAnyThumbnail = false;
      for (const record of records) {
        if (!isCurrent()) break;
        // Import and scene placement remain successful when another shot/LT/insert capture owns
        // the renderer. The library card simply retains its existing placeholder in that case.
        if (captureInFlightRef.current) continue;
        const cachedEntry = modelRootCacheRef.current.get(record.id);
        if (
          !cachedEntry ||
          cachedEntry.record.contentHash !== record.contentHash ||
          cachedEntry.record.byteSize !== record.byteSize
        ) continue;

        let captureHandle: StudioBg3dModelThumbnailThreeCaptureHandle | null = null;
        try {
          captureHandle = await thumbnailRuntime.createThreeCapture({
            renderer,
            cachedRoot: cachedEntry.root,
            signal: batchController.signal,
            isCurrent,
          });
          if (!isCurrent()) continue;
          const isolatedAdapter = captureHandle.adapter;
          const leasedAdapter: StudioBg3dCaptureAdapter = Object.freeze({
            backend: isolatedAdapter.backend,
            engineId: isolatedAdapter.engineId,
            engineVersion: isolatedAdapter.engineVersion,
            implementationRevision: isolatedAdapter.implementationRevision,
            graphicsApi: isolatedAdapter.graphicsApi,
            profileId: isolatedAdapter.profileId,
            getSourceSize: () => isolatedAdapter.getSourceSize(),
            async capture(request: StudioBg3dCaptureRequest) {
              const lease = acquireModelThumbnailGpuLease();
              if (!lease) throw new Error("studio-bg3d-model-thumbnail:gpu-lease-busy");
              try {
                return await isolatedAdapter.capture(request);
              } finally {
                lease.release();
              }
            },
          });
          await thumbnailCaptureController.captureAndStore({
            storageModelId: record.id,
            adapter: leasedAdapter,
            signal: batchController.signal,
            isCurrent: () => isCurrent() && (
              modelRootCacheRef.current.get(record.id)?.record.contentHash === record.contentHash
            ),
          });
          capturedAnyThumbnail = true;
        } catch {
          // Thumbnail generation is best-effort. A verified model import and its scene placement
          // stay committed; malformed bounds, a busy renderer, or a blocked Worker keep the card's
          // placeholder instead of rolling the model transaction back.
        } finally {
          modelThumbnailGpuLeaseRef.current?.release();
          captureHandle?.dispose();
        }
      }

      if (!capturedAnyThumbnail || !isCurrent()) return;
      try {
        const entries = await listBg3dModelLibraryEntries();
        if (!isCurrent()) return;
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setModelLibrary(entries);
          setModelLibraryStatus("ready");
        });
      } catch {
        // A failed refresh must not downgrade the already committed import. The next modal open
        // reads the persisted thumbnail store again.
      }
    })().finally(() => {
      if (modelThumbnailCaptureAbortRef.current === batchController) {
        modelThumbnailCaptureAbortRef.current = null;
      }
    });
  }

  function invalidateModalAssetSession(): void {
    invalidateModelThumbnailCaptures();
    ltInsertAbortRef.current?.abort();
    ltInsertAbortRef.current = null;
    aiMethodReferenceAbortRef.current?.abort();
    aiMethodReferenceAbortRef.current = null;
    const session = modalAssetSessionRef.current;
    if (!session) return;
    modalAssetSessionRef.current = null;
    studioBg3dModalOperationCoordinator.endSession(session);
  }

  function cancelSurfaceSnap(message?: string): void {
    surfaceSnapArmedRef.current = false;
    setSurfaceSnapArmed(false);
    if (message) setSurfaceSnapStatus({ tone: "info", message });
  }

  const handleViewportReady = useCallback((api: BgViewportApi | null) => {
    viewportApiRef.current = api;
    const pendingView = pendingInitialCameraRef.current;
    if (api && pendingView) {
      applyOrDeferStudioBg3dHistoryCamera(api, pendingInitialCameraRef, pendingView);
    }
  }, []);

  function resetWebXrPresentationUi(): void {
    setWebXrController(null);
    setWebXrSupport(null);
    const restoreCamera = webXrRestoreCameraRef.current;
    if (restoreCamera) pendingInitialCameraRef.current = restoreCamera;
    webXrRestoreCameraRef.current = null;
    webXrSessionStateRef.current = { status: "idle" };
    setWebXrSessionState({ status: "idle" });
    setImmersiveStagePlan(null);
  }

  function finishWebXrControllerCleanup(cleanup: Promise<void>): void {
    if (webXrCleanupPromiseRef.current !== cleanup) return;
    webXrCleanupPromiseRef.current = null;
    if (!webXrMountedRef.current) return;
    const rendererMustStayMounted = webXrOpenRef.current;
    const replacePoisonedRenderer = webXrRendererRecreationPendingRef.current;
    webXrRendererRecreationPendingRef.current = false;
    setWebXrRendererLifetimeRetained(rendererMustStayMounted);
    onWebXrCleanupPendingChange?.(false);
    if (rendererMustStayMounted && !webXrCloseRequestedRef.current) {
      if (replacePoisonedRenderer) {
        // Three can revive isPresenting after native end when its setSession continuation wins a
        // race. Its public API cannot repair that manager, so replace this one Canvas only after
        // controller.dispose() proves both attachment and native dispatch have settled.
        setWebXrCanvasGeneration((generation) => generation + 1);
      } else {
        // The modal was reopened before an ordinary controller generation finished. Recreate only
        // the bridge; the admitted scene and its one Canvas remain the same.
        setWebXrBridgeGeneration((generation) => generation + 1);
      }
    }
  }

  function disposeCurrentWebXrControllerGeneration(): Promise<void> | null {
    const existingCleanup = webXrCleanupPromiseRef.current;
    if (existingCleanup) return existingCleanup;
    const controller = webXrControllerRef.current;
    webXrControllerRef.current = null;
    resetWebXrPresentationUi();
    if (!controller) {
      if (!webXrOpenRef.current) {
        setWebXrRendererLifetimeRetained(false);
        onWebXrCleanupPendingChange?.(false);
      }
      return null;
    }

    const cleanup = controller.dispose();
    webXrCleanupPromiseRef.current = cleanup;
    // This state is committed in the same discrete close turn as the parent's logical close. It
    // renders the existing Canvas hidden, never a second renderer, until Three can be torn down.
    setWebXrRendererLifetimeRetained(true);
    onWebXrCleanupPendingChange?.(true);
    void cleanup.then(
      () => finishWebXrControllerCleanup(cleanup),
      () => finishWebXrControllerCleanup(cleanup),
    );
    return cleanup;
  }

  const disposeWebXrControllerForOpenChange = useEffectEvent(() => {
    disposeCurrentWebXrControllerGeneration();
  });

  useLayoutEffect(() => {
    if (open) {
      webXrCloseRequestedRef.current = false;
      setWebXrRendererLifetimeRetained(true);
      return;
    }
    webXrCloseRequestedRef.current = true;
    disposeWebXrControllerForOpenChange();
  }, [open]);

  useEffect(() => {
    webXrMountedRef.current = true;
    return () => {
      webXrMountedRef.current = false;
    };
  }, []);

  const handleWebXrControllerReady = (controller: StudioWebXrSessionController | null) => {
    const lostController = controller === null && webXrControllerRef.current !== null;
    webXrControllerRef.current = controller;
    setWebXrController(controller);
    if (!lostController) return;
    const restoreCamera = webXrRestoreCameraRef.current;
    if (restoreCamera) pendingInitialCameraRef.current = restoreCamera;
    webXrRestoreCameraRef.current = null;
    webXrSessionStateRef.current = { status: "idle" };
    setWebXrSessionState({ status: "idle" });
    setImmersiveStagePlan(null);
  };

  const handleWebXrSessionStateChange = (nextState: StudioWebXrSessionState) => {
    webXrSessionStateRef.current = nextState;
    setWebXrSessionState(nextState);
    if (
      nextState.status === "error"
      && nextState.code === "renderer-failed"
      && webXrControllerRef.current?.requiresRendererRecreation
    ) {
      webXrRendererRecreationPendingRef.current = true;
      disposeCurrentWebXrControllerGeneration();
      return;
    }
    if (nextState.status !== "idle" && nextState.status !== "error") return;
    const restoreCamera = webXrRestoreCameraRef.current;
    if (restoreCamera) pendingInitialCameraRef.current = restoreCamera;
    webXrRestoreCameraRef.current = null;
    setImmersiveStagePlan(null);
  };

  const historyRef = useRef<StudioBg3dHistorySnapshot[]>([]);
  const historyIndexRef = useRef(-1);

  const deviceQuality = resolveStudioBg3dDeviceQuality({
    document: sceneBaseDocument,
    mode: isCapturing ? "capture" : "edit",
    signals: deviceSignals,
  });
  const hasCloneFailure = customModels.some((model) => failedCloneIds.has(model.id));
  const hasPendingClone = customModels.some(
    (model) => !readyCloneIds.has(model.id) && !failedCloneIds.has(model.id)
  );
  const hasPendingSharedCharacter = includeSharedCharactersInCapture
    && sharedCharacterCaptureReadiness.phase === "loading";
  const hasUnavailableSharedCharacter = includeSharedCharactersInCapture
    && sharedCharacterCaptureReadiness.phase === "unavailable";
  const sharedStageUpdateBlockedReason =
    resolveStudioBg3dSharedStageMutationBlockedReason({
      operation,
      stageResolution: sharedStageResolution,
      mutationKind: sharedStageMutationKind,
      includeCharactersInCapture: includeSharedCharactersInCapture,
      captureReadiness: sharedCharacterCaptureReadiness,
    });
  const physicsInteractionLocked = isStudioBg3dPhysicsTransientPhase(physicsPhase);
  const transformSpace =
    transformSpaceOverride ?? (transformMode === "rotate" ? "local" : "world");
  const insertBlocked = Boolean(sceneRecoveryError) || hasCloneFailure || hasPendingClone ||
    hasPendingSharedCharacter || hasUnavailableSharedCharacter || isRestoringScene ||
    physicsInteractionLocked || isBatchRenderingShots;
  const magicLayerEffectivelyVisibleIds =
    collectStudioBg3dEffectivelyVisibleEntityIds([...primitives, ...customModels]);
  const magicLayerSelectedPrimitive = selectedIds.size === 1
    ? primitives.find((primitive) => selectedIds.has(primitive.id)) ?? null
    : null;
  const magicLayerLensShift = sceneBaseDocument.camera.lensShift;
  const magicLayerUnavailableReason = operation === "update"
    ? "첫 단계에서는 새 3D 배경을 추가할 때만 매직 마스크를 만들 수 있어요."
    : customModels.length > 0
      ? "첫 단계에서는 외부 모델이 없는 프리미티브 장면만 정확하게 분리할 수 있어요."
      : selectedIds.size !== 1
        ? "보이는 프리미티브 한 개를 선택하면 사용할 수 있어요."
        : !magicLayerSelectedPrimitive
          ? "현재 선택은 프리미티브가 아니어서 매직 마스크를 만들 수 없어요."
          : !magicLayerEffectivelyVisibleIds.has(magicLayerSelectedPrimitive.id)
            ? "숨겨진 프리미티브나 숨겨진 그룹의 자식은 마스크에 나타나지 않아요. 먼저 표시해 주세요."
            : sceneBaseDocument.camera.projection === "orthographic"
              ? "첫 단계의 매직 마스크는 원근 카메라에서만 지원해요."
              : magicLayerLensShift &&
                  (magicLayerLensShift[0] !== 0 || magicLayerLensShift[1] !== 0)
                ? "렌즈 시프트를 0으로 되돌리면 매직 마스크를 만들 수 있어요."
                : sceneBaseDocument.background.mode === "sky-preset" &&
                    sceneBaseDocument.background.skyPresetId !== "blank"
                  ? "첫 단계에서는 단색·투명·빈 하늘 배경에서만 매직 마스크를 만들 수 있어요."
                  : sceneBaseDocument.output.tone.mode === "none" ||
                      sceneBaseDocument.output.tone.opacity <= 0
                    ? "매직 마스크를 붙일 컬러 또는 톤 베이스 출력을 먼저 켜 주세요."
                    : null;
  const shotBatchBlockedReason = sceneRecoveryError
    ? "3D 장면 복원 오류를 해결하기 전에는 누락 가능성이 있는 컷을 배치 출력할 수 없습니다."
    : hasCloneFailure
      ? "불러오기에 실패한 3D 모델이 있어 컷 배치 출력을 막았습니다. 모델 파일 상태를 확인해 주세요."
      : hasPendingClone
        ? "3D 모델 렌더 복제본을 준비하는 중입니다. 모든 모델이 표시된 뒤 컷 배치 출력을 다시 실행해 주세요."
        : hasUnavailableSharedCharacter
          ? "연결된 3D 캐릭터 모델을 불러오지 못해 컷 배치 출력을 막았습니다. 캐릭터 레이어의 모델 파일을 확인해 주세요."
          : hasPendingSharedCharacter
            ? "연결된 3D 캐릭터를 준비하는 중입니다. 모든 캐릭터가 표시된 뒤 컷 배치 출력을 다시 실행해 주세요."
            : isRestoringScene
              ? "3D 장면을 복원하는 중입니다. 복원이 끝난 뒤 컷 배치 출력을 실행해 주세요."
              : physicsInteractionLocked
                ? "물리 미리보기 중에는 컷 배치 출력을 실행할 수 없습니다. 현재 자세를 적용하거나 미리보기를 초기화해 주세요."
                : isCapturing || isBatchRenderingShots
                  ? "다른 3D 캡처가 진행 중입니다. 완료하거나 취소한 뒤 컷 배치 출력을 다시 실행해 주세요."
                  : null;

  // The body root covers both the portalled dialog and launcher before focus isolation activates.
  useLayoutEffect(() => {
    modalRootRef.current = modalDialogRef.current?.ownerDocument.body ?? null;
  }, [open]);
  useStudioModalSheet({
    activeKey: open ? "studio-bg3d" : null,
    dialogRef: modalDialogRef,
    onDismiss: requestModalDismiss,
    resolveInitialFocus: (dialog) =>
      dialog.querySelector<HTMLElement>("[data-bg3d-initial-focus='true']"),
    resolveReturnFocus: () => resolveStudioBg3dReturnFocus(modalDialogRef.current),
    rootRef: modalRootRef,
  });
  useLayoutEffect(() => {
    if (!shouldTransferPhysicsFocusRef.current) return;
    if (!physicsInteractionLocked) {
      shouldTransferPhysicsFocusRef.current = false;
      return;
    }
    const currentAction = physicsTransportActionRef.current;
    if (!currentAction || currentAction.disabled) return;
    shouldTransferPhysicsFocusRef.current = false;
    currentAction.focus({ preventScroll: true });
  }, [physicsInteractionLocked, physicsPhase]);

  const transitionPhysicsPhase = (next: StudioBg3dPhysicsPhase) => {
    physicsPhaseRef.current = next;
    setPhysicsPhase(next);
  };

  // The cache owns only verified-loader snapshots and disposes each shared resource once.
  useEffect(() => {
    // `componentActiveRef` fences every async editor operation, not only the model library.
    // Gating this lifecycle behind the Models tab leaves diagnostics, capture, physics, and
    // restore work permanently unable to publish while the dialog is otherwise fully active.
    if (!open) return;
    componentActiveRef.current = true;
    const cache = modelRootCacheRef.current;
    const pending = modelLoadPendingRef.current;
    const attachmentByStorageId = attachmentByStorageModelIdRef.current;
    const storageIdByAttachment = storageModelIdByAttachmentIdRef.current;
    return () => {
      componentActiveRef.current = false;
      babylonDiagnosticAbortRef.current?.abort();
      babylonDiagnosticAbortRef.current = null;
      pending.clear();
      disposeModelCache(cache);
      attachmentByStorageId.clear();
      storageIdByAttachment.clear();
    };
  }, [open, setTemplateLibrary, setTemplateLibraryStatus]);

  // LT presets use fail-closed SQLite/OPFS authority with an explicit tab-memory fallback.
  useEffect(() => {
    if (!open || !ltPresetPanelActivated) return;
    const hydrationGeneration = ltUserPresetHydrationGenerationRef.current + 1;
    ltUserPresetHydrationGenerationRef.current = hydrationGeneration;
    const mutationGeneration = ltUserPresetMutationGenerationRef.current;
    let active = true;
    setLtPreferredPresetId(null);
    setLtManagedUserPresetId(null);
    setLtDeleteConfirmId(null);
    setLtUserPresetName("");
    setLtUserPresetDescription(DEFAULT_LT_USER_PRESET_DESCRIPTION);
    setLtUserPresetPayload(EMPTY_STUDIO_BG3D_LT_USER_PRESET_PAYLOAD);
    setLtUserPresetLibraryStatus("idle");
    setLtUserPresetNotice(null);

    void ltUserPresetRepository.load().then((payload) => {
      if (
        !active ||
        ltUserPresetHydrationGenerationRef.current !== hydrationGeneration ||
        ltUserPresetMutationGenerationRef.current !== mutationGeneration
      ) {
        return;
      }
      setLtUserPresetPayload(payload);
      setLtUserPresetLibraryStatus("ready");
      setLtUserPresetNotice(null);
    }).catch((cause: unknown) => {
      if (!active || ltUserPresetHydrationGenerationRef.current !== hydrationGeneration) return;
      setLtUserPresetPayload(EMPTY_STUDIO_BG3D_LT_USER_PRESET_PAYLOAD);
      setLtUserPresetLibraryStatus("memory-only");
      setLtUserPresetNotice({
        tone: "error",
        message: `SQLite/OPFS에서 LT 프리셋을 불러오지 못했습니다. 현재 탭 메모리 임시 · 새로고침 시 사라짐: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    });
    return () => {
      active = false;
      if (ltUserPresetHydrationGenerationRef.current === hydrationGeneration) {
        ltUserPresetHydrationGenerationRef.current += 1;
      }
    };
  }, [ltPresetPanelActivated, ltUserPresetRepository, open]);

  // CSS 뷰포트, DPR, 포인터, 데이터 절약/기기 성능 신호를 명시적으로 수집해 순수 품질 정책에 전달한다.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const browserNavigator = navigator as BrowserNavigatorCapabilities;
    const coarse = window.matchMedia?.("(pointer: coarse)");
    const fine = window.matchMedia?.("(pointer: fine)");
    const refresh = () => setDeviceSignals(collectDeviceSignals(viewportHostRef.current));
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(refresh) : null;
    if (viewportHostRef.current) observer?.observe(viewportHostRef.current);
    window.addEventListener("resize", refresh, { passive: true });
    coarse?.addEventListener?.("change", refresh);
    fine?.addEventListener?.("change", refresh);
    browserNavigator.connection?.addEventListener?.("change", refresh);
    refresh();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", refresh);
      coarse?.removeEventListener?.("change", refresh);
      fine?.removeEventListener?.("change", refresh);
      browserNavigator.connection?.removeEventListener?.("change", refresh);
    };
  }, [open, setTemplateLibrary, setTemplateLibraryStatus]);

  // 모델 라이브러리 목록은 모달이 열릴 때 한 번 읽어온다(VRM 포저의 listVrmLibraryEntries() 패턴과 동일).
  useEffect(() => {
    if (!open || !modelsPanelActivated) return;
    const session = modalAssetSessionRef.current;
    if (!session) return;
    setModelLibrary(copyStudioBg3dBundledEnvironmentLibraryEntries());
    setModelLibraryStatus("loading");
    studioBg3dModalOperationCoordinator.waitForSceneMutationLane()
      .then(() => {
        if (!isModalAssetSessionCurrent(session)) {
          throw new StudioBg3dStaleModalOperationError();
        }
        return listBg3dModelLibraryEntries();
      })
      .then((entries) => {
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setModelLibrary(entries);
          setModelLibraryStatus("ready");
        });
      })
      .catch(() => {
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setModelLibrary(copyStudioBg3dBundledEnvironmentLibraryEntries());
          setModelLibraryStatus("degraded");
        });
      });
  }, [modelsPanelActivated, open, setTemplateLibrary, setTemplateLibraryStatus]);

  useEffect(() => {
    if (!open || !modelsPanelActivated) return;
    const session = modalAssetSessionRef.current;
    if (!session) return;
    setTemplateLibraryStatus("loading");
    listBg3dTemplates()
      .then((entries) => {
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setTemplateLibrary(entries);
          setTemplateLibraryStatus("ready");
        });
      })
      .catch(() => {
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setTemplateLibraryStatus("error");
        });
      });
  }, [modelsPanelActivated, open, setTemplateLibrary, setTemplateLibraryStatus]);

  // Restore only hash-admitted models; failures lock updates, while legacy PNG needs no SceneIR.
  useEffect(() => {
    if (!open || !modelRenderer) return;
    const session = modalAssetSessionRef.current;
    if (!session) return;
    const restoreController = new AbortController();
    sceneRestoreAbortRef.current?.abort("scene-restoration-superseded");
    sceneRestoreAbortRef.current = restoreController;
    let cancelled = false;
    const isCurrent = () =>
      !cancelled &&
      !restoreController.signal.aborted &&
      isModalAssetSessionCurrent(session);
    setIsRestoringScene(true);
    setSceneRecoveryError(null);
    setError(null);
    setSelectedIds(new Set());
    physicsGenerationRef.current += 1;
    physicsAbortRef.current?.abort();
    physicsAbortRef.current = null;
    if (physicsAnimationFrameRef.current !== null) {
      cancelAnimationFrame(physicsAnimationFrameRef.current);
      physicsAnimationFrameRef.current = null;
    }
    physicsSessionRef.current = null;
    latestPhysicsSamplesRef.current = [];
    physicsPhaseRef.current = "idle";
    setPhysicsPhase("idle");
    setPhysicsProgress(0);
    setPhysicsCurrentSeconds(0);
    setPhysicsError(null);
    setFailedCloneIds(new Set());
    setReadyCloneIds(new Set());
    historyRef.current = [];
    historyIndexRef.current = -1;
    setCanUndo(false);
    setCanRedo(false);
    disposeModelCache(modelRootCacheRef.current);
    modelLoadPendingRef.current.clear();
    attachmentByStorageModelIdRef.current.clear();
    storageModelIdByAttachmentIdRef.current.clear();

    void (async () => {
      await studioBg3dModalOperationCoordinator.waitForSceneMutationLane();
      if (!isCurrent()) return;
      const canonicalInitial = canonicalSceneDocument(initialScene);
      if (initialScene && !canonicalInitial) {
        if (isCurrent()) {
          historyRef.current = [createStudioBg3dHistorySnapshot({
            primitives: [],
            customModels: [],
            document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
          })];
          historyIndexRef.current = 0;
          setPrimitives([]);
          setCustomModels([]);
          setSceneBaseDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT);
          setSceneRecoveryError("3D 장면 원본이 손상되어 안전하게 복원할 수 없습니다. 기존 PNG는 그대로 유지됩니다.");
          setIsRestoringScene(false);
        }
        return;
      }

      if (canonicalInitial) {
        let restoredDocument = canonicalInitial;
        setSceneBaseDocument(restoredDocument);
        pendingInitialCameraRef.current = viewportApiRef.current?.applyView(restoredDocument.camera) === true
          ? null
          : restoredDocument.camera;

        const quality = resolveDeviceQuality(restoredDocument, viewportHostRef.current);
        let cumulativeUsedBytes = 0;
        let recoveryFailed = false;
        const deletedAttachmentIds = new Set<string>();
        for (const attachment of restoredDocument.attachments) {
          if (!isCurrent()) return;
          try {
            const resolution = await resolveBg3dModelHash(attachment.hash, {
              signal: restoreController.signal,
            });
            const record = resolution.record;
            if (!record) {
              if (resolution.deletionReceipt) {
                deletedAttachmentIds.add(attachment.id);
                continue;
              }
              throw new Error("attachment-missing");
            }
            if (!attachmentMatchesRecord(attachment, record)) throw new Error("attachment-mismatch");
            await admitAndCacheModel({
              record,
              document: restoredDocument,
              quality,
              cumulativeUsedBytes,
              renderer: modelRenderer,
              cache: modelRootCacheRef.current,
              pending: modelLoadPendingRef.current,
              isActive: isCurrent,
              signal: restoreController.signal,
            });
            if (!bindModelAttachment({
              attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
              storageModelIdByAttachmentId: storageModelIdByAttachmentIdRef.current,
            }, record, attachment)) {
              throw new Error("attachment-binding");
            }
            cumulativeUsedBytes += attachment.byteSize;
          } catch {
            recoveryFailed = true;
          }
        }
        if (deletedAttachmentIds.size > 0) {
          const reconciled = planStudioBg3dDeletedAttachmentReconciliation({
            document: restoredDocument,
            attachmentIds: deletedAttachmentIds,
          });
          if (reconciled.ok) {
            restoredDocument = reconciled.snapshot.document;
            setSceneBaseDocument(restoredDocument);
          } else {
            recoveryFailed = true;
          }
        }
        const hydrated = hydrateStudioBg3dDocumentToRuntime({
          document: restoredDocument,
          storageModelIdByAttachmentId: storageModelIdByAttachmentIdRef.current,
        });
        if (!isCurrent()) return;
        historyRef.current = [createStudioBg3dHistorySnapshot({
          primitives: hydrated.primitives,
          customModels: hydrated.customModels,
          document: restoredDocument,
        })];
        historyIndexRef.current = 0;
        setPrimitives(hydrated.primitives);
        setCustomModels(hydrated.customModels);
        const restoredWorkflow = readGenericWorkflowMapsFromAttachments(
          attachmentByStorageModelIdRef.current,
        );
        setGenericModelSourceFormats(restoredWorkflow.sourceFormats);
        setGenericModelClassifications(restoredWorkflow.classifications);
        if (
          recoveryFailed ||
          !hydrated.ok ||
          hydrated.diagnostics.length > 0 ||
          hydrated.omittedDiagnosticCount > 0 ||
          hydrated.counts.droppedCustomModels > 0
        ) {
          setSceneRecoveryError("일부 3D 모델의 원본 또는 무결성을 확인하지 못했습니다. 기존 PNG를 보존하기 위해 업데이트를 막았습니다.");
        }
        setRefTick((n) => n + 1);
        setIsRestoringScene(false);
        return;
      }

      const parsed = parseBg3dSceneWithModelsFromDataUrl(initialDataUrl);
      setSceneBaseDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT);
      pendingInitialCameraRef.current = viewportApiRef.current?.applyView(
        DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
      ) === true
        ? null
        : DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera;
      const nextPrimitives = parsed?.primitives ?? [];
      const nextModels = parsed?.customModels ?? [];
      historyRef.current = [createStudioBg3dHistorySnapshot({
        primitives: nextPrimitives,
        customModels: nextModels,
        document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      })];
      historyIndexRef.current = 0;
      setPrimitives(nextPrimitives);
      setCustomModels(nextModels);

      if (nextModels.length > 0) {
        const quality = resolveDeviceQuality(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, viewportHostRef.current);
        let recoveryFailed = false;
        const uniqueStorageIds = [...new Set(nextModels.map((model) => model.modelId))];
        for (const storageId of uniqueStorageIds) {
          if (!isCurrent()) return;
          try {
            const record = await getStoredBg3dModel(storageId);
            if (!record) throw new Error("missing-record");
            const attachment = await createStudioBg3dModelAttachment(record);
            await admitAndCacheModel({
              record,
              document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
              quality,
              cumulativeUsedBytes: totalStudioBg3dModelAttachmentBytes(
                attachmentByStorageModelIdRef.current.values(),
              ),
              renderer: modelRenderer,
              cache: modelRootCacheRef.current,
              pending: modelLoadPendingRef.current,
              isActive: isCurrent,
              signal: restoreController.signal,
            });
            if (!bindModelAttachment({
              attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
              storageModelIdByAttachmentId: storageModelIdByAttachmentIdRef.current,
            }, record, attachment)) {
              throw new Error("attachment-binding");
            }
          } catch {
            recoveryFailed = true;
          }
        }
        if (recoveryFailed) {
          setSceneRecoveryError("이전 3D 배경의 모델 원본을 모두 검증하지 못했습니다. 기존 PNG를 보존하기 위해 업데이트를 막았습니다.");
        }
      }
      if (!isCurrent()) return;
      setRefTick((n) => n + 1);
      setIsRestoringScene(false);
    })().finally(() => {
      if (sceneRestoreAbortRef.current === restoreController) {
        sceneRestoreAbortRef.current = null;
      }
    });
    return () => {
      cancelled = true;
      restoreController.abort("scene-restoration-cancelled");
      if (sceneRestoreAbortRef.current === restoreController) {
        sceneRestoreAbortRef.current = null;
      }
    };
  }, [open, initialDataUrl, initialScene, modelRenderer]);

  // 편집이 멈추면(디바운스) scene snapshots unify edits but exclude transient Orbit views.
  useEffect(() => {
    if (isRestoringScene || isBatchRenderingShots) return;
    const timer = setTimeout(() => {
      // Range gestures own an explicit before/after camera transaction. Let that transaction
      // publish one exact history entry instead of rebasing its pre-gesture camera away here.
      if (cameraLensGestureBeforeViewRef.current) return;
      // 캡처 트랜잭션 중에는 카메라 view 창이 캡처 프레임으로 잠깐 잡혀 있다. 그 순간의 라이브
      // 시점을 히스토리에 적으면 렌즈 시프트가 크롭 값으로 오염되므로 문서 카메라를 쓴다.
      const liveView = captureInFlightRef.current
        ? sceneBaseDocument.camera
        : viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
      const snap = createStudioBg3dHistorySnapshot({
        primitives,
        customModels,
        document: studioBg3dHistoryDocumentAtView(sceneBaseDocument, liveView),
      });
      const base = historyRef.current.slice(0, historyIndexRef.current + 1);
      const lastIndex = base.length - 1;
      const previousLast = base[lastIndex];
      if (previousLast) {
        // Orbit is intentionally not a high-frequency history command. Rebase the current state's
        // existing entry and its pending edit onto the same sampled view so unrelated undo never
        // jumps back to an old document camera.
        base[lastIndex] = {
          ...previousLast,
          document: studioBg3dHistoryDocumentAtView(previousLast.document, liveView),
        };
      }
      const last = base[base.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
      base.push(snap);
      if (base.length > 60) base.shift();
      historyRef.current = base;
      historyIndexRef.current = base.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [customModels, isBatchRenderingShots, isRestoringScene, primitives, sceneBaseDocument]);

  function commitImmediateHistoryTransition(
    nextPrimitives: readonly BgPrimitive[],
    nextCustomModels: readonly BgCustomModelInstance[],
    nextDocument: StudioBg3dSceneDocument,
    beforeOverride?: StudioBg3dHistorySnapshot,
    options: { readonly preserveBeforeCamera?: boolean } = {},
  ): void {
    const liveView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const rawBefore = beforeOverride ?? createStudioBg3dHistorySnapshot({
      primitives,
      customModels,
      document: sceneBaseDocument,
    });
    const before: StudioBg3dHistorySnapshot = {
      ...rawBefore,
      document: options.preserveBeforeCamera
        ? rawBefore.document
        : studioBg3dHistoryDocumentAtView(rawBefore.document, liveView),
    };
    const commandChangesCamera = options.preserveBeforeCamera || JSON.stringify(nextDocument.camera) !==
      JSON.stringify(sceneBaseDocument.camera);
    const after = createStudioBg3dHistorySnapshot({
      primitives: nextPrimitives,
      customModels: nextCustomModels,
      document: commandChangesCamera
        ? nextDocument
        : studioBg3dHistoryDocumentAtView(nextDocument, liveView),
    });
    const base = historyRef.current.slice(0, historyIndexRef.current + 1);
    const appendIfChanged = (snapshot: StudioBg3dHistorySnapshot) => {
      const last = base[base.length - 1];
      if (!last || JSON.stringify(last) !== JSON.stringify(snapshot)) base.push(snapshot);
    };
    // Preserve edits made inside the 400ms debounce window, then append the command result. Undo is
    // immediately available and returns to the exact pre-command constraint/physics state.
    appendIfChanged(before);
    appendIfChanged(after);
    while (base.length > 60) base.shift();
    historyRef.current = base;
    historyIndexRef.current = base.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }

  const doUndo = () => {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snap = historyRef.current[historyIndexRef.current];
    const nextPrimitives = clonePrimitives(snap.primitives);
    const nextCustomModels = cloneBgCustomModelInstances(snap.customModels);
    physicsRuntimeSourceRef.current = {
      primitives: nextPrimitives,
      customModels: nextCustomModels,
      document: snap.document,
    };
    setPrimitives(nextPrimitives);
    setCustomModels(nextCustomModels);
    setSceneBaseDocument(snap.document);
    applyOrDeferStudioBg3dHistoryCamera(
      viewportApiRef.current,
      pendingInitialCameraRef,
      snap.document.camera,
    );
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };
  const doRedo = () => {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snap = historyRef.current[historyIndexRef.current];
    const nextPrimitives = clonePrimitives(snap.primitives);
    const nextCustomModels = cloneBgCustomModelInstances(snap.customModels);
    physicsRuntimeSourceRef.current = {
      primitives: nextPrimitives,
      customModels: nextCustomModels,
      document: snap.document,
    };
    setPrimitives(nextPrimitives);
    setCustomModels(nextCustomModels);
    setSceneBaseDocument(snap.document);
    applyOrDeferStudioBg3dHistoryCamera(
      viewportApiRef.current,
      pendingInitialCameraRef,
      snap.document.camera,
    );
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const canAdmitSceneNodes = (additionalNodeCount: number): boolean => {
    const live = physicsRuntimeSourceRef.current;
    const nodeLimit = Math.min(
      STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
      live.document.budgets.complexity.maxNodes,
    );
    if (
      !Number.isSafeInteger(additionalNodeCount) ||
      additionalNodeCount < 0 ||
      live.primitives.length + live.customModels.length > nodeLimit - additionalNodeCount
    ) {
      setError(`이 장면에는 오브젝트를 최대 ${nodeLimit.toLocaleString()}개까지 둘 수 있습니다. 장면을 나누거나 기존 오브젝트를 정리해 주세요.`);
      return false;
    }
    return true;
  };

  const addPrimitive = (kind: BgPrimitiveKind) => {
    if (!canAdmitSceneNodes(1)) return;
    const live = physicsRuntimeSourceRef.current;
    const next = createPrimitive(kind, live.primitives.length);
    const nextPrimitives = [...live.primitives, next];
    physicsRuntimeSourceRef.current = { ...live, primitives: nextPrimitives };
    setPrimitives(nextPrimitives);
    setSelectedIds(new Set([next.id]));
  };

  // 복합 오브젝트 프리셋(건물/나무/차량/소품) 추가 — addPrimitive와 동일한 "추가 = 선택" UX,
  // parts[0](앵커 파츠)이 새로 선택된다(instantiateCompositePreset 계약).
  const addComposite = (presetId: string) => {
    const preset = COMPOSITE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const live = physicsRuntimeSourceRef.current;
    const parts = instantiateCompositePreset(preset, live.primitives.length);
    if (parts.length === 0 || !canAdmitSceneNodes(parts.length)) return;
    const nextPrimitives = [...live.primitives, ...parts];
    physicsRuntimeSourceRef.current = { ...live, primitives: nextPrimitives };
    setPrimitives(nextPrimitives);
    setSelectedIds(new Set([parts[0].id]));
  };

  const proceduralStarterDisabledReason = isRestoringScene
    ? "3D 장면을 복원하는 중입니다. 복원이 끝난 뒤 추가할 수 있습니다."
    : isUploadingModel || applyingTemplateId !== null || deletingModelId !== null ||
        isSavingTemplate
      ? "다른 3D 에셋 작업이 끝난 뒤 추가할 수 있습니다."
      : isCapturing || isBatchRenderingShots
        ? "3D 장면을 캡처하는 동안에는 에셋을 추가할 수 없습니다."
        : physicsInteractionLocked || isTransforming
          ? "물리 미리보기 또는 변형 작업을 마친 뒤 추가할 수 있습니다."
          : null;

  const addProceduralStarterAsset = (
    assetId: string,
  ): StudioBg3dProceduralInsertionPlan => {
    if (proceduralStarterDisabledReason) {
      return { ok: false, reason: "invalid-budget" };
    }
    const live = physicsRuntimeSourceRef.current;
    const currentUsage = calculateStudioBg3dProceduralSceneUsage(
      live.primitives,
      live.customModels,
      (modelId) => modelRootCacheRef.current.get(modelId)?.metrics ?? null,
    );
    if (!currentUsage) return { ok: false, reason: "invalid-budget" };

    const asset = getStudioBg3dProceduralStarterAsset(assetId);
    const policy = deriveStudioBg3dGlbValidationPolicy(live.document, deviceQuality);
    const limits = policy.budgets[policy.profile].complexity;
    const placementOrdinal = live.primitives.length + live.customModels.length;
    const column = placementOrdinal % 3;
    const row = Math.floor(placementOrdinal / 3) % 3;
    const plan = planStudioBg3dProceduralStarterInsertion({
      assetId,
      occupiedNodeIds: [
        ...live.primitives.map((primitive) => primitive.id),
        ...live.customModels.map((model) => model.id),
      ],
      currentUsage,
      limits,
      origin: asset
        ? [
            column * (asset.bounds.width + 0.75),
            0,
            -row * (asset.bounds.depth + 0.75),
          ]
        : [0, 0, 0],
    });
    if (!plan.ok) return plan;

    const nextPrimitives = [...live.primitives, ...plan.primitives];
    physicsRuntimeSourceRef.current = { ...live, primitives: nextPrimitives };
    setPrimitives(nextPrimitives);
    setSelectedIds(new Set([plan.primitives[0].id]));
    return plan;
  };

  // Append the whole template, select its first item, and undo it as one debounced snapshot.
  const addSceneTemplate = (templateId: string) => {
    const template = BG_SCENE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const live = physicsRuntimeSourceRef.current;
    const parts = instantiateSceneTemplate(template, live.primitives.length);
    if (parts.length === 0 || !canAdmitSceneNodes(parts.length)) return;
    const nextPrimitives = [...live.primitives, ...parts];
    physicsRuntimeSourceRef.current = { ...live, primitives: nextPrimitives };
    setPrimitives(nextPrimitives);
    setSelectedIds(new Set([parts[0].id]));
  };

  // Elements 3D one-shot seed after restore; refs avoid add* identity churn in deps.
  const addPrimitiveRef = useRef(addPrimitive);
  addPrimitiveRef.current = addPrimitive;
  const addSceneTemplateRef = useRef(addSceneTemplate);
  addSceneTemplateRef.current = addSceneTemplate;
  const objectInsertSeedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      objectInsertSeedKeyRef.current = null;
      return;
    }
    if (isRestoringScene) return;
    const templateId =
      typeof seedSceneTemplateId === "string" ? seedSceneTemplateId.trim() : "";
    const primitiveKind = seedPrimitiveKind ?? null;
    if (!templateId && !primitiveKind) return;
    const key = templateId ? `t:${templateId}` : `p:${primitiveKind}`;
    if (objectInsertSeedKeyRef.current === key) return;
    objectInsertSeedKeyRef.current = key;
    if (templateId) addSceneTemplateRef.current(templateId);
    else if (primitiveKind && primitiveKind in PRIMITIVE_DEFS) {
      addPrimitiveRef.current(primitiveKind);
    }
    onSeedObjectInsertConsumed?.();
  }, [open, isRestoringScene, seedSceneTemplateId, seedPrimitiveKind, onSeedObjectInsertConsumed]);

  // 방 만들기 스펙 → BgPrimitive[] 전개 추가 — addSceneTemplate과 동일한 "추가 = 선택" UX와
  // 디바운스 히스토리 계약(Ctrl+Z 한 번에 방 전체가 되돌아간다).
  const addRoomBuild = () => {
    const live = physicsRuntimeSourceRef.current;
    const parts = instantiateStudioBg3dRoomBuild(roomBuilderSpec, live.primitives.length);
    if (parts.length === 0 || !canAdmitSceneNodes(parts.length)) return;
    const nextPrimitives = [...live.primitives, ...parts];
    physicsRuntimeSourceRef.current = { ...live, primitives: nextPrimitives };
    setPrimitives(nextPrimitives);
    setSelectedIds(new Set([parts[0].id]));
  };

  const applyRoomBuilderPreset = (presetId: string) => {
    const preset = getStudioBg3dRoomPreset(presetId);
    if (preset) setRoomBuilderSpec(preset.spec);
  };

  const handleRoomBuilderSpecChange = (next: StudioBg3dRoomSpec) => {
    setRoomBuilderSpec(clampStudioBg3dRoomSpec(next));
  };

  const commitSceneEntityRemoval = (
    plan: StudioBg3dSceneRemovalSuccess,
    options: { readonly resetHistory?: boolean } = {},
  ): void => {
    const next = plan.snapshot;
    // This ref is the scene-mutation authority between an event and React's next render. Advance it
    // first so a queued add/template can never observe and resurrect the just-removed instances.
    physicsRuntimeSourceRef.current = {
      primitives: next.primitives,
      customModels: next.customModels,
      document: next.document,
    };
    setPrimitives(next.primitives);
    setCustomModels(next.customModels);
    setSceneBaseDocument(next.document);
    if (options.resetHistory) {
      // Deleting the backing IndexedDB bytes is intentionally irreversible. Retaining older
      // snapshots would let Undo resurrect an instance whose attachment and cache no longer exist.
      historyRef.current = [createStudioBg3dHistorySnapshot(next)];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    }
  };

  const removeSceneEntities = (ids: ReadonlySet<string>): boolean => {
    if (ids.size === 0) return false;
    const plan = planStudioBg3dSceneEntityRemoval({
      snapshot: physicsRuntimeSourceRef.current,
      entityIds: ids,
    });
    if (!plan.ok) {
      setError("부모를 삭제해도 자식의 월드 변환을 보존할 수 없어 삭제를 취소했습니다.");
      return false;
    }
    commitSceneEntityRemoval(plan);
    setError(null);
    return true;
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!removeSceneEntities(selectedIds)) return;
    setSelectedIds(new Set());
    setIsTransforming(false);
  };

  const deleteSelectedCustomModel = () => {
    deleteSelected();
  };

  // 키보드 Delete/Backspace 전용 — 선택된 것이 도형인지 커스텀 모델인지 몰라도 되는 단일 진입점
  // (§8: primitives에 있으면 도형, 아니면 커스텀 모델로 분기하는 것과 동일한 원칙).
  function deleteSelectedEntity() {
    deleteSelected();
  }

  const duplicateSelected = () => {
    if (selectedIds.size === 0) return;
    const live = physicsRuntimeSourceRef.current;
    const newPrimitives: BgPrimitive[] = [];
    const newModels: BgCustomModelInstance[] = [];
    const newIds = new Set<string>();

    for (const id of selectedIds) {
      const p = live.primitives.find(x => x.id === id);
      if (p) {
        const clone = duplicatePrimitive(p);
        newPrimitives.push(clone);
        newIds.add(clone.id);
      } else {
        const m = live.customModels.find(x => x.id === id);
        if (m) {
          const clone = duplicateBgCustomModelInstance(m);
          newModels.push(clone);
          newIds.add(clone.id);
        }
      }
    }

    if (!canAdmitSceneNodes(newPrimitives.length + newModels.length)) return;
    const nextPrimitives = [...live.primitives, ...newPrimitives];
    const nextCustomModels = [...live.customModels, ...newModels];
    physicsRuntimeSourceRef.current = {
      ...live,
      primitives: nextPrimitives,
      customModels: nextCustomModels,
    };
    if (newPrimitives.length > 0) setPrimitives(nextPrimitives);
    if (newModels.length > 0) setCustomModels(nextCustomModels);
    setSelectedIds(newIds);
  };

  const duplicateSelectedCustomModel = () => {
    duplicateSelected();
  };

  const applyMultiSelectDelta = (snap: boolean) => {
    const firstObj = primitiveObjectsRef.current.get(firstSelectedId!);
    const initialFirst = dragInitialFirstTransformRef.current;
    if (!firstObj || !initialFirst) return;
    firstObj.updateWorldMatrix(true, false);

    const patchTransform = (item: BgPrimitive | BgCustomModelInstance, isFirst: boolean) => {
      const initial = dragInitialSelectedTransformsRef.current.get(item.id);
      if (isFirst) {
        const next = {
          ...item,
          position: [firstObj.position.x, firstObj.position.y, firstObj.position.z] as [number, number, number],
          rotation: [firstObj.rotation.x, firstObj.rotation.y, firstObj.rotation.z] as [number, number, number],
          scale: [firstObj.scale.x, firstObj.scale.y, firstObj.scale.z] as [number, number, number],
        };
        if (snap && (next.position || next.rotation)) {
          const snapped = applyStudioBg3dSnapToTransform(next as { position: [number, number, number]; rotation: [number, number, number] }, snapSettings);
          next.position = snapped.position as [number, number, number];
          next.rotation = snapped.rotation as [number, number, number];
        }
        return next;
      }
      
      if (!initial) return item;
      const object = primitiveObjectsRef.current.get(item.id);
      if (!object) return item;
      object.parent?.updateWorldMatrix(true, false);
      const parentWorld = object.parent?.matrixWorld;
      const targetLocal = calculateStudioBg3dThreeWorldDeltaTransform({
        initialDriverWorldMatrix: initialFirst.worldMatrix,
        currentDriverWorldMatrix: firstObj.matrixWorld,
        initialTargetWorldMatrix: initial.worldMatrix,
        targetParentWorldMatrix: parentWorld,
      });
      if (!targetLocal) return item;
      const next = {
        ...item,
        ...targetLocal,
      };
      if (snap) {
        const snapped = applyStudioBg3dSnapToTransform({
          position: next.position,
          rotation: next.rotation,
        }, snapSettings);
        next.position = snapped.position as [number, number, number];
        next.rotation = snapped.rotation as [number, number, number];
      }
      return next;
    };

    setPrimitives((prev) => prev.map((p) => {
      if (!selectedIds.has(p.id) || isBgObjectTransformBlocked(p)) return p;
      return patchTransform(p, p.id === firstSelectedId) as BgPrimitive;
    }));

    setCustomModels((prev) => prev.map((m) => {
      if (!selectedIds.has(m.id) || isBgObjectTransformBlocked(m)) return m;
      return patchTransform(m, m.id === firstSelectedId) as BgCustomModelInstance;
    }));
  };

  const updateTransform = (
    id: string,
    patch: Partial<Pick<BgPrimitive, "position" | "rotation" | "scale">>,
    options: { readonly snap?: boolean } = {}
  ) => {
    const shouldSnap = options.snap !== false;
    setPrimitives((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (isBgObjectTransformBlocked(p)) return p;
        const next = { ...p, ...patch };
        if (shouldSnap && (patch.position || patch.rotation)) {
          const snapped = applyStudioBg3dSnapToTransform(
            {
              position: next.position,
              rotation: next.rotation,
            },
            snapSettings
          );
          if (patch.position) next.position = snapped.position;
          if (patch.rotation) next.rotation = snapped.rotation;
        }
        return next;
      })
    );
  };

  function updateCustomModelTransform(
    id: string,
    patch: Partial<Pick<BgCustomModelInstance, "position" | "rotation" | "scale">>,
    options: { readonly snap?: boolean } = {}
  ) {
    const shouldSnap = options.snap !== false;
    setCustomModels((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (isBgObjectTransformBlocked(m)) return m;
        const next = { ...m, ...patch };
        if (shouldSnap && (patch.position || patch.rotation)) {
          const snapped = applyStudioBg3dSnapToTransform(
            {
              position: next.position,
              rotation: next.rotation,
            },
            snapSettings
          );
          if (patch.position) next.position = snapped.position;
          if (patch.rotation) next.rotation = snapped.rotation;
        }
        return next;
      })
    );
  }

  function updateCustomModelMaterial(
    id: string,
    update: StudioBg3dMaterialOverride | null | ((current: StudioBg3dMaterialOverride) => StudioBg3dMaterialOverride),
  ) {
    setCustomModels((prev) => prev.map((model) => {
      if (model.id !== id) return model;
      if (update === null) return { ...model, materialOverride: undefined };
      const current = model.materialOverride ?? DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE;
      const materialOverride = typeof update === "function" ? update(current) : update;
      return { ...model, materialOverride: { ...materialOverride } };
    }));
  }

  function updateCustomModelAnimation(
    id: string,
    update: StudioBg3dAnimationPlayback | null | ((current: StudioBg3dAnimationPlayback) => StudioBg3dAnimationPlayback),
  ) {
    setCustomModels((prev) => prev.map((model) => {
      if (model.id !== id) return model;
      if (update === null) return { ...model, animation: undefined };
      const stored = model.animation ?? DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK;
      const liveTimeSeconds = modelAnimationTimeReadersRef.current.get(id)?.();
      const current = snapshotStudioBg3dLiveAnimationPlayback(stored, liveTimeSeconds);
      const animation = typeof update === "function" ? update(current) : update;
      return { ...model, animation: { ...animation } };
    }));
  }

  function updateCustomModelPose(
    id: string,
    update: StudioBg3dPoseLayer | null | ((current: StudioBg3dPoseLayer) => StudioBg3dPoseLayer),
  ) {
    setCustomModels((prev) => prev.map((model) => {
      if (model.id !== id) return model;
      if (update === null) return { ...model, pose: undefined };
      const current = model.pose ?? DEFAULT_STUDIO_BG3D_POSE_LAYER;
      const pose = typeof update === "function" ? update(current) : update;
      return {
        ...model,
        pose: {
          ...pose,
          joints: pose.joints.map((joint) => ({
            jointKey: joint.jointKey,
            rotationOffset: [...joint.rotationOffset],
          })),
        },
      };
    }));
  }

  function updateCustomModelMorph(
    id: string,
    update: StudioBg3dMorphLayer | null | ((current: StudioBg3dMorphLayer) => StudioBg3dMorphLayer),
  ) {
    setCustomModels((prev) => prev.map((model) => {
      if (model.id !== id) return model;
      if (update === null) return { ...model, morph: undefined };
      const current = model.morph ?? DEFAULT_STUDIO_BG3D_MORPH_LAYER;
      const morph = typeof update === "function" ? update(current) : update;
      return {
        ...model,
        morph: {
          ...morph,
          targets: morph.targets.map((target) => ({ ...target })),
        },
      };
    }));
  }

  function updateCustomModelConstraints(
    id: string,
    update: StudioBg3dConstraintLayer | null | ((current: StudioBg3dConstraintLayer) => StudioBg3dConstraintLayer),
  ) {
    setCustomModels((previous) => previous.map((model) => {
      if (model.id !== id) return model;
      if (update === null) return { ...model, constraints: undefined };
      const current: StudioBg3dConstraintLayer = model.constraints
        ? {
            ...model.constraints,
            aims: Array.isArray(model.constraints.aims) ? model.constraints.aims : [],
            twoBoneIks: Array.isArray(model.constraints.twoBoneIks)
              ? model.constraints.twoBoneIks
              : [],
          }
        : DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER;
      const constraints = typeof update === "function" ? update(current) : update;
      return {
        ...model,
        constraints: {
          ...constraints,
          aims: constraints.aims.map((aim) => ({ ...aim, target: [...aim.target] })),
          twoBoneIks: constraints.twoBoneIks.map((ik) => ({
            ...ik,
            target: [...ik.target],
            poleTarget: [...ik.poleTarget],
          })),
        },
      };
    }));
  }

  function reparentSceneEntity(id: string, nextParentId: string | null): void {
    const entities = [...primitives, ...customModels];
    const entity = entities.find((candidate) => candidate.id === id);
    if (
      !entity ||
      isBgObjectTransformBlocked(entity) ||
      !canSetStudioBg3dParent(entities, id, nextParentId)
    ) {
      return;
    }
    const preserved = calculateStudioBg3dThreeReparentTransform(entities, id, nextParentId);
    if (!preserved) {
      setError("현재 부모 변환에는 기울어짐이 생겨 위치를 보존할 수 없습니다. 부모의 비균일 크기 조정을 확인해 주세요.");
      return;
    }
    const apply = <T extends BgPrimitive | BgCustomModelInstance>(candidate: T): T => {
      if (candidate.id !== id) return candidate;
      return {
        ...candidate,
        parentId: nextParentId,
        ...preserved,
      };
    };
    setPrimitives((current) => current.map(apply) as BgPrimitive[]);
    setCustomModels((current) => current.map(apply) as BgCustomModelInstance[]);
  }

  const registerModelAnimationTime = useCallback((id: string, reader: (() => number) | null) => {
    if (reader) modelAnimationTimeReadersRef.current.set(id, reader);
    else modelAnimationTimeReadersRef.current.delete(id);
  }, []);

  const registerModelRigBake = useCallback((id: string, reader: StudioBg3dRigBakeReader | null) => {
    if (reader) modelRigBakeReadersRef.current.set(id, reader);
    else modelRigBakeReadersRef.current.delete(id);
  }, []);

  function bakeCustomModelRigConstraints(id: string): void {
    if (
      captureInFlightRef.current || isCapturing || isRestoringScene ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
    const model = customModels.find((candidate) => candidate.id === id);
    const hasEffectiveConstraint = Boolean(
      model?.constraints?.enabled && (
        model.constraints.aims.some((aim) => aim.weight > 0) ||
        model.constraints.twoBoneIks.some((ik) => ik.weight > 0)
      )
    );
    if (!model || !hasEffectiveConstraint) {
      setError("굽기 전에 강도가 0보다 큰 IK 또는 에임 제약을 켜 주세요.");
      return;
    }
    const snapshot = modelRigBakeReadersRef.current.get(id)?.() ?? null;
    if (!snapshot) {
      setError("현재 리그 결과를 안전하게 고정할 수 없습니다. 조인트 계층·크기 변환과 모델 준비 상태를 확인해 주세요.");
      return;
    }
    const transition = createStudioBg3dRigPoseBakeHistoryTransition(model.animation, snapshot);
    if (!transition) {
      setError("현재 표시 프레임을 정적 포즈로 정규화하지 못했습니다.");
      return;
    }
    const beforeCustomModels = customModels.map((candidate) => {
      if (!candidate.animation) return candidate;
      const animation = candidate.id === id
        ? transition.beforeAnimation
        : snapshotStudioBg3dLiveAnimationPlayback(
            candidate.animation,
            modelAnimationTimeReadersRef.current.get(candidate.id)?.(),
          );
      return animation ? { ...candidate, animation } : candidate;
    });
    const nextCustomModels = beforeCustomModels.map((candidate) => candidate.id === id
      ? { ...candidate, ...transition.patch }
      : candidate
    );
    commitImmediateHistoryTransition(
      primitives,
      nextCustomModels,
      sceneBaseDocument,
      createStudioBg3dHistorySnapshot({
        primitives,
        customModels: beforeCustomModels,
        document: sceneBaseDocument,
      }),
    );
    setError(null);
    setCustomModels(nextCustomModels);
  }

  const finishModelAnimation = useCallback((id: string, timeSeconds: number) => {
    setCustomModels((current) => current.map((model) => {
      if (model.id !== id || !model.animation?.playing) return model;
      return {
        ...model,
        animation: { ...model.animation, playing: false, timeSeconds },
      };
    }));
  }, []);

  const updateColor = (id: string, color: string) => {
    setPrimitives((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)));
  };

  function togglePrimitiveFlag(id: string, flag: "visible" | "locked") {
    setPrimitives((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (flag === "visible") return { ...p, visible: !isBgObjectVisible(p) };
        return { ...p, locked: !isBgObjectLocked(p) };
      })
    );
  }

  function toggleCustomModelFlag(id: string, flag: "visible" | "locked") {
    setCustomModels((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (flag === "visible") return { ...m, visible: !isBgObjectVisible(m) };
        return { ...m, locked: !isBgObjectLocked(m) };
      })
    );
  }

  function renameBgObject(id: string, kind: "primitive" | "model") {
    const item = kind === "primitive" ? primitives.find(p => p.id === id) : customModels.find(m => m.id === id);
    if (!item) return;
    const currentName = item.name || (kind === "primitive" ? PRIMITIVE_DEFS[(item as BgPrimitive).kind].label : "3D 모델");
    const newName = window.prompt("새 이름을 입력하세요", currentName);
    if (newName === null) return;
    const trimmed = newName.trim();
    
    if (kind === "primitive") {
      setPrimitives((prev) => prev.map(p => p.id === id ? { ...p, name: trimmed || undefined } : p));
    } else {
      setCustomModels((prev) => prev.map(m => m.id === id ? { ...m, name: trimmed || undefined } : m));
    }
  }

  function groundSelectedEntity() {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      const object = primitiveObjectsRef.current.get(id);
      if (object) {
        object.updateWorldMatrix(true, true);
        const bounds = new THREE.Box3().setFromObject(object);
        if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) {
          const nextWorldPosition = object.getWorldPosition(new THREE.Vector3());
          nextWorldPosition.y -= bounds.min.y;
          object.parent?.updateWorldMatrix(true, false);
          const nextLocalPosition = object.parent
            ? object.parent.worldToLocal(nextWorldPosition)
            : nextWorldPosition;
          const position: [number, number, number] = [
            nextLocalPosition.x,
            nextLocalPosition.y,
            nextLocalPosition.z,
          ];
          const primitive = primitives.find((candidate) => candidate.id === id);
          if (primitive && !isBgObjectTransformBlocked(primitive)) {
            updateTransform(id, { position }, { snap: false });
            continue;
          }
          const model = customModels.find((candidate) => candidate.id === id);
          if (model && !isBgObjectTransformBlocked(model)) {
            updateCustomModelTransform(id, { position }, { snap: false });
            continue;
          }
        }
      }
      const prim = primitives.find((p) => p.id === id);
      if (prim) {
        if (isBgObjectTransformBlocked(prim)) continue;
        if (prim.parentId) continue;
        const position = groundPrimitiveTransform(prim.kind, prim.position, prim.rotation, prim.scale);
        updateTransform(prim.id, { position });
        continue;
      }
      const model = customModels.find((m) => m.id === id);
      if (!model || isBgObjectTransformBlocked(model)) continue;
      if (model.parentId) continue;
      const root = modelRootCacheRef.current.get(model.modelId)?.root;
      const size = root ? measureBg3dObjectSize(root) : ([2, 2, 2] as [number, number, number]);
      const position = groundModelTransform(size, model.position, model.rotation, model.scale);
      updateCustomModelTransform(model.id, { position });
    }
  }

  function placeSelectedModelRecipe() {
    if (physicsInteractionLocked) {
      setError("물리 미리보기 중에는 장면 변형 도구를 잠급니다.");
      return;
    }
    if (selectedIds.size === 0) {
      setError("배치 정리할 커스텀 모델을 선택해 주세요.");
      return;
    }
    if (selectedIds.size > STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS) {
      setError(
        `배치 정리는 한 번에 최대 ${STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS}개까지 지원합니다.`,
      );
      return;
    }

    // Multi-select: independent per-model auto-fit → ground recipes, one history step (surface snap style).
    const models: BgCustomModelInstance[] = [];
    for (const id of selectedIds) {
      const model = customModels.find((candidate) => candidate.id === id);
      if (!model) {
        setError("배치 정리는 커스텀 모델에만 사용할 수 있습니다.");
        return;
      }
      models.push(model);
    }
    if (models.every((model) => isBgObjectTransformBlocked(model))) {
      setError("선택한 객체의 잠금을 먼저 해제해 주세요.");
      return;
    }

    const transformById = new Map<
      string,
      {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
      }
    >();
    let successCount = 0;
    let firstFailure: string | null = null;
    for (const model of models) {
      if (transformById.size >= STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS) break;
      if (isBgObjectTransformBlocked(model)) continue;
      const root = modelRootCacheRef.current.get(model.modelId)?.root;
      const boundingSize = root
        ? measureBg3dObjectSize(root)
        : ([2, 2, 2] as [number, number, number]);
      const result = planStudioBg3dModelPlacementRecipe({
        position: model.position,
        rotation: model.rotation,
        scale: model.scale,
        boundingSize,
        autoFitTargetSize: 2,
        groundY: 0,
        yawDegrees: 0,
      });
      if (!result.ok) {
        firstFailure ??= result.reason;
        continue;
      }
      successCount += 1;
      transformById.set(model.id, {
        position: [...result.position] as [number, number, number],
        rotation: [...result.rotation] as [number, number, number],
        scale: [...result.scale] as [number, number, number],
      });
    }

    if (successCount === 0) {
      setError(firstFailure ?? "배치 정리를 적용할 수 없습니다.");
      return;
    }

    const nextCustomModels = customModels.map((model) => {
      const next = transformById.get(model.id);
      if (!next) return model;
      return {
        ...model,
        position: next.position,
        rotation: next.rotation,
        scale: next.scale,
      };
    });
    commitImmediateHistoryTransition(primitives, nextCustomModels, sceneBaseDocument);
    setCustomModels(nextCustomModels);
    setError(null);
    setSurfaceSnapStatus({
      tone: "success",
      message: `${successCount}개 배치를 정리했어요`,
    });
  }

  function centerAndGroundSelectedEntity() {
    if (
      selectedIds.size !== 1 ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) {
      return;
    }

    const id = selectedIds.values().next().value;
    if (typeof id !== "string") return;
    const primitive = primitives.find((candidate) => candidate.id === id);
    const model = customModels.find((candidate) => candidate.id === id);
    const entity = primitive ?? model;
    if (!entity || isBgObjectTransformBlocked(entity)) return;

    const object = primitiveObjectsRef.current.get(id);
    if (!object) {
      setError("선택한 객체의 지오메트리를 아직 준비하지 못했습니다. 모델이 표시된 뒤 다시 시도해 주세요.");
      return;
    }

    const nextLocalPosition = resolveStudioBg3dThreeCenterGroundLocalPosition(object);
    if (!nextLocalPosition) {
      setError("선택한 객체의 지오메트리 경계가 올바르지 않아 원점 정렬을 취소했습니다.");
      return;
    }

    const currentPosition = entity.position;
    if (currentPosition.every(
      (value, index) => Math.abs(value - nextLocalPosition[index]) <= 1e-6
    )) {
      setError(null);
      return;
    }

    const nextPrimitives = primitive
      ? primitives.map((candidate) => candidate.id === id
        ? { ...candidate, position: nextLocalPosition }
        : candidate)
      : primitives;
    const nextCustomModels = model
      ? customModels.map((candidate) => candidate.id === id
        ? { ...candidate, position: nextLocalPosition }
        : candidate)
      : customModels;

    // Explicit editor commands enter history immediately, avoiding the normal 400 ms debounce and
    // guaranteeing one-step undo even when the user invokes another command right away.
    commitImmediateHistoryTransition(nextPrimitives, nextCustomModels, sceneBaseDocument);
    setPrimitives(nextPrimitives);
    setCustomModels(nextCustomModels);
    setError(null);
  }

  function commitCameraViewCommand(
    beforeView: StudioBg3dCameraSettings,
    nextView: StudioBg3dCameraSettings,
  ): boolean {
    const viewport = viewportApiRef.current;
    const beforeDocument = canonicalSceneDocument({ ...sceneBaseDocument, camera: beforeView });
    const nextDocument = canonicalSceneDocument({ ...sceneBaseDocument, camera: nextView });
    if (!viewport || !beforeDocument || !nextDocument) {
      viewport?.applyView(beforeView);
      setError("카메라 구도를 안전한 장면 상태로 만들지 못해 명령을 취소했습니다.");
      return false;
    }
    if (JSON.stringify(beforeDocument.camera) === JSON.stringify(nextDocument.camera)) {
      setError(null);
      return true;
    }
    if (!viewport.applyView(nextDocument.camera)) {
      viewport.applyView(beforeDocument.camera);
      setError("현재 카메라 투영이 아직 준비되지 않아 구도를 변경하지 않았습니다.");
      return false;
    }
    commitImmediateHistoryTransition(
      primitives,
      customModels,
      nextDocument,
      createStudioBg3dHistorySnapshot({
        primitives,
        customModels,
        document: beforeDocument,
      }),
      { preserveBeforeCamera: true },
    );
    setSceneBaseDocument(nextDocument);
    setViewportHinted(true);
    setError(null);
    return true;
  }

  function zoomCameraBy(distanceFactor: number): void {
    if (
      isCapturing || isBatchRenderingShots || isRestoringScene ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
    const viewport = viewportApiRef.current;
    if (!viewport) {
      setError("카메라가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const beforeView = viewport.readView();
    if (!viewport.zoomBy(distanceFactor)) {
      setError("현재 카메라에서는 더 확대하거나 축소할 수 없습니다.");
      return;
    }
    const nextView = viewport.readView();
    commitCameraViewCommand(beforeView, nextView);
  }

  function applyCameraPreset(presetId: string): void {
    if (
      isCapturing || isBatchRenderingShots || isRestoringScene ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
    const viewport = viewportApiRef.current;
    if (!viewport) {
      setError("카메라가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const beforeView = viewport.readView();
    if (!viewport.applyPreset(presetId)) {
      setError("선택한 카메라 프리셋을 적용하지 못했습니다.");
      return;
    }
    commitCameraViewCommand(beforeView, viewport.readView());
  }

  function focusSelectedEntity() {
    if (selectedIds.size !== 1) {
      setError("화면에 맞출 3D 객체를 하나만 선택해 주세요.");
      return;
    }
    const selectedId = selectedIds.values().next().value;
    if (typeof selectedId !== "string") return;
    const object = primitiveObjectsRef.current.get(selectedId);
    const bounds = readStudioBg3dObjectWorldBounds(object);
    const framing = viewportApiRef.current?.readFramingState() ?? null;
    if (!object || !bounds || !framing) {
      setError("선택한 객체의 실제 경계 또는 카메라 화면을 아직 준비하지 못했습니다. 모델이 표시된 뒤 다시 시도해 주세요.");
      return;
    }
    const nextView = fitStudioBg3dCameraToBounds({
      camera: framing.view,
      bounds,
      viewportAspect: framing.viewportAspect,
      ...(framing.orthographicFrustumAtZoomOne
        ? { orthographicFrustumAtZoomOne: framing.orthographicFrustumAtZoomOne }
        : {}),
    });
    if (!nextView || !commitCameraViewCommand(framing.view, nextView)) {
      if (!nextView) {
        setError("선택한 객체를 현재 카메라 투영과 렌즈 이동 범위 안에 맞출 수 없어 구도를 유지했습니다.");
      }
      return;
    }
  }

  const registerPrimitiveRef = (id: string, obj: THREE.Group | null) => {
    if (obj) primitiveObjectsRef.current.set(id, obj);
    else primitiveObjectsRef.current.delete(id);
    setRefTick((n) => n + 1);
  };

  // ── §6 커스텀 3D 모델 추가/업로드/삭제 핸들러 ─────────────────────────────────────────
  async function ensureModelRootCached(
    modelId: string,
    session: StudioBg3dModalSession,
    isOperationCurrent: () => boolean,
    signal: AbortSignal,
  ): Promise<Bg3dVerifiedStoredRecord | null> {
    const record = await getStoredBg3dModel(modelId);
    if (!isOperationCurrent()) throw new StudioBg3dStaleModalOperationError();
    if (!record) return null;
    const existingAttachment = attachmentByStorageModelIdRef.current.get(modelId);
    const sourceFormat =
      normalizeStudioGeneric3dSourceFormat(genericModelSourceFormats.get(modelId))
      ?? parseStudioGeneric3dWorkflowMetadata(existingAttachment)?.sourceFormat
      ?? "glb";
    const classification =
      normalizeStudioGeneric3dClassification(genericModelClassifications.get(modelId))
      ?? parseStudioGeneric3dWorkflowMetadata(existingAttachment)?.classification
      ?? null;
    const attachment = withStudioGeneric3dWorkflowMetadata(
      existingAttachment ?? await createStudioBg3dModelAttachment(record),
      { sourceFormat, classification },
    );
    const live = physicsRuntimeSourceRef.current;
    assertStudioBg3dModelAttachmentAdmission({
      models: live.customModels,
      attachments: attachmentByStorageModelIdRef.current,
      candidateAttachments: [attachment],
      maximumAttachments: STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
      maximumCumulativeBytes: live.document.budgets.complexity.maxModelBytes,
    });
    const cumulativeUsedBytes = calculateStudioBg3dPlacedModelBytes(
      live.customModels,
      attachmentByStorageModelIdRef.current,
      modelId
    );
    await admitAndCacheModel({
      record,
      document: live.document,
      quality: resolveDeviceQuality(live.document, viewportHostRef.current),
      cumulativeUsedBytes,
      renderer: modelRenderer,
      cache: modelRootCacheRef.current,
      pending: modelLoadPendingRef.current,
      isActive: () => isModalAssetSessionCurrent(session) && isOperationCurrent(),
      signal,
    });
    if (!isOperationCurrent()) throw new StudioBg3dStaleModalOperationError();
    if (!bindModelAttachment({
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      storageModelIdByAttachmentId: storageModelIdByAttachmentIdRef.current,
    }, record, attachment)) {
      return null;
    }
    setGenericModelSourceFormats((previous) =>
      previous.get(modelId) === sourceFormat
        ? previous
        : mergeStudioGeneric3dWorkflowMaps(previous, new Map([[modelId, sourceFormat]])),
    );
    return record;
  }

  function publishPlacementSession(next: StudioBg3dPlacementSessionState): void {
    placementSessionRef.current = next;
    setPlacementSession(next);
  }

  function cancelCustomModelPlacement(message?: string): void {
    const current = placementSessionRef.current;
    if (current.phase === "preview") {
      const transition = transitionStudioBg3dPlacementSession(current, {
        type: "escape",
        placementToken: current.identity.placementToken,
      });
      if (transition.ok) publishPlacementSession(transition.state);
    }
    setPlacementPreviewAsset(null);
    if (message) setSurfaceSnapStatus({ tone: "info", message });
  }

  function moveCustomModelPlacement(
    target: StudioBg3dPlacementPointerTarget,
    shiftKey: boolean,
  ): void {
    const current = placementSessionRef.current;
    if (current.phase !== "preview") return;
    const transition = transitionStudioBg3dPlacementSession(current, {
      type: "pointer-move",
      placementToken: current.identity.placementToken,
      shiftKey,
      ...target,
    });
    if (transition.ok) publishPlacementSession(transition.state);
  }

  function rotateCustomModelPlacement(direction: "clockwise" | "counter-clockwise"): void {
    const current = placementSessionRef.current;
    if (current.phase !== "preview") return;
    const transition = transitionStudioBg3dPlacementSession(current, {
      type: "rotate",
      placementToken: current.identity.placementToken,
      direction,
    });
    if (transition.ok) publishPlacementSession(transition.state);
  }

  function commitCustomModelPlacement(
    target: StudioBg3dPlacementPointerTarget,
    shiftKey: boolean,
  ): void {
    const current = placementSessionRef.current;
    const asset = placementPreviewAsset;
    if (current.phase !== "preview" || !asset) return;
    if (!canAdmitSceneNodes(1)) return;
    const moved = transitionStudioBg3dPlacementSession(current, {
      type: "pointer-move",
      placementToken: current.identity.placementToken,
      shiftKey,
      ...target,
    });
    if (!moved.ok || moved.state.phase !== "preview") return;
    const committed = transitionStudioBg3dPlacementSession(moved.state, {
      type: "click-commit",
      placementToken: moved.state.identity.placementToken,
    });
    const plan = committed.ok ? committed.commitPlan : null;
    if (!plan || plan.storageId !== asset.modelId) return;

    const normal = new THREE.Vector3(...plan.placement.worldNormal).normalize();
    const orientation = new THREE.Quaternion()
      .setFromAxisAngle(normal, THREE.MathUtils.degToRad(-plan.placement.yawDegrees))
      .multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal));
    const insertionOffset = new THREE.Vector3(...asset.localInsertionPoint)
      .applyQuaternion(orientation);
    const position = new THREE.Vector3(...plan.placement.worldPosition)
      .addScaledVector(new THREE.Vector3(...plan.placement.worldNormal), 0.01)
      .sub(insertionOffset);
    if (!position.toArray().every((component) => (
      Number.isFinite(component) && Math.abs(component) <= 10_000
    ))) {
      cancelCustomModelPlacement();
      setError("선택한 위치가 3D 장면의 안전 범위를 벗어나 배치를 취소했습니다.");
      return;
    }

    const runtime = physicsRuntimeSourceRef.current;
    const attachment = attachmentByStorageModelIdRef.current.get(asset.modelId);
    if (!attachment) {
      setError("배치할 3D 모델의 장면 연결 정보를 확인할 수 없어 장면을 변경하지 않았습니다.");
      return;
    }
    try {
      assertStudioBg3dModelAttachmentAdmission({
        models: runtime.customModels,
        attachments: attachmentByStorageModelIdRef.current,
        candidateAttachments: [attachment],
        maximumAttachments: STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
        maximumCumulativeBytes: runtime.document.budgets.complexity.maxModelBytes,
      });
    } catch (admissionFailure) {
      setError(
        admissionFailure instanceof StudioBg3dModelPlacementAdmissionError
          ? admissionFailure.message
          : "3D 모델 원본 개수 예산을 확인할 수 없어 장면을 변경하지 않았습니다.",
      );
      return;
    }
    const rotation = new THREE.Euler().setFromQuaternion(orientation, "XYZ");
    const next: BgCustomModelInstance = {
      ...createBgCustomModelInstance(asset.modelId, runtime.customModels.length),
      position: position.toArray() as [number, number, number],
      rotation: [rotation.x, rotation.y, rotation.z],
    };
    const nextCustomModels = [...runtime.customModels, next];
    commitImmediateHistoryTransition(runtime.primitives, nextCustomModels, runtime.document);
    physicsRuntimeSourceRef.current = { ...runtime, customModels: nextCustomModels };
    setCustomModels(nextCustomModels);
    setSelectedIds(new Set([next.id]));
    setRefTick((revision) => revision + 1);
    publishPlacementSession(committed.state);
    setPlacementPreviewAsset(null);
    setSurfaceSnapStatus({
      tone: "success",
      message: `${asset.name} 모델을 포인터 위치에 배치했습니다.`,
    });
    setError(null);
  }

  async function addCustomModelToScene(modelId: string) {
    const session = modalAssetSessionRef.current;
    if (!session || !isModalAssetSessionCurrent(session)) return;
    if (
      isCapturing || isRestoringScene || isUploadingModel || isBatchRenderingShots || isQuadView ||
      applyingTemplateId !== null || deletingModelId !== null ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
    if (!canAdmitSceneNodes(1)) return;
    setError(null);
    try {
      await studioBg3dModalOperationCoordinator.runSceneMutation(
        session,
        async (lease) => {
          lease.throwIfRevoked();
          const record = await ensureModelRootCached(
            modelId,
            session,
            lease.isCurrent,
            lease.signal,
          );
          lease.throwIfRevoked();
          if (!record) throw new Error("model-unavailable");
          const root = modelRootCacheRef.current.get(modelId)?.root;
          if (!root) throw new Error("model-unavailable");
          root.updateWorldMatrix(true, true);
          const bounds = new THREE.Box3().setFromObject(root, true);
          if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) {
            throw new Error("model-bounds-unavailable");
          }
          const size = bounds.getSize(new THREE.Vector3()).toArray();
          if (size.some((component) => component <= 0 || component > 10_000)) {
            throw new Error("model-bounds-unavailable");
          }
          return {
            record,
            asset: {
              modelId,
              name: record.name,
              size: size as [number, number, number],
              localInsertionPoint: [
                (bounds.min.x + bounds.max.x) / 2,
                bounds.min.y,
                (bounds.min.z + bounds.max.z) / 2,
              ] as [number, number, number],
            } satisfies StudioBg3dPlacementPreviewAsset,
          };
        },
        ({ record, asset }) => {
          if (surfaceSnapArmedRef.current) cancelSurfaceSnap();
          placementTokenSequenceRef.current += 1;
          const initialTarget = viewportApiRef.current?.readView().target ?? [0, 0, 0];
          const idle = createStudioBg3dPlacementSession();
          const begun = transitionStudioBg3dPlacementSession(idle, {
            type: "begin",
            assetId: record.contentHash,
            storageId: record.id,
            placementToken: `place-${placementTokenSequenceRef.current}-${Date.now()}`,
            sourceKind: "asset-library",
            floorPoint: [initialTarget[0], initialTarget[2]],
          });
          if (!begun.ok || begun.state.phase !== "preview") {
            throw new Error("placement-session-unavailable");
          }
          publishPlacementSession(begun.state);
          setPlacementPreviewAsset(asset);
          setSurfaceSnapStatus({
            tone: "info",
            message: `${asset.name} 모델을 원하는 위치로 옮긴 뒤 클릭해 배치하세요. Shift를 누르면 X/Z축으로 고정됩니다.`,
          });
          setSelectedIds(new Set());
          setRefTick((revision) => revision + 1);
        },
      );
    } catch (modelFailure) {
      if (!isModalAssetSessionCurrent(session)) return;
      setError(
        modelFailure instanceof StudioBg3dThreeOperationError
          ? modelFailure.message
          : modelFailure instanceof StudioBg3dModelPlacementAdmissionError
            ? modelFailure.message
          : "3D 모델의 원본·경계와 무결성을 확인하지 못해 배치 미리보기를 시작하지 않았습니다."
      );
    }
  }

  async function applyUserTemplate(entry: Bg3dTemplateLibraryEntry) {
    if (
      applyingTemplateId !== null ||
      isRestoringScene ||
      isUploadingModel ||
      captureInFlightRef.current ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) {
      return;
    }
    const session = modalAssetSessionRef.current;
    if (!session || !isModalAssetSessionCurrent(session)) return;
    const templateOwnedCacheEntries = new Map<string, ModelRootCacheEntry>();
    let committed = false;
    const cleanupUncommittedTemplateCache = () => {
      const liveStorageIds = new Set(
        physicsRuntimeSourceRef.current.customModels.map((model) => model.modelId),
      );
      for (const [storageId, ownedEntry] of templateOwnedCacheEntries) {
        // A later queued operation may already have committed this exact cache entry into the live
        // scene. Never dispose live geometry, and never delete a replacement installed by another
        // operation after this template load completed.
        if (liveStorageIds.has(storageId)) continue;
        if (modelRootCacheRef.current.get(storageId) !== ownedEntry) continue;
        ownedEntry.dispose();
        modelRootCacheRef.current.delete(storageId);
      }
      templateOwnedCacheEntries.clear();
    };
    setApplyingTemplateId(entry.id);
    setError(null);
    try {
      await studioBg3dModalOperationCoordinator.runSceneMutation(
        session,
        async (lease) => {
          lease.throwIfRevoked();
          if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) {
            throw new Error("physics-transient");
          }
          const live = physicsRuntimeSourceRef.current;
          const destinationDocument = sceneBaseDocument;
          const nodeLimit = Math.min(
            STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
            destinationDocument.budgets.complexity.maxNodes,
          );
          if (live.primitives.length + live.customModels.length + entry.document.nodes.length > nodeLimit) {
            throw new Error("template-node-budget");
          }
          const occupiedNodeIds = new Set([
            ...live.primitives.map((primitive) => primitive.id),
            ...live.customModels.map((model) => model.id),
          ]);
          const instantiated = await instantiateBg3dTemplateDocument(
            entry.document,
            occupiedNodeIds,
            generateId,
          );
          if (!instantiated) throw new Error("template-instantiation");

          const nextAttachmentByStorageId = new Map(attachmentByStorageModelIdRef.current);
          const nextStorageIdByAttachment = new Map(storageModelIdByAttachmentIdRef.current);
          const countedHashes = new Set<string>();
          for (const model of live.customModels) {
            const attachment = attachmentByStorageModelIdRef.current.get(model.modelId);
            if (attachment) countedHashes.add(attachment.hash);
          }
          let cumulativeUsedBytes = calculateStudioBg3dPlacedModelBytes(
            live.customModels,
            attachmentByStorageModelIdRef.current,
          );
          const quality = resolveDeviceQuality(
            destinationDocument,
            viewportHostRef.current,
          );

          for (const attachment of instantiated.document.attachments) {
            if (!isModalAssetSessionCurrent(session) || !lease.isCurrent()) {
              throw new StudioBg3dStaleModalOperationError();
            }
            const record = await getStoredBg3dModelByHash(attachment.hash);
            lease.throwIfRevoked();
            if (!record || !attachmentMatchesRecord(attachment, record)) {
              throw new Error("template-attachment-missing");
            }
            if (
              !countedHashes.has(attachment.hash) &&
              countedHashes.size >= STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS
            ) {
              throw new Error("template-attachment-budget");
            }
            await admitAndCacheModel({
              record,
              document: destinationDocument,
              quality,
              cumulativeUsedBytes,
              renderer: modelRenderer,
              cache: modelRootCacheRef.current,
              pending: modelLoadPendingRef.current,
              isActive: () => isModalAssetSessionCurrent(session) && lease.isCurrent(),
              signal: lease.signal,
              onCacheEntryCreated: (storageId, cacheEntry) => {
                templateOwnedCacheEntries.set(storageId, cacheEntry);
              },
            });
            if (!bindModelAttachment({
              attachmentByStorageModelId: nextAttachmentByStorageId,
              storageModelIdByAttachmentId: nextStorageIdByAttachment,
            }, record, attachment)) {
              throw new Error("template-attachment-binding");
            }
            if (!countedHashes.has(attachment.hash)) {
              countedHashes.add(attachment.hash);
              cumulativeUsedBytes += attachment.byteSize;
            }
          }

          const hydrated = hydrateStudioBg3dDocumentToRuntime({
            document: instantiated.document,
            storageModelIdByAttachmentId: nextStorageIdByAttachment,
          });
          const expectedPrimitives = instantiated.document.nodes.filter(
            (node) => node.kind === "primitive",
          ).length;
          const expectedCustomModels = instantiated.document.nodes.length - expectedPrimitives;
          if (
            !hydrated.ok ||
            hydrated.diagnostics.length > 0 ||
            hydrated.omittedDiagnosticCount > 0 ||
            hydrated.counts.droppedPrimitives > 0 ||
            hydrated.counts.droppedCustomModels > 0 ||
            hydrated.counts.emittedPrimitives !== expectedPrimitives ||
            hydrated.counts.emittedCustomModels !== expectedCustomModels
          ) {
            throw new Error("template-hydration");
          }
          return {
            primitives: hydrated.primitives,
            customModels: hydrated.customModels,
            nextAttachmentByStorageId,
            nextStorageIdByAttachment,
            nodeLimit,
          };
        },
        (prepared) => {
          if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) {
            throw new Error("physics-transient");
          }
          const current = physicsRuntimeSourceRef.current;
          if (
            current.primitives.length + current.customModels.length +
              prepared.primitives.length + prepared.customModels.length > prepared.nodeLimit
          ) {
            throw new Error("template-node-budget");
          }
          const occupiedIds = new Set([
            ...current.primitives.map((primitive) => primitive.id),
            ...current.customModels.map((model) => model.id),
          ]);
          const insertedIds = [
            ...prepared.primitives.map((primitive) => primitive.id),
            ...prepared.customModels.map((model) => model.id),
          ];
          if (insertedIds.some((id) => occupiedIds.has(id))) {
            throw new Error("template-node-collision");
          }

          const preparedAttachments = prepared.customModels.map((model) => {
            const attachment = prepared.nextAttachmentByStorageId.get(model.modelId);
            if (!attachment) throw new Error("template-attachment-binding");
            return attachment;
          });
          assertStudioBg3dModelAttachmentAdmission({
            models: current.customModels,
            attachments: prepared.nextAttachmentByStorageId,
            candidateAttachments: preparedAttachments,
            maximumAttachments: STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
            maximumCumulativeBytes: current.document.budgets.complexity.maxModelBytes,
          });

          attachmentByStorageModelIdRef.current.clear();
          storageModelIdByAttachmentIdRef.current.clear();
          for (const [storageId, attachment] of prepared.nextAttachmentByStorageId) {
            attachmentByStorageModelIdRef.current.set(storageId, attachment);
          }
          for (const [attachmentId, storageId] of prepared.nextStorageIdByAttachment) {
            storageModelIdByAttachmentIdRef.current.set(attachmentId, storageId);
          }
          const nextPrimitives = [...current.primitives, ...prepared.primitives];
          const nextCustomModels = [...current.customModels, ...prepared.customModels];
          physicsRuntimeSourceRef.current = {
            ...current,
            primitives: nextPrimitives,
            customModels: nextCustomModels,
          };
          setPrimitives(nextPrimitives);
          setCustomModels(nextCustomModels);
          if (insertedIds.length > 0) {
            setSelectedIds(new Set([insertedIds[insertedIds.length - 1]]));
          }
          setRefTick((tick) => tick + 1);
          setError(null);
          committed = true;
        },
      );
    } catch (templateFailure) {
      if (isModalAssetSessionCurrent(session)) {
        setError(
          templateFailure instanceof StudioBg3dThreeOperationError
            ? templateFailure.message
            : "템플릿의 모든 모델 원본과 무결성을 확인하지 못해 장면을 변경하지 않았습니다.",
        );
      }
    } finally {
      if (!committed) cleanupUncommittedTemplateCache();
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setApplyingTemplateId(null);
      });
    }
  }

  const {
    handleDeleteModelFromLibrary,
    handleUploadModelFiles,
  } = createStudioBg3dModelImportActions({
    attachmentByStorageModelIdRef,
    canAdmitSceneNodes,
    cancelCustomModelPlacement,
    captureInFlightRef,
    commitSceneEntityRemoval,
    destructiveMutationGuardRef,
    deviceQuality,
    genericModelClassifications,
    invalidateModelThumbnailCaptures,
    isModalAssetSessionCurrent,
    isRestoringScene,
    modalAssetSessionRef,
    modelImportAbortRef,
    modelLoadPendingRef,
    modelRenderer,
    modelRootCacheRef,
    physicsRuntimeSourceRef,
    placementSessionRef,
    sceneBaseDocument,
    sceneRestoreAbortRef,
    setCustomModels,
    setDeletingModelId,
    setError,
    setGenericModelClassifications,
    setGenericModelSourceFormats,
    setIsUploadingModel,
    setModelImportProgress,
    setModelLibrary,
    setModelLibraryStatus,
    setRefTick,
    setSelectedIds,
    startModelThumbnailCaptureBatch,
    storageModelIdByAttachmentIdRef,
  });

  const handlePanelTabChange = (tab: BgPanelTab) => {
    if (tab === "models") setModelsPanelActivated(true);
    if (tab === "lt") setLtPresetPanelActivated(true);
    setActivePanelTab(tab);
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
  };

  function reportLtUserPresetMutationFailure(
    result: StudioBg3dLtUserPresetMutationResult
  ): result is StudioBg3dLtUserPresetMutationSuccess {
    if (result.ok) return true;
    setLtUserPresetNotice({
      tone: "error",
      message: ltUserPresetFailureMessage(result.reason),
    });
    return false;
  }

  function persistLtUserPresetMutation(
    result: StudioBg3dLtUserPresetMutationSuccess,
    successMessage: string
  ): boolean {
    const generation = ltUserPresetMutationGenerationRef.current + 1;
    ltUserPresetMutationGenerationRef.current = generation;
    setLtUserPresetPayload(result.payload);
    setLtUserPresetLibraryStatus("saving");
    setLtUserPresetNotice({ tone: "info", message: "SQLite/OPFS에 프리셋을 저장하는 중입니다." });
    void ltUserPresetRepository.save(result.payload).then((persisted) => {
      if (
        !componentActiveRef.current ||
        ltUserPresetMutationGenerationRef.current !== generation
      ) {
        return;
      }
      setLtUserPresetPayload(persisted);
      setLtUserPresetLibraryStatus("ready");
      setLtUserPresetNotice({ tone: "success", message: successMessage });
    }).catch((cause: unknown) => {
      if (
        !componentActiveRef.current ||
        ltUserPresetMutationGenerationRef.current !== generation
      ) {
        return;
      }
      setLtUserPresetLibraryStatus("memory-only");
      setLtUserPresetNotice({
        tone: "error",
        message: `SQLite/OPFS 저장에 실패해 변경을 현재 탭 메모리에만 유지합니다. 현재 탭 메모리 임시 · 새로고침 시 사라짐: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    });
    return true;
  }

  function currentLtUserPresetDraft(id: string) {
    return {
      id,
      name: ltUserPresetName,
      description: ltUserPresetDescription,
      line: sceneBaseDocument.output.line,
      tone: sceneBaseDocument.output.tone,
    };
  }

  function saveCurrentLtAsUserPreset() {
    const id = generateLtUserPresetId(ltUserPresetPayload);
    if (!id) {
      setLtUserPresetNotice({
        tone: "error",
        message: "충돌하지 않는 안전한 프리셋 ID를 만들지 못했습니다. 다시 시도해 주세요.",
      });
      return;
    }
    const result = createStudioBg3dLtUserPreset(
      ltUserPresetPayload,
      currentLtUserPresetDraft(id)
    );
    if (!reportLtUserPresetMutationFailure(result)) return;
    if (!persistLtUserPresetMutation(result, `“${result.preset?.name ?? ltUserPresetName}” 프리셋을 저장했습니다.`)) return;
    setLtManagedUserPresetId(id);
    setLtPreferredPresetId(id);
    setLtDeleteConfirmId(null);
  }

  function updateManagedLtUserPreset() {
    if (
      !ltManagedUserPresetId ||
      !ltUserPresetPayload.presets.some((preset) => preset.id === ltManagedUserPresetId)
    ) {
      setLtUserPresetNotice({ tone: "error", message: "업데이트할 사용자 프리셋을 먼저 선택해 주세요." });
      return;
    }
    const result = upsertStudioBg3dLtUserPreset(
      ltUserPresetPayload,
      currentLtUserPresetDraft(ltManagedUserPresetId)
    );
    if (!reportLtUserPresetMutationFailure(result)) return;
    if (!persistLtUserPresetMutation(result, `“${result.preset?.name ?? ltUserPresetName}”에 현재 LT 설정을 반영했습니다.`)) return;
    setLtPreferredPresetId(ltManagedUserPresetId);
    setLtDeleteConfirmId(null);
  }

  function renameManagedLtUserPreset() {
    if (!ltManagedUserPresetId) {
      setLtUserPresetNotice({ tone: "error", message: "이름을 바꿀 사용자 프리셋을 먼저 선택해 주세요." });
      return;
    }
    const result = renameStudioBg3dLtUserPreset(
      ltUserPresetPayload,
      ltManagedUserPresetId,
      ltUserPresetName
    );
    if (!reportLtUserPresetMutationFailure(result)) return;
    if (!persistLtUserPresetMutation(result, `프리셋 이름을 “${result.preset?.name ?? ltUserPresetName}”(으)로 변경했습니다.`)) return;
    setLtPreferredPresetId(ltManagedUserPresetId);
    setLtDeleteConfirmId(null);
  }

  function deleteManagedLtUserPreset() {
    if (!ltManagedUserPresetId) {
      setLtUserPresetNotice({ tone: "error", message: "삭제할 사용자 프리셋을 먼저 선택해 주세요." });
      return;
    }
    if (ltDeleteConfirmId !== ltManagedUserPresetId) {
      setLtDeleteConfirmId(ltManagedUserPresetId);
      setLtUserPresetNotice({
        tone: "info",
        message: "삭제 버튼을 한 번 더 누르면 이 프리셋이 로컬 라이브러리에서 삭제됩니다.",
      });
      return;
    }
    const deletingName = ltUserPresetPayload.presets.find(
      (preset) => preset.id === ltManagedUserPresetId
    )?.name;
    const result = deleteStudioBg3dLtUserPreset(
      ltUserPresetPayload,
      ltManagedUserPresetId
    );
    if (!reportLtUserPresetMutationFailure(result)) return;
    if (!persistLtUserPresetMutation(result, `“${deletingName ?? "사용자 프리셋"}”을 삭제했습니다.`)) return;
    setLtManagedUserPresetId(null);
    setLtPreferredPresetId(null);
    setLtDeleteConfirmId(null);
    setLtUserPresetName("");
    setLtUserPresetDescription(DEFAULT_LT_USER_PRESET_DESCRIPTION);
  }

  function applyLtPreset(presetId: string) {
    const applied = applyStudioBg3dLtPreset(
      sceneBaseDocument,
      presetId,
      ltUserPresetPayload
    );
    if (!applied) {
      setError("LT 프리셋을 장면 원본에 안전하게 적용하지 못했습니다.");
      return;
    }
    const userPreset = ltUserPresetPayload.presets.find((preset) => preset.id === presetId);
    const builtInPreset = STUDIO_BG3D_LT_BUILT_IN_PRESETS.find((preset) => preset.id === presetId);
    setSceneBaseDocument(applied);
    setLineArtPreview(applied.output.line.enabled);
    setLtPreferredPresetId(presetId);
    setLtDeleteConfirmId(null);
    if (userPreset) {
      setLtManagedUserPresetId(userPreset.id);
      setLtUserPresetName(userPreset.name);
      setLtUserPresetDescription(userPreset.description);
    } else {
      setLtManagedUserPresetId(null);
      if (builtInPreset) {
        setLtUserPresetName(`${builtInPreset.name} 사본`);
        setLtUserPresetDescription(builtInPreset.description);
      }
    }
    setError(null);
  }

  function updateLtLineSettings(patch: Partial<StudioBg3dLineOutputSettings>) {
    setSceneBaseDocument((current) => {
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        output: {
          ...current.output,
          line: { ...current.output.line, ...patch },
        },
      };
      return canonicalSceneDocument(candidate) ?? current;
    });
    setError(null);
  }

  function updateLtToneSettings(patch: Partial<StudioBg3dToneOutputSettings>) {
    setSceneBaseDocument((current) => {
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        output: {
          ...current.output,
          tone: { ...current.output.tone, ...patch },
        },
      };
      return canonicalSceneDocument(candidate) ?? current;
    });
    setError(null);
  }

  function updateLtExportHeight(exportHeight: number) {
    setSceneBaseDocument((current) => {
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        output: { ...current.output, exportHeight },
      };
      return canonicalSceneDocument(candidate) ?? current;
    });
    setError(null);
  }

  /** null이면 "자동(뷰포트 추종)"이라 문서에서 키 자체를 지운다 — 레거시 표현과 같아진다. */
  function updateLtExportAspectRatio(exportAspectRatio: number | null) {
    setSceneBaseDocument((current) => {
      const normalized = normalizeStudioBg3dCaptureAspectRatio(exportAspectRatio);
      const { exportAspectRatio: _removed, ...output } = current.output;
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        output: normalized === null ? output : { ...output, exportAspectRatio: normalized },
      };
      return canonicalSceneDocument(candidate) ?? current;
    });
    setError(null);
  }

  function updateBackgroundSettings(patch: Partial<StudioBg3dBackgroundSettings>) {
    setSceneBaseDocument((current) => {
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        background: { ...current.background, ...patch },
      };
      return canonicalSceneDocument(candidate) ?? current;
    });
    setError(null);
  }

  function updateLightingSettings(patch: Partial<StudioBg3dLightingSettings>) {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    setSceneBaseDocument((current) => {
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        lighting: {
          ...current.lighting,
          ...patch,
          ...(patch.key
            ? { key: { ...current.lighting.key, ...patch.key } }
            : {}),
          ...(patch.fill
            ? { fill: { ...current.lighting.fill, ...patch.fill } }
            : {}),
        },
      };
      return canonicalSceneDocument(candidate) ?? current;
    });
    setError(null);
  }

  function updateRenderExposure(exposure: number) {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    setSceneBaseDocument((current) => {
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        render: { ...current.render, exposure },
      };
      return canonicalSceneDocument(candidate) ?? current;
    });
    setError(null);
  }

  function applyMoodRig(rigId: string) {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    const applied = applyStudioBg3dMoodRig(sceneBaseDocument, rigId);
    if (!applied) {
      setError("시간대·무드 리그를 장면 원본에 안전하게 적용하지 못했습니다.");
      return;
    }
    commitImmediateHistoryTransition(primitives, customModels, applied);
    setSceneBaseDocument(applied);
    setError(null);
  }

  // 태양·시간대 릭 — 슬라이더 연속 조작이라 즉시 히스토리 대신 디바운스 스냅샷(안개 슬라이더와
  // 동일 계약)에 맡긴다. 함수형 업데이트로 연속 이벤트 간 문서 클로버를 방지한다.
  function applySunRigConfig(patch: Partial<StudioBg3dSunRigConfig>) {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    const nextConfig: StudioBg3dSunRigConfig = { ...sunRigConfig, ...patch };
    setSunRigConfig(nextConfig);
    setSceneBaseDocument((currentDocument) =>
      applyStudioBg3dSunRig(currentDocument, nextConfig) ?? currentDocument);
    setError(null);
  }

  /** Camera-lens edits patch the live view; projection remounts reuse deferred history apply. */
  function cameraLensInteractionLocked(): boolean {
    return (
      captureInFlightRef.current ||
      isCapturing ||
      isBatchRenderingShots ||
      isRestoringScene ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    );
  }

  function commitCameraLensView(
    beforeView: StudioBg3dCameraSettings,
    nextDocument: StudioBg3dSceneDocument,
  ): boolean {
    const beforeDocument = canonicalSceneDocument({
      ...nextDocument,
      camera: beforeView,
    });
    if (!beforeDocument) {
      viewportApiRef.current?.applyView(beforeView);
      setError("카메라 렌즈 설정을 장면 원본에 안전하게 적용하지 못했습니다.");
      return false;
    }
    if (JSON.stringify(beforeDocument.camera) !== JSON.stringify(nextDocument.camera)) {
      commitImmediateHistoryTransition(
        primitives,
        customModels,
        nextDocument,
        createStudioBg3dHistorySnapshot({
          primitives,
          customModels,
          document: beforeDocument,
        }),
        { preserveBeforeCamera: true },
      );
    }
    setSceneBaseDocument(nextDocument);
    applyOrDeferStudioBg3dHistoryCamera(
      viewportApiRef.current,
      pendingInitialCameraRef,
      nextDocument.camera,
    );
    setError(null);
    return true;
  }

  function finishCameraLensGesture(): void {
    const beforeView = cameraLensGestureBeforeViewRef.current;
    const latestView = cameraLensGestureLatestViewRef.current;
    if (cameraLensGestureTimerRef.current !== null) {
      clearTimeout(cameraLensGestureTimerRef.current);
      cameraLensGestureTimerRef.current = null;
    }
    cameraLensGestureBeforeViewRef.current = null;
    cameraLensGestureLatestViewRef.current = null;
    if (!beforeView) return;
    // The controlled slider has already produced a canonical view. Prefer that exact intent over a
    // renderer readback that can still be one React/R3F commit behind on pointerup or keyup.
    const liveView = resolveStudioBg3dCameraGestureCommitView(
      latestView,
      viewportApiRef.current,
      sceneBaseDocument.camera,
    );
    const nextDocument = canonicalSceneDocument({
      ...sceneBaseDocument,
      camera: liveView,
    });
    if (!nextDocument) {
      viewportApiRef.current?.applyView(beforeView);
      setError("카메라 제스처를 안전한 장면 상태로 확정하지 못해 이전 구도로 되돌렸습니다.");
      return;
    }
    commitCameraLensView(beforeView, nextDocument);
  }

  function previewCameraLens(
    patch: (view: StudioBg3dCameraSettings) => Partial<StudioBg3dCameraSettings>,
  ): void {
    if (cameraLensInteractionLocked()) return;
    const liveView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    cameraLensGestureBeforeViewRef.current ??= liveView;
    const nextDocument = canonicalSceneDocument({
      ...sceneBaseDocument,
      camera: { ...liveView, ...patch(liveView) },
    });
    if (!nextDocument) {
      setError("카메라 렌즈 미리보기를 안전하게 적용하지 못했습니다.");
      return;
    }
    cameraLensGestureLatestViewRef.current = nextDocument.camera;
    setSceneBaseDocument(nextDocument);
    applyOrDeferStudioBg3dHistoryCamera(
      viewportApiRef.current,
      pendingInitialCameraRef,
      nextDocument.camera,
    );
    if (cameraLensGestureTimerRef.current !== null) {
      clearTimeout(cameraLensGestureTimerRef.current);
    }
    // Pointer cancellation or a lost blur must not leave a preview outside history forever.
    cameraLensGestureTimerRef.current = setTimeout(finishCameraLensGesture, 800);
    setError(null);
  }

  function updateCameraLens(
    patch: (view: StudioBg3dCameraSettings) => Partial<StudioBg3dCameraSettings>,
  ): void {
    if (cameraLensInteractionLocked()) return;
    finishCameraLensGesture();
    const liveView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const nextDocument = canonicalSceneDocument({
      ...sceneBaseDocument,
      camera: { ...liveView, ...patch(liveView) },
    });
    if (!nextDocument) {
      setError("카메라 렌즈 설정을 장면 원본에 안전하게 적용하지 못했습니다.");
      return;
    }
    commitCameraLensView(liveView, nextDocument);
  }

  function applyTwoPointPerspective() {
    const liveView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const corrected = computeStudioBg3dTwoPointPerspective(liveView);
    if (!corrected) {
      setError("정수직 시점에서는 2점 투시 보정을 정의할 수 없습니다. 카메라를 조금 기울여 주세요.");
      return;
    }
    const up = createStudioBg3dCameraUpForDutchRoll({
      position: liveView.position,
      target: corrected.target,
    }, 0);
    if (!up) {
      setError("2점 투시의 수평 기준을 안전하게 계산하지 못했습니다.");
      return;
    }
    updateCameraLens((view) => ({
      target: corrected.target,
      lensShift: [view.lensShift?.[0] ?? 0, corrected.lensShiftY],
      up,
    }));
  }

  function resetTwoPointPerspective() {
    updateCameraLens((view) => ({ lensShift: [view.lensShift?.[0] ?? 0, 0] }));
  }

  function readCurrentCanonicalSceneForShot(): StudioBg3dSceneDocument | null {
    if (
      captureInFlightRef.current ||
      isCapturing ||
      isRestoringScene ||
      isBatchRenderingShots ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) {
      return null;
    }
    const currentView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const adaptation = tryAdaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: { ...sceneBaseDocument, camera: currentView },
    });
    if (!adaptation.ok) {
      setError("현재 장면이 안전 예산을 초과해 컷 기록을 시작하지 않았습니다. 장면을 나누거나 일부 오브젝트를 정리해 주세요.");
      return null;
    }
    const adapted = adaptation.value;
    if (
      adapted.diagnostics.length > 0 ||
      adapted.omittedDiagnosticCount > 0 ||
      adapted.counts.droppedPrimitives > 0 ||
      adapted.counts.droppedCustomModels > 0 ||
      adapted.counts.emittedPrimitives !== primitives.length ||
      adapted.counts.emittedCustomModels !== customModels.length
    ) {
      setError("컷에 현재 장면을 손실 없이 기록할 수 없습니다. 문제가 있는 도형이나 모델을 확인해 주세요.");
      return null;
    }
    return adapted.document;
  }

  function commitAppliedShot(
    beforeDocument: StudioBg3dSceneDocument,
    appliedDocument: StudioBg3dSceneDocument,
  ): boolean {
    const projected = projectStudioBg3dShotVisibilityToRuntime(
      primitives,
      customModels,
      appliedDocument,
    );
    if (!projected) {
      setError("컷의 오브젝트 표시 상태를 현재 장면에 안전하게 적용하지 못했습니다.");
      return false;
    }
    commitImmediateHistoryTransition(
      projected.primitives,
      projected.customModels,
      appliedDocument,
      createStudioBg3dHistorySnapshot({
        primitives,
        customModels,
        document: beforeDocument,
      }),
    );
    setPrimitives(projected.primitives);
    setCustomModels(projected.customModels);
    setSceneBaseDocument(appliedDocument);
    if (viewportApiRef.current?.applyView(appliedDocument.camera) !== true) {
      // Projection changes replace the default R3F camera. The replacement controller consumes this
      // only after its own target-reset effect has completed.
      pendingInitialCameraRef.current = appliedDocument.camera;
    }
    setLineArtPreview(appliedDocument.output.line.enabled);
    setViewportHinted(true);
    const visibleIds = collectStudioBg3dEffectivelyVisibleEntityIds(appliedDocument.nodes);
    setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
    setError(null);
    return true;
  }

  function captureCurrentShot() {
    const currentDocument = readCurrentCanonicalSceneForShot();
    if (!currentDocument) return;
    const shotCount = currentDocument.shots?.length ?? 0;
    if (shotCount >= STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS) {
      setError(`컷은 장면당 최대 ${STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS}개까지 저장할 수 있습니다.`);
      return;
    }
    const name = shotNameDraft.trim() || `컷 ${shotCount + 1}`;
    const captured = captureStudioBg3dShot(currentDocument, {
      id: createStudioBg3dShotId(currentDocument.shots),
      name,
    });
    if (!captured) {
      setError("컷 이름 또는 장면 데이터가 저장 한도를 벗어나 현재 구도를 기록하지 못했습니다.");
      return;
    }
    commitImmediateHistoryTransition(
      primitives,
      customModels,
      captured,
      createStudioBg3dHistorySnapshot({
        primitives,
        customModels,
        document: currentDocument,
      }),
    );
    setSceneBaseDocument(captured);
    setShotNameDraft("");
    setViewportHinted(true);
    setError(null);
  }

  function applySavedShot(shotId: string) {
    const currentDocument = readCurrentCanonicalSceneForShot();
    if (!currentDocument) return;
    const applied = applyStudioBg3dShot(currentDocument, shotId);
    if (!applied) {
      setError("선택한 컷을 현재 장면에 안전하게 적용하지 못했습니다.");
      return;
    }
    commitAppliedShot(currentDocument, applied);
  }

  function duplicateActiveShot() {
    const currentDocument = readCurrentCanonicalSceneForShot();
    if (!currentDocument) return;
    const source = currentDocument.shots?.find(
      (shot) => shot.id === currentDocument.activeShotId,
    );
    if (!source) {
      setError("복제할 컷을 먼저 선택해 주세요.");
      return;
    }
    const duplicateId = createStudioBg3dShotId(currentDocument.shots);
    const duplicated = duplicateStudioBg3dShot(currentDocument, source.id, {
      id: duplicateId,
      name: `${source.name} 사본`.slice(0, 80).trim(),
    });
    const applied = duplicated ? applyStudioBg3dShot(duplicated, duplicateId) : null;
    if (!applied) {
      setError("컷 개수 또는 문서 저장 한도를 벗어나 복제하지 못했습니다.");
      return;
    }
    commitAppliedShot(currentDocument, applied);
  }

  function moveSavedShot(shotId: string, targetIndex: number) {
    const currentDocument = readCurrentCanonicalSceneForShot();
    if (!currentDocument) return;
    const moved = moveStudioBg3dShot(currentDocument, shotId, targetIndex);
    if (!moved) {
      setError("컷 순서를 안전하게 변경하지 못했습니다.");
      return;
    }
    commitImmediateHistoryTransition(
      primitives,
      customModels,
      moved,
      createStudioBg3dHistorySnapshot({
        primitives,
        customModels,
        document: currentDocument,
      }),
    );
    setSceneBaseDocument(moved);
    setError(null);
  }

  function removeSavedShot(shotId: string) {
    const currentDocument = readCurrentCanonicalSceneForShot();
    if (!currentDocument) return;
    const removed = removeStudioBg3dShot(currentDocument, shotId);
    if (!removed) {
      setError("선택한 컷을 안전하게 삭제하지 못했습니다.");
      return;
    }
    commitImmediateHistoryTransition(
      primitives,
      customModels,
      removed,
      createStudioBg3dHistorySnapshot({
        primitives,
        customModels,
        document: currentDocument,
      }),
    );
    setSceneBaseDocument(removed);
    setError(null);
  }

  const exportSavedShotsAsZip = createStudioBg3dShotBatchExportRunner({
    acquireSharedCharacterCaptureAuthority,
    captureInFlightRef,
    captureRef,
    componentActiveRef,
    customModels,
    deviceSignals,
    lineArtPreview,
    pendingInitialCameraRef,
    primitives,
    readCurrentCanonicalSceneForShot,
    recoveryScope,
    sceneBaseDocument,
    selectedShotBatchPasses,
    setCaptureBackgroundSnapshot,
    setCustomModels,
    setError,
    setIsCapturing,
    setLineArtPreview,
    setPrimitives,
    setSceneBaseDocument,
    setShotBatchProgress,
    setShotBatchRecoverySummary,
    shotBatchAbortRef,
    shotBatchAuthorizationEpochRef,
    shotBatchBlockedReason,
    shotBatchExportHeight,
    shotBatchIncludeContactSheet,
    shotBatchIncludeLayeredPsd,
    shotBatchRecoveryRef,
    shotBatchRecoveryScopeRef,
    shotBatchRecoveryStoreRef,
    shotBatchSelectedIds,
    validateRecoveryAccess,
    verifySharedCharacterCaptureAuthority,
    viewportApiRef,
  });

  function updateBackgroundTransparency(transparent: boolean) {
    const modeResult = resolveStudioBg3dInsertBackgroundMode({ transparent });
    if (!modeResult.ok) {
      setError(modeResult.reason);
      return;
    }
    setSceneBaseDocument((current) => {
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        background: {
          ...current.background,
          mode: modeResult.plan.documentBackgroundMode,
        },
        output: {
          ...current.output,
          transparentBackground: modeResult.plan.transparent,
        },
      };
      return canonicalSceneDocument(candidate) ?? current;
    });
    setError(null);
  }

  // 키보드 핸들러가 항상 최신 콜백을 참조하도록 ref로 동기화(렌더 후 매번 갱신).
  const selectedIdsRef = useRef(selectedIds);
  const undoRef = useRef(doUndo);
  const redoRef = useRef(doRedo);
  const deleteSelectedRef = useRef(deleteSelectedEntity);
  useLayoutEffect(() => {
    selectedIdsRef.current = selectedIds;
    undoRef.current = doUndo;
    redoRef.current = doRedo;
    deleteSelectedRef.current = deleteSelectedEntity;
  });

  // 키보드 단축키: skip text editing; the modal hook owns Escape and Tab focus behavior.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (captureInFlightRef.current) return;
      if (
        webXrSessionStateRef.current.status !== "idle" &&
        webXrSessionStateRef.current.status !== "error"
      ) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          !isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current) &&
          selectedIdsRef.current.size > 0
        ) {
          e.preventDefault();
          deleteSelectedRef.current();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) redoRef.current();
          else undoRef.current();
        } else if (key === "y") {
          e.preventDefault();
          redoRef.current();
        }
        return;
      }
      const lower = e.key.toLowerCase();
      if (lower === "t" || lower === "r" || lower === "s") {
        if (measurementActiveRef.current) {
          cancelMeasurement("변형 도구로 전환해 줄자 측정을 취소했습니다.");
        }
        if (lower === "t") setTransformMode("translate");
        else if (lower === "r") setTransformMode("rotate");
        else setTransformMode("scale");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 세이프 프레임은 캡처와 같은 좌표계에서 계산돼야 하므로, 뷰포트 CSS 박스를 직접 관찰한다.
  useEffect(() => {
    const host = viewportHostRef.current;
    if (!open || !host || typeof ResizeObserver === "undefined") {
      setViewportBoxSize(null);
      return;
    }
    const sync = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setViewportBoxSize((previous) => (
        previous &&
          Math.abs(previous.width - rect.width) < 0.5 &&
          Math.abs(previous.height - rect.height) < 0.5
          ? previous
          : { width: rect.width, height: rect.height }
      ));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    return () => observer.disconnect();
  }, [open]);

  const onCaptureUpdate = (
    state: CaptureState,
    cleanupAdapter?: StudioBg3dCaptureAdapter | null
  ) => {
    if (cleanupAdapter) {
      if (captureRef.current.adapter === cleanupAdapter) {
        captureRef.current = { adapter: null, camera: null };
      }
    } else {
      captureRef.current = state;
    }
  };

  function requestModalDismiss() {
    if (measurementActiveRef.current) {
      cancelMeasurement("줄자 측정을 취소했습니다.");
      return;
    }
    if (surfaceSnapArmedRef.current) {
      cancelSurfaceSnap("표면 붙이기를 취소했습니다.");
      return;
    }
    requestUserClose();
  }

  function requestUserClose() {
    // The synchronous guard covers header clicks that precede capture/delete state commits.
    const thumbnailLease = modelThumbnailGpuLeaseRef.current;
    if (thumbnailLease) {
      const session = modalAssetSessionRef.current;
      invalidateModelThumbnailCaptures();
      void thumbnailLease.released.then(() => {
        if (session && isModalAssetSessionCurrent(session)) requestUserClose();
      });
      return;
    }
    if (captureInFlightRef.current) return;
    if (destructiveMutationGuardRef.current.blocksClose) return;
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) {
      resetPhysicsPreview();
    }
    if (measurementActiveRef.current) cancelMeasurement();
    cancelSurfaceSnap();
    webXrCloseRequestedRef.current = true;
    disposeCurrentWebXrControllerGeneration();
    invalidateModalAssetSession();
    onClose();
  }

  async function handleSaveToLibrary() {
    if (
      captureInFlightRef.current || isCapturing ||
      destructiveMutationGuardRef.current.blocksClose || insertBlocked ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
    if (!insertBackgroundIntent.ok) {
      setError(insertBackgroundIntent.reason);
      return;
    }
    const currentCapture = captureRef.current;
    if (!currentCapture.adapter) {
      setError("캡처할 3D 장면이 아직 준비되지 않았습니다.");
      return;
    }
    const backgroundSnapshot = createStudioBg3dCaptureBackgroundSnapshot({
      background: sceneBaseDocument.background,
      transparent: transparentInsert,
    });
    const currentView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const currentBaseDocument: StudioBg3dSceneDocument = {
      ...sceneBaseDocument,
      camera: currentView,
      background: backgroundSnapshot.background,
      output: {
        ...sceneBaseDocument.output,
        transparentBackground: backgroundSnapshot.transparent,
      },
    };
    const adaptation = tryAdaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: currentBaseDocument,
    });
    if (!adaptation.ok) {
      setError("현재 장면이 안전 예산을 초과해 소재 저장을 시작하지 않았습니다. 장면을 나누거나 일부 오브젝트를 정리해 주세요.");
      return;
    }
    const adapted = adaptation.value;
    if (
      adapted.diagnostics.length > 0 ||
      adapted.omittedDiagnosticCount > 0 ||
      adapted.counts.droppedPrimitives > 0 ||
      adapted.counts.droppedCustomModels > 0 ||
      adapted.counts.emittedPrimitives !== primitives.length ||
      adapted.counts.emittedCustomModels !== customModels.length
    ) {
      setError("장면 원본을 손실 없이 저장할 수 없어 소재 저장을 중단했습니다. 문제가 있는 도형이나 모델을 확인해 주세요.");
      return;
    }
    const sharedCharacterAuthorityResult = acquireSharedCharacterCaptureAuthority();
    if (!sharedCharacterAuthorityResult?.ok) {
      setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
      return;
    }
    const sharedCharacterAuthorityLease = sharedCharacterAuthorityResult.lease;

    const previousLineArtPreview = lineArtPreview;
    captureInFlightRef.current = true;
    setCaptureBackgroundSnapshot(backgroundSnapshot);
    setLineArtPreview(false);
    setIsCapturing(true);
    try {
      // Load the asset writer only on explicit save while the capture guard excludes re-entry.
      const { saveAsset } = await import("../studio-asset-library");
      const captureAdapter = await acquireStudioBg3dCaptureAdapterAfterViewTransition({
        isActive: () => componentActiveRef.current,
        readAdapter: () => captureRef.current.adapter,
        waitForPaintFrame: waitForStudioBg3dPaintFrame,
      });
      if (!captureAdapter) {
        if (componentActiveRef.current) {
          setError("캡처할 단일 3D 시점을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }
      const rasterAuthority = verifySharedCharacterCaptureAuthority(
        sharedCharacterAuthorityLease,
        "raster",
      );
      if (!rasterAuthority?.ok) {
        setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
        return;
      }

      const captured = await captureStudioBg3dRaster(captureAdapter, {
        width: 320,
        height: 320,
        background: studioBg3dCaptureBackgroundRequestFromSnapshot(backgroundSnapshot),
        includeDepth: false,
      });
      if (!componentActiveRef.current || captureRef.current.adapter !== captureAdapter) return;

      const canvas = document.createElement("canvas");
      canvas.width = captured.width;
      canvas.height = captured.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D context");
      const idata = new ImageData(new Uint8ClampedArray(captured.rgba), captured.width, captured.height);
      ctx.putImageData(idata, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      const hashUrl = `${dataUrl}#${encodeURIComponent(adapted.serialized)}`;
      const receiptAuthority = verifySharedCharacterCaptureAuthority(
        sharedCharacterAuthorityLease,
        "receipt",
      );
      if (!receiptAuthority?.ok) {
        setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
        return;
      }

      await saveAsset({
        name: "내 3D 장면",
        dataUrl: hashUrl,
        width: captured.width,
        height: captured.height,
        kind: "bg3d",
      });
      window.alert("현재 장면을 내 소재 라이브러리에 저장했습니다.\\n화면 좌측 상단의 '소재' 패널에서 언제든 꺼내 쓸 수 있습니다.");
    } catch (_e) {
      setError("소재 라이브러리 저장 중 오류가 발생했습니다.");
    } finally {
      captureInFlightRef.current = false;
      if (componentActiveRef.current) {
        setCaptureBackgroundSnapshot(null);
        setIsCapturing(false);
        setLineArtPreview(previousLineArtPreview);
      }
    }
  }

  async function handleUseAsAiMethodReference() {
    if (
      !onUseAsAiMethodReference ||
      captureInFlightRef.current ||
      isCapturing ||
      destructiveMutationGuardRef.current.blocksClose ||
      insertBlocked
    ) return;
    if (!insertBackgroundIntent.ok) {
      setError(insertBackgroundIntent.reason);
      return;
    }
    const currentCapture = captureRef.current;
    if (!currentCapture.adapter) {
      setError("AI 구도 참조로 캡처할 3D 장면이 아직 준비되지 않았습니다.");
      return;
    }
    const session = modalAssetSessionRef.current;
    if (!session || !isModalAssetSessionCurrent(session)) return;

    const backgroundSnapshot = createStudioBg3dCaptureBackgroundSnapshot({
      background: sceneBaseDocument.background,
      transparent: transparentInsert,
    });
    const currentView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const currentBaseDocument: StudioBg3dSceneDocument = {
      ...sceneBaseDocument,
      camera: currentView,
      background: backgroundSnapshot.background,
      output: {
        ...sceneBaseDocument.output,
        transparentBackground: backgroundSnapshot.transparent,
      },
    };
    const adaptation = tryAdaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: currentBaseDocument,
    });
    if (!adaptation.ok) {
      setError("현재 장면이 안전 예산을 초과해 AI 구도 참조 캡처를 시작하지 않았습니다. 장면을 나누거나 일부 오브젝트를 정리해 주세요.");
      return;
    }
    const adapted = adaptation.value;
    if (
      adapted.diagnostics.length > 0 ||
      adapted.omittedDiagnosticCount > 0 ||
      adapted.counts.droppedPrimitives > 0 ||
      adapted.counts.droppedCustomModels > 0 ||
      adapted.counts.emittedPrimitives !== primitives.length ||
      adapted.counts.emittedCustomModels !== customModels.length
    ) {
      setError(
        "현재 3D 샷을 손실 없이 고정할 수 없어 AI 구도 참조 캡처를 중단했습니다. 문제가 있는 모델을 확인해 주세요.",
      );
      return;
    }
    const sharedCharacterAuthorityResult = acquireSharedCharacterCaptureAuthority();
    if (!sharedCharacterAuthorityResult?.ok) {
      setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
      return;
    }
    const sharedCharacterAuthorityLease = sharedCharacterAuthorityResult.lease;

    aiMethodReferenceAbortRef.current?.abort();
    const controller = new AbortController();
    aiMethodReferenceAbortRef.current = controller;
    const isCaptureCurrent = () => (
      !controller.signal.aborted &&
      aiMethodReferenceAbortRef.current === controller &&
      isModalAssetSessionCurrent(session)
    );
    const previousLineArtPreview = lineArtPreview;
    captureInFlightRef.current = true;
    setError(null);
    setCaptureBackgroundSnapshot(backgroundSnapshot);
    setLineArtPreview(false);
    setIsCapturing(true);

    try {
      const captureAdapter = await acquireStudioBg3dCaptureAdapterAfterViewTransition({
        isActive: isCaptureCurrent,
        readAdapter: () => captureRef.current.adapter,
        waitForPaintFrame: waitForStudioBg3dPaintFrame,
        signal: controller.signal,
        timeoutMs: 15_000,
      });
      if (!captureAdapter) {
        if (isCaptureCurrent()) {
          setError("AI 구도 참조용 3D 시점을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }

      const sourceSize = await getStudioBg3dCaptureSourceSize(captureAdapter);
      const captureFrame = resolveStudioBg3dCaptureFrame({
        viewportWidth: sourceSize.width,
        viewportHeight: sourceSize.height,
        aspectRatio: adapted.document.output.exportAspectRatio ?? null,
      });
      if (!captureFrame) throw new Error("AI reference capture frame admission failed.");

      const captureDensity = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
      const captureSize = resolveStudioBg3dLtCaptureSize({
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        aspectRatio: captureFrame.aspectRatio,
        requestedHeight: Math.min(
          2_048,
          Math.max(640, Math.round(adapted.document.output.exportHeight * captureDensity)),
        ),
        // A provider reference is not a final print render. Keep its worst-case RGBA footprint
        // below the existing 12 MiB single-reference admission before PNG encoding.
        maxPixels: Math.min(deviceQuality.maxRenderPixels, 2_000_000),
      });
      if (!captureSize) throw new Error("AI reference capture size admission failed.");
      const rasterAuthority = verifySharedCharacterCaptureAuthority(
        sharedCharacterAuthorityLease,
        "raster",
      );
      if (!rasterAuthority?.ok) {
        setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
        return;
      }

      const releaseCaptureFrameViewOffset = applyStudioBg3dCaptureFrameViewOffset(
        captureRef.current.adapter === captureAdapter ? captureRef.current.camera : null,
        captureFrame,
        sourceSize,
      );
      if (!releaseCaptureFrameViewOffset) {
        throw new Error("AI reference capture frame could not be applied.");
      }
      const captured = await captureStudioBg3dRaster(captureAdapter, {
        width: captureSize.width,
        height: captureSize.height,
        background: studioBg3dCaptureBackgroundRequestFromSnapshot(backgroundSnapshot),
        includeDepth: false,
      }, {
        signal: controller.signal,
        timeoutMs: 30_000,
      }).finally(releaseCaptureFrameViewOffset);
      if (
        !isCaptureCurrent() ||
        captureRef.current.adapter !== captureAdapter
      ) return;

      const canvas = document.createElement("canvas");
      canvas.width = captured.width;
      canvas.height = captured.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("AI reference PNG context unavailable.");
      const imageData = context.createImageData(captured.width, captured.height);
      imageData.data.set(captured.rgba);
      context.putImageData(imageData, 0, 0);
      const receiptAuthority = verifySharedCharacterCaptureAuthority(
        sharedCharacterAuthorityLease,
        "receipt",
      );
      if (!receiptAuthority?.ok) {
        setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
        return;
      }

      const handoff = createStudioBg3dAiMethodReferenceCapture({
        dataUrl: canvas.toDataURL("image/png").split("#", 1)[0],
        width: captured.width,
        height: captured.height,
        ...(adapted.document.activeShotId
          ? { shotId: adapted.document.activeShotId }
          : {}),
        captureIdentity: {
          backend: captureAdapter.backend,
          engineId: captureAdapter.engineId,
          engineVersion: captureAdapter.engineVersion,
          implementationRevision: captureAdapter.implementationRevision,
          graphicsApi: captureAdapter.graphicsApi,
          profileId: captureAdapter.profileId,
        },
      });
      const accepted = await onUseAsAiMethodReference(handoff);
      if (accepted === false && isCaptureCurrent()) {
        setError("현재 3D 샷을 AI 참조 팩에 추가하지 못했습니다. 편집 잠금과 저장소 상태를 확인해 주세요.");
      }
    } catch (cause) {
      if (!controller.signal.aborted && isCaptureCurrent()) {
        setError(
          cause instanceof Error && cause.message.includes("크기")
            ? cause.message
            : "현재 3D 샷을 AI 구도 참조로 준비하지 못했습니다. 장면을 확인한 뒤 다시 시도해 주세요.",
        );
      }
    } finally {
      const ownsCapture = aiMethodReferenceAbortRef.current === controller;
      if (ownsCapture) {
        aiMethodReferenceAbortRef.current = null;
        captureInFlightRef.current = false;
      }
      if (ownsCapture && componentActiveRef.current) {
        setCaptureBackgroundSnapshot(null);
        setLineArtPreview(previousLineArtPreview);
        setIsCapturing(false);
      }
    }
  }

  async function handleInsert() {
    if (
      captureInFlightRef.current || isCapturing ||
      destructiveMutationGuardRef.current.blocksClose
    ) return;
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) {
      setError("물리 미리보기를 초기화하거나 현재 자세를 적용한 뒤 3D 배경을 추가하세요.");
      return;
    }
    if (sharedStageUpdateBlockedReason) {
      setError(sharedStageUpdateBlockedReason);
      return;
    }
    if (insertBlocked) {
      setError(
        hasUnavailableSharedCharacter
          ? "연결된 3D 캐릭터 중 불러오지 못한 모델이 있어 합성을 중단했어요. 캐릭터 레이어의 모델 파일을 확인해 주세요."
          : hasPendingSharedCharacter
            ? "연결된 3D 캐릭터를 모두 불러온 뒤 합성할 수 있어요."
            : "3D 장면 복원과 모델 렌더 준비를 모두 마친 뒤 추가할 수 있습니다.",
      );
      return;
    }
    if (!insertBackgroundIntent.ok) {
      setError(insertBackgroundIntent.reason);
      return;
    }
    const currentCapture = captureRef.current;
    if (!currentCapture.adapter) {
      setError("캡처할 3D 장면이 아직 준비되지 않았습니다.");
      return;
    }
    const session = modalAssetSessionRef.current;
    if (!session || !isModalAssetSessionCurrent(session)) return;
    const backgroundSnapshot = createStudioBg3dCaptureBackgroundSnapshot({
      background: sceneBaseDocument.background,
      transparent: transparentInsert,
    });
    const currentView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const currentBaseDocument: StudioBg3dSceneDocument = {
      ...sceneBaseDocument,
      camera: currentView,
      background: backgroundSnapshot.background,
      output: {
        ...sceneBaseDocument.output,
        transparentBackground: backgroundSnapshot.transparent,
      },
    };
    const adaptation = tryAdaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: currentBaseDocument,
    });
    if (!adaptation.ok) {
      setError("현재 장면이 안전 예산을 초과해 추가를 시작하지 않았습니다. 장면을 나누거나 일부 오브젝트를 정리해 주세요.");
      return;
    }
    const adapted = adaptation.value;
    if (
      adapted.diagnostics.length > 0 ||
      adapted.omittedDiagnosticCount > 0 ||
      adapted.counts.droppedPrimitives > 0 ||
      adapted.counts.droppedCustomModels > 0 ||
      adapted.counts.emittedPrimitives !== primitives.length ||
      adapted.counts.emittedCustomModels !== customModels.length
    ) {
      setError("장면 원본을 손실 없이 저장할 수 없어 추가를 중단했습니다. 문제가 있는 도형이나 모델을 확인해 주세요.");
      return;
    }
    const sharedCharacterAuthorityResult = acquireSharedCharacterCaptureAuthority();
    if (!sharedCharacterAuthorityResult?.ok) {
      setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
      return;
    }
    const sharedCharacterAuthorityLease = sharedCharacterAuthorityResult.lease;

    let magicSelectionSnapshot: StudioBg3dMagicSelectionSnapshot | null = null;
    if (magicLayerEnabled) {
      const compatibilityMessage =
        studioBg3dMagicCaptureCompatibilityMessage(adapted.document);
      if (compatibilityMessage) {
        setError(compatibilityMessage);
        return;
      }
      const magicSelection = resolveStudioBg3dMagicSelection({
        operation,
        document: adapted.document,
        selectedIds: Object.freeze([...selectedIds]),
      });
      if (!magicSelection.ok) {
        setError(magicSelection.message);
        return;
      }
      magicSelectionSnapshot = magicSelection.snapshot;
    }

    const ltSettingsSnapshot: StudioBg3dLtRenderSettings = Object.freeze({
      line: Object.freeze({ ...adapted.document.output.line }),
      tone: Object.freeze({ ...adapted.document.output.tone }),
    });
    ltInsertAbortRef.current?.abort();
    const insertController = new AbortController();
    ltInsertAbortRef.current = insertController;
    const insertSceneEpoch = ltInsertSceneEpochRef.current;
    const magicSelectionEpoch = ltMagicSelectionEpochRef.current;
    const isInsertCurrent = () => (
      !insertController.signal.aborted &&
      ltInsertAbortRef.current === insertController &&
      ltInsertSceneEpochRef.current === insertSceneEpoch &&
      (
        magicSelectionSnapshot === null ||
        (
          ltMagicSelectionEpochRef.current === magicSelectionEpoch &&
          selectedIdsRef.current.size === 1 &&
          selectedIdsRef.current.has(magicSelectionSnapshot.selectedId)
        )
      ) &&
      isModalAssetSessionCurrent(session)
    );

    // LT 검출은 깨끗한 셰이딩 캡처를 입력으로 삼는다. 캡처 중에는 그리드·변환 핸들·프리미티브의
    // 뷰포트용 edge overlay를 숨기고, 순수 래스터 단계가 주선·재질선·톤을 독립적으로 계산한다.
    const previousLineArtPreview = lineArtPreview;
    ltInsertRestoreLineArtPreviewRef.current = previousLineArtPreview;
    captureInFlightRef.current = true;
    setCaptureBackgroundSnapshot(backgroundSnapshot);
    setLineArtPreview(false);
    setIsCapturing(true);
    let insertPhase:
      | "lt"
      | "magic-object-id"
      | "magic-png"
      | "lt-encode"
      | "commit" = "lt";
    try {
      // React/R3F가 캡처 전용 visibility와 셰이딩 상태를 반영할 시간을 보장한다.
      const captureAdapter = await acquireStudioBg3dCaptureAdapterAfterViewTransition({
        isActive: isInsertCurrent,
        readAdapter: () => captureRef.current.adapter,
        waitForPaintFrame: waitForStudioBg3dPaintFrame,
        signal: insertController.signal,
        timeoutMs: 15_000,
      });
      if (!captureAdapter) {
        if (isInsertCurrent()) {
          setError("캡처할 단일 3D 시점을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
        return;
      }
      const captureAdapterIsStale = () => captureRef.current.adapter !== captureAdapter;

      const sourceSize = await getStudioBg3dCaptureSourceSize(captureAdapter);
      if (!isInsertCurrent() || captureAdapterIsStale()) return;
      // The document owns capture aspect; legacy documents retain the full viewport ratio.
      const captureFrame = resolveStudioBg3dCaptureFrame({
        viewportWidth: sourceSize.width,
        viewportHeight: sourceSize.height,
        aspectRatio: adapted.document.output.exportAspectRatio ?? null,
      });
      if (!captureFrame) {
        throw new Error("LT capture frame admission failed.");
      }
      // Clamp DPR to 1..3; the size resolver enforces pixel and 4096-edge budgets.
      const captureDensity = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
      const captureSize = resolveStudioBg3dLtCaptureSize({
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        aspectRatio: captureFrame.aspectRatio,
        requestedHeight: Math.min(
          4096,
          Math.round(adapted.document.output.exportHeight * captureDensity)
        ),
        maxPixels: Math.min(deviceQuality.maxRenderPixels, STUDIO_BG3D_LT_RENDER_MAX_PIXELS),
      });
      if (!captureSize) {
        throw new Error("LT capture size admission failed.");
      }
      const rasterAuthority = verifySharedCharacterCaptureAuthority(
        sharedCharacterAuthorityLease,
        "raster",
      );
      if (!rasterAuthority?.ok) {
        setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
        return;
      }
      const captureFrameCameraSettings =
        resolveStudioBg3dCaptureFrameCameraSettings(
          adapted.document.camera,
          captureFrame,
        );
      // Apply a camera view offset only for crop frames and fail closed if it cannot be acquired.
      const releaseCaptureFrameViewOffset = applyStudioBg3dCaptureFrameViewOffset(
        captureRef.current.adapter === captureAdapter ? captureRef.current.camera : null,
        captureFrame,
        sourceSize,
      );
      if (!releaseCaptureFrameViewOffset) {
        throw new Error("LT capture frame could not be applied to the live camera.");
      }
      const captured = await captureStudioBg3dRaster(captureAdapter, {
        width: captureSize.width,
        height: captureSize.height,
        background: studioBg3dCaptureBackgroundRequestFromSnapshot(backgroundSnapshot),
        includeDepth: ltSettingsSnapshot.line.depthEnabled,
      }, { signal: insertController.signal, timeoutMs: 30_000 })
        // 성공·실패·취소 어느 쪽이든 라이브 카메라를 원래 view 창으로 되돌린다(멱등).
        .finally(releaseCaptureFrameViewOffset);
      if (!isInsertCurrent() || captureAdapterIsStale()) return;
      const ltRenderInput = Object.freeze({
        width: captured.width,
        height: captured.height,
        rgba: captured.rgba,
        ...(captured.depth ? { depth: captured.depth } : {}),
      });
      const rendered = await renderStudioBg3dLtLayersInWorker(
        ltRenderInput,
        ltSettingsSnapshot,
        {
          signal: insertController.signal,
          timeoutMs: STUDIO_BG3D_LT_INSERT_WORKER_TIMEOUT_MS,
        },
      ).catch((workerFailure: unknown) => {
        if (
          workerFailure instanceof StudioBg3dLtRenderWorkerError &&
          workerFailure.code === "worker-unavailable" &&
          captured.width * captured.height <= STUDIO_BG3D_LT_INSERT_SYNC_FALLBACK_MAX_PIXELS &&
          isInsertCurrent()
        ) {
          return renderStudioBg3dLtLayers(ltRenderInput, ltSettingsSnapshot);
        }
        throw workerFailure;
      });
      if (!isInsertCurrent() || captureAdapterIsStale()) return;
      if (rendered.layers.length === 0) {
        setError("현재 LT 설정에서는 보이는 선화나 톤이 만들어지지 않습니다. 선화 또는 톤을 켜 주세요.");
        return;
      }
      if (
        magicSelectionSnapshot &&
        !rendered.layers.some((layer) => layer.role === "color" || layer.role === "tone")
      ) {
        setError("매직 마스크를 붙일 컬러 또는 톤 베이스 레이어가 만들어지지 않았어요. 베이스 출력을 켜고 다시 시도해 주세요.");
        return;
      }

      let magicFilterMask: StudioBackground3DInsertResult["magicFilterMask"];
      if (magicSelectionSnapshot) {
        insertPhase = "magic-object-id";
        const magicCaptureDocument = normalizeStudioBg3dSceneDocument({
          ...adapted.document,
          camera: captureFrameCameraSettings,
        });
        const magicCompatibilityMessage =
          studioBg3dMagicCaptureCompatibilityMessage(magicCaptureDocument);
        if (magicCompatibilityMessage) {
          setError(magicCompatibilityMessage);
          return;
        }
        const magicRuntimeSnapshot = createStudioBg3dRuntimeSnapshot(
          magicCaptureDocument,
          new Map(),
        );
        const babylonEntry = await loadStudioBg3dBabylonSpecialistEntry();
        if (!isInsertCurrent() || captureAdapterIsStale()) return;
        const magicBackends: readonly StudioBg3dMagicBabylonBackend[] =
          typeof navigator !== "undefined" && "gpu" in navigator
            ? ["webgpu", "webgl2"]
            : ["webgl2"];
        ltMagicCaptureGenerationRef.current += 1;
        const objectIdCapture = await captureStudioBg3dMagicObjectIds({
          snapshot: magicRuntimeSnapshot,
          width: rendered.width,
          height: rendered.height,
          jobId: `magic-${insertSceneEpoch}-${ltMagicCaptureGenerationRef.current}`,
          backends: magicBackends,
          createCanvas: () => document.createElement("canvas"),
          createRuntime: ({ backend, canvas, capabilities, settings }) => {
            if (!(canvas instanceof HTMLCanvasElement)) {
              throw new Error("Magic Layer canvas owner is unavailable.");
            }
            if (capabilities !== STUDIO_BG3D_MAGIC_OBJECT_ID_RUNTIME_CAPABILITIES) {
              throw new Error("Magic Layer runtime capabilities changed unexpectedly.");
            }
            return babylonEntry.createStudioBg3dBabylonSpecialist({
              canvas,
              backend,
              capabilities,
              settings,
            });
          },
          signal: insertController.signal,
        });
        if (!isInsertCurrent() || captureAdapterIsStale()) return;
        const magicMask = buildStudioBg3dMagicFilterMask({
          width: objectIdCapture.width,
          height: objectIdCapture.height,
          objectIds: objectIdCapture.objectIds,
          legend: objectIdCapture.legend,
          selectedId: magicSelectionSnapshot.selectedId,
        });
        if (magicMask.selectedStableId !== magicSelectionSnapshot.stableId) {
          throw new Error("Magic Layer stable object identity changed.");
        }
        insertPhase = "magic-png";
        const magicMaskPngDataUrl = await encodeStudioBg3dMagicMaskPngDataUrl({
          width: magicMask.width,
          height: magicMask.height,
          data: magicMask.data,
        }, {
          signal: insertController.signal,
          timeoutMs: STUDIO_BG3D_LT_INSERT_WORKER_TIMEOUT_MS,
        });
        if (!isInsertCurrent() || captureAdapterIsStale()) return;
        magicFilterMask = Object.freeze({
          pngDataUrl: magicMaskPngDataUrl,
          width: magicMask.width,
          height: magicMask.height,
          selectedObjectStableId: magicMask.selectedStableId,
        });
      }

      insertPhase = "lt-encode";
      const encoded = encodeStudioBg3dLtLayers(rendered.layers);
      if (!isInsertCurrent() || captureAdapterIsStale()) return;
      // 소실점도 캡처 프레임 기준이어야 한다. 중앙 크롭은 NDC 선형 확대라 카메라 설정을 프레임
      // 배율로 환산하면 잘린 래스터 좌표계에서 렌더러와 정확히 같은 위치가 나온다.
      const perspectiveGuides = deriveStudioBg3dVanishingPoints(
        captureFrameCameraSettings,
        rendered.width,
        rendered.height,
      ).map((point) => ({
        axis: point.axis,
        x: point.x / rendered.width,
        y: point.y / rendered.height,
      }));
      if (!isInsertCurrent() || captureAdapterIsStale()) return;
      const receiptAuthority = verifySharedCharacterCaptureAuthority(
        sharedCharacterAuthorityLease,
        "receipt",
      );
      if (!receiptAuthority?.ok) {
        setError(SHARED_CHARACTER_CAPTURE_AUTHORITY_ERROR_MESSAGE);
        return;
      }
      insertPhase = "commit";
      setSceneBaseDocument(adapted.document);
      const linkedCharacterCapture = createStudioBg3dLinkedCharacterCapture(
        receiptAuthority.captureElementIds,
        sharedCharacters,
      );
      const accepted = await onInsert({
        kind: "separated",
        width: rendered.width,
        height: rendered.height,
        layers: encoded.layers,
        compositePngDataUrl: encoded.compositePngDataUrl,
        perspectiveGuides,
        ...(magicFilterMask ? { magicFilterMask } : {}),
        ...(linkedCharacterCapture ? { linkedCharacterCapture } : {}),
        sharedStageMutation: { kind: sharedStageMutationKind },
        materialization: { kind: sharedStageMaterializationKind },
        bg3dScene: adapted.document,
      });
      if (accepted === false) {
        setError(
          "편집 문서가 변경되었거나 현재 페이지에 삽입할 수 없습니다. 3D 창을 닫고 페이지 잠금·선택 상태를 확인한 뒤 다시 열어 주세요."
        );
        return;
      }
      if (
        ltInsertAbortRef.current === insertController &&
        modalAssetSessionRef.current === session &&
        studioBg3dModalOperationCoordinator.isCurrent(session)
      ) {
        ltInsertAbortRef.current = null;
        ltInsertRestoreLineArtPreviewRef.current = null;
        captureInFlightRef.current = false;
        setCaptureBackgroundSnapshot(null);
        setLineArtPreview(previousLineArtPreview);
        setIsCapturing(false);
      }
      invalidateModalAssetSession();
      onClose();
    } catch (insertFailure) {
      const cancelled = insertController.signal.aborted ||
        (insertFailure instanceof Error && insertFailure.name === "AbortError");
      if (cancelled) {
        const supersededByNewInsert = ltInsertAbortRef.current !== null &&
          ltInsertAbortRef.current !== insertController;
        if (!supersededByNewInsert && isModalAssetSessionCurrent(session)) {
          setError("장면·선택 또는 출력 설정이 변경되어 LT 변환을 취소했습니다. 최신 상태에서 다시 추가해 주세요.");
        }
        return;
      }
      if (!isInsertCurrent()) return;
      if (insertPhase === "magic-object-id") {
        setError(
          "선택 객체를 같은 프레임에서 안전하게 분리하지 못했습니다. 원근 카메라·단색 배경·선택 상태를 확인하고 다시 시도해 주세요.",
        );
      } else if (insertPhase === "magic-png") {
        setError(
          "선택 객체 마스크를 안전한 PNG로 만들지 못했습니다. 출력 해상도를 낮추거나 브라우저 그래픽 상태를 확인해 주세요.",
        );
      } else if (insertFailure instanceof StudioBg3dLtRenderWorkerError) {
        setError(
          insertFailure.code === "worker-unavailable"
            ? "이 브라우저에서 LT 백그라운드 작업을 시작할 수 없고 현재 출력은 안전한 즉시 변환 한도를 넘습니다. 출력 해상도를 낮춰 다시 시도해 주세요."
            : insertFailure.code === "timeout"
              ? "LT 변환 시간이 제한을 초과했습니다. 출력 해상도나 선화 정밀도를 낮춰 다시 시도해 주세요."
              : "LT 처리 작업을 안전하게 완료하지 못했습니다. 잠시 후 다시 시도하거나 출력 해상도를 낮춰 주세요.",
        );
      } else if (insertFailure instanceof Error && insertFailure.name === "TimeoutError") {
        setError("3D 장면 캡처 시간이 제한을 초과했습니다. 출력 해상도를 낮추고 다시 시도해 주세요.");
      } else {
        setError("3D 장면을 LT 레이어로 변환하지 못했습니다. 출력 해상도와 브라우저 그래픽 상태를 확인해 주세요.");
      }
    } finally {
      const ownsCurrentInsert =
        ltInsertAbortRef.current === insertController &&
        modalAssetSessionRef.current === session &&
        studioBg3dModalOperationCoordinator.isCurrent(session);
      if (ownsCurrentInsert) {
        ltInsertAbortRef.current = null;
        ltInsertRestoreLineArtPreviewRef.current = null;
        captureInFlightRef.current = false;
      }
      if (ownsCurrentInsert && componentActiveRef.current) {
        setCaptureBackgroundSnapshot(null);
        setLineArtPreview(previousLineArtPreview);
        setIsCapturing(false);
      }
    }
  }

  // 선택된 것이 도형(primitives)인지 커스텀 모델(customModels)인지는 배타적이다 — 둘 다 같은
  // selectedId/primitiveObjectsRef를 공유하므로(§4) "primitives에 있으면 도형, 아니면 모델"로 분기한다.
  const firstSelectedId = Array.from(selectedIds)[0];
  const selectedPrimitive = firstSelectedId ? (primitives.find((p) => p.id === firstSelectedId) ?? null) : null;
  const selectedCustomModel = firstSelectedId ? (customModels.find((m) => m.id === firstSelectedId) ?? null) : null;
  const selectedEntity = selectedPrimitive ?? selectedCustomModel;
  const selectedModelCacheEntry = selectedCustomModel
    ? modelRootCacheRef.current.get(selectedCustomModel.modelId) ?? null
    : null;
  const selectedSemanticMaterials = selectedModelCacheEntry?.semanticMaterials ?? null;
  const selectedSemanticAssignments = selectedSemanticMaterials?.ok
    ? selectedSemanticMaterials.assignments
    : [];
  const selectedCharacterPassPlan = selectedSemanticMaterials?.ok
    ? createStudioBg3dSemanticRenderPassPlan(
        selectedSemanticMaterials.assignments,
        "character-only",
      )
    : null;
  const selectedBackgroundPassPlan = selectedSemanticMaterials?.ok
    ? createStudioBg3dSemanticRenderPassPlan(
        selectedSemanticMaterials.assignments,
        "background-only",
      )
    : null;
  const selectedModelAnimations = selectedModelCacheEntry?.animations ?? EMPTY_THREE_ANIMATION_CLIPS;
  const selectedModelJoints = selectedModelCacheEntry?.joints ?? EMPTY_THREE_JOINTS;
  const selectedGenericModelManifest = selectedCustomModel && selectedModelCacheEntry
    ? createStudioGeneric3dVerifiedManifest({
        name: selectedModelCacheEntry.record.name,
        sourceFormat: genericModelSourceFormats.get(selectedCustomModel.modelId) ?? "glb",
        profile: deviceQuality.profile,
        contentHash: selectedModelCacheEntry.record.contentHash,
        metrics: selectedModelCacheEntry.record.validatorMetrics,
        rights: createStudioGeneric3dRightsFromAttachment(selectedModelCacheEntry.record.rights),
        classification: genericModelClassifications.get(selectedCustomModel.modelId),
        ...selectedModelCacheEntry.genericHints,
      })
    : null;
  const selectedGenericModelProxies = selectedGenericModelManifest
    ? createStudioGeneric3dPoseProxies({
        manifest: selectedGenericModelManifest,
        nodes: selectedModelJoints.map((joint) => ({
          key: joint.key,
          name: joint.name,
          parentKey: joint.parentKey,
          isBone: true,
        })),
      })
    : [];
  const effectiveGenericModelProxyId = selectedGenericModelProxies.some(
    (proxy) => proxy.id === genericModelSelectedProxyId,
  )
    ? genericModelSelectedProxyId
    : selectedGenericModelProxies[0]?.id ?? null;

  function changeSelectedGenericModelClassification(
    classification: StudioGeneric3dClassification,
  ): void {
    if (!selectedCustomModel) return;
    const normalized = normalizeStudioGeneric3dClassification(classification);
    if (!normalized) return;
    const storageId = selectedCustomModel.modelId;
    const existing = attachmentByStorageModelIdRef.current.get(storageId);
    if (existing) {
      const sourceFormat =
        normalizeStudioGeneric3dSourceFormat(genericModelSourceFormats.get(storageId)) ??
        parseStudioGeneric3dWorkflowMetadata(existing)?.sourceFormat ??
        null;
      attachmentByStorageModelIdRef.current.set(
        storageId,
        withStudioGeneric3dWorkflowMetadata(existing, {
          classification: normalized,
          sourceFormat,
        }),
      );
    }
    setGenericModelClassifications((previous) =>
      mergeStudioGeneric3dWorkflowMaps(previous, new Map([[storageId, normalized]])),
    );
  }

  function changeGenericModelControlMode(mode: StudioGeneric3dControlMode): void {
    setGenericModelControlMode(mode);
    if (mode === "root") setTransformMode("translate");
  }

  function selectGenericModelProxy(proxyId: string): void {
    setGenericModelSelectedProxyId(proxyId);
    const proxy = selectedGenericModelProxies.find((candidate) => candidate.id === proxyId);
    if (
      proxy?.operation === "bone-rotate"
      && proxy.targetKey
      && selectedCustomModel
    ) {
      setPoseJointSelection({ modelId: selectedCustomModel.id, key: proxy.targetKey });
    }
  }
  const selectedJointByKey = new Map(selectedModelJoints.map((joint) => [joint.key, joint] as const));
  const selectedPoseRigSelection = selectedCustomModel
    ? resolveStudioBg3dRigSelection({
        modelId: selectedCustomModel.id,
        descriptors: selectedModelJoints,
        selection: poseJointSelection,
      })
    : null;
  const selectedPoseJointKey = selectedPoseRigSelection?.key ?? "";
  const selectedPoseCanonicalKey = selectedPoseRigSelection?.canonicalKey ?? "";
  const selectedPoseJoint = selectedCustomModel?.pose?.joints.find(
    (joint) => (
      selectedJointByKey.get(joint.jointKey)?.canonicalKey ?? joint.jointKey
    ) === selectedPoseCanonicalKey,
  );
  const selectedAimConstraints: StudioBg3dConstraintLayer["aims"] =
    Array.isArray(selectedCustomModel?.constraints?.aims)
    ? selectedCustomModel.constraints.aims
    : [];
  const selectedTwoBoneIkConstraints: StudioBg3dConstraintLayer["twoBoneIks"] =
    Array.isArray(selectedCustomModel?.constraints?.twoBoneIks)
    ? selectedCustomModel.constraints.twoBoneIks
    : [];
  const selectedHasEffectiveRigConstraint = Boolean(
    selectedCustomModel?.constraints?.enabled && (
      selectedAimConstraints.some((constraint) => constraint.weight > 0) ||
      selectedTwoBoneIkConstraints.some((constraint) => constraint.weight > 0)
    )
  );
  const selectedRigBakeDisabledReason = !selectedCustomModel
    ? "포즈로 구울 3D 모델을 먼저 선택해 주세요."
    : !selectedHasEffectiveRigConstraint
      ? "강도가 0보다 큰 IK 또는 에임 제약을 켜야 포즈로 구울 수 있습니다."
      : failedCloneIds.has(selectedCustomModel.id)
        ? "모델 리그를 불러오지 못해 포즈로 구울 수 없습니다. 모델 파일 상태를 확인해 주세요."
        : !readyCloneIds.has(selectedCustomModel.id)
          ? "모델 리그를 준비하는 중입니다. 준비가 끝나면 포즈로 구울 수 있습니다."
          : isCapturing
            ? "3D 장면을 캡처하는 중에는 포즈로 구울 수 없습니다. 캡처가 끝난 뒤 다시 시도해 주세요."
            : isRestoringScene
              ? "3D 장면을 복원하는 중에는 포즈로 구울 수 없습니다. 복원이 끝난 뒤 다시 시도해 주세요."
              : physicsInteractionLocked
                ? "물리 미리보기 중에는 포즈로 구울 수 없습니다. 현재 자세를 적용하거나 미리보기를 초기화해 주세요."
                : null;
  const selectedAimConstraint = selectedAimConstraints.find(
    (constraint) => (
      selectedJointByKey.get(constraint.jointKey)?.canonicalKey ?? constraint.jointKey
    ) === selectedPoseCanonicalKey,
  );
  const selectedIkProtectedJointKeys = new Set<string>();
  for (const constraint of selectedTwoBoneIkConstraints) {
    const middle = selectedJointByKey.get(constraint.middleJointKey);
    if (middle) selectedIkProtectedJointKeys.add(middle.canonicalKey);
    let ancestor = selectedJointByKey.get(constraint.upperJointKey);
    while (ancestor) {
      selectedIkProtectedJointKeys.add(ancestor.canonicalKey);
      ancestor = ancestor.parentKey ? selectedJointByKey.get(ancestor.parentKey) : undefined;
    }
  }
  const selectedAimSuppressedByIk = selectedIkProtectedJointKeys.has(
    selectedJointByKey.get(selectedPoseJointKey)?.canonicalKey ?? selectedPoseJointKey,
  );
  const selectedIkEndCandidates = selectedModelJoints.filter((end) => {
    const middle = end.parentKey ? selectedJointByKey.get(end.parentKey) : undefined;
    const upper = middle?.parentKey ? selectedJointByKey.get(middle.parentKey) : undefined;
    const upperLength = middle && upper
      ? Math.hypot(
          middle.restPosition[0] - upper.restPosition[0],
          middle.restPosition[1] - upper.restPosition[1],
          middle.restPosition[2] - upper.restPosition[2],
        )
      : 0;
    const lowerLength = middle
      ? Math.hypot(
          end.restPosition[0] - middle.restPosition[0],
          end.restPosition[1] - middle.restPosition[1],
          end.restPosition[2] - middle.restPosition[2],
        )
      : 0;
    return Boolean(
      middle && upper &&
      middle.skinIndex === end.skinIndex && upper.skinIndex === end.skinIndex &&
      upperLength > 1e-6 && lowerLength > 1e-6,
    );
  });
  const savedIkEndJointKey = selectedTwoBoneIkConstraints.find((constraint) =>
    selectedIkEndCandidates.some((joint) => joint.key === constraint.endJointKey)
  )?.endJointKey;
  const requestedIkEndJointKey = ikEndJointSelection &&
    ikEndJointSelection.modelId === selectedCustomModel?.id
    ? ikEndJointSelection.jointKey
    : "";
  const selectedIkEndJointKey = selectedIkEndCandidates.some(
    (joint) => joint.key === requestedIkEndJointKey,
  )
    ? requestedIkEndJointKey
    : (savedIkEndJointKey ?? selectedIkEndCandidates[0]?.key ?? "");
  const selectedIkRigSelection = selectedCustomModel && selectedIkEndJointKey
    ? { modelId: selectedCustomModel.id, key: selectedIkEndJointKey }
    : null;
  const selectedIkEndJoint = selectedJointByKey.get(selectedIkEndJointKey);
  const selectedIkMiddleJoint = selectedIkEndJoint?.parentKey
    ? selectedJointByKey.get(selectedIkEndJoint.parentKey)
    : undefined;
  const selectedIkUpperJoint = selectedIkMiddleJoint?.parentKey
    ? selectedJointByKey.get(selectedIkMiddleJoint.parentKey)
    : undefined;
  const selectedTwoBoneIkConstraint = selectedTwoBoneIkConstraints.find(
    (constraint) => (
      selectedJointByKey.get(constraint.endJointKey)?.canonicalKey ?? constraint.endJointKey
    ) === selectedIkEndJoint?.canonicalKey,
  );
  const selectedIkChainKeys = new Set([
    selectedIkUpperJoint?.canonicalKey,
    selectedIkMiddleJoint?.canonicalKey,
    selectedIkEndJoint?.canonicalKey,
  ].filter((key): key is string => Boolean(key)));
  const selectedIkHasOverlap = selectedTwoBoneIkConstraints.some(
    (constraint) => constraint !== selectedTwoBoneIkConstraint && [
      constraint.upperJointKey,
      constraint.middleJointKey,
      constraint.endJointKey,
    ].some((key) => selectedIkChainKeys.has(
      selectedJointByKey.get(key)?.canonicalKey ?? key,
    )),
  );
  const selectedIkLimitReached = selectedTwoBoneIkConstraints.length >=
    STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS;
  const selectedIkWorldMatrix = selectedCustomModel
    ? calculateStudioBg3dThreeWorldMatrix(
        [...primitives, ...customModels],
        selectedCustomModel.id,
      )
    : null;
  const selectedIkSourceRoot = selectedCustomModel
    ? modelRootCacheRef.current.get(selectedCustomModel.modelId)?.root
    : undefined;
  const selectedIkTransformSupported = !(
    selectedIkSourceRoot && selectedIkWorldMatrix &&
    selectedIkUpperJoint && selectedIkMiddleJoint && selectedIkEndJoint
  ) || isStudioBg3dThreeTwoBoneIkChainSupported({
    root: selectedIkSourceRoot,
    instanceWorldMatrix: selectedIkWorldMatrix,
    upperJointKey: selectedIkUpperJoint.key,
    middleJointKey: selectedIkMiddleJoint.key,
    endJointKey: selectedIkEndJoint.key,
  });
  const selectedIkDefaultTarget: [number, number, number] = selectedIkEndJoint
    ? [...selectedIkEndJoint.restPosition]
    : [0, 1, 0];
  const selectedIkDefaultPole: [number, number, number] =
    selectedIkUpperJoint && selectedIkMiddleJoint && selectedIkEndJoint
    ? createTwoBoneDefaultPoleTarget(
        selectedIkUpperJoint.restPosition,
        selectedIkMiddleJoint.restPosition,
        selectedIkEndJoint.restPosition,
      )
    : [0, 0, 1];
  const selectedPoseEulerDegrees = quaternionToEulerDegrees(
    selectedPoseJoint?.rotationOffset ?? [0, 0, 0, 1],
  );
  const selectedModelMorphTargets = selectedModelCacheEntry?.morphTargets ?? EMPTY_THREE_MORPH_TARGETS;
  const selectedMorphTargetCandidateKey = morphTargetSelection !== null &&
    morphTargetSelection.modelId === selectedCustomModel?.id
    ? morphTargetSelection.key
    : null;
  const selectedMorphTargetKey = selectedMorphTargetCandidateKey !== null &&
    selectedModelMorphTargets.some((target) => target.key === selectedMorphTargetCandidateKey)
    ? selectedMorphTargetCandidateKey
    : (selectedModelMorphTargets[0]?.key ?? "");
  const selectedMorphOverride = selectedCustomModel?.morph?.targets.find(
    (target) => target.targetKey === selectedMorphTargetKey,
  );
  const selectedAnimationClip = selectedCustomModel?.animation
    ? (selectedModelAnimations[selectedCustomModel.animation.clipIndex] ?? selectedModelAnimations[0])
    : undefined;
  const selectedAnimationDuration = Math.max(
    0.01,
    Number.isFinite(selectedAnimationClip?.duration) ? selectedAnimationClip?.duration ?? 0.01 : 0.01,
  );

  function commitSelectedPoseOverride(
    next: Omit<StudioBg3dPoseLayer["joints"][number], "jointKey"> | null,
  ): void {
    if (!selectedCustomModel || !selectedPoseRigSelection) return;
    updateCustomModelPose(selectedCustomModel.id, (current) => {
      const joints = mutateStudioBg3dPoseOverride({
        modelId: selectedCustomModel.id,
        descriptors: selectedModelJoints,
        selection: selectedPoseRigSelection,
        overrides: current.joints,
        next,
      });
      return joints ? { ...current, joints: [...joints] } : current;
    });
  }

  function commitSelectedAimConstraint(
    next: Omit<StudioBg3dConstraintLayer["aims"][number], "jointKey"> | null,
  ): void {
    if (!selectedCustomModel || !selectedPoseRigSelection) return;
    updateCustomModelConstraints(selectedCustomModel.id, (current) => {
      const aims = mutateStudioBg3dAimConstraint({
        modelId: selectedCustomModel.id,
        descriptors: selectedModelJoints,
        selection: selectedPoseRigSelection,
        constraints: current.aims,
        next,
      });
      return aims ? { ...current, aims: [...aims] } : current;
    });
  }

  function commitSelectedTwoBoneIkConstraint(
    next: Omit<StudioBg3dConstraintLayer["twoBoneIks"][number], "endJointKey"> | null,
  ): void {
    if (!selectedCustomModel || !selectedIkRigSelection) return;
    updateCustomModelConstraints(selectedCustomModel.id, (current) => {
      const twoBoneIks = mutateStudioBg3dTwoBoneIkConstraint({
        modelId: selectedCustomModel.id,
        descriptors: selectedModelJoints,
        selection: selectedIkRigSelection,
        constraints: current.twoBoneIks,
        next,
      });
      return twoBoneIks ? { ...current, twoBoneIks: [...twoBoneIks] } : current;
    });
  }
  const selectedIsLocked = isBgObjectTransformBlocked(selectedEntity);
  const selectedEntities = Array.from(selectedIds).reduce<Array<BgPrimitive | BgCustomModelInstance>>(
    (entities, id) => {
      const entity = primitives.find((primitive) => primitive.id === id) ?? customModels.find((model) => model.id === id);
      if (entity) entities.push(entity);
      return entities;
    },
    []
  );
  const canGroundSelection = selectedEntities.some((entity) => !isBgObjectTransformBlocked(entity));
  const selectedPlaceableModels = selectedEntities.filter(
    (entity): entity is BgCustomModelInstance =>
      customModels.some((model) => model.id === entity.id),
  );
  // Placement recipe is custom-model only; multi is allowed when every selection is a model and at
  // least one is unlocked (locked siblings are skipped inside the command).
  const canPlaceSelectedModelRecipe =
    !physicsInteractionLocked &&
    selectedIds.size > 0 &&
    selectedIds.size <= STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS &&
    selectedEntities.length === selectedIds.size &&
    selectedPlaceableModels.length === selectedEntities.length &&
    selectedPlaceableModels.some((model) => !isBgObjectTransformBlocked(model));
  const groundSelectionDisabledReason =
    physicsInteractionLocked
      ? "물리 미리보기 중에는 장면 변형 도구를 잠급니다."
      : selectedEntities.length === 0
      ? "도형 또는 3D 모델을 먼저 선택하세요."
      : !canGroundSelection
        ? "선택한 객체의 잠금을 해제하세요."
        : undefined;
  const centerGroundSelectionDisabledReason =
    physicsInteractionLocked
      ? "물리 미리보기 중에는 장면 변형 도구를 잠급니다."
      : selectedEntities.length === 0
        ? "도형 또는 3D 모델을 먼저 선택하세요."
        : selectedEntities.length > 1
          ? "원점에 객체가 겹치지 않도록 한 번에 하나만 선택하세요."
          : selectedIsLocked
            ? "선택한 객체의 잠금을 해제하세요."
            : selectedCustomModel && !readyCloneIds.has(selectedCustomModel.id)
              ? failedCloneIds.has(selectedCustomModel.id)
                ? "모델 지오메트리를 불러오지 못해 정렬할 수 없습니다."
                : "모델 지오메트리를 준비하는 중입니다."
              : !selectedEntity || !primitiveObjectsRef.current.has(selectedEntity.id)
                ? "선택한 객체의 지오메트리를 준비하는 중입니다."
                : undefined;
  const snapSettingsSummary = studioBg3dSnapSettingsSummary(snapSettings);
  const quadViewHint: StudioToolHintSpec = isQuadView
    ? {
        ...BG3D_VIEWPORT_HINTS.quad,
        title: "단일 뷰로 복귀",
        description: "다음 클릭으로 4분할 화면을 닫고 원근 단일 뷰로 돌아가 장면 편집 공간을 넓힙니다.",
        preview: "quad-view",
        previewVariant: "close",
        tip: "필요할 때 같은 버튼을 다시 누르면 네 시점을 함께 열 수 있어요.",
      }
    : BG3D_VIEWPORT_HINTS.quad;
  const snapToggleHint: StudioToolHintSpec = snapSettings.enabled
    ? {
        ...BG3D_VIEWPORT_HINTS.snap,
        title: "변형 스냅 끄기",
        description: `다음 클릭으로 이동·회전 스냅을 끕니다. 현재 설정: ${snapSettingsSummary}.`,
        preview: "object-snap",
        previewVariant: "disable",
        tip: "다시 켜면 현재 간격과 축 설정을 그대로 이어서 사용할 수 있어요.",
      }
    : {
        ...BG3D_VIEWPORT_HINTS.snap,
        description: `${BG3D_VIEWPORT_HINTS.snap.description} 현재 설정: ${snapSettingsSummary}.`,
      };
  const lineArtPreviewHint: StudioToolHintSpec = lineArtPreview
    ? {
        ...BG3D_VIEWPORT_HINTS.linePreview,
        title: "선화 미리보기 끄기",
        description: "다음 클릭으로 외곽선 중심 미리보기를 끄고 재질색과 조명이 적용된 컬러 장면으로 돌아갑니다.",
        preview: "line-art",
        previewVariant: "disable",
        tip: "필요할 때 같은 버튼으로 외곽선 미리보기를 다시 켤 수 있어요.",
      }
    : BG3D_VIEWPORT_HINTS.linePreview;
  const surfaceSnapHint: StudioToolHintSpec = surfaceSnapArmed
    ? {
        ...BG3D_VIEWPORT_HINTS.surfaceSnap,
        title: "표면 붙이기 취소",
        description: "현재 다른 객체의 표면 클릭을 기다리고 있습니다. 이 버튼이나 Esc를 누르면 배치하지 않고 취소합니다.",
        previewVariant: "disable",
        tip: "객체를 클릭해도 현재 선택은 바뀌지 않습니다.",
      }
    : BG3D_VIEWPORT_HINTS.surfaceSnap;
  const layerListItems: StudioBg3dLayerListItem[] = [
    ...primitives.map((prim, index) => {
      const kindCountBefore = primitives.slice(0, index).filter((p) => p.kind === prim.kind).length;
      return {
        id: prim.id,
        label: prim.name || `${PRIMITIVE_DEFS[prim.kind].label} ${kindCountBefore + 1}`,
        kind: "primitive" as const,
        visible: isBgObjectVisible(prim),
        locked: isBgObjectLocked(prim),
        parentId: prim.parentId,
      };
    }),
    ...customModels.map((inst, index) => {
      const kindCountBefore = customModels.slice(0, index).filter((m) => m.modelId === inst.modelId).length;
      const modelName = modelLibrary.find((entry) => entry.id === inst.modelId)?.name ?? "3D 모델";
      return {
        id: inst.id,
        label: inst.name || `${modelName} ${kindCountBefore + 1}`,
        kind: "model" as const,
        visible: isBgObjectVisible(inst),
        locked: isBgObjectLocked(inst),
        parentId: inst.parentId,
      };
    }),
  ];
  const sceneHierarchy = resolveStudioBg3dHierarchy(layerListItems);
  const effectivelyVisibleLayerIds = collectStudioBg3dEffectivelyVisibleEntityIds(layerListItems);
  const surfaceSnapDisabledReason = isQuadView
    ? "표면 붙이기는 단일 뷰에서만 사용할 수 있습니다."
    : isCapturing || isBatchRenderingShots
      ? "3D 장면을 캡처하는 중에는 표면 붙이기를 사용할 수 없습니다."
      : isRestoringScene || isUploadingModel || applyingTemplateId !== null ||
          deletingModelId !== null || isSavingTemplate
        ? "3D 장면 또는 모델 작업이 끝난 뒤 표면 붙이기를 사용해 주세요."
        : physicsInteractionLocked || isTransforming
          ? "물리 미리보기나 변형 작업 중에는 표면 붙이기를 사용할 수 없습니다."
          : selectedIds.size === 0
            ? "표면에 붙일 객체를 선택해 주세요."
            : selectedIds.size > STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS
              ? `표면 붙이기는 한 번에 최대 ${STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS}개까지 지원합니다.`
              : selectedEntities.length === 0
                ? "표면에 붙일 객체를 선택해 주세요."
                : selectedEntities.every((entity) => isBgObjectTransformBlocked(entity))
                  ? "선택한 객체의 잠금을 먼저 해제해 주세요."
                  : selectedEntities.every((entity) => !effectivelyVisibleLayerIds.has(entity.id))
                    ? "숨겨진 객체는 표면에 붙일 수 없습니다."
                    : selectedEntities.every((entity) => {
                        const custom = customModels.find((model) => model.id === entity.id);
                        if (custom && !readyCloneIds.has(custom.id)) return true;
                        return !primitiveObjectsRef.current.has(entity.id);
                      })
                      ? "선택한 객체의 지오메트리를 준비하는 중입니다."
                      : null;
  const measurementDisabledReason = isQuadView
    ? "줄자는 단일 뷰에서만 사용할 수 있습니다."
    : isCapturing || isBatchRenderingShots
      ? "3D 장면을 캡처하는 중에는 줄자를 사용할 수 없습니다."
      : isRestoringScene || isUploadingModel || applyingTemplateId !== null ||
          deletingModelId !== null || isSavingTemplate
        ? "3D 장면 또는 모델 작업이 끝난 뒤 줄자를 사용해 주세요."
        : physicsInteractionLocked || isTransforming ||
            (placementSession.phase === "preview" && placementPreviewAsset !== null)
          ? "배치·물리·변형 작업이 끝난 뒤 줄자를 사용해 주세요."
          : null;
  const focusSelectionDisabledReason = isCapturing || isBatchRenderingShots || isRestoringScene ||
      physicsInteractionLocked
    ? "다른 3D 작업이 끝난 뒤 화면 맞춤을 사용해 주세요."
    : selectedIds.size !== 1 || !selectedEntity
      ? "화면에 맞출 객체를 하나만 선택해 주세요."
      : !effectivelyVisibleLayerIds.has(selectedEntity.id)
        ? "숨겨진 객체는 화면에 맞출 수 없습니다."
        : selectedCustomModel && !readyCloneIds.has(selectedCustomModel.id)
          ? failedCloneIds.has(selectedCustomModel.id)
            ? "선택한 모델 지오메트리를 불러오지 못했습니다."
            : "선택한 모델 지오메트리를 준비하는 중입니다."
          : !primitiveObjectsRef.current.has(selectedEntity.id)
            ? "선택한 객체의 지오메트리를 준비하는 중입니다."
            : null;

  function cancelMeasurement(message = "줄자를 켠 뒤 첫 번째 점을 선택하세요."): void {
    measurementActiveRef.current = false;
    setMeasurementActive(false);
    setMeasurementStartWorld(null);
    setMeasurementDraft(null);
    setMeasurementInference(null);
    setMeasurementStatus(message);
  }

  function measurementInferenceReferences(): StudioBg3dMeasurementInferenceReference[] {
    const references: StudioBg3dMeasurementInferenceReference[] = [];
    for (const guide of measurementDocument.guides) {
      if (references.length >= STUDIO_BG3D_MEASUREMENT_MAX_REFERENCES) break;
      const resolved = resolveStudioBg3dMeasurementGuide(guide, measurementDocument.unit);
      const direction = resolved.ok
        ? resolved.resolved.measurement.directionWorld
        : null;
      if (!direction) continue;
      references.push({ id: guide.id, directionWorld: direction });
    }
    return references;
  }

  function resolveMeasurementCandidate(
    point: StudioBg3dMeasurementVec3,
    lockedLengthMeters = measurementLockedLengthMeters,
  ): {
    readonly measurement: StudioBg3dWorldMeasurement;
    readonly inference: StudioBg3dMeasurementInferenceSuccess | null;
  } | null {
    if (!measurementStartWorld) return null;
    const measured = lockedLengthMeters === null
      ? measureStudioBg3dWorldPoints(measurementStartWorld, point)
      : lockStudioBg3dMeasurementLength({
          startWorld: measurementStartWorld,
          proposedEndWorld: point,
          lockedLengthMeters,
          fallbackDirectionWorld: measurementDraft?.directionWorld ?? [1, 0, 0],
        });
    if (!measured.ok) {
      setMeasurementStatus(measured.message);
      return null;
    }
    const measurement = measured.measurement;
    const inferred = classifyStudioBg3dMeasurementInference({
      startWorld: measurement.startWorld,
      endWorld: measurement.endWorld,
      references: measurementInferenceReferences(),
    });
    return {
      measurement,
      inference: inferred.ok ? inferred : null,
    };
  }

  function updateMeasurementPreview(point: StudioBg3dMeasurementVec3): void {
    if (!measurementActiveRef.current || !measurementStartWorld) return;
    const candidate = resolveMeasurementCandidate(point);
    if (!candidate) return;
    setMeasurementDraft(candidate.measurement);
    setMeasurementInference(candidate.inference);
    const label = formatStudioBg3dMeasurementLength(
      candidate.measurement.distanceMeters,
      measurementDocument.unit,
    );
    setMeasurementStatus(
      `${label ?? "측정 중"} · 두 번째 점을 클릭해 확정하세요.`,
    );
  }

  function pickMeasurementPoint(point: StudioBg3dMeasurementVec3): void {
    if (!measurementActiveRef.current) return;
    if (!measurementStartWorld) {
      setMeasurementStartWorld(point);
      setMeasurementDraft(null);
      setMeasurementInference(null);
      setMeasurementStatus("시작점을 잡았습니다. 두 번째 점을 움직여 거리와 방향을 확인하세요.");
      return;
    }
    const candidate = resolveMeasurementCandidate(point);
    if (!candidate) return;
    measurementActiveRef.current = false;
    setMeasurementActive(false);
    setMeasurementDraft(candidate.measurement);
    setMeasurementInference(candidate.inference);
    const label = formatStudioBg3dMeasurementLength(
      candidate.measurement.distanceMeters,
      measurementDocument.unit,
    );
    setMeasurementStatus(
      `${label ?? "측정"} 확정 · 길이를 잠그거나 영구 가이드로 고정할 수 있습니다.`,
    );
  }

  function handleMeasurementSurfacePreview(event: ThreeEvent<PointerEvent>): void {
    if (!measurementActiveRef.current || !measurementStartWorld) return;
    const point = readStudioBg3dMeasurementPointFromThreeEvent(event);
    if (point) updateMeasurementPreview(point);
  }

  function handleMeasurementLengthLockChange(lockedLengthMeters: number | null): void {
    setMeasurementLockedLengthMeters(lockedLengthMeters);
    if (lockedLengthMeters === null || !measurementStartWorld || !measurementDraft) return;
    const candidate = resolveMeasurementCandidate(
      measurementDraft.endWorld,
      lockedLengthMeters,
    );
    if (!candidate) return;
    setMeasurementDraft(candidate.measurement);
    setMeasurementInference(candidate.inference);
    const label = formatStudioBg3dMeasurementLength(
      candidate.measurement.distanceMeters,
      measurementDocument.unit,
    );
    setMeasurementStatus(`${label ?? "측정"} 길이를 정확히 잠갔습니다.`);
  }

  function toggleMeasurement(): void {
    if (measurementActiveRef.current) {
      cancelMeasurement("줄자 측정을 취소했습니다.");
      return;
    }
    if (measurementDisabledReason) {
      setMeasurementStatus(measurementDisabledReason);
      return;
    }
    if (surfaceSnapArmedRef.current) cancelSurfaceSnap();
    measurementActiveRef.current = true;
    setMeasurementActive(true);
    setMeasurementStartWorld(null);
    setMeasurementDraft(null);
    setMeasurementInference(null);
    setMeasurementStatus("첫 번째 점을 선택하세요. 객체 표면과 바닥을 모두 찍을 수 있습니다.");
    handlePanelTabChange("view");
    setError(null);
  }

  function toggleSurfaceSnap(): void {
    if (surfaceSnapArmedRef.current) {
      cancelSurfaceSnap("표면 붙이기를 취소했습니다.");
      return;
    }
    if (measurementActiveRef.current) {
      cancelMeasurement("표면 붙이기로 전환해 줄자 측정을 취소했습니다.");
    }
    if (surfaceSnapDisabledReason) {
      setSurfaceSnapStatus({ tone: "error", message: surfaceSnapDisabledReason });
      return;
    }
    surfaceSnapArmedRef.current = true;
    setSurfaceSnapArmed(true);
    setSurfaceSnapStatus({
      tone: "info",
      message: "붙일 표면을 클릭하세요. 선택은 유지되며 Esc로 취소할 수 있습니다.",
    });
    setError(null);
  }

  function handleSurfaceSnapPick(
    targetId: string,
    event: ThreeEvent<MouseEvent>,
  ): boolean {
    if (measurementActiveRef.current) {
      const point = readStudioBg3dMeasurementPointFromThreeEvent(event);
      if (point) pickMeasurementPoint(point);
      else setMeasurementStatus("클릭한 표면의 안전한 world 좌표를 읽지 못했습니다.");
      return true;
    }
    if (!surfaceSnapArmedRef.current) return false;
    if (surfaceSnapDisabledReason || selectedEntities.length === 0) {
      cancelSurfaceSnap();
      setSurfaceSnapStatus({
        tone: "error",
        message: surfaceSnapDisabledReason ?? "표면 붙이기 상태가 만료되어 다시 시작해야 합니다.",
      });
      return true;
    }
    if (!effectivelyVisibleLayerIds.has(targetId)) {
      setSurfaceSnapStatus({ tone: "error", message: "숨겨진 객체의 표면에는 붙일 수 없습니다." });
      return true;
    }

    const worldHit = readStudioBg3dWorldSurfaceHit(event);
    const targetPathIds = collectStudioBg3dSurfaceTargetPathIds(
      targetId,
      sceneHierarchy.parentById,
    );
    if (!worldHit || !targetPathIds) {
      setSurfaceSnapStatus({
        tone: "error",
        message: "클릭한 표면의 위치·법선 또는 객체 계층을 확인하지 못했습니다. 다른 면을 클릭해 주세요.",
      });
      return true;
    }

    // Multi-select: shared hit normal/point; each object keeps individual world bounds + subtree.
    // Single-select still goes through planStudioBg3dMultiSurfaceSnap (1 input) for one code path.
    const snapInputs: ResolveStudioBg3dSurfaceSnapInput[] = [];
    const snapEntities: Array<BgPrimitive | BgCustomModelInstance> = [];
    for (const entity of selectedEntities) {
      if (snapInputs.length >= STUDIO_BG3D_SURFACE_SNAP_MAX_MULTI_INPUTS) break;
      const selectionObject = primitiveObjectsRef.current.get(entity.id);
      const worldBounds = readStudioBg3dObjectWorldBounds(selectionObject);
      const selectionSubtreeIds = collectStudioBg3dSurfaceSelectionSubtreeIds(
        entity.id,
        sceneHierarchy.childrenByParent,
      );
      selectionObject?.parent?.updateWorldMatrix(true, false);
      if (!selectionObject || !worldBounds || !selectionSubtreeIds) continue;
      snapEntities.push(entity);
      snapInputs.push({
        // Per-object single-selection contract required by resolveStudioBg3dSurfaceSnap.
        selectedIds: [entity.id],
        selectionId: entity.id,
        selectionSubtreeIds,
        locked: isBgObjectTransformBlocked(entity),
        localPosition: entity.position,
        rotation: entity.rotation,
        worldBounds,
        ...(selectionObject.parent
          ? { parentWorldMatrix: [...selectionObject.parent.matrixWorld.elements] }
          : {}),
        hit: {
          targetPathIds,
          point: worldHit.point,
          normal: worldHit.normal,
        },
        surfaceOffset: 0.01,
        alignRotationToNormal: surfaceSnapAlignNormal,
      });
    }

    if (snapInputs.length === 0) {
      setSurfaceSnapStatus({
        tone: "error",
        message: "선택한 객체의 지오메트리를 준비하지 못했습니다. 준비가 끝난 뒤 다시 시도해 주세요.",
      });
      return true;
    }

    const plan = planStudioBg3dMultiSurfaceSnap(snapInputs);
    if (!plan.ok) {
      const firstReason = plan.results?.find((result) => !result.ok && "reason" in result);
      const reason = firstReason && !firstReason.ok ? firstReason.reason : plan.reason;
      setSurfaceSnapStatus({
        tone: "error",
        message: reason === "self-hit"
          ? "선택한 객체나 그 자식 표면에는 붙일 수 없습니다. 다른 객체의 면을 클릭해 주세요."
          : "이 표면에는 객체를 안전하게 배치할 수 없습니다. 다른 면을 클릭해 주세요.",
      });
      return true;
    }

    const positionById = new Map<string, [number, number, number]>();
    const rotationById = new Map<string, [number, number, number]>();
    let successCount = 0;
    let selfHitCount = 0;
    let lockedCount = 0;
    for (let index = 0; index < plan.results.length; index += 1) {
      const result = plan.results[index]!;
      const entity = snapEntities[index];
      if (!entity) continue;
      if (!result.ok) {
        if (result.reason === "self-hit") selfHitCount += 1;
        if (result.reason === "locked") lockedCount += 1;
        continue;
      }
      successCount += 1;
      positionById.set(entity.id, [...result.localPosition] as [number, number, number]);
      if (surfaceSnapAlignNormal) {
        rotationById.set(entity.id, [...result.rotation] as [number, number, number]);
      }
    }

    if (successCount === 0) {
      setSurfaceSnapStatus({
        tone: "error",
        message: selfHitCount > 0
          ? "선택한 객체나 그 자식 표면에는 붙일 수 없습니다. 다른 객체의 면을 클릭해 주세요."
          : lockedCount > 0
            ? "선택한 객체의 잠금을 먼저 해제해 주세요."
            : "이 표면에는 객체를 안전하게 배치할 수 없습니다. 다른 면을 클릭해 주세요.",
      });
      return true;
    }

    const nextPrimitives = primitives.map((primitive) => {
      const nextPosition = positionById.get(primitive.id);
      if (!nextPosition) return primitive;
      const nextRotation = rotationById.get(primitive.id);
      return {
        ...primitive,
        position: nextPosition,
        ...(nextRotation ? { rotation: nextRotation } : {}),
      };
    });
    const nextCustomModels = customModels.map((model) => {
      const nextPosition = positionById.get(model.id);
      if (!nextPosition) return model;
      const nextRotation = rotationById.get(model.id);
      return {
        ...model,
        position: nextPosition,
        ...(nextRotation ? { rotation: nextRotation } : {}),
      };
    });
    surfaceSnapArmedRef.current = false;
    setSurfaceSnapArmed(false);
    commitImmediateHistoryTransition(nextPrimitives, nextCustomModels, sceneBaseDocument);
    setPrimitives(nextPrimitives);
    setCustomModels(nextCustomModels);
    const failedCount = snapInputs.length - successCount;
    const multi = snapInputs.length > 1;
    setSurfaceSnapStatus({
      tone: "success",
      message: multi
        ? surfaceSnapAlignNormal
          ? `${successCount}개 객체를 표면에 붙이고 법선에 맞춰 회전했어요.${failedCount > 0 ? ` (${failedCount}개는 건너뜀)` : ""}`
          : `${successCount}개 객체를 클릭한 표면에 붙였습니다.${failedCount > 0 ? ` (${failedCount}개는 건너뜀)` : ""}`
        : surfaceSnapAlignNormal
          ? "표면에 붙이고 법선에 맞춰 회전했어요."
          : "선택한 객체를 클릭한 표면에 붙였습니다. 회전은 그대로 유지했습니다.",
    });
    setError(null);
    return true;
  }
  let physicsSelectionUnavailableReason: string | null = null;
  if (selectedIds.size > STUDIO_BG3D_PHYSICS_MAX_DYNAMIC_BODIES) {
    physicsSelectionUnavailableReason =
      `한 번에 최대 ${STUDIO_BG3D_PHYSICS_MAX_DYNAMIC_BODIES}개 오브젝트를 시뮬레이션할 수 있습니다.`;
  } else {
    for (const id of selectedIds) {
      const entity = primitives.find((primitive) => primitive.id === id) ??
        customModels.find((model) => model.id === id);
      if (!entity || !isBgObjectVisible(entity)) {
        physicsSelectionUnavailableReason = "숨긴 오브젝트는 물리 미리보기에 사용할 수 없습니다.";
        break;
      }
      if (isBgObjectTransformBlocked(entity)) {
        physicsSelectionUnavailableReason = "선택한 오브젝트의 잠금을 먼저 해제하세요.";
        break;
      }
      if ((sceneHierarchy.parentById.get(id) ?? null) !== null) {
        physicsSelectionUnavailableReason = "그룹 안의 자식 대신 독립된 최상위 오브젝트를 선택하세요.";
        break;
      }
      if ((sceneHierarchy.childrenByParent.get(id)?.length ?? 0) > 0) {
        physicsSelectionUnavailableReason = "자식이 있는 그룹은 아직 동적 충돌체로 바꿀 수 없습니다.";
        break;
      }
      const model = customModels.find((candidate) => candidate.id === id);
      const cacheEntry = model ? modelRootCacheRef.current.get(model.modelId) : undefined;
      if (
        model && (
          model.animation !== undefined || model.pose !== undefined || model.morph !== undefined ||
          model.constraints !== undefined || (cacheEntry?.metrics.skins ?? 0) > 0 ||
          (cacheEntry?.metrics.morphTargets ?? 0) > 0
        )
      ) {
        physicsSelectionUnavailableReason =
          "리그·애니메이션 모델은 자세를 고정하거나 일반 소품 모델로 바꾼 뒤 사용하세요.";
        break;
      }
    }
  }
  if (!physicsSelectionUnavailableReason) {
    const unsupportedVisibleModel = customModels.find((model) => {
      if (!effectivelyVisibleLayerIds.has(model.id)) return false;
      const cacheEntry = modelRootCacheRef.current.get(model.modelId);
      return model.animation !== undefined || model.pose !== undefined || model.morph !== undefined ||
        model.constraints !== undefined || (cacheEntry?.metrics.skins ?? 0) > 0 ||
        (cacheEntry?.metrics.morphTargets ?? 0) > 0;
    });
    if (unsupportedVisibleModel) {
      physicsSelectionUnavailableReason =
        "보이는 리그·애니메이션·모프 모델은 현재 자세와 충돌체가 어긋날 수 있습니다. 해당 모델을 숨기거나 정적 소품으로 고정한 뒤 물리를 실행하세요.";
    }
  }
  const filteredLayerItems = filterStudioBg3dLayerItems(layerListItems, layerQuery);
  const ltLineSettings = sceneBaseDocument.output.line;
  const ltToneSettings = sceneBaseDocument.output.tone;
  const hasFilledOutput = ltToneSettings.mode !== "none" && ltToneSettings.opacity > 0;
  const appliedLtPreset = matchingLtPreset(
    ltLineSettings,
    ltToneSettings,
    ltUserPresetPayload,
    ltPreferredPresetId
  );
  const appliedLtPresetId = appliedLtPreset?.id ?? "custom";
  const appliedMoodRig = resolveStudioBg3dAppliedMoodRig(sceneBaseDocument);
  const managedLtUserPreset = ltManagedUserPresetId
    ? ltUserPresetPayload.presets.find((preset) => preset.id === ltManagedUserPresetId) ?? null
    : null;
  const ltExportAspectRatio = sceneBaseDocument.output.exportAspectRatio ?? null;
  // 세이프 프레임 오버레이와 라벨은 실제 캡처와 같은 식(같은 순수 함수)을 쓴다. 자동일 때만
  // 뷰포트 비율을 따르고, 고정 비율이면 패널 크기와 무관하게 같은 결과가 나온다.
  const ltCaptureSafeFrame = resolveStudioBg3dCaptureFrame({
    viewportWidth: viewportBoxSize?.width ?? deviceQuality.renderWidth,
    viewportHeight: viewportBoxSize?.height ?? deviceQuality.renderHeight,
    aspectRatio: ltExportAspectRatio,
  });
  const ltCaptureSizePreview = resolveStudioBg3dLtCaptureSize({
    sourceWidth: deviceQuality.renderWidth,
    sourceHeight: deviceQuality.renderHeight,
    ...(ltCaptureSafeFrame ? { aspectRatio: ltCaptureSafeFrame.aspectRatio } : {}),
    requestedHeight: sceneBaseDocument.output.exportHeight,
    maxPixels: Math.min(deviceQuality.maxRenderPixels, STUDIO_BG3D_LT_RENDER_MAX_PIXELS),
  });
  const ltDocumentAspectPreset = createStudioBg3dDocumentCaptureAspectPreset(
    documentCanvasSize?.width,
    documentCanvasSize?.height,
  );
  const ltCaptureAspectPresets = ltDocumentAspectPreset
    ? [
        STUDIO_BG3D_CAPTURE_ASPECT_PRESETS[0]!,
        ltDocumentAspectPreset,
        ...STUDIO_BG3D_CAPTURE_ASPECT_PRESETS.slice(1),
      ]
    : STUDIO_BG3D_CAPTURE_ASPECT_PRESETS;
  const ltCaptureAspectPresetId = matchStudioBg3dCaptureAspectPreset(
    ltExportAspectRatio,
    ltCaptureAspectPresets,
  );
  const ltCaptureAspectLabel = ltCaptureAspectPresets.find(
    (preset) => preset.id === ltCaptureAspectPresetId,
  )?.label ?? `${(ltExportAspectRatio ?? 1).toFixed(2)} : 1`;
  const hideOnTab = (tab: BgPanelTab) => activePanelTab !== tab;

  const cancelPhysicsAnimationFrame = () => {
    if (physicsAnimationFrameRef.current === null) return;
    cancelAnimationFrame(physicsAnimationFrameRef.current);
    physicsAnimationFrameRef.current = null;
  };

  const updatePhysicsProgress = (
    currentSeconds: number,
    durationSeconds: number,
    timestamp: number,
    force = false,
  ) => {
    if (!force && timestamp - physicsLastUiUpdateRef.current < 100) return;
    physicsLastUiUpdateRef.current = timestamp;
    setPhysicsCurrentSeconds(currentSeconds);
    setPhysicsProgress(durationSeconds > 0 ? currentSeconds / durationSeconds : 0);
    setPhysicsPreviewRevision((revision) => revision + 1);
  };

  const restorePhysicsInitialPose = (session = physicsSessionRef.current) => {
    if (!session || session.initialDynamicSamples.length === 0) return;
    projectStudioBg3dPhysicsSamples(session.initialDynamicSamples, primitiveObjectsRef.current);
  };

  const resetPhysicsPreview = (options: { readonly keepError?: boolean } = {}) => {
    physicsGenerationRef.current += 1;
    physicsAbortRef.current?.abort();
    physicsAbortRef.current = null;
    cancelPhysicsAnimationFrame();
    restorePhysicsInitialPose();
    physicsSessionRef.current = null;
    latestPhysicsSamplesRef.current = [];
    physicsPlaybackStartedAtRef.current = 0;
    physicsPlaybackOffsetRef.current = 0;
    physicsLastUiUpdateRef.current = 0;
    physicsLastFrameTimestampRef.current = 0;
    setPhysicsCurrentSeconds(0);
    setPhysicsProgress(0);
    setPhysicsPreviewRevision((revision) => revision + 1);
    if (!options.keepError) setPhysicsError(null);
    transitionPhysicsPhase(options.keepError ? "error" : "idle");
  };

  const failPhysicsPreview = (message: string) => {
    setPhysicsError(message);
    resetPhysicsPreview({ keepError: true });
  };

  const physicsPlaybackFrame = (timestamp: number) => {
    physicsAnimationFrameRef.current = null;
    if (physicsPhaseRef.current !== "running") return;
    const session = physicsSessionRef.current;
    if (!session) {
      failPhysicsPreview("물리 미리보기 세션을 복원하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    if (physicsPlaybackStartedAtRef.current < 0) physicsPlaybackStartedAtRef.current = timestamp;
    physicsLastFrameTimestampRef.current = timestamp;
    const elapsedSeconds = Math.max(0, (timestamp - physicsPlaybackStartedAtRef.current) / 1_000);
    const currentSeconds = Math.min(
      session.timeline.durationSeconds,
      physicsPlaybackOffsetRef.current + elapsedSeconds,
    );
    const samples = sampleStudioBg3dPhysicsTimeline(session.timeline, currentSeconds);
    if (!samples || !projectStudioBg3dPhysicsSamples(samples, primitiveObjectsRef.current)) {
      failPhysicsPreview("물리 결과를 현재 3D 오브젝트에 안전하게 표시하지 못했습니다.");
      return;
    }
    latestPhysicsSamplesRef.current = samples;
    updatePhysicsProgress(
      currentSeconds,
      session.timeline.durationSeconds,
      timestamp,
      currentSeconds >= session.timeline.durationSeconds,
    );
    if (currentSeconds >= session.timeline.durationSeconds) {
      physicsPlaybackOffsetRef.current = session.timeline.durationSeconds;
      transitionPhysicsPhase("complete");
      return;
    }
    physicsAnimationFrameRef.current = requestAnimationFrame(physicsPlaybackFrame);
  };

  const startPhysicsPlayback = (session: StudioBg3dPhysicsSession, offsetSeconds = 0) => {
    cancelPhysicsAnimationFrame();
    const safeOffset = Math.min(session.timeline.durationSeconds, Math.max(0, offsetSeconds));
    physicsPlaybackOffsetRef.current = safeOffset;
    physicsPlaybackStartedAtRef.current = -1;
    physicsLastUiUpdateRef.current = 0;
    transitionPhysicsPhase("running");
    physicsAnimationFrameRef.current = requestAnimationFrame(physicsPlaybackFrame);
  };

  const pausePhysicsPreview = () => {
    if (physicsPhaseRef.current !== "running") return;
    const session = physicsSessionRef.current;
    if (!session) return;
    const now = physicsLastFrameTimestampRef.current;
    physicsPlaybackOffsetRef.current = Math.min(
      session.timeline.durationSeconds,
      physicsPlaybackOffsetRef.current +
        Math.max(0, (now - physicsPlaybackStartedAtRef.current) / 1_000),
    );
    cancelPhysicsAnimationFrame();
    updatePhysicsProgress(
      physicsPlaybackOffsetRef.current,
      session.timeline.durationSeconds,
      now,
      true,
    );
    transitionPhysicsPhase("paused");
  };

  const resumePhysicsPreview = () => {
    const session = physicsSessionRef.current;
    if (!session || (physicsPhaseRef.current !== "paused" && physicsPhaseRef.current !== "complete")) {
      return;
    }
    const offset = physicsPhaseRef.current === "complete" ? 0 : physicsPlaybackOffsetRef.current;
    if (offset === 0) {
      const initial = sampleStudioBg3dPhysicsTimeline(session.timeline, 0);
      if (!initial || !projectStudioBg3dPhysicsSamples(initial, primitiveObjectsRef.current)) {
        failPhysicsPreview("물리 미리보기의 시작 자세를 복원하지 못했습니다.");
        return;
      }
      latestPhysicsSamplesRef.current = initial;
      updatePhysicsProgress(0, session.timeline.durationSeconds, physicsLastFrameTimestampRef.current, true);
    }
    startPhysicsPlayback(session, offset);
  };

  const startPhysicsPreview = async () => {
    if (
      captureInFlightRef.current || isCapturing || isRestoringScene ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
    if (selectedIds.size === 0 || physicsSelectionUnavailableReason) {
      setPhysicsError(physicsSelectionUnavailableReason ?? "움직일 오브젝트를 먼저 선택하세요.");
      transitionPhysicsPhase("error");
      return;
    }

    const sourceToken = createStudioBg3dPhysicsSessionSourceToken({
      primitives,
      customModels,
      document: sceneBaseDocument,
    });
    if (!sourceToken) {
      setPhysicsError("현재 장면 상태를 물리 세션과 원자적으로 연결하지 못했습니다.");
      transitionPhysicsPhase("error");
      return;
    }

    const adaptation = tryAdaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: sceneBaseDocument,
    });
    if (!adaptation.ok) {
      setPhysicsError("현재 장면이 안전 예산을 초과해 물리 미리보기를 시작하지 않았습니다.");
      transitionPhysicsPhase("error");
      return;
    }
    const adapted = adaptation.value;
    if (
      adapted.diagnostics.length > 0 || adapted.omittedDiagnosticCount > 0 ||
      adapted.counts.droppedPrimitives > 0 || adapted.counts.droppedCustomModels > 0 ||
      adapted.counts.emittedPrimitives !== primitives.length ||
      adapted.counts.emittedCustomModels !== customModels.length
    ) {
      setPhysicsError("장면 원본을 손실 없이 준비하지 못해 물리 미리보기를 시작하지 않았습니다.");
      transitionPhysicsPhase("error");
      return;
    }
    const localWorld = createStudioBg3dPhysicsWorld(adapted.document, selectedIds);
    const modelLocalBoundsByNodeId = new Map(
      customModels.flatMap((model) => {
        const cachedRoot = modelRootCacheRef.current.get(model.modelId)?.root;
        const bounds = cachedRoot
          ? measureStudioBg3dPhysicsModelLocalBounds(cachedRoot)
          : null;
        return bounds ? [[model.id, bounds] as const] : [];
      }),
    );
    const physicsJob = localWorld
      ? createStudioBg3dPhysicsThreeJob(
          adapted.document,
          localWorld,
          modelLocalBoundsByNodeId,
        )
      : null;
    if (!physicsJob) {
      setPhysicsError("선택한 오브젝트의 계층·잠금·변형을 물리 장면으로 안전하게 변환하지 못했습니다.");
      transitionPhysicsPhase("error");
      return;
    }

    const generation = physicsGenerationRef.current + 1;
    physicsGenerationRef.current = generation;
    physicsAbortRef.current?.abort();
    const abortController = new AbortController();
    physicsAbortRef.current = abortController;
    physicsSessionRef.current = null;
    latestPhysicsSamplesRef.current = [];
    setPhysicsError(null);
    setError(null);
    setPhysicsCurrentSeconds(0);
    setPhysicsProgress(0);
    transitionPhysicsPhase("loading");

    try {
      // Literal import keeps Rapier, its Worker, and WASM outside the 3D editor's initial chunk.
      const {
        createStudioBg3dPhysicsTimelineWorkerSession,
      } = await import("./studio-bg3d-physics-worker-client");
      if (
        abortController.signal.aborted || generation !== physicsGenerationRef.current ||
        !componentActiveRef.current
      ) return;
      const workerSession = physicsWorkerSessionRef.current ??
        createStudioBg3dPhysicsTimelineWorkerSession();
      physicsWorkerSessionRef.current = workerSession;
      const timeline = await workerSession.run({
        world: physicsJob.world,
        initialPoses: physicsJob.initialPoses,
        durationSeconds: physicsDurationSeconds,
        gravity: STUDIO_BG3D_PHYSICS_GRAVITY[physicsGravityPreset],
        ground: physicsGroundEnabled
          ? { y: 0, friction: 0.75, restitution: 0.08 }
          : null,
      }, {
        signal: abortController.signal,
        timeoutMs: 15_000,
      });
      if (
        abortController.signal.aborted || generation !== physicsGenerationRef.current ||
        !componentActiveRef.current
      ) return;
      if (!isStudioBg3dPhysicsSessionSourceCurrent(
        sourceToken,
        physicsRuntimeSourceRef.current,
      )) {
        failPhysicsPreview("물리 계산 중 장면이 변경되어 오래된 결과를 폐기했습니다. 다시 실행해 주세요.");
        return;
      }
      const initialDynamicSamples = sampleStudioBg3dPhysicsTimeline(timeline, 0);
      if (!initialDynamicSamples) {
        throw new Error("invalid-initial-physics-sample");
      }
      const session: StudioBg3dPhysicsSession = Object.freeze({
        document: adapted.document,
        world: physicsJob.world,
        timeline,
        initialDynamicSamples,
        sourceToken,
      });
      physicsSessionRef.current = session;
      latestPhysicsSamplesRef.current = initialDynamicSamples;
      if (!projectStudioBg3dPhysicsSamples(initialDynamicSamples, primitiveObjectsRef.current)) {
        throw new Error("physics-projection-unavailable");
      }
      startPhysicsPlayback(session);
    } catch (caught) {
      if (generation !== physicsGenerationRef.current || abortController.signal.aborted) return;
      console.error("Studio BG3D physics preview failed", caught);
      failPhysicsPreview(
        typeof Worker !== "function"
          ? "이 브라우저는 격리된 물리 Worker를 지원하지 않습니다. 최신 브라우저에서 다시 시도해 주세요."
          : "물리 엔진을 준비하거나 계산하지 못했습니다. 오브젝트 수를 줄이고 다시 시도해 주세요.",
      );
    } finally {
      if (physicsAbortRef.current === abortController) physicsAbortRef.current = null;
    }
  };

  const handleStartPhysicsPreview = () => {
    shouldTransferPhysicsFocusRef.current = true;
    void startPhysicsPreview();
  };

  const bakePhysicsPreview = () => {
    if (
      physicsPhaseRef.current !== "paused" && physicsPhaseRef.current !== "complete" &&
      physicsPhaseRef.current !== "running"
    ) return;
    const session = physicsSessionRef.current;
    const samples = latestPhysicsSamplesRef.current;
    if (!session || samples.length === 0) return;
    if (!isStudioBg3dPhysicsSessionSourceCurrent(
      session.sourceToken,
      physicsRuntimeSourceRef.current,
    )) {
      failPhysicsPreview("물리 미리보기 시작 뒤 장면이 변경되어 현재 자세를 적용하지 않았습니다.");
      return;
    }
    const currentRuntimeSource = physicsRuntimeSourceRef.current;
    cancelPhysicsAnimationFrame();
    transitionPhysicsPhase("baking");
    const bakedDocument = applyStudioBg3dPhysicsTransforms(
      session.document,
      samples,
      session.world,
    );
    const hydrated = bakedDocument
      ? hydrateStudioBg3dDocumentToRuntime({
          document: bakedDocument,
          storageModelIdByAttachmentId: storageModelIdByAttachmentIdRef.current,
        })
      : null;
    if (
      !bakedDocument || !hydrated || !hydrated.ok || hydrated.diagnostics.length > 0 ||
      hydrated.omittedDiagnosticCount > 0 ||
      hydrated.counts.droppedPrimitives > 0 || hydrated.counts.droppedCustomModels > 0 ||
      hydrated.primitives.length !== currentRuntimeSource.primitives.length ||
      hydrated.customModels.length !== currentRuntimeSource.customModels.length
    ) {
      failPhysicsPreview("현재 물리 자세를 장면 문서에 손실 없이 적용하지 못했습니다.");
      return;
    }
    physicsGenerationRef.current += 1;
    physicsSessionRef.current = null;
    latestPhysicsSamplesRef.current = [];
    physicsPlaybackOffsetRef.current = 0;
    commitImmediateHistoryTransition(
      hydrated.primitives,
      hydrated.customModels,
      bakedDocument,
      createStudioBg3dHistorySnapshot(currentRuntimeSource),
    );
    setPrimitives(hydrated.primitives);
    setCustomModels(hydrated.customModels);
    setSceneBaseDocument(bakedDocument);
    setPhysicsCurrentSeconds(0);
    setPhysicsProgress(0);
    setPhysicsError(null);
    setPhysicsPreviewRevision((revision) => revision + 1);
    transitionPhysicsPhase("idle");
  };

  const runBabylonDiagnostic = async (
    backend: StudioBg3dBabylonDiagnosticBackend,
  ): Promise<void> => {
    const generation = babylonDiagnosticGenerationRef.current + 1;
    babylonDiagnosticGenerationRef.current = generation;
    babylonDiagnosticAbortRef.current?.abort();
    const controller = new AbortController();
    babylonDiagnosticAbortRef.current = controller;
    setBabylonDiagnosticState({ status: "loading", backend });

    let runtime: StudioBg3dRuntimeAdapter | null = null;
    const startedAt = performance.now();
    try {
      const entry = await loadStudioBg3dBabylonSpecialistEntry();
      if (controller.signal.aborted) return;

      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      runtime = entry.createStudioBg3dBabylonSpecialist({
        canvas,
        backend,
        // Diagnostics should report software/headless support truthfully. Real capture retains the
        // runtime's strict hardware-quality default and therefore still fails major caveats closed.
        settings: { failIfMajorPerformanceCaveat: false },
      });
      const snapshot = createStudioBg3dRuntimeSnapshot(
        createStudioBg3dBabylonDiagnosticDocument(),
        new Map(),
      );
      const diagnosticId = `babylon-diagnostic-${backend}-${Date.now()}-${generation}`;
      const metricsResult = await runtime.runIsolated({
        id: `${diagnosticId}-metrics`,
        snapshot,
        request: { kind: "runtime-metrics" },
        signal: controller.signal,
      });
      if (controller.signal.aborted || generation !== babylonDiagnosticGenerationRef.current) {
        return;
      }
      if (
        metricsResult.kind !== "metrics" ||
        metricsResult.values.backend !== backend ||
        metricsResult.values.engine !== "babylon" ||
        metricsResult.values.initialized !== true
      ) {
        throw new Error("Unexpected Babylon diagnostic receipt.");
      }
      const captureResult = await runtime.runIsolated({
        id: `${diagnosticId}-beauty-depth-normal-stable-id`,
        snapshot,
        request: {
          kind: "artifact-capture-v2",
          version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION,
          width: 64,
          height: 64,
          artifacts: [
            { kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE },
            { kind: "depth", profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE },
            { kind: "normal", profile: STUDIO_BG3D_NORMAL_PROFILE },
            { kind: "object-id", profile: STUDIO_BG3D_STABLE_ID_PROFILE },
            { kind: "material-id", profile: STUDIO_BG3D_STABLE_ID_PROFILE },
          ],
        },
        signal: controller.signal,
      });
      const normalizedCapture = normalizeStudioBg3dArtifactCaptureResultV2(captureResult);
      const beauty = normalizedCapture?.artifacts.find((artifact) =>
        artifact.kind === "beauty"
      );
      const depth = normalizedCapture?.artifacts.find((artifact) =>
        artifact.kind === "depth"
      );
      const normal = normalizedCapture?.artifacts.find((artifact) =>
        artifact.kind === "normal"
      );
      const objectId = normalizedCapture?.artifacts.find((artifact) =>
        artifact.kind === "object-id"
      );
      const materialId = normalizedCapture?.artifacts.find((artifact) =>
        artifact.kind === "material-id"
      );
      if (
        !normalizedCapture ||
        normalizedCapture.width !== 64 ||
        normalizedCapture.height !== 64 ||
        !beauty ||
        beauty.data.byteLength !== 64 * 64 * 4 ||
        !depth ||
        depth.data.length !== 64 * 64 ||
        !normal ||
        normal.data.length !== 64 * 64 * 2 ||
        !objectId ||
        objectId.data.length !== 64 * 64 ||
        !materialId ||
        materialId.data.length !== 64 * 64 ||
        !hasStudioBg3dBabylonDiagnosticDepthVariation(depth.data) ||
        !hasStudioBg3dBabylonDiagnosticNormalVariation(normal.data, depth.data) ||
        !hasStudioBg3dBabylonDiagnosticBeautyVariation(beauty.data) ||
        !hasStudioBg3dBabylonDiagnosticStableIds(
          objectId.data,
          objectId.legend,
          "obj/babylon-diagnostic-box",
          "Babylon diagnostic box",
        ) ||
        !hasStudioBg3dBabylonDiagnosticStableIds(
          materialId.data,
          materialId.legend,
          "mat/babylon-diagnostic-box/primitive",
          "Babylon diagnostic box · 기본 재질",
        )
      ) {
        throw new Error(
          "Unexpected Babylon beauty/depth/normal/object/material capture.",
        );
      }
      if (
        !componentActiveRef.current ||
        controller.signal.aborted ||
        generation !== babylonDiagnosticGenerationRef.current
      ) {
        return;
      }
      setBabylonDiagnosticState({
        status: "success",
        backend,
        durationMs: performance.now() - startedAt,
      });
    } catch (diagnosticError) {
      if (!componentActiveRef.current) return;
      if (generation !== babylonDiagnosticGenerationRef.current) return;
      if (controller.signal.aborted) {
        setBabylonDiagnosticState({ status: "idle", backend: null });
        return;
      }
      setBabylonDiagnosticState({
        status: "error",
        backend,
        message: studioBg3dBabylonDiagnosticErrorMessage(backend, diagnosticError),
      });
    } finally {
      try {
        await runtime?.dispose();
      } catch {
        // The diagnostic receipt has already been decided; disposal failure must not affect Three.
      }
      if (babylonDiagnosticAbortRef.current === controller) {
        babylonDiagnosticAbortRef.current = null;
      }
    }
  };

  const pausePhysicsWhenHidden = useEffectEvent(() => pausePhysicsPreview());
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") pausePhysicsWhenHidden();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [open]);

  // 저장소 로드 뒤 현재 장면과 정확히 일치하는 사용자 프리셋이 있으면 관리 폼도 그 항목을 따른다.
  // 수동 조정으로 사용자 설정 상태가 된 뒤에는 ltManagedUserPresetId를 유지해 "현재 값으로 업데이트"
  // 작업이 끊기지 않게 한다.
  useEffect(() => {
    if (!open || ltManagedUserPresetId || !appliedLtPreset) return;
    const exactUserPreset = ltUserPresetPayload.presets.find(
      (preset) => preset.id === appliedLtPreset.id
    );
    if (!exactUserPreset) return;
    setLtManagedUserPresetId(exactUserPreset.id);
    setLtUserPresetName(exactUserPreset.name);
    setLtUserPresetDescription(exactUserPreset.description);
  }, [appliedLtPreset, ltManagedUserPresetId, ltUserPresetPayload, open]);

  if (!open && !webXrRendererLifetimeRetained) return null;

  const placementActive =
    placementSession.phase === "preview" && placementPreviewAsset !== null;
  const immersiveSceneActive = immersiveStagePlan !== null;
  const immersiveTransitionActive = webXrSessionState.status === "requesting"
    || webXrSessionState.status === "presenting"
    || webXrSessionState.status === "ending";
  // Capture renders the main View's virtual Scene/Camera into an offscreen target, so the quad
  // topology can remain intact. Keeping this View mounted prevents linked VRMs, wardrobe, props,
  // auto-grip, and their post-commit readiness generation from restarting during capture.
  const effectiveIsQuadView = isQuadView
    && !physicsInteractionLocked
    && !placementActive
    && !immersiveSceneActive;
  const mainViewTrackRef = effectiveIsQuadView ? viewPerspRef : viewportHostRef;
  const bg3dFrameLoop = immersiveSceneActive
    ? "always"
    : resolveStudioBg3dFrameLoop({
        modelAnimationPlaying: customModels.some((model) => model.animation?.playing === true),
        physicsPlaying: physicsPhase === "running",
        transforming: isTransforming,
        capturing: isCapturing,
        batchRendering: isBatchRenderingShots,
      });
  const isMainOrtho = sceneBaseDocument.camera.projection === "orthographic";
  const currentFocalLengthMm = Math.round(
    studioBg3dFovDegreesToFocalLength(sceneBaseDocument.camera.fovDegrees),
  );
  const twoPointPerspectiveActive =
    isStudioBg3dTwoPointPerspectiveActive(sceneBaseDocument.camera) &&
    Math.abs(readStudioBg3dCameraDutchRollDegrees(sceneBaseDocument.camera)) < 0.5;
  const sunLightState = resolveStudioBg3dSunLightState(sunRigConfig.timeOfDayHours);
  const selectedSky = getSkyPreset(skyPresetId);
  const panoramaRotation = normalizePanoramaRotationDegrees(
    sceneBaseDocument.background.panoramaRotation,
  );
  const renderedSkyPresetId = captureBackgroundSnapshot?.skyPresetId ?? skyPresetId;
  const renderedPanoramaRotation =
    captureBackgroundSnapshot?.panoramaRotation ?? panoramaRotation;
  const renderedBackgroundSettings =
    captureBackgroundSnapshot?.background ?? sceneBaseDocument.background;
  const fogNear = sceneBaseDocument.background.fogNear ?? 10;
  const fogFar = Math.max(
    fogNear + STUDIO_BG3D_FOG_MIN_GAP,
    sceneBaseDocument.background.fogFar ?? 50,
  );
  const fogSliderMax = Math.max(
    120,
    Math.ceil(Math.max(fogNear + STUDIO_BG3D_FOG_MIN_GAP, fogFar) / 10) * 10,
  );

  const selectSceneEntity = (id: string, isMulti: boolean) => {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    setSelectedSharedCharacterElementId(null);
    setSelectedIds((previous) => {
      if (!isMulti) return new Set([id]);
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const updateModelCloneStatuses = (
    ids: readonly string[],
    status: "pending" | "ready" | "failed",
  ) => {
    setReadyCloneIds((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (status === "ready") next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setFailedCloneIds((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (status === "failed") next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const primitiveById = new Map(primitives.map((primitive) => [primitive.id, primitive] as const));
  const customModelById = new Map(customModels.map((model) => [model.id, model] as const));
  const sharedCharacterGroundSurfaceRevision =
    createStudioBg3dSharedCharacterGroundSurfaceRevision({
      primitives,
      customModels,
      readyCloneIds,
    });
  const batchCandidatesByModelId = new Map<string, BgCustomModelInstance[]>();
  for (const model of customModels) {
    const cacheEntry = modelRootCacheRef.current.get(model.modelId);
    if (
      !cacheEntry || unbatchableModelIds.has(model.modelId) || !isBgObjectVisible(model) ||
      selectedIds.has(model.id) || (sceneHierarchy.parentById.get(model.id) ?? null) !== null ||
      (sceneHierarchy.childrenByParent.get(model.id)?.length ?? 0) > 0 ||
      model.materialOverride !== undefined || model.animation !== undefined || model.pose !== undefined ||
      model.morph !== undefined || model.constraints !== undefined ||
      cacheEntry.metrics.skins > 0 || cacheEntry.metrics.morphTargets > 0 || cacheEntry.metrics.lights > 0 ||
      model.scale.some((component) => component <= 0)
    ) continue;
    const candidates = batchCandidatesByModelId.get(model.modelId) ?? [];
    candidates.push(model);
    batchCandidatesByModelId.set(model.modelId, candidates);
  }
  const staticModelBatches: {
    readonly key: string;
    readonly modelId: string;
    readonly sourceRoot: THREE.Object3D;
    readonly instances: readonly BgCustomModelInstance[];
  }[] = [];
  const batchedNodeIds = new Set<string>();
  for (const [modelId, candidates] of batchCandidatesByModelId) {
    const sourceRoot = modelRootCacheRef.current.get(modelId)?.root;
    if (!sourceRoot) continue;
    for (let offset = 0; offset < candidates.length; offset += 1_024) {
      const instances = candidates.slice(offset, offset + 1_024);
      if (instances.length < 3) continue;
      const key = instances.map((instance) => [
        instance.id,
        ...instance.position,
        ...instance.rotation,
        ...instance.scale,
      ].join(":")).join("|");
      staticModelBatches.push({ key, modelId, sourceRoot, instances });
      for (const instance of instances) batchedNodeIds.add(instance.id);
    }
  }
  const renderSceneEntity = (id: string): React.ReactNode => {
    if (batchedNodeIds.has(id)) return null;
    const children = (sceneHierarchy.childrenByParent.get(id) ?? []).map(renderSceneEntity);
    const primitive = primitiveById.get(id);
    if (primitive) {
      return (
        <BgPrimitiveMesh
          key={id}
          prim={primitive}
          geometryPool={primitiveGeometryPool}
          lineArt={lineArtPreview}
          showEdges={!isCapturing}
          selected={selectedIds.has(id)}
          onSelect={selectSceneEntity}
          onSurfacePick={handleSurfaceSnapPick}
          onSurfacePreview={
            measurementActive ? handleMeasurementSurfacePreview : undefined
          }
          registerRef={registerPrimitiveRef}
        >
          {children}
        </BgPrimitiveMesh>
      );
    }
    const instance = customModelById.get(id);
    if (!instance) return null;
    return (
      <BgCustomModelMesh
        key={id}
        instance={instance}
        cachedRoot={modelRootCacheRef.current.get(instance.modelId)?.root}
        animations={modelRootCacheRef.current.get(instance.modelId)?.animations ?? EMPTY_THREE_ANIMATION_CLIPS}
        selected={selectedIds.has(id)}
        capturing={isCapturing}
        targetFps={deviceQuality.targetFps}
        lodBias={deviceQuality.lodBias}
        onSelect={selectSceneEntity}
        onSurfacePick={handleSurfaceSnapPick}
        onSurfacePreview={
          measurementActive ? handleMeasurementSurfacePreview : undefined
        }
        registerRef={registerPrimitiveRef}
        registerAnimationTime={registerModelAnimationTime}
        registerRigBake={registerModelRigBake}
        onAnimationComplete={finishModelAnimation}
        onCloneStatus={updateModelCloneStatuses}
      >
        {children}
      </BgCustomModelMesh>
    );
  };

  const sharedCharacterSceneContent = (
    <StudioBg3dSharedCharacterSceneContent
      characters={sharedCharacters}
      includeInCapture={includeSharedCharactersInCapture}
      groundingResults={sharedCharacterGroundings}
      surfaceRevision={sharedCharacterGroundSurfaceRevision}
      selectedElementId={effectiveSelectedSharedCharacterElementId}
      onSelect={(elementId) => {
        setSelectedSharedCharacterElementId(elementId);
        setSelectedIds(new Set());
        setActivePanelTab("layers");
      }}
      onStatus={updateSharedCharacterStatusWithCaptureFence}
      onGrounding={updateSharedCharacterGrounding}
    />
  );

  const shadowSceneBounds = collectStudioBg3dShadowSceneBounds([
    ...primitives.map((primitive) => ({
      id: primitive.id,
      parentId: primitive.parentId,
      position: primitive.position,
      rotation: primitive.rotation,
      scale: primitive.scale,
      visible: primitive.visible,
      localBounds: readStudioBg3dShadowGeometryLocalBounds(
        primitiveGeometryPool.get(primitive.kind).geometry,
      ),
    })),
    ...customModels.map((model) => ({
      id: model.id,
      parentId: model.parentId,
      position: model.position,
      rotation: model.rotation,
      scale: model.scale,
      visible: model.visible,
      localBounds: readStudioBg3dShadowModelLocalBounds(
        modelRootCacheRef.current.get(model.modelId)?.root,
      ),
    })),
    ...sharedCharacters.map(createStudioShared3dCharacterShadowEntity),
  ]);
  const shadowMapSize = deviceQuality.shadowMapSize || 1_024;
  const keyShadowFit = fitStudioBg3dDirectionalShadowFrustum({
    bounds: shadowSceneBounds.bounds,
    boundsWereClamped: shadowSceneBounds.clamped,
    direction: sceneBaseDocument.lighting.key.direction,
    focus: sceneBaseDocument.camera.target,
    groundY: 0,
    mapSize: shadowMapSize,
  });
  const fillShadowFit = fitStudioBg3dDirectionalShadowFrustum({
    bounds: shadowSceneBounds.bounds,
    boundsWereClamped: shadowSceneBounds.clamped,
    direction: sceneBaseDocument.lighting.fill.direction,
    focus: sceneBaseDocument.camera.target,
    groundY: 0,
    mapSize: shadowMapSize,
  });

  const webXrDisabledReason = !webXrController
    ? "기존 Three.js 렌더러의 WebXR 연결을 준비하는 중입니다."
    : sceneRecoveryError
      ? "3D 장면 복원 오류를 해결한 뒤 AR·VR 미리보기를 열어 주세요."
      : hasCloneFailure || hasUnavailableSharedCharacter
        ? "불러오지 못한 3D 모델이 있어 모든 공간 경계를 검증할 수 없습니다."
        : hasPendingClone || hasPendingSharedCharacter
          ? "모든 3D 모델과 캐릭터가 표시될 때까지 기다려 주세요."
          : isCapturing || isBatchRenderingShots || captureInFlightRef.current
            ? "3D 캡처나 컷 배치 출력이 끝난 뒤 AR·VR 미리보기를 열어 주세요."
            : isRestoringScene
              ? "3D 장면 복원이 끝난 뒤 AR·VR 미리보기를 열어 주세요."
              : isUploadingModel || applyingTemplateId !== null || deletingModelId !== null
                || isSavingTemplate
                ? "3D 에셋 작업이 끝난 뒤 AR·VR 미리보기를 열어 주세요."
                : physicsInteractionLocked
                  ? "물리 미리보기를 적용하거나 초기화한 뒤 AR·VR 미리보기를 열어 주세요."
                  : isTransforming || placementActive || measurementActive || surfaceSnapArmed
                    ? "현재 배치·측정·변형 도구를 마친 뒤 AR·VR 미리보기를 열어 주세요."
                    : destructiveMutationGuardRef.current.blocksClose
                      ? "진행 중인 3D 변경을 마친 뒤 AR·VR 미리보기를 열어 주세요."
                      : shadowSceneBounds.includedEntityCount === 0
                        ? "몰입형 미리보기에 표시할 3D 오브젝트가 없습니다."
                        : shadowSceneBounds.clamped || shadowSceneBounds.rejectedEntityCount > 0
                          ? "일부 3D 오브젝트의 실제 공간 경계를 확인하지 못했습니다."
                          : null;

  const startStudioBg3dWebXr = (mode: StudioWebXrMode) => {
    const controller = webXrControllerRef.current;
    if (!controller || webXrDisabledReason || immersiveTransitionActive) return;
    if (captureInFlightRef.current || destructiveMutationGuardRef.current.blocksClose) return;
    const currentScene = readCurrentCanonicalSceneForShot();
    if (!currentScene) return;
    const plannedStage = planStudioBg3dImmersiveStage({
      mode,
      sceneBounds: shadowSceneBounds,
      camera: currentScene.camera,
    });
    if (!plannedStage.ok) {
      setError(studioBg3dImmersiveStageFailureMessage(plannedStage.reason));
      return;
    }

    webXrRestoreCameraRef.current = currentScene.camera;
    flushSync(() => {
      setIsQuadView(false);
      setActivePanelTab("view");
      setImmersiveStagePlan(plannedStage);
      setError(null);
    });
    void controller.start(mode).catch(() => {
      if (webXrControllerRef.current !== controller) return;
      const restoreCamera = webXrRestoreCameraRef.current;
      if (restoreCamera) pendingInitialCameraRef.current = restoreCamera;
      webXrRestoreCameraRef.current = null;
      setImmersiveStagePlan(null);
    });
  };

  const endStudioBg3dWebXr = () => {
    void webXrControllerRef.current?.end();
  };
  
  const sceneContent = (
    <Fragment>
      <StudioBg3dWebglRenderSettingsController render={sceneBaseDocument.render} />
      <SkyClearColorController
        clearColor={immersiveStagePlan?.mode === "immersive-ar"
          ? "#000000"
          : getSkyPreset(renderedSkyPresetId).clearColor}
        alpha={immersiveStagePlan?.mode === "immersive-ar" ? 0 : 1}
      />
      {immersiveStagePlan?.mode !== "immersive-ar" ? (
        <Fragment>
          <StudioBg3dScenePanorama
            presetId={renderedSkyPresetId}
            rotationDegrees={renderedPanoramaRotation}
          />
          <StudioBg3dSceneFog background={renderedBackgroundSettings} />
        </Fragment>
      ) : null}
      <ambientLight
        color={sceneBaseDocument.lighting.ambientColor}
        intensity={sceneBaseDocument.lighting.ambientIntensity}
      />
      <StudioBg3dDirectionalShadowLight
        fit={keyShadowFit}
        castShadow={
          immersiveStagePlan?.mode !== "immersive-ar"
          && deviceQuality.shadows
          && sceneBaseDocument.lighting.key.castsShadow
        }
        color={sceneBaseDocument.lighting.key.color}
        intensity={sceneBaseDocument.lighting.key.intensity}
        radius={1.5}
      />
      <StudioBg3dDirectionalShadowLight
        fit={fillShadowFit}
        castShadow={
          immersiveStagePlan?.mode !== "immersive-ar"
          && deviceQuality.shadows
          && sceneBaseDocument.lighting.fill.castsShadow
        }
        color={sceneBaseDocument.lighting.fill.color}
        intensity={sceneBaseDocument.lighting.fill.intensity}
        radius={1.25}
      />
      <BgGroundHelper visible={!immersiveSceneActive && !lineArtPreview && !isCapturing} />
      {!immersiveSceneActive ? <BgSectionPlaneController state={sectionPlane} /> : null}
      <BgScaleGuide visible={!immersiveSceneActive && scaleGuideVisible && !isCapturing} />
      {!immersiveSceneActive ? (
        <StudioBg3dMeasurementViewport
          active={measurementActive && !effectiveIsQuadView}
          capturing={isCapturing}
          document={measurementDocument}
          draftMeasurement={measurementDraft}
          startWorld={measurementStartWorld}
          onPointPick={pickMeasurementPoint}
          onPointPreview={updateMeasurementPreview}
        />
      ) : null}
      {!immersiveSceneActive && placementSession.phase === "preview" && placementPreviewAsset ? (
        <BgPlacementPreview asset={placementPreviewAsset} preview={placementSession} />
      ) : null}
      {staticModelBatches.map((batch) => (
        <BgCustomModelInstanceBatch
          key={`${batch.modelId}:${batch.key}`}
          batchKey={batch.key}
          sourceRoot={batch.sourceRoot}
          instances={batch.instances}
          onSelect={selectSceneEntity}
          onSurfacePick={handleSurfaceSnapPick}
          onSurfacePreview={
            measurementActive ? handleMeasurementSurfacePreview : undefined
          }
          onCloneStatus={updateModelCloneStatuses}
          onUnavailable={() => {
            setUnbatchableModelIds((current) => new Set(current).add(batch.modelId));
          }}
        />
      ))}
      {sceneHierarchy.roots.map(renderSceneEntity)}
      {!immersiveSceneActive &&
      !isCapturing &&
      !physicsInteractionLocked &&
      !surfaceSnapArmed &&
      !measurementActive &&
      !placementActive &&
      firstSelectedId &&
      !selectedIsLocked &&
      effectivelyVisibleLayerIds.has(firstSelectedId) &&
      primitiveObjectsRef.current.get(firstSelectedId) ? (
        <group ref={registerStudioBg3dCaptureExcludedObject}>
          <TransformControls
            object={primitiveObjectsRef.current.get(firstSelectedId)}
            mode={transformMode}
            space={transformSpace}
            onMouseDown={() => {
              setIsTransforming(true);
              if (!firstSelectedId) return;
              const firstObj = primitiveObjectsRef.current.get(firstSelectedId);
              if (firstObj) {
                firstObj.updateWorldMatrix(true, false);
                dragInitialFirstTransformRef.current = {
                  worldMatrix: firstObj.matrixWorld.clone(),
                };
              }
              dragInitialSelectedTransformsRef.current.clear();
              for (const id of selectedIds) {
                const obj = primitiveObjectsRef.current.get(id);
                if (obj) {
                  obj.updateWorldMatrix(true, false);
                  dragInitialSelectedTransformsRef.current.set(id, {
                    worldMatrix: obj.matrixWorld.clone(),
                  });
                }
              }
            }}
            onMouseUp={() => {
              setIsTransforming(false);
              if (!snapSettings.enabled) return;
              applyMultiSelectDelta(true);
            }}
            onObjectChange={() => {
              applyMultiSelectDelta(false);
            }}
          />
        </group>
      ) : null}
    </Fragment>
  );

  const mainCameraNearClip = resolveStudioBg3dCameraNearClip(
    sceneBaseDocument.camera.nearClip,
  );
  const { farClip: mainCameraFarClip, maxOrbitDistance: mainCameraMaxOrbitDistance } =
    resolveStudioBg3dCameraDistanceLimits(
      sceneBaseDocument.camera.position, sceneBaseDocument.camera.target,
    );
  const mainCameraUp = resolveStudioBg3dCameraUpVector(sceneBaseDocument.camera);
  const applyLensShift = (c: THREE.PerspectiveCamera | THREE.OrthographicCamera) => {
    c.near = mainCameraNearClip;
    c.up.set(mainCameraUp[0], mainCameraUp[1], mainCameraUp[2]);
    if (sceneBaseDocument.camera.lensShift) {
      const [sx, sy] = sceneBaseDocument.camera.lensShift;
      if (sx === 0 && sy === 0) {
        c.clearViewOffset();
      } else {
        c.setViewOffset(1000, 1000, sx * 1000, sy * 1000, 1000, 1000);
      }
    } else {
      if (c.view !== null) c.clearViewOffset();
    }
    c.updateProjectionMatrix();
  };

  const mainCameraNode = isMainOrtho ? (
    <OrthographicCamera
      makeDefault
      position={[...sceneBaseDocument.camera.position]}
      zoom={sceneBaseDocument.camera.zoom ?? 1}
      near={mainCameraNearClip}
      far={mainCameraFarClip}
      onUpdate={applyLensShift}
    />
  ) : (
    <PerspectiveCamera
      makeDefault
      fov={sceneBaseDocument.camera.fovDegrees}
      position={[...sceneBaseDocument.camera.position]}
      zoom={sceneBaseDocument.camera.zoom ?? 1}
      near={mainCameraNearClip}
      far={mainCameraFarClip}
      onUpdate={applyLensShift}
    />
  );

  const immersiveCameraNode = immersiveStagePlan ? (
    <group
      key={`studio-bg3d-xr-camera-${immersiveStagePlan.mode}`}
      position={[...immersiveStagePlan.cameraRigTransform.position]}
      quaternion={[...immersiveStagePlan.cameraRigTransform.quaternion]}
      scale={immersiveStagePlan.cameraRigTransform.uniformScale}
    >
      <PerspectiveCamera
        makeDefault
        fov={sceneBaseDocument.camera.fovDegrees}
        position={[0, 0, 0]}
        near={immersiveStagePlan.mode === "immersive-ar" ? 0.01 : mainCameraNearClip}
        far={mainCameraFarClip}
      />
    </group>
  ) : null;

  const mainScenePresentationNode = (
    <group
      position={immersiveStagePlan
        ? [...immersiveStagePlan.stageRootTransform.position]
        : [0, 0, 0]}
      quaternion={immersiveStagePlan
        ? [...immersiveStagePlan.stageRootTransform.quaternion]
        : [0, 0, 0, 1]}
      scale={immersiveStagePlan?.stageRootTransform.uniformScale ?? 1}
    >
      <group
        position={immersiveStagePlan ? [...immersiveStagePlan.contentOffset] : [0, 0, 0]}
        userData={{ [STUDIO_BG3D_PHYSICS_PROJECTION_ROOT_USER_DATA_KEY]: true }}
      >
        {sceneContent}
        {sharedCharacterSceneContent}
      </group>
    </group>
  );

  const commonOrbitControls = (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      enabled={
        !immersiveSceneActive
        && !isTransforming
        && !isCapturing
        && !placementActive
        && !measurementActive
      }
      minDistance={2}
      maxDistance={mainCameraMaxOrbitDistance}
    />
  );

  const modal = (
    <div
      ref={modalDialogRef}
      aria-hidden={!open || undefined}
      aria-modal={open ? "true" : undefined}
      aria-labelledby="studio-bg3d-dialog-title"
      data-testid="studio-bg3d-dialog"
      hidden={!open}
      inert={!open ? true : undefined}
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
      role={open ? "dialog" : undefined}
      tabIndex={-1}
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex h-full max-h-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <Boxes size={14} aria-hidden />
              3D 배경
            </p>
            <h2 id="studio-bg3d-dialog-title" className="mt-1 truncate text-lg font-bold tracking-tight text-fg sm:text-xl">3D 장면 스튜디오</h2>
            <p className="mt-1 line-clamp-1 text-xs text-fg-3">캐릭터·배경·소품·조명을 한 장면에서 연출하고 컬러·선화로 추출</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isBatchRenderingShots ? (
              <>
                <span className="sr-only" role="status" aria-live="polite">
                  {shotBatchProgress?.stage === "render" ? "컷 렌더" : "ZIP 생성"}
                  {" "}{shotBatchProgress?.completed ?? 0}/{shotBatchProgress?.total ?? 0}
                </span>
                <button
                  type="button"
                  className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
                  onClick={() => shotBatchAbortRef.current?.abort()}
                >
                  <X size={14} aria-hidden />
                  일괄 렌더 취소
                </button>
              </>
            ) : null}
            <button
              type="button"
              aria-label="닫기"
              data-bg3d-initial-focus="true"
              title={isCapturing || deletingModelId !== null
                ? "진행 중인 작업이 끝난 뒤 닫을 수 있습니다"
                : webXrSessionState.status !== "idle" && webXrSessionState.status !== "error"
                  ? "AR·VR 미리보기를 종료하고 닫기"
                  : "닫기 (Esc)"}
              className={ICON_BUTTON}
              disabled={isCapturing}
              aria-disabled={deletingModelId !== null || undefined}
              onClick={requestUserClose}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
        </header>

        <div
          aria-busy={isCapturing || undefined}
          inert={isCapturing}
          data-destructive-busy={deletingModelId !== null || undefined}
          className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,44dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1"
        >
          <section className="relative min-h-0 overflow-hidden bg-[oklch(0.98_0_0)] lg:min-h-0">
            <div className="relative mx-auto flex h-full max-h-full min-h-0 w-full max-w-[min(92vw,960px)] items-center justify-center p-2 sm:p-5 lg:max-h-[calc(100dvh-12rem)] lg:min-h-[420px]">
              <div
                ref={viewportHostRef}
                data-testid="studio-bg3d-viewport"
                inert={immersiveSceneActive || undefined}
                className="relative aspect-video h-full max-h-full min-h-0 w-auto overflow-hidden rounded-xl border border-line/80 bg-white shadow-[inset_0_0_0_1px_oklch(1_0_0/0.04)] lg:min-h-[360px]"
              >
                {effectiveIsQuadView && (
                  <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 divide-x divide-y divide-line/80">
                    <div ref={viewTopRef} className="relative w-full h-full" />
                    <div ref={viewPerspRef} className="relative w-full h-full" />
                    <div ref={viewFrontRef} className="relative w-full h-full" />
                    <div ref={viewRightRef} className="relative w-full h-full" />
                  </div>
                )}
                <Canvas
                  key={webXrCanvasGeneration}
                  eventSource={viewportHostRef as unknown as React.RefObject<HTMLElement>}
                  camera={{
                    fov: sceneBaseDocument.camera.fovDegrees,
                    position: [...sceneBaseDocument.camera.position],
                    near: mainCameraNearClip,
                    far: 200,
                    up: [...mainCameraUp],
                  }}
                  className={cx(
                    "h-full w-full",
                    !immersiveSceneActive
                      && (surfaceSnapArmed || placementActive || measurementActive)
                      && "cursor-crosshair",
                    effectiveIsQuadView && "pointer-events-none absolute inset-0 z-10",
                  )}
                  dpr={deviceQuality.effectiveDpr * adaptiveDprScale}
                  frameloop={bg3dFrameLoop}
                  shadows={{ enabled: deviceQuality.shadows, type: THREE.PCFShadowMap }}
                  gl={{ antialias: sceneBaseDocument.render.antialias, alpha: true }}
                  onCreated={({ gl }) => {
                    modelRendererRef.current = gl;
                    setModelRenderer(gl);
                    applyStudioBg3dThreeWebglRenderSettings(gl, sceneBaseDocument.render);
                    gl.setClearColor(getSkyPreset(renderedSkyPresetId).clearColor, 1);
                  }}
                  onPointerMissed={(event) => {
                    if (immersiveSceneActive) return;
                    if (isStudioBg3dViewportControlTarget(event.target)) return;
                    if (placementActive) return;
                    if (surfaceSnapArmedRef.current) {
                      setSurfaceSnapStatus({
                        tone: "error",
                        message: "붙일 수 있는 3D 객체의 표면을 클릭해 주세요.",
                      });
                      return;
                    }
                    if (!isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) {
                      setSelectedIds(new Set());
                      setSelectedSharedCharacterElementId(null);
                    }
                  }}
                >
                  <StudioBg3dWebXrSessionBridge
                    key={webXrBridgeGeneration}
                    domOverlayRootRef={modalDialogRef}
                    onControllerReady={handleWebXrControllerReady}
                    onSupportChange={setWebXrSupport}
                    onStateChange={handleWebXrSessionStateChange}
                  />
                  <BgAdaptiveDprController
                    targetFps={deviceQuality.targetFps}
                    paused={isCapturing || immersiveSceneActive || !open}
                    onScaleChange={setAdaptiveDprScale}
                  />
                  <StudioBg3dPlacementPointerController
                    active={placementActive && !effectiveIsQuadView && !immersiveSceneActive}
                    objectsRef={primitiveObjectsRef}
                    onMove={moveCustomModelPlacement}
                    onCommit={commitCustomModelPlacement}
                    onCancel={() => cancelCustomModelPlacement("3D 모델 배치를 취소했습니다.")}
                    onRotate={rotateCustomModelPlacement}
                  />
                  {effectiveIsQuadView ? (
                    <Fragment>
                      <View track={viewTopRef as unknown as React.RefObject<HTMLElement>}>
                        <OrthographicCamera makeDefault position={[0, 15, 0]} rotation={[-Math.PI / 2, 0, 0]} zoom={40} near={-100} far={100} />
                        {sceneContent}
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing && !placementActive && !measurementActive} />
                      </View>
                      <View track={viewFrontRef as unknown as React.RefObject<HTMLElement>}>
                        <OrthographicCamera makeDefault position={[0, 0, 15]} rotation={[0, 0, 0]} zoom={40} near={-100} far={100} />
                        {sceneContent}
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing && !placementActive && !measurementActive} />
                      </View>
                      <View track={viewRightRef as unknown as React.RefObject<HTMLElement>}>
                        <OrthographicCamera makeDefault position={[15, 0, 0]} rotation={[0, Math.PI / 2, 0]} zoom={40} near={-100} far={100} />
                        {sceneContent}
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing && !placementActive && !measurementActive} />
                      </View>
                    </Fragment>
                  ) : null}
                  <View
                    key="studio-bg3d-main-view"
                    track={mainViewTrackRef as unknown as React.RefObject<HTMLElement>}
                    visible={!immersiveSceneActive}
                  >
                    {immersiveCameraNode ?? mainCameraNode}
                    {!immersiveSceneActive ? (
                      <Fragment>
                        <CaptureBridge onCaptureUpdate={onCaptureUpdate} />
                        <BgViewportController onReady={handleViewportReady} />
                      </Fragment>
                    ) : null}
                    {mainScenePresentationNode}
                    <StudioBg3dImmersiveRenderBridge active={immersiveSceneActive} />
                    {!immersiveSceneActive ? commonOrbitControls : null}
                  </View>
                </Canvas>

                {!isCapturing && !immersiveSceneActive ? (
                  <StudioBg3dSharedCharacterStatusOverlay
                    totalCount={sharedCharacters.length}
                    readyCount={sharedCharacterReadyCount}
                    unavailableCount={sharedCharacterUnavailableCount}
                    previewOmissionCount={sharedCharacterPreviewOmissionCount}
                    capacityOmissionCount={sharedSceneSession?.omittedCharacterCount ?? 0}
                    includeInCapture={includeSharedCharactersInCapture}
                    relationshipLabel={sharedCharacterRelationshipLabel}
                    stageResolution={sharedStageResolution}
                  />
                ) : null}

                {sharedCharacters.length === 0
                && sharedStageResolution
                && !isCapturing
                && !immersiveSceneActive ? (
                  <div
                    role={sharedStageResolution.phase === "ready" ? "status" : "alert"}
                    data-testid="studio-bg3d-shared-stage-status"
                    className="pointer-events-none absolute left-2 top-2 z-30 max-w-[min(88%,24rem)] rounded-lg border border-line/80 bg-panel/92 px-2.5 py-2 text-[0.68rem] font-semibold leading-relaxed text-fg-2 shadow-lg backdrop-blur sm:left-3 sm:top-3"
                  >
                    {sharedStageResolution.message}
                  </div>
                ) : null}

                {/* Capture-derived, pointer-transparent safe frame and crop mask. */}
                {!immersiveSceneActive
                && !effectiveIsQuadView
                && !isCapturing
                && viewportBoxSize
                && ltCaptureSafeFrame ? (
                  <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
                    <div
                      className={cx(
                        "absolute border border-dashed",
                        ltCaptureSafeFrame.fit === "exact"
                          ? "border-accent/30"
                          : "border-accent/75"
                      )}
                      style={{
                        left: `${ltCaptureSafeFrame.x}px`,
                        top: `${ltCaptureSafeFrame.y}px`,
                        width: `${ltCaptureSafeFrame.width}px`,
                        height: `${ltCaptureSafeFrame.height}px`,
                        ...(ltCaptureSafeFrame.fit === "exact"
                          ? {}
                          : { boxShadow: "0 0 0 9999px oklch(0.16 0 0 / 0.5)" }),
                      }}
                    />
                    {ltCaptureSafeFrame.fit === "exact" ? null : (
                      <span
                        className="absolute rounded-md bg-panel/90 px-1.5 py-0.5 text-[0.6rem] font-bold text-fg-2 shadow-sm"
                        style={{
                          left: `${ltCaptureSafeFrame.x + 4}px`,
                          top: `${ltCaptureSafeFrame.y + 4}px`,
                        }}
                      >
                        {ltCaptureAspectLabel}
                      </span>
                    )}
                  </div>
                ) : null}

                {placementSession.phase === "preview" && placementPreviewAsset ? (
                  <div
                    data-bg3d-viewport-control="true"
                    role="status"
                    aria-live="polite"
                    className="absolute inset-x-2 bottom-2 z-20 mx-auto flex max-w-xl items-center gap-2 rounded-xl border border-accent/45 bg-panel/95 p-2 shadow-lg backdrop-blur sm:bottom-2.5 sm:px-3"
                  >
                    <Crosshair className="hidden shrink-0 text-accent sm:block" size={17} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-fg">
                        {placementPreviewAsset.name} 배치
                      </p>
                      <p className="truncate text-[0.66rem] font-medium text-fg-3">
                        {placementSession.placement.targetKind === "surface" ? "표면" : "바닥"} · 클릭 확정 · Shift 축 고정 · [ ] 15° 회전
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="3D 배치 왼쪽으로 15도 회전"
                      title="왼쪽 15° ([)"
                      className={VIEWPORT_BTN}
                      onClick={() => rotateCustomModelPlacement("counter-clockwise")}
                    >
                      <RotateCcw size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="3D 배치 오른쪽으로 15도 회전"
                      title="오른쪽 15° (])"
                      className={VIEWPORT_BTN}
                      onClick={() => rotateCustomModelPlacement("clockwise")}
                    >
                      <RotateCw size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="3D 모델 배치 취소"
                      title="배치 취소 (Esc)"
                      className={cx(VIEWPORT_BTN, "text-bad hover:text-bad")}
                      onClick={() => cancelCustomModelPlacement("3D 모델 배치를 취소했습니다.")}
                    >
                      <X size={16} aria-hidden />
                    </button>
                  </div>
                ) : null}

                <div
                  data-bg3d-viewport-control="true"
                  inert={placementActive || undefined}
                  className={cx(
                    "absolute left-2 top-2 z-10 grid grid-cols-3 gap-1.5 sm:left-2.5 sm:top-2.5 sm:flex sm:flex-col",
                    immersiveSceneActive && "hidden",
                  )}
                >
                  <div className="col-span-3 grid grid-cols-3 gap-1 rounded-lg border border-line/70 bg-panel/80 p-1 shadow-sm backdrop-blur sm:flex sm:flex-col">
                    {TRANSFORM_MODES.map((m) => {
                      const ModeIcon = m.icon;
                      const isActive = transformMode === m.id;
                      return (
                        <StudioToolHintTarget key={m.id} hint={m.hint} preferredSide="right">
                          <button
                            type="button"
                            aria-label={m.label}
                            aria-pressed={isActive}
                            disabled={physicsInteractionLocked || placementActive}
                            className={cx(
                              "grid size-11 place-items-center rounded-md text-fg-2 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-8",
                              isActive && "bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent"
                            )}
                            onClick={() => {
                              if (measurementActiveRef.current) {
                                cancelMeasurement("변형 도구로 전환해 줄자 측정을 취소했습니다.");
                              }
                              setTransformMode(m.id);
                            }}
                          >
                            <ModeIcon size={15} aria-hidden />
                          </button>
                        </StudioToolHintTarget>
                      );
                    })}
                  </div>
                  <StudioToolHintTarget
                    className="col-span-2 sm:col-span-1"
                    hint={{
                      id: "bg3d:transform:space",
                      title: transformSpace === "local" ? "로컬 축" : "글로벌 축",
                      description:
                        transformSpace === "local"
                          ? "선택 객체가 회전한 방향을 기준으로 기즈모 축을 표시합니다."
                          : "장면의 고정된 X·Y·Z 방향을 기준으로 기즈모 축을 표시합니다.",
                      preview: "object-rotate",
                      tip: "한 번 선택한 축 기준은 이동·회전·크기 도구를 바꿔도 유지됩니다.",
                    }}
                    disabled={
                      physicsInteractionLocked ||
                      placementActive ||
                      isCapturing ||
                      isRestoringScene ||
                      isBatchRenderingShots
                    }
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label={`${transformSpace === "local" ? "로컬 축" : "글로벌 축"} · ${
                        transformSpace === "local" ? "글로벌 축으로 전환" : "로컬 축으로 전환"
                      }`}
                      aria-pressed={transformSpace === "local"}
                      data-testid="bg3d-transform-space-toggle"
                      disabled={
                        physicsInteractionLocked ||
                        placementActive ||
                        isCapturing ||
                        isRestoringScene ||
                        isBatchRenderingShots
                      }
                      className={cx(
                        "inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-lg border border-line/70 bg-panel/80 px-2 text-[0.65rem] font-bold text-fg-2 shadow-sm backdrop-blur transition-colors",
                        "hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        "disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9",
                        transformSpace === "local" &&
                          "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent",
                      )}
                      onClick={() =>
                        setTransformSpaceOverride((current) => {
                          const effective =
                            current ?? (transformMode === "rotate" ? "local" : "world");
                          return effective === "local" ? "world" : "local";
                        })
                      }
                    >
                      {transformSpace === "local" ? "로컬 축" : "글로벌 축"}
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget hint={quadViewHint} preferredSide="right">
                    <button
                      type="button"
                      aria-label={isQuadView ? "단일 뷰로 복귀" : "4분할 뷰 열기"}
                      aria-pressed={isQuadView}
                      disabled={physicsInteractionLocked || placementActive}
                      className={cx(
                        VIEWPORT_BTN,
                        isQuadView && "bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent"
                      )}
                      onClick={() => {
                        if (measurementActiveRef.current) {
                          cancelMeasurement("4분할 뷰로 전환해 줄자 측정을 취소했습니다.");
                        }
                        setIsQuadView((prev) => !prev);
                      }}
                    >
                      <LayoutTemplate size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={BG3D_VIEWPORT_HINTS.undo}
                    disabled={!canUndo}
                    unavailableReason={!canUndo ? "되돌릴 3D 장면 변경이 없습니다." : undefined}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label="실행 취소"
                      disabled={!canUndo || physicsInteractionLocked}
                      className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                      onClick={doUndo}
                    >
                      <Undo2 size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={BG3D_VIEWPORT_HINTS.redo}
                    disabled={!canRedo}
                    unavailableReason={!canRedo ? "다시 적용할 3D 장면 변경이 없습니다." : undefined}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label="다시 실행"
                      disabled={!canRedo || physicsInteractionLocked}
                      className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                      onClick={doRedo}
                    >
                      <Redo2 size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={snapToggleHint}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label={`${snapSettings.enabled ? "스냅 끄기" : "스냅 켜기"} · ${snapSettingsSummary}`}
                      aria-pressed={snapSettings.enabled}
                      className={cx(
                        VIEWPORT_BTN,
                        snapSettings.enabled && "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent"
                      )}
                      onClick={() =>
                        setSnapSettings((prev) =>
                          normalizeStudioBg3dSnapSettings({ ...prev, enabled: !prev.enabled })
                        )
                      }
                    >
                      <Magnet size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={BG3D_VIEWPORT_HINTS.ground}
                    disabled={Boolean(groundSelectionDisabledReason)}
                    unavailableReason={groundSelectionDisabledReason}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label="바닥에 접지"
                      disabled={Boolean(groundSelectionDisabledReason)}
                      className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                      onClick={groundSelectedEntity}
                    >
                      <MoveDown size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={{
                      id: "bg3d:object:placement-recipe",
                      title: "배치 정리",
                      description: "자동 맞춤 후 바닥에 붙입니다. 다중 선택 지원.",
                      preview: "object-ground",
                    }}
                    disabled={!canPlaceSelectedModelRecipe}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label="배치 정리"
                      disabled={!canPlaceSelectedModelRecipe}
                      className={cx(
                        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line/70 bg-panel/80 px-1.5 text-[0.65rem] font-semibold text-fg-2 shadow-sm backdrop-blur transition-colors",
                        "hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                      )}
                      onClick={placeSelectedModelRecipe}
                    >
                      배치 정리
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={BG3D_VIEWPORT_HINTS.originGround}
                    disabled={Boolean(centerGroundSelectionDisabledReason)}
                    unavailableReason={centerGroundSelectionDisabledReason}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label="원점 · 바닥 정렬"
                      disabled={Boolean(centerGroundSelectionDisabledReason)}
                      className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                      onClick={centerAndGroundSelectedEntity}
                    >
                      <LocateFixed size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={surfaceSnapHint}
                    disabled={Boolean(surfaceSnapDisabledReason) && !surfaceSnapArmed}
                    unavailableReason={surfaceSnapArmed ? undefined : surfaceSnapDisabledReason ?? undefined}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label={surfaceSnapArmed ? "표면 붙이기 취소" : "표면에 붙이기"}
                      aria-pressed={surfaceSnapArmed}
                      data-testid="bg3d-surface-snap-toggle"
                      disabled={Boolean(surfaceSnapDisabledReason) && !surfaceSnapArmed}
                      className={cx(
                        VIEWPORT_BTN,
                        "min-h-11 min-w-11 sm:size-11",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                        surfaceSnapArmed && "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent",
                      )}
                      onClick={toggleSurfaceSnap}
                    >
                      <Crosshair size={17} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={{
                      id: "bg3d:measure:tape",
                      title: measurementActive ? "줄자 측정 취소" : "줄자 · 추론 가이드",
                      description: measurementActive
                        ? "현재 두 점 측정을 취소하고 카메라 조작으로 돌아갑니다."
                        : "객체 표면이나 바닥의 두 점을 찍어 실제 거리와 축·평행·수직 추론을 확인합니다.",
                      preview: "object-snap",
                      previewVariant: measurementActive ? "disable" : undefined,
                      tip: "확정한 측정은 오른쪽 보기 탭에서 길이를 잠그거나 영구 가이드로 남길 수 있어요.",
                    }}
                    disabled={Boolean(measurementDisabledReason) && !measurementActive}
                    unavailableReason={
                      measurementActive ? undefined : measurementDisabledReason ?? undefined
                    }
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label={measurementActive ? "줄자 측정 취소" : "줄자 측정 시작"}
                      aria-pressed={measurementActive}
                      data-testid="bg3d-measurement-toggle"
                      disabled={Boolean(measurementDisabledReason) && !measurementActive}
                      className={cx(
                        VIEWPORT_BTN,
                        "min-h-11 min-w-11 sm:size-11",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                        measurementActive &&
                          "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent",
                      )}
                      onClick={toggleMeasurement}
                    >
                      <Ruler size={17} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={{
                      id: "bg3d:object:surface-snap-normal",
                      title: "법선 정렬",
                      description: "표면에 붙일 때 객체 위쪽을 법선 방향으로 맞춥니다.",
                      preview: "object-snap",
                    }}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label="법선 정렬"
                      aria-pressed={surfaceSnapAlignNormal}
                      data-testid="bg3d-surface-snap-align-normal"
                      className={cx(
                        "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-2 text-[0.65rem] font-semibold text-fg-2 transition-colors",
                        "hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        surfaceSnapAlignNormal &&
                          "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent",
                      )}
                      onClick={() => setSurfaceSnapAlignNormal((prev) => !prev)}
                    >
                      법선 정렬
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget
                    hint={BG3D_VIEWPORT_HINTS.focus}
                    disabled={Boolean(focusSelectionDisabledReason)}
                    unavailableReason={focusSelectionDisabledReason ?? undefined}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label="선택 객체 화면 맞춤"
                      disabled={Boolean(focusSelectionDisabledReason)}
                      className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                      onClick={focusSelectedEntity}
                    >
                      <ScanLine size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                </div>

                <div
                  data-bg3d-viewport-control="true"
                  inert={placementActive || undefined}
                  className={cx(
                    "absolute right-2 top-2 z-10 grid grid-cols-2 gap-1.5 sm:right-2.5 sm:top-2.5 sm:flex sm:flex-col",
                    immersiveSceneActive && "hidden",
                  )}
                >
                  <StudioToolHintTarget hint={BG3D_VIEWPORT_HINTS.zoomIn} preferredSide="left">
                    <button
                      type="button"
                      aria-label="확대"
                      className={VIEWPORT_BTN}
                      onClick={() => zoomCameraBy(0.82)}
                    >
                      <ZoomIn size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget hint={BG3D_VIEWPORT_HINTS.zoomOut} preferredSide="left">
                    <button
                      type="button"
                      aria-label="축소"
                      className={VIEWPORT_BTN}
                      onClick={() => zoomCameraBy(1.22)}
                    >
                      <ZoomOut size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget hint={BG3D_VIEWPORT_HINTS.resetView} preferredSide="left">
                    <button
                      type="button"
                      aria-label="시점 초기화"
                      className={VIEWPORT_BTN}
                      onClick={() => applyCameraPreset("default")}
                    >
                      <Maximize2 size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget hint={lineArtPreviewHint} preferredSide="left">
                    <button
                      type="button"
                      aria-label={lineArtPreview ? "선화 미리보기 끄기" : "선화 미리보기 켜기"}
                      aria-pressed={lineArtPreview}
                      className={cx(VIEWPORT_BTN, lineArtPreview && "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent")}
                      onClick={() => setLineArtPreview((v) => !v)}
                    >
                      <Boxes size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                </div>

                {surfaceSnapStatus && !immersiveSceneActive ? (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid="bg3d-surface-snap-status"
                    data-tone={surfaceSnapStatus.tone}
                    className={cx(
                      "pointer-events-none absolute inset-x-3 bottom-12 z-20 mx-auto max-w-md rounded-xl border px-3 py-2 text-center text-xs font-semibold leading-relaxed shadow-lg backdrop-blur",
                      surfaceSnapStatus.tone === "error"
                        ? "border-bad/50 bg-panel/95 text-bad"
                        : surfaceSnapStatus.tone === "success"
                          ? "border-good/50 bg-panel/95 text-good"
                          : "border-accent/50 bg-panel/95 text-accent",
                    )}
                  >
                    {surfaceSnapStatus.message}
                  </div>
                ) : null}

                {!immersiveSceneActive
                && (measurementActive || measurementStartWorld || measurementDraft) ? (
                  <output
                    aria-live="polite"
                    aria-atomic="true"
                    data-testid="bg3d-measurement-status"
                    className="pointer-events-none absolute inset-x-3 bottom-12 z-20 mx-auto max-w-md rounded-xl border border-accent/50 bg-panel/95 px-3 py-2 text-center text-xs font-semibold leading-relaxed text-accent shadow-lg backdrop-blur"
                  >
                    {measurementStatus}
                  </output>
                ) : null}

                <StudioBg3dPhysicsTransport
                  currentActionRef={physicsTransportActionRef}
                  phase={physicsPhase}
                  progress={physicsProgress}
                  currentSeconds={physicsCurrentSeconds}
                  durationSeconds={physicsSessionRef.current?.timeline.durationSeconds ?? physicsDurationSeconds}
                  onPause={pausePhysicsPreview}
                  onResume={resumePhysicsPreview}
                  onReset={() => resetPhysicsPreview()}
                  onBake={bakePhysicsPreview}
                />
                <output
                  aria-live="polite"
                  aria-atomic="true"
                  data-testid="bg3d-physics-status"
                  data-state={physicsPhase}
                  data-preview-revision={physicsPreviewRevision}
                  data-dynamic-count={physicsSessionRef.current?.timeline.nodeIds.length ?? 0}
                  data-sample-count={latestPhysicsSamplesRef.current.length}
                  data-preview-node-id={latestPhysicsSamplesRef.current[0]?.nodeId ?? ""}
                  data-preview-y={latestPhysicsSamplesRef.current[0]?.position[1] ?? ""}
                  className="sr-only"
                >
                  {describeStudioBg3dPhysicsStatus(physicsPhase, physicsError)}
                </output>

                {!immersiveSceneActive && !physicsInteractionLocked && !viewportHinted ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                    <span className="rounded-full border border-line/70 bg-panel/85 px-3 py-1 text-center text-[0.66rem] font-medium text-fg-3 shadow-sm backdrop-blur">
                      끌어서 회전 · 오른쪽 드래그로 이동 · 도형 클릭으로 선택
                    </span>
                  </div>
                ) : null}

                {primitives.length === 0 && customModels.length === 0 && sharedCharacters.length === 0 ? (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
                    <div className="max-w-[18rem]">
                      <div className="mx-auto grid size-12 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
                        <Boxes size={22} aria-hidden />
                      </div>
                      <p className="mt-4 text-sm font-bold text-fg">
                        오른쪽 &ldquo;템플릿&rdquo; 탭에서 교실·거리 같은 완성된 공간을 통째로 추가하거나, &ldquo;도형&rdquo; 탭에서 상자·원기둥·평면을 하나씩 추가하고 &ldquo;에셋&rdquo; 탭에서 캐릭터·크리처·소품과 3D 파일을 배치해 장면을 잡아보세요.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-t border-line bg-panel lg:border-l lg:border-t-0">
            <div
              role="tablist"
              aria-label="컨트롤 카테고리"
              inert={physicsInteractionLocked || immersiveSceneActive}
              className="grid shrink-0 grid-cols-6 gap-1 border-b border-line bg-panel/95 px-2 py-2 backdrop-blur sm:px-3"
            >
              {BG_PANEL_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activePanelTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`bg3d-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-label={tab.label}
                    aria-selected={isActive}
                    aria-controls="bg3d-panel-body"
                    tabIndex={isActive ? 0 : -1}
                    title={tab.hint}
                    onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
                      const idx = BG_PANEL_TABS.findIndex((t) => t.id === activePanelTab);
                      let next: number;
                      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % BG_PANEL_TABS.length;
                      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + BG_PANEL_TABS.length) % BG_PANEL_TABS.length;
                      else if (e.key === "Home") next = 0;
                      else if (e.key === "End") next = BG_PANEL_TABS.length - 1;
                      else return;
                      e.preventDefault();
                      const nextTab = BG_PANEL_TABS[next];
                      handlePanelTabChange(nextTab.id);
                      document.getElementById(`bg3d-tab-${nextTab.id}`)?.focus();
                    }}
                    className={cx(
                      "group flex flex-col items-center gap-1 whitespace-nowrap rounded-xl border px-1 py-1.5 text-[0.66rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      isActive
                        ? "border-accent/55 bg-accent-soft text-accent shadow-[inset_0_-2px_0_0_var(--color-accent,oklch(0.72_0.16_45))]"
                        : "border-transparent text-fg-3 hover:bg-raised hover:text-fg"
                    )}
                    onClick={() => handlePanelTabChange(tab.id)}
                  >
                    <TabIcon size={17} aria-hidden className={isActive ? "" : "opacity-80 group-hover:opacity-100"} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div
              ref={panelScrollRef}
              id="bg3d-panel-body"
              role="tabpanel"
              aria-labelledby={`bg3d-tab-${activePanelTab}`}
              inert={physicsInteractionLocked}
              className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5"
            >
              {open ? (
                <StudioBg3dShapesPanel
                  hidden={hideOnTab("shapes")}
                  context={{
                  Boxes,
                  ADD_BUTTONS,
                  addPrimitive,
                  PRIMITIVE_DEFS,
                  compositeCategory,
                  setCompositeCategory,
                  COMPOSITE_CATEGORIES,
                  COMPOSITE_CATEGORY_LABELS,
                  COMPOSITE_PRESETS,
                  addComposite,
                  addProceduralStarterAsset,
                  proceduralStarterDisabledReason,
                  snapSettings,
                  setSnapSettings,
                  normalizeStudioBg3dSnapSettings,
                  Magnet,
                  studioBg3dSnapSettingsSummary,
                  STUDIO_BG3D_TRANSLATE_STEP_OPTIONS,
                  STUDIO_BG3D_ROTATE_STEP_OPTIONS_DEG,
                  selectedPrimitive,
                  isBgObjectVisible,
                  togglePrimitiveFlag,
                  Eye,
                  EyeOff,
                  isBgObjectLocked,
                  Lock,
                  Unlock,
                  selectedIsLocked,
                  groundSelectedEntity,
                  MoveDown,
                  centerGroundSelectionDisabledReason,
                  centerAndGroundSelectedEntity,
                  LocateFixed,
                  focusSelectedEntity,
                  ScanLine,
                  duplicateSelected,
                  Copy,
                  deleteSelected,
                  Trash2,
                  reparentSceneEntity,
                  layerListItems,
                  canSetStudioBg3dParent,
                  Vec3Field,
                  updateTransform,
                  radToDeg,
                  degToRad,
                  updateColor,
                  selectedCustomModel,
                  toggleCustomModelFlag,
                  canPlaceSelectedModelRecipe,
                  placeSelectedModelRecipe,
                  duplicateSelectedCustomModel,
                  deleteSelectedCustomModel,
                  updateCustomModelTransform,
                  updateCustomModelMaterial,
                  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
                  selectedSemanticMaterials,
                  selectedCharacterPassPlan,
                  selectedBackgroundPassPlan,
                  selectedSemanticAssignments,
                  SEMANTIC_MATERIAL_SLOT_LABELS,
                  SEMANTIC_MATERIAL_CONFIDENCE_LABELS,
                  selectedModelJoints,
                  updateCustomModelConstraints,
                  DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER,
                  selectedAimConstraints,
                  selectedTwoBoneIkConstraints,
                  selectedPoseJointKey,
                  setPoseJointSelection,
                  selectedAimConstraint,
                  commitSelectedAimConstraint,
                  selectedAimSuppressedByIk,
                  selectedIkEndCandidates,
                  selectedIkEndJointKey,
                  setIkEndJointSelection,
                  selectedIkUpperJoint,
                  selectedIkMiddleJoint,
                  selectedIkEndJoint,
                  selectedTwoBoneIkConstraint,
                  selectedIkLimitReached,
                  selectedIkHasOverlap,
                  selectedIkTransformSupported,
                  commitSelectedTwoBoneIkConstraint,
                  selectedIkDefaultTarget,
                  selectedIkDefaultPole,
                  STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS,
                  selectedRigBakeDisabledReason,
                  bakeCustomModelRigConstraints,
                  selectedModelAnimations,
                  updateCustomModelAnimation,
                  DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK,
                  selectedAnimationClip,
                  BgAnimationPlayhead,
                  open,
                  activePanelTab,
                  selectedAnimationDuration,
                  modelAnimationTimeReadersRef,
                  updateCustomModelPose,
                  DEFAULT_STUDIO_BG3D_POSE_LAYER,
                  selectedPoseJoint,
                  commitSelectedPoseOverride,
                  selectedPoseEulerDegrees,
                  eulerDegreesToQuaternion,
                  selectedModelMorphTargets,
                  updateCustomModelMorph,
                  DEFAULT_STUDIO_BG3D_MORPH_LAYER,
                  selectedMorphTargetKey,
                  setMorphTargetSelection,
                  selectedMorphOverride,
                  }}
                />
              ) : null}

              <section hidden={hideOnTab("templates")}>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <LayoutTemplate size={15} className="text-accent" aria-hidden />
                  씬 템플릿
                </h3>
                <StudioBg3dSceneTemplatePanel
                  activeCategory={sceneTemplateCategory}
                  onCategoryChange={setSceneTemplateCategory}
                  onAddTemplate={addSceneTemplate}
                />

                <div className="mt-5 border-t border-line pt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                      <Home size={15} className="text-accent" aria-hidden />
                      방 만들기
                    </h3>
                    <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.62rem] font-semibold text-fg-3">
                      파라메트릭
                    </span>
                  </div>
                  <StudioBg3dRoomBuilderPanel
                    spec={roomBuilderSpec}
                    disabled={isCapturing || isRestoringScene || physicsInteractionLocked}
                    onSpecChange={handleRoomBuilderSpecChange}
                    onApplyPreset={applyRoomBuilderPreset}
                    onInsert={addRoomBuild}
                  />
                </div>
              </section>

              <section hidden={hideOnTab("layers")}>
                {sharedStageResolution ? (
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
                ) : null}
                <div className={cx(
                  "mb-2 flex items-center justify-between gap-3",
                  includeSharedCharactersInCapture
                    && sharedCharacters.length > 0
                    && "mt-4",
                )}>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <Layers size={15} className="text-accent" aria-hidden />
                    레이어
                  </h3>
                  <span className="text-[0.68rem] text-fg-3">
                    {filteredLayerItems.length}/{layerListItems.length}개
                  </span>
                </div>
                {layerListItems.length === 0 ? (
                  <p className="text-xs leading-relaxed text-fg-3">아직 추가한 도형·에셋이 없습니다. &ldquo;도형&rdquo;/&ldquo;에셋&rdquo; 탭에서 먼저 추가해 주세요.</p>
                ) : (
                  <>
                    <label className="mb-2 block">
                      <span className="sr-only">레이어 검색</span>
                      <input
                        type="search"
                        value={layerQuery}
                        onChange={(e) => setLayerQuery(e.target.value)}
                        placeholder="이름 검색…"
                        className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9"
                      />
                    </label>
                    {filteredLayerItems.length === 0 ? (
                      <p className="text-xs leading-relaxed text-fg-3">검색 결과가 없습니다.</p>
                    ) : (
                                            <ul className="space-y-1">
                        {(() => {
                          const filteredById = new Map(
                            filteredLayerItems.map((entry) => [entry.id, entry] as const),
                          );
                          const searchActive = layerQuery.trim().length > 0;
                          const renderSidebarNode = (item: typeof filteredLayerItems[0], depth: number = 0) => {
                            const isActive = selectedIds.has(item.id);
                            const prim = item.kind === "primitive" ? primitives.find((p) => p.id === item.id) : null;
                            const children = searchActive
                              ? []
                              : (sceneHierarchy.childrenByParent.get(item.id) ?? [])
                                .map((id) => filteredById.get(id))
                                .filter((entry): entry is typeof item => entry !== undefined);
                            
                            return (
                              <Fragment key={item.id}>
                                <li>
                                  <div
                                    style={{ marginLeft: `${depth * 16}px` }}
                                    className={cx(
                                      "flex min-h-11 items-center gap-1 rounded-lg border px-1.5 py-1.5 text-xs transition-colors sm:min-h-0",
                                      isActive
                                        ? "border-accent/55 bg-accent-soft text-accent"
                                        : "border-line bg-card text-fg-2 hover:bg-raised",
                                      !item.visible && "opacity-60"
                                    )}
                                  >
                                    <button
                                      type="button"
                                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1 text-left sm:min-h-0"
                                      onClick={(e) => {
                                        setSelectedIds((prev) => {
                                          const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;
                                          if (isMulti) {
                                            const next = new Set(prev);
                                            if (next.has(item.id)) next.delete(item.id);
                                            else next.add(item.id);
                                            return next;
                                          }
                                          return new Set([item.id]);
                                        });
                                      }}
                                    >
                                      {prim ? (
                                        <span
                                          className="inline-block size-2.5 shrink-0 rounded-sm"
                                          style={{ backgroundColor: prim.color }}
                                          aria-hidden
                                        />
                                      ) : (
                                        <Hexagon size={13} className="shrink-0 text-fg-3" aria-hidden />
                                      )}
                                      <span className="truncate font-semibold">{item.label}</span>
                                      {item.locked ? <Lock size={11} className="shrink-0 opacity-80" aria-hidden /> : null}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`${item.label} 이름 변경`}
                                      title="이름 변경"
                                      className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                                      onClick={() => renameBgObject(item.id, item.kind)}
                                    >
                                      <PencilLine size={12} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`${item.label} ${item.visible ? "숨기기" : "보이기"}`}
                                      title={item.visible ? "숨기기" : "보이기"}
                                      className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                                      onClick={() => {
                                        if (item.kind === "primitive") togglePrimitiveFlag(item.id, "visible");
                                        else toggleCustomModelFlag(item.id, "visible");
                                      }}
                                    >
                                      {item.visible ? <Eye size={12} aria-hidden /> : <EyeOff size={12} aria-hidden />}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`${item.label} ${item.locked ? "잠금 해제" : "잠금"}`}
                                      title={item.locked ? "잠금 해제" : "잠금"}
                                      className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                                      onClick={() => {
                                        if (item.kind === "primitive") togglePrimitiveFlag(item.id, "locked");
                                        else toggleCustomModelFlag(item.id, "locked");
                                      }}
                                    >
                                      {item.locked ? <Lock size={12} aria-hidden /> : <Unlock size={12} aria-hidden />}
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`${item.label} 복제`}
                                      title="복제"
                                      className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                                      onClick={() => {
                                        if (!canAdmitSceneNodes(1)) return;
                                        const live = physicsRuntimeSourceRef.current;
                                        if (item.kind === "primitive") {
                                          const source = live.primitives.find((p) => p.id === item.id);
                                          if (!source) return;
                                          const clone = duplicatePrimitive(source);
                                          const nextPrimitives = [...live.primitives, clone];
                                          physicsRuntimeSourceRef.current = {
                                            ...live,
                                            primitives: nextPrimitives,
                                          };
                                          setPrimitives(nextPrimitives);
                                          setSelectedIds(new Set([clone.id]));
                                          return;
                                        }
                                        const source = live.customModels.find((m) => m.id === item.id);
                                        if (!source) return;
                                        const clone = duplicateBgCustomModelInstance(source);
                                        const nextCustomModels = [...live.customModels, clone];
                                        physicsRuntimeSourceRef.current = {
                                          ...live,
                                          customModels: nextCustomModels,
                                        };
                                        setCustomModels(nextCustomModels);
                                        setSelectedIds(new Set([clone.id]));
                                      }}
                                    >
                                      <Copy size={12} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`${item.label} 삭제`}
                                      title="삭제"
                                      className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                                      onClick={() => {
                                        removeSceneEntities(new Set([item.id]));
                                        setSelectedIds((prev) => {
                                          const next = new Set(prev);
                                          next.delete(item.id);
                                          return next;
                                        });
                                      }}
                                    >
                                      <Trash2 size={12} aria-hidden />
                                    </button>
                                  </div>
                                </li>
                                {children.map(child => renderSidebarNode(child, depth + 1))}
                              </Fragment>
                            );
                          };
                          const roots = searchActive
                            ? filteredLayerItems
                            : sceneHierarchy.roots
                              .map((id) => filteredById.get(id))
                              .filter((entry): entry is typeof filteredLayerItems[0] => entry !== undefined);
                          return roots.map(root => renderSidebarNode(root, 0));
                        })()}
                      </ul>
                    )}
                  </>
                )}
              </section>

              <div inert={immersiveSceneActive || undefined}>
              <StudioBg3dViewPanel
                hidden={hideOnTab("view")}
                babylonDiagnosticState={babylonDiagnosticState}
                onRunBabylonDiagnostic={(backend) => void runBabylonDiagnostic(backend)}
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

                <div className="mb-4 border-t border-line pt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    내 템플릿
                  </h3>
                  <span className="text-[0.68rem] text-fg-3">
                    {templateLibrary.length}개
                  </span>
                </div>
                <button
                  type="button"
                  className={cx(CONTROL_BUTTON, "mb-4 w-full border-accent/50 bg-accent text-on-accent hover:bg-accent/90")}
                  disabled={isSavingTemplate || applyingTemplateId !== null || (primitives.length === 0 && customModels.length === 0)}
                  onClick={() => void handleSaveSceneAsTemplate()}
                >
                  {isSavingTemplate ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <Upload size={14} aria-hidden />}
                  현재 장면을 내 템플릿으로 저장
                </button>
                
                <div className="mb-6 grid grid-cols-2 gap-2">
                  {templateLibraryStatus === "loading" ? (
                    <div className="col-span-2 rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3">템플릿을 불러오는 중입니다.</div>
                  ) : null}
                  {templateLibraryStatus === "error" ? (
                    <p className="col-span-2 mt-2 rounded-xl border border-line bg-card/70 px-3 py-2 text-xs leading-relaxed text-fg-3">템플릿 목록을 불러오지 못했습니다.</p>
                  ) : null}
                  {templateLibraryStatus === "ready" && templateLibrary.length === 0 ? (
                    <div className="col-span-2 rounded-xl border border-dashed border-line bg-card/45 px-3 py-4 text-center text-xs leading-relaxed text-fg-3">
                      저장된 템플릿이 없습니다.
                    </div>
                  ) : null}
                  {templateLibrary.map((entry) => (
                    <div key={entry.id} className="relative overflow-hidden rounded-xl border border-line bg-card transition-colors hover:bg-raised">
                      <button
                        type="button"
                        className="grid min-h-[5rem] w-full gap-2 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                        disabled={applyingTemplateId !== null || isRestoringScene || isUploadingModel}
                        onClick={() => void applyUserTemplate(entry)}
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-fg">
                          {applyingTemplateId === entry.id ? (
                            <Loader2 className="shrink-0 animate-spin" size={13} aria-hidden />
                          ) : null}
                          <span className="block truncate">{entry.name}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <span className={cx("inline-flex rounded-full px-1.5 py-0.5 text-[0.64rem] font-bold", entry.commercialUse ? "bg-[oklch(0.80_0.15_150/0.14)] text-good" : "bg-raised text-fg-3")}>
                            {entry.commercialUse ? "상업 이용 가능" : "상업 이용 확인 필요"}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`${entry.name} 템플릿 삭제`}
                        title="템플릿 삭제"
                        className="absolute right-1.5 top-1.5 grid size-11 place-items-center rounded-lg border border-line bg-panel/90 text-fg-3 transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-7"
                        disabled={applyingTemplateId !== null}
                        onClick={(e) => { e.stopPropagation(); void handleDeleteTemplate(entry.id); }}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
                </div>
                

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
            </div>

            <StudioBg3dActionFooter
              sceneRecoveryError={sceneRecoveryError}
              hasCloneFailure={hasCloneFailure}
              isRestoringScene={isRestoringScene}
              hasPendingClone={hasPendingClone}
              hasPendingSharedCharacter={hasPendingSharedCharacter}
              hasFilledOutput={hasFilledOutput}
              onEnableFilledOutput={() => {
                updateLtToneSettings({ mode: "flat", type: "color", opacity: 1 });
                setLtEditorSection("tone");
              }}
              sharedStageUpdateBlockedReason={sharedStageUpdateBlockedReason}
              onOpenSharedStage={() => setActivePanelTab("layers")}
              error={error}
              isCapturing={isCapturing}
              deletingModelInProgress={deletingModelId !== null}
              saveDisabled={
                (primitives.length === 0 && customModels.length === 0)
                || isCapturing
                || insertBlocked
                || immersiveSceneActive
              }
              onClose={requestUserClose}
              onSave={handleSaveToLibrary}
              insertDisabled={(
                primitives.length === 0 &&
                customModels.length === 0 &&
                sharedCharacterCaptureElementIds.length === 0 &&
                !mayApplyEmptySharedStageMutation
              ) || isCapturing
                || insertBlocked
                || immersiveSceneActive
                || sharedStageUpdateBlockedReason !== null}
              onInsert={handleInsert}
              operation={operation}
              mutationKind={sharedStageMutationKind}
              materializationKind={sharedStageMaterializationKind}
              captureElementCount={sharedCharacterCaptureElementIds.length}
              toneOutputType={ltToneSettings.type}
            />
          </aside>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
