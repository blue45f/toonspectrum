import { useEffect } from "react";

import { bindCreatorSectionNavigation } from "./creator-home-navigation";

/** Keep canonical and legacy homepage fragments readable after the lazy route mounts. */
export function useCreatorHomeSectionNavigation() {
  useEffect(() => bindCreatorSectionNavigation({
    getHash: () => window.location.hash,
    getFocusedControl: () => {
      const active = document.activeElement;
      return active instanceof HTMLElement && (active.tabIndex >= 0 || active.isContentEditable) ? active : null;
    },
    findTarget: (id) => document.getElementById(id),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    isBlocked: () => Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
      .some((dialog) => dialog.getClientRects().length > 0),
    // Body portals mount/unmount independently of the lazy home route. A modal
    // keeps focus until dismissal; only a deferred fragment resumes afterward.
    subscribeUnblocked: (callback) => {
      const observer = new MutationObserver(callback);
      observer.observe(document.body, { childList: true });
      return () => observer.disconnect();
    },
    subscribe: (callback) => {
      window.addEventListener("hashchange", callback);
      return () => window.removeEventListener("hashchange", callback);
    },
  }), []);
}
