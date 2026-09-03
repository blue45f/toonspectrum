import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  StudioFloatingSurface as StudioFloatingSurfaceCore,
  type StudioFloatingSurfaceProps as StudioFloatingSurfaceCoreProps,
} from "./StudioFloatingSurfaceCore";
import {
  createStudioFloatingSurfaceLayout,
  normalizeStudioFloatingSurfaceLayout,
  resizeStudioFloatingSurfaceRectFromEdge,
  resolveStudioFloatingSurfaceRect,
  STUDIO_FLOATING_SURFACE_RESIZE_EDGES,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceResizeEdge,
  type StudioFloatingSurfaceViewport,
} from "./studio-floating-surface";
import { studioFloatingSurfaceRegistry } from "./studio-floating-surface-registry";
import {
  startStudioFloatingSurfacePointerSession,
  type StudioFloatingSurfacePointerSession,
} from "./studio-floating-surface-pointer";

import { cn } from "@/lib/utils";

export type { StudioFloatingSurfaceProps } from "./StudioFloatingSurfaceCore";

const EXTRA_RESIZE_EDGES = Object.freeze(
  STUDIO_FLOATING_SURFACE_RESIZE_EDGES.filter((edge) => edge !== "se"),
);

const RESIZE_EDGE_CURSOR: Readonly<
  Record<StudioFloatingSurfaceResizeEdge, string>
> = Object.freeze({
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
  nw: "nwse-resize",
});

const RESIZE_EDGE_CLASS: Readonly<
  Record<StudioFloatingSurfaceResizeEdge, string>
> = Object.freeze({
  n: "left-4 right-4 top-0 h-2 cursor-ns-resize",
  ne: "right-0 top-0 size-4 cursor-nesw-resize",
  e: "bottom-4 right-0 top-4 w-2 cursor-ew-resize",
  se: "bottom-0 right-0 size-8 cursor-nwse-resize pointer-coarse:size-11",
  s: "bottom-0 left-4 right-4 h-2 cursor-ns-resize",
  sw: "bottom-0 left-0 size-4 cursor-nesw-resize",
  w: "bottom-4 left-0 top-4 w-2 cursor-ew-resize",
  nw: "left-0 top-0 size-4 cursor-nwse-resize",
});

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function readViewport(
  props: Pick<
    StudioFloatingSurfaceCoreProps,
    "insetTop" | "insetRight" | "insetBottom" | "insetLeft"
  >,
): StudioFloatingSurfaceViewport {
  const visualViewport = typeof window !== "undefined"
    ? window.visualViewport
    : null;
  return {
    width: visualViewport?.width ?? globalThis.innerWidth ?? 1,
    height: visualViewport?.height ?? globalThis.innerHeight ?? 1,
    insetTop: props.insetTop ?? 0,
    insetRight: props.insetRight ?? 0,
    insetBottom: props.insetBottom ?? 0,
    insetLeft: props.insetLeft ?? 0,
  };
}

/**
 * Compatibility shell that preserves the proven Studio window core while adding the seven
 * remaining resize edges. The core keeps ownership of movement, docking, focus stacking, the
 * accessible south-east keyboard handle, and durable layout state; these pointer-only handles use
 * the same rAF session and commit once through the existing controlled layout callback.
 */
export const StudioFloatingSurface = forwardRef<
  HTMLDivElement,
  StudioFloatingSurfaceCoreProps
>(function StudioFloatingSurface(props, forwardedRef) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerSessionRef =
    useRef<StudioFloatingSurfacePointerSession | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const normalizedLayout = normalizeStudioFloatingSurfaceLayout(
    props.layout,
    props.defaultLayout,
  );
  const docked = normalizedLayout.dock !== undefined
    && normalizedLayout.dock !== null;
  const constraints = useMemo<StudioFloatingSurfaceConstraints>(() => ({
    minWidth: props.minWidth ?? 280,
    minHeight: props.minHeight ?? 240,
    maxWidth: props.maxWidth ?? 720,
    ...(props.maxHeight === undefined ? {} : { maxHeight: props.maxHeight }),
    snapDistance: props.snapDistance ?? 12,
  }), [
    props.maxHeight,
    props.maxWidth,
    props.minHeight,
    props.minWidth,
    props.snapDistance,
  ]);

  const setRoot = useCallback((node: HTMLDivElement | null): void => {
    rootRef.current = node;
    setPortalRoot((current) => current === node ? current : node);
    assignRef(forwardedRef, node);
  }, [forwardedRef]);

  useLayoutEffect(
    () => () => {
      pointerSessionRef.current?.cancel();
      pointerSessionRef.current = null;
    },
    [],
  );

  const beginExtraResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    edge: StudioFloatingSurfaceResizeEdge,
  ): void => {
    if (
      docked
      || event.isPrimary === false
      || (typeof event.button === "number" && event.button !== 0)
      || pointerSessionRef.current
    ) {
      return;
    }
    const node = rootRef.current;
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    const registeredId = node.dataset.studioFloatingSurfaceId;
    if (registeredId) studioFloatingSurfaceRegistry.activate(registeredId);

    const viewport = readViewport(props);
    const startRect = resolveStudioFloatingSurfaceRect(
      normalizedLayout,
      viewport,
      constraints,
      props.defaultLayout,
    );
    const previousWillChange = node.style.willChange;
    pointerSessionRef.current = startStudioFloatingSurfacePointerSession({
      kind: "resize",
      target: event.currentTarget,
      node,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      startRect,
      restoreRect: startRect,
      activeCursor: RESIZE_EDGE_CURSOR[edge],
      resolveRect(deltaX, deltaY) {
        return resizeStudioFloatingSurfaceRectFromEdge(
          startRect,
          deltaX,
          deltaY,
          edge,
          viewport,
          constraints,
        );
      },
      onActiveChange(active) {
        node.dataset.resizing = active ? "true" : "false";
        node.style.willChange = active
          ? "left, top, width, height"
          : previousWillChange;
      },
      onCommit(rect) {
        props.onLayoutChange(createStudioFloatingSurfaceLayout(
          rect,
          viewport,
          constraints,
          null,
        ));
      },
      onComplete() {
        pointerSessionRef.current = null;
        if (node.isConnected) {
          node.dataset.resizing = "false";
          node.style.willChange = previousWillChange;
        }
      },
    });
  };

  return (
    <>
      <StudioFloatingSurfaceCore {...props} ref={setRoot} />
      {portalRoot && !docked
        ? createPortal(
            EXTRA_RESIZE_EDGES.map((edge) => (
              <button
                key={edge}
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                data-studio-floating-surface-extra-resize-handle="true"
                data-resize-edge={edge}
                className={cn(
                  "absolute z-10 touch-none",
                  RESIZE_EDGE_CLASS[edge],
                  "hover:bg-raised/70",
                )}
                onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) =>
                  beginExtraResize(event, edge)}
              />
            )),
            portalRoot,
          )
        : null}
    </>
  );
});
