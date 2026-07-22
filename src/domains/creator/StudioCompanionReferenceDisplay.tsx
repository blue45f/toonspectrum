import {
  ImageIcon,
  Maximize2,
  Minus,
  Move,
  Pipette,
  Plus,
  RefreshCw,
  Unplug,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import type {
  StudioCompanionReferenceControl,
  StudioCompanionReferencePoint,
  StudioCompanionReferenceProjection,
} from "./studio-companion-reference-projection";

import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

export type StudioCompanionReferenceConnectionStatus =
  | "connected"
  | "reconnecting"
  | "disconnected";

export type StudioCompanionReferencePreviewMetadata = {
  url: string;
  generation: number;
  revision: number;
  referenceRevision: number;
  sequence: number;
  width: number;
  height: number;
};

export type StudioCompanionReferenceColorResult = {
  color: string;
  generation: number;
  revision: number;
  referenceRevision: number;
  sequence: number;
};

export interface StudioCompanionReferenceDisplayProps {
  projection: StudioCompanionReferenceProjection | null;
  preview: StudioCompanionReferencePreviewMetadata | null;
  connectionStatus: StudioCompanionReferenceConnectionStatus;
  latestColorResult?: StudioCompanionReferenceColorResult | null;
  /** Increment when the transport callback/channel is replaced without changing generation. */
  connectionEpoch?: number;
  onControl: (control: StudioCompanionReferenceControl) => void;
}

type Pan = { x: number; y: number };
type PanSession = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
  suppressPrimaryClick: boolean;
};

type ReferenceDisplayState =
  | "ready"
  | "partial"
  | "loading"
  | "empty"
  | "unavailable"
  | "reconnecting"
  | "disconnected";

type ContainedImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const toolButtonClass = cn(
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-2",
  "text-[0.68rem] font-semibold outline-none",
  "transition-[border-color,background-color,color] duration-150 motion-reduce:transition-none",
  "focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
  "disabled:cursor-not-allowed disabled:opacity-40"
);

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function fitScale(containerWidth: number, containerHeight: number, imageWidth: number, imageHeight: number) {
  if (
    containerWidth <= 0
    || containerHeight <= 0
    || imageWidth <= 0
    || imageHeight <= 0
  ) return 0;
  return Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
}

function containedImageRect(input: {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  pan: Pan;
}): ContainedImageRect | null {
  const scale = fitScale(
    input.containerWidth,
    input.containerHeight,
    input.imageWidth,
    input.imageHeight
  );
  if (scale <= 0) return null;
  const width = input.imageWidth * scale * input.zoom;
  const height = input.imageHeight * scale * input.zoom;
  return {
    x: (input.containerWidth - width) / 2 + input.pan.x,
    y: (input.containerHeight - height) / 2 + input.pan.y,
    width,
    height,
  };
}

function pointWithinImage(input: {
  clientX: number;
  clientY: number;
  bounds: DOMRect;
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  pan: Pan;
}): StudioCompanionReferencePoint | null {
  const image = containedImageRect({
    containerWidth: input.bounds.width,
    containerHeight: input.bounds.height,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    zoom: input.zoom,
    pan: input.pan,
  });
  if (!image || image.width <= 0 || image.height <= 0) return null;
  const x = input.clientX - input.bounds.left - image.x;
  const y = input.clientY - input.bounds.top - image.y;
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  return { x: x / image.width, y: y / image.height };
}

function matchesProjection(
  projection: StudioCompanionReferenceProjection | null,
  preview: StudioCompanionReferencePreviewMetadata | null
): boolean {
  return projection !== null
    && preview !== null
    && preview.generation === projection.generation
    && preview.revision === projection.revision
    && preview.referenceRevision === projection.referenceRevision;
}

function resolveDisplayState(
  connectionStatus: StudioCompanionReferenceConnectionStatus,
  projection: StudioCompanionReferenceProjection | null,
  preview: StudioCompanionReferencePreviewMetadata | null
): ReferenceDisplayState {
  if (connectionStatus === "disconnected") return "disconnected";
  if (connectionStatus === "reconnecting") return "reconnecting";
  if (!projection) return "loading";
  if (projection.itemCount === 0) return "empty";
  if (projection.resolvedItemCount === 0) return "unavailable";
  if (!matchesProjection(projection, preview)) return "loading";
  if (projection.resolvedItemCount < projection.itemCount) return "partial";
  return "ready";
}

function stateCopy(state: ReferenceDisplayState): { title: string; detail: string } {
  switch (state) {
    case "disconnected":
      return {
        title: "기본 스튜디오 연결이 끊겼습니다",
        detail: "편집 탭을 다시 열거나 이 창을 새로 연결해 주세요.",
      };
    case "reconnecting":
      return {
        title: "기본 스튜디오에 다시 연결하는 중",
        detail: "마지막 합성본은 유지하고 새 입력은 잠시 막았습니다.",
      };
    case "empty":
      return {
        title: "레퍼런스가 아직 없습니다",
        detail: "기본 스튜디오의 레퍼런스 보드에 이미지를 추가하면 여기에 표시됩니다.",
      };
    case "unavailable":
      return {
        title: "표시할 수 있는 레퍼런스가 없습니다",
        detail: "불러오지 못한 항목을 기본 스튜디오에서 확인해 주세요.",
      };
    case "partial":
      return {
        title: "일부 레퍼런스만 표시 중",
        detail: "사용 가능한 항목으로 합성본을 만들었습니다.",
      };
    case "loading":
      return {
        title: "레퍼런스 미리보기를 준비하고 있어요",
        detail: "편집을 막지 않도록 안전한 합성본을 만드는 중입니다.",
      };
    case "ready":
      return {
        title: "레퍼런스 보드가 최신 상태입니다",
        detail: "스포이드로 합성본의 색을 기본 스튜디오에 보낼 수 있습니다.",
      };
  }
}

function colorResultIsUsable(
  result: StudioCompanionReferenceColorResult | null | undefined,
  projection: StudioCompanionReferenceProjection | null,
  expectedSequence: number
): result is StudioCompanionReferenceColorResult {
  return result !== null
    && result !== undefined
    && result.generation === projection?.generation
    && result.revision === projection?.revision
    && result.referenceRevision === projection?.referenceRevision
    && Number.isSafeInteger(result.sequence)
    && result.sequence === expectedSequence
    && expectedSequence > 0
    && /^#[\da-f]{6}(?:[\da-f]{2})?$/iu.test(result.color);
}

export function StudioCompanionReferenceDisplay({
  projection,
  preview,
  connectionStatus,
  latestColorResult = null,
  connectionEpoch = 0,
  onControl,
}: StudioCompanionReferenceDisplayProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const helpId = `${id}-help`;
  const statusId = `${id}-status`;
  const viewportRef = useRef<HTMLButtonElement>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const suppressClickRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const pickCursorRef = useRef({
    generation: projection?.generation ?? 0,
    referenceRevision: projection?.referenceRevision ?? 0,
    sequence: 0,
  });
  const pendingPanDeltaRef = useRef<Pan>({ x: 0, y: 0 });
  const panAnimationFrameRef = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [zoomLabel, setZoomLabel] = useState("맞춤");
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [pickerActive, setPickerActive] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [feedback, setFeedback] = useState("레퍼런스 전용 화면이 열렸습니다.");
  const sendDemandControl = useEffectEvent(onControl);

  const displayState = resolveDisplayState(connectionStatus, projection, preview);
  const copy = stateCopy(displayState);
  const currentFrameMatches = matchesProjection(projection, preview);
  const currentFrameRenderable = currentFrameMatches
    && (projection?.resolvedItemCount ?? 0) > 0;
  const visiblePreview = preview
    && preview.url.startsWith("blob:")
    && currentFrameRenderable
    ? preview
    : null;
  const pickerReady = connectionStatus === "connected"
    && currentFrameRenderable
    && projection?.canPickColor === true;
  const pickCursor = pickCursorRef.current;
  const expectedColorSequence = pickCursor.generation === projection?.generation
    && pickCursor.referenceRevision === projection?.referenceRevision
    ? pickCursor.sequence
    : 0;
  const colorResult = colorResultIsUsable(
    latestColorResult,
    projection,
    expectedColorSequence
  )
    ? latestColorResult
    : null;

  useEffect(() => {
    let demanded = false;
    function releaseDemand() {
      if (!demanded) return;
      demanded = false;
      sendDemandControl({ kind: "reference-preview-demand", active: false });
    }
    function updateDemand() {
      const nextDemand = connectionStatus === "connected"
        && document.visibilityState !== "hidden";
      if (nextDemand === demanded) return;
      demanded = nextDemand;
      sendDemandControl({ kind: "reference-preview-demand", active: nextDemand });
    }

    updateDemand();
    document.addEventListener("visibilitychange", updateDemand);
    window.addEventListener("pagehide", releaseDemand);
    window.addEventListener("pageshow", updateDemand);
    return () => {
      document.removeEventListener("visibilitychange", updateDemand);
      window.removeEventListener("pagehide", releaseDemand);
      window.removeEventListener("pageshow", updateDemand);
      releaseDemand();
    };
  }, [connectionEpoch, connectionStatus, projection?.generation]);

  useEffect(() => {
    pickCursorRef.current = {
      generation: projection?.generation ?? 0,
      referenceRevision: projection?.referenceRevision ?? 0,
      sequence: 0,
    };
    setPickerActive(false);
  }, [projection?.generation, projection?.referenceRevision]);

  useEffect(() => {
    if (panAnimationFrameRef.current && globalThis.cancelAnimationFrame) {
      globalThis.cancelAnimationFrame(panAnimationFrameRef.current);
    }
    panAnimationFrameRef.current = 0;
    pendingPanDeltaRef.current = { x: 0, y: 0 };
    panSessionRef.current = null;
    suppressClickRef.current = false;
    spaceHeldRef.current = false;
    setSpaceHeld(false);
    setZoom(1);
    setZoomLabel("맞춤");
    setPan({ x: 0, y: 0 });
    setFeedback("새 레퍼런스 화면을 맞춤 보기로 열었습니다.");
  }, [projection?.generation]);

  useEffect(() => () => {
    if (panAnimationFrameRef.current && globalThis.cancelAnimationFrame) {
      globalThis.cancelAnimationFrame(panAnimationFrameRef.current);
    }
    panAnimationFrameRef.current = 0;
    pendingPanDeltaRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    if (pickerReady) return;
    setPickerActive(false);
  }, [pickerReady]);

  function flushPendingPan() {
    panAnimationFrameRef.current = 0;
    const delta = pendingPanDeltaRef.current;
    pendingPanDeltaRef.current = { x: 0, y: 0 };
    if (delta.x === 0 && delta.y === 0) return;
    setPan((current) => ({ x: current.x + delta.x, y: current.y + delta.y }));
  }

  function cancelPendingPan(flush: boolean) {
    if (panAnimationFrameRef.current && globalThis.cancelAnimationFrame) {
      globalThis.cancelAnimationFrame(panAnimationFrameRef.current);
    }
    panAnimationFrameRef.current = 0;
    if (flush) flushPendingPan();
    else pendingPanDeltaRef.current = { x: 0, y: 0 };
  }

  function schedulePan(deltaX: number, deltaY: number) {
    pendingPanDeltaRef.current = {
      x: pendingPanDeltaRef.current.x + deltaX,
      y: pendingPanDeltaRef.current.y + deltaY,
    };
    if (panAnimationFrameRef.current) return;
    if (typeof globalThis.requestAnimationFrame !== "function") {
      flushPendingPan();
      return;
    }
    panAnimationFrameRef.current = globalThis.requestAnimationFrame(flushPendingPan);
  }

  function resetFit() {
    cancelPendingPan(false);
    setZoom(1);
    setZoomLabel("맞춤");
    setPan({ x: 0, y: 0 });
    setFeedback("레퍼런스를 화면에 맞췄습니다.");
  }

  function setActualSize() {
    if (!visiblePreview || !viewportRef.current) return;
    const bounds = viewportRef.current.getBoundingClientRect();
    const scale = fitScale(
      bounds.width,
      bounds.height,
      visiblePreview.width,
      visiblePreview.height
    );
    if (scale <= 0) return;
    cancelPendingPan(false);
    const next = clampZoom(1 / scale);
    const percent = Math.round(scale * next * 100);
    setZoom(next);
    setZoomLabel(`${percent}%`);
    setPan({ x: 0, y: 0 });
    setFeedback(percent === 100
      ? "레퍼런스를 원본 100% 크기로 표시합니다."
      : `창 크기 제한으로 원본을 ${percent}%로 표시합니다.`);
  }

  function adjustZoom(direction: 1 | -1) {
    if (!visiblePreview) return;
    const next = clampZoom(zoom * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
    const bounds = viewportRef.current?.getBoundingClientRect();
    const scale = bounds
      ? fitScale(bounds.width, bounds.height, visiblePreview.width, visiblePreview.height)
      : 0;
    const percent = Math.round((scale > 0 ? scale * next : next) * 100);
    setZoom(next);
    setZoomLabel(`${percent}%`);
    setFeedback(`확대율 ${percent}%`);
  }

  function emitPick(point: StudioCompanionReferencePoint) {
    if (!pickerReady || !projection) return;
    const previous = pickCursorRef.current;
    const sequence = previous.generation === projection.generation
      && previous.referenceRevision === projection.referenceRevision
      ? previous.sequence + 1
      : 1;
    pickCursorRef.current = {
      generation: projection.generation,
      referenceRevision: projection.referenceRevision,
      sequence,
    };
    onControl({
      kind: "reference-pick-color",
      point,
      referenceRevision: projection.referenceRevision,
      sequence,
    });
    setFeedback(`색상 위치 ${Math.round(point.x * 100)}%, ${Math.round(point.y * 100)}%를 보냈습니다.`);
  }

  function togglePicker() {
    if (!pickerReady) return;
    const next = !pickerActive;
    setPickerActive(next);
    setFeedback(next ? "스포이드가 켜졌습니다." : "스포이드가 꺼졌습니다.");
    viewportRef.current?.focus();
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!pickerActive || !pickerReady || !visiblePreview || event.button !== 0) return;
    const point = pointWithinImage({
      clientX: event.clientX,
      clientY: event.clientY,
      bounds: event.currentTarget.getBoundingClientRect(),
      imageWidth: visiblePreview.width,
      imageHeight: visiblePreview.height,
      zoom,
      pan,
    });
    if (!point) {
      setFeedback("합성된 이미지 안쪽에서 색을 선택해 주세요.");
      return;
    }
    emitPick(point);
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (panSessionRef.current) return;
    const shouldPan = event.button === 1
      || (event.button === 0 && spaceHeldRef.current)
      || (event.button === 0 && event.pointerType === "touch" && !pickerActive);
    if (!shouldPan || !visiblePreview) return;
    event.preventDefault();
    suppressClickRef.current = event.button === 0;
    panSessionRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      suppressPrimaryClick: event.button === 0,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; local panning still works while the pointer remains here.
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - session.x;
    const deltaY = event.clientY - session.y;
    if (deltaX === 0 && deltaY === 0) return;
    session.x = event.clientX;
    session.y = event.clientY;
    session.moved = true;
    schedulePan(deltaX, deltaY);
  }

  function releasePan(event: PointerEvent<HTMLButtonElement>) {
    const session = panSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    panSessionRef.current = null;
    cancelPendingPan(true);
    if (session.moved) setFeedback("레퍼런스 위치를 옮겼습니다.");
    if (session.suppressPrimaryClick) {
      globalThis.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Browsers may release capture before pointerup/lostpointercapture.
    }
  }

  function cancelPan(event: PointerEvent<HTMLButtonElement>) {
    if (panSessionRef.current?.pointerId !== event.pointerId) return;
    panSessionRef.current = null;
    cancelPendingPan(false);
    suppressClickRef.current = false;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      if (!spaceHeldRef.current) {
        spaceHeldRef.current = true;
        setSpaceHeld(true);
        setFeedback("드래그하여 레퍼런스를 이동할 수 있습니다.");
      }
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      resetFit();
    } else if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
      event.preventDefault();
      adjustZoom(1);
    } else if (event.key === "-" || event.code === "NumpadSubtract") {
      event.preventDefault();
      adjustZoom(-1);
    } else if (event.key.toLowerCase() === "i") {
      event.preventDefault();
      togglePicker();
    } else if (event.key === "Escape") {
      event.preventDefault();
      panSessionRef.current = null;
      cancelPendingPan(false);
      suppressClickRef.current = false;
      setPickerActive(false);
      setFeedback("스포이드와 이동 조작을 취소했습니다.");
    } else if (event.key === "Enter" && pickerActive && pickerReady) {
      event.preventDefault();
      emitPick({ x: 0.5, y: 0.5 });
    }
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.code !== "Space") return;
    spaceHeldRef.current = false;
    setSpaceHeld(false);
  }

  const connectionLabel = connectionStatus === "connected"
    ? "연결됨"
    : connectionStatus === "reconnecting"
      ? "재연결 중"
      : "연결 끊김";
  const showStateOverlay = displayState !== "ready" && displayState !== "partial";

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5"
      data-reference-state={displayState}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold text-fg">
            레퍼런스 전용 화면
          </h2>
          <p id={helpId} className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
            한 손가락 드래그 또는 Space+드래그로 이동 · 0 맞춤 · I 스포이드
          </p>
        </div>
        <span
          className={cn(
            "inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[0.65rem] font-semibold",
            connectionStatus === "connected" && "border-good/35 bg-good/10 text-good",
            connectionStatus === "reconnecting" && "border-warn/35 bg-warn/10 text-warn",
            connectionStatus === "disconnected" && "border-line bg-raised text-fg-3"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              connectionStatus === "connected" && "bg-good",
              connectionStatus === "reconnecting" && "bg-warn motion-safe:animate-pulse",
              connectionStatus === "disconnected" && "bg-fg-3"
            )}
          />
          {connectionLabel}
        </span>
      </div>

      <div
        role="toolbar"
        aria-label="레퍼런스 보기 도구"
        className="grid min-w-0 grid-cols-5 gap-1.5 rounded-xl border border-line/80 bg-card p-1.5"
      >
        <button
          type="button"
          aria-label="화면에 맞춤"
          aria-keyshortcuts="0"
          disabled={!visiblePreview}
          onClick={resetFit}
          className={cn(toolButtonClass, "bg-raised text-fg-2 hover:border-line-strong hover:text-fg")}
        >
          <Maximize2 className="size-4" aria-hidden />
          <span className="sr-only min-[390px]:not-sr-only">맞춤</span>
        </button>
        <button
          type="button"
          aria-label="축소"
          aria-keyshortcuts="-"
          disabled={!visiblePreview || zoom <= MIN_ZOOM}
          onClick={() => adjustZoom(-1)}
          className={cn(toolButtonClass, "bg-raised text-fg-2 hover:border-line-strong hover:text-fg")}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="원본 100% 크기"
          disabled={!visiblePreview}
          onClick={setActualSize}
          className={cn(
            toolButtonClass,
            "tabular-nums",
            zoomLabel === "100%"
              ? "border-accent/45 bg-accent-soft text-fg"
              : "bg-raised text-fg-2 hover:border-line-strong hover:text-fg"
          )}
        >
          {zoomLabel}
        </button>
        <button
          type="button"
          aria-label="확대"
          aria-keyshortcuts="+"
          disabled={!visiblePreview || zoom >= MAX_ZOOM}
          onClick={() => adjustZoom(1)}
          className={cn(toolButtonClass, "bg-raised text-fg-2 hover:border-line-strong hover:text-fg")}
        >
          <Plus className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="스포이드"
          aria-keyshortcuts="I"
          aria-pressed={pickerActive}
          disabled={!pickerReady}
          onClick={togglePicker}
          className={cn(
            toolButtonClass,
            pickerActive
              ? "border-accent/55 bg-accent text-on-accent"
              : "bg-raised text-fg-2 hover:border-line-strong hover:text-fg"
          )}
        >
          <Pipette className="size-4" aria-hidden />
        </button>
      </div>

      <button
        type="button"
        ref={viewportRef}
        aria-label="합성된 레퍼런스 보드"
        aria-describedby={`${helpId} ${statusId}`}
        aria-keyshortcuts="0 + - I Escape Enter Space"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePan}
        onPointerCancel={cancelPan}
        onLostPointerCapture={() => {
          if (panSessionRef.current) {
            panSessionRef.current = null;
            cancelPendingPan(false);
            suppressClickRef.current = false;
          }
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => {
          spaceHeldRef.current = false;
          setSpaceHeld(false);
          panSessionRef.current = null;
          cancelPendingPan(false);
          suppressClickRef.current = false;
        }}
        onContextMenu={(event) => {
          if (spaceHeld || pickerActive) event.preventDefault();
        }}
        className={cn(
          "relative grid min-h-64 flex-1 touch-none place-items-center overflow-hidden rounded-xl border bg-[oklch(0.145_0.008_70)] outline-none",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35",
          "motion-reduce:scroll-auto",
          spaceHeld
            ? "cursor-grab border-line-strong active:cursor-grabbing"
            : pickerActive && pickerReady
              ? "cursor-crosshair border-accent/45"
              : "cursor-default border-line"
        )}
      >
        {visiblePreview ? (
          <img
            src={visiblePreview.url}
            alt="합성된 레퍼런스 보드 미리보기"
            draggable={false}
            className={cn(
              "pointer-events-none absolute inset-0 size-full select-none object-contain",
              "transition-opacity duration-150 motion-reduce:transition-none",
              connectionStatus === "connected" ? "opacity-100" : "opacity-45"
            )}
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: "center",
            }}
          />
        ) : null}

        {pickerActive && pickerReady ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-fg/80 bg-panel/65 text-fg shadow-sm"
          >
            <span className="size-1 rounded-full bg-accent" />
          </span>
        ) : null}

        {showStateOverlay ? (
          <span className="relative z-10 flex max-w-64 flex-col items-center px-5 text-center">
            <span className="grid size-11 place-items-center rounded-xl border border-line bg-card text-fg-3">
              {displayState === "disconnected" ? (
                <Unplug className="size-5" aria-hidden />
              ) : displayState === "reconnecting" ? (
                <RefreshCw className="size-5" aria-hidden />
              ) : (
                <ImageIcon className="size-5" aria-hidden />
              )}
            </span>
            <strong className="mt-3 text-xs font-semibold text-fg-2">{copy.title}</strong>
            <span className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">{copy.detail}</span>
            {displayState === "loading" ? (
              <span
                aria-hidden
                className="mt-3 h-1 w-24 overflow-hidden rounded-full bg-raised after:block after:h-full after:w-1/2 after:rounded-full after:bg-accent motion-safe:after:animate-pulse"
              />
            ) : null}
          </span>
        ) : null}
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "min-w-0 flex-1 text-[0.68rem] leading-relaxed",
            displayState === "partial" ? "text-warn" : "text-fg-3"
          )}
        >
          {displayState === "partial" && projection
            ? `${copy.title} · ${projection.resolvedItemCount}/${projection.itemCount} · ${colorResult
                ? `선택한 색 ${colorResult.color.toUpperCase()}`
                : feedback}`
            : displayState === "ready"
              ? colorResult
                ? `선택한 색 ${colorResult.color.toUpperCase()}`
                : feedback
              : copy.title}
        </p>

        {colorResult ? (
          <output
            aria-label={`최근 선택 색상 ${colorResult.color.toUpperCase()}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-line bg-card px-2 text-[0.65rem] font-semibold text-fg-2"
          >
            <span
              aria-hidden
              className="size-5 rounded-md border border-line-strong"
              style={{ backgroundColor: colorResult.color }}
            />
            <span className="max-[359px]:sr-only">{colorResult.color.toUpperCase()}</span>
          </output>
        ) : (
          <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-1 text-[0.65rem] text-fg-3">
            <Move className="size-3.5" aria-hidden />
            <span className="max-[359px]:sr-only">보기 전용</span>
          </span>
        )}
      </div>
    </section>
  );
}

export default StudioCompanionReferenceDisplay;
