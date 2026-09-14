import { useEffect, useRef, useState } from "react";
import { useSiteExperience } from "./site-experience-context";

/** No animation work offscreen, in a hidden tab, or against a motion preference. */
export function useAtelierMotion() {
  const hostRef = useRef<HTMLDivElement>(null);
  const settings = useSiteExperience();
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(() => typeof document !== "undefined" && document.visibilityState !== "hidden");
  const [reduced, setReduced] = useState(() => typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: 0.08 });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    const onVisibility = () => setForeground(document.visibilityState !== "hidden");
    // Older embedded WebKit exposes only the legacy MediaQueryList listener.
    if (typeof media.addEventListener === "function") media.addEventListener("change", onChange);
    else media.addListener?.(onChange);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (typeof media.removeEventListener === "function") media.removeEventListener("change", onChange);
      else media.removeListener?.(onChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const motionAllowed = !reduced && settings?.mode !== "calm";
  return { hostRef, running: motionAllowed && visible && foreground && !paused, motionAllowed, paused, setPaused };
}
