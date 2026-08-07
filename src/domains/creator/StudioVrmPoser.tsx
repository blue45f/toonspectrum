import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { Canvas, useFrame, useThree, createPortal, type ThreeEvent } from "@react-three/fiber";
import { AlertTriangle, Camera, ChevronDown, Clapperboard, FlipHorizontal2, ImagePlus, Loader2, Maximize2, Paintbrush, PersonStanding, Redo2, RotateCcw, RotateCw, Search, Shirt, Sliders, Smile, Sparkles, Swords, Trash2, Undo2, Upload, UserRound, WandSparkles, X, Webcam, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { createPortal as createDomPortal } from "react-dom";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { planStudio3dInsertCaptureSize } from "./studio-3d-insert-capture-plan";
import { STUDIO_STAMP_BRUSH_DEFAULTS } from "./studio-brush-stamp-engine";
import {
  isStudioHumanoidBoneName,
  type StudioHumanoidBoneName,
  type StudioPoseScope,
} from "./studio-humanoid-bones";
import { EXPRESSION_PRESETS, EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES, pickNaturalIdlePose, POSER_FINGER_BONES, type StudioExpressionPreset } from "./studio-pose-presets";
import { createTwoBoneDefaultPoleTarget } from "./studio-rig-two-bone-ik";
import {
  STUDIO_VRM_BASE_ROTATION_Y_KEY as BASE_ROTATION_Y_KEY,
  STUDIO_VRM_HTML_FALLBACK_ERROR as HTML_FALLBACK_VRM_ERROR,
  disposeStudioVrmAsset as disposeVrm,
  loadStudioVrmAsset as loadVrmAsset,
} from "./studio-vrm-asset-runtime";
import {
  createStudioVrmAuthoredFingerSnapshot,
  resolveStudioVrmFingerAuthority,
} from "./studio-vrm-auto-grip-authority";
import {
  createAvatarForgeState,
  parseAvatarForgeState,
  serializeAvatarForgeState,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import { BlinkStabilizer } from "./studio-vrm-blink-stabilizer";
import { HEAD_BONE_SMOOTHER, VrmBoneSmoother } from "./studio-vrm-bone-smoother";
import {
  classifyMeshName,
  COSTUME_SLOT_LABELS,
  COSTUME_PALETTES,
  parseCostumeState,
  resolveCostumeMaterialBaseHex,
  serializeCostume,
  tintColor,
  type CostumeState,
  type CostumeSlot,
} from "./studio-vrm-costume";
import { createStudioVrmExpressionApplyPlan } from "./studio-vrm-expression-apply";
import {
  solveStudioVrmFullBodyIk,
  type StudioVrmFullBodyIkResult,
} from "./studio-vrm-full-body-ik";
import {
  createStudioVrmGarmentEvaluationReceipt,
  inspectStudioVrmGarmentFit,
  type StudioVrmGarmentEvaluationReceipt,
} from "./studio-vrm-garment-fit";
import { avatarSideForHand, solveHandToFingerBones } from "./studio-vrm-hand-solver";
import {
  canCommitStudioVrmIkResult,
  cloneStudioVrmIkConstraints,
  enabledStudioVrmIkPolesSceneLocal,
  enabledStudioVrmIkTargetsSceneLocal,
  mirrorStudioVrmIkConstraints,
  removeStudioVrmIkConstraint,
  studioVrmSceneLocalPointToWorld,
  studioVrmWorldPointToSceneLocal,
  upsertStudioVrmIkConstraint,
} from "./studio-vrm-ik-constraints";
import { resolveStudioVrmInsertBackgroundMode } from "./studio-vrm-insert-background-mode";
import { clampStudioVrmJointRotation, getStudioVrmJointLimit } from "./studio-vrm-joint-limits";
import {
  buildStudioVrmPersistentIkSignature,
  type StudioVrmPersistentIkSignatureInput,
} from "./studio-vrm-persistent-ik-signature";
import { createStudioVrmPhotoPoseApplyPlan } from "./studio-vrm-photo-pose-apply";
import {
  parseVrmPhysicsSettings,
  DEFAULT_VRM_PHYSICS,
  applyVrmSpringBonePhysics,
  settleVrmPhysics,
  countSpringBoneJoints,
  PHYSICS_PREVIEW_MAX_DELTA,
  type VrmPhysicsSettings,
} from "./studio-vrm-physics";
import { createStudioVrmPoseApplyPlan } from "./studio-vrm-pose-apply";
import {
  STUDIO_VRM_DIRECT_EDIT_BONES,
  bakeStudioVrmRuntimePose,
} from "./studio-vrm-pose-bake";
import {
  clampStudioVrmJointDegrees,
  mirrorStudioVrmFingerRotations,
  mirrorStudioVrmPoseBones,
  straightenStudioVrmUpperBody,
  type StudioVrmPoseMirrorScope,
} from "./studio-vrm-pose-editing";
import {
  applyStudioVrmPoseMaterial,
  captureStudioVrmPoseMaterial,
  type StudioVrmPoseMaterialApplyResult,
  type StudioVrmPoseMaterialCaptureOptions,
} from "./studio-vrm-pose-material-adapter";
import {
  EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
  cloneStudioVrmPoseTranslations,
  mirrorStudioVrmPoseTranslations,
  normalizeStudioVrmPoseTranslations,
} from "./studio-vrm-pose-translations";
import {
  applyExpressionWeightsToVrm,
  applyPoseToVrm,
  applyVrmCustomColors,
  applyVrmMaterialFx,
  d,
  getPoseBoneRotation,
  hasVrmMToonMaterial,
  POSE_PRESETS,
  repairVrmTexturedNearBlackLitFactors,
  scrubVrmMannequinColorCaches,
  ZERO_ROTATION,
  computeLightingUniforms,
  deserializeFullVrmState,
  serializeFullVrmState,
  applyFullState,
  stripFingerBones,
  applyPoserVisualState,
  planFullStateRestore,
  createFullStateLoadHandlers,
  buildVrmPoseDataUrlMetadata,
  buildFullVrmStateFromSharedDataUrl,
  normalizeFullVrmModelId,
  DEFAULT_VRM_MATERIAL_FX,
  type PoseBoneMap,
  type PosePreset,
  type Vec3,
  type FingerRotationMap,
  type BodyScale,
  type LightingParams,
  type EnvVariant,
  type FullVrmState,
  type FullVrmStateInput,
  type VrmMaterialFx,
} from "./studio-vrm-poser-utils";
import {
  filterStudioVrmPosesByBucket,
  filterStudioVrmPosesByQuery,
  findStudioVrmLightingQuickPreset,
  loadStudioVrmRecentCharacters,
  loadStudioVrmRecentPoses,
  rememberStudioVrmRecent,
  saveStudioVrmRecentCharacters,
  saveStudioVrmRecentPoses,
  STUDIO_VRM_LIGHTING_QUICK_PRESETS,
  STUDIO_VRM_POSE_BUCKETS,
  studioVrmPoseBucketCountLabel,
  type StudioVrmPoseBucketId,
  type StudioVrmPoseListItem,
  type StudioVrmRecentState,
} from "./studio-vrm-poser-ux";
import {
  DEFAULT_BONE_OFFSETS,
  SCENE_PROP_IDS,
  SCENE_PROPS,
  SceneProp3D,
} from "./studio-vrm-procedural-scene-props";
import {
  applyVrmTwoBoneGrip,
  createVrmTwoBoneGripState,
  releaseVrmTwoBoneGripState,
} from "./studio-vrm-prop-ik";
import {
  createAutoGripFingerOverrides,
  DEFAULT_VRM_PROP_RIG_METRICS,
  measureVrmPropRigMetrics,
  resolvePropAttachment,
  resolveSecondaryHandConstraint,
  resolveSecondaryPropTarget,
  scaleVrmPropRigMetrics,
  type VrmPropRigMetrics,
} from "./studio-vrm-prop-rig";
import {
  createPropInstance,
  parseVrmProps,
  serializeVrmProps,
  buildPropObject,
  propDefById,
  type PropInstance,
} from "./studio-vrm-props";
import {
  captureStudioVrmRgba,
  encodeStudioVrmCapturePngDataUrl,
} from "./studio-vrm-raster-capture";
import { resolveStudioVrmFrameLoop } from "./studio-vrm-render-policy";
import {
  createStudioVrmRigProfileSelection,
  type StudioVrmRigProfileId,
} from "./studio-vrm-rig-profile";
import {
  STUDIO_VRM_FINGER_BONES,
  STUDIO_VRM_HUMANOID_BONES,
  STUDIO_VRM_MODEL_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION,
  normalizeStudioVrmSceneDocument,
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
  type StudioVrmCameraSettings,
  type StudioVrmIkConstraint,
  type StudioVrmPoseBoneMap,
  type StudioVrmPoseTranslations,
  type StudioVrmSceneDocument,
  type StudioVrmSceneModel,
  type StudioVrmSurfacePaintSettings,
} from "./studio-vrm-scene-document";
import {
  parseSceneProps,
  serializeSceneProps,
  type ScenePropAttachmentConfig as PropAttachmentConfig,
} from "./studio-vrm-scene-props";
import {
  selectSharedPoseAssets,
  shouldLoadSharedPoseLibrary,
} from "./studio-vrm-shared-pose-library";
import {
  buildStudioVrmGarmentGeometry,
  buildStudioVrmSkinnedGarment,
  type StudioVrmGarmentSkinBone,
  type StudioVrmSkinnedGarmentReceipt,
} from "./studio-vrm-skinned-garment";
import {
  appendStudioVrmFullStateHistory,
  commitStudioVrmFullStateHistoryTransaction,
  createStudioVrmFullStateHistory,
  resetStudioVrmFullStateHistory,
  stepStudioVrmFullStateHistory,
} from "./studio-vrm-state-history";
import { createStudioVrmTexturePaintCursor } from "./studio-vrm-texture-paint-cursor";
import {
  planStudioVrmTexturePaintDeviceTier,
  type StudioVrmTexturePaintEnvironmentSignals,
} from "./studio-vrm-texture-paint-device-tier";
import {
  createStudioVrmTexturePaintRuntime,
  type StudioVrmTexturePaintRayHit,
  type StudioVrmTexturePaintRuntime,
  type StudioVrmTexturePaintRuntimeSnapshot,
} from "./studio-vrm-texture-paint-runtime";
import {
  applyCalibration,
  CALIBRATION_STORAGE_KEY,
  CalibrationSampler,
  deserializeCalibration,
  serializeCalibration,
  type TrackingCalibration,
} from "./studio-vrm-tracking-calibration";
import { AdaptiveQualityController } from "./studio-vrm-tracking-quality";
import {
  solveStudioVrmUserIk,
  STUDIO_VRM_USER_IK_CHAINS,
  type StudioVrmUserIkResult,
} from "./studio-vrm-user-ik";
import {
  WARDROBE_SLOTS,
  WARDROBE_SLOT_LABELS,
  WARDROBE_FABRICS,
  SELECTABLE_WARDROBE_SETS,
  WARDROBE_FIT_MIN,
  WARDROBE_FIT_MAX,
  selectableWardrobeItemsBySlot,
  wardrobeItemById,
  wardrobeFabricById,
  selectableWardrobeSetById,
  applyWardrobeSet,
  createWardrobeEquip,
  buildGarmentParts,
  mergeWardrobeCostumeVisibility,
  parseWardrobeDocument,
  serializeWardrobe,
  sanitizeWardrobeMetrics,
  type GarmentPart,
  type LimbMetric,
  type WardrobeBone,
  type WardrobeEquip,
  type WardrobeMetrics,
  type WardrobeSlot,
  type WardrobeState,
} from "./studio-vrm-wardrobe";
import {
  initFaceLandmarker,
  disposeFaceLandmarker,
  initPoseLandmarker,
  disposePoseLandmarker,
  initHandLandmarker,
  disposeHandLandmarker,
  processTrackingResult,
  processPoseResult,
  convertChannelsToVrmData,
  createChannelSmoother,
  warmupLandmarkers,
  DEFAULT_TRACKING_OPTIONS,
  NEUTRAL_CHANNELS,
  type TrackingOptions,
  type TrackingChannels,
  type VrmTrackingData,
} from "./studio-vrm-webcam-tracking";
import { StudioToolHintTarget } from "./StudioToolHint";
import { StudioVrmAvatarForge, countDetectedVrmHairMeshes } from "./StudioVrmAvatarForge";
import { StudioVrmAvatarForgePanel } from "./StudioVrmAvatarForgePanel";
import { StudioVrmCharacterLibraryPanel } from "./StudioVrmCharacterLibraryPanel";
import {
  STUDIO_VRM_JOINT_HANDLE_DEFINITIONS,
  StudioVrmJointHandles,
  type StudioVrmIkAxisLock,
  type StudioVrmIkDragMode,
  type StudioVrmIkEffectorBone,
  type StudioVrmIkHandleControl,
  type StudioVrmJointHandleBone,
  type StudioVrmJointWorldPoint,
} from "./StudioVrmJointHandles";
import {
  StudioVrmPhotoPoseScanner,
  type StudioVrmPhotoPoseApplyPayload,
} from "./StudioVrmPhotoPoseScanner";
import { StudioVrmPoseMaterialPanel } from "./StudioVrmPoseMaterialPanel";
import { StudioVrmPropPanel } from "./StudioVrmPropPanel";
import { StudioVrmRigAssistPanel } from "./StudioVrmRigAssistPanel";
import {
  StudioVrmTexturePaintPanel,
  type StudioVrmTexturePaintPanelSettings,
} from "./StudioVrmTexturePaintPanel";
import {
  canonicalizeVrmContentHash,
  deleteStoredVrmModel,
  getStoredVrmModel,
  listVrmLibraryEntries,
  SAMPLE_VRM_ID,
  SAMPLE_VRM_ENTRIES,
  isBundledVrmRightsBlocked,
  selectableSampleVrmUrl,
  saveUploadedVrm,
  saveVrmThumbnail,
  type VrmLibraryEntry,
} from "./vrm-library";

import type { StudioVrmPoserInsertResult } from "./studio-3d-insert-contract";
import type { StudioPoseMaterial } from "./studio-pose-material";
import type { StudioToolHintSpec } from "./studio-tool-hints";
import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

import {
  publishAsset,
  listSharedAssetCatalog,
  deleteSharedAsset,
  getSharedAssetContent,
  markSharedAssetUsed,
  type SharedAssetCatalogItem,
  type SharedAssetCatalogPage,
} from "@/src/infrastructure/creator-client";

export type { StudioVrmPoserInsertResult } from "./studio-3d-insert-contract";

type StudioVrmPoserProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (result: StudioVrmPoserInsertResult) => boolean | void | Promise<boolean | void>;
  initialDataUrl?: string;
  initialScene?: StudioVrmSceneDocument;
};

type LoadStatus = "empty" | "loading" | "ready" | "error";
type LibraryStatus = "loading" | "ready" | "error";
type TexturePaintPersistenceStatus = "idle" | "restoring" | "ready" | "error";
type CaptureState = {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
};

function studioVrmTexturePaintSceneIdentity(
  scene: StudioVrmSceneDocument | undefined,
): string {
  if (!scene) return "new-scene";
  return JSON.stringify(scene.surfacePaint);
}

type CustomPose = {
  id: string;
  label: string;
  yOffset: number;
  bones: PoseBoneMap;
  poseTranslations?: StudioVrmPoseTranslations;
  expressionWeights?: Record<string, number>;
};

type ExpressionAction = {
  id: string;
  label: string;
  name: string | null;
  tone: string;
};

type CameraPreset = {
  id: string;
  label: string;
  position: Vec3;
  target: Vec3;
  fov: number;
};

type CostumePreset = {
  id: string;
  name: string;
  emoji: string;
  colors: Record<string, string>;
};

const COSTUME_PRESETS: CostumePreset[] = [
  {
    id: "school",
    name: "스쿨룩 (교복)",
    emoji: "🏫",
    colors: { tops: "#f8f9fa", bottoms: "#1e293b", hair: "#475569", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "knight",
    name: "성기사 (갑옷)",
    emoji: "🛡️",
    colors: { tops: "#cbd5e1", bottoms: "#1e3a8a", hair: "#fbbf24", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "royal",
    name: "로판 황실예복",
    emoji: "👑",
    colors: { tops: "#991b1b", bottoms: "#d97706", hair: "#e2e8f0", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "cyber",
    name: "사이버펑크",
    emoji: "⚡",
    colors: { tops: "#0f172a", bottoms: "#ec4899", hair: "#a855f7", body: "#06b6d4", face: "#06b6d4" },
  },
  {
    id: "gothic",
    name: "고스 롤리타",
    emoji: "🖤",
    colors: { tops: "#111827", bottoms: "#581c87", hair: "#f3f4f6", body: "#f9fafb", face: "#f9fafb" },
  },
  {
    id: "autumn",
    name: "클래식 코트",
    emoji: "🍂",
    colors: { tops: "#d97706", bottoms: "#451a03", hair: "#b45309", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "marine",
    name: "마린 세일러",
    emoji: "⚓",
    colors: { tops: "#f8f9fa", bottoms: "#0f172a", hair: "#0284c7", body: "#ffe4e6", face: "#ffe4e6" },
  },
  {
    id: "druid",
    name: "숲의 엘프",
    emoji: "🍃",
    colors: { tops: "#065f46", bottoms: "#78350f", hair: "#10b981", body: "#fef3c7", face: "#fef3c7" },
  },
  {
    id: "ninja",
    name: "그림자 암살자",
    emoji: "🥷",
    colors: { tops: "#111827", bottoms: "#1f2937", hair: "#9ca3af", body: "#e5e7eb", face: "#e5e7eb" },
  },
  {
    id: "magical",
    name: "마법소녀/소년",
    emoji: "💖",
    colors: { tops: "#f472b6", bottoms: "#f472b6", hair: "#fb7185", body: "#ffe4e6", face: "#ffe4e6" },
  },
  {
    id: "wizard",
    name: "판타지 마법사",
    emoji: "🔮",
    colors: { tops: "#3b0764", bottoms: "#1e1b4b", hair: "#a5b4fc", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "murim",
    name: "무협 소협",
    emoji: "⚔️",
    colors: { tops: "#0284c7", bottoms: "#f8f9fa", hair: "#1e293b", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "ceo",
    name: "현대 재벌/정장",
    emoji: "💼",
    colors: { tops: "#0f172a", bottoms: "#0f172a", hair: "#1e293b", body: "#ffe4e6", face: "#ffe4e6" },
  },
  {
    id: "sporty",
    name: "스포티 트랙슈트",
    emoji: "🏃",
    colors: { tops: "#10b981", bottoms: "#10b981", hair: "#6b7280", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "explorer",
    name: "설원 탐험가",
    emoji: "❄️",
    colors: { tops: "#f1f5f9", bottoms: "#64748b", hair: "#38bdf8", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "steampunk",
    name: "스팀펑크",
    emoji: "⚙️",
    colors: { tops: "#78350f", bottoms: "#451a03", hair: "#d97706", body: "#fef3c7", face: "#fef3c7" },
  },
  {
    id: "angel",
    name: "성직자/천사",
    emoji: "👼",
    colors: { tops: "#ffffff", bottoms: "#ffffff", hair: "#fef08a", body: "#fffbeb", face: "#fffbeb" },
  },
  {
    id: "devil",
    name: "심연의 악마",
    emoji: "😈",
    colors: { tops: "#450a0a", bottoms: "#1a0505", hair: "#ef4444", body: "#1c1917", face: "#1c1917" },
  },
  {
    id: "zombie",
    name: "강시/강령술사",
    emoji: "🧟",
    colors: { tops: "#1e1b4b", bottoms: "#0f172a", hair: "#312e81", body: "#86efac", face: "#86efac" },
  },
  {
    id: "astronaut",
    name: "우주 대원",
    emoji: "👨‍🚀",
    colors: { tops: "#f97316", bottoms: "#e2e8f0", hair: "#475569", body: "#f1f5f9", face: "#f1f5f9" },
  },
  {
    id: "office",
    name: "오피스 정장",
    emoji: "💼",
    colors: { tops: "#f8fafc", bottoms: "#111827", hair: "#2b211f", body: "#c98b68", face: "#c98b68" },
  },
  {
    id: "doctor",
    name: "의사 가운",
    emoji: "🥼",
    colors: { tops: "#f8fafc", bottoms: "#155e75", hair: "#3b2b27", body: "#dca982", face: "#dca982" },
  },
  {
    id: "surgeon",
    name: "외과 수술복",
    emoji: "🩺",
    colors: { tops: "#0f766e", bottoms: "#115e59", hair: "#242124", body: "#9f684e", face: "#9f684e" },
  },
  {
    id: "nurse",
    name: "간호 스크럽",
    emoji: "🏥",
    colors: { tops: "#60a5fa", bottoms: "#2563eb", hair: "#49352f", body: "#efd1bb", face: "#efd1bb" },
  },
  {
    id: "paramedic",
    name: "응급구조사",
    emoji: "🚑",
    colors: { tops: "#f97316", bottoms: "#1e293b", hair: "#252027", body: "#b87855", face: "#b87855" },
  },
  // 추가 10종 (장르 다양성: 웹툰·판타지·현대·전통·코스프레)
  {
    id: "idol",
    name: "아이돌 스테이지",
    emoji: "🎤",
    colors: { tops: "#f472b6", bottoms: "#1e293b", hair: "#e0f2fe", body: "#ffe4e6", face: "#ffedd5" },
  },
  {
    id: "samurai",
    name: "사무라이",
    emoji: "🗡️",
    colors: { tops: "#334155", bottoms: "#1e293b", hair: "#0f172a", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "witch",
    name: "마녀",
    emoji: "🧙‍♀️",
    colors: { tops: "#312e81", bottoms: "#1e1b4b", hair: "#64748b", body: "#c084fc", face: "#c084fc" },
  },
  {
    id: "pirate",
    name: "해적",
    emoji: "🏴‍☠️",
    colors: { tops: "#334155", bottoms: "#1e293b", hair: "#854d0e", body: "#fed7aa", face: "#ffedd5" },
  },
  {
    id: "hanbok",
    name: "한복",
    emoji: "👘",
    colors: { tops: "#b91c1c", bottoms: "#166534", hair: "#1e293b", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "maid",
    name: "메이드",
    emoji: "🧹",
    colors: { tops: "#1e293b", bottoms: "#1e293b", hair: "#f3e8ff", body: "#fff1f2", face: "#ffedd5" },
  },
  {
    id: "butler",
    name: "집사/신사",
    emoji: "🎩",
    colors: { tops: "#0f172a", bottoms: "#0f172a", hair: "#1e293b", body: "#f1f5f9", face: "#ffedd5" },
  },
  {
    id: "superhero",
    name: "히어로",
    emoji: "🦸",
    colors: { tops: "#1e40af", bottoms: "#1e3a8a", hair: "#f8fafc", body: "#e0f2fe", face: "#ffedd5" },
  },
  {
    id: "qipao",
    name: "치파오",
    emoji: "🪭",
    colors: { tops: "#9f1239", bottoms: "#9f1239", hair: "#1e293b", body: "#ffedd5", face: "#ffedd5" },
  },
  {
    id: "street",
    name: "스트릿 패션",
    emoji: "🧢",
    colors: { tops: "#334155", bottoms: "#1e293b", hair: "#f59e0b", body: "#fef3c7", face: "#ffedd5" },
  },
];

const EXPORT_HEIGHT = 520;
const STUDIO_VRM_CAPTURE_PNG_TIMEOUT_MS = 20_000;
const STUDIO_VRM_SHARE_TIMEOUT_MS = 30_000;
const DEFAULT_VRM_CUSTOM_COLORS: Record<string, string> = {};
// 웹캠 트래킹에서 quaternion 슬러프 스무딩을 적용할 본(팔/다리/발/손 + 척추/가슴).
// 머리·목은 이미 얼굴 채널에서 EMA 스무딩되므로 제외.
const LIMB_BONE_RE = /Arm|Leg|Foot|Hand|[Ss]pine|[Cc]hest/;
// 솔버가 생성할 수 있는 팔다리 본 — 추적이 끊긴 본을 rest 로 페이드할 때 순회 대상.
const CANONICAL_LIMB_BONES = [
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
] as const;
const ZERO_EULER = [0, 0, 0] as const;
// 추적 끊김 시 rest 복귀 속도(half-life, 초). 짧은 깜빡임엔 거의 흔들리지 않게 충분히 길게.
const LIMB_FADE_HALF_LIFE = 0.5;
// vrm.lookAt 직접 구동 시 이중 적용을 막을 시선 표정 이름(lookAt 부재 모델 폴백용).
const LOOK_EXPRESSION_NAMES = new Set(["lookUp", "lookDown", "lookLeft", "lookRight"]);
// 얼굴 로스트: 이 프레임 수까지는 마지막 채널을 홀드(~0.3s, 순간 드랍 마스킹),
// 이후 중립 채널로 감쇠 복귀한다(One-Euro 필터가 전환을 스무딩 — 제로 스냅 없음).
const FACE_HOLD_FRAMES = 10;
// 얼굴 미검출이 이 프레임 수(~5초@30fps)를 넘으면 프리뷰에 힌트 배지를 띄운다.
const FACE_LOST_HINT_FRAMES = 150;
const FALLBACK_EXPORT_WIDTH = 360;
const THUMBNAIL_WIDTH = 72;
const THUMBNAIL_HEIGHT = 96;
const CONTROL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-11 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const VIEWPORT_BTN =
  "grid size-11 place-items-center rounded-lg border border-line/70 bg-panel/80 text-fg-2 shadow-sm backdrop-blur transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const VRM_VIEWPORT_HINTS = {
  undo: {
    id: "vrm:history:undo",
    title: "캐릭터 작업 실행 취소",
    description: "직전에 적용한 포즈·표정·조형 또는 장면 설정을 한 단계 되돌립니다.",
    shortcut: "⌘Z",
    preview: "undo",
  },
  redo: {
    id: "vrm:history:redo",
    title: "캐릭터 작업 다시 실행",
    description: "실행 취소한 캐릭터 편집을 다시 적용합니다.",
    shortcut: "⌘⇧Z",
    preview: "redo",
  },
  zoomIn: {
    id: "vrm:camera:zoom-in",
    title: "캐릭터 화면 확대",
    description: "카메라를 캐릭터 쪽으로 이동해 얼굴, 손과 의상 디테일을 크게 확인합니다.",
    preview: "camera-zoom",
  },
  zoomOut: {
    id: "vrm:camera:zoom-out",
    title: "캐릭터 화면 축소",
    description: "카메라를 뒤로 이동해 전신 포즈와 소품이 프레임 안에 들어오는지 확인합니다.",
    preview: "camera-zoom",
  },
  resetView: {
    id: "vrm:camera:reset",
    title: "캐릭터 시점 초기화",
    description: "카메라의 회전과 거리를 선택한 구도 프리셋의 기본 시점으로 되돌립니다.",
    preview: "camera-reset",
  },
  turntable: {
    id: "vrm:camera:turntable",
    title: "턴테이블 회전 시작",
    description: "다음 클릭으로 카메라가 캐릭터 주위를 자동으로 돌며 포즈와 소품 결합을 모든 방향에서 보여줍니다.",
    preview: "camera-orbit",
    previewVariant: "start",
    tip: "의상 관통이나 뒤쪽 소품 정렬을 빠르게 점검할 때 사용하세요.",
  },
} satisfies Record<string, StudioToolHintSpec>;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function VrmColorControl({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  function handleDraftChange(next: string) {
    setDraft(next);
    if (HEX_COLOR_PATTERN.test(next)) onChange(next.toLowerCase());
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        type="color"
        value={HEX_COLOR_PATTERN.test(value) ? value : "#ffffff"}
        disabled={disabled}
        aria-label={`${label} 색상 선택`}
        onChange={(event) => onChange(event.target.value)}
        className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0 disabled:cursor-not-allowed"
      />
      <input
        type="text"
        value={draft}
        disabled={disabled}
        aria-label={`${label} HEX 색상`}
        aria-invalid={!HEX_COLOR_PATTERN.test(draft)}
        autoCapitalize="none"
        autoCorrect="off"
        inputMode="text"
        maxLength={7}
        pattern="#[0-9a-fA-F]{6}"
        spellCheck={false}
        onChange={(event) => handleDraftChange(event.target.value)}
        onBlur={() => {
          if (!HEX_COLOR_PATTERN.test(draft)) setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(value);
            event.currentTarget.blur();
          }
        }}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-[0.68rem] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
      />
    </div>
  );
}

// 우측 컨트롤 패널 탭 — 16개 섹션을 작업 흐름별로 묶어 탐색 부담을 줄인다.
type PanelTab = "character" | "pose" | "face" | "scene" | "props";
const PANEL_TABS: Array<{ id: PanelTab; label: string; icon: typeof UserRound; hint: string }> = [
  { id: "character", label: "캐릭터", icon: UserRound, hint: "모델 · 의상 · 색상" },
  { id: "pose", label: "포즈", icon: PersonStanding, hint: "프리셋 · 관절 · 대기" },
  { id: "face", label: "표정", icon: Smile, hint: "표정 · 블렌드 · 웹캠" },
  { id: "scene", label: "연출", icon: Clapperboard, hint: "카메라 · 조명 · 물리" },
  { id: "props", label: "소품", icon: Swords, hint: "부착 · 배치" },
];

type CharacterPanelSection = "library" | "forge" | "appearance" | "wardrobe" | "surface";
const CHARACTER_PANEL_SECTIONS: Array<{
  id: CharacterPanelSection;
  label: string;
  icon: typeof UserRound;
}> = [
  { id: "library", label: "모델", icon: Upload },
  { id: "forge", label: "조형", icon: Sparkles },
  { id: "appearance", label: "체형·색", icon: Sliders },
  { id: "wardrobe", label: "의상", icon: Shirt },
  { id: "surface", label: "표면", icon: Paintbrush },
];

const DEFAULT_STUDIO_VRM_TEXTURE_PAINT_SETTINGS: StudioVrmTexturePaintPanelSettings = {
  tool: "brush",
  brushKind: "ink",
  color: "#d85f48",
  sizeTexels: 48,
  opacity: 1,
  blend: "normal",
  fillScope: "contiguous",
  fillTolerance: 24,
  tuning: {
    flow: STUDIO_STAMP_BRUSH_DEFAULTS.ink.flow,
    hardness: STUDIO_STAMP_BRUSH_DEFAULTS.ink.hardness,
    minSize: STUDIO_STAMP_BRUSH_DEFAULTS.ink.minSizeRatio,
  },
};

type StudioVrmTexturePaintSettingsUpdate =
  Partial<Omit<StudioVrmTexturePaintPanelSettings, "tuning">> & {
    readonly tuning?: Partial<StudioVrmTexturePaintPanelSettings["tuning"]>;
  };

function readStudioVrmTexturePaintEnvironmentSignals(): StudioVrmTexturePaintEnvironmentSignals {
  if (typeof window === "undefined") {
    return {
      coarsePointer: false,
      viewportWidthCssPixels: null,
      deviceMemoryGb: null,
    };
  }
  const navigatorWithDeviceMemory = window.navigator as Navigator & {
    readonly deviceMemory?: number;
  };
  const deviceMemory = navigatorWithDeviceMemory.deviceMemory;
  return {
    coarsePointer:
      typeof window.matchMedia === "function"
      && window.matchMedia("(pointer: coarse)").matches,
    viewportWidthCssPixels:
      Number.isFinite(window.innerWidth) && window.innerWidth > 0
        ? window.innerWidth
        : null,
    deviceMemoryGb:
      typeof deviceMemory === "number" && Number.isFinite(deviceMemory)
        ? deviceMemory
        : null,
  };
}

const ENV_VARIANTS: Array<{ id: EnvVariant; label: string }> = [
  { id: "none", label: "없음" },
  { id: "floor", label: "바닥" },
  { id: "wall", label: "벽" },
  { id: "room", label: "방" },
  { id: "outdoor", label: "야외" },
];
const HAND_SHAPE_PRESETS = [
  { id: "fist", label: "주먹" },
  { id: "open", label: "보" },
  { id: "point", label: "가리키기" },
  { id: "peace", label: "브이" },
  { id: "thumbsUp", label: "따봉" },
  { id: "relaxed", label: "기본" },
] as const;

const NEUTRAL_EXPRESSION_ACTION: ExpressionAction = { id: "neutral", label: "초기화", name: null, tone: "리셋" };
const EXPRESSION_LABELS: Record<string, string> = {
  happy: "행복",
  angry: "화남",
  sad: "슬픔",
  relaxed: "편안",
  surprised: "놀람",
  blink: "눈감음",
  blinkLeft: "왼쪽 눈",
  blinkRight: "오른쪽 눈",
  aa: "입모양 A",
  ih: "입모양 I",
  ou: "입모양 U",
  ee: "입모양 E",
  oh: "입모양 O",
  lookUp: "시선 위",
  lookDown: "시선 아래",
  lookLeft: "시선 왼쪽",
  lookRight: "시선 오른쪽",
};
const EXPRESSION_ORDER = [
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "blink",
  "blinkLeft",
  "blinkRight",
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "lookUp",
  "lookDown",
  "lookLeft",
  "lookRight",
];

const CAMERA_PRESETS: CameraPreset[] = [
  { id: "front", label: "정면", position: [0, 1.42, 3.15], target: [0, 1.22, 0], fov: 30 },
  { id: "threeQuarter", label: "사선", position: [1.55, 1.48, 2.75], target: [0, 1.2, 0], fov: 31 },
  { id: "low", label: "로우", position: [0.52, 0.92, 3.02], target: [0, 1.18, 0], fov: 32 },
  { id: "bust", label: "상반신", position: [0, 1.68, 2.1], target: [0, 1.45, 0], fov: 27 },
  { id: "high", label: "하이 앵글", position: [0, 2.2, 2.8], target: [0, 1.2, 0], fov: 28 },
  { id: "extremeLow", label: "웅장한 앵글", position: [0.1, 0.4, 2.5], target: [0, 1.3, 0], fov: 36 },
  { id: "closeup", label: "얼굴 줌", position: [0, 1.55, 1.25], target: [0, 1.5, 0], fov: 25 },
  { id: "profile", label: "측면", position: [2.8, 1.4, 0.35], target: [0, 1.25, 0], fov: 30 },
  { id: "overShoulder", label: "어깨 너머", position: [-1.35, 1.55, 1.85], target: [0.2, 1.35, 0], fov: 32 },
  { id: "fullBody", label: "전신", position: [0, 1.05, 4.4], target: [0, 0.95, 0], fov: 34 },
  { id: "dutch", label: "더치 앵글", position: [1.2, 1.35, 2.6], target: [0, 1.25, 0], fov: 33 },
  { id: "topDown", label: "탑 다운", position: [0.2, 3.4, 1.2], target: [0, 1.1, 0], fov: 36 },
];

const BONE_LABELS: Record<string, string> = {
  hips: "골반 (Hips)",
  head: "머리 (Head)",
  neck: "목 (Neck)",
  spine: "척추 (Spine)",
  chest: "가슴 (Chest)",
  upperChest: "윗가슴 (Upper Chest)",
  leftEye: "왼쪽 눈 (L Eye)",
  rightEye: "오른쪽 눈 (R Eye)",
  jaw: "턱 (Jaw)",
  leftShoulder: "왼쪽 쇄골/어깨 (L Shoulder)",
  rightShoulder: "오른쪽 쇄골/어깨 (R Shoulder)",
  leftUpperArm: "왼쪽 어깨 (L Upper Arm)",
  rightUpperArm: "오른쪽 어깨 (R Upper Arm)",
  leftLowerArm: "왼쪽 팔꿈치 (L Lower Arm)",
  rightLowerArm: "오른쪽 팔꿈치 (R Lower Arm)",
  leftHand: "왼쪽 손목 (L Hand)",
  rightHand: "오른쪽 손목 (R Hand)",
  leftUpperLeg: "왼쪽 고관절 (L Upper Leg)",
  rightUpperLeg: "오른쪽 고관절 (R Upper Leg)",
  leftLowerLeg: "왼쪽 무릎 (L Lower Leg)",
  rightLowerLeg: "오른쪽 무릎 (R Lower Leg)",
  leftFoot: "왼쪽 발목 (L Foot)",
  rightFoot: "오른쪽 발목 (R Foot)",
  leftToes: "왼쪽 발끝 (L Toes)",
  rightToes: "오른쪽 발끝 (R Toes)",
  // finger labels (detailed per-finger editing)
  leftThumbMetacarpal: "왼 엄지 중수 (L Thumb MC)",
  leftThumbProximal: "왼 엄지 근위 (L Thumb Prox)",
  leftThumbDistal: "왼 엄지 말단 (L Thumb Dist)",
  leftIndexProximal: "왼 검지 근위",
  leftIndexIntermediate: "왼 검지 중간",
  leftIndexDistal: "왼 검지 말단",
  leftMiddleProximal: "왼 중지 근위",
  leftMiddleIntermediate: "왼 중지 중간",
  leftMiddleDistal: "왼 중지 말단",
  leftRingProximal: "왼 약지 근위",
  leftRingIntermediate: "왼 약지 중간",
  leftRingDistal: "왼 약지 말단",
  leftLittleProximal: "왼 소지 근위",
  leftLittleIntermediate: "왼 소지 중간",
  leftLittleDistal: "왼 소지 말단",
  rightThumbMetacarpal: "오른 엄지 중수",
  rightThumbProximal: "오른 엄지 근위",
  rightThumbDistal: "오른 엄지 말단",
  rightIndexProximal: "오른 검지 근위",
  rightIndexIntermediate: "오른 검지 중간",
  rightIndexDistal: "오른 검지 말단",
  rightMiddleProximal: "오른 중지 근위",
  rightMiddleIntermediate: "오른 중지 중간",
  rightMiddleDistal: "오른 중지 말단",
  rightRingProximal: "오른 약지 근위",
  rightRingIntermediate: "오른 약지 중간",
  rightRingDistal: "오른 약지 말단",
  rightLittleProximal: "오른 소지 근위",
  rightLittleIntermediate: "오른 소지 중간",
  rightLittleDistal: "오른 소지 말단",
};

const BONE_CATEGORIES: Array<{ id: string; label: string; bones: VRMHumanBoneName[] }> = [
  { id: "head", label: "머리/목", bones: ["head", "neck"] },
  { id: "gaze", label: "시선/턱", bones: ["leftEye", "rightEye", "jaw"] },
  { id: "torso", label: "골반/몸통", bones: ["hips", "spine", "chest", "upperChest"] },
  { id: "rightArm", label: "오른팔", bones: ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"] },
  { id: "leftArm", label: "왼팔", bones: ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"] },
  { id: "rightLeg", label: "오른다리", bones: ["rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes"] },
  { id: "leftLeg", label: "왼다리", bones: ["leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes"] },
  { id: "leftFingers", label: "왼손가락", bones: POSER_FINGER_BONES.filter((b) => b.startsWith("left")) as VRMHumanBoneName[] },
  { id: "rightFingers", label: "오른손가락", bones: POSER_FINGER_BONES.filter((b) => b.startsWith("right")) as VRMHumanBoneName[] },
];

const VIEWPORT_POSE_BONES: readonly VRMHumanBoneName[] = Object.freeze([
  "hips", "spine", "chest", "neck", "head",
  "leftUpperArm", "leftLowerArm", "leftHand",
  "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot",
]);

type StudioVrmIkTransaction = {
  vrm: VRM;
  coordinateScene: THREE.Scene;
  effector: StudioVrmIkEffectorBone;
  control: StudioVrmIkHandleControl;
  revision: number;
  /** React-side pose/config snapshot that owns this pointer transaction. */
  authoritativeSignature: string;
  baseline: {
    bones: PoseBoneMap;
    yOffset: number;
    translations: StudioVrmPoseTranslations;
  };
  targetWorld: THREE.Vector3;
  poleWorld?: THREE.Vector3;
  latest: StudioVrmUserIkResult | StudioVrmFullBodyIkResult | null;
};

const STUDIO_VRM_IK_NOT_CONVERGED_STATUS =
  "전신 IK가 안정적으로 수렴하지 않아 미리보기를 취소하고 시작 자세로 되돌렸습니다. 목표를 몸 가까이 옮기거나 고정점을 줄인 뒤 다시 시도해 주세요.";

const STUDIO_VRM_IK_DRAG_MODES: readonly {
  id: StudioVrmIkDragMode;
  label: string;
  description: string;
}[] = Object.freeze([
  { id: "screen", label: "화면", description: "화면과 나란한 평면에서 이동" },
  { id: "depth", label: "깊이", description: "위로 끌면 멀리, 아래로 끌면 가까이 이동" },
]);

const STUDIO_VRM_IK_AXIS_LOCKS: readonly {
  id: StudioVrmIkAxisLock;
  label: string;
  description: string;
}[] = Object.freeze([
  { id: "free", label: "자유", description: "축 제한 없이 이동" },
  { id: "x", label: "X", description: "장면 X축으로만 이동" },
  { id: "y", label: "Y", description: "장면 Y축으로만 이동" },
  { id: "z", label: "Z", description: "장면 Z축으로만 이동" },
]);

type PendingStudioVrmPersistentIkCommand = {
  before: FullVrmState;
  candidateAfter: FullVrmState;
  inputSignature: string;
  historyGeneration: number;
};

function extractStudioVrmFingerRotations(bones: PoseBoneMap): FingerRotationMap {
  const fingers: FingerRotationMap = {};
  for (const boneName of POSER_FINGER_BONES) {
    const rotation = bones[boneName]?.rotation;
    if (!rotation) continue;
    fingers[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  return fingers;
}

function mergeStudioVrmFingerRotationsIntoBones(
  bones: PoseBoneMap,
  fingerEdits: FingerRotationMap,
): PoseBoneMap {
  const merged: PoseBoneMap = { ...bones };
  for (const boneName of POSER_FINGER_BONES) {
    const rotation = fingerEdits[boneName];
    if (!rotation) continue;
    merged[boneName] = { rotation: [rotation[0], rotation[1], rotation[2]] };
  }
  return merged;
}

function applyStudioVrmRotationPose(
  targetVrm: VRM,
  pose: {
    bones: PoseBoneMap;
    yOffset: number;
    translations?: StudioVrmPoseTranslations;
  },
  bodyScale: BodyScale,
) {
  applyPoserVisualState(targetVrm, {
    bones: stripFingerBones(pose.bones),
    yOffset: pose.yOffset,
    poseTranslations: pose.translations ?? EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
    fingerEdits: extractStudioVrmFingerRotations(pose.bones),
    bodyScale,
  });
}

function createStudioVrmIkPole(
  targetVrm: VRM,
  effector: StudioVrmIkEffectorBone,
): THREE.Vector3 | undefined {
  try {
    const chain = STUDIO_VRM_USER_IK_CHAINS[effector];
    const upper = targetVrm.humanoid.getNormalizedBoneNode(chain.upper);
    const lower = targetVrm.humanoid.getNormalizedBoneNode(chain.lower);
    const end = targetVrm.humanoid.getNormalizedBoneNode(chain.end);
    if (!upper || !lower || !end) return undefined;
    targetVrm.scene.updateMatrixWorld(true);
    const startWorld = upper.getWorldPosition(new THREE.Vector3());
    const middleWorld = lower.getWorldPosition(new THREE.Vector3());
    const endWorld = end.getWorldPosition(new THREE.Vector3());
    const values = [startWorld, middleWorld, endWorld].flatMap((point) => [point.x, point.y, point.z]);
    if (!values.every(Number.isFinite)) return undefined;
    const pole = createTwoBoneDefaultPoleTarget(
      [startWorld.x, startWorld.y, startWorld.z],
      [middleWorld.x, middleWorld.y, middleWorld.z],
      [endWorld.x, endWorld.y, endWorld.z],
    );
    return new THREE.Vector3(pole[0], pole[1], pole[2]);
  } catch {
    return undefined;
  }
}

function categoryForStudioVrmJointHandle(bone: StudioVrmJointHandleBone): string | null {
  return BONE_CATEGORIES.find((category) => category.bones.includes(bone))?.id ?? null;
}

function resolveStudioVrmJointHandleBone(bone: VRMHumanBoneName): StudioVrmJointHandleBone | null {
  return STUDIO_VRM_JOINT_HANDLE_DEFINITIONS.find((definition) => definition.bone === bone)?.bone ?? null;
}

const PROP_CATEGORY_LABELS: Record<string, string> = { animal: "동물", item: "아이템", effect: "이펙트" };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function findPoseById(id: string): PosePreset | null {
  // 기본 프리셋 → 확장 팩 → 자연 아이들(스폰 기본) 순으로 탐색. 셋 다 같은 본 규약을 쓴다.
  return (
    POSE_PRESETS.find((pose) => pose.id === id) ??
    EXTRA_POSE_PRESETS.find((pose) => pose.id === id) ??
    NATURAL_IDLE_POSES.find((pose) => pose.id === id) ??
    null
  );
}

function findPose(id: string): PosePreset {
  return findPoseById(id) ?? POSE_PRESETS[0];
}

function findCameraPreset(id: string) {
  return CAMERA_PRESETS.find((preset) => preset.id === id) ?? CAMERA_PRESETS[0];
}

/* ── 의상(costume) 메시 수집·리컬러·토글 ─────────────────────────────── */

type CostumeMeshEntry = {
  /** 직렬화·식별 키(노드 이름 우선, 비면 머티리얼 이름). */
  key: string;
  /** 표시용 이름. */
  label: string;
  slot: CostumeSlot;
  mesh: THREE.Mesh;
};

// 원본 머티리얼 색(hex)을 메시별로 1회 캡처해 둔다(틴트는 항상 원본 기준 — 중첩 누적 방지).
// Mannequin clay / near-black×map 은 cacheable=false 로 거부해 옷이 검정으로 굳는 걸 막는다.
const costumeBaseColorCache = new WeakMap<THREE.Material, string>();
const isolatedCostumeMaterialMeshes = new WeakSet<THREE.Mesh>();

function materialBaseHex(mat: THREE.Material): string {
  const cached = costumeBaseColorCache.get(mat);
  if (cached) return cached;
  const colored = mat as THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null };
  const currentHex = colored.color ? `#${colored.color.getHexString()}` : "#cccccc";
  const resolved = resolveCostumeMaterialBaseHex(currentHex, {
    hasMap: Boolean(colored.map),
    cached: null,
  });
  if (resolved.cacheable) {
    costumeBaseColorCache.set(mat, resolved.hex);
  }
  return resolved.hex;
}

/**
 * Clone costume materials only when we are about to recolor — never on load.
 * Eager clone on collect caused a flash of native textures then broken/black clothes
 * (MToon outline / shared texture races on multi-material VRoid Body meshes).
 */
function isolateCostumeMaterialsForRecolor(mesh: THREE.Mesh): THREE.Material[] {
  let materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (isolatedCostumeMaterialMeshes.has(mesh)) {
    return materials.filter((material): material is THREE.Material => Boolean(material));
  }
  const mannequinPoisoned = materials.some((material) => {
    const candidate = material as THREE.Material & { userData?: Record<string, unknown> };
    return candidate?.userData?.__vrmMannequinActive === true;
  });
  if (mannequinPoisoned) {
    return materials.filter((material): material is THREE.Material => Boolean(material));
  }
  materials = materials.map((material) => material.clone());
  mesh.material = Array.isArray(mesh.material) ? materials : materials[0]!;
  isolatedCostumeMaterialMeshes.add(mesh);
  return materials;
}

/** 씬그래프를 순회해 의상 슬롯에 해당하는 메시를 수집한다(피부·얼굴·눈·머리 제외). */
function collectCostumeMeshes(vrm: VRM): CostumeMeshEntry[] {
  const entries: CostumeMeshEntry[] = [];
  const seenKeys = new Set<string>();
  vrm.scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const matNames = materials.map((m) => (m as THREE.Material | undefined)?.name).filter(Boolean) as string[];
    const materialClasses = matNames.map((name) => classifyMeshName(name));
    const explicitMaterialSlot = materialClasses.find((entry) => entry.slot !== null && entry.protected === null)?.slot ?? null;
    const hasProtectedMaterial = materialClasses.some((entry) => entry.protected !== null);
    // Exporters sometimes name every primitive simply "Body". An explicit clothing material is
    // stronger evidence than that generic node name, but a truly mixed skin+cloth material array
    // remains protected because mesh-level visibility would hide skin with the outfit.
    const cls = explicitMaterialSlot && !hasProtectedMaterial
      ? { slot: explicitMaterialSlot, protected: null }
      : classifyMeshName(mesh.name, ...matNames);
    if (cls.slot === null || cls.protected !== null) return;
    const baseKey = mesh.name || matNames[0] || `mesh-${entries.length}`;
    let key = baseKey;
    let duplicateIndex = 2;
    while (seenKeys.has(key)) {
      key = `${baseKey}#${duplicateIndex}`;
      duplicateIndex += 1;
    }
    seenKeys.add(key);
    // Do NOT clone materials here — load must keep native albedo/maps intact.
    entries.push({ key, label: mesh.name || matNames[0] || "메시", slot: cls.slot, mesh });
  });
  return entries;
}

/** 수집된 의상 메시에 표시/숨김·리컬러 상태를 적용한다. */
function applyCostumeState(entries: CostumeMeshEntry[], state: CostumeState) {
  for (const entry of entries) {
    entry.mesh.visible = !state.hidden.includes(entry.key);
    const target = state.recolor[entry.key];
    // Visibility-only updates must not touch materials (avoids load-time black clothes).
    if (!target && !isolatedCostumeMaterialMeshes.has(entry.mesh)) {
      // Still clear recolor flag on native materials if present (no isolation yet).
      const nativeMaterials = Array.isArray(entry.mesh.material)
        ? entry.mesh.material
        : [entry.mesh.material];
      for (const m of nativeMaterials) {
        const mat = m as (THREE.Material & { userData?: Record<string, unknown> }) | undefined;
        if (mat?.userData?.__vrmCostumeRecolorApplied === true) {
          mat.userData.__vrmCostumeRecolorApplied = false;
        }
      }
      continue;
    }

    const materials = target
      ? isolateCostumeMaterialsForRecolor(entry.mesh)
      : (Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material]);

    materials.forEach((m) => {
      const mat = m as (THREE.Material & {
        color?: THREE.Color;
        userData: Record<string, unknown>;
      }) | undefined;
      if (!mat || !mat.color) return;
      // Mannequin paint owns the lit factor while active — never fight it with costume base.
      if (mat.userData.__vrmMannequinActive === true) return;

      if (target) {
        const base = materialBaseHex(mat);
        mat.color.set(tintColor(base, target));
        mat.userData.__vrmCostumeRecolorApplied = true;
        mat.needsUpdate = true;
        return;
      }

      // Only restore when we previously applied a costume recolor. Always writing `base`
      // re-applied near-black/mannequin caches and turned textured clothes pure black.
      if (mat.userData.__vrmCostumeRecolorApplied === true) {
        const base = materialBaseHex(mat);
        mat.color.set(base);
        mat.userData.__vrmCostumeRecolorApplied = false;
        mat.needsUpdate = true;
      }
    });
  }
}

function getExpressionTone(name: string, vrm: VRM) {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return "표정";
  if (expressionManager.mouthExpressionNames.includes(name)) return "입모양";
  if (expressionManager.blinkExpressionNames.includes(name)) return "눈";
  if (name.startsWith("look")) return "시선";
  return EXPRESSION_LABELS[name] ? "기본" : "커스텀";
}

function formatExpressionLabel(name: string) {
  return EXPRESSION_LABELS[name] ?? name.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getAvailableExpressionActions(vrm: VRM | null) {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) return [];

  const expressionNames = expressionManager.expressions
    .map((expression) => expression.expressionName)
    .filter((name) => name !== "neutral")
    .sort((a, b) => {
      const aIndex = EXPRESSION_ORDER.indexOf(a);
      const bIndex = EXPRESSION_ORDER.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
      return a.localeCompare(b);
    });

  return [
    NEUTRAL_EXPRESSION_ACTION,
    ...expressionNames.map<ExpressionAction>((name) => ({
      id: name,
      label: formatExpressionLabel(name),
      name,
      tone: getExpressionTone(name, vrm),
    })),
  ];
}

// three-vrm의 VRMExpressionManager.customExpressionMap은 VRM1 expressions.custom과,
function getExpressionCategory(action: ExpressionAction): "emotion" | "eye" | "mouth" | "custom" {
  const name = action.name;
  if (!name) return "emotion";
  const tone = action.tone;
  if (tone === "눈" || tone === "시선" || name.startsWith("blink") || name.startsWith("look")) {
    return "eye";
  }
  if (tone === "입모양" || ["aa", "ih", "ou", "ee", "oh"].includes(name)) {
    return "mouth";
  }
  if (["happy", "sad", "relaxed", "angry", "surprised"].includes(name) || tone === "기본") {
    return "emotion";
  }
  return "custom";
}

function roundExportSize(canvas: HTMLCanvasElement) {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { width: FALLBACK_EXPORT_WIDTH, height: EXPORT_HEIGHT };
  }

  const aspect = canvas.width / canvas.height;
  return { width: Math.round(EXPORT_HEIGHT * aspect), height: EXPORT_HEIGHT };
}

function roundThumbnailCaptureSize(canvas: HTMLCanvasElement) {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { width: Math.round(THUMBNAIL_HEIGHT * FALLBACK_EXPORT_WIDTH / EXPORT_HEIGHT), height: THUMBNAIL_HEIGHT };
  }
  const scale = Math.min(THUMBNAIL_WIDTH / canvas.width, THUMBNAIL_HEIGHT / canvas.height);
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}

function createCharacterThumbnail(
  rgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = THUMBNAIL_WIDTH;
  thumbnailCanvas.height = THUMBNAIL_HEIGHT;

  const sourceContext = sourceCanvas.getContext("2d");
  const context = thumbnailCanvas.getContext("2d");
  if (
    !sourceContext || !context ||
    sourceWidth <= 0 || sourceHeight <= 0 ||
    rgba.byteLength !== sourceWidth * sourceHeight * 4
  ) {
    sourceCanvas.width = 1;
    sourceCanvas.height = 1;
    thumbnailCanvas.width = 1;
    thumbnailCanvas.height = 1;
    return null;
  }

  const imageData = sourceContext.createImageData(sourceWidth, sourceHeight);
  imageData.data.set(rgba);
  sourceContext.putImageData(imageData, 0, 0);
  const scale = Math.min(THUMBNAIL_WIDTH / sourceWidth, THUMBNAIL_HEIGHT / sourceHeight);
  const drawWidth = Math.round(sourceWidth * scale);
  const drawHeight = Math.round(sourceHeight * scale);
  const drawX = Math.round((THUMBNAIL_WIDTH - drawWidth) / 2);
  const drawY = Math.round((THUMBNAIL_HEIGHT - drawHeight) / 2);

  context.clearRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  context.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
  const dataUrl = thumbnailCanvas.toDataURL("image/png");
  sourceCanvas.width = 1;
  sourceCanvas.height = 1;
  thumbnailCanvas.width = 1;
  thumbnailCanvas.height = 1;
  return dataUrl;
}

function getErrorMessage(caughtError: unknown, fallback: string) {
  return caughtError instanceof Error ? caughtError.message : fallback;
}

function getVrmLoadErrorMessage(caughtError: unknown) {
  const message = getErrorMessage(caughtError, "VRM을 불러오지 못했습니다.");
  return /Unexpected token '<'|<!doctype/i.test(message) ? HTML_FALLBACK_VRM_ERROR : message;
}

function applyCameraPreset(camera: THREE.Camera, preset: CameraPreset, invalidate: () => void) {
  camera.position.set(preset.position[0], preset.position[1], preset.position[2]);
  camera.lookAt(preset.target[0], preset.target[1], preset.target[2]);

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = preset.fov;
    camera.updateProjectionMatrix();
  }

  camera.updateMatrixWorld();
  invalidate();
}

function restorePerspectiveCamera(
  camera: THREE.Camera,
  controls: OrbitLike,
  settings: StudioVrmCameraSettings,
  invalidate: () => void
): void {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  camera.position.set(...settings.position);
  camera.up.set(...settings.up).normalize();
  camera.fov = settings.fovDegrees;
  camera.near = settings.near;
  camera.far = settings.far;
  camera.lookAt(...settings.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  controls?.target?.set(...settings.target);
  controls?.update?.();
  invalidate();
}

function CaptureBridge({
  onCaptureUpdate,
}: {
  onCaptureUpdate: (state: CaptureState, cleanupGl?: THREE.WebGLRenderer | null) => void;
}) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    onCaptureUpdate({ camera, gl, scene });
    return () => {
      onCaptureUpdate({ camera: null, gl: null, scene: null }, gl);
    };
  }, [camera, gl, scene, onCaptureUpdate]);

  return null;
}

type OrbitLike = {
  target?: THREE.Vector3;
  minDistance?: number;
  maxDistance?: number;
  update?: () => void;
} | null;

type ViewportApi = {
  zoomBy: (factor: number) => void;
  readCamera: () => StudioVrmCameraSettings | null;
  restoreCamera: (settings: StudioVrmCameraSettings) => void;
};

// Canvas 내부에서 OrbitControls/카메라를 잡아 줌 등 명령형 동작을 패널 오버레이로 노출.
function ViewportController({ onReady }: { onReady: (api: ViewportApi | null) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitLike;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    onReady({
      zoomBy: (factor: number) => {
        const target = controls?.target ?? new THREE.Vector3(0, 1, 0);
        const offset = camera.position.clone().sub(target);
        const min = controls?.minDistance ?? 1.3;
        const max = controls?.maxDistance ?? 5.2;
        const dist = THREE.MathUtils.clamp(offset.length() * factor, min, max);
        offset.setLength(dist);
        camera.position.copy(target).add(offset);
        camera.updateMatrixWorld();
        controls?.update?.();
        invalidate();
      },
      readCamera: () => {
        if (!(camera instanceof THREE.PerspectiveCamera)) return null;
        const target = controls?.target?.clone()
          ?? camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()));
        return {
          projection: "perspective",
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [target.x, target.y, target.z],
          up: [camera.up.x, camera.up.y, camera.up.z],
          fovDegrees: camera.fov,
          near: camera.near,
          far: camera.far,
        };
      },
      restoreCamera: (settings: StudioVrmCameraSettings) => {
        restorePerspectiveCamera(camera, controls, settings, invalidate);
      },
    });
    return () => {
      onReady(null);
    };
  }, [camera, controls, invalidate, onReady]);

  return null;
}

function CameraDirector({ presetId, resetNonce }: { presetId: string; resetNonce: number }) {
  const { camera, invalidate } = useThree();
  const controls = useThree((s) => s.controls) as OrbitLike;
  const preset = findCameraPreset(presetId);

  useEffect(() => {
    if (presetId === "custom") return;
    applyCameraPreset(camera, preset, invalidate);
    // 사용자가 궤도를 돌린 뒤에도 시점 초기화가 프리셋 타깃으로 정확히 복귀하도록 동기화.
    if (controls?.target) {
      controls.target.set(preset.target[0], preset.target[1], preset.target[2]);
      controls.update?.();
    }
  }, [camera, invalidate, preset, presetId, controls, resetNonce]);

  return null;
}

const pendingPropDisposals = new WeakMap<THREE.Object3D, object>();

function disposePropObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    meshMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** StrictMode의 setup→cleanup→setup 재생에서는 두 번째 setup이 같은 object의 폐기를 취소한다. */
function cancelScheduledPropDisposal(object: THREE.Object3D) {
  pendingPropDisposals.delete(object);
}

function schedulePropDisposal(object: THREE.Object3D) {
  const token = {};
  pendingPropDisposals.set(object, token);
  queueMicrotask(() => {
    if (pendingPropDisposals.get(object) !== token) return;
    pendingPropDisposals.delete(object);
    disposePropObject(object);
  });
}

const VRM_FRAME_BASE_PRIORITY = -3;
const VRM_FRAME_PROP_PRIORITY = -2;
const VRM_FRAME_COMMIT_PRIORITY = -1;
const STUDIO_VRM_PROP_GEOMETRY_QUALITY = Object.freeze({
  roundedBox: (width: number, height: number, depth: number, radius: number) => (
    new RoundedBoxGeometry(width, height, depth, 3, radius)
  ),
});

/**
 * V1은 기존 본 포털 좌표를 그대로 보존한다. V2는 본의 world 위치·회전만 추종하는 rigid follower로
 * 렌더해 body/head 비균일 스케일의 shear를 피하고, 실제 geometry anchor를 측정된 소켓에 맞춘다.
 */
function VrmPropAttachment({
  vrm,
  instance,
  metrics,
}: {
  vrm: VRM;
  instance: PropInstance;
  metrics: VrmPropRigMetrics;
}) {
  const [boneNode, setBoneNode] = useState<THREE.Object3D | null>(null);
  const smartGroupRef = useRef<THREE.Group | null>(null);
  const localPositionRef = useRef(new THREE.Vector3());
  const boneWorldQuaternionRef = useRef(new THREE.Quaternion());
  const localQuaternionRef = useRef(new THREE.Quaternion());
  const anchorWorldOffsetRef = useRef(new THREE.Vector3());
  const secondaryWorldTargetRef = useRef(new THREE.Vector3());
  const secondaryTargetQuaternionRef = useRef(new THREE.Quaternion());
  const groupWorldPositionRef = useRef(new THREE.Vector3());
  const groupWorldQuaternionRef = useRef(new THREE.Quaternion());
  const groupWorldScaleRef = useRef(new THREE.Vector3());
  const handWorldScaleRef = useRef(new THREE.Vector3());
  const [secondaryGripState] = useState(createVrmTwoBoneGripState);

  useEffect(() => {
    const node = vrm.humanoid?.getNormalizedBoneNode(instance.bone) ?? null;
    setBoneNode(node);
  }, [vrm, instance.bone]);

  const object = useMemo(() => {
    const def = propDefById(instance.propId);
    if (!def) return null;
    return buildPropObject(
      THREE as unknown as Parameters<typeof buildPropObject>[0],
      def,
      instance.color,
      STUDIO_VRM_PROP_GEOMETRY_QUALITY,
    ) as unknown as THREE.Object3D;
  }, [instance.color, instance.propId]);
  const definition = propDefById(instance.propId);
  const resolved = definition ? resolvePropAttachment(definition, instance, metrics) : null;
  const secondary = definition ? resolveSecondaryPropTarget(definition, instance) : null;
  const secondaryActive = Boolean(secondary && secondary.influence > 0);
  const secondaryBone = secondary?.bone ?? null;

  useEffect(() => {
    if (!secondaryActive) {
      releaseVrmTwoBoneGripState(secondaryGripState);
      return;
    }
    return () => {
      releaseVrmTwoBoneGripState(secondaryGripState);
      vrm.scene.updateMatrixWorld(true);
    };
  }, [secondaryActive, secondaryBone, secondaryGripState, vrm]);

  useEffect(() => {
    if (!object) return;
    if (instance.rig) {
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
      object.scale.setScalar(1);
    } else {
      object.position.set(instance.position[0], instance.position[1], instance.position[2]);
      object.rotation.set(
        THREE.MathUtils.degToRad(instance.rotationDeg[0]),
        THREE.MathUtils.degToRad(instance.rotationDeg[1]),
        THREE.MathUtils.degToRad(instance.rotationDeg[2])
      );
      object.scale.setScalar(instance.scale);
    }
  }, [object, instance.position, instance.rig, instance.rotationDeg, instance.scale]);

  useEffect(() => {
    if (!object) return;
    cancelScheduledPropDisposal(object);
    return () => schedulePropDisposal(object);
  }, [object]);

  useFrame(() => {
    const group = smartGroupRef.current;
    if (!group || !boneNode || !resolved?.usesSmartRig) return;

    boneNode.updateWorldMatrix(true, false);
    // socket만 bone matrix로 world 변환하고, geometry anchor 보정은 scale이 제거된 rigid world
    // quaternion으로 계산한다. 부모의 비균일 body/head scale이 소품을 찌그러뜨리거나 접점을
    // 밀어내지 않으면서도 손바닥 위치 자체는 체형 변화를 정확히 따라간다.
    const socketWorldPosition = localPositionRef.current.set(...resolved.socketPosition);
    boneNode.localToWorld(socketWorldPosition);
    const boneWorldQuaternion = boneNode.getWorldQuaternion(boneWorldQuaternionRef.current);
    const localQuaternion = localQuaternionRef.current.setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(resolved.rotationDeg[0]),
      THREE.MathUtils.degToRad(resolved.rotationDeg[1]),
      THREE.MathUtils.degToRad(resolved.rotationDeg[2]),
      "XYZ"
    ));
    group.quaternion.copy(boneWorldQuaternion).multiply(localQuaternion).normalize();
    group.scale.setScalar(resolved.scale);
    const anchorWorldOffset = anchorWorldOffsetRef.current
      .set(...resolved.anchor.position)
      .multiplyScalar(resolved.scale)
      .applyQuaternion(group.quaternion);
    group.position.copy(socketWorldPosition).sub(anchorWorldOffset);
    group.updateMatrixWorld(true);

    if (secondary && secondary.influence > 0) {
      const secondaryHandNode = vrm.humanoid?.getNormalizedBoneNode(secondary.bone) ?? null;
      if (!secondaryHandNode) {
        releaseVrmTwoBoneGripState(secondaryGripState);
        return;
      }
      secondaryHandNode.updateWorldMatrix(true, false);
      const groupWorldPosition = group.getWorldPosition(groupWorldPositionRef.current);
      const groupWorldQuaternion = group.getWorldQuaternion(groupWorldQuaternionRef.current);
      const groupWorldScale = group.getWorldScale(groupWorldScaleRef.current);
      const handWorldScale = secondaryHandNode.getWorldScale(handWorldScaleRef.current);
      const constraint = resolveSecondaryHandConstraint(
        secondary.anchor,
        [groupWorldPosition.x, groupWorldPosition.y, groupWorldPosition.z],
        [groupWorldQuaternion.x, groupWorldQuaternion.y, groupWorldQuaternion.z, groupWorldQuaternion.w],
        groupWorldScale.x,
        metrics.handSockets[secondary.bone],
        [handWorldScale.x, handWorldScale.y, handWorldScale.z]
      );
      if (!constraint) {
        releaseVrmTwoBoneGripState(secondaryGripState);
        return;
      }
      const target = secondaryWorldTargetRef.current.set(...constraint.wristWorldPosition);
      const targetQuaternion = secondaryTargetQuaternionRef.current.set(...constraint.targetHandWorldQuaternion);
      applyVrmTwoBoneGrip(
        vrm,
        secondary.bone === "leftHand" ? "left" : "right",
        target,
        secondary.influence,
        secondary.elbowHint,
        { targetQuaternion, state: secondaryGripState }
      );
    }
  }, VRM_FRAME_PROP_PRIORITY);

  if (!boneNode || !object) return null;
  if (resolved?.usesSmartRig) {
    return (
      <group ref={smartGroupRef}>
        <primitive object={object} />
      </group>
    );
  }
  return createPortal(<primitive object={object} />, boneNode);
}

/* ── 실장착 워드로브(studio-vrm-wardrobe) — 측정·조립·본 부착 ────────── */

/**
 * 실제 스킨을 움직이는 raw 휴머노이드에서 본 로컬 치수를 잰다.
 * Avatar Forge가 raw 체형을 바꾼 뒤에도 같은 좌표계를 사용하므로 의상과 몸이 갈라지지 않는다.
 */
function measureVrmWardrobeMetrics(vrm: VRM): WardrobeMetrics {
  const humanoid = vrm.humanoid;
  const fallback = sanitizeWardrobeMetrics(null);
  if (!humanoid) return fallback;
  vrm.scene.updateMatrixWorld(true);

  const node = (name: VRMHumanBoneName) => humanoid.getRawBoneNode(name);
  const world = (name: VRMHumanBoneName): THREE.Vector3 | null => {
    const n = node(name);
    return n ? n.getWorldPosition(new THREE.Vector3()) : null;
  };
  // 부착 본의 로컬 공간에서 목표 관절까지의 벡터. raw 본 스케일을 다시 곱하지 않도록
  // world 길이가 아니라 이 로컬 길이로 geometry를 만든다.
  const localVector = (from: VRMHumanBoneName, toWorld: THREE.Vector3): THREE.Vector3 | null => {
    const n = node(from);
    if (!n) return null;
    const vector = n.worldToLocal(toWorld.clone());
    return Number.isFinite(vector.x) && vector.lengthSq() > 1e-8 ? vector : null;
  };
  const toVec3 = (v: THREE.Vector3 | null): [number, number, number] | null => (v ? [v.x, v.y, v.z] : null);
  const localDistanceBetween = (
    anchor: VRMHumanBoneName,
    a: THREE.Vector3 | null,
    b: THREE.Vector3 | null,
  ): number | undefined => {
    const anchorNode = node(anchor);
    if (!anchorNode || !a || !b) return undefined;
    return anchorNode.worldToLocal(a.clone()).distanceTo(anchorNode.worldToLocal(b.clone()));
  };

  const hips = world("hips");
  const spine = world("spine");
  const neckW = world("neck") ?? world("head");
  const limb = (from: VRMHumanBoneName, to: VRMHumanBoneName, fb: LimbMetric): LimbMetric => {
    const b = world(to);
    const vector = b ? localVector(from, b) : null;
    if (!vector) return fb;
    const len = vector.length();
    const axis = vector.normalize();
    return { len, axis: toVec3(axis) ?? fb.axis };
  };

  const lUpArm = world("leftUpperArm");
  const rUpArm = world("rightUpperArm");
  const lUpLeg = world("leftUpperLeg");
  const rUpLeg = world("rightUpperLeg");
  const lFoot = world("leftFoot");
  const rFoot = world("rightFoot");
  const rigSource: WardrobeMetrics["source"] = ([
    "hips", "spine", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm",
    "leftHand", "rightHand", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg",
    "leftFoot", "rightFoot",
  ] as const).every((boneName) => node(boneName)) && neckW
    ? "raw-rig"
    : "partial-rig";

  // 몸통 위 방향(spine 로컬) + 발 앞 방향(해부학: 왼쪽×위 = 앞).
  const upVector = spine && neckW ? localVector("spine", neckW) : null;
  const upLocal = upVector?.normalize() ?? null;
  let footForward = fallback.footForward;
  if (lUpLeg && rUpLeg && hips && neckW && lFoot && rFoot) {
    const leftWorld = lUpLeg.clone().sub(rUpLeg).normalize();
    const upWorld = neckW.clone().sub(hips).normalize();
    const fwdWorld = leftWorld.clone().cross(upWorld).normalize();
    const footLocalDir = (name: VRMHumanBoneName, at: THREE.Vector3): [number, number, number] | null => {
      const n = node(name);
      if (!n) return null;
      const origin = n.worldToLocal(at.clone());
      const tip = n.worldToLocal(at.clone().add(fwdWorld));
      const dir = tip.sub(origin).normalize();
      return Number.isFinite(dir.x) && dir.lengthSq() > 1e-8 ? [dir.x, dir.y, dir.z] : null;
    };
    footForward = {
      left: footLocalDir("leftFoot", lFoot) ?? fallback.footForward.left,
      right: footLocalDir("rightFoot", rFoot) ?? fallback.footForward.right,
    };
  }

  return sanitizeWardrobeMetrics({
    source: rigSource,
    shoulderW: localDistanceBetween("spine", lUpArm, rUpArm),
    hipW: localDistanceBetween("hips", lUpLeg, rUpLeg),
    hipsToSpine: spine ? localVector("hips", spine)?.length() : undefined,
    spineToNeck: neckW ? localVector("spine", neckW)?.length() : undefined,
    // Ground height is not represented by a humanoid bone. A lower-leg-relative value remains
    // stable under overall character scale and avoids measuring posed world Y as local geometry.
    ankleH: Math.max(
      0.02,
      (limb("leftLowerLeg", "leftFoot", fallback.lowerLeg.left).len
        + limb("rightLowerLeg", "rightFoot", fallback.lowerLeg.right).len) * 0.1,
    ),
    up: upLocal ? (toVec3(upLocal) ?? undefined) : undefined,
    footForward,
    upperArm: {
      left: limb("leftUpperArm", "leftLowerArm", fallback.upperArm.left),
      right: limb("rightUpperArm", "rightLowerArm", fallback.upperArm.right),
    },
    lowerArm: {
      left: limb("leftLowerArm", "leftHand", fallback.lowerArm.left),
      right: limb("rightLowerArm", "rightHand", fallback.lowerArm.right),
    },
    upperLeg: {
      left: limb("leftUpperLeg", "leftLowerLeg", fallback.upperLeg.left),
      right: limb("rightUpperLeg", "rightLowerLeg", fallback.upperLeg.right),
    },
    lowerLeg: {
      left: limb("leftLowerLeg", "leftFoot", fallback.lowerLeg.left),
      right: limb("rightLowerLeg", "rightFoot", fallback.lowerLeg.right),
    },
  });
}

const GARMENT_Y = new THREE.Vector3(0, 1, 0);
const GARMENT_Z = new THREE.Vector3(0, 0, 1);

function createGarmentWeaveTexture(fabricId: WardrobeEquip["fabricId"]): THREE.DataTexture | null {
  const fabric = wardrobeFabricById(fabricId);
  if (!fabric || fabric.weaveStrength <= 0) return null;
  const size = 48;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const warp = Math.sin(u * Math.PI * 2 * fabric.weaveFrequency);
      const weft = Math.sin(v * Math.PI * 2 * fabric.weaveFrequency * 0.92);
      const diagonal = fabricId === "denim"
        ? Math.sin((u + v) * Math.PI * fabric.weaveFrequency * 1.35) * 0.55
        : 0;
      const knit = fabricId === "knit"
        ? Math.cos((u - v) * Math.PI * fabric.weaveFrequency) * 0.38
        : 0;
      data[y * size + x] = Math.round(THREE.MathUtils.clamp(
        128 + warp * 34 + weft * 26 + diagonal * 28 + knit * 28,
        0,
        255,
      ));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = `wardrobe-weave:${fabricId}`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createGarmentMaterial(
  part: GarmentPart,
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  weaveTexture: THREE.DataTexture | null,
): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide });
  applyGarmentMaterialStyle(material, part, itemColor, fabricId, weaveTexture);
  return material;
}

function applyGarmentMaterialStyle(
  material: THREE.MeshPhysicalMaterial,
  part: GarmentPart,
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  weaveTexture: THREE.DataTexture | null,
) {
  const fabric = wardrobeFabricById(fabricId) ?? WARDROBE_FABRICS[0];
  const color = new THREE.Color(part.color ?? itemColor);
  const roughness = part.metalness !== undefined && part.metalness > 0.35
    ? part.roughness ?? fabric.roughness
    : fabric.roughness;
  const metalness = part.metalness ?? fabric.metalness;
  const fabricSurface = metalness < 0.35;
  material.color.copy(color);
  material.roughness = roughness;
  material.metalness = metalness;
  material.sheen = fabricSurface ? fabric.sheen : 0;
  material.sheenRoughness = fabricSurface ? fabric.sheenRoughness : 1;
  material.sheenColor.copy(color).lerp(new THREE.Color("#ffffff"), 0.12);
  material.clearcoat = fabric.clearcoat;
  material.clearcoatRoughness = fabric.clearcoatRoughness;
  material.bumpMap = fabricSurface ? weaveTexture : null;
  material.bumpScale = fabricSurface ? fabric.weaveStrength : 0;
  material.userData.studioVrmGarmentPart = part;
  material.userData.studioVrmGarmentFabricId = fabricId;
  material.needsUpdate = true;
}

function disposeGarmentMaterials(materials: readonly THREE.Material[]) {
  const textures = new Set<THREE.Texture>();
  for (const material of materials) {
    const physical = material as THREE.MeshPhysicalMaterial;
    if (physical.bumpMap) textures.add(physical.bumpMap);
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}

/** 파츠 스펙 목록을 본별 three 그룹으로 조립한다. */
function assembleGarmentGroups(
  parts: GarmentPart[],
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  name: string,
): Map<WardrobeBone, THREE.Group> {
  const groups = new Map<WardrobeBone, THREE.Group>();
  const weaveTexture = createGarmentWeaveTexture(fabricId);
  for (const part of parts) {
    let group = groups.get(part.bone);
    if (!group) {
      group = new THREE.Group();
      group.name = `${name}:${part.bone}`;
      groups.set(part.bone, group);
    }
    const material = createGarmentMaterial(part, itemColor, fabricId, weaveTexture);
    const geometry = buildStudioVrmGarmentGeometry(part.shape);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(part.offset[0], part.offset[1], part.offset[2]);
    if (part.align) {
      // 실린더/박스/구는 +Y, 토러스는 링 축(+Z)을 목표 방향으로 정렬.
      const source = part.shape.kind === "torus" ? GARMENT_Z : GARMENT_Y;
      const target = new THREE.Vector3(part.align[0], part.align[1], part.align[2]).normalize();
      if (target.lengthSq() > 1e-8) mesh.quaternion.setFromUnitVectors(source, target);
    }
    if (part.squash) mesh.scale.set(part.squash[0], part.squash[1], part.squash[2]);
    group.add(mesh);
  }
  return groups;
}

function collectVrmSourceSkeletonBones(vrm: VRM): Set<THREE.Bone> {
  const bones = new Set<THREE.Bone>();
  vrm.scene.traverse((object) => {
    const skinned = object as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) return;
    skinned.skeleton.bones.forEach((bone) => bones.add(bone));
  });
  return bones;
}

function assembleSkinnedGarment(
  vrm: VRM,
  parts: readonly GarmentPart[],
  itemColor: string,
  fabricId: WardrobeEquip["fabricId"],
  name: string,
) {
  const weaveTexture = createGarmentWeaveTexture(fabricId);
  const materials = parts.map((part) => createGarmentMaterial(part, itemColor, fabricId, weaveTexture));
  const sourceBones = collectVrmSourceSkeletonBones(vrm);
  const built = buildStudioVrmSkinnedGarment({
    name,
    root: vrm.scene,
    parts,
    materials,
    resolveBone: (boneName: StudioVrmGarmentSkinBone) => {
      const node = vrm.humanoid?.getRawBoneNode(boneName as VRMHumanBoneName) ?? null;
      return node && sourceBones.has(node as THREE.Bone) ? node : null;
    },
  });
  if (!built.surface) disposeGarmentMaterials(materials);
  return built;
}

function disposeGarmentObject(group: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      (mesh as THREE.SkinnedMesh).skeleton.dispose();
    }
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((m) => {
      const physical = m as THREE.MeshPhysicalMaterial | undefined;
      if (physical?.bumpMap) textures.add(physical.bumpMap);
      m?.dispose();
    });
  });
  textures.forEach((texture) => texture.dispose());
}

const pendingGarmentDisposals = new WeakMap<THREE.Object3D, object>();

function cancelScheduledGarmentDisposal(group: THREE.Object3D) {
  pendingGarmentDisposals.delete(group);
}

function scheduleGarmentDisposal(group: THREE.Object3D) {
  const token = {};
  pendingGarmentDisposals.set(group, token);
  queueMicrotask(() => {
    if (pendingGarmentDisposals.get(group) !== token) return;
    pendingGarmentDisposals.delete(group);
    disposeGarmentObject(group);
  });
}

/** 워드로브 한 슬롯 장착분을 humanoid 본들에 포털로 부착한다(파츠가 본을 따라 포즈 추종). */
function VrmWardrobeAttachment({
  vrm,
  slot,
  equip,
  metrics,
  effectiveFit,
  onSurfaceReceipt,
}: {
  vrm: VRM;
  slot: WardrobeSlot;
  equip: WardrobeEquip;
  metrics: WardrobeMetrics;
  effectiveFit: number;
  onSurfaceReceipt: (slot: WardrobeSlot, receipt: StudioVrmSkinnedGarmentReceipt | null) => void;
}) {
  const renderable = useMemo(() => {
    const def = wardrobeItemById(equip.itemId);
    if (!def) return { entries: [], receipt: null };
    const parts = buildGarmentParts(equip.itemId, metrics, effectiveFit);
    const name = `wardrobe:${def.slot}:${def.id}`;
    if (def.geometrySource === "skinned-procedural-v1") {
      const built = assembleSkinnedGarment(
        vrm,
        parts,
        def.defaultColor,
        def.defaultFabricId,
        name,
      );
      if (built.surface) {
        return {
          entries: [{
            key: `${equip.itemId}:skinned`,
            node: vrm.scene as THREE.Object3D,
            object: built.surface.mesh as THREE.Object3D,
          }],
          receipt: built.receipt,
        };
      }
      const groups = assembleGarmentGroups(
        parts,
        def.defaultColor,
        def.defaultFabricId,
        name,
      );
      const entries: { key: string; node: THREE.Object3D; object: THREE.Object3D }[] = [];
      for (const [bone, object] of groups) {
        const boneNode = vrm.humanoid?.getRawBoneNode(bone as VRMHumanBoneName) ?? null;
        if (boneNode) entries.push({ key: `${equip.itemId}:${bone}`, node: boneNode, object });
      }
      return { entries, receipt: built.receipt };
    }

    const groups = assembleGarmentGroups(
      parts,
      def.defaultColor,
      def.defaultFabricId,
      `wardrobe:${def.slot}:${def.id}`,
    );
    const entries: { key: string; node: THREE.Object3D; object: THREE.Object3D }[] = [];
    for (const [bone, object] of groups) {
      const boneNode = vrm.humanoid?.getRawBoneNode(bone as VRMHumanBoneName) ?? null;
      if (boneNode) entries.push({ key: `${equip.itemId}:${bone}`, node: boneNode, object });
    }
    return { entries, receipt: null };
  }, [vrm, equip.itemId, effectiveFit, metrics]);

  const entries = renderable.entries;

  // 색상·원단만 바뀔 때 geometry/Skeleton을 다시 만들면 현재 포즈가 새 bind pose가 된다.
  // 재질만 제자리에서 갱신해 포즈·핏·스키닝 표면을 그대로 유지한다.
  useLayoutEffect(() => {
    const materials = new Set<THREE.MeshPhysicalMaterial>();
    for (const entry of entries) {
      entry.object.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of meshMaterials) {
          if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
            materials.add(material as THREE.MeshPhysicalMaterial);
          }
        }
      });
    }
    if (materials.size === 0) return;

    const fabricChanged = [...materials].some(
      (material) => material.userData.studioVrmGarmentFabricId !== equip.fabricId,
    );
    const replacementWeave = fabricChanged ? createGarmentWeaveTexture(equip.fabricId) : null;
    const retiredTextures = new Set<THREE.Texture>();
    let replacementUsed = false;

    for (const material of materials) {
      const part = material.userData.studioVrmGarmentPart as GarmentPart | undefined;
      if (!part) continue;
      const previousBump = material.bumpMap;
      const nextWeave = fabricChanged ? replacementWeave : previousBump as THREE.DataTexture | null;
      applyGarmentMaterialStyle(material, part, equip.color, equip.fabricId, nextWeave);
      if (replacementWeave && material.bumpMap === replacementWeave) replacementUsed = true;
      if (previousBump && previousBump !== material.bumpMap) retiredTextures.add(previousBump);
    }

    retiredTextures.forEach((texture) => texture.dispose());
    if (replacementWeave && !replacementUsed) replacementWeave.dispose();
  }, [entries, equip.color, equip.fabricId]);

  // GPU 버퍼 정리 — StrictMode의 setup→cleanup→setup에서는 같은 object 폐기를 취소하고,
  // 실제 아이템/색/핏 교체나 언마운트에서만 다음 microtask에 해제한다.
  useEffect(() => {
    entries.forEach((entry) => cancelScheduledGarmentDisposal(entry.object));
    return () => entries.forEach((entry) => scheduleGarmentDisposal(entry.object));
  }, [entries]);

  useEffect(() => {
    onSurfaceReceipt(slot, renderable.receipt);
  }, [onSurfaceReceipt, renderable.receipt, slot]);

  return (
    <>
      {entries.map((entry) => (
        <group key={entry.key}>{createPortal(<primitive object={entry.object} />, entry.node)}</group>
      ))}
    </>
  );
}

function applyRotationToVrm(vrm: VRM, bodyRotation: number) {
  const baseRotationY = typeof vrm.scene.userData[BASE_ROTATION_Y_KEY] === "number" ? vrm.scene.userData[BASE_ROTATION_Y_KEY] : 0;
  vrm.scene.rotation.y = baseRotationY + bodyRotation;
  vrm.scene.updateMatrixWorld(true);
}

type MannequinMaterial = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  map?: THREE.Texture | null;
  metalness?: number;
  roughness?: number;
};

type MannequinMaterialSnapshot = {
  material: MannequinMaterial;
  color: THREE.Color | null;
  emissive: THREE.Color | null;
  emissiveIntensity: number | undefined;
  map: THREE.Texture | null | undefined;
  metalness: number | undefined;
  roughness: number | undefined;
};

function StudioVrmMannequinMaterial({
  vrm,
  enabled,
  customColors,
  materialFx,
}: {
  vrm: VRM;
  enabled: boolean;
  customColors: Record<string, string>;
  materialFx: VrmMaterialFx;
}) {
  const snapshotsRef = useRef<MannequinMaterialSnapshot[]>([]);

  const enforce = () => {
    for (const { material } of snapshotsRef.current) {
      material.userData.__vrmMannequinActive = true;
      material.color?.set("#b7b2a8");
      material.emissive?.set("#000000");
      if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0;
      if (material.map !== undefined) material.map = null;
      if (material.metalness !== undefined) material.metalness = 0;
      if (material.roughness !== undefined) material.roughness = 0.82;
    }
  };

  useEffect(() => {
    const restore = () => {
      for (const snapshot of snapshotsRef.current) {
        snapshot.material.userData.__vrmMannequinActive = false;
        if (snapshot.color && snapshot.material.color) snapshot.material.color.copy(snapshot.color);
        if (snapshot.emissive && snapshot.material.emissive) snapshot.material.emissive.copy(snapshot.emissive);
        if (snapshot.emissiveIntensity !== undefined) snapshot.material.emissiveIntensity = snapshot.emissiveIntensity;
        if (snapshot.map !== undefined) snapshot.material.map = snapshot.map;
        if (snapshot.metalness !== undefined) snapshot.material.metalness = snapshot.metalness;
        if (snapshot.roughness !== undefined) snapshot.material.roughness = snapshot.roughness;
        snapshot.material.needsUpdate = true;
      }
      snapshotsRef.current = [];
      // Drop any custom-color originals that accidentally captured clay/near-black during paint.
      scrubVrmMannequinColorCaches(vrm);
    };

    restore();
    if (!enabled) {
      applyVrmCustomColors(vrm, customColors);
      applyVrmMaterialFx(vrm, materialFx);
      return;
    }
    const seen = new Set<THREE.Material>();
    vrm.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const rawMaterial of materials) {
        if (!rawMaterial || seen.has(rawMaterial)) continue;
        seen.add(rawMaterial);
        const material = rawMaterial as MannequinMaterial;
        snapshotsRef.current.push({
          material,
          color: material.color?.clone() ?? null,
          emissive: material.emissive?.clone() ?? null,
          emissiveIntensity: material.emissiveIntensity,
          map: material.map,
          metalness: material.metalness,
          roughness: material.roughness,
        });
        material.userData.__vrmMannequinActive = true;
        material.needsUpdate = true;
      }
    });
    return () => {
      restore();
      applyVrmCustomColors(vrm, customColors);
      applyVrmMaterialFx(vrm, materialFx);
    };
  }, [customColors, enabled, materialFx, vrm]);

  useFrame(() => {
    if (enabled) enforce();
  });

  return null;
}

/**
 * vrm.lookAt 직접 구동. VRMLookAt.yaw/pitch 단위는 도(degree) —
 * 라디안을 넣으면 거의 움직이지 않는다. useFrame 밖 헬퍼로 분리(react-compiler 프롭 변이 제약).
 */
function applyLookAtToVrm(vrm: VRM, lookAt: { yawDeg: number; pitchDeg: number }) {
  if (!vrm.lookAt) return;
  vrm.lookAt.yaw = lookAt.yawDeg;
  vrm.lookAt.pitch = lookAt.pitchDeg;
}

function StudioVrmTexturePaintInvalidateBridge({
  onReady,
}: {
  readonly onReady: (invalidate: (() => void) | null) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const requestFrame = () => invalidate();
    onReady(requestFrame);
    return () => onReady(null);
  }, [invalidate, onReady]);

  return null;
}

function StudioVrmViewportReadyFrame({
  revision,
}: {
  readonly revision: string;
}) {
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    invalidate();
    let settledFrame: number | null = null;
    const layoutFrame = requestAnimationFrame(() => {
      invalidate();
      settledFrame = requestAnimationFrame(() => invalidate());
    });
    return () => {
      cancelAnimationFrame(layoutFrame);
      if (settledFrame !== null) cancelAnimationFrame(settledFrame);
    };
  }, [invalidate, revision]);

  return null;
}

function studioVrmTexturePaintHit(
  event: ThreeEvent<PointerEvent>,
): StudioVrmTexturePaintRayHit | null {
  if (!(event.object instanceof THREE.Mesh) || (!event.uv && !event.uv1)) return null;
  const hit = {
    object: event.object,
    ...(event.uv ? { uv: event.uv } : {}),
    ...(event.uv1 ? { uv1: event.uv1 } : {}),
    face: event.face,
    faceIndex: event.faceIndex,
    point: event.point,
  };
  return hit;
}

function studioVrmTexturePaintPressure(event: ThreeEvent<PointerEvent>): number {
  const pressure = event.pressure;
  if (Number.isFinite(pressure) && pressure > 0) {
    return Math.min(1, Math.max(0.01, pressure));
  }
  return event.pointerType === "pen" ? 0.01 : 0.5;
}

const STUDIO_VRM_TEXTURE_PAINT_ONE_SHOT_TAP_MAX_DISTANCE_CSS_PX = 10;
const STUDIO_VRM_TEXTURE_PAINT_ONE_SHOT_TAP_MAX_DISTANCE_SQUARED =
  STUDIO_VRM_TEXTURE_PAINT_ONE_SHOT_TAP_MAX_DISTANCE_CSS_PX
  * STUDIO_VRM_TEXTURE_PAINT_ONE_SHOT_TAP_MAX_DISTANCE_CSS_PX;

interface StudioVrmTexturePaintPointerCaptureTarget {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
}

interface StudioVrmTexturePaintPendingOneShotTap {
  readonly kind: "fill" | "sample";
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly hit: StudioVrmTexturePaintRayHit;
  readonly runtime: StudioVrmTexturePaintRuntime;
  readonly settings: StudioVrmTexturePaintPanelSettings;
  readonly explicitEyedropper: boolean;
  captureTarget: StudioVrmTexturePaintPointerCaptureTarget | null;
}

function studioVrmTexturePaintOneShotTapMoved(
  pending: StudioVrmTexturePaintPendingOneShotTap,
  clientX: number,
  clientY: number,
): boolean {
  if (
    !Number.isFinite(pending.startClientX)
    || !Number.isFinite(pending.startClientY)
    || !Number.isFinite(clientX)
    || !Number.isFinite(clientY)
  ) {
    return true;
  }
  const deltaX = clientX - pending.startClientX;
  const deltaY = clientY - pending.startClientY;
  return deltaX * deltaX + deltaY * deltaY
    > STUDIO_VRM_TEXTURE_PAINT_ONE_SHOT_TAP_MAX_DISTANCE_SQUARED;
}

function VrmActor({
  bodyRotation,
  customBones,
  customYOffset,
  poseTranslations,
  expressionWeights,
  vrm,
  customColors,
  materialFx,
  webcamActive,
  trackingDataRef,
  idleAnimation,
  fingerEdits,
  bodyScale,
  texturePaintEnabled,
  texturePaintMutationBlockedRef,
  texturePaintRuntime,
  texturePaintSettings,
  texturePaintEyedropperActive,
  onTexturePaintColorSampled,
  onTexturePaintEyedropperComplete,
}: {
  bodyRotation: number;
  customBones: PoseBoneMap;
  customYOffset: number;
  poseTranslations: StudioVrmPoseTranslations;
  expressionWeights: Record<string, number>;
  vrm: VRM;
  customColors: Record<string, string>;
  materialFx: VrmMaterialFx;
  webcamActive: boolean;
  trackingDataRef: React.RefObject<VrmTrackingData | null>;
  idleAnimation: boolean;
  fingerEdits: FingerRotationMap;
  bodyScale: BodyScale;
  texturePaintEnabled: boolean;
  texturePaintMutationBlockedRef: React.RefObject<boolean>;
  texturePaintRuntime: StudioVrmTexturePaintRuntime | null;
  texturePaintSettings: StudioVrmTexturePaintPanelSettings;
  texturePaintEyedropperActive: boolean;
  onTexturePaintColorSampled: (color: string) => void;
  onTexturePaintEyedropperComplete: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const texturePaintRuntimeRef = useRef(texturePaintRuntime);
  const texturePaintSettingsRef = useRef(texturePaintSettings);
  const texturePaintEnabledRef = useRef(texturePaintEnabled);
  const texturePaintEyedropperActiveRef = useRef(texturePaintEyedropperActive);
  const texturePaintColorSampledRef = useRef(onTexturePaintColorSampled);
  const texturePaintEyedropperCompleteRef = useRef(onTexturePaintEyedropperComplete);
  const texturePaintOneShotGenerationRef = useRef(0);
  const texturePaintOneShotAbortRef = useRef<AbortController | null>(null);
  const texturePaintOneShotBusyRef = useRef(false);
  const texturePaintPendingOneShotTapRef =
    useRef<StudioVrmTexturePaintPendingOneShotTap | null>(null);
  const texturePaintPointerIdRef = useRef<number | null>(null);
  const texturePaintCaptureTargetRef = useRef<{
    releasePointerCapture(pointerId: number): void;
  } | null>(null);
  const finishTexturePaintRef = useRef<(pointerId?: number) => void>(() => undefined);
  const cancelTexturePaintRef = useRef<(pointerId?: number) => void>(() => undefined);

  const releaseTexturePaintPendingOneShotCapture = useCallback(
    (pending: StudioVrmTexturePaintPendingOneShotTap) => {
      const captureTarget = pending.captureTarget;
      pending.captureTarget = null;
      if (!captureTarget) return;
      try {
        captureTarget.releasePointerCapture(pending.pointerId);
      } catch {
        // Pointer cancellation or native pointerup may already have released capture.
      }
    },
    [],
  );

  const cancelTexturePaintPendingOneShotTap = useCallback(
    (matchingPointerId?: number): boolean => {
      const pending = texturePaintPendingOneShotTapRef.current;
      if (
        !pending
        || (matchingPointerId !== undefined && pending.pointerId !== matchingPointerId)
      ) {
        return false;
      }
      texturePaintPendingOneShotTapRef.current = null;
      releaseTexturePaintPendingOneShotCapture(pending);
      return true;
    },
    [releaseTexturePaintPendingOneShotCapture],
  );

  const runTexturePaintOneShot = useCallback(
    (pending: StudioVrmTexturePaintPendingOneShotTap) => {
      if (
        texturePaintMutationBlockedRef.current
        || !texturePaintEnabledRef.current
        || texturePaintRuntimeRef.current !== pending.runtime
        || texturePaintOneShotBusyRef.current
      ) {
        return;
      }

      const generation = texturePaintOneShotGenerationRef.current + 1;
      texturePaintOneShotGenerationRef.current = generation;
      texturePaintOneShotBusyRef.current = true;
      const controller = new AbortController();
      texturePaintOneShotAbortRef.current = controller;
      pending.runtime.clearError();
      const operation = pending.kind === "sample"
        ? pending.runtime.sampleBaseColor({
            hit: pending.hit,
            signal: controller.signal,
          })
        : pending.runtime.fillBaseColor({
            hit: pending.hit,
            color: pending.settings.color,
            tolerance: pending.settings.fillTolerance,
            scope: pending.settings.fillScope,
            signal: controller.signal,
          });

      void operation.then((result) => {
        if (generation !== texturePaintOneShotGenerationRef.current) return;
        if (pending.kind === "sample" && result.ok && typeof result.value !== "boolean") {
          texturePaintColorSampledRef.current(result.value.color);
          if (pending.explicitEyedropper) texturePaintEyedropperCompleteRef.current();
        }
        invalidate();
      }).catch(() => {
        if (generation === texturePaintOneShotGenerationRef.current) invalidate();
      }).finally(() => {
        if (generation === texturePaintOneShotGenerationRef.current) {
          if (texturePaintOneShotAbortRef.current === controller) {
            texturePaintOneShotAbortRef.current = null;
          }
          texturePaintOneShotBusyRef.current = false;
        }
      });
    },
    [invalidate, texturePaintMutationBlockedRef],
  );

  const finishTexturePaintPendingOneShotTap = useCallback(
    (
      pointerId: number,
      clientX: number,
      clientY: number,
    ): boolean => {
      const pending = texturePaintPendingOneShotTapRef.current;
      if (!pending || pending.pointerId !== pointerId) return false;
      texturePaintPendingOneShotTapRef.current = null;
      releaseTexturePaintPendingOneShotCapture(pending);
      if (studioVrmTexturePaintOneShotTapMoved(pending, clientX, clientY)) return true;
      runTexturePaintOneShot(pending);
      return true;
    },
    [releaseTexturePaintPendingOneShotCapture, runTexturePaintOneShot],
  );

  useEffect(() => {
    texturePaintRuntimeRef.current = texturePaintRuntime;
    texturePaintSettingsRef.current = texturePaintSettings;
    texturePaintEnabledRef.current = texturePaintEnabled;
    texturePaintEyedropperActiveRef.current = texturePaintEyedropperActive;
    texturePaintColorSampledRef.current = onTexturePaintColorSampled;
    texturePaintEyedropperCompleteRef.current = onTexturePaintEyedropperComplete;
  }, [
    onTexturePaintColorSampled,
    onTexturePaintEyedropperComplete,
    texturePaintEnabled,
    texturePaintEyedropperActive,
    texturePaintRuntime,
    texturePaintSettings,
  ]);

  useEffect(() => () => {
    cancelTexturePaintPendingOneShotTap();
    texturePaintOneShotGenerationRef.current += 1;
    texturePaintOneShotAbortRef.current?.abort();
    texturePaintOneShotAbortRef.current = null;
    texturePaintOneShotBusyRef.current = false;
  }, [cancelTexturePaintPendingOneShotTap]);

  useEffect(() => {
    const releaseCapture = (pointerId: number) => {
      const captureTarget = texturePaintCaptureTargetRef.current;
      texturePaintCaptureTargetRef.current = null;
      if (!captureTarget) return;
      try {
        captureTarget.releasePointerCapture(pointerId);
      } catch {
        // The browser may already have released capture before the fallback event arrives.
      }
    };
    const finishTexturePaint = (matchingPointerId?: number) => {
      const pointerId = texturePaintPointerIdRef.current;
      if (
        pointerId === null
        || (matchingPointerId !== undefined && matchingPointerId !== pointerId)
      ) {
        return;
      }
      texturePaintPointerIdRef.current = null;
      releaseCapture(pointerId);
      const result = texturePaintRuntimeRef.current?.commitStroke(pointerId);
      if (result?.ok && result.value) invalidate();
    };
    const cancelTexturePaint = (matchingPointerId?: number) => {
      const pointerId = texturePaintPointerIdRef.current;
      if (
        pointerId === null
        || (matchingPointerId !== undefined && matchingPointerId !== pointerId)
      ) {
        return;
      }
      texturePaintPointerIdRef.current = null;
      releaseCapture(pointerId);
      const result = texturePaintRuntimeRef.current?.cancelStroke(pointerId);
      if (result?.ok && result.value) invalidate();
    };
    finishTexturePaintRef.current = finishTexturePaint;
    cancelTexturePaintRef.current = cancelTexturePaint;

    const finishMatchingPointer = (event: PointerEvent) => {
      finishTexturePaintPendingOneShotTap(
        event.pointerId,
        event.clientX,
        event.clientY,
      );
      finishTexturePaint(event.pointerId);
    };
    const cancelMatchingPointer = (event: PointerEvent) => {
      cancelTexturePaintPendingOneShotTap(event.pointerId);
      cancelTexturePaint(event.pointerId);
    };
    const cancelPendingTapOnMove = (event: PointerEvent) => {
      const pending = texturePaintPendingOneShotTapRef.current;
      if (
        pending
        && pending.pointerId === event.pointerId
        && studioVrmTexturePaintOneShotTapMoved(pending, event.clientX, event.clientY)
      ) {
        cancelTexturePaintPendingOneShotTap(event.pointerId);
      }
    };
    const cancelPendingTapOnAdditionalPointer = (event: PointerEvent) => {
      const pending = texturePaintPendingOneShotTapRef.current;
      if (pending && pending.pointerId !== event.pointerId) {
        cancelTexturePaintPendingOneShotTap();
      }
    };
    const cancelOnWindowBlur = () => {
      cancelTexturePaintPendingOneShotTap();
      cancelTexturePaint();
    };
    window.addEventListener("pointermove", cancelPendingTapOnMove, { passive: true });
    window.addEventListener("pointerup", finishMatchingPointer, { passive: true });
    window.addEventListener("pointercancel", cancelMatchingPointer, { passive: true });
    window.addEventListener("blur", cancelOnWindowBlur);
    gl.domElement.addEventListener(
      "pointerdown",
      cancelPendingTapOnAdditionalPointer,
      true,
    );
    gl.domElement.addEventListener("lostpointercapture", cancelMatchingPointer);
    return () => {
      window.removeEventListener("pointermove", cancelPendingTapOnMove);
      window.removeEventListener("pointerup", finishMatchingPointer);
      window.removeEventListener("pointercancel", cancelMatchingPointer);
      window.removeEventListener("blur", cancelOnWindowBlur);
      gl.domElement.removeEventListener(
        "pointerdown",
        cancelPendingTapOnAdditionalPointer,
        true,
      );
      gl.domElement.removeEventListener("lostpointercapture", cancelMatchingPointer);
      cancelTexturePaintPendingOneShotTap();
      cancelTexturePaint();
      if (finishTexturePaintRef.current === finishTexturePaint) {
        finishTexturePaintRef.current = () => undefined;
      }
      if (cancelTexturePaintRef.current === cancelTexturePaint) {
        cancelTexturePaintRef.current = () => undefined;
      }
    };
  }, [
    cancelTexturePaintPendingOneShotTap,
    finishTexturePaintPendingOneShotTap,
    gl,
    invalidate,
  ]);

  useEffect(() => {
    cancelTexturePaintPendingOneShotTap();
  }, [
    cancelTexturePaintPendingOneShotTap,
    texturePaintEyedropperActive,
    texturePaintRuntime,
    texturePaintSettings.tool,
  ]);

  useEffect(() => {
    if (texturePaintEnabled) return;
    cancelTexturePaintPendingOneShotTap();
    cancelTexturePaintRef.current();
    texturePaintOneShotGenerationRef.current += 1;
    texturePaintOneShotAbortRef.current?.abort();
    texturePaintOneShotAbortRef.current = null;
    texturePaintOneShotBusyRef.current = false;
  }, [cancelTexturePaintPendingOneShotTap, texturePaintEnabled]);

  useEffect(() => {
    applyPoserVisualState(vrm, {
      bones: customBones,
      yOffset: customYOffset,
      poseTranslations,
      fingerEdits,
      bodyScale,
    });
    applyExpressionWeightsToVrm(vrm, expressionWeights);
  }, [customBones, customYOffset, poseTranslations, expressionWeights, fingerEdits, bodyScale, vrm, webcamActive, idleAnimation]);

  useEffect(() => {
    applyRotationToVrm(vrm, bodyRotation);
  }, [bodyRotation, vrm]);

  useEffect(() => {
    applyVrmCustomColors(vrm, customColors);
    // applyVrmCustomColors already repairs when idle; re-run after paint races settle.
    const raf = requestAnimationFrame(() => {
      repairVrmTexturedNearBlackLitFactors(vrm);
    });
    return () => cancelAnimationFrame(raf);
  }, [customColors, vrm]);

  useEffect(() => {
    applyVrmMaterialFx(vrm, materialFx);
  }, [materialFx, vrm]);

  // 팔/다리 본 시간축 스무딩(프레임 간 상태 유지). 웹캠 토글마다 리셋해 stale 보간 방지.
  const boneSmootherRef = useRef<VrmBoneSmoother>(new VrmBoneSmoother());
  // head/neck 전용 스무더 — 시선이 머무는 비주얼 채널이라 지터 억제를 우선한 프리셋.
  const headSmootherRef = useRef<VrmBoneSmoother>(new VrmBoneSmoother(HEAD_BONE_SMOOTHER));
  useEffect(() => {
    const smoother = boneSmootherRef.current;
    const headSmoother = headSmootherRef.current;
    return () => {
      smoother.reset();
      headSmoother.reset();
    };
  }, [webcamActive]);

  useFrame((state, delta) => {
    const dVal = delta as number;
    const humanoid = vrm.humanoid;
    const expressionManager = vrm.expressionManager;

    if (webcamActive && trackingDataRef.current) {
      const data = trackingDataRef.current;
      if (humanoid) {
        const smoother = boneSmootherRef.current;
        const present = new Set<string>();
        Object.entries(data.bones).forEach(([boneName, rot]) => {
          const bone = humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
          if (!bone) return;
          // 팔/다리/발/손은 quaternion 슬러프로 스무딩(떨림 제거).
          // head/neck 은 One-Euro 채널 필터 위에 본 레벨 스무딩을 한 겹 더 —
          // 시선이 머무는 채널이라 잔여 지터까지 흡수한다.
          if (LIMB_BONE_RE.test(boneName)) {
            present.add(boneName);
            bone.quaternion.copy(smoother.smooth(boneName, rot, dVal));
          } else if (boneName === "head" || boneName === "neck") {
            bone.quaternion.copy(headSmootherRef.current.smooth(boneName, rot, dVal));
          } else {
            bone.rotation.set(rot[0], rot[1], rot[2]);
          }
        });
        // 추적이 끊긴 팔다리 본은 얼어붙지 않고 사용자 포즈(customBones, 기본 항등)로 부드럽게 복귀.
        for (const boneName of CANONICAL_LIMB_BONES) {
          if (present.has(boneName)) continue;
          const bone = humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
          if (!bone) continue;
          const rest = customBones[boneName]?.rotation ?? ZERO_EULER;
          const faded = smoother.fadeToward(boneName, rest, dVal, LIMB_FADE_HALF_LIFE);
          if (faded) bone.quaternion.copy(faded);
        }

        // 손가락 추적 결과 적용 — 팔다리와 같은 One-Euro quaternion 스무딩으로 떨림 제거.
        if (data.fingers) {
          for (const [boneName, rot] of Object.entries(data.fingers)) {
            const bone = humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
            if (bone) bone.quaternion.copy(smoother.smooth(boneName, rot, dVal));
          }
        }
      }

      if (expressionManager) {
        expressionManager.resetValues();
        // vrm.lookAt 이 있으면 시선은 lookAt 으로 직접 구동 — look* 표정과 이중 적용 방지.
        const useLookAt = !!vrm.lookAt && !!data.lookAt;
        Object.entries(data.expressions).forEach(([name, weight]) => {
          if (useLookAt && LOOK_EXPRESSION_NAMES.has(name)) return;
          if (expressionManager.getExpression(name)) {
            expressionManager.setValue(name, weight);
          }
        });
        expressionManager.update();
      }
      if (vrm.lookAt && data.lookAt) {
        applyLookAtToVrm(vrm, data.lookAt);
      }
    } else if (idleAnimation) {
      if (humanoid) {
        const time = state.clock.elapsedTime;
        // Breathing animation: chest and spine sine modulation
        const breath = Math.sin(time * 1.8) * 0.015;
        const breathSpine = Math.sin(time * 1.8 - 0.2) * 0.008;

        const chestBone = humanoid.getNormalizedBoneNode("chest");
        if (chestBone) {
          const baseRot = customBones.chest?.rotation || [0, 0, 0];
          chestBone.rotation.set(baseRot[0] + breath, baseRot[1], baseRot[2]);
        }
        const spineBone = humanoid.getNormalizedBoneNode("spine");
        if (spineBone) {
          const baseRot = customBones.spine?.rotation || [0, 0, 0];
          spineBone.rotation.set(baseRot[0] + breathSpine, baseRot[1], baseRot[2]);
        }

        // Auto-blink: 200ms blink duration every 4.5 seconds
        const cycle = time % 4.5;
        let blinkWeight = 0;
        if (cycle > 4.3) {
          const progress = (cycle - 4.3) / 0.2;
          blinkWeight = Math.sin(progress * Math.PI);
        }

        if (expressionManager) {
          expressionManager.resetValues();
          Object.entries(expressionWeights).forEach(([name, weight]) => {
            if (expressionManager.getExpression(name)) {
              expressionManager.setValue(name, weight);
            }
          });

          if (blinkWeight > 0) {
            expressionManager.setValue("blinkLeft", Math.max(blinkWeight, expressionWeights.blinkLeft || 0));
            expressionManager.setValue("blinkRight", Math.max(blinkWeight, expressionWeights.blinkRight || 0));
          }
          expressionManager.update();
        }
      }
    }

  }, VRM_FRAME_BASE_PRIORITY);

  const releaseFailedTexturePaintPointer = (pointerId: number) => {
    if (texturePaintPointerIdRef.current !== pointerId) return;
    texturePaintPointerIdRef.current = null;
    const captureTarget = texturePaintCaptureTargetRef.current;
    texturePaintCaptureTargetRef.current = null;
    if (!captureTarget) return;
    try {
      captureTarget.releasePointerCapture(pointerId);
    } catch {
      // A native pointerup/lostpointercapture may have won the race.
    }
  };

  const beginTexturePaint = (event: ThreeEvent<PointerEvent>) => {
    const existingPendingTap = texturePaintPendingOneShotTapRef.current;
    if (existingPendingTap) {
      if (existingPendingTap.pointerId !== event.pointerId) {
        cancelTexturePaintPendingOneShotTap();
      }
      return;
    }
    const runtime = texturePaintRuntimeRef.current;
    const hit = studioVrmTexturePaintHit(event);
    if (
      texturePaintMutationBlockedRef.current
      ||
      !texturePaintEnabledRef.current
      || !runtime
      || !hit
      || !event.isPrimary
      || event.button !== 0
      || texturePaintPointerIdRef.current !== null
      || texturePaintOneShotBusyRef.current
    ) {
      return;
    }

    event.stopPropagation();
    const settings = texturePaintSettingsRef.current;
    const explicitEyedropper = texturePaintEyedropperActiveRef.current;
    const oneShotKind =
      event.altKey || explicitEyedropper
        ? "sample"
        : settings.tool === "fill"
          ? "fill"
          : null;
    if (oneShotKind) {
      const captureTarget =
        event.currentTarget as unknown as StudioVrmTexturePaintPointerCaptureTarget;
      const pending: StudioVrmTexturePaintPendingOneShotTap = {
        kind: oneShotKind,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        hit,
        runtime,
        settings,
        explicitEyedropper,
        captureTarget: null,
      };
      texturePaintPendingOneShotTapRef.current = pending;
      try {
        captureTarget.setPointerCapture(event.pointerId);
        pending.captureTarget = captureTarget;
      } catch {
        // Window pointer listeners still finish/cancel the tap if capture is unavailable.
      }
      return;
    }
    const pointerId = event.pointerId;
    texturePaintPointerIdRef.current = pointerId;
    const captureTarget = event.currentTarget as unknown as {
      setPointerCapture(pointerId: number): void;
      releasePointerCapture(pointerId: number): void;
    };
    try {
      captureTarget.setPointerCapture(pointerId);
      texturePaintCaptureTargetRef.current = captureTarget;
    } catch {
      texturePaintCaptureTargetRef.current = null;
    }

    runtime.clearError();
    void runtime.beginStroke({
      pointerId,
      hit,
      pressure: studioVrmTexturePaintPressure(event),
      style: {
        kind: settings.brushKind,
        color: settings.color,
        sizeTexels: settings.sizeTexels,
        opacity: settings.opacity,
        blend: settings.blend,
        tuning: settings.tuning,
      },
    }).then((result) => {
      if (!result.ok) releaseFailedTexturePaintPointer(pointerId);
      invalidate();
    }).catch(() => {
      releaseFailedTexturePaintPointer(pointerId);
      invalidate();
    });
  };

  const moveTexturePaint = (event: ThreeEvent<PointerEvent>) => {
    const pendingTap = texturePaintPendingOneShotTapRef.current;
    if (pendingTap?.pointerId === event.pointerId) {
      event.stopPropagation();
      if (studioVrmTexturePaintOneShotTapMoved(pendingTap, event.clientX, event.clientY)) {
        cancelTexturePaintPendingOneShotTap(event.pointerId);
      }
      return;
    }
    const pointerId = texturePaintPointerIdRef.current;
    if (
      pointerId === null
      || event.pointerId !== pointerId
      || texturePaintMutationBlockedRef.current
      || !texturePaintEnabledRef.current
    ) {
      return;
    }
    const hit = studioVrmTexturePaintHit(event);
    if (!hit) return;
    event.stopPropagation();
    const result = texturePaintRuntimeRef.current?.moveStroke({
      pointerId,
      hit,
      pressure: studioVrmTexturePaintPressure(event),
    });
    if (result?.ok && result.value) invalidate();
  };

  const finishTexturePaint = (event: ThreeEvent<PointerEvent>) => {
    if (
      finishTexturePaintPendingOneShotTap(
        event.pointerId,
        event.clientX,
        event.clientY,
      )
    ) {
      event.stopPropagation();
      return;
    }
    if (texturePaintPointerIdRef.current !== event.pointerId) return;
    event.stopPropagation();
    finishTexturePaintRef.current(event.pointerId);
  };

  const cancelTexturePaint = (event: ThreeEvent<PointerEvent>) => {
    if (cancelTexturePaintPendingOneShotTap(event.pointerId)) {
      event.stopPropagation();
      return;
    }
    if (texturePaintPointerIdRef.current !== event.pointerId) return;
    event.stopPropagation();
    cancelTexturePaintRef.current(event.pointerId);
  };

  return (
    <primitive
      object={vrm.scene}
      onPointerDown={beginTexturePaint}
      onPointerMove={moveTexturePaint}
      onPointerUp={finishTexturePaint}
      onPointerCancel={cancelTexturePaint}
      onLostPointerCapture={cancelTexturePaint}
    />
  );
}

function VrmPoseBoneMarker({
  vrm,
  boneName,
  selected,
  locked,
  draggable,
  onSelect,
  onDrag,
}: {
  readonly vrm: VRM;
  readonly boneName: VRMHumanBoneName;
  readonly selected: boolean;
  readonly locked: boolean;
  readonly draggable: boolean;
  readonly onSelect: (boneName: VRMHumanBoneName) => void;
  readonly onDrag: (
    boneName: VRMHumanBoneName,
    target: readonly [number, number, number],
    phase: "start" | "move" | "end",
  ) => void;
}) {
  const markerRef = useRef<THREE.Mesh>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const worldPositionRef = useRef(new THREE.Vector3());
  const dragPlaneRef = useRef(new THREE.Plane());
  const dragPointRef = useRef(new THREE.Vector3());
  const dragNormalRef = useRef(new THREE.Vector3());
  const lastDragPointRef = useRef(new THREE.Vector3());
  const draggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const pointerCaptureTargetRef = useRef<{
    releasePointerCapture(pointerId: number): void;
  } | null>(null);
  const onDragRef = useRef(onDrag);
  const finishDragRef = useRef<(target?: THREE.Vector3) => void>(() => undefined);

  useEffect(() => {
    onDragRef.current = onDrag;
  }, [onDrag]);

  useEffect(() => {
    const finishDrag = (target = lastDragPointRef.current) => {
      // R3F 9.6 does not dispatch object-level pointercancel/lostpointercapture handlers.
      // Every R3F and native exit path converges here; the guard makes the pose commit exact-once.
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const pointerId = activePointerIdRef.current;
      activePointerIdRef.current = null;
      const pointerCaptureTarget = pointerCaptureTargetRef.current;
      pointerCaptureTargetRef.current = null;
      if (pointerId !== null && pointerCaptureTarget) {
        try {
          pointerCaptureTarget.releasePointerCapture(pointerId);
        } catch {
          // The browser may already have released capture before lostpointercapture/blur arrives.
        }
      }
      onDragRef.current(boneName, [target.x, target.y, target.z], "end");
    };
    finishDragRef.current = finishDrag;

    const finishMatchingPointer = (event: PointerEvent) => {
      const activePointerId = activePointerIdRef.current;
      if (activePointerId === null || event.pointerId !== activePointerId) return;
      finishDrag();
    };
    const finishOnWindowBlur = () => finishDrag();

    // Bubble-stage window handlers run after the normal R3F pointerup path. If R3F already
    // finished the drag, finishDrag's guard makes these fallbacks harmless.
    window.addEventListener("pointerup", finishMatchingPointer);
    window.addEventListener("pointercancel", finishMatchingPointer);
    window.addEventListener("blur", finishOnWindowBlur);
    gl.domElement.addEventListener("lostpointercapture", finishMatchingPointer);
    return () => {
      window.removeEventListener("pointerup", finishMatchingPointer);
      window.removeEventListener("pointercancel", finishMatchingPointer);
      window.removeEventListener("blur", finishOnWindowBlur);
      gl.domElement.removeEventListener("lostpointercapture", finishMatchingPointer);
      finishDrag();
      if (finishDragRef.current === finishDrag) {
        finishDragRef.current = () => undefined;
      }
    };
  }, [boneName, gl]);

  useFrame(() => {
    const marker = markerRef.current;
    const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
    if (!marker || !bone) {
      if (marker) marker.visible = false;
      return;
    }
    bone.getWorldPosition(worldPositionRef.current);
    if (!draggingRef.current) lastDragPointRef.current.copy(worldPositionRef.current);
    marker.position.copy(worldPositionRef.current);
    const markerScale = THREE.MathUtils.clamp(
      camera.position.distanceTo(worldPositionRef.current) * 0.011,
      0.024,
      0.065,
    );
    marker.scale.setScalar(markerScale);
    marker.visible = true;
  });

  return (
    <mesh
      ref={markerRef}
      renderOrder={100}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(boneName);
      }}
      onPointerDown={(event) => {
        if (!draggable) return;
        event.stopPropagation();
        onSelect(boneName);
        camera.getWorldDirection(dragNormalRef.current);
        dragPlaneRef.current.setFromNormalAndCoplanarPoint(
          dragNormalRef.current,
          worldPositionRef.current,
        );
        draggingRef.current = true;
        activePointerIdRef.current = event.pointerId;
        lastDragPointRef.current.copy(worldPositionRef.current);
        // R3F owns an internal capturedMap in addition to the browser canvas capture. Capturing
        // through the event object keeps move/up delivery bound to this small 3D marker even when
        // the ray leaves it during a fast IK drag.
        const pointerTarget = event.currentTarget as unknown as {
          setPointerCapture(pointerId: number): void;
          releasePointerCapture(pointerId: number): void;
        };
        pointerTarget.setPointerCapture(event.pointerId);
        pointerCaptureTargetRef.current = pointerTarget;
        onDrag(boneName, [
          worldPositionRef.current.x,
          worldPositionRef.current.y,
          worldPositionRef.current.z,
        ], "start");
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current || !draggable) return;
        event.stopPropagation();
        const target = event.ray.intersectPlane(dragPlaneRef.current, dragPointRef.current);
        if (!target || ![target.x, target.y, target.z].every(Number.isFinite)) return;
        lastDragPointRef.current.copy(target);
        onDrag(boneName, [target.x, target.y, target.z], "move");
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current) return;
        event.stopPropagation();
        const target = event.ray.intersectPlane(dragPlaneRef.current, dragPointRef.current)
          ?? lastDragPointRef.current;
        lastDragPointRef.current.copy(target);
        finishDragRef.current(target);
      }}
      onPointerCancel={(event) => {
        if (!draggingRef.current) return;
        event.stopPropagation();
        finishDragRef.current();
      }}
      onLostPointerCapture={(event) => {
        if (!draggingRef.current) return;
        event.stopPropagation();
        finishDragRef.current();
      }}
    >
      <sphereGeometry args={[1, 16, 12]} />
      <meshBasicMaterial
        color={selected ? "#ff5a36" : locked ? "#f2a93b" : draggable ? "#32c48d" : "#39a9ff"}
        transparent
        opacity={selected ? 1 : 0.82}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function VrmPoseBoneOverlay({
  vrm,
  selectedBone,
  lockedBones,
  handIkEnabled,
  onSelect,
  onDrag,
}: {
  readonly vrm: VRM;
  readonly selectedBone: VRMHumanBoneName | null;
  readonly lockedBones: readonly VRMHumanBoneName[];
  readonly handIkEnabled: boolean;
  readonly onSelect: (boneName: VRMHumanBoneName) => void;
  readonly onDrag: (
    boneName: VRMHumanBoneName,
    target: readonly [number, number, number],
    phase: "start" | "move" | "end",
  ) => void;
}) {
  return (
    <group name="studio-vrm-pose-bone-overlay">
      {VIEWPORT_POSE_BONES.map((boneName) => (
        <VrmPoseBoneMarker
          key={boneName}
          vrm={vrm}
          boneName={boneName}
          selected={selectedBone === boneName}
          locked={lockedBones.includes(boneName)}
          draggable={
            handIkEnabled &&
            (boneName === "leftHand" || boneName === "rightHand") &&
            !lockedBones.some((lockedBone) => (
              boneName === "leftHand"
                ? ["leftUpperArm", "leftLowerArm", "leftHand"].includes(lockedBone)
                : ["rightUpperArm", "rightLowerArm", "rightHand"].includes(lockedBone)
            ))
          }
          onSelect={onSelect}
          onDrag={onDrag}
        />
      ))}
    </group>
  );
}

/** base pose/tracking과 모든 소품 IK가 끝난 뒤 normalized pose를 raw VRM에 한 번만 전달한다. */
function VrmRuntimeCommit({
  vrm,
  physicsPreview,
  webcamActive,
}: {
  vrm: VRM;
  physicsPreview: boolean;
  webcamActive: boolean;
}) {
  useFrame((_, delta) => {
    // 흔들림 미리보기·웹캠 트래킹 중에만 스프링본을 전진시키고, 탭 복귀 폭주는 상한 처리한다.
    const springDelta = webcamActive || physicsPreview
      ? Math.min(delta, PHYSICS_PREVIEW_MAX_DELTA)
      : 0;
    vrm.update(springDelta);
  }, VRM_FRAME_COMMIT_PRIORITY);
  return null;
}

type LightingTone = "morning" | "sunset" | "night" | "studio";

function VrmLighting({
  tone,
  lighting,
  env,
  envRootRef,
}: {
  tone: LightingTone;
  lighting?: LightingParams;
  env?: EnvVariant;
  /** Capture lease hides this group so subject-only inserts exclude floor/wall env. */
  envRootRef?: { current: THREE.Group | null };
}) {
  const li = lighting ? computeLightingUniforms(lighting) : null;
  const iMul = li ? li.intensity : 1;
  const col = li ? li.color : null;
  const dirPos = li ? [li.dir.x * 3.5, li.dir.y * 4, li.dir.z * 3.5] as const : [2.8, 4.2, 3.6] as const;

  const base = tone === "sunset" ? { amb: [0.52, "#ffe8d6"], d1: [1.5, "#ffa07a"], d2: [0.6, "#ffb732"], d3: [0.3, "#ff6b8b"] } :
               tone === "night" ? { amb: [0.34, "#1b1c30"], d1: [0.92, "#7fa3ff"], d2: [0.4, "#483d8b"], d3: [0.5, "#8a2be2"] } :
               tone === "studio" ? { amb: [0.92, "#ffffff"], d1: [1.5, "#ffffff"], d2: [0.8, "#ffffff"], d3: [0.8, "#ffffff"] } :
               { amb: [0.68, "#ffffff"], d1: [1.32, "#ffffff"], d2: [0.54, "#f7d8c4"], d3: [0.42, "#cfdcff"] };

  const ambI = (base.amb[0] as number) * (iMul * 0.9);
  const d1I = (base.d1[0] as number) * iMul;
  const d2I = (base.d2[0] as number) * iMul * 0.9;
  const d3I = (base.d3[0] as number) * iMul * 0.8;

  const c1 = col ? `rgb(${Math.round(col[0]*255)},${Math.round(col[1]*255)},${Math.round(col[2]*255)})` : (base.d1[1] as string);
  const c2 = col ? `rgb(${Math.round(col[0]*255*0.85)},${Math.round(col[1]*255*0.85)},${Math.round(col[2]*255*0.9)})` : (base.d2[1] as string);

  return (
    <>
      <ambientLight intensity={ambI} color={base.amb[1] as string} />
      <directionalLight intensity={d1I} position={dirPos as [number,number,number]} color={c1} />
      <directionalLight intensity={d2I} position={[-3.2, 2.6, 2.1]} color={c2} />
      <directionalLight intensity={d3I} position={[-1.6, 3.4, -3.2]} color={base.d3[1] as string} />

      {/* Env variants (floor / wall / room / outdoor) — excluded from subject-only capture. */}
      <group ref={envRootRef}>
        {(env === "floor" || env === "room" || env === "outdoor") && (
          <mesh position={[0, -0.01, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 8]} />
            <meshLambertMaterial color={env === "outdoor" ? "#3a5f3a" : "#3a3a3f"} />
          </mesh>
        )}
        {(env === "wall" || env === "room") && (
          <>
            <mesh position={[0, 2.5, -2.8]}><planeGeometry args={[6, 5]} /><meshLambertMaterial color="#2b2b32" /></mesh>
            <mesh position={[0, 2.5, 2.8]} rotation={[0, Math.PI, 0]}><planeGeometry args={[6, 5]} /><meshLambertMaterial color="#2b2b32" /></mesh>
          </>
        )}
        {env === "room" && (
          <>
            <mesh position={[-3.2, 2.5, 0]} rotation={[0, Math.PI/2, 0]}><planeGeometry args={[6, 5]} /><meshLambertMaterial color="#2b2b32" /></mesh>
            <mesh position={[3.2, 2.5, 0]} rotation={[0, -Math.PI/2, 0]}><planeGeometry args={[6, 5]} /><meshLambertMaterial color="#2b2b32" /></mesh>
          </>
        )}
      </group>
    </>
  );
}

function parseCameraError(error: unknown): string {
  let errMsg = "카메라 권한 접근에 실패했습니다.";
  if (error instanceof Error) {
    const name = error.name;
    const msg = error.message;

    // Compute recommended access URL dynamically
    const getRecommendedUrl = () => {
      if (typeof window === "undefined") return "https://www.toonstudio.cloud/studio";
      const { protocol, hostname, origin, pathname } = window.location;
      const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
      if (protocol === "https:" || isLocal) {
        // Use current URL (preserve path like /studio)
        return `${origin}${pathname}`;
      }
      // Suggest production HTTPS URL
      return "https://www.toonstudio.cloud/studio";
    };
    const recommended = getRecommendedUrl();
    const isSecure = typeof window !== "undefined" && (window.isSecureContext || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

    if (!isSecure) {
      return "보안 접속(HTTPS 또는 localhost) 환경이 아니기 때문에 브라우저가 카메라 권한 팝업을 띄우지 않고 요청을 원천 차단했습니다.\n\n" +
        "[해결 방법]\n" +
        `1. 현재 비보안 주소로 접속 중입니다. 브라우저 보안 규정상 웹캠은 HTTPS 또는 localhost에서만 허용됩니다.\n` +
        `2. 로컬 개발 시: 주소창에 'http://localhost:5173' (또는 현재 Vite 포트)을 직접 입력해 접속하세요.\n` +
        `3. 운영/배포 환경에서는 반드시 HTTPS 주소(${recommended})로 접속하세요. (Vercel 등은 자동으로 HTTPS를 강제합니다.)\n` +
        `4. 외부 IP(예: http://192.168.x.x:xxxx)로 직접 접속 중이라면, 도메인 또는 localhost를 사용하거나 ngrok/cloudflare tunnel 같은 HTTPS 터널을 이용하세요.`;
    }

    if (name === "NotAllowedError" || msg.includes("Permission denied") || msg.includes("denied")) {
      errMsg = "카메라 사용 권한이 거부되었거나 즉시 차단되었습니다. (브라우저가 동의 팝업을 띄우지 않는 상태)\n\n" +
        "[원인 및 해결 방법]\n" +
        "1. 브라우저 주소창 왼쪽 '자물쇠' 아이콘 클릭 → '카메라'가 '허용'인지 확인 (이 사이트 origin에서 별도로 설정해야 함: localhost vs https://www.toonstudio.cloud 별개).\n" +
        "2. macOS: 시스템 설정 → 개인정보 보호 및 보안 → 카메라 에서 사용 중인 브라우저 스위치를 **켜기**. (브라우저 권한과 별도의 시스템 권한임)\n" +
        "3. 위 설정 변경 후: 브라우저 **완전 종료 → 재실행 → F5** 후 다시 '트래킹 시작' 클릭.\n" +
        `4. 여전히 안 되면 '${recommended}' 로 직접 접속했는지, 다른 앱이 카메라 점유 중인지 확인.`;
    } else if (name === "TypeError" && (msg.includes("undefined") || msg.includes("Insecure Context") || msg.includes("getUserMedia"))) {
      errMsg = "보안 접속 환경(HTTPS 또는 localhost)이 아니어서 브라우저가 카메라 접근 요청을 원천 차단했습니다.\n\n" +
        "[해결 방법]\n" +
        `현재 주소가 비보안(HTTP IP 등)입니다. 로컬 개발은 'http://localhost:5173' (또는 dev server), 운영 환경은 HTTPS 주소(${recommended})로 직접 접속해 주세요.`;
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      errMsg = "연결된 카메라(웹캠) 장치를 찾을 수 없습니다. 카메라가 컴퓨터에 올바르게 연결되어 있고 전원이 켜져 있는지 확인해 주세요.";
    } else if (name === "NotReadableError" || name === "TrackStartError") {
      errMsg = "카메라 장치를 사용할 수 없습니다. 이미 다른 앱(Zoom, Discord, FaceTime, Skype, 또는 다른 브라우저 탭)에서 카메라를 사용 중일 가능성이 높습니다. 카메라를 점유 중인 다른 프로그램을 완전히 종료하고 다시 시도해 주세요.";
    } else if (name === "SecurityError") {
      errMsg = `보안 정책(Feature Policy 또는 Sandbox) 제한이나 비보안 컨텍스트 문제로 인해 카메라에 접근할 수 없습니다. '${recommended}' 주소로 직접 접속했는지 확인해 주세요.`;
    } else {
      errMsg = `카메라 접근 오류 (${name}): ${msg}\n\n브라우저 주소창의 자물쇠 설정과 macOS 시스템 보안 설정에서 카메라 권한이 켜져 있는지 다시 한번 확인해 주세요.`;
    }
  }
  return errMsg;
}

function normalizeCatalogNextOffset(currentOffset: number, page: SharedAssetCatalogPage): number | null {
  if (!page.hasMore || page.nextOffset === null) return null;
  if (typeof page.nextOffset !== "number" || !Number.isInteger(page.nextOffset)) return null;
  if (page.nextOffset < currentOffset + 1) return null;
  return page.nextOffset;
}

export function StudioVrmPoser({ open, onClose, onInsert, initialDataUrl, initialScene }: StudioVrmPoserProps) {
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const viewportInstructionsId = useId();
  const texturePaintSceneIdentity = studioVrmTexturePaintSceneIdentity(initialScene);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [status, setStatus] = useState<LoadStatus>("empty");
  const [error, setError] = useState("");
  const [modelName, setModelName] = useState("");
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [activePoseId, setActivePoseId] = useState("default");
  const [customBones, setCustomBones] = useState<PoseBoneMap>(POSE_PRESETS[0].bones);
  const [customYOffset, setCustomYOffset] = useState<number>(POSE_PRESETS[0].yOffset ?? 0);
  const [poseTranslations, setPoseTranslations] = useState<StudioVrmPoseTranslations>(() =>
    cloneStudioVrmPoseTranslations(EMPTY_STUDIO_VRM_POSE_TRANSLATIONS)
  );
  const [ikConstraints, setIkConstraints] = useState<StudioVrmIkConstraint[]>([]);
  const [activeCategory, setActiveCategory] = useState("head");
  const [jointLimitsEnabled, setJointLimitsEnabled] = useState(true);
  const [rigJointProfile, setRigJointProfile] = useState<StudioVrmRigProfileId>("neutral");
  const [fullBodyIkEnabled, setFullBodyIkEnabled] = useState(false);
  const [footPlantEnabled, setFootPlantEnabled] = useState(false);
  const [rigFloorHeight, setRigFloorHeight] = useState(0);
  const [lockedPoseBones, setLockedPoseBones] = useState<VRMHumanBoneName[]>([]);
  const [showPoseBoneOverlay, setShowPoseBoneOverlay] = useState(false);
  const [selectedViewportPoseBone, setSelectedViewportPoseBone] =
    useState<VRMHumanBoneName | null>(null);
  const [viewportHandIkEnabled, setViewportHandIkEnabled] = useState(false);
  const [isViewportHandIkDragging, setIsViewportHandIkDragging] = useState(false);
  const [activeExpressionId, setActiveExpressionId] = useState("neutral");
  const [expressionWeights, setExpressionWeights] = useState<Record<string, number>>({});
  const [activeExpressionCategory, setActiveExpressionCategory] = useState<string>("emotion");
  const [activeCameraId, setActiveCameraId] = useState("front");
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("character");
  const [activeCharacterSection, setActiveCharacterSection] = useState<CharacterPanelSection>("library");
  const [texturePaintSettings, setTexturePaintSettings] =
    useState<StudioVrmTexturePaintPanelSettings>(DEFAULT_STUDIO_VRM_TEXTURE_PAINT_SETTINGS);
  const [texturePaintEyedropperActive, setTexturePaintEyedropperActive] = useState(false);
  const [texturePaintRuntime, setTexturePaintRuntime] =
    useState<StudioVrmTexturePaintRuntime | null>(null);
  const [texturePaintRuntimeSceneIdentity, setTexturePaintRuntimeSceneIdentity] =
    useState<string | null>(null);
  const [texturePaintSnapshot, setTexturePaintSnapshot] =
    useState<StudioVrmTexturePaintRuntimeSnapshot | null>(null);
  const [texturePaintPersistenceStatus, setTexturePaintPersistenceStatus] =
    useState<TexturePaintPersistenceStatus>("idle");
  const [texturePaintPersistenceError, setTexturePaintPersistenceError] = useState("");
  const [texturePaintRestoreRetryToken, setTexturePaintRestoreRetryToken] = useState(0);
  const [texturePaintDevicePlan] = useState(() =>
    planStudioVrmTexturePaintDeviceTier(readStudioVrmTexturePaintEnvironmentSignals()));
  const [poseQuery, setPoseQuery] = useState("");
  const [poseBucket, setPoseBucket] = useState<StudioVrmPoseBucketId>("all");
  const [recentPoseState, setRecentPoseState] = useState<StudioVrmRecentState>(() =>
    loadStudioVrmRecentPoses(typeof localStorage === "undefined" ? null : localStorage)
  );
  const [recentCharacterState, setRecentCharacterState] = useState<StudioVrmRecentState>(() =>
    loadStudioVrmRecentCharacters(typeof localStorage === "undefined" ? null : localStorage)
  );
  const [bodyRotation, setBodyRotation] = useState(0);
  const [mannequinMode, setMannequinMode] = useState(false);
  const [jointHandlesVisible, setJointHandlesVisible] = useState(true);
  const [selectedJointHandle, setSelectedJointHandle] = useState<StudioVrmJointHandleBone | null>(null);
  const [selectedIkPole, setSelectedIkPole] = useState<StudioVrmIkEffectorBone | null>(null);
  const [ikHandleDragMode, setIkHandleDragMode] = useState<StudioVrmIkDragMode>("screen");
  const [ikHandleAxisLock, setIkHandleAxisLock] = useState<StudioVrmIkAxisLock>("free");
  const [jointHandleInteracting, setJointHandleInteracting] = useState(false);
  const [jointHandleSessionGeneration, setJointHandleSessionGeneration] = useState(0);
  const [jointHandleStatus, setJointHandleStatus] = useState("");
  // 뷰포트 오버레이 컨트롤 — 줌/시점초기화/턴테이블/드래그 힌트.
  const [turntable, setTurntable] = useState(false);
  const turntableHint: StudioToolHintSpec = turntable
    ? {
        ...VRM_VIEWPORT_HINTS.turntable,
        title: "턴테이블 회전 중지",
        description: "다음 클릭으로 캐릭터 주위를 도는 자동 카메라를 멈추고 현재 시점에서 수동 조작을 이어갑니다.",
        preview: "camera-orbit",
        previewVariant: "stop",
        tip: "필요할 때 같은 버튼으로 현재 시점부터 자동 회전을 다시 시작할 수 있어요.",
      }
    : VRM_VIEWPORT_HINTS.turntable;
  const [viewResetNonce, setViewResetNonce] = useState(0);
  const [viewportHinted, setViewportHinted] = useState(false);
  const viewportApiRef = useRef<ViewportApi | null>(null);
  // 편집 되돌리기/다시실행 — 전체 포저 상태 스냅샷 히스토리(직렬화 재사용).
  const fullStateHistoryRef = useRef(createStudioVrmFullStateHistory());
  const isRestoringRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isThumbnailCapturing, setIsThumbnailCapturing] = useState(false);
  const [libraryEntries, setLibraryEntries] = useState<VrmLibraryEntry[]>(SAMPLE_VRM_ENTRIES);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("loading");
  const [libraryError, setLibraryError] = useState("");
  const [activeModelId, setActiveModelId] = useState(SAMPLE_VRM_ID);
  const [installedModelId, setInstalledModelId] = useState<string | null>(null);
  const activeModelIdRef = useRef(activeModelId);
  activeModelIdRef.current = activeModelId;
  const modelLoadTargetIdRef = useRef<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);

  // early decl for new features used in effects
  const [bodyScale, setBodyScale] = useState<BodyScale>({ height: 1, width: 1 });
  const [avatarForgeState, setAvatarForgeState] = useState<AvatarForgeState>(() => createAvatarForgeState());
  const detectedOriginalHairCount = useMemo(() => countDetectedVrmHairMeshes(vrm), [vrm]);
  const [fingerEdits, setFingerEdits] = useState<FingerRotationMap>({});
  const [lighting, setLighting] = useState<LightingParams>({ intensity: 1.2, colorTemp: 0.5, directionDeg: 45 });
  const [envVariant, setEnvVariant] = useState<EnvVariant>("none");
  /** Insert cutout: transparent subject-only PNG (default). Off = solid backgroundColor clear. */
  const [transparentBackground, setTransparentBackground] = useState(true);
  const [insertBackgroundColor, setInsertBackgroundColor] = useState("#ffffff");
  const [fullStateName, setFullStateName] = useState("");
  const [savedFullStates, setSavedFullStates] = useState<Record<string, FullVrmState>>({});
  const [customColors, setCustomColors] = useState<Record<string, string>>({ ...DEFAULT_VRM_CUSTOM_COLORS });
  const [materialFx, setMaterialFx] = useState<VrmMaterialFx>(DEFAULT_VRM_MATERIAL_FX);
  const [isSharingPose, setIsSharingPose] = useState(false);
  const [sharedPoses, setSharedPoses] = useState<SharedAssetCatalogItem[]>([]);
  const [sharedPosesStatus, setSharedPosesStatus] = useState<"idle" | "loading" | "error">("idle");
  const [sharedPoseLibraryOpen, setSharedPoseLibraryOpen] = useState(false);
  const [sharedPoseReloadToken, setSharedPoseReloadToken] = useState(0);
  const [sharedPoseNextOffset, setSharedPoseNextOffset] = useState<number | null>(null);
  const [sharedPoseHasMore, setSharedPoseHasMore] = useState(false);
  const [sharedPoseSelectionAssetId, setSharedPoseSelectionAssetId] = useState<string | null>(null);
  const [lightingTone, setLightingTone] = useState<LightingTone>("morning");
  const [activeProps, setActiveProps] = useState<string[]>([]);
  const [propAttachments, setPropAttachments] = useState<Record<string, PropAttachmentConfig>>({});
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [savedPoses, setSavedPoses] = useState<CustomPose[]>([]);
  const [preserveExpression, setPreserveExpression] = useState(true);
  // 본 부착 소품(studio-vrm-props) — 복수 부착 인스턴스.
  const [vrmPropItems, setVrmPropItems] = useState<PropInstance[]>([]);
  const [selectedVrmPropUid, setSelectedVrmPropUid] = useState<string | null>(null);
  // 의상(studio-vrm-costume) — 토글/리컬러 상태 + 수집된 메시 목록.
  const [costumeState, setCostumeState] = useState<CostumeState>({ hidden: [], recolor: {} });
  const [costumeMeshes, setCostumeMeshes] = useState<CostumeMeshEntry[]>([]);
  const [selectedCostumeKey, setSelectedCostumeKey] = useState<string | null>(null);
  // 실장착 워드로브(studio-vrm-wardrobe) — 슬롯별 장착 + 모델 실측 치수.
  const [wardrobeState, setWardrobeState] = useState<WardrobeState>({});
  const [wardrobeMetrics, setWardrobeMetrics] = useState<WardrobeMetrics | null>(null);
  const [wardrobeSurfaceReceipts, setWardrobeSurfaceReceipts] =
    useState<Partial<Record<WardrobeSlot, StudioVrmSkinnedGarmentReceipt>>>({});
  const [propRigMetrics, setPropRigMetrics] = useState<VrmPropRigMetrics>(DEFAULT_VRM_PROP_RIG_METRICS);
  const effectivePropRigMetrics = scaleVrmPropRigMetrics(propRigMetrics, bodyScale);
  const [wardrobeAutoHide, setWardrobeAutoHide] = useState(true);
  const wardrobeFitReport = inspectStudioVrmGarmentFit(wardrobeState, wardrobeMetrics);
  const wardrobeAuthoredIdentity = JSON.stringify(
    serializeWardrobe(wardrobeState, { autoHideOriginal: wardrobeAutoHide }) ?? null,
  );
  const wardrobeInteractionLocked = isCapturing;

  // Avatar Forge applies body proportions to the raw/skinned rig in its passive effect. Measure
  // on the following animation frame so the wardrobe shares the exact same body authority.
  useEffect(() => {
    if (!vrm) return;
    const frame = requestAnimationFrame(() => {
      if (vrmRef.current !== vrm) return;
      setWardrobeMetrics(measureVrmWardrobeMetrics(vrm));
    });
    return () => cancelAnimationFrame(frame);
  }, [avatarForgeState.body, vrm]);
  // 물리(studio-vrm-physics) — 스프링본 설정 + 미리보기/조인트 수.
  const [vrmPhysics, setVrmPhysics] = useState<VrmPhysicsSettings>(DEFAULT_VRM_PHYSICS);
  const [physicsPreview, setPhysicsPreview] = useState(false);
  const [springJointCount, setSpringJointCount] = useState(0);
  // 대기 애니메이션 (숨쉬기 및 자동 깜빡임)
  const [idleAnimation, setIdleAnimation] = useState(false);
  // 웹캠 페이스 트래킹 (studio-vrm-webcam-tracking)
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamLoading, setWebcamLoading] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [trackingOptions, setTrackingOptions] = useState<TrackingOptions>(DEFAULT_TRACKING_OPTIONS);
  const [browserPermissionState, setBrowserPermissionState] = useState<"granted" | "denied" | "prompt" | "unsupported">("prompt");
  // 정면 캘리브레이션 UI 상태(studio-vrm-tracking-calibration).
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationCountdown, setCalibrationCountdown] = useState(0);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  // 얼굴 미검출 장기화(~5초) 힌트 배지.
  const [faceLostLong, setFaceLostLong] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  // 트래킹 루프 상태 — 전부 ref(렌더 경로에서 변이 금지, 루프/effect 내부에서만 변이).
  const channelSmootherRef = useRef(createChannelSmoother());
  const blinkStabilizerRef = useRef(new BlinkStabilizer());
  const qualityRef = useRef<AdaptiveQualityController | null>(null);
  const calibrationRef = useRef<TrackingCalibration | null>(null);
  const calibrationSamplerRef = useRef<CalibrationSampler | null>(null);
  const faceLostFramesRef = useRef(0);
  const faceLostLongRef = useRef(false);
  const lastChannelsRef = useRef<TrackingChannels | null>(null);
  const lastPoseBonesRef = useRef<Record<string, readonly [number, number, number]>>({});
  const lastFingersRef = useRef<Record<string, readonly [number, number, number]> | null>(null);
  const frameIndexRef = useRef(0);
  const webcamActiveRef = useRef(false);
  const idleAnimationRef = useRef(false);
  const dynamicPoseGenerationRef = useRef(0);
  const dynamicPoseStateRef = useRef({ webcamActive: false, idleAnimation: false });
  const trackingDataRef = useRef<VrmTrackingData | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const texturePaintRuntimeRef = useRef<StudioVrmTexturePaintRuntime | null>(null);
  const texturePaintSnapshotRef = useRef<StudioVrmTexturePaintRuntimeSnapshot | null>(null);
  const texturePaintInvalidateRef = useRef<(() => void) | null>(null);
  const texturePaintRestoreGenerationRef = useRef(0);
  const texturePaintRestoreAbortRef = useRef<AbortController | null>(null);
  const texturePaintMutationBlockedRef = useRef(false);
  const wardrobeMutationBlockedRef = useRef(false);
  const wardrobeAuthoredIdentityRef = useRef(wardrobeAuthoredIdentity);
  const loadRequestRef = useRef(0);
  const thumbnailRequestRef = useRef(0);
  const insertCaptureGenerationRef = useRef(0);
  const insertCaptureFrameRef = useRef<number | null>(null);
  const insertCaptureAbortRef = useRef<AbortController | null>(null);
  const sharePoseAbortRef = useRef<AbortController | null>(null);
  const sharedPoseListRequestRef = useRef(0);
  const sharedPoseSelectionRequestRef = useRef(0);
  const sharedPoseCatalogAbortRef = useRef<AbortController | null>(null);
  const sharedPoseSelectAbortRef = useRef<AbortController | null>(null);
  const captureRef = useRef<CaptureState>({ camera: null, gl: null, scene: null });
  const captureRequestRef = useRef(0);
  const pendingCameraRestoreRef = useRef<StudioVrmCameraSettings | null>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const manualPoseDetailsRef = useRef<HTMLDetailsElement>(null);
  const jointIkTransactionRef = useRef<StudioVrmIkTransaction | null>(null);
  const jointIkRevisionRef = useRef(0);
  const persistentIkReconcileRevisionRef = useRef(0);
  const persistentIkResolvedSignatureRef = useRef("");
  const persistentIkCurrentSignatureRef = useRef("");
  const garmentEvaluationGenerationRef = useRef(0);
  const garmentEvaluationReceiptRef = useRef<StudioVrmGarmentEvaluationReceipt | null>(null);
  const pendingPersistentIkCommandRef = useRef<PendingStudioVrmPersistentIkCommand | null>(null);
  const [persistentIkReconciling, setPersistentIkReconciling] = useState(false);
  const [captureSceneGeneration, setCaptureSceneGeneration] = useState(0);
  // 캡처(투명 PNG 삽입) 순간에만 발밑 타원 그림자·배경 환경을 꺼서 캐릭터만 남긴다 — React state가
  // 아니라 three.js 객체를 직접 명령형으로 토글해야 gl.render() 호출 전에 확실히 반영된다(state
  // 갱신은 다음 R3F 커밋을 기다려야 해서 같은 프레임 안에서 타이밍을 보장할 수 없다).
  const groundShadowRef = useRef<THREE.Mesh>(null);
  const envRootRef = useRef<THREE.Group | null>(null);
  const captureHelperLeaseCountRef = useRef(0);

  const acquireVrmCaptureHelperLease = useCallback((options?: {
    readonly subjectOnly?: boolean;
  }): (() => void) => {
    const subjectOnly = options?.subjectOnly !== false;
    captureHelperLeaseCountRef.current += 1;
    if (groundShadowRef.current) groundShadowRef.current.visible = false;
    if (subjectOnly && envRootRef.current) envRootRef.current.visible = false;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      captureHelperLeaseCountRef.current = Math.max(0, captureHelperLeaseCountRef.current - 1);
      if (captureHelperLeaseCountRef.current === 0) {
        if (groundShadowRef.current) groundShadowRef.current.visible = true;
        // Env is always visible in the interactive viewport; only capture temporarily hides it.
        if (envRootRef.current) envRootRef.current.visible = true;
      }
    };
  }, []);

  useEffect(() => {
    texturePaintRuntimeRef.current = null;
    texturePaintSnapshotRef.current = null;
    setTexturePaintRuntime(null);
    setTexturePaintRuntimeSceneIdentity(null);
    setTexturePaintSnapshot(null);
    if (!vrm) return;

    const runtime = createStudioVrmTexturePaintRuntime(
      vrm.scene,
      texturePaintDevicePlan.runtimeOptions,
    );
    texturePaintRuntimeRef.current = runtime;
    setTexturePaintRuntime(runtime);
    setTexturePaintRuntimeSceneIdentity(texturePaintSceneIdentity);
    const initialSnapshot = runtime.getSnapshot();
    texturePaintSnapshotRef.current = initialSnapshot;
    setTexturePaintSnapshot(initialSnapshot);
    const unsubscribe = runtime.subscribe((snapshot) => {
      texturePaintSnapshotRef.current = snapshot;
      setTexturePaintSnapshot(snapshot);
      texturePaintInvalidateRef.current?.();
    });

    return () => {
      unsubscribe();
      if (texturePaintRuntimeRef.current === runtime) {
        texturePaintRuntimeRef.current = null;
        texturePaintSnapshotRef.current = null;
      }
      runtime.dispose();
    };
  }, [texturePaintDevicePlan, texturePaintSceneIdentity, vrm]);

  // 라이브러리 썸네일처럼 모델의 본질과 무관한 필드가 바뀌어도 복원을 취소하지 않는다.
  // active id는 로드 시작 때 먼저 바뀌므로 실제로 install된 VRM id까지 함께 확인해 이전
  // 런타임에 새 scene의 표면 텍스처를 적용하는 협업/원격 갱신 race도 막는다.
  const activeTexturePaintRestoreEntry =
    libraryEntries.find((entry) => entry.id === activeModelId) ?? null;
  const texturePaintRestoreModelMatches = Boolean(
    initialScene
    && installedModelId === activeModelId
    && (
      initialScene.model.source === "bundled"
        ? activeTexturePaintRestoreEntry?.source === "sample"
          && activeTexturePaintRestoreEntry.id === initialScene.model.id
        : activeTexturePaintRestoreEntry?.source === "indexed-db"
          && canonicalizeVrmContentHash(activeTexturePaintRestoreEntry.contentHash)
            === initialScene.model.hash
    ),
  );

  useEffect(() => {
    texturePaintRestoreGenerationRef.current += 1;
    const generation = texturePaintRestoreGenerationRef.current;
    texturePaintRestoreAbortRef.current?.abort();
    texturePaintRestoreAbortRef.current = null;
    setTexturePaintPersistenceError("");

    if (
      !open
      || !initialScene
      || !texturePaintRuntime
      || !vrm
      || texturePaintRuntimeSceneIdentity !== texturePaintSceneIdentity
    ) {
      setTexturePaintPersistenceStatus(initialScene ? "idle" : "ready");
      return;
    }
    if (initialScene.surfacePaint.textures.length === 0) {
      setTexturePaintPersistenceStatus("ready");
      return;
    }
    if (!texturePaintRestoreModelMatches) {
      setTexturePaintPersistenceStatus("idle");
      return;
    }

    const controller = new AbortController();
    texturePaintRestoreAbortRef.current = controller;
    setTexturePaintPersistenceStatus("restoring");
    void import("./studio-vrm-texture-paint-persistence")
      .then(({ rehydrateStudioVrmTexturePaintRuntime }) =>
        rehydrateStudioVrmTexturePaintRuntime(
          texturePaintRuntime,
          initialScene.surfacePaint,
          { signal: controller.signal },
        )
      )
      .then(() => {
        if (
          controller.signal.aborted
          || generation !== texturePaintRestoreGenerationRef.current
          || texturePaintRuntimeRef.current !== texturePaintRuntime
        ) return;
        setTexturePaintPersistenceStatus("ready");
        texturePaintInvalidateRef.current?.();
      })
      .catch((cause: unknown) => {
        if (
          controller.signal.aborted
          || generation !== texturePaintRestoreGenerationRef.current
          || texturePaintRuntimeRef.current !== texturePaintRuntime
        ) return;
        setTexturePaintPersistenceStatus("error");
        setTexturePaintPersistenceError(getErrorMessage(
          cause,
          "저장된 표면 페인팅 원본을 복원하지 못했습니다.",
        ));
      });

    return () => {
      controller.abort();
      if (texturePaintRestoreAbortRef.current === controller) {
        texturePaintRestoreAbortRef.current = null;
      }
    };
  }, [
    initialScene,
    open,
    texturePaintRuntime,
    texturePaintRestoreModelMatches,
    texturePaintRestoreRetryToken,
    vrm,
    texturePaintRuntimeSceneIdentity,
    texturePaintSceneIdentity,
  ]);

  const cancelPendingInsertCapture = useCallback((): void => {
    insertCaptureGenerationRef.current += 1;
    insertCaptureAbortRef.current?.abort();
    insertCaptureAbortRef.current = null;
    texturePaintMutationBlockedRef.current = false;
    wardrobeMutationBlockedRef.current = false;
    if (insertCaptureFrameRef.current !== null) {
      cancelAnimationFrame(insertCaptureFrameRef.current);
      insertCaptureFrameRef.current = null;
    }
  }, []);

  const cancelPendingPoseShare = useCallback((): void => {
    const controller = sharePoseAbortRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
  }, []);

  const cancelPendingSharedPoseCatalog = useCallback((): void => {
    sharedPoseListRequestRef.current += 1;
    const controller = sharedPoseCatalogAbortRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
    sharedPoseCatalogAbortRef.current = null;
  }, []);

  const cancelPendingSharedPoseSelection = useCallback((): void => {
    sharedPoseSelectionRequestRef.current += 1;
    const controller = sharedPoseSelectAbortRef.current;
    if (controller && !controller.signal.aborted) controller.abort();
    sharedPoseSelectAbortRef.current = null;
    setSharedPoseSelectionAssetId(null);
  }, []);

  const loadSharedPoseCatalog = useCallback(async (offset = 0, append = false): Promise<void> => {
    const controller = new AbortController();
    const requestId = sharedPoseListRequestRef.current + 1;
    sharedPoseListRequestRef.current = requestId;
    sharedPoseCatalogAbortRef.current = controller;
    const expectedOffset = Math.max(0, offset);
    if (!append) {
      setSharedPoses([]);
      setSharedPoseHasMore(false);
      setSharedPoseNextOffset(null);
    }
    setSharedPosesStatus("loading");

    try {
      const page = await listSharedAssetCatalog({
        kind: "vrm_pose",
        limit: 20,
        offset: expectedOffset,
      }, controller.signal);

      if (controller.signal.aborted || sharedPoseListRequestRef.current !== requestId) return;
      const items = selectSharedPoseAssets(page.items);
      setSharedPoses((current) => append
        ? [...current.filter((item) => !items.some((next) => next.id === item.id)), ...items]
        : items);
      setSharedPoseHasMore(page.hasMore);
      setSharedPoseNextOffset(normalizeCatalogNextOffset(expectedOffset, page));
      setSharedPosesStatus("idle");
    } catch {
      if (controller.signal.aborted || sharedPoseListRequestRef.current !== requestId) return;
      // The remote library is optional. Keep local poser usable and surface a retry affordance.
      setSharedPoseHasMore(false);
      setSharedPoseNextOffset(null);
      setSharedPosesStatus("error");
    } finally {
      if (sharedPoseCatalogAbortRef.current === controller) {
        sharedPoseCatalogAbortRef.current = null;
      }
    }
  }, []);

  async function loadMoreSharedPoses(): Promise<void> {
    if (!sharedPoseNextOffset || !sharedPoseHasMore || sharedPosesStatus === "loading") return;
    await loadSharedPoseCatalog(sharedPoseNextOffset, true);
  }

  async function handleSelectSharedPose(asset: SharedAssetCatalogItem): Promise<void> {
    cancelPendingSharedPoseSelection();
    setSharedPoseSelectionAssetId(asset.id);
    const requestId = sharedPoseSelectionRequestRef.current + 1;
    sharedPoseSelectionRequestRef.current = requestId;
    const controller = new AbortController();
    sharedPoseSelectAbortRef.current = controller;
    const generation = sharedPoseSelectionRequestRef.current;

    try {
      const content = await getSharedAssetContent(asset.id, controller.signal);
      if (
        controller.signal.aborted ||
        sharedPoseSelectionRequestRef.current !== requestId ||
        generation !== requestId ||
        content.kind !== "vrm_pose" ||
        content.id !== asset.id
      ) {
        return;
      }

      const ok = loadHandlers.handleSelectSharedPose(content);
      if (!ok) return;
      if (
        controller.signal.aborted ||
        sharedPoseSelectionRequestRef.current !== requestId ||
        generation !== requestId
      ) return;
      setActivePoseId(`shared-${asset.id}`);
      setSharedPoseSelectionAssetId(null);
      void markSharedAssetUsed(asset.id);
      alert(`공유된 포즈 '${asset.name.replace("[3D_POSE] ", "")}'를 적용했습니다.`);
    } catch (caughtError: unknown) {
      if (
        controller.signal.aborted ||
        sharedPoseSelectionRequestRef.current !== requestId ||
        generation !== requestId
      ) return;
      console.error(caughtError);
      alert("공유 포즈를 불러오지 못했습니다.");
    } finally {
      if (sharedPoseSelectAbortRef.current === controller) {
        sharedPoseSelectAbortRef.current = null;
        setSharedPoseSelectionAssetId((current) => (current === asset.id ? null : current));
      }
    }
  }

  async function handleDeleteSharedPose(asset: SharedAssetCatalogItem, e: MouseEvent<HTMLButtonElement>): Promise<void> {
    e.stopPropagation();
    if (!globalThis.confirm(`공유된 포즈 '${asset.name.replace("[3D_POSE] ", "")}'를 서버에서 삭제하시겠습니까?`)) {
      return;
    }
    cancelPendingSharedPoseSelection();
    try {
      await deleteSharedAsset(asset.id);
      alert("공유된 포즈가 성공적으로 삭제되었습니다.");
      setSharedPoseReloadToken((token) => token + 1);
      setSharedPoseHasMore(false);
      setSharedPoseNextOffset(null);
    } catch (err) {
      console.error(err);
      alert("삭제에 실패했습니다.");
    }
  }

  const handlePanelTabChange = useCallback((tab: PanelTab) => {
    setActivePanelTab(tab);
    if (tab !== "character") setTexturePaintEyedropperActive(false);
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
  }, []);

  const handleCharacterSectionChange = (section: CharacterPanelSection) => {
    setActiveCharacterSection(section);
    if (section !== "surface") setTexturePaintEyedropperActive(false);
    if (section === "surface") {
      setTurntable(false);
      setMannequinMode(false);
    }
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
  };

  // 탭 키보드 내비게이션(WAI-ARIA Tabs 패턴): 좌우 방향키 + Home/End. 포커스는 탭 버튼에 둔다.
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = PANEL_TABS.findIndex((t) => t.id === activePanelTab);
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % PANEL_TABS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + PANEL_TABS.length) % PANEL_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = PANEL_TABS.length - 1;
    else return;
    e.preventDefault();
    const nextTab = PANEL_TABS[next];
    handlePanelTabChange(nextTab.id);
    document.getElementById(`vrm-tab-${nextTab.id}`)?.focus();
  };

  const handleCharacterTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = CHARACTER_PANEL_SECTIONS.findIndex((section) => section.id === activeCharacterSection);
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % CHARACTER_PANEL_SECTIONS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + CHARACTER_PANEL_SECTIONS.length) % CHARACTER_PANEL_SECTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = CHARACTER_PANEL_SECTIONS.length - 1;
    else return;
    e.preventDefault();
    const nextSection = CHARACTER_PANEL_SECTIONS[next];
    handleCharacterSectionChange(nextSection.id);
    document.getElementById(`vrm-character-subtab-${nextSection.id}`)?.focus();
  };

  const handleViewportReady = useCallback((api: ViewportApi | null) => {
    viewportApiRef.current = api;
  }, []);

  const handleTexturePaintInvalidateReady = useCallback(
    (requestFrame: (() => void) | null) => {
      texturePaintInvalidateRef.current = requestFrame;
    },
    [],
  );

  const handleTexturePaintSettingsChange = useCallback(
    (update: StudioVrmTexturePaintSettingsUpdate) => {
      if (update.tool !== undefined) setTexturePaintEyedropperActive(false);
      setTexturePaintSettings((current) => {
        const brushKind = update.brushKind ?? current.brushKind;
        const brushChanged =
          update.brushKind !== undefined && update.brushKind !== current.brushKind;
        const defaults = STUDIO_STAMP_BRUSH_DEFAULTS[brushKind];
        const tuning = brushChanged
          ? {
              flow: defaults.flow,
              hardness: defaults.hardness,
              minSize: defaults.minSizeRatio,
              ...update.tuning,
            }
          : {
              ...current.tuning,
              ...update.tuning,
            };
        return {
          ...current,
          ...update,
          brushKind,
          tuning,
        };
      });
    },
    [],
  );

  const handleTexturePaintColorSampled = useCallback((color: string) => {
    setTexturePaintSettings((current) => ({ ...current, color }));
  }, []);

  const handleTexturePaintUndo = useCallback(() => {
    if (texturePaintMutationBlockedRef.current) return;
    const result = texturePaintRuntimeRef.current?.undo();
    if (result?.ok && result.value) texturePaintInvalidateRef.current?.();
  }, []);

  const handleTexturePaintRedo = useCallback(() => {
    if (texturePaintMutationBlockedRef.current) return;
    const result = texturePaintRuntimeRef.current?.redo();
    if (result?.ok && result.value) texturePaintInvalidateRef.current?.();
  }, []);

  const handleTexturePaintReset = useCallback(() => {
    if (texturePaintMutationBlockedRef.current) return;
    const result = texturePaintRuntimeRef.current?.resetActiveTarget();
    if (result?.ok && result.value) texturePaintInvalidateRef.current?.();
  }, []);

  const cancelActiveTexturePaintStroke = useCallback(() => {
    const pointerId = texturePaintSnapshotRef.current?.activePointerId;
    if (typeof pointerId !== "number") return;
    const result = texturePaintRuntimeRef.current?.cancelStroke(pointerId);
    if (result?.ok && result.value) texturePaintInvalidateRef.current?.();
  }, []);

  const zoomViewport = useCallback((factor: number) => {
    viewportApiRef.current?.zoomBy(factor);
    setViewportHinted(true);
  }, []);

  const handleViewReset = useCallback(() => {
    setViewResetNonce((n) => n + 1);
    setViewportHinted(true);
  }, []);

  const currentPersistentIkSignature = useCallback((overrides: Partial<Pick<
    StudioVrmPersistentIkSignatureInput,
    "bones" | "fingerEdits" | "yOffset" | "translations" | "constraints"
  >> = {}): string => {
    return buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: overrides.bones ?? customBones,
      fingerEdits: overrides.fingerEdits ?? fingerEdits,
      yOffset: overrides.yOffset ?? customYOffset,
      translations: overrides.translations ?? poseTranslations,
      bodyRotation,
      bodyScale,
      constraints: overrides.constraints ?? ikConstraints,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
  }, [
    activeModelId,
    bodyRotation,
    bodyScale,
    customBones,
    customYOffset,
    fingerEdits,
    footPlantEnabled,
    fullBodyIkEnabled,
    ikConstraints,
    lockedPoseBones,
    poseTranslations,
    rigFloorHeight,
    rigJointProfile,
  ]);
  useLayoutEffect(() => {
    persistentIkCurrentSignatureRef.current = currentPersistentIkSignature();
  }, [currentPersistentIkSignature]);
  useLayoutEffect(() => {
    garmentEvaluationGenerationRef.current += 1;
    wardrobeAuthoredIdentityRef.current = wardrobeAuthoredIdentity;
    garmentEvaluationReceiptRef.current = createStudioVrmGarmentEvaluationReceipt({
      modelId: activeModelId,
      poseSignature: currentPersistentIkSignature(),
      generation: garmentEvaluationGenerationRef.current,
      report: inspectStudioVrmGarmentFit(wardrobeState, wardrobeMetrics),
    });
  }, [
    activeModelId,
    currentPersistentIkSignature,
    wardrobeAuthoredIdentity,
    wardrobeMetrics,
    wardrobeState,
  ]);
  useLayoutEffect(() => {
    const previous = dynamicPoseStateRef.current;
    if (
      previous.webcamActive !== webcamActive
      || previous.idleAnimation !== idleAnimation
    ) {
      dynamicPoseGenerationRef.current += 1;
      dynamicPoseStateRef.current = { webcamActive, idleAnimation };
    }
    webcamActiveRef.current = webcamActive;
    idleAnimationRef.current = idleAnimation;
  }, [idleAnimation, webcamActive]);

  const persistentIkCaptureIsReady = useCallback((): boolean => {
    const hasLockedConstraint = ikConstraints.some((constraint) => (
      constraint.enabled && constraint.locked
    ));
    return !hasLockedConstraint
      || persistentIkResolvedSignatureRef.current === currentPersistentIkSignature();
  }, [currentPersistentIkSignature, ikConstraints]);

  function handleJointHandleSelect(bone: StudioVrmJointHandleBone) {
    setSelectedIkPole(null);
    setSelectedJointHandle(bone);
    const category = categoryForStudioVrmJointHandle(bone);
    if (category) setActiveCategory(category);
    handlePanelTabChange("pose");
    if (manualPoseDetailsRef.current) manualPoseDetailsRef.current.open = true;
    requestAnimationFrame(() => {
      document.getElementById(`vrm-manual-bone-${bone}`)?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }

  function handleJointHandlePoleSelect(effector: StudioVrmIkEffectorBone) {
    setSelectedJointHandle(effector);
    setSelectedIkPole(effector);
    setActiveCategory(categoryForStudioVrmJointHandle(effector) ?? "torso");
    handlePanelTabChange("pose");
    setJointHandleStatus(
      `${BONE_LABELS[effector] ?? effector} IK 폴 선택 · 팔꿈치·무릎이 향할 방향을 조절합니다.`,
    );
  }

  function cancelJointIkTransaction(options: {
    forceInvalidate?: boolean;
    restoreBaseline?: boolean;
    remountHandles?: boolean;
    status?: string;
  } = {}) {
    const {
      forceInvalidate = false,
      restoreBaseline = true,
      remountHandles = true,
      status: nextStatus,
    } = options;
    const transaction = jointIkTransactionRef.current;
    if (!forceInvalidate && !transaction && !jointHandleInteracting) {
      if (nextStatus !== undefined) setJointHandleStatus(nextStatus);
      return;
    }
    jointIkRevisionRef.current += 1;
    jointIkTransactionRef.current = null;
    if (restoreBaseline && transaction?.vrm === vrmRef.current) {
      applyStudioVrmRotationPose(transaction.vrm, transaction.baseline, bodyScale);
    }
    setJointHandleInteracting(false);
    if (remountHandles) {
      // Child handles own pointer capture/drag refs. Remounting invalidates an in-flight pointer-up
      // after undo, model/config changes, or reset so it cannot recreate and commit stale preview.
      setJointHandleSessionGeneration((generation) => generation + 1);
    }
    if (nextStatus !== undefined) setJointHandleStatus(nextStatus);
  }

  function previewJointHandleIk(
    effector: StudioVrmIkEffectorBone,
    worldPosition: StudioVrmJointWorldPoint,
    options: {
      control?: StudioVrmIkHandleControl;
      poleWorld?: StudioVrmJointWorldPoint;
    } = {},
  ): StudioVrmUserIkResult | StudioVrmFullBodyIkResult | null {
    const currentVrm = vrmRef.current;
    const coordinateScene = captureRef.current.scene;
    if (!currentVrm || !coordinateScene || webcamActive || idleAnimation || isCapturing) {
      setJointHandleStatus("실시간 추적·대기 애니메이션·캡처 중에는 관절 핸들을 편집할 수 없습니다.");
      return null;
    }
    const control = options.control ?? "target";
    const targetLocal = studioVrmWorldPointToSceneLocal(coordinateScene, worldPosition);
    const canonicalTarget = targetLocal
      ? studioVrmSceneLocalPointToWorld(coordinateScene, targetLocal)
      : null;
    const poleLocal = options.poleWorld
      ? studioVrmWorldPointToSceneLocal(coordinateScene, options.poleWorld)
      : null;
    const canonicalPole = poleLocal
      ? studioVrmSceneLocalPointToWorld(coordinateScene, poleLocal)
      : null;
    if (!canonicalTarget || (options.poleWorld && !canonicalPole)) {
      const activeTransaction = jointIkTransactionRef.current;
      if (activeTransaction?.vrm === currentVrm) {
        applyStudioVrmRotationPose(currentVrm, activeTransaction.baseline, bodyScale);
        activeTransaction.latest = null;
      }
      setJointHandleStatus("IK 목표 또는 폴 좌표가 장면 안전 범위를 벗어나 시작 자세로 되돌렸습니다.");
      return null;
    }
    const targetWorld = new THREE.Vector3(
      canonicalTarget[0],
      canonicalTarget[1],
      canonicalTarget[2],
    );
    const poleWorldOverride = canonicalPole
      ? new THREE.Vector3(canonicalPole[0], canonicalPole[1], canonicalPole[2])
      : undefined;
    const chain = STUDIO_VRM_USER_IK_CHAINS[effector];
    if ([chain.upper, chain.lower, chain.end].some((boneName) => lockedPoseBones.includes(boneName))) {
      setJointHandleStatus("잠긴 관절이 포함된 손·발 체인은 IK로 움직일 수 없습니다. 먼저 해당 관절의 잠금을 해제해 주세요.");
      return null;
    }
    if (footPlantEnabled) {
      const plantedLegBones = (["leftFoot", "rightFoot"] as const).flatMap((plantedFoot) => {
        const plantedChain = STUDIO_VRM_USER_IK_CHAINS[plantedFoot];
        return [plantedChain.upper, plantedChain.lower, plantedChain.end];
      });
      if (plantedLegBones.some((boneName) => lockedPoseBones.includes(boneName))) {
        setJointHandleStatus("양발 고정에 참여하는 다리에 잠긴 관절이 있습니다. 다리 잠금을 해제하거나 양발 고정을 꺼 주세요.");
        return null;
      }
    }

    let transaction = jointIkTransactionRef.current;
    if (
      !transaction
      || transaction.vrm !== currentVrm
      || transaction.coordinateScene !== coordinateScene
      || transaction.effector !== effector
      || transaction.control !== control
      || transaction.revision !== jointIkRevisionRef.current
    ) {
      if (transaction) {
        applyStudioVrmRotationPose(transaction.vrm, transaction.baseline, bodyScale);
      }
      const baseline = bakeStudioVrmRuntimePose(currentVrm);
      if (!baseline) {
        setJointHandleStatus("이 캐릭터의 현재 관절 자세를 읽지 못했습니다.");
        return null;
      }
      transaction = {
        vrm: currentVrm,
        coordinateScene,
        effector,
        control,
        revision: jointIkRevisionRef.current,
        authoritativeSignature: currentPersistentIkSignature(),
        baseline: {
          ...baseline,
          translations: cloneStudioVrmPoseTranslations(poseTranslations),
        },
        targetWorld: targetWorld.clone(),
        poleWorld: poleWorldOverride ?? (() => {
          const persistedPole = ikConstraints.find((constraint) => (
            constraint.effector === effector && constraint.enabled
          ))?.pole;
          const worldPole = persistedPole
            ? studioVrmSceneLocalPointToWorld(coordinateScene, persistedPole)
            : null;
          return worldPole
            ? new THREE.Vector3(worldPole[0], worldPole[1], worldPole[2])
            : createStudioVrmIkPole(currentVrm, effector);
        })(),
        latest: null,
      };
      jointIkTransactionRef.current = transaction;
    } else {
      // 매 move를 직전 preview가 아닌 같은 시작 자세에서 다시 풀어 누적 오차와 관절 뒤집힘을 막는다.
      applyStudioVrmRotationPose(currentVrm, transaction.baseline, bodyScale);
      transaction.targetWorld.copy(targetWorld);
      if (poleWorldOverride) transaction.poleWorld = poleWorldOverride;
    }

    const lockedTargets: Array<{
      effector: StudioVrmIkEffectorBone;
      targetWorld: THREE.Vector3;
      poleWorld?: THREE.Vector3;
    }> = [];
    for (const constraint of ikConstraints) {
      if (!constraint.enabled || !constraint.locked || constraint.effector === effector) continue;
      const lockedChain = STUDIO_VRM_USER_IK_CHAINS[constraint.effector];
      if (
        [lockedChain.upper, lockedChain.lower, lockedChain.end]
          .some((boneName) => lockedPoseBones.includes(boneName))
      ) {
        applyStudioVrmRotationPose(currentVrm, transaction.baseline, bodyScale);
        transaction.latest = null;
        setJointHandleStatus("유지 중인 고정점 체인에 잠긴 관절이 있습니다. 관절 잠금 또는 고정점 유지를 해제해 주세요.");
        return null;
      }
      const target = studioVrmSceneLocalPointToWorld(coordinateScene, constraint.target);
      const pole = constraint.pole
        ? studioVrmSceneLocalPointToWorld(coordinateScene, constraint.pole)
        : null;
      if (!target || (constraint.pole && !pole)) {
        applyStudioVrmRotationPose(currentVrm, transaction.baseline, bodyScale);
        transaction.latest = null;
        setJointHandleStatus("유지 중인 고정점의 장면 좌표를 해석하지 못해 IK 계산을 중단했습니다.");
        return null;
      }
      lockedTargets.push({
        effector: constraint.effector,
        targetWorld: new THREE.Vector3(target[0], target[1], target[2]),
        poleWorld: pole ? new THREE.Vector3(pole[0], pole[1], pole[2]) : undefined,
      });
    }
    const result = fullBodyIkEnabled || footPlantEnabled || lockedTargets.length > 0
      ? solveStudioVrmFullBodyIk(currentVrm, {
          primary: {
            effector,
            targetWorld,
            poleWorld: transaction.poleWorld,
          },
          baseTranslations: transaction.baseline.translations,
          jointProfile: rigJointProfile,
          fullBodyIk: fullBodyIkEnabled,
          footPlant: {
            enabled: footPlantEnabled,
            floorHeight: rigFloorHeight,
          },
          lockedTargets,
        })
      : solveStudioVrmUserIk(currentVrm, {
          effector,
          targetWorld,
          poleWorld: transaction.poleWorld,
          jointProfile: rigJointProfile,
          fullBodyIk: false,
          footPlant: false,
        });
    if (!result) {
      applyStudioVrmRotationPose(currentVrm, transaction.baseline, bodyScale);
      transaction.latest = null;
      setJointHandleStatus("선택한 손·발의 IK 체인을 계산하지 못했습니다. 모델의 휴머노이드 본 구성을 확인해 주세요.");
      return null;
    }
    if (!canCommitStudioVrmIkResult(result)) {
      applyStudioVrmRotationPose(currentVrm, transaction.baseline, bodyScale);
      transaction.latest = null;
      setJointHandleStatus(STUDIO_VRM_IK_NOT_CONVERGED_STATUS);
      return null;
    }

    transaction.latest = result;
    applyStudioVrmRotationPose(currentVrm, {
      ...result,
      translations: "translations" in result
        ? result.translations
        : transaction.baseline.translations,
    }, bodyScale);
    setJointHandleStatus(
      "constraints" in result
        ? result.constraints.length > 1
          ? `다중 체인 ${result.constraints.length}개를 ${result.iterations}회 반복 계산 중 · 양발 고정과 활성 ${STUDIO_VRM_USER_IK_CHAINS[effector].kind === "hand" ? "손" : "발"} 목표를 함께 유지합니다.`
          : "전신 이동과 활성 IK 체인을 함께 미리 보는 중입니다."
        : result.clamped
        ? "목표가 팔·다리 길이를 벗어나 도달 가능한 최대 위치에서 미리 보는 중입니다."
        : result.limited
          ? "관절 보호 범위 안으로 부드럽게 제한해 미리 보는 중입니다."
          : "IK 자세 미리보기 · 놓으면 한 번만 포즈에 적용됩니다.",
    );
    return result;
  }

  function handleJointHandleIkCommit(
    effector: StudioVrmIkEffectorBone,
    worldPosition: StudioVrmJointWorldPoint,
    control: StudioVrmIkHandleControl = "target",
  ) {
    let transaction = jointIkTransactionRef.current;
    if (
      !transaction
      || transaction.effector !== effector
      || transaction.control !== control
      || !transaction.latest
    ) {
      if (control === "pole") {
        previewJointHandlePole(effector, worldPosition);
      } else {
        previewJointHandleIk(effector, worldPosition);
      }
      transaction = jointIkTransactionRef.current;
    }
    const result = transaction?.latest;
    const currentVrm = vrmRef.current;
    if (result && !canCommitStudioVrmIkResult(result)) {
      cancelJointIkTransaction({
        restoreBaseline: true,
        remountHandles: false,
        status: STUDIO_VRM_IK_NOT_CONVERGED_STATUS,
      });
      return;
    }
    if (
      !result
      || !currentVrm
      || transaction?.vrm !== currentVrm
      || transaction.coordinateScene !== captureRef.current.scene
      || transaction.revision !== jointIkRevisionRef.current
    ) {
      cancelJointIkTransaction({ remountHandles: false });
      return;
    }

    const nextFingers = extractStudioVrmFingerRotations(result.bones);
    const nextBones = stripFingerBones(result.bones);
    const nextTranslations = "translations" in result
      ? result.translations
      : transaction.baseline.translations;
    const persistedTargetWorld = "constraints" in result
      ? result.constraints.find((constraint) => constraint.effector === effector)?.targetWorld
      : ([
          transaction.targetWorld.x,
          transaction.targetWorld.y,
          transaction.targetWorld.z,
        ] as const);
    const targetLocal = persistedTargetWorld
      ? studioVrmWorldPointToSceneLocal(transaction.coordinateScene, persistedTargetWorld)
      : null;
    const poleLocal = transaction.poleWorld
      ? studioVrmWorldPointToSceneLocal(transaction.coordinateScene, transaction.poleWorld)
      : null;
    if (!targetLocal || (transaction.poleWorld && !poleLocal)) {
      cancelJointIkTransaction({ remountHandles: false });
      setJointHandleStatus("IK 목표를 장면 좌표로 저장하지 못했습니다.");
      return;
    }
    const existingConstraint = ikConstraints.find((constraint) => constraint.effector === effector);
    const nextConstraints = upsertStudioVrmIkConstraint(ikConstraints, {
      effector,
      enabled: true,
      locked: existingConstraint?.locked ?? true,
      target: targetLocal,
      pole: poleLocal,
    });
    const before = captureFullState();
    const after = serializeFullVrmState({
      ...before,
      poseId: "manual-ik",
      bones: nextBones,
      fingerOverrides: nextFingers,
      yOffset: result.yOffset,
      poseTranslations: nextTranslations,
      ikConstraints: nextConstraints,
    });
    persistentIkResolvedSignatureRef.current = currentPersistentIkSignature({
      bones: nextBones,
      fingerEdits: nextFingers,
      yOffset: result.yOffset,
      translations: nextTranslations,
      constraints: nextConstraints,
    });
    setPersistentIkReconciling(false);
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    jointIkRevisionRef.current += 1;
    jointIkTransactionRef.current = null;
    setActivePoseId("manual-ik");
    setCustomBones(nextBones);
    setFingerEdits(nextFingers);
    setCustomYOffset(result.yOffset);
    setPoseTranslations(cloneStudioVrmPoseTranslations(nextTranslations));
    setIkConstraints(nextConstraints);
    setSelectedJointHandle(effector);
    setSelectedIkPole(control === "pole" ? effector : null);
    setJointHandleInteracting(false);
    applyStudioVrmRotationPose(currentVrm, {
      ...result,
      translations: nextTranslations,
    }, bodyScale);
    setJointHandleStatus(
      `${BONE_LABELS[effector] ?? effector} IK ${control === "pole" ? "폴 방향" : "목표"} 적용 완료${"constraints" in result ? ` · ${result.constraints.length}개 체인 동시 반영` : ""}${result.clamped ? " · 도달/이동 범위에서 제한됨" : result.limited ? " · 관절 범위에서 제한됨" : ""}`,
    );
  }

  function previewJointHandlePole(
    effector: StudioVrmIkEffectorBone,
    poleWorld: StudioVrmJointWorldPoint,
  ): StudioVrmUserIkResult | StudioVrmFullBodyIkResult | null {
    const coordinateScene = captureRef.current.scene;
    const constraint = ikConstraints.find((candidate) => (
      candidate.effector === effector && candidate.enabled
    ));
    const targetWorld = coordinateScene && constraint
      ? studioVrmSceneLocalPointToWorld(coordinateScene, constraint.target)
      : null;
    if (!targetWorld) {
      setJointHandleStatus("활성 IK 목표를 찾지 못해 폴 방향을 이동할 수 없습니다.");
      return null;
    }
    return previewJointHandleIk(effector, targetWorld, {
      control: "pole",
      poleWorld,
    });
  }

  function handleJointHandlePoleCommit(
    effector: StudioVrmIkEffectorBone,
    poleWorld: StudioVrmJointWorldPoint,
  ) {
    handleJointHandleIkCommit(effector, poleWorld, "pole");
  }

  function handleJointHandleIkRollback(effector: StudioVrmIkEffectorBone) {
    const transaction = jointIkTransactionRef.current;
    if (transaction?.effector === effector) {
      cancelJointIkTransaction({
        remountHandles: false,
        status: "IK 이동을 취소하고 시작 자세로 되돌렸습니다.",
      });
    }
    setJointHandleInteracting(false);
  }

  function handleBakeCurrentPoseForManualEditing() {
    const currentVrm = vrmRef.current;
    if (!currentVrm || webcamActive || idleAnimation || isCapturing) return;
    const baked = bakeStudioVrmRuntimePose(currentVrm);
    if (!baked) {
      setJointHandleStatus("현재 자세를 관절 편집값으로 변환하지 못했습니다.");
      return;
    }
    setActivePoseId("manual-pose");
    setCustomBones(stripFingerBones(baked.bones));
    setFingerEdits(extractStudioVrmFingerRotations(baked.bones));
    setCustomYOffset(baked.yOffset);
    applyStudioVrmRotationPose(currentVrm, {
      ...baked,
      translations: poseTranslations,
    }, bodyScale);
    setJointHandleStatus("현재 보이는 자세를 회전 기반 관절 편집값으로 동기화했습니다.");
  }

  // 드래그 힌트는 모델이 준비되면 잠깐 보여 주고 일정 시간 뒤 자동으로 사라진다.
  useEffect(() => {
    if (!vrm || viewportHinted) return;
    const timer = setTimeout(() => setViewportHinted(true), 6000);
    return () => clearTimeout(timer);
  }, [vrm, viewportHinted]);

  // 캡처·공유·썸네일·웹캠 전환은 본 오버레이를 unmount한다. 네이티브 포인터 종료
  // fallback과 별개로 상위 Orbit 잠금도 즉시 해제해 어떤 전환 순서에서도 뷰포트가 남지 않는다.
  useEffect(() => {
    if (
      !vrm ||
      !showPoseBoneOverlay ||
      !viewportHandIkEnabled ||
      isCapturing ||
      isSharingPose ||
      isThumbnailCapturing ||
      webcamActive
    ) {
      setIsViewportHandIkDragging(false);
    }
  }, [
    isCapturing,
    isSharingPose,
    isThumbnailCapturing,
    showPoseBoneOverlay,
    viewportHandIkEnabled,
    vrm,
    webcamActive,
  ]);

  // 현재 편집 상태를 직렬화 가능한 전체 스냅샷으로 캡처(undo 히스토리/공유와 동일 포맷).
  const captureFullState = useCallback(
    (): FullVrmState =>
      serializeFullVrmState({
        modelId: activeModelId,
        poseId: activePoseId,
        expressionId: activeExpressionId,
        bones: customBones,
        yOffset: customYOffset,
        poseTranslations,
        ikConstraints,
        bodyRotation,
        expressionWeights,
        costume: costumeState,
        wardrobe: serializeWardrobe(wardrobeState, { autoHideOriginal: wardrobeAutoHide }),
        props: serializeVrmProps(vrmPropItems),
        sceneProps: serializeSceneProps(activeProps, propAttachments),
        physics: vrmPhysics,
        bodyScale,
        lighting,
        env: envVariant,
        fingerOverrides: fingerEdits,
        customColors,
        materialFx,
        avatarForge: serializeAvatarForgeState(avatarForgeState),
      }),
    [activeModelId, activePoseId, activeExpressionId, customBones, customYOffset, poseTranslations, ikConstraints, bodyRotation, expressionWeights, costumeState, wardrobeState, wardrobeAutoHide, vrmPropItems, activeProps, propAttachments, vrmPhysics, bodyScale, lighting, envVariant, fingerEdits, customColors, materialFx, avatarForgeState]
  );

  // A pointer transaction owns the exact React-side pose/config it started from. Any preset,
  // restore, root/body edit, pin toggle, or lock change invalidates that ownership before a late
  // pointerup can overwrite the newer authoritative edit.
  useEffect(() => {
    const transaction = jointIkTransactionRef.current;
    if (!transaction) return;
    const signature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: customBones,
      fingerEdits,
      yOffset: customYOffset,
      translations: poseTranslations,
      bodyRotation,
      bodyScale,
      constraints: ikConstraints,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    if (transaction.authoritativeSignature === signature) return;
    jointIkRevisionRef.current += 1;
    jointIkTransactionRef.current = null;
    if (transaction.vrm === vrmRef.current) {
      applyStudioVrmRotationPose(transaction.vrm, transaction.baseline, bodyScale);
    }
    setJointHandleInteracting(false);
    setJointHandleSessionGeneration((generation) => generation + 1);
    setJointHandleStatus("다른 포즈·리그 변경을 우선 적용하고 진행 중이던 IK 이동을 취소했습니다.");
  }, [
    activeModelId,
    bodyRotation,
    bodyScale,
    customBones,
    customYOffset,
    fingerEdits,
    footPlantEnabled,
    fullBodyIkEnabled,
    ikConstraints,
    lockedPoseBones,
    poseTranslations,
    rigFloorHeight,
    rigJointProfile,
  ]);

  // Any authoritative FK/root/body edit must preserve enabled locked pins immediately. Waiting
  // until the next handle drag would leave the visible target and the actual effector divergent.
  useEffect(() => {
    const lockedConstraints = ikConstraints.filter((constraint) => (
      constraint.enabled && constraint.locked
    ));
    const inputSignature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: customBones,
      fingerEdits,
      yOffset: customYOffset,
      translations: poseTranslations,
      bodyRotation,
      bodyScale,
      constraints: ikConstraints,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    const commitPendingCommand = (resolvedAfter: FullVrmState): void => {
      const pending = pendingPersistentIkCommandRef.current;
      if (
        !pending
        || pending.inputSignature !== inputSignature
        || pending.historyGeneration !== fullStateHistoryRef.current.generation
      ) return;
      pendingPersistentIkCommandRef.current = null;
      const nextHistory = commitStudioVrmFullStateHistoryTransaction(
        fullStateHistoryRef.current,
        pending.before,
        resolvedAfter,
        activeModelId,
      );
      fullStateHistoryRef.current = nextHistory;
      setCanUndo(nextHistory.index > 0);
      setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    };
    const rollbackPendingCommand = (message: string): void => {
      if (!vrm) {
        pendingPersistentIkCommandRef.current = null;
        setPersistentIkReconciling(false);
        setJointHandleStatus(message);
        return;
      }
      const pending = pendingPersistentIkCommandRef.current;
      if (!pending) {
        setPersistentIkReconciling(false);
        setJointHandleStatus(message);
        return;
      }
      pendingPersistentIkCommandRef.current = null;
      const rollbackBones = stripFingerBones(pending.before.bones);
      const rollbackFingers = pending.before.fingerOverrides ?? {};
      const rollbackTranslations = cloneStudioVrmPoseTranslations(pending.before.poseTranslations);
      const rollbackConstraints = cloneStudioVrmIkConstraints(pending.before.ikConstraints);
      persistentIkResolvedSignatureRef.current = buildStudioVrmPersistentIkSignature({
        modelId: activeModelId,
        bones: rollbackBones,
        fingerEdits: rollbackFingers,
        yOffset: pending.before.yOffset,
        translations: rollbackTranslations,
        bodyRotation: pending.before.bodyRotation,
        bodyScale: pending.before.bodyScale ?? bodyScale,
        constraints: rollbackConstraints,
        lockedPoseBones,
        jointProfile: rigJointProfile,
        fullBodyIk: fullBodyIkEnabled,
        footPlant: footPlantEnabled,
        floorHeight: rigFloorHeight,
      });
      setPersistentIkReconciling(false);
      setActivePoseId(pending.before.poseId ?? "default");
      setCustomBones(rollbackBones);
      setFingerEdits(rollbackFingers);
      setCustomYOffset(pending.before.yOffset);
      setPoseTranslations(rollbackTranslations);
      setIkConstraints(rollbackConstraints);
      setBodyRotation(pending.before.bodyRotation);
      applyPoserVisualState(vrm, {
        bones: rollbackBones,
        yOffset: pending.before.yOffset,
        poseTranslations: rollbackTranslations,
        fingerEdits: rollbackFingers,
        bodyScale: pending.before.bodyScale ?? bodyScale,
      });
      applyRotationToVrm(vrm, pending.before.bodyRotation);
      setJointHandleStatus(`${message} 변경 전 상태로 되돌렸습니다.`);
    };
    if (
      pendingPersistentIkCommandRef.current
      && pendingPersistentIkCommandRef.current.inputSignature !== inputSignature
    ) {
      rollbackPendingCommand("고정점 보정 중 다른 포즈 변경이 시작되어 먼저 하던 명령을 취소했습니다.");
      return;
    }
    if (
      !open
      || !vrm
      || lockedConstraints.length === 0
      || jointHandleInteracting
      || jointIkTransactionRef.current
      || webcamActive
      || idleAnimation
      || isCapturing
      || isSharingPose
      || isThumbnailCapturing
    ) {
      if (lockedConstraints.length === 0) {
        persistentIkResolvedSignatureRef.current = "";
        setPersistentIkReconciling(false);
      }
      return;
    }
    if (persistentIkResolvedSignatureRef.current === inputSignature) {
      const pending = pendingPersistentIkCommandRef.current;
      if (pending?.inputSignature === inputSignature) {
        commitPendingCommand(pending.candidateAfter);
      }
      setPersistentIkReconciling(false);
      return;
    }

    const revision = persistentIkReconcileRevisionRef.current + 1;
    persistentIkReconcileRevisionRef.current = revision;
    setPersistentIkReconciling(true);
    const frame = requestAnimationFrame(() => {
      if (
        persistentIkReconcileRevisionRef.current !== revision
        || jointIkTransactionRef.current
        || vrmRef.current !== vrm
      ) {
        setPersistentIkReconciling(false);
        return;
      }
      const coordinateScene = captureRef.current.scene;
      if (!coordinateScene) {
        // CaptureBridge가 scene generation을 올리면 이 effect가 다시 실행된다. 그 전까지는
        // 미해결 포즈를 캡처하거나 history에 넣지 않는다.
        setPersistentIkReconciling(true);
        setJointHandleStatus("고정점 장면 좌표를 준비하지 못해 포즈 변경을 보정하지 못했습니다.");
        return;
      }
      for (const constraint of lockedConstraints) {
        const chain = STUDIO_VRM_USER_IK_CHAINS[constraint.effector];
        if ([chain.upper, chain.lower, chain.end].some((bone) => lockedPoseBones.includes(bone))) {
          rollbackPendingCommand("관절 잠금과 손·발 고정점 유지가 충돌합니다.");
          return;
        }
      }

      applyPoserVisualState(vrm, {
        bones: customBones,
        yOffset: customYOffset,
        poseTranslations,
        fingerEdits,
        bodyScale,
      });
      applyRotationToVrm(vrm, bodyRotation);
      const worldConstraints = lockedConstraints.map((constraint) => {
        const target = studioVrmSceneLocalPointToWorld(coordinateScene, constraint.target);
        const pole = constraint.pole
          ? studioVrmSceneLocalPointToWorld(coordinateScene, constraint.pole)
          : null;
        return target && (!constraint.pole || pole)
          ? {
              effector: constraint.effector,
              targetWorld: new THREE.Vector3(target[0], target[1], target[2]),
              poleWorld: pole ? new THREE.Vector3(pole[0], pole[1], pole[2]) : undefined,
            }
          : null;
      });
      if (worldConstraints.some((constraint) => constraint === null)) {
        rollbackPendingCommand("저장된 손·발 고정점 좌표를 해석하지 못했습니다.");
        return;
      }
      const [primary, ...rest] = worldConstraints as Array<{
        effector: StudioVrmIkEffectorBone;
        targetWorld: THREE.Vector3;
        poleWorld?: THREE.Vector3;
      }>;
      if (!primary) {
        rollbackPendingCommand("유지할 손·발 고정점을 찾지 못했습니다.");
        return;
      }
      const result = solveStudioVrmFullBodyIk(vrm, {
        primary,
        lockedTargets: rest,
        baseTranslations: poseTranslations,
        jointProfile: rigJointProfile,
        fullBodyIk: fullBodyIkEnabled,
        footPlant: { enabled: footPlantEnabled, floorHeight: rigFloorHeight },
      });
      if (!result || persistentIkReconcileRevisionRef.current !== revision) {
        rollbackPendingCommand("현재 포즈에서 저장된 손·발 고정점을 함께 유지하지 못했습니다.");
        return;
      }
      if (!canCommitStudioVrmIkResult(result)) {
        rollbackPendingCommand(STUDIO_VRM_IK_NOT_CONVERGED_STATUS);
        return;
      }
      const nextBones = stripFingerBones(result.bones);
      const nextFingers = extractStudioVrmFingerRotations(result.bones);
      const nextTranslations = cloneStudioVrmPoseTranslations(result.translations);
      const outputSignature = buildStudioVrmPersistentIkSignature({
        modelId: activeModelId,
        bones: nextBones,
        fingerEdits: nextFingers,
        yOffset: result.yOffset,
        translations: nextTranslations,
        bodyRotation,
        bodyScale,
        constraints: ikConstraints,
        lockedPoseBones,
        jointProfile: rigJointProfile,
        fullBodyIk: fullBodyIkEnabled,
        footPlant: footPlantEnabled,
        floorHeight: rigFloorHeight,
      });
      persistentIkResolvedSignatureRef.current = outputSignature;
      const pending = pendingPersistentIkCommandRef.current;
      if (pending?.inputSignature === inputSignature) {
        commitPendingCommand(serializeFullVrmState({
          ...pending.candidateAfter,
          bones: nextBones,
          fingerOverrides: nextFingers,
          yOffset: result.yOffset,
          poseTranslations: nextTranslations,
        }));
      }
      setPersistentIkReconciling(false);
      setCustomBones(nextBones);
      setFingerEdits(nextFingers);
      setCustomYOffset(result.yOffset);
      setPoseTranslations(nextTranslations);
      applyStudioVrmRotationPose(vrm, result, bodyScale);
      setJointHandleStatus(`고정점 ${lockedConstraints.length}개를 현재 포즈에 다시 맞췄습니다.`);
    });
    return () => {
      persistentIkReconcileRevisionRef.current += 1;
      cancelAnimationFrame(frame);
    };
  }, [
    activeModelId,
    bodyRotation,
    bodyScale,
    captureSceneGeneration,
    customBones,
    customYOffset,
    fingerEdits,
    footPlantEnabled,
    fullBodyIkEnabled,
    idleAnimation,
    ikConstraints,
    isCapturing,
    isSharingPose,
    isThumbnailCapturing,
    jointHandleInteracting,
    lockedPoseBones,
    open,
    poseTranslations,
    rigFloorHeight,
    rigJointProfile,
    vrm,
    webcamActive,
  ]);

  const resetFullStateHistory = useCallback(() => {
    fullStateHistoryRef.current = resetStudioVrmFullStateHistory(fullStateHistoryRef.current);
    isRestoringRef.current = false;
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  const texturePaintModeSelected =
    activePanelTab === "character" && activeCharacterSection === "surface";
  const texturePaintSceneSyncRequired = Boolean(
    initialScene
    && texturePaintRuntimeSceneIdentity !== texturePaintSceneIdentity,
  );
  const texturePaintRestoreRequired =
    texturePaintSceneSyncRequired
    || (initialScene?.surfacePaint.textures.length ?? 0) > 0;
  const texturePaintDisabledReason = !vrm
    ? "표면을 칠할 VRM 모델을 먼저 불러오세요."
    : texturePaintSceneSyncRequired
      ? "새 장면의 표면 페인팅 런타임을 준비하는 중입니다."
      : texturePaintRestoreRequired && texturePaintPersistenceStatus === "idle"
      ? "저장된 표면 페인팅의 VRM 모델과 재질을 준비하는 중입니다."
    : texturePaintPersistenceStatus === "restoring"
      ? "저장된 표면 페인팅을 원본 재질에 복원하는 중입니다."
      : texturePaintPersistenceStatus === "error"
        ? texturePaintPersistenceError || "저장된 표면 페인팅을 복원하지 못했습니다."
    : webcamActive || webcamLoading
      ? "웹캠 트래킹을 멈춘 뒤 표면을 칠할 수 있습니다."
      : idleAnimation || physicsPreview
        ? "대기 애니메이션과 물리 미리보기를 멈춘 뒤 표면을 칠할 수 있습니다."
        : isCapturing || isSharingPose || isThumbnailCapturing
          ? "캡처·공유 처리가 끝난 뒤 표면을 칠할 수 있습니다."
          : persistentIkReconciling || jointHandleInteracting || isViewportHandIkDragging
            ? "포즈 계산과 관절 이동이 끝난 뒤 표면을 칠할 수 있습니다."
            : mannequinMode
              ? "중립 데생 인형 보기를 끄면 원래 텍스처를 칠할 수 있습니다."
              : "";
  const texturePaintInteractionEnabled =
    texturePaintModeSelected && texturePaintDisabledReason.length === 0;
  const texturePaintSampling = texturePaintSnapshot?.activeOperation === "sample";
  const texturePaintFilling = texturePaintSnapshot?.activeOperation === "fill";
  const texturePaintStrokeActive =
    texturePaintSnapshot?.status === "loading" || texturePaintSnapshot?.status === "painting";
  const texturePaintTargetLabel = texturePaintSnapshot?.activeTarget
    ? `${texturePaintSnapshot.activeTarget.sourceName || "Base color"} · ${texturePaintSnapshot.activeTarget.width}×${texturePaintSnapshot.activeTarget.height}`
    : null;
  const texturePaintBudgetErrorStatus =
    texturePaintDevicePlan.tier === "constrained"
    && texturePaintSnapshot?.error?.code === "target-rgba-budget"
      ? "이 기기는 실행 취소 기록을 포함해 64 MiB 안에서 표면을 칠합니다. 텍스처를 줄이거나 데스크톱에서 편집해 주세요."
      : texturePaintDevicePlan.tier === "constrained"
        && texturePaintSnapshot?.error?.code === "aggregate-rgba-budget"
        ? "추가 텍스처가 이 기기의 64 MiB 상주 메모리 한도를 넘습니다. 현재 결과를 캡처한 뒤 모델을 다시 열어 다음 텍스처를 편집해 주세요."
        : "";
  const texturePaintStatus = texturePaintDisabledReason
    || texturePaintBudgetErrorStatus
    || texturePaintSnapshot?.error?.message
    || texturePaintSnapshot?.guidance?.message
    || (texturePaintSnapshot?.status === "loading"
      ? texturePaintSampling
        ? "표면의 baseColor 채널에서 정확한 색상을 읽는 중입니다."
        : texturePaintFilling
          ? "ColorDrop 영역을 기기 안에서 계산하고 있습니다. 완료 전에는 원본을 변경하지 않습니다."
        : "텍스처를 안전한 편집 사본으로 준비하는 중입니다. 그대로 계속 그려도 입력이 보존됩니다."
      : texturePaintSnapshot?.status === "painting"
        ? "표면 페인팅 중 · 포인터를 놓으면 한 획으로 저장됩니다."
        : texturePaintEyedropperActive
          ? `스포이드가 준비됐습니다. 캐릭터 표면을 한 번 누르면 색상만 가져오고 ${
              texturePaintSettings.tool === "fill" ? "ColorDrop" : "브러시"
            }로 돌아갑니다.`
        : texturePaintSnapshot?.activeTarget
          ? texturePaintSettings.tool === "fill"
            ? "표면을 한 번 눌러 ColorDrop으로 채우세요. Ctrl/⌘+Z로 이 채우기를 되돌릴 수 있습니다."
            : "표면을 끌어 칠하세요. Ctrl/⌘+Z로 이 텍스처 획을 되돌릴 수 있습니다."
          : "뷰포트에서 옷·피부·머리 표면을 누르면 해당 텍스처를 선택합니다.");
  const viewportCanUndo =
    !texturePaintStrokeActive
    && (canUndo || (texturePaintModeSelected && (texturePaintSnapshot?.history.undoCount ?? 0) > 0));
  const viewportCanRedo =
    !texturePaintStrokeActive
    && (canRedo || (texturePaintModeSelected && (texturePaintSnapshot?.history.redoCount ?? 0) > 0));

  const restoreHistoryStep = (direction: -1 | 1) => {
    if (
      pendingPersistentIkCommandRef.current
      || persistentIkReconciling
      || !persistentIkCaptureIsReady()
    ) {
      setJointHandleStatus("손·발 고정점 보정이 끝난 뒤 편집 기록을 복원해 주세요.");
      return;
    }
    if (jointHandleInteracting || jointIkTransactionRef.current) {
      cancelJointIkTransaction({
        status: "진행 중인 IK 이동을 취소한 뒤 편집 기록을 복원했습니다.",
      });
    }
    const currentVrm = vrmRef.current;
    if (!currentVrm) {
      resetFullStateHistory();
      return;
    }
    const transition = stepStudioVrmFullStateHistory(
      fullStateHistoryRef.current,
      direction,
      activeModelId,
    );
    fullStateHistoryRef.current = transition.history;
    const snap = transition.snapshot;
    if (!snap) {
      setCanUndo(transition.history.index > 0);
      setCanRedo(transition.history.index < transition.history.entries.length - 1);
      return;
    }
    isRestoringRef.current = true;
    commitFullStateRestore(snap, currentVrm, { trustPersistentIkPose: true });
    setCanUndo(transition.history.index > 0);
    setCanRedo(transition.history.index < transition.history.entries.length - 1);
  };
  const doUndo = () => {
    if (
      texturePaintMutationBlockedRef.current
      || typeof texturePaintSnapshotRef.current?.activePointerId === "number"
    ) return;
    if (
      texturePaintModeSelected
      && (texturePaintSnapshotRef.current?.history.undoCount ?? 0) > 0
    ) {
      handleTexturePaintUndo();
      return;
    }
    restoreHistoryStep(-1);
  };
  const doRedo = () => {
    if (
      texturePaintMutationBlockedRef.current
      || typeof texturePaintSnapshotRef.current?.activePointerId === "number"
    ) return;
    if (
      texturePaintModeSelected
      && (texturePaintSnapshotRef.current?.history.redoCount ?? 0) > 0
    ) {
      handleTexturePaintRedo();
      return;
    }
    restoreHistoryStep(1);
  };

  const poseMaterialRuntimeDisabled =
    !vrm ||
    webcamActive ||
    webcamLoading ||
    idleAnimation ||
    isCapturing ||
    isSharingPose ||
    isThumbnailCapturing ||
    persistentIkReconciling ||
    jointHandleInteracting ||
    isViewportHandIkDragging;
  const vrmFrameLoop = resolveStudioVrmFrameLoop({
    webcamActive,
    idleAnimation,
    physicsPreview,
    turntable,
    viewportHandIkDragging: isViewportHandIkDragging,
    jointHandleInteracting,
    persistentIkReconciling,
    capturing: isCapturing,
    sharingPose: isSharingPose,
    thumbnailCapturing: isThumbnailCapturing,
  });

  function portableLockedPoseBones(): StudioHumanoidBoneName[] {
    return lockedPoseBones.filter(
      (boneName): boneName is StudioHumanoidBoneName => isStudioHumanoidBoneName(boneName)
    );
  }

  function handleCapturePoseMaterial(
    options: StudioVrmPoseMaterialCaptureOptions,
  ): StudioPoseMaterial | null {
    const currentVrm = vrmRef.current;
    if (!currentVrm || poseMaterialRuntimeDisabled) return null;
    return captureStudioVrmPoseMaterial(currentVrm, options);
  }

  function handleApplyPoseMaterial(
    material: StudioPoseMaterial,
    scope: StudioPoseScope,
    strength?: number,
  ): StudioVrmPoseMaterialApplyResult | null {
    const currentVrm = vrmRef.current;
    if (!currentVrm || poseMaterialRuntimeDisabled) return null;

    const before = captureFullState();
    const result = applyStudioVrmPoseMaterial(currentVrm, material, {
      scope,
      lockedBones: portableLockedPoseBones(),
      ...(strength !== undefined ? { strength } : {}),
      bones: customBones,
      fingerEdits,
    });
    if (!result || result.appliedBones.length === 0) return result;

    const poseId = `pose-material:${result.materialId}`;
    const after = serializeFullVrmState({
      ...before,
      poseId,
      bones: result.bones,
      fingerOverrides: result.fingerEdits,
    });
    const candidateSignature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: result.bones,
      fingerEdits: result.fingerEdits,
      yOffset: after.yOffset,
      translations: after.poseTranslations,
      bodyRotation: after.bodyRotation,
      bodyScale: after.bodyScale ?? bodyScale,
      constraints: after.ikConstraints,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    if (
      after.ikConstraints.some((constraint) => constraint.enabled && constraint.locked)
      && persistentIkResolvedSignatureRef.current !== candidateSignature
    ) {
      pendingPersistentIkCommandRef.current = {
        before,
        candidateAfter: after,
        inputSignature: candidateSignature,
        historyGeneration: fullStateHistoryRef.current.generation,
      };
      setPersistentIkReconciling(true);
    } else {
      const nextHistory = commitStudioVrmFullStateHistoryTransaction(
        fullStateHistoryRef.current,
        before,
        after,
        activeModelId,
      );
      fullStateHistoryRef.current = nextHistory;
      setCanUndo(nextHistory.index > 0);
      setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    }

    setActivePoseId(poseId);
    setCustomBones(result.bones);
    setFingerEdits(result.fingerEdits);
    const nextEffectiveFingers = resolveStudioVrmFingerAuthority(
      result.fingerEdits,
      createAutoGripFingerOverrides(
        vrmPropItems,
        propDefById,
        effectivePropRigMetrics,
      ),
    );
    applyPoserVisualState(currentVrm, {
      bones: result.bones,
      yOffset: customYOffset,
      poseTranslations,
      fingerEdits: nextEffectiveFingers,
      bodyScale,
    });
    return result;
  }

  function handlePoseMaterialProvenanceInvalidated(materialId: string): void {
    if (activePoseId === `pose-material:${materialId}`) {
      setActivePoseId("manual-pose");
    }
  }

  // 편집이 멈추면(디바운스) 스냅샷을 히스토리에 적재. 복원 중 변경은 건너뛴다.
  useEffect(() => {
    if (
      !vrm
      || pendingPersistentIkCommandRef.current
      || persistentIkReconciling
      || !persistentIkCaptureIsReady()
    ) return;
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    const historyGeneration = fullStateHistoryRef.current.generation;
    const timer = setTimeout(() => {
      const snap = JSON.parse(JSON.stringify(captureFullState())) as FullVrmState;
      const currentHistory = fullStateHistoryRef.current;
      const nextHistory = appendStudioVrmFullStateHistory(
        currentHistory,
        snap,
        historyGeneration,
        activeModelId,
      );
      if (nextHistory === currentHistory) return;
      fullStateHistoryRef.current = nextHistory;
      setCanUndo(nextHistory.index > 0);
      setCanRedo(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [
    activeModelId,
    captureFullState,
    persistentIkCaptureIsReady,
    persistentIkReconciling,
    vrm,
  ]);

  // 키보드 핸들러가 항상 최신 undo/redo를 호출하도록 ref 동기화(렌더 후).
  const undoRef = useRef(doUndo);
  const redoRef = useRef(doRedo);
  useEffect(() => {
    undoRef.current = doUndo;
    redoRef.current = doRedo;
  });

  // 모달이 열린 동안 배경 스크롤을 잠그고, 첫 포커스를 명시하며 닫힐 때 진입점으로 돌려준다.
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `calc(${previousPaddingRight || "0px"} + ${scrollbarWidth}px)`;
    }
    const focusFrame = requestAnimationFrame(() => {
      (closeButtonRef.current ?? dialogRef.current)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [
    open,
    cancelPendingSharedPoseCatalog,
    cancelPendingSharedPoseSelection,
  ]);

  // 키보드 단축키: Esc 닫기, Tab 포커스 트랩, ⌘/Ctrl+Z 되돌리기,
  // ⌘/Ctrl+Shift+Z(또는 +Y) 다시 실행. 모달 뒤 전역 ⌘K 팔레트는 열지 않는다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const dialog = dialogRef.current;
      const topElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      const dialogIsTopmost = !!dialog && (!topElement || topElement === dialog || dialog.contains(topElement));
      if (e.key === "Escape") {
        if (e.defaultPrevented || !dialogIsTopmost) return;
        e.preventDefault();
        e.stopPropagation();
        if (isCapturing) return;
        cancelActiveTexturePaintStroke();
        sharePoseAbortRef.current?.abort();
        onClose();
        return;
      }

      if (e.key === "Tab" && dialog && dialogIsTopmost) {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        )).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
        if (focusable.length === 0) {
          e.preventDefault();
          dialog.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !dialog.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || !(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      } else if (key === "y") {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cancelActiveTexturePaintStroke, isCapturing, open, onClose, texturePaintStrokeActive]);

  // 자연 포즈도 모든 손가락을 저작값으로 포함하므로 자동 그립이 켜진 손에서는 소품
  // 접촉 결과를 최종 권위로 둔다. 자동 그립을 끄면 가려졌던 저작값이 즉시 복원된다.
  const effectiveFingerEdits = resolveStudioVrmFingerAuthority(
    fingerEdits,
    createAutoGripFingerOverrides(vrmPropItems, propDefById, effectivePropRigMetrics),
  );

  const onCaptureUpdate = useCallback((state: CaptureState, cleanupGl?: THREE.WebGLRenderer | null) => {
    if (cleanupGl) {
      if (captureRef.current.gl === cleanupGl) {
        captureRef.current = { camera: null, gl: null, scene: null };
        setCaptureSceneGeneration((generation) => generation + 1);
      }
    } else {
      const previous = captureRef.current;
      captureRef.current = state;
      if (
        previous.camera !== state.camera
        || previous.gl !== state.gl
        || previous.scene !== state.scene
      ) {
        setCaptureSceneGeneration((generation) => generation + 1);
      }
    }
  }, []);
  const activeCamera = findCameraPreset(activeCameraId);
  // 포즈 검색 + 상황 버킷(최근/서기/액션/앉기/감정/손짓) — 상용 포즈 팔레트 탐색 속도용.
  const allPoseListItems: StudioVrmPoseListItem[] = [
    ...POSE_PRESETS.map((pose) => ({ id: pose.id, label: pose.label, tone: pose.tone })),
    ...NATURAL_IDLE_POSES.map((pose) => ({ id: pose.id, label: pose.label, tone: pose.tone })),
    ...EXTRA_POSE_PRESETS.map((pose) => ({ id: pose.id, label: pose.label, tone: pose.tone })),
    ...savedPoses.map((pose) => ({ id: pose.id, label: pose.label, tone: "사용자 저장" })),
  ];
  const bucketedPoseIds = new Set(
    filterStudioVrmPosesByBucket(allPoseListItems, poseBucket, recentPoseState.ids).map((item) => item.id)
  );
  const poseQ = poseQuery.trim().toLowerCase();
  const poseMatches = (p: { id: string; label: string; tone?: string }) => {
    if (poseBucket !== "all" && !bucketedPoseIds.has(p.id)) return false;
    if (!poseQ) return true;
    return filterStudioVrmPosesByQuery([p], poseQuery).length > 0;
  };
  const poseResultCount =
    POSE_PRESETS.filter(poseMatches).length +
    NATURAL_IDLE_POSES.filter(poseMatches).length +
    EXTRA_POSE_PRESETS.filter(poseMatches).length +
    savedPoses.filter(poseMatches).length;
  // 비활성 탭 섹션은 hidden 속성으로 숨겨 마운트는 유지(웹캠 video 등 ref 보존).
  // hidden 속성은 space-y 유틸의 :not([hidden]) 선택자에서 제외돼 간격도 자연 정리된다.
  const hideOnTab = (tab: PanelTab) => activePanelTab !== tab;
  const hideOnCharacterSection = (section: CharacterPanelSection) =>
    activePanelTab !== "character" || activeCharacterSection !== section;
  const libraryEntryById = new Map(libraryEntries.map((entry) => [entry.id, entry] as const));
  const availableExpressionActions = getAvailableExpressionActions(vrm);
  const hasMToonMaterial = vrm ? hasVrmMToonMaterial(vrm) : false;
  const activeLibraryEntry = libraryEntryById.get(activeModelId) ?? null;
  const displayModelName = vrm ? modelName : "";
  interface PendingPoseData {
    poseId?: string;
    bones?: PoseBoneMap;
    yOffset?: number;
    poseTranslations?: StudioVrmPoseTranslations;
    ikConstraints?: readonly StudioVrmIkConstraint[];
    bodyRotation?: number;
    expressionId?: string;
    expressionWeights?: Record<string, number>;
    customColors?: Record<string, string>;
    materialFx?: VrmMaterialFx;
    modelId?: string;
    modelHash?: string;
    modelName?: string;
    vrmProps?: unknown;
    sceneProps?: unknown;
    costume?: unknown;
    wardrobe?: unknown;
    physics?: unknown;
    // new high-level state for restore on load
    bodyScale?: BodyScale;
    fingerOverrides?: FingerRotationMap;
    lighting?: LightingParams;
    env?: EnvVariant;
    avatarForge?: unknown;
    camera?: StudioVrmCameraSettings;
    mannequin?: boolean;
  }

  const pendingPoseDataRef = useRef<PendingPoseData | null>(null);
  const initialSceneModelIdentity = initialScene
    ? initialScene.model.source === "bundled"
      ? `bundled:${initialScene.model.id}`
      : `attachment:${initialScene.model.hash}`
    : "";

  useEffect(() => {
    if (open && initialScene) {
      setRigJointProfile(initialScene.rig.jointProfile.id);
      setFullBodyIkEnabled(initialScene.rig.fullBodyIk);
      setFootPlantEnabled(initialScene.rig.footPlant);
      setRigFloorHeight(initialScene.rig.floorHeight);
      const poseBones: PoseBoneMap = {};
      for (const boneName of STUDIO_VRM_HUMANOID_BONES) {
        const bone = initialScene.pose.bones[boneName];
        if (!bone) continue;
        poseBones[boneName] = {
          rotation: [bone.rotation[0], bone.rotation[1], bone.rotation[2]],
        };
      }
      const fingerOverrides: FingerRotationMap = {};
      for (const boneName of STUDIO_VRM_FINGER_BONES) {
        const rotation = initialScene.pose.fingerOverrides[boneName];
        if (!rotation) continue;
        fingerOverrides[boneName] = [rotation[0], rotation[1], rotation[2]];
      }
      const poseData: PendingPoseData = {
        bones: poseBones,
        yOffset: initialScene.pose.yOffset,
        poseTranslations: cloneStudioVrmPoseTranslations(initialScene.pose.translations),
        ikConstraints: cloneStudioVrmIkConstraints(initialScene.pose.ikConstraints),
        bodyRotation: initialScene.pose.bodyRotationY,
        expressionWeights: { ...initialScene.expressions },
        customColors: { ...initialScene.appearance.customColors },
        materialFx: { ...initialScene.appearance.materialFx },
        modelId: initialScene.model.source === "bundled" ? initialScene.model.id : undefined,
        modelHash: initialScene.model.source === "attachment" ? initialScene.model.hash : undefined,
        modelName: initialScene.model.name,
        vrmProps: initialScene.props,
        sceneProps: initialScene.sceneProps,
        costume: initialScene.appearance.costume,
        wardrobe: initialScene.appearance.wardrobe,
        physics: initialScene.physics,
        bodyScale: { ...initialScene.appearance.bodyScale },
        fingerOverrides,
        lighting: { ...initialScene.lighting },
        env: initialScene.env,
        avatarForge: initialScene.appearance.avatarForge,
        camera: initialScene.camera,
        mannequin: initialScene.appearance.mannequin,
      };
      pendingPoseDataRef.current = poseData;
      pendingCameraRestoreRef.current = initialScene.camera;
      setTransparentBackground(initialScene.render.transparentBackground);
      setInsertBackgroundColor(initialScene.render.backgroundColor);
      setMannequinMode(initialScene.appearance.mannequin);
      setActiveCameraId("custom");
      if (poseData.modelId) setActiveModelId(poseData.modelId);
    } else if (open && initialDataUrl) {
      try {
        const full = buildFullVrmStateFromSharedDataUrl(initialDataUrl);
        if (!full) throw new Error("Invalid VRM pose metadata");
        const poseData: PendingPoseData = {
          poseId: full.poseId,
          bones: full.bones,
          yOffset: full.yOffset,
          poseTranslations: full.poseTranslations,
          ikConstraints: full.ikConstraints,
          bodyRotation: full.bodyRotation,
          expressionId: full.expressionId,
          expressionWeights: full.expressionWeights,
          customColors: full.customColors,
          materialFx: full.materialFx,
          modelId: full.modelId,
          vrmProps: full.props,
          sceneProps: full.sceneProps,
          costume: full.costume,
          wardrobe: full.wardrobe,
          physics: full.physics,
          bodyScale: full.bodyScale,
          fingerOverrides: full.fingerOverrides,
          lighting: full.lighting,
          env: full.env,
          avatarForge: full.avatarForge,
        };
        const pendingModelId = normalizeFullVrmModelId(poseData.modelId);
        pendingPoseDataRef.current = { ...poseData, modelId: pendingModelId };
        if (pendingModelId) setActiveModelId(pendingModelId);
      } catch (e) {
        console.error("Failed to parse initial data URL", e);
      }
    } else if (!open) {
      pendingPoseDataRef.current = null;
      pendingCameraRestoreRef.current = null;
      resetFullStateHistory();
    }
  }, [open, initialDataUrl, initialScene, resetFullStateHistory]);

  useEffect(() => {
    const stored = localStorage.getItem("studio_custom_poses");
    if (stored) {
      try {
        setSavedPoses(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to load custom poses", e);
      }
    }
    const fullStored = localStorage.getItem("studio_vrm_full_states");
    if (fullStored) {
      try {
        const parsed: unknown = JSON.parse(fullStored);
        const restored: Record<string, FullVrmState> = {};
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          for (const [name, candidate] of Object.entries(parsed).slice(0, 100)) {
            if (!name || name.length > 24) continue;
            const full = deserializeFullVrmState(candidate);
            if (full) restored[name] = full;
          }
        }
        setSavedFullStates(restored);
      } catch (e) {
        console.error("Failed to load full vrm states", e);
      }
    }
    // 저장된 트래킹 캘리브레이션 복원(손상/버전 불일치면 null → 미적용).
    const storedCalibration = deserializeCalibration(localStorage.getItem(CALIBRATION_STORAGE_KEY));
    if (storedCalibration) {
      calibrationRef.current = storedCalibration;
      setCalibrated(true);
    }
  }, []);

  // Check camera permission state on mount or when webcam status changes
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions || !navigator.permissions.query) {
      setBrowserPermissionState("unsupported");
      return;
    }

    let active = true;
    const checkPermission = async () => {
      try {
        const res = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (active) {
          setBrowserPermissionState(res.state);
        }
        res.onchange = () => {
          if (active) {
            setBrowserPermissionState(res.state);
          }
        };
      } catch (e) {
        console.warn("Permissions API not supported for camera:", e);
        if (active) {
          setBrowserPermissionState("unsupported");
        }
      }
    };

    checkPermission();
    return () => {
      active = false;
    };
  }, [webcamActive]);

  // Synchronize options to a ref for the frame loop
  const trackingOptionsRef = useRef(trackingOptions);
  useEffect(() => {
    trackingOptionsRef.current = trackingOptions;
  }, [trackingOptions]);

  // 탭 숨김 → 카메라 완전 해제(LED 소등 = 프라이버시) + 루프 정지, 복귀 시 재시작.
  // 기존 웹캠 effect 가 webcamActive=false 에서 track.stop 을 이미 수행하므로 토글을 재사용한다
  // (권한은 granted 상태라 재시작 시 프롬프트 없음, 모델은 싱글턴 캐시라 재-init 비용 없음).
  useEffect(() => {
    const wasActive = { current: false };
    const onVisibilityChange = () => {
      if (document.hidden) {
        wasActive.current = webcamActiveRef.current;
        if (wasActive.current) setWebcamActive(false);
      } else if (wasActive.current) {
        wasActive.current = false;
        setWebcamActive(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // 캘리브레이션 카운트다운(3·2·1) → 종료 시 샘플러 가동(완료 감지는 트래킹 루프에서).
  useEffect(() => {
    if (!calibrating) return;
    if (calibrationCountdown > 0) {
      const timer = setTimeout(() => setCalibrationCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
    setCalibrationProgress(0);
    calibrationSamplerRef.current = new CalibrationSampler();
  }, [calibrating, calibrationCountdown]);

  // Webcam live tracking loop
  useEffect(() => {
    if (!webcamActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      // 트래킹 세션 상태 초기화 — 재시작 시 stale 필터/홀드 값 방지.
      channelSmootherRef.current.reset();
      blinkStabilizerRef.current.reset();
      qualityRef.current = null;
      calibrationSamplerRef.current = null;
      faceLostFramesRef.current = 0;
      faceLostLongRef.current = false;
      lastChannelsRef.current = null;
      lastPoseBonesRef.current = {};
      lastFingersRef.current = null;
      frameIndexRef.current = 0;
      trackingDataRef.current = null;
      setFaceDetected(false);
      setFaceLostLong(false);
      setCalibrating(false);
      return;
    }

    let active = true;
    let lastVideoTime = -1;
    let requestId: number;
    let videoFrameCallbackId: number | null = null;
    // rVFC 를 등록한 비디오 엘리먼트 — cleanup 에서 ref 재조회 대신 이 변수를 사용.
    let schedulingVideo: HTMLVideoElement | null = null;

    const startCamera = async () => {
      setWebcamLoading(true);
      setWebcamError(null);
      try {
        let stream: MediaStream;
        try {
          if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new TypeError("navigator.mediaDevices is undefined (Insecure Context or unsupported browser)");
          }

          // Always attempt getUserMedia on explicit user click (best chance for prompt).
          // The separate permission state effect + banner handles showing "already denied" warning.
          // This makes it more robust when Permissions API state lags behind actual grants (common on macOS).
          // Optional: enumerate first to help diagnose (labels empty = no permission yet or system block)
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            if (videoDevices.length === 0) {
              console.warn('No videoinput devices found via enumerateDevices()');
            } else if (videoDevices.some(d => !d.label)) {
              console.warn('Video devices found but labels empty (permission not yet fully granted or system level block)');
            }
          } catch { /* ignore */ }

          // 모델 내부 입력이 192~256px 라 640 초과는 낭비, 320×240 은 iris 정밀도 손실
          // — 640×480 이 스윗스팟. exact 는 OverconstrainedError 위험이 있어 ideal 만 사용.
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30, max: 30 },
              facingMode: "user",
            },
            audio: false,
          });
        } catch (cameraErr) {
          console.error("Webcam access failed:", cameraErr);
          // Force update permission state on NotAllowed so banner shows even if Permissions API was "prompt"
          if (cameraErr instanceof Error && (cameraErr.name === "NotAllowedError" || /denied|Permission denied/i.test(cameraErr.message))) {
            setBrowserPermissionState("denied");
          }
          throw new Error(parseCameraError(cameraErr), { cause: cameraErr });
        }

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch (e) {
            console.error("Video play failed:", e);
          }
        }

        let landmarker;
        let poseLandmarker;
        try {
          [landmarker, poseLandmarker] = await Promise.all([
            initFaceLandmarker(),
            initPoseLandmarker(),
          ]);
        } catch (modelErr) {
          console.error("Tracking AI models initialization failed:", modelErr);
          throw new Error("얼굴 및 전신 인식 AI 모델(MediaPipe)을 초기화하지 못했습니다. 인터넷 연결 상태를 확인하고 페이지를 새로고침해 주세요.", { cause: modelErr });
        }

        if (!active) return;
        landmarkerRef.current = landmarker;
        poseLandmarkerRef.current = poseLandmarker;

        // 손가락 추적(옵션) — 별도 lazy 초기화. 실패해도 전신 추적은 유지.
        if (trackingOptionsRef.current.fingerTracking) {
          initHandLandmarker()
            .then((hand) => {
              if (active) handLandmarkerRef.current = hand;
            })
            .catch((handErr) => console.warn("HandLandmarker init failed (손가락 추적 비활성):", handErr));
        }

        // 적응형 품질 초기 티어 — 저사양 하드웨어 판정은 여기(호출부)서 주입해
        // 컨트롤러 모듈은 navigator 무의존 순수 모듈로 유지한다.
        const lowEnd =
          (navigator.hardwareConcurrency ?? 8) <= 4 ||
          ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
        qualityRef.current = new AdaptiveQualityController(lowEnd ? "reduced" : "full");

        // 첫 실제 프레임의 셰이더 컴파일/그래프 빌드 스톨을 트래킹 시작 전에 흡수.
        if (videoRef.current && videoRef.current.readyState >= 2) {
          warmupLandmarkers(videoRef.current, performance.now());
        }

        setWebcamLoading(false);

        const loop = () => {
          if (!active) return;
          const currentVideo = videoRef.current;
          const currentLandmarker = landmarkerRef.current;
          const currentPoseLandmarker = poseLandmarkerRef.current;
          if (currentVideo && currentLandmarker && currentPoseLandmarker && currentVideo.readyState >= 2) {
            // detectForVideo 타임스탬프는 단조 증가 필수 — 추론 시간 측정 시작점 겸용.
            const timestamp = performance.now();
            // rVFC 경로는 프레임당 1회 호출이지만 rAF 폴백을 위해 currentTime 가드 유지(무해).
            if (currentVideo.currentTime !== lastVideoTime) {
              lastVideoTime = currentVideo.currentTime;
              const frameIndex = frameIndexRef.current++;
              const quality = qualityRef.current;
              const options = trackingOptionsRef.current;

              const result = currentLandmarker.detectForVideo(currentVideo, timestamp);
              const rawChannels = processTrackingResult(result);

              // 적응형 품질: pose 는 티어에 따라 격프레임 스킵(스킵 프레임은 직전 결과 재사용
              // — 본 스무더가 보간을 겸한다).
              if (!quality || quality.shouldRunPose(frameIndex)) {
                const poseResult = currentPoseLandmarker.detectForVideo(currentVideo, timestamp);
                lastPoseBonesRef.current = processPoseResult(poseResult, options.mirrorMode);
              }
              const poseBones = lastPoseBonesRef.current;

              setFaceDetected(!!rawChannels);

              // 얼굴 로스트: 짧은 드랍은 마지막 채널 홀드, 길어지면 중립으로 감쇠 복귀.
              if (rawChannels) {
                faceLostFramesRef.current = 0;
                lastChannelsRef.current = rawChannels;
                if (faceLostLongRef.current) {
                  faceLostLongRef.current = false;
                  setFaceLostLong(false);
                }
              } else {
                faceLostFramesRef.current += 1;
                if (!faceLostLongRef.current && faceLostFramesRef.current > FACE_LOST_HINT_FRAMES) {
                  faceLostLongRef.current = true;
                  setFaceLostLong(true);
                }
              }
              const held =
                (faceLostFramesRef.current <= FACE_HOLD_FRAMES ? lastChannelsRef.current : null) ??
                NEUTRAL_CHANNELS;

              // 캘리브레이션 샘플링 — 반드시 보정 "이전" raw 값으로, 얼굴 검출 프레임만 수집.
              const sampler = calibrationSamplerRef.current;
              if (sampler && rawChannels) {
                sampler.add(rawChannels);
                setCalibrationProgress(sampler.progress);
                if (sampler.done) {
                  calibrationSamplerRef.current = null;
                  const cal = sampler.build();
                  if (cal) {
                    calibrationRef.current = cal;
                    try {
                      localStorage.setItem(CALIBRATION_STORAGE_KEY, serializeCalibration(cal));
                    } catch (storageErr) {
                      console.warn("캘리브레이션 저장 실패(이번 세션에서만 유지):", storageErr);
                    }
                    channelSmootherRef.current.reset();
                  }
                  setCalibrated(!!cal);
                  setCalibrating(false);
                }
              }

              // 적용 순서: raw → 캘리브레이션 → One-Euro → 블링크 안정화 → VRM 변환.
              const calibratedChannels = applyCalibration(held, calibrationRef.current);
              const smoothed = channelSmootherRef.current.smooth(
                calibratedChannels,
                timestamp / 1000, // 초 단위 실제 시간 — 프레임 인덱스 금지(가변 fps 왜곡).
                options.smoothing
              );
              // blink 좌우는 카메라 좌표계 그대로 — 미러 스왑은 convertChannelsToVrmData
              // 한 곳에서만 수행한다(이중 반전 금지).
              const blink = blinkStabilizerRef.current.process(
                smoothed.blinkLeft,
                smoothed.blinkRight,
                smoothed.headYaw
              );
              const vrmData = convertChannelsToVrmData(
                { ...smoothed, blinkLeft: blink.left, blinkRight: blink.right },
                options
              );
              vrmData.bones = { ...vrmData.bones, ...poseBones };

              // 손가락 추적: 티어에 따라 격프레임/비활성(스킵 프레임은 직전 결과 재사용).
              const handLm = handLandmarkerRef.current;
              if (handLm) {
                if (!quality || quality.shouldRunHands(frameIndex, options.fingerTracking)) {
                  const handResult = handLm.detectForVideo(currentVideo, timestamp);
                  const fingers: Record<string, readonly [number, number, number]> = {};
                  const hands = handResult?.landmarks ?? [];
                  const handed = handResult?.handednesses ?? [];
                  for (let i = 0; i < hands.length; i++) {
                    const label = handed[i]?.[0]?.categoryName ?? "Right";
                    const side = avatarSideForHand(label, options.mirrorMode);
                    Object.assign(fingers, solveHandToFingerBones(hands[i], side));
                  }
                  lastFingersRef.current = fingers;
                }
                if (lastFingersRef.current) vrmData.fingers = lastFingersRef.current;
              }

              trackingDataRef.current = vrmData;
              qualityRef.current?.recordFrame(performance.now() - timestamp, performance.now());
            }
          }
          scheduleNext();
        };
        // 30fps 웹캠에서 rAF(60Hz) 대비 호출 절반 — 새 비디오 프레임에만 깨어난다.
        const scheduleNext = () => {
          const video = videoRef.current;
          if (video && "requestVideoFrameCallback" in video) {
            schedulingVideo = video;
            videoFrameCallbackId = video.requestVideoFrameCallback(() => loop());
          } else {
            requestId = requestAnimationFrame(loop);
          }
        };
        scheduleNext();
      } catch (err) {
        console.error("Webcam start failed:", err);
        const errMsg = err instanceof Error ? err.message : "카메라 권한 접근에 실패했거나 트래킹 로드 오류가 발생했습니다.";
        setWebcamError(errMsg);
        setWebcamActive(false);
        setWebcamLoading(false);
      }
    };

    startCamera();

    return () => {
      active = false;
      setWebcamLoading(false);
      if (requestId) cancelAnimationFrame(requestId);
      if (videoFrameCallbackId !== null && schedulingVideo && "cancelVideoFrameCallback" in schedulingVideo) {
        schedulingVideo.cancelVideoFrameCallback(videoFrameCallbackId);
      }
      // 핸드 랜드마커 참조 해제 — 재시작 시 옵션에 따라 다시 설정.
      handLandmarkerRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [webcamActive]);

  useEffect(() => {
    return () => {
      disposeFaceLandmarker();
      disposePoseLandmarker();
      disposeHandLandmarker();
    };
  }, []);

  // 정면 캘리브레이션 시작 — 3초 카운트다운 후 샘플러 가동(완료는 트래킹 루프가 감지).
  const handleStartCalibration = () => {
    calibrationSamplerRef.current = null;
    setCalibrationProgress(0);
    setCalibrationCountdown(3);
    setCalibrating(true);
  };

  const handleClearCalibration = () => {
    calibrationRef.current = null;
    try {
      localStorage.removeItem(CALIBRATION_STORAGE_KEY);
    } catch (storageErr) {
      console.warn("캘리브레이션 삭제 실패:", storageErr);
    }
    setCalibrated(false);
  };

  const handleCapturePose = () => {
    if (!trackingDataRef.current) return;
    const data = trackingDataRef.current;

    setCustomBones((prev) => {
      const next = { ...prev };
      Object.entries(data.bones).forEach(([boneName, rot]) => {
        next[boneName as VRMHumanBoneName] = {
          rotation: [rot[0], rot[1], rot[2]] as const,
        };
      });
      return next;
    });

    setExpressionWeights((prev) => {
      const next = { ...prev };
      Object.entries(data.expressions).forEach(([name, val]) => {
        next[name] = val as number;
      });
      return next;
    });

    setWebcamActive(false);
  };

  function handleSavePose() {
    const label = globalThis.prompt("포즈 이름을 입력해 주세요:", `마이 포즈 ${savedPoses.length + 1}`);
    if (!label) return;
    const newPose: CustomPose = {
      id: `custom-${Date.now()}`,
      label,
      yOffset: customYOffset,
      bones: mergeStudioVrmFingerRotationsIntoBones(customBones, fingerEdits),
      poseTranslations: cloneStudioVrmPoseTranslations(poseTranslations),
      expressionWeights: { ...expressionWeights }
    };
    const next = [...savedPoses, newPose];
    setSavedPoses(next);
    localStorage.setItem("studio_custom_poses", JSON.stringify(next));
  }

  function handleDeletePose(id: string, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!globalThis.confirm("이 커스텀 포즈를 삭제할까요?")) return;
    const next = savedPoses.filter((p) => p.id !== id);
    setSavedPoses(next);
    localStorage.setItem("studio_custom_poses", JSON.stringify(next));
    if (activePoseId === id) {
      setActivePoseId("default");
    }
  }

  function handleCustomPoseSelect(pose: CustomPose) {
    setActivePoseId(pose.id);
    const stripped = stripFingerBones(pose.bones);
    const poseFingers = extractStudioVrmFingerRotations(pose.bones);
    const nextFingers = Object.keys(poseFingers).length > 0 ? poseFingers : fingerEdits;
    const nextTranslations = normalizeStudioVrmPoseTranslations(pose.poseTranslations)
      ?? EMPTY_STUDIO_VRM_POSE_TRANSLATIONS;
    setCustomBones(stripped);
    if (nextFingers !== fingerEdits) setFingerEdits(nextFingers);
    setCustomYOffset(pose.yOffset);
    setPoseTranslations(cloneStudioVrmPoseTranslations(nextTranslations));
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, {
        bones: stripped,
        yOffset: pose.yOffset,
        poseTranslations: nextTranslations,
        fingerEdits: nextFingers,
        bodyScale,
      });
      if (preserveExpression) {
        applyExpressionWeightsToVrm(vrmRef.current, expressionWeights);
      } else if (pose.expressionWeights) {
        setExpressionWeights(pose.expressionWeights);
        applyExpressionWeightsToVrm(vrmRef.current, pose.expressionWeights);
      } else {
        setExpressionWeights({});
        setActiveExpressionId("neutral");
        applyExpressionWeightsToVrm(vrmRef.current, {});
      }
    }
  }

  function handleCopyPose() {
    try {
      const poseData = {
        yOffset: customYOffset,
        bones: customBones,
        poseTranslations: cloneStudioVrmPoseTranslations(poseTranslations),
        expressionWeights: expressionWeights,
      };
      const jsonStr = JSON.stringify(poseData, null, 2);
      navigator.clipboard.writeText(jsonStr)
        .then(() => {
          alert("현재 자세와 표정이 클립보드에 복사되었습니다.\n다른 캐릭터나 다른 컷의 캐릭터에 붙여넣기(Paste)할 수 있습니다.");
        })
        .catch(() => {
          localStorage.setItem("studio_pose_clipboard", jsonStr);
          alert("현재 자세와 표정이 로컬 저장소에 임시 복사되었습니다.");
        });
    } catch (_e) {
      alert("포즈 복사에 실패했습니다.");
    }
  }

  async function handlePastePose() {
    try {
      let jsonStr = "";
      try {
        jsonStr = await navigator.clipboard.readText();
      } catch (_clipErr) {
        jsonStr = localStorage.getItem("studio_pose_clipboard") || "";
      }

      if (!jsonStr) {
        alert("클립보드 또는 로컬 저장소에 저장된 포즈 데이터가 없습니다.");
        return;
      }

      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== "object" || !parsed.bones) {
        alert("올바른 포즈 데이터 형식이 아닙니다.");
        return;
      }

      const pastedTranslations = normalizeStudioVrmPoseTranslations(parsed.poseTranslations)
        ?? EMPTY_STUDIO_VRM_POSE_TRANSLATIONS;
      setCustomBones(parsed.bones);
      setCustomYOffset(parsed.yOffset ?? 0);
      setPoseTranslations(cloneStudioVrmPoseTranslations(pastedTranslations));

      if (!preserveExpression && parsed.expressionWeights) {
        setExpressionWeights(parsed.expressionWeights);
        if (vrmRef.current) {
          applyExpressionWeightsToVrm(vrmRef.current, parsed.expressionWeights);
        }
      } else if (vrmRef.current) {
        applyExpressionWeightsToVrm(vrmRef.current, expressionWeights);
      }

      if (vrmRef.current) {
        applyPoseToVrm(
          vrmRef.current,
          parsed.bones,
          parsed.yOffset ?? 0,
          pastedTranslations,
        );
      }

      alert("복사된 포즈를 성공적으로 붙여넣었습니다!");
    } catch (_e) {
      alert("포즈 붙여넣기에 실패했습니다. 데이터 형식을 확인해 주세요.");
    }
  }

  // 풀 스테이트 copy/paste + local save/load (새 기능)
  function handleCopyFullState() {
    try {
      const full = captureFullState();
      const json = JSON.stringify(full);
      navigator.clipboard.writeText(json).then(() => alert("전체 포저 상태 복사됨")).catch(() => { localStorage.setItem("studio_vrm_full_clip", json); alert("로컬에 전체 상태 저장"); });
    } catch { alert("전체 상태 복사 실패"); }
  }
  async function handlePasteFullState() {
    try {
      let json = ""; try { json = await navigator.clipboard.readText(); } catch { json = localStorage.getItem("studio_vrm_full_clip") || ""; }
      if (!json) return alert("전체 상태 데이터 없음");
      const s = JSON.parse(json) as FullVrmStateInput;
      loadHandlers.handlePasteFullStateFromParsed(s);
      if (s && (s.version === 2 || s.version === 3)) alert("전체 상태 붙여넣기 OK");
    } catch { alert("붙여넣기 실패"); }
  }
  function handleSaveFullLocal() {
    const name = (fullStateName || `full-${Date.now()}`).slice(0,24);
    const full = captureFullState();
    const next = { ...savedFullStates, [name]: full };
    setSavedFullStates(next);
    localStorage.setItem("studio_vrm_full_states", JSON.stringify(next));
    setFullStateName(""); alert(`저장: ${name}`);
  }
  function commitFullStateRestore(
    s: FullVrmState,
    vrm: VRM | null,
    options: { trustPersistentIkPose?: boolean } = {},
  ) {
    cancelJointIkTransaction({
      forceInvalidate: true,
      restoreBaseline: false,
      status: jointHandleInteracting || jointIkTransactionRef.current
        ? "진행 중인 IK 이동을 취소하고 전체 포즈 상태를 복원했습니다."
        : undefined,
    });
    pendingPersistentIkCommandRef.current = null;
    const plan = planFullStateRestore(s);
    const restoredColors = plan.customColors ?? DEFAULT_VRM_CUSTOM_COLORS;
    const restoredCostume = parseCostumeState(plan.costume);
    const restoredWardrobeDocument = parseWardrobeDocument(plan.wardrobe);
    const restoredWardrobe = restoredWardrobeDocument.slots;
    const restoredWardrobeAutoHide = restoredWardrobeDocument.options.autoHideOriginal;
    const restoredPhysics = parseVrmPhysicsSettings(plan.physics);
    setCustomBones(plan.strippedBones);
    setCustomYOffset(plan.yOffset);
    setPoseTranslations(cloneStudioVrmPoseTranslations(plan.poseTranslations));
    setIkConstraints(cloneStudioVrmIkConstraints(plan.ikConstraints));
    setBodyRotation(plan.bodyRotation);
    setActivePoseId(s.poseId ?? "default");
    setActiveExpressionId(s.expressionId ?? "neutral");
    setExpressionWeights(plan.expressionWeights);
    if (plan.bodyScale) setBodyScale(plan.bodyScale);
    if (plan.lighting) setLighting(plan.lighting);
    if (plan.env) setEnvVariant(plan.env);
    setFingerEdits(plan.fingerOverrides ?? {});
    // 의상·워드로브는 무조건 반영 — undo/redo에서 장착/숨김 변화도 되돌리고 이전 값이
    // 눌어붙지 않게 한다. 새 VRM 메시를 알아야 하는 자동 숨김은 아래 vrm 분기에서 합성한다.
    setWardrobeState(restoredWardrobe);
    setWardrobeAutoHide(restoredWardrobeAutoHide);
    setVrmPropItems(plan.propsItems);
    const restoredSceneProps = parseSceneProps(plan.sceneProps, SCENE_PROP_IDS);
    setActiveProps(restoredSceneProps.active);
    setPropAttachments(restoredSceneProps.attachments);
    setSelectedPropId(null);
    setVrmPhysics(restoredPhysics);
    // materialFx 는 별도 저장/공유 payload에 담기지만(poseMetadata.materialFx), FullVrmState 경로
    // (undo/redo·저장한 포즈 불러오기·공유 데이터URL 붙여넣기)에서 빠지면 재질 효과가 조용히
    // 사라진다 — plan에 실려 왔으면 항상 state로 복원한다(없으면 기본값으로 되돌려 이전 값이
    // 눌어붙지 않게 한다).
    setMaterialFx(plan.materialFx ?? DEFAULT_VRM_MATERIAL_FX);
    setCustomColors({ ...restoredColors });
    setAvatarForgeState(parseAvatarForgeState(plan.avatarForge));

    persistentIkReconcileRevisionRef.current += 1;
    setPersistentIkReconciling(false);
    persistentIkResolvedSignatureRef.current = options.trustPersistentIkPose
      ? buildStudioVrmPersistentIkSignature({
          modelId: activeModelId,
          bones: plan.strippedBones,
          fingerEdits: plan.fingerOverrides ?? {},
          yOffset: plan.yOffset,
          translations: plan.poseTranslations,
          bodyRotation: plan.bodyRotation,
          bodyScale: plan.bodyScale ?? bodyScale,
          constraints: plan.ikConstraints,
          lockedPoseBones,
          jointProfile: rigJointProfile,
          fullBodyIk: fullBodyIkEnabled,
          footPlant: footPlantEnabled,
          floorHeight: rigFloorHeight,
        })
      : "";

    if (vrm) {
      const meshes = collectCostumeMeshes(vrm);
      // costume은 사용자의 수동 편집만 소유하고, 워드로브 자동 숨김은 현재 전체 슬롯에서 매번
      // 파생한다. 이 둘을 state에 섞지 않아 equip/unequip가 수동 숨김을 되살리지 않는다.
      const effectiveCostume = mergeWardrobeCostumeVisibility(
        restoredCostume,
        restoredWardrobe,
        meshes,
        restoredWardrobeAutoHide,
      );
      setCostumeMeshes(meshes);
      setCostumeState(restoredCostume);
      setSelectedCostumeKey(null);
      applyCostumeState(meshes, effectiveCostume);
      applyFullState(vrm, s, {
        applyPose: (b, y, translations) => applyPoseToVrm(vrm, b, y, translations),
        applyExpr: (w) => applyExpressionWeightsToVrm(vrm, w),
        applyProps: (p) => setVrmPropItems(parseVrmProps(p).items),
        applySceneProps: (p) => {
          const next = parseSceneProps(p, SCENE_PROP_IDS);
          setActiveProps(next.active);
          setPropAttachments(next.attachments);
        },
        applyMaterialFx: (fx) => applyVrmMaterialFx(vrm, fx),
        applyCustomColors: (colors) => applyVrmCustomColors(vrm, colors),
      });
      if (countSpringBoneJoints(vrm) > 0) {
        applyVrmSpringBonePhysics(vrm, restoredPhysics);
        settleVrmPhysics(vrm);
      }
      applyRotationToVrm(vrm, plan.bodyRotation);
      if (!plan.customColors) applyVrmCustomColors(vrm, DEFAULT_VRM_CUSTOM_COLORS);
    } else {
      setCostumeState(restoredCostume);
      setSelectedCostumeKey(null);
    }
  }

  // Use the exact same factory the tests use so handlers execute shipped code
  const loadHandlers = createFullStateLoadHandlers({
    savedFullStates,
    commitFullStateRestore,
    vrmRef,
    setActivePoseId,
    setCustomColors,
    alertFn: (m) => alert(m),
  });

  function handleLoadFullLocal(name: string) {
    loadHandlers.handleLoadFullLocal(name);
  }

  function handleExportPoses() {
    if (savedPoses.length === 0) return;
    try {
      const dataStr = JSON.stringify(savedPoses, null, 2);
      const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `toonspectrum_custom_poses_${Date.now()}.json`;
      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", dataUri);
      linkElement.setAttribute("download", exportFileDefaultName);
      linkElement.click();
    } catch (_e) {
      alert("포즈 내보내기에 실패했습니다.");
    }
  }

  function handleImportPoses() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (event) => {
      const target = event.target as HTMLInputElement;
      if (!target.files || target.files.length === 0) return;
      const file = target.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const contents = e.target?.result as string;
          const parsed = JSON.parse(contents);
          if (!Array.isArray(parsed)) {
            alert("올바른 포즈 파일 형식이 아닙니다 (배열 형태여야 함).");
            return;
          }
          
          const validPoses = parsed.filter((p) => p && typeof p === "object" && p.label && p.bones);
          if (validPoses.length === 0) {
            alert("가져올 수 있는 유효한 포즈 데이터가 없습니다.");
            return;
          }
          
          if (globalThis.confirm(`${validPoses.length}개의 포즈를 가져올까요? (기존 포즈에 추가됩니다)`)) {
            const sanitized = validPoses.map((p) => ({
              ...p,
              id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` // NOSONAR S2245 비암호화 용도(시각효과/ID 생성)
            }));
            const next = [...savedPoses, ...sanitized];
            setSavedPoses(next);
            localStorage.setItem("studio_custom_poses", JSON.stringify(next));
          }
        } catch (_err) {
          alert("파일 읽기 또는 파싱에 실패했습니다.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  useEffect(() => {
    if (!shouldLoadSharedPoseLibrary({
      editorOpen: open,
      posePanelActive: activePanelTab === "pose",
      libraryExpanded: sharedPoseLibraryOpen,
    })) return;

    void loadSharedPoseCatalog(0, false);

    return () => {
      cancelPendingSharedPoseCatalog();
      cancelPendingSharedPoseSelection();
    };
  }, [
    activePanelTab,
    open,
    sharedPoseLibraryOpen,
    sharedPoseReloadToken,
    loadSharedPoseCatalog,
    cancelPendingSharedPoseCatalog,
    cancelPendingSharedPoseSelection,
  ]);

  async function handleSharePoseToServer() {
    if (isSharingPose) {
      cancelPendingPoseShare();
      return;
    }

    const currentCapture = captureRef.current;
    const currentVrm = vrmRef.current;

    if (!currentCapture.gl || !currentCapture.scene || !currentCapture.camera || !currentVrm) {
      alert("공유할 VRM 장면이 아직 준비되지 않았습니다.");
      return;
    }
    if (!persistentIkCaptureIsReady()) {
      setJointHandleStatus("손·발 고정점을 현재 포즈에 맞추는 중입니다. 완료 후 다시 공유해 주세요.");
      return;
    }
    const hasLockedConstraint = ikConstraints.some((constraint) => (
      constraint.enabled && constraint.locked
    ));
    if (hasLockedConstraint && (webcamActive || idleAnimation)) {
      setJointHandleStatus("실시간 추적·대기 애니메이션을 끈 뒤 고정점이 있는 포즈를 공유해 주세요.");
      return;
    }

    const title = globalThis.prompt("서버에 공유할 포즈의 이름을 입력해주세요 (최대 30자):");
    if (!title) return;

    if (title.length > 30) {
      alert("이름은 최대 30자까지 가능합니다.");
      return;
    }
    if (!globalThis.confirm(
      "이 포즈 이미지와 모델·의상·소품 표현을 ToonSpectrum 표준 사용권으로 공유할 권한이 있으며, 타인의 권리를 침해하지 않음을 확인합니까?"
    )) return;

    const name = `[3D_POSE] ${title}`;
    const sharePoseSignature = currentPersistentIkSignature();
    const shareDynamicPoseGeneration = dynamicPoseGenerationRef.current;

    cancelPendingPoseShare();
    const controller = new AbortController();
    sharePoseAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, STUDIO_VRM_SHARE_TIMEOUT_MS);
    setIsSharingPose(true);
    let releaseCaptureHelpers: (() => void) | null = acquireVrmCaptureHelperLease();
    const releaseLocalCapture = () => {
      releaseCaptureHelpers?.();
      releaseCaptureHelpers = null;
    };
    try {
      const { camera, gl, scene } = currentCapture;
      // Give React/R3F one committed paint so ephemeral bone/IK helpers are absent from the
      // explicitly rendered sharing frame. The direct Three visibility lease hides the shadow
      // synchronously as a second line of defence.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (
        vrmRef.current !== currentVrm ||
        captureRef.current.gl !== gl ||
        captureRef.current.scene !== scene ||
        captureRef.current.camera !== camera ||
        persistentIkCurrentSignatureRef.current !== sharePoseSignature ||
        pendingPersistentIkCommandRef.current !== null ||
        dynamicPoseGenerationRef.current !== shareDynamicPoseGeneration ||
        (hasLockedConstraint
          && (
            persistentIkResolvedSignatureRef.current !== sharePoseSignature
            || webcamActiveRef.current
            || idleAnimationRef.current
          ))
      ) {
        throw new Error("공유 캡처 장면이 변경되었습니다.");
      }
      if (!physicsPreview && countSpringBoneJoints(currentVrm) > 0) {
        settleVrmPhysics(currentVrm);
      }
      currentVrm.update(0);
      const { width, height } = roundExportSize(gl.domElement);
      const bakedPose = bakeStudioVrmRuntimePose(currentVrm);
      if (!bakedPose) throw new Error("공유할 VRM 자세를 회전 기반 데이터로 변환하지 못했습니다.");
      const poseMetadata = buildVrmPoseDataUrlMetadata({
        ...captureFullState(),
        bones: stripFingerBones(bakedPose.bones),
        yOffset: bakedPose.yOffset,
      }, modelName);
      const rgba = captureStudioVrmRgba(gl, scene, camera, { width, height });
      const hashPayload = encodeURIComponent(JSON.stringify(poseMetadata));
      // Raw GPU readback is complete. Restore capture-only helpers before Worker compression or
      // network I/O so slow encoding/upload cannot keep the interactive viewport altered.
      releaseLocalCapture();
      const baseDataUrl = await encodeStudioVrmCapturePngDataUrl(
        rgba,
        { width, height },
        { signal: controller.signal, timeoutMs: STUDIO_VRM_CAPTURE_PNG_TIMEOUT_MS },
      );
      const fullDataUrl = `${baseDataUrl}#${hashPayload}`;

      if (
        controller.signal.aborted
        || persistentIkCurrentSignatureRef.current !== sharePoseSignature
        || pendingPersistentIkCommandRef.current !== null
        || dynamicPoseGenerationRef.current !== shareDynamicPoseGeneration
      ) return;
      await publishAsset({
        name,
        description: `${modelName || "VRM 캐릭터"}의 재편집 가능한 3D 데생 포즈`,
        tags: ["VRM", "3D 데생 인형", "포즈"],
        dataUrl: fullDataUrl,
        width,
        height,
        kind: "vrm_pose",
        license: "toonspectrum-standard",
        containsAi: false,
        rightsConfirmed: true,
      }, controller.signal);

      alert("포즈가 성공적으로 서버에 공유되었습니다!");
      setSharedPoseReloadToken((token) => token + 1);
    } catch (e) {
      if (controller.signal.aborted) {
        if (timedOut) {
          alert("포즈 공유가 30초 안에 완료되지 않아 중단했습니다. 공유 목록을 확인한 뒤 다시 시도해 주세요.");
        }
        return;
      }
      console.error(e);
      alert(getErrorMessage(e, "포즈 공유에 실패했습니다."));
    } finally {
      window.clearTimeout(timeoutId);
      releaseLocalCapture();
      if (sharePoseAbortRef.current === controller) {
        sharePoseAbortRef.current = null;
        setIsSharingPose(false);
      }
    }
  }

  // Effect Event so the dispose runs on true unmount only. With the cancel* callbacks as deps, any
  // identity churn re-fires this cleanup, bumping loadRequestRef while modelLoadTargetIdRef still
  // reads "in progress" — the open effect then skips the reload and the poser sits on
  // status="loading" forever.
  const disposeVrmOnUnmount = useEffectEvent(() => {
    cancelPendingInsertCapture();
    cancelPendingPoseShare();
    cancelPendingSharedPoseCatalog();
    cancelPendingSharedPoseSelection();
    jointIkTransactionRef.current = null;
    loadRequestRef.current += 1;
    modelLoadTargetIdRef.current = null;
    if (vrmRef.current) {
      disposeVrm(vrmRef.current);
      vrmRef.current = null;
    }
  });

  useEffect(() => {
    return () => disposeVrmOnUnmount();
  }, []);

  useEffect(() => {
    if (open) return;
    cancelPendingInsertCapture();
    cancelPendingPoseShare();
    cancelPendingSharedPoseCatalog();
    cancelPendingSharedPoseSelection();
    captureRequestRef.current += 1;
    jointIkTransactionRef.current = null;
    loadRequestRef.current += 1;
    thumbnailRequestRef.current += 1;
    captureHelperLeaseCountRef.current = 0;
    modelLoadTargetIdRef.current = null;
    if (groundShadowRef.current) groundShadowRef.current.visible = true;
    if (envRootRef.current) envRootRef.current.visible = true;
    clearCurrentVrm();
    captureRef.current = { camera: null, gl: null, scene: null };
    setStatus("empty");
    setError("");
    setIsCapturing(false);
    setIsThumbnailCapturing(false);
    setIsSharingPose(false);
    setTexturePaintEyedropperActive(false);
    setIsViewportHandIkDragging(false);
    setJointHandleInteracting(false);
    setJointHandleStatus("");
    setSelectedJointHandle(null);
    setSelectedIkPole(null);
    setIkHandleDragMode("screen");
    setIkHandleAxisLock("free");
    setRigJointProfile("neutral");
    setFullBodyIkEnabled(false);
    setFootPlantEnabled(false);
    setRigFloorHeight(0);
    setMannequinMode(false);
    setActiveCameraId("front");
    setActiveProps([]);
    setPropAttachments({});
    setSelectedPropId(null);
    setVrmPropItems([]);
    setSelectedVrmPropUid(null);
    setCostumeState({ hidden: [], recolor: {} });
    setCostumeMeshes([]);
    setSelectedCostumeKey(null);
    setWardrobeState({});
    setWardrobeAutoHide(true);
    setWardrobeMetrics(null);
    setPropRigMetrics(DEFAULT_VRM_PROP_RIG_METRICS);
    setVrmPhysics(DEFAULT_VRM_PHYSICS);
    setPhysicsPreview(false);
    setSpringJointCount(0);
  }, [
    open,
    cancelPendingSharedPoseCatalog,
    cancelPendingSharedPoseSelection,
    cancelPendingPoseShare,
    cancelPendingInsertCapture,
  ]);

  const loadModelRef = useRef(loadModelFromLibraryEntry);
  loadModelRef.current = loadModelFromLibraryEntry;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLibraryStatus("loading");
    setLibraryError("");

    const resolveTargetEntry = (
      entries: VrmLibraryEntry[],
      pending: PendingPoseData | null
    ): VrmLibraryEntry | null => {
      if (pending?.modelHash) {
        return entries.find((entry) => entry.contentHash === pending.modelHash) ?? null;
      }
      if (pending?.modelId) {
        return entries.find((entry) => entry.id === pending.modelId) ?? null;
      }
      if (pending?.modelName) {
        return entries.find((entry) => entry.name === pending.modelName) ?? null;
      }
      return entries.find((entry) => entry.id === activeModelIdRef.current) ?? entries[0] ?? null;
    };

    const loadResolvedEntry = (entries: VrmLibraryEntry[]): void => {
      const targetEntry = resolveTargetEntry(entries, pendingPoseDataRef.current);
      if (!targetEntry) {
        setStatus("error");
        setLibraryStatus("error");
        setLibraryError("이 장면이 사용하는 VRM 모델을 찾지 못했습니다. 프로젝트 모델 attachment를 먼저 복원해 주세요.");
        return;
      }
      // Skip only when this model is actually installed. A matching target id alone is not
      // enough — a cancelled in-flight load leaves the id set with vrmRef null, which would
      // strand the poser on "loading".
      if (modelLoadTargetIdRef.current === targetEntry.id && vrmRef.current) return;
      loadModelRef.current(targetEntry);
    };

    // Kick the sample load whenever nothing is installed yet (covers Strict Mode remount).
    if (
      pendingPoseDataRef.current === null
      && activeModelIdRef.current === SAMPLE_VRM_ID
      && !vrmRef.current
    ) {
      loadModelRef.current(SAMPLE_VRM_ENTRIES[0]);
    }

    listVrmLibraryEntries()
      .then((entries) => {
        if (cancelled) return;
        setLibraryEntries(entries);
        setLibraryStatus("ready");
        loadResolvedEntry(entries);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;
        setLibraryEntries(SAMPLE_VRM_ENTRIES);
        setLibraryStatus("error");
        setLibraryError(getErrorMessage(caughtError, "저장된 VRM 라이브러리를 불러오지 못했습니다."));
        loadResolvedEntry(SAMPLE_VRM_ENTRIES);
      });

    return () => {
      cancelled = true;
      // Let the next pass start a fresh load after a Strict Mode remount.
      loadRequestRef.current += 1;
      modelLoadTargetIdRef.current = null;
    };
  }, [initialSceneModelIdentity, open]);

  useEffect(() => {
    if (
      !open
      || status !== "ready"
      || texturePaintPersistenceStatus !== "ready"
      || !vrm
      || !activeLibraryEntry
      || activeLibraryEntry.thumbnail
    ) return;
    const hasLockedConstraint = ikConstraints.some((constraint) => (
      constraint.enabled && constraint.locked
    ));
    const signature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: customBones,
      fingerEdits,
      yOffset: customYOffset,
      translations: poseTranslations,
      bodyRotation,
      bodyScale,
      constraints: ikConstraints,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    if (
      hasLockedConstraint
      && (persistentIkReconciling || persistentIkResolvedSignatureRef.current !== signature)
    ) return;

    const requestId = thumbnailRequestRef.current + 1;
    thumbnailRequestRef.current = requestId;
    const releaseCaptureHelpers = acquireVrmCaptureHelperLease();
    let finished = false;
    let secondFrame: number | null = null;
    setIsThumbnailCapturing(true);
    const finish = () => {
      if (finished) return;
      finished = true;
      releaseCaptureHelpers();
      setIsThumbnailCapturing(false);
    };
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        try {
          if (requestId !== thumbnailRequestRef.current) return;

          const currentCapture = captureRef.current;
          if (!currentCapture.gl || !currentCapture.scene || !currentCapture.camera) return;

          const { width, height } = roundThumbnailCaptureSize(currentCapture.gl.domElement);
          const rgba = captureStudioVrmRgba(
            currentCapture.gl,
            currentCapture.scene,
            currentCapture.camera,
            { width, height },
          );
          const thumbnail = createCharacterThumbnail(rgba, width, height);
          if (!thumbnail) return;

          setLibraryEntries((entries) => entries.map((entry) => (entry.id === activeLibraryEntry.id ? { ...entry, thumbnail } : entry)));
          saveVrmThumbnail(activeLibraryEntry.id, thumbnail).catch((caughtError: unknown) => {
            setLibraryError(getErrorMessage(caughtError, "썸네일을 저장하지 못했습니다."));
          });
        } catch (caughtError) {
          setLibraryError(getErrorMessage(caughtError, "썸네일을 만들지 못했습니다."));
        } finally {
          finish();
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) {
        cancelAnimationFrame(secondFrame);
      }
      finish();
    };
  }, [
    activeModelId,
    activeLibraryEntry,
    acquireVrmCaptureHelperLease,
    bodyRotation,
    bodyScale,
    customBones,
    customYOffset,
    fingerEdits,
    footPlantEnabled,
    fullBodyIkEnabled,
    ikConstraints,
    lockedPoseBones,
    open,
    persistentIkReconciling,
    poseTranslations,
    rigFloorHeight,
    rigJointProfile,
    status,
    texturePaintPersistenceStatus,
    vrm,
  ]);

  function clearCurrentVrm() {
    setIsViewportHandIkDragging(false);
    jointIkRevisionRef.current += 1;
    jointIkTransactionRef.current = null;
    persistentIkReconcileRevisionRef.current += 1;
    persistentIkResolvedSignatureRef.current = "";
    pendingPersistentIkCommandRef.current = null;
    setPersistentIkReconciling(false);
    setIkConstraints([]);
    setJointHandleInteracting(false);
    setJointHandleSessionGeneration((generation) => generation + 1);
    if (vrmRef.current) {
      disposeVrm(vrmRef.current);
      vrmRef.current = null;
    }
    modelLoadTargetIdRef.current = null;
    setInstalledModelId(null);
    setVrm(null);
  }

  function installVrm(nextVrm: VRM, nextModelName: string, nextModelId: string) {
    resetFullStateHistory();
    clearCurrentVrm();
    vrmRef.current = nextVrm;
    setVrm(nextVrm);
    setModelName(nextModelName);
    setActiveModelId(nextModelId);
    setInstalledModelId(nextModelId);
    modelLoadTargetIdRef.current = nextModelId;
    // 워드로브 실측 — 반드시 포즈 적용 전(정규화 rest)에 측정해 모델별 자동 핏의 기준으로 삼는다.
    setWardrobeMetrics(measureVrmWardrobeMetrics(nextVrm));
    setPropRigMetrics(measureVrmPropRigMetrics(nextVrm));

    const pending = pendingPoseDataRef.current;
    if (pending) {
      pendingPoseDataRef.current = null;

      const bones = pending.bones || {};
      const yOffset = typeof pending.yOffset === "number" ? pending.yOffset : 0;
      const expressionWeights = pending.expressionWeights || {};

      const pendingFull = serializeFullVrmState({
        modelId: nextModelId,
        poseId: pending.poseId,
        bones: bones,
        yOffset,
        poseTranslations: pending.poseTranslations,
        ikConstraints: pending.ikConstraints,
        bodyRotation: pending.bodyRotation,
        expressionId: pending.expressionId,
        expressionWeights,
        bodyScale: pending.bodyScale,
        fingerOverrides: pending.fingerOverrides,
        lighting: pending.lighting,
        env: pending.env,
        costume: pending.costume,
        wardrobe: pending.wardrobe,
        props: pending.vrmProps,
        sceneProps: pending.sceneProps,
        physics: pending.physics,
        materialFx: pending.materialFx,
        avatarForge: pending.avatarForge,
        customColors: pending.customColors,
      });
      commitFullStateRestore(pendingFull, nextVrm);
      setMannequinMode(pending.mannequin ?? false);
      const cameraToRestore = pending.camera ?? pendingCameraRestoreRef.current;
      pendingCameraRestoreRef.current = null;
      if (cameraToRestore) {
        requestAnimationFrame(() => {
          viewportApiRef.current?.restoreCamera(cameraToRestore);
        });
      }
    } else {
      // 스폰 기본 포즈: T-포즈 대신 캐릭터 id로 결정되는 자연 아이들 포즈를 적용한다.
      const spawnPose = pickNaturalIdlePose(nextModelId);
      const strippedSpawn = stripFingerBones(spawnPose.bones);
      const spawnFingers = extractStudioVrmFingerRotations(spawnPose.bones);
      setActivePoseId(spawnPose.id);
      setCustomBones(strippedSpawn);
      setFingerEdits(spawnFingers);
      setCustomYOffset(spawnPose.yOffset ?? 0);
      setPoseTranslations(cloneStudioVrmPoseTranslations(EMPTY_STUDIO_VRM_POSE_TRANSLATIONS));
      setActiveExpressionId("neutral");
      setExpressionWeights({});
      setBodyRotation(0);
      applyRotationToVrm(nextVrm, 0);
      setMannequinMode(false);
      setCustomColors({ ...DEFAULT_VRM_CUSTOM_COLORS });
      setMaterialFx(DEFAULT_VRM_MATERIAL_FX);
      setAvatarForgeState(createAvatarForgeState());
      applyPoserVisualState(nextVrm, {
        bones: strippedSpawn,
        yOffset: spawnPose.yOffset ?? 0,
        poseTranslations: EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
        fingerEdits: spawnFingers,
        bodyScale,
      });
      applyExpressionWeightsToVrm(nextVrm, {});
      applyVrmCustomColors(nextVrm, DEFAULT_VRM_CUSTOM_COLORS);
      applyVrmMaterialFx(nextVrm, DEFAULT_VRM_MATERIAL_FX);
      // Heal any load-race near-black lit×map collapses before the first ready frame.
      repairVrmTexturedNearBlackLitFactors(nextVrm);
      // 본 부착 소품·워드로브 초기화.
      setVrmPropItems([]);
      setSelectedVrmPropUid(null);
      setWardrobeState({});
      setWardrobeAutoHide(true);
      // 의상 메시 수집 + 상태 초기화 (머티리얼 clone 없이 목록만 — 원본 알베도 유지).
      const meshes = collectCostumeMeshes(nextVrm);
      setCostumeMeshes(meshes);
      const freshCostume: CostumeState = { hidden: [], recolor: {} };
      setCostumeState(freshCostume);
      setSelectedCostumeKey(null);
      applyCostumeState(meshes, freshCostume);
      // 물리 초기화 + 정착(머리카락/치마 자연 정착).
      setVrmPhysics(DEFAULT_VRM_PHYSICS);
      setPhysicsPreview(false);
      const joints = countSpringBoneJoints(nextVrm);
      setSpringJointCount(joints);
      if (joints > 0) {
        applyVrmSpringBonePhysics(nextVrm, DEFAULT_VRM_PHYSICS);
        settleVrmPhysics(nextVrm);
      }
    }
    // Final safety pass after any pending full-state restore path as well.
    repairVrmTexturedNearBlackLitFactors(nextVrm);
    setStatus("ready");
  }

  function beginModelLoad(nextModelId: string) {
    resetFullStateHistory();
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    thumbnailRequestRef.current += 1;
    setActiveModelId(nextModelId);
    setStatus("loading");
    setError("");
    clearCurrentVrm();
    modelLoadTargetIdRef.current = nextModelId;
    return requestId;
  }

  function handleLoadFailure(requestId: number, caughtError: unknown) {
    if (requestId !== loadRequestRef.current) return;
    modelLoadTargetIdRef.current = null;
    setError(getVrmLoadErrorMessage(caughtError));
    setStatus("error");
  }

  function loadModelFromUrl(url: string, nextModelName: string, revokeUrl: boolean, nextModelId = SAMPLE_VRM_ID) {
    const requestId = beginModelLoad(nextModelId);

    loadVrmAsset(url)
      .then((loadedVrm) => {
        if (requestId !== loadRequestRef.current) {
          disposeVrm(loadedVrm);
          return;
        }
        try {
          installVrm(loadedVrm, nextModelName, nextModelId);
        } catch (installError: unknown) {
          // An install throw would otherwise leak the loaded scene and leave status on "loading".
          disposeVrm(loadedVrm);
          handleLoadFailure(requestId, installError);
        }
      })
      .catch((caughtError: unknown) => {
        handleLoadFailure(requestId, caughtError);
      })
      .finally(() => {
        if (revokeUrl) {
          URL.revokeObjectURL(url);
        }
      });
  }

  function loadModelFromLibraryEntry(entry: VrmLibraryEntry) {
    if (entry.source === "sample") {
      const sampleUrl = selectableSampleVrmUrl(entry.id);
      if (!sampleUrl) {
        const requestId = beginModelLoad(entry.id);
        handleLoadFailure(
          requestId,
          new Error(
            isBundledVrmRightsBlocked(entry.id)
              ? "이 번들 VRM은 재배포·상업 이용 권리가 확인되지 않아 불러올 수 없습니다."
              : "등록되지 않은 번들 VRM은 불러올 수 없습니다.",
          ),
        );
        return;
      }
      rememberCharacterSelection(entry.id);
      loadModelFromUrl(sampleUrl, entry.name, false, entry.id);
      return;
    }

    rememberCharacterSelection(entry.id);
    const requestId = beginModelLoad(entry.id);

    void (async () => {
      try {
        const storedModel = await getStoredVrmModel(entry.id);
        if (requestId !== loadRequestRef.current) return;
        if (!storedModel) {
          throw new Error("저장된 VRM 파일을 찾지 못했습니다.");
        }

        const objectUrl = URL.createObjectURL(storedModel.blob);
        try {
          const loadedVrm = await loadVrmAsset(objectUrl);
          if (requestId !== loadRequestRef.current) {
            disposeVrm(loadedVrm);
            return;
          }
          installVrm(loadedVrm, storedModel.name, storedModel.id);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } catch (caughtError: unknown) {
        handleLoadFailure(requestId, caughtError);
      }
    })();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []).filter((file) => /\.vrm$/i.test(file.name));
    event.currentTarget.value = "";
    if (files.length === 0) return;

    setIsUploading(true);
    setLibraryError("");

    try {
      const savedModels = await Promise.all(files.map((file) => saveUploadedVrm(file)));
      const nextEntries = await listVrmLibraryEntries();
      setLibraryEntries(nextEntries);
      setLibraryStatus("ready");

      const firstUploadedEntry = nextEntries.find((entry) => entry.id === savedModels[0]?.id);
      if (firstUploadedEntry) {
        loadModelFromLibraryEntry(firstUploadedEntry);
      }
    } catch (caughtError: unknown) {
      setLibraryStatus("error");
      setLibraryError(getErrorMessage(caughtError, "VRM 파일을 라이브러리에 저장하지 못했습니다."));
    } finally {
      setIsUploading(false);
    }
  }

  function handleSampleLoad() {
    loadModelFromLibraryEntry(SAMPLE_VRM_ENTRIES[0]);
  }

  async function handleDeleteEntry(entry: VrmLibraryEntry) {
    if (entry.source !== "indexed-db") return;

    setDeletingModelId(entry.id);
    setLibraryError("");

    try {
      await deleteStoredVrmModel(entry.id);
      const nextEntries = await listVrmLibraryEntries();
      setLibraryEntries(nextEntries);
      setLibraryStatus("ready");
      if (activeModelId === entry.id) {
        loadModelFromLibraryEntry(SAMPLE_VRM_ENTRIES[0]);
      }
    } catch (caughtError: unknown) {
      setLibraryStatus("error");
      setLibraryError(getErrorMessage(caughtError, "VRM을 삭제하지 못했습니다."));
    } finally {
      setDeletingModelId(null);
    }
  }

  function handlePoseSelect(poseId: string) {
    const pose = findPose(poseId);
    const strippedBones = stripFingerBones(pose.bones);
    const poseFingers = extractStudioVrmFingerRotations(pose.bones);
    const nextYOffset = pose.yOffset ?? 0;
    const nextTranslations = cloneStudioVrmPoseTranslations(EMPTY_STUDIO_VRM_POSE_TRANSLATIONS);
    const before = captureFullState();
    const plan = createStudioVrmPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      incomingBones: strippedBones,
      ...(Object.keys(poseFingers).length > 0 ? { incomingFingerEdits: poseFingers } : {}),
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => {
        const humanoid = vrmRef.current?.humanoid;
        if (!humanoid) return true;
        return Boolean(humanoid.getNormalizedBoneNode(bone));
      },
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radians) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radians),
          ))
        : undefined,
    });
    const after = serializeFullVrmState({
      ...before,
      poseId,
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
      yOffset: nextYOffset,
      poseTranslations: nextTranslations,
      ...(preserveExpression
        ? {}
        : { expressionId: "neutral", expressionWeights: {} }),
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setActivePoseId(poseId);
    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    setCustomYOffset(nextYOffset);
    setPoseTranslations(nextTranslations);
    if (!preserveExpression) {
      setExpressionWeights({});
      setActiveExpressionId("neutral");
    }
    const nextRecent = rememberStudioVrmRecent(recentPoseState, poseId);
    setRecentPoseState(nextRecent);
    saveStudioVrmRecentPoses(typeof localStorage === "undefined" ? null : localStorage, nextRecent);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, {
        bones: plan.bones,
        yOffset: nextYOffset,
        poseTranslations: nextTranslations,
        fingerEdits: plan.fingerEdits,
        bodyScale,
      });
      applyExpressionWeightsToVrm(
        vrmRef.current,
        preserveExpression ? expressionWeights : {},
      );
    }
    const appliedCount = plan.appliedBodyBones.length + plan.appliedFingerBones.length;
    if (plan.skippedLocked.length > 0) {
      setJointHandleStatus(
        appliedCount > 0
          ? `잠긴 관절 ${plan.skippedLocked.length}개는 유지하고 포즈를 적용했어요.`
          : `잠긴 관절 ${plan.skippedLocked.length}개는 유지하고, 적용할 관절이 없어 높이만 반영했어요.`,
      );
    } else if (appliedCount === 0 && plan.skippedMissing.length + plan.skippedInvalid.length > 0) {
      setJointHandleStatus("적용할 수 있는 관절이 없어 높이만 반영했어요.");
    }
  }

  function handleResetActivePose(): void {
    if (activePoseId.startsWith("custom-")) {
      const savedPose = savedPoses.find((pose) => pose.id === activePoseId);
      if (savedPose) handleCustomPoseSelect(savedPose);
      return;
    }
    const preset = findPoseById(activePoseId);
    if (preset) handlePoseSelect(preset.id);
  }

  function rememberCharacterSelection(modelId: string) {
    const nextRecent = rememberStudioVrmRecent(recentCharacterState, modelId);
    setRecentCharacterState(nextRecent);
    saveStudioVrmRecentCharacters(typeof localStorage === "undefined" ? null : localStorage, nextRecent);
  }

  function handlePhotoPoseApply(payload: StudioVrmPhotoPoseApplyPayload) {
    const currentVrm = vrmRef.current;
    if (
      !currentVrm
      || poseMaterialRuntimeDisabled
      || pendingPersistentIkCommandRef.current
      || jointIkTransactionRef.current
      || !persistentIkCaptureIsReady()
    ) return false;

    const before = captureFullState();
    const plan = createStudioVrmPhotoPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      scannedBones: payload.bones,
      scannedFingerEdits: payload.fingerEdits,
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => Boolean(currentVrm.humanoid?.getNormalizedBoneNode(bone)),
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radians) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radians),
          ))
        : undefined,
    });
    if (plan.appliedBodyBones.length === 0 && plan.appliedFingerBones.length === 0) {
      setJointHandleStatus("사진에서 적용할 수 있는 잠금 해제 관절을 찾지 못했습니다.");
      return false;
    }

    const poseId = "photo-scan";
    const after = serializeFullVrmState({
      ...before,
      poseId,
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
    });
    const candidateSignature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: plan.bones,
      fingerEdits: plan.fingerEdits,
      yOffset: after.yOffset,
      translations: after.poseTranslations,
      bodyRotation: after.bodyRotation,
      bodyScale: after.bodyScale ?? bodyScale,
      constraints: after.ikConstraints,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    if (
      after.ikConstraints.some((constraint) => constraint.enabled && constraint.locked)
      && persistentIkResolvedSignatureRef.current !== candidateSignature
    ) {
      pendingPersistentIkCommandRef.current = {
        before,
        candidateAfter: after,
        inputSignature: candidateSignature,
        historyGeneration: fullStateHistoryRef.current.generation,
      };
      setPersistentIkReconciling(true);
    } else {
      const nextHistory = commitStudioVrmFullStateHistoryTransaction(
        fullStateHistoryRef.current,
        before,
        after,
        activeModelId,
      );
      fullStateHistoryRef.current = nextHistory;
      setCanUndo(nextHistory.index > 0);
      setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    }

    setActivePoseId(poseId);
    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    const nextEffectiveFingers = resolveStudioVrmFingerAuthority(
      plan.fingerEdits,
      createAutoGripFingerOverrides(
        vrmPropItems,
        propDefById,
        effectivePropRigMetrics,
      ),
    );
    applyPoserVisualState(currentVrm, {
      bones: plan.bones,
      yOffset: customYOffset,
      poseTranslations,
      fingerEdits: nextEffectiveFingers,
      bodyScale,
    });
    setJointHandleStatus(
      `사진 포즈 관절 ${plan.appliedBodyBones.length}개${
        payload.detectedHandSides.length > 0
          ? ` · 손가락 ${plan.appliedFingerBones.length}개`
          : ""
      }를 적용했습니다.`,
    );
    return true;
  }

  function applyLightingQuickPreset(presetId: string) {
    const preset = findStudioVrmLightingQuickPreset(presetId);
    setLighting({
      intensity: preset.intensity,
      colorTemp: preset.colorTemp,
      directionDeg: preset.directionDeg,
    });
    if (preset.tone) setLightingTone(preset.tone);
  }

  // 포즈 좌우 반전 — 전체뿐 아니라 팔/다리만 교환해 포즈 믹서처럼 사용할 수 있다.
  // 회전은 lock-aware plan으로 잠긴 관절을 유지하고, 이동/IK 제약은 기존처럼 미러한다.
  function handleMirrorPose(scope: StudioVrmPoseMirrorScope = "all") {
    if (!vrm) return;
    const mirroredBones = mirrorStudioVrmPoseBones(customBones, scope);
    const mirroredFingers = mirrorStudioVrmFingerRotations(fingerEdits, scope);
    const mirroredTranslations = mirrorStudioVrmPoseTranslations(poseTranslations, scope);
    const mirroredConstraints = mirrorStudioVrmIkConstraints(ikConstraints, scope);
    const before = captureFullState();
    const plan = createStudioVrmPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      incomingBones: mirroredBones,
      incomingFingerEdits: mirroredFingers,
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => {
        const humanoid = vrmRef.current?.humanoid;
        if (!humanoid) return true;
        return Boolean(humanoid.getNormalizedBoneNode(bone));
      },
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radians) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radians),
          ))
        : undefined,
    });
    const after = serializeFullVrmState({
      ...before,
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
      poseTranslations: mirroredTranslations,
      ikConstraints: mirroredConstraints,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    setPoseTranslations(mirroredTranslations);
    setIkConstraints(mirroredConstraints);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, {
        bones: plan.bones,
        yOffset: customYOffset,
        poseTranslations: mirroredTranslations,
        fingerEdits: plan.fingerEdits,
        bodyScale,
      });
    }
    if (plan.skippedLocked.length > 0) {
      setJointHandleStatus(
        `잠긴 관절 ${plan.skippedLocked.length}개는 유지하고 좌우 반전을 적용했어요.`,
      );
    }
  }

  function commitIkConstraintSettings(
    nextConstraints: readonly StudioVrmIkConstraint[],
    statusMessage: string,
  ) {
    cancelJointIkTransaction({ restoreBaseline: false });
    const before = captureFullState();
    const canonical = cloneStudioVrmIkConstraints(nextConstraints);
    const after = serializeFullVrmState({ ...before, ikConstraints: canonical });
    const candidateSignature = buildStudioVrmPersistentIkSignature({
      modelId: activeModelId,
      bones: before.bones,
      fingerEdits: before.fingerOverrides ?? {},
      yOffset: before.yOffset,
      translations: before.poseTranslations,
      bodyRotation: before.bodyRotation,
      bodyScale: before.bodyScale ?? bodyScale,
      constraints: canonical,
      lockedPoseBones,
      jointProfile: rigJointProfile,
      fullBodyIk: fullBodyIkEnabled,
      footPlant: footPlantEnabled,
      floorHeight: rigFloorHeight,
    });
    if (
      canonical.some((constraint) => constraint.enabled && constraint.locked)
      && persistentIkResolvedSignatureRef.current !== candidateSignature
    ) {
      pendingPersistentIkCommandRef.current = {
        before,
        candidateAfter: after,
        inputSignature: candidateSignature,
        historyGeneration: fullStateHistoryRef.current.generation,
      };
      setPersistentIkReconciling(true);
    } else {
      const nextHistory = commitStudioVrmFullStateHistoryTransaction(
        fullStateHistoryRef.current,
        before,
        after,
        activeModelId,
      );
      fullStateHistoryRef.current = nextHistory;
      setCanUndo(nextHistory.index > 0);
      setCanRedo(nextHistory.index < nextHistory.entries.length - 1);
    }
    setIkConstraints(canonical);
    setJointHandleStatus(statusMessage);
  }

  function handleStraightenUpperBody() {
    if (!vrm) return;
    const straightenedBones = straightenStudioVrmUpperBody(customBones);
    const before = captureFullState();
    const plan = createStudioVrmPoseApplyPlan({
      currentBones: customBones,
      currentFingerEdits: fingerEdits,
      incomingBones: straightenedBones,
      lockedBones: lockedPoseBones,
      isBoneAvailable: (bone) => {
        const humanoid = vrmRef.current?.humanoid;
        if (!humanoid) return true;
        return Boolean(humanoid.getNormalizedBoneNode(bone));
      },
      clampRotation: jointLimitsEnabled
        ? (bone, axisIndex, radians) => d(clampStudioVrmJointDegrees(
            bone,
            axisIndex,
            THREE.MathUtils.radToDeg(radians),
          ))
        : undefined,
    });
    const after = serializeFullVrmState({
      ...before,
      bones: plan.bones,
      fingerOverrides: plan.fingerEdits,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setCustomBones(plan.bones);
    setFingerEdits(plan.fingerEdits);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, {
        bones: plan.bones,
        yOffset: customYOffset,
        poseTranslations,
        fingerEdits: plan.fingerEdits,
        bodyScale,
      });
    }
    if (plan.skippedLocked.length > 0) {
      setJointHandleStatus(
        `잠긴 관절 ${plan.skippedLocked.length}개는 유지하고 상체를 곧게 펴 적용했어요.`,
      );
    }
  }

  function togglePoseBoneLock(boneName: VRMHumanBoneName) {
    if (jointHandleInteracting || jointIkTransactionRef.current) {
      cancelJointIkTransaction({ status: "진행 중인 IK 이동을 취소하고 관절 잠금을 변경했습니다." });
    }
    if (!lockedPoseBones.includes(boneName)) {
      const conflictsWithPin = ikConstraints.some((constraint) => {
        if (!constraint.enabled || !constraint.locked) return false;
        const chain = STUDIO_VRM_USER_IK_CHAINS[constraint.effector];
        return [chain.upper, chain.lower, chain.end].includes(boneName);
      });
      if (conflictsWithPin) {
        setJointHandleStatus("이 관절은 유지 중인 손·발 고정점이 사용합니다. 먼저 고정점 유지를 해제해 주세요.");
        return;
      }
    }
    setLockedPoseBones((current) =>
      current.includes(boneName)
        ? current.filter((candidate) => candidate !== boneName)
        : [...current, boneName]
    );
  }

  function selectViewportPoseBone(boneName: VRMHumanBoneName) {
    setSelectedViewportPoseBone(boneName);
    const category = BONE_CATEGORIES.find((candidate) => candidate.bones.includes(boneName));
    if (category) setActiveCategory(category.id);
    requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(`[data-vrm-pose-bone="${boneName}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function handleViewportHandIkDrag(
    boneName: VRMHumanBoneName,
    target: readonly [number, number, number],
    phase: "start" | "move" | "end",
  ) {
    const currentVrm = vrmRef.current;
    if (
      !currentVrm ||
      !viewportHandIkEnabled ||
      (boneName !== "leftHand" && boneName !== "rightHand") ||
      target.some((value) => !Number.isFinite(value) || Math.abs(value) > 100)
    ) {
      if (phase === "end") setIsViewportHandIkDragging(false);
      return;
    }
    const side = boneName === "leftHand" ? "left" : "right";
    const chain = [
      `${side}UpperArm`,
      `${side}LowerArm`,
      `${side}Hand`,
    ] as const satisfies readonly VRMHumanBoneName[];
    if (chain.some((chainBone) => lockedPoseBones.includes(chainBone))) {
      if (phase === "end") setIsViewportHandIkDragging(false);
      return;
    }
    if (phase === "start") {
      setIsViewportHandIkDragging(true);
      setTurntable(false);
    }
    const applied = applyVrmTwoBoneGrip(
      currentVrm,
      side,
      new THREE.Vector3(target[0], target[1], target[2]),
      1,
    );
    if (phase !== "end") return;
    setIsViewportHandIkDragging(false);
    if (!applied) return;

    const nextBones: PoseBoneMap = { ...customBones };
    for (const chainBone of chain) {
      const node = currentVrm.humanoid?.getNormalizedBoneNode(chainBone);
      if (!node) continue;
      const euler = new THREE.Euler().setFromQuaternion(node.quaternion, "XYZ");
      const rawDegrees = [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg);
      const rotation = rawDegrees.map((degrees, axisIndex) => (
        THREE.MathUtils.degToRad(
          jointLimitsEnabled
            ? clampStudioVrmJointDegrees(chainBone, axisIndex, degrees)
            : degrees,
        )
      )) as [number, number, number];
      nextBones[chainBone] = { rotation };
    }
    setCustomBones(nextBones);
    setActivePoseId("visual-hand-ik");
    applyPoserVisualState(currentVrm, {
      bones: nextBones,
      yOffset: customYOffset,
      poseTranslations,
      fingerEdits,
      bodyScale,
    });
  }

  function handleBoneRotationChange(boneName: string, axisIndex: number, degrees: number) {
    if (!vrm) return;
    const key = boneName as VRMHumanBoneName;
    if (lockedPoseBones.includes(key)) return;
    const safeDegrees = jointLimitsEnabled
      ? clampStudioVrmJointDegrees(key, axisIndex, degrees)
      : degrees;
    const radians = d(safeDegrees);
    const baked = bakeStudioVrmRuntimePose(vrm, STUDIO_VRM_DIRECT_EDIT_BONES);
    const bakedRotation = baked?.bones[key]?.rotation;
    setActivePoseId("manual-pose");
    if (POSER_FINGER_BONES.includes(key)) {
      // Single source of truth: fingers go to fingerEdits only
      setFingerEdits((prev) => {
        const current = prev[key]
          ? [...prev[key]] as [number, number, number]
          : bakedRotation
            ? [...bakedRotation] as [number, number, number]
            : [0, 0, 0];
        current[axisIndex] = radians;
        return {
          ...prev,
          [key]: jointLimitsEnabled ? clampStudioVrmJointRotation(key, current) : current,
        };
      });
      return;
    }
    setCustomBones((prev) => {
      const base = baked ? stripFingerBones(baked.bones) : prev;
      const current = bakedRotation
        ? [...bakedRotation] as [number, number, number]
        : [...getPoseBoneRotation(base[key])] as [number, number, number];
      current[axisIndex] = radians;
      return {
        ...base,
        [key]: {
          rotation: jointLimitsEnabled ? clampStudioVrmJointRotation(key, current) : current,
        },
      };
    });
  }

  function handleYOffsetChange(value: number) {
    setCustomYOffset(value);
  }

  // Quick finger curl updater for the 고도화 section (affects multiple segments for natural look)
  function updateFingerCurl(side: 'left' | 'right', curlDeg: number) {
    const rad = d(curlDeg);
    const sign = side === 'left' ? -1 : 1;
    const fingers = ['Index', 'Middle', 'Ring', 'Little'] as const;
    const segments = ['Proximal', 'Intermediate', 'Distal'] as const;
    setFingerEdits((prev) => {
      const next = { ...prev };
      fingers.forEach((f) => {
        segments.forEach((seg) => {
          const k = `${side}${f}${seg}` as VRMHumanBoneName;
          next[k] = [0, 0, sign * rad];
        });
        // thumb a bit less
        next[`${side}ThumbProximal` as VRMHumanBoneName] = [0, sign * rad * 0.6, sign * rad * 0.5];
        next[`${side}ThumbDistal` as VRMHumanBoneName] = [0, sign * rad * 0.4, 0];
      });
      return next;
    });
  }
  function applyHandPosePreset(side: 'left' | 'right', poseType: 'fist' | 'open' | 'point' | 'peace' | 'thumbsUp' | 'relaxed') {
    const sign = side === 'left' ? -1 : 1;
    setFingerEdits((prev) => {
      const next = { ...prev };
      const fingers = ['Index', 'Middle', 'Ring', 'Little'] as const;
      const segments = ['Proximal', 'Intermediate', 'Distal'] as const;
      
      if (poseType === 'open') {
        fingers.forEach((f) => {
          segments.forEach((seg) => {
            next[`${side}${f}${seg}` as VRMHumanBoneName] = [0, 0, 0];
          });
        });
        next[`${side}ThumbMetacarpal` as VRMHumanBoneName] = [0, 0, 0];
        next[`${side}ThumbProximal` as VRMHumanBoneName] = [0, 0, 0];
        next[`${side}ThumbDistal` as VRMHumanBoneName] = [0, 0, 0];
      } else if (poseType === 'fist') {
        const rad = d(85);
        fingers.forEach((f) => {
          segments.forEach((seg) => {
            next[`${side}${f}${seg}` as VRMHumanBoneName] = [0, 0, sign * rad];
          });
        });
        next[`${side}ThumbMetacarpal` as VRMHumanBoneName] = [0, 0, 0];
        next[`${side}ThumbProximal` as VRMHumanBoneName] = [0, sign * d(40), sign * d(40)];
        next[`${side}ThumbDistal` as VRMHumanBoneName] = [0, 0, sign * d(40)];
      } else if (poseType === 'point') {
        const curlRad = d(85);
        segments.forEach((seg) => {
          next[`${side}Index${seg}` as VRMHumanBoneName] = [0, 0, 0];
          next[`${side}Middle${seg}` as VRMHumanBoneName] = [0, 0, sign * curlRad];
          next[`${side}Ring${seg}` as VRMHumanBoneName] = [0, 0, sign * curlRad];
          next[`${side}Little${seg}` as VRMHumanBoneName] = [0, 0, sign * curlRad];
        });
        next[`${side}ThumbMetacarpal` as VRMHumanBoneName] = [0, 0, 0];
        next[`${side}ThumbProximal` as VRMHumanBoneName] = [0, sign * d(40), sign * d(40)];
        next[`${side}ThumbDistal` as VRMHumanBoneName] = [0, 0, sign * d(20)];
      } else if (poseType === 'peace') {
        const curlRad = d(85);
        segments.forEach((seg) => {
          next[`${side}Index${seg}` as VRMHumanBoneName] = [0, 0, 0];
          next[`${side}Middle${seg}` as VRMHumanBoneName] = [0, 0, 0];
          next[`${side}Ring${seg}` as VRMHumanBoneName] = [0, 0, sign * curlRad];
          next[`${side}Little${seg}` as VRMHumanBoneName] = [0, 0, sign * curlRad];
        });
        next[`${side}IndexProximal` as VRMHumanBoneName] = [0, 0, sign * d(-5)];
        next[`${side}MiddleProximal` as VRMHumanBoneName] = [0, 0, sign * d(5)];
        
        next[`${side}ThumbMetacarpal` as VRMHumanBoneName] = [0, 0, 0];
        next[`${side}ThumbProximal` as VRMHumanBoneName] = [0, sign * d(45), sign * d(40)];
        next[`${side}ThumbDistal` as VRMHumanBoneName] = [0, 0, sign * d(30)];
      } else if (poseType === 'thumbsUp') {
        const curlRad = d(85);
        fingers.forEach((f) => {
          segments.forEach((seg) => {
            next[`${side}${f}${seg}` as VRMHumanBoneName] = [0, 0, sign * curlRad];
          });
        });
        next[`${side}ThumbMetacarpal` as VRMHumanBoneName] = [0, 0, 0];
        next[`${side}ThumbProximal` as VRMHumanBoneName] = [0, sign * d(-20), sign * d(-20)];
        next[`${side}ThumbDistal` as VRMHumanBoneName] = [0, 0, sign * d(-15)];
      } else if (poseType === 'relaxed') {
        const rad = d(20);
        fingers.forEach((f) => {
          segments.forEach((seg) => {
            next[`${side}${f}${seg}` as VRMHumanBoneName] = [0, 0, sign * rad];
          });
        });
        next[`${side}ThumbProximal` as VRMHumanBoneName] = [0, sign * rad * 0.6, sign * rad * 0.5];
        next[`${side}ThumbDistal` as VRMHumanBoneName] = [0, sign * rad * 0.4, 0];
      }
      return next;
    });
  }

  function handleExpressionSelect(action: ExpressionAction) {
    setActiveExpressionId(action.id);
    const newWeights: Record<string, number> = {};
    if (action.name) {
      newWeights[action.name] = 1.0;
    }
    setExpressionWeights(newWeights);
    if (vrmRef.current) {
      applyExpressionWeightsToVrm(vrmRef.current, newWeights);
    }
  }

  // 표정 프리셋(조합) 원클릭 적용 — VRM 표준 blendshape 가중치 믹스를 한 번에 입힌다.
  // 모델에 없는 표정 이름은 applyExpressionWeightsToVrm이 건너뛴다.
  function handleExpressionPresetSelect(preset: StudioExpressionPreset) {
    const expressionId = `preset:${preset.id}`;
    const before = captureFullState();
    const plan = createStudioVrmExpressionApplyPlan({
      current: expressionWeights,
      incoming: preset.weights,
    });
    const nextWeights = { ...plan.weights };
    const after = serializeFullVrmState({
      ...before,
      expressionId,
      expressionWeights: nextWeights,
    });
    const nextHistory = commitStudioVrmFullStateHistoryTransaction(
      fullStateHistoryRef.current,
      before,
      after,
      activeModelId,
    );
    fullStateHistoryRef.current = nextHistory;
    setCanUndo(nextHistory.index > 0);
    setCanRedo(nextHistory.index < nextHistory.entries.length - 1);

    setActiveExpressionId(expressionId);
    setExpressionWeights(nextWeights);
    if (vrmRef.current) {
      applyExpressionWeightsToVrm(vrmRef.current, nextWeights);
    }
  }

  function updateExpressionWeight(name: string, value: number) {
    setExpressionWeights((prev) => {
      const next = { ...prev, [name]: value };
      if (value <= 0) {
        delete next[name];
      }

      if (vrmRef.current) {
        applyExpressionWeightsToVrm(vrmRef.current, next);
      }

      const activeKeys = Object.entries(next).filter(([_, val]) => val > 0);
      if (activeKeys.length === 0) {
        setActiveExpressionId("neutral");
      } else if (activeKeys.length === 1 && activeKeys[0][1] === 1.0) {
        setActiveExpressionId(activeKeys[0][0]);
      } else {
        setActiveExpressionId("custom");
      }

      return next;
    });
  }

  function handleBodyRotationChange(event: ChangeEvent<HTMLInputElement>) {
    setBodyRotation(d(Number(event.currentTarget.value)));
  }

  // 미리보기를 끄면 흔들림을 즉시 정착시켜 정지 프레임으로 되돌린다.
  useEffect(() => {
    if (physicsPreview) return;
    const current = vrmRef.current;
    if (current && countSpringBoneJoints(current) > 0) {
      settleVrmPhysics(current);
    }
  }, [physicsPreview]);

  /* ── 의상 토글/리컬러 핸들러 ─────────────────────────────────────── */
  useEffect(() => {
    applyCostumeState(
      costumeMeshes,
      mergeWardrobeCostumeVisibility(
        costumeState,
        wardrobeState,
        costumeMeshes,
        wardrobeAutoHide,
      ),
    );
  }, [costumeMeshes, costumeState, wardrobeAutoHide, wardrobeState]);

  function updateCostume(next: CostumeState) {
    setCostumeState(next);
    applyCostumeState(
      costumeMeshes,
      mergeWardrobeCostumeVisibility(next, wardrobeState, costumeMeshes, wardrobeAutoHide),
    );
  }

  function isCostumeAutoHidden(key: string): boolean {
    if (!wardrobeAutoHide || costumeState.hidden.includes(key)) return false;
    return mergeWardrobeCostumeVisibility(
      { hidden: [], recolor: {} },
      wardrobeState,
      costumeMeshes,
      true,
    ).hidden.includes(key);
  }

  function toggleCostumeMesh(key: string) {
    const hidden = costumeState.hidden.includes(key)
      ? costumeState.hidden.filter((k) => k !== key)
      : [...costumeState.hidden, key];
    updateCostume({ ...costumeState, hidden });
  }

  function recolorCostumeMesh(key: string, hex: string | null) {
    const recolor = { ...costumeState.recolor };
    if (hex) recolor[key] = hex.toLowerCase();
    else delete recolor[key];
    updateCostume({ ...costumeState, recolor });
  }

  function recolorCostumeSlot(slot: CostumeSlot, hex: string) {
    const recolor = { ...costumeState.recolor };
    for (const entry of costumeMeshes) {
      if (entry.slot === slot) recolor[entry.key] = hex.toLowerCase();
    }
    updateCostume({ ...costumeState, recolor });
  }

  function resetCostume() {
    updateCostume({ hidden: [], recolor: {} });
    setSelectedCostumeKey(null);
  }

  /* ── 실장착 워드로브 핸들러 ─────────────────────────────────────── */
  function equipWardrobeItem(slot: WardrobeSlot, itemId: string | null) {
    if (wardrobeMutationBlockedRef.current || isCapturing) return;
    if (itemId) {
      const equip = createWardrobeEquip(itemId);
      if (!equip) return;
      setWardrobeState((prev) => ({ ...prev, [slot]: equip }));
    } else {
      setWardrobeState((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
    }
  }

  function updateWardrobeEquip(slot: WardrobeSlot, patch: Partial<WardrobeEquip>) {
    if (wardrobeMutationBlockedRef.current || isCapturing) return;
    setWardrobeState((prev) => {
      const current = prev[slot];
      if (!current) return prev;
      return { ...prev, [slot]: { ...current, ...patch } };
    });
  }

  function handleWardrobeSurfaceReceipt(
    slot: WardrobeSlot,
    receipt: StudioVrmSkinnedGarmentReceipt | null,
  ) {
    setWardrobeSurfaceReceipts((current) => {
      if (!receipt) {
        if (!current[slot]) return current;
        const next = { ...current };
        delete next[slot];
        return next;
      }
      const previous = current[slot];
      if (previous?.signature === receipt.signature && previous.mode === receipt.mode) return current;
      return { ...current, [slot]: receipt };
    });
  }

  function equipWardrobeSetById(setId: string) {
    if (wardrobeMutationBlockedRef.current || isCapturing) return;
    const set = selectableWardrobeSetById(setId);
    if (!set) return;
    const nextState = applyWardrobeSet(set);
    setWardrobeState(nextState);
  }

  function clearWardrobe() {
    if (wardrobeMutationBlockedRef.current || isCapturing) return;
    setWardrobeState({});
  }

  function applyWardrobeFitSuggestions() {
    if (wardrobeMutationBlockedRef.current || isCapturing) return;
    setWardrobeState((current) => {
      const next: WardrobeState = { ...current };
      for (const slot of WARDROBE_SLOTS) {
        const equip = current[slot];
        const fit = wardrobeFitReport.slots[slot];
        if (!equip || !fit) continue;
        next[slot] = { ...equip, fit: fit.suggestedFit, fitMode: "manual" };
      }
      return next;
    });
  }

  function toggleWardrobeAutoHide() {
    if (wardrobeMutationBlockedRef.current || isCapturing) return;
    setWardrobeAutoHide((current) => !current);
  }

  /* ── 물리(스프링본) 핸들러 ──────────────────────────────────────── */
  function updatePhysics(patch: Partial<VrmPhysicsSettings>) {
    const next = parseVrmPhysicsSettings({ ...vrmPhysics, ...patch });
    setVrmPhysics(next);
    const current = vrmRef.current;
    if (current && countSpringBoneJoints(current) > 0) {
      applyVrmSpringBonePhysics(current, next);
      if (!physicsPreview) settleVrmPhysics(current);
    }
  }

  function resettlePhysics() {
    const current = vrmRef.current;
    if (current && countSpringBoneJoints(current) > 0) {
      applyVrmSpringBonePhysics(current, vrmPhysics);
      settleVrmPhysics(current);
    }
  }

  function resetPhysics() {
    setVrmPhysics(DEFAULT_VRM_PHYSICS);
    setPhysicsPreview(false);
    const current = vrmRef.current;
    if (current && countSpringBoneJoints(current) > 0) {
      applyVrmSpringBonePhysics(current, DEFAULT_VRM_PHYSICS);
      settleVrmPhysics(current);
    }
  }

  /* ── 본 부착 소품 핸들러 ────────────────────────────────────────── */
  function addVrmProp(propId: string) {
    const instance = createPropInstance(propId);
    if (!instance) return;
    setVrmPropItems((prev) => [...prev, instance]);
    setSelectedVrmPropUid(instance.uid);
  }

  function updateVrmProp(uid: string, patch: Partial<PropInstance>) {
    setVrmPropItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  }

  function removeVrmProp(uid: string) {
    setVrmPropItems((prev) => prev.filter((it) => it.uid !== uid));
    setSelectedVrmPropUid((cur) => (cur === uid ? null : cur));
  }

  function createCurrentSceneDocument(
    width: number,
    height: number,
    surfacePaint: StudioVrmSurfacePaintSettings = { version: 1, textures: [] },
  ): StudioVrmSceneDocument | null {
    const currentVrm = vrmRef.current;
    const currentEntry = libraryEntries.find((entry) => entry.id === activeModelId) ?? null;
    const camera = viewportApiRef.current?.readCamera() ?? null;
    if (!currentVrm || !currentEntry || !camera) return null;

    let model: StudioVrmSceneModel;
    if (currentEntry.source === "sample") {
      model = { source: "bundled", id: currentEntry.id, name: currentEntry.name };
    } else if (
      canonicalizeVrmContentHash(currentEntry.contentHash)
      && currentEntry.byteSize
      && currentEntry.byteSize <= STUDIO_VRM_MODEL_MAX_BYTES
    ) {
      const contentHash = canonicalizeVrmContentHash(currentEntry.contentHash);
      if (!contentHash) return null;
      model = {
        source: "attachment",
        hash: contentHash,
        byteSize: currentEntry.byteSize,
        mime: "model/gltf-binary",
        name: currentEntry.name,
      };
    } else {
      setError("업로드한 VRM의 콘텐츠 해시를 확인하지 못했거나 휴대 가능한 프로젝트 자산 크기(96MB)를 넘었습니다.");
      return null;
    }

    const baked = bakeStudioVrmRuntimePose(currentVrm, STUDIO_VRM_DIRECT_EDIT_BONES);
    if (!baked) return null;
    const poseBones: StudioVrmPoseBoneMap = {};
    for (const boneName of STUDIO_VRM_HUMANOID_BONES) {
      const bone = baked.bones[boneName];
      if (!bone?.rotation) continue;
      poseBones[boneName] = {
        rotation: [bone.rotation[0], bone.rotation[1], bone.rotation[2]],
      };
    }
    const authoredFingers = createStudioVrmAuthoredFingerSnapshot(fingerEdits);
    const jointProfile = createStudioVrmRigProfileSelection(rigJointProfile);
    if (!jointProfile) return null;

    const normalized = normalizeStudioVrmSceneDocument({
      kind: "studio-vrm-scene",
      version: STUDIO_VRM_SCENE_DOCUMENT_VERSION,
      model,
      pose: {
        bones: poseBones,
        yOffset: customYOffset,
        translations: poseTranslations,
        bodyRotationY: bodyRotation,
        fingerOverrides: authoredFingers,
        ikConstraints,
      },
      expressions: expressionWeights,
      camera,
      appearance: {
        bodyScale,
        customColors,
        materialFx,
        mannequin: mannequinMode,
        avatarForge: serializeAvatarForgeState(avatarForgeState),
        costume: serializeCostume(costumeState) ?? null,
        wardrobe: serializeWardrobe(wardrobeState, { autoHideOriginal: wardrobeAutoHide }) ?? null,
      },
      rig: {
        version: 1,
        jointProfile,
        fullBodyIk: fullBodyIkEnabled,
        footPlant: footPlantEnabled,
        floorHeight: rigFloorHeight,
      },
      props: serializeVrmProps(vrmPropItems) ?? null,
      sceneProps: serializeSceneProps(activeProps, propAttachments) ?? null,
      lighting,
      physics: vrmPhysics,
      env: envVariant,
      render: {
        width,
        height,
        transparentBackground,
        backgroundColor: insertBackgroundColor,
      },
      surfacePaint,
    });
    const serialized = serializeStudioVrmSceneDocument(normalized);
    return serialized ? parseStudioVrmSceneDocument(serialized) : null;
  }

  function handleInsert() {
    if (isCapturing || isSharingPose || isThumbnailCapturing) return;
    const activeTexturePaintPointerId =
      texturePaintSnapshotRef.current?.activePointerId;
    if (typeof activeTexturePaintPointerId === "number") {
      setError("표면 페인트 획을 마친 뒤 이 포즈를 추가해 주세요.");
      setStatus("ready");
      return;
    }
    if (texturePaintPersistenceStatus === "restoring") {
      setError("저장된 표면 페인팅 복원이 끝난 뒤 이 포즈를 추가해 주세요.");
      setStatus("ready");
      return;
    }
    if (texturePaintPersistenceStatus === "error") {
      setError(
        texturePaintPersistenceError
        || "저장된 표면 페인팅 원본을 복원하지 못해 재편집 장면을 안전하게 저장할 수 없습니다.",
      );
      setStatus("ready");
      return;
    }
    if (texturePaintRestoreRequired && texturePaintPersistenceStatus !== "ready") {
      setError("저장된 표면 페인팅의 모델 준비가 끝난 뒤 이 포즈를 추가해 주세요.");
      setStatus("ready");
      return;
    }
    const insertBackground = resolveStudioVrmInsertBackgroundMode({
      transparent: transparentBackground,
      backgroundColor: insertBackgroundColor,
    });
    if (!insertBackground.ok) {
      setError(insertBackground.reason);
      setStatus(vrmRef.current ? "ready" : "error");
      return;
    }
    const currentCapture = captureRef.current;
    const currentVrm = vrmRef.current;
    const currentTexturePaintRuntime = texturePaintRuntimeRef.current;
    const captureTexturePaintRevision =
      currentTexturePaintRuntime?.getContentRevision() ?? 0;

    if (!currentCapture.gl || !currentCapture.scene || !currentCapture.camera || !currentVrm) {
      setError("캡처할 VRM 장면이 아직 준비되지 않았습니다.");
      setStatus(vrmRef.current ? "ready" : "error");
      return;
    }
    if (!persistentIkCaptureIsReady()) {
      setError("손·발 고정점을 현재 포즈에 맞추는 중입니다. 보정 완료 후 다시 추가해 주세요.");
      setStatus("ready");
      return;
    }
    const hasLockedConstraint = ikConstraints.some((constraint) => (
      constraint.enabled && constraint.locked
    ));
    if (hasLockedConstraint && (webcamActive || idleAnimation)) {
      setError("실시간 추적·대기 애니메이션을 끈 뒤 고정점이 있는 포즈를 추가해 주세요.");
      setStatus("ready");
      return;
    }

    if (isCapturing) return;
    const capturePoseSignature = currentPersistentIkSignature();
    const captureDynamicPoseGeneration = dynamicPoseGenerationRef.current;
    const captureWardrobeAuthoredIdentity = wardrobeAuthoredIdentityRef.current;
    const captureGarmentEvaluationGeneration = garmentEvaluationGenerationRef.current;
    const captureGarmentEvaluationReceipt = garmentEvaluationReceiptRef.current;
    const captureRequest = captureRequestRef.current + 1;
    captureRequestRef.current = captureRequest;
    const { camera, gl, scene } = currentCapture;
    const captureGeneration = insertCaptureGenerationRef.current + 1;
    insertCaptureGenerationRef.current = captureGeneration;
    insertCaptureAbortRef.current?.abort();
    const captureController = new AbortController();
    insertCaptureAbortRef.current = captureController;
    const wardrobeCaptureAuthorityIsCurrent = (): boolean => (
      wardrobeAuthoredIdentityRef.current === captureWardrobeAuthoredIdentity
      && garmentEvaluationGenerationRef.current === captureGarmentEvaluationGeneration
      && garmentEvaluationReceiptRef.current === captureGarmentEvaluationReceipt
      && (
        captureGarmentEvaluationReceipt === null
        || captureGarmentEvaluationReceipt.generation === captureGarmentEvaluationGeneration
      )
    );
    const capturePreconditionsAreCurrent = (): boolean => (
      captureGeneration === insertCaptureGenerationRef.current
      && captureRequest === captureRequestRef.current
      && vrmRef.current === currentVrm
      && captureRef.current.gl === gl
      && captureRef.current.scene === scene
      && captureRef.current.camera === camera
      && texturePaintRuntimeRef.current === currentTexturePaintRuntime
      && (currentTexturePaintRuntime?.getContentRevision() ?? 0)
        === captureTexturePaintRevision
      && persistentIkCurrentSignatureRef.current === capturePoseSignature
      && pendingPersistentIkCommandRef.current === null
      && dynamicPoseGenerationRef.current === captureDynamicPoseGeneration
      && wardrobeCaptureAuthorityIsCurrent()
      && (!hasLockedConstraint
        || (
          persistentIkResolvedSignatureRef.current === capturePoseSignature
          && !webcamActiveRef.current
          && !idleAnimationRef.current
        ))
    );
    const reportWardrobeCaptureAuthorityMismatch = () => {
      if (
        !captureController.signal.aborted
        && !wardrobeCaptureAuthorityIsCurrent()
      ) {
        setError("캡처 중 의상 설정이 바뀌어 이미지를 추가하지 않았습니다. 현재 의상으로 다시 추가해 주세요.");
        setStatus("ready");
      }
    };
    const releaseCaptureMutationLocks = () => {
      if (
        captureGeneration === insertCaptureGenerationRef.current
        && captureRequest === captureRequestRef.current
      ) {
        texturePaintMutationBlockedRef.current = false;
        wardrobeMutationBlockedRef.current = false;
      }
    };
    texturePaintMutationBlockedRef.current = true;
    wardrobeMutationBlockedRef.current = true;
    setIsCapturing(true);
    setError("");
    insertCaptureFrameRef.current = requestAnimationFrame(() => {
      insertCaptureFrameRef.current = null;
      if (!capturePreconditionsAreCurrent()) {
        reportWardrobeCaptureAuthorityMismatch();
        if (insertCaptureAbortRef.current === captureController) {
          captureController.abort();
          insertCaptureAbortRef.current = null;
        }
        if (
          captureGeneration === insertCaptureGenerationRef.current
          && captureRequest === captureRequestRef.current
        ) {
          releaseCaptureMutationLocks();
          setIsCapturing(false);
        }
        return;
      }

      void (async () => {
        let inserted = false;
        let releaseCaptureHelpers: (() => void) | null = null;
        const releaseLocalCapture = () => {
          releaseCaptureHelpers?.();
          releaseCaptureHelpers = null;
        };
        try {
          // PNG 인코딩·해시·IndexedDB 저장은 여러 프레임이 걸릴 수 있다. 먼저 표면 텍스처를
          // 영속화한 뒤 전체 캡처 전제를 다시 검사하고 pose bake→scene→RGBA 캡처를 같은
          // 동기 구간에서 수행해 메타데이터와 실제 픽셀이 서로 다른 시점을 기록하지 않는다.
          const surfacePaint: StudioVrmSurfacePaintSettings = currentTexturePaintRuntime
            ? await import("./studio-vrm-texture-paint-persistence")
              .then(({ persistStudioVrmTexturePaintRuntime }) =>
                persistStudioVrmTexturePaintRuntime(
                  currentTexturePaintRuntime,
                  { signal: captureController.signal },
                )
              )
            : { version: 1, textures: [] };
          if (
            captureController.signal.aborted
            || !capturePreconditionsAreCurrent()
          ) {
            reportWardrobeCaptureAuthorityMismatch();
            return;
          }

          // 같은 설정은 물리 미리보기 여부와 무관하게 같은 정지 컷으로 재현되어야 한다.
          if (countSpringBoneJoints(currentVrm) > 0) {
            settleVrmPhysics(currentVrm);
          }
          currentVrm.update(0);
          // Display size = the legacy logical export size (stable placement on the document);
          // the raster renders denser so the insert stays crisp at 100% zoom on HiDPI and
          // survives a moderate scale-up. Budget failures fall back to display-density capture.
          const { width: displayWidth, height: displayHeight } = roundExportSize(gl.domElement);
          const capturePlan = planStudio3dInsertCaptureSize({
            displayWidth,
            displayHeight,
            devicePixelRatio: globalThis.devicePixelRatio || 1,
          });
          const width = capturePlan?.width ?? displayWidth;
          const height = capturePlan?.height ?? displayHeight;
          const bakedPose = bakeStudioVrmRuntimePose(currentVrm);
          if (!bakedPose) {
            throw new Error("삽입할 VRM 자세를 회전 기반 데이터로 변환하지 못했습니다.");
          }
          const poseMetadata = buildVrmPoseDataUrlMetadata({
            ...captureFullState(),
            bones: stripFingerBones(bakedPose.bones),
            yOffset: bakedPose.yOffset,
          }, modelName);
          const hashPayload = encodeURIComponent(JSON.stringify(poseMetadata));
          // Scene documents keep recording the logical viewport size — re-edit camera framing
          // depends only on the aspect, and this keeps parity with pre-HiDPI documents.
          const sceneDocument = createCurrentSceneDocument(
            displayWidth,
            displayHeight,
            surfacePaint,
          );
          if (!sceneDocument) {
            throw new Error("재편집 가능한 3D 데생 인형 장면을 만들지 못했습니다.");
          }
          releaseCaptureHelpers = acquireVrmCaptureHelperLease({
            subjectOnly: insertBackground.plan.subjectOnly,
          });
          const rgba = captureStudioVrmRgba(gl, scene, camera, { width, height }, {
            color: insertBackground.plan.backgroundColor,
            alpha: insertBackground.plan.captureAlpha,
          });
          releaseLocalCapture();
          const baseDataUrl = await encodeStudioVrmCapturePngDataUrl(
            rgba,
            { width, height },
            {
              signal: captureController.signal,
              timeoutMs: STUDIO_VRM_CAPTURE_PNG_TIMEOUT_MS,
            },
          );
          const fullDataUrl = `${baseDataUrl}#${hashPayload}`;
          if (
            captureController.signal.aborted
            || !capturePreconditionsAreCurrent()
          ) {
            reportWardrobeCaptureAuthorityMismatch();
            return;
          }

          const accepted = await onInsert({
            pngDataUrl: fullDataUrl,
            width,
            height,
            displayWidth,
            displayHeight,
            scene: sceneDocument,
          });
          if (
            captureGeneration !== insertCaptureGenerationRef.current
            || captureRequest !== captureRequestRef.current
            || vrmRef.current !== currentVrm
          ) {
            return;
          }
          if (accepted === false) {
            throw new Error("편집 중 문서가 바뀌어 캡처를 삽입하지 않았습니다. 현재 페이지에서 다시 시도해 주세요.");
          }
          inserted = true;
        } catch (caughtError: unknown) {
          if (
            captureGeneration === insertCaptureGenerationRef.current
            && captureRequest === captureRequestRef.current
          ) {
            setError(getErrorMessage(caughtError, "3D 데생 인형 캡처를 추가하지 못했습니다."));
            setStatus(vrmRef.current ? "ready" : "error");
          }
        } finally {
          releaseLocalCapture();
          if (insertCaptureAbortRef.current === captureController) {
            insertCaptureAbortRef.current = null;
          }
          if (
            captureGeneration === insertCaptureGenerationRef.current
            && captureRequest === captureRequestRef.current
          ) {
            releaseCaptureMutationLocks();
            setIsCapturing(false);
          }
        }

        if (
          inserted
          && captureGeneration === insertCaptureGenerationRef.current
          && captureRequest === captureRequestRef.current
        ) {
          onClose();
        }
      })();
    });
  }

  if (!open) return null;

  return createDomPortal(
    <div
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      aria-describedby={dialogDescriptionId}
      className="fixed inset-0 z-[80] isolate overflow-hidden overscroll-none bg-[oklch(0.08_0.01_70/0.86)] p-2 text-fg backdrop-blur-sm pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11 pointer-coarse:[&_input:not([type=range]):not([type=checkbox]):not([type=color])]:min-h-11 pointer-coarse:[&_input[type=range]]:h-11 pointer-coarse:[&_select]:min-h-11 pointer-coarse:[&_summary]:min-h-11 sm:p-4"
      data-studio-vrm-dialog="true"
      role="dialog"
      tabIndex={-1}
      style={{
        // 노치/홈인디케이터 안전영역을 모달 바깥 패딩에 반영해 하단(웹캠/푸터)이 잘리지 않게 한다.
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex h-full min-h-0 max-h-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <UserRound size={14} aria-hidden />
              VRM 캐릭터 빌더
            </p>
            <h2 id={dialogTitleId} className="mt-1 truncate text-lg font-bold tracking-tight text-fg sm:text-xl">3D 캐릭터 만들기</h2>
            <p id={dialogDescriptionId} className="mt-1 line-clamp-1 text-xs text-fg-3">
              {displayModelName
                ? `${displayModelName} · ${transparentBackground ? "캐릭터만 투명 PNG로 패널에 추가" : "배경색 포함 PNG로 패널에 추가"}`
                : "내 VRM을 불러와 패널에 추가"}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="닫기"
            title={
              isCapturing
                ? "캡처가 끝난 뒤 닫을 수 있습니다."
                : texturePaintStrokeActive
                  ? "닫기 · 진행 중인 표면 페인트 작업은 취소됩니다. (Esc)"
                : "닫기 (Esc)"
            }
            className={ICON_BUTTON}
            disabled={isCapturing}
            onClick={() => {
              cancelActiveTexturePaintStroke();
              cancelPendingPoseShare();
              onClose();
            }}
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        {/* 모바일: 뷰포트(상단)+컨트롤(하단) 두 행을 명시적으로 나눠 컨트롤 패널이 자체 스크롤되게 한다
            (행을 안 잡으면 패널이 모달 밖으로 흘러 하단의 웹캠/푸터가 잘림). 데스크톱(lg): 2단 컬럼. */}
        <div
          className={cx(
            "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1",
            texturePaintModeSelected
              ? "grid-rows-[minmax(0,2fr)_minmax(0,3fr)] sm:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]"
              : "grid-rows-[minmax(0,36dvh)_minmax(0,1fr)] sm:grid-rows-[minmax(0,40dvh)_minmax(0,1fr)]",
          )}
        >
          <section className="relative min-h-0 overflow-hidden bg-card lg:min-h-0">
            <div
              aria-hidden
              className="absolute inset-0 opacity-80 [background-image:linear-gradient(45deg,oklch(0.75_0.01_80/0.16)_25%,transparent_25%),linear-gradient(-45deg,oklch(0.75_0.01_80/0.16)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,oklch(0.75_0.01_80/0.16)_75%),linear-gradient(-45deg,transparent_75%,oklch(0.75_0.01_80/0.16)_75%)] [background-position:0_0,0_12px,12px_-12px,-12px_0] [background-size:24px_24px]"
            />
            <div className="relative mx-auto flex h-full max-h-full min-h-0 w-full max-w-[min(82vw,720px)] items-center justify-center p-2 sm:p-5 lg:max-h-[calc(100dvh-12rem)] lg:min-h-[420px]">
              <div
                className={cx(
                  "relative aspect-[9/13] h-full max-h-full min-h-0 w-auto overflow-hidden rounded-xl border border-line/80 bg-transparent shadow-[inset_0_0_0_1px_oklch(1_0_0/0.04)] lg:min-h-[390px]",
                )}
                style={{
                  cursor: texturePaintInteractionEnabled
                    ? texturePaintEyedropperActive
                      ? "crosshair"
                      : texturePaintSettings.tool === "fill"
                        ? "cell"
                        : createStudioVrmTexturePaintCursor(texturePaintSettings)
                    : undefined,
                }}
              >
                <p id={viewportInstructionsId} className="sr-only">
                  {texturePaintModeSelected
                    ? "3D 캐릭터 표면 페인트 모드입니다. 캐릭터 회전은 잠겨 있습니다. 브러시로 끌어 칠하거나 ColorDrop으로 한 번에 채우고, 스포이드 버튼 또는 Alt+클릭으로 baseColor 색상을 가져오며, 뷰포트 오른쪽의 확대·축소 버튼으로 시점을 조절하세요."
                    : "3D 캐릭터 편집 뷰포트입니다. 포인터로 끌어 캐릭터를 회전하고, 휠·핀치 또는 뷰포트 오른쪽의 확대·축소 버튼으로 시점을 조절하세요."}
                </p>
                <Canvas
                  role="group"
                  tabIndex={0}
                  aria-keyshortcuts="F I"
                  aria-label={
                    texturePaintModeSelected
                      ? "3D 캐릭터 표면 페인트 뷰포트"
                      : "3D 캐릭터 편집 뷰포트"
                  }
                  aria-describedby={viewportInstructionsId}
                  onKeyDown={(event) => {
                    if (
                      !texturePaintInteractionEnabled
                      || texturePaintStrokeActive
                      || event.metaKey
                      || event.ctrlKey
                      || event.altKey
                    ) {
                      return;
                    }
                    const key = event.key.toLowerCase();
                    if (key === "i") {
                      event.preventDefault();
                      setTexturePaintEyedropperActive((active) => !active);
                    } else if (key === "f") {
                      event.preventDefault();
                      setTexturePaintEyedropperActive(false);
                      setTexturePaintSettings((current) => ({
                        ...current,
                        tool: current.tool === "brush" ? "fill" : "brush",
                      }));
                    }
                  }}
                  camera={{ fov: activeCamera.fov, position: [...activeCamera.position], near: 0.1, far: 20 }}
                  className="h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                  dpr={[1, 2]}
                  frameloop={vrmFrameLoop}
                  gl={{ alpha: true, antialias: true }}
                  onCreated={({ gl }) => {
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.0;
                    gl.setClearColor(0x000000, 0);
                    gl.setClearAlpha(0);
                  }}
                >
                  <CaptureBridge onCaptureUpdate={onCaptureUpdate} />
                  <StudioVrmViewportReadyFrame
                    revision={`${installedModelId ?? "empty"}:${status}:${texturePaintModeSelected ? "surface" : "standard"}`}
                  />
                  <StudioVrmTexturePaintInvalidateBridge
                    onReady={handleTexturePaintInvalidateReady}
                  />
                  <CameraDirector presetId={activeCameraId} resetNonce={viewResetNonce} />
                  <ViewportController onReady={handleViewportReady} />
                  <VrmLighting
                    tone={lightingTone}
                    lighting={lighting}
                    env={envVariant}
                    envRootRef={envRootRef}
                  />
                  {vrm ? (
                    <VrmActor
                      bodyRotation={bodyRotation}
                      customBones={customBones}
                      customYOffset={customYOffset}
                      poseTranslations={poseTranslations}
                      expressionWeights={expressionWeights}
                      vrm={vrm}
                      customColors={customColors}
                      materialFx={materialFx}
                      webcamActive={webcamActive}
                      trackingDataRef={trackingDataRef}
                      idleAnimation={idleAnimation}
                      fingerEdits={effectiveFingerEdits}
                      bodyScale={bodyScale}
                      texturePaintEnabled={texturePaintInteractionEnabled}
                      texturePaintMutationBlockedRef={texturePaintMutationBlockedRef}
                      texturePaintRuntime={texturePaintRuntime}
                      texturePaintSettings={texturePaintSettings}
                      texturePaintEyedropperActive={texturePaintEyedropperActive}
                      onTexturePaintColorSampled={handleTexturePaintColorSampled}
                      onTexturePaintEyedropperComplete={() =>
                        setTexturePaintEyedropperActive(false)}
                    />
                  ) : null}
                  {vrm && showPoseBoneOverlay && !texturePaintModeSelected && !isCapturing && !isSharingPose && !isThumbnailCapturing && !webcamActive ? (
                    <VrmPoseBoneOverlay
                      vrm={vrm}
                      selectedBone={selectedViewportPoseBone}
                      lockedBones={lockedPoseBones}
                      handIkEnabled={viewportHandIkEnabled}
                      onSelect={selectViewportPoseBone}
                      onDrag={handleViewportHandIkDrag}
                    />
                  ) : null}
                  {vrm ? <StudioVrmAvatarForge vrm={vrm} state={avatarForgeState} /> : null}
                  {vrm ? (
                    <StudioVrmMannequinMaterial
                      vrm={vrm}
                      enabled={mannequinMode}
                      customColors={customColors}
                      materialFx={materialFx}
                    />
                  ) : null}
                  {vrm ? (
                    <StudioVrmJointHandles
                      key={jointHandleSessionGeneration}
                      vrm={vrm}
                      visible={
                        jointHandlesVisible
                        && activePanelTab === "pose"
                        && !isCapturing
                        && !isSharingPose
                        && !isThumbnailCapturing
                        && !persistentIkReconciling
                      }
                      effectorSceneTargets={enabledStudioVrmIkTargetsSceneLocal(ikConstraints)}
                      poleSceneTargets={enabledStudioVrmIkPolesSceneLocal(ikConstraints)}
                      selectedBone={selectedJointHandle}
                      selectedPole={selectedIkPole}
                      dragMode={ikHandleDragMode}
                      axisLock={ikHandleAxisLock}
                      disabled={webcamActive || idleAnimation || isCapturing || persistentIkReconciling}
                      onSelectBone={handleJointHandleSelect}
                      onSelectPole={handleJointHandlePoleSelect}
                      onEffectorPreview={previewJointHandleIk}
                      onEffectorCommit={handleJointHandleIkCommit}
                      onEffectorRollback={handleJointHandleIkRollback}
                      onPolePreview={previewJointHandlePole}
                      onPoleCommit={handleJointHandlePoleCommit}
                      onPoleRollback={handleJointHandleIkRollback}
                      onInteractionActiveChange={setJointHandleInteracting}
                    />
                  ) : null}
                  {vrm
                    ? vrmPropItems.map((item) => (
                        <VrmPropAttachment key={item.uid} vrm={vrm} instance={item} metrics={effectivePropRigMetrics} />
                      ))
                    : null}
                  {vrm ? (
                    <VrmRuntimeCommit
                      vrm={vrm}
                      physicsPreview={physicsPreview}
                      webcamActive={webcamActive}
                    />
                  ) : null}
                  {vrm && wardrobeMetrics
                    ? WARDROBE_SLOTS.map((slot) => {
                        const equip = wardrobeState[slot];
                        const fit = wardrobeFitReport.slots[slot];
                        return equip ? (
                          <VrmWardrobeAttachment
                            key={slot}
                            vrm={vrm}
                            slot={slot}
                            equip={equip}
                            metrics={wardrobeMetrics}
                            effectiveFit={fit?.effectiveFit ?? equip.fit}
                            onSurfaceReceipt={handleWardrobeSurfaceReceipt}
                          />
                        ) : null;
                      })
                    : null}
                  {activeProps.map((propId) => {
                    const propDef = SCENE_PROPS.find((p) => p.id === propId);
                    if (!propDef) return null;
                    return (
                      <SceneProp3D
                        key={propId}
                        propId={propId}
                        vrm={vrm}
                        config={propAttachments[propId]}
                        defaultPosition={propDef.position}
                        defaultScale={propDef.scale}
                      />
                    );
                  })}
                  <mesh ref={groundShadowRef} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.48, 0.82, 1]} renderOrder={-1}>
                    <circleGeometry args={[1, 72]} />
                    <meshBasicMaterial color="#3c2b20" transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} />
                  </mesh>
                  <OrbitControls
                    makeDefault
                    enabled={
                      !isViewportHandIkDragging
                      && !jointHandleInteracting
                      && !texturePaintStrokeActive
                    }
                    enableRotate={!texturePaintInteractionEnabled}
                    enableDamping
                    dampingFactor={0.08}
                    enablePan={false}
                    autoRotate={
                      turntable
                      && !texturePaintModeSelected
                      && !jointHandleInteracting
                      && !isViewportHandIkDragging
                    }
                    autoRotateSpeed={1.6}
                    minDistance={1.3}
                    maxDistance={5.2}
                    target={[activeCamera.target[0], activeCamera.target[1], activeCamera.target[2]]}
                    onStart={() => setViewportHinted(true)}
                  />
                </Canvas>

                {vrm ? (
                  <>
                    <div className="absolute left-2.5 top-2.5 z-10 flex flex-col gap-1.5">
                      <StudioToolHintTarget
                        hint={VRM_VIEWPORT_HINTS.undo}
                        disabled={!viewportCanUndo}
                        unavailableReason={
                          texturePaintStrokeActive
                            ? "표면 페인트 획을 마친 뒤 실행 취소할 수 있습니다."
                            : !viewportCanUndo
                              ? "되돌릴 캐릭터 변경이 없습니다."
                              : undefined
                        }
                        preferredSide="right"
                      >
                        <button
                          type="button"
                          aria-label="실행 취소"
                          disabled={!viewportCanUndo}
                          className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                          onClick={doUndo}
                        >
                          <Undo2 size={16} aria-hidden />
                        </button>
                      </StudioToolHintTarget>
                      <StudioToolHintTarget
                        hint={VRM_VIEWPORT_HINTS.redo}
                        disabled={!viewportCanRedo}
                        unavailableReason={
                          texturePaintStrokeActive
                            ? "표면 페인트 획을 마친 뒤 다시 실행할 수 있습니다."
                            : !viewportCanRedo
                              ? "다시 적용할 캐릭터 변경이 없습니다."
                              : undefined
                        }
                        preferredSide="right"
                      >
                        <button
                          type="button"
                          aria-label="다시 실행"
                          disabled={!viewportCanRedo}
                          className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                          onClick={doRedo}
                        >
                          <Redo2 size={16} aria-hidden />
                        </button>
                      </StudioToolHintTarget>
                    </div>
                    <div className="absolute right-2.5 top-2.5 z-10 flex flex-col gap-1.5">
                      <StudioToolHintTarget hint={VRM_VIEWPORT_HINTS.zoomIn} preferredSide="left">
                        <button type="button" aria-label="확대" className={VIEWPORT_BTN} onClick={() => zoomViewport(0.82)}>
                          <ZoomIn size={16} aria-hidden />
                        </button>
                      </StudioToolHintTarget>
                      <StudioToolHintTarget hint={VRM_VIEWPORT_HINTS.zoomOut} preferredSide="left">
                        <button type="button" aria-label="축소" className={VIEWPORT_BTN} onClick={() => zoomViewport(1.22)}>
                          <ZoomOut size={16} aria-hidden />
                        </button>
                      </StudioToolHintTarget>
                      <StudioToolHintTarget hint={VRM_VIEWPORT_HINTS.resetView} preferredSide="left">
                        <button type="button" aria-label="시점 초기화" className={VIEWPORT_BTN} onClick={handleViewReset}>
                          <Maximize2 size={16} aria-hidden />
                        </button>
                      </StudioToolHintTarget>
                      <StudioToolHintTarget
                        hint={turntableHint}
                        disabled={texturePaintModeSelected}
                        unavailableReason={
                          texturePaintModeSelected
                            ? "표면 페인트 중에는 캐릭터가 움직이지 않도록 턴테이블을 잠급니다."
                            : undefined
                        }
                        preferredSide="left"
                      >
                        <button
                          type="button"
                          aria-label={turntable ? "턴테이블 회전 중지" : "턴테이블 회전 시작"}
                          aria-pressed={turntable}
                          disabled={texturePaintModeSelected}
                          className={cx(
                            VIEWPORT_BTN,
                            turntable && "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent",
                            "disabled:cursor-not-allowed disabled:opacity-40",
                          )}
                          onClick={() => {
                            setTurntable((v) => !v);
                            setViewportHinted(true);
                          }}
                        >
                          <RotateCw size={16} aria-hidden className={turntable ? "animate-spin [animation-duration:3s]" : ""} />
                        </button>
                      </StudioToolHintTarget>
                    </div>
                    {texturePaintModeSelected || !viewportHinted ? (
                      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                        <span
                          className={cx(
                            "rounded-full border px-3 py-1 text-[0.66rem] font-medium shadow-sm backdrop-blur",
                            texturePaintModeSelected
                              ? "border-accent/40 bg-panel/92 text-fg-2"
                              : "border-line/70 bg-panel/85 text-fg-3",
                          )}
                        >
                          {texturePaintModeSelected
                            ? "표면 칠하기 · 회전 잠김 · 휠·핀치 또는 우측 줌 버튼"
                            : "끌어서 회전 · 휠·핀치로 확대/축소"}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {status === "empty" ? (
                  <div className="absolute inset-0 grid place-items-center bg-card/50 p-6 text-center backdrop-blur-[1px]">
                    <div className="max-w-[22rem]">
                      <div className="mx-auto grid size-12 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
                        <Upload size={22} aria-hidden />
                      </div>
                      <p className="mt-4 text-sm font-bold text-fg">VRM 모델을 불러와 장면을 시작하세요.</p>
                      <p className="mt-2 text-xs leading-relaxed text-fg-3">
                        내 .vrm 파일을 업로드하거나 모델 라이브러리에서 준비된 모델을 선택하세요. 불러온 뒤 조형, 포즈, 의상과 소품을 자유롭게 편집할 수 있습니다.
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <button
                          type="button"
                          className={cx(CONTROL_BUTTON, "border-accent/50 bg-accent text-on-accent")}
                          onClick={() => {
                            handlePanelTabChange("character");
                            handleCharacterSectionChange("library");
                          }}
                        >
                          <Upload size={14} aria-hidden />
                          모델 라이브러리
                        </button>
                        <button type="button" className={cx(CONTROL_BUTTON, "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")} onClick={handleSampleLoad}>
                          루미 불러오기
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {status === "loading" ? (
                  <div className="absolute inset-0 grid place-items-center bg-card/45 p-6 text-center backdrop-blur-sm" role="status" aria-live="polite">
                    <div>
                      <Loader2 className="mx-auto animate-spin text-accent" size={30} aria-hidden />
                      <p className="mt-3 text-sm font-semibold text-fg">VRM을 불러오는 중입니다.</p>
                    </div>
                  </div>
                ) : null}

                {status === "error" ? (
                  <div className="absolute inset-x-3 bottom-3 rounded-xl border border-line bg-panel/95 p-3 text-sm shadow-xl backdrop-blur" role="alert">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 shrink-0 text-accent" size={16} aria-hidden />
                      <div>
                        <p className="font-semibold text-fg">불러오기에 실패했습니다.</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{error || "파일 형식 또는 경로를 확인해 주세요."}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-t border-line bg-panel lg:border-l lg:border-t-0">
            <div role="tablist" aria-label="컨트롤 카테고리" className="grid shrink-0 grid-cols-5 gap-1 border-b border-line bg-panel/95 px-2 py-2 backdrop-blur sm:px-3">
              {PANEL_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activePanelTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`vrm-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="vrm-panel-body"
                    tabIndex={isActive ? 0 : -1}
                    title={tab.hint}
                    onKeyDown={handleTabKeyDown}
                    className={cx(
                      "group flex min-h-11 flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-[0.66rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
            <div ref={panelScrollRef} id="vrm-panel-body" role="tabpanel" aria-labelledby={`vrm-tab-${activePanelTab}`} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] sm:px-5">
              {activePanelTab === "character" ? (
                <div className="sticky -top-4 z-20 -mx-4 -mt-4 border-b border-line bg-panel/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5">
                  <div role="tablist" aria-label="캐릭터 빌더 단계" className="grid grid-cols-5 gap-1">
                    {CHARACTER_PANEL_SECTIONS.map((section) => {
                      const SectionIcon = section.icon;
                      const selected = activeCharacterSection === section.id;
                      return (
                        <button
                          key={section.id}
                          id={`vrm-character-subtab-${section.id}`}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls={`vrm-character-section-${section.id}`}
                          tabIndex={selected ? 0 : -1}
                          onKeyDown={handleCharacterTabKeyDown}
                          className={cx(
                            "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1 text-[0.64rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                            selected
                              ? "border-accent/55 bg-accent-soft text-accent"
                              : "border-transparent text-fg-3 hover:bg-raised hover:text-fg"
                          )}
                          onClick={() => handleCharacterSectionChange(section.id)}
                        >
                          <SectionIcon size={14} aria-hidden />
                          <span className="truncate">{section.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <StudioVrmCharacterLibraryPanel
                hidden={hideOnCharacterSection("library")}
                entries={libraryEntries}
                recentCharacterIds={recentCharacterState.ids}
                libraryStatus={libraryStatus}
                libraryError={libraryError}
                activeModelId={activeModelId}
                deletingModelId={deletingModelId}
                modelStatus={status}
                isUploading={isUploading}
                onFileChange={handleFileChange}
                onSelect={loadModelFromLibraryEntry}
                onDelete={handleDeleteEntry}
                onCollapse={() => {
                  panelScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />

              <section
                id="vrm-character-section-forge"
                role="tabpanel"
                aria-labelledby="vrm-character-subtab-forge"
                hidden={hideOnCharacterSection("forge")}
              >
                <StudioVrmAvatarForgePanel
                  state={avatarForgeState}
                  disabled={!vrm}
                  detectedOriginalHairCount={detectedOriginalHairCount}
                  onChange={setAvatarForgeState}
                />
              </section>

              <StudioVrmTexturePaintPanel
                hidden={hideOnCharacterSection("surface")}
                disabled={!texturePaintRuntime || texturePaintDisabledReason.length > 0}
                settings={texturePaintSettings}
                activeTargetId={texturePaintSnapshot?.activeTargetId ?? null}
                activeTextureLabel={texturePaintTargetLabel}
                status={texturePaintStatus}
                restoreError={
                  texturePaintPersistenceStatus === "error"
                    ? texturePaintPersistenceError || "저장된 표면 페인팅을 복원하지 못했습니다."
                    : null
                }
                strokeActive={texturePaintStrokeActive}
                targetCount={texturePaintSnapshot?.targets.length ?? 0}
                canUndo={(texturePaintSnapshot?.history.undoCount ?? 0) > 0}
                canRedo={(texturePaintSnapshot?.history.redoCount ?? 0) > 0}
                eyedropperActive={texturePaintEyedropperActive}
                onSettingsChange={handleTexturePaintSettingsChange}
                onUndo={handleTexturePaintUndo}
                onRedo={handleTexturePaintRedo}
                onEyedropperToggle={() =>
                  setTexturePaintEyedropperActive((active) => !active)}
                onResetActiveTexture={handleTexturePaintReset}
                onRetryRestore={() => {
                  texturePaintRestoreAbortRef.current?.abort();
                  setTexturePaintPersistenceError("");
                  setTexturePaintPersistenceStatus("restoring");
                  setTexturePaintRestoreRetryToken((token) => token + 1);
                }}
              />

              <section hidden={hideOnTab("face")}>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  표정
                </h3>
                {availableExpressionActions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {availableExpressionActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className={cx(
                          "min-h-[3rem] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                          activeExpressionId === action.id
                            ? "border-accent/55 bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                        disabled={!vrm}
                        onClick={() => handleExpressionSelect(action)}
                      >
                        <span className="block truncate text-xs font-bold">{action.label}</span>
                        <span className="mt-0.5 block text-[0.68rem] text-fg-3">{action.tone}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-line bg-card/45 px-3 py-4 text-xs leading-relaxed text-fg-3">
                    이 VRM에는 사용할 수 있는 표정 프리셋이 없습니다.
                  </p>
                )}

                {/* 표정 조합 프리셋(studio-pose-presets) — 여러 blendshape를 섞은 만화식 표정을 원클릭 적용 */}
                <div className="mt-3 border-t border-line/45 pt-3">
                  <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">원클릭 표정 조합 ({EXPRESSION_PRESETS.length})</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {EXPRESSION_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.tone}
                        className={cx(
                          "flex min-h-[3.4rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-1.5 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                          activeExpressionId === `preset:${preset.id}`
                            ? "border-accent/55 bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                        disabled={!vrm}
                        onClick={() => handleExpressionPresetSelect(preset)}
                      >
                        <span className="text-base leading-none" aria-hidden>{preset.emoji}</span>
                        <span className="block w-full truncate text-[0.66rem] font-bold">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section hidden={hideOnTab("face")} className="rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Sliders size={14} className="text-accent" aria-hidden />
                  표정 세부 조절 (Blendshape Mix)
                </h3>
                <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                  각 표정 슬라이더를 조절하여 여러 표정을 믹스해 보세요.
                </p>

                <div className="mb-3 flex flex-wrap gap-1">
                  {[
                    { id: "emotion", label: "감정" },
                    { id: "eye", label: "눈/시선" },
                    { id: "mouth", label: "입모양" },
                    { id: "custom", label: "기타/커스텀" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={cx(
                        "rounded-lg border px-2 py-1 text-[0.68rem] font-bold transition-colors",
                        activeExpressionCategory === cat.id
                          ? "border-accent/60 bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised"
                      )}
                      onClick={() => setActiveExpressionCategory(cat.id)}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {(() => {
                  const filteredActions = availableExpressionActions.filter(
                    (action) => action.name !== null && getExpressionCategory(action) === activeExpressionCategory
                  );

                  if (filteredActions.length > 0) {
                    return (
                      <div className="space-y-2.5">
                        {filteredActions.map((action) => {
                          const name = action.name!;
                          const weight = expressionWeights[name] ?? 0;
                          // "기타/커스텀" 카테고리엔 제작자가 스냅(0/1)으로 표시해 둔 표정(isBinary)이
                          // 섞여 있을 수 있어, 슬라이더 대신 켜기/끄기 토글로 보여준다.
                          const isBinary = vrm?.expressionManager?.getExpression(name)?.isBinary ?? false;
                          return (
                            <div key={name} className="flex items-center gap-2 text-[0.65rem] text-fg-3">
                              <span className="w-20 shrink-0 truncate font-semibold text-fg-2" title={action.label}>
                                {action.label}:
                              </span>
                              {isBinary ? (
                                <button
                                  type="button"
                                  disabled={!vrm}
                                  onClick={() => updateExpressionWeight(name, weight > 0 ? 0 : 1)}
                                  className={cx(
                                    "h-2 flex-1 rounded-full border transition-colors",
                                    weight > 0 ? "border-accent bg-accent" : "border-line bg-card"
                                  )}
                                  aria-pressed={weight > 0}
                                  aria-label={`${action.label} 켜기/끄기`}
                                />
                              ) : (
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={weight}
                                  disabled={!vrm}
                                  aria-label={`${action.label} 표정 강도`}
                                  className="h-2 flex-1 accent-accent"
                                  onChange={(e) => updateExpressionWeight(name, Number(e.target.value))}
                                />
                              )}
                              <span className="w-8 text-right numeral">{Math.round(weight * 100)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  return (
                    <p className="text-center py-2 text-[0.68rem] text-fg-3">이 카테고리에 해당하는 표정이 없습니다.</p>
                  );
                })()}

                <button
                  type="button"
                  className="mt-3 w-full rounded-lg border border-line bg-card py-1.5 text-xs text-fg hover:bg-raised disabled:opacity-45"
                  disabled={!vrm || Object.keys(expressionWeights).length === 0}
                  onClick={() => {
                    setExpressionWeights({});
                    setActiveExpressionId("neutral");
                    if (vrmRef.current) {
                      applyExpressionWeightsToVrm(vrmRef.current, {});
                    }
                  }}
                >
                  표정 믹스 초기화
                </button>
              </section>

              <section hidden={hideOnTab("pose")}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <UserRound size={15} className="text-accent" aria-hidden />
                    포즈
                  </h3>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      disabled={!vrm}
                      onClick={() => handleMirrorPose("all")}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] font-bold text-fg-2 hover:bg-raised disabled:opacity-45"
                      title="현재 포즈를 좌우로 반전"
                    >
                      <FlipHorizontal2 size={11} aria-hidden /> 반전
                    </button>
                    <button
                      type="button"
                      disabled={!vrm}
                      onClick={handleCopyPose}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] font-bold text-fg-2 hover:bg-raised disabled:opacity-45"
                      title="클립보드로 포즈 데이터 복사"
                    >
                      복사
                    </button>
                    <button
                      type="button"
                      disabled={!vrm}
                      onClick={handlePastePose}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] font-bold text-fg-2 hover:bg-raised disabled:opacity-45"
                      title="클립보드 포즈 데이터 붙여넣기"
                    >
                      붙여넣기
                    </button>
                    <button
                      type="button"
                      disabled={!vrm}
                      onClick={handleSavePose}
                      className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent-soft/40 px-2 py-1 text-[0.68rem] font-bold text-accent hover:bg-accent-soft disabled:opacity-45"
                    >
                      <Sparkles size={11} /> 저장
                    </button>
                  </div>
                </div>

                <div className="mb-3 rounded-xl border border-accent/25 bg-accent-soft/20 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.7rem] font-bold text-fg">뷰포트 관절 핸들 · 손발 IK</p>
                      <p className="mt-0.5 text-[0.65rem] leading-relaxed text-fg-3">
                        손·발 마름모는 목표를, 주황색 P는 팔꿈치·무릎 방향을 조절합니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={jointHandlesVisible}
                      disabled={!vrm}
                      onClick={() => {
                        setJointHandlesVisible((visible) => !visible);
                        setJointHandleStatus("");
                      }}
                      className={cx(
                        "min-h-11 min-w-11 shrink-0 rounded-lg border px-2.5 py-1.5 text-[0.68rem] font-bold transition-colors disabled:opacity-45",
                        jointHandlesVisible
                          ? "border-accent/60 bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised",
                      )}
                    >
                      {jointHandlesVisible ? "핸들 켜짐" : "핸들 꺼짐"}
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[0.62rem] font-bold text-fg-3">이동 방식</p>
                      <div
                        className="flex max-w-full gap-1 overflow-x-auto"
                        role="group"
                        aria-label="IK 핸들 이동 방식"
                      >
                        {STUDIO_VRM_IK_DRAG_MODES.map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            aria-pressed={ikHandleDragMode === mode.id}
                            disabled={!vrm || jointHandleInteracting}
                            title={mode.description}
                            onClick={() => {
                              cancelJointIkTransaction();
                              setIkHandleDragMode(mode.id);
                              setJointHandleStatus(
                                mode.id === "depth"
                                  ? "깊이 이동 · 위로 끌면 멀리, 아래로 끌면 가까이 이동합니다."
                                  : "화면 이동 · 현재 화면과 나란한 평면에서 움직입니다.",
                              );
                            }}
                            className={cx(
                              "min-h-11 min-w-11 flex-1 rounded-lg border px-2 text-[0.66rem] font-bold transition-colors disabled:opacity-45",
                              ikHandleDragMode === mode.id
                                ? "border-accent/60 bg-accent-soft text-accent"
                                : "border-line bg-card text-fg-2 hover:bg-raised",
                            )}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-[0.62rem] font-bold text-fg-3">축 제한</p>
                      <div
                        className="flex max-w-full gap-1 overflow-x-auto"
                        role="group"
                        aria-label="IK 핸들 축 제한"
                      >
                        {STUDIO_VRM_IK_AXIS_LOCKS.map((axis) => (
                          <button
                            key={axis.id}
                            type="button"
                            aria-pressed={ikHandleAxisLock === axis.id}
                            disabled={!vrm || jointHandleInteracting}
                            title={axis.description}
                            onClick={() => {
                              cancelJointIkTransaction();
                              setIkHandleAxisLock(axis.id);
                              setJointHandleStatus(`IK 핸들 ${axis.description} 모드입니다.`);
                            }}
                            className={cx(
                              "min-h-11 min-w-11 flex-1 rounded-lg border px-2 text-[0.66rem] font-bold transition-colors disabled:opacity-45",
                              ikHandleAxisLock === axis.id
                                ? "border-accent/60 bg-accent-soft text-accent"
                                : "border-line bg-card text-fg-2 hover:bg-raised",
                            )}
                          >
                            {axis.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {webcamActive || idleAnimation ? (
                    <p className="mt-1.5 text-[0.65rem] text-warn" role="status">
                      실시간 추적 또는 대기 애니메이션을 끄면 관절 핸들을 편집할 수 있습니다.
                    </p>
                  ) : null}
                  {jointHandleStatus ? (
                    <p className="mt-1.5 text-[0.65rem] leading-relaxed text-fg-2" role="status" aria-live="polite">
                      {jointHandleStatus}
                    </p>
                  ) : null}
                </div>

                <StudioVrmRigAssistPanel
                  disabled={!vrm || webcamActive || idleAnimation || isCapturing || persistentIkReconciling}
                  jointProfile={rigJointProfile}
                  fullBodyIk={fullBodyIkEnabled}
                  footPlant={footPlantEnabled}
                  floorHeight={rigFloorHeight}
                  rootYOffset={customYOffset}
                  translations={poseTranslations}
                  ikConstraints={ikConstraints}
                  onJointProfileChange={(profile) => {
                    cancelJointIkTransaction();
                    setRigJointProfile(profile);
                    setJointHandleStatus("");
                  }}
                  onFullBodyIkChange={(enabled) => {
                    cancelJointIkTransaction();
                    setFullBodyIkEnabled(enabled);
                    setJointHandleStatus("");
                  }}
                  onFootPlantChange={(enabled) => {
                    cancelJointIkTransaction();
                    setFootPlantEnabled(enabled);
                    setJointHandleStatus("");
                  }}
                  onFloorHeightChange={(height) => {
                    cancelJointIkTransaction();
                    setRigFloorHeight(height);
                    setJointHandleStatus("");
                  }}
                  onResetTranslations={() => {
                    cancelJointIkTransaction({ restoreBaseline: false });
                    const cleared = cloneStudioVrmPoseTranslations(
                      EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
                    );
                    setPoseTranslations(cleared);
                    setCustomYOffset(0);
                    const currentVrm = vrmRef.current;
                    if (currentVrm) {
                      applyPoserVisualState(currentVrm, {
                        bones: customBones,
                        yOffset: 0,
                        poseTranslations: cleared,
                        fingerEdits: effectiveFingerEdits,
                        bodyScale,
                      });
                    }
                    setJointHandleStatus("저장된 root·골반·척추 이동을 초기화했습니다.");
                  }}
                  onConstraintEnabledChange={(effector, enabled) => {
                    commitIkConstraintSettings(
                      ikConstraints.map((constraint) => (
                        constraint.effector === effector ? { ...constraint, enabled } : constraint
                      )),
                      enabled ? "고정점을 다시 활성화했습니다." : "고정점을 계산과 화면에서 제외했습니다.",
                    );
                  }}
                  onConstraintLockedChange={(effector, locked) => {
                    commitIkConstraintSettings(
                      ikConstraints.map((constraint) => (
                        constraint.effector === effector ? { ...constraint, locked } : constraint
                      )),
                      locked ? "다른 포즈 편집 중에도 고정점을 유지합니다." : "고정점 유지 잠금을 해제했습니다.",
                    );
                  }}
                  onConstraintRemove={(effector) => {
                    if (selectedIkPole === effector) setSelectedIkPole(null);
                    commitIkConstraintSettings(
                      removeStudioVrmIkConstraint(ikConstraints, effector),
                      "손·발 고정점을 삭제했습니다.",
                    );
                  }}
                />

                <label className="mb-3 flex items-center gap-2 text-xs text-fg-2 cursor-pointer bg-card/30 border border-line/50 p-2 rounded-lg hover:bg-raised/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={preserveExpression}
                    onChange={(e) => setPreserveExpression(e.target.checked)}
                    className="size-3.5 accent-accent cursor-pointer"
                  />
                  <span className="font-medium">포즈 적용 시 캐릭터 표정 유지</span>
                </label>

                <StudioVrmPhotoPoseScanner
                  disabled={poseMaterialRuntimeDisabled}
                  onApply={handlePhotoPoseApply}
                />

                <StudioVrmPoseMaterialPanel
                  disabled={poseMaterialRuntimeDisabled}
                  activeMaterialId={
                    activePoseId.startsWith("pose-material:")
                      ? activePoseId.slice("pose-material:".length)
                      : null
                  }
                  lockedBoneCount={portableLockedPoseBones().length}
                  onCapture={handleCapturePoseMaterial}
                  onApply={handleApplyPoseMaterial}
                  onMaterialDeleted={handlePoseMaterialProvenanceInvalidated}
                  onMaterialReplaced={handlePoseMaterialProvenanceInvalidated}
                />

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {STUDIO_VRM_POSE_BUCKETS.map((bucket) => {
                    const count =
                      bucket.id === "all"
                        ? allPoseListItems.length
                        : filterStudioVrmPosesByBucket(allPoseListItems, bucket.id, recentPoseState.ids).length;
                    return (
                      <button
                        key={bucket.id}
                        type="button"
                        title={`${bucket.hint} · ${studioVrmPoseBucketCountLabel(bucket.id, count)}`}
                        aria-pressed={poseBucket === bucket.id}
                        className={cx(
                          "min-h-8 rounded-full border px-2.5 text-[0.65rem] font-bold transition-colors",
                          poseBucket === bucket.id
                            ? "border-accent/55 bg-accent text-on-accent"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                        onClick={() => setPoseBucket(bucket.id)}
                      >
                        {bucket.label}
                        <span className="ml-1 opacity-75">{count}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative mb-3">
                  <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
                  <input
                    type="search"
                    value={poseQuery}
                    onChange={(e) => setPoseQuery(e.target.value)}
                    placeholder="포즈 검색 (이름 · 분위기)"
                    aria-label="포즈 검색"
                    className="w-full rounded-lg border border-line bg-card py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                </div>
                {poseResultCount === 0 ? (
                  <p className="rounded-xl border border-dashed border-line/55 bg-card/20 py-4 text-center text-[0.68rem] italic text-fg-3">
                    {poseQ
                      ? `“${poseQuery}” 검색 결과가 없습니다.`
                      : poseBucket === "recent"
                        ? "최근에 쓴 포즈가 없습니다. 포즈를 선택하면 여기에 쌓입니다."
                        : "이 분류에 맞는 포즈가 없습니다."}
                  </p>
                ) : null}

                <div className={cx("grid grid-cols-2 gap-2", poseQ && !POSE_PRESETS.some(poseMatches) && "hidden")}>
                  {POSE_PRESETS.filter(poseMatches).map((pose) => (
                    <button
                      key={pose.id}
                      type="button"
                      className={cx(
                        "min-h-[3.2rem] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                        activePoseId === pose.id
                          ? "border-accent/55 bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                      )}
                      disabled={!vrm}
                      onClick={() => handlePoseSelect(pose.id)}
                    >
                      <span className="block text-xs font-bold">{pose.label}</span>
                      <span className="mt-0.5 block text-[0.68rem] text-fg-3">{pose.tone}</span>
                    </button>
                  ))}
                </div>

                {/* 자연 아이들 포즈 — 캐릭터 스폰 시 자동 적용되는 비대칭 컨트라포스토 대기 */}
                <div className={cx("mt-3.5 border-t border-line/45 pt-3", poseQ && !NATURAL_IDLE_POSES.some(poseMatches) && "hidden")}>
                  <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">자연 대기 · 스폰 포즈 ({poseQ ? NATURAL_IDLE_POSES.filter(poseMatches).length : NATURAL_IDLE_POSES.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {NATURAL_IDLE_POSES.filter(poseMatches).map((pose) => (
                      <button
                        key={pose.id}
                        type="button"
                        className={cx(
                          "min-h-[3.2rem] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                          activePoseId === pose.id
                            ? "border-accent/55 bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                        disabled={!vrm}
                        onClick={() => handlePoseSelect(pose.id)}
                      >
                        <span className="block text-xs font-bold">{pose.label}</span>
                        <span className="mt-0.5 block text-[0.68rem] text-fg-3">{pose.tone}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 확장 포즈 프리셋(studio-pose-presets) — 코미Po!식 상황별 포즈 팩 */}
                <div className={cx("mt-3.5 border-t border-line/45 pt-3", poseQ && !EXTRA_POSE_PRESETS.some(poseMatches) && "hidden")}>
                  <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">확장 포즈 팩 ({poseQ ? EXTRA_POSE_PRESETS.filter(poseMatches).length : EXTRA_POSE_PRESETS.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {EXTRA_POSE_PRESETS.filter(poseMatches).map((pose) => (
                      <button
                        key={pose.id}
                        type="button"
                        className={cx(
                          "min-h-[3.2rem] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                          activePoseId === pose.id
                            ? "border-accent/55 bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                        disabled={!vrm}
                        onClick={() => handlePoseSelect(pose.id)}
                      >
                        <span className="block text-xs font-bold">{pose.label}</span>
                        <span className="mt-0.5 block text-[0.68rem] text-fg-3">{pose.tone}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={cx("mt-3.5 space-y-2 border-t border-line/45 pt-3", poseQ && !savedPoses.some(poseMatches) && "hidden")}>
                  <div className="flex items-center justify-between">
                    <p className="text-[0.65rem] font-bold text-fg-3 uppercase tracking-wider">내가 만든 포즈 ({savedPoses.length})</p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleExportPoses}
                        disabled={savedPoses.length === 0}
                        className="inline-flex items-center rounded border border-line bg-card px-1.5 py-0.5 text-[0.68rem] font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-40"
                        title="JSON 파일로 백업 내보내기"
                      >
                        내보내기
                      </button>
                      <button
                        type="button"
                        onClick={handleImportPoses}
                        className="inline-flex items-center rounded border border-line bg-card px-1.5 py-0.5 text-[0.68rem] font-bold text-fg-2 hover:bg-raised hover:text-fg"
                        title="JSON 포즈 파일 가져오기"
                      >
                        가져오기
                      </button>
                    </div>
                  </div>
                  
                  {savedPoses.length === 0 ? (
                    <p className="text-center py-4 text-[0.68rem] text-fg-3/60 italic bg-card/20 rounded-xl border border-dashed border-line/55">
                      저장된 커스텀 포즈가 없습니다.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {savedPoses.filter(poseMatches).map((pose) => (
                        <div
                          key={pose.id}
                          className={cx(
                            "relative flex min-h-[3.2rem] flex-col justify-center rounded-xl border px-3 py-2 text-left transition-colors",
                            activePoseId === pose.id
                              ? "border-accent/55 bg-accent-soft text-accent"
                              : "border-line bg-card text-fg-2"
                          )}
                        >
                          <button
                            type="button"
                            className="w-full rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            disabled={!vrm}
                            onClick={() => handleCustomPoseSelect(pose)}
                          >
                            <span className="block text-xs font-bold truncate pr-5">{pose.label}</span>
                            <span className="mt-0.5 block text-[0.65rem] text-fg-3">Y-Offset: {pose.yOffset.toFixed(2)}m</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeletePose(pose.id, e)}
                            className="absolute right-2 top-2 grid size-5 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-bad"
                            aria-label="포즈 삭제"
                            title="삭제"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <details
                hidden={hideOnTab("pose")}
                className="group rounded-xl border border-line bg-card/45 p-3"
                onToggle={(event) => setSharedPoseLibraryOpen(event.currentTarget.open)}
              >
                <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  서버 공유 포즈 라이브러리
                  <ChevronDown size={14} className="ml-auto text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    disabled={!vrm || persistentIkReconciling}
                    onClick={() => void handleSharePoseToServer()}
                    className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent-soft/40 px-2 py-1 text-[0.68rem] font-bold text-accent hover:bg-accent-soft disabled:opacity-45"
                  >
                    {isSharingPose ? <Loader2 className="animate-spin" size={11} /> : <Upload size={11} />}
                    {isSharingPose ? "공유 취소" : "포즈 서버에 공유"}
                  </button>
                </div>
                <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                  다른 웹툰 작가들이 공유한 포즈를 내 캐릭터에 즉시 입히고, 나만의 멋진 포즈를 서버에 올려 공유하세요!
                </p>

                {sharedPosesStatus === "error" ? (
                  <div className="rounded-xl border border-warn/35 bg-warn/10 px-3 py-3 text-center text-xs text-fg-2" role="status">
                    <p>공유 포즈 서버에 연결하지 못했습니다. 로컬 포즈 편집은 계속 사용할 수 있습니다.</p>
                    <button
                      type="button"
                      className="mt-2 inline-flex items-center rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] font-bold text-fg hover:bg-raised"
                      onClick={() => setSharedPoseReloadToken((token) => token + 1)}
                    >
                      다시 시도
                    </button>
                  </div>
                ) : sharedPosesStatus === "loading" && sharedPoses.length === 0 ? (
                  <div className="rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3">
                    공유된 포즈를 불러오는 중입니다...
                  </div>
                ) : sharedPoses.length === 0 ? (
                  <p className="text-center py-4 text-[0.68rem] text-fg-3/60 italic bg-card/20 rounded-xl border border-dashed border-line/55">
                    서버에 등록된 공유 포즈가 없습니다. 첫 포즈를 공유해 보세요!
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 lg:max-h-[220px] lg:overflow-y-auto lg:pr-1">
                    {sharedPoses.map((asset) => {
                      const isActive = activePoseId === `shared-${asset.id}`;
                      return (
                        <div
                          key={asset.id}
                          className={cx(
                            "relative flex min-h-[4rem] flex-col justify-between rounded-xl border p-2 text-left transition-colors",
                            isActive
                              ? "border-accent bg-accent-soft text-accent"
                              : "border-line bg-card text-fg-2 hover:bg-raised"
                          )}
                        >
                            <button
                              type="button"
                              className="flex h-full w-full flex-col justify-between rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                              disabled={!vrm || sharedPoseSelectionAssetId === asset.id}
                              onClick={() => handleSelectSharedPose(asset)}
                            >
                            <div className="min-w-0">
                              <span className="block text-[0.7rem] font-bold truncate pr-4 text-fg" title={asset.name.replace("[3D_POSE] ", "")}>
                                {asset.name.replace("[3D_POSE] ", "")}
                              </span>
                              <span className="block text-[0.68rem] text-fg-3 truncate">
                                작성자: {asset.author?.name || "익명"}
                              </span>
                            </div>
                            <span className="mt-1 block text-[0.68rem] text-fg-3 font-semibold">
                              다운로드 {asset.downloads}회
                            </span>
                              {sharedPoseSelectionAssetId === asset.id ? (
                                <span className="mt-1 block text-[0.64rem] text-accent">적용 중…</span>
                              ) : null}
                          </button>
                          {asset.isOwner && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSharedPose(asset, e)}
                              className="absolute right-2 top-2 grid size-5 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-bad"
                              aria-label="포즈 삭제"
                              title="서버에서 삭제"
                            >
                              <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
                {sharedPoseHasMore && sharedPoseNextOffset !== null ? (
                  <button
                    type="button"
                    className="mt-1 inline-flex w-full items-center justify-center rounded-lg border border-accent/40 bg-accent-soft/30 px-2 py-1.5 text-[0.68rem] font-bold text-accent hover:bg-accent-soft disabled:opacity-45"
                    disabled={sharedPosesStatus === "loading"}
                    onClick={() => void loadMoreSharedPoses()}
                  >
                    {sharedPosesStatus === "loading" ? "추가 항목 불러오는 중..." : "더 보기"}
                  </button>
                ) : null}
              </details>

              <section
                id="vrm-character-section-wardrobe"
                role="tabpanel"
                aria-labelledby="vrm-character-subtab-wardrobe"
                aria-busy={wardrobeInteractionLocked || undefined}
                hidden={hideOnCharacterSection("wardrobe")}
                className="rounded-xl border border-line bg-card/45 p-3"
              >
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Shirt size={14} className="text-accent" aria-hidden />
                  몸 맞춤 3D 워드로브
                  <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[0.68rem] font-bold text-accent">Body Fit v2</span>
                  <span className="rounded-full bg-good/12 px-1.5 py-0.5 text-[0.68rem] font-bold text-good">Skin v1</span>
                </h3>
                <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
                  실제 스킨 골격의 체형을 다시 재고, 팔꿈치·무릎을 지나는 옷은 같은 골격의 혼합 웨이트로 부드럽게 변형합니다. 안쪽 옷보다 겉옷이 바깥에 오도록 여유도 맞춥니다. 천 물리는 다음 실험 단계이며 지금은 안정적인 포즈 변형과 겹침 예방에 집중합니다.
                </p>

                {Object.keys(wardrobeState).length > 0 ? (
                  <div
                    data-testid="wardrobe-fit-status"
                    className={cx(
                      "mb-3 rounded-xl border px-2.5 py-2",
                      wardrobeFitReport.status === "ready"
                        ? "border-good/35 bg-good/10"
                        : wardrobeFitReport.status === "warning"
                          ? "border-warn/40 bg-warn/10"
                          : "border-line bg-card",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {wardrobeFitReport.status === "ready" ? (
                        <Sparkles size={14} className="mt-0.5 shrink-0 text-good" aria-hidden />
                      ) : (
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.7rem] font-bold text-fg">
                          {wardrobeFitReport.status === "ready"
                            ? wardrobeFitReport.autoAdjusted ? "자동 여유 적용됨" : "맞춤 양호"
                            : wardrobeFitReport.status === "warning" ? "맞춤 확인 필요" : "체형 측정 대기 중"}
                        </p>
                        <p className="mt-0.5 text-[0.64rem] leading-relaxed text-fg-3">
                          {wardrobeFitReport.issues[0]?.message
                            ?? "몸과 의상 레이어 사이에 권장 여유가 확보되었습니다."}
                        </p>
                      </div>
                    </div>
                    {wardrobeFitReport.issues.some((issue) => issue.severity === "warning" && issue.suggestedFit !== undefined) ? (
                      <button
                        type="button"
                        disabled={wardrobeInteractionLocked}
                        className="mt-2 min-h-9 w-full rounded-lg border border-warn/40 bg-card px-2 text-[0.66rem] font-bold text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
                        onClick={applyWardrobeFitSuggestions}
                      >
                        권장 여유값 적용
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {/* 원클릭 코디 세트 */}
                <div className="mb-3 space-y-1.5 border-b border-line/35 pb-3">
                  <p className="text-[0.65rem] font-bold text-fg-2">원클릭 코디 세트</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SELECTABLE_WARDROBE_SETS.map((set) => (
                      <button
                        key={set.id}
                        type="button"
                        disabled={!vrm || wardrobeInteractionLocked}
                        onClick={() => equipWardrobeSetById(set.id)}
                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5 text-left text-[0.68rem] font-medium text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="text-xs" aria-hidden>{set.emoji}</span>
                        <span className="truncate">{set.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 슬롯별 장착 */}
                <div className="space-y-2.5">
                  {WARDROBE_SLOTS.map((slot) => {
                    const equip = wardrobeState[slot];
                    const equippedDef = equip ? wardrobeItemById(equip.itemId) : undefined;
                    const slotFit = wardrobeFitReport.slots[slot];
                    const surfaceReceipt = wardrobeSurfaceReceipts[slot];
                    return (
                      <div key={slot} className="rounded-lg border border-line/60 bg-card/60 p-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <p className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-[0.65rem] font-bold text-fg-2">
                            {WARDROBE_SLOT_LABELS[slot]}
                            {equippedDef ? <span className="ml-1 font-semibold text-accent">{equippedDef.label}</span> : null}
                            {equip && surfaceReceipt ? (
                              <span
                                data-testid={`wardrobe-surface-${slot}`}
                                data-garment-runtime={surfaceReceipt.mode}
                                className={cx(
                                  "rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold",
                                  surfaceReceipt.mode === "skinned-shell-v1"
                                    ? "bg-good/12 text-good"
                                    : "bg-warn/12 text-warn",
                                )}
                                title={surfaceReceipt.mode === "skinned-shell-v1"
                                  ? `${surfaceReceipt.boneCount}개 관절 · 혼합 정점 ${surfaceReceipt.blendedVertexCount.toLocaleString("ko-KR")}개`
                                  : "이 VRM의 골격 구조에서는 안정적인 기존 부착 방식으로 표시합니다."}
                              >
                                {surfaceReceipt.mode === "skinned-shell-v1" ? "관절 스키닝" : "호환 장착"}
                              </span>
                            ) : null}
                          </p>
                          {equip ? (
                            <button
                              type="button"
                              disabled={wardrobeInteractionLocked}
                              onClick={() => equipWardrobeItem(slot, null)}
                              className="rounded-md px-1.5 py-0.5 text-[0.68rem] font-semibold text-fg-3 hover:bg-raised hover:text-bad disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              해제
                            </button>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {selectableWardrobeItemsBySlot(slot).map((item) => {
                            const active = equip?.itemId === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                disabled={!vrm || wardrobeInteractionLocked}
                                aria-pressed={active}
                                title={item.hint}
                                onClick={() => equipWardrobeItem(slot, active ? null : item.id)}
                                className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[0.66rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                  active ? "border-accent bg-accent/15 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
                                }`}
                              >
                                <span className="text-sm" aria-hidden>{item.emoji}</span>
                                <span className="w-full truncate text-center">{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        {equip ? (
                          <div className="mt-2 space-y-2 border-t border-line/40 pt-2">
                            <div className="grid grid-cols-[auto_1fr] gap-2">
                              <label className="flex min-h-11 items-center gap-1 text-[0.68rem] font-semibold text-fg-2">
                                색
                                <input
                                  type="color"
                                  disabled={wardrobeInteractionLocked}
                                  value={equip.color}
                                  onChange={(e) => updateWardrobeEquip(slot, { color: e.target.value })}
                                  className="size-8 cursor-pointer rounded border border-line bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:size-11"
                                  aria-label={`${WARDROBE_SLOT_LABELS[slot]} 색상`}
                                />
                              </label>
                              <label className="flex min-w-0 items-center gap-1.5 text-[0.68rem] font-semibold text-fg-2">
                                소재
                                <select
                                  disabled={wardrobeInteractionLocked}
                                  value={equip.fabricId}
                                  onChange={(event) => updateWardrobeEquip(slot, { fabricId: event.target.value as WardrobeEquip["fabricId"] })}
                                  className="min-h-9 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-[0.68rem] text-fg focus:border-accent focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
                                  aria-label={`${WARDROBE_SLOT_LABELS[slot]} 소재`}
                                >
                                  {WARDROBE_FABRICS.map((fabric) => (
                                    <option key={fabric.id} value={fabric.id}>{fabric.label}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[0.66rem] font-semibold text-fg-2">몸 맞춤</span>
                              <div className="grid grid-cols-2 rounded-lg border border-line bg-card p-0.5" role="group" aria-label={`${WARDROBE_SLOT_LABELS[slot]} 몸 맞춤 방식`}>
                                {(["auto", "manual"] as const).map((mode) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    disabled={wardrobeInteractionLocked}
                                    aria-pressed={equip.fitMode === mode}
                                    onClick={() => updateWardrobeEquip(slot, { fitMode: mode })}
                                    className={cx(
                                      "min-h-8 rounded-md px-2 text-[0.64rem] font-bold disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-10",
                                      equip.fitMode === mode ? "bg-accent text-on-accent" : "text-fg-3 hover:bg-raised",
                                    )}
                                  >
                                    {mode === "auto" ? "자동" : "직접"}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <label className="flex items-center gap-1.5 text-[0.68rem] font-semibold text-fg-2">
                              여유
                              <input
                                type="range"
                                disabled={wardrobeInteractionLocked}
                                min={WARDROBE_FIT_MIN}
                                max={WARDROBE_FIT_MAX}
                                step={0.02}
                                value={equip.fit}
                                onChange={(e) => updateWardrobeEquip(slot, { fit: Number(e.target.value) })}
                                className="h-2 flex-1 accent-accent disabled:cursor-not-allowed disabled:opacity-45"
                                aria-label={`${WARDROBE_SLOT_LABELS[slot]} 기본 여유`}
                              />
                              <span className="w-9 text-right tabular-nums text-fg-3">{Math.round(equip.fit * 100)}%</span>
                            </label>
                            {slotFit && Math.abs(slotFit.effectiveFit - equip.fit) > 0.001 ? (
                              <p className="rounded-md bg-accent-soft/45 px-2 py-1 text-[0.62rem] leading-relaxed text-accent">
                                겹침을 막기 위해 화면에는 {Math.round(slotFit.effectiveFit * 100)}% 여유로 표시됩니다. 저장된 기본값은 바뀌지 않습니다.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-line/60 bg-card/60 p-2">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-semibold text-fg-2">원본 의상 겹침 방지</p>
                    <p className="mt-0.5 text-[0.61rem] leading-relaxed text-fg-3">같은 부위의 VRM 원본 옷만 자동으로 숨깁니다.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={wardrobeAutoHide}
                    aria-label="같은 부위 기존 의상 자동 숨김"
                    disabled={wardrobeInteractionLocked}
                    onClick={toggleWardrobeAutoHide}
                    className={cx(
                      "min-h-9 shrink-0 rounded-lg border px-2.5 text-[0.66rem] font-bold disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11",
                      wardrobeAutoHide
                        ? "border-accent/55 bg-accent text-on-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised",
                    )}
                  >
                    {wardrobeAutoHide ? "사용 중" : "꺼짐"}
                  </button>
                  <button
                    type="button"
                    disabled={!vrm || Object.keys(wardrobeState).length === 0 || wardrobeInteractionLocked}
                    onClick={clearWardrobe}
                    className="min-h-9 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
                  >
                    전체 해제
                  </button>
                </div>
              </section>

              <section
                id="vrm-character-section-appearance"
                role="tabpanel"
                aria-labelledby="vrm-character-subtab-appearance"
              hidden={hideOnCharacterSection("appearance")}
              className="rounded-xl border border-line bg-card/45 p-3"
              >
                <div className="mb-4 rounded-xl border border-accent/25 bg-accent-soft/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                        <PersonStanding size={14} className="text-accent" aria-hidden />
                        중립 데생 인형 보기
                      </h3>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                        캐릭터의 텍스처와 발광을 숨기고 명암·실루엣·관절만 확인합니다. 원래 외형은 언제든 복원됩니다.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={mannequinMode}
                      disabled={!vrm}
                      className={cx(
                        "min-h-9 shrink-0 rounded-lg border px-2.5 text-[0.68rem] font-bold disabled:opacity-45",
                        mannequinMode
                          ? "border-accent/55 bg-accent text-on-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised"
                      )}
                      onClick={() => setMannequinMode((current) => !current)}
                    >
                      {mannequinMode ? "사용 중" : "켜기"}
                    </button>
                  </div>
                </div>
                <div className="mb-4 border-b border-line/45 pb-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                      <UserRound size={14} className="text-accent" aria-hidden />
                      체형 비율
                    </h3>
                    <button
                      type="button"
                      disabled={!vrm}
                      className="min-h-9 rounded-lg border border-line bg-card px-2 text-[0.64rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-45 pointer-coarse:min-h-11"
                      onClick={() => setBodyScale({ height: 1, width: 1 })}
                    >
                      기본 비율
                    </button>
                  </div>
                  <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                    어린이·청소년·성인·노년 실루엣의 시작 비율을 유지하거나, 키와 체격을 직접 조정하세요.
                  </p>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-10 shrink-0 font-medium">키</span>
                      <input
                        type="range"
                        min="0.7"
                        max="1.4"
                        step="0.01"
                        value={bodyScale.height}
                        disabled={!vrm}
                        onChange={(event) => setBodyScale((current) => ({ ...current, height: Number(event.target.value) }))}
                        className="h-2 flex-1 accent-accent"
                        aria-label="캐릭터 키 비율"
                      />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{bodyScale.height.toFixed(2)}×</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-10 shrink-0 font-medium">체격</span>
                      <input
                        type="range"
                        min="0.7"
                        max="1.3"
                        step="0.01"
                        value={bodyScale.width}
                        disabled={!vrm}
                        onChange={(event) => setBodyScale((current) => ({ ...current, width: Number(event.target.value) }))}
                        className="h-2 flex-1 accent-accent"
                        aria-label="캐릭터 체격 비율"
                      />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{bodyScale.width.toFixed(2)}×</span>
                    </label>
                  </div>
                </div>

                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Sliders size={14} className="text-accent" aria-hidden />
                  의상 및 신체 색상 변경
                </h3>
                <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                  캐릭터의 부위별 색상을 자유롭게 변경해 보세요.
                </p>

                {/* 의상 테마 프리셋 */}
                <div className="mb-4 space-y-1.5 border-b border-line/35 pb-3">
                  <p className="text-[0.65rem] font-bold text-fg-2">테마 추천 의상셋</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COSTUME_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!vrm}
                        onClick={() => {
                          setCustomColors(p.colors);
                          if (vrmRef.current) {
                            applyVrmCustomColors(vrmRef.current, p.colors);
                          }
                          // 테마 채색과 함께 대응하는 3D 의상 세트도 실장착한다(색놀이→진짜 옷).
                          equipWardrobeSetById(p.id);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5 text-left text-[0.68rem] font-medium text-fg hover:bg-raised disabled:opacity-40 transition-colors cursor-pointer"
                      >
                        <span className="text-xs">{p.emoji}</span>
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <p className="mb-2 text-[0.65rem] font-bold text-fg-2">부위별 정밀 채색</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { key: "tops", label: "상의/드레스" },
                    { key: "bottoms", label: "하의/신발" },
                    { key: "hair", label: "머리카락" },
                    { key: "body", label: "피부(몸)" },
                    { key: "face", label: "얼굴" },
                  ].map((part) => (
                    <div key={part.key} className="flex min-w-0 flex-col gap-1">
                      <span className="text-[0.65rem] font-semibold text-fg-2">{part.label}</span>
                      <VrmColorControl
                        label={part.label}
                        value={customColors[part.key] || "#ffffff"}
                        disabled={!vrm}
                        onChange={(hex) => setCustomColors((prev) => ({ ...prev, [part.key]: hex }))}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg border border-line bg-card py-1.5 text-xs text-fg hover:bg-raised disabled:opacity-45"
                  disabled={!vrm}
                  onClick={() => {
                    setCustomColors({ ...DEFAULT_VRM_CUSTOM_COLORS });
                  }}
                >
                  색상 초기화
                </button>
              </section>

              <details ref={manualPoseDetailsRef} hidden={hideOnTab("pose")} className="group rounded-xl border border-line bg-card/45 p-3">
                <summary className="mb-2.5 flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <Sliders size={14} className="text-accent" aria-hidden />
                  관절 미세 조정 (Manual Pose)
                  <ChevronDown size={13} className="ml-auto text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>

                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-line/55 bg-panel/40 p-2">
                  <p className="text-[0.65rem] leading-relaxed text-fg-3">
                    방향 기반 프리셋을 현재 보이는 회전값으로 변환하면 슬라이더와 관절 핸들이 정확히 이어집니다.
                  </p>
                  <button
                    type="button"
                    disabled={!vrm || webcamActive || idleAnimation || isCapturing}
                    onClick={handleBakeCurrentPoseForManualEditing}
                    className="shrink-0 rounded-lg border border-line bg-card px-2 py-1 text-[0.65rem] font-bold text-fg-2 hover:bg-raised disabled:opacity-45"
                  >
                    현재 자세 동기화
                  </button>
                </div>
                
                <div className="mb-3 grid gap-2 rounded-lg border border-line/60 bg-panel/35 p-2.5">
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-[0.68rem] font-semibold text-fg-2">
                    <span>
                      관절 안전 범위
                      <span className="ml-1 font-normal text-fg-3">과회전 방지 · 필요 시 해제</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={jointLimitsEnabled}
                      onChange={(event) => setJointLimitsEnabled(event.target.checked)}
                      className="size-3.5 accent-accent"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-[0.68rem] font-semibold text-fg-2">
                    <span>
                      3D 관절 점 선택
                      <span className="ml-1 font-normal text-fg-3">뷰포트에서 관절을 눌러 바로 찾기</span>
                    </span>
                    <input
                      type="checkbox"
                      disabled={!vrm || webcamActive}
                      checked={showPoseBoneOverlay}
                      onChange={(event) => {
                        setShowPoseBoneOverlay(event.target.checked);
                        if (!event.target.checked) {
                          setViewportHandIkEnabled(false);
                          setIsViewportHandIkDragging(false);
                        }
                      }}
                      className="size-3.5 accent-accent"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-[0.68rem] font-semibold text-fg-2">
                    <span>
                      손목 IK 드래그
                      <span className="ml-1 font-normal text-fg-3">초록 손목 점을 화면 평면에서 이동</span>
                    </span>
                    <input
                      type="checkbox"
                      disabled={!vrm || webcamActive}
                      checked={viewportHandIkEnabled}
                      onChange={(event) => {
                        setViewportHandIkEnabled(event.target.checked);
                        if (event.target.checked) setShowPoseBoneOverlay(true);
                        else setIsViewportHandIkDragging(false);
                      }}
                      className="size-3.5 accent-accent"
                    />
                  </label>
                  {showPoseBoneOverlay ? (
                    <p className="text-[0.62rem] leading-relaxed text-fg-3">
                      파랑은 선택, 초록 손목은 IK 드래그, 주황은 잠금, 강조색은 현재 선택입니다. 관절 점은 최종 PNG에 포함되지 않습니다.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      disabled={!vrm}
                      onClick={() => handleMirrorPose("arms")}
                      className="rounded-md border border-line bg-card px-2 py-1 text-[0.66rem] font-bold text-fg-2 hover:bg-raised disabled:opacity-45"
                    >
                      팔만 반전
                    </button>
                    <button
                      type="button"
                      disabled={!vrm}
                      onClick={() => handleMirrorPose("legs")}
                      className="rounded-md border border-line bg-card px-2 py-1 text-[0.66rem] font-bold text-fg-2 hover:bg-raised disabled:opacity-45"
                    >
                      다리만 반전
                    </button>
                    <button
                      type="button"
                      disabled={!vrm}
                      onClick={handleStraightenUpperBody}
                      className="rounded-md border border-line bg-card px-2 py-1 text-[0.66rem] font-bold text-fg-2 hover:bg-raised disabled:opacity-45"
                    >
                      상체·목 펴기
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-1">
                  {BONE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={cx(
                        "rounded-lg border px-2 py-1 text-[0.68rem] font-bold transition-colors",
                        activeCategory === cat.id
                          ? "border-accent/60 bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised"
                      )}
                      onClick={() => setActiveCategory(cat.id)}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-3.5">
                  {(() => {
                    const cat = BONE_CATEGORIES.find((c) => c.id === activeCategory);
                    if (!cat) return null;
                    return cat.bones.map((boneName) => {
                      const label = BONE_LABELS[boneName] || boneName;
                      const isFinger = POSER_FINGER_BONES.includes(boneName);
                      const rot = isFinger
                        ? (fingerEdits[boneName] || [0, 0, 0])
                        : getPoseBoneRotation(customBones[boneName]);
                      const [xRad, yRad, zRad] = rot as [number, number, number];
                      const xDeg = Math.round(THREE.MathUtils.radToDeg(xRad));
                      const yDeg = Math.round(THREE.MathUtils.radToDeg(yRad));
                      const zDeg = Math.round(THREE.MathUtils.radToDeg(zRad));
                      const locked = lockedPoseBones.includes(boneName);
                      const jointLimit = getStudioVrmJointLimit(boneName);
                      const axisBounds = jointLimitsEnabled
                        ? [jointLimit.x, jointLimit.y, jointLimit.z].map((axis) => ({
                            min: Math.ceil(THREE.MathUtils.radToDeg(axis.hardMin)),
                            max: Math.floor(THREE.MathUtils.radToDeg(axis.hardMax)),
                          }))
                        : [0, 1, 2].map(() => ({ min: -180, max: 180 }));

                      return (
                        <div
                          key={boneName}
                          id={`vrm-manual-bone-${boneName}`}
                          data-vrm-pose-bone={boneName}
                          className={cx(
                            "rounded-lg border bg-panel/40 p-2.5 transition-colors",
                            selectedViewportPoseBone === boneName || selectedJointHandle === boneName
                              ? "border-accent/70 ring-1 ring-accent/25"
                              : "border-line/60",
                          )}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              className="text-left text-[0.7rem] font-bold text-fg-2 hover:text-accent"
                              onClick={() => setSelectedViewportPoseBone(boneName)}
                            >
                              {label}
                            </button>
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                className="text-[0.68rem] text-fg-3 hover:text-accent"
                                disabled={!vrm}
                                aria-pressed={locked}
                                onClick={() => togglePoseBoneLock(boneName)}
                              >
                                {locked ? "잠금 해제" : "잠금"}
                              </button>
                              <button
                                type="button"
                                className="text-[0.68rem] text-accent hover:underline animate-fade-in"
                                disabled={!vrm || locked}
                                onClick={() => {
                                  if (isFinger) {
                                    setFingerEdits((prev) => {
                                      const next = { ...prev };
                                      delete next[boneName];
                                      return next;
                                    });
                                  } else {
                                    setCustomBones((prev) => {
                                      return { ...prev, [boneName]: { rotation: ZERO_ROTATION } };
                                    });
                                  }
                                }}
                              >
                                초기화
                              </button>
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-[0.65rem] text-fg-3">
                            <span className="w-8 shrink-0">앞/뒤:</span>
                            <input
                              type="range"
                              min={axisBounds[0].min}
                              max={axisBounds[0].max}
                              value={xDeg}
                              disabled={!vrm || locked}
                              aria-label={`${label} 앞뒤 회전`}
                              className="h-2 flex-1 accent-accent"
                              onFocus={() => {
                                const handleBone = resolveStudioVrmJointHandleBone(boneName);
                                if (handleBone) setSelectedJointHandle(handleBone);
                              }}
                              onChange={(e) => handleBoneRotationChange(boneName, 0, Number(e.target.value))}
                            />
                            <span className="w-8 text-right numeral">{xDeg}°</span>
                          </div>

                          <div className="mt-1.5 flex items-center gap-2 text-[0.65rem] text-fg-3">
                            <span className="w-8 shrink-0">뒤틀기:</span>
                            <input
                              type="range"
                              min={axisBounds[1].min}
                              max={axisBounds[1].max}
                              value={yDeg}
                              disabled={!vrm || locked}
                              aria-label={`${label} 뒤틀기 회전`}
                              className="h-2 flex-1 accent-accent"
                              onFocus={() => {
                                const handleBone = resolveStudioVrmJointHandleBone(boneName);
                                if (handleBone) setSelectedJointHandle(handleBone);
                              }}
                              onChange={(e) => handleBoneRotationChange(boneName, 1, Number(e.target.value))}
                            />
                            <span className="w-8 text-right numeral">{yDeg}°</span>
                          </div>

                          <div className="mt-1.5 flex items-center gap-2 text-[0.65rem] text-fg-3">
                            <span className="w-8 shrink-0">안/밖:</span>
                            <input
                              type="range"
                              min={axisBounds[2].min}
                              max={axisBounds[2].max}
                              value={zDeg}
                              disabled={!vrm || locked}
                              aria-label={`${label} 안팎 회전`}
                              className="h-2 flex-1 accent-accent"
                              onFocus={() => {
                                const handleBone = resolveStudioVrmJointHandleBone(boneName);
                                if (handleBone) setSelectedJointHandle(handleBone);
                              }}
                              onChange={(e) => handleBoneRotationChange(boneName, 2, Number(e.target.value))}
                            />
                            <span className="w-8 text-right numeral">{zDeg}°</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                
                <div className="mt-4 border-t border-line/60 pt-3">
                  <label className="block">
                    <span className="flex items-center justify-between text-[0.68rem] font-semibold text-fg-2">
                      <span>캐릭터 높이 조정 (Y-Offset)</span>
                      <span className="numeral text-fg-3">{customYOffset.toFixed(2)}m</span>
                    </span>
                    <input
                      type="range"
                      min="-0.30"
                      max="0.30"
                      step="0.01"
                      aria-label="캐릭터 높이 조정 (Y-Offset)"
                      value={customYOffset}
                      disabled={!vrm}
                      className="mt-2 w-full accent-accent"
                      onChange={(e) => handleYOffsetChange(Number(e.target.value))}
                    />
                  </label>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg border border-line bg-card py-1.5 text-xs text-fg hover:bg-raised disabled:opacity-45"
                    disabled={
                      !vrm ||
                      (activePoseId.startsWith("custom-")
                        ? !savedPoses.some((pose) => pose.id === activePoseId)
                        : findPoseById(activePoseId) === null)
                    }
                    onClick={handleResetActivePose}
                  >
                    {activePoseId.startsWith("pose-material:")
                      ? "범용 소재 목록에서 다시 적용"
                      : "현재 프리셋 포즈로 재설정"}
                  </button>
                </div>
              </details>

              <section hidden={hideOnTab("scene")}>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Camera size={15} className="text-accent" aria-hidden />
                  카메라
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {CAMERA_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={cx(
                        CONTROL_BUTTON,
                        activeCameraId === preset.id
                          ? "border-accent/55 bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                      )}
                      onClick={() => setActiveCameraId(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <label className="mt-4 block rounded-xl border border-line bg-card/65 px-3 py-3">
                  <span className="flex items-center justify-between gap-3 text-xs font-semibold text-fg-2">
                    <span className="flex items-center gap-1.5">
                      <RotateCcw size={14} className="text-accent" aria-hidden />
                      캐릭터 회전
                    </span>
                    <span className="numeral text-fg-3">{Math.round(THREE.MathUtils.radToDeg(bodyRotation))}°</span>
                  </span>
                  <input
                    className="mt-3 w-full accent-accent"
                    aria-label="캐릭터 회전"
                    disabled={!vrm}
                    max="180"
                    min="-180"
                    step="1"
                    type="range"
                    value={Math.round(THREE.MathUtils.radToDeg(bodyRotation))}
                    onChange={handleBodyRotationChange}
                  />
                </label>
              </section>

              <section hidden={hideOnTab("scene")} className="mt-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <WandSparkles size={15} className="text-accent" aria-hidden />
                  조명 연출
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: "morning", label: "아침" },
                    { id: "sunset", label: "노을" },
                    { id: "night", label: "밤" },
                    { id: "studio", label: "스튜디오" },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={cx(
                        CONTROL_BUTTON,
                        lightingTone === preset.id
                          ? "border-accent/55 bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                      )}
                      onClick={() => setLightingTone(preset.id as LightingTone)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="mb-1.5 mt-3 text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">퀵 라이팅</p>
                <div className="grid grid-cols-2 gap-2">
                  {STUDIO_VRM_LIGHTING_QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.hint}
                      className="min-h-[3rem] rounded-xl border border-line bg-card px-3 py-2 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      onClick={() => applyLightingQuickPreset(preset.id)}
                    >
                      <span className="block text-xs font-bold text-fg">{preset.label}</span>
                      <span className="mt-0.5 block text-[0.65rem] leading-snug text-fg-3">{preset.hint}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* ── 고도화 컨트롤 (body scale, lighting+, env, full state) ── */}
              <details hidden={hideOnTab("scene")} className="group mt-4 rounded-xl border border-line bg-card/45 p-3">
                <summary className="mb-3 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <Sliders size={15} className="text-accent" aria-hidden />
                  세부 조정 · 상태 저장
                  <ChevronDown size={14} className="ml-auto text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-3.5">
                  {/* 조명 미세 조정 */}
                  <div className="space-y-1.5">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">조명 미세 조정</p>
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-12 shrink-0 font-medium">밝기</span>
                      <input type="range" min="0.2" max="3" step="0.05" value={lighting.intensity} onChange={e => setLighting(l => ({...l, intensity: parseFloat(e.target.value)}))} className="h-2 flex-1 accent-accent" />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{lighting.intensity.toFixed(1)}</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-12 shrink-0 font-medium">색온도</span>
                      <input type="range" min="0" max="1" step="0.05" value={lighting.colorTemp} onChange={e => setLighting(l => ({...l, colorTemp: parseFloat(e.target.value)}))} className="h-2 flex-1 accent-accent" />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{lighting.colorTemp < 0.45 ? "차갑게" : lighting.colorTemp > 0.55 ? "따뜻하게" : "중간"}</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-12 shrink-0 font-medium">방향</span>
                      <input type="range" min="-180" max="180" step="5" value={lighting.directionDeg} onChange={e => setLighting(l => ({...l, directionDeg: parseFloat(e.target.value)}))} className="h-2 flex-1 accent-accent" />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{Math.round(lighting.directionDeg)}°</span>
                    </label>
                  </div>

                  {/* 배경 환경 */}
                  <div className="space-y-1.5 border-t border-line/45 pt-3">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">배경 환경</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ENV_VARIANTS.map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEnvVariant(id)}
                          className={cx(
                            "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                            envVariant === id ? "border-accent/55 bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="mt-2 flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={transparentBackground}
                        disabled={isCapturing || isSharingPose || isThumbnailCapturing}
                        onChange={(event) => setTransparentBackground(event.target.checked)}
                        className="mt-0.5 size-4 accent-accent"
                      />
                      <span className="block text-xs font-bold text-fg">
                        캐릭터만 투명 추출
                        <span className="mt-0.5 block text-[0.68rem] font-normal leading-relaxed text-fg-3">
                          삽입 PNG에서 바닥·벽 환경을 빼고 캐릭터(및 소품)만 남깁니다. 끄면 단색
                          배경색으로 불투명하게 넣습니다.
                        </span>
                      </span>
                    </label>
                    {!transparentBackground && (
                      <label className="mt-1.5 flex items-center gap-2 text-xs text-fg-2">
                        <span className="w-14 shrink-0 font-medium">배경색</span>
                        <input
                          type="color"
                          value={insertBackgroundColor}
                          disabled={isCapturing || isSharingPose || isThumbnailCapturing}
                          onChange={(event) => setInsertBackgroundColor(event.target.value)}
                          className="h-8 w-12 cursor-pointer rounded border border-line bg-card p-0.5"
                          aria-label="삽입 배경색"
                        />
                        <span className="tabular-nums text-fg-3">{insertBackgroundColor}</span>
                      </label>
                    )}
                  </div>

                  {/* 손가락 굽힘 + 손모양 프리셋 */}
                  <div className="space-y-2 border-t border-line/45 pt-3">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">손가락 굽힘 (검지)</p>
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-12 shrink-0 font-medium">왼손</span>
                      <input type="range" min="0" max="60" step="1" value={Math.round(THREE.MathUtils.radToDeg(fingerEdits.leftIndexProximal?.[2] || 0))} onChange={e => updateFingerCurl('left', Number(e.target.value))} className="h-2 flex-1 accent-accent" />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{Math.round(THREE.MathUtils.radToDeg(fingerEdits.leftIndexProximal?.[2] || 0))}°</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-12 shrink-0 font-medium">오른손</span>
                      <input type="range" min="0" max="60" step="1" value={Math.round(THREE.MathUtils.radToDeg(fingerEdits.rightIndexProximal?.[2] || 0))} onChange={e => updateFingerCurl('right', Number(e.target.value))} className="h-2 flex-1 accent-accent" />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{Math.round(THREE.MathUtils.radToDeg(fingerEdits.rightIndexProximal?.[2] || 0))}°</span>
                    </label>
                    {(["left", "right"] as const).map((side) => (
                      <div key={side} className="flex flex-wrap items-center gap-1.5">
                        <span className="w-16 shrink-0 whitespace-nowrap text-[0.66rem] font-semibold text-fg-2">{side === "left" ? "왼손 모양" : "오른손 모양"}</span>
                        {HAND_SHAPE_PRESETS.map((p) => (
                          <button key={p.id} type="button" onClick={() => applyHandPosePreset(side, p.id)} className="rounded-lg border border-line bg-card px-2 py-0.5 text-[0.66rem] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg">{p.label}</button>
                        ))}
                      </div>
                    ))}
                    <button type="button" onClick={() => setFingerEdits({})} className="rounded-lg border border-line bg-card px-2 py-1 text-[0.66rem] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-accent">손가락 초기화</button>
                  </div>

                  {/* 전체 상태 저장 · 불러오기 */}
                  <div className="space-y-2 border-t border-line/45 pt-3">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">전체 상태 저장 · 불러오기</p>
                    <p className="text-[0.68rem] leading-relaxed text-fg-3">포즈 · 비율 · 손가락 · 의상 · 조명 · 소품을 한 번에 저장하고 불러옵니다.</p>
                    <div className="flex gap-1.5">
                      <input
                        value={fullStateName}
                        onChange={(event) => setFullStateName(event.target.value)}
                        placeholder="상태 이름"
                        aria-label="저장할 3D 캐릭터 상태 이름"
                        className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      />
                      <button type="button" onClick={handleSaveFullLocal} className="shrink-0 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-1 text-[0.68rem] font-bold text-accent transition-colors hover:bg-accent-soft">저장</button>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={handleCopyFullState} className="flex-1 rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg">복사</button>
                      <button type="button" onClick={handlePasteFullState} className="flex-1 rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg">붙여넣기</button>
                    </div>
                    {Object.keys(savedFullStates).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {Object.keys(savedFullStates).map(n => (
                          <button key={n} type="button" onClick={() => handleLoadFullLocal(n)} className="rounded-lg border border-line bg-card px-2 py-0.5 text-[0.66rem] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg">{n}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </details>

              {/* ── 자연스러운 애니메이션 효과 ─────────────────────────── */}
              <details hidden={hideOnTab("pose")} className="group mt-4 rounded-xl border border-line bg-card/45 p-3">
                <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  생동감 연출 (대기 모션)
                  <ChevronDown size={14} className="ml-auto text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
                  캐릭터가 정지해 있지 않고 자연스럽게 숨을 쉬고 눈을 깜빡이도록 설정하여 씬을 생생하게 연출합니다.
                </p>
                <div className="flex items-center justify-between text-xs text-fg-2 bg-card/40 border border-line/60 rounded-lg p-2.5">
                  <span className="font-semibold">자연스러운 대기 모션 (숨쉬기 & 눈 깜빡임)</span>
                  <input
                    type="checkbox"
                    className="accent-accent size-4 cursor-pointer"
                    checked={idleAnimation}
                    disabled={webcamActive}
                    onChange={(e) => setIdleAnimation(e.target.checked)}
                    title={webcamActive ? "웹캠 트래킹 중에는 비활성화됩니다" : "대기 애니메이션 토글"}
                  />
                </div>
                {webcamActive && (
                  <p className="mt-1.5 text-[0.68rem] text-accent font-semibold leading-relaxed">
                    ℹ️ 웹캠 실시간 페이스 트래킹이 활성화되어 대기 모션이 자동으로 일시 중지되었습니다.
                  </p>
                )}
              </details>

              {/* ── 본 부착 소품(손/머리/몸) ───────────────────────────── */}
              <div hidden={hideOnTab("props")} className="mt-4">
                <StudioVrmPropPanel
                  vrmReady={Boolean(vrm)}
                  rigMetrics={effectivePropRigMetrics}
                  items={vrmPropItems}
                  selectedUid={selectedVrmPropUid}
                  onSelect={setSelectedVrmPropUid}
                  onAdd={addVrmProp}
                  onUpdate={updateVrmProp}
                  onRemove={removeVrmProp}
                  onClear={() => {
                    setVrmPropItems([]);
                    setSelectedVrmPropUid(null);
                  }}
                />
              </div>

              {/* ── 의상 분리 토글 / 리컬러 ─────────────────────────────── */}
              <details hidden={hideOnCharacterSection("appearance")} className="group mt-4 rounded-xl border border-line bg-card/45 p-3">
                <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <Sliders size={15} className="text-accent" aria-hidden />
                  의상 분리 · 부분 채색
                  <ChevronDown size={14} className="ml-auto text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                {costumeMeshes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line/70 bg-card/40 px-2.5 py-2 text-[0.68rem] text-fg-3">
                    {vrm ? "이 모델은 의상 분리 정보가 없어요." : "모델을 먼저 불러오세요."}
                  </p>
                ) : (
                  <>
                    <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
                      탐지된 의상 메시를 슬롯별로 표시/숨김 토글하거나 색을 바꿉니다. 피부·얼굴·머리는 보호됩니다.
                    </p>
                    {(Object.keys(COSTUME_SLOT_LABELS) as CostumeSlot[]).map((slot) => {
                      const meshesInSlot = costumeMeshes.filter((m) => m.slot === slot);
                      if (meshesInSlot.length === 0) return null;
                      return (
                        <div key={slot} className="mb-3 border-b border-line/35 pb-2.5 last:border-0">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <p className="text-[0.66rem] font-bold text-fg-2">{COSTUME_SLOT_LABELS[slot]}</p>
                            <div className="flex items-center gap-1">
                              {COSTUME_PALETTES.slice(0, 6).map((pal) => (
                                <button
                                  key={pal.id}
                                  type="button"
                                  title={`${pal.label} (${COSTUME_SLOT_LABELS[slot]} 전체)`}
                                  className="size-4 rounded-full border border-line/70"
                                  style={{ backgroundColor: pal.color }}
                                  onClick={() => recolorCostumeSlot(slot, pal.color)}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            {meshesInSlot.map((entry) => {
                              const hidden = costumeState.hidden.includes(entry.key);
                              const autoHidden = isCostumeAutoHidden(entry.key);
                              const recolor = costumeState.recolor[entry.key];
                              const isOpen = selectedCostumeKey === entry.key;
                              return (
                                <div key={entry.key} className="rounded-lg border border-line bg-card/60 px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={autoHidden}
                                      title={autoHidden ? "몸 맞춤 워드로브가 같은 부위의 원본 의상을 자동으로 숨겼습니다." : undefined}
                                      className={cx(
                                        "rounded px-1.5 py-0.5 text-[0.64rem] font-semibold transition-colors disabled:cursor-help",
                                        hidden || autoHidden ? "bg-card text-fg-3 line-through" : "bg-accent-soft text-accent"
                                      )}
                                      onClick={() => toggleCostumeMesh(entry.key)}
                                    >
                                      {autoHidden ? "자동 숨김" : hidden ? "숨김" : "표시"}
                                    </button>
                                    <span className="flex-1 truncate text-[0.68rem] text-fg-2" title={entry.label}>
                                      {entry.label}
                                    </span>
                                    <button
                                      type="button"
                                      className="text-[0.64rem] text-fg-3 hover:underline"
                                      onClick={() => setSelectedCostumeKey(isOpen ? null : entry.key)}
                                    >
                                      색상
                                    </button>
                                  </div>
                                  {isOpen && (
                                    <div className="mt-1.5 flex items-center gap-2">
                                      <input
                                        type="color"
                                        value={recolor ?? "#ffffff"}
                                        aria-label={`${entry.label} 의상 색상`}
                                        onChange={(e) => recolorCostumeMesh(entry.key, e.target.value)}
                                        className="size-6 cursor-pointer rounded border border-line bg-transparent p-0"
                                      />
                                      <button
                                        type="button"
                                        className="rounded border border-line bg-card px-2 py-0.5 text-[0.64rem] text-fg-2 hover:bg-raised"
                                        onClick={() => recolorCostumeMesh(entry.key, null)}
                                      >
                                        원래 색
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="mt-1 w-full rounded-lg border border-line bg-card py-1.5 text-xs text-fg hover:bg-raised"
                      onClick={resetCostume}
                    >
                      의상 초기화
                    </button>
                  </>
                )}
              </details>

              {/* ── 재질 효과(MToon 셰이딩/외곽선/림라이트) ─────────────────── */}
              <details hidden={hideOnCharacterSection("appearance")} className="group mt-4 rounded-xl border border-line bg-card/45 p-3">
                <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <Paintbrush size={15} className="text-accent" aria-hidden />
                  재질 효과 (그림자 · 외곽선 · 림라이트)
                  <ChevronDown size={14} className="ml-auto text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                  베이스 색과 별개로 셀 셰이딩 스타일을 바꿔보세요. MToon 재질을 쓰는 모델에서만 보여요.
                </p>
                {!hasMToonMaterial ? (
                  <p className="rounded-lg border border-dashed border-line/70 bg-card/40 px-2.5 py-2 text-[0.68rem] text-fg-3">
                    {vrm ? "이 모델은 MToon 재질이 아니라 재질 효과를 지원하지 않아요." : "모델을 먼저 불러오세요."}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {[
                      { key: "shadeColor" as const, label: "그림자 색" },
                      { key: "outlineColor" as const, label: "외곽선 색" },
                      { key: "rimColor" as const, label: "림 라이트 색" },
                      { key: "emissiveColor" as const, label: "발광 색" },
                    ].map((row) => (
                      <div key={row.key} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-[0.65rem] font-semibold text-fg-2">{row.label}</span>
                        <input
                          type="color"
                          value={materialFx[row.key] ?? "#ffffff"}
                          disabled={!vrm}
                          aria-label={row.label}
                          onChange={(e) => {
                            const hex = e.target.value;
                            setMaterialFx((prev) => ({ ...prev, [row.key]: hex }));
                          }}
                          className="size-6 cursor-pointer rounded border border-line bg-transparent p-0"
                        />
                        <button
                          type="button"
                          disabled={!vrm || !materialFx[row.key]}
                          onClick={() => setMaterialFx((prev) => ({ ...prev, [row.key]: null }))}
                          className="rounded border border-line bg-card px-2 py-0.5 text-[0.64rem] text-fg-2 hover:bg-raised disabled:opacity-40"
                        >
                          끄기
                        </button>
                      </div>
                    ))}
                    <label className="flex items-center gap-2 text-[0.65rem] text-fg-3">
                      <span className="w-16 shrink-0 font-semibold text-fg-2">림 강도</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={materialFx.rimIntensity}
                        disabled={!vrm || !materialFx.rimColor}
                        onChange={(e) => setMaterialFx((prev) => ({ ...prev, rimIntensity: Number(e.target.value) }))}
                        className="h-2 flex-1 accent-accent"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-[0.65rem] text-fg-3">
                      <span className="w-16 shrink-0 font-semibold text-fg-2">발광 강도</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={materialFx.emissiveIntensity}
                        disabled={!vrm || !materialFx.emissiveColor}
                        onChange={(e) => setMaterialFx((prev) => ({ ...prev, emissiveIntensity: Number(e.target.value) }))}
                        className="h-2 flex-1 accent-accent"
                      />
                    </label>
                  </div>
                )}
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg border border-line bg-card py-1.5 text-xs text-fg hover:bg-raised disabled:opacity-45"
                  disabled={!vrm}
                  onClick={() => {
                    setMaterialFx(DEFAULT_VRM_MATERIAL_FX);
                    if (vrmRef.current) applyVrmMaterialFx(vrmRef.current, DEFAULT_VRM_MATERIAL_FX);
                  }}
                >
                  재질 효과 초기화
                </button>
              </details>

              {/* ── 흔들림 물리(스프링본) ──────────────────────────────── */}
              <details hidden={hideOnTab("scene")} className="group mt-4 rounded-xl border border-line bg-card/45 p-3">
                <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <WandSparkles size={15} className="text-accent" aria-hidden />
                  흔들림 물리 (머리카락·치마)
                  <ChevronDown size={14} className="ml-auto text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                {springJointCount === 0 ? (
                  <p className="rounded-lg border border-dashed border-line/70 bg-card/40 px-2.5 py-2 text-[0.68rem] text-fg-3">
                    {vrm ? "이 모델에는 흔들림 뼈 정보가 없어요." : "모델을 먼저 불러오세요."}
                  </p>
                ) : (
                  <>
                    <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
                      흔들림 뼈 {springJointCount}개. 강도·중력·바람을 조절하면 정착된 정지 컷에 반영됩니다.
                    </p>
                    <div className="space-y-2.5">
                      <label className="block text-[0.68rem] text-fg-2">
                        <span className="flex justify-between"><span>흔들림 강도(탄성)</span><span>{vrmPhysics.stiffnessScale.toFixed(2)}</span></span>
                        <input
                          type="range" min="0" max="2" step="0.05"
                          aria-label="흔들림 강도(탄성)"
                          className="w-full accent-accent h-2"
                          value={vrmPhysics.stiffnessScale}
                          onChange={(e) => updatePhysics({ stiffnessScale: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-[0.68rem] text-fg-2">
                        <span className="flex justify-between"><span>중력</span><span>{vrmPhysics.gravityScale.toFixed(2)}</span></span>
                        <input
                          type="range" min="0" max="2" step="0.05"
                          aria-label="중력"
                          className="w-full accent-accent h-2"
                          value={vrmPhysics.gravityScale}
                          onChange={(e) => updatePhysics({ gravityScale: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-[0.68rem] text-fg-2">
                        <span className="flex justify-between"><span>바람 방향</span><span>{Math.round(vrmPhysics.windDirectionDeg)}°</span></span>
                        <input
                          type="range" min="-180" max="180"
                          aria-label="바람 방향"
                          className="w-full accent-accent h-2"
                          value={vrmPhysics.windDirectionDeg}
                          onChange={(e) => updatePhysics({ windDirectionDeg: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-[0.68rem] text-fg-2">
                        <span className="flex justify-between"><span>바람 세기</span><span>{vrmPhysics.windStrength.toFixed(2)}</span></span>
                        <input
                          type="range" min="0" max="2" step="0.05"
                          aria-label="바람 세기"
                          className="w-full accent-accent h-2"
                          value={vrmPhysics.windStrength}
                          onChange={(e) => updatePhysics({ windStrength: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        className={cx(
                          CONTROL_BUTTON,
                          "flex-1",
                          physicsPreview
                            ? "border-accent/55 bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                        onClick={() => setPhysicsPreview((p) => !p)}
                      >
                        {physicsPreview ? "미리보기 끄기" : "흔들림 미리보기"}
                      </button>
                      <button
                        type="button"
                        className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
                        onClick={resettlePhysics}
                      >
                        정착 다시
                      </button>
                    </div>
                    <button
                      type="button"
                      className="mt-2 w-full rounded-lg border border-line bg-card py-1.5 text-xs text-fg hover:bg-raised"
                      onClick={resetPhysics}
                    >
                      물리 초기화
                    </button>
                  </>
                )}
              </details>

              {/* ── 웹캠 실시간 페이스 트래킹 ───────────────────────────── */}
              <details hidden={hideOnTab("face")} className="group mt-4 rounded-xl border border-line bg-card/45 p-3">
                <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <Webcam size={15} className="text-accent" aria-hidden />
                  웹캠 실시간 페이스 트래킹
                  <ChevronDown size={14} className="ml-auto text-fg-3 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                {!vrm ? (
                  <p className="rounded-lg border border-dashed border-line/70 bg-card/40 px-2.5 py-2 text-[0.68rem] text-fg-3">
                    모델을 먼저 불러오세요.
                  </p>
                ) : (
                  <>
                    <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
                      내 행동이나 표정을 실시간으로 따라하게 만듭니다. 포즈 캡처를 클릭하면 현재 표정과 머리 각도가 저장됩니다.
                    </p>

                    {webcamActive && (
                      <div className="relative mx-auto mb-3 aspect-video max-h-[28dvh] w-full max-w-[min(100%,16rem)] overflow-hidden rounded-lg border border-line bg-black sm:max-h-none sm:max-w-none">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className={cx(
                            "h-full w-full object-cover",
                            trackingOptions.mirrorMode ? "scale-x-[-1]" : ""
                          )}
                        />
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[0.66rem] font-bold text-white">
                          <span
                            className={cx(
                              "size-1.5 rounded-full",
                              faceDetected ? "bg-green-500 animate-pulse" : "bg-red-500"
                            )}
                          />
                          {faceDetected ? "얼굴 감지됨" : "얼굴 감지 중..."}
                        </div>
                        {faceLostLong && (
                          <div
                            className="absolute inset-x-2 bottom-2 rounded bg-black/70 px-2 py-1 text-center text-[0.66rem] font-semibold text-amber-300"
                            role="status"
                          >
                            얼굴이 보이지 않아요 — 카메라 정면에 위치해 주세요
                          </div>
                        )}
                        {calibrating && (
                          <div
                            className="absolute inset-0 grid place-items-center bg-black/45 px-3 text-center"
                            role="status"
                            aria-live="polite"
                          >
                            <p className="text-[0.72rem] font-bold leading-relaxed text-white">
                              {calibrationCountdown > 0
                                ? `정면을 보고 무표정을 유지하세요… ${calibrationCountdown}`
                                : `측정 중… ${Math.round(calibrationProgress * 100)}%`}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {webcamLoading && (
                      <div className="flex items-center justify-center gap-2 rounded-lg border border-line bg-card/50 py-4 text-xs text-fg-2">
                        <Loader2 className="animate-spin text-accent" size={16} />
                        AI 트래킹 모델 및 카메라 로딩 중...
                      </div>
                    )}

                    {/* 선제적 권한 상태 경고 배너 */}
                    {!webcamActive && !webcamError && typeof window !== "undefined" && (
                      <>
                        {!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" && (
                          <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-500 mb-3 leading-relaxed">
                            <AlertTriangle className="shrink-0 mt-0.5" size={14} />
                            <div>
                              <p className="font-semibold mb-1 text-[0.72rem]">⚠️ 비보안 환경 접속 (카메라 비활성화)</p>
                              <p className="text-[0.65rem] opacity-90 text-left">
                                현재 비보안(HTTP) 주소로 접속 중입니다. 브라우저 정책상 웹캠은 HTTPS 또는 localhost 에서만 동작합니다.
                                <br />
                                {window.location.protocol === "https:" ? "" : (
                                  window.location.hostname.includes("vercel") || window.location.hostname.includes("toonspectrum")
                                    ? `현재 URL을 https:// 로 시작하게 변경하거나 ${window.location.origin.replace("http:", "https:")}${window.location.pathname} 로 접속하세요.`
                                    : `로컬 개발 시 http://localhost:5173 (또는 현재 dev 서버)로 직접 접속. 운영 환경은 HTTPS(${window.location.hostname.includes(".") ? "현재 도메인" : "https://www.toonstudio.cloud/studio"})로 접속하세요.`
                                )}
                              </p>
                            </div>
                          </div>
                        )}
                        {window.isSecureContext && browserPermissionState === "denied" && (
                          <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-500 mb-3 leading-relaxed">
                            <AlertTriangle className="shrink-0 mt-0.5" size={14} />
                            <div className="flex-1">
                              <p className="font-semibold mb-1 text-[0.72rem]">⚠️ 카메라 권한 차단됨 (팝업이 뜨지 않음)</p>
                              <p className="text-[0.65rem] opacity-90 text-left mb-1.5">
                                브라우저 UI에서는 허용한 것처럼 보이지만, 여전히 즉시 차단됩니다. (두 단계 권한 모두 확인 필요)
                              </p>
                              <ol className="list-decimal pl-4 text-[0.68rem] space-y-0.5 opacity-95">
                                <li>이 사이트 <strong>정확한 주소</strong>(https://www.toonstudio.cloud) 에서 브라우저 '자물쇠' → 카메라 '허용' (localhost와 별개)</li>
                                <li><strong>macOS 시스템:</strong> 시스템 설정 → 개인정보 보호 및 보안 → 카메라 → 브라우저 앱 스위치 <strong>켜기</strong></li>
                                <li>설정 바꾼 후 브라우저 완전 종료 → 재시작 → 이 페이지 F5</li>
                              </ol>
                              <button
                                type="button"
                                className="mt-2 rounded border border-line bg-card px-2.5 py-1 text-[0.65rem] text-fg-2 hover:bg-raised hover:text-fg"
                                onClick={() => handlePanelTabChange("pose")}
                              >
                                웹캠 없이 포즈 프리셋 사용
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {webcamError && (
                      <div className="flex flex-col gap-2 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-500 mb-3 leading-relaxed">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="shrink-0 mt-0.5" size={14} />
                          <div>
                            <p className="font-semibold mb-1 text-[0.72rem]">카메라 권한 및 연결 오류</p>
                            <p className="whitespace-pre-line text-[0.65rem] opacity-90">{webcamError}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 pl-6">
                          <button
                            type="button"
                            className="rounded border border-red-500/40 px-2.5 py-1 text-[0.65rem] hover:bg-red-500/10"
                            onClick={() => {
                              setWebcamError(null);
                              setWebcamActive(true);
                            }}
                          >
                            다시 시도
                          </button>
                          <button
                            type="button"
                            className="rounded border border-red-500/40 px-2.5 py-1 text-[0.65rem] hover:bg-red-500/10"
                            onClick={() => {
                              // Re-check permission state
                              setBrowserPermissionState("prompt");
                              setWebcamError(null);
                            }}
                          >
                            권한 상태 재확인
                          </button>
                          <button
                            type="button"
                            className="rounded border border-line bg-card px-2.5 py-1 text-[0.65rem] text-fg-2 hover:bg-raised hover:text-fg"
                            onClick={() => handlePanelTabChange("pose")}
                          >
                            웹캠 없이 포즈 프리셋 사용
                          </button>
                        </div>
                      </div>
                    )}

                    {showConsent && !webcamActive && (
                      <div className="rounded-lg border border-accent/25 bg-accent-soft/30 p-3 mb-3 text-[0.68rem] leading-relaxed text-fg-2 mt-3">
                        <p className="font-bold mb-1.5 flex items-center gap-1 text-accent">
                          🔒 개인정보 보호 및 카메라 활성화 안내
                        </p>
                        <div className="mb-2.5 text-fg-3 leading-relaxed text-[0.65rem] space-y-1">
                          <p>웹캠 실시간 페이스 트래킹을 이용하려면 카메라 권한 허용이 필요합니다.</p>
                          <p className="text-fg font-semibold mt-1">촬영되는 모든 영상은 외부 서버로 전송되지 않으며,</p>
                          <p>사용자 기기 내부에서 실시간 AI 모델에 의해 로컬로만 분석 처리되어 프라이버시가 안전하게 보호됩니다.</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded bg-accent px-3 py-1.5 text-white font-semibold hover:bg-accent/90 cursor-pointer text-xs"
                            onClick={() => {
                              localStorage.setItem("studio_webcam_consent", "true");
                              setShowConsent(false);
                              setWebcamActive(true);
                            }}
                          >
                            동의하고 카메라 켜기
                          </button>
                          <button
                            type="button"
                            className="rounded border border-line bg-card px-3 py-1.5 text-fg-2 hover:bg-raised cursor-pointer text-xs"
                            onClick={() => setShowConsent(false)}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    )}

                    {!webcamLoading && !showConsent && (
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={cx(
                              CONTROL_BUTTON,
                              "flex-1",
                              webcamActive
                                ? "border-red-500/35 bg-red-500/10 text-red-500 hover:bg-red-500/15"
                                : "border-accent/55 bg-accent-soft text-accent hover:bg-accent-soft/80"
                            )}
                            onClick={() => {
                              if (webcamActive) {
                                setWebcamActive(false);
                              } else {
                                setWebcamError(null);
                                const consented = localStorage.getItem("studio_webcam_consent") === "true";
                                if (consented) {
                                  setWebcamActive(true);
                                } else {
                                  setShowConsent(true);
                                }
                              }
                            }}
                          >
                            {webcamActive ? "트래킹 중지" : "트래킹 시작"}
                          </button>

                          {webcamActive && (
                            <button
                              type="button"
                              className={cx(
                                CONTROL_BUTTON,
                                "flex-1 border-accent/50 bg-accent text-on-accent hover:bg-accent/90"
                              )}
                              onClick={handleCapturePose}
                              disabled={!faceDetected}
                            >
                              포즈 · 표정 캡처
                            </button>
                          )}
                        </div>

                        {webcamActive && (
                          <div className="mt-2.5 space-y-2.5 rounded-lg border border-line/60 bg-card/20 p-2">
                            <label className="flex cursor-pointer items-center justify-between text-[0.6875rem] text-fg-2">
                              <span>거울 모드 (좌우 반전)</span>
                              <input
                                type="checkbox"
                                className="accent-accent"
                                checked={trackingOptions.mirrorMode}
                                onChange={(e) =>
                                  setTrackingOptions((prev: TrackingOptions) => ({ ...prev, mirrorMode: e.target.checked }))
                                }
                              />
                            </label>
                            <label className="flex cursor-pointer items-center justify-between text-[0.6875rem] text-fg-2">
                              <span>시선 고정 (정면 바라보기)</span>
                              <input
                                type="checkbox"
                                className="accent-accent"
                                checked={trackingOptions.gazeLock}
                                onChange={(e) =>
                                  setTrackingOptions((prev: TrackingOptions) => ({ ...prev, gazeLock: e.target.checked }))
                                }
                              />
                            </label>
                            <label className="flex cursor-pointer items-center justify-between text-[0.6875rem] text-fg-2">
                              <span>손가락 추적 (재시작 시 적용)</span>
                              <input
                                type="checkbox"
                                className="accent-accent"
                                checked={trackingOptions.fingerTracking}
                                onChange={(e) =>
                                  setTrackingOptions((prev: TrackingOptions) => ({ ...prev, fingerTracking: e.target.checked }))
                                }
                              />
                            </label>
                            <div className="block text-[0.68rem] text-fg-2">
                              <label htmlFor="tracking-sensitivity" className="flex justify-between mb-1">
                                <span>트래킹 감도</span>
                                <span>{trackingOptions.sensitivity.toFixed(1)}x</span>
                              </label>
                              <input
                                id="tracking-sensitivity"
                                type="range"
                                min="0.5"
                                max="2"
                                step="0.1"
                                className="w-full accent-accent h-2"
                                value={trackingOptions.sensitivity}
                                onChange={(e) =>
                                  setTrackingOptions((prev: TrackingOptions) => ({ ...prev, sensitivity: Number(e.target.value) }))
                                }
                              />
                            </div>
                            <div className="block text-[0.68rem] text-fg-2 mt-2">
                              <label htmlFor="tracking-smoothing" className="flex justify-between mb-1">
                                <span>트래킹 부드러움</span>
                                <span>{Math.round((1 - trackingOptions.smoothing) * 100)}%</span>
                              </label>
                              <input
                                id="tracking-smoothing"
                                type="range"
                                min="0.05"
                                max="1.0"
                                step="0.05"
                                className="w-full accent-accent h-2"
                                value={trackingOptions.smoothing}
                                onChange={(e) =>
                                  setTrackingOptions((prev: TrackingOptions) => ({ ...prev, smoothing: Number(e.target.value) }))
                                }
                              />
                            </div>
                            <div className="space-y-1.5 border-t border-line/60 pt-2.5 text-[0.68rem] text-fg-2">
                              <div className="flex items-center justify-between">
                                <span>정면 캘리브레이션{calibrated && !calibrating ? " · 적용됨" : ""}</span>
                                {calibrated && !calibrating && (
                                  <button
                                    type="button"
                                    className="rounded border border-line px-2 py-0.5 text-[0.66rem] text-fg-3 hover:bg-raised hover:text-fg"
                                    onClick={handleClearCalibration}
                                  >
                                    초기화
                                  </button>
                                )}
                              </div>
                              {calibrating ? (
                                <p className="rounded bg-accent-soft/40 px-2 py-1.5 font-semibold text-accent" role="status">
                                  {calibrationCountdown > 0
                                    ? `정면을 보고 무표정을 유지하세요… ${calibrationCountdown}`
                                    : `측정 중… ${Math.round(calibrationProgress * 100)}%`}
                                </p>
                              ) : (
                                <button
                                  type="button"
                                  className={cx(CONTROL_BUTTON, "w-full border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
                                  onClick={handleStartCalibration}
                                  disabled={!faceDetected}
                                >
                                  {calibrated ? "다시 캘리브레이션" : "정면 캘리브레이션"}
                                </button>
                              )}
                              <p className="text-[0.64rem] leading-relaxed text-fg-3">
                                정면·무표정 기준으로 머리 각도와 시선, 눈 크기를 보정합니다. 비스듬히 앉아도 정면 응시가 유지됩니다.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </details>

              <details hidden={hideOnTab("props")} className="group mt-3 rounded-xl border border-line bg-card/35">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  주변 장면 오브젝트
                  {activeProps.length > 0 && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.62rem] text-accent">{activeProps.length}</span>}
                  <ChevronDown size={14} className="ml-auto text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                </summary>
                <div className="border-t border-line/40 px-3 pb-3 pt-2.5">
                  <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                    동물·효과·장면 장식을 월드에 놓거나 본에 연결합니다. 손에 쥐는 소품은 위의 스마트 그립을 사용하세요.
                  </p>
                {(["animal", "item", "effect"] as const).map((cat) => {
                  const items = SCENE_PROPS.filter((p) => p.category === cat && !(cat === "item" && propDefById(p.id)));
                  if (items.length === 0) return null;
                  return (
                    <div key={cat} className="mb-3">
                      <p className="mb-1.5 text-[0.65rem] font-bold text-fg-2">{PROP_CATEGORY_LABELS[cat]}</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {items.map((prop) => {
                          const isActive = activeProps.includes(prop.id);
                          const isSelected = selectedPropId === prop.id;
                          return (
                            <button
                              key={prop.id}
                              type="button"
                              aria-pressed={isActive}
                              aria-label={`${prop.label}${isActive ? " 편집" : " 추가"}`}
                              className={cx(
                                "flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors relative",
                                isActive
                                  ? isSelected
                                    ? "border-accent bg-accent text-on-accent ring-2 ring-accent/40"
                                    : "border-accent/60 bg-accent-soft text-accent ring-1 ring-accent/30"
                                  : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                              )}
                              onClick={() => {
                                setActiveProps((prev) => prev.includes(prop.id) ? prev : [...prev, prop.id]);
                                setSelectedPropId(prop.id);
                              }}
                            >
                              <span className="text-base leading-none" aria-hidden>{prop.emoji}</span>
                              <span className="text-[0.68rem] font-semibold leading-tight">{prop.label}</span>
                              {isActive && (
                                <span 
                                  className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent"
                                  aria-hidden
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {activeProps.length > 0 && (
                  <button
                    type="button"
                    className="mt-1 w-full rounded-lg border border-line bg-card py-1.5 text-xs text-fg hover:bg-raised"
                    onClick={() => {
                      setActiveProps([]);
                      setSelectedPropId(null);
                    }}
                  >
                    주변 오브젝트 모두 제거
                  </button>
                )}

                {selectedPropId && activeProps.includes(selectedPropId) && (() => {
                  const prop = SCENE_PROPS.find((p) => p.id === selectedPropId);
                  if (!prop) return null;
                  const config = propAttachments[selectedPropId] || {
                    bone: "none",
                    offsetX: 0,
                    offsetY: 0,
                    offsetZ: 0,
                    rotX: 0,
                    rotY: 0,
                    rotZ: 0,
                    scale: 1,
                  };

                  const handleConfigChange = (patch: Partial<PropAttachmentConfig>) => {
                    setPropAttachments((prev) => ({
                      ...prev,
                      [selectedPropId]: { ...config, ...patch },
                    }));
                  };

                  return (
                    <div className="mt-3 space-y-3 rounded-xl border border-accent/40 bg-accent-soft/20 p-3 animate-fade-in motion-reduce:animate-none">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-xs font-bold text-accent">
                          <span aria-hidden>{prop.emoji}</span>
                          <span>{prop.label} 장착 및 위치 설정</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="min-h-9 rounded px-2 text-[0.68rem] text-bad hover:bg-bad/10 pointer-coarse:min-h-11"
                            onClick={() => {
                              setActiveProps((prev) => prev.filter((id) => id !== selectedPropId));
                              setSelectedPropId(null);
                            }}
                          >
                            제거
                          </button>
                          <button
                            type="button"
                            className="min-h-9 rounded px-2 text-[0.68rem] text-fg-3 hover:bg-raised pointer-coarse:min-h-11"
                            onClick={() => setSelectedPropId(null)}
                          >
                            닫기
                          </button>
                        </div>
                      </div>

                      <div>
                        <label htmlFor={`prop-attach-bone-${selectedPropId}`} className="block text-[0.68rem] font-semibold text-fg-2 mb-1">장착 부위 (Bone)</label>
                        <select
                          id={`prop-attach-bone-${selectedPropId}`}
                          className="w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          value={config.bone}
                          onChange={(e) => {
                            const nextBone = e.target.value as VRMHumanBoneName | "none";
                            const defaultVals = nextBone !== "none" ? DEFAULT_BONE_OFFSETS[selectedPropId]?.[nextBone] || {} : {};
                            handleConfigChange({
                              bone: nextBone,
                              offsetX: defaultVals.offsetX ?? 0,
                              offsetY: defaultVals.offsetY ?? 0,
                              offsetZ: defaultVals.offsetZ ?? 0,
                              rotX: defaultVals.rotX ?? 0,
                              rotY: defaultVals.rotY ?? 0,
                              rotZ: defaultVals.rotZ ?? 0,
                              scale: defaultVals.scale ?? 1.0,
                            });
                          }}
                        >
                          <option value="none">없음 (3D 월드 좌표 배치)</option>
                          <option value="head">머리 (Head)</option>
                          <option value="chest">가슴 (Chest)</option>
                          <option value="rightHand">오른손 (Right Hand)</option>
                          <option value="leftHand">왼손 (Left Hand)</option>
                          <option value="hips">골반 (Hips)</option>
                        </select>
                      </div>

                      {(
                        <div className="space-y-2.5">
                          <div className="border-t border-line/40 pt-2.5">
                            <p className="text-[0.68rem] font-semibold text-fg-3 mb-1.5">위치 미세조정 (X / Y / Z)</p>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="block text-[0.68rem] text-fg-3">
                                X: {(config.offsetX || 0).toFixed(2)}
                                <input
                                  type="range"
                                  min="-0.5"
                                  max="0.5"
                                  step="0.01"
                                  className="w-full accent-accent h-2"
                                  value={config.offsetX}
                                  onChange={(e) => handleConfigChange({ offsetX: Number(e.target.value) })}
                                />
                              </label>
                              <label className="block text-[0.68rem] text-fg-3">
                                Y: {(config.offsetY || 0).toFixed(2)}
                                <input
                                  type="range"
                                  min="-0.5"
                                  max="0.5"
                                  step="0.01"
                                  className="w-full accent-accent h-2"
                                  value={config.offsetY}
                                  onChange={(e) => handleConfigChange({ offsetY: Number(e.target.value) })}
                                />
                              </label>
                              <label className="block text-[0.68rem] text-fg-3">
                                Z: {(config.offsetZ || 0).toFixed(2)}
                                <input
                                  type="range"
                                  min="-0.5"
                                  max="0.5"
                                  step="0.01"
                                  className="w-full accent-accent h-2"
                                  value={config.offsetZ}
                                  onChange={(e) => handleConfigChange({ offsetZ: Number(e.target.value) })}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="border-t border-line/40 pt-2.5">
                            <p className="text-[0.68rem] font-semibold text-fg-3 mb-1.5">회전 조정 (앞/뒤, 뒤틀기, 안/밖)</p>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="block text-[0.68rem] text-fg-3">
                                앞/뒤: {Math.round(config.rotX)}°
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  className="w-full accent-accent h-2"
                                  value={config.rotX}
                                  onChange={(e) => handleConfigChange({ rotX: Number(e.target.value) })}
                                />
                              </label>
                              <label className="block text-[0.68rem] text-fg-3">
                                뒤틀기: {Math.round(config.rotY)}°
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  className="w-full accent-accent h-2"
                                  value={config.rotY}
                                  onChange={(e) => handleConfigChange({ rotY: Number(e.target.value) })}
                                />
                              </label>
                              <label className="block text-[0.68rem] text-fg-3">
                                안/밖: {Math.round(config.rotZ)}°
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  className="w-full accent-accent h-2"
                                  value={config.rotZ}
                                  onChange={(e) => handleConfigChange({ rotZ: Number(e.target.value) })}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="border-t border-line/40 pt-2.5">
                            <label className="block">
                              <span className="flex items-center justify-between text-[0.65rem] text-fg-3">
                                <span>크기 배율</span>
                                <span>{config.scale.toFixed(1)}x</span>
                              </span>
                              <input
                                type="range"
                                min="0.2"
                                max="2.5"
                                step="0.1"
                                aria-label="크기 배율"
                                className="w-full accent-accent h-1 mt-1"
                                value={config.scale}
                                onChange={(e) => handleConfigChange({ scale: Number(e.target.value) })}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                </div>
              </details>
            </div>

            <footer className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-2 border-t border-line bg-panel/95 px-4 py-3 backdrop-blur sm:px-5">
              <button
                type="button"
                className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45")}
                disabled={isCapturing}
                onClick={() => {
                  cancelActiveTexturePaintStroke();
                  cancelPendingPoseShare();
                  onClose();
                }}
              >
                닫기
              </button>
              <button
                type="button"
                className={cx(CONTROL_BUTTON, "min-w-36 border-accent/60 bg-accent text-on-accent hover:bg-accent/90")}
                disabled={!vrm || status === "loading" || isCapturing || isSharingPose || isThumbnailCapturing || persistentIkReconciling || texturePaintStrokeActive}
                onClick={handleInsert}
              >
                {isCapturing ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                이 포즈로 추가
              </button>
            </footer>
          </aside>
        </div>
      </div>
    </div>,
    document.body
  );
}
