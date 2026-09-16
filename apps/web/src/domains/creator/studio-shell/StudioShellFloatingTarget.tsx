import { EyeOff, GripHorizontal, RotateCcw, Scaling } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  createStudioFloatingSurfaceLayout,
  moveStudioFloatingSurfaceRect,
  resizeStudioFloatingSurfaceRectFromEdge,
  resolveStudioFloatingSurfaceDock,
  resolveStudioFloatingSurfaceRect,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceRect,
  type StudioFloatingSurfaceViewport,
} from "../studio-floating-surface";
import {
  startStudioFloatingSurfacePointerSession,
  type StudioFloatingSurfacePointerSession,
} from "../studio-floating-surface-pointer";
import {
  bringStudioFloatingSurfaceToFront,
  registerStudioFloatingSurface,
  registerStudioFloatingSurfaceArrangementController,
  studioFloatingSurfaceStackSnapshot,
  studioFloatingSurfaceZIndex,
  subscribeStudioFloatingSurfaceLayoutReset,
  subscribeStudioFloatingSurfaceStack,
} from "../studio-floating-surface-stack";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  studioWorkspaceArrangingSnapshot,
  subscribeStudioWorkspaceArranging,
} from "../studio-workspace-arrangement";
import { useStudioFloatingSurfaceLayout } from "../use-studio-floating-surface-layout";
import { useStudioShellFloatingLayout } from "./studio-shell-floating-layout-context";
import {
  studioShellFloatingSurfaceById,
  type StudioShellFloatingSurfaceId,
} from "./studio-shell-floating-layout";

import { cn } from "@/shared/lib/utils";

const MOVE_STEP = 10;
const LARGE_MOVE_STEP = 40;
const MANAGED_STYLE_PROPERTIES = [
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "transform",
  "z-index",
  "will-change",
] as const;

type ManagedStyleProperty = (typeof MANAGED_STYLE_PROPERTIES)[number];
interface StyleValue {
  readonly value: string;
  readonly priority: string;
}
type StyleSnapshot = Readonly<Record<ManagedStyleProperty, StyleValue>>;

function captureStyle(node: HTMLElement): StyleSnapshot {
  return Object.fromEntries(MANAGED_STYLE_PROPERTIES.map((property) => [
    property,
    {
      value: node.style.getPropertyValue(property),
      priority: node.style.getPropertyPriority(property),
    },
  ])) as Record<ManagedStyleProperty, StyleValue>;
}

function restoreStyle(node: HTMLElement, snapshot: StyleSnapshot): void {
  for (const property of MANAGED_STYLE_PROPERTIES) {
    const { value, priority } = snapshot[property];
    if (value) node.style.setProperty(property, value, priority);
    else node.style.removeProperty(property);
  }
}

function readViewport(
  definition: ReturnType<typeof studioShellFloatingSurfaceById>,
): StudioFloatingSurfaceViewport {
  const visual = typeof window === "undefined" ? null : window.visualViewport;
  const offsetLeft = visual?.offsetLeft ?? 0;
  const offsetTop = visual?.offsetTop ?? 0;
  return {
    width: offsetLeft + (visual?.width ?? globalThis.innerWidth ?? 1),
    height: offsetTop + (visual?.height ?? globalThis.innerHeight ?? 1),
    insetTop: offsetTop + definition.insetTop,
    insetRight: definition.insetRight,
    insetBottom: definition.insetBottom,
    insetLeft: offsetLeft + definition.insetLeft,
  };
}

function measuredSize(
  node: HTMLElement | null,
  fallback: { readonly width: number; readonly height: number },
): { readonly width: number; readonly height: number } {
  const rect = node?.getBoundingClientRect();
  return {
    width: rect && rect.width > 0 ? rect.width : fallback.width,
    height: rect && rect.height > 0 ? rect.height : fallback.height,
  };
}

function actualConstraints(
  definition: ReturnType<typeof studioShellFloatingSurfaceById>,
  size: { readonly width: number; readonly height: number },
): StudioFloatingSurfaceConstraints {
  if (definition.applySize) {
    return {
      minWidth: definition.minWidth,
      minHeight: definition.minHeight,
      ...(definition.maxWidth === undefined ? {} : { maxWidth: definition.maxWidth }),
      ...(definition.maxHeight === undefined ? {} : { maxHeight: definition.maxHeight }),
      snapDistance: 14,
    };
  }
  return {
    minWidth: Math.max(1, size.width),
    minHeight: Math.max(1, size.height),
    maxWidth: Math.max(1, size.width),
    maxHeight: Math.max(1, size.height),
    snapDistance: 14,
  };
}

function setManagedAttributes(
  node: HTMLElement,
  surfaceId: StudioShellFloatingSurfaceId,
  visible: boolean,
): void {
  node.setAttribute("data-studio-shell-layout-hidden", visible ? "false" : "true");
  node.setAttribute("data-studio-shell-layout-managed", "true");
  node.setAttribute("data-studio-shell-layout-surface", surfaceId);
}

function styleRect(node: HTMLElement, rect: StudioFloatingSurfaceRect, applySize: boolean): void {
  node.style.setProperty("position", "fixed");
  node.style.setProperty("left", `${Math.round(rect.x)}px`);
  node.style.setProperty("top", `${Math.round(rect.y)}px`);
  node.style.setProperty("right", "auto");
  node.style.setProperty("bottom", "auto");
  node.style.setProperty("transform", "none");
  if (applySize) {
    node.style.setProperty("width", `${Math.round(rect.width)}px`);
    node.style.setProperty("height", `${Math.round(rect.height)}px`);
  } else {
    node.style.removeProperty("width");
    node.style.removeProperty("height");
  }
}

function keyboardDelta(
  event: ReactKeyboardEvent<HTMLButtonElement>,
): readonly [number, number] | null {
  const step = event.shiftKey ? LARGE_MOVE_STEP : MOVE_STEP;
  switch (event.key) {
    case "ArrowLeft": return [-step, 0] as const;
    case "ArrowRight": return [step, 0] as const;
    case "ArrowUp": return [0, -step] as const;
    case "ArrowDown": return [0, step] as const;
    default: return null;
  }
}

export function StudioShellFloatingTarget({
  surfaceId,
}: {
  readonly surfaceId: StudioShellFloatingSurfaceId;
}) {
  const definition = useMemo(
    () => studioShellFloatingSurfaceById(surfaceId),
    [surfaceId],
  );
  const shell = useStudioShellFloatingLayout();
  const preferredVisible = shell.isVisible(definition.visibilityId);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [forceVisible, setForceVisible] = useState(false);
  const [size, setSize] = useState(() => ({
    width: definition.defaultLayout.width,
    height: definition.defaultLayout.height,
  }));
  const [viewport, setViewport] = useState(() => readViewport(definition));
  const [screenRect, setScreenRect] = useState<DOMRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const pointerSession = useRef<StudioFloatingSurfacePointerSession | null>(null);
  const originalStyle = useRef<StyleSnapshot | null>(null);
  const originalHiddenMarker = useRef<string | null>(null);
  const stackSurfaceId = `shell:${surfaceId}`;
  const arranging = useSyncExternalStore(
    subscribeStudioWorkspaceArranging,
    studioWorkspaceArrangingSnapshot,
    () => false,
  );
  useSyncExternalStore(
    subscribeStudioFloatingSurfaceStack,
    studioFloatingSurfaceStackSnapshot,
    () => 0,
  );
  const { layout, setLayout, resetLayout } = useStudioFloatingSurfaceLayout({
    surfaceId: stackSurfaceId,
    defaultLayout: definition.defaultLayout,
  });
  const actualVisible = preferredVisible || forceVisible;
  const positionEnabled = viewport.width >= definition.positionMinWidth;
  const constraints = useMemo(
    () => actualConstraints(definition, size),
    [definition, size],
  );
  const resolvedRect = useMemo(() => resolveStudioFloatingSurfaceRect(
    layout,
    viewport,
    constraints,
    definition.defaultLayout,
  ), [constraints, definition.defaultLayout, layout, viewport]);
  const resetRevision = shell.resetRevisions[surfaceId];
  const seenResetRevision = useRef(resetRevision);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return undefined;
    let active = true;
    const locate = (): void => {
      if (!active) return;
      const candidate = document.querySelector<HTMLElement>(definition.selector);
      setNode((current) => current === candidate ? current : candidate);
      setForceVisible(candidate?.dataset.studioShellForceVisible === "true");
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-studio-shell-force-visible"],
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [definition.selector]);

  useLayoutEffect(() => {
    if (!node) return undefined;
    originalStyle.current = captureStyle(node);
    originalHiddenMarker.current = node.getAttribute("data-studio-shell-layout-hidden");
    return () => {
      pointerSession.current?.cancel();
      pointerSession.current = null;
      if (originalStyle.current) restoreStyle(node, originalStyle.current);
      if (originalHiddenMarker.current === null) {
        node.removeAttribute("data-studio-shell-layout-hidden");
      } else {
        node.setAttribute(
          "data-studio-shell-layout-hidden",
          originalHiddenMarker.current,
        );
      }
      node.removeAttribute("data-studio-shell-layout-managed");
      node.removeAttribute("data-studio-shell-layout-surface");
      originalStyle.current = null;
    };
  }, [node]);

  useLayoutEffect(() => {
    if (!node) return;
    setManagedAttributes(node, surfaceId, actualVisible);
  }, [actualVisible, node, surfaceId]);

  useLayoutEffect(() => {
    if (!node) return undefined;
    const update = (): void => {
      const next = measuredSize(node, definition.defaultLayout);
      setSize((current) =>
        Math.abs(current.width - next.width) < 0.5
        && Math.abs(current.height - next.height) < 0.5
          ? current
          : next
      );
      const rect = node.getBoundingClientRect();
      setScreenRect(rect.width > 0 && rect.height > 0 ? rect : null);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [definition.defaultLayout, node]);

  useEffect(() => {
    const update = (): void => setViewport(readViewport(definition));
    globalThis.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      globalThis.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [definition]);

  useLayoutEffect(() => {
    if (!node || !actualVisible || !positionEnabled) {
      if (node && originalStyle.current) restoreStyle(node, originalStyle.current);
      return;
    }
    styleRect(node, resolvedRect, definition.applySize);
    node.style.setProperty(
      "z-index",
      String(Math.max(
        definition.zIndexFloor,
        studioFloatingSurfaceZIndex(stackSurfaceId),
      )),
    );
    const rect = node.getBoundingClientRect();
    setScreenRect(rect.width > 0 && rect.height > 0 ? rect : null);
  }, [
    actualVisible,
    definition.applySize,
    definition.zIndexFloor,
    node,
    positionEnabled,
    resolvedRect,
    stackSurfaceId,
  ]);

  useLayoutEffect(() => {
    if (!node || !actualVisible || !positionEnabled) return undefined;
    return registerStudioFloatingSurface(stackSurfaceId);
  }, [actualVisible, node, positionEnabled, stackSurfaceId]);

  useEffect(
    () => subscribeStudioFloatingSurfaceLayoutReset(resetLayout),
    [resetLayout],
  );

  useEffect(() => {
    if (seenResetRevision.current === resetRevision) return;
    seenResetRevision.current = resetRevision;
    resetLayout();
  }, [resetLayout, resetRevision]);

  useEffect(() => () => {
    pointerSession.current?.cancel();
    pointerSession.current = null;
  }, []);

  const commitRect = (
    nextRect: StudioFloatingSurfaceRect,
    dock = resolveStudioFloatingSurfaceDock(nextRect, viewport, 14),
  ): void => {
    setLayout(createStudioFloatingSurfaceLayout(
      nextRect,
      viewport,
      constraints,
      {
        dock,
        positionLocked: layout.positionLocked,
        sizeLocked: layout.sizeLocked,
      },
    ));
  };

  const begin = (
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: "move" | "resize",
  ): void => {
    if (
      !node
      || pointerSession.current
      || event.isPrimary === false
      || event.button !== 0
      || !actualVisible
      || !positionEnabled
      || (kind === "move" && layout.positionLocked)
      || (kind === "resize" && layout.sizeLocked)
    ) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    bringStudioFloatingSurfaceToFront(stackSurfaceId);
    const start = node.getBoundingClientRect();
    const startRect: StudioFloatingSurfaceRect = {
      x: start.x,
      y: start.y,
      width: start.width,
      height: start.height,
    };
    pointerSession.current = startStudioFloatingSurfacePointerSession({
      kind,
      target: event.currentTarget,
      node,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
      startRect,
      cursor: kind === "move" ? "grabbing" : "se-resize",
      resolveRect(deltaX, deltaY, commit) {
        return kind === "move"
          ? moveStudioFloatingSurfaceRect(
              startRect,
              deltaX,
              deltaY,
              viewport,
              constraints,
              commit,
            )
          : resizeStudioFloatingSurfaceRectFromEdge(
              startRect,
              deltaX,
              deltaY,
              "se",
              viewport,
              constraints,
            );
      },
      onActiveChange(active) {
        if (kind === "move") setDragging(active);
        else setResizing(active);
      },
      onComplete() {
        pointerSession.current = null;
      },
      onCommit(nextRect) {
        commitRect(
          nextRect,
          kind === "move"
            ? resolveStudioFloatingSurfaceDock(nextRect, viewport, 14)
            : layout.dock,
        );
      },
    });
  };

  const moveByKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      resetLayout();
      return;
    }
    const delta = keyboardDelta(event);
    if (!delta || layout.positionLocked) return;
    event.preventDefault();
    event.stopPropagation();
    commitRect(moveStudioFloatingSurfaceRect(
      resolvedRect,
      delta[0],
      delta[1],
      viewport,
      constraints,
      true,
    ));
  };

  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    const delta = keyboardDelta(event);
    if (!delta || layout.sizeLocked) return;
    event.preventDefault();
    event.stopPropagation();
    commitRect(
      resizeStudioFloatingSurfaceRectFromEdge(
        resolvedRect,
        delta[0],
        delta[1],
        "se",
        viewport,
        constraints,
      ),
      layout.dock,
    );
  };

  const arrangementController = useRef({
    arrange: (_mode: "edges" | "cascade", _index: number, _count: number) => undefined,
    setMinimized: (_minimized: boolean) => undefined,
  });
  useLayoutEffect(() => {
    arrangementController.current = {
      arrange(mode, index, count) {
        const width = resolvedRect.width;
        const height = resolvedRect.height;
        const left = viewport.insetLeft ?? 0;
        const top = viewport.insetTop ?? 0;
        const right = viewport.width - (viewport.insetRight ?? 0);
        const bottom = viewport.height - (viewport.insetBottom ?? 0);
        if (mode === "edges") {
          const columns = count > 1 ? 2 : 1;
          const rows = Math.max(1, Math.ceil(count / columns));
          const row = Math.floor(index / columns);
          const slotHeight = Math.max(height, (bottom - top) / rows);
          commitRect({
            x: index % columns === 1 ? Math.max(left, right - width) : left,
            y: Math.min(Math.max(top, top + row * slotHeight), Math.max(top, bottom - height)),
            width,
            height,
          }, "free");
          return;
        }
        const offset = Math.min(index, 8) * 32;
        commitRect({
          x: Math.min(Math.max(left, left + 48 + offset), Math.max(left, right - width)),
          y: Math.min(Math.max(top, top + 48 + offset), Math.max(top, bottom - height)),
          width,
          height,
        }, "free");
      },
      setMinimized() {
        // Compact shell controls own their own collapse state; global minimize must not open/close them.
      },
    };
  });

  useLayoutEffect(() => {
    if (!node || !actualVisible || !positionEnabled) return undefined;
    return registerStudioFloatingSurfaceArrangementController(stackSurfaceId, {
      arrange: (...args) => arrangementController.current.arrange(...args),
      setMinimized: (value) => arrangementController.current.setMinimized(value),
    });
  }, [actualVisible, node, positionEnabled, stackSurfaceId]);

  if (
    typeof document === "undefined"
    || !node
    || !actualVisible
    || !positionEnabled
    || !arranging
    || !screenRect
  ) return null;

  const toolbarTop = screenRect.top >= 48
    ? screenRect.top - 40
    : screenRect.top + 4;
  const toolbarLeft = Math.min(
    Math.max(8, screenRect.left),
    Math.max(8, viewport.width - 360),
  );
  const toolbarStyle: CSSProperties = {
    left: toolbarLeft,
    top: toolbarTop,
    zIndex: 205,
  };
  const resizeStyle: CSSProperties = {
    left: Math.max(0, screenRect.right - 22),
    top: Math.max(0, screenRect.bottom - 22),
    zIndex: 206,
  };
  const actionClass = cn(
    "inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2",
    "text-[0.68rem] font-bold text-fg-2 hover:bg-raised hover:text-fg",
    STUDIO_FOCUS_RING,
  );

  return createPortal(
    <>
      <div
        role="toolbar"
        aria-label={`${definition.label} 배치 편집`}
        data-studio-shell-floating-handle={surfaceId}
        className="pointer-events-auto fixed flex max-w-[min(22rem,calc(100vw-1rem))] items-center gap-1 rounded-lg border border-accent/50 bg-panel/95 p-1 text-fg shadow-2xl backdrop-blur"
        style={toolbarStyle}
      >
        <button
          type="button"
          aria-label={`${definition.label} 이동`}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Home"
          className={cn(
            actionClass,
            "min-w-0 flex-1 cursor-grab touch-none justify-start active:cursor-grabbing",
            dragging && "bg-accent-soft text-accent",
          )}
          onKeyDown={moveByKeyboard}
          onDoubleClick={resetLayout}
          onPointerDown={(event) => begin(event, "move")}
        >
          <GripHorizontal size={14} aria-hidden className="shrink-0" />
          <span className="truncate">{definition.label}</span>
        </button>
        <button
          type="button"
          aria-label={`${definition.label} 기본 위치로 복원`}
          title="기본 위치"
          className={cn(actionClass, "size-8 px-0")}
          onClick={resetLayout}
        >
          <RotateCcw size={14} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`${definition.label} 숨기기`}
          title={forceVisible ? "현재 안전 상태 때문에 숨김 후에도 자동 표시됩니다." : "숨기기"}
          className={cn(actionClass, "size-8 px-0")}
          onClick={() => shell.setVisible(definition.visibilityId, false)}
        >
          <EyeOff size={14} aria-hidden />
        </button>
      </div>
      {definition.resizable ? (
        <button
          type="button"
          aria-label={`${definition.label} 크기 조절`}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
          data-studio-shell-floating-resize={surfaceId}
          className={cn(
            "pointer-events-auto fixed grid size-11 touch-none cursor-se-resize place-items-center rounded-lg border border-accent/50 bg-panel/95 text-accent shadow-xl",
            resizing && "bg-accent-soft",
            STUDIO_FOCUS_RING,
          )}
          style={resizeStyle}
          onKeyDown={resizeByKeyboard}
          onPointerDown={(event) => begin(event, "resize")}
        >
          <Scaling size={16} aria-hidden />
        </button>
      ) : null}
    </>,
    document.body,
  );
}
