import { useEffect, useRef, useState, type ChangeEvent, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { AlertTriangle, Camera, ImagePlus, Loader2, RotateCcw, Sparkles, Upload, UserRound, WandSparkles, X } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";

type StudioVrmPoserProps = {
  open: boolean;
  onClose: () => void;
  onInsert: (pngDataUrl: string, width: number, height: number) => void;
};

type LoadStatus = "empty" | "loading" | "ready" | "error";
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
};

type CameraPreset = {
  id: string;
  label: string;
  position: Vec3;
  target: Vec3;
  fov: number;
};

const SAMPLE_VRM_URL = "/vrm/sample.vrm";
const BASE_ROTATION_Y_KEY = "studioVrmBaseRotationY";
const EXPORT_HEIGHT = 520;
const FALLBACK_EXPORT_WIDTH = 360;
const d = THREE.MathUtils.degToRad;

const CONTROL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const EXPRESSION_ACTIONS: ExpressionAction[] = [
  { id: "neutral", label: "무표정", name: null },
  { id: "happy", label: "행복", name: "happy" },
  { id: "angry", label: "화남", name: "angry" },
  { id: "sad", label: "슬픔", name: "sad" },
  { id: "relaxed", label: "편안", name: "relaxed" },
  { id: "surprised", label: "놀람", name: "surprised" },
  { id: "blink", label: "눈감음", name: "blink" },
];

const EXPRESSION_NAMES_TO_CLEAR = EXPRESSION_ACTIONS.map((action) => action.name).filter((name): name is string => name !== null);

const POSE_PRESETS: PosePreset[] = [
  {
    id: "default",
    label: "기본",
    tone: "스탠딩",
    bones: {
      spine: [d(1), 0, 0],
      chest: [d(-1), 0, 0],
      neck: [d(2), 0, 0],
      head: [d(-2), 0, 0],
      leftUpperArm: [0, 0, d(62)],
      rightUpperArm: [0, 0, d(-62)],
      leftLowerArm: [0, 0, d(-8)],
      rightLowerArm: [0, 0, d(8)],
      leftHand: [0, 0, d(5)],
      rightHand: [0, 0, d(-5)],
      leftUpperLeg: [d(2), 0, d(2)],
      rightUpperLeg: [d(-2), 0, d(-2)],
    },
  },
  {
    id: "wave",
    label: "손인사",
    tone: "밝은 등장",
    bones: {
      spine: [d(-3), d(-4), 0],
      chest: [d(3), d(-7), d(3)],
      head: [d(-2), d(5), d(-4)],
      leftUpperArm: [d(2), 0, d(68)],
      leftLowerArm: [0, 0, d(-14)],
      rightUpperArm: [d(-18), d(-24), d(-132)],
      rightLowerArm: [d(-8), d(6), d(-78)],
      rightHand: [d(0), d(0), d(-26)],
      rightIndexProximal: [d(-8), 0, 0],
      rightMiddleProximal: [d(-8), 0, 0],
      rightRingProximal: [d(-8), 0, 0],
      rightLittleProximal: [d(-8), 0, 0],
    },
  },
  {
    id: "point",
    label: "가리키기",
    tone: "대사 강조",
    bones: {
      hips: [0, d(-5), 0],
      spine: [d(-2), d(7), 0],
      chest: [d(1), d(10), d(-2)],
      head: [d(-1), d(-7), d(2)],
      leftUpperArm: [d(2), 0, d(68)],
      leftLowerArm: [0, 0, d(-18)],
      rightUpperArm: [d(-8), d(-66), d(-84)],
      rightLowerArm: [d(0), d(-6), d(-8)],
      rightHand: [d(0), d(-4), d(-4)],
      rightThumbProximal: [d(18), d(-8), d(18)],
      rightIndexProximal: [d(-4), 0, 0],
      rightMiddleProximal: [d(52), 0, 0],
      rightRingProximal: [d(55), 0, 0],
      rightLittleProximal: [d(58), 0, 0],
    },
  },
  {
    id: "cheer",
    label: "만세",
    tone: "환호",
    bones: {
      hips: [d(-2), 0, 0],
      spine: [d(-7), 0, 0],
      chest: [d(9), 0, 0],
      head: [d(-6), 0, 0],
      leftUpperArm: [d(-8), d(9), d(158)],
      rightUpperArm: [d(-8), d(-9), d(-158)],
      leftLowerArm: [d(-8), 0, d(18)],
      rightLowerArm: [d(-8), 0, d(-18)],
      leftHand: [d(4), 0, d(16)],
      rightHand: [d(4), 0, d(-16)],
      leftUpperLeg: [d(-2), 0, d(5)],
      rightUpperLeg: [d(2), 0, d(-5)],
    },
  },
  {
    id: "think",
    label: "생각",
    tone: "고민 컷",
    bones: {
      hips: [0, d(4), 0],
      spine: [d(7), d(-6), d(-2)],
      chest: [d(3), d(-9), d(-3)],
      neck: [d(2), d(6), d(3)],
      head: [d(10), d(7), d(4)],
      leftUpperArm: [d(3), 0, d(76)],
      leftLowerArm: [d(0), 0, d(-22)],
      rightUpperArm: [d(12), d(-18), d(-72)],
      rightLowerArm: [d(-24), d(-8), d(-116)],
      rightHand: [d(8), d(-8), d(-26)],
      rightIndexProximal: [d(28), 0, 0],
      rightMiddleProximal: [d(34), 0, 0],
    },
  },
  {
    id: "sit",
    label: "앉기-approx",
    tone: "패널 배치용",
    yOffset: -0.38,
    bones: {
      hips: [d(-8), 0, 0],
      spine: [d(8), 0, 0],
      chest: [d(-2), 0, 0],
      head: [d(-2), 0, 0],
      leftUpperArm: [d(7), d(5), d(76)],
      rightUpperArm: [d(7), d(-5), d(-76)],
      leftLowerArm: [d(0), 0, d(-42)],
      rightLowerArm: [d(0), 0, d(42)],
      leftUpperLeg: [d(-82), d(0), d(7)],
      rightUpperLeg: [d(-82), d(0), d(-7)],
      leftLowerLeg: [d(86), 0, 0],
      rightLowerLeg: [d(86), 0, 0],
      leftFoot: [d(-12), 0, d(4)],
      rightFoot: [d(-12), 0, d(-4)],
    },
  },
];

const CAMERA_PRESETS: CameraPreset[] = [
  { id: "front", label: "정면", position: [0, 1.42, 3.15], target: [0, 1.22, 0], fov: 30 },
  { id: "threeQuarter", label: "사선", position: [1.55, 1.48, 2.75], target: [0, 1.2, 0], fov: 31 },
  { id: "low", label: "로우", position: [0.52, 0.92, 3.02], target: [0, 1.18, 0], fov: 32 },
  { id: "bust", label: "상반신", position: [0, 1.68, 2.1], target: [0, 1.45, 0], fov: 27 },
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

  EXPRESSION_NAMES_TO_CLEAR.forEach((name) => {
    if (expressionManager.getExpression(name)) {
      expressionManager.setValue(name, 0);
    }
  });

  if (action.name && expressionManager.getExpression(action.name)) {
    expressionManager.setValue(action.name, 1);
  }

  expressionManager.update();
  vrm.update(0);
  return true;
}

function getAvailableExpressionActions(vrm: VRM | null) {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) return [];

  return EXPRESSION_ACTIONS.filter((action) => {
    if (!action.name) return true;
    return expressionManager.getExpression(action.name) !== null;
  });
}

function getModelTitle(vrm: VRM | null, fallbackName: string) {
  if (!vrm) return "";
  if (vrm.meta.metaVersion === "0") {
    return vrm.meta.title ?? fallbackName;
  }
  return vrm.meta.name || fallbackName;
}

function roundExportSize(canvas: HTMLCanvasElement) {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { width: FALLBACK_EXPORT_WIDTH, height: EXPORT_HEIGHT };
  }

  const aspect = canvas.width / canvas.height;
  return { width: Math.round(EXPORT_HEIGHT * aspect), height: EXPORT_HEIGHT };
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

function VrmLighting() {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const loadRequestRef = useRef(0);
  const captureRef = useRef<CaptureState>({ camera: null, gl: null, scene: null });
  const activeCamera = findCameraPreset(activeCameraId);
  const availableExpressionActions = getAvailableExpressionActions(vrm);
  const displayModelName = getModelTitle(vrm, modelName);

  useEffect(() => {
    return () => {
      loadRequestRef.current += 1;
      if (vrmRef.current) {
        disposeVrm(vrmRef.current);
        vrmRef.current = null;
      }
    };
  }, []);

  function clearCurrentVrm() {
    if (vrmRef.current) {
      disposeVrm(vrmRef.current);
      vrmRef.current = null;
    }
    setVrm(null);
  }

  function installVrm(nextVrm: VRM, nextModelName: string) {
    clearCurrentVrm();
    vrmRef.current = nextVrm;
    setVrm(nextVrm);
    setModelName(nextModelName);
    setActivePoseId("default");
    setActiveExpressionId("neutral");
    setBodyRotation(0);
    applyPoseToVrm(nextVrm, POSE_PRESETS[0]);
    applyExpressionToVrm(nextVrm, EXPRESSION_ACTIONS[0]);
    setStatus("ready");
  }

  function loadModelFromUrl(url: string, nextModelName: string, revokeUrl: boolean) {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setStatus("loading");
    setError("");
    clearCurrentVrm();

    loadVrmAsset(url)
      .then((loadedVrm) => {
        if (requestId !== loadRequestRef.current) {
          disposeVrm(loadedVrm);
          return;
        }
        installVrm(loadedVrm, nextModelName);
      })
      .catch((caughtError: unknown) => {
        if (requestId !== loadRequestRef.current) return;
        const message = caughtError instanceof Error ? caughtError.message : "VRM을 불러오지 못했습니다.";
        setError(message);
        setStatus("error");
      })
      .finally(() => {
        if (revokeUrl) {
          URL.revokeObjectURL(url);
        }
      });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    loadModelFromUrl(objectUrl, file.name.replace(/\.vrm$/i, ""), true);
  }

  function handleSampleLoad() {
    loadModelFromUrl(SAMPLE_VRM_URL, "sample.vrm", false);
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
                  <VrmLighting />
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
                    <div className="max-w-[18rem]">
                      <div className="mx-auto grid size-12 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
                        <Sparkles size={22} aria-hidden />
                      </div>
                      <p className="mt-4 text-sm font-bold text-fg">VRM 파일을 올려 시작하세요.</p>
                      <p className="mt-2 text-xs leading-relaxed text-fg-3">
                        VRoid Studio에서 무료로 캐릭터를 만들고 .vrm으로 내보낸 뒤 업로드할 수 있습니다.
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <button type="button" className={cx(CONTROL_BUTTON, "border-accent/50 bg-accent text-on-accent")} onClick={() => fileInputRef.current?.click()}>
                          <Upload size={14} aria-hidden />
                          업로드
                        </button>
                        <button type="button" className={cx(CONTROL_BUTTON, "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")} onClick={handleSampleLoad}>
                          샘플
                        </button>
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
                    모델
                  </h3>
                  {status === "ready" ? <span className="max-w-36 truncate text-[0.68rem] text-fg-3">{displayModelName}</span> : null}
                </div>
                <input ref={fileInputRef} accept=".vrm" className="sr-only" type="file" onChange={handleFileChange} />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={cx(CONTROL_BUTTON, "border-accent/50 bg-accent text-on-accent hover:bg-accent/90")} onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} aria-hidden />
                    VRM 업로드
                  </button>
                  <button type="button" className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-accent-soft hover:text-accent")} onClick={handleSampleLoad}>
                    <WandSparkles size={14} aria-hidden />
                    샘플 불러오기
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Sparkles size={15} className="text-accent" aria-hidden />
                  표정
                </h3>
                {availableExpressionActions.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {availableExpressionActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className={cx(
                          CONTROL_BUTTON,
                          activeExpressionId === action.id
                            ? "border-accent/55 bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                        onClick={() => handleExpressionSelect(action)}
                      >
                        {action.label}
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
