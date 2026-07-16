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
  onUndoSubpath: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onExpand: (amountNorm: number) => void;
  onContract: (amountNorm: number) => void;
  /** 선택 마퀴만 회전(도, 시계 방향 양수). 픽셀 내용은 유지. */
  onRotate: (degrees: number) => void;
  /** 선택 마퀴 좌우(x)·상하(y) 반전. */
  onFlip: (axis: "x" | "y") => void;
  /** 선택 마퀴만 평행 이동(정규화 dx/dy). Magma: 선택 안 드래그와 동일 의미. */
  onTranslate: (dxNorm: number, dyNorm: number) => void;
  /** 선택 마퀴 중심 기준 스케일. */
  onScale: (factor: number) => void;
  /**
   * Magma Transform — 선택 안 픽셀을 이동/회전/스케일/반전하고 마퀴도 따라감.
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
  const canAdjust = usable && !busy;
  const tools = onBrushRadiusChange ? SELECTION_TOOLS : SELECTION_TOOLS.filter((t) => t.id !== "brush");

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
          <button
            type="button"
            onClick={onSelectAll}
            disabled={busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="이미지 전체 픽셀을 선택합니다 (반전 전체 선택)."
          >
            전체
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={!selection || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 영역을 모두 해제합니다."
          >
            <RotateCcw className="size-3.5" />
            해제
          </button>
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
                preview: "lasso",
                tip:
                  tool.id === "poly-lasso"
                    ? "Enter 또는 더블클릭으로 닫고, Esc로 그리던 경로를 취소할 수 있어요."
                    : undefined,
              }}
            >
              <StudioToggleChip
                active={active}
                onClick={() => onPickTool(active ? null : tool.id)}
                aria-label={tool.label}
              >
                <span className="inline-flex items-center gap-1">
                  <Icon className="size-3" aria-hidden />
                  {tool.label}
                </span>
              </StudioToggleChip>
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
                preview: "select",
                tip:
                  mode.id === "add"
                    ? "Shift를 누르면 작업 중에도 합치기로 잠시 전환할 수 있어요."
                    : mode.id === "subtract"
                      ? "Alt 또는 Option을 누르면 작업 중에도 빼기로 잠시 전환할 수 있어요."
                      : "겹친 픽셀만 남겨 정교한 마스크를 만들 때 유용해요.",
              }}
            >
              <StudioToggleChip
                active={combineMode === mode.id}
                onClick={() => onCombineModeChange(mode.id)}
                aria-label={mode.label}
              >
                {mode.label}
              </StudioToggleChip>
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
        <StudioToggleChip
          active={!!selection?.invert}
          onClick={onToggleInvert}
          title="선택 영역을 반전합니다(그린 영역의 바깥을 선택)."
          aria-label="선택 반전"
        >
          반전
        </StudioToggleChip>
        <button
          type="button"
          onClick={onUndoSubpath}
          disabled={!selection || subpathCount === 0 || busy}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="마지막으로 그린 선택 영역 한 개를 되돌립니다."
        >
          <Undo2 className="size-3.5" />
          되돌리기
        </button>
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
        <button
          type="button"
          disabled={!usable || busy}
          className={buttonClass({ size: "sm", variant: "outline" })}
          title="선택 경계를 바깥으로 키웁니다."
          onClick={() => onExpand(expandAmount)}
        >
          <Maximize2 className="size-3.5" aria-hidden />
          확장
        </button>
        <button
          type="button"
          disabled={!usable || busy}
          className={buttonClass({ size: "sm", variant: "outline" })}
          title="선택 경계를 안쪽으로 줄입니다."
          onClick={() => onContract(expandAmount)}
        >
          <Minimize2 className="size-3.5" aria-hidden />
          축소
        </button>
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
          <button
            type="button"
            disabled={!usable || busy || rotateAmount === 0}
            className={buttonClass({ size: "sm", variant: "outline" })}
            title="슬라이더 각도만큼 선택 경계를 시계 방향으로 돌립니다(픽셀 유지)."
            onClick={() => onRotate(rotateAmount)}
          >
            <RotateCw className="size-3.5" aria-hidden />
            적용
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 경계를 시계 방향으로 90° 돌립니다."
            onClick={() => onRotate(90)}
            aria-label="시계 방향 90도"
          >
            <RotateCw className="size-3.5" aria-hidden />
            90°
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 경계를 반시계 방향으로 90° 돌립니다."
            onClick={() => onRotate(-90)}
            aria-label="반시계 방향 90도"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            -90°
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 경계를 180° 돌립니다."
            onClick={() => onRotate(180)}
            aria-label="180도 회전"
          >
            180°
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 경계를 좌우로 뒤집습니다."
            onClick={() => onFlip("x")}
            aria-label="좌우 반전"
          >
            <FlipHorizontal2 className="size-3.5" aria-hidden />
            좌우
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 경계를 상하로 뒤집습니다."
            onClick={() => onFlip("y")}
            aria-label="상하 반전"
          >
            <FlipVertical2 className="size-3.5" aria-hidden />
            상하
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[0.66rem] text-fg-3">
            <Move className="size-3" aria-hidden />
            마퀴 이동
          </span>
          {(
            [
              { dx: -MARQUEE_NUDGE, dy: 0, label: "왼쪽", Icon: ArrowLeft },
              { dx: MARQUEE_NUDGE, dy: 0, label: "오른쪽", Icon: ArrowRight },
              { dx: 0, dy: -MARQUEE_NUDGE, label: "위", Icon: ArrowUp },
              { dx: 0, dy: MARQUEE_NUDGE, label: "아래", Icon: ArrowDown },
            ] as const
          ).map(({ dx, dy, label, Icon }) => (
            <button
              key={label}
              type="button"
              disabled={!usable || busy}
              className={buttonClass({ size: "sm", variant: "quiet" })}
              title={`선택 경계만 ${label}으로 옮깁니다(픽셀 유지 · Magma 마퀴 이동).`}
              onClick={() => onTranslate(dx, dy)}
              aria-label={`마퀴 ${label} 이동`}
            >
              <Icon className="size-3.5" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 경계를 중심 기준으로 1.1배 키웁니다."
            onClick={() => onScale(1.1)}
          >
            확대
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 경계를 중심 기준으로 0.9배 줄입니다."
            onClick={() => onScale(0.9)}
          >
            축소
          </button>
        </div>
      </div>

      {/* Magma Transform — 선택 안 픽셀 내용 변형(굽기). 마퀴 회전/이동과 구분. */}
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
          <button
            type="button"
            disabled={!usable || busy || (contentScale === 1 && contentRotate === 0)}
            className={buttonClass({ size: "sm", variant: "outline" })}
            title="선택 안 픽셀을 스케일·회전해 원본에 굽습니다. 마퀴도 같이 따라갑니다. (Magma Shift+T)"
            onClick={() =>
              onContentTransform({
                scale: contentScale === 1 ? undefined : contentScale,
                rotateDeg: contentRotate === 0 ? undefined : contentRotate,
              })
            }
          >
            {busy ? "적용 중..." : "내용 적용"}
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 안 픽셀을 시계 방향 90° 돌립니다."
            onClick={() => onContentTransform({ rotateDeg: 90 })}
          >
            <RotateCw className="size-3.5" aria-hidden />
            내용 90°
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 안 픽셀을 좌우로 뒤집습니다."
            onClick={() => onContentTransform({ flipX: true })}
          >
            <FlipHorizontal2 className="size-3.5" aria-hidden />
            내용 좌우
          </button>
          <button
            type="button"
            disabled={!usable || busy}
            className={buttonClass({ size: "sm", variant: "quiet" })}
            title="선택 안 픽셀을 상하로 뒤집습니다."
            onClick={() => onContentTransform({ flipY: true })}
          >
            <FlipVertical2 className="size-3.5" aria-hidden />
            내용 상하
          </button>
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
                  ? "이미지 위에서 드래그해 영역을 그리세요. 마칭앤츠(점선)가 선택을 표시합니다."
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
          <button
            type="button"
            onClick={() => applyThenReset(planSelectionAdjust("brightness", brightness), () => setBrightness(0))}
            disabled={!canAdjust || brightness === 0}
            className={buttonClass({ size: "sm", variant: "outline" })}
            title="선택 영역 안 픽셀만 밝기를 조정해 원본에 굽습니다."
          >
            적용
          </button>
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
          <button
            type="button"
            onClick={() => applyThenReset(planSelectionAdjust("hue", hue), () => setHue(0))}
            disabled={!canAdjust || hue === 0}
            className={buttonClass({ size: "sm", variant: "outline" })}
            title="선택 영역 안 픽셀만 색조를 회전해 원본에 굽습니다."
          >
            적용
          </button>
        </div>
        <button
          type="button"
          onClick={() => onApplyAdjust(planSelectionAdjust("delete"))}
          disabled={!canAdjust}
          className={cn(buttonClass({ size: "sm", variant: "quiet" }), "w-full gap-1 text-bad")}
          title="선택 영역 안 픽셀을 지워 투명하게 만듭니다."
        >
          <Eraser className="size-3.5" aria-hidden />
          {busy ? "적용 중..." : "선택 영역 삭제"}
        </button>
        <button
          type="button"
          onClick={onContentAwareFill}
          disabled={!canAdjust}
          className={cn(buttonClass({ size: "sm", variant: "outline" }), "w-full gap-1")}
          title="선택 영역을 지우고 주변 텍스처로 채웁니다."
        >
          <WandSparkles className="size-3.5" aria-hidden />
          {busy ? "채우는 중..." : "콘텐츠 인식으로 채우기"}
        </button>
      </div>
    </div>
  );
}
