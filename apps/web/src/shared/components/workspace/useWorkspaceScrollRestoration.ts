import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { createNavigationMemory } from "@/shared/lib/navigation-memory";
import { safeDecodeRouteText } from "@/shared/lib/safe-route-text";

interface WorkspaceLocation {
  readonly pathname: string;
  readonly search: string;
}

/**
 * Restores only the desktop workspace's nested scroller.
 * Window/editor canvas scrolling remains owned by RouteScrollRestoration and the editor runtime.
 */
export function useWorkspaceScrollRestoration(
  scrollerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  ownerScope: string,
): void {
  const { pathname, search, hash, key } = useLocation();
  const navigation = useNavigationType();
  const previous = useRef<WorkspaceLocation | null>(null);
  const previousOwner = useRef(ownerScope);
  const [memory] = useState(() => createNavigationMemory());

  useLayoutEffect(() => {
    if (previousOwner.current !== ownerScope) {
      memory.clear?.();
      previous.current = null;
      previousOwner.current = ownerScope;
    }
    const prior = previous.current;
    previous.current = { pathname, search };
    const scroller = scrollerRef.current;
    if (!enabled || !scroller) return;

    const saved = navigation === "POP" ? memory.get(key) : undefined;
    const anchorId = hash.length > 1 ? safeDecodeRouteText(hash.slice(1)) : "";
    const preserveFilterPosition = prior?.pathname === pathname && !saved && !anchorId;
    let restoring = !preserveFilterPosition;
    let observer: ResizeObserver | undefined;
    let mutation: MutationObserver | undefined;
    let timer = 0;

    const remember = () => {
      if (!restoring) memory.set(key, { x: scroller.scrollLeft, y: scroller.scrollTop });
    };
    const finish = () => {
      restoring = false;
      observer?.disconnect();
      mutation?.disconnect();
      window.clearTimeout(timer);
      remember();
    };
    const restore = () => {
      if (!restoring) return;
      if (anchorId) {
        const anchor = document.getElementById(anchorId);
        if (!anchor || !scroller.contains(anchor)) return;
        anchor.scrollIntoView({ block: "start", behavior: "instant" });
        finish();
        return;
      }
      const target = saved ?? { x: 0, y: 0 };
      if (scroller.scrollHeight - scroller.clientHeight + 2 < target.y) return;
      scroller.scrollLeft = target.x;
      scroller.scrollTop = target.y;
      finish();
    };

    scroller.addEventListener("scroll", remember, { passive: true });
    if (restoring) {
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(restore);
        observer.observe(scroller);
      }
      if (anchorId && typeof MutationObserver !== "undefined") {
        mutation = new MutationObserver(restore);
        mutation.observe(scroller, { childList: true, subtree: true });
      }
      timer = window.setTimeout(finish, 5000);
      restore();
    } else {
      remember();
    }

    return () => {
      // Cleanup belongs to the history entry represented by the current key.
      restoring = false;
      memory.set(key, { x: scroller.scrollLeft, y: scroller.scrollTop });
      scroller.removeEventListener("scroll", remember);
      observer?.disconnect();
      mutation?.disconnect();
      window.clearTimeout(timer);
    };
  }, [enabled, hash, key, memory, navigation, ownerScope, pathname, scrollerRef, search]);
}
