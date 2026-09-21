import { useLayoutEffect, useState } from "react";

/** Shell commands share the editor's real layout budget instead of covering it. */
export function useStudioChromePortalTarget(id: string): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const locate = () => {
      const next = document.getElementById(id);
      setTarget((current) => current === next ? current : next);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [id]);
  return target;
}

