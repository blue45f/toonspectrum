import { isEffectivelyHidden } from "./studio-layers";

import type { El } from "./studio-element-model";

const NO_LOCAL_HIDDEN_IDS: ReadonlySet<string> = new Set();

/** A hidden instruction contributes no pixels and must not veto a specialist renderer. */
export function hasVisibleStudioLiveAdjustment(
  elements: readonly El[],
  groups: Parameters<typeof isEffectivelyHidden>[1] = [],
  localHiddenIds: ReadonlySet<string> = NO_LOCAL_HIDDEN_IDS,
): boolean {
  return elements.some((element) => element.type === "image"
    && element.adjustmentLayer !== undefined
    && !isEffectivelyHidden(element, groups)
    && !localHiddenIds.has(element.id));
}
