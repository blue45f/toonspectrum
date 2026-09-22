import { useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { createNavigationMemory } from "@/shared/lib/navigation-memory";
import { safeDecodeRouteText } from "@/shared/lib/safe-route-text";

interface WorkspaceLocation {
  readonly pathname: string;
  readonly search: string;
}

// One bounded, in-memory owner scope per browser tab. It survives task-shell unmounts,
// but is cleared before a different signed-in owner can read a previous owner's positions.
const workspaceScrollMemory = createNavigationMemory();
let workspaceScrollOwnerScope: string | null = null;

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
  const memory = workspaceScrollMemory;

  useLayoutEffect(() => {
    if (workspaceScrollOwnerScope !== ownerScope) {
      memory.clear();
      previous.current = null;
      workspaceScrollOwnerScope = ownerScope;
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
    let deadlineTimer = 0;
    let retryTimer = 0;
    let lastPosition = { x: scroller.scrollLeft, y: scroller.scrollTop };

    const remember = () => {
      if (restoring) return;
      lastPosition = { x: scroller.scrollLeft, y: scroller.scrollTop };
      memory.set(key, lastPosition);
    };
    const finish = () => {
      restoring = false;
      observer?.disconnect();
      mutation?.disconnect();
      window.clearTimeout(deadlineTimer);
      window.clearTimeout(retryTimer);
      remember();
    };
    const scheduleRestore = () => {
      if (!restoring || retryTimer) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        restore();
      }, 50);
    };
    const restore = () => {
      if (!restoring) return;
      if (anchorId) {
        const anchor = document.getElementById(anchorId);
        if (!anchor || !scroller.contains(anchor)) {
          scheduleRestore();
          return;
        }
        anchor.scrollIntoView({ block: "start", behavior: "instant" });
        finish();
        return;
      }
      const target = saved ?? { x: 0, y: 0 };
      if (scroller.scrollHeight - scroller.clientHeight + 2 < target.y) {
        scheduleRestore();
        return;
      }
      scroller.scrollLeft = target.x;
      scroller.scrollTop = target.y;
      finish();
    };
    const contentLoaded = () => scheduleRestore();

    scroller.addEventListener("scroll", remember, { passive: true });
    scroller.addEventListener("load", contentLoaded, true);
    if (restoring) {
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(scheduleRestore);
        observer.observe(scroller);
      }
      if (typeof MutationObserver !== "undefined") {
        mutation = new MutationObserver(scheduleRestore);
        mutation.observe(scroller, { childList: true, subtree: true });
      }
      deadlineTimer = window.setTimeout(finish, 5000);
      restore();
    } else {
      remember();
    }

    return () => {
      // Cleanup belongs to the history entry represented by the current key.
      restoring = false;
      // Route content can collapse before layout-effect cleanup and clamp the DOM
      // scrollTop to zero. Persist the last observed scroll event instead of that
      // transient teardown value so browser Back restores the user's position.
      memory.set(key, lastPosition);
      scroller.removeEventListener("scroll", remember);
      scroller.removeEventListener("load", contentLoaded, true);
      observer?.disconnect();
      mutation?.disconnect();
      window.clearTimeout(deadlineTimer);
      window.clearTimeout(retryTimer);
    };
  }, [enabled, hash, key, memory, navigation, ownerScope, pathname, scrollerRef, search]);
}
