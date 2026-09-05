import { matchesStudioToolSearch, normalizeStudioToolSearch, studioToolSearchTerms } from "../studio-tool-search";

import { STUDIO_BRUSH_DISCOVERY } from "./studio-brush-discovery";

export interface SearchableStudioShortcutBrush {
  readonly id: string;
  readonly name: string;
  readonly hint?: string;
  readonly categoryLabel?: string;
  readonly searchAliases?: readonly string[];
}

/**
 * A curated former name identifies a particular shortcut, not every brush whose
 * inherited description happens to mention that name. General purpose/material
 * queries still use literal AND matching, including all inherited old labels.
 * This changes discovery only: order, stable IDs and selected tools are untouched.
 */
export function searchStudioShortcutBrushes<T extends SearchableStudioShortcutBrush>(
  tools: readonly T[],
  query: string,
): T[] {
  const normalized = normalizeStudioToolSearch(query);
  const terms = studioToolSearchTerms(query);
  if (!terms.length) return [...tools];
  const formerNameMatches = tools.filter((tool) =>
    STUDIO_BRUSH_DISCOVERY[tool.id]?.aliases.some((alias) =>
      normalizeStudioToolSearch(alias) === normalized,
    ),
  );
  if (formerNameMatches.length) return formerNameMatches;
  return tools.filter((tool) => matchesStudioToolSearch(terms, [
    tool.name, tool.id, tool.hint, tool.categoryLabel, ...(tool.searchAliases ?? []),
  ]));
}
