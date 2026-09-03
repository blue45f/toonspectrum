import {
  GripHorizontal,
  MoreHorizontal,
  RotateCcw,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  createStudioFloatingSurfaceLayout,
  moveStudioFloatingSurfaceRect,
  normalizeStudioFloatingSurfaceLayout,
  resizeStudioFloatingSurfaceDockRect,
  resizeStudioFloatingSurfaceRect,
  resolveStudioFloatingSurfaceDockCandidate,
  resolveStudioFloatingSurfaceDockRect,
  resolveStudioFloatingSurfaceFloatingRect,
  resolveStudioFloatingSurfaceRect,
  snapStudioFloatingSurfaceRectToPeers,
  studioFloatingSurfaceLayoutsEqual,
  STUDIO_FLOATING_SURFACE_DOCK_EDGES,
  undockStudioFloatingSurfaceRect,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceDockEdge,
  type StudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceRect,
  type StudioFloatingSurfaceViewport,
} from "./studio-floating-surface";
import {
  studioFloatingSurfaceRegistry,
  STUDIO_FLOATING_SURFACE_Z_INDEX_BASE,
} from "./studio-floating-surface-registry";
import {
  startStudioFloatingSurfacePointerSession,
  type StudioFloatingSurfaceInteractionKind,
  type StudioFloatingSurfacePointerSession,
} from "./studio-floating-surface-pointer";
import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
} from "./studio-panel-ui";

import { cn } from "@/lib/utils";

const KEYBOARD_MOVE_STEP = 10;
const KEYBOARD_LARGE_STEP = 40;

interface PendingCommit {
  readonly layout?: StudioFloatingSurfaceLayout;
  readonly preferredRect?: StudioFloatingSurfaceRect;
  readonly dock: StudioFloatingSurfaceDockEdge | null;
}

export interface StudioFloatingSurfaceProps {
  readonly label: string;
  readonly layout: StudioFloatingSurfaceLayout;
  readonly defaultLayout: StudioFloatingSurfaceLayout;
  readonly onLayoutChange: (layout: StudioFloatingSurfaceLayout) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Stable ID enables click-to-front, peer snapping, global recovery, and test selectors. */
  readonly surfaceId?: string;
  readonly descriptionId?: string;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly snapDistance?: number;
  readonly peerSnapDistance?: number;
  readonly dockActivationDistance?: number;
  readonly allowedDockEdges?: readonly StudioFloatingSurfaceDockEdge[];
  readonly insetTop?: number;
  readonly insetRight?: number;
  readonly insetBottom?: number;
  readonly insetLeft?: number;
  readonly chromeDensity?: "compact" | "comfortable";
  readonly className?: string;
  readonly contentClassName?: string;
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
  return {
    width: visualViewport?.width ?? globalThis.innerWidth ?? 1,
    height: visualViewport?.height ?? globalThis.innerHeight ?? 1,
    insetTop: insets.insetTop ?? 0,
    insetRight: insets.insetRight ?? 0,
    insetBottom: insets.insetBottom ?? 0,
    insetLeft: insets.insetLeft ?? 0,
  };
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function sameDockEdges(
  left: readonly StudioFloatingSurfaceDockEdge[],
  right: readonly StudioFloatingSurfaceDockEdge[],
): boolean {
  return left.length === right.length
    && left.every((edge, index) => edge === right[index]);
}

function dockLabel(edge: StudioFloatingSurfaceDockEdge): string {
  if (edge === "left") return "왼쪽";
  if (edge === "right") return "오른쪽";
  return "아래";
}

/**
 * Shared desktop window chrome for Studio's persistent non-modal palettes.
 *
 * Pointer previews mutate only transform/size styles in rAF. Durable state is emitted once on
 * pointer-up or keyboard commit, so dragging never floods React, persistence, or the canvas render
 * loop. Escape, pointer cancellation, capture loss, owner unmount, and window blur restore the
 * rendered starting rectangle. The process-local registry owns focus stacking and peer snapping;
 * each surface still owns its own normalized durable placement.
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
  surfaceId,
  descriptionId,
  minWidth = 280,
  minHeight = 240,
  maxWidth = 720,
  maxHeight,
  snapDistance = 12,
  peerSnapDistance = 10,
  dockActivationDistance = 44,
  allowedDockEdges = STUDIO_FLOATING_SURFACE_DOCK_EDGES,
  insetTop = 64,
  insetRight = 12,
  insetBottom = 12,
  insetLeft = 12,
  chromeDensity = "comfortable",
  className,
  contentClassName,
  rootDataAttributes,
}, forwardedRef) {
  const generatedId = useId();
  const effectiveSurfaceId = surfaceId
    ?? `studio-floating-${generatedId.replace(/[^A-Za-z0-9_-]/gu, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const placementMenuRef = useRef<HTMLDivElement>(null);
  const resetLayoutRef = useRef<() => void>(() => undefined);
  const pointerSessionRef = useRef<StudioFloatingSurfacePointerSession | null>(null);
  const pendingCommitRef = useRef<PendingCommit | null>(null);
  const dockPreviewEdgeRef = useRef<StudioFloatingSurfaceDockEdge | null>(null);
  const dockPreviewPreferredRectRef = useRef<StudioFloatingSurfaceRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [placementMenuOpen, setPlacementMenuOpen] = useState(false);
  const [dockPreviewEdge, setDockPreviewEdge] =
    useState<StudioFloatingSurfaceDockEdge | null>(null);
  const [zIndex, setZIndex] = useState(STUDIO_FLOATING_SURFACE_Z_INDEX_BASE);
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
  const constraints = useMemo<StudioFloatingSurfaceConstraints>(() => ({
    minWidth,
    minHeight,
    maxWidth,
    ...(maxHeight === undefined ? {} : { maxHeight }),
    snapDistance,
  }), [maxHeight, maxWidth, minHeight, minWidth, snapDistance]);
  const normalizedAllowedDockEdges = useMemo(() => {
    const result = allowedDockEdges.filter(
      (edge, index, values) =>
        STUDIO_FLOATING_SURFACE_DOCK_EDGES.includes(edge)
        && values.indexOf(edge) === index,
    );
    return sameDockEdges(result, STUDIO_FLOATING_SURFACE_DOCK_EDGES)
      ? STUDIO_FLOATING_SURFACE_DOCK_EDGES
      : Object.freeze(result);
  }, [allowedDockEdges]);
  const normalizedCommittedLayout = normalizeStudioFloatingSurfaceLayout(
    committedLayout,
    normalizedDefault,
  );
  const committedDock = normalizedCommittedLayout.dock ?? null;
  const committedRect = resolveStudioFloatingSurfaceRect(
    normalizedCommittedLayout,
    viewport,
    constraints,
    normalizedDefault,
  );
  const floatingRect = resolveStudioFloatingSurfaceFloatingRect(
    normalizedCommittedLayout,
    viewport,
    constraints,
    normalizedDefault,
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
    return () => {
      globalThis.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
    };
  }, [viewportInsets]);

  const commitLayout = useCallback((nextLayout: StudioFloatingSurfaceLayout): void => {
    const next = normalizeStudioFloatingSurfaceLayout(nextLayout, normalizedDefault);
    setCommittedLayout(next);
    if (!studioFloatingSurfaceLayoutsEqual(layout, next)) {
      onLayoutChange(next);
    }
  }, [layout, normalizedDefault, onLayoutChange]);

  const resetLayout = useCallback((): void => {
    commitLayout(normalizedDefault);
    setPlacementMenuOpen(false);
  }, [commitLayout, normalizedDefault]);

  resetLayoutRef.current = resetLayout;

  const activateSurface = useCallback((): void => {
    studioFloatingSurfaceRegistry.activate(effectiveSurfaceId);
  }, [effectiveSurfaceId]);

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    return studioFloatingSurfaceRegistry.register({
      id: effectiveSurfaceId,
      node,
      onZIndexChange: setZIndex,
      onReset: () => resetLayoutRef.current(),
    });
  }, [effectiveSurfaceId]);

  useLayoutEffect(
    () => () => {
      pointerSessionRef.current?.cancel();
      pointerSessionRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!placementMenuOpen) return;
    const dismiss = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && placementMenuRef.current?.contains(target)) {
        return;
      }
      setPlacementMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPlacementMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [placementMenuOpen]);

  const setDockPreview = (
    edge: StudioFloatingSurfaceDockEdge | null,
    preferredRect: StudioFloatingSurfaceRect | null,
  ): void => {
    dockPreviewPreferredRectRef.current = preferredRect;
    if (dockPreviewEdgeRef.current === edge) return;
    dockPreviewEdgeRef.current = edge;
    setDockPreviewEdge(edge);
  };

  const commitResolvedRect = (nextRect: StudioFloatingSurfaceRect): void => {
    const pending = pendingCommitRef.current;
    pendingCommitRef.current = null;
    if (pending?.layout) {
      commitLayout(pending.layout);
      return;
    }
    const preferred = pending?.preferredRect ?? nextRect;
    commitLayout(createStudioFloatingSurfaceLayout(
      preferred,
      viewport,
      constraints,
      pending?.dock ?? null,
    ));
  };

  const beginPointerSession = (
    event: ReactPointerEvent<HTMLElement>,
    kind: StudioFloatingSurfaceInteractionKind,
  ): void => {
    if (
      event.isPrimary === false
      || (typeof event.button === "number" && event.button !== 0)
      || pointerSessionRef.current
    ) {
      return;
    }
    const node = rootRef.current;
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    activateSurface();
    const target = event.currentTarget;
    target.focus({ preventScroll: true });
    const movementStartRect =
      kind === "move" && committedDock
        ? undockStudioFloatingSurfaceRect(
            normalizedCommittedLayout,
            committedRect,
            event.clientX,
            event.clientY,
            viewport,
            constraints,
          )
        : committedRect;

    pointerSessionRef.current = startStudioFloatingSurfacePointerSession({
      kind,
      target,
      node,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      startRect: movementStartRect,
      restoreRect: committedRect,
      activeCursor: kind === "move"
        ? "grabbing"
        : committedDock === "bottom"
          ? "ns-resize"
          : committedDock
            ? "ew-resize"
            : "se-resize",
      resolveRect(deltaX, deltaY, commit) {
        if (kind === "resize") {
          const resized = committedDock
            ? resizeStudioFloatingSurfaceDockRect(
                committedRect,
                committedDock,
                deltaX,
                deltaY,
                viewport,
                constraints,
              )
            : resizeStudioFloatingSurfaceRect(
                committedRect,
                deltaX,
                deltaY,
                viewport,
                constraints,
              );
          if (commit) {
            pendingCommitRef.current = committedDock
              ? {
                  dock: committedDock,
                  layout: normalizeStudioFloatingSurfaceLayout({
                    ...normalizedCommittedLayout,
                    width: committedDock === "bottom"
                      ? normalizedCommittedLayout.width
                      : resized.width,
                    height: committedDock === "bottom"
                      ? resized.height
                      : normalizedCommittedLayout.height,
                    dock: committedDock,
                  }, normalizedDefault),
                }
              : {
                  dock: null,
                  preferredRect: resized,
                };
          }
          return resized;
        }

        const moved = moveStudioFloatingSurfaceRect(
          movementStartRect,
          deltaX,
          deltaY,
          viewport,
          constraints,
          commit,
        );
        const peerSnapped = snapStudioFloatingSurfaceRectToPeers(
          moved,
          studioFloatingSurfaceRegistry.peerRects(effectiveSurfaceId),
          viewport,
          constraints,
          peerSnapDistance,
        );
        const candidate = resolveStudioFloatingSurfaceDockCandidate(
          peerSnapped,
          viewport,
          normalizedAllowedDockEdges,
          dockActivationDistance,
        );
        setDockPreview(candidate, candidate ? peerSnapped : null);
        if (!commit) return peerSnapped;

        pendingCommitRef.current = {
          dock: candidate,
          preferredRect: peerSnapped,
        };
        return candidate
          ? resolveStudioFloatingSurfaceDockRect(
              candidate,
              peerSnapped,
              viewport,
              constraints,
            )
          : peerSnapped;
      },
      onActiveChange(active) {
        if (kind === "move") setDragging(active);
        else setResizing(active);
      },
      onCommit: commitResolvedRect,
      onComplete() {
        pointerSessionRef.current = null;
        pendingCommitRef.current = null;
        dockPreviewEdgeRef.current = null;
        dockPreviewPreferredRectRef.current = null;
        if (rootRef.current?.isConnected) setDockPreviewEdge(null);
      },
    });
  };

  const applyDock = (edge: StudioFloatingSurfaceDockEdge): void => {
    if (!normalizedAllowedDockEdges.includes(edge)) return;
    commitLayout(createStudioFloatingSurfaceLayout(
      floatingRect,
      viewport,
      constraints,
      edge,
    ));
    setPlacementMenuOpen(false);
  };

  const releaseDock = (): void => {
    if (!committedDock) {
      setPlacementMenuOpen(false);
      return;
    }
    commitLayout(createStudioFloatingSurfaceLayout(
      floatingRect,
      viewport,
      constraints,
      null,
    ));
    setPlacementMenuOpen(false);
  };

  const handleMoveKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return;
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
    const start = committedDock ? floatingRect : committedRect;
    commitLayout(createStudioFloatingSurfaceLayout(
      moveStudioFloatingSurfaceRect(
        start,
        deltaX,
        deltaY,
        viewport,
        constraints,
        true,
      ),
      viewport,
      constraints,
      null,
    ));
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return;
    const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_MOVE_STEP;
    let deltaWidth = 0;
    let deltaHeight = 0;
    if (event.key === "ArrowLeft") deltaWidth = -step;
    else if (event.key === "ArrowRight") deltaWidth = step;
    else if (event.key === "ArrowUp") deltaHeight = -step;
    else if (event.key === "ArrowDown") deltaHeight = step;
    else return;
    event.preventDefault();
    event.stopPropagation();

    if (committedDock) {
      const resized = resizeStudioFloatingSurfaceDockRect(
        committedRect,
        committedDock,
        deltaWidth,
        deltaHeight,
        viewport,
        constraints,
      );
      commitLayout(normalizeStudioFloatingSurfaceLayout({
        ...normalizedCommittedLayout,
        width: committedDock === "bottom"
          ? normalizedCommittedLayout.width
          : resized.width,
        height: committedDock === "bottom"
          ? resized.height
          : normalizedCommittedLayout.height,
        dock: committedDock,
      }, normalizedDefault));
      return;
    }

    commitLayout(createStudioFloatingSurfaceLayout(
      resizeStudioFloatingSurfaceRect(
        committedRect,
        deltaWidth,
        deltaHeight,
        viewport,
        constraints,
      ),
      viewport,
      constraints,
      null,
    ));
  };

  const style = {
    left: committedRect.x,
    top: committedRect.y,
    width: committedRect.width,
    height: committedRect.height,
    transform: "translate3d(0, 0, 0)",
    willChange: dragging ? "transform" : resizing ? "left, top, width, height" : undefined,
    zIndex,
  } satisfies CSSProperties;

  const previewPreferred = dockPreviewPreferredRectRef.current ?? floatingRect;
  const dockPreviewRect = dockPreviewEdge
    ? resolveStudioFloatingSurfaceDockRect(
        dockPreviewEdge,
        previewPreferred,
        viewport,
        constraints,
      )
    : null;
  const compactChrome = chromeDensity === "compact";
  const resizePositionClass = committedDock === "left"
    ? "right-0 top-1/2 h-20 w-3 -translate-y-1/2 cursor-ew-resize"
    : committedDock === "right"
      ? "left-0 top-1/2 h-20 w-3 -translate-y-1/2 cursor-ew-resize"
      : committedDock === "bottom"
        ? "left-1/2 top-0 h-3 w-20 -translate-x-1/2 cursor-ns-resize"
        : "bottom-0 right-0 size-8 cursor-se-resize pointer-coarse:size-11";

  const surface = (
    <div
      ref={(node: HTMLDivElement | null) => {
        rootRef.current = node;
        assignRef(forwardedRef, node);
      }}
      role="dialog"
      aria-label={label}
      aria-describedby={descriptionId}
      aria-roledescription="이동 가능한 패널"
      {...rootDataAttributes}
      data-studio-floating-surface="true"
      data-studio-floating-surface-id={effectiveSurfaceId}
      data-dock-edge={committedDock ?? undefined}
      data-dragging={dragging ? "true" : "false"}
      data-resizing={resizing ? "true" : "false"}
      className={cn(
        "pointer-events-auto fixed flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel text-fg shadow-2xl",
        committedDock && "rounded-lg border-line-strong",
        className,
      )}
      style={style}
      tabIndex={-1}
      onFocusCapture={activateSurface}
      onPointerDownCapture={activateSurface}
    >
      <div
        className={cn(
          "flex shrink-0 items-stretch border-b border-line bg-raised/90",
          compactChrome ? "h-8" : "h-10",
        )}
      >
        <button
          type="button"
          aria-label={`${label} 이동`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home"
          data-studio-floating-surface-drag-handle="true"
          className={cn(
            "flex min-w-0 flex-1 touch-none cursor-grab items-center gap-2 px-3 text-left font-bold text-fg-2 active:cursor-grabbing",
            compactChrome ? "text-[0.6875rem]" : "text-xs",
            "hover:bg-card hover:text-fg",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onDoubleClick={resetLayout}
          onKeyDown={handleMoveKeyDown}
          onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
            beginPointerSession(event, "move")}
        >
          <GripHorizontal size={compactChrome ? 14 : 16} aria-hidden className="shrink-0 text-fg-3" />
          <span className="truncate">
            {label}
            {committedDock ? ` · ${dockLabel(committedDock)} 도킹` : ""}
          </span>
        </button>
        <div ref={placementMenuRef} className="relative flex shrink-0">
          <button
            type="button"
            aria-label={`${label} 배치 메뉴`}
            aria-haspopup="menu"
            aria-expanded={placementMenuOpen}
            title="패널 배치"
            className={cn(
              "inline-flex shrink-0 items-center justify-center text-fg-3 hover:bg-card hover:text-fg",
              compactChrome ? "size-8" : "size-10",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
            onClick={() => setPlacementMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={compactChrome ? 14 : 16} aria-hidden />
          </button>
          {placementMenuOpen ? (
            <div
              role="menu"
              aria-label={`${label} 배치`}
              className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-xl border border-line-strong bg-panel p-1.5 text-xs shadow-2xl"
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={!committedDock}
                className="flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-fg-2 hover:bg-raised hover:text-fg"
                onClick={releaseDock}
              >
                자유 배치
              </button>
              {normalizedAllowedDockEdges.map((edge) => (
                <button
                  key={edge}
                  type="button"
                  role="menuitemradio"
                  aria-checked={committedDock === edge}
                  className="flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-fg-2 hover:bg-raised hover:text-fg"
                  onClick={() => applyDock(edge)}
                >
                  {dockLabel(edge)}에 도킹
                </button>
              ))}
              <div role="separator" className="mx-2 my-1 h-px bg-line" />
              <button
                type="button"
                role="menuitem"
                className="flex min-h-10 w-full items-center rounded-lg px-2.5 text-left text-fg-2 hover:bg-raised hover:text-fg"
                onClick={resetLayout}
              >
                위치와 크기 초기화
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={`${label} 위치와 크기 초기화`}
          title="위치와 크기 초기화"
          className={cn(
            "inline-flex shrink-0 items-center justify-center text-fg-3 hover:bg-card hover:text-fg",
            compactChrome ? "size-8 pointer-coarse:size-11" : "size-10 pointer-coarse:size-11",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onClick={resetLayout}
        >
          <RotateCcw size={compactChrome ? 13 : 15} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`${label} 닫기`}
          title="닫기"
          className={cn(
            "inline-flex shrink-0 items-center justify-center text-fg-3 hover:bg-card hover:text-fg",
            compactChrome ? "size-8 pointer-coarse:size-11" : "size-10 pointer-coarse:size-11",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onClick={onClose}
        >
          <X size={compactChrome ? 14 : 16} aria-hidden />
        </button>
      </div>
      <div className={cn("min-h-0 flex-1", contentClassName)}>
        {children}
      </div>
      <button
        type="button"
        aria-label={`${label} 크기 조절`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        data-studio-floating-surface-resize-handle="true"
        className={cn(
          "absolute z-10 touch-none",
          resizePositionClass,
          !committedDock
            && "rounded-tl-md after:absolute after:bottom-1 after:right-1 after:size-2.5 after:border-b-2 after:border-r-2 after:border-fg-3/70",
          "hover:bg-raised focus-visible:bg-raised",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
        )}
        onKeyDown={handleResizeKeyDown}
        onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
          beginPointerSession(event, "resize")}
      />
    </div>
  );

  return (
    <>
      {surface}
      {dockPreviewRect && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-hidden="true"
              data-studio-floating-dock-preview={dockPreviewEdge}
              className="pointer-events-none fixed rounded-xl border-2 border-accent bg-accent-soft/30 shadow-[0_0_0_1px_oklch(0.85_0.12_70/0.35)] backdrop-blur-[1px]"
              style={{
                left: dockPreviewRect.x,
                top: dockPreviewRect.y,
                width: dockPreviewRect.width,
                height: dockPreviewRect.height,
                zIndex: zIndex + 1,
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
});
