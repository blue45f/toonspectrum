/**
 * Visual-admission authority for deployment-owned VRM cards.
 *
 * Bundled files remain resolvable for existing documents and direct diagnostics. This policy only
 * controls which deployment-owned cards are offered when a creator starts new work. User uploads
 * are never filtered by this catalogue gate.
 */
export type StudioVrmCatalogQualityTier = "premium" | "stylized-reference";

export const STUDIO_VRM_PREMIUM_CATALOG_IDS = Object.freeze([
  "sample-vrm",
  "avatar-a",
  "avatar-b",
  "avatar-c",
  "alicia",
  "mega-angel",
  "rubin",
  "vivi",
  "vita",
  "shino",
  "shion",
  "mio",
  "noa",
  "fumi",
  "kage",
] as const);

const PREMIUM_IDS = new Set<string>(STUDIO_VRM_PREMIUM_CATALOG_IDS);
const STANDALONE_REFERENCE_IDS = new Set<string>(["orion"]);

export function classifyStudioVrmCatalogQuality(
  id: string,
): StudioVrmCatalogQualityTier | null {
  if (PREMIUM_IDS.has(id)) return "premium";
  if (id.startsWith("quaternius-") || STANDALONE_REFERENCE_IDS.has(id)) {
    return "stylized-reference";
  }
  return null;
}

export function isStudioVrmProductionCatalogEntry(id: string): boolean {
  return classifyStudioVrmCatalogQuality(id) !== null;
}

export function filterStudioVrmProductionLibraryEntries<
  T extends { readonly id: string; readonly source: string },
>(entries: readonly T[]): readonly T[] {
  return entries.filter(
    (entry) => entry.source !== "sample" || isStudioVrmProductionCatalogEntry(entry.id),
  );
}
