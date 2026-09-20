import { readStudioProjectDocuments } from "../studio-project-document-reader";
import { studioProjectSectionHref } from "../studio-project-views";
import { resolveStudioProjectResumeTarget, type StudioProjectResumeTarget } from "../studio-project-resume-target";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import type { StudioExactResumeStorage } from "../studio-exact-resume-context";

export interface WorkspaceResumeSnapshot {
  readonly status: "idle" | "ready" | "unavailable" | "storage-error";
  readonly target: StudioProjectResumeTarget | null;
}
export const EMPTY_WORKSPACE_RESUME: WorkspaceResumeSnapshot = Object.freeze({ status: "idle", target: null });

/** Read-only adapter. Missing remembered documents never select a neighbouring manuscript. */
export function readWorkspaceResume(
  readStorage: () => StudioExactResumeStorage,
  project: StudioProjectLibraryEntry | null,
  locale: "ko" | "en",
): WorkspaceResumeSnapshot {
  if (!project) return EMPTY_WORKSPACE_RESUME;
  try {
    const storage = readStorage();
    let readFailed = false;
    const observed = { getItem: (key: string) => {
      try { return storage.getItem(key); } catch (error) { readFailed = true; throw error; }
    }, setItem: () => { throw new Error("Read-only resume adapter."); }, removeItem: () => { throw new Error("Read-only resume adapter."); } };
    const documents = readStudioProjectDocuments(observed, project.id).documents;
    const remembered = project.lastOpenedDocumentId;
    if (remembered && !documents.some((item) => item.id === remembered && item.status === "active")) {
      return Object.freeze({ status: "unavailable", target: Object.freeze({
        href: studioProjectSectionHref(project.id, "production", "documents"),
        documentId: remembered, summary: null, exact: false,
      }) });
    }
    const target = resolveStudioProjectResumeTarget(observed, project, locale);
    if (readFailed) throw new Error("Resume metadata could not be read.");
    return Object.freeze({ status: "ready", target: Object.freeze(target) });
  } catch {
    return Object.freeze({ status: "storage-error", target: Object.freeze({
      href: "/studio?view=storage", documentId: null, summary: null, exact: false,
    }) });
  }
}

export function sameWorkspaceResume(a: WorkspaceResumeSnapshot, b: WorkspaceResumeSnapshot): boolean {
  return a.status === b.status && a.target?.href === b.target?.href
    && a.target?.documentId === b.target?.documentId && a.target?.summary === b.target?.summary
    && a.target?.exact === b.target?.exact;
}
