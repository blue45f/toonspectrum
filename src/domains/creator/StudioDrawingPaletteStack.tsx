/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- WAI-ARIA focusable separators are adjustable widgets with required pointer and keyboard input. */
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  SwatchBook,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "./studio-panel-ui";
import {
  DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
  STUDIO_DRAWING_PALETTE_MAX_PERCENT,
  STUDIO_DRAWING_PALETTE_MIN_PERCENT,
  moveStudioDrawingPalette,
  normalizeStudioDrawingPaletteLayout,
  resizeStudioDrawingPalettes,
  toggleStudioDrawingPalette,
  type StudioDrawingPaletteId,
  type StudioDrawingPaletteLayout,
} from "./studio-workspaces";

import { cn } from "@/lib/utils";

export interface StudioDrawingPaletteStackProps {
  readonly layout: StudioDrawingPaletteLayout;
  readonly subTools: ReactNode;
  readonly toolProperties: ReactNode;
  readonly onLayoutChange: (layout: StudioDrawingPaletteLayout) => void;
  readonly onDraggingChange?: (dragging: boolean) => void;
  /**
   * Mobile properties sheets already expose tool switching in the thumb dock. When supplied,
   * only this palette is rendered on small screens while the full persisted dock returns at lg.
   */
  readonly mobilePrimaryPaletteId?: StudioDrawingPaletteId;
  readonly mobileHeaderAction?: ReactNode;
  /**
   * Increment when the owning workspace/account changes. An active splitter drag is discarded
   * synchronously so a release from the previous owner can never overwrite the next layout.
   */
  readonly cancelEpoch?: number;
  readonly className?: string;
}

interface PaletteDefinition {
  readonly id: StudioDrawingPaletteId;
  readonly label: string;
  readonly Icon: typeof SwatchBook;
}

const PALETTES: Readonly<Record<StudioDrawingPaletteId, PaletteDefinition>> = {
  "sub-tools": {
    id: "sub-tools",
    label: "서브 도구",
    Icon: SwatchBook,
  },
  "tool-properties": {
    id: "tool-properties",
    label: "도구 속성",
    Icon: SlidersHorizontal,
  },
};

const SPLIT_KEYBOARD_STEP = 2;
const SPLIT_KEYBOARD_LARGE_STEP = 8;
const DOUBLE_TAP_MAX_DELAY_MS = 350;
const TAP_MAX_TRAVEL_PX = 8;
const DOUBLE_TAP_MAX_DISTANCE_PX = 24;

interface ResizeTap {
  readonly at: number;
  readonly clientX: number;
  readonly clientY: number;
}

type PaletteSectionStyle = CSSProperties & {
  "--studio-drawing-palette-size": string;
};

function finiteCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function paletteCollapsed(
  values: StudioDrawingPaletteLayout["collapsed"],
  id: StudioDrawingPaletteId,
): boolean {
  return values[id];
}

function paletteBody(
  id: StudioDrawingPaletteId,
  subTools: ReactNode,
  toolProperties: ReactNode,
): ReactNode {
  return id === "sub-tools" ? subTools : toolProperties;
}

function joinKoreanLabels(first: string, second: string): string {
  const lastCodePoint = first.codePointAt(first.length - 1);
  const hasFinalConsonant =
    lastCodePoint !== undefined &&
    lastCodePoint >= 0xac00 &&
    lastCodePoint <= 0xd7a3 &&
    (lastCodePoint - 0xac00) % 28 !== 0;
  return `${first}${hasFinalConsonant ? "과" : "와"} ${second}`;
}

/**
 * CLIP-familiar, ToonSpectrum-native drawing palette dock.
 *
 * The component owns interaction only. Order, collapse state, and split percentages remain
 * controlled workspace state so switching accounts, tabs, or saved workspaces cannot fork layout.
 */
export function StudioDrawingPaletteStack({
  layout,
  subTools,
  toolProperties,
  onLayoutChange,
  onDraggingChange,
  mobilePrimaryPaletteId,
  mobileHeaderAction,
  cancelEpoch,
  className,
}: StudioDrawingPaletteStackProps) {
  const normalizedLayout = normalizeStudioDrawingPaletteLayout(layout);
  const stackId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<StudioDrawingPaletteId, HTMLElement | null>>>({});
  const collapseButtonRefs =
    useRef<Partial<Record<StudioDrawingPaletteId, HTMLButtonElement | null>>>({});
  const focusedBodyRef = useRef<StudioDrawingPaletteId | null>(null);
  const previousCollapsedRef = useRef<StudioDrawingPaletteLayout["collapsed"]>(
    normalizedLayout.collapsed,
  );
  const activeDragCleanupRef =
    useRef<
      ((
        updateDraggingState?: boolean,
        restoreLayout?: StudioDrawingPaletteLayout,
      ) => void) | null
    >(null);
  const previousCancelEpochRef = useRef(cancelEpoch);
  const lastTapRef = useRef<ResizeTap | null>(null);
  const [dragging, setDragging] = useState(false);
  const openIds = normalizedLayout.order.filter((id) =>
    mobilePrimaryPaletteId
      ? id === mobilePrimaryPaletteId
      : !paletteCollapsed(normalizedLayout.collapsed, id),
  );
  const bothOpen = openIds.length === 2;
  const firstOpenId = openIds[0] ?? null;
  const secondOpenId = openIds[1] ?? null;

  useEffect(() => {
    const previouslyCollapsed = previousCollapsedRef.current;
    for (const id of normalizedLayout.order) {
      if (!normalizedLayout.collapsed[id] || previouslyCollapsed[id]) continue;
      if (focusedBodyRef.current !== id) continue;
      focusedBodyRef.current = null;
      collapseButtonRefs.current[id]?.focus({ preventScroll: true });
    }
    previousCollapsedRef.current = normalizedLayout.collapsed;
  }, [normalizedLayout.collapsed, normalizedLayout.order]);

  useEffect(() => {
    if (!dragging || typeof document === "undefined") return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragging]);

  useLayoutEffect(() => {
    if (Object.is(previousCancelEpochRef.current, cancelEpoch)) return;
    previousCancelEpochRef.current = cancelEpoch;
    activeDragCleanupRef.current?.(true, normalizedLayout);
  }, [cancelEpoch, normalizedLayout]);

  useLayoutEffect(
    () => () => {
      const cancelActiveDrag = activeDragCleanupRef.current;
      activeDragCleanupRef.current = null;
      cancelActiveDrag?.(false);
    },
    [],
  );

  function emit(next: StudioDrawingPaletteLayout): void {
    onLayoutChange(normalizeStudioDrawingPaletteLayout(next));
  }

  function resetSplit(firstId: StudioDrawingPaletteId): void {
    emit(
      resizeStudioDrawingPalettes(
        normalizedLayout,
        firstId,
        DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.sizes[firstId],
      ),
    );
  }

  function handleSplitKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
    firstId: StudioDrawingPaletteId,
  ): void {
    const current = normalizedLayout.sizes[firstId];
    const step = event.shiftKey
      ? SPLIT_KEYBOARD_LARGE_STEP
      : SPLIT_KEYBOARD_STEP;
    let next: number | null = null;
    if (event.key === "ArrowUp") next = current - step;
    else if (event.key === "ArrowDown") next = current + step;
    else if (event.key === "Home") next = STUDIO_DRAWING_PALETTE_MIN_PERCENT;
    else if (event.key === "End") next = STUDIO_DRAWING_PALETTE_MAX_PERCENT;
    else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      resetSplit(firstId);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    emit(resizeStudioDrawingPalettes(normalizedLayout, firstId, next));
  }

  function handleSplitPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    firstId: StudioDrawingPaletteId,
    secondId: StudioDrawingPaletteId,
  ): void {
    if (
      event.isPrimary === false ||
      (typeof event.button === "number" && event.button !== 0)
    ) {
      return;
    }

    activeDragCleanupRef.current?.();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const pointerType = event.pointerType || "mouse";
    const startX = finiteCoordinate(event.clientX);
    const startY = finiteCoordinate(event.clientY);
    let latestX = startX;
    let latestY = startY;
    const startLayout = normalizedLayout;
    const startPercent = startLayout.sizes[firstId];
    const measuredPaletteHeight =
      (sectionRefs.current[firstId]?.getBoundingClientRect().height ?? 0) +
      (sectionRefs.current[secondId]?.getBoundingClientRect().height ?? 0);
    const rootHeight = rootRef.current?.getBoundingClientRect().height ?? 0;
    const availableHeight = Math.max(
      1,
      measuredPaletteHeight > 0 ? measuredPaletteHeight : rootHeight,
    );
    let frame: number | null = null;
    let finished = false;

    const layoutAt = (clientY: number): StudioDrawingPaletteLayout => {
      const deltaPercent = ((clientY - startY) / availableHeight) * 100;
      return resizeStudioDrawingPalettes(
        startLayout,
        firstId,
        startPercent + deltaPercent,
      );
    };
    const paintPreview = (previewLayout: StudioDrawingPaletteLayout): void => {
      for (const id of [firstId, secondId]) {
        sectionRefs.current[id]?.style.setProperty(
          "--studio-drawing-palette-size",
          `${previewLayout.sizes[id]}%`,
        );
      }
      const previewPercent = Math.round(previewLayout.sizes[firstId]);
      target.setAttribute("aria-valuenow", String(previewPercent));
      target.setAttribute(
        "aria-valuetext",
        `${PALETTES[firstId].label} ${previewPercent}%, ${PALETTES[secondId].label} ${Math.round(100 - previewPercent)}%`,
      );
    };
    const restoreControlledLayout = (
      controlledLayout: StudioDrawingPaletteLayout,
    ): void => {
      for (const id of [firstId, secondId]) {
        sectionRefs.current[id]?.style.setProperty(
          "--studio-drawing-palette-size",
          `${controlledLayout.sizes[id]}%`,
        );
      }
      const controlledOpenIds = controlledLayout.order.filter(
        (id) => !paletteCollapsed(controlledLayout.collapsed, id),
      );
      const controlledFirstId = controlledOpenIds[0];
      const controlledSecondId = controlledOpenIds[1];
      if (!controlledFirstId || !controlledSecondId) return;
      const controlledPercent = Math.round(
        controlledLayout.sizes[controlledFirstId],
      );
      target.setAttribute("aria-valuenow", String(controlledPercent));
      target.setAttribute(
        "aria-valuetext",
        `${PALETTES[controlledFirstId].label} ${controlledPercent}%, ${PALETTES[controlledSecondId].label} ${Math.round(100 - controlledPercent)}%`,
      );
    };
    const applyLatestPreview = (): void => {
      frame = null;
      if (finished) return;
      paintPreview(layoutAt(latestY));
    };

    if (pointerType === "mouse") lastTapRef.current = null;
    target.focus({ preventScroll: true });
    event.preventDefault();
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      latestX = finiteCoordinate(moveEvent.clientX);
      latestY = finiteCoordinate(moveEvent.clientY);
      if (frame !== null) return;
      if (typeof globalThis.requestAnimationFrame === "function") {
        frame = globalThis.requestAnimationFrame(applyLatestPreview);
      } else {
        applyLatestPreview();
      }
    };
    const teardown = (
      updateDraggingState: boolean,
      restoreLayout: StudioDrawingPaletteLayout,
    ): boolean => {
      if (finished) return false;
      finished = true;
      if (frame !== null) {
        globalThis.cancelAnimationFrame?.(frame);
        frame = null;
      }
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", onPointerUp);
      globalThis.removeEventListener("pointercancel", onPointerCancel);
      globalThis.removeEventListener("blur", onBlur);
      target.removeEventListener("lostpointercapture", onLostPointerCapture);
      try {
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
      } catch {
        // Pointer capture is optional in older embedded browsers.
      }
      restoreControlledLayout(restoreLayout);
      if (updateDraggingState) setDragging(false);
      onDraggingChange?.(false);
      if (activeDragCleanupRef.current === cancel) {
        activeDragCleanupRef.current = null;
      }
      return true;
    };
    const cancel = (
      updateDraggingState = true,
      restoreLayout = startLayout,
    ): void => {
      lastTapRef.current = null;
      teardown(updateDraggingState, restoreLayout);
    };
    const onPointerUp = (finishEvent: PointerEvent): void => {
      if (finishEvent.pointerId !== pointerId || finished) return;

      // Quick drags can be coalesced straight into pointerup. The release sample is authoritative.
      latestX = finiteCoordinate(finishEvent.clientX);
      latestY = finiteCoordinate(finishEvent.clientY);
      let committedLayout = layoutAt(latestY);
      let immediateReset = false;

      if (pointerType !== "mouse") {
        const travel = Math.hypot(latestX - startX, latestY - startY);
        if (travel <= TAP_MAX_TRAVEL_PX) {
          const now = Date.now();
          const previous = lastTapRef.current;
          immediateReset = Boolean(
            previous &&
              now - previous.at <= DOUBLE_TAP_MAX_DELAY_MS &&
              Math.hypot(
                latestX - previous.clientX,
                latestY - previous.clientY,
              ) <= DOUBLE_TAP_MAX_DISTANCE_PX,
          );
          if (immediateReset) {
            lastTapRef.current = null;
            committedLayout = resizeStudioDrawingPalettes(
              startLayout,
              firstId,
              DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT.sizes[firstId],
            );
          } else {
            lastTapRef.current = {
              at: now,
              clientX: latestX,
              clientY: latestY,
            };
          }
        } else {
          lastTapRef.current = null;
        }
      }

      paintPreview(committedLayout);
      if (!teardown(true, startLayout)) return;
      if (
        immediateReset ||
        committedLayout.sizes[firstId] !== startLayout.sizes[firstId]
      ) {
        emit(committedLayout);
      }
    };
    const onPointerCancel = (finishEvent: PointerEvent): void => {
      if (finishEvent.pointerId !== pointerId) return;
      cancel();
    };
    const onBlur = () => cancel();
    const onLostPointerCapture = () => cancel();
    activeDragCleanupRef.current = cancel;

    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Global listeners keep mouse, pen, and touch resizing functional without capture support.
    }
    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", onPointerUp);
    globalThis.addEventListener("pointercancel", onPointerCancel);
    globalThis.addEventListener("blur", onBlur);
    target.addEventListener("lostpointercapture", onLostPointerCapture);
    setDragging(true);
    onDraggingChange?.(true);
  }

  return (
    <div
      ref={rootRef}
      data-studio-drawing-palette-stack="true"
      data-studio-drawing-palette-dragging={dragging ? "true" : "false"}
      className={cn(
        "flex min-w-0 flex-col gap-2",
        "lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-hidden",
        className,
      )}
    >
      {normalizedLayout.order.map((id, index) => {
        const definition = PALETTES[id];
        const Icon = definition.Icon;
        const collapsed = mobilePrimaryPaletteId
          ? id !== mobilePrimaryPaletteId
          : paletteCollapsed(normalizedLayout.collapsed, id);
        const onlyOpenPalette = openIds.length === 1 && !collapsed;
        const contentId = `${stackId}-${id}-content`;
        const titleId = `${stackId}-${id}-title`;
        const style: PaletteSectionStyle = {
          "--studio-drawing-palette-size": `${normalizedLayout.sizes[id]}%`,
        };
        return (
          <section
            key={id}
            ref={(node) => {
              sectionRefs.current[id] = node;
            }}
            aria-labelledby={titleId}
            data-studio-drawing-palette={id}
            data-studio-drawing-palette-collapsed={collapsed ? "true" : "false"}
            style={style}
            className={cn(
              "flex min-w-0 flex-none flex-col rounded-xl border border-line bg-panel/70 shadow-sm",
              "lg:rounded-none lg:border-x-0 lg:border-t-0 lg:shadow-none",
              mobilePrimaryPaletteId &&
                id !== mobilePrimaryPaletteId &&
                "hidden lg:flex",
              !collapsed &&
                (onlyOpenPalette
                  ? "lg:min-h-0 lg:flex-1"
                  : "lg:min-h-0 lg:flex-[0_1_var(--studio-drawing-palette-size)]"),
              collapsed && "shrink-0",
            )}
          >
            <header
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1 border-b border-line/70 px-1.5 lg:min-h-9",
                mobilePrimaryPaletteId &&
                  "sticky top-0 z-10 bg-panel/95 backdrop-blur lg:static lg:z-auto lg:bg-transparent lg:backdrop-blur-none",
              )}
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-lg text-accent"
              >
                <Icon size={15} strokeWidth={1.8} />
              </span>
              <h2
                id={titleId}
                className="min-w-0 flex-1 truncate text-[0.7rem] font-bold text-fg"
              >
                {definition.label}
              </h2>
              {mobilePrimaryPaletteId === id && mobileHeaderAction ? (
                <div className="shrink-0 lg:hidden">{mobileHeaderAction}</div>
              ) : null}
              <div
                role="group"
                aria-label={`${definition.label} 팔레트 배치`}
                className={cn(
                  "flex shrink-0 items-center gap-0.5",
                  mobilePrimaryPaletteId && "hidden lg:flex",
                )}
              >
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() =>
                    emit(moveStudioDrawingPalette(normalizedLayout, id, "up"))
                  }
                  aria-label={`${definition.label} 위로 이동`}
                  title="팔레트를 위로 이동"
                  className={cn(
                    "grid size-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-35 lg:size-8",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  <ArrowUp size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={index === normalizedLayout.order.length - 1}
                  onClick={() =>
                    emit(moveStudioDrawingPalette(normalizedLayout, id, "down"))
                  }
                  aria-label={`${definition.label} 아래로 이동`}
                  title="팔레트를 아래로 이동"
                  className={cn(
                    "grid size-11 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-35 lg:size-8",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  <ArrowDown size={14} aria-hidden />
                </button>
                <button
                  ref={(node) => {
                    collapseButtonRefs.current[id] = node;
                  }}
                  type="button"
                  aria-expanded={!collapsed}
                  aria-controls={contentId}
                  onClick={() =>
                    emit(toggleStudioDrawingPalette(normalizedLayout, id))
                  }
                  aria-label={`${definition.label} ${collapsed ? "펼치기" : "접기"}`}
                  title={`${definition.label} ${collapsed ? "펼치기" : "접기"}`}
                  className={cn(
                    "grid size-11 place-items-center rounded-lg text-fg-2 hover:bg-raised hover:text-fg lg:size-8",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  {collapsed ? (
                    <ChevronRight size={15} aria-hidden />
                  ) : (
                    <ChevronDown size={15} aria-hidden />
                  )}
                </button>
              </div>
            </header>
            <div
              id={contentId}
              hidden={collapsed}
              data-studio-drawing-palette-scroll="true"
              onFocusCapture={() => {
                focusedBodyRef.current = id;
              }}
              onBlurCapture={(event) => {
                const related = event.relatedTarget;
                if (
                  related instanceof Node &&
                  event.currentTarget.contains(related)
                ) {
                  return;
                }
                if (focusedBodyRef.current === id) focusedBodyRef.current = null;
              }}
              className="min-w-0 p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]"
            >
              {collapsed ? null : (
                <>{paletteBody(id, subTools, toolProperties)}</>
              )}
            </div>
          </section>
        );
      }).reduce<ReactNode[]>((nodes, section, index) => {
        nodes.push(section);
        if (
          index === 0 &&
          bothOpen &&
          firstOpenId &&
          secondOpenId
        ) {
          const firstDefinition = PALETTES[firstOpenId];
          const secondDefinition = PALETTES[secondOpenId];
          const currentPercent = normalizedLayout.sizes[firstOpenId];
          nodes.push(
            <div
              key="palette-splitter"
              role="separator"
              aria-label={`${joinKoreanLabels(firstDefinition.label, secondDefinition.label)} 크기 조절`}
              aria-orientation="horizontal"
              aria-valuemin={STUDIO_DRAWING_PALETTE_MIN_PERCENT}
              aria-valuemax={STUDIO_DRAWING_PALETTE_MAX_PERCENT}
              aria-valuenow={Math.round(currentPercent)}
              aria-valuetext={`${firstDefinition.label} ${Math.round(currentPercent)}%, ${secondDefinition.label} ${Math.round(100 - currentPercent)}%`}
              aria-keyshortcuts="ArrowUp ArrowDown Home End Enter"
              tabIndex={0}
              data-studio-drawing-palette-splitter="true"
              data-dragging={dragging ? "true" : "false"}
              onPointerDown={(event) =>
                handleSplitPointerDown(event, firstOpenId, secondOpenId)
              }
              onKeyDown={(event) => handleSplitKeyDown(event, firstOpenId)}
              onDoubleClick={() => resetSplit(firstOpenId)}
              title="위·아래로 드래그 · 방향키로 조절 · Enter/더블클릭/더블탭으로 기본 비율"
              className={cn(
                "group relative z-10 hidden h-2 shrink-0 touch-none cursor-row-resize select-none place-items-center border-0 bg-transparent p-0",
                "before:absolute before:inset-x-0 before:top-1/2 before:h-6 before:-translate-y-1/2 before:content-['']",
                "lg:grid",
                STUDIO_EASE,
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-1 w-14 rounded-full border border-line bg-raised transition-[width,background-color,border-color] motion-reduce:transition-none",
                  dragging
                    ? "w-20 border-accent bg-accent"
                    : "group-hover:w-20 group-hover:border-accent/60 group-hover:bg-accent-soft group-focus-visible:w-20 group-focus-visible:border-accent group-focus-visible:bg-accent-soft",
                )}
              />
            </div>,
          );
        }
        return nodes;
      }, [])}
    </div>
  );
}
