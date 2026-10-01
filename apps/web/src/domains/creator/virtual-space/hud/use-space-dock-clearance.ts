import { useEffect, type RefObject } from "react";

/** 전역 배너·토스트가 도크를 가리지 않도록 도크가 차지하는 하단 높이를 게시하는 CSS 변수. */
export const SPACE_DOCK_CLEARANCE_PROPERTY = "--immersive-dock-clearance";

/**
 * 도크 요소의 화면 하단 점유 높이(도크 높이 + 하단 여백)를 document 루트에 게시한다.
 * 언마운트하면 값을 지워 다른 화면에 남지 않게 한다.
 */
export function useSpaceDockClearance(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof document === "undefined") return undefined;
    const root = document.documentElement;
    let frame = 0;
    const publish = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight || root.clientHeight || 0;
      const clearance = rect.height > 0 ? Math.max(0, Math.round(viewport - rect.top)) : 0;
      root.style.setProperty(SPACE_DOCK_CLEARANCE_PROPERTY, `${clearance}px`);
    };
    const schedule = () => {
      if (frame || typeof requestAnimationFrame !== "function") { if (!frame) publish(); return; }
      frame = requestAnimationFrame(publish);
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(element);
    window.addEventListener("resize", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      root.style.removeProperty(SPACE_DOCK_CLEARANCE_PROPERTY);
    };
  }, [ref]);
}
