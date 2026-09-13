import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripHorizontal, MoreHorizontal, PanelLeftClose, Pin, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

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

const DEFAULT_LAYOUT: StudioFloatingSurfaceLayout = {
  version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION, xRatio: 0.15, yRatio: 0.12,
  width: 440, height: 600, dock: "free", positionLocked: false, sizeLocked: false,
};
const DOCKS: readonly [StudioFloatingSurfaceDock, string][] = [
  ["free", "자유 배치"], ["left", "왼쪽"], ["right", "오른쪽"], ["top", "위쪽"], ["bottom", "아래쪽"],
];
const RESIZERS: readonly [StudioFloatingSurfaceResizeEdge, string, string][] = [
  ["n", "위쪽", "left-5 right-5 top-0 h-1.5 cursor-n-resize"],
  ["ne", "오른쪽 위", "right-0 top-0 size-4 cursor-ne-resize"],
  ["e", "오른쪽", "bottom-5 right-0 top-5 w-1.5 cursor-e-resize"],
  ["se", "오른쪽 아래", "bottom-0 right-0 size-6 cursor-se-resize"],
  ["s", "아래쪽", "bottom-0 left-5 right-5 h-1.5 cursor-s-resize"],
  ["sw", "왼쪽 아래", "bottom-0 left-0 size-4 cursor-sw-resize"],
  ["w", "왼쪽", "bottom-5 left-0 top-5 w-1.5 cursor-w-resize"],
  ["nw", "왼쪽 위", "left-0 top-0 size-4 cursor-nw-resize"],
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
  const [active, setActive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sessionRef = useRef<StudioFloatingSurfacePointerSession | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const arranging = useSyncExternalStore(subscribeStudioWorkspaceArranging, studioWorkspaceArrangingSnapshot, () => false);
  useSyncExternalStore(subscribeStudioFloatingSurfaceStack, studioFloatingSurfaceStackSnapshot, () => 0);
  // Desktop preferences remain intact while a phone uses the original sheets and dock.
  const floating = available && detached;
  const constraints = { minWidth, minHeight, maxWidth, maxHeight, snapDistance: 12 };
  const rect = resolveStudioFloatingSurfaceRect(layout, viewport, constraints, defaultLayout);
  const choices = DOCKS.filter(([dock]) => dock === "free" || !allowedDockEdges || allowedDockEdges.includes(dock));

  function changeDetached(next: boolean) {
    sessionRef.current?.cancel();
    setDetached(next);
    writeStudioWorkspaceRegionDetached(surfaceId, next);
    setMenuOpen(false);
  }
  function attach() { changeDetached(false); }
  function reset() { attach(); setLayout(normalizeStudioFloatingSurfaceLayout(defaultLayout)); }
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
    sessionRef.current = startStudioFloatingSurfacePointerSession({
      kind: edge ? "resize" : "move", target: event.currentTarget, node: preview,
      pointerId: event.pointerId, pointerType: event.pointerType,
      clientX: event.clientX, clientY: event.clientY, startRect: origin,
      cursor: edge ? `${edge}-resize` : "grabbing",
      resolveRect(dx, dy) {
        return edge
          ? resizeStudioFloatingSurfaceRectFromEdge(origin, dx, dy, edge, viewport, constraints)
          : moveStudioFloatingSurfaceRect(origin, dx, dy, viewport, constraints, false);
      },
      onActiveChange(value) {
        setActive(value);
        if (ghostRef.current) ghostRef.current.style.visibility = value ? "visible" : "hidden";
      },
      onComplete() { sessionRef.current = null; ghostRef.current?.remove(); ghostRef.current = null; },
      onCommit(next) {
        const candidate = edge ? layout.dock : resolveStudioFloatingSurfaceDock(next, viewport, 12);
        commit(next, choices.some(([dock]) => dock === candidate) ? candidate : "free");
      },
    });
  }
  const controllerRef = useRef({ capture: () => ({ detached, layout }), attach, detach: () => changeDetached(true), reset, available,
    restore: (saved: { detached: boolean; layout: StudioFloatingSurfaceLayout }) => { setLayout(normalizeStudioFloatingSurfaceLayout(saved.layout, defaultLayout)); changeDetached(saved.detached); },
  });
  useLayoutEffect(() => {
    controllerRef.current = { capture: () => ({ detached, layout }), attach, detach: () => changeDetached(true), reset, available,
      restore: (saved) => { setLayout(normalizeStudioFloatingSurfaceLayout(saved.layout, defaultLayout)); changeDetached(saved.detached); },
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
  useLayoutEffect(() => () => { sessionRef.current?.cancel(); ghostRef.current?.remove(); }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !menuButtonRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [menuOpen]);
  const buttonClass = cn("inline-flex min-h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-xs text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-40", STUDIO_FOCUS_RING);
  const style: CSSProperties = floating
    ? { position: "fixed", left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: studioFloatingSurfaceZIndex(persistenceId), transform: "translate3d(0,0,0)" }
    : !available ? { display: "contents" } : {};
  return (
    <div ref={rootRef} style={style}
      data-studio-workspace-region={surfaceId}
      data-studio-region-floating={floating ? "true" : "false"}
      data-studio-floating-layout-authority={authority}
      data-dragging={active ? "true" : "false"}
      className={cn("relative min-h-0 min-w-0 shrink-0", !floating && "grid", !floating && className,
        floating && "flex flex-col rounded-xl border border-line-strong bg-panel text-fg shadow-2xl",
        arranging && available && !floating && "outline outline-1 -outline-offset-1 outline-accent/60")}
      onFocusCapture={() => { if (floating) bringStudioFloatingSurfaceToFront(persistenceId); }}
      onPointerDownCapture={() => { if (floating) bringStudioFloatingSurfaceToFront(persistenceId); }}>
      <div hidden={!available || (!floating && !arranging)}
        className={cn("flex h-10 shrink-0 items-center border-b border-line bg-raised text-fg", floating ? "z-10" : "absolute inset-x-0 top-0 z-30 rounded-t-md", (!available || (!floating && !arranging)) && "hidden")}>
        <button type="button" aria-label={`${label} 이동`} disabled={layout.positionLocked}
          title="드래그하여 배치 · Alt+방향키 이동 · Alt+Home 복원"
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Home"
          className={cn(buttonClass, "min-w-0 flex-1 touch-none cursor-grab justify-start overflow-hidden active:cursor-grabbing")}
          onPointerDown={(event) => begin(event)} onKeyDown={(event) => moveKey(event)}>
          {layout.positionLocked ? <Pin size={14} aria-hidden /> : <GripHorizontal size={14} aria-hidden />}
          <span className="truncate">{label}</span>
        </button>
        <button ref={menuButtonRef} type="button" className={buttonClass} aria-label={`${label} 배치 설정`} aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}><MoreHorizontal size={16} aria-hidden /></button>
        {floating && <button type="button" className={buttonClass} aria-label={`${label} 원래 자리로 붙이기`} onClick={attach}><PanelLeftClose size={16} aria-hidden /></button>}
      </div>
      {menuOpen && available && <div ref={menuRef} role="group" aria-label={`${label} 배치 설정 옵션`}
        className="absolute right-0 top-11 z-[70] max-h-[min(28rem,70dvh)] w-64 overflow-y-auto rounded-lg border border-line-strong bg-panel p-2 text-fg shadow-2xl"
        onKeyDownCapture={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); menuButtonRef.current?.focus(); } }}>
        <p className="px-2 py-1 text-xs font-bold">드래그 없이 배치</p>
        <div className="flex flex-wrap gap-1">{choices.map(([dock, name]) => <button type="button" key={dock} className={buttonClass} disabled={layout.positionLocked}
          onClick={() => { setLayout({ ...layout, dock }); changeDetached(true); }}>{name}</button>)}</div>
        <div className="my-1 flex justify-center gap-1">{([
          [-10, 0, "왼쪽으로 이동", ArrowLeft], [0, -10, "위로 이동", ArrowUp],
          [0, 10, "아래로 이동", ArrowDown], [10, 0, "오른쪽으로 이동", ArrowRight],
        ] as const).map(([dx, dy, name, Icon]) => <button key={name} type="button" className={buttonClass} aria-label={`${label} ${name}`} disabled={layout.positionLocked} onClick={() => move(dx, dy)}><Icon size={15} aria-hidden /></button>)}</div>
        <button type="button" className={cn(buttonClass, "w-full justify-start")} aria-pressed={layout.positionLocked}
          onClick={() => setLayout({ ...layout, positionLocked: !layout.positionLocked })}><Pin size={14} aria-hidden />위치 잠금 {layout.positionLocked ? "켬" : "끔"}</button>
        <button type="button" className={cn(buttonClass, "w-full justify-start")} aria-pressed={layout.sizeLocked}
          onClick={() => setLayout({ ...layout, sizeLocked: !layout.sizeLocked })}>크기 잠금 {layout.sizeLocked ? "켬" : "끔"}</button>
        <button type="button" className={cn(buttonClass, "w-full justify-start")} onClick={attach}><PanelLeftClose size={14} aria-hidden />원래 자리로 붙이기</button>
        <button type="button" className={cn(buttonClass, "w-full justify-start")} onClick={reset}><RotateCcw size={14} aria-hidden />위치·크기·잠금 초기화</button>
        <p className="px-2 py-1 text-[0.65rem] text-fg-3">{authority === "sqlite-opfs" ? "이 기기에 배치가 저장됩니다." : "현재 탭에서 배치를 유지합니다."}</p>
      </div>}
      <div className={floating
        ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-auto [&>[data-studio-sheet-id]]:!h-full [&>[data-studio-sheet-id]]:!w-full [&>[data-studio-sheet-id]]:!min-w-0 [&>[data-studio-sheet-id]]:!max-h-none [&_button[title='자유_배치_창으로_분리']]:hidden"
        : "contents"}>{children}</div>
      {floating && RESIZERS.map(([edge, name, position]) => <button key={edge} type="button"
        className={cn("absolute z-20 touch-none border-0 bg-transparent p-0 disabled:cursor-not-allowed", position, STUDIO_FOCUS_RING,
          edge === "se" && "after:absolute after:bottom-1 after:right-1 after:size-2 after:border-b-2 after:border-r-2 after:border-fg-3")}
        aria-label={`${label} ${name} 크기 조절`} disabled={layout.sizeLocked}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
        onPointerDown={(event) => begin(event, edge)} onKeyDown={(event) => moveKey(event, edge)} />)}
    </div>
  );
}
