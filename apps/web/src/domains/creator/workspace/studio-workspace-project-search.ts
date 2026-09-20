import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";

export const WORKSPACE_PROJECT_PAGE_SIZE = 30;
export type WorkspaceProjectOrder = "recent" | "title";
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().trim();

/** Read-only view of verified local works; never changes the library or resume target. */
export function searchWorkspaceProjects(
  projects: readonly StudioProjectLibraryEntry[], query: string,
  order: WorkspaceProjectOrder = "recent", locale = "ko",
): StudioProjectLibraryEntry[] {
  const terms = normalize(query).split(/\s+/u).filter(Boolean);
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return projects.filter((project) => project.status === "active"
    && terms.every((term) => normalize(project.title).includes(term))).toSorted((a, b) => {
    const comparison = order === "title" ? collator.compare(a.title, b.title)
      : (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt);
    return comparison || a.id.localeCompare(b.id);
  });
}
