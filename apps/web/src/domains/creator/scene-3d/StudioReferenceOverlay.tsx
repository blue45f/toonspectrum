/**
 * 드로잉 캔버스 위 플로팅 레퍼런스 오버레이 (B-5).
 *
 * - 드래그로 위치 이동, 우하단 핸들로 크기 조절, 투명도 슬라이더,
 *   접기/펼치기, 닫기(Esc)를 지원한다.
 * - 오버레이 안의 뷰어는 `viewport` 슬롯으로 교체 가능하다. 기본값은
 *   포즈 프리셋 실루엣 스냅샷 + 포즈 선택 수준의 경량 구현이며,
 *   실제 3D 뷰어(마네킹/VRM)는 `StudioReferenceOverlayViewport` 시그니처를
 *   만족하는 컴포넌트로 갈아끼우면 된다.
 * - 포인터 이벤트 격리: 오버레이 레이어는 pointer-events-none, 패널 본체만
 *   pointer-events-auto라 패널 바깥의 캔버스 드로잉(팜 리젝션·터치)은 그대로
 *   동작한다.
 * - reduced-motion 준수, 포커스 트랩 없음, 모바일(터치 드래그) 대응.
 *
 * 통합: `StudioCanvasViewportDomOverlays`의 옵트인 prop
 * `referenceOverlayEnabled`가 true일 때 캔버스 위에 마운트된다.
 */

import {
  Box,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Scaling,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { StudioSliderRow } from "../studio-panel-ui";
import {
  ADVANCED_WEBTOON_POSES,
  WEBTOON_POSE_CATEGORY_META,
  getWebtoonPosePresetById,
  type CharacterFullBodyPosePreset,
  type CharacterPoseCategory,
  type HumanoidJointRotation,
} from "./studio-3d-advanced-poses-library";

import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// 뷰포트 슬롯: 3D 뷰어 교체 지점
// ---------------------------------------------------------------------------

/** 오버레이 안쪽 뷰어가 받는 props. 실제 3D 뷰어로 교체해도 이 계약은 유지한다. */
export interface StudioReferenceOverlayViewportProps {
  /** 접힘 상태(헤더만 표시)일 때 true. */
  readonly collapsed: boolean;
}

/**
 * 교체 가능한 뷰포트 슬롯.
 * 예: `<StudioReferenceOverlay viewport={StudioMannequinMiniViewer} />`
 */
export type StudioReferenceOverlayViewport =
  (props: StudioReferenceOverlayViewportProps) => ReactElement;

// ---------------------------------------------------------------------------
// 카피 (ko 기본, 주변 패턴의 bilingual COPY 객체)
// ---------------------------------------------------------------------------

const COPY = {
  ko: {
    title: "3D 레퍼런스",
    subtitle: "포즈 스냅샷",
    collapse: "접기",
    expand: "펼치기",
    close: "닫기",
    dragToMoveKeyboard: "드래그하여 이동 — 포커스 후 방향키로도 이동할 수 있습니다",
    resize: "크기 조절",
    opacity: "투명도",
    poseSelect: "포즈 선택",
    poseHint: "레퍼런스로 볼 포즈를 고르세요",
    category: "카테고리",
    storedNote: "선택한 포즈는 이 브라우저에 저장됩니다",
    figureOne: "1인",
    figureTwo: "2인",
    silhouette: "포즈 실루엣",
  },
  en: {
    title: "3D Reference",
    subtitle: "pose snapshot",
    collapse: "Collapse",
    expand: "Expand",
    close: "Close",
    dragToMoveKeyboard: "Drag to move — you can also move with arrow keys when focused",
    resize: "Resize",
    opacity: "Opacity",
    poseSelect: "Select pose",
    poseHint: "Pick a pose to use as reference",
    category: "Category",
    storedNote: "The selected pose is stored in this browser",
    figureOne: "1 person",
    figureTwo: "2 people",
    silhouette: "pose silhouette",
  },
} as const;

// ---------------------------------------------------------------------------
// 저장소 (방어적 localStorage)
// ---------------------------------------------------------------------------

const POSE_STORAGE_KEY = "toonstudio.reference-overlay.pose.v1";
const LAYOUT_STORAGE_KEY = "toonstudio.reference-overlay.layout.v1";

function readStoredPoseId(): string | null {
  try {
    const raw = window.localStorage.getItem(POSE_STORAGE_KEY);
    return raw && getWebtoonPosePresetById(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredPoseId(presetId: string): void {
  try {
    window.localStorage.setItem(POSE_STORAGE_KEY, presetId);
  } catch {
    // 저장 실패는 무시 (프라이빗 모드 등)
  }
}

interface StoredLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly collapsed: boolean;
}

function readStoredLayout(): Partial<StoredLayout> {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeStoredLayout(layout: StoredLayout): void {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 저장 실패는 무시
  }
}

// ---------------------------------------------------------------------------
// 포즈 실루엣 스냅샷 (관절 각도 기반 측면 스틱 피규어 — 경량 스냅샷 렌더러)
// ---------------------------------------------------------------------------

interface SilhouettePoint {
  readonly x: number;
  readonly y: number;
}

function jointXDeg(rotations: readonly HumanoidJointRotation[], joint: string): number {
  return rotations.find((entry) => entry.joint === joint)?.rotationEulerDeg[0] ?? 0;
}

function moveSilhouettePoint(
  from: SilhouettePoint,
  forwardDeg: number,
  length: number,
): SilhouettePoint {
  const rad = (forwardDeg * Math.PI) / 180;
  return { x: from.x - length * Math.sin(rad), y: from.y + length * Math.cos(rad) };
}

/** 실루엣 스냅샷: 포즈 프리셋의 관절 각도에서 그린 측면 스틱 피규어. */
function ReferencePoseSilhouette({
  preset,
  className,
  decorative = false,
}: {
  preset: CharacterFullBodyPosePreset;
  className?: string;
  /** 장식용(버튼 라벨이 따로 있을 때) true — 스크린리더에서 숨긴다. */
  decorative?: boolean;
}): ReactElement {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const copy = korean ? COPY.ko : COPY.en;
  const rotations = preset.jointRotations;
  const spineLean = jointXDeg(rotations, "spine");
  const hips: SilhouettePoint = { x: 40, y: 62 };
  const leanRad = (spineLean * Math.PI) / 180;
  const neck: SilhouettePoint = {
    x: hips.x - 22 * Math.sin(leanRad),
    y: hips.y - 22 * Math.cos(leanRad),
  };
  const headCenter: SilhouettePoint = {
    x: neck.x - 11 * Math.sin(leanRad),
    y: neck.y - 11 * Math.cos(leanRad),
  };
  const shoulder: SilhouettePoint = {
    x: hips.x + (neck.x - hips.x) * 0.82,
    y: hips.y + (neck.y - hips.y) * 0.82,
  };

  function limb(
    side: "right" | "left",
    upperJoint: string,
    lowerJoint: string,
    upperLength: number,
    lowerLength: number,
    upperXSign: 1 | -1,
    lowerXSign: 1 | -1,
    origin: SilhouettePoint,
  ): readonly [SilhouettePoint, SilhouettePoint, SilhouettePoint] {
    const upperForward = upperXSign * -jointXDeg(rotations, `${side}${upperJoint}`);
    const mid = moveSilhouettePoint(origin, upperForward, upperLength);
    const lowerForward = upperForward + lowerXSign * -jointXDeg(rotations, `${side}${lowerJoint}`);
    const end = moveSilhouettePoint(mid, lowerForward, lowerLength);
    const depthOffset = side === "left" ? { x: 3, y: 1 } : { x: 0, y: 0 };
    return [
      { x: origin.x + depthOffset.x, y: origin.y + depthOffset.y },
      { x: mid.x + depthOffset.x, y: mid.y + depthOffset.y },
      { x: end.x + depthOffset.x, y: end.y + depthOffset.y },
    ];
  }

  const rightArm = limb("right", "UpperArm", "LowerArm", 16, 14, 1, 1, shoulder);
  const leftArm = limb("left", "UpperArm", "LowerArm", 16, 14, 1, 1, shoulder);
  const rightLeg = limb("right", "UpperLeg", "LowerLeg", 20, 19, 1, -1, hips);
  const leftLeg = limb("left", "UpperLeg", "LowerLeg", 20, 19, 1, -1, hips);

  const polyline = (points: readonly SilhouettePoint[]): string =>
    points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox="0 0 80 110"
      className={className ?? "h-full w-full text-fg"}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${preset.name} ${copy.silhouette}`}
      aria-hidden={decorative || undefined}
    >
      <g stroke="currentColor" strokeLinecap="round" fill="none" opacity={0.35}>
        <polyline points={polyline(leftArm)} strokeWidth={3.6} />
        <polyline points={polyline(leftLeg)} strokeWidth={4} />
      </g>
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <line x1={hips.x} y1={hips.y} x2={neck.x} y2={neck.y} strokeWidth={4.8} />
        <circle cx={headCenter.x} cy={headCenter.y} r={7.2} strokeWidth={2.8} />
      </g>
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <polyline points={polyline(rightArm)} strokeWidth={3.6} />
        <polyline points={polyline(rightLeg)} strokeWidth={4} />
      </g>
    </svg>
  );
}

const CATEGORY_LABELS: Readonly<Record<CharacterPoseCategory, string>> = Object.freeze(
  Object.fromEntries(WEBTOON_POSE_CATEGORY_META.map((meta) => [meta.id, meta.label])),
) as Readonly<Record<CharacterPoseCategory, string>>;

function shortPresetName(fullName: string): string {
  const parenIndex = fullName.indexOf(" (");
  return parenIndex > 0 ? fullName.slice(0, parenIndex) : fullName;
}

// ---------------------------------------------------------------------------
// 기본 뷰포트: 스냅샷 + 포즈 선택
// ---------------------------------------------------------------------------

/**
 * 기본 경량 뷰포트: 포즈 프리셋 실루엣 스냅샷 + 포즈 선택 스트립.
 * 무거운 3D 렌더러 없이도 레퍼런스 용도로 동작하며,
 * `StudioReferenceOverlayViewport` 계약을 지키는 한 3D 뷰어로 교체 가능하다.
 */
export function StudioReferenceOverlaySnapshotViewport({
  collapsed,
}: StudioReferenceOverlayViewportProps): ReactElement {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const copy = korean ? COPY.ko : COPY.en;
  const [presetId, setPresetId] = useState<string>(
    () => readStoredPoseId() ?? ADVANCED_WEBTOON_POSES[0]?.id ?? "",
  );
  const preset = getWebtoonPosePresetById(presetId) ?? ADVANCED_WEBTOON_POSES[0];

  const selectPreset = useCallback((nextId: string) => {
    setPresetId(nextId);
    writeStoredPoseId(nextId);
  }, []);

  if (collapsed || !preset) return <></>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="relative grid min-h-0 flex-1 place-items-center overflow-hidden rounded-lg bg-raised/60"
        data-testid="reference-overlay-snapshot"
      >
        <ReferencePoseSilhouette preset={preset} className="h-full max-h-full w-auto py-2 text-fg" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-2 pb-1.5 pt-4">
          <p className="truncate text-xs font-bold text-white">{shortPresetName(preset.name)}</p>
          <p className="truncate text-[0.65rem] text-white/75">
            {CATEGORY_LABELS[preset.category]} · {preset.figures === 2 ? copy.figureTwo : copy.figureOne}
          </p>
        </div>
      </div>
      <div className="mt-2 shrink-0">
        <p className="mb-1 text-[0.68rem] font-semibold text-fg-3" id="reference-overlay-pose-label">
          {copy.poseSelect}
        </p>
        <div
          role="group"
          aria-labelledby="reference-overlay-pose-label"
          className="flex gap-1.5 overflow-x-auto pb-1"
        >
          {ADVANCED_WEBTOON_POSES.map((candidate) => {
            const active = candidate.id === preset.id;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => selectPreset(candidate.id)}
                aria-pressed={active}
                aria-label={`${candidate.name} ${copy.poseSelect}`}
                title={candidate.name}
                className={cn(
                  "grid h-14 w-11 shrink-0 place-items-center rounded-md border p-1 transition-colors",
                  active
                    ? "border-accent bg-accent-soft/50"
                    : "border-line bg-card/60 hover:border-accent/40",
                )}
              >
                <ReferencePoseSilhouette
                  preset={candidate}
                  decorative
                  className={cn("h-10 w-8", active ? "text-accent" : "text-fg-3")}
                />
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[0.62rem] text-fg-3">{copy.storedNote}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// reduced-motion
// ---------------------------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------
// 플로팅 오버레이 본체
// ---------------------------------------------------------------------------

export interface StudioReferenceOverlayProps {
  /** 처음 마운트될 때 열림 여부. 기본 true. */
  readonly defaultOpen?: boolean;
  /** 초기 위치(레이어 좌상단 기준 px). 기본: 우상단. */
  readonly defaultPosition?: { readonly x: number; readonly y: number } | null;
  /** 뷰포트 슬롯. 기본: 스냅샷+포즈 선택. 3D 뷰어로 교체 가능. */
  readonly viewport?: StudioReferenceOverlayViewport;
  readonly onOpenChange?: (open: boolean) => void;
}

const MIN_WIDTH = 220;
const MIN_HEIGHT = 260;
const DEFAULT_DESKTOP_WIDTH = 288;
const DEFAULT_DESKTOP_HEIGHT = 384;
const DEFAULT_MOBILE_WIDTH = 240;
const DEFAULT_MOBILE_HEIGHT = 320;
const EDGE_MARGIN = 12;

export function StudioReferenceOverlay({
  defaultOpen = true,
  defaultPosition = null,
  viewport: Viewport = StudioReferenceOverlaySnapshotViewport,
  onOpenChange,
}: StudioReferenceOverlayProps): ReactElement | null {
  const korean = useI18n((state) => state.lang.startsWith("ko"));
  const copy = korean ? COPY.ko : COPY.en;
  const reducedMotion = usePrefersReducedMotion();

  const layerRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const [open, setOpen] = useState(defaultOpen);
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [opacity, setOpacity] = useState(100);

  // 저장된 레이아웃 복원 (1회)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const stored = readStoredLayout();
    if (typeof stored.x === "number" && typeof stored.y === "number") {
      setPosition({ x: Math.max(0, stored.x), y: Math.max(0, stored.y) });
    }
    if (typeof stored.width === "number" && typeof stored.height === "number") {
      setSize({
        width: Math.max(MIN_WIDTH, stored.width),
        height: Math.max(MIN_HEIGHT, stored.height),
      });
    }
    if (typeof stored.opacity === "number") {
      setOpacity(Math.min(100, Math.max(10, Math.round(stored.opacity))));
    }
    if (stored.collapsed === true) setCollapsed(true);
  }, []);

  const layerBox = useCallback((): { width: number; height: number } => {
    const node = layerRef.current;
    const fallbackWidth = typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1024;
    const fallbackHeight = typeof window !== "undefined" && window.innerHeight > 0 ? window.innerHeight : 768;
    if (!node || node.clientWidth <= 0 || node.clientHeight <= 0) {
      return { width: fallbackWidth, height: fallbackHeight };
    }
    return { width: node.clientWidth, height: node.clientHeight };
  }, []);

  const resolvedSize = useMemo(() => {
    if (size) return size;
    const mobile = typeof window !== "undefined" && window.innerWidth < 640;
    return {
      width: mobile ? DEFAULT_MOBILE_WIDTH : DEFAULT_DESKTOP_WIDTH,
      height: mobile ? DEFAULT_MOBILE_HEIGHT : DEFAULT_DESKTOP_HEIGHT,
    };
  }, [size]);

  const resolvedPosition = useMemo(() => {
    if (position) return position;
    if (defaultPosition) return defaultPosition;
    const box = layerBox();
    // 기본 위치: 우상단.
    return {
      x: Math.max(EDGE_MARGIN, box.width - resolvedSize.width - EDGE_MARGIN),
      y: EDGE_MARGIN,
    };
  }, [position, defaultPosition, layerBox, resolvedSize.width]);

  // 레이아웃 변경을 방어적으로 저장.
  useEffect(() => {
    writeStoredLayout({
      x: resolvedPosition.x,
      y: resolvedPosition.y,
      width: resolvedSize.width,
      height: resolvedSize.height,
      opacity,
      collapsed,
    });
  }, [resolvedPosition, resolvedSize, opacity, collapsed]);

  const clampPosition = useCallback(
    (next: { x: number; y: number }): { x: number; y: number } => {
      const box = layerBox();
      return {
        x: Math.min(Math.max(0, next.x), Math.max(0, box.width - 80)),
        y: Math.min(Math.max(0, next.y), Math.max(0, box.height - 48)),
      };
    },
    [layerBox],
  );

  const clampSize = useCallback(
    (next: { width: number; height: number }): { width: number; height: number } => {
      const box = layerBox();
      return {
        width: Math.min(Math.max(MIN_WIDTH, next.width), Math.max(MIN_WIDTH, box.width - EDGE_MARGIN)),
        height: Math.min(Math.max(MIN_HEIGHT, next.height), Math.max(MIN_HEIGHT, box.height - EDGE_MARGIN)),
      };
    },
    [layerBox],
  );

  // --- 드래그 이동 ---
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const positionRef = useRef(resolvedPosition);
  positionRef.current = resolvedPosition;

  const onDragPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    // 패널 안에서 시작한 포인터 제스처가 캔버스(형제 Konva 스테이지)로
    // 번지지 않도록 버블링을 끊는다 — 포인터 이벤트 격리.
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: positionRef.current.x,
      originY: positionRef.current.y,
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      setPosition(
        clampPosition({
          x: drag.originX + (event.clientX - drag.startX),
          y: drag.originY + (event.clientY - drag.startY),
        }),
      );
    };
    const onUp = (event: PointerEvent): void => {
      if (dragRef.current && event.pointerId === dragRef.current.pointerId) {
        dragRef.current = null;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [open, clampPosition]);

  // --- 크기 조절 ---
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);
  const sizeRef = useRef(resolvedSize);
  sizeRef.current = resolvedSize;

  const onResizePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.stopPropagation();
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: sizeRef.current.width,
      originHeight: sizeRef.current.height,
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMove = (event: PointerEvent): void => {
      const resize = resizeRef.current;
      if (!resize || event.pointerId !== resize.pointerId) return;
      setSize(
        clampSize({
          width: resize.originWidth + (event.clientX - resize.startX),
          height: resize.originHeight + (event.clientY - resize.startY),
        }),
      );
    };
    const onUp = (event: PointerEvent): void => {
      if (resizeRef.current && event.pointerId === resizeRef.current.pointerId) {
        resizeRef.current = null;
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [open, clampSize]);

  const close = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const onDragHandleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 24 : 8;
      const delta =
        event.key === "ArrowLeft" ? { x: -step, y: 0 }
        : event.key === "ArrowRight" ? { x: step, y: 0 }
        : event.key === "ArrowUp" ? { x: 0, y: -step }
        : event.key === "ArrowDown" ? { x: 0, y: step }
        : null;
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      const current = positionRef.current;
      setPosition(clampPosition({ x: current.x + delta.x, y: current.y + delta.y }));
    },
    [clampPosition],
  );

  const onResizeHandleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 24 : 8;
      const delta =
        event.key === "ArrowLeft" ? { width: -step, height: 0 }
        : event.key === "ArrowRight" ? { width: step, height: 0 }
        : event.key === "ArrowUp" ? { width: 0, height: -step }
        : event.key === "ArrowDown" ? { width: 0, height: step }
        : null;
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      const current = sizeRef.current;
      setSize(
        clampSize({
          width: current.width + delta.width,
          height: current.height + delta.height,
        }),
      );
    },
    [clampSize],
  );

  const onPanelKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    },
    [close],
  );

  const panelRef = useRef<HTMLElement | null>(null);

  // 키 처리는 JSX prop 대신 노드 리스너로 건다. `section` 컨테이너는
  // 비인터랙티브 요소라 핸들러를 prop으로 붙이면 a11y 규칙에 걸린다
  // (StudioCommandSearchDialog와 같은 패턴).
  useEffect(() => {
    const node = panelRef.current;
    if (!open || !node) return;
    node.addEventListener("keydown", onPanelKeyDown);
    return () => node.removeEventListener("keydown", onPanelKeyDown);
  }, [open, onPanelKeyDown]);

  if (!open) return null;

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-40"
      data-testid="reference-overlay-layer"
    >
      <section
        ref={panelRef}
        aria-labelledby={titleId}
        style={{
          left: resolvedPosition.x,
          top: resolvedPosition.y,
          width: resolvedSize.width,
          height: collapsed ? undefined : resolvedSize.height,
          opacity: opacity / 100,
        }}
        className={cn(
          "pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl border border-line",
          "bg-card/95 shadow-xl backdrop-blur-sm",
          !reducedMotion && "transition-[opacity] duration-150",
        )}
        data-testid="reference-overlay-panel"
      >
        {/* 헤더 = 드래그 핸들 (StudioFloatingSurface와 같은 버튼 기반 패턴) */}
        <header className="flex shrink-0 items-center gap-1.5 border-b border-line/70 bg-raised/70 px-2 py-1.5">
          <button
            type="button"
            onPointerDown={onDragPointerDown}
            onKeyDown={onDragHandleKeyDown}
            aria-label={copy.dragToMoveKeyboard}
            data-testid="reference-overlay-drag-handle"
            className={cn(
              "flex min-w-0 flex-1 cursor-grab touch-none items-center gap-1.5 rounded-md px-1 py-0.5 text-left outline-none active:cursor-grabbing",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            )}
          >
            <GripVertical size={14} aria-hidden className="shrink-0 text-fg-3" />
            <Box size={14} aria-hidden className="shrink-0 text-accent" />
            <span id={titleId} className="min-w-0 flex-1 truncate text-xs font-bold text-fg">
              {copy.title}
              <span className="ml-1.5 font-normal text-fg-3">{copy.subtitle}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? copy.expand : copy.collapse}
            title={collapsed ? copy.expand : copy.collapse}
            onPointerDown={(event) => event.stopPropagation()}
            className="grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {collapsed ? <ChevronDown size={15} aria-hidden /> : <ChevronUp size={15} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label={copy.close}
            title={copy.close}
            onPointerDown={(event) => event.stopPropagation()}
            className="grid size-7 shrink-0 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={15} aria-hidden />
          </button>
        </header>

        {!collapsed ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <div className="min-h-0 flex-1">
              <Viewport collapsed={collapsed} />
            </div>
            <div className="shrink-0 border-t border-line/70 pt-1.5">
              <StudioSliderRow
                label={
                  <span className="text-[0.7rem] font-semibold text-fg-3">
                    {copy.opacity}
                  </span>
                }
                min={10}
                max={100}
                step={5}
                value={opacity}
                onChange={setOpacity}
                readout={`${opacity}%`}
              />
            </div>
          </div>
        ) : null}

        {/* 리사이즈 핸들 (버튼 기반 — 키보드 방향키로도 조절 가능) */}
        {!collapsed ? (
          <button
            type="button"
            aria-label={copy.resize}
            data-testid="reference-overlay-resize-handle"
            onPointerDown={onResizePointerDown}
            onKeyDown={onResizeHandleKeyDown}
            className="absolute bottom-0 right-0 grid size-7 cursor-nwse-resize touch-none place-items-center rounded-tl-md text-fg-3 outline-none hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Scaling size={13} aria-hidden />
          </button>
        ) : null}
      </section>
    </div>
  );
}
