import { useEffect } from "react";

import { bindCreatorSectionNavigation, creatorSectionFromHash } from "./creator-home-navigation";

/** 글꼴·헤더 재배치가 방금 이동한 제목을 가릴 때만 보정하며 사용자의 스크롤은 우선한다. */
export function bindCreatorSectionLayoutRecovery() {
  let disposed = false;
  let recoveryAllowed = true;
  let frame: number | undefined;
  const targetForHash = () => {
    const section = creatorSectionFromHash(window.location.hash);
    return section ? document.getElementById(section.headingId) : null;
  };
  const schedule = () => {
    if (disposed || !recoveryAllowed || frame !== undefined) return;
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      if (disposed || !recoveryAllowed) return;
      const target = targetForHash();
      if (!target || document.activeElement !== target) return;
      const header = document.querySelector(".site-header");
      const top = target.getBoundingClientRect().top;
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      if (top < headerBottom || top >= window.innerHeight) {
        target.scrollIntoView({ block: "start", behavior: "instant" });
      }
    });
  };
  const stopForUser = () => { recoveryAllowed = false; };
  const resumeForFragment = () => { recoveryAllowed = true; schedule(); };
  const onFocus = () => { if (document.activeElement === targetForHash()) resumeForFragment(); };
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  for (const element of document.querySelectorAll(".creator-home, .site-header")) observer?.observe(element);
  const userEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
  for (const event of userEvents) document.addEventListener(event, stopForUser, { passive: true, capture: true });
  document.addEventListener("focusin", onFocus);
  window.addEventListener("hashchange", resumeForFragment);
  document.fonts?.addEventListener("loadingdone", schedule);
  void document.fonts?.ready.then(schedule);
  return () => {
    disposed = true;
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    observer?.disconnect();
    for (const event of userEvents) document.removeEventListener(event, stopForUser, true);
    document.removeEventListener("focusin", onFocus);
    window.removeEventListener("hashchange", resumeForFragment);
    document.fonts?.removeEventListener("loadingdone", schedule);
  };
}

/** Keep canonical and legacy homepage fragments readable after the lazy route mounts. */
export function useCreatorHomeSectionNavigation() {
  useEffect(bindCreatorSectionLayoutRecovery, []);
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
