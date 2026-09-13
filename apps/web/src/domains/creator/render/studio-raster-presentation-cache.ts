import type Konva from "konva";

const rasterPresentationCacheOwners = new WeakMap<Konva.Node, () => boolean>();

/** Cache owners retain their own density, bounds and compositing policy. */
export function registerStudioRasterPresentationCache(
  node: Konva.Node | null,
  refresh: () => boolean,
): () => void {
  if (!node) return () => undefined;
  rasterPresentationCacheOwners.set(node, refresh);
  return () => {
    if (rasterPresentationCacheOwners.get(node) === refresh) {
      rasterPresentationCacheOwners.delete(node);
    }
  };
}

/**
 * Run only when an exact image presentation changes, before its layer draw. Cached parents skip
 * drawing their children, so rebuild from the nearest owner outwards to include the new pixels.
 * An unknown or failed cache cannot substantiate an exact capture receipt.
 */
export function refreshStudioRasterPresentationCaches(node: Konva.Node): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    const refresh = rasterPresentationCacheOwners.get(parent);
    if (refresh) {
      try {
        if (!refresh()) return false;
      } catch {
        return false;
      }
    } else if (parent.isCached()) {
      return false;
    }
  }
  return true;
}

type StudioRasterCapturePrepare = (pixelRatio: number) => () => void;
const rasterCapturePreparations = new WeakMap<object, Map<Konva.Node, StudioRasterCapturePrepare>>();

/** The disposer removes the exact owner, so editor unmount does not retain a Stage or a document. */
export function registerStudioRasterCapturePreparation(node: Konva.Node, prepare: StudioRasterCapturePrepare): () => void {
  const stage = node.getStage();
  if (!stage) return () => undefined;
  let entries = rasterCapturePreparations.get(stage);
  if (!entries) { entries = new Map(); rasterCapturePreparations.set(stage, entries); }
  entries.set(node, prepare);
  return () => {
    if (entries.get(node) === prepare) entries.delete(node);
    if (entries.size === 0) rasterCapturePreparations.delete(stage);
  };
}

function rasterCacheDepth(node: Konva.Node): number {
  let depth = 0;
  for (let parent = node.getParent(); parent; parent = parent.getParent()) depth++;
  return depth;
}

/** Rebuild children before parents; restore in the same order to avoid retaining scaled child pixels. */
export function prepareStudioRasterCapture(stage: object, pixelRatio: number): () => void {
  const entries = rasterCapturePreparations.get(stage);
  if (!entries?.size) return () => undefined;
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) throw new Error("출력 배율이 올바르지 않아요.");
  const restores: Array<() => void> = [];
  const restore = () => {
    let failure: unknown;
    for (const reset of restores) {
      try { reset(); } catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
  };
  try {
    const ordered = [...entries].filter(([node]) => node.isVisible())
      .sort(([left], [right]) => rasterCacheDepth(right) - rasterCacheDepth(left));
    for (const [, prepare] of ordered) restores.push(prepare(pixelRatio));
  } catch (error) {
    try { restore(); } catch { /* Keep the original capture failure; never read partial pixels. */ }
    throw error;
  }
  return restore;
}
