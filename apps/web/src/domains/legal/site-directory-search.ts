import type { SiteNavigationText } from "@/shared/components/site-navigation";

export interface SiteDirectoryEntry {
  readonly href: string;
  readonly label: SiteNavigationText;
  readonly description: SiteNavigationText;
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

/** Bilingual, local-only matching. Route metadata is reused; no content is sent to an API. */
export function searchSiteDirectory(entries: readonly SiteDirectoryEntry[], input: string): SiteDirectoryEntry[] {
  const query = normalized(input.slice(0, 160));
  if (!query) return [];
  const terms = query.split(" ");
  const unique = new Map<string, SiteDirectoryEntry>();
  for (const entry of entries) {
    if (!unique.has(entry.href)) unique.set(entry.href, entry);
  }
  return [...unique.values()]
    .map((entry) => {
      const labels = [normalized(entry.label.ko), normalized(entry.label.en)];
      const text = normalized(`${entry.label.ko} ${entry.label.en} ${entry.description.ko} ${entry.description.en} ${entry.href}`);
      return { entry, match: terms.every((term) => text.includes(term)), rank: labels.includes(query) ? 0 : labels.some((label) => label.startsWith(query)) ? 1 : labels.some((label) => label.includes(query)) ? 2 : 3 };
    })
    .filter((item) => item.match)
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.entry);
}
