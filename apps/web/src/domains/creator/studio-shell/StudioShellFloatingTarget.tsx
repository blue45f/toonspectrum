import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { EyeOff, GripHorizontal, Pin, RotateCcw, Scaling } from "lucide-react";
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
  setStudioFloatingSurfaceDock,
  setStudioFloatingSurfaceLock,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceDock,
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
const DOCK_OPTIONS: readonly { readonly value: StudioFloatingSurfaceDock; readonly label: string }[] = [
  { value: "free", label: "자유" },
  { value: "left", label: "왼쪽" },
  { value: "right", label: "오른쪽" },
  { value: "top", label: "위쪽" },
  { value: "bottom", label: "아래쪽" },
];
const DOCK_LABELS: Readonly<Record<StudioFloatingSurfaceDock, string>> = {
  free: "자유 배치",
  left: "왼쪽",
  right: "오른쪽",
  top: "위쪽",
  bottom: "아래쪽",
};
const MANAGED_STYLE_PROPERTIES = [
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "transform",
  "translate",
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

function numericDatasetValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readViewport(
  definition: ReturnType<typeof studioShellFloatingSurfaceById>,
  node: HTMLElement | null = null,
): StudioFloatingSurfaceViewport {
  const visual = typeof window === "undefined" ? null : window.visualViewport;
  const offsetLeft = visual?.offsetLeft ?? 0;
  const offsetTop = visual?.offsetTop ?? 0;
  const authoredDockLeft = definition.id === "drawing-options"
    ? numericDatasetValue(node?.dataset.studioDrawOptionsDockLeft)
    : null;
  const authoredDockRight = definition.id === "drawing-options"
    ? numericDatasetValue(node?.dataset.studioDrawOptionsDockRight)
    : null;
  return {
    width: offsetLeft + (visual?.width ?? globalThis.innerWidth ?? 1),
    height: offsetTop + (visual?.height ?? globalThis.innerHeight ?? 1),
    insetTop: offsetTop + definition.insetTop,
    insetRight: authoredDockRight === null
      ? definition.insetRight
      : authoredDockRight + definition.insetRight,
    insetBottom: definition.insetBottom,
    insetLeft: offsetLeft + (authoredDockLeft === null
      ? definition.insetLeft
      : authoredDockLeft + definition.insetLeft),
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
  drawingAutoHidden: boolean,
): void {
  node.setAttribute("data-studio-shell-layout-hidden", visible ? "false" : "true");
  node.setAttribute("data-studio-shell-layout-managed", "true");
  node.setAttribute("data-studio-shell-layout-surface", surfaceId);
  node.setAttribute(
    "data-studio-shell-drawing-auto-hidden",
    drawingAutoHidden ? "true" : "false",
  );
}

function styleRect(node: HTMLElement, rect: StudioFloatingSurfaceRect, applySize: boolean): void {
  node.style.setProperty("position", "fixed");
  node.style.setProperty("left", `${Math.round(rect.x)}px`);
  node.style.setProperty("top", `${Math.round(rect.y)}px`);
  node.style.setProperty("right", "auto");
  node.style.setProperty("bottom", "auto");
  node.style.setProperty("transform", "none");
  node.style.setProperty("translate", "none");
  if (applySize) {
    node.style.setProperty("width", `${Math.round(rect.width)}px`);
    node.style.setProperty("height", `${Math.round(rect.height)}px`);
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
  const { setSurfaceMounted } = shell;
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
  const dockGuide = useRef<HTMLDivElement | null>(null);
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
  const managedVisible = preferredVisible || forceVisible;
  const drawingAutoHidden = preferredVisible
    && !forceVisible
    && shell.autoHideWhileDrawing
    && shell.drawingAutoHideActive
    && definition.hideWhileDrawing !== false;
  const actualVisible = managedVisible && !drawingAutoHidden;
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

  useEffect(() => {
    setSurfaceMounted(surfaceId, node !== null);
    if (!node) return undefined;
    return () => setSurfaceMounted(surfaceId, false);
  }, [node, setSurfaceMounted, surfaceId]);

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
      node.removeAttribute("data-studio-shell-drawing-auto-hidden");
      originalStyle.current = null;
    };
  }, [node]);

  useLayoutEffect(() => {
    if (!node) return;
    setManagedAttributes(node, surfaceId, managedVisible, drawingAutoHidden);
  }, [drawingAutoHidden, managedVisible, node, surfaceId]);

  useLayoutEffect(() => {
    if (!node) return undefined;
    const update = (): void => {
      setViewport(readViewport(definition, node));
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
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [definition, node]);

  useEffect(() => {
    const update = (): void => setViewport(readViewport(definition, node));
    globalThis.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      globalThis.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [definition, node]);

  useLayoutEffect(() => {
    if (!node || !managedVisible || !positionEnabled) {
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
    definition.applySize,
    definition.zIndexFloor,
    managedVisible,
    node,
    positionEnabled,
    resolvedRect,
    stackSurfaceId,
  ]);

  useLayoutEffect(() => {
    if (!node || !managedVisible || !positionEnabled) return undefined;
    return registerStudioFloatingSurface(stackSurfaceId);
  }, [managedVisible, node, positionEnabled, stackSurfaceId]);

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

  const toggleLock = (kind: "position" | "size"): void => {
    const locked = kind === "position"
      ? layout.positionLocked
      : layout.sizeLocked;
    setLayout(setStudioFloatingSurfaceLock(layout, kind, !locked));
  };

  const hideDockGuide = (): void => {
    const guide = dockGuide.current;
    if (!guide) return;
    guide.style.display = "none";
    guide.textContent = "";
  };

  const previewDockGuide = (nextRect: StudioFloatingSurfaceRect): void => {
    const guide = dockGuide.current;
    if (!guide) return;
    const dock = resolveStudioFloatingSurfaceDock(nextRect, viewport, 14);
    if (dock === "free") {
      hideDockGuide();
      return;
    }
    const guideRect = resolveStudioFloatingSurfaceRect(
      createStudioFloatingSurfaceLayout(nextRect, viewport, constraints, {
        dock,
        positionLocked: layout.positionLocked,
        sizeLocked: layout.sizeLocked,
      }),
      viewport,
      constraints,
      definition.defaultLayout,
    );
    Object.assign(guide.style, {
      display: "grid",
      left: `${Math.round(guideRect.x)}px`,
      top: `${Math.round(guideRect.y)}px`,
      width: `${Math.round(guideRect.width)}px`,
      height: `${Math.round(guideRect.height)}px`,
    });
    guide.textContent = `${DOCK_LABELS[dock]}에 도킹`;
  };

  const setDock = (dock: StudioFloatingSurfaceDock): void => {
    hideDockGuide();
    setLayout(setStudioFloatingSurfaceDock(layout, dock));
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
    hideDockGuide();
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
        const next = kind === "move"
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
        if (kind === "move") previewDockGuide(next);
        return next;
      },
      onActiveChange(active) {
        if (kind === "move") setDragging(active);
        else setResizing(active);
      },
      onComplete() {
        pointerSession.current = null;
        hideDockGuide();
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
    if (!node || !managedVisible || !positionEnabled) return undefined;
    return registerStudioFloatingSurfaceArrangementController(stackSurfaceId, {
      arrange: (...args) => arrangementController.current.arrange(...args),
      setMinimized: (value) => arrangementController.current.setMinimized(value),
    });
  }, [managedVisible, node, positionEnabled, stackSurfaceId]);

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
    zIndex: 119,
  };
  const resizeStyle: CSSProperties = {
    left: Math.max(0, screenRect.right - 22),
    top: Math.max(0, screenRect.bottom - 22),
    zIndex: 119,
  };
  const actionClass = cn(
    "inline-flex min-h-8 items-center justify-center gap-1 rounded-md px-2",
    "text-[0.68rem] font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45",
    STUDIO_FOCUS_RING,
  );

  return createPortal(
    <>
      <div
        ref={dockGuide}
        aria-hidden="true"
        data-studio-shell-floating-dock-guide={surfaceId}
        className="pointer-events-none fixed place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/20 px-3 text-xs font-black text-accent shadow-xl backdrop-blur-sm"
        style={{ display: "none", zIndex: 119 }}
      />
      <div
        role="toolbar"
        aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "{v0} 배치 편집"), { v0: String(definition.label) })}
        data-studio-shell-floating-handle={surfaceId}
        className="pointer-events-auto fixed flex max-w-[min(22rem,calc(100vw-1rem))] items-center gap-1 rounded-lg border border-accent/50 bg-panel/95 p-1 text-fg shadow-2xl backdrop-blur"
        style={toolbarStyle}
      >
        <button
          type="button"
          aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "{v0} 이동"), { v0: String(definition.label) })}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Home"
          disabled={layout.positionLocked}
          title={layout.positionLocked ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "위치 잠금을 해제한 뒤 이동할 수 있어요.") : translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "끌어서 이동 · 방향키로 미세 조정")}
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
        <select
          value={layout.dock}
          aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "{v0} 도킹 위치"), { v0: String(definition.label) })}
          title={translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "화면 가장자리에 도킹")}
          disabled={layout.positionLocked}
          className={cn(
            "h-8 max-w-20 rounded-md border border-line bg-card px-1 text-[0.65rem] font-bold text-fg-2",
            STUDIO_FOCUS_RING,
          )}
          onChange={(event) => setDock(event.target.value as StudioFloatingSurfaceDock)}
        >
          {DOCK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={layout.positionLocked}
          aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "{v0} 위치 {v1}"), { v0: String(definition.label), v1: String(layout.positionLocked ? "잠금 해제" : "잠금") })}
          title={layout.positionLocked ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "위치 잠금 해제") : translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "위치 잠금")}
          className={cn(
            actionClass,
            "size-8 px-0",
            layout.positionLocked && "bg-accent-soft text-accent",
          )}
          onClick={() => toggleLock("position")}
        >
          <Pin size={14} aria-hidden />
        </button>
        {definition.resizable ? (
          <button
            type="button"
            aria-pressed={layout.sizeLocked}
            aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "{v0} 크기 {v1}"), { v0: String(definition.label), v1: String(layout.sizeLocked ? "잠금 해제" : "잠금") })}
            title={layout.sizeLocked ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "크기 잠금 해제") : translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "크기 잠금")}
            className={cn(
              actionClass,
              "size-8 px-0",
              layout.sizeLocked && "bg-accent-soft text-accent",
            )}
            onClick={() => toggleLock("size")}
          >
            <Scaling size={14} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "{v0} 기본 위치로 복원"), { v0: String(definition.label) })}
          title={translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "기본 위치")}
          className={cn(actionClass, "size-8 px-0")}
          onClick={resetLayout}
        >
          <RotateCcw size={14} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "{v0} 숨기기"), { v0: String(definition.label) })}
          title={forceVisible ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "현재 안전 상태 때문에 숨김 후에도 자동 표시됩니다.") : translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "숨기기")}
          className={cn(actionClass, "size-8 px-0")}
          onClick={() => shell.setVisible(definition.visibilityId, false)}
        >
          <EyeOff size={14} aria-hidden />
        </button>
      </div>
      {definition.resizable ? (
        <button
          type="button"
          aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "{v0} 크기 조절"), { v0: String(definition.label) })}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
          disabled={layout.sizeLocked}
          title={layout.sizeLocked ? translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "크기 잠금을 해제한 뒤 조절할 수 있어요.") : translateCurrentStaticSourceText("domains.creator.studio.shell.StudioShellFloatingTarget", "ko", "끌어서 크기 조절 · 방향키로 미세 조정")}
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
