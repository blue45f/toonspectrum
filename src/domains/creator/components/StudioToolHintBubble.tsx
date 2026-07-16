import { Lightbulb, LockKeyhole, Sparkles } from "lucide-react";
import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type ReactElement,
} from "react";

import {
  planStudioToolHintPosition,
  type StudioToolHintSide,
} from "../studio-tool-hint-position";
import { studioToolHintPreview } from "../studio-tool-hint-preview-routing";

import type { StudioToolHintSpec } from "../studio-tool-hints";

import { cn } from "@/lib/utils";

const COMPACT_WIDTH = 240;
const COMPACT_HEIGHT = 112;
const COACH_WIDTH = 304;
const COACH_HEIGHT = 312;
// Keep the component state aligned with the max-height: 34rem stylesheet gate.
const MIN_RICH_COACH_VIEWPORT_HEIGHT = 545;

type HintAnchor = Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">;

export interface StudioToolHintBubbleProps {
  readonly hint: StudioToolHintSpec;
  readonly anchor: HintAnchor;
  readonly id?: string;
  readonly expanded?: boolean;
  /** Whether this compact first stage can expand into the animated coach. */
  readonly richPreviewEnabled?: boolean;
  /** Product-level reduction request; the preview still honors the OS preference when false. */
  readonly reducedMotion?: boolean;
  readonly unavailableReason?: string;
  readonly preferredSide?: StudioToolHintSide;
  readonly className?: string;
  readonly onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  readonly onMouseLeave?: MouseEventHandler<HTMLDivElement>;
}

let studioToolHintPreviewModulePromise:
  | Promise<typeof import("./StudioToolHintPreview")>
  | null = null;

function loadStudioToolHintPreviewModule() {
  studioToolHintPreviewModulePromise ??= import("./StudioToolHintPreview");
  return studioToolHintPreviewModulePromise;
}

const LazyStudioToolHintPreview = lazy(async () => ({
  default: (await loadStudioToolHintPreviewModule()).StudioToolHintPreview,
}));

function StudioToolHintPreviewFallback({ preview }: { preview: string }): ReactElement {
  return (
    <svg
      data-studio-tool-hint-preview={preview}
      data-preview-kind={preview}
      data-motion="loading"
      viewBox="0 0 216 104"
      preserveAspectRatio="xMidYMid meet"
      className="block h-auto w-full"
      focusable="false"
      aria-hidden="true"
    >
      <rect
        x=".5"
        y=".5"
        width="215"
        height="103"
        rx="7.5"
        fill="var(--color-card)"
        stroke="var(--color-line)"
      />
      <path
        d="M28 77c28-39 49 5 75-19 24-22 48-20 84-5"
        fill="none"
        stroke="var(--color-line-strong)"
        strokeLinecap="round"
        strokeWidth="3"
        opacity=".55"
      />
      <circle cx="28" cy="77" r="3" fill="var(--color-accent)" opacity=".72" />
    </svg>
  );
}

function arrowClass(side: StudioToolHintSide): string {
  if (side === "right") return "-left-1 border-b border-l";
  if (side === "left") return "-right-1 border-r border-t";
  if (side === "bottom") return "-top-1 border-l border-t";
  return "-bottom-1 border-b border-r";
}

function arrowStyle(side: StudioToolHintSide, offset: number): CSSProperties {
  return side === "right" || side === "left"
    ? { top: offset - 4 }
    : { left: offset - 4 };
}

function defaultHintId(hint: StudioToolHintSpec): string {
  const safeId = hint.id.replace(/[^a-zA-Z0-9_-]+/gu, "-");
  return `studio-tool-hint-${safeId || "tool"}`;
}

export function StudioToolHintBubble({
  hint,
  anchor,
  id,
  expanded = true,
  richPreviewEnabled = true,
  reducedMotion = false,
  unavailableReason,
  preferredSide,
  className,
  onMouseEnter,
  onMouseLeave,
}: StudioToolHintBubbleProps): ReactElement {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const viewportWidth = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1280;
  const viewportHeight = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 800;
  const coachExpanded =
    richPreviewEnabled && expanded && viewportHeight >= MIN_RICH_COACH_VIEWPORT_HEIGHT;
  const [measuredSize, setMeasuredSize] = useState({
    width: coachExpanded ? COACH_WIDTH : COMPACT_WIDTH,
    height: coachExpanded
      ? COACH_HEIGHT + (unavailableReason ? 40 : 0)
      : COMPACT_HEIGHT + (unavailableReason ? 40 : 0),
  });
  const resolvedPreferredSide = preferredSide ?? (anchor.bottom > viewportHeight * 0.72 ? "top" : "right");
  const position = planStudioToolHintPosition({
    anchor,
    viewportWidth,
    viewportHeight,
    popupWidth: measuredSize.width,
    popupHeight: measuredSize.height,
    preferredSide: resolvedPreferredSide,
    viewportPadding: 10,
  });
  const preview = studioToolHintPreview(hint);

  useEffect(() => {
    if (!richPreviewEnabled) return;
    void loadStudioToolHintPreviewModule();
  }, [richPreviewEnabled]);

  useLayoutEffect(() => {
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    setMeasuredSize((current) =>
      Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
        ? current
        : { width: rect.width, height: rect.height }
    );
  }, [coachExpanded, hint.description, hint.tip, unavailableReason]);

  return (
    <div
      ref={bubbleRef}
      role="tooltip"
      data-studio-tool-hint="true"
      data-studio-tool-hint-expanded={coachExpanded ? "true" : "false"}
      data-studio-tool-hint-condensed={expanded && !coachExpanded ? "true" : undefined}
      data-side={position.side}
      id={id ?? defaultHintId(hint)}
      className={cn(
        "pointer-events-auto fixed z-[200] max-h-[calc(100vh-1.25rem)] overflow-hidden rounded-lg border border-line/80",
        "bg-panel/98 p-2.5 text-left shadow-[0_20px_56px_oklch(0.06_0.01_70/0.66)] backdrop-blur-xl",
        "transition-[width] duration-150 ease-out motion-reduce:transition-none",
        coachExpanded
          ? "w-[min(19rem,calc(100vw-1.25rem))]"
          : "w-[min(15rem,calc(100vw-1.25rem))]",
        className
      )}
      style={{ left: position.left, top: position.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        aria-hidden
        data-studio-tool-hint-arrow="true"
        className={cn(
          "absolute size-2 rotate-45 border-line/80 bg-panel",
          arrowClass(position.side)
        )}
        style={arrowStyle(position.side, position.arrowOffset)}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.8125rem] font-bold leading-tight text-fg">{hint.title}</p>
          {richPreviewEnabled ? (
            <span className="mt-1 inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-accent">
              <Sparkles size={10} strokeWidth={1.8} aria-hidden />
              {coachExpanded ? "동작 미리보기" : "잠시 머물러 미리보기"}
            </span>
          ) : null}
        </div>
        {hint.shortcut ? (
          <kbd
            data-studio-kbd="true"
            className="shrink-0 rounded-md border border-line/70 bg-canvas/75 px-1.5 py-0.5 text-[0.625rem] font-semibold tabular-nums text-fg-2 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.06)]"
          >
            {hint.shortcut}
          </kbd>
        ) : null}
      </div>

      {coachExpanded ? (
        <div
          data-studio-tool-hint-preview-frame="true"
          className="mt-2 overflow-hidden rounded-md border border-line/60 bg-canvas/70 shadow-[inset_0_1px_0_oklch(0.97_0.01_85/0.04)]"
        >
          <Suspense fallback={<StudioToolHintPreviewFallback preview={preview} />}>
            <LazyStudioToolHintPreview
              kind={preview}
              reducedMotion={reducedMotion ? true : undefined}
            />
          </Suspense>
        </div>
      ) : null}

      <p className={cn("text-[0.75rem] leading-relaxed text-fg-2", coachExpanded ? "mt-2" : "mt-1.5")}>
        {hint.description}
      </p>

      {unavailableReason ? (
        <div
          data-studio-tool-hint-unavailable="true"
          className="mt-2 flex items-start gap-1.5 rounded-md border border-warn/35 bg-warn/10 px-2 py-1.5 text-[0.7rem] leading-relaxed"
        >
          <LockKeyhole size={12} strokeWidth={1.9} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <span className="shrink-0 font-bold text-warn">사용 조건</span>
          <span className="min-w-0 text-fg-2">{unavailableReason}</span>
        </div>
      ) : null}

      {coachExpanded && hint.tip ? (
        <div
          data-studio-tool-hint-tip="true"
          className="mt-2 flex items-start gap-1.5 rounded-md border border-accent/20 bg-accent-soft/50 px-2 py-1.5 text-[0.7rem] leading-relaxed text-fg-2"
        >
          <Lightbulb size={12} strokeWidth={1.8} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>{hint.tip}</span>
        </div>
      ) : null}
    </div>
  );
}
