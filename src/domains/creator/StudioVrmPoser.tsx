import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { Canvas, useFrame, useThree, createPortal } from "@react-three/fiber";
import { AlertTriangle, Camera, Clapperboard, ExternalLink, FlipHorizontal2, ImagePlus, Loader2, Maximize2, Paintbrush, PersonStanding, Redo2, RotateCcw, RotateCw, Search, Shirt, Sliders, Smile, Sparkles, Swords, Trash2, Undo2, Upload, UserRound, WandSparkles, X, Webcam, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import * as THREE from "three";

import { EXPRESSION_PRESETS, EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES, pickNaturalIdlePose, POSER_FINGER_BONES, type StudioExpressionPreset } from "./studio-pose-presets";
import { BlinkStabilizer } from "./studio-vrm-blink-stabilizer";
import { HEAD_BONE_SMOOTHER, VrmBoneSmoother } from "./studio-vrm-bone-smoother";
import {
  classifyMeshName,
  COSTUME_SLOT_LABELS,
  COSTUME_PALETTES,
  tintColor,
  serializeCostume,
  type CostumeState,
  type CostumeSlot,
} from "./studio-vrm-costume";
import { avatarSideForHand, solveHandToFingerBones } from "./studio-vrm-hand-solver";
import {
  parseVrmPhysicsSettings,
  DEFAULT_VRM_PHYSICS,
  applyVrmSpringBonePhysics,
  settleVrmPhysics,
  countSpringBoneJoints,
  PHYSICS_PREVIEW_MAX_DELTA,
  type VrmPhysicsSettings,
} from "./studio-vrm-physics";
import {
  applyExpressionWeightsToVrm,
  applyPoseToVrm,
  applyVrmCustomColors,
  d,
  getPoseBoneRotation,
  POSE_PRESETS,
  ZERO_ROTATION,
  computeLightingUniforms,
  serializeFullVrmState,
  applyFullState,
  stripFingerBones,
  applyPoserVisualState,
  planFullStateRestore,
  createFullStateLoadHandlers,
  type PoseBone,
  type PoseBoneMap,
  type PosePreset,
  type Vec3,
  type FingerRotationMap,
  type BodyScale,
  type LightingParams,
  type EnvVariant,
  type FullVrmState,
} from "./studio-vrm-poser-utils";
import {
  PROP_ATTACH_BONES,
  PROP_BONE_LABELS,
  PROP_CATEGORY_LABELS as VRM_PROP_CATEGORY_LABELS,
  propsByCategory,
  createPropInstance,
  serializeVrmProps,
  buildPropObject,
  propDefById,
  type PropInstance,
  type PropAttachBone,
  type PropCategory,
} from "./studio-vrm-props";
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
  WARDROBE_SLOTS,
  WARDROBE_SLOT_LABELS,
  WARDROBE_SETS,
  WARDROBE_FIT_MIN,
  WARDROBE_FIT_MAX,
  WARDROBE_HIDE_COSTUME_SLOTS,
  wardrobeItemsBySlot,
  wardrobeItemById,
  wardrobeSetById,
  applyWardrobeSet,
  createWardrobeEquip,
  buildGarmentParts,
  parseWardrobe,
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
import {
  deleteStoredVrmModel,
  getStoredVrmModel,
  isUsableVrmAssetResponse,
  listVrmLibraryEntries,
  SAMPLE_VRM_ID,
  SAMPLE_VRM_ENTRIES,
  sampleVrmUrl,
  saveUploadedVrm,
  saveVrmThumbnail,
  type VrmLibraryEntry,
} from "./vrm-library";

import type { FaceLandmarker, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

// 채널별 자산 오리진 해소(토스 교차 출처 WebView 에서 root-relative /vrm/.. 절대화, 웹은 무변경).
import { resolveAssetUrl } from "@/src/catalog-static";
import {
  publishAsset,
  listSharedAssets,
  deleteSharedAsset,
  type SharedAsset,
} from "@/src/infrastructure/creator-client";

type StudioVrmPoserProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (pngDataUrl: string, width: number, height: number) => void;
  initialDataUrl?: string;
};

type LoadStatus = "empty" | "loading" | "ready" | "error";
type LibraryStatus = "loading" | "ready" | "error";
type CaptureState = {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
};

type CustomPose = {
  id: string;
  label: string;
  yOffset: number;
  bones: PoseBoneMap;
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

const BASE_ROTATION_Y_KEY = "studioVrmBaseRotationY";
const EXPORT_HEIGHT = 520;
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
const HTML_FALLBACK_VRM_ERROR = "VRM 파일 대신 웹 페이지가 응답했습니다. 배포에 해당 .vrm 파일이 포함되어 있는지 확인해 주세요.";

const CONTROL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const VIEWPORT_BTN =
  "grid size-9 place-items-center rounded-lg border border-line/70 bg-panel/80 text-fg-2 shadow-sm backdrop-blur transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// 우측 컨트롤 패널 탭 — 16개 섹션을 작업 흐름별로 묶어 탐색 부담을 줄인다.
type PanelTab = "character" | "pose" | "face" | "scene" | "props";
const PANEL_TABS: Array<{ id: PanelTab; label: string; icon: typeof UserRound; hint: string }> = [
  { id: "character", label: "캐릭터", icon: UserRound, hint: "모델 · 의상 · 색상" },
  { id: "pose", label: "포즈", icon: PersonStanding, hint: "프리셋 · 관절 · 대기" },
  { id: "face", label: "표정", icon: Smile, hint: "표정 · 블렌드 · 웹캠" },
  { id: "scene", label: "연출", icon: Clapperboard, hint: "카메라 · 조명 · 물리" },
  { id: "props", label: "소품", icon: Swords, hint: "부착 · 배치" },
];

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
];

const BONE_LABELS: Record<string, string> = {
  head: "머리 (Head)",
  neck: "목 (Neck)",
  spine: "척추 (Spine)",
  chest: "가슴 (Chest)",
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
  { id: "torso", label: "몸통/상체", bones: ["spine", "chest"] },
  { id: "rightArm", label: "오른팔", bones: ["rightUpperArm", "rightLowerArm", "rightHand"] },
  { id: "leftArm", label: "왼팔", bones: ["leftUpperArm", "leftLowerArm", "leftHand"] },
  { id: "rightLeg", label: "오른다리", bones: ["rightUpperLeg", "rightLowerLeg", "rightFoot"] },
  { id: "leftLeg", label: "왼다리", bones: ["leftUpperLeg", "leftLowerLeg", "leftFoot"] },
  { id: "leftFingers", label: "왼손가락", bones: POSER_FINGER_BONES.filter((b) => b.startsWith("left")) as VRMHumanBoneName[] },
  { id: "rightFingers", label: "오른손가락", bones: POSER_FINGER_BONES.filter((b) => b.startsWith("right")) as VRMHumanBoneName[] },
];

type ScenePropDef = {
  id: string;
  label: string;
  emoji: string;
  category: "animal" | "item" | "effect";
  position: Vec3;
  scale: number;
};

const SCENE_PROPS: ScenePropDef[] = [
  { id: "cat", label: "고양이", emoji: "🐱", category: "animal", position: [0.5, 0, 0.3], scale: 0.12 },
  { id: "dog", label: "강아지", emoji: "🐕", category: "animal", position: [-0.5, 0, 0.3], scale: 0.13 },
  { id: "bunny", label: "토끼", emoji: "🐰", category: "animal", position: [0.6, 0, -0.2], scale: 0.1 },
  { id: "bird", label: "새", emoji: "🐦", category: "animal", position: [0.35, 1.7, 0.1], scale: 0.08 },
  { id: "fox", label: "여우", emoji: "🦊", category: "animal", position: [-0.55, 0, -0.15], scale: 0.12 },
  { id: "bear", label: "곰", emoji: "🐻", category: "animal", position: [-0.6, 0, 0.4], scale: 0.15 },
  { id: "chick", label: "병아리", emoji: "🐥", category: "animal", position: [0.3, 0, 0.5], scale: 0.07 },
  { id: "fish", label: "물고기", emoji: "🐟", category: "animal", position: [0.5, 1.2, -0.3], scale: 0.08 },
  { id: "sword", label: "검", emoji: "⚔️", category: "item", position: [0.65, 0, 0], scale: 0.14 },
  { id: "shield", label: "방패", emoji: "🛡️", category: "item", position: [-0.65, 0.5, 0], scale: 0.16 },
  { id: "book", label: "책", emoji: "📖", category: "item", position: [0.4, 0.85, 0.3], scale: 0.1 },
  { id: "flower", label: "꽃", emoji: "🌸", category: "item", position: [0.35, 0, 0.45], scale: 0.09 },
  { id: "gem", label: "보석", emoji: "💎", category: "item", position: [0.3, 1.5, 0.2], scale: 0.06 },
  { id: "crystal", label: "수정구", emoji: "🔮", category: "item", position: [-0.35, 0.8, 0.35], scale: 0.1 },
  { id: "cloud", label: "구름", emoji: "☁️", category: "effect", position: [0.5, 2.0, -0.5], scale: 0.2 },
  { id: "star", label: "별", emoji: "🌟", category: "effect", position: [-0.4, 1.8, 0.2], scale: 0.07 },
  /* ── Animals (new) ── */
  { id: "penguin", label: "펭귄", emoji: "🐧", category: "animal", position: [0.55, 0, 0.25], scale: 0.11 },
  { id: "dragon", label: "드래곤", emoji: "🐉", category: "animal", position: [-0.7, 0, -0.3], scale: 0.12 },
  { id: "unicorn", label: "유니콘", emoji: "🦄", category: "animal", position: [0.7, 0, -0.2], scale: 0.13 },
  { id: "owl", label: "부엉이", emoji: "🦉", category: "animal", position: [0.4, 1.6, 0.15], scale: 0.09 },
  { id: "butterfly", label: "나비", emoji: "🦋", category: "animal", position: [0.35, 1.5, 0.4], scale: 0.08 },
  { id: "deer", label: "사슴", emoji: "🦌", category: "animal", position: [-0.65, 0, 0.35], scale: 0.12 },
  { id: "wolf", label: "늑대", emoji: "🐺", category: "animal", position: [0.65, 0, -0.35], scale: 0.12 },
  { id: "turtle", label: "거북이", emoji: "🐢", category: "animal", position: [-0.45, 0, 0.5], scale: 0.1 },
  /* ── Items (new) ── */
  { id: "staff", label: "지팡이", emoji: "🪄", category: "item", position: [0.6, 0, 0.1], scale: 0.13 },
  { id: "bowWeapon", label: "활", emoji: "🏹", category: "item", position: [-0.6, 0.5, 0.1], scale: 0.14 },
  { id: "lantern", label: "랜턴", emoji: "🏮", category: "item", position: [0.4, 0.8, 0.3], scale: 0.1 },
  { id: "crown", label: "왕관", emoji: "👑", category: "item", position: [0.3, 1.7, 0.15], scale: 0.08 },
  { id: "ring", label: "반지", emoji: "💍", category: "item", position: [0.25, 1.2, 0.3], scale: 0.05 },
  { id: "potion", label: "물약", emoji: "🧪", category: "item", position: [0.35, 0.4, 0.4], scale: 0.09 },
  { id: "scroll", label: "두루마리", emoji: "📜", category: "item", position: [-0.4, 0.6, 0.35], scale: 0.1 },
  { id: "guitar", label: "기타", emoji: "🎸", category: "item", position: [-0.55, 0.3, 0.25], scale: 0.12 },
  { id: "umbrella", label: "우산", emoji: "☂️", category: "item", position: [0.45, 0.5, 0.2], scale: 0.14 },
  { id: "hammer", label: "망치", emoji: "🔨", category: "item", position: [0.6, 0.3, -0.1], scale: 0.13 },
  { id: "wand", label: "마법봉", emoji: "✨", category: "item", position: [0.5, 0.9, 0.2], scale: 0.1 },
  { id: "heartProp", label: "하트", emoji: "❤️", category: "item", position: [0.3, 1.4, 0.3], scale: 0.08 },
  { id: "moon", label: "초승달", emoji: "🌙", category: "item", position: [-0.5, 1.9, -0.3], scale: 0.12 },
  { id: "sun", label: "태양", emoji: "☀️", category: "item", position: [0.5, 2.1, -0.4], scale: 0.14 },
  { id: "treasureChest", label: "보물상자", emoji: "🧳", category: "item", position: [-0.5, 0, 0.4], scale: 0.11 },
  { id: "balloon", label: "풍선", emoji: "🎈", category: "item", position: [0.4, 1.8, 0.2], scale: 0.1 },
  { id: "candle", label: "초", emoji: "🕯️", category: "item", position: [0.3, 0.3, 0.45], scale: 0.08 },
  { id: "mask", label: "가면", emoji: "🎭", category: "item", position: [-0.3, 1.3, 0.3], scale: 0.09 },
  /* ── Effects (new) ── */
  { id: "sparkle", label: "반짝이", emoji: "💫", category: "effect", position: [0.3, 1.6, 0.3], scale: 0.1 },
  { id: "fire", label: "불꽃", emoji: "🔥", category: "effect", position: [0.5, 0, 0.3], scale: 0.12 },
  { id: "lightning", label: "번개", emoji: "⚡", category: "effect", position: [-0.3, 1.5, -0.2], scale: 0.12 },
  { id: "snowflake", label: "눈결정", emoji: "❄️", category: "effect", position: [0.4, 1.8, 0.1], scale: 0.08 },
  { id: "rainbow", label: "무지개", emoji: "🌈", category: "effect", position: [0, 2.2, -0.6], scale: 0.15 },
  { id: "bubbles", label: "비눗방울", emoji: "🫧", category: "effect", position: [-0.35, 1.3, 0.35], scale: 0.1 },
  { id: "leaves", label: "나뭇잎", emoji: "🍃", category: "effect", position: [0.4, 1.5, -0.2], scale: 0.1 },
  { id: "feather", label: "깃털", emoji: "🪶", category: "effect", position: [-0.3, 1.6, 0.25], scale: 0.09 },
  // 추가 20종 이상 (장르·웹툰 컷용)
  /* animals extra */
  { id: "hamster", label: "햄스터", emoji: "🐹", category: "animal", position: [0.4, 0.1, 0.4], scale: 0.07 },
  { id: "snake", label: "뱀", emoji: "🐍", category: "animal", position: [-0.5, 0.2, -0.1], scale: 0.09 },
  { id: "frog", label: "개구리", emoji: "🐸", category: "animal", position: [0.55, 0.05, 0.5], scale: 0.08 },
  { id: "panda", label: "판다", emoji: "🐼", category: "animal", position: [-0.6, 0.3, 0.2], scale: 0.14 },
  { id: "lion", label: "사자", emoji: "🦁", category: "animal", position: [0.65, 0.1, -0.3], scale: 0.13 },
  /* items extra */
  { id: "basket", label: "바구니", emoji: "🧺", category: "item", position: [0.5, 0.2, 0.3], scale: 0.12 },
  { id: "letter", label: "편지", emoji: "✉️", category: "item", position: [-0.35, 0.9, 0.4], scale: 0.07 },
  { id: "rose", label: "장미", emoji: "🌹", category: "item", position: [0.25, 0.7, 0.2], scale: 0.1 },
  { id: "dagger", label: "단검", emoji: "🗡️", category: "item", position: [0.6, 0.4, -0.1], scale: 0.1 },
  { id: "mirror", label: "거울", emoji: "🪞", category: "item", position: [-0.5, 1.0, 0.25], scale: 0.11 },
  { id: "clock", label: "시계", emoji: "🕰️", category: "item", position: [0.4, 1.3, 0.1], scale: 0.09 },
  { id: "teacup", label: "찻잔", emoji: "🍵", category: "item", position: [-0.3, 0.5, 0.5], scale: 0.08 },
  { id: "backpack2", label: "큰배낭", emoji: "🎒", category: "item", position: [0.55, 0.6, -0.15], scale: 0.12 },
  { id: "torch", label: "횃불", emoji: "🔥", category: "item", position: [-0.6, 0.7, 0.05], scale: 0.1 },
  { id: "coin", label: "금화", emoji: "🪙", category: "item", position: [0.3, 0.4, 0.6], scale: 0.05 },
  /* effects extra */
  { id: "heartFX", label: "하트 이펙트", emoji: "💕", category: "effect", position: [0.1, 2.0, 0.3], scale: 0.12 },
  { id: "note", label: "음표", emoji: "🎵", category: "effect", position: [-0.2, 1.9, -0.4], scale: 0.1 },
  { id: "magic", label: "마법진", emoji: "✨", category: "effect", position: [0, 0.1, 0.2], scale: 0.15 },
  { id: "smoke", label: "연기", emoji: "💨", category: "effect", position: [0.5, 1.0, -0.5], scale: 0.13 },
  { id: "cherry", label: "벚꽃잎", emoji: "🌸", category: "effect", position: [-0.4, 1.7, 0.2], scale: 0.09 },
];

const PROP_CATEGORY_LABELS: Record<string, string> = { animal: "동물", item: "아이템", effect: "이펙트" };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function findPose(id: string): PosePreset {
  // 기본 프리셋 → 확장 팩 → 자연 아이들(스폰 기본) 순으로 탐색. 셋 다 같은 본 규약을 쓴다.
  return (
    POSE_PRESETS.find((pose) => pose.id === id) ??
    EXTRA_POSE_PRESETS.find((pose) => pose.id === id) ??
    NATURAL_IDLE_POSES.find((pose) => pose.id === id) ??
    POSE_PRESETS[0]
  );
}

function findCameraPreset(id: string) {
  return CAMERA_PRESETS.find((preset) => preset.id === id) ?? CAMERA_PRESETS[0];
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function prepareVrmScene(vrm: VRM) {
  vrm.scene.traverse((object) => {
    object.frustumCulled = false;
    if (isMesh(object)) {
      object.receiveShadow = true;
    }
  });
  vrm.scene.position.set(0, 0, 0);
  vrm.scene.userData[BASE_ROTATION_Y_KEY] = vrm.scene.rotation.y;
}

function disposeVrm(vrm: VRM) {
  vrm.scene.parent?.remove(vrm.scene);
  void import("@pixiv/three-vrm")
    .then(({ VRMUtils }) => {
      VRMUtils.deepDispose(vrm.scene);
    })
    .catch(() => {
      vrm.scene.traverse((object) => {
        if (!isMesh(object)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    });
}

function shouldPreflightVrmUrl(url: string) {
  return typeof fetch === "function" && !url.startsWith("blob:") && !url.startsWith("data:");
}

async function assertLoadableVrmUrl(url: string) {
  if (!shouldPreflightVrmUrl(url)) return;

  const response = await fetch(url, { method: "HEAD", cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`VRM 파일을 찾지 못했습니다. (${response.status})`);
  }
  if (!isUsableVrmAssetResponse(response)) {
    throw new Error(HTML_FALLBACK_VRM_ERROR);
  }
}

async function loadVrmAsset(url: string) {
  // 토스(교차 출처 WebView)에서 root-relative /vrm/.. 를 배포 오리진으로 절대화한다(웹은 무변경).
  // HEAD 프리플라이트와 실제 GLTFLoader 로드가 같은 절대 URL 을 쓰도록 한 번만 해석한다.
  const resolvedUrl = resolveAssetUrl(url);
  await assertLoadableVrmUrl(resolvedUrl);

  const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("@pixiv/three-vrm"),
  ]);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return loader.loadAsync(resolvedUrl).then((gltf) => {
    VRMUtils.combineSkeletons?.(gltf.scene);

    const loadedVrm = gltf.userData.vrm as VRM | undefined;
    if (!loadedVrm) {
      VRMUtils.deepDispose(gltf.scene);
      throw new Error("VRM 데이터를 찾지 못했습니다.");
    }

    if (loadedVrm.meta.metaVersion === "0") {
      VRMUtils.rotateVRM0(loadedVrm);
    }

    prepareVrmScene(loadedVrm);
    return loadedVrm;
  });
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
const costumeBaseColorCache = new WeakMap<THREE.Material, string>();

function materialBaseHex(mat: THREE.Material): string {
  const cached = costumeBaseColorCache.get(mat);
  if (cached) return cached;
  const color = (mat as unknown as { color?: THREE.Color }).color;
  const hex = color ? `#${color.getHexString()}` : "#cccccc";
  costumeBaseColorCache.set(mat, hex);
  return hex;
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
    const cls = classifyMeshName(mesh.name, ...matNames);
    if (cls.slot === null || cls.protected !== null) return;
    const key = mesh.name || matNames[0] || `mesh-${entries.length}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    // 원본 색 캡처
    materials.forEach((m) => {
      if (m) materialBaseHex(m as THREE.Material);
    });
    entries.push({ key, label: mesh.name || matNames[0] || "메시", slot: cls.slot, mesh });
  });
  return entries;
}

/** 수집된 의상 메시에 표시/숨김·리컬러 상태를 적용한다. */
function applyCostumeState(entries: CostumeMeshEntry[], state: CostumeState) {
  for (const entry of entries) {
    entry.mesh.visible = !state.hidden.includes(entry.key);
    const target = state.recolor[entry.key];
    const materials = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material];
    materials.forEach((m) => {
      const mat = m as (THREE.Material & { color?: THREE.Color }) | undefined;
      if (!mat || !mat.color) return;
      const base = materialBaseHex(mat);
      const next = target ? tintColor(base, target) : base;
      mat.color.set(next);
      mat.needsUpdate = true;
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

function createCharacterThumbnail(canvas: HTMLCanvasElement) {
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = THUMBNAIL_WIDTH;
  thumbnailCanvas.height = THUMBNAIL_HEIGHT;

  const context = thumbnailCanvas.getContext("2d");
  if (!context || canvas.width <= 0 || canvas.height <= 0) return null;

  const scale = Math.min(THUMBNAIL_WIDTH / canvas.width, THUMBNAIL_HEIGHT / canvas.height);
  const drawWidth = Math.round(canvas.width * scale);
  const drawHeight = Math.round(canvas.height * scale);
  const drawX = Math.round((THUMBNAIL_WIDTH - drawWidth) / 2);
  const drawY = Math.round((THUMBNAIL_HEIGHT - drawHeight) / 2);

  context.clearRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  context.drawImage(canvas, drawX, drawY, drawWidth, drawHeight);
  return thumbnailCanvas.toDataURL("image/png");
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

type ViewportApi = { zoomBy: (factor: number) => void };

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
    applyCameraPreset(camera, preset, invalidate);
    // 사용자가 궤도를 돌린 뒤에도 시점 초기화가 프리셋 타깃으로 정확히 복귀하도록 동기화.
    if (controls?.target) {
      controls.target.set(preset.target[0], preset.target[1], preset.target[2]);
      controls.update?.();
    }
  }, [camera, invalidate, preset, controls, resetNonce]);

  return null;
}

/* ── 3D Scene Prop Meshes ─────────────────────────────── */

function AnimalCat({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 1.8, 0]}><sphereGeometry args={[1, 16, 16]} /><meshStandardMaterial color="#444" /></mesh>
      <mesh position={[-0.55, 2.7, 0]} rotation={[0, 0, 0.3]}><coneGeometry args={[0.35, 0.7, 4]} /><meshStandardMaterial color="#444" /></mesh>
      <mesh position={[0.55, 2.7, 0]} rotation={[0, 0, -0.3]}><coneGeometry args={[0.35, 0.7, 4]} /><meshStandardMaterial color="#444" /></mesh>
      <mesh position={[0, 0.8, 0]}><capsuleGeometry args={[0.7, 1.4, 8, 16]} /><meshStandardMaterial color="#555" /></mesh>
      <mesh position={[-1.2, 1.3, 0]} rotation={[0, 0, 1.2]}><capsuleGeometry args={[0.15, 1.4, 4, 8]} /><meshStandardMaterial color="#555" /></mesh>
      <mesh position={[0, 1.6, 0.8]}><sphereGeometry args={[0.2, 8, 8]} /><meshStandardMaterial color="#ffaacc" /></mesh>
      <mesh position={[-0.3, 2, 0.85]}><sphereGeometry args={[0.18, 8, 8]} /><meshStandardMaterial color="#aaff88" emissive="#224400" /></mesh>
      <mesh position={[0.3, 2, 0.85]}><sphereGeometry args={[0.18, 8, 8]} /><meshStandardMaterial color="#aaff88" emissive="#224400" /></mesh>
    </group>
  );
}

function AnimalDog({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 1.7, 0]}><sphereGeometry args={[0.9, 16, 16]} /><meshStandardMaterial color="#c49060" /></mesh>
      <mesh position={[-0.6, 2.1, 0.2]} rotation={[0.3, 0, 0.6]}><capsuleGeometry args={[0.25, 0.8, 4, 8]} /><meshStandardMaterial color="#a07040" /></mesh>
      <mesh position={[0.6, 2.1, 0.2]} rotation={[0.3, 0, -0.6]}><capsuleGeometry args={[0.25, 0.8, 4, 8]} /><meshStandardMaterial color="#a07040" /></mesh>
      <mesh position={[0, 0.7, 0]}><capsuleGeometry args={[0.8, 1, 8, 16]} /><meshStandardMaterial color="#d4a060" /></mesh>
      <mesh position={[0, 1.5, 0.75]}><sphereGeometry args={[0.22, 8, 8]} /><meshStandardMaterial color="#222" /></mesh>
      <mesh position={[-0.25, 1.85, 0.75]}><sphereGeometry args={[0.14, 8, 8]} /><meshStandardMaterial color="#222" /></mesh>
      <mesh position={[0.25, 1.85, 0.75]}><sphereGeometry args={[0.14, 8, 8]} /><meshStandardMaterial color="#222" /></mesh>
      <mesh position={[-1.1, 1.8, -0.2]} rotation={[0, 0, 1.5]}><capsuleGeometry args={[0.1, 0.9, 4, 8]} /><meshStandardMaterial color="#c49060" /></mesh>
    </group>
  );
}

function AnimalBunny({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 1.5, 0]}><sphereGeometry args={[0.8, 16, 16]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[-0.25, 2.8, 0]}><capsuleGeometry args={[0.18, 1.2, 4, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.25, 2.8, 0]}><capsuleGeometry args={[0.18, 1.2, 4, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[-0.25, 2.8, 0.05]}><capsuleGeometry args={[0.1, 0.9, 4, 8]} /><meshStandardMaterial color="#ffbbcc" /></mesh>
      <mesh position={[0.25, 2.8, 0.05]}><capsuleGeometry args={[0.1, 0.9, 4, 8]} /><meshStandardMaterial color="#ffbbcc" /></mesh>
      <mesh position={[0, 0.7, 0]}><sphereGeometry args={[0.9, 16, 16]} /><meshStandardMaterial color="#f8f8f8" /></mesh>
      <mesh position={[0, 1.35, 0.65]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#ffaabb" /></mesh>
      <mesh position={[-0.22, 1.65, 0.65]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#ff3366" /></mesh>
      <mesh position={[0.22, 1.65, 0.65]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#ff3366" /></mesh>
      <mesh position={[0, 0.5, -0.8]}><sphereGeometry args={[0.35, 12, 12]} /><meshStandardMaterial color="#fff" /></mesh>
    </group>
  );
}

function AnimalBird({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.8, 16, 16]} /><meshStandardMaterial color="#60a5fa" /></mesh>
      <mesh position={[0, 1.2, 0]}><sphereGeometry args={[0.55, 16, 16]} /><meshStandardMaterial color="#93c5fd" /></mesh>
      <mesh position={[0, 1.1, 0.55]}><coneGeometry args={[0.15, 0.5, 6]} /><meshStandardMaterial color="#fb923c" /></mesh>
      <mesh position={[-0.22, 1.35, 0.4]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.22, 1.35, 0.4]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[-0.7, 0.6, 0]} rotation={[0, 0, 0.6]}><capsuleGeometry args={[0.1, 0.8, 4, 8]} /><meshStandardMaterial color="#2563eb" /></mesh>
      <mesh position={[0.7, 0.6, 0]} rotation={[0, 0, -0.6]}><capsuleGeometry args={[0.1, 0.8, 4, 8]} /><meshStandardMaterial color="#2563eb" /></mesh>
    </group>
  );
}

function AnimalFox({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 1.6, 0]}><sphereGeometry args={[0.85, 16, 16]} /><meshStandardMaterial color="#ea580c" /></mesh>
      <mesh position={[-0.45, 2.5, 0]} rotation={[0, 0, 0.25]}><coneGeometry args={[0.3, 0.7, 4]} /><meshStandardMaterial color="#ea580c" /></mesh>
      <mesh position={[0.45, 2.5, 0]} rotation={[0, 0, -0.25]}><coneGeometry args={[0.3, 0.7, 4]} /><meshStandardMaterial color="#ea580c" /></mesh>
      <mesh position={[0, 0.7, 0]}><capsuleGeometry args={[0.7, 1.2, 8, 16]} /><meshStandardMaterial color="#f97316" /></mesh>
      <mesh position={[0, 1.3, 0.7]}><sphereGeometry args={[0.3, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0, 1.35, 0.85]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[-0.2, 1.7, 0.7]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.2, 1.7, 0.7]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[-1.0, 0.5, -0.2]} rotation={[0.3, 0, 1.0]}><capsuleGeometry args={[0.25, 1.0, 4, 8]} /><meshStandardMaterial color="#fff" /></mesh>
    </group>
  );
}

function AnimalBear({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 1.8, 0]}><sphereGeometry args={[1, 16, 16]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[-0.65, 2.6, 0]}><sphereGeometry args={[0.35, 12, 12]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[0.65, 2.6, 0]}><sphereGeometry args={[0.35, 12, 12]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[-0.65, 2.6, 0.1]}><sphereGeometry args={[0.2, 8, 8]} /><meshStandardMaterial color="#fef08a" /></mesh>
      <mesh position={[0.65, 2.6, 0.1]}><sphereGeometry args={[0.2, 8, 8]} /><meshStandardMaterial color="#fef08a" /></mesh>
      <mesh position={[0, 0.8, 0]}><capsuleGeometry args={[0.9, 1.2, 8, 16]} /><meshStandardMaterial color="#92400e" /></mesh>
      <mesh position={[0, 1.6, 0.85]}><sphereGeometry args={[0.2, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[-0.28, 2, 0.8]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.28, 2, 0.8]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0, 0.5, 0.7]}><sphereGeometry args={[0.45, 12, 12]} /><meshStandardMaterial color="#fef08a" /></mesh>
    </group>
  );
}

function AnimalChick({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.8, 0]}><sphereGeometry args={[0.9, 16, 16]} /><meshStandardMaterial color="#fef08a" /></mesh>
      <mesh position={[0, 1.6, 0]}><sphereGeometry args={[0.6, 16, 16]} /><meshStandardMaterial color="#fde047" /></mesh>
      <mesh position={[0, 1.4, 0.55]}><coneGeometry args={[0.15, 0.35, 6]} /><meshStandardMaterial color="#fb923c" /></mesh>
      <mesh position={[-0.18, 1.7, 0.45]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.18, 1.7, 0.45]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[-0.6, 0.9, 0]} rotation={[0, 0, 0.5]}><capsuleGeometry args={[0.08, 0.5, 4, 8]} /><meshStandardMaterial color="#fde047" /></mesh>
      <mesh position={[0.6, 0.9, 0]} rotation={[0, 0, -0.5]}><capsuleGeometry args={[0.08, 0.5, 4, 8]} /><meshStandardMaterial color="#fde047" /></mesh>
    </group>
  );
}

function AnimalFish({ scale: s }: { scale: number }) {
  return (
    <group scale={s} rotation={[0, 0.4, 0]}>
      <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.7, 16, 12]} /><meshStandardMaterial color="#f97316" transparent opacity={0.9} /></mesh>
      <mesh position={[-0.6, 0.7, 0]} rotation={[0, 0, 0.5]}><coneGeometry args={[0.45, 0.6, 6]} /><meshStandardMaterial color="#ea580c" /></mesh>
      <mesh position={[0.2, 0.55, 0.55]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.5, 0.5, 0]}><coneGeometry args={[0.35, 0.55, 3]} /><meshStandardMaterial color="#fdba74" /></mesh>
    </group>
  );
}

function PropSword({ scale: s }: { scale: number }) {
  return (
    <group scale={s} rotation={[0, 0, 0.15]}>
      <mesh position={[0, 3, 0]}><boxGeometry args={[0.15, 4, 0.06]} /><meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 0.85, 0]}><boxGeometry args={[0.8, 0.15, 0.15]} /><meshStandardMaterial color="#d4af37" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.08, 0.1, 0.8, 8]} /><meshStandardMaterial color="#5c4033" /></mesh>
    </group>
  );
}

function PropShield({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 1.5, 0]}><cylinderGeometry args={[1.2, 1, 0.15, 6]} /><meshStandardMaterial color="#1e3a5f" metalness={0.5} roughness={0.4} /></mesh>
      <mesh position={[0, 1.5, 0.08]}><cylinderGeometry args={[0.4, 0.35, 0.08, 16]} /><meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.3} /></mesh>
    </group>
  );
}

function PropBook({ scale: s }: { scale: number }) {
  return (
    <group scale={s} rotation={[0.2, 0.3, 0]}>
      <mesh position={[0, 0, 0]}><boxGeometry args={[1.6, 2.0, 0.3]} /><meshStandardMaterial color="#7c2d12" /></mesh>
      <mesh position={[0, 0, 0.16]}><boxGeometry args={[1.4, 1.8, 0.02]} /><meshStandardMaterial color="#fef3c7" /></mesh>
      <mesh position={[-0.8, 0, 0]}><boxGeometry args={[0.06, 2.0, 0.34]} /><meshStandardMaterial color="#5c2d12" /></mesh>
    </group>
  );
}

function PropFlower({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.06, 0.06, 2.4, 6]} /><meshStandardMaterial color="#22c55e" /></mesh>
      {[0, 72, 144, 216, 288].map((angle) => (
        <mesh key={angle} position={[Math.sin(d(angle)) * 0.35, 2.5 + Math.cos(d(angle)) * 0.1, Math.cos(d(angle)) * 0.35]}>
          <sphereGeometry args={[0.25, 8, 8]} /><meshStandardMaterial color="#f472b6" />
        </mesh>
      ))}
      <mesh position={[0, 2.5, 0]}><sphereGeometry args={[0.2, 8, 8]} /><meshStandardMaterial color="#facc15" /></mesh>
    </group>
  );
}

function PropGem({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.6, 0]} rotation={[0, 0.3, 0]}>
        <octahedronGeometry args={[0.7, 0]} /><meshStandardMaterial color="#8b5cf6" metalness={0.3} roughness={0.1} transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function PropCrystal({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.8, 0]}><sphereGeometry args={[0.9, 24, 24]} /><meshStandardMaterial color="#a78bfa" metalness={0.2} roughness={0.05} transparent opacity={0.6} /></mesh>
      <mesh position={[0, 0.8, 0]}><sphereGeometry args={[0.92, 24, 24]} /><meshStandardMaterial color="#c4b5fd" wireframe /></mesh>
    </group>
  );
}

function PropCloud({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0, 0]}><sphereGeometry args={[0.8, 12, 12]} /><meshStandardMaterial color="#fff" transparent opacity={0.85} /></mesh>
      <mesh position={[0.65, 0.1, 0]}><sphereGeometry args={[0.6, 12, 12]} /><meshStandardMaterial color="#fff" transparent opacity={0.85} /></mesh>
      <mesh position={[-0.65, 0.05, 0]}><sphereGeometry args={[0.65, 12, 12]} /><meshStandardMaterial color="#fff" transparent opacity={0.85} /></mesh>
      <mesh position={[0.3, 0.4, 0]}><sphereGeometry args={[0.55, 12, 12]} /><meshStandardMaterial color="#f8fafc" transparent opacity={0.85} /></mesh>
      <mesh position={[-0.3, 0.35, 0]}><sphereGeometry args={[0.5, 12, 12]} /><meshStandardMaterial color="#f8fafc" transparent opacity={0.85} /></mesh>
    </group>
  );
}

function PropStar({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.15, 5, 1]} /><meshStandardMaterial color="#facc15" emissive="#a16207" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

/* ── NEW Animals ─────────────────────────────── */

function AnimalPenguin({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* body */}
      <mesh position={[0, 0.9, 0]}><capsuleGeometry args={[0.7, 1.0, 8, 16]} /><meshStandardMaterial color="#1e293b" /></mesh>
      {/* belly */}
      <mesh position={[0, 0.85, 0.35]}><capsuleGeometry args={[0.5, 0.7, 8, 16]} /><meshStandardMaterial color="#f1f5f9" /></mesh>
      {/* head */}
      <mesh position={[0, 1.9, 0]}><sphereGeometry args={[0.55, 16, 16]} /><meshStandardMaterial color="#0f172a" /></mesh>
      {/* eyes */}
      <mesh position={[-0.18, 2.0, 0.45]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.18, 2.0, 0.45]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
      {/* beak */}
      <mesh position={[0, 1.8, 0.55]} rotation={[0.3, 0, 0]}><coneGeometry args={[0.12, 0.3, 6]} /><meshStandardMaterial color="#f97316" /></mesh>
      {/* feet */}
      <mesh position={[-0.25, 0.05, 0.15]}><boxGeometry args={[0.25, 0.08, 0.35]} /><meshStandardMaterial color="#f97316" /></mesh>
      <mesh position={[0.25, 0.05, 0.15]}><boxGeometry args={[0.25, 0.08, 0.35]} /><meshStandardMaterial color="#f97316" /></mesh>
      {/* wings */}
      <mesh position={[-0.7, 0.9, 0]} rotation={[0, 0, 0.4]}><capsuleGeometry args={[0.12, 0.7, 4, 8]} /><meshStandardMaterial color="#1e293b" /></mesh>
      <mesh position={[0.7, 0.9, 0]} rotation={[0, 0, -0.4]}><capsuleGeometry args={[0.12, 0.7, 4, 8]} /><meshStandardMaterial color="#1e293b" /></mesh>
    </group>
  );
}

function AnimalDragon({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* body */}
      <mesh position={[0, 1.0, 0]}><capsuleGeometry args={[0.8, 1.2, 8, 16]} /><meshStandardMaterial color="#15803d" /></mesh>
      {/* head */}
      <mesh position={[0, 2.2, 0.2]}><sphereGeometry args={[0.65, 16, 16]} /><meshStandardMaterial color="#166534" /></mesh>
      {/* snout */}
      <mesh position={[0, 2.0, 0.75]} rotation={[0.4, 0, 0]}><coneGeometry args={[0.2, 0.5, 8]} /><meshStandardMaterial color="#14532d" /></mesh>
      {/* horns */}
      <mesh position={[-0.3, 2.8, -0.1]} rotation={[0.3, 0, 0.2]}><coneGeometry args={[0.08, 0.5, 6]} /><meshStandardMaterial color="#7e22ce" /></mesh>
      <mesh position={[0.3, 2.8, -0.1]} rotation={[0.3, 0, -0.2]}><coneGeometry args={[0.08, 0.5, 6]} /><meshStandardMaterial color="#7e22ce" /></mesh>
      {/* eyes */}
      <mesh position={[-0.22, 2.35, 0.55]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#fbbf24" emissive="#92400e" /></mesh>
      <mesh position={[0.22, 2.35, 0.55]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#fbbf24" emissive="#92400e" /></mesh>
      {/* wings */}
      <mesh position={[-0.9, 1.6, -0.3]} rotation={[0, 0, 0.5]}><boxGeometry args={[1.0, 0.6, 0.04]} /><meshStandardMaterial color="#7e22ce" transparent opacity={0.7} /></mesh>
      <mesh position={[0.9, 1.6, -0.3]} rotation={[0, 0, -0.5]}><boxGeometry args={[1.0, 0.6, 0.04]} /><meshStandardMaterial color="#7e22ce" transparent opacity={0.7} /></mesh>
      {/* tail */}
      <mesh position={[0, 0.5, -0.8]} rotation={[0.8, 0, 0]}><capsuleGeometry args={[0.15, 1.2, 4, 8]} /><meshStandardMaterial color="#15803d" /></mesh>
      <mesh position={[0, 0.15, -1.3]} rotation={[1.0, 0, 0]}><coneGeometry args={[0.2, 0.4, 6]} /><meshStandardMaterial color="#7e22ce" /></mesh>
    </group>
  );
}

function AnimalUnicorn({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* body */}
      <mesh position={[0, 1.0, 0]}><capsuleGeometry args={[0.8, 1.4, 8, 16]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      {/* head */}
      <mesh position={[0, 2.2, 0.3]}><sphereGeometry args={[0.6, 16, 16]} /><meshStandardMaterial color="#fff" /></mesh>
      {/* snout */}
      <mesh position={[0, 2.0, 0.85]}><capsuleGeometry args={[0.2, 0.3, 8, 8]} /><meshStandardMaterial color="#fce7f3" /></mesh>
      {/* horn */}
      <mesh position={[0, 2.95, 0.2]} rotation={[0.15, 0, 0]}><coneGeometry args={[0.08, 0.7, 8]} /><meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.2} /></mesh>
      {/* ears */}
      <mesh position={[-0.3, 2.7, 0.1]} rotation={[0, 0, 0.3]}><coneGeometry args={[0.1, 0.35, 4]} /><meshStandardMaterial color="#fff" /></mesh>
      <mesh position={[0.3, 2.7, 0.1]} rotation={[0, 0, -0.3]}><coneGeometry args={[0.1, 0.35, 4]} /><meshStandardMaterial color="#fff" /></mesh>
      {/* eyes */}
      <mesh position={[-0.2, 2.3, 0.7]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#6366f1" /></mesh>
      <mesh position={[0.2, 2.3, 0.7]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#6366f1" /></mesh>
      {/* mane */}
      <mesh position={[0, 2.5, -0.2]} rotation={[0.5, 0, 0]}><capsuleGeometry args={[0.15, 0.8, 4, 8]} /><meshStandardMaterial color="#c084fc" /></mesh>
      {/* legs */}
      <mesh position={[-0.35, 0, 0.3]}><cylinderGeometry args={[0.1, 0.1, 0.8, 8]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      <mesh position={[0.35, 0, 0.3]}><cylinderGeometry args={[0.1, 0.1, 0.8, 8]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      <mesh position={[-0.35, 0, -0.3]}><cylinderGeometry args={[0.1, 0.1, 0.8, 8]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      <mesh position={[0.35, 0, -0.3]}><cylinderGeometry args={[0.1, 0.1, 0.8, 8]} /><meshStandardMaterial color="#e2e8f0" /></mesh>
      {/* tail */}
      <mesh position={[0, 1.0, -0.9]} rotation={[0.6, 0, 0]}><capsuleGeometry args={[0.1, 0.9, 4, 8]} /><meshStandardMaterial color="#f0abfc" /></mesh>
    </group>
  );
}

function AnimalOwl({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* body */}
      <mesh position={[0, 0.7, 0]}><capsuleGeometry args={[0.65, 0.9, 8, 16]} /><meshStandardMaterial color="#78350f" /></mesh>
      {/* head */}
      <mesh position={[0, 1.7, 0]}><sphereGeometry args={[0.65, 16, 16]} /><meshStandardMaterial color="#92400e" /></mesh>
      {/* face disk */}
      <mesh position={[0, 1.65, 0.45]}><sphereGeometry args={[0.5, 16, 16]} /><meshStandardMaterial color="#fef3c7" /></mesh>
      {/* big eyes */}
      <mesh position={[-0.2, 1.8, 0.6]}><sphereGeometry args={[0.18, 12, 12]} /><meshStandardMaterial color="#fbbf24" /></mesh>
      <mesh position={[0.2, 1.8, 0.6]}><sphereGeometry args={[0.18, 12, 12]} /><meshStandardMaterial color="#fbbf24" /></mesh>
      <mesh position={[-0.2, 1.8, 0.72]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.2, 1.8, 0.72]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      {/* beak */}
      <mesh position={[0, 1.55, 0.75]} rotation={[0.3, 0, 0]}><coneGeometry args={[0.08, 0.2, 4]} /><meshStandardMaterial color="#f59e0b" /></mesh>
      {/* ear tufts */}
      <mesh position={[-0.35, 2.3, 0]} rotation={[0, 0, 0.2]}><coneGeometry args={[0.12, 0.4, 4]} /><meshStandardMaterial color="#92400e" /></mesh>
      <mesh position={[0.35, 2.3, 0]} rotation={[0, 0, -0.2]}><coneGeometry args={[0.12, 0.4, 4]} /><meshStandardMaterial color="#92400e" /></mesh>
      {/* chest pattern */}
      <mesh position={[0, 0.6, 0.4]}><sphereGeometry args={[0.4, 12, 12]} /><meshStandardMaterial color="#fef3c7" /></mesh>
    </group>
  );
}

function AnimalButterfly({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* body */}
      <mesh position={[0, 0.5, 0]}><capsuleGeometry args={[0.06, 0.6, 4, 8]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      {/* head */}
      <mesh position={[0, 1.0, 0]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#312e81" /></mesh>
      {/* antennae */}
      <mesh position={[-0.1, 1.25, 0]} rotation={[0, 0, 0.3]}><cylinderGeometry args={[0.01, 0.01, 0.3, 4]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      <mesh position={[0.1, 1.25, 0]} rotation={[0, 0, -0.3]}><cylinderGeometry args={[0.01, 0.01, 0.3, 4]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      {/* upper wings */}
      <mesh position={[-0.55, 0.75, 0]} rotation={[0, 0.1, 0.3]}><sphereGeometry args={[0.45, 12, 12]} /><meshStandardMaterial color="#c084fc" transparent opacity={0.8} /></mesh>
      <mesh position={[0.55, 0.75, 0]} rotation={[0, -0.1, -0.3]}><sphereGeometry args={[0.45, 12, 12]} /><meshStandardMaterial color="#c084fc" transparent opacity={0.8} /></mesh>
      {/* lower wings */}
      <mesh position={[-0.4, 0.35, 0]} rotation={[0, 0.1, 0.4]}><sphereGeometry args={[0.3, 12, 12]} /><meshStandardMaterial color="#fb7185" transparent opacity={0.75} /></mesh>
      <mesh position={[0.4, 0.35, 0]} rotation={[0, -0.1, -0.4]}><sphereGeometry args={[0.3, 12, 12]} /><meshStandardMaterial color="#fb7185" transparent opacity={0.75} /></mesh>
      {/* wing spots */}
      <mesh position={[-0.55, 0.8, 0.15]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#fbbf24" /></mesh>
      <mesh position={[0.55, 0.8, 0.15]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#fbbf24" /></mesh>
    </group>
  );
}

function AnimalDeer({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* body */}
      <mesh position={[0, 1.0, 0]}><capsuleGeometry args={[0.7, 1.4, 8, 16]} /><meshStandardMaterial color="#92400e" /></mesh>
      {/* head */}
      <mesh position={[0, 2.2, 0.3]}><sphereGeometry args={[0.5, 16, 16]} /><meshStandardMaterial color="#a16207" /></mesh>
      {/* snout */}
      <mesh position={[0, 2.0, 0.7]}><capsuleGeometry args={[0.15, 0.2, 8, 8]} /><meshStandardMaterial color="#d4a06a" /></mesh>
      {/* nose */}
      <mesh position={[0, 1.95, 0.85]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      {/* eyes */}
      <mesh position={[-0.2, 2.3, 0.55]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.2, 2.3, 0.55]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      {/* ears */}
      <mesh position={[-0.4, 2.55, 0]} rotation={[0, 0, 0.5]}><capsuleGeometry args={[0.08, 0.3, 4, 8]} /><meshStandardMaterial color="#a16207" /></mesh>
      <mesh position={[0.4, 2.55, 0]} rotation={[0, 0, -0.5]}><capsuleGeometry args={[0.08, 0.3, 4, 8]} /><meshStandardMaterial color="#a16207" /></mesh>
      {/* antlers */}
      <mesh position={[-0.2, 2.8, -0.05]} rotation={[0.1, 0, 0.2]}><cylinderGeometry args={[0.04, 0.03, 0.6, 6]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[0.2, 2.8, -0.05]} rotation={[0.1, 0, -0.2]}><cylinderGeometry args={[0.04, 0.03, 0.6, 6]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[-0.35, 3.05, -0.1]} rotation={[0, 0, 0.8]}><cylinderGeometry args={[0.03, 0.02, 0.3, 6]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[0.35, 3.05, -0.1]} rotation={[0, 0, -0.8]}><cylinderGeometry args={[0.03, 0.02, 0.3, 6]} /><meshStandardMaterial color="#78350f" /></mesh>
      {/* legs */}
      <mesh position={[-0.3, 0, 0.25]}><cylinderGeometry args={[0.08, 0.07, 0.7, 8]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[0.3, 0, 0.25]}><cylinderGeometry args={[0.08, 0.07, 0.7, 8]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[-0.3, 0, -0.25]}><cylinderGeometry args={[0.08, 0.07, 0.7, 8]} /><meshStandardMaterial color="#78350f" /></mesh>
      <mesh position={[0.3, 0, -0.25]}><cylinderGeometry args={[0.08, 0.07, 0.7, 8]} /><meshStandardMaterial color="#78350f" /></mesh>
      {/* tail */}
      <mesh position={[0, 1.2, -0.7]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#fff" /></mesh>
    </group>
  );
}

function AnimalWolf({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* body */}
      <mesh position={[0, 1.0, 0]}><capsuleGeometry args={[0.75, 1.3, 8, 16]} /><meshStandardMaterial color="#6b7280" /></mesh>
      {/* head */}
      <mesh position={[0, 2.1, 0.2]}><sphereGeometry args={[0.6, 16, 16]} /><meshStandardMaterial color="#9ca3af" /></mesh>
      {/* snout */}
      <mesh position={[0, 1.9, 0.75]}><capsuleGeometry args={[0.18, 0.3, 8, 8]} /><meshStandardMaterial color="#d1d5db" /></mesh>
      <mesh position={[0, 1.85, 0.95]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      {/* eyes */}
      <mesh position={[-0.2, 2.2, 0.55]}><sphereGeometry args={[0.09, 8, 8]} /><meshStandardMaterial color="#fbbf24" emissive="#713f12" /></mesh>
      <mesh position={[0.2, 2.2, 0.55]}><sphereGeometry args={[0.09, 8, 8]} /><meshStandardMaterial color="#fbbf24" emissive="#713f12" /></mesh>
      {/* ears */}
      <mesh position={[-0.3, 2.65, 0]} rotation={[0, 0, 0.15]}><coneGeometry args={[0.15, 0.4, 4]} /><meshStandardMaterial color="#6b7280" /></mesh>
      <mesh position={[0.3, 2.65, 0]} rotation={[0, 0, -0.15]}><coneGeometry args={[0.15, 0.4, 4]} /><meshStandardMaterial color="#6b7280" /></mesh>
      {/* chest */}
      <mesh position={[0, 0.8, 0.4]}><sphereGeometry args={[0.45, 12, 12]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
      {/* tail */}
      <mesh position={[0, 0.8, -0.8]} rotation={[0.8, 0, 0]}><capsuleGeometry args={[0.15, 1.0, 4, 8]} /><meshStandardMaterial color="#9ca3af" /></mesh>
    </group>
  );
}

function AnimalTurtle({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* shell */}
      <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.9, 16, 12]} /><meshStandardMaterial color="#166534" /></mesh>
      {/* shell pattern */}
      <mesh position={[0, 0.85, 0]}><sphereGeometry args={[0.7, 6, 4]} /><meshStandardMaterial color="#15803d" wireframe /></mesh>
      {/* belly */}
      <mesh position={[0, 0.3, 0]}><sphereGeometry args={[0.75, 16, 12]} /><meshStandardMaterial color="#fef08a" /></mesh>
      {/* head */}
      <mesh position={[0, 0.5, 0.8]}><sphereGeometry args={[0.3, 12, 12]} /><meshStandardMaterial color="#22c55e" /></mesh>
      {/* eyes */}
      <mesh position={[-0.1, 0.6, 1.0]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      <mesh position={[0.1, 0.6, 1.0]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#111" /></mesh>
      {/* legs */}
      <mesh position={[-0.55, 0.15, 0.4]} rotation={[0, 0, 0.6]}><capsuleGeometry args={[0.12, 0.3, 4, 8]} /><meshStandardMaterial color="#22c55e" /></mesh>
      <mesh position={[0.55, 0.15, 0.4]} rotation={[0, 0, -0.6]}><capsuleGeometry args={[0.12, 0.3, 4, 8]} /><meshStandardMaterial color="#22c55e" /></mesh>
      <mesh position={[-0.5, 0.15, -0.35]} rotation={[0, 0, 0.6]}><capsuleGeometry args={[0.12, 0.3, 4, 8]} /><meshStandardMaterial color="#22c55e" /></mesh>
      <mesh position={[0.5, 0.15, -0.35]} rotation={[0, 0, -0.6]}><capsuleGeometry args={[0.12, 0.3, 4, 8]} /><meshStandardMaterial color="#22c55e" /></mesh>
      {/* tail */}
      <mesh position={[0, 0.3, -0.85]}><coneGeometry args={[0.08, 0.3, 6]} /><meshStandardMaterial color="#22c55e" /></mesh>
    </group>
  );
}

/* ── NEW Items ─────────────────────────────── */

function PropStaff({ scale: s }: { scale: number }) {
  return (
    <group scale={s} rotation={[0, 0, 0.1]}>
      {/* shaft */}
      <mesh position={[0, 2.0, 0]}><cylinderGeometry args={[0.06, 0.08, 4.0, 8]} /><meshStandardMaterial color="#5c4033" /></mesh>
      {/* orb */}
      <mesh position={[0, 4.2, 0]}><sphereGeometry args={[0.3, 16, 16]} /><meshStandardMaterial color="#7dd3fc" metalness={0.3} roughness={0.1} transparent opacity={0.8} /></mesh>
      {/* orb glow ring */}
      <mesh position={[0, 4.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.35, 0.03, 8, 24]} /><meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.5} /></mesh>
      {/* grip wrap */}
      <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.09, 0.09, 0.5, 8]} /><meshStandardMaterial color="#a16207" /></mesh>
    </group>
  );
}

function PropBowWeapon({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* bow body - curved */}
      <mesh position={[0, 2.0, 0]} rotation={[0, 0, 0]}><torusGeometry args={[1.2, 0.06, 8, 16, Math.PI]} /><meshStandardMaterial color="#92400e" /></mesh>
      {/* string */}
      <mesh position={[0, 2.0, 0]}><cylinderGeometry args={[0.01, 0.01, 2.4, 4]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
      {/* grip */}
      <mesh position={[0, 2.0, -0.05]}><cylinderGeometry args={[0.08, 0.08, 0.4, 8]} /><meshStandardMaterial color="#78350f" /></mesh>
    </group>
  );
}

function PropLantern({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* top cap */}
      <mesh position={[0, 2.0, 0]}><coneGeometry args={[0.35, 0.3, 8]} /><meshStandardMaterial color="#b91c1c" /></mesh>
      {/* handle */}
      <mesh position={[0, 2.25, 0]} rotation={[0, 0, 0]}><torusGeometry args={[0.15, 0.02, 8, 16]} /><meshStandardMaterial color="#d4af37" metalness={0.6} /></mesh>
      {/* body */}
      <mesh position={[0, 1.4, 0]}><cylinderGeometry args={[0.35, 0.3, 0.9, 8]} /><meshStandardMaterial color="#dc2626" transparent opacity={0.8} /></mesh>
      {/* glow */}
      <mesh position={[0, 1.4, 0]}><sphereGeometry args={[0.25, 12, 12]} /><meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.8} transparent opacity={0.6} /></mesh>
      {/* bottom */}
      <mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.3, 0.25, 0.1, 8]} /><meshStandardMaterial color="#d4af37" metalness={0.6} /></mesh>
      {/* tassel */}
      <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.02, 0.08, 0.3, 6]} /><meshStandardMaterial color="#dc2626" /></mesh>
    </group>
  );
}

function PropCrown({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* base ring */}
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.6, 0.65, 0.3, 16]} /><meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.25} /></mesh>
      {/* spikes */}
      {[0, 72, 144, 216, 288].map((angle) => (
        <mesh key={angle} position={[Math.sin(d(angle)) * 0.5, 0.8, Math.cos(d(angle)) * 0.5]}>
          <coneGeometry args={[0.12, 0.6, 4]} /><meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.25} />
        </mesh>
      ))}
      {/* gems on spikes */}
      {[0, 144, 288].map((angle) => (
        <mesh key={`gem-${angle}`} position={[Math.sin(d(angle)) * 0.48, 0.55, Math.cos(d(angle)) * 0.48]}>
          <sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#dc2626" metalness={0.3} roughness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function PropRing({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.5, 0.1, 16, 32]} /><meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 0.5, 0.5]}><octahedronGeometry args={[0.2, 0]} /><meshStandardMaterial color="#8b5cf6" metalness={0.3} roughness={0.1} transparent opacity={0.9} /></mesh>
    </group>
  );
}

function PropPotion({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* bottle body */}
      <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.5, 16, 16]} /><meshStandardMaterial color="#a78bfa" transparent opacity={0.5} /></mesh>
      {/* liquid */}
      <mesh position={[0, 0.35, 0]}><sphereGeometry args={[0.42, 16, 12]} /><meshStandardMaterial color="#7c3aed" transparent opacity={0.7} /></mesh>
      {/* neck */}
      <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.12, 0.18, 0.5, 8]} /><meshStandardMaterial color="#c4b5fd" transparent opacity={0.5} /></mesh>
      {/* cork */}
      <mesh position={[0, 1.45, 0]}><cylinderGeometry args={[0.14, 0.12, 0.2, 8]} /><meshStandardMaterial color="#a16207" /></mesh>
      {/* bubbles */}
      <mesh position={[-0.1, 0.55, 0.15]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#e9d5ff" transparent opacity={0.6} /></mesh>
      <mesh position={[0.15, 0.65, -0.1]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#e9d5ff" transparent opacity={0.6} /></mesh>
    </group>
  );
}

function PropScroll({ scale: s }: { scale: number }) {
  return (
    <group scale={s} rotation={[0.2, 0.3, 0]}>
      {/* rolled paper body */}
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.25, 0.25, 2.0, 12]} /><meshStandardMaterial color="#fef3c7" /></mesh>
      {/* end caps */}
      <mesh position={[-1.05, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.3, 0.3, 0.1, 12]} /><meshStandardMaterial color="#92400e" /></mesh>
      <mesh position={[1.05, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.3, 0.3, 0.1, 12]} /><meshStandardMaterial color="#92400e" /></mesh>
      {/* ribbon */}
      <mesh position={[0, 0.5, 0.25]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.02, 0.02, 0.6, 4]} /><meshStandardMaterial color="#dc2626" /></mesh>
    </group>
  );
}

function PropGuitar({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* body */}
      <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.7, 16, 16]} /><meshStandardMaterial color="#a16207" /></mesh>
      <mesh position={[0, 1.2, 0]}><sphereGeometry args={[0.5, 16, 16]} /><meshStandardMaterial color="#92400e" /></mesh>
      {/* sound hole */}
      <mesh position={[0, 0.6, 0.55]} rotation={[0, 0, 0]}><torusGeometry args={[0.2, 0.03, 8, 16]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      {/* neck */}
      <mesh position={[0, 2.2, 0]}><boxGeometry args={[0.15, 1.6, 0.08]} /><meshStandardMaterial color="#78350f" /></mesh>
      {/* headstock */}
      <mesh position={[0, 3.1, 0]}><boxGeometry args={[0.2, 0.3, 0.1]} /><meshStandardMaterial color="#5c4033" /></mesh>
      {/* strings */}
      <mesh position={[0, 1.8, 0.06]}><boxGeometry args={[0.08, 2.5, 0.01]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
      {/* bridge */}
      <mesh position={[0, 0.2, 0.55]}><boxGeometry args={[0.3, 0.05, 0.04]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
    </group>
  );
}

function PropUmbrella({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* canopy */}
      <mesh position={[0, 3.0, 0]}><coneGeometry args={[1.5, 0.6, 8]} /><meshStandardMaterial color="#ec4899" side={2} /></mesh>
      {/* shaft */}
      <mesh position={[0, 1.5, 0]}><cylinderGeometry args={[0.04, 0.04, 3.0, 8]} /><meshStandardMaterial color="#374151" /></mesh>
      {/* handle */}
      <mesh position={[0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.15, 0.03, 8, 12, Math.PI]} /><meshStandardMaterial color="#374151" /></mesh>
      {/* tip */}
      <mesh position={[0, 3.35, 0]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#374151" /></mesh>
    </group>
  );
}

function PropHammer({ scale: s }: { scale: number }) {
  return (
    <group scale={s} rotation={[0, 0, 0.1]}>
      {/* handle */}
      <mesh position={[0, 1.5, 0]}><cylinderGeometry args={[0.06, 0.07, 3.0, 8]} /><meshStandardMaterial color="#78350f" /></mesh>
      {/* head */}
      <mesh position={[0, 3.1, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.35, 0.35, 1.2, 8]} /><meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.3} /></mesh>
      {/* grip */}
      <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.08, 0.08, 0.6, 8]} /><meshStandardMaterial color="#a16207" /></mesh>
    </group>
  );
}

function PropWand({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* shaft */}
      <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.04, 0.06, 2.2, 8]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      {/* star tip */}
      <mesh position={[0, 2.5, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.08, 5, 1]} /><meshStandardMaterial color="#fbbf24" emissive="#a16207" emissiveIntensity={0.6} /></mesh>
      {/* sparkle dots */}
      <mesh position={[-0.15, 2.7, 0]}><sphereGeometry args={[0.04, 6, 6]} /><meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.8} /></mesh>
      <mesh position={[0.2, 2.6, 0.1]}><sphereGeometry args={[0.03, 6, 6]} /><meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.8} /></mesh>
      {/* grip */}
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.06, 0.05, 0.4, 8]} /><meshStandardMaterial color="#6d28d9" /></mesh>
    </group>
  );
}

function PropHeartShape({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* left lobe */}
      <mesh position={[-0.28, 0.9, 0]}><sphereGeometry args={[0.4, 16, 16]} /><meshStandardMaterial color="#f43f5e" /></mesh>
      {/* right lobe */}
      <mesh position={[0.28, 0.9, 0]}><sphereGeometry args={[0.4, 16, 16]} /><meshStandardMaterial color="#f43f5e" /></mesh>
      {/* bottom point */}
      <mesh position={[0, 0.35, 0]} rotation={[0, 0, Math.PI]}><coneGeometry args={[0.55, 0.7, 16]} /><meshStandardMaterial color="#e11d48" /></mesh>
    </group>
  );
}

function PropMoonShape({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* main moon */}
      <mesh position={[0, 1.0, 0]}><sphereGeometry args={[0.8, 24, 24]} /><meshStandardMaterial color="#fde68a" emissive="#a16207" emissiveIntensity={0.3} /></mesh>
      {/* cutout (darker sphere offset to make crescent) */}
      <mesh position={[0.35, 1.15, 0.15]}><sphereGeometry args={[0.65, 24, 24]} /><meshStandardMaterial color="#1e293b" /></mesh>
    </group>
  );
}

function PropSunShape({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* core */}
      <mesh position={[0, 1.0, 0]}><sphereGeometry args={[0.5, 24, 24]} /><meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.6} /></mesh>
      {/* rays */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <mesh key={angle} position={[Math.sin(d(angle)) * 0.85, 1.0 + Math.cos(d(angle)) * 0.85, 0]} rotation={[0, 0, d(-angle)]}>
          <coneGeometry args={[0.08, 0.35, 4]} /><meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function PropTreasureChest({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* base */}
      <mesh position={[0, 0.3, 0]}><boxGeometry args={[1.4, 0.6, 0.9]} /><meshStandardMaterial color="#92400e" /></mesh>
      {/* lid (open) */}
      <mesh position={[0, 0.75, -0.3]} rotation={[-0.6, 0, 0]}><boxGeometry args={[1.4, 0.15, 0.9]} /><meshStandardMaterial color="#78350f" /></mesh>
      {/* gold coins inside */}
      <mesh position={[0, 0.55, 0]}><sphereGeometry args={[0.35, 12, 8]} /><meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} /></mesh>
      <mesh position={[-0.25, 0.5, 0.15]}><sphereGeometry args={[0.15, 8, 8]} /><meshStandardMaterial color="#d4af37" metalness={0.7} /></mesh>
      <mesh position={[0.2, 0.5, -0.1]}><sphereGeometry args={[0.12, 8, 8]} /><meshStandardMaterial color="#f59e0b" metalness={0.7} /></mesh>
      {/* lock */}
      <mesh position={[0, 0.45, 0.46]}><boxGeometry args={[0.15, 0.15, 0.05]} /><meshStandardMaterial color="#d4af37" metalness={0.6} /></mesh>
      {/* gem inside */}
      <mesh position={[0.15, 0.65, 0.1]}><octahedronGeometry args={[0.12, 0]} /><meshStandardMaterial color="#dc2626" metalness={0.3} roughness={0.1} /></mesh>
    </group>
  );
}

function PropBalloon({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* balloon body */}
      <mesh position={[0, 2.0, 0]}><sphereGeometry args={[0.6, 16, 16]} /><meshStandardMaterial color="#f43f5e" transparent opacity={0.85} /></mesh>
      {/* knot */}
      <mesh position={[0, 1.35, 0]}><coneGeometry args={[0.08, 0.15, 6]} /><meshStandardMaterial color="#e11d48" /></mesh>
      {/* string */}
      <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.01, 0.01, 1.2, 4]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
      {/* highlight */}
      <mesh position={[-0.15, 2.2, 0.35]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#fff" transparent opacity={0.5} /></mesh>
    </group>
  );
}

function PropCandle({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* base plate */}
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.4, 0.45, 0.1, 12]} /><meshStandardMaterial color="#d4af37" metalness={0.5} /></mesh>
      {/* wax body */}
      <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.15, 0.18, 1.2, 12]} /><meshStandardMaterial color="#fef3c7" /></mesh>
      {/* wick */}
      <mesh position={[0, 1.38, 0]}><cylinderGeometry args={[0.01, 0.01, 0.12, 4]} /><meshStandardMaterial color="#374151" /></mesh>
      {/* flame */}
      <mesh position={[0, 1.55, 0]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.0} /></mesh>
      <mesh position={[0, 1.65, 0]}><coneGeometry args={[0.06, 0.2, 8]} /><meshStandardMaterial color="#fb923c" emissive="#ea580c" emissiveIntensity={0.8} transparent opacity={0.8} /></mesh>
      {/* drip */}
      <mesh position={[0.08, 0.9, 0.15]}><sphereGeometry args={[0.04, 6, 6]} /><meshStandardMaterial color="#fef9c3" /></mesh>
    </group>
  );
}

function PropMask({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* face shape */}
      <mesh position={[0, 1.0, 0]}><sphereGeometry args={[0.7, 16, 16]} /><meshStandardMaterial color="#fef3c7" /></mesh>
      {/* eye holes */}
      <mesh position={[-0.25, 1.1, 0.55]}><sphereGeometry args={[0.15, 8, 8]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      <mesh position={[0.25, 1.1, 0.55]}><sphereGeometry args={[0.15, 8, 8]} /><meshStandardMaterial color="#1e1b4b" /></mesh>
      {/* decorative elements */}
      <mesh position={[0, 1.5, 0.35]}><coneGeometry args={[0.5, 0.4, 8]} /><meshStandardMaterial color="#dc2626" /></mesh>
      {/* nose bridge */}
      <mesh position={[0, 0.9, 0.6]}><boxGeometry args={[0.08, 0.3, 0.08]} /><meshStandardMaterial color="#fde68a" /></mesh>
      {/* side ribbons */}
      <mesh position={[-0.65, 1.0, -0.15]} rotation={[0, 0, 0.3]}><capsuleGeometry args={[0.04, 0.5, 4, 8]} /><meshStandardMaterial color="#7c3aed" /></mesh>
      <mesh position={[0.65, 1.0, -0.15]} rotation={[0, 0, -0.3]}><capsuleGeometry args={[0.04, 0.5, 4, 8]} /><meshStandardMaterial color="#7c3aed" /></mesh>
    </group>
  );
}

/* ── NEW Effects ─────────────────────────────── */

function PropSparkle({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {[
        { pos: [0, 0.5, 0] as const, sz: 0.12, c: "#fde047" },
        { pos: [-0.3, 0.8, 0.2] as const, sz: 0.08, c: "#fbbf24" },
        { pos: [0.25, 1.0, -0.15] as const, sz: 0.1, c: "#f59e0b" },
        { pos: [0.1, 0.3, 0.3] as const, sz: 0.06, c: "#fef08a" },
        { pos: [-0.2, 1.2, 0.1] as const, sz: 0.09, c: "#fde047" },
        { pos: [0.35, 0.6, -0.2] as const, sz: 0.07, c: "#fbbf24" },
        { pos: [-0.1, 0.9, -0.25] as const, sz: 0.05, c: "#fef08a" },
      ].map((p, i) => (
        <mesh key={i} position={[p.pos[0], p.pos[1], p.pos[2]]}>
          <sphereGeometry args={[p.sz, 8, 8]} /><meshStandardMaterial color={p.c} emissive={p.c} emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function PropFire({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* base flames */}
      <mesh position={[0, 0.4, 0]}><coneGeometry args={[0.45, 1.2, 8]} /><meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.7} transparent opacity={0.85} /></mesh>
      <mesh position={[-0.15, 0.55, 0.1]}><coneGeometry args={[0.3, 0.9, 8]} /><meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.8} transparent opacity={0.8} /></mesh>
      <mesh position={[0.12, 0.5, -0.08]}><coneGeometry args={[0.25, 0.8, 8]} /><meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.9} transparent opacity={0.75} /></mesh>
      {/* core */}
      <mesh position={[0, 0.3, 0]}><coneGeometry args={[0.15, 0.5, 8]} /><meshStandardMaterial color="#fff" emissive="#fef08a" emissiveIntensity={1.0} transparent opacity={0.6} /></mesh>
      {/* embers */}
      <mesh position={[-0.3, 0.9, 0.15]}><sphereGeometry args={[0.04, 6, 6]} /><meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.0} /></mesh>
      <mesh position={[0.2, 1.0, -0.1]}><sphereGeometry args={[0.03, 6, 6]} /><meshStandardMaterial color="#fb923c" emissive="#ea580c" emissiveIntensity={1.0} /></mesh>
    </group>
  );
}

function PropLightning({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* bolt segments */}
      <mesh position={[0, 2.0, 0]} rotation={[0, 0, 0.1]}><boxGeometry args={[0.2, 1.0, 0.06]} /><meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.9} /></mesh>
      <mesh position={[0.15, 1.2, 0]} rotation={[0, 0, -0.3]}><boxGeometry args={[0.18, 0.8, 0.06]} /><meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.9} /></mesh>
      <mesh position={[0.05, 0.5, 0]} rotation={[0, 0, 0.15]}><boxGeometry args={[0.15, 0.7, 0.06]} /><meshStandardMaterial color="#fde047" emissive="#fbbf24" emissiveIntensity={0.9} /></mesh>
      {/* glow */}
      <mesh position={[0.1, 1.2, 0]}><sphereGeometry args={[0.3, 8, 8]} /><meshStandardMaterial color="#fef08a" transparent opacity={0.2} /></mesh>
    </group>
  );
}

function PropSnowflake({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {/* 6 arms */}
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <group key={angle} rotation={[0, 0, d(angle)]}>
          <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.06, 0.8, 0.03]} /><meshStandardMaterial color="#bfdbfe" metalness={0.3} roughness={0.2} /></mesh>
          <mesh position={[-0.15, 0.65, 0]} rotation={[0, 0, 0.6]}><boxGeometry args={[0.04, 0.3, 0.03]} /><meshStandardMaterial color="#93c5fd" metalness={0.3} roughness={0.2} /></mesh>
          <mesh position={[0.15, 0.65, 0]} rotation={[0, 0, -0.6]}><boxGeometry args={[0.04, 0.3, 0.03]} /><meshStandardMaterial color="#93c5fd" metalness={0.3} roughness={0.2} /></mesh>
        </group>
      ))}
      {/* center */}
      <mesh position={[0, 0, 0]}><sphereGeometry args={[0.12, 12, 12]} /><meshStandardMaterial color="#dbeafe" metalness={0.4} roughness={0.1} /></mesh>
    </group>
  );
}

function PropRainbow({ scale: s }: { scale: number }) {
  const colors = ["#ef4444", "#f97316", "#fbbf24", "#22c55e", "#3b82f6", "#6366f1", "#a855f7"];
  return (
    <group scale={s} rotation={[0, 0, 0]}>
      {colors.map((color, i) => (
        <mesh key={i} position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.5 - i * 0.12, 0.05, 8, 32, Math.PI]} /><meshStandardMaterial color={color} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function PropBubbles({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {[
        { pos: [0, 0.5, 0] as const, sz: 0.25 },
        { pos: [-0.35, 0.9, 0.15] as const, sz: 0.18 },
        { pos: [0.3, 1.2, -0.1] as const, sz: 0.22 },
        { pos: [0.1, 0.3, 0.3] as const, sz: 0.15 },
        { pos: [-0.2, 1.5, 0.05] as const, sz: 0.2 },
        { pos: [0.25, 0.7, 0.25] as const, sz: 0.12 },
      ].map((b, i) => (
        <mesh key={i} position={[b.pos[0], b.pos[1], b.pos[2]]}>
          <sphereGeometry args={[b.sz, 16, 16]} /><meshStandardMaterial color="#bfdbfe" transparent opacity={0.3} metalness={0.1} roughness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

function PropLeaves({ scale: s }: { scale: number }) {
  return (
    <group scale={s}>
      {[
        { pos: [0, 0.3, 0] as const, rot: [0.2, 0.3, 0.5] as const, c: "#22c55e" },
        { pos: [-0.3, 0.7, 0.2] as const, rot: [0.5, -0.2, 0.8] as const, c: "#16a34a" },
        { pos: [0.25, 1.0, -0.15] as const, rot: [-0.3, 0.4, -0.6] as const, c: "#15803d" },
        { pos: [0.1, 0.5, 0.3] as const, rot: [0.1, 0.6, 0.3] as const, c: "#4ade80" },
        { pos: [-0.2, 1.2, 0.1] as const, rot: [0.7, -0.1, 0.4] as const, c: "#86efac" },
      ].map((leaf, i) => (
        <mesh key={i} position={[leaf.pos[0], leaf.pos[1], leaf.pos[2]]} rotation={[leaf.rot[0], leaf.rot[1], leaf.rot[2]]}>
          <boxGeometry args={[0.3, 0.02, 0.15]} /><meshStandardMaterial color={leaf.c} />
        </mesh>
      ))}
    </group>
  );
}

function PropFeather({ scale: s }: { scale: number }) {
  return (
    <group scale={s} rotation={[0, 0, 0.2]}>
      {/* quill */}
      <mesh position={[0, 1.0, 0]}><cylinderGeometry args={[0.02, 0.01, 2.0, 6]} /><meshStandardMaterial color="#f5f5f4" /></mesh>
      {/* vane */}
      <mesh position={[-0.15, 1.3, 0]} rotation={[0, 0, 0.15]}><boxGeometry args={[0.35, 1.2, 0.02]} /><meshStandardMaterial color="#e0e7ff" transparent opacity={0.85} /></mesh>
      <mesh position={[0.12, 1.3, 0]} rotation={[0, 0, -0.15]}><boxGeometry args={[0.25, 1.0, 0.02]} /><meshStandardMaterial color="#c7d2fe" transparent opacity={0.85} /></mesh>
      {/* tip */}
      <mesh position={[0, 2.1, 0]}><coneGeometry args={[0.08, 0.15, 6]} /><meshStandardMaterial color="#e0e7ff" /></mesh>
    </group>
  );
}

const PROP_COMPONENTS: Record<string, React.FC<{ scale: number }>> = {
  cat: AnimalCat, dog: AnimalDog, bunny: AnimalBunny, bird: AnimalBird,
  fox: AnimalFox, bear: AnimalBear, chick: AnimalChick, fish: AnimalFish,
  sword: PropSword, shield: PropShield, book: PropBook, flower: PropFlower,
  gem: PropGem, crystal: PropCrystal, cloud: PropCloud, star: PropStar,
  /* new animals */
  penguin: AnimalPenguin, dragon: AnimalDragon, unicorn: AnimalUnicorn, owl: AnimalOwl,
  butterfly: AnimalButterfly, deer: AnimalDeer, wolf: AnimalWolf, turtle: AnimalTurtle,
  /* new items */
  staff: PropStaff, bowWeapon: PropBowWeapon, lantern: PropLantern, crown: PropCrown,
  ring: PropRing, potion: PropPotion, scroll: PropScroll, guitar: PropGuitar,
  umbrella: PropUmbrella, hammer: PropHammer, wand: PropWand, heartProp: PropHeartShape,
  moon: PropMoonShape, sun: PropSunShape, treasureChest: PropTreasureChest, balloon: PropBalloon,
  candle: PropCandle, mask: PropMask,
  /* new effects */
  sparkle: PropSparkle, fire: PropFire, lightning: PropLightning, snowflake: PropSnowflake,
  rainbow: PropRainbow, bubbles: PropBubbles, leaves: PropLeaves, feather: PropFeather,
};

type PropAttachmentConfig = {
  bone: VRMHumanBoneName | "none";
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
};

const DEFAULT_BONE_OFFSETS: Record<string, Partial<Record<VRMHumanBoneName, Partial<PropAttachmentConfig>>>> = {
  sword: {
    rightHand: { offsetX: 0.05, offsetY: 0.12, offsetZ: -0.05, rotX: 70, rotY: 0, rotZ: -20, scale: 0.75 },
    leftHand: { offsetX: -0.05, offsetY: 0.12, offsetZ: -0.05, rotX: 70, rotY: 0, rotZ: 20, scale: 0.75 },
    head: { offsetX: 0, offsetY: 0.28, offsetZ: -0.1, rotX: 90, rotY: 0, rotZ: 0, scale: 0.8 },
  },
  shield: {
    leftHand: { offsetX: -0.08, offsetY: 0.06, offsetZ: 0.04, rotX: 0, rotY: 85, rotZ: 0, scale: 0.75 },
    rightHand: { offsetX: 0.08, offsetY: 0.06, offsetZ: 0.04, rotX: 0, rotY: -85, rotZ: 0, scale: 0.75 },
    hips: { offsetX: 0, offsetY: -0.15, offsetZ: -0.15, rotX: 180, rotY: 0, rotZ: 0, scale: 0.9 },
  },
  flower: {
    head: { offsetX: 0.05, offsetY: 0.14, offsetZ: 0.04, rotX: 0, rotY: 0, rotZ: 15, scale: 1.0 },
    rightHand: { offsetX: 0.02, offsetY: 0.08, offsetZ: 0, rotX: 90, rotY: 0, rotZ: 0, scale: 0.8 },
    leftHand: { offsetX: -0.02, offsetY: 0.08, offsetZ: 0, rotX: 90, rotY: 0, rotZ: 0, scale: 0.8 },
  },
  star: {
    head: { offsetX: 0, offsetY: 0.26, offsetZ: 0.02, rotX: 0, rotY: 0, rotZ: 0, scale: 0.7 },
  },
  cloud: {
    head: { offsetX: 0, offsetY: 0.38, offsetZ: -0.08, rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 },
  },
  /* ── new bone offsets ── */
  staff: {
    rightHand: { offsetX: 0.05, offsetY: 0.15, offsetZ: -0.04, rotX: 75, rotY: 0, rotZ: -15, scale: 0.6 },
    leftHand: { offsetX: -0.05, offsetY: 0.15, offsetZ: -0.04, rotX: 75, rotY: 0, rotZ: 15, scale: 0.6 },
  },
  bowWeapon: {
    leftHand: { offsetX: -0.06, offsetY: 0.1, offsetZ: 0.02, rotX: 0, rotY: 90, rotZ: 0, scale: 0.6 },
    rightHand: { offsetX: 0.06, offsetY: 0.1, offsetZ: 0.02, rotX: 0, rotY: -90, rotZ: 0, scale: 0.6 },
  },
  crown: {
    head: { offsetX: 0, offsetY: 0.18, offsetZ: 0.02, rotX: 0, rotY: 0, rotZ: 0, scale: 0.55 },
  },
  hammer: {
    rightHand: { offsetX: 0.05, offsetY: 0.12, offsetZ: -0.05, rotX: 70, rotY: 0, rotZ: -15, scale: 0.55 },
    leftHand: { offsetX: -0.05, offsetY: 0.12, offsetZ: -0.05, rotX: 70, rotY: 0, rotZ: 15, scale: 0.55 },
  },
  wand: {
    rightHand: { offsetX: 0.03, offsetY: 0.1, offsetZ: -0.03, rotX: 65, rotY: 0, rotZ: -10, scale: 0.7 },
    leftHand: { offsetX: -0.03, offsetY: 0.1, offsetZ: -0.03, rotX: 65, rotY: 0, rotZ: 10, scale: 0.7 },
  },
  umbrella: {
    rightHand: { offsetX: 0.04, offsetY: 0.12, offsetZ: -0.04, rotX: 80, rotY: 0, rotZ: -10, scale: 0.5 },
    leftHand: { offsetX: -0.04, offsetY: 0.12, offsetZ: -0.04, rotX: 80, rotY: 0, rotZ: 10, scale: 0.5 },
  },
  lantern: {
    rightHand: { offsetX: 0.04, offsetY: 0.08, offsetZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 0.65 },
    leftHand: { offsetX: -0.04, offsetY: 0.08, offsetZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 0.65 },
  },
  guitar: {
    hips: { offsetX: 0.1, offsetY: 0, offsetZ: 0.1, rotX: 15, rotY: -20, rotZ: -10, scale: 0.55 },
  },
  mask: {
    head: { offsetX: 0, offsetY: -0.02, offsetZ: 0.12, rotX: 0, rotY: 0, rotZ: 0, scale: 0.6 },
  },
  ring: {
    rightHand: { offsetX: 0.02, offsetY: 0.02, offsetZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 0.4 },
    leftHand: { offsetX: -0.02, offsetY: 0.02, offsetZ: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 0.4 },
  },
};

function SceneProp3D({
  propId,
  vrm,
  config,
  defaultPosition,
  defaultScale,
}: {
  propId: string;
  vrm: VRM | null;
  config: PropAttachmentConfig | undefined;
  defaultPosition: Vec3;
  defaultScale: number;
}) {
  const Comp = PROP_COMPONENTS[propId];
  const attachmentBone = config?.bone ?? "none";
  const [boneNode, setBoneNode] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    if (vrm && attachmentBone !== "none") {
      const node = vrm.humanoid?.getNormalizedBoneNode(attachmentBone);
      setBoneNode(node || null);
    } else {
      setBoneNode(null);
    }
  }, [vrm, attachmentBone]);

  if (!Comp) return null;

  if (boneNode) {
    const px = config?.offsetX ?? 0;
    const py = config?.offsetY ?? 0;
    const pz = config?.offsetZ ?? 0;
    const rx = THREE.MathUtils.degToRad(config?.rotX ?? 0);
    const ry = THREE.MathUtils.degToRad(config?.rotY ?? 0);
    const rz = THREE.MathUtils.degToRad(config?.rotZ ?? 0);
    const scl = (config?.scale ?? 1.0) * defaultScale;

    return createPortal(
      <group position={[px, py, pz]} rotation={[rx, ry, rz]}>
        <Comp scale={scl} />
      </group>,
      boneNode
    );
  }

  return (
    <group position={[defaultPosition[0], defaultPosition[1], defaultPosition[2]]}>
      <Comp scale={defaultScale} />
    </group>
  );
}

/** 본 부착 소품(studio-vrm-props) 한 인스턴스를 humanoid 본에 포털로 부착한다. */
function VrmPropAttachment({ vrm, instance }: { vrm: VRM; instance: PropInstance }) {
  const [boneNode, setBoneNode] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    const node = vrm.humanoid?.getNormalizedBoneNode(instance.bone) ?? null;
    setBoneNode(node);
  }, [vrm, instance.bone]);

  const object = useMemo(() => {
    const def = propDefById(instance.propId);
    if (!def) return null;
    return buildPropObject(THREE as unknown as Parameters<typeof buildPropObject>[0], def, instance.color) as unknown as THREE.Object3D;
  }, [instance.color, instance.propId]);

  useEffect(() => {
    if (!object) return;
    object.position.set(instance.position[0], instance.position[1], instance.position[2]);
    object.rotation.set(
      THREE.MathUtils.degToRad(instance.rotationDeg[0]),
      THREE.MathUtils.degToRad(instance.rotationDeg[1]),
      THREE.MathUtils.degToRad(instance.rotationDeg[2])
    );
    object.scale.setScalar(instance.scale);
  }, [object, instance.position, instance.rotationDeg, instance.scale]);

  if (!boneNode || !object) return null;
  return createPortal(<primitive object={object} />, boneNode);
}

/* ── 실장착 워드로브(studio-vrm-wardrobe) — 측정·조립·본 부착 ────────── */

/** 정규화 휴머노이드 rest 포즈에서 골격 치수를 실측한다(로드 직후, 포즈 적용 전 호출). */
function measureVrmWardrobeMetrics(vrm: VRM): WardrobeMetrics {
  const humanoid = vrm.humanoid;
  const fallback = sanitizeWardrobeMetrics(null);
  if (!humanoid) return fallback;
  vrm.scene.updateMatrixWorld(true);

  const node = (name: VRMHumanBoneName) => humanoid.getNormalizedBoneNode(name);
  const world = (name: VRMHumanBoneName): THREE.Vector3 | null => {
    const n = node(name);
    return n ? n.getWorldPosition(new THREE.Vector3()) : null;
  };
  // 본 로컬 공간에서 목표 월드 지점을 향하는 단위 방향.
  const localDir = (from: VRMHumanBoneName, toWorld: THREE.Vector3): THREE.Vector3 | null => {
    const n = node(from);
    if (!n) return null;
    const dir = n.worldToLocal(toWorld.clone()).normalize();
    return Number.isFinite(dir.x) && dir.lengthSq() > 1e-8 ? dir : null;
  };
  const toVec3 = (v: THREE.Vector3 | null): [number, number, number] | null => (v ? [v.x, v.y, v.z] : null);

  const hips = world("hips");
  const spine = world("spine");
  const neckW = world("neck") ?? world("head");
  const limb = (from: VRMHumanBoneName, to: VRMHumanBoneName, fb: LimbMetric): LimbMetric => {
    const a = world(from);
    const b = world(to);
    const axis = b ? localDir(from, b) : null;
    if (!a || !b || !axis) return fb;
    return { len: a.distanceTo(b), axis: toVec3(axis) ?? fb.axis };
  };

  const lUpArm = world("leftUpperArm");
  const rUpArm = world("rightUpperArm");
  const lUpLeg = world("leftUpperLeg");
  const rUpLeg = world("rightUpperLeg");
  const lFoot = world("leftFoot");
  const rFoot = world("rightFoot");

  // 몸통 위 방향(spine 로컬) + 발 앞 방향(해부학: 왼쪽×위 = 앞).
  const upLocal = spine && neckW ? localDir("spine", neckW) : null;
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

  const sceneY = vrm.scene.getWorldPosition(new THREE.Vector3()).y;

  return sanitizeWardrobeMetrics({
    shoulderW: lUpArm && rUpArm ? lUpArm.distanceTo(rUpArm) : undefined,
    hipW: lUpLeg && rUpLeg ? lUpLeg.distanceTo(rUpLeg) : undefined,
    hipsToSpine: hips && spine ? hips.distanceTo(spine) : undefined,
    spineToNeck: spine && neckW ? spine.distanceTo(neckW) : undefined,
    ankleH: lFoot ? Math.max(0.02, lFoot.y - sceneY) : undefined,
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

function buildGarmentGeometry(shape: GarmentPart["shape"]): THREE.BufferGeometry {
  switch (shape.kind) {
    case "cylinder":
      return new THREE.CylinderGeometry(shape.rTop, shape.rBottom, shape.h, 26, 1, shape.open ?? false);
    case "box":
      return new THREE.BoxGeometry(shape.w, shape.h, shape.d);
    case "sphere":
      return new THREE.SphereGeometry(shape.r, 20, 14);
    case "torus":
      return new THREE.TorusGeometry(shape.r, shape.tube, 10, 26, shape.arc ?? Math.PI * 2);
  }
}

/** 파츠 스펙 목록을 본별 three 그룹으로 조립한다. */
function assembleGarmentGroups(parts: GarmentPart[], itemColor: string, name: string): Map<WardrobeBone, THREE.Group> {
  const groups = new Map<WardrobeBone, THREE.Group>();
  for (const part of parts) {
    let group = groups.get(part.bone);
    if (!group) {
      group = new THREE.Group();
      group.name = `${name}:${part.bone}`;
      groups.set(part.bone, group);
    }
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(part.color ?? itemColor),
      roughness: part.roughness ?? 0.75,
      metalness: part.metalness ?? 0.05,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(buildGarmentGeometry(part.shape), material);
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

function disposeGarmentGroup(group: THREE.Group) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((m) => m?.dispose());
  });
}

/** 워드로브 한 슬롯 장착분을 humanoid 본들에 포털로 부착한다(파츠가 본을 따라 포즈 추종). */
function VrmWardrobeAttachment({ vrm, equip, metrics }: { vrm: VRM; equip: WardrobeEquip; metrics: WardrobeMetrics }) {
  const entries = useMemo(() => {
    const def = wardrobeItemById(equip.itemId);
    if (!def) return [];
    const parts = buildGarmentParts(equip.itemId, metrics, equip.fit);
    const groups = assembleGarmentGroups(parts, equip.color, `wardrobe:${def.slot}:${def.id}`);
    const list: { bone: WardrobeBone; node: THREE.Object3D; object: THREE.Group }[] = [];
    for (const [bone, object] of groups) {
      const boneNode = vrm.humanoid?.getNormalizedBoneNode(bone as VRMHumanBoneName) ?? null;
      if (boneNode) list.push({ bone, node: boneNode, object });
    }
    return list;
  }, [vrm, equip.itemId, equip.color, equip.fit, metrics]);

  // GPU 버퍼 정리 — 아이템/색/핏 교체나 언마운트 시 이전 지오메트리를 해제한다.
  useEffect(() => {
    return () => entries.forEach((entry) => disposeGarmentGroup(entry.object));
  }, [entries]);

  return (
    <>
      {entries.map((entry) => (
        <group key={`${equip.itemId}-${entry.bone}`}>{createPortal(<primitive object={entry.object} />, entry.node)}</group>
      ))}
    </>
  );
}

function applyRotationToVrm(vrm: VRM, bodyRotation: number) {
  const baseRotationY = typeof vrm.scene.userData[BASE_ROTATION_Y_KEY] === "number" ? vrm.scene.userData[BASE_ROTATION_Y_KEY] : 0;
  vrm.scene.rotation.y = baseRotationY + bodyRotation;
  vrm.scene.updateMatrixWorld(true);
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

function VrmActor({
  bodyRotation,
  customBones,
  customYOffset,
  expressionWeights,
  vrm,
  customColors,
  physicsPreview,
  webcamActive,
  trackingDataRef,
  idleAnimation,
  fingerEdits,
  bodyScale,
}: {
  bodyRotation: number;
  customBones: PoseBoneMap;
  customYOffset: number;
  expressionWeights: Record<string, number>;
  vrm: VRM;
  customColors: Record<string, string>;
  physicsPreview: boolean;
  webcamActive: boolean;
  trackingDataRef: React.RefObject<VrmTrackingData | null>;
  idleAnimation: boolean;
  fingerEdits: FingerRotationMap;
  bodyScale: BodyScale;
}) {
  useEffect(() => {
    applyPoserVisualState(vrm, { bones: customBones, yOffset: customYOffset, fingerEdits, bodyScale });
    applyExpressionWeightsToVrm(vrm, expressionWeights);
  }, [customBones, customYOffset, expressionWeights, fingerEdits, bodyScale, vrm, webcamActive, idleAnimation]);

  useEffect(() => {
    applyRotationToVrm(vrm, bodyRotation);
  }, [bodyRotation, vrm]);

  useEffect(() => {
    applyVrmCustomColors(vrm, customColors);
  }, [customColors, vrm]);

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

    // 흔들림 미리보기·웹캠 트래킹 중: 매 프레임 스프링본을 갱신(델타 상한으로 탭 복귀 폭주 방지)
    // — 머리 회전에 머리카락/의상 물리가 자연스럽게 따라온다.
    // 정지 모드: delta 0으로 표정/제약만 동기화하고 스프링본은 정착 프레임에서 멈춘다.
    const springDelta = webcamActive || physicsPreview ? Math.min(dVal, PHYSICS_PREVIEW_MAX_DELTA) : 0;
    vrm.update(springDelta);
  });

  return <primitive object={vrm.scene} />;
}

type LightingTone = "morning" | "sunset" | "night" | "studio";

function GroundShadow() {
  return (
    <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.48, 0.82, 1]} renderOrder={-1}>
      <circleGeometry args={[1, 72]} />
      <meshBasicMaterial color="#3c2b20" transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function VrmLighting({ tone, lighting, env }: { tone: LightingTone; lighting?: LightingParams; env?: EnvVariant }) {
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

      {/* Env variants (floor / wall / room / outdoor) */}
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
      if (typeof window === "undefined") return "https://toonspectrum.vercel.app/studio";
      const { protocol, hostname, origin, pathname } = window.location;
      const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
      if (protocol === "https:" || isLocal) {
        // Use current URL (preserve path like /studio)
        return `${origin}${pathname}`;
      }
      // Suggest production HTTPS URL
      return "https://toonspectrum.vercel.app/studio";
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
        "1. 브라우저 주소창 왼쪽 '자물쇠' 아이콘 클릭 → '카메라'가 '허용'인지 확인 (이 사이트 origin에서 별도로 설정해야 함: localhost vs https://toonspectrum.vercel.app 별개).\n" +
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

export function StudioVrmPoser({ open, onClose, onInsert, initialDataUrl }: StudioVrmPoserProps) {
  const [status, setStatus] = useState<LoadStatus>("empty");
  const [error, setError] = useState("");
  const [modelName, setModelName] = useState("");
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [activePoseId, setActivePoseId] = useState("default");
  const [customBones, setCustomBones] = useState<PoseBoneMap>(POSE_PRESETS[0].bones);
  const [customYOffset, setCustomYOffset] = useState<number>(POSE_PRESETS[0].yOffset ?? 0);
  const [activeCategory, setActiveCategory] = useState("head");
  const [activeExpressionId, setActiveExpressionId] = useState("neutral");
  const [expressionWeights, setExpressionWeights] = useState<Record<string, number>>({});
  const [activeExpressionCategory, setActiveExpressionCategory] = useState<string>("emotion");
  const [activeCameraId, setActiveCameraId] = useState("front");
  const [activePanelTab, setActivePanelTab] = useState<PanelTab>("character");
  const [poseQuery, setPoseQuery] = useState("");
  const [bodyRotation, setBodyRotation] = useState(0);
  // 뷰포트 오버레이 컨트롤 — 줌/시점초기화/턴테이블/드래그 힌트.
  const [turntable, setTurntable] = useState(false);
  const [viewResetNonce, setViewResetNonce] = useState(0);
  const [viewportHinted, setViewportHinted] = useState(false);
  const viewportApiRef = useRef<ViewportApi | null>(null);
  // 편집 되돌리기/다시실행 — 전체 포저 상태 스냅샷 히스토리(직렬화 재사용).
  const historyRef = useRef<FullVrmState[]>([]);
  const historyIndexRef = useRef(-1);
  const isRestoringRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [libraryEntries, setLibraryEntries] = useState<VrmLibraryEntry[]>(SAMPLE_VRM_ENTRIES);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("loading");
  const [libraryError, setLibraryError] = useState("");
  const [activeModelId, setActiveModelId] = useState(SAMPLE_VRM_ID);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);

  // early decl for new features used in effects
  const [bodyScale, setBodyScale] = useState<BodyScale>({ height: 1, width: 1 });
  const [fingerEdits, setFingerEdits] = useState<FingerRotationMap>({});
  const [lighting, setLighting] = useState<LightingParams>({ intensity: 1.2, colorTemp: 0.5, directionDeg: 45 });
  const [envVariant, setEnvVariant] = useState<EnvVariant>("none");
  const [fullStateName, setFullStateName] = useState("");
  const [savedFullStates, setSavedFullStates] = useState<Record<string, FullVrmState>>({});
  const [customColors, setCustomColors] = useState<Record<string, string>>({
    tops: "#ffffff",
    bottoms: "#ffffff",
    hair: "#ffffff",
    body: "#ffffff",
    face: "#ffffff",
  });
  const [isSharingPose, setIsSharingPose] = useState(false);
  const [sharedPoses, setSharedPoses] = useState<SharedAsset[]>([]);
  const [sharedPosesStatus, setSharedPosesStatus] = useState<"idle" | "loading" | "error">("idle");
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
  const [wardrobeAutoHide, setWardrobeAutoHide] = useState(true);
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
  const trackingDataRef = useRef<VrmTrackingData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const loadRequestRef = useRef(0);
  const thumbnailRequestRef = useRef(0);
  const captureRef = useRef<CaptureState>({ camera: null, gl: null, scene: null });
  const panelScrollRef = useRef<HTMLDivElement>(null);

  const handlePanelTabChange = useCallback((tab: PanelTab) => {
    setActivePanelTab(tab);
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
  }, []);

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

  const handleViewportReady = useCallback((api: ViewportApi | null) => {
    viewportApiRef.current = api;
  }, []);

  const zoomViewport = useCallback((factor: number) => {
    viewportApiRef.current?.zoomBy(factor);
    setViewportHinted(true);
  }, []);

  const handleViewReset = useCallback(() => {
    setViewResetNonce((n) => n + 1);
    setViewportHinted(true);
  }, []);

  // 드래그 힌트는 모델이 준비되면 잠깐 보여 주고 일정 시간 뒤 자동으로 사라진다.
  useEffect(() => {
    if (!vrm || viewportHinted) return;
    const timer = setTimeout(() => setViewportHinted(true), 6000);
    return () => clearTimeout(timer);
  }, [vrm, viewportHinted]);

  // 현재 편집 상태를 직렬화 가능한 전체 스냅샷으로 캡처(undo 히스토리/공유와 동일 포맷).
  const captureFullState = useCallback(
    (): FullVrmState =>
      serializeFullVrmState({
        poseId: activePoseId,
        expressionId: activeExpressionId,
        bones: customBones,
        yOffset: customYOffset,
        expressionWeights,
        costume: costumeState,
        wardrobe: serializeWardrobe(wardrobeState),
        props: { items: vrmPropItems },
        physics: vrmPhysics,
        bodyScale,
        lighting,
        env: envVariant,
        fingerOverrides: fingerEdits,
      }),
    [activePoseId, activeExpressionId, customBones, customYOffset, expressionWeights, costumeState, wardrobeState, vrmPropItems, vrmPhysics, bodyScale, lighting, envVariant, fingerEdits]
  );

  const restoreHistoryAt = (index: number) => {
    const snap = historyRef.current[index];
    if (!snap) return;
    isRestoringRef.current = true;
    commitFullStateRestore(snap, vrmRef.current);
    setActivePoseId(snap.poseId ?? "default");
    setActiveExpressionId(snap.expressionId ?? "neutral");
    setCanUndo(index > 0);
    setCanRedo(index < historyRef.current.length - 1);
  };
  const doUndo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    restoreHistoryAt(historyIndexRef.current);
  };
  const doRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    restoreHistoryAt(historyIndexRef.current);
  };

  // 편집이 멈추면(디바운스) 스냅샷을 히스토리에 적재. 복원 중 변경은 건너뛴다.
  useEffect(() => {
    if (!vrm) return;
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const snap = JSON.parse(JSON.stringify(captureFullState())) as FullVrmState;
      const base = historyRef.current.slice(0, historyIndexRef.current + 1);
      const last = base[base.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
      base.push(snap);
      if (base.length > 60) base.shift();
      historyRef.current = base;
      historyIndexRef.current = base.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
    }, 450);
    return () => clearTimeout(timer);
  }, [vrm, captureFullState]);

  // 키보드 핸들러가 항상 최신 undo/redo를 호출하도록 ref 동기화(렌더 후).
  const undoRef = useRef(doUndo);
  const redoRef = useRef(doRedo);
  useEffect(() => {
    undoRef.current = doUndo;
    redoRef.current = doRedo;
  });

  // 키보드 단축키: Esc 닫기, ⌘/Ctrl+Z 되돌리기, ⌘/Ctrl+Shift+Z(또는 +Y) 다시 실행.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Note: VrmActor (inside Canvas) receives fingerEdits/bodyScale and applies via unified pipeline on prop changes.
  // Removed duplicate here to prevent double application on every render.

  const onCaptureUpdate = useCallback((state: CaptureState, cleanupGl?: THREE.WebGLRenderer | null) => {
    if (cleanupGl) {
      if (captureRef.current.gl === cleanupGl) {
        captureRef.current = { camera: null, gl: null, scene: null };
      }
    } else {
      captureRef.current = state;
    }
  }, []);
  const activeCamera = findCameraPreset(activeCameraId);
  // 포즈 검색 — 이름/분위기 기준 필터. 빈 검색이면 전체 노출.
  const poseQ = poseQuery.trim().toLowerCase();
  const poseMatches = (p: { label: string; tone?: string }) =>
    !poseQ || p.label.toLowerCase().includes(poseQ) || (p.tone?.toLowerCase().includes(poseQ) ?? false);
  const poseResultCount =
    POSE_PRESETS.filter(poseMatches).length +
    NATURAL_IDLE_POSES.filter(poseMatches).length +
    EXTRA_POSE_PRESETS.filter(poseMatches).length +
    savedPoses.filter(poseMatches).length;
  // 비활성 탭 섹션은 hidden 속성으로 숨겨 마운트는 유지(웹캠 video 등 ref 보존).
  // hidden 속성은 space-y 유틸의 :not([hidden]) 선택자에서 제외돼 간격도 자연 정리된다.
  const hideOnTab = (tab: PanelTab) => activePanelTab !== tab;
  const availableExpressionActions = getAvailableExpressionActions(vrm);
  const activeLibraryEntry = libraryEntries.find((entry) => entry.id === activeModelId) ?? null;
  const hasUploadedModels = libraryEntries.some((entry) => entry.source === "indexed-db");
  const displayModelName = vrm ? modelName : "";
  interface PendingPoseData {
    bones?: PoseBoneMap;
    yOffset?: number;
    expressionWeights?: Record<string, number>;
    customColors?: Record<string, string>;
    modelId?: string;
    modelName?: string;
    vrmProps?: unknown;
    costume?: unknown;
    wardrobe?: unknown;
    physics?: unknown;
    // new high-level state for restore on load
    bodyScale?: BodyScale;
    fingerOverrides?: FingerRotationMap;
    lighting?: LightingParams;
    env?: EnvVariant;
  }

  const pendingPoseDataRef = useRef<PendingPoseData | null>(null);

  useEffect(() => {
    if (open && initialDataUrl) {
      try {
        const hashIndex = initialDataUrl.indexOf("#");
        if (hashIndex !== -1) {
          const hashStr = initialDataUrl.substring(hashIndex + 1);
          const poseData = JSON.parse(decodeURIComponent(hashStr)) as PendingPoseData;
          pendingPoseDataRef.current = poseData;
          if (poseData.modelId) {
            setActiveModelId(poseData.modelId);
          }
        }
      } catch (e) {
        console.error("Failed to parse initial data URL", e);
      }
    } else if (!open) {
      pendingPoseDataRef.current = null;
    }
  }, [open, initialDataUrl]);

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
        setSavedFullStates(JSON.parse(fullStored));
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

  // webcamActive 를 ref 로 미러링 — visibilitychange 핸들러가 최신 값을 참조.
  useEffect(() => {
    webcamActiveRef.current = webcamActive;
  }, [webcamActive]);

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
      bones: customBones,
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
    setCustomBones(stripped);
    setCustomYOffset(pose.yOffset);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, { bones: stripped, yOffset: pose.yOffset, fingerEdits, bodyScale });
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

      setCustomBones(parsed.bones);
      setCustomYOffset(parsed.yOffset ?? 0);

      if (!preserveExpression && parsed.expressionWeights) {
        setExpressionWeights(parsed.expressionWeights);
        if (vrmRef.current) {
          applyExpressionWeightsToVrm(vrmRef.current, parsed.expressionWeights);
        }
      } else if (vrmRef.current) {
        applyExpressionWeightsToVrm(vrmRef.current, expressionWeights);
      }

      if (vrmRef.current) {
        applyPoseToVrm(vrmRef.current, parsed.bones, parsed.yOffset ?? 0);
      }

      alert("복사된 포즈를 성공적으로 붙여넣었습니다!");
    } catch (_e) {
      alert("포즈 붙여넣기에 실패했습니다. 데이터 형식을 확인해 주세요.");
    }
  }

  // 풀 스테이트 copy/paste + local save/load (새 기능)
  function handleCopyFullState() {
    try {
      const full: FullVrmState = serializeFullVrmState({ bones: customBones, yOffset: customYOffset, expressionWeights, costume: costumeState, wardrobe: serializeWardrobe(wardrobeState), props: {items: vrmPropItems}, physics: vrmPhysics, bodyScale, lighting, env: envVariant, fingerOverrides: fingerEdits });
      const json = JSON.stringify(full);
      navigator.clipboard.writeText(json).then(() => alert("전체 포저 상태 복사됨")).catch(() => { localStorage.setItem("studio_vrm_full_clip", json); alert("로컬에 전체 상태 저장"); });
    } catch { alert("전체 상태 복사 실패"); }
  }
  async function handlePasteFullState() {
    try {
      let json = ""; try { json = await navigator.clipboard.readText(); } catch { json = localStorage.getItem("studio_vrm_full_clip") || ""; }
      if (!json) return alert("전체 상태 데이터 없음");
      const s = JSON.parse(json) as FullVrmState;
      loadHandlers.handlePasteFullStateFromParsed(s);
      if (s && s.version === 2) alert("전체 상태 붙여넣기 OK");
    } catch { alert("붙여넣기 실패"); }
  }
  function handleSaveFullLocal() {
    const name = (fullStateName || `full-${Date.now()}`).slice(0,24);
    const full = serializeFullVrmState({bones:customBones, yOffset:customYOffset, expressionWeights, costume:costumeState, wardrobe: serializeWardrobe(wardrobeState), props:{items:vrmPropItems}, physics:vrmPhysics, bodyScale, lighting, env:envVariant, fingerOverrides:fingerEdits});
    const next = { ...savedFullStates, [name]: full };
    setSavedFullStates(next);
    localStorage.setItem("studio_vrm_full_states", JSON.stringify(next));
    setFullStateName(""); alert(`저장: ${name}`);
  }
  function commitFullStateRestore(s: FullVrmState, vrm: VRM | null) {
    const plan = planFullStateRestore(s);
    setCustomBones(plan.strippedBones);
    setCustomYOffset(plan.yOffset);
    setExpressionWeights(plan.expressionWeights);
    if (plan.bodyScale) setBodyScale(plan.bodyScale);
    if (plan.lighting) setLighting(plan.lighting);
    if (plan.env) setEnvVariant(plan.env);
    if (plan.fingerOverrides) setFingerEdits(plan.fingerOverrides);
    if (plan.costume && typeof plan.costume === "object") setCostumeState(plan.costume as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    setWardrobeState(parseWardrobe(plan.wardrobe)); // 워드로브는 무조건 반영 — undo/redo에서 장착 변화도 되돌린다.
    if (plan.propsItems) setVrmPropItems(plan.propsItems as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (plan.physics && typeof plan.physics === "object") setVrmPhysics(plan.physics as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    if (vrm) {
      const meshes = collectCostumeMeshes(vrm);
      applyFullState(vrm, s, {
        applyPose: (b, y) => applyPoseToVrm(vrm, b, y),
        applyExpr: (w) => applyExpressionWeightsToVrm(vrm, w),
        applyCostume: (c) => { setCostumeMeshes(meshes); applyCostumeState(meshes, c as any); }, // eslint-disable-line @typescript-eslint/no-explicit-any
        applyProps: (p: any) => { if (p?.items) { setVrmPropItems(p.items); } }, // eslint-disable-line @typescript-eslint/no-explicit-any
        applyPhysics: (p: any) => { if (p) { setVrmPhysics(p as any); if (countSpringBoneJoints(vrm)) { applyVrmSpringBonePhysics(vrm, p as any); settleVrmPhysics(vrm); } } }, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
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

  async function loadSharedPoses() {
    setSharedPosesStatus("loading");
    try {
      const assets = await listSharedAssets({ limit: 100 });
      const poses = assets.filter((asset) => asset.name.startsWith("[3D_POSE]") || asset.kind === "vrm_pose");
      setSharedPoses(poses);
      setSharedPosesStatus("idle");
    } catch (e) {
      console.error(e);
      setSharedPosesStatus("error");
    }
  }

  useEffect(() => {
    if (open) {
      loadSharedPoses();
    }
  }, [open]);

  async function handleSharePoseToServer() {
    const currentCapture = captureRef.current;
    const currentVrm = vrmRef.current;

    if (!currentCapture.gl || !currentCapture.scene || !currentCapture.camera || !currentVrm) {
      alert("공유할 VRM 장면이 아직 준비되지 않았습니다.");
      return;
    }

    const title = globalThis.prompt("서버에 공유할 포즈의 이름을 입력해주세요 (최대 30자):");
    if (!title) return;

    if (title.length > 30) {
      alert("이름은 최대 30자까지 가능합니다.");
      return;
    }

    const name = `[3D_POSE] ${title}`;

    setIsSharingPose(true);
    try {
      const { camera, gl, scene } = currentCapture;
      if (!physicsPreview && countSpringBoneJoints(currentVrm) > 0) {
        settleVrmPhysics(currentVrm);
      }
      currentVrm.update(0);
      gl.render(scene, camera);
      const baseDataUrl = gl.domElement.toDataURL("image/png");
      const { width, height } = roundExportSize(gl.domElement);

      const poseMetadata = {
        yOffset: customYOffset,
        bones: customBones,
        expressionWeights: expressionWeights,
        customColors: customColors,
        modelName: modelName,
        modelId: activeModelId,
        // full AC2 for uniform restore via commit
        bodyScale,
        fingerOverrides: fingerEdits,
        lighting,
        env: envVariant,
        // 옵셔널 — 기존 문서 하위호환(없으면 불러올 때 기본값).
        vrmProps: serializeVrmProps(vrmPropItems),
        costume: serializeCostume(costumeState),
        wardrobe: serializeWardrobe(wardrobeState),
        physics: vrmPhysics,
      };

      const hashPayload = encodeURIComponent(JSON.stringify(poseMetadata));
      const fullDataUrl = `${baseDataUrl}#${hashPayload}`;

      await publishAsset({
        name,
        dataUrl: fullDataUrl,
        width,
        height,
        kind: "vrm_pose"
      });

      alert("포즈가 성공적으로 서버에 공유되었습니다!");
      loadSharedPoses();
    } catch (e) {
      console.error(e);
      alert("포즈 공유에 실패했습니다.");
    } finally {
      setIsSharingPose(false);
    }
  }

  function handleSelectSharedPose(asset: SharedAsset) {
    const ok = loadHandlers.handleSelectSharedPose(asset);
    if (ok) {
      setActivePoseId(`shared-${asset.id}`);
      alert(`공유된 포즈 '${asset.name.replace("[3D_POSE] ", "")}'를 적용했습니다.`);
    }
  }

  async function handleDeleteSharedPose(asset: SharedAsset, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!globalThis.confirm(`공유된 포즈 '${asset.name.replace("[3D_POSE] ", "")}'를 서버에서 삭제하시겠습니까?`)) {
      return;
    }
    try {
      await deleteSharedAsset(asset.id);
      alert("공유된 포즈가 성공적으로 삭제되었습니다.");
      loadSharedPoses();
    } catch (err) {
      console.error(err);
      alert("삭제에 실패했습니다.");
    }
  }

  useEffect(() => {
    return () => {
      loadRequestRef.current += 1;
      if (vrmRef.current) {
        disposeVrm(vrmRef.current);
        vrmRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (open) return;
    loadRequestRef.current += 1;
    thumbnailRequestRef.current += 1;
    clearCurrentVrm();
    captureRef.current = { camera: null, gl: null, scene: null };
    setStatus("empty");
    setError("");
    setIsCapturing(false);
    setActiveProps([]);
    setPropAttachments({});
    setSelectedPropId(null);
    setVrmPropItems([]);
    setSelectedVrmPropUid(null);
    setCostumeState({ hidden: [], recolor: {} });
    setCostumeMeshes([]);
    setSelectedCostumeKey(null);
    setWardrobeState({});
    setWardrobeMetrics(null);
    setVrmPhysics(DEFAULT_VRM_PHYSICS);
    setPhysicsPreview(false);
    setSpringJointCount(0);
  }, [open]);

  const loadModelRef = useRef(loadModelFromLibraryEntry);
  loadModelRef.current = loadModelFromLibraryEntry;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLibraryStatus("loading");
    setLibraryError("");

    listVrmLibraryEntries()
      .then((entries) => {
        if (cancelled) return;
        setLibraryEntries(entries);
        setLibraryStatus("ready");
        
        let targetEntry = entries[0];
        const pending = pendingPoseDataRef.current;
        if (pending) {
          if (pending.modelId) {
            targetEntry = entries.find((e) => e.id === pending.modelId) || targetEntry;
          } else if (pending.modelName) {
            targetEntry = entries.find((e) => e.name === pending.modelName) || targetEntry;
          }
        } else {
          targetEntry = entries.find((entry) => entry.id === activeModelId) || targetEntry;
        }
        loadModelRef.current(targetEntry);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;
        setLibraryEntries(SAMPLE_VRM_ENTRIES);
        setLibraryStatus("error");
        setLibraryError(getErrorMessage(caughtError, "저장된 VRM 라이브러리를 불러오지 못했습니다."));
        
        let targetEntry = SAMPLE_VRM_ENTRIES[0];
        const pending = pendingPoseDataRef.current;
        if (pending) {
          if (pending.modelId) {
            targetEntry = SAMPLE_VRM_ENTRIES.find((e) => e.id === pending.modelId) || targetEntry;
          } else if (pending.modelName) {
            targetEntry = SAMPLE_VRM_ENTRIES.find((e) => e.name === pending.modelName) || targetEntry;
          }
        }
        loadModelRef.current(targetEntry);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeModelId]);

  useEffect(() => {
    if (!open || status !== "ready" || !vrm || !activeLibraryEntry || activeLibraryEntry.thumbnail) return;

    const requestId = thumbnailRequestRef.current + 1;
    thumbnailRequestRef.current = requestId;
    let secondFrame: number | null = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (requestId !== thumbnailRequestRef.current) return;

        const currentCapture = captureRef.current;
        if (!currentCapture.gl || !currentCapture.scene || !currentCapture.camera) return;

        currentCapture.gl.render(currentCapture.scene, currentCapture.camera);
        const thumbnail = createCharacterThumbnail(currentCapture.gl.domElement);
        if (!thumbnail) return;

        setLibraryEntries((entries) => entries.map((entry) => (entry.id === activeLibraryEntry.id ? { ...entry, thumbnail } : entry)));
        saveVrmThumbnail(activeLibraryEntry.id, thumbnail).catch((caughtError: unknown) => {
          setLibraryError(getErrorMessage(caughtError, "썸네일을 저장하지 못했습니다."));
        });
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) {
        cancelAnimationFrame(secondFrame);
      }
    };
  }, [activeLibraryEntry, open, status, vrm]);

  function clearCurrentVrm() {
    if (vrmRef.current) {
      disposeVrm(vrmRef.current);
      vrmRef.current = null;
    }
    setVrm(null);
  }

  function installVrm(nextVrm: VRM, nextModelName: string, nextModelId: string) {
    clearCurrentVrm();
    vrmRef.current = nextVrm;
    setVrm(nextVrm);
    setModelName(nextModelName);
    setActiveModelId(nextModelId);
    // 워드로브 실측 — 반드시 포즈 적용 전(정규화 rest)에 측정해 모델별 자동 핏의 기준으로 삼는다.
    setWardrobeMetrics(measureVrmWardrobeMetrics(nextVrm));

    const pending = pendingPoseDataRef.current;
    if (pending) {
      pendingPoseDataRef.current = null;

      const bones = pending.bones || {};
      const yOffset = typeof pending.yOffset === "number" ? pending.yOffset : 0;
      const expressionWeights = pending.expressionWeights || {};

      const pendingFull: FullVrmState = {
        version: 2,
        bones: bones,
        yOffset,
        expressionWeights,
        bodyScale: pending.bodyScale,
        fingerOverrides: pending.fingerOverrides,
        lighting: pending.lighting,
        env: pending.env,
        costume: pending.costume,
        wardrobe: pending.wardrobe,
        props: pending.vrmProps,
        physics: pending.physics,
      };
      commitFullStateRestore(pendingFull, nextVrm);
    } else {
      // 스폰 기본 포즈: T-포즈 대신 캐릭터 id로 결정되는 자연 아이들 포즈를 적용한다.
      const spawnPose = pickNaturalIdlePose(nextModelId);
      const strippedSpawn = stripFingerBones(spawnPose.bones);
      setActivePoseId(spawnPose.id);
      setCustomBones(strippedSpawn);
      setCustomYOffset(spawnPose.yOffset ?? 0);
      setActiveExpressionId("neutral");
      setExpressionWeights({});
      setBodyRotation(0);
      setCustomColors({
        tops: "#ffffff",
        bottoms: "#ffffff",
        hair: "#ffffff",
        body: "#ffffff",
        face: "#ffffff",
      });
      applyPoserVisualState(nextVrm, { bones: strippedSpawn, yOffset: spawnPose.yOffset ?? 0, fingerEdits, bodyScale });
      applyExpressionWeightsToVrm(nextVrm, {});
      applyVrmCustomColors(nextVrm, {
        tops: "#ffffff",
        bottoms: "#ffffff",
        hair: "#ffffff",
        body: "#ffffff",
        face: "#ffffff",
      });
      // 본 부착 소품·워드로브 초기화.
      setVrmPropItems([]);
      setSelectedVrmPropUid(null);
      setWardrobeState({});
      // 의상 메시 수집 + 상태 초기화.
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
    setStatus("ready");
  }

  function beginModelLoad(nextModelId: string) {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    thumbnailRequestRef.current += 1;
    setActiveModelId(nextModelId);
    setStatus("loading");
    setError("");
    clearCurrentVrm();
    return requestId;
  }

  function handleLoadFailure(requestId: number, caughtError: unknown) {
    if (requestId !== loadRequestRef.current) return;
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
        installVrm(loadedVrm, nextModelName, nextModelId);
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
      loadModelFromUrl(sampleVrmUrl(entry.id), entry.name, false, entry.id);
      return;
    }

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

  async function handleDeleteEntry(event: MouseEvent<HTMLButtonElement>, entry: VrmLibraryEntry) {
    event.stopPropagation();
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
    setActivePoseId(poseId);
    const pose = findPose(poseId);
    const strippedBones = stripFingerBones(pose.bones);
    setCustomBones(strippedBones);
    setCustomYOffset(pose.yOffset ?? 0);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, {
        bones: strippedBones,
        yOffset: pose.yOffset ?? 0,
        fingerEdits,
        bodyScale,
      });
      if (preserveExpression) {
        applyExpressionWeightsToVrm(vrmRef.current, expressionWeights);
      } else {
        setExpressionWeights({});
        setActiveExpressionId("neutral");
        applyExpressionWeightsToVrm(vrmRef.current, {});
      }
    }
  }

  // 포즈 좌우 반전 — 좌우 본을 맞바꾼다. 방향(aim) 본은 side 스왑만으로 자동 미러되고,
  // 절대 방향(Vec3)은 x 부호를, 회전(Euler) 본은 y·z 부호를 뒤집는다(YZ 평면 미러).
  function handleMirrorPose() {
    if (!vrm) return;
    const swapSide = (key: string): VRMHumanBoneName => {
      if (key.startsWith("left")) return ("right" + key.slice(4)) as VRMHumanBoneName;
      if (key.startsWith("right")) return ("left" + key.slice(5)) as VRMHumanBoneName;
      return key as VRMHumanBoneName;
    };
    const mirrorBone = (bone: PoseBone): PoseBone => {
      if (bone.direction) {
        if (Array.isArray(bone.direction)) {
          const dir = bone.direction;
          return { direction: [-dir[0], dir[1], dir[2]] as [number, number, number] };
        }
        // side-aware 방향은 부호(sideX)가 본 위치에 따라 자동 적용되므로 값 유지.
        return { direction: { ...bone.direction } };
      }
      const [x, y, z] = getPoseBoneRotation(bone);
      return { rotation: [x, -y, -z] };
    };
    const mirroredBones: PoseBoneMap = {};
    (Object.keys(customBones) as VRMHumanBoneName[]).forEach((key) => {
      const bone = customBones[key];
      if (bone) mirroredBones[swapSide(key)] = mirrorBone(bone);
    });
    const mirroredFingers: FingerRotationMap = {};
    (Object.keys(fingerEdits) as VRMHumanBoneName[]).forEach((key) => {
      const v = fingerEdits[key];
      if (!v) return;
      mirroredFingers[swapSide(key)] = [v[0], -v[1], -v[2]];
    });
    setCustomBones(mirroredBones);
    setFingerEdits(mirroredFingers);
    if (vrmRef.current) {
      applyPoserVisualState(vrmRef.current, { bones: mirroredBones, yOffset: customYOffset, fingerEdits: mirroredFingers, bodyScale });
    }
  }

  function handleBoneRotationChange(boneName: string, axisIndex: number, degrees: number) {
    if (!vrm) return;
    const radians = d(degrees);
    const key = boneName as VRMHumanBoneName;
    if (POSER_FINGER_BONES.includes(key)) {
      // Single source of truth: fingers go to fingerEdits only
      setFingerEdits((prev) => {
        const current = prev[key] ? [...prev[key]] as [number, number, number] : [0, 0, 0];
        current[axisIndex] = radians;
        return { ...prev, [key]: current };
      });
      return;
    }
    setCustomBones((prev) => {
      const current = [...getPoseBoneRotation(prev[key])] as [number, number, number];
      current[axisIndex] = radians;
      return { ...prev, [key]: { rotation: current } };
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
    setActiveExpressionId(`preset:${preset.id}`);
    const newWeights = { ...preset.weights };
    setExpressionWeights(newWeights);
    if (vrmRef.current) {
      applyExpressionWeightsToVrm(vrmRef.current, newWeights);
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
  function updateCostume(next: CostumeState) {
    setCostumeState(next);
    applyCostumeState(costumeMeshes, next);
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
  /** 워드로브 슬롯과 겹치는 기존(베이크드) 의상 메시 키 목록. */
  function costumeKeysForWardrobeSlot(slot: WardrobeSlot): string[] {
    const targets = WARDROBE_HIDE_COSTUME_SLOTS[slot];
    return costumeMeshes.filter((entry) => targets.includes(entry.slot)).map((entry) => entry.key);
  }

  function equipWardrobeItem(slot: WardrobeSlot, itemId: string | null) {
    const keys = costumeKeysForWardrobeSlot(slot);
    if (itemId) {
      const equip = createWardrobeEquip(itemId);
      if (!equip) return;
      setWardrobeState((prev) => ({ ...prev, [slot]: equip }));
      // 같은 부위의 기존 의상을 자동으로 숨겨 관통을 줄인다(의상 분리 UI에서 언제든 복원 가능).
      if (wardrobeAutoHide && keys.length) {
        updateCostume({ ...costumeState, hidden: Array.from(new Set([...costumeState.hidden, ...keys])) });
      }
    } else {
      setWardrobeState((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
      if (keys.length) {
        updateCostume({ ...costumeState, hidden: costumeState.hidden.filter((k) => !keys.includes(k)) });
      }
    }
  }

  function updateWardrobeEquip(slot: WardrobeSlot, patch: Partial<WardrobeEquip>) {
    setWardrobeState((prev) => {
      const current = prev[slot];
      if (!current) return prev;
      return { ...prev, [slot]: { ...current, ...patch } };
    });
  }

  function equipWardrobeSetById(setId: string) {
    const set = wardrobeSetById(setId);
    if (!set) return;
    const nextState = applyWardrobeSet(set);
    setWardrobeState(nextState);
    if (wardrobeAutoHide) {
      const keys = (Object.keys(nextState) as WardrobeSlot[]).flatMap((slot) => costumeKeysForWardrobeSlot(slot));
      if (keys.length) {
        updateCostume({ ...costumeState, hidden: Array.from(new Set([...costumeState.hidden, ...keys])) });
      }
    }
  }

  function clearWardrobe() {
    const keys = (Object.keys(wardrobeState) as WardrobeSlot[]).flatMap((slot) => costumeKeysForWardrobeSlot(slot));
    setWardrobeState({});
    if (keys.length) {
      updateCostume({ ...costumeState, hidden: costumeState.hidden.filter((k) => !keys.includes(k)) });
    }
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

  function handleInsert() {
    const currentCapture = captureRef.current;
    const currentVrm = vrmRef.current;

    if (!currentCapture.gl || !currentCapture.scene || !currentCapture.camera || !currentVrm) {
      setError("캡처할 VRM 장면이 아직 준비되지 않았습니다.");
      setStatus(vrmRef.current ? "ready" : "error");
      return;
    }

    const { camera, gl, scene } = currentCapture;
    setIsCapturing(true);
    requestAnimationFrame(() => {
      // 정지 컷: 캡처 직전 흔들림을 정착시켜 머리카락/치마가 가라앉은 프레임을 쓴다.
      if (!physicsPreview && countSpringBoneJoints(currentVrm) > 0) {
        settleVrmPhysics(currentVrm);
      }
      currentVrm.update(0);
      gl.render(scene, camera);
      const baseDataUrl = gl.domElement.toDataURL("image/png");
      const { width, height } = roundExportSize(gl.domElement);
      setIsCapturing(false);

      const poseMetadata = {
        yOffset: customYOffset,
        bones: customBones,
        expressionWeights: expressionWeights,
        customColors: customColors,
        modelName: modelName,
        modelId: activeModelId,
        vrmProps: serializeVrmProps(vrmPropItems),
        costume: serializeCostume(costumeState),
        wardrobe: serializeWardrobe(wardrobeState),
        physics: vrmPhysics,
      };
      const hashPayload = encodeURIComponent(JSON.stringify(poseMetadata));
      const fullDataUrl = `${baseDataUrl}#${hashPayload}`;

      onInsert(fullDataUrl, width, height);
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
      role="dialog"
      style={{
        // 노치/홈인디케이터 안전영역을 모달 바깥 패딩에 반영해 하단(웹캠/푸터)이 잘리지 않게 한다.
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex h-full max-h-full max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <UserRound size={14} aria-hidden />
              VRM 포저
            </p>
            <h2 className="mt-1 truncate text-lg font-bold tracking-tight text-fg sm:text-xl">3D 캐릭터 포즈 만들기</h2>
            <p className="mt-1 line-clamp-1 text-xs text-fg-3">
              {displayModelName ? `${displayModelName} · 투명 PNG로 패널에 추가` : "내 VRM을 불러와 투명 PNG로 패널에 추가"}
            </p>
          </div>
          <button type="button" aria-label="닫기" title="닫기 (Esc)" className={ICON_BUTTON} onClick={onClose}>
            <X size={17} aria-hidden />
          </button>
        </header>

        {/* 모바일: 뷰포트(상단)+컨트롤(하단) 두 행을 명시적으로 나눠 컨트롤 패널이 자체 스크롤되게 한다
            (행을 안 잡으면 패널이 모달 밖으로 흘러 하단의 웹캠/푸터가 잘림). 데스크톱(lg): 2단 컬럼. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,44dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1">
          <section className="relative min-h-0 overflow-hidden bg-card lg:min-h-0">
            <div
              aria-hidden
              className="absolute inset-0 opacity-80 [background-image:linear-gradient(45deg,oklch(0.75_0.01_80/0.16)_25%,transparent_25%),linear-gradient(-45deg,oklch(0.75_0.01_80/0.16)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,oklch(0.75_0.01_80/0.16)_75%),linear-gradient(-45deg,transparent_75%,oklch(0.75_0.01_80/0.16)_75%)] [background-position:0_0,0_12px,12px_-12px,-12px_0] [background-size:24px_24px]"
            />
            <div className="relative mx-auto flex h-full max-h-full min-h-0 w-full max-w-[min(82vw,720px)] items-center justify-center p-2 sm:p-5 lg:max-h-[calc(100dvh-12rem)] lg:min-h-[420px]">
              <div className="relative aspect-[9/13] h-full max-h-full min-h-0 w-auto overflow-hidden rounded-xl border border-line/80 bg-transparent shadow-[inset_0_0_0_1px_oklch(1_0_0/0.04)] lg:min-h-[390px]">
                <Canvas
                  camera={{ fov: activeCamera.fov, position: [...activeCamera.position], near: 0.1, far: 20 }}
                  className="h-full w-full"
                  dpr={[1, 2]}
                  gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
                  onCreated={({ gl }) => {
                    gl.setClearColor(0x000000, 0);
                    gl.setClearAlpha(0);
                  }}
                >
                  <CaptureBridge onCaptureUpdate={onCaptureUpdate} />
                  <CameraDirector presetId={activeCameraId} resetNonce={viewResetNonce} />
                  <ViewportController onReady={handleViewportReady} />
                  <VrmLighting tone={lightingTone} lighting={lighting} env={envVariant} />
                  {vrm ? (
                    <VrmActor
                      bodyRotation={bodyRotation}
                      customBones={customBones}
                      customYOffset={customYOffset}
                      expressionWeights={expressionWeights}
                      vrm={vrm}
                      customColors={customColors}
                      physicsPreview={physicsPreview}
                      webcamActive={webcamActive}
                      trackingDataRef={trackingDataRef}
                      idleAnimation={idleAnimation}
                      fingerEdits={fingerEdits}
                      bodyScale={bodyScale}
                    />
                  ) : null}
                  {vrm
                    ? vrmPropItems.map((item) => <VrmPropAttachment key={item.uid} vrm={vrm} instance={item} />)
                    : null}
                  {vrm && wardrobeMetrics
                    ? WARDROBE_SLOTS.map((slot) => {
                        const equip = wardrobeState[slot];
                        return equip ? <VrmWardrobeAttachment key={slot} vrm={vrm} equip={equip} metrics={wardrobeMetrics} /> : null;
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
                  <GroundShadow />
                  <OrbitControls
                    makeDefault
                    enableDamping
                    dampingFactor={0.08}
                    enablePan={false}
                    autoRotate={turntable}
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
                      <button
                        type="button"
                        aria-label="실행 취소"
                        title="실행 취소 (⌘Z)"
                        disabled={!canUndo}
                        className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                        onClick={doUndo}
                      >
                        <Undo2 size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="다시 실행"
                        title="다시 실행 (⌘⇧Z)"
                        disabled={!canRedo}
                        className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                        onClick={doRedo}
                      >
                        <Redo2 size={16} aria-hidden />
                      </button>
                    </div>
                    <div className="absolute right-2.5 top-2.5 z-10 flex flex-col gap-1.5">
                      <button type="button" aria-label="확대" title="확대" className={VIEWPORT_BTN} onClick={() => zoomViewport(0.82)}>
                        <ZoomIn size={16} aria-hidden />
                      </button>
                      <button type="button" aria-label="축소" title="축소" className={VIEWPORT_BTN} onClick={() => zoomViewport(1.22)}>
                        <ZoomOut size={16} aria-hidden />
                      </button>
                      <button type="button" aria-label="시점 초기화" title="시점 초기화" className={VIEWPORT_BTN} onClick={handleViewReset}>
                        <Maximize2 size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="턴테이블 회전"
                        title="턴테이블 회전"
                        aria-pressed={turntable}
                        className={cx(VIEWPORT_BTN, turntable && "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent")}
                        onClick={() => {
                          setTurntable((v) => !v);
                          setViewportHinted(true);
                        }}
                      >
                        <RotateCw size={16} aria-hidden className={turntable ? "animate-spin [animation-duration:3s]" : ""} />
                      </button>
                    </div>
                    {!viewportHinted ? (
                      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                        <span className="rounded-full border border-line/70 bg-panel/85 px-3 py-1 text-[0.66rem] font-medium text-fg-3 shadow-sm backdrop-blur">
                          끌어서 회전 · 휠·핀치로 확대/축소
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {status === "empty" ? (
                  <div className="absolute inset-0 grid place-items-center bg-card/50 p-6 text-center backdrop-blur-[1px]">
                    <div className="max-w-[22rem]">
                      <div className="mx-auto grid size-12 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
                        <Sparkles size={22} aria-hidden />
                      </div>
                      <p className="mt-4 text-sm font-bold text-fg">장르별 VRM 캐릭터를 올려 시작하세요.</p>
                      <p className="mt-2 text-xs leading-relaxed text-fg-3">
                        VRoid Studio에서 무료 애니메이션풍 캐릭터를 직접 만들고, 로맨스·판타지·액션 등 다양한 장르 캐릭터를 .vrm으로 업로드할 수 있습니다.
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <button type="button" className={cx(CONTROL_BUTTON, "border-accent/50 bg-accent text-on-accent")} onClick={() => fileInputRef.current?.click()}>
                          <Upload size={14} aria-hidden />
                          VRM 업로드
                        </button>
                        <button type="button" className={cx(CONTROL_BUTTON, "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")} onClick={handleSampleLoad}>
                          루미 불러오기
                        </button>
                      </div>
                      <div className="mt-5 space-y-1.5 rounded-xl border border-line bg-panel p-3 text-left text-xs shadow-sm">
                        <p className="font-semibold text-fg">VRM 캐릭터 만들기</p>
                        <ul className="list-disc list-inside text-fg-2 space-y-1 font-medium">
                          <li>
                            <a href="https://vroid.com/studio" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                              VRoid Studio (무료)
                            </a>
                            <span className="text-fg-3 font-normal"> - 3D 아바타 직접 디자인</span>
                          </li>
                          <li>
                            <a href="https://hub.vroid.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                              VRoid Hub
                            </a>
                            <span className="text-fg-3 font-normal"> - 무료 공유 모델 다운로드</span>
                          </li>
                          <li>
                            <a href="https://booth.pm/ko/search/VRM" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                              Booth (부스)
                            </a>
                            <span className="text-fg-3 font-normal"> - 하이퀄리티 만화/웹툰 에셋</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}

                {status === "loading" ? (
                  <div className="absolute inset-0 grid place-items-center bg-card/45 p-6 text-center backdrop-blur-sm">
                    <div>
                      <Loader2 className="mx-auto animate-spin text-accent" size={30} aria-hidden />
                      <p className="mt-3 text-sm font-semibold text-fg">VRM을 불러오는 중입니다.</p>
                    </div>
                  </div>
                ) : null}

                {status === "error" ? (
                  <div className="absolute inset-x-3 bottom-3 rounded-xl border border-line bg-panel/95 p-3 text-sm shadow-xl backdrop-blur">
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
                      "group flex flex-col items-center gap-1 rounded-xl border px-1 py-1.5 text-[0.66rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
            <div ref={panelScrollRef} id="vrm-panel-body" role="tabpanel" aria-labelledby={`vrm-tab-${activePanelTab}`} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <section hidden={hideOnTab("character")}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <Upload size={15} className="text-accent" aria-hidden />
                    캐릭터 라이브러리
                  </h3>
                  <span className="text-[0.68rem] text-fg-3">{libraryEntries.length}명</span>
                </div>
                <input ref={fileInputRef} accept=".vrm" className="sr-only" multiple type="file" onChange={handleFileChange} />
                <button
                  type="button"
                  className={cx(CONTROL_BUTTON, "w-full border-accent/50 bg-accent text-on-accent hover:bg-accent/90")}
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <Upload size={14} aria-hidden />}
                  VRM 업로드
                </button>
                <p className="mt-2 rounded-xl border border-line bg-card/60 px-3 py-2 text-xs leading-relaxed text-fg-3">
                  여러 .vrm 파일을 한 번에 올려 로맨스, 판타지, 학원물, 액션 등 장르별 캐릭터를 전환하세요. VRoid Studio에서 무료 애니메이션풍 VRM 캐릭터를 직접 만들 수 있습니다.
                </p>

                <div className="mt-3 rounded-xl border border-line bg-accent-soft/30 p-3">
                  <h4 className="flex items-center gap-1 text-xs font-bold text-accent">
                    <Sparkles size={13} aria-hidden />
                    무료 VRM 캐릭터 / 의상 / 악세사리 추천 사이트
                  </h4>
                  <p className="mt-1 text-[0.68rem] leading-normal text-fg-2">
                    아래 공식/커뮤니티 허브에서 무료 배포 모델을 다운로드해 보세요. 다운로드한 .vrm 파일을 ToonSpectrum에 자유롭게 추가할 수 있습니다.
                  </p>
                  <div className="mt-2.5 space-y-2">
                    <a
                      href="https://hub.vroid.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg hover:bg-raised transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[0.72rem] text-fg flex items-center gap-1">
                          VRoid Hub <ExternalLink size={10} className="opacity-60" />
                        </span>
                        <span className="text-[0.68rem] text-fg-3 truncate">
                          'Free' 태그가 달린 수많은 고품질 무료 3D 캐릭터 다운로드
                        </span>
                      </div>
                    </a>
                    <a
                      href="https://booth.pm/ko/search/VRM?max_price=0"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-fg hover:bg-raised transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-[0.72rem] text-fg flex items-center gap-1">
                          BOOTH (무료 VRM 아바타) <ExternalLink size={10} className="opacity-60" />
                        </span>
                        <span className="text-[0.68rem] text-fg-3 truncate">
                          의상, 헤어, 악세사리 등 3D 소스 무료 배포 카탈로그
                        </span>
                      </div>
                    </a>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-line bg-card/60 p-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <Paintbrush size={13} className="text-accent" aria-hidden />
                    나만의 캐릭터 만들기 (VRoid Studio)
                  </h4>
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-2">
                    VRoid Studio는 코딩이나 모델링 지식 없이도 얼굴, 헤어, 의상 등을 마우스 클릭과 드래그로 자유롭게 디자인할 수 있는 무료 3D 아바타 제작 도구입니다.
                  </p>
                  
                  <div className="mt-2.5 rounded-lg border border-line bg-panel p-2 text-[0.68rem] text-fg-3 space-y-1.5">
                    <div className="font-bold text-fg">💡 툰스펙트럼 적용 가이드:</div>
                    <ul className="list-decimal pl-3.5 space-y-1">
                      <li>PC/Mac 버전 VRoid Studio를 다운로드하여 설치합니다.</li>
                      <li>원하는 슬롯(얼굴, 체형, 헤어, 옷 등)의 프리셋을 골라 취향대로 커스텀합니다.</li>
                      <li>우측 상단 [내보내기(Export)] 아이콘 ➜ <span className="font-bold text-fg">Export as VRM</span>을 클릭합니다.</li>
                      <li>정보(이름, 라이선스 등)를 입력하고 내보낸 <span className="font-semibold text-accent">.vrm 파일</span>을 ToonSpectrum에 업로드해 보세요!</li>
                    </ul>
                  </div>

                  <a
                    href="https://vroid.com/studio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-raised px-2.5 py-1.5 text-[0.68rem] font-bold text-fg hover:bg-line transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    VRoid Studio 공식 다운로드 <ExternalLink size={10} className="opacity-70" />
                  </a>
                </div>

                {libraryStatus === "error" && libraryError ? (
                  <p className="mt-2 rounded-xl border border-line bg-card/70 px-3 py-2 text-xs leading-relaxed text-fg-3">
                    <AlertTriangle className="mr-1 inline align-[-2px] text-accent" size={14} aria-hidden />
                    {libraryError}
                  </p>
                ) : null}

                {!hasUploadedModels ? (
                  <div className="mt-3 rounded-xl border border-dashed border-line bg-card/45 px-3 py-3 text-xs leading-relaxed text-fg-3">
                    업로드한 캐릭터가 아직 없습니다. 루미로 바로 테스트하거나, 다양한 장르 캐릭터를 만들어 업로드하세요.
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {libraryStatus === "loading" ? (
                    <div className="col-span-2 rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3">저장된 캐릭터를 불러오는 중입니다.</div>
                  ) : null}

                  {libraryEntries.map((entry) => {
                    const isActive = entry.id === activeModelId;
                    const isDeleting = deletingModelId === entry.id;

                    return (
                      <div
                        key={entry.id}
                        className={cx(
                          "relative overflow-hidden rounded-xl border transition-colors",
                          isActive ? "border-accent/60 bg-accent-soft" : "border-line bg-card hover:bg-raised"
                        )}
                      >
                        <button
                          type="button"
                          className="grid min-h-[6.25rem] w-full grid-rows-[4.5rem_auto] gap-2 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                          disabled={status === "loading" && isActive}
                          onClick={() => loadModelFromLibraryEntry(entry)}
                        >
                          <span className="grid h-[4.5rem] place-items-center overflow-hidden rounded-lg border border-line/80 bg-panel">
                            {entry.thumbnail ? (
                              <img alt="" className="h-full w-full object-contain" src={entry.thumbnail} />
                            ) : (
                              <span className="grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3">
                                {entry.source === "sample" ? <WandSparkles size={17} aria-hidden /> : <UserRound size={17} aria-hidden />}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-fg">{entry.name}</span>
                            <span className={cx("mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[0.68rem] font-bold", isActive ? "bg-accent text-on-accent" : "bg-raised text-fg-3")}>
                              {entry.source === "sample" ? "번들" : "업로드"}
                            </span>
                          </span>
                        </button>

                        {entry.source === "indexed-db" ? (
                          <button
                            type="button"
                            aria-label={`${entry.name} 삭제`}
                            className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg border border-line bg-panel/90 text-fg-3 transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
                            disabled={isDeleting}
                            onClick={(event) => handleDeleteEntry(event, entry)}
                          >
                            {isDeleting ? <Loader2 className="animate-spin" size={13} aria-hidden /> : <Trash2 size={13} aria-hidden />}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

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
                          return (
                            <div key={name} className="flex items-center gap-2 text-[0.65rem] text-fg-3">
                              <span className="w-20 shrink-0 truncate font-semibold text-fg-2" title={action.label}>
                                {action.label}:
                              </span>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={weight}
                                disabled={!vrm}
                                className="h-2 flex-1 accent-accent"
                                onChange={(e) => updateExpressionWeight(name, Number(e.target.value))}
                              />
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
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <UserRound size={15} className="text-accent" aria-hidden />
                    포즈
                  </h3>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={!vrm}
                      onClick={handleMirrorPose}
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

                <label className="mb-3 flex items-center gap-2 text-xs text-fg-2 cursor-pointer bg-card/30 border border-line/50 p-2 rounded-lg hover:bg-raised/40 transition-colors">
                  <input
                    type="checkbox"
                    checked={preserveExpression}
                    onChange={(e) => setPreserveExpression(e.target.checked)}
                    className="size-3.5 accent-accent cursor-pointer"
                  />
                  <span className="font-medium">포즈 적용 시 캐릭터 표정 유지</span>
                </label>

                <div className="relative mb-3">
                  <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
                  <input
                    type="search"
                    value={poseQuery}
                    onChange={(e) => setPoseQuery(e.target.value)}
                    placeholder="포즈 검색 (이름 · 분위기)"
                    className="w-full rounded-lg border border-line bg-card py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                </div>
                {poseQ && poseResultCount === 0 ? (
                  <p className="rounded-xl border border-dashed border-line/55 bg-card/20 py-4 text-center text-[0.68rem] italic text-fg-3">
                    “{poseQuery}” 검색 결과가 없습니다.
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
                            className="w-full text-left focus:outline-none"
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

              <section hidden={hideOnTab("pose")} className="rounded-xl border border-line bg-card/45 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <Sparkles size={15} className="text-accent" aria-hidden />
                    서버 공유 포즈 라이브러리
                  </h3>
                  <button
                    type="button"
                    disabled={!vrm || isSharingPose}
                    onClick={handleSharePoseToServer}
                    className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent-soft/40 px-2 py-1 text-[0.68rem] font-bold text-accent hover:bg-accent-soft disabled:opacity-45"
                  >
                    {isSharingPose ? <Loader2 className="animate-spin" size={11} /> : <Upload size={11} />}
                    포즈 서버에 공유
                  </button>
                </div>
                <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                  다른 웹툰 작가들이 공유한 포즈를 내 캐릭터에 즉시 입히고, 나만의 멋진 포즈를 서버에 올려 공유하세요!
                </p>

                {sharedPosesStatus === "loading" && sharedPoses.length === 0 ? (
                  <div className="rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3">
                    공유된 포즈를 불러오는 중입니다...
                  </div>
                ) : sharedPoses.length === 0 ? (
                  <p className="text-center py-4 text-[0.68rem] text-fg-3/60 italic bg-card/20 rounded-xl border border-dashed border-line/55">
                    서버에 등록된 공유 포즈가 없습니다. 첫 포즈를 공유해 보세요!
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
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
                            className="w-full text-left focus:outline-none flex flex-col h-full justify-between"
                            disabled={!vrm}
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
              </section>

              <section hidden={hideOnTab("character")} className="rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Shirt size={14} className="text-accent" aria-hidden />
                  3D 의상 실장착
                  <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[0.68rem] font-bold text-accent">NEW</span>
                </h3>
                <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                  색만 바뀌는 게 아니라 실제 3D 옷·신발이 장착됩니다. 포즈를 바꿔도 몸을 따라 움직이고, 어떤 모델이든 체형에 맞게 자동 핏돼요.
                </p>

                {/* 원클릭 코디 세트 */}
                <div className="mb-3 space-y-1.5 border-b border-line/35 pb-3">
                  <p className="text-[0.65rem] font-bold text-fg-2">원클릭 코디 세트</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {WARDROBE_SETS.map((set) => (
                      <button
                        key={set.id}
                        type="button"
                        disabled={!vrm}
                        onClick={() => equipWardrobeSetById(set.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5 text-left text-[0.68rem] font-medium text-fg hover:bg-raised disabled:opacity-40 transition-colors cursor-pointer"
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
                    return (
                      <div key={slot} className="rounded-lg border border-line/60 bg-card/60 p-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <p className="text-[0.65rem] font-bold text-fg-2">
                            {WARDROBE_SLOT_LABELS[slot]}
                            {equippedDef ? <span className="ml-1 font-semibold text-accent">{equippedDef.label}</span> : null}
                          </p>
                          {equip ? (
                            <button
                              type="button"
                              onClick={() => equipWardrobeItem(slot, null)}
                              className="rounded-md px-1.5 py-0.5 text-[0.68rem] font-semibold text-fg-3 hover:bg-raised hover:text-bad"
                            >
                              해제
                            </button>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {wardrobeItemsBySlot(slot).map((item) => {
                            const active = equip?.itemId === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                disabled={!vrm}
                                aria-pressed={active}
                                title={item.hint}
                                onClick={() => equipWardrobeItem(slot, active ? null : item.id)}
                                className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[0.66rem] font-medium transition-colors cursor-pointer disabled:opacity-40 ${
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
                          <div className="mt-1.5 flex items-center gap-2.5">
                            <label className="flex items-center gap-1 text-[0.68rem] font-semibold text-fg-2">
                              색
                              <input
                                type="color"
                                value={equip.color}
                                onChange={(e) => updateWardrobeEquip(slot, { color: e.target.value })}
                                className="size-5 cursor-pointer rounded border border-line bg-transparent p-0"
                                aria-label={`${WARDROBE_SLOT_LABELS[slot]} 색상`}
                              />
                            </label>
                            <label className="flex flex-1 items-center gap-1.5 text-[0.68rem] font-semibold text-fg-2">
                              품
                              <input
                                type="range"
                                min={WARDROBE_FIT_MIN}
                                max={WARDROBE_FIT_MAX}
                                step={0.05}
                                value={equip.fit}
                                onChange={(e) => updateWardrobeEquip(slot, { fit: Number(e.target.value) })}
                                className="h-2 flex-1 accent-accent"
                                aria-label={`${WARDROBE_SLOT_LABELS[slot]} 품(핏)`}
                              />
                              <span className="w-8 text-right tabular-nums text-fg-3">{Math.round(equip.fit * 100)}%</span>
                            </label>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[0.68rem] font-medium text-fg-2">
                    <input
                      type="checkbox"
                      checked={wardrobeAutoHide}
                      onChange={(e) => setWardrobeAutoHide(e.target.checked)}
                      className="size-3.5 accent-accent"
                    />
                    같은 부위 기존 의상 자동 숨김
                  </label>
                  <button
                    type="button"
                    disabled={!vrm || Object.keys(wardrobeState).length === 0}
                    onClick={clearWardrobe}
                    className="rounded-lg border border-line bg-card px-2 py-1 text-[0.65rem] text-fg hover:bg-raised disabled:opacity-45"
                  >
                    전체 해제
                  </button>
                </div>
              </section>

              <section hidden={hideOnTab("character")} className="rounded-xl border border-line bg-card/45 p-3">
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
                    <div key={part.key} className="flex flex-col gap-1">
                      <span className="text-[0.65rem] font-semibold text-fg-2">{part.label}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={customColors[part.key] || "#ffffff"}
                          disabled={!vrm}
                          onChange={(e) => {
                            const hex = e.target.value;
                            setCustomColors((prev) => ({
                              ...prev,
                              [part.key]: hex,
                            }));
                          }}
                          className="size-6 cursor-pointer rounded border border-line bg-transparent p-0"
                        />
                        <input
                          type="text"
                          value={customColors[part.key] || "#ffffff"}
                          disabled={!vrm}
                          onChange={(e) => {
                            const hex = e.target.value;
                            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                              setCustomColors((prev) => ({
                                ...prev,
                                [part.key]: hex,
                              }));
                            }
                          }}
                          className="w-16 rounded border border-line bg-card px-1 py-0.5 text-[0.65rem] text-fg focus-visible:outline focus-visible:outline-accent"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-lg border border-line bg-card py-1.5 text-xs text-fg hover:bg-raised disabled:opacity-45"
                  disabled={!vrm}
                  onClick={() => {
                    setCustomColors({
                      tops: "#ffffff",
                      bottoms: "#ffffff",
                      hair: "#ffffff",
                      body: "#ffffff",
                      face: "#ffffff",
                    });
                  }}
                >
                  색상 초기화
                </button>
              </section>

              <section hidden={hideOnTab("pose")} className="rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Sliders size={14} className="text-accent" aria-hidden />
                  관절 미세 조정 (Manual Pose)
                </h3>
                
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

                      return (
                        <div key={boneName} className="rounded-lg border border-line/60 bg-panel/40 p-2.5">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="text-[0.7rem] font-bold text-fg-2">{label}</span>
                            <button
                              type="button"
                              className="text-[0.68rem] text-accent hover:underline animate-fade-in"
                              disabled={!vrm}
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
                          </div>
                          
                          <div className="flex items-center gap-2 text-[0.65rem] text-fg-3">
                            <span className="w-8 shrink-0">앞/뒤:</span>
                            <input
                              type="range"
                              min="-180"
                              max="180"
                              value={xDeg}
                              disabled={!vrm}
                              className="h-2 flex-1 accent-accent"
                              onChange={(e) => handleBoneRotationChange(boneName, 0, Number(e.target.value))}
                            />
                            <span className="w-8 text-right numeral">{xDeg}°</span>
                          </div>

                          <div className="mt-1.5 flex items-center gap-2 text-[0.65rem] text-fg-3">
                            <span className="w-8 shrink-0">뒤틀기:</span>
                            <input
                              type="range"
                              min="-180"
                              max="180"
                              value={yDeg}
                              disabled={!vrm}
                              className="h-2 flex-1 accent-accent"
                              onChange={(e) => handleBoneRotationChange(boneName, 1, Number(e.target.value))}
                            />
                            <span className="w-8 text-right numeral">{yDeg}°</span>
                          </div>

                          <div className="mt-1.5 flex items-center gap-2 text-[0.65rem] text-fg-3">
                            <span className="w-8 shrink-0">안/밖:</span>
                            <input
                              type="range"
                              min="-180"
                              max="180"
                              value={zDeg}
                              disabled={!vrm}
                              className="h-2 flex-1 accent-accent"
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
                    disabled={!vrm}
                    onClick={() => {
                      if (activePoseId.startsWith("custom-")) {
                        const pose = savedPoses.find((p) => p.id === activePoseId);
                        if (pose && vrmRef.current) {
                          const stripped = stripFingerBones(pose.bones);
                          setCustomBones(stripped);
                          setCustomYOffset(pose.yOffset);
                          if (pose.expressionWeights) {
                            setExpressionWeights(pose.expressionWeights);
                            applyExpressionWeightsToVrm(vrmRef.current, pose.expressionWeights);
                          }
                          applyPoserVisualState(vrmRef.current, { bones: stripped, yOffset: pose.yOffset, fingerEdits, bodyScale });
                        }
                      } else {
                        const pose = findPose(activePoseId);
                        if (vrmRef.current) {
                          const stripped = stripFingerBones(pose.bones);
                          setCustomBones(stripped);
                          setCustomYOffset(pose.yOffset ?? 0);
                          applyPoserVisualState(vrmRef.current, { bones: stripped, yOffset: pose.yOffset ?? 0, fingerEdits, bodyScale });
                        }
                      }
                    }}
                  >
                    현재 프리셋 포즈로 재설정
                  </button>
                </div>
              </section>

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
              </section>

              {/* ── 고도화 컨트롤 (body scale, lighting+, env, full state) ── */}
              <section hidden={hideOnTab("scene")} className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sliders size={15} className="text-accent" aria-hidden />
                  세부 조정 · 상태 저장
                </h3>
                <div className="space-y-3.5">
                  {/* 몸 비율 */}
                  <div className="space-y-1.5">
                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">몸 비율</p>
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-12 shrink-0 font-medium">키</span>
                      <input type="range" min="0.7" max="1.4" step="0.01" value={bodyScale.height} onChange={e => setBodyScale(s => ({...s, height: parseFloat(e.target.value)}))} className="h-2 flex-1 accent-accent" />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{bodyScale.height.toFixed(2)}×</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-fg-2">
                      <span className="w-12 shrink-0 font-medium">너비</span>
                      <input type="range" min="0.7" max="1.3" step="0.01" value={bodyScale.width} onChange={e => setBodyScale(s => ({...s, width: parseFloat(e.target.value)}))} className="h-2 flex-1 accent-accent" />
                      <span className="w-11 shrink-0 text-right tabular-nums text-fg-3">{bodyScale.width.toFixed(2)}×</span>
                    </label>
                  </div>

                  {/* 조명 미세 조정 */}
                  <div className="space-y-1.5 border-t border-line/45 pt-3">
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
                      <input value={fullStateName} onChange={e=>setFullStateName(e.target.value)} placeholder="상태 이름" className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
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
              </section>

              {/* ── 자연스러운 애니메이션 효과 ─────────────────────────── */}
              <section hidden={hideOnTab("pose")} className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  생동감 연출 (대기 모션)
                </h3>
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
              </section>

              {/* ── 본 부착 소품(손/머리/몸) ───────────────────────────── */}
              <section hidden={hideOnTab("props")} className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  소품 부착 (손·머리·몸)
                </h3>
                <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                  캐릭터의 손·머리·몸 관절에 소품을 부착합니다. 포즈를 바꿔도 관절을 따라 움직여요.
                </p>
                {(["hand", "head", "body"] as PropCategory[]).map((cat) => (
                  <div key={cat} className="mb-3">
                    <p className="mb-1.5 text-[0.65rem] font-bold text-fg-2">{VRM_PROP_CATEGORY_LABELS[cat]}</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {propsByCategory(cat).map((def) => (
                        <button
                          key={def.id}
                          type="button"
                          disabled={!vrm}
                          title={def.hint}
                          className="flex flex-col items-center gap-0.5 rounded-lg border border-line bg-card px-1 py-1.5 text-center text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-40 transition-colors"
                          onClick={() => addVrmProp(def.id)}
                        >
                          <span className="text-[0.68rem] font-semibold leading-tight">{def.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {vrmPropItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line/70 bg-card/40 px-2.5 py-2 text-[0.68rem] text-fg-3">
                    부착된 소품이 없습니다. 위에서 소품을 눌러 추가하세요.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[0.65rem] font-bold text-fg-2">부착된 소품 ({vrmPropItems.length})</p>
                      <button
                        type="button"
                        className="text-[0.68rem] text-fg-3 hover:underline"
                        onClick={() => {
                          setVrmPropItems([]);
                          setSelectedVrmPropUid(null);
                        }}
                      >
                        전체 제거
                      </button>
                    </div>
                    {vrmPropItems.map((item) => {
                      const def = propDefById(item.propId);
                      const isOpen = selectedVrmPropUid === item.uid;
                      return (
                        <div key={item.uid} className="rounded-lg border border-line bg-card/60">
                          <div className="flex items-center gap-1.5 px-2 py-1.5">
                            <button
                              type="button"
                              className="flex-1 text-left text-[0.68rem] font-semibold text-fg"
                              onClick={() => setSelectedVrmPropUid(isOpen ? null : item.uid)}
                            >
                              {def?.label ?? item.propId}
                              <span className="ml-1 text-[0.64rem] font-normal text-fg-3">
                                · {PROP_BONE_LABELS[item.bone]}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="rounded p-1 text-fg-3 hover:bg-raised hover:text-bad"
                              title="제거"
                              onClick={() => removeVrmProp(item.uid)}
                            >
                              <Trash2 size={13} aria-hidden />
                            </button>
                          </div>
                          {isOpen && (
                            <div className="space-y-2.5 border-t border-line/40 px-2.5 py-2.5">
                              <div>
                                <label htmlFor={`vrm-prop-bone-${item.uid}`} className="mb-1 block text-[0.68rem] font-semibold text-fg-2">부착 부위</label>
                                <select
                                  id={`vrm-prop-bone-${item.uid}`}
                                  className="w-full rounded-lg border border-line bg-card px-2 py-1 text-[0.68rem] text-fg"
                                  value={item.bone}
                                  onChange={(e) => updateVrmProp(item.uid, { bone: e.target.value as PropAttachBone })}
                                >
                                  {PROP_ATTACH_BONES.map((b) => (
                                    <option key={b} value={b}>{PROP_BONE_LABELS[b]}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <p className="mb-1 text-[0.66rem] font-semibold text-fg-3">위치 (X / Y / Z)</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {([0, 1, 2] as const).map((axis) => (
                                    <label key={axis} className="block text-[0.68rem] text-fg-3">
                                      {"XYZ"[axis]}: {item.position[axis].toFixed(2)}
                                      <input
                                        type="range" min="-0.5" max="0.5" step="0.01"
                                        className="w-full accent-accent h-2"
                                        value={item.position[axis]}
                                        onChange={(e) => {
                                          const next = [...item.position] as [number, number, number];
                                          next[axis] = Number(e.target.value);
                                          updateVrmProp(item.uid, { position: next });
                                        }}
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="mb-1 text-[0.66rem] font-semibold text-fg-3">회전 (도)</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {([0, 1, 2] as const).map((axis) => (
                                    <label key={axis} className="block text-[0.68rem] text-fg-3">
                                      {"XYZ"[axis]}: {Math.round(item.rotationDeg[axis])}°
                                      <input
                                        type="range" min="-180" max="180"
                                        className="w-full accent-accent h-2"
                                        value={item.rotationDeg[axis]}
                                        onChange={(e) => {
                                          const next = [...item.rotationDeg] as [number, number, number];
                                          next[axis] = Number(e.target.value);
                                          updateVrmProp(item.uid, { rotationDeg: next });
                                        }}
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <label className="flex-1 text-[0.66rem] text-fg-3">
                                  크기 {item.scale.toFixed(1)}x
                                  <input
                                    type="range" min="0.2" max="4" step="0.1"
                                    className="w-full accent-accent h-2"
                                    value={item.scale}
                                    onChange={(e) => updateVrmProp(item.uid, { scale: Number(e.target.value) })}
                                  />
                                </label>
                                {item.color !== null && (
                                  <label className="flex flex-col items-center gap-0.5 text-[0.68rem] text-fg-3">
                                    색상
                                    <input
                                      type="color"
                                      value={item.color}
                                      onChange={(e) => updateVrmProp(item.uid, { color: e.target.value })}
                                      className="size-6 cursor-pointer rounded border border-line bg-transparent p-0"
                                    />
                                  </label>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* ── 의상 분리 토글 / 리컬러 ─────────────────────────────── */}
              <section hidden={hideOnTab("character")} className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sliders size={15} className="text-accent" aria-hidden />
                  의상 분리 · 부분 채색
                </h3>
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
                              const recolor = costumeState.recolor[entry.key];
                              const isOpen = selectedCostumeKey === entry.key;
                              return (
                                <div key={entry.key} className="rounded-lg border border-line bg-card/60 px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      className={cx(
                                        "rounded px-1.5 py-0.5 text-[0.64rem] font-semibold transition-colors",
                                        hidden ? "bg-card text-fg-3 line-through" : "bg-accent-soft text-accent"
                                      )}
                                      onClick={() => toggleCostumeMesh(entry.key)}
                                    >
                                      {hidden ? "숨김" : "표시"}
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
              </section>

              {/* ── 흔들림 물리(스프링본) ──────────────────────────────── */}
              <section hidden={hideOnTab("scene")} className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <WandSparkles size={15} className="text-accent" aria-hidden />
                  흔들림 물리 (머리카락·치마)
                </h3>
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
              </section>

              {/* ── 웹캠 실시간 페이스 트래킹 ───────────────────────────── */}
              <section hidden={hideOnTab("face")} className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Webcam size={15} className="text-accent" aria-hidden />
                  웹캠 실시간 페이스 트래킹
                </h3>
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
                                    : `로컬 개발 시 http://localhost:5173 (또는 현재 dev 서버)로 직접 접속. 운영 환경은 HTTPS(${window.location.hostname.includes(".") ? "현재 도메인" : "https://toonspectrum.vercel.app/studio"})로 접속하세요.`
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
                                <li>이 사이트 <strong>정확한 주소</strong>(https://toonspectrum.vercel.app) 에서 브라우저 '자물쇠' → 카메라 '허용' (localhost와 별개)</li>
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
                            <div className="flex items-center justify-between text-[0.68rem] text-fg-2">
                              <span>거울 모드 (좌우 반전)</span>
                              <input
                                type="checkbox"
                                className="accent-accent"
                                checked={trackingOptions.mirrorMode}
                                onChange={(e) =>
                                  setTrackingOptions((prev: TrackingOptions) => ({ ...prev, mirrorMode: e.target.checked }))
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between text-[0.68rem] text-fg-2">
                              <span>시선 고정 (정면 바라보기)</span>
                              <input
                                type="checkbox"
                                className="accent-accent"
                                checked={trackingOptions.gazeLock}
                                onChange={(e) =>
                                  setTrackingOptions((prev: TrackingOptions) => ({ ...prev, gazeLock: e.target.checked }))
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between text-[0.68rem] text-fg-2">
                              <span>손가락 추적 (재시작 시 적용)</span>
                              <input
                                type="checkbox"
                                className="accent-accent"
                                checked={trackingOptions.fingerTracking}
                                onChange={(e) =>
                                  setTrackingOptions((prev: TrackingOptions) => ({ ...prev, fingerTracking: e.target.checked }))
                                }
                              />
                            </div>
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
              </section>

              <section hidden={hideOnTab("props")} className="mt-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  3D 소품 · 동물 배치
                </h3>
                <p className="mb-3 text-[0.68rem] leading-relaxed text-fg-3">
                  캐릭터 주변에 귀여운 동물이나 소품을 추가해 보세요. 여러 개를 동시에 배치할 수 있습니다.
                </p>
                {(["animal", "item", "effect"] as const).map((cat) => {
                  const items = SCENE_PROPS.filter((p) => p.category === cat);
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
                              className={cx(
                                "flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors relative",
                                isActive
                                  ? isSelected
                                    ? "border-accent bg-accent text-on-accent ring-2 ring-accent/40"
                                    : "border-accent/60 bg-accent-soft text-accent ring-1 ring-accent/30"
                                  : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                              )}
                              onClick={() => {
                                setActiveProps((prev) => {
                                  const wasActive = prev.includes(prop.id);
                                  if (wasActive) {
                                    if (selectedPropId === prop.id) setSelectedPropId(null);
                                    return prev.filter((id) => id !== prop.id);
                                  } else {
                                    setSelectedPropId(prop.id);
                                    return [...prev, prop.id];
                                  }
                                });
                              }}
                            >
                              <span className="text-base leading-none">{prop.emoji}</span>
                              <span className="text-[0.68rem] font-semibold leading-tight">{prop.label}</span>
                              {isActive && (
                                <span 
                                  className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent"
                                  title="클릭하여 장착/위치 세부설정"
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
                    모든 소품 제거
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
                    <div className="mt-3 rounded-xl border border-accent/40 bg-accent-soft/20 p-3 space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-accent flex items-center gap-1">
                          <span>{prop.emoji}</span>
                          <span>{prop.label} 장착 및 위치 설정</span>
                        </span>
                        <button
                          type="button"
                          className="text-[0.68rem] text-fg-3 hover:underline"
                          onClick={() => setSelectedPropId(null)}
                        >
                          설정 닫기
                        </button>
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

                      {config.bone !== "none" && (
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
              </section>
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
              <button type="button" className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")} onClick={onClose}>
                닫기
              </button>
              <button
                type="button"
                className={cx(CONTROL_BUTTON, "min-w-36 border-accent/60 bg-accent text-on-accent hover:bg-accent/90")}
                disabled={!vrm || status === "loading" || isCapturing}
                onClick={handleInsert}
              >
                {isCapturing ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                이 포즈로 추가
              </button>
            </footer>
          </aside>
        </div>
      </div>
    </div>
  );
}
