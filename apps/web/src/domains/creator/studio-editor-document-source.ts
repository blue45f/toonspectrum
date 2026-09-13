import { readStudioProjectDocuments } from "./studio-project-document-reader";

import type { StudioProjectDocumentStorage } from "./studio-project-document-reader";
import type { StudioWorkspaceRoute } from "./studio-workspace-route";

/**
 * A project-library document is local metadata, not a creator API work. Only a
 * matching, active local record may opt out of remote hydration. Unknown links,
 * legacy work links and unavailable storage keep the existing fail-closed path.
 * Never infer locality from an id prefix or from a failed server request.
 */
export function resolveStudioEditorDocumentRoute(
  route: StudioWorkspaceRoute,
  storage?: StudioProjectDocumentStorage | null,
): StudioWorkspaceRoute {
  if (
    !route.projectId
    || !route.documentId
    || !route.documentWorkspace
    || route.presentation !== "editor"
    || route.remixSourceWorkId !== null
    || route.workId === null
  ) {
    return route;
  }
  try {
    const localStorage = storage === undefined
      ? typeof window === "undefined" ? null : window.localStorage
      : storage;
    if (!localStorage) return route;
    const document = readStudioProjectDocuments(localStorage, route.projectId).documents.find(
      (entry) => entry.id === route.documentId && entry.projectId === route.projectId,
    );
    if (!document || document.status !== "active") return route;
    return Object.freeze({ ...route, workId: null });
  } catch {
    // Storage denial or corruption must not turn an unverified work into a blank draft.
    return route;
  }
}

/**
 * Keep existing recovery keys while separating the server source from local
 * document identity. A project document used its document id as workId before
 * this fix; switching it to the generic draft key would strand its autosaves.
 * Project-qualified key migration needs an explicit, collision-aware migration.
 */
export function studioEditorPersistenceWorkId(
  workId: string | null,
  projectId: string | null | undefined,
  documentId: string | null | undefined,
  draftId?: string | null,
): string | null {
  // Explicit drafts must not share the legacy "new" recovery slot. Keep every existing
  // server/project key and the unnamed draft key intact; never delete or migrate them implicitly.
  return workId ?? (projectId && documentId ? documentId : draftId ? `draft:${draftId}` : null);
}
