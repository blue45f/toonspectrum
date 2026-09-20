import { STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, studioProjectDocumentStorageKey } from "../studio-project-document-reader";
import { STUDIO_EXACT_RESUME_UPDATED_EVENT, studioExactResumeStorageKey, type StudioExactResumeStorage } from "../studio-exact-resume-context";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import { EMPTY_WORKSPACE_RESUME, readWorkspaceResume, sameWorkspaceResume } from "./studio-workspace-resume";

/** Per-mounted-work read model, not a new persistence authority or a polling loop. */
export function createWorkspaceResumeStore({ project, locale, readStorage, host }: {
  readonly project: StudioProjectLibraryEntry | null;
  readonly locale: "ko" | "en";
  readonly readStorage: () => StudioExactResumeStorage;
  readonly host?: Window;
}) {
  let snapshot = readWorkspaceResume(readStorage, project, locale);
  const listeners = new Set<() => void>();
  let detach: (() => void) | undefined;
  const refresh = () => {
    const next = readWorkspaceResume(readStorage, project, locale);
    if (!sameWorkspaceResume(snapshot, next)) {
      snapshot = next;
      for (const listener of listeners) listener();
    }
    return snapshot;
  };
  const watch = () => {
    if (!host || !project) return () => {};
    let active = true;
    let queued = false;
    const documentsKey = studioProjectDocumentStorageKey(project.id);
    const belongs = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      return !detail || typeof detail !== "object" || !("projectId" in detail)
        || detail.projectId === project.id;
    };
    const onDocuments = (event: Event) => { if (belongs(event)) refresh(); };
    const onResume = (event: Event) => {
      if (!belongs(event) || queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; if (active) refresh(); });
    };
    const onStorage = (event: StorageEvent) => {
      const id = snapshot.target?.documentId ?? project.lastOpenedDocumentId;
      const exactKey = id ? studioExactResumeStorageKey(project.id, id) : null;
      if (event.key !== null && event.key !== documentsKey && event.key !== exactKey) return;
      try { if (event.storageArea !== readStorage()) return; } catch { /* refresh exposes recovery */ }
      refresh();
    };
    const onVisible = () => { if (host.document.visibilityState === "visible") refresh(); };
    host.addEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, onDocuments);
    host.addEventListener(STUDIO_EXACT_RESUME_UPDATED_EVENT, onResume);
    host.addEventListener("storage", onStorage);
    host.addEventListener("focus", refresh);
    host.addEventListener("pageshow", refresh);
    host.document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      host.removeEventListener(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, onDocuments);
      host.removeEventListener(STUDIO_EXACT_RESUME_UPDATED_EVENT, onResume);
      host.removeEventListener("storage", onStorage);
      host.removeEventListener("focus", refresh);
      host.removeEventListener("pageshow", refresh);
      host.document.removeEventListener("visibilitychange", onVisible);
    };
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_WORKSPACE_RESUME,
    refresh,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) detach = watch();
      refresh(); // Close the gap between rendering and subscription.
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { detach?.(); detach = undefined; }
      };
    },
  };
}
