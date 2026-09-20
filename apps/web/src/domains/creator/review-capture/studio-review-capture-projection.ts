import {
  projectStudioFilterMaskElementsForServerSave,
  projectStudioFilterMaskPagesForServerSave,
} from "../filter/studio-filter-mask-surface-projection";
import { buildStudioSavePayload } from "../studio-save-payload";

import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioSharedDocument } from "../studio-shared-document-client";

/** Use the save pipeline's document projection, including durable mask and linked-3D rules. */
export function projectStudioReviewCaptureSource(
  snapshot: StudioProjectSnapshot,
  saved: StudioSharedDocument,
  width: number,
  isDurableMask: (surfaceId: string) => boolean,
) {
  const payload = buildStudioSavePayload({
    ...snapshot,
    cover: saved.document.cover,
    pageImages: saved.document.pages,
    status: saved.document.status,
    workId: saved.workId,
    document: {
      ...snapshot,
      extensionBase: saved.document.doc,
      width,
      pagesList: projectStudioFilterMaskPagesForServerSave(snapshot.pagesList, isDurableMask),
      master: snapshot.master ? {
        elements: projectStudioFilterMaskElementsForServerSave(snapshot.master.elements, isDurableMask),
      } : undefined,
      // All pages are captured. Changing only the active page is a view operation, and capture
      // itself temporarily changes it. Preserve its saved value in this comparison only.
      currentPageId: typeof saved.document.doc.currentPageId === "string"
        ? saved.document.doc.currentPageId : snapshot.currentPageId,
    },
  });
  if (!payload.doc) throw new Error("Saved Studio document projection is unavailable.");
  return {
    doc: payload.doc,
    title: payload.title,
    description: payload.description,
    tags: payload.tags,
    titleId: payload.titleId ?? null,
    seriesId: payload.seriesId ?? null,
    challengeId: payload.challengeId ?? null,
    pageCount: snapshot.pagesList.length,
  };
}
