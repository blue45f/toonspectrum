import { useEffect } from "react";

import { bindCreatorSectionNavigation } from "./creator-home-navigation";

/** Keep canonical and legacy homepage fragments readable after the lazy route mounts. */
export function useCreatorHomeSectionNavigation() {
  useEffect(() => bindCreatorSectionNavigation({
    getHash: () => window.location.hash,
    findTarget: (id) => document.getElementById(id),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    subscribe: (callback) => {
      window.addEventListener("hashchange", callback);
      return () => window.removeEventListener("hashchange", callback);
    },
  }), []);
}
