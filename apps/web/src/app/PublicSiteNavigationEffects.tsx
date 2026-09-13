import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

import { publicHashTarget, rememberPublicScrollPosition, type PublicScrollPosition } from "./public-site-scroll";

import { isStudioRoutePathname } from "@/domains/creator/studio-workspace-route";

/** Adds back/forward and lazy-fragment recovery after the existing ScrollToTop.
 * Studio's existing route/lifecycle effects remain the sole owner inside Studio.
 */
export function PublicSiteNavigationEffects() {
  const { key, pathname, search, hash } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, PublicScrollPosition>());

  useEffect(() => {
    if (isStudioRoutePathname(pathname)) return;
    const history = positions.current;
    const saved = navigationType === "POP" ? history.get(key) : undefined;
    const targetId = publicHashTarget(hash);
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    let position = saved ?? { x: window.scrollX, y: window.scrollY };
    let pending = Boolean(saved || targetId);
    let frame = 0;
    let timeout = 0;
    let mutation: MutationObserver | undefined;
    let resize: ResizeObserver | undefined;

    const track = () => {
      if (!pending) position = { x: window.scrollX, y: window.scrollY };
    };
    const finish = () => {
      pending = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      mutation?.disconnect();
      resize?.disconnect();
      track();
    };
    const restore = () => {
      frame = 0;
      if (!pending) return;
      if (saved) {
        window.scrollTo({ left: saved.x, top: saved.y, behavior: "instant" });
        if (Math.abs(window.scrollY - saved.y) <= 2) finish();
        return;
      }
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      target.scrollIntoView({ block: "start", behavior: "instant" });
      const hadTabIndex = target.hasAttribute("tabindex");
      if (!hadTabIndex) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      if (!hadTabIndex) target.removeAttribute("tabindex");
      finish();
    };
    const schedule = () => {
      if (pending && !frame) frame = window.requestAnimationFrame(restore);
    };
    window.addEventListener("scroll", track, { passive: true });
    // A user's action always wins over delayed content/fragment restoration.
    window.addEventListener("wheel", finish, { passive: true });
    window.addEventListener("touchstart", finish, { passive: true });
    window.addEventListener("pointerdown", finish, { passive: true });
    window.addEventListener("keydown", finish);
    if (pending) {
      mutation = new MutationObserver(schedule);
      mutation.observe(document.getElementById("main-content") ?? document.body, { childList: true, subtree: true });
      if (typeof ResizeObserver !== "undefined") {
        resize = new ResizeObserver(schedule);
        resize.observe(document.documentElement);
      }
      timeout = window.setTimeout(finish, 4000);
      schedule();
    }
    return () => {
      // Use the last observed position, not the already replaced route's height.
      rememberPublicScrollPosition(history, key, position);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      mutation?.disconnect();
      resize?.disconnect();
      window.removeEventListener("scroll", track);
      window.removeEventListener("wheel", finish);
      window.removeEventListener("touchstart", finish);
      window.removeEventListener("pointerdown", finish);
      window.removeEventListener("keydown", finish);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [key, pathname, search, hash, navigationType]);

  return null;
}
