export interface TagDirectoryEntry {
  readonly tag: string;
  readonly count: number;
}

export type TagDirectorySort = "popular" | "name";

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/^#/u, "").trim();
}

export function filterTagDirectory(
  tags: readonly TagDirectoryEntry[],
  query: string,
  sort: TagDirectorySort,
): TagDirectoryEntry[] {
  const needle = normalized(query.slice(0, 80));
  return [...tags]
    .filter((entry) => !needle || normalized(entry.tag).includes(needle))
    .sort((a, b) => sort === "popular"
      ? b.count - a.count || a.tag.localeCompare(b.tag, "ko-KR")
      : a.tag.localeCompare(b.tag, "ko-KR") || b.count - a.count);
}

export function tagDirectorySort(value: string | null): TagDirectorySort {
  return value === "name" ? "name" : "popular";
}
