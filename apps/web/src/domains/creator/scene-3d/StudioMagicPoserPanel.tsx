/**
 * Magic Poser 패널 (MP1–MP8 UI 연결).
 *
 * 순수 로직으로만 존재하던 Magic Poser 벤치마크 모듈들을 실제 3D 씬에 연결하는
 * 패널입니다. `scene`에 데생 인형 씬 핸들(구조적 부분집합)을 넘기면 포즈·손·
 * 카메라 등을 즉시 적용하고, VRM 표정은 `onApplyExpression` 콜백으로 전달합니다.
 *
 * - MP1: 손 프리셋 50종 갤러리 + 손가락 컬 슬라이더 + 좌우 미러
 * - MP2: 포즈 강도 슬라이더(중립↔프리셋 블렌딩)
 * - MP3: 라이팅 스튜디오(조명 3종·시간대 프리셋·그림자·LT 명암 힌트)
 * - MP4: 카메라 북마크 저장·복원 + FOV 슬라이더
 * - MP5: 신체 모프(근육·체지방·슬림) + 두신 프리셋 4종
 * - MP6: 포즈 복제(깊은 복사·붙여넣기)
 * - MP7: 조작 핸들 가이드 4종(한국어 툴팁)
 * - MP8: VRM 표정 블렌드셰이프 콤보·강도
 */

import { useMemo, useRef, useState, type ReactElement } from "react";
import { Hand, Pin, Redo2, Undo2 } from "lucide-react";

import {
  StudioPanelChip,
  StudioSectionHeader,
  StudioSliderRow,
  StudioToggleChip,
} from "../studio-panel-ui";
import { StudioPoseFirstRunGuide } from "./StudioPoseFirstRunGuide";
import {
  createStudioPoseHistory,
  describeStudioPoseHistory,
  redoStudioPoseHistory,
  recordStudioPoseHistory,
  undoStudioPoseHistory,
  type StudioPoseHistory,
} from "./studio-pose-history";
import {
  clearMannequinHandPresetRecent,
  readMannequinHandPresetFavorites,
  readMannequinHandPresetRecent,
  recordMannequinHandPresetRecent,
  toggleMannequinHandPresetFavorite,
} from "./studio-mannequin-hand-preset-storage";
import type {
  StudioMannequinJointId,
  StudioMannequinVec3,
} from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";
import {
  STUDIO_HAND_FINGER_ORDER,
  STUDIO_HAND_PRESET_CATEGORIES,
  STUDIO_MANNEQUIN_HAND_PRESETS,
  applyStudioMannequinHandPreset,
  applyStudioMannequinHandPresetMirrored,
  clampStudioHandCurlValue,
  filterStudioMannequinHandPresets,
  getStudioMannequinHandPreset,
  type StudioHandFingerCurl,
  type StudioHandFingerName,
  type StudioHandPresetCategory,
  type StudioMannequinHandPreset,
  type StudioMannequinHandSide,
} from "./studio-mannequin-hand-presets";
import {
  STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS,
  applyStudioMannequinTimeOfDay,
  createStudioMannequinLightingRig,
  setStudioMannequinShadows,
  studioMannequinLightingToToneHint,
  type StudioMannequinLightingRig,
  type StudioMannequinTimeOfDay,
} from "./studio-mannequin-lighting";
import {
  STUDIO_CAMERA_FOV_MAX,
  STUDIO_CAMERA_FOV_MIN,
  addStudioCameraBookmark,
  applyStudioCameraBookmark,
  clampStudioCameraFov,
  createStudioCameraBookmark,
  findStudioCameraBookmark,
  removeStudioCameraBookmark,
  type StudioCameraBookmark,
} from "./studio-camera-bookmarks";
import {
  STUDIO_BODY_MORPH_RANGE,
  STUDIO_HEAD_RATIO_PRESETS,
  clampStudioBodyMorphValue,
  type StudioBodyMorph,
  type StudioHeadRatioPresetId,
} from "./studio-body-morphs";
import {
  applyStudioPoseIntensity,
  clampStudioPoseIntensity,
  STUDIO_POSE_INTENSITY_MAX,
  STUDIO_POSE_INTENSITY_MIN,
} from "./studio-pose-intensity";
import { cloneStudioMannequinPose } from "./studio-pose-clone";
import { STUDIO_MANNEQUIN_HANDLE_GUIDES } from "./studio-handle-guides";
import {
  STUDIO_VRM_EXPRESSION_COMBOS,
  applyStudioVrmExpressionIntensity,
  findStudioVrmExpressionCombo,
  type StudioVrmExpressionWeights,
} from "./studio-vrm-expressions";
import {
  convertWebtoonPresetToMannequinPose,
} from "./studio-webtoon-pose-mannequin-adapter";
import { getWebtoonPosePresetById } from "./studio-3d-advanced-poses-library";
import { StudioWebtoonPosePresetGrid } from "./StudioWebtoonPosePresetGrid";

import { cn } from "@/shared/lib/utils";

/** 데생 인형 씬 핸들의 구조적 부분집합. 실제 핸들을 그대로 넘기면 됩니다. */
export interface StudioMagicPoserScene {
  readonly setPose: (pose: StudioMannequinPose) => void;
  readonly getPose: () => StudioMannequinPose;
  readonly setJointRotation: (
    jointId: StudioMannequinJointId,
    rotation: StudioMannequinVec3,
  ) => void;
}

export interface StudioMagicPoserPanelProps {
  /** 3D 씬 핸들. 없으면 빈 상태(안내)를 표시합니다. */
  readonly scene?: StudioMagicPoserScene | null;
  /** VRM 표정 적용 요청(MP8). VRM 런타임이 이 스펙을 읽어 블렌드셰이프에 적용합니다. */
  readonly onApplyExpression?: (
    comboId: string,
    weights: StudioVrmExpressionWeights,
  ) => void;
  /** 신체 모프 변경(MP5). 호스트가 applyStudioBodyMorph로 체형에 반영합니다. */
  readonly onBodyMorphChange?: (morph: StudioBodyMorph) => void;
  /**
   * 카메라 북마크 불러오기(MP4). 호스트가 북마크의 position/target을 씬 카메라에
   * 반영합니다. 없으면 FOV만 패널 내부 상태로 복원됩니다.
   */
  readonly onApplyCameraBookmark?: (bookmark: StudioCameraBookmark) => void;
  readonly className?: string;
}

type MagicPoserTab =
  | "pose"
  | "hand"
  | "lighting"
  | "camera"
  | "body"
  | "clone"
  | "guides"
  | "expression";

const TABS: readonly { id: MagicPoserTab; label: string }[] = [
  { id: "pose", label: "포즈" },
  { id: "hand", label: "손" },
  { id: "lighting", label: "조명" },
  { id: "camera", label: "카메라" },
  { id: "body", label: "체형" },
  { id: "clone", label: "복제" },
  { id: "guides", label: "핸들" },
  { id: "expression", label: "표정" },
];

const FINGER_LABELS: Record<StudioHandFingerName, string> = {
  thumb: "엄지",
  index: "검지",
  middle: "중지",
  ring: "약지",
  little: "새끼",
};

const TIME_OF_DAY_ORDER: readonly StudioMannequinTimeOfDay[] = [
  "dawn",
  "noon",
  "dusk",
  "night",
];

// ── 손 프리셋 실루엣 (정면 SVG) ──────────────────────────────────────────
// 프리셋마다 "이게 어떤 손 모양인지" 10초 안에 파악할 수 있게, 손가락
// 컬(0~100)에서 그린 실루엣 미니어처다. 이미지 에셋이 없어도 동작하는
// 순수 SVG라 다크/라이트·모바일·reduced-motion 대응이 자동으로 된다.

interface HandSilhouettePoint {
  readonly x: number;
  readonly y: number;
}

function formatHandSilhouettePoints(points: readonly HandSilhouettePoint[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

interface HandFingerSpec {
  readonly base: HandSilhouettePoint;
  /** 손가락 길이 [마디1, 마디2]. */
  readonly lengths: readonly [number, number];
  /** 휴식 방향(수직 기준 deg). 손바닥 쪽(아래)으로 양수. */
  readonly restDeg: number;
}

/** 검지·중지·약지·새끼. 손바닥 정면, 손가락 위쪽. */
const HAND_FINGER_SPECS: readonly HandFingerSpec[] = [
  { base: { x: 25, y: 46 }, lengths: [9, 7.5], restDeg: -4 },
  { base: { x: 30.5, y: 44 }, lengths: [9.5, 8], restDeg: 0 },
  { base: { x: 36, y: 46 }, lengths: [9, 7.5], restDeg: 4 },
  { base: { x: 40.5, y: 49.5 }, lengths: [7.5, 6.5], restDeg: 9 },
];

/** 컬(0~100) → 마디별 굽힘 각도(deg). */
function handFingerBendAngles(curl: number): readonly [number, number] {
  const clamped = Math.min(100, Math.max(0, curl));
  return [clamped * 1.35, clamped * 0.9];
}

function bendHandPoint(from: HandSilhouettePoint, angleDeg: number, length: number): HandSilhouettePoint {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: from.x + length * Math.sin(rad),
    y: from.y - length * Math.cos(rad),
  };
}

function handFingerPoints(
  spec: HandFingerSpec,
  curl: number,
): readonly [HandSilhouettePoint, HandSilhouettePoint, HandSilhouettePoint] {
  const [bend1, bend2] = handFingerBendAngles(curl);
  const mid = bendHandPoint(spec.base, spec.restDeg + bend1, spec.lengths[0]);
  const tip = bendHandPoint(mid, spec.restDeg + bend1 + bend2, spec.lengths[1]);
  return [spec.base, mid, tip];
}

function handThumbPoints(
  curl: number,
): readonly [HandSilhouettePoint, HandSilhouettePoint, HandSilhouettePoint] {
  const base: HandSilhouettePoint = { x: 20.5, y: 63 };
  const clamped = Math.min(100, Math.max(0, curl));
  // 휴식 시 왼쪽 위(-55°)를 향하고, 구부릴수록 손바닥 쪽으로 감긴다.
  const bend1 = -55 + clamped * 0.75;
  const bend2 = bend1 + clamped * 0.55;
  const mid = bendHandPoint(base, bend1, 7);
  const tip = bendHandPoint(mid, bend2, 6.5);
  return [base, mid, tip];
}

/** 손가락 컬에서 그린 정면 손 실루엣. 주먹(100)은 감기고 펼침(0)은 펴진다. */
function StudioHandPresetSilhouette({
  label,
  curl,
  className,
}: {
  /** aria-label에 쓸 프리셋 이름. */
  readonly label: string;
  /** 손가락별 컬(0~100). 0 = 폄, 100 = 완전히 구부림. */
  readonly curl: StudioHandFingerCurl;
  readonly className?: string;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 64 88"
      className={className ?? "h-16 w-full text-fg-3"}
      role="img"
      aria-label={`${label} 손 모양 실루엣`}
    >
      {/* 손목 */}
      <line x1={27} y1={76} x2={38} y2={76} stroke="currentColor" strokeWidth={8} strokeLinecap="round" opacity={0.55} />
      {/* 손바닥 */}
      <rect x={21} y={44} width={22.5} height={30} rx={9} fill="currentColor" opacity={0.3} />
      {/* 손가락 4개 */}
      <g stroke="currentColor" strokeLinecap="round" fill="none" strokeWidth={3.2}>
        {HAND_FINGER_SPECS.map((spec, index) => (
          <polyline
            key={index}
            points={formatHandSilhouettePoints(handFingerPoints(spec, [curl.index, curl.middle, curl.ring, curl.little][index] ?? 0))}
          />
        ))}
        <polyline points={formatHandSilhouettePoints(handThumbPoints(curl.thumb))} />
      </g>
    </svg>
  );
}

function HandPresetCard({
  preset,
  pinned,
  onApply,
  onTogglePin,
}: {
  preset: StudioMannequinHandPreset;
  pinned: boolean;
  onApply: (preset: StudioMannequinHandPreset) => void;
  onTogglePin: (presetId: string) => void;
}): ReactElement {
  const categoryLabel =
    STUDIO_HAND_PRESET_CATEGORIES.find((meta) => meta.id === preset.category)?.label ?? "";
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border p-1.5 transition-colors",
        pinned
          ? "border-accent/50 bg-accent-soft/25"
          : "border-line bg-card/45 hover:border-accent/40 hover:bg-raised",
      )}
    >
      <button
        type="button"
        onClick={() => onApply(preset)}
        aria-label={preset.name}
        title={`${preset.name} — 클릭하면 손에 바로 적용 · ${preset.description}`}
        className="flex w-full flex-col rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <StudioHandPresetSilhouette label={preset.name} curl={preset.curl} />
        <span className="mt-1 block truncate text-[0.7rem] font-bold text-fg" aria-hidden>
          {preset.name}
        </span>
        <span className="block truncate text-[0.62rem] text-fg-3" aria-hidden>
          {categoryLabel}
          {preset.twoHanded ? " · 양손 권장" : ""}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onTogglePin(preset.id)}
        aria-pressed={pinned}
        aria-label={pinned ? `${preset.name} 즐겨찾기 해제` : `${preset.name} 즐겨찾기 고정`}
        title={pinned ? "즐겨찾기 해제" : "즐겨찾기에 고정"}
        className={cn(
          "absolute right-1 top-1 grid size-6 place-items-center rounded-md transition-colors",
          pinned
            ? "text-accent hover:bg-accent-soft"
            : "text-fg-3 opacity-0 hover:bg-raised hover:text-fg focus-visible:opacity-100",
          // 터치 기기에는 hover가 없어 항상 보이게 한다.
          "group-hover:opacity-100 pointer-coarse:opacity-100",
        )}
      >
        <Pin size={13} aria-hidden className={pinned ? "fill-accent" : undefined} />
      </button>
    </div>
  );
}

export function StudioMagicPoserPanel({
  scene,
  onApplyExpression,
  onBodyMorphChange,
  onApplyCameraBookmark,
  className,
}: StudioMagicPoserPanelProps): ReactElement {
  const [tab, setTab] = useState<MagicPoserTab>("pose");

  // 포즈 되돌리기/다시실행 히스토리 (사용자 결정 단위로 기록)
  const historyRef = useRef<StudioPoseHistory>(createStudioPoseHistory());
  const [historySnapshot, setHistorySnapshot] =
    useState<StudioPoseHistory>(historyRef.current);
  const historyGestureRecordedRef = useRef(false);

  // MP2 포즈 강도
  const [intensity, setIntensity] = useState(100);
  const [lastPresetId, setLastPresetId] = useState<string | null>(null);
  const [lastAppliedHandId, setLastAppliedHandId] = useState<string | null>(null);

  // MP1 손
  const [handQuery, setHandQuery] = useState("");
  const [handCategory, setHandCategory] = useState<StudioHandPresetCategory | "all">("all");
  const [handSide, setHandSide] = useState<StudioMannequinHandSide>("right");
  const [handBoth, setHandBoth] = useState(false);
  const [handMirrored, setHandMirrored] = useState(false);
  const [handPresetId, setHandPresetId] = useState<string | null>(null);
  const [handFavorites, setHandFavorites] = useState<string[]>(() =>
    readMannequinHandPresetFavorites(),
  );
  const [handRecent, setHandRecent] = useState<string[]>(() =>
    readMannequinHandPresetRecent(),
  );
  const [fingerCurl, setFingerCurl] = useState<StudioHandFingerCurl>({
    thumb: 0,
    index: 0,
    middle: 0,
    ring: 0,
    little: 0,
  });

  // MP3 라이팅
  const [lightingRig, setLightingRig] = useState<StudioMannequinLightingRig>(() =>
    createStudioMannequinLightingRig(),
  );

  // MP4 카메라
  const [fov, setFov] = useState(45);
  const [bookmarks, setBookmarks] = useState<readonly StudioCameraBookmark[]>([]);
  const [bookmarkName, setBookmarkName] = useState("");

  // MP5 체형
  const [morph, setMorph] = useState<StudioBodyMorph>({ muscle: 0, bodyFat: 0, slim: 0 });
  const [headRatio, setHeadRatio] = useState<StudioHeadRatioPresetId>("six");

  // MP6 복제
  const [clonedPose, setClonedPose] = useState<StudioMannequinPose | null>(null);
  const [cloneNotice, setCloneNotice] = useState<string | null>(null);

  // MP8 표정
  const [expressionIntensity, setExpressionIntensity] = useState(100);
  const [expressionId, setExpressionId] = useState<string | null>(null);

  const isDefaultHandFilter =
    handCategory === "all" && handQuery.trim() === "";

  const filteredHandPresets = useMemo(
    () =>
      filterStudioMannequinHandPresets({
        category: handCategory,
        query: handQuery,
      }),
    [handCategory, handQuery],
  );

  const handFavoritePresets = useMemo(
    () =>
      handFavorites
        .map((id) => getStudioMannequinHandPreset(id))
        .filter((preset): preset is StudioMannequinHandPreset => preset !== undefined),
    [handFavorites],
  );

  const handRecentPresets = useMemo(
    () =>
      handRecent
        .map((id) => getStudioMannequinHandPreset(id))
        .filter((preset): preset is StudioMannequinHandPreset => preset !== undefined),
    [handRecent],
  );

  const handPinnedSet = useMemo(() => new Set(handFavorites), [handFavorites]);

  const toneHint = useMemo(() => {
    const hint = studioMannequinLightingToToneHint(lightingRig);
    const contrastPct = Math.round(hint.contrast * 100);
    return `주광 명암 ${contrastPct}% · 그림자 ${hint.shadows ? "켬" : "끔"}`;
  }, [lightingRig]);

  const historyDescription = useMemo(
    () => describeStudioPoseHistory(historySnapshot),
    [historySnapshot],
  );

  const lastPresetName = lastPresetId
    ? getWebtoonPosePresetById(lastPresetId)?.name ?? lastPresetId
    : null;
  const lastHandName = lastAppliedHandId
    ? getStudioMannequinHandPreset(lastAppliedHandId)?.name ?? lastAppliedHandId
    : null;

  function applyPoseToScene(pose: StudioMannequinPose): void {
    scene?.setPose(pose);
  }

  /** 사용자 결정(프리셋 적용·슬라이더 제스처) 직전에 현재 포즈를 히스토리에 기록한다. */
  function pushPoseHistory(): void {
    if (!scene) return;
    historyRef.current = recordStudioPoseHistory(historyRef.current, scene.getPose());
    setHistorySnapshot(historyRef.current);
  }

  /** 슬라이더 드래그 같은 연속 제스처에서는 제스처당 한 번만 기록한다. */
  function pushPoseHistoryOncePerGesture(): void {
    if (historyGestureRecordedRef.current) return;
    historyGestureRecordedRef.current = true;
    pushPoseHistory();
  }

  function resetHistoryGesture(): void {
    historyGestureRecordedRef.current = false;
  }

  function handleUndoPose(): void {
    if (!scene) return;
    const step = undoStudioPoseHistory(historyRef.current, scene.getPose());
    if (!step) return;
    historyRef.current = step.history;
    setHistorySnapshot(step.history);
    scene.setPose(step.pose);
  }

  function handleRedoPose(): void {
    if (!scene) return;
    const step = redoStudioPoseHistory(historyRef.current, scene.getPose());
    if (!step) return;
    historyRef.current = step.history;
    setHistorySnapshot(step.history);
    scene.setPose(step.pose);
  }

  function handleApplyWebtoonPreset(presetId: string): void {
    const preset = getWebtoonPosePresetById(presetId);
    if (!preset) return;
    pushPoseHistory();
    const mannequinPose = convertWebtoonPresetToMannequinPose(preset);
    const blended = applyStudioPoseIntensity(mannequinPose, intensity);
    applyPoseToScene(blended);
    setLastPresetId(presetId);
    resetHistoryGesture();
  }

  function handleIntensityChange(value: number): void {
    const clamped = clampStudioPoseIntensity(value);
    setIntensity(clamped);
    if (lastPresetId) {
      pushPoseHistoryOncePerGesture();
      handleApplyWebtoonPresetWithoutHistory(lastPresetId, clamped);
    }
  }

  /** 히스토리 기록 없이 프리셋을 다시 적용한다(강도 슬라이더 내부용). */
  function handleApplyWebtoonPresetWithoutHistory(presetId: string, intensityValue: number): void {
    const preset = getWebtoonPosePresetById(presetId);
    if (!preset) return;
    const mannequinPose = convertWebtoonPresetToMannequinPose(preset);
    const blended = applyStudioPoseIntensity(mannequinPose, intensityValue);
    applyPoseToScene(blended);
    setLastPresetId(presetId);
  }

  function handleApplyHandPreset(preset: StudioMannequinHandPreset): void {
    pushPoseHistory();
    setHandPresetId(preset.id);
    setLastAppliedHandId(preset.id);
    setHandRecent(recordMannequinHandPresetRecent(preset.id));
    setFingerCurl({ ...preset.curl });
    if (!scene) return;
    const sides: readonly StudioMannequinHandSide[] = handBoth
      ? ["left", "right"]
      : [handSide];
    for (const side of sides) {
      const mirror = handMirrored && side === "right";
      const applied = mirror
        ? applyStudioMannequinHandPresetMirrored(preset, side)
        : applyStudioMannequinHandPreset(preset, side);
      for (const [jointId, rotation] of Object.entries(applied.angles)) {
        if (rotation) scene.setJointRotation(jointId as StudioMannequinJointId, rotation);
      }
    }
    resetHistoryGesture();
  }

  function handleToggleHandFavorite(presetId: string): void {
    setHandFavorites(toggleMannequinHandPresetFavorite(presetId));
  }

  function handleClearHandRecent(): void {
    if (clearMannequinHandPresetRecent()) setHandRecent([]);
  }

  function handleFingerCurlChange(finger: StudioHandFingerName, value: number): void {
    const next = { ...fingerCurl, [finger]: clampStudioHandCurlValue(value) };
    setFingerCurl(next);
    const preset = handPresetId ? getStudioMannequinHandPreset(handPresetId) : undefined;
    if (!scene || !preset) return;
    pushPoseHistoryOncePerGesture();
    const sides: readonly StudioMannequinHandSide[] = handBoth
      ? ["left", "right"]
      : [handSide];
    for (const side of sides) {
      const applied = applyStudioMannequinHandPreset(preset, side, next);
      for (const [jointId, rotation] of Object.entries(applied.angles)) {
        if (rotation) scene.setJointRotation(jointId as StudioMannequinJointId, rotation);
      }
    }
  }

  function handleTimeOfDay(time: StudioMannequinTimeOfDay): void {
    // 시간대 프리셋은 릭을 통째로 교체한다 (인자 1개).
    setLightingRig(applyStudioMannequinTimeOfDay(time));
  }

  function handleToggleShadows(): void {
    setLightingRig((rig) => setStudioMannequinShadows(rig, !rig.shadowsEnabled));
  }

  function handleSaveBookmark(): void {
    const name = bookmarkName.trim() || `북마크 ${bookmarks.length + 1}`;
    try {
      // 이 패널은 FOV만 보관한다. 씬 핸들에 카메라 조회가 없어
      // position/target은 중립 기본값으로 둔다.
      const bookmark = createStudioCameraBookmark({
        name,
        position: [0, 0, 5],
        target: [0, 0, 0],
        fov,
      });
      setBookmarks((prev) => addStudioCameraBookmark(prev, bookmark));
      setBookmarkName("");
    } catch {
      // 이름 중복 등은 조용히 무시하고 기존 항목을 유지합니다.
      const existing = findStudioCameraBookmark(bookmarks, name);
      if (existing) setBookmarks((prev) => prev.filter((b) => b.id !== existing.id).concat([existing]));
    }
  }

  function handleMorphChange(key: keyof StudioBodyMorph, value: number): void {
    const next = { ...morph, [key]: clampStudioBodyMorphValue(value) };
    setMorph(next);
    onBodyMorphChange?.(next);
  }

  function handleCopyPose(): void {
    if (!scene) {
      setCloneNotice("3D 씬이 연결되지 않아 포즈를 복사할 수 없습니다.");
      return;
    }
    setClonedPose(cloneStudioMannequinPose(scene.getPose()));
    setCloneNotice("현재 포즈를 복사했습니다. 붙여넣기로 언제든 되돌릴 수 있습니다.");
  }

  function handlePastePose(): void {
    if (!clonedPose) {
      setCloneNotice("먼저 포즈를 복사해 주세요.");
      return;
    }
    applyPoseToScene(cloneStudioMannequinPose(clonedPose));
    setCloneNotice("복사한 포즈를 적용했습니다.");
  }

  function handleApplyExpression(comboId: string): void {
    const combo = findStudioVrmExpressionCombo(comboId);
    if (!combo) return;
    setExpressionId(comboId);
    const weights = applyStudioVrmExpressionIntensity(combo.weights, expressionIntensity);
    onApplyExpression?.(comboId, weights);
  }

  if (!scene) {
    return (
      <div className={cn("rounded-xl border border-dashed p-6 text-center", className)}>
        <p className="text-sm font-semibold">3D 씬이 연결되지 않았습니다</p>
        <p className="mt-1 text-xs text-fg-3">
          데생 인형 씬이 준비되면 포즈·손·조명·카메라·체형·표정을 여기서 조절할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Magic Poser 기능">
        {TABS.map((t) => (
          <StudioPanelChip
            key={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </StudioPanelChip>
        ))}
      </div>

      {/* 되돌리기/다시실행 — 사용자 결정 단위 히스토리. 상태가 숫자로 보인다. */}
      <div className="flex flex-wrap items-center gap-1.5" aria-label="포즈 변경 히스토리">
        <button
          type="button"
          onClick={handleUndoPose}
          disabled={!historyDescription.canUndo}
          title={historyDescription.canUndo ? `이전 포즈로 되돌리기 (${historyDescription.undoCount}개)` : "되돌릴 변경이 없습니다"}
          aria-label={`포즈 되돌리기${historyDescription.canUndo ? ` (${historyDescription.undoCount}개 가능)` : ""}`}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[0.7rem] font-semibold text-fg-2 transition-colors hover:border-accent/60 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 size={13} aria-hidden /> 되돌리기
        </button>
        <button
          type="button"
          onClick={handleRedoPose}
          disabled={!historyDescription.canRedo}
          title={historyDescription.canRedo ? `다시 실행하기 (${historyDescription.redoCount}개)` : "다시 실행할 변경이 없습니다"}
          aria-label={`포즈 다시실행${historyDescription.canRedo ? ` (${historyDescription.redoCount}개 가능)` : ""}`}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[0.7rem] font-semibold text-fg-2 transition-colors hover:border-accent/60 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Redo2 size={13} aria-hidden /> 다시실행
        </button>
        <span role="status" className="text-[0.66rem] text-fg-3">
          되돌리기 {historyDescription.undoCount} · 다시실행 {historyDescription.redoCount}
        </span>
      </div>

      {tab === "pose" && (
        <section aria-label="포즈 프리셋">
          <StudioPoseFirstRunGuide
            scope="magic-poser-pose"
            icon={Hand}
            title="포즈 프리셋 — 10초 가이드"
            steps={[
              { ko: "포즈 카드를 클릭하면 3D 캐릭터에 바로 적용됩니다 (실시간 미리보기).", en: "Click a pose card to apply it to the 3D character instantly." },
              { ko: "강도 슬라이더로 중립↔프리셋 사이를 블렌딩하세요.", en: "Blend between neutral and the preset with the intensity slider." },
              { ko: "핀으로 즐겨찾기를 고정하면 위에서 바로 꺼내 쓸 수 있습니다.", en: "Pin favorites to reach them quickly at the top." },
            ]}
          />
          <StudioSectionHeader
            title="포즈 프리셋 갤러리"
            description="카드를 누르면 3D 캐릭터에 바로 적용됩니다. 강도 슬라이더로 중립↔프리셋을 블렌딩하세요."
          />
          <div className="mb-2" onPointerDownCapture={resetHistoryGesture}>
            <StudioSliderRow
              label="포즈 강도"
              min={STUDIO_POSE_INTENSITY_MIN}
              max={STUDIO_POSE_INTENSITY_MAX}
              step={1}
              value={intensity}
              onChange={handleIntensityChange}
              readout={`${intensity}%`}
            />
          </div>
          <p role="status" className="mb-2 text-[0.66rem] text-fg-3">
            {lastPresetName
              ? `적용된 포즈: ${lastPresetName} · 강도 ${intensity}%`
              : "아직 적용된 포즈가 없습니다. 카드를 클릭해 보세요."}
          </p>
          <StudioWebtoonPosePresetGrid onApplyPreset={handleApplyWebtoonPreset} />
        </section>
      )}

      {tab === "hand" && (
        <section aria-label="손 프리셋">
          <StudioPoseFirstRunGuide
            scope="magic-poser-hand"
            icon={Hand}
            title="손 프리셋 — 10초 가이드"
            steps={[
              { ko: "손 모양 카드를 클릭하면 3D 손에 바로 적용됩니다 (실시간 미리보기).", en: "Click a hand card to apply it to the 3D hand instantly." },
              { ko: "왼손/오른손/양손을 고르고, 좌우 미러로 반대손에도 반영하세요.", en: "Pick left/right/both hands, mirror to the other hand." },
              { ko: "손가락 슬라이더 5개로 굽힘을 미세 조절할 수 있습니다.", en: "Fine-tune each finger with the five curl sliders." },
            ]}
          />
          <StudioSectionHeader
            title={`손 프리셋 ${STUDIO_MANNEQUIN_HAND_PRESETS.length}종`}
            description="손 모양 카드를 누르면 3D 손목 관절에 바로 적용됩니다. 실루엣은 손가락 굽힘(curl)에서 그린 미리보기입니다."
          />
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <StudioToggleChip active={handSide === "left" && !handBoth} onClick={() => { setHandSide("left"); setHandBoth(false); }}>
              왼손
            </StudioToggleChip>
            <StudioToggleChip active={handSide === "right" && !handBoth} onClick={() => { setHandSide("right"); setHandBoth(false); }}>
              오른손
            </StudioToggleChip>
            <StudioToggleChip active={handBoth} onClick={() => setHandBoth((v) => !v)}>
              양손
            </StudioToggleChip>
            <StudioToggleChip active={handMirrored} onClick={() => setHandMirrored((v) => !v)} title="오른손에 미러 반사 적용">
              좌우 미러
            </StudioToggleChip>
          </div>
          <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="손 프리셋 카테고리">
            <StudioToggleChip active={handCategory === "all"} onClick={() => setHandCategory("all")}>
              전체
            </StudioToggleChip>
            {STUDIO_HAND_PRESET_CATEGORIES.map((meta) => (
              <StudioToggleChip
                key={meta.id}
                active={handCategory === meta.id}
                onClick={() => setHandCategory(meta.id)}
              >
                {meta.label}
              </StudioToggleChip>
            ))}
          </div>
          <input
            type="search"
            value={handQuery}
            onChange={(e) => setHandQuery(e.target.value)}
            placeholder="손 모양 검색 (예: 주먹, 브이)"
            aria-label="손 프리셋 검색"
            className="mb-2 w-full rounded-lg border px-3 py-2 text-sm"
          />

          {isDefaultHandFilter && handRecentPresets.length > 0 ? (
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-[0.68rem] font-bold text-fg-2">최근 사용</h4>
                <button
                  type="button"
                  onClick={handleClearHandRecent}
                  className="rounded px-1.5 py-0.5 text-[0.64rem] text-fg-3 hover:bg-raised hover:text-fg"
                  title="최근 사용 목록 비우기"
                >
                  지우기
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {handRecentPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyHandPreset(preset)}
                    aria-label={`${preset.name} 손 프리셋 적용`}
                    title={`${preset.name} — 클릭하면 바로 적용`}
                    className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-accent/40 bg-accent-soft/30 px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-accent-soft/60"
                  >
                    <span className="truncate">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isDefaultHandFilter && handFavoritePresets.length > 0 ? (
            <div className="mb-2">
              <h4 className="mb-1 flex items-center gap-1 text-[0.68rem] font-bold text-fg-2">
                <Pin size={11} aria-hidden className="text-accent" /> 즐겨찾기
              </h4>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {handFavoritePresets.map((preset) => (
                  <HandPresetCard
                    key={preset.id}
                    preset={preset}
                    pinned
                    onApply={handleApplyHandPreset}
                    onTogglePin={handleToggleHandFavorite}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
            {filteredHandPresets.map((preset) => (
              <HandPresetCard
                key={preset.id}
                preset={preset}
                pinned={handPinnedSet.has(preset.id)}
                onApply={handleApplyHandPreset}
                onTogglePin={handleToggleHandFavorite}
              />
            ))}
          </div>
          {filteredHandPresets.length === 0 && (
            <p className="mt-2 text-xs text-fg-3">검색 결과가 없습니다. 다른 단어로 검색해 보세요.</p>
          )}
          <p role="status" className="mt-2 text-[0.66rem] text-fg-3">
            {lastHandName
              ? `적용된 손: ${lastHandName} · ${handBoth ? "양손" : handSide === "left" ? "왼손" : "오른손"}${handMirrored ? " · 미러" : ""}`
              : "아직 적용된 손 프리셋이 없습니다. 카드를 클릭해 보세요."}
          </p>
          <div className="mt-2 space-y-1" onPointerDownCapture={resetHistoryGesture}>
            {STUDIO_HAND_FINGER_ORDER.map((finger) => (
              <StudioSliderRow
                key={finger}
                label={FINGER_LABELS[finger]}
                min={0}
                max={100}
                step={1}
                value={fingerCurl[finger]}
                onChange={(v) => handleFingerCurlChange(finger, v)}
                readout={`${Math.round(fingerCurl[finger])}`}
              />
            ))}
          </div>
        </section>
      )}

      {tab === "lighting" && (
        <section aria-label="라이팅 스튜디오">
          <StudioSectionHeader
            title="라이팅 스튜디오"
            description="시간대 프리셋과 그림자 옵션을 조절하세요. LT 명암 힌트는 선화 변환 시 참고값입니다."
          />
          <div className="mb-2 flex flex-wrap gap-1.5">
            {TIME_OF_DAY_ORDER.map((time) => (
              <StudioToggleChip
                key={time}
                active={lightingRig.timeOfDay === time}
                onClick={() => handleTimeOfDay(time)}
              >
                {STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS[time]}
              </StudioToggleChip>
            ))}
            <StudioToggleChip active={lightingRig.shadowsEnabled} onClick={handleToggleShadows}>
              그림자 {lightingRig.shadowsEnabled ? "켬" : "끔"}
            </StudioToggleChip>
          </div>
          <dl className="rounded-lg border p-3 text-xs">
            <div className="flex justify-between py-0.5">
              <dt className="text-fg-3">조명 수</dt>
              <dd>{lightingRig.lights.length} / 4</dd>
            </div>
            <div className="flex justify-between py-0.5">
              <dt className="text-fg-3">LT 명암 힌트</dt>
              <dd>{toneHint}</dd>
            </div>
          </dl>
        </section>
      )}

      {tab === "camera" && (
        <section aria-label="카메라 북마크">
          <StudioSectionHeader
            title="카메라 북마크"
            description="자주 쓰는 앵글을 저장해 두었다가 한 번에 불러옵니다."
          />
          <StudioSliderRow
            label="FOV"
            min={STUDIO_CAMERA_FOV_MIN}
            max={STUDIO_CAMERA_FOV_MAX}
            step={1}
            value={fov}
            onChange={(v) => setFov(clampStudioCameraFov(v))}
            readout={`${fov}°`}
          />
          <div className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={bookmarkName}
              onChange={(e) => setBookmarkName(e.target.value)}
              placeholder="북마크 이름 (예: 정면 클로즈업)"
              aria-label="북마크 이름"
              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleSaveBookmark}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            >
              저장
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">{bookmark.name} · {bookmark.fov}°</span>
                <button
                  type="button"
                  onClick={() => {
                    const applied = applyStudioCameraBookmark(bookmark);
                    setFov(applied.fov);
                    // FOV는 패널 내부 상태로 복원하고, position/target은 호스트가 씬에 반영한다.
                    onApplyCameraBookmark?.(bookmark);
                  }}
                  className="rounded border px-2 py-0.5 hover:border-accent"
                  title={onApplyCameraBookmark ? "저장된 앵글로 카메라 이동" : "FOV만 복원 (씬 카메라 연동 없음)"}
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={() => setBookmarks((prev) => removeStudioCameraBookmark(prev, bookmark.id))}
                  className="rounded border px-2 py-0.5 text-fg-3 hover:border-red-400"
                  aria-label={`${bookmark.name} 삭제`}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
          {bookmarks.length === 0 && (
            <p className="mt-2 text-xs text-fg-3">저장된 북마크가 없습니다. 위에서 이름을 입력하고 저장해 보세요.</p>
          )}
        </section>
      )}

      {tab === "body" && (
        <section aria-label="체형 모프">
          <StudioSectionHeader
            title="체형 모프"
            description="근육·체지방·슬림을 −100~+100으로 조절하고 두신 프리셋을 고릅니다."
          />
          <div className="space-y-1">
            {(
              [
                ["muscle", "근육"],
                ["bodyFat", "체지방"],
                ["slim", "슬림"],
              ] as const
            ).map(([key, label]) => (
              <StudioSliderRow
                key={key}
                label={label}
                min={STUDIO_BODY_MORPH_RANGE.min}
                max={STUDIO_BODY_MORPH_RANGE.max}
                step={1}
                value={morph[key]}
                onChange={(v) => handleMorphChange(key, v)}
                readout={`${Math.round(morph[key])}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STUDIO_HEAD_RATIO_PRESETS.map((preset) => (
              <StudioToggleChip
                key={preset.id}
                active={headRatio === preset.id}
                onClick={() => setHeadRatio(preset.id)}
                title={preset.description}
              >
                {preset.label} ({preset.headCount}등신)
              </StudioToggleChip>
            ))}
          </div>
        </section>
      )}

      {tab === "clone" && (
        <section aria-label="포즈 복제">
          <StudioSectionHeader
            title="포즈 복제"
            description="현재 포즈를 깊은 복사해 두었다가 언제든 되돌릴 수 있습니다."
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleCopyPose}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
            >
              현재 포즈 복사
            </button>
            <button
              type="button"
              onClick={handlePastePose}
              disabled={!clonedPose}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
            >
              붙여넣기
            </button>
          </div>
          {cloneNotice && <p className="mt-2 text-xs text-fg-3">{cloneNotice}</p>}
          {!clonedPose && !cloneNotice && (
            <p className="mt-2 text-xs text-fg-3">아직 복사한 포즈가 없습니다.</p>
          )}
        </section>
      )}

      {tab === "guides" && (
        <section aria-label="조작 핸들 가이드">
          <StudioSectionHeader
            title="조작 핸들 가이드"
            description="3D 뷰에서 드래그할 수 있는 핸들 4종의 역할입니다."
          />
          <ul className="space-y-2">
            {STUDIO_MANNEQUIN_HANDLE_GUIDES.map((guide) => (
              <li key={guide.id} className="rounded-lg border p-3">
                <p className="text-sm font-semibold">{guide.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{guide.tooltip}</p>
                <p className="mt-1 text-[11px] text-fg-3">
                  대상 관절: {guide.targetJoint} · 연동: {guide.affectedJoints.join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "expression" && (
        <section aria-label="VRM 표정">
          <StudioSectionHeader
            title="VRM 표정 블렌드셰이프"
            description="표정 콤보를 고르면 연결된 VRM 캐릭터에 적용됩니다."
          />
          <StudioSliderRow
            label="표정 강도"
            min={0}
            max={100}
            step={1}
            value={expressionIntensity}
            onChange={(v) => {
              const next = Math.min(100, Math.max(0, Math.round(v)));
              setExpressionIntensity(next);
              if (expressionId) handleApplyExpression(expressionId);
            }}
            readout={`${expressionIntensity}%`}
          />
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {STUDIO_VRM_EXPRESSION_COMBOS.map((combo) => (
              <button
                key={combo.id}
                type="button"
                title={combo.description}
                onClick={() => handleApplyExpression(combo.id)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-left text-xs",
                  expressionId === combo.id
                    ? "border-accent bg-accent/10 font-semibold"
                    : "hover:border-accent/60",
                )}
              >
                <span className="block">{combo.label}</span>
                <span className="mt-0.5 block text-[10px] leading-snug text-fg-3">
                  {combo.description}
                </span>
              </button>
            ))}
          </div>
          {!onApplyExpression && (
            <p className="mt-2 text-xs text-fg-3">
              VRM 캐릭터가 연결되지 않아 표정이 3D에 반영되지 않습니다. 표정 스펙만 선택됩니다.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
