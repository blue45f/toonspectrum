import { useLayoutEffect, type RefObject } from "react";

/** Measured chrome geometry only. Never writes authored workspace preferences. */
export function useStudioMobileDockMetrics(
  enabled: boolean,
  dockRef: RefObject<HTMLElement | null>,
  drawSheetRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!enabled || !dock) return;
    const editor = dock.closest<HTMLElement>('[data-studio-editor="true"]');
    const owners = [...new Set([dock.ownerDocument.documentElement, ...(editor ? [editor] : [])])];
    const key = "--studio-mobile-dock-measured-height";
    const previous = owners.map((element) => ({ element, value: element.style.getPropertyValue(key) }));
    const sheet = drawSheetRef.current;
    const header = sheet?.querySelector<HTMLElement>('[data-studio-mobile-draw-header="true"]');
    const headerKey = "--studio-mobile-draw-header-height";
    const previousHeader = sheet?.style.getPropertyValue(headerKey) ?? "";
    const sheetKey = "--studio-mobile-active-draw-height";
    const previousSheet = owners.map((element) => ({ element, value: element.style.getPropertyValue(sheetKey) }));
    let lastSheet = "";
    let last = "";
    let lastHeader = "";
    let frame = 0;
    const measure = () => {
      const height = Math.ceil(dock.getBoundingClientRect().height);
      if (height > 0) {
        last = `${height + 8}px`;
        for (const element of owners) element.style.setProperty(key, last);
      }
      const headerHeight = Math.ceil(header?.getBoundingClientRect().height ?? 0);
      if (sheet && headerHeight > 0) { lastHeader = `${headerHeight}px`; sheet.style.setProperty(headerKey, lastHeader); }
      lastSheet = sheet && sheet.getAttribute("aria-hidden") !== "true" ? `${Math.ceil(sheet.getBoundingClientRect().height)}px` : "0px";
      for (const element of owners) element.style.setProperty(sheetKey, lastSheet);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(dock); if (header) observer?.observe(header); if (sheet) observer?.observe(sheet);
    const visibility = new MutationObserver(schedule);
    if (sheet) visibility.observe(sheet, { attributes: true, attributeFilter: ["aria-hidden"] });
    globalThis.addEventListener("resize", schedule);
    globalThis.visualViewport?.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame); observer?.disconnect(); visibility.disconnect();
      globalThis.removeEventListener("resize", schedule);
      globalThis.visualViewport?.removeEventListener("resize", schedule);
      for (const { element, value } of previous) {
        if (element.style.getPropertyValue(key) !== last) continue;
        if (value) element.style.setProperty(key, value); else element.style.removeProperty(key);
      }
      for (const { element, value } of previousSheet) {
        if (element.style.getPropertyValue(sheetKey) !== lastSheet) continue;
        if (value) element.style.setProperty(sheetKey, value); else element.style.removeProperty(sheetKey);
      }
      if (sheet?.style.getPropertyValue(headerKey) === lastHeader) {
        if (previousHeader) sheet.style.setProperty(headerKey, previousHeader); else sheet.style.removeProperty(headerKey);
      }
    };
  }, [enabled, dockRef, drawSheetRef]);
}
