import type { SiteNavigationText } from "@/shared/components/site-navigation";
import {
  resolveSiteRouteMetadata,
  siteRouteMetadataSearchText,
  type SiteRouteAccess,
  type SiteRouteDevice,
  type SiteRouteMaturity,
  type SiteRouteMetadata,
  type SiteRouteProduct,
  type SiteRoutePurpose,
} from "@/shared/lib/site-route-metadata";

export interface SiteDirectoryEntry {
  readonly href: string;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
  readonly metadata?: SiteRouteMetadata;
}

export interface SiteDirectoryFilters {
  readonly product?: SiteRouteProduct | "all";
  readonly purpose?: SiteRoutePurpose | "all";
  readonly maturity?: SiteRouteMaturity | "all";
  readonly access?: SiteRouteAccess | "all";
  readonly device?: SiteRouteDevice | "all";
  readonly favorites?: readonly string[];
  readonly favoritesOnly?: boolean;
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

export function siteDirectoryEntryMetadata(entry: SiteDirectoryEntry): SiteRouteMetadata {
  return entry.metadata ?? resolveSiteRouteMetadata(entry.href);
}

function uniqueEntries(entries: readonly SiteDirectoryEntry[]): SiteDirectoryEntry[] {
  const unique = new Map<string, SiteDirectoryEntry>();
  for (const entry of entries) {
    const metadata = siteDirectoryEntryMetadata(entry);
    if (!unique.has(metadata.canonicalPath)) {
      unique.set(metadata.canonicalPath, metadata.canonicalPath === entry.href ? entry : {
        ...entry,
        href: metadata.canonicalPath,
        metadata,
      });
    }
  }
  return [...unique.values()];
}

/** Bilingual, local-only matching. Route metadata is reused; no content is sent to an API. */
export function searchSiteDirectory(entries: readonly SiteDirectoryEntry[], input: string): SiteDirectoryEntry[] {
  const query = normalized(input.slice(0, 160));
  if (!query) return [];
  const terms = query.split(" ");
  return uniqueEntries(entries)
    .map((entry) => {
      const metadata = siteDirectoryEntryMetadata(entry);
      const labels = [normalized(entry.label.ko), normalized(entry.label.en)];
      const text = normalized(`${entry.label.ko} ${entry.label.en} ${entry.description.ko} ${entry.description.en} ${entry.href} ${siteRouteMetadataSearchText(metadata)}`);
      return { entry, match: terms.every((term) => text.includes(term)), rank: labels.includes(query) ? 0 : labels.some((label) => label.startsWith(query)) ? 1 : labels.some((label) => label.includes(query)) ? 2 : 3 };
    })
    .filter((item) => item.match)
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.entry);
}

export function filterSiteDirectory(
  entries: readonly SiteDirectoryEntry[],
  input: string,
  filters: SiteDirectoryFilters = {},
): SiteDirectoryEntry[] {
  const query = normalized(input.slice(0, 160));
  const candidates = query ? searchSiteDirectory(entries, query) : uniqueEntries(entries);
  const favoritePaths = new Set(filters.favorites ?? []);
  return candidates.filter((entry) => {
    const metadata = siteDirectoryEntryMetadata(entry);
    if (filters.product && filters.product !== "all" && metadata.product !== filters.product) return false;
    if (filters.purpose && filters.purpose !== "all" && metadata.purpose !== filters.purpose) return false;
    if (filters.maturity && filters.maturity !== "all" && metadata.maturity !== filters.maturity) return false;
    if (filters.access && filters.access !== "all" && metadata.access !== filters.access) return false;
    if (filters.device && filters.device !== "all" && metadata.device !== filters.device) return false;
    if (filters.favoritesOnly && !favoritePaths.has(metadata.canonicalPath)) return false;
    return true;
  });
}
