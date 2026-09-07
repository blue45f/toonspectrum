import { useEffect, useState } from "react";

import { subscribeStudioCommandSearchRequests, type StudioCommandSearchRequest } from "./studio-help-center-channel";

/** Hold one explicit request while the mobile inspector's lazy search host mounts. */
export function useStudioDeferredCommandSearch(
  isMobile: boolean,
  inspectorOpen: boolean,
  openInspector: () => void,
) {
  const [request, setRequest] = useState<StudioCommandSearchRequest | null>(null);

  useEffect(() => {
    if (!isMobile || inspectorOpen) return;
    const open = (next: StudioCommandSearchRequest) => {
      setRequest(next);
      openInspector();
    };
    const unsubscribe = subscribeStudioCommandSearchRequests(open);
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== "F1" || event.defaultPrevented) return;
      if (target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )) return;
      event.preventDefault();
      open({ scope: "all" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobile, inspectorOpen, openInspector]);

  useEffect(() => {
    // Closing the sheet during its lazy load cancels the intent; reopening must not replay it.
    if (!isMobile || !inspectorOpen) setRequest(null);
  }, [isMobile, inspectorOpen]);

  return { request, handled: () => setRequest(null) };
}
