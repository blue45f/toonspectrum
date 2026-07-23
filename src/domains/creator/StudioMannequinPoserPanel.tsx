/**
 * Studio 3D 데생 인형 포저 패널.
 *
 * 클립스튜디오 데생 인형처럼 외부 모델 파일 없이 절차 생성 마네킹을 체형·포즈·관절·카메라
 * 4개 섹션으로 다루고, 결과를 PNG data URL 로 캔버스에 삽입한다(onInsert 콜백).
 *
 * 구조: 상태(체형 파라미터·포즈·탭)는 완전 제어 React 상태, Three 씬 자체는 ref 의
 * 임페러티브 핸들(studio-mannequin-scene)로 관리한다 — VRM 포저와 같은 분리 규약.
 * 렌더는 씬의 invalidate() on-demand 1프레임 rAF 라 패널이 닫히면(dispose) 완전히 멈춘다.
 * 마지막 체형/포즈는 localStorage(버전드 계약)에만 저장한다 — 프로젝트 문서 무변경.
 */

import {
  AlertTriangle,
  Camera,
  FlipHorizontal2,
  Loader2,
  PersonStanding,
  RotateCcw,
  Sliders,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_MANNEQUIN_BODY_PRESETS,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_JOINT_IDS,
  STUDIO_MANNEQUIN_JOINT_LABELS,
  STUDIO_MANNEQUIN_PARAM_RANGES,
  buildStudioMannequinSpec,
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  getStudioMannequinJointLimit,
  type StudioMannequinBodyParams,
  type StudioMannequinBodyPresetId,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  STUDIO_MANNEQUIN_POSE_PRESETS,
  STUDIO_MANNEQUIN_STATE_STORAGE_KEY,
  createStudioMannequinRestPose,
  mirrorStudioMannequinPose,
  normalizeStudioMannequinPose,
  parseStudioMannequinState,
  serializeStudioMannequinState,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  createStudioMannequinScene,
  type StudioMannequinCaptureResult,
  type StudioMannequinProjection,
  type StudioMannequinSceneHandle,
} from "./studio-mannequin-scene";
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
  open: boolean;
  onClose: () => void;
  /** false 를 반환하면 문서가 바뀐 것으로 보고 삽입을 중단한다(3D 삽입 컨트롤러 계약). */
  onInsert: (
    result: StudioMannequinCaptureResult,
  ) => boolean | void | Promise<boolean | void>;
}

type MannequinTabId = "body" | "pose" | "joint" | "camera";

const TABS: readonly { id: MannequinTabId; label: string; icon: ReactElement }[] = [
  { id: "body", label: "체형", icon: <UserRound size={13} aria-hidden /> },
  { id: "pose", label: "포즈", icon: <PersonStanding size={13} aria-hidden /> },
  { id: "joint", label: "관절", icon: <Sliders size={13} aria-hidden /> },
  { id: "camera", label: "카메라", icon: <Camera size={13} aria-hidden /> },
];

const CAPTURE_SCALES = [1, 1.5, 2] as const;

const BODY_SLIDERS: readonly {
  key: keyof StudioMannequinBodyParams;
  label: string;
  step: number;
  format: (value: number) => string;
}[] = [
  { key: "heightCm", label: "신장", step: 1, format: (v) => `${Math.round(v)}cm` },
  { key: "headCount", label: "두신 비율", step: 0.1, format: (v) => `${v.toFixed(1)}등신` },
  { key: "shoulderWidth", label: "어깨 너비", step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: "pelvisWidth", label: "골반 너비", step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: "armLength", label: "팔 길이", step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: "legLength", label: "다리 길이", step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: "build", label: "체형", step: 0.05, format: formatBuildReadout },
];

function formatBuildReadout(value: number): string {
  if (value < 0.5) return "마른";
  if (value < 1.5) return "표준";
  if (value < 2.5) return "근육";
  return "통통";
}

function getErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

// ── 순수 컨트롤 서브컴포넌트(테스트는 이들을 격리 렌더링한다) ────────────────

export function StudioMannequinBodySection({
  params,
  onParamsChange,
  onApplyPreset,
}: {
  params: StudioMannequinBodyParams;
  onParamsChange: (next: StudioMannequinBodyParams) => void;
  onApplyPreset: (presetId: StudioMannequinBodyPresetId) => void;
}): ReactElement {
  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="체형"
        description="신장·두신 비율·비례를 조절합니다. 포즈는 유지됩니다."
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
      <div className="space-y-2">
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
  onApplyPreset,
  onMirror,
  onResetJoints,
}: {
  onApplyPreset: (presetId: string) => void;
  onMirror: () => void;
  onResetJoints: () => void;
}): ReactElement {
  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="포즈"
        description="프리셋을 고르고 뷰포트에서 손·발 핸들을 드래그해 다듬으세요."
        action={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onMirror}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
              title="포즈 좌우 반전"
            >
              <FlipHorizontal2 size={13} aria-hidden /> 미러
            </button>
            <button
              type="button"
              onClick={onResetJoints}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
              title="모든 관절 초기화"
            >
              <RotateCcw size={13} aria-hidden /> 초기화
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="포즈 프리셋">
        {STUDIO_MANNEQUIN_POSE_PRESETS.map((preset) => (
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
  onResetCamera,
  onCapture,
  capturing,
}: {
  projection: StudioMannequinProjection;
  onProjectionChange: (projection: StudioMannequinProjection) => void;
  captureScale: number;
  onCaptureScaleChange: (scale: number) => void;
  onResetCamera: () => void;
  onCapture: () => void;
  capturing: boolean;
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

  const [params, setParams] = useState<StudioMannequinBodyParams>(
    STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  );
  const [pose, setPose] = useState<StudioMannequinPose>(createStudioMannequinRestPose);
  const [tab, setTab] = useState<MannequinTabId>("pose");
  const [selectedJointId, setSelectedJointId] = useState<StudioMannequinJointId | null>(null);
  const [projection, setProjection] = useState<StudioMannequinProjection>("perspective");
  const [captureScale, setCaptureScale] = useState<number>(2);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);

  const spec = useMemo(() => buildStudioMannequinSpec(params), [params]);

  // 씬발 포즈 갱신을 다시 씬으로 반사하지 않기 위한 가드.
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
      // 저장 실패(사파리 프라이빗 모드 등)는 조용히 무시 — 세션 로컬 값은 유지된다.
    }
  }, []);

  const closeWithPersist = useCallback(() => {
    persistState();
    onClose();
  }, [onClose, persistState]);

  // 열릴 때 마지막 체형/포즈 복원(버전드 방어 파서 — 깨진 값은 기본값).
  useEffect(() => {
    if (!open) return;
    try {
      const stored = parseStudioMannequinState(
        localStorage.getItem(STUDIO_MANNEQUIN_STATE_STORAGE_KEY),
      );
      if (stored) {
        setParams(stored.params);
        setPose(stored.pose);
      }
    } catch {
      // 저장소 접근 실패 시 기본값 유지.
    }
  }, [open]);

  // 씬 수명주기 — 패널이 닫히면 dispose 로 rAF·GPU 자원이 전부 정리된다.
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
        onSelectJoint: (jointId) => {
          setSelectedJointId(jointId);
          if (jointId) setTab("joint");
        },
        onPoseEdited: (nextPose) => {
          poseFromSceneRef.current = true;
          setPose(nextPose);
        },
      });
    } catch (cause) {
      setSceneError(getErrorText(cause, "3D 뷰포트를 초기화하지 못했습니다. WebGL 지원을 확인해 주세요."));
      return;
    }
    sceneRef.current = handle;
    setSceneError(null);
    const observer = new ResizeObserver(() => {
      handle.resize(container.clientWidth, container.clientHeight);
    });
    observer.observe(container);
    handle.resize(container.clientWidth, container.clientHeight);
    return () => {
      observer.disconnect();
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

  // ESC 로 닫기(캡처 중에는 무시).
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
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
          <h2 id={dialogTitleId} className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <PersonStanding size={16} className="text-accent" aria-hidden />
            3D 데생 인형
          </h2>
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
          <aside className="flex min-h-0 w-full flex-col border-t border-line/70 md:w-[300px] md:border-l md:border-t-0">
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
                  onParamsChange={setParams}
                  onApplyPreset={(presetId) =>
                    setParams(STUDIO_MANNEQUIN_BODY_PRESETS[presetId].params)
                  }
                />
              ) : null}
              {tab === "pose" ? (
                <StudioMannequinPoseSection
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
                  onResetCamera={() => sceneRef.current?.resetCamera()}
                  onCapture={handleCapture}
                  capturing={capturing}
                />
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
