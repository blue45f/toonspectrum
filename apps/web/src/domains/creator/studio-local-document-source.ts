import {
  studioDocumentHref,
  type StudioDocumentWorkspaceId,
} from "./studio-document-workspace";
import {
  readStudioProjectDocuments,
  type StudioProjectDocumentEntry,
} from "./studio-project-document-reader";
import {
  readStudioProjectLibrary,
  type StudioProjectLibraryStorage,
} from "./studio-project-library-reader";

import type { StudioWorkspaceRoute } from "./studio-workspace-route";

export interface StudioLocalDocumentSource {
  readonly route: StudioWorkspaceRoute;
  readonly redirectHref: string | null;
}

/**
 * Project/document library entries are local metadata, NOT CreatorWork records. Only positively
 * identified local entries may skip remote hydration. Unknown ids (including local-looking ids),
 * remixes, version requests and unavailable storage retain the existing fail-closed remote path.
 * This resolver never creates, migrates, overwrites or deletes a document or recovery snapshot.
 */
export function resolveStudioLocalDocumentSource(
  route: StudioWorkspaceRoute,
  storage: StudioProjectLibraryStorage | null,
  search = "",
): StudioLocalDocumentSource {
  const unchanged: StudioLocalDocumentSource = { route, redirectHref: null };
  if (!storage || !route.workId || route.remixSourceWorkId || route.presentation !== "editor") {
    return unchanged;
  }
  const params = new URLSearchParams(search);
  if (params.has("version")) return unchanged;

  try {
    const projects = readStudioProjectLibrary(storage).projects;
    if (route.projectId && route.documentId) {
      const project = projects.find((entry) => entry.id === route.projectId);
      if (!project || project.status === "trashed") return unchanged;
      const document = readStudioProjectDocuments(storage, project.id).documents.find(
        (entry) => entry.id === route.documentId && entry.status !== "trashed",
      );
      return document
        ? { route: Object.freeze({ ...route, workId: null }), redirectHref: null }
        : unchanged;
    }

    // Old project tools incorrectly put projectId (or a local documentId) into /studio/work/:id.
    // Resolve a unique registered target before mounting the editor, not after a failed request.
    const candidates: StudioProjectDocumentEntry[] = [];
    for (const project of projects) {
      if (project.status === "trashed") continue;
      if (params.has("project") && params.get("project") !== project.id) continue;
      const documents = readStudioProjectDocuments(storage, project.id).documents;
      if (project.id === route.workId) {
        const document = project.lastOpenedDocumentId
          ? documents.find((entry) => entry.id === project.lastOpenedDocumentId)
          : documents.find((entry) => entry.status === "active");
        if (document && document.status !== "trashed") candidates.push(document);
      } else {
        candidates.push(...documents.filter(
          (entry) => entry.id === route.workId && entry.status !== "trashed",
        ));
      }
    }
    if (candidates.length !== 1) return unchanged;
    const document = candidates[0];
    if (!document) return unchanged;
    const workspace: StudioDocumentWorkspaceId = route.surface === "comic"
      ? "comic"
      : route.surface === "animation" ? "animation"
        : ["dcc", "bg3d", "poser", "character"].includes(route.surface) ? "3d" : "draw";
    return {
      route,
      redirectHref: studioDocumentHref({
        projectId: document.projectId,
        documentId: document.id,
        workspace,
        focus: params.get("focus"),
        language: params.get("language"),
        search,
      }),
    };
  } catch {
    // Storage denied/corrupt metadata is not proof of an empty document.
    return unchanged;
  }
}
