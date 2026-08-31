/**
 * Authoritative selection geometry fields (position / size / rotation / opacity).
 * Pure presentation — parent applies patches via onChange.
 */
import { FlipHorizontal2, FlipVertical2, ScanSearch } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  scrollStudioInspectorTargetIntoView,
  useStudioInspectorFocusRequest,
} from "./studio-inspector-focus-effect";

import type {
  StudioFigmaSelectionLayoutMetrics,
  StudioFigmaSelectionLayoutPatch,
} from "./studio-figma-selection-ux";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

export interface StudioFigmaDesignPanelProps {
  /** Null when nothing is selected — the panel renders nothing. */
  readonly metrics: StudioFigmaSelectionLayoutMetrics | null;
  readonly disabled?: boolean;
  readonly onChange: (patch: StudioFigmaSelectionLayoutPatch) => void;
  readonly onFlipHorizontal?: () => void;
  readonly onFlipVertical?: () => void;
  readonly onZoomToSelection?: () => void;
  readonly className?: string;
}

function Field({
  label,
  value,
  disabled,
  disabledReason,
  mixed = false,
  step = 1,
  min,
  max,
  suffix,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  /** Shown as the field's tooltip while it is inert, so a grey box always says why. */
  disabledReason?: string | null;
  /** Multiple selected values differ; an empty field stays editable as a shared override. */
  mixed?: boolean;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  onCommit: (next: number) => void;
}) {
  // Edits stay local until Enter/blur: committing per keystroke would push a half-typed
  // "1" (or a 0 from a momentarily empty field) straight onto the canvas — and would spend one
  // undo entry per digit. One typed number is one history step.
  const [draft, setDraft] = useState<string | null>(null);
  const settled = Number.isFinite(value) ? value : 0;
  const inertHint = disabled ? (disabledReason ?? undefined) : undefined;

  function commitDraft() {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    const next = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed));
    // A mixed field may intentionally be normalised to the first item's current value.
    // It still needs a commit so the remaining selected items receive that shared value.
    if (draft.trim() === "" || !Number.isFinite(parsed) || (!mixed && next === settled)) return;
    onCommit(next);
  }

  return (
    <label className="grid min-w-0 gap-0.5" title={inertHint}>
      <span className="text-xs font-bold tracking-tight text-fg-3">
        {label}
      </span>
      <span className="flex w-full min-w-0 items-center gap-0.5 overflow-hidden rounded-lg border border-line bg-card px-1.5 py-1 focus-within:border-accent/50">
        <input
          type="number"
          inputMode="decimal"
          disabled={disabled}
          title={inertHint}
          step={step}
          min={min}
          max={max}
          value={draft ?? (mixed ? "" : String(settled))}
          placeholder={mixed ? "혼합" : undefined}
          aria-label={label}
          className="w-0 min-w-0 flex-1 bg-transparent text-[0.8rem] font-semibold tabular-nums text-fg outline-none placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(null);
            }
          }}
        />
        {suffix ? (
          <span className="shrink-0 text-[0.68rem] font-semibold text-fg-3">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}

export function StudioFigmaDesignPanel({
  metrics,
  disabled = false,
  onChange,
  onFlipHorizontal,
  onFlipVertical,
  onZoomToSelection,
  className,
}: StudioFigmaDesignPanelProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [focusHighlighted, setFocusHighlighted] = useState(false);
  useStudioInspectorFocusRequest("selection.geometry", () => {
    setFocusHighlighted(true);
    scrollStudioInspectorTargetIntoView(rootRef.current);
    globalThis.requestAnimationFrame?.(() => {
      rootRef.current?.focus({ preventScroll: true });
    });
  });
  useEffect(() => {
    if (!focusHighlighted) return;
    const timeout = globalThis.setTimeout(() => setFocusHighlighted(false), 1_600);
    return () => globalThis.clearTimeout(timeout);
  }, [focusHighlighted]);

  if (!metrics) return null;
  const multi = metrics.elementCount > 1;

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      data-studio-figma-design-panel="true"
      data-studio-selection-scope={multi ? "multiple" : "single"}
      data-inspector-section="selection.geometry"
      data-inspector-section-highlighted={focusHighlighted ? "true" : undefined}
      aria-label="위치와 크기"
      className={cn(
        "rounded-xl border border-line/80 bg-panel/50 p-2.5 shadow-[inset_0_1px_0_oklch(0.98_0.01_85/0.04)] transition-[background-color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        focusHighlighted && "bg-accent-soft/55 shadow-[0_0_0_2px_oklch(0.72_0.185_42/0.55)]",
        className,
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-tight text-fg">
            위치와 크기
          </p>
          <p className="text-[0.7rem] font-medium text-fg-3">
            {multi
              ? `${metrics.elementCount}개 선택 · 공통 속성`
              : "좌표 · 크기 · 회전 · 투명도"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onZoomToSelection ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onZoomToSelection}
              title="선택 영역으로 확대 (⇧F)"
              aria-label="선택 영역으로 확대"
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "size-9 gap-0 px-0 pointer-coarse:size-11",
              })}
            >
              <ScanSearch size={14} aria-hidden />
            </button>
          ) : null}
          {onFlipHorizontal ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onFlipHorizontal}
              title="좌우 반전 (⇧H)"
              aria-label="선택 좌우 반전"
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "size-9 gap-0 px-0 pointer-coarse:size-11",
              })}
            >
              <FlipHorizontal2 size={14} aria-hidden />
            </button>
          ) : null}
          {onFlipVertical ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onFlipVertical}
              title="상하 반전 (⇧V)"
              aria-label="선택 상하 반전"
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "size-9 gap-0 px-0 pointer-coarse:size-11",
              })}
            >
              <FlipVertical2 size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <Field
          key={`x:${metrics.selectionKey}`}
          label="가로 위치 X"
          value={metrics.x}
          disabled={disabled}
          suffix="px"
          onCommit={(x) => onChange({ x })}
        />
        <Field
          key={`y:${metrics.selectionKey}`}
          label="세로 위치 Y"
          value={metrics.y}
          disabled={disabled}
          suffix="px"
          onCommit={(y) => onChange({ y })}
        />
        <Field
          key={`w:${metrics.selectionKey}`}
          label="너비 W"
          value={metrics.width}
          disabled={disabled || multi || !metrics.supportsWidth}
          disabledReason={metrics.widthDisabledReason}
          min={1}
          suffix="px"
          onCommit={(width) => onChange({ width })}
        />
        <Field
          key={`h:${metrics.selectionKey}`}
          label="높이 H"
          value={metrics.height}
          disabled={disabled || multi || !metrics.supportsHeight}
          disabledReason={metrics.heightDisabledReason}
          min={1}
          suffix="px"
          onCommit={(height) => onChange({ height })}
        />
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Field
          key={`rotation:${metrics.selectionKey}`}
          // A stroke has no stored angle, so the box is an "and now turn it this much" input
          // rather than a readout. Labelling it plain 회전 would promise a state that the
          // document does not carry.
          label={metrics.rotationIsRelative ? "회전(상대)" : "회전"}
          value={metrics.rotation}
          disabled={disabled || multi || !metrics.supportsRotation}
          disabledReason={metrics.rotationDisabledReason}
          step={1}
          suffix="°"
          onCommit={(rotation) => onChange({ rotation })}
        />
        <Field
          key={`opacity:${metrics.selectionKey}`}
          label="불투명"
          value={Math.round(metrics.opacity * 100)}
          disabled={disabled || !metrics.supportsOpacity}
          disabledReason={
            metrics.supportsOpacity
              ? null
              : "프레임이 포함된 선택은 불투명도를 함께 바꿀 수 없어요."
          }
          mixed={metrics.opacityMixed}
          step={1}
          min={0}
          max={100}
          suffix="%"
          onCommit={(percent) => onChange({ opacity: percent / 100 })}
        />
      </div>

      {multi ? (
        <div className="mt-2 space-y-1.5 rounded-lg bg-canvas/45 px-2 py-2 text-[0.7rem] leading-relaxed text-fg-3">
          <p>
            가로·세로 위치는 선택 묶음 전체를 이동하고, 불투명도는 한 번에 적용합니다.
            크기와 회전은 캔버스 핸들에서 조절해 주세요.
          </p>
          <p className="font-medium text-fg-2">
            색상·글자·클리핑처럼 대상마다 다른 속성은 한 개만 선택하면 표시됩니다.
          </p>
        </div>
      ) : null}
      {!multi && (!metrics.supportsWidth || !metrics.supportsHeight) ? (
        <p className="mt-2 rounded-md bg-canvas/45 px-2 py-1.5 text-[0.7rem] leading-relaxed text-fg-3">
          {metrics.widthDisabledReason ?? metrics.heightDisabledReason}
        </p>
      ) : null}
      {!multi && metrics.rotationIsRelative && metrics.supportsRotation ? (
        <p className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">
          선화는 회전이 점에 그대로 구워져요. 회전 칸은 현재 각도가 아니라 &ldquo;여기서 몇 도
          더&rdquo;예요 — 15를 넣으면 15° 돌아가고 칸은 0으로 돌아옵니다.
        </p>
      ) : null}
      {!multi && metrics.rotationIsRelative && metrics.rotationDisabledReason ? (
        <p className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">
          {metrics.rotationDisabledReason}
        </p>
      ) : null}
    </section>
  );
}
