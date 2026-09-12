import { useLayoutEffect, type RefObject } from "react";

/** Keep sticky content aligned with the rendered header, including wrapping and scrollbars. */
export function useSiteHeaderHeight(headerRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = header.ownerDocument.documentElement;
    const property = "--site-header-height";
    const previousValue = root.style.getPropertyValue(property);
    const previousPriority = root.style.getPropertyPriority(property);
    const update = () => root.style.setProperty(property, `${Math.ceil(header.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const view = header.ownerDocument.defaultView;
    observer?.observe(header);
    if (!observer) view?.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      if (!observer) view?.removeEventListener("resize", update);
      if (previousValue) root.style.setProperty(property, previousValue, previousPriority);
      else root.style.removeProperty(property);
    };
  }, [headerRef]);
}
