import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import {
  createStudioFloatingSurfaceLayout, moveStudioFloatingSurfaceRect,
  normalizeStudioFloatingSurfaceLayout, resizeStudioFloatingSurfaceRectFromEdge,
  resolveStudioFloatingSurfaceDock, resolveStudioFloatingSurfaceRect,
  STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  type StudioFloatingSurfaceDock, type StudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceRect, type StudioFloatingSurfaceResizeEdge,
} from "./studio-floating-surface";
import { startStudioFloatingSurfacePointerSession, type StudioFloatingSurfacePointerSession } from "./studio-floating-surface-pointer";
import { bringStudioFloatingSurfaceToFront, registerStudioFloatingSurface, studioFloatingSurfaceStackSnapshot, studioFloatingSurfaceZIndex, subscribeStudioFloatingSurfaceLayoutReset, subscribeStudioFloatingSurfaceStack } from "./studio-floating-surface-stack";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { readStudioWorkspaceRegionDetached, registerStudioWorkspaceRegion, studioWorkspaceArrangingSnapshot, subscribeStudioWorkspaceArranging, writeStudioWorkspaceRegionDetached } from "./studio-workspace-arrangement";
import { useStudioFloatingSurfaceLayout } from "./use-studio-floating-surface-layout";

import { cn } from "@/shared/lib/utils";

import type { StudioWorkspaceRegionChromeProps } from "./StudioWorkspaceRegionChrome";
import type { StudioWorkspaceRegionMenuProps } from "./StudioWorkspaceRegionMenu";

const DEFAULT_LAYOUT: StudioFloatingSurfaceLayout = {
  version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION, xRatio: 0.15, yRatio: 0.12,
  width: 440, height: 600, dock: "free", positionLocked: false, sizeLocked: false,
};
const DOCKS: readonly [StudioFloatingSurfaceDock, string][] = [
  ["free", "자유 배치"], ["left", "왼쪽"], ["right", "오른쪽"], ["top", "위쪽"], ["bottom", "아래쪽"],
];
function viewportNow(insetTop: number) {
  const visual = typeof window === "undefined" ? null : window.visualViewport;
  return {
    width: (visual?.offsetLeft ?? 0) + (visual?.width ?? globalThis.innerWidth ?? 1),
    height: (visual?.offsetTop ?? 0) + (visual?.height ?? globalThis.innerHeight ?? 1),
    insetTop: (visual?.offsetTop ?? 0) + insetTop, insetRight: 12, insetBottom: 12,
    insetLeft: (visual?.offsetLeft ?? 0) + 12,
  };
}
export interface StudioWorkspaceRegionProps {
  readonly surfaceId: string;
  readonly label: string;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly defaultLayout?: StudioFloatingSurfaceLayout;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly insetTop?: number;
  readonly className?: string;
  readonly allowedDockEdges?: readonly StudioFloatingSurfaceDock[];
}

/**
 * A stable DOM owner for authored Studio chrome. Attaching, dragging and resizing never portals or
 * remounts the child subtree. An attached drag previews a lightweight outline; only a completed
 * gesture changes layout. The drawing canvas and document history are intentionally not touched.
 */
export function StudioWorkspaceRegion({
  surfaceId, label, children, disabled = false, defaultLayout = DEFAULT_LAYOUT,
  minWidth = 280, minHeight = 180, maxWidth = 1600, maxHeight = 1200,
  insetTop = 76, className, allowedDockEdges,
}: StudioWorkspaceRegionProps) {
  const persistenceId = `arrange:${surfaceId}`;
  const [viewport, setViewport] = useState(() => viewportNow(insetTop));
  const available = !disabled && viewport.width >= 1024;
  const { layout, setLayout, authority } = useStudioFloatingSurfaceLayout({
    surfaceId: persistenceId, defaultLayout, enabled: available,
  });
  const [detached, setDetached] = useState(() => readStudioWorkspaceRegionDetached(surfaceId));
  const [menuOpen, setMenuOpen] = useState(false);
  const [Menu, setMenu] = useState<ComponentType<StudioWorkspaceRegionMenuProps> | null>(null);
  const [menuFailed, setMenuFailed] = useState(false);
  const [menuAttempt, setMenuAttempt] = useState(0);
  useEffect(() => {
    if (!menuOpen || Menu) return;
    let cancelled = false;
    setMenuFailed(false);
    void import("./StudioWorkspaceRegionMenu").then(module => {
      if (!cancelled) setMenu(() => module.StudioWorkspaceRegionMenu);
    }).catch(() => { if (!cancelled) setMenuFailed(true); });
    return () => { cancelled = true; };
  }, [menuOpen, Menu, menuAttempt]);
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sessionRef = useRef<StudioFloatingSurfacePointerSession | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const arranging = useSyncExternalStore(subscribeStudioWorkspaceArranging, studioWorkspaceArrangingSnapshot, () => false);
  useSyncExternalStore(subscribeStudioFloatingSurfaceStack, studioFloatingSurfaceStackSnapshot, () => 0);
  // Desktop preferences remain intact while a phone uses the original sheets and dock.
  const floating = available && detached;
  const showChrome = available && (floating || arranging);
  const [Chrome, setChrome] = useState<ComponentType<StudioWorkspaceRegionChromeProps> | null>(null);
  const [chromeFailed, setChromeFailed] = useState(false);
  const [chromeAttempt, setChromeAttempt] = useState(0);
  useEffect(() => {
    if (!showChrome || Chrome) return;
    let cancelled = false;
    setChromeFailed(false);
    void import("./StudioWorkspaceRegionChrome").then(module => {
      if (!cancelled) setChrome(() => module.StudioWorkspaceRegionChrome);
    }).catch(() => { if (!cancelled) setChromeFailed(true); });
    return () => { cancelled = true; };
  }, [showChrome, Chrome, chromeAttempt]);
  const constraints = { minWidth, minHeight, maxWidth, maxHeight, snapDistance: 12 };
  const rect = resolveStudioFloatingSurfaceRect(layout, viewport, constraints, defaultLayout);
  const choices = DOCKS.filter(([dock]) => dock === "free" || !allowedDockEdges || allowedDockEdges.includes(dock));

  function changeDetached(next: boolean) {
    // Closing a placement menu must leave focus on a visible control.
    if (menuOpen) {
      const target = next || arranging ? menuButtonRef.current
        : document.querySelector<HTMLButtonElement>("[data-studio-workspace-arrangement] button");
      target?.focus({ preventScroll: true });
    }
    sessionRef.current?.cancel();
    setDetached(next);
    writeStudioWorkspaceRegionDetached(surfaceId, next);
    setMenuOpen(false);
  }
  function attach() { changeDetached(false); }
  function reset() { attach(); setCollapsed(false); setLayout(normalizeStudioFloatingSurfaceLayout(defaultLayout)); }
  function commit(next: StudioFloatingSurfaceRect, dock: StudioFloatingSurfaceDock = "free") {
    setLayout(createStudioFloatingSurfaceLayout(next, viewport, constraints, {
      dock, positionLocked: layout.positionLocked, sizeLocked: layout.sizeLocked,
    }));
    sessionRef.current?.cancel();
    setDetached(true);
    writeStudioWorkspaceRegionDetached(surfaceId, true);
  }
  function startRect(): StudioFloatingSurfaceRect {
    if (floating) return rect;
    const bounds = rootRef.current?.getBoundingClientRect();
    return bounds && bounds.width > 0 && bounds.height > 0
      ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      : rect;
  }
  function move(dx: number, dy: number) {
    if (layout.positionLocked) return;
    commit(moveStudioFloatingSurfaceRect(startRect(), dx, dy, viewport, constraints, false));
  }
  function moveKey(event: KeyboardEvent<HTMLButtonElement>, edge?: StudioFloatingSurfaceResizeEdge) {
    if (!event.altKey) return;
    if (event.key === "Home") { event.preventDefault(); event.stopPropagation(); reset(); return; }
    const step = event.shiftKey ? 40 : 10;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const value = delta[event.key];
    if (!value) return;
    event.preventDefault(); event.stopPropagation();
    if (edge) {
      if (!layout.sizeLocked) commit(resizeStudioFloatingSurfaceRectFromEdge(rect, ...value, edge, viewport, constraints), layout.dock);
    } else move(...value);
  }
  function begin(event: PointerEvent<HTMLButtonElement>, edge?: StudioFloatingSurfaceResizeEdge) {
    if (!available || sessionRef.current || event.isPrimary === false || event.button !== 0
      || (edge ? layout.sizeLocked : layout.positionLocked)) return;
    const root = rootRef.current;
    if (!root) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    setMenuOpen(false);
    const origin = startRect();
    let preview = root;
    if (!floating) {
      preview = document.createElement("div");
      preview.setAttribute("aria-hidden", "true");
      preview.dataset.studioArrangementPreview = surfaceId;
      preview.textContent = `${label} · 놓아서 자유 배치`;
      preview.className = "pointer-events-none fixed rounded-xl border-2 border-accent bg-panel/90 p-3 text-xs font-semibold text-fg shadow-2xl";
      Object.assign(preview.style, { left: `${origin.x}px`, top: `${origin.y}px`, width: `${origin.width}px`, height: `${origin.height}px`, zIndex: "69", visibility: "hidden" });
      document.body.appendChild(preview);
      ghostRef.current = preview;
    }
    if (floating) bringStudioFloatingSurfaceToFront(persistenceId);
    const guide = document.createElement("div");
    guide.setAttribute("aria-hidden", "true");
    guide.dataset.studioDockGuide = surfaceId;
    guide.className = "pointer-events-none fixed z-[69] rounded-lg border-2 border-dashed border-accent bg-accent/10 p-2 text-xs font-bold text-accent";
    guide.style.display = "none";
    document.body.appendChild(guide);
    guideRef.current = guide;
    sessionRef.current = startStudioFloatingSurfacePointerSession({
      kind: edge ? "resize" : "move", target: event.currentTarget, node: preview,
      pointerId: event.pointerId, pointerType: event.pointerType,
      clientX: event.clientX, clientY: event.clientY, startRect: origin,
      cursor: edge ? `${edge}-resize` : "grabbing",
      resolveRect(dx, dy) {
        const next = edge
          ? resizeStudioFloatingSurfaceRectFromEdge(origin, dx, dy, edge, viewport, constraints)
          : moveStudioFloatingSurfaceRect(origin, dx, dy, viewport, constraints, false);
        const dock = resolveStudioFloatingSurfaceDock(next, viewport, 12);
        const choice = !edge && dock !== "free" ? choices.find(([value]) => value === dock) : undefined;
        guide.style.display = choice ? "block" : "none";
        if (choice) {
          const target = resolveStudioFloatingSurfaceRect(createStudioFloatingSurfaceLayout(next, viewport, constraints, { dock }), viewport, constraints);
          Object.assign(guide.style, { left: `${target.x}px`, top: `${target.y}px`, width: `${target.width}px`, height: `${target.height}px` });
          guide.textContent = `${choice[1]}에 놓기`;
        }
        return next;
      },
      onActiveChange(value) {
        setActive(value);
        if (ghostRef.current) ghostRef.current.style.visibility = value ? "visible" : "hidden";
      },
      onComplete() {
        sessionRef.current = null;
        ghostRef.current?.remove(); ghostRef.current = null;
        guideRef.current?.remove(); guideRef.current = null;
        // Do not anchor nested fixed tool popovers to an idle transformed panel.
        root.style.transform = "";
        if (floating && collapsed) root.style.height = `${rect.width < 220 ? 80 : 40}px`;
      },
      onCommit(next) {
        const candidate = edge ? layout.dock : resolveStudioFloatingSurfaceDock(next, viewport, 12);
        commit(next, choices.some(([dock]) => dock === candidate) ? candidate : "free");
      },
    });
  }
  const controllerRef = useRef({ capture: () => ({ detached, layout, collapsed }), attach, detach: () => changeDetached(true), reset, available,
    restore: (saved: { detached: boolean; layout: StudioFloatingSurfaceLayout; collapsed?: boolean }) => { setLayout(normalizeStudioFloatingSurfaceLayout(saved.layout, defaultLayout)); setCollapsed(saved.collapsed ?? false); changeDetached(saved.detached); },
  });
  useLayoutEffect(() => {
    controllerRef.current = { capture: () => ({ detached, layout, collapsed }), attach, detach: () => changeDetached(true), reset, available,
      restore: (saved) => { setLayout(normalizeStudioFloatingSurfaceLayout(saved.layout, defaultLayout)); setCollapsed(saved.collapsed ?? false); changeDetached(saved.detached); },
    };
  });
  useEffect(() => registerStudioWorkspaceRegion(surfaceId, {
    capture: () => controllerRef.current.capture(),
    restore: (saved) => controllerRef.current.restore(saved),
    attach: () => controllerRef.current.attach(),
    detach: () => { if (controllerRef.current.available) controllerRef.current.detach(); },
  }), [surfaceId]);
  useEffect(() => subscribeStudioFloatingSurfaceLayoutReset(() => controllerRef.current.reset()), []);
  useLayoutEffect(() => floating ? registerStudioFloatingSurface(persistenceId) : undefined, [floating, persistenceId]);
  useEffect(() => {
    const sync = () => { sessionRef.current?.cancel(); setViewport(viewportNow(insetTop)); };
    globalThis.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    return () => {
      globalThis.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, [insetTop]);
  useEffect(() => { if (!available) { sessionRef.current?.cancel(); setMenuOpen(false); } }, [available]);
  useLayoutEffect(() => () => { sessionRef.current?.cancel(); ghostRef.current?.remove(); guideRef.current?.remove(); }, []);
  const buttonClass = cn("inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-xs text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-40", STUDIO_FOCUS_RING);
  const compact = floating && rect.width < 220;
  const folded = floating && collapsed;
  const style: CSSProperties = floating
    ? { position: "fixed", left: rect.x, top: rect.y, width: rect.width, height: folded ? (compact ? 80 : 40) : rect.height, zIndex: studioFloatingSurfaceZIndex(persistenceId) }
    : !available ? { display: "contents" } : {};
  return (
    <div ref={rootRef} style={style}
      data-studio-workspace-region={surfaceId}
      data-studio-region-floating={floating ? "true" : "false"}
      data-studio-region-collapsed={folded ? "true" : "false"}
      data-studio-floating-layout-authority={authority}
      data-dragging={active ? "true" : "false"}
      className={cn("relative min-h-0 min-w-0 shrink-0", !floating && "grid", !floating && className,
        floating && "flex flex-col rounded-xl border border-line-strong bg-panel text-fg shadow-2xl",
        arranging && available && !floating && "outline outline-1 -outline-offset-1 outline-accent/60")}
      onFocusCapture={() => { if (floating) bringStudioFloatingSurfaceToFront(persistenceId); }}
      onPointerDownCapture={() => { if (floating) bringStudioFloatingSurfaceToFront(persistenceId); }}>
      {showChrome && (Chrome ? <Chrome label={label} buttonClass={buttonClass} floating={floating} compact={compact} folded={folded}
        positionLocked={layout.positionLocked} sizeLocked={layout.sizeLocked} menuOpen={menuOpen} menuButtonRef={menuButtonRef}
        onBegin={begin} onMoveKey={moveKey} onAttach={attach}
        onToggleCollapsed={() => { sessionRef.current?.cancel(); setCollapsed(value => !value); }}
        onToggleMenu={() => setMenuOpen(value => !value)} />
        : <div role="status" className={cn("shrink-0 bg-raised px-2 py-1 text-xs text-fg-2", compact ? "h-20" : "h-10")}>
          {chromeFailed ? <button type="button" className={buttonClass} onClick={() => setChromeAttempt(value => value + 1)}>패널 도구 다시 불러오기</button> : "패널 도구 여는 중…"}
        </div>)}
      {menuOpen && available && (Menu ? <Menu label={label} buttonClass={buttonClass} choices={choices} layout={layout} setLayout={setLayout}
        changeDetached={changeDetached} move={move} minWidth={minWidth} maxWidth={maxWidth} minHeight={minHeight} maxHeight={maxHeight}
        viewport={viewport} insetTop={insetTop} rect={rect} floating={floating} compact={compact} menuButtonRef={menuButtonRef}
        onClose={() => setMenuOpen(false)} onResize={(width, height) => { setCollapsed(false); commit({ ...rect, width, height }, layout.dock); }}
        attach={attach} reset={reset} authority={authority} /> : <div role="group" className="absolute right-0 top-11 z-[70] rounded-lg border border-line bg-panel p-2 text-xs text-fg shadow-xl"
          onKeyDownCapture={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); menuButtonRef.current?.focus(); } }}>
          {menuFailed ? <>설정을 불러오지 못했어요. <button type="button" className={buttonClass} onClick={() => setMenuAttempt(value => value + 1)}>다시 시도</button></> : "배치 설정 여는 중…"}
        </div>)}
      <div hidden={folded} inert={folded} style={folded ? { display: "none" } : undefined} className={floating
        ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-auto [&>[data-studio-sheet-id]]:!h-full [&>[data-studio-sheet-id]]:!w-full [&>[data-studio-sheet-id]]:!min-w-0 [&>[data-studio-sheet-id]]:!max-h-none [&_button[title='자유_배치_창으로_분리']]:hidden"
        : "contents"}>{children}</div>

    </div>
  );
}
