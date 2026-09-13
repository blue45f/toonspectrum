import { isEffectivelyHidden, isEffectivelyLocked } from "./studio-layers";
import { resolvePixelSelectionAutoTarget } from "./studio-selection-tools";

import type { El } from "./studio-element-model";
import type { LayerGroup, LayerItemLike } from "./studio-layers";
import type { PixelSelectionAutoTargetCandidate, PixelSelectionAutoTargetResolution, SelectionFrame } from "./studio-selection-tools";

export type PixelSelectionSceneElement =
  | (LayerItemLike & SelectionFrame & { type: "image" })
  | { id: string; type: Exclude<El["type"], "image"> };

/** Preserve scene z-order and inherited layer locks before the pure hit-test. */
export function resolvePixelSelectionSceneTarget(
  elements: readonly PixelSelectionSceneElement[],
  groups: LayerGroup[],
  point: { x: number; y: number },
  reviewLocked: boolean,
): PixelSelectionAutoTargetResolution {
  if (reviewLocked) return { kind: "none" };
  const candidates: PixelSelectionAutoTargetCandidate[] = [];
  for (const element of elements) {
    if (element.type !== "image") continue;
    candidates.push({
      id: element.id,
      frame: {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rotation: element.rotation,
      },
      hidden: isEffectivelyHidden(element, groups),
      locked: isEffectivelyLocked(element, groups),
    });
  }
  return resolvePixelSelectionAutoTarget(candidates, point);
}
