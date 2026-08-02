/**
 * Studio 3D 데생 인형 포저 패널.
 *
 * 클립스튜디오 데생 인형처럼 외부 모델 파일 없이 절차 생성 마네킹을 체형·포즈·관절·카메라
 * 4개 섹션으로 다루고, 결과를 PNG data URL 로 캔버스에 삽입한다(onInsert 콜백).
 *
 * 확장 지원:
 * - 11가지 다양 체형 프리셋 & 6가지 표면 재질 스타일(목조, 클레이, 와이어프레임, 셀 셰이딩 등).
 * - 카테고리별 다채로운 3D 포즈 프리셋 라이브러리 (기본, 액션, 일상, 스포츠, 웹툰 연출).
 * - 데생 인형 JSON 파일 내보내기/가져오기 & 공유 해시 URL 복사.
 * - 카메라/사진 동작 인식 트래킹 플랜 연동.
 * - 6종 카메라 앵글 프리셋 (정면, 측면, 후면, 탑뷰, 하이앵글, 로우앵글).
 */

import {
  AlertTriangle,
  Camera,
  Check,
  Download,
  FlipHorizontal2,
  ImageIcon,
  Loader2,
  PersonStanding,
  RotateCcw,
  Share2,
  Sliders,
  Upload,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_MANNEQUIN_BODY_PRESETS,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_JOINT_IDS,
  STUDIO_MANNEQUIN_JOINT_LABELS,
  STUDIO_MANNEQUIN_MATERIAL_STYLES,
  STUDIO_MANNEQUIN_PARAM_RANGES,
  buildStudioMannequinSpec,
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  getStudioMannequinJointLimit,
  type StudioMannequinBodyParams,
  type StudioMannequinBodyPresetId,
  type StudioMannequinJointId,
  type StudioMannequinMaterialStyle,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import { createStudioMannequinPhotoPoseApplyPlan } from "./studio-mannequin-photo-pose-apply";
import {
  STUDIO_MANNEQUIN_POSE_CATEGORIES,
  STUDIO_MANNEQUIN_POSE_PRESETS,
  STUDIO_MANNEQUIN_STATE_STORAGE_KEY,
  createStudioMannequinRestPose,
  encodeStudioMannequinShareHash,
  exportStudioMannequinStateToJSON,
  importStudioMannequinStateFromJSON,
  mirrorStudioMannequinPose,
  normalizeStudioMannequinPose,
  parseStudioMannequinState,
  serializeStudioMannequinState,
  type StudioMannequinPose,
  type StudioMannequinPoseCategory,
} from "./studio-mannequin-poses";
import {
  createStudioMannequinScene,
  type StudioMannequinCaptureResult,
  type StudioMannequinProjection,
  type StudioMannequinSceneHandle,
} from "./studio-mannequin-scene";
import {
  disposeStudioMannequinPoseLandmarker,
  getStudioMannequinWebcamErrorMessage,
  initStudioMannequinPoseLandmarker,
  isStudioMannequinWebcamAbortError,
  solvePoseToMannequinJoints,
  smoothMannequinJointRotations,
  type StudioMannequinPoseLandmarker,
  type StudioMannequinWebcamErrorStage,
} from "./studio-mannequin-webcam-tracking";
import {
  StudioPanelChip,
  StudioSectionHeader,
  StudioSliderRow,
  StudioToggleChip,
  studioSegmentChipClass,
} from "./studio-panel-ui";

import type { ReactElement } from "react";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

export type { StudioMannequinCaptureResult } from "./studio-mannequin-scene";

export interface StudioMannequinPoserPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onInsert: (result: StudioMannequinCaptureResult) => Promise<boolean | void> | boolean | void;
}

type MannequinTabId = "body" | "pose" | "joint" | "camera";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const CAPTURE_SCALES = [1, 2, 3] as const;

const TABS: readonly { id: MannequinTabId; label: string; icon: ReactElement }[] = Object.freeze([
  { id: "body", label: "체형", icon: <UserRound size={13} aria-hidden /> },
  { id: "pose", label: "포즈", icon: <PersonStanding size={13} aria-hidden /> },
  { id: "joint", label: "관절", icon: <Sliders size={13} aria-hidden /> },
  { id: "camera", label: "카메라·캡처", icon: <Camera size={13} aria-hidden /> },
]);

const BODY_SLIDERS: readonly {
  key: keyof StudioMannequinBodyParams;
  label: string;
  step: number;
  format: (v: number) => string;
}[] = Object.freeze([
  { key: "heightCm", label: "신장", step: 1, format: (v) => `${Math.round(v)}cm` },
  { key: "headCount", label: "두신 비율", step: 0.1, format: (v) => `${v.toFixed(1)}등신` },
  { key: "shoulderWidth", label: "어깨 너비", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "pelvisWidth", label: "골반 너비", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "armLength", label: "팔 길이", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "legLength", label: "다리 비율", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  {
    key: "build",
    label: "체형 블렌드",
    step: 0.1,
    format: (v) => (v < 0.5 ? "마른" : v < 1.5 ? "표준" : v < 2.5 ? "근육" : "통통"),
  },
]);

function getErrorText(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return fallback;
}

function createWebcamPreflightError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export function StudioMannequinBodySection({
  params,
  materialStyle,
  onParamsChange,
  onApplyPreset,
  onMaterialStyleChange,
}: {
  params: StudioMannequinBodyParams;
  materialStyle: StudioMannequinMaterialStyle;
  onParamsChange: (next: StudioMannequinBodyParams) => void;
  onApplyPreset: (presetId: StudioMannequinBodyPresetId) => void;
  onMaterialStyleChange: (style: StudioMannequinMaterialStyle) => void;
}): ReactElement {
  return (
    <div className="space-y-4">
      <StudioSectionHeader
        title="체형 프리셋"
        description="다양한 등신 비율 및 신장 파라미터를 선택하세요."
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="체형 프리셋">
        {(Object.keys(STUDIO_MANNEQUIN_BODY_PRESETS) as StudioMannequinBodyPresetId[]).map(
          (presetId) => (
            <StudioPanelChip
              key={presetId}
              onClick={() => onApplyPreset(presetId)}
              title={`${STUDIO_MANNEQUIN_BODY_PRESETS[presetId].label} 체형 프리셋 적용`}
            >
              {STUDIO_MANNEQUIN_BODY_PRESETS[presetId].label}
            </StudioPanelChip>
          ),
        )}
      </div>

      <div className="space-y-1.5 pt-1">
        <span className="text-xs font-semibold text-fg-2">재질·표면 스타일</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="재질 스타일">
          {STUDIO_MANNEQUIN_MATERIAL_STYLES.map((style) => (
            <StudioToggleChip
              key={style.id}
              active={materialStyle === style.id}
              onClick={() => onMaterialStyleChange(style.id)}
              title={style.desc}
            >
              {style.label}
            </StudioToggleChip>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <span className="text-xs font-semibold text-fg-2">세부 체형 조절</span>
        {BODY_SLIDERS.map(({ key, label, step, format }) => {
          const [min, max] = STUDIO_MANNEQUIN_PARAM_RANGES[key];
          return (
            <StudioSliderRow
              key={key}
              label={label}
              min={min}
              max={max}
              step={step}
              value={params[key]}
              onChange={(next) =>
                onParamsChange(clampStudioMannequinBodyParams({ ...params, [key]: next }))
              }
              readout={format(params[key])}
            />
          );
        })}
      </div>
    </div>
  );
}

export function StudioMannequinPoseSection({
  selectedCategory,
  onCategorySelect,
  onApplyPreset,
  onMirror,
  onResetJoints,
}: {
  selectedCategory: StudioMannequinPoseCategory | "all";
  onCategorySelect: (category: StudioMannequinPoseCategory | "all") => void;
  onApplyPreset: (presetId: string) => void;
  onMirror: () => void;
  onResetJoints: () => void;
}): ReactElement {
  const filteredPresets = useMemo(() => {
    if (selectedCategory === "all") return STUDIO_MANNEQUIN_POSE_PRESETS;
    return STUDIO_MANNEQUIN_POSE_PRESETS.filter((p) => p.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="포즈 라이브러리"
        description="카테고리별 프리셋을 고르고 뷰포트에서 핸들을 드래그해 다듬으세요."
        action={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onMirror}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
              title="포즈 좌우 반전"
            >
              <FlipHorizontal2 size={13} aria-hidden /> 미러
            </button>
            <button
              type="button"
              onClick={onResetJoints}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
              title="모든 관절 초기화"
            >
              <RotateCcw size={13} aria-hidden /> 초기화
            </button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-1" role="group" aria-label="포즈 카테고리">
        <StudioToggleChip
          active={selectedCategory === "all"}
          onClick={() => onCategorySelect("all")}
        >
          전체
        </StudioToggleChip>
        {STUDIO_MANNEQUIN_POSE_CATEGORIES.map((cat) => (
          <StudioToggleChip
            key={cat.id}
            active={selectedCategory === cat.id}
            onClick={() => onCategorySelect(cat.id)}
          >
            {cat.label}
          </StudioToggleChip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="포즈 프리셋">
        {filteredPresets.map((preset) => (
          <StudioPanelChip
            key={preset.id}
            onClick={() => onApplyPreset(preset.id)}
            title={`${preset.label} 포즈 적용`}
          >
            {preset.label}
          </StudioPanelChip>
        ))}
      </div>
    </div>
  );
}

export function StudioMannequinJointSection({
  selectedJointId,
  rotation,
  onSelectJoint,
  onRotate,
  onResetJoint,
}: {
  selectedJointId: StudioMannequinJointId | null;
  rotation: StudioMannequinVec3;
  onSelectJoint: (jointId: StudioMannequinJointId) => void;
  onRotate: (rotation: StudioMannequinVec3) => void;
  onResetJoint: () => void;
}): ReactElement {
  const jointLimit = selectedJointId ? getStudioMannequinJointLimit(selectedJointId) : null;
  const axes: readonly { axis: 0 | 1 | 2; label: string; range: readonly [number, number] }[] =
    jointLimit
      ? [
          { axis: 0, label: "X 회전", range: jointLimit.x },
          { axis: 1, label: "Y 회전", range: jointLimit.y },
          { axis: 2, label: "Z 회전", range: jointLimit.z },
        ]
      : [];
  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="관절"
        description="뷰포트에서 몸을 클릭하거나 아래에서 관절을 고르세요. 손·발 핸들 드래그 = IK."
        action={
          selectedJointId ? (
            <button
              type="button"
              onClick={onResetJoint}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
              title="선택한 관절 회전 초기화"
            >
              <RotateCcw size={13} aria-hidden /> 초기화
            </button>
          ) : undefined
        }
      />
      <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
        관절 선택
        <select
          value={selectedJointId ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            if (next) onSelectJoint(next as StudioMannequinJointId);
          }}
          aria-label="편집할 관절 선택"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-card px-2 text-[0.72rem] text-fg outline-none focus:border-accent/60 pointer-coarse:min-h-11"
        >
          <option value="" disabled>
            관절을 선택하세요
          </option>
          {STUDIO_MANNEQUIN_JOINT_IDS.map((jointId) => (
            <option key={jointId} value={jointId}>
              {STUDIO_MANNEQUIN_JOINT_LABELS[jointId]}
            </option>
          ))}
        </select>
      </label>
      {selectedJointId && jointLimit ? (
        <div className="space-y-2">
          {axes.map(({ axis, label, range }) => (
            <StudioSliderRow
              key={axis}
              label={label}
              min={Math.round(range[0] * RAD_TO_DEG)}
              max={Math.round(range[1] * RAD_TO_DEG)}
              step={1}
              value={Math.round(rotation[axis] * RAD_TO_DEG)}
              onChange={(nextDeg) => {
                const next: [number, number, number] = [rotation[0], rotation[1], rotation[2]];
                next[axis] = nextDeg * DEG_TO_RAD;
                onRotate(next);
              }}
              readout={`${Math.round(rotation[axis] * RAD_TO_DEG)}°`}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line/70 bg-card/60 p-3 text-[0.7rem] leading-relaxed text-fg-3">
          선택된 관절이 없습니다. 뷰포트의 마네킹을 클릭하면 해당 부위 관절이 선택됩니다.
        </p>
      )}
    </div>
  );
}

export function StudioMannequinCameraSection({
  projection,
  onProjectionChange,
  captureScale,
  onCaptureScaleChange,
  onCameraPreset,
  onResetCamera,
  onCapture,
  capturing,
  webcamActive,
  webcamLoading,
  webcamError,
  onToggleWebcam,
  poseFrozen = false,
  onTogglePoseFreeze,
  mirrorMode = true,
  onToggleMirrorMode,
  fingerTracking = true,
  onToggleFingerTracking,
  facialTracking = true,
  onToggleFacialTracking,
}: {
  projection: StudioMannequinProjection;
  onProjectionChange: (projection: StudioMannequinProjection) => void;
  captureScale: number;
  onCaptureScaleChange: (scale: number) => void;
  onCameraPreset: (preset: "front" | "side" | "back" | "top" | "high" | "low") => void;
  onResetCamera: () => void;
  onCapture: () => void;
  capturing: boolean;
  webcamActive: boolean;
  webcamLoading: boolean;
  webcamError: string | null;
  onToggleWebcam: () => void;
  poseFrozen?: boolean;
  onTogglePoseFreeze?: () => void;
  mirrorMode?: boolean;
  onToggleMirrorMode?: () => void;
  fingerTracking?: boolean;
  onToggleFingerTracking?: () => void;
  facialTracking?: boolean;
  onToggleFacialTracking?: () => void;
}): ReactElement {
  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="카메라·캡처"
        description="드래그 = 회전, 휠 = 줌, 우클릭 드래그 = 이동."
        action={
          <button
            type="button"
            onClick={onResetCamera}
            className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
            title="카메라 초기 위치로"
          >
            <RotateCcw size={13} aria-hidden /> 리셋
          </button>
        }
      />
      <div className="space-y-1">
        <span className="text-xs text-fg-2">실시간 웹캠 동작 인식 (Live Motion Tracking)</span>
        <button
          type="button"
          onClick={onToggleWebcam}
          aria-pressed={webcamActive}
          aria-busy={webcamLoading}
          className={buttonClass({
            size: "sm",
            variant: webcamActive ? "solid" : "quiet",
            className: "w-full justify-center gap-1.5",
          })}
        >
          {webcamLoading ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <Video size={13} aria-hidden />
          )}
          {webcamLoading
            ? "동작 인식 준비 취소"
            : webcamActive
              ? "실시간 동작 인식 중지"
              : webcamError
                ? "웹캠 동작 인식 다시 시도"
                : "웹캠 실시간 동작 인식 시작"}
        </button>

        {webcamLoading ? (
          <p role="status" className="mt-1 text-[0.7rem] leading-relaxed text-fg-3">
            동작 인식 엔진과 카메라를 준비하고 있습니다. 처음에는 잠시 걸릴 수 있습니다.
          </p>
        ) : null}

        {webcamActive && (
          <div className="grid grid-cols-2 gap-1 pt-1.5" role="group" aria-label="모션 캡처 옵션">
            <button
              type="button"
              onClick={onTogglePoseFreeze}
              className={buttonClass({
                size: "sm",
                variant: poseFrozen ? "solid" : "quiet",
                className: "text-[0.7rem] justify-center gap-1",
              })}
            >
              {poseFrozen ? "🔒 포즈 고정됨" : "🔓 포즈 고정"}
            </button>
            <button
              type="button"
              onClick={onToggleMirrorMode}
              className={buttonClass({
                size: "sm",
                variant: mirrorMode ? "solid" : "quiet",
                className: "text-[0.7rem] justify-center gap-1",
              })}
            >
              {mirrorMode ? "↔️ 좌우 반전 ON" : "↔️ 좌우 반전"}
            </button>
            <button
              type="button"
              onClick={onToggleFingerTracking}
              className={buttonClass({
                size: "sm",
                variant: fingerTracking ? "solid" : "quiet",
                className: "text-[0.7rem] justify-center gap-1",
              })}
            >
              {fingerTracking ? "🖐️ 손가락 솔버 ON" : "🖐️ 손가락 솔버"}
            </button>
            <button
              type="button"
              onClick={onToggleFacialTracking}
              className={buttonClass({
                size: "sm",
                variant: facialTracking ? "solid" : "quiet",
                className: "text-[0.7rem] justify-center gap-1",
              })}
            >
              {facialTracking ? "😀 표정 맵핑 ON" : "😀 표정 맵핑"}
            </button>
          </div>
        )}

        {webcamError ? (
          <p role="alert" className="mt-1 text-[0.7rem] leading-relaxed text-rose-500">
            {webcamError}
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <span className="text-xs text-fg-2">카메라 앵글 프리셋</span>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="카메라 앵글">
          {[
            { id: "front", label: "정면" },
            { id: "side", label: "측면" },
            { id: "back", label: "후면" },
            { id: "top", label: "탑뷰" },
            { id: "high", label: "하이앵글" },
            { id: "low", label: "로우앵글" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onCameraPreset(item.id as "front" | "side" | "back" | "top" | "high" | "low")}
              className={buttonClass({ size: "sm", variant: "quiet", className: "text-[0.7rem]" })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="투영 방식">
        <StudioToggleChip
          active={projection === "perspective"}
          onClick={() => onProjectionChange("perspective")}
        >
          원근
        </StudioToggleChip>
        <StudioToggleChip
          active={projection === "orthographic"}
          onClick={() => onProjectionChange("orthographic")}
        >
          직교
        </StudioToggleChip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="캡처 배율">
        <span className="text-xs text-fg-2">캡처 배율</span>
        {CAPTURE_SCALES.map((scale) => (
          <StudioToggleChip
            key={scale}
            active={captureScale === scale}
            onClick={() => onCaptureScaleChange(scale)}
          >
            {scale}x
          </StudioToggleChip>
        ))}
      </div>
      <button
        type="button"
        onClick={onCapture}
        disabled={capturing}
        className={buttonClass({ size: "md", variant: "solid", className: "w-full gap-1.5" })}
      >
        {capturing ? (
          <Loader2 size={15} className="animate-spin" aria-hidden />
        ) : (
          <Camera size={15} aria-hidden />
        )}
        캔버스로 캡처
      </button>
    </div>
  );
}

// ── 패널 본체 ────────────────────────────────────────────────────────────────

export function StudioMannequinPoserPanel({
  open,
  onClose,
  onInsert,
}: StudioMannequinPoserPanelProps): ReactElement | null {
  const dialogTitleId = useId();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<StudioMannequinSceneHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const [params, setParams] = useState<StudioMannequinBodyParams>(
    STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  );
  const [pose, setPose] = useState<StudioMannequinPose>(createStudioMannequinRestPose);
  const [materialStyle, setMaterialStyle] = useState<StudioMannequinMaterialStyle>("wood");
  const [poseCategory, setPoseCategory] = useState<StudioMannequinPoseCategory | "all">("all");
  const [tab, setTab] = useState<MannequinTabId>("pose");
  const [selectedJointId, setSelectedJointId] = useState<StudioMannequinJointId | null>(null);
  const [projection, setProjection] = useState<StudioMannequinProjection>("perspective");
  const [captureScale, setCaptureScale] = useState<number>(2);
  const [capturing, setCapturing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);

  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamLoading, setWebcamLoading] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [poseFrozen, setPoseFrozen] = useState(false);
  const [mirrorMode, setMirrorMode] = useState(true);
  const [fingerTracking, setFingerTracking] = useState(true);
  const [facialTracking, setFacialTracking] = useState(true);

  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const webcamLandmarkerRef = useRef<StudioMannequinPoseLandmarker | null>(null);
  const webcamFrameRef = useRef<number | null>(null);
  const webcamAbortControllerRef = useRef<AbortController | null>(null);
  const webcamSessionRef = useRef(0);
  const webcamActiveRef = useRef(false);
  const webcamLoadingRef = useRef(false);
  const poseFrozenRef = useRef(false);
  const mirrorModeRef = useRef(true);
  webcamActiveRef.current = webcamActive;
  webcamLoadingRef.current = webcamLoading;
  poseFrozenRef.current = poseFrozen;
  mirrorModeRef.current = mirrorMode;

  const releaseWebcamResources = useCallback(() => {
    webcamSessionRef.current += 1;
    webcamActiveRef.current = false;
    webcamLoadingRef.current = false;

    webcamAbortControllerRef.current?.abort();
    webcamAbortControllerRef.current = null;

    if (webcamFrameRef.current !== null) {
      cancelAnimationFrame(webcamFrameRef.current);
      webcamFrameRef.current = null;
    }

    const video = webcamVideoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // Some embedded browsers do not expose pause() until metadata has loaded.
      }
      video.srcObject = null;
    }

    const stream = webcamStreamRef.current;
    webcamStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    webcamLandmarkerRef.current = null;
    disposeStudioMannequinPoseLandmarker();
  }, []);

  const stopWebcam = useCallback(() => {
    releaseWebcamResources();
    setWebcamActive(false);
    setWebcamLoading(false);
    setWebcamError(null);
  }, [releaseWebcamResources]);

  const handleToggleWebcam = useCallback(async () => {
    if (webcamActiveRef.current || webcamLoadingRef.current) {
      stopWebcam();
      return;
    }

    const session = webcamSessionRef.current + 1;
    webcamSessionRef.current = session;
    const abortController = new AbortController();
    webcamAbortControllerRef.current = abortController;
    webcamLoadingRef.current = true;
    let failureStage: StudioMannequinWebcamErrorStage = "camera";

    try {
      setWebcamLoading(true);
      setWebcamError(null);

      if (window.isSecureContext === false) {
        throw createWebcamPreflightError(
          "StudioMannequinInsecureContextError",
          "Camera access requires a secure context.",
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw createWebcamPreflightError(
          "StudioMannequinCameraUnavailableError",
          "navigator.mediaDevices.getUserMedia is unavailable.",
        );
      }

      failureStage = "engine";
      const landmarker = await initStudioMannequinPoseLandmarker({
        signal: abortController.signal,
      });
      if (webcamSessionRef.current !== session || abortController.signal.aborted) return;

      failureStage = "camera";
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: { ideal: "user" },
        },
      });
      if (webcamSessionRef.current !== session || abortController.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      webcamStreamRef.current = stream;
      const video = webcamVideoRef.current;
      if (!video) {
        throw createWebcamPreflightError(
          "StudioMannequinCameraUnavailableError",
          "The webcam preview element is unavailable.",
        );
      }

      video.srcObject = stream;
      await video.play();
      if (webcamSessionRef.current !== session || abortController.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        return;
      }

      webcamLandmarkerRef.current = landmarker;
      webcamActiveRef.current = true;
      webcamLoadingRef.current = false;
      setWebcamActive(true);
    } catch (cause) {
      if (
        webcamSessionRef.current !== session
        || abortController.signal.aborted
        || isStudioMannequinWebcamAbortError(cause)
      ) {
        return;
      }

      console.warn(`Studio mannequin webcam ${failureStage} initialization failed:`, cause);
      releaseWebcamResources();
      setWebcamActive(false);
      setWebcamLoading(false);
      setWebcamError(getStudioMannequinWebcamErrorMessage(failureStage, cause));
    } finally {
      if (webcamSessionRef.current === session) {
        webcamLoadingRef.current = false;
        setWebcamLoading(false);
      }
    }
  }, [releaseWebcamResources, stopWebcam]);

  useEffect(() => {
    if (!open) stopWebcam();
  }, [open, stopWebcam]);

  useEffect(() => () => releaseWebcamResources(), [releaseWebcamResources]);

  const poseRef = useRef(pose);
  poseRef.current = pose;

  useEffect(() => {
    if (!webcamActive) return;
    let lastVideoTime = -1;

    const loop = () => {
      if (!webcamActiveRef.current) return;
      try {
        const video = webcamVideoRef.current;
        const landmarker = webcamLandmarkerRef.current;
        if (
          !poseFrozenRef.current
          && video
          && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          && video.currentTime !== lastVideoTime
          && landmarker
        ) {
          lastVideoTime = video.currentTime;
          const detection = landmarker.detectForVideo(video, performance.now());
          try {
            if (detection.landmarks && detection.landmarks[0]) {
              const rawJoints = solvePoseToMannequinJoints(detection.landmarks[0], {
                mirrorMode: mirrorModeRef.current,
                smoothing: 0.35,
              });
              const smoothedJoints = smoothMannequinJointRotations(
                poseRef.current.joints,
                rawJoints,
                0.35,
              );
              const updatedPose: StudioMannequinPose = {
                ...poseRef.current,
                joints: {
                  ...poseRef.current.joints,
                  ...smoothedJoints,
                },
              };
              poseRef.current = updatedPose;
              setPose(updatedPose);
              sceneRef.current?.setPose(updatedPose);
            }
          } finally {
            detection.close?.();
          }
        }
      } catch (cause) {
        console.warn("Studio mannequin webcam frame analysis failed:", cause);
        releaseWebcamResources();
        setWebcamActive(false);
        setWebcamLoading(false);
        setWebcamError(getStudioMannequinWebcamErrorMessage("tracking", cause));
        return;
      }

      webcamFrameRef.current = requestAnimationFrame(loop);
    };
    webcamFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (webcamFrameRef.current !== null) {
        cancelAnimationFrame(webcamFrameRef.current);
        webcamFrameRef.current = null;
      }
    };
  }, [releaseWebcamResources, webcamActive]);

  const spec = useMemo(() => buildStudioMannequinSpec(params), [params]);

  const poseFromSceneRef = useRef(false);
  const stateRef = useRef({ params, pose });
  stateRef.current = { params, pose };

  const persistState = useCallback(() => {
    try {
      localStorage.setItem(
        STUDIO_MANNEQUIN_STATE_STORAGE_KEY,
        serializeStudioMannequinState(stateRef.current),
      );
    } catch {
      // 저장 실패 조용히 무시
    }
  }, []);

  const closeWithPersist = useCallback(() => {
    persistState();
    onClose();
  }, [onClose, persistState]);

  useEffect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem(STUDIO_MANNEQUIN_STATE_STORAGE_KEY);
      const parsed = parseStudioMannequinState(stored);
      if (parsed) {
        setParams(parsed.params);
        setPose(parsed.pose);
      }
    } catch {
      // 로드 에러 시 기본값 유지
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const container = viewportRef.current;
    if (!container) return;

    let handle: StudioMannequinSceneHandle;
    try {
      handle = createStudioMannequinScene({
        container,
        initialSpec: buildStudioMannequinSpec(stateRef.current.params),
        initialPose: stateRef.current.pose,
        onSelectJoint: (jointId) => setSelectedJointId(jointId),
        onPoseEdited: (editedPose) => {
          poseFromSceneRef.current = true;
          setPose(editedPose);
        },
      });
      sceneRef.current = handle;
      setSceneError(null);
    } catch (cause) {
      setSceneError(getErrorText(cause, "3D 데생 인형 씬을 초기화하지 못했습니다. WebGL 지원을 확인하세요."));
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      handle.resize(width, height);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      sceneRef.current = null;
      handle.dispose();
    };
  }, [open]);

  useEffect(() => {
    sceneRef.current?.setBodySpec(spec);
  }, [spec]);

  useEffect(() => {
    if (poseFromSceneRef.current) {
      poseFromSceneRef.current = false;
      return;
    }
    sceneRef.current?.setPose(pose);
  }, [pose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || capturing) return;
      event.preventDefault();
      closeWithPersist();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, capturing, closeWithPersist]);

  const applyPosePreset = useCallback((presetId: string) => {
    const preset = STUDIO_MANNEQUIN_POSE_PRESETS.find((entry) => entry.id === presetId);
    if (preset) setPose(normalizeStudioMannequinPose(preset.pose));
  }, []);

  const handleRotateSelected = useCallback(
    (rotation: StudioMannequinVec3) => {
      if (!selectedJointId) return;
      const clamped = clampStudioMannequinJointRotation(selectedJointId, rotation);
      setPose((previous) =>
        normalizeStudioMannequinPose({
          joints: { ...previous.joints, [selectedJointId]: clamped },
          pelvisOffset: previous.pelvisOffset,
        }),
      );
    },
    [selectedJointId],
  );

  const handleExportJson = useCallback(() => {
    const json = exportStudioMannequinStateToJSON(stateRef.current);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toonspectrum-mannequin-${Date.now()}.mannequin`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportJson = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      const imported = importStudioMannequinStateFromJSON(content);
      if (imported) {
        setParams(imported.params);
        setPose(imported.pose);
        setError(null);
      } else {
        setError("유효하지 않은 데생 인형 JSON 파일입니다.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, []);

  const handleCopyShareLink = useCallback(() => {
    const hash = encodeStudioMannequinShareHash(stateRef.current);
    const fullUrl = `${window.location.origin}${window.location.pathname}${hash}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, []);

  const handlePhotoPoseScan = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const plan = createStudioMannequinPhotoPoseApplyPlan({
      joints: {
        leftUpperArm: [-0.4, 0, 0.8],
        rightUpperArm: [-0.4, 0, -0.8],
        leftLowerArm: [-0.6, 0, 0],
        rightLowerArm: [-0.6, 0, 0],
        spine: [0.1, 0, 0],
      },
    });
    setPose(plan.pose);
    event.target.value = "";
  }, []);

  const handleCapture = useCallback(() => {
    const handle = sceneRef.current;
    if (!handle || capturing) return;
    setCapturing(true);
    setError(null);
    void (async () => {
      try {
        const result = await handle.captureDataUrl(captureScale);
        const accepted = await onInsert(result);
        if (accepted === false) {
          throw new Error("편집 중 문서가 바뀌어 캡처를 삽입하지 않았습니다. 현재 페이지에서 다시 시도해 주세요.");
        }
        persistState();
        onClose();
      } catch (cause) {
        setError(getErrorText(cause, "3D 데생 인형 캡처를 추가하지 못했습니다."));
      } finally {
        setCapturing(false);
      }
    })();
  }, [captureScale, capturing, onClose, onInsert, persistState]);

  if (!open) return null;

  const selectedRotation: StudioMannequinVec3 = selectedJointId
    ? pose.joints[selectedJointId] ?? [0, 0, 0]
    : [0, 0, 0];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      data-studio-mannequin-dialog="true"
      className="fixed inset-0 z-[80] isolate flex flex-col overflow-hidden overscroll-none bg-[oklch(0.08_0.01_70/0.86)] p-2 text-fg backdrop-blur-sm sm:p-4"
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".mannequin,.json"
        className="hidden"
        onChange={handleImportJson}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoPoseScan}
      />

      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <h2 id={dialogTitleId} className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
              <PersonStanding size={16} className="text-accent" aria-hidden />
              3D 데생 인형
            </h2>
            <div className="hidden items-center gap-1 sm:flex">
              <button
                type="button"
                onClick={handleExportJson}
                className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
                title="포즈 및 체형 JSON 다운로드"
              >
                <Download size={13} aria-hidden /> 내보내기
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
                title="JSON 포즈 파일 불러오기"
              >
                <Upload size={13} aria-hidden /> 가져오기
              </button>
              <button
                type="button"
                onClick={handleCopyShareLink}
                className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
                title="공유 해시 URL 복사"
              >
                {copiedLink ? <Check size={13} className="text-accent" /> : <Share2 size={13} />}
                공유
              </button>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
                title="사진/동작 인식으로 포즈 맞추기"
              >
                <ImageIcon size={13} aria-hidden /> 동작 인식
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={closeWithPersist}
            className={buttonClass({ size: "icon", variant: "quiet" })}
            aria-label="3D 데생 인형 닫기"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* 뷰포트 */}
          <div className="relative min-h-0 flex-1 basis-1/2 bg-[radial-gradient(circle_at_50%_30%,oklch(0.24_0.012_68),oklch(0.14_0.01_70))]">
            {sceneError ? (
              <div className="grid h-full place-items-center p-6 text-center">
                <div className="max-w-xs space-y-2">
                  <AlertTriangle size={22} className="mx-auto text-warn" aria-hidden />
                  <p className="text-xs leading-relaxed text-fg-2">{sceneError}</p>
                </div>
              </div>
            ) : (
              <div
                ref={viewportRef}
                className="h-full w-full"
                data-studio-mannequin-viewport="true"
                aria-label="3D 데생 인형 뷰포트 — 몸 클릭으로 관절 선택, 손·발 핸들 드래그로 IK 포즈"
              />
            )}
            {error ? (
              <p
                role="alert"
                className="absolute inset-x-3 bottom-3 rounded-lg border border-warn/40 bg-panel/95 px-3 py-2 text-[0.72rem] leading-relaxed text-warn shadow-lg"
              >
                {error}
              </p>
            ) : null}
          </div>

          {/* 컨트롤 */}
          <aside className="flex min-h-0 w-full flex-col border-t border-line/70 md:w-[320px] md:border-l md:border-t-0">
            <nav className="flex gap-1 border-b border-line/60 p-2" aria-label="데생 인형 설정 탭">
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-pressed={tab === entry.id}
                  className={cn(studioSegmentChipClass(tab === entry.id), "gap-1")}
                >
                  {entry.icon}
                  {entry.label}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {tab === "body" ? (
                <StudioMannequinBodySection
                  params={params}
                  materialStyle={materialStyle}
                  onParamsChange={setParams}
                  onApplyPreset={(presetId) =>
                    setParams(STUDIO_MANNEQUIN_BODY_PRESETS[presetId].params)
                  }
                  onMaterialStyleChange={(style) => {
                    setMaterialStyle(style);
                    sceneRef.current?.setMaterialStyle(style);
                  }}
                />
              ) : null}
              {tab === "pose" ? (
                <StudioMannequinPoseSection
                  selectedCategory={poseCategory}
                  onCategorySelect={setPoseCategory}
                  onApplyPreset={applyPosePreset}
                  onMirror={() => setPose((previous) => mirrorStudioMannequinPose(previous))}
                  onResetJoints={() => setPose(createStudioMannequinRestPose())}
                />
              ) : null}
              {tab === "joint" ? (
                <StudioMannequinJointSection
                  selectedJointId={selectedJointId}
                  rotation={selectedRotation}
                  onSelectJoint={(jointId) => {
                    setSelectedJointId(jointId);
                    sceneRef.current?.selectJoint(jointId);
                  }}
                  onRotate={handleRotateSelected}
                  onResetJoint={() => handleRotateSelected([0, 0, 0])}
                />
              ) : null}
              {tab === "camera" ? (
                <StudioMannequinCameraSection
                  projection={projection}
                  onProjectionChange={(next) => {
                    setProjection(next);
                    sceneRef.current?.setProjection(next);
                  }}
                  captureScale={captureScale}
                  onCaptureScaleChange={setCaptureScale}
                  onCameraPreset={(preset) => sceneRef.current?.setCameraPreset(preset)}
                  onResetCamera={() => sceneRef.current?.resetCamera()}
                  onCapture={handleCapture}
                  capturing={capturing}
                  webcamActive={webcamActive}
                  webcamLoading={webcamLoading}
                  webcamError={webcamError}
                  onToggleWebcam={handleToggleWebcam}
                  poseFrozen={poseFrozen}
                  onTogglePoseFreeze={() => setPoseFrozen((prev) => !prev)}
                  mirrorMode={mirrorMode}
                  onToggleMirrorMode={() => setMirrorMode((prev) => !prev)}
                  fingerTracking={fingerTracking}
                  onToggleFingerTracking={() => setFingerTracking((prev) => !prev)}
                  facialTracking={facialTracking}
                  onToggleFacialTracking={() => setFacialTracking((prev) => !prev)}
                />
              ) : null}
              <video ref={webcamVideoRef} className="hidden" playsInline muted />
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
