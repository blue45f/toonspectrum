import { useLayoutEffect, type RefObject } from "react";

/** 키보드가 가리는 영역만 제외한다. 사용자의 브라우저 확대는 취소하거나 역보정하지 않는다. */
export function useStudio3dVisualViewport(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const heightKey = "--studio-3d-viewport-height";
    const topKey = "--studio-3d-viewport-top";
    const previousHeight = element.style.getPropertyValue(heightKey);
    const previousTop = element.style.getPropertyValue(topKey);
    const previousKeyboard = element.getAttribute("data-studio-3d-keyboard-open");
    let layoutWidth = window.innerWidth;
    let unobscuredHeight = window.innerHeight;
    const measure = () => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) {
        element.style.removeProperty(heightKey);
        element.style.removeProperty(topKey);
        element.removeAttribute("data-studio-3d-keyboard-open");
        return;
      }
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      if (!Number.isFinite(height) || height <= 0) return;
      element.style.setProperty(heightKey, `${height}px`);
      element.style.setProperty(topKey, `${Number.isFinite(top) ? Math.max(0, top) : 0}px`);
      const active = element.ownerDocument.activeElement;
      const typing = active instanceof HTMLElement && element.contains(active) && (
        (active instanceof HTMLInputElement
          && ["text", "search", "email", "url", "tel", "password", "number"].includes(active.type)
          && !active.readOnly && !active.disabled)
        || (active instanceof HTMLTextAreaElement && !active.readOnly && !active.disabled)
        || active.matches('[contenteditable]:not([contenteditable="false"])')
      );
      // 일부 모바일 브라우저는 키보드와 함께 innerHeight도 줄인다. 입력 전 높이를 유지하되
      // 회전·분할 화면으로 너비가 바뀌면 새 화면 기준으로 다시 측정한다.
      if (!typing || Math.abs(window.innerWidth - layoutWidth) > 1) {
        unobscuredHeight = window.innerHeight;
        layoutWidth = window.innerWidth;
      }
      const keyboardOpen = typing && Math.max(unobscuredHeight, window.innerHeight) - height > 120;
      if (keyboardOpen) element.setAttribute("data-studio-3d-keyboard-open", "true");
      else element.removeAttribute("data-studio-3d-keyboard-open");
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    element.addEventListener("focusin", schedule);
    element.addEventListener("focusout", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      element.removeEventListener("focusin", schedule);
      element.removeEventListener("focusout", schedule);
      if (previousHeight) element.style.setProperty(heightKey, previousHeight);
      else element.style.removeProperty(heightKey);
      if (previousTop) element.style.setProperty(topKey, previousTop);
      else element.style.removeProperty(topKey);
      if (previousKeyboard === null) element.removeAttribute("data-studio-3d-keyboard-open");
      else element.setAttribute("data-studio-3d-keyboard-open", previousKeyboard);
    };
  }, [enabled, ref]);
}
