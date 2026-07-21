/**
 * Studio Selection Tools Panel
 * 픽셀 선택 — 사각/타원/자유 올가미/다각형 올가미/브러시 + 합치기/빼기/교집합 +
 * 페더/반전/전체선택/확장·축소/회전·뒤집기 + 부분 조정.
 */
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Circle,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Lasso,
  Maximize2,
  Minimize2,
  Move,
  Paintbrush,
  Pentagon,
  RotateCcw,
  RotateCw,
  Redo2,
  Square,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { useState } from "react";

import { StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";
import {
  SELECTION_BRIGHTNESS_RANGE,
  SELECTION_BRUSH_RADIUS_DEFAULT,
  SELECTION_BRUSH_RADIUS_RANGE,
  SELECTION_COMBINE_MODES,
  SELECTION_EXPAND_DEFAULT,
  SELECTION_EXPAND_RANGE,
  SELECTION_FEATHER_RANGE,
  SELECTION_HUE_RANGE,
  SELECTION_ROTATE_RANGE,
  SELECTION_TOOLS,
  isSelectionUsable,
  planSelectionAdjust,
  type PixelSelection,
  type SelectionAdjustPlan,
  type SelectionCombineMode,
  type SelectionContentTransform,
  type SelectionToolKind,
} from "./studio-selection-tools";
import { StudioToolHintTarget } from "./StudioToolHint";

import type { StudioToolHintPreviewKind } from "./studio-tool-hint-preview-kind";
import type { StudioToolHintSpec } from "./studio-tool-hints";
import type { ReactElement } from "react";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const TOOL_ICONS: Record<SelectionToolKind, typeof Square> = {
  rect: Square,
  ellipse: Circle,
  lasso: Lasso,
  "poly-lasso": Pentagon,
  brush: Paintbrush,
};

const TOOL_PREVIEWS = {
  rect: "marquee-rect",
  ellipse: "marquee-ellipse",
  lasso: "lasso",
  "poly-lasso": "polygon-lasso",
  brush: "selection-brush",
} satisfies Record<SelectionToolKind, StudioToolHintPreviewKind>;

const COMBINE_PREVIEWS = {
  add: "selection-add",
  subtract: "selection-subtract",
  intersect: "selection-intersect",
} satisfies Record<SelectionCombineMode, StudioToolHintPreviewKind>;

const SELECTION_ACTION_HINTS = {
  selectAll: {
    id: "pixel-selection-select-all",
    title: "전체 픽셀 선택",
    description: "현재 이미지의 모든 픽셀을 한 번에 선택합니다. 기존 선택은 전체 선택으로 바뀝니다.",
    shortcut: "⌘/Ctrl+A",
    preview: "selection-boundary",
    previewVariant: "select-all",
    tip: "선택 기록의 실행 취소로 바로 이전 경계로 돌아갈 수 있어요.",
  },
  clear: {
    id: "pixel-selection-clear",
    title: "선택 해제",
    description: "점선 선택 경계만 모두 해제합니다. 이미지 픽셀은 바뀌지 않습니다.",
    shortcut: "⌘/Ctrl+D",
    preview: "selection-boundary",
    previewVariant: "clear",
  },
  invert: {
    id: "pixel-selection-invert",
    title: "선택 반전",
    description: "현재 선택 안과 밖을 맞바꿉니다. 부분 보정·삭제·채우기의 대상도 함께 반전됩니다.",
    shortcut: "⌘/Ctrl+⇧+I",
    preview: "selection-boundary",
    previewVariant: "invert",
  },
  removeLastSubpath: {
    id: "pixel-selection-remove-last-subpath",
    title: "마지막 선택 영역 제거",
    description: "복합 선택에서 가장 최근에 그린 하위 영역 하나만 제거합니다. 문서 실행 취소 기록에는 영향을 주지 않습니다.",
    preview: "selection-boundary",
    previewVariant: "remove-last-subpath",
  },
  undo: {
    id: "pixel-selection-history-undo",
    title: "선택 작업 실행 취소",
    description: "마지막 선택 생성·이동·변형을 되돌립니다. 문서 픽셀 기록과는 별도로 관리됩니다.",
    shortcut: "⌘/Ctrl+Z",
    preview: "selection-history",
    previewVariant: "undo",
  },
  redo: {
    id: "pixel-selection-history-redo",
    title: "선택 작업 다시 실행",
    description: "방금 되돌린 선택 생성·이동·변형을 다시 적용합니다.",
    shortcut: "⌘/Ctrl+⇧+Z",
    preview: "selection-history",
    previewVariant: "redo",
  },
  expand: {
    id: "pixel-selection-expand",
    title: "선택 경계 확장",
    description: "확장량 슬라이더의 값만큼 선택 경계를 바깥쪽으로 넓힙니다. 픽셀 내용은 유지됩니다.",
    preview: "selection-boundary",
    previewVariant: "expand",
  },
  contract: {
    id: "pixel-selection-contract",
    title: "선택 경계 축소",
    description: "확장량 슬라이더의 값만큼 선택 경계를 안쪽으로 줄입니다. 픽셀 내용은 유지됩니다.",
    preview: "selection-boundary",
    previewVariant: "contract",
  },
  marqueeRotateCustom: {
    id: "pixel-selection-marquee-rotate-custom",
    title: "선택 경계 회전 적용",
    description: "회전 슬라이더의 각도만큼 선택 경계만 돌립니다. 선택 안의 픽셀은 움직이지 않습니다.",
    preview: "selection-marquee-transform",
    previewVariant: "rotate-custom",
  },
  marqueeRotateClockwise90: {
    id: "pixel-selection-marquee-rotate-cw-90",
    title: "선택 경계 시계 방향 90°",
    description: "선택 경계만 시계 방향으로 90° 돌립니다. 픽셀 내용은 제자리에 유지됩니다.",
    preview: "selection-marquee-transform",
    previewVariant: "rotate-cw-90",
  },
  marqueeRotateCounterclockwise90: {
    id: "pixel-selection-marquee-rotate-ccw-90",
    title: "선택 경계 반시계 방향 90°",
    description: "선택 경계만 반시계 방향으로 90° 돌립니다. 픽셀 내용은 제자리에 유지됩니다.",
    preview: "selection-marquee-transform",
    previewVariant: "rotate-ccw-90",
  },
  marqueeRotate180: {
    id: "pixel-selection-marquee-rotate-180",
    title: "선택 경계 180° 회전",
    description: "선택 경계만 180° 돌립니다. 픽셀 내용은 제자리에 유지됩니다.",
    preview: "selection-marquee-transform",
    previewVariant: "rotate-180",
  },
  marqueeFlipX: {
    id: "pixel-selection-marquee-flip-x",
    title: "선택 경계 좌우 반전",
    description: "선택 경계를 중심축 기준으로 좌우 반전합니다. 선택한 픽셀 내용은 바꾸지 않습니다.",
    preview: "selection-marquee-transform",
    previewVariant: "flip-x",
  },
  marqueeFlipY: {
    id: "pixel-selection-marquee-flip-y",
    title: "선택 경계 상하 반전",
    description: "선택 경계를 중심축 기준으로 상하 반전합니다. 선택한 픽셀 내용은 바꾸지 않습니다.",
    preview: "selection-marquee-transform",
    previewVariant: "flip-y",
  },
  marqueeScaleUp: {
    id: "pixel-selection-marquee-scale-up",
    title: "선택 경계 1.1배 확대",
    description: "선택 경계를 중심 기준으로 1.1배 키웁니다. 픽셀 내용은 제자리에 유지됩니다.",
    preview: "selection-marquee-transform",
    previewVariant: "scale-up",
  },
  marqueeScaleDown: {
    id: "pixel-selection-marquee-scale-down",
    title: "선택 경계 0.9배 축소",
    description: "선택 경계를 중심 기준으로 0.9배 줄입니다. 픽셀 내용은 제자리에 유지됩니다.",
    preview: "selection-marquee-transform",
    previewVariant: "scale-down",
  },
  contentApply: {
    id: "pixel-selection-content-apply",
    title: "픽셀 내용 변형 적용",
    description: "선택 안 픽셀을 설정한 배율과 각도로 변형해 원본에 굽고, 선택 경계도 결과를 따라갑니다.",
    preview: "selection-content-transform",
    previewVariant: "apply-scale-rotate",
    tip: "경계만 바꾸려면 위쪽의 선택 경계 변형을 사용하세요.",
  },
  contentRotate90: {
    id: "pixel-selection-content-rotate-cw-90",
    title: "픽셀 내용 시계 방향 90°",
    description: "선택 안 픽셀을 시계 방향으로 90° 돌려 원본에 굽습니다. 선택 경계도 함께 회전합니다.",
    preview: "selection-content-transform",
    previewVariant: "rotate-cw-90",
  },
  contentFlipX: {
    id: "pixel-selection-content-flip-x",
    title: "픽셀 내용 좌우 반전",
    description: "선택 안 픽셀을 좌우로 뒤집어 원본에 굽습니다. 선택 경계도 결과를 따라갑니다.",
    preview: "selection-content-transform",
    previewVariant: "flip-x",
  },
  contentFlipY: {
    id: "pixel-selection-content-flip-y",
    title: "픽셀 내용 상하 반전",
    description: "선택 안 픽셀을 상하로 뒤집어 원본에 굽습니다. 선택 경계도 결과를 따라갑니다.",
    preview: "selection-content-transform",
    previewVariant: "flip-y",
  },
  brightness: {
    id: "pixel-selection-adjust-brightness",
    title: "선택 영역 밝기 적용",
    description: "선택 영역 안 픽셀의 밝기만 조정해 원본에 굽습니다. 선택 바깥은 유지됩니다.",
    preview: "selection-adjust",
    previewVariant: "brightness",
  },
  hue: {
    id: "pixel-selection-adjust-hue",
    title: "선택 영역 색조 적용",
    description: "선택 영역 안 픽셀의 색조만 회전해 원본에 굽습니다. 선택 바깥은 유지됩니다.",
    preview: "selection-adjust",
    previewVariant: "hue",
  },
  deleteContent: {
    id: "pixel-selection-content-delete",
    title: "선택 영역 삭제",
    description: "선택 영역 안 픽셀을 지워 투명하게 만듭니다. 선택 바깥의 픽셀은 유지됩니다.",
    preview: "selection-content-transform",
    previewVariant: "delete",
  },
  contentAwareFill: {
    id: "pixel-selection-content-aware-fill",
    title: "콘텐츠 인식으로 채우기",
    description: "선택 영역을 지운 뒤 주변 픽셀의 색과 텍스처를 분석해 빈자리를 자연스럽게 채웁니다.",
    preview: "selection-content-transform",
    previewVariant: "content-aware-fill",
  },
} satisfies Record<string, StudioToolHintSpec>;

export type StudioSelectionToolsPanelProps = {
  selection: PixelSelection | null;
  activeTool: SelectionToolKind | null;
  combineMode: SelectionCombineMode;
  brushRadius?: number;
  busy?: boolean;
  /** 다각형 올가미 진행 중 꼭짓점 수 — 상태 라인 표시용. */
  polyLassoPointCount?: number;
  onPickTool: (tool: SelectionToolKind | null) => void;
  onCombineModeChange: (mode: SelectionCombineMode) => void;
  onBrushRadiusChange?: (px: number) => void;
  onFeatherChange: (px: number) => void;
  onToggleInvert: () => void;
  canUndoSelection: boolean;
  canRedoSelection: boolean;
  onUndoSelection: () => void;
  onRedoSelection: () => void;
  onUndoSubpath: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onExpand: (amountNorm: number) => void;
  onContract: (amountNorm: number) => void;
  /** 선택 마퀴만 회전(도, 시계 방향 양수). 픽셀 내용은 유지. */
  onRotate: (degrees: number) => void;
  /** 선택 마퀴 좌우(x)·상하(y) 반전. */
  onFlip: (axis: "x" | "y") => void;
  /** 선택 마퀴만 평행 이동(정규화 dx/dy). 선택 안 드래그와 동일 의미. */
  onTranslate: (dxNorm: number, dyNorm: number) => void;
  /** 선택 마퀴 중심 기준 스케일. */
  onScale: (factor: number) => void;
  /**
   * 내용 변형(Transform) — 선택 안 픽셀을 이동/회전/스케일/반전하고 마퀴도 따라감.
   * 파괴적 굽기(원본 src 교체).
   */
  onContentTransform: (transform: SelectionContentTransform) => void;
  onApplyAdjust: (plan: SelectionAdjustPlan) => void;
  onContentAwareFill: () => void;
};

/** 마퀴 이동 한 칸(정규화) — 이미지 폭 대비 약 2%. */
const MARQUEE_NUDGE = 0.02;

export function StudioSelectionToolsPanel({
  selection,
  activeTool,
  combineMode,
  brushRadius = SELECTION_BRUSH_RADIUS_DEFAULT,
  busy = false,
  polyLassoPointCount = 0,
  onPickTool,
  onCombineModeChange,
  onBrushRadiusChange,
  onFeatherChange,
  onToggleInvert,
  canUndoSelection,
  canRedoSelection,
  onUndoSelection,
  onRedoSelection,
  onUndoSubpath,
  onClearSelection,
  onSelectAll,
  onExpand,
  onContract,
  onRotate,
  onFlip,
  onTranslate,
  onScale,
  onContentTransform,
  onApplyAdjust,
  onContentAwareFill,
}: StudioSelectionToolsPanelProps): ReactElement {
  const [brightness, setBrightness] = useState(0);
  const [hue, setHue] = useState(0);
  const [expandAmount, setExpandAmount] = useState(SELECTION_EXPAND_DEFAULT);
  const [rotateAmount, setRotateAmount] = useState(15);
  const [contentScale, setContentScale] = useState(1);
  const [contentRotate, setContentRotate] = useState(15);

  const usable = isSelectionUsable(selection);
  const subpathCount = selection?.subpaths.length ?? 0;
  const hasTransformableBoundary = subpathCount > 0;
  const canAdjust = usable && !busy;
  const tools = onBrushRadiusChange ? SELECTION_TOOLS : SELECTION_TOOLS.filter((t) => t.id !== "brush");
  const busyUnavailableReason = busy ? "다른 픽셀 작업을 적용하는 동안 기다려 주세요." : undefined;
  const selectionUnavailableReason = busyUnavailableReason
    ?? (!usable ? "먼저 이미지에서 픽셀 영역을 선택하세요." : undefined);
  const boundaryUnavailableReason = selectionUnavailableReason
    ?? (!hasTransformableBoundary
      ? "전체 이미지 선택에는 변형할 점선 선택 경계가 없습니다."
      : undefined);
  const clearUnavailableReason = busyUnavailableReason
    ?? (!selection ? "해제할 선택 영역이 없습니다." : undefined);
  const lastSubpathUnavailableReason = busyUnavailableReason
    ?? (!selection || subpathCount === 0 ? "제거할 하위 선택 영역이 없습니다." : undefined);
  const undoUnavailableReason = busyUnavailableReason
    ?? (!canUndoSelection ? "되돌릴 선택 작업이 없습니다." : undefined);
  const redoUnavailableReason = busyUnavailableReason
    ?? (!canRedoSelection ? "다시 적용할 선택 작업이 없습니다." : undefined);
  const contentApplyUnavailableReason = selectionUnavailableReason
    ?? (contentScale === 1 && contentRotate === 0
      ? "내용 스케일이나 회전 값을 먼저 변경하세요."
      : undefined);
  const brightnessUnavailableReason = selectionUnavailableReason
    ?? (brightness === 0 ? "밝기 값을 0이 아닌 값으로 조절하세요." : undefined);
  const hueUnavailableReason = selectionUnavailableReason
    ?? (hue === 0 ? "색조 값을 0°가 아닌 값으로 조절하세요." : undefined);

  const applyThenReset = (plan: SelectionAdjustPlan, reset: () => void) => {
    onApplyAdjust(plan);
    reset();
  };

  return (
    <div
      className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5"
      data-studio-pixel-selection="true"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">픽셀 선택</p>
        <div className="flex items-center gap-1">
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.selectAll}
            disabled={busy}
            unavailableReason={busyUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              onClick={onSelectAll}
              disabled={busy}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              aria-label="전체 픽셀 선택"
            >
              전체
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.clear}
            disabled={Boolean(clearUnavailableReason)}
            unavailableReason={clearUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              onClick={onClearSelection}
              disabled={!selection || busy}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              aria-label="선택 해제"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              해제
            </button>
          </StudioToolHintTarget>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="선택 도구">
        {tools.map((tool) => {
          const Icon = TOOL_ICONS[tool.id];
          const active = activeTool === tool.id;
          return (
            <StudioToolHintTarget
              key={tool.id}
              hint={{
                id: `pixel-selection-${tool.id}`,
                title: tool.label,
                description: tool.tip,
                preview: TOOL_PREVIEWS[tool.id],
                tip:
                  tool.id === "poly-lasso"
                    ? "Enter 또는 더블클릭으로 닫고, Esc로 그리던 경로를 취소할 수 있어요."
                    : undefined,
              }}
              disabled={busy}
              unavailableReason={busyUnavailableReason}
              preferredSide="left"
            >
              <span className="inline-flex">
                <StudioToggleChip
                  active={active}
                  disabled={busy}
                  onClick={() => onPickTool(active ? null : tool.id)}
                  aria-label={tool.label}
                >
                  <span className="inline-flex items-center gap-1">
                    <Icon className="size-3" aria-hidden />
                    {tool.label}
                  </span>
                </StudioToggleChip>
              </span>
            </StudioToolHintTarget>
          );
        })}
      </div>

      {activeTool === "brush" && onBrushRadiusChange ? (
        <StudioSliderRow
          label="반경"
          min={SELECTION_BRUSH_RADIUS_RANGE.min}
          max={SELECTION_BRUSH_RADIUS_RANGE.max}
          step={SELECTION_BRUSH_RADIUS_RANGE.step}
          value={brushRadius}
          onChange={onBrushRadiusChange}
          readout={`${brushRadius}px`}
        />
      ) : null}

      <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
        결합
        <span className="flex items-center gap-1.5">
          {SELECTION_COMBINE_MODES.map((mode) => (
            <StudioToolHintTarget
              key={mode.id}
              hint={{
                id: `pixel-selection-combine-${mode.id}`,
                title: mode.label,
                description: mode.tip,
                preview: COMBINE_PREVIEWS[mode.id],
                tip:
                  mode.id === "add"
                    ? "새 영역을 기존 선택에 더하려면 ‘합치기’ 결합 모드 버튼을 선택하세요."
                    : mode.id === "subtract"
                      ? "새 영역을 기존 선택에서 빼려면 ‘빼기’ 결합 모드 버튼을 선택하세요."
                      : "겹친 픽셀만 남겨 정교한 마스크를 만들 때 유용해요.",
              }}
              disabled={busy}
              unavailableReason={busyUnavailableReason}
              preferredSide="left"
            >
              <span className="inline-flex">
                <StudioToggleChip
                  active={combineMode === mode.id}
                  disabled={busy}
                  onClick={() => onCombineModeChange(mode.id)}
                  aria-label={mode.label}
                >
                  {mode.label}
                </StudioToggleChip>
              </span>
            </StudioToolHintTarget>
          ))}
        </span>
      </div>

      <StudioSliderRow
        label="페더"
        min={SELECTION_FEATHER_RANGE.min}
        max={SELECTION_FEATHER_RANGE.max}
        step={SELECTION_FEATHER_RANGE.step}
        value={selection?.featherPx ?? 0}
        onChange={onFeatherChange}
        readout={`${selection?.featherPx ?? 0}px`}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <StudioToolHintTarget
          hint={SELECTION_ACTION_HINTS.invert}
          disabled={busy}
          unavailableReason={busyUnavailableReason}
          preferredSide="left"
        >
          <span className="inline-flex">
            <StudioToggleChip
              active={!!selection?.invert}
              disabled={busy}
              onClick={onToggleInvert}
              aria-label="선택 반전"
            >
              반전
            </StudioToggleChip>
          </span>
        </StudioToolHintTarget>
        <StudioToolHintTarget
          hint={SELECTION_ACTION_HINTS.removeLastSubpath}
          disabled={Boolean(lastSubpathUnavailableReason)}
          unavailableReason={lastSubpathUnavailableReason}
          preferredSide="left"
        >
          <button
            type="button"
            onClick={onUndoSubpath}
            disabled={!selection || subpathCount === 0 || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            aria-label="마지막 선택 영역 제거"
          >
            <Undo2 className="size-3.5" aria-hidden />
            마지막 영역 제거
          </button>
        </StudioToolHintTarget>
      </div>

      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line/40 bg-bg/35 p-1.5"
        role="group"
        aria-label="픽셀 선택 기록"
      >
        <span className="mr-auto text-[0.66rem] font-medium text-fg-3">선택 기록</span>
        <StudioToolHintTarget
          hint={SELECTION_ACTION_HINTS.undo}
          disabled={Boolean(undoUnavailableReason)}
          unavailableReason={undoUnavailableReason}
          preferredSide="left"
        >
          <button
            type="button"
            onClick={onUndoSelection}
            disabled={!canUndoSelection || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            aria-label="선택 작업 실행 취소"
          >
            <Undo2 className="size-3.5" aria-hidden />
            실행 취소
          </button>
        </StudioToolHintTarget>
        <StudioToolHintTarget
          hint={SELECTION_ACTION_HINTS.redo}
          disabled={Boolean(redoUnavailableReason)}
          unavailableReason={redoUnavailableReason}
          preferredSide="left"
        >
          <button
            type="button"
            onClick={onRedoSelection}
            disabled={!canRedoSelection || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            aria-label="선택 작업 다시 실행"
          >
            <Redo2 className="size-3.5" aria-hidden />
            다시 실행
          </button>
        </StudioToolHintTarget>
      </div>

      {/* 확장 / 축소 */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line/40 pt-2">
        <StudioSliderRow
          label="확장량"
          min={SELECTION_EXPAND_RANGE.min}
          max={SELECTION_EXPAND_RANGE.max}
          step={SELECTION_EXPAND_RANGE.step}
          value={expandAmount}
          onChange={setExpandAmount}
          readout={`${Math.round(expandAmount * 1000) / 10}‰`}
        />
        <StudioToolHintTarget
          hint={SELECTION_ACTION_HINTS.expand}
          disabled={Boolean(boundaryUnavailableReason)}
          unavailableReason={boundaryUnavailableReason}
          preferredSide="left"
        >
          <button
            type="button"
            disabled={Boolean(boundaryUnavailableReason)}
            className={buttonClass({ size: "sm", variant: "outline" })}
            onClick={() => onExpand(expandAmount)}
            aria-label="선택 경계 확장"
          >
            <Maximize2 className="size-3.5" aria-hidden />
            확장
          </button>
        </StudioToolHintTarget>
        <StudioToolHintTarget
          hint={SELECTION_ACTION_HINTS.contract}
          disabled={Boolean(boundaryUnavailableReason)}
          unavailableReason={boundaryUnavailableReason}
          preferredSide="left"
        >
          <button
            type="button"
            disabled={Boolean(boundaryUnavailableReason)}
            className={buttonClass({ size: "sm", variant: "outline" })}
            onClick={() => onContract(expandAmount)}
            aria-label="선택 경계 축소"
          >
            <Minimize2 className="size-3.5" aria-hidden />
            축소
          </button>
        </StudioToolHintTarget>
      </div>

      {/* 선택 마퀴 회전 / 뒤집기 — 픽셀 내용은 그대로, 경계만 변형(Transform Selection). */}
      <div className="space-y-1.5 border-t border-line/40 pt-2">
        <StudioSliderRow
          label="회전"
          min={SELECTION_ROTATE_RANGE.min}
          max={SELECTION_ROTATE_RANGE.max}
          step={SELECTION_ROTATE_RANGE.step}
          value={rotateAmount}
          onChange={setRotateAmount}
          readout={`${rotateAmount}°`}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.marqueeRotateCustom}
            disabled={Boolean(boundaryUnavailableReason) || rotateAmount === 0}
            unavailableReason={
              boundaryUnavailableReason
              ?? (rotateAmount === 0 ? "회전 각도를 0°가 아닌 값으로 설정하세요." : undefined)
            }
            preferredSide="left"
          >
            <button
              type="button"
              disabled={Boolean(boundaryUnavailableReason) || rotateAmount === 0}
              className={buttonClass({ size: "sm", variant: "outline" })}
              onClick={() => onRotate(rotateAmount)}
              aria-label="선택 경계 회전 적용"
            >
              <RotateCw className="size-3.5" aria-hidden />
              적용
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.marqueeRotateClockwise90}
            disabled={Boolean(boundaryUnavailableReason)}
            unavailableReason={boundaryUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={Boolean(boundaryUnavailableReason)}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onRotate(90)}
              aria-label="선택 경계 시계 방향 90도 회전"
            >
              <RotateCw className="size-3.5" aria-hidden />
              90°
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.marqueeRotateCounterclockwise90}
            disabled={Boolean(boundaryUnavailableReason)}
            unavailableReason={boundaryUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={Boolean(boundaryUnavailableReason)}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onRotate(-90)}
              aria-label="선택 경계 반시계 방향 90도 회전"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              -90°
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.marqueeRotate180}
            disabled={Boolean(boundaryUnavailableReason)}
            unavailableReason={boundaryUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={Boolean(boundaryUnavailableReason)}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onRotate(180)}
              aria-label="선택 경계 180도 회전"
            >
              180°
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.marqueeFlipX}
            disabled={Boolean(boundaryUnavailableReason)}
            unavailableReason={boundaryUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={Boolean(boundaryUnavailableReason)}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onFlip("x")}
              aria-label="선택 경계 좌우 반전"
            >
              <FlipHorizontal2 className="size-3.5" aria-hidden />
              좌우
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.marqueeFlipY}
            disabled={Boolean(boundaryUnavailableReason)}
            unavailableReason={boundaryUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={Boolean(boundaryUnavailableReason)}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onFlip("y")}
              aria-label="선택 경계 상하 반전"
            >
              <FlipVertical2 className="size-3.5" aria-hidden />
              상하
            </button>
          </StudioToolHintTarget>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[0.66rem] text-fg-3">
            <Move className="size-3" aria-hidden />
            마퀴 이동
          </span>
          {(
            [
              { dx: -MARQUEE_NUDGE, dy: 0, label: "왼쪽", variant: "translate-left", Icon: ArrowLeft },
              { dx: MARQUEE_NUDGE, dy: 0, label: "오른쪽", variant: "translate-right", Icon: ArrowRight },
              { dx: 0, dy: -MARQUEE_NUDGE, label: "위", variant: "translate-up", Icon: ArrowUp },
              { dx: 0, dy: MARQUEE_NUDGE, label: "아래", variant: "translate-down", Icon: ArrowDown },
            ] as const
          ).map(({ dx, dy, label, variant, Icon }) => (
            <StudioToolHintTarget
              key={label}
              hint={{
                id: `pixel-selection-marquee-${variant}`,
                title: `선택 경계 ${label} 이동`,
                description: `선택 경계만 ${label}으로 한 칸 옮깁니다. 선택 안의 픽셀은 제자리에 유지됩니다.`,
                preview: "selection-marquee-transform",
                previewVariant: variant,
              }}
              disabled={Boolean(boundaryUnavailableReason)}
              unavailableReason={boundaryUnavailableReason}
              preferredSide="left"
            >
              <button
                type="button"
                disabled={Boolean(boundaryUnavailableReason)}
                className={buttonClass({ size: "sm", variant: "quiet" })}
                onClick={() => onTranslate(dx, dy)}
                aria-label={`선택 경계 ${label} 이동`}
              >
                <Icon className="size-3.5" aria-hidden />
              </button>
            </StudioToolHintTarget>
          ))}
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.marqueeScaleUp}
            disabled={Boolean(boundaryUnavailableReason)}
            unavailableReason={boundaryUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={Boolean(boundaryUnavailableReason)}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onScale(1.1)}
              aria-label="선택 경계 1.1배 확대"
            >
              확대
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.marqueeScaleDown}
            disabled={Boolean(boundaryUnavailableReason)}
            unavailableReason={boundaryUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={Boolean(boundaryUnavailableReason)}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onScale(0.9)}
              aria-label="선택 경계 0.9배 축소"
            >
              축소
            </button>
          </StudioToolHintTarget>
        </div>
      </div>

      {/* 내용 변형(Transform) — 선택 안 픽셀 내용 변형(굽기). 마퀴 회전/이동과 구분. */}
      <div className="space-y-1.5 border-t border-line/40 pt-2">
        <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
          내용 변형 (Transform)
        </p>
        <StudioSliderRow
          label="내용 스케일"
          min={0.25}
          max={2}
          step={0.05}
          value={contentScale}
          onChange={setContentScale}
          readout={`×${contentScale.toFixed(2)}`}
        />
        <StudioSliderRow
          label="내용 회전"
          min={SELECTION_ROTATE_RANGE.min}
          max={SELECTION_ROTATE_RANGE.max}
          step={SELECTION_ROTATE_RANGE.step}
          value={contentRotate}
          onChange={setContentRotate}
          readout={`${contentRotate}°`}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.contentApply}
            disabled={Boolean(contentApplyUnavailableReason)}
            unavailableReason={contentApplyUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={!usable || busy || (contentScale === 1 && contentRotate === 0)}
              className={buttonClass({ size: "sm", variant: "outline" })}
              onClick={() =>
                onContentTransform({
                  scale: contentScale === 1 ? undefined : contentScale,
                  rotateDeg: contentRotate === 0 ? undefined : contentRotate,
                })
              }
              aria-label="픽셀 내용 변형 적용"
            >
              {busy ? "적용 중..." : "내용 적용"}
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.contentRotate90}
            disabled={Boolean(selectionUnavailableReason)}
            unavailableReason={selectionUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={!usable || busy}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onContentTransform({ rotateDeg: 90 })}
              aria-label="픽셀 내용 시계 방향 90도 회전"
            >
              <RotateCw className="size-3.5" aria-hidden />
              내용 90°
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.contentFlipX}
            disabled={Boolean(selectionUnavailableReason)}
            unavailableReason={selectionUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={!usable || busy}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onContentTransform({ flipX: true })}
              aria-label="픽셀 내용 좌우 반전"
            >
              <FlipHorizontal2 className="size-3.5" aria-hidden />
              내용 좌우
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.contentFlipY}
            disabled={Boolean(selectionUnavailableReason)}
            unavailableReason={selectionUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              disabled={!usable || busy}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              onClick={() => onContentTransform({ flipY: true })}
              aria-label="픽셀 내용 상하 반전"
            >
              <FlipVertical2 className="size-3.5" aria-hidden />
              내용 상하
            </button>
          </StudioToolHintTarget>
        </div>
        <p className="text-[0.68rem] leading-relaxed text-fg-3">
          마퀴만 바꾸려면 위 회전·이동을, 그림 자체를 옮기려면 내용 변형을 쓰세요. ⌘⇧I 반전 ·
          픽셀 선택 중 ⌘D 해제도 지원합니다.
        </p>
      </div>

      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {usable
          ? `영역 ${subpathCount}개 · 페더 ${selection!.featherPx}px${selection!.invert ? " · 반전" : ""}`
          : activeTool === "poly-lasso"
            ? polyLassoPointCount > 0
              ? `꼭짓점 ${polyLassoPointCount}개 · 더블클릭 또는 Enter로 닫기 · Esc 취소`
              : "이미지 위를 클릭해 꼭짓점을 찍으세요. 더블클릭/Enter로 닫습니다."
            : activeTool === "brush"
              ? "이미지 위를 붓으로 칠하면 칠한 자리가 선택됩니다."
              : activeTool === "lasso"
                ? "이미지 위에서 드래그해 자유 올가미로 감싸세요. 손을 떼면 자동으로 닫힙니다."
                : activeTool
                  ? "이미지 위에서 드래그해 영역을 그리세요. 점선 선택 경계가 영역을 표시합니다."
                  : "도구를 켜고 이미지 위에서 드래그(또는 다각형 올가미는 클릭)하면 픽셀을 선택할 수 있습니다."}
      </p>

      <div className="space-y-1.5 border-t border-line/40 pt-2">
        <div className="flex items-center gap-1.5">
          <StudioSliderRow
            label="밝기"
            min={SELECTION_BRIGHTNESS_RANGE.min}
            max={SELECTION_BRIGHTNESS_RANGE.max}
            step={SELECTION_BRIGHTNESS_RANGE.step}
            value={brightness}
            onChange={setBrightness}
            readout={String(brightness)}
          />
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.brightness}
            disabled={Boolean(brightnessUnavailableReason)}
            unavailableReason={brightnessUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              onClick={() =>
                applyThenReset(
                  planSelectionAdjust("brightness", brightness),
                  () => setBrightness(0)
                )
              }
              disabled={!canAdjust || brightness === 0}
              className={buttonClass({ size: "sm", variant: "outline" })}
              aria-label="선택 영역 밝기 적용"
            >
              적용
            </button>
          </StudioToolHintTarget>
        </div>
        <div className="flex items-center gap-1.5">
          <StudioSliderRow
            label="색조"
            min={SELECTION_HUE_RANGE.min}
            max={SELECTION_HUE_RANGE.max}
            step={SELECTION_HUE_RANGE.step}
            value={hue}
            onChange={setHue}
            readout={`${hue}°`}
          />
          <StudioToolHintTarget
            hint={SELECTION_ACTION_HINTS.hue}
            disabled={Boolean(hueUnavailableReason)}
            unavailableReason={hueUnavailableReason}
            preferredSide="left"
          >
            <button
              type="button"
              onClick={() =>
                applyThenReset(planSelectionAdjust("hue", hue), () => setHue(0))
              }
              disabled={!canAdjust || hue === 0}
              className={buttonClass({ size: "sm", variant: "outline" })}
              aria-label="선택 영역 색조 적용"
            >
              적용
            </button>
          </StudioToolHintTarget>
        </div>
        <StudioToolHintTarget
          hint={SELECTION_ACTION_HINTS.deleteContent}
          disabled={Boolean(selectionUnavailableReason)}
          unavailableReason={selectionUnavailableReason}
          preferredSide="left"
          className="w-full"
        >
          <button
            type="button"
            onClick={() => onApplyAdjust(planSelectionAdjust("delete"))}
            disabled={!canAdjust}
            className={cn(
              buttonClass({ size: "sm", variant: "quiet" }),
              "w-full gap-1 text-bad"
            )}
            aria-label="선택 영역 삭제"
          >
            <Eraser className="size-3.5" aria-hidden />
            {busy ? "적용 중..." : "선택 영역 삭제"}
          </button>
        </StudioToolHintTarget>
        <StudioToolHintTarget
          hint={SELECTION_ACTION_HINTS.contentAwareFill}
          disabled={Boolean(selectionUnavailableReason)}
          unavailableReason={selectionUnavailableReason}
          preferredSide="left"
          className="w-full"
        >
          <button
            type="button"
            onClick={onContentAwareFill}
            disabled={!canAdjust}
            className={cn(buttonClass({ size: "sm", variant: "outline" }), "w-full gap-1")}
            aria-label="콘텐츠 인식으로 채우기"
          >
            <WandSparkles className="size-3.5" aria-hidden />
            {busy ? "채우는 중..." : "콘텐츠 인식으로 채우기"}
          </button>
        </StudioToolHintTarget>
      </div>
    </div>
  );
}
