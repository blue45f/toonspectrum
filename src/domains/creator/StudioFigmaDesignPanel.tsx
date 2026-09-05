/**
 * Authoritative selection geometry fields (position / size / rotation / opacity).
 * Pure presentation — parent applies patches via onChange.
 *
 * ## Why the numbers are folded (UX 감사 2026-09-02 §5.7)
 *
 * This panel used to render X·Y·W·H·회전·불투명도 plus three action buttons at the very
 * top of every selection — nine controls before the first type-specific property, while
 * the density contract (`studio-inspector-density.ts`) demotes numeric geometry to the
 * advanced tier because canvas handles are the primary path for it. The panel now shows
 * one essential control (불투명도) and a one-line 변형 summary; the numeric grid opens on
 * demand, remembers its state like every other inspector section, and still answers the
 * `selection.geometry` deep link from search and menus.
 */
import { ChevronDown, FlipHorizontal2, FlipVertical2, ScanSearch } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { STUDIO_INSPECTOR_CANONICAL_LABELS } from "./studio-inspector-density";
import {
  scrollStudioInspectorTargetIntoView,
  useStudioInspectorFocusRequest,
} from "./studio-inspector-focus-effect";
import {
  readStudioInspectorSectionOpen,
  writeStudioInspectorSectionOpen,
} from "./studio-inspector-section-state";
import {
  STUDIO_SELECTION_GEOMETRY_SECTION_ID,
  studioSelectionGeometrySummary,
} from "./studio-selection-geometry-summary";

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
  /** Multi-selection rotation is all-or-nothing; false keeps the field visible and explains why. */
  readonly multiRotationSupported?: boolean;
  readonly onChange: (patch: StudioFigmaSelectionLayoutPatch) => void;
  readonly onFlipHorizontal?: () => void;
  readonly onFlipVertical?: () => void;
  readonly onZoomToSelection?: () => void;
  readonly className?: string;
  /**
   * Opens the numeric grid on mount. Reserved for workspaces that promote precise
   * layout (a Figma-style profile); the default is the remembered state, closed at first.
   */
  readonly defaultGeometryOpen?: boolean;
}

function Field({
  label,
  controlId,
  priority,
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
  /** `data-inspector-control-id` — the canonical property this field edits. */
  controlId: string;
  /** `data-inspector-priority` — what the DOM density audit counts this as. */
  priority: "essential" | "advanced";
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
          data-inspector-control-id={controlId}
          data-inspector-priority={priority}
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
          <span className="shrink-0 text-[0.6875rem] font-semibold text-fg-3">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}

export function StudioFigmaDesignPanel({
  metrics,
  disabled = false,
  multiRotationSupported = true,
  onChange,
  onFlipHorizontal,
  onFlipVertical,
  onZoomToSelection,
  className,
  defaultGeometryOpen = false,
}: StudioFigmaDesignPanelProps) {
  const rootRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const gridId = useId();
  const [open, setOpen] = useState(() =>
    readStudioInspectorSectionOpen(STUDIO_SELECTION_GEOMETRY_SECTION_ID, defaultGeometryOpen),
  );
  const [focusHighlighted, setFocusHighlighted] = useState(false);
  useStudioInspectorFocusRequest("selection.geometry", () => {
    // A deep link lands on the numbers, not on a folded header the artist still has to find.
    setOpen(true);
    setFocusHighlighted(true);
    scrollStudioInspectorTargetIntoView(rootRef.current);
    globalThis.requestAnimationFrame?.(() => {
      headerRef.current?.focus({ preventScroll: true });
    });
  });
  useEffect(() => {
    if (!focusHighlighted) return;
    const timeout = globalThis.setTimeout(() => setFocusHighlighted(false), 1_600);
    return () => globalThis.clearTimeout(timeout);
  }, [focusHighlighted]);

  if (!metrics) return null;
  const multi = metrics.elementCount > 1;
  const opacityLabel = STUDIO_INSPECTOR_CANONICAL_LABELS.opacity;
  const multiRotationDisabledReason =
    "프레임 또는 회전할 수 없는 선화가 포함되어 있어 묶음 회전을 사용할 수 없어요.";

  /** Only a header press is remembered; a search deep link must not rewrite the preference. */
  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    writeStudioInspectorSectionOpen(STUDIO_SELECTION_GEOMETRY_SECTION_ID, next);
  };

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      data-studio-figma-design-panel="true"
      data-studio-selection-scope={multi ? "multiple" : "single"}
      data-inspector-section="selection.geometry"
      data-inspector-section-open={open ? "true" : "false"}
      data-inspector-section-highlighted={focusHighlighted ? "true" : undefined}
      aria-label="위치와 크기"
      className={cn(
        "rounded-xl border border-line/80 bg-panel/50 p-2.5 shadow-[inset_0_1px_0_oklch(0.98_0.01_85/0.04)] transition-[background-color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        focusHighlighted && "bg-accent-soft/55 shadow-[0_0_0_2px_oklch(0.72_0.185_42/0.55)]",
        className,
      )}
    >
      {/* Essential row — the one geometry-adjacent value every selection type edits from the
          panel rather than from canvas handles. */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] items-end gap-2">
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-tight text-fg">
            {multi ? `${metrics.elementCount}개 선택 · 공통 속성` : "선택 대상"}
          </p>
          <p className="truncate text-[0.6875rem] font-medium text-fg-3">
            {multi
              ? "위치·비율 크기·회전·불투명도를 묶음에 적용합니다"
              : "위치·크기는 캔버스 핸들 또는 아래 변형에서"}
          </p>
        </div>
        <Field
          key={`opacity:${metrics.selectionKey}`}
          label={opacityLabel}
          controlId="selection.opacity"
          priority="essential"
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

      {/* Folded 변형 — summary row while closed, numeric grid when open. */}
      <button
        ref={headerRef}
        type="button"
        aria-expanded={open}
        aria-controls={gridId}
        onClick={toggleOpen}
        data-inspector-priority="chrome"
        data-studio-selection-geometry-toggle="true"
        className={cn(
          "mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line/70 bg-card/60 px-2 py-1 text-left transition-colors hover:border-line-strong hover:bg-raised lg:min-h-9 pointer-coarse:min-h-11",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-xs font-bold text-fg">변형</span>
          <span
            className="truncate text-[0.6875rem] font-medium tabular-nums text-fg-3"
            data-studio-selection-geometry-summary="true"
          >
            {studioSelectionGeometrySummary(metrics)}
          </span>
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={open ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"}
        />
      </button>

      <div id={gridId} hidden={!open}>
        {open ? (
          <div className="mt-2">
            <div className="grid grid-cols-2 gap-2">
              <Field
                key={`x:${metrics.selectionKey}`}
                label="가로 위치 X"
                controlId="selection.x"
                priority="advanced"
                value={metrics.x}
                disabled={disabled}
                suffix="px"
                onCommit={(x) => onChange({ x })}
              />
              <Field
                key={`y:${metrics.selectionKey}`}
                label="세로 위치 Y"
                controlId="selection.y"
                priority="advanced"
                value={metrics.y}
                disabled={disabled}
                suffix="px"
                onCommit={(y) => onChange({ y })}
              />
              <Field
                key={`w:${metrics.selectionKey}`}
                label="너비 W"
                controlId="selection.width"
                priority="advanced"
                value={metrics.width}
                disabled={disabled || (!multi && !metrics.supportsWidth)}
                disabledReason={multi ? null : metrics.widthDisabledReason}
                min={1}
                suffix="px"
                onCommit={(width) => onChange({ width })}
              />
              <Field
                key={`h:${metrics.selectionKey}`}
                label="높이 H"
                controlId="selection.height"
                priority="advanced"
                value={metrics.height}
                disabled={disabled || (!multi && !metrics.supportsHeight)}
                disabledReason={multi ? null : metrics.heightDisabledReason}
                min={1}
                suffix="px"
                onCommit={(height) => onChange({ height })}
              />
              <Field
                key={`rotation:${metrics.selectionKey}`}
                // A stroke or a multi-selection stores no shared angle, so this is an incremental
                // turn rather than an absolute readout. The field returns to 0 after each commit.
                label={multi || metrics.rotationIsRelative ? "회전(상대)" : "회전"}
                controlId="selection.rotation"
                priority="advanced"
                value={multi ? 0 : metrics.rotation}
                disabled={
                  disabled
                  || (multi
                    ? !multiRotationSupported || !metrics.supportsRotation
                    : !metrics.supportsRotation)
                }
                disabledReason={
                  multi && !multiRotationSupported
                    ? multiRotationDisabledReason
                    : metrics.rotationDisabledReason
                }
                step={1}
                suffix="°"
                onCommit={(rotation) => onChange({ rotation })}
              />
              <div className="flex items-end justify-end gap-1">
                {onZoomToSelection ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={onZoomToSelection}
                    title="선택 영역으로 확대 (⇧F)"
                    aria-label="선택 영역으로 확대"
                    data-inspector-control-id="selection.zoom"
                    data-inspector-priority="advanced"
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
                    data-inspector-control-id="selection.flip-horizontal"
                    data-inspector-priority="advanced"
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
                    data-inspector-control-id="selection.flip-vertical"
                    data-inspector-priority="advanced"
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
            </div>

            {multi ? (
              <div className="mt-2 space-y-1.5 rounded-lg bg-canvas/45 px-2 py-2 text-[0.6875rem] leading-relaxed text-fg-3">
                <p>
                  X/Y는 선택 묶음 전체를 이동합니다. 전체 너비나 높이 한쪽을 입력하면 현재
                  비율을 유지해 모두 함께 크기를 조절하고, 회전은 현재 상태에서 더하는 상대
                  각도이며, 불투명도도 한 번에 적용합니다.
                </p>
                <p className="font-medium text-fg-2">
                  모든 대상이 한 번에 바뀌며, 잠금 또는 호환되지 않는 요소가 있으면 전체를 그대로 유지합니다.
                </p>
                {!multiRotationSupported ? (
                  <p role="status" className="font-semibold text-warning">
                    {multiRotationDisabledReason}
                  </p>
                ) : null}
              </div>
            ) : null}
            {!multi && (!metrics.supportsWidth || !metrics.supportsHeight) ? (
              <p className="mt-2 rounded-md bg-canvas/45 px-2 py-1.5 text-[0.6875rem] leading-relaxed text-fg-3">
                {metrics.widthDisabledReason ?? metrics.heightDisabledReason}
              </p>
            ) : null}
            {metrics.rotationIsRelative && metrics.supportsRotation ? (
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-fg-3">
                {multi ? (
                  <>
                    여러 요소의 회전 칸은 현재 각도가 아니라 &ldquo;여기서 몇 도 더&rdquo;예요.
                    15를 넣으면 선택 중심을 기준으로 모두 15° 돌아가고 칸은 0으로 돌아옵니다.
                  </>
                ) : (
                  <>
                    선화는 회전이 점에 그대로 구워져요. 회전 칸은 현재 각도가 아니라 &ldquo;여기서 몇 도
                    더&rdquo;예요 — 15를 넣으면 15° 돌아가고 칸은 0으로 돌아옵니다.
                  </>
                )}
              </p>
            ) : null}
            {metrics.rotationIsRelative && metrics.rotationDisabledReason ? (
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-fg-3">
                {metrics.rotationDisabledReason}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
