import { createHash } from "node:crypto";

import { searchTitles } from "../../../../../packages/core/src/search";

import type { SearchFilters, SortKey } from "../../../../../packages/core/src/search";
import type { PlatformId, Title } from "../../../../../packages/core/src/types";

function coverage(titles: readonly Title[]) {
  const counts = new Map<PlatformId, number>();
  for (const title of titles) {
    for (const id of new Set(title.availability.map((entry) => entry.platformId))) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => ({ id, count, share: titles.length ? Math.round(count / titles.length * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}
function compute(all: Title[], filters: SearchFilters, sort: SortKey) {
  const items = searchTitles(all, filters, sort);
  return {
    items,
    typeCount: { webtoon: items.filter((item) => item.type === "webtoon").length, webnovel: items.filter((item) => item.type === "webnovel").length },
    platformCoverage: coverage(all),
    filteredPlatformCoverage: coverage(items),
  };
}
type Result = ReturnType<typeof compute>;
type Entry = { createdAt: number; result: Result };

/** Public catalogue only: no sessions, personalized DB rows or response bodies. No timers. */
export class CatalogSearchCache {
  private titles: Title[] | null = null;
  private revision = -1;
  private readonly entries = new Map<string, Entry>();
  private retainedTitles = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  get(all: Title[], filters: SearchFilters, sort: SortKey, revision: number, enabled = true): Result {
    if (!enabled || this.titles !== all || this.revision !== revision) {
      this.entries.clear(); this.retainedTitles = 0; this.titles = all; this.revision = revision;
    }
    if (!enabled) return compute(all, filters, sort);
    const key = createHash("sha256").update(JSON.stringify([sort, filters], (_name, value: unknown) => value instanceof Set ? [...value].sort() : value)).digest("hex");
    const now = this.now();
    const cached = this.entries.get(key);
    if (cached && now >= cached.createdAt && now - cached.createdAt < 30_000) {
      this.entries.delete(key); this.entries.set(key, cached);
      return cached.result;
    }
    if (cached) { this.entries.delete(key); this.retainedTitles -= cached.result.items.length; }
    const result = compute(all, filters, sort);
    // Bound both distinct-query count and retained title references, including empty-query spam.
    if (result.items.length > 100_000) return result;
    this.entries.set(key, { createdAt: now, result }); this.retainedTitles += result.items.length;
    while (this.entries.size > 16 || this.retainedTitles > 100_000) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.retainedTitles -= this.entries.get(oldest)!.result.items.length;
      this.entries.delete(oldest);
    }
    return result;
  }
}
