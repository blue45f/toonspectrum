import {
  Check,
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Move,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pin,
  RotateCcw,
  Scaling,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ForwardedRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  createStudioFloatingSurfaceLayout,
  moveStudioFloatingSurfaceRect,
  normalizeStudioFloatingSurfaceLayout,
  resizeStudioFloatingSurfaceRectFromEdge,
  resizeStudioFloatingSurfaceRectToPreset,
  resolveStudioFloatingSurfaceDock,
  resolveStudioFloatingSurfaceRect,
  setStudioFloatingSurfaceDock,
  setStudioFloatingSurfaceLock,
  studioFloatingSurfaceLayoutsEqual,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceDock,
  type StudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceRect,
  type StudioFloatingSurfaceResizeEdge,
  type StudioFloatingSurfaceSizePreset,
  type StudioFloatingSurfaceViewport,
} from "./studio-floating-surface";
import {
  startStudioFloatingSurfacePointerSession,
  type StudioFloatingSurfaceInteractionKind,
  type StudioFloatingSurfacePointerSession,
} from "./studio-floating-surface-pointer";
import {
  bringStudioFloatingSurfaceToFront,
  registerStudioFloatingSurface,
  registerStudioFloatingSurfaceArrangementController,
  requestStudioFloatingSurfaceLayoutReset,
  subscribeStudioFloatingSurfaceLayoutReset,
  studioFloatingSurfaceStackSnapshot,
  studioFloatingSurfaceZIndex,
  subscribeStudioFloatingSurfaceStack,
} from "./studio-floating-surface-stack";
import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
} from "./studio-panel-ui";

import { cn } from "@/shared/lib/utils";

const KEYBOARD_MOVE_STEP = 10;
const KEYBOARD_LARGE_STEP = 40;

interface DockChoice {
  readonly dock: StudioFloatingSurfaceDock;
  readonly label: string;
  readonly Icon: LucideIcon;
  readonly iconClassName?: string;
}

const DOCK_CHOICES: readonly DockChoice[] = [
  { dock: "free", label: "자유 배치", Icon: Move },
  { dock: "left", label: "왼쪽 가장자리에 도킹", Icon: PanelLeft },
  { dock: "right", label: "오른쪽 가장자리에 도킹", Icon: PanelRight },
  { dock: "top", label: "위쪽 가장자리에 도킹", Icon: PanelTop },
  {
    dock: "bottom",
    label: "아래쪽 가장자리에 도킹",
    Icon: PanelTop,
    iconClassName: "rotate-180",
  },
];

interface ResizeHandleDefinition {
  readonly edge: StudioFloatingSurfaceResizeEdge;
  readonly label: string;
  readonly cursor: string;
  readonly className: string;
}

const RESIZE_HANDLES: readonly ResizeHandleDefinition[] = [
  {
    edge: "n",
    label: "위쪽 크기 조절",
    cursor: "n-resize",
    className: "left-5 right-5 top-0 h-1.5 cursor-n-resize",
  },
  {
    edge: "ne",
    label: "오른쪽 위 모서리 크기 조절",
    cursor: "ne-resize",
    className: "right-0 top-0 size-4 cursor-ne-resize",
  },
  {
    edge: "e",
    label: "오른쪽 크기 조절",
    cursor: "e-resize",
    className: "bottom-5 right-0 top-5 w-1.5 cursor-e-resize",
  },
  {
    edge: "se",
    label: "크기 조절",
    cursor: "se-resize",
    className: "bottom-0 right-0 size-8 cursor-se-resize pointer-coarse:size-11",
  },
  {
    edge: "s",
    label: "아래쪽 크기 조절",
    cursor: "s-resize",
    className: "bottom-0 left-5 right-5 h-1.5 cursor-s-resize",
  },
  {
    edge: "sw",
    label: "왼쪽 아래 모서리 크기 조절",
    cursor: "sw-resize",
    className: "bottom-0 left-0 size-4 cursor-sw-resize",
  },
  {
    edge: "w",
    label: "왼쪽 크기 조절",
    cursor: "w-resize",
    className: "bottom-5 left-0 top-5 w-1.5 cursor-w-resize",
  },
  {
    edge: "nw",
    label: "왼쪽 위 모서리 크기 조절",
    cursor: "nw-resize",
    className: "left-0 top-0 size-4 cursor-nw-resize",
  },
];

export interface StudioFloatingSurfaceProps {
  readonly label: string;
  readonly layout: StudioFloatingSurfaceLayout;
  readonly defaultLayout: StudioFloatingSurfaceLayout;
  readonly onLayoutChange: (layout: StudioFloatingSurfaceLayout) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly id?: string;
  readonly surfaceId?: string;
  readonly descriptionId?: string;
  readonly headerActions?: ReactNode;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly snapDistance?: number;
  readonly insetTop?: number;
  readonly insetRight?: number;
  readonly insetBottom?: number;
  readonly insetLeft?: number;
  readonly className?: string;
  readonly contentClassName?: string;
  /** Keeps high-priority transient surfaces above the regular floating-window stack. */
  readonly zIndexFloor?: number;
  /** Allows the window to collapse without unmounting its working state. */
  readonly minimizable?: boolean;
  /** Excludes transient dropdowns from global workspace arrangement commands. */
  readonly participatesInWorkspaceArrangement?: boolean;
  /**
   * Edges this surface may dock to. Omit to offer all of them. A surface that only makes sense
   * along one axis — the animatic timeline is a bottom strip — would otherwise advertise a dock
   * the layout never wears well. "free" is always offered: undocking must stay reachable.
   */
  readonly allowedDockEdges?: readonly StudioFloatingSurfaceDock[];
  readonly rootDataAttributes?: Readonly<Record<`data-${string}`, string | undefined>>;
}

function readViewport(
  insets: Pick<
    StudioFloatingSurfaceProps,
    "insetTop" | "insetRight" | "insetBottom" | "insetLeft"
  >,
): StudioFloatingSurfaceViewport {
  const visualViewport = typeof window !== "undefined"
    ? window.visualViewport
    : null;
  const offsetLeft = visualViewport?.offsetLeft ?? 0;
  const offsetTop = visualViewport?.offsetTop ?? 0;
  return {
    width: offsetLeft + (visualViewport?.width ?? globalThis.innerWidth ?? 1),
    height: offsetTop + (visualViewport?.height ?? globalThis.innerHeight ?? 1),
    insetTop: offsetTop + (insets.insetTop ?? 0),
    insetRight: insets.insetRight ?? 0,
    insetBottom: insets.insetBottom ?? 0,
    insetLeft: offsetLeft + (insets.insetLeft ?? 0),
  };
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function resizeHandleAriaLabel(
  surfaceLabel: string,
  handleLabel: string,
): string {
  return handleLabel === "크기 조절"
    ? `${surfaceLabel} 크기 조절`
    : `${surfaceLabel} ${handleLabel}`;
}

function dockAfterMove(
  currentDock: StudioFloatingSurfaceDock,
  startRect: StudioFloatingSurfaceRect,
  nextRect: StudioFloatingSurfaceRect,
  viewport: StudioFloatingSurfaceViewport,
  snapDistance: number,
): StudioFloatingSurfaceDock {
  const candidate = resolveStudioFloatingSurfaceDock(
    nextRect,
    viewport,
    snapDistance,
  );
  if (candidate === "free") return "free";
  if (candidate === currentDock) return currentDock;

  const deltaX = Math.abs(nextRect.x - startRect.x);
  const deltaY = Math.abs(nextRect.y - startRect.y);
  if (deltaX === 0 && deltaY === 0) return currentDock;
  const horizontalMove = deltaX >= deltaY;
  const horizontalDock = candidate === "left" || candidate === "right";
  return horizontalMove === horizontalDock ? candidate : "free";
}

/**
 * Shared desktop window chrome for Studio's persistent non-modal palettes.
 *
 * Pointer previews mutate only transform/geometry styles in rAF. Durable state is emitted once on
 * pointer-up or keyboard commit, so dragging never floods React, persistence, or the canvas render
 * loop. Escape, pointer cancellation, owner unmount, and window blur restore the start rectangle.
 */
export const StudioFloatingSurface = forwardRef<
  HTMLDivElement,
  StudioFloatingSurfaceProps
>(function StudioFloatingSurface({
  label,
  layout,
  defaultLayout,
  onLayoutChange,
  onClose,
  children,
  id,
  surfaceId,
  descriptionId,
  headerActions,
  minWidth = 280,
  minHeight = 240,
  maxWidth = 720,
  maxHeight,
  snapDistance = 12,
  insetTop = 64,
  insetRight = 12,
  insetBottom = 12,
  insetLeft = 12,
  className,
  contentClassName,
  zIndexFloor,
  minimizable = true,
  participatesInWorkspaceArrangement = true,
  allowedDockEdges,
  rootDataAttributes,
}, forwardedRef) {
  // "free" always survives the filter — a surface whose only dock was removed still has to be
  // undockable, or the menu would strand it against an edge with no way back.
  const dockChoices = allowedDockEdges === undefined
    ? DOCK_CHOICES
    : DOCK_CHOICES.filter(
      (choice) => choice.dock === "free" || allowedDockEdges.includes(choice.dock),
    );
  const generatedSurfaceId = useId();
  const stackSurfaceId = surfaceId?.trim() || generatedSurfaceId;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const pointerSessionRef = useRef<StudioFloatingSurfacePointerSession | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const normalizedDefault = useMemo(
    () => normalizeStudioFloatingSurfaceLayout(defaultLayout),
    [defaultLayout],
  );
  const [committedLayout, setCommittedLayout] = useState(() =>
    normalizeStudioFloatingSurfaceLayout(layout, normalizedDefault)
  );
  const viewportInsets = useMemo(
    () => ({ insetTop, insetRight, insetBottom, insetLeft }),
    [insetTop, insetRight, insetBottom, insetLeft],
  );
  const [viewport, setViewport] = useState(() => readViewport(viewportInsets));
  const constraints: StudioFloatingSurfaceConstraints = {
    minWidth,
    minHeight,
    maxWidth,
    ...(maxHeight === undefined ? {} : { maxHeight }),
    snapDistance,
  };
  const committedRect = resolveStudioFloatingSurfaceRect(
    committedLayout,
    viewport,
    constraints,
    normalizedDefault,
  );
  const stackRevision = useSyncExternalStore(
    subscribeStudioFloatingSurfaceStack,
    studioFloatingSurfaceStackSnapshot,
    () => 0,
  );
  void stackRevision;
  const zIndex = studioFloatingSurfaceZIndex(stackSurfaceId);
  const resolvedZIndex = typeof zIndexFloor === "number" && Number.isFinite(zIndexFloor)
    ? Math.max(zIndex, Math.round(zIndexFloor))
    : zIndex;

  useLayoutEffect(
    () => registerStudioFloatingSurface(stackSurfaceId),
    [stackSurfaceId],
  );

  useLayoutEffect(() => {
    if (pointerSessionRef.current) return;
    setCommittedLayout((current) => {
      const next = normalizeStudioFloatingSurfaceLayout(layout, normalizedDefault);
      return studioFloatingSurfaceLayoutsEqual(current, next) ? current : next;
    });
  }, [layout, normalizedDefault]);

  useEffect(() => {
    const syncViewport = () => setViewport(readViewport(viewportInsets));
    globalThis.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    return () => {
      globalThis.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
    };
  }, [viewportInsets]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeFromOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    return () => document.removeEventListener("pointerdown", closeFromOutside, true);
  }, [menuOpen]);

  useLayoutEffect(
    () => () => {
      pointerSessionRef.current?.cancel();
      pointerSessionRef.current = null;
    },
    [],
  );

  const commitLayout = (next: StudioFloatingSurfaceLayout): void => {
    const normalized = normalizeStudioFloatingSurfaceLayout(next, normalizedDefault);
    if (studioFloatingSurfaceLayoutsEqual(committedLayout, normalized)) return;
    setCommittedLayout(normalized);
    onLayoutChange(normalized);
  };

  const commitRect = (
    nextRect: StudioFloatingSurfaceRect,
    dock: StudioFloatingSurfaceDock,
  ): void => {
    commitLayout(createStudioFloatingSurfaceLayout(
      nextRect,
      viewport,
      constraints,
      {
        dock,
        positionLocked: committedLayout.positionLocked,
        sizeLocked: committedLayout.sizeLocked,
      },
    ));
  };

  const resizeToPreset = (preset: StudioFloatingSurfaceSizePreset): void => {
    if (committedLayout.sizeLocked) return;
    setMenuOpen(false);
    setMinimized(false);
    commitRect(
      resizeStudioFloatingSurfaceRectToPreset(
        committedRect,
        preset,
        viewport,
        constraints,
        normalizedDefault,
      ),
      committedLayout.dock,
    );
  };

  const resetLayout = (): void => {
    setMenuOpen(false);
    setMinimized(false);
    commitLayout(normalizeStudioFloatingSurfaceLayout(normalizedDefault));
  };

  // A surface dragged past the viewport or shrunk to a sliver can no longer be reached by its own
  // header, so the recovery has to arrive from outside. Each surface still resets itself here —
  // the broadcast only carries the request, and `normalizedDefault` stays this surface's own.
  // Latest-ref written in an effect, not during render: the React Compiler is on.
  const resetLayoutRef = useRef(resetLayout);
  useEffect(() => {
    resetLayoutRef.current = resetLayout;
  });
  useEffect(
    () => subscribeStudioFloatingSurfaceLayoutReset(() => resetLayoutRef.current()),
    [],
  );

  const beginPointerSession = (
    event: ReactPointerEvent<HTMLElement>,
    kind: StudioFloatingSurfaceInteractionKind,
    resizeEdge: StudioFloatingSurfaceResizeEdge = "se",
    cursor?: string,
  ): void => {
    if (
      event.isPrimary === false
      || (typeof event.button === "number" && event.button !== 0)
      || pointerSessionRef.current
      || (kind === "move" && committedLayout.positionLocked)
      || (kind === "resize" && committedLayout.sizeLocked)
    ) {
      return;
    }
    const node = rootRef.current;
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    bringStudioFloatingSurfaceToFront(stackSurfaceId);
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    pointerSessionRef.current = startStudioFloatingSurfacePointerSession({
      kind,
      target,
      node,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      startRect: committedRect,
      cursor,
      resolveRect(deltaX, deltaY, commit) {
        return kind === "move"
          ? moveStudioFloatingSurfaceRect(
              committedRect,
              deltaX,
              deltaY,
              viewport,
              constraints,
              commit,
            )
          : resizeStudioFloatingSurfaceRectFromEdge(
              committedRect,
              deltaX,
              deltaY,
              resizeEdge,
              viewport,
              constraints,
            );
      },
      onActiveChange(active) {
        if (kind === "move") setDragging(active);
        else setResizing(active);
      },
      onCommit(nextRect) {
        commitRect(
          nextRect,
          kind === "move"
            ? dockAfterMove(
                committedLayout.dock,
                committedRect,
                nextRect,
                viewport,
                constraints.snapDistance ?? 0,
              )
            : committedLayout.dock,
        );
      },
      onComplete() {
        pointerSessionRef.current = null;
      },
    });
  };

  const handleMoveKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || committedLayout.positionLocked) return;
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_MOVE_STEP;
    let deltaX = 0;
    let deltaY = 0;
    if (event.key === "ArrowLeft") deltaX = -step;
    else if (event.key === "ArrowRight") deltaX = step;
    else if (event.key === "ArrowUp") deltaY = -step;
    else if (event.key === "ArrowDown") deltaY = step;
    else if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      resetLayout();
      return;
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextRect = moveStudioFloatingSurfaceRect(
      committedRect,
      deltaX,
      deltaY,
      viewport,
      constraints,
      true,
    );
    commitRect(
      nextRect,
      dockAfterMove(
        committedLayout.dock,
        committedRect,
        nextRect,
        viewport,
        constraints.snapDistance ?? 0,
      ),
    );
  };

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    edge: StudioFloatingSurfaceResizeEdge,
  ) => {
    if (!event.altKey || committedLayout.sizeLocked) return;
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_MOVE_STEP;
    let deltaX = 0;
    let deltaY = 0;
    if (event.key === "ArrowLeft") deltaX = -step;
    else if (event.key === "ArrowRight") deltaX = step;
    else if (event.key === "ArrowUp") deltaY = -step;
    else if (event.key === "ArrowDown") deltaY = step;
    else return;
    event.preventDefault();
    event.stopPropagation();
    commitRect(
      resizeStudioFloatingSurfaceRectFromEdge(
        committedRect,
        deltaX,
        deltaY,
        edge,
        viewport,
        constraints,
      ),
      committedLayout.dock,
    );
  };

  const setDock = (dock: StudioFloatingSurfaceDock): void => {
    commitLayout(setStudioFloatingSurfaceDock(committedLayout, dock));
    setMenuOpen(false);
    menuButtonRef.current?.focus({ preventScroll: true });
  };

  const toggleLock = (kind: "position" | "size"): void => {
    const locked = kind === "position"
      ? committedLayout.positionLocked
      : committedLayout.sizeLocked;
    commitLayout(setStudioFloatingSurfaceLock(committedLayout, kind, !locked));
  };

  const viewportInsetTop = viewport.insetTop ?? 0;
  const viewportInsetRight = viewport.insetRight ?? 0;
  const viewportInsetBottom = viewport.insetBottom ?? 0;
  const viewportInsetLeft = viewport.insetLeft ?? 0;

  const arrangementControllerRef = useRef({
    arrange: (_mode: "edges" | "cascade", _index: number, _count: number) => undefined,
    setMinimized: (_value: boolean) => undefined,
  });
  useLayoutEffect(() => {
    arrangementControllerRef.current = {
      arrange(mode, index, count) {
        const availableWidth = Math.max(
          minWidth,
          viewport.width - viewportInsetLeft - viewportInsetRight,
        );
        const availableHeight = Math.max(
          minHeight,
          viewport.height - viewportInsetTop - viewportInsetBottom,
        );
        setMinimized(false);
        if (mode === "edges") {
          const columns = count > 1 ? 2 : 1;
          const rows = Math.max(1, Math.ceil(count / columns));
          const row = Math.floor(index / columns);
          const slotHeight = availableHeight / rows;
          const width = Math.min(
            availableWidth,
            maxWidth,
            Math.max(minWidth, Math.min(420, availableWidth * 0.3)),
          );
          const height = Math.min(
            maxHeight ?? availableHeight,
            Math.max(minHeight, slotHeight - 10),
          );
          const right = index % columns === 1;
          commitRect({
            x: right
              ? viewport.width - viewportInsetRight - width
              : viewportInsetLeft,
            y: viewportInsetTop + row * slotHeight,
            width,
            height,
          }, "free");
          return;
        }
        const width = Math.min(availableWidth, maxWidth, Math.max(minWidth, 620));
        const height = Math.min(
          availableHeight,
          maxHeight ?? availableHeight,
          Math.max(minHeight, 560),
        );
        const xRoom = Math.max(0, availableWidth - width);
        const yRoom = Math.max(0, availableHeight - height);
        const offset = count <= 1 ? 0 : index / (count - 1);
        commitRect({
          x: viewportInsetLeft + xRoom * offset,
          y: viewportInsetTop + yRoom * offset,
          width,
          height,
        }, "free");
      },
      setMinimized(value) {
        setMinimized(value);
      },
    };
  });
  useLayoutEffect(() => {
    if (!participatesInWorkspaceArrangement) return undefined;
    return registerStudioFloatingSurfaceArrangementController(stackSurfaceId, {
      arrange: (...args) => arrangementControllerRef.current.arrange(...args),
      setMinimized: (value) => arrangementControllerRef.current.setMinimized(value),
    });
  }, [participatesInWorkspaceArrangement, stackSurfaceId]);

  const displayedRect = minimized
    ? {
        ...committedRect,
        y: committedLayout.dock === "bottom"
          ? viewport.height - viewportInsetBottom - 40
          : committedRect.y,
        height: 40,
      }
    : committedRect;

  const style = {
    left: displayedRect.x,
    top: displayedRect.y,
    width: displayedRect.width,
    height: displayedRect.height,
    zIndex: resolvedZIndex,
    transform: "translate3d(0, 0, 0)",
    willChange: dragging
      ? "transform"
      : resizing
        ? "left, top, width, height"
        : undefined,
  } satisfies CSSProperties;

  return (
    <div
      id={id}
      ref={(node: HTMLDivElement | null) => {
        rootRef.current = node;
        assignRef(forwardedRef, node);
      }}
      role="dialog"
      aria-label={label}
      aria-describedby={descriptionId}
      {...rootDataAttributes}
      data-studio-floating-surface="true"
      data-studio-floating-surface-id={stackSurfaceId}
      data-dock={committedLayout.dock}
      data-position-locked={committedLayout.positionLocked ? "true" : "false"}
      data-size-locked={committedLayout.sizeLocked ? "true" : "false"}
      data-minimized={minimized ? "true" : "false"}
      data-studio-floating-size={
        committedRect.width < 360 ? "compact" : committedRect.width < 720 ? "comfortable" : "wide"
      }
      data-dragging={dragging ? "true" : "false"}
      data-resizing={resizing ? "true" : "false"}
      className={cn(
        "pointer-events-auto fixed flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel text-fg shadow-2xl",
        className,
      )}
      style={style}
      tabIndex={-1}
      onFocusCapture={() => bringStudioFloatingSurfaceToFront(stackSurfaceId)}
      onPointerDownCapture={() => bringStudioFloatingSurfaceToFront(stackSurfaceId)}
    >
      <div className="relative flex h-10 shrink-0 items-stretch border-b border-line bg-raised/90">
        <button
          type="button"
          disabled={committedLayout.positionLocked}
          aria-label={`${label} 이동`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home"
          data-studio-floating-surface-drag-handle="true"
          className={cn(
            "flex min-w-0 flex-1 touch-none cursor-grab items-center gap-2 px-3 text-left text-xs font-bold text-fg-2 active:cursor-grabbing",
            "hover:bg-card hover:text-fg disabled:cursor-not-allowed disabled:opacity-55",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onDoubleClick={resetLayout}
          onKeyDown={handleMoveKeyDown}
          onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
            beginPointerSession(event, "move", "se", "grabbing")}
        >
          {committedLayout.positionLocked ? (
            <Pin size={15} aria-hidden className="shrink-0 text-accent" />
          ) : (
            <GripHorizontal size={16} aria-hidden className="shrink-0 text-fg-3" />
          )}
          <span className="truncate">{label}</span>
        </button>
        {headerActions ? (
          <div className="flex shrink-0 items-stretch">{headerActions}</div>
        ) : null}
        {minimizable ? (
          <button
            type="button"
            aria-label={`${label} ${minimized ? "펼치기" : "접기"}`}
            title={minimized ? "내용 펼치기" : "제목줄만 남기기"}
            aria-expanded={!minimized}
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center text-fg-3 hover:bg-card hover:text-fg",
              STUDIO_TOUCH_TARGET,
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
            onClick={() => setMinimized((value) => !value)}
          >
            {minimized
              ? <ChevronDown size={15} aria-hidden />
              : <ChevronUp size={15} aria-hidden />}
          </button>
        ) : null}
        <button
          type="button"
          disabled={committedLayout.sizeLocked}
          aria-label={`${label} 최대 크기`}
          title={committedLayout.sizeLocked ? "크기 잠금을 해제한 뒤 확대할 수 있어요." : "화면에 맞춰 최대 크기로 확대"}
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center text-fg-3 hover:bg-card hover:text-fg disabled:cursor-not-allowed disabled:opacity-40",
            STUDIO_TOUCH_TARGET,
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onClick={() => resizeToPreset("maximum")}
        >
          <Maximize2 size={15} aria-hidden />
        </button>
        <button
          ref={menuButtonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`${label} 창 배치 메뉴`}
          title="도킹·크기·잠금·초기화"
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center text-fg-3 hover:bg-card hover:text-fg",
            menuOpen && "bg-accent-soft text-accent",
            STUDIO_TOUCH_TARGET,
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`${label} 닫기`}
          title="닫기"
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center text-fg-3 hover:bg-card hover:text-fg",
            STUDIO_TOUCH_TARGET,
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {menuOpen ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${label} 창 배치`}
          className="absolute right-1 top-11 z-30 max-h-[calc(100%-3rem)] w-[min(15.5rem,calc(100%-0.5rem))] overflow-y-auto rounded-xl border border-line-strong bg-panel p-1.5 shadow-2xl"
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen(false);
            menuButtonRef.current?.focus({ preventScroll: true });
          }}
        >
          <p className="px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-fg-3">
            화면 가장자리
          </p>
          {dockChoices.map(({ dock, label: dockLabel, Icon, iconClassName }) => (
            <button
              key={dock}
              type="button"
              role="menuitemradio"
              aria-checked={committedLayout.dock === dock}
              className={cn(
                "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-fg-2 hover:bg-raised hover:text-fg",
                committedLayout.dock === dock && "bg-accent-soft text-fg",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
              onClick={() => setDock(dock)}
            >
              <Icon
                size={15}
                aria-hidden
                className={cn("shrink-0 text-accent", iconClassName)}
              />
              <span className="min-w-0 flex-1 truncate">{dockLabel}</span>
              {committedLayout.dock === dock ? (
                <Check size={14} aria-hidden className="shrink-0 text-accent" />
              ) : null}
            </button>
          ))}
          <div role="separator" className="mx-2 my-1 h-px bg-line" />
          <p className="px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-fg-3">
            창 크기
          </p>
          <div className="grid grid-cols-3 gap-1 px-1 pb-1" role="group" aria-label={`${label} 빠른 크기`}>
            <button
              type="button"
              role="menuitem"
              disabled={committedLayout.sizeLocked}
              aria-label={`${label} 최소 크기`}
              title="콘텐츠가 사용할 수 있는 최소 안전 크기"
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-line bg-card px-1 text-[0.62rem] font-semibold text-fg-2 hover:border-accent/50 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
              onClick={() => resizeToPreset("minimum")}
            >
              <Minimize2 size={14} aria-hidden />
              최소
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={committedLayout.sizeLocked}
              aria-label={`${label} 권장 크기`}
              title="이 패널의 콘텐츠에 맞춘 기본 권장 크기"
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-line bg-card px-1 text-[0.62rem] font-semibold text-fg-2 hover:border-accent/50 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
              onClick={() => resizeToPreset("default")}
            >
              <RotateCcw size={14} aria-hidden />
              권장
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={committedLayout.sizeLocked}
              aria-label={`${label} 최대 크기`}
              title="현재 화면과 패널 제한 안에서 최대 크기"
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-line bg-card px-1 text-[0.62rem] font-semibold text-fg-2 hover:border-accent/50 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
              onClick={() => resizeToPreset("maximum")}
            >
              <Maximize2 size={14} aria-hidden />
              최대
            </button>
          </div>
          <div role="separator" className="mx-2 my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={committedLayout.positionLocked}
            className={cn(
              "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-fg-2 hover:bg-raised hover:text-fg",
              committedLayout.positionLocked && "bg-accent-soft text-fg",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
            onClick={() => toggleLock("position")}
          >
            <Pin size={15} aria-hidden className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">위치 잠금</span>
            <span className="text-[0.62rem] font-semibold text-fg-3">
              {committedLayout.positionLocked ? "켬" : "끔"}
            </span>
          </button>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={committedLayout.sizeLocked}
            className={cn(
              "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-fg-2 hover:bg-raised hover:text-fg",
              committedLayout.sizeLocked && "bg-accent-soft text-fg",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
            onClick={() => toggleLock("size")}
          >
            <Scaling size={15} aria-hidden className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">크기 잠금</span>
            <span className="text-[0.62rem] font-semibold text-fg-3">
              {committedLayout.sizeLocked ? "켬" : "끔"}
            </span>
          </button>
          <div role="separator" className="mx-2 my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            className={cn(
              "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
            onClick={resetLayout}
          >
            <RotateCcw size={15} aria-hidden className="shrink-0 text-accent" />
            위치·크기·잠금 초기화
          </button>
          <button
            type="button"
            role="menuitem"
            className={cn(
              "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-xs text-fg-2 hover:bg-raised hover:text-fg",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
            onClick={() => {
              setMenuOpen(false);
              requestStudioFloatingSurfaceLayoutReset();
            }}
          >
            <RotateCcw size={15} aria-hidden className="shrink-0 text-fg-3" />
            열린 창 모두 초기화
          </button>
        </div>
      ) : null}

      <div
        hidden={minimized}
        inert={minimized ? true : undefined}
        data-studio-floating-content="true"
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [container-type:inline-size] [scrollbar-gutter:stable]",
          contentClassName,
        )}
      >
        {children}
      </div>

      {!minimized ? RESIZE_HANDLES.map((handle) => (
        <button
          key={handle.edge}
          type="button"
          disabled={committedLayout.sizeLocked}
          aria-label={resizeHandleAriaLabel(label, handle.label)}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
          data-studio-floating-surface-resize-handle={handle.edge}
          className={cn(
            "absolute z-20 touch-none border-0 bg-transparent p-0 disabled:cursor-not-allowed",
            handle.className,
            handle.edge === "se" && [
              "rounded-tl-md after:absolute after:bottom-1 after:right-1 after:size-2.5 after:border-b-2 after:border-r-2 after:border-fg-3/70",
              "hover:bg-raised focus-visible:bg-raised",
            ],
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onKeyDown={(event) => handleResizeKeyDown(event, handle.edge)}
          onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
            beginPointerSession(event, "resize", handle.edge, handle.cursor)}
        />
      )) : null}
    </div>
  );
});
