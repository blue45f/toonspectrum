import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Canvas, useFrame, useThree, createPortal } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { AlertTriangle, Camera, ImagePlus, Loader2, RotateCcw, Sliders, Sparkles, Trash2, Upload, UserRound, WandSparkles, X } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
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
import {
  publishAsset,
  listSharedAssets,
  deleteSharedAsset,
  type SharedAsset,
} from "../../lib/creator-client";
import { EXPRESSION_PRESETS, EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES, pickNaturalIdlePose, type StudioExpressionPreset } from "./studio-pose-presets";
import {
  PROP_ATTACH_BONES,
  PROP_BONE_LABELS,
  PROP_CATEGORY_LABELS as VRM_PROP_CATEGORY_LABELS,
  propsByCategory,
  createPropInstance,
  parseVrmProps,
  serializeVrmProps,
  buildPropObject,
  propDefById,
  type PropInstance,
  type PropAttachBone,
  type PropCategory,
} from "./studio-vrm-props";
import {
  classifyMeshName,
  COSTUME_SLOT_LABELS,
  COSTUME_PALETTES,
  tintColor,
  parseCostumeState,
  serializeCostume,
  type CostumeState,
  type CostumeSlot,
} from "./studio-vrm-costume";
import {
  parseVrmPhysicsSettings,
  DEFAULT_VRM_PHYSICS,
  applyVrmSpringBonePhysics,
  settleVrmPhysics,
  countSpringBoneJoints,
  PHYSICS_PREVIEW_MAX_DELTA,
  type VrmPhysicsSettings,
} from "./studio-vrm-physics";

type StudioVrmPoserProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (pngDataUrl: string, width: number, height: number) => void;
};

type LoadStatus = "empty" | "loading" | "ready" | "error";
type LibraryStatus = "loading" | "ready" | "error";
type Vec3 = readonly [number, number, number];
type SideAwareDirection = {
  sideX: number;
  y: number;
  z?: number;
};
type DirectionTarget = Vec3 | SideAwareDirection;
type PoseBone = {
  direction?: DirectionTarget;
  rotation?: Vec3;
};
type PoseBoneMap = Partial<Record<VRMHumanBoneName, PoseBone>>;
type CaptureState = {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
};

type PosePreset = {
  id: string;
  label: string;
  tone: string;
  yOffset?: number;
  bones: PoseBoneMap;
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
];

const BASE_ROTATION_Y_KEY = "studioVrmBaseRotationY";
const EXPORT_HEIGHT = 520;
const FALLBACK_EXPORT_WIDTH = 360;
const THUMBNAIL_WIDTH = 72;
const THUMBNAIL_HEIGHT = 96;
const d = THREE.MathUtils.degToRad;
const HTML_FALLBACK_VRM_ERROR = "VRM 파일 대신 웹 페이지가 응답했습니다. 배포에 해당 .vrm 파일이 포함되어 있는지 확인해 주세요.";

const CONTROL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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

function aim(sideX: number, y: number, z = 0): PoseBone {
  return { direction: { sideX, y, z } };
}

function rotate(rotation: Vec3): PoseBone {
  return { rotation };
}

const NATURAL_LIMBS: PoseBoneMap = {
  leftUpperArm: aim(0.35, -0.94),
  rightUpperArm: aim(0.35, -0.94),
  leftLowerArm: aim(0.2, -0.98),
  rightLowerArm: aim(0.2, -0.98),
  leftHand: rotate([0, 0, d(2)]),
  rightHand: rotate([0, 0, d(-2)]),
  leftUpperLeg: aim(0.08, -1),
  rightUpperLeg: aim(0.08, -1),
  leftLowerLeg: aim(0.03, -1),
  rightLowerLeg: aim(0.03, -1),
  leftFoot: rotate([0, 0, 0]),
  rightFoot: rotate([0, 0, 0]),
};

function naturalPose(core: PoseBoneMap = {}) {
  return { ...NATURAL_LIMBS, ...core };
}

export const POSE_PRESETS: PosePreset[] = [
  {
    id: "default",
    label: "기본",
    tone: "편한 스탠딩",
    bones: naturalPose({
      hips: rotate([0, d(1), d(1.5)]),
      spine: rotate([d(1), d(-1), d(-1)]),
      chest: rotate([d(-1), d(-1), d(-0.5)]),
      neck: rotate([d(1), d(1), 0]),
      head: rotate([d(-1), d(-2), d(1.5)]),
      leftShoulder: rotate([0, 0, d(-3.5)]),
      rightShoulder: rotate([0, 0, d(3)]),
      leftUpperArm: aim(0.31, -0.95, -0.02),
      rightUpperArm: aim(0.37, -0.93, 0.04),
      leftLowerArm: aim(0.17, -0.97, 0.18),
      rightLowerArm: aim(0.21, -0.95, 0.24),
      leftHand: rotate([0, d(2), d(5)]),
      rightHand: rotate([0, d(-3), d(-6)]),
      leftUpperLeg: aim(0.06, -1, -0.01),
      rightUpperLeg: aim(0.11, -0.99, 0.06),
      leftLowerLeg: aim(0.02, -1, 0.01),
      rightLowerLeg: aim(0.05, -0.98, -0.09),
      leftFoot: rotate([0, d(-2), 0]),
      rightFoot: rotate([d(1), d(5), 0]),
    }),
  },
  {
    id: "wave",
    label: "손인사",
    tone: "반가운 손짓",
    bones: naturalPose({
      spine: rotate([d(-1), d(-2), 0]),
      chest: rotate([d(1), d(-3), 0]),
      head: rotate([d(-2), d(3), d(3)]),
      rightUpperArm: aim(0.48, 0.66, 0.08),
      rightLowerArm: aim(0.18, 0.96, 0.1),
      rightHand: rotate([0, 0, d(-15)]),
    }),
  },
  {
    id: "point",
    label: "대화",
    tone: "자연스러운 대화",
    bones: naturalPose({
      hips: rotate([0, d(-2), 0]),
      spine: rotate([d(-1), d(3), 0]),
      chest: rotate([d(1), d(4), 0]),
      head: rotate([d(-1), d(-4), 0]),
      rightUpperArm: aim(0.62, -0.12, 0.28),
      rightLowerArm: aim(0.3, 0.05, 0.95),
      rightHand: rotate([0, d(-10), d(-10)]),
    }),
  },
  {
    id: "cheer",
    label: "기쁨",
    tone: "만세 포즈",
    bones: naturalPose({
      hips: rotate([d(-1), 0, 0]),
      spine: rotate([d(-3), 0, 0]),
      chest: rotate([d(4), 0, 0]),
      head: rotate([d(-6), 0, 0]),
      leftUpperArm: aim(0.55, 0.83),
      leftLowerArm: aim(0.22, 0.97),
      rightUpperArm: aim(0.55, 0.83),
      rightLowerArm: aim(0.22, 0.97),
    }),
  },
  {
    id: "think",
    label: "생각",
    tone: "고민 컷",
    bones: naturalPose({
      hips: rotate([0, d(2), 0]),
      spine: rotate([d(3), d(-3), 0]),
      chest: rotate([d(1), d(-4), 0]),
      neck: rotate([d(1), d(3), 0]),
      head: rotate([d(6), d(-4), d(-4)]),
      rightUpperArm: aim(0.38, -0.25, 0.25),
      rightLowerArm: aim(-0.28, 0.55, 0.78),
      rightHand: rotate([d(15), d(10), d(-15)]),
    }),
  },
  {
    id: "sit",
    label: "앉기",
    tone: "낮은 자세",
    yOffset: -0.08,
    bones: naturalPose({
      hips: rotate([d(-4), d(2), d(1)]),
      spine: rotate([d(4), d(-1), d(-1)]),
      chest: rotate([d(-1), d(-1), 0]),
      head: rotate([d(-2), d(3), d(1.5)]),
      leftShoulder: rotate([0, 0, d(-3)]),
      rightShoulder: rotate([0, 0, d(2.5)]),
      leftUpperLeg: aim(0.15, -0.26, 0.95),
      rightUpperLeg: aim(0.1, -0.3, 0.94),
      leftLowerLeg: aim(0.07, -0.86, -0.48),
      rightLowerLeg: aim(0.04, -0.9, -0.42),
      leftFoot: rotate([d(-4), d(-2), d(1)]),
      rightFoot: rotate([d(-3), d(3), d(-1)]),
    }),
  },
  {
    id: "run",
    label: "걷기",
    tone: "한 걸음",
    yOffset: -0.01,
    bones: naturalPose({
      hips: rotate([d(-2), d(-3), 0]),
      spine: rotate([d(3), d(2), 0]),
      chest: rotate([d(-1), d(2), 0]),
      head: rotate([d(-2), d(-3), 0]),
      leftUpperArm: aim(0.32, -0.75, -0.55),
      leftLowerArm: aim(0.18, -0.85, -0.48),
      rightUpperArm: aim(0.32, -0.65, 0.68),
      rightLowerArm: aim(0.18, -0.8, 0.56),
      leftUpperLeg: aim(0.08, -0.55, 0.83),
      leftLowerLeg: aim(0.03, -0.96, 0.25),
      rightUpperLeg: aim(0.08, -0.72, -0.7),
      rightLowerLeg: aim(0.03, -0.9, 0.44),
    }),
  },
  {
    id: "present",
    label: "설명",
    tone: "차분한 안내",
    bones: naturalPose({
      hips: rotate([0, d(3), 0]),
      spine: rotate([d(-1), d(-3), 0]),
      chest: rotate([d(1), d(-4), 0]),
      head: rotate([d(-1), d(4), 0]),
      rightUpperArm: aim(0.48, -0.2, 0.55),
      rightLowerArm: aim(0.18, 0.05, 0.98),
      rightHand: rotate([0, d(-10), d(-10)]),
    }),
  },
  {
    id: "support",
    label: "응원",
    tone: "화이팅 응원",
    bones: naturalPose({
      hips: rotate([d(-1), d(-2), 0]),
      spine: rotate([d(-3), d(2), 0]),
      chest: rotate([d(4), d(2), 0]),
      head: rotate([d(-2), d(-1), 0]),
      leftUpperArm: aim(0.42, 0.9),
      leftLowerArm: aim(0.1, 0.99),
      leftHand: rotate([0, 0, d(10)]),
      rightUpperArm: aim(0.42, 0.9),
      rightLowerArm: aim(0.1, 0.99),
      rightHand: rotate([0, 0, d(-10)]),
    }),
  },
  {
    id: "despair",
    label: "낙담",
    tone: "차분한 저점",
    yOffset: -0.03,
    bones: naturalPose({
      hips: rotate([d(4), d(1), 0]),
      spine: rotate([d(8), d(-1), d(1)]),
      chest: rotate([d(6), 0, d(-1)]),
      neck: rotate([d(8), d(1), 0]),
      head: rotate([d(6), d(-2), d(2)]),
      leftShoulder: rotate([0, 0, d(-5)]),
      rightShoulder: rotate([0, 0, d(4)]),
      leftUpperArm: aim(0.3, -0.95, 0.08),
      rightUpperArm: aim(0.26, -0.96, 0.04),
      leftLowerArm: aim(0.14, -0.98, 0.06),
      rightLowerArm: aim(0.1, -0.99, 0.02),
      leftHand: rotate([d(5), d(2), d(3)]),
      rightHand: rotate([d(3), d(-1), d(-2)]),
    }),
  },
  {
    id: "attack",
    label: "준비",
    tone: "대치 상태",
    yOffset: -0.02,
    bones: naturalPose({
      hips: rotate([d(-4), d(-6), 0]),
      spine: rotate([d(4), d(4), 0]),
      chest: rotate([d(-1), d(4), 0]),
      head: rotate([d(-3), d(-5), 0]),
      leftUpperArm: aim(0.52, 0.08, 0.58),
      leftLowerArm: aim(0.22, 0.13, 0.96),
      rightUpperArm: aim(0.48, 0.02, 0.52),
      rightLowerArm: aim(0.18, 0.07, 0.98),
      leftUpperLeg: aim(0.1, -0.7, 0.7),
      rightUpperLeg: aim(0.1, -0.82, -0.56),
    }),
  },
  {
    id: "defense",
    label: "방어",
    tone: "조심스러운 자세",
    yOffset: -0.02,
    bones: naturalPose({
      hips: rotate([d(-3), d(4), 0]),
      spine: rotate([d(3), d(-4), 0]),
      chest: rotate([d(2), d(-5), 0]),
      head: rotate([d(-2), d(5), 0]),
      leftUpperArm: aim(0.6, 0.3, 0.33),
      leftLowerArm: aim(0.2, 0.72, 0.66),
      rightUpperArm: aim(0.56, 0.25, 0.38),
      rightLowerArm: aim(0.16, 0.68, 0.7),
      leftUpperLeg: aim(0.1, -0.88, 0.46),
      rightUpperLeg: aim(0.1, -0.9, -0.42),
    }),
  },
  {
    id: "peace",
    label: "브이",
    tone: "셀카 포즈",
    bones: naturalPose({
      hips: rotate([0, d(-4), 0]),
      spine: rotate([d(2), d(4), 0]),
      chest: rotate([d(-1), d(4), d(2)]),
      head: rotate([d(4), d(-8), d(-5)]),
      rightUpperArm: aim(0.4, 0.58, 0.35),
      rightLowerArm: aim(0.1, 0.82, 0.55),
      rightHand: rotate([0, 0, d(-15)]),
    }),
  },
  {
    id: "fist",
    label: "화이팅",
    tone: "결의 컷",
    bones: naturalPose({
      hips: rotate([d(-2), d(4), 0]),
      spine: rotate([d(-3), 0, 0]),
      chest: rotate([d(5), 0, 0]),
      head: rotate([d(-3), d(-4), 0]),
      rightUpperArm: aim(0.35, 0.93, 0.05),
      rightLowerArm: aim(0.08, 0.99, 0.02),
      rightHand: rotate([0, 0, 0]),
    }),
  },
  {
    id: "flying",
    label: "비상",
    tone: "날아오르기",
    yOffset: 0.14,
    bones: naturalPose({
      hips: rotate([d(45), 0, 0]),
      spine: rotate([d(-12), 0, 0]),
      chest: rotate([d(-5), 0, 0]),
      head: rotate([d(-10), 0, 0]),
      leftUpperArm: aim(0.74, 0.53, -0.4),
      rightUpperArm: aim(0.7, 0.57, -0.44),
      leftLowerArm: aim(0.57, 0.7, -0.4),
      rightLowerArm: aim(0.53, 0.74, -0.44),
      leftUpperLeg: aim(0.13, -0.43, -0.89),
      rightUpperLeg: aim(0.11, -0.47, -0.87),
      leftLowerLeg: aim(0.07, -0.78, -0.62),
      rightLowerLeg: aim(0.05, -0.82, -0.58),
    }),
  },
  {
    id: "heart",
    label: "하트",
    tone: "볼하트 연출",
    bones: naturalPose({
      hips: rotate([0, d(3), 0]),
      spine: rotate([d(2), 0, 0]),
      chest: rotate([d(-2), 0, 0]),
      head: rotate([d(3), d(8), d(5)]),
      leftUpperArm: aim(0.38, 0.92),
      leftLowerArm: aim(-0.45, 0.8),
      leftHand: rotate([0, 0, d(15)]),
      rightUpperArm: aim(0.38, 0.92),
      rightLowerArm: aim(-0.45, 0.8),
      rightHand: rotate([0, 0, d(-10)]),
    }),
  },
  {
    id: "shy",
    label: "부끄럼",
    tone: "수줍은 자세",
    bones: naturalPose({
      spine: rotate([d(1), d(-2), 0]),
      head: rotate([d(8), d(3), d(5)]),
      leftShoulder: rotate([0, 0, d(-2)]),
      rightShoulder: rotate([0, 0, d(2.5)]),
      leftUpperArm: aim(-0.2, -0.56, 0.8),
      rightUpperArm: aim(-0.24, -0.6, 0.76),
      leftLowerArm: aim(-0.18, 0.15, 0.97),
      rightLowerArm: aim(-0.22, 0.09, 0.97),
    }),
  },
  {
    id: "arrogant",
    label: "팔짱",
    tone: "거만한 태도",
    bones: naturalPose({
      spine: rotate([d(-3), d(-1), 0]),
      chest: rotate([d(-2), d(1), 0]),
      head: rotate([d(-4), d(2), d(1.5)]),
      leftUpperArm: aim(-0.5, -0.22, 0.5),
      leftLowerArm: aim(-0.82, 0.2, 0.44),
      rightUpperArm: aim(-0.6, -0.18, 0.4),
      rightLowerArm: aim(-0.88, 0.15, 0.36),
    }),
  },
  {
    id: "shock",
    label: "깜짝",
    tone: "충격 유발",
    bones: naturalPose({
      spine: rotate([d(5), d(1), 0]),
      chest: rotate([d(4), d(-1), 0]),
      head: rotate([d(8), d(-2), d(1)]),
      leftUpperArm: aim(0.64, 0.54, 0.28),
      leftLowerArm: aim(0.24, 0.91, 0.3),
      leftHand: rotate([d(13), d(11), d(12)]),
      rightUpperArm: aim(0.6, 0.5, 0.33),
      rightLowerArm: aim(0.2, 0.93, 0.26),
      rightHand: rotate([d(17), d(-9), d(-8)]),
    }),
  },
  {
    id: "surrender",
    label: "항복",
    tone: "당황한 양손",
    bones: naturalPose({
      head: rotate([d(6), 0, 0]),
      leftUpperArm: aim(0.46, 0.88, 0.04),
      leftLowerArm: aim(0.14, 0.98, 0.02),
      rightUpperArm: aim(0.46, 0.88, 0.04),
      rightLowerArm: aim(0.14, 0.98, 0.02),
    }),
  },
  {
    id: "phone",
    label: "통화",
    tone: "전화 연출",
    bones: naturalPose({
      rightUpperArm: aim(0.36, -0.24, 0.34),
      rightLowerArm: aim(-0.18, 0.72, 0.66),
      rightHand: rotate([d(10), d(-15), d(-10)]),
    }),
  },
  {
    id: "salute",
    label: "경례",
    tone: "절제된 인사",
    bones: naturalPose({
      head: rotate([d(-2), d(-5), 0]),
      rightUpperArm: aim(0.45, 0.28, 0.35),
      rightLowerArm: aim(-0.45, 0.58, 0.68),
      rightHand: rotate([d(5), d(15), d(-15)]),
    }),
  },
  {
    id: "fighting",
    label: "격투",
    tone: "전투 준비 자세",
    yOffset: -0.03,
    bones: naturalPose({
      hips: rotate([d(-5), d(-10), 0]),
      spine: rotate([d(5), d(8), 0]),
      chest: rotate([d(-2), d(6), 0]),
      head: rotate([d(-4), d(-8), 0]),
      leftUpperArm: aim(0.55, 0.1, 0.6),
      leftLowerArm: aim(0.1, 0.45, 0.88),
      leftHand: rotate([d(10), 0, d(10)]),
      rightUpperArm: aim(0.5, -0.15, 0.55),
      rightLowerArm: aim(0.15, 0.5, 0.85),
      rightHand: rotate([d(10), 0, d(-10)]),
      leftUpperLeg: aim(0.15, -0.65, 0.75),
      rightUpperLeg: aim(0.1, -0.85, -0.52),
      leftLowerLeg: aim(0.05, -0.92, 0.38),
      rightLowerLeg: aim(0.03, -0.95, -0.3),
    }),
  },
  {
    id: "thinking",
    label: "생각중",
    tone: "턱을 괴고 생각",
    bones: naturalPose({
      hips: rotate([0, d(5), 0]),
      spine: rotate([d(4), d(-5), 0]),
      chest: rotate([d(2), d(-4), 0]),
      neck: rotate([d(2), d(4), 0]),
      head: rotate([d(8), d(-6), d(-5)]),
      rightUpperArm: aim(0.35, -0.2, 0.3),
      rightLowerArm: aim(-0.35, 0.6, 0.7),
      rightHand: rotate([d(20), d(15), d(-10)]),
      leftUpperArm: aim(-0.4, -0.3, 0.5),
      leftLowerArm: aim(-0.6, 0.15, 0.78),
      leftHand: rotate([d(5), 0, d(5)]),
    }),
  },
  {
    id: "pray",
    label: "기도",
    tone: "합장/기도",
    bones: naturalPose({
      spine: rotate([d(3), 0, 0]),
      chest: rotate([d(2), 0, 0]),
      neck: rotate([d(4), 0, 0]),
      head: rotate([d(8), 0, 0]),
      leftUpperArm: aim(-0.4, -0.25, 0.6),
      leftLowerArm: aim(-0.55, 0.35, 0.75),
      leftHand: rotate([d(10), d(-15), d(15)]),
      rightUpperArm: aim(-0.4, -0.25, 0.6),
      rightLowerArm: aim(-0.55, 0.35, 0.75),
      rightHand: rotate([d(10), d(15), d(-15)]),
    }),
  },
  {
    id: "dance",
    label: "댄스",
    tone: "춤추는 자세",
    yOffset: -0.01,
    bones: naturalPose({
      hips: rotate([d(-3), d(-8), d(3)]),
      spine: rotate([d(-2), d(6), d(-2)]),
      chest: rotate([d(3), d(5), d(-3)]),
      head: rotate([d(-4), d(-6), d(4)]),
      leftUpperArm: aim(0.62, 0.7, 0.15),
      leftLowerArm: aim(0.3, 0.92, 0.2),
      leftHand: rotate([0, 0, d(15)]),
      rightUpperArm: aim(0.5, -0.4, 0.4),
      rightLowerArm: aim(0.2, -0.2, 0.96),
      rightHand: rotate([0, 0, d(-10)]),
      leftUpperLeg: aim(0.1, -0.6, 0.79),
      leftLowerLeg: aim(0.05, -0.85, 0.52),
      rightUpperLeg: aim(0.18, -0.88, -0.42),
      rightLowerLeg: aim(0.05, -0.72, -0.69),
    }),
  },
  {
    id: "bow",
    label: "인사",
    tone: "깊은 인사",
    yOffset: -0.04,
    bones: naturalPose({
      hips: rotate([d(25), 0, 0]),
      spine: rotate([d(15), 0, 0]),
      chest: rotate([d(8), 0, 0]),
      neck: rotate([d(5), 0, 0]),
      head: rotate([d(3), 0, 0]),
      leftUpperArm: aim(0.2, -0.98),
      rightUpperArm: aim(0.2, -0.98),
      leftLowerArm: aim(0.1, -0.99),
      rightLowerArm: aim(0.1, -0.99),
    }),
  },
  {
    id: "crouch",
    label: "쪼그림",
    tone: "웅크리기",
    yOffset: -0.18,
    bones: naturalPose({
      hips: rotate([d(-15), 0, 0]),
      spine: rotate([d(12), 0, 0]),
      chest: rotate([d(5), 0, 0]),
      neck: rotate([d(3), 0, 0]),
      head: rotate([d(-5), 0, 0]),
      leftUpperArm: aim(0.32, -0.63, 0.52),
      leftLowerArm: aim(0.17, -0.28, 0.94),
      rightUpperArm: aim(0.28, -0.67, 0.48),
      rightLowerArm: aim(0.13, -0.32, 0.94),
      leftUpperLeg: aim(0.14, -0.13, 0.98),
      rightUpperLeg: aim(0.1, -0.17, 0.97),
      leftLowerLeg: aim(0.06, -0.94, -0.33),
      rightLowerLeg: aim(0.04, -0.96, -0.27),
      leftFoot: rotate([d(-8), d(2), d(1)]),
      rightFoot: rotate([d(-7), d(-3), d(-1)]),
    }),
  },
  {
    id: "heroic",
    label: "영웅",
    tone: "영웅적 포즈",
    bones: naturalPose({
      hips: rotate([d(-2), d(-6), 0]),
      spine: rotate([d(-4), d(4), 0]),
      chest: rotate([d(-3), d(4), 0]),
      head: rotate([d(-4), d(-3), 0]),
      leftUpperArm: aim(0.45, -0.5, 0.15),
      leftLowerArm: aim(0.2, -0.92, 0.32),
      leftHand: rotate([0, 0, d(5)]),
      rightUpperArm: aim(0.6, 0.78, 0.1),
      rightLowerArm: aim(0.2, 0.96, 0.15),
      rightHand: rotate([0, 0, d(-5)]),
      leftUpperLeg: aim(0.12, -0.7, 0.7),
      rightUpperLeg: aim(0.05, -0.99, -0.1),
    }),
  },
  {
    id: "shy2",
    label: "수줍음",
    tone: "수줍은 자세",
    bones: naturalPose({
      hips: rotate([d(2), d(4), 0]),
      spine: rotate([d(3), d(-3), 0]),
      chest: rotate([d(2), d(-2), 0]),
      head: rotate([d(10), d(6), d(5)]),
      leftUpperArm: aim(-0.3, -0.55, 0.72),
      leftLowerArm: aim(-0.5, 0.2, 0.84),
      leftHand: rotate([d(5), 0, d(5)]),
      rightUpperArm: aim(-0.3, -0.55, 0.72),
      rightLowerArm: aim(-0.5, 0.2, 0.84),
      rightHand: rotate([d(5), 0, d(-5)]),
      leftUpperLeg: aim(0.15, -0.98, 0.1),
      rightUpperLeg: aim(0.05, -0.95, -0.3),
    }),
  },
  {
    id: "lean",
    label: "기대기",
    tone: "벽에 기대기",
    yOffset: -0.01,
    bones: naturalPose({
      hips: rotate([d(3), d(-5), d(-4)]),
      spine: rotate([d(-2), d(3), d(2)]),
      chest: rotate([d(-1), d(2), d(1)]),
      head: rotate([d(-3), d(-3), d(-2)]),
      leftUpperArm: aim(0.35, -0.94),
      rightUpperArm: aim(-0.2, -0.4, 0.5),
      rightLowerArm: aim(-0.6, 0.3, 0.72),
      rightHand: rotate([0, d(-10), d(-5)]),
      leftUpperLeg: aim(0.1, -0.85, 0.52),
      rightUpperLeg: aim(0.08, -0.92, -0.38),
      rightLowerLeg: aim(0.03, -0.88, -0.47),
    }),
  },
  {
    id: "crossArms",
    label: "팔짱",
    tone: "팔짱 끼기",
    bones: naturalPose({
      spine: rotate([d(-2), d(1), 0]),
      chest: rotate([d(-3), d(-1), 0]),
      head: rotate([d(-3), d(-2), d(1)]),
      leftUpperArm: aim(-0.52, -0.22, 0.52),
      leftLowerArm: aim(-0.85, 0.16, 0.42),
      leftHand: rotate([d(4), d(-9), d(9)]),
      rightUpperArm: aim(-0.58, -0.28, 0.44),
      rightLowerArm: aim(-0.9, 0.09, 0.34),
      rightHand: rotate([d(6), d(11), d(-7)]),
    }),
  },
  {
    id: "run2",
    label: "달리기",
    tone: "달리는 자세",
    yOffset: -0.02,
    bones: naturalPose({
      hips: rotate([d(-6), d(-5), 0]),
      spine: rotate([d(6), d(4), 0]),
      chest: rotate([d(-2), d(3), 0]),
      head: rotate([d(-3), d(-4), 0]),
      leftUpperArm: aim(0.3, -0.6, -0.72),
      leftLowerArm: aim(0.15, -0.7, -0.7),
      rightUpperArm: aim(0.3, -0.5, 0.8),
      rightLowerArm: aim(0.15, -0.6, 0.78),
      leftUpperLeg: aim(0.1, -0.35, 0.93),
      leftLowerLeg: aim(0.03, -0.82, 0.57),
      rightUpperLeg: aim(0.1, -0.6, -0.79),
      rightLowerLeg: aim(0.03, -0.88, 0.48),
    }),
  },
  {
    id: "jump",
    label: "점프",
    tone: "점프 자세",
    yOffset: 0.1,
    bones: naturalPose({
      hips: rotate([d(-8), 0, 0]),
      spine: rotate([d(-4), 0, 0]),
      chest: rotate([d(5), 0, 0]),
      head: rotate([d(-6), 0, 0]),
      leftUpperArm: aim(0.58, 0.8, 0.14),
      leftLowerArm: aim(0.27, 0.95, 0.1),
      rightUpperArm: aim(0.52, 0.84, 0.1),
      rightLowerArm: aim(0.23, 0.97, 0.06),
      leftUpperLeg: aim(0.12, -0.52, 0.85),
      leftLowerLeg: aim(0.06, -0.8, -0.59),
      rightUpperLeg: aim(0.09, -0.58, 0.81),
      rightLowerLeg: aim(0.04, -0.84, -0.55),
      leftFoot: rotate([d(-16), 0, d(1)]),
      rightFoot: rotate([d(-13), 0, d(-1)]),
    }),
  },
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
};

const BONE_CATEGORIES: Array<{ id: string; label: string; bones: VRMHumanBoneName[] }> = [
  { id: "head", label: "머리/목", bones: ["head", "neck"] },
  { id: "torso", label: "몸통/상체", bones: ["spine", "chest"] },
  { id: "rightArm", label: "오른팔", bones: ["rightUpperArm", "rightLowerArm", "rightHand"] },
  { id: "leftArm", label: "왼팔", bones: ["leftUpperArm", "leftLowerArm", "leftHand"] },
  { id: "rightLeg", label: "오른다리", bones: ["rightUpperLeg", "rightLowerLeg", "rightFoot"] },
  { id: "leftLeg", label: "왼다리", bones: ["leftUpperLeg", "leftLowerLeg", "leftFoot"] },
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
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  vrm.scene.position.set(0, 0, 0);
  vrm.scene.userData[BASE_ROTATION_Y_KEY] = vrm.scene.rotation.y;
}

function disposeVrm(vrm: VRM) {
  vrm.scene.parent?.remove(vrm.scene);
  VRMUtils.deepDispose(vrm.scene);
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
  await assertLoadableVrmUrl(url);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  return loader.loadAsync(url).then((gltf: GLTF) => {
    VRMUtils.removeUnnecessaryJoints?.(gltf.scene);

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

const CORE_ROTATION_BONE_ORDER = ["hips", "spine", "chest", "neck", "head", "leftShoulder", "rightShoulder"] as const satisfies readonly VRMHumanBoneName[];
const LIMB_BONE_ORDER = [
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftUpperLeg",
  "rightUpperLeg",
  "leftLowerLeg",
  "rightLowerLeg",
] as const satisfies readonly VRMHumanBoneName[];
const END_EFFECTOR_ROTATION_BONE_ORDER = ["leftHand", "rightHand", "leftFoot", "rightFoot"] as const satisfies readonly VRMHumanBoneName[];
// 손가락 본(오일러 회전 전용) — 모델에 해당 본이 없으면 그대로 건너뛴다.
const FINGER_ROTATION_BONE_ORDER = [
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const satisfies readonly VRMHumanBoneName[];
const ZERO_ROTATION: Vec3 = [0, 0, 0];
const MIN_DIRECTION_LENGTH_SQ = 0.000001;

type LimbBoneName = (typeof LIMB_BONE_ORDER)[number];

const LIMB_CHILD_BONE: Record<LimbBoneName, VRMHumanBoneName> = {
  leftUpperArm: "leftLowerArm",
  rightUpperArm: "rightLowerArm",
  leftLowerArm: "leftHand",
  rightLowerArm: "rightHand",
  leftUpperLeg: "leftLowerLeg",
  rightUpperLeg: "rightLowerLeg",
  leftLowerLeg: "leftFoot",
  rightLowerLeg: "rightFoot",
};

function normalizeDirection(direction: THREE.Vector3) {
  const lengthSq = direction.lengthSq();
  if (lengthSq < MIN_DIRECTION_LENGTH_SQ) return false;
  direction.multiplyScalar(1 / Math.sqrt(lengthSq));
  return true;
}

function getPoseBoneRotation(poseBone: PoseBone | undefined) {
  return poseBone?.rotation ?? ZERO_ROTATION;
}

function applyEulerRotation(humanoid: NonNullable<VRM["humanoid"]>, boneName: VRMHumanBoneName, rotation: Vec3) {
  const bone = humanoid.getNormalizedBoneNode(boneName);
  if (!bone) return;
  bone.rotation.set(rotation[0], rotation[1], rotation[2]);
  bone.updateMatrixWorld(true);
}

function getBoneWorldDirection(bone: THREE.Object3D, child: THREE.Object3D, out: THREE.Vector3) {
  const bonePosition = new THREE.Vector3();
  const childPosition = new THREE.Vector3();
  bone.getWorldPosition(bonePosition);
  child.getWorldPosition(childPosition);
  out.subVectors(childPosition, bonePosition);
  return normalizeDirection(out);
}

function isVec3Direction(target: DirectionTarget): target is Vec3 {
  return Array.isArray(target);
}

function resolveTargetWorldDirection(target: DirectionTarget, restWorldDirection: THREE.Vector3, out: THREE.Vector3) {
  if (isVec3Direction(target)) {
    out.set(target[0], target[1], target[2]);
  } else {
    const sideSign = Math.abs(restWorldDirection.x) > MIN_DIRECTION_LENGTH_SQ ? Math.sign(restWorldDirection.x) : 0;
    out.set(sideSign * target.sideX, target.y, target.z ?? 0);
  }

  return normalizeDirection(out);
}

function aimBoneToWorldDirection(humanoid: NonNullable<VRM["humanoid"]>, boneName: LimbBoneName, target: DirectionTarget) {
  const bone = humanoid.getNormalizedBoneNode(boneName);
  const child = humanoid.getNormalizedBoneNode(LIMB_CHILD_BONE[boneName]);
  if (!bone || !child) return;

  const restWorldDirection = new THREE.Vector3();
  if (!getBoneWorldDirection(bone, child, restWorldDirection)) return;

  const targetWorldDirection = new THREE.Vector3();
  if (!resolveTargetWorldDirection(target, restWorldDirection, targetWorldDirection)) return;

  const parentInverseWorldQuaternion = new THREE.Quaternion();
  if (bone.parent) {
    bone.parent.getWorldQuaternion(parentInverseWorldQuaternion).invert();
  } else {
    parentInverseWorldQuaternion.identity();
  }

  const restParentDirection = restWorldDirection.clone().applyQuaternion(parentInverseWorldQuaternion);
  const targetParentDirection = targetWorldDirection.clone().applyQuaternion(parentInverseWorldQuaternion);
  if (!normalizeDirection(restParentDirection) || !normalizeDirection(targetParentDirection)) return;

  const aimQuaternion = new THREE.Quaternion().setFromUnitVectors(restParentDirection, targetParentDirection);
  bone.quaternion.premultiply(aimQuaternion);
  bone.updateMatrixWorld(true);
}

export function applyPoseToVrm(vrm: VRM, bones: PoseBoneMap, yOffset: number) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return false;

  humanoid.resetNormalizedPose();
  vrm.scene.position.y = yOffset;
  vrm.scene.updateMatrixWorld(true);

  CORE_ROTATION_BONE_ORDER.forEach((boneName) => {
    const rotation = bones[boneName]?.rotation;
    if (rotation) {
      applyEulerRotation(humanoid, boneName, rotation);
    }
  });
  vrm.scene.updateMatrixWorld(true);

  LIMB_BONE_ORDER.forEach((boneName) => {
    const poseBone = bones[boneName];
    if (!poseBone) return;

    if (poseBone.direction) {
      aimBoneToWorldDirection(humanoid, boneName, poseBone.direction);
      return;
    }

    if (poseBone.rotation) {
      applyEulerRotation(humanoid, boneName, poseBone.rotation);
    }
  });

  END_EFFECTOR_ROTATION_BONE_ORDER.forEach((boneName) => {
    const rotation = bones[boneName]?.rotation;
    if (rotation) {
      applyEulerRotation(humanoid, boneName, rotation);
    }
  });

  FINGER_ROTATION_BONE_ORDER.forEach((boneName) => {
    const rotation = bones[boneName]?.rotation;
    if (rotation) {
      applyEulerRotation(humanoid, boneName, rotation);
    }
  });

  humanoid.update();
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return true;
}

export function applyExpressionWeightsToVrm(vrm: VRM, weights: Record<string, number>) {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return false;

  expressionManager.resetValues();

  Object.entries(weights).forEach(([name, weight]) => {
    if (expressionManager.getExpression(name)) {
      expressionManager.setValue(name, weight);
    }
  });

  expressionManager.update();
  vrm.update(0);
  return true;
}

export function applyVrmCustomColors(vrm: VRM, customColors: Record<string, string>) {
  vrm.scene.traverse((obj) => {
    if ((obj as any).isMesh) {
      const mesh = obj as THREE.Mesh;
      const name = mesh.name.toLowerCase();
      
      let part: string | null = null;
      if (name.includes("tops") || name.includes("top") || name.includes("clothes") || name.includes("shirt")) part = "tops";
      else if (name.includes("bottoms") || name.includes("bottom") || name.includes("pants") || name.includes("skirt") || name.includes("shoes") || name.includes("acc")) part = "bottoms";
      else if (name.includes("hair")) part = "hair";
      else if (name.includes("body") || name.includes("skin") || name.includes("hand") || name.includes("leg") || name.includes("arm") || name.includes("head") || name.includes("foot")) part = "body";
      else if (name.includes("face") || name.includes("eye") || name.includes("mouth") || name.includes("brow")) part = "face";

      if (part && customColors[part]) {
        const hex = customColors[part]!;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        
        materials.forEach((mat: any) => {
          if (mat && mat.color) {
            mat.color.set(hex);
            mat.needsUpdate = true;
          }
        });
      }
    }
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

function CameraDirector({ presetId }: { presetId: string }) {
  const { camera, invalidate } = useThree();
  const preset = findCameraPreset(presetId);

  useEffect(() => {
    applyCameraPreset(camera, preset, invalidate);
  }, [camera, invalidate, preset]);

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

function applyRotationToVrm(vrm: VRM, bodyRotation: number) {
  const baseRotationY = typeof vrm.scene.userData[BASE_ROTATION_Y_KEY] === "number" ? vrm.scene.userData[BASE_ROTATION_Y_KEY] : 0;
  vrm.scene.rotation.y = baseRotationY + bodyRotation;
  vrm.scene.updateMatrixWorld(true);
}

function VrmActor({
  bodyRotation,
  customBones,
  customYOffset,
  expressionWeights,
  vrm,
  customColors,
  physicsPreview,
}: {
  bodyRotation: number;
  customBones: PoseBoneMap;
  customYOffset: number;
  expressionWeights: Record<string, number>;
  vrm: VRM;
  customColors: Record<string, string>;
  physicsPreview: boolean;
}) {
  useEffect(() => {
    applyPoseToVrm(vrm, customBones, customYOffset);
  }, [customBones, customYOffset, vrm]);

  useEffect(() => {
    applyExpressionWeightsToVrm(vrm, expressionWeights);
  }, [expressionWeights, vrm]);

  useEffect(() => {
    applyRotationToVrm(vrm, bodyRotation);
  }, [bodyRotation, vrm]);

  useEffect(() => {
    applyVrmCustomColors(vrm, customColors);
  }, [customColors, vrm]);

  useFrame((_, delta) => {
    // 흔들림 미리보기: 매 프레임 스프링본을 갱신(델타 상한으로 폭주 방지).
    // 정지 모드: delta 0으로 표정/제약만 동기화하고 스프링본은 정착 프레임에서 멈춘다.
    vrm.update(physicsPreview ? Math.min(delta, PHYSICS_PREVIEW_MAX_DELTA) : 0);
  });

  return <primitive object={vrm.scene} />;
}

type LightingTone = "morning" | "sunset" | "night" | "studio";

function VrmLighting({ tone }: { tone: LightingTone }) {
  if (tone === "sunset") {
    return (
      <>
        <ambientLight intensity={0.52} color="#ffe8d6" />
        <directionalLight castShadow intensity={1.5} position={[2.8, 3.8, 3.0]} color="#ffa07a" shadow-mapSize={[1024, 1024]} />
        <directionalLight intensity={0.6} position={[-3.2, 2.0, 2.1]} color="#ffb732" />
        <directionalLight intensity={0.3} position={[-1.6, 3.4, -3.2]} color="#ff6b8b" />
      </>
    );
  }
  if (tone === "night") {
    return (
      <>
        <ambientLight intensity={0.34} color="#1b1c30" />
        <directionalLight castShadow intensity={0.92} position={[2.8, 4.2, 3.6]} color="#7fa3ff" shadow-mapSize={[1024, 1024]} />
        <directionalLight intensity={0.4} position={[-3.2, 2.6, 2.1]} color="#483d8b" />
        <directionalLight intensity={0.5} position={[-1.6, 3.4, -3.2]} color="#8a2be2" />
      </>
    );
  }
  if (tone === "studio") {
    return (
      <>
        <ambientLight intensity={0.92} />
        <directionalLight intensity={1.5} position={[0, 3.0, 4.0]} />
        <directionalLight intensity={0.8} position={[3.0, 2.0, 2.0]} />
        <directionalLight intensity={0.8} position={[-3.0, 2.0, 2.0]} />
      </>
    );
  }
  return (
    <>
      <ambientLight intensity={0.68} />
      <directionalLight castShadow intensity={1.32} position={[2.8, 4.2, 3.6]} shadow-mapSize={[1024, 1024]} />
      <directionalLight intensity={0.54} position={[-3.2, 2.6, 2.1]} color="#f7d8c4" />
      <directionalLight intensity={0.42} position={[-1.6, 3.4, -3.2]} color="#cfdcff" />
    </>
  );
}

export function StudioVrmPoser({ open, onClose, onInsert }: StudioVrmPoserProps) {
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
  const [bodyRotation, setBodyRotation] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [libraryEntries, setLibraryEntries] = useState<VrmLibraryEntry[]>(SAMPLE_VRM_ENTRIES);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("loading");
  const [libraryError, setLibraryError] = useState("");
  const [activeModelId, setActiveModelId] = useState(SAMPLE_VRM_ID);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
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
  // 물리(studio-vrm-physics) — 스프링본 설정 + 미리보기/조인트 수.
  const [vrmPhysics, setVrmPhysics] = useState<VrmPhysicsSettings>(DEFAULT_VRM_PHYSICS);
  const [physicsPreview, setPhysicsPreview] = useState(false);
  const [springJointCount, setSpringJointCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const loadRequestRef = useRef(0);
  const thumbnailRequestRef = useRef(0);
  const captureRef = useRef<CaptureState>({ camera: null, gl: null, scene: null });
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
  const availableExpressionActions = getAvailableExpressionActions(vrm);
  const activeLibraryEntry = libraryEntries.find((entry) => entry.id === activeModelId) ?? null;
  const hasUploadedModels = libraryEntries.some((entry) => entry.source === "indexed-db");
  const displayModelName = vrm ? modelName : "";

  useEffect(() => {
    const stored = localStorage.getItem("studio_custom_poses");
    if (stored) {
      try {
        setSavedPoses(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to load custom poses", e);
      }
    }
  }, []);

  function handleSavePose() {
    const label = window.prompt("포즈 이름을 입력해 주세요:", `마이 포즈 ${savedPoses.length + 1}`);
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
    if (!window.confirm("이 커스텀 포즈를 삭제할까요?")) return;
    const next = savedPoses.filter((p) => p.id !== id);
    setSavedPoses(next);
    localStorage.setItem("studio_custom_poses", JSON.stringify(next));
    if (activePoseId === id) {
      setActivePoseId("default");
    }
  }

  function handleCustomPoseSelect(pose: CustomPose) {
    setActivePoseId(pose.id);
    setCustomBones(pose.bones);
    setCustomYOffset(pose.yOffset);
    if (vrmRef.current) {
      applyPoseToVrm(vrmRef.current, pose.bones, pose.yOffset);
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
          
          if (window.confirm(`${validPoses.length}개의 포즈를 가져올까요? (기존 포즈에 추가됩니다)`)) {
            const sanitized = validPoses.map((p) => ({
              ...p,
              id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
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

    const title = window.prompt("서버에 공유할 포즈의 이름을 입력해주세요 (최대 30자):");
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
        // 옵셔널 — 기존 문서 하위호환(없으면 불러올 때 기본값).
        vrmProps: serializeVrmProps(vrmPropItems),
        costume: serializeCostume(costumeState),
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
    try {
      const hashIndex = asset.dataUrl.indexOf("#");
      if (hashIndex === -1) {
        alert("이 포즈 에셋에는 3D 설정 정보가 포함되어 있지 않습니다.");
        return;
      }
      const hashStr = asset.dataUrl.substring(hashIndex + 1);
      const poseData = JSON.parse(decodeURIComponent(hashStr));

      if (poseData.bones) {
        setCustomBones(poseData.bones);
      }
      if (typeof poseData.yOffset === "number") {
        setCustomYOffset(poseData.yOffset);
      }
      if (poseData.expressionWeights) {
        setExpressionWeights(poseData.expressionWeights);
      } else {
        setExpressionWeights({});
      }
      if (poseData.customColors) {
        setCustomColors(poseData.customColors);
      }

      // 본 부착 소품·의상·물리 복원(옵셔널 — 없으면 빈/기본값).
      const restoredProps = parseVrmProps(poseData.vrmProps).items;
      setVrmPropItems(restoredProps);
      setSelectedVrmPropUid(null);

      const restoredCostume = parseCostumeState(poseData.costume);
      setCostumeState(restoredCostume);
      setSelectedCostumeKey(null);

      const restoredPhysics = parseVrmPhysicsSettings(poseData.physics);
      setVrmPhysics(restoredPhysics);
      setPhysicsPreview(false);

      if (vrmRef.current) {
        applyPoseToVrm(vrmRef.current, poseData.bones || {}, poseData.yOffset ?? 0);
        applyExpressionWeightsToVrm(vrmRef.current, poseData.expressionWeights || {});
        applyVrmCustomColors(vrmRef.current, poseData.customColors || {});
        const meshes = collectCostumeMeshes(vrmRef.current);
        setCostumeMeshes(meshes);
        applyCostumeState(meshes, restoredCostume);
        const joints = countSpringBoneJoints(vrmRef.current);
        setSpringJointCount(joints);
        if (joints > 0) {
          applyVrmSpringBonePhysics(vrmRef.current, restoredPhysics);
          settleVrmPhysics(vrmRef.current);
        }
      }

      setActivePoseId(`shared-${asset.id}`);
      alert(`공유된 포즈 '${asset.name.replace("[3D_POSE] ", "")}'를 적용했습니다.`);
    } catch (e) {
      console.error(e);
      alert("포즈 데이터를 파싱하는 중 오류가 발생했습니다.");
    }
  }

  async function handleDeleteSharedPose(asset: SharedAsset, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!window.confirm(`공유된 포즈 '${asset.name.replace("[3D_POSE] ", "")}'를 서버에서 삭제하시겠습니까?`)) {
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
        loadModelRef.current(entries.find((entry) => entry.id === activeModelId) ?? entries[0]);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;
        setLibraryEntries(SAMPLE_VRM_ENTRIES);
        setLibraryStatus("error");
        setLibraryError(getErrorMessage(caughtError, "저장된 VRM 라이브러리를 불러오지 못했습니다."));
        loadModelRef.current(SAMPLE_VRM_ENTRIES[0]);
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
    // 스폰 기본 포즈: T-포즈 대신 캐릭터 id로 결정되는 자연 아이들 포즈를 적용한다.
    const spawnPose = pickNaturalIdlePose(nextModelId);
    setActivePoseId(spawnPose.id);
    setCustomBones(spawnPose.bones);
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
    applyPoseToVrm(nextVrm, spawnPose.bones, spawnPose.yOffset ?? 0);
    applyExpressionWeightsToVrm(nextVrm, {});
    applyVrmCustomColors(nextVrm, {
      tops: "#ffffff",
      bottoms: "#ffffff",
      hair: "#ffffff",
      body: "#ffffff",
      face: "#ffffff",
    });
    // 본 부착 소품 초기화.
    setVrmPropItems([]);
    setSelectedVrmPropUid(null);
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
    setCustomBones(pose.bones);
    setCustomYOffset(pose.yOffset ?? 0);
    if (vrmRef.current) {
      applyPoseToVrm(vrmRef.current, pose.bones, pose.yOffset ?? 0);
      if (preserveExpression) {
        applyExpressionWeightsToVrm(vrmRef.current, expressionWeights);
      } else {
        setExpressionWeights({});
        setActiveExpressionId("neutral");
        applyExpressionWeightsToVrm(vrmRef.current, {});
      }
    }
  }

  function handleBoneRotationChange(boneName: string, axisIndex: number, degrees: number) {
    if (!vrm) return;
    const radians = d(degrees);
    const key = boneName as VRMHumanBoneName;
    setCustomBones((prev) => {
      const current = [...getPoseBoneRotation(prev[key])] as [number, number, number];
      current[axisIndex] = radians;
      return { ...prev, [key]: { rotation: current } };
    });
  }

  function handleYOffsetChange(value: number) {
    setCustomYOffset(value);
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
      const dataUrl = gl.domElement.toDataURL("image/png");
      const { width, height } = roundExportSize(gl.domElement);
      setIsCapturing(false);
      onInsert(dataUrl, width, height);
      onClose();
    });
  }

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
      role="dialog"
    >
      <div className="mx-auto flex h-full max-h-[calc(100dvh-1rem)] max-w-[1280px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)] sm:max-h-[calc(100dvh-2rem)]">
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
          <button type="button" aria-label="닫기" className={ICON_BUTTON} onClick={onClose}>
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="relative min-h-[420px] overflow-hidden bg-card lg:min-h-0">
            <div
              aria-hidden
              className="absolute inset-0 opacity-80 [background-image:linear-gradient(45deg,oklch(0.75_0.01_80/0.16)_25%,transparent_25%),linear-gradient(-45deg,oklch(0.75_0.01_80/0.16)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,oklch(0.75_0.01_80/0.16)_75%),linear-gradient(-45deg,transparent_75%,oklch(0.75_0.01_80/0.16)_75%)] [background-position:0_0,0_12px,12px_-12px,-12px_0] [background-size:24px_24px]"
            />
            <div className="relative mx-auto flex h-full max-h-[calc(100dvh-12rem)] min-h-[420px] w-full max-w-[min(82vw,720px)] items-center justify-center p-3 sm:p-5 lg:max-h-none">
              <div className="relative aspect-[9/13] h-full max-h-full min-h-[390px] w-auto overflow-hidden rounded-xl border border-line/80 bg-transparent shadow-[inset_0_0_0_1px_oklch(1_0_0/0.04)]">
                <Canvas
                  camera={{ fov: activeCamera.fov, position: [...activeCamera.position], near: 0.1, far: 20 }}
                  className="h-full w-full"
                  dpr={[1, 2]}
                  gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
                  shadows
                  onCreated={({ gl }) => {
                    gl.setClearColor(0x000000, 0);
                    gl.setClearAlpha(0);
                  }}
                >
                  <CaptureBridge onCaptureUpdate={onCaptureUpdate} />
                  <CameraDirector presetId={activeCameraId} />
                  <VrmLighting tone={lightingTone} />
                  {vrm ? (
                    <VrmActor
                      bodyRotation={bodyRotation}
                      customBones={customBones}
                      customYOffset={customYOffset}
                      expressionWeights={expressionWeights}
                      vrm={vrm}
                      customColors={customColors}
                      physicsPreview={physicsPreview}
                    />
                  ) : null}
                  {vrm
                    ? vrmPropItems.map((item) => <VrmPropAttachment key={item.uid} vrm={vrm} instance={item} />)
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
                  <ContactShadows position={[0, 0.01, 0]} opacity={0.22} scale={4.8} blur={2.35} far={2.6} resolution={512} color="#3c2b20" />
                  <OrbitControls
                    makeDefault
                    enableDamping
                    dampingFactor={0.08}
                    enablePan={false}
                    minDistance={1.3}
                    maxDistance={5.2}
                    target={[activeCamera.target[0], activeCamera.target[1], activeCamera.target[2]]}
                  />
                </Canvas>

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
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <section>
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
                            <span className={cx("mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold", isActive ? "bg-accent text-on-accent" : "bg-raised text-fg-3")}>
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

              <section>
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

              <section className="rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Sliders size={14} className="text-accent" aria-hidden />
                  표정 세부 조절 (Blendshape Mix)
                </h3>
                <p className="mb-3 text-[0.62rem] leading-relaxed text-fg-3">
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
                                className="h-1 flex-1 accent-accent"
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

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <UserRound size={15} className="text-accent" aria-hidden />
                    포즈
                  </h3>
                  <div className="flex gap-1.5">
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
                <div className="grid grid-cols-2 gap-2">
                  {POSE_PRESETS.map((pose) => (
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
                <div className="mt-3.5 border-t border-line/45 pt-3">
                  <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">자연 대기 · 스폰 포즈 ({NATURAL_IDLE_POSES.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {NATURAL_IDLE_POSES.map((pose) => (
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
                <div className="mt-3.5 border-t border-line/45 pt-3">
                  <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wider text-fg-3">확장 포즈 팩 ({EXTRA_POSE_PRESETS.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    {EXTRA_POSE_PRESETS.map((pose) => (
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

                <div className="mt-3.5 space-y-2 border-t border-line/45 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[0.65rem] font-bold text-fg-3 uppercase tracking-wider">내가 만든 포즈 ({savedPoses.length})</p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={handleExportPoses}
                        disabled={savedPoses.length === 0}
                        className="inline-flex items-center rounded border border-line bg-card px-1.5 py-0.5 text-[0.62rem] font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-40"
                        title="JSON 파일로 백업 내보내기"
                      >
                        내보내기
                      </button>
                      <button
                        type="button"
                        onClick={handleImportPoses}
                        className="inline-flex items-center rounded border border-line bg-card px-1.5 py-0.5 text-[0.62rem] font-bold text-fg-2 hover:bg-raised hover:text-fg"
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
                      {savedPoses.map((pose) => (
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

              <section className="rounded-xl border border-line bg-card/45 p-3">
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
                <p className="mb-3 text-[0.62rem] leading-relaxed text-fg-3">
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
                              <span className="block text-[0.55rem] text-fg-3 truncate">
                                작성자: {asset.author?.name || "익명"}
                              </span>
                            </div>
                            <span className="mt-1 block text-[0.55rem] text-fg-3 font-semibold">
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

              <section className="rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-fg">
                  <Sliders size={14} className="text-accent" aria-hidden />
                  의상 및 신체 색상 변경
                </h3>
                <p className="mb-3 text-[0.62rem] leading-relaxed text-fg-3">
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

              <section className="rounded-xl border border-line bg-card/45 p-3">
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
                      const [xRad, yRad, zRad] = getPoseBoneRotation(customBones[boneName]);
                      const xDeg = Math.round(THREE.MathUtils.radToDeg(xRad));
                      const yDeg = Math.round(THREE.MathUtils.radToDeg(yRad));
                      const zDeg = Math.round(THREE.MathUtils.radToDeg(zRad));

                      return (
                        <div key={boneName} className="rounded-lg border border-line/60 bg-panel/40 p-2.5">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="text-[0.7rem] font-bold text-fg-2">{label}</span>
                            <button
                              type="button"
                              className="text-[0.62rem] text-accent hover:underline animate-fade-in"
                              disabled={!vrm}
                              onClick={() => {
                                setCustomBones((prev) => {
                                  return { ...prev, [boneName]: { rotation: ZERO_ROTATION } };
                                });
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
                              className="h-1 flex-1 accent-accent"
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
                              className="h-1 flex-1 accent-accent"
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
                              className="h-1 flex-1 accent-accent"
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
                        if (pose) {
                          setCustomBones(pose.bones);
                          setCustomYOffset(pose.yOffset);
                          if (pose.expressionWeights) {
                            setExpressionWeights(pose.expressionWeights);
                            if (vrmRef.current) {
                              applyExpressionWeightsToVrm(vrmRef.current, pose.expressionWeights);
                            }
                          }
                          if (vrmRef.current) {
                            applyPoseToVrm(vrmRef.current, pose.bones, pose.yOffset);
                          }
                        }
                      } else {
                        const pose = findPose(activePoseId);
                        setCustomBones(pose.bones);
                        setCustomYOffset(pose.yOffset ?? 0);
                        if (vrmRef.current) {
                          applyPoseToVrm(vrmRef.current, pose.bones, pose.yOffset ?? 0);
                        }
                      }
                    }}
                  >
                    현재 프리셋 포즈로 재설정
                  </button>
                </div>
              </section>

              <section>
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

              <section className="mt-4">
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

              {/* ── 본 부착 소품(손/머리/몸) ───────────────────────────── */}
              <section className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  소품 부착 (손·머리·몸)
                </h3>
                <p className="mb-3 text-[0.62rem] leading-relaxed text-fg-3">
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
                          <span className="text-[0.55rem] font-semibold leading-tight">{def.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {vrmPropItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line/70 bg-card/40 px-2.5 py-2 text-[0.62rem] text-fg-3">
                    부착된 소품이 없습니다. 위에서 소품을 눌러 추가하세요.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[0.65rem] font-bold text-fg-2">부착된 소품 ({vrmPropItems.length})</p>
                      <button
                        type="button"
                        className="text-[0.62rem] text-fg-3 hover:underline"
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
                              <span className="ml-1 text-[0.58rem] font-normal text-fg-3">
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
                                <label className="mb-1 block text-[0.62rem] font-semibold text-fg-2">부착 부위</label>
                                <select
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
                                <p className="mb-1 text-[0.6rem] font-semibold text-fg-3">위치 (X / Y / Z)</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {([0, 1, 2] as const).map((axis) => (
                                    <label key={axis} className="block text-[0.55rem] text-fg-3">
                                      {"XYZ"[axis]}: {item.position[axis].toFixed(2)}
                                      <input
                                        type="range" min="-0.5" max="0.5" step="0.01"
                                        className="w-full accent-accent h-1"
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
                                <p className="mb-1 text-[0.6rem] font-semibold text-fg-3">회전 (도)</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {([0, 1, 2] as const).map((axis) => (
                                    <label key={axis} className="block text-[0.55rem] text-fg-3">
                                      {"XYZ"[axis]}: {Math.round(item.rotationDeg[axis])}°
                                      <input
                                        type="range" min="-180" max="180"
                                        className="w-full accent-accent h-1"
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
                                <label className="flex-1 text-[0.6rem] text-fg-3">
                                  크기 {item.scale.toFixed(1)}x
                                  <input
                                    type="range" min="0.2" max="4" step="0.1"
                                    className="w-full accent-accent h-1"
                                    value={item.scale}
                                    onChange={(e) => updateVrmProp(item.uid, { scale: Number(e.target.value) })}
                                  />
                                </label>
                                {item.color !== null && (
                                  <label className="flex flex-col items-center gap-0.5 text-[0.55rem] text-fg-3">
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
              <section className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sliders size={15} className="text-accent" aria-hidden />
                  의상 분리 · 부분 채색
                </h3>
                {costumeMeshes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line/70 bg-card/40 px-2.5 py-2 text-[0.62rem] text-fg-3">
                    {vrm ? "이 모델은 의상 분리 정보가 없어요." : "모델을 먼저 불러오세요."}
                  </p>
                ) : (
                  <>
                    <p className="mb-2.5 text-[0.62rem] leading-relaxed text-fg-3">
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
                                        "rounded px-1.5 py-0.5 text-[0.58rem] font-semibold transition-colors",
                                        hidden ? "bg-card text-fg-3 line-through" : "bg-accent-soft text-accent"
                                      )}
                                      onClick={() => toggleCostumeMesh(entry.key)}
                                    >
                                      {hidden ? "숨김" : "표시"}
                                    </button>
                                    <span className="flex-1 truncate text-[0.62rem] text-fg-2" title={entry.label}>
                                      {entry.label}
                                    </span>
                                    <button
                                      type="button"
                                      className="text-[0.58rem] text-fg-3 hover:underline"
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
                                        className="rounded border border-line bg-card px-2 py-0.5 text-[0.58rem] text-fg-2 hover:bg-raised"
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
              <section className="mt-4 rounded-xl border border-line bg-card/45 p-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <WandSparkles size={15} className="text-accent" aria-hidden />
                  흔들림 물리 (머리카락·치마)
                </h3>
                {springJointCount === 0 ? (
                  <p className="rounded-lg border border-dashed border-line/70 bg-card/40 px-2.5 py-2 text-[0.62rem] text-fg-3">
                    {vrm ? "이 모델에는 흔들림 뼈 정보가 없어요." : "모델을 먼저 불러오세요."}
                  </p>
                ) : (
                  <>
                    <p className="mb-2.5 text-[0.62rem] leading-relaxed text-fg-3">
                      흔들림 뼈 {springJointCount}개. 강도·중력·바람을 조절하면 정착된 정지 컷에 반영됩니다.
                    </p>
                    <div className="space-y-2.5">
                      <label className="block text-[0.62rem] text-fg-2">
                        <span className="flex justify-between"><span>흔들림 강도(탄성)</span><span>{vrmPhysics.stiffnessScale.toFixed(2)}</span></span>
                        <input
                          type="range" min="0" max="2" step="0.05"
                          className="w-full accent-accent h-1"
                          value={vrmPhysics.stiffnessScale}
                          onChange={(e) => updatePhysics({ stiffnessScale: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-[0.62rem] text-fg-2">
                        <span className="flex justify-between"><span>중력</span><span>{vrmPhysics.gravityScale.toFixed(2)}</span></span>
                        <input
                          type="range" min="0" max="2" step="0.05"
                          className="w-full accent-accent h-1"
                          value={vrmPhysics.gravityScale}
                          onChange={(e) => updatePhysics({ gravityScale: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-[0.62rem] text-fg-2">
                        <span className="flex justify-between"><span>바람 방향</span><span>{Math.round(vrmPhysics.windDirectionDeg)}°</span></span>
                        <input
                          type="range" min="-180" max="180"
                          className="w-full accent-accent h-1"
                          value={vrmPhysics.windDirectionDeg}
                          onChange={(e) => updatePhysics({ windDirectionDeg: Number(e.target.value) })}
                        />
                      </label>
                      <label className="block text-[0.62rem] text-fg-2">
                        <span className="flex justify-between"><span>바람 세기</span><span>{vrmPhysics.windStrength.toFixed(2)}</span></span>
                        <input
                          type="range" min="0" max="2" step="0.05"
                          className="w-full accent-accent h-1"
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

              <section className="mt-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  3D 소품 · 동물 배치
                </h3>
                <p className="mb-3 text-[0.62rem] leading-relaxed text-fg-3">
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
                              <span className="text-[0.55rem] font-semibold leading-tight">{prop.label}</span>
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
                          className="text-[0.62rem] text-fg-3 hover:underline"
                          onClick={() => setSelectedPropId(null)}
                        >
                          설정 닫기
                        </button>
                      </div>

                      <div>
                        <label className="block text-[0.68rem] font-semibold text-fg-2 mb-1">장착 부위 (Bone)</label>
                        <select
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
                            <p className="text-[0.62rem] font-semibold text-fg-3 mb-1.5">위치 미세조정 (X / Y / Z)</p>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="block text-[0.55rem] text-fg-3">
                                X: {(config.offsetX || 0).toFixed(2)}
                                <input
                                  type="range"
                                  min="-0.5"
                                  max="0.5"
                                  step="0.01"
                                  className="w-full accent-accent h-1"
                                  value={config.offsetX}
                                  onChange={(e) => handleConfigChange({ offsetX: Number(e.target.value) })}
                                />
                              </label>
                              <label className="block text-[0.55rem] text-fg-3">
                                Y: {(config.offsetY || 0).toFixed(2)}
                                <input
                                  type="range"
                                  min="-0.5"
                                  max="0.5"
                                  step="0.01"
                                  className="w-full accent-accent h-1"
                                  value={config.offsetY}
                                  onChange={(e) => handleConfigChange({ offsetY: Number(e.target.value) })}
                                />
                              </label>
                              <label className="block text-[0.55rem] text-fg-3">
                                Z: {(config.offsetZ || 0).toFixed(2)}
                                <input
                                  type="range"
                                  min="-0.5"
                                  max="0.5"
                                  step="0.01"
                                  className="w-full accent-accent h-1"
                                  value={config.offsetZ}
                                  onChange={(e) => handleConfigChange({ offsetZ: Number(e.target.value) })}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="border-t border-line/40 pt-2.5">
                            <p className="text-[0.62rem] font-semibold text-fg-3 mb-1.5">회전 조정 (앞/뒤, 뒤틀기, 안/밖)</p>
                            <div className="grid grid-cols-3 gap-2">
                              <label className="block text-[0.55rem] text-fg-3">
                                앞/뒤: {Math.round(config.rotX)}°
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  className="w-full accent-accent h-1"
                                  value={config.rotX}
                                  onChange={(e) => handleConfigChange({ rotX: Number(e.target.value) })}
                                />
                              </label>
                              <label className="block text-[0.55rem] text-fg-3">
                                뒤틀기: {Math.round(config.rotY)}°
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  className="w-full accent-accent h-1"
                                  value={config.rotY}
                                  onChange={(e) => handleConfigChange({ rotY: Number(e.target.value) })}
                                />
                              </label>
                              <label className="block text-[0.55rem] text-fg-3">
                                안/밖: {Math.round(config.rotZ)}°
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  className="w-full accent-accent h-1"
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
