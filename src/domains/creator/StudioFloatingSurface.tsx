import { GripHorizontal, RotateCcw, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
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

import {
  createStudioFloatingSurfaceLayout,
  moveStudioFloatingSurfaceRect,
  normalizeStudioFloatingSurfaceLayout,
  resizeStudioFloatingSurfaceRect,
  resolveStudioFloatingSurfaceRect,
  studioFloatingSurfaceLayoutsEqual,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceRect,
  type StudioFloatingSurfaceViewport,
} from "./studio-floating-surface";
import {
  startStudioFloatingSurfacePointerSession,
  type StudioFloatingSurfaceInteractionKind,
  type StudioFloatingSurfacePointerSession,
} from "./studio-floating-surface-pointer";
import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
} from "./studio-panel-ui";

import { cn } from "@/lib/utils";

const KEYBOARD_MOVE_STEP = 10;
const KEYBOARD_LARGE_STEP = 40;

export interface StudioFloatingSurfaceProps {
  readonly label: string;
  readonly layout: StudioFloatingSurfaceLayout;
  readonly defaultLayout: StudioFloatingSurfaceLayout;
  readonly onLayoutChange: (layout: StudioFloatingSurfaceLayout) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly descriptionId?: string;
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

/**
 * Shared desktop window chrome for Studio's persistent non-modal palettes.
 *
 * Pointer previews mutate only transform/size styles in rAF. Durable state is emitted once on
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
  descriptionId,
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
  rootDataAttributes,
}, forwardedRef) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerSessionRef = useRef<StudioFloatingSurfacePointerSession | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
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

  useLayoutEffect(
    () => () => {
      pointerSessionRef.current?.cancel();
      pointerSessionRef.current = null;
    },
    [],
  );

  const commitRect = (nextRect: StudioFloatingSurfaceRect): void => {
    const nextLayout = createStudioFloatingSurfaceLayout(
      nextRect,
      viewport,
      constraints,
    );
    setCommittedLayout(nextLayout);
    if (!studioFloatingSurfaceLayoutsEqual(layout, nextLayout)) {
      onLayoutChange(nextLayout);
    }
  };

  const resetLayout = (): void => {
    const next = normalizeStudioFloatingSurfaceLayout(normalizedDefault);
    setCommittedLayout(next);
    if (!studioFloatingSurfaceLayoutsEqual(layout, next)) {
      onLayoutChange(next);
    }
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
          : resizeStudioFloatingSurfaceRect(
              committedRect,
              deltaX,
              deltaY,
              viewport,
              constraints,
            );
      },
      onActiveChange(active) {
        if (kind === "move") setDragging(active);
        else setResizing(active);
      },
      onCommit: commitRect,
      onComplete() {
        pointerSessionRef.current = null;
      },
    });
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
    commitRect(moveStudioFloatingSurfaceRect(
      committedRect,
      deltaX,
      deltaY,
      viewport,
      constraints,
      true,
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
    commitRect(resizeStudioFloatingSurfaceRect(
      committedRect,
      deltaWidth,
      deltaHeight,
      viewport,
      constraints,
    ));
  };

  const style = {
    left: committedRect.x,
    top: committedRect.y,
    width: committedRect.width,
    height: committedRect.height,
    transform: "translate3d(0, 0, 0)",
    willChange: dragging ? "transform" : resizing ? "width, height" : undefined,
  } satisfies CSSProperties;

  return (
    <div
      ref={(node: HTMLDivElement | null) => {
        rootRef.current = node;
        assignRef(forwardedRef, node);
      }}
      role="dialog"
      aria-label={label}
      aria-describedby={descriptionId}
      {...rootDataAttributes}
      data-studio-floating-surface="true"
      data-dragging={dragging ? "true" : "false"}
      data-resizing={resizing ? "true" : "false"}
      className={cn(
        "pointer-events-auto absolute flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel text-fg shadow-2xl",
        className,
      )}
      style={style}
      tabIndex={-1}
    >
      <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-raised/90">
        <button
          type="button"
          aria-label={`${label} 이동`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home"
          data-studio-floating-surface-drag-handle="true"
          className={cn(
            "flex min-w-0 flex-1 touch-none cursor-grab items-center gap-2 px-3 text-left text-xs font-bold text-fg-2 active:cursor-grabbing",
            "hover:bg-card hover:text-fg",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onDoubleClick={resetLayout}
          onKeyDown={handleMoveKeyDown}
          onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
            beginPointerSession(event, "move")}
        >
          <GripHorizontal size={16} aria-hidden className="shrink-0 text-fg-3" />
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          aria-label={`${label} 위치와 크기 초기화`}
          title="위치와 크기 초기화"
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center text-fg-3 hover:bg-card hover:text-fg",
            STUDIO_TOUCH_TARGET,
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
          onClick={resetLayout}
        >
          <RotateCcw size={15} aria-hidden />
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
      <div className={cn("min-h-0 flex-1", contentClassName)}>
        {children}
      </div>
      <button
        type="button"
        aria-label={`${label} 크기 조절`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        data-studio-floating-surface-resize-handle="true"
        className={cn(
          "absolute bottom-0 right-0 z-10 size-8 touch-none cursor-se-resize rounded-tl-md pointer-coarse:size-11",
          "after:absolute after:bottom-1 after:right-1 after:size-2.5 after:border-b-2 after:border-r-2 after:border-fg-3/70",
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
});
