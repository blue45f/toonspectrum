import { useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

import { isStudioRoutePathname, shouldPreserveStudioRouteLifecycle } from "@/domains/creator/studio-workspace-route";
import { createNavigationMemory } from "@/shared/lib/navigation-memory";
import { safeDecodeRouteText } from "@/shared/lib/safe-route-text";

/** Restore browser history without resetting in-page filters or Studio lifecycle. */
export function RouteScrollRestoration() {
  const { pathname, search, hash, key } = useLocation();
  const navigation = useNavigationType();
  const previousRef = useRef<{ pathname: string; search: string } | null>(null);
  const [memory] = useState(() => createNavigationMemory());

  useLayoutEffect(() => {
    const previous = previousRef.current;
    const current = { pathname, search };
    previousRef.current = current;

    // Preserve the existing editor policy; no observers, history ownership or memory in Studio.
    if (isStudioRoutePathname(pathname)) {
      if (previous?.pathname === pathname && previous.search === search) return;
      if (previous && shouldPreserveStudioRouteLifecycle(previous, current)) return;
      globalThis.scrollTo({ top: 0, left: 0 });
      if (previous) document.getElementById("main-content")?.focus({ preventScroll: true });
      return;
    }

    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const saved = navigation === "POP" ? memory.get(key) : undefined;
    const anchorId = hash.length > 1 ? safeDecodeRouteText(hash.slice(1)) : "";
    const preserveFilterPosition = previous?.pathname === pathname && !saved && !anchorId;
    let restoring = !preserveFilterPosition;
    let observer: ResizeObserver | undefined;
    let mutation: MutationObserver | undefined;
    let timer = 0;
    const remember = () => {
      if (!restoring) memory.set(key, { x: window.scrollX, y: window.scrollY });
    };
    const stop = () => {
      restoring = false;
      observer?.disconnect();
      mutation?.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
      remember();
    };
    const restore = () => {
      if (!restoring) return;
      if (anchorId) {
        const anchor = document.getElementById(anchorId);
        if (!anchor) return;
        anchor.scrollIntoView({ block: "start", behavior: "instant" });
        const hadTabIndex = anchor.hasAttribute("tabindex");
        if (!hadTabIndex) anchor.setAttribute("tabindex", "-1");
        anchor.focus({ preventScroll: true });
        if (!hadTabIndex) anchor.removeAttribute("tabindex");
        stop();
        return;
      }
      const target = saved ?? { x: 0, y: 0 };
      // Lazy routes can initially be shorter than the saved position. Wait for content,
      // but never keep pulling the user back after they start interacting.
      if (document.documentElement.scrollHeight - window.innerHeight + 2 < target.y) return;
      window.scrollTo({ left: target.x, top: target.y, behavior: "instant" });
      if (previous && navigation !== "POP") document.getElementById("main-content")?.focus({ preventScroll: true });
      stop();
    };
    window.addEventListener("scroll", remember, { passive: true });
    if (restoring) {
      window.addEventListener("wheel", stop, { passive: true });
      window.addEventListener("touchstart", stop, { passive: true });
      window.addEventListener("pointerdown", stop, { passive: true });
      window.addEventListener("keydown", stop);
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(restore);
        observer.observe(document.body);
      }
      // A lazy fragment can appear without changing page height. Keep one restoration owner.
      if (anchorId && typeof MutationObserver !== "undefined") {
        mutation = new MutationObserver(restore);
        mutation.observe(document.getElementById("main-content") ?? document.body, { childList: true, subtree: true });
      }
      timer = window.setTimeout(stop, 5000);
      restore();
    } else remember();

    return () => {
      window.removeEventListener("scroll", remember);
      stop();
      window.history.scrollRestoration = previousRestoration;
    };
  }, [pathname, search, hash, key, navigation, memory]);
  return null;
}
