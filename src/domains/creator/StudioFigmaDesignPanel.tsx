/**
 * Figma-inspired Design panel fields (X / Y / W / H / ° / opacity).
 * Pure presentation — parent applies patches via onChange.
 */
import { FlipHorizontal2, FlipVertical2, ScanSearch } from "lucide-react";
import { useState } from "react";

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
    const next = Number(draft);
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(next) || next === settled) return;
    onCommit(next);
  }

  return (
    <label className="grid min-w-0 gap-0.5" title={inertHint}>
      <span className="text-[0.58rem] font-bold uppercase tracking-wide text-fg-3">
        {label}
      </span>
      <span className="flex items-center gap-0.5 rounded-lg border border-line bg-card px-1.5 py-1 focus-within:border-accent/50">
        <input
          type="number"
          inputMode="decimal"
          disabled={disabled}
          title={inertHint}
          step={step}
          min={min}
          max={max}
          value={draft ?? String(settled)}
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent text-[0.72rem] font-semibold tabular-nums text-fg outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
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
          <span className="shrink-0 text-[0.58rem] font-semibold text-fg-3">{suffix}</span>
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
  if (!metrics) return null;
  const multi = metrics.elementCount > 1;

  return (
    <section
      data-studio-figma-design-panel="true"
      aria-label="디자인 · 위치와 크기"
      className={cn(
        "rounded-xl border border-line/80 bg-panel/50 p-2.5 shadow-[inset_0_1px_0_oklch(0.98_0.01_85/0.04)]",
        className,
      )}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-extrabold tracking-tight text-fg">
            디자인
          </p>
          <p className="text-[0.6rem] font-medium text-fg-3">
            {multi
              ? `${metrics.elementCount}개 선택 · 공통 위치 기준`
              : "위치 · 크기 · 투명도 (Figma 스타일)"}
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
                className: "size-8 gap-0 px-0",
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
                className: "size-8 gap-0 px-0",
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
                className: "size-8 gap-0 px-0",
              })}
            >
              <FlipVertical2 size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Field
          label="X"
          value={metrics.x}
          disabled={disabled || multi}
          onCommit={(x) => onChange({ x })}
        />
        <Field
          label="Y"
          value={metrics.y}
          disabled={disabled || multi}
          onCommit={(y) => onChange({ y })}
        />
        <Field
          label="W"
          value={metrics.width}
          disabled={disabled || multi || !metrics.hasFixedSize}
          disabledReason={metrics.sizeDisabledReason}
          min={1}
          onCommit={(width) => onChange({ width })}
        />
        <Field
          label="H"
          value={metrics.height}
          disabled={disabled || multi || !metrics.hasFixedSize}
          disabledReason={metrics.sizeDisabledReason}
          min={1}
          onCommit={(height) => onChange({ height })}
        />
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Field
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
          label="불투명"
          value={Math.round(metrics.opacity * 100)}
          disabled={disabled || multi || !metrics.supportsOpacity}
          step={1}
          min={0}
          max={100}
          suffix="%"
          onCommit={(percent) => onChange({ opacity: percent / 100 })}
        />
      </div>

      {multi ? (
        <p className="mt-2 text-[0.6rem] leading-snug text-fg-3">
          여러 개 선택 중에는 정렬·분배·반전·선택 확대를 사용하세요. 개별 X/Y/W/H는
          하나만 선택했을 때 편집할 수 있어요.
        </p>
      ) : null}
      {!multi && metrics.rotationIsRelative && metrics.supportsRotation ? (
        <p className="mt-2 text-[0.6rem] leading-snug text-fg-3">
          선화는 회전이 점에 그대로 구워져요. 회전 칸은 현재 각도가 아니라 &ldquo;여기서 몇 도
          더&rdquo;예요 — 15를 넣으면 15° 돌아가고 칸은 0으로 돌아옵니다.
        </p>
      ) : null}
      {!multi && metrics.rotationIsRelative && metrics.rotationDisabledReason ? (
        <p className="mt-2 text-[0.6rem] leading-snug text-fg-3">
          {metrics.rotationDisabledReason}
        </p>
      ) : null}
    </section>
  );
}
