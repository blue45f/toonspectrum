import {
  markCreatorPublicationPublished,
  normalizeCreatorPublicationDirective,
  readCreatorPublicationDirective,
  resolveCreatorPublicationStatus,
  validateCreatorPublicationDirective,
  writeCreatorPublicationDirective,
  type CreatorPublicationDirective,
} from "../../../../web/src/shared/lib/creator-publication-contract";

import {
  CreatorCollaborationRepository,
  type CreatorSharedDocument,
  type CreatorSharedDocumentPatch,
  type CreatorSharedDocumentSaveResponse,
} from "./creator-collaboration.repository";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cloneDocument(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function publicationFromPatch(
  patch: CreatorSharedDocumentPatch,
): CreatorPublicationDirective | null | undefined {
  if (!patch.doc || !hasOwn(patch.doc, "publication")) return undefined;
  return normalizeCreatorPublicationDirective(patch.doc.publication);
}

export interface PrepareCreatorPublicationSharedDocumentPatchInput {
  shared: Pick<CreatorSharedDocument, "role" | "document">;
  patch: CreatorSharedDocumentPatch;
  now?: Date;
}

/**
 * Shared-document saves intentionally accept the whole Studio JSON tree. This boundary protects
 * owner-only publication policy inside that tree instead of trusting a specific web client:
 *
 * - collaborators can save content but the server restores the current publication directive;
 * - collaborators cannot introduce publication metadata into a legacy document;
 * - owners get the same normalized status transition as the ordinary creator API;
 * - invalid owner publication attempts fail closed to draft rather than exposing the work.
 *
 * The following repository transaction still rechecks role, CRDT sequence, and base revision. A
 * concurrent document update after this read therefore becomes a normal revision conflict.
 */
export function prepareCreatorPublicationSharedDocumentPatch({
  shared,
  patch,
  now = new Date(),
}: PrepareCreatorPublicationSharedDocumentPatchInput): CreatorSharedDocumentPatch {
  const next: CreatorSharedDocumentPatch = { ...patch };
  const currentDirective = readCreatorPublicationDirective(shared.document.doc);
  const patchedDirective = publicationFromPatch(patch);

  if (shared.role !== "owner") {
    if (!patch.doc) return next;
    const protectedDoc = cloneDocument(patch.doc);
    if (currentDirective) {
      next.doc = writeCreatorPublicationDirective(protectedDoc, currentDirective);
    } else {
      delete protectedDoc.publication;
      next.doc = protectedDoc;
    }
    return next;
  }

  const statusProvided = hasOwn(patch, "status");
  const publicationProvided = patchedDirective !== undefined;
  if (!statusProvided && !publicationProvided) return next;

  const directive = patchedDirective ?? currentDirective;
  if (!directive) return next;

  const requestedStatus = patch.status ?? shared.document.status;
  const publicationValidation =
    requestedStatus === "published"
      ? validateCreatorPublicationDirective(directive, {
          now,
          challengeLinked: shared.document.challengeId !== null,
        })
      : null;
  const effectiveStatus =
    publicationValidation && !publicationValidation.valid
      ? "draft"
      : resolveCreatorPublicationStatus(requestedStatus, directive, now);
  const effectiveDirective =
    effectiveStatus === "published" && directive.publishedAt === null
      ? markCreatorPublicationPublished(directive, now)
      : directive;
  const documentSource = patch.doc ?? shared.document.doc;

  next.doc = writeCreatorPublicationDirective(
    cloneDocument(documentSource),
    effectiveDirective,
  );
  next.status = effectiveStatus;
  return next;
}

export class CreatorPublicationCollaborationRepository extends CreatorCollaborationRepository {
  override async saveSharedDocument(
    actorUserId: string,
    workId: string,
    baseRevision: number,
    crdtServerSequence: bigint,
    patch: CreatorSharedDocumentPatch,
  ): Promise<CreatorSharedDocumentSaveResponse> {
    const shared = await super.getSharedDocument(actorUserId, workId);
    const protectedPatch = prepareCreatorPublicationSharedDocumentPatch({
      shared,
      patch,
    });
    return super.saveSharedDocument(
      actorUserId,
      workId,
      baseRevision,
      crdtServerSequence,
      protectedPatch,
    );
  }
}

export const creatorPublicationCollaborationRepositoryProvider = {
  provide: CreatorCollaborationRepository,
  useFactory: () => new CreatorPublicationCollaborationRepository(),
};
