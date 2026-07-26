import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { OrthographicCamera } from "@react-three/drei/core/OrthographicCamera.js";
import { PerspectiveCamera } from "@react-three/drei/core/PerspectiveCamera.js";
import { TransformControls } from "@react-three/drei/core/TransformControls.js";
import { View } from "@react-three/drei/web/View.js";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  AlertTriangle,
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
  ImagePlus,
  Layers,
  LayoutTemplate,
  Loader2,
  LocateFixed,
  Lock,
  Magnet,
  Maximize2,
  Move,
  MoveDown,
  PackageOpen,
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
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { createPortal, flushSync } from "react-dom";
import * as THREE from "three";

import {
  admitStoredBg3dModelForRendering,
  createStudioBg3dModelAttachment,
  deleteStoredBg3dModel,
  getStoredBg3dModel,
  getStoredBg3dModelByHash,
  importVerifiedBg3dModelsAtomically,
  listBg3dModelLibraryEntries,
  type Bg3dModelImportItem,
  type Bg3dModelLibraryEntry,
  type Bg3dVerifiedStoredRecord,
} from "./bg3d-model-library";
import {
  deleteBg3dTemplate,
  instantiateBg3dTemplateDocument,
  listBg3dTemplates,
  saveBg3dTemplate,
  type Bg3dTemplateLibraryEntry,
} from "./bg3d-template-library";
import {
  COMPOSITE_CATEGORIES,
  COMPOSITE_CATEGORY_LABELS,
  COMPOSITE_PRESETS,
  instantiateCompositePreset,
  type BgCompositeCategory,
} from "./studio-background-3d-composites";
import {
  cloneBgCustomModelInstances,
  collectStudioBg3dThreeJoints,
  collectStudioBg3dThreeMorphTargets,
  computeAutoFitScale,
  createStudioBg3dEditableThreeClone,
  createBgCustomModelInstance,
  duplicateBgCustomModelInstance,
  loadVerifiedStudioBg3dGlbWithThree,
  isStudioBg3dThreeTwoBoneIkChainSupported,
  measureBg3dObjectSize,
  parseBg3dSceneWithModelsFromDataUrl,
  sampleStudioBg3dAnimationActionAtTime,
  StudioBg3dThreeOperationError,
  type BgCustomModelInstance,
  type StudioBg3dEditableThreeClone,
  type StudioBg3dThreeLoadSuccess,
  type StudioBg3dThreeJointDescriptor,
  type StudioBg3dThreeMorphDescriptor,
} from "./studio-background-3d-model";
import {
  clonePrimitives,
  createPrimitive,
  duplicatePrimitive,
  PRIMITIVE_DEFS,
  type BgPrimitive,
  type BgPrimitiveKind,
} from "./studio-background-3d-primitives";
import {
  BG_SCENE_TEMPLATES,
  instantiateSceneTemplate,
  type BgSceneTemplateCategory,
} from "./studio-background-3d-scene-templates";
import {
  BG_SKY_PRESETS,
  getSkyPreset,
  normalizePanoramaRotationDegrees,
} from "./studio-background-3d-sky";
import { resolveStudioBg3dAnimationSchedule } from "./studio-bg3d-animation-scheduler";
import {
  isStudioBg3dAnimationOnceComplete,
  resolveStudioBg3dAnimationTime,
  snapshotStudioBg3dLiveAnimationPlayback,
} from "./studio-bg3d-animation-time";
import {
  applyStudioBg3dProjectionAwareZoom,
  applyStudioBg3dViewportAfterTransition,
  applyStudioBg3dViewToThreeCamera,
  isStudioBg3dViewportControlTarget,
  readStudioBg3dObjectWorldBounds,
  readStudioBg3dWorldSurfaceHit,
  type BgViewportApi,
} from "./studio-bg3d-camera-application";
import {
  fitStudioBg3dCameraToBounds,
} from "./studio-bg3d-camera-framing";
import { applyOrDeferStudioBg3dHistoryCamera } from "./studio-bg3d-camera-history-transition";
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
  resolveStudioBg3dCaptureViewOffset,
  type StudioBg3dCaptureFrame,
} from "./studio-bg3d-capture-frame-geometry";
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
  type StudioBg3dResolvedDeviceQuality,
} from "./studio-bg3d-device-quality";
import {
  STUDIO_BG3D_CONTROL_BUTTON as CONTROL_BUTTON,
  STUDIO_BG3D_ICON_BUTTON as ICON_BUTTON,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";
import {
  advanceStudioBg3dFrameQuality,
  createStudioBg3dFrameQualityState,
} from "./studio-bg3d-frame-quality-governor";
import {
  canSetStudioBg3dParent,
  collectStudioBg3dEffectivelyVisibleEntityIds,
  resolveStudioBg3dHierarchy,
} from "./studio-bg3d-hierarchy";
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
import { projectStudioBg3dLodDiameterCssPx } from "./studio-bg3d-lod-selection";
import { resolveStudioBg3dLtCaptureSize } from "./studio-bg3d-lt-capture-size";
import {
  EMPTY_STUDIO_BG3D_LT_USER_PRESET_PAYLOAD,
  createStudioBg3dLtUserPreset,
  deleteStudioBg3dLtUserPreset,
  renameStudioBg3dLtUserPreset,
  upsertStudioBg3dLtUserPreset,
  type StudioBg3dLtUserPresetMutationFailureReason,
  type StudioBg3dLtUserPresetMutationResult,
  type StudioBg3dLtUserPresetMutationSuccess,
} from "./studio-bg3d-lt-preset-library";
import {
  loadStudioBg3dLtUserPresetsFromStorage,
  saveStudioBg3dLtUserPresetsToStorage,
  type StudioBg3dLtPresetStorage,
} from "./studio-bg3d-lt-preset-storage";
import {
  STUDIO_BG3D_LT_BUILT_IN_PRESETS,
  STUDIO_BG3D_LT_PRESET_MAX_COUNT,
  STUDIO_BG3D_LT_PRESET_MAX_DESCRIPTION_LENGTH,
  STUDIO_BG3D_LT_PRESET_MAX_NAME_LENGTH,
  applyStudioBg3dLtPreset,
  type StudioBg3dLtPreset,
  type StudioBg3dLtPresetPayload,
} from "./studio-bg3d-lt-presets";
import {
  renderStudioBg3dLtLayers,
  STUDIO_BG3D_LT_RENDER_MAX_PIXELS,
  type StudioBg3dLtRasterLayer,
  type StudioBg3dLtRenderSettings,
} from "./studio-bg3d-lt-render";
import {
  renderStudioBg3dLtLayersInWorker,
  StudioBg3dLtRenderWorkerError,
} from "./studio-bg3d-lt-render-worker-client";
import {
  StudioBg3dStaleModalOperationError,
  studioBg3dGlobalAssetLoadGate,
  studioBg3dModalOperationCoordinator,
  type StudioBg3dModalSession,
} from "./studio-bg3d-modal-operation-coordinator";
import {
  assertStudioBg3dModelPlacementAdmission,
  calculateStudioBg3dPlacedModelBytes,
  StudioBg3dModelPlacementAdmissionError,
  totalStudioBg3dModelAttachmentBytes,
} from "./studio-bg3d-model-placement-admission";
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
  type StudioBg3dPlacementPreviewState,
  type StudioBg3dPlacementSessionState,
} from "./studio-bg3d-placement-session";
import {
  StudioBg3dPrimitiveGeometryPool,
  synchronizeStudioBg3dRootMatrix,
} from "./studio-bg3d-render-optimization";
import { resolveStudioBg3dFrameLoop } from "./studio-bg3d-render-policy";
import {
  createStudioBg3dRigPoseBakeHistoryTransition,
  type StudioBg3dRigPoseBakeSnapshot,
} from "./studio-bg3d-rig-pose-bake";
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
import { buildStudioBg3dScaleGuideParts } from "./studio-bg3d-scale-guide";
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
  migrateStudioBg3dSceneDocument,
  moveStudioBg3dShot,
  parseStudioBg3dSceneDocument,
  removeStudioBg3dShot,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dCameraSettings,
  type StudioBg3dBackgroundSettings,
  type StudioBg3dLineOutputSettings,
  type StudioBg3dAnimationPlayback,
  type StudioBg3dConstraintLayer,
  type StudioBg3dMaterialOverride,
  type StudioBg3dPoseLayer,
  type StudioBg3dMorphLayer,
  type StudioBg3dQuaternion,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneBudgets,
  type StudioBg3dSceneDocument,
  type StudioBg3dToneOutputSettings,
} from "./studio-bg3d-scene-document";
import {
  STUDIO_BG3D_FOG_MIN_GAP,
  STUDIO_BG3D_FOG_PRESETS,
} from "./studio-bg3d-scene-fog";
import {
  planStudioBg3dSceneEntityRemoval,
  preflightAndDeleteStudioBg3dPersistedModel,
  type StudioBg3dSceneRemovalSuccess,
} from "./studio-bg3d-scene-removal";
import {
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";
import {
  DEFAULT_STUDIO_BG3D_SECTION_PLANE_STATE,
  STUDIO_BG3D_SECTION_AXES,
  STUDIO_BG3D_SECTION_AXIS_LABELS,
  STUDIO_BG3D_SECTION_OFFSET_LIMIT,
  computeStudioBg3dSectionPlane,
  type StudioBg3dSectionPlaneState,
} from "./studio-bg3d-section-plane";
import {
  createStudioBg3dSemanticRenderPassPlan,
  type StudioBg3dSemanticMaterialClassificationResult,
  type StudioBg3dSemanticMaterialConfidence,
  type StudioBg3dSemanticMaterialSlot,
} from "./studio-bg3d-semantic-materials";
import { STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION } from "./studio-bg3d-shot-batch-limits";
import {
  STUDIO_BG3D_SHOT_BATCH_PASSES,
  STUDIO_BG3D_SHOT_BATCH_PASS_LABELS,
} from "./studio-bg3d-shot-batch-pass-catalog";
import { loadStudioBg3dShotBatchRuntime } from "./studio-bg3d-shot-batch-runtime-loader";
import {
  freezeStudioBg3dShotAnimationsForBatch,
  projectStudioBg3dShotVisibilityToRuntime,
} from "./studio-bg3d-shot-runtime";
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
  calculateStudioBg3dThreeReparentTransform,
  calculateStudioBg3dThreeWorldMatrix,
  calculateStudioBg3dThreeWorldDeltaTransform,
} from "./studio-bg3d-three-hierarchy";
import {
  createStudioBg3dThreeStaticInstanceBatch,
  type StudioBg3dThreeInstancingSuccess,
} from "./studio-bg3d-three-instancing";
import { resolveStudioBg3dThreeCenterGroundLocalPosition } from "./studio-bg3d-three-model-alignment";
import { applyStudioBg3dThreeWebglRenderSettings } from "./studio-bg3d-three-render-settings";
import { classifyStudioBg3dThreeSemanticMaterials } from "./studio-bg3d-three-semantic-materials";
import {
  createStudioGeneric3dRightsFromAttachment,
  createStudioGeneric3dVerifiedManifest,
  type StudioGeneric3dClassification,
  type StudioGeneric3dManifestHints,
  type StudioGeneric3dSourceFormat,
} from "./studio-generic-3d-model-mode";
import { createStudioGeneric3dPoseProxies } from "./studio-generic-3d-pose-proxy";
import {
  attachStudioGeneric3dWorkflowMetadata,
  mergeStudioGeneric3dWorkflowMaps,
  normalizeStudioGeneric3dClassification,
  normalizeStudioGeneric3dSourceFormat,
  parseStudioGeneric3dWorkflowMetadata,
} from "./studio-generic-3d-workflow-metadata";
import { createTwoBoneDefaultPoleTarget } from "./studio-rig-two-bone-ik";
import { StudioBg3dLtPanel } from "./StudioBg3dLtPanel";
import {
  StudioBg3dPhysicsPanel,
  StudioBg3dPhysicsTransport,
} from "./StudioBg3dPhysicsControls";
import { StudioBg3dPlacementPointerController } from "./StudioBg3dPlacementPointerController";
import { StudioBg3dRoomBuilderPanel } from "./StudioBg3dRoomBuilderPanel";
import { StudioBg3dSceneFog } from "./StudioBg3dSceneFog";
import { StudioBg3dScenePanorama } from "./StudioBg3dScenePanorama";
import { StudioBg3dSceneTemplatePanel } from "./StudioBg3dSceneTemplatePanel";
import { StudioBg3dShapesPanel } from "./StudioBg3dShapesPanel";
import { StudioBg3dViewPanel } from "./StudioBg3dViewPanel";
import {
  StudioGeneric3dModelModePanel,
  type StudioGeneric3dControlMode,
} from "./StudioGeneric3dModelModePanel";
import { StudioToolHintTarget } from "./StudioToolHint";
import { useStudioModalSheet } from "./useStudioModalSheet";

import type {
  StudioBackground3DInsertResult,
  StudioBackground3DLtLayer,
} from "./studio-3d-insert-contract";
import type {
  StudioBg3dCaptureAdapter,
  StudioBg3dCaptureRequest,
} from "./studio-bg3d-capture-adapter";
import type { StudioBg3dImportProgress } from "./studio-bg3d-model-import";
import type { StudioBg3dModelThumbnailCaptureController } from "./studio-bg3d-model-thumbnail-capture";
import type { StudioBg3dModelThumbnailThreeCaptureHandle } from "./studio-bg3d-model-thumbnail-three-capture";
import type {
  StudioBg3dShotBatchBuildOptions,
  StudioBg3dShotBatchContactSheet,
  StudioBg3dShotBatchContactSheetFallback,
} from "./studio-bg3d-shot-batch";
import type { StudioBg3dShotBatchPass } from "./studio-bg3d-shot-batch-pass-catalog";
import type {
  StudioBg3dShotBatchCaptureSpecInput,
  StudioBg3dShotBatchPlan,
  StudioBg3dShotBatchRecoveryScope,
} from "./studio-bg3d-shot-batch-plan";
import type { StudioBg3dShotBatchFailureCode } from "./studio-bg3d-shot-batch-queue";
import type {
  StudioBg3dShotBatchRecoverySession,
  StudioBg3dShotBatchRecoveryStore,
  StudioBg3dShotBatchRunToken,
} from "./studio-bg3d-shot-batch-recovery-store";
import type { StudioBg3dShotBatchRuntime } from "./studio-bg3d-shot-batch-runtime-loader";
import type { StudioBg3dShotContactSheetImage } from "./studio-bg3d-shot-contact-sheet-contract";
import type { StudioToolHintSpec } from "./studio-tool-hints";

export type {
  StudioBackground3DInsertResult,
  StudioBackground3DLtLayer,
} from "./studio-3d-insert-contract";

const LazyStudioBg3dAssetLibraryPanel = lazy(() =>
  import("./StudioBg3dAssetLibraryPanel").then(({ StudioBg3dAssetLibraryPanel }) => ({
    default: StudioBg3dAssetLibraryPanel,
  }))
);

export interface StudioBackground3DProps {
  open: boolean;
  initialDataUrl?: string;
  initialScene?: StudioBg3dSceneDocument;
  recoveryScope: StudioBg3dShotBatchRecoveryScope | null;
  validateRecoveryAccess: (
    scope: StudioBg3dShotBatchRecoveryScope,
    signal: AbortSignal,
  ) => Promise<boolean>;
  onClose: () => void;
  onInsert: (result: StudioBackground3DInsertResult) => boolean | void;
  /** 편집 중인 문서 캔버스 크기. 주어지면 "문서 캔버스 비율" 캡처 프리셋이 목록에 추가된다. */
  documentCanvasSize?: { readonly width: number; readonly height: number };
}

type TransformModeId = "translate" | "rotate" | "scale";
type BgPanelTab = "shapes" | "templates" | "layers" | "view" | "lt" | "models";
type ViewEditorSection = "camera" | "physics";
type LtEditorSection = "line" | "tone";
const VIEW_EDITOR_SECTIONS = [
  { id: "camera", label: "카메라 · 환경" },
  { id: "physics", label: "물리 배치" },
] as const satisfies readonly { id: ViewEditorSection; label: string }[];
type LtUserPresetLibraryStatus = "idle" | "ready" | "recovered" | "unavailable";
type LtUserPresetNoticeTone = "info" | "success" | "error";
type LtUserPresetNotice = {
  readonly tone: LtUserPresetNoticeTone;
  readonly message: string;
};
/**
 * 캡처 어댑터와, 그 어댑터가 렌더에 쓰는 바로 그 카메라를 같은 스냅샷으로 묶는다. 캡처 프레임을
 * 적용하려면 어댑터가 렌더하는 카메라의 view 창을 정확히 같은 프레임으로 잡아야 한다.
 */
type CaptureState = {
  adapter: StudioBg3dCaptureAdapter | null;
  camera: THREE.Camera | null;
};

const STUDIO_BG3D_SHOT_CONTACT_SHEET_PASS_PRIORITY: readonly StudioBg3dShotBatchPass[] = [
  "lt-composite",
  "beauty",
  "color",
  "tone",
  "main-line",
  "texture-line",
  "depth",
];

interface StudioBg3dHistorySnapshot {
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}

interface StudioBg3dPlacementPreviewAsset {
  readonly modelId: string;
  readonly name: string;
  /** Bounds after import normalization and auto-fit, before instance transform. */
  readonly size: readonly [number, number, number];
  /** Bottom-center insertion point in the cached model root's local/world-at-identity space. */
  readonly localInsertionPoint: readonly [number, number, number];
}

interface StudioBg3dPhysicsSession {
  readonly document: StudioBg3dSceneDocument;
  readonly world: StudioBg3dPhysicsWorld;
  readonly timeline: StudioBg3dPhysicsTimelineResult;
  readonly initialDynamicSamples: readonly StudioBg3dPhysicsTransformSample[];
  readonly sourceToken: string;
}

function describeStudioBg3dPhysicsStatus(
  phase: StudioBg3dPhysicsPhase,
  errorMessage: string | null,
): string {
  switch (phase) {
    case "idle":
      return "물리 미리보기를 시작할 준비가 되었습니다.";
    case "loading":
      return "물리 미리보기 계산을 시작했습니다.";
    case "running":
      return "물리 미리보기 재생을 시작했습니다.";
    case "paused":
      return "물리 미리보기를 일시정지했습니다.";
    case "complete":
      return "물리 미리보기 재생이 완료되었습니다. 다시 재생하거나 현재 자세를 적용할 수 있습니다.";
    case "baking":
      return "현재 물리 자세를 장면에 적용하고 있습니다.";
    case "error":
      return errorMessage ?? "물리 미리보기를 계속할 수 없습니다.";
  }
}

function resolveStudioBg3dReturnFocus(dialog: HTMLElement | null): HTMLElement | null {
  if (!dialog) return null;
  const ownerDocument = dialog.ownerDocument;
  const activeElement = ownerDocument.activeElement;
  if (
    activeElement && activeElement !== ownerDocument.body &&
    !dialog.contains(activeElement) &&
    typeof (activeElement as HTMLElement).focus === "function"
  ) {
    // Returning null lets the shared modal owner capture the exact still-mounted launcher.
    return null;
  }

  const candidates = [...ownerDocument.querySelectorAll<HTMLButtonElement>("button:not([disabled])")]
    .filter((button) => !dialog.contains(button) && button.getClientRects().length > 0);
  const normalizedText = (button: HTMLButtonElement) =>
    button.textContent?.replace(/\s+/gu, " ").trim() ?? "";
  return candidates.find((button) =>
    button.dataset.studioBg3dLauncher === "true" ||
    button.title === "3D 배경 재편집" ||
    normalizedText(button) === "3D 배경"
  ) ?? candidates.find((button) =>
    button.getAttribute("aria-haspopup") === "menu" && normalizedText(button).startsWith("배경")
  ) ?? null;
}

function createStudioBg3dHistorySnapshot(input: {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}): StudioBg3dHistorySnapshot {
  return {
    primitives: clonePrimitives([...input.primitives]),
    customModels: cloneBgCustomModelInstances([...input.customModels]),
    document: input.document,
  };
}
type ModelRootCacheEntry = Pick<StudioBg3dThreeLoadSuccess, "root" | "dispose" | "animations"> & {
  readonly record: Bg3dVerifiedStoredRecord;
  readonly metrics: StudioBg3dThreeLoadSuccess["metrics"];
  readonly admittedProfiles: Set<StudioBg3dResolvedDeviceQuality["profile"]>;
  readonly joints: readonly StudioBg3dThreeJointDescriptor[];
  readonly morphTargets: readonly StudioBg3dThreeMorphDescriptor[];
  readonly semanticMaterials: StudioBg3dSemanticMaterialClassificationResult;
  readonly genericHints: StudioGeneric3dManifestHints;
};

function inspectStudioGeneric3dRuntimeHints(
  root: THREE.Object3D,
  joints: readonly StudioBg3dThreeJointDescriptor[],
): StudioGeneric3dManifestHints {
  let parts = 0;
  let skinnedMeshes = 0;
  let normalMaps = 0;
  const nodeNames: string[] = [];
  root.traverse((object) => {
    if (object.name && nodeNames.length < 4_096) nodeNames.push(object.name);
    const renderable = object as THREE.Mesh & { readonly isSkinnedMesh?: boolean };
    if (!renderable.isMesh) return;
    parts += 1;
    if (renderable.isSkinnedMesh === true) skinnedMeshes += 1;
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    for (const material of materials) {
      const mapped = material as THREE.Material & {
        readonly normalMap?: { readonly isTexture?: boolean } | null;
        readonly bumpMap?: { readonly isTexture?: boolean } | null;
      };
      if (mapped.normalMap?.isTexture === true || mapped.bumpMap?.isTexture === true) {
        normalMaps += 1;
      }
    }
  });
  return Object.freeze({
    parts,
    // The current scene schema persists an instance root transform and skeletal pose, but not
    // arbitrary imported child-node transforms. Keep detected parts visible without promising an
    // edit that would disappear after save/reopen.
    partTransformsSupported: false,
    bones: new Set(joints.map((joint) => joint.canonicalKey)).size,
    skinnedMeshes,
    normalMaps,
    nodeNames: Object.freeze(nodeNames),
  });
}

interface ModelThumbnailGpuLease {
  readonly released: Promise<void>;
  release(): void;
}

type StudioBg3dModelThumbnailCaptureControllerConstructor =
  typeof import("./studio-bg3d-model-thumbnail-capture").StudioBg3dModelThumbnailCaptureController;

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

let fallbackLtUserPresetIdSequence = 0;

function getBrowserLtPresetStorage(): StudioBg3dLtPresetStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function fallbackLtUserPresetToken(): string {
  fallbackLtUserPresetIdSequence += 1;
  const randomWords = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0x1_0000_0000).toString(16).padStart(8, "0")
  ).join("");
  return `fallback-${randomWords}-${fallbackLtUserPresetIdSequence.toString(36)}`;
}

/**
 * Generates a caller-owned stable id. Web Crypto is preferred; the non-security fallback combines
 * random words with a monotonic sequence and verifies every candidate against current ids. It
 * never derives identity from a mutable display name or from wall-clock time alone.
 */
function generateLtUserPresetId(payload: StudioBg3dLtPresetPayload): string | null {
  const occupied = new Set([
    ...STUDIO_BG3D_LT_BUILT_IN_PRESETS.map((preset) => preset.id),
    ...payload.presets.map((preset) => preset.id),
  ]);
  for (let attempt = 0; attempt < 128; attempt += 1) {
    let token: string | null = null;
    try {
      const cryptoApi = globalThis.crypto;
      if (typeof cryptoApi?.randomUUID === "function") {
        token = cryptoApi.randomUUID();
      } else if (typeof cryptoApi?.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch {
      token = null;
    }
    const id = `user.${token ?? fallbackLtUserPresetToken()}`;
    if (id.length <= 80 && !occupied.has(id)) return id;
  }
  return null;
}

function ltUserPresetFailureMessage(
  reason: StudioBg3dLtUserPresetMutationFailureReason
): string {
  switch (reason) {
    case "built-in-id":
      return "기본 프리셋과 같은 ID는 사용할 수 없습니다.";
    case "duplicate-id":
      return "같은 사용자 프리셋 ID가 이미 있습니다.";
    case "max-count":
      return `사용자 프리셋은 최대 ${STUDIO_BG3D_LT_PRESET_MAX_COUNT}개까지 저장할 수 있습니다.`;
    case "not-found":
      return "선택한 사용자 프리셋을 찾을 수 없습니다. 목록을 다시 열어 주세요.";
    case "invalid-name":
      return "이름은 앞뒤 공백이나 제어 문자 없이 입력해 주세요.";
    case "invalid-payload":
      return "프리셋 라이브러리 상태가 올바르지 않아 저장하지 않았습니다.";
    case "invalid-preset":
      return "이름·설명과 현재 LT 설정을 확인해 주세요.";
    case "serialization-failed":
      return "프리셋을 안전한 저장 형식으로 만들지 못했습니다.";
  }
}

function waitForStudioBg3dPaintFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

const STUDIO_BG3D_LT_INSERT_SYNC_FALLBACK_MAX_PIXELS = 1_048_576;
const STUDIO_BG3D_LT_INSERT_WORKER_TIMEOUT_MS = 120_000;

/**
 * Interactive insert compatibility encoder. LT detection runs in a Worker, while this bounded
 * DOM-canvas PNG boundary intentionally remains on the main thread until the insert contract can
 * accept Blob-backed work assets. Keeping it named and isolated makes that ownership testable.
 */
function encodeStudioBg3dLtLayers(
  layers: readonly StudioBg3dLtRasterLayer[]
): { readonly layers: readonly StudioBackground3DLtLayer[]; readonly compositePngDataUrl: string } {
  if (layers.length === 0) throw new Error("LT layers are empty.");
  const width = layers[0]?.width ?? 0;
  const height = layers[0]?.height ?? 0;
  if (width < 1 || height < 1 || layers.some((layer) => layer.width !== width || layer.height !== height)) {
    throw new Error("LT layer dimensions do not match.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D PNG context unavailable.");
  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  const compositeContext = compositeCanvas.getContext("2d");
  if (!compositeContext) throw new Error("2D composite context unavailable.");
  const encodedLayers = layers.map((layer) => {
    const imageData = context.createImageData(width, height);
    imageData.data.set(layer.data);
    context.clearRect(0, 0, width, height);
    context.putImageData(imageData, 0, 0);
    compositeContext.drawImage(canvas, 0, 0);
    const pngDataUrl = canvas.toDataURL("image/png").split("#", 1)[0];
    if (!pngDataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("LT layer PNG encoding failed.");
    }
    return Object.freeze({
      role: layer.role,
      pngDataUrl,
      width,
      height,
    });
  });
  const compositePngDataUrl = compositeCanvas.toDataURL("image/png").split("#", 1)[0];
  if (!compositePngDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("LT composite PNG encoding failed.");
  }
  return Object.freeze({
    layers: Object.freeze(encodedLayers),
    compositePngDataUrl,
  });
}

function ltOutputFingerprint(
  line: StudioBg3dLineOutputSettings,
  tone: StudioBg3dToneOutputSettings
): string {
  return JSON.stringify([line, tone]);
}

function matchingLtPreset(
  line: StudioBg3dLineOutputSettings,
  tone: StudioBg3dToneOutputSettings,
  userPayload: StudioBg3dLtPresetPayload,
  preferredId: string | null
): StudioBg3dLtPreset | null {
  const fingerprint = ltOutputFingerprint(line, tone);
  const matches = (preset: StudioBg3dLtPreset) =>
    ltOutputFingerprint(preset.line, preset.tone) === fingerprint;
  if (preferredId) {
    const preferred = STUDIO_BG3D_LT_BUILT_IN_PRESETS.find((preset) => preset.id === preferredId)
      ?? userPayload.presets.find((preset) => preset.id === preferredId);
    if (preferred && matches(preferred)) return preferred;
  }
  return STUDIO_BG3D_LT_BUILT_IN_PRESETS.find(matches)
    ?? userPayload.presets.find(matches)
    ?? null;
}

function ltTonePreviewStyle(tone: StudioBg3dToneOutputSettings): CSSProperties {
  if (tone.mode === "none") {
    return { backgroundColor: "var(--color-card)", opacity: 0.45 };
  }

  const spacing = Math.max(4, Math.min(18, Math.round(360 / tone.frequency)));
  const angle = `${tone.angleDegrees}deg`;
  const base: CSSProperties = {
    backgroundColor: "var(--color-card)",
    color: "var(--color-fg-2)",
    opacity: tone.opacity,
  };
  if (tone.type === "color") {
    return {
      ...base,
      backgroundColor: "var(--color-card)",
      backgroundImage:
        "linear-gradient(135deg, var(--color-accent-soft), var(--color-cool))",
    };
  }
  if (tone.type === "grayscale" && tone.mode !== "screentone") {
    const stop = Math.round(100 / Math.max(2, tone.levels));
    return {
      ...base,
      backgroundImage: `repeating-linear-gradient(${angle}, currentColor 0 ${stop}%, transparent ${stop}% ${stop * 2}%)`,
    };
  }
  if (tone.pattern === "line") {
    return {
      ...base,
      backgroundImage: `repeating-linear-gradient(${angle}, currentColor 0 1px, transparent 1px ${spacing}px)`,
    };
  }
  if (tone.pattern === "crosshatch") {
    return {
      ...base,
      backgroundImage: `repeating-linear-gradient(${angle}, currentColor 0 1px, transparent 1px ${spacing}px), repeating-linear-gradient(${tone.angleDegrees + 90}deg, currentColor 0 1px, transparent 1px ${spacing}px)`,
    };
  }
  if (tone.pattern === "noise") {
    return {
      ...base,
      backgroundImage: "radial-gradient(circle at 25% 30%, currentColor 0 1px, transparent 1.5px), radial-gradient(circle at 70% 68%, currentColor 0 1px, transparent 1.5px)",
      backgroundSize: `${spacing}px ${spacing}px, ${spacing + 3}px ${spacing + 3}px`,
    };
  }
  return {
    ...base,
    backgroundImage: "radial-gradient(circle, currentColor 0 1px, transparent 1.5px)",
    backgroundSize: `${spacing}px ${spacing}px`,
  };
}

const BG_PANEL_TABS: Array<{ id: BgPanelTab; label: string; icon: typeof Boxes; hint: string }> = [
  { id: "shapes", label: "도형", icon: Boxes, hint: "추가 · 선택한 도형 수치 편집" },
  { id: "templates", label: "템플릿", icon: LayoutTemplate, hint: "교실·거리·카페처럼 완성된 공간을 한 번에 추가" },
  { id: "layers", label: "레이어", icon: Layers, hint: "목록 · 선택 · 복제 · 삭제" },
  { id: "view", label: "보기", icon: Camera, hint: "카메라 프리셋 · 선화 미리보기" },
  { id: "lt", label: "LT", icon: ScanLine, hint: "컬러 · 선화 · 톤 출력 설정" },
  { id: "models", label: "범용 3D", icon: PackageOpen, hint: "GLB · glTF · OBJ/MTL 가져오기와 모델 조작" },
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

const DEFAULT_CAMERA_POSITION: [number, number, number] = [4, 3, 6];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0.6, 0];

const CAMERA_PRESETS: Record<string, { label: string; position: [number, number, number]; target: [number, number, number] }> = {
  default: { label: "기본", position: DEFAULT_CAMERA_POSITION, target: DEFAULT_CAMERA_TARGET },
  front: { label: "정면", position: [0, 1.6, 9], target: [0, 0.9, 0] },
  top: { label: "위에서", position: [0, 10, 0.001], target: [0, 0, 0] },
  side: { label: "측면", position: [9, 1.6, 0], target: [0, 0.9, 0] },
};

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

type BrowserNavigatorCapabilities = Navigator & {
  readonly connection?: {
    readonly saveData?: boolean;
    addEventListener?: (type: "change", listener: () => void) => void;
    removeEventListener?: (type: "change", listener: () => void) => void;
  };
  readonly deviceMemory?: number;
};

interface ModelBindingMaps {
  readonly attachmentByStorageModelId: Map<string, StudioBg3dModelAttachment>;
  readonly storageModelIdByAttachmentId: Map<string, string>;
}

function canonicalSceneDocument(raw: StudioBg3dSceneDocument | undefined): StudioBg3dSceneDocument | null {
  if (!raw) return null;
  const migrated = migrateStudioBg3dSceneDocument(raw);
  const serialized = serializeStudioBg3dSceneDocument(migrated);
  return serialized ? parseStudioBg3dSceneDocument(serialized) : null;
}

function studioBg3dHistoryDocumentAtView(
  document: StudioBg3dSceneDocument,
  camera: StudioBg3dCameraSettings,
): StudioBg3dSceneDocument {
  return canonicalSceneDocument({ ...document, camera }) ?? document;
}

function createStudioBg3dShotId(
  shots: StudioBg3dSceneDocument["shots"],
  now = Date.now(),
): string {
  const existingIds = new Set(shots?.map((shot) => shot.id) ?? []);
  const stamp = Math.max(0, Math.floor(now)).toString(36);
  let ordinal = (shots?.length ?? 0) + 1;
  let candidate = `shot-${stamp}-${ordinal.toString(36)}`;
  while (existingIds.has(candidate)) {
    ordinal += 1;
    candidate = `shot-${stamp}-${ordinal.toString(36)}`;
  }
  return candidate;
}

function collectDeviceSignals(host?: HTMLElement | null): StudioBg3dDeviceSignals {
  if (typeof window === "undefined" || typeof navigator === "undefined") return {};
  const browserNavigator = navigator as BrowserNavigatorCapabilities;
  const rect = host?.getBoundingClientRect();
  let pointer: StudioBg3dDeviceSignals["pointer"] = "none";
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(pointer: coarse)").matches) pointer = "coarse";
    else if (window.matchMedia("(pointer: fine)").matches) pointer = "fine";
  }
  return {
    cssWidth: rect && rect.width >= 1 ? rect.width : window.innerWidth,
    cssHeight: rect && rect.height >= 1 ? rect.height : window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    pointer,
    saveData: browserNavigator.connection?.saveData,
    deviceMemoryGb: browserNavigator.deviceMemory,
    hardwareConcurrency: browserNavigator.hardwareConcurrency,
  };
}

function resolveDeviceQuality(
  document: StudioBg3dSceneDocument,
  host: HTMLElement | null,
  mode: "edit" | "capture" = "edit"
): StudioBg3dResolvedDeviceQuality {
  return resolveStudioBg3dDeviceQuality({
    document,
    mode,
    signals: collectDeviceSignals(host),
  });
}

function rightsMatchRecord(
  attachment: StudioBg3dModelAttachment,
  record: Bg3dVerifiedStoredRecord
): boolean {
  return attachment.rights.status === record.rights.status
    && attachment.rights.commercialUse === record.rights.commercialUse
    && attachment.rights.attributionRequired === record.rights.attributionRequired
    && attachment.rights.attribution === record.rights.attribution
    && attachment.rights.licenseName === record.rights.licenseName;
}

function attachmentMatchesRecord(
  attachment: StudioBg3dModelAttachment,
  record: Bg3dVerifiedStoredRecord
): boolean {
  return attachment.hash === record.contentHash
    && attachment.byteSize === record.byteSize
    && attachment.mime === record.mime
    && rightsMatchRecord(attachment, record);
}

function bindModelAttachment(
  maps: ModelBindingMaps,
  record: Bg3dVerifiedStoredRecord,
  attachment: StudioBg3dModelAttachment
): boolean {
  if (!attachmentMatchesRecord(attachment, record) || attachment.id === record.id) return false;
  const existingAttachment = maps.attachmentByStorageModelId.get(record.id);
  const existingStorageId = maps.storageModelIdByAttachmentId.get(attachment.id);
  if (
    (existingAttachment && existingAttachment.id !== attachment.id) ||
    (existingStorageId && existingStorageId !== record.id)
  ) {
    return false;
  }
  maps.attachmentByStorageModelId.set(record.id, attachment);
  maps.storageModelIdByAttachmentId.set(attachment.id, record.id);
  return true;
}

/** Writes sanitized generic-3D workflow metadata onto a scene-local attachment (fail-closed). */
function withStudioGeneric3dWorkflowMetadata(
  attachment: StudioBg3dModelAttachment,
  meta: {
    readonly classification?: StudioGeneric3dClassification | null;
    readonly sourceFormat?: StudioGeneric3dSourceFormat | null;
  },
): StudioBg3dModelAttachment {
  return attachStudioGeneric3dWorkflowMetadata(
    { ...attachment },
    {
      ...(meta.classification != null ? { classification: meta.classification } : {}),
      ...(meta.sourceFormat != null ? { sourceFormat: meta.sourceFormat } : {}),
    },
  );
}

function readGenericWorkflowMapsFromAttachments(
  attachmentByStorageModelId: ReadonlyMap<string, StudioBg3dModelAttachment>,
): {
  readonly sourceFormats: Map<string, StudioGeneric3dSourceFormat>;
  readonly classifications: Map<string, StudioGeneric3dClassification>;
} {
  const sourceFormats = new Map<string, StudioGeneric3dSourceFormat>();
  const classifications = new Map<string, StudioGeneric3dClassification>();
  for (const [storageId, attachment] of attachmentByStorageModelId) {
    const workflow = parseStudioGeneric3dWorkflowMetadata(attachment);
    if (!workflow) continue;
    if (workflow.sourceFormat) sourceFormats.set(storageId, workflow.sourceFormat);
    if (workflow.classification) classifications.set(storageId, workflow.classification);
  }
  return { sourceFormats, classifications };
}

async function admitAndCacheModel(args: {
  readonly record: Bg3dVerifiedStoredRecord;
  readonly document: StudioBg3dSceneDocument;
  readonly quality: StudioBg3dResolvedDeviceQuality;
  readonly cumulativeUsedBytes: number;
  readonly renderer: THREE.WebGLRenderer | null;
  readonly cache: Map<string, ModelRootCacheEntry>;
  readonly pending: Map<string, Promise<ModelRootCacheEntry>>;
  readonly isActive: () => boolean;
  /** Called only by the invocation that actually installs a newly decoded cache entry. */
  readonly onCacheEntryCreated?: (storageId: string, entry: ModelRootCacheEntry) => void;
}): Promise<ModelRootCacheEntry> {
  const policy = deriveStudioBg3dGlbValidationPolicy(args.document, args.quality);
  const selectedBudgets: StudioBg3dSceneBudgets = policy.budgets[policy.profile];
  const cached = args.cache.get(args.record.id);
  if (cached) {
    // Decoded-byte attestation is cached per profile, but scene admission is not. A re-add after
    // deletion and every queued placement must be checked against the current live scene budget.
    assertStudioBg3dModelPlacementAdmission({
      record: args.record,
      cachedRecord: cached.record,
      metrics: cached.metrics,
      budgets: selectedBudgets,
      cumulativeUsedBytes: args.cumulativeUsedBytes,
      maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
    });
    if (!cached.admittedProfiles.has(policy.profile)) {
      await admitStoredBg3dModelForRendering(args.record.id, {
        profile: policy.profile,
        budgets: policy.budgets,
        cumulativeUsedBytes: args.cumulativeUsedBytes,
        maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
      });
      if (!args.isActive()) throw new StudioBg3dStaleModalOperationError();
      cached.admittedProfiles.add(policy.profile);
    }
    if (!args.isActive()) throw new StudioBg3dStaleModalOperationError();
    return cached;
  }
  const pending = args.pending.get(args.record.id);
  if (pending) {
    await pending;
    return admitAndCacheModel(args);
  }

  const task = studioBg3dGlobalAssetLoadGate.run(async (): Promise<ModelRootCacheEntry> => {
    const verification = await admitStoredBg3dModelForRendering(args.record.id, {
      profile: policy.profile,
      budgets: policy.budgets,
      cumulativeUsedBytes: args.cumulativeUsedBytes,
      maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
    });
    if (!args.isActive()) throw new StudioBg3dStaleModalOperationError();
    const loaded = await loadVerifiedStudioBg3dGlbWithThree(verification, selectedBudgets, {
      renderer: args.renderer,
    });
    if (!loaded.ok) throw new StudioBg3dThreeOperationError(loaded.code);
    assertStudioBg3dModelPlacementAdmission({
      record: args.record,
      metrics: loaded.metrics,
      budgets: selectedBudgets,
      cumulativeUsedBytes: args.cumulativeUsedBytes,
      maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
    });
    loaded.root.scale.setScalar(computeAutoFitScale(measureBg3dObjectSize(loaded.root)));
    loaded.root.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (!renderable.isMesh) return;
      renderable.castShadow = true;
      renderable.receiveShadow = true;
    });
    if (!args.isActive()) {
      loaded.dispose();
      throw new Error("3D 편집기가 닫혀 모델 불러오기를 중단했습니다.");
    }
    const joints = collectStudioBg3dThreeJoints(loaded.root);
    const entry: ModelRootCacheEntry = {
      root: loaded.root,
      animations: loaded.animations,
      dispose: loaded.dispose,
      record: args.record,
      metrics: loaded.metrics,
      admittedProfiles: new Set([policy.profile]),
      joints,
      morphTargets: collectStudioBg3dThreeMorphTargets(loaded.root),
      semanticMaterials: classifyStudioBg3dThreeSemanticMaterials(loaded.root),
      genericHints: inspectStudioGeneric3dRuntimeHints(loaded.root, joints),
    };
    args.cache.set(args.record.id, entry);
    args.onCacheEntryCreated?.(args.record.id, entry);
    return entry;
  }, { isCurrent: args.isActive });
  args.pending.set(args.record.id, task);
  try {
    return await task;
  } finally {
    if (args.pending.get(args.record.id) === task) args.pending.delete(args.record.id);
  }
}

function disposeModelCache(cache: Map<string, ModelRootCacheEntry>): void {
  for (const entry of cache.values()) entry.dispose();
  cache.clear();
}

/* ── 헬퍼: 라디안 ↔ 도(deg) 변환. 상태 자체는 항상 라디안(BgPrimitive 계약)으로 두고
   숫자 패널 경계에서만 변환한다 — three.js 회전 API와의 단위 불일치를 막기 위함. */
function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function quaternionToEulerDegrees(rotation: StudioBg3dQuaternion): [number, number, number] {
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(...rotation),
    "XYZ",
  );
  return [radToDeg(euler.x), radToDeg(euler.y), radToDeg(euler.z)];
}
function eulerDegreesToQuaternion(rotation: readonly [number, number, number]): StudioBg3dQuaternion {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    degToRad(rotation[0]),
    degToRad(rotation[1]),
    degToRad(rotation[2]),
    "XYZ",
  )).normalize();
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}
async function acquireStudioBg3dCaptureAdapterAfterViewTransition(
  ...args: Parameters<StudioBg3dThreeWebglCaptureRuntime["acquireStudioBg3dCaptureAdapterAfterViewTransition"]>
) {
  const runtime = await loadStudioBg3dThreeWebglCaptureRuntime();
  return runtime.acquireStudioBg3dCaptureAdapterAfterViewTransition(...args);
}

async function captureStudioBg3dRaster(
  ...args: Parameters<StudioBg3dThreeWebglCaptureRuntime["captureStudioBg3dRaster"]>
) {
  const runtime = await loadStudioBg3dThreeWebglCaptureRuntime();
  return runtime.captureStudioBg3dRaster(...args);
}

async function getStudioBg3dCaptureSourceSize(
  ...args: Parameters<StudioBg3dThreeWebglCaptureRuntime["getStudioBg3dCaptureSourceSize"]>
) {
  const runtime = await loadStudioBg3dThreeWebglCaptureRuntime();
  return runtime.getStudioBg3dCaptureSourceSize(...args);
}

type StudioBg3dThreeWebglCaptureRuntime = Pick<
  typeof import("./studio-bg3d-three-webgl-capture"),
  | "acquireStudioBg3dCaptureAdapterAfterViewTransition"
  | "captureStudioBg3dRaster"
  | "createStudioBg3dThreeWebglCaptureAdapter"
  | "getStudioBg3dCaptureSourceSize"
>;

let studioBg3dThreeWebglCaptureRuntimePromise:
  Promise<StudioBg3dThreeWebglCaptureRuntime> | null = null;

function loadStudioBg3dThreeWebglCaptureRuntime(): Promise<StudioBg3dThreeWebglCaptureRuntime> {
  const existing = studioBg3dThreeWebglCaptureRuntimePromise;
  if (existing) return existing;
  const pending = import("./studio-bg3d-three-webgl-capture").then((module) => Object.freeze({
    acquireStudioBg3dCaptureAdapterAfterViewTransition:
      module.acquireStudioBg3dCaptureAdapterAfterViewTransition,
    captureStudioBg3dRaster: module.captureStudioBg3dRaster,
    createStudioBg3dThreeWebglCaptureAdapter:
      module.createStudioBg3dThreeWebglCaptureAdapter,
    getStudioBg3dCaptureSourceSize: module.getStudioBg3dCaptureSourceSize,
  }));
  studioBg3dThreeWebglCaptureRuntimePromise = pending;
  void pending.catch(() => {
    if (studioBg3dThreeWebglCaptureRuntimePromise === pending) {
      studioBg3dThreeWebglCaptureRuntimePromise = null;
    }
  });
  return pending;
}

type StudioBg3dCameraWithView = THREE.Camera & {
  view?: {
    enabled: boolean;
    fullWidth: number;
    fullHeight: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null;
  setViewOffset?: (
    fullWidth: number,
    fullHeight: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  clearViewOffset?: () => void;
};

/**
 * 캡처 프레임을 Three 카메라의 view 창으로 잡고, 되돌리는 함수를 돌려준다. 크롭을 적용할 수 없으면
 * null을 돌려준다 — 호출자는 늘어난 래스터를 삽입하는 대신 트랜잭션을 실패시켜야 한다.
 *
 * 뷰포트와 같은 프레임(자동/일치)이면 카메라를 전혀 건드리지 않는다. 크롭이 있을 때만 이전 view를
 * 스냅샷해 두었다가 정확히 같은 상태로 복원하므로, 렌즈 시프트 같은 기존 설정이 살아남는다.
 */
function applyStudioBg3dCaptureFrameViewOffset(
  camera: THREE.Camera | null,
  frame: StudioBg3dCaptureFrame,
  viewport: { readonly width: number; readonly height: number },
): (() => void) | null {
  if (frame.fit === "exact") return () => {};
  const target = camera as StudioBg3dCameraWithView | null;
  if (
    !target ||
    typeof target.setViewOffset !== "function" ||
    typeof target.clearViewOffset !== "function"
  ) {
    return null;
  }
  const previous = target.view && target.view.enabled ? { ...target.view } : null;
  const offset = resolveStudioBg3dCaptureViewOffset({
    frame,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    baseWindow: previous && previous.fullWidth > 0 && previous.fullHeight > 0
      ? {
          offsetX: previous.offsetX / previous.fullWidth,
          offsetY: previous.offsetY / previous.fullHeight,
          width: previous.width / previous.fullWidth,
          height: previous.height / previous.fullHeight,
        }
      : null,
  });
  if (!offset) return null;
  target.setViewOffset(
    offset.fullWidth,
    offset.fullHeight,
    offset.offsetX,
    offset.offsetY,
    offset.width,
    offset.height,
  );
  return () => {
    if (previous) {
      target.setViewOffset?.(
        previous.fullWidth,
        previous.fullHeight,
        previous.offsetX,
        previous.offsetY,
        previous.width,
        previous.height,
      );
      return;
    }
    target.clearViewOffset?.();
  };
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

/** Keeps persisted exposure/tone-mapping authoritative after R3F creates or reuses WebGLRenderer. */
function StudioBg3dWebglRenderSettingsController({
  render,
}: {
  readonly render: StudioBg3dSceneDocument["render"];
}) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    applyStudioBg3dThreeWebglRenderSettings(gl, render);
  }, [gl, render]);
  return null;
}

/* 장면 배경이 없는 흰색 모드와 절차적 파노라마 생성 전 프레임의 안전한 clear color를 적용한다. */
function SkyClearColorController({ clearColor }: { clearColor: string }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.setClearColor(clearColor, 1);
  }, [gl, clearColor]);
  return null;
}

type OrbitLike = { target?: THREE.Vector3; update?: () => void } | null;

/* Canvas 내부에서 카메라/컨트롤을 잡아 줌·프리셋 같은 명령형 동작을 패널 오버레이(Canvas 밖 HTML 버튼)에
   노출한다. target을 OrbitControls의 JSX prop으로 매 렌더 다시 넘기면(리터럴 배열은 매번 새 참조라
   drei가 매 커밋마다 controls.target.set(...)을 호출) 사용자가 패닝한 뒤에도 다른 상태 변경(도형 이동 등)
   때마다 시점이 원점으로 되돌아가 버린다. 그래서 초기 타깃/프리셋 적용은 전부 여기서 명령형으로만 수행한다. */
function BgViewportController({ onReady }: { onReady: (api: BgViewportApi | null) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitLike;
  const viewportSize = useThree((s) => s.size);

  useEffect(() => {
    if (controls?.target) {
      controls.target.set(DEFAULT_CAMERA_TARGET[0], DEFAULT_CAMERA_TARGET[1], DEFAULT_CAMERA_TARGET[2]);
      controls.update?.();
    }
  }, [controls]);

  useEffect(() => {
    const readView = (): StudioBg3dCameraSettings => {
      const target = controls?.target ?? new THREE.Vector3(...DEFAULT_CAMERA_TARGET);
      const fovDegrees = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
      const lensShift = camera.view?.enabled && camera.view.fullWidth > 0 && camera.view.fullHeight > 0
        ? [
            camera.view.offsetX / camera.view.fullWidth,
            camera.view.offsetY / camera.view.fullHeight,
          ] as const
        : null;
      return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [target.x, target.y, target.z],
        fovDegrees,
        projection: camera instanceof THREE.OrthographicCamera ? "orthographic" : "perspective",
        zoom: camera.zoom,
        ...(lensShift ? { lensShift } : {}),
      };
    };
    onReady({
      zoomBy: (factor) => applyStudioBg3dProjectionAwareZoom(
        camera,
        controls,
        factor,
        DEFAULT_CAMERA_TARGET,
      ),
      applyPreset: (presetId) => {
        const preset = CAMERA_PRESETS[presetId];
        if (!preset) return false;
        camera.position.set(preset.position[0], preset.position[1], preset.position[2]);
        camera.updateMatrixWorld();
        if (controls?.target) {
          controls.target.set(preset.target[0], preset.target[1], preset.target[2]);
          controls.update?.();
        } else {
          camera.lookAt(preset.target[0], preset.target[1], preset.target[2]);
        }
        return true;
      },
      applyView: (view) => applyStudioBg3dViewToThreeCamera(camera, controls, view),
      readView,
      readFramingState: () => {
        const viewportAspect = viewportSize.width / viewportSize.height;
        if (!Number.isFinite(viewportAspect) || viewportAspect <= 0) return null;
        const view = readView();
        if (!(camera instanceof THREE.OrthographicCamera)) {
          return { view, viewportAspect };
        }
        const width = Math.abs(camera.right - camera.left);
        const height = Math.abs(camera.top - camera.bottom);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          return null;
        }
        return {
          view,
          viewportAspect,
          orthographicFrustumAtZoomOne: { width, height },
        };
      },
      focusOn: (position: [number, number, number]) => {
        const newTarget = new THREE.Vector3(...position);
        if (controls?.target) {
          const offset = camera.position.clone().sub(controls.target);
          controls.target.copy(newTarget);
          camera.position.copy(newTarget).add(offset);
          camera.updateMatrixWorld();
          controls.update?.();
        } else {
          camera.lookAt(newTarget);
        }
      },
    });
    return () => onReady(null);
  }, [camera, controls, onReady, viewportSize.height, viewportSize.width]);

  return null;
}

/* 뷰포트 공간감을 위한 그리드+바닥 원반. 씬 데이터(primitives)에는 절대 포함되지 않고
   내보내기(라인아트 캡처) 시에는 항상 숨긴다 — 참조용 뷰포트 보조물일 뿐 결과물이 아니다. */
function BgGroundHelper({ visible }: { visible: boolean }) {
  return (
    <group ref={registerStudioBg3dCaptureExcludedObject} visible={visible}>
      <gridHelper args={[40, 40, "#c7ccd6", "#e7e9ee"]} position={[0, -0.001, 0]} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]}>
        <circleGeometry args={[9, 40]} />
        <meshBasicMaterial color="#eef1f5" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

/** 태양 릭 시간 슬라이더 표기(24h "HH:MM"). 0.25h 스텝 외 임의 소수도 안전하게 반올림한다. */
function formatBg3dSunTime(hours: number): string {
  const safe = Number.isFinite(hours) ? ((hours % 24) + 24) % 24 : 12;
  let wholeHours = Math.floor(safe);
  let minutes = Math.round((safe - wholeHours) * 60);
  if (minutes === 60) {
    wholeHours = (wholeHours + 1) % 24;
    minutes = 0;
  }
  return `${String(wholeHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/* 단면(Section) 컷 — 전역 renderer.clippingPlanes 하나로 SketchUp 단면 평면을 재현한다.
   평면 수학은 studio-bg3d-section-plane.ts의 순수 함수가 담당하고, 여기서는 상태의 원시 필드만
   의존성으로 삼아(객체 identity 아님) 실제 값이 바뀔 때만 렌더러에 반영한다. 언마운트/비활성 시
   클리핑 배열을 비워 원상 복구한다 — 평면은 GPU 자원이 아니라 별도 dispose가 필요 없다. */
function applyBg3dSectionClippingPlanes(
  gl: THREE.WebGLRenderer,
  state: StudioBg3dSectionPlaneState,
): void {
  const equation = computeStudioBg3dSectionPlane(state);
  gl.clippingPlanes = equation
    ? [
        new THREE.Plane(
          new THREE.Vector3(equation.normal[0], equation.normal[1], equation.normal[2]),
          equation.constant,
        ),
      ]
    : [];
}

function clearBg3dSectionClippingPlanes(gl: THREE.WebGLRenderer): void {
  gl.clippingPlanes = [];
}

function BgSectionPlaneController({ state }: { state: StudioBg3dSectionPlaneState }) {
  const gl = useThree((s) => s.gl);
  const { enabled, axis, offset, flip } = state;
  useEffect(() => {
    applyBg3dSectionClippingPlanes(gl, { enabled, axis, offset, flip });
    return () => clearBg3dSectionClippingPlanes(gl);
  }, [gl, enabled, axis, offset, flip]);
  return null;
}

/* 160cm 인체 스케일 가이드 — SketchUp의 기준 인물처럼 벽·가구 크기를 즉시 가늠하게 하는
   뷰포트 보조물. BgGroundHelper와 같은 캡처 제외 계약이라 씬 데이터·PNG/LT 결과물에는 절대
   포함되지 않고, raycast를 비워 선택·표면 스냅을 가로채지 않는다. */
const BG_SCALE_GUIDE_PARTS = buildStudioBg3dScaleGuideParts();

function BgScaleGuide({ visible }: { visible: boolean }) {
  return (
    <group ref={registerStudioBg3dCaptureExcludedObject} visible={visible} position={[0, 0, 0]}>
      {BG_SCALE_GUIDE_PARTS.map((part) => (
        <mesh
          key={part.name}
          raycast={() => null}
          position={[part.position[0], part.position[1], part.position[2]]}
          scale={[part.scale[0], part.scale[1], part.scale[2]]}
        >
          {part.shape === "sphere" ? (
            <sphereGeometry args={[0.5, 16, 12]} />
          ) : (
            <boxGeometry args={[1, 1, 1]} />
          )}
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function BgPlacementPreview({
  asset,
  preview,
}: {
  asset: StudioBg3dPlacementPreviewAsset;
  preview: StudioBg3dPlacementPreviewState;
}) {
  const safeSize = asset.size.map((value) => (
    Number.isFinite(value) ? Math.max(0.08, Math.abs(value)) : 0.08
  )) as [number, number, number];
  const halfHeight = safeSize[1] / 2;
  const { worldNormal, worldPosition, yawDegrees } = preview.placement;
  const normal = new THREE.Vector3(...worldNormal).normalize();
  const orientation = new THREE.Quaternion()
    .setFromAxisAngle(normal, THREE.MathUtils.degToRad(-yawDegrees))
    .multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal));
  const center: [number, number, number] = [
    worldPosition[0] + worldNormal[0] * halfHeight,
    worldPosition[1] + worldNormal[1] * halfHeight,
    worldPosition[2] + worldNormal[2] * halfHeight,
  ];

  return (
    <group
      ref={registerStudioBg3dCaptureExcludedObject}
      position={center}
      quaternion={orientation}
    >
      <mesh raycast={() => null} renderOrder={20}>
        <boxGeometry args={safeSize} />
        <meshBasicMaterial
          color={0xf97316}
          depthWrite={false}
          opacity={0.16}
          transparent
        />
      </mesh>
      <mesh raycast={() => null} renderOrder={21}>
        <boxGeometry args={safeSize} />
        <meshBasicMaterial
          color={0xc2410c}
          depthWrite={false}
          opacity={0.92}
          transparent
          wireframe
        />
      </mesh>
    </group>
  );
}

function BgAdaptiveDprController({
  targetFps,
  paused,
  onScaleChange,
}: {
  targetFps: number;
  paused: boolean;
  onScaleChange: (scale: number) => void;
}) {
  const governorRef = useRef(createStudioBg3dFrameQualityState(targetFps));
  const scaleChangeRef = useRef(onScaleChange);
  useEffect(() => {
    scaleChangeRef.current = onScaleChange;
  }, [onScaleChange]);
  useEffect(() => {
    governorRef.current = createStudioBg3dFrameQualityState(targetFps);
    scaleChangeRef.current(1);
  }, [targetFps]);
  useFrame((_state, deltaSeconds) => {
    const previous = governorRef.current;
    const next = advanceStudioBg3dFrameQuality(previous, {
      deltaSeconds,
      targetFps,
      paused,
    });
    governorRef.current = next;
    if (next.dprScale !== previous.dprScale) scaleChangeRef.current(next.dprScale);
  });
  return null;
}

interface BgPrimitiveMeshProps {
  prim: BgPrimitive;
  geometryPool: StudioBg3dPrimitiveGeometryPool;
  lineArt: boolean;
  showEdges: boolean;
  selected: boolean;
  onSelect: (id: string, isMulti: boolean) => void;
  onSurfacePick: (id: string, event: ThreeEvent<MouseEvent>) => boolean;
  registerRef: (id: string, obj: THREE.Group | null) => void;
  children?: React.ReactNode;
}

/* 도형 하나의 렌더 — 셰이딩 채움 + 검은 엣지 오버레이를 항상 함께 그린다.
   라인아트 모드에서도 채움 메시를 visible={false}로 숨기지 않고 unlit 흰색(meshBasicMaterial)으로만
   바꾸는 게 핵심: 깊이쓰기가 계속 켜져 있어 (1) 가려진 도형의 엣지가 앞 도형에 정확히 가려지는
   hidden-line-removal이 유지되고 (2) three.js/R3F가 invisible 오브젝트는 레이캐스트에서 제외하므로
   라인아트 미리보기 중에도 클릭 선택이 계속 동작한다. */
function BgPrimitiveMesh({ prim, geometryPool, lineArt, showEdges, selected, onSelect, onSurfacePick, registerRef, children }: BgPrimitiveMeshProps) {
  const { geometry, edges } = geometryPool.get(prim.kind);
  const groupRef = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (groupRef.current) synchronizeStudioBg3dRootMatrix(groupRef.current, selected);
  }, [prim.position, prim.rotation, prim.scale, selected]);
  useEffect(() => {
    registerRef(prim.id, groupRef.current);
    return () => registerRef(prim.id, null);
  }, [prim.id, registerRef]);

  const visible = isBgObjectVisible(prim);

  return (
    <group
      ref={groupRef}
      position={prim.position}
      rotation={prim.rotation}
      scale={prim.scale}
      visible={visible}
      onClick={(e) => {
        e.stopPropagation();
        if (onSurfacePick(prim.id, e)) return;
        onSelect(prim.id, e.shiftKey || e.metaKey || e.ctrlKey);
      }}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
        {lineArt ? (
          <meshBasicMaterial color="#ffffff" polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        ) : (
          <meshStandardMaterial color={prim.color} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        )}
      </mesh>
      {showEdges ? (
        <lineSegments ref={registerStudioBg3dCaptureExcludedObject} geometry={edges}>
          <lineBasicMaterial color="#000000" />
        </lineSegments>
      ) : null}
      {children}
    </group>
  );
}

interface BgCustomModelMeshProps {
  instance: BgCustomModelInstance;
  cachedRoot: THREE.Object3D | undefined;
  animations: readonly THREE.AnimationClip[];
  selected: boolean;
  capturing: boolean;
  targetFps: number;
  lodBias: number;
  onSelect: (id: string, isMulti: boolean) => void;
  onSurfacePick: (id: string, event: ThreeEvent<MouseEvent>) => boolean;
  registerRef: (id: string, obj: THREE.Group | null) => void;
  registerAnimationTime: (id: string, reader: (() => number) | null) => void;
  registerRigBake: (id: string, reader: StudioBg3dRigBakeReader | null) => void;
  onAnimationComplete: (id: string, timeSeconds: number) => void;
  onCloneStatus: (
    ids: readonly string[],
    status: "pending" | "ready" | "failed",
  ) => void;
  children?: React.ReactNode;
}

type StudioBg3dRigBakeReader = () => StudioBg3dRigPoseBakeSnapshot | null;

function studioBg3dMatricesDiffer(
  left: THREE.Matrix4 | null,
  right: THREE.Matrix4,
  epsilon = 1e-10,
): boolean {
  if (!left) return true;
  return left.elements.some((value, index) =>
    Math.abs(value - (right.elements[index] ?? Number.NaN)) > epsilon
  );
}

function BgCustomModelMesh({ instance, cachedRoot, animations, selected, capturing, targetFps, lodBias, onSelect, onSurfacePick, registerRef, registerAnimationTime, registerRigBake, onAnimationComplete, onCloneStatus, children }: BgCustomModelMeshProps) {
  // Geometry/textures stay cache-owned, while each render instance owns cloned materials so its
  // adjustments cannot leak into sibling placements or the verified source cache.
  const [editableClone, setEditableClone] = useState<StudioBg3dEditableThreeClone | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const lastConstraintWorldMatrixRef = useRef<THREE.Matrix4 | null>(null);
  useLayoutEffect(() => {
    if (groupRef.current) synchronizeStudioBg3dRootMatrix(groupRef.current, selected);
  }, [instance.position, instance.rotation, instance.scale, selected]);
  const localBoundsRef = useRef(new THREE.Sphere(new THREE.Vector3(), 1));
  const worldBoundsRef = useRef(new THREE.Sphere(new THREE.Vector3(), 1));
  const projectionMatrixRef = useRef(new THREE.Matrix4());
  const frustumRef = useRef(new THREE.Frustum());
  const cameraSpaceCenterRef = useRef(new THREE.Vector3());
  const previousProjectedLodReasonRef = useRef<"near" | "far" | "very-far" | null>(null);
  const animationRunRef = useRef<{
    readonly mixer: THREE.AnimationMixer;
    readonly action: THREE.AnimationAction;
    readonly playback: StudioBg3dAnimationPlayback;
    readonly durationSeconds: number;
    sampledTimeSeconds: number;
    completed: boolean;
    startElapsedSeconds: number | null;
    lastSampleElapsedSeconds: number;
  } | null>(null);
  const poseRef = useRef(instance.pose);
  poseRef.current = instance.pose;
  const morphRef = useRef(instance.morph);
  morphRef.current = instance.morph;
  const animationRef = useRef(instance.animation);
  animationRef.current = instance.animation;
  const constraintsRef = useRef(instance.constraints);
  constraintsRef.current = instance.constraints;
  const onCloneStatusRef = useRef(onCloneStatus);
  useEffect(() => {
    onCloneStatusRef.current = onCloneStatus;
  });
  useEffect(() => {
    let active = true;
    setEditableClone(null);
    onCloneStatusRef.current([instance.id], "pending");
    if (!cachedRoot) {
      return () => {
        active = false;
      };
    }
    void createStudioBg3dEditableThreeClone(cachedRoot)
      .then((next) => {
        if (!active) {
          next.dispose();
          return;
        }
        setEditableClone(next);
      })
      .catch(() => {
        if (!active) return;
        onCloneStatusRef.current([instance.id], "failed");
      });
    return () => {
      active = false;
      onCloneStatusRef.current([instance.id], "pending");
    };
  }, [cachedRoot, instance.id]);

  useEffect(() => () => editableClone?.dispose(), [editableClone]);
  useEffect(() => {
    lastConstraintWorldMatrixRef.current = null;
    previousProjectedLodReasonRef.current = null;
  }, [editableClone]);
  useEffect(() => {
    editableClone?.applyMaterialOverride(instance.materialOverride);
  }, [editableClone, instance.materialOverride]);
  useEffect(() => {
    animationRunRef.current?.mixer.stopAllAction();
    animationRunRef.current = null;
    const playback = instance.animation;
    const clip = playback ? (animations[playback.clipIndex] ?? animations[0]) : undefined;
    if (!editableClone || !playback || !clip) return;
    const mixer = new THREE.AnimationMixer(editableClone.root);
    const action = mixer.clipAction(clip);
    action.enabled = true;
    // The Studio clock resolves repeat/ping-pong into an absolute clip-local time. Keeping the
    // Three action paused in LoopOnce prevents Three from applying a second loop transform.
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.setEffectiveWeight(playback.weight);
    action.play();
    action.paused = true;
    const durationSeconds = Math.max(0, Number.isFinite(clip.duration) ? clip.duration : 0);
    editableClone.poseController.restoreRestPose();
    editableClone.morphController.restoreRestWeights();
    const sampledTimeSeconds = sampleStudioBg3dAnimationActionAtTime(mixer, action, resolveStudioBg3dAnimationTime({
      baseTimeSeconds: playback.timeSeconds,
      elapsedSeconds: 0,
      timeScale: playback.timeScale,
      durationSeconds,
      loop: playback.loop,
    }));
    editableClone.poseController.applyToCurrentPose(poseRef.current);
    editableClone.poseController.applyConstraints(constraintsRef.current);
    editableClone.morphController.applyToCurrentWeights(morphRef.current);
    const run = {
      mixer,
      action,
      playback,
      durationSeconds,
      sampledTimeSeconds,
      completed: false,
      startElapsedSeconds: null,
      lastSampleElapsedSeconds: Number.NEGATIVE_INFINITY,
    };
    animationRunRef.current = run;
    registerAnimationTime(instance.id, () => run.sampledTimeSeconds);
    return () => {
      registerAnimationTime(instance.id, null);
      mixer.stopAllAction();
      mixer.uncacheRoot(editableClone.root);
      if (animationRunRef.current?.mixer === mixer) animationRunRef.current = null;
    };
  }, [animations, editableClone, instance.animation, instance.id, registerAnimationTime]);
  useEffect(() => {
    if (!editableClone) {
      registerRigBake(instance.id, null);
      return;
    }
    const reader: StudioBg3dRigBakeReader = () => {
      const pose = editableClone.poseController.captureConstraintBakePose();
      if (!pose) return null;
      const sampledTimeSeconds = animationRunRef.current?.sampledTimeSeconds ??
        animationRef.current?.timeSeconds ?? 0;
      if (!Number.isFinite(sampledTimeSeconds) || sampledTimeSeconds < 0) return null;
      return { pose, sampledTimeSeconds };
    };
    registerRigBake(instance.id, reader);
    // Clone readiness means every command exposed by the inspector, including rig bake, already
    // has its live reader registered. This avoids an enabled-button/passive-effect race.
    onCloneStatusRef.current([instance.id], "ready");
    return () => registerRigBake(instance.id, null);
  }, [editableClone, instance.id, registerRigBake]);
  useEffect(() => {
    const group = groupRef.current;
    if (!editableClone || !group) return;
    group.updateWorldMatrix(true, true);
    const worldBounds = new THREE.Box3().setFromObject(editableClone.root)
      .getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(worldBounds.radius) || worldBounds.radius <= 0) {
      localBoundsRef.current.set(new THREE.Vector3(), 1);
      return;
    }
    const inverseGroup = group.matrixWorld.clone().invert();
    worldBounds.applyMatrix4(inverseGroup);
    // Skinning can move vertices outside the rest-pose geometry bounds; a conservative margin keeps
    // near-edge characters updating instead of visibly popping when they re-enter the frustum.
    worldBounds.radius *= 1.5;
    localBoundsRef.current.copy(worldBounds);
  }, [editableClone]);
  useEffect(() => {
    if (!editableClone) return;
    const run = animationRunRef.current;
    if (run) {
      editableClone.poseController.removeAppliedPoseOffsets();
      editableClone.morphController.removeAppliedWeightOffsets();
      run.sampledTimeSeconds = sampleStudioBg3dAnimationActionAtTime(
        run.mixer,
        run.action,
        run.sampledTimeSeconds,
      );
      editableClone.poseController.applyToCurrentPose(instance.pose);
      editableClone.poseController.applyConstraints(instance.constraints);
      editableClone.morphController.applyToCurrentWeights(instance.morph);
    } else {
      editableClone.poseController.applyFromRestPose(instance.pose);
      editableClone.poseController.applyConstraints(instance.constraints);
      editableClone.morphController.applyFromRestWeights(instance.morph);
    }
    const group = groupRef.current;
    if (group) {
      group.updateWorldMatrix(true, false);
      lastConstraintWorldMatrixRef.current = group.matrixWorld.clone();
    }
  }, [editableClone, instance.animation, instance.constraints, instance.morph, instance.pose]);
  useFrame(({ clock, camera, size }) => {
    const run = animationRunRef.current;
    if (!editableClone) return;
    const group = groupRef.current;
    if (!group) return;
    group.updateWorldMatrix(true, false);
    const rootTransformChanged = studioBg3dMatricesDiffer(
      lastConstraintWorldMatrixRef.current,
      group.matrixWorld,
    );
    if (!run?.playback.playing) {
      if (rootTransformChanged && constraintsRef.current?.enabled) {
        if (run) {
          editableClone.poseController.removeAppliedPoseOffsets();
          editableClone.morphController.removeAppliedWeightOffsets();
          run.sampledTimeSeconds = sampleStudioBg3dAnimationActionAtTime(
            run.mixer,
            run.action,
            run.sampledTimeSeconds,
          );
          editableClone.poseController.applyToCurrentPose(poseRef.current);
          editableClone.poseController.applyConstraints(constraintsRef.current);
          editableClone.morphController.applyToCurrentWeights(morphRef.current);
        } else {
          editableClone.poseController.applyFromRestPose(poseRef.current);
          editableClone.poseController.applyConstraints(constraintsRef.current);
          editableClone.morphController.applyFromRestWeights(morphRef.current);
        }
      }
      lastConstraintWorldMatrixRef.current = group.matrixWorld.clone();
      return;
    }
    lastConstraintWorldMatrixRef.current = group.matrixWorld.clone();
    run.startElapsedSeconds ??= clock.elapsedTime;
    const elapsed = clock.elapsedTime - run.startElapsedSeconds;
    const timing = {
      baseTimeSeconds: run.playback.timeSeconds,
      elapsedSeconds: elapsed,
      timeScale: run.playback.timeScale,
      durationSeconds: run.durationSeconds,
      loop: run.playback.loop,
    } as const;
    const timeSeconds = resolveStudioBg3dAnimationTime(timing);
    let visibleInHierarchy = true;
    for (let object: THREE.Object3D | null = group; object; object = object.parent) {
      if (!object.visible) {
        visibleInHierarchy = false;
        break;
      }
    }
    worldBoundsRef.current.copy(localBoundsRef.current).applyMatrix4(group.matrixWorld);
    camera.updateWorldMatrix(true, false);
    projectionMatrixRef.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustumRef.current.setFromProjectionMatrix(projectionMatrixRef.current);
    cameraSpaceCenterRef.current.copy(worldBoundsRef.current.center)
      .applyMatrix4(camera.matrixWorldInverse);
    const projectedLod = projectStudioBg3dLodDiameterCssPx({
      worldRadius: worldBoundsRef.current.radius,
      viewDepth: -cameraSpaceCenterRef.current.z,
      verticalProjectionScale: camera.projectionMatrix.elements[5] ?? Number.NaN,
      viewportCssHeight: size.height,
      perspective: camera instanceof THREE.PerspectiveCamera,
      nearPlane: camera.near,
    });
    const schedule = resolveStudioBg3dAnimationSchedule({
      visibleInHierarchy,
      inCameraFrustum: frustumRef.current.intersectsSphere(worldBoundsRef.current),
      capturing,
      selected,
      targetFps,
      lodBias,
      projectedDiameterCssPx: projectedLod?.projectedDiameterCssPx,
      projectedForceHighestDetail: projectedLod?.forceHighestDetail,
      previousProjectedLodReason: previousProjectedLodReasonRef.current,
      distanceToCamera: camera.position.distanceTo(worldBoundsRef.current.center),
      boundingRadius: worldBoundsRef.current.radius,
    });
    if (
      schedule.reason === "near" || schedule.reason === "far" ||
      schedule.reason === "very-far"
    ) previousProjectedLodReasonRef.current = schedule.reason;
    if (
      schedule.suspended ||
      clock.elapsedTime - run.lastSampleElapsedSeconds < schedule.minimumIntervalSeconds
    ) {
      return;
    }
    run.lastSampleElapsedSeconds = clock.elapsedTime;
    editableClone.poseController.removeAppliedPoseOffsets();
    editableClone.morphController.removeAppliedWeightOffsets();
    run.sampledTimeSeconds = sampleStudioBg3dAnimationActionAtTime(
      run.mixer,
      run.action,
      timeSeconds,
    );
    editableClone.poseController.applyToCurrentPose(poseRef.current);
    editableClone.poseController.applyConstraints(constraintsRef.current);
    editableClone.morphController.applyToCurrentWeights(morphRef.current);
    if (!run.completed && isStudioBg3dAnimationOnceComplete(timing)) {
      run.completed = true;
      onAnimationComplete(instance.id, timeSeconds);
    }
  });

  useEffect(() => {
    registerRef(instance.id, groupRef.current);
    return () => registerRef(instance.id, null);
  }, [instance.id, registerRef]);

  const visible = isBgObjectVisible(instance);

  return (
    <group
      ref={groupRef}
      position={instance.position}
      rotation={instance.rotation}
      scale={instance.scale}
      visible={visible}
      onClick={(e) => {
        e.stopPropagation();
        if (onSurfacePick(instance.id, e)) return;
        onSelect(instance.id, e.shiftKey || e.metaKey || e.ctrlKey);
      }}
    >
      {editableClone ? <primitive object={editableClone.root} /> : null}
      {children}
    </group>
  );
}

function BgCustomModelInstanceBatch({
  batchKey,
  sourceRoot,
  instances,
  onSelect,
  onSurfacePick,
  onCloneStatus,
  onUnavailable,
}: {
  batchKey: string;
  sourceRoot: THREE.Object3D;
  instances: readonly BgCustomModelInstance[];
  onSelect: (id: string, isMulti: boolean) => void;
  onSurfacePick: (id: string, event: ThreeEvent<MouseEvent>) => boolean;
  onCloneStatus: (
    ids: readonly string[],
    status: "pending" | "ready" | "failed",
  ) => void;
  onUnavailable: () => void;
}) {
  const instancesRef = useRef(instances);
  instancesRef.current = instances;
  const [batch, setBatch] = useState<StudioBg3dThreeInstancingSuccess | null>(null);
  const cloneStatus = useEffectEvent(onCloneStatus);
  const unavailable = useEffectEvent(onUnavailable);
  useEffect(() => {
    const currentInstances = instancesRef.current;
    const instanceIds = currentInstances.map((instance) => instance.id);
    cloneStatus(instanceIds, "pending");
    const result = createStudioBg3dThreeStaticInstanceBatch(
      sourceRoot,
      currentInstances.map((instance) => ({
        id: instance.id,
        position: instance.position,
        rotation: instance.rotation,
        scale: instance.scale,
      })),
    );
    if (!result.ok) {
      setBatch(null);
      unavailable();
      return;
    }
    setBatch(result);
    cloneStatus(instanceIds, "ready");
    return () => {
      result.dispose();
      cloneStatus(instanceIds, "pending");
    };
  }, [batchKey, sourceRoot]);
  if (!batch) return null;
  return (
    <primitive
      object={batch.root}
      dispose={null}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        const id = batch.resolveInstanceId(event.instanceId);
        if (!id) return;
        event.stopPropagation();
        if (onSurfacePick(id, event)) return;
        onSelect(id, event.shiftKey || event.metaKey || event.ctrlKey);
      }}
    />
  );
}

export function StudioBackground3D({
  open,
  initialDataUrl,
  initialScene,
  recoveryScope,
  validateRecoveryAccess,
  onClose,
  onInsert,
  documentCanvasSize,
}: StudioBackground3DProps) {
  const [primitiveGeometryPool] = useState(() => new StudioBg3dPrimitiveGeometryPool());
  const [adaptiveDprScale, setAdaptiveDprScale] = useState(1);
  const [primitives, setPrimitives] = useState<BgPrimitive[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [transformMode, setTransformMode] = useState<TransformModeId>("translate");
  const [lineArtPreview, setLineArtPreview] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isQuadView, setIsQuadView] = useState(false);
  const viewTopRef = useRef<HTMLDivElement>(null);
  const viewFrontRef = useRef<HTMLDivElement>(null);
  const viewRightRef = useRef<HTMLDivElement>(null);
  const viewPerspRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanelTab, setActivePanelTab] = useState<BgPanelTab>("shapes");
  const [viewEditorSection, setViewEditorSection] = useState<ViewEditorSection>("camera");
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
  const [modelLibrary, setModelLibrary] = useState<Bg3dModelLibraryEntry[]>([]);
  const [modelLibraryStatus, setModelLibraryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
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
    if (!open) {
      primitiveGeometryPool.dispose();
      setAdaptiveDprScale(1);
      const idlePlacement = createStudioBg3dPlacementSession();
      placementSessionRef.current = idlePlacement;
      setPlacementSession(idlePlacement);
      setPlacementPreviewAsset(null);
      modelRendererRef.current = null;
      setModelRenderer(null);
    }
  }, [open, primitiveGeometryPool]);
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
    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: { ...sceneBaseDocument, camera: currentView },
    });
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
  const viewportHostRef = useRef<HTMLDivElement>(null);
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
  const ltInsertSceneEpochRef = useRef(0);
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
      if (modalAssetSessionRef.current === session) modalAssetSessionRef.current = null;
      studioBg3dModalOperationCoordinator.endSession(session);
    };
  }, [invalidateModelThumbnailCaptures, open]);
  useLayoutEffect(() => {
    ltInsertSceneEpochRef.current += 1;
    const controller = ltInsertAbortRef.current;
    if (!controller) return;
    controller.abort();
  }, [customModels, primitives, sceneBaseDocument]);
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
  const physicsInteractionLocked = isStudioBg3dPhysicsTransientPhase(physicsPhase);
  const insertBlocked = Boolean(sceneRecoveryError) || hasCloneFailure || hasPendingClone ||
    isRestoringScene || physicsInteractionLocked || isBatchRenderingShots;
  const shotBatchBlockedReason = sceneRecoveryError
    ? "3D 장면 복원 오류를 해결하기 전에는 누락 가능성이 있는 컷을 배치 출력할 수 없습니다."
    : hasCloneFailure
      ? "불러오기에 실패한 3D 모델이 있어 컷 배치 출력을 막았습니다. 모델 파일 상태를 확인해 주세요."
      : hasPendingClone
        ? "3D 모델 렌더 복제본을 준비하는 중입니다. 모든 모델이 표시된 뒤 컷 배치 출력을 다시 실행해 주세요."
        : isRestoringScene
          ? "3D 장면을 복원하는 중입니다. 복원이 끝난 뒤 컷 배치 출력을 실행해 주세요."
          : physicsInteractionLocked
            ? "물리 미리보기 중에는 컷 배치 출력을 실행할 수 없습니다. 현재 자세를 적용하거나 미리보기를 초기화해 주세요."
            : isCapturing || isBatchRenderingShots
              ? "다른 3D 캡처가 진행 중입니다. 완료하거나 취소한 뒤 컷 배치 출력을 다시 실행해 주세요."
              : null;

  // This editor is portalled to document.body, so body is the nearest shared root that contains
  // both the dialog and the Studio launcher. Setting it in an earlier layout effect satisfies the
  // shared modal hook's rootRef contract before that hook activates focus isolation.
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

  // 검증 로더가 성공 시점에 만든 자원 snapshot만 캐시가 소유한다. 언마운트/닫힘 때 loader.dispose를
  // 호출하므로 공유 geometry/material/texture/ImageBitmap을 빠뜨리거나 두 번 해제하지 않는다.
  useEffect(() => {
    if (!open) return;
    componentActiveRef.current = true;
    const cache = modelRootCacheRef.current;
    const pending = modelLoadPendingRef.current;
    const attachmentByStorageId = attachmentByStorageModelIdRef.current;
    const storageIdByAttachment = storageModelIdByAttachmentIdRef.current;
    return () => {
      componentActiveRef.current = false;
      pending.clear();
      disposeModelCache(cache);
      attachmentByStorageId.clear();
      storageIdByAttachment.clear();
    };
  }, [open, setTemplateLibrary, setTemplateLibraryStatus]);

  // 사용자 LT 프리셋은 장면 문서와 분리된 로컬 라이브러리다. 저장소가 차단되거나 손상돼도
  // 3D 장면 복원/캡처를 막지 않고, 검증된 빈 payload로만 폴백한다.
  useEffect(() => {
    if (!open) return;
    const storage = getBrowserLtPresetStorage();
    setLtPreferredPresetId(null);
    setLtManagedUserPresetId(null);
    setLtDeleteConfirmId(null);
    setLtUserPresetName("");
    setLtUserPresetDescription(DEFAULT_LT_USER_PRESET_DESCRIPTION);
    if (!storage) {
      setLtUserPresetPayload(EMPTY_STUDIO_BG3D_LT_USER_PRESET_PAYLOAD);
      setLtUserPresetLibraryStatus("unavailable");
      setLtUserPresetNotice({
        tone: "error",
        message: "브라우저 저장소를 사용할 수 없어 사용자 프리셋을 불러오지 못했습니다.",
      });
      return;
    }

    const loaded = loadStudioBg3dLtUserPresetsFromStorage(storage);
    setLtUserPresetPayload(loaded.payload);
    if (loaded.status === "unavailable") {
      setLtUserPresetLibraryStatus("unavailable");
      setLtUserPresetNotice({
        tone: "error",
        message: "브라우저 저장소 읽기가 차단되어 사용자 프리셋을 안전한 빈 상태로 열었습니다.",
      });
      return;
    }
    if (loaded.status === "recovered") {
      setLtUserPresetLibraryStatus("recovered");
      setLtUserPresetNotice({
        tone: loaded.rewritten ? "info" : "error",
        message: loaded.rewritten
          ? loaded.quarantined
            ? "손상된 프리셋 저장값을 격리하고 빈 라이브러리로 복구했습니다."
            : "손상된 프리셋 저장값을 초기화했지만 백업 사본은 남기지 못했습니다."
          : "손상된 프리셋은 무시했지만 저장소 복구가 완료되지 않았습니다.",
      });
      return;
    }
    setLtUserPresetLibraryStatus("ready");
    setLtUserPresetNotice(null);
  }, [open, setTemplateLibrary, setTemplateLibraryStatus]);

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
    if (!open) return;
    const session = modalAssetSessionRef.current;
    if (!session) return;
    setModelLibraryStatus("loading");
    listBg3dModelLibraryEntries()
      .then((entries) => {
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setModelLibrary(entries);
          setModelLibraryStatus("ready");
        });
      })
      .catch(() => {
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setModelLibraryStatus("error");
        });
      });
  }, [open, setTemplateLibrary, setTemplateLibraryStatus]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, setTemplateLibrary, setTemplateLibraryStatus]);

  // 신규 장면 문서는 hash로 검증 레코드를 찾고, admission→Three 안전 파서를 모두 통과한 뒤 runtime
  // 배열로 hydrate한다. 실패한 모델 노드는 절대 저장 시 조용히 제거하지 않고 업데이트 자체를 잠근다.
  // initialScene이 없을 때만 과거 PNG fragment를 읽어 하위 호환한다.
  useEffect(() => {
    if (!open || !modelRenderer) return;
    const session = modalAssetSessionRef.current;
    if (!session) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && isModalAssetSessionCurrent(session);
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
        setSceneBaseDocument(canonicalInitial);
        pendingInitialCameraRef.current = viewportApiRef.current?.applyView(canonicalInitial.camera) === true
          ? null
          : canonicalInitial.camera;

        const quality = resolveDeviceQuality(canonicalInitial, viewportHostRef.current);
        let cumulativeUsedBytes = 0;
        let recoveryFailed = false;
        for (const attachment of canonicalInitial.attachments) {
          if (!isCurrent()) return;
          try {
            const record = await getStoredBg3dModelByHash(attachment.hash);
            if (!record || !attachmentMatchesRecord(attachment, record)) throw new Error("attachment-mismatch");
            await admitAndCacheModel({
              record,
              document: canonicalInitial,
              quality,
              cumulativeUsedBytes,
              renderer: modelRenderer,
              cache: modelRootCacheRef.current,
              pending: modelLoadPendingRef.current,
              isActive: isCurrent,
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
        const hydrated = hydrateStudioBg3dDocumentToRuntime({
          document: canonicalInitial,
          storageModelIdByAttachmentId: storageModelIdByAttachmentIdRef.current,
        });
        if (!isCurrent()) return;
        historyRef.current = [createStudioBg3dHistorySnapshot({
          primitives: hydrated.primitives,
          customModels: hydrated.customModels,
          document: canonicalInitial,
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
            const attachment = createStudioBg3dModelAttachment(record);
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
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialDataUrl, initialScene, modelRenderer]);

  // 편집이 멈추면(디바운스) 스냅샷을 히스토리에 적재한다. 도형·커스텀 모델·장면 문서를 한 타임라인에
  // 묶어 배경/조명/LT 설정도 도형과 같은 Ctrl+Z 계약을 따른다. 카메라 Orbit의 매 프레임 임시 시점은
  // sceneBaseDocument에 쓰지 않으므로 히스토리를 과도하게 채우지 않는다.
  useEffect(() => {
    if (isRestoringScene || isBatchRenderingShots) return;
    const timer = setTimeout(() => {
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

  const addPrimitive = (kind: BgPrimitiveKind) => {
    const next = createPrimitive(kind, primitives.length);
    setPrimitives((prev) => [...prev, next]);
    setSelectedIds(new Set([next.id]));
  };

  // 복합 오브젝트 프리셋(건물/나무/차량/소품) 추가 — addPrimitive와 동일한 "추가 = 선택" UX,
  // parts[0](앵커 파츠)이 새로 선택된다(instantiateCompositePreset 계약).
  const addComposite = (presetId: string) => {
    const preset = COMPOSITE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const parts = instantiateCompositePreset(preset, primitives.length);
    setPrimitives((prev) => [...prev, ...parts]);
    setSelectedIds(new Set([parts[0].id]));
  };

  // 씬 템플릿(교실/카페/거리 등 완성된 공간) 추가 — addComposite와 동일한 "추가 = 선택" UX.
  // instantiateSceneTemplate이 이미 여러 프리셋/도형을 조합한 BgPrimitive[]를 통째로 돌려주므로,
  // 그대로 append하고 첫 항목을 선택한다. undo/redo는 기존 디바운스 스냅샷 effect(§primitives 변화
  // 감시)가 그대로 처리해 템플릿 하나를 통째로 추가해도 Ctrl+Z 한 번에 전부 되돌아간다.
  const addSceneTemplate = (templateId: string) => {
    const template = BG_SCENE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const parts = instantiateSceneTemplate(template, primitives.length);
    if (parts.length === 0) return;
    setPrimitives((prev) => [...prev, ...parts]);
    setSelectedIds(new Set([parts[0].id]));
  };

  // 방 만들기 스펙 → BgPrimitive[] 전개 추가 — addSceneTemplate과 동일한 "추가 = 선택" UX와
  // 디바운스 히스토리 계약(Ctrl+Z 한 번에 방 전체가 되돌아간다).
  const addRoomBuild = () => {
    const parts = instantiateStudioBg3dRoomBuild(roomBuilderSpec, primitives.length);
    if (parts.length === 0) return;
    setPrimitives((prev) => [...prev, ...parts]);
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
    const newPrimitives: BgPrimitive[] = [];
    const newModels: BgCustomModelInstance[] = [];
    const newIds = new Set<string>();

    for (const id of selectedIds) {
      const p = primitives.find(x => x.id === id);
      if (p) {
        const clone = duplicatePrimitive(p);
        newPrimitives.push(clone);
        newIds.add(clone.id);
      } else {
        const m = customModels.find(x => x.id === id);
        if (m) {
          const clone = duplicateBgCustomModelInstance(m);
          newModels.push(clone);
          newIds.add(clone.id);
        }
      }
    }

    if (newPrimitives.length > 0) {
      setPrimitives((prev) => [...prev, ...newPrimitives]);
    }
    if (newModels.length > 0) {
      setCustomModels((prev) => [...prev, ...newModels]);
    }
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
  ): Promise<Bg3dVerifiedStoredRecord | null> {
    const record = await getStoredBg3dModel(modelId);
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
      existingAttachment ?? createStudioBg3dModelAttachment(record),
      { sourceFormat, classification },
    );
    const live = physicsRuntimeSourceRef.current;
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
      isActive: () => isModalAssetSessionCurrent(session),
    });
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

    const rotation = new THREE.Euler().setFromQuaternion(orientation, "XYZ");
    const runtime = physicsRuntimeSourceRef.current;
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
    setError(null);
    try {
      await studioBg3dModalOperationCoordinator.runSceneMutation(
        session,
        async () => {
          const record = await ensureModelRootCached(modelId, session);
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
        async () => {
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
          const instantiated = instantiateBg3dTemplateDocument(
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
            if (!isModalAssetSessionCurrent(session)) {
              throw new StudioBg3dStaleModalOperationError();
            }
            const record = await getStoredBg3dModelByHash(attachment.hash);
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
              isActive: () => isModalAssetSessionCurrent(session),
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

  async function handleUploadModelFiles(
    event: ChangeEvent<HTMLInputElement>,
    rights: NonNullable<Bg3dModelImportItem["rights"]>,
  ) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = ""; // StudioVrmPoser.tsx handleFileChange와 동일 — 같은 파일 재선택 허용
    if (files.length === 0) return;
    if (placementSessionRef.current.phase === "preview") cancelCustomModelPlacement();
    const session = modalAssetSessionRef.current;
    if (!session || !isModalAssetSessionCurrent(session)) return;

    // A new import supersedes only thumbnail post-processing. Verified model import itself proceeds
    // even while another non-thumbnail capture owns the renderer and may leave placeholders.
    invalidateModelThumbnailCaptures();
    modelImportAbortRef.current?.abort();
    const importController = new AbortController();
    modelImportAbortRef.current = importController;
    setIsUploadingModel(true);
    setError(null);
    const uploadOwnedCacheEntries = new Map<string, ModelRootCacheEntry>();
    let uploadCommitted = false;
    let thumbnailCandidates: readonly Bg3dVerifiedStoredRecord[] = [];
    let plannedSourceFormats: readonly StudioGeneric3dSourceFormat[] = [];
    let modelImportRuntime: typeof import("./studio-bg3d-model-import") | null = null;
    const cleanupUncommittedUploadCache = () => {
      const liveStorageIds = new Set(
        physicsRuntimeSourceRef.current.customModels.map((model) => model.modelId),
      );
      for (const [storageId, ownedEntry] of uploadOwnedCacheEntries) {
        if (liveStorageIds.has(storageId)) continue;
        if (modelRootCacheRef.current.get(storageId) !== ownedEntry) continue;
        ownedEntry.dispose();
        modelRootCacheRef.current.delete(storageId);
      }
      uploadOwnedCacheEntries.clear();
    };
    try {
      const policy = deriveStudioBg3dGlbValidationPolicy(sceneBaseDocument, deviceQuality);
      modelImportRuntime = await import("./studio-bg3d-model-import");
      if (!isModalAssetSessionCurrent(session)) throw new StudioBg3dStaleModalOperationError();
      if (importController.signal.aborted) {
        throw new modelImportRuntime.StudioBg3dModelImportError("aborted");
      }
      const importPlan = modelImportRuntime.planStudioBg3dModelImports(files);
      const hasSelectedMtl = [...importPlan.resources.keys()].some((path) =>
        path.toLocaleLowerCase("en-US").endsWith(".mtl")
      );
      plannedSourceFormats = Object.freeze(importPlan.items.map((item) => {
        if (item.format === "gltf") return "gltf";
        if (item.format === "obj") return hasSelectedMtl ? "obj-mtl" : "obj";
        return "glb";
      }));
      const canonicalInputs = await modelImportRuntime.convertStudioBg3dModelFilesToGlb(files, {
        signal: importController.signal,
        onProgress: (progress) => {
          studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
            setModelImportProgress(progress);
          });
        },
      });
      if (!isModalAssetSessionCurrent(session)) throw new StudioBg3dStaleModalOperationError();
      const imported = await importVerifiedBg3dModelsAtomically(
        canonicalInputs.map((file) => ({ file, rights })),
        {
        profile: policy.profile,
        budgets: policy.budgets,
        signal: importController.signal,
        },
      );
      const saved: Bg3dVerifiedStoredRecord[] = [];
      for (const importedRecord of imported) {
        if (!isModalAssetSessionCurrent(session)) {
          throw new StudioBg3dStaleModalOperationError();
        }
        const storedRecord = await getStoredBg3dModel(importedRecord.id);
        if (
          !storedRecord ||
          storedRecord.contentHash !== importedRecord.contentHash ||
          storedRecord.byteSize !== importedRecord.byteSize
        ) {
          throw new Error("stored-record-mismatch");
        }
        saved.push(storedRecord);
      }
      await studioBg3dModalOperationCoordinator.runSceneMutation(
        session,
        async () => {
          const libraryEntries = await listBg3dModelLibraryEntries();
          const liveModels = physicsRuntimeSourceRef.current.customModels;
          const stagedAttachments = new Map<string, StudioBg3dModelAttachment>();
          let cumulativeUsedBytes = calculateStudioBg3dPlacedModelBytes(
            liveModels,
            attachmentByStorageModelIdRef.current,
          );
          const countedHashes = new Set(
            liveModels.flatMap((model) => {
              const attachment = attachmentByStorageModelIdRef.current.get(model.modelId);
              return attachment ? [attachment.hash] : [];
            }),
          );
          for (let index = 0; index < saved.length; index += 1) {
            const record = saved[index]!;
            const existing = attachmentByStorageModelIdRef.current.get(record.id);
            const sourceFormat =
              normalizeStudioGeneric3dSourceFormat(plannedSourceFormats[index] ?? "glb") ?? "glb";
            const attachment = withStudioGeneric3dWorkflowMetadata(
              existing ?? createStudioBg3dModelAttachment(record),
              {
                sourceFormat,
                classification: genericModelClassifications.get(record.id) ?? null,
              },
            );
            await admitAndCacheModel({
              record,
              document: sceneBaseDocument,
              quality: deviceQuality,
              cumulativeUsedBytes,
              renderer: modelRenderer,
              cache: modelRootCacheRef.current,
              pending: modelLoadPendingRef.current,
              isActive: () => isModalAssetSessionCurrent(session),
              onCacheEntryCreated: (storageId, cacheEntry) => {
                uploadOwnedCacheEntries.set(storageId, cacheEntry);
              },
            });
            stagedAttachments.set(record.id, attachment);
            if (!countedHashes.has(record.contentHash)) {
              countedHashes.add(record.contentHash);
              cumulativeUsedBytes += record.byteSize;
            }
          }

          // 모든 업로드가 검증·파싱된 뒤에 임시 Map에서 충돌까지 검사하고, 그 다음에만 실제 매핑과
          // 배치 배열을 한 번에 commit한다.
          const nextAttachmentByStorageId = new Map(attachmentByStorageModelIdRef.current);
          const nextStorageIdByAttachment = new Map(storageModelIdByAttachmentIdRef.current);
          for (const record of saved) {
            const attachment = stagedAttachments.get(record.id);
            if (!attachment || !bindModelAttachment({
              attachmentByStorageModelId: nextAttachmentByStorageId,
              storageModelIdByAttachmentId: nextStorageIdByAttachment,
            }, record, attachment)) {
              throw new Error("attachment-binding");
            }
          }
          return {
            libraryEntries,
            nextAttachmentByStorageId,
            nextStorageIdByAttachment,
            placements: saved.map((record, index) =>
              createBgCustomModelInstance(record.id, liveModels.length + index)
            ),
          };
        },
        ({
          libraryEntries,
          nextAttachmentByStorageId,
          nextStorageIdByAttachment,
          placements,
        }) => {
          attachmentByStorageModelIdRef.current.clear();
          storageModelIdByAttachmentIdRef.current.clear();
          for (const [id, attachment] of nextAttachmentByStorageId) {
            attachmentByStorageModelIdRef.current.set(id, attachment);
          }
          for (const [attachmentId, id] of nextStorageIdByAttachment) {
            storageModelIdByAttachmentIdRef.current.set(attachmentId, id);
          }
          setModelLibrary(libraryEntries);
          const importedFormats = new Map<string, StudioGeneric3dSourceFormat>();
          for (let index = 0; index < saved.length; index += 1) {
            importedFormats.set(
              saved[index]!.id,
              normalizeStudioGeneric3dSourceFormat(plannedSourceFormats[index] ?? "glb") ?? "glb",
            );
          }
          setGenericModelSourceFormats((previous) =>
            mergeStudioGeneric3dWorkflowMaps(previous, importedFormats),
          );
          if (placements.length > 0) {
            const current = physicsRuntimeSourceRef.current;
            physicsRuntimeSourceRef.current = {
              ...current,
              customModels: [...current.customModels, ...placements],
            };
            setCustomModels((previous) => [...previous, ...placements]);
            setSelectedIds(new Set([placements[placements.length - 1].id]));
            setRefTick((n) => n + 1);
          }
          uploadCommitted = true;
        },
      );
      thumbnailCandidates = saved;
    } catch (importFailure) {
      // 저장은 atomic import가 책임지고, 화면 배치는 별도 all-or-none이다. 이번 시도에서 처음 로드한
      // 캐시만 되돌려 기존 장면 인스턴스가 공유 중인 자원은 건드리지 않는다.
      if (!isModalAssetSessionCurrent(session)) return;
      setError(
        modelImportRuntime && importFailure instanceof modelImportRuntime.StudioBg3dModelImportError
          ? importFailure.message
          : importFailure instanceof StudioBg3dThreeOperationError
            ? importFailure.message
          : importController.signal.aborted
            ? "3D 모델 가져오기를 취소했습니다. 장면과 라이브러리는 변경하지 않았습니다."
            : "선택한 모델 중 하나가 변환·안전 검사 또는 기기 복잡도 기준을 통과하지 못해 아무 모델도 배치하지 않았습니다."
      );
      try {
        const entries = await listBg3dModelLibraryEntries();
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setModelLibrary(entries);
        });
      } catch {
        studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
          setModelLibraryStatus("error");
        });
      }
    } finally {
      if (!uploadCommitted) cleanupUncommittedUploadCache();
      if (modelImportAbortRef.current === importController) modelImportAbortRef.current = null;
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setModelImportProgress(null);
        setIsUploadingModel(false);
      });
    }
    if (uploadCommitted && thumbnailCandidates.length > 0) {
      startModelThumbnailCaptureBatch(thumbnailCandidates, session);
    }
  }

  async function handleDeleteModelFromLibrary(id: string) {
    const session = modalAssetSessionRef.current;
    if (!session || !isModalAssetSessionCurrent(session)) return;
    if (placementSessionRef.current.phase === "preview") cancelCustomModelPlacement();
    const thumbnailLeaseReleased = invalidateModelThumbnailCaptures();
    if (thumbnailLeaseReleased) await thumbnailLeaseReleased;
    if (!isModalAssetSessionCurrent(session) || captureInFlightRef.current) return;
    const destructiveLease = destructiveMutationGuardRef.current.begin();
    if (!destructiveLease) return;
    let removalPreflightFailed = false;
    setDeletingModelId(id);
    try {
      const mutation = await studioBg3dModalOperationCoordinator.runSceneMutation(
        session,
        async () => {
          const attachment = attachmentByStorageModelIdRef.current.get(id);
          const plan = await preflightAndDeleteStudioBg3dPersistedModel({
            snapshot: physicsRuntimeSourceRef.current,
            storageModelId: id,
            ...(attachment ? { attachmentId: attachment.id } : {}),
            deletePersistedModel: deleteStoredBg3dModel,
          });
          if (!plan.ok) {
            removalPreflightFailed = true;
            throw new Error("scene-removal-preflight-failed");
          }
          return { attachment, plan };
        },
        ({ attachment, plan }) => {
          commitSceneEntityRemoval(plan, { resetHistory: true });
          attachmentByStorageModelIdRef.current.delete(id);
          if (attachment) storageModelIdByAttachmentIdRef.current.delete(attachment.id);
          const cacheEntry = modelRootCacheRef.current.get(id);
          modelRootCacheRef.current.delete(id);
          if (cacheEntry) requestAnimationFrame(() => cacheEntry.dispose());
          setSelectedIds((current) => new Set(
            [...current].filter((selectedId) => !plan.removedEntityIds.has(selectedId)),
          ));
          setGenericModelSourceFormats((previous) => {
            if (!previous.has(id)) return previous;
            const next = new Map(previous);
            next.delete(id);
            return next;
          });
          setGenericModelClassifications((previous) => {
            if (!previous.has(id)) return previous;
            const next = new Map(previous);
            next.delete(id);
            return next;
          });
          setRefTick((n) => n + 1);
        },
      );
      if (mutation.status === "stale") return;
      const entries = await listBg3dModelLibraryEntries();
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setModelLibrary(entries);
      });
    } catch {
      if (!isModalAssetSessionCurrent(session)) return;
      setError(removalPreflightFailed
        ? "자식 객체의 월드 변환을 보존할 수 없어 모델 원본 삭제를 시작하지 않았습니다."
        : "3D 모델을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      destructiveMutationGuardRef.current.finish(destructiveLease);
      studioBg3dModalOperationCoordinator.commitIfCurrent(session, () => {
        setDeletingModelId(null);
      });
    }
  }

  const handlePanelTabChange = (tab: BgPanelTab) => {
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
    const storage = getBrowserLtPresetStorage();
    if (!storage || !saveStudioBg3dLtUserPresetsToStorage(storage, result.canonicalJson)) {
      setLtUserPresetLibraryStatus("unavailable");
      setLtUserPresetNotice({
        tone: "error",
        message: "브라우저 저장소에 프리셋을 기록하지 못했습니다. 저장 공간과 사이트 권한을 확인해 주세요.",
      });
      return false;
    }
    setLtUserPresetPayload(result.payload);
    setLtUserPresetLibraryStatus("ready");
    setLtUserPresetNotice({ tone: "success", message: successMessage });
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

  /**
   * 렌즈/투영 계열 카메라 편집의 단일 경로. 현재 라이브 시점을 먼저 읽어 문서 카메라와 동기화한
   * 뒤 패치를 얹는다 — 그래야 fov만 바꿔도 저장돼 있던 옛 position으로 시점이 튀지 않는다.
   * 투영 전환은 R3F 기본 카메라를 재마운트하므로 applyOrDeferStudioBg3dHistoryCamera가
   * undo/redo와 동일한 지연 적용 계약으로 처리한다.
   */
  function updateCameraLens(
    patch: (view: StudioBg3dCameraSettings) => Partial<StudioBg3dCameraSettings>,
  ) {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    const liveView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const nextCamera: StudioBg3dCameraSettings = { ...liveView, ...patch(liveView) };
    const nextDocument = canonicalSceneDocument({ ...sceneBaseDocument, camera: nextCamera });
    if (!nextDocument) {
      setError("카메라 렌즈 설정을 장면 원본에 안전하게 적용하지 못했습니다.");
      return;
    }
    setSceneBaseDocument(nextDocument);
    applyOrDeferStudioBg3dHistoryCamera(
      viewportApiRef.current,
      pendingInitialCameraRef,
      nextDocument.camera,
    );
    setError(null);
  }

  function applyTwoPointPerspective() {
    const liveView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const corrected = computeStudioBg3dTwoPointPerspective(liveView);
    if (!corrected) {
      setError("정수직 시점에서는 2점 투시 보정을 정의할 수 없습니다. 카메라를 조금 기울여 주세요.");
      return;
    }
    updateCameraLens((view) => ({
      target: corrected.target,
      lensShift: [view.lensShift?.[0] ?? 0, corrected.lensShiftY],
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
    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: { ...sceneBaseDocument, camera: currentView },
    });
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

  async function exportSavedShotsAsZip() {
    if (captureInFlightRef.current) {
      setError("다른 3D 캡처가 진행 중입니다. 완료하거나 취소한 뒤 컷 배치 출력을 다시 실행해 주세요.");
      return;
    }
    if (shotBatchBlockedReason) {
      setError(shotBatchBlockedReason);
      return;
    }
    // Export is read-only. Keep the persisted scene document distinct from the live Orbit view
    // that `readCurrentCanonicalSceneForShot` temporarily samples for validation.
    const originalSceneBaseDocument = sceneBaseDocument;
    const originalViewportApi = viewportApiRef.current;
    const originalLiveView = originalViewportApi?.readView() ?? sceneBaseDocument.camera;
    const currentDocument = readCurrentCanonicalSceneForShot();
    const shots = currentDocument?.shots ?? [];
    if (!currentDocument) return;
    if (shots.length === 0) {
      setError("일괄 렌더할 컷을 먼저 기록해 주세요.");
      return;
    }
    const batchSourceRevision = serializeStudioBg3dSceneDocument(currentDocument);
    if (!batchSourceRevision) {
      setError("컷 배치 장면 revision을 안전하게 고정하지 못했습니다.");
      return;
    }
    if (!recoveryScope) {
      setError("컷 배치 복구 범위를 준비하는 중입니다. 잠시 후 다시 실행해 주세요.");
      return;
    }
    if (!captureRef.current.adapter || !originalViewportApi) {
      setError("컷을 렌더할 3D 뷰포트가 아직 준비되지 않았습니다.");
      return;
    }
    shotBatchAbortRef.current?.abort();
    const controller = new AbortController();
    shotBatchAuthorizationEpochRef.current += 1;
    const authorizationEpoch = shotBatchAuthorizationEpochRef.current;
    shotBatchAbortRef.current = controller;
    shotBatchRecoveryScopeRef.current = { controller, scope: recoveryScope };
    captureInFlightRef.current = true;
    flushSync(() => {
      setShotBatchProgress({
        stage: "render",
        completed: 0,
        total: shotBatchSelectedIds.length,
        label: "컷 출력 런타임 불러오는 중",
      });
      setIsCapturing(true);
      setError(null);
    });
    const finishShotBatchBeforeSession = (message: string) => {
      captureInFlightRef.current = false;
      if (shotBatchAbortRef.current === controller) shotBatchAbortRef.current = null;
      if (shotBatchRecoveryScopeRef.current?.controller === controller) {
        shotBatchRecoveryScopeRef.current = null;
      }
      if (!componentActiveRef.current) return;
      pendingInitialCameraRef.current = isQuadView ? originalLiveView : null;
      flushSync(() => {
        setIsCapturing(false);
        setShotBatchProgress(null);
        setError(message);
      });
    };
    let shotBatchRuntime: StudioBg3dShotBatchRuntime;
    try {
      shotBatchRuntime = await loadStudioBg3dShotBatchRuntime(controller.signal);
    } catch (cause) {
      finishShotBatchBeforeSession(
        cause instanceof Error && cause.name === "AbortError"
          ? "컷 일괄 렌더를 중단했습니다."
          : "컷 일괄 출력 런타임을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
      );
      return;
    }
    if (!componentActiveRef.current || controller.signal.aborted) {
      finishShotBatchBeforeSession("컷 일괄 렌더를 중단했습니다.");
      return;
    }
    const {
      STUDIO_BG3D_SHOT_BATCH_APP_IMPLEMENTATION_PROFILE_V1,
      STUDIO_BG3D_SHOT_BATCH_LT_PIPELINE_V1,
      STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES,
      STUDIO_BG3D_SHOT_BATCH_PNG_ENCODING_V1,
      STUDIO_BG3D_SHOT_BATCH_PSD_ENCODING_V1,
      STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS,
      StudioBg3dShotBatchRecoveryError,
      buildStudioBg3dShotArtifacts,
      buildStudioBg3dShotBatchArchive,
      buildStudioBg3dShotBatchArchiveInWorker,
      buildStudioBg3dShotContactSheetsInWorker,
      commitStudioBg3dShotBatchDownload,
      createStudioBg3dShotBatchPlan,
      createStudioBg3dShotBatchRecoveryStore,
      isStudioBg3dShotBatchWorkerUnavailableError,
      projectStudioBg3dShotBatchPlanForPublicArchive,
      studioBg3dShotBatchQueueCompletedCount,
      waitForStudioBg3dBatchDocumentVisible,
    } = shotBatchRuntime;
    const originalLineArtPreview = lineArtPreview;
    let shotBatchRecoveryStore: StudioBg3dShotBatchRecoveryStore;
    let originalPrimitives: BgPrimitive[];
    let originalCustomModels: BgCustomModelInstance[];
    try {
      shotBatchRecoveryStore = shotBatchRecoveryStoreRef.current ??
        createStudioBg3dShotBatchRecoveryStore();
      shotBatchRecoveryStoreRef.current = shotBatchRecoveryStore;
      originalPrimitives = clonePrimitives(primitives);
      originalCustomModels = cloneBgCustomModelInstances(customModels);
    } catch (cause) {
      finishShotBatchBeforeSession(
        cause instanceof Error && cause.message.trim().length > 0
          ? `컷 일괄 출력 런타임을 초기화하지 못했습니다. ${cause.message}`
          : "컷 일괄 출력 런타임을 초기화하지 못했습니다.",
      );
      return;
    }
    let recoveryAccessRevoked = false;
    const assertRecoveryAccess = async () => {
      if (controller.signal.aborted) {
        throw Object.assign(new Error("취소됨"), { name: "AbortError" });
      }
      let allowed = false;
      try {
        allowed = await validateRecoveryAccess(recoveryScope, controller.signal);
      } catch {
        if (controller.signal.aborted) {
          throw Object.assign(new Error("취소됨"), { name: "AbortError" });
        }
      }
      if (allowed) return;
      if (!controller.signal.aborted) recoveryAccessRevoked = true;
      controller.abort();
      throw Object.assign(new Error("컷 배치 복구 접근 권한이 변경되었습니다."), {
        name: "AbortError",
      });
    };
    flushSync(() => {
      setShotBatchProgress({
        stage: "render",
        completed: 0,
        total: shotBatchSelectedIds.length,
        label: "결정적 컷 계획 준비",
      });
      setLineArtPreview(false);
    });

    let batchPlan: StudioBg3dShotBatchPlan;
    let recoverySession: StudioBg3dShotBatchRecoverySession;
    let provisionalRecoverySession: StudioBg3dShotBatchRecoverySession | null = null;
    let planningViewportApi: BgViewportApi;
    try {
      await assertRecoveryAccess();
      const transitionedViewport = await applyStudioBg3dViewportAfterTransition({
        view: originalLiveView,
        previousApi: originalViewportApi,
        requireReplacement: isQuadView,
        readApi: () => viewportApiRef.current,
        isActive: () => componentActiveRef.current && !controller.signal.aborted,
        waitForPaintFrame: waitForStudioBg3dPaintFrame,
        signal: controller.signal,
        timeoutMs: 15_000,
      });
      if (!transitionedViewport) throw new Error("컷 계획용 단일 viewport를 준비하지 못했습니다.");
      planningViewportApi = transitionedViewport;
      const planningAdapter = await acquireStudioBg3dCaptureAdapterAfterViewTransition({
        isActive: () => componentActiveRef.current && !controller.signal.aborted,
        readAdapter: () => captureRef.current.adapter,
        waitForPaintFrame: waitForStudioBg3dPaintFrame,
        signal: controller.signal,
        timeoutMs: 15_000,
      });
      if (!planningAdapter) throw new Error("컷 계획용 3D 캡처 adapter를 준비하지 못했습니다.");
      const sourceSize = await getStudioBg3dCaptureSourceSize(planningAdapter);
      const captureQuality = resolveStudioBg3dDeviceQuality({
        document: currentDocument,
        mode: "capture",
        signals: deviceSignals,
      });
      const maxPixels = Math.min(
        captureQuality.maxRenderPixels,
        STUDIO_BG3D_LT_RENDER_MAX_PIXELS,
      );
      const captureSpecs: StudioBg3dShotBatchCaptureSpecInput[] = shots.map((sourceShot) => {
        const appliedShot = applyStudioBg3dShot(currentDocument, sourceShot.id);
        const applied = appliedShot ? freezeStudioBg3dShotAnimationsForBatch(appliedShot) : null;
        if (!applied) throw new Error("컷의 고정 캡처 계획을 만들 수 없습니다.");
        const requestedHeight = shotBatchExportHeight === "per-shot"
          ? applied.output.exportHeight
          : shotBatchExportHeight;
        const size = resolveStudioBg3dLtCaptureSize({
          sourceWidth: sourceSize.width,
          sourceHeight: sourceSize.height,
          requestedHeight,
          maxPixels,
          maxEdge: STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION,
        });
        if (!size) throw new Error("컷 출력 해상도를 안전한 예산 안에서 동결하지 못했습니다.");
        const background = createStudioBg3dCaptureBackgroundSnapshot({
          background: applied.background,
          transparent: applied.output.transparentBackground,
        });
        const shotQuality = resolveStudioBg3dDeviceQuality({
          document: applied,
          mode: "capture",
          signals: deviceSignals,
        });
        if (shotQuality.profile !== captureQuality.profile ||
          shotQuality.maxRenderPixels !== captureQuality.maxRenderPixels ||
          shotQuality.textureScale !== captureQuality.textureScale ||
          shotQuality.lodBias !== captureQuality.lodBias) {
          throw new Error("컷별 캡처 품질이 공통 기기 프로필과 일치하지 않습니다.");
        }
        return {
          shotId: sourceShot.id,
          width: size.width,
          height: size.height,
          requestedHeight,
          wasReduced: size.wasReduced,
          includeDepth: applied.output.line.depthEnabled || selectedShotBatchPasses.includes("depth"),
          shadows: shotQuality.shadows,
          shadowMapSize: shotQuality.shadowMapSize,
          background: studioBg3dCaptureBackgroundRequestFromSnapshot(background),
        };
      });
      const batchPlanResult = await createStudioBg3dShotBatchPlan(shots, {
        selectedShotIds: shotBatchSelectedIds,
        passes: selectedShotBatchPasses,
        sourceRevision: batchSourceRevision,
        scope: recoveryScope,
        capture: {
          owner: {
            backend: planningAdapter.backend,
            engineId: planningAdapter.engineId,
            engineRevision: planningAdapter.engineVersion,
            implementationRevision: planningAdapter.implementationRevision,
            graphicsApi: planningAdapter.graphicsApi,
            profileId: planningAdapter.profileId,
            sourceWidth: sourceSize.width,
            sourceHeight: sourceSize.height,
            maxPixels,
            maxEdge: STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION,
            deviceProfile: captureQuality.profile,
            textureScale: captureQuality.textureScale,
            lodBias: captureQuality.lodBias,
            ltPipelineId: STUDIO_BG3D_SHOT_BATCH_LT_PIPELINE_V1,
            pngEncodingId: STUDIO_BG3D_SHOT_BATCH_PNG_ENCODING_V1,
            psdEncodingId: STUDIO_BG3D_SHOT_BATCH_PSD_ENCODING_V1,
          },
          shots: captureSpecs,
        },
        layeredPsd: shotBatchIncludeLayeredPsd,
        contactSheet: shotBatchIncludeContactSheet,
        exportHeight: shotBatchExportHeight,
      });
      if (!batchPlanResult.ok) throw new Error(batchPlanResult.message);
      batchPlan = batchPlanResult.plan;
      await assertRecoveryAccess();
      recoverySession = await shotBatchRecoveryStore.acquire(batchPlan, batchSourceRevision, {
        signal: controller.signal,
      });
      provisionalRecoverySession = recoverySession;
      await assertRecoveryAccess();
      shotBatchRecoveryRef.current = recoverySession;
    } catch (cause) {
      if (provisionalRecoverySession) {
        await shotBatchRecoveryStore.release(provisionalRecoverySession);
        if (shotBatchRecoveryRef.current === provisionalRecoverySession) {
          shotBatchRecoveryRef.current = null;
        }
      }
      pendingInitialCameraRef.current = originalLiveView;
      captureInFlightRef.current = false;
      if (shotBatchAbortRef.current === controller) shotBatchAbortRef.current = null;
      if (shotBatchRecoveryScopeRef.current?.controller === controller) {
        shotBatchRecoveryScopeRef.current = null;
      }
      if (componentActiveRef.current) {
        flushSync(() => {
          setLineArtPreview(originalLineArtPreview);
          setIsCapturing(false);
          setShotBatchProgress(null);
          setError(cause instanceof StudioBg3dShotBatchRecoveryError
            ? cause.message
            : cause instanceof Error && cause.name === "AbortError"
            ? recoveryAccessRevoked
              ? "작품 열람 권한 또는 저장 대상이 변경되어 컷 일괄 렌더를 안전하게 중단했습니다."
              : "컷 일괄 렌더를 중단했습니다."
              : cause instanceof Error
                ? cause.message
                : "결정적 컷 계획을 만들지 못했습니다.");
          });
      }
      return;
    }
    const initiallyCompletedShots = studioBg3dShotBatchQueueCompletedCount(recoverySession.queue);
    setShotBatchRecoverySummary(initiallyCompletedShots > 0
      ? {
          completedShots: initiallyCompletedShots,
          totalShots: batchPlan.shots.length,
          mode: recoverySession.mode,
        }
      : null);
    setShotBatchProgress({
      stage: "render",
      completed: initiallyCompletedShots,
      total: batchPlan.shots.length,
      label: initiallyCompletedShots > 0 ? "검증된 artifact 복구" : "컷 렌더 준비",
    });

    const images = [...recoverySession.images];
    const skippedArtifacts = [...recoverySession.skippedArtifacts];
    const layeredPsds = [...recoverySession.layeredPsds];
    const psdFallbacks = [...recoverySession.psdFallbacks];
    let accumulatedArtifactBytes =
      images.reduce((total, image) => total + image.png.size, 0) +
      layeredPsds.reduce((total, artifact) => total + artifact.psd.size, 0);
    let activeRunToken: StudioBg3dShotBatchRunToken | null = null;
    let renderedProjection = originalLiveView.projection;
    let renderedViewportApi = planningViewportApi;
    try {
      for (let index = 0; index < batchPlan.shots.length; index += 1) {
        if (controller.signal.aborted) throw Object.assign(new Error("취소됨"), { name: "AbortError" });
        const shot = batchPlan.shots[index];
        if (!shot) throw new Error("컷 순서를 읽지 못했습니다.");
        const queueItem = recoverySession.queue.items[index];
        if (queueItem?.status === "succeeded") continue;
        if (document.visibilityState === "hidden") {
          setShotBatchProgress({
            stage: "render",
            completed: studioBg3dShotBatchQueueCompletedCount(recoverySession.queue),
            total: batchPlan.shots.length,
            label: "탭이 다시 표시되기를 기다리는 중",
          });
        }
        await waitForStudioBg3dBatchDocumentVisible(document, controller.signal);
        await assertRecoveryAccess();
        activeRunToken = await shotBatchRecoveryStore.startShot(recoverySession, shot.shotId);
        const appliedShot = applyStudioBg3dShot(currentDocument, shot.shotId);
        const applied = appliedShot
          ? freezeStudioBg3dShotAnimationsForBatch(appliedShot)
          : null;
        const projected = applied
          ? projectStudioBg3dShotVisibilityToRuntime(
              originalPrimitives,
              originalCustomModels,
              applied,
            )
          : null;
        if (!applied || !projected) throw new Error("컷 장면을 렌더 상태로 복원하지 못했습니다.");
        const backgroundSnapshot = createStudioBg3dCaptureBackgroundSnapshot({
          background: applied.background,
          transparent: applied.output.transparentBackground,
        });
        const plannedBackground = studioBg3dCaptureBackgroundRequestFromSnapshot(backgroundSnapshot);
        if (
          plannedBackground.color.toLowerCase() !== shot.capture.background.color.toLowerCase() ||
          plannedBackground.alpha !== shot.capture.background.alpha
        ) {
          throw new Error("컷 배경이 동결된 캡처 계획과 달라졌습니다.");
        }
        const appliedCaptureQuality = resolveStudioBg3dDeviceQuality({
          document: applied,
          mode: "capture",
          signals: deviceSignals,
        });
        if (appliedCaptureQuality.profile !== batchPlan.captureOwner.deviceProfile ||
          Math.min(appliedCaptureQuality.maxRenderPixels, STUDIO_BG3D_LT_RENDER_MAX_PIXELS) !==
            batchPlan.captureOwner.maxPixels ||
          appliedCaptureQuality.textureScale !== batchPlan.captureOwner.textureScale ||
          appliedCaptureQuality.lodBias !== batchPlan.captureOwner.lodBias ||
          appliedCaptureQuality.shadows !== shot.capture.shadows ||
          appliedCaptureQuality.shadowMapSize !== shot.capture.shadowMapSize) {
          throw new Error("컷별 렌더 품질이 동결된 캡처 계획과 달라졌습니다.");
        }

        const previousViewportApi = renderedViewportApi;
        const projectionChanged = renderedProjection !== applied.camera.projection;
        flushSync(() => {
          setPrimitives(projected.primitives);
          setCustomModels(projected.customModels);
          setSceneBaseDocument(applied);
          setCaptureBackgroundSnapshot(backgroundSnapshot);
          setShotBatchProgress({
            stage: "render",
            completed: index,
            total: batchPlan.shots.length,
            label: shot.shotName,
          });
        });
        const appliedViewportApi = await applyStudioBg3dViewportAfterTransition({
          view: applied.camera,
          previousApi: previousViewportApi,
          requireReplacement: projectionChanged,
          readApi: () => viewportApiRef.current,
          isActive: () => componentActiveRef.current && !controller.signal.aborted,
          waitForPaintFrame: waitForStudioBg3dPaintFrame,
          signal: controller.signal,
          timeoutMs: 15_000,
        });
        if (!appliedViewportApi) {
          throw new Error("컷 카메라를 새 viewport에 안전하게 복원하지 못했습니다.");
        }
        pendingInitialCameraRef.current = null;
        renderedViewportApi = appliedViewportApi;
        renderedProjection = applied.camera.projection;

        let captured: Awaited<ReturnType<typeof captureStudioBg3dRaster>> | null = null;
        while (!captured) {
          if (document.visibilityState === "hidden") {
            setShotBatchProgress({
              stage: "render",
              completed: studioBg3dShotBatchQueueCompletedCount(recoverySession.queue),
              total: batchPlan.shots.length,
              label: `${shot.shotName} · 표시 상태 대기`,
            });
          }
          await waitForStudioBg3dBatchDocumentVisible(document, controller.signal);
          try {
            const captureAdapter = await acquireStudioBg3dCaptureAdapterAfterViewTransition({
              isActive: () => componentActiveRef.current && !controller.signal.aborted,
              readAdapter: () => captureRef.current.adapter,
              waitForPaintFrame: waitForStudioBg3dPaintFrame,
              signal: controller.signal,
              timeoutMs: 15_000,
            });
            if (!captureAdapter || controller.signal.aborted) {
              throw Object.assign(new Error("취소됨"), { name: "AbortError" });
            }
            const sourceSize = await getStudioBg3dCaptureSourceSize(captureAdapter);
            const captureOwnerMismatches = [
              captureAdapter.backend === batchPlan.captureOwner.backend
                ? null
                : `backend ${captureAdapter.backend}`,
              captureAdapter.engineId === batchPlan.captureOwner.engineId
                ? null
                : `engine ${captureAdapter.engineId}`,
              captureAdapter.engineVersion === batchPlan.captureOwner.engineRevision
                ? null
                : `engine revision ${captureAdapter.engineVersion}`,
              captureAdapter.implementationRevision ===
                  batchPlan.captureOwner.implementationRevision
                ? null
                : `adapter revision ${captureAdapter.implementationRevision}`,
              captureAdapter.graphicsApi === batchPlan.captureOwner.graphicsApi
                ? null
                : `graphics API ${captureAdapter.graphicsApi}`,
              captureAdapter.profileId === batchPlan.captureOwner.profileId
                ? null
                : `profile ${captureAdapter.profileId}`,
              sourceSize.width === batchPlan.captureOwner.sourceWidth &&
                  sourceSize.height === batchPlan.captureOwner.sourceHeight
                ? null
                : `viewport ${sourceSize.width}×${sourceSize.height} ` +
                  `(plan ${batchPlan.captureOwner.sourceWidth}×${batchPlan.captureOwner.sourceHeight})`,
            ].filter((value): value is string => value !== null);
            if (captureOwnerMismatches.length > 0) {
              throw new Error(
                `3D 캡처 소유자가 동결된 컷 계획과 달라졌습니다: ${captureOwnerMismatches.join(", ")}.`,
              );
            }
            captured = await captureStudioBg3dRaster(
              captureAdapter,
              {
                width: shot.capture.width,
                height: shot.capture.height,
                background: shot.capture.background,
                includeDepth: shot.capture.includeDepth,
              },
              { signal: controller.signal, timeoutMs: 30_000 },
            );
          } catch (cause) {
            if (
              cause instanceof Error &&
              cause.name === "TimeoutError" &&
              document.visibilityState === "hidden"
            ) {
              continue;
            }
            throw cause;
          }
        }
        if (controller.signal.aborted) throw Object.assign(new Error("취소됨"), { name: "AbortError" });
        const shotArtifacts = await buildStudioBg3dShotArtifacts({
          shot,
          captured,
          settings: {
            line: applied.output.line,
            tone: applied.output.tone,
          },
          passes: batchPlan.passes,
          includeLayeredPsd: shotBatchIncludeLayeredPsd,
          committedArtifactBytes: accumulatedArtifactBytes,
          signal: controller.signal,
        });
        if (!activeRunToken) throw new Error("컷 배치 실행 토큰을 읽지 못했습니다.");
        await assertRecoveryAccess();
        await shotBatchRecoveryStore.completeShot(recoverySession, activeRunToken, {
          images: shotArtifacts.images,
          skippedArtifacts: shotArtifacts.skippedArtifacts,
          layeredPsds: shotArtifacts.layeredPsds,
          psdFallbacks: shotArtifacts.psdFallbacks,
        }, {
          signal: controller.signal,
          authorizeBeforeCommit: async () => {
            await assertRecoveryAccess();
            const authorizedAt = Date.now();
            return {
              authorizedAt,
              expiresAt: authorizedAt +
                STUDIO_BG3D_SHOT_BATCH_RECOVERY_AUTHORIZATION_RECEIPT_MAX_TTL_MS,
              isLocallyCurrent: () => componentActiveRef.current && !controller.signal.aborted &&
                shotBatchAbortRef.current === controller &&
                shotBatchAuthorizationEpochRef.current === authorizationEpoch,
            };
          },
        });
        images.push(...shotArtifacts.images);
        skippedArtifacts.push(...shotArtifacts.skippedArtifacts);
        layeredPsds.push(...shotArtifacts.layeredPsds);
        psdFallbacks.push(...shotArtifacts.psdFallbacks);
        accumulatedArtifactBytes += shotArtifacts.artifactBytes;
        activeRunToken = null;
        const completedShots = studioBg3dShotBatchQueueCompletedCount(recoverySession.queue);
        setShotBatchRecoverySummary({
          completedShots,
          totalShots: batchPlan.shots.length,
          mode: recoverySession.mode,
        });
        setShotBatchProgress({
          stage: "render",
          completed: completedShots,
          total: batchPlan.shots.length,
          label: shot.shotName,
        });
      }

      await assertRecoveryAccess();
      if (images.length === 0) {
        throw new Error("선택한 패스가 모든 컷에서 꺼져 있어 출력 artifact가 없습니다.");
      }

      let contactSheets: StudioBg3dShotBatchContactSheet[] = [];
      let contactSheetFallback: StudioBg3dShotBatchContactSheetFallback | undefined;
      if (batchPlan.includeContactSheet) {
        const imageByKey = new Map(images.map((image) => [
          `${image.shotId}:${image.pass ?? image.output ?? "beauty"}`,
          image,
        ] as const));
        const contactSources = batchPlan.shots.map((shot): StudioBg3dShotContactSheetImage | null => {
          for (const pass of STUDIO_BG3D_SHOT_CONTACT_SHEET_PASS_PRIORITY) {
            const image = imageByKey.get(`${shot.shotId}:${pass}`);
            if (image) {
              return {
                shotId: image.shotId,
                shotName: image.shotName,
                width: image.width,
                height: image.height,
                png: image.png,
              };
            }
          }
          return null;
        });
        if (contactSources.some((source) => source === null)) {
          contactSheetFallback = "source-unavailable";
        } else if (typeof Worker !== "function") {
          contactSheetFallback = "unavailable";
        } else {
          setShotBatchProgress({
            stage: "contact",
            completed: 0,
            total: contactSources.length,
            label: "콘택트 시트 준비",
          });
          try {
            const result = await buildStudioBg3dShotContactSheetsInWorker(
              contactSources as StudioBg3dShotContactSheetImage[],
              {
                signal: controller.signal,
                timeoutMs: 120_000,
                onProgress: (progress) => setShotBatchProgress({
                  stage: "contact",
                  completed: progress.completedShots,
                  total: progress.totalShots,
                  label: `콘택트 시트 ${progress.completedSheets}/${progress.totalSheets}장`,
                }),
              },
            );
            const contactBytes = result.sheets.reduce((total, sheet) => total + sheet.png.size, 0);
            if (accumulatedArtifactBytes + contactBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES) {
              contactSheetFallback = "budget";
            } else {
              contactSheets = [...result.sheets];
              accumulatedArtifactBytes += contactBytes;
            }
          } catch (cause) {
            if (cause instanceof Error && cause.name === "AbortError") throw cause;
            contactSheetFallback = cause instanceof Error && cause.name === "NotSupportedError"
              ? "unavailable"
              : "worker-failed";
          }
        }
      }

      await assertRecoveryAccess();
      setShotBatchProgress({
        stage: "archive",
        completed: 0,
        total: images.length + layeredPsds.length + contactSheets.length + 1,
        label: "ZIP 패키지 생성",
      });
      const archiveOptions: StudioBg3dShotBatchBuildOptions = {
        signal: controller.signal,
        manifest: {
          publicRenderPlan: await projectStudioBg3dShotBatchPlanForPublicArchive(batchPlan, {
            appProfileId: STUDIO_BG3D_SHOT_BATCH_APP_IMPLEMENTATION_PROFILE_V1,
            sourceRevision: batchSourceRevision,
          }),
          skippedArtifacts,
          psdFallbacks,
          ...(contactSheetFallback ? { contactSheetFallback } : {}),
        },
        layeredPsds,
        contactSheets,
        onProgress: (progress) => setShotBatchProgress({
          stage: "archive",
          completed: progress.completedFiles,
          total: progress.totalFiles,
          label: "ZIP 패키지 생성",
        }),
      };
      let archive: Blob;
      if (typeof Worker !== "function") {
        archive = await buildStudioBg3dShotBatchArchive(images, archiveOptions);
      } else {
        try {
          archive = await buildStudioBg3dShotBatchArchiveInWorker(images, archiveOptions);
        } catch (cause) {
          // The ready handshake guarantees no caller-owned Blob reached the Worker in this case,
          // so a single bounded main-thread build is safe. Once ready, every failure is terminal:
          // retrying could duplicate expensive work or conceal a protocol/integrity violation.
          if (!isStudioBg3dShotBatchWorkerUnavailableError(cause)) throw cause;
          archive = await buildStudioBg3dShotBatchArchive(images, archiveOptions);
        }
      }
      if (controller.signal.aborted) throw Object.assign(new Error("취소됨"), { name: "AbortError" });
      const downloadUrl = URL.createObjectURL(archive);
      try {
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = "toonspectrum-3d-shot-passes.zip";
        anchor.rel = "noopener";
        document.body.append(anchor);
        try {
          await commitStudioBg3dShotBatchDownload({
            signal: controller.signal,
            isActive: () => componentActiveRef.current,
            assertAccess: assertRecoveryAccess,
            markDownloadRequested: () =>
              shotBatchRecoveryStore.markDownloadRequested(recoverySession),
            download: () => anchor.click(),
          });
        } finally {
          anchor.remove();
        }
        if (componentActiveRef.current) {
          setShotBatchRecoverySummary({
            completedShots: studioBg3dShotBatchQueueCompletedCount(recoverySession.queue),
            totalShots: batchPlan.shots.length,
            mode: recoverySession.mode,
            downloadRequested: true,
            degradedReason: recoverySession.degradedReason,
          });
        }
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
      }
    } catch (cause) {
      const aborted = cause instanceof Error && cause.name === "AbortError";
      const budgetExceeded = cause instanceof RangeError ||
        cause instanceof StudioBg3dShotBatchRecoveryError && cause.code === "budget-exceeded";
      let recoveryTransitionFailed = false;
      // Once the server or active document revokes access, do not persist even a queue reset. The
      // next authorized acquire already normalizes an interrupted `running` item to `pending`.
      if (activeRunToken && !recoveryAccessRevoked) {
        try {
          if (aborted) {
            await shotBatchRecoveryStore.resetInterrupted(recoverySession);
          } else {
            let failureCode: StudioBg3dShotBatchFailureCode = "unknown";
            if (document.visibilityState === "hidden") failureCode = "visibility-interrupted";
            else if (cause instanceof Error && cause.name === "TimeoutError") failureCode = "view-timeout";
            else if (budgetExceeded) failureCode = "artifact-budget-exceeded";
            else if (cause instanceof Error && cause.message.includes("복원")) {
              failureCode = "scene-restore-failed";
            } else if (cause instanceof Error && cause.message.includes("PNG")) {
              failureCode = "encode-failed";
            }
            await shotBatchRecoveryStore.failShot(recoverySession, activeRunToken, failureCode);
          }
        } catch {
          recoveryTransitionFailed = true;
        }
      }
      const completedShots = studioBg3dShotBatchQueueCompletedCount(recoverySession.queue);
      if (componentActiveRef.current) {
        setShotBatchRecoverySummary(completedShots > 0
          ? {
              completedShots,
              totalShots: batchPlan.shots.length,
              mode: recoverySession.mode,
              degradedReason: recoverySession.degradedReason,
            }
          : null);
      }
      const recoveryLocation = recoverySession.mode === "durable"
        ? "브라우저 복구 저장소"
        : "현재 탭 메모리";
      const recoveryWarning = recoveryTransitionFailed
        ? " 복구 상태 전이를 기록하지 못해 다음 실행에서 현재 컷을 다시 검증합니다."
        : recoverySession.degradedReason
          ? ` ${recoverySession.degradedReason}`
          : "";
      const failureDetail = cause instanceof Error && cause.message.trim().length > 0
        ? ` 원인: ${cause.message.trim()}`
        : "";
      if (componentActiveRef.current) {
        if (aborted) {
          setError(
            recoveryAccessRevoked
              ? "작품 열람 권한 또는 저장 대상이 변경되어 컷 일괄 렌더를 중단하고 복구 lease를 해제했습니다."
              : completedShots > 0
              ? `${completedShots}개 컷 artifact를 ${recoveryLocation}에 보존했습니다. 같은 계획으로 다시 실행하면 이어서 렌더합니다.${recoveryWarning}`
              : `컷 일괄 렌더를 중단했습니다. 같은 계획으로 다시 실행할 수 있습니다.${recoveryWarning}`,
          );
        } else {
          setError(
            budgetExceeded
              ? `컷 artifact 합계가 배치 예산을 넘었습니다. 이전 완료 컷은 ${recoveryLocation}에 보존했습니다. 컷이나 패스를 줄여 주세요.${recoveryWarning}`
              : `컷 일괄 렌더를 완료하지 못했습니다. 완료 artifact를 ${recoveryLocation}에 보존했으므로 같은 계획으로 다시 시도해 주세요.${failureDetail}${recoveryWarning}`,
          );
        }
      }
    } finally {
      let restoreFailed = false;
      if (componentActiveRef.current) {
        const previousViewportApi = renderedViewportApi;
        const projectionChanged = renderedProjection !== originalLiveView.projection;
        flushSync(() => {
          setPrimitives(originalPrimitives);
          setCustomModels(originalCustomModels);
          setSceneBaseDocument(originalSceneBaseDocument);
          setCaptureBackgroundSnapshot(null);
          setLineArtPreview(originalLineArtPreview);
        });
        try {
          const restoredViewportApi = await applyStudioBg3dViewportAfterTransition({
            view: originalLiveView,
            previousApi: previousViewportApi,
            requireReplacement: projectionChanged,
            readApi: () => viewportApiRef.current,
            isActive: () => componentActiveRef.current,
            waitForPaintFrame: waitForStudioBg3dPaintFrame,
            timeoutMs: 5_000,
          });
          if (!restoredViewportApi) restoreFailed = true;
        } catch {
          restoreFailed = true;
        }
        // Ending capture remounts all four Views when the editor started in quad mode. Keep the
        // live composition pending through that remount so the main viewport controller reapplies
        // its position, target, projection, zoom, and lens shift instead of accepting camera props.
        pendingInitialCameraRef.current = restoreFailed || isQuadView ? originalLiveView : null;
      }
      const recoveryRelease = shotBatchRecoveryStore.release(recoverySession);
      let releaseTimeoutId: number | null = null;
      await Promise.race([
        recoveryRelease,
        new Promise<void>((resolve) => {
          releaseTimeoutId = window.setTimeout(resolve, 2_000);
        }),
      ]);
      if (releaseTimeoutId !== null) window.clearTimeout(releaseTimeoutId);
      if (shotBatchRecoveryRef.current === recoverySession) shotBatchRecoveryRef.current = null;
      if (shotBatchAbortRef.current === controller) shotBatchAbortRef.current = null;
      if (shotBatchRecoveryScopeRef.current?.controller === controller) {
        shotBatchRecoveryScopeRef.current = null;
      }
      captureInFlightRef.current = false;
      if (componentActiveRef.current) {
        flushSync(() => {
          setIsCapturing(false);
          setShotBatchProgress(null);
          if (restoreFailed) {
            setError("컷 배치 후 원래 카메라 구도를 즉시 복원하지 못했습니다. viewport가 준비되면 자동으로 다시 적용합니다.");
          }
        });
      }
    }
  }

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
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
    undoRef.current = doUndo;
    redoRef.current = doRedo;
    deleteSelectedRef.current = deleteSelectedEntity;
  });

  // 키보드 단축키: T/R/S 변환 모드, ⌘/Ctrl+Z(+Shift) undo/redo, Delete/Backspace 삭제,
  // Escape와 Tab 포커스 루프는 useStudioModalSheet가 전담한다. 숫자 입력 필드가 있으므로
  // 편집 중에는 캔버스 단축키만 무시한다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      if (captureInFlightRef.current) return;

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
      if (lower === "t") setTransformMode("translate");
      else if (lower === "r") setTransformMode("rotate");
      else if (lower === "s") setTransformMode("scale");
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
    if (surfaceSnapArmedRef.current) {
      cancelSurfaceSnap("표면 붙이기를 취소했습니다.");
      return;
    }
    requestUserClose();
  }

  function requestUserClose() {
    // The header sits outside the inert editor grid, so the ref is the synchronous authority for
    // clicks that can arrive before React commits capture/delete UI state. Successful insertion
    // closes via `onClose` directly after its transaction has completed.
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
    cancelSurfaceSnap();
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
    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: currentBaseDocument,
    });
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

    const previousLineArtPreview = lineArtPreview;
    captureInFlightRef.current = true;
    setCaptureBackgroundSnapshot(backgroundSnapshot);
    setLineArtPreview(false);
    setIsCapturing(true);
    try {
      // The asset writer is needed only after an explicit user save. Keep it outside the 3D
      // editor activation graph, while the synchronous capture guard above prevents a second
      // save or modal close during the bounded chunk load.
      const { saveAsset } = await import("./studio-asset-library");
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

  async function handleInsert() {
    if (
      captureInFlightRef.current || isCapturing ||
      destructiveMutationGuardRef.current.blocksClose
    ) return;
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) {
      setError("물리 미리보기를 초기화하거나 현재 자세를 적용한 뒤 3D 배경을 추가하세요.");
      return;
    }
    if (insertBlocked) {
      setError("3D 장면 복원과 모델 렌더 준비를 모두 마친 뒤 추가할 수 있습니다.");
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
    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: currentBaseDocument,
    });
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

    const ltSettingsSnapshot: StudioBg3dLtRenderSettings = Object.freeze({
      line: Object.freeze({ ...adapted.document.output.line }),
      tone: Object.freeze({ ...adapted.document.output.tone }),
    });
    ltInsertAbortRef.current?.abort();
    const insertController = new AbortController();
    ltInsertAbortRef.current = insertController;
    const insertSceneEpoch = ltInsertSceneEpochRef.current;
    const isInsertCurrent = () => (
      !insertController.signal.aborted &&
      ltInsertAbortRef.current === insertController &&
      ltInsertSceneEpochRef.current === insertSceneEpoch &&
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
      // 캡처 비율은 뷰포트 캔버스 크기가 아니라 문서가 소유한 값에서 나온다. 값이 없는(레거시)
      // 문서만 예전처럼 뷰포트 비율을 그대로 따르고, 그때 프레임은 뷰포트 전체와 정확히 같다.
      const captureFrame = resolveStudioBg3dCaptureFrame({
        viewportWidth: sourceSize.width,
        viewportHeight: sourceSize.height,
        aspectRatio: adapted.document.output.exportAspectRatio ?? null,
      });
      if (!captureFrame) {
        throw new Error("LT capture frame admission failed.");
      }
      // HiDPI 화면에서 프리뷰(디바이스 픽셀 밀도 렌더)와 삽입 결과의 선명도가 일치하도록
      // exportHeight에 dpr(1..3 클램프)만 곱한다 — 슈퍼샘플은 LT 주선/톤이 px 단위라 룩이
      // 변해 의도적으로 제외. 픽셀 예산·4096 edge 캡은 resolveStudioBg3dLtCaptureSize가 지킨다.
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
      // 프레임이 뷰포트와 다를 때만 카메라 view 창을 잡는다(렌즈 시프트와 선형 합성). 크롭 없는
      // 자동 경로에서는 카메라를 아예 건드리지 않아 예전 결과와 완전히 동일하다. 크롭이 필요한데
      // 카메라를 못 잡으면 늘어난 그림을 삽입하는 대신 실패한다(fail-closed).
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
      const encoded = encodeStudioBg3dLtLayers(rendered.layers);
      if (!isInsertCurrent() || captureAdapterIsStale()) return;
      // 소실점도 캡처 프레임 기준이어야 한다. 중앙 크롭은 NDC 선형 확대라 카메라 설정을 프레임
      // 배율로 환산하면 잘린 래스터 좌표계에서 렌더러와 정확히 같은 위치가 나온다.
      const perspectiveGuides = deriveStudioBg3dVanishingPoints(
        resolveStudioBg3dCaptureFrameCameraSettings(adapted.document.camera, captureFrame),
        rendered.width,
        rendered.height,
      ).map((point) => ({
        axis: point.axis,
        x: point.x / rendered.width,
        y: point.y / rendered.height,
      }));
      setSceneBaseDocument(adapted.document);
      const accepted = onInsert({
        kind: "separated",
        width: rendered.width,
        height: rendered.height,
        layers: encoded.layers,
        compositePngDataUrl: encoded.compositePngDataUrl,
        perspectiveGuides,
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
          setError("장면 또는 출력 설정이 변경되어 LT 변환을 취소했습니다. 최신 장면에서 다시 추가해 주세요.");
        }
        return;
      }
      if (!isInsertCurrent()) return;
      if (insertFailure instanceof StudioBg3dLtRenderWorkerError) {
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

  function toggleSurfaceSnap(): void {
    if (surfaceSnapArmedRef.current) {
      cancelSurfaceSnap("표면 붙이기를 취소했습니다.");
      return;
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

    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      baseDocument: sceneBaseDocument,
    });
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
      const { runStudioBg3dPhysicsTimeline } = await import("./studio-bg3d-physics-worker-client");
      const timeline = await runStudioBg3dPhysicsTimeline({
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

  if (!open) return null;

  const placementActive =
    placementSession.phase === "preview" && placementPreviewAsset !== null;
  const effectiveIsQuadView = isQuadView && !isCapturing && !physicsInteractionLocked && !placementActive;
  const bg3dFrameLoop = resolveStudioBg3dFrameLoop({
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
  const twoPointPerspectiveActive = isStudioBg3dTwoPointPerspectiveActive(sceneBaseDocument.camera);
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
  
  const sceneContent = (
    <Fragment>
      <CaptureBridge onCaptureUpdate={onCaptureUpdate} />
      <StudioBg3dWebglRenderSettingsController render={sceneBaseDocument.render} />
      <BgViewportController
        onReady={handleViewportReady}
      />
      <SkyClearColorController clearColor={getSkyPreset(renderedSkyPresetId).clearColor} />
      <StudioBg3dScenePanorama
        presetId={renderedSkyPresetId}
        rotationDegrees={renderedPanoramaRotation}
      />
      <StudioBg3dSceneFog background={renderedBackgroundSettings} />
      <ambientLight
        color={sceneBaseDocument.lighting.ambientColor}
        intensity={sceneBaseDocument.lighting.ambientIntensity}
      />
      <directionalLight
        castShadow={deviceQuality.shadows && sceneBaseDocument.lighting.key.castsShadow}
        color={sceneBaseDocument.lighting.key.color}
        intensity={sceneBaseDocument.lighting.key.intensity}
        position={[...sceneBaseDocument.lighting.key.direction]}
        shadow-mapSize-height={deviceQuality.shadowMapSize || 1024}
        shadow-mapSize-width={deviceQuality.shadowMapSize || 1024}
      />
      <directionalLight
        castShadow={deviceQuality.shadows && sceneBaseDocument.lighting.fill.castsShadow}
        color={sceneBaseDocument.lighting.fill.color}
        intensity={sceneBaseDocument.lighting.fill.intensity}
        position={[...sceneBaseDocument.lighting.fill.direction]}
        shadow-mapSize-height={deviceQuality.shadowMapSize || 1024}
        shadow-mapSize-width={deviceQuality.shadowMapSize || 1024}
      />
      <BgGroundHelper visible={!lineArtPreview && !isCapturing} />
      <BgSectionPlaneController state={sectionPlane} />
      <BgScaleGuide visible={scaleGuideVisible && !isCapturing} />
      {placementSession.phase === "preview" && placementPreviewAsset ? (
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
          onCloneStatus={updateModelCloneStatuses}
          onUnavailable={() => {
            setUnbatchableModelIds((current) => new Set(current).add(batch.modelId));
          }}
        />
      ))}
      {sceneHierarchy.roots.map(renderSceneEntity)}
      {!isCapturing &&
      !physicsInteractionLocked &&
      !surfaceSnapArmed &&
      !placementActive &&
      firstSelectedId &&
      !selectedIsLocked &&
      effectivelyVisibleLayerIds.has(firstSelectedId) &&
      primitiveObjectsRef.current.get(firstSelectedId) ? (
        <group ref={registerStudioBg3dCaptureExcludedObject}>
          <TransformControls
            object={primitiveObjectsRef.current.get(firstSelectedId)}
            mode={transformMode}
            space={transformMode === "rotate" ? "local" : "world"}
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

  const applyLensShift = (c: THREE.PerspectiveCamera | THREE.OrthographicCamera) => {
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
  };

  const mainCameraNode = isMainOrtho ? (
    <OrthographicCamera
      makeDefault
      position={[...sceneBaseDocument.camera.position]}
      zoom={sceneBaseDocument.camera.zoom ?? 1}
      near={0.1}
      far={200}
      onUpdate={applyLensShift}
    />
  ) : (
    <PerspectiveCamera
      makeDefault
      fov={sceneBaseDocument.camera.fovDegrees}
      position={[...sceneBaseDocument.camera.position]}
      zoom={sceneBaseDocument.camera.zoom ?? 1}
      near={0.1}
      far={200}
      onUpdate={applyLensShift}
    />
  );

  const commonOrbitControls = (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      enabled={!isTransforming && !isCapturing && !placementActive}
      minDistance={2}
      maxDistance={60}
    />
  );

  const modal = (
    <div
      ref={modalDialogRef}
      aria-modal="true"
      aria-labelledby="studio-bg3d-dialog-title"
      data-testid="studio-bg3d-dialog"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
      role="dialog"
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
            <h2 id="studio-bg3d-dialog-title" className="mt-1 truncate text-lg font-bold tracking-tight text-fg sm:text-xl">3D 배경 블록아웃 만들기</h2>
            <p className="mt-1 line-clamp-1 text-xs text-fg-3">상자·모델로 구조를 잡고 컬러·선화 레이어로 추출해 패널에 추가</p>
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
              title={isCapturing || deletingModelId !== null ? "진행 중인 작업이 끝난 뒤 닫을 수 있습니다" : "닫기 (Esc)"}
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
                  eventSource={viewportHostRef as unknown as React.RefObject<HTMLElement>}
                  camera={{
                    fov: sceneBaseDocument.camera.fovDegrees,
                    position: [...sceneBaseDocument.camera.position],
                    near: 0.1,
                    far: 200,
                  }}
                  className={cx(
                    "h-full w-full",
                    (surfaceSnapArmed || placementActive) && "cursor-crosshair",
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
                    }
                  }}
                >
                  <BgAdaptiveDprController
                    targetFps={deviceQuality.targetFps}
                    paused={isCapturing || !open}
                    onScaleChange={setAdaptiveDprScale}
                  />
                  <StudioBg3dPlacementPointerController
                    active={placementActive && !effectiveIsQuadView}
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
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing && !placementActive} />
                      </View>
                      <View track={viewFrontRef as unknown as React.RefObject<HTMLElement>}>
                        <OrthographicCamera makeDefault position={[0, 0, 15]} rotation={[0, 0, 0]} zoom={40} near={-100} far={100} />
                        {sceneContent}
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing && !placementActive} />
                      </View>
                      <View track={viewRightRef as unknown as React.RefObject<HTMLElement>}>
                        <OrthographicCamera makeDefault position={[15, 0, 0]} rotation={[0, Math.PI / 2, 0]} zoom={40} near={-100} far={100} />
                        {sceneContent}
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing && !placementActive} />
                      </View>
                      <View track={viewPerspRef as unknown as React.RefObject<HTMLElement>}>
                        {mainCameraNode}
                        {sceneContent}
                        {commonOrbitControls}
                      </View>
                    </Fragment>
                  ) : (
                    <Fragment>
                      {mainCameraNode}
                      {sceneContent}
                      {commonOrbitControls}
                    </Fragment>
                  )}
                </Canvas>

                {/* 세이프 프레임: 삽입될 사각형을 그대로 그리고, 잘려 나갈 영역을 레터/필러박스로
                    덮는다. 캡처와 같은 순수 함수에서 나오므로 화면과 결과가 어긋날 수 없다.
                    pointer-events-none이라 Orbit·선택 히트테스트에는 전혀 관여하지 않는다. */}
                {!effectiveIsQuadView && !isCapturing && viewportBoxSize && ltCaptureSafeFrame ? (
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
                  className="absolute left-2 top-2 z-10 grid grid-cols-3 gap-1.5 sm:left-2.5 sm:top-2.5 sm:flex sm:flex-col"
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
                            onClick={() => setTransformMode(m.id)}
                          >
                            <ModeIcon size={15} aria-hidden />
                          </button>
                        </StudioToolHintTarget>
                      );
                    })}
                  </div>
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
                      onClick={() => setIsQuadView((prev) => !prev)}
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
                  className="absolute right-2 top-2 z-10 grid grid-cols-2 gap-1.5 sm:right-2.5 sm:top-2.5 sm:flex sm:flex-col"
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

                {surfaceSnapStatus ? (
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

                {!physicsInteractionLocked && !viewportHinted ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                    <span className="rounded-full border border-line/70 bg-panel/85 px-3 py-1 text-center text-[0.66rem] font-medium text-fg-3 shadow-sm backdrop-blur">
                      끌어서 회전 · 오른쪽 드래그로 이동 · 도형 클릭으로 선택
                    </span>
                  </div>
                ) : null}

                {primitives.length === 0 && customModels.length === 0 ? (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
                    <div className="max-w-[18rem]">
                      <div className="mx-auto grid size-12 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
                        <Boxes size={22} aria-hidden />
                      </div>
                      <p className="mt-4 text-sm font-bold text-fg">
                        오른쪽 &ldquo;템플릿&rdquo; 탭에서 교실·거리 같은 완성된 공간을 통째로 추가하거나, &ldquo;도형&rdquo; 탭에서 상자·원기둥·평면을 하나씩 추가하고 &ldquo;모델&rdquo; 탭에서 3D 파일을 업로드해 배경을 잡아보세요.
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
              inert={physicsInteractionLocked}
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
                    aria-label={tab.id === "models" ? "모델" : tab.label}
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
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <Layers size={15} className="text-accent" aria-hidden />
                    레이어
                  </h3>
                  <span className="text-[0.68rem] text-fg-3">
                    {filteredLayerItems.length}/{layerListItems.length}개
                  </span>
                </div>
                {layerListItems.length === 0 ? (
                  <p className="text-xs leading-relaxed text-fg-3">아직 추가한 도형·모델이 없습니다. &ldquo;도형&rdquo;/&ldquo;모델&rdquo; 탭에서 먼저 추가해 주세요.</p>
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
                                        <PackageOpen size={13} className="shrink-0 text-fg-3" aria-hidden />
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
                                        if (item.kind === "primitive") {
                                          const source = primitives.find((p) => p.id === item.id);
                                          if (!source) return;
                                          const clone = duplicatePrimitive(source);
                                          setPrimitives((prev) => [...prev, clone]);
                                          setSelectedIds(new Set([clone.id]));
                                          return;
                                        }
                                        const source = customModels.find((m) => m.id === item.id);
                                        if (!source) return;
                                        const clone = duplicateBgCustomModelInstance(source);
                                        setCustomModels((prev) => [...prev, clone]);
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

<StudioBg3dViewPanel
                hidden={hideOnTab("view")}
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

<StudioBg3dLtPanel
                hidden={hideOnTab("lt")}
                context={{
                  ScanLine,
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
                        <PackageOpen size={15} className="text-accent" aria-hidden />
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
              </section>
            </div>

            {sceneRecoveryError || hasCloneFailure ? (
              <div role="alert" className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-bad/45 bg-[oklch(0.66_0.20_25/0.10)] px-3 py-2 text-xs leading-relaxed text-fg sm:mx-5">
                <AlertTriangle className="mt-0.5 shrink-0 text-bad" size={14} aria-hidden />
                <span>
                  {sceneRecoveryError ?? "검증된 모델의 렌더 인스턴스를 만들지 못했습니다. 기존 PNG를 보존하기 위해 저장을 막았습니다."}
                </span>
              </div>
            ) : null}

            {isRestoringScene || hasPendingClone ? (
              <div aria-live="polite" className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 sm:mx-5">
                <Loader2 className="shrink-0 animate-spin text-accent" size={14} aria-hidden />
                {isRestoringScene ? "검증된 3D 장면 원본을 복원하는 중입니다." : "모델 렌더 인스턴스를 준비하는 중입니다."}
              </div>
            ) : null}

            {!hasFilledOutput && !isRestoringScene ? (
              <div
                role="status"
                className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/45 bg-[oklch(0.82_0.15_80/0.08)] px-3 py-2 text-xs leading-relaxed text-fg sm:mx-5"
              >
                <span className="flex min-w-0 flex-1 items-start gap-2">
                  <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={14} aria-hidden />
                  <span>현재 설정은 재질색과 명암을 빼고 선화만 추가합니다.</span>
                </span>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-warn/55 bg-panel px-3 text-xs font-bold text-warn transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9"
                  onClick={() => {
                    updateLtToneSettings({ mode: "flat", type: "color", opacity: 1 });
                    setLtEditorSection("tone");
                  }}
                >
                  컬러 렌더 켜기
                </button>
              </div>
            ) : null}

            {error ? (
              <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 sm:mx-5">
                <AlertTriangle className="mt-0.5 shrink-0 text-accent" size={14} aria-hidden />
                {error}
              </div>
            ) : null}

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-3 py-3 min-[360px]:px-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="3D 배경 편집기 닫기"
                  className={cx(
                    CONTROL_BUTTON,
                    "shrink-0 whitespace-nowrap border-line bg-card text-fg-2 hover:bg-raised hover:text-fg max-[359px]:size-11 max-[359px]:px-0",
                  )}
                  disabled={isCapturing}
                  aria-disabled={deletingModelId !== null || undefined}
                  onClick={requestUserClose}
                >
                  <X size={14} className="hidden max-[359px]:block" aria-hidden />
                  <span className="max-[359px]:sr-only">닫기</span>
                </button>
                <button
                  type="button"
                  aria-label="3D 소재 저장"
                  className={cx(
                    CONTROL_BUTTON,
                    "shrink-0 whitespace-nowrap border-line bg-card text-fg-2 hover:bg-raised hover:text-fg max-[359px]:size-11 max-[359px]:px-0",
                  )}
                  disabled={(primitives.length === 0 && customModels.length === 0) || isCapturing || insertBlocked}
                  onClick={handleSaveToLibrary}
                >
                  <Save size={14} className="min-[360px]:mr-1.5" aria-hidden />
                  <span className="max-[359px]:sr-only">소재 저장</span>
                </button>
              </div>
              <button
                type="button"
                className={cx(
                  CONTROL_BUTTON,
                  "min-w-0 shrink whitespace-nowrap border-accent/60 bg-accent text-on-accent hover:bg-accent/90 min-[360px]:min-w-36",
                )}
                disabled={(primitives.length === 0 && customModels.length === 0) || isCapturing || insertBlocked}
                onClick={handleInsert}
              >
                {isCapturing || isRestoringScene || hasPendingClone ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                <span className="max-[359px]:hidden">
                  {initialScene || initialDataUrl
                    ? "3D 배경 업데이트"
                    : !hasFilledOutput
                      ? "선화만 추가"
                      : ltToneSettings.type === "color"
                        ? "컬러 배경 추가"
                        : "톤 배경 추가"}
                </span>
                <span className="hidden max-[359px]:inline">
                  {initialScene || initialDataUrl ? "업데이트" : "배경 추가"}
                </span>
              </button>
            </footer>
          </aside>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
