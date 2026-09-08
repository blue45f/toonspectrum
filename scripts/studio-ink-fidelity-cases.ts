import {
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
} from "../apps/web/src/domains/creator/brush/studio-brush-catalog";

export interface FidelityCaseDefinition {
  /** Saved IDs remain stable when the picker display name changes. */
  readonly id: "inkwash-pen" | "pen";
  readonly contract: string;
}

/** A case resolved against the shipped picker: name and width come from the catalogue, not literals. */
export interface FidelityCase extends FidelityCaseDefinition {
  readonly brushName: string;
  /** Catalogue default width, so a preview build measures the shipped configuration. */
  readonly brushWidth: number;
  readonly brushOperation: "paint" | "erase";
}

/**
 * Each case must be a brush a user can actually reach in the picker. `glass-pen` was the original
 * thin-line representative, but the quarantine ledger delisted it — "선언된 \"잉크 흐름\"으로
 * 분기하는 렌더러가 없어" — so the catalogue never lists it and the probe timed out selecting a
 * brush that is not there. The ledger names its replacements; `pen` is the one that survived the
 * later feel-cull (fineliner is quarantined too). `resolveCase` now turns that same class of
 * mistake into an immediate, named failure instead of a fifteen-second locator timeout.
 */
export const FIDELITY_CASES = Object.freeze([
  {
    id: "inkwash-pen",
    contract: "fluid wet-ink live overlay → committed document pixels",
  },
  {
    id: "pen",
    contract: "thin-line causal filtering → committed document geometry",
  },
] as const satisfies readonly FidelityCaseDefinition[]);

/**
 * Bind a case to the brush the shipped picker actually lists. The child probe drives the desktop
 * catalogue by its accessible label, so the label has to come from the same source the UI renders
 * from; reading it here also keeps the "selected brush matches the case" assertion meaningful
 * instead of echoing a literal back at itself.
 */
export function resolveCase(
  definition: FidelityCaseDefinition,
  catalogue = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
): FidelityCase {
  const item = catalogue.find((entry) => entry.id === definition.id);
  if (!item) {
    throw new Error(
      `fidelity case "${definition.id}" is not listed in the shipped brush picker;`
      + " a delisted or renamed id must be replaced here, not selected by a stale label",
    );
  }
  return {
    ...definition,
    brushName: item.name,
    brushWidth: item.defaultWidth,
    brushOperation: item.operation,
  };
}

