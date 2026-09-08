import { classifyStudioDryMediaCatalogIdV1 } from "./brush/studio-dry-media-anisotropic-grain-v1";

import type { DrawEl } from "./studio-element-model";

export type StudioCanonicalDryMediaEligibilityFailure = {
  readonly reason: "invalid-input" | "ineligible-material" | "unsupported-paint-roller"
    | "unsupported-symmetry" | "unsupported-composite" | "unsupported-paint-model";
  readonly detail?: string;
};

/** The viewport and compiler must agree before the specialist acquires visible authority. */
export function studioCanonicalDryMediaEligibilityFailure(
  element: DrawEl | null | undefined,
): StudioCanonicalDryMediaEligibilityFailure | null {
  if (!element || element.type !== "draw" || (element.kind && element.kind !== "freehand")
    || element.mode === "eraser" || element.brush !== "dry-media") return { reason: "invalid-input" };
  if (classifyStudioDryMediaCatalogIdV1(element.brushCatalogId)?.kind !== "anisotropic-continuous") {
    return { reason: "ineligible-material" };
  }
  if (element.brushCatalogId === "paint-roller") return { reason: "unsupported-paint-roller" };
  if ((element.symmetry?.type ?? "none") !== "none") return { reason: "unsupported-symmetry" };
  if (element.blendMode !== undefined && element.blendMode !== "normal" && element.blendMode !== "source-over") {
    return { reason: "unsupported-composite" };
  }
  if (element.paintModel !== undefined && (element.paintModel !== "bounded-flow-v2" || (element.opacity ?? 1) !== 1)) {
    return { reason: "unsupported-paint-model", detail: `${element.paintModel}:${element.opacity ?? 1}` };
  }
  return null;
}
