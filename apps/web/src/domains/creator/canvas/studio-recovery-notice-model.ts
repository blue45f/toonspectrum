import { studioDocumentHref } from "../studio-document-workspace";

/** A new identity, without the old work, project or collaboration room parameters. */
export function createStudioRecoveryNewDrawingHref(): string {
  return studioDocumentHref({ draftId: crypto.randomUUID(), workspace: "draw" });
}
