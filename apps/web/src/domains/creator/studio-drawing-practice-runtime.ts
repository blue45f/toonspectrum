import { registerStudioRasterCapturePreparation } from "./render/studio-raster-presentation-cache";
import { canonicalizeStudioAssetContentHash, type StudioAsset } from "./studio-asset-library";

import type { StudioDrawingPracticeDocument } from "./studio-drawing-practice-document";
import type Konva from "konva";

/** SHA-256 is authoritative. assetId remains a same-device recovery hint only. */
export function resolveStudioDrawingPracticeAsset(
  document: StudioDrawingPracticeDocument | null | undefined,
  assets: readonly StudioAsset[],
): StudioAsset | null {
  if (!document) return null;
  const byHash = assets.find(
    (asset) => canonicalizeStudioAssetContentHash(asset.contentHash) === document.source.sha256,
  );
  if (byHash) return byHash;
  if (!document.source.assetId) return null;
  return assets.find((asset) => asset.id === document.source.assetId) ?? null;
}

export function shouldRenderStudioDrawingPracticeGuide(input: {
  document: StudioDrawingPracticeDocument | null | undefined;
  sourceDataUrl: string | null | undefined;
  compareActive: boolean;
  exporting: boolean;
  saving: boolean;
  timelapseCapturing: boolean;
}): boolean {
  const { document } = input;
  return Boolean(
    document
    && input.sourceDataUrl
    && document.view.mode === "overlay"
    && document.view.visible
    && !input.compareActive
    && !input.exporting
    && !input.saving
    && !input.timelapseCapturing
  );
}

export function routeStudioDrawingPracticeStroke<Element extends object>(
  element: Element,
  targetGroupId: string | null,
): Element & { groupId?: string } {
  return targetGroupId ? { ...element, groupId: targetGroupId } : element;
}

/**
 * The guide is a live editor aid, never authored pixels. Register it with the same synchronous
 * capture fence used by document-raster reads so eyedropper, thumbnails, exports and save-time
 * captures cannot accidentally sample it even before React has committed an exporting state.
 */
export function registerStudioDrawingPracticeCaptureExclusion(
  node: Konva.Node | null,
): () => void {
  if (!node) return () => undefined;
  return registerStudioRasterCapturePreparation(node, () => {
    const ownVisibility = node.visible();
    node.visible(false);
    return () => { node.visible(ownVisibility); };
  });
}
