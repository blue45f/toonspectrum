import { useEffect, type RefObject } from "react";

import {
  buildStudioPresetFontsCss2Url,
  collectStudioPresetFontsInUse,
  ensureStudioDocumentFontStylesheet,
  type StudioFontBearingElementLike,
} from "../../studio-preset-font-loading";

interface StudioDocumentFontLoadingOptions {
  elements: readonly StudioFontBearingElementLike[];
  stageRef: RefObject<{ batchDraw: () => unknown } | null>;
}

/** Load only document fonts and repaint Konva when their asynchronous browser load completes. */
export function useStudioDocumentFontLoading({
  elements,
  stageRef,
}: StudioDocumentFontLoadingOptions): void {
  useEffect(() => {
    const redrawStage = () => stageRef.current?.batchDraw();
    document.fonts.addEventListener("loadingdone", redrawStage);
    return () => document.fonts.removeEventListener("loadingdone", redrawStage);
  }, [stageRef]);

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
