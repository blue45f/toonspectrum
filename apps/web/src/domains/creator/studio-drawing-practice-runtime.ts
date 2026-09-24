import { canonicalizeStudioAssetContentHash, type StudioAsset } from "./studio-asset-library";

import type { StudioDrawingPracticeDocument } from "./studio-drawing-practice-document";

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
