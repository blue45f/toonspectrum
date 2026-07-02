/**
 * Studio Selection Tools Panel
 * 픽셀 선택 도구 인스펙터 — 사각/타원/올가미 도구 토글 + 결합 모드(합치기/빼기) +
 * 페더/반전 + 선택 영역 한정 조정(밝기/색조/삭제) 실행 버튼.
 *
 * ⚠️ studio-selection.ts(요소 다중 선택)가 아니라 studio-selection-tools.ts(이미지 안쪽
 * "픽셀 영역" 선택)의 UI 다. 선택 상태·도구 모드는 상위(StudioPage)가 소유하는
 * fully-controlled 프레젠테이션 컴포넌트 — 로컬 상태는 "적용 전" 밝기/색조 양뿐이며
 * 적용 시 planSelectionAdjust 로 계획을 만들어 onApplyAdjust 로 돌려준다.
 */
import { Circle, Eraser, Lasso, RotateCcw, Square, Undo2 } from "lucide-react";
import { useState } from "react";

import { StudioSliderRow, StudioToggleChip } from "./studio-panel-ui";
import {
  SELECTION_BRIGHTNESS_RANGE,
  SELECTION_COMBINE_MODES,
  SELECTION_FEATHER_RANGE,
  SELECTION_HUE_RANGE,
  SELECTION_TOOLS,
  isSelectionUsable,
  planSelectionAdjust,
  type PixelSelection,
  type SelectionAdjustPlan,
  type SelectionCombineMode,
  type SelectionToolKind,
} from "./studio-selection-tools";

import type { ReactElement } from "react";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

/** 도구별 아이콘 — SELECTION_TOOLS 의 id 와 1:1. */
const TOOL_ICONS: Record<SelectionToolKind, typeof Square> = {
  rect: Square,
  ellipse: Circle,
  lasso: Lasso,
};

export type StudioSelectionToolsPanelProps = {
  /** 현재 픽셀 선택 상태 — null 이면 선택 없음. */
  selection: PixelSelection | null;
  /** 켜져 있는 선택 도구 — null 이면 꺼짐(일반 요소 조작 모드). */
  activeTool: SelectionToolKind | null;
  /** 다음 드래그의 결합 모드(합치기/빼기). */
  combineMode: SelectionCombineMode;
  /** 마스크 래스터화·적용 진행 중 — 컨트롤 잠금. */
  busy?: boolean;
  /** 도구 토글 — 같은 도구를 다시 고르면 null(끄기)로 호출된다. */
  onPickTool: (tool: SelectionToolKind | null) => void;
  onCombineModeChange: (mode: SelectionCombineMode) => void;
  onFeatherChange: (px: number) => void;
  onToggleInvert: () => void;
  /** 마지막 서브패스 한 단계 되돌리기. */
  onUndoSubpath: () => void;
  /** 선택 전체 해제. */
  onClearSelection: () => void;
  /** 선택 영역 한정 조정 실행(밝기/색조/삭제) — 원본 픽셀을 변경하는 파괴적 작업. */
  onApplyAdjust: (plan: SelectionAdjustPlan) => void;
};

export function StudioSelectionToolsPanel({
  selection,
  activeTool,
  combineMode,
  busy = false,
  onPickTool,
  onCombineModeChange,
  onFeatherChange,
  onToggleInvert,
  onUndoSubpath,
  onClearSelection,
  onApplyAdjust,
}: StudioSelectionToolsPanelProps): ReactElement {
  // 적용 전 조정 양 — 파괴적 적용 버튼을 누르기 전까지는 문서에 반영되지 않는 로컬 값.
  const [brightness, setBrightness] = useState(0);
  const [hue, setHue] = useState(0);

  const usable = isSelectionUsable(selection);
  const subpathCount = selection?.subpaths.length ?? 0;
  const canAdjust = usable && !busy;

  const applyThenReset = (plan: SelectionAdjustPlan, reset: () => void) => {
    onApplyAdjust(plan);
    reset(); // 적용된 양이 이월 누적되지 않도록 0 으로 복귀(포토샵 대화상자와 동일).
  };

  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-card/45 p-2.5">
      {/* 헤더 + 선택 해제 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">픽셀 선택</p>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={!selection || busy}
          className={buttonClass({ size: "sm", variant: "quiet" })}
          title="선택 영역을 모두 해제합니다."
        >
          <RotateCcw className="size-3.5" />
          선택 해제
        </button>
      </div>

      {/* 도구 — 켜면 이미지 위 드래그가 픽셀 선택이 된다. 같은 도구 재클릭 = 끄기. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SELECTION_TOOLS.map((tool) => {
          const Icon = TOOL_ICONS[tool.id];
          const active = activeTool === tool.id;
          return (
            <StudioToggleChip
              key={tool.id}
              active={active}
              onClick={() => onPickTool(active ? null : tool.id)}
              title={tool.tip}
            >
              <span className="inline-flex items-center gap-1">
                <Icon className="size-3" aria-hidden />
                {tool.label}
              </span>
            </StudioToggleChip>
          );
        })}
      </div>

      {/* 결합 모드 — 다음 드래그를 기존 선택에 합칠지/뺄지. */}
      <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
        결합
        <span className="flex items-center gap-1.5">
          {SELECTION_COMBINE_MODES.map((mode) => (
            <StudioToggleChip
              key={mode.id}
              active={combineMode === mode.id}
              onClick={() => onCombineModeChange(mode.id)}
              title={mode.tip}
            >
              {mode.label}
            </StudioToggleChip>
          ))}
        </span>
      </div>

      {/* 페더 + 반전 + 한 단계 되돌리기 — 선택이 있어야 의미가 있다. */}
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

      {/* 상태 라인 — 도구 사용법 힌트 또는 현재 선택 요약. */}
      <p className="text-[0.72rem] leading-relaxed text-fg-3" role="status">
        {usable
          ? `영역 ${subpathCount}개 · 페더 ${selection!.featherPx}px${selection!.invert ? " · 반전" : ""}`
          : activeTool
            ? "이미지 위에서 드래그해 영역을 그리세요. 마칭앤츠(점선)가 선택을 표시합니다."
            : "도구를 켜고 이미지 위에서 드래그하면 픽셀 영역을 선택할 수 있습니다."}
      </p>

      {/* 선택 영역 한정 조정 — 밝기/색조는 슬라이더로 양을 정하고 적용, 삭제는 즉시. */}
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
          title="선택 영역 안 픽셀을 지워 투명하게 만듭니다(페더가 적용된 부드러운 가장자리)."
        >
          <Eraser className="size-3.5" aria-hidden />
          {busy ? "적용 중..." : "선택 영역 삭제"}
        </button>
      </div>
    </div>
  );
}
