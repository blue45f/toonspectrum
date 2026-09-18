import { readStudioProjectDocuments } from "./studio-project-document-store";
import { studioDocumentWorkspaceById } from "./studio-document-workspace";
import {
  readStudioExactResumeContext,
  studioExactResumeHref,
  studioExactResumeSummary,
  type StudioExactResumeStorage,
} from "./studio-exact-resume-context";

import type { StudioProjectLibraryEntry } from "./studio-project-library-store";

export interface StudioProjectResumeTarget {
  readonly href: string;
  readonly documentId: string | null;
  readonly summary: string | null;
  readonly exact: boolean;
}

export function resolveStudioProjectResumeTarget(
  storage: StudioExactResumeStorage,
  project: StudioProjectLibraryEntry,
  locale: "ko" | "en",
): StudioProjectResumeTarget {
  const fallback = {
    href: `/studio/p/${encodeURIComponent(project.id)}/overview`,
    documentId: project.lastOpenedDocumentId,
    summary: null,
    exact: false,
  } satisfies StudioProjectResumeTarget;
  try {
    const documents = readStudioProjectDocuments(storage, project.id).documents;
    const document = documents.find((candidate) =>
      candidate.id === project.lastOpenedDocumentId && candidate.status === "active")
      ?? documents.find((candidate) => candidate.status === "active")
      ?? null;
    if (!document) return fallback;
    const context = readStudioExactResumeContext(storage, project.id, document.id);
    const workspace = context?.workspace ?? document.defaultWorkspace;
    const workspaceDefinition = studioDocumentWorkspaceById(workspace);
    return {
      href: studioExactResumeHref({
        projectId: project.id,
        documentId: document.id,
        workspace,
        context,
      }),
      documentId: document.id,
      summary: context
        ? studioExactResumeSummary(context, locale)
        : `${document.title} · ${locale === "ko" ? workspaceDefinition.labelKo : workspaceDefinition.labelEn}`,
      exact: Boolean(context),
    };
  } catch {
    return fallback;
  }
}
