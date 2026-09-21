import { useLayoutEffect, useState, type RefObject } from "react";
import { studioStrokeFocusActivitySnapshot, subscribeStudioStrokeFocusActivity } from "../studio-stroke-focus-activity";

export function resolveStudioBrushDockPresentation(width: number, rail: number, inspector: number, brush: number) {
  return width - rail - inspector - brush < 480 ? "overlay" : "docked";
}

/** Resize changes presentation only; active pointer and text gestures defer reflow. */
export function useStudioBrushDockLayout(ref: RefObject<HTMLElement | null>, width: number) {
  const [layout, setLayout] = useState({ overlay: false, left: 56 });
  useLayoutEffect(() => {
    const root = ref.current?.closest<HTMLElement>('[data-studio-editor="true"]');
    if (!root) return;
    let frame = 0;
    let composing = false;
    const pointers = new Set<number>();
    const measure = () => {
      if (pointers.size || composing || studioStrokeFocusActivitySnapshot() !== "idle") return;
      const workspace = ref.current?.closest<HTMLElement>("#studio-workspace") ?? root;
      const railRect = root.querySelector<HTMLElement>('[data-studio-tool-rail]')?.getBoundingClientRect();
      const rail = railRect ? Math.max(0, railRect.right - workspace.getBoundingClientRect().left) : 56;
      const inspector = root.querySelector<HTMLElement>('#studio-inspector')?.getBoundingClientRect().width ?? 320;
      const splitterWidth = Array.from(root.querySelectorAll<HTMLElement>("[data-studio-panel-resizer]")).reduce((sum, node) => {
        const rect = node.getBoundingClientRect();
        return sum + (rect.left >= (railRect?.right ?? rail) ? rect.width : 0);
      }, 0);
      const size = root.getBoundingClientRect().width || globalThis.innerWidth;
      const overlay = resolveStudioBrushDockPresentation(size, rail, inspector + splitterWidth, width) === "overlay";
      setLayout((current) => current.overlay === overlay && current.left === rail ? current : { overlay, left: rail });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const down = (event: PointerEvent) => { if (event.target instanceof Node && root.contains(event.target)) pointers.add(event.pointerId); };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); schedule(); };
    const start = () => { composing = true; };
    const end = () => { composing = false; schedule(); };
    const release = () => { pointers.clear(); composing = false; schedule(); };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(root);
    for (const panel of root.querySelectorAll("#studio-inspector, [data-studio-tool-rail]")) observer?.observe(panel);
    const unsubscribe = subscribeStudioStrokeFocusActivity(schedule);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("compositionstart", start, true);
    document.addEventListener("compositionend", end, true);
    globalThis.addEventListener("resize", schedule);
    globalThis.addEventListener("blur", release);
    measure();
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect(); unsubscribe();
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("compositionstart", start, true);
      document.removeEventListener("compositionend", end, true);
      globalThis.removeEventListener("resize", schedule);
      globalThis.removeEventListener("blur", release);
    };
  }, [ref, width]);
  useLayoutEffect(() => {
    const workspace = ref.current?.closest<HTMLElement>("#studio-workspace");
    if (!workspace) return;
    const name = "--studio-brush-overlay-width";
    const previous = workspace.style.getPropertyValue(name);
    workspace.style.setProperty(name, layout.overlay ? `${width}px` : "0px");
    return () => {
      if (previous) workspace.style.setProperty(name, previous);
      else workspace.style.removeProperty(name);
    };
  }, [layout.overlay, ref, width]);
  return layout;
}
