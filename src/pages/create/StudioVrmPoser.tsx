import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { AlertTriangle, Camera, ImagePlus, Loader2, RotateCcw, Sparkles, Trash2, Upload, UserRound, WandSparkles, X } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import {
  deleteStoredVrmModel,
  getStoredVrmModel,
  listVrmLibraryEntries,
  SAMPLE_VRM_ID,
  SAMPLE_VRM_ENTRIES,
  sampleVrmUrl,
  saveUploadedVrm,
  saveVrmThumbnail,
  type VrmLibraryEntry,
} from "./vrm-library";

type StudioVrmPoserProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (pngDataUrl: string, width: number, height: number) => void;
};

type LoadStatus = "empty" | "loading" | "ready" | "error";
type LibraryStatus = "loading" | "ready" | "error";
type Vec3 = readonly [number, number, number];
type BoneRotationMap = Partial<Record<VRMHumanBoneName, Vec3>>;
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
  bones: BoneRotationMap;
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

const BASE_ROTATION_Y_KEY = "studioVrmBaseRotationY";
const EXPORT_HEIGHT = 520;
const FALLBACK_EXPORT_WIDTH = 360;
const THUMBNAIL_WIDTH = 72;
const THUMBNAIL_HEIGHT = 96;
const d = THREE.MathUtils.degToRad;

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

const NATURAL_LIMBS: BoneRotationMap = {
  leftUpperArm: [d(1), 0, d(82)],
  rightUpperArm: [d(1), 0, d(-82)],
  leftLowerArm: [0, 0, d(-6)],
  rightLowerArm: [0, 0, d(6)],
  leftHand: [0, 0, d(2)],
  rightHand: [0, 0, d(-2)],
  leftThumbProximal: [0, 0, 0],
  leftIndexProximal: [0, 0, 0],
  leftMiddleProximal: [0, 0, 0],
  leftRingProximal: [0, 0, 0],
  leftLittleProximal: [0, 0, 0],
  rightThumbProximal: [0, 0, 0],
  rightIndexProximal: [0, 0, 0],
  rightMiddleProximal: [0, 0, 0],
  rightRingProximal: [0, 0, 0],
  rightLittleProximal: [0, 0, 0],
  leftUpperLeg: [d(1), 0, d(1)],
  rightUpperLeg: [d(-1), 0, d(-1)],
  leftLowerLeg: [d(2), 0, 0],
  rightLowerLeg: [d(2), 0, 0],
  leftFoot: [0, 0, 0],
  rightFoot: [0, 0, 0],
};

function naturalPose(core: BoneRotationMap = {}) {
  return { ...NATURAL_LIMBS, ...core };
}

export const POSE_PRESETS: PosePreset[] = [
  {
    id: "default",
    label: "기본",
    tone: "편한 스탠딩",
    bones: naturalPose({
      spine: [d(1), 0, 0],
      chest: [d(-1), 0, 0],
      neck: [d(1), 0, 0],
      head: [d(-1), 0, 0],
    }),
  },
  {
    id: "wave",
    label: "손인사",
    tone: "고개 인사",
    bones: naturalPose({
      spine: [d(-1), d(-2), 0],
      chest: [d(1), d(-3), 0],
      head: [d(-1), d(3), 0],
      rightUpperArm: [d(0), d(-4), d(-82)],
      rightLowerArm: [0, 0, d(8)],
      rightHand: [0, 0, d(-6)],
    }),
  },
  {
    id: "point",
    label: "대화",
    tone: "작은 손짓",
    bones: naturalPose({
      hips: [0, d(-2), 0],
      spine: [d(-1), d(3), 0],
      chest: [d(1), d(4), 0],
      head: [d(-1), d(-4), 0],
      rightUpperArm: [d(0), d(-5), d(-82)],
      rightLowerArm: [0, 0, d(10)],
      rightHand: [0, d(-2), d(-4)],
    }),
  },
  {
    id: "cheer",
    label: "기쁨",
    tone: "가벼운 활기",
    bones: naturalPose({
      hips: [d(-1), 0, 0],
      spine: [d(-3), 0, 0],
      chest: [d(4), 0, 0],
      head: [d(-3), 0, 0],
      leftUpperArm: [d(0), d(2), d(84)],
      rightUpperArm: [d(0), d(-2), d(-84)],
    }),
  },
  {
    id: "think",
    label: "생각",
    tone: "고민 컷",
    bones: naturalPose({
      hips: [0, d(2), 0],
      spine: [d(3), d(-3), 0],
      chest: [d(1), d(-4), 0],
      neck: [d(1), d(3), 0],
      head: [d(6), d(4), 0],
      rightHand: [d(2), d(-2), d(-4)],
    }),
  },
  {
    id: "sit",
    label: "앉기",
    tone: "낮은 자세",
    yOffset: -0.08,
    bones: naturalPose({
      hips: [d(-4), 0, 0],
      spine: [d(4), 0, 0],
      chest: [d(-1), 0, 0],
      head: [d(-2), 0, 0],
      leftUpperLeg: [d(-10), 0, d(2)],
      rightUpperLeg: [d(-10), 0, d(-2)],
      leftLowerLeg: [d(14), 0, 0],
      rightLowerLeg: [d(14), 0, 0],
      leftFoot: [d(-4), 0, d(1)],
      rightFoot: [d(-4), 0, d(-1)],
    }),
  },
  {
    id: "run",
    label: "걷기",
    tone: "한 걸음",
    yOffset: -0.01,
    bones: naturalPose({
      hips: [d(-2), d(-3), 0],
      spine: [d(3), d(2), 0],
      chest: [d(-1), d(2), 0],
      head: [d(-2), d(-3), 0],
      leftUpperLeg: [d(-10), 0, d(2)],
      leftLowerLeg: [d(12), 0, 0],
      rightUpperLeg: [d(8), 0, d(-2)],
      rightLowerLeg: [d(8), 0, 0],
    }),
  },
  {
    id: "present",
    label: "설명",
    tone: "차분한 안내",
    bones: naturalPose({
      hips: [0, d(3), 0],
      spine: [d(-1), d(-3), 0],
      chest: [d(1), d(-4), 0],
      head: [d(-1), d(4), 0],
      leftUpperArm: [d(0), d(5), d(82)],
      rightUpperArm: [d(0), d(-5), d(-82)],
      leftLowerArm: [0, 0, d(-8)],
      rightLowerArm: [0, 0, d(8)],
      leftHand: [0, d(2), d(4)],
      rightHand: [0, d(-2), d(-4)],
    }),
  },
  {
    id: "support",
    label: "응원",
    tone: "작은 박수",
    bones: naturalPose({
      hips: [d(-1), d(-2), 0],
      spine: [d(-3), d(2), 0],
      chest: [d(4), d(2), 0],
      head: [d(-2), d(-1), 0],
      leftUpperArm: [d(0), d(4), d(84)],
      rightUpperArm: [d(0), d(-4), d(-84)],
      leftLowerArm: [0, 0, d(10)],
      rightLowerArm: [0, 0, d(-10)],
    }),
  },
  {
    id: "despair",
    label: "낙담",
    tone: "차분한 저점",
    yOffset: -0.03,
    bones: naturalPose({
      hips: [d(4), 0, 0],
      spine: [d(8), 0, 0],
      chest: [d(5), 0, 0],
      neck: [d(6), 0, 0],
      head: [d(8), 0, 0],
      leftHand: [d(4), 0, d(2)],
      rightHand: [d(4), 0, d(-2)],
    }),
  },
  {
    id: "attack",
    label: "준비",
    tone: "차분한 대치",
    yOffset: -0.02,
    bones: naturalPose({
      hips: [d(-4), d(-5), 0],
      spine: [d(4), d(4), 0],
      chest: [d(-2), d(5), 0],
      head: [d(-3), d(-5), 0],
      leftUpperArm: [d(0), d(5), d(84)],
      rightUpperArm: [d(0), d(-5), d(-84)],
      leftUpperLeg: [d(-8), 0, d(3)],
      rightUpperLeg: [d(6), 0, d(-3)],
    }),
  },
  {
    id: "defense",
    label: "방어",
    tone: "조심스러운 자세",
    yOffset: -0.02,
    bones: naturalPose({
      hips: [d(-3), d(4), 0],
      spine: [d(3), d(-4), 0],
      chest: [d(2), d(-5), 0],
      head: [d(-2), d(5), 0],
      leftUpperArm: [d(0), d(5), d(84)],
      rightUpperArm: [d(0), d(-5), d(-84)],
      leftLowerArm: [0, 0, d(-8)],
      rightLowerArm: [0, 0, d(8)],
      leftUpperLeg: [d(-6), 0, d(3)],
      rightUpperLeg: [d(-4), 0, d(-3)],
    }),
  },
  {
    id: "peace",
    label: "브이",
    tone: "셀카 포즈",
    bones: naturalPose({
      hips: [0, d(-4), 0],
      spine: [d(2), d(4), 0],
      chest: [d(-1), d(4), d(2)],
      head: [d(4), d(-8), d(-5)],
      rightUpperArm: [d(-35), d(-25), d(-135)],
      rightLowerArm: [0, 0, d(35)],
      rightHand: [0, 0, d(-15)],
      leftUpperArm: [d(15), d(10), d(78)],
      leftLowerArm: [0, 0, d(-15)],
    }),
  },
  {
    id: "fist",
    label: "화이팅",
    tone: "결의 컷",
    bones: naturalPose({
      hips: [d(-2), d(4), 0],
      spine: [d(-3), 0, 0],
      chest: [d(5), 0, 0],
      head: [d(-3), d(-4), 0],
      rightUpperArm: [d(-45), d(-20), d(-45)],
      rightLowerArm: [0, d(15), d(50)],
      rightHand: [0, 0, 0],
      leftUpperArm: [d(12), d(8), d(82)],
      leftLowerArm: [0, 0, d(-10)],
    }),
  },
  {
    id: "flying",
    label: "비상",
    tone: "날아오르기",
    yOffset: 0.14,
    bones: naturalPose({
      hips: [d(45), 0, 0],
      spine: [d(-12), 0, 0],
      chest: [d(-5), 0, 0],
      head: [d(-35), 0, 0],
      leftUpperArm: [d(-20), d(12), d(35)],
      rightUpperArm: [d(-20), d(-12), d(-35)],
      leftLowerArm: [0, 0, d(-10)],
      rightLowerArm: [0, 0, d(10)],
      leftUpperLeg: [d(28), 0, d(5)],
      rightUpperLeg: [d(28), 0, d(-5)],
      leftLowerLeg: [d(8), 0, 0],
      rightLowerLeg: [d(8), 0, 0],
    }),
  },
  {
    id: "heart",
    label: "하트",
    tone: "볼하트 연출",
    bones: naturalPose({
      hips: [0, d(3), 0],
      spine: [d(2), 0, 0],
      chest: [d(-2), 0, 0],
      head: [d(3), d(8), d(5)],
      leftUpperArm: [d(-45), d(35), d(110)],
      leftLowerArm: [0, 0, d(90)],
      leftHand: [0, 0, d(15)],
      rightUpperArm: [d(10), d(-15), d(-75)],
      rightLowerArm: [0, 0, d(20)],
      rightHand: [0, 0, d(-10)],
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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function findPose(id: string) {
  return POSE_PRESETS.find((pose) => pose.id === id) ?? POSE_PRESETS[0];
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

function loadVrmAsset(url: string) {
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

function applyPoseToVrm(vrm: VRM, pose: PosePreset) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return false;

  humanoid.resetNormalizedPose();
  vrm.scene.position.y = pose.yOffset ?? 0;

  const entries = Object.entries(pose.bones) as Array<[VRMHumanBoneName, Vec3]>;
  entries.forEach(([boneName, rotation]) => {
    const bone = humanoid.getNormalizedBoneNode(boneName);
    if (!bone) return;
    bone.rotation.set(rotation[0], rotation[1], rotation[2]);
  });

  humanoid.update();
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return true;
}

function applyExpressionToVrm(vrm: VRM, action: ExpressionAction) {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return false;

  expressionManager.resetValues();

  if (action.name && expressionManager.getExpression(action.name)) {
    expressionManager.setValue(action.name, 1);
  }

  expressionManager.update();
  vrm.update(0);
  return true;
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

function CaptureBridge({ captureRef }: { captureRef: MutableRefObject<CaptureState> }) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    captureRef.current = { camera, gl, scene };
    return () => {
      if (captureRef.current.gl === gl) {
        captureRef.current = { camera: null, gl: null, scene: null };
      }
    };
  }, [camera, captureRef, gl, scene]);

  return null;
}

function CameraDirector({ presetId }: { presetId: string }) {
  const { camera, invalidate } = useThree();
  const preset = findCameraPreset(presetId);

  useEffect(() => {
    camera.position.set(preset.position[0], preset.position[1], preset.position[2]);
    camera.lookAt(preset.target[0], preset.target[1], preset.target[2]);

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = preset.fov;
      camera.updateProjectionMatrix();
    }

    camera.updateMatrixWorld();
    invalidate();
  }, [camera, invalidate, preset.fov, preset.position, preset.target]);

  return null;
}

function VrmActor({ bodyRotation, poseId, vrm }: { bodyRotation: number; poseId: string; vrm: VRM }) {
  useEffect(() => {
    applyPoseToVrm(vrm, findPose(poseId));
  }, [poseId, vrm]);

  useEffect(() => {
    const baseRotationY = typeof vrm.scene.userData[BASE_ROTATION_Y_KEY] === "number" ? vrm.scene.userData[BASE_ROTATION_Y_KEY] : 0;
    vrm.scene.rotation.y = baseRotationY + bodyRotation;
    vrm.scene.updateMatrixWorld(true);
  }, [bodyRotation, vrm]);

  useFrame((_, delta) => {
    vrm.update(delta);
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
  const [activeExpressionId, setActiveExpressionId] = useState("neutral");
  const [activeCameraId, setActiveCameraId] = useState("front");
  const [bodyRotation, setBodyRotation] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [libraryEntries, setLibraryEntries] = useState<VrmLibraryEntry[]>(SAMPLE_VRM_ENTRIES);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("loading");
  const [libraryError, setLibraryError] = useState("");
  const [activeModelId, setActiveModelId] = useState(SAMPLE_VRM_ID);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [lightingTone, setLightingTone] = useState<LightingTone>("morning");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const loadRequestRef = useRef(0);
  const thumbnailRequestRef = useRef(0);
  const captureRef = useRef<CaptureState>({ camera: null, gl: null, scene: null });
  const activeCamera = findCameraPreset(activeCameraId);
  const availableExpressionActions = getAvailableExpressionActions(vrm);
  const activeLibraryEntry = libraryEntries.find((entry) => entry.id === activeModelId) ?? null;
  const hasUploadedModels = libraryEntries.some((entry) => entry.source === "indexed-db");
  const displayModelName = vrm ? modelName : "";

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
  }, [open]);

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
        loadModelFromLibraryEntry(entries.find((entry) => entry.id === activeModelId) ?? entries[0]);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) return;
        setLibraryEntries(SAMPLE_VRM_ENTRIES);
        setLibraryStatus("error");
        setLibraryError(getErrorMessage(caughtError, "저장된 VRM 라이브러리를 불러오지 못했습니다."));
        loadModelFromLibraryEntry(SAMPLE_VRM_ENTRIES[0]);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

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
    setActivePoseId("default");
    setActiveExpressionId("neutral");
    setBodyRotation(0);
    applyPoseToVrm(nextVrm, POSE_PRESETS[0]);
    applyExpressionToVrm(nextVrm, NEUTRAL_EXPRESSION_ACTION);
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
    setError(getErrorMessage(caughtError, "VRM을 불러오지 못했습니다."));
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
    if (vrmRef.current) {
      applyPoseToVrm(vrmRef.current, findPose(poseId));
    }
  }

  function handleExpressionSelect(action: ExpressionAction) {
    setActiveExpressionId(action.id);
    if (vrmRef.current) {
      applyExpressionToVrm(vrmRef.current, action);
    }
  }

  function handleBodyRotationChange(event: ChangeEvent<HTMLInputElement>) {
    setBodyRotation(d(Number(event.currentTarget.value)));
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
                  <CaptureBridge captureRef={captureRef} />
                  <CameraDirector presetId={activeCameraId} />
                  <VrmLighting tone={lightingTone} />
                  {vrm ? <VrmActor bodyRotation={bodyRotation} poseId={activePoseId} vrm={vrm} /> : null}
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
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <UserRound size={15} className="text-accent" aria-hidden />
                  포즈
                </h3>
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
