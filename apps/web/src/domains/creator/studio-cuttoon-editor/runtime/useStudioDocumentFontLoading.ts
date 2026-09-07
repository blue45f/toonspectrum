import { useEffect, type RefObject } from "react";

import {
  buildStudioPresetFontsCss2Url,
  collectStudioPresetFontsInUse,
  ensureStudioDocumentFontStylesheet,
  ensureStudioDocumentPresetFontsLoaded,
  type StudioFontBearingElementLike,
} from "../../studio-preset-font-loading";

interface StudioDocumentFontLoadingOptions {
  elements: readonly StudioFontBearingElementLike[];
  activeElementsRef: RefObject<readonly StudioFontBearingElementLike[]>;
  stageRef: RefObject<{ batchDraw: () => unknown } | null>;
}

/** Load only document fonts and repaint Konva when their asynchronous browser load completes. */
export function useStudioDocumentFontLoading({
  elements,
  activeElementsRef,
  stageRef,
}: StudioDocumentFontLoadingOptions): void {
  useEffect(() => {
    let mounted = true;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const redrawStage = () => {
      if (mounted) stageRef.current?.batchDraw();
    };
    const startLoad = () => {
      if (!mounted) return;
      ensureStudioDocumentPresetFontsLoaded(activeElementsRef.current);
      void document.fonts.ready.then(redrawStage);
      document.fonts.addEventListener("loadingdone", redrawStage);
    };

    if (typeof globalThis.requestIdleCallback === "function") {
      idleHandle = globalThis.requestIdleCallback(startLoad);
    } else {
      timeoutHandle = setTimeout(startLoad, 300);
    }

    return () => {
      mounted = false;
      if (idleHandle !== null && typeof globalThis.cancelIdleCallback === "function") {
        globalThis.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      document.fonts.removeEventListener("loadingdone", redrawStage);
    };
  }, [activeElementsRef, stageRef]);

  // A hydrated document, page switch or snapshot restore may introduce fonts after mount.
  // A stable family URL avoids repeating the effect when unrelated elements change.
  const href = buildStudioPresetFontsCss2Url(collectStudioPresetFontsInUse(elements));
  useEffect(() => {
    if (!href) return;
    ensureStudioDocumentFontStylesheet(href);
    let current = true;
    // Repaint even if the existing link changed href, or StrictMode retained it from its first
    // effect pass. The link's insertion flag alone cannot identify either of those font loads.
    void document.fonts.ready.then(() => {
      if (current) stageRef.current?.batchDraw();
    });
    return () => {
      current = false;
    };
  }, [href, stageRef]);
}
