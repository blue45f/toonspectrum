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
