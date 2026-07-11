import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { TransformControls } from "@react-three/drei/core/TransformControls.js";
import { Canvas, useThree } from "@react-three/fiber";
import {
  AlertTriangle,
  Boxes,
  Camera,
  CircleDashed,
  Cone,
  Copy,
  Cylinder,
  Globe,
  Hexagon,
  ImagePlus,
  Layers,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Move,
  PackageOpen,
  Pill,
  Pyramid,
  Redo2,
  RectangleHorizontal,
  RotateCw,
  Scaling,
  Trash2,
  Triangle,
  Torus as TorusIcon,
  Umbrella,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";

import {
  admitStoredBg3dModelForRendering,
  createStudioBg3dModelAttachment,
  deleteStoredBg3dModel,
  getStoredBg3dModel,
  getStoredBg3dModelByHash,
  importVerifiedBg3dModelsAtomically,
  listBg3dModelLibraryEntries,
  type Bg3dModelLibraryEntry,
  type Bg3dVerifiedStoredRecord,
} from "./bg3d-model-library";
import {
  COMPOSITE_CATEGORIES,
  COMPOSITE_CATEGORY_LABELS,
  COMPOSITE_PRESETS,
  instantiateCompositePreset,
  type BgCompositeCategory,
} from "./studio-background-3d-composites";
import {
  cloneBgCustomModelInstances,
  cloneStudioBg3dThreeObject,
  checkStudioBg3dThreeBudgets,
  computeAutoFitScale,
  createBgCustomModelInstance,
  duplicateBgCustomModelInstance,
  loadVerifiedStudioBg3dGlbWithThree,
  measureBg3dObjectSize,
  parseBg3dSceneWithModelsFromDataUrl,
  type BgCustomModelInstance,
  type StudioBg3dThreeLoadSuccess,
} from "./studio-background-3d-model";
import {
  clonePrimitives,
  createPrimitive,
  duplicatePrimitive,
  makeGeometry,
  PRIMITIVE_DEFS,
  roundExportSize,
  type BgPrimitive,
  type BgPrimitiveKind,
} from "./studio-background-3d-primitives";
import {
  BG_SCENE_TEMPLATES,
  instantiateSceneTemplate,
  type BgSceneTemplateCategory,
} from "./studio-background-3d-scene-templates";
import { BG_SKY_PRESETS, DEFAULT_SKY_PRESET_ID, getSkyPreset } from "./studio-background-3d-sky";
import {
  deriveStudioBg3dGlbValidationPolicy,
  resolveStudioBg3dDeviceQuality,
  type StudioBg3dDeviceSignals,
  type StudioBg3dResolvedDeviceQuality,
} from "./studio-bg3d-device-quality";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dCameraSettings,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneBudgets,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";
import { StudioBg3dSceneTemplatePanel } from "./StudioBg3dSceneTemplatePanel";

export interface StudioBackground3DInsertResult {
  readonly pngDataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly bg3dScene: StudioBg3dSceneDocument;
}

export interface StudioBackground3DProps {
  open: boolean;
  initialDataUrl?: string;
  initialScene?: StudioBg3dSceneDocument;
  onClose: () => void;
  onInsert: (result: StudioBackground3DInsertResult) => boolean | void;
}

type TransformModeId = "translate" | "rotate" | "scale";
type BgPanelTab = "shapes" | "templates" | "layers" | "view" | "models";
type CaptureState = { gl: THREE.WebGLRenderer | null; scene: THREE.Scene | null; camera: THREE.Camera | null };
type ModelRootCacheEntry = Pick<StudioBg3dThreeLoadSuccess, "root" | "dispose"> & {
  readonly record: Bg3dVerifiedStoredRecord;
  readonly metrics: StudioBg3dThreeLoadSuccess["metrics"];
  readonly admittedProfiles: Set<StudioBg3dResolvedDeviceQuality["profile"]>;
};

const CONTROL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9";
const ICON_BUTTON =
  "inline-grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-9";
const VIEWPORT_BTN =
  "grid size-11 place-items-center rounded-lg border border-line/70 bg-panel/80 text-fg-2 shadow-sm backdrop-blur transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-9";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const BG_PANEL_TABS: Array<{ id: BgPanelTab; label: string; icon: typeof Boxes; hint: string }> = [
  { id: "shapes", label: "도형", icon: Boxes, hint: "추가 · 선택한 도형 수치 편집" },
  { id: "templates", label: "템플릿", icon: LayoutTemplate, hint: "교실·거리·카페처럼 완성된 공간을 한 번에 추가" },
  { id: "layers", label: "레이어", icon: Layers, hint: "목록 · 선택 · 복제 · 삭제" },
  { id: "view", label: "보기", icon: Camera, hint: "카메라 프리셋 · 선화 미리보기" },
  { id: "models", label: "모델", icon: PackageOpen, hint: "업로드 · 배치 · 삭제" },
];

const TRANSFORM_MODES: Array<{ id: TransformModeId; label: string; icon: typeof Move; title: string }> = [
  { id: "translate", label: "이동", icon: Move, title: "이동 (T)" },
  { id: "rotate", label: "회전", icon: RotateCw, title: "회전 (R)" },
  { id: "scale", label: "크기", icon: Scaling, title: "크기 (S)" },
];

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
  const serialized = serializeStudioBg3dSceneDocument(raw);
  return serialized ? parseStudioBg3dSceneDocument(serialized) : null;
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

function sceneModelByteTotal(attachments: ReadonlyMap<string, StudioBg3dModelAttachment>): number {
  const hashes = new Set<string>();
  let total = 0;
  for (const attachment of attachments.values()) {
    if (hashes.has(attachment.hash)) continue;
    hashes.add(attachment.hash);
    total += attachment.byteSize;
  }
  return total;
}

function placedModelByteTotal(
  models: readonly BgCustomModelInstance[],
  attachments: ReadonlyMap<string, StudioBg3dModelAttachment>,
  excludedStorageId?: string
): number {
  const usedStorageIds = new Set(models.map((model) => model.modelId));
  if (excludedStorageId) usedStorageIds.delete(excludedStorageId);
  const selected = new Map<string, StudioBg3dModelAttachment>();
  for (const storageId of usedStorageIds) {
    const attachment = attachments.get(storageId);
    if (attachment) selected.set(storageId, attachment);
  }
  return sceneModelByteTotal(selected);
}

async function admitAndCacheModel(args: {
  readonly record: Bg3dVerifiedStoredRecord;
  readonly document: StudioBg3dSceneDocument;
  readonly quality: StudioBg3dResolvedDeviceQuality;
  readonly cumulativeUsedBytes: number;
  readonly cache: Map<string, ModelRootCacheEntry>;
  readonly pending: Map<string, Promise<ModelRootCacheEntry>>;
  readonly isActive: () => boolean;
}): Promise<ModelRootCacheEntry> {
  const policy = deriveStudioBg3dGlbValidationPolicy(args.document, args.quality);
  const selectedBudgets: StudioBg3dSceneBudgets = policy.budgets[policy.profile];
  const cached = args.cache.get(args.record.id);
  if (cached) {
    if (!cached.admittedProfiles.has(policy.profile)) {
      await admitStoredBg3dModelForRendering(args.record.id, {
        profile: policy.profile,
        budgets: policy.budgets,
        cumulativeUsedBytes: args.cumulativeUsedBytes,
        maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
      });
      const budgetFailure = checkStudioBg3dThreeBudgets(cached.metrics, selectedBudgets);
      if (budgetFailure) throw new Error(budgetFailure.message);
      cached.admittedProfiles.add(policy.profile);
    }
    return cached;
  }
  const pending = args.pending.get(args.record.id);
  if (pending) {
    await pending;
    return admitAndCacheModel(args);
  }

  const task = (async (): Promise<ModelRootCacheEntry> => {
    const verification = await admitStoredBg3dModelForRendering(args.record.id, {
      profile: policy.profile,
      budgets: policy.budgets,
      cumulativeUsedBytes: args.cumulativeUsedBytes,
      maximumCumulativeBytes: selectedBudgets.complexity.maxModelBytes,
    });
    const loaded = await loadVerifiedStudioBg3dGlbWithThree(verification, selectedBudgets);
    if (!loaded.ok) throw new Error(loaded.message);
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
    const entry: ModelRootCacheEntry = {
      root: loaded.root,
      dispose: loaded.dispose,
      record: args.record,
      metrics: loaded.metrics,
      admittedProfiles: new Set([policy.profile]),
    };
    args.cache.set(args.record.id, entry);
    return entry;
  })();
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
function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/* ── R3F Canvas 내부에서 렌더러/씬/카메라를 꺼내 캡처용 ref에 흘려보내는 다리.
   VRM 포저의 CaptureBridge와 동일한 패턴 — ref-not-state라 마운트마다 리렌더를 유발하지 않는다. */
function CaptureBridge({ onCaptureUpdate }: { onCaptureUpdate: (state: CaptureState, cleanupGl?: THREE.WebGLRenderer | null) => void }) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    onCaptureUpdate({ camera, gl, scene });
    return () => {
      onCaptureUpdate({ camera: null, gl: null, scene: null }, gl);
    };
  }, [camera, gl, scene, onCaptureUpdate]);

  return null;
}

/* 뷰포트 하늘색 프리셋 적용 — clearColor는 캡처/내보내기에 무관한 순수 화면 장식이라
   BgSceneState/undo 히스토리 밖 로컬 state로 관리하고, 여기서만 명령형으로 gl에 반영한다
   (CaptureBridge와 동일하게 useThree 로 Canvas 내부 gl을 꺼내 쓰는 다리 컴포넌트). */
function SkyClearColorController({ clearColor }: { clearColor: string }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.setClearColor(clearColor, 1);
  }, [gl, clearColor]);
  return null;
}

type OrbitLike = { target?: THREE.Vector3; update?: () => void } | null;
type BgViewportApi = {
  zoomBy: (factor: number) => void;
  applyPreset: (presetId: string) => void;
  applyView: (view: StudioBg3dCameraSettings) => void;
  readView: () => StudioBg3dCameraSettings;
};

/* Canvas 내부에서 카메라/컨트롤을 잡아 줌·프리셋 같은 명령형 동작을 패널 오버레이(Canvas 밖 HTML 버튼)에
   노출한다. target을 OrbitControls의 JSX prop으로 매 렌더 다시 넘기면(리터럴 배열은 매번 새 참조라
   drei가 매 커밋마다 controls.target.set(...)을 호출) 사용자가 패닝한 뒤에도 다른 상태 변경(도형 이동 등)
   때마다 시점이 원점으로 되돌아가 버린다. 그래서 초기 타깃/프리셋 적용은 전부 여기서 명령형으로만 수행한다. */
function BgViewportController({ onReady }: { onReady: (api: BgViewportApi | null) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitLike;

  useEffect(() => {
    if (controls?.target) {
      controls.target.set(DEFAULT_CAMERA_TARGET[0], DEFAULT_CAMERA_TARGET[1], DEFAULT_CAMERA_TARGET[2]);
      controls.update?.();
    }
  }, [controls]);

  useEffect(() => {
    onReady({
      zoomBy: (factor) => {
        const target = controls?.target ?? new THREE.Vector3(...DEFAULT_CAMERA_TARGET);
        const offset = camera.position.clone().sub(target);
        const dist = THREE.MathUtils.clamp(offset.length() * factor, 2, 60);
        offset.setLength(dist);
        camera.position.copy(target).add(offset);
        camera.updateMatrixWorld();
        controls?.update?.();
      },
      applyPreset: (presetId) => {
        const preset = CAMERA_PRESETS[presetId];
        if (!preset) return;
        camera.position.set(preset.position[0], preset.position[1], preset.position[2]);
        camera.updateMatrixWorld();
        if (controls?.target) {
          controls.target.set(preset.target[0], preset.target[1], preset.target[2]);
          controls.update?.();
        } else {
          camera.lookAt(preset.target[0], preset.target[1], preset.target[2]);
        }
      },
      applyView: (view) => {
        if (camera instanceof THREE.PerspectiveCamera) {
          const projection = new THREE.PerspectiveCamera(
            view.fovDegrees,
            camera.aspect,
            camera.near,
            camera.far
          );
          camera.copy(projection, false);
        }
        camera.position.set(view.position[0], view.position[1], view.position[2]);
        camera.updateMatrixWorld();
        if (controls?.target) {
          controls.target.set(view.target[0], view.target[1], view.target[2]);
          controls.update?.();
        } else {
          camera.lookAt(view.target[0], view.target[1], view.target[2]);
        }
      },
      readView: () => {
        const target = controls?.target ?? new THREE.Vector3(...DEFAULT_CAMERA_TARGET);
        const fovDegrees = camera instanceof THREE.PerspectiveCamera ? camera.fov : 50;
        return {
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [target.x, target.y, target.z],
          fovDegrees,
        };
      },
    });
    return () => onReady(null);
  }, [camera, controls, onReady]);

  return null;
}

/* 뷰포트 공간감을 위한 그리드+바닥 원반. 씬 데이터(primitives)에는 절대 포함되지 않고
   내보내기(라인아트 캡처) 시에는 항상 숨긴다 — 참조용 뷰포트 보조물일 뿐 결과물이 아니다. */
function BgGroundHelper({ visible }: { visible: boolean }) {
  return (
    <group visible={visible}>
      <gridHelper args={[40, 40, "#c7ccd6", "#e7e9ee"]} position={[0, -0.001, 0]} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]}>
        <circleGeometry args={[9, 40]} />
        <meshBasicMaterial color="#eef1f5" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

interface BgPrimitiveMeshProps {
  prim: BgPrimitive;
  lineArt: boolean;
  onSelect: (id: string) => void;
  registerRef: (id: string, obj: THREE.Group | null) => void;
}

/* 도형 하나의 렌더 — 셰이딩 채움 + 검은 엣지 오버레이를 항상 함께 그린다.
   라인아트 모드에서도 채움 메시를 visible={false}로 숨기지 않고 unlit 흰색(meshBasicMaterial)으로만
   바꾸는 게 핵심: 깊이쓰기가 계속 켜져 있어 (1) 가려진 도형의 엣지가 앞 도형에 정확히 가려지는
   hidden-line-removal이 유지되고 (2) three.js/R3F가 invisible 오브젝트는 레이캐스트에서 제외하므로
   라인아트 미리보기 중에도 클릭 선택이 계속 동작한다. */
function BgPrimitiveMesh({ prim, lineArt, onSelect, registerRef }: BgPrimitiveMeshProps) {
  const geometry = useMemo(() => makeGeometry(prim.kind), [prim.kind]);
  // BoxGeometry의 각 면은 삼각형 2장(동일 평면)이라 임계각이 낮으면 면 대각선에 가짜 엣지가 그려진다.
  // 20°는 그 가짜 대각선은 없애면서 상자 모서리·원기둥 캡 테두리 같은 실제 크리스는 모두 살린다.
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 20), [geometry]);
  // geometry/edges는 <mesh geometry={geometry}> 처럼 prop으로 붙어 JSX 자식이 아니므로 R3F의
  // 언마운트 시 자동 dispose 재귀(child.children만 훑음)가 이 둘을 못 본다 — 직접 해제하지 않으면
  // 도형을 추가·삭제할 때마다 GPU BufferGeometry가 새는다. useMemo 의존성이 바뀌어 새 지오메트리로
  // 교체될 때도 이전 것을 여기서 정리한다.
  useEffect(() => {
    return () => {
      geometry.dispose();
      edges.dispose();
    };
  }, [geometry, edges]);

  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    registerRef(prim.id, groupRef.current);
    return () => registerRef(prim.id, null);
  }, [prim.id, registerRef]);

  return (
    <group
      ref={groupRef}
      position={prim.position}
      rotation={prim.rotation}
      scale={prim.scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(prim.id);
      }}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
        {lineArt ? (
          <meshBasicMaterial color="#ffffff" polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        ) : (
          <meshStandardMaterial color={prim.color} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        )}
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#000000" />
      </lineSegments>
    </group>
  );
}

interface BgCustomModelMeshProps {
  instance: BgCustomModelInstance;
  cachedRoot: THREE.Object3D | undefined;
  onSelect: (id: string) => void;
  registerRef: (id: string, obj: THREE.Group | null) => void;
  onCloneStatus: (id: string, ok: boolean) => void;
}

function BgCustomModelMesh({ instance, cachedRoot, onSelect, registerRef, onCloneStatus }: BgCustomModelMeshProps) {
  // 검증 로더의 루트를 인스턴스마다 복제하되, 스킨 메시가 있으면 SkeletonUtils.clone을 거쳐 뼈와
  // 스켈레톤 바인딩을 분리한다. geometry/material은 로더 캐시가 소유하므로 여기서는 dispose하지 않는다.
  const [cloned, setCloned] = useState<THREE.Object3D | null>(null);
  const onCloneStatusRef = useRef(onCloneStatus);
  useEffect(() => {
    onCloneStatusRef.current = onCloneStatus;
  });
  useEffect(() => {
    let active = true;
    setCloned(null);
    if (!cachedRoot) {
      onCloneStatusRef.current(instance.id, false);
      return () => {
        active = false;
      };
    }
    void cloneStudioBg3dThreeObject(cachedRoot)
      .then((next) => {
        if (!active) return;
        setCloned(next);
        onCloneStatusRef.current(instance.id, true);
      })
      .catch(() => {
        if (!active) return;
        onCloneStatusRef.current(instance.id, false);
      });
    return () => {
      active = false;
    };
  }, [cachedRoot, instance.id]);

  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    registerRef(instance.id, groupRef.current);
    return () => registerRef(instance.id, null);
  }, [instance.id, registerRef]);

  if (!cloned) return null;

  return (
    <group
      ref={groupRef}
      position={instance.position}
      rotation={instance.rotation}
      scale={instance.scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(instance.id);
      }}
    >
      <primitive object={cloned} />
    </group>
  );
}

function Vec3Field({
  label,
  values,
  step,
  precision,
  suffix,
  onCommit,
}: {
  label: string;
  values: [number, number, number];
  step: number;
  precision: number;
  suffix?: string;
  onCommit: (index: 0 | 1 | 2, value: number) => void;
}) {
  const axisLabels = ["X", "Y", "Z"] as const;
  return (
    <div>
      <p className="mb-1 text-[0.68rem] font-semibold text-fg-3">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {axisLabels.map((axisLabel, i) => (
          <label key={axisLabel} className="flex items-center gap-1 rounded-lg border border-line bg-card px-1.5 py-1 text-[0.7rem]">
            <span className="text-fg-3">{axisLabel}</span>
            <input
              type="number"
              step={step}
              value={round(values[i as 0 | 1 | 2], precision)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onCommit(i as 0 | 1 | 2, n);
              }}
              className="w-full min-w-0 bg-transparent text-right text-fg outline-none"
            />
            {suffix ? <span className="text-fg-3">{suffix}</span> : null}
          </label>
        ))}
      </div>
    </div>
  );
}

export function StudioBackground3D({ open, initialDataUrl, initialScene, onClose, onInsert }: StudioBackground3DProps) {
  const [primitives, setPrimitives] = useState<BgPrimitive[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformModeId>("translate");
  const [lineArtPreview, setLineArtPreview] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanelTab, setActivePanelTab] = useState<BgPanelTab>("shapes");
  const [viewportHinted, setViewportHinted] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // 뷰포트 전용 하늘색 — BgSceneState/undo 히스토리 밖(§SkyClearColorController 참고).
  const [skyPresetId, setSkyPresetId] = useState(DEFAULT_SKY_PRESET_ID);
  // 복합 오브젝트 프리셋 그리드 카테고리 필터. null=전체.
  const [compositeCategory, setCompositeCategory] = useState<BgCompositeCategory | null>(null);
  // 씬 템플릿 그리드 카테고리 필터. null=전체. compositeCategory와 동형이지만 별개 상태 —
  // BgSceneTemplateCategory와 BgCompositeCategory는 서로 다른 타입이라 공유할 수 없다("공간 종류" vs
  // "물체 종류"라는 다른 축, studio-background-3d-scene-templates.ts 상단 주석 참고).
  const [sceneTemplateCategory, setSceneTemplateCategory] = useState<BgSceneTemplateCategory | null>(null);
  // 배경(하늘색)을 캡처에서 빼고 오브젝트만 알파 채널로 남길지 — 다른 배경/레이어와 자유롭게
  // 합성할 수 있는 PNG를 만들기 위함. 뷰포트 표시 자체(하늘색 프리셋)는 계속 그대로 보여주고,
  // 실제로 alpha=0 clearColor 로 바꾸는 건 handleInsert 캡처 순간뿐이다(사용자가 작업 중엔 여전히
  // 하늘색 배경을 보면서 구도를 잡을 수 있게).
  const [transparentInsert, setTransparentInsert] = useState(false);

  // 업로드된 커스텀 3D 모델(§bg3d-model-library.ts)의 씬 배치 인스턴스 + 라이브러리 목록/상태.
  const [customModels, setCustomModels] = useState<BgCustomModelInstance[]>([]);
  const [modelLibrary, setModelLibrary] = useState<Bg3dModelLibraryEntry[]>([]);
  const [modelLibraryStatus, setModelLibraryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [isRestoringScene, setIsRestoringScene] = useState(false);
  const [sceneRecoveryError, setSceneRecoveryError] = useState<string | null>(null);
  const [failedCloneIds, setFailedCloneIds] = useState<Set<string>>(() => new Set());
  const [readyCloneIds, setReadyCloneIds] = useState<Set<string>>(() => new Set());
  const [sceneBaseDocument, setSceneBaseDocument] = useState<StudioBg3dSceneDocument>(
    () => canonicalSceneDocument(initialScene) ?? DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT
  );
  const [deviceSignals, setDeviceSignals] = useState<StudioBg3dDeviceSignals>(() => collectDeviceSignals());

  const captureRef = useRef<CaptureState>({ camera: null, gl: null, scene: null });
  const viewportApiRef = useRef<BgViewportApi | null>(null);
  const pendingInitialCameraRef = useRef<StudioBg3dCameraSettings | null>(null);
  const viewportHostRef = useRef<HTMLDivElement>(null);
  const primitiveObjectsRef = useRef<Map<string, THREE.Group>>(new Map());
  const [, setRefTick] = useState(0);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  // storage id는 이 두 Map과 검증 캐시 안에서만 쓰며 Studio 장면 문서에는 절대 직렬화하지 않는다.
  const modelRootCacheRef = useRef<Map<string, ModelRootCacheEntry>>(new Map());
  const modelLoadPendingRef = useRef<Map<string, Promise<ModelRootCacheEntry>>>(new Map());
  const attachmentByStorageModelIdRef = useRef<Map<string, StudioBg3dModelAttachment>>(new Map());
  const storageModelIdByAttachmentIdRef = useRef<Map<string, string>>(new Map());
  const componentActiveRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const historyRef = useRef<{ primitives: BgPrimitive[]; customModels: BgCustomModelInstance[] }[]>([]);
  const historyIndexRef = useRef(-1);
  const isRestoringRef = useRef(false);

  const deviceQuality = resolveStudioBg3dDeviceQuality({
    document: sceneBaseDocument,
    mode: isCapturing ? "capture" : "edit",
    signals: deviceSignals,
  });
  const hasCloneFailure = customModels.some((model) => failedCloneIds.has(model.id));
  const hasPendingClone = customModels.some(
    (model) => !readyCloneIds.has(model.id) && !failedCloneIds.has(model.id)
  );
  const insertBlocked = Boolean(sceneRecoveryError) || hasCloneFailure || hasPendingClone || isRestoringScene;

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
  }, [open]);

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
  }, [open]);

  // 모델 라이브러리 목록은 모달이 열릴 때 한 번 읽어온다(VRM 포저의 listVrmLibraryEntries() 패턴과 동일).
  useEffect(() => {
    if (!open) return;
    setModelLibraryStatus("loading");
    listBg3dModelLibraryEntries()
      .then((entries) => {
        setModelLibrary(entries);
        setModelLibraryStatus("ready");
      })
      .catch(() => setModelLibraryStatus("error"));
  }, [open]);

  // 신규 장면 문서는 hash로 검증 레코드를 찾고, admission→Three 안전 파서를 모두 통과한 뒤 runtime
  // 배열로 hydrate한다. 실패한 모델 노드는 절대 저장 시 조용히 제거하지 않고 업데이트 자체를 잠근다.
  // initialScene이 없을 때만 과거 PNG fragment를 읽어 하위 호환한다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsRestoringScene(true);
    setSceneRecoveryError(null);
    setError(null);
    setSelectedId(null);
    setFailedCloneIds(new Set());
    setReadyCloneIds(new Set());
    disposeModelCache(modelRootCacheRef.current);
    modelLoadPendingRef.current.clear();
    attachmentByStorageModelIdRef.current.clear();
    storageModelIdByAttachmentIdRef.current.clear();

    void (async () => {
      const canonicalInitial = canonicalSceneDocument(initialScene);
      if (initialScene && !canonicalInitial) {
        if (!cancelled) {
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
        setTransparentInsert(
          canonicalInitial.output.transparentBackground || canonicalInitial.background.mode === "transparent"
        );
        setSkyPresetId(canonicalInitial.background.skyPresetId);
        pendingInitialCameraRef.current = canonicalInitial.camera;
        viewportApiRef.current?.applyView(canonicalInitial.camera);

        const quality = resolveDeviceQuality(canonicalInitial, viewportHostRef.current);
        let cumulativeUsedBytes = 0;
        let recoveryFailed = false;
        for (const attachment of canonicalInitial.attachments) {
          if (cancelled) return;
          try {
            const record = await getStoredBg3dModelByHash(attachment.hash);
            if (!record || !attachmentMatchesRecord(attachment, record)) throw new Error("attachment-mismatch");
            await admitAndCacheModel({
              record,
              document: canonicalInitial,
              quality,
              cumulativeUsedBytes,
              cache: modelRootCacheRef.current,
              pending: modelLoadPendingRef.current,
              isActive: () => !cancelled && componentActiveRef.current,
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
        if (cancelled) return;
        setPrimitives(hydrated.primitives);
        setCustomModels(hydrated.customModels);
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
        isRestoringRef.current = true;
        setIsRestoringScene(false);
        return;
      }

      const parsed = parseBg3dSceneWithModelsFromDataUrl(initialDataUrl);
      setSceneBaseDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT);
      setTransparentInsert(false);
      setSkyPresetId(DEFAULT_SKY_PRESET_ID);
      pendingInitialCameraRef.current = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera;
      viewportApiRef.current?.applyView(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera);
      const nextPrimitives = parsed?.primitives ?? [];
      const nextModels = parsed?.customModels ?? [];
      setPrimitives(nextPrimitives);
      setCustomModels(nextModels);

      if (nextModels.length > 0) {
        const quality = resolveDeviceQuality(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, viewportHostRef.current);
        let recoveryFailed = false;
        const uniqueStorageIds = [...new Set(nextModels.map((model) => model.modelId))];
        for (const storageId of uniqueStorageIds) {
          if (cancelled) return;
          try {
            const record = await getStoredBg3dModel(storageId);
            if (!record) throw new Error("missing-record");
            const attachment = createStudioBg3dModelAttachment(record);
            await admitAndCacheModel({
              record,
              document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
              quality,
              cumulativeUsedBytes: sceneModelByteTotal(attachmentByStorageModelIdRef.current),
              cache: modelRootCacheRef.current,
              pending: modelLoadPendingRef.current,
              isActive: () => !cancelled && componentActiveRef.current,
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
      if (cancelled) return;
      setRefTick((n) => n + 1);
      isRestoringRef.current = true;
      setIsRestoringScene(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialDataUrl, initialScene]);

  // 편집이 멈추면(디바운스) 스냅샷을 히스토리에 적재 — VRM 포저의 undo 스택과 동일한 패턴.
  // 도형(primitives)과 커스텀 모델(customModels)을 하나의 타임라인 튜플로 묶어 "실행 취소 한 번 =
  // 도형이든 모델이든 씬 전체가 한 스텝 되돌아간다"는 사용자 기대를 지킨다 — 독립된 undo 스택 두 개를
  // 두지 않는다. customModels가 항상 빈 배열인(모델을 한 번도 추가하지 않은) 씬에서는 이 필드가
  // 매 스냅샷 [] 로만 남아 기존 도형 전용 undo/redo 동작과 동일하게 작동한다.
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const snap = { primitives: clonePrimitives(primitives), customModels: cloneBgCustomModelInstances(customModels) };
      const base = historyRef.current.slice(0, historyIndexRef.current + 1);
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
  }, [primitives, customModels]);

  const doUndo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    isRestoringRef.current = true;
    const snap = historyRef.current[historyIndexRef.current];
    setPrimitives(clonePrimitives(snap.primitives));
    setCustomModels(cloneBgCustomModelInstances(snap.customModels));
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };
  const doRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    isRestoringRef.current = true;
    const snap = historyRef.current[historyIndexRef.current];
    setPrimitives(clonePrimitives(snap.primitives));
    setCustomModels(cloneBgCustomModelInstances(snap.customModels));
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const addPrimitive = (kind: BgPrimitiveKind) => {
    const next = createPrimitive(kind, primitives.length);
    setPrimitives((prev) => [...prev, next]);
    setSelectedId(next.id);
  };

  // 복합 오브젝트 프리셋(건물/나무/차량/소품) 추가 — addPrimitive와 동일한 "추가 = 선택" UX,
  // parts[0](앵커 파츠)이 새로 선택된다(instantiateCompositePreset 계약).
  const addComposite = (presetId: string) => {
    const preset = COMPOSITE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const parts = instantiateCompositePreset(preset, primitives.length);
    setPrimitives((prev) => [...prev, ...parts]);
    setSelectedId(parts[0].id);
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
    setSelectedId(parts[0].id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setPrimitives((prev) => prev.filter((p) => p.id !== selectedId));
    setSelectedId(null);
    // 기즈모를 드래그(마우스 버튼 다운)하던 도중 삭제하면 TransformControls가 즉시 언마운트·dispose돼
    // 이후 mouseup이 어디서도 발생하지 않을 수 있다 — isTransforming이 true로 고착돼 OrbitControls가
    // 영영 비활성 상태로 남는 걸 막기 위해 삭제 시점에 방어적으로 false로 되돌린다.
    setIsTransforming(false);
  };

  const deleteSelectedCustomModel = () => {
    if (!selectedId) return;
    setCustomModels((prev) => prev.filter((m) => m.id !== selectedId));
    setSelectedId(null);
    // deleteSelected(도형)와 동일한 이유(§4: 도형·커스텀 모델이 TransformControls를 공유) —
    // 드래그 도중 삭제해도 OrbitControls가 영영 비활성으로 고착되지 않도록 방어적으로 되돌린다.
    setIsTransforming(false);
  };

  // 키보드 Delete/Backspace 전용 — 선택된 것이 도형인지 커스텀 모델인지 몰라도 되는 단일 진입점
  // (§8: primitives에 있으면 도형, 아니면 커스텀 모델로 분기하는 것과 동일한 원칙).
  function deleteSelectedEntity() {
    if (primitives.some((p) => p.id === selectedId)) deleteSelected();
    else deleteSelectedCustomModel();
  }

  const duplicateSelected = () => {
    if (!selectedId) return;
    const original = primitives.find((p) => p.id === selectedId);
    if (!original) return;
    const clone = duplicatePrimitive(original);
    setPrimitives((prev) => [...prev, clone]);
    setSelectedId(clone.id);
  };

  const duplicateSelectedCustomModel = () => {
    if (!selectedId) return;
    const original = customModels.find((m) => m.id === selectedId);
    if (!original) return;
    const clone = duplicateBgCustomModelInstance(original);
    setCustomModels((prev) => [...prev, clone]);
    setSelectedId(clone.id);
  };

  const updateTransform = (id: string, patch: Partial<Pick<BgPrimitive, "position" | "rotation" | "scale">>) => {
    setPrimitives((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  function updateCustomModelTransform(id: string, patch: Partial<Pick<BgCustomModelInstance, "position" | "rotation" | "scale">>) {
    setCustomModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  const updateColor = (id: string, color: string) => {
    setPrimitives((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)));
  };

  const registerPrimitiveRef = (id: string, obj: THREE.Group | null) => {
    if (obj) primitiveObjectsRef.current.set(id, obj);
    else primitiveObjectsRef.current.delete(id);
    setRefTick((n) => n + 1);
  };

  // ── §6 커스텀 3D 모델 추가/업로드/삭제 핸들러 ─────────────────────────────────────────
  async function ensureModelRootCached(modelId: string): Promise<Bg3dVerifiedStoredRecord | null> {
    const record = await getStoredBg3dModel(modelId);
    if (!record) return null;
    const existingAttachment = attachmentByStorageModelIdRef.current.get(modelId);
    const attachment = existingAttachment ?? createStudioBg3dModelAttachment(record);
    const cumulativeUsedBytes = placedModelByteTotal(
      customModels,
      attachmentByStorageModelIdRef.current,
      modelId
    );
    await admitAndCacheModel({
      record,
      document: sceneBaseDocument,
      quality: deviceQuality,
      cumulativeUsedBytes,
      cache: modelRootCacheRef.current,
      pending: modelLoadPendingRef.current,
      isActive: () => componentActiveRef.current,
    });
    if (!bindModelAttachment({
      attachmentByStorageModelId: attachmentByStorageModelIdRef.current,
      storageModelIdByAttachmentId: storageModelIdByAttachmentIdRef.current,
    }, record, attachment)) {
      return null;
    }
    return record;
  }

  async function addCustomModelToScene(modelId: string) {
    setError(null);
    try {
      const record = await ensureModelRootCached(modelId);
      if (!record) throw new Error("model-unavailable");
      // root.scale에 이미 오토핏이 반영돼 있으므로 인스턴스 자체의 scale은 [1,1,1]에서 시작한다
      // (오토핏 배율을 인스턴스 scale에 다시 곱하면 이중 적용된다 — 인스턴스 scale은 "오토핏 위에
      // 사용자가 추가로 조정한 배율"만 의미하게 한다).
      const next = createBgCustomModelInstance(modelId, customModels.length);
      setCustomModels((prev) => [...prev, next]);
      setSelectedId(next.id);
      setRefTick((n) => n + 1);
    } catch {
      setError("3D 모델의 원본과 무결성을 확인하지 못해 장면에 추가하지 않았습니다.");
    }
  }

  async function handleUploadModelFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = ""; // StudioVrmPoser.tsx handleFileChange와 동일 — 같은 파일 재선택 허용
    if (files.length === 0) return;

    setIsUploadingModel(true);
    setError(null);
    const cacheIdsBefore = new Set(modelRootCacheRef.current.keys());
    try {
      const policy = deriveStudioBg3dGlbValidationPolicy(sceneBaseDocument, deviceQuality);
      const imported = await importVerifiedBg3dModelsAtomically(files, {
        profile: policy.profile,
        budgets: policy.budgets,
      });
      const saved: Bg3dVerifiedStoredRecord[] = [];
      for (const importedRecord of imported) {
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
      setModelLibrary(await listBg3dModelLibraryEntries());
      const stagedAttachments = new Map<string, StudioBg3dModelAttachment>();
      let cumulativeUsedBytes = placedModelByteTotal(customModels, attachmentByStorageModelIdRef.current);
      const countedHashes = new Set(
        customModels.flatMap((model) => {
          const attachment = attachmentByStorageModelIdRef.current.get(model.modelId);
          return attachment ? [attachment.hash] : [];
        })
      );
      for (const record of saved) {
        const existing = attachmentByStorageModelIdRef.current.get(record.id);
        const attachment = existing ?? createStudioBg3dModelAttachment(record);
        await admitAndCacheModel({
          record,
          document: sceneBaseDocument,
          quality: deviceQuality,
          cumulativeUsedBytes,
          cache: modelRootCacheRef.current,
          pending: modelLoadPendingRef.current,
          isActive: () => componentActiveRef.current,
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
      attachmentByStorageModelIdRef.current.clear();
      storageModelIdByAttachmentIdRef.current.clear();
      for (const [id, attachment] of nextAttachmentByStorageId) {
        attachmentByStorageModelIdRef.current.set(id, attachment);
      }
      for (const [attachmentId, id] of nextStorageIdByAttachment) {
        storageModelIdByAttachmentIdRef.current.set(attachmentId, id);
      }
      const placements = saved.map((record, index) =>
        createBgCustomModelInstance(record.id, customModels.length + index)
      );
      if (placements.length > 0) {
        setCustomModels((prev) => [...prev, ...placements]);
        setSelectedId(placements[placements.length - 1].id);
        setRefTick((n) => n + 1);
      }
    } catch {
      // 저장은 atomic import가 책임지고, 화면 배치는 별도 all-or-none이다. 이번 시도에서 처음 로드한
      // 캐시만 되돌려 기존 장면 인스턴스가 공유 중인 자원은 건드리지 않는다.
      for (const [id, entry] of modelRootCacheRef.current) {
        if (cacheIdsBefore.has(id)) continue;
        entry.dispose();
        modelRootCacheRef.current.delete(id);
      }
      setError("선택한 GLB 중 하나가 안전 검사 또는 기기 복잡도 기준을 통과하지 못해 아무 모델도 배치하지 않았습니다.");
      try {
        setModelLibrary(await listBg3dModelLibraryEntries());
      } catch {
        setModelLibraryStatus("error");
      }
    } finally {
      setIsUploadingModel(false);
    }
  }

  async function handleDeleteModelFromLibrary(id: string) {
    setDeletingModelId(id);
    try {
      await deleteStoredBg3dModel(id);
      setCustomModels((prev) => prev.filter((inst) => inst.modelId !== id));
      const attachment = attachmentByStorageModelIdRef.current.get(id);
      attachmentByStorageModelIdRef.current.delete(id);
      if (attachment) storageModelIdByAttachmentIdRef.current.delete(attachment.id);
      const cacheEntry = modelRootCacheRef.current.get(id);
      modelRootCacheRef.current.delete(id);
      if (cacheEntry) requestAnimationFrame(() => cacheEntry.dispose());
      if (customModels.some((model) => model.id === selectedId && model.modelId === id)) {
        setSelectedId(null);
      }
      setRefTick((n) => n + 1);
      setModelLibrary(await listBg3dModelLibraryEntries());
    } catch {
      setError("3D 모델을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setDeletingModelId(null);
    }
  }

  const handlePanelTabChange = (tab: BgPanelTab) => {
    setActivePanelTab(tab);
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
  };

  // 키보드 핸들러가 항상 최신 콜백을 참조하도록 ref로 동기화(렌더 후 매번 갱신).
  const selectedIdRef = useRef(selectedId);
  const undoRef = useRef(doUndo);
  const redoRef = useRef(doRedo);
  const deleteSelectedRef = useRef(deleteSelectedEntity);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    undoRef.current = doUndo;
    redoRef.current = doRedo;
    deleteSelectedRef.current = deleteSelectedEntity;
  });

  // 키보드 단축키: T/R/S 변환 모드, ⌘/Ctrl+Z(+Shift) undo/redo, Delete/Backspace 삭제,
  // Esc는 선택 해제 우선 후 두 번째 누름에 모달 닫기. 숫자 입력 필드가 있으므로 텍스트 입력 중엔 전부 무시한다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;

      if (e.key === "Escape") {
        if (selectedIdRef.current) setSelectedId(null);
        else onClose();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIdRef.current) {
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
  }, [open, onClose]);

  const onCaptureUpdate = (state: CaptureState, cleanupGl?: THREE.WebGLRenderer | null) => {
    if (cleanupGl) {
      if (captureRef.current.gl === cleanupGl) {
        captureRef.current = { camera: null, gl: null, scene: null };
      }
    } else {
      captureRef.current = state;
    }
  };

  function handleInsert() {
    if (insertBlocked) {
      setError("3D 장면 복원과 모델 렌더 준비를 모두 마친 뒤 추가할 수 있습니다.");
      return;
    }
    const currentCapture = captureRef.current;
    if (!currentCapture.gl || !currentCapture.scene || !currentCapture.camera) {
      setError("캡처할 3D 장면이 아직 준비되지 않았습니다.");
      return;
    }
    const { gl, scene, camera } = currentCapture;
    const sky = getSkyPreset(skyPresetId);
    const currentView = viewportApiRef.current?.readView() ?? sceneBaseDocument.camera;
    const currentBaseDocument: StudioBg3dSceneDocument = {
      ...sceneBaseDocument,
      camera: currentView,
      background: {
        ...sceneBaseDocument.background,
        mode: transparentInsert ? "transparent" : "sky-preset",
        color: sky.clearColor,
        skyPresetId: sky.id as StudioBg3dSceneDocument["background"]["skyPresetId"],
      },
      output: {
        ...sceneBaseDocument.output,
        transparentBackground: transparentInsert,
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

    // 내보내기는 프리뷰 토글 상태와 무관하게 항상 선화 모드로 강제한다 — 도구의 목적 자체가
    // 트레이싱 참고선이지 셰이딩 미리보기 저장이 아니기 때문(설계 §4).
    setLineArtPreview(true);
    setIsCapturing(true);
    // 투명 삽입: 캡처 프레임 딱 한 번만 clearColor의 알파를 0으로 낮춰 하늘색/배경을 비우고
    // 오브젝트만 그린다(Canvas의 gl.alpha:true 가 있어야 실제로 캔버스 자체가 알파를 갖는다).
    // 캡처가 끝나면 즉시 원래 하늘색 프리셋으로 되돌린다 — 그러지 않으면 모달이 닫히기 전
    // 잠깐이라도 뷰포트가 투명하게 보여 다른 배경(페이지 배경색)이 비쳐 보이는 깜빡임이 생긴다.
    if (transparentInsert) gl.setClearColor(sky.clearColor, 0);
    requestAnimationFrame(() => {
      try {
        gl.render(scene, camera);
        // PNG와 편집 원본은 별도 필드다. data URL fragment에 장면·storage id를 다시 싣지 않는다.
        const pngDataUrl = gl.domElement.toDataURL("image/png").split("#", 1)[0];
        const { width, height } = roundExportSize(gl.domElement);
        setSceneBaseDocument(adapted.document);
        const accepted = onInsert({
          pngDataUrl,
          width,
          height,
          bg3dScene: adapted.document,
        });
        if (accepted !== false) onClose();
      } catch {
        setError("3D 장면을 PNG로 캡처하지 못했습니다. 브라우저 그래픽 상태를 확인해 주세요.");
      } finally {
        setIsCapturing(false);
        if (transparentInsert) gl.setClearColor(sky.clearColor, 1);
      }
    });
  }

  // 선택된 것이 도형(primitives)인지 커스텀 모델(customModels)인지는 배타적이다 — 둘 다 같은
  // selectedId/primitiveObjectsRef를 공유하므로(§4) "primitives에 있으면 도형, 아니면 모델"로 분기한다.
  const selectedPrimitive = primitives.find((p) => p.id === selectedId) ?? null;
  const selectedCustomModel = customModels.find((m) => m.id === selectedId) ?? null;
  const hideOnTab = (tab: BgPanelTab) => activePanelTab !== tab;

  if (!open) return null;

  const modal = (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
      role="dialog"
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
            <h2 className="mt-1 truncate text-lg font-bold tracking-tight text-fg sm:text-xl">3D 배경 블록아웃 만들기</h2>
            <p className="mt-1 line-clamp-1 text-xs text-fg-3">상자·원기둥·평면으로 구조를 잡고 선화로 추출해 패널에 추가</p>
          </div>
          <button type="button" aria-label="닫기" title="닫기 (Esc)" className={ICON_BUTTON} onClick={onClose}>
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,44dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1">
          <section className="relative min-h-0 overflow-hidden bg-[oklch(0.98_0_0)] lg:min-h-0">
            <div className="relative mx-auto flex h-full max-h-full min-h-0 w-full max-w-[min(92vw,960px)] items-center justify-center p-2 sm:p-5 lg:max-h-[calc(100dvh-12rem)] lg:min-h-[420px]">
              <div
                ref={viewportHostRef}
                className="relative aspect-video h-full max-h-full min-h-0 w-auto overflow-hidden rounded-xl border border-line/80 bg-white shadow-[inset_0_0_0_1px_oklch(1_0_0/0.04)] lg:min-h-[360px]"
              >
                <Canvas
                  camera={{
                    fov: sceneBaseDocument.camera.fovDegrees,
                    position: [...sceneBaseDocument.camera.position],
                    near: 0.1,
                    far: 200,
                  }}
                  className="h-full w-full"
                  dpr={deviceQuality.effectiveDpr}
                  shadows={{ enabled: deviceQuality.shadows, type: THREE.PCFShadowMap }}
                  gl={{ antialias: sceneBaseDocument.render.antialias, preserveDrawingBuffer: true, alpha: true }}
                  onCreated={({ gl }) => gl.setClearColor(getSkyPreset(skyPresetId).clearColor, 1)}
                  onPointerMissed={() => setSelectedId(null)}
                >
                  <CaptureBridge onCaptureUpdate={onCaptureUpdate} />
                  <BgViewportController
                    onReady={(api) => {
                      viewportApiRef.current = api;
                      if (api && pendingInitialCameraRef.current) {
                        api.applyView(pendingInitialCameraRef.current);
                        pendingInitialCameraRef.current = null;
                      }
                    }}
                  />
                  <SkyClearColorController clearColor={getSkyPreset(skyPresetId).clearColor} />
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
                  <BgGroundHelper visible={!lineArtPreview} />
                  {primitives.map((prim) => (
                    <BgPrimitiveMesh
                      key={prim.id}
                      prim={prim}
                      lineArt={lineArtPreview}
                      onSelect={setSelectedId}
                      registerRef={registerPrimitiveRef}
                    />
                  ))}
                  {customModels.map((inst) => (
                    <BgCustomModelMesh
                      key={inst.id}
                      instance={inst}
                      cachedRoot={modelRootCacheRef.current.get(inst.modelId)?.root}
                      onSelect={setSelectedId}
                      registerRef={registerPrimitiveRef}
                      onCloneStatus={(id, ok) => {
                        setReadyCloneIds((prev) => {
                          const next = new Set(prev);
                          if (ok) next.add(id);
                          else next.delete(id);
                          return next;
                        });
                        setFailedCloneIds((prev) => {
                          const next = new Set(prev);
                          if (ok) next.delete(id);
                          else next.add(id);
                          return next;
                        });
                      }}
                    />
                  ))}
                  {selectedId && primitiveObjectsRef.current.get(selectedId) ? (
                    <TransformControls
                      object={primitiveObjectsRef.current.get(selectedId)}
                      mode={transformMode}
                      space={transformMode === "rotate" ? "local" : "world"}
                      onMouseDown={() => setIsTransforming(true)}
                      onMouseUp={() => setIsTransforming(false)}
                      onObjectChange={() => {
                        const obj = primitiveObjectsRef.current.get(selectedId);
                        if (!obj) return;
                        const position: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
                        const rotation: [number, number, number] = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
                        const scale: [number, number, number] = [obj.scale.x, obj.scale.y, obj.scale.z];
                        if (selectedPrimitive) updateTransform(selectedId, { position, rotation, scale });
                        else if (selectedCustomModel) updateCustomModelTransform(selectedId, { position, rotation, scale });
                      }}
                    />
                  ) : null}
                  <OrbitControls makeDefault enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming} minDistance={2} maxDistance={60} />
                </Canvas>

                <div className="absolute left-2.5 top-2.5 z-10 flex flex-col gap-1.5">
                  <div className="flex flex-col gap-1 rounded-lg border border-line/70 bg-panel/80 p-1 shadow-sm backdrop-blur">
                    {TRANSFORM_MODES.map((m) => {
                      const ModeIcon = m.icon;
                      const isActive = transformMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-label={m.label}
                          aria-pressed={isActive}
                          title={m.title}
                          className={cx(
                            "grid size-11 place-items-center rounded-md text-fg-2 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-8",
                            isActive && "bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent"
                          )}
                          onClick={() => setTransformMode(m.id)}
                        >
                          <ModeIcon size={15} aria-hidden />
                        </button>
                      );
                    })}
                  </div>
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
                  <button
                    type="button"
                    aria-label="확대"
                    title="확대"
                    className={VIEWPORT_BTN}
                    onClick={() => {
                      viewportApiRef.current?.zoomBy(0.82);
                      setViewportHinted(true);
                    }}
                  >
                    <ZoomIn size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="축소"
                    title="축소"
                    className={VIEWPORT_BTN}
                    onClick={() => {
                      viewportApiRef.current?.zoomBy(1.22);
                      setViewportHinted(true);
                    }}
                  >
                    <ZoomOut size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="시점 초기화"
                    title="시점 초기화"
                    className={VIEWPORT_BTN}
                    onClick={() => {
                      viewportApiRef.current?.applyPreset("default");
                      setViewportHinted(true);
                    }}
                  >
                    <Maximize2 size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="선화로 보기"
                    title="선화로 보기"
                    aria-pressed={lineArtPreview}
                    className={cx(VIEWPORT_BTN, lineArtPreview && "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent")}
                    onClick={() => setLineArtPreview((v) => !v)}
                  >
                    <Boxes size={16} aria-hidden />
                  </button>
                </div>

                {!viewportHinted ? (
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
            <div role="tablist" aria-label="컨트롤 카테고리" className="grid shrink-0 grid-cols-5 gap-1 border-b border-line bg-panel/95 px-2 py-2 backdrop-blur sm:px-3">
              {BG_PANEL_TABS.map((tab) => {
                const TabIcon = tab.icon;
                const isActive = activePanelTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`bg3d-tab-${tab.id}`}
                    type="button"
                    role="tab"
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

            <div ref={panelScrollRef} id="bg3d-panel-body" role="tabpanel" aria-labelledby={`bg3d-tab-${activePanelTab}`} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <section hidden={hideOnTab("shapes")}>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Boxes size={15} className="text-accent" aria-hidden />
                  도형 추가
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {ADD_BUTTONS.map((btn) => {
                    const BtnIcon = btn.icon;
                    return (
                      <button
                        key={btn.kind}
                        type="button"
                        className={cx(CONTROL_BUTTON, "flex-col gap-1 border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
                        onClick={() => addPrimitive(btn.kind)}
                      >
                        <BtnIcon size={16} aria-hidden />
                        <span className="text-[0.65rem]">{PRIMITIVE_DEFS[btn.kind].label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <h3 className="mb-2 text-sm font-bold text-fg">복합 오브젝트 추가</h3>
                  <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
                    건물·나무·차량·소품처럼 도형 여러 개가 조합된 배경 소재입니다. 추가 후에도 각 부품을 따로 선택해 다듬을 수 있어요.
                  </p>
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className={cx(
                        "min-h-11 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition-colors sm:min-h-0",
                        compositeCategory === null
                          ? "border-accent/60 bg-accent-soft text-accent"
                          : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
                      )}
                      onClick={() => setCompositeCategory(null)}
                    >
                      전체
                    </button>
                    {COMPOSITE_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={cx(
                          "min-h-11 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition-colors sm:min-h-0",
                          compositeCategory === cat
                            ? "border-accent/60 bg-accent-soft text-accent"
                            : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg"
                        )}
                        onClick={() => setCompositeCategory(cat)}
                      >
                        {COMPOSITE_CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {COMPOSITE_PRESETS.filter((p) => compositeCategory === null || p.category === compositeCategory).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={cx(
                          CONTROL_BUTTON,
                          "flex-col items-start gap-1 border-line bg-card px-2.5 py-2 text-left text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                        onClick={() => addComposite(preset.id)}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-semibold">
                          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: preset.parts[0]?.color }} aria-hidden />
                          {preset.label}
                        </span>
                        <span className="text-[0.65rem] font-normal leading-snug text-fg-3">{preset.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  {selectedPrimitive ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-fg">선택한 도형</h3>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="복제"
                            title="복제"
                            className={ICON_BUTTON}
                            onClick={duplicateSelected}
                          >
                            <Copy size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="삭제"
                            title="삭제 (Delete)"
                            className={cx(ICON_BUTTON, "hover:border-accent/40 hover:bg-accent-soft hover:text-accent")}
                            onClick={deleteSelected}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>
                      </div>

                      <Vec3Field
                        label="위치"
                        values={selectedPrimitive.position}
                        step={0.1}
                        precision={2}
                        onCommit={(i, v) => {
                          const next: [number, number, number] = [...selectedPrimitive.position];
                          next[i] = v;
                          updateTransform(selectedPrimitive.id, { position: next });
                        }}
                      />
                      <Vec3Field
                        label="회전"
                        values={[radToDeg(selectedPrimitive.rotation[0]), radToDeg(selectedPrimitive.rotation[1]), radToDeg(selectedPrimitive.rotation[2])]}
                        step={1}
                        precision={0}
                        suffix="°"
                        onCommit={(i, v) => {
                          const nextDeg: [number, number, number] = [
                            radToDeg(selectedPrimitive.rotation[0]),
                            radToDeg(selectedPrimitive.rotation[1]),
                            radToDeg(selectedPrimitive.rotation[2]),
                          ];
                          nextDeg[i] = v;
                          updateTransform(selectedPrimitive.id, { rotation: [degToRad(nextDeg[0]), degToRad(nextDeg[1]), degToRad(nextDeg[2])] });
                        }}
                      />
                      <Vec3Field
                        label="크기"
                        values={selectedPrimitive.scale}
                        step={0.1}
                        precision={2}
                        onCommit={(i, v) => {
                          const next: [number, number, number] = [...selectedPrimitive.scale];
                          next[i] = Math.max(0.01, v);
                          updateTransform(selectedPrimitive.id, { scale: next });
                        }}
                      />

                      <label className="flex items-center gap-2 text-xs font-medium text-fg-2">
                        색상(셰이딩 미리보기 전용)
                        <input
                          type="color"
                          value={selectedPrimitive.color}
                          onChange={(e) => updateColor(selectedPrimitive.id, e.target.value)}
                          className="h-11 w-11 cursor-pointer rounded border border-line bg-card sm:h-7 sm:w-10"
                        />
                      </label>
                    </div>
                  ) : selectedCustomModel ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-fg">선택한 모델</h3>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="복제"
                            title="복제"
                            className={ICON_BUTTON}
                            onClick={duplicateSelectedCustomModel}
                          >
                            <Copy size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="삭제"
                            title="삭제 (Delete)"
                            className={cx(ICON_BUTTON, "hover:border-accent/40 hover:bg-accent-soft hover:text-accent")}
                            onClick={deleteSelectedCustomModel}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>
                      </div>

                      <Vec3Field
                        label="위치"
                        values={selectedCustomModel.position}
                        step={0.1}
                        precision={2}
                        onCommit={(i, v) => {
                          const next: [number, number, number] = [...selectedCustomModel.position];
                          next[i] = v;
                          updateCustomModelTransform(selectedCustomModel.id, { position: next });
                        }}
                      />
                      <Vec3Field
                        label="회전"
                        values={[radToDeg(selectedCustomModel.rotation[0]), radToDeg(selectedCustomModel.rotation[1]), radToDeg(selectedCustomModel.rotation[2])]}
                        step={1}
                        precision={0}
                        suffix="°"
                        onCommit={(i, v) => {
                          const nextDeg: [number, number, number] = [
                            radToDeg(selectedCustomModel.rotation[0]),
                            radToDeg(selectedCustomModel.rotation[1]),
                            radToDeg(selectedCustomModel.rotation[2]),
                          ];
                          nextDeg[i] = v;
                          updateCustomModelTransform(selectedCustomModel.id, { rotation: [degToRad(nextDeg[0]), degToRad(nextDeg[1]), degToRad(nextDeg[2])] });
                        }}
                      />
                      <Vec3Field
                        label="크기"
                        values={selectedCustomModel.scale}
                        step={0.1}
                        precision={2}
                        onCommit={(i, v) => {
                          const next: [number, number, number] = [...selectedCustomModel.scale];
                          next[i] = Math.max(0.01, v);
                          updateCustomModelTransform(selectedCustomModel.id, { scale: next });
                        }}
                      />

                      <p className="text-[0.68rem] leading-relaxed text-fg-3">업로드한 3D 모델은 셰이딩 미리보기 색상을 따로 지정할 수 없어요.</p>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-fg-3">도형이나 모델을 추가하거나 뷰포트·레이어 목록에서 선택하면 여기서 위치·회전·크기를 정확한 수치로 조정할 수 있습니다.</p>
                  )}
                </div>
              </section>

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
              </section>

              <section hidden={hideOnTab("layers")}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <Layers size={15} className="text-accent" aria-hidden />
                    레이어
                  </h3>
                  <span className="text-[0.68rem] text-fg-3">{primitives.length + customModels.length}개</span>
                </div>
                {primitives.length === 0 && customModels.length === 0 ? (
                  <p className="text-xs leading-relaxed text-fg-3">아직 추가한 도형·모델이 없습니다. &ldquo;도형&rdquo;/&ldquo;모델&rdquo; 탭에서 먼저 추가해 주세요.</p>
                ) : (
                  <ul className="space-y-1">
                    {primitives.map((prim, index) => {
                      const kindCountBefore = primitives.slice(0, index).filter((p) => p.kind === prim.kind).length;
                      const rowLabel = `${PRIMITIVE_DEFS[prim.kind].label} ${kindCountBefore + 1}`;
                      const isActive = prim.id === selectedId;
                      return (
                        <li key={prim.id}>
                          <div
                            className={cx(
                              "flex min-h-11 items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors sm:min-h-0",
                              isActive ? "border-accent/55 bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
                            )}
                          >
                            <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left sm:min-h-0" onClick={() => setSelectedId(prim.id)}>
                              <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: prim.color }} aria-hidden />
                              <span className="truncate font-semibold">{rowLabel}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`${rowLabel} 복제`}
                              title="복제"
                              className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                              onClick={() => {
                                setSelectedId(prim.id);
                                const clone = duplicatePrimitive(prim);
                                setPrimitives((prev) => [...prev, clone]);
                                setSelectedId(clone.id);
                              }}
                            >
                              <Copy size={12} aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`${rowLabel} 삭제`}
                              title="삭제"
                              className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                              onClick={() => {
                                setPrimitives((prev) => prev.filter((p) => p.id !== prim.id));
                                if (isActive) setSelectedId(null);
                              }}
                            >
                              <Trash2 size={12} aria-hidden />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                    {customModels.map((inst, index) => {
                      const kindCountBefore = customModels.slice(0, index).filter((m) => m.modelId === inst.modelId).length;
                      const modelName = modelLibrary.find((entry) => entry.id === inst.modelId)?.name ?? "3D 모델";
                      const rowLabel = `${modelName} ${kindCountBefore + 1}`;
                      const isActive = inst.id === selectedId;
                      return (
                        <li key={inst.id}>
                          <div
                            className={cx(
                              "flex min-h-11 items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors sm:min-h-0",
                              isActive ? "border-accent/55 bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
                            )}
                          >
                            <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left sm:min-h-0" onClick={() => setSelectedId(inst.id)}>
                              <PackageOpen size={13} className="shrink-0 text-fg-3" aria-hidden />
                              <span className="truncate font-semibold">{rowLabel}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`${rowLabel} 복제`}
                              title="복제"
                              className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                              onClick={() => {
                                setSelectedId(inst.id);
                                const clone = duplicateBgCustomModelInstance(inst);
                                setCustomModels((prev) => [...prev, clone]);
                                setSelectedId(clone.id);
                              }}
                            >
                              <Copy size={12} aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`${rowLabel} 삭제`}
                              title="삭제"
                              className="grid size-11 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent sm:size-6"
                              onClick={() => {
                                setCustomModels((prev) => prev.filter((m) => m.id !== inst.id));
                                if (isActive) setSelectedId(null);
                              }}
                            >
                              <Trash2 size={12} aria-hidden />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section hidden={hideOnTab("view")}>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                  <Camera size={15} className="text-accent" aria-hidden />
                  카메라
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(CAMERA_PRESETS).map(([id, preset]) => (
                    <button
                      key={id}
                      type="button"
                      className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
                      onClick={() => {
                        viewportApiRef.current?.applyPreset(id);
                        setViewportHinted(true);
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    className={cx(CONTROL_BUTTON, "flex-1 border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
                    onClick={() => viewportApiRef.current?.zoomBy(0.82)}
                  >
                    <ZoomIn size={14} aria-hidden />
                    확대
                  </button>
                  <button
                    type="button"
                    className={cx(CONTROL_BUTTON, "flex-1 border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
                    onClick={() => viewportApiRef.current?.zoomBy(1.22)}
                  >
                    <ZoomOut size={14} aria-hidden />
                    축소
                  </button>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={lineArtPreview}
                      onChange={(e) => setLineArtPreview(e.target.checked)}
                      className="mt-0.5 size-4 accent-accent"
                    />
                    <span className="block text-xs font-bold text-fg">
                      선화로 보기
                      <span className="mt-0.5 block text-[0.68rem] font-normal leading-relaxed text-fg-3">
                        추가 시 항상 이 상태로 캡처됩니다 — 미리보기만 셰이딩/선화를 오갈 수 있어요.
                      </span>
                    </span>
                  </label>
                  <label className="mt-3 flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={transparentInsert}
                      onChange={(e) => setTransparentInsert(e.target.checked)}
                      className="mt-0.5 size-4 accent-accent"
                    />
                    <span className="block text-xs font-bold text-fg">
                      배경 없이 오브젝트만 추가
                      <span className="mt-0.5 block text-[0.68rem] font-normal leading-relaxed text-fg-3">
                        하늘색·바닥 그리드를 빼고 건물·나무·도형만 투명 배경 PNG로 추가해요 — 다른 배경
                        이미지 위에 자유롭게 겹쳐 쓸 수 있어요.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <h3 className="mb-2 text-sm font-bold text-fg">뷰포트 하늘색</h3>
                  <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
                    작업 화면의 분위기만 바꿉니다. 위 "배경 없이 오브젝트만 추가"를 켜지 않으면 내보내기는
                    항상 이 하늘색이 그대로 캡처돼요(항상 흰 배경은 아니에요).
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {BG_SKY_PRESETS.map((sky) => (
                      <button
                        key={sky.id}
                        type="button"
                        className={cx(
                          CONTROL_BUTTON,
                          "gap-1.5 border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                          skyPresetId === sky.id && "border-accent/60 bg-accent-soft text-accent"
                        )}
                        onClick={() => setSkyPresetId(sky.id)}
                      >
                        <span className="inline-block size-3.5 rounded-full border border-line/50" style={{ backgroundColor: sky.clearColor }} aria-hidden />
                        {sky.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section hidden={hideOnTab("models")}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <PackageOpen size={15} className="text-accent" aria-hidden />
                    3D 모델
                  </h3>
                  <span className="text-[0.68rem] text-fg-3">
                    {modelLibrary.length}개 · {deviceQuality.profile === "mobile" ? "모바일" : "데스크톱"} 기준
                  </span>
                </div>

                <input ref={fileInputRef} accept=".glb,model/gltf-binary" className="sr-only" multiple type="file" onChange={handleUploadModelFiles} />
                <button
                  type="button"
                  className={cx(CONTROL_BUTTON, "w-full border-accent/50 bg-accent text-on-accent hover:bg-accent/90")}
                  disabled={isUploadingModel}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingModel ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <Upload size={14} aria-hidden />}
                  3D 모델 업로드
                </button>
                <p className="mt-2 rounded-xl border border-line bg-card/60 px-3 py-2 text-xs leading-relaxed text-fg-3">
                  모든 텍스처를 포함한 GLB 2.0만 등록할 수 있어요. 파일 구조·SHA-256·외부 참조·기기별
                  삼각형/텍스처 예산을 검사한 뒤 로컬 라이브러리에 저장합니다.
                </p>

                {modelLibraryStatus === "error" ? (
                  <p className="mt-2 rounded-xl border border-line bg-card/70 px-3 py-2 text-xs leading-relaxed text-fg-3">
                    <AlertTriangle className="mr-1 inline align-[-2px] text-accent" size={14} aria-hidden />
                    저장된 3D 모델 목록을 불러오지 못했습니다.
                  </p>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {modelLibraryStatus === "loading" ? (
                    <div className="col-span-2 rounded-xl border border-line bg-card/60 px-3 py-4 text-center text-xs text-fg-3">저장된 3D 모델을 불러오는 중입니다.</div>
                  ) : null}

                  {modelLibraryStatus === "ready" && modelLibrary.length === 0 ? (
                    <div className="col-span-2 rounded-xl border border-dashed border-line bg-card/45 px-3 py-4 text-center text-xs leading-relaxed text-fg-3">
                      업로드한 3D 모델이 아직 없습니다. 위 버튼으로 하나의 파일에 리소스를 포함한 .glb를 올려보세요.
                    </div>
                  ) : null}

                  {modelLibrary.map((entry) => {
                    const isDeleting = deletingModelId === entry.id;
                    return (
                      <div key={entry.id} className="relative overflow-hidden rounded-xl border border-line bg-card transition-colors hover:bg-raised">
                        <button
                          type="button"
                          aria-describedby={`bg3d-model-status-${entry.id}`}
                          className="grid min-h-[7.75rem] w-full grid-rows-[3rem_auto] gap-2 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55"
                          disabled={!entry.canUse || isDeleting || isUploadingModel || isRestoringScene}
                          onClick={() => void addCustomModelToScene(entry.id)}
                        >
                          <span className="grid h-12 place-items-center overflow-hidden rounded-lg border border-line/80 bg-panel">
                            <PackageOpen size={20} className="text-fg-3" aria-hidden />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-fg">{entry.name}</span>
                            <span className="mt-1 flex flex-wrap gap-1">
                              <span className="inline-flex rounded-full bg-raised px-1.5 py-0.5 text-[0.64rem] font-bold uppercase text-fg-3">
                                {entry.format}
                              </span>
                              <span
                                className={cx(
                                  "inline-flex rounded-full px-1.5 py-0.5 text-[0.64rem] font-bold",
                                  entry.commercialUse ? "bg-[oklch(0.80_0.15_150/0.14)] text-good" : "bg-raised text-fg-3"
                                )}
                              >
                                {entry.commercialUse ? "상업 이용 가능" : "상업 이용 확인 필요"}
                              </span>
                            </span>
                            <span id={`bg3d-model-status-${entry.id}`} className="mt-1 line-clamp-2 block text-[0.64rem] leading-snug text-fg-3">
                              {entry.statusMessage}
                            </span>
                          </span>
                        </button>

                        {entry.source === "indexed-db" ? (
                          <button
                            type="button"
                            aria-label={`${entry.name} 삭제`}
                            className="absolute right-1.5 top-1.5 grid size-11 place-items-center rounded-lg border border-line bg-panel/90 text-fg-3 transition-colors hover:bg-raised hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45 sm:size-7"
                            disabled={isDeleting}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteModelFromLibrary(entry.id);
                            }}
                          >
                            {isDeleting ? <Loader2 className="animate-spin" size={13} aria-hidden /> : <Trash2 size={13} aria-hidden />}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
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

            {error ? (
              <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 sm:mx-5">
                <AlertTriangle className="mt-0.5 shrink-0 text-accent" size={14} aria-hidden />
                {error}
              </div>
            ) : null}

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
              <button type="button" className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")} onClick={onClose}>
                닫기
              </button>
              <button
                type="button"
                className={cx(CONTROL_BUTTON, "min-w-36 border-accent/60 bg-accent text-on-accent hover:bg-accent/90")}
                disabled={(primitives.length === 0 && customModels.length === 0) || isCapturing || insertBlocked}
                onClick={handleInsert}
              >
                {isCapturing || isRestoringScene || hasPendingClone ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                {initialScene || initialDataUrl ? "3D 배경 업데이트" : "이 배경으로 추가"}
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
