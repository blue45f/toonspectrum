import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
function subscribe(listener: () => void) {
  const media = typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
  media?.addEventListener("change", listener);
  document.addEventListener("visibilitychange", listener);
  return () => { media?.removeEventListener("change", listener); document.removeEventListener("visibilitychange", listener); };
}
function snapshot() {
  const reduced = typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
  return (reduced ? 1 : 0) | (document.visibilityState === "hidden" ? 2 : 0);
}
export function useMotionEnvironment() {
  const state = useSyncExternalStore(subscribe, snapshot, () => 3);
  return { reduced: Boolean(state & 1), hidden: Boolean(state & 2), canAnimate: state === 0 };
}
