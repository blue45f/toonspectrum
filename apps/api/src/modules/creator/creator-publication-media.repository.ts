import { Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import {
  creatorAssetStorageObjects,
  creatorWorkPublicationMedia,
  creatorWorks,
  db,
} from "../../platform/database";
import {
  PrivateObjectReferenceSchema,
  isLocatedPrivateObjectReference,
  samePrivateObjectContent,
  type PrivateObjectReference,
} from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import type { CreatorWorkMediaTarget } from "../../server/creator-work-media";
import {
  creatorPublicationMediaPageIndex,
  creatorPublicationMediaSlot,
} from "./creator-publication-media.contract";

export class CreatorPublicationMediaForbiddenError extends Error {
  constructor() {
    super("creator_publication_media_forbidden");
    this.name = "CreatorPublicationMediaForbiddenError";
  }
}

export class CreatorPublicationMediaStorageConflictError extends Error {
  constructor() {
    super("creator_publication_media_storage_conflict");
    this.name = "CreatorPublicationMediaStorageConflictError";
  }
}

export interface CreatorPublicationMediaPersistenceInput {
  readonly target: CreatorWorkMediaTarget;
  readonly object: PrivateObjectReference;
  readonly mediaType: string;
  readonly byteLength: number;
}

export interface CreatorPublicationMediaStoredObject {
  readonly workId: string;
  readonly target: CreatorWorkMediaTarget;
  readonly digest: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly object: PrivateObjectReference;
}

export interface CreatorPublicationMediaStorageSummary {
  readonly state: "none" | "legacy-inline" | "mixed" | "externalized";
  readonly storedReferenceCount: number;
  readonly totalReferencedBytes: number;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type StorageObjectRow = typeof creatorAssetStorageObjects.$inferSelect;

function objectFromRow(row: StorageObjectRow): PrivateObjectReference {
  return PrivateObjectReferenceSchema.parse({
    contractVersion: row.contractVersion,
    providerId: row.providerId,
    purpose: row.purpose,
    digest: row.digest,
    objectPath: row.objectPath,
    byteLength: row.byteLength,
    contentType: row.contentType,
  });
}

function exactObject(
  actualValue: PrivateObjectReference,
  expectedValue: PrivateObjectReference,
): boolean {
  const actual = PrivateObjectReferenceSchema.parse(actualValue);
  const expected = PrivateObjectReferenceSchema.parse(expectedValue);
  if (!samePrivateObjectContent(actual, expected)) return false;
  if (!isLocatedPrivateObjectReference(expected)) return true;
  return isLocatedPrivateObjectReference(actual)
    && actual.providerId === expected.providerId;
}

async function assertOwnedWork(
  transaction: Transaction,
  actorUserId: string,
  workId: string,
): Promise<void> {
  const [work] = await transaction
    .select({ ownerId: creatorWorks.userId })
    .from(creatorWorks)
    .where(eq(creatorWorks.id, workId))
    .limit(1)
    .for("update");
  if (!work || work.ownerId !== actorUserId) {
    throw new CreatorPublicationMediaForbiddenError();
  }
}

function hasInlineDataUrl(value: unknown): boolean {
  return typeof value === "string" && value.trimStart().startsWith("data:");
}

@Injectable()
export class CreatorPublicationMediaRepository {
  async persist(
    actorUserId: string,
    workId: string,
    inputs: readonly CreatorPublicationMediaPersistenceInput[],
  ): Promise<void> {
    if (inputs.length === 0) return;
    await db.transaction(async (transaction) => {
      await assertOwnedWork(transaction, actorUserId, workId);
      for (const input of inputs) {
        const object = PrivateObjectReferenceSchema.parse(input.object);
        if (
          !isLocatedPrivateObjectReference(object)
          || object.purpose !== "export"
          || object.contentType !== input.mediaType
          || object.byteLength !== input.byteLength
        ) {
          throw new CreatorPublicationMediaStorageConflictError();
        }
        await transaction
          .insert(creatorAssetStorageObjects)
          .values({
            purpose: object.purpose,
            digest: object.digest,
            contractVersion: object.contractVersion,
            providerId: object.providerId,
            objectPath: object.objectPath,
            byteLength: object.byteLength,
            contentType: object.contentType,
          })
          .onConflictDoNothing();
        const [storedObject] = await transaction
          .select()
          .from(creatorAssetStorageObjects)
          .where(and(
            eq(creatorAssetStorageObjects.purpose, "export"),
            eq(creatorAssetStorageObjects.digest, object.digest),
          ))
          .limit(1)
          .for("update");
        if (
          !storedObject
          || storedObject.state !== "active"
          || storedObject.deleteToken !== null
          || !exactObject(objectFromRow(storedObject), object)
        ) {
          throw new CreatorPublicationMediaStorageConflictError();
        }

        const slot = creatorPublicationMediaSlot(input.target);
        await transaction
          .insert(creatorWorkPublicationMedia)
          .values({
            workId,
            slot,
            pageIndex: creatorPublicationMediaPageIndex(input.target),
            purpose: "export",
            objectDigest: object.digest,
            mediaType: input.mediaType,
            byteLength: input.byteLength,
            createdBy: actorUserId,
          })
          .onConflictDoNothing();
        const [storedReference] = await transaction
          .select({
            mediaType: creatorWorkPublicationMedia.mediaType,
            byteLength: creatorWorkPublicationMedia.byteLength,
          })
          .from(creatorWorkPublicationMedia)
          .where(and(
            eq(creatorWorkPublicationMedia.workId, workId),
            eq(creatorWorkPublicationMedia.slot, slot),
            eq(creatorWorkPublicationMedia.objectDigest, object.digest),
          ))
          .limit(1);
        if (
          !storedReference
          || storedReference.mediaType !== input.mediaType
          || storedReference.byteLength !== input.byteLength
        ) {
          throw new CreatorPublicationMediaStorageConflictError();
        }
      }
    });
  }

  async find(
    workId: string,
    target: CreatorWorkMediaTarget,
    digest: string,
  ): Promise<CreatorPublicationMediaStoredObject | null> {
    const objectDigest = `sha256:${digest}`;
    const [row] = await db
      .select({
        mediaType: creatorWorkPublicationMedia.mediaType,
        byteLength: creatorWorkPublicationMedia.byteLength,
        contractVersion: creatorAssetStorageObjects.contractVersion,
        providerId: creatorAssetStorageObjects.providerId,
        purpose: creatorAssetStorageObjects.purpose,
        digest: creatorAssetStorageObjects.digest,
        objectPath: creatorAssetStorageObjects.objectPath,
        objectByteLength: creatorAssetStorageObjects.byteLength,
        contentType: creatorAssetStorageObjects.contentType,
      })
      .from(creatorWorkPublicationMedia)
      .innerJoin(
        creatorAssetStorageObjects,
        and(
          eq(creatorAssetStorageObjects.purpose, creatorWorkPublicationMedia.purpose),
          eq(creatorAssetStorageObjects.digest, creatorWorkPublicationMedia.objectDigest),
        ),
      )
      .where(and(
        eq(creatorWorkPublicationMedia.workId, workId),
        eq(creatorWorkPublicationMedia.slot, creatorPublicationMediaSlot(target)),
        eq(creatorWorkPublicationMedia.objectDigest, objectDigest),
        eq(creatorAssetStorageObjects.state, "active"),
      ))
      .limit(1);
    if (!row) return null;
    const object = PrivateObjectReferenceSchema.parse({
      contractVersion: row.contractVersion,
      providerId: row.providerId,
      purpose: row.purpose,
      digest: row.digest,
      objectPath: row.objectPath,
      byteLength: row.objectByteLength,
      contentType: row.contentType,
    });
    if (
      object.purpose !== "export"
      || object.digest !== objectDigest
      || object.contentType !== row.mediaType
      || object.byteLength !== row.byteLength
    ) {
      throw new CreatorPublicationMediaStorageConflictError();
    }
    return {
      workId,
      target,
      digest,
      mediaType: row.mediaType,
      byteLength: row.byteLength,
      object,
    };
  }

  async summary(
    actorUserId: string,
    workId: string,
  ): Promise<CreatorPublicationMediaStorageSummary> {
    const [work] = await db
      .select({
        ownerId: creatorWorks.userId,
        cover: creatorWorks.cover,
        pages: creatorWorks.pages,
      })
      .from(creatorWorks)
      .where(eq(creatorWorks.id, workId))
      .limit(1);
    if (!work || work.ownerId !== actorUserId) {
      throw new CreatorPublicationMediaForbiddenError();
    }
    const [aggregate] = await db
      .select({
        count: sql<number>`count(*)::integer`,
        totalBytes: sql<number>`coalesce(sum(${creatorWorkPublicationMedia.byteLength}), 0)::bigint`,
      })
      .from(creatorWorkPublicationMedia)
      .where(eq(creatorWorkPublicationMedia.workId, workId));
    const storedReferenceCount = Number(aggregate?.count ?? 0);
    const totalReferencedBytes = Number(aggregate?.totalBytes ?? 0);
    const hasInline = hasInlineDataUrl(work.cover)
      || (Array.isArray(work.pages) && work.pages.some(hasInlineDataUrl));
    const state = storedReferenceCount === 0
      ? hasInline ? "legacy-inline" : "none"
      : hasInline ? "mixed" : "externalized";
    return { state, storedReferenceCount, totalReferencedBytes };
  }
}
