import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { OrthographicCamera } from "@react-three/drei/core/OrthographicCamera.js";
import { PerspectiveCamera } from "@react-three/drei/core/PerspectiveCamera.js";
import { TransformControls } from "@react-three/drei/core/TransformControls.js";
import { View } from "@react-three/drei/web/View.js";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  AlertTriangle,
  Boxes,
  Camera,
  ChevronDown,
  CircleDashed,
  Cone,
  Copy,
  Cylinder,
  Eye,
  EyeOff,
  Globe,
  Hexagon,
  ImagePlus,
  Layers,
  LayoutTemplate,
  Loader2,
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
  Save,
  ScanLine,
  Scaling,
  Trash2,
  Triangle,
  Torus as TorusIcon,
  Umbrella,
  Undo2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  Fragment,
  type ChangeEvent,
  type CSSProperties,
} from "react";
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
  deleteBg3dTemplate,
  listBg3dTemplates,
  saveBg3dTemplate,
  type Bg3dTemplateLibraryEntry,
} from "./bg3d-template-library";
import { saveAsset } from "./studio-asset-library";
import {
  COMPOSITE_CATEGORIES,
  COMPOSITE_CATEGORY_LABELS,
  COMPOSITE_PRESETS,
  instantiateCompositePreset,
  type BgCompositeCategory,
} from "./studio-background-3d-composites";
import {
  cloneBgCustomModelInstances,
  checkStudioBg3dThreeBudgets,
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
  clampPanoramaRotationDegrees,
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
  acquireStudioBg3dCaptureAdapterAfterViewTransition,
  captureStudioBg3dRaster,
  getStudioBg3dCaptureSourceSize,
  type StudioBg3dCaptureAdapter,
} from "./studio-bg3d-capture-adapter";
import {
  createStudioBg3dCaptureBackgroundSnapshot,
  type StudioBg3dCaptureBackgroundSnapshot,
} from "./studio-bg3d-capture-background";
import {
  deriveStudioBg3dGlbValidationPolicy,
  resolveStudioBg3dDeviceQuality,
  type StudioBg3dDeviceSignals,
  type StudioBg3dResolvedDeviceQuality,
} from "./studio-bg3d-device-quality";
import {
  advanceStudioBg3dFrameQuality,
  createStudioBg3dFrameQualityState,
} from "./studio-bg3d-frame-quality-governor";
import {
  canSetStudioBg3dParent,
  resolveStudioBg3dHierarchy,
} from "./studio-bg3d-hierarchy";
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
  type StudioBg3dLtRasterLayerRole,
} from "./studio-bg3d-lt-render";
import {
  convertStudioBg3dModelFilesToGlb,
  StudioBg3dModelImportError,
  type StudioBg3dImportProgress,
} from "./studio-bg3d-model-import";
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
import {
  applyStudioBg3dPhysicsTransforms,
  createStudioBg3dPhysicsWorld,
  STUDIO_BG3D_PHYSICS_MAX_DYNAMIC_BODIES,
  type StudioBg3dPhysicsTransformSample,
  type StudioBg3dPhysicsWorld,
} from "./studio-bg3d-physics";
import {
  createStudioBg3dPhysicsThreeJob,
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
import {
  StudioBg3dPrimitiveGeometryPool,
  synchronizeStudioBg3dRootMatrix,
} from "./studio-bg3d-render-optimization";
import {
  createStudioBg3dRigPoseBakeCommitPatch,
  type StudioBg3dRigPoseBakeSnapshot,
} from "./studio-bg3d-rig-pose-bake";
import {
  DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK,
  DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER,
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
  DEFAULT_STUDIO_BG3D_POSE_LAYER,
  DEFAULT_STUDIO_BG3D_MORPH_LAYER,
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS,
  migrateStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
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
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";
import {
  calculateStudioBg3dThreeReparentTransform,
  calculateStudioBg3dThreeWorldMatrix,
  calculateStudioBg3dThreeWorldDeltaTransform,
} from "./studio-bg3d-three-hierarchy";
import {
  createStudioBg3dThreeStaticInstanceBatch,
  type StudioBg3dThreeInstancingSuccess,
} from "./studio-bg3d-three-instancing";
import {
  createStudioBg3dThreeWebglCaptureAdapter,
  registerStudioBg3dCaptureExcludedObject,
} from "./studio-bg3d-three-webgl-capture";
import { createTwoBoneDefaultPoleTarget } from "./studio-rig-two-bone-ik";
import {
  StudioBg3dPhysicsPanel,
  StudioBg3dPhysicsTransport,
} from "./StudioBg3dPhysicsControls";
import { StudioBg3dSceneFog } from "./StudioBg3dSceneFog";
import { StudioBg3dScenePanorama } from "./StudioBg3dScenePanorama";
import { StudioBg3dSceneTemplatePanel } from "./StudioBg3dSceneTemplatePanel";
import { StudioToolHintTarget } from "./StudioToolHint";
import { useStudioModalSheet } from "./useStudioModalSheet";

import type { StudioToolHintSpec } from "./studio-tool-hints";

export interface StudioBackground3DLtLayer {
  readonly role: StudioBg3dLtRasterLayerRole;
  readonly pngDataUrl: string;
  readonly width: number;
  readonly height: number;
}

export interface StudioBackground3DInsertResult {
  readonly kind: "separated";
  readonly width: number;
  readonly height: number;
  /** Back-to-front paint order: color/tone, texture line, main line. */
  readonly layers: readonly StudioBackground3DLtLayer[];
  /** Flattened fallback for document surfaces that intentionally do not support layer groups. */
  readonly compositePngDataUrl: string;
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
type BgPanelTab = "shapes" | "templates" | "layers" | "view" | "lt" | "models";
type ViewEditorSection = "camera" | "physics";
type LtEditorSection = "line" | "tone";
type LtUserPresetLibraryStatus = "idle" | "ready" | "recovered" | "unavailable";
type LtUserPresetNoticeTone = "info" | "success" | "error";
type LtUserPresetNotice = {
  readonly tone: LtUserPresetNoticeTone;
  readonly message: string;
};
type CaptureState = { adapter: StudioBg3dCaptureAdapter | null };

interface StudioBg3dHistorySnapshot {
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}

interface StudioBg3dPhysicsSession {
  readonly document: StudioBg3dSceneDocument;
  readonly world: StudioBg3dPhysicsWorld;
  readonly timeline: StudioBg3dPhysicsTimelineResult;
  readonly initialDynamicSamples: readonly StudioBg3dPhysicsTransformSample[];
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
};

const CONTROL_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9";
const ICON_BUTTON =
  "inline-grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-9";
const VIEWPORT_BTN =
  "grid size-11 place-items-center rounded-lg border border-line/70 bg-panel/80 text-fg-2 shadow-sm backdrop-blur transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-9";
const DEFAULT_LT_USER_PRESET_DESCRIPTION = "현재 장면에서 저장한 LT 선화·톤 설정입니다.";
const EMPTY_THREE_ANIMATION_CLIPS: readonly THREE.AnimationClip[] = Object.freeze([]);
const EMPTY_THREE_JOINTS: readonly StudioBg3dThreeJointDescriptor[] = Object.freeze([]);
const EMPTY_THREE_MORPH_TARGETS: readonly StudioBg3dThreeMorphDescriptor[] = Object.freeze([]);

let fallbackLtUserPresetIdSequence = 0;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

interface LtRangeControlProps {
  readonly id: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (value: number) => void;
  readonly step: number;
  readonly value: number;
  readonly valueText: string;
  readonly disabled?: boolean;
}

function LtRangeControl({
  id,
  label,
  max,
  min,
  onChange,
  step,
  value,
  valueText,
  disabled = false,
}: LtRangeControlProps) {
  return (
    <label
      htmlFor={id}
      className={cx(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line/70 py-1.5 last:border-b-0",
        disabled && "opacity-45"
      )}
    >
      <span className="text-xs font-semibold text-fg-2">{label}</span>
      <output htmlFor={id} className="min-w-12 text-right text-[0.68rem] tabular-nums text-fg-3">
        {valueText}
      </output>
      <input
        id={id}
        type="range"
        aria-valuetext={valueText}
        className="col-span-2 h-11 w-full cursor-pointer accent-accent disabled:cursor-not-allowed sm:h-8"
        disabled={disabled}
        max={max}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface PanoramaRotationNumberFieldProps {
  readonly disabled?: boolean;
  readonly onCommit: (value: number) => void;
  readonly value: number;
}

/** Keeps incomplete mobile/keyboard drafts local and commits one clamped degree value on blur. */
function PanoramaRotationNumberField({
  disabled = false,
  onCommit,
  value,
}: PanoramaRotationNumberFieldProps) {
  const cancelCommitRef = useRef(false);
  const [editState, setEditState] = useState<{
    readonly draft: string;
    readonly sourceValue: number;
  } | null>(null);
  const draft = editState?.sourceValue === value ? editState.draft : String(value);

  const commitDraft = () => {
    if (cancelCommitRef.current) {
      cancelCommitRef.current = false;
      setEditState(null);
      return;
    }
    const parsed = Number(draft.trim());
    setEditState(null);
    if (!draft.trim() || !Number.isFinite(parsed)) return;
    const committed = Math.round(clampPanoramaRotationDegrees(parsed));
    if (committed !== value) onCommit(committed);
  };

  return (
    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 sm:min-h-9">
      <span className="shrink-0">각도</span>
      <input
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-label="360도 환경 배경 수평 회전 각도"
        aria-valuemax={180}
        aria-valuemin={-180}
        aria-valuenow={
          draft.trim().length > 0 && Number.isFinite(Number(draft)) ? Number(draft) : undefined
        }
        autoComplete="off"
        disabled={disabled}
        value={draft}
        onBlur={commitDraft}
        onChange={(event) => {
          setEditState({ draft: event.target.value, sourceValue: value });
        }}
        onFocus={() => {
          cancelCommitRef.current = false;
          setEditState({ draft: String(value), sourceValue: value });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            cancelCommitRef.current = true;
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-right tabular-nums text-fg outline-none disabled:cursor-not-allowed disabled:opacity-45"
      />
      <span className="text-fg-3">°</span>
    </label>
  );
}

interface LtToggleRowProps {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}

function LtToggleRow({ checked, label, onChange, disabled = false }: LtToggleRowProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-line/70 py-2 text-left text-xs font-semibold text-fg-2 transition-colors last:border-b-0 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span
        aria-hidden
        className={cx(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-line-strong bg-raised"
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 size-3.5 rounded-full bg-fg transition-transform",
            checked ? "translate-x-[1.05rem]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
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
  { id: "models", label: "모델", icon: PackageOpen, hint: "업로드 · 배치 · 삭제" },
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
      preview: "object-3d",
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
      preview: "object-3d",
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
      preview: "object-3d",
      tip: "형태가 뒤틀리지 않게 하려면 축 중앙의 균일 크기 핸들을 사용하세요.",
    },
  },
];

const BG3D_VIEWPORT_HINTS = {
  quad: {
    id: "bg3d:view:quad",
    title: "4분할 뷰",
    description: "원근·위·앞·오른쪽 시점을 동시에 열어 객체의 깊이와 정렬을 확인합니다.",
    preview: "camera-3d",
    tip: "정면과 측면을 함께 보면서 배치하면 원근 화면에서 생기는 겹침을 줄일 수 있어요.",
  },
  undo: {
    id: "bg3d:history:undo",
    title: "3D 작업 실행 취소",
    description: "직전에 적용한 3D 장면 편집을 한 단계 되돌립니다.",
    shortcut: "⌘Z",
    preview: "history",
  },
  redo: {
    id: "bg3d:history:redo",
    title: "3D 작업 다시 실행",
    description: "실행 취소한 3D 장면 편집을 다시 적용합니다.",
    shortcut: "⌘⇧Z",
    preview: "history",
  },
  snap: {
    id: "bg3d:transform:snap",
    title: "변형 스냅",
    description: "이동과 회전을 설정한 간격에 맞춰 붙여 배경 구조를 반듯하게 정렬합니다.",
    preview: "object-3d",
    tip: "세부 간격과 적용 축은 도형 패널의 변형 스냅에서 바꿀 수 있어요.",
  },
  ground: {
    id: "bg3d:object:ground",
    title: "바닥에 접지",
    description: "선택한 도형이나 모델의 가장 낮은 지점을 계산해 바닥 높이에 정확히 맞춥니다.",
    preview: "object-3d",
  },
  focus: {
    id: "bg3d:camera:focus-selection",
    title: "선택 객체에 초점",
    description: "카메라의 중심을 선택한 3D 객체로 이동해 바로 확대·회전하며 확인할 수 있게 합니다.",
    preview: "camera-3d",
  },
  zoomIn: {
    id: "bg3d:camera:zoom-in",
    title: "3D 화면 확대",
    description: "카메라를 장면 안쪽으로 이동해 선택한 배경의 세부를 크게 봅니다.",
    preview: "camera-3d",
  },
  zoomOut: {
    id: "bg3d:camera:zoom-out",
    title: "3D 화면 축소",
    description: "카메라를 장면 바깥쪽으로 이동해 배경 전체의 구도와 여백을 확인합니다.",
    preview: "camera-3d",
  },
  resetView: {
    id: "bg3d:camera:reset",
    title: "3D 시점 초기화",
    description: "카메라 위치와 바라보는 지점을 기본 원근 구도로 되돌립니다.",
    preview: "camera-3d",
  },
  linePreview: {
    id: "bg3d:view:line-preview",
    title: "선화 미리보기",
    description: "재질색 대신 외곽선 중심으로 장면을 표시해 웹툰 배경 선화의 밀도를 미리 확인합니다.",
    preview: "object-3d",
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
      animations: loaded.animations,
      dispose: loaded.dispose,
      record: args.record,
      metrics: loaded.metrics,
      admittedProfiles: new Set([policy.profile]),
      joints: collectStudioBg3dThreeJoints(loaded.root),
      morphTargets: collectStudioBg3dThreeMorphTargets(loaded.root),
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
function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
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
    const adapter = createStudioBg3dThreeWebglCaptureAdapter({ camera, renderer: gl, scene });
    updateCapture({ adapter });
    return () => {
      updateCapture({ adapter: null }, adapter);
    };
  }, [camera, gl, scene]);

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
type BgViewportApi = {
  zoomBy: (factor: number) => void;
  applyPreset: (presetId: string) => void;
  applyView: (view: StudioBg3dCameraSettings) => void;
  readView: () => StudioBg3dCameraSettings;
  focusOn: (position: [number, number, number]) => void;
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
  }, [camera, controls, onReady]);

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
  registerRef: (id: string, obj: THREE.Group | null) => void;
  children?: React.ReactNode;
}

/* 도형 하나의 렌더 — 셰이딩 채움 + 검은 엣지 오버레이를 항상 함께 그린다.
   라인아트 모드에서도 채움 메시를 visible={false}로 숨기지 않고 unlit 흰색(meshBasicMaterial)으로만
   바꾸는 게 핵심: 깊이쓰기가 계속 켜져 있어 (1) 가려진 도형의 엣지가 앞 도형에 정확히 가려지는
   hidden-line-removal이 유지되고 (2) three.js/R3F가 invisible 오브젝트는 레이캐스트에서 제외하므로
   라인아트 미리보기 중에도 클릭 선택이 계속 동작한다. */
function BgPrimitiveMesh({ prim, geometryPool, lineArt, showEdges, selected, onSelect, registerRef, children }: BgPrimitiveMeshProps) {
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

function BgCustomModelMesh({ instance, cachedRoot, animations, selected, capturing, targetFps, lodBias, onSelect, registerRef, registerAnimationTime, registerRigBake, onAnimationComplete, onCloneStatus, children }: BgCustomModelMeshProps) {
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
  onCloneStatus,
  onUnavailable,
}: {
  batchKey: string;
  sourceRoot: THREE.Object3D;
  instances: readonly BgCustomModelInstance[];
  onSelect: (id: string, isMulti: boolean) => void;
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
      onClick={(event: { stopPropagation(): void; instanceId?: number; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
        const id = batch.resolveInstanceId(event.instanceId);
        if (!id) return;
        event.stopPropagation();
        onSelect(id, event.shiftKey || event.metaKey || event.ctrlKey);
      }}
    />
  );
}

function Vec3Field({
  label,
  values,
  step,
  precision,
  suffix,
  disabled = false,
  touchFriendly = false,
  onCommit,
}: {
  label: string;
  values: [number, number, number];
  step: number;
  precision: number;
  suffix?: string;
  disabled?: boolean;
  touchFriendly?: boolean;
  onCommit: (index: 0 | 1 | 2, value: number) => void;
}) {
  const axisLabels = ["X", "Y", "Z"] as const;
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1 text-[0.68rem] font-semibold text-fg-3">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {axisLabels.map((axisLabel, i) => (
          <label
            key={axisLabel}
            className={cx(
              "flex items-center gap-1 rounded-lg border border-line bg-card px-1.5 py-1 text-[0.7rem]",
              touchFriendly && "min-h-11 sm:min-h-8 pointer-coarse:min-h-11",
            )}
          >
            <span className="text-fg-3">{axisLabel}</span>
            <input
              aria-label={`${label} ${axisLabel}`}
              type="number"
              disabled={disabled}
              step={step}
              value={round(values[i as 0 | 1 | 2], precision)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onCommit(i as 0 | 1 | 2, n);
              }}
              className="w-full min-w-0 bg-transparent text-right text-fg outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            {suffix ? <span className="text-fg-3">{suffix}</span> : null}
          </label>
        ))}
      </div>
    </div>
  );
}

export function StudioBackground3D({ open, initialDataUrl, initialScene, onClose, onInsert }: StudioBackground3DProps) {
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
  // 복합 오브젝트 프리셋 그리드 카테고리 필터. null=전체.
  const [compositeCategory, setCompositeCategory] = useState<BgCompositeCategory | null>(null);
  // 씬 템플릿 그리드 카테고리 필터. null=전체. compositeCategory와 동형이지만 별개 상태 —
  // BgSceneTemplateCategory와 BgCompositeCategory는 서로 다른 타입이라 공유할 수 없다("공간 종류" vs
  // "물체 종류"라는 다른 축, studio-background-3d-scene-templates.ts 상단 주석 참고).
  const [sceneTemplateCategory, setSceneTemplateCategory] = useState<BgSceneTemplateCategory | null>(null);
  // CSP-style move/rotate step snap + 레이어 목록 검색.
  const [snapSettings, setSnapSettings] = useState<StudioBg3dSnapSettings>(() => ({
    ...DEFAULT_STUDIO_BG3D_SNAP_SETTINGS,
  }));
  const [layerQuery, setLayerQuery] = useState("");

  // 업로드된 커스텀 3D 모델(§bg3d-model-library.ts)의 씬 배치 인스턴스 + 라이브러리 목록/상태.
  const [customModels, setCustomModels] = useState<BgCustomModelInstance[]>([]);
  const [modelLibrary, setModelLibrary] = useState<Bg3dModelLibraryEntry[]>([]);
  const [modelLibraryStatus, setModelLibraryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [modelImportProgress, setModelImportProgress] = useState<StudioBg3dImportProgress | null>(null);
  const modelImportAbortRef = useRef<AbortController | null>(null);
  const modelAnimationTimeReadersRef = useRef(new Map<string, () => number>());
  const modelRigBakeReadersRef = useRef(new Map<string, StudioBg3dRigBakeReader>());
  const [poseJointSelection, setPoseJointSelection] = useState("");
  const [ikEndJointSelection, setIkEndJointSelection] = useState<{
    readonly modelId: string;
    readonly jointKey: string;
  } | null>(null);
  const [morphTargetSelection, setMorphTargetSelection] = useState("");
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [isRestoringScene, setIsRestoringScene] = useState(false);
  const [templateLibrary, setTemplateLibrary] = useState<Bg3dTemplateLibraryEntry[]>([]);
  const [templateLibraryStatus, setTemplateLibraryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  useEffect(() => () => modelImportAbortRef.current?.abort(), []);
  useEffect(() => {
    if (!open) {
      primitiveGeometryPool.dispose();
      setAdaptiveDprScale(1);
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
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
    setIsSavingTemplate(true);
    try {
      const templateName = `내 소재 ${new Date().toLocaleDateString()}`;
      const newTemplate: Bg3dTemplateLibraryEntry = {
        id: generateId(),
        name: templateName,
        createdAt: Date.now(),
        template: {
          primitives: primitives.map(p => ({ ...p, id: generateId() })),
          customModels: customModels.map(m => ({ ...m, id: generateId() }))
        },
        commercialUse: true
      };
      await saveBg3dTemplate(newTemplate);
      setTemplateLibrary(await listBg3dTemplates());
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingTemplate(false);
    }
  };
  
  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteBg3dTemplate(id);
      setTemplateLibrary(await listBg3dTemplates());
    } catch (err) {
      console.error(err);
    }
  };

    const [sceneRecoveryError, setSceneRecoveryError] = useState<string | null>(null);
  const [failedCloneIds, setFailedCloneIds] = useState<Set<string>>(() => new Set());
  const [readyCloneIds, setReadyCloneIds] = useState<Set<string>>(() => new Set());
  const [unbatchableModelIds, setUnbatchableModelIds] = useState<Set<string>>(() => new Set());
  const [sceneBaseDocument, setSceneBaseDocument] = useState<StudioBg3dSceneDocument>(
    () => canonicalSceneDocument(initialScene) ?? DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT
  );
  const [captureBackgroundSnapshot, setCaptureBackgroundSnapshot] =
    useState<StudioBg3dCaptureBackgroundSnapshot | null>(null);
  const [deviceSignals, setDeviceSignals] = useState<StudioBg3dDeviceSignals>(() => collectDeviceSignals());
  const skyPresetId = sceneBaseDocument.background.skyPresetId;
  const transparentInsert =
    sceneBaseDocument.output.transparentBackground ||
    sceneBaseDocument.background.mode === "transparent";

  const captureRef = useRef<CaptureState>({ adapter: null });
  const modalDialogRef = useRef<HTMLDivElement | null>(null);
  const modalRootRef = useRef<HTMLElement | null>(null);
  const viewportApiRef = useRef<BgViewportApi | null>(null);
  const pendingInitialCameraRef = useRef<StudioBg3dCameraSettings | null>(null);
  const viewportHostRef = useRef<HTMLDivElement>(null);
  const primitiveObjectsRef = useRef<Map<string, THREE.Group>>(new Map());
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
  const captureInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const physicsStartButtonRef = useRef<HTMLButtonElement | null>(null);
  const physicsTransportActionRef = useRef<HTMLButtonElement | null>(null);
  const shouldTransferPhysicsFocusRef = useRef(false);

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
    isRestoringScene || physicsInteractionLocked;

  // This editor is portalled to document.body, so body is the nearest shared root that contains
  // both the dialog and the Studio launcher. Setting it in an earlier layout effect satisfies the
  // shared modal hook's rootRef contract before that hook activates focus isolation.
  useLayoutEffect(() => {
    modalRootRef.current = modalDialogRef.current?.ownerDocument.body ?? null;
  }, [open]);
  useStudioModalSheet({
    activeKey: open ? "studio-bg3d" : null,
    dialogRef: modalDialogRef,
    onDismiss: requestUserClose,
    resolveInitialFocus: (dialog) =>
      dialog.querySelector<HTMLElement>("[data-bg3d-initial-focus='true']"),
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
    setModelLibraryStatus("loading");
    listBg3dModelLibraryEntries()
      .then((entries) => {
        setModelLibrary(entries);
        setModelLibraryStatus("ready");
      })
      .catch(() => setModelLibraryStatus("error"));
  }, [open, setTemplateLibrary, setTemplateLibraryStatus]);

  useEffect(() => {
    if (!open) return;
    setTemplateLibraryStatus("loading");
    listBg3dTemplates()
      .then((entries) => {
        setTemplateLibrary(entries);
        setTemplateLibraryStatus("ready");
      })
      .catch(() => setTemplateLibraryStatus("error"));
  }, [open, setTemplateLibrary, setTemplateLibraryStatus]);

  // 신규 장면 문서는 hash로 검증 레코드를 찾고, admission→Three 안전 파서를 모두 통과한 뒤 runtime
  // 배열로 hydrate한다. 실패한 모델 노드는 절대 저장 시 조용히 제거하지 않고 업데이트 자체를 잠근다.
  // initialScene이 없을 때만 과거 PNG fragment를 읽어 하위 호환한다.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
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
        if (!cancelled) {
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
        historyRef.current = [createStudioBg3dHistorySnapshot({
          primitives: hydrated.primitives,
          customModels: hydrated.customModels,
          document: canonicalInitial,
        })];
        historyIndexRef.current = 0;
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
        setIsRestoringScene(false);
        return;
      }

      const parsed = parseBg3dSceneWithModelsFromDataUrl(initialDataUrl);
      setSceneBaseDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT);
      pendingInitialCameraRef.current = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera;
      viewportApiRef.current?.applyView(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera);
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
      setIsRestoringScene(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialDataUrl, initialScene]);

  // 편집이 멈추면(디바운스) 스냅샷을 히스토리에 적재한다. 도형·커스텀 모델·장면 문서를 한 타임라인에
  // 묶어 배경/조명/LT 설정도 도형과 같은 Ctrl+Z 계약을 따른다. 카메라 Orbit의 매 프레임 임시 시점은
  // sceneBaseDocument에 쓰지 않으므로 히스토리를 과도하게 채우지 않는다.
  useEffect(() => {
    if (isRestoringScene) return;
    const timer = setTimeout(() => {
      const snap = createStudioBg3dHistorySnapshot({
        primitives,
        customModels,
        document: sceneBaseDocument,
      });
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
  }, [customModels, isRestoringScene, primitives, sceneBaseDocument]);

  function commitImmediateHistoryTransition(
    nextPrimitives: readonly BgPrimitive[],
    nextCustomModels: readonly BgCustomModelInstance[],
    nextDocument: StudioBg3dSceneDocument,
  ): void {
    const before = createStudioBg3dHistorySnapshot({
      primitives,
      customModels,
      document: sceneBaseDocument,
    });
    const after = createStudioBg3dHistorySnapshot({
      primitives: nextPrimitives,
      customModels: nextCustomModels,
      document: nextDocument,
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
    setPrimitives(clonePrimitives(snap.primitives));
    setCustomModels(cloneBgCustomModelInstances(snap.customModels));
    setSceneBaseDocument(snap.document);
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  };
  const doRedo = () => {
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) return;
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snap = historyRef.current[historyIndexRef.current];
    setPrimitives(clonePrimitives(snap.primitives));
    setCustomModels(cloneBgCustomModelInstances(snap.customModels));
    setSceneBaseDocument(snap.document);
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

  const removeSceneEntities = (ids: ReadonlySet<string>): boolean => {
    if (ids.size === 0) return false;
    const entities = [...primitives, ...customModels];
    const detachedTransforms = new Map<
      string,
      NonNullable<ReturnType<typeof calculateStudioBg3dThreeReparentTransform>>
    >();
    for (const entity of entities) {
      if (ids.has(entity.id) || !entity.parentId || !ids.has(entity.parentId)) continue;
      const detached = calculateStudioBg3dThreeReparentTransform(entities, entity.id, null);
      if (!detached) {
        setError("부모를 삭제해도 자식의 월드 변환을 보존할 수 없어 삭제를 취소했습니다.");
        return false;
      }
      detachedTransforms.set(entity.id, detached);
    }
    const retain = <T extends BgPrimitive | BgCustomModelInstance>(entity: T): T | null => {
      if (ids.has(entity.id)) return null;
      if (!detachedTransforms.has(entity.id)) return entity;
      return {
        ...entity,
        parentId: null,
        ...detachedTransforms.get(entity.id),
      };
    };
    setPrimitives((current) => current.map(retain).filter((entity): entity is BgPrimitive => entity !== null));
    setCustomModels((current) =>
      current.map(retain).filter((entity): entity is BgCustomModelInstance => entity !== null));
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
    const patch = createStudioBg3dRigPoseBakeCommitPatch(model.animation, snapshot);
    if (!patch) {
      setError("현재 표시 프레임을 정적 포즈로 정규화하지 못했습니다.");
      return;
    }
    const nextCustomModels = customModels.map((candidate) => candidate.id === id
      ? { ...candidate, ...patch }
      : candidate
    );
    commitImmediateHistoryTransition(primitives, nextCustomModels, sceneBaseDocument);
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

  function focusSelectedEntity() {
    if (selectedIds.size === 0) return;
    const firstId = Array.from(selectedIds)[0];
    const entity = primitives.find((p) => p.id === firstId) || customModels.find((m) => m.id === firstId);
    if (!entity) return;
    const object = primitiveObjectsRef.current.get(firstId);
    if (!object) {
      viewportApiRef.current?.focusOn(entity.position);
      return;
    }
    object.updateWorldMatrix(true, false);
    const worldPosition = object.getWorldPosition(new THREE.Vector3());
    viewportApiRef.current?.focusOn([worldPosition.x, worldPosition.y, worldPosition.z]);
  }

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
      setSelectedIds(new Set([next.id]));
      setRefTick((n) => n + 1);
    } catch {
      setError("3D 모델의 원본과 무결성을 확인하지 못해 장면에 추가하지 않았습니다.");
    }
  }

  async function handleUploadModelFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = ""; // StudioVrmPoser.tsx handleFileChange와 동일 — 같은 파일 재선택 허용
    if (files.length === 0) return;

    modelImportAbortRef.current?.abort();
    const importController = new AbortController();
    modelImportAbortRef.current = importController;
    setIsUploadingModel(true);
    setError(null);
    const cacheIdsBefore = new Set(modelRootCacheRef.current.keys());
    try {
      const policy = deriveStudioBg3dGlbValidationPolicy(sceneBaseDocument, deviceQuality);
      const canonicalInputs = await convertStudioBg3dModelFilesToGlb(files, {
        signal: importController.signal,
        onProgress: setModelImportProgress,
      });
      const imported = await importVerifiedBg3dModelsAtomically(canonicalInputs, {
        profile: policy.profile,
        budgets: policy.budgets,
        signal: importController.signal,
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
        setSelectedIds(new Set([placements[placements.length - 1].id]));
        setRefTick((n) => n + 1);
      }
    } catch (importFailure) {
      // 저장은 atomic import가 책임지고, 화면 배치는 별도 all-or-none이다. 이번 시도에서 처음 로드한
      // 캐시만 되돌려 기존 장면 인스턴스가 공유 중인 자원은 건드리지 않는다.
      for (const [id, entry] of modelRootCacheRef.current) {
        if (cacheIdsBefore.has(id)) continue;
        entry.dispose();
        modelRootCacheRef.current.delete(id);
      }
      setError(
        importFailure instanceof StudioBg3dModelImportError
          ? importFailure.message
          : importController.signal.aborted
            ? "3D 모델 가져오기를 취소했습니다. 장면과 라이브러리는 변경하지 않았습니다."
            : "선택한 모델 중 하나가 변환·안전 검사 또는 기기 복잡도 기준을 통과하지 못해 아무 모델도 배치하지 않았습니다."
      );
      try {
        setModelLibrary(await listBg3dModelLibraryEntries());
      } catch {
        setModelLibraryStatus("error");
      }
    } finally {
      if (modelImportAbortRef.current === importController) modelImportAbortRef.current = null;
      setModelImportProgress(null);
      setIsUploadingModel(false);
    }
  }

  async function handleDeleteModelFromLibrary(id: string) {
    setDeletingModelId(id);
    try {
      await deleteStoredBg3dModel(id);
      const removedInstanceIds = new Set(
        customModels.filter((instance) => instance.modelId === id).map((instance) => instance.id),
      );
      removeSceneEntities(removedInstanceIds);
      const attachment = attachmentByStorageModelIdRef.current.get(id);
      attachmentByStorageModelIdRef.current.delete(id);
      if (attachment) storageModelIdByAttachmentIdRef.current.delete(attachment.id);
      const cacheEntry = modelRootCacheRef.current.get(id);
      modelRootCacheRef.current.delete(id);
      if (cacheEntry) requestAnimationFrame(() => cacheEntry.dispose());
      if (customModels.some((model) => model.id === firstSelectedId && model.modelId === id)) {
        setSelectedIds(new Set());
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

  function updateBackgroundTransparency(transparent: boolean) {
    setSceneBaseDocument((current) => {
      const candidate: StudioBg3dSceneDocument = {
        ...current,
        background: {
          ...current.background,
          mode: transparent ? "transparent" : "sky-preset",
        },
        output: {
          ...current.output,
          transparentBackground: transparent,
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

  const onCaptureUpdate = (
    state: CaptureState,
    cleanupAdapter?: StudioBg3dCaptureAdapter | null
  ) => {
    if (cleanupAdapter) {
      if (captureRef.current.adapter === cleanupAdapter) {
        captureRef.current = { adapter: null };
      }
    } else {
      captureRef.current = state;
    }
  };

  function requestUserClose() {
    // The header sits outside the inert editor grid, so the ref is the synchronous authority for
    // the click that can arrive before React commits `isCapturing`. Successful insertion closes via
    // `onClose` directly after its transaction has completed.
    if (captureInFlightRef.current) return;
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) {
      resetPhysicsPreview();
    }
    onClose();
  }

  async function handleSaveToLibrary() {
    if (
      captureInFlightRef.current || isCapturing || insertBlocked ||
      isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)
    ) return;
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
        background: {
          color: backgroundSnapshot.clearColor,
          alpha: backgroundSnapshot.transparent ? 0 : 1,
        },
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
    if (captureInFlightRef.current || isCapturing) return;
    if (isStudioBg3dPhysicsTransientPhase(physicsPhaseRef.current)) {
      setError("물리 미리보기를 초기화하거나 현재 자세를 적용한 뒤 3D 배경을 추가하세요.");
      return;
    }
    if (insertBlocked) {
      setError("3D 장면 복원과 모델 렌더 준비를 모두 마친 뒤 추가할 수 있습니다.");
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
      setError("장면 원본을 손실 없이 저장할 수 없어 추가를 중단했습니다. 문제가 있는 도형이나 모델을 확인해 주세요.");
      return;
    }

    // LT 검출은 깨끗한 셰이딩 캡처를 입력으로 삼는다. 캡처 중에는 그리드·변환 핸들·프리미티브의
    // 뷰포트용 edge overlay를 숨기고, 순수 래스터 단계가 주선·재질선·톤을 독립적으로 계산한다.
    const previousLineArtPreview = lineArtPreview;
    captureInFlightRef.current = true;
    setCaptureBackgroundSnapshot(backgroundSnapshot);
    setLineArtPreview(false);
    setIsCapturing(true);
    try {
      // React/R3F가 캡처 전용 visibility와 셰이딩 상태를 반영할 시간을 보장한다.
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

      const sourceSize = getStudioBg3dCaptureSourceSize(captureAdapter);
      const captureSize = resolveStudioBg3dLtCaptureSize({
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        requestedHeight: adapted.document.output.exportHeight,
        maxPixels: Math.min(deviceQuality.maxRenderPixels, STUDIO_BG3D_LT_RENDER_MAX_PIXELS),
      });
      if (!captureSize) {
        throw new Error("LT capture size admission failed.");
      }
      const captured = await captureStudioBg3dRaster(captureAdapter, {
        width: captureSize.width,
        height: captureSize.height,
        background: {
          color: backgroundSnapshot.clearColor,
          alpha: backgroundSnapshot.transparent ? 0 : 1,
        },
        includeDepth: adapted.document.output.line.depthEnabled,
      });
      if (!componentActiveRef.current || captureRef.current.adapter !== captureAdapter) return;
      const rendered = renderStudioBg3dLtLayers(
        {
          width: captured.width,
          height: captured.height,
          rgba: captured.rgba,
          ...(captured.depth ? { depth: captured.depth } : {}),
        },
        { line: adapted.document.output.line, tone: adapted.document.output.tone }
      );
      if (rendered.layers.length === 0) {
        setError("현재 LT 설정에서는 보이는 선화나 톤이 만들어지지 않습니다. 선화 또는 톤을 켜 주세요.");
        return;
      }
      const encoded = encodeStudioBg3dLtLayers(rendered.layers);
      setSceneBaseDocument(adapted.document);
      const accepted = onInsert({
        kind: "separated",
        width: rendered.width,
        height: rendered.height,
        layers: encoded.layers,
        compositePngDataUrl: encoded.compositePngDataUrl,
        bg3dScene: adapted.document,
      });
      if (accepted === false) {
        setError(
          "편집 문서가 변경되었거나 현재 페이지에 삽입할 수 없습니다. 3D 창을 닫고 페이지 잠금·선택 상태를 확인한 뒤 다시 열어 주세요."
        );
        return;
      }
      onClose();
    } catch {
      setError("3D 장면을 LT 레이어로 변환하지 못했습니다. 출력 해상도와 브라우저 그래픽 상태를 확인해 주세요.");
    } finally {
      captureInFlightRef.current = false;
      if (componentActiveRef.current) {
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
  const selectedModelAnimations = selectedCustomModel
    ? (modelRootCacheRef.current.get(selectedCustomModel.modelId)?.animations ?? EMPTY_THREE_ANIMATION_CLIPS)
    : EMPTY_THREE_ANIMATION_CLIPS;
  const selectedModelJoints = selectedCustomModel
    ? (modelRootCacheRef.current.get(selectedCustomModel.modelId)?.joints ?? EMPTY_THREE_JOINTS)
    : EMPTY_THREE_JOINTS;
  const selectedPoseJointKey = selectedModelJoints.some((joint) => joint.key === poseJointSelection)
    ? poseJointSelection
    : (selectedModelJoints[0]?.key ?? "");
  const selectedPoseJoint = selectedCustomModel?.pose?.joints.find(
    (joint) => joint.jointKey === selectedPoseJointKey,
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
    (constraint) => constraint.jointKey === selectedPoseJointKey,
  );
  const selectedJointByKey = new Map(selectedModelJoints.map((joint) => [joint.key, joint] as const));
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
  const selectedModelMorphTargets = selectedCustomModel
    ? (modelRootCacheRef.current.get(selectedCustomModel.modelId)?.morphTargets ?? EMPTY_THREE_MORPH_TARGETS)
    : EMPTY_THREE_MORPH_TARGETS;
  const selectedMorphTargetKey = selectedModelMorphTargets.some((target) => target.key === morphTargetSelection)
    ? morphTargetSelection
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
  const groundSelectionDisabledReason =
    physicsInteractionLocked
      ? "물리 미리보기 중에는 장면 변형 도구를 잠급니다."
      : selectedEntities.length === 0
      ? "도형 또는 3D 모델을 먼저 선택하세요."
      : !canGroundSelection
        ? "선택한 객체의 잠금을 해제하세요."
        : undefined;
  const snapSettingsSummary = studioBg3dSnapSettingsSummary(snapSettings);
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
  const managedLtUserPreset = ltManagedUserPresetId
    ? ltUserPresetPayload.presets.find((preset) => preset.id === ltManagedUserPresetId) ?? null
    : null;
  const ltCaptureSizePreview = resolveStudioBg3dLtCaptureSize({
    sourceWidth: deviceQuality.renderWidth,
    sourceHeight: deviceQuality.renderHeight,
    requestedHeight: sceneBaseDocument.output.exportHeight,
    maxPixels: Math.min(deviceQuality.maxRenderPixels, STUDIO_BG3D_LT_RENDER_MAX_PIXELS),
  });
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
    const physicsJob = localWorld
      ? createStudioBg3dPhysicsThreeJob(adapted.document, localWorld)
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
      const initialDynamicSamples = sampleStudioBg3dPhysicsTimeline(timeline, 0);
      if (!initialDynamicSamples) {
        throw new Error("invalid-initial-physics-sample");
      }
      const session: StudioBg3dPhysicsSession = Object.freeze({
        document: adapted.document,
        world: physicsJob.world,
        timeline,
        initialDynamicSamples,
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

  const bakePhysicsPreview = () => {
    if (
      physicsPhaseRef.current !== "paused" && physicsPhaseRef.current !== "complete" &&
      physicsPhaseRef.current !== "running"
    ) return;
    const session = physicsSessionRef.current;
    const samples = latestPhysicsSamplesRef.current;
    if (!session || samples.length === 0) return;
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
      hydrated.primitives.length !== primitives.length ||
      hydrated.customModels.length !== customModels.length
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

  const effectiveIsQuadView = isQuadView && !isCapturing && !physicsInteractionLocked;
  const isMainOrtho = sceneBaseDocument.camera.projection === "orthographic";
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
      <BgViewportController
        onReady={(api) => {
          viewportApiRef.current = api;
          if (api && pendingInitialCameraRef.current) {
            api.applyView(pendingInitialCameraRef.current);
            pendingInitialCameraRef.current = null;
          }
        }}
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
      {staticModelBatches.map((batch) => (
        <BgCustomModelInstanceBatch
          key={`${batch.modelId}:${batch.key}`}
          batchKey={batch.key}
          sourceRoot={batch.sourceRoot}
          instances={batch.instances}
          onSelect={selectSceneEntity}
          onCloneStatus={updateModelCloneStatuses}
          onUnavailable={() => {
            setUnbatchableModelIds((current) => new Set(current).add(batch.modelId));
          }}
        />
      ))}
      {sceneHierarchy.roots.map(renderSceneEntity)}
      {!isCapturing &&
      !physicsInteractionLocked &&
      firstSelectedId &&
      !selectedIsLocked &&
      isBgObjectVisible(selectedEntity) &&
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
      enabled={!isTransforming && !isCapturing}
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
          <button
            type="button"
            aria-label="닫기"
            data-bg3d-initial-focus="true"
            title={isCapturing ? "캡처가 끝난 뒤 닫을 수 있습니다" : "닫기 (Esc)"}
            className={ICON_BUTTON}
            disabled={isCapturing}
            onClick={requestUserClose}
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <div
          aria-busy={isCapturing || undefined}
          inert={isCapturing}
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
                  className={cx("h-full w-full", effectiveIsQuadView && "pointer-events-none absolute inset-0 z-10")}
                  dpr={deviceQuality.effectiveDpr * adaptiveDprScale}
                  shadows={{ enabled: deviceQuality.shadows, type: THREE.PCFShadowMap }}
                  gl={{ antialias: sceneBaseDocument.render.antialias, alpha: true }}
                  onCreated={({ gl }) => gl.setClearColor(getSkyPreset(renderedSkyPresetId).clearColor, 1)}
                  onPointerMissed={() => {
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
                  {effectiveIsQuadView ? (
                    <Fragment>
                      <View track={viewTopRef as unknown as React.RefObject<HTMLElement>}>
                        <OrthographicCamera makeDefault position={[0, 15, 0]} rotation={[-Math.PI / 2, 0, 0]} zoom={40} near={-100} far={100} />
                        {sceneContent}
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing} />
                      </View>
                      <View track={viewFrontRef as unknown as React.RefObject<HTMLElement>}>
                        <OrthographicCamera makeDefault position={[0, 0, 15]} rotation={[0, 0, 0]} zoom={40} near={-100} far={100} />
                        {sceneContent}
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing} />
                      </View>
                      <View track={viewRightRef as unknown as React.RefObject<HTMLElement>}>
                        <OrthographicCamera makeDefault position={[15, 0, 0]} rotation={[0, Math.PI / 2, 0]} zoom={40} near={-100} far={100} />
                        {sceneContent}
                        <OrbitControls makeDefault enableRotate={false} enableDamping dampingFactor={0.08} enablePan enabled={!isTransforming && !isCapturing} />
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

                <div className="absolute left-2 top-2 z-10 grid grid-cols-3 gap-1.5 sm:left-2.5 sm:top-2.5 sm:flex sm:flex-col">
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
                            disabled={physicsInteractionLocked}
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
                  <StudioToolHintTarget hint={BG3D_VIEWPORT_HINTS.quad} preferredSide="right">
                    <button
                      type="button"
                      aria-label="4분할 뷰 토글"
                      aria-pressed={isQuadView}
                      disabled={physicsInteractionLocked}
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
                    hint={{
                      ...BG3D_VIEWPORT_HINTS.snap,
                      description: `${BG3D_VIEWPORT_HINTS.snap.description} 현재 설정: ${snapSettingsSummary}.`,
                    }}
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
                    hint={BG3D_VIEWPORT_HINTS.focus}
                    disabled={!selectedEntity}
                    unavailableReason={!selectedEntity ? "도형 또는 3D 모델을 먼저 선택하세요." : undefined}
                    preferredSide="right"
                  >
                    <button
                      type="button"
                      aria-label="초점 맞춤"
                      disabled={!selectedEntity}
                      className={cx(VIEWPORT_BTN, "disabled:cursor-not-allowed disabled:opacity-40")}
                      onClick={focusSelectedEntity}
                    >
                      <ScanLine size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                </div>

                <div className="absolute right-2 top-2 z-10 grid grid-cols-2 gap-1.5 sm:right-2.5 sm:top-2.5 sm:flex sm:flex-col">
                  <StudioToolHintTarget hint={BG3D_VIEWPORT_HINTS.zoomIn} preferredSide="left">
                    <button
                      type="button"
                      aria-label="확대"
                      className={VIEWPORT_BTN}
                      onClick={() => {
                        viewportApiRef.current?.zoomBy(0.82);
                        setViewportHinted(true);
                      }}
                    >
                      <ZoomIn size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget hint={BG3D_VIEWPORT_HINTS.zoomOut} preferredSide="left">
                    <button
                      type="button"
                      aria-label="축소"
                      className={VIEWPORT_BTN}
                      onClick={() => {
                        viewportApiRef.current?.zoomBy(1.22);
                        setViewportHinted(true);
                      }}
                    >
                      <ZoomOut size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget hint={BG3D_VIEWPORT_HINTS.resetView} preferredSide="left">
                    <button
                      type="button"
                      aria-label="시점 초기화"
                      className={VIEWPORT_BTN}
                      onClick={() => {
                        viewportApiRef.current?.applyPreset("default");
                        setViewportHinted(true);
                      }}
                    >
                      <Maximize2 size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                  <StudioToolHintTarget hint={BG3D_VIEWPORT_HINTS.linePreview} preferredSide="left">
                    <button
                      type="button"
                      aria-label="선화로 보기"
                      aria-pressed={lineArtPreview}
                      className={cx(VIEWPORT_BTN, lineArtPreview && "border-accent/60 bg-accent text-on-accent hover:bg-accent/90 hover:text-on-accent")}
                      onClick={() => setLineArtPreview((v) => !v)}
                    >
                      <Boxes size={16} aria-hidden />
                    </button>
                  </StudioToolHintTarget>
                </div>

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

            <div
              ref={panelScrollRef}
              id="bg3d-panel-body"
              role="tabpanel"
              aria-labelledby={`bg3d-tab-${activePanelTab}`}
              inert={physicsInteractionLocked}
              className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5"
            >
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
                        aria-label={btn.label}
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
                  <div className="mb-4 rounded-xl border border-line/80 bg-card/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-fg">변형 스냅</p>
                      <button
                        type="button"
                        aria-pressed={snapSettings.enabled}
                        className={cx(
                          "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[0.68rem] font-semibold transition-colors",
                          snapSettings.enabled
                            ? "border-accent/55 bg-accent text-on-accent"
                            : "border-line bg-panel text-fg-2 hover:bg-accent-soft hover:text-accent"
                        )}
                        onClick={() =>
                          setSnapSettings((prev) =>
                            normalizeStudioBg3dSnapSettings({ ...prev, enabled: !prev.enabled })
                          )
                        }
                      >
                        <Magnet size={13} aria-hidden />
                        {snapSettings.enabled ? "켜짐" : "꺼짐"}
                      </button>
                    </div>
                    <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
                      {studioBg3dSnapSettingsSummary(snapSettings)} · 기즈모·수치 입력 모두 적용
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-[0.65rem] font-semibold text-fg-3">
                        이동 간격
                        <select
                          className="mt-1 min-h-9 w-full rounded-lg border border-line bg-panel px-2 text-xs font-semibold text-fg"
                          value={snapSettings.translateStep}
                          disabled={!snapSettings.enabled}
                          onChange={(e) =>
                            setSnapSettings((prev) =>
                              normalizeStudioBg3dSnapSettings({
                                ...prev,
                                translateStep: Number(e.target.value),
                              })
                            )
                          }
                        >
                          {STUDIO_BG3D_TRANSLATE_STEP_OPTIONS.map((step) => (
                            <option key={step} value={step}>
                              {step}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[0.65rem] font-semibold text-fg-3">
                        회전 간격
                        <select
                          className="mt-1 min-h-9 w-full rounded-lg border border-line bg-panel px-2 text-xs font-semibold text-fg"
                          value={snapSettings.rotateStepDegrees}
                          disabled={!snapSettings.enabled}
                          onChange={(e) =>
                            setSnapSettings((prev) =>
                              normalizeStudioBg3dSnapSettings({
                                ...prev,
                                rotateStepDegrees: Number(e.target.value),
                              })
                            )
                          }
                        >
                          {STUDIO_BG3D_ROTATE_STEP_OPTIONS_DEG.map((step) => (
                            <option key={step} value={step}>
                              {step}°
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "xyz" as const, label: "XYZ" },
                          { id: "xz" as const, label: "XZ(바닥)" },
                          { id: "none" as const, label: "회전만" },
                        ] as const
                      ).map((axis) => (
                        <button
                          key={axis.id}
                          type="button"
                          disabled={!snapSettings.enabled}
                          aria-pressed={snapSettings.translateAxes === axis.id}
                          className={cx(
                            "min-h-8 rounded-lg border px-2 text-[0.65rem] font-semibold transition-colors disabled:opacity-45",
                            snapSettings.translateAxes === axis.id
                              ? "border-accent/55 bg-accent-soft text-accent"
                              : "border-line bg-panel text-fg-2 hover:bg-raised"
                          )}
                          onClick={() =>
                            setSnapSettings((prev) =>
                              normalizeStudioBg3dSnapSettings({ ...prev, translateAxes: axis.id })
                            )
                          }
                        >
                          {axis.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedPrimitive ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-fg">선택한 도형</h3>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={isBgObjectVisible(selectedPrimitive) ? "숨기기" : "보이기"}
                            title={isBgObjectVisible(selectedPrimitive) ? "숨기기" : "보이기"}
                            className={ICON_BUTTON}
                            onClick={() => togglePrimitiveFlag(selectedPrimitive.id, "visible")}
                          >
                            {isBgObjectVisible(selectedPrimitive) ? (
                              <Eye size={14} aria-hidden />
                            ) : (
                              <EyeOff size={14} aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={isBgObjectLocked(selectedPrimitive) ? "잠금 해제" : "잠금"}
                            title={isBgObjectLocked(selectedPrimitive) ? "잠금 해제" : "잠금"}
                            className={cx(ICON_BUTTON, isBgObjectLocked(selectedPrimitive) && "border-accent/40 bg-accent-soft text-accent")}
                            onClick={() => togglePrimitiveFlag(selectedPrimitive.id, "locked")}
                          >
                            {isBgObjectLocked(selectedPrimitive) ? (
                              <Lock size={14} aria-hidden />
                            ) : (
                              <Unlock size={14} aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label="바닥에 접지"
                            title="바닥에 접지"
                            disabled={selectedIsLocked}
                            className={cx(ICON_BUTTON, "disabled:opacity-40")}
                            onClick={groundSelectedEntity}
                          >
                            <MoveDown size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="초점 맞춤"
                            title="초점 맞춤"
                            className={ICON_BUTTON}
                            onClick={focusSelectedEntity}
                          >
                            <ScanLine size={14} aria-hidden />
                          </button>
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

                      {selectedIsLocked ? (
                        <p className="rounded-lg border border-line bg-raised/60 px-2.5 py-2 text-[0.68rem] leading-relaxed text-fg-3">
                          잠긴 객체입니다. 위치·회전·크기를 바꾸려면 잠금을 해제하세요.
                        </p>
                      ) : null}

                                            <div className="flex flex-col gap-1.5">
                        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">부모 계층 (Parent)
                        <select
                          className="h-9 w-full rounded border border-line bg-card px-2 text-xs text-fg focus:border-accent"
                          disabled={selectedIsLocked}
                          value={selectedPrimitive.parentId || ""}
                          onChange={(e) => {
                            const newParentId = e.target.value || null;
                            reparentSceneEntity(selectedPrimitive.id, newParentId);
                          }}
                        >
                          <option value="">(최상위 / 없음)</option>
                          {layerListItems.filter((item) =>
                            canSetStudioBg3dParent(layerListItems, selectedPrimitive.id, item.id)
                          ).map(item => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        </label>
                      </div>

                      <Vec3Field
                        label="위치"
                        values={selectedPrimitive.position}
                        step={snapSettings.enabled ? snapSettings.translateStep : 0.1}
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
                        step={snapSettings.enabled ? snapSettings.rotateStepDegrees : 1}
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
                            aria-label={isBgObjectVisible(selectedCustomModel) ? "숨기기" : "보이기"}
                            title={isBgObjectVisible(selectedCustomModel) ? "숨기기" : "보이기"}
                            className={ICON_BUTTON}
                            onClick={() => toggleCustomModelFlag(selectedCustomModel.id, "visible")}
                          >
                            {isBgObjectVisible(selectedCustomModel) ? (
                              <Eye size={14} aria-hidden />
                            ) : (
                              <EyeOff size={14} aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={isBgObjectLocked(selectedCustomModel) ? "잠금 해제" : "잠금"}
                            title={isBgObjectLocked(selectedCustomModel) ? "잠금 해제" : "잠금"}
                            className={cx(ICON_BUTTON, isBgObjectLocked(selectedCustomModel) && "border-accent/40 bg-accent-soft text-accent")}
                            onClick={() => toggleCustomModelFlag(selectedCustomModel.id, "locked")}
                          >
                            {isBgObjectLocked(selectedCustomModel) ? (
                              <Lock size={14} aria-hidden />
                            ) : (
                              <Unlock size={14} aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label="바닥에 접지"
                            title="바닥에 접지"
                            disabled={selectedIsLocked}
                            className={cx(ICON_BUTTON, "disabled:opacity-40")}
                            onClick={groundSelectedEntity}
                          >
                            <MoveDown size={14} aria-hidden />
                          </button>
                          <button
                            type="button"
                            aria-label="초점 맞춤"
                            title="초점 맞춤"
                            className={ICON_BUTTON}
                            onClick={focusSelectedEntity}
                          >
                            <ScanLine size={14} aria-hidden />
                          </button>
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

                      {selectedIsLocked ? (
                        <p className="rounded-lg border border-line bg-raised/60 px-2.5 py-2 text-[0.68rem] leading-relaxed text-fg-3">
                          잠긴 객체입니다. 위치·회전·크기를 바꾸려면 잠금을 해제하세요.
                        </p>
                      ) : null}

                                            <div className="flex flex-col gap-1.5">
                        <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">부모 계층 (Parent)
                        <select
                          className="h-9 w-full rounded border border-line bg-card px-2 text-xs text-fg focus:border-accent"
                          disabled={selectedIsLocked}
                          value={selectedCustomModel.parentId || ""}
                          onChange={(e) => {
                            const newParentId = e.target.value || null;
                            reparentSceneEntity(selectedCustomModel.id, newParentId);
                          }}
                        >
                          <option value="">(최상위 / 없음)</option>
                          {layerListItems.filter((item) =>
                            canSetStudioBg3dParent(layerListItems, selectedCustomModel.id, item.id)
                          ).map(item => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        </label>
                      </div>

                      <Vec3Field
                        label="위치"
                        values={selectedCustomModel.position}
                        step={snapSettings.enabled ? snapSettings.translateStep : 0.1}
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
                        step={snapSettings.enabled ? snapSettings.rotateStepDegrees : 1}
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

                      <div className="space-y-2 rounded-xl border border-line bg-card/55 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedCustomModel.materialOverride)}
                              onChange={(event) => updateCustomModelMaterial(
                                selectedCustomModel.id,
                                event.target.checked ? { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE } : null,
                              )}
                            />
                            인스턴스 재질 편집
                          </label>
                          {selectedCustomModel.materialOverride ? (
                            <button
                              type="button"
                              className="text-[0.68rem] font-semibold text-accent hover:underline"
                              onClick={() => updateCustomModelMaterial(selectedCustomModel.id, null)}
                            >
                              원본 복원
                            </button>
                          ) : null}
                        </div>

                        {selectedCustomModel.materialOverride ? (
                          <div className="space-y-2 border-t border-line/70 pt-2">
                            <label className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-[0.68rem] text-fg-3">
                              색상 방식
                              <select
                                className="h-8 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                                value={selectedCustomModel.materialOverride.colorMode}
                                onChange={(event) => updateCustomModelMaterial(
                                  selectedCustomModel.id,
                                  (current) => ({
                                    ...current,
                                    colorMode: event.target.value as StudioBg3dMaterialOverride["colorMode"],
                                  }),
                                )}
                              >
                                <option value="original">원본</option>
                                <option value="multiply">곱하기</option>
                                <option value="replace">교체</option>
                              </select>
                            </label>
                            <label className="grid grid-cols-[4.5rem_2.75rem_1fr] items-center gap-2 text-[0.68rem] text-fg-3">
                              재질 색
                              <input
                                type="color"
                                className="h-8 w-11 cursor-pointer rounded border border-line bg-panel"
                                disabled={selectedCustomModel.materialOverride.colorMode === "original"}
                                value={selectedCustomModel.materialOverride.color}
                                onChange={(event) => updateCustomModelMaterial(
                                  selectedCustomModel.id,
                                  (current) => ({ ...current, color: event.target.value }),
                                )}
                              />
                              <input
                                aria-label="재질 색상 혼합 강도"
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                disabled={selectedCustomModel.materialOverride.colorMode === "original"}
                                value={selectedCustomModel.materialOverride.colorStrength}
                                onChange={(event) => updateCustomModelMaterial(
                                  selectedCustomModel.id,
                                  (current) => ({ ...current, colorStrength: Number(event.target.value) }),
                                )}
                              />
                            </label>
                            <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-[0.68rem] text-fg-3">
                              불투명도
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={selectedCustomModel.materialOverride.opacityMultiplier}
                                onChange={(event) => updateCustomModelMaterial(
                                  selectedCustomModel.id,
                                  (current) => ({ ...current, opacityMultiplier: Number(event.target.value) }),
                                )}
                              />
                              <span className="text-right tabular-nums text-fg-2">
                                {Math.round(selectedCustomModel.materialOverride.opacityMultiplier * 100)}%
                              </span>
                            </label>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[0.68rem] text-fg-2">
                              <label className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={selectedCustomModel.materialOverride.wireframe}
                                  onChange={(event) => updateCustomModelMaterial(
                                    selectedCustomModel.id,
                                    (current) => ({ ...current, wireframe: event.target.checked }),
                                  )}
                                />
                                와이어프레임
                              </label>
                              <label className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  checked={selectedCustomModel.materialOverride.doubleSided}
                                  onChange={(event) => updateCustomModelMaterial(
                                    selectedCustomModel.id,
                                    (current) => ({ ...current, doubleSided: event.target.checked }),
                                  )}
                                />
                                양면 렌더링
                              </label>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[0.68rem] leading-relaxed text-fg-3">
                            원본 재질과 텍스처는 보존한 채 이 배치에만 색·투명도·와이어 설정을 적용합니다.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 rounded-xl border border-line bg-card/55 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-fg-2 sm:min-h-8 pointer-coarse:min-h-11">
                            <input
                              type="checkbox"
                              disabled={selectedModelJoints.length === 0}
                              checked={Boolean(selectedCustomModel.constraints)}
                              onChange={(event) => updateCustomModelConstraints(
                                selectedCustomModel.id,
                                event.target.checked ? { ...DEFAULT_STUDIO_BG3D_CONSTRAINT_LAYER } : null,
                              )}
                            />
                            리그 제약
                          </label>
                          <span className="text-[0.68rem] tabular-nums text-fg-3">
                            {selectedAimConstraints.length} 에임 · {selectedTwoBoneIkConstraints.length} IK
                          </span>
                        </div>

                        {selectedCustomModel.constraints && selectedModelJoints.length > 0 ? (
                          <div className="space-y-2 border-t border-line/70 pt-2">
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <select
                                aria-label="에임 조인트"
                                className="h-11 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg sm:h-8 pointer-coarse:h-11"
                                value={selectedPoseJointKey}
                                onChange={(event) => setPoseJointSelection(event.target.value)}
                              >
                                {selectedModelJoints.map((joint) => (
                                  <option key={joint.key} value={joint.key}>
                                    {joint.name} · S{joint.skinIndex + 1}/J{joint.jointIndex + 1}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="h-11 rounded-lg border border-line bg-panel px-2 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50 sm:h-8 pointer-coarse:h-11"
                                disabled={!selectedAimConstraint}
                                onClick={() => updateCustomModelConstraints(
                                  selectedCustomModel.id,
                                  (current) => ({
                                    ...current,
                                    aims: current.aims.filter((aim) => aim.jointKey !== selectedPoseJointKey),
                                  }),
                                )}
                              >
                                에임 해제
                              </button>
                            </div>
                            <Vec3Field
                              label="모델 로컬 타깃"
                              values={[...(selectedAimConstraint?.target ?? [0, 1, 1])]}
                              step={0.1}
                              precision={2}
                              disabled={selectedAimSuppressedByIk}
                              touchFriendly
                              onCommit={(axis, value) => {
                                const target: [number, number, number] = [
                                  ...(selectedAimConstraint?.target ?? [0, 1, 1]),
                                ];
                                target[axis] = Math.max(-10_000, Math.min(10_000, value));
                                updateCustomModelConstraints(selectedCustomModel.id, (current) => ({
                                  ...current,
                                  aims: [
                                    ...current.aims.filter((aim) => aim.jointKey !== selectedPoseJointKey),
                                    {
                                      jointKey: selectedPoseJointKey,
                                      target,
                                      axis: selectedAimConstraint?.axis ?? "+z",
                                      weight: selectedAimConstraint?.weight ?? 1,
                                    },
                                  ],
                                }));
                              }}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1 text-[0.68rem] text-fg-3">
                                향할 로컬 축
                                <select
                                  className="h-11 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg sm:h-8 pointer-coarse:h-11"
                                  disabled={selectedAimSuppressedByIk}
                                  value={selectedAimConstraint?.axis ?? "+z"}
                                  onChange={(event) => updateCustomModelConstraints(
                                    selectedCustomModel.id,
                                    (current) => ({
                                      ...current,
                                      aims: [
                                        ...current.aims.filter((aim) => aim.jointKey !== selectedPoseJointKey),
                                        {
                                          jointKey: selectedPoseJointKey,
                                          target: [...(selectedAimConstraint?.target ?? [0, 1, 1])],
                                          axis: event.target.value as "+x" | "-x" | "+y" | "-y" | "+z" | "-z",
                                          weight: selectedAimConstraint?.weight ?? 1,
                                        },
                                      ],
                                    }),
                                  )}
                                >
                                  <option value="+x">+X</option><option value="-x">−X</option>
                                  <option value="+y">+Y</option><option value="-y">−Y</option>
                                  <option value="+z">+Z</option><option value="-z">−Z</option>
                                </select>
                              </label>
                              <label className="space-y-1 text-[0.68rem] text-fg-3">
                                강도 · {Math.round((selectedAimConstraint?.weight ?? 1) * 100)}%
                                <input
                                  className="block h-11 w-full sm:h-8 pointer-coarse:h-11"
                                  type="range"
                                  disabled={selectedAimSuppressedByIk}
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={selectedAimConstraint?.weight ?? 1}
                                  onChange={(event) => updateCustomModelConstraints(
                                    selectedCustomModel.id,
                                    (current) => ({
                                      ...current,
                                      aims: [
                                        ...current.aims.filter((aim) => aim.jointKey !== selectedPoseJointKey),
                                        {
                                          jointKey: selectedPoseJointKey,
                                          target: [...(selectedAimConstraint?.target ?? [0, 1, 1])],
                                          axis: selectedAimConstraint?.axis ?? "+z",
                                          weight: Number(event.target.value),
                                        },
                                      ],
                                    }),
                                  )}
                                />
                              </label>
                            </div>
                            {selectedAimSuppressedByIk ? (
                              <p className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-[0.64rem] leading-relaxed text-warning">
                                이 조인트의 에임은 손·발 타깃을 보존하기 위해 활성 IK 뒤에서 자동 중지됩니다. 에임을 사용하려면 겹치는 IK를 먼저 해제해 주세요.
                              </p>
                            ) : null}
                            <div className="space-y-2 border-t border-line/70 pt-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[0.68rem] font-semibold text-fg-2">
                                  2본 IK · 손/발 위치
                                </span>
                                <span className="text-[0.64rem] text-fg-3">
                                  팔꿈치·무릎 자동 계산
                                </span>
                              </div>
                              {selectedIkEndCandidates.length > 0 ? (
                                <>
                                  <div className="grid grid-cols-[1fr_auto] gap-2">
                                    <select
                                      aria-label="IK 끝 조인트"
                                      className="h-11 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg sm:h-8 pointer-coarse:h-11"
                                      value={selectedIkEndJointKey}
                                      onChange={(event) => setIkEndJointSelection({
                                        modelId: selectedCustomModel.id,
                                        jointKey: event.target.value,
                                      })}
                                    >
                                      {selectedIkEndCandidates.map((joint) => (
                                        <option key={joint.key} value={joint.key}>
                                          {joint.name} · S{joint.skinIndex + 1}/J{joint.jointIndex + 1}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      className="h-11 rounded-lg border border-line bg-panel px-2 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50 sm:h-8 pointer-coarse:h-11"
                                      disabled={
                                        !selectedIkUpperJoint || !selectedIkMiddleJoint || !selectedIkEndJoint ||
                                        (!selectedTwoBoneIkConstraint && (
                                          selectedIkLimitReached || selectedIkHasOverlap ||
                                          !selectedIkTransformSupported
                                        ))
                                      }
                                      onClick={() => updateCustomModelConstraints(
                                        selectedCustomModel.id,
                                        (current) => {
                                          const remaining = current.twoBoneIks.filter((ik) => (
                                            selectedJointByKey.get(ik.endJointKey)?.canonicalKey ??
                                            ik.endJointKey
                                          ) !== selectedIkEndJoint?.canonicalKey);
                                          if (selectedTwoBoneIkConstraint) {
                                            return { ...current, twoBoneIks: remaining };
                                          }
                                          if (!selectedIkUpperJoint || !selectedIkMiddleJoint || !selectedIkEndJoint) {
                                            return current;
                                          }
                                          const chainKeys = new Set([
                                            selectedIkUpperJoint.canonicalKey,
                                            selectedIkMiddleJoint.canonicalKey,
                                            selectedIkEndJoint.canonicalKey,
                                          ]);
                                          if (
                                            current.twoBoneIks.length >= STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS ||
                                            current.twoBoneIks.some((ik) => [
                                              ik.upperJointKey,
                                              ik.middleJointKey,
                                              ik.endJointKey,
                                            ].some((key) => chainKeys.has(
                                              selectedJointByKey.get(key)?.canonicalKey ?? key,
                                            )))
                                          ) return current;
                                          return {
                                            ...current,
                                            twoBoneIks: [...current.twoBoneIks, {
                                              upperJointKey: selectedIkUpperJoint.key,
                                              middleJointKey: selectedIkMiddleJoint.key,
                                              endJointKey: selectedIkEndJoint.key,
                                              target: [...selectedIkDefaultTarget],
                                              poleTarget: [...selectedIkDefaultPole],
                                              weight: 1,
                                            }],
                                          };
                                        },
                                      )}
                                    >
                                      {selectedTwoBoneIkConstraint ? "IK 해제" : "IK 적용"}
                                    </button>
                                  </div>
                                  <p className="text-[0.64rem] leading-relaxed text-fg-3">
                                    {selectedIkUpperJoint?.name ?? "상위"} →{
                                      selectedIkMiddleJoint?.name ?? "중간"
                                    } → {selectedIkEndJoint?.name ?? "끝"}
                                  </p>
                                  {!selectedIkTransformSupported ? (
                                    <p className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-[0.64rem] leading-relaxed text-warning">
                                      현재 부모·모델·관절의 월드 변환에 비균일 크기, 반전 또는 전단이 있어 IK가 일시 중지됩니다. 계층 전체를 균일 크기로 맞춰 주세요.
                                    </p>
                                  ) : selectedIkHasOverlap ? (
                                    <p className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-[0.64rem] leading-relaxed text-warning">
                                      다른 IK와 조인트를 공유하는 체인은 동시에 적용할 수 없습니다.
                                    </p>
                                  ) : selectedIkLimitReached && !selectedTwoBoneIkConstraint ? (
                                    <p className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-[0.64rem] leading-relaxed text-warning">
                                      모델당 IK는 최대 {STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS}개까지 저장할 수 있습니다.
                                    </p>
                                  ) : null}
                                  <Vec3Field
                                    label="끝 위치 타깃"
                                    values={[
                                      ...(selectedTwoBoneIkConstraint?.target ?? selectedIkDefaultTarget),
                                    ]}
                                    step={0.05}
                                    precision={2}
                                    disabled={!selectedTwoBoneIkConstraint}
                                    touchFriendly
                                    onCommit={(axis, value) => {
                                      if (!selectedTwoBoneIkConstraint) return;
                                      updateCustomModelConstraints(selectedCustomModel.id, (current) => ({
                                        ...current,
                                        twoBoneIks: current.twoBoneIks.map((ik) => {
                                          if (ik.endJointKey !== selectedIkEndJointKey) return ik;
                                          const target: [number, number, number] = [...ik.target];
                                          target[axis] = Math.max(-10_000, Math.min(10_000, value));
                                          return { ...ik, target };
                                        }),
                                      }));
                                    }}
                                  />
                                  <Vec3Field
                                    label="굽힘 폴 타깃"
                                    values={[
                                      ...(selectedTwoBoneIkConstraint?.poleTarget ?? selectedIkDefaultPole),
                                    ]}
                                    step={0.05}
                                    precision={2}
                                    disabled={!selectedTwoBoneIkConstraint}
                                    touchFriendly
                                    onCommit={(axis, value) => {
                                      if (!selectedTwoBoneIkConstraint) return;
                                      updateCustomModelConstraints(selectedCustomModel.id, (current) => ({
                                        ...current,
                                        twoBoneIks: current.twoBoneIks.map((ik) => {
                                          if (ik.endJointKey !== selectedIkEndJointKey) return ik;
                                          const poleTarget: [number, number, number] = [...ik.poleTarget];
                                          poleTarget[axis] = Math.max(-10_000, Math.min(10_000, value));
                                          return { ...ik, poleTarget };
                                        }),
                                      }));
                                    }}
                                  />
                                  <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-[0.68rem] text-fg-3">
                                    IK 강도
                                    <input
                                      className="h-11 w-full sm:h-8 pointer-coarse:h-11"
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.01"
                                      disabled={!selectedTwoBoneIkConstraint}
                                      value={selectedTwoBoneIkConstraint?.weight ?? 1}
                                      onChange={(event) => {
                                        if (!selectedTwoBoneIkConstraint) return;
                                        updateCustomModelConstraints(selectedCustomModel.id, (current) => ({
                                          ...current,
                                          twoBoneIks: current.twoBoneIks.map((ik) =>
                                            ik.endJointKey === selectedIkEndJointKey
                                              ? { ...ik, weight: Number(event.target.value) }
                                              : ik
                                          ),
                                        }));
                                      }}
                                    />
                                    <span className="text-right tabular-nums text-fg-2">
                                      {Math.round((selectedTwoBoneIkConstraint?.weight ?? 1) * 100)}%
                                    </span>
                                  </label>
                                </>
                              ) : (
                                <p className="text-[0.66rem] leading-relaxed text-fg-3">
                                  같은 스킨에서 부모 → 중간 → 끝으로 이어지는 3개 조인트 체인이 없습니다.
                                </p>
                              )}
                            </div>
                            <label className="flex min-h-11 items-center gap-1.5 text-[0.68rem] text-fg-2 sm:min-h-8 pointer-coarse:min-h-11">
                              <input
                                type="checkbox"
                                checked={selectedCustomModel.constraints.enabled}
                                onChange={(event) => updateCustomModelConstraints(
                                  selectedCustomModel.id,
                                  (current) => ({ ...current, enabled: event.target.checked }),
                                )}
                              />
                              애니메이션·포즈 뒤에 제약 적용
                            </label>
                            <button
                              type="button"
                              aria-describedby={
                                selectedRigBakeDisabledReason
                                  ? "bg3d-rig-bake-disabled-reason"
                                  : "bg3d-rig-bake-description"
                              }
                              className="min-h-11 w-full rounded-lg border border-accent/35 bg-accent-soft px-3 text-[0.7rem] font-semibold text-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 pointer-coarse:min-h-11"
                              disabled={selectedRigBakeDisabledReason !== null}
                              onClick={() => bakeCustomModelRigConstraints(selectedCustomModel.id)}
                            >
                              현재 IK·에임을 포즈로 굽기
                            </button>
                            {selectedRigBakeDisabledReason ? (
                              <p
                                id="bg3d-rig-bake-disabled-reason"
                                className="rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-[0.64rem] leading-relaxed text-warning"
                              >
                                {selectedRigBakeDisabledReason}
                              </p>
                            ) : null}
                            <p id="bg3d-rig-bake-description" className="text-[0.64rem] leading-relaxed text-fg-3">
                              지금 보이는 한 프레임을 weight 1 포즈로 고정하고 모든 리그 제약을 제거합니다.
                              애니메이션은 비본 트랙을 보존한 채 현재 시각에서 일시정지되며, 3D 실행 취소로
                              원래 포즈와 제약을 되돌릴 수 있습니다.
                            </p>
                            <p className="text-[0.66rem] leading-relaxed text-fg-3">
                              에임은 눈·머리·무기 방향을, 2본 IK는 손·발 위치와 굽힘 평면을 비파괴
                              혼합합니다. 원본 스켈레톤과 애니메이션 키는 수정하지 않습니다.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[0.68rem] leading-relaxed text-fg-3">
                            모델에 스킨 조인트가 있으면 시선·머리 에임과 손·발 2본 IK를 추가할 수 있습니다.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 rounded-xl border border-line bg-card/55 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                            <input
                              type="checkbox"
                              disabled={selectedModelAnimations.length === 0}
                              checked={Boolean(selectedCustomModel.animation)}
                              onChange={(event) => updateCustomModelAnimation(
                                selectedCustomModel.id,
                                event.target.checked ? { ...DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK } : null,
                              )}
                            />
                            모델 애니메이션
                          </label>
                          <span className="text-[0.68rem] tabular-nums text-fg-3">
                            {selectedModelAnimations.length}개 클립
                          </span>
                        </div>

                        {selectedCustomModel.animation && selectedAnimationClip ? (
                          <div className="space-y-2 border-t border-line/70 pt-2">
                            <label className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-[0.68rem] text-fg-3">
                              클립
                              <select
                                className="h-8 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                                value={Math.min(
                                  selectedCustomModel.animation.clipIndex,
                                  Math.max(0, selectedModelAnimations.length - 1),
                                )}
                                onChange={(event) => updateCustomModelAnimation(
                                  selectedCustomModel.id,
                                  (current) => ({
                                    ...current,
                                    clipIndex: Number(event.target.value),
                                    timeSeconds: 0,
                                  }),
                                )}
                              >
                                {selectedModelAnimations.map((clip, index) => (
                                  <option key={`${index}-${clip.uuid}`} value={index}>
                                    {(clip.name || `클립 ${index + 1}`).slice(0, 80)} · {clip.duration.toFixed(2)}s
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
                              <button
                                type="button"
                                className="h-8 rounded-lg border border-line bg-panel px-2 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised"
                                onClick={() => updateCustomModelAnimation(
                                  selectedCustomModel.id,
                                  (current) => ({ ...current, playing: !current.playing }),
                                )}
                              >
                                {selectedCustomModel.animation.playing ? "일시정지" : "재생"}
                              </button>
                              <input
                                aria-label="애니메이션 시간"
                                type="range"
                                min="0"
                                max={selectedAnimationDuration}
                                step={Math.max(0.001, selectedAnimationDuration / 1_000)}
                                value={Math.min(selectedAnimationDuration, selectedCustomModel.animation.timeSeconds)}
                                onChange={(event) => updateCustomModelAnimation(
                                  selectedCustomModel.id,
                                  (current) => ({ ...current, timeSeconds: Number(event.target.value) }),
                                )}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1 text-[0.68rem] text-fg-3">
                                반복
                                <select
                                  className="h-8 w-full rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                                  value={selectedCustomModel.animation.loop}
                                  onChange={(event) => updateCustomModelAnimation(
                                    selectedCustomModel.id,
                                    (current) => ({
                                      ...current,
                                      loop: event.target.value as StudioBg3dAnimationPlayback["loop"],
                                    }),
                                  )}
                                >
                                  <option value="once">한 번</option>
                                  <option value="repeat">반복</option>
                                  <option value="ping-pong">왕복</option>
                                </select>
                              </label>
                              <label className="space-y-1 text-[0.68rem] text-fg-3">
                                속도 · {selectedCustomModel.animation.timeScale.toFixed(1)}×
                                <input
                                  className="block h-8 w-full"
                                  type="range"
                                  min="-2"
                                  max="2"
                                  step="0.1"
                                  value={selectedCustomModel.animation.timeScale}
                                  onChange={(event) => updateCustomModelAnimation(
                                    selectedCustomModel.id,
                                    (current) => ({ ...current, timeScale: Number(event.target.value) }),
                                  )}
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[0.68rem] leading-relaxed text-fg-3">
                            {selectedModelAnimations.length > 0
                              ? "활성화하면 클립 선택·재생·스크럽·반복·역재생 속도를 이 배치에 저장합니다."
                              : "이 모델에는 재생 가능한 glTF 애니메이션 클립이 없습니다."}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 rounded-xl border border-line bg-card/55 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                            <input
                              type="checkbox"
                              disabled={selectedModelJoints.length === 0}
                              checked={Boolean(selectedCustomModel.pose)}
                              onChange={(event) => updateCustomModelPose(
                                selectedCustomModel.id,
                                event.target.checked ? { ...DEFAULT_STUDIO_BG3D_POSE_LAYER } : null,
                              )}
                            />
                            비파괴 포즈 레이어
                          </label>
                          <span className="text-[0.68rem] tabular-nums text-fg-3">
                            {selectedModelJoints.length}개 조인트
                          </span>
                        </div>

                        {selectedCustomModel.pose && selectedModelJoints.length > 0 ? (
                          <div className="space-y-2 border-t border-line/70 pt-2">
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <select
                                aria-label="포즈 조인트"
                                className="h-8 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                                value={selectedPoseJointKey}
                                onChange={(event) => setPoseJointSelection(event.target.value)}
                              >
                                {selectedModelJoints.map((joint) => (
                                  <option key={joint.key} value={joint.key}>
                                    {joint.name} · S{joint.skinIndex + 1}/J{joint.jointIndex + 1}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="h-8 rounded-lg border border-line bg-panel px-2 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50"
                                disabled={!selectedPoseJoint}
                                onClick={() => updateCustomModelPose(
                                  selectedCustomModel.id,
                                  (current) => ({
                                    ...current,
                                    joints: current.joints.filter((joint) => joint.jointKey !== selectedPoseJointKey),
                                  }),
                                )}
                              >
                                조인트 초기화
                              </button>
                            </div>
                            <Vec3Field
                              label="회전 오프셋"
                              values={selectedPoseEulerDegrees}
                              step={1}
                              precision={1}
                              suffix="°"
                              onCommit={(axis, value) => {
                                const nextEuler: [number, number, number] = [...selectedPoseEulerDegrees];
                                nextEuler[axis] = Math.max(-180, Math.min(180, value));
                                const rotationOffset = eulerDegreesToQuaternion(nextEuler);
                                updateCustomModelPose(selectedCustomModel.id, (current) => ({
                                  ...current,
                                  joints: [
                                    ...current.joints.filter((joint) => joint.jointKey !== selectedPoseJointKey),
                                    { jointKey: selectedPoseJointKey, rotationOffset },
                                  ],
                                }));
                              }}
                            />
                            <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-[0.68rem] text-fg-3">
                              강도
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={selectedCustomModel.pose.weight}
                                onChange={(event) => updateCustomModelPose(
                                  selectedCustomModel.id,
                                  (current) => ({ ...current, weight: Number(event.target.value) }),
                                )}
                              />
                              <span className="text-right tabular-nums text-fg-2">
                                {Math.round(selectedCustomModel.pose.weight * 100)}%
                              </span>
                            </label>
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-1.5 text-[0.68rem] text-fg-2">
                                <input
                                  type="checkbox"
                                  checked={selectedCustomModel.pose.enabled}
                                  onChange={(event) => updateCustomModelPose(
                                    selectedCustomModel.id,
                                    (current) => ({ ...current, enabled: event.target.checked }),
                                  )}
                                />
                                레이어 적용
                              </label>
                              <button
                                type="button"
                                className="text-[0.68rem] font-semibold text-accent hover:underline"
                                onClick={() => updateCustomModelPose(
                                  selectedCustomModel.id,
                                  { ...DEFAULT_STUDIO_BG3D_POSE_LAYER },
                                )}
                              >
                                전체 포즈 초기화
                              </button>
                            </div>
                            <p className="text-[0.66rem] leading-relaxed text-fg-3">
                              애니메이션 또는 원본 휴지 자세를 먼저 계산한 뒤 로컬 회전 오프셋을 더합니다.
                              원본 리깅과 클립은 변경하지 않습니다.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[0.68rem] leading-relaxed text-fg-3">
                            {selectedModelJoints.length > 0
                              ? "활성화하면 본별 회전 오프셋과 혼합 강도를 이 배치에 저장합니다."
                              : "이 모델에는 편집 가능한 스킨 조인트가 없습니다."}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 rounded-xl border border-line bg-card/55 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-fg-2">
                            <input
                              type="checkbox"
                              disabled={selectedModelMorphTargets.length === 0}
                              checked={Boolean(selectedCustomModel.morph)}
                              onChange={(event) => updateCustomModelMorph(
                                selectedCustomModel.id,
                                event.target.checked ? { ...DEFAULT_STUDIO_BG3D_MORPH_LAYER } : null,
                              )}
                            />
                            표정·모프 레이어
                          </label>
                          <span className="text-[0.68rem] tabular-nums text-fg-3">
                            {selectedModelMorphTargets.length}개 타깃
                          </span>
                        </div>

                        {selectedCustomModel.morph && selectedModelMorphTargets.length > 0 ? (
                          <div className="space-y-2 border-t border-line/70 pt-2">
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <select
                                aria-label="모프 타깃"
                                className="h-8 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                                value={selectedMorphTargetKey}
                                onChange={(event) => setMorphTargetSelection(event.target.value)}
                              >
                                {selectedModelMorphTargets.map((target) => (
                                  <option key={target.key} value={target.key}>
                                    {target.name} · M{target.meshIndex + 1}/T{target.targetIndex + 1}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="h-8 rounded-lg border border-line bg-panel px-2 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50"
                                disabled={!selectedMorphOverride}
                                onClick={() => updateCustomModelMorph(
                                  selectedCustomModel.id,
                                  (current) => ({
                                    ...current,
                                    targets: current.targets.filter((target) => target.targetKey !== selectedMorphTargetKey),
                                  }),
                                )}
                              >
                                타깃 초기화
                              </button>
                            </div>
                            <label className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-[0.68rem] text-fg-3">
                              오프셋
                              <input
                                type="range"
                                min="-1"
                                max="1"
                                step="0.01"
                                value={selectedMorphOverride?.weightOffset ?? 0}
                                onChange={(event) => updateCustomModelMorph(
                                  selectedCustomModel.id,
                                  (current) => ({
                                    ...current,
                                    targets: [
                                      ...current.targets.filter((target) => target.targetKey !== selectedMorphTargetKey),
                                      {
                                        targetKey: selectedMorphTargetKey,
                                        weightOffset: Number(event.target.value),
                                      },
                                    ],
                                  }),
                                )}
                              />
                              <span className="text-right tabular-nums text-fg-2">
                                {(selectedMorphOverride?.weightOffset ?? 0).toFixed(2)}
                              </span>
                            </label>
                            <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-[0.68rem] text-fg-3">
                              전체 강도
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={selectedCustomModel.morph.weight}
                                onChange={(event) => updateCustomModelMorph(
                                  selectedCustomModel.id,
                                  (current) => ({ ...current, weight: Number(event.target.value) }),
                                )}
                              />
                              <span className="text-right tabular-nums text-fg-2">
                                {Math.round(selectedCustomModel.morph.weight * 100)}%
                              </span>
                            </label>
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-1.5 text-[0.68rem] text-fg-2">
                                <input
                                  type="checkbox"
                                  checked={selectedCustomModel.morph.enabled}
                                  onChange={(event) => updateCustomModelMorph(
                                    selectedCustomModel.id,
                                    (current) => ({ ...current, enabled: event.target.checked }),
                                  )}
                                />
                                레이어 적용
                              </label>
                              <button
                                type="button"
                                className="text-[0.68rem] font-semibold text-accent hover:underline"
                                onClick={() => updateCustomModelMorph(
                                  selectedCustomModel.id,
                                  { ...DEFAULT_STUDIO_BG3D_MORPH_LAYER },
                                )}
                              >
                                전체 모프 초기화
                              </button>
                            </div>
                            <p className="text-[0.66rem] leading-relaxed text-fg-3">
                              애니메이션이 만든 모프 값에 오프셋을 더하고 0–1 범위로 제한합니다.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[0.68rem] leading-relaxed text-fg-3">
                            {selectedModelMorphTargets.length > 0
                              ? "활성화하면 표정·립싱크·변형 타깃을 배치별로 조절할 수 있습니다."
                              : "이 모델에는 편집 가능한 모프 타깃이 없습니다."}
                          </p>
                        )}
                      </div>
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
                        className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg outline-none focus:border-accent sm:min-h-9"
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

              <section hidden={hideOnTab("view")}>
                <div
                  role="tablist"
                  aria-label="보기 도구"
                  className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-line bg-card/70 p-1"
                >
                  {([
                    { id: "camera" as const, label: "카메라 · 환경" },
                    { id: "physics" as const, label: "물리 배치" },
                  ]).map((section) => {
                    const active = viewEditorSection === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-controls={`bg3d-view-section-${section.id}`}
                        tabIndex={active ? 0 : -1}
                        onClick={() => setViewEditorSection(section.id)}
                        className={cx(
                          "min-h-11 rounded-lg px-2 text-[0.68rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:min-h-9",
                          active
                            ? "bg-accent text-on-accent shadow-sm"
                            : "text-fg-3 hover:bg-raised hover:text-fg",
                        )}
                      >
                        {section.label}
                      </button>
                    );
                  })}
                </div>

                <div
                  id="bg3d-view-section-physics"
                  role="tabpanel"
                  hidden={viewEditorSection !== "physics"}
                >
                  <StudioBg3dPhysicsPanel
                    startButtonRef={physicsStartButtonRef}
                    selectedCount={selectedIds.size}
                    durationSeconds={physicsDurationSeconds}
                    gravityPreset={physicsGravityPreset}
                    groundEnabled={physicsGroundEnabled}
                    phase={physicsPhase}
                    progress={physicsProgress}
                    unavailableReason={physicsSelectionUnavailableReason}
                    errorMessage={physicsError}
                    onDurationChange={setPhysicsDurationSeconds}
                    onGravityPresetChange={setPhysicsGravityPreset}
                    onGroundEnabledChange={setPhysicsGroundEnabled}
                    onStart={() => {
                      shouldTransferPhysicsFocusRef.current = true;
                      void startPhysicsPreview();
                    }}
                  />
                </div>

                <div
                  id="bg3d-view-section-camera"
                  role="tabpanel"
                  hidden={viewEditorSection !== "camera"}
                >
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
                    disabled={isCapturing}
                    onClick={() => viewportApiRef.current?.zoomBy(0.82)}
                  >
                    <ZoomIn size={14} aria-hidden />
                    확대
                  </button>
                  <button
                    type="button"
                    className={cx(CONTROL_BUTTON, "flex-1 border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
                    disabled={isCapturing}
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
                      disabled={isCapturing}
                      onChange={(e) => setLineArtPreview(e.target.checked)}
                      className="mt-0.5 size-4 accent-accent"
                    />
                    <span className="block text-xs font-bold text-fg">
                      선화로 보기
                      <span className="mt-0.5 block text-[0.68rem] font-normal leading-relaxed text-fg-3">
                        화면용 선화 미리보기입니다. 실제 추가 시에는 LT 탭 설정으로 톤·재질선·주선을
                        각각 계산해 별도 레이어로 만듭니다.
                      </span>
                    </span>
                  </label>
                  <label className="mt-3 flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={transparentInsert}
                      disabled={isCapturing}
                      onChange={(e) => updateBackgroundTransparency(e.target.checked)}
                      className="mt-0.5 size-4 accent-accent"
                    />
                    <span className="block text-xs font-bold text-fg">
                      오브젝트 바깥을 투명하게 추출
                      <span className="mt-0.5 block text-[0.68rem] font-normal leading-relaxed text-fg-3">
                        하늘색을 LT 입력에서 빼고 건물·나무·도형의 알파 외곽을 또렷하게 잡습니다. 분리된
                        선·톤을 다른 배경 위에 겹칠 때 적합해요.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                      <Globe size={15} className="text-accent" aria-hidden />
                      360° 환경 배경
                    </h3>
                    <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.62rem] font-semibold text-fg-3">
                      절차적 생성
                    </span>
                  </div>
                  <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
                    외부 이미지 없이 생성되어 장면과 함께 안전하게 재현됩니다. 투명 추출에서는 빠지고,
                    불투명 LT 톤에는 현재 보이는 환경이 포함됩니다.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {BG_SKY_PRESETS.map((sky) => (
                      <button
                        key={sky.id}
                        type="button"
                        aria-pressed={skyPresetId === sky.id}
                        disabled={isCapturing}
                        title={sky.description}
                        className={cx(
                          CONTROL_BUTTON,
                          "justify-start gap-2 border-line bg-card text-left text-fg-2 hover:bg-raised hover:text-fg",
                          skyPresetId === sky.id && "border-accent/60 bg-accent-soft text-accent"
                        )}
                        onClick={() => {
                          updateBackgroundSettings({
                            mode: transparentInsert ? "transparent" : "sky-preset",
                            color: sky.clearColor,
                            skyPresetId: sky.id,
                          });
                        }}
                      >
                        <span
                          className="inline-block size-4 shrink-0 rounded-full border border-line/50 shadow-inner"
                          style={{ backgroundColor: sky.clearColor }}
                          aria-hidden
                        />
                        <span className="truncate">{sky.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[0.66rem] leading-relaxed text-fg-3" aria-live="polite">
                    {selectedSky.description}
                  </p>

                  {selectedSky.kind === "procedural-panorama" ? (
                    <div className="mt-3 rounded-xl border border-line bg-card/70 px-3 py-2">
                      <LtRangeControl
                        id="bg3d-panorama-rotation"
                        label="수평 회전"
                        min={-180}
                        max={180}
                        step={1}
                        value={panoramaRotation}
                        valueText={`${panoramaRotation}°`}
                        disabled={isCapturing}
                        onChange={(value) => updateBackgroundSettings({
                          panoramaRotation: normalizePanoramaRotationDegrees(value),
                        })}
                      />
                      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <PanoramaRotationNumberField
                          disabled={isCapturing}
                          value={panoramaRotation}
                          onCommit={(value) => updateBackgroundSettings({ panoramaRotation: value })}
                        />
                        <button
                          type="button"
                          className={cx(
                            CONTROL_BUTTON,
                            "border-line bg-panel px-3 text-fg-2 hover:bg-raised hover:text-fg",
                          )}
                          disabled={isCapturing || panoramaRotation === 0}
                          onClick={() => updateBackgroundSettings({ panoramaRotation: 0 })}
                        >
                          <RotateCcw size={14} aria-hidden />
                          정면 초기화
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 border-t border-line pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                        <CircleDashed size={15} className="text-accent" aria-hidden />
                        공간 안개
                      </h3>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                        멀어지는 건물과 소품을 대기색에 자연스럽게 섞어 웹툰 배경의 깊이감을 만듭니다.
                      </p>
                    </div>
                    <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 sm:min-h-9">
                      <input
                        type="checkbox"
                        aria-label="3D 공간 안개 사용"
                        checked={sceneBaseDocument.background.fogEnabled ?? false}
                        onChange={(event) => updateBackgroundSettings({ fogEnabled: event.target.checked })}
                        className="size-4 accent-accent"
                      />
                      {sceneBaseDocument.background.fogEnabled ? "켜짐" : "꺼짐"}
                    </label>
                  </div>

                  <div
                    className={cx(
                      "mt-3 space-y-3 transition-opacity duration-150 motion-reduce:transition-none",
                      !sceneBaseDocument.background.fogEnabled && "pointer-events-none opacity-45",
                    )}
                    aria-disabled={!sceneBaseDocument.background.fogEnabled}
                  >
                    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {STUDIO_BG3D_FOG_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          disabled={!sceneBaseDocument.background.fogEnabled}
                          className={cx(
                            CONTROL_BUTTON,
                            "min-h-10 shrink-0 border-line bg-card px-3 text-fg-2 hover:bg-raised hover:text-fg sm:min-h-9",
                            sceneBaseDocument.background.fogNear === preset.near &&
                              sceneBaseDocument.background.fogFar === preset.far &&
                              "border-accent/60 bg-accent-soft text-accent",
                          )}
                          onClick={() => updateBackgroundSettings({
                            fogEnabled: true,
                            fogColor: getSkyPreset(skyPresetId).clearColor,
                            fogNear: preset.near,
                            fogFar: preset.far,
                          })}
                        >
                          {preset.label}
                          <span className="text-[0.62rem] font-normal text-fg-3">
                            {preset.near}–{preset.far}
                          </span>
                        </button>
                      ))}
                    </div>

                    <label className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs font-semibold text-fg-2">
                      대기색
                      <input
                        type="color"
                        aria-label="3D 공간 안개 색"
                        value={sceneBaseDocument.background.fogColor ?? sceneBaseDocument.background.color}
                        disabled={!sceneBaseDocument.background.fogEnabled}
                        onChange={(event) => updateBackgroundSettings({ fogColor: event.target.value })}
                        className="size-11 cursor-pointer rounded-lg border border-line bg-transparent p-1 sm:size-9"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-fg-2">
                      <span className="flex items-center justify-between gap-3">
                        시작 거리
                        <output className="tabular-nums text-fg">
                          {round(fogNear, 2)}
                        </output>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max={fogSliderMax}
                        step="0.25"
                        value={fogNear}
                        disabled={!sceneBaseDocument.background.fogEnabled}
                        onChange={(event) => {
                          const fogNear = Number(event.target.value);
                          updateBackgroundSettings({
                            fogNear,
                            fogFar: Math.max(
                              fogNear + STUDIO_BG3D_FOG_MIN_GAP,
                              sceneBaseDocument.background.fogFar ?? 50,
                            ),
                          });
                        }}
                        className="mt-2 w-full accent-accent"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-fg-2">
                      <span className="flex items-center justify-between gap-3">
                        완전 혼합 거리
                        <output className="tabular-nums text-fg">
                          {round(fogFar, 2)}
                        </output>
                      </span>
                      <input
                        type="range"
                        min={fogNear + STUDIO_BG3D_FOG_MIN_GAP}
                        max={fogSliderMax}
                        step="0.25"
                        value={fogFar}
                        disabled={!sceneBaseDocument.background.fogEnabled}
                        onChange={(event) => updateBackgroundSettings({
                          fogFar: Math.max(
                            Number(event.target.value),
                            (sceneBaseDocument.background.fogNear ?? 10) + STUDIO_BG3D_FOG_MIN_GAP,
                          ),
                        })}
                        className="mt-2 w-full accent-accent"
                      />
                    </label>
                    <p className="text-[0.65rem] leading-relaxed text-fg-3">
                      안개는 뷰포트와 컬러·톤 캡처에 함께 반영되며 선화 레이어의 투명 배경은 유지됩니다.
                    </p>
                  </div>
                </div>
                </div>
              </section>

              <section hidden={hideOnTab("lt")}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <ScanLine size={15} className="text-accent" aria-hidden />
                    렌더/LT 변환
                  </h3>
                  <span className="rounded-full border border-line bg-card px-2 py-1 text-[0.64rem] font-semibold text-fg-3">
                    장면 설정 v1
                  </span>
                </div>
                <p className="mt-1.5 text-[0.68rem] leading-relaxed text-fg-3">
                  3D 배경의 컬러·선화·톤 출력 의도를 저장합니다. 프리셋 적용 뒤 필요한 값만 조정하세요.
                </p>

                <label htmlFor="bg3d-lt-preset" className="mt-3 block text-xs font-semibold text-fg-2">
                  변환 프리셋
                  <select
                    id="bg3d-lt-preset"
                    value={appliedLtPresetId}
                    className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:min-h-9"
                    onChange={(event) => {
                      if (event.target.value !== "custom") applyLtPreset(event.target.value);
                    }}
                  >
                    <option value="custom" disabled>
                      사용자 설정
                    </option>
                    <optgroup label="기본 프리셋">
                      {STUDIO_BG3D_LT_BUILT_IN_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </optgroup>
                    {ltUserPresetPayload.presets.length > 0 ? (
                      <optgroup label={`내 프리셋 · ${ltUserPresetPayload.presets.length}개`}>
                        {ltUserPresetPayload.presets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                <p className="mt-2 min-h-8 text-[0.68rem] leading-relaxed text-fg-3">
                  {appliedLtPreset?.description ?? "프리셋을 기준으로 값을 직접 조정한 사용자 설정입니다."}
                </p>
                <p aria-live="polite" aria-atomic="true" className="sr-only">
                  {appliedLtPreset ? `${appliedLtPreset.name} 프리셋 적용됨` : "LT 사용자 설정 적용됨"}
                </p>

                <details className="group mt-3 rounded-xl border border-line bg-card/45">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <span className="flex items-center gap-1.5">
                      <Save size={14} className="text-accent" aria-hidden />
                      내 프리셋
                    </span>
                    <span className="flex items-center gap-1 text-[0.64rem] font-normal text-fg-3">
                      {ltUserPresetPayload.presets.length}/{STUDIO_BG3D_LT_PRESET_MAX_COUNT}
                      {ltUserPresetLibraryStatus === "idle" ? " · 불러오는 중" : ""}
                      <ChevronDown className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" size={13} aria-hidden />
                    </span>
                  </summary>
                  <div className="border-t border-line/70 px-3 py-3">
                    <p className="text-[0.68rem] leading-relaxed text-fg-3">
                      {managedLtUserPreset
                        ? `“${managedLtUserPreset.name}”을 관리 중입니다. 현재 LT 값을 덮어쓰거나 이름만 바꿀 수 있어요.`
                        : "현재 선화·톤 값을 새 사용자 프리셋으로 저장합니다."}
                    </p>
                    <label htmlFor="bg3d-lt-user-preset-name" className="mt-3 block text-xs font-semibold text-fg-2">
                      이름
                      <input
                        id="bg3d-lt-user-preset-name"
                        type="text"
                        required
                        maxLength={STUDIO_BG3D_LT_PRESET_MAX_NAME_LENGTH}
                        value={ltUserPresetName}
                        className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/25 sm:min-h-9"
                        placeholder="예: 야간 골목 선화"
                        onChange={(event) => {
                          setLtUserPresetName(event.target.value);
                          setLtDeleteConfirmId(null);
                        }}
                      />
                    </label>
                    <label htmlFor="bg3d-lt-user-preset-description" className="mt-3 block text-xs font-semibold text-fg-2">
                      설명
                      <textarea
                        id="bg3d-lt-user-preset-description"
                        required
                        rows={2}
                        maxLength={STUDIO_BG3D_LT_PRESET_MAX_DESCRIPTION_LENGTH}
                        value={ltUserPresetDescription}
                        className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-line bg-panel px-3 py-2.5 text-xs leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:ring-2 focus:ring-accent/25"
                        placeholder="어떤 장면과 작업 단계에 쓰는 설정인지 기록하세요."
                        onChange={(event) => {
                          setLtUserPresetDescription(event.target.value);
                          setLtDeleteConfirmId(null);
                        }}
                      />
                    </label>
                    <div className="mt-1 flex justify-end gap-3 text-[0.62rem] tabular-nums text-fg-3">
                      <span>이름 {Array.from(ltUserPresetName).length}/{STUDIO_BG3D_LT_PRESET_MAX_NAME_LENGTH}</span>
                      <span>설명 {Array.from(ltUserPresetDescription).length}/{STUDIO_BG3D_LT_PRESET_MAX_DESCRIPTION_LENGTH}</span>
                    </div>

                    {managedLtUserPreset ? (
                      <div className="mt-3 space-y-2">
                        <button
                          type="button"
                          className={cx(CONTROL_BUTTON, "w-full border-accent/55 bg-accent text-on-accent hover:bg-accent/90")}
                          disabled={ltUserPresetLibraryStatus === "idle" || ltUserPresetLibraryStatus === "unavailable"}
                          onClick={updateManagedLtUserPreset}
                        >
                          <Save size={14} aria-hidden />
                          현재 설정으로 업데이트
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            className={cx(CONTROL_BUTTON, "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")}
                            disabled={ltUserPresetLibraryStatus === "idle" || ltUserPresetLibraryStatus === "unavailable"}
                            onClick={renameManagedLtUserPreset}
                          >
                            <PencilLine size={14} aria-hidden />
                            이름만 변경
                          </button>
                          <button
                            type="button"
                            className={cx(
                              CONTROL_BUTTON,
                              ltDeleteConfirmId === managedLtUserPreset.id
                                ? "border-bad/60 bg-[oklch(0.66_0.20_25/0.12)] text-bad"
                                : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-bad"
                            )}
                            disabled={ltUserPresetLibraryStatus === "idle" || ltUserPresetLibraryStatus === "unavailable"}
                            onClick={deleteManagedLtUserPreset}
                          >
                            <Trash2 size={14} aria-hidden />
                            {ltDeleteConfirmId === managedLtUserPreset.id ? "삭제 확인" : "삭제"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={cx(CONTROL_BUTTON, "mt-3 w-full border-accent/55 bg-accent text-on-accent hover:bg-accent/90")}
                        disabled={
                          ltUserPresetLibraryStatus === "idle" ||
                          ltUserPresetLibraryStatus === "unavailable" ||
                          ltUserPresetPayload.presets.length >= STUDIO_BG3D_LT_PRESET_MAX_COUNT
                        }
                        onClick={saveCurrentLtAsUserPreset}
                      >
                        <Save size={14} aria-hidden />
                        현재 설정을 새 프리셋으로 저장
                      </button>
                    )}
                  </div>
                </details>

                {ltUserPresetNotice ? (
                  <p
                    aria-live="polite"
                    aria-atomic="true"
                    className={cx(
                      "mt-2 rounded-lg border px-3 py-2 text-[0.68rem] leading-relaxed",
                      ltUserPresetNotice.tone === "success" && "border-good/35 bg-[oklch(0.80_0.15_150/0.08)] text-good",
                      ltUserPresetNotice.tone === "error" && "border-bad/35 bg-[oklch(0.66_0.20_25/0.08)] text-bad",
                      ltUserPresetNotice.tone === "info" && "border-line bg-card/55 text-fg-2"
                    )}
                  >
                    {ltUserPresetNotice.message}
                  </p>
                ) : null}

                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-line bg-card/55 px-3 py-2">
                  <div className="min-w-0">
                    <label htmlFor="bg3d-lt-export-height" className="block text-xs font-bold text-fg">
                      출력 해상도
                    </label>
                    <p className="mt-0.5 text-[0.64rem] leading-relaxed text-fg-3" aria-live="polite">
                      {ltCaptureSizePreview
                        ? `${ltCaptureSizePreview.width.toLocaleString()}×${ltCaptureSizePreview.height.toLocaleString()} px${ltCaptureSizePreview.wasReduced ? " · 기기 안전 한도 적용" : ""}`
                        : "현재 기기에서 안전한 출력 크기를 계산할 수 없습니다."}
                    </p>
                  </div>
                  <select
                    id="bg3d-lt-export-height"
                    aria-label="LT 출력 높이"
                    className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:min-h-9"
                    value={sceneBaseDocument.output.exportHeight}
                    onChange={(event) => updateLtExportHeight(Number(event.target.value))}
                  >
                    {!LT_EXPORT_HEIGHTS.includes(sceneBaseDocument.output.exportHeight as (typeof LT_EXPORT_HEIGHTS)[number]) ? (
                      <option value={sceneBaseDocument.output.exportHeight}>
                        {sceneBaseDocument.output.exportHeight.toLocaleString()} px
                      </option>
                    ) : null}
                    {LT_EXPORT_HEIGHTS.map((height) => (
                      <option key={height} value={height}>{height.toLocaleString()} px</option>
                    ))}
                  </select>
                </div>

                <div
                  role="group"
                  className="mt-3 rounded-xl border border-line bg-card/55 p-3"
                  aria-label={`LT 출력 의도: ${ltLineSettings.enabled ? `${ltLineSettings.widthPx}픽셀 선화` : "선화 없음"}, ${LT_TONE_MODE_LABELS[ltToneSettings.mode]}, ${LT_TONE_TYPE_LABELS[ltToneSettings.type]}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-fg">출력 의도 미리보기</span>
                    <button
                      type="button"
                      aria-pressed={lineArtPreview}
                      className={cx(
                        "min-h-11 rounded-lg border px-2.5 text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9",
                        lineArtPreview
                          ? "border-accent/60 bg-accent-soft text-accent"
                          : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg"
                      )}
                      onClick={() => setLineArtPreview((visible) => !visible)}
                    >
                      캔버스 선화 {lineArtPreview ? "켜짐" : "꺼짐"}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2" aria-hidden>
                    <div className="relative h-12 overflow-hidden rounded-lg border border-line/80 bg-panel">
                      {ltLineSettings.enabled ? (
                        <>
                          <span
                            className="absolute inset-x-3 top-[38%] rounded-full"
                            style={{
                              backgroundColor: ltLineSettings.color,
                              height: `${Math.max(1, Math.min(8, ltLineSettings.widthPx * 1.6))}px`,
                              opacity: ltLineSettings.strength,
                            }}
                          />
                          {ltLineSettings.textureLineEnabled ? (
                            <span
                              className="absolute inset-x-5 top-[66%] border-t border-dashed"
                              style={{
                                borderColor: ltLineSettings.color,
                                opacity: ltLineSettings.textureLineStrength,
                              }}
                            />
                          ) : null}
                        </>
                      ) : (
                        <span className="absolute inset-0 grid place-items-center text-[0.64rem] text-fg-3">선화 꺼짐</span>
                      )}
                    </div>
                    <div className="relative h-12 overflow-hidden rounded-lg border border-line/80" style={ltTonePreviewStyle(ltToneSettings)}>
                      {ltToneSettings.mode === "none" ? (
                        <span className="absolute inset-0 grid place-items-center text-[0.64rem] text-fg-3">선화만</span>
                      ) : null}
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 text-[0.64rem] leading-relaxed text-fg-3">
                    <div>
                      <dt className="sr-only">선화 설정</dt>
                      <dd>
                        선 {ltLineSettings.enabled ? `${round(ltLineSettings.widthPx, 2)}px · ${Math.round(ltLineSettings.strength * 100)}%` : "없음"}
                      </dd>
                    </div>
                    <div>
                      <dt className="sr-only">컬러·톤 설정</dt>
                      <dd>
                        {LT_TONE_MODE_LABELS[ltToneSettings.mode]}
                        {ltToneSettings.mode !== "none" ? ` · ${LT_TONE_TYPE_LABELS[ltToneSettings.type]}` : ""}
                      </dd>
                    </div>
                  </dl>
                </div>

                <p className="mt-2 text-[0.66rem] leading-relaxed text-fg-3">
                  결과는 컬러/톤·재질선·주선을 편집 가능한 별도 래스터 PNG 레이어로 묶어 추가합니다. 실제
                  벡터 경로 추출은 아직 지원하지 않으므로 벡터로 표시하거나 내보내지 않습니다.
                </p>

                <div role="group" aria-label="LT 세부 설정" className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-card p-1">
                  {(["line", "tone"] as const).map((section) => {
                    const active = ltEditorSection === section;
                    return (
                      <button
                        key={section}
                        type="button"
                        aria-pressed={active}
                        className={cx(
                          "min-h-11 rounded-lg border px-3 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9",
                          active
                            ? "border-accent/55 bg-accent-soft text-accent"
                            : "border-transparent text-fg-3 hover:bg-raised hover:text-fg"
                        )}
                        onClick={() => setLtEditorSection(section)}
                      >
                        {section === "line" ? "선화" : "컬러·톤"}
                      </button>
                    );
                  })}
                </div>

                <div hidden={ltEditorSection !== "line"} className="mt-3">
                  <LtToggleRow
                    checked={ltLineSettings.enabled}
                    label="선화 출력"
                    onChange={(enabled) => {
                      updateLtLineSettings({ enabled });
                      setLineArtPreview(enabled);
                    }}
                  />
                  <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line/70 py-2 text-xs">
                    <span className="font-semibold text-fg-2">레이어 의도</span>
                    <span className="text-right text-[0.68rem] text-fg-3">
                      {ltLineSettings.layerType === "vector" ? "벡터 요청 · 래스터 변환" : "래스터 PNG"}
                    </span>
                  </div>
                  <label htmlFor="bg3d-lt-line-color" className={cx(
                    "flex min-h-11 items-center justify-between gap-3 border-b border-line/70 py-1.5 text-xs",
                    !ltLineSettings.enabled && "opacity-45"
                  )}>
                    <span className="font-semibold text-fg-2">선 색상</span>
                    <span className="ml-auto font-mono text-[0.68rem] uppercase text-fg-3">{ltLineSettings.color}</span>
                    <input
                      id="bg3d-lt-line-color"
                      type="color"
                      aria-label="LT 선 색상"
                      className="size-11 cursor-pointer rounded-lg border border-line bg-card p-1 disabled:cursor-not-allowed sm:size-9"
                      disabled={!ltLineSettings.enabled}
                      value={ltLineSettings.color}
                      onChange={(event) => updateLtLineSettings({ color: event.target.value })}
                    />
                  </label>
                  <LtRangeControl
                    id="bg3d-lt-line-width"
                    label="선 굵기"
                    min={0.25}
                    max={8}
                    step={0.05}
                    value={ltLineSettings.widthPx}
                    valueText={`${round(ltLineSettings.widthPx, 2)} px`}
                    disabled={!ltLineSettings.enabled}
                    onChange={(widthPx) => updateLtLineSettings({ widthPx })}
                  />
                  <LtRangeControl
                    id="bg3d-lt-line-strength"
                    label="선 강도"
                    min={0}
                    max={1}
                    step={0.01}
                    value={ltLineSettings.strength}
                    valueText={`${Math.round(ltLineSettings.strength * 100)}%`}
                    disabled={!ltLineSettings.enabled}
                    onChange={(strength) => updateLtLineSettings({ strength })}
                  />

                  <details className="group border-b border-line/70">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-xs font-semibold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                      정밀 선 검출
                      <span className="flex items-center gap-1 text-[0.64rem] font-normal text-fg-3">
                        모서리 · 깊이 · 질감
                        <ChevronDown className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" size={13} aria-hidden />
                      </span>
                    </summary>
                    <div className="border-t border-line/60 pl-2">
                      <LtRangeControl
                        id="bg3d-lt-line-accuracy"
                        label="검출 정밀도"
                        min={0}
                        max={1}
                        step={0.01}
                        value={ltLineSettings.accuracy}
                        valueText={`${Math.round(ltLineSettings.accuracy * 100)}%`}
                        disabled={!ltLineSettings.enabled}
                        onChange={(accuracy) => updateLtLineSettings({ accuracy })}
                      />
                      <LtRangeControl
                        id="bg3d-lt-line-exterior"
                        label="외곽선 강조"
                        min={0}
                        max={2}
                        step={0.05}
                        value={ltLineSettings.exteriorOutlineStrength}
                        valueText={`${round(ltLineSettings.exteriorOutlineStrength, 2)}×`}
                        disabled={!ltLineSettings.enabled}
                        onChange={(exteriorOutlineStrength) => updateLtLineSettings({ exteriorOutlineStrength })}
                      />
                      <LtRangeControl
                        id="bg3d-lt-line-smoothing"
                        label="선 다듬기"
                        min={0}
                        max={1}
                        step={0.01}
                        value={ltLineSettings.smoothing}
                        valueText={`${Math.round(ltLineSettings.smoothing * 100)}%`}
                        disabled={!ltLineSettings.enabled}
                        onChange={(smoothing) => updateLtLineSettings({ smoothing })}
                      />
                      <LtRangeControl
                        id="bg3d-lt-line-crease"
                        label="모서리 각도"
                        min={0}
                        max={180}
                        step={1}
                        value={ltLineSettings.creaseAngleDegrees}
                        valueText={`${Math.round(ltLineSettings.creaseAngleDegrees)}°`}
                        disabled={!ltLineSettings.enabled}
                        onChange={(creaseAngleDegrees) => updateLtLineSettings({ creaseAngleDegrees })}
                      />
                      <LtToggleRow
                        checked={ltLineSettings.scaleAwareAccuracy}
                        label="화면 크기 보정"
                        disabled={!ltLineSettings.enabled}
                        onChange={(scaleAwareAccuracy) => updateLtLineSettings({ scaleAwareAccuracy })}
                      />
                      <LtToggleRow
                        checked={ltLineSettings.hiddenLineRemoval}
                        label="가려진 선 제거"
                        disabled={!ltLineSettings.enabled}
                        onChange={(hiddenLineRemoval) => updateLtLineSettings({ hiddenLineRemoval })}
                      />
                      <LtToggleRow
                        checked={ltLineSettings.depthEnabled}
                        label="깊이선 검출"
                        disabled={!ltLineSettings.enabled}
                        onChange={(depthEnabled) => updateLtLineSettings({ depthEnabled })}
                      />
                      {ltLineSettings.depthEnabled ? (
                        <>
                          <LtRangeControl
                            id="bg3d-lt-line-depth"
                            label="깊이선 강도"
                            min={0}
                            max={1}
                            step={0.01}
                            value={ltLineSettings.depthStrength}
                            valueText={`${Math.round(ltLineSettings.depthStrength * 100)}%`}
                            disabled={!ltLineSettings.enabled}
                            onChange={(depthStrength) => updateLtLineSettings({ depthStrength })}
                          />
                          <LtToggleRow
                            checked={ltLineSettings.depthOutlineOnly}
                            label="깊이 외곽선만"
                            disabled={!ltLineSettings.enabled}
                            onChange={(depthOutlineOnly) => updateLtLineSettings({ depthOutlineOnly })}
                          />
                        </>
                      ) : null}
                      <LtToggleRow
                        checked={ltLineSettings.textureLineEnabled}
                        label="재질선 검출"
                        disabled={!ltLineSettings.enabled}
                        onChange={(textureLineEnabled) => updateLtLineSettings({ textureLineEnabled })}
                      />
                      {ltLineSettings.textureLineEnabled ? (
                        <LtRangeControl
                          id="bg3d-lt-line-texture"
                          label="재질선 강도"
                          min={0}
                          max={1}
                          step={0.01}
                          value={ltLineSettings.textureLineStrength}
                          valueText={`${Math.round(ltLineSettings.textureLineStrength * 100)}%`}
                          disabled={!ltLineSettings.enabled}
                          onChange={(textureLineStrength) => updateLtLineSettings({ textureLineStrength })}
                        />
                      ) : null}
                    </div>
                  </details>
                </div>

                <div hidden={ltEditorSection !== "tone"} className="mt-3">
                  <label htmlFor="bg3d-lt-tone-mode" className="flex min-h-11 items-center justify-between gap-3 border-b border-line/70 py-1.5 text-xs font-semibold text-fg-2">
                    베이스 방식
                    <select
                      id="bg3d-lt-tone-mode"
                      value={ltToneSettings.mode}
                      className="min-h-11 min-w-36 rounded-lg border border-line bg-card px-2.5 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:min-h-9"
                      onChange={(event) => {
                        const mode = event.target.value as StudioBg3dToneOutputSettings["mode"];
                        updateLtToneSettings({
                          mode,
                          ...(mode === "screentone" ? { type: "pattern" as const } : {}),
                        });
                      }}
                    >
                      {Object.entries(LT_TONE_MODE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  {ltToneSettings.mode === "none" ? (
                    <p className="py-4 text-center text-[0.68rem] leading-relaxed text-fg-3">
                      베이스가 꺼져 선만 출력됩니다. 위에서 원본 렌더·셀 명암·스크린톤을 선택하면 채움
                      레이어 설정이 열립니다.
                    </p>
                  ) : (
                    <>
                      <label htmlFor="bg3d-lt-tone-type" className="flex min-h-11 items-center justify-between gap-3 border-b border-line/70 py-1.5 text-xs font-semibold text-fg-2">
                        출력 유형
                        <select
                          id="bg3d-lt-tone-type"
                          value={ltToneSettings.type}
                          className="min-h-11 min-w-36 rounded-lg border border-line bg-card px-2.5 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:min-h-9"
                          onChange={(event) => updateLtToneSettings({ type: event.target.value as StudioBg3dToneOutputSettings["type"] })}
                        >
                          {Object.entries(LT_TONE_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      {ltToneSettings.type === "pattern" || ltToneSettings.mode === "screentone" ? (
                        <label htmlFor="bg3d-lt-tone-pattern" className="flex min-h-11 items-center justify-between gap-3 border-b border-line/70 py-1.5 text-xs font-semibold text-fg-2">
                          패턴
                          <select
                            id="bg3d-lt-tone-pattern"
                            value={ltToneSettings.pattern}
                            className="min-h-11 min-w-36 rounded-lg border border-line bg-card px-2.5 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 sm:min-h-9"
                            onChange={(event) => updateLtToneSettings({ pattern: event.target.value as StudioBg3dToneOutputSettings["pattern"] })}
                          >
                            {Object.entries(LT_TONE_PATTERN_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <LtRangeControl
                        id="bg3d-lt-tone-levels"
                        label="명암 단계"
                        min={2}
                        max={8}
                        step={1}
                        value={ltToneSettings.levels}
                        valueText={`${ltToneSettings.levels}단계`}
                        onChange={(levels) => updateLtToneSettings({ levels })}
                      />
                      <LtRangeControl
                        id="bg3d-lt-tone-opacity"
                        label="베이스 농도"
                        min={0}
                        max={1}
                        step={0.01}
                        value={ltToneSettings.opacity}
                        valueText={`${Math.round(ltToneSettings.opacity * 100)}%`}
                        onChange={(opacity) => updateLtToneSettings({ opacity })}
                      />
                      <details className="group border-b border-line/70">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-xs font-semibold text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                          스크린 정밀 설정
                          <span className="flex items-center gap-1 text-[0.64rem] font-normal text-fg-3">
                            선수 · 각도
                            <ChevronDown className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" size={13} aria-hidden />
                          </span>
                        </summary>
                        <div className="border-t border-line/60 pl-2">
                          <LtRangeControl
                            id="bg3d-lt-tone-frequency"
                            label="패턴 선수"
                            min={1}
                            max={200}
                            step={1}
                            value={ltToneSettings.frequency}
                            valueText={`${Math.round(ltToneSettings.frequency)} LPI`}
                            onChange={(frequency) => updateLtToneSettings({ frequency })}
                          />
                          <LtRangeControl
                            id="bg3d-lt-tone-angle"
                            label="패턴 각도"
                            min={-180}
                            max={180}
                            step={1}
                            value={ltToneSettings.angleDegrees}
                            valueText={`${Math.round(ltToneSettings.angleDegrees)}°`}
                            onChange={(angleDegrees) => updateLtToneSettings({ angleDegrees })}
                          />
                        </div>
                      </details>
                    </>
                  )}
                </div>
              </section>

              <section hidden={hideOnTab("models")}>
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
                  disabled={isSavingTemplate || (primitives.length === 0 && customModels.length === 0)}
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
                        onClick={() => {
                          if (entry.template.primitives) {
                            setPrimitives(prev => [...prev, ...entry.template.primitives!.map(p => ({ ...p, id: generateId() }))]);
                          }
                          if (entry.template.customModels) {
                            setCustomModels(prev => [...prev, ...entry.template.customModels!.map(m => ({ ...m, id: generateId() }))]);
                          }
                        }}
                      >
                        <span className="block truncate text-xs font-bold text-fg">{entry.name}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <span className={cx("inline-flex rounded-full px-1.5 py-0.5 text-[0.64rem] font-bold", entry.commercialUse ? "bg-[oklch(0.80_0.15_150/0.14)] text-good" : "bg-raised text-fg-3")}>
                            {entry.commercialUse ? "상업 이용 가능" : "상업 이용 확인 필요"}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-lg border border-line bg-panel/90 text-fg-3 transition-colors hover:bg-raised hover:text-accent"
                        onClick={(e) => { e.stopPropagation(); void handleDeleteTemplate(entry.id); }}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
                

                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
                    <PackageOpen size={15} className="text-accent" aria-hidden />
                    3D 모델
                  </h3>
                  <span className="text-[0.68rem] text-fg-3">
                    {modelLibrary.length}개 · {deviceQuality.profile === "mobile" ? "모바일" : "데스크톱"} 기준
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  accept=".glb,.gltf,.obj,.fbx,.dae,.stl,.ply,.3ds,.mtl,.bin,.png,.jpg,.jpeg,.webp,model/gltf-binary,model/gltf+json,model/obj,model/stl"
                  className="sr-only"
                  multiple
                  type="file"
                  onChange={handleUploadModelFiles}
                />
                <button
                  type="button"
                  className={cx(CONTROL_BUTTON, "w-full border-accent/50 bg-accent text-on-accent hover:bg-accent/90")}
                  onClick={() => {
                    if (isUploadingModel) modelImportAbortRef.current?.abort();
                    else fileInputRef.current?.click();
                  }}
                >
                  {isUploadingModel ? <X size={14} aria-hidden /> : <Upload size={14} aria-hidden />}
                  {isUploadingModel
                    ? modelImportProgress?.totalModels
                      ? `가져오기 취소 · ${modelImportProgress.completedModels}/${modelImportProgress.totalModels}`
                      : "가져오기 취소"
                    : "3D 모델 및 연결 파일 가져오기"}
                </button>
                <p className="mt-2 rounded-xl border border-line bg-card/60 px-3 py-2 text-xs leading-relaxed text-fg-3">
                  GLB·glTF·OBJ·FBX·DAE·STL·PLY·3DS를 지원합니다. glTF의 BIN/텍스처나 OBJ의 MTL/텍스처도 함께 선택하세요.
                  외부 네트워크 참조 없이 자체 포함 GLB로 변환하고, Worker에서 SHA-256·파일 구조와 기기별
                  삼각형/텍스처 예산을 검사한 뒤 로컬 라이브러리에 저장합니다. Meshopt 압축은 별도 WASM
                  Worker에서 풀며 디코딩 후 메모리도 같은 기기 예산으로 제한합니다.
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
                      가져온 3D 모델이 아직 없습니다. GLB를 선택하거나 모델과 연결 리소스를 함께 선택해 보세요.
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
