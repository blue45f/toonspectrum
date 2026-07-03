import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { TransformControls } from "@react-three/drei/core/TransformControls.js";
import { Canvas, useThree } from "@react-three/fiber";
import {
  AlertTriangle,
  Boxes,
  Camera,
  Copy,
  Cylinder,
  ImagePlus,
  Layers,
  Loader2,
  Maximize2,
  Move,
  Redo2,
  RectangleHorizontal,
  RotateCw,
  Scaling,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  clonePrimitives,
  createPrimitive,
  duplicatePrimitive,
  encodeBg3dSceneHash,
  makeGeometry,
  parseBg3dSceneFromDataUrl,
  PRIMITIVE_DEFS,
  roundExportSize,
  type BgPrimitive,
  type BgPrimitiveKind,
} from "./studio-background-3d-primitives";

export interface StudioBackground3DProps {
  open: boolean;
  initialDataUrl?: string;
  onClose: () => void;
  onInsert: (pngDataUrl: string, width: number, height: number) => void;
}

type TransformModeId = "translate" | "rotate" | "scale";
type BgPanelTab = "shapes" | "layers" | "view";
type CaptureState = { gl: THREE.WebGLRenderer | null; scene: THREE.Scene | null; camera: THREE.Camera | null };

const CONTROL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const VIEWPORT_BTN =
  "grid size-9 place-items-center rounded-lg border border-line/70 bg-panel/80 text-fg-2 shadow-sm backdrop-blur transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const BG_PANEL_TABS: Array<{ id: BgPanelTab; label: string; icon: typeof Boxes; hint: string }> = [
  { id: "shapes", label: "도형", icon: Boxes, hint: "추가 · 선택한 도형 수치 편집" },
  { id: "layers", label: "레이어", icon: Layers, hint: "목록 · 선택 · 복제 · 삭제" },
  { id: "view", label: "보기", icon: Camera, hint: "카메라 프리셋 · 선화 미리보기" },
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
];

const DEFAULT_CAMERA_POSITION: [number, number, number] = [4, 3, 6];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0.6, 0];

const CAMERA_PRESETS: Record<string, { label: string; position: [number, number, number]; target: [number, number, number] }> = {
  default: { label: "기본", position: DEFAULT_CAMERA_POSITION, target: DEFAULT_CAMERA_TARGET },
  front: { label: "정면", position: [0, 1.6, 9], target: [0, 0.9, 0] },
  top: { label: "위에서", position: [0, 10, 0.001], target: [0, 0, 0] },
  side: { label: "측면", position: [9, 1.6, 0], target: [0, 0.9, 0] },
};

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

type OrbitLike = { target?: THREE.Vector3; update?: () => void } | null;
type BgViewportApi = { zoomBy: (factor: number) => void; applyPreset: (presetId: string) => void };

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
      <mesh geometry={geometry}>
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

export function StudioBackground3D({ open, initialDataUrl, onClose, onInsert }: StudioBackground3DProps) {
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

  const captureRef = useRef<CaptureState>({ camera: null, gl: null, scene: null });
  const viewportApiRef = useRef<BgViewportApi | null>(null);
  const primitiveObjectsRef = useRef<Map<string, THREE.Group>>(new Map());
  const [, setRefTick] = useState(0);
  const panelScrollRef = useRef<HTMLDivElement>(null);

  const historyRef = useRef<BgPrimitive[][]>([]);
  const historyIndexRef = useRef(-1);
  const isRestoringRef = useRef(false);

  // 재편집 진입: initialDataUrl의 해시 프래그먼트에서 이전 장면을 복원한다(VRM 포저의 round-trip과 동일 계약).
  useEffect(() => {
    if (!open) return;
    const parsed = parseBg3dSceneFromDataUrl(initialDataUrl);
    if (parsed && parsed.length > 0) {
      setPrimitives(parsed);
    }
  }, [open, initialDataUrl]);

  // 편집이 멈추면(디바운스) 스냅샷을 히스토리에 적재 — VRM 포저의 undo 스택과 동일한 패턴.
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const snap = clonePrimitives(primitives);
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
  }, [primitives]);

  const doUndo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    isRestoringRef.current = true;
    setPrimitives(clonePrimitives(historyRef.current[historyIndexRef.current]));
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };
  const doRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    isRestoringRef.current = true;
    setPrimitives(clonePrimitives(historyRef.current[historyIndexRef.current]));
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };

  const addPrimitive = (kind: BgPrimitiveKind) => {
    const next = createPrimitive(kind, primitives.length);
    setPrimitives((prev) => [...prev, next]);
    setSelectedId(next.id);
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

  const duplicateSelected = () => {
    if (!selectedId) return;
    const original = primitives.find((p) => p.id === selectedId);
    if (!original) return;
    const clone = duplicatePrimitive(original);
    setPrimitives((prev) => [...prev, clone]);
    setSelectedId(clone.id);
  };

  const updateTransform = (id: string, patch: Partial<Pick<BgPrimitive, "position" | "rotation" | "scale">>) => {
    setPrimitives((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const updateColor = (id: string, color: string) => {
    setPrimitives((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)));
  };

  const registerPrimitiveRef = (id: string, obj: THREE.Group | null) => {
    if (obj) primitiveObjectsRef.current.set(id, obj);
    else primitiveObjectsRef.current.delete(id);
    setRefTick((n) => n + 1);
  };

  const handlePanelTabChange = (tab: BgPanelTab) => {
    setActivePanelTab(tab);
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
  };

  // 키보드 핸들러가 항상 최신 콜백을 참조하도록 ref로 동기화(렌더 후 매번 갱신).
  const selectedIdRef = useRef(selectedId);
  const undoRef = useRef(doUndo);
  const redoRef = useRef(doRedo);
  const deleteSelectedRef = useRef(deleteSelected);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    undoRef.current = doUndo;
    redoRef.current = doRedo;
    deleteSelectedRef.current = deleteSelected;
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
    const currentCapture = captureRef.current;
    if (!currentCapture.gl || !currentCapture.scene || !currentCapture.camera) {
      setError("캡처할 3D 장면이 아직 준비되지 않았습니다.");
      return;
    }
    const { gl, scene, camera } = currentCapture;

    // 내보내기는 프리뷰 토글 상태와 무관하게 항상 선화 모드로 강제한다 — 도구의 목적 자체가
    // 트레이싱 참고선이지 셰이딩 미리보기 저장이 아니기 때문(설계 §4).
    setLineArtPreview(true);
    setIsCapturing(true);
    requestAnimationFrame(() => {
      gl.render(scene, camera);
      const baseDataUrl = gl.domElement.toDataURL("image/png");
      const { width, height } = roundExportSize(gl.domElement);
      setIsCapturing(false);

      const fullDataUrl = `${baseDataUrl}#${encodeBg3dSceneHash(primitives)}`;
      onInsert(fullDataUrl, width, height);
      onClose(); // 모달이 곧 언마운트되므로 previewMode를 되돌릴 필요가 없다.
    });
  }

  const selected = primitives.find((p) => p.id === selectedId) ?? null;
  const hideOnTab = (tab: BgPanelTab) => activePanelTab !== tab;

  if (!open) return null;

  return (
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
              <div className="relative aspect-video h-full max-h-full min-h-0 w-auto overflow-hidden rounded-xl border border-line/80 bg-white shadow-[inset_0_0_0_1px_oklch(1_0_0/0.04)] lg:min-h-[360px]">
                <Canvas
                  camera={{ fov: 50, position: DEFAULT_CAMERA_POSITION, near: 0.1, far: 200 }}
                  className="h-full w-full"
                  dpr={[1, 2]}
                  gl={{ antialias: true, preserveDrawingBuffer: true }}
                  onCreated={({ gl }) => gl.setClearColor(0xffffff, 1)}
                  onPointerMissed={() => setSelectedId(null)}
                >
                  <CaptureBridge onCaptureUpdate={onCaptureUpdate} />
                  <BgViewportController onReady={(api) => (viewportApiRef.current = api)} />
                  <ambientLight intensity={0.75} />
                  <directionalLight position={[4, 6, 4]} intensity={1.1} />
                  <directionalLight position={[-4, 3, -3]} intensity={0.35} />
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
                        updateTransform(selectedId, {
                          position: [obj.position.x, obj.position.y, obj.position.z],
                          rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
                          scale: [obj.scale.x, obj.scale.y, obj.scale.z],
                        });
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
                            "grid size-8 place-items-center rounded-md text-fg-2 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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

                {primitives.length === 0 ? (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
                    <div className="max-w-[18rem]">
                      <div className="mx-auto grid size-12 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
                        <Boxes size={22} aria-hidden />
                      </div>
                      <p className="mt-4 text-sm font-bold text-fg">오른쪽 &ldquo;도형&rdquo; 탭에서 상자·원기둥·평면을 추가해 배경을 잡아보세요.</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-t border-line bg-panel lg:border-l lg:border-t-0">
            <div role="tablist" aria-label="컨트롤 카테고리" className="grid shrink-0 grid-cols-3 gap-1 border-b border-line bg-panel/95 px-2 py-2 backdrop-blur sm:px-3">
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
                  {selected ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-fg">선택한 도형</h3>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="복제"
                            title="복제"
                            className={cx(ICON_BUTTON, "size-8")}
                            onClick={duplicateSelected}
                          >
                            <Copy size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="삭제"
                            title="삭제 (Delete)"
                            className={cx(ICON_BUTTON, "size-8 hover:border-accent/40 hover:bg-accent-soft hover:text-accent")}
                            onClick={deleteSelected}
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>
                      </div>

                      <Vec3Field
                        label="위치"
                        values={selected.position}
                        step={0.1}
                        precision={2}
                        onCommit={(i, v) => {
                          const next: [number, number, number] = [...selected.position];
                          next[i] = v;
                          updateTransform(selected.id, { position: next });
                        }}
                      />
                      <Vec3Field
                        label="회전"
                        values={[radToDeg(selected.rotation[0]), radToDeg(selected.rotation[1]), radToDeg(selected.rotation[2])]}
                        step={1}
                        precision={0}
                        suffix="°"
                        onCommit={(i, v) => {
                          const nextDeg: [number, number, number] = [
                            radToDeg(selected.rotation[0]),
                            radToDeg(selected.rotation[1]),
                            radToDeg(selected.rotation[2]),
                          ];
                          nextDeg[i] = v;
                          updateTransform(selected.id, { rotation: [degToRad(nextDeg[0]), degToRad(nextDeg[1]), degToRad(nextDeg[2])] });
                        }}
                      />
                      <Vec3Field
                        label="크기"
                        values={selected.scale}
                        step={0.1}
                        precision={2}
                        onCommit={(i, v) => {
                          const next: [number, number, number] = [...selected.scale];
                          next[i] = Math.max(0.01, v);
                          updateTransform(selected.id, { scale: next });
                        }}
                      />

                      <label className="flex items-center gap-2 text-xs font-medium text-fg-2">
                        색상(셰이딩 미리보기 전용)
                        <input
                          type="color"
                          value={selected.color}
                          onChange={(e) => updateColor(selected.id, e.target.value)}
                          className="h-7 w-10 cursor-pointer rounded border border-line bg-card"
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-fg-3">도형을 추가하거나 뷰포트·레이어 목록에서 선택하면 여기서 위치·회전·크기를 정확한 수치로 조정할 수 있습니다.</p>
                  )}
                </div>
              </section>

              <section hidden={hideOnTab("layers")}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <Layers size={15} className="text-accent" aria-hidden />
                    레이어
                  </h3>
                  <span className="text-[0.68rem] text-fg-3">{primitives.length}개</span>
                </div>
                {primitives.length === 0 ? (
                  <p className="text-xs leading-relaxed text-fg-3">아직 추가한 도형이 없습니다. &ldquo;도형&rdquo; 탭에서 먼저 추가해 주세요.</p>
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
                              "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors",
                              isActive ? "border-accent/55 bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
                            )}
                          >
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelectedId(prim.id)}>
                              <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: prim.color }} aria-hidden />
                              <span className="truncate font-semibold">{rowLabel}</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`${rowLabel} 복제`}
                              title="복제"
                              className="grid size-6 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent"
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
                              className="grid size-6 shrink-0 place-items-center rounded text-fg-3 hover:bg-accent-soft hover:text-accent"
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
                </div>
              </section>
            </div>

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
                disabled={primitives.length === 0 || isCapturing}
                onClick={handleInsert}
              >
                {isCapturing ? <Loader2 className="animate-spin" size={14} aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                이 배경으로 추가
              </button>
            </footer>
          </aside>
        </div>
      </div>
    </div>
  );
}
